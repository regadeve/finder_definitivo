use keyring::Entry;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering as AtomicOrdering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;
use tokio::time::sleep;
use tokio_postgres::NoTls;

const SERVICE_NAME: &str = "discogs-finder";
const BASE_URL: &str = "https://api.discogs.com";
const SEARCH_URL: &str = "https://api.discogs.com/database/search";
const DISCOGS_MAX_PAGES: i64 = 200;
const PER_PAGE: i64 = 50;
const MAX_ITEMS: i64 = 10_000;
const CATALOG_BATCH_SIZE: i64 = 250;
const DEFAULT_UPDATER_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFCMjEzNDZDRkE3MzRGRTgKUldUb1QzUDZiRFFoRzlVRGZqQXBENFIyOG95K2dXR053WUV3cWxiQkhHdmJ0TVlzeWFSaHZkS0kK";
const DEFAULT_UPDATER_ENDPOINT: &str = "https://103finder.shop/updates/latest.json";
const UPDATER_PUBLIC_KEY: Option<&str> = option_env!("TAURI_UPDATER_PUBKEY");
const UPDATER_ENDPOINTS: Option<&str> = option_env!("TAURI_UPDATER_ENDPOINTS");

#[derive(Default)]
struct SearchRegistry {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateState {
    configured: bool,
    available: bool,
    required: bool,
    current_version: String,
    version: Option<String>,
    minimum_version: Option<String>,
    notes: Option<String>,
    pub_date: Option<String>,
    download_url: Option<String>,
    target: Option<String>,
    manifest_url: Option<String>,
    diagnostic: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct UpdaterManifest {
    version: Option<String>,
    notes: Option<String>,
    pub_date: Option<String>,
    required: Option<bool>,
    minimum_version: Option<String>,
    download_path: Option<String>,
    platforms: Option<HashMap<String, UpdaterManifestPlatform>>,
}

#[derive(Debug, Clone, Deserialize)]
struct UpdaterManifestPlatform {
    url: Option<String>,
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

fn catalog_dsn_entry() -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, "catalog-dsn").map_err(|error| error.to_string())
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

fn get_catalog_dsn() -> Result<String, String> {
    let entry = catalog_dsn_entry()?;

    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(value.trim().to_string()),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(
            "No hay DSN local del catalogo. Ve a Settings y configura la conexion a discogs_catalog."
                .to_string(),
        ),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn load_catalog_dsn() -> Result<String, String> {
    let entry = catalog_dsn_entry()?;

    match entry.get_password() {
        Ok(value) => Ok(value),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_catalog_dsn(dsn: String) -> Result<(), String> {
    let entry = catalog_dsn_entry()?;

    if dsn.trim().is_empty() {
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry
            .set_password(dsn.trim())
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn delete_catalog_dsn() -> Result<(), String> {
    let entry = catalog_dsn_entry()?;

    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn updater_env() -> Option<(String, Vec<Url>)> {
    let runtime_pubkey = std::env::var("TAURI_UPDATER_PUBKEY").ok();
    let runtime_endpoints = std::env::var("TAURI_UPDATER_ENDPOINTS").ok();

    let pubkey = runtime_pubkey
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            UPDATER_PUBLIC_KEY
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .unwrap_or(DEFAULT_UPDATER_PUBKEY)
        .to_string();

    let endpoints = runtime_endpoints
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(UPDATER_ENDPOINTS)
        .unwrap_or(DEFAULT_UPDATER_ENDPOINT)
        .split([',', ';', '\n'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(Url::parse)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;

    Some((pubkey, endpoints))
}

fn updater_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())
}

async fn fetch_updater_manifest(
    client: &Client,
    endpoints: &[Url],
) -> Result<(Url, UpdaterManifest), String> {
    let mut last_error = String::from("No se pudo leer latest.json del updater.");

    for endpoint in endpoints {
        let response = match client
            .get(endpoint.clone())
            .header("Cache-Control", "no-store")
            .header("Pragma", "no-cache")
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = format!("No se pudo consultar {}: {}", endpoint, error);
                continue;
            }
        };

        let response = match response.error_for_status() {
            Ok(response) => response,
            Err(error) => {
                last_error = format!("latest.json respondio con error en {}: {}", endpoint, error);
                continue;
            }
        };

        match response.json::<UpdaterManifest>().await {
            Ok(manifest) => return Ok((endpoint.clone(), manifest)),
            Err(error) => {
                last_error = format!("latest.json no se pudo parsear en {}: {}", endpoint, error);
            }
        }
    }

    Err(last_error)
}

fn trim_option(value: Option<String>) -> Option<String> {
    value.and_then(|inner| {
        let trimmed = inner.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn compare_versions(left: &str, right: &str) -> Ordering {
    let left_parts = left
        .split('.')
        .map(|value| value.parse::<i64>().unwrap_or(0))
        .collect::<Vec<_>>();
    let right_parts = right
        .split('.')
        .map(|value| value.parse::<i64>().unwrap_or(0))
        .collect::<Vec<_>>();
    let max_len = left_parts.len().max(right_parts.len());

    for index in 0..max_len {
        let left_value = *left_parts.get(index).unwrap_or(&0);
        let right_value = *right_parts.get(index).unwrap_or(&0);
        match left_value.cmp(&right_value) {
            Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    Ordering::Equal
}

fn is_version_newer(candidate: Option<&str>, current: &str) -> bool {
    candidate
        .map(|value| compare_versions(value, current) == Ordering::Greater)
        .unwrap_or(false)
}

fn is_below_minimum(current: &str, minimum_version: Option<&str>) -> bool {
    minimum_version
        .map(|value| compare_versions(current, value) == Ordering::Less)
        .unwrap_or(false)
}

fn pick_manifest_download_url(manifest_url: &Url, manifest: &UpdaterManifest) -> Option<String> {
    let candidate = manifest
        .platforms
        .as_ref()
        .and_then(|platforms| platforms.get("windows-x86_64"))
        .and_then(|platform| platform.url.clone())
        .or_else(|| manifest.download_path.clone())?;

    manifest_url.join(candidate.trim()).ok().map(|url| url.to_string())
}

fn build_update_message(available: bool, required: bool, detected_version: Option<&str>) -> String {
    if !available {
        return "Ya tienes la ultima version disponible.".to_string();
    }

    let version_label = detected_version.unwrap_or("desconocida");
    if required {
        format!(
            "Hay una actualizacion obligatoria disponible: {}. Debes instalarla para seguir usando la app.",
            version_label
        )
    } else {
        format!(
            "Hay una nueva version disponible: {}. Puedes instalarla cuando quieras.",
            version_label
        )
    }
}

fn updater_not_configured_state(app: &AppHandle) -> AppUpdateState {
    AppUpdateState {
        configured: false,
        available: false,
        required: false,
        current_version: app.package_info().version.to_string(),
        version: None,
        minimum_version: None,
        notes: None,
        pub_date: None,
        download_url: None,
        target: None,
        manifest_url: None,
        diagnostic: None,
        message: Some(
            "El actualizador no esta configurado en este build. Define TAURI_UPDATER_PUBKEY y TAURI_UPDATER_ENDPOINTS al compilar la app."
                .to_string(),
        ),
    }
}

#[tauri::command]
async fn check_app_update(app: AppHandle) -> Result<AppUpdateState, String> {
    let Some((pubkey, endpoints)) = updater_env() else {
        return Ok(updater_not_configured_state(&app));
    };

    let current_version = app.package_info().version.to_string();
    let manifest_client = updater_client()?;
    let (manifest_url, manifest) = fetch_updater_manifest(&manifest_client, &endpoints).await?;

    let manifest_version = trim_option(manifest.version.clone());
    let manifest_notes = trim_option(manifest.notes.clone());
    let manifest_pub_date = trim_option(manifest.pub_date.clone());
    let minimum_version = trim_option(manifest.minimum_version.clone());
    let manifest_required = manifest.required.unwrap_or(false);
    let minimum_forces_update = is_below_minimum(&current_version, minimum_version.as_deref());

    let update = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    let updater_version = update.as_ref().map(|value| value.version.clone());
    let detected_version = updater_version
        .clone()
        .or_else(|| manifest_version.clone().filter(|value| is_version_newer(Some(value), &current_version)));
    let available = update.is_some() || is_version_newer(manifest_version.as_deref(), &current_version);
    let required = available && (manifest_required || minimum_forces_update);
    let download_url = update
        .as_ref()
        .map(|value| value.download_url.to_string())
        .or_else(|| pick_manifest_download_url(&manifest_url, &manifest));
    let diagnostic = if minimum_forces_update {
        minimum_version
            .as_ref()
            .map(|value| format!("Este build ({current_version}) esta por debajo del minimo exigido por latest.json ({value})."))
    } else if manifest_required {
        Some("latest.json marca esta release como obligatoria.".to_string())
    } else {
        None
    };

    if let Some(update) = update {
        Ok(AppUpdateState {
            configured: true,
            available,
            required,
            current_version: update.current_version.clone(),
            version: detected_version.clone(),
            minimum_version,
            notes: manifest_notes.or_else(|| trim_option(update.body.clone())),
            pub_date: manifest_pub_date.or_else(|| update.date.map(|value| value.to_string())),
            download_url,
            target: Some(update.target.clone()),
            manifest_url: Some(manifest_url.to_string()),
            diagnostic,
            message: Some(build_update_message(available, required, detected_version.as_deref())),
        })
    } else {
        Ok(AppUpdateState {
            configured: true,
            available,
            required,
            current_version,
            version: detected_version.clone(),
            minimum_version,
            notes: manifest_notes,
            pub_date: manifest_pub_date,
            download_url,
            target: None,
            manifest_url: Some(manifest_url.to_string()),
            diagnostic,
            message: Some(build_update_message(available, required, detected_version.as_deref())),
        })
    }
}

#[tauri::command]
async fn install_app_update(app: AppHandle) -> Result<(), String> {
    let Some((pubkey, endpoints)) = updater_env() else {
        return Err(
            "El actualizador no esta configurado en este build. Vuelve a compilar la app con TAURI_UPDATER_PUBKEY y TAURI_UPDATER_ENDPOINTS."
                .to_string(),
        );
    };

    let update = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No hay ninguna actualizacion disponible ahora mismo.".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_discogs_search(search_id: String, registry: State<SearchRegistry>) -> Result<(), String> {
    let active = registry.active.lock().map_err(|_| "No se pudo cancelar la busqueda".to_string())?;
    if let Some(flag) = active.get(&search_id) {
        flag.store(true, AtomicOrdering::Relaxed);
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
            .timeout(Duration::from_secs(20))
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

#[tauri::command]
fn start_catalog_search(
    app: AppHandle,
    filters: SearchFilters,
    _user_id: String,
    registry: State<SearchRegistry>,
) -> Result<String, String> {
    let dsn = get_catalog_dsn()?;
    let search_id = format!(
        "catalog-search-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
    );

    let cancel_flag = Arc::new(AtomicBool::new(false));
    registry
        .active
        .lock()
        .map_err(|_| "No se pudo preparar la busqueda del catalogo".to_string())?
        .insert(search_id.clone(), cancel_flag.clone());

    let app_handle = app.clone();
    let task_search_id = search_id.clone();

    tauri::async_runtime::spawn(async move {
        let result = run_catalog_search(
            app_handle.clone(),
            dsn,
            task_search_id.clone(),
            filters,
            cancel_flag,
        )
        .await;

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

async fn run_catalog_search(
    app: AppHandle,
    dsn: String,
    search_id: String,
    filters: SearchFilters,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    emit_search_event(
        &app,
        &search_id,
        "status",
        json!({ "message": "Conectando con discogs_catalog...", "page": 0, "total_pages": 1, "found": 0, "processed": 0 }),
    );

    let (client, connection) = tokio_postgres::connect(&dsn, NoTls)
        .await
        .map_err(|error| format!("No se pudo conectar con discogs_catalog: {error}"))?;

    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });

    emit_search_event(
        &app,
        &search_id,
        "status",
        json!({ "message": "Ejecutando filtros estructurales sobre discogs_catalog...", "page": 0, "total_pages": 1, "found": 0, "processed": 0 }),
    );

    let mut offset = 0_i64;
    let mut found = 0_i64;
    let mut processed = 0_i64;

    loop {
        let query = build_catalog_search_query(&filters, true, Some(CATALOG_BATCH_SIZE), offset, true);
        let rows = client
            .query(&query, &[])
            .await
            .map_err(|error| format_catalog_query_error("La consulta a discogs_catalog fallo", &filters, &error))?;

        if rows.is_empty() {
            break;
        }

        for row in &rows {
            if cancel_flag.load(AtomicOrdering::Relaxed) {
                emit_search_event(
                    &app,
                    &search_id,
                    "done",
                    json!({ "found": found, "processed": processed, "reason": "cancelled" }),
                );
                return Ok(());
            }

            processed += 1;
            let card = build_catalog_card(row);
            found += 1;

            emit_search_event(
                &app,
                &search_id,
                "item",
                json!({ "idx": found, "card": card }),
            );

            emit_search_event(
                &app,
                &search_id,
                "status",
                json!({
                    "page": (offset / CATALOG_BATCH_SIZE) + 1,
                    "total_pages": 0,
                    "found": found,
                    "processed": processed,
                    "message": format!("Catalogo local · lote {} · encontrados {}", (offset / CATALOG_BATCH_SIZE) + 1, found)
                }),
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

        if rows.len() < CATALOG_BATCH_SIZE as usize {
            break;
        }

        offset += CATALOG_BATCH_SIZE;
    }

    emit_search_event(
        &app,
        &search_id,
        "done",
        json!({ "found": found, "processed": processed, "reason": "catalog_complete" }),
    );

    Ok(())
}

#[tauri::command]
fn start_hybrid_search(
    app: AppHandle,
    filters: SearchFilters,
    user_id: String,
    registry: State<SearchRegistry>,
) -> Result<String, String> {
    let dsn = get_catalog_dsn()?;
    let token = get_discogs_token(&user_id)?;
    let search_id = format!(
        "hybrid-search-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
    );

    let cancel_flag = Arc::new(AtomicBool::new(false));
    registry
        .active
        .lock()
        .map_err(|_| "No se pudo preparar la busqueda hibrida".to_string())?
        .insert(search_id.clone(), cancel_flag.clone());

    let app_handle = app.clone();
    let task_search_id = search_id.clone();

    tauri::async_runtime::spawn(async move {
        let result = match Client::builder()
            .user_agent("103FinderDesktop/0.1")
            .timeout(Duration::from_secs(20))
            .build()
        {
            Ok(http_client) => {
                run_hybrid_search(
                    app_handle.clone(),
                    http_client,
                    dsn,
                    token,
                    task_search_id.clone(),
                    filters,
                    cancel_flag,
                )
                .await
            }
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

async fn run_hybrid_search(
    app: AppHandle,
    http_client: Client,
    dsn: String,
    token: String,
    search_id: String,
    filters: SearchFilters,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    emit_search_event(
        &app,
        &search_id,
        "status",
        json!({ "message": "Conectando con discogs_catalog para prefiltrar...", "page": 0, "total_pages": 1, "found": 0, "processed": 0 }),
    );

    let (catalog_client, connection) = tokio_postgres::connect(&dsn, NoTls)
        .await
        .map_err(|error| format!("No se pudo conectar con discogs_catalog: {error}"))?;

    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });

    let mut offset = 0_i64;
    let mut found = 0_i64;
    let mut processed = 0_i64;

    loop {
        let query = build_catalog_search_query(&filters, false, Some(CATALOG_BATCH_SIZE), offset, false);
        let rows = catalog_client
            .query(&query, &[])
            .await
            .map_err(|error| format_catalog_query_error("La consulta estructural del catalogo fallo", &filters, &error))?;

        if rows.is_empty() {
            break;
        }

        emit_search_event(
            &app,
            &search_id,
            "status",
            json!({ "message": format!("Catalogo local listo. Lote {} recibido; ahora se refrescan detalles live.", (offset / CATALOG_BATCH_SIZE) + 1), "page": (offset / CATALOG_BATCH_SIZE) + 1, "total_pages": 0, "found": found, "processed": processed }),
        );

        for row in &rows {
            if cancel_flag.load(AtomicOrdering::Relaxed) {
                emit_search_event(
                    &app,
                    &search_id,
                    "done",
                    json!({ "found": found, "processed": processed, "reason": "cancelled" }),
                );
                return Ok(());
            }

            processed += 1;
            let release_id = row.get::<_, i64>("release_id");
            let release_url = format!("{BASE_URL}/releases/{release_id}");
            let details = match discogs_get(&http_client, &release_url, &token, None).await {
                Ok(value) => value,
                Err(_) => {
                    emit_search_event(
                        &app,
                        &search_id,
                        "status",
                        json!({
                            "page": (offset / CATALOG_BATCH_SIZE) + 1,
                            "total_pages": 0,
                            "found": found,
                            "processed": processed,
                            "message": format!("Hibrido · Discogs no devolvio {}. Se sigue con el resto.", release_id)
                        }),
                    );
                    continue;
                }
            };

            if !passes_details(&details, &filters) {
                emit_search_event(
                    &app,
                    &search_id,
                    "status",
                    json!({
                        "page": (offset / CATALOG_BATCH_SIZE) + 1,
                        "total_pages": 0,
                        "found": found,
                        "processed": processed,
                        "message": format!("Hibrido · procesados {} · encontrados {}", processed, found)
                    }),
                );
                continue;
            }

            let item = json!({
                "thumb": row.get::<_, Option<String>>("thumb").unwrap_or_default(),
                "uri": row.get::<_, Option<String>>("uri").unwrap_or_default(),
                "title": row.get::<_, String>("title"),
                "artist": row.get::<_, Option<String>>("artists_sort").unwrap_or_default(),
            });
            let card = build_card(&item, &details);
            found += 1;

            emit_search_event(
                &app,
                &search_id,
                "item",
                json!({ "idx": found, "card": card }),
            );

            emit_search_event(
                &app,
                &search_id,
                "status",
                json!({
                    "page": (offset / CATALOG_BATCH_SIZE) + 1,
                    "total_pages": 0,
                    "found": found,
                    "processed": processed,
                    "message": format!("Hibrido · procesados {} · encontrados {}", processed, found)
                }),
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

        if rows.len() < CATALOG_BATCH_SIZE as usize {
            break;
        }

        offset += CATALOG_BATCH_SIZE;
    }

    emit_search_event(
        &app,
        &search_id,
        "done",
        json!({ "found": found, "processed": processed, "reason": "hybrid_complete" }),
    );

    Ok(())
}

fn build_catalog_search_query(
    filters: &SearchFilters,
    include_snapshot_filters: bool,
    limit: Option<i64>,
    offset: i64,
    include_aggregates: bool,
) -> String {
    let mut where_clauses = vec!["TRUE".to_string()];
    let effective_year_expr = "CASE WHEN r.year IS NOT NULL AND r.year <> 0 THEN r.year WHEN COALESCE(r.released, '') ~ '^[0-9]{4}' THEN SUBSTRING(r.released FROM 1 FOR 4)::integer ELSE NULL END";

    if filters.type_selected.eq_ignore_ascii_case("master") {
        where_clauses.push("r.master_id IS NOT NULL".to_string());
    }

    if filters.sin_anyo {
        where_clauses.push(format!("({effective_year_expr}) IS NULL"));
    } else {
        where_clauses.push(format!(
            "({effective_year_expr}) BETWEEN {} AND {}",
            filters.year_start, filters.year_end,
        ));
    }

    if include_snapshot_filters {
        where_clauses.push(format!("COALESCE(r.have, 0) >= {}", filters.have_min));
        if filters.have_max > 0 {
            where_clauses.push(format!("COALESCE(r.have, 0) <= {}", filters.have_max));
        }

        where_clauses.push(format!("COALESCE(r.want, 0) >= {}", filters.want_min));
        if filters.want_max > 0 {
            where_clauses.push(format!("COALESCE(r.want, 0) <= {}", filters.want_max));
        }
    }

    if !filters.countries_selected.is_empty() {
        where_clauses.push(format!(
            "LOWER(COALESCE(r.country, '')) IN ({})",
            sql_list(&filters.countries_selected)
        ));
    }

    if include_snapshot_filters {
        if filters.solo_en_venta {
            where_clauses.push("COALESCE(r.num_for_sale, 0) > 0".to_string());
        }
        if filters.max_copias_venta > 0 {
            where_clauses.push(format!("COALESCE(r.num_for_sale, 0) <= {}", filters.max_copias_venta));
        }

        if filters.precio_minimo > 0.0 {
            where_clauses.push(format!("r.lowest_price IS NOT NULL AND r.lowest_price >= {}", filters.precio_minimo));
        }
        if filters.precio_maximo > 0.0 {
            where_clauses.push(format!("r.lowest_price IS NOT NULL AND r.lowest_price <= {}", filters.precio_maximo));
        }
    }

    if filters.max_versions > 0 {
        where_clauses.push(format!(
            "COALESCE(mvc.version_count, CASE WHEN r.master_id IS NULL THEN 1 ELSE NULL END, 1) <= {}",
            filters.max_versions
        ));
    }

    if filters.not_on_label_only {
        where_clauses.push(
            "EXISTS (SELECT 1 FROM catalog.release_labels rl WHERE rl.release_id = r.release_id AND LOWER(rl.label_name) LIKE 'not on label%')"
                .to_string(),
        );
    }

    if filters.exclude_various {
        where_clauses.push(
            "NOT (LOWER(COALESCE(r.artists_sort, '')) = 'various' OR EXISTS (SELECT 1 FROM catalog.release_artists ra WHERE ra.release_id = r.release_id AND LOWER(ra.artist_name) = 'various'))"
                .to_string(),
        );
    }

    if include_snapshot_filters {
        if filters.youtube_status == "Si" {
            where_clauses.push(
                "EXISTS (SELECT 1 FROM catalog.release_videos rv WHERE rv.release_id = r.release_id)".to_string(),
            );
        } else if filters.youtube_status == "No" {
            where_clauses.push(
                "NOT EXISTS (SELECT 1 FROM catalog.release_videos rv WHERE rv.release_id = r.release_id)".to_string(),
            );
        }
    }

    for genre in normalized_sql_values(&filters.genres) {
        where_clauses.push(format!(
            "EXISTS (SELECT 1 FROM catalog.release_genres rg WHERE rg.release_id = r.release_id AND LOWER(rg.genre) = {})",
            genre
        ));
    }
    if filters.strict_genre && !filters.genres.is_empty() {
        where_clauses.push(format!(
            "(SELECT COUNT(DISTINCT LOWER(rg.genre)) FROM catalog.release_genres rg WHERE rg.release_id = r.release_id) = {}",
            normalized_sql_values(&filters.genres).len()
        ));
    }

    for style in normalized_sql_values(&filters.styles) {
        where_clauses.push(format!(
            "EXISTS (SELECT 1 FROM catalog.release_styles rs WHERE rs.release_id = r.release_id AND LOWER(rs.style) = {})",
            style
        ));
    }
    if filters.strict_style && !filters.styles.is_empty() {
        where_clauses.push(format!(
            "(SELECT COUNT(DISTINCT LOWER(rs.style)) FROM catalog.release_styles rs WHERE rs.release_id = r.release_id) = {}",
            normalized_sql_values(&filters.styles).len()
        ));
    }

    let format_values = normalized_sql_values(&filters.formats_selected);
    if !format_values.is_empty() {
        where_clauses.push(format!(
            "EXISTS (SELECT 1 FROM (SELECT LOWER(rf.format_name) AS value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id UNION SELECT LOWER(rfd.description) AS value FROM catalog.release_format_descriptions rfd WHERE rfd.release_id = r.release_id UNION SELECT LOWER(rf.format_text) AS value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id AND rf.format_text IS NOT NULL) format_values WHERE format_values.value IN ({}))",
            format_values.join(", ")
        ));
    }

    let select_genres = if include_aggregates {
        "COALESCE((SELECT ARRAY_AGG(DISTINCT rg.genre ORDER BY rg.genre) FROM catalog.release_genres rg WHERE rg.release_id = r.release_id), ARRAY[]::TEXT[]) AS genres,".to_string()
    } else {
        "ARRAY[]::TEXT[] AS genres,".to_string()
    };

    let select_styles = if include_aggregates {
        "COALESCE((SELECT ARRAY_AGG(DISTINCT rs.style ORDER BY rs.style) FROM catalog.release_styles rs WHERE rs.release_id = r.release_id), ARRAY[]::TEXT[]) AS styles,".to_string()
    } else {
        "ARRAY[]::TEXT[] AS styles,".to_string()
    };

    let select_formats = if include_aggregates {
        "COALESCE((SELECT ARRAY_AGG(DISTINCT format_value ORDER BY format_value) FROM (SELECT rf.format_name AS format_value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id UNION SELECT rfd.description AS format_value FROM catalog.release_format_descriptions rfd WHERE rfd.release_id = r.release_id UNION SELECT rf.format_text AS format_value FROM catalog.release_formats rf WHERE rf.release_id = r.release_id AND rf.format_text IS NOT NULL) all_formats), ARRAY[]::TEXT[]) AS formats,".to_string()
    } else {
        "ARRAY[]::TEXT[] AS formats,".to_string()
    };

    let base_query = format!(
        "WITH filtered AS ( 
            SELECT 
                r.release_id,
                r.master_id,
                r.title,
                r.artists_sort,
                {effective_year_expr} AS year,
                r.country,
                r.thumb,
                r.uri,
                r.have,
                r.want,
                r.num_for_sale,
                CASE WHEN r.lowest_price IS NULL THEN NULL ELSE r.lowest_price::double precision END AS lowest_price,
                COALESCE(mvc.version_count, CASE WHEN r.master_id IS NULL THEN 1 ELSE NULL END, 1) AS version_count,
                EXISTS (SELECT 1 FROM catalog.release_videos rv WHERE rv.release_id = r.release_id) AS has_youtube,
                {select_genres}
                {select_styles}
                {select_formats}
                ROW_NUMBER() OVER (PARTITION BY COALESCE(r.master_id, -r.release_id) ORDER BY CASE WHEN m.main_release_id = r.release_id THEN 0 ELSE 1 END, ({effective_year_expr}) NULLS LAST, r.release_id) AS master_rank
            FROM catalog.releases r
            LEFT JOIN catalog.masters m ON m.master_id = r.master_id
            LEFT JOIN catalog.master_version_counts mvc ON mvc.master_id = r.master_id
            WHERE {}
        )
        SELECT
            release_id, master_id, title, artists_sort, year, country, thumb, uri, have, want, num_for_sale, lowest_price, version_count, has_youtube, genres, styles, formats
        FROM filtered
        WHERE {}
        ORDER BY year NULLS LAST, release_id",
        where_clauses.join(" AND "),
        if filters.type_selected.eq_ignore_ascii_case("master") {
            "master_rank = 1"
        } else {
            "TRUE"
        },
        select_genres = select_genres,
        select_styles = select_styles,
        select_formats = select_formats,
    );

    let effective_limit = limit.unwrap_or_else(|| {
        if filters.tope_resultados > 0 {
            filters.tope_resultados.min(MAX_ITEMS)
        } else {
            MAX_ITEMS
        }
    });

    format!("{base_query} LIMIT {effective_limit} OFFSET {offset}")
}

fn build_catalog_card(row: &tokio_postgres::Row) -> SearchCard {
    SearchCard {
        title: row.get::<_, String>("title"),
        artist: row
            .get::<_, Option<String>>("artists_sort")
            .unwrap_or_default(),
        year: row.get::<_, Option<i32>>("year").map(i64::from),
        have: row.get::<_, Option<i32>>("have").map(i64::from),
        want: row.get::<_, Option<i32>>("want").map(i64::from),
        genres: row.get::<_, Vec<String>>("genres"),
        styles: row.get::<_, Vec<String>>("styles"),
        formats: row.get::<_, Vec<String>>("formats"),
        country: row
            .get::<_, Option<String>>("country")
            .unwrap_or_default(),
        has_youtube: row.get::<_, bool>("has_youtube"),
        num_for_sale: row
            .get::<_, Option<i32>>("num_for_sale")
            .map(i64::from)
            .unwrap_or(0),
        lowest_price: row.get::<_, Option<f64>>("lowest_price"),
        uri: row.get::<_, Option<String>>("uri").unwrap_or_default(),
        thumb: row.get::<_, Option<String>>("thumb").unwrap_or_default(),
    }
}

fn sql_quote(value: &str) -> String {
    format!("'{}'", value.trim().to_lowercase().replace('\'', "''"))
}

fn normalized_sql_values(values: &[String]) -> Vec<String> {
    let mut normalized = values
        .iter()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized.into_iter().map(|value| sql_quote(&value)).collect()
}

fn sql_list(values: &[String]) -> String {
    normalized_sql_values(values).join(", ")
}

fn format_catalog_db_error(context: &str, error: &tokio_postgres::Error) -> String {
    if let Some(db_error) = error.as_db_error() {
        let detail = db_error.detail().unwrap_or(db_error.message());
        return format!("{context}: {detail}");
    }

    format!("{context}: {error}")
}

fn format_catalog_query_error(
    context: &str,
    filters: &SearchFilters,
    error: &tokio_postgres::Error,
) -> String {
    format!(
        "{} | filtros: {}",
        format_catalog_db_error(context, error),
        summarize_catalog_filters(filters)
    )
}

fn summarize_catalog_filters(filters: &SearchFilters) -> String {
    let countries = if filters.countries_selected.is_empty() {
        "todos".to_string()
    } else {
        filters.countries_selected.join("/")
    };

    let formats = if filters.formats_selected.is_empty() {
        "todos".to_string()
    } else {
        filters.formats_selected.join("/")
    };

    let genres = if filters.genres.is_empty() {
        "todos".to_string()
    } else {
        filters.genres.join("/")
    };

    let styles = if filters.styles.is_empty() {
        "todos".to_string()
    } else {
        filters.styles.join("/")
    };

    format!(
        "year={}..{} sin_anyo={} type={} countries={} formats={} genres={} styles={} strict_genre={} strict_style={} have={}..{} want={}..{} youtube={} not_on_label={} exclude_various={}",
        filters.year_start,
        filters.year_end,
        filters.sin_anyo,
        filters.type_selected,
        countries,
        formats,
        genres,
        styles,
        filters.strict_genre,
        filters.strict_style,
        filters.have_min,
        filters.have_max,
        filters.want_min,
        filters.want_max,
        filters.youtube_status,
        filters.not_on_label_only,
        filters.exclude_various
    )
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
        if cancel_flag.load(AtomicOrdering::Relaxed) {
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
            if cancel_flag.load(AtomicOrdering::Relaxed) {
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
    let mut last_error = String::from("Discogs no respondio correctamente.");

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
                last_error = if error.is_timeout() {
                    "Timeout al conectar con Discogs. Revisa la red o vuelve a intentarlo en unos segundos.".to_string()
                } else {
                    format!("No se pudo conectar con Discogs: {error}")
                };
                sleep(Duration::from_secs(backoff_seconds)).await;
                backoff_seconds = (backoff_seconds * 2).min(20);
                if error.is_timeout() {
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = response.status();

        if status == StatusCode::UNAUTHORIZED {
            return Err("Token de Discogs invalido o no autorizado (401).".to_string());
        }

        if status == StatusCode::FORBIDDEN {
            return Err("Discogs rechazo el token o la peticion (403). Revisa permisos y estado de la cuenta.".to_string());
        }

        if status == StatusCode::TOO_MANY_REQUESTS {
            last_error = "Discogs devolvio rate limit (429). Espera un momento antes de volver a buscar.".to_string();
            sleep(Duration::from_secs(backoff_seconds)).await;
            backoff_seconds = (backoff_seconds * 2).min(20);
            continue;
        }

        if matches!(
            status,
            StatusCode::INTERNAL_SERVER_ERROR
                | StatusCode::BAD_GATEWAY
                | StatusCode::SERVICE_UNAVAILABLE
                | StatusCode::GATEWAY_TIMEOUT
        ) {
            last_error = format!("Discogs respondio con {}. Se volvera a intentar automaticamente.", status.as_u16());
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

        let response = response
            .error_for_status()
            .map_err(|error| format!("Discogs devolvio un error inesperado: {error}"))?;
        let value = response.json::<Value>().await.map_err(|error| error.to_string())?;

        if remaining <= 1 {
            sleep(Duration::from_millis(1200)).await;
        }

        return Ok(value);
    }

    Err(last_error)
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
        thumb: extract_thumb(details).or_else(|| string_value(item.get("thumb"))).unwrap_or_default(),
    }
}

fn extract_thumb(details: &Value) -> Option<String> {
    string_value(details.get("thumb"))
        .or_else(|| string_value(details.get("cover_image")))
        .or_else(|| {
            details
                .get("images")
                .and_then(|value| value.as_array())
                .and_then(|images| {
                    images.iter().find_map(|image| {
                        string_value(image.get("uri150")).or_else(|| string_value(image.get("uri")))
                    })
                })
        })
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
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("103 FINDER");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_discogs_token,
            save_discogs_token,
            delete_discogs_token,
            load_catalog_dsn,
            save_catalog_dsn,
            delete_catalog_dsn,
            check_app_update,
            install_app_update,
            start_discogs_search,
            start_catalog_search,
            start_hybrid_search,
            cancel_discogs_search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
