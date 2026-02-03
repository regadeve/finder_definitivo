import { Suspense } from "react";
import SearchClient from "./SearchClient";

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const yearStartRaw = searchParams?.year_start;
  const yearEndRaw = searchParams?.year_end;
  const genreRaw = searchParams?.genre;
  const styleRaw = searchParams?.style;

  const year_start = Number(Array.isArray(yearStartRaw) ? yearStartRaw[0] : yearStartRaw ?? 1995);
  const year_end = Number(Array.isArray(yearEndRaw) ? yearEndRaw[0] : yearEndRaw ?? 1995);
  const genre = String(Array.isArray(genreRaw) ? genreRaw[0] : genreRaw ?? "");
  const style = String(Array.isArray(styleRaw) ? styleRaw[0] : styleRaw ?? "");

  return (
    <Suspense fallback={<div className="p-8">Cargando…</div>}>
      <SearchClient year_start={year_start} year_end={year_end} genre={genre} style={style} />
    </Suspense>
  );
}
