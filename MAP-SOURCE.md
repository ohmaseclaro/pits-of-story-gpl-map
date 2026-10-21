# Floor source

Region JSON and BIN in this folder are derived from the Canary OpenTibia
world map (GPL-2.0). Appearance sprites are not part of this kit.

- Upstream map: https://github.com/opentibiabr/canary/releases/download/v3.6.1/otservbr.otbm
- OTBM release: **v3.6.1** (184776037 bytes)
- Canary commit: `04b83b512114bfd888000d6e1433ed8ecaec7c5b` (`04b83b5`)
- Region config: `scripts/map/regions.ts` — the 16 Rookgaard adventure maps, all in `floors/earth/`. Crop geometry, gate waivers and file hashes per map: `scripts/map/REPORT.md`
- BIN: five sections of w×h entries, 8 bytes per tile: ground u16, overlay u16, walk u8, speed u16, unsight u8 (1 where the tile blocks sight and missiles)
- Item flags: `scripts/map/tile-flags.json` (ids and the flag values the converter reads; no client files)
- Rebuild and check: `node --experimental-strip-types scripts/map/rebuild-floors.ts` (see README.md)
- Shipped regions in this kit: `floors/earth/<id>.json` and `floors/earth/<id>.bin` for every region tagged `adventure` in the region config

These files stay next to the game as separate data. They are not inlined into the JavaScript bundle.

See `LICENSE.GPL-2.0` here. Credits name the Canary project only.
