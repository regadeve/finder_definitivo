$privateKeyPath = Join-Path $HOME ".tauri/103finder-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw $privateKeyPath).Trim()

npm run desktop:build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

npm run desktop:publish-updater
exit $LASTEXITCODE
