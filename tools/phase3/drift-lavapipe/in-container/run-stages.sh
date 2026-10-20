#!/bin/sh
set -u; cd /work/webgpu-poc; O=/tmp/out; mkdir -p $O; log() { echo "$(date -u +%FT%TZ) $*" >> $O/commands.log; }
STAGES="${STAGES:-dump full inv ex cts}"; DUMP_GROUPS="${DUMP_GROUPS:-A B C D L E}"; log "start cfg=${DRIFT_CFG:-?} stages=[$STAGES] groups=[$DUMP_GROUPS]"
{ echo "cfg: ${DRIFT_CFG:-?}"; echo "arch: $(uname -m)"; echo "kernel: $(uname -r)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"
  for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require(\"./node_modules/$p/package.json\").version")"; done
  dpkg-query -W -f='${Package} ${Version}\n' mesa-vulkan-drivers 'libllvm*' libvulkan1 vulkan-tools libdrm2 libc6 libstdc++6 2>/dev/null
  dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"
  echo "nproc: $(nproc)"; grep -m1 -E "model name|Model name|CPU part|Features" /proc/cpuinfo || true; lscpu 2>/dev/null | grep -E "Model name|Architecture|Thread|Core|Socket|Vendor" || true; free -m | head -2
  echo "cgroup cpu.max: $(cat /sys/fs/cgroup/cpu.max 2>/dev/null)"; echo "cgroup memory.max: $(cat /sys/fs/cgroup/memory.max 2>/dev/null)"
  echo "VK_DRIVER_FILES=${VK_DRIVER_FILES:-}  VK_ICD_FILENAMES=${VK_ICD_FILENAMES:-}"; echo "build-time record:"; cat /pinned-package-versions.txt; } > $O/env.txt 2>&1
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d"; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > $O/icd-dirs.txt 2>&1
(vulkaninfo --summary 2>/dev/null || vulkaninfo 2>/dev/null) > $O/vulkaninfo.txt; VK_LOADER_DEBUG=driver vulkaninfo > /dev/null 2> $O/loader-trace.txt
node drift-tools/probe-strict.cjs > $O/adapter-strict.json 2> $O/adapter-strict.stderr; node third_party/adapter-probe.js > $O/adapter.json 2>&1
node drift-tools/assert-lvp.mjs $O > /dev/null 2>&1; A=$?; log "assert-lvp exit $A"
if [ $A -ne 0 ]; then echo "backend assertion FAILED; no stage run" > $O/ABORTED.txt; echo 3 > $O/exit-code.txt; exit 0; fi
find lib diff ported selftest scripts step1.mjs step2.test.ts step3.test.ts harness.ts vitest.config.mts package.json package-lock.json evaluator -type f -exec sha256sum {} + 2>/dev/null | sort -k2 > $O/sources.sha256
ops_of() { case $1 in A) echo add,sub,mul,neg;; B) echo div,min,max;; C) echo inverseSqrt,exp,exp2,sin,cos;; D) echo sqrt,tanh;; L) echo mod,log,log2,pow;; E) echo add,sub,mul;; esac; }
for st in $STAGES; do
  s=$(date +%s); mkdir -p $O/$st
  case $st in
  dump) for g in $DUMP_GROUPS; do mkdir -p $O/dump/group$g; f=dump-bits-ext.test.ts; [ $g = E ] && f=dump-bits-ext-f16.test.ts
      EXT_OPS=$(ops_of $g) BD_OUT=$O/dump/group$g/allrows-bits-ext.json npx vitest run -c evaluator/vitest.config.mts $f > $O/dump/group$g/vitest.log 2>&1; echo $? > $O/dump/group$g/exit-code.txt; node drift-tools/probe-strict.cjs > $O/dump/group$g/adapter-strict-after.json 2> /dev/null; done ;;
  full) node scripts/run.mjs > $O/full/conformance.log 2>&1; echo $? > $O/full/exit-code.txt; mkdir -p $O/full/reports; cp -R reports/. $O/full/reports/ 2>/dev/null ;;
  inv) for d in bitops vector-fns mul-paths scalar-int integer-mul comptime; do s2=$(date +%s); npx vitest run --config investigations/$d/vitest.config.mts --reporter=json --outputFile=$O/inv/$d.vitest.json > $O/inv/$d.stdout 2> $O/inv/$d.stderr; echo $? > $O/inv/$d.exit; log "inv $d exit $(cat $O/inv/$d.exit) wall $(( $(date +%s)-s2 ))s"; mkdir -p $O/inv/suites/$d; cp investigations/$d/results.json $O/inv/suites/$d/ 2>/dev/null; cp -R investigations/$d/raw $O/inv/suites/$d/ 2>/dev/null; done ;;
  ex) ( cd typegpu-examples
      EX_OUT=$O/ex/results-default npx vitest run -c vitest.config.mts --reporter=json --outputFile=$O/ex/vitest-default.json > $O/ex/default.stdout 2> $O/ex/default.stderr; echo $? > $O/ex/default.exit
      HIDE_FEATURES=shader-f16 EX_OUT=$O/ex/results-nof16 npx vitest run -c vitest.config.mts e-mnist-log-flood.test.ts --reporter=json --outputFile=$O/ex/vitest-nof16.json > $O/ex/nof16.stdout 2> $O/ex/nof16.stderr; echo $? > $O/ex/nof16.exit ) ;;
  cts) ( cd third_party; CTS_EXTENDED=1 bash ./run-cts.sh /tmp/out/cts/files > $O/cts/run.log 2>&1 ); echo $? > $O/cts/exit-code.txt ;;
  esac
  log "stage $st done wall $(( $(date +%s)-s ))s"
done
echo 0 > $O/exit-code.txt; log end
