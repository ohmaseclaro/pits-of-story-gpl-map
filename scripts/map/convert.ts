import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARY_DIR } from "../content/config.ts";
import { fnv1a32 } from "../content/lib/fnv1a.ts";
import { encodeSortedJson } from "../content/lib/json.ts";
import { collectBelow } from "./below.ts";
import {
	checkOpenness,
	exitReachable,
	localAppearances,
	modalWalkSpeed,
	opennessMeta,
	regionNotes,
	regionZones,
} from "./convertChecks.ts";
import {
	type ConvertedRegion,
	EMPTY_LOCAL,
	knownMonsterNames,
	lookupFlags,
	regionBox,
	speedHistogram,
	writeBin,
	writeMapReport,
	writePools,
} from "./convertIo.ts";
import {
	collectTileIds,
	fillHiddenGrounds,
	packAtlasWithStacks,
	type RegionStacks,
	type TileStack,
} from "./convertStack.ts";
import {
	DEFAULT_GROUND_SPEED,
	type IndexMap,
	loadFloorchangeIds,
	loadIndex,
	tileFlags,
} from "./flags.ts";
import { diagonalReach, evaluateOpenness } from "./openness.ts";
import { streamOtbm } from "./otbm.ts";
import { loadPbm } from "./pbm.ts";
import { writePreviewPng } from "./preview.ts";
import { MAP_SOURCES, REGIONS, type RegionDef, regionById } from "./regions.ts";
import { rasterize } from "./shapes.ts";
import {
	coversTile,
	fillPlaceholderGround,
	hideFloorTravelVisual,
	isPlaceholderGround,
	loadItemNames,
	visualBox,
} from "./visuals.ts";
import { kindsHistogram } from "./zones.ts";

export { EMPTY_LOCAL };

const MAX_SIDE = 80;

export type ConvertOpts = {
	root: string;
	otbm?: string;
	regionId?: string;
	outDir?: string;
	indexPath?: string;
	itemsXml?: string;
	spawnXml?: string;
	noPools?: boolean;
	/** Editor Build & Play: openness failures warn instead of failing, except for pool regions. */
	playtest?: boolean;
	/** Writes .bin and region JSON without `visual`, preview or REPORT.md: needs no client art (`rebuild-floors.ts`). */
	dataOnly?: boolean;
};

function repoRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function convertOne(
	region: RegionDef,
	opts: ConvertOpts,
	index: IndexMap,
	floorchangeSet: ReadonlySet<number>,
	itemNames: ReadonlyMap<number, string>,
	known: ReadonlySet<string>,
	spawnXml?: string,
): ConvertedRegion {
	const box = regionBox(region);
	if (box.w > MAX_SIDE || box.h > MAX_SIDE) {
		throw new Error(
			`region ${region.id} w/h ${box.w}x${box.h} exceeds ${MAX_SIDE}`,
		);
	}
	const mask = rasterize(region.shape, box.x, box.y, box.w, box.h, loadPbm);
	const n = box.w * box.h;
	const vbox = visualBox(box);
	const vn = vbox.w * vbox.h;
	const groundId = new Uint32Array(n);
	const overlayId = new Uint32Array(n);
	const walk = new Uint8Array(n);
	const speed = new Uint16Array(n);
	// Off-mask and empty tiles stay solid: nothing is drawn there to shoot across.
	const unsight = new Uint8Array(n).fill(1);
	const pz = new Uint8Array(n);
	const detectedExits: { x: number; y: number; kind: string }[] = [];
	const tileStacks: TileStack[] = [];
	const offMask: TileStack[] = [];
	speed.fill(DEFAULT_GROUND_SPEED);
	const visGround = new Uint32Array(vn);
	const unknown = new Set<number>();
	const slowGround = region.slowGround && {
		ids: new Set(
			region.slowGround.ids.flatMap(([from, to]) =>
				Array.from({ length: to - from + 1 }, (_, k) => from + k),
			),
		),
		speed: region.slowGround.speed,
	};
	const otbm = opts.otbm ?? join(opts.root, MAP_SOURCES[region.source]);
	streamOtbm(otbm, vbox, (tx, ty, _tz, items, flags) => {
		const lx = tx - box.x;
		const ly = ty - box.y;
		if (lx < 0 || ly < 0 || lx >= vbox.w || ly >= vbox.h) return;
		const vi = ly * vbox.w + lx;
		for (const item of items) {
			const found = lookupFlags(index, item.id);
			if ((found?.bank || found?.fullbank) && !visGround[vi])
				visGround[vi] = item.id;
		}
		const i = ly * box.w + lx;
		if (lx >= box.w || ly >= box.h || mask[i] !== 1) {
			const ids = collectTileIds(items, index, floorchangeSet, itemNames);
			if (ids.length || items.length) offMask.push({ x: lx, y: ly, ids });
			return;
		}
		if (flags & 1) pz[i] = 1;
		const tf = tileFlags(
			items.map((item) => ({ id: item.id, teleDest: Boolean(item.dest) })),
			{
				index,
				floorchangeSet,
				teleDest: items.some((item) => item.dest),
				inBounds: true,
				onUnknown: (id) => unknown.add(id),
				slowGround,
			},
		);
		walk[i] = tf.walk ? 1 : 0;
		speed[i] = tf.speed;
		unsight[i] = tf.unsight ? 1 : 0;
		if (tf.exit) detectedExits.push({ x: lx, y: ly, kind: "floorchange" });
		const visible = collectTileIds(items, index, floorchangeSet, itemNames);
		if (visible.length || items.length)
			tileStacks.push({ x: lx, y: ly, ids: visible });
		for (const item of items) {
			const found = lookupFlags(index, item.id);
			if (!found) continue;
			if ((found.bank || found.fullbank) && !groundId[i]) groundId[i] = item.id;
			if (
				hideFloorTravelVisual(item.id, floorchangeSet, itemNames.get(item.id))
			) {
				continue;
			}
			if (!found.bank && !found.fullbank && !found.take) {
				overlayId[i] = item.id;
			}
		}
	});
	fillPlaceholderGround(groundId, box.w, box.h, (id) =>
		isPlaceholderGround(id, itemNames.get(id)),
	);
	fillPlaceholderGround(
		visGround,
		vbox.w,
		vbox.h,
		(id) =>
			isPlaceholderGround(id, itemNames.get(id)) ||
			hideFloorTravelVisual(id, floorchangeSet, itemNames.get(id)),
	);
	const visTiles = [...tileStacks, ...offMask];
	fillHiddenGrounds(visTiles, visGround, vbox.w, index);
	for (const id of [...unknown].sort((a, b) => a - b)) {
		console.warn(`unknown appearance id ${id}`);
	}
	const { unique, ground, overlay } = localAppearances(groundId, overlayId, n);
	let openness = evaluateOpenness(walk, box.w, box.h, pz);
	const keep = diagonalReach(walk, box.w, box.h, openness.largest);
	for (let i = 0; i < n; i++) {
		if (keep[i] === 0) walk[i] = 0;
	}
	openness = evaluateOpenness(walk, box.w, box.h, pz);
	checkOpenness(openness, region, opts.playtest);
	const start = region.start ?? openness.start;
	if (region.start && openness.largest[start.y * box.w + start.x] !== 1) {
		throw new Error(
			`start ${start.x},${start.y} is off the walkable area of ${region.id}`,
		);
	}
	const zones = regionZones(region, box, openness.largest, spawnXml);
	const kinds = kindsHistogram(zones);
	const uncatalogued = kinds
		.map((row) => row.enemyId)
		.filter((name) => !known.has(name));
	const exits =
		region.exits.length > 0
			? [...region.exits]
			: detectedExits.filter((e) =>
					exitReachable(e.x, e.y, box.w, box.h, openness.largest),
				);
	if (!region.authoringTest && exits.length === 0 && !region.opennessWaiver) {
		throw new Error(`no reachable exit for ${region.id}`);
	}
	const bin = writeBin(ground, overlay, walk, speed, unsight);
	const meta = {
		atlas: `${region.id}-atlas`,
		displayName: region.displayName,
		exits,
		h: box.h,
		hash: fnv1a32(bin),
		id: region.id,
		kinds,
		liveEnemyCap: openness.liveEnemyCap,
		openness: opennessMeta(openness),
		ox: box.x,
		oy: box.y,
		start,
		tower: region.tower,
		uniqueAppearanceIds: unique,
		w: box.w,
		z: box.z,
		zones,
	};
	const dest = join(
		opts.outDir ?? join(opts.root, "public/floors"),
		region.tower,
	);
	mkdirSync(dest, { recursive: true });
	const stacks: RegionStacks = {
		h: vbox.h,
		ox: box.x,
		oy: box.y,
		tiles: visTiles,
		w: vbox.w,
		z: box.z,
	};
	if (!region.authoringTest && unique.length === 0) {
		throw new Error(`no appearance ids for ${region.id}`);
	}
	if (!region.authoringTest && !opts.dataOnly) {
		const covers = coversTile(join(opts.root, "art-src/tibia/library"));
		const cover = new Uint8Array(vn);
		for (let i = 0; i < vn; i++) {
			if (visGround[i] && covers(visGround[i])) cover[i] = 1;
		}
		const below = collectBelow(
			vbox,
			new Uint8Array(vn).fill(1),
			cover,
			index,
			(b, onTile) =>
				streamOtbm(otbm, b, (tx, ty, _tz, items) => onTile(tx, ty, items)),
			covers,
		);
		if (below.length) stacks.below = below;
		const visual = packAtlasWithStacks(
			opts.root,
			join(dest, region.id),
			unique,
			stacks,
		);
		if (visual) (meta as { visual?: typeof visual }).visual = visual;
	}
	const jsonPath = join(dest, `${region.id}.json`);
	const binPath = join(dest, `${region.id}.bin`);
	const jsonText = encodeSortedJson(meta);
	writeFileSync(jsonPath, jsonText);
	writeFileSync(binPath, bin);
	if (!opts.dataOnly) {
		writePreviewPng(
			join(dest, `${region.id}-preview.png`),
			walk,
			box.w,
			box.h,
			region.authoringTest ? 1 : 8,
		);
	}
	const { uniformNote, opennessNote } = regionNotes(openness, region, speed);
	return {
		id: region.id,
		jsonRel: `public/floors/${region.tower}/${region.id}.json`,
		binRel: `public/floors/${region.tower}/${region.id}.bin`,
		jsonHash: fnv1a32(Buffer.from(jsonText)),
		binHash: fnv1a32(bin),
		histogram: speedHistogram(speed),
		modalWalk: modalWalkSpeed(walk, speed),
		uniformNote,
		opennessNote,
		uncatalogued,
		zoneCount: zones.length,
		zonesWaiver: region.zonesWaiver,
	};
}

export function runConvert(opts: ConvertOpts): void {
	const wanted: RegionDef[] = opts.regionId
		? [regionById(opts.regionId)].filter((row): row is RegionDef =>
				Boolean(row),
			)
		: REGIONS.filter((row: RegionDef) => !row.authoringTest);
	if (opts.regionId && wanted.length === 0) {
		throw new Error(`unknown region ${opts.regionId}`);
	}
	const indexPath =
		opts.indexPath ?? join(opts.root, "art-src/tibia/index-objects.json");
	const itemsXml =
		opts.itemsXml ?? join(opts.root, CANARY_DIR, "data/items/items.xml");
	const spawnXml =
		opts.spawnXml ??
		join(
			opts.root,
			CANARY_DIR,
			"data-otservbr-global/world/otservbr-monster.xml",
		);
	const needsInputs = wanted.some((row) => !row.authoringTest);
	if (needsInputs) {
		if (!existsSync(indexPath)) throw new Error(`missing index ${indexPath}`);
		if (!existsSync(itemsXml)) throw new Error(`missing items.xml ${itemsXml}`);
		if (!existsSync(spawnXml)) throw new Error(`missing spawn xml ${spawnXml}`);
	}
	const index = existsSync(indexPath) ? loadIndex(indexPath) : new Map();
	const itemsXmlText = existsSync(itemsXml)
		? readFileSync(itemsXml, "utf8")
		: "";
	const floorchangeSet = itemsXmlText
		? loadFloorchangeIds(itemsXmlText)
		: new Set<number>();
	const itemNames = itemsXmlText ? loadItemNames(itemsXmlText) : new Map();
	const known = knownMonsterNames(opts.root);
	const rows: ConvertedRegion[] = [];
	for (const region of wanted) {
		rows.push(
			convertOne(
				region,
				opts,
				index,
				floorchangeSet,
				itemNames,
				known,
				spawnXml,
			),
		);
	}
	if (!opts.dataOnly && rows.some((row) => !row.id.startsWith("void"))) {
		writeMapReport(
			opts.root,
			rows.filter((row) => !row.id.includes("void-test")),
		);
	}
	if (!opts.noPools) {
		writePools(opts.root, opts.outDir);
	}
}

function parseArgs(argv: string[]): ConvertOpts {
	const opts: ConvertOpts = { root: repoRoot() };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--otbm" && next) {
			opts.otbm = resolve(next);
			i++;
		} else if (arg === "--region" && next) {
			opts.regionId = next;
			i++;
		} else if (arg === "--out" && next) {
			opts.outDir = resolve(next);
			i++;
		} else if (arg === "--index" && next) {
			opts.indexPath = resolve(next);
			i++;
		} else if (arg === "--data-only") {
			opts.dataOnly = true;
		} else if (arg === "--no-pools") {
			opts.noPools = true;
		} else if (arg === "--playtest") {
			opts.playtest = true;
		}
	}
	return opts;
}

const entry = process.argv[1];
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
	try {
		runConvert(parseArgs(process.argv.slice(2)));
	} catch (err) {
		console.error(err);
		process.exitCode = 1;
	}
}
