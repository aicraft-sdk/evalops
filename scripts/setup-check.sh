#!/bin/bash
# Prerequisites validation script for EvalOps
# Checks Node.js, Docker, Python versions and .env configuration

set -e

ERRORS=0
WARNINGS=0

echo "Checking EvalOps prerequisites..."
echo ""

# Check Node.js version
echo -n "Checking Node.js version... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        echo "✓ Node.js ${NODE_VERSION}"
    else
        echo "✗ Node.js ${NODE_VERSION} (requires 20.x or later)"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "✗ Node.js not found"
    ERRORS=$((ERRORS + 1))
fi

# Check npm
echo -n "Checking npm... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "✓ npm ${NPM_VERSION}"
else
    echo "✗ npm not found"
    ERRORS=$((ERRORS + 1))
fi

# Check Docker
echo -n "Checking Docker... "
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        DOCKER_VERSION=$(docker -v | awk '{print $3}' | sed 's/,//')
        echo "✓ Docker ${DOCKER_VERSION}"
    else
        echo "✗ Docker is installed but not running"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "✗ Docker not found"
    ERRORS=$((ERRORS + 1))
fi

# Check Python (optional, for Python worker)
echo -n "Checking Python... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
    if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 11 ]; then
        echo "✓ Python ${PYTHON_VERSION}"
    else
        echo "⚠ Python ${PYTHON_VERSION} (requires 3.11+ for Python worker)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "⚠ Python not found (optional, needed for Python worker)"
    WARNINGS=$((WARNINGS + 1))
fi

# Check .env file exists
echo -n "Checking .env file... "
if [ -f ".env" ]; then
    echo "✓ Found"
    
    # Check required variables
    MISSING_VARS=()
    
    if ! grep -q "^JWT_SECRET=" .env 2>/dev/null || grep -q "^JWT_SECRET=your-secret" .env 2>/dev/null; then
        MISSING_VARS+=("JWT_SECRET")
    fi
    if ! grep -q "^SERVICE_SECRET=" .env 2>/dev/null || grep -q "^SERVICE_SECRET=your-service" .env 2>/dev/null; then
        MISSING_VARS+=("SERVICE_SECRET")
    fi
    if ! grep -q "^DATABASE_URL=" .env 2>/dev/null; then
        MISSING_VARS+=("DATABASE_URL")
    fi
    
    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
        echo "  ⚠ Missing or using placeholder values: ${MISSING_VARS[*]}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "✗ Not found (copy from .env.example)"
    ERRORS=$((ERRORS + 1))
fi

# Check Docker containers
echo -n "Checking Docker containers... "
if docker ps -a --format "{{.Names}}" | grep -q "^evalops-postgres$" 2>/dev/null; then
    if docker ps --format "{{.Names}}" | grep -q "^evalops-postgres$" 2>/dev/null; then
        echo "✓ PostgreSQL container running"
    else
        echo "⚠ PostgreSQL container exists but stopped"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "⚠ PostgreSQL container not found (will be created)"
    WARNINGS=$((WARNINGS + 1))
fi

if docker ps -a --format "{{.Names}}" | grep -q "^evalops-redis$" 2>/dev/null; then
    if docker ps --format "{{.Names}}" | grep -q "^evalops-redis$" 2>/dev/null; then
        echo "✓ Redis container running"
    else
        echo "⚠ Redis container exists but stopped"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "⚠ Redis container not found (will be created)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo "✗ Found ${ERRORS} error(s). Please fix them before continuing."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo "⚠ Found ${WARNINGS} warning(s). Review them but you can continue."
    exit 0
else
    echo "✓ All checks passed!"
    exit 0
fi
