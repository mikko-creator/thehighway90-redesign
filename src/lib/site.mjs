// site.mjs - shared paths and small helpers for the build (Node builtins only).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
export const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const LIVE_ORIGIN = 'https://www.thehighway90.com';
