#!/usr/bin/env python3
"""Split cur.js into assets.js (base64 data) and src.js (code).

The file's top-level statements all begin at column 0, so a statement runs from one
such line to the line before the next. A statement is an ASSET if most of its bytes
are base64 payload. Assets are pure literals: they reference nothing, so hoisting
them all to the front of the build cannot break an order dependency - while code
that CONSUMES an asset (FRIENDIMG = FRIENDFRAMES.map(...)) stays in src.js and so
still runs after every asset is declared.
"""
import re, sys

TOP = re.compile(r'^(const|let|var|function|class)\s')
B64 = re.compile(r'data:(?:image|audio|font)/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+')

def split(text):
    lines = text.split('\n')
    starts = [i for i,l in enumerate(lines) if TOP.match(l)]
    if not starts: raise SystemExit("no top-level statements found")
    stmts = []
    # everything before the first top-level statement is a preamble that stays in src
    if starts[0] > 0: stmts.append((0, starts[0], 'src'))
    for n,i in enumerate(starts):
        j = starts[n+1] if n+1 < len(starts) else len(lines)
        body = '\n'.join(lines[i:j])
        payload = sum(len(m.group(0)) for m in B64.finditer(body))
        kind = 'asset' if (len(body) > 2000 and payload/max(1,len(body)) > 0.80) else 'src'
        stmts.append((i, j, kind))
    assets, src = [], []
    for i,j,kind in stmts:
        (assets if kind=='asset' else src).append('\n'.join(lines[i:j]))
    return '\n'.join(assets), '\n'.join(src), stmts

if __name__ == '__main__':
    text = open(sys.argv[1] if len(sys.argv)>1 else 'cur.js').read()
    a, s, stmts = split(text)
    open('assets.js','w').write(a+'\n')
    open('src.js','w').write(s+'\n')
    na = sum(1 for _,_,k in stmts if k=='asset')
    print(f"statements: {len(stmts)}  assets: {na}")
    print(f"assets.js {len(a)/1e6:.2f} MB   src.js {len(s)/1e6:.2f} MB   (was {len(text)/1e6:.2f} MB)")
