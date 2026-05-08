---
title: Vue 3
sidebar_position: 3
---

# Vue 3 — Assembly Guide

Install `@nexuvia/vue` and use `createNexuviaPlugin()` — no manual composable wiring needed.

:::warning Same backend constraints as React
A Vue SPA cannot run Nexuvia by itself. You need a backend (Express, Hono, Nuxt server) for `cart`, `auth-server`, and `auth-client`. See the [React guide](/frameworks/react) — the backend setup is identical.

If you want SSR + integrated server routes, use **Nuxt 3** (treat its `server/api/` directory the same way you treat Next.js Route Handlers in the [Wiring docs](/wiring/overview)).
:::

---

## Installation

```bash
pnpm add @nexuvia/vue
```

Peer dependencies: `vue >= 3.3`.

---

## Step 1 — Register the plugin in `main.ts`

```ts
// src/main.ts (Vite)
import { createApp }           from 'vue';
import { createNexuviaPlugin } from '@nexuvia/vue';
import App                     from './App.vue';
import config                  from '../nexuvia.config';
import './plugins/cms-defaults';   // register CMS components before mount

const store = config.stores.default;

const app = createApp(App);

app.use(createNexuviaPlugin({
  storeKey:         'default',
  language:         store.defaultLanguage,
  storeConfig:      store,
  cartClientConfig: {
    baseSite: store.baseSite,
    language: store.defaultLanguage,
    apiBase:  import.meta.env.VITE_API_BASE + '/api/cart',
  },
  gtmContainerId: import.meta.env.VITE_GTM_ID || '',
}));

app.mount('#app');
```

---

## Step 1b — Nuxt 3 plugin

```ts
// plugins/nexuvia.client.ts
import { createNexuviaPlugin } from '@nexuvia/vue';

export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig();
  const store = /* resolve from runtimeConfig */ { baseSite: 'my-site', defaultLanguage: 'en' };

  nuxtApp.vueApp.use(createNexuviaPlugin({
    storeKey:         'default',
    language:         'en',
    storeConfig:      store,
    cartClientConfig: { baseSite: store.baseSite, language: 'en' },
    gtmContainerId:   runtimeConfig.public.gtmId || '',
  }));
});
```

---

## Step 2 — Use composables in components

All composables are exported directly from `@nexuvia/vue`.

### `useCart`

```vue
<script setup lang="ts">
import { useCart } from '@nexuvia/vue';

const { cart, isLoading, addItem } = useCart();
</script>

<template>
  <div v-if="isLoading">Loading…</div>
  <ul v-else-if="cart?.entries?.length">
    <li v-for="entry in cart.entries" :key="entry.entryNumber">
      {{ entry.product.name }} × {{ entry.quantity }}
    </li>
  </ul>
  <p v-else>Your cart is empty.</p>
</template>
```

### `useAuth`

```vue
<script setup lang="ts">
import { useAuth } from '@nexuvia/vue';

const { user, login, logout } = useAuth();
</script>

<template>
  <button v-if="!user" @click="login('default')">Sign in</button>
  <div v-else>
    <span>Hello, {{ user.name }}</span>
    <button @click="logout('default')">Sign out</button>
  </div>
</template>
```

### `useStore`

```vue
<script setup lang="ts">
import { useStore } from '@nexuvia/vue';

const { storeKey, language, storeConfig } = useStore();
// storeKey, language, storeConfig are readonly refs — use .value in script, unwrap automatically in template
</script>

<template>
  <span>{{ storeConfig.value.currency }} — {{ language.value.toUpperCase() }}</span>
</template>
```

### `useAnalytics`

```vue
<script setup lang="ts">
import { useAnalytics } from '@nexuvia/vue';

const { track } = useAnalytics();

// Example:
// track({ type: 'addToCart', code: 'SKU-001', name: 'Headphones', quantity: 1 });
</script>
```

### `useSmartEdit`

```vue
<script setup lang="ts">
import { useSmartEdit } from '@nexuvia/vue';

const { isPreviewMode } = useSmartEdit();
</script>
```

---

## Step 3 — CMS component registry

The component registry is still manual — `@nexuvia/vue` does not auto-register project CMS components. Register them once before `app.mount()`:

```ts
// src/plugins/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import CmsHeader  from '@/components/cms/defaults/CmsHeader.vue';
import CmsFooter  from '@/components/cms/defaults/CmsFooter.vue';
import CmsBanners from '@/components/cms/defaults/CmsBanners.vue';

componentRegistry.register('CMSHeaderComponent',  CmsHeader  as any);
componentRegistry.register('CMSFooterComponent',  CmsFooter  as any);
componentRegistry.register('CMSBannersComponent', CmsBanners as any);
// register every typeCode in nexuvia.config.ts → cms.componentTypes
```

For Nuxt, use a `.client.ts` plugin so it only runs on the client:

```ts
// plugins/cms-defaults.client.ts
export default defineNuxtPlugin(() => {
  import('./cms-defaults');   // side-effect import
});
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
import { useRoute }  from 'vue-router';
import { onMounted } from 'vue';
import { useCart }   from '@nexuvia/vue';
import { productClient } from '@/lib/clients';   // direct client for non-reactive one-off fetch

const route  = useRoute();
const code   = route.params.code as string;
const { addItem } = useCart();

const product = ref(null);
onMounted(async () => { product.value = await productClient.getProduct(code); });
</script>

<template>
  <div v-if="!product">Loading…</div>
  <div v-else>
    <h1>{{ product.name }}</h1>
    <p>{{ product.price?.formattedValue }}</p>
    <button @click="addItem(product.code)">Add to Cart</button>
  </div>
</template>
```

---

## Checklist

- [ ] `pnpm add @nexuvia/vue` installed
- [ ] `app.use(createNexuviaPlugin({ ... }))` called before `app.mount()`
- [ ] All composables imported from `@nexuvia/vue`
- [ ] CMS plugin registered before mount (`.client.ts` for Nuxt, import in `main.ts` for Vite)
- [ ] Backend running for cart + auth (or Nuxt server routes)
- [ ] No `process.env` in client code (use `import.meta.env.VITE_*` or `useRuntimeConfig()`)
- [ ] `<CmsSlotRenderer>` resolves via `componentRegistry.resolve(typeCode)`
