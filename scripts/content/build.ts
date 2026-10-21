import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireCanaryDir } from "./lib/checkout.ts";
import { createCtx } from "./lib/ctx.ts";
import { writeReport } from "./lib/report.ts";
import { repoRoot } from "./monsters.ts";
import { STEPS } from "./steps/index.ts";

export async function writeContent(root = repoRoot()): Promise<void> {
	requireCanaryDir(root);
	const ctx = createCtx(root);
	for (const step of STEPS) {
		await step.run(ctx);
	}
	writeReport(ctx);
}

const entry = process.argv[1];
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
	writeContent().catch((err: unknown) => {
		console.error(err);
		process.exitCode = 1;
	});
}
