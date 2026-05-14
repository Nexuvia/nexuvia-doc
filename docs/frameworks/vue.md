---
title: Vue 3
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

## Vue 3 — Complete Wiring Guide

This guide covers two setups:

- **Part A — Vue SPA (Vite)**: client-side app with a separate Node.js/Express backend
- **Part B — Nuxt 3**: SSR-enabled app with integrated server routes

:::warning Backend always required
Two things can never run in the browser:

1. **`@nexuvia/auth-server`** — the OAuth `client_secret` must never reach the browser
2. **Cart CORS** — SAP OCC rejects direct browser calls

For a Vue SPA you need an Express (or Hono) backend alongside Vite. For Nuxt 3, use `server/api/` routes — they run server-side automatically.
:::

---

## Prerequisites

| Package | Purpose |
| ------- | ------- |
| `@nexuvia/vue` | Plugin + composables |
| `@nexuvia/app` | `NexuviaApp` singleton (server-side only) |
| `@nexuvia/auth-server` | Server-to-backend OAuth tokens (server-side only) |
| `@nexuvia/auth-client` | User auth — Azure AD B2C (server-side only) |
| `@nexuvia/cms` | `CmsClient` + component registry |

```bash
# Frontend (client bundle)
pnpm add @nexuvia/vue @nexuvia/cms

# Backend / Nuxt server
pnpm add @nexuvia/app @nexuvia/auth-server @nexuvia/auth-client
```

---

## Part A — Vue SPA (Vite)

### Project structure

```text
my-vue-app/
  nexuvia.config.ts          ← single source of truth for env vars
  vite.config.ts
  .env                       ← VITE_* public vars only
  .env.server                ← OAUTH_CLIENT_SECRET, AUTH_ENCRYPTION_KEY (never commit)
  src/
    main.ts                  ← createApp + plugin registration
    App.vue
    plugins/
      cms-defaults.ts        ← register CMS components once
    components/
      cms/
        CmsSlotRenderer.vue
        defaults/
          CmsHeader.vue
          CmsFooter.vue
          CmsBanners.vue
    pages/
      index.vue
      p/[code].vue           ← product detail
      search.vue
      cart.vue
  server/
    index.ts                 ← Express entry
    config/
      auth.ts                ← registers auth config (self-registers on import)
    routes/
      auth.ts                ← login / callback / session / logout
      cart.ts                ← GET / POST / PATCH / DELETE /api/cart
```

---

### `nexuvia.config.ts`

```ts
// nexuvia.config.ts
import type { NexuviaConfig } from '@nexuvia/app';

const config: NexuviaConfig = {
  stores: {
    default: {
      baseSite:        process.env.HYBRIS_BASE_SITE ?? 'my-site',
      hybrisHost:      process.env.HYBRIS_HOST ?? 'occ.example.com',
      defaultLanguage: 'en',
      currency:        'USD',
      languages:       ['en'],
    },
  },
  cms: {
    cmsBasePath: process.env.CMS_BASE_PATH ?? '/cms/v2',
  },
  auth: {
    clientId:     process.env.OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET ?? '',  // server-side only
    tokenUrl:     process.env.OAUTH_TOKEN_URL ?? '',
    stores: {
      default: {
        azureTenantId:    process.env.AZURE_TENANT_ID ?? '',
        azureClientId:    process.env.AZURE_CLIENT_ID ?? '',
        azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
        policyName:       process.env.AZURE_POLICY ?? 'B2C_1_SignUpSignIn',
        redirectUri:      process.env.AZURE_REDIRECT_URI ?? 'http://localhost:5173/auth/callback',
        postLogoutUri:    process.env.AZURE_POST_LOGOUT_URI ?? 'http://localhost:5173',
        encryptionKey:    process.env.AUTH_ENCRYPTION_KEY ?? '',
        cookieName:       'nexuvia_session',
        cookieSecure:     process.env.NODE_ENV === 'production',
      },
    },
  },
};

export default config;
```

---

### `src/main.ts`

```ts
// src/main.ts
import { createApp }           from 'vue';
import { createNexuviaPlugin } from '@nexuvia/vue';
import App                     from './App.vue';
import config                  from '../nexuvia.config';
import './plugins/cms-defaults';  // register CMS components before mount

const store = config.stores.default;

const app = createApp(App);

app.use(createNexuviaPlugin({
  storeKey:         'default',
  language:         store.defaultLanguage,
  storeConfig:      store,
  cartClientConfig: {
    baseSite: store.baseSite,
    language: store.defaultLanguage,
    apiBase:  import.meta.env.VITE_API_BASE + '/api/cart',
  },
  gtmContainerId: import.meta.env.VITE_GTM_ID ?? '',
}));

app.mount('#app');
```

`.env`:

```text
VITE_API_BASE=http://localhost:3001
VITE_GTM_ID=GTM-XXXXXXX
```

`.env.server` (never commit):

```text
HYBRIS_HOST=occ.example.com
HYBRIS_BASE_SITE=my-site
OAUTH_CLIENT_ID=client_id
OAUTH_CLIENT_SECRET=client_secret
OAUTH_TOKEN_URL=https://occ.example.com/authorizationserver/oauth/token
CMS_BASE_PATH=/virginws/v2
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-azure-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_POLICY=B2C_1_SignUpSignIn
AZURE_REDIRECT_URI=http://localhost:5173/auth/callback
AZURE_POST_LOGOUT_URI=http://localhost:5173
AUTH_ENCRYPTION_KEY=32-char-random-string
```

---

### `src/plugins/cms-defaults.ts`

```ts
// src/plugins/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import CmsHeader  from '@/components/cms/defaults/CmsHeader.vue';
import CmsFooter  from '@/components/cms/defaults/CmsFooter.vue';
import CmsBanners from '@/components/cms/defaults/CmsBanners.vue';

componentRegistry.register('CMSHeaderComponent',  CmsHeader  as any);
componentRegistry.register('CMSFooterComponent',  CmsFooter  as any);
componentRegistry.register('CMSBannersComponent', CmsBanners as any);
```

---

### `src/components/cms/CmsSlotRenderer.vue`

```vue
<!-- src/components/cms/CmsSlotRenderer.vue -->
<script setup lang="ts">
import { computed }           from 'vue';
import { componentRegistry }  from '@nexuvia/cms/client';
import type { CMSPage }       from '@nexuvia/cms';

const props = defineProps<{ page: CMSPage | null; position: string }>();

const components = computed(() => {
  if (!props.page) return [];
  const slot = props.page.contentSlots.find(s => s.position === props.position);
  return slot?.components ?? [];
});
</script>

<template>
  <component
    v-for="c in components"
    :key="c.uid"
    :is="componentRegistry.resolve(c.typeCode)"
    :component="c"
  />
</template>
```

---

### Composable usage

All composables are imported from `@nexuvia/vue`.

#### `useCart` — add-to-cart button

```vue
<!-- src/components/AddToCartButton.vue -->
<script setup lang="ts">
import { useCart } from '@nexuvia/vue';

const props  = defineProps<{ productCode: string }>();
const { cart, isLoading, addItem } = useCart();
</script>

<template>
  <button :disabled="isLoading" @click="addItem(props.productCode)">
    {{ isLoading ? 'Adding…' : 'Add to Cart' }}
  </button>
</template>
```

#### `useCart` — cart badge

```vue
<!-- src/components/CartBadge.vue -->
<script setup lang="ts">
import { useCart } from '@nexuvia/vue';

const { cart } = useCart();
</script>

<template>
  <span>{{ cart?.totalItems ?? 0 }}</span>
</template>
```

#### `useAuth` — user menu

```vue
<!-- src/components/UserMenu.vue -->
<script setup lang="ts">
import { useAuth } from '@nexuvia/vue';

const { user, login, logout } = useAuth();
</script>

<template>
  <button v-if="!user" @click="login('default')">Sign in</button>
  <div v-else>
    <span>Hello, {{ user.name }}</span>
    <button @click="logout('default')">Sign out</button>
  </div>
</template>
```

#### `useStore` — currency / language display

```vue
<script setup lang="ts">
import { useStore } from '@nexuvia/vue';

const { storeKey, language, storeConfig } = useStore();
</script>

<template>
  <span>{{ storeConfig.currency }} — {{ language.toUpperCase() }}</span>
</template>
```

#### `useAnalytics`

```vue
<script setup lang="ts">
import { useAnalytics } from '@nexuvia/vue';

const { track } = useAnalytics();

function onProductClick(code: string, name: string) {
  track({ type: 'productClick', code, name });
}
</script>
```

#### `useSmartEdit`

```vue
<script setup lang="ts">
import { useSmartEdit } from '@nexuvia/vue';

const { isPreviewMode } = useSmartEdit();
</script>
```

---

### Server — Express backend

The Express server mirrors the [React guide backend](/frameworks/react) exactly. Only key differences are shown here.

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
import 'server/config/auth';   // must be first — registers auth config

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
  const storeKey = (req.query.store as string) ?? 'default';
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
  const code     = req.query.code as string;
  const storeKey = (req.query.state as string)?.split(':')[0] ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);

  try {
    const { user } = await exchangeCodeForToken(code, config.azure, config);
    res
      .setHeader('Set-Cookie', [
        buildSessionCookieHeader(await encryptSession(user, config), config),
        buildClearCookieHeader(NONCE_COOKIE_NAME, config.cookieSecure),
      ])
      .redirect('/');
  } catch (err) {
    res.redirect('/login?error=auth_failed');
  }
});

// GET /api/auth/session
router.get('/session', async (req, res) => {
  const storeKey = (req.query.store as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const cookies  = parseCookies(req.headers.cookie ?? '');
  const user     = await getSession(cookies[config.cookieName] ?? '', config);
  res.json(user ?? null);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const storeKey = (req.body?.store as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
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
import { Router }         from 'express';
import { NexuviaApp }     from '@nexuvia/app';
import config             from '../../nexuvia.config';

const app    = NexuviaApp.getInstance(config);
const router = Router();

async function getAdapter(storeKey: string, lang: string) {
  const ctx = await app.forRequest(storeKey, lang);
  return ctx.cart.server;
}

// GET /api/cart?store=default&lang=en
router.get('/', async (req, res) => {
  const storeKey  = (req.query.store as string) ?? 'default';
  const lang      = (req.query.lang  as string) ?? 'en';
  const cartId    = req.cookies?.cart_id;
  const adapter   = await getAdapter(storeKey, lang);
  const cart      = cartId ? await adapter.getCart(cartId) : null;
  res.json(cart);
});

// POST /api/cart — create or add entry
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

// PATCH /api/cart — update entry quantity
router.patch('/', async (req, res) => {
  const { store = 'default', lang = 'en', cartId, entryNumber, quantity } = req.body;
  const adapter = await getAdapter(store, lang);
  await adapter.updateCartEntry(cartId, entryNumber, quantity);
  const cart = await adapter.getCart(cartId);
  res.json(cart);
});

// DELETE /api/cart — remove entry
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
import express       from 'express';
import cookieParser  from 'cookie-parser';
import cors          from 'cors';
import authRoutes    from './routes/auth';
import cartRoutes    from './routes/cart';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({
  origin:      process.env.VITE_APP_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Auth callback MUST be mounted at /auth/callback (no /api prefix)
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
    "dev": "concurrently \"vite\" \"tsx watch server/index.ts --env-file=.env.server\""
  }
}
```

---

## Part B — Nuxt 3

Nuxt 3 integrates the server and client in one project. Server routes in `server/api/` run server-side only.

### Nuxt project structure

```text
my-nuxt-app/
  nexuvia.config.ts
  nuxt.config.ts
  .env                         ← NUXT_PUBLIC_* + server-side secrets (Nuxt runtime config)
  plugins/
    nexuvia.client.ts          ← Vue plugin (client-side only)
    cms-defaults.client.ts     ← CMS component registration
  server/
    config/
      auth.ts                  ← registerAuthConfig (imported by every auth route)
    api/
      auth/
        login.get.ts
        callback.get.ts        ← at /api/auth/callback (Nuxt can't easily skip the /api prefix)
        session.get.ts
        logout.post.ts
      cart/
        index.get.ts
        index.post.ts
        index.patch.ts
        index.delete.ts
  pages/
    index.vue
    p/[code].vue
    search.vue
    cart.vue
  components/
    cms/
      CmsSlotRenderer.vue
      defaults/
        CmsHeader.vue
        CmsFooter.vue
```

---

### `nuxt.config.ts`

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    // Server-only (not exposed to browser)
    hybrisHost:        '',
    oauthClientSecret: '',
    authEncryptionKey: '',
    azureClientSecret: '',

    // Exposed to browser via useRuntimeConfig().public
    public: {
      apiBase:       process.env.NUXT_PUBLIC_API_BASE ?? '',
      gtmId:         process.env.NUXT_PUBLIC_GTM_ID   ?? '',
      hybrisBaseSite: process.env.NUXT_PUBLIC_BASE_SITE ?? 'my-site',
    },
  },
});
```

`.env`:

```text
NUXT_PUBLIC_API_BASE=http://localhost:3000
NUXT_PUBLIC_GTM_ID=GTM-XXXXXXX
NUXT_PUBLIC_BASE_SITE=my-site
NUXT_HYBRIS_HOST=occ.example.com
NUXT_OAUTH_CLIENT_SECRET=client_secret
NUXT_AUTH_ENCRYPTION_KEY=32-char-random-string
NUXT_AZURE_CLIENT_SECRET=azure-secret
```

---

### `plugins/nexuvia.client.ts`

```ts
// plugins/nexuvia.client.ts
import { createNexuviaPlugin } from '@nexuvia/vue';

export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig();
  const baseSite      = runtimeConfig.public.hybrisBaseSite;

  nuxtApp.vueApp.use(createNexuviaPlugin({
    storeKey:         'default',
    language:         'en',
    storeConfig: {
      baseSite,
      hybrisHost:      '',   // not needed client-side — cart goes through /api/cart
      defaultLanguage: 'en',
      currency:        'USD',
      languages:       ['en'],
    },
    cartClientConfig: {
      baseSite,
      language: 'en',
      apiBase:  runtimeConfig.public.apiBase + '/api/cart',
    },
    gtmContainerId: runtimeConfig.public.gtmId ?? '',
  }));
});
```

---

### `plugins/cms-defaults.client.ts`

```ts
// plugins/cms-defaults.client.ts
import { componentRegistry } from '@nexuvia/cms/client';
import CmsHeader  from '@/components/cms/defaults/CmsHeader.vue';
import CmsFooter  from '@/components/cms/defaults/CmsFooter.vue';

export default defineNuxtPlugin(() => {
  componentRegistry.register('CMSHeaderComponent', CmsHeader as any);
  componentRegistry.register('CMSFooterComponent', CmsFooter as any);
});
```

---

### Nuxt `server/config/auth.ts`

```ts
// server/config/auth.ts
import { registerAuthConfig } from '@nexuvia/auth-client';

const runtimeConfig = useRuntimeConfig();

registerAuthConfig({
  default: {
    azureTenantId:     process.env.AZURE_TENANT_ID ?? '',
    azureClientId:     process.env.AZURE_CLIENT_ID ?? '',
    azureClientSecret: runtimeConfig.azureClientSecret,
    policyName:        process.env.AZURE_POLICY ?? 'B2C_1_SignUpSignIn',
    redirectUri:       process.env.AZURE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback',
    postLogoutUri:     process.env.AZURE_POST_LOGOUT_URI ?? 'http://localhost:3000',
    encryptionKey:     runtimeConfig.authEncryptionKey,
    cookieName:        'nexuvia_session',
    cookieSecure:      process.env.NODE_ENV === 'production',
  },
});
```

---

### `server/api/auth/login.get.ts`

```ts
// server/api/auth/login.get.ts
import '@/server/config/auth';
import { randomUUID }           from 'crypto';
import { getRegisteredAuthConfig, buildAuthUrl, buildTempCookieHeader } from '@nexuvia/auth-client';

export default defineEventHandler((event) => {
  const query    = getQuery(event);
  const storeKey = (query.store as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const nonce    = randomUUID();
  const state    = randomUUID();
  const { url }  = buildAuthUrl(config.azure, config, nonce, state);

  setCookie(event, 'nexuvia_nonce', nonce, {
    httpOnly: true,
    secure:   config.cookieSecure,
    maxAge:   300,
    path:     '/',
  });

  return { redirectUrl: url };
});
```

---

### `server/api/auth/callback.get.ts`

```ts
// server/api/auth/callback.get.ts
import '@/server/config/auth';
import {
  getRegisteredAuthConfig,
  exchangeCodeForToken,
  encryptSession,
  buildSessionCookieHeader,
  buildClearCookieHeader,
}                               from '@nexuvia/auth-client';

export default defineEventHandler(async (event) => {
  const query    = getQuery(event);
  const code     = query.code as string;
  const storeKey = (query.state as string)?.split(':')[0] ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);

  try {
    const { user } = await exchangeCodeForToken(code, config.azure, config);
    const cookie   = await encryptSession(user, config);

    setCookie(event, config.cookieName, cookie, {
      httpOnly: true,
      secure:   config.cookieSecure,
      path:     '/',
    });
    deleteCookie(event, 'nexuvia_nonce');

    return sendRedirect(event, '/');
  } catch {
    return sendRedirect(event, '/login?error=auth_failed');
  }
});
```

---

### `server/api/auth/session.get.ts`

```ts
// server/api/auth/session.get.ts
import '@/server/config/auth';
import { getRegisteredAuthConfig, getSession } from '@nexuvia/auth-client';

export default defineEventHandler(async (event) => {
  const query    = getQuery(event);
  const storeKey = (query.store as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const cookie   = getCookie(event, config.cookieName) ?? '';
  const user     = await getSession(cookie, config);
  return user ?? null;
});
```

---

### `server/api/auth/logout.post.ts`

```ts
// server/api/auth/logout.post.ts
import '@/server/config/auth';
import { getRegisteredAuthConfig, buildLogoutUrl } from '@nexuvia/auth-client';

export default defineEventHandler((event) => {
  const body     = readBody(event);
  const storeKey = (body?.store as string) ?? 'default';
  const config   = getRegisteredAuthConfig(storeKey);
  const logoutUrl = buildLogoutUrl(config.azure, config);

  deleteCookie(event, config.cookieName);
  return { redirectUrl: logoutUrl };
});
```

---

### `server/api/cart/index.get.ts`

```ts
// server/api/cart/index.get.ts
import { NexuviaApp } from '@nexuvia/app';
import config         from '@/nexuvia.config';

const nexuviaApp = NexuviaApp.getInstance(config);

export default defineEventHandler(async (event) => {
  const query    = getQuery(event);
  const storeKey = (query.store as string) ?? 'default';
  const lang     = (query.lang  as string) ?? 'en';
  const cartId   = getCookie(event, 'cart_id');

  const ctx     = await nexuviaApp.forRequest(storeKey, lang);
  const adapter = ctx.cart.server;
  const cart    = cartId ? await adapter.getCart(cartId) : null;

  return cart;
});
```

---

### `server/api/cart/index.post.ts`

```ts
// server/api/cart/index.post.ts
import { NexuviaApp } from '@nexuvia/app';
import config         from '@/nexuvia.config';

const nexuviaApp = NexuviaApp.getInstance(config);

export default defineEventHandler(async (event) => {
  const body    = await readBody(event);
  const { store = 'default', lang = 'en', cartId, productCode, quantity = 1 } = body;

  const ctx     = await nexuviaApp.forRequest(store, lang);
  const adapter = ctx.cart.server;

  let id = cartId;
  if (!id) {
    id = await adapter.createCart();
    setCookie(event, 'cart_id', id, { httpOnly: true, sameSite: 'strict', path: '/' });
  }

  await adapter.addToCart(id, { productCode, quantity });
  return adapter.getCart(id);
});
```

---

## Checklist

### Vue SPA (Vite)

- [ ] `@nexuvia/vue` installed
- [ ] `app.use(createNexuviaPlugin({ ... }))` called before `app.mount()`
- [ ] CMS components registered in `plugins/cms-defaults.ts` (imported in `main.ts`)
- [ ] All composables imported from `@nexuvia/vue`
- [ ] Express backend running on a different port (`concurrently`)
- [ ] `server/config/auth.ts` imported at the top of every auth route
- [ ] Auth callback served at `/auth/callback` — NOT `/api/auth/callback`
- [ ] CORS configured with `credentials: true` and the Vite dev origin
- [ ] No secrets in `VITE_*` vars — only `VITE_API_BASE`, `VITE_GTM_ID`

### Nuxt 3

- [ ] `@nexuvia/vue` installed
- [ ] `plugins/nexuvia.client.ts` uses `defineNuxtPlugin` + `createNexuviaPlugin`
- [ ] `plugins/cms-defaults.client.ts` registers CMS components on client only
- [ ] All server routes import `@/server/config/auth` as the first line
- [ ] Secrets in `runtimeConfig` (not `runtimeConfig.public`) — never in `NUXT_PUBLIC_*`
- [ ] `NexuviaApp.getInstance(config)` called once at module level (singleton)
- [ ] Cart routes use `ctx.cart.server` — never `ProxyCartAdapter` server-side
