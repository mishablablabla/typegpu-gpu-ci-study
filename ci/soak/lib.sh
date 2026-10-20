OUT="${OUT:-$PWD/out}"; mkdir -p "$OUT"
stage() { local n="$1"; shift; local s e rc; s=$(date +%s.%N); "$@"; rc=$?; e=$(date +%s.%N); printf '%s\t%s\t%s\t%s\n' "$n" "$s" "$e" "$rc" >> "$OUT/timing.tsv"; return $rc; }
