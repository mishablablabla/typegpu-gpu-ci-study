#!/bin/sh
# usage: OUT=<new dir> docker/allrows/run.sh [image]   -> allrows.json, env.txt, adapter.json, sources.sha256
set -eu
IMG="${1:-tgci-allrows}"; OUT="${OUT:?set OUT}"
[ -e "$OUT" ] && { echo "$OUT exists; refusing to overwrite" >&2; exit 2; }
mkdir -p "$OUT"; N=webgpu-allrows-run-$$; docker rm -f "$N" >/dev/null 2>&1 || true
docker run --name "$N" "$IMG" sh -c '
  cd /work/webgpu-poc
  { echo "arch: $(uname -m)"; . /etc/os-release; echo "$PRETTY_NAME"; node -v
    for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require(\"./node_modules/$p/package.json\").version")"; done
    dpkg-query -W -f="\${Package} \${Version}\n" mesa-vulkan-drivers libllvm20 libvulkan1 2>/dev/null
    grep -m1 "model name" /proc/cpuinfo || true
    vulkaninfo --summary 2>/dev/null | grep -E "deviceName|driverInfo"
  } > /tmp/env.txt 2>&1
  node third_party/adapter-probe.js > /tmp/adapter.json 2>&1
  find lib diff ported evaluator harness.ts vitest.config.mts package.json package-lock.json -type f -exec sha256sum {} + | sort -k2 > /tmp/sources.sha256
  BD_OUT=/tmp/allrows.json npx vitest run -c evaluator/allrows/vitest.config.mts dump-allrows.test.ts > /tmp/vitest.log 2>&1; echo $? > /tmp/exit-code.txt
  BD_OUT=/tmp/allrows-bits.json npx vitest run -c evaluator/allrows-bits/vitest.config.mts > /tmp/vitest-bits.log 2>&1; echo $? > /tmp/exit-code-bits.txt
'
for f in allrows.json env.txt adapter.json sources.sha256 vitest.log exit-code.txt allrows-bits.json vitest-bits.log exit-code-bits.txt; do docker cp "$N:/tmp/$f" "$OUT/$f"; done; docker rm "$N" >/dev/null
echo "done -> $OUT (exit $(cat $OUT/exit-code.txt))"
