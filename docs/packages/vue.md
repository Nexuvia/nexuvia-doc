---
title: "@nexuvia/vue"
sidebar_position: 15
---

# @nexuvia/vue

Vue 3 plugin and composables — single `app.use()` call wires all Nexuvia state with no manual composable files.

---

## Installation

```bash
pnpm add @nexuvia/vue
```

Peer dependencies: `vue >= 3.3`.

---

## What's exported

| Export | What it is |
|--------|-----------|
| `createNexuviaPlugin(options)` | Vue plugin — installed via `app.use()` |
| `useStore()` | Composable — `storeKey`, `language`, `storeConfig` |
| `useAuth()` | Composable — `user`, `isLoggedIn`, `login()`, `logout()` |
| `useCart()` | Composable — full cart CRUD as Vue `ref`s |
| `useAnalytics()` | Composable — all typed tracking helpers |
| `useSmartEdit()` | Composable — `isPreviewMode`, SmartEdit page |

---

## `createNexuviaPlugin(options)`

### Options

```ts
interface NexuviaPluginOptions {
  storeKey:         string;
  language:         string;
  storeConfig:      StoreConfig;
  cartClientConfig: ProxyCartAdapterConfig;  // { baseSite, language, apiBase? }
  initialUser?:     SessionUser | null;
  gtmContainerId?:  string;
  smartEditConfig?: SmartEditServiceConfig;
}
```

### Usage

```ts
// src/main.ts
import { createApp }           from 'vue';
import { createNexuviaPlugin } from '@nexuvia/vue';
import App                     from './App.vue';

const app = createApp(App);

app.use(createNexuviaPlugin({
  storeKey:         'default',
  language:         'en',
  storeConfig:      myStoreConfig,
  cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
  gtmContainerId:   'GTM-XXXXXXX',
}));

app.mount('#app');
```

---

## `useStore()`

```ts
const {
  storeKey,    // Ref<string>
  language,    // Ref<string>
  storeConfig, // Ref<StoreConfig>
} = useStore();
```

---

## `useAuth()`

```ts
const {
  user,       // Ref<SessionUser | null>
  isLoggedIn, // Ref<boolean>

  login,      // (storeKey: string) => Promise<void>
  logout,     // (storeKey: string) => Promise<void>
} = useAuth();
```

---

## `useCart()`

```ts
const {
  cart,            // Ref<Cart | null>
  isLoading,       // Ref<boolean>
  error,           // Ref<Error | null>

  fetchCart,       // () => Promise<void>
  addItem,         // (productCode: string, quantity?: number) => Promise<void>
  updateCartEntry, // (entryNumber: number, quantity: number) => Promise<void>
  removeFromCart,  // (entryNumber: number) => Promise<void>
  mergeCarts,      // (userId: string) => Promise<void>
  clearCart,       // () => void
} = useCart();
```

All state values are Vue `ref`s — use them directly in `<template>` without `.value`.

---

## `useAnalytics()`

```ts
const {
  trackPageView,           // (title?: string) => void
  trackProductImpression,  // (products, listName?) => void
  trackProductClick,       // (params) => void
  trackAddToCart,          // (params) => void
  trackRemoveFromCart,     // (params) => void
  trackPurchase,           // (params) => void
  push,                    // (event: AnalyticsEvent) => void
} = useAnalytics();
```

`trackPageView` is called automatically on every `route.fullPath` change when the composable is used inside a component that has `vue-router` in scope.

---

## `useSmartEdit()`

```ts
const {
  isPreviewMode,  // Ref<boolean>
  page,           // Ref<SmartEditPage | null>
} = useSmartEdit();
```

---

## Usage example

```vue
<!-- src/pages/cart.vue -->
<script setup lang="ts">
import { useCart }     from '@nexuvia/vue';
import { useAnalytics } from '@nexuvia/vue';

const { cart, isLoading, removeFromCart } = useCart();
const { trackRemoveFromCart }             = useAnalytics();

function removeEntry(entry) {
  trackRemoveFromCart({ code: entry.product.code, name: entry.product.name, quantity: entry.quantity });
  removeFromCart(entry.entryNumber);
}
</script>

<template>
  <div v-if="isLoading">Loading…</div>
  <ul v-else-if="cart?.entries?.length">
    <li v-for="entry in cart.entries" :key="entry.entryNumber">
      {{ entry.product.name }} × {{ entry.quantity }}
      <button @click="removeEntry(entry)">Remove</button>
    </li>
  </ul>
  <p v-else>Cart is empty.</p>
</template>
```
