---
name: migrate-to-shoehorn
description: Migrate test files from `as` type assertions to @total-typescript/shoehorn for type-safe test data. Use when user mentions shoehorn, wants to replace `as` in tests, needs partial test data, or works with TypeScript test files containing type assertions.
---

# Migrate to Shoehorn

## Why shoehorn?

`shoehorn` lets you pass partial data in tests while keeping TypeScript happy. It replaces `as` assertions with type-safe alternatives.

**Test code only.** Never use shoehorn in production code.

### Problems with `as` in tests

- Trained not to use it (violates type safety principles)
- Must manually specify target type
- Double-as (`as unknown as Type`) for intentionally wrong data
- No autocomplete for partial objects
- Easy to create invalid test data

### Benefits of shoehorn

- Type-safe partial data creation
- Better autocomplete support
- Clear intent: `fromPartial()` vs `fromAny()` vs `fromExact()`
- No need for double-as assertions
- Works seamlessly with TypeScript

## Install

```bash
npm install --save-dev @total-typescript/shoehorn
# or
pnpm add -D @total-typescript/shoehorn
# or
yarn add -D @total-typescript/shoehorn
```

## Migration Patterns

### Pattern 1: Large Objects with Few Needed Properties

**Before**:

```typescript
type Request = {
  body: { id: string };
  headers: Record<string, string>;
  cookies: Record<string, string>;
  query: Record<string, string>;
  params: Record<string, string>;
  // ...20 more properties
};

it("gets user by id", () => {
  // Only care about body.id but must fake entire Request
  getUser({
    body: { id: "123" },
    headers: {},
    cookies: {},
    query: {},
    params: {},
    // ...fake all 20 properties
  });
});
```

**After**:

```typescript
import { fromPartial } from "@total-typescript/shoehorn";

it("gets user by id", () => {
  getUser(
    fromPartial({
      body: { id: "123" },
    }),
  );
});
```

### Pattern 2: `as Type` → `fromPartial()`

**Before**:

```typescript
getUser({ body: { id: "123" } } as Request);
```

**After**:

```typescript
import { fromPartial } from "@total-typescript/shoehorn";

getUser(fromPartial({ body: { id: "123" } }));
```

### Pattern 3: `as unknown as Type` → `fromAny()`

**Before**:

```typescript
getUser({ body: { id: 123 } } as unknown as Request); // wrong type on purpose
```

**After**:

```typescript
import { fromAny } from "@total-typescript/shoehorn";

getUser(fromAny({ body: { id: 123 } }));
```

### Pattern 4: When You Need Full Object

**Before**:

```typescript
const user = {
  id: "123",
  name: "John",
  email: "john@example.com",
} as User;
```

**After**:

```typescript
import { fromExact } from "@total-typescript/shoehorn";

const user = fromExact({
  id: "123",
  name: "John",
  email: "john@example.com",
});
```

## When to Use Each Function

| Function | Use case | Example |
|----------|----------|---------|
| `fromPartial()` | Pass partial data that still type-checks | `fromPartial({ id: "123" })` |
| `fromAny()` | Pass intentionally wrong data (keeps autocomplete) | `fromAny({ id: 123 })` for string ID |
| `fromExact()` | Force full object (swap with fromPartial later) | `fromExact({ id, name, email })` |

## Workflow

### Step 1: Gather Requirements

Ask the user:

- What test files have `as` assertions causing problems?
- Are they dealing with large objects where only some properties matter?
- Do they need to pass intentionally wrong data for error testing?
- Are there specific patterns they want to migrate?

### Step 2: Install Shoehorn

```bash
npm install --save-dev @total-typescript/shoehorn
```

### Step 3: Find Test Files with `as` Assertions

```bash
# Find test files with 'as' assertions
grep -r " as [A-Z]" --include="*.test.ts" --include="*.spec.ts" .

# Or more specific pattern
grep -r "as [A-Z][a-zA-Z]*" --include="*.test.ts" --include="*.spec.ts" .
```

### Step 4: Migrate Patterns

For each file:

1. **Add import**: `import { fromPartial, fromAny, fromExact } from "@total-typescript/shoehorn";`

2. **Replace `as Type`** with `fromPartial()`:
   ```typescript
   // Before
   getUser({ id: "123" } as User);
   
   // After
   getUser(fromPartial({ id: "123" }));
   ```

3. **Replace `as unknown as Type`** with `fromAny()`:
   ```typescript
   // Before
   getUser({ id: 123 } as unknown as User);
   
   // After
   getUser(fromAny({ id: 123 }));
   ```

4. **Replace full object `as Type`** with `fromExact()` if needed:
   ```typescript
   // Before
   const user = { id: "123", name: "John" } as User;
   
   // After
   const user = fromExact({ id: "123", name: "John" });
   ```

### Step 5: Run Type Check

```bash
npm run typecheck
# or
tsc --noEmit
```

Verify no type errors were introduced.

### Step 6: Run Tests

```bash
npm test
# or
npm run test
```

Ensure all tests still pass.

## Common Migration Scenarios

### Scenario 1: Mock Request Objects

**Before**:
```typescript
const req = {
  body: { id: "123" },
  headers: {},
} as Request;
```

**After**:
```typescript
const req = fromPartial({
  body: { id: "123" },
});
```

### Scenario 2: Error Testing with Wrong Types

**Before**:
```typescript
it("rejects invalid id", () => {
  validateUser({ id: 123 } as unknown as User);
});
```

**After**:
```typescript
it("rejects invalid id", () => {
  validateUser(fromAny({ id: 123 }));
});
```

### Scenario 3: Partial Database Entities

**Before**:
```typescript
const user = { id: "123", email: "test@example.com" } as UserEntity;
```

**After**:
```typescript
const user = fromPartial({
  id: "123",
  email: "test@example.com",
});
```

## Best Practices

- **Use `fromPartial()` by default** - Most common case for partial test data
- **Use `fromAny()` sparingly** - Only when you need intentionally wrong types
- **Use `fromExact()` when migrating** - Can help catch missing required fields
- **Keep imports organized** - Group shoehorn imports with other test utilities
- **Document intent** - Add comments when using `fromAny()` to explain why wrong types are needed

## Integration

- Use with `test-writing` skill for writing new tests with shoehorn from the start
- Use with `test-driven-development` skill to ensure type-safe test data
- Use with `code-standards` skill to maintain consistent test patterns
