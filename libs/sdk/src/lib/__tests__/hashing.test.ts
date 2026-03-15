import { hashContent, hashObject, hashArtifact } from '../hashing';

describe('hashContent', () => {
  it('produces a 64-char hex SHA-256 digest for a string', () => {
    const hash = hashContent('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('is stable — same input always produces same output', () => {
    const h1 = hashContent('test content');
    const h2 = hashContent('test content');
    expect(h1).toBe(h2);
  });

  it('is different for different inputs', () => {
    expect(hashContent('foo')).not.toBe(hashContent('bar'));
  });

  it('works with a Buffer', () => {
    const hash = hashContent(Buffer.from('hello', 'utf8'));
    expect(hash).toHaveLength(64);
  });

  it('Buffer and string hash match for same content', () => {
    const str = 'test string';
    expect(hashContent(str)).toBe(hashContent(Buffer.from(str, 'utf8')));
  });
});

describe('hashObject', () => {
  it('produces a consistent hash regardless of key order', () => {
    const h1 = hashObject({ a: 1, b: 2 });
    const h2 = hashObject({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different objects', () => {
    expect(hashObject({ a: 1 })).not.toBe(hashObject({ a: 2 }));
  });
});

describe('hashArtifact', () => {
  it('is an alias for hashContent', () => {
    const content = 'artifact data';
    expect(hashArtifact(content)).toBe(hashContent(content));
  });
});
