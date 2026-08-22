from PIL import Image
import numpy as np
from collections import deque

def _comp_labels(mask):
    h,w=mask.shape; lab=np.zeros((h,w),np.int32); cur=0; sizes=[0]
    for sy in range(h):
        for sx in range(w):
            if mask[sy,sx] and lab[sy,sx]==0:
                cur+=1; n=0; q=deque([(sy,sx)]); lab[sy,sx]=cur
                while q:
                    y,x=q.popleft(); n+=1
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                        ny,nx=y+dy,x+dx
                        if 0<=ny<h and 0<=nx<w and mask[ny,nx] and lab[ny,nx]==0:
                            lab[ny,nx]=cur; q.append((ny,nx))
                sizes.append(n)
    return lab,sizes

def fill_holes(mask):
    """Anything not reachable from the border through empty space is interior."""
    h,w=mask.shape
    out=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if not mask[y,x] and not out[y,x]: out[y,x]=True; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if not mask[y,x] and not out[y,x]: out[y,x]=True; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and not mask[ny,nx] and not out[ny,nx]:
                out[ny,nx]=True; q.append((ny,nx))
    return ~out

def dilate(m,n=1):
    for _ in range(n):
        p=np.pad(m,1)
        m=(p[:-2,1:-1]|p[2:,1:-1]|p[1:-1,:-2]|p[1:-1,2:]|p[1:-1,1:-1])
    return m

def cut(path, region, thr=20, grow=1, minfrac=0.02, bridge=0):
    im=Image.open(path).convert("RGB").crop(region)
    a=np.asarray(im)
    L=a.astype(int).max(2)
    m=L>thr
    # a plated segment thresholds into one piece per plate; bridge the dark seams first so the
    # whole thing labels as a single blob, then hole-filling puts the seams back
    lab,sizes=_comp_labels(dilate(m,bridge) if bridge else m)
    if len(sizes)<2: return None
    big=int(np.argmax(sizes))
    m=(lab==big)
    if sizes[big] < minfrac*m.size: return None
    m=fill_holes(m)
    if grow: m=dilate(m,grow)
    ys,xs=np.where(m)
    box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
    rgba=np.dstack([a,(m*255).astype(np.uint8)])
    return Image.fromarray(rgba,"RGBA").crop(box)
