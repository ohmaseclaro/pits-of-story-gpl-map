export type OutfitRow = {
	name: string;
	looktype: number;
	type: number;
	premium: boolean;
	from: string;
};

function attrs(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	const re = /(\w+)\s*=\s*"([^"]*)"/g;
	let match = re.exec(tag);
	while (match) {
		out[match[1]] = match[2];
		match = re.exec(tag);
	}
	return out;
}

function isYes(value: string | undefined): boolean {
	if (!value) return false;
	const lower = value.toLowerCase();
	return lower === "yes" || lower === "true" || lower === "1";
}

export function parseOutfits(text: string): OutfitRow[] {
	const rows: OutfitRow[] = [];
	const re = /<outfit\b([^>]*)\/?>/gi;
	let match = re.exec(text);
	while (match) {
		const a = attrs(match[1]);
		const name = a.name;
		const looktype = Number(a.looktype);
		if (name && Number.isFinite(looktype)) {
			rows.push({
				name,
				looktype,
				type: Number(a.type) || 0,
				premium: isYes(a.premium),
				from: a.from ?? "",
			});
		}
		match = re.exec(text);
	}
	return rows;
}
