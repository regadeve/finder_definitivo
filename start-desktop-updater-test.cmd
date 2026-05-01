@echo off
setlocal
set TAURI_UPDATER_ENDPOINTS=http://127.0.0.1:8787/updates/latest-test.json
cd /d "%~dp0web\frontend"
call npm.cmd run desktop:dev
