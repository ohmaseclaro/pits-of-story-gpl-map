import { readFileSync } from "node:fs";

export type SpawnEntry = {
	name: string;
	every: number;
	x: number;
	y: number;
};

export type SpawnZone = {
	cx: number;
	cy: number;
	cz: number;
	r: number;
	entries: SpawnEntry[];
};

const CENTRE_BLOCK =
	/<monster\b([^>]*\bcenterx\b[^>]*)>([\s\S]*?)<\/monster>/gi;
const ATTR = /([A-Za-z_:][A-Za-z0-9_:]*)\s*=\s*"([^"]*)"/g;
const CHILD = /<monster\b([^>]*)\/\s*>|<monster\b([^>]*)><\/monster>/gi;

function attrsOf(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const match of tag.matchAll(ATTR)) {
		const key = match[1];
		const value = match[2];
		if (key) out[key] = value ?? "";
	}
	return out;
}

export function parseSpawns(filePath: string): SpawnZone[] {
	const source = readFileSync(filePath).toString("latin1");
	const zones: SpawnZone[] = [];
	for (const match of source.matchAll(CENTRE_BLOCK)) {
		const open = attrsOf(match[1] ?? "");
		const cx = Number(open.centerx);
		const cy = Number(open.centery);
		const cz = Number(open.centerz);
		const r =
			open.radius == null || open.radius === "" ? -1 : Number(open.radius);
		if (![cx, cy, cz, r].every((n) => Number.isFinite(n))) continue;
		const entries: SpawnEntry[] = [];
		const body = match[2] ?? "";
		for (const child of body.matchAll(CHILD)) {
			const childAttrs = attrsOf(child[1] ?? child[2] ?? "");
			const name = childAttrs.name;
			if (!name) continue;
			const every =
				childAttrs.spawntime == null || childAttrs.spawntime === ""
					? 60
					: Number(childAttrs.spawntime);
			if (!Number.isFinite(every)) continue;
			const x =
				childAttrs.x == null || childAttrs.x === "" ? 0 : Number(childAttrs.x);
			const y =
				childAttrs.y == null || childAttrs.y === "" ? 0 : Number(childAttrs.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			entries.push({ name, every, x, y });
		}
		zones.push({ cx, cy, cz, r, entries });
	}
	return zones;
}
