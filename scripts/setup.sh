#!/bin/bash
# Unified setup script for EvalOps
# Runs prerequisite checks, generates secrets, starts Docker containers, and runs migrations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "EvalOps Setup Script"
echo "=========================================="
echo ""

# Step 1: Run prerequisite checks
echo "Step 1: Checking prerequisites..."
echo ""
if ! bash "$SCRIPT_DIR/setup-check.sh"; then
    echo ""
    echo "Prerequisites check failed. Please fix the errors above and try again."
    exit 1
fi
echo ""

# Step 2: Ensure .env file exists
echo "Step 2: Setting up environment file..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "Copying .env.example to .env..."
        cp .env.example .env
    else
        echo "Error: .env.example not found!"
        exit 1
    fi
fi
echo "✓ .env file ready"
echo ""

# Step 3: Generate secrets if missing or using placeholders
echo "Step 3: Generating secrets..."
NEEDS_JWT_SECRET=false
NEEDS_SERVICE_SECRET=false

if ! grep -q "^JWT_SECRET=" .env 2>/dev/null || grep -q "^JWT_SECRET=your-secret" .env 2>/dev/null; then
    NEEDS_JWT_SECRET=true
fi

if ! grep -q "^SERVICE_SECRET=" .env 2>/dev/null || grep -q "^SERVICE_SECRET=your-service" .env 2>/dev/null; then
    NEEDS_SERVICE_SECRET=true
fi

if [ "$NEEDS_JWT_SECRET" = true ] || [ "$NEEDS_SERVICE_SECRET" = true ]; then
    echo "Generating new secrets..."
    JWT_SECRET=$(openssl rand -hex 32)
    SERVICE_SECRET=$(openssl rand -hex 32)
    
    # Update .env file
    if [ "$NEEDS_JWT_SECRET" = true ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        else
            # Linux
            sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        fi
        echo "✓ Generated JWT_SECRET"
    fi
    
    if [ "$NEEDS_SERVICE_SECRET" = true ]; then
        if ! grep -q "^SERVICE_SECRET=" .env 2>/dev/null; then
            # Add SERVICE_SECRET if it doesn't exist
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "/^JWT_SECRET=/a\\
SERVICE_SECRET=${SERVICE_SECRET}
" .env
            else
                sed -i "/^JWT_SECRET=/a SERVICE_SECRET=${SERVICE_SECRET}" .env
            fi
        else
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^SERVICE_SECRET=.*/SERVICE_SECRET=${SERVICE_SECRET}/" .env
            else
                sed -i "s/^SERVICE_SECRET=.*/SERVICE_SECRET=${SERVICE_SECRET}/" .env
            fi
        fi
        echo "✓ Generated SERVICE_SECRET"
    fi
else
    echo "✓ Secrets already configured"
fi
echo ""

# Step 4: Fix DATABASE_URL and REDIS settings for Tilt (if needed)
echo "Step 4: Configuring database and Redis settings..."
UPDATED=false

# Check if DATABASE_URL uses Docker hostname but should use localhost for Tilt
if grep -q "^DATABASE_URL=postgresql://.*@postgres:5432" .env 2>/dev/null; then
    echo "Updating DATABASE_URL for Tilt (localhost:15432)..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's|^DATABASE_URL=postgresql://postgres:postgres@postgres:5432/evalops|DATABASE_URL=postgresql://postgres:postgres@localhost:15432/evalops|' .env
    else
        sed -i 's|^DATABASE_URL=postgresql://postgres:postgres@postgres:5432/evalops|DATABASE_URL=postgresql://postgres:postgres@localhost:15432/evalops|' .env
    fi
    UPDATED=true
fi

# Check if REDIS_HOST uses Docker hostname but should use localhost for Tilt
if grep -q "^REDIS_HOST=redis$" .env 2>/dev/null; then
    echo "Updating REDIS_HOST for Tilt (localhost)..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/^REDIS_HOST=redis$/REDIS_HOST=localhost/' .env
    else
        sed -i 's/^REDIS_HOST=redis$/REDIS_HOST=localhost/' .env
    fi
    UPDATED=true
fi

# Check if REDIS_PORT needs updating for Tilt
if grep -q "^REDIS_PORT=6379$" .env 2>/dev/null && grep -q "^REDIS_HOST=localhost$" .env 2>/dev/null; then
    echo "Updating REDIS_PORT for Tilt (16379)..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/^REDIS_PORT=6379$/REDIS_PORT=16379/' .env
    else
        sed -i 's/^REDIS_PORT=6379$/REDIS_PORT=16379/' .env
    fi
    UPDATED=true
fi

if [ "$UPDATED" = true ]; then
    echo "✓ Updated database/Redis configuration for Tilt"
else
    echo "✓ Database/Redis configuration looks good"
fi
echo ""

# Step 5: Install npm dependencies
echo "Step 5: Installing npm dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Running npm install..."
    npm install
else
    echo "✓ node_modules already exists (skipping npm install)"
fi
echo ""

# Step 6: Start Docker containers
echo "Step 6: Starting Docker containers..."
echo ""

# Create Docker network if it doesn't exist
docker network create evalops-network 2>/dev/null || true

# Start PostgreSQL
echo -n "PostgreSQL... "
if docker ps -a --format "{{.Names}}" | grep -q "^evalops-postgres$" 2>/dev/null; then
    if ! docker ps --format "{{.Names}}" | grep -q "^evalops-postgres$" 2>/dev/null; then
        docker start evalops-postgres > /dev/null 2>&1
        echo "started"
    else
        echo "already running"
    fi
else
    docker run -d --name evalops-postgres \
        --network evalops-network \
        -p 15432:5432 \
        -e POSTGRES_DB=evalops \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -v postgres_data:/var/lib/postgresql/data \
        --health-cmd="pg_isready -U postgres" \
        --health-interval=5s \
        --health-timeout=5s \
        --health-retries=5 \
        postgres:15-alpine > /dev/null 2>&1
    echo "created and started"
fi

# Wait for PostgreSQL to be healthy
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec evalops-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✓ PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠ PostgreSQL took too long to start, but continuing..."
    fi
    sleep 1
done

# Start Redis
echo -n "Redis... "
if docker ps -a --format "{{.Names}}" | grep -q "^evalops-redis$" 2>/dev/null; then
    if ! docker ps --format "{{.Names}}" | grep -q "^evalops-redis$" 2>/dev/null; then
        docker start evalops-redis > /dev/null 2>&1
        echo "started"
    else
        echo "already running"
    fi
else
    docker run -d --name evalops-redis \
        --network evalops-network \
        -p 16379:6379 \
        --health-cmd="redis-cli ping" \
        --health-interval=5s \
        --health-timeout=3s \
        --health-retries=5 \
        redis:7-alpine \
        redis-server --appendonly yes > /dev/null 2>&1
    echo "created and started"
fi

# Wait for Redis to be healthy
echo "Waiting for Redis to be ready..."
for i in {1..30}; do
    if docker exec evalops-redis redis-cli ping > /dev/null 2>&1; then
        echo "✓ Redis is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠ Redis took too long to start, but continuing..."
    fi
    sleep 1
done
echo ""

# Step 7: Run database migrations
echo "Step 7: Running database migrations..."
echo "Pushing database schema..."
if npm run db:push; then
    echo "✓ Database schema pushed successfully"
else
    echo "⚠ Database migration had issues, but continuing..."
fi
echo ""

# Summary
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "Option A - Using Tilt (Recommended):"
echo "  1. Install Tilt: brew install tilt-dev/tap/tilt"
echo "  2. Run: tilt up"
echo "  3. Open Tilt dashboard: http://localhost:10350"
echo ""
echo "Option B - Manual start:"
echo "  1. Run: npm run dev"
echo "  2. Access frontend: http://localhost:4200"
echo "  3. Access API Gateway: http://localhost:3000"
echo ""
echo "To verify setup:"
echo "  - Check health: curl http://localhost:3000/health"
echo "  - Register user: curl -X POST http://localhost:3000/api/auth/register \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"test@example.com\",\"password\":\"Password123!\"}'"
echo ""
