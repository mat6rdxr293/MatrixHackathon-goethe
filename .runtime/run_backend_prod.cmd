@echo off
cd /d "C:\Users\matve\Desktop\MatrixAIHackathon-goethe\backend"
set "NODE_ENV=production"
set "ENV_FILE=.env.production"
set "PORT=777"
set "BACKEND_HOST=0.0.0.0"
set "FRONTEND_PORT=444"
set "CORS_ORIGIN=https://localhost:444,https://matrix-host.ru:444,https://vite.matrix-host.ru:444"
set "BACKEND_PROTOCOL=https"
set "BACKEND_HTTPS_CERT_PATH=C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend\.certs\fullchain.pem"
set "BACKEND_HTTPS_KEY_PATH=C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend\.certs\privkey.pem"
set "LOCAL_LLM_ENABLED=true"
set "LOCAL_LLM_URL=http://127.0.0.1:8009"
npm.cmd run start
