# Python Worker — multi-stage build
# Stage 1: dependency installation
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: production image
FROM python:3.11-slim AS production

WORKDIR /app

# Non-root user for security
RUN groupadd -r evalops && useradd -r -g evalops evalops

# Copy installed packages from builder
COPY --from=builder /root/.local /home/evalops/.local

# Copy application code
COPY main.py .

# Ensure scripts in .local are usable
ENV PATH=/home/evalops/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN chown -R evalops:evalops /app
USER evalops

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
