#!/bin/sh
set -eu
IMG="${1:-tgci-cts}"; OUT="${OUT:?set OUT}"
[ -e "$OUT" ] && { echo "$OUT exists; refusing to overwrite" >&2; exit 2; }
mkdir -p "$OUT"; N=webgpu-cts-run-$$
docker rm -f "$N" >/dev/null 2>&1 || true
docker run --name "$N" -e CTS_EXTENDED="${CTS_EXTENDED:-}" "$IMG" sh -c '
  cd /work/webgpu-poc/third_party
  { echo "arch: $(uname -m)"; . /etc/os-release; echo "$PRETTY_NAME"; node -v
    for p in webgpu; do echo "$p $(node -p "require(\"../node_modules/$p/package.json\").version")"; done
    dpkg-query -W -f="\${Package} \${Version}\n" mesa-vulkan-drivers libllvm20 libvulkan1 2>/dev/null
    grep -m1 "model name" /proc/cpuinfo || true
    echo "--- vulkaninfo"; vulkaninfo --summary 2>/dev/null | sed -n "/Devices:/,\$p"
  } > /tmp/env.txt 2>&1
  node adapter-probe.js > /tmp/adapter.json 2>&1
  ./run-cts.sh /tmp/cts-out > /tmp/run.log 2>&1; echo $? > /tmp/exit-code.txt
'
docker cp "$N:/tmp/cts-out/." "$OUT/"; docker cp "$N:/tmp/env.txt" "$OUT/env.txt"; docker cp "$N:/tmp/adapter.json" "$OUT/adapter.json"
docker cp "$N:/tmp/run.log" "$OUT/run.log"; docker cp "$N:/tmp/exit-code.txt" "$OUT/exit-code.txt"; docker rm "$N" >/dev/null
echo "done -> $OUT"
