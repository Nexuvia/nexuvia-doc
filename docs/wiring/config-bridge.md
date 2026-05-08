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
| Next.js | `src/config/` |
| Node.js (Express/Hono) backend | `src/config/` (in your backend project) |
| Nuxt 3 | `~/config/` (Nuxt auto-imports from here) |
| Angular | `src/app/config/` |

---

## File 1 — `hybris.ts` (identical in every framework)

URL helpers derived from `config.hybris`. Other config files import from this one.

```ts
// config/hybris.ts
import config from '../../nexuvia.config';

const { hybris } = config;

export function getHybrisBaseUrl(): string {
  const { protocol, host, port } = hybris;
  return `${protocol}://${host}${port ? `:${port}` : ''}`;
}

export function getOccConfig() {
  return {
    baseUrl:  getHybrisBaseUrl(),
    basePath: hybris.occBasePath,
    version:  hybris.version,
  };
}

export function getOccBaseUrl(baseSite: string): string {
  return `${getHybrisBaseUrl()}${hybris.occBasePath}/${hybris.version}/${baseSite}`;
}
```

---

## File 2 — `stores.ts` (identical in every framework)

Store helpers — one place to resolve a store by key or domain.

```ts
// config/stores.ts
import config from '../../nexuvia.config';

export type StoreConfig = (typeof config.stores)[string];

export const stores = config.stores;

export function getStoreConfig(storeKey: string): StoreConfig | undefined {
  return config.stores[storeKey.toLowerCase()];
}

export function getDefaultStore(): StoreConfig {
  // Pick the first store as the fallback
  const firstKey = Object.keys(config.stores)[0];
  return config.stores[firstKey];
}

export function getStoreByDomain(hostname: string): { key: string; config: StoreConfig } | undefined {
  for (const [key, storeConfig] of Object.entries(config.stores)) {
    if (storeConfig.domain === hostname) {
      return { key, config: storeConfig };
    }
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

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/config/server.ts
import { cookies }                                  from 'next/headers';
import { OccClient }                                from '@nexuvia/occ';
import { getStaticToken }                           from '@nexuvia/auth-server';
import { CmsClient, OccCmsAdapter, MockCmsAdapter } from '@nexuvia/cms';
import config                                       from '../../nexuvia.config';
import { getOccConfig, getHybrisBaseUrl }           from './hybris';
import { getStoreConfig, getDefaultStore }          from './stores';

export async function createServerOccClient(storeKey?: string, lang?: string) {
  const cookieStore  = await cookies();
  const resolvedStore = storeKey || cookieStore.get('store')?.value;
  const storeConfig   = getStoreConfig(resolvedStore || '') || getDefaultStore();
  const resolvedLang  = lang || storeConfig.defaultLanguage;

  const client = new OccClient(getOccConfig(), storeConfig.baseSite, resolvedLang);

  const token = await getStaticToken({
    baseUrl:       getHybrisBaseUrl(),
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });
  if (token) client.setAccessToken(token);

  return client;
}

async function loadMockPage(pageLabelOrId: string) {
  try {
    const mod = await import(`../mock/${pageLabelOrId}.json`, { assert: { type: 'json' } });
    return mod.default ?? null;
  } catch { return null; }
}

export function createCmsClient(occClient: OccClient): CmsClient {
  if (config.cms.useMock) return new CmsClient(new MockCmsAdapter(loadMockPage));
  return new CmsClient(new OccCmsAdapter(occClient, config.hybris.cmsBasePath));
}
```

</TabItem>
<TabItem value="node" label="Node.js (Express/Hono)">

```ts
// server/config/server.ts
import { OccClient }                                from '@nexuvia/occ';
import { getStaticToken }                           from '@nexuvia/auth-server';
import { CmsClient, OccCmsAdapter, MockCmsAdapter } from '@nexuvia/cms';
import config                                       from '../../nexuvia.config';
import { getOccConfig, getHybrisBaseUrl }           from './hybris';
import { getStoreConfig, getDefaultStore }          from './stores';

// Pass storeKey + lang as plain arguments — read them from the request in your route handler.
export async function createServerOccClient(storeKey?: string, lang?: string) {
  const storeConfig  = getStoreConfig(storeKey || '') || getDefaultStore();
  const resolvedLang = lang || storeConfig.defaultLanguage;

  const client = new OccClient(getOccConfig(), storeConfig.baseSite, resolvedLang);

  const token = await getStaticToken({
    baseUrl:       getHybrisBaseUrl(),
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });
  if (token) client.setAccessToken(token);

  return client;
}

async function loadMockPage(pageLabelOrId: string) {
  try {
    const mod = await import(`../mock/${pageLabelOrId}.json`, { assert: { type: 'json' } });
    return mod.default ?? null;
  } catch { return null; }
}

export function createCmsClient(occClient: OccClient): CmsClient {
  if (config.cms.useMock) return new CmsClient(new MockCmsAdapter(loadMockPage));
  return new CmsClient(new OccCmsAdapter(occClient, config.hybris.cmsBasePath));
}
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/config/server.ts (or ~/server/utils/nexuvia.ts)
import { OccClient }                                from '@nexuvia/occ';
import { getStaticToken }                           from '@nexuvia/auth-server';
import { CmsClient, OccCmsAdapter, MockCmsAdapter } from '@nexuvia/cms';
import config                                       from '../../nexuvia.config';
import { getOccConfig, getHybrisBaseUrl }           from './hybris';
import { getStoreConfig, getDefaultStore }          from './stores';

// Read cookies via Nuxt's H3 utilities inside your route handler, then pass storeKey + lang.
export async function createServerOccClient(storeKey?: string, lang?: string) {
  const storeConfig  = getStoreConfig(storeKey || '') || getDefaultStore();
  const resolvedLang = lang || storeConfig.defaultLanguage;

  const client = new OccClient(getOccConfig(), storeConfig.baseSite, resolvedLang);

  const token = await getStaticToken({
    baseUrl:       getHybrisBaseUrl(),
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });
  if (token) client.setAccessToken(token);

  return client;
}

async function loadMockPage(pageLabelOrId: string) {
  try {
    const mod = await import(`../mock/${pageLabelOrId}.json`, { assert: { type: 'json' } });
    return mod.default ?? null;
  } catch { return null; }
}

export function createCmsClient(occClient: OccClient): CmsClient {
  if (config.cms.useMock) return new CmsClient(new MockCmsAdapter(loadMockPage));
  return new CmsClient(new OccCmsAdapter(occClient, config.hybris.cmsBasePath));
}
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

```ts
// src/app/config/server.ts (used by server.ts Express handlers in Angular Universal)
import { OccClient }                                from '@nexuvia/occ';
import { getStaticToken }                           from '@nexuvia/auth-server';
import { CmsClient, OccCmsAdapter, MockCmsAdapter } from '@nexuvia/cms';
import config                                       from '../../../nexuvia.config';
import { getOccConfig, getHybrisBaseUrl }           from './hybris';
import { getStoreConfig, getDefaultStore }          from './stores';

export async function createServerOccClient(storeKey?: string, lang?: string) {
  const storeConfig  = getStoreConfig(storeKey || '') || getDefaultStore();
  const resolvedLang = lang || storeConfig.defaultLanguage;

  const client = new OccClient(getOccConfig(), storeConfig.baseSite, resolvedLang);

  const token = await getStaticToken({
    baseUrl:       getHybrisBaseUrl(),
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });
  if (token) client.setAccessToken(token);

  return client;
}

async function loadMockPage(pageLabelOrId: string) {
  try {
    const mod = await import(`../mock/${pageLabelOrId}.json`, { assert: { type: 'json' } });
    return mod.default ?? null;
  } catch { return null; }
}

export function createCmsClient(occClient: OccClient): CmsClient {
  if (config.cms.useMock) return new CmsClient(new MockCmsAdapter(loadMockPage));
  return new CmsClient(new OccCmsAdapter(occClient, config.hybris.cmsBasePath));
}
```

</TabItem>
</Tabs>

:::warning One client per request
`createServerOccClient` returns a **new client per call**. Never cache or reuse the result — the access token is mutable and would leak between users.
:::

---

## File 4 — `api-helpers.ts` (identical in every framework)

Lightweight factory for your route handlers — public OCC endpoints (cart, products, search) don't need the machine token.

```ts
// config/api-helpers.ts
import { OccClient }    from '@nexuvia/occ';
import { getOccConfig } from './hybris';

export function createRouteOccClient(baseSite: string, lang: string = 'en'): OccClient {
  return new OccClient(getOccConfig(), baseSite, lang);
}
```

---

## File 5 — `auth.ts` — self-registers on import (identical in every framework)

This file calls `registerAuthConfig()` at module load time. **Every auth route handler must `import` this file** — that import side-effect performs the registration.

```ts
// config/auth.ts
import { registerAuthConfig }   from '@nexuvia/auth-client';
import { getStaticToken }       from '@nexuvia/auth-server';
import type { AzureStoreConfig } from '@nexuvia/auth-client';
import config                   from '../../nexuvia.config';
import { getHybrisBaseUrl }     from './hybris';

const { hybris, authClient, authServer } = config;

// Fetches a config key from your backend (e.g. `azure.client.id.shop`)
async function fetchHybrisConfigKey(key: string): Promise<string> {
  const url = `${getHybrisBaseUrl()}${hybris.cmsBasePath}/${hybris.version}/configuration?key=${encodeURIComponent(key)}`;
  const token = await getStaticToken({
    baseUrl: getHybrisBaseUrl(),
    clientId: authServer.clientId,
    clientSecret: authServer.clientSecret,
    tokenEndpoint: authServer.tokenEndpoint,
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res  = await fetch(url, { headers, cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`Hybris config key "${key}" failed: ${res.status}`);
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'string' ? parsed : String(parsed);
  } catch { return text.trim(); }
}

// Per-store Azure tenant config — called by auth-client during login
async function getAzureStoreConfig(storeKey: string): Promise<AzureStoreConfig> {
  const storeConfig = config.stores[storeKey.toLowerCase()];
  const baseSite    = storeConfig?.baseSite ?? Object.values(config.stores)[0].baseSite;

  const [authority, clientId, clientSecret] = await Promise.all([
    fetchHybrisConfigKey(`azure.authorization.authority.${baseSite}`),
    fetchHybrisConfigKey(`azure.client.id.${baseSite}`),
    fetchHybrisConfigKey(`azure.secret.${baseSite}`),
  ]);

  return {
    authority,
    clientId,
    clientSecret,
    scope:       `openid profile offline_access ${clientId}`,
    redirectUri: authClient.azure.redirectUri,
  };
}

// Self-execute on import — every route handler that imports this file triggers it
registerAuthConfig({
  session:             authClient.session,
  storeConfigProvider: getAzureStoreConfig,
});
```

:::danger Self-registration is critical
Every auth route handler **must** start with this import line:

```ts
import '../config/auth';   // first line, no other imports above it
```

Without it, calling `getRegisteredAuthConfig()` throws `ConfigError: no config registered`.
:::

---

## File 6 — `smartedit.ts` (identical in every framework)

```ts
// config/smartedit.ts
import type { SmartEditServiceConfig } from '@nexuvia/smartedit';
import config                          from '../../nexuvia.config';
import { getHybrisBaseUrl }            from './hybris';

export function createSmartEditService(): SmartEditServiceConfig {
  return {
    hybrisBaseUrl:  getHybrisBaseUrl(),
    allowedOrigins: config.smartedit.allowedOrigins,
    version:        config.smartedit.previewVersion,
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
