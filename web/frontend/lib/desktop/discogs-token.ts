import { invoke } from "@tauri-apps/api/core";
import { toErrorMessage } from "./errors";
import { isTauriRuntime } from "./runtime";

export type DiscogsTokenState = {
  token: string;
  hasToken: boolean;
};

export async function loadDiscogsToken(): Promise<DiscogsTokenState> {
  if (!(await isTauriRuntime())) {
    return { token: "", hasToken: false };
  }

  const token = await invoke<string>("load_discogs_token").catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo leer el token local de Discogs."));
  });
  return {
    token,
    hasToken: token.trim().length > 0,
  };
}

export async function saveDiscogsToken(token: string) {
  if (!(await isTauriRuntime())) {
    throw new Error("El guardado seguro del token solo esta disponible en la app de escritorio.");
  }

  await invoke("save_discogs_token", { token }).catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo guardar el token de Discogs."));
  });
}

export async function deleteDiscogsToken() {
  if (!(await isTauriRuntime())) {
    throw new Error("El borrado seguro del token solo esta disponible en la app de escritorio.");
  }

  await invoke("delete_discogs_token").catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo borrar el token de Discogs."));
  });
}
