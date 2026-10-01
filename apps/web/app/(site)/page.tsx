import { Hero, Logos } from '@/components/landing/Hero';
import { Api, FaqAndCta, How, Models, Pricing, Privacy, Token, Tools, Why } from '@/components/landing/Sections';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Logos />
      <Why />
      <Privacy />
      <Tools />
      <How />
      <Models />
      <Pricing />
      <Api />
      <Token />
      <FaqAndCta />
    </>
  );
}
