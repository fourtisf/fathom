/**
 * Reads a document in the browser. PDFs go through pdf.js (loaded on demand); the file itself is never
 * uploaded. Only the extracted text is sent, as part of the message, when the user presses send.
 */

export interface DocText {
  name: string;
  /** PDF pages read, or null for plain text files. */
  pages: number | null;
  text: string;
  /** True when the text was cut to fit the message limit. */
  truncated: boolean;
}

/** Leaves room in the 100k-character request for the question and the conversation. */
export const MAX_DOC_CHARS = 60_000;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 200;

export class DocError extends Error {}

function clip(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > MAX_DOC_CHARS ? { text: clean.slice(0, MAX_DOC_CHARS), truncated: true } : { text: clean, truncated: false };
}

export async function readDocument(file: File): Promise<DocText> {
  if (file.size > MAX_FILE_BYTES) throw new DocError('This file is over 20 MB.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    if (!/^text\//.test(file.type) && !/\.(txt|md|markdown|csv|json|sol|ts|js|py|rs|go)$/i.test(file.name)) {
      throw new DocError('Attach a PDF or a text file (.txt, .md, .csv, .json, .sol).');
    }
    const { text, truncated } = clip(await file.text());
    if (!text) throw new DocError('This file is empty.');
    return { name: file.name, pages: null, text, truncated };
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Copied to /public at build time (scripts/copy-pdf-worker.mjs); versioned so upgrades bust the cache.
  pdfjs.GlobalWorkerOptions.workerSrc = `/vendor/pdf.worker.min.mjs?v=${pdfjs.version}`;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') throw new DocError('This PDF is password-protected.');
    throw new DocError("This PDF couldn't be read.");
  }
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const parts: string[] = [];
    let total = 0;
    for (let i = 1; i <= pages && total < MAX_DOC_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str + (item.hasEOL ? '\n' : ' ');
      }
      const t = `[Page ${i}]\n${line.trim()}`;
      parts.push(t);
      total += t.length;
    }
    const { text, truncated } = clip(parts.join('\n\n'));
    if (text.replace(/\[Page \d+\]/g, '').trim().length < 20) {
      throw new DocError('This PDF has no selectable text (it may be a scan).');
    }
    return { name: file.name, pages, text, truncated: truncated || doc.numPages > pages };
  } finally {
    void doc.destroy();
  }
}

/** The message the model receives: the user's question plus the document, clearly delimited. */
export function withDocument(question: string, doc: DocText): string {
  const meta = `${doc.name}${doc.pages ? `, ${doc.pages} page${doc.pages > 1 ? 's' : ''}` : ''}${doc.truncated ? ', truncated' : ''}`;
  return `${question}\n\n<document name="${meta.replace(/"/g, "'")}">\n${doc.text}\n</document>`;
}
