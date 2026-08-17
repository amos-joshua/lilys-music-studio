echo "--- Checking netlify-deployment web universal release output ---"

# run.sh writes the CLI output to last-deploy.txt only after a deploy
# returns successfully — its presence signals the last deploy completed.
SENTINEL="./build/netlify-deployment/web/universal-release/last-deploy.txt"

echo "Working directory: ${PWD}"
echo "Sentinel:          $SENTINEL"

if [ -f "$SENTINEL" ]; then
    echo "Deploy receipt present."
    exit 0
fi

echo "No deploy receipt found."
exit 1
