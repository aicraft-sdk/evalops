# EvalOps

**"SonarQube for AI"** — a production-ready platform for evaluating, monitoring, and enforcing quality gates on LLM-based features.

EvalOps lets you run structured evaluations against prompts, datasets, and agents, enforce pass/fail policies, track costs and drift over time, and ship LLM changes with confidence.

---

## Architecture

EvalOps is an Nx monorepo built as four NestJS microservices plus a React frontend and a Python worker, communicating through a single API Gateway.

```
                      Browser
                         │
                    ┌────▼────┐
                    │ Frontend│  React 18 / Vite / Shadcn UI
                    │  :4200  │
                    └────┬────┘
                         │ HTTP
                    ┌────▼────────┐
                    │ API Gateway │  NestJS  :3000
                    └──┬──┬──┬───┘
          ┌────────────┘  │  └──────────────┐
    ┌─────▼────┐   ┌──────▼──────┐   ┌──────▼─────┐
    │   Auth   │   │    Core     │   │ Evaluation  │
    │  :3001   │   │   :3002     │   │   :3003     │
    └──────────┘   └──────┬──────┘   └─────────────┘
                           │
                    (integration + analytics
                     libs mounted on core)
                           │
    ┌──────────────────────▼──────────────────────┐
    │          PostgreSQL + Redis                  │
    └───────────────────────────────────────────────┘
```


### Services

| Service               | Port | Responsibility                                     |
| --------------------- | ---- | -------------------------------------------------- |
| `api-gateway`         | 3000 | Request routing, CORS, JWT auth enforcement + forwarding |
| `auth-service`        | 3001 | Users, organizations, JWT auth, RBAC               |
| `core-service`        | 3002 | Prompts, datasets, agents, eval specs, templates, Azure Blob artifacts, webhooks, alerts, dashboard metrics, cost analytics, audit trail |
| `evaluation-service`  | 3003 | Runs, evaluation engine, policies, trace ingestion |
| `python-worker`       | 5055 | FastAPI service for advanced LLM evaluations       |

### Shared Libraries

| Library              | Purpose                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `libs/shared-db`     | Drizzle ORM schema, migrations, `db` singleton                                                   |
| `libs/shared-auth`   | `JwtAuthGuard`, `RbacGuard`, `ServiceAuthGuard`, `@Roles`, `@Public`                             |
| `libs/shared-common` | `LoggingInterceptor`, `TenantInterceptor`, `RedisModule`, `HttpClientService`, `initTelemetry()` |
| `libs/sdk`           | Client SDK for trace event ingestion from agents                                                 |
| `libs/evaluators`    | `ExactEvaluator`, `RuleEvaluator`, `Aggregator` — pure TypeScript evaluator logic                |
| `libs/agent-md`      | Parser for the AgentMD YAML format                                                               |

---

## Key Features

- **Multi-provider AI support** — OpenAI, Azure OpenAI, Anthropic, Gemini, xAI
- **Evaluation engine** — exact match, rule-based, LLM-as-judge, RAG evaluators, safety checks
- **Policy engine** — define pass/warn/fail gates; block deployments that miss thresholds
- **Agent management** — define agents in AgentMD (YAML front-matter), version them, run evals against specific versions
- **Trace event ingestion** — SDK instruments agents in-flight; events stream to `runs.trace_events` JSONB
- **Artifact storage** — Azure Blob Storage with SAS URL download, SHA-256 content hashing
- **Cost analytics** — per-run token cost tracking across providers
- **Audit trail** — every mutation logged with user, org, and timestamp
- **Row Level Security** — PostgreSQL RLS enforces org-level data isolation
- **OpenTelemetry** — OTLP gRPC traces exported to any OTel-compatible collector

---

## Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Run the setup script (checks prerequisites, generates secrets, starts Docker, runs migrations)
npm run setup

# Then start the application:
npm run quick-start    # Uses Tilt if available, otherwise manual start
# OR
tilt up               # If Tilt is installed
# OR
npm run dev           # Manual start without Tilt
```

### Option 2: Manual Setup

See **[docs/SETUP.md](docs/SETUP.md)** for detailed setup instructions or **[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)** for the full local development guide.

**TL;DR:**

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — set JWT_SECRET, SERVICE_SECRET and at least one AI provider key

# 3. Start Postgres + Redis via Docker
docker run -d --name evalops-postgres -p 5432:5432 \
  -e POSTGRES_DB=evalops -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  postgres:15-alpine

docker run -d --name evalops-redis -p 6379:6379 redis:7-alpine

# 4. Run database migrations
npm run db:push

# 5. Start all services
tilt up          # Recommended: Tilt dev dashboard at http://localhost:10350
# OR
npm run dev      # All services in parallel
```

Access points:

- Frontend: http://localhost:4200
- API Gateway: http://localhost:3000
- Swagger docs: http://localhost:3000/api/docs (and each service on its port)

---

## Project Structure

```
evalops/
├── apps/
│   ├── frontend/              # React 18 + Vite + Shadcn UI
│   ├── api-gateway/           # NestJS — routing proxy (port 3000)
│   ├── auth-service/          # NestJS — auth + users (port 3001)
│   ├── core-service/          # NestJS — core data, integrations, analytics (port 3002)
│   └── evaluation-service/    # NestJS — evals + runs (port 3003)
├── libs/
│   ├── shared-db/             # Drizzle schema + migrations
│   ├── shared-auth/           # Guards, decorators, RBAC
│   ├── shared-common/         # Interceptors, Redis, OTel, HTTP client
│   ├── sdk/                   # Trace ingestion client
│   ├── evaluators/            # TypeScript evaluator logic
│   └── agent-md/              # AgentMD parser
├── python_worker/             # FastAPI advanced evaluations (port 5055)
├── helm/evalops/              # Helm chart for Kubernetes
├── .github/workflows/         # GitHub Actions CI/CD
├── docs/                      # Documentation
├── Tiltfile                   # Tilt local dev config
└── docker-compose.tilt.yml    # Docker Compose for infra
```

---

## API Overview

All routes go through the API Gateway on port 3000.

| Prefix               | Service             | Example endpoints                                                               |
| -------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `/api/auth/*`        | auth-service        | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/user`         |
| `/api/core/*`        | core-service        | `GET /api/core/prompts`, `POST /api/core/agents`, `GET /api/core/eval-specs`    |
| `/api/evaluation/*`  | evaluation-service  | `POST /api/evaluation/runs`, `POST /api/evaluation/ingestion/events`, `POST/PUT/DELETE /api/evaluation/policies` (org_admin/admin) |
| `/api/integration/*` | core-service        | `GET /api/integration/artifacts/:runId/:file`, `POST /api/integration/webhooks` |
| `/api/analytics/*`   | core-service        | `GET /api/analytics/dashboard`, `GET /api/analytics/audit-trail`                |

> `integration-service` and `analytics-service` have been fully decommissioned and removed from
> the repo. Their functionality was relocated into `libs/core-integration` and `libs/core-analytics`,
> both mounted on `core-service`, which the gateway now routes `/api/integration/*` and
> `/api/analytics/*` to.

Interactive Swagger docs are available at `/api/docs` on each service port.

---

## Authentication

All endpoints (except `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, and health checks) require a JWT Bearer token.

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"Password123!"}'

# Login → get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"Password123!"}'

# Use token
curl http://localhost:3000/api/core/prompts \
  -H "Authorization: Bearer <token>"
```

---

## Development Commands

```bash
npm run dev            # Start all services concurrently
npm test               # Run all tests
npm run test:unit      # Run unit tests only
npm run test:e2e       # Run integration/E2E tests only
npm run build          # Build all apps
npx nx test sdk        # Test a specific library
npx nx serve core-service   # Start one service

# Database
npx drizzle-kit generate   # Generate migration SQL from schema
npx drizzle-kit push       # Push schema to DB directly (dev only)
npx drizzle-kit studio     # Open Drizzle Studio (DB GUI)
```

## Testing

### Running Tests Locally

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration/E2E tests only
npm run test:e2e

# Run tests for a specific service
nx test evaluation-service

# Run tests with coverage
npm test -- --coverage

# Watch mode for development
nx test evaluation-service --watch
```

### Testing Features End-to-End

1. **Start all services**:

   ```bash
   npm run dev
   # OR
   tilt up
   ```

2. **Access the application**:

   - Frontend: http://localhost:4200
   - API Gateway: http://localhost:3000
   - Swagger Docs: http://localhost:3000/api/docs

3. **Test evaluation workflow**:
   - Register/login via UI or API
   - Create a dataset with test samples
   - Create a prompt
   - Create an eval spec linking dataset + prompt
   - Run an evaluation
   - View results in the UI

See **[docs/TESTING.md](docs/TESTING.md)** for comprehensive testing instructions, including unit tests, integration tests, E2E tests, and manual testing workflows.

---

## Environment Variables

See [`.env.example`](.env.example) for the full reference. Minimum required:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evalops
JWT_SECRET=<random 32+ char string>
SERVICE_SECRET=<random 32+ char string>
OPENAI_API_KEY=sk-...   # or AZURE_OPENAI_API_KEY
```

See [`docs/SECRETS.md`](docs/SECRETS.md) for production secrets management with Kubernetes and Azure Key Vault.

---

## Deployment

- **Docker**: Each service has a multi-stage `Dockerfile` in its `apps/<service>/` directory
- **Kubernetes + Helm**: See [`helm/evalops/`](helm/evalops/) — includes Bitnami Postgres + Redis sub-charts
- **CI/CD**: See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — lint → test → build → Docker push → Helm deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for step-by-step deployment instructions.

---

## Documentation

| Doc                                                  | Description                          |
| ---------------------------------------------------- | ------------------------------------ |
| [`docs/LOCAL_DEV.md`](docs/LOCAL_DEV.md)             | Full local development guide         |
| [`docs/SETUP.md`](docs/SETUP.md)                     | Step-by-step setup instructions      |
| [`docs/TESTING.md`](docs/TESTING.md)                 | Comprehensive testing guide          |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)       | Detailed architecture decisions      |
| [`docs/SECRETS.md`](docs/SECRETS.md)                 | Production secrets management        |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)           | Kubernetes / Docker deployment       |
| [`docs/MIGRATION.md`](docs/MIGRATION.md)             | Migration notes from Replit monolith |
| [`docs/SANDBOX_TESTING.md`](docs/SANDBOX_TESTING.md) | OpenSandbox integration testing      |

---

## License

MIT
