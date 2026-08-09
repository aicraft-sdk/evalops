# EvalOps Deployment Guide

## Overview

EvalOps uses a microservices architecture with 6 NestJS services plus a React frontend. This guide covers deployment strategies for development and production.

## Prerequisites

- Node.js 20.x or later
- PostgreSQL database (Neon Serverless recommended)
- Redis (for BullMQ message queues)
- Docker (optional, for containerized deployment)

## Local Development

### Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Push database schema
npm run db:push

# Start all services
npm run dev
```

### Running Services Individually

```bash
# Frontend
nx serve frontend

# API Gateway
nx serve api-gateway

# Microservices
nx serve auth-service
nx serve core-service
nx serve evaluation-service
```

## Docker Deployment

### Docker Compose (Recommended for Local Testing)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: evalops
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api-gateway:
    build:
      context: .
      dockerfile: apps/api-gateway/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/evalops
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - postgres
      - redis

  auth-service:
    build:
      context: .
      dockerfile: apps/auth-service/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/evalops
    depends_on:
      - postgres

  # Add other services similarly...
```

### Building Docker Images

```bash
# Build all services
docker-compose build

# Run all services
docker-compose up
```

## Production Deployment

### Environment Variables

Each service needs the following environment variables:

**All Services**:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret (must be the same across all services)
- `NODE_ENV=production`

**API Gateway**:
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins
- `AUTH_SERVICE_URL`, `CORE_SERVICE_URL`, etc. - URLs of downstream services

**Auth Service**:
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (optional)

**Evaluation Service**:
- `AZURE_OPENAI_API_KEY` or `OPENAI_API_KEY`
- `PYTHON_WORKER_URL` (if using Python worker)

**Integration Service**:
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### Deployment Options

#### Option 1: Platform-as-a-Service (PaaS)

**Railway, Render, Fly.io**:
1. Deploy each service as a separate application
2. Configure environment variables
3. Set up shared PostgreSQL database
4. Set up Redis instance
5. Configure service URLs in API Gateway

#### Option 2: Kubernetes

1. Create Kubernetes deployments for each service
2. Use ConfigMaps for configuration
3. Use Secrets for sensitive data
4. Set up service discovery (Kubernetes Services)
5. Configure ingress for API Gateway

#### Option 3: Cloud Functions/Serverless

**AWS Lambda, Google Cloud Functions, Azure Functions**:
- Each service as a separate function
- Use API Gateway or Cloud Load Balancer for routing
- Consider cold start implications

### Health Checks

All services expose `/health` endpoints:

```bash
# Check API Gateway
curl http://localhost:3000/health

# Check individual services
curl http://localhost:3001/health  # Auth Service
curl http://localhost:3002/health  # Core Service
# etc.
```

### Monitoring

Recommended monitoring:
- Application logs (structured logging)
- Health check endpoints
- Database connection pooling
- Redis connection status
- Service-to-service latency

### Scaling

Services can be scaled independently:

- **API Gateway**: Scale based on incoming request volume
- **Evaluation Service**: Scale based on evaluation run queue
- **Integration Service**: Scale based on webhook volume
- **Analytics Service**: Scale based on query load

Use a load balancer (e.g., Nginx, AWS ALB) in front of multiple instances.

## Database Migration

```bash
# Push schema changes
npm run db:push

# Or use Drizzle Kit migrations
npx drizzle-kit migrate
```

## Troubleshooting

### Service Not Starting

1. Check environment variables
2. Verify database connection
3. Check port availability
4. Review service logs

### Inter-Service Communication Failing

1. Verify service URLs in environment variables
2. Check network connectivity
3. Verify JWT token is being forwarded
4. Check service health endpoints

### Database Connection Issues

1. Verify `DATABASE_URL` is correct
2. Check database is accessible
3. Verify connection pooling settings
4. Check for connection limits

