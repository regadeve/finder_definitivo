-- Estilos en AND real.
SELECT rs.release_id
FROM catalog.release_styles rs
WHERE rs.style IN ('Techno', 'Synth-pop')
GROUP BY rs.release_id
HAVING COUNT(DISTINCT rs.style) = 2;


-- Query mas cercana a 103 Finder para filtrar estructura localmente.
WITH style_match AS (
    SELECT rs.release_id
    FROM catalog.release_styles rs
    WHERE rs.style IN ('Techno', 'Synth-pop')
    GROUP BY rs.release_id
    HAVING COUNT(DISTINCT rs.style) = 2
),
genre_match AS (
    SELECT rg.release_id
    FROM catalog.release_genres rg
    WHERE rg.genre IN ('Electronic')
    GROUP BY rg.release_id
    HAVING COUNT(DISTINCT rg.genre) = 1
)
SELECT
    r.release_id,
    r.master_id,
    r.title,
    r.year,
    r.country,
    COALESCE(mvc.version_count, 1) AS version_count
FROM catalog.releases r
JOIN style_match sm ON sm.release_id = r.release_id
JOIN genre_match gm ON gm.release_id = r.release_id
LEFT JOIN catalog.master_version_counts mvc ON mvc.master_id = r.master_id
WHERE r.year BETWEEN 1991 AND 1995
  AND r.country IN ('UK', 'Germany')
  AND COALESCE(mvc.version_count, 1) <= 6
  AND NOT EXISTS (
      SELECT 1
      FROM catalog.release_artists ra
      WHERE ra.release_id = r.release_id
        AND LOWER(ra.artist_name) = 'various'
  )
  AND EXISTS (
      SELECT 1
      FROM catalog.release_formats rf
      WHERE rf.release_id = r.release_id
        AND rf.format_name = 'Vinyl'
  )
ORDER BY r.year NULLS LAST, r.release_id
LIMIT 500;


-- Releases de un master con su numero de versiones local.
SELECT
    r.master_id,
    COUNT(*) AS versions_from_releases,
    COALESCE(MAX(mvc.version_count), 0) AS versions_cached
FROM catalog.releases r
LEFT JOIN catalog.master_version_counts mvc ON mvc.master_id = r.master_id
WHERE r.master_id IS NOT NULL
GROUP BY r.master_id
ORDER BY versions_from_releases DESC
LIMIT 25;
