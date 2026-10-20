#!/usr/bin/env bash
set -u; . "$(dirname "$0")/lib.sh"; SUITES="${SOAK_RUN:-full,inv,ex}"
has() { case ",$SUITES," in *",$1,"*) return 0;; esac; return 1; }
if has full; then F="$OUT/full"; mkdir -p "$F"
  run_full() { node scripts/run.mjs > "$F/conformance.log" 2>&1; echo $? > "$F/exit-code.txt"; }
  stage full-suite run_full; mkdir -p "$F/reports"; cp -R reports/. "$F/reports/" 2>/dev/null || true; fi
if has inv; then I="$OUT/inv"; mkdir -p "$I/suites"
  for d in bitops vector-fns mul-paths scalar-int integer-mul comptime; do
    run_inv() { npx vitest run --config investigations/$d/vitest.config.mts --reporter=json --outputFile="$I/$d.vitest.json" > "$I/$d.stdout" 2> "$I/$d.stderr"; echo $? > "$I/$d.exit"; }
    stage "inv-$d" run_inv; mkdir -p "$I/suites/$d"; cp investigations/$d/results.json "$I/suites/$d/" 2>/dev/null || true; cp -R investigations/$d/raw "$I/suites/$d/" 2>/dev/null || true
  done; fi
if has ex; then E="$OUT/ex"; mkdir -p "$E"; pushd typegpu-examples > /dev/null
  run_ex_default() { EX_OUT="$E/results-default" npx vitest run -c vitest.config.mts --reporter=json --outputFile="$E/vitest-default.json" > "$E/default.stdout" 2> "$E/default.stderr"; echo $? > "$E/default.exit"; }
  run_ex_nof16() { HIDE_FEATURES=shader-f16 EX_OUT="$E/results-nof16" npx vitest run -c vitest.config.mts e-mnist-log-flood.test.ts --reporter=json --outputFile="$E/vitest-nof16.json" > "$E/nof16.stdout" 2> "$E/nof16.stderr"; echo $? > "$E/nof16.exit"; }
  stage ex-default run_ex_default; stage ex-nof16 run_ex_nof16; popd > /dev/null; fi
if has dump; then DD="$OUT/dump"; mkdir -p "$DD"
  for gx in A:add,sub,mul,neg B:div,min,max C:inverseSqrt,exp,exp2,sin,cos D:sqrt,tanh L:mod,log,log2,pow; do g=${gx%%:*}; ops=${gx#*:}; mkdir -p "$DD/$g"
    run_dump() { BD_OUT="$DD/$g/allrows-bits-ext.json" EXT_OPS="$ops" npx vitest run -c evaluator/vitest.config.mts dump-bits-ext.test.ts --reporter=json --outputFile="$DD/$g/vitest.json" > "$DD/$g/stdout" 2> "$DD/$g/stderr"; echo $? > "$DD/$g/exit"; }
    stage "dump-$g" run_dump
  done; fi
if has v2 && [ -x ci/soak/run-v2.sh ]; then stage v2-runner ci/soak/run-v2.sh; fi
exit 0
