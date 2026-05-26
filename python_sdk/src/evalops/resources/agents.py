from __future__ import annotations
import httpx
from ..models import Agent
from .._http import _raise_for_status


class AgentsResource:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def publish_from_file(self, path: str) -> Agent:
        with open(path, "r") as f:
            content = f.read()
        r = self._http.post("/api/core/agents/publish", json={"content": content, "path": path})
        _raise_for_status(r)
        return Agent.model_validate(r.json())

    def list(self) -> list[Agent]:
        r = self._http.get("/api/core/agents")
        _raise_for_status(r)
        return [Agent.model_validate(item) for item in r.json()]
