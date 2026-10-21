export type ShopRow = {
	itemName: string;
	clientId: number;
	buy?: number;
	sell?: number;
};

export type ParsedShop = {
	npc: string;
	voice: string;
	voices: string[];
	outfit: {
		lookType: number;
		head: number;
		body: number;
		legs: number;
		feet: number;
	};
	rows: ShopRow[];
};

function stripLineComments(source: string): string {
	return source.replace(/--[^\n]*/g, "");
}

function matchingBrace(source: string, openAt: number): number {
	let depth = 0;
	for (let i = openAt; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function blockAfter(source: string, needle: RegExp): string {
	const match = needle.exec(source);
	if (!match) return "";
	const brace = source.indexOf("{", match.index + match[0].length - 1);
	if (brace < 0) return "";
	const end = matchingBrace(source, brace);
	if (end < 0) return "";
	return source.slice(brace + 1, end);
}

function fieldNum(block: string, names: readonly string[]): number {
	for (const name of names) {
		const match = new RegExp(`\\b${name}\\s*=\\s*(-?\\d+)`, "i").exec(block);
		if (match) return Number(match[1]);
	}
	return 0;
}

function fieldStr(block: string, names: readonly string[]): string {
	for (const name of names) {
		const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(block);
		if (match) return match[1];
	}
	return "";
}

function parseShopRows(shopBlock: string): ShopRow[] {
	const rows: ShopRow[] = [];
	const rowRe = /\{([^{}]*)\}/g;
	for (
		let match = rowRe.exec(shopBlock);
		match;
		match = rowRe.exec(shopBlock)
	) {
		const body = match[1];
		const itemName = fieldStr(body, ["itemName", "itemname"]);
		const clientId = fieldNum(body, ["clientId", "clientid"]);
		if (!itemName || clientId === 0) continue;
		const buy = fieldNum(body, ["buy"]);
		const sell = fieldNum(body, ["sell"]);
		const row: ShopRow = { itemName, clientId };
		if (/\bbuy\s*=/.test(body)) row.buy = buy;
		if (/\bsell\s*=/.test(body)) row.sell = sell;
		rows.push(row);
	}
	return rows;
}

export function parseShops(source: string): ParsedShop[] {
	const text = stripLineComments(source);
	const call = /createNpcType\s*\(\s*(?:"([^"]+)"|([A-Za-z_]\w*))\s*\)/.exec(
		text,
	);
	let npc = call?.[1] ?? "";
	if (!npc && call?.[2]) {
		npc =
			new RegExp(`\\blocal\\s+${call[2]}\\s*=\\s*"([^"]+)"`).exec(text)?.[1] ??
			"";
	}
	if (!npc) {
		npc =
			/internalNpcName\s*=\s*"([^"]+)"/.exec(text)?.[1] ??
			fieldStr(text, ["name"]);
	}
	if (!npc) return [];

	const outfitBlock = blockAfter(text, /npcConfig\.outfit\s*=/);
	const voicesBlock = blockAfter(text, /npcConfig\.voices\s*=/);
	const shopBlock = blockAfter(text, /npcConfig\.shop\s*=/);
	const voices: string[] = [];
	const textRe = /\btext\s*=\s*"([^"]*)"/g;
	const voiceSrc = voicesBlock || text;
	for (
		let voiceMatch = textRe.exec(voiceSrc);
		voiceMatch;
		voiceMatch = textRe.exec(voiceSrc)
	) {
		voices.push(voiceMatch[1]);
	}
	const voice =
		voices.find((line) => line.includes("Al Dee's")) ?? voices[0] ?? "";

	return [
		{
			npc,
			voice,
			voices,
			outfit: {
				lookType: fieldNum(outfitBlock, ["looktype", "lookType"]),
				head: fieldNum(outfitBlock, ["head", "lookHead"]),
				body: fieldNum(outfitBlock, ["body", "lookBody"]),
				legs: fieldNum(outfitBlock, ["legs", "lookLegs"]),
				feet: fieldNum(outfitBlock, ["feet", "lookFeet"]),
			},
			rows: parseShopRows(shopBlock),
		},
	];
}
