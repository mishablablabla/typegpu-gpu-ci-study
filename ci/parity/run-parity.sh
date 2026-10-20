#!/bin/sh
set -u; IMG="$1"; OUT="$2"; mkdir -p "$OUT"
docker run --rm -v "$PWD/lib:/work/webgpu-poc/lib:ro" -v "$PWD/evaluator:/work/webgpu-poc/evaluator:ro" -v "$PWD/third_party/cts-oracle.cjs:/work/webgpu-poc/third_party/cts-oracle.cjs:ro" -v "$PWD/ci/parity:/parity:ro" -v "$PWD/$OUT":/out "$IMG" sh -c '
  cd /work/webgpu-poc; O=evaluator
  { echo "arch $(uname -m) node $(node -v) $(ldd --version | head -1)"; grep -m1 "model name" /proc/cpuinfo; echo "CTS_DIR=${CTS_DIR:-}"; node $O/selftest-evaluator.mjs 2>&1 | grep -E "^selftest:"; } > /out/parity-env.txt
  for g in D C E L; do node $O/evaluate-ext.mjs /parity/$g/allrows-bits-ext.json /out/$g.eval.json > /out/$g.stdout 2>&1; echo "group$g evaluator exit $?" >> /out/parity-env.txt; done'
cat "$OUT/parity-env.txt"
node -e "
const fs=require('fs');let ok=true;for(const g of ['D','C','E','L']){const a=fs.readFileSync('$OUT/'+g+'.eval.json','utf8'),b=fs.readFileSync('ci/parity/'+g+'/eval.json','utf8');
 if(a===b){console.log('group'+g+': byte-identical');continue}const A=JSON.parse(a),B=JSON.parse(b);const w=A.oldRecompute.wantMismatches+' (this host) vs '+B.oldRecompute.wantMismatches+' (frozen)';
 delete A.input;delete B.input;delete A.oldRecompute.wantMismatches;delete B.oldRecompute.wantMismatches;const same=JSON.stringify(A)===JSON.stringify(B);
 console.log('group'+g+': '+(same?'identical after masking input path and oldRecompute.wantMismatches ['+w+']':'DIFFERENT'));if(!same)ok=false}
console.log('PARITY RESULT: '+(ok?'PASS':'FAIL'));process.exit(ok?0:1)"
