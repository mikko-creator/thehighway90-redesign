// inner.mjs - every page that is not the home: one hero band + the live sections, with type-aware art, and
// dedicated bodies for products (menu snapshot), events (The Events Calendar) and the menu-driven taxonomy pages.
import { esc, attr, strip, ICON } from './util.mjs';
import { btn, rail, productCard, pickProducts, menuGrid, renderBlock, renderBlocks, flatten, CAT_ART, postCard, richText } from './blocks.mjs';
import { backdrop, protrude, lane } from './parts.mjs';

const LABEL = { categories: 'Categories', specials: 'Specials', strains: 'Strains', effects: 'Effects', terpenes: 'Terpenes', cannabinoids: 'Cannabinoids', recreational: 'Recreational', stores: 'Stores', brands: 'Brands', products: 'Products', blog: 'Blog', events: 'Events', event: 'Events', menu: 'Menu' };
const img = (ctx, ref, o) => { try { return ctx.img(ref, o); } catch (e) { ctx.warn('inner img: ' + e.message); return ''; } };
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/** the hero art for a page: a real photo where the live site has one, else the generated set (see DECISIONS D5) */
function artFor(page, ctx) {
  const segs = page.path.split('/').filter(Boolean);
  const s0 = segs[0] || '';
  const fx = s0 === 'effects' && segs[1] ? 'assets/source/wp-content-uploads-hwy90-effects-' + segs[1] + '.webp' : null;
  if (fx && ctx.exists(fx)) return { ref: fx, real: true };
  if (s0 === 'categories') return { ref: CAT_ART[segs[1] === 'vaporizers' ? 'vaporizers' : segs[1]] || 'G-JAR' };
  if (s0 === 'specials' || /deals|specials|under-menu|on-sale/.test(s0)) return { ref: 'G-JAR' };
  if (s0 === 'strains' || s0 === 'effects') return { ref: 'G-BUD-GREEN' };
  if (s0 === 'terpenes' || s0 === 'cannabinoids' || s0 === 'faqs') return { ref: 'G-TRICHOME' };
  if (s0 === 'recreational' || s0 === 'directions' || s0 === 'dispensary-near-me-marlton-nj') return { ref: 'G-HERO-ROAD' };
  if (s0 === 'stores' || s0 === 'about' || s0 === 'contact' || s0 === 'reviews') return { ref: 'assets/source/2024-10-hwy90-img-seo.webp', real: true };
  if (s0 === 'events' || s0 === 'event') return { ref: 'G-LIGHTS' };
  if (s0 === 'jobs' || s0 === 'advertising-with-us' || s0 === 'blog') return { ref: 'G-GREENHOUSE' };
  if (s0 === 'menu') return { ref: segs[1] ? 'G-BUD-ORANGE' : 'G-JAR' };
  if (s0 === 'brands') return { ref: 'G-JAR' };
  if (/rewards|my-points|my-orders|download/.test(s0)) return { ref: 'G-BUD-ORANGE' };
  return { ref: 'G-ROAD-NIGHT' };
}

function crumbs(page) {
  const segs = page.path.split('/').filter(Boolean);
  const out = [{ text: 'Home', href: '/' }];
  if (segs.length > 1) { const s0 = segs[0]; const base = s0 === 'event' ? '/events/' : '/' + s0 + '/'; if (ctxPages && ctxPages.has(base)) out.push({ text: LABEL[s0] || (ctxPages.get(base).h1 || s0), href: base }); }
  if (segs.length > 2 && segs[0] === 'categories') { const p2 = '/categories/' + segs[1] + '/'; if (ctxPages && ctxPages.has(p2)) out.push({ text: segs[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), href: p2 }); }
  out.push({ text: page.h1 || '', href: null });
  return out;
}
let ctxPages = null;

function hero(page, ctx, { intro = '', buttons = [], art = null, kicker = '' } = {}) {
  const a = art || artFor(page, ctx);
  const cr = crumbs(page);
  const s0 = page.path.split('/').filter(Boolean)[0] || '';
  const cut = ['CUT-BUD-A', 'CUT-LEAF', 'CUT-BUD-B'][hash(page.path) % 3];
  const artHtml = a.html || img(ctx, a.ref, { alt: a.alt || '', sizes: '(max-width: 900px) 90vw, 520px', widths: [480, 720, 960, 1280], loading: 'eager', fetchpriority: 'high' });
  return '<section class="phero on-dark"><div class="phero__map" aria-hidden="true"></div><div class="phero__dots ht ht--cream" aria-hidden="true"></div>'
    + '<div class="wrap phero__grid"><div class="phero__card glass glass--dark glass--pop" data-reveal="left">'
    + '<ol class="crumbs">' + cr.map((c) => '<li>' + (c.href ? '<a href="' + attr(c.href) + '">' + esc(c.text) + '</a>' : '<span aria-current="page">' + esc(c.text) + '</span>') + '</li>').join('') + '</ol>'
    + (kicker || LABEL[s0] ? '<span class="sign sign--orange"><span class="sign__exit">90</span>' + esc(kicker || LABEL[s0]) + '</span>' : '')
    + '<h1 class="split">' + esc(page.h1 || page.head.title || '') + '</h1>'
    + (intro ? '<div class="phero__intro" data-reveal>' + intro + '</div>' : '')
    + (buttons.length ? '<div class="btns" data-reveal>' + buttons.map((b, i) => btn(b.text, b.href, { kind: i ? 'glass' : 'primary' })).join('') + '</div>' : '')
    + '</div><div class="phero__art" data-reveal="zoom"><figure class="frame phero__frame' + (a.contain ? ' is-contain' : '') + '">' + artHtml + '</figure>'
    + protrude(ctx, cut, 'phero__cut', { depth: 0.16, sizes: '(max-width: 900px) 34vw, 260px', rot: hash(page.path) % 2 ? 14 : -16, widths: [320, 480] })
    + '</div></div>' + lane('phero__lane') + '</section>';
}

/** split the first live section into hero material (h1, short intro, buttons) and the rest */
function heroParts(page) {
  const first = page.sections[0];
  if (!first) return { intro: '', buttons: [], rest: page.sections };
  const f = flatten([first]);
  const used = new Set();
  const h1 = f.find((b) => (b.t === 'heading' && b.level === 'h1') || (b.t === 'text' && strip(b.html) === page.h1));
  if (h1) used.add(h1);
  const crumb = f.find((b) => b.t === 'text' && /^(Home|Shop) \//.test(strip(b.html)));
  if (crumb) used.add(crumb);
  const after = f.filter((b) => !used.has(b));
  const intro = [];
  const buttons = [];
  // a post's date line (post-info) belongs with its title, not in a section of its own
  for (const b of after) if (b.t === 'meta') { intro.push(b); used.add(b); }
  for (const b of after.filter((x) => !used.has(x)).slice(0, 4)) {
    if (b.t === 'text' && strip(b.html).length < 260 && !intro.some((x) => x.t !== 'meta')) { intro.push(b); used.add(b); }
    else if (b.t === 'heading' && b.level !== 'h1' && strip(b.html).length < 140 && !intro.some((x) => x.t !== 'meta')) { intro.push(b); used.add(b); }
    else if (b.t === 'button' && buttons.length < 2) { buttons.push(b); used.add(b); }
  }
  const leftover = f.filter((b) => !used.has(b));
  const rest = (leftover.length ? [{ t: 'group', id: first.id, children: leftover }] : []).concat(page.sections.slice(1));
  return { intro: intro.map((b) => (b.t === 'meta' ? '<p class="phero__meta">' + b.items.map((x) => '<span>' + esc(x) + '</span>').join('') + '</p>' : b.t === 'text' ? b.html : '<p>' + b.html + '</p>')).join(''), buttons, rest };
}

function body(sections, ctx, opts) {
  return sections.map((s, i) => {
    const html = renderBlock(s, ctx, { ...opts, skipH1: true });
    if (!html.replace(/<[^>]+>/g, '').trim() && !/<img|<iframe|class="prod"/.test(html)) return '';
    const tone = ['paper', 'cream', 'paper', 'mint'][i % 4];
    return '<section class="sec psec psec--' + tone + (i % 3 === 1 ? ' ht ht--ink' : '') + '"><div class="wrap">' + html + '</div></section>';
  }).join('');
}

// ---------- product page: the live product's JSON-LD (menu snapshot) ----------
function productPage(page, ctx) {
  const p = ((ctx.menu && ctx.menu.products) || []).find((x) => x.path === page.path);
  if (!p) return hero(page, ctx) + body(page.sections, ctx, {}) + '<section class="sec"><div class="wrap">' + menuGrid(ctx, {}) + '</div></section>';
  const cat = p.category || 'other';
  const art = p.photo ? { html: img(ctx, p.photo, { alt: p.name, sizes: '(max-width: 900px) 90vw, 520px', widths: [480, 720, 960], loading: 'eager', fetchpriority: 'high' }), contain: true } : { ref: CAT_ART[cat] || 'G-JAR' };
  const offers = '<ul class="offers" data-stagger>' + p.offers.map((o) => '<li><span>' + esc(o.size && o.size !== 'N/A' ? o.size : 'Each') + '</span><strong>$' + esc(Number.isInteger(o.price) ? o.price : o.price.toFixed(2)) + '</strong></li>').join('') + '</ul>';
  const intro = (p.brand ? '<p class="prod-brand">' + esc(p.brand) + '</p>' : '') + offers;
  const more = pickProducts(ctx, {}, { category: cat, limit: 12 }).filter((x) => x.path !== p.path);
  return hero(page, ctx, { intro, buttons: [{ text: 'Order Online', href: '/menu/' }, { text: 'Specials', href: '/specials/' }], art, kicker: LABEL.products })
    + (p.description ? '<section class="sec psec psec--paper"><div class="wrap wrap--narrow"><div class="prose" data-reveal' + (p.description.length > 700 ? ' data-clamp' : '') + '><h2>About this product</h2>' + p.description.split('\n').map((l) => '<p>' + esc(l) + '</p>').join('') + '</div></div></section>' : '')
    + (more.length ? '<section class="sec psec psec--cream ht ht--ink"><div class="wrap">' + rail(more.map((x) => productCard(x, ctx)), { head: '<h2 class="split">More ' + esc(cat.replace(/-/g, ' ')) + '</h2>', cls: 'rail--prod', w: 'clamp(230px, 22vw, 280px)' }) + '</div></section>' : '');
}

// ---------- events ----------
function eventsPage(page, ctx) {
  const ev = page.events || {};
  if (ev.mode === 'single') {
    const art = ev.img ? { html: img(ctx, ev.img.src, { alt: ev.img.alt || '', sizes: '(max-width: 900px) 90vw, 520px', loading: 'eager' }) } : null;
    const meta = (ev.meta || []).length ? '<dl class="evmeta">' + ev.meta.map((r) => (r.tag === 'dt' ? '<dt>' + esc(r.text) + '</dt>' : r.tag === 'dd' ? '<dd>' + esc(r.text) + '</dd>' : '')).join('') + '</dl>' : '';
    return hero(page, ctx, { intro: ev.schedule ? '<p class="evdate">' + ICON.bolt + esc(ev.schedule) + '</p>' : '', buttons: [{ text: 'All Events', href: '/events/' }], art, kicker: 'Event' })
      + '<section class="sec psec psec--paper"><div class="wrap ev__grid"><div class="prose" data-reveal>' + richText(ev.html, ctx) + '</div>' + (meta ? '<aside class="glass glass--pop ev__meta" data-reveal>' + meta + '</aside>' : '') + '</div></section>';
  }
  const items = (ev.items || []).map((it, i) => postCard({ title: it.title, href: it.href, img: it.img, excerpt: it.excerpt, date: it.date }, ctx, i)).join('');
  return hero(page, ctx, { intro: (ev.messages || []).map((m) => '<p>' + esc(m) + '</p>').join(''), kicker: 'Events' })
    + '<section class="sec psec psec--paper"><div class="wrap">' + (items ? '<div class="grid grid--3">' + items + '</div>' : '') + '</div></section>';
}

export function innerPage(page, ctx) {
  ctxPages = ctx.pages;
  if (page.kind === 'event') return eventsPage(page, ctx);
  if (/^\/products\/[^/]+\/$/.test(page.path)) return productPage(page, ctx);
  const segs = page.path.split('/').filter(Boolean);
  const s0 = segs[0] || '';
  const opts = {};
  if (s0 === 'categories' && segs[1]) opts.category = segs[1];
  if (s0 === 'menu' && /vape/.test(segs[1] || '')) opts.category = 'vaporizers';
  if (s0 === 'menu' && /flower|ounces|thc/.test(segs[1] || '')) opts.category = 'flower';
  if (s0 === 'menu' && /edible|gumm/.test(segs[1] || '')) opts.category = 'edibles';
  if (/^(pre-roll|vape|flower|edible|concentrate)-specials$/.test(s0)) opts.category = { 'pre-roll': 'pre-rolls', vape: 'vaporizers', flower: 'flower', edible: 'edibles', concentrate: 'concentrates' }[s0.replace(/-specials$/, '')];
  if (s0 === 'brands' && segs[1]) opts.brand = page.h1;
  const { intro, buttons, rest } = heroParts(page);
  // long SEO copy folds behind "Read more" on phones; an article's own body never does
  opts.clamp = page.kind !== 'post';
  let main = hero(page, ctx, { intro, buttons }) + body(rest, ctx, opts);
  // thin, menu-driven pages (terpenes, cannabinoids, strains, effects, brands, menus): the live page renders its
  // product list client-side, so the redesign shows the menu snapshot in that slot
  const hasMenu = JSON.stringify(page.sections).includes('"t":"menu"');
  const thin = flatten(rest).filter((b) => b.t !== 'heading').length < 2;
  if (!hasMenu && (thin || /^(terpenes|cannabinoids|strains|effects|brands)$/.test(s0)) && segs.length > 1) main += '<section class="sec psec psec--cream"><div class="wrap">' + menuGrid(ctx, { ...opts, offset: hash(page.path) % 40 }) + '</div></section>';
  return main;
}

/** a 404 in the same chrome */
export function notFoundMain(ctx) {
  return '<section class="phero on-dark phero--404"><div class="phero__map" aria-hidden="true"></div><div class="wrap phero__grid"><div class="phero__card glass glass--dark glass--pop">'
    + '<span class="sign sign--orange"><span class="sign__exit">404</span>Wrong exit</span><h1>Page not found</h1>'
    + '<div class="btns">' + btn('Order Online', '/menu/') + btn('Home', '/', { kind: 'glass' }) + '</div></div>'
    + '<div class="phero__art">' + protrude(ctx, 'CUT-BUD-A', 'phero__cut', { depth: 0.1, sizes: '300px', widths: [320, 480] }) + '</div></div></section>';
}
