import type { SupabaseClient } from "@supabase/supabase-js";

export type ReleaseCardPayload = {
  uri: string;
  title: string;
  artist: string;
  year: number | null;
  thumb: string;
  country: string;
  genres?: string[];
  styles?: string[];
  formats?: string[];
};

export type UserReleaseState = {
  is_favorite: boolean;
  listened: boolean;
};

type UserReleaseRow = {
  release_uri: string;
  is_favorite: boolean;
  listened: boolean;
};

export async function fetchUserReleaseStates(
  supabase: SupabaseClient,
  userId: string,
  releaseUris: string[]
) {
  const uniqueUris = Array.from(new Set(releaseUris.filter(Boolean)));

  if (uniqueUris.length === 0) {
    return {} as Record<string, UserReleaseState>;
  }

  const { data, error } = await supabase
    .from("user_releases")
    .select("release_uri, is_favorite, listened")
    .eq("user_id", userId)
    .in("release_uri", uniqueUris);

  if (error) {
    throw error;
  }

  const result: Record<string, UserReleaseState> = {};

  uniqueUris.forEach((uri) => {
    result[uri] = {
      is_favorite: false,
      listened: false,
    };
  });

  (data as UserReleaseRow[] | null)?.forEach((row) => {
    result[row.release_uri] = {
      is_favorite: row.is_favorite,
      listened: row.listened,
    };
  });

  return result;
}

export async function upsertUserReleaseState(
  supabase: SupabaseClient,
  userId: string,
  card: ReleaseCardPayload,
  state: UserReleaseState
) {
  const { error } = await supabase.from("user_releases").upsert(
    {
      user_id: userId,
      release_uri: card.uri,
      title: card.title,
      artist: card.artist,
      year: card.year,
      thumb: card.thumb,
      country: card.country,
      genres: card.genres ?? [],
      styles: card.styles ?? [],
      formats: card.formats ?? [],
      is_favorite: state.is_favorite,
      listened: state.listened,
      listened_at: state.listened ? new Date().toISOString() : null,
    },
    {
      onConflict: "user_id,release_uri",
    }
  );

  if (error) {
    throw error;
  }
}
