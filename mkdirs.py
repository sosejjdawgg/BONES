from PIL import Image
import numpy as np, base64, io, os

SRC='/root/.claude/uploads/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/'
SHEETS=[('S','27b67de6'),('NE','3ed78e1f'),('N','58918412'),('E','2fc91def'),('SE','1f7aaf64')]
# The five renders are not all at the same distance from the camera: measured torso-on-torso, the
# tail-on view came out about a third small, so he shrank every time he ran away. One multiplier
# per direction pulls them back onto one body scale. The other four already agreed.
FIX={'S':1.0,'SE':1.0,'E':1.0,'NE':1.0,'N':1.35}
CELL=256; ANCHOR_X=128.0
STORE=0.50            # source -> stored pixels; E ends up ~100px wide, ample for DPR2 at 42 CSS

out={}; total=0
for key,f in SHEETS:
    a=np.asarray(Image.open(SRC+f+'-image.png').convert('RGBA'))
    frames=[a[0:CELL, c*CELL:(c+1)*CELL] for c in range(8)]
    # union bbox across the whole cycle, so the dog never jitters between frames
    L=T=10**9; R=B=-1
    for fr in frames:
        ys,xs=np.where(fr[:,:,3]>8)
        L=min(L,xs.min()); R=max(R,xs.max()); T=min(T,ys.min()); B=max(B,ys.max())
    w=R-L+1; h=B-T+1
    sw=max(1,round(w*STORE)); sh=max(1,round(h*STORE))
    strip=Image.new('RGBA',(sw*8,sh),(0,0,0,0))
    for i,fr in enumerate(frames):
        cell=Image.fromarray(fr,'RGBA').crop((L,T,R+1,B+1)).resize((sw,sh),Image.LANCZOS)
        strip.paste(cell,(i*sw,0))
    # RGB through octree (MEDIANCUT eats saturated colour — see the wolf art notes); the real
    # 8-bit alpha is put back afterwards, because a hard alpha cutoff makes these edges crawl
    alpha=strip.getchannel('A')
    q=strip.convert('RGB').quantize(colors=32,method=Image.FASTOCTREE,dither=Image.NONE).convert('RGBA')
    q.putalpha(alpha)
    b=io.BytesIO(); q.save(b,'PNG',optimize=True)
    total+=len(b.getvalue())
    out[key]={'w':sw,'h':sh,'sc':FIX[key],'ax':round((ANCHOR_X-L)*STORE/sw,4),
              'u':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()}
    print('%-3s src %3dx%3d -> stored %3dx%3d  ax=%.3f  %6.1f KB'%(key,w,h,sw,sh,out[key]['ax'],len(b.getvalue())/1024))
print('TOTAL %.1f KB  (base64 %.1f KB)'%(total/1024, total*4/3/1024))

js=["/* BONES in DOGPARK, eight ways. Five rendered sheets (S / SE / E / NE / N) cover half the",
    "   compass; the other three are those same sheets mirrored, which is why nothing here stores",
    "   W, NW or SW. Each entry is ONE strip of the 8-frame run cycle laid out left to right.",
    "   Every frame in a direction is cropped to that direction's UNION bounding box, so the dog",
    "   never jitters between frames, and `ax` is where the source cell's centre line (x=128, the",
    "   same in all five renders) falls inside that crop — that is the anchor the sprite is hung",
    "   from. Bottom-aligned on the ground line, so his feet meet the shadow whichever way he faces. */",
    "const PKDIRS={"]
for k in ['S','SE','E','NE','N']:
    d=out[k]
    js.append('  %s:{w:%d,h:%d,sc:%s,ax:%s,src:"%s"},'%(k,d['w'],d['h'],d['sc'],d['ax'],d['u']))
js.append("};")
js.append("const PKDIRIMG={};")
js.append("for(const k in PKDIRS){ const i=new Image(); i.src=PKDIRS[k].src; PKDIRIMG[k]=i; }")
open('pkdirs.js','w').write("\n".join(js)+"\n")
print('pkdirs.js', os.path.getsize('pkdirs.js')//1024, 'KB')
