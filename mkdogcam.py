from PIL import Image
import numpy as np, base64, io, os, sys

SRC='/root/.claude/uploads/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/'
OUT='/tmp/claude-0/-home-user-BONES/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/scratchpad/dogcam.js'
CELL=256; COLS=5; ROWS=5

# TWO SHEETS, ONE DOG, TWO DIFFERENT RENDER SCALES.
# The idle sheet draws his standing body 106px tall; the jump sheet draws it 89. Left alone he
# would change size the instant he left the ground. So each sheet is scaled by its OWN standing
# body height to a single target, and the correction is baked into the stored pixels - exactly the
# rule mkwalk.py had to learn for the eight isometric directions.
#
# THE GROUND LINE MATTERS MORE THAN THE BOUNDING BOX. In the jump sheet his feet genuinely leave
# the floor: the bbox bottom runs 167 while grounded and lifts to 125 at the apex. Cropping every
# frame to a SHARED bbox therefore keeps the leap inside the sprite - the animation is the jump,
# and the game only has to add whatever extra height it wants on top. Cropping frame-by-frame
# would throw that away and leave him pedalling in place.
BODY_TARGET = 80.0      # stored px for his standing body, both sheets

SHEETS = {
  # key         file        standing frames (body height is measured from these)
  'idle': ('92ce34c9', [0,1,2,3,4]),
  'jump': ('f17d99ca', [0,1]),
}

def build(key, fkey, standing, colors):
    a=np.asarray(Image.open(SRC+fkey+'-image.png').convert('RGBA'))
    frames=[a[r*CELL:(r+1)*CELL, c*CELL:(c+1)*CELL] for r in range(ROWS) for c in range(COLS)]
    frames=[f for f in frames if (f[:,:,3]>8).any()]
    # the shared box
    L=T=10**9; R=B=-1
    for f in frames:
        ys,xs=np.where(f[:,:,3]>8)
        L=min(L,xs.min()); R=max(R,xs.max()); T=min(T,ys.min()); B=max(B,ys.max())
    # his standing body height, and where the floor is, from the grounded frames only
    bodyH=int(np.median([ (lambda ys: ys.max()-ys.min()+1)(np.where(frames[i][:,:,3]>8)[0]) for i in standing ]))
    groundY=int(np.median([ np.where(frames[i][:,:,3]>8)[0].max() for i in standing ]))
    s=BODY_TARGET/bodyH
    w=R-L+1; h=B-T+1
    sw=max(1,round(w*s)); sh=max(1,round(h*s))
    n=len(frames)
    strip=Image.new('RGBA',(sw*n,sh),(0,0,0,0))
    for i,f in enumerate(frames):
        strip.paste(Image.fromarray(f,'RGBA').crop((L,T,R+1,B+1)).resize((sw,sh),Image.LANCZOS),(i*sw,0))
    alpha=strip.getchannel('A')
    q=strip.convert('RGB').quantize(colors=colors,method=Image.FASTOCTREE,dither=Image.NONE).convert('RGBA')
    q.putalpha(alpha)
    b=io.BytesIO(); q.save(b,'PNG',optimize=True)
    # foot: stored px from the TOP of the strip down to the floor his standing frames rest on.
    # Everything above it that a frame happens to occupy is air, which is the whole point.
    foot=round((groundY-T+1)*s)
    # PER-FRAME LIFT, in stored px: how far above the floor line this frame's lowest pixel sits.
    # The game needs this and cannot infer it - his mouth has to be findable while he is in the
    # air, and the only honest source for "how high is he right now" is the art itself.
    lift=[]; top=[]
    for f in frames:
        ys,_=np.where(f[:,:,3]>8)
        lift.append(max(0, round((groundY-ys.max())*s)))
        top.append(round((ys.min()-T)*s))       # his crown, from the top of the stored strip
    d={'w':sw,'h':sh,'n':n,'foot':foot,'body':round(bodyH*s),'lift':lift,'top':top,
       'ax':round((128.0-L)*s/sw,4),
       'u':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()}
    print('%-5s src %3dx%3d x%2d  body=%3d ground=%3d  -> %3dx%3d foot=%3d peakLift=%3d  %7.1f KB'
          %(key,w,h,n,bodyH,groundY,sw,sh,foot,max(lift),len(b.getvalue())/1024))
    return d

colors=int(sys.argv[1]) if len(sys.argv)>1 else 64
out={k:build(k,f,st,colors) for k,(f,st) in SHEETS.items()}
total=sum(len(base64.b64decode(d['u'].split(',')[1])) for d in out.values())
print('TOTAL %.1f KB raw, %.1f KB as base64'%(total/1024, total*4/3/1024))

js=["/* BONES ON DOGCAM: a 25-frame idle and a 25-frame jump, side-on, full colour.",
    "   `foot` is where his floor is inside the stored image, measured from the TOP. For the idle",
    "   that is simply the bottom edge; for the jump it is the line his feet rest on while he is",
    "   still grounded, and the frames above it are him genuinely off the ground - frames 7-15 lift",
    "   the whole body clear, peaking at 10-11. Drawing anchored on `foot` therefore plays the leap",
    "   without the game adding a single pixel of its own, and anything the game DOES add stacks on",
    "   top of it. `body` is his standing height, identical in both sets by construction, so one",
    "   scale serves every state and he cannot change size when he leaves the floor. */",
    "const DOGCAMART={"]
for k in ['idle','jump']:
    d=out[k]
    js.append('  %s:{w:%d,h:%d,n:%d,foot:%d,body:%d,ax:%s,\n     lift:[%s],\n     top:[%s],\n     src:"%s"},'
              %(k,d['w'],d['h'],d['n'],d['foot'],d['body'],d['ax'],
                ','.join(str(v) for v in d['lift']),
                ','.join(str(v) for v in d['top']),d['u']))
js.append("};")
js.append("const DOGCAMIMG={};")
js.append("for(const k in DOGCAMART){ const i=new Image(); i.src=DOGCAMART[k].src; DOGCAMIMG[k]=i; }")
open(OUT,'w').write("\n".join(js)+"\n")
print('dogcam.js %.0f KB'%(os.path.getsize(OUT)/1024))
