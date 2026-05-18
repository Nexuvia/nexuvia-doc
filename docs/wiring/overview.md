---
title: Wiring Overview
sidebar_position: 1
---

# Wiring Overview — Read This First

**Nexuvia is a framework, not a utility library.** Every library has parts that must be connected before it works. Skipping a part means runtime errors.

This page shows you the **same simple pattern** that works in **any framework** — Next.js, plain Node.js (Express/Hono/Fastify), Nuxt 3, or Angular Universal. Once you understand this pattern, every library docs page is the same shape.

---

## The mental model — 4 layers, always

Every Nexuvia library plugs in at the same 4 layers, regardless of framework:

```
┌──────────────────────────────────────────────────────────┐
│ Layer 4 — Your UI                                        │
│   useCart()  cartService.cart$  inject('useCart')        │
└──────────────────────────────┬───────────────────────────┘
                               │ reads from
┌──────────────────────────────▼───────────────────────────┐
│ Layer 3 — Reactive wrapper                               │
│   React Provider  |  Vue composable  |  Angular service  │
│   Wraps the client, exposes events as state              │
└──────────────────────────────┬───────────────────────────┘
                               │ subscribes to
┌──────────────────────────────▼───────────────────────────┐
│ Layer 2 — Server endpoint (Node.js)                      │
│   Browser → /api/cart → SAP OCC                          │
│   Hides OAuth secret, solves CORS                        │
└──────────────────────────────┬───────────────────────────┘
                               │ uses
┌──────────────────────────────▼───────────────────────────┐
│ Layer 1 — Config bridge                                  │
│   Plain TS files reading nexuvia.config.ts               │
│   Same files in every framework                          │
└──────────────────────────────────────────────────────────┘
```

**The library is "wired" when all 4 layers are in place.** Skip a layer → runtime error.

---

## What "Layer 2 — Server endpoint" means in your framework

Nexuvia needs a **Node.js server** somewhere to do two things:

1. Hold the OAuth `client_secret` (browsers can't be trusted with secrets)
2. Proxy SAP OCC calls (browsers can't call SAP directly — CORS)

Where this server lives depends on your stack:

| Stack | Where Layer 2 lives |
|-------|--------------------|
| **Next.js (App Router)** | `src/app/api/*/route.ts` (Route Handlers) |
| **React (Vite/CRA)** | Separate Express/Hono backend running alongside |

<!--
| **Vue 3 (Nuxt)** | `server/api/*.ts` (Nuxt server routes) |
| **Vue 3 (Vite SPA)** | Separate Express/Hono backend |
| **Angular (Universal)** | `server.ts` Express handlers |
| **Angular (CLI only)** | Separate Express/Hono backend |
| **Plain Node.js (CLI / scripts)** | Just call adapters directly — no Layer 2 needed |
-->

**The library code you write is identical in all of them.** Only the route handler syntax differs (and the docs show all variants side-by-side).

---

## What you build for every library

For each library, you ask the same 4 questions and copy 4 templates:

| Question | What you create |
|----------|----------------|
| **What config does it need?** | Add a section to `nexuvia.config.ts` |
| **Does it need a server endpoint?** | Add a route in your Node.js server (Layer 2) |
| **Does it need a reactive wrapper?** | Add a Provider / composable / service in your app (Layer 3) |
| **How do components consume it?** | Call the hook / composable / service (Layer 4) |

That's it. Every library wiring page in these docs follows that exact shape.

---

## The wiring order — do this once, in sequence

Wire libraries in this order — later libraries depend on earlier ones:

| # | Library | Why this order |
|---|---------|---------------|
| 1 | [Config Bridge](/wiring/config-bridge) | Everything reads from `nexuvia.config.ts` through these files |
| 2 | [Proxy / Routing](/wiring/proxy-middleware) | Resolves which store + language a request is for |
| 3 | [`@nexuvia/occ`](/wiring/occ) | The HTTP client every other library uses |
| 4 | [`@nexuvia/auth-server`](/wiring/auth-server) | Machine token — needed by CMS and config endpoint |
| 5 | [`@nexuvia/auth-client`](/wiring/auth-client) | User login — needed for cart-on-login merge |
| 6 | [`@nexuvia/cms`](/wiring/cms) | Page rendering and component registry |
| 7 | [`@nexuvia/smartedit`](/wiring/smartedit) | Optional — only if using SAP SmartEdit |
| 8 | [`@nexuvia/cart`](/wiring/cart) | Cart proxy + provider |
| 9 | [`@nexuvia/product`](/wiring/product) | Product detail |
| 10 | [`@nexuvia/search`](/wiring/search) | Search + suggestions |
| 11 | [`@nexuvia/analytics`](/wiring/analytics) | GTM tracking |

---

## Framework binding packages (optional shortcut)

The `@nexuvia/react`, `@nexuvia/vue`, `@nexuvia/angular`, and `@nexuvia/browser` packages ship pre-built Layer 3 wrappers. Installing one of them eliminates the need to write your own providers, composables, or services manually.

| Package | What it provides |
| ------- | ---------------- |
| `@nexuvia/react` | `NexuviaProvider` + hooks: `useCart`, `useAuth`, `useStore`, `useCmsPage`, `useAnalytics`, `useSmartEdit` |
| `@nexuvia/vue` | `createNexuviaPlugin()` + composables: `useCart`, `useAuth`, `useStore`, `useAnalytics`, `useSmartEdit` |
| `@nexuvia/angular` | `provideNexuvia()` / `NexuviaModule.forRoot()` + services: `CartService`, `AuthService`, `AnalyticsService`, `StoreService` |
| `@nexuvia/browser` | `NexuviaClient` with `.cart`, `.search`, `.product`, `.analytics` sub-clients |

If you use one of these packages, you can skip the manual Layer 3 wiring steps. Layers 1 and 2 (config bridge and server endpoints) are still required regardless.

---

## The provider/service tree (Layer 3)

In React, Vue, and Angular, Layer 3 wrappers must nest in a specific order — later wrappers depend on earlier ones:

```
Store wrapper        (storeKey + language come from URL/domain)
  Auth wrapper       (knows the logged-in user)
    Cart wrapper     (cart-on-login needs user.id)
      Analytics      (page-view events include storeKey)
        SmartEdit    (preview ticket from URL)
          {your app}
```

| Why this order | Reason |
|----------------|--------|
| Store outermost | All others read `storeKey` / `language` from it |
| Auth before Cart | `mergeCarts(userId)` needs `user.id` after login |
| Analytics inside Store | Page-view events include `storeKey` from Store |
| SmartEdit innermost | Just needs `?cmsTicketId` from URL |

This same nesting applies to React Providers, Vue plugin order, and Angular service injection chains.

---

## Common errors → what's missing

| Error | Missing wiring |
|-------|---------------|
| `useCart() must be used inside <CartProvider>` | Layer 3 — provider missing in tree |
| `getRegisteredAuthConfig: no config registered` | Forgot `import '<config-bridge>/auth'` at top of route |
| `CORS error: cannot fetch from /occ/...` | Layer 2 — using OCC adapter in browser instead of proxy |
| `Component type "X" not registered` | CMS component registry missing entry for that typeCode |
| `useSearchParams() should be wrapped in suspense` | SmartEdit provider not wrapped in `<Suspense>` |
| Auth callback returns `?auth_error=csrf_failed` | Proxy/middleware is rewriting `/auth/callback` |
| Token endpoint returns 404 from `auth-server` | Wrong `tokenEndpoint` in config |
| Cart cookie not persisting | Forgot `new CookieStorage()` as 2nd arg to `CartClient` |

---

## Local development — store switching

The proxy resolves the store from the **`Host` header** on every request — including product pages, search results, and cart. This means the store is always correct as long as the hostname is correct.

In production each country has its own domain (`www.mystore.ae`, `www.mystore.sa`, etc.). Locally you replicate this with `.local` hostnames in `/etc/hosts`:

```text
127.0.0.1  mystore.local       # UAE
127.0.0.1  mystoressa.local    # KSA (en + ar)
127.0.0.1  mystoreqa.local     # Qatar (en + ar)
```

Then `http://mystoressa.local:3000/ar/` gives you KSA Arabic — the proxy picks up `mystoressa.local`, matches it to the `sa` store, validates `ar` against `supportedLanguages`, and every link on the page keeps working with clean URLs.

**Do not use query params or cookies to switch stores** — they break on any navigation that doesn't carry them forward (direct links, redirects, server renders).

See [Proxy / Middleware](/wiring/proxy-middleware#local-development--multi-store-testing) for the full setup.

---

## What's next

Now read these in order:

1. **[Config Bridge](/wiring/config-bridge)** — Layer 1 setup (same in every framework)
2. **[Proxy / Routing](/wiring/proxy-middleware)** — store + language resolution
3. **Then walk through each library wiring page** — they all follow the same 4-layer template

Each library page shows code for **every supported framework** in tabs. Pick your tab, copy the code, you're wired.
