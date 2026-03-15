---
name: setup-pre-commit
description: Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests in the current repo. Use when user wants to add pre-commit hooks, set up Husky, configure lint-staged, or add commit-time formatting/typechecking/testing.
---

# Setup Pre-Commit Hooks

## What This Sets Up

- **Husky** pre-commit hook
- **lint-staged** running Prettier on all staged files
- **Prettier** config (if missing)
- **typecheck** and **test** scripts in the pre-commit hook

## Steps

### Step 1: Detect Package Manager

Check for `package-lock.json` (npm), `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn), `bun.lockb` (bun). Use whichever is present. Default to npm if unclear.

### Step 2: Install Dependencies

Install as devDependencies:

```bash
npm install --save-dev husky lint-staged prettier
# or
pnpm add -D husky lint-staged prettier
# or
yarn add -D husky lint-staged prettier
# or
bun add -d husky lint-staged prettier
```

### Step 3: Initialize Husky

```bash
npx husky init
```

This creates `.husky/` dir and adds `prepare: "husky"` to package.json.

### Step 4: Create `.husky/pre-commit`

Write this file (no shebang needed for Husky v9+):

```
npx lint-staged
npm run typecheck
npm run test
```

**Adapt**: Replace `npm` with detected package manager. If repo has no `typecheck` or `test` script in package.json, omit those lines and tell the user.

### Step 5: Create `.lintstagedrc`

```json
{
  "*": "prettier --ignore-unknown --write"
}
```

### Step 6: Create `.prettierrc` (if missing)

Only create if no Prettier config exists. Use these defaults:

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": false,
  "trailingComma": "es5",
  "semi": true,
  "arrowParens": "always"
}
```

### Step 7: Verify

- [ ] `.husky/pre-commit` exists and is executable
- [ ] `.lintstagedrc` exists
- [ ] `prepare` script in package.json is `"husky"`
- [ ] `prettier` config exists
- [ ] Run `npx lint-staged` to verify it works

### Step 8: Commit

Stage all changed/created files and commit with message: `Add pre-commit hooks (husky + lint-staged + prettier)`

This will run through the new pre-commit hooks — a good smoke test that everything works.

## Notes

- Husky v9+ doesn't need shebangs in hook files
- `prettier --ignore-unknown` skips files Prettier can't parse (images, etc.)
- The pre-commit runs lint-staged first (fast, staged-only), then full typecheck and tests
- If typecheck or tests are slow, consider running them only on affected files or in CI instead

## Customization

### Custom lint-staged Configuration

You can customize `.lintstagedrc` to run different commands for different file types:

```json
{
  "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md}": ["prettier --write"]
}
```

### Skip Hooks Temporarily

To skip hooks for a single commit:

```bash
git commit --no-verify -m "message"
```

**Warning**: Only use this when absolutely necessary. Pre-commit hooks catch errors early.

## Troubleshooting

**Hooks not running**:
- Verify `.husky/pre-commit` is executable: `chmod +x .husky/pre-commit`
- Check that `prepare` script exists in package.json
- Run `npm run prepare` or `npx husky` to reinitialize

**Prettier conflicts**:
- Ensure `.prettierrc` matches your team's style guide
- Consider adding `.prettierignore` for files that shouldn't be formatted

**Slow pre-commit**:
- Consider running tests only on changed files
- Move slow checks (like full test suite) to CI instead
- Use `lint-staged` to only check staged files
