---
id: intro
title: Introduction
sidebar_position: 1
---

# Nexuvia

**Nexuvia** is a free, open-source TypeScript library that connects any headless frontend to **SAP Commerce Cloud (Hybris)**.

Today there is no free, framework-agnostic solution for this. Existing options are either proprietary (Spartacus is Angular-only, tightly coupled to SAP) or require buying into a specific vendor stack. Nexuvia fills that gap.

---

## What Nexuvia is

| Property | Description |
|----------|-------------|
| **Framework-agnostic** | Works with Next.js, React, Vue 3, Angular, or plain TypeScript |
| **Backend-flexible** | Works with standard OCC, custom Hybris endpoints, or any SAP Commerce variant |
| **Zero dependencies** | Core library has no runtime npm dependencies |
| **Adapter-driven** | Swap the adapter, keep all your business logic |
| **Incrementally adoptable** | Use one package or all of them |

---

## The 19 packages

Nexuvia is a monorepo. Each package is self-contained and independently installable.

### App wiring

| Package | What it does |
|---------|-------------|
| [`@nexuvia/app`](/packages/app) | `NexuviaApp` — wires all clients from one config, `forRequest()` returns a typed context per request |

### Foundation

| Package | What it does |
|---------|-------------|
| [`@nexuvia/core`](/packages/core) | EventEmitter, error hierarchy, Result type — shared by all libraries |
| [`@nexuvia/log`](/packages/log) | Structured logging — namespace scoping, log levels, pretty/JSON format |
| [`@nexuvia/storage`](/packages/storage) | SSR-safe storage adapters — Cookie, LocalStorage, Memory |
| [`@nexuvia/occ`](/packages/occ) | HTTP client for SAP OCC APIs — URL building, auth header injection, error handling |

### Commerce

| Package | What it does |
|---------|-------------|
| [`@nexuvia/cms`](/packages/cms) | CMS page fetching, normalization, caching, component registry |
| [`@nexuvia/smartedit`](/packages/smartedit) | SAP SmartEdit DOM contract — preview mode, postMessage, data attributes |
| [`@nexuvia/cart`](/packages/cart) | Cart CRUD with lazy creation, cookie persistence, payload extension |
| [`@nexuvia/product`](/packages/product) | Product detail, reviews, and configurable cache TTL |
| [`@nexuvia/search`](/packages/search) | Full-text search, category search, query suggestions |

### Auth & Analytics

| Package | What it does |
|---------|-------------|
| [`@nexuvia/auth-server`](/packages/auth-server) | Server-to-backend OAuth 2.0 `client_credentials` token with in-memory cache |
| [`@nexuvia/auth-client`](/packages/auth-client) | User auth via Azure AD B2C — Authorization Code flow, encrypted session cookie |
| [`@nexuvia/analytics`](/packages/analytics) | Analytics event tracking — GTM adapter, typed events, SSR queue |

### Framework Bindings

| Package | What it does |
|---------|-------------|
| [`@nexuvia/react`](/packages/react) | `NexuviaProvider` + hooks — single import wires all React contexts with correct nesting |
| [`@nexuvia/vue`](/packages/vue) | `createNexuviaPlugin()` — Vue plugin that exposes all composables with no manual wiring |
| [`@nexuvia/angular`](/packages/angular) | `provideNexuvia()` / `NexuviaModule` — Angular standalone and NgModule APIs |
| [`@nexuvia/browser`](/packages/browser) | `NexuviaClient` — plain TS/JS class, no framework, full sub-client API |

### Tooling

| Package | What it does |
|---------|-------------|
| [`@nexuvia/di`](/packages/di) | Framework-agnostic DI container — `Token<T>` + `Container`, singleton and scoped lifetimes, no decorators |
| [`@nexuvia/codemod`](/packages/codemod) | Migration CLI — automated AST transforms for breaking changes across Nexuvia versions |

---

## Three-layer architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Framework Bindings                            │
│  @nexuvia/react  NexuviaProvider + hooks                │
│  @nexuvia/vue    createNexuviaPlugin() + composables    │
│  @nexuvia/angular  provideNexuvia() + services          │
│  @nexuvia/browser  NexuviaClient (plain TS/JS)          │
└────────────────────────┬────────────────────────────────┘
                         │ uses
┌────────────────────────▼────────────────────────────────┐
│  Layer 2: Core Services  (@nexuvia/core)                │
│  CmsClient, CartClient, ProductClient,                  │
│  SearchClient, AuthService, AnalyticsClient             │
│  Pure TypeScript. No React. No DOM. No framework.       │
└────────────────────────┬────────────────────────────────┘
                         │ uses
┌────────────────────────▼────────────────────────────────┐
│  Layer 1: Adapters                                      │
│  OccCmsAdapter, OccCartAdapter, GtmAnalyticsAdapter … │
│  Translate backend responses into generic Nexuvia types │
└─────────────────────────────────────────────────────────┘
```

**Rule:** each layer can only depend on the layer below it. Never sideways, never up.

---

## Next steps

- [Quick Start](/getting-started/quick-start) — install and run in 5 minutes
- [Configuration](/getting-started/configuration) — `nexuvia.config.ts` reference
- [Architecture](/getting-started/architecture) — deep-dive into the three layers

### Framework guides
- [Next.js (App Router)](/frameworks/nextjs)
- [React (Vite)](/frameworks/react)
- [Vue 3](/frameworks/vue)
- [Angular](/frameworks/angular)
- [Browser (Plain TS/JS)](/frameworks/browser)

### Framework binding packages

- [`@nexuvia/react`](/packages/react) — hooks + provider
- [`@nexuvia/vue`](/packages/vue) — composables + plugin
- [`@nexuvia/angular`](/packages/angular) — services + module
- [`@nexuvia/browser`](/packages/browser) — plain TS client

### Tooling packages

- [`@nexuvia/di`](/packages/di) — framework-agnostic DI container
- [`@nexuvia/codemod`](/packages/codemod) — migration CLI
