---
title: Wiring @nexuvia/smartedit
sidebar_position: 8
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Wiring `@nexuvia/smartedit`

`@nexuvia/smartedit` enables **in-browser preview editing** through SAP SmartEdit. Wiring is mostly client-side — no server routes needed.

---

## What you build (the 4 layers)

| Layer | What |
|-------|------|
| **Layer 1** — Config | `nexuvia.config.ts → smartedit` (allowedOrigins, previewVersion) |
| **Layer 1** — Bridge | `createSmartEditService()` in `config/smartedit.ts` |
| **Layer 2** — Server routes | None — purely client-side library |
| **Layer 3** — Wrapper | `SmartEditProvider` (React) / composable (Vue) / service (Angular) |
| **Layer 4** — Components | `<SmartEditScript>`, `<SmartEditWrapper>` around CMS components |

---

## Step 1 — Config

```ts
// nexuvia.config.ts
smartedit: {
  allowedOrigins: ['https://backoffice.commerce.example.com'],   // your SmartEdit host
  previewVersion: 'v1',
},
```

:::warning Never use `'*'`
Allowed origins must be your trusted SmartEdit hosts. Wildcard accepts postMessages from any origin — security hole.
:::

---

## Step 2 — Reactive wrapper (Layer 3)

:::tip Shortcut with `@nexuvia/react`
If you use `@nexuvia/react`, pass `smartEditConfig` to `NexuviaProvider` — no manual provider file needed:

```tsx
// src/app/[lang]/store-layout-client.tsx
'use client';
import { NexuviaProvider } from '@nexuvia/react';
import config from '@/nexuvia.config';

const smartEditConfig = {
  hybrisBaseUrl:  `${config.hybris.protocol}://${config.hybris.host}`,
  allowedOrigins: config.smartedit.allowedOrigins,
  version:        config.smartedit.previewVersion,
};

export function StoreLayoutClient({ children, ...props }) {
  return (
    <NexuviaProvider {...props} smartEditConfig={smartEditConfig}>
      {children}
    </NexuviaProvider>
  );
}
```

Then anywhere: `import { useSmartEdit } from '@nexuvia/react'`. Done. The manual tab below is for Vue/Angular or when using Nexuvia without `@nexuvia/react`.
:::

The wrapper detects `?cmsTicketId=...` in the URL, activates the service, and listens for SAP postMessage events.

<Tabs groupId="framework">
<TabItem value="react" label="React (manual)">

```tsx
// src/providers/smartedit-provider.tsx — only needed WITHOUT @nexuvia/react
'use client';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';   // or useLocation in React Router
import { SmartEditService } from '@nexuvia/smartedit';
import type { SmartEditServiceConfig } from '@nexuvia/smartedit';

const Ctx = createContext<{ isSmartEdit: boolean; cmsTicketId: string | null; service: SmartEditService | null }>({
  isSmartEdit: false, cmsTicketId: null, service: null,
});

export function SmartEditProvider({ config, children }: { config: SmartEditServiceConfig; children: ReactNode }) {
  const params = useSearchParams();   // ⚠ requires <Suspense> wrapper
  const router = useRouter();
  const ticket = params.get('cmsTicketId');

  // Stable on hybrisBaseUrl — the only field that identifies a different backend
  const service = useMemo(
    () => new SmartEditService(config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.hybrisBaseUrl],
  );

  // Derive active state directly from ticket — no sync setState in effect
  const isSmartEdit = ticket !== null;

  useEffect(() => {
    if (ticket) service.activate(ticket);
  }, [ticket, service]);

  useEffect(() => {
    const offReload     = service.on('reload',     () => router.refresh());
    const offDeactivate = service.on('deactivate', () => {});
    return () => { offReload(); offDeactivate(); service.destroy(); };
  }, [service, router]);

  return <Ctx.Provider value={{ isSmartEdit, cmsTicketId: ticket, service }}>{children}</Ctx.Provider>;
}

export const useSmartEdit = () => useContext(Ctx);
```

**Wire it inside `<Suspense>`** (React 18+ / Next.js App Router):

```tsx
<Suspense fallback={null}>
  <SmartEditProvider config={smartEditConfig}>
    {children}
  </SmartEditProvider>
</Suspense>
```

</TabItem>
<TabItem value="vue" label="Vue 3">

```ts
// composables/useSmartEdit.ts
import { ref, onUnmounted } from 'vue';
import { useRoute }         from 'vue-router';
import { SmartEditService } from '@nexuvia/smartedit';
import type { SmartEditServiceConfig } from '@nexuvia/smartedit';

let service: SmartEditService | null = null;

export function useSmartEdit(config?: SmartEditServiceConfig) {
  if (!service && config) service = new SmartEditService(config);

  const route        = useRoute();
  const isSmartEdit  = ref(false);
  const cmsTicketId  = ref<string | null>(null);

  const ticket = route.query.cmsTicketId as string | undefined;
  if (ticket && service) {
    service.activate(ticket);
    isSmartEdit.value = true;
    cmsTicketId.value = ticket;
  }

  const offReload = service?.on('reload', () => location.reload());
  onUnmounted(() => offReload?.());

  return { isSmartEdit, cmsTicketId, service };
}
```

</TabItem>
<TabItem value="angular" label="Angular">

```ts
// src/app/services/smartedit.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { ActivatedRoute }        from '@angular/router';
import { BehaviorSubject }       from 'rxjs';
import { SmartEditService as Lib } from '@nexuvia/smartedit';
import { createSmartEditService }  from '../config/smartedit';

@Injectable({ providedIn: 'root' })
export class SmartEditService implements OnDestroy {
  private service: Lib;
  private offReload: () => void;

  readonly isSmartEdit$ = new BehaviorSubject<boolean>(false);
  readonly cmsTicketId$ = new BehaviorSubject<string | null>(null);

  constructor(route: ActivatedRoute) {
    this.service = new Lib(createSmartEditService());

    const ticket = route.snapshot.queryParamMap.get('cmsTicketId');
    if (ticket) {
      this.service.activate(ticket);
      this.isSmartEdit$.next(true);
      this.cmsTicketId$.next(ticket);
    }

    this.offReload = this.service.on('reload', () => location.reload());
  }

  ngOnDestroy() { this.offReload(); this.service.destroy(); }
}
```

</TabItem>
</Tabs>

---

## Step 3 — Inject the SmartEdit script

Renders nothing visible — injects SAP's `webApplicationInjector.js` and sets body classes.

```tsx
// React example
import { SmartEditScript } from '@nexuvia/smartedit';
import { useSmartEdit, useCmsPage } from '@nexuvia/react';

export function SmartEditScriptHost() {
  const { service } = useSmartEdit();
  const page        = useCmsPage();
  if (!service) return null;
  return <SmartEditScript service={service} page={page} />;
}
```

For Vue / Angular: read the source of `<SmartEditScript>` (it's tiny — just injects a `<script>` tag and adds body classes) and replicate it in your framework's component syntax.

---

## Step 4 — Wrap CMS components

Every CMS component needs `data-smartedit-*` attributes when preview is active.

```tsx
// React example
'use client';
import { SmartEditWrapper } from '@nexuvia/smartedit';
import { useSmartEdit }     from '@nexuvia/react';

export function CmsHeader({ component }) {
  const { service } = useSmartEdit();
  const inner = <header>{/* your markup */}</header>;
  if (!service) return inner;
  return (
    <SmartEditWrapper service={service} component={component}>
      {inner}
    </SmartEditWrapper>
  );
}
```

When no preview ticket is present, `service` is `null` and children render unchanged with zero overhead.

---

## Critical wiring rules

| Rule | Why |
|------|-----|
| `<SmartEditProvider>` inside `<Suspense>` (React) | Uses `useSearchParams` |
| Never `allowedOrigins: ['*']` | Security |
| Wrap **every** CMS component with `<SmartEditWrapper>` | SAP needs to identify each component |
| Pass preview ticket to OCC: `occClient.setCmsTicketId(ticket)` | CMS endpoints need the ticket as query param |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `useSearchParams should be wrapped in Suspense` | Provider not in Suspense | Wrap `<SmartEditProvider>` in `<Suspense>` |
| Components show but aren't editable | Missing `<SmartEditWrapper>` | Wrap every CMS component |
| `webApplicationInjector.js` 404 | Wrong `hybrisBaseUrl` | Verify it's served by your backend |
| postMessages ignored | `allowedOrigins` missing the SmartEdit host | Add the exact origin |

---

## Checklist

- [ ] `nexuvia.config.ts → smartedit.allowedOrigins` lists real SmartEdit hosts
- [ ] Layer 3 wrapper wired in your provider tree
- [ ] React: provider is **inside `<Suspense>`**
- [ ] `<SmartEditScript>` rendered once
- [ ] Every CMS component wrapped with `<SmartEditWrapper service={service} component={c}>` (guard with `if (!service) return inner`)
- [ ] When preview is active, `occClient.setCmsTicketId(ticket)` is called
