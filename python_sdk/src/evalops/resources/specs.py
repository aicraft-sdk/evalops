from __future__ import annotations
from typing import Any
import httpx
from ..models import EvalSpec
from .._http import _raise_for_status


class SpecsResource:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def upsert_from_file(self, path: str) -> EvalSpec:
        with open(path, "r") as f:
            content = f.read()
        r = self._http.post("/api/core/specs/upsert-from-yaml", json={"yaml": content})
        _raise_for_status(r)
        return EvalSpec.model_validate(r.json())

    def upsert(self, spec_dict: dict[str, Any]) -> EvalSpec:
        r = self._http.post("/api/core/specs/upsert", json=spec_dict)
        _raise_for_status(r)
        return EvalSpec.model_validate(r.json())

    def list(self) -> list[EvalSpec]:
        r = self._http.get("/api/core/specs")
        _raise_for_status(r)
        return [EvalSpec.model_validate(item) for item in r.json()]

    def get(self, spec_id: str) -> EvalSpec:
        r = self._http.get(f"/api/core/specs/{spec_id}")
        _raise_for_status(r)
        return EvalSpec.model_validate(r.json())
