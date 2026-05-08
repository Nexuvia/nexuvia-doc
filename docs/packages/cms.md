---
title: "@nexuvia/cms"
sidebar_position: 8
---

# @nexuvia/cms

CMS page fetching, normalization, caching, and component registry.

**Framework-agnostic — pure TypeScript core. React layer lives in `src/providers/`.**

---

## Installation

```bash
npm install @nexuvia/cms @nexuvia/core
```

`@nexuvia/cms` has two subpath exports to enforce the server/client boundary:

```ts
// Server Components — CmsClient, adapters, buildMetadata
import { CmsClient, OccCmsAdapter, MockCmsAdapter, buildMetadata } from '@nexuvia/cms/server';

// Client Components — component registry, template registry, EventEmitter
import { componentRegistry, templateRegistry } from '@nexuvia/cms/client';
```

The top-level `@nexuvia/cms` import still works and exports everything, but the subpaths prevent accidentally bundling server-only code into a client bundle.

---

## How SAP Commerce CMS works

The content team builds pages in SmartEdit or CMS Cockpit by placing **components** into named **slots**. SAP does not return HTML — it returns JSON describing page structure:

```json
{
  "uid": "homepage",
  "contentSlots": {
    "contentSlot": [
      {
        "position": "Header",
        "components": {
          "component": [{ "uid": "header-1", "typeCode": "CMSHeaderComponent" }]
        }
      }
    ]
  }
}
```

Your job: register a component for each `typeCode`. The library resolves the mapping and renders each slot.

---

## Architecture

```
SAP CMS JSON
  → OccCmsAdapter fetches + normalizes → CMSPage
  → CmsClient caches (5 min) + emits events
  → CmsPageProvider holds CMSPage in context
  → CmsSlotRenderer renders slot by position
  → CmsComponentRenderer resolves typeCode → your component
```

---

## What's exported

| Export | What it is | Import path |
|--------|-----------|-------------|
| `CmsClient` | Core logic — cache, events | `@nexuvia/cms/server` |
| `CmsAdapter` | Abstract base class | `@nexuvia/cms/server` |
| `OccCmsAdapter` | SAP OCC implementation — server-side | `@nexuvia/cms/server` |
| `MockCmsAdapter` | Local JSON mock — dev without Hybris | `@nexuvia/cms/server` |
| `buildMetadata` | Build Next.js `Metadata` from a `CMSPage` | `@nexuvia/cms/server` |
| `componentRegistry` | Plain `Map`: typeCode → component (framework-agnostic) | `@nexuvia/cms/client` |
| `templateRegistry` | Maps CMS templates to layout components | `@nexuvia/cms/client` |
| `normalizeCmsPage` | Transforms both SAP response shapes to `CMSPage` | `@nexuvia/cms` |
| All types + enums | `CMSPage`, `CMSSlot`, `CMSComponent`, `CMSPosition`, `CMSTemplate`, `PageLabel` | `@nexuvia/cms` |

---

## Setup — Next.js

### Step 1 — Config

```ts
// nexuvia.config.ts
cms: {
  useMock: process.env.USE_CMS_MOCK !== 'false',
  pageLabels: {
    homepage:      'homepage',
    productDetail: 'productDetails',
    cart:          'cartPage',
    search:        'search',
    searchEmpty:   'searchEmpty',
    notFound:      'notFound',
  },
  componentTypes: [
    'CMSHeaderComponent',
    'CMSFooterComponent',
    'CMSNavigationComponent',
    'CMSBannersComponent',
    'CMSProductCarouselComponent',
  ],
},
```

### Step 2 — Register components

```ts
// src/app/_cms-defaults.ts
import { componentRegistry } from '@nexuvia/cms/client';
import { CmsHeaderComponent }   from '@/components/cms/CmsHeaderComponent';
import { CmsFooterComponent }   from '@/components/cms/CmsFooterComponent';

componentRegistry.register('CMSHeaderComponent', CmsHeaderComponent);
componentRegistry.register('CMSFooterComponent', CmsFooterComponent);
// one line per typeCode in nexuvia.config.ts → cms.componentTypes
```

Import once in the root layout:
```ts
import '@/app/_cms-defaults';
```

### Step 3 — Fetch a page (Server Component)

```ts
import { headers } from 'next/headers';
import { createServerOccClient, createCmsClient } from '@/config/server';
import { PageLabel } from '@nexuvia/cms';

export default async function HomePage({ params }) {
  const { lang }    = await params;
  const storeKey    = (await headers()).get('x-store-key') ?? 'ae';
  const occClient   = await createServerOccClient(storeKey, lang);
  const page        = await createCmsClient(occClient).getContentPage(PageLabel.FRONTPAGE);

  return <HomePageClient page={page} />;
}
```

### Step 4 — Render slots (Client Component)

```tsx
'use client';

import { CmsPageProvider, CmsSlotRenderer, CMSPosition } from '@nexuvia/cms/client';
import type { CMSPage } from '@nexuvia/cms';

export function HomePageClient({ page }: { page: CMSPage }) {
  return (
    <CmsPageProvider page={page}>
      <CmsSlotRenderer position={CMSPosition.HEADER} />
      <main>
        <CmsSlotRenderer position={CMSPosition.CONTENT} />
      </main>
      <CmsSlotRenderer position={CMSPosition.FOOTER} />
    </CmsPageProvider>
  );
}
```

---

## Page types

| Method | SAP page type | Typical URL |
|--------|-------------|-------------|
| `getContentPage(label)` | ContentPage | `/en/` `/en/about` |
| `getProductPage(code)` | ProductPage | `/en/p/12345` |
| `getCategoryPage(code)` | CategoryPage | `/en/c/phones` |

---

## Mock data

Add JSON files to `src/lib/cms/mock/`. Filename must match `pageLabelOrId` exactly (case-sensitive):

```
src/lib/cms/mock/homepage.json
src/lib/cms/mock/productDetails.json
```

The JSON must be a valid SAP OCC CMS page response. Both wrapped (`contentSlots.contentSlot[].components.component[]`) and flat (`contentSlots[]`) shapes are supported — `normalizeCmsPage()` handles both.

---

## Component registry — non-React

The `componentRegistry` is a plain `Map` — not React-specific. Register any value (Vue component, Angular class, string):

```ts
import { componentRegistry } from '@nexuvia/cms/client';
import HeaderVue from './CmsHeader.vue';

componentRegistry.register('CMSHeaderComponent', HeaderVue as any);
```

---

## SEO metadata (Next.js)

```ts
import { buildMetadata } from '@nexuvia/cms/server';

export async function generateMetadata({ params }) {
  // ... fetch page ...
  return buildMetadata(page, 'my-page');
}
```

Returns a Next.js `Metadata` object populated from `page.seo` fields (`title`, `description`, `keywords`, `canonicalUrl`).

---

## Cache TTL and stale-while-revalidate

`CmsClient` accepts options to control caching:

```ts
import { CmsClient, OccCmsAdapter } from '@nexuvia/cms/server';

const client = new CmsClient(new OccCmsAdapter(occClient, cmsBasePath), {
  ttl:                 10 * 60 * 1000,  // 10 min (default: 5 min)
  staleWhileRevalidate: true,           // return stale page immediately, revalidate in background
});

// 'revalidated' fires after background revalidation completes
client.on('revalidated', (page) => {
  console.log('Page refreshed in background:', page.uid);
});
```

With `staleWhileRevalidate: true`, the first call after TTL expiry returns the cached page immediately (no wait) and triggers a background fetch. The next call after the background fetch completes gets the fresh page.

---

## `CmsClient` API

```ts
client.getContentPage(label: string): Promise<CMSPage>
client.getProductPage(code: string): Promise<CMSPage>
client.getCategoryPage(code: string): Promise<CMSPage>
client.getPreviewContext(options: CmsPreviewRequestOptions): Promise<PreviewContext>
client.getComponentAttributes(options: GetAttributesOptions): Record<string, string> | null
client.attachLivePreviewListeners(cb: () => void): () => void
client.clearCache(): void
client.on('page',        (page: CMSPage) => void): () => void
client.on('revalidated', (page: CMSPage) => void): () => void
client.on('preview',     (ctx: PreviewContext) => void): () => void
client.on('error',       (err: Error)    => void): () => void
client.getState(): { currentPage, isLoading, lastError }
```

---

## Types

```ts
interface CMSPage {
  uid:          string;
  uuid:         string;
  name:         string;
  template:     string;
  contentSlots: CMSSlot[];
  seo?:         CMSSeo;
}

interface CMSSlot {
  slotId:    string;
  slotUuid:  string;
  position:  string;
  components: CMSComponent[];
}

interface CMSComponent {
  uid:      string;
  uuid:     string;
  typeCode: string;
  [key: string]: unknown; // all extra SAP fields pass through
}
```

---

## Checklist

- [ ] `cms.pageLabels` values match Hybris impex UIDs exactly
- [ ] `cms.componentTypes` lists every typeCode in the project
- [ ] `componentRegistry.register()` called for every typeCode in `_cms-defaults.ts`
- [ ] `_cms-defaults.ts` imported in root layout before any page renders
- [ ] `CmsPageProvider` wraps any subtree using `useCmsPage()` or `CmsSlotRenderer`
- [ ] Mock JSON filename matches `pageLabelOrId` exactly (case-sensitive)
- [ ] `USE_CMS_MOCK=false` when connecting to live Hybris CMS
