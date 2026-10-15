#!/usr/bin/env bash
# publish.sh - export the committed workspace to the public repo (main) and the noindex Pages preview (gh-pages).
#   KEYS_DIR=<folder outside the project holding fal.key and hf.key> bash tools/publish.sh "<commit message>"
# Never pushes the workspace repo itself. Both public copies are secret-scanned against the real key values first.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_URL="https://github.com/mikko-creator/thehighway90-redesign.git"
PREFIX="/thehighway90-redesign"
KEYS="${KEYS_DIR:?set KEYS_DIR to the folder holding fal.key and hf.key (outside the project)}"
MSG="${1:-Update}"
TRAILER=$'\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

[ -z "$(git status --porcelain)" ] || { echo "workspace not clean: commit first"; exit 1; }

# ---- 1. build + link check ----
node src/build.mjs
node tools/link-check.mjs --dir dist > tmp/link-check.log 2>&1 || true
grep -E "^files" tmp/link-check.log | head -1

# ---- 2. repo export (main) ----
mkdir -p publish/repo
if [ ! -d publish/repo/.git ]; then git -C publish/repo init -q -b main; git -C publish/repo remote add origin "$REPO_URL"; fi
find publish/repo -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git archive HEAD | tar -x -C publish/repo
node tools/secret-scan.mjs --dir publish/repo --keys "$KEYS/fal.key" --keys "$KEYS/hf.key"
git -C publish/repo add -A
git -C publish/repo -c user.name="mikko-creator" -c user.email="mikko@dispenza.com" commit -q -m "$MSG$TRAILER" || echo "repo: nothing to commit"
git -C publish/repo push -q -u origin main

# ---- 3. preview (gh-pages) ----
MSYS_NO_PATHCONV=1 node tools/make-pages-preview.mjs --prefix "$PREFIX" --out preview
node tools/secret-scan.mjs --dir preview --keys "$KEYS/fal.key" --keys "$KEYS/hf.key"
if [ ! -d preview/.git ]; then git -C preview init -q -b gh-pages; git -C preview remote add origin "$REPO_URL"; fi
git -C preview add -A
git -C preview -c user.name="mikko-creator" -c user.email="mikko@dispenza.com" commit -q -m "Preview: $MSG$TRAILER" || echo "preview: nothing to commit"
git -C preview push -q -u origin gh-pages
echo "published: repo $(git -C publish/repo rev-parse --short HEAD), preview $(git -C preview rev-parse --short HEAD)"
