# Tilt.dev Setup Guide

Tilt.dev provides a unified development environment for managing all EvalOps services with hot reload, smart rebuilds, and a web-based dashboard.

## Prerequisites

1. **Install Tilt**: [Download Tilt](https://docs.tilt.dev/install.html)

   ```bash
   # macOS
   brew install tilt-dev/tap/tilt

   # Linux
   curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash

   # Windows
   # Download from https://github.com/tilt-dev/tilt/releases
   ```

2. **Docker**: Required for PostgreSQL and Redis containers

   - [Install Docker Desktop](https://www.docker.com/products/docker-desktop)

3. **Node.js 20.x+**: Already required for the project

4. **Python 3.9+**: Required for the Python worker (optional if not using advanced evaluations)

## Quick Start

### 1. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env - ensure these are set for Tilt:
# DATABASE_URL=postgresql://postgres:postgres@postgres:5432/evalops
# REDIS_HOST=redis
# REDIS_PORT=6379
```

**Important**: When using Tilt, the `DATABASE_URL` and `REDIS_HOST` should point to the Docker container names (`postgres` and `redis`), not `localhost`. Tilt will handle the networking.

### 2. Start All Services

```bash
# Option 1: Using npm script
npm run tilt:up

# Option 2: Direct Tilt command
tilt up
```

This will:

- Start PostgreSQL and Redis containers
- Start all 7 Node.js services (frontend + 6 microservices)
- Start the Python worker
- Open the Tilt UI at http://localhost:10350

### 3. Access the Application

Once all services are running (green in Tilt UI):

- **Frontend**: http://localhost:4200
- **API Gateway**: http://localhost:3000
- **Tilt UI**: http://localhost:10350

### 4. Stop All Services

```bash
# Option 1: Using npm script
npm run tilt:down

# Option 2: Direct Tilt command
tilt down
```

## Tilt UI Features

The Tilt UI (http://localhost:10350) provides:

- **Service Status**: See which services are running, building, or have errors
- **Logs**: View logs for each service in real-time
- **Resource Management**: Restart individual services without affecting others
- **File Watching**: See which files triggered rebuilds
- **Performance Metrics**: Monitor resource usage

## Service Management

### Restart a Single Service

In the Tilt UI:

1. Click on the service name
2. Click "Trigger Update" to restart it

Or via command line:

```bash
tilt trigger <service-name>
```

### View Service Logs

In the Tilt UI:

1. Click on the service name
2. View logs in the bottom panel

Or via command line:

```bash
tilt logs <service-name>
```

### Available Services

- `frontend` - React frontend application
- `api-gateway` - API Gateway service
- `auth-service` - Authentication service
- `core-service` - Core business logic service
- `evaluation-service` - Evaluation engine service
- `integration-service` - Integration and webhooks service
- `analytics-service` - Analytics service
- `python-worker` - Python FastAPI worker
- `postgres` - PostgreSQL database (Docker)
- `redis` - Redis cache (Docker)

## Development Workflow

### Making Changes

1. **Edit Code**: Make changes to any service
2. **Automatic Reload**: Tilt detects changes and rebuilds/restarts the affected service
3. **View Results**: Check the Tilt UI to see build status and logs

### Hot Reload

All services support hot reload:

- **Frontend**: Vite HMR (Hot Module Replacement)
- **Node.js Services**: Nx watch mode with automatic restarts
- **Python Worker**: Uvicorn reload mode

### Database Migrations

After starting services, run database migrations:

```bash
npm run db:push
```

This only needs to be run once, or when the schema changes.

## Troubleshooting

### Services Not Starting

1. **Check Tilt UI**: Look for error messages in the service logs
2. **Check Ports**: Ensure ports are not already in use
   ```bash
   # Check if ports are in use
   lsof -i :3000  # API Gateway
   lsof -i :4200  # Frontend
   lsof -i :5432  # PostgreSQL
   lsof -i :6379  # Redis
   ```

### Database Connection Issues

1. **Check PostgreSQL Container**: Ensure it's running and healthy in Tilt UI
2. **Verify DATABASE_URL**: Should be `postgresql://postgres:postgres@postgres:5432/evalops`
3. **Check Network**: Services should be able to reach the `postgres` container

### Redis Connection Issues

1. **Check Redis Container**: Ensure it's running and healthy in Tilt UI
2. **Verify REDIS_HOST**: Should be `redis` (not `localhost`)
3. **Check Network**: Services should be able to reach the `redis` container

### Python Worker Not Starting

1. **Check Python Version**: Ensure Python 3.9+ is installed

   ```bash
   python3 --version
   ```

2. **Install Dependencies**:

   ```bash
   cd python_worker
   pip install -r requirements.txt
   ```

3. **Virtual Environment**: If using a venv, ensure it's in `python_worker/.venv/`

### Tilt Not Detecting Changes

1. **Check .tiltignore**: Ensure your files aren't being ignored
2. **File Permissions**: Ensure Tilt has read access to source files
3. **Restart Tilt**: Sometimes a restart helps:
   ```bash
   tilt down
   tilt up
   ```

## Advanced Usage

### Running Specific Services

You can comment out services in the `Tiltfile` to run only what you need:

```python
# frontend_service()  # Comment out to disable
# node_service('api-gateway', 3000)  # Comment out to disable
```

### Custom Environment Variables

Add service-specific environment variables in the `Tiltfile`:

```python
env_vars['CUSTOM_VAR'] = 'value'
```

### Resource Dependencies

Services automatically wait for dependencies:

- All Node.js services wait for `postgres` and `redis`
- Frontend and Python worker start independently

## Comparison with `npm run dev`

| Feature                | `npm run dev`  | Tilt.dev            |
| ---------------------- | -------------- | ------------------- |
| **Service Management** | All or nothing | Individual control  |
| **Visibility**         | Terminal logs  | Web UI dashboard    |
| **Dependencies**       | Manual setup   | Automatic (Docker)  |
| **Rebuild Speed**      | Rebuilds all   | Smart incremental   |
| **Debugging**          | Terminal only  | UI + logs           |
| **Resource Usage**     | All processes  | Per-service metrics |

## Best Practices

1. **Use Tilt UI**: Monitor services through the web UI for better visibility
2. **Check Logs**: Use Tilt UI logs instead of terminal for cleaner output
3. **Restart Services**: Use Tilt UI to restart individual services during development
4. **Database Migrations**: Run `npm run db:push` after schema changes
5. **Clean Up**: Use `tilt down` to stop all services and clean up containers

## Additional Resources

- [Tilt Documentation](https://docs.tilt.dev/)
- [Tilt Examples](https://github.com/tilt-dev/tilt-examples)
- [EvalOps Architecture](./ARCHITECTURE.md)
- [EvalOps Quick Start](./QUICK_START.md)
