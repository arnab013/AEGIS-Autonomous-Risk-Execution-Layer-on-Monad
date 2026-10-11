import { describe, expect, it, vi } from 'vitest';
import { NewsService, parseRss } from '../cloudflare/news.ts';

const now = Date.parse('2026-10-09T12:00:00Z');
const item = (url: string, date = now - 60_000, title = 'A current headline') =>
  `<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${new Date(date).toUTCString()}</pubDate><description><![CDATA[<p>A brief &amp; useful summary.</p>]]></description></item>`;

describe('Fixed dated news context', () => {
  it('calls native-style fetch without binding it to the news service', async () => {
    async function fetcher(this: unknown, url: string | URL | Request) {
      expect(this).toBeUndefined();
      return new Response(
        `<rss>${item(String(url).includes('decrypt') ? 'https://decrypt.co/story' : 'https://www.coindesk.com/story')}</rss>`
      );
    }
    const context = await new NewsService(fetcher as typeof fetch, () => now).get();
    expect(context.articles).toHaveLength(2);
    expect(context.unavailableSources).toEqual([]);
  });
  it('keeps recent HTTPS source articles and strips feed markup', () => {
    const articles = parseRss(
      `<rss><channel>${item('https://www.coindesk.com/markets/story')}${item('https://evil.example/story')}${item('http://www.coindesk.com/story')}${item('https://www.coindesk.com/old', now - 73 * 3600_000)}${item('https://www.coindesk.com/future', now + 3600_000)}</channel></rss>`,
      'CoinDesk',
      now
    );
    expect(articles).toHaveLength(1);
    expect(articles[0].summary).toBe('A brief & useful summary.');
    expect(articles[0].publishedAt).toBe(now - 60_000);
  });

  it('rejects credentials in source links and removes executable markup', () => {
    const articles = parseRss(
      item('https://user:pass@decrypt.co/story') +
        item('https://decrypt.co/story', now, '<script>bad()</script>Safe title'),
      'Decrypt',
      now
    );
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Safe title');
  });

  it('shares in-flight requests and caches for fifteen minutes, retaining independent snapshots', async () => {
    let clock = now;
    const fetcher = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          `<rss>${item(String(url).includes('decrypt') ? 'https://decrypt.co/story' : 'https://www.coindesk.com/story')}</rss>`
        )
    );
    const service = new NewsService(fetcher as typeof fetch, () => clock);
    const [first, second] = await Promise.all([service.get(), service.get()]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    first.articles[0].title = 'Edited caller snapshot';
    expect(second.articles[0].title).toBe('A current headline');
    second.articles[0].title = 'Edited concurrent snapshot';
    expect((await service.get()).articles[0].title).toBe('A current headline');
    clock += 15 * 60_000;
    await service.get();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://www.coindesk.com/arc/outboundfeeds/rss',
      'https://decrypt.co/feed',
      'https://www.coindesk.com/arc/outboundfeeds/rss',
      'https://decrypt.co/feed',
    ]);
  });

  it('reports unavailable sources without inventing current headlines', async () => {
    const service = new NewsService(
      vi.fn(async () => new Response('Unavailable', { status: 503 })) as typeof fetch,
      () => now
    );
    expect(await service.get()).toEqual({
      fetchedAt: now,
      articles: [],
      unavailableSources: ['CoinDesk', 'Decrypt'],
      unavailableDetails: { CoinDesk: 'Feed returned HTTP 503', Decrypt: 'Feed returned HTTP 503' },
    });
  });

  it('does not follow source redirects or reveal unexpected upstream errors', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      expect(options?.redirect).toBe('manual');
      throw new Error('Network failed with private diagnostic details');
    });
    const context = await new NewsService(fetcher as typeof fetch, () => now).get();
    expect(context.unavailableDetails).toEqual({
      CoinDesk: 'Feed request failed',
      Decrypt: 'Feed request failed',
    });
    expect(JSON.stringify(context)).not.toContain('private diagnostic');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects redirect responses without requesting their destinations', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      expect(options?.redirect).toBe('manual');
      return new Response(null, { status: 302, headers: { Location: 'https://outside.example/feed' } });
    });
    const context = await new NewsService(fetcher as typeof fetch, () => now).get();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(context.articles).toEqual([]);
    expect(context.unavailableDetails).toEqual({
      CoinDesk: 'Feed returned HTTP 302',
      Decrypt: 'Feed returned HTTP 302',
    });
    expect(JSON.stringify(context)).not.toContain('outside.example');
  });
});
