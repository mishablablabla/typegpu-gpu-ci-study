#!/usr/bin/env bash
# usage: tools/phase3/drift-swiftshader/evaluate-with-meta.sh <dump> <eval.json> ; runs the FROZEN evaluator in place and writes eval.meta.json (evaluator, lib and CTS hashes, host, dump+eval sha) next to eval.json
set -eu
DUMP="$1"; EVAL="$2"; ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; [ -z "${CTS_DIR:-}" ] || { echo "CTS_DIR must be unset" >&2; exit 2; }
[ -e "$EVAL" ] && { echo "$EVAL exists; refusing" >&2; exit 2; }
cd "$ROOT"; ( cd "$ROOT" && shasum -a 256 -c <(grep -v '^#' evaluator/evaluator-versions.sha256) >/dev/null ) || { echo "evaluator hashes do not match frozen record" >&2; exit 3; }
node evaluator/evaluate-ext.mjs "$DUMP" "$EVAL" > "$EVAL.stdout" 2>&1
node -e '
const fs=require("fs"),c=require("crypto"),os=require("os"),cp=require("child_process"); const h=f=>c.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const [dump,ev]=process.argv.slice(1); const F=["evaluator/evaluate-ext.mjs","lib/ops.ts","lib/policy.ts","lib/types.ts","lib/num.ts","third_party/cts-oracle.cjs"];
const m={schema:"swiftshader-eval-meta/1",time:new Date().toISOString(),evaluatorFiles:Object.fromEntries(F.map(f=>[f,h(f)])),evaluatorVersionsSha256:h("evaluator/evaluator-versions.sha256"),frozenEvaluatorHashesVerified:true,ctsCommit:cp.execSync("git -C third_party/cts rev-parse HEAD").toString().trim(),ctsWorktreeStatus:cp.execSync("git -C third_party/cts status --short | grep -v node_modules || true").toString().trim(),node:process.version,host:`${os.type()} ${os.release()} ${os.arch()}`,dumpSha256:h(dump),evalSha256:h(ev),dump,eval:ev};
fs.writeFileSync(ev.replace(/eval\.json$/,"eval.meta.json"),JSON.stringify(m,null,1));' "$DUMP" "$EVAL"
echo "evaluated -> $EVAL (+ eval.meta.json)"
