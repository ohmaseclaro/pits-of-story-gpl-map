export type ImbueTier = "Basic" | "Intricate" | "Powerful";

export type ParsedImbuement = {
	name: string;
	tier: ImbueTier;
	category: string;
};

const TIERS: readonly ImbueTier[] = ["Basic", "Intricate", "Powerful"];

function attrs(tag: string): Map<string, string> {
	const out = new Map<string, string>();
	const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
	for (let match = re.exec(tag); match; match = re.exec(tag)) {
		out.set(match[1], match[2]);
	}
	return out;
}

function tierFromName(name: string): { tier: ImbueTier; rest: string } | null {
	for (const tier of TIERS) {
		if (name === tier) return { tier, rest: "" };
		const prefix = `${tier} `;
		if (name.startsWith(prefix))
			return { tier, rest: name.slice(prefix.length) };
	}
	return null;
}

export function parseImbuements(source: string): ParsedImbuement[] {
	const bases = new Map<string, ImbueTier>();
	const baseRe = /<base\b([^>]*)\/?>/gi;
	for (let tag = baseRe.exec(source); tag; tag = baseRe.exec(source)) {
		const a = attrs(tag[1]);
		const named = a.get("name");
		const split = named ? tierFromName(named) : null;
		if (split) bases.set(a.get("id") ?? named ?? "", split.tier);
	}

	const cats = new Map<string, string>();
	for (const m of source.matchAll(/<category\b([^>]*)\/?>/gi)) {
		const a = attrs(m[1]);
		const id = a.get("id");
		const catName = a.get("name");
		if (id && catName) cats.set(id, catName);
	}

	const rows: ParsedImbuement[] = [];
	const seen = new Set<string>();
	const imbueRe = /<imbuement\b([^>]*)\/?>/gi;
	for (let tag = imbueRe.exec(source); tag; tag = imbueRe.exec(source)) {
		const a = attrs(tag[1]);
		const rawName = a.get("name") ?? "";
		const fromName = tierFromName(rawName);
		const baseId = a.get("base") ?? a.get("baseid") ?? "";
		const tier = fromName?.tier ?? bases.get(baseId);
		if (!tier) continue;

		const categoryAttr = cats.get(a.get("category") ?? "") ?? undefined;
		const name = fromName?.rest || rawName || categoryAttr || "";
		const category = categoryAttr || name;
		if (!name) continue;

		const key = `${name}\0${tier}`;
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push({ name, tier, category });
	}

	return rows;
}
