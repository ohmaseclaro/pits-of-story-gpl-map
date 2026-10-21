import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CANARY_DIR } from "../content/config.ts";
import type { LuaValue } from "../content/lib/luaTable.ts";
import { parseMonsterLua } from "../content/lib/luaTable.ts";
import { parseShops } from "../content/parse-shops.ts";

export type EditorOutfit = {
	lookType: number;
	lookTypeEx?: number;
	lookHead: number;
	lookBody: number;
	lookLegs: number;
	lookFeet: number;
};

function numField(obj: Record<string, LuaValue>, keys: string[]): number {
	for (const key of keys) {
		const value = obj[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return 0;
}

function outfitFromTable(outfit: LuaValue | undefined): EditorOutfit {
	if (!outfit || typeof outfit !== "object" || Array.isArray(outfit)) {
		return { lookType: 0, lookHead: 0, lookBody: 0, lookLegs: 0, lookFeet: 0 };
	}
	const rec = outfit as Record<string, LuaValue>;
	const look: EditorOutfit = {
		lookType: numField(rec, ["lookType", "looktype"]),
		lookHead: numField(rec, ["lookHead", "head"]),
		lookBody: numField(rec, ["lookBody", "body"]),
		lookLegs: numField(rec, ["lookLegs", "legs"]),
		lookFeet: numField(rec, ["lookFeet", "feet"]),
	};
	const ex = numField(rec, ["lookTypeEx", "looktypeex"]);
	if (ex > 0) look.lookTypeEx = ex;
	return look;
}

export function parseMonsterLook(
	source: string,
): { name: string; outfit: EditorOutfit } | null {
	try {
		const parsed = parseMonsterLua(source);
		if (!parsed.name) return null;
		return { name: parsed.name, outfit: outfitFromTable(parsed.outfit) };
	} catch {
		return null;
	}
}

export function parseNpcLook(
	source: string,
): { name: string; outfit: EditorOutfit } | null {
	const shops = parseShops(source);
	const shop = shops[0];
	if (shop?.npc) {
		return {
			name: shop.npc,
			outfit: {
				lookType: shop.outfit.lookType,
				lookHead: shop.outfit.head,
				lookBody: shop.outfit.body,
				lookLegs: shop.outfit.legs,
				lookFeet: shop.outfit.feet,
			},
		};
	}
	const name =
		/internalNpcName\s*=\s*"([^"]+)"/.exec(source)?.[1] ??
		/createNpcType\s*\(\s*"([^"]+)"/.exec(source)?.[1] ??
		"";
	if (!name) return null;
	const block =
		/npcConfig\.outfit\s*=\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? "";
	if (!block) return null;
	const num = (keys: string[]): number => {
		for (const key of keys) {
			const hit = new RegExp(`\\b${key}\\s*=\\s*(-?\\d+)`, "i").exec(block);
			if (hit) return Number(hit[1]);
		}
		return 0;
	};
	const look: EditorOutfit = {
		lookType: num(["lookType", "looktype"]),
		lookHead: num(["lookHead", "head"]),
		lookBody: num(["lookBody", "body"]),
		lookLegs: num(["lookLegs", "legs"]),
		lookFeet: num(["lookFeet", "feet"]),
	};
	const ex = num(["lookTypeEx"]);
	if (ex > 0) look.lookTypeEx = ex;
	return { name, outfit: look };
}

function walkLua(dir: string, out: string[]): void {
	if (!existsSync(dir)) return;
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, ent.name);
		if (ent.isDirectory()) walkLua(path, out);
		else if (ent.name.endsWith(".lua")) out.push(path);
	}
}

export function defaultOutfitDirs(root: string): string[] {
	const base = join(root, CANARY_DIR, "data-otservbr-global");
	return [join(base, "monster"), join(base, "npc")];
}

export function collectOutfits(
	luaDirs: readonly string[],
): Record<string, EditorOutfit> {
	const out: Record<string, EditorOutfit> = {};
	for (const dir of luaDirs) {
		const files: string[] = [];
		walkLua(dir, files);
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			const monster = parseMonsterLook(source);
			if (monster) {
				out[monster.name] = monster.outfit;
				continue;
			}
			const npc = parseNpcLook(source);
			if (npc) out[npc.name] = npc.outfit;
		}
	}
	return out;
}
