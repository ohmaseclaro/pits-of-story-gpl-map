import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BelowStack } from "./below.ts";
import { lookupFlags } from "./convertIo.ts";
import type { AppearanceFlags, IndexMap } from "./flags.ts";
import { hideFloorTravelVisual } from "./visuals.ts";

export type TileStack = { x: number; y: number; ids: number[] };

export type RegionStacks = {
	ox: number;
	oy: number;
	z: number;
	w: number;
	h: number;
	tiles: TileStack[];
	below?: BelowStack[];
};

export type RegionVisual = {
	v: number;
	w?: number;
	h?: number;
	frames: string[];
	grid?: string[];
	tile: number[];
	n: number[];
	f: number[];
	c: number[];
	sx: number[];
	sy: number[];
	el: number[];
	ph: number[];
	ms: number[];
	durs: number[][];
	below?: {
		d: number[];
		t: number[];
		n: number[];
		f: number[];
		sx: number[];
		sy: number[];
		el: number[];
		ph: number[];
		ms: number[];
	};
};

export function pushVisibleId(
	ids: number[],
	itemId: number,
	found: AppearanceFlags | undefined,
	floorchangeSet: ReadonlySet<number>,
	name: string,
): void {
	if (!found) return;
	if (hideFloorTravelVisual(itemId, floorchangeSet, name)) return;
	ids.push(itemId);
}

export function collectTileIds(
	items: readonly { id: number }[],
	index: IndexMap,
	floorchangeSet: ReadonlySet<number>,
	itemNames: ReadonlyMap<number, string>,
): number[] {
	const ids: number[] = [];
	for (const item of items) {
		pushVisibleId(
			ids,
			item.id,
			lookupFlags(index, item.id),
			floorchangeSet,
			itemNames.get(item.id) ?? "",
		);
	}
	return ids;
}

export function fillHiddenGrounds(
	stacks: TileStack[],
	visGround: Uint32Array,
	w: number,
	index: IndexMap,
): void {
	for (const t of stacks) {
		const g = visGround[t.y * w + t.x] ?? 0;
		if (!g) continue;
		const hasGround = t.ids.some((id) => {
			const f = lookupFlags(index, id);
			return Boolean(f?.bank || f?.fullbank);
		});
		if (!hasGround) t.ids.unshift(g);
	}
}

export function writeStacksJson(path: string, stacks: RegionStacks): void {
	writeFileSync(path, `${JSON.stringify(stacks)}\n`);
}

export function readVisualJson(path: string): RegionVisual | undefined {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8")) as RegionVisual;
}

export function packAtlasWithStacks(
	root: string,
	destPrefix: string,
	ids: number[],
	stacks: RegionStacks,
): RegionVisual | undefined {
	const library = join(root, "art-src/tibia/library");
	const client = join(root, "art-src/tibia/client");
	const script = join(root, "scripts/map/pack-region-atlas.py");
	const stacksPath = `${destPrefix}-stacks.json`;
	writeStacksJson(stacksPath, stacks);
	const python = process.env.PYTHON ?? "python3";
	const args = [
		script,
		"--library",
		library,
		"--client",
		client,
		"--ids",
		ids.join(","),
		"--out",
		destPrefix,
	];
	if (existsSync(join(client, "appearances.dat"))) {
		args.push("--stacks", stacksPath);
	}
	const result = spawnSync(python, args, { encoding: "utf8" });
	try {
		unlinkSync(stacksPath);
	} catch {
		/* keep on pack fail for debug */
	}
	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || "pack-region-atlas failed",
		);
	}
	const visualPath = `${destPrefix}-visual.json`;
	const visual = readVisualJson(visualPath);
	try {
		unlinkSync(visualPath);
	} catch {
		/* optional sidecar */
	}
	return visual;
}
