set -e
echo "--- Deleting studio-latest web universal release outputs ---"

set -x
rm -rf build/studio-latest/web/universal-release/

set +x
echo "--- DONE ---"
