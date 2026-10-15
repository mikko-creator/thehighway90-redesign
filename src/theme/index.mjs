// index.mjs - the theme contract: renderPage(page, ctx) and render404(ctx).
import { shell } from './shell.mjs';
import { homePage } from './home.mjs';
import { innerPage, notFoundMain } from './inner.mjs';

export function renderPage(page, ctx) {
  if (page.path === '/') return shell(ctx, { page, main: homePage(page, ctx), bodyClass: 'l-home' });
  const s0 = page.path.split('/').filter(Boolean)[0] || 'page';
  return shell(ctx, { page, main: innerPage(page, ctx), bodyClass: 'l-inner l-' + s0.replace(/[^a-z0-9-]/gi, '') + (page.kind === 'post' ? ' is-post' : '') });
}

export function render404(ctx) {
  return shell(ctx, { page: { path: '/404.html', head: { title: 'Page not found | Highway 90', robots: 'noindex' } }, main: notFoundMain(ctx), bodyClass: 'l-404' });
}
