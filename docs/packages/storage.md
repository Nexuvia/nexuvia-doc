---
title: "@nexuvia/storage"
sidebar_position: 3
---

# @nexuvia/storage

Storage abstraction for the Nexuvia library stack.

**Zero dependencies. Pure TypeScript. SSR-safe — all implementations fall back to `MemoryStorage` when browser APIs are unavailable.**

---

## Installation

```bash
npm install @nexuvia/storage
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `StorageAdapter` | Interface — the contract all implementations follow |
| `CookieStorage` | `document.cookie` — SSR-safe, falls back to Memory on server |
| `LocalStorage` | `window.localStorage` — SSR-safe, falls back to Memory on server |
| `MemoryStorage` | Plain `Map` — always works, data lost on page reload |
| `StorageSetOptions` | Options for `set()` — `maxAge`, `path`, `secure`, `httpOnly` |

---

## The interface

```ts
interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string, options?: StorageSetOptions): void;
  remove(key: string): void;
  clear(): void;
}

interface StorageSetOptions {
  maxAge?:   number;   // seconds
  path?:     string;   // default '/'
  secure?:   boolean;
  httpOnly?: boolean;  // metadata only — CookieStorage uses document.cookie which can't set httpOnly
}
```

---

## CookieStorage

Reads and writes `document.cookie`. SSR-safe — falls back to `MemoryStorage` when running on the server (where `document` is not available).

```ts
import { CookieStorage } from '@nexuvia/storage';

const storage = new CookieStorage();

// Write (expires in 48 hours)
storage.set('cart_id', 'abc123', { maxAge: 48 * 60 * 60 });

// Read
const cartId = storage.get('cart_id'); // 'abc123'

// Remove
storage.remove('cart_id');

// Clear all cookies set by this instance
storage.clear();
```

**Used by:** `@nexuvia/cart` — persists the cart ID in a 48-hour browser cookie.

---

## LocalStorage

Reads and writes `window.localStorage`. Falls back to `MemoryStorage` on server.

```ts
import { LocalStorage } from '@nexuvia/storage';

const storage = new LocalStorage();

storage.set('user_prefs', JSON.stringify({ theme: 'dark' }));
const prefs = JSON.parse(storage.get('user_prefs') ?? '{}');
```

---

## MemoryStorage

Plain `Map` — always works, no browser APIs needed. Data is lost on page reload or server restart.

```ts
import { MemoryStorage } from '@nexuvia/storage';

const storage = new MemoryStorage();

storage.set('session_token', 'xyz');
console.log(storage.get('session_token')); // 'xyz'
```

Useful for:
- Tests (predictable, isolated)
- SSR environments where you need a fallback
- Ephemeral state that doesn't need to survive page reloads

---

## Swapping implementations

The `StorageAdapter` interface lets you swap without changing call sites:

```ts
const storage: StorageAdapter = isServer
  ? new MemoryStorage()
  : new CookieStorage();

// Usage is identical regardless of implementation
storage.set('key', 'value');
storage.get('key');
```

---

## In tests

```ts
import { MemoryStorage } from '@nexuvia/storage';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart';

const storage = new MemoryStorage();
const client  = new CartClient(new ProxyCartAdapter({ baseSite: 'test', language: 'en' }), storage);

// Assert that cart ID is persisted
await client.fetchCart();
expect(storage.get('cart_id')).not.toBeNull();
```

---

## SSR safety

Both `CookieStorage` and `LocalStorage` check for browser globals before trying to access them:

```
Server (Node.js / Edge):     CookieStorage → MemoryStorage (transparent fallback)
Client (browser):            CookieStorage → document.cookie
```

You don't need to guard `storage.get()` calls with `typeof window !== 'undefined'`. The fallback happens inside the implementation.
