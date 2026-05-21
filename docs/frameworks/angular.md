---
title: Angular
sidebar_position: 4
---

## Angular — Complete Wiring Guide

This guide covers two setups:

- **Part A — Angular SPA**: client-side app with a separate Node.js/Express backend
- **Part B — Angular Universal (SSR)**: integrated server with `server.ts` route handlers

:::warning Backend always required
Two things can never run in the browser:

1. **`@nexuvia/auth-server`** — the OAuth `client_secret` must never reach the browser
2. **Cart CORS** — SAP OCC rejects direct browser calls

For Angular SPA, use a separate Express backend. For Angular Universal, add route handlers to `server.ts`.
:::

---

## Prerequisites

| Package | Purpose |
| ------- | ------- |
| `@nexuvia/angular` | `provideNexuvia()` / `NexuviaModule.forRoot()` + injectable services |
| `@nexuvia/app` | `NexuviaApp` singleton (server-side only) |
| `@nexuvia/auth-server` | Server-to-backend OAuth tokens (server-side only) |
| `@nexuvia/auth-client` | User auth — Azure AD B2C (server-side only) |
| `@nexuvia/cms` | `CmsClient` + component registry |

```bash
# Angular app
pnpm add @nexuvia/angular @nexuvia/cms

# Peer dependencies
pnpm add @angular/core@>=17 @angular/common@>=17 rxjs@>=7

# Backend / Universal server
pnpm add @nexuvia/app @nexuvia/auth-server @nexuvia/auth-client
```

---

## Part A — Angular SPA

### Project structure

```text
my-angular-app/
  nexuvia.config.ts              ← single source of truth for env vars
  angular.json
  src/
    environments/
      environment.ts             ← public vars only (bundled into JS — no secrets)
      environment.prod.ts
    app/
      app.config.ts              ← provideNexuvia() here
      app.component.ts           ← registerDefaultCmsComponents() on load
      app.routes.ts
      cms-defaults.ts            ← CMS component registration
      components/
        add-to-cart/
          add-to-cart.component.ts
        user-menu/
          user-menu.component.ts
        cart-badge/
          cart-badge.component.ts
        cms/
          cms-slot-renderer.component.ts
          defaults/
            cms-header.component.ts
            cms-footer.component.ts
  server/
    config/
      auth.ts                    ← registerAuthConfig (self-registers on import)
    routes/
      auth.ts                    ← Express router: login / callback / session / logout
      cart.ts                    ← Express router: GET / POST / PATCH / DELETE
    index.ts                     ← Express entry
```

---

### `nexuvia.config.ts`

```ts
// nexuvia.config.ts
import type { NexuviaConfig } from '@nexuvia/app';

const config: NexuviaConfig = {
  stores: {
    default: {
      baseSite:        process.env['HYBRIS_BASE_SITE'] ?? 'my-site',
      hybrisHost:      process.env['HYBRIS_HOST'] ?? 'occ.example.com',
      defaultLanguage: 'en',
      currency:        'USD',
      languages:       ['en'],
    },
  },
  cms: {
    cmsBasePath: process.env['CMS_BASE_PATH'] ?? '/cms/v2',
  },
  auth: {
    clientId:     process.env['OAUTH_CLIENT_ID'] ?? '',
    clientSecret: process.env['OAUTH_CLIENT_SECRET'] ?? '',   // server-side only
    tokenUrl:     process.env['OAUTH_TOKEN_URL'] ?? '',
    stores: {
      default: {
        azureTenantId:     process.env['AZURE_TENANT_ID'] ?? '',
        azureClientId:     process.env['AZURE_CLIENT_ID'] ?? '',
        azureClientSecret: process.env['AZURE_CLIENT_SECRET'] ?? '',
        policyName:        process.env['AZURE_POLICY'] ?? 'B2C_1_SignUpSignIn',
        redirectUri:       process.env['AZURE_REDIRECT_URI'] ?? 'http://localhost:4200/auth/callback',
        postLogoutUri:     process.env['AZURE_POST_LOGOUT_URI'] ?? 'http://localhost:4200',
        encryptionKey:     process.env['AUTH_ENCRYPTION_KEY'] ?? '',
        cookieName:        'nexuvia_session',
        cookieSecure:      process.env['NODE_ENV'] === 'production',
      },
    },
  },
};

export default config;
```

---

### `src/environments/environment.ts`

```ts
// src/environments/environment.ts — public vars ONLY (bundled into browser JS)
export const environment = {
  production: false,
  apiBase:    'http://localhost:3001',
  gtmId:      '',
  baseSite:   'my-site',
};
```

```ts
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiBase:    '',        // same origin in production
  gtmId:      'GTM-XXXXXXX',
  baseSite:   'my-site',
};
```

---

### `src/app/app.config.ts` — Standalone API

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

For apps using **NgModule** instead of the standalone API:

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

### `src/app/cms-defaults.ts`

```ts
// src/app/cms-defaults.ts
import { componentRegistry }     from '@nexuvia/cms/client';
import { CmsHeaderComponent }    from './components/cms/defaults/cms-header.component';
import { CmsFooterComponent }    from './components/cms/defaults/cms-footer.component';

export function registerDefaultCmsComponents(): void {
  componentRegistry.register('CMSHeaderComponent', CmsHeaderComponent as any);
  componentRegistry.register('CMSFooterComponent', CmsFooterComponent as any);
  // register every typeCode declared in nexuvia.config.ts → cms.componentTypes
}
```

```ts
// src/app/app.component.ts
import { Component }                    from '@angular/core';
import { RouterOutlet }                 from '@angular/router';
import { registerDefaultCmsComponents } from './cms-defaults';

registerDefaultCmsComponents();   // runs once at module load

@Component({
  selector:   'app-root',
  standalone: true,
  imports:    [RouterOutlet],
  template:   '<router-outlet />',
})
export class AppComponent {}
```

---

### Injectable services

`@nexuvia/angular` provides four injectable services. `provideNexuvia()` registers them — inject directly, no `providedIn: 'root'` needed.

#### `CartService`

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

Cart badge:

```ts
// src/app/components/cart-badge/cart-badge.component.ts
import { Component }   from '@angular/core';
import { AsyncPipe }   from '@angular/common';
import { CartService } from '@nexuvia/angular';

@Component({
  selector:   'app-cart-badge',
  standalone: true,
  imports:    [AsyncPipe],
  template:   `<span>{{ (cart.cart$ | async)?.totalItems ?? 0 }}</span>`,
})
export class CartBadgeComponent {
  constructor(public cart: CartService) {}
}
```

#### `AuthService`

```ts
// src/app/components/user-menu/user-menu.component.ts
import { Component }   from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { AuthService } from '@nexuvia/angular';

@Component({
  selector:   'app-user-menu',
  standalone: true,
  imports:    [AsyncPipe, NgIf],
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

#### `AnalyticsService`

```ts
// src/app/components/product-card/product-card.component.ts
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
    this.analytics.track({
      type:  'productClick',
      code:  this.product.code,
      name:  this.product.name,
      price: this.product.price?.value,
    });
  }
}
```

#### `StoreService`

```ts
// src/app/components/store-badge/store-badge.component.ts
import { Component }    from '@angular/core';
import { StoreService } from '@nexuvia/angular';

@Component({
  selector:   'app-store-badge',
  standalone: true,
  template:   `<span>{{ store.storeConfig.currency }} — {{ store.language }}</span>`,
})
export class StoreBadgeComponent {
  constructor(public store: StoreService) {}
}
```

---

### `CmsSlotRendererComponent`

```ts
// src/app/components/cms/cms-slot-renderer.component.ts
import { Component, Input, OnChanges, ViewContainerRef, ComponentRef } from '@angular/core';
import { componentRegistry } from '@nexuvia/cms/client';
import type { CMSPage }      from '@nexuvia/cms';

@Component({
  selector:   'app-cms-slot',
  standalone: true,
  template:   '',
})
export class CmsSlotRendererComponent implements OnChanges {
  @Input() page!:     CMSPage | null;
  @Input() position!: string;

  private refs: ComponentRef<any>[] = [];

  constructor(private vcr: ViewContainerRef) {}

  ngOnChanges() {
    this.refs.forEach(r => r.destroy());
    this.refs = [];
    if (!this.page) return;

    const slot = this.page.contentSlots.find(s => s.position === this.position);
    (slot?.components ?? []).forEach(c => {
      const resolved = componentRegistry.resolve(c.typeCode);
      if (!resolved) return;
      const ref = this.vcr.createComponent(resolved as any);
      (ref.instance as any).component = c;
      this.refs.push(ref);
    });
  }
}
```

---

### Server — Express backend

#### `server/config/auth.ts`

```ts
// server/config/auth.ts
import { registerAuthConfig } from '@nexuvia/auth-client';
import config from '../../nexuvia.config';

// Self-registers on import — every auth route handler must import this first
registerAuthConfig(config.auth.stores);
```

#### `server/routes/auth.ts`

```ts
// server/routes/auth.ts
import 'server/config/auth';   // must be first

import { Router }               from 'express';
import { randomUUID }           from 'crypto';
import {
  getRegisteredAuthConfig,
  buildAuthUrl,
  buildTempCookieHeader,
  buildSessionCookieHeader,
  buildClearCookieHeader,
  buildLogoutUrl,
  exchangeCodeForToken,
  encryptSession,
  getSession,
}                               from '@nexuvia/auth-client';

const router = Router();
const NONCE_COOKIE_NAME = 'nexuvia_nonce';

// GET /api/auth/login?store=default
router.get('/login', (req, res) => {
  const storeKey = (req.query['store'] as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const nonce    = randomUUID();
  const state    = randomUUID();
  const { url }  = buildAuthUrl(config.azure, config, nonce, state);

  res
    .setHeader('Set-Cookie', buildTempCookieHeader(NONCE_COOKIE_NAME, nonce, config.cookieSecure))
    .json({ redirectUrl: url });
});

// GET /auth/callback — MUST be at /auth/callback, NOT /api/auth/callback
router.get('/callback', async (req, res) => {
  const code     = req.query['code'] as string;
  const storeKey = (req.query['state'] as string)?.split(':')[0] ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);

  try {
    const { user } = await exchangeCodeForToken(code, config.azure, config);
    res
      .setHeader('Set-Cookie', [
        buildSessionCookieHeader(await encryptSession(user, config), config),
        buildClearCookieHeader(NONCE_COOKIE_NAME, config.cookieSecure),
      ])
      .redirect('/');
  } catch {
    res.redirect('/login?error=auth_failed');
  }
});

// GET /api/auth/session
router.get('/session', async (req, res) => {
  const storeKey = (req.query['store'] as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const cookies  = parseCookies(req.headers.cookie ?? '');
  const user     = await getSession(cookies[config.cookieName] ?? '', config);
  res.json(user ?? null);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const storeKey  = (req.body?.store as string) ?? 'default';
  const config    = getRegisteredAuthConfig(storeKey);
  const logoutUrl = buildLogoutUrl(config.azure, config);
  res
    .setHeader('Set-Cookie', buildClearCookieHeader(config.cookieName, config.cookieSecure))
    .json({ redirectUrl: logoutUrl });
});

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
  );
}

export default router;
```

#### `server/routes/cart.ts`

```ts
// server/routes/cart.ts
import { Router }     from 'express';
import { NexuviaApp } from '@nexuvia/app';
import config         from '../../nexuvia.config';

const nexuviaApp = NexuviaApp.getInstance(config);
const router     = Router();

async function getAdapter(storeKey: string, lang: string) {
  const ctx = await nexuviaApp.forRequest(storeKey, lang);
  return ctx.cart.server;
}

// GET /api/cart?store=default&lang=en
router.get('/', async (req, res) => {
  const storeKey = (req.query['store'] as string) ?? 'default';
  const lang     = (req.query['lang']  as string) ?? 'en';
  const cartId   = req.cookies?.['cart_id'];
  const adapter  = await getAdapter(storeKey, lang);
  const cart     = cartId ? await adapter.getCart(cartId) : null;
  res.json(cart);
});

// POST /api/cart
router.post('/', async (req, res) => {
  const { store = 'default', lang = 'en', cartId, productCode, quantity = 1 } = req.body;
  const adapter = await getAdapter(store, lang);

  let id = cartId;
  if (!id) {
    id = await adapter.createCart();
    res.cookie('cart_id', id, { httpOnly: true, sameSite: 'strict' });
  }

  await adapter.addToCart(id, { productCode, quantity });
  const cart = await adapter.getCart(id);
  res.json(cart);
});

// PATCH /api/cart
router.patch('/', async (req, res) => {
  const { store = 'default', lang = 'en', cartId, entryNumber, quantity } = req.body;
  const adapter = await getAdapter(store, lang);
  await adapter.updateCartEntry(cartId, entryNumber, quantity);
  const cart = await adapter.getCart(cartId);
  res.json(cart);
});

// DELETE /api/cart
router.delete('/', async (req, res) => {
  const { store = 'default', lang = 'en', cartId, entryNumber } = req.body;
  const adapter = await getAdapter(store, lang);
  await adapter.removeCartEntry(cartId, entryNumber);
  const cart = await adapter.getCart(cartId);
  res.json(cart);
});

export default router;
```

#### `server/index.ts`

```ts
// server/index.ts
import express      from 'express';
import cookieParser from 'cookie-parser';
import cors         from 'cors';
import authRoutes   from './routes/auth';
import cartRoutes   from './routes/cart';

const app  = express();
const PORT = process.env['PORT'] ?? 3001;

app.use(cors({
  origin:      process.env['ANGULAR_APP_URL'] ?? 'http://localhost:4200',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Auth callback at /auth/callback (no /api prefix)
app.get('/auth/callback', authRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);

app.listen(PORT, () => console.log(`Nexuvia server → http://localhost:${PORT}`));
```

#### Development with `concurrently`

```bash
npm install -D concurrently
```

```json
{
  "scripts": {
    "dev": "concurrently \"ng serve\" \"tsx watch server/index.ts\""
  }
}
```

---

## Part B — Angular Universal (SSR)

Angular Universal runs a Node.js server that renders Angular on the server. You can add Nexuvia server routes directly to `server.ts`.

### Universal project structure

```text
my-angular-ssr-app/
  nexuvia.config.ts
  src/
    app/
      app.config.ts            ← same as Part A (standalone)
      app.config.server.ts     ← merges server providers
  server.ts                    ← Universal entry + Nexuvia route handlers
  server/
    config/
      auth.ts                  ← registerAuthConfig
```

---

### `src/app/app.config.server.ts`

```ts
// src/app/app.config.server.ts
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering }                    from '@angular/platform-server';
import { appConfig }                                 from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering()],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
```

---

### `server.ts` — Universal entry with Nexuvia routes

```ts
// server.ts
import 'zone.js/node';

import { APP_BASE_HREF }        from '@angular/common';
import { CommonEngine }         from '@angular/ssr';
import express                  from 'express';
import cookieParser             from 'cookie-parser';
import { randomUUID }           from 'crypto';
import { fileURLToPath }        from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap                from './src/main.server';
import './server/config/auth';  // self-registers auth config on import
import { NexuviaApp }           from '@nexuvia/app';
import {
  getRegisteredAuthConfig,
  buildAuthUrl,
  buildTempCookieHeader,
  buildSessionCookieHeader,
  buildClearCookieHeader,
  buildLogoutUrl,
  exchangeCodeForToken,
  encryptSession,
  getSession,
}                               from '@nexuvia/auth-client';
import nexuviaConfig            from './nexuvia.config';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const nexuviaApp   = NexuviaApp.getInstance(nexuviaConfig);
const commonEngine = new CommonEngine();
const server       = express();

const NONCE_COOKIE = 'nexuvia_nonce';

server.use(cookieParser());
server.use(express.json());

// ---- Auth routes ----

server.get('/api/auth/login', (req, res) => {
  const storeKey = (req.query['store'] as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const nonce    = randomUUID();
  const state    = randomUUID();
  const { url }  = buildAuthUrl(config.azure, config, nonce, state);

  res
    .setHeader('Set-Cookie', buildTempCookieHeader(NONCE_COOKIE, nonce, config.cookieSecure))
    .json({ redirectUrl: url });
});

server.get('/auth/callback', async (req, res) => {
  const code     = req.query['code'] as string;
  const storeKey = (req.query['state'] as string)?.split(':')[0] ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);

  try {
    const { user } = await exchangeCodeForToken(code, config.azure, config);
    res
      .setHeader('Set-Cookie', [
        buildSessionCookieHeader(await encryptSession(user, config), config),
        buildClearCookieHeader(NONCE_COOKIE, config.cookieSecure),
      ])
      .redirect('/');
  } catch {
    res.redirect('/login?error=auth_failed');
  }
});

server.get('/api/auth/session', async (req, res) => {
  const storeKey = (req.query['store'] as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const cookies  = req.cookies as Record<string, string>;
  const user     = await getSession(cookies[config.cookieName] ?? '', config);
  res.json(user ?? null);
});

server.post('/api/auth/logout', (req, res) => {
  const storeKey  = (req.body?.store as string) ?? 'default';
  const config    = getRegisteredAuthConfig(storeKey);
  const logoutUrl = buildLogoutUrl(config.azure, config);
  res
    .setHeader('Set-Cookie', buildClearCookieHeader(config.cookieName, config.cookieSecure))
    .json({ redirectUrl: logoutUrl });
});

// ---- Cart routes ----

server.get('/api/cart', async (req, res) => {
  const storeKey = (req.query['store'] as string) ?? 'default';
  const lang     = (req.query['lang']  as string) ?? 'en';
  const cartId   = (req.cookies as any)['cart_id'];
  const ctx      = await nexuviaApp.forRequest(storeKey, lang);
  const cart     = cartId ? await ctx.cart.server.getCart(cartId) : null;
  res.json(cart);
});

server.post('/api/cart', async (req, res) => {
  const { store = 'default', lang = 'en', cartId, productCode, quantity = 1 } = req.body;
  const ctx     = await nexuviaApp.forRequest(store, lang);
  const adapter = ctx.cart.server;

  let id = cartId;
  if (!id) {
    id = await adapter.createCart();
    res.cookie('cart_id', id, { httpOnly: true, sameSite: 'strict' });
  }
  await adapter.addToCart(id, { productCode, quantity });
  res.json(await adapter.getCart(id));
});

// ---- Static files ----

server.get('*.*', express.static(browserDistFolder, { maxAge: '1y' }));

// ---- Angular SSR catch-all ----

server.get('*', (req, res, next) => {
  commonEngine
    .render({
      bootstrap,
      documentFilePath: join(browserDistFolder, 'index.html'),
      url:              `${req.protocol}://${req.headers.host}${req.originalUrl}`,
      publicPath:       browserDistFolder,
      providers:        [{ provide: APP_BASE_HREF, useValue: req.baseUrl }],
    })
    .then(html => res.send(html))
    .catch(next);
});

export default server;
```

---

## Checklist

### Angular SPA

- [ ] `@nexuvia/angular` installed
- [ ] `provideNexuvia(config)` in `appConfig.providers` (standalone) or `NexuviaModule.forRoot(config)` in `AppModule`
- [ ] `registerDefaultCmsComponents()` called at top of `app.component.ts` (module load)
- [ ] All services injected from `@nexuvia/angular` — `CartService`, `AuthService`, `AnalyticsService`, `StoreService`
- [ ] Templates use `| async` pipe — never manually subscribe
- [ ] No secrets in `environment.ts` — those files are bundled into browser JS
- [ ] Express backend running with `concurrently`
- [ ] `server/config/auth.ts` imported at top of every auth handler
- [ ] Auth callback at `/auth/callback` — NOT `/api/auth/callback`
- [ ] CORS configured with `credentials: true` and `http://localhost:4200`

### Angular Universal (SSR)

- [ ] `./server/config/auth` imported at the top of `server.ts`
- [ ] `NexuviaApp.getInstance(config)` called once at module level
- [ ] Auth callback handled before Angular SSR catch-all (`server.get('*', ...)`)
- [ ] Cart routes use `ctx.cart.server` — never `ProxyCartAdapter` in `server.ts`
- [ ] `OAUTH_CLIENT_SECRET` and `AUTH_ENCRYPTION_KEY` in server environment only — never in `environment.ts`
