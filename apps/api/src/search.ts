export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearch {
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>;
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
export function createBraveSearch(apiKey: string, doFetch: typeof fetch = fetch): WebSearch {
  return {
    async search(query, signal) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
      const res = await doFetch(url, {
        headers: { accept: 'application/json', 'x-subscription-token': apiKey },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`search failed with HTTP ${res.status}`);
      }
      const json = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
      return (json.web?.results ?? [])
        .filter((r) => typeof r.url === 'string' && typeof r.title === 'string')
        .slice(0, 5)
        .map((r) => ({ title: stripTags(r.title!), url: r.url!, description: stripTags(r.description ?? '').slice(0, 500) }));
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
