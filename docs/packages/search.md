---
title: "@nexuvia/search"
sidebar_position: 7
---

# @nexuvia/search

Full-text search, category product listing, and query suggestions with a 2-minute cache.

**Framework-agnostic — pure TypeScript. Works in React, Vue, Angular, or plain TS.**

---

## Installation

```bash
npm install @nexuvia/search @nexuvia/core
```

---

## Architecture

```
SearchAdapter       abstract contract — searchByTerm, searchByCategory, getQuerySuggestions
      ↓
SearchClient        logic — 2-min cache, EventEmitter, state snapshot
      ↓
Framework binding   React: SearchProvider + useSearch()
                    Vue / Angular: client.on() directly
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `SearchClient` | Core logic — cache, events |
| `SearchAdapter` | Abstract base class |
| `OccSearchAdapter` | SAP OCC implementation |
| `MockSearchAdapter` | In-memory mock — local dev and tests |
| All types | `SearchResult`, `SearchProduct`, `Facet`, `FacetValue`, `Pagination`, `SearchSuggestion`, `SearchOptions` |

---

## Quick start

```ts
import { OccSearchAdapter, SearchClient } from '@nexuvia/search';
import { OccClient } from '@nexuvia/occ';

const occClient = new OccClient(occConfig, baseSite, lang);
const adapter   = new OccSearchAdapter(occClient);
const client    = new SearchClient(adapter);

// Full-text search
const results = await client.searchByTerm('laptop', { pageSize: 20 });
console.log(results.products);
console.log(results.pagination);
console.log(results.facets);
```

---

## Category listing

Category product listing belongs in `@nexuvia/search`, not `@nexuvia/product`. Use `searchByCategory` to get products for a category page:

```ts
// All products in category 'phones'
const results = await client.searchByCategory('phones');

// With facets applied
const filtered = await client.searchByCategory('phones', {
  facets: ['brand:Apple', 'price:0-500'],
  sort:   'price-asc',
  page:   2,
});
```

---

## Applying facets

Facet strings come from the search result itself — the adapter returns them verbatim from OCC. Pass them back as-is to filter:

```ts
// Step 1: initial search
const results = await client.searchByTerm('shoes');

// Step 2: user clicks a facet — use the query string from the result
const facetQuery = results.facets[0].values[0].query.query.value;

// Step 3: re-search with facet applied
const filtered = await client.searchByTerm('shoes', { facets: [facetQuery] });
```

---

## Suggestions

Suggestions are **never cached** — stale autocomplete degrades UX more than a slightly slower call:

```ts
// Autocomplete input handler
const suggestions = await client.getQuerySuggestions('lapt');
console.log(suggestions.map(s => s.value));
// ['laptop', 'laptop stand', 'laptop bag']
```

---

## Sort options

```ts
const results = await client.searchByTerm('camera', {
  sort: 'relevance',     // default
  // sort: 'price-asc',
  // sort: 'price-desc',
  // sort: 'name-asc',
  // sort: 'topRated',
});

// Available sorts are returned in results.sorts
console.log(results.sorts);
```

---

## Pagination

```ts
const results = await client.searchByTerm('camera', {
  page:     2,
  pageSize: 24,
});

console.log(results.pagination.currentPage);
console.log(results.pagination.totalResults);
console.log(results.pagination.totalPages);
```

---

## Mock adapter

```ts
import { MockSearchAdapter, SearchClient } from '@nexuvia/search';

const adapter = new MockSearchAdapter();
const client  = new SearchClient(adapter);

const results = await client.searchByTerm('test');
// Returns predictable mock products
```

---

## React integration

```tsx
import { useSearch } from '@/providers/search-provider';

export function SearchPage() {
  const { results, isLoading, search } = useSearch();

  useEffect(() => {
    search('laptop');
  }, []);

  if (isLoading)  return <p>Searching…</p>;
  if (!results)   return null;

  return (
    <ul>
      {results.products.map(p => (
        <li key={p.code}>{p.name} — {p.price?.formattedValue}</li>
      ))}
    </ul>
  );
}
```

---

## `SearchClient` API

```ts
client.searchByTerm(query: string, options?: SearchOptions): Promise<SearchResult>
client.searchByCategory(code: string, options?: SearchOptions): Promise<SearchResult>
client.getQuerySuggestions(term: string, max?: number): Promise<SearchSuggestion[]>
client.clearCache(): void
client.on('results',     (results: SearchResult)         => void): () => void
client.on('suggestions', (suggestions: SearchSuggestion[]) => void): () => void
client.on('error',       (err: Error)                    => void): () => void
client.getState(): SearchClientState
```

---

## SearchOptions

```ts
interface SearchOptions {
  pageSize?: number;      // default 20
  page?:     number;      // 0-indexed
  sort?:     string;      // 'relevance' | 'price-asc' | 'price-desc' | 'name-asc' | 'topRated'
  facets?:   string[];    // applied facet query strings from previous result
  fields?:   string;      // OCC field projection
}
```

---

## Types

```ts
interface SearchResult {
  products:   SearchProduct[];
  facets:     Facet[];
  pagination: Pagination;
  sorts:      Sort[];
  freeTextSearch: string;
}

interface SearchProduct {
  code:  string;
  name:  string;
  price?: ProductPrice;
  images?: ProductImage[];
  [key: string]: unknown;
}

interface Facet {
  name:     string;
  priority: number;
  values:   FacetValue[];
}

interface FacetValue {
  name:     string;
  count:    number;
  selected: boolean;
  query:    { query: { value: string } }; // pass .query.value back as facets[]
}

interface Pagination {
  currentPage:  number;
  pageSize:     number;
  totalPages:   number;
  totalResults: number;
}
```

---

## Cache behaviour

| Operation | Cache TTL |
|-----------|-----------|
| `searchByTerm` | 2 minutes |
| `searchByCategory` | 2 minutes |
| `getQuerySuggestions` | Not cached |

2 minutes is shorter than product/CMS (5 min) because search results change more frequently — stock, pricing, new products arriving.
