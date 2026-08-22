from PIL import Image
import base64, io, json, os

TARGET = {  # name -> target width in device pixels
 'h_front':230,'h_roar':230,'h_left':230,'h_right':230,'h_rear':215,'h_dip':230,
 's_neck':210,'s_coilA':180,'s_coilB':170,'s_coilC':160,'s_rift':340,
}
def enc(p, w):
    im = Image.open(p).convert("RGBA")
    h = max(1, round(im.height * w / im.width))
    im = im.resize((w, h), Image.LANCZOS)
    a = im.getchannel("A").point(lambda v: 255 if v > 110 else 0)   # keep the edge crisp
    im.putalpha(a)
    q = im.convert("RGB").quantize(colors=64, method=Image.FASTOCTREE, dither=Image.NONE).convert("RGBA")
    q.putalpha(a)
    b = io.BytesIO(); q.save(b, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), (w, h), len(b.getvalue())

out, total = {}, 0
for n, w in TARGET.items():
    u, sz, nb = enc("wolf/%s.png" % n, w)
    out[n] = {"u": u, "w": sz[0], "h": sz[1]}
    total += nb
    print("%-9s %sx%s  %5.1fKB" % (n, sz[0], sz[1], nb/1024))
print("TOTAL %.1f KB" % (total/1024))

js = ["/* THE HOLLOW — boss art, sliced from the supplied sheets. Head cells are the six",
      "   telegraph poses; neck/coil/rift are the body segments, drawn back to front. */",
      "const WOLF = {"]
for n, d in out.items():
    js.append('  %s:{w:%d,h:%d,src:"%s"},' % (n.replace("h_","head_").replace("s_",""), d["w"], d["h"], d["u"]))
js.append("};")
js.append("const WOLFIMG={};")
js.append("for(const k in WOLF){ const i=new Image(); i.src=WOLF[k].src; WOLFIMG[k]=i; }")
open("wolfframes.js","w").write("\n".join(js) + "\n")
print("wolfframes.js", os.path.getsize("wolfframes.js")//1024, "KB")
