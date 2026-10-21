import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSortedJson } from "../content/lib/json.ts";
import { runConvert } from "./convert.ts";
import { regionBox } from "./convertIo.ts";
import { type AppearanceFlags, loadIndex } from "./flags.ts";
import { streamOtbm } from "./otbm.ts";
import { MAP_SOURCES, REGIONS, type RegionDef } from "./regions.ts";

/** Facts-only flag table: every item id on a shipped map, with only the flags the .bin build reads. */
export const TILE_FLAGS = "scripts/map/tile-flags.json";
const TABLE_KEYS = [
	"bank",
	"fullbank",
	"take",
	"unpass",
	"unsight",
	"waypoints",
] as const;

export function shippedRegions(): RegionDef[] {
	return REGIONS.filter(
		(row: RegionDef) => row.adventure && !row.authoringTest,
	);
}

/** Authoring only: needs the client flag index, which never goes in the GPL kit. */
export function makeTileFlags(
	root: string,
	clientIndex: string,
	otbm?: string,
): string {
	const index = loadIndex(clientIndex);
	const ids = new Set<number>();
	for (const region of shippedRegions()) {
		streamOtbm(
			otbm ?? join(root, MAP_SOURCES[region.source]),
			regionBox(region),
			(_x, _y, _z, items) => {
				for (const item of items) ids.add(item.id);
			},
		);
	}
	const lines: string[] = [];
	for (const id of [...ids].sort((a, b) => a - b)) {
		const all = index.get(id);
		if (!all) continue;
		const flags: AppearanceFlags = {};
		for (const key of TABLE_KEYS) {
			if (all[key]) Object.assign(flags, { [key]: all[key] });
		}
		lines.push(`"${id}":${JSON.stringify({ flags })}`);
	}
	return `{\n${lines.join(",\n")}\n}\n`;
}

export function compareFloors(builtDir: string, shippedDir: string): string[] {
	const bad: string[] = [];
	for (const region of shippedRegions()) {
		const rel = `${region.tower}/${region.id}`;
		const bin = readFileSync(join(builtDir, `${rel}.bin`));
		if (!bin.equals(readFileSync(join(shippedDir, `${rel}.bin`)))) {
			bad.push(`${rel}.bin`);
		}
		const shipped = JSON.parse(
			readFileSync(join(shippedDir, `${rel}.json`), "utf8"),
		) as Record<string, unknown>;
		// `visual` is the sprite atlas layout, built from client art outside this kit.
		delete shipped.visual;
		if (
			readFileSync(join(builtDir, `${rel}.json`), "utf8") !==
			encodeSortedJson(shipped)
		) {
			bad.push(`${rel}.json`);
		}
	}
	return bad;
}

/** Converts every shipped map with only Canary inputs and the flag table; returns the files that differ. */
export function rebuildFloors(
	root: string,
	outDir: string,
	shippedDir: string,
	otbm?: string,
): string[] {
	for (const region of shippedRegions()) {
		runConvert({
			root,
			otbm,
			regionId: region.id,
			outDir,
			indexPath: join(root, TILE_FLAGS),
			dataOnly: true,
			noPools: true,
		});
	}
	return compareFloors(outDir, shippedDir);
}

function arg(argv: string[], name: string): string | undefined {
	const at = argv.indexOf(name);
	return at >= 0 ? argv[at + 1] : undefined;
}

function main(argv: string[]): void {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
	const otbm = arg(argv, "--otbm");
	if (argv.includes("--make-table")) {
		const client =
			arg(argv, "--index") ?? join(root, "art-src/tibia/index-objects.json");
		writeFileSync(join(root, TILE_FLAGS), makeTileFlags(root, client, otbm));
		console.log(`rebuild-floors: wrote ${TILE_FLAGS}`);
		return;
	}
	const outDir = resolve(
		arg(argv, "--out") ?? join(root, ".tmp/rebuilt-floors"),
	);
	const shippedDir = join(
		root,
		existsSync(join(root, "public/floors")) ? "public/floors" : "floors",
	);
	const bad = rebuildFloors(root, outDir, shippedDir, otbm && resolve(otbm));
	if (bad.length) {
		console.error(
			`rebuild-floors: differs from ${shippedDir}: ${bad.join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		`rebuild-floors: ${shippedRegions().length} maps match ${shippedDir} (.bin byte for byte, .json apart from "visual")`,
	);
}

const entry = process.argv[1];
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2));
}
