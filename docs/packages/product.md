---
title: "@nexuvia/product"
sidebar_position: 6
---

# @nexuvia/product

Product detail, reviews, and review posting with a 5-minute cache.

**Framework-agnostic — pure TypeScript. Works in React, Vue, Angular, or plain TS.**

---

## Installation

```bash
npm install @nexuvia/product @nexuvia/core
```

---

## Architecture

```
ProductAdapter      abstract contract — getProduct, getReviews, postReview
      ↓
ProductClient       logic — 5-min cache per code, EventEmitter, state snapshot
      ↓
Framework binding   React: ProductProvider + useProduct()
                    Vue / Angular: client.on() directly
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `ProductClient` | Core logic — cache, events |
| `ProductAdapter` | Abstract base class |
| `OccProductAdapter` | SAP OCC implementation — server-side only |
| `MockProductAdapter` | In-memory mock — local dev and tests |
| All types | `Product`, `ProductReview`, `ProductPrice`, `ProductImage`, `GetProductOptions`, `GetReviewsOptions` |

---

## Quick start — Next.js (Server Component)

```ts
import { app }     from '@/nexuvia.app';
import { headers } from 'next/headers';
import { OccProductAdapter } from '@nexuvia/product';

export default async function ProductPage({ params }) {
  const { lang, code } = await params;
  const h              = await headers();
  const storeKey       = h.get('x-store-key') ?? 'ae';
  const ctx            = await app.forRequest(storeKey, lang);

  // For server-side one-shot fetches, use adapter directly (no event system needed):
  const product = await new OccProductAdapter(ctx.occ).getProduct(code);
}
```

---

## Quick start — Client-side

```ts
import { OccProductAdapter, ProductClient } from '@nexuvia/product';
import { OccClient } from '@nexuvia/occ';

const occClient    = new OccClient(occConfig, baseSite, lang);
const adapter      = new OccProductAdapter(occClient);
const productClient = new ProductClient(adapter);

// Subscribe to updates
const off = productClient.on('product', (product) => {
  console.log('Product loaded:', product?.name);
});

// Fetch
await productClient.getProduct('12345');

// Cleanup
off();
```

---

## Mock adapter (dev / tests)

```ts
import { MockProductAdapter, ProductClient } from '@nexuvia/product';

const adapter = new MockProductAdapter();
const client  = new ProductClient(adapter);

// Returns a predictable mock product for any code
const product = await client.getProduct('TEST-001');
```

Custom loader — inject specific data per code:

```ts
const adapter = new MockProductAdapter((code) => ({
  code,
  name: `Test Product ${code}`,
  price: { value: 99, currencyIso: 'AED', formattedValue: 'AED 99.00' },
}));
```

---

## Reviews

```ts
// Fetch reviews
const reviews = await client.getReviews('12345');

// Post a review (invalidates and auto-refetches)
await client.postReview('12345', {
  headline: 'Great product',
  comment:  'Highly recommend',
  rating:   5,
});
```

---

## Cache behaviour

| Situation | Behaviour |
|-----------|-----------|
| First `getProduct(code)` call | Fetches from SAP, caches for 5 minutes |
| Repeat call within 5 min | Returns cached value — no HTTP call |
| After `postReview()` | Reviews cache for that code is invalidated + refetched |
| `client.clearCache()` | Clears all cached products |

---

## React integration

`NexuviaProvider` from `@nexuvia/react` mounts `ProductProvider` internally — `useProduct()` is available anywhere inside it:

```tsx
import { useProduct } from '@nexuvia/react';
import { useEffect }  from 'react';

export function ProductPage({ code }: { code: string }) {
  const { product, isLoading, getProduct } = useProduct();

  useEffect(() => { getProduct(code); }, [code]);

  if (isLoading) return <p>Loading…</p>;
  if (!product)  return <p>Not found</p>;

  return <h1>{product.name}</h1>;
}
```

---

## `ProductClient` API

```ts
client.getProduct(code: string, options?: GetProductOptions): Promise<Product | null>
client.getReviews(code: string, options?: GetReviewsOptions): Promise<ProductReview[]>
client.postReview(code: string, review: ReviewInput): Promise<void>
client.clearCache(): void
client.on('product', (product: Product | null) => void): () => void
client.on('reviews', (reviews: ProductReview[])   => void): () => void
client.on('error',   (err: Error)                 => void): () => void
client.getState(): ProductClientState
```

---

## Types

```ts
interface Product {
  code:        string;
  name:        string;
  price?:      ProductPrice;
  images?:     ProductImage[];
  description?: string;
  [key: string]: unknown; // SAP-specific fields pass through
}

interface ProductReview {
  id:        string;
  headline:  string;
  comment:   string;
  rating:    number;
  date:      string;
  principal: { name: string };
}

interface ProductPrice {
  currencyIso:    string;
  value:          number;
  formattedValue: string;
}
```

---

## Checklist

- [ ] Use `OccProductAdapter` in Server Components / server-side code
- [ ] Use `MockProductAdapter` in local dev and tests
- [ ] For reactive client-side use, wrap in a React provider or Vue composable
- [ ] `postReview` auto-invalidates the reviews cache — no manual `clearCache()` needed after posting
