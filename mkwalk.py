from PIL import Image
import numpy as np, base64, io, os

SRC='/root/.claude/uploads/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/'
# five isometric WALK sheets, 5x5 grids of 256px cells (25 frames each)
SHEETS=[('S','5378b28a'),('SE','9fabde0a'),('E','3824d3cb'),('NE','7fc328da'),('N','8e18073d')]
CELL=256; ANCHOR_X=128.0; COLS=5; ROWS=5

# THE SCALE FIX, measured rather than guessed. Cross-view silhouette comparison does not work -
# a side-on dog is long and a tail-on dog is a narrow column, so their bounding boxes say nothing
# about body size. What DOES work is comparing each direction to the SAME direction in the
# already-shipped run set, whose per-direction scaling is known good: like for like, one view,
# any metric valid. Median opaque AREA is the metric (scale^2, and far less pose-sensitive than
# height); it agrees with a height-based reading to within 3-11% on every direction.
FIX={'S':1.718,'SE':1.535,'E':1.186,'NE':1.490,'N':1.908}
# ...and the fix is baked into the STORED pixels rather than applied as a draw-time multiplier,
# so N and NE are RENDERED at the right size instead of being small sprites blown up 1.9x.
BASE_STORE=0.50

out={}; total=0
for key,f in SHEETS:
    a=np.asarray(Image.open(SRC+f+'-image.png').convert('RGBA'))
    frames=[a[r*CELL:(r+1)*CELL, c*CELL:(c+1)*CELL] for r in range(ROWS) for c in range(COLS)]
    frames=[fr for fr in frames if (fr[:,:,3]>8).any()]
    L=T=10**9; R=B=-1
    for fr in frames:
        ys,xs=np.where(fr[:,:,3]>8)
        L=min(L,xs.min()); R=max(R,xs.max()); T=min(T,ys.min()); B=max(B,ys.max())
    w=R-L+1; h=B-T+1
    store=BASE_STORE*FIX[key]
    sw=max(1,round(w*store)); sh=max(1,round(h*store))
    n=len(frames)
    strip=Image.new('RGBA',(sw*n,sh),(0,0,0,0))
    for i,fr in enumerate(frames):
        cell=Image.fromarray(fr,'RGBA').crop((L,T,R+1,B+1)).resize((sw,sh),Image.LANCZOS)
        strip.paste(cell,(i*sw,0))
    alpha=strip.getchannel('A')
    q=strip.convert('RGB').quantize(colors=32,method=Image.FASTOCTREE,dither=Image.NONE).convert('RGBA')
    q.putalpha(alpha)
    b=io.BytesIO(); q.save(b,'PNG',optimize=True)
    total+=len(b.getvalue())
    out[key]={'w':sw,'h':sh,'n':n,'ax':round((ANCHOR_X-L)*store/sw,4),
              'u':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()}
    print('%-3s src %3dx%3d x%2d -> stored %3dx%3d  ax=%.3f  %7.1f KB'
          %(key,w,h,n,sw,sh,out[key]['ax'],len(b.getvalue())/1024))
print('TOTAL %.1f KB  (base64 %.1f KB)'%(total/1024, total*4/3/1024))

js=["/* BONES WALKING, eight ways. Same five-sheet-plus-mirror trick as PKDIRS (the run set) and the",
    "   same anchor rule, but these are 25-frame cycles rather than 8 and each direction was rendered",
    "   at its own distance from the camera - tail-on came out nearly half size, which is why he",
    "   shrank every time he walked away. The correction is measured against the run set direction by",
    "   direction and BAKED INTO THE STORED PIXELS (see mkwalk.py), so every strip here is already at",
    "   one body scale and nothing needs a draw-time multiplier. `n` is the cycle length. */",
    "const PKWALK={"]
for k in ['S','SE','E','NE','N']:
    d=out[k]
    js.append('  %s:{w:%d,h:%d,n:%d,sc:1,ax:%s,src:"%s"},'%(k,d['w'],d['h'],d['n'],d['ax'],d['u']))
js.append("};")
js.append("const PKWALKIMG={};")
js.append("for(const k in PKWALK){ const i=new Image(); i.src=PKWALK[k].src; PKWALKIMG[k]=i; }")
open('/tmp/claude-0/-home-user-BONES/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/scratchpad/pkwalk.js','w').write("\n".join(js)+"\n")
print('pkwalk.js %.0f KB'%(os.path.getsize('/tmp/claude-0/-home-user-BONES/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/scratchpad/pkwalk.js')/1024))
