---
title: React (Vite / CRA)
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## React — Complete Wiring Guide

This guide covers a **React SPA** wired with a separate Node.js backend (Express or Hono). It includes all frontend provider setup, every hook, and every required server route.

:::warning A React SPA cannot run Nexuvia alone
Two things always require a server:

1. **`@nexuvia/auth-server`** — the OAuth `client_secret` must never reach the browser
2. **`@nexuvia/cart`** — SAP OCC blocks browser calls with CORS

You need a thin Node.js backend alongside your Vite dev server. If you want a single integrated server, use [Next.js](/frameworks/nextjs) instead.

**What works in browser-only mode (mock adapters):** `cms`, `product`, `search`, `analytics`, `storage`, `core`, `log`.
:::

---

## Prerequisites

```bash
# React app
npm install @nexuvia/react @nexuvia/analytics

# Node.js backend (Express example)
npm install @nexuvia/app express cors
```

---

## Project structure

```text
my-storefront/
├── nexuvia.config.ts          ← Shared config (used by both app + server)
├── nexuvia.app.ts             ← NexuviaApp singleton — backend only
├── .env                       ← Frontend safe vars (VITE_*)
├── .env.server                ← Backend secrets — never expose to browser
│
├── src/                       ← React app (Vite)
│   ├── main.tsx
│   ├── App.tsx                ← NexuviaProvider lives here
│   ├── plugins/
│   │   └── cms-defaults.ts    ← Register CMS components once
│   └── components/
│
└── server/                    ← Express backend
    ├── index.ts               ← App setup + middleware
    ├── config/
    │   ├── server.ts          ← createServerOccClient factory
    │   └── auth.ts            ← registerAuthConfig (self-registers)
    └── routes/
        ├── auth.ts            ← /api/auth/login, /callback, /session, /logout
        └── cart.ts            ← /api/cart (GET, POST, PATCH, DELETE)
```

---

## Part A — Frontend (React + Vite)

### Step 1 — Wrap the app with `NexuviaProvider`

```tsx
// src/App.tsx
import { NexuviaProvider } from '@nexuvia/react';
import { GtmScript }       from '@nexuvia/analytics';
import { Router }          from '@/router';
import './plugins/cms-defaults';   // side-effect: registers CMS components

const STORE_KEY   = 'default';
const LANGUAGE    = 'en';
const BASE_SITE   = import.meta.env.VITE_BASE_SITE  ?? 'my-basesite';
const GTM_ID      = import.meta.env.VITE_GTM_ID     ?? '';
const API_BASE    = import.meta.env.VITE_API_BASE   ?? 'http://localhost:3001';

export function App() {
  return (
    <>
      {GTM_ID && <GtmScript containerId={GTM_ID} />}
      <NexuviaProvider
        storeKey={STORE_KEY}
        language={LANGUAGE}
        storeConfig={{
          baseSite:           BASE_SITE,
          domain:             window.location.hostname,
          supportedLanguages: [LANGUAGE],
          defaultLanguage:    LANGUAGE,
          currency:           'USD',
          country:            'US',
          isEcommerce:        true,
        }}
        cartClientConfig={{
          baseSite: BASE_SITE,
          language: LANGUAGE,
          apiBase:  `${API_BASE}/api/cart`,
        }}
        gtmContainerId={GTM_ID}
      >
        <Router />
      </NexuviaProvider>
    </>
  );
}
```

`NexuviaProvider` handles all internal nesting automatically:

```text
StoreProvider → AuthProvider → CartProvider → AnalyticsProvider → children
```

### Step 2 — Register CMS components

```ts
// src/plugins/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import { CmsHeaderComponent }  from '@/components/cms/CmsHeader';
import { CmsFooterComponent }  from '@/components/cms/CmsFooter';
import { CmsBannersComponent } from '@/components/cms/CmsBanners';

componentRegistry.register('CMSHeaderComponent',  CmsHeaderComponent);
componentRegistry.register('CMSFooterComponent',  CmsFooterComponent);
componentRegistry.register('CMSBannersComponent', CmsBannersComponent);
// One line per typeCode in nexuvia.config.ts → cms.componentTypes
```

### Step 3 — Use hooks in components

```tsx
// src/components/AddToCartButton.tsx
import { useCart, useAnalytics } from '@nexuvia/react';

export function AddToCartButton({ code, name, price }: {
  code: string; name: string; price?: number;
}) {
  const { addItem, isLoading } = useCart();
  const { track }              = useAnalytics();

  const handleClick = async () => {
    await addItem(code, 1);
    track({ type: 'add_to_cart', code, name, quantity: 1, price });
  };

  return (
    <button onClick={handleClick} disabled={isLoading}>
      {isLoading ? 'Adding…' : 'Add to Cart'}
    </button>
  );
}
```

```tsx
// src/components/UserMenu.tsx
import { useAuth, useStore } from '@nexuvia/react';

export function UserMenu() {
  const { user, login, logout } = useAuth();
  const { storeKey }            = useStore();

  if (!user) {
    return <button onClick={() => login(storeKey)}>Sign in</button>;
  }
  return (
    <div>
      <span>Hello, {user.name}</span>
      <button onClick={() => logout()}>Sign out</button>
    </div>
  );
}
```

```tsx
// src/components/CartBadge.tsx
import { useEffect } from 'react';
import { useCart } from '@nexuvia/react';

export function CartBadge() {
  const { cart, fetchCart } = useCart();

  useEffect(() => { fetchCart(); }, []);

  return <span>{cart?.totalItems ?? 0}</span>;
}
```

### Step 4 — CMS fetching (client-side with mock adapter)

For a pure SPA, CMS pages are fetched client-side with `MockCmsAdapter`:

```tsx
// src/pages/HomePage.tsx
import { useEffect, useState } from 'react';
import { CmsClient, MockCmsAdapter } from '@nexuvia/cms/server';
import { CmsPageProvider, CmsSlotRenderer, CMSPosition } from '@nexuvia/cms/client';
import type { CMSPage } from '@nexuvia/cms';

const cmsClient = new CmsClient(new MockCmsAdapter(async (label) => {
  // Load from /public/mock/{label}.json
  const res = await fetch(`/mock/${label}.json`);
  return res.ok ? res.json() : null;
}));

export function HomePage() {
  const [page, setPage] = useState<CMSPage | null>(null);

  useEffect(() => {
    cmsClient.getContentPage('homepage').then(setPage);
  }, []);

  if (!page) return <p>Loading…</p>;

  return (
    <CmsPageProvider page={page}>
      <CmsSlotRenderer position={CMSPosition.HEADER} />
      <main>
        <CmsSlotRenderer position={CMSPosition.CONTENT} />
      </main>
      <CmsSlotRenderer position={CMSPosition.FOOTER} />
    </CmsPageProvider>
  );
}
```

To use a live Hybris CMS, replace with `OccCmsAdapter` — but note this requires your backend proxy to serve the CMS request (CORS).

### Step 5 — Product and search (direct or proxied)

```tsx
// src/pages/ProductPage.tsx
import { useEffect, useState } from 'react';
import { ProductClient, OccProductAdapter } from '@nexuvia/product';
import { OccClient } from '@nexuvia/occ';

// Point at your backend proxy — not SAP directly (CORS)
const occ = new OccClient(
  { baseUrl: import.meta.env.VITE_API_BASE, basePath: '/occ-proxy', version: 'v2' },
  import.meta.env.VITE_BASE_SITE,
  'en',
);
const productClient = new ProductClient(new OccProductAdapter(occ));

export function ProductPage({ code }: { code: string }) {
  const [product, setProduct] = useState<any>(null);

  useEffect(() => {
    productClient.getProduct(code).then(setProduct);
  }, [code]);

  if (!product) return <p>Loading…</p>;
  return <h1>{product.name}</h1>;
}
```

:::danger Never put secrets in `VITE_*` variables
Anything prefixed `VITE_` is bundled into your JavaScript output and visible to anyone. Never put `OAUTH_CLIENT_SECRET`, `AUTH_ENCRYPTION_KEY`, or any Azure credentials in Vite env vars.
:::

---

## Part B — Backend (Express)

The backend is a thin Node.js server that proxies SAP OCC for cart, holds OAuth secrets, and handles the Azure auth flow.

### Step 1 — Server config

```ts
// nexuvia.app.ts  ← project root (imported by backend only)
import { NexuviaApp } from '@nexuvia/app';
import config from './nexuvia.config';

export const app = new NexuviaApp(config);
```

```ts
// nexuvia.config.ts — same file used by frontend types and backend logic
import type { NexuviaConfig } from '@nexuvia/core';

const config: NexuviaConfig = {
  hybris: {
    protocol:    process.env.HYBRIS_PROTOCOL || 'https',
    host:        process.env.HYBRIS_HOST     || '',
    version:     'v2',
    occBasePath: '/occ',
    cmsBasePath: '/customws',
  },
  stores: {
    default: {
      baseSite:           process.env.BASE_SITE || 'my-basesite',
      domain:             'localhost',
      supportedLanguages: ['en'],
      defaultLanguage:    'en',
      currency:           'USD',
      country:            'US',
      isEcommerce:        true,
    },
  },
  cms: {
    useMock:    process.env.USE_CMS_MOCK !== 'false',
    pageLabels: { homepage: 'homepage', productDetail: 'productDetails', cart: 'cartPage', search: 'search' },
  },
  smartedit:   { allowedOrigins: [], previewVersion: 'v1' },
  authServer:  {
    clientId:      process.env.OAUTH_CLIENT_ID     || '',
    clientSecret:  process.env.OAUTH_CLIENT_SECRET || '',
    tokenEndpoint: '/authorizationserver/oauth/token',
  },
  authClient: {
    session: {
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY || '',
      secureCookies: process.env.NODE_ENV === 'production',
    },
  },
  analytics: { gtmContainerId: '' },
};

export default config;
```

### Step 2 — Auth config (self-registers on import)

```ts
// server/config/auth.ts
import { registerAuthConfig } from '@nexuvia/auth-client';
import type { AzureStoreConfig } from '@nexuvia/auth-client';
import config from '../../nexuvia.config';

async function getAzureStoreConfig(storeKey: string): Promise<AzureStoreConfig> {
  return {
    authority:    process.env[`AZURE_AUTHORITY_${storeKey.toUpperCase()}`]    || '',
    clientId:     process.env[`AZURE_CLIENT_ID_${storeKey.toUpperCase()}`]    || '',
    clientSecret: process.env[`AZURE_CLIENT_SECRET_${storeKey.toUpperCase()}`] || '',
    scope:        'openid profile offline_access',
    redirectUri:  process.env.AZURE_REDIRECT_URI || 'http://localhost:3001/auth/callback',
  };
}

registerAuthConfig({
  session:             config.authClient.session,
  storeConfigProvider: getAzureStoreConfig,
});
```

### Step 3 — Auth routes

```ts
// server/routes/auth.ts
import './config/auth';   // ← MUST be first — triggers self-registration
import { Router } from 'express';
import {
  getRegisteredAuthConfig, getAzureConfig,
  buildAuthUrl, buildTempCookieHeader,
  exchangeCodeForToken, extractUserFromToken,
  storeAccessToken, encryptSession,
  buildSessionCookieHeader, buildClearCookieHeader, buildLogoutUrl,
  getSession, clearAccessToken, readCookie,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

const router = Router();

// GET /api/auth/login?store=default
router.get('/login', async (req, res) => {
  const config      = getRegisteredAuthConfig();
  const storeKey    = (req.query.store as string) ?? 'default';
  const azureConfig = await getAzureConfig(storeKey);
  const nonce       = crypto.randomUUID();
  const state       = crypto.randomUUID();
  const { url }     = buildAuthUrl(azureConfig, config, nonce, state);
  const secure      = config.session.secureCookies ?? false;

  res.setHeader('Set-Cookie', [
    buildTempCookieHeader(NONCE_COOKIE_NAME, nonce, secure),
    buildTempCookieHeader(STORE_COOKIE_NAME, storeKey, secure),
  ]);
  res.json({ redirectUrl: url });
});

// GET /auth/callback  (Azure redirect — NOT /api/auth/callback)
router.get('/callback', async (req, res) => {
  const config    = getRegisteredAuthConfig();
  const code      = req.query.code as string;
  const error     = req.query.error as string;

  if (error || !code) {
    return res.redirect(`${process.env.FRONTEND_URL}/?auth_error=${error ?? 'no_code'}`);
  }

  const cookie   = req.headers.cookie ?? '';
  const storeKey = readCookie(cookie, STORE_COOKIE_NAME) ?? 'default';

  try {
    const azureConfig = await getAzureConfig(storeKey);
    const token       = await exchangeCodeForToken(code, azureConfig, config);
    const user        = extractUserFromToken(token.id_token);

    if (token.access_token) {
      storeAccessToken(user.id, token.access_token, Date.now() + token.expires_in * 1000);
    }

    const sessionCookie = buildSessionCookieHeader(
      await encryptSession(user, config),
      config,
    );
    const secure = config.session.secureCookies ?? false;

    res.setHeader('Set-Cookie', [
      sessionCookie,
      buildClearCookieHeader(NONCE_COOKIE_NAME, secure),
      buildClearCookieHeader(STORE_COOKIE_NAME, secure),
    ]);
    res.redirect(process.env.FRONTEND_URL ?? 'http://localhost:5173');
  } catch (err) {
    console.error('[nexuvia/auth] callback failed:', err);
    res.redirect(`${process.env.FRONTEND_URL}/?auth_error=callback_failed`);
  }
});

// GET /api/auth/session
router.get('/session', (req, res) => {
  const config = getRegisteredAuthConfig();
  const user   = getSession(req.headers.cookie ?? null, config);
  res.json(user ?? null);
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const config    = getRegisteredAuthConfig();
  const cookie    = req.headers.cookie ?? '';
  const user      = getSession(cookie, config);
  const storeKey  = readCookie(cookie, STORE_COOKIE_NAME) ?? 'default';

  if (user?.id) clearAccessToken(user.id);

  const azureConfig = await getAzureConfig(storeKey);
  const logoutUrl   = buildLogoutUrl(azureConfig, config);
  const secure      = config.session.secureCookies ?? false;

  res.setHeader('Set-Cookie', [
    buildClearCookieHeader(config.session.cookieName ?? '__nexuvia_session', secure),
  ]);
  res.json({ redirectUrl: logoutUrl });
});

export default router;
```

### Step 4 — Cart route

```ts
// server/routes/cart.ts
import { Router } from 'express';
import { app }    from '../../nexuvia.app';

const router = Router();

router.get('/', async (req, res) => {
  const { lang = 'en', cartId } = req.query as Record<string, string>;
  const storeKey = (req.headers['x-store-key'] as string) ?? 'default';

  try {
    const ctx    = await app.forRequest(storeKey, lang);
    const cart   = cartId ? await ctx.cart.server.getCart(cartId) : null;
    res.json(cart);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { lang = 'en', cartId, productCode, quantity = 1 } = req.body;
  const storeKey = (req.headers['x-store-key'] as string) ?? 'default';

  try {
    const ctx    = await app.forRequest(storeKey, lang);
    const id     = cartId ?? await ctx.cart.server.createCart();
    const result = await ctx.cart.server.addToCart(id, { productCode, quantity });
    res.json({ cartId: id, result });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

router.patch('/', async (req, res) => {
  const { lang = 'en', cartId, entryNumber, quantity } = req.body;
  const storeKey = (req.headers['x-store-key'] as string) ?? 'default';

  try {
    const ctx    = await app.forRequest(storeKey, lang);
    const result = await ctx.cart.server.updateCartEntry(cartId, entryNumber, quantity);
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  const { lang = 'en', cartId, entry } = req.query as Record<string, string>;
  const storeKey = (req.headers['x-store-key'] as string) ?? 'default';

  try {
    const ctx = await app.forRequest(storeKey, lang);
    await ctx.cart.server.removeFromCart(cartId, Number(entry));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export default router;
```

### Step 5 — Express server entry

```ts
// server/index.ts
import 'dotenv/config';
import express    from 'express';
import cors       from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes  from './routes/auth';
import cartRoutes  from './routes/cart';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({
  origin:      process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,   // required for cookies
}));
app.use(express.json());
app.use(cookieParser());

// Auth — note: /auth/callback is at root level, not under /api
app.get('/auth/callback', authRoutes);   // Azure redirect target
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);

app.listen(PORT, () => {
  console.log(`Nexuvia backend on http://localhost:${PORT}`);
});
```

---

## Env files

```bash
# .env  (Vite — bundled into browser JS, safe for public values only)
VITE_API_BASE=http://localhost:3001
VITE_BASE_SITE=my-basesite
VITE_GTM_ID=
```

```bash
# .env.server  (Express — never expose to browser)
HYBRIS_HOST=occ-dev.example.com
HYBRIS_PROTOCOL=https
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_secret_here
AUTH_ENCRYPTION_KEY=a-random-32-character-string
AZURE_REDIRECT_URI=http://localhost:3001/auth/callback
FRONTEND_URL=http://localhost:5173
USE_CMS_MOCK=true
```

---

## Development workflow

Run both processes in parallel:

```bash
# Terminal 1 — Vite dev server
npm run dev

# Terminal 2 — Express backend
npx ts-node server/index.ts
# or: npx tsx watch server/index.ts
```

Or with `concurrently`:

```bash
npm install -D concurrently
# package.json
"dev": "concurrently \"vite\" \"tsx watch server/index.ts\""
```

---

## Checklist

### Frontend

- [ ] `@nexuvia/react` installed
- [ ] `<NexuviaProvider>` wraps entire app in `App.tsx`
- [ ] All hooks imported from `@nexuvia/react`
- [ ] CMS components registered in `plugins/cms-defaults.ts` before mount
- [ ] No secrets in any `VITE_*` variable

### Backend

- [ ] `server/config/auth.ts` imported at top of every auth handler
- [ ] CORS configured with `credentials: true` and matching `origin`
- [ ] Auth callback at `/auth/callback` — NOT `/api/auth/callback`
- [ ] Cart handler uses `OccCartAdapter` (server), never `ProxyCartAdapter`
- [ ] `OAUTH_CLIENT_SECRET` and `AUTH_ENCRYPTION_KEY` in `.env.server` only
