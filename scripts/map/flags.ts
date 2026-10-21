import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AppearanceFlags = {
	bank?: boolean;
	fullbank?: boolean;
	unpass?: boolean;
	take?: boolean;
	unsight?: boolean;
	avoid?: boolean;
	hang?: boolean;
	waypoints?: number;
	clip?: boolean;
	height?: number;
};

export type TileItem = {
	id?: number;
	flags?: AppearanceFlags;
	teleDest?: boolean;
	dest?: { x: number; y: number; z: number };
};

export type IndexMap =
	| ReadonlyMap<number, AppearanceFlags>
	| Readonly<Record<string, AppearanceFlags | { flags?: AppearanceFlags }>>;

export type TileFlagResult = {
	walk: boolean;
	exit: boolean;
	decor: boolean;
	speed: number;
	/** Some item stops missiles (Canary items.cpp: blockProjectile = flags.unsight). */
	unsight: boolean;
};

export type TileFlagOpts = {
	index?: IndexMap;
	floorchangeSet?: ReadonlySet<number>;
	inBounds?: boolean;
	teleDest?: boolean;
	onUnknown?: (id: number) => void;
	/** These ground ids are walkable at `speed`, whatever the client says (RegionDef.slowGround). */
	slowGround?: { ids: ReadonlySet<number>; speed: number };
};

export type UnknownHandler = (id: number) => void;

export const TEST_FLOORCHANGE_IDS: ReadonlySet<number> = new Set([166, 167]);
export const DEFAULT_GROUND_SPEED = 100;

const DEFAULT_INDEX = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../art-src/tibia/index-objects.json",
);

const indexCache = new Map<string, Map<number, AppearanceFlags>>();

function asFlags(entry: unknown): AppearanceFlags {
	if (!entry || typeof entry !== "object") {
		return {};
	}
	const rec = entry as { flags?: AppearanceFlags };
	if (rec.flags && typeof rec.flags === "object") {
		return rec.flags;
	}
	return entry as AppearanceFlags;
}

function lookup(index: IndexMap, id: number): AppearanceFlags | undefined {
	if (index instanceof Map) {
		return index.has(id) ? asFlags(index.get(id)) : undefined;
	}
	const key = String(id);
	if (Object.hasOwn(index, key)) {
		return asFlags(
			(index as Record<string, AppearanceFlags | { flags?: AppearanceFlags }>)[
				key
			],
		);
	}
	return undefined;
}

function resolveStack(
	items: readonly TileItem[],
	index?: IndexMap,
	onUnknown?: UnknownHandler,
): AppearanceFlags[] {
	const out: AppearanceFlags[] = [];
	for (const item of items) {
		if (item.flags) {
			out.push(item.flags);
			continue;
		}
		if (item.id == null) {
			continue;
		}
		if (index) {
			const found = lookup(index, item.id);
			if (found) {
				out.push(found);
				continue;
			}
			onUnknown?.(item.id);
			continue;
		}
		onUnknown?.(item.id);
	}
	return out;
}

function hasGround(flags: AppearanceFlags): boolean {
	return Boolean(flags.bank || flags.fullbank);
}

function isBlocked(flags: AppearanceFlags): boolean {
	return Boolean(flags.unpass);
}

function itemIsDecor(flags: AppearanceFlags): boolean {
	return !flags.unpass && !flags.take && !flags.bank && !flags.fullbank;
}

function waypointsOf(flags: AppearanceFlags): number | undefined {
	const n = flags.waypoints;
	return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function stackWalkable(stack: readonly AppearanceFlags[]): boolean {
	let ground = false;
	let blocked = false;
	for (const flags of stack) {
		if (hasGround(flags)) {
			ground = true;
		}
		if (isBlocked(flags)) {
			blocked = true;
		}
	}
	return ground && !blocked;
}

function stackGroundSpeed(stack: readonly AppearanceFlags[]): number {
	for (const flags of stack) {
		if (!hasGround(flags)) {
			continue;
		}
		return waypointsOf(flags) ?? DEFAULT_GROUND_SPEED;
	}
	return DEFAULT_GROUND_SPEED;
}

function stackIsDecor(stack: readonly AppearanceFlags[]): boolean {
	return stack.length > 0 && stack.some(itemIsDecor);
}

export function classifyTile(
	items: readonly { id?: number }[],
	index?: IndexMap,
): { ground: number; overlay: number } {
	if (!index) {
		return {
			ground: items[0]?.id ?? 0xffff,
			overlay: items[1]?.id ?? 0xffff,
		};
	}
	let ground = 0xffff;
	let overlay = 0xffff;
	for (const item of items) {
		if (item.id == null) continue;
		const found = lookup(index, item.id);
		if (!found) continue;
		if ((found.bank || found.fullbank) && ground === 0xffff) ground = item.id;
		if (!found.bank && !found.fullbank && !found.take) overlay = item.id;
	}
	return { ground, overlay };
}

export function loadIndex(
	path: string = DEFAULT_INDEX,
): Map<number, AppearanceFlags> {
	const resolved = resolve(path);
	const hit = indexCache.get(resolved);
	if (hit) {
		return hit;
	}
	const raw = JSON.parse(readFileSync(resolved, "utf8")) as Record<
		string,
		{ flags?: AppearanceFlags }
	>;
	const map = new Map<number, AppearanceFlags>();
	for (const [key, rec] of Object.entries(raw)) {
		const id = Number(key);
		if (!Number.isFinite(id)) {
			continue;
		}
		map.set(id, rec?.flags ?? {});
	}
	indexCache.set(resolved, map);
	return map;
}

export function walkable(
	items: readonly TileItem[],
	index?: IndexMap,
	onUnknown?: UnknownHandler,
): boolean {
	return stackWalkable(resolveStack(items, index, onUnknown));
}

export function groundSpeed(
	items: readonly TileItem[],
	index?: IndexMap,
	onUnknown?: UnknownHandler,
): number {
	return stackGroundSpeed(resolveStack(items, index, onUnknown));
}

export function isDecor(
	items: readonly TileItem[],
	index?: IndexMap,
	onUnknown?: UnknownHandler,
): boolean {
	return stackIsDecor(resolveStack(items, index, onUnknown));
}

export function isExitId(
	id: number,
	floorchangeSet: ReadonlySet<number>,
): boolean {
	return floorchangeSet.has(id);
}

function slowItem(
	item: TileItem,
	slow: NonNullable<TileFlagOpts["slowGround"]>,
	index?: IndexMap,
): TileItem {
	if (item.id == null || !slow.ids.has(item.id)) return item;
	const flags = item.flags ?? (index ? lookup(index, item.id) : undefined);
	if (!flags) return item;
	return {
		...item,
		flags: { ...flags, unpass: false, waypoints: slow.speed },
	};
}

export function tileFlags(
	items: readonly TileItem[],
	opts: TileFlagOpts = {},
): TileFlagResult {
	const floorchangeSet = opts.floorchangeSet ?? new Set<number>();
	const inBounds = opts.inBounds !== false;
	let exit = Boolean(opts.teleDest);
	for (const item of items) {
		if (item.teleDest || item.dest) {
			exit = true;
		}
		if (item.id != null && isExitId(item.id, floorchangeSet)) {
			exit = true;
		}
	}
	const slow = opts.slowGround;
	const stack = resolveStack(
		slow ? items.map((item) => slowItem(item, slow, opts.index)) : items,
		opts.index,
		opts.onUnknown,
	);
	const walk = stackWalkable(stack) && inBounds && !exit;
	return {
		walk,
		exit,
		decor: stackIsDecor(stack),
		speed: stackGroundSpeed(stack),
		unsight: stack.some((flags) => Boolean(flags.unsight)),
	};
}

export function loadFloorchangeIds(xmlText: string): Set<number> {
	const ids = new Set<number>();
	const itemRe = /<item\b([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/gi;
	let match = itemRe.exec(xmlText);
	while (match !== null) {
		const attrs = match[1] ?? "";
		const body = match[2] ?? "";
		match = itemRe.exec(xmlText);
		const hasFloorchange = /<attribute\b[^>]*\bkey\s*=\s*"floorchange"/i.test(
			body,
		);
		if (!hasFloorchange) {
			continue;
		}
		const idMatch = /\bid\s*=\s*"(\d+)"/.exec(attrs);
		if (idMatch) {
			ids.add(Number(idMatch[1]));
			continue;
		}
		const fromMatch = /\bfromid\s*=\s*"(\d+)"/.exec(attrs);
		const toMatch = /\btoid\s*=\s*"(\d+)"/.exec(attrs);
		if (fromMatch && toMatch) {
			const from = Number(fromMatch[1]);
			const to = Number(toMatch[1]);
			if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
				continue;
			}
			for (let id = from; id <= to; id++) {
				ids.add(id);
			}
		}
	}
	return ids;
}
