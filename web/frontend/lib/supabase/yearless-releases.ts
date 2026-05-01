import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchCard } from "@/lib/discogs/search-stream";

export type YearlessReleaseHit = {
  release_uri: string;
  title: string | null;
  artist: string | null;
  year: number | null;
  thumb: string | null;
  country: string | null;
  genres: string[];
  styles: string[];
  formats: string[];
  first_found_at: string;
  last_found_at: string;
  times_found: number;
};

export async function reportYearlessReleaseHit(supabase: SupabaseClient, card: SearchCard) {
  const { error } = await supabase.rpc("report_yearless_release_hit", {
    p_release_uri: card.uri,
    p_title: card.title,
    p_artist: card.artist,
    p_year: card.year,
    p_thumb: card.thumb,
    p_country: card.country,
    p_genres: card.genres,
    p_styles: card.styles,
    p_formats: card.formats,
  });

  if (error) {
    throw error;
  }
}

export async function fetchYearlessReleaseHits(supabase: SupabaseClient, limit = 100) {
  const { data, error } = await supabase
    .from("yearless_release_hits")
    .select("release_uri, title, artist, year, thumb, country, genres, styles, formats, first_found_at, last_found_at, times_found")
    .order("last_found_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as YearlessReleaseHit[];
}
