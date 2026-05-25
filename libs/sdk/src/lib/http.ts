export type ApiFetcher = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function makeFetcher(
  base: string,
  headers: Record<string, string>,
  timeout: number,
): ApiFetcher {
  return async function apiFetch<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`EvalOps API ${res.status} ${method} ${path}: ${text}`);
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`EvalOps API timeout after ${timeout}ms`);
      }
      throw err;
    }
  };
}
