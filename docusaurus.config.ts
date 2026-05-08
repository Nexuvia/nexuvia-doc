import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Nexuvia',
  tagline: 'Framework-agnostic TypeScript library for SAP Commerce Cloud headless storefronts',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://nexuvia.dev',
  baseUrl: '/',

  organizationName: 'nexuvia',
  projectName: 'nexuvia',

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Nexuvia',
      logo: {
        alt: 'Nexuvia Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'doc',
          docId: 'getting-started/quick-start',
          position: 'left',
          label: 'Get Started',
        },
        {
          type: 'doc',
          docId: 'wiring/overview',
          position: 'left',
          label: 'Wiring',
        },
        {
          type: 'docSidebar',
          sidebarId: 'packages',
          position: 'left',
          label: 'Packages',
        },
        {
          href: 'https://github.com/nexuvia/nexuvia',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Getting Started',
          items: [
            { label: 'Introduction', to: '/' },
            { label: 'Quick Start', to: '/getting-started/quick-start' },
            { label: 'Configuration', to: '/getting-started/configuration' },
          ],
        },
        {
          title: 'Wiring',
          items: [
            { label: 'Wiring Overview', to: '/wiring/overview' },
            { label: 'Config Bridge', to: '/wiring/config-bridge' },
            { label: 'Cart', to: '/wiring/cart' },
            { label: 'CMS', to: '/wiring/cms' },
          ],
        },
        {
          title: 'Framework Guides',
          items: [
            { label: 'Next.js', to: '/frameworks/nextjs' },
            { label: 'React', to: '/frameworks/react' },
            { label: 'Vue 3', to: '/frameworks/vue' },
            { label: 'Angular', to: '/frameworks/angular' },
          ],
        },
        {
          title: 'Packages',
          items: [
            { label: '@nexuvia/core', to: '/packages/core' },
            { label: '@nexuvia/cms', to: '/packages/cms' },
            { label: '@nexuvia/cart', to: '/packages/cart' },
            { label: '@nexuvia/analytics', to: '/packages/analytics' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Nexuvia. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'typescript', 'json'],
    },
    algolia: undefined,
  } satisfies Preset.ThemeConfig,
};

export default config;
