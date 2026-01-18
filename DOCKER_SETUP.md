# Docker Setup (macOS)

This repo includes Docker Compose files for running the full stack:

- Frontend (Next.js): `http://localhost:3000`
- Bridge (FastAPI): `http://localhost:3001` (docs at `/docs`)
- Backend (FastMCP SSE): `http://localhost:8000/sse`
- Ollama: `http://localhost:11434`

## 1) Install Docker Desktop

- Install Docker Desktop for Mac: https://www.docker.com/products/docker-desktop/
- Ensure `docker` and `docker compose` work:
  - `docker --version`
  - `docker compose version`

## 2) Configure environment (.env)

Create/edit the root `.env` file (project root). Minimum required:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Optional:

```env
TAVILY_API_KEY=your-tavily-api-key
OLLAMA_MODEL=llama3.2:3b
# If you want to point at an external Ollama:
# OLLAMA_BASE_URL=http://host.docker.internal:11434
```

## 3) Run (production-ish)

```bash
docker compose up --build -d

docker compose ps
```

## 4) Run (development with hot reload)

```bash
docker compose -f docker-compose.dev.yml up --build
```

This publishes:
- bridge on `localhost:3001`
- backend on `localhost:8000`
- ollama on `localhost:11434`

## 5) Using host Ollama instead of Docker Ollama (recommended if you already run it)

1. Start Ollama on your Mac:

```bash
ollama serve
```

2. Set in root `.env`:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

3. In `docker-compose.yml` / `docker-compose.dev.yml`, you can comment out the `ollama` service (optional).

## Troubleshooting

- Ports already in use:
  - Stop local processes on `3000/3001/8000/11434` or change port mappings in compose.
- Backend healthcheck:
  - The backend uses FastMCP over SSE, so `/docs` is not available; use `/sse`.
- Supabase auth issues:
  - Ensure your Supabase redirect URLs include `http://localhost:3000/auth/callback`.
