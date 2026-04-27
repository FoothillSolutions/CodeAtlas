#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEATLAS_DIR="${SCRIPT_DIR}"
CODEATLAS_CONFIG="${SCRIPT_DIR}/codeatlas-config.json"
OUTPUT_DIR="${SCRIPT_DIR}/output-codeatlas"

WITH_CHAT=false
GITLAB_GROUP=""

for arg in "$@"; do
  case "$arg" in
    --with-chat)  WITH_CHAT=true ;;
    --group=*)    GITLAB_GROUP="${arg#--group=}" ;;
    *)            echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [ ! -f "$CODEATLAS_CONFIG" ]; then
  echo "ERROR: codeatlas-config.json not found at $CODEATLAS_CONFIG" >&2
  exit 1
fi

REPOS_PARENT=$(python3 -c "import json; c=json.load(open('$CODEATLAS_CONFIG')); print(c.get('repos_parent_dir', ''))")
if [ -z "$REPOS_PARENT" ]; then
  echo "ERROR: repos_parent_dir not set in codeatlas-config.json" >&2
  exit 1
fi

if [ -z "$GITLAB_GROUP" ]; then
  GITLAB_GROUP=$(python3 -c "import json; c=json.load(open('$CODEATLAS_CONFIG')); print(c.get('gitlab_group', ''))" 2>/dev/null || true)
fi
if [ -z "$GITLAB_GROUP" ]; then
  ROOT_CONFIG="${SCRIPT_DIR}/../../config.json"
  if [ -f "$ROOT_CONFIG" ]; then
    GITLAB_GROUP=$(python3 -c "import json; c=json.load(open('$ROOT_CONFIG')); print(c.get('gitlab_group', ''))" 2>/dev/null || true)
  fi
fi

mkdir -p "$OUTPUT_DIR"

if $WITH_CHAT; then
  PROXY_PORT=7823
  if ! lsof -i ":${PROXY_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Starting chat proxy on port ${PROXY_PORT}..." >&2
    nohup python3 "${SCRIPT_DIR}/codeatlas-chat-proxy.py" >"${OUTPUT_DIR}/proxy.log" 2>&1 &
    sleep 1
  else
    echo "Chat proxy already running on port ${PROXY_PORT}." >&2
  fi
fi

GITLAB_USERNAME=$(glab api user 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('username',''))" 2>/dev/null || true)
if [ -z "$GITLAB_USERNAME" ]; then
  echo "ERROR: could not resolve GitLab username via 'glab api user'. Is glab authenticated?" >&2
  exit 1
fi

echo "Fetching open MRs where you (@${GITLAB_USERNAME}) are a reviewer..." >&2

GLAB_ARGS=(mr list --reviewer="$GITLAB_USERNAME" --per-page=100 --output=json)
if [ -n "$GITLAB_GROUP" ]; then
  GLAB_ARGS+=(--group="$GITLAB_GROUP")
fi

MRS_JSON=$(glab "${GLAB_ARGS[@]}" 2>/dev/null || echo "[]")
MR_COUNT=$(python3 -c "import json,sys; print(len(json.loads(sys.stdin.read())))" <<< "$MRS_JSON")
echo "Found ${MR_COUNT} open reviewer MR(s)." >&2

if [ "$MR_COUNT" -eq 0 ]; then
  echo "Nothing to do." >&2
  exit 0
fi

export CONFIG_FILE="$CODEATLAS_CONFIG" REPOS_PARENT CODEATLAS_DIR OUTPUT_DIR MRS_JSON

python3 << 'PYEOF'
import json, subprocess, sys, os, re
from datetime import datetime, timezone

config = json.load(open(os.environ["CONFIG_FILE"]))
mrs = json.loads(os.environ["MRS_JSON"])
repos_parent = os.environ["REPOS_PARENT"]
codeatlas_dir = os.environ["CODEATLAS_DIR"]
output_dir = os.environ["OUTPUT_DIR"]
repo_overrides = config.get("repo_overrides", {})

def extract_repo_name(web_url: str) -> str:
    match = re.search(r'/([^/]+)/-/merge_requests/', web_url)
    return match.group(1) if match else ""

succeeded = 0
skipped = 0
failed = 0

for i, mr in enumerate(mrs):
    iid = mr["iid"]
    web_url = mr.get("web_url", "")
    ref_full = mr.get("references", {}).get("full", str(iid))
    target_branch = mr.get("target_branch", "main")
    repo_name = extract_repo_name(web_url)

    if not repo_name:
        print(f"  [{i+1}/{len(mrs)}] SKIP {ref_full} — cannot extract repo name", file=sys.stderr)
        skipped += 1
        continue

    repo_path = os.path.join(repos_parent, repo_name)
    if not os.path.isdir(repo_path):
        print(f"  [{i+1}/{len(mrs)}] SKIP {ref_full} — repo not found at {repo_path}", file=sys.stderr)
        skipped += 1
        continue

    output_html = os.path.join(output_dir, f"{repo_name}-{iid}.html")
    if os.path.exists(output_html):
        html_mtime = datetime.fromtimestamp(os.path.getmtime(output_html), tz=timezone.utc)
        mr_updated = datetime.fromisoformat(mr["updated_at"].replace("Z", "+00:00"))
        if html_mtime > mr_updated:
            print(f"  [{i+1}/{len(mrs)}] SKIP {ref_full} — output is up to date", file=sys.stderr)
            skipped += 1
            continue

    print(f"  [{i+1}/{len(mrs)}] Running CodeAtlas for {ref_full} (MR !{iid})...", file=sys.stderr)

    cmd = [
        "dotnet", "run", "--",
        "--mr", str(iid),
        "--repo", repo_path,
        "--target", target_branch,
    ]

    overrides = repo_overrides.get(repo_name, {})
    if "sln" in overrides:
        cmd.extend(["--sln", overrides["sln"]])

    result = subprocess.run(cmd, cwd=codeatlas_dir, capture_output=True, text=True, timeout=300)

    if result.returncode == 0:
        output_line = [l for l in result.stderr.splitlines() if l.startswith("Output:")]
        output_path = output_line[0].split("Output: ", 1)[1] if output_line else "?"
        print(f"           ✓ {output_path}", file=sys.stderr)
        succeeded += 1
    else:
        print(f"           ✗ Failed (exit {result.returncode})", file=sys.stderr)
        for line in result.stderr.splitlines()[-5:]:
            print(f"             {line}", file=sys.stderr)
        failed += 1

print(f"\nDone: {succeeded} succeeded, {skipped} skipped, {failed} failed.", file=sys.stderr)
if failed > 0:
    sys.exit(1)
PYEOF
