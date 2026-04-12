use keyring::Entry;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::time::sleep;

const SERVICE_NAME: &str = "discogs-finder";
const BASE_URL: &str = "https://api.discogs.com";
const SEARCH_URL: &str = "https://api.discogs.com/database/search";
const DISCOGS_MAX_PAGES: i64 = 200;
const PER_PAGE: i64 = 50;
const MAX_ITEMS: i64 = 10_000;

#[derive(Default)]
struct SearchRegistry {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Debug, Clone, Deserialize)]
struct SearchFilters {
    year_start: i64,
    year_end: i64,
    have_min: i64,
    have_max: i64,
    want_min: i64,
    want_max: i64,
    max_versions: i64,
    countries_selected: Vec<String>,
    formats_selected: Vec<String>,
    type_selected: String,
    genres: Vec<String>,
    styles: Vec<String>,
    strict_genre: bool,
    strict_style: bool,
    sin_anyo: bool,
    solo_en_venta: bool,
    precio_minimo: f64,
    precio_maximo: f64,
    max_copias_venta: i64,
    tope_resultados: i64,
    youtube_status: String,
    not_on_label_only: bool,
    exclude_various: bool,
}

#[derive(Debug, Clone, Serialize)]
struct SearchCard {
    title: String,
    artist: String,
    year: Option<i64>,
    have: Option<i64>,
    want: Option<i64>,
    genres: Vec<String>,
    styles: Vec<String>,
    formats: Vec<String>,
    country: String,
    has_youtube: bool,
    num_for_sale: i64,
    lowest_price: Option<f64>,
    uri: String,
    thumb: String,
}

#[derive(Debug, Serialize, Clone)]
struct SearchEventEnvelope {
    search_id: String,
    event: String,
    payload: Value,
}

fn discogs_entry(user_id: &str) -> Result<Entry, String> {
    let account_name = format!("discogs-token:{user_id}");
    Entry::new(SERVICE_NAME, &account_name).map_err(|error| error.to_string())
}

fn get_discogs_token(user_id: &str) -> Result<String, String> {
    let entry = discogs_entry(user_id)?;

    match entry.get_password() {
        Ok(token) if !token.trim().is_empty() => Ok(token),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(
            "No hay token local de Discogs. Ve a Settings y guarda un personal access token."
                .to_string(),
        ),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn load_discogs_token(user_id: String) -> Result<String, String> {
    let entry = discogs_entry(&user_id)?;

    match entry.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_discogs_token(user_id: String, token: String) -> Result<(), String> {
    let entry = discogs_entry(&user_id)?;

    if token.trim().is_empty() {
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry
            .set_password(token.trim())
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn delete_discogs_token(user_id: String) -> Result<(), String> {
    let entry = discogs_entry(&user_id)?;

    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn cancel_discogs_search(search_id: String, registry: State<SearchRegistry>) -> Result<(), String> {
    let active = registry.active.lock().map_err(|_| "No se pudo cancelar la busqueda".to_string())?;
    if let Some(flag) = active.get(&search_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
fn start_discogs_search(
    app: AppHandle,
    filters: SearchFilters,
    user_id: String,
    registry: State<SearchRegistry>,
) -> Result<String, String> {
    let token = get_discogs_token(&user_id)?;
    let search_id = format!(
        "search-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
    );

    let cancel_flag = Arc::new(AtomicBool::new(false));
    registry
        .active
        .lock()
        .map_err(|_| "No se pudo preparar la busqueda".to_string())?
        .insert(search_id.clone(), cancel_flag.clone());

    let app_handle = app.clone();
    let task_search_id = search_id.clone();

    tauri::async_runtime::spawn(async move {
        let client = Client::builder()
            .user_agent("103FinderDesktop/0.1")
            .build();

        let result = match client {
            Ok(client) => run_discogs_search(
                app_handle.clone(),
                client,
                token,
                task_search_id.clone(),
                filters,
                cancel_flag,
            )
            .await,
            Err(error) => Err(error.to_string()),
        };

        if let Err(error) = result {
            emit_search_event(
                &app_handle,
                &task_search_id,
                "done",
                json!({ "reason": "error", "message": error }),
            );
        }

        if let Ok(mut active) = app_handle.state::<SearchRegistry>().active.lock() {
            active.remove(&task_search_id);
        }
    });

    Ok(search_id)
}

async fn run_discogs_search(
    app: AppHandle,
    client: Client,
    token: String,
    search_id: String,
    filters: SearchFilters,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    let mut params = build_search_params(&filters);
    let first = discogs_get(&client, SEARCH_URL, &token, Some(&params)).await?;
    let total_pages = first
        .get("pagination")
        .and_then(|value| value.get("pages"))
        .and_then(value_as_i64)
        .unwrap_or(1)
        .min(DISCOGS_MAX_PAGES)
        .min((MAX_ITEMS + PER_PAGE - 1) / PER_PAGE);

    let mut found = 0_i64;
    let mut processed = 0_i64;

    emit_search_event(
        &app,
        &search_id,
        "status",
        json!({ "page": 1, "total_pages": total_pages, "found": 0, "processed": 0 }),
    );

    for page in 1..=total_pages {
        if cancel_flag.load(Ordering::Relaxed) {
            emit_search_event(
                &app,
                &search_id,
                "done",
                json!({ "found": found, "processed": processed, "reason": "cancelled" }),
            );
            return Ok(());
        }

        upsert_query_param(&mut params, "page", page.to_string());
        let data = if page == 1 {
            first.clone()
        } else {
            discogs_get(&client, SEARCH_URL, &token, Some(&params)).await?
        };
        let items = data
            .get("results")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();

        for item in items {
            if cancel_flag.load(Ordering::Relaxed) {
                emit_search_event(
                    &app,
                    &search_id,
                    "done",
                    json!({ "found": found, "processed": processed, "reason": "cancelled" }),
                );
                return Ok(());
            }

            processed += 1;
            if processed >= MAX_ITEMS {
                emit_search_event(
                    &app,
                    &search_id,
                    "done",
                    json!({ "found": found, "processed": processed, "reason": "max_items" }),
                );
                return Ok(());
            }

            let Some(resource_url) = item.get("resource_url").and_then(|value| value.as_str()) else {
                continue;
            };

            let mut details = match discogs_get(&client, resource_url, &token, None).await {
                Ok(value) => value,
                Err(_) => continue,
            };

            let needs_main_release = details.get("community").is_none()
                || (details.get("styles").is_none() && details.get("genres").is_none());
            if needs_main_release {
                if let Some(main_release) = details.get("main_release").and_then(value_as_i64) {
                    let main_release_url = format!("{BASE_URL}/releases/{main_release}");
                    if let Ok(main_release_details) = discogs_get(&client, &main_release_url, &token, None).await {
                        details = main_release_details;
                    }
                }
            }

            if !passes_details(&details, &filters) {
                continue;
            }

            if filters.max_versions > 0 {
                if let Some(master_id) = details.get("master_id").and_then(value_as_i64) {
                    let versions_url = format!("{BASE_URL}/masters/{master_id}/versions");
                    let versions = discogs_get(
                        &client,
                        &versions_url,
                        &token,
                        Some(&vec![("per_page".to_string(), "1".to_string()), ("page".to_string(), "1".to_string())]),
                    )
                    .await;

                    if let Ok(versions_data) = versions {
                        let count = versions_data
                            .get("pagination")
                            .and_then(|value| value.get("items"))
                            .and_then(value_as_i64)
                            .unwrap_or(0);
                        if count > filters.max_versions {
                            continue;
                        }
                    }
                }
            }

            let card = build_card(&item, &details);
            found += 1;
            emit_search_event(
                &app,
                &search_id,
                "item",
                json!({ "idx": found, "card": card }),
            );

            if filters.tope_resultados > 0 && found >= filters.tope_resultados {
                emit_search_event(
                    &app,
                    &search_id,
                    "done",
                    json!({ "found": found, "processed": processed, "reason": "tope_resultados" }),
                );
                return Ok(());
            }
        }

        emit_search_event(
            &app,
            &search_id,
            "status",
            json!({ "page": page, "total_pages": total_pages, "found": found, "processed": processed }),
        );
    }

    emit_search_event(
        &app,
        &search_id,
        "done",
        json!({ "found": found, "processed": processed, "reason": "end_pages" }),
    );

    Ok(())
}

async fn discogs_get(
    client: &Client,
    url: &str,
    token: &str,
    params: Option<&Vec<(String, String)>>,
) -> Result<Value, String> {
    let mut backoff_seconds = 1_u64;

    for _ in 0..6 {
        let mut request = client
            .get(url)
            .header("Authorization", format!("Discogs token={token}"));

        if let Some(query) = params {
            request = request.query(query);
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => {
                sleep(Duration::from_secs(backoff_seconds)).await;
                backoff_seconds = (backoff_seconds * 2).min(20);
                if error.is_timeout() {
                    continue;
                }
                return Err(error.to_string());
            }
        };

        let status = response.status();

        if status == StatusCode::UNAUTHORIZED {
            return Err("Token de Discogs invalido o no autorizado (401).".to_string());
        }

        if matches!(
            status,
            StatusCode::TOO_MANY_REQUESTS
                | StatusCode::INTERNAL_SERVER_ERROR
                | StatusCode::BAD_GATEWAY
                | StatusCode::SERVICE_UNAVAILABLE
                | StatusCode::GATEWAY_TIMEOUT
        ) {
            sleep(Duration::from_secs(backoff_seconds)).await;
            backoff_seconds = (backoff_seconds * 2).min(20);
            continue;
        }

        let remaining = response
            .headers()
            .get("X-Discogs-Ratelimit-Remaining")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(60);

        let response = response.error_for_status().map_err(|error| error.to_string())?;
        let value = response.json::<Value>().await.map_err(|error| error.to_string())?;

        if remaining <= 1 {
            sleep(Duration::from_millis(1200)).await;
        }

        return Ok(value);
    }

    Err("Discogs no respondio correctamente tras varios reintentos.".to_string())
}

fn build_search_params(filters: &SearchFilters) -> Vec<(String, String)> {
    let mut params = vec![
        ("per_page".to_string(), PER_PAGE.to_string()),
        ("page".to_string(), "1".to_string()),
        ("sort".to_string(), "title".to_string()),
        ("sort_order".to_string(), "asc".to_string()),
    ];

    if !filters.sin_anyo {
        let year = if filters.year_start == filters.year_end {
            filters.year_start.to_string()
        } else {
            format!("{}-{}", filters.year_start, filters.year_end)
        };
        params.push(("year".to_string(), year));
    }

    if filters.type_selected != "Todos" {
        params.push(("type".to_string(), filters.type_selected.clone()));
    }

    if filters.countries_selected.len() == 1 {
        params.push((
            "country".to_string(),
            filters.countries_selected[0].clone(),
        ));
    }

    let base_formats = ["vinyl", "cd", "cassette", "file", "cdr", "dvd", "box set", "all media"];
    let base_formats_set: HashSet<String> = base_formats.iter().map(|value| value.to_string()).collect();
    let selected_formats = filters
        .formats_selected
        .iter()
        .filter(|value| base_formats_set.contains(&value.trim().to_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    if !selected_formats.is_empty() && filters.type_selected != "master" {
        for format in selected_formats {
            params.push(("format".to_string(), format));
        }
    }

    for genre in &filters.genres {
        if !genre.trim().is_empty() {
            params.push(("genre".to_string(), genre.clone()));
        }
    }

    for style in &filters.styles {
        if !style.trim().is_empty() {
            params.push(("style".to_string(), style.clone()));
        }
    }

    if filters.not_on_label_only {
        params.push(("label".to_string(), "Not On Label".to_string()));
    }

    params
}

fn upsert_query_param(params: &mut Vec<(String, String)>, key: &str, value: String) {
    if let Some((_, current)) = params.iter_mut().find(|(existing_key, _)| existing_key == key) {
        *current = value;
    } else {
        params.push((key.to_string(), value));
    }
}

fn passes_details(details: &Value, filters: &SearchFilters) -> bool {
    if filters.not_on_label_only && !is_not_on_label_release(details) {
        return false;
    }

    if filters.exclude_various && is_various_release(details) {
        return false;
    }

    let have = extract_have(details);
    if have < filters.have_min {
        return false;
    }
    if filters.have_max > 0 && have > filters.have_max {
        return false;
    }

    let want = extract_want(details);
    if want < filters.want_min {
        return false;
    }
    if filters.want_max > 0 && want > filters.want_max {
        return false;
    }

    let year = details.get("year").and_then(value_as_i64);
    if filters.sin_anyo {
        if year.is_some_and(|value| value != 0) {
            return false;
        }
    } else {
        let Some(year_value) = year else {
            return false;
        };
        if year_value == 0 || year_value < filters.year_start || year_value > filters.year_end {
            return false;
        }
    }

    let release_genres = string_array(details.get("genres"));
    let release_styles = string_array(details.get("styles"));
    let release_genres_set = normalize_set(&release_genres);
    let release_styles_set = normalize_set(&release_styles);
    let requested_genres = normalize_set(&filters.genres);
    let requested_styles = normalize_set(&filters.styles);

    if !requested_genres.is_empty() && !requested_genres.is_subset(&release_genres_set) {
        return false;
    }
    if !requested_styles.is_empty() && !requested_styles.is_subset(&release_styles_set) {
        return false;
    }
    if filters.strict_genre && !requested_genres.is_empty() && release_genres_set != requested_genres {
        return false;
    }
    if filters.strict_style && !requested_styles.is_empty() && release_styles_set != requested_styles {
        return false;
    }

    if !filters.formats_selected.is_empty() {
        let requested_formats = normalize_set(&filters.formats_selected);
        let release_formats = extract_formats(details);
        if requested_formats.is_disjoint(&release_formats) {
            return false;
        }
    }

    if !filters.countries_selected.is_empty() {
        let requested_countries = normalize_set(&filters.countries_selected);
        let release_country = details
            .get("country")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        if !requested_countries.contains(&release_country) {
            return false;
        }
    }

    let has_youtube = details
        .get("videos")
        .and_then(|value| value.as_array())
        .map(|videos| !videos.is_empty())
        .unwrap_or(false);
    if filters.youtube_status == "Si" && !has_youtube {
        return false;
    }
    if filters.youtube_status == "No" && has_youtube {
        return false;
    }

    let num_for_sale = details
        .get("num_for_sale")
        .and_then(value_as_i64)
        .unwrap_or(0);
    if filters.solo_en_venta && num_for_sale <= 0 {
        return false;
    }
    if filters.max_copias_venta > 0 && num_for_sale > filters.max_copias_venta {
        return false;
    }

    if filters.precio_minimo > 0.0 || filters.precio_maximo > 0.0 {
        let Some(lowest_price) = details.get("lowest_price").and_then(value_as_f64) else {
            return false;
        };

        if filters.precio_minimo > 0.0 && lowest_price < filters.precio_minimo {
            return false;
        }

        if filters.precio_maximo > 0.0 && lowest_price > filters.precio_maximo {
            return false;
        }
    }

    true
}

fn is_not_on_label_release(details: &Value) -> bool {
    details
        .get("labels")
        .and_then(|value| value.as_array())
        .map(|labels| {
            labels.iter().any(|label| {
                label
                    .get("name")
                    .and_then(|value| value.as_str())
                    .map(|name| name.trim().to_lowercase().starts_with("not on label"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn is_various_release(details: &Value) -> bool {
    let artist_candidates = [
        string_value(details.get("artists_sort")),
        string_value(details.get("artist")),
        details
            .get("artists")
            .and_then(|value| value.as_array())
            .and_then(|artists| artists.first())
            .and_then(|artist| artist.get("name"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
    ];

    artist_candidates
        .into_iter()
        .flatten()
        .any(|value| value.trim().eq_ignore_ascii_case("Various"))
}

fn build_card(item: &Value, details: &Value) -> SearchCard {
    SearchCard {
        title: string_value(details.get("title")).unwrap_or_else(|| string_value(item.get("title")).unwrap_or_default()),
        artist: string_value(details.get("artists_sort"))
            .unwrap_or_else(|| string_value(item.get("artist")).unwrap_or_default()),
        year: details.get("year").and_then(value_as_i64),
        have: Some(extract_have(details)),
        want: Some(extract_want(details)),
        genres: string_array(details.get("genres")),
        styles: string_array(details.get("styles")),
        formats: {
            let mut formats = extract_formats(details).into_iter().collect::<Vec<_>>();
            formats.sort();
            formats
        },
        country: string_value(details.get("country")).unwrap_or_default(),
        has_youtube: details
            .get("videos")
            .and_then(|value| value.as_array())
            .map(|videos| !videos.is_empty())
            .unwrap_or(false),
        num_for_sale: details
            .get("num_for_sale")
            .and_then(value_as_i64)
            .or_else(|| item.get("num_for_sale").and_then(value_as_i64))
            .unwrap_or(0),
        lowest_price: details
            .get("lowest_price")
            .and_then(value_as_f64)
            .or_else(|| item.get("lowest_price").and_then(value_as_f64)),
        uri: string_value(details.get("uri")).unwrap_or_else(|| string_value(item.get("uri")).unwrap_or_default()),
        thumb: string_value(item.get("thumb")).unwrap_or_default(),
    }
}

fn extract_have(details: &Value) -> i64 {
    details
        .get("community")
        .and_then(|value| value.get("have"))
        .and_then(value_as_i64)
        .unwrap_or(0)
}

fn extract_want(details: &Value) -> i64 {
    details
        .get("community")
        .and_then(|value| value.get("want"))
        .and_then(value_as_i64)
        .unwrap_or(0)
}

fn extract_formats(details: &Value) -> HashSet<String> {
    let mut formats = HashSet::new();
    if let Some(values) = details.get("formats").and_then(|value| value.as_array()) {
        for format in values {
            if let Some(name) = format.get("name").and_then(|value| value.as_str()) {
                let normalized = name.trim().to_lowercase();
                if !normalized.is_empty() {
                    formats.insert(normalized);
                }
            }
            if let Some(descriptions) = format.get("descriptions").and_then(|value| value.as_array()) {
                for description in descriptions {
                    if let Some(value) = description.as_str() {
                        let normalized = value.trim().to_lowercase();
                        if !normalized.is_empty() {
                            formats.insert(normalized);
                        }
                    }
                }
            }
            if let Some(text) = format.get("text").and_then(|value| value.as_str()) {
                let normalized = text.trim().to_lowercase();
                if !normalized.is_empty() {
                    formats.insert(normalized);
                }
            }
        }
    }
    formats
}

fn normalize_set(values: &[String]) -> HashSet<String> {
    values
        .iter()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect()
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(|inner| inner.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(|inner| inner.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn string_value(value: Option<&Value>) -> Option<String> {
    value.and_then(|inner| inner.as_str()).map(|inner| inner.to_string())
}

fn value_as_i64(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_u64().map(|inner| inner as i64)).or_else(|| {
        value
            .as_str()
            .and_then(|inner| inner.parse::<i64>().ok())
    })
}

fn value_as_f64(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_i64().map(|inner| inner as f64)).or_else(|| {
        value
            .as_str()
            .and_then(|inner| inner.parse::<f64>().ok())
    })
}

fn emit_search_event(app: &AppHandle, search_id: &str, event: &str, payload: Value) {
    let _ = app.emit(
        "discogs-search",
        SearchEventEnvelope {
            search_id: search_id.to_string(),
            event: event.to_string(),
            payload,
        },
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SearchRegistry::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("103 FINDER");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_discogs_token,
            save_discogs_token,
            delete_discogs_token,
            start_discogs_search,
            cancel_discogs_search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
