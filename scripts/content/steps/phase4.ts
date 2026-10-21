import { emitSpellsOutfitsMounts } from "../emit-phase4.ts";
import type { ContentStep } from "../lib/ctx.ts";

export const phase4: ContentStep = {
	name: "phase4",
	run(ctx) {
		const checkout = ctx.canaryDir ?? ctx.fixturesDir;
		emitSpellsOutfitsMounts(checkout, ctx.outDir);
		ctx.record("spells.json");
		ctx.record("outfits.json");
		ctx.record("mounts.json");
	},
};
