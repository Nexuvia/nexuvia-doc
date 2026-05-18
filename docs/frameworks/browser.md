---
title: Browser (Plain TS/JS)
sidebar_position: 5
---

<!--

# Browser (Plain TS/JS) — Assembly Guide

`@nexuvia/browser` provides a single `NexuviaClient` class with no framework dependency. Use it in vanilla TypeScript, server-rendered HTML pages, or anywhere React/Vue/Angular are not available.

---

## Installation

```bash
pnpm add @nexuvia/browser
```

No peer dependencies.

---

## Step 1 — Instantiate `NexuviaClient`

```ts
import { NexuviaClient } from '@nexuvia/browser';

const client = new NexuviaClient({
  storeKey:  'default',
  language:  'en',
  cartClientConfig: {
    baseSite: 'my-basesite',
    language: 'en',
    apiBase:  '/api/cart',   // your backend proxy URL
  },
  gtmContainerId: 'GTM-XXXXXXX',   // optional — omit to disable GTM
});
```

The client fires a `ready` event once all sub-clients are initialised and the cart cookie has been read.

---

## Step 2 — Wait for `ready`

Always subscribe to `ready` before accessing sub-clients to ensure the cart ID has been restored from the cookie:

```ts
client.on('ready', () => {
  console.log('Nexuvia ready');
  client.cart.fetchCart();
});

client.on('error', (err) => {
  console.error('Nexuvia error:', err.message);
});
```

---

## Sub-clients

| Property | Type | What it does |
|----------|------|-------------|
| `client.cart` | `CartClient` | Full cart CRUD — see [@nexuvia/cart](/packages/cart) |
| `client.search` | `SearchClient` | Full-text + category search — see [@nexuvia/search](/packages/search) |
| `client.product` | `ProductClient` | Product detail + reviews — see [@nexuvia/product](/packages/product) |
| `client.analytics` | `AnalyticsClient` | Typed event tracking — see [@nexuvia/analytics](/packages/analytics) |

---

## Cart operations

```ts
client.on('ready', async () => {
  // Add an item (creates cart on first call)
  await client.cart.addToCart('SKU-001', 2);

  // Read current state
  const { cart, isLoading, error } = client.cart.getState();
  console.log('Cart total:', cart?.totalPrice?.formattedValue);

  // Subscribe to cart changes
  const off = client.cart.on('cart', () => {
    const state = client.cart.getState();
    renderCart(state.cart);
  });

  // Remove an item
  await client.cart.removeFromCart(0);   // entryNumber

  // Clear cart and cookie
  client.cart.clearCart();

  // Stop listening
  off();
});
```

---

## Product fetch

`search` and `product` use `MockProductAdapter` / `MockSearchAdapter` by default — direct OCC calls from a browser are blocked by CORS. Swap in a proxy adapter to use live data.

```ts
const product = await client.product.getProduct('SKU-001');
console.log(product.name, product.price?.formattedValue);
```

---

## Search

```ts
const results = await client.search.search({
  query:    'headphones',
  page:     0,
  pageSize: 20,
});

console.log(`${results.pagination.totalResults} results`);
results.products.forEach(p => console.log(p.name));

// Suggestions
const suggestions = await client.search.getSuggestions('headp');
suggestions.forEach(s => console.log(s.value));
```

---

## Analytics

```ts
// Page view (call manually on SPA navigation)
client.analytics.trackPageView(window.location.pathname, document.title);

// Add to cart
client.analytics.trackAddToCart({
  code:     'SKU-001',
  name:     'Wireless Headphones',
  quantity: 1,
  price:    299,
  currency: 'AED',
});

// Purchase
client.analytics.trackPurchase({
  orderId:  'ORD-9999',
  total:    299,
  currency: 'AED',
  items: [{ code: 'SKU-001', name: 'Wireless Headphones', quantity: 1, price: 299 }],
});
```

---

## Full working example

```ts
import { NexuviaClient } from '@nexuvia/browser';

const client = new NexuviaClient({
  storeKey:         'default',
  language:         'en',
  cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
  gtmContainerId:   'GTM-XXXXXXX',
});

// Render cart badge
const badge = document.getElementById('cart-badge')!;

client.cart.on('cart', () => {
  const { cart } = client.cart.getState();
  badge.textContent = String(cart?.totalItems ?? 0);
});

// Add to cart buttons
document.querySelectorAll('[data-add-to-cart]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const code = (btn as HTMLElement).dataset.addToCart!;
    await client.cart.addToCart(code, 1);
    client.analytics.trackAddToCart({ code, name: btn.textContent ?? '', quantity: 1 });
  });
});

client.on('ready', () => {
  client.cart.fetchCart();
  client.analytics.trackPageView(window.location.pathname, document.title);
});

client.on('error', (err) => console.error(err));
```

---

## Swapping adapters (live OCC data)

By default `@nexuvia/browser` uses mock adapters for product and search to avoid CORS errors. To use live data, construct the sub-clients directly after instantiation:

```ts
import { NexuviaClient }                   from '@nexuvia/browser';
import { ProductClient, OccProductAdapter } from '@nexuvia/product';
import { SearchClient, OccSearchAdapter }   from '@nexuvia/search';
import { OccClient }                        from '@nexuvia/occ';

const client = new NexuviaClient({
  storeKey:         'default',
  language:         'en',
  cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
});

// Build an OCC client pointing at your backend proxy (not SAP directly — CORS)
const occClient = new OccClient(
  { baseUrl: '/api/occ-proxy', basePath: '', version: 'v2' },
  'my-basesite',
  'en',
);

// Use the sub-clients directly — bypass client.product / client.search
const productClient = new ProductClient(new OccProductAdapter(occClient));
const searchClient  = new SearchClient(new OccSearchAdapter(occClient));
```

---

## Checklist

- [ ] `pnpm add @nexuvia/browser` installed
- [ ] `NexuviaClient` instantiated once per page
- [ ] All cart operations run inside `client.on('ready', ...)` callback
- [ ] `client.on('error', handler)` subscribed to capture runtime errors
- [ ] Cart operations proxied through your backend (never direct OCC from browser)
- [ ] `trackPageView` called manually on SPA navigation
-->
