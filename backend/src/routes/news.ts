import { Router } from 'express';

const router = Router();

/**
 * Gold/precious-metals news, pulled directly from public RSS feeds — no API
 * key needed. Kitco is the primary source (it's a metals-focused newswire);
 * Investing.com's commodities feed is the fallback if Kitco is unreachable
 * or changes its feed layout. Parsed with a small hand-rolled XML reader
 * rather than adding an RSS-parsing dependency, since RSS <item> blocks are
 * simple and regular enough not to need a full XML parser.
 */
const FEEDS = [
  { url: 'https://www.kitco.com/rss/KitcoNews.xml', source: 'Kitco News' },
  { url: 'https://www.investing.com/rss/news_301.rss', source: 'Investing.com' },
];

interface NewsItem {
  title: string;
  link: string;
  pubDate: string | null;
  source: string;
}

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_MS = 15 * 60 * 1000; // 15 minutes — news doesn't need to be hit on every page load

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

function parseRss(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate') ?? extractTag(block, 'dc:date');
    if (title && link) {
      items.push({ title, link: link.trim(), pubDate, source });
    }
  }
  return items;
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldTradingCompanyJournal/1.0)' },
    });
    if (!res.ok) throw new Error(`${source} returned ${res.status}`);
    const xml = await res.text();
    return parseRss(xml, source);
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/gold', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && cache && Date.now() - cache.fetchedAt < CACHE_MS) {
      return res.json({ items: cache.items, cached: true });
    }

    const errors: string[] = [];
    let items: NewsItem[] = [];
    for (const feed of FEEDS) {
      try {
        items = await fetchFeed(feed.url, feed.source);
        if (items.length > 0) break;
      } catch (err) {
        errors.push(`${feed.source}: ${(err as Error).message}`);
      }
    }

    if (items.length === 0) {
      // Fall back to whatever was last cached, even if stale, rather than
      // showing nothing — a few-hour-old headline list beats an empty page.
      if (cache) {
        return res.json({ items: cache.items, cached: true, stale: true, errors });
      }
      return res.status(502).json({ error: 'Could not reach any gold news feed', details: errors });
    }

    items.sort((a, b) => {
      const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
      const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
      return tb - ta;
    });
    items = items.slice(0, 20);

    cache = { items, fetchedAt: Date.now() };
    res.json({ items, cached: false });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
