---
title: Wiring @nexuvia/product
sidebar_position: 10
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/product`

Product wiring has **two modes** — pick the simplest one that fits.

| Mode | When to use |
|------|-------------|
| **Server fetch** (recommended) | Product detail page that doesn't mutate state. Just fetch and render. |
| **Client reactive** | Pages with mutations (post review, live updates). Needs Layer 3 wrapper. |

Most projects use only **Mode 1**.

---

## Mode 1 — Server fetch (no provider needed)

The product is fetched server-side, passed to your UI tree as a prop. No reactive wrapper needed.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js (Server Component)">

```tsx
// src/app/[lang]/p/[code]/page.tsx
import { headers } from 'next/headers';
import { createServerOccClient } from '@/config/server';
import { OccProductAdapter }     from '@nexuvia/product';
import { notFound }              from 'next/navigation';
import ProductPageClient         from './page-client';

export default async function ProductPage({ params }) {
  const { lang, code } = await params;
  const storeKey       = (await headers()).get('x-store-key') ?? '';
  const occClient      = await createServerOccClient(storeKey, lang);

  const product = await new OccProductAdapter(occClient).getProduct(code);
  if (!product) notFound();

  return <ProductPageClient product={product} />;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/product.ts
import { Router } from 'express';
import { createServerOccClient } from '../config/server';
import { OccProductAdapter }     from '@nexuvia/product';

const router = Router();

router.get('/api/products/:code', async (req, res) => {
  const { code }    = req.params;
  const { storeKey, lang } = req.query as any;
  const occClient   = await createServerOccClient(storeKey, lang);
  const product     = await new OccProductAdapter(occClient).getProduct(code);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

export default router;
```

The browser then `fetch('/api/products/' + code)` and renders the JSON.

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/products/[code].get.ts
import { createServerOccClient } from '~/config/server';
import { OccProductAdapter }     from '@nexuvia/product';

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')!;
  const { storeKey, lang } = getQuery(event) as any;
  const occClient = await createServerOccClient(storeKey, lang);
  const product   = await new OccProductAdapter(occClient).getProduct(code);
  if (!product) throw createError({ statusCode: 404 });
  return product;
});
```

```vue
<!-- pages/p/[code].vue -->
<script setup lang="ts">
const route = useRoute();
const { data: product } = await useFetch(`/api/products/${route.params.code}`);
</script>
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

```ts
// server.ts (Express handler)
server.get('/api/products/:code', async (req, res) => {
  const { code }           = req.params;
  const { storeKey, lang } = req.query as any;
  const occClient = await createServerOccClient(storeKey, lang);
  const product   = await new OccProductAdapter(occClient).getProduct(code);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});
```

</TabItem>
</Tabs>

That's it for Mode 1 — no provider, no Layer 3 wrapper.

---

## Mode 2 — Client reactive (for reviews / live updates)

Use this only when components mutate state (e.g. posting a review and seeing the list refresh automatically).

### Provider / composable / service

<Tabs groupId="framework">
<TabItem value="react" label="React">

```tsx
// src/providers/product-provider.tsx
'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { ProductClient, ProductClientState } from '@nexuvia/product';

const Ctx = createContext<any>(null);

export function ProductProvider({ client, children }: { client: ProductClient; children: ReactNode }) {
  const [state, setState] = useState<ProductClientState>(() => client.getState());
  useEffect(() => {
    const off1 = client.on('product', () => setState(client.getState()));
    const off2 = client.on('reviews', () => setState(client.getState()));
    const off3 = client.on('error',   () => setState(client.getState()));
    return () => { off1(); off2(); off3(); };
  }, [client]);

  return <Ctx.Provider value={{
    ...state,
    getProduct: useCallback((c: string) => client.getProduct(c), [client]),
    getReviews: useCallback((c: string) => client.getReviews(c), [client]),
    postReview: useCallback((c: string, r: any) => client.postReview(c, r), [client]),
  }}>{children}</Ctx.Provider>;
}

export const useProduct = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProduct() must be used inside <ProductProvider>');
  return ctx;
};
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```ts
// composables/useProduct.ts
import { ref, onUnmounted } from 'vue';
import type { Product, ProductClient } from '@nexuvia/product';

export function createUseProduct(client: ProductClient) {
  return function useProduct() {
    const product   = ref<Product | null>(client.getState().product);
    const isLoading = ref(client.getState().isLoading);
    const reviews   = ref(client.getState().reviews);

    const off = client.on('product', () => {
      const s = client.getState();
      product.value = s.product; isLoading.value = s.isLoading; reviews.value = s.reviews;
    });
    onUnmounted(off);

    return {
      product, isLoading, reviews,
      getProduct: (c: string) => client.getProduct(c),
      getReviews: (c: string) => client.getReviews(c),
      postReview: (c: string, r: any) => client.postReview(c, r),
    };
  };
}
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
// src/app/services/product.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Product } from '@nexuvia/product';
import { ProductClient, OccProductAdapter } from '@nexuvia/product';
// ... construct OccClient + ProductClient as in Cart service

@Injectable({ providedIn: 'root' })
export class ProductService implements OnDestroy {
  private client: ProductClient;
  private off: () => void;

  readonly product$ = new BehaviorSubject<Product | null>(null);
  readonly reviews$ = new BehaviorSubject<any[] | null>(null);

  constructor() {
    /* construct client similar to CartService */
    this.off = this.client.on('product', () => {
      const s = this.client.getState();
      this.product$.next(s.product ?? null);
      this.reviews$.next(s.reviews ?? null);
    });
  }

  getProduct(code: string)   { return this.client.getProduct(code); }
  postReview(code: string, r: any) { return this.client.postReview(code, r); }

  ngOnDestroy() { this.off(); }
}
```

</TabItem>
</Tabs>

After `postReview`, the reviews cache invalidates and re-fetches automatically — your UI updates with no manual refresh.

---

## Cache behaviour

| Operation | TTL | Notes |
|-----------|-----|-------|
| `getProduct(code)` | 5 minutes per code | Cached |
| `getReviews(code)` | 5 minutes per code | Cleared on `postReview` |
| `postReview(code, ...)` | — | Auto-invalidates and re-fetches reviews |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `useProduct() must be used inside <ProductProvider>` | Mode 2 missing provider | Wrap with provider |
| Cache busts on every render | Missing `useMemo` around `new ProductClient(...)` | Add stable deps |
| Cannot pass client from server to client component | React serialization rule | Construct client in Client Component or use Mode 1 |

---

## Checklist

- [ ] Read-only product page → use Mode 1 (no provider)
- [ ] Posting reviews / live updates → use Mode 2
- [ ] Client constructed once via `useMemo` (when needed)
- [ ] After `postReview`, do NOT manually re-fetch — cache auto-invalidates
