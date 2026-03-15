#!/bin/bash
# Generate secrets for EvalOps
# Generates JWT_SECRET and SERVICE_SECRET using openssl

set -e

echo "Generating secrets for EvalOps..."

# Generate JWT_SECRET
JWT_SECRET=$(openssl rand -hex 32)
echo "Generated JWT_SECRET: ${JWT_SECRET:0:20}..."

# Generate SERVICE_SECRET
SERVICE_SECRET=$(openssl rand -hex 32)
echo "Generated SERVICE_SECRET: ${SERVICE_SECRET:0:20}..."

# Export for use in other scripts
export JWT_SECRET
export SERVICE_SECRET

echo ""
echo "Secrets generated successfully!"
echo ""
echo "Add these to your .env file:"
echo "JWT_SECRET=${JWT_SECRET}"
echo "SERVICE_SECRET=${SERVICE_SECRET}"
