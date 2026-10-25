import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const D=process.env.D, FONT='file:///home/user/BONES/android/fonts/ps2p-latin.woff2';
const bone='<svg viewBox="-8 -5 16 10"><rect x="-5" y="-1.5" width="10" height="3" fill="#fff"/><circle cx="-5" cy="-2" r="2.4" fill="#fff"/><circle cx="-5" cy="2" r="2.4" fill="#fff"/><circle cx="5" cy="-2" r="2.4" fill="#fff"/><circle cx="5" cy="2" r="2.4" fill="#fff"/></svg>';
// a fixed scatter of faint bones, the title screen's own motif
let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const bones=n=>{ let h=''; for(let i=0;i<n;i++){ const s=18+rnd()*34; h+=`<i class="bn" style="left:${(rnd()*100).toFixed(1)}%;top:${(rnd()*100).toFixed(1)}%;width:${s}px;height:${s*0.62}px;transform:rotate(${(rnd()*360)|0}deg);opacity:${(0.04+rnd()*0.08).toFixed(2)}">${bone}</i>`; } return h; };
const base=`<style>@font-face{font-family:P;src:url(${FONT}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box} body{width:1920px;height:1080px;overflow:hidden;background:#09090b;font-family:P,monospace;color:#fff;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 72% 50%,rgba(255,40,40,.16),transparent 55%),radial-gradient(ellipse at 10% 100%,rgba(255,255,255,.05),transparent 50%)}
.bn{position:absolute;display:block} .bn svg{width:100%;height:100%;display:block}
.copy{position:absolute;left:120px;top:0;bottom:0;width:820px;display:flex;flex-direction:column;justify-content:center;gap:34px}
.kick{font-size:20px;letter-spacing:4px;color:#ff3b30}
h1{font-size:54px;line-height:1.35;font-weight:400;letter-spacing:2px;text-shadow:0 6px 0 rgba(0,0,0,.6)}
p{font-size:19px;line-height:1.95;color:#cfcfd6;max-width:780px}
.logo{position:absolute;left:120px;bottom:64px;display:flex;align-items:center;gap:22px}
.logo b{border:5px solid #fff;padding:10px 18px 8px;font-size:30px;letter-spacing:5px;font-weight:400}
.logo span{font-size:14px;letter-spacing:2px;color:#8d8d96;line-height:1.8}
.ph{position:absolute;border-radius:34px;overflow:hidden;border:4px solid #2c2c33;background:#000;
  box-shadow:0 30px 60px rgba(0,0,0,.7),0 0 0 12px #121216,0 0 0 14px #2c2c33}
.ph img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.tag{position:absolute;white-space:nowrap;right:110px;background:#ff3b30;color:#fff;font-size:15px;letter-spacing:2px;padding:12px 16px;box-shadow:6px 6px 0 #000}
</style><div class="bg"></div>${bones(46)}`;
const logo=`<div class="logo"><b>BONES</b><span>FREE TO PLAY IN YOUR BROWSER<br>AND ON ANDROID</span></div>`;
const phone=(src,x,y,h,rot,ar)=>{ const w=Math.round(h*(ar||1030/2150)); return `<div class="ph" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot||0}deg)"><img src="file://${D}/${src}"></div>`; };
const shots={
 shot1_raise: base+`<div class="copy"><div class="kick">DOGCAM</div><h1>RAISE HIM.<br>KEEP HIM<br>ALIVE.</h1><p>Adopt BONES, a rottweiler pup who needs feeding, walking, play and a lot of love. Check in on him any time on the DOGCAM.</p></div>`
   +phone('raw_title.png',1180,150,800,-6)+phone('raw_home.png',1440,110,880,4)+`<div class="tag" style="top:930px">A DOG IS FOR LIFE.</div>`+logo,
 shot2_park: base+`<div class="copy"><div class="kick">DOGPARK</div><h1>BARK THE PARK<br>INTO LINE.</h1><p>Wave after wave of birds, cats, nut-throwing squirrels and laser-eyed mad ones. One thumb steers with the paw stick, the other barks, dashes and leaps.</p></div>`
   +phone('raw_park5.png',1150,140,800,-6)+phone('raw_park3.png',1420,90,900,3)+`<div class="tag" style="top:940px">RECRUIT FRIENDS. SET TREES ON FIRE.</div>`+logo,
 shot3_boss: base+`<div class="copy"><div class="kick">DOGPARK UNLEASHED</div><h1>THEN THE<br>GROUND OPENS.</h1><p>Survive the park at night with a blade and a pair of wings, and something comes up to meet you. Dodge, bark back, and bring down WOLFIE.</p></div>`
   +phone('raw_boss0.png',1150,140,800,-6)+phone('raw_boss3.png',1420,90,900,3)+`<div class="tag" style="top:940px">A BOSS FIGHT WITH TEETH.</div>`+logo,
 shot4_herd: base+`<div class="copy"><div class="kick">SHEEP HERDING</div><h1>HERD THE FLOCK<br>UP THE<br>MOUNTAIN.</h1><p>A whole second game. Push the flock past holes, wolves, rigs on the road and eagles overhead, one field at a time, all the way to the summit.</p></div>`
   +phone('raw_herdmap.png',1150,140,800,-6)+phone('raw_herd3.png',1420,90,900,3)+`<div class="tag" style="top:940px">SEVEN FIELDS TO THE TOP.</div>`+logo,
 shot5_themes: base+`<div class="copy" style="top:70px;bottom:auto;width:1700px;gap:22px"><div class="kick">MAKE IT YOURS</div><h1 style="font-size:54px">ELEVEN LOOKS. ONE GOOD BOY.</h1><p style="max-width:1500px">Switch the whole game between eleven themes, from a pocket handheld to the trading floor.</p></div>`
   +[['raw_th_pocket.png','POCKET'],['raw_th_brat.png','PINK BRAT'],['raw_th_scrapbook.png','SCRAPBOOK'],['raw_th_spatial.png','SPATIAL'],['raw_th_terminal.png','TERMINAL'],['raw_th_riso.png','RISO']]
     .map(([s,n],i)=>phone(s,120+i*285,350,540,0)+`<div style="position:absolute;left:${120+i*285}px;top:912px;width:259px;text-align:center;font-size:15px;letter-spacing:3px;color:#fff">${n}</div>`).join('')+logo.replace('bottom:64px','bottom:40px'),
 cover: `<style>@font-face{font-family:P;src:url(${FONT}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box} body{width:630px;height:500px;overflow:hidden;background:#060607;font-family:P,monospace;color:#fff;position:relative}
.half{position:absolute;top:0;bottom:0;width:58%;overflow:hidden} .half img{position:absolute;height:118%;top:0}
.l{left:-4%;clip-path:polygon(0 0,100% 0,72% 100%,0 100%)} .l img{left:-6%}
.r{right:-4%;clip-path:polygon(28% 0,100% 0,100% 100%,0 100%)} .r img{right:-8%}
.r::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 60% 40%,rgba(255,30,30,.28),transparent 65%)}
.cut{position:absolute;top:-10px;bottom:-10px;left:50%;width:6px;background:#fff;transform:translateX(-50%) skewX(-11.5deg);box-shadow:0 0 18px rgba(255,255,255,.5)}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.0) 45%,rgba(0,0,0,.85))}
.logo{position:absolute;left:50%;top:26px;transform:translateX(-50%);border:5px solid #fff;background:#000;padding:12px 22px 9px;font-size:46px;letter-spacing:7px}
.sub{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:14px;letter-spacing:3px;line-height:2}
.sub em{font-style:normal;color:#ff3b30}
.g{position:absolute;bottom:92px;font-size:11px;letter-spacing:2px;padding:7px 9px;background:#fff;color:#000} .g.r2{background:#ff3b30;color:#fff}
</style><div class="half l"><img src="file://${D}/port_happy.jpeg"></div><div class="half r"><img src="file://${D}/port_savage.jpeg"></div>
<div class="cut"></div><div class="shade"></div><div class="logo">BONES</div>
<div class="g" style="left:34px">GOOD BOY</div><div class="g r2" style="right:34px">BAD DOG</div>
<div class="sub">RAISE HIM <em>·</em> FIGHT FOR HIM<br><em>A DOG IS FOR LIFE.</em></div>`
};
const b=await chromium.launch();
for(const [k,html] of Object.entries(shots)){
  const cov=k==='cover';
  const p=await b.newPage({viewport:cov?{width:630,height:500}:{width:1920,height:1080}, deviceScaleFactor:cov?2:1});
  const fs=await import('fs'); fs.writeFileSync(D+'/'+k+'.html','<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>');
  await p.goto('file://'+D+'/'+k+'.html',{waitUntil:'load'}); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
  await p.screenshot({path:D+'/'+k+'.png'}); await p.close(); console.log(k);
}
await b.close();
