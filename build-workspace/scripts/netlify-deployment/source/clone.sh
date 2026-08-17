set -e
echo "--- Staging netlify-deployment source ---"

# Deployment consumes the static site produced by studio-latest.
DIST_DIR="build/studio-latest/web/universal-release/dist"
if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "ERROR: $DIST_DIR not found."
    echo "Run scripts/studio-latest/build/web/universal-release/run.sh first."
    exit 1
fi
echo "Using site build: $DIST_DIR"

set -x
rm -rf source/netlify-deployment
mkdir -p source/netlify-deployment
cp -PR "$DIST_DIR" source/netlify-deployment/dist

set +x
echo "--- DONE ---"
