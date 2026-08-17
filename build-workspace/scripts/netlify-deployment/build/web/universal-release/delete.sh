set -e
echo "--- Deleting netlify-deployment web universal release outputs ---"

set -x
rm -rf build/netlify-deployment/web/universal-release/

set +x
echo "--- DONE ---"
