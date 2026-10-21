/**
 * The Expeditions creatures' and lair bosses' Bestiary and Bosstiary rows (SEED_WORLDS), from Canary's monster
 * files (the checkout, else tests/fixtures/otserv): src/data/bestiary.expedition.json, and the catalog part
 * every screen reads at boot in src/data/bestiary.expedition.catalog.json.
 * Run: node --experimental-strip-types scripts/content/expedition-bestiary.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPEDITION_ENEMIES } from "../../src/data/enemies.expedition.ts";
import { writeSortedJson } from "./lib/json.ts";
import { type LuaValue, parseMonsterLua } from "./luaTable.ts";
import { findMonsterFile, monsterRow, repoRoot } from "./monsters.ts";

/** bossesKin.ts KIN_BOSSES, in order. */
export const KIN_BOSS_NAMES = [
	"The Snapper",
	"Shardhead",
	"Thul",
	"Fleshslicer",
	"Kerberos",
] as const;

const STARS = ["Harmless", "Trivial", "Easy", "Medium", "Hard", "Challenging"];

function rec(value: LuaValue | undefined): Record<string, LuaValue> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value
		: {};
}

function num(value: LuaValue | undefined): number {
	return typeof value === "number" ? value : 0;
}

/** Item names in Canary's order: `name = "…"`, or the comment Canary writes after an `id = …` row. */
export function lootOf(source: string): string[] {
	const start = source.search(/monster\.loot\s*=\s*\{\s*\n/);
	if (start < 0) return [];
	const out: string[] = [];
	for (const line of source.slice(start).split("\n").slice(1)) {
		if (/^\s*\}\s*$/.test(line)) break;
		const name =
			/\bname\s*=\s*"([^"]+)"/.exec(line)?.[1] ??
			/\bid\s*=\s*\d+.*--\s*(.+?)\s*$/.exec(line)?.[1];
		if (name && !out.includes(name)) out.push(name);
	}
	return out;
}

function source(name: string, root: string): string {
	return readFileSync(findMonsterFile(name, root), "utf8");
}

export function expeditionBestiary(root = repoRoot()) {
	const creatures = EXPEDITION_ENEMIES.map((enemy) => {
		const text = source(enemy.name, root);
		const lua = parseMonsterLua(text);
		const row = monsterRow(lua);
		const best = rec(lua.Bestiary);
		return {
			creatureId: enemy.id,
			name: row.name,
			class: String(best.class ?? ""),
			difficulty: STARS[num(best.Stars)] ?? "Harmless",
			occurrence: num(best.Occurrence),
			stages: [num(best.FirstUnlock), num(best.SecondUnlock), num(best.toKill)],
			charmsPoints: num(best.CharmsPoints),
			health: row.health,
			speed: row.speed,
			armor: row.armor,
			elements: row.elements.filter((e) => e.percent !== 0),
			loot: lootOf(text),
		};
	});
	const bosses = KIN_BOSS_NAMES.map((name) => ({
		id: name.toLowerCase().replaceAll(" ", "_"),
		name,
		loot: lootOf(source(name, root)),
	}));
	return { creatures, bosses };
}

/** Ids, names, kill ladder and charm points: what the catalogs need before the Bestiary opens. */
export function expeditionCatalog(full = expeditionBestiary()) {
	return {
		creatures: full.creatures.map(
			({ creatureId, name, stages, charmsPoints }) => ({
				creatureId,
				name,
				stages,
				charmsPoints,
			}),
		),
		bosses: full.bosses.map(({ id, name }) => ({ id, name })),
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const full = expeditionBestiary();
	for (const [file, value] of [
		["bestiary.expedition.json", full],
		["bestiary.expedition.catalog.json", expeditionCatalog(full)],
	] as const) {
		const out = join(repoRoot(), "src/data", file);
		writeSortedJson(out, value);
		console.log(`wrote ${out}`);
	}
}
