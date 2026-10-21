import type { ContentStep } from "../lib/ctx.ts";
import { enums } from "./enums.ts";
import { hub } from "./hub.ts";
import { items } from "./items.ts";
import { loot } from "./loot.ts";
import { monsters } from "./monsters.ts";
import { packOutfits } from "./pack-outfits.ts";
import { phase4 } from "./phase4.ts";
import { spawns } from "./spawns.ts";
import { waves } from "./waves.ts";

export const STEPS: ContentStep[] = [
	enums,
	items,
	monsters,
	spawns,
	phase4,
	waves,
	loot,
	hub,
	packOutfits,
];
