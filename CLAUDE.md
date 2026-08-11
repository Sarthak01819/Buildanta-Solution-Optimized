# buildanta-site — Buildanta Solutions flagship

Dev server: **5280** (LAN). This is the live company site's source — every change is client-facing.

## Do NOT touch

- **The approved design is FROZEN** (vault rule UX4). No redesigns, restyles or "leveling up" of approved visuals; ambiguous scope resolves toward preserving what Yash approved.
- **Never move a scroll act's beat boundaries without asking Yash** — a silent ACT 03 retime ate the WE SCALE act twice, and its own tests passed both times.
- **Element ids must be page-scoped** — a generic id in one page collided with another page's during the world build. No generic ids (`#canvas`, `#overlay`, …) in shared scope.
- **The black-hole world (Projects falls into the world) lives in the COPY** at `~/claude code/buildanta-site-world` — do not port it into this repo until Yash says so.
