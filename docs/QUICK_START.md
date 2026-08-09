# Quick Start Guide

## Prerequisites

Before running the application, ensure you have:

1. **Node.js 20.x or later** - [Download](https://nodejs.org/)
2. **PostgreSQL Database** - Choose one:
   - Local PostgreSQL installation
   - [Neon Serverless](https://neon.tech/) (recommended for development)
   - Any PostgreSQL-compatible database
3. **Redis** (optional but recommended) - For message queues:
   - Local Redis installation
   - [Redis Cloud](https://redis.com/try-free/) (free tier available)
4. **npm or yarn** - Package manager

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration
# At minimum, you need:
# - DATABASE_URL (PostgreSQL connection string)
# - JWT_SECRET (any random string, at least 32 characters)
# - At least one AI provider API key (OPENAI_API_KEY or AZURE_OPENAI_API_KEY)
```

**Minimum Required Variables:**

```env
DATABASE_URL=postgresql://user:password@localhost:5432/evalops
JWT_SECRET=your-random-secret-key-at-least-32-characters-long
OPENAI_API_KEY=sk-...  # Or AZURE_OPENAI_API_KEY
```

### 3. Set Up Database

```bash
# Push the database schema
npm run db:push
```

This will create all necessary tables in your PostgreSQL database.

### 4. Set Up Redis (Optional but Recommended)

**Option A: Local Redis**

```bash
# macOS
brew install redis
brew services start redis

# Linux (Ubuntu/Debian)
sudo apt-get install redis-server
sudo systemctl start redis

# Windows
# Download from https://redis.io/download
```

**Option B: Skip Redis (for basic testing)**

- The application will work without Redis, but webhook delivery will fail
- You can start services without Redis for basic functionality

### 5. Start the Application

**Option A: Start All Services (Recommended)**

```bash
npm run dev
```

This starts:

- Frontend on http://localhost:4200
- API Gateway on http://localhost:3000
- Auth Service on http://localhost:3001
- Core Service on http://localhost:3002
- Evaluation Service on http://localhost:3003

**Option B: Start Services Individually**

```bash
# Terminal 1: Frontend
npm run dev:frontend

# Terminal 2: API Gateway
npm run dev:gateway

# Terminal 3: Auth Service
npm run dev:auth

# Terminal 4: Core Service
npm run dev:core

# Terminal 5: Evaluation Service
npm run dev:evaluation
```

### 6. Verify Services Are Running

Open your browser and check:

- **Frontend**: http://localhost:4200
- **API Gateway Health**: http://localhost:3000/health
- **Auth Service Health**: http://localhost:3001/health
- **Core Service Health**: http://localhost:3002/health
- **Evaluation Service Health**: http://localhost:3003/health

## Quick Setup with Docker Compose (Alternative)

If you prefer using Docker:

```bash
# Create docker-compose.yml (see docs/DEPLOYMENT.md for example)
# Then run:
docker-compose up -d postgres redis

# Set DATABASE_URL in .env to:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evalops

# Set REDIS_HOST in .env to:
# REDIS_HOST=localhost

# Then start services:
npm run dev
```

## Troubleshooting

### Database Connection Issues

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# If connection fails, check:
# 1. Database is running
# 2. DATABASE_URL is correct
# 3. Database exists (create it if needed: CREATE DATABASE evalops;)
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping
# Should return: PONG

# If Redis is not running:
# macOS: brew services start redis
# Linux: sudo systemctl start redis
```

### Port Already in Use

If a port is already in use, either:

1. Stop the service using that port
2. Change the port in the service's `main.ts` file
3. Use environment variables to override ports

### Services Not Starting

1. Check Node.js version: `node --version` (should be 20.x or later)
2. Check if dependencies are installed: `npm install`
3. Check environment variables: Ensure `.env` file exists and has required variables
4. Check logs: Look for error messages in the terminal

## Next Steps

Once all services are running:

1. **Access the Frontend**: http://localhost:4200
2. **Login**: Use the development credentials (if configured) or register a new user
3. **Create Your First Evaluation**:
   - Create a prompt
   - Create a dataset
   - Create an evaluation spec
   - Run an evaluation

## Development Tips

- **Hot Reload**: All services support hot reload in development mode
- **Logs**: Each service logs to its own terminal window
- **API Gateway**: All API requests go through http://localhost:3000
- **Database Changes**: Run `npm run db:push` after schema changes

## Need Help?

- Check `docs/ARCHITECTURE.md` for architecture details
- Check `docs/DEPLOYMENT.md` for deployment options
- Check `docs/MIGRATION.md` for migration information
- Check service logs for error messages
