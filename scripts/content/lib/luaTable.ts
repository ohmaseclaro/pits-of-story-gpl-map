export type LuaValue =
	| null
	| boolean
	| number
	| string
	| LuaValue[]
	| { [key: string]: LuaValue };

export type LuaMonsterTable = {
	name: string;
	lookType: number;
	[key: string]: LuaValue | string | number | undefined;
};

class Parser {
	i = 0;
	s: string;
	constructor(s: string) {
		this.s = s;
	}

	skipWs(): void {
		while (this.i < this.s.length && /\s/.test(this.s[this.i] ?? ""))
			this.i += 1;
	}

	skipTrivia(): void {
		for (;;) {
			this.skipWs();
			if (this.s.startsWith("--[[", this.i)) {
				const end = this.s.indexOf("]]", this.i + 4);
				this.i = end < 0 ? this.s.length : end + 2;
				continue;
			}
			if (this.s.startsWith("--", this.i)) {
				const end = this.s.indexOf("\n", this.i);
				this.i = end < 0 ? this.s.length : end + 1;
				continue;
			}
			break;
		}
	}

	peek(): string {
		this.skipTrivia();
		return this.s[this.i] ?? "";
	}

	parseIdent(): string {
		this.skipTrivia();
		const start = this.i;
		const first = this.s[this.i];
		if (!first || !/[A-Za-z_]/.test(first)) {
			throw new Error(`expected identifier at ${this.i}`);
		}
		this.i += 1;
		while (
			this.i < this.s.length &&
			/[A-Za-z0-9_]/.test(this.s[this.i] ?? "")
		) {
			this.i += 1;
		}
		return this.s.slice(start, this.i);
	}

	parseNumber(): number {
		this.skipTrivia();
		const start = this.i;
		while (this.i < this.s.length && /[0-9]/.test(this.s[this.i] ?? ""))
			this.i += 1;
		if (this.s[this.i] === ".") {
			this.i += 1;
			while (this.i < this.s.length && /[0-9]/.test(this.s[this.i] ?? ""))
				this.i += 1;
		}
		const n = Number(this.s.slice(start, this.i));
		if (start === this.i || !Number.isFinite(n)) {
			throw new Error(`expected number at ${start}`);
		}
		return n;
	}

	parseString(): string {
		this.skipTrivia();
		const q = this.s[this.i];
		if (q !== '"' && q !== "'") throw new Error(`expected string at ${this.i}`);
		this.i += 1;
		let out = "";
		while (this.i < this.s.length) {
			const c = this.s[this.i] ?? "";
			this.i += 1;
			if (c === q) return out;
			if (c !== "\\") {
				out += c;
				continue;
			}
			const n = this.s[this.i] ?? "";
			this.i += 1;
			if (n === "z") {
				while (this.i < this.s.length && /\s/.test(this.s[this.i] ?? ""))
					this.i += 1;
				continue;
			}
			if (n === "n") out += "\n";
			else if (n === "t") out += "\t";
			else out += n;
		}
		throw new Error("unterminated string");
	}

	parseTable(): LuaValue {
		if (this.peek() !== "{") throw new Error(`expected { at ${this.i}`);
		this.i += 1;
		const map: Record<string, LuaValue> = {};
		const list: LuaValue[] = [];
		for (;;) {
			if (this.peek() === "}") {
				this.i += 1;
				break;
			}
			if (this.peek() === ",") {
				this.i += 1;
				continue;
			}
			if (this.peek() === "[") {
				this.i += 1;
				const key = this.parseExpr();
				if (this.peek() !== "]") throw new Error(`expected ] at ${this.i}`);
				this.i += 1;
				if (this.peek() !== "=") throw new Error(`expected = at ${this.i}`);
				this.i += 1;
				map[String(key)] = this.parseExpr();
				continue;
			}
			const saved = this.i;
			if (/[A-Za-z_]/.test(this.peek())) {
				const ident = this.parseIdent();
				if (this.peek() === "=") {
					this.i += 1;
					map[ident] = this.parseExpr();
					continue;
				}
				this.i = saved;
			}
			list.push(this.parseExpr());
		}
		return packTable(map, list);
	}

	parseAtom(): LuaValue {
		const c = this.peek();
		if (c === "{") return this.parseTable();
		if (c === '"' || c === "'") return this.parseString();
		if (c === "(") {
			this.i += 1;
			const inner = this.parseExpr();
			if (this.peek() !== ")") throw new Error(`expected ) at ${this.i}`);
			this.i += 1;
			return inner;
		}
		if (c >= "0" && c <= "9") return this.parseNumber();
		const ident = this.parseIdent();
		if (ident === "true") return true;
		if (ident === "false") return false;
		if (ident === "nil") return null;
		return ident;
	}

	parseUnary(): LuaValue {
		if (this.peek() === "-") {
			this.i += 1;
			const v = this.parseUnary();
			if (typeof v !== "number") throw new Error(`unary minus on ${typeof v}`);
			return -v;
		}
		return this.parseAtom();
	}

	parseMul(): LuaValue {
		let left = this.parseUnary();
		for (;;) {
			const op = this.peek();
			if (op !== "*" && op !== "/") break;
			this.i += 1;
			const right = this.parseUnary();
			if (typeof left !== "number" || typeof right !== "number") {
				throw new Error("arithmetic needs numbers");
			}
			left = op === "*" ? left * right : left / right;
		}
		return left;
	}

	parseExpr(): LuaValue {
		let left = this.parseMul();
		for (;;) {
			const op = this.peek();
			if (op !== "+" && op !== "-") break;
			this.i += 1;
			const right = this.parseMul();
			if (typeof left !== "number" || typeof right !== "number") {
				throw new Error("arithmetic needs numbers");
			}
			left = op === "+" ? left + right : left - right;
		}
		return left;
	}
}

function packTable(map: Record<string, LuaValue>, list: LuaValue[]): LuaValue {
	const keys = Object.keys(map);
	if (keys.length === 0) return list;
	if (list.length === 0) return map;
	const mixed: Record<string, LuaValue> = { ...map };
	list.forEach((value, index) => {
		mixed[String(index + 1)] = value;
	});
	return mixed;
}

export function parseLuaTable(source: string): LuaValue {
	const parser = new Parser(source);
	return parser.parseExpr();
}

function lookTypeOf(outfit: LuaValue | undefined): number {
	if (!outfit || typeof outfit !== "object" || Array.isArray(outfit)) return 0;
	const value = outfit.lookType;
	return typeof value === "number" ? value : 0;
}

export function armorFromDefenses(defenses: LuaValue | undefined): number {
	if (!defenses || typeof defenses !== "object" || Array.isArray(defenses)) {
		return 0;
	}
	const value = defenses.armor;
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, value)
		: 0;
}

export function parseMonsterLua(source: string): LuaMonsterTable {
	const created = source.match(
		/(?:Game\.)?createMonsterType\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/,
	);
	if (!created) throw new Error("missing createMonsterType");
	const name = created[1] ?? created[2] ?? "";
	const stop = source.search(/mType:register/);
	const body = stop >= 0 ? source.slice(0, stop) : source;
	const table: Record<string, LuaValue> = {};
	const assign = /monster\.(\w+)\s*=/g;
	let match: RegExpExecArray | null = assign.exec(body);
	while (match) {
		const field = match[1] ?? "";
		const parser = new Parser(body);
		parser.i = assign.lastIndex;
		table[field] = parser.parseExpr();
		assign.lastIndex = parser.i;
		match = assign.exec(body);
	}
	return {
		...table,
		name,
		lookType: lookTypeOf(table.outfit),
		armor: armorFromDefenses(table.defenses),
	};
}
