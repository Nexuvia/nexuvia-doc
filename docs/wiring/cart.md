---
title: Wiring @nexuvia/cart
sidebar_position: 9
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/cart`

This page shows how to wire `@nexuvia/cart` in **any framework**. The library code is identical — only the route handler syntax and reactive wrapper differ.

---

## What you build (the 4 layers)

| Layer | What | File location varies by framework |
| ----- | ---- | --------------------------------- |
| **Layer 1** — Config | Nothing special — uses `baseSite` + `language` from store config | — |
| **Layer 2** — Server route | `/api/cart` proxy (GET + POST + PATCH + DELETE) | Next.js / Express / Nuxt / Angular |
| **Layer 3** — Reactive wrapper | `CartProvider` (React) / composable (Vue) / service (Angular) | Your app code |
| **Layer 4** — UI | `useCart()` / `cartService.cart$` | Components |

:::warning Why is a server route required?
Browsers cannot call SAP OCC directly — CORS blocks it. The browser uses `ProxyCartAdapter` which calls **your** `/api/cart` endpoint, which then uses `OccCartAdapter` to call SAP server-side.

| Adapter | Where it runs | Calls |
| ------- | ------------- | ----- |
| `OccCartAdapter` | Server only | SAP OCC directly |
| `ProxyCartAdapter` | Browser | Your `/api/cart` route |

**Always** use `ProxyCartAdapter` in browser code. **Always** use `OccCartAdapter` in server route handlers.
:::

---

## Layer 2 — Build the cart server route

The same logic in 4 frameworks. Pick your tab.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

Create `src/app/api/cart/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { app } from '../../../../nexuvia.app';

async function getAdapter(req: NextRequest, lang = 'en') {
  const storeKey = req.headers.get('x-store-key') ?? 'ae';
  const ctx      = await app.forRequest(storeKey, lang);
  return ctx.cart.server; // OccCartAdapter
}

// GET /api/cart?cartId=xxx&lang=en
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lang   = searchParams.get('lang')   ?? 'en';
  const cartId = searchParams.get('cartId') ?? null;
  try {
    const adapter = await getAdapter(request, lang);
    const cart    = cartId ? await adapter.getCart(cartId) : null;
    return NextResponse.json(cart);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// POST — ProxyCartAdapter sends { product: { code }, quantity, cartId?, language, baseSite }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cartId, quantity = 1, language = 'en' } = body;
  // ProxyCartAdapter nests the code under product.code
  const productCode: string = body.productCode ?? body.product?.code;

  try {
    const adapter = await getAdapter(request, language);
    let resolvedCartId = cartId as string | undefined;
    if (!resolvedCartId) {
      const newCart = await adapter.createCart();
      // Anonymous Hybris carts: ALWAYS use guid — code returns 400 on subsequent calls
      resolvedCartId = (newCart as any).guid ?? (newCart as any).code ?? String(newCart);
    }
    const result = await adapter.addToCart(resolvedCartId, { productCode, quantity });
    return NextResponse.json({ cartId: resolvedCartId, modification: result.modification });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// PATCH — uses patchEntry(), NOT updateCartEntry()
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { cartId, entryNumber, quantity, language = 'en' } = body;
  try {
    const adapter = await getAdapter(request, language);
    const result  = await adapter.patchEntry(cartId, entryNumber, quantity);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// DELETE /api/cart?cartId=xxx&entry=0&lang=en
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lang        = searchParams.get('lang')        ?? 'en';
  const cartId      = searchParams.get('cartId')      ?? '';
  const entryNumber = Number(searchParams.get('entry') ?? '0');
  try {
    const adapter = await getAdapter(request, lang);
    await adapter.removeFromCart(cartId, entryNumber);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
```

:::danger Three fixes required vs. original docs

| Wrong (original docs) | Correct |
| --------------------- | ------- |
| `adapter.updateCartEntry(cartId, n, qty)` | `adapter.patchEntry(cartId, n, qty)` |
| Read `body.productCode` | Read `body.productCode ?? body.product?.code` (ProxyCartAdapter nests it) |
| `(newCart as any).code ?? guid` | `(newCart as any).guid ?? code` — anonymous carts only work with `guid` |

:::

</TabItem>
<TabItem value="express" label="Node.js (Express)">

Create `server/routes/cart.ts`:

```ts
import { Router }                      from 'express';
import { createRouteOccClient }        from '../config/api-helpers';
import { OccCartAdapter }              from '@nexuvia/cart/server';
import { NotFoundError }               from '@nexuvia/core';

const router = Router();

function adapter(req: any, baseSite?: string, lang?: string) {
  const site = baseSite || req.query.baseSite || 'shop';
  const l    = lang     || req.query.lang     || 'en';
  const client = createRouteOccClient(site, l);
  const auth = req.headers.authorization as string | undefined;
  if (auth) client.setAccessToken(auth.replace('Bearer ', ''));
  return new OccCartAdapter(client);
}

router.get('/api/cart', async (req, res) => {
  const { cartId } = req.query;
  if (!cartId) return res.status(400).json({ error: 'Missing cartId' });
  try {
    const cart = await adapter(req).getCart(cartId as string);
    res.json(cart);
  } catch (e) {
    if (e instanceof NotFoundError) return res.status(404).json({ error: 'Not found' });
    throw e;
  }
});

router.post('/api/cart', async (req, res) => {
  const { cartId, baseSite, language, productCode, quantity = 1 } = req.body;
  const result = await adapter(req, baseSite, language).addToCart(cartId ?? null, { productCode, quantity });
  res.json(result);
});

router.patch('/api/cart', async (req, res) => {
  const { cartId, baseSite, language, entryNumber, quantity } = req.body;
  const result = await adapter(req, baseSite, language).patchEntry(cartId, entryNumber, quantity);
  res.json(result);
});

router.delete('/api/cart', async (req, res) => {
  const { cartId, entryNumber } = req.query;
  await adapter(req).removeFromCart(cartId as string, Number(entryNumber));
  res.json({ success: true });
});

export default router;
```

Wire it in your Express app:

```ts
// server/index.ts
import express from 'express';
import cors    from 'cors';
import cartRouter from './routes/cart';

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cartRouter);
app.listen(3001);
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

Create `server/api/cart.ts`:

```ts
import { OccCartAdapter }       from '@nexuvia/cart/server';
import { NotFoundError }        from '@nexuvia/core';
import { createRouteOccClient } from '~/config/api-helpers';

function adapter(event: any, baseSite?: string, lang?: string) {
  const q    = getQuery(event);
  const site = baseSite || (q.baseSite as string) || 'shop';
  const l    = lang     || (q.lang as string)     || 'en';
  const client = createRouteOccClient(site, l);
  const auth = getHeader(event, 'authorization');
  if (auth) client.setAccessToken(auth.replace('Bearer ', ''));
  return new OccCartAdapter(client);
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === 'GET') {
    const { cartId } = getQuery(event);
    if (!cartId) throw createError({ statusCode: 400, statusMessage: 'Missing cartId' });
    try { return await adapter(event).getCart(cartId as string); }
    catch (e) {
      if (e instanceof NotFoundError) throw createError({ statusCode: 404 });
      throw e;
    }
  }

  if (method === 'POST') {
    const { cartId, baseSite, language, productCode, quantity = 1 } = await readBody(event);
    return await adapter(event, baseSite, language).addToCart(cartId ?? null, { productCode, quantity });
  }

  if (method === 'PATCH') {
    const { cartId, baseSite, language, entryNumber, quantity } = await readBody(event);
    return await adapter(event, baseSite, language).patchEntry(cartId, entryNumber, quantity);
  }

  if (method === 'DELETE') {
    const { cartId, entryNumber } = getQuery(event);
    await adapter(event).removeFromCart(cartId as string, Number(entryNumber));
    return { success: true };
  }
});
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

Add Express handlers in your `server.ts`:

```ts
// server.ts (Angular Universal)
import express                  from 'express';
import { OccCartAdapter }       from '@nexuvia/cart/server';
import { NotFoundError }        from '@nexuvia/core';
import { createRouteOccClient } from './src/app/config/api-helpers';

export function app() {
  const server = express();
  server.use(express.json());

  function adapter(req: any, baseSite?: string, lang?: string) {
    const site = baseSite || req.query.baseSite || 'shop';
    const l    = lang     || req.query.lang     || 'en';
    const client = createRouteOccClient(site, l);
    const auth = req.headers.authorization;
    if (auth) client.setAccessToken(auth.replace('Bearer ', ''));
    return new OccCartAdapter(client);
  }

  server.get('/api/cart', async (req, res) => {
    const { cartId } = req.query;
    try {
      res.json(await adapter(req).getCart(cartId as string));
    } catch (e) {
      if (e instanceof NotFoundError) return res.status(404).json({ error: 'Not found' });
      throw e;
    }
  });

  server.post('/api/cart', async (req, res) => {
    const { cartId, baseSite, language, productCode, quantity = 1 } = req.body;
    res.json(await adapter(req, baseSite, language).addToCart(cartId ?? null, { productCode, quantity }));
  });

  // ... PATCH and DELETE the same way

  return server;
}
```

</TabItem>
</Tabs>

---

## Layer 3 — Reactive wrapper

Wrap `CartClient` in your framework's reactive primitive. Pick your tab — copy the file as-is.

<Tabs groupId="framework">
<TabItem value="nextjs" label="React (Next.js / Vite / CRA)">

Create `src/providers/cart-provider.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { CartClient, CartClientState } from '@nexuvia/cart/client';

const CartContext = createContext<any>(null);

export function CartProvider({ client, children }: { client: CartClient; children: ReactNode }) {
  const [state, setState] = useState<CartClientState>(() => client.getState());

  useEffect(() => {
    const offCart  = client.on('cart',  () => setState(client.getState()));
    const offError = client.on('error', () => setState(client.getState()));
    return () => { offCart(); offError(); };
  }, [client]);

  return (
    <CartContext.Provider value={{
      ...state,
      addItem:         useCallback((c: string, q = 1) => client.addToCart(c, q), [client]),
      removeFromCart:  useCallback((n: number)        => client.removeFromCart(n), [client]),
      updateCartEntry: useCallback((n: number, q: number) => client.patchEntry(n, q), [client]),
      fetchCart:       useCallback(() => client.fetchCart(), [client]),
      mergeCarts:      useCallback((id: string) => client.mergeCarts(id), [client]),
      clearCart:       useCallback(() => client.clearCart(), [client]),
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart() must be used inside <CartProvider>');
  return ctx;
}
```

The recommended approach is `NexuviaProvider` with a `cart` prop — it constructs and wires `CartClient` internally:

```tsx
// src/app/[lang]/store-layout-client.tsx
'use client';
import { NexuviaProvider } from '@nexuvia/react';

export function StoreLayoutClient({ children, storeKey, language }) {
  return (
    <NexuviaProvider storeKey={storeKey} language={language} cart={{ baseSite: storeKey, language }}>
      {children}
    </NexuviaProvider>
  );
}
```

Or wire manually:

```tsx
'use client';
import { useMemo } from 'react';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart/client';
import { CookieStorage }                from '@nexuvia/storage';
import { CartProvider }                 from '@nexuvia/react';

export function ClientLayout({ baseSite, language, children }) {
  const client = useMemo(() => new CartClient(
    new ProxyCartAdapter({ baseSite, language }),
    new CookieStorage(),
  ), [baseSite, language]);

  return <CartProvider client={client}>{children}</CartProvider>;
}
```

</TabItem>
<TabItem value="vue" label="Vue 3 (composable)">

Create `composables/useCart.ts`:

```ts
import { ref, onUnmounted } from 'vue';
import type { Cart } from '@nexuvia/cart/client';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart/client';
import { CookieStorage } from '@nexuvia/storage';
import config from '../../nexuvia.config';

const store  = config.stores[Object.keys(config.stores)[0]];
const client = new CartClient(
  new ProxyCartAdapter({ baseSite: store.baseSite, language: store.defaultLanguage }),
  new CookieStorage(),
);

export function useCart() {
  const initial   = client.getState();
  const cart      = ref<Cart | null>(initial.cart);
  const isLoading = ref(initial.isLoading);
  const error     = ref<Error | null>(initial.error);

  const offCart  = client.on('cart',  () => {
    const s = client.getState();
    cart.value = s.cart; isLoading.value = s.isLoading; error.value = s.error;
  });
  const offError = client.on('error', () => { error.value = client.getState().error; });

  onUnmounted(() => { offCart(); offError(); });

  return {
    cart, isLoading, error,
    addItem:         (c: string, q = 1)         => client.addToCart(c, q),
    removeFromCart:  (n: number)                => client.removeFromCart(n),
    updateCartEntry: (n: number, q: number)     => client.patchEntry(n, q),
    fetchCart:       ()                         => client.fetchCart(),
    mergeCarts:      (uid: string)              => client.mergeCarts(uid),
    clearCart:       ()                         => client.clearCart(),
  };
}
```

Use it directly in any component — no provider tag needed:

```vue
<script setup lang="ts">
import { useCart } from '@/composables/useCart';
const { cart, addItem, isLoading } = useCart();
</script>
```

</TabItem>
<TabItem value="angular" label="Angular service">

Create `src/app/services/cart.service.ts`:

```ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Cart } from '@nexuvia/cart/client';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart/client';
import { CookieStorage } from '@nexuvia/storage';
import config from '../../../nexuvia.config';

@Injectable({ providedIn: 'root' })
export class CartService implements OnDestroy {
  private client: CartClient;
  private offCart:  () => void;
  private offError: () => void;

  readonly cart$      = new BehaviorSubject<Cart | null>(null);
  readonly isLoading$ = new BehaviorSubject<boolean>(false);
  readonly error$     = new BehaviorSubject<Error | null>(null);

  constructor() {
    const store = config.stores[Object.keys(config.stores)[0]];
    this.client = new CartClient(
      new ProxyCartAdapter({ baseSite: store.baseSite, language: store.defaultLanguage }),
      new CookieStorage(),
    );

    this.offCart = this.client.on('cart', () => {
      const s = this.client.getState();
      this.cart$.next(s.cart);
      this.isLoading$.next(s.isLoading);
    });
    this.offError = this.client.on('error', () => this.error$.next(this.client.getState().error));
  }

  addItem(code: string, qty = 1)              { return this.client.addToCart(code, qty); }
  removeFromCart(entryNumber: number)         { return this.client.removeFromCart(entryNumber); }
  updateCartEntry(entryNumber: number, q: number) { return this.client.patchEntry(entryNumber, q); }
  fetchCart()                                 { return this.client.fetchCart(); }
  mergeCarts(userId: string)                  { return this.client.mergeCarts(userId); }
  clearCart()                                 { this.client.clearCart(); }

  ngOnDestroy() { this.offCart(); this.offError(); }
}
```

</TabItem>
</Tabs>

---

## Layer 4 — Use it in components

<Tabs groupId="framework">
<TabItem value="react" label="React">

```tsx
'use client';
import { useCart } from '@nexuvia/react';

export function AddToCartButton({ code }: { code: string }) {
  const { addItem, isLoading } = useCart();
  return (
    <button disabled={isLoading} onClick={() => addItem(code, 1)}>
      {isLoading ? 'Adding…' : 'Add to Cart'}
    </button>
  );
}
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```vue
<script setup lang="ts">
import { useCart } from '@/composables/useCart';
const props = defineProps<{ code: string }>();
const { addItem, isLoading } = useCart();
</script>

<template>
  <button :disabled="isLoading" @click="addItem(code, 1)">
    {{ isLoading ? 'Adding…' : 'Add to Cart' }}
  </button>
</template>
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
import { Component, Input } from '@angular/core';
import { AsyncPipe }        from '@angular/common';
import { CartService }      from '@/services/cart.service';

@Component({
  selector:    'app-add-to-cart',
  standalone:  true,
  imports:     [AsyncPipe],
  template: `
    <button [disabled]="cart.isLoading$ | async" (click)="cart.addItem(code, 1)">
      {{ (cart.isLoading$ | async) ? 'Adding…' : 'Add to Cart' }}
    </button>
  `,
})
export class AddToCartComponent {
  @Input() code!: string;
  constructor(public cart: CartService) {}
}
```

</TabItem>
</Tabs>

---

## Cart page — React / Next.js

The cart page needs two things:

1. A **Server Component** that can optionally pre-render the cart (fast first paint, works without JS)
2. A **Client Component** that hydrates with live state via `useCart()`

:::info Why call `fetchCart()` on mount?
`CartClient` stores the cart ID in a cookie. On initial render the state is empty — the client hasn't read the cookie yet. Call `fetchCart()` once on mount to load the cart from the server.
:::

:::warning `isLoading` from `useCart()` is never `true` in React
`CartClient` only emits `'cart'` and `'error'` events — there is no `'loading'` event. React state never transitions to `isLoading: true`. Using `if (isLoading) return <p>Loading...</p>` will never show the spinner.

**Fix:** Use a local `ready` state tied to `fetchCart().finally(...)` as shown below. The `ready` flag correctly transitions to `true` exactly when the fetch completes (immediately if no `cartId`, after the GET returns if there is one).
:::

```tsx
// src/app/[lang]/cart/page.tsx  (Server Component — minimal shell)
export default function CartPage() {
  return <CartPageClient />;
}
```

```tsx
// src/app/[lang]/cart/page-client.tsx
'use client';
import { useEffect, useState } from 'react';
import { useCart }   from '@nexuvia/react';
import Link          from 'next/link';
import { useParams } from 'next/navigation';

export function CartPageClient() {
  const { lang } = useParams<{ lang: string }>();
  const { cart, cartId, fetchCart, updateItem, removeItem } = useCart();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCart().finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  // Re-fetch when cartId arrives after mount (navigation race with addToCart)
  useEffect(() => {
    if (ready && cartId && !cart) fetchCart();
  }, [cartId]);

  if (!ready) return <p>Loading cart…</p>;
  if (!cart || cart.entries?.length === 0) return <p>Your cart is empty.</p>;

  return (
    <div>
      <h1>Cart ({cart.totalItems} items)</h1>
      <ul>
        {cart.entries.map(entry => (
          <li key={entry.entryNumber}>
            <span>{entry.product?.name}</span>
            <button onClick={() => updateItem(entry.entryNumber, entry.quantity - 1)}
                    disabled={entry.quantity <= 1}>−</button>
            <span>{entry.quantity}</span>
            <button onClick={() => updateItem(entry.entryNumber, entry.quantity + 1)}>+</button>
            <span>{entry.totalPrice?.formattedValue}</span>
            <button onClick={() => removeItem(entry.entryNumber)}>Remove</button>
          </li>
        ))}
      </ul>
      <p><strong>Total: {cart.totalPrice?.formattedValue}</strong></p>
    </div>
  );
}
```

:::warning Don't fetch cart server-side on the cart page
You might be tempted to call `ctx.cart.server.getCart(cartId)` in the Server Component, but the `cartId` lives in a browser cookie — the server can't read it without passing the `Cookie` header explicitly. Use `fetchCart()` on the client instead. Server-side cart access is for **checkout** flows where you control the cookie forwarding.
:::

---

## Cart-on-login merge (any framework)

When the anonymous user logs in, merge their cart into their account. Hook this into your auth callback or a layout effect:

```ts
// React example — inside a Client Component
useEffect(() => {
  if (user?.id && cartId) mergeCarts(user.id);
}, [user?.id]);
```

You also need a `/api/cart/merge` route on the server that calls
`POST users/{userId}/carts?oldCartId=...` on SAP OCC. Same template as the cart route above — just one POST handler.

---

## Common errors

| Error | Cause | Fix |
| ----- | ----- | --- |
| `useCart() must be used inside <CartProvider>` | Missing Layer 3 | Wrap your app with `<CartProvider client={…}>` |
| CORS error fetching `/occ/v2/...` | Used `OccCartAdapter` in browser | Switch to `ProxyCartAdapter` |
| Cart resets on every page reload | Forgot `new CookieStorage()` | Pass it as 2nd arg to `CartClient` |
| New `CartClient` on every render | Missing `useMemo` (React) | Wrap construction in `useMemo([baseSite, language])` |
| `addItem` resolves but UI never updates | Forgot to subscribe to `client.on('cart', …)` | Check your provider/composable subscribes to events |
| `updateCartEntry is not a function` | Wrong method name | Use `updateItem` from `useCart()`, `patchEntry` from `OccCartAdapter` |
| `removeFromCart is not a function` | Wrong method name | Use `removeItem` from `useCart()` |
| Cart 400 after create | Using `code` instead of `guid` | Extract `guid` first: `(newCart as any).guid ?? code` |

---

## Checklist

- [ ] `/api/cart` route exists with **GET, POST, PATCH, DELETE** handlers (in your framework's syntax)
- [ ] Browser code uses `ProxyCartAdapter` (never `OccCartAdapter`)
- [ ] `new CookieStorage()` passed as 2nd arg to `CartClient`
- [ ] `CartClient` constructed **once** with stable dependencies
- [ ] Components import `useCart` / `CartService` from your app, **not** from `@nexuvia/cart`
- [ ] Layer 3 wrapper is **inside** the auth wrapper (so cart-on-login works)
