# EvalOps Setup Guide

Complete step-by-step guide for setting up EvalOps locally.

## Prerequisites

| Requirement | Version           | Installation                                     |
| ----------- | ----------------- | ------------------------------------------------ |
| Node.js     | 20.x or later     | [nodejs.org](https://nodejs.org)                 |
| npm         | 10.x or later     | Bundled with Node.js                             |
| Docker      | 24.x or later     | [docker.com](https://www.docker.com/get-started) |
| Python      | 3.11+ (optional)  | Only needed for Python worker                    |
| uv          | Latest (optional) | Only needed for OpenSandbox server               |

**Optional but recommended:**

- **Tilt** — unified dev dashboard: [docs.tilt.dev/install](https://docs.tilt.dev/install.html)

## Quick Setup (Automated)

The easiest way to get started:

```bash
# Run automated setup script
npm run setup

# Start the application
npm run quick-start
```

The setup script will:

1. ✅ Check prerequisites (Node.js, Docker, Python)
2. ✅ Create `.env` file from `.env.example` if needed
3. ✅ Generate `JWT_SECRET` and `SERVICE_SECRET` if missing
4. ✅ Configure database and Redis URLs for Tilt
5. ✅ Install npm dependencies
6. ✅ Start Docker containers (PostgreSQL + Redis)
7. ✅ Run database migrations

## Manual Setup

If you prefer to set up manually or need more control:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env
```

Edit `.env` and set the following **required** variables:

```env
# Generate secrets (run these commands):
# openssl rand -hex 32  # For JWT_SECRET
# openssl rand -hex 32  # For SERVICE_SECRET

JWT_SECRET=<your-generated-secret-32-chars-min>
SERVICE_SECRET=<your-generated-secret-32-chars-min>

# Database (for Tilt - recommended)
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/evalops
REDIS_HOST=localhost
REDIS_PORT=16379

# Database (for manual Docker setup)
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evalops
# REDIS_HOST=localhost
# REDIS_PORT=6379

# At least one AI provider key (required for evaluations)
OPENAI_API_KEY=sk-...
# OR
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
```

### Step 3: Start Infrastructure

**Option A: Using Tilt (Recommended)**

```bash
# Install Tilt
# macOS:
brew install tilt-dev/tap/tilt

# Linux:
curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash

# Start Tilt (this will start Postgres + Redis automatically)
tilt up
```

**Option B: Manual Docker**

```bash
# Start PostgreSQL
docker run -d --name evalops-postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=evalops \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:15-alpine

# Start Redis
docker run -d --name evalops-redis \
  -p 6379:6379 \
  redis:7-alpine

# Verify containers are running
docker ps --filter "name=evalops"
```

### Step 4: Run Database Migrations

```bash
npm run db:push
```

This creates all necessary tables in your PostgreSQL database.

### Step 5: Start Services

**Option A: Using Tilt**

```bash
tilt up
```

Open the Tilt dashboard at **http://localhost:10350** to see all services.

**Option B: Manual Start**

```bash
# Start all services in parallel
npm run dev

# Or start individually:
npm run dev:frontend      # Port 4200
npm run dev:gateway       # Port 3000
npm run dev:auth          # Port 3001
npm run dev:core          # Port 3002
npm run dev:evaluation    # Port 3003
npm run dev:integration   # Port 3004
npm run dev:analytics     # Port 3005
```

### Step 6: Start Python Worker (Optional)

The Python worker is only needed for advanced evaluation features (LLM-as-judge, custom evaluators).

```bash
cd python_worker
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5055 --reload
```

### Step 7: Start OpenSandbox Server (Optional)

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

## Verify Setup

### Check Service Health

```bash
# API Gateway
curl http://localhost:3000/health

# Individual services
curl http://localhost:3001/health  # Auth
curl http://localhost:3002/health  # Core
curl http://localhost:3003/health  # Evaluation
curl http://localhost:3004/health  # Integration
curl http://localhost:3005/health  # Analytics
```

### Register First User

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

Save the returned `accessToken` for authenticated requests.

Or simply open **http://localhost:4200** and register through the UI.

## Access Points

| Service                     | URL                            | Description            |
| --------------------------- | ------------------------------ | ---------------------- |
| Frontend                    | http://localhost:4200          | React UI               |
| API Gateway                 | http://localhost:3000          | Main API endpoint      |
| API Gateway Swagger         | http://localhost:3000/api/docs | API documentation      |
| Auth Service Swagger        | http://localhost:3001/api/docs | Auth API docs          |
| Core Service Swagger        | http://localhost:3002/api/docs | Core API docs          |
| Evaluation Service Swagger  | http://localhost:3003/api/docs | Evaluation API docs    |
| Integration Service Swagger | http://localhost:3004/api/docs | Integration API docs   |
| Analytics Service Swagger   | http://localhost:3005/api/docs | Analytics API docs     |
| Python Worker               | http://localhost:5055/docs     | Python worker API docs |
| OpenSandbox Server          | http://localhost:8080          | OpenSandbox API        |
| Tilt Dashboard              | http://localhost:10350         | Tilt dev dashboard     |

## Troubleshooting

### Prerequisites Check Failed

Run the validation script to see what's missing:

```bash
npm run setup:check
```

### Database Connection Issues

**With Tilt:**

- Ensure `.env` has `DATABASE_URL=postgresql://postgres:postgres@localhost:15432/evalops`
- Check Tilt dashboard shows PostgreSQL as healthy

**Without Tilt:**

- Ensure `.env` has `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evalops`
- Verify container is running: `docker ps --filter name=evalops-postgres`
- Test connection: `docker exec evalops-postgres pg_isready -U postgres`

### Redis Connection Issues

**With Tilt:**

- Ensure `.env` has `REDIS_HOST=localhost` and `REDIS_PORT=16379`
- Check Tilt dashboard shows Redis as healthy

**Without Tilt:**

- Ensure `.env` has `REDIS_HOST=localhost` and `REDIS_PORT=6379`
- Verify container is running: `docker ps --filter name=evalops-redis`
- Test connection: `docker exec evalops-redis redis-cli ping`

### Missing Environment Variables

The setup script will generate `JWT_SECRET` and `SERVICE_SECRET` automatically. If you need to regenerate them:

```bash
npm run setup:secrets
```

Then manually add the output to your `.env` file.

### Port Already in Use

If a port is already in use:

```bash
# Find process using port
lsof -ti :3000 | xargs kill -9   # Replace 3000 with your port

# Or use different ports in .env
PORT=3010  # Override for a specific service
```

### Services Won't Start

1. Check logs: `npm run dev` will show errors
2. Verify `.env` file exists and has required variables
3. Ensure Docker containers are running
4. Run `npm run setup:check` to validate prerequisites

### Database Migration Fails

```bash
# Reset database (WARNING: deletes all data)
docker stop evalops-postgres
docker rm evalops-postgres
docker volume rm postgres_data

# Recreate and migrate
npm run setup
```

## Environment Variables Reference

### Required

| Variable         | Example                                                  | Description                    |
| ---------------- | -------------------------------------------------------- | ------------------------------ |
| `DATABASE_URL`   | `postgresql://postgres:postgres@localhost:15432/evalops` | PostgreSQL connection string   |
| `JWT_SECRET`     | `openssl rand -hex 32`                                   | JWT signing secret (32+ chars) |
| `SERVICE_SECRET` | `openssl rand -hex 32`                                   | Service-to-service auth token  |

### AI Providers (at least one required)

| Variable                       | Description                          |
| ------------------------------ | ------------------------------------ |
| `OPENAI_API_KEY`               | OpenAI API key (`sk-...`)            |
| `AZURE_OPENAI_API_KEY`         | Azure OpenAI API key                 |
| `AZURE_OPENAI_ENDPOINT`        | Azure OpenAI endpoint URL            |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Model deployment name (e.g. `gpt-4`) |
| `ANTHROPIC_API_KEY`            | Anthropic API key                    |
| `GEMINI_API_KEY`               | Google Gemini API key                |

### Optional

| Variable                      | Default                           | Description                      |
| ----------------------------- | --------------------------------- | -------------------------------- |
| `REDIS_HOST`                  | `localhost`                       | Redis hostname                   |
| `REDIS_PORT`                  | `16379` (Tilt) or `6379` (manual) | Redis port                       |
| `REDIS_PASSWORD`              | _(empty)_                         | Redis password (if auth enabled) |
| `JWT_EXPIRES_IN`              | `24h`                             | JWT token lifetime               |
| `PYTHON_WORKER_URL`           | `http://localhost:5055`           | Python worker base URL           |
| `OPENSANDBOX_SERVER_URL`      | `http://localhost:8080`           | OpenSandbox server URL           |
| `OPENSANDBOX_API_KEY`         | _(required if using OpenSandbox)_ | OpenSandbox API key              |
| `OPENSANDBOX_DEFAULT_CPU`     | `1.0`                             | Default CPU limit per sandbox    |
| `OPENSANDBOX_DEFAULT_MEMORY`  | `512Mi`                           | Default memory limit             |
| `OPENSANDBOX_DEFAULT_TIMEOUT` | `300`                             | Default timeout in seconds       |
| `OPENSANDBOX_MAX_CONCURRENT`  | `10`                              | Max concurrent sandboxes         |

## Next Steps

After setup is complete:

1. **Register your first user** (see above)
2. **Create a dataset** via API or UI
3. **Create a prompt** via API or UI
4. **Create an eval spec** linking dataset + prompt
5. **Run an evaluation** and view results

See **[docs/LOCAL_DEV.md](LOCAL_DEV.md)** for detailed development workflows.

## Additional Resources

- **[LOCAL_DEV.md](LOCAL_DEV.md)** - Full local development guide
- **[OPENSANDBOX_SETUP.md](OPENSANDBOX_SETUP.md)** - OpenSandbox server setup guide
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Architecture decisions
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide
- **[SECRETS.md](SECRETS.md)** - Secrets management
