import type { ContentStep } from "../lib/ctx.ts";
import { emitWaveRows } from "../waves.ts";

export const waves: ContentStep = {
	name: "waves",
	run(ctx) {
		ctx.writeSortedJson("waves.json", emitWaveRows(ctx.root));
	},
};
