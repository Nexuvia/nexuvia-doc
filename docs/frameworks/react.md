---
title: React (Vite / CRA)
sidebar_position: 2
---

# React — Assembly Guide

Install `@nexuvia/react` and use `<NexuviaProvider>` — no manual provider wiring needed.

:::warning Read this first
**A pure React SPA cannot run Nexuvia by itself.** Two things require a server:

1. **`@nexuvia/auth-server`** — must hold the OAuth `client_secret` (browser cannot)
2. **`@nexuvia/cart`** — SAP OCC blocks browser calls with CORS

You need a thin backend (Express, Hono, Fastify, or any other Node.js framework) to host the route handlers. The React app calls your backend, which calls SAP. **Nexuvia in pure SPA mode = mock adapters only.**

If you want full SAP integration with no separate backend, use [Next.js](/frameworks/nextjs) instead.
:::

---

## What works in pure SPA mode

| Library | Pure SPA | Needs backend |
|---------|---------|---------------|
| `@nexuvia/core` | ✅ | — |
| `@nexuvia/log` | ✅ | — |
| `@nexuvia/storage` | ✅ | — |
| `@nexuvia/cms` (with `MockCmsAdapter`) | ✅ | OCC adapter needs server |
| `@nexuvia/product` (with `MockProductAdapter`) | ✅ | OCC adapter needs server |
| `@nexuvia/search` (with `MockSearchAdapter`) | ✅ | OCC adapter needs server |
| `@nexuvia/analytics` (GTM) | ✅ | — |
| `@nexuvia/smartedit` | ✅ | — |
| `@nexuvia/cart` | ❌ | Always — CORS |
| `@nexuvia/auth-server` | ❌ | Always — secret can't leak |
| `@nexuvia/auth-client` | ❌ | Always — needs callback route |

---

## Installation

```bash
pnpm add @nexuvia/react
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

---

## Step 1 — Wrap your app with `NexuviaProvider`

`NexuviaProvider` handles all internal provider nesting in the correct order. Pass it your store config and it wires everything for you:

```tsx
// src/App.tsx
import { NexuviaProvider } from '@nexuvia/react';
import { ProxyCartAdapterConfig } from '@nexuvia/cart/client';
import { GtmScript } from '@nexuvia/analytics';
import { Router } from '@/router';
import config from '../nexuvia.config';

const store = config.stores.default;

const cartClientConfig: ProxyCartAdapterConfig = {
  baseSite: store.baseSite,
  language: store.defaultLanguage,
  apiBase:  import.meta.env.VITE_API_BASE + '/api/cart',
};

export function App() {
  return (
    <>
      {config.analytics.gtmContainerId && (
        <GtmScript containerId={config.analytics.gtmContainerId} />
      )}
      <NexuviaProvider
        storeKey="default"
        language={store.defaultLanguage}
        storeConfig={store}
        cartClientConfig={cartClientConfig}
        gtmContainerId={config.analytics.gtmContainerId}
      >
        <Router />
      </NexuviaProvider>
    </>
  );
}
```

That's it. No manual `CartProvider`, `AuthProvider`, `AnalyticsProvider`, or `StoreProvider` needed.

---

## Step 2 — Use hooks in components

All hooks are exported directly from `@nexuvia/react`.

### `useCart`

```tsx
'use client';

import { useCart } from '@nexuvia/react';

export function AddToCartButton({ productCode }: { productCode: string }) {
  const { addItem, isLoading } = useCart();

  return (
    <button onClick={() => addItem(productCode, 1)} disabled={isLoading}>
      {isLoading ? 'Adding…' : 'Add to Cart'}
    </button>
  );
}
```

### `useAuth`

```tsx
import { useAuth } from '@nexuvia/react';

export function UserMenu() {
  const { user, login, logout } = useAuth();

  if (!user) {
    return <button onClick={() => login('default')}>Sign in</button>;
  }
  return (
    <div>
      <span>Hello, {user.name}</span>
      <button onClick={() => logout('default')}>Sign out</button>
    </div>
  );
}
```

### `useStore`

```tsx
import { useStore } from '@nexuvia/react';

export function StoreBadge() {
  const { storeKey, language, storeConfig } = useStore();
  return <span>{storeConfig.currency} — {language.toUpperCase()}</span>;
}
```

### `useCmsPage`

```tsx
import { useCmsPage } from '@nexuvia/react';

export function HomePage() {
  const { page, isLoading } = useCmsPage();

  if (isLoading) return <p>Loading…</p>;
  if (!page)     return <p>Page not found.</p>;
  return <h1>{page.title}</h1>;
}
```

### `useAnalytics`

```tsx
import { useAnalytics } from '@nexuvia/react';

export function ProductCard({ product }) {
  const { trackProductClick, trackAddToCart } = useAnalytics();

  return (
    <div onClick={() => trackProductClick({ code: product.code, name: product.name })}>
      <h2>{product.name}</h2>
      <button onClick={() => trackAddToCart({ code: product.code, name: product.name, quantity: 1 })}>
        Add to Cart
      </button>
    </div>
  );
}
```

### `useSmartEdit`

```tsx
import { useSmartEdit } from '@nexuvia/react';

export function EditableSlot({ children }) {
  const { isPreviewMode } = useSmartEdit();
  return (
    <div data-preview={isPreviewMode}>
      {children}
    </div>
  );
}
```

---

## Next.js App Router

In Next.js, pass `NexuviaProvider` your server-resolved `initialUser` so there's no session flash:

```tsx
// src/app/[lang]/store-layout-client.tsx
'use client';

import { NexuviaProvider } from '@nexuvia/react';
import { GtmScript } from '@nexuvia/analytics';
import type { SessionUser } from '@nexuvia/auth-client';
import type { StoreConfig } from '@nexuvia/app';

interface Props {
  storeKey:    string;
  language:    string;
  storeConfig: StoreConfig;
  initialUser: SessionUser | null;
  children:    React.ReactNode;
}

export function StoreLayoutClient({ storeKey, language, storeConfig, initialUser, children }: Props) {
  return (
    <>
      <GtmScript containerId={process.env.NEXT_PUBLIC_GTM_ID ?? ''} />
      <NexuviaProvider
        storeKey={storeKey}
        language={language}
        storeConfig={storeConfig}
        cartClientConfig={{ baseSite: storeConfig.baseSite, language }}
        initialUser={initialUser}
        gtmContainerId={process.env.NEXT_PUBLIC_GTM_ID ?? ''}
      >
        {children}
      </NexuviaProvider>
    </>
  );
}
```

---

## Escape hatches — individual providers

If you need to override a specific provider (for example to pass a custom cart client with a payload extender), each internal provider is exported individually:

```tsx
import {
  StoreProvider,
  AuthProvider,
  CartProvider,
  AnalyticsProvider,
  SmartEditInternalProvider,
} from '@nexuvia/react';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart/client';
import { CookieStorage } from '@nexuvia/storage';
import { useMemo } from 'react';

export function App() {
  const cartClient = useMemo(() => {
    const adapter = new ProxyCartAdapter({ baseSite: 'my-site', language: 'en' });
    const client  = new CartClient(adapter, new CookieStorage());

    client.setPayloadExtender((base) => ({
      ...base,
      giftWrap: false,
    }));

    return client;
  }, []);

  return (
    <StoreProvider storeKey="default" storeConfig={store} language="en">
      <AuthProvider>
        <CartProvider client={cartClient}>
          <AnalyticsProvider client={analyticsClient}>
            <SmartEditInternalProvider config={smartEditConfig}>
              <App />
            </SmartEditInternalProvider>
          </AnalyticsProvider>
        </CartProvider>
      </AuthProvider>
    </StoreProvider>
  );
}
```

Use escape hatches only when you have a specific reason to override the default wiring. For most apps `<NexuviaProvider>` is all you need.

---

## Backend setup (needed for cart + auth)

The backend for a Vite React app is a thin Express or Hono server. The route logic is identical to the [Next.js wiring docs](/wiring/overview) — adapted to your framework's syntax:

```ts
// server/index.ts
import express from 'express';
import cors    from 'cors';
import { createOccClient } from './config/server';
import { OccCartAdapter }  from '@nexuvia/cart/server';

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.post('/api/cart', async (req, res) => {
  const { cartId, baseSite, language, productCode, quantity = 1 } = req.body;
  const client  = createOccClient(baseSite, language);
  const adapter = new OccCartAdapter(client);
  // addToCart(cartId ?? null, { productCode, quantity })
});

app.listen(3001, () => console.log('Backend on :3001'));
```

:::danger Never put secrets in VITE_*
Anything starting with `VITE_` is bundled into your JavaScript. Never put `OAUTH_CLIENT_SECRET` or `AUTH_ENCRYPTION_KEY` here.
:::

---

## Checklist

- [ ] `pnpm add @nexuvia/react` installed
- [ ] `<NexuviaProvider>` wraps the entire app in `App.tsx` (or Next.js layout client)
- [ ] All hooks imported from `@nexuvia/react` — not from `@/providers/`
- [ ] No `OAUTH_CLIENT_SECRET` or encryption key in any `VITE_*` var
- [ ] Backend running for cart + auth (or stick to mock-only for demos)
- [ ] `initialUser` passed from server in Next.js to prevent session flash
- [ ] CORS configured on backend for the React dev server origin
