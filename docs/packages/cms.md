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

| Export | What it is |
|--------|-----------|
| `CmsClient` | Core logic — cache, events |
| `CmsAdapter` | Abstract base class |
| `OccCmsAdapter` | SAP OCC implementation — server-side |
| `MockCmsAdapter` | Local JSON mock — dev without Hybris |
| `componentRegistry` | Plain `Map`: typeCode → component (framework-agnostic) |
| `templateRegistry` | Maps CMS templates to layout components |
| `normalizeCmsPage` | Transforms both SAP response shapes to `CMSPage` |
| `buildMetadata` | Build Next.js `Metadata` from a `CMSPage` |
| All types + enums | `CMSPage`, `CMSSlot`, `CMSComponent`, `CMSPosition`, `CMSTemplate`, `PageLabel` |

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
import { componentRegistry } from '@nexuvia/cms';
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

import { CmsPageProvider, CmsSlotRenderer, CMSPosition } from '@nexuvia/cms';
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
import { componentRegistry } from '@nexuvia/cms';
import HeaderVue from './CmsHeader.vue';

componentRegistry.register('CMSHeaderComponent', HeaderVue as any);
```

---

## SEO metadata (Next.js)

```ts
import { buildMetadata } from '@nexuvia/cms';

export async function generateMetadata({ params }) {
  // ... fetch page ...
  return buildMetadata(page, 'my-page');
}
```

Returns a Next.js `Metadata` object populated from `page.seo` fields (`title`, `description`, `keywords`, `canonicalUrl`).

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
client.on('page',    (page: CMSPage) => void): () => void
client.on('preview', (ctx: PreviewContext) => void): () => void
client.on('error',   (err: Error)    => void): () => void
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
