import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const FEATURES = [
  {
    title: 'Framework-Agnostic',
    description:
      'Works with Next.js, React, Vue 3, Angular, or plain TypeScript. The core library has zero framework dependencies.',
  },
  {
    title: 'Adapter-Driven',
    description:
      'Every service has a clean adapter interface. Swap the OCC adapter for a custom backend without changing your components.',
  },
  {
    title: 'Zero Dependencies',
    description:
      '@nexuvia/core has zero runtime npm dependencies. Smaller bundle, no supply chain risk, and dead-simple debugging.',
  },
  {
    title: 'SAP Commerce Ready',
    description:
      'First-party OCC adapters for products, search, cart, CMS, SmartEdit, and auth — everything a headless Hybris storefront needs.',
  },
  {
    title: 'SSR Safe',
    description:
      'All storage adapters fall back to MemoryStorage on the server. Works in Next.js App Router, Edge Functions, and Node.js.',
  },
  {
    title: 'TypeScript First',
    description:
      'Every event, adapter method, config field, and error is fully typed. Catch mistakes at compile time, not in production.',
  },
];

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className={styles.featureCard}>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Nexuvia — Headless Commerce Framework for SAP"
      description="Framework-agnostic TypeScript library that connects any headless frontend to SAP Commerce Cloud.">
      <header className={clsx('hero hero--primary', styles.heroBanner)}>
        <div className="container">
          <Heading as="h1" className="hero__title">Nexuvia</Heading>
          <p className="hero__subtitle">
            Open-source TypeScript library for SAP Commerce Cloud headless storefronts.
            <br />Works with Next.js, React, Vue, Angular, or plain TypeScript.
          </p>
          <div className={styles.buttons}>
            <Link className="button button--secondary button--lg" to="/getting-started/quick-start">
              Get Started
            </Link>
            <Link className="button button--outline button--secondary button--lg" to="/wiring/overview" style={{ marginLeft: '1rem' }}>
              Wiring Guide
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              {FEATURES.map((f) => <Feature key={f.title} {...f} />)}
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className="container">
            <Heading as="h2">12 self-contained packages</Heading>
            <p>Install only what you need. Each package is independently versioned and published.</p>
            <div className={styles.packageGrid}>
              {[
                ['@nexuvia/core',         '/packages/core'],
                ['@nexuvia/log',          '/packages/log'],
                ['@nexuvia/storage',      '/packages/storage'],
                ['@nexuvia/occ',          '/packages/occ'],
                ['@nexuvia/cms',          '/packages/cms'],
                ['@nexuvia/smartedit',    '/packages/smartedit'],
                ['@nexuvia/cart',         '/packages/cart'],
                ['@nexuvia/product',      '/packages/product'],
                ['@nexuvia/search',       '/packages/search'],
                ['@nexuvia/auth-server',  '/packages/auth-server'],
                ['@nexuvia/auth-client',  '/packages/auth-client'],
                ['@nexuvia/analytics',    '/packages/analytics'],
              ].map(([name, href]) => (
                <Link key={name} to={href} className={styles.packagePill}>
                  {name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
