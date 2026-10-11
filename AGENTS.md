# Project Emancipate / 解放计划 — Agent Instructions

## Project Overview
Zero-dependency, zero-build isometric ARPG. Pure static deployment (Netlify/GitHub Pages). Native ES Modules + Canvas2D. Single 1000×1000 seamless world. Player faction liberates regions via chapter-based main quest. No skill system — only basic attack, dash, interact.

## Tech Stack (Immutable Constraints)
- **No package.json, no node_modules, no build step** — pure static files
- **Python 3** only for `serve_dev.py` (dev server with no-cache headers) and `build_apk.py` (Android APK)
- **Canvas2D + OffscreenCanvas** for rendering (no WebGL/WebGPU)
- **Delaunay triangulation + noise** for terrain mesh
- **Shape grammar + constraint solving** for procedural buildings
- **Splat Map mixing via multi-layer OffscreenCanvas compositing**
- **WebRTC P2P** (host-authoritative) for 2–6 player co-op
- **localStorage/IndexedDB** for saves (multi-slot, versioned, exportable)

## Repository Structure (Flat, <20 files)
```
index.html          # game entry
editor.html         # map editor entry
serve_dev.py        # python -m http.server with no-cache headers
build_apk.py        # Android APK builder (auto-installs SDK)
netlify.toml        # static deploy config (publish root)
js/
  main.js           # bootstrap, game loop, systems wiring
  engine/
    terrain.js      # Delaunay + noise → triangle mesh + LOD
    building.js     # shape grammar → constrained building geometry
    renderer.js     # Canvas2D batch renderer, splat compositing, camera
    audio.js        # Web Audio synthesis + external music layers
    net.js          # WebRTC signaling, host authority, state sync
  gameplay/
    liberation.js   # region unlock progression, chapter gates
    combat.js       # attack/dash/hitbox, no skills
    loot.js         # quality + main stat + fixed affixes only
    npc.js          # functional interactables only (shop/stash/portal)
  ui/
    radial.js       # Tab/hold radial menu (mouse/gamepad/touch)
    hud.js          # minimap (zoomable in settings), health, radial trigger
  editor/
    editor.js       # procedural presets, vector tools, object placement, playtest
```

## Developer Commands
```bash
# Dev server (ES Modules require HTTP)
python serve_dev.py 8091        # → http://localhost:8091/index.html
                                # → http://localhost:8091/editor.html

# Syntax check (pre-commit gate)
for f in js/main.js js/engine/*.js js/gameplay/*.js js/ui/*.js js/editor/*.js; do
  node --check "$f" || exit 1
done

# Smoke tests (node, no browser)
node tests/smoke_world.mjs      # region: zones, 6 NPCs, 3 gates, boss on highland, no town spawns
node tests/smoke_quest.mjs      # linear rebel quest chain, zone gates at 1/3/5
node tests/smoke_loot.mjs       # 4 tiers, boss exclusive pool, compare tooltip, smith +10 table

# E2E (Playwright, 33 assertions)
npx playwright test             # desktop 1280x800 + mobile 667x375
                                # title menu, settings hub, KB/touch, P0 trio (compare/rift/smith)

# APK (offline WebView shell)
python apk/build_apk.py         # → apk/dist/legend.apk (debug signed)
python apk/build_apk.py --clean # clean rebuild
```

## Key Architectural Decisions
- **Deterministic everything** — same seed = identical world/buildings/loot/combat
- **No skill system** — LMB attack, RMB/Shift dash, E interact, Tab map, radial menu for all else
- **Radial menu** (Tab/hold) replaces all panel hotkeys — mouse/gamepad/touch unified
- **Chapter-gated progression** — 3 zone gates at 33%/66%/100% story, boss at final gate
- **Minecraft Dungeons secrets** — hidden passages, breakable walls, pressure plates
- **Bestiary/Codex** — kill/pickup/discover unlocks entries, completion rewards
- **Adaptive quality** — startup benchmark → dynamic LOD/draw distance/particles
- **Death** — "Mercy mode" (opt-in, zero penalty) vs Standard (small gold loss)
- **Difficulty** — Normal/Hard/Expert/Master (numbers + mechanics + drop rates)
- **Localization** — Chinese only + icon-only UI (SVG icons, pixel font with CJK)
- **Accessibility** — universal design (large targets, high contrast, clear feedback), no special modes

## Testing Conventions
- **Syntax gate must pass** before any test runs
- **Three smoke tests are mandatory** — world structure, quest chain, loot/smith
- **Playwright E2E covers** title menu, settings, KB/touch, P0 trio (compare tooltip, rift dive/exit, smith success/fail)
- **Console must show 0 errors** (font CDN / favicon noise expected)

## Common Gotchas
- ES Modules **require HTTP** — `file://` won't work (CORS)
- `serve_dev.py` sends `Cache-Control: no-cache` — manual refresh picks up edits
- Canvas2D splat mixing: **pre-bake chunks to OffscreenCanvas** at gen time; runtime = single `drawImage`
- WebRTC needs STUN/TURN for NAT traversal — use public STUN, TURN optional
- APK builds **download Android SDK (~300 MB)** on first run to `apk/.sdk/`
- Determinism: **Math.random() banned** — use seeded PRNG (mulberry32/xoshiro) everywhere
- Editor playtest writes to `localStorage.legendeditor.playtest` → `index.html?playtest=1`

## References
- Original inspiration: https://github.com/chyyl/legend
- SkillHub install: `skillhub install <skill> --dir ~/.opencode/skills`