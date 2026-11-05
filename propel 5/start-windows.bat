@echo off
cd /d "%~dp0"
where py >nul 2>nul || (echo Install Python 3.10 or newer first. & pause & exit /b 1)
where npm >nul 2>nul || (echo Install Node.js 20.19 or newer first. & pause & exit /b 1)
if not exist .venv py -m venv .venv
call .venv\Scripts\python -m pip install -r backend\requirements.txt
if errorlevel 1 exit /b 1
pushd frontend
call npm ci
if errorlevel 1 exit /b 1
popd
call .venv\Scripts\python backend\manage.py migrate
if errorlevel 1 exit /b 1
start "Propel Backend" cmd /k ".venv\Scripts\python backend\manage.py runserver 127.0.0.1:8000 --noreload"
pushd frontend
call npm run dev -- --host 127.0.0.1 --port 3000
