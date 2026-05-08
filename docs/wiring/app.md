---
title: "@nexuvia/app"
sidebar_position: 2
---

# Wiring with `@nexuvia/app`

`@nexuvia/app` replaces the six manual config bridge files with a single class. This page shows how to wire it into a Next.js App Router project.

---

## Create `nexuvia.app.ts`

At the project root, alongside `nexuvia.config.ts`:

```ts
// nexuvia.app.ts
import { NexuviaApp } from '@nexuvia/app';
import config from './nexuvia.config';

export const app = new NexuviaApp(config);
```

The constructor validates the full config and throws a `ConfigError` with per-field hints if anything is missing. It runs once at module load — not per request.

---

## Use `forRequest()` in layouts

```tsx
// src/app/[lang]/layout.tsx
import { headers } from 'next/headers';
import { app } from '@/nexuvia.app';

export default async function Layout({ params, children }) {
  const { lang } = await params;
  const hdrs = await headers();
  const storeKey = hdrs.get('x-store-key') ?? 'ae';

  const ctx = await app.forRequest(storeKey, lang);

  return (
    <Providers storeKey={storeKey} storeConfig={ctx.store.config} language={lang}>
      {children}
    </Providers>
  );
}
```

---

## Use the context in pages

```tsx
// src/app/[lang]/page.tsx
import { app } from '@/nexuvia.app';

export default async function HomePage({ params }) {
  const { lang } = await params;
  const ctx = await app.forRequest('ae', lang);

  const page    = await ctx.cms.getContentPage('homepage');
  const results = await ctx.search.search({ query: '', lang });

  return <HomePageClient page={page} results={results} />;
}
```

---

## Cart context

`ctx.cart` contains two things:

```ts
ctx.cart.server       // OccCartAdapter — use in route handlers
ctx.cart.clientConfig // ProxyCartAdapterConfig — pass to client-side CartProvider
```

Pass `clientConfig` to your cart provider:

```tsx
<CartProvider clientConfig={ctx.cart.clientConfig}>
  {children}
</CartProvider>
```

---

## Auth context

When `authClient` is configured in `nexuvia.config.ts`, `ctx.auth` is a `NexuviaAuthContext`:

```ts
const user = ctx.auth?.getSession(request.headers.get('cookie'));

if (!user) {
  const { url } = await ctx.auth.buildLoginUrl(storeKey, nonce);
  return redirect(url);
}
```

`ctx.auth` is `null` when no `authClient` is configured.

---

## Validate without running the app

```bash
npx nexuvia check
```

Runs `validateConfig()` against your `nexuvia.config.ts` and prints a per-field report. Use this in CI before deploying.

---

## What `@nexuvia/app` does NOT replace

The manual config bridge approach (`config/hybris.ts`, `config/server.ts`, etc.) still works and is still documented in [Config Bridge](/wiring/config-bridge). Use `@nexuvia/app` when you want one-line wiring; use the manual bridge when you need finer control over client construction.
