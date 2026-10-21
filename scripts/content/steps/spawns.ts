import { REGIONS, type RegionDef } from "../../map/regions.ts";
import { shapeBounds } from "../../map/shapes.ts";
import type { ContentStep } from "../lib/ctx.ts";
import { parseSpawns, type SpawnZone } from "../parse-spawns.ts";

/** Region boxes, not whole z-levels: by z the Rookgaard regions pulled 8 MB of mainland spawns into the precache. */
const BOXES = REGIONS.filter((row: RegionDef) => !row.authoringTest).map(
	(row) => ({
		z: row.z,
		...shapeBounds(row.shape),
	}),
);

function zoneHits(zone: SpawnZone): boolean {
	return BOXES.some(
		(b) =>
			b.z === zone.cz &&
			zone.cx + zone.r >= b.x &&
			zone.cx - zone.r < b.x + b.w &&
			zone.cy + zone.r >= b.y &&
			zone.cy - zone.r < b.y + b.h,
	);
}

export const spawns: ContentStep = {
	name: "spawns",
	run(ctx) {
		const source = ctx.canaryOrFixture(
			"data-otservbr-global/world/otservbr-monster.xml",
			"spawns-snippet.xml",
		);
		const raw = parseSpawns(source);
		const kept = ctx.canaryDir ? raw.filter(zoneHits) : raw;
		ctx.writeSortedJson("spawns.json", {
			zones: kept.map((z) => ({
				cx: z.cx,
				cy: z.cy,
				cz: z.cz,
				entries: z.entries.map((e) => ({
					every: e.every,
					name: e.name,
					x: e.x,
					y: e.y,
				})),
				r: z.r,
			})),
		});
	},
};
