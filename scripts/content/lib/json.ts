import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortValue((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

/** Tab-indented sorted JSON with a trailing newline (06-02 / 08-02). */
export function encodeSortedJson(data: unknown): string {
	return `${JSON.stringify(sortValue(data), null, "\t")}\n`;
}

/** Compact sorted JSON with a trailing newline (07-02 / 05-02 writeJson). */
export function writeJson(filePath: string, data: unknown): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(sortValue(data))}\n`);
}

export function writeSortedJson(filePath: string, data: unknown): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, encodeSortedJson(data));
}
