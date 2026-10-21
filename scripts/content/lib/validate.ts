import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Warn = (file: string, line: number | null, message: string) => void;

let outfits: Set<string> | null = null;
let objects: Set<string> | null = null;

function idSet(path: string): Set<string> {
	if (!existsSync(path)) return new Set();
	const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	return new Set(Object.keys(raw));
}

function loadOutfits(root: string): Set<string> {
	outfits ??= idSet(join(root, "art-src/tibia/index-outfits.json"));
	return outfits;
}

function loadObjects(root: string): Set<string> {
	objects ??= idSet(join(root, "art-src/tibia/index-objects.json"));
	return objects;
}

/** D-12: unknown lookType warns and is dropped. */
export function validateLookType(
	root: string,
	lookType: number,
	file: string,
	warn: Warn,
): boolean {
	if (loadOutfits(root).has(String(lookType))) return true;
	warn(file, null, `unknown lookType ${lookType}`);
	return false;
}

/** D-12: unknown item id warns and is dropped. */
export function validateItemId(
	root: string,
	id: number,
	file: string,
	warn: Warn,
): boolean {
	if (loadObjects(root).has(String(id))) return true;
	warn(file, null, `unknown item id ${id}`);
	return false;
}

/** Unknown names in config.ts are build errors (05-02). */
export function requireConfiguredName(
	kind: string,
	name: string,
	present: boolean,
): void {
	if (!present) throw new Error(`unknown ${kind} name: ${name}`);
}
