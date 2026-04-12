import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchFiltersPayload } from "@/lib/discogs/search-stream";

export type UserSearchRow = {
  id: number;
  summary: string;
  filters: SearchFiltersPayload;
  status: "running" | "completed" | "aborted" | "failed";
  result_count: number;
  created_at: string;
};

export function buildSearchSummary(filters: SearchFiltersPayload) {
  const genres = filters.genres.length ? filters.genres.join(", ") : "Sin genero";
  const styles = filters.styles.length ? filters.styles.join(", ") : "Sin estilo";
  const yearLabel = filters.sin_anyo ? "Sin ano" : `${filters.year_start}-${filters.year_end}`;
  const priceMin = filters.precio_minimo > 0 ? `${filters.precio_minimo}EUR` : "0EUR";
  const priceMax = filters.precio_maximo > 0 ? `${filters.precio_maximo}EUR` : "sin tope";

  return `${genres} / ${styles} / ${yearLabel} / ${priceMin}-${priceMax}`;
}

export async function insertUserSearch(
  supabase: SupabaseClient,
  userId: string,
  filters: SearchFiltersPayload
) {
  const { data, error } = await supabase
    .from("user_searches")
    .insert({
      user_id: userId,
      summary: buildSearchSummary(filters),
      filters,
      status: "running",
      result_count: 0,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return Number(data.id);
}

export async function updateUserSearch(
  supabase: SupabaseClient,
  searchId: number,
  patch: { status?: UserSearchRow["status"]; result_count?: number }
) {
  const { error } = await supabase.from("user_searches").update(patch).eq("id", searchId);

  if (error) {
    throw error;
  }
}

export async function fetchUserSearches(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_searches")
    .select("id, summary, filters, status, result_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data ?? []) as UserSearchRow[];
}

export async function deleteUserSearch(supabase: SupabaseClient, searchId: number) {
  const { error } = await supabase.from("user_searches").delete().eq("id", searchId);

  if (error) {
    throw error;
  }
}
