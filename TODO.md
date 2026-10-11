# Project Emancipate — Build TODO

## Core Engine Modules
- [x] js/prng.js — Seeded PRNG (mulberry32)
- [x] js/noise.js — Simplex noise + fBm + domain warp
- [x] js/delaunay.js — Bowyer-Watson triangulation + Poisson/grid points
- [x] js/engine/terrain.js — Terrain generation (Delaunay + noise heightmap + biomes + chunks + LOD)
- [x] js/engine/building.js — Shape grammar + constraint solving for procedural buildings
- [x] js/engine/renderer.js — Canvas2D batch renderer, splat map compositing, camera
- [x] js/engine/audio.js — Web Audio synthesis + external music layers
- [x] js/engine/net.js — WebRTC signaling, host authority, state sync

## Gameplay Modules
- [x] js/gameplay/liberation.js — Region unlock progression, chapter gates
- [x] js/gameplay/combat.js — Attack/dash/hitbox, no skills
- [x] js/gameplay/loot.js — Quality + main stat + fixed affixes only
- [x] js/gameplay/npc.js — Functional interactables (shop/stash/portal)

## UI Modules
- [x] js/ui/radial.js — Tab/hold radial menu (mouse/gamepad/touch)
- [x] js/ui/hud.js — Minimap (zoomable), health, radial trigger

## Editor Module
- [x] js/editor/editor.js — Procedural presets, vector tools, object placement, playtest

## Entry Points & Config
- [x] js/main.js — Bootstrap, game loop, systems wiring
- [x] index.html — Game entry
- [x] editor.html — Map editor entry
- [x] serve_dev.py — Python dev server with no-cache headers
- [x] build_apk.py — Android APK builder (auto-installs SDK)
- [x] netlify.toml — Static deploy config
- [x] package.json — Minimal (only for Playwright E2E)

## Tests
- [x] tests/smoke_world.mjs — World structure validation
- [x] tests/smoke_quest.mjs — Quest chain validation
- [x] tests/smoke_loot.mjs — Loot/smith validation
- [x] playwright.config.js — E2E config (33 assertions)
- [x] tests/e2e.spec.js — Playwright E2E tests

## Deployment
- [x] GitHub Actions workflow for Pages deploy
- [x] APK build verification