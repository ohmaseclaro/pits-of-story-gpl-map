import type { ContentStep } from "../lib/ctx.ts";
import { emitMonsterRows } from "../monsters.ts";

export const monsters: ContentStep = {
	name: "monsters",
	run(ctx) {
		const rows = emitMonsterRows(ctx.root).filter((row) => {
			if (row.lookType > 0 && ctx.validateLookType(row.lookType, row.name)) {
				return true;
			}
			ctx.unresolved.push(`monster:${row.name}`);
			return false;
		});
		ctx.writeSortedJson("monsters.json", rows);
	},
};
