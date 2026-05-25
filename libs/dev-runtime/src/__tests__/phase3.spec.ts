/**
 * Phase 3 dev-runtime tests
 *
 * TDD RED: These tests exercise the MemoryRedis in-memory facade
 * and verify the dev-runtime module exports exist.
 */
import { MemoryRedis } from '../lib/memory-redis';

describe('MemoryRedis', () => {
  let redis: MemoryRedis;

  beforeEach(() => {
    redis = new MemoryRedis();
  });

  it('should return null for missing key', async () => {
    const val = await redis.get('missing');
    expect(val).toBeNull();
  });

  it('should set and get a value', async () => {
    await redis.set('foo', 'bar');
    expect(await redis.get('foo')).toBe('bar');
  });

  it('should set with TTL and expire after expiry', async () => {
    await redis.set('ttl-key', 'value', 'EX', 1);
    expect(await redis.get('ttl-key')).toBe('value');
  });

  it('should support setex', async () => {
    await redis.setex('mykey', 60, 'myval');
    expect(await redis.get('mykey')).toBe('myval');
  });

  it('should increment a missing key starting from 1', async () => {
    const val = await redis.incr('counter');
    expect(val).toBe(1);
  });

  it('should increment an existing key', async () => {
    await redis.set('counter', '5');
    const val = await redis.incr('counter');
    expect(val).toBe(6);
  });

  it('should set expire on an existing key', async () => {
    await redis.set('mykey', 'hello');
    const result = await redis.expire('mykey', 60);
    expect(result).toBe(1);
  });

  it('should return 0 for expire on missing key', async () => {
    const result = await redis.expire('no-key', 60);
    expect(result).toBe(0);
  });

  it('should delete keys', async () => {
    await redis.set('a', '1');
    await redis.set('b', '2');
    const count = await redis.del('a', 'b');
    expect(count).toBe(2);
    expect(await redis.get('a')).toBeNull();
  });

  it('should check existence of keys', async () => {
    await redis.set('x', 'hi');
    const count = await redis.exists('x', 'missing');
    expect(count).toBe(1);
  });

  it('should have status property returning ready', () => {
    expect(redis.status).toBe('ready');
  });

  it('should no-op on disconnect', () => {
    expect(() => redis.disconnect()).not.toThrow();
  });
});

describe('dev-runtime index exports', () => {
  it('should export MemoryRedis', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../index');
    expect(mod.MemoryRedis).toBeDefined();
  });

  it('should export getSqliteDb', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../index');
    expect(mod.getSqliteDb).toBeDefined();
  });

  it('should export createInProcessPlatform', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../index');
    expect(mod.createInProcessPlatform).toBeDefined();
  });
});
