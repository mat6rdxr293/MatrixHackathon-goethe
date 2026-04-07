@echo off
cd /d "C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend"
set "FRONTEND_PORT=444"
set "BACKEND_PORT=777"
set "BACKEND_PROTOCOL=https"
set "BACKEND_ALLOW_FALLBACK=0"
set "PREVIEW_HTTPS_CERT_PATH=C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend\.certs\fullchain.pem"
set "PREVIEW_HTTPS_KEY_PATH=C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend\.certs\privkey.pem"
npm.cmd run preview -- --host 0.0.0.0 --port 444 --strictPort
