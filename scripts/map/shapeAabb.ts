import type { MaskLoader, RegionShape } from "./shapes.ts";

export type ShapeAabb = { x: number; y: number; w: number; h: number };

function unionAabb(a: ShapeAabb, b: ShapeAabb): ShapeAabb {
	const x0 = a.x < b.x ? a.x : b.x;
	const y0 = a.y < b.y ? a.y : b.y;
	const x1 = a.x + a.w > b.x + b.w ? a.x + a.w : b.x + b.w;
	const y1 = a.y + a.h > b.y + b.h ? a.y + a.h : b.y + b.h;
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function shapeAabb(
	shape: RegionShape,
	loadMask?: MaskLoader,
): ShapeAabb {
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
				w: shape.r * 2 + 1,
				h: shape.r * 2 + 1,
			};
		case "ellipse":
			return {
				x: shape.cx - shape.rx,
				y: shape.cy - shape.ry,
				w: shape.rx * 2 + 1,
				h: shape.ry * 2 + 1,
			};
		case "ngon":
			return {
				x: shape.cx - shape.r,
				y: shape.cy - shape.r,
				w: shape.r * 2 + 1,
				h: shape.r * 2 + 1,
			};
		case "star":
			return {
				x: shape.cx - shape.rOuter,
				y: shape.cy - shape.rOuter,
				w: shape.rOuter * 2 + 1,
				h: shape.rOuter * 2 + 1,
			};
		case "poly": {
			if (shape.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
			let x0 = shape.points[0]?.[0] ?? 0;
			let y0 = shape.points[0]?.[1] ?? 0;
			let x1 = x0;
			let y1 = y0;
			for (const [x, y] of shape.points) {
				if (x < x0) x0 = x;
				if (y < y0) y0 = y;
				if (x > x1) x1 = x;
				if (y > y1) y1 = y;
			}
			return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
		}
		case "mask": {
			if (!loadMask) return { x: shape.x, y: shape.y, w: 0, h: 0 };
			const pbm = loadMask(shape.path);
			return { x: shape.x, y: shape.y, w: pbm.w, h: pbm.h };
		}
		case "union":
		case "difference":
		case "intersection":
			return unionAabb(
				shapeAabb(shape.a, loadMask),
				shapeAabb(shape.b, loadMask),
			);
		case "paint": {
			let box = shapeAabb(shape.base, loadMask);
			for (const [x, y] of shape.add) {
				box = unionAabb(box, { x, y, w: 1, h: 1 });
			}
			return box;
		}
		default: {
			const _n: never = shape;
			return _n;
		}
	}
}
