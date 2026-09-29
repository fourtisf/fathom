import { Effects } from '@/components/site/Effects';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';

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
