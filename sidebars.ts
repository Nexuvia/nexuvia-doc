import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/quick-start',
        'getting-started/configuration',
        'getting-started/architecture',
      ],
    },
    {
      type: 'category',
      label: 'Wiring Libraries',
      collapsed: false,
      items: [
        'wiring/overview',
        'wiring/app',
        'wiring/config-bridge',
        'wiring/proxy-middleware',
        'wiring/occ',
        'wiring/auth-server',
        'wiring/auth-client',
        'wiring/cms',
        'wiring/smartedit',
        'wiring/cart',
        'wiring/product',
        'wiring/search',
        'wiring/analytics',
      ],
    },
    {
      type: 'category',
      label: 'Framework Guides',
      collapsed: true,
      items: [
        'frameworks/nextjs',
        'frameworks/react',
        // 'frameworks/vue',
        // 'frameworks/angular',
        // 'frameworks/browser',
      ],
    },
  ],
  packages: [
    {
      type: 'category',
      label: 'App Wiring',
      collapsed: false,
      items: [
        'packages/app',
      ],
    },
    {
      type: 'category',
      label: 'Foundation',
      collapsed: false,
      items: [
        'packages/core',
        'packages/log',
        'packages/storage',
        'packages/occ',
      ],
    },
    {
      type: 'category',
      label: 'Commerce',
      collapsed: false,
      items: [
        'packages/cart',
        'packages/product',
        'packages/search',
        'packages/cms',
        'packages/smartedit',
      ],
    },
    {
      type: 'category',
      label: 'Auth & Analytics',
      collapsed: false,
      items: [
        'packages/auth-server',
        'packages/auth-client',
        'packages/analytics',
      ],
    },
    {
      type: 'category',
      label: 'Framework Bindings',
      collapsed: false,
      items: [
        'packages/react',
        'packages/vue',
        'packages/angular',
        'packages/browser',
      ],
    },
    {
      type: 'category',
      label: 'Tooling',
      collapsed: false,
      items: [
        'packages/di',
        'packages/codemod',
      ],
    },
  ],
};

export default sidebars;
