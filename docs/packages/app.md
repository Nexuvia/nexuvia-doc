---
title: "@nexuvia/app"
sidebar_position: 0
---

# @nexuvia/app

Single wiring entry point for Nexuvia. Validates your config at startup, auto-registers auth, and returns a fully-wired per-request context from one call.

**Server-only — Node.js `node` condition. Do not import from client bundles.**

---

## Installation

```bash
npm install @nexuvia/app
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `NexuviaApp` | Main class — construct once at app startup |
| `validateConfig` | Standalone validator — throws `ConfigError` with per-field hints |
| `NexuviaRequestContext` | Type — full per-request bundle |
| `NexuviaStoreContext` | Type — store key, config, language |
| `NexuviaAuthContext` | Type — unified auth interface |
| `NexuviaCartContext` | Type — server adapter + client config |

---

## Quick start

```ts
// nexuvia.app.ts — create once, export for reuse
import { NexuviaApp } from '@nexuvia/app';
import config from './nexuvia.config';

export const app = new NexuviaApp(config);
```

```ts
// src/app/[lang]/layout.tsx
import { app } from '@/nexuvia.app';

export default async function Layout({ params, children }) {
  const { lang } = await params;
  const storeKey = resolveStoreKey(request); // from domain or header
  const ctx = await app.forRequest(storeKey, lang, request);

  const page = await ctx.cms.getContentPage('homepage');
  // ctx.product, ctx.search, ctx.cart, ctx.auth also available
}
```

---

## `NexuviaApp` constructor

```ts
new NexuviaApp(config: NexuviaConfig)
```

At construction time it:

1. Validates the full config — throws `ConfigError` with per-field messages on any failure
2. Calls `registerAuthConfig(config.authClient)` if `authClient` is present
3. Logs init summary: store count, mock mode, auth mode

Construct once at module load. Never inside a request handler.

---

## `forRequest(storeKey, language, request?)`

```ts
app.forRequest(storeKey: string, language: string, request?: Request): Promise<NexuviaRequestContext>
```

Returns a fresh wired context for the current request. Each call creates new client instances — never share a context across requests.

```ts
const ctx = await app.forRequest('ae', 'en', request);

ctx.store    // { key: 'ae', config: StoreConfig, language: 'en' }
ctx.occ      // OccClient — direct SAP OCC calls
ctx.cms      // CmsClient — page fetching
ctx.product  // ProductClient — product detail
ctx.search   // SearchClient — search + suggestions
ctx.cart     // { server: OccCartAdapter, clientConfig: ProxyCartAdapterConfig }
ctx.auth     // NexuviaAuthContext | null (null if no authClient configured)
```

Throws `ConfigError` if `storeKey` does not match any entry in `config.stores`.

---

## `NexuviaAuthContext`

When `authClient` is configured, `ctx.auth` provides a unified interface:

```ts
ctx.auth.getSession(cookieHeader)          // SessionUser | null
ctx.auth.buildLoginUrl(storeKey, nonce)    // Promise<{ url: string }>
ctx.auth.handleCallback(code, storeKey)    // Promise<{ user, token }>
ctx.auth.buildLogoutUrl(storeKey)          // Promise<{ url: string }>
ctx.auth.buildClearCookies()               // string[] — Set-Cookie headers to clear session
```

---

## `validateConfig(config)`

Exported standalone for use in `nexuvia check` and testing:

```ts
import { validateConfig } from '@nexuvia/app';
import config from './nexuvia.config';

validateConfig(config); // throws ConfigError on failure, returns void on success
```

Validates:

| Field | Rule |
|-------|------|
| `hybris.host`, `protocol`, `occBasePath`, `cmsBasePath`, `version` | Non-empty string |
| `stores` | At least one entry; each entry has `baseSite`, `domain`, `supportedLanguages`, `defaultLanguage` |
| `cms.useMock` | Boolean |
| `cms.pageLabels.homepage` | Non-empty string |
| `authServer.*` | All three fields required when `authServer` is present |
| `authClient.session.encryptionKey` | Non-empty string when `authClient` is present |
| `authClient.storeConfigProvider` | Must be a function when `authClient` is present |

On failure it throws a `ConfigError` whose message lists every failing field with a fix hint:

```
[nexuvia/app] Invalid config. Fix the following fields in nexuvia.config.ts:

  ✗  hybris.host
       Must be a non-empty string, e.g. "api.example.com"

  ✗  authClient.storeConfigProvider
       Required — async function (storeKey: string) => AzureStoreConfig
```

---

## Cache TTL

Pass `config.cache` to override default TTLs for all clients:

```ts
// nexuvia.config.ts
cache: {
  cmsTtl:     10 * 60 * 1000,  // 10 min (default: 5 min)
  productTtl:  5 * 60 * 1000,  // no default without this
  searchTtl:   2 * 60 * 1000,  // default: 2 min
},
```

---

## Replacing the manual config bridge

Before `@nexuvia/app`, wiring required six config bridge files and manual client construction in every layout. The equivalent in `0.2.0`:

**Before:**

```ts
// config/server.ts — one of six files
import { createServerOccClient, createCmsClient } from '@/config/server';

const occClient = await createServerOccClient(storeKey, lang);
const cmsClient = createCmsClient(occClient);
const page = await cmsClient.getContentPage('homepage');
```

**After:**

```ts
import { app } from '@/nexuvia.app';

const ctx = await app.forRequest(storeKey, lang, request);
const page = await ctx.cms.getContentPage('homepage');
```

The manual config bridge approach still works — `@nexuvia/app` is not required. Use it when you want one-line wiring with startup validation.

---

## Checklist

- [ ] `nexuvia.app.ts` at project root — `export const app = new NexuviaApp(config)`
- [ ] `app` imported as a module-level singleton (not created inside request handlers)
- [ ] `npx nexuvia check` passes before deploying
- [ ] `forRequest()` called once per request, not cached across requests
