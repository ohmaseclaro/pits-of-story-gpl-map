import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
	const tag = Buffer.from(type);
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
	return Buffer.concat([len, tag, data, crc]);
}

/** Uncompressed-style RGB PNG (zlib level 9). No timestamps. */
export function encodeRgbPng(w: number, h: number, rgb: Uint8Array): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const row = 1 + w * 3;
	const raw = Buffer.alloc(h * row);
	for (let y = 0; y < h; y++) {
		raw[y * row] = 0;
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 3;
			const o = y * row + 1 + x * 3;
			raw[o] = rgb[i] ?? 0;
			raw[o + 1] = rgb[i + 1] ?? 0;
			raw[o + 2] = rgb[i + 2] ?? 0;
		}
	}
	const idat = deflateSync(raw, { level: 9 });
	return Buffer.concat([
		SIG,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

export function walkRgb(
	walk: Uint8Array,
	w: number,
	h: number,
	scale = 1,
): Uint8Array {
	const sw = w * scale;
	const sh = h * scale;
	const rgb = new Uint8Array(sw * sh * 3);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const on = walk[y * w + x] === 1;
			const r = on ? 220 : 28;
			const g = on ? 214 : 24;
			const b = on ? 196 : 20;
			for (let dy = 0; dy < scale; dy++) {
				for (let dx = 0; dx < scale; dx++) {
					const i = ((y * scale + dy) * sw + (x * scale + dx)) * 3;
					rgb[i] = r;
					rgb[i + 1] = g;
					rgb[i + 2] = b;
				}
			}
		}
	}
	return rgb;
}

export function writePreviewPng(
	path: string,
	walk: Uint8Array,
	w: number,
	h: number,
	scale = 1,
): void {
	const rgb = walkRgb(walk, w, h, scale);
	writeFileSync(path, encodeRgbPng(w * scale, h * scale, rgb));
}
