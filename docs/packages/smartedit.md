---
title: "@nexuvia/smartedit"
sidebar_position: 9
---

# @nexuvia/smartedit

SAP Commerce SmartEdit DOM contract implementation.

**Pure TypeScript — no React, no Next.js, no DOM inside this library. Framework bindings live in your app's providers layer.**

---

## Installation

```bash
npm install @nexuvia/smartedit @nexuvia/core
```

---

## What SmartEdit is

SAP's in-browser content editing tool. Content teams open your storefront inside a SmartEdit iframe and edit CMS components visually — swapping banners, reordering slots, changing text — without touching code.

This library makes your storefront satisfy the **DOM contract** SmartEdit requires. It does not replace SmartEdit — it makes your storefront speak the language SmartEdit expects.

---

## The DOM contract

SmartEdit requires six things from your storefront:

| Requirement | What you must do |
|-------------|-----------------|
| Accept `?cmsTicketId=abc123` in the URL | Enter preview mode, pass ticket to CMS requests |
| Load SAP's JS bridge script | Inject `webApplicationInjector.js` from the SmartEdit host |
| `data-smartedit-*` attributes on **every component** | `data-smartedit-component-id`, `uuid`, `type`, `catalog-version` |
| `data-smartedit-*` attributes on **every slot** | `data-smartedit-slot-id`, `uuid`, `catalog-version` |
| Body CSS classes | `smartedit-page-uid-*`, `smartedit-page-uuid-*` |
| Respond to `PREVIEW_RELOAD` postMessage | Re-fetch the CMS page |

This library handles all six.

---

## Architecture

```
SmartEditService    — TypeScript — postMessage listener, preview detection, window contract
SmartEditScript     — React      — injects webApplicationInjector.js + body classes
SmartEditWrapper    — React      — data-smartedit-component-* DOM attributes
SmartEditSlotWrapper — React     — data-smartedit-slot-* DOM attributes
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `SmartEditService` | Pure TS — preview detection, postMessage, window contract |
| `SmartEditScript` | React component — script injection + body classes |
| `SmartEditWrapper` | React component — component-level data attributes |
| `SmartEditSlotWrapper` | React component — slot-level data attributes |
| All types | `SmartEditConfig`, `SmartEditComponent`, `SmartEditSlot` |

---

## Setup — Next.js

### Step 1 — Config

```ts
// nexuvia.config.ts
smartedit: {
  allowedOrigins: ['https://your-smartedit-host.com'],
  previewVersion: 'v1',
},
```

### Step 2 — Inject the script (Client Component)

```tsx
// In your root layout client component:
import { SmartEditScript } from '@nexuvia/smartedit';

<SmartEditScript
  hybrisBaseUrl={process.env.NEXT_PUBLIC_HYBRIS_HOST!}
  allowedOrigins={config.smartedit.allowedOrigins}
  onPreviewReload={() => router.refresh()}
/>
```

`SmartEditScript`:
- Detects `?cmsTicketId` in the URL
- Sets body CSS classes (`smartedit-page-uid-*`)
- Injects `webApplicationInjector.js` from the SmartEdit host
- Registers `window.smartedit.renderComponent` (SAP's JS bridge)
- Listens for `PREVIEW_RELOAD` postMessage and calls `onPreviewReload`

### Step 3 — Wrap components

```tsx
import { SmartEditWrapper } from '@nexuvia/smartedit';

export function CmsHeaderComponent({ component }: { component: CMSComponent }) {
  return (
    <SmartEditWrapper component={component}>
      <header>...</header>
    </SmartEditWrapper>
  );
}
```

`SmartEditWrapper` renders `data-smartedit-component-id`, `data-smartedit-component-uuid`, `data-smartedit-component-type`, and `data-smartedit-catalog-version-uuid` attributes in preview mode. In production (no `?cmsTicketId`), it renders children with zero overhead.

### Step 4 — Wrap slots

```tsx
import { SmartEditSlotWrapper } from '@nexuvia/smartedit';

export function CmsSlotRenderer({ slot }: { slot: CMSSlot }) {
  return (
    <SmartEditSlotWrapper slot={slot}>
      {slot.components.map(c => <CmsComponentRenderer key={c.uid} component={c} />)}
    </SmartEditSlotWrapper>
  );
}
```

---

## Using SmartEditService directly (non-React)

```ts
import { SmartEditService } from '@nexuvia/smartedit';

const service = new SmartEditService({
  allowedOrigins: ['https://your-smartedit-host.com'],
});

// Check if preview mode is active
if (service.isActive()) {
  // Register postMessage listener
  service.registerWindowContract(() => {
    // called by SAP bridge to trigger re-renders
    location.reload();
  });
}

// Clean up on page navigation
service.destroy(); // removes all postMessage listeners
```

---

## Preview detection

Preview mode is active when `?cmsTicketId=abc123` is present in the URL. The service reads this on construction and exposes it via `service.isActive()`.

The CMS ticket must be passed to all CMS API calls:
```ts
occClient.setCmsTicketId(service.getTicketId());
```

---

## postMessages handled

| Event | Action |
|-------|--------|
| `smartedit.reloadPage` | Calls your reload callback |
| `smartedit.renderComponent` | Re-renders a specific component |
| `se.cms.componenthidden` | Hides a component |
| `se.cms.componentvisible` | Shows a component |
| `PREVIEW_RELOAD` | Full page re-fetch |

---

## Security

Only postMessages from origins listed in `allowedOrigins` are processed. Never set `allowedOrigins: ['*']` in production.

---

## `SmartEditService` API

```ts
class SmartEditService {
  constructor(config: SmartEditConfig);

  isActive(): boolean;
  getTicketId(): string | null;
  registerWindowContract(onRenderComponent: (uid: string) => void): void;
  destroy(): void;
}
```

---

## Checklist

- [ ] `smartedit.allowedOrigins` set to your SmartEdit host in `nexuvia.config.ts`
- [ ] `SmartEditScript` mounted in client root layout
- [ ] `SmartEditWrapper` wrapping every CMS component
- [ ] `SmartEditSlotWrapper` wrapping every CMS slot
- [ ] `service.destroy()` called on SPA page navigation (prevents listener leaks)
- [ ] CMS ticket passed to `occClient.setCmsTicketId()` in preview mode
