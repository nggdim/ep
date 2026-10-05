#!/bin/bash
# Pull an image from Docker Hub with crane and push it to Harbor.
# Usage: TARGET_TAG=dev_v0.0.27 bin/crane-mirror.sh
set -euo pipefail

CRANE="${CRANE:-crane}"
SOURCE_IMAGE="${SOURCE_IMAGE:-pybern/ep:main}"
SOURCE_REPO="${SOURCE_IMAGE%:*}"
DOCKERHUB_HOST="index.docker.io"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-}"
DOCKERHUB_TOKEN="${DOCKERHUB_TOKEN:-}"

HARBOR_HOST="${HARBOR_HOST:-dpsauatdk01.intra.hkma.gov.hk:8443}"
HARBOR_REPO="${HARBOR_REPO:-tois/tois}"
HARBOR_USERNAME="${HARBOR_USERNAME:-}"
HARBOR_TOKEN="${HARBOR_TOKEN:-}"
TARGET_TAG="${TARGET_TAG:-}"

TARBALL="${TARBALL:-./$(basename "$SOURCE_REPO")-${SOURCE_IMAGE##*:}.tar}"

export NO_PROXY="${NO_PROXY:-${HARBOR_HOST%:*},localhost,127.0.0.1}"
export no_proxy="$NO_PROXY"

if ! command -v "$CRANE" >/dev/null 2>&1; then
  echo "crane not found. Install from https://github.com/google/go-containerregistry/blob/main/cmd/crane/README.md"
  exit 1
fi

if [ -z "$TARGET_TAG" ]; then
  read -r -p "Target tag (e.g. dev_v0.0.27): " TARGET_TAG
fi
[ -n "$TARGET_TAG" ] || { echo "TARGET_TAG is required."; exit 1; }

TARGET_IMAGE="${HARBOR_HOST}/${HARBOR_REPO}:${TARGET_TAG}"

# Docker Hub auth
[ -n "$DOCKERHUB_USERNAME" ] || read -r -p "Docker Hub username: " DOCKERHUB_USERNAME
[ -n "$DOCKERHUB_TOKEN" ] || { read -r -s -p "Docker Hub access token: " DOCKERHUB_TOKEN; echo; }
printf '%s' "$DOCKERHUB_TOKEN" | "$CRANE" auth login "$DOCKERHUB_HOST" \
  --username "$DOCKERHUB_USERNAME" --password-stdin

echo "Pulling $SOURCE_IMAGE -> $TARBALL"
"$CRANE" pull "$SOURCE_IMAGE" "$TARBALL"

echo "Available tags for $SOURCE_REPO:"
"$CRANE" ls "$SOURCE_REPO"

# Harbor auth
[ -n "$HARBOR_USERNAME" ] || read -r -p "Harbor username: " HARBOR_USERNAME
[ -n "$HARBOR_TOKEN" ] || { read -r -s -p "Harbor password or robot token: " HARBOR_TOKEN; echo; }
printf '%s' "$HARBOR_TOKEN" | "$CRANE" auth login "$HARBOR_HOST" \
  --username "$HARBOR_USERNAME" --password-stdin

echo "Pushing $TARBALL -> $TARGET_IMAGE"
"$CRANE" push "$TARBALL" "$TARGET_IMAGE"

echo "Verifying digest:"
"$CRANE" digest "$TARGET_IMAGE"

echo "Done: $TARGET_IMAGE"
