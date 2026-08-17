echo "--- Checking studio-latest source ---"

# clone.sh rsyncs the whole repo; the lockfile is what the build needs most
# (`npm ci` refuses to run without it), so check for that rather than any
# arbitrary source file.
PKG_SENTINEL="./source/studio-latest/package.json"
LOCK_SENTINEL="./source/studio-latest/package-lock.json"

echo "Working directory: ${PWD}"
echo "Package sentinel:  $PKG_SENTINEL"
echo "Lockfile sentinel: $LOCK_SENTINEL"

if [ -f "$PKG_SENTINEL" ] && [ -f "$LOCK_SENTINEL" ]; then
    echo "Source seems to be staged."
    exit 0
fi

echo "Source is incomplete. Run clone.sh."
exit 1
