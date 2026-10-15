// shell.mjs - the document: head (SEO carried from the live page), chrome, main, scripts.
import { esc, attr } from './util.mjs';
import { topbar, header, footer, ageGate } from './chrome.mjs';

const ORIGIN = 'https://www.thehighway90.com';

export function shell(ctx, o) {
  const p = o.page || {};
  const h = p.head || {};
  const title = o.title || h.title || 'Highway 90';
  const desc = o.description != null ? o.description : (h.description || '');
  const canonical = h.canonical || (p.path ? ORIGIN + p.path : ORIGIN + '/');
  const og = h.og || {};
  let ogImg = og['og:image'] || null;
  if (!ogImg && o.ogImage) { try { ogImg = ORIGIN + ctx.imgSrc(o.ogImage, 1280); } catch (e) { ctx.warn('og: ' + e.message); } }
  // the live page's own structured data, verbatim (Rank Math graph: LocalBusiness, WebPage, FAQ, Product ...)
  const ld = (h.jsonld || []).map((j) => '<script type="application/ld+json">' + JSON.stringify(j).replace(/</g, '\\u003c') + '</script>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>' + esc(title) + '</title>'
    + (desc ? '<meta name="description" content="' + attr(desc) + '">' : '')
    + '<link rel="canonical" href="' + attr(canonical) + '">'
    + (h.robots ? '<meta name="robots" content="' + attr(h.robots) + '">' : '')
    + '<meta property="og:type" content="' + attr(og['og:type'] || (p.kind === 'post' ? 'article' : 'website')) + '"><meta property="og:site_name" content="Highway 90"><meta property="og:title" content="' + attr(og['og:title'] || title) + '">'
    + (desc ? '<meta property="og:description" content="' + attr(og['og:description'] || desc) + '">' : '') + '<meta property="og:url" content="' + attr(canonical) + '">'
    + (ogImg ? '<meta property="og:image" content="' + attr(ogImg) + '"><meta name="twitter:card" content="summary_large_image">' : '')
    + (og['article:published_time'] ? '<meta property="article:published_time" content="' + attr(og['article:published_time']) + '">' : '')
    + (og['article:modified_time'] ? '<meta property="article:modified_time" content="' + attr(og['article:modified_time']) + '">' : '')
    + '<meta name="theme-color" content="#05371e"><link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
    + '<link rel="preload" href="/assets/fonts/rubik-normal-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/heebo-normal-latin.woff2" as="font" type="font/woff2" crossorigin>'
    + (o.preload || '')
    + '<link rel="stylesheet" href="' + ctx.assets.css + '">'
    + '<script>document.documentElement.classList.add("js-motion");setTimeout(function(){if(!window.__hwy90)document.documentElement.classList.remove("js-motion")},2500)</script>'
    + ld
    + '</head><body class="' + attr(o.bodyClass || '') + '">'
    + '<a class="skip" href="#main">Skip to content</a><div class="progress" aria-hidden="true"></div>'
    + topbar(ctx) + header(ctx, p)
    + '<main id="main">' + o.main + '</main>'
    + footer(ctx) + ageGate(ctx)
    + '<script src="' + ctx.assets.js + '" defer></script></body></html>';
}
