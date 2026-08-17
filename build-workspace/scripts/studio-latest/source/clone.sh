set -e
echo "--- Staging studio-latest source ---"

# The app source is this repo (the parent of build-workspace/). Nothing else
# is pulled in — the app is fully static and vendors its own assets.
set -x
rm -rf source/studio-latest
mkdir -p source/studio-latest

# Exclude generated and vendored trees. package-lock.json is deliberately
# included so the build can use `npm ci`.
rsync -a \
  --exclude build-workspace \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  ../ source/studio-latest/

set +x
echo "--- DONE ---"
