export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearch {
  /** `count`: results wanted (default 5, at most 10). */
  search(query: string, signal: AbortSignal, count?: number): Promise<SearchResult[]>;
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

/**
 * Brave Search from our server, so the user's IP never reaches the search engine.
 * Errors carry no query text or response body.
 */
export function createBraveSearch(apiKey: string, doFetch: typeof fetch = fetch, baseUrl = 'https://api.search.brave.com'): WebSearch {
  const base = baseUrl.replace(/\/$/, '');
  return {
    async search(query, signal, count = 5) {
      const n = Math.min(10, Math.max(1, count));
      // extra_snippets gives longer excerpts on plans that include them; others ignore it.
      const url = `${base}/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}&extra_snippets=true`;
      const res = await doFetch(url, {
        headers: { accept: 'application/json', 'x-subscription-token': apiKey },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`search failed with HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        web?: { results?: { title?: string; url?: string; description?: string; extra_snippets?: unknown }[] };
      };
      return (json.web?.results ?? [])
        .filter((r) => typeof r.url === 'string' && typeof r.title === 'string')
        .slice(0, n)
        .map((r) => {
          const extra = Array.isArray(r.extra_snippets) ? r.extra_snippets.filter((x): x is string => typeof x === 'string') : [];
          const text = [r.description ?? '', ...extra].map(stripTags).filter(Boolean).join(' … ');
          return { title: stripTags(r.title!), url: r.url!, description: text.slice(0, extra.length ? 1200 : 500) };
        });
    },
  };
}

export function searchSystemMessage(results: SearchResult[]): string {
  const list = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`).join('\n\n');
  return (
    `Web search results for the user's latest message, retrieved just now:\n\n${list}\n\n` +
    'Use these results where they are relevant and cite them inline as [n] with the URL. ' +
    'If they are not relevant, answer from your own knowledge and say the search did not help.'
  );
}
