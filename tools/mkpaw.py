"""Turn the artist's JPEGs into paw sprites.

THE ALPHA IS A BACKGROUND KEY, NOT A LUMINANCE KEY, and that distinction is the whole file.
Keying on brightness cannot tell black FUR from a black BACKGROUND, so the first version made
91% of every sprite semi-transparent: the forearm is dark grey shading to near-black, and every
one of those pixels came out part see-through. The paws looked like ghosts.

So: flood the near-black from the BORDERS inwards. Only background the border can reach is
background; a black pixel walled in by fur is fur, and stays opaque. The soft edge comes from
letting the reachable pixels keep an alpha proportional to their own brightness, which is what
gives the wisps their feathering without eating the body.
"""
from PIL import Image, ImageFilter
import numpy as np, os, sys
from collections import deque

UP='/root/.claude/uploads/9ee95e47-7f7a-595e-b061-d5ca2faf6b7c/'
# stem: (source, annotation region h, region w, dilation, wide colour net)
JOBS={'move':('338d75a2-image.jpg',0.42,0.34,15,False),
      'chg' :('8d32663e-image.jpg',0.42,0.34,15,False),
      'chgb':('0ee89b9f-image.jpg',0.34,0.44,17,True),
      'fire':('e4828c4d-image.jpg',0.42,0.34,15,False)}
BG=26      # reachable from the border and no brighter than this: background
FEATHER=40 # ...and a background pixel keeps alpha in proportion to its own light, up to here
LONG=190

def flood_bg(lum):
    h,w=lum.shape
    bg=np.zeros((h,w),bool)
    q=deque()
    for x in range(w):
        for y in (0,h-1):
            if lum[y,x]<=BG and not bg[y,x]: bg[y,x]=True; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if lum[y,x]<=BG and not bg[y,x]: bg[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and not bg[ny,nx] and lum[ny,nx]<=BG:
                bg[ny,nx]=True; q.append((ny,nx))
    return bg

for stem,(f,ry,rx,dil,wide) in JOBS.items():
    im=Image.open(UP+f).convert('RGB')
    a=np.asarray(im).astype(int); H,W,_=a.shape
    r,g,b=a[:,:,0],a[:,:,1],a[:,:,2]
    # the red annotation numeral, lifted out before anything else looks at the picture
    if wide: ann=(r>95)&(abs(r-180)<95)&(g<118)&(b<118)&(r-g>40)&(r-b>40)
    else:    ann=(abs(r-180)<46)&(abs(g-52)<40)&(abs(b-52)<40)
    reg=np.zeros_like(ann); reg[:int(H*ry),:int(W*rx)]=True
    m=(ann&reg).astype(np.uint8)*255
    m=np.asarray(Image.fromarray(m).filter(ImageFilter.MaxFilter(dil)))
    a[m>0]=0

    lum=a.max(axis=2).astype(np.uint8)
    bg=flood_bg(lum)
    alpha=np.where(bg, np.clip(lum*(255.0/FEATHER),0,255), 255).astype(np.uint8)

    img=Image.fromarray(np.dstack([a.astype(np.uint8),alpha]),'RGBA')
    bb=img.getchannel('A').point(lambda v:255 if v>10 else 0).getbbox()
    img=img.crop(bb); w,h=img.size; k=LONG/max(w,h)
    img=img.resize((max(1,round(w*k)),max(1,round(h*k))), Image.LANCZOS)
    q=img.quantize(colors=96, method=Image.FASTOCTREE, dither=Image.NONE)
    out='pawart/q_%s.png'%stem
    q.save(out, optimize=True)
    al=np.asarray(q.convert('RGBA'))[:,:,3]
    body=(al>0).sum(); semi=((al>0)&(al<250)).sum()
    print(stem, q.size, os.path.getsize(out),'bytes  semi-transparent %.0f%%'%(100*semi/max(1,body)))
