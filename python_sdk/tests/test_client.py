"""Unit tests for EvalOpsClient — no live server required."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
import httpx
import pytest

from evalops.client import EvalOpsClient
from evalops.models import Run, EvalSpec


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_transport(status_code: int = 200, json_body: object = None) -> httpx.MockTransport:
    """Return a MockTransport that always responds with the given JSON body."""

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.dumps(json_body or {}).encode()
        return httpx.Response(status_code, content=body, headers={"content-type": "application/json"})

    return httpx.MockTransport(handler)


# ---------------------------------------------------------------------------
# Test 1: EvalOpsClient instantiation
# ---------------------------------------------------------------------------

def test_client_can_be_instantiated():
    client = EvalOpsClient(base_url="http://localhost:3000", token="test-token")
    assert client.datasets is not None
    assert client.specs is not None
    assert client.runs is not None
    assert client.agents is not None
    assert client.policies is not None
    assert client.tokens is not None
    client.close()


# ---------------------------------------------------------------------------
# Test 2: RunsResource.get() parses Run from mock JSON
# ---------------------------------------------------------------------------

def test_runs_get_parses_run_model():
    run_data = {
        "id": "run-123",
        "organizationId": "org-456",
        "evalSpecId": "spec-789",
        "status": "completed",
        "decision": "pass",
        "startedAt": "2026-01-01T00:00:00Z",
        "completedAt": "2026-01-01T00:01:00Z",
        "metadata": None,
    }
    transport = _make_mock_transport(200, run_data)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    from evalops.resources.runs import RunsResource
    resource = RunsResource(http)

    run = resource.get("run-123")

    assert isinstance(run, Run)
    assert run.id == "run-123"
    assert run.status == "completed"
    assert run.decision == "pass"
    http.close()


# ---------------------------------------------------------------------------
# Test 3: RunsResource.wait_for() returns immediately on "completed" status
# ---------------------------------------------------------------------------

def test_runs_wait_for_returns_immediately_when_completed():
    run_data = {
        "id": "run-abc",
        "organizationId": "org-1",
        "evalSpecId": "spec-1",
        "status": "completed",
        "decision": "pass",
        "startedAt": None,
        "completedAt": None,
        "metadata": None,
    }
    transport = _make_mock_transport(200, run_data)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    from evalops.resources.runs import RunsResource
    resource = RunsResource(http)

    run = resource.wait_for("run-abc", timeout_ms=5_000)

    assert run.status == "completed"
    http.close()


# ---------------------------------------------------------------------------
# Test 4: SpecsResource.upsert() parses EvalSpec from mock response
# ---------------------------------------------------------------------------

def test_specs_upsert_parses_eval_spec():
    spec_data = {
        "id": "spec-xyz",
        "organizationId": "org-1",
        "name": "My Spec",
        "description": "A test spec",
        "scenarios": [{"name": "s1", "input": "hello", "expected": "hello"}],
        "version": 1,
        "createdAt": "2026-01-01T00:00:00Z",
    }
    transport = _make_mock_transport(200, spec_data)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    from evalops.resources.specs import SpecsResource
    resource = SpecsResource(http)

    spec = resource.upsert({"name": "My Spec", "scenarios": []})

    assert isinstance(spec, EvalSpec)
    assert spec.id == "spec-xyz"
    assert spec.name == "My Spec"
    assert spec.version == 1
    http.close()


# ---------------------------------------------------------------------------
# Test 5: Context manager calls close on exit
# ---------------------------------------------------------------------------

def test_context_manager_closes_on_exit():
    client = EvalOpsClient(base_url="http://localhost:3000", token="test-token")
    closed = []

    original_close = client._http.close
    client._http.close = lambda: closed.append(True) or original_close()

    with client as c:
        assert c is client

    assert closed, "close() was not called on context manager exit"
