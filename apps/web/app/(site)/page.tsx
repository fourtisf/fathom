import { Hero, Logos } from '@/components/landing/Hero';
import { Api, FaqAndCta, How, Models, Pricing, Privacy, Token, Why } from '@/components/landing/Sections';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Logos />
      <Why />
      <Privacy />
      <How />
      <Models />
      <Pricing />
      <Api />
      <Token />
      <FaqAndCta />
    </>
  );
}
