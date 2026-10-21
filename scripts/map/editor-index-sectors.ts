import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CELL_BYTES,
	EMPTY_ID,
	SECTOR,
	SECTOR_BIN_BYTES,
	sectorOrigin,
} from "./sectorGrid.ts";

export { sectorOrigin };
export const CLASSIC_WINDOW = {
	x0: 31744,
	y0: 30976,
	x1: 33791,
	y1: 33023,
} as const;

export type SectorKey = { z: number; bx: number; by: number };

export function sectorKey(z: number, bx: number, by: number): string {
	return `${z}:${bx}:${by}`;
}

export function parseSectorKey(key: string): SectorKey {
	const [z, bx, by] = key.split(":").map(Number);
	return { z: z ?? 0, bx: bx ?? 0, by: by ?? 0 };
}

/** 5 bytes/tile = 327680: u16 ground, u16 overlay, u8 walk (0 or clamped speed). */
export function allocSector(): Buffer {
	const buf = Buffer.alloc(SECTOR_BIN_BYTES);
	for (let i = 0; i < SECTOR * SECTOR; i++) {
		const off = i * CELL_BYTES;
		buf.writeUInt16LE(EMPTY_ID, off);
		buf.writeUInt16LE(EMPTY_ID, off + 2);
	}
	return buf;
}

export function writeCell(
	buf: Buffer,
	x: number,
	y: number,
	ground: number,
	overlay: number,
	walk: boolean,
	speed: number,
): void {
	const { bx, by } = sectorOrigin(x, y);
	const lx = x - bx;
	const ly = y - by;
	const off = (ly * SECTOR + lx) * CELL_BYTES;
	buf.writeUInt16LE(ground & 0xffff, off);
	buf.writeUInt16LE(overlay & 0xffff, off + 2);
	buf.writeUInt8(walk ? Math.min(255, Math.max(1, speed | 0)) : 0, off + 4);
}

export function writeSectorFiles(
	outDir: string,
	sectors: Map<string, Buffer>,
): SectorKey[] {
	const occupied: SectorKey[] = [];
	for (const [key, buf] of sectors) {
		const rec = parseSectorKey(key);
		occupied.push(rec);
		const dir = join(outDir, "sector", String(rec.z));
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${rec.bx}_${rec.by}.bin`), buf);
	}
	occupied.sort((a, b) => a.z - b.z || a.bx - b.bx || a.by - b.by);
	return occupied;
}
