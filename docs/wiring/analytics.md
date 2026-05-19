---
title: Wiring @nexuvia/analytics
sidebar_position: 12
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/analytics`

Analytics is the **simplest library** to wire — no server routes, just a script tag and a Layer 3 wrapper.

---

## What you build (the 4 layers)

| Layer | What |
|-------|------|
| **Layer 1** — Config | `nexuvia.config.ts → analytics.gtmContainerId` |
| **Layer 2** — Server routes | None |
| **Layer 3** — Wrapper + script | `<GtmScript>` as first child of `<body>` + Layer 3 wrapper |
| **Layer 4** — UI | `useAnalytics()` / `analyticsService.trackAddToCart(...)` |

---

## Step 1 — Config

```ts
// nexuvia.config.ts
analytics: {
  gtmContainerId: process.env.GTM_CONTAINER_ID || '',   // 'GTM-XXXXXXX' or empty
},
```

```bash
# .env.local
GTM_CONTAINER_ID=GTM-XXXXXXX
# Leave empty to disable GTM in dev — script renders nothing
```

---

## Step 2 — Inject the GTM script

`<GtmScript>` returns nothing visible — it injects GTM's script tag with `dataLayer` initialization, plus the `<noscript>` iframe fallback.

<Tabs groupId="framework">
<TabItem value="react" label="React (Next.js / Vite)">

```tsx
import { GtmScript } from '@nexuvia/analytics';
import config        from '../../nexuvia.config';

// In your root layout (Next.js App Router):
// ⚠ Do NOT put <GtmScript> inside a manual <head> tag — Next.js App Router manages
// <head> automatically and whitespace text nodes inside a manual <head> cause hydration errors.
// Place it as the first child of <body> instead.
<html lang={lang} dir={dir}>
  <body suppressHydrationWarning>
    {config.analytics.gtmContainerId && (
      <GtmScript containerId={config.analytics.gtmContainerId} />
    )}
    {children}
  </body>
</html>
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```vue
<!-- app.vue or your root layout -->
<script setup lang="ts">
import { GtmScript } from '@nexuvia/analytics';
import config        from '../nexuvia.config';
</script>

<template>
  <Head>
    <GtmScript v-if="config.analytics.gtmContainerId" :container-id="config.analytics.gtmContainerId" />
  </Head>
  <slot />
</template>
```

</TabItem>
<TabItem value="angular" label="Angular">

GTM has its own native Angular module (`@angular/google-tag-manager`), or you can manually add the script to `index.html`:

```html
<!-- src/index.html -->
<head>
  <!-- Google Tag Manager -->
  <script>
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','GTM-XXXXXXX');
  </script>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
            height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
</body>
```

Replace `GTM-XXXXXXX` with your container ID.

</TabItem>
</Tabs>

---

## Step 3 — Construct + wrap the analytics client

:::tip Shortcut with `@nexuvia/react`
If you use `@nexuvia/react`, pass `gtmContainerId` to `NexuviaProvider` — no manual provider file needed:

```tsx
<NexuviaProvider
  storeKey={storeKey}
  language={language}
  storeConfig={storeConfig}
  cartClientConfig={cartClientConfig}
  gtmContainerId={config.analytics.gtmContainerId}
>
  {children}
</NexuviaProvider>
```

Then anywhere: `import { useAnalytics } from '@nexuvia/react'`. The manual tab below is for Vue/Angular or when using Nexuvia without `@nexuvia/react`.
:::

<Tabs groupId="framework">
<TabItem value="react" label="React (manual)">

Provider lives in `src/providers/analytics-provider.tsx` — only needed **without** `@nexuvia/react`:

```tsx
'use client';
import { createContext, useContext, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';   // or React Router equivalent
import { AnalyticsClient, GtmAnalyticsAdapter } from '@nexuvia/analytics';
import type { AnalyticsClient as Client, AnalyticsClientState } from '@nexuvia/analytics';
import config from '../../nexuvia.config';

const Ctx = createContext<any>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => new AnalyticsClient(new GtmAnalyticsAdapter({ containerId: config.analytics.gtmContainerId })),
    [],
  );
  const pathname = usePathname();

  // Auto page-view on every route change
  useEffect(() => { client.trackPageView(); }, [client, pathname]);

  return <Ctx.Provider value={{
    trackPageView:          useCallback((url?: string, title?: string) => client.trackPageView(url, title), [client]),
    trackProductImpression: useCallback((p: any[], list?: string) => client.trackProductImpression(p, list), [client]),
    trackProductClick:      useCallback((p: any) => client.trackProductClick(p), [client]),
    trackAddToCart:         useCallback((p: any) => client.trackAddToCart(p), [client]),
    trackRemoveFromCart:    useCallback((p: any) => client.trackRemoveFromCart(p), [client]),
    trackPurchase:          useCallback((p: any) => client.trackPurchase(p), [client]),
  }}>{children}</Ctx.Provider>;
}

export const useAnalytics = () => {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Return no-ops outside provider — safe fallback so analytics never breaks the UI
    return { trackPageView: () => {}, trackAddToCart: () => {}, trackPurchase: () => {} } as any;
  }
  return ctx;
};
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```ts
// composables/useAnalytics.ts
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { AnalyticsClient, GtmAnalyticsAdapter } from '@nexuvia/analytics';
import config from '../../nexuvia.config';

const client = new AnalyticsClient(
  new GtmAnalyticsAdapter({ containerId: config.analytics.gtmContainerId }),
);

let routeWatcherInstalled = false;

export function useAnalytics() {
  const route = useRoute();

  // Auto page-view on first call + every route change
  if (!routeWatcherInstalled) {
    routeWatcherInstalled = true;
    watch(() => route.fullPath, () => client.trackPageView(), { immediate: true });
  }

  return {
    trackPageView:          (...a: any[]) => client.trackPageView(...a),
    trackProductImpression: (...a: any[]) => client.trackProductImpression(...a),
    trackProductClick:      (...a: any[]) => client.trackProductClick(...a),
    trackAddToCart:         (...a: any[]) => client.trackAddToCart(...a),
    trackRemoveFromCart:    (...a: any[]) => client.trackRemoveFromCart(...a),
    trackPurchase:          (...a: any[]) => client.trackPurchase(...a),
  };
}
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
// src/app/services/analytics.service.ts
import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AnalyticsClient, GtmAnalyticsAdapter } from '@nexuvia/analytics';
import config from '../../../nexuvia.config';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private client = new AnalyticsClient(
    new GtmAnalyticsAdapter({ containerId: config.analytics.gtmContainerId }),
  );

  constructor(router: Router) {
    // Auto page-view on every navigation
    router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.client.trackPageView());
  }

  trackProductImpression(p: any[], list?: string) { this.client.trackProductImpression(p, list); }
  trackProductClick(p: any)                       { this.client.trackProductClick(p); }
  trackAddToCart(p: any)                          { this.client.trackAddToCart(p); }
  trackRemoveFromCart(p: any)                     { this.client.trackRemoveFromCart(p); }
  trackPurchase(p: any)                           { this.client.trackPurchase(p); }
}
```

</TabItem>
</Tabs>

---

## Step 4 — Use it in components

```ts
// React: const { trackAddToCart } = useAnalytics();
// Vue:   const { trackAddToCart } = useAnalytics();
// NG:    private analytics = inject(AnalyticsService);

trackAddToCart({
  code:     product.code,
  name:     product.name,
  quantity: 1,
  price:    product.price?.value,
  currency: product.price?.currencyIso,
});
```

Page views fire automatically on every navigation — you only call `trackPageView()` manually for special cases (e.g. a modal opening).

---

## Custom adapter (Segment / Mixpanel / your own)

```ts
import { AnalyticsAdapter, AnalyticsClient } from '@nexuvia/analytics';
import type { AnalyticsEvent } from '@nexuvia/analytics';

class SegmentAdapter extends AnalyticsAdapter {
  push(event: AnalyticsEvent): void {
    switch (event.type) {
      case 'add_to_cart': window.analytics?.track('Product Added', { product_id: event.code, quantity: event.quantity }); break;
      case 'purchase':    window.analytics?.track('Order Completed', { order_id: event.orderId, total: event.total }); break;
    }
  }
}

const client = new AnalyticsClient(new SegmentAdapter());
```

`push()` must be **synchronous** — fire-and-forget any async calls inside it.

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| Events called but nothing in GTM | `<GtmScript>` missing or `containerId` empty | Verify `gtm.js` loads in Network tab |
| Page-view fires twice on navigation | Manually calling `trackPageView` AND auto-fire | Remove manual call |
| `useAnalytics()` returns no-ops | Component is outside the provider tree | Wrap with provider — or accept no-ops as fallback |

---

## Checklist

- [ ] `nexuvia.config.ts → analytics.gtmContainerId` set (or empty for dev)
- [ ] `<GtmScript>` rendered conditionally on `containerId` being truthy
- [ ] Layer 3 wrapper wired and **inside** the Store wrapper (so events include storeKey/lang)
- [ ] Auto page-view fires on route change (provider/composable/service handles this)
- [ ] No manual `trackPageView` for SPA navigation
- [ ] Custom adapters implement `push()` **synchronously**
