#!/bin/bash
# Prints nothing when the tree is clean: secret-like strings, absolute home paths, e-mail addresses, user/machine names.
cd "$(dirname "$0")/.." || exit 2
EX=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=runs --exclude=*.tar.xz --exclude=*.npy --exclude=*.gz --exclude=*.png)
grep -rInE "${EX[@]}" 'ghp_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{12,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|api[_-]?key|token=|Authorization:|password' . | grep -v '^./tools/scan-clean.sh'
grep -rInE "${EX[@]}" '/Users/|/private/tmp|/home/[a-z]+/|C:\\Users' . | grep -v '^./tools/scan-clean.sh'
grep -rInE "${EX[@]}" '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.(com|org|io|net|dev|pl)\b' . | grep -v '^./tools/scan-clean.sh' | grep -v '^./examples-runner/package-lock.json'
grep -rInE "${EX[@]}" 'mykhailo|zuiev|mishablablabla|swmansion\.com>' . | grep -v '^./tools/scan-clean.sh' | grep -v '^./typegpu-examples/vendor/LICENSE'
exit 0
