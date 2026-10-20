#!/bin/bash
C=$(cd "$(dirname "$0")/.." && pwd); F="$C/_scratch/fresh"; rc=0
for ID in "$@"; do
  P="$C/patches/$ID.patch"
  files=$(grep '^+++ ' "$P" | sed 's#^+++ b/##')
  bad=$(echo "$files" | grep -v -E '^packages/[^/]+/src/' || true)
  [ -n "$bad" ] && { echo "$ID FAIL: touches non-src files: $bad"; rc=1; continue; }
  (cd "$F" && patch -p1 --dry-run -s < "$P") || { echo "$ID FAIL dry-run"; rc=1; continue; }
  (cd "$F" && patch -p1 -s < "$P") || { echo "$ID FAIL apply"; rc=1; continue; }
  syn=ok
  for f in $files; do
    node -e "const m=require('module');const fs=require('fs');try{m.stripTypeScriptTypes(fs.readFileSync(process.argv[1],'utf8'),{mode:'strip'})}catch(e){console.error(e.message);process.exit(1)}" "$F/$f" 2>/tmp/syn.err || { syn="SYNTAX-ERR($f): $(head -c 200 /tmp/syn.err)"; rc=1; }
  done
  (cd "$F" && patch -R -p1 -s < "$P") || { echo "$ID FAIL revert"; rc=1; continue; }
  for f in $files; do cmp -s "$F/$f" "$C/_scratch/pristine/$f" || { echo "$ID FAIL: not pristine after revert: $f"; rc=1; }; done
  echo "$ID applies-clean syntax=$syn files=$(echo $files | wc -w)"
done
exit $rc
