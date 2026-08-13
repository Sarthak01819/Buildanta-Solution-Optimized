# buildanta-site — Buildanta Solutions flagship

Dev server: **5280** (LAN). This is the live company site's source — every change is client-facing.

## Do NOT touch

- **The approved design is FROZEN** (vault rule UX4). No redesigns, restyles or "leveling up" of approved visuals; ambiguous scope resolves toward preserving what Yash approved.
- **Never move a scroll act's beat boundaries without asking Yash** — a silent ACT 03 retime ate the WE SCALE act twice, and its own tests passed both times.
- **Element ids must be page-scoped** — a generic id in one page collided with another page's during the world build. No generic ids (`#canvas`, `#overlay`, …) in shared scope.
- **`content/` is GENERATED — never hand-edit it.** `content/world.json` and `content/site.json` come from the CMS. Editing them by hand works until the next publish silently overwrites you. Change the words in the admin instead.
- **`src/world/` is a PORT, not a fork.** It came from `~/claude code/unseen-world` on 13 Aug 2026. Fix bugs upstream there (it has a 137-check suite), then bring them across — a fix made only here is lost the next time the world is re-ported.
- **Do not copy files in from `~/claude code/buildanta-site-world`.** That copy has NO shared git history with this repo and several of its files are OLDER than ours: copying `main.js` re-adds the crash recorder removed in `dd983a4`, `crashWatch.js` reverts its docs, and `vite.config.js` changes the dev port to 5290. The world is already ported; the copy is now a historical artifact.
- **`public/world/art/` is the world's media and is committed on purpose** (Yash's call, 13 Aug). Do not add `public/art/` — an earlier build wrote a byte-identical 3.7 MB duplicate there that nothing read.
