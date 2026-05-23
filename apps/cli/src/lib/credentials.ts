import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Credentials {
  apiKey: string;
  apiUrl: string;
}

const CREDS_DIR = path.join(os.homedir(), '.evalops');
const CREDS_FILE = path.join(CREDS_DIR, 'credentials.json');

export function loadCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CREDS_FILE, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
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
