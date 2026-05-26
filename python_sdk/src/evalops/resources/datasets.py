from __future__ import annotations
from typing import Any
import httpx
from ..models import Dataset
from .._http import _raise_for_status


class DatasetsResource:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def push(self, name: str, items: list[dict[str, Any]]) -> Dataset:
        r = self._http.post("/api/core/datasets", json={"name": name, "items": items})
        _raise_for_status(r)
        return Dataset.model_validate(r.json())

    def list(self) -> list[Dataset]:
        r = self._http.get("/api/core/datasets")
        _raise_for_status(r)
        return [Dataset.model_validate(item) for item in r.json()]

    def get(self, dataset_id: str) -> Dataset:
        r = self._http.get(f"/api/core/datasets/{dataset_id}")
        _raise_for_status(r)
        return Dataset.model_validate(r.json())
