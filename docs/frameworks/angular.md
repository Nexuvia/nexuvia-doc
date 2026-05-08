---
title: Angular
sidebar_position: 4
---

# Angular — Assembly Guide

Nexuvia's pure-TypeScript core works natively in Angular through `@Injectable` services that wrap each Nexuvia client. The architecture mirrors React/Vue:

- **Layer 1** — `src/config/` files (identical to Next.js)
- **Layer 2** — Server routes (Angular Universal `server.ts` handlers, or external Express backend)
- **Layer 3** — `@Injectable({ providedIn: 'root' })` services that hold the clients and expose `BehaviorSubject` streams
- **Layer 4** — Components subscribe via `async` pipe

:::warning Backend required
Same constraint as React/Vue: cart and auth need a server. Either use Angular Universal (with `server.ts` route handlers) or a separate Express/Hono backend. See the [React guide](/frameworks/react) for backend setup.
:::

---

## Wiring layer mapping — Angular vs Next.js

| Layer | Next.js | Angular |
|-------|---------|---------|
| 1. Config bridge | `src/config/*.ts` | `src/app/config/*.ts` |
| 2. Server routes | `src/app/api/*` | Angular Universal `server.ts` or external backend |
| 3. Provider | React context + hook | `@Injectable({ providedIn: 'root' })` service |
| 4. UI | `useCart()` hook | `cartService.cart$ \| async` |

---

## Final project structure

```
my-storefront/
├── nexuvia.config.ts
├── .env
├── .npmrc
├── angular.json
├── server.ts                              ← Angular Universal entry (server routes here)
└── src/
    ├── environments/
    │   └── environment.ts                 ← Build-time env vars
    ├── app/
    │   ├── config/                        ← Layer 1 — same files as Next.js
    │   │   ├── hybris.ts
    │   │   ├── stores.ts
    │   │   ├── server.ts
    │   │   ├── api-helpers.ts
    │   │   └── auth.ts
    │   ├── services/                      ← Layer 3
    │   │   ├── cart.service.ts
    │   │   ├── product.service.ts
    │   │   ├── search.service.ts
    │   │   ├── cms.service.ts
    │   │   ├── analytics.service.ts
    │   │   └── auth.service.ts
    │   ├── cms-defaults.ts                ← Component registry init
    │   ├── pages/
    │   │   ├── home/home.component.ts
    │   │   ├── product/product.component.ts
    │   │   └── cart/cart.component.ts
    │   ├── components/
    │   │   └── cms/
    │   │       ├── cms-slot-renderer.component.ts
    │   │       └── defaults/
    │   ├── app.config.ts                  ← Standalone bootstrap
    │   └── app.component.ts               ← Root — calls registerDefaultCmsComponents()
    └── main.ts
```

---

## Assembly order

| # | Task | Doc |
|---|------|-----|
| 1 | Run `npx nexuvia init` | [Quick Start](/getting-started/quick-start) |
| 2 | Set environment vars in `src/environments/environment.ts` | See below |
| 3 | Create `src/app/config/` bridge files (port from Next.js) | [Config Bridge](/wiring/config-bridge) |
| 4 | Create Angular Universal server routes for cart + auth (or external backend) | [cart](/wiring/cart), [auth-client](/wiring/auth-client) |
| 5 | Create `@Injectable` services in `src/app/services/` | See below |
| 6 | Register CMS components on app bootstrap | See below |
| 7 | Use services in components via `async` pipe | — |

---

## Step 1 — Environment vars

Angular reads env vars from `src/environments/environment.ts` at build time. **Never put secrets here** — they're bundled.

```ts
// src/environments/environment.ts
export const environment = {
  production:     false,
  hybrisProtocol: 'https',
  hybrisHost:     'occ-dev.example.com',
  baseSite:       'my-basesite',
  domain:         'localhost',
  gtmId:          '',
  apiBase:        'http://localhost:3001',   // backend URL
};
```

```ts
// nexuvia.config.ts
import type { NexuviaConfig } from '@nexuvia/nexuvia';
import { environment }        from './src/environments/environment';

const config: NexuviaConfig = {
  hybris: {
    protocol:    environment.hybrisProtocol,
    host:        environment.hybrisHost,
    port:        '',
    version:     'v2',
    occBasePath: '/occ',
    cmsBasePath: '/customws',
  },
  stores: {
    default: {
      baseSite:           environment.baseSite,
      domain:             environment.domain,
      supportedLanguages: ['en'],
      defaultLanguage:    'en',
      currency:           'USD',
      country:            'US',
      isEcommerce:        true,
    },
  },
  cms:        { useMock: true, pageLabels: { /* ... */ }, componentTypes: [] },
  smartedit:  { allowedOrigins: [], previewVersion: 'v1' },
  authServer: { clientId: '', clientSecret: '', tokenEndpoint: '' },
  authClient: { session: { /* ... */ }, azure: { redirectUri: '' } },
  analytics:  { gtmContainerId: environment.gtmId },
};

export default config;
```

---

## Step 2 — `CartService`

```ts
// src/app/services/cart.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Cart, CartClientState } from '@nexuvia/cart';
import { CartClient, ProxyCartAdapter } from '@nexuvia/cart';
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
    const store   = config.stores.default;
    const adapter = new ProxyCartAdapter({
      baseSite: store.baseSite,
      language: store.defaultLanguage,
    });
    this.client = new CartClient(adapter, new CookieStorage());

    this.offCart = this.client.on('cart', () => {
      const s = this.client.getState();
      this.cart$.next(s.cart);
      this.isLoading$.next(s.isLoading);
    });
    this.offError = this.client.on('error', () => {
      this.error$.next(this.client.getState().error);
    });
  }

  addItem(code: string, qty = 1)             { return this.client.addToCart(code, qty); }
  removeFromCart(entryNumber: number)        { return this.client.removeFromCart(entryNumber); }
  updateCartEntry(entryNumber: number, q: number) { return this.client.patchEntry(entryNumber, q); }
  fetchCart()                                { return this.client.fetchCart(); }
  clearCart()                                { this.client.clearCart(); }
  mergeCarts(userId: string)                 { return this.client.mergeCarts(userId); }

  ngOnDestroy() {
    this.offCart();
    this.offError();
  }
}
```

---

## Step 3 — `ProductService`

```ts
// src/app/services/product.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Product } from '@nexuvia/product';
import { ProductClient, OccProductAdapter, MockProductAdapter } from '@nexuvia/product';
import { OccClient } from '@nexuvia/occ';
import config from '../../../nexuvia.config';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProductService implements OnDestroy {
  private client: ProductClient;
  private off: () => void;

  readonly product$   = new BehaviorSubject<Product | null>(null);
  readonly isLoading$ = new BehaviorSubject<boolean>(false);
  readonly error$     = new BehaviorSubject<Error | null>(null);

  constructor() {
    const { hybris, stores } = config;
    const store   = stores.default;
    const baseUrl = `${hybris.protocol}://${hybris.host}`;

    const adapter = environment.production
      ? new OccProductAdapter(new OccClient(
          { baseUrl, basePath: hybris.occBasePath, version: hybris.version },
          store.baseSite, store.defaultLanguage,
        ))
      : new MockProductAdapter();

    this.client = new ProductClient(adapter);

    this.off = this.client.on('product', () => {
      const s = this.client.getState();
      this.product$.next(s.product ?? null);
      this.isLoading$.next(s.isLoading);
      this.error$.next(s.error);
    });
  }

  getProduct(code: string) {
    return this.client.getProduct(code);
  }

  ngOnDestroy() {
    this.off();
  }
}
```

---

## Step 4 — `AnalyticsService`

```ts
// src/app/services/analytics.service.ts
import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { GtmAnalyticsAdapter, AnalyticsClient } from '@nexuvia/analytics';
import type { AddToCartEvent, PurchaseEvent } from '@nexuvia/analytics';
import config from '../../../nexuvia.config';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private client: AnalyticsClient;

  constructor(private router: Router) {
    this.client = new AnalyticsClient(
      new GtmAnalyticsAdapter({ containerId: config.analytics.gtmContainerId }),
    );

    // Auto page-view on every navigation
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.client.trackPageView());
  }

  trackAddToCart(params: Omit<AddToCartEvent, 'type'>)  { this.client.trackAddToCart(params); }
  trackPurchase(params:  Omit<PurchaseEvent, 'type'>)   { this.client.trackPurchase(params); }
  trackProductImpression(products: any[], list?: string) { this.client.trackProductImpression(products, list); }
}
```

---

## Step 5 — `AuthService`

```ts
// src/app/services/auth.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { SessionUser } from '@nexuvia/auth-client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user$       = new BehaviorSubject<SessionUser | null>(null);
  readonly isLoggedIn$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.refreshSession();
  }

  async refreshSession() {
    const res = await fetch('/api/auth/session');
    const user = res.ok ? await res.json() : null;
    this.user$.next(user);
    this.isLoggedIn$.next(user !== null);
  }

  async login(storeKey: string) {
    const res = await fetch(`/api/auth/login?store=${encodeURIComponent(storeKey)}`);
    const data = await res.json();
    if (data?.redirectUrl) window.location.href = data.redirectUrl;
  }

  async logout(storeKey: string) {
    const res = await fetch(`/api/auth/logout?store=${encodeURIComponent(storeKey)}`, { method: 'POST' });
    const data = await res.json();
    this.user$.next(null);
    this.isLoggedIn$.next(false);
    window.location.href = data?.redirectUrl ?? '/';
  }
}
```

---

## Step 6 — Register CMS components on bootstrap

```ts
// src/app/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms';
import { CmsHeaderComponent } from './components/cms/defaults/cms-header.component';
import { CmsFooterComponent } from './components/cms/defaults/cms-footer.component';

export function registerDefaultCmsComponents(): void {
  componentRegistry.register('CMSHeaderComponent', CmsHeaderComponent as any);
  componentRegistry.register('CMSFooterComponent', CmsFooterComponent as any);
  // register every typeCode in nexuvia.config.ts → cms.componentTypes
}
```

```ts
// src/app/app.component.ts
import { Component } from '@angular/core';
import { registerDefaultCmsComponents } from './cms-defaults';

registerDefaultCmsComponents();   // ← runs once on module load

@Component({
  selector: 'app-root',
  standalone: true,
  template: '<router-outlet />',
})
export class AppComponent {}
```

---

## Step 7 — Use services in components

```ts
// src/app/components/add-to-cart/add-to-cart.component.ts
import { Component, Input } from '@angular/core';
import { AsyncPipe }        from '@angular/common';
import { CartService }      from '@/services/cart.service';

@Component({
  selector:    'app-add-to-cart',
  standalone:  true,
  imports:     [AsyncPipe],
  template: `
    <button
      [disabled]="cart.isLoading$ | async"
      (click)="cart.addItem(productCode)">
      {{ (cart.isLoading$ | async) ? 'Adding…' : 'Add to Cart' }}
    </button>
  `,
})
export class AddToCartComponent {
  @Input() productCode!: string;
  constructor(public cart: CartService) {}
}
```

```ts
// src/app/pages/product/product.component.ts
import { Component, OnInit, Input } from '@angular/core';
import { AsyncPipe, NgIf }          from '@angular/common';
import { ProductService }           from '@/services/product.service';
import { CartService }              from '@/services/cart.service';

@Component({
  selector:   'app-product',
  standalone: true,
  imports:    [AsyncPipe, NgIf],
  template: `
    <div *ngIf="product.isLoading$ | async">Loading…</div>
    <ng-container *ngIf="product.product$ | async as p">
      <h1>{{ p.name }}</h1>
      <p>{{ p.price?.formattedValue }}</p>
      <button (click)="cart.addItem(p.code)">Add to Cart</button>
    </ng-container>
  `,
})
export class ProductComponent implements OnInit {
  @Input() code!: string;
  constructor(public product: ProductService, public cart: CartService) {}
  ngOnInit() { this.product.getProduct(this.code); }
}
```

---

## Critical wiring rules

| Rule | Why |
|------|-----|
| All Nexuvia services use `providedIn: 'root'` — single instance app-wide | Re-creating clients destroys cache |
| `ngOnDestroy` calls every `client.on()` unsubscribe | Prevents listener leaks |
| Cart needs a backend route — never call SAP OCC from the browser | CORS |
| `registerDefaultCmsComponents()` called at app bootstrap (in `app.component.ts`) | Registry must be populated before first render |
| `MockProductAdapter` / `MockSearchAdapter` used when `!environment.production` | OCC adapters fail in browser without backend proxy |
| `AuthService.refreshSession()` called in constructor | Initial user state populated from server cookie |

---

## Common errors

### `NullInjectorError: No provider for CartService`

Service is missing `@Injectable({ providedIn: 'root' })`. Add it.

### Cart values don't update reactively

Component subscribes to `cart$` once but doesn't use the `async` pipe. Use `cart$ | async` in templates so Angular re-renders on every emission.

### `Cannot find module 'nexuvia.config'`

Path issue — your `nexuvia.config.ts` is at the project root but the service path resolution doesn't reach it. Use a relative path: `../../../nexuvia.config`.

### CMS components don't render

`registerDefaultCmsComponents()` not called, or called inside `ngOnInit` instead of at module load. Move it to the top of `app.component.ts`.

### `process is not defined` in browser

`nexuvia.config.ts` references `process.env.X` — replace with `environment.X` from `src/environments/environment.ts`.

---

## Checklist

- [ ] All services use `@Injectable({ providedIn: 'root' })`
- [ ] Every `client.on()` returns an unsubscribe stored as a private field
- [ ] `ngOnDestroy` calls every stored unsubscribe
- [ ] `registerDefaultCmsComponents()` runs at module load (top of `app.component.ts`)
- [ ] Backend running for cart + auth (or Angular Universal `server.ts`)
- [ ] Templates use `service.value$ | async` — never `.subscribe()` manually
- [ ] `MockProductAdapter` used in non-production env
- [ ] No `process.env` in client code — use `environment.ts` instead
