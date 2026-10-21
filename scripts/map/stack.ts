/** Client map stack + pattern variant. Authoring and tests. */

export const CLS_BANK = 0;
export const CLS_CLIP = 1;
export const CLS_BOTTOM = 2;
export const CLS_COMMON = 3;
export const CLS_TOP = 4;

export type StackFlags = {
	bank?: boolean;
	fullbank?: boolean;
	clip?: boolean;
	bottom?: boolean;
	top?: boolean;
};

export type PatternSize = {
	patternWidth: number;
	patternHeight: number;
	patternDepth: number;
};

export function patternVariant(
	absX: number,
	absY: number,
	absZ: number,
	size: PatternSize,
): { px: number; py: number; pz: number } {
	const pw = size.patternWidth > 0 ? size.patternWidth : 1;
	const ph = size.patternHeight > 0 ? size.patternHeight : 1;
	const pd = size.patternDepth > 0 ? size.patternDepth : 1;
	return { px: absX % pw, py: absY % ph, pz: absZ % pd };
}

export function frameKey(
	id: number,
	px: number,
	py: number,
	pz: number,
	phase = 0,
): string {
	return phase > 0
		? `${id}_${px}_${py}_${pz}_${phase}`
		: `${id}_${px}_${py}_${pz}`;
}

export function itemClass(flags: StackFlags | undefined): number {
	if (!flags) return CLS_COMMON;
	if (flags.bank || flags.fullbank) return CLS_BANK;
	if (flags.clip) return CLS_CLIP;
	if (flags.bottom) return CLS_BOTTOM;
	if (flags.top) return CLS_TOP;
	return CLS_COMMON;
}

/** Bank, clip, bottom, common in reverse stack order, top. */
export function clientStackOrder(classes: ArrayLike<number>): number[] {
	const n = classes.length;
	const idx = new Array<number>(n);
	for (let i = 0; i < n; i++) idx[i] = i;
	idx.sort((a, b) => {
		const ca = classes[a] ?? CLS_COMMON;
		const cb = classes[b] ?? CLS_COMMON;
		if (ca !== cb) return ca - cb;
		if (ca === CLS_COMMON) return b - a;
		return a - b;
	});
	return idx;
}

export function overlayAnchorPx(
	tx: number,
	ty: number,
	w: number,
	h: number,
	shiftX = 0,
	shiftY = 0,
	elev = 0,
	tile = 32,
): { x: number; y: number } {
	return {
		x: (tx + 1) * tile - w - shiftX - elev,
		y: (ty + 1) * tile - h - shiftY - elev,
	};
}

export const MAX_ELEV = 24;
