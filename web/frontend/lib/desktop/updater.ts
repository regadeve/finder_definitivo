import { invoke } from "@tauri-apps/api/core";
import { toErrorMessage } from "./errors";
import { isTauriRuntime } from "./runtime";

export type AppUpdateState = {
  configured: boolean;
  available: boolean;
  required: boolean;
  currentVersion: string;
  version: string | null;
  minimumVersion: string | null;
  notes: string | null;
  pubDate: string | null;
  downloadUrl: string | null;
  target: string | null;
  manifestUrl: string | null;
  diagnostic: string | null;
  message: string | null;
};

export async function checkAppUpdate(): Promise<AppUpdateState> {
  if (!(await isTauriRuntime())) {
    return {
      configured: false,
      available: false,
      required: false,
      currentVersion: "web",
      version: null,
      minimumVersion: null,
      notes: null,
      pubDate: null,
      downloadUrl: null,
      target: null,
      manifestUrl: null,
      diagnostic: null,
      message: null,
    };
  }

  return invoke<AppUpdateState>("check_app_update").catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo comprobar si hay actualizaciones."));
  });
}

export async function installAppUpdate() {
  if (!(await isTauriRuntime())) {
    throw new Error("La instalacion de actualizaciones solo esta disponible en la app de escritorio.");
  }

  await invoke("install_app_update").catch((error) => {
    throw new Error(toErrorMessage(error, "No se pudo instalar la actualizacion."));
  });
}
