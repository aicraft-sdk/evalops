"""Internal HTTP utilities shared by client and resource modules."""
from __future__ import annotations
import httpx


def _raise_for_status(response: httpx.Response) -> None:
    """Raise HTTPStatusError with the response body included in the message."""
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:500] if exc.response.text else "(no body)"
        raise httpx.HTTPStatusError(
            f"HTTP {exc.response.status_code} from {exc.request.url}: {body}",
            request=exc.request,
            response=exc.response,
        ) from exc
