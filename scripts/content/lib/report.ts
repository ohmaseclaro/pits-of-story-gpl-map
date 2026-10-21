import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANARY_COMMIT } from "../config.ts";
import type { ContentCtx } from "./ctx.ts";
import { fnv1a32 } from "./fnv1a.ts";

function countOf(fileName: string, raw: string): string {
	try {
		const data = JSON.parse(raw) as unknown;
		if (Array.isArray(data)) return String(data.length);
		if (data && typeof data === "object") {
			const rec = data as Record<string, unknown>;
			for (const key of ["monsters", "npcs", "imbuements", "items", "zones"]) {
				if (Array.isArray(rec[key])) return String(rec[key].length);
			}
			return String(Object.keys(rec).length);
		}
	} catch {
		/* content.d.ts */
	}
	return fileName.endsWith(".d.ts") ? "types" : "-";
}

function jsonOnDisk(outDir: string): string[] {
	if (!existsSync(outDir)) return [];
	return readdirSync(outDir)
		.filter((name) => name.endsWith(".json"))
		.sort();
}

export function writeReport(ctx: ContentCtx): void {
	const source = ctx.canaryDir
		? `source: checkout ${CANARY_COMMIT}`
		: "source: fixtures";
	const lines = ["# content:build", "", source, "", "## Outputs", ""];
	const names = [
		...new Set([...ctx.written, ...jsonOnDisk(ctx.outDir)]),
	].sort();
	for (const name of names) {
		const path = join(ctx.outDir, name);
		if (!existsSync(path)) continue;
		const raw = readFileSync(path);
		const hash = fnv1a32(raw);
		lines.push(`${name}  ${hash}  ${countOf(name, raw.toString("utf8"))}`);
	}
	lines.push("", "## Warnings", "");
	if (ctx.warnings.length === 0) lines.push("(none)");
	else {
		for (const row of ctx.warnings) {
			const loc = row.line == null ? row.file : `${row.file}:${row.line}`;
			lines.push(`${loc} ${row.message}`);
		}
	}
	lines.push("", "## Unresolved names", "");
	if (ctx.unresolved.length === 0) lines.push("(none)");
	else {
		for (const name of ctx.unresolved.sort()) lines.push(name);
	}
	lines.push("");
	writeFileSync(
		join(ctx.root, "scripts/content/REPORT.md"),
		`${lines.join("\n")}\n`,
	);
}
