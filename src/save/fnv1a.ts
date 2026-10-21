export function fnv1a32(bytes: Uint8Array): string {
	let h = 0x811c9dc5;
	for (const b of bytes) {
		h ^= b;
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}
