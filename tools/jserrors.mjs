// jserrors.mjs — load pages in headless Chrome and report every uncaught exception and console
// error. A page can screenshot perfectly while its script dies on line 1 (a green gate is not a
// working page).  node src/tools/jserrors.mjs --base http://127.0.0.1:8793 --paths /,/shop,/brands
import { launch, sleep } from './cdp.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const paths = String(args.paths || '/').split(',');
const b = await launch({ port: 0 });
let total = 0;
try {
  for (const p of paths) {
    const pg = await b.newPage({ width: Number(args.width || 1440), height: 900 });
    const errs = [];
    b.on((m) => {
      if (m.sessionId !== pg.sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push('EXCEPTION ' + ((d.exception && d.exception.description) || d.text).split('\n')[0] + ' @' + d.lineNumber + ':' + d.columnNumber); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error ' + m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 200));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push('log ' + m.params.entry.text.slice(0, 200) + ' ' + (m.params.entry.url || ''));
    });
    await pg.send('Log.enable');
    await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('sdz-age-21','true')}catch(e){}" });
    await pg.goto(args.base + p, { settle: 1200 });
    const probe = await pg.eval(`({ js: document.documentElement.classList.contains('js'), chooserWired: !!document.querySelector('[data-chooser-open]') })`);
    total += errs.length;
    console.log((errs.length ? 'FAIL ' : 'ok   ') + p + (errs.length ? '\n   ' + errs.join('\n   ') : ''));
    await b.send('Target.closeTarget', { targetId: pg.targetId }).catch(() => {});
    await sleep(100);
  }
} finally { await b.close(); }
console.log('pages', paths.length, 'errors', total);
process.exit(total ? 1 : 0);
