---
title: "@nexuvia/cart"
sidebar_position: 5
---

# @nexuvia/cart

Cart management with lazy creation, cookie persistence, and payload extension.

**Framework-agnostic — pure TypeScript core. React layer lives in `src/providers/cart-provider.tsx`.**

---

## Installation

```bash
npm install @nexuvia/cart @nexuvia/storage @nexuvia/core
```

`@nexuvia/cart` has two subpath exports to enforce the server/client boundary:

```ts
// Server Components / route handlers — OCC adapter
import { OccCartAdapter, ProxyCartAdapter } from '@nexuvia/cart/server';

// Client Components — CartClient + adapter interface
import { CartClient, CartAdapter } from '@nexuvia/cart/client';
```

---

## Architecture

```
CartAdapter         abstract contract — getCart, createCart, addToCart, etc.
      ↓
CartClient          logic — events, CookieStorage, lazy create, payload extender
      ↓
Framework binding   React: CartProvider + useCart()
                    Vue / Angular: client.on() directly
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `CartClient` | Core logic — storage, events, lazy cart create |
| `CartAdapter` | Abstract base class — implement to add a new backend |
| `OccCartAdapter` | SAP OCC implementation — **server-side only** (CORS) |
| `ProxyCartAdapter` | Calls `/api/cart` backend route — **browser-safe** |
| All types | `Cart`, `CartEntry`, `CartProduct`, `ProductPrice`, `CartModification`, `CartAddResult` |

---

## Why two adapters?

| Adapter | Where it runs | How it calls SAP |
|---------|--------------|-----------------|
| `OccCartAdapter` | Server only | Direct HTTP to SAP OCC — blocked by CORS in browsers |
| `ProxyCartAdapter` | Browser | Calls your own `/api/cart` route, which proxies to SAP |

`ProxyCartAdapter.handlesCartCreation = true` signals `CartClient` to skip the separate `createCart()` call — the proxy creates cart + adds entry atomically.

---

## Setup — Next.js

```tsx
// src/app/[lang]/store-layout-client.tsx
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart';
import { CookieStorage } from '@nexuvia/storage';
import { CartProvider } from '@/providers/cart-provider';

const cartClient = useMemo(() => {
  const adapter = new ProxyCartAdapter({ baseSite: storeConfig.baseSite, language });
  return new CartClient(adapter, new CookieStorage());
}, [storeConfig.baseSite, language]);

// In JSX:
<CartProvider client={cartClient}>
  {children}
</CartProvider>
```

---

## Using the hook — React

```tsx
'use client';

import { useCart } from '@/providers/cart-provider';

export function AddToCartButton({ productCode }: { productCode: string }) {
  const { addItem, isLoading } = useCart();

  return (
    <button onClick={() => addItem(productCode, 1)} disabled={isLoading}>
      {isLoading ? 'Adding…' : 'Add to Cart'}
    </button>
  );
}
```

---

## Cart display

```tsx
import { useEffect } from 'react';
import { useCart } from '@/providers/cart-provider';

export function CartPage() {
  const { cart, isLoading, fetchCart } = useCart();

  useEffect(() => { fetchCart(); }, []);

  if (isLoading)              return <p>Loading…</p>;
  if (!cart?.entries?.length) return <p>Your cart is empty.</p>;

  return (
    <ul>
      {cart.entries.map(entry => (
        <li key={entry.entryNumber}>
          {entry.product.name} × {entry.quantity} — {entry.totalPrice?.formattedValue}
        </li>
      ))}
    </ul>
  );
}
```

---

## Payload extender (optional)

If the backend requires extra fields beyond `productCode` and `quantity`, register a payload extender once when the client is constructed:

```tsx
const cartClient = useMemo(() => {
  const adapter = new ProxyCartAdapter({ baseSite: storeConfig.baseSite, language });
  const client  = new CartClient(adapter, new CookieStorage());

  client.setPayloadExtender((base) => ({
    ...base,
    giftWrap:  false,
    sourceList: 'homepage-carousel',
  }));

  return client;
}, [storeConfig.baseSite, language]);
```

Components never need to know about the extra fields — they still call `addItem(code, qty)`.

---

## Cart merge on login

When a user logs in, merge their anonymous cart into their account cart:

```tsx
const { mergeCarts, cartId } = useCart();
const { user } = useAuth();

useEffect(() => {
  if (user?.id && cartId) {
    mergeCarts(user.id);
  }
}, [user?.id]);
```

---

## Error handling

Cart operations never throw to the component. Check `error` state after an operation:

```tsx
const { error, addItem } = useCart();

{error && <p className="error">{error.message}</p>}
```

---

## Cart API route (Next.js)

```ts
// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteOccClient } from '@/config/api-helpers';
import { OccCartAdapter } from '@nexuvia/cart';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeKey = request.headers.get('x-store-key') ?? 'ae';
  const lang     = searchParams.get('lang') ?? 'en';
  const cartId   = searchParams.get('cartId');

  const client  = await createRouteOccClient(storeKey, lang);
  const adapter = new OccCartAdapter(client);
  const cart    = cartId ? await adapter.getCart(cartId) : null;

  return NextResponse.json(cart);
}
```

---

## `useCart()` API reference

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

## `CartClient` direct API

```ts
client.getCartId()                    // string | null — current cart ID
client.setPayloadExtender(fn)         // register payload enrichment
client.fetchCart()                    // load cart by stored ID
client.addToCart(code, qty)           // add item (creates cart if needed)
client.removeFromCart(entryNumber)    // remove entry
client.patchEntry(entryNumber, qty)   // update quantity
client.mergeCarts(userId)             // merge anonymous cart into user cart
client.clearCart()                    // clear local state + cookie
client.on('cart',  handler)           // subscribe to cart updates → returns off()
client.on('error', handler)           // subscribe to errors → returns off()
client.getState()                     // CartClientState snapshot
```

---

## Types

```ts
interface Cart {
  code: string;
  guid: string;
  entries: CartEntry[];
  totalItems: number;
  totalPrice?: ProductPrice;
  subTotal?: ProductPrice;
  deliveryCost?: ProductPrice;
}

interface CartEntry {
  entryNumber: number;
  quantity: number;
  product: CartProduct;
  basePrice?: ProductPrice;
  totalPrice?: ProductPrice;
}

interface CartProduct {
  code: string;
  name: string;
  images?: ProductImage[];
}

interface ProductPrice {
  currencyIso:    string;   // e.g. 'AED'
  value:          number;   // e.g. 299
  formattedValue: string;   // e.g. 'AED 299.00'
}
```

---

## Cart ID persistence

Cart ID is saved in a browser cookie (`cart_id`, expires 48 hours). It is read automatically on page load. If the backend no longer has the cart (expired or deleted), the cookie is cleared automatically and a new cart is created on the next `addItem`.
