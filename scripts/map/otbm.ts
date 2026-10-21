import { readFileSync, writeFileSync } from "node:fs";

export const OTBM_NODE_START = 0xfe;
const END = 0xff;
const ESC = 0xfd;

export const OTBM_MAP_DATA = 2;
export const OTBM_TILE_AREA = 4;
export const OTBM_TILE = 5;
export const OTBM_ITEM = 6;
export const OTBM_TOWNS = 12;
export const OTBM_TOWN = 13;
export const OTBM_HOUSETILE = 14;
export const OTBM_WAYPOINTS = 15;
export const OTBM_WAYPOINT = 16;
export const OTBM_TILE_ZONE = 19;

export const OTBM_ATTR_TILE_FLAGS = 3;
export const OTBM_ATTR_TELE_DEST = 8;
export const OTBM_ATTR_ITEM = 9;
export const OTBM_TILEFLAG_PROTECTIONZONE = 1;

const HEADER_STRING = new Set([1, 11, 13, 23, 24]);
const ITEM_STRING = new Set([6, 7, 19]);
const ATTR_U8 = new Set([12, 14, 15, 17]);
const ATTR_U16 = new Set([4, 5, 10, 22]);
const ATTR_U32 = new Set([16, 18, 20, 21, 23]);

export type OtbmItem = {
	id: number;
	dest?: { x: number; y: number; z: number };
};

export type OtbmBox = {
	x: number;
	y: number;
	z: number;
	w: number;
	h: number;
};

export type OtbmOnTile = (
	tx: number,
	ty: number,
	tz: number,
	items: OtbmItem[],
	flags: number,
) => void;

export type OtbmTown = {
	id: number;
	name: string;
	x: number;
	y: number;
	z: number;
};
export type OtbmWaypoint = { name: string; x: number; y: number; z: number };
export type OtbmHooks = {
	onTown?: (t: OtbmTown) => void;
	onWaypoint?: (w: OtbmWaypoint) => void;
};

export function areaHits(
	baseX: number,
	baseY: number,
	z: number,
	box: OtbmBox | null,
): boolean {
	if (!box) return true;
	if (z !== box.z) return false;
	return (
		baseX + 255 >= box.x &&
		baseX < box.x + box.w &&
		baseY + 255 >= box.y &&
		baseY < box.y + box.h
	);
}

class OtbmStream {
	buf: Buffer;
	pos = 0;
	depth = 0;

	constructor(buf: Buffer) {
		this.buf = buf;
	}

	getU8(): number {
		if (this.pos >= this.buf.length) throw new Error("OTBM truncated");
		if (this.depth > 0 && this.buf[this.pos] === ESC) {
			this.pos++;
			if (this.pos >= this.buf.length) throw new Error("OTBM truncated");
		}
		return this.buf[this.pos++];
	}

	getU16(): number {
		return this.getU8() | (this.getU8() << 8);
	}

	getU32(): number {
		return (this.getU16() | (this.getU16() << 16)) >>> 0;
	}

	peekU8(): number {
		if (this.pos >= this.buf.length) throw new Error("OTBM truncated");
		return this.buf[this.pos];
	}

	getString(): string {
		const len = this.getU16();
		const bytes = Buffer.allocUnsafe(len);
		for (let i = 0; i < len; i++) bytes[i] = this.getU8();
		return bytes.toString("latin1");
	}

	startNode(type = 0): boolean {
		if (this.buf[this.pos] !== OTBM_NODE_START) return false;
		if (type !== 0 && this.buf[this.pos + 1] !== type) return false;
		this.pos += type === 0 ? 1 : 2;
		this.depth++;
		return true;
	}

	endNode(): boolean {
		if (this.buf[this.pos] !== END) return false;
		this.pos++;
		this.depth--;
		return true;
	}

	isProp(prop: number): boolean {
		if (this.buf[this.pos] !== prop) return false;
		this.pos++;
		return true;
	}

	skipNodeBody(): void {
		let open = 1;
		while (this.pos < this.buf.length) {
			const byte = this.buf[this.pos++];
			if (byte === ESC) this.pos++;
			else if (byte === OTBM_NODE_START) {
				open++;
				this.pos++;
			} else if (byte === END && --open === 0) {
				this.depth--;
				return;
			}
		}
		throw new Error("OTBM node not closed");
	}

	atBoundary(): boolean {
		const raw = this.buf[this.pos];
		return raw === OTBM_NODE_START || raw === END;
	}

	skipToBoundary(): void {
		while (this.pos < this.buf.length) {
			const next = this.buf[this.pos];
			if (next === OTBM_NODE_START || next === END) return;
			this.pos += next === ESC ? 2 : 1;
		}
	}
}

function skipMapAttrs(stream: OtbmStream): void {
	for (;;) {
		const attr = stream.peekU8();
		if (!HEADER_STRING.has(attr)) return;
		stream.getU8();
		stream.getString();
	}
}

function readItem(stream: OtbmStream): OtbmItem {
	const id = stream.getU16();
	let dest: OtbmItem["dest"];
	while (stream.pos < stream.buf.length) {
		if (stream.atBoundary()) break;
		const attr = stream.getU8();
		if (attr === OTBM_ATTR_TELE_DEST) {
			dest = { x: stream.getU16(), y: stream.getU16(), z: stream.getU8() };
		} else if (ATTR_U16.has(attr)) stream.getU16();
		else if (ATTR_U8.has(attr)) stream.getU8();
		else if (ITEM_STRING.has(attr)) stream.getString();
		else if (ATTR_U32.has(attr)) stream.getU32();
		else {
			throw new Error(`OTBM unknown item attr ${attr} at ${stream.pos}`);
		}
	}
	while (stream.startNode()) {
		stream.getU8();
		stream.skipNodeBody();
	}
	if (!stream.endNode()) throw new Error("OTBM item not closed");
	return dest ? { id, dest } : { id };
}

function parseTile(
	stream: OtbmStream,
	tileType: number,
	baseX: number,
	baseY: number,
	z: number,
	box: OtbmBox | null,
	onTile: OtbmOnTile,
): void {
	const ox = stream.getU8();
	const oy = stream.getU8();
	if (tileType === OTBM_HOUSETILE) stream.getU32();
	let flags = 0;
	const items: OtbmItem[] = [];
	if (stream.isProp(OTBM_ATTR_TILE_FLAGS)) flags = stream.getU32();
	if (stream.isProp(OTBM_ATTR_ITEM)) items.push({ id: stream.getU16() });
	while (stream.startNode()) {
		const childType = stream.getU8();
		if (childType === OTBM_ITEM) items.push(readItem(stream));
		else stream.skipNodeBody();
	}
	if (!stream.endNode()) throw new Error("OTBM tile not closed");
	const tx = baseX + ox;
	const ty = baseY + oy;
	if (
		!box ||
		(tx >= box.x && tx < box.x + box.w && ty >= box.y && ty < box.y + box.h)
	) {
		onTile(tx, ty, z, items, flags);
	}
}

function emitSpecial(
	stream: OtbmStream,
	type: number,
	hooks?: OtbmHooks,
): boolean {
	if (type === OTBM_TOWN) {
		const town = {
			id: stream.getU32(),
			name: stream.getString(),
			x: stream.getU16(),
			y: stream.getU16(),
			z: stream.getU8(),
		};
		stream.skipNodeBody();
		hooks?.onTown?.(town);
		return true;
	}
	if (type === OTBM_WAYPOINT) {
		const waypoint = {
			name: stream.getString(),
			x: stream.getU16(),
			y: stream.getU16(),
			z: stream.getU8(),
		};
		stream.skipNodeBody();
		hooks?.onWaypoint?.(waypoint);
		return true;
	}
	if (type !== OTBM_TOWNS && type !== OTBM_WAYPOINTS) return false;
	const childType = type === OTBM_TOWNS ? OTBM_TOWN : OTBM_WAYPOINT;
	while (stream.startNode()) {
		const child = stream.getU8();
		if (child === childType) emitSpecial(stream, child, hooks);
		else stream.skipNodeBody();
	}
	if (!stream.endNode()) throw new Error("OTBM towns/waypoints not closed");
	return true;
}

function parseMapData(
	stream: OtbmStream,
	box: OtbmBox | null,
	onTile: OtbmOnTile,
	hooks?: OtbmHooks,
): void {
	skipMapAttrs(stream);
	while (stream.startNode(OTBM_TILE_AREA)) {
		const baseX = stream.getU16();
		const baseY = stream.getU16();
		const z = stream.getU8();
		if (!areaHits(baseX, baseY, z, box)) {
			stream.skipNodeBody();
			continue;
		}
		while (stream.startNode()) {
			const tileType = stream.getU8();
			if (tileType === OTBM_TILE || tileType === OTBM_HOUSETILE) {
				parseTile(stream, tileType, baseX, baseY, z, box, onTile);
			} else stream.skipNodeBody();
		}
		if (!stream.endNode()) throw new Error("OTBM TILE_AREA not closed");
	}
	while (stream.startNode()) {
		const type = stream.getU8();
		if (!emitSpecial(stream, type, hooks)) stream.skipNodeBody();
	}
}

export function streamOtbm(
	path: string,
	box: OtbmBox | null,
	onTile: OtbmOnTile,
	hooks?: OtbmHooks,
): void {
	const buf = readFileSync(path);
	if (buf.length < 5) throw new Error("OTBM too small");
	const stream = new OtbmStream(buf);
	stream.pos = 4;
	if (!stream.startNode()) throw new Error("OTBM missing root");
	stream.pos += 1;
	stream.getU32();
	stream.getU16();
	stream.getU16();
	stream.getU32();
	stream.getU32();
	if (stream.startNode(OTBM_MAP_DATA)) {
		parseMapData(stream, box, onTile, hooks);
		if (!stream.endNode()) throw new Error("OTBM MAP_DATA not closed");
	}
	while (stream.startNode()) {
		const type = stream.getU8();
		if (!emitSpecial(stream, type, hooks)) stream.skipNodeBody();
	}
	if (!stream.endNode()) throw new Error("OTBM root not closed");
	if (stream.pos !== buf.length || stream.depth !== 0) {
		throw new Error(`OTBM trailing bytes at ${stream.pos}`);
	}
}

function esc(out: number[], value: number): void {
	if (value === ESC || value === OTBM_NODE_START || value === END)
		out.push(ESC);
	out.push(value);
}

function escU16(out: number[], n: number): void {
	esc(out, n & 0xff);
	esc(out, (n >> 8) & 0xff);
}

function escU32(out: number[], n: number): void {
	escU16(out, n & 0xffff);
	escU16(out, (n >>> 16) & 0xffff);
}

function tile(
	out: number[],
	ox: number,
	oy: number,
	id: number,
	kids?: () => void,
): void {
	out.push(OTBM_NODE_START, OTBM_TILE);
	esc(out, ox);
	esc(out, oy);
	esc(out, OTBM_ATTR_ITEM);
	escU16(out, id);
	if (kids) kids();
	out.push(END);
}

function area(
	out: number[],
	x: number,
	y: number,
	z: number,
	body: () => void,
): void {
	out.push(OTBM_NODE_START, OTBM_TILE_AREA);
	escU16(out, x);
	escU16(out, y);
	esc(out, z);
	body();
	out.push(END);
}

/** Tiny OTBM v4: crop tile, z-miss, box-miss, type 19, unknown type. */
export function buildFixtureOtbm(): Buffer {
	const out: number[] = [0, 0, 0, 0];
	out.push(OTBM_NODE_START, 0);
	escU32(out, 4);
	escU16(out, 8);
	escU16(out, 8);
	escU32(out, 4);
	escU32(out, 4);
	out.push(OTBM_NODE_START, OTBM_MAP_DATA);
	area(out, 100, 200, 8, () => {
		tile(out, 5, 6, 351, () => {
			out.push(OTBM_NODE_START, OTBM_ITEM);
			escU16(out, 3231);
			out.push(END);
			out.push(OTBM_NODE_START, OTBM_TILE_ZONE);
			escU16(out, 0);
			out.push(END);
		});
	});
	area(out, 100, 200, 9, () => tile(out, 0, 0, 1));
	area(out, 20000, 20000, 8, () => tile(out, 0, 0, 2));
	out.push(OTBM_NODE_START, OTBM_TILE_ZONE);
	escU16(out, 0);
	out.push(END, OTBM_NODE_START, 77, END, END, END);
	return Buffer.from(out);
}

/** Skipped TILE_AREA first, item id 0xFE (escaped). Crop tile after must still yield. */
export function buildEscapedSkipOtbm(): Buffer {
	const out: number[] = [0, 0, 0, 0];
	out.push(OTBM_NODE_START, 0);
	escU32(out, 4);
	escU16(out, 8);
	escU16(out, 8);
	escU32(out, 4);
	escU32(out, 4);
	out.push(OTBM_NODE_START, OTBM_MAP_DATA);
	area(out, 0, 0, 8, () => tile(out, 0, 0, 0xfe));
	area(out, 100, 200, 8, () => tile(out, 5, 6, 351));
	out.push(END, END);
	return Buffer.from(out);
}

export function writeFixtureOtbm(destPath: string): void {
	writeFileSync(destPath, buildFixtureOtbm());
}

/** Skipped area holds escaped 0xFE/0xFF tile bytes; crop tile follows. */
export function buildEscapeFixtureOtbm(): Buffer {
	const out: number[] = [0, 0, 0, 0];
	out.push(OTBM_NODE_START, 0);
	escU32(out, 4);
	escU16(out, 8);
	escU16(out, 8);
	escU32(out, 4);
	escU32(out, 4);
	out.push(OTBM_NODE_START, OTBM_MAP_DATA);
	area(out, 20000, 20000, 8, () => {
		tile(out, 5, 0xff, 0x00ff);
		tile(out, 0xfd, 0xfe, 0x02fe);
	});
	area(out, 100, 200, 8, () => tile(out, 5, 6, 351));
	out.push(END, END);
	return Buffer.from(out);
}
