set -e
echo "--- Building studio-latest for web universal release ---"

export COMMIT=$(git -C .. log -1 --format="%H" 2>/dev/null | cut -c -8)
echo "Building:"
echo "  commit: ${COMMIT:-unknown}"
echo ""

set -x
cd source/studio-latest

npm ci
npm run build

cd ../../

OUTPUT_DIR=build/studio-latest/web/universal-release
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -PR source/studio-latest/dist "$OUTPUT_DIR/dist"

set +x
echo ""
echo "Artifact:"
echo "  $OUTPUT_DIR/dist/   (static site — publish this directory)"
echo ""
echo "--- DONE ---"
