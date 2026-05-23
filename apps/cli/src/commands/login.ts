import axios from 'axios';
import * as readline from 'readline';
import { saveCredentials } from '../lib/credentials';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

function promptPassword(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(question);
  process.stdin.setRawMode?.(true);

  return new Promise(resolve => {
    let password = '';
    process.stdin.once('data', function handler(chunk) {
      // Fall back to normal prompt if raw mode unsupported
      rl.close();
      resolve(chunk.toString().trim());
    });
    // If raw mode not available, readline handles it
    rl.on('line', answer => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function runLogin(args: string[]): Promise<void> {
  let apiUrl = 'http://localhost:3000';
  let emailArg = '';
  let passwordArg = '';

  for (const arg of args) {
    if (arg.startsWith('--url=')) apiUrl = arg.slice('--url='.length);
    else if (arg.startsWith('--email=')) emailArg = arg.slice('--email='.length);
    else if (arg.startsWith('--password=')) passwordArg = arg.slice('--password='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: evalops login [--url=<api-url>] [--email=<email>] [--password=<pw>]');
      return;
    }
  }

  // Read environment overrides
  apiUrl = process.env.EVALOPS_API_URL || apiUrl;

  const email = emailArg || await prompt('Email: ');
  const password = passwordArg || await prompt('Password: ');

  try {
    const resp = await axios.post<{ access_token: string }>(
      `${apiUrl}/api/auth/login`,
      { email, password },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const token = resp.data.access_token;
    saveCredentials({ apiKey: token, apiUrl });
    console.log(`Logged in. Token saved to ~/.evalops/credentials.json`);
    console.log(`API URL: ${apiUrl}`);
  } catch (err: any) {
    const msg = err.response?.data?.message ?? err.message;
    console.error(`Login failed: ${msg}`);
    process.exit(1);
  }
}
