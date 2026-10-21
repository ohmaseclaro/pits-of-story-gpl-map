import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANARY_COMMIT } from "../content/config.ts";
import { fnv1a32 } from "../content/lib/fnv1a.ts";
import { encodeSortedJson } from "../content/lib/json.ts";
import {
	type AppearanceFlags,
	DEFAULT_GROUND_SPEED,
	type IndexMap,
} from "./flags.ts";
import type { OtbmBox } from "./otbm.ts";
import { loadPbm } from "./pbm.ts";
import { REGIONS, type RegionDef } from "./regions.ts";
import { shapeBounds } from "./shapes.ts";

export const EMPTY_LOCAL = 0xffff;

export type ConvertedRegion = {
	id: string;
	jsonRel: string;
	binRel: string;
	jsonHash: string;
	binHash: string;
	histogram: string;
	modalWalk: number;
	uniformNote: string;
	opennessNote: string;
	uncatalogued: string[];
	zoneCount: number;
	zonesWaiver?: string;
};

export function regionBox(region: RegionDef): OtbmBox {
	const b = shapeBounds(region.shape, loadPbm);
	return { x: b.x, y: b.y, z: region.z, w: b.w, h: b.h };
}

export function lookupFlags(
	index: IndexMap,
	id: number,
): AppearanceFlags | undefined {
	if (index instanceof Map) {
		return index.get(id);
	}
	const rec = (
		index as Record<string, AppearanceFlags | { flags?: AppearanceFlags }>
	)[String(id)];
	if (!rec) return undefined;
	if ("flags" in rec && rec.flags) return rec.flags;
	return rec as AppearanceFlags;
}

export function writeBin(
	ground: Uint16Array,
	overlay: Uint16Array,
	walk: Uint8Array,
	speed: Uint16Array,
	unsight: Uint8Array,
): Buffer {
	const n = walk.length;
	const buf = Buffer.alloc(2 * n + 2 * n + n + 2 * n + n);
	let o = 0;
	for (let i = 0; i < n; i++) {
		buf.writeUInt16LE(ground[i] ?? EMPTY_LOCAL, o);
		o += 2;
	}
	for (let i = 0; i < n; i++) {
		buf.writeUInt16LE(overlay[i] ?? EMPTY_LOCAL, o);
		o += 2;
	}
	for (let i = 0; i < n; i++) {
		buf.writeUInt8(walk[i] ?? 0, o);
		o += 1;
	}
	for (let i = 0; i < n; i++) {
		buf.writeUInt16LE(speed[i] ?? DEFAULT_GROUND_SPEED, o);
		o += 2;
	}
	for (let i = 0; i < n; i++) {
		buf.writeUInt8(unsight[i] ?? 1, o);
		o += 1;
	}
	return buf;
}

export function knownMonsterNames(root: string): Set<string> {
	const path = join(root, "public/content/monsters.json");
	if (!existsSync(path)) return new Set();
	const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
	const list = Array.isArray(raw)
		? raw
		: raw &&
				typeof raw === "object" &&
				Array.isArray((raw as { monsters?: unknown }).monsters)
			? (raw as { monsters: unknown[] }).monsters
			: [];
	const names = new Set<string>();
	for (const row of list) {
		if (
			row &&
			typeof row === "object" &&
			typeof (row as { name?: unknown }).name === "string"
		) {
			names.add((row as { name: string }).name);
		}
	}
	return names;
}

export function packAtlas(
	root: string,
	destPrefix: string,
	ids: number[],
): void {
	const library = join(root, "art-src/tibia/library");
	if (!existsSync(library)) {
		throw new Error(`missing library ${library}`);
	}
	const script = join(root, "scripts/map/pack-region-atlas.py");
	const python = process.env.PYTHON ?? "python3";
	const result = spawnSync(
		python,
		[script, "--library", library, "--ids", ids.join(","), "--out", destPrefix],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || "pack-region-atlas failed",
		);
	}
}

export function speedHistogram(speed: Uint16Array): string {
	const counts = new Map<number, number>();
	for (const value of speed) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([value, n]) => `${value}=${n}`)
		.join(" ");
}

export type PoolCandidate = {
	id: string;
	tower: string;
	pool?: boolean;
	adventure?: string;
	authoringTest?: boolean;
};

/** Files PreloadScene loads per region; the preview and the grid atlas JSON are authoring-only. */
const RUNTIME_SUFFIXES = [
	".json",
	".bin",
	"-atlas.png",
	"-overlay-atlas.png",
	"-overlay-atlas.json",
];

export type FloorDownload = { path: string; bytes: number; hash: string };

export function selectAdventureIds(
	regions: readonly PoolCandidate[],
): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const region of regions) {
		if (!region.adventure || region.authoringTest) continue;
		out[region.adventure] ??= [];
		out[region.adventure]?.push(region.id);
	}
	return out;
}

/** The first adventure map ships in the precache; every other one downloads (V3-DECISIONS "Maps and download"). */
export function floorDownloads(
	root: string,
	regions: readonly PoolCandidate[],
): Record<string, FloorDownload[]> {
	const adventures = selectAdventureIds(regions);
	const first = Object.values(adventures)[0]?.[0];
	const out: Record<string, FloorDownload[]> = {};
	for (const [adventure, ids] of Object.entries(adventures)) {
		const files: FloorDownload[] = [];
		for (const id of ids) {
			const tower = regions.find((row) => row.id === id)?.tower;
			for (const suffix of RUNTIME_SUFFIXES) {
				const path = `floors/${tower}/${id}${suffix}`;
				const abs = join(root, "public", path);
				if (!existsSync(abs)) {
					throw new Error(`adventure map ${id} missing public/${path}`);
				}
				if (id === first) continue;
				const bytes = readFileSync(abs);
				files.push({ path, bytes: bytes.length, hash: fnv1a32(bytes) });
			}
		}
		out[adventure] = files;
	}
	return out;
}

/** One line when it fits Biome's 80 columns (a tab counts 2), else one item per line. */
function tsList(
	indent: string,
	head: string,
	items: readonly string[],
	tail: string,
): string {
	const quoted = items.map((item) => JSON.stringify(item));
	const one = `${indent}${head}[${quoted.join(", ")}]${tail}`;
	if (one.replaceAll("\t", "  ").length <= 80) return one;
	return [
		`${indent}${head}[`,
		...quoted.map((item) => `${indent}\t${item},`),
		`${indent}]${tail}`,
	].join("\n");
}

function writeIfChanged(path: string, text: string): void {
	if (existsSync(path) && readFileSync(path, "utf8") === text) return;
	writeFileSync(path, text);
}

export function selectPoolIds(regions: readonly PoolCandidate[]): string[] {
	const ids: string[] = [];
	for (const region of regions) {
		if (region.tower !== "earth") continue;
		if (region.pool !== true) continue;
		if (region.authoringTest) continue;
		ids.push(region.id);
	}
	return ids;
}

function uniqueIds(ids: Iterable<string>): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}

function renderSection(row: ConvertedRegion): string {
	const lines = [
		`## ${row.id}`,
		"",
		`speed: ${row.histogram}`,
		`modal-walk: ${row.modalWalk}`,
	];
	if (row.uniformNote) lines.push(row.uniformNote);
	lines.push(
		`zones: ${row.zoneCount}${row.zonesWaiver ? ` waiver=${row.zonesWaiver}` : ""}`,
	);
	if (row.opennessNote) lines.push(row.opennessNote);
	if (row.uncatalogued.length) {
		lines.push(`uncatalogued: ${row.uncatalogued.join(", ")}`);
	}
	lines.push(`${row.jsonRel}  ${row.jsonHash}`);
	lines.push(`${row.binRel}  ${row.binHash}`);
	return lines.join("\n");
}

function parseReportSections(existing: string): Map<string, string> {
	const sections = new Map<string, string>();
	const text = existing.replace(/\r\n/g, "\n");
	const chunks = text.split(/(?=^## )/m);
	for (const chunk of chunks) {
		const match = /^## (\S+)\s*$/m.exec(chunk);
		if (!match) continue;
		sections.set(match[1], `${chunk.replace(/\n+$/, "")}\n`);
	}
	return sections;
}

function formatReport(sections: Map<string, string>): string {
	const order = uniqueIds([
		...REGIONS.map((region) => region.id),
		...sections.keys(),
	]);
	const lines = ["# map:build", "", `source: checkout ${CANARY_COMMIT}`, ""];
	for (const id of order) {
		const section = sections.get(id);
		if (!section) continue;
		lines.push(section.replace(/\n+$/, ""), "");
	}
	return `${lines.join("\n")}\n`;
}

export function mergeMapReport(
	existing: string,
	rows: ConvertedRegion[],
): string {
	const sections = parseReportSections(existing);
	for (const row of rows) {
		sections.set(row.id, renderSection(row));
	}
	return formatReport(sections);
}

function insertAtlasHashLines(
	doc: string,
	root: string,
	rows: ConvertedRegion[],
): string {
	let out = doc;
	for (const row of rows) {
		const atlasJson = row.jsonRel.replace(/\.json$/, "-atlas.json");
		const abs = join(root, atlasJson);
		if (existsSync(abs)) {
			const line = `${atlasJson}  ${fnv1a32(readFileSync(abs))}`;
			if (!out.includes(line)) {
				const binLine = `${row.binRel}  ${row.binHash}`;
				if (out.includes(binLine)) {
					out = out.replace(binLine, `${binLine}\n${line}`);
				}
			}
		}
		const overlayJson = row.jsonRel.replace(/\.json$/, "-overlay-atlas.json");
		const overlayAbs = join(root, overlayJson);
		if (!existsSync(overlayAbs)) continue;
		const overlayLine = `${overlayJson}  ${fnv1a32(readFileSync(overlayAbs))}`;
		if (out.includes(overlayLine)) continue;
		const atlasLine = `${atlasJson}  `;
		const at = out.indexOf(atlasLine);
		if (at < 0) continue;
		const end = out.indexOf("\n", at);
		if (end < 0) continue;
		out = `${out.slice(0, end)}\n${overlayLine}${out.slice(end)}`;
	}
	return out;
}

export function writePools(root: string, destDir?: string): void {
	const ids = selectPoolIds(REGIONS);
	for (const region of REGIONS) {
		if (!ids.includes(region.id)) continue;
		const json = join(root, "public/floors", region.tower, `${region.id}.json`);
		if (!existsSync(json)) {
			throw new Error(`pool member ${region.id} missing ${json}`);
		}
	}
	const adventures = selectAdventureIds(REGIONS);
	// Screens name a stage's map before it loads (an escape's place on Prepare).
	const named = uniqueIds([...ids, ...Object.values(adventures).flat()]);
	const names = new Map<string, string>();
	for (const region of REGIONS) {
		if (named.includes(region.id)) names.set(region.id, region.displayName);
	}
	const nameLines = named
		.map(
			(id) =>
				`\t${JSON.stringify(id)}: ${JSON.stringify(names.get(id) ?? "")},`,
		)
		.join("\n");
	const adventureLines = Object.entries(adventures).map(([adventure, list]) =>
		tsList("\t", `${adventure}: `, list, ","),
	);
	const downloads = floorDownloads(root, REGIONS);
	const body = [
		"// generated by map:build, do not edit",
		"",
		tsList("", "export const EARTH_POOL = ", ids, " as const;"),
		"",
		"export const DISPLAY_NAMES = {",
		nameLines,
		"} as const;",
		"",
		"export const ADVENTURE_REGIONS = {",
		...adventureLines,
		"} as const;",
		"",
	].join("\n");
	const dir = destDir ?? join(root, "src/data/floors");
	writeIfChanged(join(dir, "pools.gen.ts"), body);
	writeIfChanged(join(dir, "downloads.gen.json"), encodeSortedJson(downloads));
}

export function writeMapReport(root: string, rows: ConvertedRegion[]): void {
	const reportPath = join(root, "scripts/map/REPORT.md");
	const existing = existsSync(reportPath)
		? readFileSync(reportPath, "utf8")
		: "";
	const merged = insertAtlasHashLines(
		mergeMapReport(existing, rows),
		root,
		rows,
	);
	writeFileSync(reportPath, merged.endsWith("\n") ? merged : `${merged}\n`);
}
