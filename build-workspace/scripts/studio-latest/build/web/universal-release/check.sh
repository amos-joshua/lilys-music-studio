echo "--- Checking studio-latest web universal release output ---"

# `vite build` emits index.html at the root of dist/ as the last
# meaningful step — its presence signals a complete build.
SENTINEL="./build/studio-latest/web/universal-release/dist/index.html"

echo "Working directory: ${PWD}"
echo "Sentinel:          $SENTINEL"

if [ -f "$SENTINEL" ]; then
    echo "Build artifact present."
    exit 0
fi

echo "Build artifact not found."
exit 1
