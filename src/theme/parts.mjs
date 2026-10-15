// parts.mjs - shared bespoke parts: loop/still backdrops, protruding cut-outs, highway-sign heads, the deals ticker,
// the lane divider, section wrappers.
import { esc, attr, ICON } from './util.mjs';

/** a full-bleed backdrop: a loop video (poster first) or a still; always decorative */
export function backdrop(ctx, { loop = null, still = null, pos = '50% 50%', eager = false, cls = '' } = {}) {
  let v = null;
  if (loop) { try { v = ctx.video(loop, { posterWidth: 1920 }); } catch (e) { ctx.warn('loop: ' + e.message); } }
  if (v) {
    return '<div class="bgwrap ' + cls + '"><div class="loop" data-loop>'
      + '<img src="' + attr(v.poster) + '" srcset="' + attr(v.posterSrcset) + '" sizes="100vw" alt="" ' + (eager ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"') + ' decoding="async" style="object-position:' + pos + '">'
      + '<video muted playsinline loop preload="none" aria-hidden="true" tabindex="-1" poster="' + attr(v.poster) + '"' + (v.mp4Phone ? ' data-src-phone="' + attr(v.mp4Phone) + '"' : '') + ' style="object-position:' + pos + '">'
      + (v.webm ? '<source data-src="' + attr(v.webm) + '" type="video/webm">' : '') + '<source data-src="' + attr(v.mp4) + '" type="video/mp4"></video></div>'
      + '<button class="loop__toggle" type="button" aria-label="Pause background motion">' + ICON.pause + ICON.play + '</button></div>';
  }
  if (still) {
    let im = '';
    try { im = ctx.img(still, { alt: '', sizes: '100vw', loading: eager ? 'eager' : 'lazy', fetchpriority: eager ? 'high' : undefined, attrs: { style: 'object-position:' + pos } }); } catch (e) { ctx.warn('still: ' + e.message); }
    return '<div class="bgwrap ' + cls + '"><div class="loop">' + im + '</div></div>';
  }
  return '';
}

/** a protruding cut-out: absolutely placed by the caller's class, parallax depth, gentle float */
export function protrude(ctx, ref, cls, { depth = 0.15, sizes = '30vw', rot = 0, float = true, alt = '', widths } = {}) {
  let im = '';
  try { im = ctx.img(ref, { alt, sizes, widths }); } catch (e) { ctx.warn('protrude: ' + e.message); return ''; }
  return '<div class="pro ' + cls + '" aria-hidden="' + (alt ? 'false' : 'true') + '" data-depth="' + depth + '"><div class="cutout' + (float ? ' float' : '') + '" style="--rot:' + rot + 'deg">' + im + '</div></div>';
}

/** a section head: highway sign (exit number + label), optional kicker, the h2 (split for the word rise), a lede */
export function signHead({ exit = '', label = '', kicker = '', h2 = '', h2Html = '', lede = '', cls = '', right = '' } = {}) {
  return '<div class="head ' + cls + '">'
    + (label ? '<span class="sign" data-reveal="pop">' + (exit ? '<span class="sign__exit">' + esc(exit) + '</span>' : '') + esc(label) + '</span>' : '')
    + (kicker ? '<span class="kicker" data-reveal>' + esc(kicker) + '</span>' : '')
    + (h2Html || h2 ? '<h2 class="split">' + (h2Html || esc(h2)) + '</h2>' : '')
    + (lede ? '<p data-reveal>' + lede + '</p>' : '')
    + (right ? '<div class="head__right">' + right + '</div>' : '')
    + '</div>';
}

/** split the live announcement line into its deals (each starts with an emoji) */
export function announcementItems(text) {
  return String(text || '').split(/\s+(?=\p{Extended_Pictographic})/u).map((s) => s.trim()).filter((s) => s.replace(/[\p{Extended_Pictographic}️‍\s]/gu, '').length > 2);
}

/** a marquee lane: the items twice, so the -50% loop is seamless; links where the live text names a page */
export function ticker(items, { cls = '', dur = 60, label = 'Current deals' } = {}) {
  const one = items.map((t) => (typeof t === 'string' ? '<span class="ticker__item">' + esc(t) + '</span>' : '<a class="ticker__item" href="' + attr(t.href) + '">' + esc(t.text) + '</a>')).join('');
  return '<div class="ticker ' + cls + '" role="region" aria-label="' + attr(label) + '"><div class="ticker__track" style="--dur:' + dur + 's"><div class="ticker__set">' + one + '</div><div class="ticker__set" aria-hidden="true">' + one.replace(/<a /g, '<a tabindex="-1" ') + '</div></div></div>';
}

export const lane = (cls = '') => '<div class="lane ' + cls + '" aria-hidden="true"></div>';

export function section(inner, { cls = '', id = '', bg = '', attrs = '' } = {}) {
  return '<section class="sec ' + cls + '"' + (id ? ' id="' + attr(id) + '"' : '') + attrs + '>' + bg + '<div class="wrap">' + inner + '</div></section>';
}

/** the HWY 90 route shield (the live badge logo) as a decorative layer */
export function shield(ctx, cls = '', { sizes = '220px', depth = 0.1 } = {}) {
  let im = '';
  try { im = ctx.img('assets/source/2024-10-hwy90-logo-badge.webp', { alt: '', sizes, widths: [240, 360, 480, 700] }); } catch (e) { ctx.warn('shield: ' + e.message); return ''; }
  return '<div class="pro shield ' + cls + '" aria-hidden="true" data-depth="' + depth + '"><div class="cutout float">' + im + '</div></div>';
}
