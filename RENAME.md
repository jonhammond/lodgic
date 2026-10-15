# InnSights → Lodgic rename

Portfolio card already updated on `dev` in `jonhammond.github.io` (`assets/lodgic.png`, `index.html` title/links).
Order matters: deploy target + DNS first, portfolio merge last.

## 1. App repo (`~/Code/innsights-ai`)

- [x] `frontend/app.json`: `"name": "Lodgic"`, `"slug": "lodgic"`
- [x] `frontend/components/Header.tsx:33`: wordmark text `InnSights` → `Lodgic`
- [x] `frontend/components/Logo.tsx`: comment + `accessibilityLabel` → `Lodgic`; redraw `assets/logo.svg` if the roofline mark should change
- [x] `frontend/App.tsx:65`: `STORAGE_KEY` `innsights.properties` → `lodgic.properties` (resets saved property selections for existing users; acceptable for a demo)
- [x] `frontend/theme/useTheme.ts:6`: `STORAGE_KEY` `innsights.theme` → `lodgic.theme`
- [x] `README.md`: title `# lodgic`, live-demo URL → `https://lodgic.jonhammond.org`
- [x] `.serena/project.yml`: `project_name: "lodgic"`
- [x] `supabase/config.toml`: `project_id = "lodgic"` (local CLI label only; hosted project unaffected)
- [x] `grep -rniE innsight --exclude-dir=node_modules --exclude-dir=.git .` → empty (tracked files clean; remaining hits are ignored build/cache dirs: `frontend/dist`, `frontend/.expo`, `supabase/.temp`, `.remember`)
- [ ] Commit on a branch, merge, push

## 2. GitHub

- [ ] Rename repo `jonhammond/innsights-ai` → `jonhammond/lodgic` (Settings → General). GitHub redirects the old URL.
- [ ] `git remote set-url origin git@github.com:jonhammond/lodgic.git`
- [ ] `mv ~/Code/innsights-ai ~/Code/lodgic`; update any Serena/editor workspace paths

## 3. Vercel

- [ ] Rename project to `lodgic` (Settings → General). Confirm the Git integration re-links after the repo rename.
- [ ] Domains: add `lodgic.jonhammond.org`
- [ ] Keep `innsights.jonhammond.org` attached and set it to redirect (308) to `lodgic.jonhammond.org`, or remove it once nothing links to it
- [ ] Redeploy; confirm wordmark + tab title read Lodgic
- [ ] Supabase dashboard: rename hosted project "Innsights AI" → "Lodgic" (Project Settings → General; cosmetic, no ref/URL change)

## 4. DNS (jonhammond.org)

- [ ] Add CNAME `lodgic` → `cname.vercel-dns.com` (or the value Vercel shows)
- [ ] Leave `innsights` CNAME in place while the redirect is wanted
- [ ] `dig +short lodgic.jonhammond.org` resolves; `curl -sI https://lodgic.jonhammond.org | head -1` returns 200

## 5. Portfolio (`~/Code/jonhammond.github.io`)

- [ ] Retake screenshot at the same crop as the current `assets/lodgic.png`, overwrite it
- [ ] Commit the rename on `dev`
- [ ] Merge `dev` → `master` only after §3–4 are green (deploys to production)
- [ ] Verify live card: image loads, title `lodgic`, both buttons resolve

## 6. Brand hygiene

- [ ] Trademark search (USPTO TESS) for "Lodgic" in software/analytics classes
- [ ] Check `lodgic.ai` / `lodgic.app` / `lodgic.com` availability; register if cheap
- [ ] Update any LinkedIn/résumé mentions of InnSights
