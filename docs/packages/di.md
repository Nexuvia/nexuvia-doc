---
title: "@nexuvia/di"
sidebar_position: 18
---

# @nexuvia/di

Framework-agnostic dependency injection container. Works identically in Next.js, React, Vue, Angular, Nuxt, plain Node.js, and any other TypeScript runtime.

**Zero runtime dependencies. No decorators. No `reflect-metadata`. TypeScript 5 compatible.**

---

## Installation

```bash
npm install @nexuvia/di
```

Peer dependency: `@nexuvia/core` (for `ConfigError`).

---

## Why use this?

Nexuvia libraries are already wired by `@nexuvia/app` and the config bridge. `@nexuvia/di` is for **your own application services** — feature flags, tenant-specific adapters, custom formatters, or anything you want to inject without framework-specific DI.

The key benefits:
- **No decorators** — fully compatible with TypeScript strict mode and modern bundlers (Vite, Rspack, esbuild)
- **SSR-safe** — no global state, each `new Container()` is isolated
- **Per-request scoping** — `createScope()` gives fresh scoped instances per request while sharing singletons

---

## What's exported

| Export | What it is |
|--------|-----------|
| `Token<T>` | Typed key for a registered service |
| `Container` | DI container — register, resolve, scope |
| `Factory<T>` | Type alias — `(container: Container) => T` |
| `Lifetime` | `'singleton' \| 'scoped'` |

---

## Core concepts

### `Token<T>`

A typed key. Create one per service:

```ts
import { Token } from '@nexuvia/di';

export const LoggerToken = new Token<Logger>('Logger');
export const CacheToken  = new Token<Cache>('Cache');
```

The generic parameter `T` is the type of the resolved value. The string `id` is for error messages and `validate()` output.

### Lifetime

| Lifetime | Behaviour |
|----------|-----------|
| `'singleton'` (default) | One instance per container — shared across all calls |
| `'scoped'` | One instance per `createScope()` call — fresh per request |

---

## Quick start

```ts
import { Container, Token } from '@nexuvia/di';

// Tokens
const DbToken     = new Token<Database>('Database');
const ServiceToken = new Token<UserService>('UserService');

// Build the container once at app startup
const container = new Container();

container.register(DbToken, () => new Database(process.env.DATABASE_URL!), 'singleton');
container.register(ServiceToken, (c) => new UserService(c.get(DbToken)), 'singleton');

// Validate at startup — throws ConfigError with a list of missing tokens
container.validate();

// Resolve
const service = container.get(ServiceToken);
```

---

## Per-request scoping

For SSR applications, create a child scope per request. Singletons are shared; scoped services get fresh instances:

```ts
// Singleton — constructed once, shared across all requests
container.register(DbToken, () => new Database(url), 'singleton');

// Scoped — fresh instance per request
container.register(RequestContextToken, () => new RequestContext(), 'scoped');

// --- Per request ---
const scope = container.createScope();

const db     = scope.get(DbToken);           // the shared singleton instance
const ctx    = scope.get(RequestContextToken); // fresh instance for this request
```

---

## Usage across frameworks

### Next.js (App Router)

```ts
// nexuvia-container.ts — constructed once at module level
import { Container, Token } from '@nexuvia/di';
import { MyService }        from '@/services/my-service';

export const MyServiceToken = new Token<MyService>('MyService');

const container = new Container();
container.register(MyServiceToken, () => new MyService(), 'singleton');
container.validate();

export { container };
```

```tsx
// src/app/[lang]/page.tsx — scoped per request
import { container, MyServiceToken } from '@/nexuvia-container';

export default async function Page() {
  const scope   = container.createScope();
  const service = scope.get(MyServiceToken);
  const data    = await service.getData();
  return <div>{data.title}</div>;
}
```

### Vue (Nuxt 3)

```ts
// plugins/di.ts
import { container, MyServiceToken } from '~/nexuvia-container';

export default defineNuxtPlugin((nuxtApp) => {
  const scope = container.createScope();
  nuxtApp.provide('myService', scope.get(MyServiceToken));
});
```

### Angular

```ts
// app.config.ts
import { container, MyServiceToken } from './nexuvia-container';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: MY_SERVICE_TOKEN, useFactory: () => container.get(MyServiceToken) },
  ],
};
```

### Plain Node.js (Express / Hono)

```ts
app.use((req, res, next) => {
  req.di = container.createScope();
  next();
});

app.get('/api/data', (req, res) => {
  const service = req.di.get(MyServiceToken);
  res.json(await service.getData());
});
```

---

## Dependency chaining

The factory function receives the container — use it to resolve dependencies:

```ts
const LoggerToken  = new Token<Logger>('Logger');
const CacheToken   = new Token<Cache>('Cache');
const ServiceToken = new Token<ProductService>('ProductService');

container.register(LoggerToken,  () => new Logger('product'), 'singleton');
container.register(CacheToken,   () => new MemoryCache(), 'singleton');
container.register(ServiceToken, (c) => new ProductService(
  c.get(LoggerToken),
  c.get(CacheToken),
), 'singleton');
```

---

## `Container` API

```ts
class Container {
  // Register a service with a factory function
  register<T>(
    token:    Token<T>,
    factory:  Factory<T>,
    lifetime?: 'singleton' | 'scoped'   // default: 'singleton'
  ): this

  // Resolve a service — throws ConfigError if not registered
  get<T>(token: Token<T>): T

  // Resolve a service — returns undefined if not registered
  getOptional<T>(token: Token<T>): T | undefined

  // Create a child scope — singletons inherited, scoped services fresh
  createScope(): Container

  // Dry-run all factories and report missing tokens
  // Throws ConfigError with per-token hints on failure
  // Call once at app startup
  validate(): void

  // List all registered token IDs — useful for debugging
  registeredTokens(): string[]
}
```

---

## `validate()`

Call once during startup to catch missing registrations before the first request:

```ts
container.validate();
// Throws ConfigError if any factory throws when dry-run with the container
// Example error message:
//   [nexuvia/di] Container validation failed:
//     Token(Database): ConfigError: Token(Database) is not registered
```

---

## `getOptional()`

Use when a service is truly optional:

```ts
const featureFlags = container.getOptional(FeatureFlagsToken);

if (featureFlags) {
  const enabled = featureFlags.isEnabled('new-checkout');
}
```

---

## Design decisions

| Decision | Reason |
|----------|--------|
| No global container | Isolated per `new Container()` — safe for SSR and tests |
| No decorators / reflect-metadata | Works with TypeScript 5 strict mode and all modern bundlers |
| Factory receives `Container` | Enables dependency chaining without a separate register step |
| `createScope()` not `createChild()` | Scope = per-request; singleton state lives in the parent |
| `validate()` dry-runs at startup | Fails loudly at boot instead of at first user request |
| Two lifetimes only | Three (including transient) adds mental overhead without clear benefit |

---

## Checklist

- [ ] Container constructed once at module load — never inside a request handler
- [ ] `container.validate()` called at startup before the server accepts traffic
- [ ] Per-request services use `createScope()` — never reuse a scope across requests
- [ ] All tokens defined with a unique `id` string (used in error messages)
- [ ] `getOptional()` used for optional services — `get()` throws on missing
