#!/bin/bash
# Quick start script for EvalOps
# Detects if Tilt is available and uses it, otherwise falls back to manual start

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "EvalOps Quick Start"
echo "=========================================="
echo ""

# Check if setup has been run
if [ ! -f ".env" ]; then
    echo "⚠ .env file not found. Running setup first..."
    bash "$SCRIPT_DIR/setup.sh"
    echo ""
fi

# Check if Tilt is available
if command -v tilt &> /dev/null; then
    echo "Tilt detected! Using Tilt for development..."
    echo ""
    echo "Starting Tilt..."
    echo "Tilt dashboard will be available at: http://localhost:10350"
    echo ""
    echo "Press Ctrl+C to stop Tilt"
    echo ""
    tilt up
else
    echo "Tilt not found. Using manual start..."
    echo ""
    echo "To use Tilt (recommended), install it:"
    echo "  macOS: brew install tilt-dev/tap/tilt"
    echo "  Linux: curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash"
    echo ""
    echo "Starting services manually..."
    echo ""
    
    # Ensure Docker containers are running
    if ! docker ps --format "{{.Names}}" | grep -q "^evalops-postgres$" 2>/dev/null; then
        echo "Starting PostgreSQL container..."
        docker start evalops-postgres 2>/dev/null || echo "⚠ PostgreSQL container not found. Run 'npm run setup' first."
    fi
    
    if ! docker ps --format "{{.Names}}" | grep -q "^evalops-redis$" 2>/dev/null; then
        echo "Starting Redis container..."
        docker start evalops-redis 2>/dev/null || echo "⚠ Redis container not found. Run 'npm run setup' first."
    fi
    
    echo ""
    echo "Starting all services..."
    echo "Access points:"
    echo "  - Frontend: http://localhost:4200"
    echo "  - API Gateway: http://localhost:3000"
    echo ""
    echo "Press Ctrl+C to stop all services"
    echo ""
    
    npm run dev
fi
