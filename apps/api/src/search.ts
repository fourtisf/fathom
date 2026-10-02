export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearch {
  /** `count`: results wanted (default 5, at most 10). */
  search(query: string, signal: AbortSignal, count?: number): Promise<SearchResult[]>;
  /** Fixed credits (micro) charged per search that returned results, on top of tokens. 0 or absent: none. */
  readonly feeMicro?: bigint;
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

export interface OpenRouterSearchOptions {
  baseUrl: string;
  apiKey: string;
  /** A cheap chat model that relays the results (provider id, e.g. deepseek/deepseek-v4-flash). */
  model: string;
  feeMicro: bigint;
  /** Provider routing policy etc. (zero data retention), from the inference preset. */
  extraBody?: Record<string, unknown>;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

const RELAY_PROMPT =
  'You relay web search results. For every search result you were given, output one line: ' +
  '"- [page title](url): one factual sentence on what the page says about the query". Output nothing else.';
const MD_LINK = /\[([^\]\n]{1,300})\]\((https:\/\/[^)\s]{1,2000})\)(?:\s*[:\-–—]\s*([^\n]*))?/g;

/**
 * Web search through OpenRouter's web plugin (Exa), from our server, with the same key as inference.
 * Results come back as url_citation annotations; when a model answers without them, the markdown links
 * it listed are used. Errors carry no query text or response body.
 */
export function createOpenRouterSearch(opts: OpenRouterSearchOptions): WebSearch {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  return {
    feeMicro: opts.feeMicro,
    async search(query, signal, count = 5) {
      const n = Math.min(10, Math.max(1, count));
      const res = await doFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}`, ...opts.headers },
        body: JSON.stringify({
          ...opts.extraBody,
          model: opts.model,
          stream: false,
          max_tokens: 900,
          messages: [
            { role: 'system', content: RELAY_PROMPT },
            { role: 'user', content: query },
          ],
          plugins: [{ id: 'web', engine: 'exa', max_results: n }],
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`search failed with HTTP ${res.status}`);
      }
      const json = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: unknown; annotations?: unknown } }[];
      } | null;
      const msg = json?.choices?.[0]?.message;
      const out: SearchResult[] = [];
      const seen = new Set<string>();
      const add = (title: string, url: string, description: string) => {
        if (!/^https:\/\//.test(url) || seen.has(url) || out.length >= n) return;
        seen.add(url);
        let host = url;
        try {
          host = new URL(url).hostname;
        } catch {
          return;
        }
        out.push({ title: stripTags(title).slice(0, 300) || host, url, description: stripTags(description).slice(0, 1200) });
      };
      if (Array.isArray(msg?.annotations)) {
        for (const a of msg.annotations as { type?: unknown; url_citation?: { url?: unknown; title?: unknown; content?: unknown } }[]) {
          const c = a?.type === 'url_citation' ? a.url_citation : undefined;
          if (c && typeof c.url === 'string') add(typeof c.title === 'string' ? c.title : '', c.url, typeof c.content === 'string' ? c.content : '');
        }
      }
      // Descriptions from the relay text fill in annotations that came without excerpts.
      const text = typeof msg?.content === 'string' ? msg.content : '';
      for (const m of text.matchAll(MD_LINK)) {
        const url = m[2]!;
        const known = out.find((r) => r.url === url);
        if (known) {
          if (!known.description && m[3]) known.description = stripTags(m[3]).slice(0, 1200);
        } else add(m[1]!, url, m[3] ?? '');
      }
      return out;
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
