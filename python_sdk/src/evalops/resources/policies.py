from __future__ import annotations
from typing import Any
import httpx
from .._http import _raise_for_status


class PoliciesResource:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def check(self, run_id: str) -> dict[str, Any]:
        r = self._http.get(f"/api/core/policies/check/{run_id}")
        _raise_for_status(r)
        return r.json()
