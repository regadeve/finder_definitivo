import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const frontendDir = process.cwd();
const repoRoot = path.resolve(frontendDir, "..");
const landingDir = path.resolve(repoRoot, "..", "public-landing");

const packageJsonPath = path.join(frontendDir, "package.json");
const packageLockPath = path.join(frontendDir, "package-lock.json");
const cargoTomlPath = path.join(frontendDir, "src-tauri", "Cargo.toml");
const tauriConfigPath = path.join(frontendDir, "src-tauri", "tauri.conf.json");

function parseArgs(argv) {
  const options = {
    version: "",
    notes: "",
    required: true,
    buildLanding: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--version") {
      options.version = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--notes") {
      options.notes = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--optional") {
      options.required = false;
      continue;
    }

    if (arg === "--skip-landing-build") {
      options.buildLanding = false;
      continue;
    }
  }

  return options;
}

function assertValidVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Usa una version semver valida, por ejemplo 0.1.2");
  }
}

async function updateJsonVersion(filePath, version, transform) {
  const content = JSON.parse(await readFile(filePath, "utf8"));
  transform(content, version);
  await writeFile(filePath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

async function updateCargoVersion(version) {
  const cargoToml = await readFile(cargoTomlPath, "utf8");
  const currentVersionMatch = cargoToml.match(/\[package\][\s\S]*?^\s*version\s*=\s*"([^"]+)"/m)
    || cargoToml.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);
  const currentVersion = currentVersionMatch?.[1]?.trim();
  if (currentVersion === version) {
    return;
  }

  const packageScoped = cargoToml.replace(/(\[package\][\s\S]*?^\s*version\s*=\s*")([^"]+)(")/m, `$1${version}$3`);
  const nextCargoToml = packageScoped === cargoToml
    ? cargoToml.replace(/^\s*version\s*=\s*"[^"]+"\s*$/m, `version = "${version}"`)
    : packageScoped;

  if (cargoToml === nextCargoToml) {
    throw new Error("No se pudo actualizar la version en Cargo.toml");
  }

  await writeFile(cargoTomlPath, nextCargoToml, "utf8");
}

function runCommand(command, args, workdir, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: workdir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Fallo el comando: ${command} ${args.join(" ")}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertValidVersion(options.version);

  await updateJsonVersion(packageJsonPath, options.version, (content, version) => {
    content.version = version;
  });

  await updateJsonVersion(packageLockPath, options.version, (content, version) => {
    content.version = version;
    if (content.packages?.[""]) {
      content.packages[""].version = version;
    }
  });

  await updateJsonVersion(tauriConfigPath, options.version, (content, version) => {
    content.version = version;
  });

  await updateCargoVersion(options.version);

  console.log(`Version actualizada a ${options.version}`);

  runCommand("npm", ["run", "desktop:build"], frontendDir);

  const publishEnv = {
    ...process.env,
    TAURI_UPDATER_REQUIRED: options.required ? "true" : "false",
  };

  if (options.notes.trim()) {
    publishEnv.TAURI_UPDATER_NOTES = options.notes.trim();
  }

  runCommand("npm", ["run", "desktop:publish-updater"], frontendDir, publishEnv);

  if (options.buildLanding) {
    runCommand("npm", ["run", "build"], landingDir);
  }

  console.log("Release desktop preparada.");
  console.log("Siguiente paso: subir y desplegar public-landing para publicar la nueva version.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
