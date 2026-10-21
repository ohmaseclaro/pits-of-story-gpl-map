import { emitHubContent } from "../hub.ts";
import type { ContentStep } from "../lib/ctx.ts";

export const hub: ContentStep = {
	name: "hub",
	async run(ctx) {
		await emitHubContent(ctx.outDir);
		ctx.record("achievements.json");
		ctx.record("bestiary.json");
		ctx.record("charms.json");
		ctx.record("reward-lane.json");
	},
};
