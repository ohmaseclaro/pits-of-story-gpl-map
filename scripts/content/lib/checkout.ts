import { existsSync } from "node:fs";
import { join } from "node:path";
import { CANARY_DIR } from "../config.ts";

export function fixturesAllowed(): boolean {
	return process.argv.includes("--fixtures");
}

/** Pinned canary tree from SOURCE.json / fetch.sh, or null when CI uses fixtures. */
export function resolveCanaryDir(root: string): string | null {
	const dir = join(root, CANARY_DIR);
	return existsSync(dir) ? dir : null;
}

/** Missing checkout is a build error unless tests pass --fixtures. */
export function requireCanaryDir(root: string): string | null {
	const dir = resolveCanaryDir(root);
	if (dir) return dir;
	if (fixturesAllowed()) return null;
	throw new Error(
		`missing ${CANARY_DIR}; run npm run content:fetch (authoring) or pass --fixtures`,
	);
}

export function canaryOrFixture(
	root: string,
	canaryRel: string,
	fixtureName: string,
): string {
	const canary = resolveCanaryDir(root);
	if (canary) {
		const path = join(canary, canaryRel);
		if (existsSync(path)) return path;
		throw new Error(`canary checkout missing ${canaryRel}`);
	}
	return join(root, "tests/fixtures/otserv", fixtureName);
}
