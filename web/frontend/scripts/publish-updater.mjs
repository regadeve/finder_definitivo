import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..");
const frontendDir = process.cwd();
const landingDir = path.resolve(repoRoot, "..", "public-landing");

const tauriConfigPath = path.join(frontendDir, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));

const version = tauriConfig.version;
const installerName = `103 Finder_${version}_x64-setup.exe`;
const publicInstallerName = `103-Finder-Windows-x64-Setup-${version}.exe`;
const notes = process.env.TAURI_UPDATER_NOTES?.trim() || `103 Finder ${version}`;
const pubDate = new Date().toISOString();
const baseUrl = process.env.TAURI_UPDATER_BASE_URL?.trim() || "https://103finder.shop/updates";
const required = process.env.TAURI_UPDATER_REQUIRED?.trim() !== "false";
const minimumVersion = required ? version : process.env.TAURI_UPDATER_MINIMUM_VERSION?.trim() || null;
const publicDownloadPath = `/downloads/${publicInstallerName}`;

const releaseInstallerPath = path.join(frontendDir, "src-tauri", "target", "release", "bundle", "nsis", installerName);
const releaseSigPath = `${releaseInstallerPath}.sig`;

const landingUpdatesDir = path.join(landingDir, "public", "updates");
const landingDownloadsDir = path.join(landingDir, "public", "downloads");
const landingLatestPath = path.join(landingUpdatesDir, "latest.json");
const landingUpdateInstallerPath = path.join(landingUpdatesDir, publicInstallerName);
const landingUpdateSigPath = `${landingUpdateInstallerPath}.sig`;
const landingDownloadInstallerPath = path.join(landingDownloadsDir, publicInstallerName);

await mkdir(landingUpdatesDir, { recursive: true });
await mkdir(landingDownloadsDir, { recursive: true });

await copyFile(releaseInstallerPath, landingUpdateInstallerPath);
await copyFile(releaseSigPath, landingUpdateSigPath);
await copyFile(releaseInstallerPath, landingDownloadInstallerPath);

const signature = (await readFile(releaseSigPath, "utf8")).trim();

const latest = {
  version,
  notes,
  pub_date: pubDate,
  required,
  minimum_version: minimumVersion,
  download_path: publicDownloadPath,
  platforms: {
    "windows-x86_64": {
      signature,
      url: `${baseUrl}/${publicInstallerName}`,
    },
  },
};

await writeFile(landingLatestPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");

console.log(`Published updater assets for ${version}`);
console.log(`- ${landingLatestPath}`);
console.log(`- ${landingUpdateInstallerPath}`);
console.log(`- ${landingUpdateSigPath}`);
console.log(`- ${landingDownloadInstallerPath}`);
console.log(`- required update: ${required ? "yes" : "no"}`);
