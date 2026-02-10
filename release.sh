#!/bin/bash
set -e

VERSION_TYPE=${1:-patch}

if [[ "$VERSION_TYPE" != "patch" && "$VERSION_TYPE" != "minor" && "$VERSION_TYPE" != "major" ]]; then
  echo "Usage: ./release.sh [patch|minor|major]"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working directory not clean. Commit or stash changes first."
  exit 1
fi

echo "Releasing @granularjs/core ($VERSION_TYPE)..."

npm version $VERSION_TYPE -m "release: v%s"

npm publish --access public

echo "Published $(node -p "require('./package.json').name")@$(node -p "require('./package.json').version")"
