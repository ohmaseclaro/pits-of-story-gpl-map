import { contentConfig } from "../config.ts";
import type { ContentStep } from "../lib/ctx.ts";
import { parseItems } from "../parse-items.ts";

export const items: ContentStep = {
	name: "items",
	run(ctx) {
		const source = ctx.canaryOrFixture(
			"data/items/items.xml",
			"items-snippet.xml",
		);
		const parsed = parseItems(source);
		const byName = new Map(
			Object.values(parsed).map((item) => [item.name, item]),
		);
		const allowed: Record<
			string,
			{ attrs: Record<string, string>; id: number; name: string }
		> = {};
		for (const name of contentConfig.items) {
			const item = byName.get(name);
			if (!item) {
				if (ctx.canaryDir) ctx.failUnknown("item", name);
				ctx.unresolved.push(name);
				continue;
			}
			if (!ctx.validateItemId(item.id, source)) continue;
			allowed[String(item.id)] = {
				attrs: item.attrs,
				id: item.id,
				name: item.name,
			};
		}
		ctx.writeSortedJson("items.json", allowed);
	},
};
