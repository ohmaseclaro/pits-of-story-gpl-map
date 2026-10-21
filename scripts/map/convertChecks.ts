import { existsSync, readFileSync } from "node:fs";
import { EMPTY_LOCAL } from "./convertIo.ts";
import type { evaluateOpenness } from "./openness.ts";
import type { OtbmBox } from "./otbm.ts";
import type { RegionDef } from "./regions.ts";
import { buildZones, parseMonsterXml, type Zone } from "./zones.ts";

type Openness = ReturnType<typeof evaluateOpenness>;

export function localAppearances(
	groundId: Uint32Array,
	overlayId: Uint32Array,
	n: number,
): { unique: number[]; ground: Uint16Array; overlay: Uint16Array } {
	const unique = [
		...new Set([...groundId, ...overlayId].filter((id) => id > 0)),
	].sort((a, b) => a - b);
	const localOf = new Map(unique.map((id, idx) => [id, idx]));
	const ground = new Uint16Array(n);
	const overlay = new Uint16Array(n);
	ground.fill(EMPTY_LOCAL);
	overlay.fill(EMPTY_LOCAL);
	for (let i = 0; i < n; i++) {
		const g = groundId[i];
		const ov = overlayId[i];
		if (g) ground[i] = localOf.get(g) ?? EMPTY_LOCAL;
		if (ov) overlay[i] = localOf.get(ov) ?? EMPTY_LOCAL;
	}
	return { unique, ground, overlay };
}

export function checkOpenness(
	openness: Openness,
	region: RegionDef,
	playtestOpt: boolean | undefined,
): void {
	if (!region.authoringTest) {
		const ok = opennessPasses(openness, region);
		const playtest = playtestOpt === true && region.pool !== true;
		if (!ok && !region.opennessWaiver && !playtest) {
			throw new Error(
				`openness failed for ${region.id}: ${openness.reasons.join(",")}`,
			);
		}
		if (!ok && region.opennessWaiver) {
			console.warn(
				`openness waived for ${region.id}: ${openness.reasons.join(",")} (${region.opennessWaiver})`,
			);
		} else if (!ok) {
			console.warn(
				`openness relaxed for playtest ${region.id}: ${openness.reasons.join(",")} (fix before adding it to a tower pool)`,
			);
		}
	}
}

export function regionZones(
	region: RegionDef,
	box: OtbmBox,
	largest: Uint8Array,
	spawnXml?: string,
): Zone[] {
	let zones: Zone[] = [];
	if (spawnXml && existsSync(spawnXml)) {
		const centres = parseMonsterXml(readFileSync(spawnXml, "utf8"));
		// Every spawn name stays: the runtime ENEMY_MAP skips creatures the game has not added yet.
		const names = new Set(
			centres.flatMap((c) => c.rows.map((row) => row.name)),
		);
		zones = buildZones(centres, box, largest, names, []);
	}
	let zoneTiles = 0;
	for (const zone of zones) zoneTiles += zone.tiles.length;
	if (
		!region.authoringTest &&
		!region.zonesWaiver &&
		zones.length < 2 &&
		zoneTiles < 12
	) {
		throw new Error(`need 2 zones or 12 zone tiles for ${region.id}`);
	}
	return zones;
}

export function opennessMeta(openness: Openness) {
	return {
		largestCount: openness.largestCount,
		largestShare: openness.largestShare,
		medianClearance: openness.medianClearance,
		obstacleRatio: openness.obstacleRatio,
		ok: openness.ok,
		openingRatio: openness.openingRatio,
		pzFraction: openness.pzFraction,
		reasons: [...openness.reasons],
		walkCount: openness.walkCount,
	};
}

export function regionNotes(
	openness: Openness,
	region: RegionDef,
	speed: Uint16Array,
): { uniformNote: string; opennessNote: string } {
	const speeds = [...new Set(speed)].sort((a, b) => a - b);
	const uniformNote =
		speeds.length === 1
			? `cave floor has one uniform ground speed ${speeds[0]}`
			: "";
	const opennessNote = openness.ok
		? "openness: pass"
		: `openness: FAIL ${openness.reasons.join(",")} walk=${openness.walkCount} largest=${openness.largestCount} share=${openness.largestShare.toFixed(3)} opening=${openness.openingRatio.toFixed(3)} obstacle=${openness.obstacleRatio.toFixed(3)} median=${openness.medianClearance}${region.opennessWaiver ? ` waiver=${region.opennessWaiver}` : ""}`;
	return { uniformNote, opennessNote };
}

function opennessPasses(result: Openness, region: RegionDef): boolean {
	if (!region.openness) return result.ok;
	const t = region.openness;
	const reasons: string[] = [];
	if (result.largestCount < t.minLargest) reasons.push("largest-tiles");
	if (result.obstacleRatio > t.maxObstacle) reasons.push("obstacle-ratio");
	if (result.openingRatio < t.minOpening) reasons.push("opening-ratio");
	result.reasons = reasons;
	result.ok = reasons.length === 0;
	return result.ok;
}

export function exitReachable(
	x: number,
	y: number,
	w: number,
	h: number,
	largest: Uint8Array,
): boolean {
	const nbs = [
		[x + 1, y],
		[x - 1, y],
		[x, y + 1],
		[x, y - 1],
	];
	for (let k = 0; k < 4; k++) {
		const nx = nbs[k]?.[0] ?? -1;
		const ny = nbs[k]?.[1] ?? -1;
		if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
		if (largest[ny * w + nx]) return true;
	}
	return largest[y * w + x] === 1;
}

export function modalWalkSpeed(walk: Uint8Array, speed: Uint16Array): number {
	const counts = new Map<number, number>();
	for (let i = 0; i < walk.length; i++) {
		if (!walk[i]) continue;
		const s = speed[i] ?? 0;
		counts.set(s, (counts.get(s) ?? 0) + 1);
	}
	let best = 0;
	let bestN = -1;
	for (const [value, n] of counts) {
		if (n > bestN) {
			bestN = n;
			best = value;
		}
	}
	return best;
}
