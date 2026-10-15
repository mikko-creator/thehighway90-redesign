// crawl-one.mjs - fetch named live pages that are linked from the site but absent from its sitemaps, and merge them
// into audit/crawl.json (a 200 only; anything else is recorded and not saved).
//   node tools/crawl-one.mjs /blog/whatisgreenwednesday/ [/other/path/ ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const crawl = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/crawl.json'), 'utf8'));
for (const p of process.argv.slice(2)) {
  const u = 'https://www.thehighway90.com' + p;
  if (crawl.records.some((r) => r.url === u)) { console.log('have', u); continue; }
  const res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html' } });
  const rec = { url: u, status: res.status, chain: [], finalUrl: u, contentType: res.headers.get('content-type') || '', added: 'one' };
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status === 200) {
    const key = decodeURIComponent(new URL(u).pathname).replace(/^\/|\/$/g, '').replace(/\//g, '__').replace(/[^\p{L}\p{N}_.-]+/gu, '_').toLowerCase();
    rec.file = 'audit/raw/' + key + '.html'; rec.bytes = buf.length;
    fs.writeFileSync(path.join(PROJ, rec.file), buf);
  }
  crawl.records.push(rec);
  console.log(res.status, u);
  await new Promise((r) => setTimeout(r, 700));
}
crawl.counts = { total: crawl.records.length, ok: crawl.records.filter((r) => r.status === 200).length, redirected: crawl.records.filter((r) => r.chain && r.chain.length).length, notFound: crawl.records.filter((r) => r.status === 404).length };
fs.writeFileSync(path.join(PROJ, 'audit/crawl.json'), JSON.stringify(crawl, null, 2));
