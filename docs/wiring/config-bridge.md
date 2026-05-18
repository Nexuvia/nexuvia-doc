---
title: Config Bridge
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Config Bridge — Layer 1

The config bridge is **a small set of files that read your `nexuvia.config.ts` and turn it into the typed objects every Nexuvia library expects**.

Without these files, no library can initialize. They are framework-agnostic — **identical TypeScript across Next.js, Node.js, Nuxt, and Angular** — only the file location changes.

:::tip Why a "bridge"?
Libraries don't import `nexuvia.config.ts` directly — they accept config via constructor parameters. The bridge is the only place that imports your config and translates it into library-shaped objects.
:::

---

## The 6 files you create

```text
your-project/
└── config/                 ← location depends on framework (see below)
    ├── hybris.ts           ← URL helpers
    ├── stores.ts           ← Store helpers
    ├── server.ts           ← Server-side factory: createServerOccClient
    ├── api-helpers.ts      ← Route handler factory: createRouteOccClient
    ├── auth.ts             ← registerAuthConfig (self-executes on import)
    └── smartedit.ts        ← SmartEditServiceConfig builder
```

**Where this folder lives by framework:**

| Framework | Location |
|-----------|----------|
| Next.js (no `src/`) | `config/` at project root |
| Next.js (with `src/`) | `src/config/` |
| Node.js (Express/Hono) backend | `config/` in your backend project |
| Nuxt 3 | `~/config/` (Nuxt auto-imports from here) |
| Angular | `src/app/config/` |

:::tip No `src/` directory?
If your Next.js project has no `src/` folder (the default for `create-next-app` since Next.js 15+), put `config/` at the root alongside `app/`. Set `"@/*": ["./*"]` in `tsconfig.json` so `@/config/...` resolves to `config/...`.
:::

---

## File 1 — `hybris.ts` (identical in every framework)

URL helpers derived from `config.hybris`. Other config files import from this one.

```ts
// config/hybris.ts
import config from '../nexuvia.config';   // adjust depth to match your project layout

export function getHybrisBaseUrl(): string {
  const { protocol, host, port } = config.hybris;
  return port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;
}

export function getOccBasePath(): string {
  return config.hybris.occBasePath;
}

export function getCmsBasePath(): string {
  return config.hybris.cmsBasePath;
}

export function getApiVersion(): string {
  return config.hybris.version;
}
```

---

## File 2 — `stores.ts` (identical in every framework)

Store helpers — one place to resolve a store by key or domain.

```ts
// config/stores.ts
import type { StoreConfig } from '@nexuvia/core';
import config from '../nexuvia.config';

export const stores = config.stores;

export function getStoreConfig(storeKey: string): StoreConfig | undefined {
  return config.stores[storeKey];
}

export function getDefaultStore(): StoreConfig {
  return config.stores[Object.keys(config.stores)[0]];
}

export function getStoreByDomain(hostname: string): { key: string; config: StoreConfig } | undefined {
  for (const [key, store] of Object.entries(config.stores)) {
    if (store.domain === hostname) return { key, config: store };
  }
  return undefined;
}
```

:::tip Local development — multi-store testing
For local dev, set each store's `domain` to a `.local` hostname using `NODE_ENV`, then add the entries to `/etc/hosts`. The proxy resolves store from the `Host` header on every request — product pages, search, cart, Arabic — all work without any special dev code.

```ts
// nexuvia.config.ts
stores: {
  ae: {
    domain: process.env.NODE_ENV === 'production' ? 'www.mystore.ae' : 'mystore.local',
    // ...
  },
  sa: {
    domain: process.env.NODE_ENV === 'production' ? 'www.mystore.sa' : 'mystoressa.local',
    supportedLanguages: ['en', 'ar'],
    // ...
  },
},
```

```bash
# /etc/hosts — add once
127.0.0.1  mystore.local
127.0.0.1  mystoressa.local
```

Then visit `http://mystoressa.local:{port}/ar/` for Arabic KSA locally. See [Proxy / Middleware](/wiring/proxy-middleware#local-development--multi-store-testing) for the full setup.
:::

---

## File 3 — `server.ts` (slight variations per framework)

Server-side factory that returns an OCC client with the machine token already injected.

The function body is identical — only how you read cookies/headers differs:

```ts
// config/server.ts  (same in all frameworks — adjust import depth to match your layout)
import { OccClient }                                from '@nexuvia/occ';
import { CmsClient, OccCmsAdapter, MockCmsAdapter } from '@nexuvia/cms';
import type { OccCmsPageResponse }                  from '@nexuvia/cms';
import { readFileSync }                             from 'fs';
import { join }                                     from 'path';
import { getHybrisBaseUrl, getOccBasePath, getCmsBasePath, getApiVersion } from './hybris';
import { getStoreConfig, getDefaultStore }          from './stores';
import config                                       from '../nexuvia.config';

export function createServerOccClient(storeKey: string, language: string): OccClient {
  const store = getStoreConfig(storeKey) ?? getDefaultStore();
  return new OccClient(
    { baseUrl: getHybrisBaseUrl(), basePath: getOccBasePath(), version: getApiVersion() },
    store.baseSite,
    language,
  );
}

// Reads mock JSON from the project's /mock directory by page label.
// Uses readFileSync (not dynamic import) so it works in all runtimes without JSON import assertions.
async function mockPageLoader(pageLabelOrId: string): Promise<OccCmsPageResponse | null> {
  try {
    const raw = readFileSync(join(process.cwd(), 'mock', `${pageLabelOrId}.json`), 'utf-8');
    return JSON.parse(raw) as OccCmsPageResponse;
  } catch {
    return null;
  }
}

export function createCmsClient(occClient: OccClient): CmsClient {
  const ttl  = config.cache?.cmsTtl;
  const opts = ttl !== undefined ? { ttl } : undefined;

  if (config.cms.useMock) {
    return new CmsClient(new MockCmsAdapter(mockPageLoader), opts);
  }
  return new CmsClient(new OccCmsAdapter(occClient, getCmsBasePath()), opts);
}
```

:::tip Mock data location
Put your mock JSON files in `mock/` at the project root (or `src/mock/` if you have a `src/` directory). Filenames must match page labels exactly: `mock/homepage.json`, `mock/productDetails.json`, etc.

The nexuvia package ships sample mock data — copy it to get started:
```bash
cp node_modules/@nexuvia/cms/dist/mock/*.json mock/
```
:::

:::warning One client per request
`createServerOccClient` returns a **new client per call**. Never cache or reuse the result.
:::

---

## File 4 — `api-helpers.ts` (identical in every framework)

Lightweight factory for your route handlers — public OCC endpoints (cart, products, search) don't need the machine token.

```ts
// config/api-helpers.ts
import { OccClient }                                           from '@nexuvia/occ';
import { getHybrisBaseUrl, getOccBasePath, getApiVersion }    from './hybris';
import { getStoreConfig, getDefaultStore }                     from './stores';

export function createRouteOccClient(storeKey: string, language: string): OccClient {
  const store = getStoreConfig(storeKey) ?? getDefaultStore();
  return new OccClient(
    { baseUrl: getHybrisBaseUrl(), basePath: getOccBasePath(), version: getApiVersion() },
    store.baseSite,
    language,
  );
}
```

---

## File 5 — `auth.ts` — self-registers on import (identical in every framework)

This file calls `registerAuthConfig()` at module load time. **Every auth route handler must `import` this file first** — that import side-effect performs the registration.

The `storeConfigProvider` function belongs in **`nexuvia.config.ts`** — not here. `NexuviaApp` reads it at startup for validation, and `config/auth.ts` re-registers the same config so route handlers (which run in isolated module contexts) also have it.

```ts
// nexuvia.config.ts — storeConfigProvider goes here, not in config/auth.ts
import type { AzureStoreConfig } from '@nexuvia/auth-client';

authClient: {
  session: {
    encryptionKey:   process.env.AUTH_ENCRYPTION_KEY    || '',
    secureCookies:   process.env.NODE_ENV === 'production',
    cookieName:      'auth_session',
    nonceCookieName: 'auth_nonce',
    storeCookieName: 'auth_store',
  },
  storeConfigProvider: async (storeKey: string): Promise<AzureStoreConfig> => {
    return {
      authority:    process.env[`AZURE_AUTHORITY_${storeKey.toUpperCase()}`]    || '',
      clientId:     process.env[`AZURE_CLIENT_ID_${storeKey.toUpperCase()}`]    || '',
      clientSecret: process.env[`AZURE_CLIENT_SECRET_${storeKey.toUpperCase()}`]|| '',
      scope:        process.env[`AZURE_SCOPE_${storeKey.toUpperCase()}`]        || 'openid profile offline_access',
      redirectUri:  process.env[`AZURE_REDIRECT_URI_${storeKey.toUpperCase()}`] || 'http://localhost:3000/auth/callback',
    };
  },
},
```

```ts
// config/auth.ts — just one line
import { registerAuthConfig } from '@nexuvia/auth-client';
import config from '../nexuvia.config';

// Self-registers on import. NexuviaApp registers at startup too, but route handlers
// run in isolated module contexts — this ensures the config is present in every handler.
registerAuthConfig(config.authClient!);
```

:::danger Self-registration is critical
Every auth route handler **must** have this as its first import:

```ts
import '@/config/auth';   // first line — no imports above it
```

Without it, `getRegisteredAuthConfig()` throws `ConfigError: AUTH_CONFIG_MISSING`.
:::

:::danger storeConfigProvider is required
`NexuviaApp` validates at startup that `storeConfigProvider` is a function. If it is missing or commented out, the server will throw `ConfigError: CONFIG_INVALID` on boot — before any request is served.
:::

---

## File 6 — `smartedit.ts` (identical in every framework)

```ts
// config/smartedit.ts
import type { SmartEditServiceConfig } from '@nexuvia/smartedit';
import config                          from '../nexuvia.config';
import { getHybrisBaseUrl }            from './hybris';

export function createSmartEditConfig(): SmartEditServiceConfig {
  return {
    hybrisBaseUrl:  getHybrisBaseUrl(),
    version:        config.smartedit?.previewVersion ?? 'v1',
    allowedOrigins: config.smartedit?.allowedOrigins ?? [],
  };
}
```

---

## Verify your bridge

After creating these files, you should be able to import all of these without errors:

```ts
import { createServerOccClient } from './config/server';
import { createRouteOccClient }  from './config/api-helpers';
import { getStoreByDomain }      from './config/stores';
import { getHybrisBaseUrl }      from './config/hybris';
import './config/auth';   // side-effect import — registers auth config
```

If your project uses TypeScript path aliases (e.g. Next.js / Angular), make sure they're configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

---

## Checklist

- [ ] All 6 files created in your `config/` folder
- [ ] `config/auth.ts` ends with `registerAuthConfig({...})` (self-executes)
- [ ] `nexuvia.config.ts` lives at the project root
- [ ] No `process.env` calls anywhere except inside `nexuvia.config.ts`
- [ ] Your route handlers `import` `config/auth.ts` as the first line
- [ ] `tsconfig.json` path aliases work for the imports above
