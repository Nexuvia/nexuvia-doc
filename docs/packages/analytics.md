---
title: "@nexuvia/analytics"
sidebar_position: 12
---

# @nexuvia/analytics

Analytics event tracking with adapter pattern and GTM implementation.

**Framework-agnostic — pure TypeScript core. React layer (`GtmScript`, `useAnalytics`) in `@nexuvia/react`.**

---

## Installation

```bash
npm install @nexuvia/analytics @nexuvia/core
```

---

## Architecture

```
AnalyticsAdapter    abstract contract — single push(event) method
      ↓
AnalyticsClient     typed helpers, error capture, EventEmitter, state snapshot
      ↓
Framework binding   React: AnalyticsProvider + useAnalytics()
                    Vue: composable wrapping client.on()
                    Angular: @Injectable service
```

The adapter has a single `push(event)` method. All normalization from typed Nexuvia events to the wire format (GTM dataLayer, Segment track, etc.) happens inside the adapter.

---

## What's exported

| Export | What it is |
|--------|-----------|
| `AnalyticsClient` | Core logic — typed helpers, error capture, events |
| `AnalyticsAdapter` | Abstract base class |
| `GtmAnalyticsAdapter` | GTM `window.dataLayer` implementation with SSR queue |
| `MockAnalyticsAdapter` | Test adapter — captures events for assertion |
| `GtmScript` | React component — injects GTM script tag |
| All event types | `AnalyticsEvent`, `PageViewEvent`, `AddToCartEvent`, `PurchaseEvent`, etc. |

---

## Setup — Next.js

### Step 1 — Config

```ts
// nexuvia.config.ts
analytics: {
  gtmContainerId: process.env.GTM_CONTAINER_ID || '', // e.g. 'GTM-XXXXXXX'
},
```

Leave empty to safely disable GTM in local dev — `GtmScript` only renders when `containerId` is non-empty.

### Step 2 — Wire via NexuviaProvider

`NexuviaProvider` from `@nexuvia/react` composes `AnalyticsProvider` internally when you pass `analytics` config:

```tsx
// src/app/[lang]/store-layout-client.tsx
'use client';

import { NexuviaProvider } from '@nexuvia/react';
import { GtmScript }       from '@nexuvia/analytics';
import config from '../../../nexuvia.config';

export function StoreLayoutClient({ children, storeKey, language }) {
  return (
    <>
      {config.analytics.gtmContainerId && (
        <GtmScript containerId={config.analytics.gtmContainerId} />
      )}
      <NexuviaProvider
        storeKey={storeKey}
        language={language}
        analytics={{ gtmContainerId: config.analytics.gtmContainerId }}
      >
        {children}
      </NexuviaProvider>
    </>
  );
}
```

### Step 3 — Use in components

```tsx
'use client';

import { useAnalytics } from '@nexuvia/react';

// Import from @nexuvia/react — NOT from @nexuvia/analytics
```

---

## Tracking events — React

### Page views (automatic)

Page views fire automatically on every route change via `usePathname()` inside `AnalyticsProvider`. You don't need to call `trackPageView()` for standard navigation.

Manual page view (e.g. after a modal opens):

```tsx
const { trackPageView } = useAnalytics();
trackPageView('My Custom Title');
```

### Product impressions

Fire when products appear in a list:

```tsx
const { trackProductImpression } = useAnalytics();

trackProductImpression(
  products.map((p, i) => ({
    code:     p.code,
    name:     p.name,
    price:    p.price?.value,
    currency: p.price?.currencyIso,
    position: i + 1,
  })),
  'Search Results',  // list name
);
```

### Product click

```tsx
const { trackProductClick } = useAnalytics();

trackProductClick({
  code:     product.code,
  name:     product.name,
  price:    product.price?.value,
  currency: product.price?.currencyIso,
  position: 3,
  listName: 'Search Results',
});
```

### Add to cart

```tsx
const { trackAddToCart } = useAnalytics();

trackAddToCart({
  code:     product.code,
  name:     product.name,
  quantity: 1,
  price:    product.price?.value,
  currency: product.price?.currencyIso,
});
```

### Remove from cart

```tsx
const { trackRemoveFromCart } = useAnalytics();

trackRemoveFromCart({
  code:     entry.product.code,
  name:     entry.product.name,
  quantity: entry.quantity,
});
```

### Purchase

```tsx
const { trackPurchase } = useAnalytics();

trackPurchase({
  orderId:  order.code,
  total:    order.totalPrice.value,
  currency: order.totalPrice.currencyIso,
  items: order.entries.map((e) => ({
    code:     e.product.code,
    name:     e.product.name,
    quantity: e.quantity,
    price:    e.basePrice?.value,
  })),
});
```

---

## Testing with MockAnalyticsAdapter

```ts
import { MockAnalyticsAdapter, AnalyticsClient } from '@nexuvia/analytics';

const adapter = new MockAnalyticsAdapter();
const client  = new AnalyticsClient(adapter);

client.trackAddToCart({ code: 'ABC123', name: 'Test Product', quantity: 1 });

console.log(adapter.capturedEvents);
// [{ type: 'add_to_cart', code: 'ABC123', name: 'Test Product', quantity: 1 }]

adapter.clear(); // reset between tests
```

---

## GTM SSR queue

`GtmAnalyticsAdapter` queues events pushed before `window.dataLayer` is available (during SSR hydration) and flushes them on the first client-side push. No events are lost during the hydration gap.

---

## Error handling

Analytics errors are caught internally and emitted as `'error'` events — they never propagate to the page. A broken analytics adapter never breaks the storefront.

```ts
const off = client.on('error', (err) => {
  // Log to your monitoring service
  console.error('Analytics error:', err.message);
});
```

---

## `useAnalytics()` API

```tsx
const {
  lastEvent,              // AnalyticsEvent | null
  isReady,               // boolean — true after first push
  eventCount,            // number

  trackPageView,          // (title?: string) => void
  trackProductImpression, // (products, listName?) => void
  trackProductClick,      // (params) => void
  trackAddToCart,         // (params) => void
  trackRemoveFromCart,    // (params) => void
  trackPurchase,          // (params) => void
  push,                   // (event: AnalyticsEvent) => void
} = useAnalytics();
```

## `AnalyticsClient` direct API

```ts
client.trackPageView(url?, title?, lang?, storeKey?): void
client.trackProductImpression(products, listName?): void
client.trackProductClick(params): void
client.trackAddToCart(params): void
client.trackRemoveFromCart(params): void
client.trackPurchase(params): void
client.push(event: AnalyticsEvent): void
client.on('event', handler): () => void
client.on('error', handler): () => void
client.getState(): AnalyticsClientState
```

---

## Adding a custom adapter

To send events to Segment, Mixpanel, or any other backend:

```ts
import { AnalyticsAdapter } from '@nexuvia/analytics';
import type { AnalyticsEvent } from '@nexuvia/analytics';

export class SegmentAdapter extends AnalyticsAdapter {
  push(event: AnalyticsEvent): void {
    switch (event.type) {
      case 'add_to_cart':
        analytics.track('Product Added', { product_id: event.code, quantity: event.quantity });
        break;
      case 'purchase':
        analytics.track('Order Completed', { order_id: event.orderId, total: event.total });
        break;
    }
  }
}

// Use it exactly like GtmAnalyticsAdapter
const client = new AnalyticsClient(new SegmentAdapter());
```

`push()` must be synchronous — fire-and-forget any async calls inside it.
