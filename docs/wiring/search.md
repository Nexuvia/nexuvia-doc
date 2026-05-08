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
import { createServerOccClient } from '@/config/server';
import { OccSearchAdapter }      from '@nexuvia/search';
import SearchPageClient          from './page-client';

export default async function SearchPage({ params, searchParams }) {
  const { lang } = await params;
  const sp       = await searchParams;
  const query    = (sp.q as string) ?? '';
  const storeKey = (await headers()).get('x-store-key') ?? '';

  const occClient = await createServerOccClient(storeKey, lang);
  const results   = await new OccSearchAdapter(occClient).searchByTerm(query, { pageSize: 24 });

  return <SearchPageClient results={results} query={query} />;
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
// server/routes/search.ts
import { Router } from 'express';
import { createServerOccClient } from '../config/server';
import { OccSearchAdapter }      from '@nexuvia/search';

const router = Router();

router.get('/api/search', async (req, res) => {
  const { q = '', storeKey, lang, page = 0, pageSize = 20 } = req.query as any;
  const occClient = await createServerOccClient(storeKey, lang);
  const results   = await new OccSearchAdapter(occClient).searchByTerm(q, {
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
import { createServerOccClient } from '~/config/server';
import { OccSearchAdapter }      from '@nexuvia/search';

export default defineEventHandler(async (event) => {
  const { q = '', storeKey, lang, page = 0, pageSize = 20 } = getQuery(event) as any;
  const occClient = await createServerOccClient(storeKey, lang);
  return await new OccSearchAdapter(occClient).searchByTerm(q, {
    page: Number(page), pageSize: Number(pageSize),
  });
});
```

</TabItem>
</Tabs>

For category listing, swap `searchByTerm(query)` for `searchByCategory(code)` — same wiring shape.

---

## Mode 2 — Autocomplete (client reactive)

For the search bar's autocomplete dropdown.

### Server route — suggestions

<Tabs groupId="framework">
<TabItem value="nextjs" label="Next.js">

```ts
// src/app/api/search/suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteOccClient } from '@/config/api-helpers';
import { OccSearchAdapter }     from '@nexuvia/search';

export async function GET(request: NextRequest) {
  const url      = new URL(request.url);
  const term     = url.searchParams.get('term') ?? '';
  const baseSite = url.searchParams.get('baseSite') || 'shop';
  const max      = Number(url.searchParams.get('max')) || 5;

  const client      = createRouteOccClient(baseSite);
  const suggestions = await new OccSearchAdapter(client).getQuerySuggestions(term, { max });
  return NextResponse.json(suggestions);
}
```

</TabItem>
<TabItem value="express" label="Node.js (Express)">

```ts
router.get('/api/search/suggestions', async (req, res) => {
  const { term = '', baseSite = 'shop', max = 5 } = req.query as any;
  const client      = createRouteOccClient(baseSite);
  const suggestions = await new OccSearchAdapter(client).getQuerySuggestions(term, { max: Number(max) });
  res.json(suggestions);
});
```

</TabItem>
<TabItem value="nuxt" label="Nuxt 3">

```ts
// server/api/search/suggestions.get.ts
export default defineEventHandler(async (event) => {
  const { term = '', baseSite = 'shop', max = 5 } = getQuery(event) as any;
  const client = createRouteOccClient(baseSite as string);
  return await new OccSearchAdapter(client).getQuerySuggestions(term as string, { max: Number(max) });
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
