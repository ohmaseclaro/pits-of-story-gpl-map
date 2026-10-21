export type ZoneEntry = {
	kind: string;
	every: number;
};

export type Zone = {
	cx: number;
	cy: number;
	r: number;
	tiles: number[];
	entries: ZoneEntry[];
};

export type SpawnRow = {
	name: string;
	x: number;
	y: number;
	every: number;
};

export type SpawnCentre = {
	cx: number;
	cy: number;
	cz: number;
	r: number;
	rows: SpawnRow[];
};

export type CropBox = {
	x: number;
	y: number;
	z: number;
	w: number;
	h: number;
};

const DEFAULT_EVERY = 60;

function attrs(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	const re = /(\w+)\s*=\s*"([^"]*)"/g;
	let match = re.exec(tag);
	while (match) {
		out[match[1] ?? ""] = match[2] ?? "";
		match = re.exec(tag);
	}
	return out;
}

export function parseMonsterXml(text: string): SpawnCentre[] {
	const centres: SpawnCentre[] = [];
	const blockRe = /<monster\b([^>]*?)(\/>|>([\s\S]*?)<\/monster>)/gi;
	let block = blockRe.exec(text);
	while (block) {
		const head = attrs(block[1] ?? "");
		if (head.centerx === undefined) {
			block = blockRe.exec(text);
			continue;
		}
		const cx = Number(head.centerx);
		const cy = Number(head.centery);
		const cz = Number(head.centerz);
		const r = head.radius === undefined ? 0 : Math.max(0, Number(head.radius));
		const rows: SpawnRow[] = [];
		const inner = block[3] ?? "";
		const rowRe = /<monster\b([^>]*)\/?>/gi;
		let row = rowRe.exec(inner);
		while (row) {
			const a = attrs(row[1] ?? "");
			if (a.z !== undefined && Number(a.z) !== cz && Number(a.z) !== 0) {
				row = rowRe.exec(inner);
				continue;
			}
			if (a.name) {
				rows.push({
					name: a.name,
					x: Number(a.x) || 0,
					y: Number(a.y) || 0,
					every: Number(a.spawntime) || DEFAULT_EVERY,
				});
			}
			row = rowRe.exec(inner);
		}
		centres.push({ cx, cy, cz, r, rows });
		block = blockRe.exec(text);
	}
	return centres;
}

function squaresOverlap(
	ax: number,
	ay: number,
	ar: number,
	box: CropBox,
): boolean {
	const a0x = ax - ar;
	const a1x = ax + ar;
	const a0y = ay - ar;
	const a1y = ay + ar;
	return (
		a1x >= box.x && a0x < box.x + box.w && a1y >= box.y && a0y < box.y + box.h
	);
}

export function intersectingCentres(
	centres: SpawnCentre[],
	box: CropBox,
): SpawnCentre[] {
	return centres.filter(
		(c) => c.cz === box.z && squaresOverlap(c.cx, c.cy, c.r, box),
	);
}

function inCrop(tx: number, ty: number, box: CropBox): boolean {
	return tx >= box.x && tx < box.x + box.w && ty >= box.y && ty < box.y + box.h;
}

function localIndex(tx: number, ty: number, box: CropBox): number {
	return (ty - box.y) * box.w + (tx - box.x);
}

export function snapToReachable(
	tx: number,
	ty: number,
	r: number,
	box: CropBox,
	largest: Uint8Array,
): { x: number; y: number } | null {
	if (inCrop(tx, ty, box) && largest[localIndex(tx, ty, box)]) {
		return { x: tx, y: ty };
	}
	let best: { x: number; y: number; d: number } | null = null;
	for (let dy = -r; dy <= r; dy++) {
		for (let dx = -r; dx <= r; dx++) {
			const x = tx + dx;
			const y = ty + dy;
			if (!inCrop(x, y, box)) continue;
			if (!largest[localIndex(x, y, box)]) continue;
			const d = Math.max(Math.abs(dx), Math.abs(dy));
			if (
				!best ||
				d < best.d ||
				(d === best.d && (y < best.y || (y === best.y && x < best.x)))
			) {
				best = { x, y, d };
			}
		}
	}
	return best ? { x: best.x, y: best.y } : null;
}

export function radiusTiles(
	cx: number,
	cy: number,
	r: number,
	box: CropBox,
	largest: Uint8Array,
): number[] {
	const tiles: number[] = [];
	for (let y = cy - r; y <= cy + r; y++) {
		for (let x = cx - r; x <= cx + r; x++) {
			if (!inCrop(x, y, box)) continue;
			const i = localIndex(x, y, box);
			if (largest[i]) tiles.push(i);
		}
	}
	return tiles.sort((a, b) => a - b);
}

export function mapEntries(
	rows: SpawnRow[],
	known: ReadonlySet<string>,
	dropped: string[],
): ZoneEntry[] {
	const entries: ZoneEntry[] = [];
	for (const row of rows) {
		if (!known.has(row.name)) {
			dropped.push(row.name);
			continue;
		}
		entries.push({ kind: row.name, every: row.every });
	}
	return entries;
}

export function buildZones(
	centres: SpawnCentre[],
	box: CropBox,
	largest: Uint8Array,
	known: ReadonlySet<string>,
	dropped: string[],
): Zone[] {
	const zones: Zone[] = [];
	for (const centre of intersectingCentres(centres, box)) {
		const kept: SpawnRow[] = [];
		for (const row of centre.rows) {
			const absX = centre.cx + row.x;
			const absY = centre.cy + row.y;
			if (snapToReachable(absX, absY, centre.r, box, largest)) {
				kept.push(row);
			}
		}
		const entries = mapEntries(kept, known, dropped);
		const tiles = radiusTiles(centre.cx, centre.cy, centre.r, box, largest);
		if (tiles.length === 0) continue;
		if (entries.length === 0) continue;
		zones.push({
			cx: centre.cx - box.x,
			cy: centre.cy - box.y,
			r: centre.r,
			tiles,
			entries,
		});
	}
	return zones;
}

export function kindsHistogram(
	zones: Zone[],
): { enemyId: string; weight: number }[] {
	const counts = new Map<string, number>();
	for (const zone of zones) {
		for (const entry of zone.entries) {
			counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([enemyId, weight]) => ({ enemyId, weight }));
}
