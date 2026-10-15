# Highway 90: "Route 90 Pop" redesign

A redesign pitch for [thehighway90.com](https://www.thehighway90.com/) (Highway 90 Dispensary, Marlton, NJ): the live
site's structure and copy, re-staged as glassmorphism + pop art with layered depth, protruding cut-outs, scroll motion
and hover physics. Static HTML/CSS/JS, no platform runtime.

## Run it

```bash
node src/build.mjs                      # dist/ (needs cwebp + webpmux on PATH for image variants)
node tools/serve.mjs --root dist --port 8792 --not-found 404.html
# open http://127.0.0.1:8792/
```

## Layout

| Path | What |
|---|---|
| `src/build.mjs` | page models -> `dist/` (one page per live URL, hashed WebP variants, loops, redirects) |
| `src/lib/` | extraction (live HTML -> page models), image pipeline, HTML utilities |
| `src/theme/` | templates: `home.mjs` (bespoke), `inner.mjs` (every other page), `blocks.mjs`, `chrome.mjs`, `shell.mjs` |
| `src/styles/` | `tokens.css` (brand tokens) -> `base` -> `components` -> `chrome` -> `motion` -> `home` -> `pages` |
| `src/scripts/site.js` | reveals, parallax, rails, tilt, loops, menus, age gate (no dependencies) |
| `src/content/` | page models (`pages/*.json`), site chrome (`site.json`), menu snapshot (`menu.json`), image plan |
| `assets/` | real imagery (`source/`), generated media (`generated/`, AI-labelled), brand files, fonts |
| `audit/` | crawl record, sitemap inventory (the full ~3,760-URL architecture), extraction coverage |
| `tools/` | crawl, harvest, extraction, media generation, loop making, checks |
| `docs/DECISIONS.md` | decisions and open items for the client |

## Media provenance

Generated stills (fal flux-pro ultra + birefnet cut-outs) and loops (Higgsfield Kling image-to-video) are illustrative
industry imagery only: no people, no text, no real place, product or packaging. Every generated file carries an IPTC
`trainedAlgorithmicMedia` label. Real Highway 90 photos, deal graphics and product packshots are the live site's own.
