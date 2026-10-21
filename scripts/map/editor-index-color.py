#!/usr/bin/env python3
"""Colour tiles + overview PNGs from editor-index sector bins (Pillow / PIL)."""

from __future__ import annotations

import argparse
import functools
import json
from pathlib import Path

from PIL import Image

SECTOR = 256
CELL = 5
EMPTY = 0xFFFF
PAGE = 2048


def checker(x: int, y: int) -> tuple[int, int, int]:
	return (80, 80, 80) if (x + y) & 1 else (40, 40, 40)


def load_lut(path: str | None) -> dict[int, tuple[int, int, int]]:
	if not path:
		return {}
	raw = json.loads(Path(path).read_text(encoding="utf-8"))
	out: dict[int, tuple[int, int, int]] = {}
	for key, value in raw.items():
		if not isinstance(value, (list, tuple)) or len(value) < 3:
			continue
		out[int(key)] = (int(value[0]), int(value[1]), int(value[2]))
	return out


@functools.lru_cache(maxsize=None)
def avg_icon(repo: Path, appearance_id: int) -> tuple[int, int, int] | None:
	icon = repo / "art-src/tibia/library/objects" / str(appearance_id) / "0_0.png"
	if not icon.is_file():
		return None
	try:
		im = Image.open(icon).convert("RGBA")
	except OSError:
		return None
	r = g = b = n = 0
	for pr, pg, pb, pa in im.getdata():
		if pa < 16:
			continue
		r += pr
		g += pg
		b += pb
		n += 1
	if n == 0:
		return None
	return (r // n, g // n, b // n)


_color_ids: dict[int, tuple[int, int, int] | None] = {}


def color_for(
	lut: dict[int, tuple[int, int, int]],
	repo: Path,
	appearance_id: int,
	x: int,
	y: int,
) -> tuple[int, int, int]:
	if appearance_id == EMPTY:
		return (0, 0, 0)
	if appearance_id in lut:
		return lut[appearance_id]
	if appearance_id not in _color_ids:
		_color_ids[appearance_id] = avg_icon(repo, appearance_id)
	avg = _color_ids[appearance_id]
	return avg if avg else checker(x, y)


def read_grounds(path: Path) -> list[tuple[int, int, int]]:
	data = path.read_bytes()
	tiles: list[tuple[int, int, int]] = []
	limit = min(len(data) // CELL, SECTOR * SECTOR)
	for i in range(limit):
		off = i * CELL
		ground = int.from_bytes(data[off : off + 2], "little")
		tiles.append((i % SECTOR, i // SECTOR, ground))
	return tiles


def overview_for_z(
	cache: Path,
	z: int,
	parts: list[tuple[int, int, Image.Image]],
) -> list[dict[str, int]]:
	if not parts:
		return []
	xs = [bx for bx, _by, _src in parts]
	ys = [by for _bx, by, _src in parts]
	x0, y0 = min(xs), min(ys)
	x1 = max(xs) + SECTOR - 1
	y1 = max(ys) + SECTOR - 1
	pages: list[dict[str, int]] = []
	out_dir = cache / "overview" / f"z{z}"
	out_dir.mkdir(parents=True, exist_ok=True)
	for py in range(y0, y1 + 1, PAGE):
		for px in range(x0, x1 + 1, PAGE):
			pw = min(PAGE, x1 - px + 1)
			ph = min(PAGE, y1 - py + 1)
			im = Image.new("RGB", (pw, ph), (0, 0, 0))
			for bx, by, src in parts:
				im.paste(src, (bx - px, by - py))
			im.save(out_dir / f"{px}_{py}.png", "PNG")
			pages.append({"x": px, "y": py, "w": pw, "h": ph})
	return pages


def main() -> None:
	parser = argparse.ArgumentParser()
	parser.add_argument("--cache", required=True)
	parser.add_argument("--lut")
	args = parser.parse_args()
	cache = Path(args.cache)
	lut = load_lut(args.lut)
	repo = Path(__file__).resolve().parents[2]
	sector_root = cache / "sector"
	if not sector_root.is_dir():
		return
	by_z: dict[int, list[tuple[int, int, Image.Image]]] = {}
	for zdir in sector_root.iterdir():
		if not zdir.is_dir() or not zdir.name.isdigit():
			continue
		z = int(zdir.name)
		for bin_path in zdir.glob("*.bin"):
			stem = bin_path.stem.split("_")
			if len(stem) != 2:
				continue
			bx, by = int(stem[0]), int(stem[1])
			raw = bytearray(SECTOR * SECTOR * 3)
			for lx, ly, ground in read_grounds(bin_path):
				r, g, b = color_for(lut, repo, ground, bx + lx, by + ly)
				off = (ly * SECTOR + lx) * 3
				raw[off] = r
				raw[off + 1] = g
				raw[off + 2] = b
			im = Image.frombytes("RGB", (SECTOR, SECTOR), bytes(raw))
			out = cache / "color" / str(z) / f"{bx}_{by}.png"
			out.parent.mkdir(parents=True, exist_ok=True)
			im.save(out, "PNG")
			by_z.setdefault(z, []).append((bx, by, im))
	index: dict[str, list[dict[str, int]]] = {}
	for z, parts in by_z.items():
		pages = overview_for_z(cache, z, parts)
		if pages:
			index[str(z)] = pages
	overview_root = cache / "overview"
	overview_root.mkdir(parents=True, exist_ok=True)
	(overview_root / "index.json").write_text(
		json.dumps(index, separators=(",", ":")),
		encoding="utf-8",
	)


if __name__ == "__main__":
	main()
