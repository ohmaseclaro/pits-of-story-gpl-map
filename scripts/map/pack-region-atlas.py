#!/usr/bin/env python3
"""Pack a per-region appearance atlas. Authoring only (map:build).

Default (--ids): 32×32 crops from library/objects/<id>/0_0.png (old artifacts).
With --stacks: native sprites from appearances.dat + library/sheets, one frame
per (id, pattern x/y/z, phase) the region uses.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from atlas_common import EXTRUDE, PADDING, frame_entry, save_atlas, shelf_pack, with_extrude
from tibia.extract import load_sheets, pull_sprite
from tibia.proto import parse_appearances

MAX_SIZE = 2048
CELL = 32
PITCH = CELL + 2 * EXTRUDE + PADDING  # 36
MAX_ELEV = 24
CLS_BANK, CLS_CLIP, CLS_BOTTOM, CLS_COMMON, CLS_TOP = 0, 1, 2, 3, 4


def pack_grid(named: list[tuple[str, Image.Image]]) -> tuple[Image.Image, dict]:
    n = len(named)
    cols = (MAX_SIZE - 2 * (PADDING + EXTRUDE) + (PADDING + 2 * EXTRUDE)) // PITCH
    rows = (n + cols - 1) // cols
    grid = lambda k: 2 * (PADDING + EXTRUDE) + k * PITCH - (PADDING + 2 * EXTRUDE)
    atlas_w = grid(min(cols, n) if n else 1)
    atlas_h = grid(rows if n else 1)
    if atlas_w > MAX_SIZE or atlas_h > MAX_SIZE:
        raise SystemExit(f"grid atlas {atlas_w}x{atlas_h} exceeds {MAX_SIZE}")
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames: dict = {}
    for i, (name, im) in enumerate(named):
        if im.width != CELL or im.height != CELL:
            im = im.crop((im.width - CELL, im.height - CELL, im.width, im.height))
        px = PADDING + (i % cols) * PITCH
        py = PADDING + (i // cols) * PITCH
        atlas.paste(with_extrude(im), (px, py))
        frames[name] = frame_entry(px + EXTRUDE, py + EXTRUDE, CELL, CELL)
    return atlas, frames


def object_png(library: Path, appearance_id: int) -> Path:
    direct = library / "objects" / str(appearance_id) / "0_0.png"
    if direct.is_file():
        return direct
    raise SystemExit(f"missing library object {appearance_id} at {direct}")


def write_atlas(path_png: Path, image: Image.Image, frames: dict, version: str) -> None:
    save_atlas(path_png, image, frames, "scripts/map/pack-region-atlas.py", version=version)


def item_class(app) -> int:
    f = app.flags
    if f.bank or f.fullbank:
        return CLS_BANK
    if f.clip:
        return CLS_CLIP
    if f.bottom:
        return CLS_BOTTOM
    if f.top:
        return CLS_TOP
    return CLS_COMMON


def client_order(classes: list[int]) -> list[int]:
    idx = list(range(len(classes)))
    idx.sort(key=lambda k: (classes[k], -k if classes[k] == CLS_COMMON else k))
    return idx


def frame_key(aid: int, px: int, py: int, pz: int, phase: int = 0) -> str:
    if phase > 0:
        return f"{aid}_{px}_{py}_{pz}_{phase}"
    return f"{aid}_{px}_{py}_{pz}"


def phase_durs(si) -> list[int]:
    anim = si.animation
    if not anim or not anim.sprite_phase:
        return []
    out = []
    for ph in anim.sprite_phase:
        d = ph.duration_min or ph.duration_max or 0
        out.append(int(d) if d > 0 else 100)
    return out


def pack_from_client(
    client: Path,
    library: Path,
    stacks: dict,
    out: Path,
    unique_ids: list[int],
) -> None:
    raw = (client / "appearances.dat").read_bytes()
    apps = {a.id: a for a in parse_appearances(raw).object}
    sheets = load_sheets(client, library)
    ox, oy, oz = int(stacks["ox"]), int(stacks["oy"]), int(stacks["z"])
    w, h = int(stacks["w"]), int(stacks["h"])
    n = w * h
    needed: dict[tuple[int, int, int, int, int], Image.Image] = {}
    images_by_name: dict[str, Image.Image] = {}
    tile_gids: list[int] = [-1] * n
    per_tile: list[list[tuple[int, int, int, int, int, int, int]]] = [[] for _ in range(n)]
    durs_list: list[list[int]] = []
    durs_of: dict[tuple[int, int, int, int], int] = {}
    frame_order: list[str] = []
    frame_index: dict[str, int] = {}

    def ensure_sprite(aid: int, px: int, py: int, pz: int, phase: int) -> Image.Image | None:
        key = (aid, px, py, pz, phase)
        if key in needed:
            return needed[key]
        app = apps.get(aid)
        if not app or not app.frame_group:
            return None
        si = app.frame_group[0].sprite_info
        arr = pull_sprite(sheets, si, layer=0, x=px, y=py, z=pz, phase=phase)
        if arr is None:
            return None
        im = Image.fromarray(arr)
        needed[key] = im
        name = frame_key(aid, px, py, pz, phase)
        images_by_name[name] = im
        if name not in frame_index:
            frame_index[name] = len(frame_order)
            frame_order.append(name)
        return im

    def stack_rows(ids: list[int], ax: int, ay: int, az: int) -> tuple[list[tuple[int, int, int, int, int, int, int]], int]:
        classes = []
        metas = []
        for aid in ids:
            app = apps.get(aid)
            if app is None:
                continue
            si = app.frame_group[0].sprite_info if app.frame_group else None
            pw = (si.pattern_width or 1) if si else 1
            ph = (si.pattern_height or 1) if si else 1
            pd = (si.pattern_depth or 1) if si else 1
            px, py, pz = ax % pw, ay % ph, az % pd
            nph = max(1, si.phases if si else 1)
            cls = item_class(app)
            sh = app.flags.shift or {}
            ht = int(app.flags.height or 0)
            classes.append(cls)
            metas.append((aid, px, py, pz, nph, cls, int(sh.get("x", 0)), int(sh.get("y", 0)), ht, si))
        order = client_order(classes)
        elev = 0
        first_bank_32 = -1
        rows = []
        for k in order:
            aid, px, py, pz, nph, cls, sx, sy, ht, si = metas[k]
            im0 = ensure_sprite(aid, px, py, pz, 0)
            if im0 is None:
                continue
            for phase in range(1, nph):
                ensure_sprite(aid, px, py, pz, phase)
            name = frame_key(aid, px, py, pz, 0)
            fi = frame_index[name]
            if cls == CLS_BANK and im0.width == CELL and im0.height == CELL and first_bank_32 < 0:
                first_bank_32 = fi
            dkey = (aid, px, py, pz)
            ms = 0
            if nph > 1 and si is not None:
                if dkey not in durs_of:
                    durs = phase_durs(si)
                    if len(durs) < nph:
                        durs = durs + [100] * (nph - len(durs))
                    durs_of[dkey] = len(durs_list) + 1
                    durs_list.append(durs[:nph])
                ms = durs_of[dkey]
            rows.append((fi, cls, sx, sy, elev, nph, ms))
            if ht:
                elev = min(MAX_ELEV, elev + ht)
        return rows, first_bank_32

    for t in stacks.get("tiles", []):
        tx, ty = int(t["x"]), int(t["y"])
        if tx < 0 or ty < 0 or tx >= w or ty >= h:
            continue
        i = ty * w + tx
        rows, first_bank_32 = stack_rows([int(v) for v in t.get("ids", [])], ox + tx, oy + ty, oz)
        per_tile[i].extend(rows)
        tile_gids[i] = first_bank_32

    # Floor z draws over every lower floor: a lower-floor sprite all of whose pixels lie under floor z's
    # opaque pixels never shows, so it is left out.
    margin = 4 * CELL
    opaque = np.zeros((h * CELL + 2 * margin, w * CELL + 2 * margin), dtype=bool)

    def placed(fi: int, sx: int, sy: int, elev: int, tx: int, ty: int) -> tuple[np.ndarray, int, int]:
        a = np.asarray(images_by_name[frame_order[fi]])[..., 3]
        x = tx * CELL + CELL - a.shape[1] - sx - elev + margin
        y = ty * CELL + CELL - a.shape[0] - sy - elev + margin
        return a, x, y

    for i, rows in enumerate(per_tile):
        for fi, _cls, sx, sy, elev, nph, _ms in rows:
            if nph > 1:
                continue
            a, x, y = placed(fi, sx, sy, elev, i % w, i // w)
            opaque[y : y + a.shape[0], x : x + a.shape[1]] |= a == 255

    def hidden(row: tuple[int, int, int, int, int, int, int], tx: int, ty: int) -> bool:
        fi, _cls, sx, sy, elev, _nph, _ms = row
        a, x, y = placed(fi, sx, sy, elev, tx, ty)
        return bool(opaque[y : y + a.shape[0], x : x + a.shape[1]][a > 0].all())

    below = {"d": [], "t": [], "n": [], "f": [], "sx": [], "sy": [], "el": [], "ph": [], "ms": []}
    for b in stacks.get("below", []):
        bx, by = int(b["x"]), int(b["y"])
        if bx < 0 or by < 0 or bx >= w or by >= h:
            continue
        rows, _ = stack_rows([int(v) for v in b.get("ids", [])], int(b["ax"]), int(b["ay"]), int(b["az"]))
        rows = [row for row in rows if not hidden(row, bx, by)]
        if not rows:
            continue
        below["d"].append(int(b["az"]) - oz)
        below["t"].append(by * w + bx)
        below["n"].append(len(rows))
        for fi, _cls, sx, sy, elev, nph, ms in rows:
            below["f"].append(fi)
            below["sx"].append(sx)
            below["sy"].append(sy)
            below["el"].append(elev)
            below["ph"].append(nph)
            below["ms"].append(ms)

    flat_f: list[int] = []
    flat_c: list[int] = []
    flat_sx: list[int] = []
    flat_sy: list[int] = []
    flat_el: list[int] = []
    flat_ph: list[int] = []
    flat_ms: list[int] = []
    counts = [0] * n
    for i in range(n):
        rows = per_tile[i]
        counts[i] = len(rows)
        for fi, cls, sx, sy, elev, nph, ms in rows:
            flat_f.append(fi)
            flat_c.append(cls)
            flat_sx.append(sx)
            flat_sy.append(sy)
            flat_el.append(elev)
            flat_ph.append(nph)
            flat_ms.append(ms)

    # Only the sprites a drawn row uses (and their animation phases) go in the atlas.
    base_of = {frame_key(*k): k[:4] for k in needed}
    used = {base_of[frame_order[fi]] for fi in flat_f + below["f"]}
    for k in [k for k in needed if k[:4] not in used]:
        del needed[k]
    kept = [name for name in frame_order if base_of[name] in used]
    remap = {frame_index[name]: k for k, name in enumerate(kept)}
    frame_order = kept
    flat_f = [remap[fi] for fi in flat_f]
    below["f"] = [remap[fi] for fi in below["f"]]
    tile_gids = [remap[fi] if fi >= 0 else fi for fi in tile_gids]

    grid_names: list[tuple[str, Image.Image]] = []
    grid_index: dict[str, int] = {}
    for i, fi in enumerate(tile_gids):
        if fi < 0:
            continue
        name = frame_order[fi]
        if name in grid_index:
            tile_gids[i] = grid_index[name]
            continue
        im = images_by_name.get(name)
        if im is None or im.width != CELL or im.height != CELL:
            tile_gids[i] = -1
            continue
        grid_index[name] = len(grid_names)
        tile_gids[i] = grid_index[name]
        grid_names.append((name, im))

    native_named: list[tuple[str, Image.Image]] = []
    seen_native: set[str] = set()
    for (aid, px, py, pz, phase), im in needed.items():
        name = frame_key(aid, px, py, pz, phase)
        if name in seen_native:
            continue
        seen_native.add(name)
        native_named.append((name, im))
        if phase == 0:
            alias = str(aid)
            if alias not in seen_native:
                seen_native.add(alias)
                native_named.append((alias, im))

    if not grid_names:
        grid_names = [(str(unique_ids[0]), Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0)))] if unique_ids else [
            ("0", Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0)))
        ]
    if not native_named:
        native_named = list(grid_names)

    grid, grid_frames = pack_grid(grid_names)
    native, native_frames = shelf_pack(native_named, MAX_SIZE)
    out.parent.mkdir(parents=True, exist_ok=True)
    write_atlas(Path(f"{out}-atlas.png"), grid, grid_frames, "2.0")
    write_atlas(Path(f"{out}-overlay-atlas.png"), native, native_frames, "2.0")
    visual = {
        "v": 1,
        "w": w,
        "h": h,
        "frames": frame_order,
        "grid": [name for name, _ in grid_names],
        "tile": tile_gids,
        "n": counts,
        "f": flat_f,
        "c": flat_c,
        "sx": flat_sx,
        "sy": flat_sy,
        "el": flat_el,
        "ph": flat_ph,
        "ms": flat_ms,
        "durs": durs_list,
    }
    if below["t"]:
        visual["below"] = below
    Path(f"{out}-visual.json").write_text(json.dumps(visual, separators=(",", ":")) + "\n")
    print(f"region atlas {out}-atlas.png {grid.size} frames={len(grid_frames)}")
    print(f"overlay atlas {out}-overlay-atlas.png {native.size} frames={len(native_frames)}")
    print(f"visual {out}-visual.json items={len(flat_f)} frames={len(frame_order)}")


def pack_from_library(library: Path, ids: list[int], out: Path) -> None:
    named: list[tuple[str, Image.Image]] = []
    for appearance_id in ids:
        path = object_png(library, appearance_id)
        named.append((str(appearance_id), Image.open(path).convert("RGBA")))
    atlas, frames = pack_grid(named)
    native, native_frames = shelf_pack(named, MAX_SIZE)
    out.parent.mkdir(parents=True, exist_ok=True)
    write_atlas(Path(f"{out}-atlas.png"), atlas, frames, "1.0")
    write_atlas(Path(f"{out}-overlay-atlas.png"), native, native_frames, "1.1")
    print(f"region atlas {out}-atlas.png {atlas.size} frames={len(frames)}")
    print(f"overlay atlas {out}-overlay-atlas.png {native.size} frames={len(native_frames)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", type=Path, default=ROOT / "art-src" / "tibia" / "library")
    parser.add_argument("--client", type=Path, default=ROOT / "art-src" / "tibia" / "client")
    parser.add_argument("--ids", default="", help="comma-separated appearance ids")
    parser.add_argument("--stacks", type=Path, help="JSON stacks from convert (client pack)")
    parser.add_argument("--out", required=True, help="prefix, writes {out}-atlas.png/json")
    args = parser.parse_args()
    if not args.library.is_dir():
        raise SystemExit(f"missing library {args.library}")
    ids = [int(part) for part in args.ids.split(",") if part.strip()]
    out = Path(args.out)
    if args.stacks:
        stacks = json.loads(args.stacks.read_text())
        pack_from_client(args.client, args.library, stacks, out, ids)
        return 0
    if not ids:
        raise SystemExit("no appearance ids")
    pack_from_library(args.library, ids, out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
