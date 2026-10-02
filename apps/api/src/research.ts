import type { ChatMessage } from './inference';
import type { SearchResult } from './search';

/**
 * Deep Research: the model plans a few web searches, our server runs them (so the user's IP never
 * reaches the search engine), and the model writes a cited report from the results.
 * Queries and results are user content: they are streamed to the user and never logged or stored.
 */

export const RESEARCH_MAX_QUERIES = 4;
export const RESEARCH_RESULTS_PER_QUERY = 5;
export const RESEARCH_MAX_SOURCES = 12;
export const RESEARCH_PLAN_MAX_TOKENS = 300;
export const RESEARCH_REPORT_MAX_TOKENS = 2500;

export function planMessages(question: string, now: Date): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        `Today is ${now.toISOString().slice(0, 10)}. You plan web research. Given the user's request, write ` +
        `${RESEARCH_MAX_QUERIES - 1} to ${RESEARCH_MAX_QUERIES} short, specific web search queries that together cover it ` +
        '(different angles: facts, recent news, risks or criticism, numbers). Use the language most likely to find good ' +
        'sources (usually English). Output only the queries, one per line, no numbering, no quotes, nothing else.',
    },
    { role: 'user', content: question.slice(0, 2000) },
  ];
}

/** Lines → distinct queries; falls back to the question itself. */
export function parseQueries(text: string, question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const q = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^["'“]|["'”]$/g, '')
      .trim()
      .slice(0, 200);
    if (q.length < 3 || /^(here are|queries|search queries)/i.test(q)) continue;
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
    if (out.length >= RESEARCH_MAX_QUERIES) break;
  }
  return out.length ? out : [question.replace(/\s+/g, ' ').trim().slice(0, 200)];
}

/** Round-robin across queries so every angle is represented; duplicates by URL dropped. */
export function mergeSources(perQuery: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  const longest = Math.max(0, ...perQuery.map((r) => r.length));
  for (let i = 0; i < longest && out.length < RESEARCH_MAX_SOURCES; i++) {
    for (const list of perQuery) {
      const r = list[i];
      if (!r) continue;
      const key = r.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= RESEARCH_MAX_SOURCES) break;
    }
  }
  return out;
}

export function researchSystemMessage(sources: SearchResult[], queries: string[], now: Date): string {
  const list = sources.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`).join('\n\n');
  return (
    `Deep Research mode. Today is ${now.toISOString().slice(0, 10)}. The server searched the web for: ` +
    `${queries.map((q) => `"${q}"`).join(', ')}.\n\n` +
    (sources.length ? `Sources found just now:\n\n${list}\n\n` : 'The searches returned no usable sources.\n\n') +
    'Write a well-structured research report that answers the user\'s request:\n' +
    '- Start with a short "Summary" (3 to 5 sentences).\n' +
    '- Then sections with ## headings covering the key findings, with numbers and dates where the sources give them.\n' +
    '- Cite sources inline as [n] right after the claim they support. Only cite what a source actually says.\n' +
    '- Add a "Risks and open questions" section: what is uncertain, disputed or missing.\n' +
    '- End with a "Sources" list: [n] title, URL, only for the sources you cited.\n' +
    'Snippets are short: do not invent details beyond them. If the sources do not cover something, say so and ' +
    'mark anything from your own knowledge as such. No financial advice: present facts and risks, not buy/sell calls.'
  );
}
