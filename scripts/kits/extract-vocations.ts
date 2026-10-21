import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARY_DIR } from "../content/config.ts";

const KIT_VOCATIONS = [
	"knight",
	"paladin",
	"sorcerer",
	"druid",
	"monk",
] as const;
type KitVocation = (typeof KIT_VOCATIONS)[number];

const PROMO_TO_BASE: Record<string, KitVocation> = {
	knight: "knight",
	"elite knight": "knight",
	paladin: "paladin",
	"royal paladin": "paladin",
	sorcerer: "sorcerer",
	"master sorcerer": "sorcerer",
	druid: "druid",
	"elder druid": "druid",
	monk: "monk",
	"exalted monk": "monk",
};

const ALL_VOC: readonly KitVocation[] = KIT_VOCATIONS;

type SkillRow = { id: string; words: string; kind: "instant" | "rune" };
type NamedRow = { id: string; name: string };

type LuaSpell = {
	kind: "instant" | "rune";
	words: string;
	name: string;
	vocations: KitVocation[] | null;
	runeId: number | null;
	conjureRuneId: number | null;
	fromConjuring: boolean;
	file: string;
};

type ItemRow = {
	id: string;
	name: string;
	hasSlot: boolean;
	vocations: KitVocation[] | null;
};

function repoRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function walkLua(dir: string): string[] {
	const out: string[] = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkLua(path));
		else if (entry.name.endsWith(".lua")) out.push(path);
	}
	return out;
}

function foldVocName(raw: string): KitVocation | null {
	const key = raw.trim().toLowerCase();
	if (!key || key === "none") return null;
	return PROMO_TO_BASE[key] ?? null;
}

function vocsFromQuoted(args: string): KitVocation[] {
	const found = new Set<KitVocation>();
	for (const match of args.matchAll(/"([^"]+)"/g)) {
		const mapped = foldVocName(match[1].split(";")[0] ?? "");
		if (mapped) found.add(mapped);
	}
	return KIT_VOCATIONS.filter((v) => found.has(v));
}

function vocsFromCsv(value: string): KitVocation[] {
	const found = new Set<KitVocation>();
	for (const part of value.split(",")) {
		const mapped = foldVocName(part.split(";")[0] ?? "");
		if (mapped) found.add(mapped);
	}
	return KIT_VOCATIONS.filter((v) => found.has(v));
}

function vocationCall(block: string): KitVocation[] | null {
	const match = block.match(/:vocation\(([^)]*)\)/);
	if (!match) return null;
	return vocsFromQuoted(match[1]);
}

function stringMethod(block: string, method: string): string {
	const match = block.match(
		new RegExp(`(?:^|[\\s.])\\w+:${method}\\(\\s*"([^"]*)"\\s*\\)`),
	);
	return match?.[1] ?? "";
}

function numberMethod(block: string, method: string): number | null {
	const match = block.match(
		new RegExp(`(?:^|[\\s.])\\w+:${method}\\(\\s*(-?\\d+)\\s*\\)`),
	);
	return match ? Number(match[1]) : null;
}

function parseLuaFile(path: string, fromConjuring: boolean): LuaSpell[] {
	const text = readFileSync(path, "utf8");
	const split = /(?:local\s+\w+\s*=\s*)?Spell\(\s*"(rune|instant)"\s*\)/g;
	const starts: { kind: "instant" | "rune"; index: number }[] = [];
	let found = split.exec(text);
	while (found) {
		starts.push({
			kind: found[1] as "instant" | "rune",
			index: found.index + found[0].length,
		});
		found = split.exec(text);
	}
	const rows: LuaSpell[] = [];
	for (let i = 0; i < starts.length; i++) {
		const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
		const block = text.slice(starts[i].index, end);
		const conjure = block.match(/conjureItem\(\s*\d+\s*,\s*(\d+)/);
		rows.push({
			kind: starts[i].kind,
			words: stringMethod(block, "words"),
			name: stringMethod(block, "name"),
			vocations: vocationCall(block),
			runeId: numberMethod(block, "runeId"),
			conjureRuneId: conjure ? Number(conjure[1]) : null,
			fromConjuring,
			file: path,
		});
	}
	return rows;
}

function loadOurSkills(root: string): SkillRow[] {
	const dir = join(root, "src/data/skills");
	const rows: SkillRow[] = [];
	const seen = new Set<string>();
	for (const name of readdirSync(dir).sort()) {
		if (!name.endsWith(".ts")) continue;
		const text = readFileSync(join(dir, name), "utf8");
		const re =
			/id:\s*"([a-z0-9_]+)"[\s\S]*?words:\s*"([^"]*)"[\s\S]*?kind:\s*"(instant|rune)"/g;
		let match = re.exec(text);
		while (match) {
			if (!seen.has(match[1])) {
				seen.add(match[1]);
				rows.push({
					id: match[1],
					words: match[2],
					kind: match[3] as "instant" | "rune",
				});
			}
			match = re.exec(text);
		}
	}
	return rows;
}

function loadPassives(root: string): NamedRow[] {
	const text = readFileSync(join(root, "src/data/passives.ts"), "utf8");
	const rows: NamedRow[] = [];
	const re = /id:\s*"([a-z0-9_]+)",\s*\n\s*name:\s*"([^"]+)"/g;
	let match = re.exec(text);
	while (match) {
		rows.push({ id: match[1], name: match[2] });
		match = re.exec(text);
	}
	return rows;
}

function loadItems(root: string): NamedRow[] {
	const text = readFileSync(join(root, "src/data/items.ts"), "utf8");
	const rows: NamedRow[] = [];
	const re = /def\(\s*"([a-z0-9_]+)"\s*,\s*"([^"]+)"/g;
	let match = re.exec(text);
	while (match) {
		rows.push({ id: match[1], name: match[2] });
		match = re.exec(text);
	}
	return rows;
}

const ATTR = /([A-Za-z_:][A-Za-z0-9_:]*)\s*=\s*"([^"]*)"/g;
const ITEM_BLOCK = /<item\b([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/gi;
const ATTRIBUTE = /<attribute\b([^>]*)\/?>/gi;

function attrsOf(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const match of tag.matchAll(ATTR)) {
		if (match[1]) out[match[1]] = match[2] ?? "";
	}
	return out;
}

function parseItemsXml(xmlPath: string): ItemRow[] {
	const source = readFileSync(xmlPath).toString("latin1");
	const rows: ItemRow[] = [];
	for (const match of source.matchAll(ITEM_BLOCK)) {
		const open = attrsOf((match[1] ?? "").replace(/\/\s*$/, ""));
		const name = open.name;
		if (!name) continue;
		const body = match[2] ?? "";
		let vocation: string | undefined;
		let hasSlot = false;
		for (const row of body.matchAll(ATTRIBUTE)) {
			const rowAttrs = attrsOf(row[1] ?? "");
			if (rowAttrs.key === "slot" || rowAttrs.key === "slotType") {
				hasSlot = true;
			}
			if (rowAttrs.key === "vocation") vocation = rowAttrs.value;
		}
		rows.push({
			id: open.id ?? `${open.fromid ?? "?"}-${open.toid ?? "?"}`,
			name,
			hasSlot,
			vocations: vocation === undefined ? null : vocsFromCsv(vocation),
		});
	}
	return rows;
}

function intersect(
	a: readonly KitVocation[],
	b: readonly KitVocation[],
): KitVocation[] {
	const set = new Set(b);
	return a.filter((v) => set.has(v));
}

function emitList(vocs: readonly KitVocation[]): string {
	return `[${vocs.map((v) => `"${v}"`).join(", ")}]`;
}

function emitMap(
	entries: { id: string; vocs: readonly KitVocation[] }[],
): string {
	const lines = entries.map((row) => `\t${row.id}: ${emitList(row.vocs)},`);
	return `{\n${lines.join("\n")}\n}`;
}

function resolveItemVocs(
	name: string,
	xmlRows: ItemRow[],
	duplicates: string[],
): KitVocation[] | null {
	const key = name.toLowerCase();
	const matches = xmlRows.filter((row) => row.name.toLowerCase() === key);
	if (matches.length === 0) return null;
	const slotted = matches.filter((row) => row.hasSlot);
	const chosen = slotted.length > 0 ? slotted : matches;
	if (slotted.length > 1) {
		duplicates.push(`${name} (${slotted.map((row) => row.id).join(", ")})`);
	}
	const restricted = chosen.filter((row) => row.vocations !== null);
	if (restricted.length === 0) return [...ALL_VOC];
	const union = new Set<KitVocation>();
	for (const row of restricted) {
		for (const voc of row.vocations ?? []) union.add(voc);
	}
	return KIT_VOCATIONS.filter((v) => union.has(v));
}

function main(): void {
	const root = repoRoot();
	const pin = join(root, CANARY_DIR);
	const spellsDir = join(pin, "data/scripts/spells");
	const runesDir = join(pin, "data/scripts/runes");
	const itemsXml = join(pin, "data/items/items.xml");
	if (
		!readdirSync(spellsDir, { withFileTypes: true }).some(
			(e) => e.isDirectory() || e.name.endsWith(".lua"),
		)
	) {
		throw new Error(`missing Canary spells at ${spellsDir}`);
	}

	const ourSkills = loadOurSkills(root);
	const ourPassives = loadPassives(root);
	const ourItems = loadItems(root);
	const extras: NamedRow[] = [
		{ id: "potion", name: "potion" },
		{ id: "goldBag", name: "goldBag" },
	];

	const luaSpells: LuaSpell[] = [];
	for (const file of walkLua(spellsDir)) {
		const fromConjuring =
			file.includes(`${"/"}conjuring${"/"}`) || file.includes("\\conjuring\\");
		luaSpells.push(...parseLuaFile(file, fromConjuring));
	}
	const luaRunes: LuaSpell[] = [];
	for (const file of walkLua(runesDir)) {
		luaRunes.push(...parseLuaFile(file, false));
	}

	const instantsByWords = new Map<string, LuaSpell>();
	const conjureByWords = new Map<string, LuaSpell>();
	for (const spell of luaSpells) {
		if (!spell.words) continue;
		if (spell.fromConjuring) {
			if (!conjureByWords.has(spell.words))
				conjureByWords.set(spell.words, spell);
			continue;
		}
		if (spell.kind === "instant" && !instantsByWords.has(spell.words)) {
			instantsByWords.set(spell.words, spell);
		}
	}

	const runeByItemId = new Map<number, LuaSpell>();
	const runeByNormName = new Map<string, LuaSpell>();
	for (const rune of luaRunes) {
		if (rune.runeId !== null) runeByItemId.set(rune.runeId, rune);
		const norm = rune.name
			.toLowerCase()
			.replace(/['\u2019]/g, "")
			.replace(/\s+rune$/, "")
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.replace(/ze$/, "se");
		if (norm) runeByNormName.set(norm, rune);
	}

	const unresolved: string[] = [];
	const skillEntries: { id: string; vocs: readonly KitVocation[] }[] = [];
	const useEntries: { id: string; vocs: readonly KitVocation[] }[] = [];

	for (const skill of ourSkills) {
		if (skill.kind === "instant") {
			const hit = instantsByWords.get(skill.words);
			if (!hit) {
				unresolved.push(`skill ${skill.id} words=${skill.words}`);
				continue;
			}
			skillEntries.push({
				id: skill.id,
				vocs:
					hit.vocations && hit.vocations.length > 0 ? hit.vocations : ALL_VOC,
			});
			continue;
		}
		const conjure = conjureByWords.get(skill.words);
		if (!conjure?.vocations || conjure.vocations.length === 0) {
			unresolved.push(`skill ${skill.id} words=${skill.words} (no conjure)`);
			continue;
		}
		let vocs = conjure.vocations;
		let rune: LuaSpell | undefined;
		if (conjure.conjureRuneId !== null) {
			rune = runeByItemId.get(conjure.conjureRuneId);
		}
		if (!rune) {
			rune = runeByNormName.get(
				skill.id.replace(/ze$/, "se").replace(/se$/, "se"),
			);
			if (!rune) rune = runeByNormName.get(skill.id.replace(/yse$/, "yze"));
		}
		if (rune) {
			useEntries.push({
				id: skill.id,
				vocs:
					rune.vocations && rune.vocations.length > 0
						? rune.vocations
						: ALL_VOC,
			});
		}
		if (rune?.vocations && rune.vocations.length > 0) {
			vocs = intersect(vocs, rune.vocations);
		}
		if (vocs.length === 0) {
			unresolved.push(
				`skill ${skill.id} words=${skill.words} (empty intersect)`,
			);
			continue;
		}
		skillEntries.push({ id: skill.id, vocs });
	}

	const xmlRows = parseItemsXml(itemsXml);
	const duplicates: string[] = [];
	const itemEntries: { id: string; vocs: readonly KitVocation[] }[] = [];
	for (const row of [...ourItems, ...ourPassives]) {
		const vocs = resolveItemVocs(row.name, xmlRows, duplicates);
		if (!vocs) {
			unresolved.push(`item ${row.id} name=${row.name}`);
			continue;
		}
		itemEntries.push({ id: row.id, vocs });
	}
	for (const row of extras) {
		const vocs = resolveItemVocs(row.name, xmlRows, duplicates);
		if (!vocs) unresolved.push(`powerup ${row.id}`);
		else itemEntries.push({ id: row.id, vocs });
	}

	const pinRel = relative(root, pin).replaceAll("\\", "/");
	const header = `/** ${pinRel} via node --experimental-strip-types scripts/kits/extract-vocations.ts */\n`;
	const body = `${header}
export const CANARY_SKILL_VOC = ${emitMap(skillEntries)} as const;

export const CANARY_ITEM_VOC = ${emitMap(itemEntries)} as const;

/** Who can use each rune in Tibia (its rune script's vocation list, else everyone); CANARY_SKILL_VOC lists who makes it. */
export const CANARY_RUNE_USE = ${emitMap(useEntries)} as const;
`;
	const outPath = join(root, "src/data/vocationKits.canary.ts");
	writeFileSync(outPath, body);
	if (duplicates.length > 0) {
		console.log("DUPLICATE");
		for (const line of duplicates) console.log(line);
	}
	console.log("UNRESOLVED");
	if (unresolved.length === 0) console.log("(none)");
	else for (const line of unresolved) console.log(line);
}

const entry = process.argv[1];
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
}
