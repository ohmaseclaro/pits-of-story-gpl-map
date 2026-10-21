import { lookupFlags } from "./convertIo.ts";
import type { IndexMap } from "./flags.ts";
import type { OtbmBox, OtbmItem } from "./otbm.ts";

/** A lower-floor tile seen through the hole at local (x, y); (ax, ay, az) is where it lies. */
export type BelowStack = {
	x: number;
	y: number;
	ax: number;
	ay: number;
	az: number;
	ids: number[];
};

export type ReadFloor = (
	box: OtbmBox,
	onTile: (tx: number, ty: number, items: OtbmItem[]) => void,
) => void;

/** OTClient: underground shows 2 floors down; the surface shows floors down to 7, never below it. */
export function belowDepth(z: number): number {
	if (z >= 8) return Math.min(2, 15 - z);
	return Math.max(0, Math.min(2, 7 - z));
}

/**
 * The lower-floor tiles under each in-mask tile with no covering ground on floor z, deepest floor first,
 * row-major. Floor z+d draws shifted d tiles right and down, so the hole at (x, y) shows
 * (x - d, y - d, z + d), and floor z+d shows only where floor z+d-1 has no ground there either.
 * A 64 px sprite reaches one tile up and left of its own, so the tiles right of and below a hole
 * come too; floor z's ground covers whatever of them lies outside the hole.
 */
export function collectBelow(
	box: OtbmBox,
	mask: ArrayLike<number>,
	hasGround: ArrayLike<number>,
	index: IndexMap,
	readFloor: ReadFloor,
	covers: (id: number) => boolean = () => true,
): BelowStack[] {
	const n = box.w * box.h;
	const open = new Uint8Array(n);
	let holes = 0;
	for (let i = 0; i < n; i++) {
		if (mask[i] === 1 && !hasGround[i]) {
			open[i] = 1;
			holes += 1;
		}
	}
	const floors: BelowStack[][] = [];
	const depth = belowDepth(box.z);
	for (let d = 1; d <= depth && holes > 0; d++) {
		const found: BelowStack[] = [];
		const covered: number[] = [];
		const shifted = {
			x: box.x - d,
			y: box.y - d,
			z: box.z + d,
			w: box.w,
			h: box.h,
		};
		readFloor(shifted, (tx, ty, items) => {
			const x = tx - shifted.x;
			const y = ty - shifted.y;
			const i = y * box.w + x;
			const hole = open[i] === 1;
			if (!hole && !spillsIntoHole(open, box.w, x, y)) return;
			const ids: number[] = [];
			let ground = false;
			for (const item of items) {
				const f = lookupFlags(index, item.id);
				if (!f) continue;
				ids.push(item.id);
				if ((f.bank || f.fullbank) && covers(item.id)) ground = true;
			}
			if (ids.length) found.push({ x, y, ax: tx, ay: ty, az: shifted.z, ids });
			if (ground && hole) covered.push(i);
		});
		for (const i of covered) open[i] = 0;
		holes -= covered.length;
		found.sort((a, b) => a.y * box.w + a.x - (b.y * box.w + b.x));
		floors.push(found);
	}
	return floors.reverse().flat();
}

function spillsIntoHole(
	open: Uint8Array,
	w: number,
	x: number,
	y: number,
): boolean {
	return (
		(x > 0 && open[y * w + x - 1] === 1) ||
		(y > 0 && open[(y - 1) * w + x] === 1) ||
		(x > 0 && y > 0 && open[(y - 1) * w + x - 1] === 1)
	);
}
