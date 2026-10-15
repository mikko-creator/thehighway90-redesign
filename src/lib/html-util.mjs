// html-util.mjs - shared HTML helpers for the pipeline (Node builtins only). Owner: PIPELINE.
// A tolerant tokenizer + tree builder (adapted from the capecodcannabis-reforge pipeline). Every element node keeps
// its source offsets (s = start of its start tag, e = end of its end tag) so callers can slice the exact source bytes
// (the shop embeds are carried byte-identical this way, BUILD-CONTRACT 4.6).
// Node shape: { tag, attrs, children, parent, s, e }   text: { tag:'#text', text, raw? }   comment: { tag:'#comment' }

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'iframe']);
// Start tags that implicitly close an open <p>.
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  zwnj: '‌', zwj: '‍', shy: '­', ndash: '–', mdash: '—', hellip: '…', rsquo: '’',
  lsquo: '‘', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', prime: '′', Prime: '″',
  middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°', times: '×',
  laquo: '«', raquo: '»', rsaquo: '›', lsaquo: '‹', eacute: 'é', ntilde: 'ñ', aacute: 'á',
  iacute: 'í', oacute: 'ó', uacute: 'ú', frac12: '½', frac14: '¼', frac34: '¾', larr: '←', rarr: '→',
};
export function decode(s) {
  return String(s == null ? '' : s).replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, g) => {
    if (g[0] === '#') {
      const c = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(c) && c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m;
    }
    const v = ENT[g];
    return v === undefined ? m : v;
  });
}

const ATTR_RE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function parseAttrs(str) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(str))) {
    const k = m[1].toLowerCase();
    if (k in out) continue;
    out[k] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

export function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null, s: 0, e: html.length };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const len = html.length;
  let i = 0;
  const pushText = (a, b) => { if (b > a) top().children.push({ tag: '#text', text: html.slice(a, b), s: a, e: b, parent: top() }); };
  const closeTo = (name, at) => {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].tag === name) {
        for (let j = stack.length - 1; j >= k; j--) stack[j].e = at;
        stack.length = k;
        return true;
      }
    }
    return false;
  };
  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { pushText(i, len); break; }
    pushText(i, lt);
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const e = end < 0 ? len : end + 3;
      top().children.push({ tag: '#comment', text: html.slice(lt + 4, end < 0 ? len : end), s: lt, e, parent: top() });
      i = e;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') { const end = html.indexOf('>', lt); i = end < 0 ? len : end + 1; continue; }
    if (html[lt + 1] === '/') {
      const m = /^<\/([a-zA-Z][\w:-]*)[^>]*>/.exec(html.slice(lt, lt + 200));
      if (!m) { pushText(lt, lt + 1); i = lt + 1; continue; }
      const nm = m[1].toLowerCase();
      // a stray </p> with no open <p> becomes an empty paragraph in browsers; it carries no text, so it is ignored
      closeTo(nm, lt + m[0].length);
      i = lt + m[0].length;
      continue;
    }
    const nm = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 100));
    if (!nm) { pushText(lt, lt + 1); i = lt + 1; continue; }
    let j = lt + nm[0].length;
    let q = null;
    while (j < len) {
      const c = html[j];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
      j++;
    }
    const tagEnd = Math.min(j + 1, len);
    const name = nm[1].toLowerCase();
    const attrStr = html.slice(lt + nm[0].length, j);
    const selfClosing = /\/\s*$/.test(attrStr);
    if (CLOSES_P.has(name) && top().tag === 'p') { top().e = lt; stack.pop(); }
    if (name === 'li') {
      for (let k = stack.length - 1; k > 0; k--) {
        const t = stack[k].tag;
        if (t === 'li') { closeTo('li', lt); break; }
        if (t === 'ul' || t === 'ol' || t === 'div' || t === 'nav') break;
      }
    }
    if (name === 'option' && top().tag === 'option') { top().e = lt; stack.pop(); }
    const node = { tag: name, attrs: parseAttrs(attrStr), children: [], parent: top(), s: lt, e: tagEnd };
    top().children.push(node);
    if (RAW.has(name)) {
      const re = new RegExp('</' + name + '\\s*>', 'gi');
      re.lastIndex = tagEnd;
      const m = re.exec(html);
      const ce = m ? m.index : len;
      node.children.push({ tag: '#text', text: html.slice(tagEnd, ce), s: tagEnd, e: ce, parent: node, raw: true });
      node.e = m ? m.index + m[0].length : len;
      i = node.e;
      continue;
    }
    if (VOID.has(name) || (selfClosing && (name === 'svg' || name === 'path' || name.includes(':') || stack.some((n) => n.tag === 'svg')))) { i = tagEnd; continue; }
    stack.push(node);
    i = tagEnd;
  }
  for (let k = stack.length - 1; k > 0; k--) stack[k].e = len;
  return root;
}

export const isEl = (n) => !!n && typeof n.tag === 'string' && n.tag[0] !== '#';
export const cls = (n) => (n && n.attrs && n.attrs.class ? n.attrs.class.split(/\s+/).filter(Boolean) : []);
export const hasCls = (n, c) => cls(n).includes(c);
export const elChildren = (n) => (n && n.children ? n.children.filter(isEl) : []);

export function walk(n, fn, depth = 0) {
  if (fn(n, depth) === false) return;
  if (n.children) for (const c of n.children) walk(c, fn, depth + 1);
}
export function findAll(n, pred) { const out = []; walk(n, (x) => { if (isEl(x) && pred(x)) out.push(x); }); return out; }
export function findFirst(n, pred) {
  let hit = null;
  walk(n, (x) => { if (hit) return false; if (isEl(x) && pred(x)) { hit = x; return false; } return undefined; });
  return hit;
}
export const byId = (root, id) => findFirst(root, (x) => x.attrs.id === id);
export function isAncestor(a, b) { for (let x = b && b.parent; x; x = x.parent) if (x === a) return true; return false; }

// Screen-reader-only classes found in audit/raw: visually-hidden (736) and screen-reader-text (1). Their text is part of
// the page (carried as sr-only text), never dropped.
export const SR_ONLY_CLASS = (c) => c === 'visually-hidden' || c === 'screen-reader-text';
export const isSrOnlyEl = (n) => isEl(n) && cls(n).some(SR_ONLY_CLASS);

const BLOCKISH = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'section', 'br', 'article', 'header', 'footer', 'ul', 'ol', 'figcaption', 'blockquote', 'td', 'th', 'dt', 'dd', 'nav', 'main', 'aside', 'form', 'table', 'button', 'label', 'option', 'details', 'summary', 'figure', 'pre', 'hr', 'caption', 'select']);
const NONTEXT = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'video', 'audio', 'canvas', 'textarea', 'title', '#comment']);
/** text of a subtree with line breaks at block boundaries; opts.skip(node) => true prunes a subtree */
export function textOf(n, opts = {}) {
  const parts = [];
  const rec = (x) => {
    if (!x) return;
    if (x.tag === '#text') { if (!x.raw) parts.push(decode(x.text)); return; }
    if (NONTEXT.has(x.tag)) return;
    if (opts.skip && opts.skip(x)) return;
    const blk = BLOCKISH.has(x.tag);
    if (blk) parts.push('\n');
    if (x.children) for (const c of x.children) rec(c);
    if (blk) parts.push('\n');
  };
  rec(n);
  return parts.join('').replace(/[ \t \r\f\v]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
}
export const squash = (s) => String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim();
export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
export const outer = (html, n) => html.slice(n.s, n.e);
export const inner = (html, n) => {
  const first = n.children && n.children[0];
  const last = n.children && n.children[n.children.length - 1];
  if (!first) return '';
  return html.slice(first.s, last.e);
};

// ---------- inline rich text (paragraphs, list items, headings with links) ----------
// Allowed inline tags; every other tag is unwrapped (its text kept). Attributes: a[href,target,rel,title], plus the
// sr-only span. Icons (<i class="fa...">) carry no text and are dropped.
const INLINE_ALLOW = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'small', 'mark', 'code', 'br', 'span']);
/**
 * Serialise inline content to a small HTML string.
 * opts.link(attrs) -> { href, rel?, target? } (rewrites hrefs; required)
 * Returns { html, text } where text is the visible+sr text (squashed).
 */
export function inlineHtml(nodes, opts = {}) {
  let out = '';
  const rec = (x) => {
    if (x.tag === '#text') { if (!x.raw) out += esc(decode(x.text)); return; }
    if (x.tag === '#comment' || NONTEXT.has(x.tag)) return;
    if (x.tag === 'i' && /\bfa[srlbd]?\b|\bfa-/.test(x.attrs.class || '') && !squash(textOf(x))) return;
    if (x.tag === 'br') { out += '<br>'; return; }
    if (isSrOnlyEl(x)) { out += '<span class="sr-only">'; for (const c of x.children || []) rec(c); out += '</span>'; return; }
    if (x.tag === 'a') {
      const r = opts.link ? opts.link(x.attrs) : { href: x.attrs.href };
      let at = r && r.href != null ? ' href="' + escAttr(r.href) + '"' : '';
      if (x.attrs.target) at += ' target="' + escAttr(x.attrs.target) + '"';
      if (x.attrs.rel) at += ' rel="' + escAttr(x.attrs.rel) + '"';
      if (x.attrs.title) at += ' title="' + escAttr(x.attrs.title) + '"';
      if (x.attrs['aria-label']) at += ' aria-label="' + escAttr(x.attrs['aria-label']) + '"';
      out += '<a' + at + '>';
      for (const c of x.children || []) rec(c);
      out += '</a>';
      return;
    }
    if (INLINE_ALLOW.has(x.tag) && x.tag !== 'span') {
      const t = x.tag === 'b' ? 'strong' : x.tag === 'i' ? 'em' : x.tag;
      out += '<' + t + '>';
      for (const c of x.children || []) rec(c);
      out += '</' + t + '>';
      return;
    }
    for (const c of x.children || []) rec(c);
  };
  for (const n of nodes) rec(n);
  out = out.replace(/[\s ]+/g, (m) => (m.includes(' ') && !/[\n\t]/.test(m) && m.length === 1 ? ' ' : ' '))
    .replace(/<(strong|em|u|s|small|mark|code|sup|sub)>(\s*)<\/\1>/g, (m, t, ws) => (ws ? ' ' : ''))
    .replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
  return out;
}

/** plain text of an inline html string (tags removed, entities decoded, whitespace squashed) */
export function htmlText(h) {
  return squash(decode(String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')));
}

// Deterministic JSON (keeps insertion order; callers build objects in a fixed order). Undefined is dropped.
export function stableJson(obj, indent = 1) { return JSON.stringify(obj, (k, v) => (v === undefined ? undefined : v), indent) + '\n'; }
