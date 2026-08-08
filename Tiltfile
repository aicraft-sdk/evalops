# Tiltfile for EvalOps Development Environment
# Manages all microservices, frontend, Python worker, and dependencies

# Helper to read .env file and return dict
def read_env_file():
    env_vars = {}
    if os.path.exists('.env'):
        content = str(read_file('.env'))
        for line in content.split('\n'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                parts = line.split('=', 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    value = parts[1].strip()
                    # Remove quotes if present
                    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                        value = value[1:-1]
                    env_vars[key] = value
    return env_vars

# Load environment variables from .env file
loaded_env = read_env_file()

# Set default environment variables (will be overridden by .env if present)
env_vars = {
    'NODE_ENV': 'development',
    'FRONTEND_URL': 'http://localhost:4200',
    'DATABASE_URL': 'postgresql://postgres:postgres@postgres:5432/evalops',
    'REDIS_HOST': 'redis',
    'REDIS_PORT': '6379',
    'REDIS_PASSWORD': '',
    'REDIS_DB': '0',
    'JWT_SECRET': 'dev-secret-key-change-in-production-min-32-chars',
    'JWT_EXPIRES_IN': '24h',
    'ALLOWED_ORIGINS': 'http://localhost:4200,http://localhost:3000',
    'AUTH_SERVICE_URL': 'http://localhost:3001',
    'CORE_SERVICE_URL': 'http://localhost:3002',
    'EVALUATION_SERVICE_URL': 'http://localhost:3003',
    'INTEGRATION_SERVICE_URL': 'http://localhost:3002',
    'ANALYTICS_SERVICE_URL': 'http://localhost:3005',
    'PYTHON_WORKER_URL': 'http://localhost:5055',
    'OPENSANDBOX_SERVER_URL': 'http://localhost:8080',
    'OPENSANDBOX_DEFAULT_CPU': '1.0',
    'OPENSANDBOX_DEFAULT_MEMORY': '512Mi',
    'OPENSANDBOX_DEFAULT_TIMEOUT': '300',
    'OPENSANDBOX_MAX_CONCURRENT': '10',
}

# Merge loaded env vars (loaded vars take precedence)
for key, value in loaded_env.items():
    env_vars[key] = value

# Create Docker network (if it doesn't exist)
local_resource(
    'docker-network',
    cmd='docker network create evalops-network 2>/dev/null || true',
    resource_deps=[],
    labels=['infrastructure'],
)

# PostgreSQL Database
local_resource(
    'postgres',
    cmd='''
        # Check if container exists and is running
        if ! docker ps -a --format "{{.Names}}" | grep -q "^evalops-postgres$"; then
            # Container doesn't exist, create it
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
                postgres:15-alpine
        elif ! docker ps --format "{{.Names}}" | grep -q "^evalops-postgres$"; then
            # Container exists but is stopped, start it
            docker start evalops-postgres
        fi
    ''',
    resource_deps=['docker-network'],
    labels=['service', 'database'],
)

# Redis Cache
local_resource(
    'redis',
    cmd='''
        # Check if container exists and is running
        if ! docker ps -a --format "{{.Names}}" | grep -q "^evalops-redis$"; then
            # Container doesn't exist, create it
            docker run -d --name evalops-redis \
                --network evalops-network \
                -p 16379:6379 \
                --health-cmd="redis-cli ping" \
                --health-interval=5s \
                --health-timeout=3s \
                --health-retries=5 \
                redis:7-alpine \
                redis-server --appendonly yes
        elif ! docker ps --format "{{.Names}}" | grep -q "^evalops-redis$"; then
            # Container exists but is stopped, start it
            docker start evalops-redis
        fi
    ''',
    resource_deps=['docker-network'],
    labels=['cache'],
)

# Ensure npm dependencies are installed
local_resource(
    'npm-install',
    cmd='npm install',
    deps=['package.json', 'package-lock.json'],
    resource_deps=[],
    labels=['infrastructure'],
)

# Helper function to create a Node.js service resource
def node_service(name, port, watch_paths=None, resource_deps=None):
    if watch_paths == None:
        watch_paths = [
            'apps/%s/src' % name,
            'libs/',
        ]
    if resource_deps == None:
        resource_deps = ['postgres', 'redis', 'npm-install']
    
    local_resource(
        name,
        serve_cmd='nx serve %s' % name,
        deps=watch_paths,
        resource_deps=resource_deps,
        env=env_vars,
        labels=['service'],
    )

# Helper function to create frontend service
def frontend_service():
    local_resource(
        'frontend',
        serve_cmd="npx nx run frontend:serve",
        deps=[
            'apps/frontend/src',
            'libs/',
        ],
        resource_deps=[],
        env=env_vars,
        labels=[ 'frontend'],
    )

# Helper function to create Python worker service
def python_worker_service():
    local_resource(
        'python-worker',
        serve_cmd='''
            cd python_worker
            if [ -d .venv ]; then
                PIP_PYTHON=$(head -1 .venv/bin/pip 2>/dev/null | sed "s|^#!||")
                if [ -n "$PIP_PYTHON" ] && [ ! -f "$PIP_PYTHON" ]; then
                    echo "Virtual environment has invalid Python path ($PIP_PYTHON), recreating..."
                    rm -rf .venv
                elif ! .venv/bin/python --version >/dev/null 2>&1; then
                    echo "Virtual environment corrupted, recreating..."
                    rm -rf .venv
                fi
            fi
            if [ ! -d .venv ]; then
                echo "Creating virtual environment..."
                python3 -m venv .venv
            fi
            .venv/bin/pip install --upgrade pip --quiet
            .venv/bin/pip install setuptools wheel --quiet
            .venv/bin/pip install -r requirements.txt --quiet
            .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 5055 --reload
        ''',
        deps=[
            'python_worker/',
            'python_worker/requirements.txt',
        ],
        resource_deps=[],
        dir='python_worker',
        env=env_vars,
        labels=['service'],
    )

# Define all services
frontend_service()

node_service('api-gateway', 3000)
node_service('auth-service', 3001)
node_service('core-service', 3002)
node_service('evaluation-service', 3003)
node_service('integration-service', 3004)
node_service('analytics-service', 3005)

python_worker_service()
