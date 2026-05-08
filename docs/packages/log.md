---
title: "@nexuvia/log"
sidebar_position: 2
---

# @nexuvia/log

Structured logging for the Nexuvia library stack.

**Zero dependencies. Pure TypeScript. Works in Node.js, browser, and edge runtimes.**

---

## Installation

```bash
npm install @nexuvia/log
```

---

## What's exported

| Export | What it is |
|--------|-----------|
| `createLogger(namespace, config?)` | Factory that returns a scoped `Logger` |
| `log` | Singleton logger with namespace `HyNexus` |
| `Logger` | Logger interface |
| `LogLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` |
| `LogEntry` | Structured log entry shape |
| `LoggerConfig` | Config interface |

---

## Quick start

```ts
import { createLogger } from '@nexuvia/log';

const logger = createLogger('my-service');

logger.debug('Fetching product', { code: '12345' });
logger.info('Product fetched',  { code: '12345', name: 'iPhone 15' });
logger.warn('Cache miss',       { key: 'product:12345' });
logger.error('Fetch failed',    { code: '12345', error: 'Network timeout' });
```

Output in dev (pretty format):

```
[HyNexus:my-service] DEBUG Fetching product { code: '12345' }
[HyNexus:my-service] INFO  Product fetched  { code: '12345', name: 'iPhone 15' }
```

---

## Namespace scoping

All output is prefixed with `HyNexus:` followed by the namespace you provide. This makes it easy to filter logs by library in production log aggregators.

```ts
const cmsLog     = createLogger('cms');     // → "HyNexus:cms"
const cartLog    = createLogger('cart');    // → "HyNexus:cart"
const productLog = createLogger('product'); // → "HyNexus:product"
```

### Child loggers

```ts
const log    = createLogger('cms');
const occLog = log.child('occ');    // → "HyNexus:cms:occ"
const apiLog = log.child('api');    // → "HyNexus:cms:api"
```

---

## Log levels

| Level | Routes to | Used when |
|-------|-----------|-----------|
| `debug` | stdout | Detailed flow — disabled in prod by default |
| `info` | stdout | Notable events — cache hits, adapter calls |
| `warn` | stderr | Non-fatal issues — cache miss, token refresh |
| `error` | stderr | Failures that affect the user |

### Controlling log level

Via environment variable (resolved once at module load):

```bash
LOG_LEVEL=debug   # show all
LOG_LEVEL=info    # default
LOG_LEVEL=warn    # warnings + errors only
LOG_LEVEL=error   # errors only
```

Or via config:

```ts
const logger = createLogger('cms', { level: 'debug' });
```

---

## Output format

```bash
LOG_FORMAT=pretty  # human-readable (default in dev)
LOG_FORMAT=json    # JSON lines (default in prod / containers)
```

Pretty format:
```
[HyNexus:cms] INFO  Page fetched { uid: 'homepage', cached: false }
```

JSON format:
```json
{"level":"info","namespace":"HyNexus:cms","message":"Page fetched","uid":"homepage","cached":false,"ts":"2026-04-29T12:00:00.000Z"}
```

---

## Using the singleton

The `log` export is a pre-created singleton with namespace `HyNexus`. Use it in app-level code (not inside libraries — libraries should call `createLogger` with their own namespace):

```ts
import { log } from '@nexuvia/log';

log.info('Application started');
log.debug('Config loaded', { storeCount: 6 });
```

---

## API reference

```ts
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string,  meta?: Record<string, unknown>): void;
  warn(message: string,  meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(namespace: string): Logger;
}

interface LoggerConfig {
  level?:  LogLevel;   // default: 'info'
  format?: 'pretty' | 'json'; // default: 'pretty'
}

function createLogger(namespace: string, config?: LoggerConfig): Logger;
```

---

## Setup per framework

### Next.js / Node.js

```ts
// No setup. LOG_LEVEL / LOG_FORMAT are read from env automatically.
import { createLogger } from '@nexuvia/log';
const log = createLogger('my-app');
```

### React / Vue / Angular (browser)

```ts
import { createLogger } from '@nexuvia/log';
const log = createLogger('storefront', { format: 'pretty' });
```

Output goes to the browser console. `LOG_LEVEL` and `LOG_FORMAT` env vars are read if your bundler inlines them (Vite with `import.meta.env`, CRA with `REACT_APP_*`). Or override via config object.
