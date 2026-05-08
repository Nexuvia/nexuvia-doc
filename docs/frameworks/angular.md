---
title: Angular
sidebar_position: 4
---

# Angular — Assembly Guide

Install `@nexuvia/angular` and use `provideNexuvia()` — no manual service wiring needed.

:::warning Backend required
Same constraint as React/Vue: cart and auth need a server. Either use Angular Universal (with `server.ts` route handlers) or a separate Express/Hono backend. See the [React guide](/frameworks/react) for backend setup.
:::

---

## Installation

```bash
pnpm add @nexuvia/angular
```

Peer dependencies: `@angular/core >= 17`, `@angular/common >= 17`, `rxjs >= 7`.

---

## Step 1 — Standalone API: `provideNexuvia()` in `app.config.ts`

```ts
// src/app/app.config.ts
import { ApplicationConfig }  from '@angular/core';
import { provideRouter }      from '@angular/router';
import { provideNexuvia }     from '@nexuvia/angular';
import { routes }             from './app.routes';
import config                 from '../../nexuvia.config';
import { environment }        from '../environments/environment';

const store = config.stores.default;

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideNexuvia({
      storeKey:         'default',
      language:         store.defaultLanguage,
      storeConfig:      store,
      cartClientConfig: {
        baseSite: store.baseSite,
        language: store.defaultLanguage,
        apiBase:  environment.apiBase + '/api/cart',
      },
      gtmContainerId: environment.gtmId,
    }),
  ],
};
```

---

## Step 1b — NgModule API: `NexuviaModule.forRoot()`

For apps still using NgModule instead of the standalone API:

```ts
// src/app/app.module.ts
import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { NexuviaModule } from '@nexuvia/angular';
import { AppComponent }  from './app.component';
import config            from '../../nexuvia.config';
import { environment }   from '../environments/environment';

const store = config.stores.default;

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    NexuviaModule.forRoot({
      storeKey:         'default',
      language:         store.defaultLanguage,
      storeConfig:      store,
      cartClientConfig: {
        baseSite: store.baseSite,
        language: store.defaultLanguage,
        apiBase:  environment.apiBase + '/api/cart',
      },
      gtmContainerId: environment.gtmId,
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

---

## Step 2 — Inject and use services

`@nexuvia/angular` provides four injectable services. Inject them directly — no `providedIn: 'root'` needed on your side, `provideNexuvia()` handles registration.

### `CartService`

```ts
// src/app/components/add-to-cart/add-to-cart.component.ts
import { Component, Input }  from '@angular/core';
import { AsyncPipe }         from '@angular/common';
import { CartService }       from '@nexuvia/angular';

@Component({
  selector:   'app-add-to-cart',
  standalone: true,
  imports:    [AsyncPipe],
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

### `AuthService`

```ts
import { Component }   from '@angular/core';
import { AsyncPipe }   from '@angular/common';
import { AuthService } from '@nexuvia/angular';

@Component({
  selector:   'app-user-menu',
  standalone: true,
  imports:    [AsyncPipe],
  template: `
    <button *ngIf="!(auth.isLoggedIn$ | async)" (click)="auth.login('default')">Sign in</button>
    <div    *ngIf="auth.isLoggedIn$ | async">
      <span>Hello, {{ (auth.user$ | async)?.name }}</span>
      <button (click)="auth.logout('default')">Sign out</button>
    </div>
  `,
})
export class UserMenuComponent {
  constructor(public auth: AuthService) {}
}
```

### `AnalyticsService`

```ts
import { Component, Input }   from '@angular/core';
import { AnalyticsService }   from '@nexuvia/angular';

@Component({
  selector:   'app-product-card',
  standalone: true,
  template:   `<div (click)="onClick()">...</div>`,
})
export class ProductCardComponent {
  @Input() product: any;
  constructor(private analytics: AnalyticsService) {}

  onClick() {
    this.analytics.trackProductClick({
      code:  this.product.code,
      name:  this.product.name,
      price: this.product.price?.value,
    });
  }
}
```

### `StoreService`

```ts
import { Component }   from '@angular/core';
import { AsyncPipe }   from '@angular/common';
import { StoreService } from '@nexuvia/angular';

@Component({
  selector:   'app-store-badge',
  standalone: true,
  imports:    [AsyncPipe],
  template:   `<span>{{ (store.storeConfig$ | async)?.currency }} — {{ store.language }}</span>`,
})
export class StoreBadgeComponent {
  constructor(public store: StoreService) {}
}
```

---

## Step 3 — Register CMS components on bootstrap

```ts
// src/app/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
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

registerDefaultCmsComponents();   // runs once on module load

@Component({
  selector:   'app-root',
  standalone: true,
  template:   '<router-outlet />',
})
export class AppComponent {}
```

---

## Environment vars

Angular reads env vars from `src/environments/environment.ts` at build time. **Never put secrets here** — they're bundled into the JavaScript output.

```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  hybrisHost: 'occ-dev.example.com',
  baseSite:   'my-basesite',
  gtmId:      '',
  apiBase:    'http://localhost:3001',
};
```

---

## Checklist

- [ ] `pnpm add @nexuvia/angular` installed
- [ ] `provideNexuvia(config)` added to `appConfig.providers` (standalone) or `NexuviaModule.forRoot(config)` imported (NgModule)
- [ ] All services injected from `@nexuvia/angular` — not written manually
- [ ] `registerDefaultCmsComponents()` called at module load (top of `app.component.ts`)
- [ ] Backend running for cart + auth (or Angular Universal `server.ts`)
- [ ] Templates use `service.value$ | async` — never `.subscribe()` manually
- [ ] No `process.env` in client code — use `environment.ts` instead
