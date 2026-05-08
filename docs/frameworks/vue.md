---
title: Vue 3
sidebar_position: 3
---

# Vue 3 — Assembly Guide

Nexuvia's core is framework-agnostic — Vue 3 wires it through `composables` instead of React providers. The architecture is identical: client instances live in one module, composables wrap `client.on()` subscriptions, components call composables.

:::warning Same backend constraints as React
A Vue SPA cannot run Nexuvia by itself. You need a backend (Express, Hono, Nuxt server) for `cart`, `auth-server`, and `auth-client`. See the [React guide](/frameworks/react) — the backend setup is identical.

If you want SSR + integrated server routes, use **Nuxt 3** (treat its `server/api/` directory the same way you treat Next.js Route Handlers in the [Wiring docs](/wiring/overview)).
:::

---

## Wiring layer mapping — Vue vs Next.js

| Layer | Next.js | Vue 3 |
|-------|---------|-------|
| 1. Config bridge | `src/config/*.ts` | `src/config/*.ts` (same files) |
| 2. Server routes | `src/app/api/*` | `server/api/*` (Nuxt) or external backend |
| 3. Provider | React context + hook | Composable returning `ref`s |
| 4. UI | `useCart()` hook | `useCart()` composable |

---

## Final project structure (Nuxt 3)

```
my-storefront/
├── nexuvia.config.ts
├── .env
├── .npmrc
├── nuxt.config.ts
├── server/                                ← Nuxt server routes
│   └── api/
│       ├── cart.ts                        ← Layer 2
│       ├── cart/merge.post.ts
│       ├── auth/
│       │   ├── login.get.ts
│       │   ├── logout.post.ts
│       │   └── session.get.ts
│       └── auth-callback.get.ts
└── src/  (or root)
    ├── config/                            ← Layer 1 — same files as Next.js
    │   ├── hybris.ts
    │   ├── stores.ts
    │   ├── server.ts
    │   ├── api-helpers.ts
    │   ├── auth.ts
    │   └── smartedit.ts
    ├── lib/clients.ts                     ← Singleton client instances
    ├── composables/                       ← Layer 3
    │   ├── useCart.ts
    │   ├── useProduct.ts
    │   ├── useSearch.ts
    │   ├── useAnalytics.ts
    │   ├── useAuth.ts
    │   └── useCmsPage.ts
    ├── plugins/
    │   └── cms-defaults.client.ts         ← Component registry
    ├── pages/
    │   ├── index.vue
    │   ├── p/[code].vue
    │   └── cart.vue
    └── components/
        └── cms/
            ├── CmsSlotRenderer.vue
            └── defaults/                  ← Project CMS components
```

---

## Assembly order

| # | Task | Doc |
|---|------|-----|
| 1 | Run `npx nexuvia init` | [Quick Start](/getting-started/quick-start) |
| 2 | Configure env vars (Nuxt: `runtimeConfig`; Vite: `import.meta.env.VITE_*`) | See below |
| 3 | Create `src/config/` bridge files (identical to Next.js) | [Config Bridge](/wiring/config-bridge) |
| 4 | Create Nuxt server routes for cart + auth (or external backend) | [cart](/wiring/cart), [auth-client](/wiring/auth-client) |
| 5 | Create `src/lib/clients.ts` | See below |
| 6 | Create composables in `src/composables/` | See below |
| 7 | Register CMS components in a Nuxt plugin | See below |
| 8 | Use composables in pages | — |

---

## Step 1 — `src/lib/clients.ts`

```ts
// src/lib/clients.ts
import { OccClient }                            from '@nexuvia/occ';
import { CookieStorage }                        from '@nexuvia/storage';
import { CartClient, ProxyCartAdapter }         from '@nexuvia/cart/client';
import { ProductClient, OccProductAdapter }     from '@nexuvia/product';
import { SearchClient, OccSearchAdapter }       from '@nexuvia/search';
import { CmsClient, MockCmsAdapter }            from '@nexuvia/cms/server';
import { GtmAnalyticsAdapter, AnalyticsClient } from '@nexuvia/analytics';
import config from '../../nexuvia.config';

const { hybris, stores } = config;
const store    = stores.default;
const baseUrl  = `${hybris.protocol}://${hybris.host}`;
const occClient = new OccClient(
  { baseUrl, basePath: hybris.occBasePath, version: hybris.version },
  store.baseSite, store.defaultLanguage,
);

export const cartClient = new CartClient(
  new ProxyCartAdapter({ baseSite: store.baseSite, language: store.defaultLanguage }),
  new CookieStorage(),
);

export const productClient   = new ProductClient(new OccProductAdapter(occClient));
export const searchClient    = new SearchClient(new OccSearchAdapter(occClient));
export const cmsClient       = new CmsClient(new MockCmsAdapter(/* loader */));
export const analyticsClient = new AnalyticsClient(
  new GtmAnalyticsAdapter({ containerId: config.analytics.gtmContainerId }),
);
```

---

## Step 2 — Composables (Layer 3)

### `useCart`

```ts
// src/composables/useCart.ts
import { ref, onUnmounted } from 'vue';
import type { Cart } from '@nexuvia/cart';
import { cartClient } from '@/lib/clients';

export function useCart() {
  const initial   = cartClient.getState();
  const cart      = ref<Cart | null>(initial.cart);
  const isLoading = ref(initial.isLoading);
  const error     = ref<Error | null>(initial.error);

  const offCart  = cartClient.on('cart',  () => {
    const s = cartClient.getState();
    cart.value      = s.cart;
    isLoading.value = s.isLoading;
    error.value     = s.error;
  });
  const offError = cartClient.on('error', () => { error.value = cartClient.getState().error; });

  onUnmounted(() => { offCart(); offError(); });

  return {
    cart, isLoading, error,
    addItem:         (c: string, q = 1)       => cartClient.addToCart(c, q),
    removeFromCart:  (n: number)              => cartClient.removeFromCart(n),
    updateCartEntry: (n: number, q: number)   => cartClient.patchEntry(n, q),
    fetchCart:       ()                       => cartClient.fetchCart(),
    clearCart:       ()                       => cartClient.clearCart(),
    mergeCarts:      (uid: string)            => cartClient.mergeCarts(uid),
  };
}
```

### `useProduct`

```ts
// src/composables/useProduct.ts
import { ref, onUnmounted } from 'vue';
import type { Product } from '@nexuvia/product';
import { productClient } from '@/lib/clients';

export function useProduct() {
  const product   = ref<Product | null>(null);
  const isLoading = ref(false);
  const error     = ref<Error | null>(null);

  const off = productClient.on('product', () => {
    const s = productClient.getState();
    product.value   = s.product ?? null;
    isLoading.value = s.isLoading;
    error.value     = s.error;
  });

  onUnmounted(off);

  return {
    product, isLoading, error,
    load: (code: string) => productClient.getProduct(code),
  };
}
```

### `useAnalytics`

```ts
// src/composables/useAnalytics.ts
import { onMounted, watch, getCurrentInstance } from 'vue';
import { useRoute } from 'vue-router';
import { analyticsClient } from '@/lib/clients';

export function useAnalytics() {
  const route = useRoute();

  // Auto page-view on every route change
  if (getCurrentInstance()) {
    onMounted(() => analyticsClient.trackPageView());
    watch(() => route.fullPath, () => analyticsClient.trackPageView());
  }

  return {
    trackPageView:          (...a: any[]) => analyticsClient.trackPageView(...a),
    trackProductImpression: (...a: any[]) => analyticsClient.trackProductImpression(...a),
    trackProductClick:      (...a: any[]) => analyticsClient.trackProductClick(...a),
    trackAddToCart:         (...a: any[]) => analyticsClient.trackAddToCart(...a),
    trackRemoveFromCart:    (...a: any[]) => analyticsClient.trackRemoveFromCart(...a),
    trackPurchase:          (...a: any[]) => analyticsClient.trackPurchase(...a),
  };
}
```

---

## Step 3 — CMS component registry plugin

Vue's `componentRegistry` works exactly like in React — register Vue components by `typeCode`:

```ts
// src/plugins/cms-defaults.client.ts (Nuxt) — runs once on client startup
import { componentRegistry } from '@nexuvia/cms/client';
import CmsHeader  from '@/components/cms/defaults/CmsHeader.vue';
import CmsFooter  from '@/components/cms/defaults/CmsFooter.vue';
import CmsBanners from '@/components/cms/defaults/CmsBanners.vue';

export default defineNuxtPlugin(() => {
  componentRegistry.register('CMSHeaderComponent',  CmsHeader  as any);
  componentRegistry.register('CMSFooterComponent',  CmsFooter  as any);
  componentRegistry.register('CMSBannersComponent', CmsBanners as any);
  // register every typeCode in nexuvia.config.ts → cms.componentTypes
});
```

For Vite-only Vue (no Nuxt), import the registration file in `main.ts` instead:

```ts
import './cms-defaults';
createApp(App).mount('#app');
```

---

## Step 4 — `<CmsSlotRenderer>`

```vue
<!-- src/components/cms/CmsSlotRenderer.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { componentRegistry } from '@nexuvia/cms/client';
import type { CMSPage } from '@nexuvia/cms';

const props = defineProps<{ page: CMSPage | null; position: string }>();

const components = computed(() => {
  if (!props.page) return [];
  const slot = props.page.contentSlots.find(s => s.position === props.position);
  return slot?.components ?? [];
});

function resolve(typeCode: string) {
  return componentRegistry.resolve(typeCode);
}
</script>

<template>
  <component
    v-for="c in components"
    :key="c.uid"
    :is="resolve(c.typeCode)"
    :component="c"
  />
</template>
```

---

## Step 5 — Use in pages

```vue
<!-- src/pages/p/[code].vue -->
<script setup lang="ts">
import { useRoute } from 'vue-router';
import { onMounted } from 'vue';
import { useProduct } from '@/composables/useProduct';
import { useCart }    from '@/composables/useCart';

const route = useRoute();
const code  = route.params.code as string;
const { product, isLoading, load } = useProduct();
const { addItem } = useCart();

onMounted(() => load(code));
</script>

<template>
  <div v-if="isLoading">Loading…</div>
  <div v-else-if="product">
    <h1>{{ product.name }}</h1>
    <p>{{ product.price?.formattedValue }}</p>
    <button @click="addItem(product.code)">Add to Cart</button>
  </div>
</template>
```

---

## Server routes (Nuxt)

The route logic from the [Wiring](/wiring/overview) section is identical — just expressed in Nuxt's `server/api/` syntax:

```ts
// server/api/cart.post.ts
import { OccCartAdapter } from '@nexuvia/cart/server';
import { createRouteOccClient } from '~/config/api-helpers';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { cartId, baseSite, language, productCode, quantity = 1 } = body;
  const client  = createRouteOccClient(baseSite, language);
  const adapter = new OccCartAdapter(client);
  // addToCart takes two args: cartId and payload with productCode
  // return await adapter.addToCart(cartId ?? null, { productCode, quantity });
});
```

---

## Critical wiring rules

| Rule | Why |
|------|-----|
| Construct clients **once** in `src/lib/clients.ts` — never inside composables | Re-creating clients destroys cache |
| Every `client.on()` call in a composable needs `onUnmounted(off)` | Prevents listener leaks on route changes |
| Register CMS components in a `.client.ts` plugin (Nuxt) or `main.ts` (Vite) | Must run before first render |
| Cart needs a backend route — never call SAP OCC from the browser | CORS |
| `useAnalytics` should call `trackPageView` on `route.fullPath` watch | SPA navigation needs manual page-view fire |

---

## Common errors

### Composable values don't update reactively

You forgot to wrap state mutations in the `client.on()` callback. The pattern is: subscribe, then update `ref.value` from inside the handler.

### `Cannot find name 'process'` in browser

`nexuvia.config.ts` references `process.env.X` — replace with `import.meta.env.VITE_X` (Vite) or `useRuntimeConfig()` (Nuxt).

### CMS components don't render

Plugin not loaded. In Nuxt, the file must end in `.client.ts` to run only on client. In Vite, the import in `main.ts` must come before `createApp`.

### `useRoute` is undefined

Composable called outside `setup()` — only call `useCart()` etc. inside `<script setup>`.

---

## Checklist

- [ ] `src/lib/clients.ts` constructs all clients once
- [ ] Each composable subscribes via `client.on()` and unsubscribes via `onUnmounted(off)`
- [ ] CMS plugin registered (`.client.ts` for Nuxt, imported in `main.ts` for Vite)
- [ ] Backend running for cart + auth (or use Nuxt server routes)
- [ ] No `process.env` references in client code (use `import.meta.env.VITE_*`)
- [ ] `<CmsSlotRenderer>` resolves via `componentRegistry.resolve(typeCode)`
