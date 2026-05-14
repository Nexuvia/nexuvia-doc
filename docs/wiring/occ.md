---
title: Wiring @nexuvia/occ
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## Wiring `@nexuvia/occ`

`@nexuvia/occ` is the HTTP client every other commerce library uses. **You never construct it directly in your app code** — only in the factory functions under your `config/` (or `server/config/`) layer.

The OCC client is **server-only**. Never import it into browser code.

---

## What you build (the 4 layers)

| Layer | What |
| ----- | ---- |
| **Config** | `nexuvia.config.ts` — host, paths, base site |
| **Bridge** | `getOccConfig()` in `config/hybris.ts` |
| **Server factory** | `createServerOccClient(storeKey, lang)` — with machine token from `auth-server` |
| **Route factory** | `createRouteOccClient(baseSite, lang)` — no token (public OCC endpoints) |
| **Layers 2 / 3 / 4** | None — `OccClient` is consumed inside other libraries (CMS, product, search, cart) |

---

## Step 1 — Config

```ts
// nexuvia.config.ts
hybris: {
  protocol:    process.env.HYBRIS_PROTOCOL || 'https',
  host:        process.env.HYBRIS_HOST     || '',     // 'occ.example.com'
  port:        process.env.HYBRIS_PORT     || '',     // leave empty for default 443/80
  version:     'v2',
  occBasePath: '/occ',                                // public OCC path
  cmsBasePath: '/customws',                           // protected CMS path
},
```

```bash
# .env.local / .env / server .env
HYBRIS_HOST=occ.example.com
HYBRIS_PROTOCOL=https
```

---

## Step 2 — Bridge files

Two factory functions — copy the appropriate template for your framework.

### `createServerOccClient` — with machine OAuth token

Used in Server Components, SSR pages, and server route handlers that call CMS or protected endpoints.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/config/server.ts
import { OccClient }      from '@nexuvia/occ';
import { getStaticToken } from '@nexuvia/auth-server';
import config             from '../nexuvia.config';

export async function createServerOccClient(storeKey: string, lang: string): Promise<OccClient> {
  const { hybris } = config;
  const store      = config.stores[storeKey];
  const baseUrl    = `${hybris.protocol}://${hybris.host}${hybris.port ? ':' + hybris.port : ''}`;

  const client = new OccClient(
    { baseUrl, occBasePath: hybris.occBasePath },
    store.baseSite,
    lang,
  );

  const token = await getStaticToken({
    baseUrl,
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });

  if (token) client.setAccessToken(token);
  return client;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express / Hono)">

```ts
// server/config/occ.ts
import { OccClient }      from '@nexuvia/occ';
import { getStaticToken } from '@nexuvia/auth-server';
import config             from '../../nexuvia.config';

export async function createServerOccClient(storeKey: string, lang: string): Promise<OccClient> {
  const { hybris } = config;
  const store      = config.stores[storeKey];
  const baseUrl    = `${hybris.protocol}://${hybris.host}${hybris.port ? ':' + hybris.port : ''}`;

  const client = new OccClient(
    { baseUrl, occBasePath: hybris.occBasePath },
    store.baseSite,
    lang,
  );

  const token = await getStaticToken({
    baseUrl,
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });

  if (token) client.setAccessToken(token);
  return client;
}
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/utils/occ.ts
import { OccClient }      from '@nexuvia/occ';
import { getStaticToken } from '@nexuvia/auth-server';
import config             from '~/nexuvia.config';

export async function createServerOccClient(storeKey: string, lang: string): Promise<OccClient> {
  const { hybris }   = config;
  const store        = config.stores[storeKey];
  const runtimeConfig = useRuntimeConfig();
  const host         = runtimeConfig.hybrisHost || hybris.host;
  const baseUrl      = `${hybris.protocol}://${host}${hybris.port ? ':' + hybris.port : ''}`;

  const client = new OccClient(
    { baseUrl, occBasePath: hybris.occBasePath },
    store.baseSite,
    lang,
  );

  const token = await getStaticToken({
    baseUrl,
    clientId:      config.authServer.clientId,
    clientSecret:  runtimeConfig.oauthClientSecret || config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });

  if (token) client.setAccessToken(token);
  return client;
}
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

```ts
// server/utils/occ.ts  (imported in server.ts)
import { OccClient }      from '@nexuvia/occ';
import { getStaticToken } from '@nexuvia/auth-server';
import config             from './nexuvia.config';

export async function createServerOccClient(storeKey: string, lang: string): Promise<OccClient> {
  const { hybris } = config;
  const store      = config.stores[storeKey];
  const baseUrl    = `${hybris.protocol}://${hybris.host}${hybris.port ? ':' + hybris.port : ''}`;

  const client = new OccClient(
    { baseUrl, occBasePath: hybris.occBasePath },
    store.baseSite,
    lang,
  );

  const token = await getStaticToken({
    baseUrl,
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });

  if (token) client.setAccessToken(token);
  return client;
}
```

</TabItem>
</Tabs>

---

### `createRouteOccClient` — no token

Used for **public OCC endpoints** (products, search, public cart). Lighter — no token fetch.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/config/api-helpers.ts
import { OccClient } from '@nexuvia/occ';
import config        from '../nexuvia.config';

export function createRouteOccClient(baseSite: string, lang: string): OccClient {
  const { hybris } = config;
  const baseUrl    = `${hybris.protocol}://${hybris.host}${hybris.port ? ':' + hybris.port : ''}`;
  return new OccClient({ baseUrl, occBasePath: hybris.occBasePath }, baseSite, lang);
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express / Hono)">

```ts
// server/config/occ.ts  (add to the same file as createServerOccClient)
import { OccClient } from '@nexuvia/occ';
import config        from '../../nexuvia.config';

export function createRouteOccClient(baseSite: string, lang: string): OccClient {
  const { hybris } = config;
  const baseUrl    = `${hybris.protocol}://${hybris.host}${hybris.port ? ':' + hybris.port : ''}`;
  return new OccClient({ baseUrl, occBasePath: hybris.occBasePath }, baseSite, lang);
}
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/utils/occ.ts  (add below createServerOccClient)
import { OccClient } from '@nexuvia/occ';
import config        from '~/nexuvia.config';

export function createRouteOccClient(baseSite: string, lang: string): OccClient {
  const { hybris }    = config;
  const runtimeConfig = useRuntimeConfig();
  const host          = runtimeConfig.hybrisHost || hybris.host;
  const baseUrl       = `${hybris.protocol}://${host}${hybris.port ? ':' + hybris.port : ''}`;
  return new OccClient({ baseUrl, occBasePath: hybris.occBasePath }, baseSite, lang);
}
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

```ts
// server/utils/occ.ts  (add below createServerOccClient)
import { OccClient } from '@nexuvia/occ';
import config        from './nexuvia.config';

export function createRouteOccClient(baseSite: string, lang: string): OccClient {
  const { hybris } = config;
  const baseUrl    = `${hybris.protocol}://${hybris.host}${hybris.port ? ':' + hybris.port : ''}`;
  return new OccClient({ baseUrl, occBasePath: hybris.occBasePath }, baseSite, lang);
}
```

</TabItem>
</Tabs>

---

## When to use which factory

| Use case | Factory | Token? |
| -------- | ------- | ------ |
| Server-side CMS page fetch | `createServerOccClient` | Yes — CMS requires machine token |
| Server-side product / search fetch | `createServerOccClient` | Yes (attached but unused on public OCC) |
| Route handler proxying public cart/search | `createRouteOccClient` | No |
| Route handler for user orders/account | `createRouteOccClient` + `client.setAccessToken(userToken)` | User token from `auth-client` |

---

## Critical rule — never share clients

```ts
// ❌ WRONG — token leaks between users in SSR
const sharedClient = await createServerOccClient('default', 'en');
export { sharedClient };

// ✅ CORRECT — fresh instance per request
export default async function ProductPage({ params }) {
  const client = await createServerOccClient(storeKey, lang);  // new instance each call
  // ...
}
```

`OccClient` carries mutable state (access token, base path). The factories return a new instance on every call — **never cache the result across requests**.

---

## Common errors

| Error | Cause | Fix |
| ----- | ----- | --- |
| `fetch failed` / `ECONNREFUSED` | Wrong `HYBRIS_HOST` | Verify with `curl https://$HYBRIS_HOST/occ/v2/...` |
| `401` on `/customws/...` (CMS) | Missing machine token | Wire [`@nexuvia/auth-server`](/wiring/auth-server) |
| `CORS error` in browser | Used `OccClient` in browser code | Proxy via a server route handler instead |
| `404` on a known good code | Wrong `baseSite` value | Check `nexuvia.config.ts → stores.{key}.baseSite` |

---

## Checklist

- [ ] `nexuvia.config.ts → hybris` filled in
- [ ] `HYBRIS_HOST` set in env file (never committed)
- [ ] `createServerOccClient` factory created (calls `getStaticToken` internally)
- [ ] `createRouteOccClient` factory created (no token — for public endpoints)
- [ ] `OccClient` is **never** imported into any browser component
- [ ] Each server request creates a **new** client instance — never cached across requests
