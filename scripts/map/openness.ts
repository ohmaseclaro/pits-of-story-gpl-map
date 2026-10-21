export type OpennessResult = {
	ok: boolean;
	reasons: string[];
	walkCount: number;
	largestCount: number;
	largestShare: number;
	openedCount: number;
	openingRatio: number;
	medianClearance: number;
	obstacleRatio: number;
	pzFraction: number;
	liveEnemyCap: 400 | 200;
	largest: Uint8Array;
	start: { x: number; y: number };
};

const N4: ReadonlyArray<readonly [number, number]> = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];

const N8: ReadonlyArray<readonly [number, number]> = [
	...N4,
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

/**
 * `seed` grown through walkable tiles with diagonal steps allowed. A diagonal
 * step checks only the destination tile (Canary 04b83b5 src/game/game.cpp:1970),
 * so a pocket reached past two corner-touching walls is still walkable.
 */
export function diagonalReach(
	walk: Uint8Array,
	w: number,
	h: number,
	seed: Uint8Array,
): Uint8Array {
	const out = seed.slice();
	const stack: number[] = [];
	for (let i = 0; i < out.length; i++) {
		if (out[i]) stack.push(i);
	}
	while (stack.length) {
		const cur = stack.pop();
		if (cur === undefined) break;
		const x = cur % w;
		const y = (cur / w) | 0;
		for (const [dx, dy] of N8) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const j = ny * w + nx;
			if (!walk[j] || out[j]) continue;
			out[j] = 1;
			stack.push(j);
		}
	}
	return out;
}

function minWalkTiles(w: number, h: number): number {
	return w >= 40 && h >= 40 ? 400 : 1;
}

function largestCells(walk: Uint8Array, w: number, h: number): number[] {
	const seen = new Uint8Array(walk.length);
	let best: number[] = [];
	for (let i = 0; i < walk.length; i++) {
		if (!walk[i] || seen[i]) continue;
		const stack = [i];
		seen[i] = 1;
		const cells = [i];
		while (stack.length) {
			const cur = stack.pop();
			if (cur === undefined) break;
			const x = cur % w;
			const y = (cur / w) | 0;
			for (const [dx, dy] of N4) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				const j = ny * w + nx;
				if (!walk[j] || seen[j]) continue;
				seen[j] = 1;
				stack.push(j);
				cells.push(j);
			}
		}
		if (cells.length > best.length) best = cells;
	}
	return best;
}

function erode(walk: Uint8Array, w: number, h: number): Uint8Array {
	const out = new Uint8Array(walk.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let ok = true;
			for (let dy = -1; dy <= 1 && ok; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h || !walk[ny * w + nx]) {
						ok = false;
						break;
					}
				}
			}
			out[y * w + x] = ok ? 1 : 0;
		}
	}
	return out;
}

function dilate(src: Uint8Array, w: number, h: number): Uint8Array {
	const out = new Uint8Array(src.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let hit = false;
			for (let dy = -1; dy <= 1 && !hit; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					if (src[ny * w + nx]) {
						hit = true;
						break;
					}
				}
			}
			out[y * w + x] = hit ? 1 : 0;
		}
	}
	return out;
}

function medianOf(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = values.slice().sort((a, b) => a - b);
	return sorted[(sorted.length - 1) >> 1] ?? 0;
}

function clearance(
	walk: Uint8Array,
	w: number,
	h: number,
	x: number,
	y: number,
): number {
	let best = w + h;
	const border = Math.min(x + 1, y + 1, w - x, h - y);
	if (border < best) best = border;
	for (let yy = 0; yy < h; yy++) {
		for (let xx = 0; xx < w; xx++) {
			if (walk[yy * w + xx]) continue;
			const d = Math.max(Math.abs(xx - x), Math.abs(yy - y));
			if (d < best) best = d;
		}
	}
	return best;
}

export function evaluateOpenness(
	walk: Uint8Array,
	w: number,
	h: number,
	pz?: Uint8Array,
): OpennessResult {
	const reasons: string[] = [];
	let walkCount = 0;
	for (let i = 0; i < walk.length; i++) {
		if (walk[i]) walkCount++;
	}
	const cells = largestCells(walk, w, h);
	const largestCount = cells.length;
	const largestShare = walkCount === 0 ? 0 : largestCount / walkCount;
	const largest = new Uint8Array(walk.length);
	let sx = 0;
	let sy = 0;
	for (const i of cells) {
		largest[i] = 1;
		sx += i % w;
		sy += (i / w) | 0;
	}
	let start = { x: 0, y: 0 };
	if (largestCount > 0) {
		const cx = Math.floor(sx / largestCount);
		const cy = Math.floor(sy / largestCount);
		let best = cells[0] ?? 0;
		let bestD = w + h;
		for (let k = 0; k < cells.length; k++) {
			const i = cells[k] ?? 0;
			const x = i % w;
			const y = (i / w) | 0;
			const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
			if (d < bestD || (d === bestD && i < best)) {
				bestD = d;
				best = i;
			}
		}
		start = { x: best % w, y: (best / w) | 0 };
	}

	const opened = dilate(erode(walk, w, h), w, h);
	let openedCount = 0;
	for (let i = 0; i < walk.length; i++) {
		if (walk[i] && opened[i]) openedCount++;
	}
	const openingRatio = walkCount === 0 ? 0 : openedCount / walkCount;

	const clearVals: number[] = [];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!walk[y * w + x]) continue;
			clearVals.push(clearance(walk, w, h, x, y));
		}
	}
	const medianClearance = medianOf(clearVals);
	const obstacleRatio = (w * h - walkCount) / (w * h);
	let pzCount = 0;
	if (pz) {
		for (let i = 0; i < pz.length; i++) {
			if (pz[i]) pzCount++;
		}
	}
	const pzFraction = pzCount / (w * h);
	const liveEnemyCap: 400 | 200 = medianClearance >= 2 ? 400 : 200;

	if (largestShare < 0.7) reasons.push("largest-share");
	if (largestCount < minWalkTiles(w, h)) reasons.push("largest-tiles");
	if (openingRatio < 0.5) reasons.push("opening-ratio");
	if (obstacleRatio > 0.45) reasons.push("obstacle-ratio");
	if (pzFraction >= 0.15) reasons.push("pz-fraction");

	return {
		ok: reasons.length === 0,
		reasons,
		walkCount,
		largestCount,
		largestShare,
		openedCount,
		openingRatio,
		medianClearance,
		obstacleRatio,
		pzFraction,
		liveEnemyCap,
		largest,
		start,
	};
}
