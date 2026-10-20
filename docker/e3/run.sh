#!/bin/sh
set -eu
OUT="${OUT:-reports/lavapipe-full-conformance}"
[ -e "$OUT" ] && { echo "$OUT already exists; refusing to overwrite" >&2; exit 2; }
mkdir -p "$OUT"
docker rm -f webgpu-e3-run >/dev/null 2>&1 || true
docker run --name webgpu-e3-run tgci-e3 sh -c '
  cd /work/webgpu-poc
  { echo "arch: $(uname -m)"; . /etc/os-release; echo "$PRETTY_NAME"; node -v
    for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require(\"./node_modules/$p/package.json\").version")"; done
    echo "--- vulkaninfo"; vulkaninfo --summary 2>/dev/null | sed -n "/Devices:/,\$p"
    echo "--- adapter (step1.mjs)"; node step1.mjs 2>&1 | sed -n "/adapter.info/,/}/p"
    echo "--- source hashes"; find lib diff ported selftest scripts step1.mjs step2.test.ts step3.test.ts harness.ts vitest.config.mts package.json package-lock.json -type f -exec sha256sum {} + | sort -k2
  } > /tmp/env.txt 2>&1
  node scripts/run.mjs > /tmp/conformance.log 2>&1; echo $? > /tmp/exit-code.txt
' 
docker cp webgpu-e3-run:/work/webgpu-poc/reports/. "$OUT/"
docker cp webgpu-e3-run:/tmp/env.txt "$OUT/env.txt"
docker cp webgpu-e3-run:/tmp/conformance.log "$OUT/conformance.log"
docker cp webgpu-e3-run:/tmp/exit-code.txt "$OUT/exit-code.txt"
docker rm webgpu-e3-run >/dev/null
echo "done -> $OUT (exit code of suite: $(cat $OUT/exit-code.txt))"
