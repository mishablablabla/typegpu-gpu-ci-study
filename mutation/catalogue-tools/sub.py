#!/usr/bin/env python3
import sys,os
cat=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def sub(id_, rel, old, new, count=1):
    src=os.path.join(cat,'_scratch/pristine',rel)
    dst=os.path.join(cat,'_scratch/m',id_,rel)
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst),exist_ok=True)
        open(dst,'w',encoding='utf-8').write(open(src,encoding='utf-8').read())
    s=open(dst,encoding='utf-8').read()
    assert s.count(old)==count, f'{id_} {rel}: expected {count} occurrences of old, found {s.count(old)}'
    open(dst,'w',encoding='utf-8').write(s.replace(old,new))
