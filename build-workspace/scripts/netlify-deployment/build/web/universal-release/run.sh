set -e
# pipefail so `netlify ... | tee` reports netlify's failure, not tee's
# success — otherwise a failed deploy still exits 0.
set -o pipefail
echo "--- Deploying netlify-deployment for web universal release ---"

# The ONLY Netlify site this app may ever deploy to. Hardcoded on
# purpose so a stray `netlify link` or NETLIFY_SITE_ID can't redirect
# the deploy elsewhere. If the site is ever recreated, change this
# single line.
SITE_ID=95a0cd35-e5b8-481f-9374-fc4854b73c85

# Refuse to run if the environment tries to override the target.
if [ -n "$NETLIFY_SITE_ID" ] && [ "$NETLIFY_SITE_ID" != "$SITE_ID" ]; then
    echo "ERROR: NETLIFY_SITE_ID=$NETLIFY_SITE_ID does not match the pinned"
    echo "site $SITE_ID. This workspace only deploys to that site. Unset"
    echo "NETLIFY_SITE_ID or set it to the pinned id."
    exit 1
fi

# Optional: NETLIFY_AUTH_TOKEN — personal access token. If unset, the
# CLI uses the credentials from `netlify login`.

DIST_DIR=source/netlify-deployment/dist
if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "ERROR: $DIST_DIR not found. Run this component's source/clone.sh first."
    exit 1
fi

export COMMIT=$(git -C .. log -1 --format="%H" 2>/dev/null | cut -c -8)

# --site pins the target explicitly on every deploy, ignoring any
# linked-site state. --no-build skips Netlify's own build step (and its
# interactive build-command detection) — we deploy the already-built
# dist/ as-is.
DEPLOY_ARGS=(deploy --prod --no-build --dir "$DIST_DIR" --site "$SITE_ID" --message "studio-latest ${COMMIT:-unknown}")

OUTPUT_DIR=build/netlify-deployment/web/universal-release
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Stream to a temp file, then promote it to the receipt only after the
# deploy actually succeeds. The receipt is check.sh's sentinel, so it
# must never exist for a failed deploy. With set -e + pipefail the
# script aborts on the pipeline below before the promotion runs.
RECEIPT="$OUTPUT_DIR/last-deploy.txt"
set -x
netlify "${DEPLOY_ARGS[@]}" 2>&1 | tee "$OUTPUT_DIR/last-deploy.tmp"
mv "$OUTPUT_DIR/last-deploy.tmp" "$RECEIPT"
set +x

echo ""
echo "Deploy receipt: $RECEIPT"
echo "--- DONE ---"
