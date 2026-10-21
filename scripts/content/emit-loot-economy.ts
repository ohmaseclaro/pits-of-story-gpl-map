import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ITEM_DEFS } from "../../src/data/items.ts";
import { CONTENT } from "./config.ts";
import type { ContentCtx } from "./lib/ctx.ts";
import { writeJson } from "./lib/json.ts";
import { type LuaValue, parseMonsterLua } from "./luaTable.ts";
import { findMonsterFile } from "./monsters.ts";
import {
	type ImbueTier,
	type ParsedImbuement,
	parseImbuements,
} from "./parse-imbuements.ts";
import { type ParsedShop, parseShops } from "./parse-shops.ts";

export { sortValue as sortKeys } from "./lib/json.ts";
export { writeJson };

export type LootRowIn = {
	id?: number;
	name?: string;
	chance: number;
	maxCount?: number;
};

export type ItemAttr = {
	id: number;
	name: string;
	slot?: string;
	armor?: number;
	weight?: number;
	sell?: number;
};

export type EmitLootEconomyArgs = {
	items: Map<number, ItemAttr>;
	monsters: Array<{ name: string; loot: LootRowIn[] }>;
	shops: ParsedShop[];
	imbuements: ParsedImbuement[];
	outDir: string;
	warn?: (file: string, line: number | null, message: string) => void;
};

const TIERS: readonly ImbueTier[] = ["Basic", "Intricate", "Powerful"];

const EQUIPMENT_NAMES = new Set(ITEM_DEFS.map((d) => d.name.toLowerCase()));

const KNOWN_NAMES: Record<string, number> = {
	"gold coin": 3031,
	cheese: 3607,
};

export function foldOffList(
	loot: readonly LootRowIn[],
	allowList: ReadonlySet<number>,
	sellById: ReadonlyMap<number, number> = new Map(),
): number {
	let folded = 0;
	for (const row of loot) {
		if (row.id != null && allowList.has(row.id)) continue;
		if (row.name && isEquipmentName(row.name)) continue;
		const avg = row.maxCount != null ? (1 + row.maxCount) / 2 : 1;
		const sell = (row.id != null ? sellById.get(row.id) : undefined) ?? 1;
		folded += (row.chance / 100000) * avg * sell;
	}
	return folded;
}

function norm(name: string): string {
	return name.trim().toLowerCase();
}

export function isEquipmentName(name: string): boolean {
	const key = norm(name);
	return EQUIPMENT_NAMES.has(key);
}

function fieldNum(block: string, names: readonly string[]): number | undefined {
	for (const name of names) {
		const match = new RegExp(`\\b${name}\\s*=\\s*(-?\\d+)`, "i").exec(block);
		if (match) return Number(match[1]);
	}
	return undefined;
}

function fieldStr(block: string, names: readonly string[]): string {
	for (const name of names) {
		const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(block);
		if (match) return match[1];
	}
	return "";
}

export function parseMonsterLoot(
	source: string,
): Array<{ name: string; loot: LootRowIn[] }> {
	const name =
		/createMonsterType\s*\(\s*"([^"]+)"\s*\)/.exec(source)?.[1] ??
		fieldStr(source, ["name"]);
	if (!name) return [];
	const lootMatch = /monster\.loot\s*=\s*\{/.exec(source);
	if (!lootMatch) return [{ name, loot: [] }];
	const open = source.indexOf("{", lootMatch.index);
	let depth = 0;
	let close = -1;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) {
				close = i;
				break;
			}
		}
	}
	const block = close < 0 ? "" : source.slice(open + 1, close);
	const loot: LootRowIn[] = [];
	const rowRe = /\{([^{}]*)\}/g;
	for (let row = rowRe.exec(block); row; row = rowRe.exec(block)) {
		const body = row[1];
		const id = fieldNum(body, ["id"]);
		const rowName = fieldStr(body, ["name"]);
		const chance = fieldNum(body, ["chance"]);
		if (chance == null) continue;
		const maxCount = fieldNum(body, ["maxCount", "maxcount"]);
		const entry: LootRowIn = { chance };
		if (id != null) entry.id = id;
		if (rowName) entry.name = rowName;
		if (maxCount != null) entry.maxCount = maxCount;
		loot.push(entry);
	}
	return [{ name, loot }];
}

function failUnknown(kind: string, name: string): never {
	throw new Error(`unknown ${kind} name: ${name}`);
}

export function emitLootEconomy(args: EmitLootEconomyArgs): void {
	const alDee = args.shops.find((shop) => shop.npc === "Al Dee");
	if (!alDee) failUnknown("npc", "Al Dee");
	const vampirism = args.imbuements.filter((row) => row.name === "Vampirism");
	for (const tier of TIERS) {
		if (!vampirism.some((row) => row.tier === tier)) {
			failUnknown("imbuement", `Vampirism ${tier}`);
		}
	}
	if (!args.monsters.some((monster) => monster.name === "Rat")) {
		failUnknown("monster", "Rat");
	}

	const nameToId = new Map<string, number>(Object.entries(KNOWN_NAMES));
	const sellById = new Map<number, number>();
	for (const item of args.items.values()) {
		nameToId.set(norm(item.name), item.id);
		if (item.sell != null) sellById.set(item.id, item.sell);
	}
	for (const shop of args.shops) {
		for (const row of shop.rows) {
			nameToId.set(norm(row.itemName), row.clientId);
			if (row.sell != null) sellById.set(row.clientId, row.sell);
		}
	}

	const allowIds = new Set<number>();
	for (const [name, id] of nameToId) {
		if (isEquipmentName(name)) allowIds.add(id);
	}
	for (const item of args.items.values()) {
		if (item.slot && isEquipmentName(item.name)) allowIds.add(item.id);
	}

	const warned = new Set<string>();
	const monsters = args.monsters
		.map((monster) => {
			const rows = monster.loot.map((row) => {
				const id =
					row.id ?? (row.name ? nameToId.get(norm(row.name)) : undefined);
				const name =
					row.name ??
					(id != null
						? [...nameToId].find(([, n]) => n === id)?.[0]
						: undefined) ??
					`#${id}`;
				const catalogEquip = isEquipmentName(name);
				if (id == null && catalogEquip) {
					return {
						id: -1,
						name,
						chance: row.chance,
						maxCount: row.maxCount,
						inAllowList: true,
					};
				}
				if (id == null && args.warn && !warned.has(name)) {
					warned.add(name);
					args.warn("loot", null, `unresolved loot name: ${name}`);
				}
				return {
					id: id ?? -1,
					name,
					chance: row.chance,
					maxCount: row.maxCount,
					inAllowList: (id != null && allowIds.has(id)) || catalogEquip,
				};
			});
			const foldRows = rows.map((row) => ({
				id: row.id,
				name: row.name,
				chance: row.chance,
				maxCount: row.maxCount,
			}));
			return {
				name: monster.name,
				rows,
				foldedGold:
					Math.round(foldOffList(foldRows, allowIds, sellById) * 1e6) / 1e6,
			};
		})
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	const shops = {
		npcs: args.shops
			.map((shop) => ({
				name: shop.npc,
				voice: shop.voice,
				voices: shop.voices,
				outfit: shop.outfit,
				shop: shop.rows,
			}))
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
	};

	const imbuements = {
		imbuements: args.imbuements
			.filter((row) => (TIERS as readonly string[]).includes(row.tier))
			.sort((a, b) => {
				const byName = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
				if (byName !== 0) return byName;
				return TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
			}),
	};

	writeJson(join(args.outDir, "loot.json"), { monsters });
	writeJson(join(args.outDir, "shops.json"), shops);
	writeJson(join(args.outDir, "imbuements.json"), imbuements);
}

function lootFromLua(loot: LuaValue | undefined): LootRowIn[] {
	const rows: LootRowIn[] = [];
	if (!loot) return rows;
	const list = Array.isArray(loot)
		? loot
		: typeof loot === "object"
			? Object.values(loot)
			: [];
	for (const item of list) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const rec = item as Record<string, LuaValue>;
		const chance = typeof rec.chance === "number" ? rec.chance : 0;
		const row: LootRowIn = { chance };
		if (typeof rec.id === "number") row.id = rec.id;
		if (typeof rec.name === "string") row.name = rec.name;
		if (typeof rec.maxCount === "number") row.maxCount = rec.maxCount;
		if (row.id != null || row.name) rows.push(row);
	}
	return rows;
}

export function prepareLootEconomy(
	ctx: ContentCtx,
): Omit<EmitLootEconomyArgs, "outDir"> {
	const read = (path: string) => readFileSync(path, "utf8");
	const shops = parseShops(
		read(
			ctx.canaryOrFixture(
				"data-otservbr-global/npc/al_dee.lua",
				"al-dee-shop.lua",
			),
		),
	);
	if (!shops.some((shop) => shop.npc === "Al Dee"))
		failUnknown("npc", "Al Dee");

	const imbuements = parseImbuements(
		read(
			ctx.canaryOrFixture("data/XML/imbuements.xml", "imbuements-snippet.xml"),
		),
	);

	const monsters = CONTENT.monsters.map((name) => {
		const parsed = parseMonsterLua(read(findMonsterFile(name, ctx.root)));
		return { name: parsed.name, loot: lootFromLua(parsed.loot) };
	});

	const items = new Map<number, ItemAttr>();
	items.set(3031, { id: 3031, name: "gold coin", sell: 1 });
	items.set(3607, { id: 3607, name: "cheese", sell: 1 });
	const itemCatalog = join(ctx.outDir, "items.json");
	if (existsSync(itemCatalog)) {
		const parsed = JSON.parse(read(itemCatalog)) as Record<
			string,
			{ id?: number; name?: string }
		>;
		for (const row of Object.values(parsed)) {
			if (row && typeof row.id === "number") {
				items.set(row.id, {
					id: row.id,
					name: typeof row.name === "string" ? row.name : String(row.id),
				});
			}
		}
	}

	return { items, monsters, shops, imbuements };
}
