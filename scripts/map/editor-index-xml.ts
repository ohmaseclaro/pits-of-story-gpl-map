import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT } from "../content/config.ts";
import { parseSpawns } from "../content/parse-spawns.ts";
import { sectorOrigin } from "./editor-index-sectors.ts";

export type SearchHit = {
	kind: "monster" | "npc" | "town" | "waypoint" | "house";
	name: string;
	x: number;
	y: number;
	z: number;
	radius?: number;
	extra?: string;
	rows?: { name: string; x: number; y: number }[];
};

const ATTR = /([A-Za-z_:][A-Za-z0-9_:]*)\s*=\s*"([^"]*)"/g;

function attrsOf(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const match of tag.matchAll(ATTR)) {
		const key = match[1];
		if (key) out[key] = match[2] ?? "";
	}
	return out;
}

function radiusOf(attrs: Record<string, string>): number {
	if (attrs.radius == null || attrs.radius === "") return -1;
	const n = Number(attrs.radius);
	return Number.isFinite(n) ? n : -1;
}

export function loadMonsterCatalog(root: string): Set<string> {
	const names = new Set<string>(CONTENT.monsters);
	const catalog = join(root, "public/content/monsters.json");
	if (!existsSync(catalog)) return names;
	const rows = JSON.parse(readFileSync(catalog, "utf8")) as { name?: string }[];
	if (!Array.isArray(rows)) return names;
	for (const row of rows) {
		if (row?.name) names.add(row.name);
	}
	return names;
}

export function parseNpcXml(filePath: string): SearchHit[] {
	const source = readFileSync(filePath).toString("latin1");
	const hits: SearchHit[] = [];
	for (const block of source.matchAll(/<npc\b([^>]*)>([\s\S]*?)<\/npc>/gi)) {
		const head = attrsOf(block[1] ?? "");
		const cx = Number(head.centerx);
		const cy = Number(head.centery);
		const cz = Number(head.centerz);
		if (![cx, cy, cz].every(Number.isFinite)) continue;
		for (const inner of (block[2] ?? "").matchAll(/<npc\b([^>]*)\/?>/gi)) {
			const a = attrsOf(inner[1] ?? "");
			if (!a.name) continue;
			hits.push({
				kind: "npc",
				name: a.name,
				x: cx + (Number(a.x) || 0),
				y: cy + (Number(a.y) || 0),
				z: cz,
				radius: radiusOf(head),
			});
		}
	}
	if (hits.length > 0) return hits;
	for (const match of source.matchAll(/<npc\b([^>]*)/gi)) {
		const attrs = attrsOf(match[1] ?? "");
		const name = attrs.name;
		const x = Number(attrs.centerx);
		const y = Number(attrs.centery);
		const z = Number(attrs.centerz);
		if (!name || ![x, y, z].every((n) => Number.isFinite(n))) continue;
		hits.push({ kind: "npc", name, x, y, z, radius: radiusOf(attrs) });
	}
	return hits;
}

export function parseHouseXml(filePath: string): SearchHit[] {
	const source = readFileSync(filePath).toString("latin1");
	const hits: SearchHit[] = [];
	for (const match of source.matchAll(/<house\b([^>]*)/gi)) {
		const attrs = attrsOf(match[1] ?? "");
		const name = attrs.name;
		const x = Number(attrs.entryx);
		const y = Number(attrs.entryy);
		const z = Number(attrs.entryz);
		if (!name || ![x, y, z].every((n) => Number.isFinite(n))) continue;
		const hit: SearchHit = { kind: "house", name, x, y, z };
		if (attrs.houseid) hit.extra = attrs.houseid;
		hits.push(hit);
	}
	return hits;
}

function monsterHits(
	filePath: string,
	catalog: ReadonlySet<string>,
): SearchHit[] {
	const hits: SearchHit[] = [];
	for (const zone of parseSpawns(filePath)) {
		const rows = zone.entries.map((entry) => ({
			name: entry.name,
			x: entry.x,
			y: entry.y,
		}));
		for (const name of [...new Set(zone.entries.map((entry) => entry.name))]) {
			const hit: SearchHit = {
				kind: "monster",
				name,
				x: zone.cx,
				y: zone.cy,
				z: zone.cz,
				radius: zone.r,
				rows,
			};
			if (!catalog.has(name)) hit.extra = "unmapped";
			hits.push(hit);
		}
	}
	return hits;
}

export function collectXmlHits(
	xmlDir: string,
	catalog: ReadonlySet<string>,
): SearchHit[] {
	if (!existsSync(xmlDir)) return [];
	const hits: SearchHit[] = [];
	for (const file of readdirSync(xmlDir)) {
		if (!file.endsWith(".xml")) continue;
		const path = join(xmlDir, file);
		hits.push(...monsterHits(path, catalog));
		hits.push(...parseNpcXml(path));
		hits.push(...parseHouseXml(path));
	}
	return hits;
}

export function sortHits(hits: SearchHit[]): SearchHit[] {
	return hits.sort((a, b) => {
		const x = a.name.normalize("NFC");
		const y = b.name.normalize("NFC");
		return x < y ? -1 : x > y ? 1 : a.x - b.x || a.y - b.y || a.z - b.z;
	});
}

export function spawnDensityOf(
	hits: readonly SearchHit[],
): Record<string, Record<string, number>> {
	const density: Record<string, Record<string, number>> = {};
	for (const hit of hits) {
		if (hit.kind !== "monster" && hit.kind !== "npc") continue;
		const { bx, by } = sectorOrigin(hit.x, hit.y);
		const zKey = String(hit.z);
		const sKey = `${bx},${by}`;
		let row = density[zKey];
		if (!row) {
			row = {};
			density[zKey] = row;
		}
		row[sKey] = (row[sKey] ?? 0) + 1;
	}
	return density;
}
