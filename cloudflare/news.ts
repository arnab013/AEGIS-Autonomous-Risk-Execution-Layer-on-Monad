import type { NewsArticle, NewsContext } from '../src/ai/types.ts';

const feeds = [
  {
    source: 'CoinDesk' as const,
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss',
    host: 'coindesk.com',
  },
  { source: 'Decrypt' as const, url: 'https://decrypt.co/feed', host: 'decrypt.co' },
];
const cacheMs = 15 * 60_000;
const recentMs = 72 * 60 * 60_000;
const maxFeedBytes = 768 * 1024;

function plainText(value: string, limit: number): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[
          entity
        ] ?? ' '
    )
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, number: string) => {
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function parseRss(xml: string, source: NewsArticle['source'], now: number): NewsArticle[] {
  const host = feeds.find((feed) => feed.source === source)!.host;
  const articles: NewsArticle[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    if (articles.length >= 30) break;
    const item = match[1];
    const field = (name: string) =>
      item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '';
    const title = plainText(field('title'), 220);
    const publishedAt = Date.parse(plainText(field('pubDate') || field('dc:date'), 100));
    if (
      !title ||
      !Number.isFinite(publishedAt) ||
      publishedAt > now + 5 * 60_000 ||
      now - publishedAt > recentMs
    )
      continue;
    let url: URL;
    try {
      url = new URL(plainText(field('link'), 1500));
    } catch {
      continue;
    }
    if (
      url.protocol !== 'https:' ||
      ![host, `www.${host}`].includes(url.hostname) ||
      url.username ||
      url.password
    )
      continue;
    url.hash = '';
    articles.push({
      id: `${source}:${url.pathname}`,
      title,
      summary: plainText(field('description'), 420),
      url: url.href,
      source,
      publishedAt,
    });
  }
  return articles;
}

async function readFeed(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  if (!response.body) throw new Error('Feed response was empty');
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxFeedBytes) {
        await reader.cancel();
        throw new Error('News feed is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class NewsService {
  private cached?: NewsContext;
  private pending?: Promise<NewsContext>;
  private fetcher: typeof fetch;
  private clock: () => number;
  constructor(fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
    // Workers' native fetch must not receive this service as its receiver.
    this.fetcher = (input, init) => fetcher(input, init);
    this.clock = clock;
  }

  async get(): Promise<NewsContext> {
    const now = this.clock();
    if (this.cached && now - this.cached.fetchedAt < cacheMs) return this.fresh(this.cached, now);
    if (this.pending) return this.pending.then((context) => this.fresh(context, this.clock()));
    this.pending = this.load(now);
    try {
      this.cached = await this.pending;
      return this.fresh(this.cached, this.clock());
    } finally {
      this.pending = undefined;
    }
  }

  private fresh(context: NewsContext, now: number): NewsContext {
    return structuredClone({
      ...context,
      articles: context.articles.filter((article) => now - article.publishedAt <= recentMs),
    });
  }

  private async load(now: number): Promise<NewsContext> {
    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const response = await this.fetcher(feed.url, {
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml',
            'User-Agent': 'Aegis/1.0 (+https://aegis.himaloy2608.workers.dev)',
          },
          // Workers supports manual redirects; readFeed rejects any 3xx response.
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        });
        return parseRss(await readFeed(response), feed.source, now);
      })
    );
    const articles: NewsArticle[] = [];
    const unavailableSources: string[] = [];
    const unavailableDetails: Record<string, string> = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length) articles.push(...result.value);
      else {
        const source = feeds[index].source;
        unavailableSources.push(source);
        const reason = result.status === 'rejected' ? String(result.reason?.message ?? '') : '';
        unavailableDetails[source] =
          result.status === 'fulfilled'
            ? 'No dated articles in the preceding 72 hours'
            : /^Feed returned HTTP \d{3}$/.test(reason) ||
                ['Feed response was empty', 'News feed is too large'].includes(reason)
              ? reason
              : 'Feed request failed';
      }
    });
    const unique = [...new Map(articles.map((article) => [article.url, article])).values()];
    return {
      fetchedAt: now,
      articles: unique.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 12),
      unavailableSources,
      ...(unavailableSources.length ? { unavailableDetails } : {}),
    };
  }
}
