---
title: Wiring @nexuvia/cms
sidebar_position: 7
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/cms`

CMS wiring has **3 simple parts** — and they are nearly identical across frameworks:

1. **Component registry** — register every CMS `typeCode` to a UI component
2. **Page fetch** — fetch the CMS page server-side, pass it to your page tree
3. **Slot renderer** — render the page's slots and components

---

## What you build (the 4 layers)

| Layer | What |
|-------|------|
| **Layer 1** — Config | `cms.useMock`, `cms.pageLabels`, `cms.componentTypes` in `nexuvia.config.ts` |
| **Layer 1** — Bridge | `createCmsClient(occClient)` in your `config/server.ts` |
| **Layer 1** — Registry | `registerDefaultCmsComponents()` — runs once on app startup |
| **Layer 2** — Server route | None for SSR pages. **Optional** `/api/cms/pages` if browser fetches |
| **Layer 3** — Wrapper | `CmsPageProvider` (React) / `provide('page', …)` (Vue) / `CmsService` (Angular) |
| **Layer 4** — UI | `<CmsSlotRenderer position="…" />` |

---

## Step 1 — Config

```ts
// nexuvia.config.ts
cms: {
  useMock: process.env.USE_CMS_MOCK !== 'false',

  // Must match your backend's CMS page UIDs exactly
  pageLabels: {
    homepage:      'homepage',
    productDetail: 'productDetails',
    cart:          'cartPage',
    search:        'search',
    searchEmpty:   'searchEmpty',
    notFound:      'notFound',
  },

  // Every typeCode your project uses
  componentTypes: [
    'CMSHeaderComponent',
    'CMSFooterComponent',
    'CMSNavigationComponent',
    'CMSBannersComponent',
    'CMSProductCarouselComponent',
  ],
},
```

---

## Step 2 — Component registry (one file, runs once)

The registry is a plain `Map`. Register every `typeCode` to your UI component **once on app startup**.

<Tabs groupId="framework">
<TabItem value="react" label="React (Next.js / Vite / CRA)">

```ts
// src/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import { CmsHeader }   from '@/components/cms/CmsHeader';
import { CmsFooter }   from '@/components/cms/CmsFooter';
import { CmsBanners }  from '@/components/cms/CmsBanners';

export function registerDefaultCmsComponents(): void {
  componentRegistry.register('CMSHeaderComponent',  CmsHeader);
  componentRegistry.register('CMSFooterComponent',  CmsFooter);
  componentRegistry.register('CMSBannersComponent', CmsBanners);
  // …one line per typeCode
}
```

Call it once at the **top of your client layout module** (not inside a component):

```tsx
// src/app/layout-client.tsx (or App.tsx)
import { registerDefaultCmsComponents } from '@/cms-defaults';
registerDefaultCmsComponents();   // runs ONCE on module load

export function ClientLayout({ children }) { return <>{children}</>; }
```

</TabItem>
<TabItem value="vue" label="Vue 3 (Nuxt / Vite)">

```ts
// plugins/cms-defaults.client.ts (Nuxt) or src/cms-defaults.ts (Vite)
import { componentRegistry } from '@nexuvia/cms/client';
import CmsHeader   from '@/components/cms/CmsHeader.vue';
import CmsFooter   from '@/components/cms/CmsFooter.vue';
import CmsBanners  from '@/components/cms/CmsBanners.vue';

componentRegistry.register('CMSHeaderComponent',  CmsHeader  as any);
componentRegistry.register('CMSFooterComponent',  CmsFooter  as any);
componentRegistry.register('CMSBannersComponent', CmsBanners as any);
// …one line per typeCode

// Nuxt:
export default defineNuxtPlugin(() => {});

// Vite SPA: just import this file in main.ts BEFORE createApp(...)
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
// src/app/cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import { CmsHeaderComponent }   from './components/cms/cms-header.component';
import { CmsFooterComponent }   from './components/cms/cms-footer.component';
import { CmsBannersComponent }  from './components/cms/cms-banners.component';

export function registerDefaultCmsComponents(): void {
  componentRegistry.register('CMSHeaderComponent',  CmsHeaderComponent  as any);
  componentRegistry.register('CMSFooterComponent',  CmsFooterComponent  as any);
  componentRegistry.register('CMSBannersComponent', CmsBannersComponent as any);
}
```

Call it once in `app.component.ts` at module top:

```ts
import { registerDefaultCmsComponents } from './cms-defaults';
registerDefaultCmsComponents();   // runs ONCE on module load

@Component({ /* … */ })
export class AppComponent {}
```

</TabItem>
</Tabs>

---

## Step 3 — Fetch the CMS page

This happens server-side. The page is fetched **once** and passed into your UI tree.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js (Server Component)">

```tsx
// src/app/[lang]/page.tsx
import { headers } from 'next/headers';
import { createServerOccClient, createCmsClient } from '@/config/server';
import HomePageClient from './page-client';

export default async function HomePage({ params }) {
  const { lang }  = await params;
  const storeKey  = (await headers()).get('x-store-key') ?? '';
  const occClient = await createServerOccClient(storeKey, lang);
  const page      = await createCmsClient(occClient).getContentPage('homepage');

  return <HomePageClient page={page} />;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express SSR API)">

```ts
// server/routes/cms.ts
import { Router } from 'express';
import { createServerOccClient, createCmsClient } from '../config/server';

const router = Router();

router.get('/api/cms/pages', async (req, res) => {
  const { label, storeKey, lang } = req.query;
  const occClient = await createServerOccClient(storeKey as string, lang as string);
  const page      = await createCmsClient(occClient).getContentPage(label as string);
  res.json(page);
});

export default router;
```

The browser then calls `GET /api/cms/pages?label=homepage` and renders the JSON.

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
const { data: page } = await useFetch('/api/cms/pages', {
  query: { label: 'homepage' },
});
</script>

<template>
  <CmsPageProvider :page="page">
    <CmsSlotRenderer position="HEADER" />
    <CmsSlotRenderer position="CONTENT" />
    <CmsSlotRenderer position="FOOTER" />
  </CmsPageProvider>
</template>
```

```ts
// server/api/cms/pages.get.ts
import { createServerOccClient, createCmsClient } from '~/config/server';

export default defineEventHandler(async (event) => {
  const { label, storeKey, lang } = getQuery(event);
  const occClient = await createServerOccClient(storeKey as string, lang as string);
  return await createCmsClient(occClient).getContentPage(label as string);
});
```

</TabItem>
<TabItem value="angular" label="Angular Universal">

Use a resolver or service:

```ts
// src/app/services/cms.service.ts
import { Injectable } from '@angular/core';
import { CmsClient, OccCmsAdapter, MockCmsAdapter } from '@nexuvia/cms/server';
import { OccClient } from '@nexuvia/occ';
import config from '../../../nexuvia.config';

@Injectable({ providedIn: 'root' })
export class CmsService {
  private client: CmsClient;

  constructor() {
    if (config.cms.useMock) {
      const loader = async (id: string) => {
        try {
          const mod = await import(`../../mock/${id}.json`, { assert: { type: 'json' } });
          return mod.default ?? null;
        } catch { return null; }
      };
      this.client = new CmsClient(new MockCmsAdapter(loader));
    } else {
      const occ = new OccClient(/* config */, 'shop', 'en');
      this.client = new CmsClient(new OccCmsAdapter(occ, config.hybris.cmsBasePath));
    }
  }

  getContentPage(label: string) { return this.client.getContentPage(label); }
}
```

</TabItem>
</Tabs>

---

## Step 4 — Reactive wrapper + slot renderer

<Tabs groupId="framework">
<TabItem value="react" label="React">

```tsx
// src/providers/cms-provider.tsx
'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { CMSPage } from '@nexuvia/cms';

const Ctx = createContext<CMSPage | null>(null);

// Pass page directly to context — no state/effect needed.
// page is a Server Component prop (stable per render), so the state layer is unnecessary
// and calling setState synchronously inside useEffect triggers a React cascading-setState warning.
export function CmsPageProvider({ page, children }: { page: CMSPage | null; children: ReactNode }) {
  return <Ctx.Provider value={page}>{children}</Ctx.Provider>;
}

export const useCmsPage = () => useContext(Ctx);
```

```tsx
// src/components/cms/CmsSlotRenderer.tsx
'use client';
import { componentRegistry } from '@nexuvia/cms/client';
import { useCmsPage }        from '@/providers/cms-provider';

export function CmsSlotRenderer({ position }: { position: string }) {
  const page = useCmsPage();
  const slot = page?.contentSlots.find(s => s.position === position);
  if (!slot) return null;
  return <>{slot.components.map(c => {
    const C = componentRegistry.resolve(c.typeCode) as React.ComponentType<{ component: typeof c }> | null;
    return C ? <C key={c.uid} component={c} /> : null;
  })}</>;
}
```

```tsx
// Use in page
'use client';
import { CmsPageProvider } from '@/providers/cms-provider';
import { CmsSlotRenderer } from '@/components/cms/CmsSlotRenderer';

export default function HomePageClient({ page }) {
  return (
    <CmsPageProvider page={page}>
      <CmsSlotRenderer position="HEADER" />
      <CmsSlotRenderer position="CONTENT" />
      <CmsSlotRenderer position="FOOTER" />
    </CmsPageProvider>
  );
}
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```vue
<!-- src/components/cms/CmsPageProvider.vue -->
<script setup lang="ts">
import { provide, toRef } from 'vue';
import type { CMSPage } from '@nexuvia/cms';
const props = defineProps<{ page: CMSPage | null }>();
provide('cms-page', toRef(props, 'page'));
</script>
<template><slot /></template>
```

```vue
<!-- src/components/cms/CmsSlotRenderer.vue -->
<script setup lang="ts">
import { inject, computed } from 'vue';
import type { Ref } from 'vue';
import type { CMSPage } from '@nexuvia/cms';
import { componentRegistry } from '@nexuvia/cms/client';

const props = defineProps<{ position: string }>();
const page = inject<Ref<CMSPage | null>>('cms-page');

const components = computed(() =>
  page?.value?.contentSlots.find(s => s.position === props.position)?.components ?? [],
);

const resolve = (typeCode: string) => componentRegistry.resolve(typeCode);
</script>

<template>
  <component v-for="c in components" :key="c.uid"
             :is="resolve(c.typeCode)" :component="c" />
</template>
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
// src/app/components/cms/cms-slot-renderer.component.ts
import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { componentRegistry } from '@nexuvia/cms/client';
import type { CMSPage } from '@nexuvia/cms';

@Component({
  selector:    'app-cms-slot',
  standalone:  true,
  imports:     [CommonModule],
  template: `
    <ng-container *ngFor="let c of components">
      <ng-container *ngComponentOutlet="resolve(c.typeCode); inputs: { component: c }" />
    </ng-container>
  `,
})
export class CmsSlotComponent implements OnChanges {
  @Input() page!:     CMSPage | null;
  @Input() position!: string;

  components: any[] = [];

  ngOnChanges() {
    this.components = this.page?.contentSlots.find(s => s.position === this.position)?.components ?? [];
  }

  resolve(typeCode: string) {
    return componentRegistry.resolve(typeCode) as any;
  }
}
```

</TabItem>
</Tabs>

---

## Mock pages for local dev

When `cms.useMock: true`, the `MockCmsAdapter` reads from `src/mock/{pageLabel}.json`. Filename must match the page label exactly.

```text
src/mock/
  homepage.json
  productDetails.json
  cartPage.json
```

The JSON must be a valid SAP OCC CMS page response. The adapter handles both wrapped and flat shapes.

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| Slot renders empty | typeCode not in registry | Add `componentRegistry.register('Type', Component)` |
| `404` from `getContentPage('homepage')` (mock mode) | Missing JSON | Create `src/mock/homepage.json` |
| `404` from `getContentPage('homepage')` (live) | Wrong page label | Check `cms.pageLabels` matches your backend's UIDs |
| `401` from CMS endpoint | No machine token | Check [auth-server wiring](/wiring/auth-server) |
| Live preview doesn't refresh | Forgot `client` prop on provider | Pass `client={cmsClient}` to `CmsPageProvider` |

---

## Checklist

- [ ] `cms.pageLabels` matches your backend's exact CMS page UIDs
- [ ] `cms.componentTypes` lists every typeCode your project uses
- [ ] `componentRegistry.register()` called for **every** typeCode in the config list
- [ ] Registration runs **once** at module load (not inside a component)
- [ ] `<CmsPageProvider>` wraps any page tree using `<CmsSlotRenderer>`
- [ ] Mock JSON filenames match page labels exactly (case-sensitive)
- [ ] `USE_CMS_MOCK=false` in `.env` when connecting to live backend
