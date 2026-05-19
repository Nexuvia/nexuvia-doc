---
title: Wiring @nexuvia/search
sidebar_position: 11
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/search`

Search has the same **two modes** as product:

| Mode | When to use |
|------|-------------|
| **Server fetch** | Search results page (`/search?q=...`) and category listing (`/c/{code}`) |
| **Client reactive** | Autocomplete dropdown (fetches as user types) |

Most projects use **both** — server fetch for the results page, client reactive for the search bar.

---

## Mode 1 — Server fetch (results page)

Same pattern as Mode 1 in [product wiring](/wiring/product) — fetch in the server, pass as a prop.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```tsx
// src/app/[lang]/search/page.tsx
import { headers } from 'next/headers';
import { app }     from '@/nexuvia.app';
import SearchPageClient from './page-client';

export default async function SearchPage({ params, searchParams }) {
  const { lang } = await params;
  const sp       = await searchParams;
  const query    = (sp.q as string) ?? '';
  const storeKey = (await headers()).get('x-store-key') ?? '';

  const ctx     = await app.forRequest(storeKey, lang);
  const results = await ctx.search.searchByTerm(query, { pageSize: 24 });

  return <SearchPageClient results={results} query={query} />;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/search.ts
import { Router } from 'express';
import { app }    from '../../nexuvia.app';

const router = Router();

router.get('/api/search', async (req, res) => {
  const { q = '', storeKey, lang = 'en', page = 0, pageSize = 20 } = req.query as any;
  const ctx     = await app.forRequest(storeKey, lang);
  const results = await ctx.search.searchByTerm(q, {
    page: Number(page), pageSize: Number(pageSize),
  });
  res.json(results);
});

export default router;
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/search.get.ts
import { app } from '~/nexuvia.app';

export default defineEventHandler(async (event) => {
  const { q = '', storeKey, lang = 'en', page = 0, pageSize = 20 } = getQuery(event) as any;
  const ctx = await app.forRequest(storeKey, lang);
  return await ctx.search.searchByTerm(q, {
    page: Number(page), pageSize: Number(pageSize),
  });
});
```

</TabItem>
</Tabs>

---

## Category listing page

Same shape as the search results page — swap `searchByTerm` for `searchByCategory`.

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js (Server Component)">

```tsx
// src/app/[lang]/c/[category]/page.tsx
import { headers }  from 'next/headers';
import { app }      from '@/nexuvia.app';
import { notFound } from 'next/navigation';
import CategoryPageClient from './page-client';

export default async function CategoryPage({ params, searchParams }) {
  const { lang, category } = await params;
  const sp       = await searchParams;
  const page     = Number(sp.page ?? 0);
  const storeKey = (await headers()).get('x-store-key') ?? '';

  const ctx     = await app.forRequest(storeKey, lang);
  const results = await ctx.search.searchByCategory(category, { page, pageSize: 24 });
  if (!results) notFound();

  return <CategoryPageClient results={results} category={category} />;
}
```

```tsx
// src/app/[lang]/c/[category]/page-client.tsx
'use client';
import type { SearchResult } from '@nexuvia/search';

export default function CategoryPageClient({
  results,
  category,
}: {
  results: SearchResult;
  category: string;
}) {
  return (
    <div>
      <h1>{results.breadcrumbs?.[0]?.facetValueName ?? category}</h1>
      <p>{results.pagination.totalResults} products</p>
      <ul>
        {results.products.map(p => (
          <li key={p.code}>{p.name} — {p.price?.formattedValue}</li>
        ))}
      </ul>
    </div>
  );
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
router.get('/api/category/:code', async (req, res) => {
  const { code }                                     = req.params;
  const { storeKey = 'default', lang = 'en', page = 0, pageSize = 24 } = req.query as any;
  const ctx     = await app.forRequest(storeKey, lang);
  const results = await ctx.search.searchByCategory(code, {
    page: Number(page), pageSize: Number(pageSize),
  });
  res.json(results);
});
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/category/[code].get.ts
import { app } from '~/nexuvia.app';

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')!;
  const { storeKey = 'default', lang = 'en', page = 0, pageSize = 24 } = getQuery(event) as any;
  const ctx = await app.forRequest(storeKey, lang);
  return await ctx.search.searchByCategory(code, {
    page: Number(page), pageSize: Number(pageSize),
  });
});
```

```vue
<!-- pages/c/[code].vue -->
<script setup lang="ts">
const route = useRoute();
const { data: results } = await useFetch(`/api/category/${route.params.code}`);
</script>
```

</TabItem>
</Tabs>

:::tip Next.js ISR / caching
Category pages change infrequently — add `export const revalidate = 120` at the top of your page file to serve from cache and revalidate every 2 minutes:

```tsx
// src/app/[lang]/c/[category]/page.tsx
export const revalidate = 120;   // seconds
```

This avoids a fresh OCC call on every request without serving stale data for long. For search results pages (user-driven queries), skip ISR and always fetch fresh.
:::

---

## Mode 2 — Autocomplete (client reactive)

For the search bar's autocomplete dropdown.

### Server route — suggestions

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/app/api/search/suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OccClient }        from '@nexuvia/occ';
import { OccSearchAdapter } from '@nexuvia/search';
import config               from '@/nexuvia.config';

export async function GET(request: NextRequest) {
  const url      = new URL(request.url);
  const term     = url.searchParams.get('term') ?? '';
  const baseSite = url.searchParams.get('baseSite') || 'shop';
  const lang     = url.searchParams.get('lang') || 'en';
  const max      = Number(url.searchParams.get('max')) || 5;

  const { hybris } = config;
  const baseUrl    = `${hybris.protocol}://${hybris.host}`;
  const client     = new OccClient({ baseUrl, basePath: hybris.occBasePath, version: hybris.version }, baseSite, lang);
  const suggestions = await new OccSearchAdapter(client).getQuerySuggestions(term, { max });
  return NextResponse.json(suggestions);
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
router.get('/api/search/suggestions', async (req, res) => {
  const { term = '', storeKey = 'default', lang = 'en', max = 5 } = req.query as any;
  const ctx         = await app.forRequest(storeKey, lang);
  const suggestions = await ctx.search.getQuerySuggestions(term, { max: Number(max) });
  res.json(suggestions);
});
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/search/suggestions.get.ts
import { app } from '~/nexuvia.app';

export default defineEventHandler(async (event) => {
  const { term = '', storeKey = 'default', lang = 'en', max = 5 } = getQuery(event) as any;
  const ctx = await app.forRequest(storeKey as string, lang as string);
  return await ctx.search.getQuerySuggestions(term as string, { max: Number(max) });
});
```

</TabItem>
</Tabs>

### Reactive wrapper

The autocomplete client uses a custom adapter that calls your `/api/search/suggestions` route. Wire it up the same way as the cart provider — see [cart wiring](/wiring/cart) for the exact provider/composable/service shape.

```ts
// React example — once your provider is wired
const { suggestions, getQuerySuggestions } = useSearch();

// In your input handler
useEffect(() => {
  if (term.length >= 2) getQuerySuggestions(term);
}, [term]);
```

---

## Cache behaviour

| Operation | TTL |
|-----------|-----|
| `searchByTerm` | 2 minutes |
| `searchByCategory` | 2 minutes |
| `getQuerySuggestions` | **Never cached** — stale autocomplete is worse than slow autocomplete |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| Suggestions never appear | Missing provider OR threshold too high | Wrap with provider; check `term.length >= 2` |
| Slow on every keystroke | No debounce | Add 200-300ms debounce |
| Wrong results when switching term/category | Cache mismatch | Call `clearCache()` between switches |

---

## Checklist

- [ ] Results page → use Mode 1 (server fetch, no provider)
- [ ] Autocomplete → use Mode 2 (provider + `/api/search/suggestions` route)
- [ ] Autocomplete input is debounced (200-300ms)
- [ ] Facet queries passed back verbatim from `result.facets[*].values[*].query.query.value`
