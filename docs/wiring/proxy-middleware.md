---
title: Proxy / Middleware
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Proxy / Middleware — Store + Language Routing

Nexuvia is multi-store and multi-language. Every URL needs a **storeKey** (resolved from the domain) and a **language** (resolved from the URL prefix `/en/`, `/ar/`).

This file lives at the framework's middleware/routing layer. The logic is identical across frameworks — only the API differs.

---

## What it does (any framework)

For every incoming request:

1. Skip internal paths (`/api/`, `/auth/`, static files)
2. Resolve store from the `host` header
3. Validate language prefix in the URL
4. Set headers (`x-store-key`, `x-store-basesite`, `x-store-lang`) so layouts can read them
5. Redirect missing/invalid language to the store's default

---

## Critical rules — for every framework

| Rule | Why |
|------|-----|
| **Skip `/auth/`** paths | The Azure callback lives at `/auth/callback` — must not be rewritten |
| **Skip files with extensions** | `/favicon.ico`, `/robots.txt`, etc. should pass through |
| **Set headers on the response, not the request** | Server Components / handlers read response-side headers |

---

## Implementation

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// proxy.ts  ← Next.js 16+ convention (was middleware.ts in earlier versions)
import { NextRequest, NextResponse } from 'next/server';
import nexuviaConfig from './nexuvia.config';

// Build domain → storeKey map once at module load — not per request.
const DOMAIN_MAP: Record<string, string> = {};
for (const [key, store] of Object.entries(nexuviaConfig.stores)) {
  DOMAIN_MAP[store.domain] = key;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal paths — /auth/ is critical: Azure callback must not be language-prefixed.
  if (
    pathname.startsWith('/api/')   ||
    pathname.startsWith('/auth/')  ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  ) return NextResponse.next();

  const hostname = request.headers.get('host')?.replace(/:\d+$/, '') ?? '';
  const storeKey = DOMAIN_MAP[hostname] ?? Object.keys(nexuviaConfig.stores)[0];
  const store    = nexuviaConfig.stores[storeKey];
  const lang     = pathname.split('/').filter(Boolean)[0];

  if (lang && store.supportedLanguages.includes(lang)) {
    const res = NextResponse.next();
    res.headers.set('x-store-key', storeKey);
    return res;
  }

  return NextResponse.redirect(
    new URL(`/${store.defaultLanguage}${pathname}`, request.url),
  );
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

:::tip Import nexuvia.config directly in proxy.ts
The proxy runs at the Edge/middleware layer — it cannot call async functions or use `@/config/stores`. Import `nexuvia.config` directly and build the domain map at module load time. This is faster and avoids any config-layer dependency issues.
:::

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/middleware/proxy.ts
import type { Request, Response, NextFunction } from 'express';
import { getStoreByDomain, getDefaultStore }    from '../config/stores';

export function proxy(req: Request, res: Response, next: NextFunction) {
  const pathname = req.path;

  if (pathname.startsWith('/api/')   ||
      pathname.startsWith('/auth/')  ||
      pathname.includes('.')) {
    return next();
  }

  const hostname    = req.hostname;
  const storeMatch  = getStoreByDomain(hostname);
  const storeConfig = storeMatch?.config || getDefaultStore();
  const storeKey    = storeMatch?.key    || 'default';

  const segments = pathname.split('/').filter(Boolean);
  const lang     = segments[0];

  if (lang && storeConfig.supportedLanguages.includes(lang)) {
    res.locals.storeKey    = storeKey;
    res.locals.storeConfig = storeConfig;
    res.locals.lang        = lang;
    return next();
  }

  return res.redirect(`/${storeConfig.defaultLanguage}${pathname}`);
}

// In your app setup:
// app.use(proxy);
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/middleware/proxy.ts
import { getStoreByDomain, getDefaultStore } from '~/config/stores';

export default defineEventHandler((event) => {
  const url      = getRequestURL(event);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')   ||
      pathname.startsWith('/auth/')  ||
      pathname.includes('.')) return;

  const hostname    = url.hostname;
  const storeMatch  = getStoreByDomain(hostname);
  const storeConfig = storeMatch?.config || getDefaultStore();
  const storeKey    = storeMatch?.key    || 'default';

  const segments = pathname.split('/').filter(Boolean);
  const lang     = segments[0];

  if (lang && storeConfig.supportedLanguages.includes(lang)) {
    setHeader(event, 'x-store-key',      storeKey);
    setHeader(event, 'x-store-basesite', storeConfig.baseSite);
    setHeader(event, 'x-store-lang',     lang);
    return;
  }

  return sendRedirect(event, `/${storeConfig.defaultLanguage}${pathname}`);
});
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

In `server.ts`, install the same logic as Express middleware:

```ts
// server.ts (excerpt)
import express from 'express';
import { getStoreByDomain, getDefaultStore } from './src/app/config/stores';

const server = express();

server.use((req, res, next) => {
  const pathname = req.path;
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname.includes('.')) {
    return next();
  }

  const storeMatch  = getStoreByDomain(req.hostname);
  const storeConfig = storeMatch?.config || getDefaultStore();
  const storeKey    = storeMatch?.key    || 'default';

  const segments = pathname.split('/').filter(Boolean);
  const lang     = segments[0];

  if (lang && storeConfig.supportedLanguages.includes(lang)) {
    res.locals.storeKey    = storeKey;
    res.locals.storeConfig = storeConfig;
    res.locals.lang        = lang;
    return next();
  }

  return res.redirect(`/${storeConfig.defaultLanguage}${pathname}`);
});
```

</TabItem>
</Tabs>

---

## Local development — multi-store testing

In production, store resolution is automatic — each country has its own domain. Locally you need a way to test each store without deploying.

**The correct approach is `/etc/hosts` with `.local` domains.** This mirrors production exactly — the proxy reads the `Host` header the same way, all navigations work, product pages work, Arabic RTL works. No query params, no cookies, no special dev code.

### Step 1 — Set `.local` domains in `nexuvia.config.ts`

Use `process.env.NODE_ENV` to switch between local and production domains:

```ts
// nexuvia.config.ts
stores: {
  ae: {
    domain: process.env.NODE_ENV === 'production' ? 'www.mystore.ae' : 'mystore.local',
    supportedLanguages: ['en'],
    // ...
  },
  sa: {
    domain: process.env.NODE_ENV === 'production' ? 'www.mystore.sa' : 'mystoressa.local',
    supportedLanguages: ['en', 'ar'],
    // ...
  },
  // ... one entry per store
},
```

### Step 2 — Add the domains to `/etc/hosts` (one time)

```bash
sudo sh -c 'cat >> /etc/hosts << EOF

# Nexuvia local dev
127.0.0.1  mystore.local
127.0.0.1  mystoressa.local
127.0.0.1  mystoreqa.local
# ... one line per store
EOF'
```

### Step 3 — Visit with your dev server port

```
http://mystore.local:3000/en/          ← UAE, English
http://mystoressa.local:3000/en/       ← KSA, English
http://mystoressa.local:3000/ar/       ← KSA, Arabic (RTL)
http://mystoreqa.local:3000/ar/p/123   ← Qatar, Arabic, product page
```

The proxy resolves the store from the `Host` header on every request — including deep links, product pages, search, cart — exactly as in production.

:::tip No code changes needed in the proxy
The proxy is unchanged. The only change is the `domain` field in `nexuvia.config.ts` and the `/etc/hosts` entries. Remove the `NODE_ENV` ternary before going to production and set the real domains.
:::

---

## Verification

After wiring:
- Visit `/` → redirects to `/{defaultLanguage}/` (e.g. `/en/`)
- Visit `/zz/` (invalid lang) → redirects to `/en/`
- Visit `/auth/callback?code=test` → **not redirected** (passes through)
- Visit `/api/cart` → **not redirected** (passes through)
- Visit `http://mystoressa.local:{port}/ar/` → KSA store, Arabic, RTL

---

## Checklist

- [ ] Middleware/proxy file created in your framework's expected location
- [ ] **Skips `/auth/`** paths (critical for Azure callback)
- [ ] Skips `/api/` paths
- [ ] Skips file extensions
- [ ] Sets `x-store-key`, `x-store-basesite`, `x-store-lang` on the response (or `res.locals` in Express)
- [ ] Each store in `nexuvia.config.ts` has a unique `domain` for production
- [ ] For local dev: `.local` domains added to `/etc/hosts`, `domain` field uses `NODE_ENV` ternary
