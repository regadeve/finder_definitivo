@echo off
setlocal
cd /d "%~dp0public-landing\public"
python -m http.server 8787 --bind 127.0.0.1
