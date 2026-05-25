import * as cp from 'child_process';
import { loadConfig } from '../lib/config';
import { loadCredentials } from '../lib/credentials';

const OK = '[OK]';
const WARN = '[WARN]';
const FAIL = '[FAIL]';

function check(label: string, status: 'ok' | 'warn' | 'fail', detail?: string): void {
  const icon = status === 'ok' ? OK : status === 'warn' ? WARN : FAIL;
  const suffix = detail ? `  (${detail})` : '';
  console.log(`  ${icon}  ${label}${suffix}`);
}

function execSync(cmd: string): string | null {
  try {
    return cp.execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
}

async function checkUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp.ok || resp.status < 500;
  } catch {
    return false;
  }
}

export async function runDoctor(_args: string[]): Promise<void> {
  let allOk = true;

  console.log('\nEvalOps Doctor — environment check\n');

  // Node.js
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  if (nodeMajor >= 20) {
    check(`Node.js ${nodeVer}`, 'ok');
  } else {
    check(`Node.js ${nodeVer}`, 'fail', 'v20+ required');
    allOk = false;
  }

  // Docker
  const dockerVer = execSync('docker --version');
  if (dockerVer) {
    check('Docker', 'ok', dockerVer.replace('Docker version ', '').split(',')[0]);
  } else {
    check('Docker', 'warn', 'not found — needed for local Postgres/Redis');
  }

  // Auth
  const config = loadConfig();
  const creds = loadCredentials();
  if (process.env['EVALOPS_TOKEN'] || process.env['EVALOPS_API_KEY']) {
    check('Auth', 'ok', 'EVALOPS_TOKEN set via env');
  } else if (creds?.token) {
    check('Auth', 'ok', '~/.evalops/credentials.json found');
  } else {
    check('Auth', 'fail', 'no credentials — run `evalops login`');
    allOk = false;
  }

  // API URL
  const apiUrl = config.apiUrl;
  console.log(`\n  Checking connectivity to: ${apiUrl}`);

  const gatewayOk = await checkUrl(`${apiUrl}/health`);
  check('API Gateway', gatewayOk ? 'ok' : 'fail', gatewayOk ? apiUrl : `unreachable at ${apiUrl}/health`);
  if (!gatewayOk) allOk = false;

  if (gatewayOk) {
    const services = [
      { name: 'auth-service',        port: 3001 },
      { name: 'core-service',        port: 3002 },
      { name: 'evaluation-service',  port: 3003 },
      { name: 'integration-service', port: 3004 },
      { name: 'analytics-service',   port: 3005 },
    ];
    const localBase = apiUrl.replace(':3000', '');
    for (const svc of services) {
      const ok = await checkUrl(`${localBase}:${svc.port}/health`);
      check(svc.name, ok ? 'ok' : 'warn', ok ? `:${svc.port}` : `not responding on :${svc.port}`);
    }
  }

  // Required env vars (informational)
  const missingEnv: string[] = [];
  for (const v of ['JWT_SECRET', 'SERVICE_SECRET']) {
    if (!process.env[v]) missingEnv.push(v);
  }
  if (missingEnv.length > 0) {
    check('Service env vars', 'warn', `not set: ${missingEnv.join(', ')} (only needed when running services)`);
  } else {
    check('Service env vars', 'ok', 'JWT_SECRET and SERVICE_SECRET set');
  }

  console.log('');
  if (allOk) {
    console.log('Everything looks good!\n');
  } else {
    console.log('Some checks failed. Fix the issues above and re-run `evalops doctor`.\n');
    process.exit(1);
  }
}
