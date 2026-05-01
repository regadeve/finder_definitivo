import { invoke } from "@tauri-apps/api/core";
import { toErrorMessage } from "./errors";
import { isTauriRuntime } from "./runtime";

export async function loadCatalogDsn() {
  if (!(await isTauriRuntime())) {
    return "";
  }

  return invoke<string>("load_catalog_dsn").catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo leer la conexion local del catalogo."));
  });
}

export async function saveCatalogDsn(dsn: string) {
  if (!(await isTauriRuntime())) {
    throw new Error("La conexion local del catalogo solo se guarda dentro de la app de escritorio.");
  }

  await invoke("save_catalog_dsn", { dsn }).catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo guardar la conexion local del catalogo."));
  });
}

export async function deleteCatalogDsn() {
  if (!(await isTauriRuntime())) {
    throw new Error("La conexion local del catalogo solo se borra dentro de la app de escritorio.");
  }

  await invoke("delete_catalog_dsn").catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo borrar la conexion local del catalogo."));
  });
}
