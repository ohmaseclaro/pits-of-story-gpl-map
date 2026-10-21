import { readFileSync } from "node:fs";
import type { MaskLoader } from "./shapes.ts";

type Pbm = { w: number; h: number; bits: Uint8Array };

const pbmCache = new Map<string, Pbm>();

function skipPbmComment(text: string, i: number): number {
	if (text[i] !== "#") return i;
	while (i < text.length && text[i] !== "\n") i++;
	return i;
}

function nextPbmToken(text: string, i: number): { token: string; i: number } {
	while (i < text.length) {
		i = skipPbmComment(text, i);
		const c = text[i];
		if (c === undefined) break;
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			i++;
			continue;
		}
		let j = i;
		while (j < text.length) {
			const d = text[j];
			if (
				d === undefined ||
				d === " " ||
				d === "\t" ||
				d === "\n" ||
				d === "\r" ||
				d === "#"
			) {
				break;
			}
			j++;
		}
		return { token: text.slice(i, j), i: j };
	}
	throw new Error("PBM truncated header");
}

/** Node-only PBM loader. Do not import this file from the editor browser graph. */
export const loadPbm: MaskLoader = (path: string): Pbm => {
	const hit = pbmCache.get(path);
	if (hit) return hit;
	const buf = readFileSync(path);
	const text = buf.toString("latin1");
	let i = 0;
	const magic = nextPbmToken(text, i);
	i = magic.i;
	const wt = nextPbmToken(text, i);
	i = wt.i;
	const ht = nextPbmToken(text, i);
	i = ht.i;
	const w = Number(wt.token);
	const h = Number(ht.token);
	if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
		throw new Error(`PBM bad size ${path}`);
	}
	const bits = new Uint8Array(w * h);
	if (magic.token === "P1") {
		let k = 0;
		while (k < bits.length) {
			if (i >= text.length) throw new Error("PBM truncated raster");
			i = skipPbmComment(text, i);
			const c = text[i];
			if (c === undefined) throw new Error("PBM truncated raster");
			if (c === " " || c === "\t" || c === "\n" || c === "\r") {
				i++;
				continue;
			}
			if (c !== "0" && c !== "1") throw new Error("PBM truncated raster");
			bits[k++] = c === "1" ? 1 : 0;
			i++;
		}
	} else if (magic.token === "P4") {
		i += 1;
		const rowBytes = (w + 7) >> 3;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const byte = buf[i + y * rowBytes + (x >> 3)] ?? 0;
				bits[y * w + x] = (byte >> (7 - (x & 7))) & 1;
			}
		}
	} else {
		throw new Error(`PBM magic ${magic.token} (P1/P4 only)`);
	}
	const parsed = { w, h, bits };
	pbmCache.set(path, parsed);
	return parsed;
};
