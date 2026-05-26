"""Tests for REM-FIX: CRITICAL-1, CRITICAL-2, CRITICAL-3, HIGH-1, HIGH-2.

RED phase: each test documents the failing behavior before the fix.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
import httpx
import pytest

from evalops.client import EvalOpsClient
from evalops.resources.runs import RunsResource


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_run_dict(status: str = "completed", decision: str = "pass") -> dict:
    return {
        "id": "run-test",
        "organizationId": "org-1",
        "evalSpecId": "spec-1",
        "status": status,
        "decision": decision,
        "startedAt": None,
        "completedAt": None,
        "metadata": None,
    }


def _make_transport_sequence(responses: list[httpx.Response]) -> httpx.MockTransport:
    """Return a transport that cycles through the given responses in order."""
    calls = iter(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        return next(calls)

    return httpx.MockTransport(handler)


def _make_response(status_code: int, json_body: object = None) -> httpx.Response:
    body = json.dumps(json_body or {}).encode()
    return httpx.Response(
        status_code,
        content=body,
        headers={"content-type": "application/json"},
    )


# ---------------------------------------------------------------------------
# FIX 3 — CRITICAL-3: wait_for must retry on 5xx, not propagate immediately
# ---------------------------------------------------------------------------

def test_wait_for_retries_on_503_and_eventually_succeeds():
    """After a 503 transient error, wait_for should retry and succeed."""
    responses = [
        _make_response(503, {"error": "Service Unavailable"}),
        _make_response(200, _make_run_dict("completed", "pass")),
    ]
    transport = _make_transport_sequence(responses)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    resource = RunsResource(http)

    # Should NOT raise — should retry and return the completed run
    run = resource.wait_for("run-test", timeout_ms=10_000, poll_ms=0)
    assert run.status == "completed"
    http.close()


def test_wait_for_raises_after_max_transient_errors():
    """After 5 consecutive 503 errors, wait_for should raise TimeoutError with a helpful message."""
    responses = [_make_response(503, {"error": "gone"}) for _ in range(6)]
    transport = _make_transport_sequence(responses)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    resource = RunsResource(http)

    with pytest.raises(TimeoutError, match="transient server errors"):
        resource.wait_for("run-test", timeout_ms=60_000, poll_ms=0)
    http.close()


def test_wait_for_propagates_4xx_immediately():
    """A 401 (client error) should propagate immediately without retry."""
    responses = [
        _make_response(401, {"error": "Unauthorized"}),
    ]
    transport = _make_transport_sequence(responses)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    resource = RunsResource(http)

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        resource.wait_for("run-test", timeout_ms=60_000, poll_ms=0)
    assert exc_info.value.response.status_code == 401
    http.close()


# ---------------------------------------------------------------------------
# FIX 4 — HIGH-1: _raise_for_status must include response body in the error
# ---------------------------------------------------------------------------

def test_raise_for_status_includes_body_in_error_message():
    """_raise_for_status must include the response body in the exception message."""
    from evalops.client import _raise_for_status

    response = httpx.Response(
        422,
        content=b'{"message":"name must be a string","statusCode":422}',
        headers={"content-type": "application/json"},
        request=httpx.Request("POST", "http://localhost:3000/api/core/specs"),
    )

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        _raise_for_status(response)

    error_str = str(exc_info.value)
    assert "422" in error_str
    assert "name must be a string" in error_str


def test_raise_for_status_reraises_2xx_without_error():
    """_raise_for_status must NOT raise for 2xx responses."""
    from evalops.client import _raise_for_status

    response = httpx.Response(
        200,
        content=b'{"id":"ok"}',
        headers={"content-type": "application/json"},
        request=httpx.Request("GET", "http://localhost:3000/api/core/runs/1"),
    )

    # Should not raise
    _raise_for_status(response)


def test_resource_uses_raise_for_status_helper():
    """RunsResource.get() must call _raise_for_status, not r.raise_for_status()."""
    # When the server returns 422 with a body, the body must appear in the error.
    responses = [
        _make_response(422, {"message": "eval_spec_id is required", "statusCode": 422}),
    ]
    transport = _make_transport_sequence(responses)
    http = httpx.Client(base_url="http://localhost:3000", transport=transport)
    resource = RunsResource(http)

    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        resource.get("bad-run-id")

    assert "eval_spec_id is required" in str(exc_info.value)
    http.close()


# ---------------------------------------------------------------------------
# FIX 5 — HIGH-2: __exit__ must not suppress the original exception
# ---------------------------------------------------------------------------

def test_context_manager_exit_suppresses_close_error_not_original():
    """If close() raises inside __exit__, the original exception must propagate."""

    class BrokenClient(EvalOpsClient):
        def close(self) -> None:
            raise RuntimeError("close() failed")

    client = BrokenClient(base_url="http://localhost:3000", token="test")

    with pytest.raises(ValueError, match="original error"):
        with client:
            raise ValueError("original error")


def test_context_manager_exit_swallows_close_error_when_no_exception():
    """If there is no original exception, close() errors must be silently swallowed."""

    class BrokenClient(EvalOpsClient):
        def close(self) -> None:
            raise RuntimeError("close() failed")

    client = BrokenClient(base_url="http://localhost:3000", token="test")

    # Should not raise even though close() raises
    with client:
        pass  # no exception from the body
