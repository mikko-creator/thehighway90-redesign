// chrome.mjs - deals ticker, glass header (live nav + shop mega menu), mobile drawer, search sheet, footer, age gate.
// Every label and link comes from the live header/footer (src/content/site.json); nothing is invented.
import { esc, attr, ICON, strip } from './util.mjs';
import { ticker, announcementItems } from './parts.mjs';
import { btn, CAT_ART } from './blocks.mjs';

const SEARCH = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2.2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const MEGA_ART = { 'Shop All': 'G-JAR', 'Best Sellers': 'G-BUD-ORANGE', Specials: 'G-PREROLL', Flower: CAT_ART.flower, 'Pre-Rolls': CAT_ART['pre-rolls'], Vaporizers: CAT_ART.vaporizers, Edibles: 'G-DRINK', Drinks: 'G-DRINK', Concentrates: CAT_ART.concentrates, Topicals: CAT_ART.topicals, Tinctures: CAT_ART.tinctures, Accessories: CAT_ART.accessories };

function flat(blocks) { const out = []; const walk = (bs) => { for (const b of bs || []) { if (b.t === 'group') walk(b.children); else out.push(b); } }; walk(blocks); return out; }
const cur = (page, href) => (page && page.path === href ? ' aria-current="page"' : '');

export function topbar(ctx) {
  const items = announcementItems(ctx.site.announcement);
  return items.length ? '<div class="topbar">' + ticker(items, { cls: 'ticker--orange', dur: 70, label: 'Current deals' }) + '</div>' : '';
}

export function header(ctx, page) {
  const nav = ctx.site.nav || [];
  const mega = ctx.site.mega || [];
  let logo = '';
  try { logo = ctx.img('assets/source/2024-10-hwy90-logo-horizontal.webp', { alt: 'Highway 90', sizes: '200px', widths: [200, 400, 700], loading: 'eager', fetchpriority: 'high' }); } catch (e) { ctx.warn('logo: ' + e.message); }
  const thumb = (label) => { try { return ctx.img(MEGA_ART[label] || 'G-JAR', { alt: '', sizes: '46px', widths: [160] }); } catch (e) { return ''; } };
  let lead = '';
  try { lead = ctx.img('G-BUD-ORANGE', { alt: '', sizes: '240px', widths: [320, 480] }); } catch (e) { ctx.warn(e.message); }
  const items = nav.map((it, i) => {
    if (i === 0 && mega.length) {
      // "Shop All" opens the live mega menu (categories), its link stays the menu page
      return '<li class="has-drop"><button class="nav__link" type="button" aria-expanded="false" aria-controls="mega">Shop' + ICON.down + '</button>'
        + '<div class="drop mega glass" id="mega"><a class="mega__lead" href="' + attr(it.href) + '">' + lead + '<span>Open the menu</span><strong>' + esc(it.text) + '</strong></a>'
        + '<div class="mega__grid">' + mega.map((m) => '<a href="' + attr(m.href) + '"' + cur(page, m.href) + '><span class="mega__thumb">' + thumb(m.text) + '</span>' + esc(m.text) + '</a>').join('') + '</div></div></li>';
    }
    if (it.children && it.children.length) {
      return '<li class="has-drop"><button class="nav__link" type="button" aria-expanded="false">' + esc(it.text) + ICON.down + '</button>'
        + '<div class="drop glass"><a href="' + attr(it.href) + '"' + cur(page, it.href) + '>' + esc(it.text) + ICON.arrow + '</a>' + it.children.map((c) => '<a href="' + attr(c.href) + '"' + cur(page, c.href) + '>' + esc(c.text) + ICON.arrow + '</a>').join('') + '</div></li>';
    }
    return '<li><a class="nav__link" href="' + attr(it.href) + '"' + cur(page, it.href) + '>' + esc(it.text) + '</a></li>';
  }).join('');
  return '<header class="hdr" data-hdr><div class="wrap"><div class="hdr__bar">'
    + '<a class="hdr__logo" href="/" aria-label="Highway 90 home">' + logo + '</a>'
    + '<nav aria-label="Main"><ul class="nav">' + items + '</ul></nav>'
    + '<div class="hdr__actions"><button class="hdr__icon" type="button" data-search-open aria-label="Search the menu">' + SEARCH + '</button>'
    + btn('Order Online', '/menu/', { sm: true })
    + '<button class="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mmenu"><span></span><span></span><span></span></button></div>'
    + '</div></div></header>'
    + mobileMenu(ctx) + searchSheet();
}

function mobileMenu(ctx) {
  const nav = ctx.site.nav || [];
  const links = [];
  for (const it of nav) { links.push(it); for (const c of it.children || []) if (!links.some((l) => l.href === c.href)) links.push({ ...c, sub: true }); }
  const seen = new Set();
  const uniq = links.filter((l) => { const k = l.text + l.href; if (seen.has(k)) return false; seen.add(k); return true; });
  return '<div class="mmenu" id="mmenu" aria-hidden="true"><div class="mmenu__in">'
    + '<nav aria-label="Mobile">' + uniq.map((l) => '<a href="' + attr(l.href) + '">' + esc(l.text) + (l.sub ? '' : '<small>Exit ' + ((uniq.indexOf(l) + 1) * 9) + '</small>') + '</a>').join('') + '</nav>'
    + '<div class="mmenu__cats">' + (ctx.site.mega || []).map((m) => '<a href="' + attr(m.href) + '">' + esc(m.text) + '</a>').join('') + '</div>'
    + '<div class="mmenu__foot">' + btn('Order Online', '/menu/') + btn('(856) 607-3473', 'tel:(856)607-3473', { kind: 'cream' }) + '</div>'
    + '</div></div>';
}

function searchSheet() {
  return '<div class="search" hidden data-search><form class="glass glass--pop" action="/menu/" method="get" role="search"><label class="sr-only" for="q">Search the menu</label>'
    + '<input id="q" name="search" type="search" placeholder="Search flower, vapes, brands…" autocomplete="off"><button class="btn" type="submit">Search<span class="ico">' + ICON.arrow + '</span></button></form>'
    + '<p class="search__note">Search runs on the live menu once the site is connected.</p></div>';
}

export function footer(ctx) {
  const f = flat(ctx.site.footer || []);
  const heading = (t) => f.findIndex((b) => b.t === 'heading' && b.text === t);
  const after = (t) => { const i = heading(t); const out = []; if (i < 0) return out; for (let j = i + 1; j < f.length && f[j].t !== 'heading'; j++) out.push(f[j]); return out; };
  const linksOf = (blocks) => blocks.flatMap((b) => (b.t === 'text' ? [...b.html.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1].replace(/&amp;/g, '&'), html: m[2] })) : []));
  const shop = linksOf(after('Shop')), site = linksOf(after('Site')), contact = linksOf(after('Contact'));
  const hoursHtml = (after('Hours').find((b) => b.t === 'text') || {}).html || '';
  const hours = [...hoursHtml.matchAll(/<li><p>([^<]+)<\/p><p>([^<]+)<\/p><\/li>/g)].map((m) => [m[1], m[2]]);
  const legal = linksOf(f.filter((b) => b.t === 'text' && /privacy|terms/i.test(b.html)));
  const copy = (f.find((b) => b.t === 'heading' && /copyright/i.test(b.text)) || {}).text || '';
  const rewardsH = (f.find((b) => b.t === 'heading' && /rewards$/i.test(b.text)) || {}).text || 'Highway 90 Rewards';
  const rewardsP = (f.find((b) => b.t === 'heading' && /want more/i.test(b.text)) || {}).text || '';
  const rewardsB = f.find((b) => b.t === 'button') || { text: 'Rewards', href: '/rewards-sign-up/' };
  let badge = '', logo = '';
  try { badge = ctx.img('assets/source/2024-10-hwy90-logo-badge.webp', { alt: '', sizes: '150px', widths: [240, 360] }); } catch (e) { ctx.warn(e.message); }
  try { logo = ctx.img('assets/source/2024-10-hwy90-logo-horizontal.webp', { alt: 'Highway 90', sizes: '240px', widths: [240, 480] }); } catch (e) { ctx.warn(e.message); }
  const ul = (arr) => '<ul>' + arr.map((l) => '<li><a href="' + attr(l.href) + '">' + l.html + '</a></li>').join('') + '</ul>';
  return '<footer class="ftr on-dark"><div class="wrap">'
    + '<div class="ftr__cta glass glass--dark glass--pop" data-reveal><div class="ftr__badge">' + badge + '</div><div><h2>' + esc(rewardsH) + '</h2><p>' + esc(rewardsP) + '</p></div>' + btn(rewardsB.text, rewardsB.href) + '</div>'
    + '<div class="ftr__cols">'
    + '<div class="ftr__col ftr__brand">' + logo + '<p>' + esc(ctx.site.tagline || '') + '</p></div>'
    + '<div class="ftr__col"><h3>Shop</h3>' + ul(shop) + '</div>'
    + '<div class="ftr__col"><h3>Site</h3>' + ul(site) + '</div>'
    + '<div class="ftr__col"><h3>Contact</h3>' + ul(contact) + '</div>'
    + '<div class="ftr__col"><h3>Hours</h3><ul class="ftr__hours">' + hours.map(([d, h]) => '<li><span>' + esc(d) + '</span><span>' + esc(h) + '</span></li>').join('') + '</ul></div>'
    + '</div>'
    + '<div class="ftr__legal"><span>' + esc(copy) + '</span><ul>' + legal.map((l) => '<li><a href="' + attr(l.href) + '">' + l.html + '</a></li>').join('') + '</ul></div>'
    + '</div><div class="ftr__big" aria-hidden="true">HWY 90</div></footer>';
}

export function ageGate(ctx) {
  const g = ctx.site.ageGate || {};
  let badge = '';
  try { badge = ctx.img('assets/source/2024-10-hwy90-logo-badge.webp', { alt: 'Highway 90', sizes: '168px', widths: [240, 360] }); } catch (e) { ctx.warn(e.message); }
  return '<div class="agegate" hidden role="dialog" aria-modal="true" aria-labelledby="ag-h"><div class="agegate__bg" aria-hidden="true"></div>'
    + '<div class="agegate__card glass glass--pop"><div class="agegate__shield">' + badge + '</div><h2 id="ag-h">' + esc(g.headline || 'Welcome!') + '</h2><p>' + esc(g.challenge || 'Are you over 21 years of age?') + '</p>'
    + '<div class="btns"><button class="btn" type="button" data-age="yes">' + esc(g.yes || 'Yes') + '<span class="ico">' + ICON.check + '</span></button><button class="btn btn--cream" type="button" data-age="no">' + esc(g.no || 'No') + '</button></div>'
    + '<p class="agegate__no" role="alert">' + esc(g.error || 'You are not old enough to view this content') + '</p></div></div>';
}
