---
title: "@nexuvia/core"
sidebar_position: 1
---

# @nexuvia/core

Foundation shared by all Nexuvia libraries.

**Zero dependencies. Pure TypeScript. Works in Node.js, browser, and edge runtimes.**

---

## Installation

```bash
npm install @nexuvia/core
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `EventEmitter<T>` | Typed pub/sub — used by all Client classes |
| `HynexusError` | Base class for all framework errors |
| `AuthError` | Auth failures — token fetch, code exchange, invalid credentials |
| `ConfigError` | Missing or invalid configuration |
| `AdapterError` | Upstream HTTP failures — 5xx, network errors, malformed responses |
| `NotFoundError` | Resource not found — 404 equivalent |
| `Result<T,E>` | Success/failure wrapper — replaces throwing for expected failures |
| `ok()` / `err()` | Constructors for `Result` |
| `isOk()` / `isErr()` | Type guards |
| `unwrapOr()` | Extract value with a fallback |
| `unwrapOrThrow()` | Extract value or throw the error |
| `mapOk()` | Transform `Ok` value, pass `Err` through |
| `tapOk()` | Side-effect on `Ok` without changing the result |

---

## EventEmitter

Typed pub/sub. Generic over a map of event name → handler signature — every `emit` call is checked at compile time.

```ts
import { EventEmitter } from '@nexuvia/core';

// Define your event types
interface MyEvents extends Record<string, (...args: any[]) => void> {
  data:  (payload: string) => void;
  error: (err: Error) => void;
}

const emitter = new EventEmitter<MyEvents>();

// Subscribe — returns an unsubscribe function
const off = emitter.on('data', (payload) => {
  console.log('received:', payload);
});

// Emit
emitter.emit('data', 'hello');

// Unsubscribe
off();
```

### One-time subscription

```ts
emitter.once('data', (payload) => {
  console.log('fires once then auto-unsubscribes:', payload);
});
```

### Multiple subscribers

```ts
const off1 = emitter.on('data', (payload) => console.log('handler 1:', payload));
const off2 = emitter.on('data', (payload) => console.log('handler 2:', payload));

emitter.emit('data', 'hello'); // fires both

off1(); // unsubscribe only handler 1
emitter.emit('data', 'world'); // only handler 2 fires
```

### In a class

```ts
class ProductClient {
  private emitter = new EventEmitter<ProductEvents>();

  on<K extends keyof ProductEvents>(event: K, handler: ProductEvents[K]): () => void {
    return this.emitter.on(event, handler);
  }

  async getProduct(code: string) {
    const product = await this.adapter.getProduct(code);
    this.emitter.emit('product', product);
    return product;
  }
}
```

---

## Error hierarchy

```
HynexusError       base — .code (machine-readable) + .message
  AuthError        auth failures — optional .status (HTTP status)
  ConfigError      missing or invalid config
  AdapterError     upstream HTTP failures — .status
  NotFoundError    resource does not exist (404)
```

### Catching errors

```ts
import { HynexusError, AuthError, NotFoundError, AdapterError } from '@nexuvia/core';

try {
  const product = await client.getProduct('INVALID');
} catch (err) {
  if (err instanceof NotFoundError) {
    showNotFound(); // 404 — product doesn't exist
  } else if (err instanceof AdapterError) {
    console.error(`Backend error ${err.status}: ${err.message}`);
  } else if (err instanceof AuthError) {
    redirectToLogin(); // token expired or invalid
  } else if (err instanceof HynexusError) {
    console.error(`Framework error ${err.code}: ${err.message}`);
  } else {
    throw err; // unexpected — rethrow
  }
}
```

### Error codes reference

| Class | `.code` | `.status` | Where thrown |
|-------|---------|-----------|-------------|
| `AuthError` | `AUTH_ERROR` | optional HTTP status | auth-server token fetch, auth-client code exchange |
| `ConfigError` | `CONFIG_ERROR` | — | auth-client when no config registered |
| `AdapterError` | `ADAPTER_ERROR` | HTTP status from upstream | occ, cms adapters on non-404 failure |
| `NotFoundError` | `NOT_FOUND` | — | occ, cms when resource returns 404 |

### Throwing errors (adapter authors)

```ts
import { AdapterError, NotFoundError } from '@nexuvia/core';

async function fetchPage(label: string) {
  const response = await fetch(`/cms/pages/${label}`);

  if (response.status === 404) throw new NotFoundError(`CMS page not found: ${label}`);
  if (!response.ok)            throw new AdapterError(`CMS fetch failed`, response.status);

  return response.json();
}
```

---

## Result\<T\>

A discriminated union of `Ok<T>` and `Err<E>`. Use when a function has a *known* failure path callers must explicitly handle.

```ts
type Result<T, E extends Error = HynexusError> = Ok<T> | Err<E>;
```

### Returning a Result

```ts
import { Result, ok, err, AdapterError } from '@nexuvia/core';

async function getPage(label: string): Promise<Result<CMSPage>> {
  try {
    const data = await fetchFromCms(label);
    return ok(data);
  } catch (e) {
    return err(new AdapterError(e instanceof Error ? e.message : 'Unknown error'));
  }
}
```

### Consuming a Result

```ts
const result = await getPage('homepage');

if (result.ok) {
  render(result.value);       // TypeScript: result.value is CMSPage
} else {
  log(result.error.message);  // TypeScript: result.error is HynexusError
}
```

### With a fallback

```ts
import { unwrapOr } from '@nexuvia/core';

const page = unwrapOr(await getPage('homepage'), null);
// page is CMSPage | null
```

### Throw on error

```ts
import { unwrapOrThrow } from '@nexuvia/core';

const page = unwrapOrThrow(await getPage('homepage'));
// throws result.error if Err, otherwise returns CMSPage
```

### Transform the value

```ts
import { mapOk } from '@nexuvia/core';

const nameResult = mapOk(await getPage('homepage'), (page) => page.name);
// Ok<string> or the original Err
```

### Side-effect without changing the result

```ts
import { tapOk } from '@nexuvia/core';

const result = tapOk(await getPage('homepage'), (page) => {
  console.log('Page fetched:', page.uid);
});
// result unchanged — still Ok<CMSPage> or Err
```

---

## When to use Result vs throw

| Situation | Pattern |
|-----------|---------|
| Expected failure callers must handle | `Result<T>` |
| Unexpected runtime error | `throw` |
| Library boundary exposed to user code | `Result<T>` |
| Internal function within a library | `throw` |

---

## Full API

```ts
class EventEmitter<T extends Record<string, (...args: any[]) => void>> {
  on<K extends keyof T>(event: K, handler: T[K]): () => void;
  once<K extends keyof T>(event: K, handler: T[K]): () => void;  // auto-unsubscribes after first call
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void;
}

class HynexusError extends Error { code: string; }
class AuthError    extends HynexusError { status?: number; }
class ConfigError  extends HynexusError {}
class AdapterError extends HynexusError { status?: number; }
class NotFoundError extends HynexusError {}

type Result<T, E extends Error = HynexusError> = Ok<T> | Err<E>;
function ok<T>(value: T): Ok<T>;
function err<E extends Error>(error: E): Err<E>;
function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
function isErr<T, E>(result: Result<T, E>): result is Err<E>;
function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T;
function unwrapOrThrow<T, E extends Error>(result: Result<T, E>): T;
function mapOk<T, U, E extends Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
function tapOk<T, E extends Error>(result: Result<T, E>, fn: (value: T) => void): Result<T, E>;
```
