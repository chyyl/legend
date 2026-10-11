# Project Emancipate / 解放计划

Zero-dependency, zero-build isometric ARPG. Pure static deployment (Netlify/GitHub Pages). Native ES Modules + Canvas2D. Single 1000×1000 seamless world. Player faction liberates regions via chapter-based main quest. No skill system — only basic attack, dash, interact.

## 🎮 Play Now

- **Game**: [https://your-username.github.io/legend/](https://your-username.github.io/legend/)
- **Editor**: [https://your-username.github.io/legend/editor.html](https://your-username.github.io/legend/editor.html)

## 🚀 Quick Start

```bash
# Dev server (ES Modules require HTTP)
python serve_dev.py 8091
# → http://localhost:8091/index.html
# → http://localhost:8091/editor.html

# Syntax check (pre-commit gate)
for f in js/main.js js/engine/*.js js/gameplay/*.js js/ui/*.js js/editor/*.js; do
  node --check "$f" || exit 1
done

# Smoke tests (Node, no browser)
node tests/smoke_world.mjs      # zones, 6 NPCs, 3 gates, boss on highland
node tests/smoke_quest.mjs      # linear quest chain, gates at 33%/66%/100%
node tests/smoke_loot.mjs       # 4 tiers, boss pool, compare tooltip, smith +10

# E2E tests (Playwright, 33 assertions)
npx playwright test             # desktop 1280x800 + mobile 667x375

# APK build (offline WebView shell)
python build_apk.py             # → apk/dist/legend.apk (debug signed)
python build_apk.py --clean     # clean rebuild
```

## 🏗️ Architecture

### Tech Stack (Immutable)
- **No package.json, no node_modules, no build step** — pure static files
- **Python 3** only for `serve_dev.py` (dev server) and `build_apk.py` (APK)
- **Canvas2D + OffscreenCanvas** for rendering (no WebGL/WebGPU)
- **Delaunay triangulation + noise** for terrain mesh
- **Shape grammar + constraint solving** for procedural buildings
- **Splat Map mixing via multi-layer OffscreenCanvas compositing**
- **WebRTC P2P** (host-authoritative) for 2–6 player co-op
- **localStorage/IndexedDB** for saves (multi-slot, versioned, exportable)

### Repository Structure (Flat, <20 files)
```
index.html          # game entry
editor.html         # map editor entry
serve_dev.py        # python -m http.server with no-cache headers
build_apk.py        # Android APK builder (auto-installs SDK)
netlify.toml        # static deploy config (publish root)
js/
  main.js           # bootstrap, game loop, systems wiring
  prng.js           # seeded PRNG (mulberry32)
  noise.js          # Simplex noise + fBm + domain warp
  delaunay.js       # Bowyer-Watson triangulation + Poisson/grid points
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
    hud.js          # minimap (zoomable), health, radial trigger
  editor/
    editor.js       # procedural presets, vector tools, object placement, playtest
tests/
  smoke_world.mjs   # world structure validation
  smoke_quest.mjs   # quest chain validation
  smoke_loot.mjs    # loot/smith validation
  e2e.spec.js       # Playwright E2E (33 assertions)
apk/                # Android build output
.github/workflows/  # CI/CD
```

## 🎯 Key Features

### World & Progression
- **1000×1000 seamless world** — no loading screens, chunked streaming
- **10 hand-crafted zones** across 3 chapters (starter → grassland → forest → wasteland → highland → boss)
- **Chapter-gated progression** — 3 zone gates at 33%/66%/100% story, boss at final gate
- **Liberation system** — clear enemies, destroy spawners, capture points, defeat bosses
- **Bestiary/Codex** — kill/pickup/discover unlocks entries, completion rewards

### Combat (No Skills)
- **LMB / Click** — basic attack (60° cone, cleaves up to 3)
- **RMB / Shift** — dash (200ms, 400 units/s, 150ms i-frames, 800ms CD)
- **E** — interact (doors, NPCs, portals, chests)
- **Tab** — radial menu (inventory, map, quests, settings, social, emotes)
- **No Q/E/R/F skills** — pure action fundamentals

### Loot & Economy
- **4 tiers**: Common (1 affix) → Magic (2) → Rare (3) → Legendary (3 + unique)
- **Main stat per slot** + **fixed affix pools** (offensive/defensive/utility)
- **Boss exclusive pool**: Execute, Thorns, Lifesteal, Cleave, Shield on Kill
- **Single currency** (gold) + sell/buy/enhance
- **Smith +10 table** — exponential cost, fail/destroy chances at +7/+9

### Multiplayer
- **P2P WebRTC** (host-authoritative) for 2–6 players
- **Room code** join, shared progression, individual loot
- **STUN/TURN** for NAT traversal

### Editor
- **Procedural presets** for terrain biomes, building types, NPC templates
- **Vector tools**: terrain brush, biome brush, building/NPC/spawner/waypoint placement
- **Playtest mode** — one-click launch in game with current map
- **Export/Import** JSON maps, share via localStorage

### Art & Audio
- **Modern pixel art** with normal maps, dynamic lighting, post-FX (via Canvas2D compositing)
- **64×32 isometric tiles** but procedural geometry (no traditional tilemap)
- **Adaptive music** — layered explore/combat/danger/town/boss with crossfades
- **Procedural SFX** via Web Audio synthesis

### Accessibility & Polish
- **Chinese only + icon-only UI** (SVG icons, pixel font with CJK)
- **Universal design** — large targets, high contrast, clear feedback
- **Mercy mode** (opt-in, zero penalty) vs Standard (small gold loss)
- **4 difficulties**: Normal/Hard/Expert/Master (numbers + mechanics + drop rates)
- **Adaptive quality** — startup benchmark → dynamic LOD/draw distance/particles

## 📦 Deployment

### Netlify / GitHub Pages (Recommended)
1. Push to GitHub
2. Enable GitHub Pages or connect to Netlify
3. Build command: `echo 'No build step'`
4. Publish directory: `/` (root)

### Android APK
```bash
python build_apk.py
# Downloads Android SDK (~300 MB) on first run to apk/.sdk/
# Outputs apk/dist/legend.apk (debug signed, WebView shell)
```

## 🧪 Testing

| Test | Command | Purpose |
|------|---------|---------|
| Syntax | `node --check js/**/*.js` | Pre-commit gate |
| World | `node tests/smoke_world.mjs` | 10 zones, 6 NPCs, 3 gates, boss on highland |
| Quest | `node tests/smoke_quest.mjs` | Linear chain, gates at 33%/66%/100% |
| Loot | `node tests/smoke_loot.mjs` | 4 tiers, boss pool, compare, smith +10 |
| E2E | `npx playwright test` | 33 assertions (title, settings, KB/touch, P0 trio) |

## 🎨 Customization

### World Seed
Add `?seed=12345` to URL for deterministic world generation.

### Mercy Mode
Enable in settings or `localStorage.setItem('emancipate_mercy', 'true')`

### Quality Presets
Settings → Graphics: Auto (adaptive) / Low / Medium / High

## 📜 License

MIT — Free, open source, community-driven.

## 🙏 Credits

- Original inspiration: [chyyl/legend](https://github.com/chyyl/legend)
- Noise: Stefan Gustavson's Simplex implementation
- Delaunay: Bowyer-Watson algorithm
- Icons: SVG inline, no external deps

---

**Built with ❤️ for the open web. No frameworks, no build steps, no tracking.**