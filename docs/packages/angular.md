---
title: "@nexuvia/angular"
sidebar_position: 16
---

# @nexuvia/angular

Angular services and module — `provideNexuvia()` or `NexuviaModule.forRoot()` registers all Nexuvia services with no manual wiring.

---

## Installation

```bash
pnpm add @nexuvia/angular
```

Peer dependencies: `@angular/core >= 17`, `@angular/common >= 17`, `rxjs >= 7`.

---

## What's exported

| Export | What it is |
|--------|-----------|
| `provideNexuvia(config)` | Standalone API — add to `appConfig.providers` |
| `NexuviaModule` | NgModule API — `NexuviaModule.forRoot(config)` |
| `StoreService` | Current store, language, and config as observables |
| `AuthService` | User session, login, and logout |
| `CartService` | Full cart CRUD as `BehaviorSubject` streams |
| `AnalyticsService` | Typed event tracking — wraps `AnalyticsClient` |
| `NexuviaConfig` | Config interface for both APIs |

---

## `NexuviaConfig`

```ts
interface NexuviaConfig {
  storeKey:         string;
  language:         string;
  storeConfig:      StoreConfig;
  cartClientConfig: ProxyCartAdapterConfig;  // { baseSite, language, apiBase? }
  initialUser?:     SessionUser | null;
  gtmContainerId?:  string;
  smartEditConfig?: SmartEditServiceConfig;
}
```

---

## `provideNexuvia(config)` — standalone

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter }     from '@angular/router';
import { provideNexuvia }    from '@nexuvia/angular';
import { routes }            from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideNexuvia({
      storeKey:         'default',
      language:         'en',
      storeConfig:      myStoreConfig,
      cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
      gtmContainerId:   'GTM-XXXXXXX',
    }),
  ],
};
```

---

## `NexuviaModule.forRoot(config)` — NgModule

```ts
// src/app/app.module.ts
import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { NexuviaModule } from '@nexuvia/angular';

@NgModule({
  imports: [
    BrowserModule,
    NexuviaModule.forRoot({
      storeKey:         'default',
      language:         'en',
      storeConfig:      myStoreConfig,
      cartClientConfig: { baseSite: 'my-basesite', language: 'en', apiBase: '/api/cart' },
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

---

## `StoreService`

```ts
class StoreService {
  readonly storeKey:    string;
  readonly language:    string;
  readonly storeConfig$: Observable<StoreConfig>;
}
```

---

## `AuthService`

```ts
class AuthService {
  readonly user$:       Observable<SessionUser | null>;
  readonly isLoggedIn$: Observable<boolean>;

  login(storeKey: string):  Promise<void>;
  logout(storeKey: string): Promise<void>;
  refreshSession():         Promise<void>;
}
```

---

## `CartService`

```ts
class CartService implements OnDestroy {
  readonly cart$:      BehaviorSubject<Cart | null>;
  readonly isLoading$: BehaviorSubject<boolean>;
  readonly error$:     BehaviorSubject<Error | null>;

  addItem(productCode: string, qty?: number):           Promise<void>;
  removeFromCart(entryNumber: number):                  Promise<void>;
  updateCartEntry(entryNumber: number, qty: number):    Promise<void>;
  fetchCart():                                          Promise<void>;
  clearCart():                                          void;
  mergeCarts(userId: string):                           Promise<void>;
}
```

---

## `AnalyticsService`

```ts
class AnalyticsService {
  trackPageView(url?: string, title?: string):                       void;
  trackProductImpression(products: ProductImpressionParams[], list?: string): void;
  trackProductClick(params: ProductClickParams):                     void;
  trackAddToCart(params: Omit<AddToCartEvent, 'type'>):              void;
  trackRemoveFromCart(params: Omit<RemoveFromCartEvent, 'type'>):    void;
  trackPurchase(params: Omit<PurchaseEvent, 'type'>):                void;
  push(event: AnalyticsEvent):                                       void;
}
```

`AnalyticsService` automatically fires `trackPageView` on every Angular `NavigationEnd` event.

---

## Usage example

```ts
// src/app/pages/product/product.component.ts
import { Component, Input, OnInit } from '@angular/core';
import { AsyncPipe, NgIf }          from '@angular/common';
import { CartService }              from '@nexuvia/angular';
import { AnalyticsService }         from '@nexuvia/angular';
import { ProductClient }            from '@nexuvia/product';

@Component({
  selector:   'app-product',
  standalone: true,
  imports:    [AsyncPipe, NgIf],
  template: `
    <ng-container *ngIf="product">
      <h1>{{ product.name }}</h1>
      <p>{{ product.price?.formattedValue }}</p>
      <button
        [disabled]="cart.isLoading$ | async"
        (click)="addToCart()">
        Add to Cart
      </button>
    </ng-container>
  `,
})
export class ProductComponent implements OnInit {
  @Input() code!: string;
  product: any = null;

  constructor(
    public  cart:      CartService,
    private analytics: AnalyticsService,
    private products:  ProductClient,
  ) {}

  async ngOnInit() {
    this.product = await this.products.getProduct(this.code);
  }

  addToCart() {
    this.cart.addItem(this.product.code, 1);
    this.analytics.trackAddToCart({
      code:     this.product.code,
      name:     this.product.name,
      quantity: 1,
      price:    this.product.price?.value,
    });
  }
}
```
