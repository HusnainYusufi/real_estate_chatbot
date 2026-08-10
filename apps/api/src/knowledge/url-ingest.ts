import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { BadRequestException, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

const logger = new Logger('UrlIngest');

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

const MAX_PAGES_CAP = 30;
const PER_FETCH_TIMEOUT_MS = 15_000;
const MIN_TEXT_CHARS = 60;

/** Reject URLs that resolve to private / loopback / link-local addresses (SSRF). */
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Only http(s) URLs can be ingested');
  }
  if (process.env.ALLOW_PRIVATE_INGEST === '1') return;
  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new BadRequestException(`Could not resolve host ${url.hostname}`);
  }
  for (const { address } of addrs) {
    const v = net.isIP(address);
    const isPrivate =
      /^(127\.|10\.|192\.168\.|169\.254\.|::1|fc|fd|fe80)/i.test(address) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
      (v === 4 && address === '0.0.0.0');
    if (isPrivate) {
      throw new BadRequestException(
        `Refusing to fetch ${url.hostname} — it resolves to a private address.`,
      );
    }
  }
}

/** Fetch one URL and extract a clean title + readable text. Returns null if not HTML. */
export async function fetchAndExtract(rawUrl: string): Promise<FetchedPage | null> {
  const url = new URL(rawUrl);
  await assertPublicUrl(url);

  const res = await fetch(url, {
    headers: {
      // Some sites reject requests without a browser-ish UA.
      'User-Agent': 'Mozilla/5.0 (compatible; ChatbotSuiteBot/1.0; +knowledge-ingest)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new BadRequestException(`Fetch failed (${res.status}) for ${url.href}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, nav, footer, header, form, [aria-hidden="true"]').remove();

  const title = ($('title').first().text() || url.pathname || url.href).trim().slice(0, 200);
  const main = $('main').text() || $('article').text() || $('body').text();
  const text = main.replace(/[ \t\r\f]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();

  return { url: url.href, title, text };
}

/** Extract same-origin links from a page for crawling. */
function sameOriginLinks(html: string, base: URL): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const u = new URL(href, base);
      u.hash = '';
      if (u.origin === base.origin && (u.protocol === 'http:' || u.protocol === 'https:')) {
        out.add(u.href);
      }
    } catch {
      /* ignore malformed href */
    }
  });
  return [...out];
}

/**
 * Ingest a URL. When `crawl` is true, does a shallow same-origin BFS up to
 * `maxPages`. Returns the pages with usable text.
 */
export async function ingestUrl(
  startUrl: string,
  opts: { crawl?: boolean; maxPages?: number } = {},
): Promise<FetchedPage[]> {
  const start = new URL(startUrl);
  await assertPublicUrl(start);

  const maxPages = opts.crawl ? Math.min(Math.max(1, opts.maxPages ?? 10), MAX_PAGES_CAP) : 1;
  const queue = [start.href];
  const seen = new Set<string>([start.href]);
  const pages: FetchedPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift()!;
    let page: FetchedPage | null = null;
    let html = '';
    try {
      const url = new URL(current);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChatbotSuiteBot/1.0)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS),
      });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) continue;
      html = await res.text();
      const $ = cheerio.load(html);
      $('script, style, noscript, svg, iframe, nav, footer, header, form').remove();
      const title = ($('title').first().text() || url.pathname).trim().slice(0, 200);
      const text = ($('main').text() || $('article').text() || $('body').text())
        .replace(/[ \t\r\f]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
      page = { url: url.href, title, text };
    } catch (err) {
      logger.warn(`crawl fetch failed for ${current}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (page && page.text.length >= MIN_TEXT_CHARS) pages.push(page);

    if (opts.crawl && html && pages.length < maxPages) {
      for (const link of sameOriginLinks(html, start)) {
        if (!seen.has(link) && seen.size < maxPages * 4) {
          seen.add(link);
          queue.push(link);
        }
      }
    }
  }

  if (pages.length === 0) {
    throw new BadRequestException(
      'No readable text found at that URL. The site may render content with JavaScript, which this ingester does not execute.',
    );
  }
  return pages;
}
