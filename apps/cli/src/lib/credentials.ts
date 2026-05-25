import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Credentials {
  token: string;
  apiUrl: string;
}

const CREDS_DIR = path.join(os.homedir(), '.evalops');
const CREDS_FILE = path.join(CREDS_DIR, 'credentials.json');

export function loadCredentials(): Credentials | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8')) as Record<string, unknown>;
    // Compat: migrate legacy apiKey → token
    if ((raw as { apiKey?: string }).apiKey && !(raw as { token?: string }).token) {
      raw['token'] = raw['apiKey'];
    }
    return raw as unknown as Credentials;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`Warning: could not read credentials (${(err as Error).message}). Run 'evalops login' to re-authenticate.`);
    }
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(CREDS_DIR, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(CREDS_FILE);
  } catch {
    // already gone
  }
}
