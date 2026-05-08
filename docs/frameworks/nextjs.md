---
title: Next.js (App Router)
sidebar_position: 1
---

# Next.js — Assembly Guide

This is the **complete assembly checklist** for a Next.js 14+ App Router project. It tells you what to wire and in what order — the [Wiring section](/wiring/overview) explains each step in detail.

:::tip Read the Wiring section first
This page is a roadmap. The actual code lives in the per-library wiring pages. Don't try to assemble from this page alone — follow the links.
:::

---

## Final project structure

When fully wired, your project looks like this:

```
my-storefront/
├── nexuvia.config.ts                          ← Single source of truth
├── .env.local                                 ← Secrets (gitignored)
├── .npmrc                                     ← GitHub Package Registry
├── next.config.ts
├── package.json
└── src/
    ├── proxy.ts                               ← Store + language routing
    ├── config/                                ← Layer 1 — Config bridge
    │   ├── hybris.ts                          ← URL helpers
    │   ├── stores.ts                          ← Store resolution
    │   ├── server.ts                          ← createServerOccClient + factories
    │   ├── api-helpers.ts                     ← createRouteOccClient
    │   ├── auth.ts                            ← registerAuthConfig (self-executes)
    │   └── smartedit.ts                       ← createSmartEditService
    ├── providers/                             ← Layer 3 — React contexts
    │   ├── auth-provider.tsx
    │   ├── cart-provider.tsx
    │   ├── cms-provider.tsx
    │   ├── product-provider.tsx
    │   ├── search-provider.tsx
    │   ├── smartedit-provider.tsx
    │   └── analytics-provider.tsx
    ├── store/
    │   └── store-context.tsx                  ← Holds storeKey + language
    ├── app/
    │   ├── _cms-defaults.ts                   ← Component registry — every typeCode
    │   ├── [lang]/
    │   │   ├── layout.tsx                     ← Server: reads session, store
    │   │   ├── store-layout-client.tsx        ← Client: all providers
    │   │   ├── page.tsx, page-client.tsx      ← Homepage
    │   │   ├── p/[code]/page.tsx              ← Product detail
    │   │   ├── c/[category]/page.tsx          ← Category listing
    │   │   ├── search/page.tsx                ← Search results
    │   │   └── cart/page.tsx                  ← Cart page
    │   ├── auth/
    │   │   └── callback/route.ts              ← Layer 2 — Azure callback
    │   └── api/                               ← Layer 2 — Server proxies
    │       ├── auth/
    │       │   ├── login/route.ts
    │       │   ├── logout/route.ts
    │       │   └── session/route.ts
    │       ├── cart/route.ts                  ← GET, POST, PATCH, DELETE
    │       ├── cart/merge/route.ts            ← POST (cart-on-login)
    │       ├── products/[code]/route.ts       ← Optional
    │       ├── search/route.ts                ← Optional
    │       └── search/suggestions/route.ts    ← Optional
    ├── components/
    │   └── cms/
    │       ├── CmsSlotRenderer.tsx
    │       ├── CmsComponentRenderer.tsx
    │       └── defaults/                      ← Project-specific CMS components
    └── mock/
        ├── homepage.json
        ├── productDetails.json
        └── ...
```

---

## Assembly order — do this exactly in sequence

### Phase 1 — Foundation (must be done first)

| # | Task | Doc |
|---|------|-----|
| 1 | Run `npx nexuvia init` to generate `nexuvia.config.ts` | [Quick Start](/getting-started/quick-start) |
| 2 | Set env vars in `.env.local` (`HYBRIS_HOST`, `OAUTH_CLIENT_SECRET`, `AUTH_ENCRYPTION_KEY`) | [Configuration](/getting-started/configuration) |
| 3 | Create `src/proxy.ts` — store + language routing | [Proxy / Middleware](/wiring/proxy-middleware) |
| 4 | Create all 6 files in `src/config/` (hybris, stores, server, api-helpers, auth, smartedit) | [Config Bridge](/wiring/config-bridge) |
| 5 | Create `src/store/store-context.tsx` — minimal context for `storeKey` + `language` | See template below |
| 6 | Verify `import '@/config/auth'` resolves with no errors | — |

### Phase 2 — Auth (CMS depends on the machine token)

| # | Task | Doc |
|---|------|-----|
| 7 | Wire `@nexuvia/auth-server` — used inside `createServerOccClient` | [auth-server](/wiring/auth-server) |
| 8 | Wire `@nexuvia/auth-client` — 4 routes + provider + layout integration | [auth-client](/wiring/auth-client) |

### Phase 3 — Content & commerce

| # | Task | Doc |
|---|------|-----|
| 9 | Build the project-specific CMS components in `src/components/cms/defaults/` | — |
| 10 | Create `src/app/_cms-defaults.ts` — register every typeCode | [cms](/wiring/cms) |
| 11 | Wire `@nexuvia/cms` — page provider + slot renderer | [cms](/wiring/cms) |
| 12 | Wire `@nexuvia/smartedit` — script + DOM wrappers + Suspense | [smartedit](/wiring/smartedit) |
| 13 | Wire `@nexuvia/cart` — `/api/cart` routes + provider | [cart](/wiring/cart) |
| 14 | Wire `@nexuvia/product` — Server Component fetch (no provider needed) | [product](/wiring/product) |
| 15 | Wire `@nexuvia/search` — Server Component fetch + autocomplete provider | [search](/wiring/search) |
| 16 | Wire `@nexuvia/analytics` — `<GtmScript>` in head + provider | [analytics](/wiring/analytics) |

### Phase 4 — Pages

| # | Task |
|---|------|
| 17 | Create `src/app/[lang]/layout.tsx` — Server Component reading session + store |
| 18 | Create `src/app/[lang]/store-layout-client.tsx` — Client Component with all providers |
| 19 | Create homepage, product detail, category, search, cart pages |

---

## Critical files — the exact templates

### `src/store/store-context.tsx` (you must create this)

```tsx
'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { StoreConfig } from '@/config/stores';

interface StoreContextValue {
  storeKey:    string;
  storeConfig: StoreConfig;
  language:    string;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({
  storeKey, storeConfig, language, children,
}: StoreContextValue & { children: ReactNode }) {
  return (
    <StoreContext.Provider value={{ storeKey, storeConfig, language }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore() must be used inside <StoreProvider>');
  return ctx;
}
```

### `src/app/[lang]/layout.tsx`

```tsx
import { notFound }  from 'next/navigation';
import { headers }   from 'next/headers';
import '@/config/auth';                                    // ← MUST be first import
import { getStoreConfig, getDefaultStore, stores } from '@/config/stores';
import { getHybrisBaseUrl }                        from '@/config/hybris';
import { createSmartEditService }                  from '@/config/smartedit';
import { GtmScript }                               from '@nexuvia/analytics';
import { getSession, getRegisteredAuthConfig }     from '@nexuvia/auth-client';
import config           from '../../../nexuvia.config';
import { StoreLayoutClient } from './store-layout-client';

const RTL_LANGUAGES = ['ar'];

export function generateStaticParams() {
  const langs = new Set<string>();
  for (const c of Object.values(stores)) c.supportedLanguages.forEach(l => langs.add(l));
  return Array.from(langs).map(lang => ({ lang }));
}

export default async function StoreLayout({ children, params }) {
  const { lang }      = await params;
  const reqHeaders    = await headers();
  const storeKey      = reqHeaders.get('x-store-key') || 'ae';
  const storeConfig   = getStoreConfig(storeKey) || getDefaultStore();

  if (!storeConfig.supportedLanguages.includes(lang)) notFound();

  const cookieHeader  = reqHeaders.get('cookie');
  const initialUser   = getSession(cookieHeader, getRegisteredAuthConfig());
  const dir           = RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';

  return (
    <html lang={lang} dir={dir}>
      <body suppressHydrationWarning>
        {config.analytics.gtmContainerId && (
          <GtmScript containerId={config.analytics.gtmContainerId} />
        )}
        <StoreLayoutClient
          storeKey={storeKey}
          storeConfig={storeConfig}
          language={lang}
          smartEditConfig={createSmartEditService()}
          gtmContainerId={config.analytics.gtmContainerId}
          initialUser={initialUser}
        >
          {children}
        </StoreLayoutClient>
      </body>
    </html>
  );
}
```

### `src/app/[lang]/store-layout-client.tsx`

```tsx
'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import type { StoreConfig }  from '@/config/stores';
import type { SessionUser }  from '@nexuvia/auth-client';
import type { SmartEditServiceConfig } from '@nexuvia/smartedit';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart';
import { CookieStorage }                from '@nexuvia/storage';
import { GtmAnalyticsAdapter, AnalyticsClient } from '@nexuvia/analytics';

import { StoreProvider }     from '@/store/store-context';
import { AuthProvider }      from '@/providers/auth-provider';
import { CartProvider }      from '@/providers/cart-provider';
import { AnalyticsProvider } from '@/providers/analytics-provider';
import { SmartEditProvider } from '@/providers/smartedit-provider';

import { registerDefaultCmsComponents } from '@/app/_cms-defaults';

// Register CMS components ONCE on module load
registerDefaultCmsComponents();

interface Props {
  storeKey:        string;
  storeConfig:     StoreConfig;
  language:        string;
  smartEditConfig: SmartEditServiceConfig;
  gtmContainerId:  string;
  initialUser?:    SessionUser | null;
  children:        ReactNode;
}

export function StoreLayoutClient({
  storeKey, storeConfig, language, smartEditConfig, gtmContainerId, initialUser, children,
}: Props) {

  const cartClient = useMemo(() => {
    const adapter = new ProxyCartAdapter({ baseSite: storeConfig.baseSite, language });
    return new CartClient(adapter, new CookieStorage());
  }, [storeConfig.baseSite, language]);

  const analyticsClient = useMemo(() => {
    const adapter = new GtmAnalyticsAdapter({ containerId: gtmContainerId });
    return new AnalyticsClient(adapter);
  }, [gtmContainerId]);

  return (
    <StoreProvider storeKey={storeKey} storeConfig={storeConfig} language={language}>
      <AuthProvider initialUser={initialUser}>
        <CartProvider client={cartClient}>
          <AnalyticsProvider client={analyticsClient}>
            <Suspense fallback={null}>
              <SmartEditProvider config={smartEditConfig}>
                {children}
              </SmartEditProvider>
            </Suspense>
          </AnalyticsProvider>
        </CartProvider>
      </AuthProvider>
    </StoreProvider>
  );
}
```

---

## Verification — what works at each phase

After Phase 1 (foundation): `npm run dev` starts. Visiting `/` redirects to `/en/`.

After Phase 2 (auth): `/api/auth/session` returns `null`. Login button redirects to Azure.

After Phase 3 (content): Homepage renders mock CMS content. Add to cart works via `/api/cart`.

After Phase 4 (pages): Full storefront — search, product detail, cart, checkout flow.

---

## Wiring rules summary

| Rule | Why |
|------|-----|
| **`import '@/config/auth'` is the first line of every auth route handler** | Triggers `registerAuthConfig()` |
| **Auth callback at `/auth/callback`, NOT `/api/auth/callback`** | Matches Azure registration; bypassed by proxy |
| **`proxy.ts` skips paths starting with `/auth/`** | Prevents language prefix breaking the callback |
| **`AuthProvider` is OUTSIDE `CartProvider`** | Cart-on-login needs `useAuth().user.id` |
| **`SmartEditProvider` is INSIDE `<Suspense>`** | Uses `useSearchParams()` |
| **`AnalyticsProvider` is INSIDE `StoreProvider`** | Auto page-view reads `useStore()` |
| **`registerDefaultCmsComponents()` called at module load** | Registry must be populated before first render |
| **Use `ProxyCartAdapter` in browser, NEVER `OccCartAdapter`** | OCC blocked by CORS in browser |
| **Construct clients via `useMemo` with stable deps** | Prevents new instance per render breaking cache |
| **Pass `initialUser` from server layout to `AuthProvider`** | Avoids flash-of-unauthenticated content |

---

## Where to go next

1. [Wiring Overview](/wiring/overview) — read this before anything else
2. [Config Bridge](/wiring/config-bridge) — copy the templates verbatim
3. [Proxy / Middleware](/wiring/proxy-middleware) — the routing layer
4. Then walk through each library wiring page in order
