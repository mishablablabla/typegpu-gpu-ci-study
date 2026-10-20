#!/usr/bin/env python3
"""analyze_run.py <run-dir> -> prints JSON summary of one run (failing tests, kinds, tsc, wall, flags)."""
import json, sys, os, re, glob
def kind(msgs):
    m = "\n".join(msgs)
    if re.search(r'Snapshot .*mismatched|toMatchInlineSnapshot|toMatchSnapshot|Snapshot `|snapshot function didn.t throw', m): return 'snapshot'
    if re.search(r'Test timed out|Hook timed out|STACK_TRACE_ERROR', m): return 'timeout'
    if re.match(r'\s*AssertionError', m): return 'assertion'
    return 'error'
def analyze(d):
    out = {'run': os.path.basename(d)}
    raw = open(os.path.join(d,'raw.log'),errors='replace').read() if os.path.exists(os.path.join(d,'raw.log')) else ''
    out['patch_ok'] = False if 'PATCH_FAILED' in raw else (True if 'PATCH_OK' in raw else None)
    out['finished'] = bool(re.search(r'^rc=', raw, re.M))
    out['tsc'] = {m.group(1): int(m.group(2)) for m in re.finditer(r'TSC (\S+) rc=(\d+)', raw)}
    m = re.search(r'WALL=(\d+)', raw); out['wall_s'] = int(m.group(1)) if m else None
    m = re.search(r'EXIT=(\d+)', raw); out['vitest_exit'] = int(m.group(1)) if m else None
    jp = os.path.join(d,'vitest.json')
    fails = []; suite_errs = []
    if os.path.exists(jp):
        j = json.load(open(jp))
        out.update(total=j['numTotalTests'], passed=j['numPassedTests'], failed=j['numFailedTests'], skipped=j.get('numPendingTests'))
        for f in j['testResults']:
            fn = f['name'].split('/work-base/')[-1]
            for a in f['assertionResults']:
                if a['status'] == 'failed':
                    fails.append({'file': fn, 'name': a['fullName'], 'kind': kind(a['failureMessages']), 'msg': a['failureMessages'][0][:300]})
            if f['status'] == 'failed' and not any(a['status']=='failed' for a in f['assertionResults']):
                suite_errs.append({'file': fn, 'msg': (f.get('message') or '')[:300]})
    out['fails'] = fails; out['suite_errors'] = suite_errs
    return out
if __name__ == '__main__':
    print(json.dumps(analyze(sys.argv[1]), indent=1))
