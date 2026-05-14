---
title: Wiring @nexuvia/auth-server
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/auth-server`

`@nexuvia/auth-server` fetches and caches the **machine OAuth token** your server uses to call protected backend endpoints (CMS, configuration, SmartEdit). Without it, all CMS calls return 401.

**Server-only** — never import in browser code.

---

## What you build (the 4 layers)

| Layer | What |
| ----- | ---- |
| **Config** | `nexuvia.config.ts → authServer` |
| **Bridge** | Called inside `createServerOccClient` (already wired in [OCC wiring](/wiring/occ)) |
| **Layers 2 / 3 / 4** | None — pure server-side helper |

---

## Step 1 — Config

The config shape is identical in every framework:

```ts
// nexuvia.config.ts
authServer: {
  clientId:      process.env.OAUTH_CLIENT_ID      || 'mobile_android',
  clientSecret:  process.env.OAUTH_CLIENT_SECRET  || '',
  tokenEndpoint: '/authorizationserver/oauth/token',
},
```

```bash
# .env.local (Next.js / Nuxt)  /  .env (Vite SPA backend)  /  environment secrets (Angular)
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_secret_here
```

:::danger Secret handling

- Never commit `OAUTH_CLIENT_SECRET` to git
- Never reference it from browser code
- In production, inject via CI/CD sealed secrets (Vercel env vars, GitHub Actions secrets, etc.)

:::

---

## Step 2 — That's it for wiring

`getStaticToken()` is called automatically inside `createServerOccClient` — the factory you wire in [OCC wiring](/wiring/occ). **You do not call it directly from your pages or route handlers.**

The token cache and auto-refresh logic are entirely inside the library. Your app just needs the two config values above.

If you ever need the raw token directly (CLI scripts, non-Nexuvia code):

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js / Node.js">

```ts
import { getStaticToken } from '@nexuvia/auth-server';

const token = await getStaticToken({
  baseUrl:       'https://api.commerce.example.com',
  clientId:      process.env.OAUTH_CLIENT_ID!,
  clientSecret:  process.env.OAUTH_CLIENT_SECRET!,
  tokenEndpoint: '/authorizationserver/oauth/token',
});

const res = await fetch(`https://api.commerce.example.com/customws/v2/shop/cms/pages/homepage`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/utils/token.ts
import { getStaticToken } from '@nexuvia/auth-server';

export async function fetchWithMachineToken(url: string) {
  const runtimeConfig = useRuntimeConfig();
  const token = await getStaticToken({
    baseUrl:       `https://${runtimeConfig.hybrisHost}`,
    clientId:      process.env.OAUTH_CLIENT_ID!,
    clientSecret:  runtimeConfig.oauthClientSecret,
    tokenEndpoint: '/authorizationserver/oauth/token',
  });
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

```ts
// server.ts
import { getStaticToken } from '@nexuvia/auth-server';
import config             from './nexuvia.config';

async function getMachineToken(): Promise<string | null> {
  const { hybris, authServer } = config;
  return getStaticToken({
    baseUrl:       `${hybris.protocol}://${hybris.host}`,
    clientId:      authServer.clientId,
    clientSecret:  authServer.clientSecret,
    tokenEndpoint: authServer.tokenEndpoint,
  });
}
```

</TabItem>
</Tabs>

---

## How caching works

| Situation | Result |
| --------- | ------ |
| First call | Fetches from backend, caches in memory |
| Cached, > 60 s remaining | Returns immediately — no HTTP call |
| Cached, < 60 s remaining | Proactive background refresh |
| Token fetch fails | Returns `null`, logs warning — public OCC endpoints still work |
| Server restart | Cache cleared, re-fetches on first call |

With a typical 12-hour SAP token TTL, your server makes ~2 HTTP calls per day regardless of traffic volume.

The in-memory cache means one token per server process. In multi-process setups (PM2 cluster, Kubernetes pods) each process fetches independently — SAP handles the load easily at ~2 calls per day per process.

---

## Common errors

| Error | Cause | Fix |
| ----- | ----- | --- |
| `getStaticToken returned null` | Empty secret or wrong endpoint | Check `OAUTH_CLIENT_SECRET` and `tokenEndpoint` |
| `401` on `/customws/...` (CMS) | Token not attached to client | Use `createServerOccClient` — it calls `getStaticToken` internally |
| `clientId is invalid` from token endpoint | Wrong `clientId` value | Check what your SAP backend expects (usually `mobile_android`) |
| Token works in dev, `401` in prod | Secret not injected in prod | Add `OAUTH_CLIENT_SECRET` to your deployment secrets |

---

## Checklist

- [ ] `nexuvia.config.ts → authServer` filled in (all 3 fields)
- [ ] `OAUTH_CLIENT_SECRET` in env file (never committed)
- [ ] `OAUTH_CLIENT_SECRET` injected as a sealed secret in production
- [ ] `createServerOccClient` in your OCC bridge calls `getStaticToken` internally
- [ ] No imports of `@nexuvia/auth-server` in any browser component or client bundle
