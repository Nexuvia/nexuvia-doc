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

## Step 4 — Root layout (Server Component)

```tsx
// src/app/[lang]/layout.tsx
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
  const storeKey    = hdrs.get('x-store-key')    ?? 'ae';
  const storeConfig = config.stores[storeKey];

  if (!storeConfig) notFound();
  if (!storeConfig.supportedLanguages.includes(lang)) notFound();

  // Read session server-side so there is no flash-of-unauthenticated content
  const ctx         = await app.forRequest(storeKey, lang);
  const initialUser = ctx.auth
    ? ctx.auth.getSession(new Request('', { headers: hdrs as any }))
    : null;

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

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
          gtmContainerId={config.analytics.gtmContainerId}
          initialUser={initialUser ?? null}
        >
          {children}
        </StoreLayoutClient>
      </body>
    </html>
  );
}
```

---

## Step 5 — Store layout client (Client Component)

```tsx
// src/app/[lang]/store-layout-client.tsx
'use client';

import { NexuviaProvider }  from '@nexuvia/react';
import type { StoreConfig } from '@nexuvia/core';
import type { SessionUser } from '@nexuvia/auth-client';
import type { ReactNode }   from 'react';
import { registerDefaultCmsComponents } from '@/app/_cms-defaults';

// Run once on module load — populates CMS registry before first render
registerDefaultCmsComponents();

interface Props {
  storeKey:       string;
  storeConfig:    StoreConfig;
  language:       string;
  gtmContainerId: string;
  initialUser:    SessionUser | null;
  children:       ReactNode;
}

export function StoreLayoutClient({
  storeKey, storeConfig, language, gtmContainerId, initialUser, children,
}: Props) {
  return (
    <NexuviaProvider
      storeKey={storeKey}
      storeConfig={storeConfig}
      language={language}
      cartClientConfig={{ baseSite: storeConfig.baseSite, language }}
      gtmContainerId={gtmContainerId}
      initialUser={initialUser}
    >
      {children}
    </NexuviaProvider>
  );
}
```

`NexuviaProvider` nests all internal contexts in the correct order:

```text
StoreProvider → AuthProvider → CartProvider → AnalyticsProvider → [Suspense → SmartEditProvider] → children
```

---

## Step 6 — CMS component registry

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

## Step 7 — Server-side data fetching (pages)

### Homepage

```tsx
// src/app/[lang]/page.tsx
import { headers }   from 'next/headers';
import { app }       from '../../../nexuvia.app';
import { notFound }  from 'next/navigation';
import { HomePageClient } from './page-client';

export default async function HomePage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const hdrs     = await headers();
  const storeKey = hdrs.get('x-store-key') ?? 'ae';
  const ctx      = await app.forRequest(storeKey, lang);

  const page = await ctx.cms.getContentPage('homepage').catch(() => null);
  if (!page) notFound();

  return <HomePageClient page={page} />;
}
```

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

```tsx
// src/app/[lang]/p/[code]/page.tsx
import { headers } from 'next/headers';
import { app }     from '../../../../../nexuvia.app';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; code: string }> }): Promise<Metadata> {
  const { lang, code } = await params;
  const storeKey = (await headers()).get('x-store-key') ?? 'ae';
  const ctx = await app.forRequest(storeKey, lang);
  const product = await ctx.product.getProduct(code);
  return { title: product?.name ?? code };
}

export default async function ProductPage({
  params,
}: { params: Promise<{ lang: string; code: string }> }) {
  const { lang, code } = await params;
  const storeKey = (await headers()).get('x-store-key') ?? 'ae';
  const ctx      = await app.forRequest(storeKey, lang);

  const [product, cmsPage] = await Promise.all([
    ctx.product.getProduct(code),
    ctx.cms.getProductPage(code).catch(() => null),
  ]);

  if (!product) notFound();

  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.price?.formattedValue}</p>
      {/* AddToCartButton uses useCart() from NexuviaProvider */}
    </div>
  );
}
```

### Search

```tsx
// src/app/[lang]/search/page.tsx
import { headers } from 'next/headers';
import { app }     from '../../../../nexuvia.app';

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
  const ctx       = await app.forRequest(storeKey, lang);

  const results = await ctx.search.searchByTerm(q, {
    page:     Number(page),
    pageSize: 24,
  });

  return (
    <div>
      <p>{results.pagination.totalResults} results for &quot;{q}&quot;</p>
      <ul>
        {results.products.map(p => (
          <li key={p.code}>{p.name} — {p.price?.formattedValue}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Step 8 — Server-side auth routes

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

## Step 9 — Cart server route

```ts
// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OccCartAdapter } from '@nexuvia/cart/server';
import { app } from '../../../../nexuvia.app';

async function getAdapter(req: NextRequest, lang = 'en') {
  const storeKey = req.headers.get('x-store-key') ?? 'ae';
  const ctx      = await app.forRequest(storeKey, lang);
  return ctx.cart.server; // OccCartAdapter
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lang    = searchParams.get('lang')   ?? 'en';
  const cartId  = searchParams.get('cartId') ?? null;

  try {
    const adapter = await getAdapter(request, lang);
    const cart    = cartId ? await adapter.getCart(cartId) : null;
    return NextResponse.json(cart);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function POST(request: NextRequest) {
  const body     = await request.json();
  const { lang = 'en', cartId, productCode, quantity = 1 } = body;

  try {
    const adapter = await getAdapter(request, lang);
    const id      = cartId ?? await adapter.createCart();
    const result  = await adapter.addToCart(id, { productCode, quantity });
    return NextResponse.json({ cartId: id, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body     = await request.json();
  const { lang = 'en', cartId, entryNumber, quantity } = body;

  try {
    const adapter = await getAdapter(request, lang);
    const result  = await adapter.updateCartEntry(cartId, entryNumber, quantity);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

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

---

## Step 10 — Using hooks in Client Components

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
      <span>Hello, {user.name}</span>
      <button onClick={() => logout()}>Sign out</button>
    </div>
  );
}
```

```tsx
// src/components/CartIcon.tsx
'use client';
import { useCart } from '@nexuvia/react';

export function CartIcon() {
  const { cart, fetchCart } = useCart();

  useEffect(() => { fetchCart(); }, []);

  return <span>{cart?.totalItems ?? 0} items</span>;
}
```

---

## Step 11 — SmartEdit (optional)

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
