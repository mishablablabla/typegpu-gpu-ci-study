#!/bin/bash
C=$(cd "$(dirname "$0")/../.." && pwd); X="$C/_scratch/exec"; NM="${NODE_MODULES:-$C/../node_modules}"
[ -d "$C/_scratch/pristine" ] || "$C/catalogue-tools/make_pristine.sh"
rm -rf "$X"; mkdir -p "$X/base/node_modules"; cp -R "$C/_scratch/pristine/packages" "$X/base/"
for m in typed-binary tsover-runtime; do ln -s "$NM/$m" "$X/base/node_modules/$m"; done
sed -i.bak "s#import { version } from 'typegpu/package.json';#const version = '0.12.7';#" "$X/base/packages/typegpu/src/shared/meta.ts" "$X/base/packages/typegpu/src/shared/symbols.ts"
find "$X/base" -name '*.bak' -delete
mkdir -p "$C/evidence"
for P in probe-cpu-1 probe-cpu-2; do node --experimental-strip-types --no-warnings "$C/catalogue-tools/probe/$P.mjs" "$X/base" 2>&1 | tail -1 > "$C/evidence/$P-BASE.json"; done
for ID in "$@"; do
  rm -rf "$X/mutx"; cp -R "$X/base" "$X/mutx"; (cd "$X/mutx" && patch -p1 -s < "$C/patches/$ID.patch") || { echo "$ID patch failed"; continue; }
  for P in probe-cpu-1 probe-cpu-2; do node --experimental-strip-types --no-warnings "$C/catalogue-tools/probe/$P.mjs" "$X/mutx" 2>&1 | tail -1 > "$C/evidence/$P-$ID.json"; done
done
python3 - "$C" "$@" <<'PY'
import json,sys
C=sys.argv[1]; ids=sys.argv[2:]; rows=[]
for P in ('probe-cpu-1','probe-cpu-2'):
    b=json.load(open(f'{C}/evidence/{P}-BASE.json'))
    for ID in ids:
        try: m=json.load(open(f'{C}/evidence/{P}-{ID}.json'))
        except Exception: continue
        for k in b:
            if b[k]!=m.get(k) and k.startswith(ID): rows.append(dict(id=ID,probe=k,base=b[k],mutant=m.get(k)))
json.dump(rows,open(f'{C}/evidence/probe-diffs.json','w'),indent=1)
print(len(rows),'probe rows differ for ids with a matching probe:',sorted({r['id'] for r in rows}))
PY
