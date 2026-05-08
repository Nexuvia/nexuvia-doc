---
title: Wiring @nexuvia/auth-client
sidebar_position: 6
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/auth-client`

`@nexuvia/auth-client` adds **Azure AD B2C user login** to your app. It needs **4 server routes**, a config bridge that self-registers, and a reactive wrapper.

This is the most route-heavy library — but each route is short. Pick your tab and copy.

---

## What you build (the 4 layers)

| Layer | What |
|-------|------|
| **Layer 1** — Config | `nexuvia.config.ts → authClient` |
| **Layer 1** — Bridge | `config/auth.ts` calls `registerAuthConfig()` (self-executes on import) |
| **Layer 2** — Server routes | **4 routes:** `/api/auth/login`, `/auth/callback`, `/api/auth/logout`, `/api/auth/session` |
| **Layer 3** — Wrapper | `AuthProvider` / `useAuth` composable / `AuthService` |
| **Layer 4** — UI | Login button, logout button, conditional UI based on `user` |

---

## Step 1 — Config + bridge

```ts
// nexuvia.config.ts
authClient: {
  session: {
    cookieName:      'nexuvia_session',
    nonceCookieName: 'nexuvia_nonce',
    storeCookieName: 'nexuvia_store',
    encryptionKey:   process.env.AUTH_ENCRYPTION_KEY || '',
    secureCookies:   process.env.NODE_ENV === 'production',
  },
  azure: {
    redirectUri: process.env.AZURE_REDIRECT_URI || '',
  },
},
```

`.env.local`:

```bash
AUTH_ENCRYPTION_KEY=use-a-random-32-character-string
AZURE_REDIRECT_URI=http://localhost:3000/auth/callback
```

Generate the key once and keep it stable across server restarts:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The bridge file `config/auth.ts` calls `registerAuthConfig()` at module load. See its full template in [Config Bridge](/wiring/config-bridge).

---

## Step 2 — Server routes (4 routes, any framework)

Every route handler **must start with** `import 'config/auth'` — that import side-effect registers the auth config before the handler runs.

### Route 1 — `/api/auth/login` (GET)

Generates Azure URL, sets short-lived nonce/store cookies, returns `{ redirectUrl }`.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/app/api/auth/login/route.ts
import '@/config/auth';   // ← MUST be first
import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthUrl, buildTempCookieHeader,
  getRegisteredAuthConfig, getAzureConfig,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const storeKey    = request.nextUrl.searchParams.get('store') || '';
  const authConfig  = getRegisteredAuthConfig();
  const azureConfig = await getAzureConfig(storeKey);
  const nonce       = crypto.randomUUID();
  const origin      = `${request.headers.get('x-forwarded-proto') || new URL(request.url).protocol}//${request.headers.get('host')}`;
  const state       = Buffer.from(JSON.stringify({ nonce, origin })).toString('base64url');
  const redirectUrl = buildAuthUrl(azureConfig, nonce, state);

  const secureCookies   = authConfig.session.secureCookies !== false;
  const nonceCookieName = authConfig.session.nonceCookieName ?? NONCE_COOKIE_NAME;
  const storeCookieName = authConfig.session.storeCookieName ?? STORE_COOKIE_NAME;

  const response = NextResponse.json({ redirectUrl });
  response.headers.append('Set-Cookie', buildTempCookieHeader(nonceCookieName, nonce,    secureCookies));
  response.headers.append('Set-Cookie', buildTempCookieHeader(storeCookieName, storeKey, secureCookies));
  return response;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/auth-login.ts
import '../config/auth';   // ← MUST be first
import { Router } from 'express';
import {
  buildAuthUrl, buildTempCookieHeader,
  getRegisteredAuthConfig, getAzureConfig,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

const router = Router();

router.get('/api/auth/login', async (req, res) => {
  const storeKey    = (req.query.store as string) || '';
  const authConfig  = getRegisteredAuthConfig();
  const azureConfig = await getAzureConfig(storeKey);
  const nonce       = crypto.randomUUID();
  const origin      = `${req.protocol}://${req.get('host')}`;
  const state       = Buffer.from(JSON.stringify({ nonce, origin })).toString('base64url');
  const redirectUrl = buildAuthUrl(azureConfig, nonce, state);

  const secureCookies   = authConfig.session.secureCookies !== false;
  const nonceCookieName = authConfig.session.nonceCookieName ?? NONCE_COOKIE_NAME;
  const storeCookieName = authConfig.session.storeCookieName ?? STORE_COOKIE_NAME;

  res.append('Set-Cookie', buildTempCookieHeader(nonceCookieName, nonce,    secureCookies));
  res.append('Set-Cookie', buildTempCookieHeader(storeCookieName, storeKey, secureCookies));
  res.json({ redirectUrl });
});

export default router;
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/auth/login.get.ts
import '~/config/auth';   // ← MUST be first
import {
  buildAuthUrl, buildTempCookieHeader,
  getRegisteredAuthConfig, getAzureConfig,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export default defineEventHandler(async (event) => {
  const { store: storeKey = '' } = getQuery(event);
  const authConfig  = getRegisteredAuthConfig();
  const azureConfig = await getAzureConfig(storeKey as string);
  const nonce       = crypto.randomUUID();
  const proto       = getHeader(event, 'x-forwarded-proto') || 'https';
  const host        = getHeader(event, 'host');
  const state       = Buffer.from(JSON.stringify({ nonce, origin: `${proto}://${host}` })).toString('base64url');
  const redirectUrl = buildAuthUrl(azureConfig, nonce, state);

  const secureCookies   = authConfig.session.secureCookies !== false;
  const nonceCookieName = authConfig.session.nonceCookieName ?? NONCE_COOKIE_NAME;
  const storeCookieName = authConfig.session.storeCookieName ?? STORE_COOKIE_NAME;

  appendHeader(event, 'Set-Cookie', buildTempCookieHeader(nonceCookieName, nonce, secureCookies));
  appendHeader(event, 'Set-Cookie', buildTempCookieHeader(storeCookieName, storeKey as string, secureCookies));
  return { redirectUrl };
});
```

</TabItem>
</Tabs>

### Route 2 — `/auth/callback` (GET)

:::danger Critical
The callback **must** live at `/auth/callback`, not `/api/auth/callback`. Azure registration uses this exact path. Your `proxy.ts` middleware **must skip** `/auth/` paths so they aren't rewritten with a language prefix.
:::

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/app/auth/callback/route.ts   ← NOT /api/auth/callback
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken, extractUserFromToken,
  encryptSession, buildSessionCookieHeader, buildClearCookieHeader, readCookie,
  getRegisteredAuthConfig, getAzureConfig, storeAccessToken,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get('code');
  const state  = searchParams.get('state');
  if (!code || !state) return NextResponse.redirect(new URL('/?auth_error=missing_params', request.url));

  const authConfig    = getRegisteredAuthConfig();
  const cookieHeader  = request.headers.get('cookie');
  const nonceName     = authConfig.session.nonceCookieName ?? NONCE_COOKIE_NAME;
  const storeName     = authConfig.session.storeCookieName ?? STORE_COOKIE_NAME;

  let parsed: { nonce: string; origin: string };
  try { parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')); }
  catch { return NextResponse.redirect(new URL('/?auth_error=invalid_state', request.url)); }

  const cookieNonce = readCookie(cookieHeader, nonceName);
  if (parsed.nonce !== cookieNonce) {
    return NextResponse.redirect(new URL('/?auth_error=csrf_failed', request.url));
  }

  const storeKey    = readCookie(cookieHeader, storeName) || '';
  const azureConfig = await getAzureConfig(storeKey);
  const token       = await exchangeCodeForToken(code, azureConfig);
  const user        = extractUserFromToken(token.id_token);

  if (token.access_token) {
    storeAccessToken(user.id, token.access_token, Date.now() + token.expires_in * 1000);
  }

  const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
  const encrypted = encryptSession({ user }, authConfig.session.encryptionKey);
  const response  = NextResponse.redirect(`${parsed.origin}/`);
  response.headers.append('Set-Cookie', buildSessionCookieHeader(encrypted, authConfig, SESSION_MAX_AGE_SECONDS));
  response.headers.append('Set-Cookie', buildClearCookieHeader(nonceName, authConfig.session.secureCookies !== false));
  response.headers.append('Set-Cookie', buildClearCookieHeader(storeName, authConfig.session.secureCookies !== false));
  return response;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/auth-callback.ts
import '../config/auth';
import { Router } from 'express';
import {
  exchangeCodeForToken, extractUserFromToken,
  encryptSession, buildSessionCookieHeader, buildClearCookieHeader, readCookie,
  getRegisteredAuthConfig, getAzureConfig, storeAccessToken,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

const router = Router();

router.get('/auth/callback', async (req, res) => {
  const code  = req.query.code  as string;
  const state = req.query.state as string;
  if (!code || !state) return res.redirect('/?auth_error=missing_params');

  const authConfig   = getRegisteredAuthConfig();
  const cookieHeader = req.headers.cookie ?? '';
  const nonceName    = authConfig.session.nonceCookieName ?? NONCE_COOKIE_NAME;
  const storeName    = authConfig.session.storeCookieName ?? STORE_COOKIE_NAME;

  let parsed: { nonce: string; origin: string };
  try { parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')); }
  catch { return res.redirect('/?auth_error=invalid_state'); }

  if (parsed.nonce !== readCookie(cookieHeader, nonceName)) {
    return res.redirect('/?auth_error=csrf_failed');
  }

  const storeKey    = readCookie(cookieHeader, storeName) || '';
  const azureConfig = await getAzureConfig(storeKey);
  const token       = await exchangeCodeForToken(code, azureConfig);
  const user        = extractUserFromToken(token.id_token);

  if (token.access_token) {
    storeAccessToken(user.id, token.access_token, Date.now() + token.expires_in * 1000);
  }

  const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
  const encrypted = encryptSession({ user }, authConfig.session.encryptionKey);
  res.append('Set-Cookie', buildSessionCookieHeader(encrypted, authConfig, SESSION_MAX_AGE_SECONDS));
  res.append('Set-Cookie', buildClearCookieHeader(nonceName, authConfig.session.secureCookies !== false));
  res.append('Set-Cookie', buildClearCookieHeader(storeName, authConfig.session.secureCookies !== false));
  res.redirect(`${parsed.origin}/`);
});

export default router;
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/routes/auth/callback.get.ts   ← NOT server/api/...
import '~/config/auth';
import {
  exchangeCodeForToken, extractUserFromToken,
  encryptSession, buildSessionCookieHeader, buildClearCookieHeader, readCookie,
  getRegisteredAuthConfig, getAzureConfig, storeAccessToken,
  NONCE_COOKIE_NAME, STORE_COOKIE_NAME,
} from '@nexuvia/auth-client';

export default defineEventHandler(async (event) => {
  const { code, state } = getQuery(event) as { code?: string; state?: string };
  if (!code || !state) return sendRedirect(event, '/?auth_error=missing_params');

  const authConfig   = getRegisteredAuthConfig();
  const cookieHeader = getHeader(event, 'cookie') || '';
  const nonceName    = authConfig.session.nonceCookieName ?? NONCE_COOKIE_NAME;
  const storeName    = authConfig.session.storeCookieName ?? STORE_COOKIE_NAME;

  let parsed: { nonce: string; origin: string };
  try { parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')); }
  catch { return sendRedirect(event, '/?auth_error=invalid_state'); }

  if (parsed.nonce !== readCookie(cookieHeader, nonceName)) {
    return sendRedirect(event, '/?auth_error=csrf_failed');
  }

  const storeKey    = readCookie(cookieHeader, storeName) || '';
  const azureConfig = await getAzureConfig(storeKey);
  const token       = await exchangeCodeForToken(code, azureConfig);
  const user        = extractUserFromToken(token.id_token);

  if (token.access_token) {
    storeAccessToken(user.id, token.access_token, Date.now() + token.expires_in * 1000);
  }

  const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
  const encrypted = encryptSession({ user }, authConfig.session.encryptionKey);
  appendHeader(event, 'Set-Cookie', buildSessionCookieHeader(encrypted, authConfig, SESSION_MAX_AGE_SECONDS));
  appendHeader(event, 'Set-Cookie', buildClearCookieHeader(nonceName, authConfig.session.secureCookies !== false));
  appendHeader(event, 'Set-Cookie', buildClearCookieHeader(storeName, authConfig.session.secureCookies !== false));
  return sendRedirect(event, `${parsed.origin}/`);
});
```

</TabItem>
</Tabs>

### Route 3 — `/api/auth/session` (GET)

Returns `SessionUser | null` from the encrypted session cookie.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/app/api/auth/session/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getRegisteredAuthConfig } from '@nexuvia/auth-client';

export async function GET(request: NextRequest) {
  const user = getSession(request.headers.get('cookie'), getRegisteredAuthConfig());
  return NextResponse.json(user);
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/auth-session.ts
import '../config/auth';
import { Router } from 'express';
import { getSession, getRegisteredAuthConfig } from '@nexuvia/auth-client';

const router = Router();
router.get('/api/auth/session', (req, res) => {
  const user = getSession(req.headers.cookie ?? null, getRegisteredAuthConfig());
  res.json(user);
});
export default router;
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/auth/session.get.ts
import '~/config/auth';
import { getSession, getRegisteredAuthConfig } from '@nexuvia/auth-client';

export default defineEventHandler((event) => {
  return getSession(getHeader(event, 'cookie') || null, getRegisteredAuthConfig());
});
```

</TabItem>
</Tabs>

### Route 4 — `/api/auth/logout` (POST)

Clears session, returns Azure logout URL.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/app/api/auth/logout/route.ts
import '@/config/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildLogoutUrl, buildClearCookieHeader,
  getSession, getRegisteredAuthConfig, getAzureConfig,
  clearAccessToken, SESSION_COOKIE_NAME,
} from '@nexuvia/auth-client';

export async function POST(request: NextRequest) {
  const authConfig = getRegisteredAuthConfig();
  const storeKey   = request.nextUrl.searchParams.get('store') || '';
  const cookie     = request.headers.get('cookie');
  const user       = getSession(cookie, authConfig);
  if (user?.id) clearAccessToken(user.id);

  const azureConfig = await getAzureConfig(storeKey);
  const origin      = `${request.headers.get('x-forwarded-proto') || new URL(request.url).protocol}//${request.headers.get('host')}`;
  const redirectUrl = buildLogoutUrl(azureConfig, `${origin}/`);
  const cookieName  = authConfig.session.cookieName ?? SESSION_COOKIE_NAME;

  const response = NextResponse.json({ redirectUrl });
  response.headers.append('Set-Cookie', buildClearCookieHeader(cookieName, authConfig.session.secureCookies !== false));
  return response;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/auth-logout.ts
import '../config/auth';
import { Router } from 'express';
import {
  buildLogoutUrl, buildClearCookieHeader,
  getSession, getRegisteredAuthConfig, getAzureConfig,
  clearAccessToken, SESSION_COOKIE_NAME,
} from '@nexuvia/auth-client';

const router = Router();
router.post('/api/auth/logout', async (req, res) => {
  const authConfig = getRegisteredAuthConfig();
  const storeKey   = (req.query.store as string) || '';
  const user       = getSession(req.headers.cookie ?? null, authConfig);
  if (user?.id) clearAccessToken(user.id);

  const azureConfig = await getAzureConfig(storeKey);
  const origin      = `${req.protocol}://${req.get('host')}`;
  const redirectUrl = buildLogoutUrl(azureConfig, `${origin}/`);
  const cookieName  = authConfig.session.cookieName ?? SESSION_COOKIE_NAME;

  res.append('Set-Cookie', buildClearCookieHeader(cookieName, authConfig.session.secureCookies !== false));
  res.json({ redirectUrl });
});
export default router;
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/auth/logout.post.ts
import '~/config/auth';
import {
  buildLogoutUrl, buildClearCookieHeader,
  getSession, getRegisteredAuthConfig, getAzureConfig,
  clearAccessToken, SESSION_COOKIE_NAME,
} from '@nexuvia/auth-client';

export default defineEventHandler(async (event) => {
  const authConfig = getRegisteredAuthConfig();
  const { store: storeKey = '' } = getQuery(event);
  const user = getSession(getHeader(event, 'cookie') || null, authConfig);
  if (user?.id) clearAccessToken(user.id);

  const azureConfig = await getAzureConfig(storeKey as string);
  const proto       = getHeader(event, 'x-forwarded-proto') || 'https';
  const host        = getHeader(event, 'host');
  const redirectUrl = buildLogoutUrl(azureConfig, `${proto}://${host}/`);
  const cookieName  = authConfig.session.cookieName ?? SESSION_COOKIE_NAME;

  appendHeader(event, 'Set-Cookie', buildClearCookieHeader(cookieName, authConfig.session.secureCookies !== false));
  return { redirectUrl };
});
```

</TabItem>
</Tabs>

---

## Step 3 — Reactive wrapper (Layer 3)

<Tabs groupId="framework">
<TabItem value="react" label="React">

```tsx
// src/providers/auth-provider.tsx
'use client';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { SessionUser } from '@nexuvia/auth-client';

interface AuthContextValue {
  user:       SessionUser | null;
  isLoggedIn: boolean;
  isLoading:  boolean;
  login:      (storeKey: string) => void;
  logout:     (storeKey: string) => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children, initialUser,
  loginPath   = '/api/auth/login',
  logoutPath  = '/api/auth/logout',
  sessionPath = '/api/auth/session',
}: {
  children: ReactNode; initialUser?: SessionUser | null;
  loginPath?: string; logoutPath?: string; sessionPath?: string;
}) {
  // Seed state from server-supplied value — useState initialisers handle this,
  // so no sync setState inside useEffect is needed (which would cause React warnings).
  const [user, setUser]    = useState<SessionUser | null>(initialUser ?? null);
  const [loading, setLoad] = useState(initialUser === undefined);

  useEffect(() => {
    if (initialUser !== undefined) return;  // already seeded by useState initialiser
    fetch(sessionPath)
      .then(r => r.ok ? r.json() as Promise<SessionUser> : null)
      .then(setUser)
      .finally(() => setLoad(false));
  }, [initialUser, sessionPath]);

  const login  = useCallback((s: string) => {
    fetch(`${loginPath}?store=${encodeURIComponent(s)}`)
      .then(r => r.json() as Promise<{ redirectUrl?: string }>)
      .then(d => { if (d?.redirectUrl) window.location.href = d.redirectUrl; });
  }, [loginPath]);

  const logout = useCallback((s: string) => {
    fetch(`${logoutPath}?store=${encodeURIComponent(s)}`, { method: 'POST' })
      .then(r => r.json() as Promise<{ redirectUrl?: string }>)
      .then(d => { setUser(null); window.location.href = d?.redirectUrl ?? '/'; });
  }, [logoutPath]);

  return (
    <Ctx.Provider value={{ user, isLoggedIn: user !== null, isLoading: loading, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```ts
// composables/useAuth.ts
import { ref } from 'vue';
import type { SessionUser } from '@nexuvia/auth-client';

const user      = ref<SessionUser | null>(null);
const isLoading = ref(true);

async function refresh() {
  isLoading.value = true;
  try {
    const res = await fetch('/api/auth/session');
    user.value = res.ok ? await res.json() : null;
  } finally { isLoading.value = false; }
}
refresh();   // initial fetch on app load

export function useAuth() {
  return {
    user, isLoading,
    isLoggedIn: () => user.value !== null,
    login:  (s: string) => fetch(`/api/auth/login?store=${s}`)
              .then(r => r.json()).then(d => d?.redirectUrl && (location.href = d.redirectUrl)),
    logout: (s: string) => fetch(`/api/auth/logout?store=${s}`, { method: 'POST' })
              .then(r => r.json()).then(d => { user.value = null; location.href = d?.redirectUrl ?? '/'; }),
    refresh,
  };
}
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
// src/app/services/auth.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { SessionUser } from '@nexuvia/auth-client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user$       = new BehaviorSubject<SessionUser | null>(null);
  readonly isLoading$  = new BehaviorSubject<boolean>(true);

  constructor() { this.refresh(); }

  async refresh() {
    this.isLoading$.next(true);
    try {
      const res = await fetch('/api/auth/session');
      this.user$.next(res.ok ? await res.json() : null);
    } finally { this.isLoading$.next(false); }
  }

  async login(storeKey: string) {
    const res = await fetch(`/api/auth/login?store=${encodeURIComponent(storeKey)}`);
    const data = await res.json();
    if (data?.redirectUrl) window.location.href = data.redirectUrl;
  }

  async logout(storeKey: string) {
    const res = await fetch(`/api/auth/logout?store=${encodeURIComponent(storeKey)}`, { method: 'POST' });
    const data = await res.json();
    this.user$.next(null);
    window.location.href = data?.redirectUrl ?? '/';
  }
}
```

</TabItem>
</Tabs>

---

## Step 4 — Use it in components

```ts
// React: const { user, isLoggedIn, login, logout } = useAuth();
// Vue:   const { user, login, logout } = useAuth();
// NG:    public auth = inject(AuthService); → auth.user$ | async
```

```tsx
// React example
const { user, isLoggedIn, login, logout } = useAuth();
const { storeKey } = useStore();

return isLoggedIn
  ? <button onClick={() => logout(storeKey)}>Sign out ({user?.firstName})</button>
  : <button onClick={() => login(storeKey)}>Sign in</button>;
```

---

## Critical wiring rules

| Rule | Why |
|------|-----|
| `import 'config/auth'` is the **first line** of every auth route | Triggers `registerAuthConfig()` |
| Callback at `/auth/callback`, **NOT** `/api/auth/callback` | Matches Azure registration |
| Your routing/middleware **skips** paths starting with `/auth/` | Prevents callback URL being rewritten |
| Layer 3 wrapper is **outside** Cart wrapper | `mergeCarts(userId)` needs `useAuth().user.id` |
| `AUTH_ENCRYPTION_KEY` is stable across server restarts | Sessions encrypted on one server must decrypt on another |
| For SSR (Next.js / Nuxt / Angular Universal), pass `initialUser` from server layout | Avoids flash-of-unauthenticated content |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `getRegisteredAuthConfig: no config registered` | Forgot `import 'config/auth'` | Add as first line of route handler |
| Callback returns `?auth_error=csrf_failed` | Nonce cookie was lost | Check proxy/middleware skips `/auth/` |
| Callback returns `?auth_error=token_exchange_failed` | Wrong Azure config | Verify `AZURE_REDIRECT_URI` matches Azure's registered URI |
| User logged out after page refresh | `AUTH_ENCRYPTION_KEY` regenerates | Use a stable env var |
| `useAuth() must be used inside <AuthProvider>` | Missing Layer 3 wrapper | Wrap your app with `<AuthProvider>` |

---

## Checklist

- [ ] All 4 routes exist: `/api/auth/login`, `/auth/callback`, `/api/auth/logout`, `/api/auth/session`
- [ ] Callback is at `/auth/callback`, NOT `/api/auth/callback`
- [ ] `import 'config/auth'` is the first line of every auth route
- [ ] Routing layer skips `/auth/` paths
- [ ] `AUTH_ENCRYPTION_KEY` is set and stable
- [ ] `AZURE_REDIRECT_URI` matches Azure's registered URI
- [ ] Auth wrapper is **outside** the Cart wrapper in your provider tree
- [ ] For SSR: server layout reads session and passes `initialUser` to the wrapper
