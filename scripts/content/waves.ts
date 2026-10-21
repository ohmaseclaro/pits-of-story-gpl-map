import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CANARY_DIR, RAID_ROSTER } from "./config.ts";
import { repoRoot } from "./monsters.ts";

export type ContentWaveSpawn = {
	name: string;
	amount: number;
};

export type ContentWaveStep = {
	delaySec: number;
	spawns: ContentWaveSpawn[];
};

export type ContentWave = {
	id: string;
	name: string;
	broadcast: string;
	boosted?: string;
	steps: ContentWaveStep[];
};

const ROSTER = new Set<string>(RAID_ROSTER);

function attr(tag: string, key: string): string | undefined {
	return tag.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
}

function sortSpawns(spawns: ContentWaveSpawn[]): ContentWaveSpawn[] {
	return [...spawns].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
}

export function parseRaidXml(source: string, id = "", name = ""): ContentWave {
	const broadcast =
		attr(source.match(/<announce\b[^>]*>/)?.[0] ?? "", "message") ?? "";
	const steps: ContentWaveStep[] = [];
	for (const block of source.matchAll(
		/<(areaspawn|singlespawn)\b([^>]*)>([\s\S]*?)<\/\1>/g,
	)) {
		const kind = block[1];
		const attrs = block[2] ?? "";
		const inner = block[3] ?? "";
		const delayMs = Number(attr(attrs, "delay") ?? 0);
		const spawns: ContentWaveSpawn[] = [];
		for (const row of inner.matchAll(/<monster\b([^>]*)\/?>/g)) {
			const monsterName = attr(row[1] ?? "", "name");
			if (!monsterName) continue;
			spawns.push({
				name: monsterName,
				amount: Number(attr(row[1] ?? "", "amount") ?? 1),
			});
		}
		if (kind === "singlespawn") {
			const monsterName = attr(attrs, "name");
			if (monsterName) spawns.push({ name: monsterName, amount: 1 });
		}
		steps.push({ delaySec: delayMs / 1000, spawns: sortSpawns(spawns) });
	}
	return { id, name, broadcast, steps };
}

export function parseRaidLua(source: string, id = "", name = ""): ContentWave {
	const raidName = source.match(/Raid\s*\(\s*"([^"]+)"/)?.[1] ?? name;
	const broadcast = source.match(/addBroadcast\s*\(\s*"([^"]+)"/)?.[1] ?? "";
	const steps: ContentWaveStep[] = [];
	const chunks = source.split(/:autoAdvance\s*\(\s*"([^"]+)"\s*\)/);
	for (let i = 1; i < chunks.length; i += 2) {
		const token = chunks[i] ?? "0s";
		const body = chunks[i + 1] ?? "";
		const sec = token.endsWith("m")
			? Number(token.slice(0, -1)) * 60
			: Number(token.replace(/s$/, ""));
		const spawns: ContentWaveSpawn[] = [];
		for (const row of body.matchAll(
			/\{\s*name\s*=\s*"([^"]+)"\s*,\s*amount\s*=\s*(\d+)/g,
		)) {
			spawns.push({ name: row[1] ?? "", amount: Number(row[2] ?? 0) });
		}
		if (spawns.length)
			steps.push({ delaySec: sec, spawns: sortSpawns(spawns) });
	}
	return {
		id: id || raidName.replaceAll(".", "-"),
		name: raidName,
		broadcast,
		steps,
	};
}

function walkFiles(dir: string, ext: string, out: string[]): void {
	if (!existsSync(dir)) return;
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, ent.name);
		if (ent.isDirectory()) walkFiles(path, ext, out);
		else if (ent.name.endsWith(ext)) out.push(path);
	}
}

function rosterOnly(wave: ContentWave): boolean {
	const names = wave.steps.flatMap((step) =>
		step.spawns.map((spawn) => spawn.name),
	);
	return names.length > 0 && names.every((name) => ROSTER.has(name));
}

function withBoost(wave: ContentWave): ContentWave {
	const hasRat = wave.steps.some((step) =>
		step.spawns.some((spawn) => spawn.name === "Rat"),
	);
	if (!hasRat) return wave;
	return { ...wave, boosted: "Rat" };
}

function waveFromFile(path: string): ContentWave {
	const source = readFileSync(path, "utf8");
	const base = path.split(/[/\\]/).pop() ?? "raid";
	const stem = base.replace(/\.(xml|lua)$/, "");
	const id = stem.replaceAll("_", "-");
	const name = stem.replaceAll("_", ".");
	if (base.endsWith(".lua")) return parseRaidLua(source, id, name);
	return parseRaidXml(source, id, name);
}

export function emitWaveRows(root = repoRoot()): ContentWave[] {
	const files: string[] = [];
	const canaryRaids = join(root, CANARY_DIR, "data-otservbr-global", "raids");
	const canaryLua = join(
		root,
		CANARY_DIR,
		"data-otservbr-global",
		"scripts",
		"raids",
	);
	if (existsSync(canaryRaids) || existsSync(canaryLua)) {
		walkFiles(canaryRaids, ".xml", files);
		walkFiles(canaryLua, ".lua", files);
	} else {
		walkFiles(join(root, "tests/fixtures/otserv"), ".xml", files);
	}
	const waves = files
		.filter((path) => {
			const source = readFileSync(path, "utf8");
			return source.includes("<raid") || source.includes("Raid(");
		})
		.map(waveFromFile)
		.map((wave) => {
			if (/Rat Plague/.test(wave.broadcast)) {
				return {
					...wave,
					id: wave.id === "rats" ? "thais-rats" : wave.id,
					name: "thais.rats",
				};
			}
			if (/Numerous Rats/.test(wave.broadcast)) {
				return { ...wave, id: "rookgaard-rats", name: "rookgaard.rats" };
			}
			return wave;
		})
		.filter(rosterOnly)
		.map(withBoost)
		.filter(
			(wave) =>
				/Rat Plague|Numerous Rats/.test(wave.broadcast) ||
				wave.steps.length > 0,
		);
	if (!waves.some((wave) => wave.boosted === "Rat") && waves[0])
		waves[0].boosted = "Rat";
	waves.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return waves;
}
