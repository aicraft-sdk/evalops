import * as fs from 'fs';
import * as path from 'path';

const EVALOPS_YAML_CONTENT = `# EvalOps project configuration
apiUrl: http://localhost:3000
specDir: ./eval
`;

const DEMO_SPEC_CONTENT = `name: hello-eval
description: Demo evaluation spec
scenarios:
  - id: echo-pass
    name: Echo returns input
    input:
      prompt: "Say hello"
    expected:
      contains: "hello"
  - id: echo-format
    name: Response is non-empty
    input:
      prompt: "Say world"
    expected:
      minLength: 1
`;

export function runInit(args: string[]): void {
  let demo = false;
  let slug = '';

  for (const arg of args) {
    if (arg === '--demo') demo = true;
    else if (arg.startsWith('--name=')) slug = arg.slice('--name='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: evalops init [--demo] [--name <slug>]',
        '',
        'Options:',
        '  --demo        Also create eval/hello.eval.yaml demo spec',
        '  --name <slug> Project name slug (used in config)',
      ].join('\n'));
      return;
    }
  }

  const evalopsYamlPath = path.join(process.cwd(), 'evalops.yaml');

  if (fs.existsSync(evalopsYamlPath)) {
    console.log('evalops.yaml already exists — skipping.');
  } else {
    let content = EVALOPS_YAML_CONTENT;
    if (slug) {
      content = content.replace('specDir: ./eval', `specDir: ./eval\nname: ${slug}`);
    }
    fs.writeFileSync(evalopsYamlPath, content, 'utf-8');
    console.log('Created evalops.yaml');
  }

  if (demo) {
    const evalDir = path.join(process.cwd(), 'eval');
    const demoSpecPath = path.join(evalDir, 'hello.eval.yaml');

    if (!fs.existsSync(evalDir)) {
      fs.mkdirSync(evalDir, { recursive: true });
    }

    if (fs.existsSync(demoSpecPath)) {
      console.log('eval/hello.eval.yaml already exists — skipping.');
    } else {
      fs.writeFileSync(demoSpecPath, DEMO_SPEC_CONTENT, 'utf-8');
      console.log('Created eval/hello.eval.yaml');
    }

    console.log('');
    console.log('Initialized. Run:');
    console.log('  evalops login');
    console.log('  evalops eval eval/hello.eval.yaml --watch');
  } else {
    console.log('');
    console.log('Initialized. Run:');
    console.log('  evalops login');
    console.log('  evalops eval <your-spec.yaml> --watch');
  }
}
