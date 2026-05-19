---
title: "@nexuvia/occ"
sidebar_position: 4
---

# @nexuvia/occ

HTTP client for SAP Commerce Cloud OCC APIs.

**Zero framework dependencies. Pure TypeScript. Works in Next.js Server Components, Route Handlers, Node.js scripts, Vue/Angular server layers, or any TypeScript runtime.**

---

## Installation

```bash
npm install @nexuvia/occ
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `OccClient` | Core HTTP client — URL building, header injection, HTTP methods |
| `OccConfig` | Client config interface |
| `OccRequestOptions` | Per-request options (`fields`, `query`, `next`) |
| `OccResponse<T>` | HTTP response wrapper |
| `OccError` | Error thrown on non-2xx responses |

---

## Creating a client

```ts
import { OccClient } from '@nexuvia/occ';

const client = new OccClient(
  {
    baseUrl:  'https://api.commerce.example.com',
    basePath: '/occ',
    version:  'v2',
  },
  'my-basesite',  // SAP Commerce baseSite identifier
  'en'            // language code
);
```

:::warning One client per request
Token state (`setAccessToken`) is mutable — never share one client instance across concurrent server requests. Create a new instance per request in Server Components or Route Handlers.
:::

---

## Making requests

### Public endpoints (no auth)

Products, search, and cart endpoints are public — no token needed:

```ts
const response = await client.get<Product>('products/12345', { fields: 'FULL' });
const product  = response.data;
```

### With OCC field projections

```ts
// Request only the fields you need
const response = await client.get<SearchResult>('products/search', {
  query:  'laptop',
  fields: 'products(code,name,price)',
  pageSize: '20',
});
```

---

## Authentication

### Machine token — CMS / SmartEdit endpoints

CMS and SmartEdit live under a custom base path and require a Bearer token:

```ts
import { getStaticToken } from '@nexuvia/auth-server';

const token = await getStaticToken(authConfig); // cached in memory
if (token) client.setAccessToken(token);

client.setBasePath('/customws'); // switch to CMS base path

const response = await client.get('cms/pages', { pageLabelOrId: 'homepage' });
```

### User token — orders / account

```ts
import { getAccessToken } from '@nexuvia/auth-client';

const token = getAccessToken(userId); // from server memory, not cookie
if (token) client.setAccessToken(token);

const response = await client.get(`users/${userId}/orders`);
```

### Auth routing summary

| Endpoint | Token source |
|----------|-------------|
| `/occ` products, search, cart (anonymous) | None |
| `/occ` users, orders, account | `getAccessToken(userId)` — `auth-client` |
| `/{cmsPath}` CMS, SmartEdit | `getStaticToken()` — `auth-server` |

---

## SmartEdit preview

Inject a SmartEdit preview ticket as a query param on all subsequent requests:

```ts
client.setCmsTicketId('abc123'); // adds ?cmsTicketId=abc123 to all requests
```

---

## Next.js ISR / cache control

Pass Next.js cache options per request:

```ts
const response = await client.get<CMSPage>('cms/pages', {
  pageLabelOrId: 'homepage',
  next: { revalidate: 300 }, // 5 minute ISR
});
```

The `next` option is passed through to `fetch()`. It is ignored in non-Next.js environments.

---

## Error handling

`OccClient` throws on non-2xx responses:

| Status | Throws |
|--------|--------|
| 404 | `NotFoundError` (from `@nexuvia/core`) |
| All other non-2xx | `AdapterError` with `.status` set |

```ts
import { NotFoundError, AdapterError } from '@nexuvia/core';

try {
  const response = await client.get('products/NONEXISTENT');
} catch (err) {
  if (err instanceof NotFoundError) {
    // Product doesn't exist
  } else if (err instanceof AdapterError) {
    console.error(`SAP returned ${err.status}`);
  }
}
```

---

## In a Next.js Server Component

Use `NexuviaApp` — `ctx.occ` is pre-wired with the machine token, correct baseSite, and language:

```ts
import { app }     from '@/nexuvia.app';
import { headers } from 'next/headers';

const h        = await headers();
const storeKey = h.get('x-store-key') ?? 'ae';
const ctx      = await app.forRequest(storeKey, lang);
const res      = await ctx.occ.get('products/12345');
```

---

## API reference

```ts
class OccClient {
  constructor(config: OccConfig, baseSite: string, language: string);

  // HTTP methods — all throw on non-2xx
  get<T>(endpoint: string, params?: OccRequestOptions): Promise<OccResponse<T>>;
  post<T>(endpoint: string, body: unknown): Promise<OccResponse<T>>;
  put<T>(endpoint: string, body: unknown): Promise<OccResponse<T>>;
  patch<T>(endpoint: string, body: unknown): Promise<OccResponse<T>>;
  delete<T>(endpoint: string): Promise<OccResponse<T>>;

  // Auth
  setAccessToken(token: string): void;

  // Config modifiers
  setBasePath(path: string): void;     // switch between /occ and /customws
  setCmsTicketId(id: string): void;    // SmartEdit preview ticket
}

interface OccConfig {
  baseUrl:  string;  // e.g. 'https://api.commerce.example.com'
  basePath: string;  // e.g. '/occ'
  version:  string;  // e.g. 'v2'
}

interface OccRequestOptions {
  fields?:    string;                  // OCC field projection
  next?:      { revalidate?: number }; // Next.js ISR options
  [key: string]: string | { revalidate?: number } | undefined; // any other OCC query param
}
```

---

## Checklist

- [ ] One client per request — never share across concurrent requests
- [ ] Public endpoints — no token needed
- [ ] CMS/SmartEdit — `setAccessToken()` + `setBasePath('/customws')`
- [ ] User endpoints — `getAccessToken(userId)` + `setAccessToken()`
- [ ] In Next.js pages, use `app.forRequest()` → `ctx.occ` — don't create `OccClient` instances manually in page files
