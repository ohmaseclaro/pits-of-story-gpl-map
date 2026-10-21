import { readFileSync } from "node:fs";

export type ParsedItem = {
	id: number;
	name: string;
	attrs: Record<string, string>;
};

const ITEM_BLOCK = /<item\b([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/gi;
const ATTR = /([A-Za-z_:][A-Za-z0-9_:]*)\s*=\s*"([^"]*)"/g;
const ATTRIBUTE = /<attribute\b([^>]*)\/?>/gi;

function attrsOf(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const match of tag.matchAll(ATTR)) {
		const key = match[1];
		const value = match[2];
		if (key) out[key] = value ?? "";
	}
	return out;
}

export function parseItems(filePath: string): Record<number, ParsedItem> {
	const source = readFileSync(filePath).toString("latin1");
	const items: Record<number, ParsedItem> = {};
	for (const match of source.matchAll(ITEM_BLOCK)) {
		const open = (match[1] ?? "").replace(/\/\s*$/, "");
		const body = match[2] ?? "";
		const openAttrs = attrsOf(open);
		const id = Number(openAttrs.id);
		const name = openAttrs.name;
		if (!Number.isFinite(id) || !name) continue;
		const attrs: Record<string, string> = {};
		for (const row of body.matchAll(ATTRIBUTE)) {
			const rowAttrs = attrsOf(row[1] ?? "");
			if (rowAttrs.key) attrs[rowAttrs.key] = rowAttrs.value ?? "";
		}
		items[id] = { id, name, attrs };
	}
	return items;
}
