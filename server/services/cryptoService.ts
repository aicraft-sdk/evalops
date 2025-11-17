import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

// Generate a crypto key from the environment secret
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET || 'fallback-dev-secret';
  return crypto.scryptSync(secret, 'salt', KEY_LENGTH);
}

// Generate a hash for the API key for lookup/validation
function generateKeyHash(plainKey: string): string {
  return crypto.createHash('sha256').update(plainKey).digest('hex').substring(0, 32);
}

// Encrypt an API key
export function encryptApiKey(plainKey: string): { encryptedKey: string; keyHash: string } {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipher(ALGORITHM, key);
  cipher.setAAD(Buffer.from('api-key'));
  
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine iv + authTag + encrypted data
  const encryptedData = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  
  return {
    encryptedKey: encryptedData,
    keyHash: generateKeyHash(plainKey)
  };
}

// Decrypt an API key
export function decryptApiKey(encryptedData: string): string {
  const key = getKey();
  const parts = encryptedData.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipher(ALGORITHM, key);
  decipher.setAAD(Buffer.from('api-key'));
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Validate if a plain key matches the stored hash
export function validateKeyHash(plainKey: string, storedHash: string): boolean {
  return generateKeyHash(plainKey) === storedHash;
}