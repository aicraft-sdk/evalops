# OpenSandbox Setup Guide

This guide covers installing, configuring, and running the OpenSandbox server for secure code execution in EvalOps.

## Overview

OpenSandbox is Alibaba's platform for secure, isolated code execution using Docker/Kubernetes. It provides sandbox lifecycle management, resource limits, and network policies for executing untrusted code safely.

## Prerequisites

| Requirement | Version | Installation                                     |
| ----------- | ------- | ------------------------------------------------ | --- |
| Python      | 3.10+   | [python.org](https://www.python.org/downloads/)  |
| uv          | Latest  | `curl -LsSf https://astral.sh/uv/install.sh      | sh` |
| Docker      | 24.x+   | [docker.com](https://www.docker.com/get-started) |

**Note**: OpenSandbox requires Docker to be running and accessible. The server uses Docker containers for sandbox isolation.

## Installation

### Step 1: Install OpenSandbox Server

Install the OpenSandbox server using `uv`:

```bash
uv pip install opensandbox-server
```

Verify installation:

```bash
opensandbox-server --version
```

### Step 2: Initialize Configuration

Initialize the default configuration file:

```bash
opensandbox-server init-config ~/.sandbox.toml --example docker
```

This creates `~/.sandbox.toml` in your home directory with Docker runtime settings.

### Step 3: Configure `~/.sandbox.toml`

Edit `~/.sandbox.toml` with your preferred settings. Here's a recommended configuration for local development:

```toml
[server]
host = "0.0.0.0"
port = 8080
log_level = "INFO"
# Generate a secure API key: openssl rand -hex 32
api_key = "<your-generated-api-key>"

[runtime]
type = "docker"
execd_image = "opensandbox/execd:v1.0.6"

[docker]
network_mode = "bridge"

[network]
# Network egress policy: allow_all (dev), deny_all, or restricted (production)
# In production, use "restricted" with allowed_domains configured
egress_policy = "allow_all"
# For restricted policy, specify allowed domains (FQDN)
# allowed_domains = ["api.openai.com", "api.anthropic.com"]

[resources]
default_cpu = "1.0"
default_memory = "512Mi"
default_timeout = 300
max_concurrent_sandboxes = 10
```

**Important Configuration Notes**:

- **`api_key`**: Generate a secure key using `openssl rand -hex 32`. This must match `OPENSANDBOX_API_KEY` in your `.env` file.
- **`port`**: Default is 8080. Ensure this matches `OPENSANDBOX_SERVER_URL` in your `.env` file.
- **`egress_policy`**: Set to `"allow_all"` for development. This will be restricted in Phase 5 for production security.
- **`execd_image`**: The Docker image used for sandbox execution. Keep this at the recommended version.

### Step 4: Verify Docker Runtime

Ensure Docker is running and accessible:

```bash
docker ps
```

If Docker is not running, start it:

```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

### Step 5: Start OpenSandbox Server

Start the server:

```bash
opensandbox-server start
```

Or run directly:

```bash
uv run python -m opensandbox_server.main
```

The server will start on `http://localhost:8080` (or your configured port).

### Step 6: Verify Server Health

Test the health endpoint:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{ "status": "healthy" }
```

## Environment Configuration

Add the following environment variables to your `.env` file:

```env
# OpenSandbox Configuration
OPENSANDBOX_SERVER_URL=http://localhost:8080
OPENSANDBOX_API_KEY=<your-api-key-from-sandbox-toml>
OPENSANDBOX_DEFAULT_CPU=1.0
OPENSANDBOX_DEFAULT_MEMORY=512Mi
OPENSANDBOX_DEFAULT_TIMEOUT=300
OPENSANDBOX_MAX_CONCURRENT=10

# Sandbox Security Configuration (Phase 5)
OPENSANDBOX_NETWORK_POLICY=restricted
OPENSANDBOX_ALLOWED_DOMAINS=api.openai.com,api.anthropic.com,generativelanguage.googleapis.com
OPENSANDBOX_BLOCKED_DOMAINS=localhost,127.0.0.1,internal.evalops.local
OPENSANDBOX_MAX_CPU=2.0
OPENSANDBOX_MAX_MEMORY=2Gi
OPENSANDBOX_MAX_TIMEOUT=600
OPENSANDBOX_REQUIRE_AST_VALIDATION=true

# Sandbox Monitoring
OPENSANDBOX_ENABLE_MONITORING=true
OPENSANDBOX_ANOMALY_DETECTION=true
OPENSANDBOX_RESOURCE_ALERT_THRESHOLD=0.8
```

**Important**: The `OPENSANDBOX_API_KEY` must match the `api_key` value in your `~/.sandbox.toml` file.

For detailed security configuration, see [SANDBOX_SECURITY.md](./SANDBOX_SECURITY.md).

## SDK Installation

### Python SDK

The Python SDK is already included in `python_worker/requirements.txt`:

```txt
opensandbox>=0.1.5
```

Install dependencies:

```bash
cd python_worker
pip install -r requirements.txt
```

Verify installation:

```bash
python -c "import opensandbox; print(opensandbox.__version__)"
```

### TypeScript SDK

The TypeScript SDK is included in `package.json`:

```json
"@alibaba-group/opensandbox": "^0.1.5"
```

Install dependencies:

```bash
npm install
```

Verify installation:

```bash
npm list @alibaba-group/opensandbox
```

## Running with Tilt

When using Tilt for local development, the OpenSandbox server runs as a standalone process (not managed by Tilt). Start it manually before starting Tilt:

```bash
# Terminal 1: Start OpenSandbox server
opensandbox-server start

# Terminal 2: Start Tilt
tilt up
```

The Python Worker service in Tilt will automatically receive OpenSandbox environment variables from your `.env` file.

## Troubleshooting

### Server Won't Start

**Error**: `Cannot connect to Docker daemon`

**Solution**: Ensure Docker is running:

```bash
docker ps
```

If Docker is not running, start it and try again.

### Health Check Fails

**Error**: `curl: (7) Failed to connect to localhost port 8080`

**Solution**:

1. Verify the server is running: `ps aux | grep opensandbox`
2. Check the configured port in `~/.sandbox.toml`
3. Verify `OPENSANDBOX_SERVER_URL` matches the server port

### API Key Mismatch

**Error**: `401 Unauthorized` when calling OpenSandbox API

**Solution**: Ensure `OPENSANDBOX_API_KEY` in `.env` matches `api_key` in `~/.sandbox.toml`:

```bash
# Check .env
grep OPENSANDBOX_API_KEY .env

# Check ~/.sandbox.toml
grep api_key ~/.sandbox.toml
```

### SDK Import Errors

**Python**:

```bash
# Reinstall if needed
pip install --upgrade opensandbox
```

**TypeScript**:

```bash
# Reinstall if needed
npm install @alibaba-group/opensandbox
```

### Port Already in Use

If port 8080 is already in use:

1. Change the port in `~/.sandbox.toml`:

   ```toml
   [server]
   port = 8081
   ```

2. Update `.env`:

   ```env
   OPENSANDBOX_SERVER_URL=http://localhost:8081
   ```

3. Restart the server

## Configuration Reference

### Server Configuration (`~/.sandbox.toml`)

| Setting                              | Default                    | Description                                     |
| ------------------------------------ | -------------------------- | ----------------------------------------------- |
| `server.host`                        | `0.0.0.0`                  | Server bind address                             |
| `server.port`                        | `8080`                     | Server port                                     |
| `server.log_level`                   | `INFO`                     | Logging level (DEBUG, INFO, WARNING, ERROR)     |
| `server.api_key`                     | _(required)_               | API key for authentication                      |
| `runtime.type`                       | `docker`                   | Runtime type (docker or kubernetes)             |
| `runtime.execd_image`                | `opensandbox/execd:v1.0.6` | Docker image for sandbox execution              |
| `docker.network_mode`                | `bridge`                   | Docker network mode                             |
| `network.egress_policy`              | `allow_all`                | Network egress policy (allow_all or restricted) |
| `resources.default_cpu`              | `1.0`                      | Default CPU limit per sandbox                   |
| `resources.default_memory`           | `512Mi`                    | Default memory limit per sandbox                |
| `resources.default_timeout`          | `300`                      | Default timeout in seconds                      |
| `resources.max_concurrent_sandboxes` | `10`                       | Maximum concurrent sandboxes                    |

### Environment Variables

| Variable                      | Default                 | Description                            |
| ----------------------------- | ----------------------- | -------------------------------------- |
| `OPENSANDBOX_SERVER_URL`      | `http://localhost:8080` | OpenSandbox server URL                 |
| `OPENSANDBOX_API_KEY`         | _(required)_            | API key (must match `~/.sandbox.toml`) |
| `OPENSANDBOX_DEFAULT_CPU`     | `1.0`                   | Default CPU limit                      |
| `OPENSANDBOX_DEFAULT_MEMORY`  | `512Mi`                 | Default memory limit                   |
| `OPENSANDBOX_DEFAULT_TIMEOUT` | `300`                   | Default timeout in seconds             |
| `OPENSANDBOX_MAX_CONCURRENT`  | `10`                    | Maximum concurrent sandboxes           |

## Security Configuration

Phase 5 implements comprehensive security hardening for sandbox operations. See [SANDBOX_SECURITY.md](./SANDBOX_SECURITY.md) for detailed information on:

- Network policy enforcement (FQDN-based allowlist)
- Resource limit enforcement
- Code validation (AST-based analysis)
- Security scanning
- Audit logging
- Anomaly detection

## Next Steps

After completing this setup:

1. **Phase 2**: Create sandbox integration services
2. **Phase 3**: Implement custom evaluator execution
3. **Phase 4**: Enhance Python Worker with sandbox isolation
4. **Phase 5**: Security hardening (✅ Complete) - See [SANDBOX_SECURITY.md](./SANDBOX_SECURITY.md)

## Additional Resources

- [OpenSandbox Documentation](https://open-sandbox.ai/)
- [OpenSandbox Python SDK](https://open-sandbox.ai/sdks/sandbox/python/readme)
- [OpenSandbox TypeScript SDK](https://open-sandbox.ai/sdks/sandbox/javascript/readme)
- [Docker Documentation](https://docs.docker.com/)
