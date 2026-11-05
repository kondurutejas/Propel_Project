#!/bin/bash
set -e
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo 'Install Python 3.10 or newer first.'; exit 1; }
command -v npm >/dev/null || { echo 'Install Node.js 20.19 or newer first.'; exit 1; }
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r backend/requirements.txt
(cd frontend && npm ci)
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py runserver 127.0.0.1:8000 --noreload &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM
cd frontend
npm run dev -- --host 127.0.0.1 --port 3000
