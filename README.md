# Pits of Story: Canary GPL map and content kit

This is the GPL-2.0 source package for the Canary-derived map and catalog
data that Pits of Story ships as separate data files beside the game. The
game code is not part of this kit; it only reads these files.

- Public repository: https://github.com/ohmaseclaro/pits-of-story-gpl-map
  (one tag per game version)
- License: GPL-2.0 (see `LICENSE.GPL-2.0`)
- Upstream: https://github.com/opentibiabr/canary
- Pinned commit: `04b83b512114bfd888000d6e1433ed8ecaec7c5b` (`04b83b5`)
- Map: `otservbr.otbm` from the Canary v3.6.1 release (also attached to
  this repository's releases; it is over GitHub's 100 MB file limit)
- Contact: privacy@pitsofstory.com

Credits name the Canary project only.

## What is in this kit

- `floors/earth/*.bin` and `*.json`: the 16 Rookgaard maps the game uses
- `content/*.json`: catalog JSON produced by `scripts/content`
- `scripts/map/**`: the map converter; `scripts/map/regions.ts` is the
  region table (which part of the map each file is cut from)
- `scripts/map/tile-flags.json`: for every item id on those maps, the
  values the converter reads (ground, takeable, blocks movement, blocks
  sight, ground speed). Ids and numbers only
- `scripts/content/**`, `scripts/kits/**`: the catalog and vocation table
  scripts; `src/data/vocationKits.canary.ts` is the vocation table they write
- `LICENSE.GPL-2.0`, `MAP-SOURCE.md`, `CONTENT-SOURCE.md`

No images, sprite atlases or game client files are included.

## Rebuild the maps

Needs Node.js 22.12 or newer and nothing else (no npm install).

```
bash scripts/content/fetch.sh
node --experimental-strip-types scripts/map/rebuild-floors.ts
```

`fetch.sh` downloads the pinned Canary tree and `otservbr.otbm` into
`art-src/otserv/` and checks their SHA-256. `rebuild-floors.ts` converts
every map into `.tmp/rebuilt-floors/` using only those files and
`tile-flags.json`, then compares the result with `floors/`: each `.bin` must
match byte for byte, and each `.json` must match apart from its `visual`
key (the sprite layout, which the game builds from art that is not part of
this kit). It prints `16 maps match` or lists the files that differ and
exits 1.
