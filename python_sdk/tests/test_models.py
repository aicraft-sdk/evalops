"""Tests for Pydantic v2 model validation."""
from __future__ import annotations

import pytest
from evalops.models import Run, CreateTokenResponse


def test_run_model_with_all_required_fields():
    run = Run(
        id="run-1",
        organizationId="org-1",
        evalSpecId="spec-1",
        status="pending",
    )
    assert run.id == "run-1"
    assert run.organizationId == "org-1"
    assert run.evalSpecId == "spec-1"
    assert run.status == "pending"
    assert run.decision is None


def test_run_model_with_optional_decision_none():
    run = Run(
        id="run-2",
        organizationId="org-2",
        evalSpecId="spec-2",
        status="completed",
        decision=None,
    )
    assert run.decision is None
    assert run.status == "completed"


def test_create_token_response_with_token_field():
    resp = CreateTokenResponse(
        id="tok-1",
        name="my-token",
        token="evops_pat_abc123",
        scopes=["runs:write", "specs:write"],
        createdAt="2026-01-01T00:00:00Z",
    )
    assert resp.token == "evops_pat_abc123"
    assert "runs:write" in resp.scopes
    assert resp.expiresAt is None
