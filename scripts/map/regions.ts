import type { RegionShape } from "./shapes.ts";

export const MAP_SOURCES = {
	otservbr: "art-src/otserv/otservbr.otbm",
} as const;

export type RegionExit = {
	x: number;
	y: number;
	kind: string;
};

export type RegionDef = {
	id: string;
	displayName: string;
	tower: "earth" | "ice" | "fire" | "energy";
	source: keyof typeof MAP_SOURCES;
	z: number;
	shape: RegionShape;
	difficulty: number;
	spawnOverrides: readonly string[];
	exits: readonly RegionExit[];
	authoringTest?: boolean;
	pool?: boolean;
	/** Listed in ADVENTURE_REGIONS; every map after the adventure's first downloads instead of shipping in the precache. */
	adventure?: "rookgaard";
	opennessWaiver?: string;
	openness?: { minLargest: number; maxObstacle: number; minOpening: number };
	/** Boss- or escape-only map: skips the 2-zone gate. */
	zonesWaiver?: string;
	/** Region-local start tile; default: the walkable tile nearest the centroid. */
	start?: { x: number; y: number };
	/** Ground ids, as inclusive [from, to] ranges, walkable here at `speed` though the client marks them unpass. */
	slowGround?: { ids: readonly (readonly [number, number])[]; speed: number };
};

export const REGIONS = [
	{
		id: "al-dee-rat-cave",
		displayName: "Al Dee Rat Cave",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "rect", x: 32056, y: 32176, w: 60, h: 60 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		pool: true,
		adventure: "rookgaard",
		opennessWaiver:
			"Al Dee cave under shop 32063,32182,7: 60x60 at 32056,32176,z=8 has 624 reachable tiles and 23 zones; rock fails opening-ratio and obstacle-ratio. Owner will confirm the exact cave.",
		// Walls block sight: the centroid tile 26,37 is a pocket that sees 6 tiles; this junction sees 42.
		start: { x: 35, y: 34 },
	},
	{
		id: "void-test",
		displayName: "Void Test",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "rect", x: 100, y: 200, w: 16, h: 16 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		authoringTest: true,
	},
	{
		id: "void-circle",
		displayName: "Void Circle",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "circle", cx: 105, cy: 206, r: 5 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		authoringTest: true,
	},
	{
		id: "void-paint",
		displayName: "Void Paint",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: {
			kind: "paint",
			base: { kind: "circle", cx: 105, cy: 206, r: 3 },
			add: [
				[108, 206],
				[109, 206],
			],
			remove: [[105, 206]],
		},
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		authoringTest: true,
	},
	{
		id: "void-mask",
		displayName: "Void Mask",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: {
			kind: "mask",
			path: "tests/fixtures/map/mask-plus.pbm",
			x: 105,
			y: 205,
		},
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		authoringTest: true,
	},
	{
		adventure: "rookgaard",
		difficulty: 1,
		displayName: "Stone Sewer",
		exits: [],
		id: "rats-stone",
		opennessWaiver:
			"Stone sewer under the south village (Lily's shop 32066,32225,7), ellipse rx27 ry17 at 32054,32241,z=8: 197 reachable tiles and 10 zones; rock fails opening-ratio (0.33) and obstacle-ratio (0.90).",
		shape: {
			cx: 32054,
			cy: 32241,
			kind: "ellipse",
			rx: 27,
			ry: 17,
		},
		source: "otservbr",
		spawnOverrides: [],
		tower: "earth",
		z: 8,
	},
	{
		id: "bug-cave",
		displayName: "Bug Cave",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "rect", x: 32050, y: 32140, w: 48, h: 30 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Bug cave north of the village, 48x30 at 32050,32140,z=8: 183 reachable tiles and 8 zones; rock fills 87% of the box (obstacle-ratio) and no ladder touches the reachable cave.",
	},
	{
		id: "west-swamp",
		displayName: "West Swamp",
		tower: "earth",
		source: "otservbr",
		z: 7,
		shape: { kind: "rect", x: 31986, y: 32140, w: 76, h: 48 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		// Swamp hazard: the Canary swamp grounds, wadeable at the waypoints of the walkable swamp item 6352.
		slowGround: {
			ids: [
				[4680, 4701],
				[4738, 4744],
			],
			speed: 200,
		},
	},
	{
		id: "spider-fields",
		displayName: "Spider Fields",
		tower: "earth",
		source: "otservbr",
		z: 7,
		shape: { kind: "rect", x: 32044, y: 32082, w: 56, h: 50 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Northern spider fields, 56x50 at 32044,32082,z=7: 1447 reachable tiles and 24 zones; trees and rocks fill 48% of the box (obstacle-ratio, gate 45%).",
	},
	{
		id: "spider-lair",
		displayName: "Spider Lair",
		tower: "earth",
		source: "otservbr",
		z: 9,
		shape: { kind: "rect", x: 32000, y: 32094, w: 50, h: 30 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Spider Lair, 50x30 at 32000,32094,z=9: 525 reachable tiles and 4 zones; rock fills 65% of the box (obstacle-ratio).",
	},
	{
		id: "spider-queen-lair",
		displayName: "Spider Queen's Lair",
		tower: "earth",
		source: "otservbr",
		z: 12,
		shape: { kind: "rect", x: 31998, y: 32072, w: 26, h: 30 },
		difficulty: 1,
		spawnOverrides: [],
		// The walkable tile beside each of the 16 Spider Queen webs; the webs sit on wall tiles.
		exits: [
			{ x: 13, y: 5, kind: "web" },
			{ x: 9, y: 5, kind: "web" },
			{ x: 8, y: 6, kind: "web" },
			{ x: 17, y: 7, kind: "web" },
			{ x: 18, y: 7, kind: "web" },
			{ x: 7, y: 8, kind: "web" },
			{ x: 22, y: 9, kind: "web" },
			{ x: 4, y: 10, kind: "web" },
			{ x: 4, y: 12, kind: "web" },
			{ x: 22, y: 11, kind: "web" },
			{ x: 4, y: 14, kind: "web" },
			{ x: 4, y: 16, kind: "web" },
			{ x: 5, y: 20, kind: "web" },
			{ x: 7, y: 21, kind: "web" },
			{ x: 10, y: 22, kind: "web" },
			{ x: 18, y: 24, kind: "web" },
		],
		adventure: "rookgaard",
		opennessWaiver:
			"Spider Queen lair, 26x30 at 31998,32072,z=12: one open room of 310 tiles (opening 0.96, clearance 3); rock fills 60% of the box (obstacle-ratio).",
	},
	{
		id: "east-wilderness",
		displayName: "East Wilderness",
		tower: "earth",
		source: "otservbr",
		z: 7,
		shape: { kind: "rect", x: 32104, y: 32128, w: 76, h: 70 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
	},
	{
		id: "wolf-den",
		displayName: "Wolf Den",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "rect", x: 32148, y: 32098, w: 36, h: 28 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Wolf den, 36x28 at 32148,32098,z=8: 227 reachable tiles and 7 zones; rock fills 78% of the box (obstacle-ratio).",
	},
	{
		id: "troll-cave",
		displayName: "Troll Cave",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "rect", x: 32066, y: 32075, w: 73, h: 68 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Troll cave with the northern-ruins tunnel, 73x68 at 32066,32075,z=8: 933 reachable tiles and 13 zones; rock fills 81% of the box (obstacle-ratio).",
		// Walls block sight: the centroid tile 36,33 sees 16 tiles; this one sees 48.
		start: { x: 33, y: 34 },
	},
	{
		id: "orc-fortress",
		displayName: "Orc Fortress",
		tower: "earth",
		source: "otservbr",
		z: 7,
		shape: { kind: "rect", x: 31958, y: 32130, w: 40, h: 44 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
	},
	{
		id: "orc-dungeon",
		displayName: "Orc Dungeon",
		tower: "earth",
		source: "otservbr",
		z: 8,
		shape: { kind: "rect", x: 31966, y: 32146, w: 30, h: 38 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Orc dungeon under the fortress, 30x38 at 31966,32146,z=8: 351 reachable tiles and 4 zones; rock fills 69% of the box (obstacle-ratio).",
	},
	{
		id: "kraknaknork-lair",
		displayName: "Kraknaknork's Lair",
		tower: "earth",
		source: "otservbr",
		z: 10,
		shape: { kind: "rect", x: 31926, y: 32163, w: 22, h: 16 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Kraknaknork room, 22x16 at 31926,32163,z=10: 101 reachable tiles; rock fails opening-ratio (0.47) and obstacle-ratio (0.71). Boss stage only.",
		zonesWaiver:
			"Boss stage: the room has no spawns; the stage script brings Kraknaknork and his summon.",
	},
	{
		id: "wolf-maze",
		displayName: "Wolf Maze",
		tower: "earth",
		source: "otservbr",
		z: 10,
		shape: { kind: "rect", x: 32096, y: 32046, w: 38, h: 50 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Wolf maze on the way down to Minotaur Hell, 38x50 at 32096,32046,z=10: 394 reachable tiles and 10 zones; 1-tile corridors fail opening-ratio (0.26) and obstacle-ratio (0.79).",
		// Walls block sight: the centroid tile 20,25 sees 18 tiles; this one sees 46.
		start: { x: 13, y: 18 },
	},
	{
		id: "minotaur-hell",
		displayName: "Minotaur Hell",
		tower: "earth",
		source: "otservbr",
		z: 11,
		shape: { kind: "rect", x: 32108, y: 32042, w: 34, h: 30 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Minotaur Hell, 34x30 at 32108,32042,z=11: 266 reachable tiles and 9 zones; rock fills 74% of the box (obstacle-ratio).",
	},
	{
		id: "minotaur-hell-quest",
		displayName: "Minotaur Hell",
		tower: "earth",
		source: "otservbr",
		z: 12,
		shape: { kind: "rect", x: 32116, y: 32048, w: 24, h: 24 },
		difficulty: 1,
		spawnOverrides: [],
		exits: [],
		adventure: "rookgaard",
		opennessWaiver:
			"Minotaur Hell quest room, 24x24 at 32116,32048,z=12: 154 reachable tiles and 6 zones; rock fills 73% of the box (obstacle-ratio).",
	},
] as const satisfies RegionDef[];

export function regionById(id: string): RegionDef | undefined {
	return REGIONS.find((row) => row.id === id);
}
