from __future__ import annotations
from typing import Optional
import httpx
from ..models import PersonalAccessToken, CreateTokenResponse
from .._http import _raise_for_status


class TokensResource:
    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def create(
        self,
        name: str,
        ttl_days: Optional[int] = 90,
        scopes: Optional[list[str]] = None,
    ) -> CreateTokenResponse:
        payload: dict = {"name": name, "ttlDays": ttl_days}
        if scopes is not None:
            payload["scopes"] = scopes
        r = self._http.post("/api/auth/tokens", json=payload)
        _raise_for_status(r)
        return CreateTokenResponse.model_validate(r.json())

    def list(self) -> list[PersonalAccessToken]:
        r = self._http.get("/api/auth/tokens")
        _raise_for_status(r)
        return [PersonalAccessToken.model_validate(item) for item in r.json()]

    def revoke(self, token_id: str) -> None:
        r = self._http.delete(f"/api/auth/tokens/{token_id}")
        _raise_for_status(r)
