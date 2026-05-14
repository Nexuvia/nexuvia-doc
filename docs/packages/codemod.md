---
title: "@nexuvia/codemod"
sidebar_position: 19
---

# @nexuvia/codemod

Automated migration CLI for Nexuvia breaking changes. Transforms source files between Nexuvia versions using AST rewrites — no manual find-and-replace across hundreds of files.

**Uses jscodeshift. Works on TypeScript and JavaScript. Git-safe by default.**

---

## Installation

```bash
npm install -D @nexuvia/codemod
# or run directly without installing:
npx @nexuvia/codemod <path> [transform]
```

---

## Usage

```bash
npx @nexuvia/codemod <path> [transform] [options]
```

| Argument | Description |
|----------|-------------|
| `<path>` | File, directory, or glob to transform |
| `[transform]` | Transform name to run (default: `all`) |

| Option | Description |
|--------|-------------|
| `--dry` | Preview only — list files that would change, nothing is written |
| `--force` | Skip the git status check |
| `--print` | Print the transformed source to stdout instead of writing |

---

## Quick example

```bash
# Preview what would change (no files written)
npx @nexuvia/codemod ./src --dry

# Run all transforms
npx @nexuvia/codemod ./src all

# Run a specific transform
npx @nexuvia/codemod ./src rename-error-base

# Run on a single file and preview the output
npx @nexuvia/codemod src/services/my-service.ts rename-error-base --print
```

---

## Git safety

By default, `@nexuvia/codemod` checks that your working tree is clean before writing any files. This prevents transforms from mixing with uncommitted changes and making diffs hard to read.

```
✖ Working tree has uncommitted changes.
  Commit or stash your changes before running codemods,
  or pass --force to skip this check.
  Use --dry to preview without writing files.
```

To bypass:
- `--dry` — preview without writing (no check needed)
- `--force` — skip the check and write anyway

:::tip Recommended workflow
1. `git stash` or commit your in-progress work
2. Run the codemod
3. Review the diff with `git diff`
4. Commit the codemod changes as a standalone commit
:::

---

## Available transforms

### `rename-error-base`

Renames `HynexusError` → `NexuviaError` in imports and all usages (identifiers + type annotations).

**When to use:** When migrating from Nexuvia v0.1.x to v0.2.x if the base error class is renamed.

**Before:**
```ts
import { HynexusError } from '@nexuvia/core';

class MyError extends HynexusError {
  constructor(message: string) {
    super(message, 'MY_ERROR');
  }
}

function handle(err: HynexusError) { ... }
```

**After:**
```ts
import { NexuviaError } from '@nexuvia/core';

class MyError extends NexuviaError {
  constructor(message: string) {
    super(message, 'MY_ERROR');
  }
}

function handle(err: NexuviaError) { ... }
```

---

### `result-api`

Migrates `Result<T, E>` accessor renames (placeholder for v0.2 API changes).

**When to use:** If `Result.value`/`Result.error` are renamed in a future Nexuvia release.

---

### `config-v2`

Migrates `nexuvia.config.ts` shape changes from v0.1 to v0.2 (placeholder for config schema changes).

**When to use:** When the `nexuvia.config.ts` schema changes between major versions.

---

### `all`

Runs all transforms in order: `rename-error-base` → `result-api` → `config-v2`.

This is the recommended option when upgrading across a major version — it applies every available migration in the correct sequence.

---

## Output

A successful run looks like:

```
 nexuvia-codemod

→ Running transform: rename-error-base
  ✔ src/services/product-service.ts
  ✔ src/services/cart-service.ts
  ✔ src/utils/error-handler.ts

→ Running transform: result-api
  (no files changed)

→ Running transform: config-v2
  (no files changed)

  Formatting changed files with Prettier…

✔ 3 file(s) updated successfully.
```

Dry run output:

```
 nexuvia-codemod

  Dry run — no files will be written

→ Running transform: rename-error-base
  ✔ src/services/product-service.ts
  ✔ src/services/cart-service.ts

3 file(s) would be changed (dry run).
```

---

## Post-transform formatting

After writing changes, `@nexuvia/codemod` automatically runs Prettier on every modified file. You do not need to run a separate format step.

Prettier is only run when files are actually changed — dry runs skip formatting.

---

## Writing a custom transform

Each built-in transform is a standard jscodeshift transform file. You can write your own:

```ts
// transforms/my-rename.ts
import type { Transform } from 'jscodeshift';

const transform: Transform = (file, api) => {
  const j    = api.jscodeshift;
  const root = j(file.source);
  let changed = false;

  root.find(j.Identifier, { name: 'OldName' }).forEach((path) => {
    path.node.name = 'NewName';
    changed = true;
  });

  return changed ? root.toSource({ quote: 'single' }) : file.source;
};

export default transform;
```

Run it directly with jscodeshift:

```bash
npx jscodeshift --transform ./transforms/my-rename.ts ./src --extensions=ts,tsx --parser=tsx
```

---

## Design decisions

| Decision | Reason |
|----------|--------|
| jscodeshift over ts-morph | Lighter, no tsconfig required, proven in existing ecosystems |
| Git check before writing | Prevents codemods from obscuring in-progress diffs |
| Prettier after transform | jscodeshift output can break whitespace — format restores consistency |
| `--dry` as default recommendation | Inspect before committing is safer than write-then-review |
| One transform per breaking change | Keeps transforms small, testable, and independently revertable |
| `all` runs in fixed order | Transforms can depend on each other (e.g., rename before API migration) |

---

## Checklist

- [ ] Working tree is clean before running (or use `--dry` first)
- [ ] Run `--dry` to confirm affected files look correct before writing
- [ ] Review `git diff` after running — confirm only expected changes
- [ ] Commit codemod changes separately from your own edits
- [ ] Run `tsc --noEmit` after migrating to catch any remaining type errors
