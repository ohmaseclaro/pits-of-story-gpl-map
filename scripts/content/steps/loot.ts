import { emitLootEconomy, prepareLootEconomy } from "../emit-loot-economy.ts";
import type { ContentStep } from "../lib/ctx.ts";

export const loot: ContentStep = {
	name: "loot",
	run(ctx) {
		emitLootEconomy({
			...prepareLootEconomy(ctx),
			outDir: ctx.outDir,
			warn: ctx.warn,
		});
		ctx.record("loot.json");
		ctx.record("shops.json");
		ctx.record("imbuements.json");
	},
};
