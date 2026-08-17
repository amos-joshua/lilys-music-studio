echo "--- Checking netlify-deployment source ---"

SENTINEL="./source/netlify-deployment/dist/index.html"

echo "Working directory: ${PWD}"
echo "Sentinel:          $SENTINEL"

if [ -f "$SENTINEL" ]; then
    echo "Source seems to be staged."
    exit 0
fi

echo "Source is incomplete. Run clone.sh after building studio-latest."
exit 1
