# Aqbobek Lyceum Portal (MVP)

Unified school portal MVP with:
- role-based cabinets (`student`, `teacher`, `parent`, `admin`)
- academic dashboard and progress dynamics
- achievements and leaderboard
- events/news
- AI Mentor summaries/recommendations
- predictive risk analytics + class AI report generation
- admin analytics/users/content management
- smart schedule generation + automatic teacher absence replanning
- targeted notifications feed for roles/classes
- fullscreen kiosk mode
- BilimClass integration adapter with database fallback
- polished jury-ready UI (cards/tables/filters/actions, no raw JSON blocks)
- built-in i18n interface switch: Russian (`RU`) and Kazakh (`KZ`)

## Stack
- Frontend: `React + TypeScript + Vite`
- UI/UX: `lucide-react` icons, `recharts` charts, `framer-motion` page transitions
- Backend: `Node.js + Express + TypeScript`

## Quick Start
### Option A: Windows .bat scripts
1. Run setup:
```bat
setup_project.bat
```

2. Start both services:
```bat
start_dev.bat
```

3. Production-like run (frontend + backend HTTPS):
```bat
start_prod.bat
```
By default, the script looks for TLS files:
- `frontend/.cert/localhost.pem` + `frontend/.cert/localhost-key.pem`
- or `frontend/.cert/cert.pem` + `frontend/.cert/key.pem`
- or `frontend/.cert/fullchain.pem` + `frontend/.cert/privkey.pem`
- or legacy `frontend/.cert/localhost.crt` + `frontend/.cert/localhost.key`

If they are missing, it auto-generates a local `.pfx` certificate and uses it for both services.

### Option B: Manual commands
1. Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

2. Configure backend env
```bash
cd backend
copy .env.example .env
```

3. Run backend
```bash
cd backend
npm run dev
```

4. Run frontend
```bash
cd frontend
npm run dev
```

Frontend opens at `http://localhost:5173`, backend at `http://localhost:4000`.

## Accounts
- Предустановленные аккаунты отключены.
- Пользователи, классы, достижения и профили успеваемости читаются из базы данных.

## API Highlights
- Auth: `POST /api/auth/login`, `GET /api/auth/me`
- Portal: `GET /api/dashboard`, `GET /api/progress`, `GET /api/achievements`, `GET /api/events`, `GET /api/ai-mentor`
- AI chat assistant: `POST /api/ai-chat` (`message`, optional `history`)
- Predictions: `GET /api/predictions`
- Teacher AI report: `GET /api/teacher/class-report?classId=10A`
- Schedule: `GET /api/schedule`
- Notifications: `GET /api/notifications`
- Kiosk: `GET /api/kiosk`
- Admin: `GET /api/admin/analytics`, `GET /api/admin/users`, `GET /api/admin/content`, `POST /api/admin/content`
- Admin schedule: `GET /api/admin/schedule`, `POST /api/admin/schedule/generate`, `POST /api/admin/schedule/teacher-absence`
- BilimClass integration points:
  - `GET /api/integrations/bilimclass/status`
  - `GET /api/integrations/bilimclass/students`

## BilimClass Integration Mode
Integration now works in `live-first` mode.

In `backend/.env`:
- `USE_REAL_BILIMCLASS=true` enables live requests to BilimClass
- `BILIMCLASS_BASE_URL` and `BILIMCLASS_TOKEN` are required for real sync
- `BILIMCLASS_STUDENT_PROFILES_PATHS` lets you set one or multiple API paths
- `BILIMCLASS_TIMEOUT_MS` controls request timeout
- If BilimClass is temporarily unavailable, the backend reads already synced profiles from the database
