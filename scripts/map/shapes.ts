export type MaskBits = { w: number; h: number; bits: Uint8Array };
export type MaskLoader = (path: string) => MaskBits;

export type RegionShape =
	| { kind: "rect"; x: number; y: number; w: number; h: number }
	| { kind: "square"; cx: number; cy: number; size: number }
	| { kind: "circle"; cx: number; cy: number; r: number }
	| { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
	| { kind: "ngon"; cx: number; cy: number; n: number; r: number; rot: number }
	| {
			kind: "star";
			cx: number;
			cy: number;
			points: number;
			rOuter: number;
			rInner: number;
			rot: number;
	  }
	| { kind: "poly"; points: [number, number][] }
	| { kind: "mask"; path: `${string}.pbm`; x: number; y: number }
	| { kind: "union"; a: RegionShape; b: RegionShape }
	| { kind: "difference"; a: RegionShape; b: RegionShape }
	| { kind: "intersection"; a: RegionShape; b: RegionShape }
	| {
			/** add/remove are absolute world tiles (D-02), not raster-local indices. */
			kind: "paint";
			base: RegionShape;
			add: readonly (readonly [number, number])[];
			remove: readonly (readonly [number, number])[];
	  };

export type PaintShape = Extract<RegionShape, { kind: "paint" }>;

export const MAX_SIDE = 80;

function cross(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	px: number,
	py: number,
): number {
	return (bx - ax) * (py - ay) - (px - ax) * (by - ay);
}

function onEdge(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	px: number,
	py: number,
): boolean {
	if (cross(ax, ay, bx, by, px, py) !== 0) return false;
	const minx = ax < bx ? ax : bx;
	const maxx = ax > bx ? ax : bx;
	const miny = ay < by ? ay : by;
	const maxy = ay > by ? ay : by;
	return px >= minx && px <= maxx && py >= miny && py <= maxy;
}

function polyHas(px: number, py: number, pts: [number, number][]): boolean {
	const n = pts.length;
	if (n < 3) return false;
	let wn = 0;
	for (let i = 0; i < n; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % n];
		if (!a || !b) continue;
		if (onEdge(a[0], a[1], b[0], b[1], px, py)) return true;
		if (a[1] <= py) {
			if (b[1] > py && cross(a[0], a[1], b[0], b[1], px, py) > 0) wn++;
		} else if (b[1] <= py && cross(a[0], a[1], b[0], b[1], px, py) < 0) {
			wn--;
		}
	}
	return wn !== 0;
}

function regularVerts(
	cx: number,
	cy: number,
	n: number,
	r: number,
	rot: number,
): [number, number][] {
	const verts: [number, number][] = [];
	const base = (rot * Math.PI) / 180;
	for (let i = 0; i < n; i++) {
		const a = base + (2 * Math.PI * i) / n;
		verts.push([
			Math.round(cx + r * Math.cos(a)),
			Math.round(cy + r * Math.sin(a)),
		]);
	}
	return verts;
}

function starVerts(
	cx: number,
	cy: number,
	points: number,
	rOuter: number,
	rInner: number,
	rot: number,
): [number, number][] {
	const verts: [number, number][] = [];
	const base = (rot * Math.PI) / 180;
	const n = points * 2;
	for (let i = 0; i < n; i++) {
		const r = i % 2 === 0 ? rOuter : rInner;
		const a = base + (Math.PI * i) / points;
		verts.push([
			Math.round(cx + r * Math.cos(a)),
			Math.round(cy + r * Math.sin(a)),
		]);
	}
	return verts;
}

function inside(
	shape: RegionShape,
	lx: number,
	ly: number,
	originX: number,
	originY: number,
	loadMask?: MaskLoader,
): boolean {
	switch (shape.kind) {
		case "rect":
			return (
				lx >= shape.x &&
				lx < shape.x + shape.w &&
				ly >= shape.y &&
				ly < shape.y + shape.h
			);
		case "square": {
			const half = (shape.size - 1) >> 1;
			const x0 = shape.cx - half;
			const y0 = shape.cy - half;
			return (
				lx >= x0 && lx < x0 + shape.size && ly >= y0 && ly < y0 + shape.size
			);
		}
		case "circle": {
			const dx = lx - shape.cx;
			const dy = ly - shape.cy;
			return dx * dx + dy * dy <= shape.r * shape.r;
		}
		case "ellipse": {
			const dx = lx - shape.cx;
			const dy = ly - shape.cy;
			return (
				dx * dx * shape.ry * shape.ry + dy * dy * shape.rx * shape.rx <=
				shape.rx * shape.rx * shape.ry * shape.ry
			);
		}
		case "ngon":
			return polyHas(
				lx,
				ly,
				regularVerts(shape.cx, shape.cy, shape.n, shape.r, shape.rot),
			);
		case "star":
			// hexagram = 6-point star as two overlapping triangles (centre filled)
			if (shape.points === 6) {
				return (
					polyHas(
						lx,
						ly,
						regularVerts(shape.cx, shape.cy, 3, shape.rOuter, shape.rot),
					) ||
					polyHas(
						lx,
						ly,
						regularVerts(shape.cx, shape.cy, 3, shape.rOuter, shape.rot + 60),
					)
				);
			}
			return polyHas(
				lx,
				ly,
				starVerts(
					shape.cx,
					shape.cy,
					shape.points,
					shape.rOuter,
					shape.rInner,
					shape.rot,
				),
			);
		case "poly":
			return polyHas(lx, ly, shape.points);
		case "mask": {
			if (!shape.path.endsWith(".pbm")) {
				throw new Error(`mask path must be .pbm: ${shape.path}`);
			}
			if (!loadMask) throw new Error("mask shape needs a loader");
			const pbm = loadMask(shape.path);
			const x = lx - shape.x;
			const y = ly - shape.y;
			if (x < 0 || y < 0 || x >= pbm.w || y >= pbm.h) return false;
			return pbm.bits[y * pbm.w + x] === 1;
		}
		case "union":
			return (
				inside(shape.a, lx, ly, originX, originY, loadMask) ||
				inside(shape.b, lx, ly, originX, originY, loadMask)
			);
		case "difference":
			return (
				inside(shape.a, lx, ly, originX, originY, loadMask) &&
				!inside(shape.b, lx, ly, originX, originY, loadMask)
			);
		case "intersection":
			return (
				inside(shape.a, lx, ly, originX, originY, loadMask) &&
				inside(shape.b, lx, ly, originX, originY, loadMask)
			);
		case "paint": {
			for (const [x, y] of shape.remove) {
				if (x === lx && y === ly) return false;
			}
			for (const [x, y] of shape.add) {
				if (x === lx && y === ly) return true;
			}
			return inside(shape.base, lx, ly, originX, originY, loadMask);
		}
		default: {
			const _n: never = shape;
			return _n;
		}
	}
}

function vertsBounds(verts: [number, number][]): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	if (verts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
	let minX = verts[0][0];
	let minY = verts[0][1];
	let maxX = minX;
	let maxY = minY;
	for (let i = 1; i < verts.length; i++) {
		const p = verts[i];
		if (p[0] < minX) minX = p[0];
		if (p[1] < minY) minY = p[1];
		if (p[0] > maxX) maxX = p[0];
		if (p[1] > maxY) maxY = p[1];
	}
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function unionBounds(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
	const x0 = a.x < b.x ? a.x : b.x;
	const y0 = a.y < b.y ? a.y : b.y;
	const x1 = a.x + a.w > b.x + b.w ? a.x + a.w : b.x + b.w;
	const y1 = a.y + a.h > b.y + b.h ? a.y + a.h : b.y + b.h;
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function intersectBounds(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
	const x0 = a.x > b.x ? a.x : b.x;
	const y0 = a.y > b.y ? a.y : b.y;
	const x1 = a.x + a.w < b.x + b.w ? a.x + a.w : b.x + b.w;
	const y1 = a.y + a.h < b.y + b.h ? a.y + a.h : b.y + b.h;
	return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function shapeBounds(
	shape: RegionShape,
	loadMask?: MaskLoader,
): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	switch (shape.kind) {
		case "rect":
			return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
		case "square": {
			const half = (shape.size - 1) >> 1;
			return {
				x: shape.cx - half,
				y: shape.cy - half,
				w: shape.size,
				h: shape.size,
			};
		}
		case "circle":
			return {
				x: shape.cx - shape.r,
				y: shape.cy - shape.r,
				w: 2 * shape.r + 1,
				h: 2 * shape.r + 1,
			};
		case "ellipse":
			return {
				x: shape.cx - shape.rx,
				y: shape.cy - shape.ry,
				w: 2 * shape.rx + 1,
				h: 2 * shape.ry + 1,
			};
		case "ngon":
			return vertsBounds(
				regularVerts(shape.cx, shape.cy, shape.n, shape.r, shape.rot),
			);
		case "star":
			return vertsBounds(
				starVerts(
					shape.cx,
					shape.cy,
					shape.points,
					shape.rOuter,
					shape.rInner,
					shape.rot,
				),
			);
		case "poly":
			return vertsBounds(shape.points);
		case "mask": {
			if (!shape.path.endsWith(".pbm")) {
				throw new Error(`mask path must be .pbm: ${shape.path}`);
			}
			if (!loadMask) throw new Error("mask shape needs a loader");
			const pbm = loadMask(shape.path);
			return { x: shape.x, y: shape.y, w: pbm.w, h: pbm.h };
		}
		case "union":
			return unionBounds(
				shapeBounds(shape.a, loadMask),
				shapeBounds(shape.b, loadMask),
			);
		case "intersection":
			return intersectBounds(
				shapeBounds(shape.a, loadMask),
				shapeBounds(shape.b, loadMask),
			);
		case "difference":
			return shapeBounds(shape.a, loadMask);
		case "paint": {
			const base = shapeBounds(shape.base, loadMask);
			let { x, y, w, h } = base;
			for (const [px, py] of shape.add) {
				const x0 = px < x ? px : x;
				const y0 = py < y ? py : y;
				const x1 = px + 1 > x + w ? px + 1 : x + w;
				const y1 = py + 1 > y + h ? py + 1 : y + h;
				x = x0;
				y = y0;
				w = x1 - x0;
				h = y1 - y0;
			}
			return { x, y, w, h };
		}
		default: {
			const _n: never = shape;
			return _n;
		}
	}
}

export function rasterize(
	shape: RegionShape,
	originX: number,
	originY: number,
	w: number,
	h: number,
	loadMask?: MaskLoader,
): Uint8Array {
	if (shape.kind === "paint") {
		const out = rasterize(shape.base, originX, originY, w, h, loadMask);
		for (const [x, y] of shape.add) {
			const lx = x - originX;
			const ly = y - originY;
			if (lx >= 0 && ly >= 0 && lx < w && ly < h) {
				out[ly * w + lx] = 1;
			}
		}
		for (const [x, y] of shape.remove) {
			const lx = x - originX;
			const ly = y - originY;
			if (lx >= 0 && ly >= 0 && lx < w && ly < h) {
				out[ly * w + lx] = 0;
			}
		}
		return out;
	}
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (inside(shape, originX + x, originY + y, originX, originY, loadMask)) {
				out[y * w + x] = 1;
			}
		}
	}
	return out;
}

export type { ShapeAabb } from "./shapeAabb.ts";
export { shapeAabb } from "./shapeAabb.ts";
