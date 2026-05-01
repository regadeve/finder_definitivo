@echo off
setlocal
cd /d "%~dp0web\frontend"
call npm.cmd run desktop:dev
