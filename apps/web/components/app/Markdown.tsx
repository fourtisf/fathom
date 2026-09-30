'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders a model answer. Raw HTML stays disabled (react-markdown default); links open in a new tab. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a href={props.href} title={props.title} target="_blank" rel="noopener noreferrer nofollow">{props.children}</a>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
