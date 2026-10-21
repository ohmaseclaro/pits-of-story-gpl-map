import type { ContentStep } from "../lib/ctx.ts";
import { parseEnums } from "../parse-enums.ts";

const EXPECTED = ["COMBAT_FIREDAMAGE", "CONST_ME_NONE", "RARITY_BANE"] as const;

const CANARY_HEADERS = [
	"src/utils/utils_definitions.hpp",
	"src/creatures/creatures_definitions.hpp",
	"src/io/io_bosstiary.hpp",
];

export const enums: ContentStep = {
	name: "enums",
	run(ctx) {
		const enumsOut: Record<string, number> = {};
		if (ctx.canaryDir) {
			for (const header of CANARY_HEADERS) {
				Object.assign(
					enumsOut,
					parseEnums(ctx.canaryOrFixture(header, "enums-snippet.hpp")),
				);
			}
		} else {
			Object.assign(
				enumsOut,
				parseEnums(ctx.canaryOrFixture("", "enums-snippet.hpp")),
			);
		}
		for (const symbol of EXPECTED) {
			if (!(symbol in enumsOut)) {
				ctx.failUnknown("enum", symbol);
			}
		}
		ctx.writeSortedJson("enums.json", enumsOut);
	},
};
