#!/usr/bin/env bash
set -u; . "$(dirname "$0")/lib.sh"
{ echo "backend=${SOAK_BACKEND:-} rep=${SOAK_REP:-} suite=${SOAK_SUITE:-}"
  echo "commit=$GITHUB_SHA run_id=$GITHUB_RUN_ID attempt=$GITHUB_RUN_ATTEMPT job=${GITHUB_JOB:-}"
  echo "ImageVersion=${ImageVersion:-} ImageOS=${ImageOS:-} RUNNER_NAME=${RUNNER_NAME:-} RUNNER_ENVIRONMENT=${RUNNER_ENVIRONMENT:-} RUNNER_ARCH=${RUNNER_ARCH:-}"
  date -u +%FT%TZ; } > "$OUT/run-id.txt"
test "$(uname -m)" = x86_64 || { echo "NOT native x86_64" >&2; exit 1; }
{ uname -a; . /etc/os-release; echo "$PRETTY_NAME"; echo "nproc $(nproc)"; lscpu; free -m; df -h /; } > "$OUT/host.txt" 2>&1
cp /proc/cpuinfo "$OUT/cpuinfo.txt"
dpkg-query -W -f='${Package} ${Version}\n' 2>/dev/null | grep -Ei 'vulkan|mesa|llvm|swiftshader|libdrm' > "$OUT/preinstalled-gfx-packages.txt" || true
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > "$OUT/preinstalled-icds.txt" 2>&1 || true
{ command -v node && node -v; } > "$OUT/preinstalled-node.txt" 2>&1 || true
