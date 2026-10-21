import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARY_DIR, CONTENT } from "./config.ts";
import {
	type LuaMonsterTable,
	type LuaValue,
	parseMonsterLua,
} from "./luaTable.ts";

export type ContentVoice = {
	text: string;
	yell: boolean;
	interval: number;
	chance: number;
};

export type ContentSummon = {
	name: string;
	count: number;
	chance: number;
	interval: number;
};

export type ContentElement = {
	type: string;
	percent: number;
};

export type ContentAttack = {
	name: string;
	interval?: number;
	chance?: number;
	minDamage?: number;
	maxDamage?: number;
	type?: string;
	range?: number;
	radius?: number;
	length?: number;
	spread?: number;
	shootEffect?: string;
	effect?: string;
	skill?: number;
	attack?: number;
	speedChange?: number;
	duration?: number;
};

export type ContentImmunity = {
	type: string;
	condition: boolean;
};

export type ContentFlags = {
	targetDistance: number;
	runHealth: number;
	rewardBoss: boolean;
};

export type ContentBosstiary = {
	bossRaceId?: number;
	bossRace?: string;
};

export type ContentMonster = {
	name: string;
	lookType: number;
	armor: number;
	health: number;
	speed: number;
	experience: number;
	flags: ContentFlags;
	voices: ContentVoice[];
	summons: ContentSummon[];
	elements: ContentElement[];
	attacks: ContentAttack[];
	immunities: ContentImmunity[];
	bosstiary?: ContentBosstiary;
};

const ATTACK_KEYS = [
	"name",
	"interval",
	"chance",
	"minDamage",
	"maxDamage",
	"type",
	"range",
	"radius",
	"length",
	"spread",
	"shootEffect",
	"effect",
	"skill",
	"attack",
	"speedChange",
	"duration",
] as const;

export function repoRoot(from = import.meta.url): string {
	return join(dirname(fileURLToPath(from)), "../..");
}

function slug(name: string): string {
	return name.toLowerCase().replaceAll(" ", "_");
}

function walkLua(dir: string, out: string[]): void {
	if (!existsSync(dir)) return;
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, ent.name);
		if (ent.isDirectory()) walkLua(path, out);
		else if (ent.name.endsWith(".lua")) out.push(path);
	}
}

const CREATES_TYPE = /Game\.createMonsterType\((?:"([^"]*)"|'([^']*)')\)/g;

/** Every Canary monster file, by each name it creates a type for, in walk order. */
const typeIndex = new Map<string, Map<string, string[]>>();

function monsterFilesByType(canary: string): Map<string, string[]> {
	let index = typeIndex.get(canary);
	if (index) return index;
	index = new Map();
	const files: string[] = [];
	walkLua(canary, files);
	for (const file of files) {
		const names = new Set<string>();
		for (const m of readFileSync(file, "utf8").matchAll(CREATES_TYPE))
			names.add(m[1] ?? m[2]);
		for (const name of names) {
			const hits = index.get(name);
			if (hits) hits.push(file);
			else index.set(name, [file]);
		}
	}
	typeIndex.set(canary, index);
	return index;
}

export function findMonsterFile(name: string, root = repoRoot()): string {
	const canary = join(root, CANARY_DIR, "data-otservbr-global", "monster");
	if (existsSync(canary)) {
		const matches = monsterFilesByType(canary).get(name) ?? [];
		if (matches.length === 0) throw new Error(`canary missing monster ${name}`);
		return (
			matches.find((file) => !file.includes("/quests/")) ?? matches[0] ?? ""
		);
	}
	const fixture = join(root, "tests/fixtures/otserv", `${slug(name)}.lua`);
	if (!existsSync(fixture)) throw new Error(`fixture missing for ${name}`);
	return fixture;
}

function rowsOf(value: LuaValue | undefined): Record<string, LuaValue>[] {
	if (!value) return [];
	const list = Array.isArray(value) ? value : Object.values(value);
	const rows: Record<string, LuaValue>[] = [];
	for (const item of list) {
		if (item && typeof item === "object" && !Array.isArray(item))
			rows.push(item);
	}
	return rows;
}

function num(value: LuaValue | undefined, fallback = 0): number {
	return typeof value === "number" ? value : fallback;
}

function str(value: LuaValue | undefined): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function bool(value: LuaValue | undefined): boolean {
	return value === true;
}

function normalizeVoices(voices: LuaValue | undefined): ContentVoice[] {
	if (!voices || typeof voices !== "object") return [];
	const rec = Array.isArray(voices) ? {} : voices;
	const interval = num(rec.interval);
	const chance = num(rec.chance);
	const out: ContentVoice[] = [];
	for (const row of rowsOf(voices)) {
		const text = str(row.text);
		if (!text) continue;
		out.push({ text, yell: bool(row.yell), interval, chance });
	}
	return out;
}

function normalizeSummons(summon: LuaValue | undefined): ContentSummon[] {
	if (!summon || typeof summon !== "object") return [];
	const nested = !Array.isArray(summon) ? summon.summons : undefined;
	const source = nested ?? summon;
	const out: ContentSummon[] = [];
	for (const row of rowsOf(source)) {
		const name = str(row.name);
		if (!name) continue;
		out.push({
			name,
			count: num(row.count, 1),
			chance: num(row.chance),
			interval: num(row.interval),
		});
	}
	return out;
}

function normalizeFlags(flags: LuaValue | undefined): ContentFlags {
	const rec =
		flags && typeof flags === "object" && !Array.isArray(flags) ? flags : {};
	return {
		targetDistance: num(rec.targetDistance, 1),
		runHealth: num(rec.runHealth),
		rewardBoss: bool(rec.rewardBoss),
	};
}

function normalizeElements(elements: LuaValue | undefined): ContentElement[] {
	const out: ContentElement[] = [];
	for (const row of rowsOf(elements)) {
		const type = str(row.type);
		if (!type) continue;
		out.push({ type, percent: num(row.percent) });
	}
	return out;
}

function normalizeAttacks(attacks: LuaValue | undefined): ContentAttack[] {
	const out: ContentAttack[] = [];
	for (const row of rowsOf(attacks)) {
		const name = str(row.name);
		if (!name) continue;
		const attack: ContentAttack = { name };
		for (const key of ATTACK_KEYS) {
			if (key === "name") continue;
			const value = row[key];
			if (value === undefined) continue;
			if (typeof value === "number" || typeof value === "string") {
				(attack as Record<string, number | string>)[key] = value;
			}
		}
		out.push(attack);
	}
	return out;
}

function normalizeImmunities(
	immunities: LuaValue | undefined,
): ContentImmunity[] {
	const out: ContentImmunity[] = [];
	for (const row of rowsOf(immunities)) {
		const type = str(row.type);
		if (!type) continue;
		out.push({ type, condition: bool(row.condition) });
	}
	return out;
}

function normalizeBosstiary(
	raw: LuaValue | undefined,
): ContentBosstiary | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const bossRaceId =
		typeof raw.bossRaceId === "number" ? raw.bossRaceId : undefined;
	const bossRace = typeof raw.bossRace === "string" ? raw.bossRace : undefined;
	if (bossRaceId === undefined && bossRace === undefined) return undefined;
	return {
		...(bossRaceId !== undefined ? { bossRaceId } : {}),
		...(bossRace ? { bossRace } : {}),
	};
}

export function monsterRow(parsed: LuaMonsterTable): ContentMonster {
	const bosstiary = normalizeBosstiary(parsed.bosstiary);
	return {
		name: parsed.name,
		lookType: parsed.lookType,
		armor: num(parsed.armor as LuaValue | undefined),
		health: num(parsed.health as LuaValue | undefined),
		speed: num(parsed.speed as LuaValue | undefined),
		experience: num(parsed.experience as LuaValue | undefined),
		flags: normalizeFlags(parsed.flags),
		voices: normalizeVoices(parsed.voices),
		summons: normalizeSummons(
			(parsed.summon ?? parsed.summons) as LuaValue | undefined,
		),
		elements: normalizeElements(parsed.elements),
		attacks: normalizeAttacks(parsed.attacks),
		immunities: normalizeImmunities(parsed.immunities),
		...(bosstiary ? { bosstiary } : {}),
	};
}

export function emitMonsterRows(root = repoRoot()): ContentMonster[] {
	const rows = CONTENT.monsters.map((name) => {
		const source = readFileSync(findMonsterFile(name, root), "utf8");
		return monsterRow(parseMonsterLua(source));
	});
	rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return rows;
}
