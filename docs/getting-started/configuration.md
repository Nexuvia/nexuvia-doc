---
title: Configuration
sidebar_position: 2
---

# Configuration — `nexuvia.config.ts`

`nexuvia.config.ts` is the **single source of truth** for all connection settings, secrets references, and project-specific values. It lives at the root of your project and is committed to git.

:::tip
Run `npx nexuvia init` to generate a pre-filled `nexuvia.config.ts` for your project.
:::

---

## Why one config file?

| Problem with raw `process.env` | How `nexuvia.config.ts` solves it |
|---|---|
| Env vars scattered across files | All declared in one file |
| No docs on what each var does | Config has inline comments per field |
| No type safety | Full TypeScript types via `NexuviaConfig` |
| Project values mixed with secrets | Config clearly separates static values from env refs |
| CLI can't know what vars are needed | CLI reads `NexuviaConfig` shape to generate a template |

---

## Full config reference

```ts
import type { NexuviaConfig } from '@nexuvia/nexuvia';

const config: NexuviaConfig = {

  // ── Hybris connection ─────────────────────────────────────────────────────
  hybris: {
    protocol:    process.env.HYBRIS_PROTOCOL || 'https',
    host:        process.env.HYBRIS_HOST     || '',   // e.g. 'api.commerce.example.com'
    port:        process.env.HYBRIS_PORT     || '',   // leave empty for default 443/80
    version:     'v2',
    occBasePath: '/occ',                              // public endpoints
    cmsBasePath: '/customws',                         // CMS/SmartEdit — requires auth
  },

  // ── Store definitions ─────────────────────────────────────────────────────
  // domain: use NODE_ENV to switch between .local (dev) and real domains (prod).
  // The proxy strips the port and matches the hostname to this field on every request.
  stores: {
    ae: {
      baseSite:           'my-basesite',
      domain:             process.env.NODE_ENV === 'production' ? 'www.example.ae' : 'mystore.local',
      supportedLanguages: ['en'],
      defaultLanguage:    'en',
      currency:           'AED',
      country:            'AE',
      isEcommerce:        true,
    },
    sa: {
      baseSite:           'my-basesite-ksa',
      domain:             process.env.NODE_ENV === 'production' ? 'www.example.sa' : 'mystoressa.local',
      supportedLanguages: ['en', 'ar'],
      defaultLanguage:    'en',
      currency:           'SAR',
      country:            'SA',
      isEcommerce:        true,
    },
    // Add one entry per country/storefront
  },

  // ── CMS ───────────────────────────────────────────────────────────────────
  cms: {
    useMock: process.env.USE_CMS_MOCK !== 'false',    // true = local JSON, false = live Hybris

    pageLabels: {                                     // must match Hybris impex UIDs exactly
      homepage:      'homepage',
      productDetail: 'productDetails',
      cart:          'cartPage',
      search:        'search',
      searchEmpty:   'searchEmpty',
      notFound:      'notFound',
    },

    componentTypes: [                                 // typeCode strings from impex
      'CMSHeaderComponent',
      'CMSFooterComponent',
      'CMSNavigationComponent',
      'CMSBannersComponent',
      'CMSProductCarouselComponent',
      'CMSTextComponent',
    ],
  },

  // ── SmartEdit ─────────────────────────────────────────────────────────────
  smartedit: {
    allowedOrigins: ['https://your-smartedit-host.com'],
    previewVersion: 'v1',
  },

  // ── Server auth (machine token) ───────────────────────────────────────────
  authServer: {
    clientId:      process.env.OAUTH_CLIENT_ID      || '',
    clientSecret:  process.env.OAUTH_CLIENT_SECRET  || '',
    tokenEndpoint: '/authorizationserver/oauth/token',
  },

  // ── Client auth (user sessions — Azure AD B2C) ────────────────────────────
  authClient: {
    session: {
      cookieName:      'auth_session',
      nonceCookieName: 'auth_nonce',
      storeCookieName: 'auth_store',
      encryptionKey:   process.env.AUTH_ENCRYPTION_KEY || '',
      secureCookies:   process.env.NODE_ENV === 'production',
    },
    azure: {
      redirectUri: process.env.AZURE_REDIRECT_URI || '',
    },
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    gtmContainerId: process.env.GTM_CONTAINER_ID || '',  // e.g. 'GTM-XXXXXXX'
  },

};

export default config;
```

---

## Environment variables

Create a `.env.local` file at your project root. **Never commit this file to git.**

```bash
# Hybris / SAP Commerce Cloud connection
HYBRIS_HOST=occ-dev.example.com
HYBRIS_PROTOCOL=https
# HYBRIS_PORT=   # leave empty for default 443

# CMS mock (true = local JSON, false = live Hybris CMS)
USE_CMS_MOCK=true

# Server-to-backend OAuth 2.0 (machine token)
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_client_secret_here

# User sessions (Azure AD B2C)
AUTH_ENCRYPTION_KEY=a-32-character-random-string-here
AZURE_REDIRECT_URI=http://localhost:3000/auth/callback

# Analytics — leave empty to disable GTM in local dev
GTM_CONTAINER_ID=
```

:::danger Secret handling
`OAUTH_CLIENT_SECRET` and `AUTH_ENCRYPTION_KEY` must only exist in `.env.local` (dev) or injected by your CI/CD sealed secrets (prod). They must never be committed to git or returned in an API response.
:::

---

## Store configuration

Each entry in `stores` maps to one SAP Commerce baseSite.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `baseSite` | `string` | Yes | SAP Commerce baseSite identifier used in OCC URLs |
| `domain` | `string` | Yes | Domain the proxy matches against the `Host` header. Use `NODE_ENV` ternary to switch between `.local` (dev) and real domain (prod). Port is always stripped before matching. |
| `supportedLanguages` | `string[]` | Yes | Language codes for URL prefix routing (`/en/`, `/ar/`) |
| `defaultLanguage` | `string` | Yes | Fallback language if none matched |
| `currency` | `string` | Yes | ISO 4217 currency code (e.g. `AED`, `SAR`) |
| `country` | `string` | Yes | ISO 3166-1 alpha-2 country code (e.g. `AE`, `SA`) |
| `isEcommerce` | `boolean` | Yes | `false` disables cart and checkout (e.g. Egypt) |

---

## CMS page labels

`pageLabels` values must match the **Hybris impex UIDs exactly** — case-sensitive. These are the labels your content team uses in the CMS Cockpit. Ask your SAP backend engineer for the correct values for your project.

```ts
pageLabels: {
  homepage:      'homepage',      // ContentPage with label="homepage"
  productDetail: 'productDetails',
  cart:          'cartPage',
  search:        'search',
  searchEmpty:   'searchEmpty',
  notFound:      'notFound',
},
```

---

## Checklist

- [ ] `nexuvia.config.ts` committed to git (no secrets — only `process.env.X` references)
- [ ] `.env.local` in `.gitignore`
- [ ] `HYBRIS_HOST` points to your SAP Commerce instance
- [ ] `OAUTH_CLIENT_SECRET` added to CI/CD sealed secrets
- [ ] `AUTH_ENCRYPTION_KEY` is a random 32+ character string
- [ ] `USE_CMS_MOCK=true` locally, `false` in staging/prod
- [ ] `stores` has one entry per SAP baseSite
- [ ] `stores[x].domain` uses `NODE_ENV` ternary — `.local` hostname for dev, real domain for prod
- [ ] `.local` hostnames added to `/etc/hosts` for local multi-store testing (see [Proxy / Middleware](/wiring/proxy-middleware#local-development--multi-store-testing))
- [ ] `cms.pageLabels` values match Hybris impex UIDs
