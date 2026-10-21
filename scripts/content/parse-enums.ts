import { readFileSync } from "node:fs";

const ENUM_BLOCK =
	/\benum\s+(?:class\s+)?\w*\s*(?::\s*[\w:]+\s*)?\{([\s\S]*?)\}/g;

export function parseEnums(filePath: string): Record<string, number> {
	const source = readFileSync(filePath, "utf8").replace(
		/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
		"",
	);
	const out: Record<string, number> = {};
	for (const block of source.matchAll(ENUM_BLOCK)) {
		let next = 0;
		for (const raw of (block[1] ?? "").split(",")) {
			const m = /^\s*([A-Z][A-Z0-9_]*)\s*(?:=\s*(.+?))?\s*$/.exec(raw);
			if (!m?.[1]) continue;
			if (m[2] !== undefined) {
				const expr = m[2].trim();
				const shift = /^(-?\d+)\s*<<\s*(\d+)$/.exec(expr);
				const value = shift
					? Number(shift[1]) << Number(shift[2])
					: /^-?(0x[0-9a-f]+|\d+)$/i.test(expr)
						? Number(expr)
						: out[expr];
				if (value === undefined || !Number.isFinite(value)) continue;
				next = value;
			}
			out[m[1]] = next;
			next += 1;
		}
	}
	return out;
}
