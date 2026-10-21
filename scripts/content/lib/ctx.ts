import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT } from "../config.ts";
import { canaryOrFixture, resolveCanaryDir } from "./checkout.ts";
import { writeJson, writeSortedJson } from "./json.ts";
import {
	validateItemId as checkItemId,
	validateLookType as checkLookType,
	requireConfiguredName,
} from "./validate.ts";

export type ContentWarning = {
	file: string;
	line: number | null;
	message: string;
};

export type ContentCtx = {
	root: string;
	outDir: string;
	fixturesDir: string;
	canaryDir: string | null;
	config: typeof CONTENT;
	written: string[];
	warnings: ContentWarning[];
	unresolved: string[];
	writeJson: (fileName: string, data: unknown) => void;
	writeSortedJson: (fileName: string, data: unknown) => void;
	writeText: (fileName: string, text: string) => void;
	record: (fileName: string) => void;
	warn: (file: string, line: number | null, message: string) => void;
	failUnknown: (kind: string, name: string) => never;
	validateLookType: (lookType: number, file: string) => boolean;
	validateItemId: (id: number, file: string) => boolean;
	requireName: (kind: string, name: string, present: boolean) => void;
	canaryOrFixture: (canaryRel: string, fixtureName: string) => string;
};

export type ContentStep = {
	name: string;
	run: (ctx: ContentCtx) => void | Promise<void>;
};

export function createCtx(root: string): ContentCtx {
	const outDir = join(root, "public/content");
	mkdirSync(outDir, { recursive: true });
	const written: string[] = [];
	const warnings: ContentWarning[] = [];
	const unresolved: string[] = [];
	const record = (fileName: string) => {
		if (!written.includes(fileName)) written.push(fileName);
	};
	const warn = (file: string, line: number | null, message: string) => {
		warnings.push({ file, line, message });
	};
	return {
		root,
		outDir,
		fixturesDir: join(root, "tests/fixtures/otserv"),
		canaryDir: resolveCanaryDir(root),
		config: CONTENT,
		written,
		warnings,
		unresolved,
		writeJson(fileName, data) {
			writeJson(join(outDir, fileName), data);
			record(fileName);
		},
		writeSortedJson(fileName, data) {
			writeSortedJson(join(outDir, fileName), data);
			record(fileName);
		},
		writeText(fileName, text) {
			writeFileSync(
				join(outDir, fileName),
				text.endsWith("\n") ? text : `${text}\n`,
			);
			record(fileName);
		},
		record,
		warn,
		failUnknown(kind, name) {
			unresolved.push(`${kind}:${name}`);
			throw new Error(`unknown ${kind} name: ${name}`);
		},
		validateLookType(lookType, file) {
			return checkLookType(root, lookType, file, warn);
		},
		validateItemId(id, file) {
			return checkItemId(root, id, file, warn);
		},
		requireName(kind, name, present) {
			requireConfiguredName(kind, name, present);
		},
		canaryOrFixture(canaryRel, fixtureName) {
			return canaryOrFixture(root, canaryRel, fixtureName);
		},
	};
}
