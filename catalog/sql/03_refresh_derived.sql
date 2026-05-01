TRUNCATE TABLE catalog.master_version_counts;

INSERT INTO catalog.master_version_counts (master_id, version_count, refreshed_at)
SELECT
    r.master_id,
    COUNT(*)::INTEGER AS version_count,
    NOW() AS refreshed_at
FROM catalog.releases r
WHERE r.master_id IS NOT NULL
GROUP BY r.master_id;

ANALYZE catalog.masters;
ANALYZE catalog.releases;
ANALYZE catalog.release_genres;
ANALYZE catalog.release_styles;
ANALYZE catalog.release_formats;
ANALYZE catalog.release_artists;
ANALYZE catalog.release_labels;
ANALYZE catalog.master_version_counts;
