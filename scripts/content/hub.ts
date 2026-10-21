import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACHIEVEMENTS } from "../../src/data/achievements.ts";
import { BESTIARY, CHARMS } from "../../src/data/bestiary.ts";
import { SHRINE } from "../../src/data/shrine.ts";
import { encodeSortedJson } from "./lib/json.ts";

const CONTENT_DIR = resolve(
	fileURLToPath(new URL("../../public/content", import.meta.url)),
);

type MonsterBestiary = {
	FirstUnlock?: number;
	SecondUnlock?: number;
	toKill?: number;
	CharmsPoints?: number;
	Locations?: string;
	class?: string;
	Stars?: number;
};

type MonsterRow = {
	name?: string;
	id?: string;
	FirstUnlock?: number;
	SecondUnlock?: number;
	toKill?: number;
	CharmsPoints?: number;
	Locations?: string;
	class?: string;
	difficulty?: string;
	stages?: number[];
	Bestiary?: MonsterBestiary;
};

function slugName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, "_");
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

function fallbackFor(name: string) {
	const key = slugName(name);
	return BESTIARY.find(
		(row) => row.creatureId === key || slugName(row.name) === key,
	);
}

function rowFromBestiary(row: (typeof BESTIARY)[number]) {
	return {
		CharmsPoints: row.charmsPoints,
		FirstUnlock: row.stages[0],
		Locations: row.locations,
		SecondUnlock: row.stages[1],
		class: row.class,
		creatureId: row.creatureId,
		difficulty: row.difficulty,
		id: row.creatureId,
		name: row.name,
		stages: [...row.stages],
		toKill: row.stages[2],
	};
}

function rowFromMonster(row: MonsterRow) {
	const name = String(row.name ?? row.id ?? "");
	if (!name) return null;
	const fallback = fallbackFor(name);
	const nested = row.Bestiary;
	const first = row.FirstUnlock ?? nested?.FirstUnlock ?? fallback?.stages[0];
	const second =
		row.SecondUnlock ?? nested?.SecondUnlock ?? fallback?.stages[1];
	const toKill = row.toKill ?? nested?.toKill ?? fallback?.stages[2];
	const charms =
		row.CharmsPoints ?? nested?.CharmsPoints ?? fallback?.charmsPoints;
	const locations =
		row.Locations ?? nested?.Locations ?? fallback?.locations ?? "";
	const klass = row.class ?? nested?.class ?? fallback?.class ?? "";
	if (
		first === undefined ||
		second === undefined ||
		toKill === undefined ||
		charms === undefined
	) {
		return fallback ? rowFromBestiary(fallback) : null;
	}
	const stages = Array.isArray(row.stages)
		? row.stages
		: [first, second, toKill];
	const id = slugName(String(row.id ?? name));
	return {
		CharmsPoints: charms,
		FirstUnlock: first,
		Locations: locations,
		SecondUnlock: second,
		class: klass,
		creatureId: id,
		difficulty: row.difficulty ?? fallback?.difficulty ?? "Trivial",
		id,
		name,
		stages,
		toKill,
	};
}

async function bestiaryRows(outDir: string): Promise<unknown[]> {
	const local = await readJsonIfPresent(join(outDir, "monsters.json"));
	const shipped =
		local ?? (await readJsonIfPresent(join(CONTENT_DIR, "monsters.json")));
	if (Array.isArray(shipped) && shipped.length > 0) {
		const mapped = shipped
			.map((row) =>
				row && typeof row === "object"
					? rowFromMonster(row as MonsterRow)
					: null,
			)
			.filter((row) => row !== null);
		if (mapped.length > 0) return mapped;
	}
	return BESTIARY.map(rowFromBestiary);
}

/** CONTENT-05 / D-CONTENT-01. Local files only — no network fetch. */
export async function emitHubContent(outDir: string): Promise<void> {
	await mkdir(outDir, { recursive: true });
	const achievements = ACHIEVEMENTS.map((row) => ({
		grade: row.grade,
		id: row.id,
		name: row.name,
	}));
	const lane = SHRINE.lane.map((day) => ({
		day: day.day,
		fallbackGold: day.fallbackGold,
		kind: day.kind,
		name: day.name,
	}));
	await writeFile(
		join(outDir, "achievements.json"),
		encodeSortedJson(achievements),
	);
	await writeFile(
		join(outDir, "bestiary.json"),
		encodeSortedJson(await bestiaryRows(outDir)),
	);
	await writeFile(join(outDir, "charms.json"), encodeSortedJson(CHARMS));
	await writeFile(join(outDir, "reward-lane.json"), encodeSortedJson(lane));
}

const invoked =
	Boolean(process.argv[1]) &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invoked) {
	emitHubContent(resolve(process.argv[2] ?? CONTENT_DIR)).catch(
		(err: unknown) => {
			console.error(err);
			process.exitCode = 1;
		},
	);
}
