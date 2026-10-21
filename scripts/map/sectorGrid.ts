/** The region editor's sector grid, shared by the editor (tools/region-editor) and its index builder. */
export const SECTOR = 256;
export const SECTOR_BIN_BYTES = 327680;
export const CELL_BYTES = 5;
export const EMPTY_ID = 0xffff;

export function sectorOrigin(x: number, y: number): { bx: number; by: number } {
	return {
		bx: Math.floor(x / SECTOR) * SECTOR,
		by: Math.floor(y / SECTOR) * SECTOR,
	};
}
