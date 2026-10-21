import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARY_COMMIT } from "./config.ts";
import { handwrittenSpells } from "./handwritten-spells.ts";
import { type MountRow, parseMounts } from "./parse-mounts.ts";
import { type OutfitRow, parseOutfits } from "./parse-outfits.ts";
import { parseSpells, type SpellRow } from "./parse-spells.ts";

export { CANARY_COMMIT };

const ROOT = resolve(import.meta.dirname, "../..");
const FIXTURES = join(ROOT, "tests/fixtures/otserv");
const SOURCE_PATH = join(import.meta.dirname, "SOURCE.json");

export function assertCanaryCommit(commit: string): void {
	if (commit !== CANARY_COMMIT) {
		throw new Error(
			`SOURCE.json canaryCommit must be ${CANARY_COMMIT}, got ${commit}`,
		);
	}
}

export function assertSourcePinIfPresent(): void {
	if (!existsSync(SOURCE_PATH)) return;
	const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as {
		canaryCommit?: unknown;
	};
	if (typeof source.canaryCommit !== "string") {
		throw new Error("SOURCE.json canaryCommit is missing");
	}
	assertCanaryCommit(source.canaryCommit);
}

function walkFiles(dir: string, ext: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, ent.name);
		if (ent.isDirectory()) out.push(...walkFiles(path, ext));
		else if (ent.name.endsWith(ext)) out.push(path);
	}
	return out.sort();
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		const rec = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(rec).sort()) {
			out[key] = sortKeys(rec[key]);
		}
		return out;
	}
	return value;
}

export function writeSortedJson(filePath: string, value: unknown): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(sortKeys(value), null, "\t")}\n`);
}

function hasCheckout(checkoutDir: string): boolean {
	return (
		existsSync(join(checkoutDir, "data/scripts/spells")) &&
		existsSync(join(checkoutDir, "data/XML/outfits.xml"))
	);
}

function loadTexts(paths: string[]): string[] {
	return paths.map((path) => readFileSync(path, "utf8"));
}

function mergeSpells(parsed: SpellRow[]): SpellRow[] {
	const byId = new Map<string, SpellRow>();
	for (const row of parsed) byId.set(row.id, row);
	for (const row of handwrittenSpells()) byId.set(row.id, row);
	return [...byId.values()].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
}

function collectParsedSpells(checkoutDir: string): SpellRow[] {
	if (hasCheckout(checkoutDir)) {
		const files = [
			...walkFiles(join(checkoutDir, "data/scripts/spells"), ".lua"),
			...walkFiles(join(checkoutDir, "data/scripts/runes"), ".lua"),
		];
		const parsed: SpellRow[] = [];
		for (const text of loadTexts(files)) parsed.push(...parseSpells(text));
		return parsed;
	}
	return parseSpells(
		readFileSync(join(FIXTURES, "spells-snippet.lua"), "utf8"),
	);
}

function collectOutfits(checkoutDir: string): OutfitRow[] {
	const xml = hasCheckout(checkoutDir)
		? readFileSync(join(checkoutDir, "data/XML/outfits.xml"), "utf8")
		: readFileSync(join(FIXTURES, "outfits-snippet.xml"), "utf8");
	return parseOutfits(xml).sort((a, b) =>
		a.looktype !== b.looktype ? a.looktype - b.looktype : a.type - b.type,
	);
}

function collectMounts(checkoutDir: string): MountRow[] {
	const checkoutMounts = join(checkoutDir, "data/XML/mounts.xml");
	const xml = existsSync(checkoutMounts)
		? readFileSync(checkoutMounts, "utf8")
		: readFileSync(join(FIXTURES, "mounts-snippet.xml"), "utf8");
	return parseMounts(xml).sort((a, b) =>
		a.looktype !== b.looktype
			? a.looktype - b.looktype
			: a.name < b.name
				? -1
				: a.name > b.name
					? 1
					: 0,
	);
}

export function emitSpellsOutfitsMounts(
	checkoutDir: string,
	outDir: string,
): void {
	assertSourcePinIfPresent();
	const spells = mergeSpells(collectParsedSpells(checkoutDir));
	const outfits = collectOutfits(checkoutDir);
	const mounts = collectMounts(checkoutDir);
	mkdirSync(outDir, { recursive: true });
	writeSortedJson(join(outDir, "spells.json"), spells);
	writeSortedJson(join(outDir, "outfits.json"), outfits);
	writeSortedJson(join(outDir, "mounts.json"), mounts);
}

function isMain(): boolean {
	const entry = process.argv[1];
	if (!entry) return false;
	return (
		fileURLToPath(import.meta.url) === resolve(entry) ||
		entry.endsWith("emit-phase4.ts")
	);
}

if (isMain()) {
	const checkout =
		process.argv[2] ?? join(ROOT, "art-src/otserv", `canary-${CANARY_COMMIT}`);
	const outDir = process.argv[3] ?? join(ROOT, "public/content");
	emitSpellsOutfitsMounts(checkout, outDir);
}
