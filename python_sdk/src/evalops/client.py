from __future__ import annotations
import httpx
from ._http import _raise_for_status  # re-exported for external consumers
from .resources.datasets import DatasetsResource
from .resources.specs import SpecsResource
from .resources.runs import RunsResource
from .resources.agents import AgentsResource
from .resources.policies import PoliciesResource
from .resources.tokens import TokensResource

__all__ = ["EvalOpsClient", "_raise_for_status"]


class EvalOpsClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        timeout: float = 30.0,
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=timeout,
        )
        self.datasets = DatasetsResource(self._http)
        self.specs = SpecsResource(self._http)
        self.runs = RunsResource(self._http)
        self.agents = AgentsResource(self._http)
        self.policies = PoliciesResource(self._http)
        self.tokens = TokensResource(self._http)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "EvalOpsClient":
        return self

    def __exit__(self, *args: object) -> None:
        try:
            self.close()
        except Exception:  # noqa: BLE001
            pass
