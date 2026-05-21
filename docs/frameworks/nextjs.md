---
title: Next.js (App Router)
sidebar_position: 1
---

## Next.js — Complete Wiring Guide

This is the **definitive wiring reference** for a Next.js App Router project. It covers every package, every server route, and the exact file layout you need — from a blank project to a fully working multi-store storefront.

:::tip Two wiring paths
**Option A — `@nexuvia/app` (recommended):** One file replaces the entire config bridge. Use this for new projects.

**Option B — Manual config bridge:** Six explicit files under `src/config/`. Use this when you need granular control over client construction.

Both paths produce identical results. This guide uses Option A for brevity and shows Option B in the [Config Bridge](/wiring/config-bridge) reference.
:::

---

## Prerequisites

```bash
npm install @nexuvia/nexuvia @nexuvia/react
```

```bash
# .npmrc — GitHub Package Registry
@nexuvia:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
# .env.local
HYBRIS_HOST=occ-dev.example.com
HYBRIS_PROTOCOL=https
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_client_secret_here
AUTH_ENCRYPTION_KEY=a-random-32-character-string-here
USE_CMS_MOCK=true
GTM_CONTAINER_ID=
```

:::danger
`OAUTH_CLIENT_SECRET` and `AUTH_ENCRYPTION_KEY` must only exist in `.env.local` (dev) or CI/CD sealed secrets (prod). Never commit them.
:::

---

## Final project structure

```text
my-storefront/
├── nexuvia.config.ts               ← Single source of truth for all settings
├── nexuvia.app.ts                  ← NexuviaApp singleton (Option A)
├── .env.local                      ← Secrets — gitignored
├── .npmrc                          ← GitHub Package Registry
├── next.config.ts
└── src/
    ├── proxy.ts                    ← Store + language routing (was middleware.ts)
    ├── app/
    │   ├── _cms-defaults.ts        ← Register every CMS typeCode once
    │   ├── [lang]/
    │   │   ├── layout.tsx          ← Server Component: reads session, store, lang
    │   │   ├── store-layout-client.tsx  ← Client Component: all providers
    │   │   ├── page.tsx            ← Homepage (Server Component)
    │   │   ├── p/[code]/page.tsx   ← Product detail
    │   │   ├── c/[category]/page.tsx  ← Category listing
    │   │   ├── search/page.tsx     ← Search results
    │   │   └── cart/page.tsx       ← Cart page
    │   ├── auth/
    │   │   └── callback/route.ts   ← Azure AD B2C redirect handler
    │   └── api/
    │       ├── auth/
    │       │   ├── login/route.ts
    │       │   ├── logout/route.ts
    │       │   └── session/route.ts
    │       └── cart/
    │           └── route.ts        ← Cart proxy (GET, POST, PATCH, DELETE)
    └── components/
        └── cms/defaults/           ← Project CMS components
```

---

## Step 1 — Config

```ts
// nexuvia.config.ts
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
    ae: {
      baseSite:           'my-basesite',
      domain:             process.env.NODE_ENV === 'production' ? 'www.example.ae' : 'mystore.local',
      supportedLanguages: ['en'],
      defaultLanguage:    'en',
      currency:           'AED',
      country:            'AE',
      isEcommerce:        true,
    },
  },

  cms: {
    useMock:    process.env.USE_CMS_MOCK !== 'false',
    pageLabels: {
      homepage:      'homepage',
      productDetail: 'productDetails',
      cart:          'cartPage',
      search:        'search',
    },
  },

  smartedit: {
    allowedOrigins: ['https://your-smartedit-host.com'],
    previewVersion: 'v1',
  },

  authServer: {
    clientId:      process.env.OAUTH_CLIENT_ID     || '',
    clientSecret:  process.env.OAUTH_CLIENT_SECRET || '',
    tokenEndpoint: '/authorizationserver/oauth/token',
  },

  authClient: {
    session: {
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY || '',
      secureCookies: process.env.NODE_ENV === 'production',
    },
    // storeConfigProvider: async (storeKey) => getAzureStoreConfig(storeKey),
  },

  analytics: {
    gtmContainerId: process.env.GTM_CONTAINER_ID || '',
  },
};

export default config;
```

---

## Step 2 — App singleton

```ts
// nexuvia.app.ts  ← project root
import { NexuviaApp } from '@nexuvia/app';
import config from './nexuvia.config';

export const app = new NexuviaApp(config);
// Validates the full config at startup — throws ConfigError with per-field hints on failure
// Calls registerAuthConfig() automatically when authClient is present
```

---

## Step 3 — Proxy (store + language routing)

```ts
// src/proxy.ts     ← Next.js 15+ convention (was middleware.ts in 14)
import { NextRequest, NextResponse } from 'next/server';

const STORES: Record<string, { baseSite: string; langs: string[]; defaultLang: string }> = {
  'mystore.local':    { baseSite: 'my-basesite', langs: ['en'],       defaultLang: 'en' },
  'www.example.ae':   { baseSite: 'my-basesite', langs: ['en'],       defaultLang: 'en' },
  'www.example.sa':   { baseSite: 'my-basesite-ksa', langs: ['en','ar'], defaultLang: 'en' },
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal paths — /auth/ is critical: Azure callback must not be rewritten
  if (
    pathname.startsWith('/api/')   ||
    pathname.startsWith('/auth/')  ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  ) return NextResponse.next();

  const hostname    = request.headers.get('host')?.replace(/:\d+$/, '') ?? '';
  const store       = STORES[hostname] ?? Object.values(STORES)[0];
  const storeKey    = Object.keys(STORES).find(k => STORES[k] === store) ?? 'ae';
  const lang        = pathname.split('/').filter(Boolean)[0];

  if (lang && store.langs.includes(lang)) {
    const res = NextResponse.next();
    res.headers.set('x-store-key',      storeKey);
    res.headers.set('x-store-basesite', store.baseSite);
    res.headers.set('x-store-lang',     lang);
    return res;
  }

  return NextResponse.redirect(new URL(`/${store.defaultLang}${pathname}`, request.url));
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

:::tip Use `config/stores.ts` instead of inline
For real projects, import `getStoreByDomain` from your config bridge or from `nexuvia.config.ts` directly. The inline object above keeps the snippet self-contained.
:::

---

## Step 4 — Root layout (owns `<html>` and `<body>`)

:::danger One `<html>` tag total
Next.js App Router nests layouts. If `[lang]/layout.tsx` renders its own `<html>`, you get nested `<html>` tags — React throws a hydration mismatch and the page may not render.

**Rule:** Only `app/layout.tsx` renders `<html>` and `<body>`. Every nested layout returns a fragment.
:::

```tsx
// src/app/layout.tsx  ← owns html + body
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` on `<html>` and `<body>` prevents React from complaining when `lang` and `dir` are set client-side (see Step 5).

---

## Step 5 — Store layout (Server Component — fragment only)

```tsx
// src/app/[lang]/layout.tsx  ← returns a fragment, NOT <html>
import { notFound }  from 'next/navigation';
import { headers }   from 'next/headers';
import { app }       from '../../../nexuvia.app';
import { GtmScript } from '@nexuvia/analytics';
import config        from '../../../nexuvia.config';
import { StoreLayoutClient } from './store-layout-client';
import type { ReactNode } from 'react';

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ lang: string }>;
}) {
  const { lang }    = await params;
  const hdrs        = await headers();
  const storeKey    = hdrs.get('x-store-key') ?? 'ae';
  const storeConfig = config.stores[storeKey];

  if (!storeConfig) notFound();
  if (!storeConfig.supportedLanguages.includes(lang)) notFound();

  const ctx         = await app.forRequest(storeKey, lang);
  const cookieReq   = new Request('http://localhost', {
    headers: { cookie: hdrs.get('cookie') ?? '' },
  });
  const initialUser = ctx.auth ? ctx.auth.getSession(cookieReq) : null;
  const dir         = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <>
      {config.analytics.gtmContainerId && (
        <GtmScript containerId={config.analytics.gtmContainerId} />
      )}
      <StoreLayoutClient
        storeKey={storeKey}
        storeConfig={storeConfig}
        language={lang}
        dir={dir}
        gtmContainerId={config.analytics.gtmContainerId}
        initialUser={initialUser ?? null}
      >
        {children}
      </StoreLayoutClient>
    </>
  );
}
```

:::warning `ctx.auth.getSession()` takes a `Request`, not a string
The installed `@nexuvia/app` implementation reads `request.headers.get('cookie')` internally. Passing the raw cookie string directly throws `Cannot read properties of undefined`. Always wrap it in a `new Request(...)`.
:::

---

## Step 6 — Store layout client (Client Component)

```tsx
// src/app/[lang]/store-layout-client.tsx
'use client';

import { useEffect }        from 'react';
import { NexuviaProvider }  from '@nexuvia/react';
import type { StoreConfig } from '@nexuvia/core';
import type { SessionUser } from '@nexuvia/auth-client';
import type { ReactNode }   from 'react';
import { registerDefaultCmsComponents } from '@/app/_cms-defaults';

registerDefaultCmsComponents();

interface Props {
  storeKey:       string;
  storeConfig:    StoreConfig;
  language:       string;
  dir:            'ltr' | 'rtl';
  gtmContainerId: string;
  initialUser:    SessionUser | null;
  children:       ReactNode;
}

export function StoreLayoutClient({
  storeKey, storeConfig, language, dir, gtmContainerId, initialUser, children,
}: Props) {
  // Root layout owns <html> — set lang/dir here after hydration, not on the server
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir  = dir;
  }, [language, dir]);

  return (
    <NexuviaProvider
      storeKey={storeKey}
      storeConfig={storeConfig}
      language={language}
      cartClientConfig={{
        baseSite: storeConfig.baseSite,
        language,
        apiBase:  '/api/cart',
      }}
      gtmContainerId={gtmContainerId}
      initialUser={initialUser}
    >
      {children}
    </NexuviaProvider>
  );
}
```

Key points:

- `dir` prop comes from the server layout (computed from `lang`)
- `useEffect` sets `document.documentElement.lang/dir` after hydration — avoids mismatch
- `cartClientConfig` must include `apiBase: '/api/cart'`

`NexuviaProvider` nests all internal contexts in the correct order:

```text
StoreProvider → AuthProvider → CartProvider → AnalyticsProvider → [Suspense → SmartEditProvider] → children
```

---

## Step 7 — CMS component registry

```ts
// src/app/_cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import { CmsHeaderComponent }  from '@/components/cms/defaults/CmsHeaderComponent';
import { CmsFooterComponent }  from '@/components/cms/defaults/CmsFooterComponent';
import { CmsBannersComponent } from '@/components/cms/defaults/CmsBannersComponent';

export function registerDefaultCmsComponents() {
  componentRegistry.register('CMSHeaderComponent',  CmsHeaderComponent);
  componentRegistry.register('CMSFooterComponent',  CmsFooterComponent);
  componentRegistry.register('CMSBannersComponent', CmsBannersComponent);
  // One line per typeCode listed in nexuvia.config.ts → cms.componentTypes
}
```

---

## Step 8 — Server-side data fetching (pages)

### Homepage

```tsx
// src/app/[lang]/page.tsx
import { headers }   from 'next/headers';
import { notFound }  from 'next/navigation';
import { buildCmsClient }    from '@/lib/cms-server';
import { getProductAdapter } from '@/lib/product-server';
import config        from '../../../nexuvia.config';
import { HomePageClient } from './page-client';

export default async function HomePage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const hdrs     = await headers();
  const storeKey = hdrs.get('x-store-key') ?? 'ae';

  const cms  = await buildCmsClient(config, storeKey, lang);
  const page = await cms.getContentPage('homepage').catch(() => null);

  if (!page) {
    return (
      <main className="max-w-4xl mx-auto p-12 text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-500">CMS content not yet configured.</p>
      </main>
    );
  }

  return <HomePageClient page={page} />;
}
```

:::warning Do NOT use `ctx.cms` from `NexuviaApp` in Server Components
`NexuviaApp.buildCmsClient()` constructs `MockCmsAdapter` with **no loader** — every `getContentPage()` returns `null`. For Server Components use `buildCmsClient()` from `lib/cms-server.ts` (see [CMS wiring](/wiring/cms) for the full helper).
:::

```tsx
// src/app/[lang]/page-client.tsx
'use client';
import { CmsPageProvider, CmsSlotRenderer, CMSPosition } from '@nexuvia/cms/client';
import type { CMSPage } from '@nexuvia/cms';

export function HomePageClient({ page }: { page: CMSPage }) {
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

### Product detail

:::danger `ctx.product.getProduct()` is event-based — it does NOT return the product
`ProductClient` (what `ctx.product` is) emits a `'product'` event instead of returning data. Awaiting it always gives `undefined`. For SSR, use `getProductAdapter()` from `lib/product-server.ts` which returns data directly.
:::

```tsx
// src/app/[lang]/p/[code]/page.tsx
import { headers }   from 'next/headers';
import { notFound }  from 'next/navigation';
import { buildCmsClient }    from '@/lib/cms-server';
import { getProductAdapter } from '@/lib/product-server';
import config        from '../../../../nexuvia.config';
import { AddToCartButton } from '@/components/product/AddToCartButton';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; code: string }> }): Promise<Metadata> {
  const { lang, code } = await params;
  const storeKey = (await headers()).get('x-store-key') ?? 'ae';
  const product  = await getProductAdapter(config, storeKey, lang).getProduct(code).catch(() => null);
  return { title: product?.name ?? code };
}

export default async function ProductPage({
  params,
}: { params: Promise<{ lang: string; code: string }> }) {
  const { lang, code } = await params;
  const storeKey = (await headers()).get('x-store-key') ?? 'ae';

  const [product] = await Promise.all([
    getProductAdapter(config, storeKey, lang).getProduct(code).catch(() => null),
    buildCmsClient(config, storeKey, lang).then(cms =>
      cms.getContentPage('productDetails').catch(() => null)
    ),
  ]);

  if (!product) notFound();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
      <p className="text-xl text-gray-600 mb-6">{product.price?.formattedValue}</p>
      <AddToCartButton
        code={product.code}
        name={product.name}
        price={product.price?.value}
      />
    </div>
  );
}
```

### Search

:::danger `ctx.search.searchByTerm()` is event-based — it does NOT return results
Same issue as product: `SearchClient` emits events instead of returning data. Use `getSearchAdapter()` from `lib/search-server.ts` for SSR.
:::

```tsx
// src/app/[lang]/search/page.tsx
import { headers }   from 'next/headers';
import { getSearchAdapter } from '@/lib/search-server';
import config        from '../../../../nexuvia.config';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params:       Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { lang }  = await params;
  const { q = '', page = '0' } = await searchParams;
  const storeKey  = (await headers()).get('x-store-key') ?? 'ae';

  const results = await getSearchAdapter(config, storeKey, lang)
    .searchByTerm(q, { page: Number(page), pageSize: 24 });

  return (
    <div>
      <p>{results?.pagination?.totalResults ?? 0} results for &quot;{q}&quot;</p>
      <ul>
        {results?.products?.map(p => (
          <li key={p.code}>{p.name} — {p.price?.formattedValue}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Step 9 — Server-side auth routes

### Auth config file (auto-registers on import)

```ts
// src/config/auth.ts
// This file self-registers the auth config when imported.
// Every auth route handler must start with: import '@/config/auth'
import { registerAuthConfig } from '@nexuvia/auth-client';
import type { AzureStoreConfig } from '@nexuvia/auth-client';
import config from '../../nexuvia.config';

async function getAzureStoreConfig(storeKey: string): Promise<AzureStoreConfig> {
  return {
    authority:    process.env[`AZURE_AUTHORITY_${storeKey.toUpperCase()}`] || '',
    clientId:     process.env[`AZURE_CLIENT_ID_${storeKey.toUpperCase()}`] || '',
    clientSecret: process.env[`AZURE_CLIENT_SECRET_${storeKey.toUpperCase()}`] || '',
    scope:        'openid profile offline_access',
    redirectUri:  process.env[`AZURE_REDIRECT_URI_${storeKey.toUpperCase()}`] || '',
  };
}

registerAuthConfig({
  session:             config.authClient.session,
  storeConfigProvider: getAzureStoreConfig,
});
```

### Login route

```ts
// src/app/api/auth/login/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRegisteredAuthConfig, getAzureConfig, buildAuthUrl, buildTempCookieHeader,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const config      = getRegisteredAuthConfig();
  const storeKey    = request.nextUrl.searchParams.get('store') ?? 'ae';
  const azureConfig = await getAzureConfig(storeKey);
  const nonce       = crypto.randomUUID();
  const state       = crypto.randomUUID();
  const { url }     = buildAuthUrl(azureConfig, config, nonce, state);

  const secure = config.session.secureCookies ?? false;

  const headers = new Headers({ Location: url });
  headers.append('Set-Cookie', buildTempCookieHeader(NONCE_COOKIE_NAME, nonce, secure));
  headers.append('Set-Cookie', buildTempCookieHeader(STORE_COOKIE_NAME, storeKey, secure));

  return new NextResponse(null, { status: 302, headers });
}
```

### Callback route

:::warning Must be at `/auth/callback`, NOT `/api/auth/callback`
Your proxy must skip `/auth/` paths so the Azure redirect is never rewritten with a language prefix.
:::

```ts
// src/app/auth/callback/route.ts   ← NOT /api/auth/callback
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRegisteredAuthConfig, getAzureConfig,
  exchangeCodeForToken, extractUserFromToken,
  storeAccessToken, encryptSession,
  buildSessionCookieHeader, buildClearCookieHeader,
  readCookie, NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const config    = getRegisteredAuthConfig();
  const url       = new URL(request.url);
  const code      = url.searchParams.get('code');
  const error     = url.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL(`/?auth_error=${error ?? 'no_code'}`, request.url));
  }

  const cookie    = request.headers.get('cookie') ?? '';
  const storeKey  = readCookie(cookie, STORE_COOKIE_NAME) ?? 'ae';

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

    const headers = new Headers({ Location: `/${storeKey}/en/` });
    headers.set('Set-Cookie', sessionCookie);
    // Clear the short-lived nonce + store cookies
    headers.append('Set-Cookie', buildClearCookieHeader(NONCE_COOKIE_NAME, config.session.secureCookies ?? false));
    headers.append('Set-Cookie', buildClearCookieHeader(STORE_COOKIE_NAME, config.session.secureCookies ?? false));

    return new NextResponse(null, { status: 302, headers });
  } catch (err) {
    console.error('[nexuvia/auth] callback failed:', err);
    return NextResponse.redirect(new URL('/?auth_error=callback_failed', request.url));
  }
}
```

### Session route

```ts
// src/app/api/auth/session/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getRegisteredAuthConfig, getSession } from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const config = getRegisteredAuthConfig();
  const user   = getSession(request.headers.get('cookie'), config);
  return NextResponse.json(user ?? null);
}
```

### Logout route

```ts
// src/app/api/auth/logout/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRegisteredAuthConfig, getSession, getAzureConfig, buildLogoutUrl,
  buildClearCookieHeader, clearAccessToken, readCookie, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export async function POST(request: NextRequest) {
  const config    = getRegisteredAuthConfig();
  const cookie    = request.headers.get('cookie') ?? '';
  const user      = getSession(cookie, config);
  const storeKey  = readCookie(cookie, STORE_COOKIE_NAME) ?? 'ae';

  if (user?.id) clearAccessToken(user.id);

  const azureConfig   = await getAzureConfig(storeKey);
  const logoutUrl     = buildLogoutUrl(azureConfig, config);
  const secure        = config.session.secureCookies ?? false;

  const headers = new Headers();
  headers.append('Set-Cookie', buildClearCookieHeader(config.session.cookieName ?? '__nexuvia_session', secure));

  return NextResponse.json({ redirectUrl: logoutUrl }, { headers });
}
```

---

## Step 10 — Cart server route

```tsx
// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { app } from '../../../../nexuvia.app';

async function getAdapter(req: NextRequest, lang = 'en') {
  const storeKey = req.headers.get('x-store-key') ?? 'ae';
  const ctx      = await app.forRequest(storeKey, lang);
  return ctx.cart.server; // OccCartAdapter — server-only, OAuth-authenticated
}

// GET /api/cart?cartId=xxx&lang=en
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lang   = searchParams.get('lang')   ?? 'en';
  const cartId = searchParams.get('cartId') ?? null;

  try {
    const adapter = await getAdapter(request, lang);
    const cart    = cartId ? await adapter.getCart(cartId) : null;
    return NextResponse.json(cart);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// POST /api/cart
// ProxyCartAdapter sends: { product: { code }, quantity, cartId?, language, baseSite }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cartId, quantity = 1, language = 'en' } = body;
  // ProxyCartAdapter nests the product code — read both shapes
  const productCode: string = body.productCode ?? body.product?.code;

  try {
    const adapter = await getAdapter(request, language);

    let resolvedCartId = cartId as string | undefined;
    if (!resolvedCartId) {
      const newCart = await adapter.createCart();
      // Anonymous carts MUST use guid, NOT code
      // code (e.g. "6AD5262") → 400 Cart not found on subsequent requests
      // guid (UUID)           → always works
      resolvedCartId = (newCart as any).guid ?? (newCart as any).code ?? String(newCart);
    }

    const result = await adapter.addToCart(resolvedCartId, { productCode, quantity });
    return NextResponse.json({ cartId: resolvedCartId, modification: result.modification });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// PATCH /api/cart — body: { cartId, entryNumber, quantity, language }
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { cartId, entryNumber, quantity, language = 'en' } = body;

  try {
    const adapter = await getAdapter(request, language);
    const result  = await adapter.patchEntry(cartId, entryNumber, quantity);  // NOT updateCartEntry
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// DELETE /api/cart?cartId=xxx&entry=0&lang=en
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lang        = searchParams.get('lang')        ?? 'en';
  const cartId      = searchParams.get('cartId')      ?? '';
  const entryNumber = Number(searchParams.get('entry') ?? '0');

  try {
    const adapter = await getAdapter(request, lang);
    await adapter.removeFromCart(cartId, entryNumber);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
```

:::danger Three critical cart API corrections

1. **PATCH uses `patchEntry()`** not `updateCartEntry()` — `updateCartEntry` does not exist on `OccCartAdapter`
2. **`ProxyCartAdapter` sends `product: { code }` not `productCode`** — read `body.productCode ?? body.product?.code`
3. **Anonymous carts use `guid` not `code`** — Hybris returns both but only `guid` works in `users/anonymous/carts/{id}` URLs. Using `code` returns 400 Cart not found.

:::

---

## Step 11 — Using hooks in Client Components

All hooks are exported from `@nexuvia/react` — no manual import of internal providers.

```tsx
// src/components/AddToCartButton.tsx
'use client';
import { useCart, useAnalytics } from '@nexuvia/react';

export function AddToCartButton({ code, name, price }: {
  code:  string;
  name:  string;
  price?: number;
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
'use client';
import { useAuth, useStore } from '@nexuvia/react';

export function UserMenu() {
  const { user, login, logout } = useAuth();
  const { storeKey }            = useStore();

  if (!user) {
    return <button onClick={() => login(storeKey)}>Sign in</button>;
  }
  return (
    <div>
      <span>Hello, {user.fullName || user.email}</span>
      {/* logout() takes NO arguments in the installed package */}
      <button onClick={() => logout()}>Sign out</button>
    </div>
  );
}
```

```tsx
// src/components/CartIcon.tsx
'use client';
import { useEffect } from 'react';
import { useCart }   from '@nexuvia/react';

export function CartIcon() {
  const { cart, fetchCart } = useCart();

  useEffect(() => { fetchCart(); }, []);

  return <span>{cart?.totalItems ?? 0} items</span>;
}
```

### Cart page

:::info `isLoading` from `useCart()` is never `true` in React
`CartClient` emits only `'cart'` and `'error'` events — there is no `'loading'` event. React state only updates when those events fire, by which point `isLoading` is already `false`. Use a local `ready` state (tied to `fetchCart().finally(...)`) for a proper loading state.
:::

```tsx
// src/app/[lang]/cart/page-client.tsx
'use client';
import { useEffect, useState } from 'react';
import { useCart }   from '@nexuvia/react';
import Link          from 'next/link';
import { useParams } from 'next/navigation';

export function CartPageClient() {
  const { lang } = useParams<{ lang: string }>();
  const { cart, cartId, fetchCart, updateItem, removeItem } = useCart();
  // isLoading from useCart() is NEVER true in React — CartClient emits no 'loading' event
  // Use a local ready flag tied to the actual fetch promise instead
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCart().finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  // Re-fetch if cartId arrives after mount (race: addToCart in flight during navigation)
  useEffect(() => {
    if (ready && cartId && !cart) fetchCart();
  }, [cartId]);

  if (!ready) return <p className="p-6">Loading cart…</p>;

  if (!cart || cart.entries?.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Your cart is empty</h1>
        <Link href={`/${lang}/search`} className="text-blue-600 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Cart</h1>
      <ul className="space-y-4 mb-8">
        {cart.entries?.map((entry) => (
          <li key={entry.entryNumber} className="flex items-center justify-between border-b pb-4">
            <div>
              <p className="font-medium">{entry.product?.name}</p>
              <p className="text-gray-500 text-sm">{entry.basePrice?.formattedValue}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateItem(entry.entryNumber, entry.quantity - 1)}
                      disabled={entry.quantity <= 1}>−</button>
              <span>{entry.quantity}</span>
              <button onClick={() => updateItem(entry.entryNumber, entry.quantity + 1)}>+</button>
              <button onClick={() => removeItem(entry.entryNumber)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-xl font-bold">Total: {cart.totalPrice?.formattedValue}</div>
    </div>
  );
}
```

---

## Step 12 — SmartEdit (optional)

Pass `smartEditConfig` to `NexuviaProvider` and wrap CMS components:

```tsx
// store-layout-client.tsx — add smartEditConfig prop
import { createSmartEditService } from '@/config/smartedit';

<NexuviaProvider
  ...
  smartEditConfig={createSmartEditService()}
>
```

```ts
// src/config/smartedit.ts
import type { SmartEditServiceConfig } from '@nexuvia/smartedit';
import config from '../../nexuvia.config';

export function createSmartEditService(): SmartEditServiceConfig {
  return {
    hybrisBaseUrl:  `${config.hybris.protocol}://${config.hybris.host}`,
    allowedOrigins: config.smartedit.allowedOrigins,
    version:        config.smartedit.previewVersion,
  };
}
```

```tsx
// src/components/cms/defaults/CmsHeaderComponent.tsx
import { SmartEditWrapper } from '@nexuvia/smartedit';
import type { CMSComponent } from '@nexuvia/cms';

export function CmsHeaderComponent({ component }: { component: CMSComponent }) {
  return (
    <SmartEditWrapper component={component}>
      <header>{/* your header */}</header>
    </SmartEditWrapper>
  );
}
```

---

## Wiring rules quick reference

| Rule | Reason |
| ---- | ------ |
| `proxy.ts` skips `/auth/` | Azure callback must not be rewritten |
| `app` is a module-level singleton | Config validates once at startup |
| `forRequest()` called fresh per request | Client instances are not thread-safe |
| `registerDefaultCmsComponents()` in `store-layout-client.tsx` | Runs once, before first render |
| `import '@/config/auth'` first line in every auth route | Triggers self-registration |
| `OccCartAdapter` server-only, `ProxyCartAdapter` browser | SAP OCC is blocked by CORS in browsers |
| `initialUser` passed from server layout | Prevents flash-of-unauthenticated content |

---

## Verified installed hook API (`@nexuvia/react@0.2.0`)

The documentation above reflects the **installed published package**. Some methods differ from the monorepo source:

| Hook | Returns (installed `@0.2.0`) |
| ---- | --------------------------- |
| `useCart()` | `{ cart, cartId, isLoading, error, fetchCart, addItem, updateItem, removeItem, mergeCarts, clearCart }` |
| `useAuth()` | `{ user, isLoading, login(storeKey), logout(), refreshSession }` |
| `useStore()` | `{ storeKey, storeConfig, language }` |
| `useAnalytics()` | `{ track(event) }` — generic push; no `trackAddToCart`, `trackPageView`, etc. |
| `useCmsPage()` | `{ page }` |
| `useSmartEdit()` | SmartEdit context |

**`SessionUser` fields:** `id, email, firstName, lastName, fullName, salutation, phoneNumber, country, customFields, expiresAt` — **no `name` field**.

**`useCart()` method names:** `updateItem` (not `updateCartEntry`), `removeItem` (not `removeFromCart`).

**`useAnalytics()` track call:** `track({ type: 'add_to_cart', code, name, quantity, price })` — not `trackAddToCart(...)`.

**`logout()`** takes **no arguments** — not `logout(storeKey)`.

---

## Verification checklist

- [ ] `npm run dev` starts — visiting `/` redirects to `/en/`
- [ ] `/api/auth/session` returns `null` (logged out)
- [ ] Login button redirects to Azure
- [ ] Azure callback lands at `/auth/callback` (not `/api/auth/callback`)
- [ ] After login, `/api/auth/session` returns `SessionUser`
- [ ] CMS homepage renders (mock or live)
- [ ] Add to cart works via `/api/cart`
- [ ] Logout clears the session cookie
- [ ] `npx nexuvia check` passes all fields
