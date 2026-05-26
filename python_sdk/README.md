# evalops-sdk

Python SDK for EvalOps — evaluate LLM pipelines from Python.

## Install

```bash
pip install evalops-sdk

# With pytest plugin:
pip install "evalops-sdk[pytest-evalops]"
```

## Usage

```python
from evalops import EvalOpsClient

client = EvalOpsClient(base_url="http://localhost:3000", token="evops_pat_...")
spec = client.specs.upsert_from_file("my-eval.yaml")
run = client.runs.create(spec.id)
done = client.runs.wait_for(run.id, timeout_ms=120_000)
print(done.decision)  # pass | warn | fail
```

## pytest plugin

```python
@pytest.mark.evalops("my-eval.yaml")
def test_pipeline():
    pass
```

Set `EVALOPS_URL` and `EVALOPS_TOKEN` environment variables.
