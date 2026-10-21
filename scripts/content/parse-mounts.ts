export type MountRow = {
	name: string;
	looktype: number;
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

export function parseMounts(text: string): MountRow[] {
	const rows: MountRow[] = [];
	const re = /<mount\b([^>]*)\/?>/gi;
	let match = re.exec(text);
	while (match) {
		const a = attrs(match[1]);
		const name = a.name;
		const looktype = Number(a.looktype ?? a.clientid);
		if (name && Number.isFinite(looktype)) {
			rows.push({ name, looktype });
		}
		match = re.exec(text);
	}
	return rows;
}
