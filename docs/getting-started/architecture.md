---
title: Architecture
sidebar_position: 3
---

# Architecture

Nexuvia is built on three strict layers. Understanding this layering is the key to extending or customising the library.

---

## The three layers

### Layer 1 — Adapters

Adapters are the **"how do I talk to this backend"** layer. Each adapter implements a contract (interface) defined in `@nexuvia/core`. The first-party adapters target SAP OCC v2.

```
OccCmsAdapter       implements CmsAdapter
OccCartAdapter      implements CartAdapter
OccProductAdapter   implements ProductAdapter
OccSearchAdapter    implements SearchAdapter
GtmAnalyticsAdapter implements AnalyticsAdapter
```

Adapters own **normalization** — they receive the raw backend response and return the clean Nexuvia generic types before returning to the service layer. No service ever sees a raw SAP response.

### Layer 2 — Core Services

Services contain **business logic and orchestration**. They do not know which backend they talk to — they only call adapter interfaces. They do not know which UI framework is in use — they emit typed events.

```
CmsClient      — 5-min page cache, EventEmitter, component registry
CartClient     — lazy cart create, CookieStorage persistence, payload extender
ProductClient  — 5-min per-code cache, EventEmitter
SearchClient   — 2-min cache, suggestions never cached
AnalyticsClient — typed helpers, error capture, SSR queue
```

### Layer 3 — Framework Bindings

Thin wrappers that **subscribe** to core service events and translate them into framework-specific reactive state.

```
@nexuvia/react    — NexuviaProvider + hooks: useCart, useAuth, useStore, useCmsPage, useAnalytics, useSmartEdit
@nexuvia/vue      — createNexuviaPlugin() + composables: useCart, useAuth, useStore, useAnalytics, useSmartEdit
@nexuvia/angular  — provideNexuvia() / NexuviaModule.forRoot() + services: CartService, AuthService, AnalyticsService, StoreService
@nexuvia/browser  — NexuviaClient with .cart, .search, .product, .analytics sub-clients (vanilla JS / SPA)
Plain TS          — client.on() directly (no binding package needed)
```

The framework binding packages are optional — you can wire providers manually instead (see [Wiring Overview](/wiring/overview)).

---

## Dependency rule

```
Framework bindings  →  Core services  →  Adapters
```

- Adapters never import framework code
- Services never import framework code
- Framework bindings can import services and adapters
- No sideways imports between packages at the same layer

---

## Generic types

These are **Nexuvia types** — not SAP types. Every adapter normalizes its backend's response into these.

```ts
interface Product {
  code: string;
  name: string;
  price?: Price;
  images?: Image[];
  [key: string]: unknown; // SAP-specific fields pass through
}

interface CmsPage {
  uid: string;
  uuid: string;
  name: string;
  template: string;
  contentSlots: CmsSlot[];
}

interface CmsSlot {
  slotId: string;
  slotUuid: string;
  position: string;
  components: CmsComponent[];
}

interface CmsComponent {
  uid: string;
  uuid: string;
  typeCode: string;
  [key: string]: unknown;
}
```

---

## Event system

All client classes use a typed `EventEmitter` from `@nexuvia/core`. Framework bindings subscribe to events instead of polling or prop-drilling.

```ts
// CartClient emits these events
interface CartEvents extends Record<string, (...args: any[]) => void> {
  cart:  (cart: Cart | null) => void;
  error: (err: Error) => void;
}

// Framework binding subscribes
const off = cartClient.on('cart', (cart) => setCart(cart));

// Clean up on unmount
useEffect(() => off, []);
```

The `on()` method returns an **unsubscribe function** — no event name needed for cleanup.

---

## Storage abstraction

Cart ID persistence goes through a `StorageAdapter` interface so the same `CartClient` code works in Next.js SSR, Vite SPA, Angular SSR, or any other environment.

```ts
interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string, options?: StorageSetOptions): void;
  remove(key: string): void;
  clear(): void;
}

// Implementations
class CookieStorage   implements StorageAdapter // SSR-safe, falls back to Memory
class LocalStorage    implements StorageAdapter // SSR-safe, falls back to Memory
class MemoryStorage   implements StorageAdapter // always works, lost on reload
```

---

## Configuration bridge

`nexuvia.config.ts` is the single file where all environment variables and project-specific settings are declared. The config bridge (`src/config/`) reads it and passes typed config objects to library constructors — no `process.env` calls anywhere in application code except that one file.

```
nexuvia.config.ts  →  src/config/hybris.ts    →  OccClient constructor
                   →  src/config/server.ts    →  createServerOccClient factory
                   →  src/config/auth.ts      →  registerAuthConfig()
```

---

## Auth routing

| Endpoint | Token source |
|----------|-------------|
| `/occ` products, search, cart (anonymous) | None — public |
| `/occ` users, orders | `getAccessToken(user.id)` from `auth-client` |
| `/{cmsPath}` CMS, SmartEdit | `getStaticToken()` from `auth-server` |

---

## Adding a custom adapter

Any package with a well-defined adapter interface can be extended. Example — adding a Contentful CMS adapter:

```ts
import { CmsAdapter, CMSPage } from '@nexuvia/cms';

export class ContentfulCmsAdapter extends CmsAdapter {
  async getContentPage(label: string): Promise<CMSPage | null> {
    const entry = await this.contentfulClient.getEntries({ content_type: label });
    return this.normalize(entry); // transform Contentful → CMSPage
  }
  // ...
}

// Use it exactly like OccCmsAdapter
const adapter = new ContentfulCmsAdapter(contentfulClient);
const client  = new CmsClient(adapter);
```

---

## Dependency injection (optional)

`@nexuvia/di` is an opt-in DI container for your own application services. It is not required to use any Nexuvia library — it sits alongside the three-layer architecture rather than inside it.

```ts
import { Container, Token } from '@nexuvia/di';

const DbToken      = new Token<Database>('Database');
const ServiceToken = new Token<UserService>('UserService');

const container = new Container();
container.register(DbToken,      () => new Database(process.env.DATABASE_URL!), 'singleton');
container.register(ServiceToken, (c) => new UserService(c.get(DbToken)),        'singleton');
container.validate(); // throws at startup if any token is missing

const service = container.get(ServiceToken);
```

Use `createScope()` to get a fresh container per request that shares singletons:

```ts
const scope   = container.createScope();
const service = scope.get(ServiceToken); // singleton — shared instance
const ctx     = scope.get(RequestCtxToken); // scoped — fresh per request
```

See [`@nexuvia/di`](/packages/di) for the full API reference.

---

## Monorepo build caching (Turborepo)

The Nexuvia monorepo uses **Turborepo** for task orchestration and build caching. Individual package builds are cached by input hash — only packages affected by a change are rebuilt.

```bash
pnpm build          # turbo run build — rebuilds only changed packages
pnpm typecheck      # turbo run typecheck
pnpm test           # turbo run test
pnpm docs:api       # turbo run docs:api — generates TypeDoc HTML in docs-api/
```

This does not affect how you use Nexuvia in your application — it only speeds up CI and local development inside the monorepo itself.
