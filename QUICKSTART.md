# EvalOps Quickstart

Get from zero to your first passing eval in under 5 minutes.

---

## 1. Zero-infra dev mode

No Docker, no Postgres, no Redis required. The CLI embeds the full platform in a single Node process using SQLite + an in-memory Redis facade.

```bash
# Install the CLI globally
npm i -g @evalops/cli

# Scaffold a demo project (writes evalops.yaml + eval/hello.eval.yaml)
evalops init --demo

# Start the embedded platform (binds :3000, auto-generates secrets, seeds a default org)
evalops dev
```

You should see output like:

```
EvalOps dev platform running at http://localhost:3000
Swagger UI: http://localhost:3000/api/docs
PAT written to ~/.evalops/dev.env — no login needed
```

The dev server auto-writes a PAT to `~/.evalops/dev.env` so subsequent CLI commands work without `evalops login`.

> **Advanced LLM evaluations** (semantic similarity, answer correctness) require the Python worker.
> Start it with `evalops dev --with-python` or `uv run python python_worker/main.py` in a separate terminal.

---

## 2. Run your first eval

```bash
# Run the demo eval spec (exit 0 = pass, exit 1 = fail)
evalops eval eval/hello.eval.yaml --watch
```

Expected output:

```
Running eval: Hello World Eval
  scenario: echo-hello     pass
  scenario: echo-goodbye   pass

Decision: pass (2/2 scenarios passed)
```

Try the self-eval suite that ships with the repo:

```bash
evalops eval evalops-self.eval.yaml --watch
```

Push a spec without running it:

```bash
evalops spec push eval/hello.eval.yaml
```

---

## 3. Production setup

For a real deployment you need Postgres, Redis, and at least one AI provider key.

```bash
# Copy the minimal env template
cp .env.example .env

# Edit .env — fill in these four values:
#   DATABASE_URL   — your Postgres connection string
#   JWT_SECRET     — 32+ random bytes (openssl rand -hex 32)
#   SERVICE_SECRET — 32+ random bytes (openssl rand -hex 32)
#   OPENAI_API_KEY — your OpenAI key (or see .env.optional.example for Azure/Anthropic/Gemini)
```

Optional settings (Redis, Azure ML, Entra SSO, OpenSandbox, extra AI providers) live in `.env.optional.example`. Copy only the lines you need into `.env`.

Start all services via Tilt (recommended for local prod-like dev):

```bash
tilt up
```

Or start services individually:

```bash
npm run dev:auth &
npm run dev:core &
npm run dev:evaluation &
npm run dev:integration &
npm run dev:analytics &
```

---

## 4. CI gate — GitHub Action

Add a one-step eval gate to any GitHub Actions workflow:

```yaml
jobs:
  eval-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/eval-action
        with:
          spec: evalops-self.eval.yaml
          evalops-url: ${{ vars.EVALOPS_URL }}
          evalops-token: ${{ secrets.EVALOPS_TOKEN }}
          fail-on-warn: 'true'
          comment-on-pr: 'true'
```

**Inputs:**
| Name | Required | Description |
|------|----------|-------------|
| `spec` | Yes | Path to eval spec YAML (glob supported) |
| `evalops-url` | Yes | EvalOps API base URL |
| `evalops-token` | Yes | PAT or JWT token |
| `fail-on-warn` | No | Exit 1 on `warn` verdict (default: `false`) |
| `comment-on-pr` | No | Post verdict as PR comment (default: `false`) |

**Outputs:** `decision` (pass/warn/fail), `run-id`, `junit-path`

Add a CI badge to your README:

```markdown
[![EvalOps](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
```

---

## 5. Python SDK

Install the Python SDK:

```bash
pip install evalops-sdk

# With the pytest plugin:
pip install "evalops-sdk[pytest-evalops]"
```

Use the client directly:

```python
from evalops import EvalOpsClient
import os

client = EvalOpsClient(
    base_url=os.environ["EVALOPS_URL"],
    token=os.environ["EVALOPS_TOKEN"],
)

spec = client.specs.upsert_from_file("evalops-self.eval.yaml")
run = client.runs.create(spec.id)
done = client.runs.wait_for(run.id, timeout_ms=120_000)

if done.decision == "fail":
    raise SystemExit(f"Eval failed: run {run.id}")

print(f"Eval passed: {done.decision}")
```

Use the pytest plugin to gate tests on an eval result:

```python
import pytest

@pytest.mark.evalops("evalops-self.eval.yaml")
def test_llm_pipeline_meets_policy():
    """This test passes when the EvalOps spec decision is not 'fail'."""
    pass  # marker drives the eval; test body is the post-eval assertion hook
```

Set `EVALOPS_URL` and `EVALOPS_TOKEN` in the environment before running pytest.
If `EVALOPS_TOKEN` is not set, the test is automatically skipped (not failed).
