from PIL import Image
import numpy as np, base64, io, os, sys
from collections import deque

SRC='/root/.claude/uploads/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/'
OUT='/tmp/claude-0/-home-user-BONES/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/scratchpad/dogcam.js'

# ONE DOG, FOUR SHEETS, ONE SIZE.
# Every sheet is rendered at its own scale - the first idle sheet draws his standing body 106px
# tall, the jump sheet 89, the two later sheets 201. Left alone he would change size every time he
# changed what he was doing. So each sheet is scaled by ITS OWN standing body height to a single
# shared target, and the correction is baked into the stored pixels. Same rule mkwalk.py had to
# learn for the eight isometric directions: fix scale where the pixels live, never at draw time.
BODY_TARGET = 80.0

# THE GROUND LINE MATTERS MORE THAN THE BOUNDING BOX. In the jump sheet his feet genuinely leave
# the floor, so every frame is cropped to a SHARED box and anchored on the line his feet rest on
# while grounded. That keeps the leap inside the sprite. For the grounded sets the two coincide.

# ---------------------------------------------------------------- grid sheets (clean PNG, 5x5)
GRIDS = {
  'idle': ('92ce34c9-image.png', [0,1,2,3,4]),   # standing frames, for the scale reference
  'jump': ('f17d99ca-image.png', [0,1]),
}
CELL=256; COLS=5; ROWS=5

# ---------------------------------------------------------- band sheets (JPEG, irregular rows)
# These arrive as JPEGs on a flat dark ground with a near-black subject, so the background comes
# off by FLOOD FILL from the border rather than by a luminance cut - any global threshold that
# removes the ground also punches holes straight through him.
#
# WHICH FRAMES, AND WHY NOT ALL OF THEM. Several frames carry a light filigree crust along the
# spine and haunches. It is not compression speckle and not an edge artefact - it is contiguous,
# inside the silhouette, and survives both median filtering and edge peeling, because it is drawn
# into the source. The only honest fix is to use the frames that do not have it.
BANDS = {
 # key       file                  rows(y0,y1)   cols(x0,x1) per row      frames to keep
 'rest' : ('d3a1e419-image.jpg', (115, 243), [(31,266),(296,535),(565,800)], [0,1,2]),
 'come' : ('d3a1e419-image.jpg', (341, 542), [(31,266),(296,535),(565,800)], [0,1,2]),
 'sit'  : ('d3a1e419-image.jpg', (593, 798), [(57,223),(322,490),(591,751)], [0,1,2]),
 'beg'  : ('d3a1e419-image.jpg', (833,1081), [(48,249),(322,513),(582,782)], [0,1,2]),
 'sniff': ('d4ca132d-image.jpg', (602, 794), [(296,534),(565,804)],          [0,1]),
}
# the standing side-on dog measures ~201px in BOTH jpg sheets, so one reference serves them all
BAND_STAND = 201.0
BAND_GROUND_ROW = 'come'    # a grounded, standing row: its bbox bottom is the floor

def flood_key(path, y0, y1, tol=26):
    im=Image.open(SRC+path).convert('RGB')
    a=np.asarray(im).astype(int)[y0-8:y1+9]
    H,W,_=a.shape
    ring=np.concatenate([a[0:4].reshape(-1,3), a[-4:].reshape(-1,3),
                         a[:,0:4].reshape(-1,3), a[:,-4:].reshape(-1,3)])
    bg=np.median(ring,axis=0)
    d=np.abs(a-bg).sum(2)
    seen=np.zeros((H,W),bool); q=deque()
    for x in range(W):
        for y in (0,H-1):
            if d[y,x]<=tol and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    for y in range(H):
        for x in (0,W-1):
            if d[y,x]<=tol and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<H and 0<=nx<W and not seen[ny,nx] and d[ny,nx]<=tol:
                seen[ny,nx]=True; q.append((ny,nx))
    return np.dstack([a, np.where(seen,0,255)]).astype(np.uint8)

def pack(key, frames, s, groundY, colors):
    """frames: list of HxWx4 arrays already in one coordinate system. s: stored-px scale.
       groundY: the floor line in SOURCE px, shared across the set."""
    L=T=10**9; R=B=-1
    for f in frames:
        ys,xs=np.where(f[:,:,3]>8)
        L=min(L,xs.min()); R=max(R,xs.max()); T=min(T,ys.min()); B=max(B,ys.max())
    w=R-L+1; h=B-T+1
    sw=max(1,round(w*s)); sh=max(1,round(h*s)); n=len(frames)
    strip=Image.new('RGBA',(sw*n,sh),(0,0,0,0))
    for i,f in enumerate(frames):
        strip.paste(Image.fromarray(f,'RGBA').crop((L,T,R+1,B+1)).resize((sw,sh),Image.LANCZOS),(i*sw,0))
    alpha=strip.getchannel('A')
    q=strip.convert('RGB').quantize(colors=colors,method=Image.FASTOCTREE,dither=Image.NONE).convert('RGBA')
    q.putalpha(alpha)
    b=io.BytesIO(); q.save(b,'PNG',optimize=True)
    foot=round((groundY-T+1)*s)
    lift=[]; top=[]
    for f in frames:
        ys,_=np.where(f[:,:,3]>8)
        lift.append(max(0, round((groundY-ys.max())*s)))
        top.append(round((ys.min()-T)*s))
    return {'w':sw,'h':sh,'n':n,'foot':foot,'lift':lift,'top':top,
            'bytes':len(b.getvalue()),
            'u':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()}

colors=int(sys.argv[1]) if len(sys.argv)>1 else 48
out={}

for key,(fname,standing) in GRIDS.items():
    a=np.asarray(Image.open(SRC+fname).convert('RGBA'))
    fr=[a[r*CELL:(r+1)*CELL, c*CELL:(c+1)*CELL] for r in range(ROWS) for c in range(COLS)]
    fr=[f for f in fr if (f[:,:,3]>8).any()]
    bodyH=int(np.median([ (lambda y:y.max()-y.min()+1)(np.where(fr[i][:,:,3]>8)[0]) for i in standing ]))
    groundY=int(np.median([ np.where(fr[i][:,:,3]>8)[0].max() for i in standing ]))
    d=pack(key, fr, BODY_TARGET/bodyH, groundY, colors)
    d['body']=round(bodyH*BODY_TARGET/bodyH)
    out[key]=d
    print('%-6s grid  x%2d  body=%3d -> %3dx%3d n=%d foot=%3d peakLift=%2d  %6.1f KB'
          %(key,len(fr),bodyH,d['w'],d['h'],d['n'],d['foot'],max(d['lift']),d['bytes']/1024))

# every band set shares one scale AND one floor, so he neither resizes nor hovers between poses
bandGround={}
for key,(fname,(y0,y1),cols,keep) in BANDS.items():
    rgba=flood_key(fname,y0,y1)
    cells=[rgba[:, x0:x1+1] for x0,x1 in cols]
    cells=[cells[i] for i in keep]
    if key==BAND_GROUND_ROW:
        bandGround['s']=BODY_TARGET/BAND_STAND
    bandGround.setdefault('cells',{})[key]=cells
s_band=BODY_TARGET/BAND_STAND
for key,cells in bandGround['cells'].items():
    gy=max(np.where(c[:,:,3]>8)[0].max() for c in cells)   # this pose's own floor
    d=pack(key, cells, s_band, gy, colors)
    d['body']=round(BAND_STAND*s_band)
    out[key]=d
    print('%-6s band  x%2d  body=%3d -> %3dx%3d n=%d foot=%3d peakLift=%2d  %6.1f KB'
          %(key,len(cells),round(BAND_STAND),d['w'],d['h'],d['n'],d['foot'],max(d['lift']),d['bytes']/1024))

total=sum(d['bytes'] for d in out.values())
print('TOTAL %.1f KB raw, %.1f KB as base64'%(total/1024, total*4/3/1024))

js=["/* BONES ON DOGCAM - every state he has, side-on, full colour, one body scale.",
    "   `body` is his standing height in stored px and is identical in every set by construction,",
    "   so the draw can size any pose from one number and he cannot change size when he lies down,",
    "   rears up or leaves the floor. `foot` is the floor line inside the stored image, measured",
    "   from the TOP; `top[]` and `lift[]` give his crown and his feet per frame, which is what lets",
    "   the jump set do its own leaping and lets the ball-catch find his mouth anywhere in the arc.",
    "   The two later sheets arrive as JPEGs on a flat ground: the background comes off by flood",
    "   fill from the border, never by a luminance cut, because a near-black dog and a dark ground",
    "   cannot be separated by brightness without punching holes through him. */",
    "const DOGCAMART={"]
for k in ['idle','jump','come','rest','sit','beg','sniff']:
    d=out[k]
    js.append('  %s:{w:%d,h:%d,n:%d,foot:%d,body:%d,\n     lift:[%s],\n     top:[%s],\n     src:"%s"},'
              %(k,d['w'],d['h'],d['n'],d['foot'],d['body'],
                ','.join(map(str,d['lift'])), ','.join(map(str,d['top'])), d['u']))
js.append("};")
js.append("const DOGCAMIMG={};")
js.append("for(const k in DOGCAMART){ const i=new Image(); i.src=DOGCAMART[k].src; DOGCAMIMG[k]=i; }")
open(OUT,'w').write("\n".join(js)+"\n")
print('dogcam.js %.0f KB'%(os.path.getsize(OUT)/1024))
