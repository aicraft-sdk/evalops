/**
 * In-memory Redis facade for evalops dev mode.
 * Implements the ioredis interface for the methods used in this codebase:
 * get, set (with EX), setex, incr, expire, del, exists.
 *
 * NOT a replacement for production Redis — zero persistence, zero pubsub.
 * Used only when EVALOPS_DEV_MODE=1.
 */
export class MemoryRedis {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    exArg?: 'EX' | 'ex',
    ttlSeconds?: number,
  ): Promise<'OK'> {
    const expiresAt =
      exArg && ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<'OK'> {
    return this.set(key, value, 'EX', ttlSeconds);
  }

  async incr(key: string): Promise<number> {
    if (this.isExpired(key)) {
      this.store.set(key, { value: '1', expiresAt: null });
      return 1;
    }
    const current = parseInt(this.store.get(key)?.value ?? '0', 10);
    const next = current + 1;
    const expiresAt = this.store.get(key)?.expiresAt ?? null;
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    if (this.isExpired(key)) return 0;
    const entry = this.store.get(key)!;
    this.store.set(key, { ...entry, expiresAt: Date.now() + ttlSeconds * 1000 });
    return 1;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (!this.isExpired(key)) count++;
    }
    return count;
  }

  /** ioredis compatibility — status property used by some health checks */
  get status(): string {
    return 'ready';
  }

  /** disconnect is a no-op for in-memory */
  disconnect(): void {}
}
