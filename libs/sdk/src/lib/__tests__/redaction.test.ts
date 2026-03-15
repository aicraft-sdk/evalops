import {
  redactEmail,
  redactPhone,
  redactSSN,
  redactCreditCard,
  redactPII,
  redactPIIFromObject,
} from '../redaction';

describe('redactEmail', () => {
  it('redacts a single email address', () => {
    const result = redactEmail('Contact us at user@example.com for help.');
    expect(result).toBe('Contact us at [REDACTED_EMAIL] for help.');
  });

  it('redacts multiple emails', () => {
    const result = redactEmail('a@b.com and c@d.org');
    expect(result).not.toContain('@');
  });

  it('leaves non-email text intact', () => {
    const result = redactEmail('No emails here.');
    expect(result).toBe('No emails here.');
  });
});

describe('redactPhone', () => {
  it('redacts a US phone number (dashes)', () => {
    const result = redactPhone('Call 555-123-4567 now.');
    expect(result).toBe('Call [REDACTED_PHONE] now.');
  });

  it('redacts a phone number with parentheses', () => {
    const result = redactPhone('(555) 123-4567');
    expect(result).not.toMatch(/\d{3}/);
  });
});

describe('redactSSN', () => {
  it('redacts a Social Security Number', () => {
    const result = redactSSN('SSN: 123-45-6789');
    expect(result).toBe('SSN: [REDACTED_SSN]');
  });
});

describe('redactCreditCard', () => {
  it('redacts a credit card number with spaces', () => {
    const result = redactCreditCard('Card: 4111 1111 1111 1111');
    expect(result).toBe('Card: [REDACTED_CC]');
  });

  it('redacts a credit card number with dashes', () => {
    const result = redactCreditCard('4111-1111-1111-1111');
    expect(result).toBe('[REDACTED_CC]');
  });
});

describe('redactPII', () => {
  it('redacts all PII types from a combined string', () => {
    const input = 'Email: user@test.com, Phone: 555-123-4567, SSN: 123-45-6789';
    const result = redactPII(input);
    expect(result).not.toContain('@');
    expect(result).not.toMatch(/555-123-4567/);
    expect(result).not.toMatch(/123-45-6789/);
  });
});

describe('redactPIIFromObject', () => {
  it('redacts PII from string values in a flat object', () => {
    const obj = { email: 'user@test.com', name: 'Alice' };
    const result = redactPIIFromObject(obj) as Record<string, string>;
    expect(result.email).toBe('[REDACTED_EMAIL]');
    expect(result.name).toBe('Alice');
  });

  it('recursively redacts nested objects', () => {
    const obj = { user: { contact: { email: 'a@b.com' } } };
    const result = redactPIIFromObject(obj) as any;
    expect(result.user.contact.email).toBe('[REDACTED_EMAIL]');
  });

  it('redacts PII from array elements', () => {
    const arr = ['user@test.com', 'safe string'];
    const result = redactPIIFromObject(arr) as string[];
    expect(result[0]).toBe('[REDACTED_EMAIL]');
    expect(result[1]).toBe('safe string');
  });

  it('passes through non-string primitives', () => {
    expect(redactPIIFromObject(42)).toBe(42);
    expect(redactPIIFromObject(null)).toBeNull();
    expect(redactPIIFromObject(true)).toBe(true);
  });
});
