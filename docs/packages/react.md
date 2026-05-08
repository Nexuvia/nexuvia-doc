---
title: "@nexuvia/react"
sidebar_position: 14
---

# @nexuvia/react

React provider and hooks — single import wires all Nexuvia contexts with correct nesting baked in.

**Install once, use anywhere — no manual `CartProvider`, `AuthProvider`, or `AnalyticsProvider` files.**

---

## Installation

```bash
pnpm add @nexuvia/react
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

---

## What's exported

| Export | What it is |
|--------|-----------|
| `NexuviaProvider` | Single provider that wraps all contexts in the correct nesting order |
| `useStore()` | Access current `storeKey`, `language`, and `storeConfig` |
| `useAuth()` | Access `user`, `login()`, `logout()`, `refreshSession()` |
| `useCart()` | Full cart CRUD — matches `CartClient` hook API |
| `useCmsPage()` | Access `page`, `isLoading`, `error` from CMS context |
| `useAnalytics()` | All typed tracking helpers |
| `useSmartEdit()` | Access `isPreviewMode` and SmartEdit context |
| `StoreProvider` | Escape hatch — internal store context provider |
| `AuthProvider` | Escape hatch — internal auth context provider |
| `CartProvider` | Escape hatch — internal cart context provider |
| `AnalyticsProvider` | Escape hatch — internal analytics context provider |
| `SmartEditInternalProvider` | Escape hatch — internal SmartEdit context provider |

---

## `NexuviaProvider`

### Props

```ts
interface NexuviaProviderProps {
  storeKey:         string;
  language:         string;
  storeConfig:      StoreConfig;
  cartClientConfig: ProxyCartAdapterConfig;
  initialUser?:     SessionUser | null;
  gtmContainerId?:  string;
  smartEditConfig?: SmartEditServiceConfig;
  children:         ReactNode;
}
```

### Usage

```tsx
// src/App.tsx
import { NexuviaProvider } from '@nexuvia/react';
import { GtmScript }       from '@nexuvia/analytics';

export function App() {
  return (
    <>
      <GtmScript containerId="GTM-XXXXXXX" />
      <NexuviaProvider
        storeKey="default"
        language="en"
        storeConfig={myStoreConfig}
        cartClientConfig={{ baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' }}
        gtmContainerId="GTM-XXXXXXX"
      >
        <Router />
      </NexuviaProvider>
    </>
  );
}
```

### Internal provider order

`NexuviaProvider` nests providers in this order (outermost → innermost):

```
StoreProvider
  AuthProvider
    CartProvider
      AnalyticsProvider
        Suspense
          SmartEditInternalProvider
            {children}
```

---

## `useStore()`

```ts
const {
  storeKey,    // string
  language,    // string
  storeConfig, // StoreConfig
} = useStore();
```

---

## `useAuth()`

```ts
const {
  user,            // SessionUser | null
  isLoggedIn,      // boolean

  login,           // (storeKey: string) => Promise<void>
  logout,          // (storeKey: string) => Promise<void>
  refreshSession,  // () => Promise<void>
} = useAuth();
```

---

## `useCart()`

```ts
const {
  cart,             // Cart | null
  cartId,           // string | null
  isLoading,        // boolean
  error,            // Error | null

  fetchCart,        // () => Promise<void>
  addItem,          // (productCode: string, quantity?: number) => Promise<void>
  updateCartEntry,  // (entryNumber: number, quantity: number) => Promise<void>
  removeFromCart,   // (entryNumber: number) => Promise<void>
  mergeCarts,       // (userId: string) => Promise<void>
  clearCart,        // () => void
} = useCart();
```

---

## `useCmsPage()`

```ts
const {
  page,       // CMSPage | null
  isLoading,  // boolean
  error,      // Error | null
} = useCmsPage();
```

---

## `useAnalytics()`

```ts
const {
  lastEvent,               // AnalyticsEvent | null
  isReady,                 // boolean
  eventCount,              // number

  trackPageView,           // (title?: string) => void
  trackProductImpression,  // (products, listName?) => void
  trackProductClick,       // (params) => void
  trackAddToCart,          // (params) => void
  trackRemoveFromCart,     // (params) => void
  trackPurchase,           // (params) => void
  push,                    // (event: AnalyticsEvent) => void
} = useAnalytics();
```

---

## `useSmartEdit()`

```ts
const {
  isPreviewMode,  // boolean
  page,           // SmartEditPage | null
} = useSmartEdit();
```

---

## Escape hatches

Use individual providers only when you need to override the default client wiring (for example to attach a payload extender):

```tsx
import {
  StoreProvider,
  AuthProvider,
  CartProvider,
  AnalyticsProvider,
  SmartEditInternalProvider,
} from '@nexuvia/react';
```

Each provider takes the same props as its corresponding Wiring library provider. See the individual package docs for full prop signatures.
