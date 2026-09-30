import { Effects } from '@/components/site/Effects';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';
import '../styles/site-extra.css';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <Effects />
    </>
  );
}
