import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

const FLOOR_TRAVEL_NAME =
	/\b(ladder|stairs|hole|trapdoor|rope spot|pitfall)\b/i;

const HOLE_GROUND_NAME = /\b(hole|trapdoor|rope spot|pitfall)\b/i;

const DIRS: readonly [number, number][] = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];

export function loadItemNames(xmlText: string): Map<number, string> {
	const names = new Map<number, string>();
	const itemRe = /<item\b([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/gi;
	let match = itemRe.exec(xmlText);
	while (match !== null) {
		const attrs = match[1] ?? "";
		match = itemRe.exec(xmlText);
		const nameMatch = /\bname\s*=\s*"([^"]*)"/.exec(attrs);
		if (!nameMatch) continue;
		const name = nameMatch[1] ?? "";
		const idMatch = /\bid\s*=\s*"(\d+)"/.exec(attrs);
		if (idMatch) {
			names.set(Number(idMatch[1]), name);
			continue;
		}
		const fromMatch = /\bfromid\s*=\s*"(\d+)"/.exec(attrs);
		const toMatch = /\btoid\s*=\s*"(\d+)"/.exec(attrs);
		if (!fromMatch || !toMatch) continue;
		const from = Number(fromMatch[1]);
		const to = Number(toMatch[1]);
		if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) continue;
		for (let id = from; id <= to; id++) names.set(id, name);
	}
	return names;
}

export function hideFloorTravelVisual(
	id: number,
	floorchangeSet: ReadonlySet<number>,
	name = "",
): boolean {
	return floorchangeSet.has(id) || FLOOR_TRAVEL_NAME.test(name);
}

/** Holes and trapdoors lead to another floor; the arena is one floor. Id 101 is cave earth, keep it. */
export function isPlaceholderGround(_id: number, name = ""): boolean {
	return HOLE_GROUND_NAME.test(name);
}

export function fillPlaceholderGround(
	groundId: Uint32Array,
	w: number,
	h: number,
	replace: (id: number) => boolean,
): void {
	const n = groundId.length;
	let changed = true;
	let guard = 0;
	const limit = w + h;
	while (changed && guard < limit) {
		changed = false;
		guard += 1;
		for (let i = 0; i < n; i++) {
			const id = groundId[i] ?? 0;
			if (!id || !replace(id)) continue;
			const x = i % w;
			const y = (i / w) | 0;
			let pick = 0;
			for (let k = 0; k < DIRS.length; k++) {
				const nx = x + (DIRS[k]?.[0] ?? 0);
				const ny = y + (DIRS[k]?.[1] ?? 0);
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				const nid = groundId[ny * w + nx] ?? 0;
				if (nid && !replace(nid)) {
					pick = nid;
					break;
				}
			}
			if (pick) {
				groundId[i] = pick;
				changed = true;
			}
		}
	}
	let modal = 0;
	let modalN = 0;
	const counts = new Map<number, number>();
	for (let i = 0; i < n; i++) {
		const id = groundId[i] ?? 0;
		if (!id || replace(id)) continue;
		const next = (counts.get(id) ?? 0) + 1;
		counts.set(id, next);
		if (next > modalN) {
			modalN = next;
			modal = id;
		}
	}
	if (!modal) return;
	for (let i = 0; i < n; i++) {
		const id = groundId[i] ?? 0;
		if (id && replace(id)) groundId[i] = modal;
	}
}

/** Tiles the camera shows on the largest supported screen (iPhone Pro Max portrait, 440×956 CSS px at 32 px per tile). */
export const VIEW_TILES = { w: 14, h: 30 } as const;

/**
 * The box the map's visuals cover: the region box, grown right and down so a camera clamped to the
 * region's top-left never shows past the drawn tiles, plus one tile for the 64 px sprites anchored
 * past the edge that reach back into it.
 */
export function visualBox<B extends { w: number; h: number }>(box: B): B {
	return {
		...box,
		w: Math.max(box.w + 1, VIEW_TILES.w),
		h: Math.max(box.h + 1, VIEW_TILES.h),
	};
}

/** A ground sprite of one 32×32 tile hides the floors under it; a larger one (a mountain) leaves them showing past its edges. */
export function coversTile(library: string): (id: number) => boolean {
	const memo = new Map<number, boolean>();
	const head = Buffer.alloc(24);
	return (id) => {
		let hit = memo.get(id);
		if (hit === undefined) {
			hit = false;
			try {
				const fd = openSync(
					join(library, "objects", String(id), "0_0.png"),
					"r",
				);
				readSync(fd, head, 0, 24, 0);
				closeSync(fd);
				hit = head.readUInt32BE(16) === 32 && head.readUInt32BE(20) === 32;
			} catch {
				hit = true;
			}
			memo.set(id, hit);
		}
		return hit;
	};
}
