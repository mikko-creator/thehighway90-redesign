// home.mjs - the bespoke home page. Every section of the live home is carried in its live order with its own copy;
// the redesign adds the layers (loops, glass, halftone, protruding cut-outs, road signs) around it.
import { esc, attr, strip, ICON } from './util.mjs';
import { btn, rail, productRail, dealCard, catTile, effectFromSlide, effectCard, reviewFromSlide, reviewCard, renderBlocks, flatten } from './blocks.mjs';
import { backdrop, protrude, signHead, lane, shield } from './parts.mjs';

const T = (b) => (b ? b.text : '');
function findHeading(blocks, re) { return flatten(blocks).find((b) => b.t === 'heading' && re.test(b.text)); }
/** the live group that holds a heading (by text), as a flat block list */
function groupWith(sections, re) {
  for (const s of sections) {
    const walk = (g) => {
      for (const c of g.children || []) if (c.t === 'group') { const r = walk(c); if (r) return r; }
      return (g.children || []).some((c) => c.t === 'heading' && re.test(c.text)) ? g : null;
    };
    const r = walk(s);
    if (r) return r;
  }
  return null;
}
const blocksAfter = (flat, from, stopRe) => { const out = []; for (let i = flat.indexOf(from) + 1; i < flat.length; i++) { if (flat[i].t === 'heading' && stopRe && stopRe.test(flat[i].text)) break; out.push(flat[i]); } return out; };
const img = (ctx, ref, o) => { try { return ctx.img(ref, o); } catch (e) { ctx.warn('home img: ' + e.message); return ''; } };

export function homePage(page, ctx) {
  const S = page.sections;
  const all = flatten(S);
  const hours = (() => { const f = flatten(ctx.site.footer || []); const h = f.find((b) => b.t === 'text' && /<li><p>Sunday/.test(b.html)); const m = h && /<li><p>Sunday<\/p><p>([^<]+)<\/p>/.exec(h.html); return m ? m[1] : ''; })();

  // ---------- 1. hero ----------
  const kick = findHeading(S, /^Welcome to$/);
  const h1 = all.find((b) => b.t === 'heading' && b.level === 'h1');
  const sub = findHeading(S, /^Recreational Cannabis/);
  const heroBtns = all.filter((b) => b.t === 'button' && /^(Order Online|Specials)$/.test(b.text)).slice(0, 2);
  const h1Html = esc(h1 ? h1.text : 'Highway 90 Dispensary Marlton, NJ').replace(/Marlton, NJ$/, '<span class="road-u">Marlton, NJ</span>');
  const hero = '<section class="hero" aria-labelledby="hero-h">' + backdrop(ctx, { loop: 'V-HERO', still: 'G-HERO-ROAD', pos: '50% 60%', eager: true })
    + '<div class="hero__scrim" aria-hidden="true"></div><div class="hero__dots ht ht--cream" aria-hidden="true"></div>'
    + '<div class="wrap hero__grid">'
    + '<div class="hero__card glass glass--pop" data-reveal="left">'
    + (kick ? '<p class="kicker">' + esc(kick.text) + '</p>' : '')
    + '<h1 id="hero-h" class="split">' + h1Html + '</h1>'
    + (sub ? '<h2 class="hero__sub" data-reveal style="--d:.35s">' + sub.html + '</h2>' : '')
    + '<div class="btns" data-reveal style="--d:.5s">' + heroBtns.map((b, i) => btn(b.text, b.href, { kind: i ? 'glass' : 'primary' })).join('') + '</div>'
    + '<ul class="hero__facts" data-stagger><li>' + ICON.pin + '<a href="/directions/">90 Old Marlton Pike, Marlton, NJ 08053</a></li>' + (hours ? '<li>' + ICON.bolt + '<span>Open daily · ' + esc(hours) + '</span></li>' : '') + '<li>' + ICON.phone + '<a href="tel:(856)607-3473">(856) 607-3473</a></li></ul>'
    + '</div>'
    + '<div class="hero__art" aria-hidden="true">'
    + '<div class="dots" style="--w:340px;--c:var(--lane);left:-6%;top:6%"></div>'
    + protrude(ctx, 'CUT-LEAF', 'hero__leaf', { depth: 0.06, sizes: '(max-width: 900px) 50vw, 420px', rot: -18, widths: [480, 720, 960] })
    + shield(ctx, 'hero__shield', { sizes: '(max-width: 900px) 46vw, 380px', depth: 0.12 })
    + protrude(ctx, 'CUT-BUD-A', 'hero__bud', { depth: 0.22, sizes: '(max-width: 900px) 52vw, 440px', rot: 8, widths: [480, 720, 960] })
    + '</div></div>' + lane('hero__lane') + '</section>';

  // ---------- 2. featured brand + gift cards ----------
  const featG = groupWith(S, /^Featured Brand$/);
  const featH = findHeading(S, /^Featured Brand$/);
  const featP = featG ? flatten(featG.children).find((b) => b.t === 'products') : null;
  const gift = all.find((b) => b.t === 'image' && /giftcards/i.test(b.img.src));
  const featured = '<section class="sec feat ht ht--green" style="--ht-dir:200deg">'
    + '<div class="wrap feat__grid"><div class="feat__rail">' + productRail(ctx, featP, { head: signHead({ exit: '90', label: T(featH) || 'Featured Brand', cls: 'head--tight' }), offset: 0 }) + '</div>'
    + (gift ? '<a class="feat__gift" href="/menu/" data-reveal="pop" data-tilt>' + img(ctx, gift.img.src, { alt: gift.img.alt || '', sizes: '(max-width: 900px) 80vw, 340px', widths: [360, 540, 720, 1080] }) + '</a>' : '')
    + '</div></section>';

  // ---------- 3. welcome new customers ----------
  const newG = groupWith(S, /^Welcome New Customers!$/);
  const newF = newG ? flatten(newG.children) : [];
  const newH2 = newF.find((b) => b.t === 'heading' && b.level === 'h2');
  const newH3 = newF.find((b) => b.t === 'heading' && b.level === 'h3');
  const newTx = newF.find((b) => b.t === 'text');
  const newBtns = newF.filter((b) => b.t === 'button');
  const offers = newH3 ? [...newH3.text.matchAll(/(\d{1,2})%[^,]*?(1st|2nd|3rd)/g)].map((m) => [m[1] + '%', m[2]]) : [];
  const newbie = '<section class="sec newbie" aria-labelledby="newbie-h">'
    + '<div class="newbie__map" aria-hidden="true" data-depth="0.05"></div><div class="newbie__dots ht ht--ink" aria-hidden="true"></div>'
    + '<div class="wrap newbie__grid">'
    + '<div class="newbie__photo" data-reveal="left">' + img(ctx, 'assets/source/2024-10-hwy90-img-firsttimeusers.webp', { alt: 'Cannabis flower with trimming scissors', sizes: '(max-width: 900px) 80vw, 460px', widths: [480] })
    + protrude(ctx, 'CUT-PREROLL', 'newbie__pre', { depth: 0.18, sizes: '(max-width: 900px) 40vw, 300px', rot: -24, widths: [320, 480, 640] }) + '</div>'
    + '<div class="newbie__card glass glass--pop">'
    + '<span class="sign sign--orange" data-reveal="pop"><span class="sign__exit">1·2·3</span>First visits</span>'
    + (newH2 ? '<h2 id="newbie-h" class="split">' + newH2.html + '</h2>' : '')
    + (offers.length === 3 ? '<div class="newbie__bursts" data-stagger>' + offers.map(([p, n], i) => '<span class="burst' + (i === 1 ? ' burst--lane' : i === 2 ? ' burst--cream' : '') + '" style="--size:clamp(86px, 9vw, 118px);--fs:clamp(1.3rem, 1rem + 1vw, 1.8rem);--rot:' + [-12, 6, -4][i] + 'deg"><span>' + esc(p) + '<small>' + esc(n) + ' visit</small></span></span>').join('') + '</div>' : '')
    + (newH3 ? '<h3 class="newbie__offer" data-reveal>' + newH3.html + '</h3>' : '')
    + (newTx ? '<div class="prose" data-reveal>' + newTx.html + '</div>' : '')
    + '<div class="btns" data-reveal>' + newBtns.map((b, i) => btn(b.text, b.href, { kind: i ? 'deep' : 'primary' })).join('') + '</div>'
    + '</div></div></section>';

  // ---------- 4. three product rails on the deep green lane ----------
  const railSec = (re, offset, extra = '') => {
    const h = findHeading(S, re); if (!h) return '';
    const g = groupWith(S, re);
    // the rail's own heading, lede and button live in the same or the parent group: read them in document order
    const idx = all.indexOf(h);
    const tail = blocksAfter(all, h, /./).slice(0, 4);
    const lede = tail.find((b) => b.t === 'text');
    const b = tail.find((x) => x.t === 'button');
    const prod = tail.find((x) => x.t === 'products') || (g ? flatten(g.children).find((x) => x.t === 'products') : null);
    const head = '<div class="railhead"><h2 class="split">' + h.html + '</h2>' + (lede ? '<p data-reveal>' + strip(lede.html) + '</p>' : '') + (b ? btn(b.text, b.href, { sm: true, kind: 'glass' }) : '') + '</div>';
    return '<div class="railblock" data-idx="' + idx + '">' + productRail(ctx, prod, { head, offset }) + extra + '</div>';
  };
  const rails = '<section class="sec lanes on-dark" aria-label="Featured product rails">' + backdrop(ctx, { loop: 'V-SMOKE', still: 'G-SMOKE', cls: 'lanes__smoke' })
    + '<div class="lanes__dots ht ht--cream" aria-hidden="true"></div>'
    + protrude(ctx, 'CUT-BUD-B', 'lanes__bud', { depth: 0.2, sizes: '(max-width: 900px) 40vw, 320px', rot: -10, widths: [320, 480, 640] })
    + '<div class="wrap">' + railSec(/\$20 & Under/, 3) + railSec(/Fan-Favorite Vapes/, 7) + railSec(/Popular Products/, 11) + '</div></section>' + lane();

  // ---------- 5. shop by category ----------
  const catG = groupWith(S, /^Shop By Category$/);
  const boxes = catG ? flatten(catG.children).filter((b) => b.t === 'iconbox') : [];
  const cats = '<section class="sec catsec ht ht--ink" style="--ht-dir:20deg">'
    + '<div class="wrap">' + signHead({ exit: '08', label: 'Categories', h2: T(findHeading(S, /^Shop By Category$/)) || 'Shop By Category', cls: 'head--center' })
    + '<div class="cats cats--home" data-stagger>' + boxes.map((b, i) => catTile(b, ctx, i)).join('') + '</div></div></section>';

  // ---------- 6. deals and specials ----------
  const dealsG = groupWith(S, /^Deals and Specials$/);
  const dealsF = dealsG ? flatten(dealsG.children) : [];
  const loop = all.find((b) => b.t === 'loop');
  const dealsTx = dealsF.find((b) => b.t === 'text');
  const dealsBtn = dealsF.find((b) => b.t === 'button');
  const deals = '<section class="sec deals on-dark">' + backdrop(ctx, { still: 'assets/source/2024-10-hwy90-img-specialsbg.webp', pos: '50% 50%' })
    + '<div class="deals__tint" aria-hidden="true"></div><div class="deals__dots ht ht--cream" aria-hidden="true"></div>'
    + '<div class="wrap">' + '<div class="head head--row"><div>' + '<span class="kicker" data-reveal>' + esc(T(findHeading(S, /^Shop & Save!$/)) || '') + '</span><h2 class="split">' + esc(T(findHeading(S, /^Deals and Specials$/))) + '</h2>' + (dealsTx ? '<p data-reveal>' + strip(dealsTx.html) + '</p>' : '') + '</div>' + (dealsBtn ? btn(dealsBtn.text, dealsBtn.href, { kind: 'cream' }) : '') + '</div>'
    + (loop ? rail(loop.items.map((it, i) => dealCard(it, ctx, i)), { cls: 'rail--deals', w: 'clamp(270px, 28vw, 360px)' }) : '')
    + '</div></section>';

  // ---------- 7. pre-rolls ----------
  const pre = '<section class="sec prerolls">' + protrude(ctx, 'CUT-LEAF', 'pre__leaf', { depth: 0.16, sizes: '(max-width: 900px) 40vw, 300px', rot: 30, widths: [320, 480, 640] })
    + '<div class="wrap">' + railSec(/In-Demand Pre-Rolls/, 0) + '</div></section>';

  // ---------- 8. shop by effect ----------
  const fxH = findHeading(S, /^Shop by Effect$/);
  const fxN = all.find((b) => b.t === 'nested' && b.items.some((s) => effectFromSlide(s)));
  const fxBtn = fxH ? blocksAfter(all, fxH).find((b) => b.t === 'button') : null;
  const effects = fxN ? '<section class="sec effects on-dark"><div class="effects__map" aria-hidden="true"></div><div class="wrap">'
    + '<div class="head head--row"><div><span class="sign sign--orange" data-reveal="pop"><span class="sign__exit">6</span>Moods</span><h2 class="split">' + esc(T(fxH)) + '</h2></div>' + (fxBtn ? btn(fxBtn.text, fxBtn.href, { kind: 'cream' }) : '') + '</div>'
    + rail(fxN.items.map(effectFromSlide).filter(Boolean).map((e, i) => effectCard(e, ctx, i)), { cls: 'rail--fx', w: 'clamp(240px, 23vw, 300px)' }) + '</div></section>' : '';

  // ---------- 9. staff picks ----------
  const staff = '<section class="sec staff ht ht--green" style="--ht-dir:150deg"><div class="wrap">' + railSec(/^Staff Picks$/, 15) + '</div></section>';

  // ---------- 10. visit the dispensary ----------
  const visG = groupWith(S, /^Welcome to Highway 90!/);
  const visF = visG ? flatten(visG.children) : [];
  const visH2 = visF.find((b) => b.t === 'heading' && b.level === 'h2');
  const visH3 = visF.find((b) => b.t === 'heading' && b.level === 'h3');
  const visTx = visF.find((b) => b.t === 'text');
  const visBtns = visF.filter((b) => b.t === 'button');
  const store = all.find((b) => b.t === 'image' && /hwy90-img-seo/i.test(b.img.src));
  const visit = '<section class="sec visit on-dark">' + backdrop(ctx, { loop: 'V-NIGHT', still: 'G-ROAD-NIGHT', pos: '50% 50%' }) + '<div class="visit__tint" aria-hidden="true"></div>'
    + '<div class="wrap visit__grid">'
    + '<div class="visit__photo" data-reveal="left">' + (store ? '<figure class="frame visit__frame">' + img(ctx, store.img.src, { alt: store.img.alt || 'The Highway 90 dispensary in Marlton, NJ', sizes: '(max-width: 900px) 90vw, 560px', widths: [480, 680] }) + '</figure>' : '')
    + '<span class="burst burst--lane visit__burst" style="--size:120px;--fs:1.25rem;--rot:-12deg"><span>Marlton<small>NJ 08053</small></span></span></div>'
    + '<div class="visit__card glass glass--dark glass--pop">' + (visH3 ? '<p class="kicker visit__way" data-reveal>' + esc(visH3.text) + '</p>' : '')
    + (visH2 ? '<h2 class="split">' + visH2.html + '</h2>' : '') + (visTx ? '<div class="prose" data-reveal data-clamp>' + visTx.html + '</div>' : '')
    + '<div class="btns" data-reveal>' + visBtns.map((b, i) => btn(b.text, b.href, { kind: i ? 'glass' : 'primary' })).join('') + '</div></div>'
    + '</div></section>';

  // ---------- 11. FAQ + education ----------
  const faqH = findHeading(S, /^Frequently Asked Questions$/);
  const faqB = all.find((b) => b.t === 'faq');
  const faqBtn = faqH ? blocksAfter(all, faqH, /Cannabis Education|Elevate/).find((b) => b.t === 'button') : null;
  const eduK = findHeading(S, /^Cannabis Education$/);
  const eduH = findHeading(S, /^Elevate Your Understanding/);
  const eduF = eduH ? blocksAfter(all, eduH, /Read Our Reviews/) : [];
  const eduTx = eduF.find((b) => b.t === 'text');
  const eduBtn = eduF.find((b) => b.t === 'button');
  const learn = '<section class="sec learn"><div class="wrap learn__grid">'
    + '<div class="learn__faq">' + signHead({ exit: '?', label: 'Good to know', h2: T(faqH) }) + (faqB ? renderBlocks([faqB], ctx) : '') + (faqBtn ? '<div class="btns">' + btn(faqBtn.text, faqBtn.href, { kind: 'deep' }) + '</div>' : '') + '</div>'
    + '<aside class="learn__edu on-dark" data-reveal="zoom">' + backdrop(ctx, { still: 'G-TRICHOME', pos: '50% 50%' }) + '<div class="learn__eduin glass glass--dark">'
    + (eduK ? '<span class="sign sign--orange"><span class="sign__exit">101</span>' + esc(eduK.text) + '</span>' : '') + (eduH ? '<h2>' + eduH.html + '</h2>' : '') + (eduTx ? '<div class="prose">' + eduTx.html + '</div>' : '') + (eduBtn ? btn(eduBtn.text, eduBtn.href) : '') + '</div></aside>'
    + '</div></section>';

  // ---------- 12. reviews ----------
  const revH = findHeading(S, /^Read Our Reviews!$/);
  const revN = all.find((b) => b.t === 'nested' && b.items.some((s) => reviewFromSlide(s)));
  const revBtns = revH ? blocksAfter(all, revH).filter((b) => b.t === 'button') : [];
  const reviews = revN ? '<section class="sec reviews ht ht--ink">' + protrude(ctx, 'CUT-BUD-B', 'rev__bud', { depth: 0.18, sizes: '(max-width: 900px) 36vw, 260px', rot: 14, widths: [320, 480] })
    + '<div class="wrap">' + '<div class="head head--row"><div><span class="sign" data-reveal="pop"><span class="sign__exit">' + ICON.star + '</span>Google reviews</span><h2 class="split">' + esc(T(revH)) + '</h2></div><div class="btns">' + revBtns.map((b, i) => btn(b.text, b.href, { kind: i ? 'glass' : 'deep', sm: true })).join('') + '</div></div>'
    + rail(revN.items.map(reviewFromSlide).filter(Boolean).map((r) => reviewCard(r, ctx)), { cls: 'rail--rev', w: 'clamp(280px, 30vw, 380px)' }) + '</div></section>' : '';

  return hero + featured + newbie + rails + cats + deals + pre + effects + staff + visit + learn + reviews;
}
