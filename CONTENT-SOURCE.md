# Content source

Catalog JSON in this folder is derived from the Canary OpenTibia server datapack (GPL-2.0).

- Upstream: https://github.com/opentibiabr/canary
- Pinned commit: `04b83b512114bfd888000d6e1433ed8ecaec7c5b`
- OTBM release: v3.6.1
- License: GPL-2.0 (see LICENSE.GPL-2.0)
- Build: `npm run content:build`
- Config tables: monsters, items, spawns, enums, plus later-phase catalogs (waves, loot, shops, imbuements, hub)

A missing checkout exits 1 unless `--fixtures` is passed (tests only). CI never downloads upstream.

These files stay next to the game as separate data. They are not inlined into the JavaScript bundle.

See `LICENSE.GPL-2.0` here. Credits name the Canary project only.
