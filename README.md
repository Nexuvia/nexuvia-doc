# Nexuvia Docs

Documentation site for **Nexuvia** — the open-source, framework-agnostic TypeScript library stack for SAP Commerce Cloud (Hybris).

Built with [Docusaurus](https://docusaurus.io/).

---

## Local development

```bash
npm install
npm start
```

Opens `http://localhost:3000`. Most changes are reflected live without a restart.

## Build

```bash
npm run build
```

Generates static output in `build/`. Serve with any static host.

## Content structure

```text
docs/
  intro.md                    ← Introduction and package list
  getting-started/
    quick-start.md
    configuration.md
    architecture.md
  frameworks/                 ← Per-framework assembly guides
    nextjs.md
    react.md
    vue.md
    angular.md
    browser.md
  wiring/                     ← Per-library wiring guides
    overview.md
    app.md, config-bridge.md, ...
  packages/                   ← Full API reference per package
    core.md, log.md, di.md, codemod.md, ...
```

## Deployment

```bash
GIT_USER=<your-github-username> npm run deploy
```

Builds and pushes to the `gh-pages` branch.
