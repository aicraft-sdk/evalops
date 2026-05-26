from __future__ import annotations
import time
import httpx
from ..models import Run
from .._http import _raise_for_status


class RunsResource:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def create(self, eval_spec_id: str) -> Run:
        r = self._http.post("/api/core/runs", json={"evalSpecId": eval_spec_id})
        _raise_for_status(r)
        return Run.model_validate(r.json())

    def get(self, run_id: str) -> Run:
        r = self._http.get(f"/api/core/runs/{run_id}")
        _raise_for_status(r)
        return Run.model_validate(r.json())

    def wait_for(self, run_id: str, timeout_ms: int = 120_000, poll_ms: int = 2_000) -> Run:
        deadline = time.monotonic() + timeout_ms / 1000
        transient_errors = 0
        max_transient = 5
        while time.monotonic() < deadline:
            try:
                run = self.get(run_id)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code >= 500:
                    transient_errors += 1
                    if transient_errors >= max_transient:
                        raise TimeoutError(
                            f"Run {run_id}: too many transient server errors ({transient_errors})"
                        ) from exc
                    time.sleep(poll_ms / 1000)
                    continue
                raise  # re-raise 4xx immediately
            if run.status in ("completed", "failed"):
                return run
            time.sleep(poll_ms / 1000)
        raise TimeoutError(f"Run {run_id} did not complete within {timeout_ms}ms")
