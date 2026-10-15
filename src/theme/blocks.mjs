// blocks.mjs - the generic block renderer: every typed block from src/lib/extract.mjs -> Route 90 Pop markup.
// Copy is carried verbatim (block html is sanitised by the extractor); only the presentation changes.
import { esc, attr, strip, ICON, linkAttrs, stars, initials } from './util.mjs';

let FORM_N = 0;
const PRIMARY = /order|shop|specials|menu|rewards|sign up|join|download|get directions|learn more/i;

export function btn(text, href, opts = {}) {
  const kind = opts.kind || (PRIMARY.test(text) ? 'primary' : 'glass');
  const h = href || '/menu/';
  const ico = /^tel:/.test(h) ? ICON.phone : ICON.arrow;
  return '<a class="btn' + (kind === 'primary' ? '' : ' btn--' + kind) + (opts.sm ? ' btn--sm' : '') + '" href="' + attr(h) + '"' + linkAttrs(h) + '>' + esc(text) + '<span class="ico">' + ico + '</span></a>';
}

/** replace <img data-ref> placeholders inside extracted rich text with responsive images */
export function richText(html, ctx, sizes = '(max-width: 760px) 100vw, 720px') {
  return String(html || '').replace(/<img data-ref="([^"]+)" alt="([^"]*)">/g, (m, ref, alt) => {
    try { return '<figure class="frame">' + ctx.img(ref.replace(/&amp;/g, '&'), { alt: alt.replace(/&quot;/g, '"').replace(/&amp;/g, '&'), sizes }) + '</figure>'; }
    catch (e) { ctx.warn('rich image: ' + e.message); return ''; }
  });
}

export function figure(b, ctx, opts = {}) {
  let im;
  // a logo or badge is drawn on transparency: it floats as a cut-out, never cropped into a photo frame
  if (/logo|badge/i.test(b.img.src)) {
    try { im = ctx.img(b.img.src, { alt: b.img.alt || '', sizes: '220px', widths: [240, 360, 480] }); } catch (e) { ctx.warn('image: ' + e.message); return ''; }
    return '<figure class="cutout logo-float" data-reveal="pop">' + im + '</figure>';
  }
  try { im = ctx.img(b.img.src, { alt: b.img.alt || '', sizes: opts.sizes || '(max-width: 760px) 100vw, 600px' }); }
  catch (e) { ctx.warn('image: ' + e.message); return ''; }
  const inner = b.href ? '<a href="' + attr(b.href) + '"' + linkAttrs(b.href) + '>' + im + '</a>' : im;
  return '<figure class="frame' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.reveal === false ? '' : ' data-reveal="zoom"') + '>' + inner + (b.caption ? '<figcaption>' + b.caption + '</figcaption>' : '') + '</figure>';
}

export function rail(items, opts = {}) {
  const nav = '<div class="rail__nav"><button class="rail__btn" type="button" data-rail="prev" aria-label="Previous">' + ICON.left + '</button><button class="rail__btn" type="button" data-rail="next" aria-label="Next">' + ICON.right + '</button></div>';
  return '<div class="rail' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.w ? ' style="--rail-w:' + opts.w + '"' : '') + '>'
    + '<div class="rail__head">' + (opts.head || '') + nav + '</div>'
    + '<div class="rail__track" role="list">' + items.map((x) => '<div role="listitem">' + x + '</div>').join('') + '</div></div>';
}

// ---------- the menu snapshot (src/content/menu.json) ----------
export const CAT_ART = { flower: 'G-BUD-GREEN', 'pre-rolls': 'G-PREROLL', vaporizers: 'G-VAPE', edibles: 'G-DRINK', concentrates: 'G-ROSIN', topicals: 'G-TOPICAL', tinctures: 'G-TINCTURE', accessories: 'G-ACCESSORIES', other: 'G-JAR' };
const CAT_TONE = { flower: '#d5e8c8', 'pre-rolls': '#ffd9b8', vaporizers: '#cfe6df', edibles: '#ffe7a8', concentrates: '#ffe2c4', topicals: '#e3efd9', tinctures: '#f6e3cf', accessories: '#e9e6da', other: '#f3f1e5' };
const CAT_POP = { flower: 'var(--green)', 'pre-rolls': 'var(--orange)', vaporizers: 'var(--deep)', edibles: 'var(--orange)', concentrates: 'var(--lane)', topicals: 'var(--leaf)', tinctures: 'var(--orange)', accessories: 'var(--ink)', other: 'var(--green)' };
const CAT_LABEL = { flower: 'Flower', 'pre-rolls': 'Pre-Rolls', vaporizers: 'Vape', edibles: 'Edible', concentrates: 'Concentrate', topicals: 'Topical', tinctures: 'Tincture', accessories: 'Accessory', other: 'Menu' };
const money = (n) => (n == null ? '' : '$' + (Number.isInteger(n) ? n : n.toFixed(2)));

export function productCard(p, ctx) {
  const cat = p.category || 'other';
  let im = '';
  try {
    im = p.photo
      ? ctx.img(p.photo, { alt: p.name, sizes: '(max-width: 760px) 70vw, 290px', widths: [320, 480, 640], cls: 'is-photo' })
      : ctx.img(CAT_ART[cat] || 'G-JAR', { alt: '', sizes: '(max-width: 760px) 70vw, 290px', widths: [320, 480, 640] });
  } catch (e) { ctx.warn('product image: ' + e.message); }
  const size = p.offers && p.offers[0] && p.offers[0].size && p.offers[0].size !== 'N/A' ? p.offers[0].size : '';
  return '<a class="prod" href="' + attr(p.path) + '" data-tilt style="--tone:' + CAT_POP[cat] + ';--tint:' + CAT_TONE[cat] + '">'
    + '<div class="prod__img' + (p.photo ? ' prod__img--photo' : '') + '">' + im + '<span class="chip chip--fill prod__tag">' + esc(CAT_LABEL[cat]) + '</span></div>'
    + '<div class="prod__body">' + (p.brand ? '<span class="prod__brand">' + esc(p.brand) + '</span>' : '')
    + '<h3 class="prod__name">' + esc(p.name) + '</h3>'
    + '<div class="prod__meta"><span class="prod__price">' + esc(money(p.price)) + (size ? ' <small class="muted">/ ' + esc(size) + '</small>' : '') + '</span><span class="prod__go" aria-hidden="true">' + ICON.arrow + '</span></div>'
    + '</div></a>';
}

/** pick snapshot products for a live slider config (the live rails query the menu client-side; see DECISIONS) */
export function pickProducts(ctx, config = {}, opts = {}) {
  const all = (ctx.menu && ctx.menu.products) || [];
  const withPhoto = (a) => a.filter((p) => p.photo).concat(a.filter((p) => !p.photo));
  const c = config || {};
  let list = all.slice();
  const cat = String(c.category || opts.category || '').toLowerCase().replace(/_/g, '-');
  if (cat) list = list.filter((p) => (p.category || '') === (cat === 'vaporizers' ? 'vaporizers' : cat));
  if (c.pricemax) list = list.filter((p) => p.price != null && p.price <= Number(c.pricemax));
  if (opts.brand) list = list.filter((p) => p.brand && p.brand.toLowerCase() === String(opts.brand).toLowerCase());
  // stable, varied order: each rail rotates the list by its own offset so neighbouring rails do not repeat
  list = withPhoto(list);
  const off = opts.offset || 0;
  if (off && list.length > 6) list = list.slice(off % list.length).concat(list.slice(0, off % list.length));
  return list.slice(0, opts.limit || 12);
}

export function productRail(ctx, b, opts = {}) {
  const items = pickProducts(ctx, b && b.config, opts);
  if (!items.length) return '';
  return rail(items.map((p) => productCard(p, ctx)), { head: opts.head || '', cls: 'rail--prod', w: 'clamp(230px, 22vw, 280px)' });
}

// ---------- deals (loop carousel of specials) ----------
export function pct(title) { const m = /(\d{1,2})\s*%/.exec(title || ''); if (m) return { big: m[1] + '%', small: 'off' }; const d = /\$\s?(\d+)/.exec(title || ''); if (d) return { big: '$' + d[1], small: 'deal' }; return { big: 'Deal', small: '' }; }
export function dealCard(it, ctx, i = 0) {
  let im = '';
  if (it.img) { try { im = ctx.img(it.img.src, { alt: it.img.alt || '', sizes: '(max-width: 760px) 80vw, 380px', widths: [380, 560, 765] }); } catch (e) { ctx.warn('deal: ' + e.message); } }
  const p = pct(it.title);
  const href = it.href || (it.button && it.button.href) || '/specials/';
  return '<article class="deal" data-tilt><a class="deal__img" href="' + attr(href) + '" tabindex="-1" aria-hidden="true">' + im + '</a>'
    + '<span class="burst" style="--size:86px;--fs:1.35rem;--rot:' + (i % 2 ? 8 : -10) + 'deg"><span>' + esc(p.big) + (p.small ? '<small>' + esc(p.small) + '</small>' : '') + '</span></span>'
    + '<div class="deal__body"><h3 class="deal__title"><a href="' + attr(href) + '">' + esc(it.title) + '</a></h3>'
    + (it.excerpt ? '<p class="deal__ex">' + esc(it.excerpt) + '</p>' : '')
    + '<span class="link-arrow" aria-hidden="true">' + esc((it.button && it.button.text) || 'Shop Now') + ICON.arrow + '</span></div></article>';
}

// ---------- posts / archives ----------
export function postCard(p, ctx, i = 0) {
  let im = '';
  if (p.img) { try { im = ctx.img(p.img.src, { alt: p.img.alt || '', sizes: '(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 400px' }); } catch (e) { ctx.warn('post card: ' + e.message); } }
  else { try { im = ctx.img(['G-TRICHOME', 'G-BUD-ORANGE', 'G-GREENHOUSE', 'G-JAR'][i % 4], { alt: '', sizes: '(max-width: 720px) 100vw, 400px' }); } catch (e) { ctx.warn(e.message); } }
  return '<article class="post" data-reveal style="--d:' + ((i % 3) * 0.08).toFixed(2) + 's">' + (p.href ? '<a class="post__img" href="' + attr(p.href) + '" tabindex="-1" aria-hidden="true">' + im + '</a>' : '<div class="post__img">' + im + '</div>')
    + '<div class="post__body">' + (p.date || p.badge ? '<p class="post__date">' + esc(p.date || p.badge) + '</p>' : '')
    + '<h3 class="post__title">' + (p.href ? '<a href="' + attr(p.href) + '">' + esc(p.title) + '</a>' : esc(p.title)) + '</h3>'
    + (p.excerpt ? '<p class="post__ex">' + esc(p.excerpt) + '</p>' : '') + (p.more ? '<span class="link-arrow" aria-hidden="true">' + esc(p.more.replace(/\s*[→»>]+\s*$/, '')) + ICON.arrow + '</span>' : '') + '</div></article>';
}
export function posts(b, ctx) {
  const pag = (b.pagination || []).filter((x) => x.text);
  return (b.items.length ? '<div class="grid grid--3 posts">' + b.items.map((p, i) => postCard(p, ctx, i)).join('') + '</div>' : (b.empty ? '<p class="muted">' + esc(b.empty) + '</p>' : ''))
    + (pag.length ? '<nav class="pager" aria-label="Pages">' + pag.map((x) => (x.href ? '<a href="' + attr(x.href) + '">' + esc(x.text) + '</a>' : '<span' + (x.current ? ' aria-current="page"' : '') + '>' + esc(x.text) + '</span>')).join('') + '</nav>' : '');
}

// ---------- reviews (the live nested carousel: avatar, name, date, text, Google mark) ----------
export function reviewFromSlide(slide) {
  const flat = [];
  const walk = (bs) => { for (const x of bs) { if (x.t === 'group') walk(x.children); else flat.push(x); } };
  walk(slide.blocks);
  const texts = flat.filter((x) => x.t === 'text').map((x) => strip(x.html)).filter(Boolean);
  const imgs = flat.filter((x) => x.t === 'image');
  if (!imgs.some((x) => /google-g/i.test(x.img.src)) || texts.length < 2) return null;
  const avatar = imgs.find((x) => !/google-g/i.test(x.img.src));
  const date = texts.find((t) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) || '';
  const body = texts.filter((t) => t !== date).sort((a, b) => b.length - a.length)[0] || '';
  const name = texts.find((t) => t !== date && t !== body) || '';
  return { name, date, text: body, avatar: avatar ? avatar.img : null };
}
export function reviewCard(r, ctx) {
  let av = esc(initials(r.name));
  if (r.avatar) { try { av = ctx.img(r.avatar.src, { alt: '', sizes: '44px', widths: [64] }); } catch (e) { ctx.warn('avatar: ' + e.message); } }
  return '<blockquote class="rev" data-tilt><span class="rev__mark" aria-hidden="true">&rdquo;</span>' + stars(5).replace('<span class="stars"', '<span class="stars" title="Google review"')
    + '<p class="rev__text">' + esc(r.text) + '</p><footer class="rev__who"><span class="rev__av" aria-hidden="true">' + av + '</span><span>' + esc(r.name) + (r.date ? '<br><small class="muted">' + esc(r.date) + ' · Google</small>' : '') + '</span></footer></blockquote>';
}

// ---------- effects (nested carousel: image + h3 + "Shop Now") ----------
export function effectFromSlide(slide) {
  const flat = [];
  const walk = (bs) => { for (const x of bs) { if (x.t === 'group') walk(x.children); else flat.push(x); } };
  walk(slide.blocks);
  const h = flat.find((x) => x.t === 'heading');
  const im = flat.find((x) => x.t === 'image');
  const tx = flat.find((x) => x.t === 'text');
  const link = tx ? (/href="([^"]+)"/.exec(tx.html) || [])[1] : null;
  return h && im ? { title: h.text, img: im.img, href: im.href || (link ? link.replace(/&amp;/g, '&') : null), cta: tx ? strip(tx.html) : '' } : null;
}
export function effectCard(e, ctx, i = 0) {
  let im = '';
  try { im = ctx.img(e.img.src, { alt: e.img.alt || '', sizes: '(max-width: 760px) 70vw, 300px', widths: [320, 480, 640, 960] }); } catch (err) { ctx.warn('effect: ' + err.message); }
  const href = e.href || '/effects/' + e.title.toLowerCase() + '/';
  return '<a class="fx" href="' + attr(href) + '" data-tilt style="--i:' + i + '"><div class="fx__img">' + im + '</div><div class="fx__label glass"><span class="fx__n">0' + (i + 1) + '</span><h3>' + esc(e.title) + '</h3><span class="link-arrow">' + esc(e.cta || 'Shop Now') + ICON.arrow + '</span></div></a>';
}

// ---------- category tiles (icon boxes) ----------
export const CAT_SLUG = { Flower: 'flower', 'Pre-Rolls': 'pre-rolls', Vaporizers: 'vaporizers', Edibles: 'edibles', Concentrates: 'concentrates', Topicals: 'topicals', Tinctures: 'tinctures', Accessories: 'accessories' };
export function catTile(box, ctx, i = 0) {
  const slug = CAT_SLUG[box.title] || 'other';
  const href = box.href || '/categories/' + slug + '/';
  let im = '';
  try { im = ctx.img(CAT_ART[slug] || 'G-JAR', { alt: '', sizes: '(max-width: 760px) 45vw, 300px', widths: [320, 480, 640, 960] }); } catch (e) { ctx.warn('cat: ' + e.message); }
  const count = ((ctx.menu && ctx.menu.products) || []).filter((p) => p.category === slug).length;
  // the live description is a "Shop Now" link: inside the tile's own <a> it must be text (a nested <a> splits the tile)
  const desc = strip(box.html);
  return '<a class="cat cat--' + (i % 4) + '" href="' + attr(href) + '" data-tilt><div class="cat__img">' + im + '</div><div class="cat__body"><span class="cat__n">' + String(i + 1).padStart(2, '0') + '</span><h3>' + esc(box.title) + '</h3>' + '<span class="cat__go" aria-hidden="true">' + ICON.arrow + '</span>' + (desc ? '<span class="cat__text">' + esc(desc) + '</span>' : '') + '</div>' + (count ? '<span class="sr-only">' + count + ' products in the preview snapshot</span>' : '') + '</a>';
}

// ---------- the generic renderer ----------
function flatten(blocks) { const out = []; for (const b of blocks || []) { if (b.t === 'group') out.push(...flatten(b.children)); else out.push(b); } return out; }
export { flatten };
const isIconGroup = (g) => { const f = flatten(g.children || []); return f.length >= 3 && f.every((b) => b.t === 'iconbox'); };

export function renderBlocks(blocks, ctx, opts = {}) {
  let out = '';
  let buttons = [];
  const flush = () => { if (buttons.length) { out += '<div class="btns" data-reveal>' + buttons.join('') + '</div>'; buttons = []; } };
  for (const b of blocks || []) {
    if (b.t === 'button') { buttons.push(btn(b.text, b.href, { kind: buttons.length ? 'glass' : undefined })); continue; }
    flush();
    out += renderBlock(b, ctx, opts);
  }
  flush();
  return out;
}

export function renderBlock(b, ctx, opts = {}) {
  switch (b.t) {
    case 'group': {
      if (isIconGroup(b)) return '<div class="cats" data-stagger>' + flatten(b.children).map((x, i) => catTile(x, ctx, i)).join('') + '</div>';
      const kids = b.children || [];
      const groups = kids.filter((k) => k.t === 'group');
      if (groups.length >= 2 && groups.length <= 3 && kids.length - groups.length <= 2) {
        const extra = kids.filter((k) => k.t !== 'group');
        return '<div class="cols cols--' + groups.length + '">' + groups.map((g) => '<div class="col">' + renderBlocks(g.children, ctx, opts) + '</div>').join('') + '</div>' + (extra.length ? renderBlocks(extra, ctx, opts) : '');
      }
      return renderBlocks(kids, ctx, opts);
    }
    case 'heading': {
      if (b.from === 'post-title' || b.from === 'archive-title' || (b.level === 'h1' && opts.skipH1)) return '';
      const lvl = b.level === 'h1' ? 'h2' : /^h[2-6]$/.test(b.level) ? b.level : 'p';
      const cls = lvl === 'h2' ? ' class="split"' : '';
      return '<' + lvl + cls + (lvl !== 'h2' ? ' data-reveal' : '') + '>' + b.html + '</' + lvl + '>';
    }
    case 'text': {
      if (/^(Home|Shop) \//.test(strip(b.html))) return '';   // the live breadcrumb line: the hero carries crumbs instead
      return '<div class="prose" data-reveal>' + richText(b.html, ctx) + '</div>';
    }
    case 'image': return figure(b, ctx);
    case 'list': return '<ul class="ticks" data-reveal>' + b.items.map((it) => '<li>' + ICON.check + '<span>' + (it.href ? '<a href="' + attr(it.href) + '"' + linkAttrs(it.href) + '>' + it.html + '</a>' : it.html) + '</span></li>').join('') + '</ul>';
    case 'iconbox': return '<div class="ibox glass glass--pop" data-reveal>' + (b.img ? (() => { try { return ctx.img(b.img.src, { alt: b.img.alt || '', sizes: '120px' }); } catch (e) { return ''; } })() : '') + '<h3>' + (b.href ? '<a href="' + attr(b.href) + '">' + esc(b.title) + '</a>' : esc(b.title)) + '</h3>' + (b.html ? '<div class="prose">' + b.html + '</div>' : '') + '</div>';
    case 'faq': return '<div class="faq">' + b.items.map((it, i) => '<details' + (i === 0 ? ' open' : '') + ' data-reveal style="--d:' + (i * 0.05).toFixed(2) + 's"><summary><span>' + esc(it.q) + '</span><span class="pm" aria-hidden="true"></span></summary><div class="faq__a prose">' + renderBlocks(it.blocks, ctx, opts) + '</div></details>').join('') + '</div>';
    case 'loop': return rail(b.items.map((it, i) => dealCard(it, ctx, i)), { cls: 'rail--deals', w: 'clamp(270px, 28vw, 360px)' });
    case 'posts': return posts(b, ctx);
    case 'products': return productRail(ctx, b, { offset: (ctx.railN = (ctx.railN || 0) + 1) * 5, category: opts.category, brand: opts.brand });
    case 'menu': return menuGrid(ctx, opts);
    case 'nested': {
      const revs = b.items.map(reviewFromSlide).filter(Boolean);
      if (revs.length) return rail(revs.map((r) => reviewCard(r, ctx)), { cls: 'rail--rev', w: 'clamp(280px, 30vw, 380px)' });
      const fx = b.items.map(effectFromSlide).filter(Boolean);
      if (fx.length) return rail(fx.map((e, i) => effectCard(e, ctx, i)), { cls: 'rail--fx', w: 'clamp(240px, 24vw, 300px)' });
      return rail(b.items.map((it) => '<div class="glass glass--pop slide">' + renderBlocks(it.blocks, ctx, opts) + '</div>'));
    }
    case 'form': return formBlock(b);
    case 'map': return '<div class="mapframe" data-reveal><iframe data-src="' + attr(b.src) + '" title="' + attr(b.title || 'Map') + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>';
    case 'embed': return '<div class="mapframe" data-reveal><iframe data-src="' + attr(b.src) + '" title="' + attr(b.title || 'Embedded content') + '" loading="lazy" allowfullscreen></iframe></div>';
    case 'meta': return '<p class="postmeta">' + b.items.map((x) => '<span>' + esc(x) + '</span>').join('') + '</p>';
    case 'postnav': return '<nav class="postnav" aria-label="More posts">' + (b.prev ? '<a class="postnav__a" href="' + attr(b.prev.href) + '">' + ICON.left + '<span><small>' + esc(b.prev.label || 'Previous') + '</small>' + esc(b.prev.text) + '</span></a>' : '<span></span>') + (b.next ? '<a class="postnav__a postnav__a--next" href="' + attr(b.next.href) + '"><span><small>' + esc(b.next.label || 'Next') + '</small>' + esc(b.next.text) + '</span>' + ICON.right + '</a>' : '') + '</nav>';
    case 'cta': return '<div class="ibox glass glass--pop" data-reveal><h3>' + esc(b.title) + '</h3>' + (b.html ? '<div class="prose">' + b.html + '</div>' : '') + (b.button ? btn(b.button.text, b.button.href) : '') + '</div>';
    case 'links': return '<ul class="board" data-stagger>' + b.items.map((it) => '<li><a href="' + attr(it.href || '#') + '"' + linkAttrs(it.href) + '><span>' + esc(it.text) + '</span>' + ICON.right + '</a></li>').join('') + '</ul>';
    case 'testimonials': return rail(b.items.map((q) => reviewCard({ name: q.name, text: q.text, date: q.title }, ctx)), { cls: 'rail--rev', w: 'clamp(280px, 30vw, 380px)' });
    case 'carousel': return rail(b.items.map((it) => figure(it, ctx, { reveal: false })), { w: 'clamp(240px, 26vw, 340px)' });
    case 'breadcrumbs': case 'social': case 'icon': case 'nav': case 'dropped': return '';
    default: ctx.warn('block ' + b.t + ' has no renderer'); return '';
  }
}

/** the live Joint menu mount -> a static menu grid from the snapshot (category / brand aware) */
export function menuGrid(ctx, opts = {}) {
  const items = pickProducts(ctx, {}, { category: opts.category, brand: opts.brand, limit: opts.limit || 12, offset: opts.offset || 0 });
  const list = items.length ? items : pickProducts(ctx, {}, { limit: 12 });
  return '<div class="menu-snap glass glass--pop" data-reveal><div class="menu-snap__head"><span class="sign"><span class="sign__exit">90</span>Menu snapshot</span><p class="muted">A sample of the live menu as published on the crawl date. Prices and stock change daily.</p>' + btn('Shop the full menu', '/menu/', { sm: true }) + '</div>'
    + '<div class="grid grid--4 menu-snap__grid" data-stagger>' + list.map((p) => productCard(p, ctx)).join('') + '</div></div>';
}

export function formBlock(b) {
  const id = 'f-' + (++FORM_N);
  const fields = b.fields.map((f, i) => {
    const fid = id + '-' + i;
    if (f.type === 'checkbox') return '<label class="check"><input type="checkbox" name="' + attr(f.name) + '" value="' + attr(f.value || f.label) + '"> <span>' + esc(f.label) + '</span></label>';
    const label = f.label || f.placeholder || f.name;
    const tag = f.type === 'textarea' ? '<textarea id="' + fid + '" name="' + attr(f.name) + '" placeholder="' + attr(f.placeholder) + '"' + (f.required ? ' required' : '') + '></textarea>'
      : f.type === 'select' ? '<select id="' + fid + '" name="' + attr(f.name) + '">' + (f.options || []).map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>'
      : '<input id="' + fid + '" type="' + attr(['email', 'tel', 'number', 'date'].includes(f.type) ? f.type : 'text') + '" name="' + attr(f.name) + '" placeholder="' + attr(f.placeholder) + '"' + (f.required ? ' required' : '') + '>';
    return '<div class="form__row"><label for="' + fid + '">' + esc(label) + '</label>' + tag + '</div>';
  }).join('');
  const notes = (b.notes || []).map((n) => '<p class="muted">' + esc(n) + '</p>').join('');
  return '<form class="form glass glass--pop" method="post" action="/__form-endpoint-not-configured__" data-reveal>' + notes + fields
    + '<button class="btn" type="submit" disabled>' + esc(b.submit || 'Submit') + '<span class="ico">' + ICON.arrow + '</span></button>'
    + '<p class="form__note">This preview form is not connected yet.</p></form>';
}
