---
title: "@nexuvia/auth-client"
sidebar_position: 11
---

# @nexuvia/auth-client

User authentication via Azure AD B2C — Authorization Code flow with encrypted httpOnly session cookie.

**Pure Node.js — no React, no Next.js imports in the library. React context lives in your app's providers layer.**

---

## Installation

```bash
npm install @nexuvia/auth-client @nexuvia/core
```

---

## What this library does

Manages the full OAuth 2.0 Authorization Code flow with Azure AD B2C:

1. Redirect user to Azure authorize endpoint (with CSRF nonce)
2. Azure redirects back with authorization code
3. Exchange code for ID token + access token
4. Store user identity in encrypted httpOnly session cookie
5. Store Azure access token in server memory (never in cookie)

This is **user auth** — not machine-to-machine. For server-to-backend tokens, see [`@nexuvia/auth-server`](/packages/auth-server).

---

## Security model

| Data | Storage | Protection |
|------|---------|-----------|
| User identity (`SessionUser`) | httpOnly cookie | AES-256-GCM encrypted, random IV per encryption |
| Azure access token | Server memory only | Never leaves server |
| CSRF nonce | httpOnly cookie (10 min) | Short-lived, httpOnly |

The cookie only holds enough information to identify the user (`id`, `email`, `name`). The full Azure access token stays in server memory and is looked up by user ID when needed for API calls.

---

## What's exported

| Export | What it is |
|--------|-----------|
| `registerAuthConfig` | Register per-store Azure config |
| `getRegisteredAuthConfig` | Retrieve the registered config (throws `ConfigError` if not registered) |
| `assertConfigRegistered` | Guard — throws actionable `ConfigError` if `registerAuthConfig()` was never called |
| `getAzureConfig` | Get Azure credentials for a store |
| `getSession` | Decrypt session cookie → `SessionUser \| null` |
| `encryptSession` | Encrypt a `SessionUser` for the cookie |
| `decryptSession` | Decrypt the cookie value |
| `buildAuthUrl` | Generate Azure authorize URL |
| `buildLogoutUrl` | Generate Azure logout URL |
| `exchangeCodeForToken` | Exchange authorization code for tokens |
| `extractUserFromToken` | Parse JWT → `SessionUser` |
| `storeAccessToken` | Store Azure token in server memory |
| `getAccessToken` | Retrieve Azure token from server memory |
| `clearAccessToken` | Remove Azure token from server memory |
| `buildSessionCookieHeader` | Build `Set-Cookie` header for session |
| `buildClearCookieHeader` | Build `Set-Cookie` header to clear session |
| `buildTempCookieHeader` | Build short-lived cookie (for CSRF nonce) |
| `readCookie` | Parse a cookie header string |
| Cookie name constants | `SESSION_COOKIE`, `NONCE_COOKIE`, `STORE_COOKIE` |

---

## Setup — Next.js

### Step 1 — Config

```ts
// nexuvia.config.ts
authClient: {
  session: {
    encryptionKey:   process.env.AUTH_ENCRYPTION_KEY || '',  // required
    secureCookies:   process.env.NODE_ENV === 'production',
    // cookieName, nonceCookieName, storeCookieName — optional, defaults apply
  },
  // storeConfigProvider is required — returns per-store Azure AD B2C credentials
  // storeConfigProvider: async (storeKey) => getAzureStoreConfig(storeKey),
},
```

```bash
# .env.local
AUTH_ENCRYPTION_KEY=a-random-32-character-string-here
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 2 — Self-register on import

Create `src/config/auth.ts`:

```ts
import { registerAuthConfig } from '@nexuvia/auth-client';
import type { AzureStoreConfig } from '@nexuvia/auth-client';
import config from '../../nexuvia.config';

// Returns per-store Azure AD B2C credentials — redirectUri lives here, not in nexuvia.config.ts
async function getAzureStoreConfig(storeKey: string): Promise<AzureStoreConfig> {
  // Fetch credentials from your backend or environment per store
  return {
    authority:    process.env[`AZURE_AUTHORITY_${storeKey.toUpperCase()}`] || '',
    clientId:     process.env[`AZURE_CLIENT_ID_${storeKey.toUpperCase()}`] || '',
    clientSecret: process.env[`AZURE_CLIENT_SECRET_${storeKey.toUpperCase()}`] || '',
    scope:        `openid profile offline_access`,
    redirectUri:  process.env[`AZURE_REDIRECT_URI_${storeKey.toUpperCase()}`] || '',
  };
}

registerAuthConfig({
  session:             config.authClient.session,
  storeConfigProvider: getAzureStoreConfig,
});
```

Import this file at the top of every auth-related route handler:

```ts
import '@/config/auth'; // registers config before handler runs
```

### Step 3 — Login route

```ts
// src/app/api/auth/login/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getRegisteredAuthConfig, getAzureConfig, buildAuthUrl, buildTempCookieHeader } from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const config      = getRegisteredAuthConfig();
  const storeKey    = request.nextUrl.searchParams.get('store') ?? 'ae';
  const azureConfig = await getAzureConfig(storeKey);

  const nonce      = crypto.randomUUID();
  const { url }    = buildAuthUrl(azureConfig, config, nonce, storeKey);

  const headers = new Headers({ Location: url });
  headers.append('Set-Cookie', buildTempCookieHeader(config.session.nonceCookieName, nonce, config));
  headers.append('Set-Cookie', buildTempCookieHeader(config.session.storeCookieName, storeKey, config));

  return new NextResponse(null, { status: 302, headers });
}
```

### Step 4 — Callback route

:::warning Important
The callback must be at `/auth/callback` — **not** `/api/auth/callback`. Your middleware/proxy must skip `/auth/` paths to prevent language prefix rewriting.
:::

```ts
// src/app/auth/callback/route.ts  ← NOT /api/auth/callback
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRegisteredAuthConfig, getAzureConfig, exchangeCodeForToken,
  extractUserFromToken, storeAccessToken, encryptSession,
  buildSessionCookieHeader, readCookie,
} from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const config   = getRegisteredAuthConfig();
  const url      = new URL(request.url);
  const code     = url.searchParams.get('code')!;
  const cookie   = request.headers.get('cookie') ?? '';
  const storeKey = readCookie(cookie, config.session.storeCookieName) ?? 'ae';

  const azureConfig = await getAzureConfig(storeKey);
  const token       = await exchangeCodeForToken(code, azureConfig, config);
  const user        = extractUserFromToken(token.id_token);

  if (token.access_token) {
    storeAccessToken(user.id, token.access_token, Date.now() + token.expires_in * 1000);
  }

  const sessionHeader = buildSessionCookieHeader(
    await encryptSession(user, config), config
  );

  return NextResponse.redirect(new URL('/', request.url), {
    headers: { 'Set-Cookie': sessionHeader },
  });
}
```

### Step 5 — Session route

```ts
// src/app/api/auth/session/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getRegisteredAuthConfig } from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const config = getRegisteredAuthConfig();
  const user   = getSession(request.headers.get('cookie'), config);
  return NextResponse.json(user);
}
```

### Step 6 — Logout route

```ts
// src/app/api/auth/logout/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getSession, getRegisteredAuthConfig, getAzureConfig,
  buildLogoutUrl, buildClearCookieHeader, clearAccessToken,
} from '@nexuvia/auth-client';

export async function POST(request: NextRequest) {
  const config    = getRegisteredAuthConfig();
  const cookie    = request.headers.get('cookie') ?? '';
  const user      = getSession(cookie, config);
  const storeKey  = readCookie(cookie, config.session.storeCookieName) ?? 'ae';

  if (user?.id) clearAccessToken(user.id);

  const azureConfig = await getAzureConfig(storeKey);
  const { url }     = buildLogoutUrl(azureConfig, config);

  const headers = new Headers();
  headers.append('Set-Cookie', buildClearCookieHeader(config.session.cookieName, config));

  return NextResponse.json({ redirectUrl: url }, { headers });
}
```

### Step 7 — Read session in layout

```tsx
// src/app/[lang]/layout.tsx
import { getSession, getRegisteredAuthConfig } from '@nexuvia/auth-client';
import { headers } from 'next/headers';

export default async function Layout({ children }) {
  const hdrs        = await headers();
  const config      = getRegisteredAuthConfig();
  const initialUser = getSession(hdrs.get('cookie'), config);

  return (
    <AuthProvider initialUser={initialUser}>
      {children}
    </AuthProvider>
  );
}
```

---

## `SessionUser` type

```ts
interface SessionUser {
  id:    string;  // Azure object ID
  email: string;
  name:  string;
  store: string;  // store key (e.g. 'ae')
}
```

---

## Checklist

- [ ] `nexuvia.config.ts → authClient.session.encryptionKey` set (32+ chars)
- [ ] `authClient.storeConfigProvider` implemented — returns `AzureStoreConfig` per store including `redirectUri`
- [ ] `.env.local` has `AUTH_ENCRYPTION_KEY`
- [ ] `import '@/config/auth'` at the top of every auth route handler
- [ ] Auth callback route is at `/auth/callback` (NOT `/api/auth/callback`)
- [ ] Middleware / proxy skips `/auth/` paths
- [ ] `storeAccessToken` called in callback, `clearAccessToken` called in logout
- [ ] `getSession()` called in root layout to pass `initialUser` to `AuthProvider`
