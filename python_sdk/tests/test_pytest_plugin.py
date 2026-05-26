"""Tests for the pytest-evalops plugin."""
from __future__ import annotations

import os
import pytest


def test_evalops_marker_is_registered(pytestconfig: pytest.Config):
    """The 'evalops' marker must be registered in pytest after plugin load."""
    markers = {m.split("(")[0].strip() for m in pytestconfig.getini("markers")}
    assert "evalops" in markers, f"'evalops' marker not found in registered markers: {markers}"


def test_pytest_runtest_call_skips_when_token_not_set(monkeypatch: pytest.MonkeyPatch):
    """pytest_runtest_call must skip (not fail) when EVALOPS_TOKEN is absent."""
    monkeypatch.delenv("EVALOPS_TOKEN", raising=False)

    from evalops.pytest_plugin import pytest_runtest_call

    # Build a minimal fake item with an evalops marker
    marker = pytest.mark.evalops("some-spec.yaml")

    class FakeItem:
        def get_closest_marker(self, name: str):
            if name == "evalops":
                return marker.mark
            return None

    with pytest.raises(pytest.skip.Exception):
        pytest_runtest_call(FakeItem())  # type: ignore[arg-type]
