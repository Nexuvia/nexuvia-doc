---
title: "@nexuvia/browser"
sidebar_position: 17
---

# @nexuvia/browser

Plain TypeScript/JavaScript client — no framework required. A single `NexuviaClient` class exposes cart, search, product, and analytics sub-clients, plus an event system for lifecycle hooks.

---

## Installation

```bash
pnpm add @nexuvia/browser
```

No peer dependencies.

---

## What's exported

| Export | What it is |
|--------|-----------|
| `NexuviaClient` | Main class — instantiate once per page |
| `NexuviaClientConfig` | Config interface |

---

## `NexuviaClientConfig`

```ts
interface NexuviaClientConfig {
  storeKey:         string;
  language:         string;
  cartClientConfig: ProxyCartAdapterConfig;  // { baseSite, language, apiBase? }
  gtmContainerId?:  string;
  smartEditConfig?: SmartEditServiceConfig;
  cmsMockLoader?:   (label: string) => Promise<unknown>;
  // Override sub-clients (advanced — use to swap adapters)
  productClient?:   ProductClient;
  searchClient?:    SearchClient;
}
```

---

## `NexuviaClient`

```ts
class NexuviaClient {
  // Sub-clients
  readonly cart:      CartClient;
  readonly search:    SearchClient;
  readonly product:   ProductClient;
  readonly analytics: AnalyticsClient;

  // Lifecycle events
  on(event: 'ready', handler: () => void):       () => void;
  on(event: 'error', handler: (err: Error) => void): () => void;
}
```

### Default adapter behaviour

| Sub-client | Default adapter | Notes |
|------------|----------------|-------|
| `cart` | `ProxyCartAdapter` | Calls your backend at `cartClientConfig.apiBase` |
| `search` | `MockSearchAdapter` | Swap via `searchClient` config option for live data |
| `product` | `MockProductAdapter` | Swap via `productClient` config option for live data |
| `analytics` | `GtmAnalyticsAdapter` | GTM disabled when `gtmContainerId` is empty/omitted |

Search and product use mock adapters by default because direct OCC calls from a browser are blocked by CORS. See [swapping adapters](#swapping-adapters) below.

---

## Usage

```ts
import { NexuviaClient } from '@nexuvia/browser';

const client = new NexuviaClient({
  storeKey:         'default',
  language:         'en',
  cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
  gtmContainerId:   'GTM-XXXXXXX',
});

client.on('ready', () => {
  client.cart.fetchCart();
  client.analytics.trackPageView(window.location.pathname, document.title);
});

client.on('error', (err) => {
  console.error('Nexuvia error:', err.message);
});
```

---

## `CartClient` API (via `client.cart`)

```ts
client.cart.getCartId()                       // string | null
client.cart.fetchCart()                       // Promise<void>
client.cart.addToCart(code, qty?)             // Promise<void> — creates cart on first call
client.cart.removeFromCart(entryNumber)       // Promise<void>
client.cart.patchEntry(entryNumber, qty)      // Promise<void>
client.cart.mergeCarts(userId)               // Promise<void>
client.cart.clearCart()                       // void — clears local state + cookie
client.cart.getState()                        // CartClientState snapshot
client.cart.on('cart',  handler)              // () => void — off function
client.cart.on('error', handler)              // () => void — off function
```

---

## `SearchClient` API (via `client.search`)

```ts
client.search.search(params)         // Promise<SearchResult>
client.search.getSuggestions(query)  // Promise<SearchSuggestion[]>
```

```ts
interface SearchParams {
  query:      string;
  page?:      number;   // default 0
  pageSize?:  number;   // default 20
  sort?:      string;
  facets?:    string[];
}
```

---

## `ProductClient` API (via `client.product`)

```ts
client.product.getProduct(code)                              // Promise<Product>
client.product.getProductsByCategory(categoryCode, params?)  // Promise<SearchResult>
client.product.getReviews(code)                              // Promise<ProductReview[]>
```

---

## `AnalyticsClient` API (via `client.analytics`)

```ts
client.analytics.trackPageView(url?, title?, lang?, storeKey?): void
client.analytics.trackProductImpression(products, listName?):   void
client.analytics.trackProductClick(params):                     void
client.analytics.trackAddToCart(params):                        void
client.analytics.trackRemoveFromCart(params):                   void
client.analytics.trackPurchase(params):                         void
client.analytics.push(event: AnalyticsEvent):                   void
client.analytics.on('event', handler): () => void
client.analytics.on('error', handler): () => void
```

---

## Swapping adapters

To use live SAP data for product or search, provide a pre-built client via the config:

```ts
import { NexuviaClient }                   from '@nexuvia/browser';
import { ProductClient, OccProductAdapter } from '@nexuvia/product';
import { SearchClient, OccSearchAdapter }   from '@nexuvia/search';
import { OccClient }                        from '@nexuvia/occ';

const occClient = new OccClient(
  { baseUrl: 'https://your-proxy.example.com', basePath: '/occ', version: 'v2' },
  'my-basesite',
  'en',
);

const client = new NexuviaClient({
  storeKey:         'default',
  language:         'en',
  cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
  productClient:    new ProductClient(new OccProductAdapter(occClient)),
  searchClient:     new SearchClient(new OccSearchAdapter(occClient)),
});
```

The `baseUrl` should point to your backend proxy — browsers cannot call SAP OCC directly due to CORS.

---

## Full example

```ts
import { NexuviaClient } from '@nexuvia/browser';

const client = new NexuviaClient({
  storeKey:         'default',
  language:         'en',
  cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
  gtmContainerId:   'GTM-XXXXXXX',
});

// Cart badge
const badge = document.getElementById('cart-badge');
client.cart.on('cart', () => {
  const { cart } = client.cart.getState();
  if (badge) badge.textContent = String(cart?.totalItems ?? 0);
});

// Add to cart
document.querySelectorAll('[data-add-to-cart]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const code = (btn as HTMLElement).dataset.addToCart!;
    await client.cart.addToCart(code, 1);
    client.analytics.trackAddToCart({ code, name: code, quantity: 1 });
  });
});

// Search
const input = document.getElementById('search-input') as HTMLInputElement;
const results = document.getElementById('search-results')!;

input?.addEventListener('input', async () => {
  const suggestions = await client.search.getSuggestions(input.value);
  results.innerHTML = suggestions.map(s => `<li>${s.value}</li>`).join('');
});

// Ready
client.on('ready', () => {
  client.cart.fetchCart();
  client.analytics.trackPageView(window.location.pathname, document.title);
});

client.on('error', (err) => console.error(err));
```
