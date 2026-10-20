#!/usr/bin/env python3
"""aggregate.py: join catalogue + runs/<id>-r*/ into results.json and RESULTS.md. Uses latest attempt per mutant unless an earlier
   attempt is needed (timeout-only attempts are superseded by later ones). All attempts are listed in results.json."""
import json, glob, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from analyze_run import analyze
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')); R = os.path.join(REPO, 'runs/mock'); RES = os.path.join(REPO, 'results/mock'); os.makedirs(RES, exist_ok=True); cat = json.load(open(REPO+'/mutation/catalogue.json'))
def classify(a):
    if not a.get('finished'): return 'RUNNING', ''
    if a.get('patch_ok') is False: return 'INVALID(patch-fail)', ''
    bad_tsc = {k:v for k,v in a['tsc'].items() if v != 0}
    real = [f for f in a['fails'] if f['kind'] != 'timeout']
    tmo = [f for f in a['fails'] if f['kind'] == 'timeout']
    notes = []
    if bad_tsc: notes.append('TSC-FAIL '+','.join(bad_tsc))
    if a['suite_errors']: notes.append('suite-errors:'+str(len(a['suite_errors'])))
    if a.get('total') is None: return 'NO-RESULT', ';'.join(notes)
    if any(f['kind'] in ('assertion','error') for f in real): st = 'CAUGHT-assertion'
    elif real: st = 'CAUGHT-snapshot-only'
    elif a['suite_errors']: st = 'CAUGHT-suite-error'
    elif tmo: st = 'INCONCLUSIVE-timeout-only'
    else: st = 'MISSED'
    if bad_tsc: notes.append('mutant does not typecheck -> report as invalid/typecheck-caught')
    return st, ';'.join(notes)
res = {}
for m in cat:
    runs = sorted(glob.glob(f"{R}/{m['id']}-r*"))
    atts = []
    for d in runs:
        a = analyze(d); st, n = classify(a); a['status'] = st; a['notes'] = n; atts.append(a)
    if not atts: res[m['id']] = {'status': 'NOT-RUN', 'tier': m['tier'], 'attempts': []}; continue
    final = atts[-1]
    res[m['id']] = {'status': final['status'], 'notes': final['notes'], 'tier': m['tier'], 'title': m['title'],
        'mock_catchable_guess': m['mock_catchable_guess'], 'reach_class': m.get('reach_class'), 'files': m['files'],
        'failing_tests': [{k: f[k] for k in ('file','name','kind')} for f in final['fails']],
        'wall_s': final['wall_s'], 'tsc': final['tsc'], 'attempts': [{'run': a['run'], 'status': a['status'], 'failed': a.get('failed'), 'wall_s': a['wall_s']} for a in atts]}
for mid, v in res.items():
    ta = sorted(glob.glob(f"{R}/{mid}-t*"))
    if ta:
        a = analyze(ta[-1]); nt = [f for f in a['fails'] if f['kind'] != 'timeout']
        v['attest_run'] = {'run': a['run'], 'failed': a.get('failed'), 'non_timeout_failures': [{k: f[k] for k in ('file','name','kind')} for f in nt],
                           'timeout_failures_(baseline-flaky under attest)': sorted(set(f['file'].split('/')[-1] for f in a['fails'] if f['kind']=='timeout')), 'wall_s': a['wall_s']}
base = {}
for b in sorted(glob.glob(f"{R}/base-*")):
    a = analyze(b)
    if a.get('total') is not None: base[a['run']] = {'total': a['total'], 'passed': a['passed'], 'failed': a['failed'], 'skipped': a['skipped'], 'wall_s': a['wall_s'], 'failing': sorted(set(f['file'].split('/')[-1] for f in a['fails']))}
json.dump(res, open(RES+'/results.json', 'w'), indent=1); json.dump(base, open(RES+'/base.json', 'w'), indent=1)
from collections import Counter
cnt = Counter(v['status'] for v in res.values())
xt = Counter((v.get('reach_class'), v['status']) for v in res.values())
L = ['# WS-MOCK RESULTS (non-attest `vitest run --project=!browser`, source tree + patch, image tgci-p3-mock-base:1)', '',
     'Counts: ' + ', '.join(f'{k}={v}' for k, v in sorted(cnt.items())), '',
     '| id | tier | status | n fail | failing tests (file :: name) | kind | tsc | notes | cat. title |', '|---|---|---|---|---|---|---|---|---|']
for mid, v in res.items():
    ft = v.get('failing_tests', [])
    names = '<br>'.join(f"{t['file'].split('/tests/')[-1]} :: {t['name'][:70]}" for t in ft[:4]) + (f'<br>(+{len(ft)-4} more)' if len(ft) > 4 else '')
    kinds = ','.join(sorted(set(t['kind'] for t in ft)))
    L.append(f"| {mid} | {v['tier']} | {v['status']} | {len(ft)} | {names} | {kinds} | {v.get('tsc','')} | {v.get('notes','')} | {v.get('title','')[:70]} |")
L += ['', '## BASE (unmutated) runs', '', '| run | tests | passed | failed | skipped | wall s | failing files |', '|---|---|---|---|---|---|---|']
for k, b in base.items(): L.append(f"| {k} | {b['total']} | {b['passed']} | {b['failed']} | {b['skipped']} | {b['wall_s']} | {', '.join(b['failing'])} |")
L += ['', '## Status by catalogue reach_class', '', '| reach_class | ' + ' | '.join(sorted(set(v['status'] for v in res.values()))) + ' |', '|---|' + '---|' * len(set(v['status'] for v in res.values()))]
for rc in sorted(set(str(v.get('reach_class')) for v in res.values())):
    L.append(f'| {rc} | ' + ' | '.join(str(xt.get((rc if rc != 'None' else None, st), 0)) for st in sorted(set(v['status'] for v in res.values()))) + ' |')
L += ['', '## MISSED mutants: attest re-check (ENABLE_ATTEST=1, `-t1` runs) and second non-attest run (`-r2`)', '']
for mid, v in res.items():
    if v['status'] == 'MISSED': L.append(f"- {mid}: r1/r2 non-attest 0 failures; attest: {v.get('attest_run', {}).get('non_timeout_failures')} non-timeout failures, timeouts only in {v.get('attest_run', {}).get('timeout_failures_(baseline-flaky under attest)')}")
open(RES+'/RESULTS.md', 'w').write('\n'.join(L) + '\n'); print(cnt)
