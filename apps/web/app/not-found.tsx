import type { Metadata } from 'next';
import Link from 'next/link';
import { Effects } from '@/components/site/Effects';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';
import './styles/site-extra.css';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main>
        <div className="nf">
          <div className="aurora" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="stars" aria-hidden="true" />
          <div className="wrap">
            <span className="code404">404</span>
            <h1>This page drifted away</h1>
            <p>The link may be old or mistyped. Let&apos;s get you back to calmer waters.</p>
            <div className="ctas">
              <Link className="btn btn-dark btn-lg" href="/">Back to home</Link>
              <Link className="btn btn-light btn-lg" href="/app">Open the app</Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <Effects />
    </>
  );
}
