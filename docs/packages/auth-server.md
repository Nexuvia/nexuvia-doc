---
title: "@nexuvia/auth-server"
sidebar_position: 10
---

# @nexuvia/auth-server

Server-to-backend OAuth 2.0 `client_credentials` token with in-memory cache.

**Server-side only. Never import this package in browser code or client components.**

---

## Installation

```bash
npm install @nexuvia/auth-server @nexuvia/core
```

---

## What this library does

Fetches an OAuth 2.0 `client_credentials` token from your SAP Commerce backend and caches it in server memory. Every API call your server makes to protected endpoints includes this token automatically.

This is **machine-to-machine auth** — not user login. For user authentication, see [`@nexuvia/auth-client`](/packages/auth-client).

---

## When you need it

| Endpoint | Auth required? |
|----------|---------------|
| `/occ/v2/{baseSite}/products` | No — public |
| `/customws/v2/{baseSite}/cms/pages` | Yes — Bearer token |
| SmartEdit endpoints | Yes — Bearer token |

Any endpoint under your custom CMS base path requires this token.

---

## How it works

```
First request:
  getStaticToken(config) → POST /authorizationserver/oauth/token
                         → caches { access_token, expiresAt } in memory
                         → returns token string

Subsequent requests (token valid):
  getStaticToken(config) → cache hit → returns immediately (no HTTP call)

Token expires in < 60 seconds:
  getStaticToken(config) → proactive refresh → returns new token
```

With a typical SAP 12-hour token lifetime → ~2 HTTP calls per day, regardless of traffic.

---

## Setup

### Step 1 — Config

```ts
// nexuvia.config.ts
authServer: {
  clientId:      process.env.OAUTH_CLIENT_ID      || 'mobile_android',
  clientSecret:  process.env.OAUTH_CLIENT_SECRET  || '',
  tokenEndpoint: '/authorizationserver/oauth/token',
},
```

### Step 2 — Environment variables

```bash
# .env.local
OAUTH_CLIENT_ID=mobile_android
OAUTH_CLIENT_SECRET=your_client_secret_here
```

### Step 3 — Use via server factory

In Next.js, you don't call `getStaticToken()` directly from pages — the factory in `src/config/server.ts` handles it:

```ts
// src/config/server.ts
import { getStaticToken } from '@nexuvia/auth-server';

export async function createServerOccClient(storeKey: string, lang: string) {
  const client = new OccClient(getOccConfig(), store.baseSite, lang);

  const token = await getStaticToken({
    baseUrl:       buildHybrisBaseUrl(),
    clientId:      config.authServer.clientId,
    clientSecret:  config.authServer.clientSecret,
    tokenEndpoint: config.authServer.tokenEndpoint,
  });

  if (token) client.setAccessToken(token);
  return client;
}
```

### Step 4 — Use in a Server Component

```ts
import { headers } from 'next/headers';
import { createServerOccClient } from '@/config/server';

export default async function Page({ params }) {
  const { lang }   = await params;
  const storeKey   = (await headers()).get('x-store-key') ?? 'ae';
  const client     = await createServerOccClient(storeKey, lang);
  // client now has Authorization: Bearer <token> on all requests
}
```

---

## Setup — Vue / Angular / Node.js

Call `getStaticToken()` directly in your server-side code:

```ts
import { getStaticToken } from '@nexuvia/auth-server';

async function callProtectedApi() {
  const token = await getStaticToken({
    baseUrl:       'https://api.commerce.example.com',
    clientId:      process.env.OAUTH_CLIENT_ID!,
    clientSecret:  process.env.OAUTH_CLIENT_SECRET!,
    tokenEndpoint: '/authorizationserver/oauth/token',
  });

  const response = await fetch('https://api.commerce.example.com/customws/v2/mysite/cms/pages', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}
```

---

## Cache behaviour

| Situation | Result |
|-----------|--------|
| No cached token | Fetches from backend, caches |
| Cached, expires in > 60 s | Returns immediately — no HTTP call |
| Cached, expires in < 60 s | Proactive refresh |
| Token fetch fails | Returns `null`, logs warning — public endpoints still work |
| Server restart | Cache cleared — fetches fresh on next call |

---

## API reference

```ts
// Cached — recommended for 99% of use cases
getStaticToken(config: AuthServerConfig): Promise<string | null>

// Raw — fresh token every time, no caching
getClientCredentialsToken(config: AuthServerConfig): Promise<OAuthToken>

// Force refresh on next getStaticToken() call (useful after credential rotation)
clearStaticTokenCache(): void
```

```ts
interface AuthServerConfig {
  baseUrl:        string; // e.g. 'https://api.commerce.example.com'
  clientId:       string;
  clientSecret:   string;
  tokenEndpoint:  string; // e.g. '/authorizationserver/oauth/token'
}

interface OAuthToken {
  access_token: string;
  token_type:   string;   // 'bearer'
  expires_in:   number;   // seconds, typically 43200 (12h)
  scope:        string;
}
```

---

## Security rules

1. `OAUTH_CLIENT_SECRET` only in `.env.local` (dev) or sealed CI/CD secrets (prod)
2. **Never import this library in `'use client'` files or browser code**
3. Never log or return the token value in an API response
4. Never call `getStaticToken()` from client-side code

---

## Checklist

- [ ] `nexuvia.config.ts → authServer` has `clientId`, `clientSecret`, `tokenEndpoint`
- [ ] `.env.local` has `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`
- [ ] Token injection happens in `src/config/server.ts` — not directly in pages
- [ ] `auth-server` only imported in server-side code — never in client components
