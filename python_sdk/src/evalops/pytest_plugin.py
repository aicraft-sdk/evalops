from __future__ import annotations
import os
import pytest
from .client import EvalOpsClient


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "evalops(spec): run an EvalOps evaluation spec and fail on decision==fail",
    )


@pytest.fixture(scope="session")
def evalops_client() -> EvalOpsClient:
    base_url = os.environ.get("EVALOPS_URL", "http://localhost:3000")
    token = os.environ.get("EVALOPS_TOKEN", "")
    if not token:
        pytest.skip("EVALOPS_TOKEN not set — skipping EvalOps tests")
    return EvalOpsClient(base_url=base_url, token=token)


def pytest_runtest_setup(item: pytest.Item) -> None:
    marker = item.get_closest_marker("evalops")
    if marker is None:
        return
    spec_path: str = marker.args[0] if marker.args else ""
    if not spec_path:
        pytest.fail("@pytest.mark.evalops requires a spec path argument")
    # Defer actual execution to call phase — just validate marker is well-formed here


def pytest_runtest_call(item: pytest.Item) -> None:
    marker = item.get_closest_marker("evalops")
    if marker is None:
        return
    spec_path: str = marker.args[0]
    base_url = os.environ.get("EVALOPS_URL", "http://localhost:3000")
    token = os.environ.get("EVALOPS_TOKEN", "")
    if not token:
        pytest.skip("EVALOPS_TOKEN not set — skipping EvalOps evaluation")
    client = EvalOpsClient(base_url=base_url, token=token)
    try:
        spec = client.specs.upsert_from_file(spec_path)
        run = client.runs.create(spec.id)
        done = client.runs.wait_for(run.id, timeout_ms=120_000)
        if done.decision == "fail":
            pytest.fail(f"EvalOps run {run.id} failed (decision=fail)")
    finally:
        client.close()
