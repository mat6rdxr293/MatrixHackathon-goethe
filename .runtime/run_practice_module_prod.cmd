@echo off
cd /d "C:\Users\matve\Desktop\MatrixAIHackathon-goethe\practice-module\backend"
"C:\Users\matve\Desktop\MatrixAIHackathon-goethe\practice-module\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 555 --ssl-certfile "C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend\.certs\fullchain.pem" --ssl-keyfile "C:\Users\matve\Desktop\MatrixAIHackathon-goethe\frontend\.certs\privkey.pem"
