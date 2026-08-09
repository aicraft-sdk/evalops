# Local Development Guide

This guide walks you through running EvalOps on your local machine from scratch.

---

## Prerequisites

| Requirement | Version       | Notes                                     |
| ----------- | ------------- | ----------------------------------------- |
| Node.js     | 20.x or later | [nodejs.org](https://nodejs.org)          |
| npm         | 10.x or later | Bundled with Node.js                      |
| Docker      | 24.x or later | For Postgres + Redis containers           |
| Python      | 3.11+         | Only needed for the python-worker service |
| uv          | Latest        | Only needed for OpenSandbox server        |
| Git         | Any           |                                           |

Optional but recommended:

- **Tilt** — unified dev dashboard with hot reload: [docs.tilt.dev/install](https://docs.tilt.dev/install.html)

---

## Option A — Tilt (Recommended)

Tilt manages all services, databases, and hot-reload in one command. It starts Postgres and Redis in Docker automatically.

### 1. Install Tilt

```bash
# macOS
brew install tilt-dev/tap/tilt

# Linux
curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash

# Windows — see https://docs.tilt.dev/install.html
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
# Required — generate with: openssl rand -hex 32
JWT_SECRET=<your-random-32-char-string>

# Required — different secret for service-to-service calls
SERVICE_SECRET=<another-random-32-char-string>

# Required — at least one AI provider key
OPENAI_API_KEY=sk-...
# or: AZURE_OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY

# Tilt manages Postgres + Redis containers, so leave these as-is:
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/evalops
REDIS_HOST=localhost
REDIS_PORT=16379
```

> **Note**: The Tiltfile maps Postgres to host port 15432 and Redis to 16379 to avoid conflicts with any local installations.

### 4. Start OpenSandbox server (optional, if using custom evaluators)

OpenSandbox is required for secure code execution. Start it before Tilt:

```bash
# Install if not already installed
uv pip install opensandbox-server

# Initialize config (first time only)
opensandbox-server init-config ~/.sandbox.toml --example docker

# Edit ~/.sandbox.toml and set api_key (generate with: openssl rand -hex 32)
# Add OPENSANDBOX_API_KEY to .env matching the api_key in ~/.sandbox.toml

# Start server
opensandbox-server start
```

See **[OPENSANDBOX_SETUP.md](OPENSANDBOX_SETUP.md)** for detailed setup instructions.

### 5. Start everything

```bash
tilt up
```

Open the Tilt dashboard at **http://localhost:10350** to see all services and their logs.

### 6. Run database migrations (first time only)

Wait for the `postgres` resource in Tilt to show green (healthy), then:

```bash
npx drizzle-kit push
```

### 7. Access the application

| Service                     | URL                            |
| --------------------------- | ------------------------------ |
| Frontend                    | http://localhost:4200          |
| API Gateway                 | http://localhost:3000          |
| API Gateway Swagger         | http://localhost:3000/api/docs |
| Auth Service Swagger        | http://localhost:3001/api/docs |
| Core Service Swagger        | http://localhost:3002/api/docs |
| Evaluation Service Swagger  | http://localhost:3003/api/docs |
| Python Worker               | http://localhost:5055/docs     |
| OpenSandbox Server          | http://localhost:8080          |
| Tilt Dashboard              | http://localhost:10350         |

### Stopping Tilt

```bash
tilt down   # Stops all services but keeps Docker containers
# OR press Ctrl+C in the Tilt terminal
```

---

## Option B — Manual (without Tilt)

### 1. Start Postgres and Redis via Docker

```bash
# PostgreSQL
docker run -d --name evalops-postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=evalops \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:15-alpine

# Redis
docker run -d --name evalops-redis \
  -p 6379:6379 \
  redis:7-alpine
```

Verify they're running:

```bash
docker ps --filter "name=evalops"
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with these values for manual setup:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evalops
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=<random 32+ char string>
SERVICE_SECRET=<random 32+ char string>
OPENAI_API_KEY=sk-...
```

### 4. Run database migrations

```bash
npx drizzle-kit push
```

### 5. Start all services

```bash
npm run dev
```

This starts all services concurrently. Alternatively, start them individually in separate terminals:

```bash
npx nx serve api-gateway       # Port 3000
npx nx serve auth-service      # Port 3001
npx nx serve core-service      # Port 3002
npx nx serve evaluation-service # Port 3003
npx nx run frontend:serve       # Port 4200
```

### 6. Start the Python worker (optional)

The Python worker is only needed for advanced evaluation features (LLM-as-judge, custom evaluators).

```bash
cd python_worker
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 5055 --reload
```

### 7. Start OpenSandbox server (optional)

OpenSandbox is required for secure code execution in custom evaluators. See **[OPENSANDBOX_SETUP.md](OPENSANDBOX_SETUP.md)** for detailed setup instructions.

Quick start:

```bash
# Install OpenSandbox server
uv pip install opensandbox-server

# Initialize configuration
opensandbox-server init-config ~/.sandbox.toml --example docker

# Edit ~/.sandbox.toml and set api_key (generate with: openssl rand -hex 32)
# Add OPENSANDBOX_API_KEY to .env matching the api_key in ~/.sandbox.toml

# Start server
opensandbox-server start
```

Verify it's running:

```bash
curl http://localhost:8080/health
```

---

## First-Time Setup: Create a User

Once the services are running, register your first user:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Password123!",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

The response includes an `accessToken`. Use it in subsequent requests:

```bash
# Example: list prompts
curl http://localhost:3000/api/core/prompts \
  -H "Authorization: Bearer <accessToken>"
```

Or simply open http://localhost:4200 and log in through the UI.

---

## Environment Variables Reference

### Required

| Variable         | Example                                                 | Description                    |
| ---------------- | ------------------------------------------------------- | ------------------------------ |
| `DATABASE_URL`   | `postgresql://postgres:postgres@localhost:5432/evalops` | PostgreSQL connection string   |
| `JWT_SECRET`     | `openssl rand -hex 32`                                  | JWT signing secret (32+ chars) |
| `SERVICE_SECRET` | `openssl rand -hex 32`                                  | Service-to-service auth token  |

### AI Providers (at least one required for evaluations)

| Variable                       | Description                          |
| ------------------------------ | ------------------------------------ |
| `OPENAI_API_KEY`               | OpenAI API key (`sk-...`)            |
| `AZURE_OPENAI_API_KEY`         | Azure OpenAI API key                 |
| `AZURE_OPENAI_ENDPOINT`        | Azure OpenAI endpoint URL            |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Model deployment name (e.g. `gpt-4`) |
| `ANTHROPIC_API_KEY`            | Anthropic API key                    |
| `GEMINI_API_KEY`               | Google Gemini API key                |

### Optional

| Variable                          | Default                 | Description                                           |
| --------------------------------- | ----------------------- | ----------------------------------------------------- |
| `REDIS_HOST`                      | `localhost`             | Redis hostname                                        |
| `REDIS_PORT`                      | `6379`                  | Redis port                                            |
| `REDIS_PASSWORD`                  | _(empty)_               | Redis password (if auth enabled)                      |
| `JWT_EXPIRES_IN`                  | `7d`                    | JWT token lifetime                                    |
| `PYTHON_WORKER_URL`               | `http://localhost:5055` | Python worker base URL                                |
| `OPENSANDBOX_SERVER_URL`          | `http://localhost:8080` | OpenSandbox server URL                                |
| `OPENSANDBOX_API_KEY`             | —                       | OpenSandbox API key (required if using OpenSandbox)   |
| `OPENSANDBOX_DEFAULT_CPU`         | `1.0`                   | Default CPU limit per sandbox                         |
| `OPENSANDBOX_DEFAULT_MEMORY`      | `512Mi`                 | Default memory limit                                  |
| `OPENSANDBOX_DEFAULT_TIMEOUT`     | `300`                   | Default timeout in seconds                            |
| `OPENSANDBOX_MAX_CONCURRENT`      | `10`                    | Max concurrent sandboxes                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`     | `http://localhost:4317` | OTel collector gRPC endpoint                          |
| `AZURE_STORAGE_ACCOUNT_NAME`      | —                       | Azure Blob Storage account                            |
| `AZURE_STORAGE_CONTAINER_NAME`    | —                       | Blob container name                                   |
| `AZURE_STORAGE_CONNECTION_STRING` | —                       | Full connection string (alternative to account name)  |
| `CORE_SERVICE_URL`                | `http://localhost:3002` | Used by evaluation-service for artifact notifications |

---

## Database Management

```bash
# Push schema changes directly (development only — skips migration history)
npx drizzle-kit push

# Generate migration SQL files from schema changes
npx drizzle-kit generate

# Apply generated migrations (production-safe)
npx drizzle-kit migrate

# Open Drizzle Studio — browser-based DB GUI at http://localhost:4983
npx drizzle-kit studio
```

The schema lives in `libs/shared-db/src/lib/schema/`. After any schema change, run `npx drizzle-kit push` (dev) or generate+migrate (staging/prod).

---

## Running Tests

```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# Specific library
npx nx test sdk
npx nx test evaluators
npx nx test agent-md

# Specific service
npx nx test evaluation-service
npx nx test auth-service

# Watch mode
npx nx test sdk --watch
```

Test files live alongside source files (`.spec.ts`) and in `__tests__/` directories.

---

## Making Your First Evaluation

Here's a quick end-to-end walkthrough using curl.

### 1. Register and get a token

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Dev123!"}' \
  | jq -r '.accessToken')
```

### 2. Create a dataset

```bash
curl -X POST http://localhost:3000/api/core/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My first dataset",
    "description": "Simple Q&A pairs",
    "samples": [
      {"input": "What is 2 + 2?", "expectedOutput": "4"},
      {"input": "What is the capital of France?", "expectedOutput": "Paris"}
    ]
  }'
```

Save the returned `id` as `DATASET_ID`.

### 3. Create a prompt

```bash
curl -X POST http://localhost:3000/api/core/prompts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple QA prompt",
    "content": "Answer this question concisely: {{input}}",
    "version": "1.0"
  }'
```

Save the returned `id` as `PROMPT_ID`.

### 4. Create an eval spec

```bash
curl -X POST http://localhost:3000/api/core/eval-specs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Basic accuracy test\",
    \"datasetId\": \"$DATASET_ID\",
    \"promptId\": \"$PROMPT_ID\",
    \"evaluators\": [{\"type\": \"exact_match\"}],
    \"modelConfig\": {\"model\": \"gpt-4o-mini\"},
    \"repetitions\": 1
  }"
```

Save the returned `id` as `SPEC_ID`.

### 5. Run the evaluation

```bash
curl -X POST http://localhost:3000/api/evaluation/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"evalSpecId\": \"$SPEC_ID\"}"
```

Open the frontend at http://localhost:4200 → **Evaluations → Runs** to see results.

---

## Troubleshooting

### Services won't start: `JWT_SECRET is required`

Your `.env` file is missing `JWT_SECRET`. Generate one:

```bash
openssl rand -hex 32
```

Add it to `.env`:

```env
JWT_SECRET=<output from above>
```

### `DATABASE_URL` connection refused

Verify Postgres is running:

```bash
docker ps --filter name=evalops-postgres
# If not running:
docker start evalops-postgres
```

Check the port matches your `.env`:

```bash
# With Tilt: port 15432
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/evalops

# Without Tilt: port 5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evalops
```

### `Cannot find module '@evalops/shared-db'`

Run `npm install` — the Nx path aliases are set up via `tsconfig.base.json` but require node_modules to be present.

### Rate limit errors on ingestion (`429 Too Many Requests`)

The ingestion endpoint allows 100 requests/minute per user. In development, if Redis is not running, rate limiting is disabled automatically (fail-open). Start Redis:

```bash
docker start evalops-redis
```

### Nx cache issues / stale builds

```bash
npx nx reset        # Clear Nx computation cache
npm run dev         # Restart
```

### Port already in use

Find and kill the process using a port:

```bash
lsof -ti :3000 | xargs kill -9   # Kill whatever's on port 3000
```

Or set a different port in `.env`:

```env
PORT=3010   # Override for a specific service
```

---

## Project Conventions

### Adding a new API endpoint

1. Add the route to the appropriate service (e.g., `apps/core-service/src/app/`)
2. Follow the module pattern: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`
3. Register the module in the service's `app.module.ts`
4. Add the frontend API route mapping to `apps/frontend/src/lib/api-routes.ts` if the path prefix is new

### Adding a new DB table

1. Add the Drizzle table definition to `libs/shared-db/src/lib/schema/`
2. Export it from `libs/shared-db/src/lib/schema/index.ts`
3. Run `npx drizzle-kit push` in dev or `npx drizzle-kit generate` + `migrate` in staging
4. Export the insert/select types from `libs/shared-db/src/index.ts`

### Service-to-service calls

Use `HttpClientService` from `@evalops/shared-common`. It automatically attaches `X-Service-Token` when `SERVICE_SECRET` is set. Internal endpoints protected by `ServiceAuthGuard` reject calls without a valid token.

```typescript
@Injectable()
export class MyService {
  constructor(private http: HttpClientService, private config: ConfigService) {}

  async callOtherService() {
    const url = this.config.get('CORE_SERVICE_URL') + '/api/prompts';
    return this.http.get<Prompt[]>(url);
  }
}
```
