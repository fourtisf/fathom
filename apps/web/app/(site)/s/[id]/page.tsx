import type { Metadata } from 'next';
import { brand } from '@fathom/config';
import { SharedChat } from '@/components/share/SharedChat';

// Shared chats are private links: never indexed, never previewed with their content.
export const metadata: Metadata = {
  title: `Shared chat · ${brand.name}`,
  description: `An encrypted chat shared from ${brand.name}.`,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function SharedChatPage({ params }: { params: { id: string } }) {
  return <SharedChat id={params.id} />;
}
