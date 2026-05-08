---
title: Quick Start
sidebar_position: 1
---

# Quick Start

Get Nexuvia running in a new project in under 10 minutes.

:::info Prerequisites
- Node.js 18 or later
- A GitHub account with access to the Nexuvia private packages
- A SAP Commerce Cloud (Hybris) instance, **or** use the built-in mock adapters for local development without a backend
:::

---

## 1. Configure the GitHub Package Registry

Nexuvia packages are published to the **GitHub Package Registry** under the `@nexuvia` scope. You must tell npm where to find them before installing.

Add these two lines to your project's `.npmrc` file (create it at the root if it doesn't exist):

```bash
@nexuvia:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then set `NODE_AUTH_TOKEN` to a GitHub Personal Access Token with `read:packages` scope:

```bash
# .env (or export in your shell — do NOT commit the token itself)
NODE_AUTH_TOKEN=ghp_your_github_token_here
```

:::tip CI/CD
In GitHub Actions, use `${{ secrets.GITHUB_TOKEN }}` — it has `read:packages` access by default. Set it as `NODE_AUTH_TOKEN` in your workflow's `env` block.
:::

:::warning
Commit `.npmrc` (it contains no secrets — only the variable reference `${NODE_AUTH_TOKEN}`). Never commit the token value itself.
:::

---

## 2. Install Nexuvia

Install the single umbrella package. It includes all 12 libraries and the CLI:

```bash
npm install @nexuvia/nexuvia
```

After install, a `postinstall` script runs automatically and creates a blank `nexuvia.config.ts` at your project root if one does not already exist.

---

## 3. Initialize your project

Run the interactive CLI wizard to configure Nexuvia for your project:

```bash
npx nexuvia init
```

The wizard will:

1. **Detect** your framework (Next.js, React, Vue, Angular) and package manager automatically
2. **Ask for your Hybris host** — the backend API domain
3. **Walk you through store setup** — baseSite IDs, domains, languages, currencies
4. **Let you pick features** — select only the packages you actually need
5. **Generate `nexuvia.config.ts`** — a fully typed, pre-filled config file tailored to your answers
6. **Install the selected packages** — runs your package manager automatically

Example session:

```text
◆  Nexuvia

●  Detected framework: Next.js (App Router)
●  Detected package manager: npm

◆  Hybris backend host
│  occ-dev.example.com

◆  How many stores do you need?
│  ● 1 store

◆  Store 1 of 1
◆  Store name — what do you call this store?
│  My Store
◆  Store key
│  ae
◆  SAP Commerce baseSite ID
│  my-basesite
◆  Production website domain
│  www.example.com
◆  Does this store support multiple languages?
│  No
◆  Currency code
│  AED
◆  Country code
│  AE
◆  Does this store have a working cart and checkout?
│  Yes

◆  Which Nexuvia packages do you need?
│  ◼ @nexuvia/cms
│  ◼ @nexuvia/cart
│  ◼ @nexuvia/product
│  ◼ @nexuvia/search
│  ◼ @nexuvia/storage

◆  nexuvia.config.ts generated
◆  Packages installed

◇  Nexuvia initialized successfully!
```

---

## 4. Set environment variables

Create `.env.local` at your project root. The values you set here are referenced by `nexuvia.config.ts` via `process.env.*`:

```bash
# SAP Commerce Cloud connection
HYBRIS_HOST=occ-dev.your-commerce.com
HYBRIS_PROTOCOL=https

# Machine token — for CMS / SmartEdit protected endpoints
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_secret_here

# Session encryption — for user auth (Azure AD B2C)
AUTH_ENCRYPTION_KEY=generate-a-random-32-character-string

# GTM — leave empty to disable analytics locally
GTM_CONTAINER_ID=

# CMS: true = local mock JSON, false = live Hybris CMS
USE_CMS_MOCK=true
```

:::tip Local development without Hybris
Keep `USE_CMS_MOCK=true` and the CMS library serves pages from local JSON files. Cart, product, and search all have `Mock*Adapter` implementations — you can run a full storefront with zero SAP connectivity.
:::

:::danger
`OAUTH_CLIENT_SECRET` and `AUTH_ENCRYPTION_KEY` must never be committed to git. Add `.env.local` to your `.gitignore`.
:::

---

## 5. Choose your framework

Follow the guide for your stack:

| Framework | Guide |
|-----------|-------|
| **Next.js** (App Router) | [Next.js guide](/frameworks/nextjs) — recommended, full SSR + RSC support |
| **React** (Vite / CRA) | [React guide](/frameworks/react) — SPA setup with client-side rendering |
| **Vue 3** | [Vue guide](/frameworks/vue) — composables using `client.on()` |
| **Angular** | [Angular guide](/frameworks/angular) — `@Injectable` services |

---

## 6. Verify — minimal working example

Once installed, import directly from the package you need:

```ts
import { OccClient }                        from '@nexuvia/occ';
import { OccProductAdapter, ProductClient } from '@nexuvia/product';

const occClient = new OccClient(
  { baseUrl: 'https://api.commerce.example.com', basePath: '/occ', version: 'v2' },
  'my-basesite',
  'en'
);

const adapter = new OccProductAdapter(occClient);
const client  = new ProductClient(adapter);

const product = await client.getProduct('12345');
console.log(product?.name);
```

Or with mock data (no SAP required):

```ts
import { MockProductAdapter, ProductClient } from '@nexuvia/product';

const adapter = new MockProductAdapter();
const client  = new ProductClient(adapter);

const product = await client.getProduct('MOCK-001');
console.log(product?.name);
```

---

## What's next

- [Configuration reference](/getting-started/configuration) — every `nexuvia.config.ts` field explained
- [Architecture](/getting-started/architecture) — the three-layer design
- Framework guide for your stack (links above)
- [Package reference](/packages/core) — detailed API docs for each library
