import type { SpellRow } from "./parse-spells.ts";

function instant(id: string, name: string, words: string): SpellRow {
	return {
		id,
		name,
		words,
		kind: "instant",
		runeId: null,
		effectId: null,
		missileId: null,
		level: null,
		mana: null,
		magicLevel: null,
	};
}

export function handwrittenSpells(): SpellRow[] {
	return [
		instant("poison_storm", "Poison Storm", "exevo gran mas pox"),
		instant("natures_embrace", "Nature's Embrace", "exura gran sio"),
	];
}
