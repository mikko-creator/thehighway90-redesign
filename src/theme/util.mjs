// util.mjs - small theme helpers shared by every template.
export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const attr = (s) => esc(s).replace(/"/g, '&quot;');
export const strip = (h) => String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export const decodeEnt = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8220;/g, '“').replace(/&#8221;/g, '”').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'");
export const isExt = (h) => /^https?:\/\//i.test(h || '');
export const linkAttrs = (h) => (isExt(h) ? ' target="_blank" rel="noopener"' : '');

export const ICON = {
  arrow: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 13 13 3M5 3h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  left: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.8"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8.5 3 3 7-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="m10 1.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8L10 1.6Z"/></svg>',
  play: '<svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5v11l9-5.5-9-5.5Z"/></svg>',
  pause: '<svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h3v12H4zM9 2h3v12H9z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21v-7m0 0c-4 0-7-3-7-8 4 0 7 3 7 8Zm0 0c4 0 7-3 7-8-4 0-7 3-7 8Zm0 0c0-5 2-9 0-12-2 3 0 7 0 12Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 13l20-9-6 18-4-7-10-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m12 15 4-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  google: '<svg class="gmark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};
const SOCIAL_SVG = {
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8V6.5c0-.8.2-1.3 1.4-1.3H17V2.2C16.7 2.1 15.7 2 14.6 2 12.2 2 10.6 3.4 10.6 6.1V8H8v3.4h2.6V22H14V11.4h2.7L17 8h-3Z"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 2h-3.3v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.2 6.2 0 1 0 5.3 6.2V8.5a7.8 7.8 0 0 0 4.5 1.4V6.6c-2.4 0-4.5-2-4.5-4.6Z"/></svg>',
};
export function socialIcon(item) {
  const k = String(item.label || item.href || '').toLowerCase();
  const key = /facebook/.test(k) ? 'facebook' : /twitter|x\.com/.test(k) ? 'twitter' : /instagram/.test(k) ? 'instagram' : /tiktok/.test(k) ? 'tiktok' : null;
  return key ? SOCIAL_SVG[key] : ICON.arrow;
}
export const stars = (n = 5) => '<span class="stars" aria-label="' + n + ' out of 5 stars">' + ICON.star.repeat(Math.max(0, Math.min(5, n))) + '</span>';
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase().replace(/[^A-Z0-9.]/g, '') || '★';

/** walk a block tree depth-first */
export function walkBlocks(blocks, fn) { for (const b of blocks || []) { fn(b); if (b.children) walkBlocks(b.children, fn); if (b.items && b.t === 'faq') for (const it of b.items) walkBlocks(it.blocks, fn); } }
export function findBlock(blocks, pred) { let hit = null; walkBlocks(blocks, (b) => { if (!hit && pred(b)) hit = b; }); return hit; }
export function findBlocks(blocks, pred) { const out = []; walkBlocks(blocks, (b) => { if (pred(b)) out.push(b); }); return out; }
