"use client";

import { Suspense } from "react";
import SearchClient from "./SearchClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center text-zinc-500">Cargando Finder...</div>}>
      <SearchClient />
    </Suspense>
  );
}
