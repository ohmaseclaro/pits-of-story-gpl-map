export type SpellKind = "rune" | "instant";

export type SpellRow = {
	id: string;
	name: string;
	words: string;
	kind: SpellKind;
	runeId: number | null;
	effectId: number | null;
	missileId: number | null;
	level: number | null;
	mana: number | null;
	magicLevel: number | null;
};

const SPELL_SPLIT = /(?:local\s+\w+\s*=\s*)?Spell\(\s*"(rune|instant)"\s*\)/g;

export function spellIdFromName(name: string): string {
	return name
		.toLowerCase()
		.replace(/['\u2019]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function stringArg(block: string, method: string): string | null {
	const match = block.match(
		new RegExp(`(?:^|[\\s.])\\w+:${method}\\(\\s*"([^"]*)"\\s*\\)`),
	);
	return match ? match[1] : null;
}

function numberArg(block: string, method: string): number | null {
	const match = block.match(
		new RegExp(`(?:^|[\\s.])\\w+:${method}\\(\\s*(-?\\d+)\\s*\\)`),
	);
	return match ? Number(match[1]) : null;
}

function parseBlock(kind: SpellKind, block: string): SpellRow | null {
	const name = stringArg(block, "name");
	if (!name) return null;
	const runeId = numberArg(block, "runeId");
	return {
		id: spellIdFromName(name),
		name,
		words: stringArg(block, "words") ?? "",
		kind: runeId !== null ? "rune" : kind,
		runeId,
		effectId: null,
		missileId: null,
		level: numberArg(block, "level"),
		mana: numberArg(block, "mana"),
		magicLevel: numberArg(block, "magicLevel"),
	};
}

export function parseSpells(text: string): SpellRow[] {
	const rows: SpellRow[] = [];
	const starts: { kind: SpellKind; index: number }[] = [];
	SPELL_SPLIT.lastIndex = 0;
	let found = SPELL_SPLIT.exec(text);
	while (found) {
		starts.push({
			kind: found[1] as SpellKind,
			index: found.index + found[0].length,
		});
		found = SPELL_SPLIT.exec(text);
	}
	for (let i = 0; i < starts.length; i++) {
		const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
		const row = parseBlock(starts[i].kind, text.slice(starts[i].index, end));
		if (row) rows.push(row);
	}
	return rows;
}
