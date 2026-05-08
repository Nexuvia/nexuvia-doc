---
title: Wiring @nexuvia/occ
sidebar_position: 4
---

# Wiring `@nexuvia/occ`

`@nexuvia/occ` is the HTTP client every other commerce library uses. **You never construct it directly in your app code** — only in the factories under `config/`.

The wiring is identical in every framework — it lives entirely in [Config Bridge](/wiring/config-bridge).

---

## What you build (the 4 layers)

| Layer | What |
|-------|------|
| **Layer 1** — Config | `nexuvia.config.ts → hybris` (host, paths) |
| **Layer 1** — Bridge | `getOccConfig()` in `config/hybris.ts` |
| **Layer 1** — Server factory | `createServerOccClient()` in `config/server.ts` (with token) |
| **Layer 1** — Route factory | `createRouteOccClient()` in `config/api-helpers.ts` (no token) |
| **Layer 2 / 3 / 4** | None — `OccClient` is server-only, used inside other libraries' code |

---

## Step 1 — Config

```ts
// nexuvia.config.ts
hybris: {
  protocol:    process.env.HYBRIS_PROTOCOL || 'https',
  host:        process.env.HYBRIS_HOST     || '',     // 'occ-dev.example.com'
  port:        process.env.HYBRIS_PORT     || '',     // empty for default 443/80
  version:     'v2',
  occBasePath: '/occ',                                // public OCC endpoints
  cmsBasePath: '/customws',                           // CMS endpoints (need token)
},
```

```bash
# .env.local
HYBRIS_HOST=occ-dev.example.com
HYBRIS_PROTOCOL=https
```

---

## Step 2 — Bridge files (see Config Bridge)

The two factory functions you need:

| Factory | Use in | Token attached? |
|---------|--------|----------------|
| `createServerOccClient(storeKey, lang)` | Server Components / SSR pages | ✅ machine token from `auth-server` |
| `createRouteOccClient(baseSite, lang)` | Public route handlers (cart, products, search) | ❌ no token (public OCC) |

Both live in [Config Bridge](/wiring/config-bridge) — copy the templates from there.

---

## When to use which

| Use case | Factory | Why |
|----------|---------|-----|
| Server Component fetching CMS | `createServerOccClient` | CMS endpoint requires the machine token |
| Server Component fetching product/search | `createServerOccClient` | Token attached but unused — works fine |
| Route handler proxying public endpoints | `createRouteOccClient` | Lighter, no token fetch |
| Route handler accessing user data (orders, account) | `createRouteOccClient` + `setAccessToken(userToken)` | User token comes from `auth-client` |

---

## Critical rule — never share clients

```ts
// ❌ WRONG — token leaks between users
const sharedClient = await createServerOccClient(...);
export { sharedClient };

// ✅ RIGHT — fresh per request
export default async function Page() {
  const client = await createServerOccClient(...);
  return ...;
}
```

`OccClient` carries mutable state (`setAccessToken`, `setBasePath`). The factories return a new instance every call — never cache the result.

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `fetch failed` / `ECONNREFUSED` | Wrong `HYBRIS_HOST` | Verify with `curl` |
| `401` on `/customws/...` (CMS) | Missing machine token | Wire [auth-server](/wiring/auth-server) |
| `CORS error` in browser | Used `OccClient` directly in browser | Use a route handler proxy instead |
| `404` on known good code | Wrong `baseSite` value | Check `nexuvia.config.ts → stores.{key}.baseSite` |

---

## Checklist

- [ ] `nexuvia.config.ts → hybris` filled in
- [ ] `.env.local` has `HYBRIS_HOST`
- [ ] `config/hybris.ts` exports `getOccConfig`, `getHybrisBaseUrl`
- [ ] `config/server.ts` exports `createServerOccClient` (with token)
- [ ] `config/api-helpers.ts` exports `createRouteOccClient`
- [ ] `OccClient` is **never** imported into a browser component
- [ ] Pages call factories, never `new OccClient(...)` directly
