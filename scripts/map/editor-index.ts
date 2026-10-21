import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARY_DIR } from "../content/config.ts";
import { writeSortedJson } from "../content/lib/json.ts";
import { collectOutfits, defaultOutfitDirs } from "./editor-index-outfits.ts";
import {
	allocSector,
	CLASSIC_WINDOW,
	sectorKey,
	sectorOrigin,
	writeCell,
	writeSectorFiles,
} from "./editor-index-sectors.ts";
import {
	collectXmlHits,
	loadMonsterCatalog,
	type SearchHit,
	sortHits,
	spawnDensityOf,
} from "./editor-index-xml.ts";
import { classifyTile, type IndexMap, loadIndex, tileFlags } from "./flags.ts";
import { type OtbmItem, streamOtbm } from "./otbm.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OTBM = resolve(ROOT, "art-src/otserv/otservbr.otbm");
const DEFAULT_XML = resolve(ROOT, CANARY_DIR, "data-otservbr-global/world");
const DEFAULT_OUT = resolve(ROOT, "tools/region-editor/.cache");

type SourcePin = { otbmSha256: string; otbmBytes: number };

export function loadSourcePin(root: string = ROOT): SourcePin {
	const raw = JSON.parse(
		readFileSync(resolve(root, "scripts/content/SOURCE.json"), "utf8"),
	) as SourcePin;
	return raw;
}

export function flagArg(
	argv: readonly string[],
	name: string,
): string | undefined {
	const i = argv.indexOf(name);
	if (i < 0) return undefined;
	const value = argv[i + 1];
	return value && !value.startsWith("--") ? value : undefined;
}

export function assertWorldPin(
	otbmPath: string,
	pin: SourcePin = loadSourcePin(),
): void {
	if (!existsSync(otbmPath)) throw new Error(`OTBM missing: ${otbmPath}`);
	const buf = readFileSync(otbmPath);
	const sha = createHash("sha256").update(buf).digest("hex");
	if (sha !== pin.otbmSha256) {
		throw new Error(`otbmSha256 mismatch: got ${sha} want ${pin.otbmSha256}`);
	}
}

function assertOutDir(outDir: string): void {
	const resolved = resolve(outDir);
	const banned = [`${sep}dist`, `${sep}public`];
	for (const token of banned) {
		if (resolved.includes(`${token}${sep}`) || resolved.endsWith(token)) {
			throw new Error(`refuse cache write under ${token.slice(1)}`);
		}
	}
}

function appearanceIndex(): IndexMap | undefined {
	try {
		return loadIndex();
	} catch {
		return undefined;
	}
}

function tileIds(
	items: OtbmItem[],
	index?: IndexMap,
): { ground: number; overlay: number } {
	return classifyTile(items, index);
}

export function main(argv: string[] = process.argv.slice(2)): void {
	const otbmFlag = flagArg(argv, "--otbm");
	const xmlFlag = flagArg(argv, "--xml-dir");
	const outFlag = flagArg(argv, "--out");
	const luaFlag = flagArg(argv, "--lua-dir");
	const outDir = outFlag ? resolve(outFlag) : DEFAULT_OUT;
	assertOutDir(outDir);
	if (argv.includes("--outfits-only")) {
		const dirs = luaFlag ? [resolve(luaFlag)] : defaultOutfitDirs(ROOT);
		writeSortedJson(joinOut(outDir, "outfits.json"), collectOutfits(dirs));
		return;
	}
	const otbmPath = otbmFlag ? resolve(otbmFlag) : DEFAULT_OTBM;
	if (!otbmFlag) assertWorldPin(otbmPath);
	const xmlDir = xmlFlag ? resolve(xmlFlag) : DEFAULT_XML;

	const index = appearanceIndex();
	const sectors = new Map<string, Buffer>();
	const otbmHits: SearchHit[] = [];
	streamOtbm(
		otbmPath,
		null,
		(_tx, _ty, _tz, items, _flags) => {
			const { bx, by } = sectorOrigin(_tx, _ty);
			const key = sectorKey(_tz, bx, by);
			let buf = sectors.get(key);
			if (!buf) {
				buf = allocSector();
				sectors.set(key, buf);
			}
			const { ground, overlay } = tileIds(items, index);
			const flags = tileFlags(
				items.map((item) => ({ id: item.id, teleDest: Boolean(item.dest) })),
				{ index },
			);
			writeCell(buf, _tx, _ty, ground, overlay, flags.walk, flags.speed);
		},
		{
			onTown: (town) => {
				otbmHits.push({
					kind: "town",
					name: town.name,
					x: town.x,
					y: town.y,
					z: town.z,
				});
			},
			onWaypoint: (waypoint) => {
				otbmHits.push({
					kind: "waypoint",
					name: waypoint.name,
					x: waypoint.x,
					y: waypoint.y,
					z: waypoint.z,
				});
			},
		},
	);

	const catalog = loadMonsterCatalog(ROOT);
	const hits = sortHits([...otbmHits, ...collectXmlHits(xmlDir, catalog)]);
	const occupiedSectors = writeSectorFiles(outDir, sectors);
	const otbmBuf = readFileSync(otbmPath);
	writeSortedJson(joinOut(outDir, "search.json"), hits);
	writeSortedJson(
		joinOut(outDir, "known-monsters.json"),
		[...catalog].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
	);
	writeSortedJson(joinOut(outDir, "meta.json"), {
		classicWindow: CLASSIC_WINDOW,
		occupiedSectors,
		otbmBytes: otbmBuf.length,
		otbmSha256: createHash("sha256").update(otbmBuf).digest("hex"),
		spawnDensity: spawnDensityOf(hits),
	});
	writeColorTiles(outDir, flagArg(argv, "--lut"));
}

function writeColorTiles(outDir: string, lut?: string): void {
	const script = resolve(ROOT, "scripts/map/editor-index-color.py");
	const args = [script, "--cache", outDir];
	if (lut) args.push("--lut", resolve(lut));
	const pillow = spawnSync("python3", ["-c", "import PIL"], {
		encoding: "utf8",
	});
	if (pillow.status !== 0) {
		if (lut) {
			throw new Error("colour tiles failed (python3 + Pillow required)");
		}
		return;
	}
	const result = spawnSync("python3", args, { encoding: "utf8" });
	if (result.status === 0) return;
	throw new Error(
		result.stderr ||
			result.stdout ||
			"colour tiles failed (python3 + Pillow required)",
	);
}

function joinOut(outDir: string, name: string): string {
	return resolve(outDir, name);
}

const invoked =
	Boolean(process.argv[1]) &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
	try {
		main();
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
}
