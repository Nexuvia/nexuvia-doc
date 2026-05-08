---
title: Wiring @nexuvia/auth-server
sidebar_position: 5
---

# Wiring `@nexuvia/auth-server`

`@nexuvia/auth-server` fetches and caches the **machine OAuth token** your server uses to call protected backend endpoints (CMS, configuration, SmartEdit). Without it, all CMS calls return 401.

**Server-only** — never import in browser code.

---

## What you build (the 4 layers)

| Layer | What |
|-------|------|
| **Layer 1** — Config | `nexuvia.config.ts → authServer` |
| **Layer 1** — Bridge | Used inside `createServerOccClient` and `config/auth.ts` (already wired in [Config Bridge](/wiring/config-bridge)) |
| **Layer 2 / 3 / 4** | None — pure server-side helper |

---

## Step 1 — Config

```ts
// nexuvia.config.ts
authServer: {
  clientId:      process.env.OAUTH_CLIENT_ID      || 'mobile_android',
  clientSecret:  process.env.OAUTH_CLIENT_SECRET  || '',
  tokenEndpoint: '/authorizationserver/oauth/token',
},
```

```bash
# .env.local
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_secret_here
```

:::danger Secret handling
- Never commit `OAUTH_CLIENT_SECRET` to git
- Never reference it from browser code
- In production, inject via CI/CD sealed secrets
:::

---

## Step 2 — That's it for wiring

`getStaticToken()` is called automatically inside `createServerOccClient` (Server Component factory) and inside `config/auth.ts` (when fetching Azure tenant credentials). You **do not call it directly from your pages**.

If you want to use it standalone (e.g. in a CLI script or non-Nexuvia framework):

```ts
import { getStaticToken } from '@nexuvia/auth-server';

const token = await getStaticToken({
  baseUrl:       'https://api.commerce.example.com',
  clientId:      process.env.OAUTH_CLIENT_ID!,
  clientSecret:  process.env.OAUTH_CLIENT_SECRET!,
  tokenEndpoint: '/authorizationserver/oauth/token',
});

const res = await fetch(`${baseUrl}/customws/v2/shop/cms/pages/homepage`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## How caching works

| Situation | Result |
|-----------|--------|
| First call | Fetches from backend, caches |
| Cached, > 60s remaining | Returns immediately, no HTTP |
| Cached, < 60s remaining | Proactive refresh |
| Token fetch fails | Returns `null`, logs warning — public OCC endpoints still work |
| Server restart | Cache cleared, refetches on first call |

With a typical 12-hour SAP token TTL, your server makes ~2 HTTP calls per day, regardless of traffic.

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `getStaticToken returned null` | Empty secret or wrong endpoint | Check `OAUTH_CLIENT_SECRET` and `tokenEndpoint` |
| `401` on `/customws/...` (CMS) | Token wasn't attached to client | Use `createServerOccClient` (not raw `OccClient`) |
| `clientId is invalid` from token endpoint | Wrong `clientId` | Check what your backend expects |

---

## Checklist

- [ ] `nexuvia.config.ts → authServer` filled in
- [ ] `OAUTH_CLIENT_SECRET` set in `.env.local` (or sealed secret in prod)
- [ ] `createServerOccClient` already calls `getStaticToken` (from Config Bridge)
- [ ] No imports of `@nexuvia/auth-server` in any browser code
