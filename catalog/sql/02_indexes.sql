CREATE INDEX IF NOT EXISTS artists_name_trgm_idx
    ON catalog.artists USING GIN (LOWER(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS labels_name_trgm_idx
    ON catalog.labels USING GIN (LOWER(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS masters_title_trgm_idx
    ON catalog.masters USING GIN (LOWER(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS masters_main_release_idx
    ON catalog.masters (main_release_id);

CREATE INDEX IF NOT EXISTS releases_master_id_idx
    ON catalog.releases (master_id);

CREATE INDEX IF NOT EXISTS releases_year_idx
    ON catalog.releases (year);

CREATE INDEX IF NOT EXISTS releases_country_idx
    ON catalog.releases (country);

CREATE INDEX IF NOT EXISTS releases_status_idx
    ON catalog.releases (status);

CREATE INDEX IF NOT EXISTS releases_artists_sort_idx
    ON catalog.releases (LOWER(artists_sort));

CREATE INDEX IF NOT EXISTS releases_title_trgm_idx
    ON catalog.releases USING GIN (LOWER(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS release_genres_genre_release_idx
    ON catalog.release_genres (genre, release_id);

CREATE INDEX IF NOT EXISTS release_styles_style_release_idx
    ON catalog.release_styles (style, release_id);

CREATE INDEX IF NOT EXISTS release_formats_name_release_idx
    ON catalog.release_formats (format_name, release_id);

CREATE INDEX IF NOT EXISTS release_format_desc_description_release_idx
    ON catalog.release_format_descriptions (description, release_id);

CREATE INDEX IF NOT EXISTS release_artists_artist_release_idx
    ON catalog.release_artists (artist_id, release_id);

CREATE INDEX IF NOT EXISTS release_artists_name_release_idx
    ON catalog.release_artists (LOWER(artist_name), release_id);

CREATE INDEX IF NOT EXISTS release_labels_label_release_idx
    ON catalog.release_labels (label_id, release_id);

CREATE INDEX IF NOT EXISTS release_labels_name_release_idx
    ON catalog.release_labels (LOWER(label_name), release_id);

CREATE INDEX IF NOT EXISTS release_labels_catalog_number_idx
    ON catalog.release_labels (LOWER(catalog_number));

CREATE INDEX IF NOT EXISTS release_identifiers_type_value_idx
    ON catalog.release_identifiers (identifier_type, identifier_value);

CREATE INDEX IF NOT EXISTS release_companies_company_release_idx
    ON catalog.release_companies (company_id, release_id);

CREATE INDEX IF NOT EXISTS release_videos_uri_idx
    ON catalog.release_videos (uri);

CREATE INDEX IF NOT EXISTS master_version_counts_version_idx
    ON catalog.master_version_counts (version_count);
