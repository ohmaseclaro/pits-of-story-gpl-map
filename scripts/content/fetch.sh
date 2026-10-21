#!/usr/bin/env bash
# Authoring-only. Downloads the pinned canary tree and otservbr.otbm.
# CI must never run this (CONTENT-01 / check-authoring-ci.cjs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT/scripts/content/SOURCE.json"

eval "$(
	node -e '
const fs = require("fs");
const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const emit = (key, value) => {
	process.stdout.write(key + "=" + JSON.stringify(String(value ?? "")) + "\n");
};
emit("CANARY_COMMIT", source.canaryCommit);
emit("CANARY_TARBALL_URL", source.canaryTarballUrl);
emit("CANARY_TARBALL_SHA256", source.canaryTarballSha256);
emit("OTBM_URL", source.otbmUrl);
emit("OTBM_SHA256", source.otbmSha256);
emit("OTBM_BYTES", source.otbmBytes);
' "$SOURCE"
)"

OTSERV="$ROOT/art-src/otserv"
CANARY_DIR="$OTSERV/canary-${CANARY_COMMIT}"
OTBM_PATH="$OTSERV/otservbr.otbm"

mkdir -p "$OTSERV"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TARBALL="$TMP/canary.tar.gz"
curl -fL --retry 3 -o "$TARBALL" "$CANARY_TARBALL_URL"

if [ -n "${CANARY_TARBALL_SHA256}" ]; then
	ACTUAL="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
	if [ "$ACTUAL" != "$CANARY_TARBALL_SHA256" ]; then
		echo "canary tarball sha256 mismatch: got $ACTUAL want $CANARY_TARBALL_SHA256" >&2
		exit 1
	fi
else
	echo "canary tarball sha256 (record in SOURCE.json): $(shasum -a 256 "$TARBALL" | awk '{print $1}')" >&2
fi

EXTRACT="$TMP/extract"
mkdir -p "$EXTRACT"
tar -xzf "$TARBALL" -C "$EXTRACT"
ARCHIVE_ROOT="$(find "$EXTRACT" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [ -z "$ARCHIVE_ROOT" ]; then
	echo "canary tarball had no top-level directory" >&2
	exit 1
fi

copy_keep() {
	local src="$1"
	local dest="$2"
	if [ ! -e "$src" ]; then
		echo "missing required path in tarball: $src" >&2
		exit 1
	fi
	mkdir -p "$(dirname "$dest")"
	cp -R "$src" "$dest"
}

rm -rf "$CANARY_DIR"
mkdir -p "$CANARY_DIR/src/utils" "$CANARY_DIR/src/creatures" "$CANARY_DIR/src/io"
copy_keep "$ARCHIVE_ROOT/data" "$CANARY_DIR/data"
copy_keep "$ARCHIVE_ROOT/data-otservbr-global" "$CANARY_DIR/data-otservbr-global"
copy_keep "$ARCHIVE_ROOT/src/utils/utils_definitions.hpp" "$CANARY_DIR/src/utils/utils_definitions.hpp"
copy_keep "$ARCHIVE_ROOT/src/creatures/creatures_definitions.hpp" "$CANARY_DIR/src/creatures/creatures_definitions.hpp"
copy_keep "$ARCHIVE_ROOT/src/io/io_bosstiary.hpp" "$CANARY_DIR/src/io/io_bosstiary.hpp"
copy_keep "$ARCHIVE_ROOT/LICENSE" "$CANARY_DIR/LICENSE"

curl -fL --retry 3 -o "$TMP/otservbr.otbm" "$OTBM_URL"
BYTES="$(wc -c <"$TMP/otservbr.otbm" | tr -d '[:space:]')"
if [ "$BYTES" != "$OTBM_BYTES" ]; then
	echo "otservbr.otbm size mismatch: got $BYTES want $OTBM_BYTES" >&2
	exit 1
fi
OTBM_ACTUAL="$(shasum -a 256 "$TMP/otservbr.otbm" | awk '{print $1}')"
if [ "$OTBM_ACTUAL" != "$OTBM_SHA256" ]; then
	echo "otservbr.otbm sha256 mismatch: got $OTBM_ACTUAL want $OTBM_SHA256" >&2
	exit 1
fi
mv "$TMP/otservbr.otbm" "$OTBM_PATH"

echo "$CANARY_DIR"
echo "$OTBM_PATH"
