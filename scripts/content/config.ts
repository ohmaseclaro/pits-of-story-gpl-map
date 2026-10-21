import { readFileSync } from "node:fs";

const source = JSON.parse(
	readFileSync(new URL("./SOURCE.json", import.meta.url), "utf8"),
) as { canaryCommit: string };

export const CANARY_COMMIT: string = source.canaryCommit;

export const contentConfig = {
	items: ["gold coin", "cheese"],
} as const satisfies {
	items: readonly string[];
};

export type ContentConfig = typeof contentConfig;

/** Emit roster: names that have fixtures (or a canary checkout). */
export const CONTENT = {
	monsters: [
		"Rat",
		"Cave Rat",
		"Bat",
		"Thornback Tortoise",
		"Goblin",
		"Boar",
		"Humongous Fungus",
		"Orc Shaman",
		"Toad",
		"Snake",
		"Munster",
		"Grorlam",
		"The Many",
		"Bug",
		"Wolf",
		"Deer",
		"Spider",
		"Poison Spider",
		"Young Troll",
		"Troll",
		"Troll Guard",
		"Wasp",
		"Orc",
		"Orc Spearman",
		"Minotaur",
		"Hyaena",
		"Rabbit",
		"Weakened Demon",
		"Kraknaknork",
		"Apprentice Sheng",
		"Spider Queen",
	],
} as const;

/** waves.json keeps the tower roster so raidForFloor picks never move (R1). */
export const RAID_ROSTER = [
	"Rat",
	"Cave Rat",
	"Bat",
	"Thornback Tortoise",
	"Goblin",
	"Boar",
	"Humongous Fungus",
	"Orc Shaman",
	"Toad",
	"Snake",
	"Munster",
	"Grorlam",
	"The Many",
] as const;

export const CANARY_DIR = `art-src/otserv/canary-${CANARY_COMMIT}`;
