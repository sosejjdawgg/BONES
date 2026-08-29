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

GRID_S=None      # the idle sheet's own scale, which every other same-scale sheet borrows
for key,(fname,standing) in GRIDS.items():
    a=np.asarray(Image.open(SRC+fname).convert('RGBA'))
    fr=[a[r*CELL:(r+1)*CELL, c*CELL:(c+1)*CELL] for r in range(ROWS) for c in range(COLS)]
    fr=[f for f in fr if (f[:,:,3]>8).any()]
    bodyH=int(np.median([ (lambda y:y.max()-y.min()+1)(np.where(fr[i][:,:,3]>8)[0]) for i in standing ]))
    groundY=int(np.median([ np.where(fr[i][:,:,3]>8)[0].max() for i in standing ]))
    d=pack(key, fr, BODY_TARGET/bodyH, groundY, colors)
    d['body']=round(bodyH*BODY_TARGET/bodyH)
    if key=='idle': GRID_S=BODY_TARGET/bodyH
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


# ---------------------------------------------------------------- the dance (4x4, celebration)
# HE IS UP ON HIS HIND LEGS, AND HE HAS TO LOOK IT. Normalising this sheet to its own height the
# way the grounded sets are normalised would draw a rearing dog at exactly the height of a standing
# one, which is the same mistake that inflated the rear-view walk sheet by 38%. It is rendered at
# the SAME nominal scale as the idle sheet - his 175px here against the standing dog's 105px is a
# ratio of 1.67, which is what a labrador up on his back legs actually measures - so it borrows the
# idle sheet's scale outright and reports the shared `body`. Stored taller than it is wide, like
# the jump strip, and hung from its own floor line.
DANCE = ('6483e185-image.png', 4, 4)

def build_dance(colors):
    fname,C,R_ = DANCE
    a=np.asarray(Image.open(SRC+fname).convert('RGBA'))
    ch, cw = a.shape[0]//R_, a.shape[1]//C
    fr=[a[r*ch:(r+1)*ch, c*cw:(c+1)*cw] for r in range(R_) for c in range(C)]
    fr=[f for f in fr if (f[:,:,3]>8).any()]
    gy=int(np.median([ np.where(f[:,:,3]>8)[0].max() for f in fr ]))   # his hind paws, on the floor
    d=pack('dance', fr, GRID_S, gy, colors)
    d['body']=round(BODY_TARGET)          # ...so one scale rule covers him rearing as well as flat
    return d

out['dance']=build_dance(colors)
_d=out['dance']
print('%-6s grid  x%2d  body=%3d -> %3dx%3d n=%d foot=%3d peakLift=%2d  %6.1f KB'
      %('dance',_d['n'],_d['body'],_d['w'],_d['h'],_d['n'],_d['foot'],max(_d['lift']),_d['bytes']/1024))

# ------------------------------------------------------------------- the roll (4x4, a trick)
# A 4x4 sheet carrying the whole roll-over twice over with walk frames between: 0-1 walking, 2 head
# going down, 3 tucked, 4-5 over on his back, 6 coming up, 7 rising, 8-10 walking again, 11-14 the
# second, shorter pass, 15 walking. Only 2..7 is the trick; the walking frames are the sheet's own
# bookends and there are better walk cycles already.
# The scale reference is the UPRIGHT walking frames, not the median of the whole sheet - half of
# these frames are a dog lying on his back, which is not a height you can normalise against.
ROLL = ('1fab158f-image.png', 4, 4, [2,3,4,5,6,7], [0,1,9,15])

def build_roll(colors):
    fname,C,R_,keep,stand = ROLL
    a=np.asarray(Image.open(SRC+fname).convert('RGBA'))
    ch, cw = a.shape[0]//R_, a.shape[1]//C
    all_fr=[a[r*ch:(r+1)*ch, c*cw:(c+1)*cw] for r in range(R_) for c in range(C)]
    hh=lambda f:(lambda y:y.max()-y.min()+1)(np.where(f[:,:,3]>8)[0])
    ref=float(np.median([hh(all_fr[i]) for i in stand]))
    fr=[all_fr[i] for i in keep]
    gy=int(np.median([ np.where(f[:,:,3]>8)[0].max() for f in all_fr ]))   # the floor he lies on
    d=pack('roll', fr, BODY_TARGET/ref, gy, colors)
    d['body']=round(BODY_TARGET)
    return d

out['roll']=build_roll(colors)
_r=out['roll']
print('%-6s grid  x%2d  body=%3d -> %3dx%3d n=%d foot=%3d peakLift=%2d  %6.1f KB'
      %('roll',_r['n'],_r['body'],_r['w'],_r['h'],_r['n'],_r['foot'],max(_r['lift']),_r['bytes']/1024))

# ------------------------------------------------------------ direction sheets (walk on a floor)
# THE WALK PACK. Five sheets, five facings, a full twenty-five-frame cycle each. The tongue is the
# giveaway for which way he faces, because a dog walking away shows none: 46ef5345 shows his face,
# so it is S (toward the camera) and not N as the first pass had it, and 881e7fb5 - all back and
# tail, no face - is the real N. 0df635e8 is the away-facing three-quarter the pack had been
# missing, so NE is stored art now rather than falling back to N.
#
# NONE OF THESE ARE BOUNDS. The set they replace included 1dc07507, whose frame heights spread 56%
# and whose bottom edge wandered 17px, because it is a gallop with all four feet off the floor.
# Anchored on one ground line that reads as a HOP every time he moved diagonally. Every sheet here
# holds its bottom edge to within 3px across all 25 frames.
DIRS = {
  'E' : ('0aabfc94-image.png', 5, 5),   # side-on, right
  'SE': ('b6e53f6a-image.png', 5, 5),   # 3/4 toward-right
  'NE': ('0df635e8-image.png', 5, 5),   # 3/4 away-right
  'S' : ('46ef5345-image.png', 5, 5),   # toward the camera
  'N' : ('881e7fb5-image.png', 5, 5),   # away from the camera
}
DIR_FRAMES = 25         # the whole cycle. Five frames of a twenty-five frame walk is every fifth
                        # pose, which is not a slow walk - it is a stagger.
DIR_TARGET = 80.0       # stored px for every facing's own body; five facings times twenty-five
                        # frames is a lot of pixels to carry

# EACH SHEET IS NORMALISED TO ITS OWN HEIGHT, and the reason is worth writing down because the
# opposite was tried first and shipped. The argument for one shared scale was that these were all
# rendered at the same nominal size, so a rear view SHOULD come out shorter - you cannot see his
# head over his back. Measure a genuinely view-invariant feature and that argument collapses: a
# paw is as wide from the front as it is from the side, and the median paw width runs 16.0px on
# the E sheet, 12.0 on SE, 9.5 on S, 9.0 on NE and 8.5 on N. The E dog is drawn nearly twice the
# size of the N dog. A shared scale does not preserve their true relative sizes - it preserves the
# SOURCE's inconsistency, and on screen he shrank by a third every time he turned away.
# Normalising each sheet by its own standing height corrects for that, and side by side the five
# facings then read as one animal.
def dir_frames(fname, C, R):
    a=np.asarray(Image.open(SRC+fname).convert('RGBA'))
    cw, ch = a.shape[1]//C, a.shape[0]//R
    fr=[a[r*ch:(r+1)*ch, c*cw:(c+1)*cw] for r in range(R) for c in range(C)][:DIR_FRAMES]
    return [f for f in fr if (f[:,:,3]>8).any()]

_dirfr={k:dir_frames(f,C,R) for k,(f,C,R) in DIRS.items()}
def _med_h(fr):
    return float(np.median([ (lambda y:y.max()-y.min()+1)(np.where(f[:,:,3]>8)[0]) for f in fr ]))

for k in DIRS:
    fr=_dirfr[k]
    med=_med_h(fr)
    gy=int(np.median([ np.where(f[:,:,3]>8)[0].max() for f in fr ]))   # this facing's own floor
    d=pack(k, fr, DIR_TARGET/med, gy, colors)
    d['body']=round(DIR_TARGET)                 # identical everywhere, so the draw has one rule
    out['dir_'+k]=d
    print('%-6s dir   x%2d  src=%3d body=%3d -> %3dx%3d n=%d foot=%3d  %6.1f KB'
          %(k,d['n'],round(med),d['body'],d['w'],d['h'],d['n'],d['foot'],d['bytes']/1024))

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
for k in ['idle','jump','dance','roll','come','rest','sit','beg','sniff']:
    d=out[k]
    js.append('  %s:{w:%d,h:%d,n:%d,foot:%d,body:%d,\n     lift:[%s],\n     top:[%s],\n     src:"%s"},'
              %(k,d['w'],d['h'],d['n'],d['foot'],d['body'],
                ','.join(map(str,d['lift'])), ','.join(map(str,d['top'])), d['u']))
js.append("};")
js.append("const DOGCAMIMG={};")
js.append("for(const k in DOGCAMART){ const i=new Image(); i.src=DOGCAMART[k].src; DOGCAMIMG[k]=i; }")
js.append("")
js.append("/* HIM WALKING THE FLOOR: five stored facings, twenty-five frames each, and W/SW/NW come")
js.append("   free by mirroring E/SE/NE. The five source sheets are NOT drawn at one size - a paw is")
js.append("   16px across on the side sheet and 8.5px on the rear one, and a paw does not change")
js.append("   width with the angle you look at it from - so each is normalised to its own standing")
js.append("   height and they all report the SAME `body`. Turning cannot resize him. Anchored on")
js.append("   each facing's own floor line, and none of these sheets leaves the ground, so nothing")
js.append("   here can read as a hop. */")
js.append("const DOGDIR={")
for k in ['E','SE','NE','S','N']:
    d=out['dir_'+k]
    js.append('  %s:{w:%d,h:%d,n:%d,foot:%d,body:%d,\n     top:[%s],\n     src:"%s"},'
              %(k,d['w'],d['h'],d['n'],d['foot'],d['body'],','.join(map(str,d['top'])),d['u']))
js.append("};")
js.append("const DOGDIRIMG={};")
js.append("for(const k in DOGDIR){ const i=new Image(); i.src=DOGDIR[k].src; DOGDIRIMG[k]=i; }")
js.append("// octant -> stored sheet + mirror flag. 0=E, going clockwise on screen through S (down).")
js.append("const DOGDIR_MAP=[{k:'E',f:0},{k:'SE',f:0},{k:'S',f:0},{k:'SE',f:1},")
js.append("                  {k:'E',f:1},{k:'NE',f:1},{k:'N',f:0},{k:'NE',f:0}];")
js.append("const _DOGCAMIMG_DONE=1;")
open(OUT,'w').write("\n".join(js)+"\n")
print('dogcam.js %.0f KB'%(os.path.getsize(OUT)/1024))
