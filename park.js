/* ===== GO TO THE PARK (Dogpark) ===== */
// Dogpark is its own self-contained roguelite: BONES (dropped by enemies) is a mini-currency
// that only exists inside a run, spent on stat upgrades and rare charm relics between waves.
// None of it carries over — only a small trickle of real hub XP makes it home, earned from
// how many enemies you downed and how many side objectives (hoop/tunnel/ramp) you hit.
const PK={active:false, godMode:false}; // godMode is a dev-only toggle and deliberately isn't reset per-run
function wd(d,M){ return ((d + M/2) % M + M) % M - M/2; }  // shortest signed delta on the looping world
// Overheal. Running the agility course at full health banks a yellow shield on top of the
// bar. It bleeds away on its own — faster the fuller it is, so a big stack is a burst to
// spend, not something to sit on — and while any of it is left he runs a little quicker.
const OVER_FRAC=0.60;        // shield ceiling, as a fraction of max HP
const OVER_DRAIN=1.6;        // HP/sec at an empty shield
const OVER_DRAIN_SCALE=7.0;  // ...rising to this much more at a full one
const OVER_SPEED=1.16;       // the kick you get for having any left
function pkOverCap(){ return PK.maxhp*OVER_FRAC; }
// Full Armour. A dedicated shop purchase — a second bar worth a full max HP, bought outright
// rather than banked passively like the shield above. It never drains on its own; only taking
// a hit spends it. It sits behind the shield in the order damage is paid from: the shield is
// already ticking away on its own clock, so a hit may as well spend that first and leave the
// armour, which will happily wait, for later.
function pkArmorCap(){ return PK.maxhp; }
function pkHurt(n){
  if(PK.over>0){                       // the shield eats it first
    const ate=Math.min(PK.over,n);
    PK.over-=ate; n-=ate;
    PK.shake=Math.max(PK.shake||0,0.16);
    beep(540,.06,"square",.045);
    for(let i=0;i<5;i++){ const a2=Math.random()*6.283, sp=40+Math.random()*50;
      SPARKS.push({x:PK.x,y:PK.y-12,vx:Math.cos(a2)*sp,vy:Math.sin(a2)*sp-25,life:0.3,gold:true}); }
  }
  if(n>0 && PK.armor>0){
    const ate=Math.min(PK.armor,n);
    PK.armor-=ate; n-=ate;
    PK.shake=Math.max(PK.shake||0,0.14);
    beep(420,.07,"square",.04);
    for(let i=0;i<5;i++){ const a2=Math.random()*6.283, sp=40+Math.random()*50;
      SPARKS.push({x:PK.x,y:PK.y-12,vx:Math.cos(a2)*sp,vy:Math.sin(a2)*sp-25,life:0.3,steel:true}); }
  }
  if(n>0) PK.hp-=n;
}
function pkInvuln(){ return PK.godMode || PK.zoomT>0; }   // the golden bone: zoomies + untouchable
const XP_PER_KILL=0.4, XP_PER_SIDE=2;
// a long run with a full crew can rack up well over a thousand downed enemies once companions and
// burning trees start feeding the count, which was banking enough XP to jump several levels at
// once. The cap keeps a great run worth roughly a level or two rather than a whole afternoon.
const XP_RUN_CAP=120;
// every XP faucet a park visit has -- the run itself, side missions, the bones exchange and the
// garden bury -- draws from this one budget. A cap only on the run total would have meant nothing:
// burying leftover bones pays 1 XP each, and a good run comes home with over a thousand of them.
function pkXPLeft(){ return Math.max(0, XP_RUN_CAP-(PK.xpFromRun||0)); }
function pkAwardXP(n){
  const give=Math.min(Math.max(0,Math.round(n)), pkXPLeft());
  PK.xpFromRun=(PK.xpFromRun||0)+give;
  if(give>0) addXP(give);
  return give;
}
// rare enemy-drop powerups — 1% chance each, independent of the guaranteed bone drop
const MAGNET_DROP_CHANCE=0.01, ZOOM_DURATION=15, MAGNET_HOMING_SPEED=280;
// a steady drip rather than a lump sum: it rewards staying alive with it, not hoarding it
const REGEN_DROP_CHANCE=0.02, REGEN_DURATION=25, REGEN_RATE=1;
const HURT_TIME=0.42;   // how long the red buzz rides on BONES and his health bar after a hit
function pkRunXP(){ return clamp(Math.round(PK.kills*XP_PER_KILL + PK.sideDone*XP_PER_SIDE), 0, XP_RUN_CAP); }
// Dogpark-only relic pool — same lore/names as the Home Shop charms, but tuned to the verbs
// that actually exist in a Dogpark run (bark, speed, knockback, hp) rather than the runner's
// jump/score stats. Bought with bones from the between-wave shop; one active at a time, and
// none of it persists once the run ends.
const PK_CHARMS=[
  {id:"spike", name:"SPIKED COLLAR", cost:18, fx:"+20% SPEED", apply:()=>{PK.spd*=1.2;}},
  {id:"band",  name:"RED BANDANA",   cost:14, fx:"+25% BARK RADIUS", apply:()=>{PK.barkR=Math.min(BARK_CAP,PK.barkR*1.25);}},
  {id:"bell",  name:"BRASS BELL",    cost:16, fx:"-25% BARK COOLDOWN", apply:()=>{PK.barkMax=Math.max(0.6,PK.barkMax*0.75);}},
  {id:"tag",   name:"STEEL TAG",     cost:22, fx:"+30 MAX HP, HEAL 30", apply:()=>{PK.maxhp+=30; PK.hp=Math.min(PK.maxhp,PK.hp+30);}},
  {id:"rope",  name:"LUCKY ROPE",    cost:18, fx:"+40% KNOCKBACK", apply:()=>{PK.knock*=1.4;}},
  {id:"shadow",name:"SHADOW LEASH",  cost:24, fx:"+30% SPEED, RISKIER", apply:()=>{PK.spd*=1.3;}}
];
function drawBone(ctx,x,y,s,color){
  ctx.fillStyle=color;
  ctx.fillRect(x-5*s, y-1.5*s, 10*s, 3*s);
  ctx.beginPath();
  ctx.arc(x-5*s,y-2*s,2.2*s,0,7); ctx.arc(x-5*s,y+2*s,2.2*s,0,7);
  ctx.arc(x+5*s,y-2*s,2.2*s,0,7); ctx.arc(x+5*s,y+2*s,2.2*s,0,7);
  ctx.fill();
}
function drawStarIcon(ctx,x,y,r){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#ffe98a"; ctx.strokeStyle="#a9770a"; ctx.lineWidth=1.5;
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a=-Math.PI/2+i*2*Math.PI/5, a2=a+Math.PI/5;
    ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    ctx.lineTo(Math.cos(a2)*r*0.42, Math.sin(a2)*r*0.42);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawRegenIcon(ctx,x,y,r){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#3fdc7a"; ctx.strokeStyle="#0a5c2c"; ctx.lineWidth=1.5;
  const a=r*0.34;
  ctx.beginPath();
  ctx.moveTo(-a,-r*0.9); ctx.lineTo(a,-r*0.9); ctx.lineTo(a,-a); ctx.lineTo(r*0.9,-a);
  ctx.lineTo(r*0.9,a); ctx.lineTo(a,a); ctx.lineTo(a,r*0.9); ctx.lineTo(-a,r*0.9);
  ctx.lineTo(-a,a); ctx.lineTo(-r*0.9,a); ctx.lineTo(-r*0.9,-a); ctx.lineTo(-a,-a);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawMagnetIcon(ctx,x,y,r){
  ctx.save(); ctx.translate(x,y);
  ctx.strokeStyle="#e23"; ctx.lineWidth=3; ctx.lineCap="round";
  ctx.beginPath(); ctx.arc(0,1,r*0.65,Math.PI*0.15,Math.PI*0.85); ctx.stroke();
  ctx.strokeStyle="#ddd"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-r*0.62,1); ctx.lineTo(-r*0.62,-r*0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r*0.62,1); ctx.lineTo(r*0.62,-r*0.55); ctx.stroke();
  ctx.restore();
}
function drawLock(ctx,x,y,s,color){
  ctx.strokeStyle=color; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.arc(x,y-2.5*s,3*s,Math.PI,0); ctx.stroke();
  ctx.fillStyle=color; ctx.fillRect(x-4*s,y-3*s,8*s,7*s);
}
// tap the bones counter any time (not just between waves) to cash spare bones in for something
// useful back in the main hub — deliberately a worse rate than just letting kills bank XP
// normally, so it's a way to not waste leftover bones rather than a primary strategy
const BONES_EXCHANGE=[
  {label:"XP",    sub:"10 BONES → 2 XP",    cost:10, f:()=>pkAwardXP(2)},
  {label:"MONEY", sub:"10 BONES → $5",      cost:10, f:()=>{S.money+=5;}},
  {label:"TREAT", sub:"15 BONES → 1 BONE TREAT", cost:15, f:()=>{S.snacks+=1;}},
  {label:"COMPASS", sub:"100 BONES → FIND FRIENDS & SECRETS", cost:100, f:()=>{PK.compass=true;}}
];
const SPARKS=[]; // celebratory burst when a shop purchase lands
const HITFX=[];  // impact markers: a snapping ring plus a cross, so every bark visibly lands
// The golden bone sets him off: untouchable, no bark cooldown, and the only time the park
// plays a tune. Hook first, then the three woofs.
function pkZoomies(){
  PK.zoomT=ZOOM_DURATION;
  pkFanfare(null,true,"★ GOLDEN BONE — THE ZOOMIES!");
  const hook=[[523,.13],[523,.13],[587,.13],[523,.15],[440,.15],[392,.22]];
  let acc=0;
  for(const [f,d] of hook){ const at=acc; setTimeout(()=>beep(f,d,"square",.055), at*1000); acc+=d; }
  for(let i=0;i<3;i++) setTimeout(()=>beep(150,.13,"sawtooth",.075), (acc+0.14+i*0.23)*1000);
}
function pkHitMark(x,y,down){
  HITFX.push({x,y,life:down?0.42:0.28,max:down?0.42:0.28,down:!!down});
  const n=down?9:5;
  for(let i=0;i<n;i++){
    const a=Math.random()*6.283, sp=(down?70:45)+Math.random()*60;
    SPARKS.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-30,life:0.28+Math.random()*0.25,gold:down});
  }
}
function pkFanfare(label,big,rawText){
  PK.shopFlash={text:rawText || ((big?"⬥ ":"✓ ")+label+(big?" EQUIPPED!":" BOUGHT!")), life:big?1.6:1.1, max:big?1.6:1.1, gold:!!big};
  const n=big?18:9;
  for(let i=0;i<n;i++){
    const a=Math.random()*6.283, sp=(big?60:40)+Math.random()*(big?60:40);
    SPARKS.push({x:PK.x,y:PK.y-18,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-20,life:0.6+Math.random()*0.5,gold:!!big});
  }
  if(big){ beep(700,.07); setTimeout(()=>beep(950,.08),90); setTimeout(()=>beep(1250,.1),170); }
  else beep(880,.08);
}
// end-of-run reveal: bones fall from above into a growing pile while the counter climbs, then
// a separate XP count-up. On a clean bank the portrait climbs from CONTENT to HAPPY as the pile
// grows — reusing the existing portrait art rather than needing new "excited dog" frames.
function droolPortrait(shown){
  if(shown>=200) return PORTRAITS.drool2;
  if(shown>=90)  return PORTRAITS.drool1;
  if(shown>=35)  return PORTRAITS.happy;
  return PORTRAITS.content;
}
function pkReveal(biscuits, xpFinal, mode){
  const cv=$("#revealcv"), ctx=cv.getContext("2d"), el=$("#resScore");
  const W=cv.width, H=cv.height;
  const cap=Math.min(biscuits,36);                        // animate at most 36 icons; the counter still shows the true total
  const perCol=6, colW=(W-24)/perCol;
  const drops=[]; for(let i=0;i<cap;i++) drops.push({t:i*0.045, landed:false, col:i%perCol, row:Math.floor(i/perCol)});
  const fallDur=0.32, pileDur = cap>0 ? cap*0.045+fallDur+0.3 : 0.3;
  const start=performance.now();
  function drawPile(elapsed){
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle="#444"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(4,H-10); ctx.lineTo(W-4,H-10); ctx.stroke();
    const s=Math.max(0.55,1.15-cap*0.015);
    for(const d of drops){
      const dt2=elapsed-d.t; if(dt2<0) continue;
      const tx=12+d.col*colW+colW/2, ty=H-14-d.row*9;
      const y = dt2<fallDur ? -10+(dt2/fallDur)*(ty+10) : ty;
      if(dt2>=fallDur && !d.landed){ d.landed=true; beep(480+d.row*22,.03,"square",.02); }
      drawBone(ctx, tx, y, s, "#e8c14a");
    }
  }
  function step(now){
    const elapsed=(now-start)/1000;
    drawPile(elapsed);
    const frac=Math.min(1, elapsed/pileDur);
    const shown=Math.round(biscuits*frac);
    el.textContent = shown+" BONES";
    if(mode==="bank"){
      $("#resPortrait").src = droolPortrait(shown);
      $("#resPortrait").style.transform = "scale("+(1+0.05*frac*Math.abs(Math.sin(elapsed*9)))+")";
    }
    if(frac<1){ requestAnimationFrame(step); return; }
    el.textContent=biscuits+" BONES";
    if(mode==="bank") $("#resPortrait").style.transform="scale(1)";
    setTimeout(()=>{
      const xpStart=performance.now();
      function xpStep(now2){
        const p2=Math.min(1,(now2-xpStart)/700);
        el.textContent = Math.round(xpFinal*p2)+" XP";
        if(Math.random()<0.4) beep(600+p2*400,.02,"square",.015);
        if(p2<1){ requestAnimationFrame(xpStep); return; }
        el.textContent=xpFinal+" XP"; el.classList.add("pop"); setTimeout(()=>el.classList.remove("pop"),160);
        beep(760,.09); setTimeout(()=>beep(1040,.12),110);
        PK.pendingBury=biscuits;   // offered only once BACK HOME is pressed — see #bResHome
      }
      requestAnimationFrame(xpStep);
    }, 300);
  }
  requestAnimationFrame(step);
}
function pkOfferGardenBury(biscuits){
  $("#result").classList.remove("show");
  const pay=Math.min(biscuits, pkXPLeft());   // the bury draws from the same budget as everything else
  if(pay<=0){
    // offering a choice worth nothing is worse than not offering it
    toast("HE'S LEARNED ALL HE CAN TODAY — THE BONES KEEP.",1);
    returnHomeFromActivity();
    return;
  }
  const note = pay<biscuits ? "<br><br>HE'S NEARLY FULL — ONLY +"+pay+" XP LEFT IN HIM TODAY." : "";
  openChoice("BONES LEFT OVER",
    "YOU HAVE "+biscuits+" BONES LEFT OVER.<br><br>BURY THEM IN THE GARDEN FOR XP?"+note,
    "BURY THEM — +"+pay+" XP", ()=>{
      const got=pkAwardXP(biscuits); beep(700,.08); setTimeout(()=>beep(950,.09),100);
      toast("+"+got+" XP FROM THE GARDEN.");
      returnHomeFromActivity();
    },
    "LEAVE THEM", ()=>{ returnHomeFromActivity(); });
}
let PARKGHOST=null;
const FRIENDIMG = FRIENDFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const SHOPDOGIMG = SHOPDOGFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const TILEIMG={}, PROPIMG={};
for(const k in PARKTILES){ TILEIMG[k]=new Image(); TILEIMG[k].src=PARKTILES[k]; }
for(const k in PARKPROPS){ PROPIMG[k]=new Image(); PROPIMG[k].src=PARKPROPS[k]; }
let PKBG=null;
function pkBuildBG(w,h){
  const c=document.createElement("canvas"); c.width=w; c.height=h;
  const x=c.getContext("2d"); x.imageSmoothingEnabled=false;
  const ts=48;
  // base field: mid grass with scattered dark-grass variation
  let seed=7;
  const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let ty=0; ty<h; ty+=ts)
    for(let tx=0; tx<w; tx+=ts)
      x.drawImage(rnd()<0.18?TILEIMG.g1:TILEIMG.g2, tx,ty,ts,ts);
  // worn, trodden grass: dithered scatter of small chunks — no tile-grid squares
  const worn=[[.15,.125,80],[.35,.36,76],[.11,.39,68],[.62,.70,72],[.85,.20,66],[.72,.5,72],[.5,.5,64],[.25,.75,60],[.85,.85,58]];
  for(const [fx,fy,r] of worn){
    const cx=fx*w, cy=fy*h, nch=Math.round(r*r/26);
    for(let i=0;i<nch;i++){
      const a2=rnd()*6.283, d=Math.sqrt(rnd())*r;
      if(rnd() < 0.15 + 0.8*(d/r)*(d/r)) continue;        // density falls off toward the rim
      const s=9+rnd()*13, sx=Math.floor(rnd()*40), sy=Math.floor(rnd()*40);
      x.drawImage(TILEIMG.worn, sx,sy,24,24, cx+Math.cos(a2)*d-s/2, cy+Math.sin(a2)*d*0.72-s/2, s,s);
    }
  }
  // bare earth: solid irregular core + dithered chip rim, no outline
  const dirt=[[.15,.125,26],[.35,.36,24],[.11,.39,22],[.62,.70,23],[.85,.20,22],[.72,.5,24]];
  for(const [fx,fy,r] of dirt){
    const cx=fx*w, cy=fy*h;
    x.save();
    x.beginPath();
    for(let i=0;i<=14;i++){                                // lumpy blob, not an ellipse
      const a2=i/14*6.283, rr=r*(0.8+0.35*Math.sin(a2*3+cx));
      const px=cx+Math.cos(a2)*rr, py=cy+Math.sin(a2)*rr*0.66;
      i?x.lineTo(px,py):x.moveTo(px,py);
    }
    x.closePath(); x.clip();
    for(let ty=Math.floor((cy-r)/ts)*ts; ty<cy+r; ty+=ts)
      for(let tx=Math.floor((cx-r)/ts)*ts; tx<cx+r; tx+=ts)
        x.drawImage(TILEIMG.dirt,tx,ty,ts,ts);
    x.restore();
    const chips=Math.round(r*2.6);                          // pixel-dither the boundary
    for(let i=0;i<chips;i++){
      const a2=rnd()*6.283, d=r*(0.82+rnd()*0.5), s=3+rnd()*6;
      const sx=Math.floor(rnd()*44), sy=Math.floor(rnd()*44);
      x.drawImage(TILEIMG.dirt, sx,sy,14,14, cx+Math.cos(a2)*d-s/2, cy+Math.sin(a2)*d*0.66-s/2, s,s);
    }
  }
  // trees baked into the world
  x.strokeStyle="#243522"; x.lineWidth=3;
  for(const tp of [[.05,.07],[.45,.05],[.95,.10],[.03,.55],[.55,.52],[.97,.60],[.07,.93],[.5,.96],[.93,.9],[.25,.30],[.68,.28],[.35,.80]]){
    const px=tp[0]*w, py=tp[1]*h;
    x.strokeRect(px-2,py,4,14);
    x.beginPath(); x.arc(px,py-6,10,0,7); x.stroke();
  }
  PKBG=c;
}
const ENEMYIMG={};
for(const k in ENEMYFRAMES) ENEMYIMG[k] = ENEMYFRAMES[k].map(u=>{ const i=new Image(); i.src=u; return i; });
const APEIMG={};
for(const k in APEFRAMES) APEIMG[k] = APEFRAMES[k].map(u=>{ const i=new Image(); i.src=u; return i; });
function startPark(plus){
  // level and mood affect performance the same "base * (low + span*stat/100)" way the RUNNER
  // minigame's computeForm() already does: a higher-level dog is slightly faster, and a
  // happy/well-cared-for one gets a real but modest edge over a neglected one
  const lvlMul=1+clamp(S.lvl,0,50)/50*0.12;    // lvl 1 -> ~1.00x, lvl 50+ -> 1.12x, capped
  const moodMul=0.90+0.20*S.mood/100;          // mood 0 -> 0.90x, mood 100 -> 1.10x
  Object.assign(PK,{
    active:true,t:0,wave:1,waveT:0,spawnT:1,
    waveQuota:pkWaveQuota(1), waveSpawned:0, waveKills:0, lastDowned:null, waveOutro:null,
    goldenDone:false, goldenAt:3+Math.random()*8, goldenWarned:false, goldenBanner:null, goldenSkipNext:false,
    convertOpen:false, barkedTypes:{}, missionBarkAll:false, missionSurviveW1:false, compass:false,
    maxhp:Math.round(100+100*S.mood/100),
    spd:95*(0.75+0.5*S.energy/100)*(S.senior?0.85:1)*lvlMul*moodMul,
    barkMax:Math.max(1.2,3-0.06*S.lvl), barkCd:1, pulse:0,
    barkR:21*(0.8+0.4*S.hunger/100), knock:150*(0.85+0.3*S.mood/100),
    bones:0, kills:0, xpFromRun:0, sideDone:0, relic:null, waveBanner:null, shopFlash:null, apeKills:0, apeWaveT:0, idleT:0,
    worldMult:4, groves:1, groveCenters:[], woodsDir:null, woodsOff:0, leaves:[], barkBigLvl:0, barkFastLvl:0, agiLvl:0, speedBonus:null, shopSel:null,
    chain:0, chainT:0, inv:0, fx:[],
    x:0,y:0,vx:0,vy:0, joy:null,
    en:[], fr:[], gate:{}, gateArm:true, gateAsk:false, started:false, shop:null, biscuits:[], drops:[], pendingBury:0, nuts:[],
    powerups:[], zoomT:0, over:0, regenT:0, regenAcc:0, hurtT:0, hpSeen:0, zoom:1, zoomFromBark:0, zoomFromPark:0, sniffLvl:0, w2Stage:0,
    trees:[], scorch:[], embers:[], treeGrid:null, treeGridDirty:true,
    plusMode:!!plus, mixTypes:null, mixLabel:null, swoopT:0,
    pals:[], palEyes:false, friendsOpen:false, friendsArm:false, npc:{x:.5,y:.5},
    sword:null, swordCine:null, swordSite:null, swordDone:false, swordNagT:0,
    hell:false, hellT:0, hellSpreadT:0, hellHurtT:0,
    armor:0, armorUnlocked:false, armorFeedCount:0,
    exitNagT:0, exitNagFlashT:0
  });
  PK.hp=PK.maxhp;
  PK.healerT=pkHealerGap();
  PK.acts=[{k:"hoop",x:.15,y:.125,cd:0},{k:"tunnel",x:.35,y:.36,cd:0},{k:"ramp",x:.11,y:.39,cd:0},{k:"tunnel",x:.62,y:.70,cd:0},{k:"hoop",x:.85,y:.20,cd:0}];
  PK.waveBanner={text:"WAVE 1", sub:pkWaveName(1), life:3.2, max:3.2};
  SPARKS.length=0; HITFX.length=0;
  S.outTimer=0;
  tickTodo("d_park");
  hidePortrait(); closeStatus();
  showScreen("park");
  $("#camstate").textContent = plus ? "DOGPARK+" : "DOGPARK";
  toast("SURVIVE. COLLECT BONES, BANK XP AT THE RED EXIT.");
  beep(660,.08); setTimeout(()=>beep(880,.08),120);
}
function pkGain(n,x,y){
  PK.chain = PK.chainT>0 ? Math.min(3,PK.chain+1) : 1;   // capped lower — chain bonus was inflating bones well past shop costs
  PK.chainT=3;
  const g=Math.round(n+(PK.chain-1));
  PK.bones+=g;
  PK.fx.push({x,y,txt:"+"+g,life:0.9});
}
function pkSpawn(w,h){
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  if(Math.random()<0.05){
    const side=Math.random()<0.5?-1:1;
    PK.fr.push({x:(PK.x+side*w*0.65+WW)%WW, y:(PK.y+(Math.random()-0.5)*h*0.8+WH)%WH, vx:-side*42, life:16});
    return;
  }
  const r=Math.random(), wv=PK.wave;
  const type = r<Math.max(0.2,0.55-wv*0.04)?"sq" : r<0.8?"bird":"cat";
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  const hp0=pkEnemyHp(type==="cat"?2:1);
  pkEnMake({t:type, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
    hp:hp0, hpMax:hp0,
    sp:(type==="sq"?70:type==="bird"?85:45)*(1+wv*0.05),
    ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
}
// the friend with the bandana — she trots across the park and fully heals BONES on contact.
// she used to be folded into pkSpawn() at 5%, but every wave now routes through its own bespoke
// spawner and pkSpawn is never called, so she'd stopped turning up at all. She gets her own clock
// instead, and it winds tighter every wave past 3, when a run starts actually hurting.
function pkHealerGap(){
  const base = PK.wave<=3 ? 30 : Math.max(9, 30-(PK.wave-3)*3.5);
  return base*(0.8+Math.random()*0.4);
}
function pkSpawnHealer(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const side=Math.random()<0.5?-1:1;
  PK.fr.push({x:(PK.x+side*w*0.65+WW)%WW, y:(PK.y+(Math.random()-0.5)*h*0.8+WH)%WH, vx:-side*42, life:16});
  beep(720,.05);
}
// a golden bird carrying a gold bone — one per stage, optional, never counts toward the wave
// quota. flies a fast, straight line across the world; catch it (like the friend NPC) for a
// big bones payout, or miss it and it just disappears.
function pkSpawnGoldenBird(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const side=Math.random()<0.5?-1:1;
  // always a little slower than BONES' own top speed — however fast a given build actually is —
  // so a player already moving toward it can always, eventually, close the gap
  const sp=PK.spd*(0.75+Math.random()*0.25);
  PK.fr.push({golden:true, x:(PK.x+side*w*0.7+WW)%WW, y:(PK.y+(Math.random()-0.5)*h*0.6+WH)%WH,
    vx:-side*sp, life:15});
  toast("A GOLDEN BIRD FLIES BY — CATCH IT!",1);
  beep(900,.05); setTimeout(()=>beep(1200,.06),70);
}
// WAVE 2 \u2014 BIRD BACKUP: a quick opening pass of birds crossing the screen in lines, then
// the real event: a single huge storm fills the sky at once (see pkSpawnBirdStorm) rather than
// trickling in three at a time. 1-hit kill like every other bird. If it'd fly clean off the
// engagement area, it rubber-bands its heading back toward the fray instead of leaving, so the
// flock keeps looping through until every last one is knocked down.
function pkSpawnFlock(){
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  PK.w2Stage=(PK.w2Stage||0)+1;
  if(PK.w2Stage===1) return pkSpawnBirdRow(Math.min(3*pkPlusMult(),remaining));
  if(PK.w2Stage===2) return pkSpawnBirdStorm(Math.min(Math.round(18*pkPlusMult()),remaining));
  return pkSpawnBirdV(remaining);   // whatever's left dives in as the V \u2014 always finishes the wave
}
function pkSpawnBirdRow(n){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const diagonals=[Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75];
  const ang=diagonals[Math.floor(Math.random()*4)], perp=ang+Math.PI/2;
  const R=Math.max(w,h)*0.85;
  const cx=PK.x-Math.cos(ang)*R, cy=PK.y-Math.sin(ang)*R;   // upstream of the flight path
  const sp=90+Math.random()*20;
  for(let i=0;i<n;i++){
    const off=(i-(n-1)/2)*15+(Math.random()-0.5)*8;         // a row, one after another
    const sxo=cx+Math.cos(perp)*off, syo=cy+Math.sin(perp)*off;
    pkEnMake({t:"bird", flock:true, x:(sxo+WW)%WW, y:(syo+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
      ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  if(Math.random()<STALK_CHANCE) pkSpawnStalkCat(PK.x+(Math.random()-0.5)*80, PK.y+(Math.random()-0.5)*80, 1+Math.floor(Math.random()*2));
  toast(n+" BIRDS INBOUND \u2014 BACKUP ARRIVES!",1);
  beep(520,.09,"square",.05); setTimeout(()=>beep(680,.09,"square",.05),90);
  return n;
}
// no more flat red-glowing aggro ring — instead a loose, chaotic swirl overhead (mostly ambient,
// no threat while swirling) with one or two birds at a time peeling off to actually swoop and
// dive at BONES. A miss or a survived hit sends the diver back up to rejoin the swirl for
// another pass later, so the whole flock cycles through real attacks instead of just circling.
const STORM_SWIRL_MAX_ACTIVE=3;   // bumped for the bigger swarm — still telegraphed, just a bit busier
// how far a circling/diving storm bird's presence reaches into the grove, and how hard that
// makes the nearest trees flutter — purely visual, cinematic weight for the swarm overhead
const STORM_TREE_R=140, STORM_SWAY_MULT=5;
// the beat between a bird locking onto BONES and the real, fast dive actually launching — this
// is the player's whole reaction window, telegraphed on-screen by the same red windup dot every
// other windup attack in the park already flashes
const STORM_SWOOP_WINDUP=0.55;
function pkSpawnBirdStorm(n){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const R=Math.max(w,h)*0.42, baseAng=Math.random()*6.283;
  for(let i=0;i<n;i++){
    const a=baseAng+(6.283*i/n)+(Math.random()-0.5)*0.5;
    const r=R*(0.7+Math.random()*0.55);
    const x=(PK.x+Math.cos(a)*r+WW)%WW, y=(PK.y+Math.sin(a)*r+WH)%WH;
    pkEnMake({t:"bird", stormForm:true, diving:false, swoopWindT:0, x, y, orbitAng:a, orbitR:r, orbitSpd:1.4+Math.random()*0.8,
      swoopCd:1.2+Math.random()*2.6, hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:150, vx:0, vy:0,
      ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  toast("A STORM OF BIRDS \u2014 THEY'RE CIRCLING OVERHEAD",1);
  beep(260,.12,"sawtooth",.04); setTimeout(()=>beep(220,.12,"sawtooth",.04),120);
  return n;
}
// the flying V: a real assault, homing straight at BONES instead of flying a fixed line
function pkSpawnBirdV(n){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const ang=Math.random()*6.283, perp=ang+Math.PI/2;
  const R=Math.max(w,h)*0.9;
  const cx=PK.x-Math.cos(ang)*R, cy=PK.y-Math.sin(ang)*R;
  const sp=150;
  for(let i=0;i<n;i++){
    const side=i%2===0?1:-1, rank=Math.ceil(i/2);
    const off=side*rank*22, back=rank*18;   // wingmen trail behind the leader — a real V shape
    const sxo=cx+Math.cos(perp)*off-Math.cos(ang)*back, syo=cy+Math.sin(perp)*off-Math.sin(ang)*back;
    pkEnMake({t:"bird", vForm:true, angry:true, x:(sxo+WW)%WW, y:(syo+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
      ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  toast("INCOMING \u2014 FLYING V!",1);
  beep(200,.14,"sawtooth",.06); setTimeout(()=>beep(160,.16,"sawtooth",.06),110);
  return n;
}
const LASER_WIDTH=13;
// tied to what's actually ON SCREEN, not the (often much bigger, once the park has expanded)
// world size — a squirrel used to be able to open fire from beyond the visible edge, so a hit
// landed with no beam ever having been seen. Capped a little inside the half-diagonal so a
// firing squirrel is never right on the edge of the frame either.
function pkLaserRange(){
  const cv=$("#dogcv");
  return Math.min(cv.clientWidth,cv.clientHeight)/(2*(PK.zoom||1))*0.82;
}
function pkPlusMult(){ return PK.plusMode ? 2 : 1; }   // DOGPARK+: same wave structure, double enemies on screen at once
/* ---------- trees: cover, collision, kindling, and squirrel nests ---------- */
// the BBBSSHHHZZZHHH — layered saw tones plus a noise-ish crackle tail
function pkBlastSfx(){
  beep(70,.55,"sawtooth",.10);
  beep(105,.5,"square",.05);
  for(let i=0;i<7;i++) setTimeout(()=>beep(600+Math.random()*1400,.05,"square",.022), i*55);
  setTimeout(()=>beep(52,.45,"sawtooth",.08),120);
}
function pkBuildTrees(){
  // only scatter (and only wipe) the ambient trees the very first time — a park-size purchase
  // used to call this again from scratch on every single upgrade, deleting and re-rolling every
  // tree on the map including the main grove, which silently dragged the friend dog's whole
  // grove to a brand new random spot (sometimes right on top of the player) every purchase.
  if(PK.groveCenters.length===0){
    PK.trees=[];
    const n=Math.round(6*(PK.worldMult/2)*(PK.worldMult/2));
    const npc=PK.npc||{x:.78,y:.18};
    for(let i=0;i<n;i++){
      // never plant one on top of the bandana dog: a trunk over him puts his shop behind collision
      let x,y,tries=0;
      do{ x=Math.random()*PK.WW; y=Math.random()*PK.WH; tries++; }
      while(tries<24 && Math.hypot(wd(x-npc.x*PK.WW,PK.WW),wd(y-npc.y*PK.WH,PK.WH))<72);
      PK.trees.push({ x, y, state:"ok", fireT:0, spawned:0, spawnT:0, sway:Math.random()*6.283 });
    }
  }
  pkBuildWoods(PK.groves||1);
  PK.treeGridDirty=true;
}
// A grove is a circular stand of trees dense enough to block a straight line through, with
// one path spiralling from a gap in the ring down to a clear centre — small enough on the map
// that it reads as a landmark to find, not a zone you have to cross. The main grove always
// holds the bandana dog at its exact centre, so walking the path in is the whole point of it.
// Trees here are the same objects as the ones scattered elsewhere — same shape, burning,
// collision, beam-blocking — just arranged densely instead of at random.
const GROVE_SPACING=16;              // grid step used to fill the ring — spread a bit further apart
                                      // so individual trunks read clearly instead of one solid blob
const GROVE_PATH_W=116;              // path corridor width — empirically checked against the real
                                      // trunk collision ellipse (TREE_COLL_RX/RY), not just eyeballed
const GROVE_SWEEP=2.4;                // radians of the ring the path winds through — a longer,
                                      // proper walk in rather than a quick step through a gap
const GROVE_COLLAPSE=0.55;           // fraction of the sweep over which the path dives from the
                                      // outer edge down near the centre
const GROVE_HALO_STEP=20;            // sampling step for the fading ring of loose outer trees — a
                                      // bit finer, for more trees scattered around the outside
function pkGroveOuterR(){ return Math.min(PK.WW,PK.WH)*0.155; }   // ~1 cell of a 4x4 park, majority stays open field
function pkBuildGrove(cx, cy, withNPC){
  const outerR=pkGroveOuterR(), innerR=outerR*0.35;
  const entryAngle=Math.random()*6.283;
  // the path's centreline, as actual points — checking true distance to this curve (rather than
  // approximating with "same radius at that angle") is what keeps the corridor genuinely walkable;
  // the cheaper radial approximation left the spiral clipping straight through trunk hitboxes
  const spiralR=t=>{ const tc=Math.min(1,t/GROVE_COLLAPSE); return outerR + (innerR*0.22-outerR)*tc; };
  const curve=[];
  for(let t=0;t<=1.001;t+=1/220){
    const ang=entryAngle+t*GROVE_SWEEP, r=spiralR(t);
    curve.push([cx+Math.cos(ang)*r, cy+Math.sin(ang)*r]);
  }
  const distToPath=(x,y)=>{
    let best=Infinity;
    for(const [px,py] of curve){ const d=Math.hypot(wd(x-px,PK.WW),wd(y-py,PK.WH)); if(d<best) best=d; }
    return best;
  };
  let planted=0;
  // the dense ring, plus a soft dappled fringe just past its outer edge
  for(let gy=-outerR; gy<=outerR; gy+=GROVE_SPACING){
    for(let gx=-outerR; gx<=outerR; gx+=GROVE_SPACING){
      const r=Math.hypot(gx,gy);
      if(r>outerR*1.06 || r<innerR*0.85) continue;
      const x=(cx+gx+(Math.random()-0.5)*6+PK.WW)%PK.WW;
      const y=(cy+gy+(Math.random()-0.5)*6+PK.WH)%PK.WH;
      if(distToPath(x,y) < GROVE_PATH_W/2) continue;      // keep the corridor genuinely clear
      const inner=(innerR-r)/(innerR*0.15);                // soft transition into the clearing
      if(inner>0 && Math.random()<clamp(inner,0,1)) continue;
      const outer=(r-outerR)/(outerR*0.06);                // and a ragged, not ruler-straight, outside edge
      if(outer>0 && Math.random()<0.35+outer*0.5) continue;
      if(PK.gate && PK.gate.x!=null && Math.hypot(wd(x-PK.gate.x,PK.WW),wd(y-PK.gate.y,PK.WH))<70) continue;
      PK.trees.push({ x, y, state:"ok", fireT:0, spawned:0, spawnT:0, sway:Math.random()*6.283, wood:true });
      planted++;
    }
  }
  // a loose, fading scatter just beyond the ring, thinning out with distance — the wood
  // announcing itself before you're actually in it, rather than starting on a hard line
  const fadeR=outerR*2.7;   // a longer, more natural taper back out to open field
  for(let gy=-fadeR; gy<=fadeR; gy+=GROVE_HALO_STEP){
    for(let gx=-fadeR; gx<=fadeR; gx+=GROVE_HALO_STEP){
      const r=Math.hypot(gx,gy);
      if(r<=outerR*1.08 || r>fadeR) continue;
      const p=Math.pow(1-(r-outerR)/(fadeR-outerR), 1.6)*0.58;
      if(Math.random()>p) continue;
      const x=(cx+gx+(Math.random()-0.5)*GROVE_HALO_STEP+PK.WW)%PK.WW;
      const y=(cy+gy+(Math.random()-0.5)*GROVE_HALO_STEP+PK.WH)%PK.WH;
      if(distToPath(x,y) < GROVE_PATH_W*0.7) continue;    // a stray halo tree could otherwise
                                                           // block the doorway before the ring even starts
      if(PK.gate && PK.gate.x!=null && Math.hypot(wd(x-PK.gate.x,PK.WW),wd(y-PK.gate.y,PK.WH))<70) continue;
      PK.trees.push({ x, y, state:"ok", fireT:0, spawned:0, spawnT:0, sway:Math.random()*6.283 });
    }
  }
  if(withNPC) PK.npc={x:cx/PK.WW, y:cy/PK.WH};
  PK.groveCenters.push({x:cx,y:cy,r:outerR,entryAngle});
  PK.treeGridDirty=true;
  return planted;
}
// the main grove always sits straight up or down from where BONES starts, so you always know
// which way to head to find it; further groves (from expanding the park) land in whichever
// quarter is still empty, so they never stack on top of each other or the first one
function pkBuildWoods(n){
  // the main grove (and the friend dog at its centre) must only ever be placed once — buying a
  // park-size upgrade used to wipe groveCenters and re-roll it from scratch every single time,
  // relocating the whole grove (and the player's mental map of where it is) on every purchase.
  // Now expansion only ever adds new groves for newly-unlocked slots; anything already built stays put.
  if(PK.groveCenters.length===0){
    const dir=Math.random()<0.5?1:-1, off=Math.min(PK.WH*0.30, pkGroveOuterR()*2.6);
    PK.woodsDir=dir; PK.woodsOff=off;
    pkBuildGrove(PK.WW*0.5, PK.WH*0.5+dir*off, true);
  }
  const dir=PK.woodsDir||1, off=PK.woodsOff||0;
  const extraSlots=[[0.5,0.5-dir*off*2.1/PK.WH], [0.18,0.22],[0.82,0.78],[0.18,0.78],[0.82,0.22]];
  for(let i=PK.groveCenters.length;i<n;i++){
    const s=extraSlots[i]||[0.15+Math.random()*0.7,0.15+Math.random()*0.7];
    pkBuildGrove(PK.WW*s[0], PK.WH*s[1], false);
  }
}
const TREE_CLUSTER_R=42;   // how close a neighbour has to be to count as "packed in together"
function pkTreeClusterCount(tr){
  let n=0;
  for(const o of PK.trees){
    if(o===tr || o.state==="ash" || o.knockT>0) continue;
    if(Math.hypot(wd(o.x-tr.x,PK.WW),wd(o.y-tr.y,PK.WH))<TREE_CLUSTER_R) n++;
  }
  return n;
}
/* A grove is 900+ trees, and several hot paths used to walk every one of them every frame
   (trunk collision, the mad squirrels' beam blocker, fire spread). At a couple of dozen
   squirrels sweeping beams at once that is tens of thousands of distance checks a frame, which
   is exactly where the onslaught started dropping frames. Trees never move, so they are indexed
   into a coarse uniform grid once and looked up by neighbourhood instead. */
const TREE_GRID=80;
function pkBuildTreeGrid(){
  const cols=Math.max(1,Math.ceil(PK.WW/TREE_GRID)), rows=Math.max(1,Math.ceil(PK.WH/TREE_GRID));
  const buckets=new Array(cols*rows).fill(null);
  for(const tr of PK.trees){
    const cx=((Math.floor(tr.x/TREE_GRID)%cols)+cols)%cols;
    const cy=((Math.floor(tr.y/TREE_GRID)%rows)+rows)%rows;
    const k=cy*cols+cx;
    (buckets[k]||(buckets[k]=[])).push(tr);
  }
  PK.treeGrid={cols,rows,buckets};
  PK.treeGridDirty=false;
}
// visit every tree within roughly `r` of (x,y). Allocation-free, and it never touches the
// hundreds of trees on the far side of the park.
function pkTreesNear(x,y,r,cb){
  const g=PK.treeGrid;
  if(!g){ for(let i=0;i<PK.trees.length;i++) cb(PK.trees[i]); return; }
  const span=Math.ceil(r/TREE_GRID);
  if(span*2+1>=Math.min(g.cols,g.rows)){ for(let i=0;i<PK.trees.length;i++) cb(PK.trees[i]); return; }
  const cx=Math.floor(x/TREE_GRID), cy=Math.floor(y/TREE_GRID);
  for(let j=-span;j<=span;j++) for(let i=-span;i<=span;i++){
    const gx=((cx+i)%g.cols+g.cols)%g.cols, gy=((cy+j)%g.rows+g.rows)%g.rows;
    const b=g.buckets[gy*g.cols+gx];
    if(b) for(let k=0;k<b.length;k++) cb(b[k]);
  }
}
// one hard ceiling on trees alight at once, everywhere — beam strikes, spread and hell alike.
// This is the main brake on the squirrel onslaught, since every burning tree is a squirrel tap.
const FIRE_CAP=5;
const FIRE_SPREAD_R=155;        // how far a catching tree can throw embers
const FIRE_GEN_FALLOFF=0.45;    // and how much less willing each ring out from the strike is to catch
const FIRE_SPREAD_EVERY=2.0;    // a burning tree keeps trying to pass it on for as long as it burns
function pkFireCount(){ let n=0; for(const t of PK.trees) if(t.state==="fire") n++; return n; }
function pkIgniteTree(tr, quiet, gen){
  if(!tr || tr.state!=="ok") return false;
  if(pkFireCount()>=FIRE_CAP) return false;
  tr.state="fire"; tr.fireT=0; tr.spawnT=0.25;
  tr.fireGen=gen||0;
  // solo tree, cornered and panicking: the full 12. Packed shoulder-to-shoulder in the ring,
  // there's nowhere for that many to have been living — down to as few as 3.
  tr.spawnMax=clamp(12-pkTreeClusterCount(tr)*1.2, 3, 12);
  // it keeps trying to pass the fire on for as long as it burns — attempts that land while the
  // cap is full simply fail, so the blaze rolls forward into slots as older trees burn out
  tr.spreadAt=1.1+Math.random()*1.8;
  if(!quiet){
    toast("THE TREE'S ALIGHT — THEY'RE POURING OUT!",1);
    beep(90,.45,"sawtooth",.09); setTimeout(()=>beep(140,.35,"sawtooth",.07),110);
  }
  // this tree is somebody's home — a small chance something much bigger evacuates while it's
  // still burning (not after: a stump is useless to it). Wave 8 has its own dedicated, far more
  // frequent ape assault, so this rare roll sits out that wave.
  if(PK.wave!==APE_WAVE && pkApeCount()<APE_CAP && Math.random()<0.05){
    tr.quakeT=APE_TELL_TIME; tr.quakeMax=APE_TELL_TIME;
  }
  return true;
}
/* Fire jumps to nearby trees, but every ring out from the original strike is markedly less
   willing to catch than the one before it (FIRE_GEN_FALLOFF). Left alone, a fire therefore runs
   out of reach and dies on its own after a few hops instead of eating the entire grove — and
   with FIRE_CAP holding the concurrent count at 5 it can never flood the field with squirrels. */
function pkSpreadFireFrom(tr){
  const room=FIRE_CAP-pkFireCount();
  if(room<=0) return;
  const gen=(tr.fireGen||0)+1;
  const chance=0.55*Math.pow(FIRE_GEN_FALLOFF,gen-1);
  const budget=Math.min(1+Math.floor(Math.random()*3), room);
  const near=[];
  pkTreesNear(tr.x,tr.y,FIRE_SPREAD_R,o=>{
    if(o===tr || o.state!=="ok") return;
    const d=Math.hypot(wd(o.x-tr.x,PK.WW),wd(o.y-tr.y,PK.WH));
    if(d<FIRE_SPREAD_R) near.push({o,d});
  });
  near.sort((a,b)=>a.d-b.d);
  let lit=0;
  for(const c of near){
    if(lit>=budget) break;
    // further away is also less likely, so it creeps outward rather than teleporting
    if(Math.random()<chance*(1-0.55*c.d/FIRE_SPREAD_R) && pkIgniteTree(c.o,true,gen)) lit++;
  }
  if(lit>0){
    toast("FIRE'S SPREADING THROUGH THE GROVE!",1);
    beep(85,.4,"sawtooth",.08); setTimeout(()=>beep(60,.5,"sawtooth",.07),130);
  }
}
/* ---------- enemy object pool ----------
   At horde density enemies are created and discarded constantly. Two things matter here, and the
   second matters more than the first: recycling avoids the allocation churn, and resetting every
   enemy through one canonical field list means every object in PK.en shares a single hidden
   class. That keeps property access in the hot per-enemy loop monomorphic, and it makes it
   impossible for a stale per-type flag (a recycled bird still believing it is a mad squirrel) to
   survive into the next life. */
const EN_FIELDS=["t","x","y","hp","hpMax","sp","vx","vy","kx","ky","dir","fi","ft","ph","life","side","alpha","big","boss","small","decor","angry","hellish","hunting","circling","flock","vForm","stormForm","diving","swoop","swoopCd","swoopWindT","orbitAng","orbitR","orbitSpd","roost","standing","spooked","spookT","spookVx","spookVy","stalk","stalkAggro","anchorX","anchorY","leapT","windT","leapAng","lvx","lvy","ranger","madsq","fromTree","atkState","atkCd","strafeDir","laserState","chargeT","aimAng","aimBase","aimErr","sweepT","beamLen","cd","burnT","palBeamT","madsqExplode","explodeT","heading","spdCur","introT","leapState","leapCd","leapWindT","leapActT","leapDur","leapStartX","leapStartY","leapDX","leapDY","landT","fleeing","fleeT","fleeVx","fleeVy","shockT","hitT","bounceT","bounceMax","bounceSpin","heroOutro"];
const EN_BLANK={};
for(const f of EN_FIELDS) EN_BLANK[f]=undefined;
const EN_POOL=[], EN_POOL_MAX=420;
function pkEnMake(props){
  let e=EN_POOL.pop();
  if(e) Object.assign(e,EN_BLANK); else e=Object.assign({},EN_BLANK);
  Object.assign(e,props);
  PK.en.push(e);
  return e;
}
function pkEnRelease(e){ if(EN_POOL.length<EN_POOL_MAX){ e.fleeing=true; EN_POOL.push(e); } }
// removes by index and hands the object back to the pool
function pkEnRemove(i){ const e=PK.en[i]; PK.en.splice(i,1); pkEnRelease(e); }
function pkSpawnApeRaw(x,y,hpBase){
  let hp=pkEnemyHp(hpBase);
  // anything born after the gates opened comes out already changed
  const hellish=!!PK.hell;
  if(hellish) hp=Math.round(hp*1.15);
  pkEnMake({t:"ape", boss:true, x, y, hp, hpMax:hp, sp:APE_SPD, hellish,
    ph:0, kx:0, ky:0, dir:1, fi:0, ft:0, side:undefined,
    heading:Math.random()*6.283, spdCur:0,
    introT:APE_INTRO, leapState:null, leapCd:1, leapWindT:0, leapActT:0, landT:0});
}
function pkSpawnApe(x,y){
  pkSpawnApeRaw(x,y,APE_HP);
  toast("A HUGE APE CRASHES OUT OF THE FLAMES!",1);
  beep(55,.6,"sawtooth",.12); setTimeout(()=>beep(42,.55,"sawtooth",.1),150);
}
// WAVE 8 — a couple crash down out of two random trees at once, weaker than the rare fire boss
// (this is a swarm objective, not a lone miniboss), capped so the assault doesn't spiral away
function pkSpawnApeCouple(){
  if(!PK.trees.length) return;
  let n=0;
  for(let k=0;k<2 && pkApeCount()<APE_WAVE_CAP;k++){
    const tr=PK.trees[Math.floor(Math.random()*PK.trees.length)];
    pkSpawnApeRaw(tr.x, tr.y, APE_WAVE_HP);
    n++;
  }
  if(n>0){
    toast("APES ARE DROPPING FROM THE TREES!",1);
    beep(58,.5,"sawtooth",.1,{prio:2}); setTimeout(()=>beep(58,.5,"sawtooth",.1),120);
  }
}
// first non-ash tree a beam runs into: it soaks the shot (cover) and catches light
function pkBeamBlocker(ox,oy,ang,range){
  const ux=Math.cos(ang), uy=Math.sin(ang);
  let best=null, bestD=range;
  // only the trees in a box around the beam itself can possibly block it — this is the single
  // biggest saving during a mad-squirrel swarm, where every squirrel used to scan all 900+
  pkTreesNear(ox+ux*range*0.5, oy+uy*range*0.5, range*0.5+TREE_R, tr=>{
    if(tr.state==="ash" || tr.knockT>0) return;
    const dx=wd(tr.x-ox,PK.WW), dy=wd(tr.y-oy,PK.WH);
    const along=dx*ux+dy*uy;
    if(along<=0 || along>=bestD) return;
    if(Math.abs(dx*uy-dy*ux)>TREE_R) return;
    best=tr; bestD=along;
  });
  return {tree:best, dist:bestD};
}
// keeps BONES out of a trunk — slides him around it rather than stopping him dead
const PK_COLL_SCRATCH=[];
function pkTreeCollide(px,py){
  // only the handful of trunks he could actually be standing in
  PK_COLL_SCRATCH.length=0;
  pkTreesNear(px,py,TREE_COLL_RX+TREE_GRID,tr=>PK_COLL_SCRATCH.push(tr));
  for(const tr of PK_COLL_SCRATCH){
    if(tr.state==="ash" || tr.knockT>0) continue;
    const dx=wd(px-tr.x,PK.WW), dy=wd(py-tr.y,PK.WH);
    // elliptical footprint, squashed like every other ground shadow here, and wide enough to
    // account for BONES' own 40px body so he can't stand inside the trunk
    const nx=dx/TREE_COLL_RX, ny=dy/TREE_COLL_RY, nd=Math.hypot(nx,ny);
    if(nd<1 && nd>0.001){
      px=(tr.x+(nx/nd)*TREE_COLL_RX+PK.WW)%PK.WW;
      py=(tr.y+(ny/nd)*TREE_COLL_RY+PK.WH)%PK.WH;
    }
  }
  return [px,py];
}
function pkTickTrees(dt){
  // wave 2's circling/diving storm reaches into the grove: any tree near a swirling or diving
  // bird flutters hard, cycling through its sway-phase sprites fast enough to read as the
  // swarm's wind whipping the canopy — cheap since it's the same discrete sprite cache, just
  // stepped through quicker, and it only bothers looking for storm birds when any exist
  if(PK.treeGridDirty) pkBuildTreeGrid();
  const stormBirds = PK.en.length ? PK.en.filter(e=>e.stormForm) : [];
  /* Only trees anyone can actually see need their sway and storm-flutter advanced, and only
     trees that are burning, quaking or airborne need anything else. Everything else in a 900-tree
     grove is inert scenery, so it is skipped outright — the single cheapest way to keep a heavy
     grove off the frame budget without changing how any of it looks. */
  const _cv=$("#dogcv");
  const viewRX=(_cv.clientWidth*0.5)/(PK.zoom||1)+90, viewRY=(_cv.clientHeight*0.5)/(PK.zoom||1)+110;
  for(let ti=PK.trees.length-1;ti>=0;ti--){
    const tr=PK.trees[ti];
    const busy = tr.state==="fire" || tr.knockT>0 || tr.quakeT>0;
    const onScreen = Math.abs(wd(tr.x-PK.x,PK.WW))<viewRX && Math.abs(wd(tr.y-PK.y,PK.WH))<viewRY;
    if(!busy && !onScreen) continue;
    // smashed by an ape's landing: flying outward, tumbling, and gone the instant it lands —
    // ticks regardless of state, so this has to run ahead of the fire-only continue below
    if(tr.knockT>0){
      tr.knockT-=dt;
      tr.knockRot=(tr.knockRot||0)+tr.knockRotV*dt;
      if(tr.knockT<=0){
        // it's destroyed — a burst of splinters and a thud where it finally comes down
        const lx=tr.knockX0+tr.knockDX, ly=tr.knockY0+tr.knockDY;
        for(let i=0;i<10;i++){
          const a=Math.random()*6.283, sp=40+Math.random()*70;
          PK.embers.push({x:lx, y:ly, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-30, life:0.35+Math.random()*0.25, dust:true});
        }
        beep(85,.22,"square",.08);
        PK.trees.splice(ti,1); PK.treeGridDirty=true;
        continue;
      }
    }
    let stormBoost=0;
    if(onScreen){
      for(const b of stormBirds){
        const dx=wd(tr.x-b.x,PK.WW), dy=wd(tr.y-b.y,PK.WH), d=Math.hypot(dx,dy);
        if(d<STORM_TREE_R){
          const p=1-d/STORM_TREE_R;
          stormBoost=Math.max(stormBoost, b.diving?p*1.6:p);   // a bird actually diving overhead rattles it harder than one lazily circling
        }
      }
      tr.sway+=dt*(tr.state==="fire"?5:1.1)*(1+stormBoost*STORM_SWAY_MULT);
    }
    if(stormBoost>0.3 && tr.state==="ok" && PK.leaves.length<40 && Math.random()<stormBoost*dt*5){
      // cinematic flourish: close enough to the swarm that leaves are actually getting kicked loose
      const a=Math.random()*6.283, r=Math.random()*TREE_R*1.3;
      PK.leaves.push({x:tr.x+Math.cos(a)*r, y:tr.y-30+Math.sin(a)*r*0.6,
        vy:16+Math.random()*16, t:Math.random()*6, ph:Math.random()*6.283, life:1.1+Math.random()*0.8});
    }
    // a tree that rolled the rare ape spawn trembles and glows on top of its own flames for a
    // beat before the ape actually bursts out — it has to still be burning when this happens
    // (a stump is useless to it), so the roll and the whole tell run entirely inside "fire" state,
    // well before TREE_BURN_TIME would ever turn it to ash
    if(tr.quakeT>0){
      tr.quakeT-=dt;
      const qp=1-clamp(tr.quakeT/tr.quakeMax,0,1);
      if(Math.random()<0.3+qp*0.5){   // dust and bark kicked loose, picking up as it nears the reveal
        const a=Math.random()*6.283, r=TREE_R*(0.6+Math.random()*0.6);
        PK.embers.push({x:tr.x+Math.cos(a)*r, y:tr.y+Math.sin(a)*r*0.5,
          vx:(Math.random()-0.5)*30, vy:-15-Math.random()*45*qp, life:0.45+Math.random()*0.3, dust:true});
      }
      if(tr.quakeT<=0){
        // the reveal: a bright burst of sparks and a shockwave ring, then the ape itself is there
        PK.scorch.push({x:tr.x, y:tr.y, r:TREE_R*2.2});
        for(let i=0;i<16;i++){
          const a=Math.random()*6.283, sp=60+Math.random()*90;
          SPARKS.push({x:tr.x, y:tr.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-40, life:0.4+Math.random()*0.3, gold:true});
        }
        PK.shake=Math.max(PK.shake||0,0.5);
        beep(150,.3,"sawtooth"); setTimeout(()=>beep(90,.35,"sawtooth",.08),90);
        // steps out beside its burning home rather than standing exactly inside it, so both
        // are visible — and faces back at it during the intro instead of at whatever direction
        // it happens to spawn in
        const ea=Math.random()*6.283, er=TREE_R*1.8;
        const ex=(tr.x+Math.cos(ea)*er+PK.WW)%PK.WW, ey=(tr.y+Math.sin(ea)*er+PK.WH)%PK.WH;
        pkSpawnApe(ex,ey);
        const ape=PK.en[PK.en.length-1];
        if(ape && ape.t==="ape") ape.dir = Math.cos(ea)>0 ? -1 : 1;
      }
    }
    if(tr.state!=="fire") continue;
    tr.fireT+=dt;
    tr.spawnT-=dt;
    if(tr.fireT>=tr.spreadAt){ tr.spreadAt=tr.fireT+FIRE_SPREAD_EVERY*(0.75+Math.random()*0.6); pkSpreadFireFrom(tr); }
    // a burning nest keeps disgorging squirrels — but never past a live ceiling, so the onslaught
    // stays an onslaught without ever becoming a framerate problem. It resumes the moment the
    // player thins them out, so nothing is lost, it just cannot run away.
    if(tr.spawnT<=0 && tr.spawned<(tr.spawnMax||TREE_SPAWN_MAX) && pkTreeSqCount()<TREE_SQ_CAP
       && pkAliveCount()<pkMaxAlive()){   // the density ceiling is the ceiling, fire included
      tr.spawnT=TREE_SPAWN_EVERY;
      tr.spawned++;
      const a=Math.random()*6.283;
      pkEnMake({t:"sq", madsq:true, fromTree:true,
        x:(tr.x+Math.cos(a)*TREE_R+PK.WW)%PK.WW, y:(tr.y+Math.sin(a)*TREE_R+PK.WH)%PK.WH,
        hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:78, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
        laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.8+Math.random()*1.2});
      beep(320+Math.random()*160,.04,"square",.02,{prio:0});
    }
    // once hell is loose the fire is fed from below, so a burning tree throws off thick smoke
    // and brimstone the whole time and never actually burns itself out
    if(PK.hell){
      if(Math.random()<0.55){
        PK.embers.push({x:tr.x+(Math.random()-0.5)*TREE_R*1.4, y:tr.y-26+(Math.random()-0.5)*14,
          vx:(Math.random()-0.5)*18, vy:-30-Math.random()*40, life:0.7+Math.random()*0.7,
          dust:Math.random()<0.55});
      }
    }
    if(tr.fireT>=TREE_BURN_TIME){
      tr.state="ash";
      PK.scorch.push({x:tr.x, y:tr.y, r:TREE_R*1.6});
      beep(70,.5,"sawtooth",.05);
    }
  }
}
// ===== WAVE REDESIGN v2 =====
const STANDING_SPOOK_R=58, SPOOK_SPEED=100, SPOOK_LIFE=3.2;   // wave 1: how close before a roost startles, and how it scatters
const STALK_CHANCE=0.20;                                      // waves 1-2: chance a bird-flock spawn also drops stalking cats
const STALK_CAT_SOFTCAP=6, STALK_AGGRO_R=65, STALK_ORBIT_R=48, STALK_ORBIT_SPEED=0.9, STALK_LEAP_SPEED=215, STALK_LEAP_TIME=0.5, STALK_CHASE_SPD=62, STALK_WIND=0.45;
const NUT_SPEED=145;                                          // wave 4/mix: thrown-nut projectile speed
const RANGER_PLANT_R=200, RANGER_APPROACH_SPD=55, RANGER_WINDUP=0.55, RANGER_THROW_CD=1.5;   // wave 4: nut-throwing squirrels
// wave 5: rotating-beam squirrels. The sweep is deliberately slow — this beam is meant to be
// read and outrun, not twitch-dodged — and only a couple ever fire at once.
const MADSQ_CHARGE=1.5, MADSQ_SWEEP_TIME=3.0, MADSQ_SWEEP_ARC=0.9, MADSQ_SWEEP_RATE=0.95;
const MADSQ_WIDTH=18, MADSQ_DMG=14, MADSQ_KNOCK=150, MADSQ_FF_DMG=1;
// they are tiny animals holding a weapon far too big for them: the shot goes where they were
// pointing when they pulled it, not where you are now, and it shoves them backwards
const MADSQ_AIM_ERR=0.42, MADSQ_TRACK_RATE=0.42, MADSQ_RECOIL=95;
// the aim stops following you partway through the wind-up and visibly freezes, so the shot
// goes where you were, not where you are. That frozen beat is the window to get clear.
const MADSQ_LOCK=0.55;
function pkMadsqCap(){ return 2; }   // fixed — at most 2 beams live at once, whatever size the park is
// bone pickup: a small sniff radius that hoovers up nearby drops, upgradeable in the shop.
// All three (and the powerup pickup radius below) were cut 25% — bones were getting picked up
// too easily without ever having to actually walk over them.
const PICKUP_BASE=12, SNIFF_BASE=25.5, SNIFF_STEP=19.5, SNIFF_PULL=190, SNIFF_LVL_CAP=3;
const POWERUP_PICKUP_R=13.5;   // was 18 — the regen/magnet powerup pickup radius, same 25% cut
// trees: cover from beams, solid to walk through, flammable, and full of squirrels
const TREE_COLL_RX=26, TREE_COLL_RY=15;
// Enemies do not path-find so much as flow: each nearby trunk pushes them off it and nudges
// them around one side, which is enough to make a packed wood produce lots of different
// routes to the same dog without any search running every frame.
const TREE_AVOID_R=44;
function pkSteer(e,x,y,dx,dy){
  let ax=dx, ay=dy, near=0;
  for(const tr of PK.trees){
    if(tr.state==="ash" || tr.knockT>0) continue;
    const tdx=wd(x-tr.x,PK.WW), tdy=wd(y-tr.y,PK.WH);
    const d=Math.hypot(tdx,tdy);
    if(d>TREE_AVOID_R || d<0.01) continue;
    if(tdx*dx+tdy*dy > 0) continue;              // already past it — don't get dragged back
    near++;
    const f=(1-d/TREE_AVOID_R);
    ax += tdx/d*f*2.2; ay += tdy/d*f*2.2;        // straight off the trunk
    // ...plus a consistent way round, so they commit instead of jittering head-on
    if(e.side===undefined) e.side = (dx*tdy-dy*tdx) >= 0 ? 1 : -1;
    ax += -tdy/d*f*1.7*e.side; ay += tdx/d*f*1.7*e.side;
  }
  if(!near){ e.side=undefined; return [dx,dy]; }
  const l=Math.hypot(ax,ay)||1;
  return [ax/l, ay/l];
}
const TREE_R=15, TREE_BURN_TIME=10, TREE_SPAWN_MAX=12, TREE_SPAWN_EVERY=0.65;
// how many tree-born squirrels may be on the field at once. The trees keep their appetite; they
// simply queue behind this instead of all emptying at the same moment.
const TREE_SQ_CAP=30;
function pkTreeSqCount(){ let n=0; for(const e of PK.en) if(e.fromTree && !e.fleeing) n++; return n; }
// how a tree caught in an ape's landing gets launched: flung outward, tumbling, gone for good
// once it lands — a destructible payoff for a slam that connects near any cover
const TREE_KNOCK_TIME=0.6, TREE_KNOCK_DIST=95, TREE_KNOCK_ARC=55;
const ALPHA_LEAP_R=170, ALPHA_LEAP_SPEED=280, ALPHA_LEAP_TIME=0.45, ALPHA_LEAP_CD=4, ALPHA_LEAP_DMG=20, ALPHA_APPROACH_SPD=50; // wave 6
// FIRE BOSS — a rare, brutally tough ape a burnt-out tree can cough up. Runs the player down,
// then commits to a long-range leap: a fixed landing point it telegraphs with a ground shadow
// and danger ring that crawl toward the target while the ape itself arcs high overhead, giving
// a real dodge window before it crashes down for a wide area hit. Never blocks the wave
// (pkSideHazard) since it's an optional bonus threat, not a requirement — except during the
// dedicated wave-8 ape assault (see APE_WAVE below).
// APE_SPD is its top chase speed, not an instant speed — see APE_ACCEL/APE_TURN_RATE below,
// which give the chase a heavy, momentum-driven feel instead of gluing to the player
const APE_CAP=1, APE_HP=44, APE_SPD=190,
      APE_LEAP_MINR=70, APE_LEAP_MAXR=520, APE_LEAP_SPEED=340, APE_LEAP_TMIN=0.7, APE_LEAP_TMAX=1.9, APE_ARC_H=78,
      APE_WINDUP=0.65, APE_LEAP_CD=6.5, APE_TOUCH_DMG=12, APE_SLAM_DMG=32, APE_SLAM_R=62, APE_LAND_TIME=0.35, APE_INTRO=0.9;
// heavy-chaser tuning: it accelerates/decelerates toward its top speed rather than snapping to
// it, and turns at a limited rate rather than snapping to face the target — so overrunning a
// player who suddenly changes direction and having to wheel back around is a real, visible
// thing that happens, not just a chase that always glues on perfectly
const APE_ACCEL=260, APE_TURN_RATE=2.4, APE_AIM_LAG=0.4;
// the run frames' bounding-gait art doesn't reach as far down its own canvas as the idle/jump
// frames do, so drawn at the same anchor it visibly floats above its own shadow while ambling —
// this nudges the run pose down to actually meet the ground line it's supposed to stand on
const APE_RUN_GROUND_FIX=7;
const APE_TELL_TIME=1.8;   // how long the stump trembles/glows before the ape actually bursts out
function pkApeCount(){ let n=0; for(const e of PK.en) if(e.t==="ape" && !e.fleeing) n++; return n; }
// WAVE 8 — apes start dropping out of the trees themselves, in couples, far more often than
// the rare fire-triggered spawn; clearing this wave means downing APE_WAVE_QUOTA of them while
// the ordinary mixed enemies for this stage keep spawning and attacking in the background
const APE_WAVE=8, APE_WAVE_QUOTA=10, APE_WAVE_CAP=6, APE_WAVE_HP=18;

/* ===================== THE GODS' SWORD (DOGPARK+ only) =====================
   Wave 2 of a DOGPARK+ run stops dead and a sword is thrown down out of the sky, spinning, to
   bury itself in a clearing. 250 bones takes it; from then on it rides horizontally in BONES'
   mouth and cuts whatever he runs into. The hole it leaves behind never closes — it widens every
   wave, and by wave 6 the fire coming out of it has taken the whole park.                     */
const SWORD_COST=250, SWORD_UP_COST=100, SWORD_MAX_TIER=5, SWORD_WAVE=2;
// tuned against the fire boss ape (APE_HP=44): tier 1 needs 7 connects, tier 5 needs 3
const SWORD_DMG_T   = [7, 9, 11, 13, 15];
const SWORD_SCALE_T = [1, 1.15, 1.3, 1.45, 1.6];
const SWORD_CUT_CD=0.3;      // no meter on screen, but it physically cannot cut faster than this
const SWORD_BLADE=44;        // blade length at tier 1, in world px — long and slim
// he carries it the way a dog actually carries a sword: jaws closed around the grip, pommel
// poking out one side, the whole blade jutting straight out the other. GRIP_MID is where the
// middle of the grip sits in the shape's own coordinates, so his teeth can be put exactly there.
const SWORD_GRIP_MID=-8.6;
const SWORD_MOUTH_X=15, SWORD_MOUTH_Y=3;   // mouth offset from his centre — jaw height, below the head
const SWORD_TAKE_R=34;       // walk this close to the planted blade to claim it
function pkSwordTier(){ return PK.sword && PK.sword.state==="held" ? PK.sword.tier : 0; }
function pkSwordScale(){ return SWORD_SCALE_T[clamp(pkSwordTier()-1,0,SWORD_MAX_TIER-1)]||1; }
function pkSwordDmg(){ return SWORD_DMG_T[clamp(pkSwordTier()-1,0,SWORD_MAX_TIER-1)]||0; }
// somewhere BONES can actually see it land, and genuinely clear of trunks so it isn't swallowed
// by a canopy the moment it sticks
function pkSwordSite(){
  for(let tries=0;tries<160;tries++){
    const a=Math.random()*6.283, r=95+Math.random()*55;
    const x=(PK.x+Math.cos(a)*r+PK.WW)%PK.WW, y=(PK.y+Math.sin(a)*r+PK.WH)%PK.WH;
    if(pkInGrove(x,y)) continue;
    let clear=true;
    for(const tr of PK.trees){
      if(Math.hypot(wd(tr.x-x,PK.WW),wd(tr.y-y,PK.WH))<64){ clear=false; break; }
    }
    if(!clear) continue;
    if(PK.gate && PK.gate.x!=null && Math.hypot(wd(x-PK.gate.x,PK.WW),wd(y-PK.gate.y,PK.WH))<80) continue;
    return {x,y};
  }
  return {x:(PK.x+120)%PK.WW, y:PK.y};
}
function pkSwordDrop(){
  const site=pkSwordSite();
  PK.sword={state:"falling", x:site.x, y:site.y, spin:0, tier:0, boltT:3+Math.random()*4, cutCd:0, gleamT:0, growT:0};
  PK.swordCine={ph:"fall", t:0};
  toast("THE SKY SPLITS OPEN…",1);
  beep(70,.9,"sawtooth",.1); setTimeout(()=>beep(52,1.0,"sawtooth",.09),160);
}
// the cutscene owns the whole world while it runs: parkUpdate hands it the frame and returns, so
// nothing spawns, moves or attacks until the sword is in the ground (or in his mouth)
const SW_FALL=1.7, SW_IMPACT=0.18, SW_SETTLE=1.5;
const SW_PLUCK=0.55, SW_FLOAT=0.75, SW_GLEAM=0.7;
// how far above the landing point it starts. Tied to the actual view height rather than a fixed
// number of pixels, so the whole descent stays on screen instead of spending most of it above it.
function pkSwordFallH(){ const cv=$("#dogcv"); return Math.max(240, (cv?cv.clientHeight:400)*0.92); }
function pkSwordCineUpdate(dt){
  const c=PK.swordCine, s=PK.sword;
  c.t+=dt;
  // particles still breathe during the cutscene — the debris is most of the spectacle
  for(let i=SPARKS.length-1;i>=0;i--){ const p=SPARKS[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=140*dt; p.life-=dt; if(p.life<=0) SPARKS.splice(i,1); }
  for(let i=PK.embers.length-1;i>=0;i--){ const em=PK.embers[i]; em.x+=em.vx*dt; em.y+=em.vy*dt; em.vy+=90*dt; em.life-=dt; if(em.life<=0) PK.embers.splice(i,1); }
  if(PK.shake>0) PK.shake=Math.max(0,PK.shake-dt);
  if(c.ph==="fall"){
    s.spin+=dt*22;                      // end over end, faster the closer it gets
    if(Math.random()<0.55){              // a shedding trail of divine sparks behind it
      const p=clamp(c.t/SW_FALL,0,1), ease=p*p;
      SPARKS.push({x:s.x+(Math.random()-0.5)*26, y:s.y-pkSwordFallH()*(1-ease)+(Math.random()-0.5)*40,
        vx:(Math.random()-0.5)*40, vy:-30-Math.random()*40, life:0.4+Math.random()*0.3, gold:true});
    }
    if(c.t>=SW_FALL){
      c.ph="impact"; c.t=0;
      PK.shake=1.1;
      PK.scorch.push({x:s.x, y:s.y, r:34});
      for(let i=0;i<46;i++){       // dirt and stone thrown out of the crater
        const a=Math.random()*6.283, sp=70+Math.random()*180;
        PK.embers.push({x:s.x, y:s.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp*0.5-80-Math.random()*70,
          life:0.5+Math.random()*0.5, dust:true});
      }
      for(let i=0;i<34;i++){       // and the light of the thing itself
        const a=Math.random()*6.283, sp=90+Math.random()*200;
        SPARKS.push({x:s.x, y:s.y-6, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-70, life:0.5+Math.random()*0.45, gold:true});
      }
      beep(48,.75,"sawtooth",.14,{prio:2}); setTimeout(()=>beep(120,.5,"square",.09),40);
      setTimeout(()=>beep(1500,.5,"sine",.05),90);
    }
  } else if(c.ph==="impact"){
    if(c.t>=SW_IMPACT){ c.ph="settle"; c.t=0; }
  } else if(c.ph==="settle"){
    if(Math.random()<0.4){        // it keeps giving off light where it stands
      const a=Math.random()*6.283;
      SPARKS.push({x:s.x+Math.cos(a)*16, y:s.y-8+Math.sin(a)*8, vx:0, vy:-22-Math.random()*24,
        life:0.5+Math.random()*0.4, gold:true});
    }
    if(c.t>=SW_SETTLE){
      PK.swordCine=null; s.state="planted"; s.spin=0;
      toast("A BLADE FROM THE GODS — " + SWORD_COST + " BONES TO TAKE IT",1);
      beep(880,.12,"sine",.06); setTimeout(()=>beep(1320,.16,"sine",.05),110);
    }
  } else if(c.ph==="pluck"){
    if(c.t>=SW_PLUCK){
      c.ph="float"; c.t=0;
      beep(660,.1,"sine",.05);
    }
  } else if(c.ph==="float"){
    if(c.t>=SW_FLOAT){
      c.ph="gleam"; c.t=0;
      beep(1600,.5,"sine",.05);
    }
  } else if(c.ph==="gleam"){
    if(Math.random()<0.5){
      SPARKS.push({x:PK.x+(Math.random()-0.5)*30, y:PK.y-10+(Math.random()-0.5)*16,
        vx:(Math.random()-0.5)*30, vy:-20-Math.random()*25, life:0.4+Math.random()*0.3, gold:true});
    }
    if(c.t>=SW_GLEAM){
      // the ground it came out of stays open, and starts keeping its own count of the waves
      PK.swordCine=null;
      PK.swordSite={x:PK.sword.x, y:PK.sword.y, wave:PK.wave, r:9};
      PK.sword={state:"held", tier:1, cutCd:0, gleamT:0, growT:0, x:0, y:0, spin:0};
      PK.swordDone=true;
      toast("THE BLADE IS HIS — RUN THEM DOWN",1);
      beep(700,.1,"square",.04,{prio:2}); setTimeout(()=>beep(1050,.14,"square",.04,{prio:2}),90);
    }
  }
}
// standing in the ground waiting to be claimed: it glows, it bobs, and now and then the sky
// remembers where it came from and hits it
function pkSwordPlantedUpdate(dt){
  const s=PK.sword;
  s.boltT-=dt;
  if(s.boltT<=0){
    s.boltT=4.5+Math.random()*5.5;
    s.flashT=0.42;
    PK.shake=Math.max(PK.shake||0,0.5);
    for(let i=0;i<26;i++){
      const a=Math.random()*6.283, sp=60+Math.random()*170;
      SPARKS.push({x:s.x, y:s.y-10, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-60, life:0.35+Math.random()*0.4, gold:true});
    }
    for(let i=0;i<10;i++){
      const a=Math.random()*6.283, sp=40+Math.random()*80;
      PK.embers.push({x:s.x, y:s.y, vx:Math.cos(a)*sp, vy:-40-Math.random()*50, life:0.4+Math.random()*0.3, dust:true});
    }
    beep(58,.5,"sawtooth",.1,{prio:2}); setTimeout(()=>beep(150,.35,"square",.06),50);
  }
  if(s.flashT>0) s.flashT=Math.max(0,s.flashT-dt);
  PK.swordNagT=Math.max(0,(PK.swordNagT||0)-dt);
  const d=Math.hypot(wd(PK.x-s.x,PK.WW),wd(PK.y-s.y,PK.WH));
  if(d<SWORD_TAKE_R){
    if(PK.bones>=SWORD_COST){
      PK.bones-=SWORD_COST;
      PK.swordCine={ph:"pluck", t:0};
      for(let i=0;i<24;i++){    // the ground gives it up
        const a=Math.random()*6.283, sp=40+Math.random()*110;
        PK.embers.push({x:s.x, y:s.y, vx:Math.cos(a)*sp, vy:-50-Math.random()*70, life:0.45+Math.random()*0.35, dust:true});
      }
      beep(300,.16,"square",.07); setTimeout(()=>beep(520,.14,"square",.06),90);
    } else if(PK.swordNagT<=0){
      PK.swordNagT=2.6;
      toast("NEED "+SWORD_COST+" BONES FOR THE BLADE — YOU HAVE "+PK.bones,1);
      beep(150,.1);
    }
  }
}
// it cuts by being run into things. One swing catches everything the blade is currently lying
// across, so wading into a pack is properly rewarded, and then it simply cannot fire again for
// SWORD_CUT_CD — there is no meter for it, it just physically won't.
function pkSwordHeldUpdate(dt){
  const s=PK.sword;
  s.cutCd=Math.max(0,s.cutCd-dt);
  s.gleamT=Math.max(0,s.gleamT-dt);
  s.growT=Math.max(0,s.growT-dt);
  if(s.cutCd>0) return;
  const face=PK.vx<0?-1:1;
  const sc=pkSwordScale();
  // the cutting edge is the blade only, which starts just past the crossguard — a little ahead
  // of his teeth, since the grip itself is what he's holding
  const my=PK.y+SWORD_MOUTH_Y;
  const guardX=PK.x+face*(SWORD_MOUTH_X-SWORD_GRIP_MID*sc);
  const mx=guardX+face*2*sc;
  const tipx=guardX+face*SWORD_BLADE*sc;
  let cut=0;
  for(const e of PK.en){
    if(e.fleeing) continue;
    const ex=PK.x+wd(e.x-PK.x,PK.WW), ey=PK.y+wd(e.y-PK.y,PK.WH);
    // distance from the enemy to the blade segment, which lies flat along x from mx to tipx
    const lo=Math.min(mx,tipx), hi=Math.max(mx,tipx);
    const cx=clamp(ex,lo,hi);
    const d=Math.hypot(ex-cx, ey-my);
    if(d < 7*sc + pkHitR(e)){
      const ux=face, uy=0;
      pkPalHit(e, pkSwordDmg(), ux, uy);
      e.hitT=0.3;
      for(let i=0;i<7;i++){
        SPARKS.push({x:e.x, y:e.y-6, vx:face*(40+Math.random()*120), vy:(Math.random()-0.5)*140, life:0.28+Math.random()*0.2});
      }
      cut++;
    }
  }
  if(cut>0){
    s.cutCd=SWORD_CUT_CD;
    s.gleamT=0.22;
    PK.shake=Math.max(PK.shake||0,cut>1?0.22:0.12);
    beep(1250,.05,"square",.045,{prio:0}); setTimeout(()=>beep(760,.06,"sawtooth",.035,{prio:0}),35);
  }
}
function pkSwordUpgrade(){
  const s=PK.sword;
  if(!s || s.state!=="held" || s.tier>=SWORD_MAX_TIER) return;
  s.tier++;
  s.growT=0.5;         // the sudden growth spurt — see the overshoot in pkDrawHeldSword
  s.gleamT=0.6;
  PK.shake=Math.max(PK.shake||0,0.3);
  for(let i=0;i<26;i++){
    const a=Math.random()*6.283, sp=50+Math.random()*130;
    SPARKS.push({x:PK.x+10, y:PK.y-6, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-40, life:0.4+Math.random()*0.35, gold:true});
  }
  beep(420,.1,"square",.06);
  setTimeout(()=>beep(640,.1,"square",.055),80);
  setTimeout(()=>beep(950,.16,"square",.05),160);
  toast("THE BLADE GROWS — TIER "+s.tier+"/"+SWORD_MAX_TIER+", "+pkSwordDmg()+" DMG",1);
}
/* ---------- drawing ---------- */
// drawn pointing along +X with the origin at the middle of the crossguard, so the same shape
// serves the spinning drop, the planted blade and the one in his mouth
function pkDrawSwordShape(ctx,s,gleamP){
  const bl=SWORD_BLADE*s, bw=2.7*s;              // long and slim, not a slab
  ctx.lineJoin="miter";
  // ---- blade: parallel edges most of the way, then a long tapering point
  ctx.fillStyle="#c2ccd6";
  ctx.beginPath();
  ctx.moveTo(2*s,-bw); ctx.lineTo(bl-11*s,-bw); ctx.lineTo(bl,0); ctx.lineTo(bl-11*s,bw); ctx.lineTo(2*s,bw);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle="#f4f8fc";                       // lit upper bevel
  ctx.beginPath();
  ctx.moveTo(2*s,-bw); ctx.lineTo(bl-11*s,-bw); ctx.lineTo(bl-3*s,-bw*0.12); ctx.lineTo(2*s,-bw*0.12);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#7d8892"; ctx.lineWidth=Math.max(0.6,0.8*s);   // the fuller
  ctx.beginPath(); ctx.moveTo(5*s,0); ctx.lineTo(bl-12*s,0); ctx.stroke();
  ctx.strokeStyle="#4a535c"; ctx.lineWidth=Math.max(0.7,0.9*s);
  ctx.beginPath();
  ctx.moveTo(2*s,-bw); ctx.lineTo(bl-11*s,-bw); ctx.lineTo(bl,0); ctx.lineTo(bl-11*s,bw); ctx.lineTo(2*s,bw);
  ctx.closePath(); ctx.stroke();
  // ---- crossguard: a slim swept bar, no medallion at this size
  const gh=6.4*s;
  ctx.fillStyle="#d9a441";
  ctx.beginPath();
  ctx.moveTo(-1.6*s,-gh); ctx.lineTo(2.4*s,-gh*0.72); ctx.lineTo(2.4*s,gh*0.72); ctx.lineTo(-1.6*s,gh);
  ctx.lineTo(-3.2*s,gh*0.8); ctx.lineTo(-3.2*s,-gh*0.8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#8a6420"; ctx.lineWidth=Math.max(0.5,0.7*s); ctx.stroke();
  // ---- grip: what his teeth are actually closed around
  ctx.fillStyle="#1b2338";
  ctx.fillRect(-14*s,-1.9*s,10.8*s,3.8*s);
  ctx.strokeStyle="#c8973a"; ctx.lineWidth=Math.max(0.5,0.6*s);
  for(let i=0;i<3;i++){
    const gx=-13.2*s+i*3.4*s;
    ctx.beginPath(); ctx.moveTo(gx,-1.9*s); ctx.lineTo(gx+3*s,1.9*s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx+3*s,-1.9*s); ctx.lineTo(gx,1.9*s); ctx.stroke();
  }
  ctx.fillStyle="#d9a441";
  ctx.fillRect(-3.6*s,-2.6*s,1.5*s,5.2*s);       // ferrule against the guard
  // ---- pommel
  ctx.fillStyle="#d9a441";
  ctx.beginPath();
  ctx.moveTo(-14.2*s,0); ctx.lineTo(-16.6*s,-3*s); ctx.lineTo(-19.4*s,0); ctx.lineTo(-16.6*s,3*s);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#8a6420"; ctx.lineWidth=Math.max(0.5,0.7*s); ctx.stroke();
  // ---- the gleam: a hard white band running out along the blade to the tip
  if(gleamP!=null && gleamP>=0 && gleamP<=1){
    const gx=2*s+(bl-2*s)*gleamP;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(2*s,-bw); ctx.lineTo(bl-11*s,-bw); ctx.lineTo(bl,0); ctx.lineTo(bl-11*s,bw); ctx.lineTo(2*s,bw);
    ctx.closePath(); ctx.clip();
    const grd=ctx.createLinearGradient(gx-10*s,0,gx+10*s,0);
    grd.addColorStop(0,"rgba(255,255,255,0)");
    grd.addColorStop(0.5,"rgba(255,255,255,0.95)");
    grd.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=grd;
    ctx.fillRect(gx-10*s,-bw*1.4,20*s,bw*2.8);
    ctx.restore();
  }
}
// the falling / planted / being-plucked sword, drawn in world space. Screen coords come in
// already projected so this never has to know about the camera.
function pkDrawWorldSword(ctx,sx,sy,t){
  const s=PK.sword; if(!s) return;
  const c=PK.swordCine;
  const ph=c?c.ph:null;
  if(ph==="fall"){
    const p=clamp(c.t/SW_FALL,0,1), ease=p*p;      // accelerating out of the sky
    const y=sy-pkSwordFallH()*(1-ease);
    // the shaft of light it is riding down, and the ring on the ground marking where it lands
    ctx.save();
    const grd=ctx.createLinearGradient(sx,y-200,sx,sy+20);
    grd.addColorStop(0,"rgba(255,246,200,0)");
    grd.addColorStop(0.45,"rgba(255,240,170,"+(0.18+0.24*p).toFixed(3)+")");
    grd.addColorStop(1,"rgba(255,228,120,0)");
    ctx.fillStyle=grd;
    ctx.beginPath(); ctx.moveTo(sx-18,y-200); ctx.lineTo(sx+18,y-200); ctx.lineTo(sx+64*p+26,sy+16); ctx.lineTo(sx-64*p-26,sy+16); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=0.35+0.45*p;
    ctx.strokeStyle="#ffe98a"; ctx.lineWidth=2+2*p;
    ctx.beginPath(); ctx.ellipse(sx,sy,30+26*p,(30+26*p)*0.42,0,0,7); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(sx,y); ctx.rotate(s.spin);
    ctx.save(); ctx.globalAlpha=0.55; ctx.shadowColor="#ffe98a"; ctx.shadowBlur=22;
    pkDrawSwordShape(ctx,1.15,null); ctx.restore();
    pkDrawSwordShape(ctx,1.15,null);
    ctx.restore();
    return;
  }
  // impact / settle / planted / pluck all show it upright, blade buried
  let y=sy, s2=1.15, alpha=1;
  if(ph==="impact"){ y=sy+2; }
  else if(ph==="pluck"){
    const p=clamp(c.t/SW_PLUCK,0,1);
    y=sy-26*p*p;                                   // eases up and out of the dirt
  } else if(ph==="float"||ph==="gleam"){
    return;                                        // it is on its way to / already in his mouth
  } else {
    y=sy-2-Math.sin(t*2.2)*2.5;                    // idle bob
  }
  // the light it keeps giving off while it waits
  ctx.save();
  const pul=0.55+0.45*Math.sin(t*3);
  const R=54+10*pul;
  const g2=ctx.createRadialGradient(sx,y-8,0,sx,y-8,R);
  g2.addColorStop(0,"rgba(255,244,190,"+(0.26*pul+0.12).toFixed(3)+")");
  g2.addColorStop(0.5,"rgba(255,214,110,"+(0.10*pul).toFixed(3)+")");
  g2.addColorStop(1,"rgba(255,200,80,0)");
  ctx.fillStyle=g2;
  ctx.beginPath(); ctx.ellipse(sx,y-8,R,R*0.72,0,0,7); ctx.fill();
  ctx.restore();
  if(s.flashT>0){                                  // a bolt has just come down on it
    const f=s.flashT/0.42;
    ctx.save(); ctx.globalAlpha=f;
    ctx.strokeStyle="#fff"; ctx.lineWidth=3.5;
    ctx.beginPath();
    let bx=sx, by=y-46;
    ctx.moveTo(bx,-40);
    for(let i=0;i<7;i++){ bx=sx+(Math.random()-0.5)*26; by=-40+(y-46+40)*(i+1)/7; ctx.lineTo(bx,by); }
    ctx.lineTo(sx,y-40); ctx.stroke();
    ctx.globalAlpha=f*0.5; ctx.strokeStyle="#bfe4ff"; ctx.lineWidth=8;
    ctx.stroke();
    ctx.globalAlpha=f*0.35; ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(sx,y-14,40,0,7); ctx.fill();
    ctx.restore();
  }
  // buried: rotated so the blade points straight down, and clipped at the dirt line so it really
  // ends in the ground instead of lying across it
  const groundY=y+5;
  ctx.save();
  ctx.beginPath(); ctx.rect(sx-60, y-120, 120, (groundY)-(y-120)); ctx.clip();
  ctx.translate(sx,y-26); ctx.rotate(Math.PI/2);
  pkDrawSwordShape(ctx,s2,null);
  ctx.restore();
  // dirt thrown up around where it went in
  ctx.fillStyle="#2e2519";
  ctx.beginPath(); ctx.ellipse(sx,groundY+1,16,5.5,0,0,7); ctx.fill();
  ctx.fillStyle="#4a3c26";
  ctx.beginPath(); ctx.ellipse(sx,groundY-1,10,3,0,0,7); ctx.fill();
  if(!ph){
    ctx.save();
    ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    const afford=PK.bones>=SWORD_COST;
    ctx.fillStyle=afford?"#ffe98a":"#e08a8a";
    ctx.globalAlpha=0.75+0.25*Math.sin(t*4);
    ctx.fillText(SWORD_COST+" BONES", sx, y-84);
    ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#cfd6dd"; ctx.globalAlpha=0.7;
    ctx.fillText(afford?"WALK UP TO TAKE IT":"NOT ENOUGH YET", sx, y-74);
    ctx.restore(); ctx.textAlign="left";
  }
}
// in his mouth: flat, pointing the way he faces, with the growth-spurt overshoot on upgrade
function pkDrawHeldSword(ctx,DX,DY,t){
  const s=PK.sword; if(!s || s.state!=="held") return;
  const face=PK.vx<0?-1:1;
  let sc=pkSwordScale();
  if(s.growT>0){   // a hard elastic pop outward, settling back to the new size — kept modest so
                   // the growth spurt reads without the blade swallowing BONES himself
    const p=1-s.growT/0.5;
    sc*=1+Math.sin(p*Math.PI)*0.32*(1-p*0.35);
  }
  ctx.save();
  ctx.translate(DX+face*SWORD_MOUTH_X, DY+SWORD_MOUTH_Y);
  if(face<0) ctx.scale(-1,1);
  ctx.translate(-SWORD_GRIP_MID*sc, 0);   // put the middle of the grip in his teeth
  if(s.growT>0){
    ctx.save(); ctx.globalAlpha=(s.growT/0.5)*0.8;
    ctx.shadowColor="#fff"; ctx.shadowBlur=26;
    pkDrawSwordShape(ctx,sc,null);
    ctx.restore();
  }
  const gleamP = s.gleamT>0 ? 1-clamp(s.gleamT/(s.growT>0?0.6:0.22),0,1) : null;
  pkDrawSwordShape(ctx,sc,gleamP);
  ctx.restore();
}
// the cutscene's mid-air sword, on its way from the ground into his mouth
function pkDrawFloatingSword(ctx,SC,DX,DY,t){
  const c=PK.swordCine, s=PK.sword;
  if(!c || !s || (c.ph!=="float" && c.ph!=="gleam")) return;
  const [gx,gy]=SC(s.x,s.y);
  // it comes to rest exactly where the held sword lives, so the handover is seamless
  const sc=1.15;
  const restX=DX+SWORD_MOUTH_X-SWORD_GRIP_MID*sc, restY=DY+SWORD_MOUTH_Y;
  if(c.ph==="float"){
    const p=clamp(c.t/SW_FLOAT,0,1), e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    const x=gx+(restX-gx)*e, y=(gy-30)+(restY-(gy-30))*e;
    ctx.save(); ctx.translate(x,y); ctx.rotate((1-e)*(Math.PI/2)+Math.sin(p*6.283)*0.12);
    ctx.save(); ctx.globalAlpha=0.6; ctx.shadowColor="#fff"; ctx.shadowBlur=20;
    pkDrawSwordShape(ctx,sc,null); ctx.restore();
    pkDrawSwordShape(ctx,sc,null);
    ctx.restore();
  } else {
    const p=clamp(c.t/SW_GLEAM,0,1);
    ctx.save(); ctx.translate(restX,restY);
    ctx.save(); ctx.globalAlpha=0.5*(1-p); ctx.shadowColor="#fff"; ctx.shadowBlur=24;
    pkDrawSwordShape(ctx,sc,null); ctx.restore();
    pkDrawSwordShape(ctx,sc,p);
    ctx.restore();
  }
}
/* ===================== THE HOLE, AND WHAT COMES OUT OF IT =====================
   The crater the sword left widens a step every wave. From wave 6 the fire in it stops being
   scenery: it spreads into the grove, keeps the trees permanently alight, and burns BONES if he
   stands in it. Nothing ever puts it out again.                                               */
const HELL_WAVE=6, HELL_SPREAD_EVERY=1.6, HELL_HURT_EVERY=0.55, HELL_HURT=5;
function pkSiteR(){
  if(!PK.swordSite) return 0;
  // ~9px across when he pulls it out on wave 2, up to a hole twice his own 40px width by wave 5
  return clamp(9+(PK.wave-PK.swordSite.wave)*10.5, 9, 44);
}
function pkHellOpen(){
  if(PK.hell) return;
  PK.hell=true; PK.hellT=0; PK.hellSpreadT=0;
  PK.shake=Math.max(PK.shake||0,1.0);
  for(let i=0;i<60;i++){
    const a=Math.random()*6.283, sp=50+Math.random()*190;
    PK.embers.push({x:PK.swordSite.x, y:PK.swordSite.y, vx:Math.cos(a)*sp, vy:-60-Math.random()*140, life:0.7+Math.random()*0.7});
  }
  toast("THE HOLE IS OPEN — HELL IS IN THE PARK",1);
  beep(40,1.2,"sawtooth",.13,{prio:2});
  setTimeout(()=>beep(60,1.0,"sawtooth",.11),200);
  setTimeout(()=>pkFanfare(null,true,"☠ THE GATES OF HELL HAVE OPENED"),320);
}
function pkHellUpdate(dt){
  if(!PK.hell) return;
  PK.hellT+=dt;
  const site=PK.swordSite;
  // it breathes fire out of the hole constantly
  if(Math.random()<0.9){
    const a=Math.random()*6.283, r=Math.random()*pkSiteR();
    PK.embers.push({x:site.x+Math.cos(a)*r, y:site.y+Math.sin(a)*r*0.5,
      vx:(Math.random()-0.5)*30, vy:-45-Math.random()*70, life:0.6+Math.random()*0.6});
  }
  // and reaches steadily further out into the park, taking the trees as it goes and relighting
  // anything that has already burnt down to a stump — this never stops
  PK.hellSpreadT-=dt;
  if(PK.hellSpreadT<=0){
    PK.hellSpreadT=HELL_SPREAD_EVERY;
    const reach=120+PK.hellT*26;
    const near=PK.trees.filter(tr=>tr.state!=="fire" &&
      Math.hypot(wd(tr.x-site.x,PK.WW),wd(tr.y-site.y,PK.WH))<reach);
    near.sort(()=>Math.random()-0.5);
    for(const tr of near.slice(0,3)){
      if(tr.state==="ash"){ tr.state="ok"; tr.spawned=tr.spawnMax||0; }   // it comes back up burning
      pkIgniteTree(tr,true);
    }
  }
  // standing in the fire costs him: the hole itself, and any tree currently alight
  PK.hellHurtT-=dt;
  if(PK.hellHurtT<=0){
    PK.hellHurtT=HELL_HURT_EVERY;
    let burning=false;
    if(Math.hypot(wd(PK.x-site.x,PK.WW),wd(PK.y-site.y,PK.WH))<pkSiteR()+14) burning=true;
    if(!burning){
      for(const tr of PK.trees){
        if(tr.state!=="fire") continue;
        if(Math.hypot(wd(tr.x-PK.x,PK.WW),wd(tr.y-PK.y,PK.WH))<TREE_R*1.7){ burning=true; break; }
      }
    }
    if(burning && !pkInvuln()){
      pkHurt(HELL_HURT);
      PK.hurtT=HURT_TIME;
      for(let i=0;i<6;i++){
        SPARKS.push({x:PK.x+(Math.random()-0.5)*18, y:PK.y-8, vx:(Math.random()-0.5)*50, vy:-40-Math.random()*40, life:0.3});
      }
      beep(95,.16,"sawtooth",.06);
      if(PK.hp<=0){ pkDeath(); return; }
    }
  }
  // everything with an ape in it turns
  for(const e of PK.en) if(e.t==="ape" && !e.hellish) pkHellifyApe(e);
}
function pkHellifyApe(e){
  e.hellish=true;
  e.hp=Math.round(e.hp*1.15); e.hpMax=Math.round(e.hpMax*1.15);
  for(let i=0;i<18;i++){
    const a=Math.random()*6.283, sp=40+Math.random()*120;
    PK.embers.push({x:e.x, y:e.y-8, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-50, life:0.5+Math.random()*0.4});
  }
  beep(70,.35,"sawtooth",.08);
}
// the crater itself, under everything else that stands on the ground
function pkDrawSwordSite(ctx,SC,w,h,t){
  if(!PK.swordSite) return;
  const [x,y]=SC(PK.swordSite.x,PK.swordSite.y);
  const R=pkSiteR();
  if(x<-R*4||x>w+R*4||y<-R*4||y>h+R*4) return;
  const pul=0.6+0.4*Math.sin(t*(PK.hell?6:2.4));
  ctx.save();
  // the hole
  ctx.fillStyle="#070503";
  ctx.beginPath(); ctx.ellipse(x,y,R,R*0.55,0,0,7); ctx.fill();
  // molten rim
  const g=ctx.createRadialGradient(x,y,R*0.2,x,y,R*(PK.hell?2.6:1.7));
  const heat=PK.hell?0.55:0.3;
  g.addColorStop(0,   "rgba(255,190,70,"+(heat*pul).toFixed(3)+")");
  g.addColorStop(0.35,"rgba(240,90,20,"+(heat*0.65*pul).toFixed(3)+")");
  g.addColorStop(1,   "rgba(120,20,0,0)");
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(x,y,R*(PK.hell?2.6:1.7),R*(PK.hell?2.6:1.7)*0.55,0,0,7); ctx.fill();
  // cracks radiating out of it, growing with the hole
  ctx.strokeStyle="rgba(255,150,50,"+(0.5*pul+0.25).toFixed(3)+")";
  ctx.lineWidth=Math.max(1,R*0.055);
  for(let i=0;i<9;i++){
    const a=i*0.698+0.3;
    ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*R*0.9, y+Math.sin(a)*R*0.5);
    ctx.lineTo(x+Math.cos(a)*R*(1.6+(i%3)*0.35), y+Math.sin(a)*R*(1.6+(i%3)*0.35)*0.55);
    ctx.stroke();
  }
  ctx.restore();
}
// a burning park seen through heat and smoke: a red wash that pulses, soot creeping in at the
// corners, and brimstone drifting up the screen. Screen space, so it sits over everything.
function pkDrawHellOverlay(ctx,w,h,t){
  if(!PK.hell) return;
  const pul=0.5+0.5*Math.sin(t*1.7);
  ctx.save();
  const g=ctx.createRadialGradient(w/2,h*0.62,Math.min(w,h)*0.18,w/2,h*0.55,Math.max(w,h)*0.78);
  g.addColorStop(0,"rgba(255,90,20,0)");
  g.addColorStop(0.55,"rgba(190,40,10,"+(0.13+0.05*pul).toFixed(3)+")");
  g.addColorStop(1,"rgba(60,6,0,"+(0.44+0.08*pul).toFixed(3)+")");
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation="overlay";
  ctx.fillStyle="rgba(255,70,10,0.10)"; ctx.fillRect(0,0,w,h);
  ctx.restore();
  // brimstone: motes of ash and cinder rising the whole height of the view
  ctx.save();
  for(let i=0;i<26;i++){
    const seed=i*97.13;
    const x=((seed*7.3)%w + Math.sin(t*0.5+i)*16 + w)%w;
    const y=h-(((t*(22+ (i%5)*13) + seed) % (h+70)));
    const hot=i%3===0;
    ctx.globalAlpha=hot?0.55:0.3;
    ctx.fillStyle=hot?"#ff9b3c":"#3a2f2a";
    const sz=hot?2.5:3.5;
    ctx.fillRect(x,y,sz,sz);
  }
  ctx.restore();
}
// the send-off for the kill that ends a wave: the world darkens to a soft vignette, the words
// land, and it all lifts again as the shop comes in — so the cut never feels like a jump
function pkDrawWaveOutro(ctx,w,h,t){
  const o=PK.waveOutro; if(!o) return;
  const p=clamp(o.t/WAVE_OUTRO_DUR,0,1);
  // in fast, out gently: peaks around the middle of the beat
  const k = p<0.16 ? p/0.16 : p>0.72 ? Math.max(0,1-(p-0.72)/0.28) : 1;
  ctx.save();
  const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.14,w/2,h/2,Math.max(w,h)*0.72);
  g.addColorStop(0,"rgba(0,0,0,0)");
  g.addColorStop(1,"rgba(0,0,0,"+(0.62*k).toFixed(3)+")");
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  // a thin bar of light sweeping across on the beat, then the words
  ctx.globalAlpha=k;
  const txtY=h*0.30;
  ctx.strokeStyle="rgba(255,255,255,"+(0.5*k).toFixed(3)+")"; ctx.lineWidth=1.5;
  const barW=w*0.30*Math.min(1,p/0.3);
  ctx.beginPath(); ctx.moveTo(w/2-barW,txtY+10); ctx.lineTo(w/2+barW,txtY+10); ctx.stroke();
  const pop = p<0.2 ? 1+0.45*(1-p/0.2) : 1;
  ctx.fillStyle="#fff"; ctx.font=Math.round(12*pop)+"px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText("WAVE "+PK.wave+" CLEAR", w/2, txtY);
  ctx.font="7px 'Press Start 2P',monospace"; ctx.fillStyle="#cfd6dd"; ctx.globalAlpha=k*0.85;
  ctx.fillText(pkWaveDone()+" DOWN", w/2, txtY+26);
  ctx.restore(); ctx.textAlign="left";
}
// the cutscene's own letterbox and titles, so the drop and the taking both read as set pieces
function pkDrawSwordCineOverlay(ctx,w,h,t){
  const c=PK.swordCine; if(!c) return;
  const bar=h*0.075;
  ctx.save();
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,bar); ctx.fillRect(0,h-bar,w,bar);
  if(c.ph==="fall"){
    const p=clamp(c.t/SW_FALL,0,1);
    ctx.fillStyle="rgba(0,0,0,"+(0.34*p).toFixed(3)+")"; ctx.fillRect(0,bar,w,h-bar*2);
    ctx.globalAlpha=Math.min(1,p*2.2);
    ctx.fillStyle="#ffe98a"; ctx.font="10px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("THE GODS ARE THROWING SOMETHING DOWN", w/2, bar+h*0.10);
  } else if(c.ph==="impact"){
    ctx.fillStyle="rgba(255,255,255,"+(0.75*(1-c.t/SW_IMPACT)).toFixed(3)+")";
    ctx.fillRect(0,0,w,h);
  } else if(c.ph==="settle"){
    const p=clamp(c.t/SW_SETTLE,0,1);
    ctx.globalAlpha=Math.min(1,p*3)*(p>0.8?(1-p)/0.2:1);
    ctx.fillStyle="#ffe98a"; ctx.font="11px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("A BLADE FOR THE DOG", w/2, bar+h*0.10);
  } else if(c.ph==="gleam"){
    const p=clamp(c.t/SW_GLEAM,0,1);
    ctx.globalAlpha=1-p;
    ctx.fillStyle="rgba(255,255,255,0.30)"; ctx.fillRect(0,0,w,h);
  }
  ctx.restore(); ctx.textAlign="left";
}
// WAVE 1 — CLEAR THE BIRDS: loose flocks of 3-7 birds clustered together, standing until
// BONES gets close, then the whole flock startles and scatters (still hittable mid-scatter,
// and settles back into a roost instead of despawning if it gets away clean). 1-hit kill.
// true if (x,y) is inside or near a grove's tree ring — same 1.15x pad the canopy shadow uses
function pkInGrove(x,y){
  for(const g of PK.groveCenters){
    const dx=wd(x-g.x,PK.WW), dy=wd(y-g.y,PK.WH);
    if(Math.hypot(dx,dy) < g.r*1.15) return true;
  }
  return false;
}
// several separate roosts scattered around in different directions, not just one — the park
// felt empty with a single flock, and a lone quota-capped bird in a huge map is a needle in a
// haystack. Every bird across every cluster shares one roost ticket: whichever one the player
// actually finds and downs first satisfies the whole thing (roost.killed>=need, checked in
// pkSideHazard), so there's no hidden "correct" cluster — any bird anywhere clears it
const BIRD_CLUSTERS=3, BIRD_ROOST_SIZE=12;
function pkSpawnBirdGroup(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const R=Math.max(w,h)*0.62;
  // never spawn more than the wave still needs — wave 1's quota of 1 must mean "1 bird",
  // not "a field full of them, of which the clear check will demand every last one"
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  const n=Math.min((3+Math.floor(Math.random()*5))*pkPlusMult(), remaining);
  const roost={need:n, killed:0};
  for(let c=0;c<BIRD_CLUSTERS;c++){
    // birds belong in the open field, not buried in a wooded grove where the canopy hides the
    // whole flock — keep resampling the angle around the same ring until it lands clear of one,
    // and spread each cluster to its own angle so they don't just pile on top of each other
    let ang=(6.283*c/BIRD_CLUSTERS)+(Math.random()-0.5)*1.6, cx=(PK.x+Math.cos(ang)*R+WW)%WW, cy=(PK.y+Math.sin(ang)*R+WH)%WH, tries=0;
    while(pkInGrove(cx,cy) && tries<24){
      ang=Math.random()*6.283; cx=(PK.x+Math.cos(ang)*R+WW)%WW; cy=(PK.y+Math.sin(ang)*R+WH)%WH; tries++;
    }
    for(let i=0;i<BIRD_ROOST_SIZE;i++){
      const counted=(c===0 && i<n);   // only the very first cluster carries the "real" bird(s), cosmetically tighter
      const spread=counted?46:82, vspread=counted?34:58;
      const ox=(Math.random()-0.5)*spread, oy=(Math.random()-0.5)*vspread;
      pkEnMake({t:"bird", standing:true, roost, x:(cx+ox+WW)%WW, y:(cy+oy+WH)%WH,
        hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:0, ph:Math.random()*6, kx:0, ky:0, dir:Math.random()<0.5?-1:1, fi:0, ft:0});
    }
    if(Math.random()<STALK_CHANCE) pkSpawnStalkCat(cx,cy, 1+Math.floor(Math.random()*2));
  }
  return n;
}
// WAVES 1-2 — a cat (or two) stalking/circling around a bird flock. Doesn't count toward the
// wave quota and doesn't block the wave clearing — a persistent side hazard. Leave it be and
// it just circles; get close and it aggroes for good, leaping in then chasing him down (no
// settling back once it's on the hunt). 2-hit kill.
function pkSpawnStalkCat(ax, ay, count){
  const alive=PK.en.filter(e=>e.t==="cat" && (e.stalk||e.stalkAggro) && !e.fleeing).length;
  if(alive>=STALK_CAT_SOFTCAP) return;
  const WW=PK.WW, WH=PK.WH;
  const n=Math.min(count, STALK_CAT_SOFTCAP-alive);
  for(let i=0;i<n;i++){
    pkEnMake({t:"cat", stalk:true, x:(ax+WW)%WW, y:(ay+WH)%WH,
      hp:pkEnemyHp(2), hpMax:pkEnemyHp(2), sp:0, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      anchorX:(ax+WW)%WW, anchorY:(ay+WH)%WH, orbitAng:Math.random()*6.283});
  }
}
// WAVE 3 — CAT BACKUP: squads of 2-4 cats charging in directly. 2-hit kill.
function pkSpawnCatSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  const n=Math.min((2+Math.floor(Math.random()*3))*pkPlusMult(), remaining);
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  for(let i=0;i<n;i++){
    const a2=ang+(Math.random()-0.5)*0.8;
    pkEnMake({t:"cat", x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:pkEnemyHp(2), hpMax:pkEnemyHp(2), sp:48, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  return n;
}
// WAVE 3 — a lone decorative bird sweeping straight across, left to right. Pure flavor: it
// doesn't attack, doesn't count toward the quota, and just times out if it's never caught.
function pkSpawnSwoopBird(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const y=(PK.y+(Math.random()-0.5)*h*0.5+WH)%WH, sp=140+Math.random()*30;
  pkEnMake({t:"bird", swoop:true, x:(PK.x-w*0.7+WW)%WW, y,
    hp:1, hpMax:1, sp, vx:sp, vy:0, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0, life:9});
}
// WAVE 4 — NUT THROWERS: weak, ranged squirrels. They approach to a comfortable distance,
// plant themselves, wind up (satisfyingly telegraphed), then lob a nut — 1.5s between throws.
// 1 HP: a single bark takes one down before it can even finish a throw.
function pkSpawnRangerSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  const n=Math.min((2+Math.floor(Math.random()*2))*pkPlusMult(), remaining);
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.65;
  for(let i=0;i<n;i++){
    const a2=ang+(Math.random()-0.5)*0.9;
    pkEnMake({t:"sq", ranger:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:RANGER_APPROACH_SPD, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      atkState:"approach", atkCd:0.6+Math.random()*0.8, strafeDir:Math.random()<0.5?1:-1});
  }
  return n;
}
// WAVE 5 — MAD SQUIRRELS: you made them mad. Same weak 1 HP, but their eyes glow red and they
// root in place to sweep a rotating beam — a boss-style swooping attack — for a full 3 seconds,
// then overheat and self-destruct in a satisfying pop, whether or not they ever hit BONES.
function pkSpawnMadSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  const n=Math.min((2+Math.floor(Math.random()*2))*pkPlusMult(), remaining);
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  for(let i=0;i<n;i++){
    const a2=ang+(Math.random()-0.5)*0.9;
    pkEnMake({t:"sq", madsq:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:78, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.6+Math.random()*0.8});
  }
  return n;
}
// WAVE 6 — THE ALPHAS: exactly 2 giant alpha cats (5-hit kill, gigantic leap attack) plus a
// trickle of 20 regular cats. Alphas are fixed boss units — not scaled by DOGPARK+.
function pkSpawnAlphaSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW, WH=PK.WH;
  for(let i=0;i<2;i++){
    const ang=(i/2)*6.283+Math.random()*0.5, R=Math.max(w,h)*0.6;
    pkEnMake({t:"cat", alpha:true, big:true, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
      hp:pkEnemyHp(5), hpMax:pkEnemyHp(5), sp:ALPHA_APPROACH_SPD, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0, leapCd:1.5+Math.random()});
  }
  toast("☠ THE ALPHAS HAVE ARRIVED",1);
  beep(120,.35,"sawtooth",.05);
}
// WAVES 7-10(+) — a random mix of two previously-seen enemy types, trickling in as small
// squads of 1-3. Clearing wave 10 unlocks DOGPARK+.
const MIX_POOL=["bird","cat","ranger","madsq"];
const MIX_NAME={bird:"BIRDS", cat:"CATS", ranger:"SQUIRRELS", madsq:"MAD SQUIRRELS"};
function pkPickMixTypes(){
  const pool=MIX_POOL.slice();
  const a=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
  const b=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
  return [a,b];
}
// waves 6+: by now BONES is a nuisance and they want him gone — enemies pour in from the start
// of wave 6 rather than easing into it, and both the burst interval and the burst size keep
// climbing hard from there. He isn't leaving the dogpark either way.
function pkMixInterval(wv){ return Math.max(0.7, 2.6-Math.max(0,wv-6)*0.25); }
function pkSpawnMixBurst(types){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  const climb=Math.max(0,PK.wave-6);
  const n=Math.min(((2+Math.floor(Math.random()*3))+Math.floor(climb/1.5))*pkPlusMult(), remaining);
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  const spread=Math.min(6.283, 0.9+climb*0.15);   // fans out wider each wave — surrounded, not funneled
  for(let i=0;i<n;i++){
    const type=types[Math.floor(Math.random()*types.length)];
    const a2=ang+(Math.random()-0.5)*spread;
    const x=(PK.x+Math.cos(a2)*R+WW)%WW, y=(PK.y+Math.sin(a2)*R+WH)%WH;
    if(type==="bird") pkEnMake({t:"bird", x,y, hp:pkEnemyHp(1),hpMax:pkEnemyHp(1), sp:106.25, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0});   // +25% over the original 85
    else if(type==="cat") pkEnMake({t:"cat", x,y, hp:pkEnemyHp(2),hpMax:pkEnemyHp(2), sp:48, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0});
    else if(type==="ranger") pkEnMake({t:"sq", ranger:true, x,y, hp:pkEnemyHp(1),hpMax:pkEnemyHp(1), sp:RANGER_APPROACH_SPD, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0, atkState:"approach", atkCd:0.6+Math.random()*0.8, strafeDir:Math.random()<0.5?1:-1});
    else if(type==="madsq") pkEnMake({t:"sq", madsq:true, x,y, hp:pkEnemyHp(1),hpMax:pkEnemyHp(1), sp:78, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0, laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.6+Math.random()*0.8});
  }
  return n;
}
// how many enemies a wave needs cleared \u2014 hand-set to match the redesigned wave-by-wave
// spec. waves beyond 10 keep extending the mix pattern with a gently rising quota.
function pkWaveQuota(wv){
  if(wv===1) return 2;    // catch 2 birds — the introduction, deliberately tiny
  if(wv===2) return 24;   // the birds are upset — a real, sky-filling swarm
  if(wv===3) return 10;   // attack of the cats
  // from wave 4 the park stops trickling and starts pouring. These are kill counts, not
  // on-screen counts — pkMaxAlive is what actually governs how many are in front of you at once.
  if(wv===4) return 35;   // watch out, nuts
  if(wv===5) return 45;   // coming out of the trees
  return Math.round(60*Math.pow(1.22, wv-6));   // 60, 73, 89, 109, 133, 162, 197...
}
/* ---------- horde density ----------
   Borrowed from the survivors-likes: the wave says how many must go down, but a separate pair of
   live-enemy bounds decides how many may be on the field at any moment. Below minAlive the
   spawners are hurried along so the screen never goes quiet; at maxAlive ordinary spawning stops
   dead and only scripted arrivals (the golden bird, the healer, a tree's ape, wave 8's couples)
   may still appear. Raising a quota therefore makes a wave longer and busier, never unbounded. */
function pkMaxAlive(){
  const base = PK.plusMode ? 150 : 85;   // measured: ~60fps at this density, 52fps by ~290
  // eased in over the opening waves so wave 1 stays the gentle thing it is
  const ramp = clamp(0.30+(PK.wave-1)*0.17, 0.30, 1);
  return Math.max(14, Math.round(base*ramp));
}
function pkMinAlive(){ return Math.round(pkMaxAlive()*0.34); }
function pkAliveCount(){ let n=0; for(let i=0;i<PK.en.length;i++) if(!PK.en[i].fleeing) n++; return n; }
// what each wave is called. 6 onwards is the same escalating joke, told straight.
const WNAME={
  1:"CATCH 2 BIRDS",
  2:"CLEAR 24 BIRDS",
  3:"ATTACK OF THE CATS",
  4:"WATCH OUT — NUTS!",
  5:"THEY'RE COMING OUT OF THE GOD DAMNED TREES!",
  6:"GOOD LUCK — YOU'RE ON YOUR OWN",
  7:"STILL HERE? THEY NOTICED.",
  8:"THE TREES ARE DROPPING APES — CLEAR 10",
  9:"THIS IS NOT A DRILL",
  10:"☠ NOBODY IS COMING TO HELP",
  11:"YOU WERE WARNED",
  12:"☠ RUN, BONES. JUST RUN."
};
function pkWaveName(wv){
  if(WNAME[wv]) return WNAME[wv];
  return PK.mixLabel ? PK.mixLabel+" — STILL COMING" : "STILL COMING";
}
// enemies toughen as the waves climb: a bird takes 3 barks by wave 10, and everything
// else scales off its own base the same way
function pkEnemyHp(base){ return base + Math.floor(((PK.wave||1)-1)/4.5); }
const BARK_CAP=62;   // hard ceiling on radius: the bark used to reach ~90 and trivialised waves
/* With hordes on screen the bark has to keep up, so its bite grows with the waves even though its
   reach stays capped. This is the main lever that keeps a dense screen clearable rather than
   simply overwhelming — one bark should still meaningfully thin a crowd at wave 12. */
function pkBarkDmg(){ return 1+Math.floor(Math.max(0,(PK.wave||1)-3)/3); }   // 1, then +1 every 3 waves from 4
/* The wave goal is now one number and one number only: how many enemies BONES has put down this
   wave (PK.waveKills, incremented in the single pkDownEnemy path). The old model tried to derive
   it from "quota still to spawn + qualifying enemies still alive", with a separate list of types
   that were exempt from counting — which is why kills kept appearing not to register: downing a
   burning-tree squirrel, a stalking cat, a spare roost bird or an ape advanced nothing. Display
   and clear condition now read the exact same counter, so what the HUD promises is what ends the
   wave, and no enemy anywhere is exempt. */
function pkWaveGoal(){ return PK.wave===APE_WAVE ? APE_WAVE_QUOTA : PK.waveQuota; }
function pkWaveDone(){ return PK.wave===APE_WAVE ? (PK.apeKills||0) : (PK.waveKills||0); }
// wave 8 is the one wave with a typed objective, and it says so on the banner and in the HUD
// ("N APES LEFT"), so there is never a question about what a given kill counts toward
function pkLeftCount(){ return Math.max(0, pkWaveGoal()-pkWaveDone()); }
function pkLeftLabel(){ return PK.wave===APE_WAVE ? " APES LEFT" : " LEFT"; }
function pkWavePct(){ return clamp(pkWaveDone()/Math.max(1,pkWaveGoal()),0,1); }
const SPARK_CAP=260, EMBER_CAP=300;
/* Nothing in the park is allowed to sit out the fight in a far corner while the player wanders
   the map looking for it. Whatever a wave's goal is, the enemies carrying that goal close on
   BONES on their own: anything that drifts beyond the engagement ring gets a steady pull back
   toward him on top of whatever its own movement is doing, and if the screen ever empties out
   entirely that pull sharpens and standing roosts get up and come to him. The wave always comes
   to the player, so there is never a hunt for the last stragglers. */
const HUNT_PULL=52;          // gentle drift, so each type keeps its own character
const HUNT_STARVED_PULL=165; // nothing on screen at all: they come in properly
function pkHuntPlayer(dt,WW,WH){
  const cv=$("#dogcv");
  const engage=Math.hypot(cv.clientWidth,cv.clientHeight)*0.55;
  let near=0;
  for(const e of PK.en){
    if(e.fleeing || e.decor || e.swoop) continue;
    if(Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH))<engage){ near++; break; }
  }
  const starved = near===0;
  for(const e of PK.en){
    if(e.fleeing || e.decor || e.swoop) continue;
    const dx=wd(PK.x-e.x,WW), dy=wd(PK.y-e.y,WH), d=Math.hypot(dx,dy)||1;
    if(d<engage*0.75){ e.hunting=false; continue; }
    // a roost that nobody can find is just scenery — once the field is empty they get up
    if(starved && (e.standing||e.spooked)){
      e.standing=false; e.spooked=false;
      if(!e.sp) e.sp=106;          // a roost bird has no speed of its own until it decides to fly
      e.hunting=true;
    }
    const pull = starved ? HUNT_STARVED_PULL : HUNT_PULL;
    e.x=(e.x+dx/d*pull*dt+WW)%WW;
    e.y=(e.y+dy/d*pull*dt+WH)%WH;
    e.dir = dx<0 ? -1 : 1;
    e.hunting=true;
  }
}
const FLEE_SPEED=115, FLEE_TIME=2.2;   // how fast, and how long, a scared-off enemy scuttles before despawning
/* The wave-ending kill: rather than cutting straight to the shop the instant the counter lands,
   the whole world drops into slow motion for a beat while the last enemy tumbles away and fades.
   The outro clock runs in REAL seconds while everything it is watching runs slowed, so the beat
   is always the same length no matter how deep the slow motion goes. */
const WAVE_OUTRO_DUR=1.75;
function pkOutroSlow(){
  const p=clamp((PK.waveOutro?PK.waveOutro.t:0)/WAVE_OUTRO_DUR,0,1);
  if(p<0.10) return 1-(1-0.13)*(p/0.10);          // drop hard into it on the hit
  if(p<0.74) return 0.13;                          // hold, so the tumble really reads
  return 0.13+(0.55-0.13)*((p-0.74)/0.26);         // and start letting go before the shop lands
}
// bark hit-testing treats every enemy as a bare point at (x,y) — barkR alone made a visual touch
// against a wide sprite (birds especially, whose art is wider than its anchor suggests) fail to
// register. Padding the reach by each type's own rough footprint is what "touching it" actually
// means, and it has to be identical here and in the auto-trigger check below or the two disagree.
function pkHitR(e){
  if(e.t==="bird") return 9;
  if(e.t==="cat") return e.small?7:10;
  if(e.boss) return 16;
  if(e.alpha) return 14;
  return 8;
}
function pkBark(){
  PK.barkCd = PK.zoomT>0 ? 0 : PK.barkMax;   // mid-zoomies there is no cooldown at all
  PK.pulse=0.35;
  bark(0.82);
  let hits=0;
  const barkDmg=pkBarkDmg();
  const sweep=[];
  pkEnemiesNear(PK.x,PK.y,PK.barkR+20,e=>sweep.push(e));
  for(let i=sweep.length-1;i>=0;i--){
    const e=sweep[i];
    if(e.fleeing) continue;   // already scared off — can't be hit again
    const dxw=wd(e.x-PK.x,PK.WW), dyw=wd(e.y-PK.y,PK.WH);
    const d=Math.hypot(dxw,dyw)||1;
    if(d<PK.barkR+pkHitR(e)){
      e.hp-=barkDmg;   // flat, regardless of how many others are in the circle with it — no falloff
      // every enemy type barked at counts toward the "bark at everybody" side mission
      PK.barkedTypes[e.t]=true;
      if(!PK.missionBarkAll && PK.barkedTypes.sq && PK.barkedTypes.bird && PK.barkedTypes.cat){
        PK.missionBarkAll=true; pkAwardXP(20);
        pkFanfare(null,false,"✓ BARKED AT EVERYONE — +20 XP");
      }
      if(e.hp<=0){
        // he doesn't kill anyone anymore: one bone drops where they were caught, they look
        // shocked, then scuttle off-screen on their own — pkEn's fleeing branch handles the rest
        if(pkDownEnemy(e,-dxw/d,-dyw/d)) hits++;
        pkHitMark(e.x, e.y, true);
        beep(950,.08,"square",.04);
      }
      else {
        e.kx=dxw/d*PK.knock*1.6; e.ky=dyw/d*PK.knock*1.6;   // shove them, and let it read
        e.hitT=0.22;                                       // white flash on the sprite
        pkHitMark(e.x, e.y, false);
        if(e.flock && !e.circling) e.circling=true;   // survives a hit -> breaks formation to circle and dive-attack
      }
    }
  }
  if(hits>0) beep(300,.05);
}
const BARK_LVL_CAP=4;
// the agility course: a top-up you have to go and earn, not a bones dispenser
const AGI_LVL_CAP=3, AGI_CD_BASE=20, AGI_CD_STEP=4, AGI_HEAL_BASE=0.05, AGI_HEAL_STEP=0.03;
function pkAgiCd(){   return Math.max(6, AGI_CD_BASE - AGI_CD_STEP*(PK.agiLvl||0)); }
function pkAgiHeal(){ return AGI_HEAL_BASE + AGI_HEAL_STEP*(PK.agiLvl||0); }
// the camera pulls back a little every time BONES gets stronger — a bigger bark or a bigger
// park both mean more happening on screen at once, so the view widens to show it. The two
// sources share one 25%-out ceiling rather than stacking without limit.
function pkApplyZoom(){
  PK.zoom=1-Math.min(0.25,(PK.zoomFromBark||0)+(PK.zoomFromPark||0));
}
function pkExpandPark(){
  PK.worldMult=Math.min(8,PK.worldMult+0.5);
  if(Math.random()<0.5 && PK.groves<3){ PK.groves++; toast("THE PARK GREW — AND SO DID THE TREES."); }
  PK.zoomFromPark=Math.min(0.25,(PK.zoomFromPark||0)+0.10);
  pkApplyZoom();
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  PK.WW=w*PK.worldMult; PK.WH=h*PK.worldMult;
  pkBuildBG(PK.WW,PK.WH);
  pkBuildTrees();
}
/* ---------- the bandana dog: a shop for friends who fight beside you ---------- */
// he stands stock still in the middle of the carnage wearing a red bandana, utterly unbothered.
// walk up to him and he sells company. Companions live in PK.pals and never in PK.en, which is
// the single thing that keeps them out of the wave quota, the clear check, the bark sweep and
// the "N LEFT" counter without a line of special-casing in any of them.
const NPC_TALK_R=30, NPC_REARM_R=68;
// companions have 4 upgrade tiers. current power = T4; T1 is deliberately weak.
// fixed properties that don't scale with tier:
const PAL_SQ_FOLLOW=44;
const PAL_CAT_ORBIT_R=44, PAL_CAT_ORBIT_SPD=1.7, PAL_CAT_LEASH=210;
const PAL_BIRD_ALT=54, PAL_BIRD_SPEED=175;
const PAL_LASER_CD=10, PAL_LASER_SWEEP=1.2, PAL_LASER_ARC=0.6, PAL_LASER_SAFE=0.45, PAL_LASER_DMG=3;
const PAL_NUT_SPEED=210, PAL_NUT_DMG=1;
// per-tier stat tables (index 0 = T1 … index 3 = T4)
// the squirrel never fires more than one nut at a time — its upgrades are fire rate and damage
// instead, building up to T4's laser eyes rather than a shotgun blast of acorns
const PAL_SQ_CD_T    = [4.0, 2.5, 1.5, 1.0];
const PAL_SQ_RANGE_T = [100, 160, 200, 240];
const PAL_SQ_DMG_T   = [1,   2,   3,   4];
const PAL_SQ_HP_T    = [16,  20,  22,  26];
const PAL_CAT_SEEK_T = [50,  75,  95,  115];
const PAL_CAT_SPD_T  = [120, 160, 195, 230];
const PAL_CAT_HP_T   = [14,  17,  20,  22];
// double the flock size at every tier, and only the T4 dive itself hits twice as hard
const PAL_BIRD_N_T   = [4,   6,   8,   10];
const PAL_BIRD_EVT   = [14,  10,  8,   7];
const PAL_BIRD_DMG_T = [1,   1,   1,   2];
/* The ape friend does not brawl. He plants himself, waits out a long cooldown, then leaps and
   comes down with a ground smash that bounces almost everything nearby clear of BONES. The
   damage is deliberately modest — he is crowd control, not a damage dealer — and every upgrade
   buys back cooldown rather than power, so a maxed ape is a far more frequent hammer, not a
   bigger one. */
const PAL_APE_HP=60, PAL_APE_LEASH=250;
const PAL_APE_SEEK_R=150;          // how far he will pick a target to come down on
const PAL_APE_SMASH_R=74;          // the blast radius of the landing
const PAL_APE_DMG=3;               // modest: this is a shove with a bruise attached
const PAL_APE_KNOCK=430;           // and this is the point of him
const PAL_APE_WINDUP=0.45;         // he crouches first, so the smash is readable
const PAL_APE_AIR=0.55;            // time in the air
const PAL_APE_ARC=54;              // how high the hop goes
const PAL_APE_LAND=0.35;           // the shockwave beat after he lands
const PAL_APE_CD_T=[5.0, 3.8, 2.8, 2.0];   // "stays still for 5 seconds", down to 2 at max tier
function pkApePalCd(t){ return PAL_APE_CD_T[clamp(t,1,4)-1]; }
function pkSqCd(t)    { return PAL_SQ_CD_T[t-1]; }
function pkSqRange(t) { return PAL_SQ_RANGE_T[t-1]; }
function pkSqDmg(t)   { return PAL_SQ_DMG_T[t-1]; }
function pkSqHp(t)    { return PAL_SQ_HP_T[t-1]; }
function pkCatSeekR(t){ return PAL_CAT_SEEK_T[t-1]; }
function pkCatSpeed(t){ return PAL_CAT_SPD_T[t-1]; }
function pkCatHp(t)   { return PAL_CAT_HP_T[t-1]; }
function pkBirdN(t)   { return PAL_BIRD_N_T[t-1]; }
function pkBirdEvery(t){ return PAL_BIRD_EVT[t-1]; }
function pkBirdDmg(t) { return PAL_BIRD_DMG_T[t-1]; }
// shop rows: one per companion kind; each row shows the next purchasable tier
const PAL_KINDS=["sq","bird","cat","ape"];
// how many tiers each kind actually has — sq/bird/cat upgrade through 4, the ape is bought once
const PAL_MAXTIER={sq:4, bird:4, cat:4, ape:4};
const PAL_TIERS={
  sq:[
    {n:"SQUIRREL PAL", fx:"FOLLOWS YOU, THROWS NUTS (SLOW)", c:15},
    {n:"SQUIRREL PAL", fx:"FASTER FIRE, MORE DAMAGE",        c:27},
    {n:"SQUIRREL PAL", fx:"FASTER STILL, HEAVIER HITS",      c:39},
    {n:"SQUIRREL PAL", fx:"T4: LASER EYES UNLOCKED",         c:57},
  ],
  bird:[
    {n:"BIRD FLOCK",   fx:"4 BIRDS, EVERY 14 SEC",           c:20},
    {n:"BIRD FLOCK",   fx:"6 BIRDS, EVERY 10 SEC",           c:32},
    {n:"BIRD FLOCK",   fx:"8 BIRDS, EVERY 8 SEC",            c:47},
    {n:"BIRD FLOCK",   fx:"10 BIRDS, EVERY 7 SEC — DOUBLE DAMAGE",c:66},
  ],
  cat:[
    {n:"CAT FRIEND",   fx:"SHORT RANGE, SLOW POUNCE",        c:18},
    {n:"CAT FRIEND",   fx:"WIDER PATROL, FASTER",            c:30},
    {n:"CAT FRIEND",   fx:"QUICK AND AGGRESSIVE",            c:45},
    {n:"CAT FRIEND",   fx:"T4: FULL POWER, POUNCES ANYTHING",c:57},
  ],
  ape:[
    {n:"APE FRIEND",   fx:"LEAPS AND SMASHES \u2014 5s BETWEEN", c:500},
    {n:"APE FRIEND",   fx:"SMASHES EVERY 3.8s",               c:200},
    {n:"APE FRIEND",   fx:"SMASHES EVERY 2.8s",               c:300},
    {n:"APE FRIEND",   fx:"T4: SMASHES EVERY 2s",             c:400},
  ]
};
function pkPalTier(k){ const p=PK.pals.find(q=>q.k===k); return p?p.tier:0; }
function pkPalBuyableK(k){ return pkPalTier(k)<(PAL_MAXTIER[k]||4); }
function pkNextTierData(k){ const t=pkPalTier(k)+1, max=PAL_MAXTIER[k]||4; return t<=max?PAL_TIERS[k][t-1]:null; }
function pkBuyPal(k){
  const existing=PK.pals.find(p=>p.k===k);
  const tier=(existing?existing.tier:0)+1;
  if(tier>(PAL_MAXTIER[k]||4)) return;
  if(existing){
    // upgrade: update stats in place, keep position and motion
    existing.tier=tier;
    if(k==="sq"){ existing.hpMax=pkSqHp(tier); existing.hp=Math.min(existing.hp+4,existing.hpMax); existing.cd=pkSqCd(tier); }
    if(k==="cat"){ existing.hpMax=pkCatHp(tier); existing.hp=Math.min(existing.hp+3,existing.hpMax); }
    if(k==="bird"){ existing.passT=Math.min(existing.passT, pkBirdEvery(tier)); }
    // the ape buys back waiting time, nothing else — his next smash lands sooner immediately
    if(k==="ape"){ existing.cd=Math.min(existing.cd, pkApePalCd(tier)); }
    return;
  }
  // first purchase: spawn beside BONES
  const px=PK.x, py=PK.y;
  if(k==="sq")   PK.pals.push({k:"sq", tier:1, x:(px+30)%PK.WW, y:py,
                               hp:pkSqHp(1), hpMax:pkSqHp(1), cd:pkSqCd(1),
                               dir:1, fi:0, ft:0, kx:0, ky:0, palBurnT:0, contactT:0,
                               laserCd:PAL_LASER_CD*0.4, laserState:"idle", chargeT:0, sweepT:0, aimAng:0, aimBase:0, beamLen:0});
  if(k==="cat")  PK.pals.push({k:"cat", tier:1, x:(px-30+PK.WW)%PK.WW, y:py,
                               hp:pkCatHp(1), hpMax:pkCatHp(1),
                               orbitAng:Math.random()*6.283, state:"orbit", tgt:null, recall:false,
                               dir:1, fi:0, ft:0, kx:0, ky:0, palBurnT:0, contactT:0});
  if(k==="bird") PK.pals.push({k:"bird", tier:1, passT:1.2, birds:[]});
  if(k==="ape")  PK.pals.push({k:"ape", tier:1, x:(px+40)%PK.WW, y:(py+18)%PK.WH,
                               hp:PAL_APE_HP, hpMax:PAL_APE_HP,
                               state:"rest", cd:pkApePalCd(1), windT:0, airT:0, landT:0,
                               sx0:0, sy0:0, sdx:0, sdy:0, tgt:null,
                               dir:1, fi:0, ft:0, kx:0, ky:0, palBurnT:0, contactT:0});
}
// one shared kill path for everything a companion does, so a friend's hit resolves exactly like
// a bark: a bone drops, they look shocked, then they scuttle off under their own steam
/* THE one place an enemy leaves the field. Every damage path in the park funnels through here.
   The wave goal is a plain count of these calls, so it is structurally impossible to take an
   enemy down without it advancing the goal — whatever type it is, whatever killed it. Anything
   that wants to skip the bookkeeping would have to skip the death itself. */
function pkDownEnemy(e,ux,uy,o){
  if(e.fleeing) return false;          // already down: never counted, or knocked out, twice
  o=o||{};
  const fs = o.fleeSpeed!=null ? o.fleeSpeed : FLEE_SPEED;
  e.fleeing=true; e.fleeT=0;
  e.shockT = o.shockT!=null ? o.shockT : 0.35;
  e.hitT=0.3;
  e.fleeVx=(ux||0)*fs; e.fleeVy=(uy||0)*fs;
  PK.drops.push({x:e.x, y:e.y, v:e.boss?8:1, gold:!!e.alpha||!!e.boss, life:25});
  if(Math.random()<MAGNET_DROP_CHANCE) PK.powerups.push({type:"magnet", x:e.x, y:e.y+10, life:18});
  if(Math.random()<REGEN_DROP_CHANCE) PK.powerups.push({type:"regen", x:e.x, y:e.y, life:18});
  PK.kills++;
  PK.waveKills=(PK.waveKills||0)+1;    // <- the wave goal itself. Every single kind of enemy.
  PK.lastDowned=e;                     // the wave-ending kill gets its own slow-motion send-off
  if(e.roost) e.roost.killed++;
  if(e.boss){ PK.apeKills=(PK.apeKills||0)+1; pkFanfare(null,false,"✓ THE APE IS DOWN — +8 BONES"); }
  return true;
}
/* The ape friend's whole contribution: he comes down, and everything around the impact gets
   thrown outward. Damage is small on purpose — what this is for is peeling a pack off BONES.
   Anything launched gets tagged with a bounce, which drawEnemy reads to spin and squash it as
   it sails away, so a smash landing in a crowd is properly satisfying to watch. */
function pkApePalSmash(p,WW,WH){
  PK.shake=Math.max(PK.shake||0,0.55);
  PK.scorch.push({x:p.x, y:p.y, r:PAL_APE_SMASH_R*0.42});
  for(let i=0;i<26;i++){                       // the dirt ring thrown up by the landing
    const a=Math.random()*6.283, sp=70+Math.random()*150;
    PK.embers.push({x:p.x, y:p.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp*0.5-40-Math.random()*50,
      life:0.4+Math.random()*0.4, dust:true});
  }
  let hit=0;
  for(const e of PK.en){
    if(e.fleeing) continue;
    const dx=wd(e.x-p.x,WW), dy=wd(e.y-p.y,WH), d=Math.hypot(dx,dy)||1;
    if(d>PAL_APE_SMASH_R) continue;
    const ux=dx/d, uy=dy/d;
    const falloff=1-0.45*(d/PAL_APE_SMASH_R);   // dead centre gets thrown hardest
    hit++;
    // damage first: pkPalHit applies its own ordinary knockback, and the whole point of the
    // smash is that its launch overrides that rather than being overwritten by it
    pkPalHit(e,PAL_APE_DMG,ux,uy);
    // bounced clear whether or not the little bit of damage finished them
    e.kx=ux*PAL_APE_KNOCK*falloff; e.ky=uy*PAL_APE_KNOCK*falloff;
    if(e.fleeing){ e.fleeVx=ux*FLEE_SPEED*1.5; e.fleeVy=uy*FLEE_SPEED*1.5; }
    e.bounceT=0.55; e.bounceMax=0.55; e.bounceSpin=(Math.random()<0.5?-1:1)*(5+Math.random()*5);
    e.hitT=0.26;
    for(let s=0;s<5;s++){
      SPARKS.push({x:e.x, y:e.y-6, vx:ux*(60+Math.random()*110)+(Math.random()-0.5)*60,
        vy:-60-Math.random()*70, life:0.3+Math.random()*0.25});
    }
  }
  // the impact reads as one heavy thud, not one sound per enemy caught
  beep(70,.3,"sawtooth",.11,{prio:2, key:"apesmash"});
  setTimeout(()=>beep(140,.18,"square",.06,{prio:1, key:"apesmash2"}),45);
  if(hit>0) setTimeout(()=>beep(300,.1,"square",.045,{prio:1, key:"apesmash3"}),90);
}
function pkPalHit(e,dmg,ux,uy){
  if(e.fleeing) return;
  e.hp-=dmg;
  if(e.hp<=0){
    pkDownEnemy(e,ux,uy);
    beep(950,.08,"square",.04);
  } else { e.kx=ux*PK.knock*0.7; e.ky=uy*PK.knock*0.7; }
}
/* ---------- enemy spatial hash ----------
   Same idea as the tree grid, but rebuilt every frame because enemies move. At horde density the
   naive "test every enemy against every query" pattern is what falls over first: bark, the sword,
   the ape's smash, every pal picking a target and the separation pass are all neighbourhood
   questions, and none of them should be walking a list of 160+. Rebuilding costs one pass; every
   query after that touches a couple of cells. */
const EN_GRID=88;
let ENG_COLS=0, ENG_ROWS=0, ENG=null;
function pkBuildEnGrid(WW,WH){
  const cols=Math.max(1,Math.ceil(WW/EN_GRID)), rows=Math.max(1,Math.ceil(WH/EN_GRID));
  if(!ENG || cols!==ENG_COLS || rows!==ENG_ROWS){
    ENG_COLS=cols; ENG_ROWS=rows; ENG=new Array(cols*rows);
    for(let i=0;i<ENG.length;i++) ENG[i]=[];
  } else {
    for(let i=0;i<ENG.length;i++) if(ENG[i].length) ENG[i].length=0;
  }
  for(let i=0;i<PK.en.length;i++){
    const e=PK.en[i];
    // a single enemy with a broken position must never be able to take the whole frame down
    if(e.fleeing || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    const cx=((Math.floor(e.x/EN_GRID)%ENG_COLS)+ENG_COLS)%ENG_COLS;
    const cy=((Math.floor(e.y/EN_GRID)%ENG_ROWS)+ENG_ROWS)%ENG_ROWS;
    const b=ENG[cy*ENG_COLS+cx];
    if(b) b.push(e);
  }
}
function pkEnemiesNear(x,y,r,cb){
  const g=ENG;
  const span=g ? Math.ceil(r/EN_GRID) : 0;
  // fall back to a straight scan whenever the grid is missing, stale against a resized world
  // (buying a park expansion changes PK.WW mid-run), or the query simply covers everything
  if(!g || g.length!==ENG_COLS*ENG_ROWS || span*2+1>=Math.min(ENG_COLS,ENG_ROWS)){
    for(let i=0;i<PK.en.length;i++){ const e=PK.en[i]; if(!e.fleeing) cb(e); }
    return;
  }
  const cx=Math.floor(x/EN_GRID), cy=Math.floor(y/EN_GRID);
  for(let j=-span;j<=span;j++) for(let i=-span;i<=span;i++){
    const gx=((cx+i)%ENG_COLS+ENG_COLS)%ENG_COLS, gy=((cy+j)%ENG_ROWS+ENG_ROWS)%ENG_ROWS;
    const b=g[gy*ENG_COLS+gx];
    if(!b) continue;
    for(let k=0;k<b.length;k++) cb(b[k]);
  }
}
/* A horde that all walks the same line collapses into one enemy-shaped stack. A cheap shove
   apart keeps the mass readable and spread across the screen without any real flocking cost:
   each enemy only looks at its own cell neighbourhood, and the push is small enough that it
   never fights the type's own movement. */
const SEP_R=15, SEP_PUSH=54;
function pkSeparate(dt,WW,WH){
  const g=ENG;
  if(!g || g.length!==ENG_COLS*ENG_ROWS) return;   // no grid this frame: skip rather than go O(n^2)
  const R2=SEP_R*SEP_R;
  for(let i=0;i<PK.en.length;i++){
    const e=PK.en[i];
    if(e.fleeing || e.standing || e.boss || e.stormForm || e.flock) continue;
    if(!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    // the cell walk is written out rather than going through pkEnemiesNear's callback: at this
    // density that callback would mean one fresh closure per enemy per frame, which is precisely
    // the sort of steady allocation that shows up later as a GC hitch
    let sx=0, sy=0, n=0;
    const cx=Math.floor(e.x/EN_GRID), cy=Math.floor(e.y/EN_GRID);
    for(let j=-1;j<=1 && n<4;j++) for(let k=-1;k<=1 && n<4;k++){
      const gx=((cx+k)%ENG_COLS+ENG_COLS)%ENG_COLS, gy=((cy+j)%ENG_ROWS+ENG_ROWS)%ENG_ROWS;
      const b=g[gy*ENG_COLS+gx];
      if(!b) continue;
      for(let m=0;m<b.length && n<4;m++){
        const o=b[m];
        if(o===e || o.boss) continue;
        const dx=wd(e.x-o.x,WW), dy=wd(e.y-o.y,WH);
        const d2=dx*dx+dy*dy;
        if(d2>0.01 && d2<R2){ const d=Math.sqrt(d2); sx+=dx/d; sy+=dy/d; n++; }
      }
    }
    if(n){
      const m2=Math.hypot(sx,sy)||1;
      e.x=(e.x+(sx/m2)*SEP_PUSH*dt+WW)%WW;
      e.y=(e.y+(sy/m2)*SEP_PUSH*dt+WH)%WH;
    }
  }
}
/* Anything ordinary that ends up miles behind the player is dead weight: it will never catch up,
   it still costs a slot against the density cap, and it leaves a long tail trailing off the map.
   Rather than despawning it (which would quietly shrink the wave), it is picked up and put back
   down on the approach ring ahead of him — the same enemy, re-entering the fight. Bosses and
   anything scripted are never moved. */
const RECYCLE_R=1.9, RECYCLE_EVERY=0.5;
function pkRecycleStragglers(dt,WW,WH){
  PK.recycleT=(PK.recycleT||0)-dt;
  if(PK.recycleT>0) return;
  PK.recycleT=RECYCLE_EVERY;
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const far=Math.hypot(w,h)*RECYCLE_R, ring=Math.max(w,h)*0.62;
  for(let i=0;i<PK.en.length;i++){
    const e=PK.en[i];
    if(e.fleeing || e.boss || e.roost || e.standing || e.spooked || e.decor || e.swoop) continue;
    if(e.stormForm || e.flock || e.vForm) continue;          // formations own their own paths
    const d=Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH));
    if(d<far) continue;
    const a=Math.random()*6.283;
    e.x=(PK.x+Math.cos(a)*ring+WW)%WW;
    e.y=(PK.y+Math.sin(a)*ring+WH)%WH;
    e.kx=0; e.ky=0; e.hunting=false;
  }
}
function pkNearestEnemy(x,y,maxR){
  let best=null, bd=maxR;
  pkEnemiesNear(x,y,maxR,e=>{
    if(e.fleeing) return;
    const d=Math.hypot(wd(e.x-x,PK.WW),wd(e.y-y,PK.WH));
    if(d<bd){ bd=d; best=e; }
  });
  return best;
}
// the laser pal must never, under any circumstances, catch BONES. Layer one: an angular exclusion
// wide enough to cover the whole sweep arc plus the beam's own half-width at the player's range.
function pkPalAimSafe(p,ang){
  const pdx=wd(PK.x-p.x,PK.WW), pdy=wd(PK.y-p.y,PK.WH), pd=Math.hypot(pdx,pdy)||1;
  const guard=Math.atan2(MADSQ_WIDTH+22, Math.max(30,pd))+PAL_LASER_SAFE;
  return Math.abs(wd(Math.atan2(pdy,pdx)-ang,6.283)) > PAL_LASER_ARC+guard;
}
function pkPalLaserAim(p){
  let best=null, bd=1e9;
  const range=pkLaserRange();
  for(const e of PK.en){
    if(e.fleeing) continue;
    const dx=wd(e.x-p.x,PK.WW), dy=wd(e.y-p.y,PK.WH), d=Math.hypot(dx,dy);
    if(d>range) continue;
    const a=Math.atan2(dy,dx);
    if(!pkPalAimSafe(p,a)) continue;
    if(d<bd){ bd=d; best=a; }
  }
  return best;   // null = no safe line at all, so he simply holds his fire (and his cooldown)
}
function pkPalsUpdate(dt,WW,WH){
  for(const p of PK.pals){
    if(p.k==="bird"){
      p.passT-=dt;
      if(p.passT<=0 && p.birds.length===0){
        p.passT=pkBirdEvery(p.tier);
        const ang=Math.random()*6.283, perp=ang+Math.PI/2, R=Math.max(WW,WH)*0.34;
        const cx=PK.x-Math.cos(ang)*R, cy=PK.y-Math.sin(ang)*R;
        const birdN=pkBirdN(p.tier);
        for(let b=0;b<birdN;b++){
          const off=(b-(birdN-1)/2)*22+(Math.random()-0.5)*10;
          p.birds.push({x:(cx+Math.cos(perp)*off+WW)%WW, y:(cy+Math.sin(perp)*off+WH)%WH,
            vx:Math.cos(ang)*PAL_BIRD_SPEED, vy:Math.sin(ang)*PAL_BIRD_SPEED,
            alt:PAL_BIRD_ALT, state:"cruise", tgt:null, life:R*2/PAL_BIRD_SPEED, fi:0, ft:0});
        }
        beep(880,.05,"square",.025); setTimeout(()=>beep(1040,.04,"square",.02),90);
      }
      for(let b=p.birds.length-1;b>=0;b--){
        const bd=p.birds[b];
        bd.life-=dt;
        bd.x=(bd.x+bd.vx*dt+WW)%WW; bd.y=(bd.y+bd.vy*dt+WH)%WH;
        bd.ft+=dt; if(bd.ft>0.08){ bd.ft=0; bd.fi++; }
        if(bd.state==="cruise"){
          // the world position IS the shadow: an enemy the shadow crosses is the one that gets it
          const hit=pkNearestEnemy(bd.x,bd.y,14);
          if(hit){ bd.state="dive"; bd.tgt=hit; }
        } else if(bd.state==="dive"){
          bd.alt=Math.max(0,bd.alt-PAL_BIRD_ALT*dt/0.22);
          const tg=bd.tgt;
          if(!tg || tg.fleeing || tg.hp<=0){ bd.state="climb"; bd.tgt=null; }   // target died mid-dive
          else if(bd.alt<=2){
            const dx=wd(tg.x-bd.x,WW), dy=wd(tg.y-bd.y,WH), d=Math.hypot(dx,dy)||1;
            pkPalHit(tg,pkBirdDmg(p.tier),dx/d,dy/d);
            for(let s=0;s<4;s++) SPARKS.push({x:tg.x, y:tg.y-6, vx:(Math.random()-0.5)*70, vy:-40-Math.random()*40, life:0.3});
            beep(1000,.05,"square",.03,{prio:0});
            bd.state="climb"; bd.tgt=null;
          }
        } else {
          bd.alt=Math.min(PAL_BIRD_ALT, bd.alt+PAL_BIRD_ALT*dt/0.35);
          if(bd.alt>=PAL_BIRD_ALT-0.5) bd.state="cruise";
        }
        if(bd.life<=0) p.birds.splice(b,1);
      }
      continue;
    }
    p.kx*=0.88; p.ky*=0.88;
    p.x=(p.x+p.kx*dt+WW)%WW; p.y=(p.y+p.ky*dt+WH)%WH;
    p.ft+=dt; if(p.ft>0.14){ p.ft=0; p.fi++; }
    if(p.k==="sq"){
      const tdx=wd(PK.x-p.x,WW), tdy=wd(PK.y-p.y,WH), td=Math.hypot(tdx,tdy)||1;
      if(p.laserState==="idle"){
        if(td>PAL_SQ_FOLLOW){
          const sp=Math.min(PK.spd*1.25, 55+td*1.7);
          p.x=(p.x+tdx/td*sp*dt+WW)%WW; p.y=(p.y+tdy/td*sp*dt+WH)%WH;
          p.dir = tdx<0 ? -1 : 1;
        }
        p.cd-=dt;
        const tgt=pkNearestEnemy(PK.x,PK.y,pkSqRange(p.tier));
        if(tgt && p.cd<=0){
          p.cd=pkSqCd(p.tier);
          const nx=wd(tgt.x-p.x,WW), ny=wd(tgt.y-p.y,WH), nd=Math.hypot(nx,ny)||1;
          // always a single nut — upgrades land as fire rate and damage instead, so it never
          // reads as a shotgun blast, only as a squirrel getting steadily more dangerous
          PK.nuts.push({pal:true, dmg:pkSqDmg(p.tier), x:p.x, y:p.y-8, vx:nx/nd*PAL_NUT_SPEED, vy:ny/nd*PAL_NUT_SPEED, life:2.2});
          p.dir = nx<0 ? -1 : 1;
          beep(620,.04,"square",.02,{prio:0});
        }
        if(p.tier>=4){
          p.laserCd-=dt;
          if(p.laserCd<=0){
            const a=pkPalLaserAim(p);
            if(a!==null){ p.laserState="charge"; p.chargeT=0; p.aimAng=a; }
          }
        }
      } else if(p.laserState==="charge"){
        p.chargeT+=dt;
        // layer two: the world doesn't pause, so a line that was safe a moment ago may not be now
        if(!pkPalAimSafe(p,p.aimAng)){ p.laserState="idle"; p.laserCd=1.2; }
        else if(p.chargeT>=MADSQ_CHARGE*0.7){ p.laserState="sweep"; p.sweepT=0; p.aimBase=p.aimAng; pkBlastSfx(); }
      } else {
        p.sweepT+=dt;
        p.aimAng=p.aimBase+Math.sin(p.sweepT/PAL_LASER_SWEEP*6.283)*PAL_LASER_ARC;
        p.dir = Math.cos(p.aimAng)<0 ? -1 : 1;
        const ux=Math.cos(p.aimAng), uy=Math.sin(p.aimAng);
        const blk=pkBeamBlocker(p.x,p.y,p.aimAng,pkLaserRange());
        let len=blk.dist;
        // layer three: the beam is never tested against BONES at all, and if he sprints into the
        // line anyway it simply stops short of him. "Never crosses him" holds in pixels too.
        const bdx=wd(PK.x-p.x,WW), bdy=wd(PK.y-p.y,WH);
        const balong=bdx*ux+bdy*uy, bperp=Math.abs(bdx*uy-bdy*ux);
        if(balong>0 && bperp<MADSQ_WIDTH+10) len=Math.min(len, Math.max(0,balong-16));
        p.beamLen=len;
        if(blk.tree && len>=blk.dist-0.01) pkIgniteTree(blk.tree);
        for(const e of PK.en){
          if(e.fleeing) continue;
          const dx=wd(e.x-p.x,WW), dy=wd(e.y-p.y,WH);
          const al=dx*ux+dy*uy, pe=Math.abs(dx*uy-dy*ux);
          if(al>6 && al<len && pe<MADSQ_WIDTH){
            e.palBeamT=(e.palBeamT||0)+dt;
            if(e.palBeamT>0.16){
              e.palBeamT=0;
              pkPalHit(e,PAL_LASER_DMG,ux,uy);
              PK.embers.push({x:e.x, y:e.y, vx:(Math.random()-0.5)*60, vy:-40-Math.random()*40, life:0.5});
              PK.scorch.push({x:e.x, y:e.y, r:10+Math.random()*6});
            }
          }
        }
        if(p.sweepT>=PAL_LASER_SWEEP){ p.laserState="idle"; p.laserCd=PAL_LASER_CD; }
      }
    } else if(p.k==="cat"){
      const catSpd=pkCatSpeed(p.tier), catSeek=pkCatSeekR(p.tier);
      if(p.state==="orbit"){
        p.orbitAng+=PAL_CAT_ORBIT_SPD*dt;
        const tx=PK.x+Math.cos(p.orbitAng)*PAL_CAT_ORBIT_R, ty=PK.y+Math.sin(p.orbitAng)*PAL_CAT_ORBIT_R*0.6;
        const dx=wd(tx-p.x,WW), dy=wd(ty-p.y,WH), d=Math.hypot(dx,dy)||1;
        const sp=Math.min(catSpd, 55+d*3);
        p.x=(p.x+dx/d*sp*dt+WW)%WW; p.y=(p.y+dy/d*sp*dt+WH)%WH;
        p.dir = dx<0 ? -1 : 1;
        if(p.recall && Math.hypot(wd(p.x-PK.x,WW),wd(p.y-PK.y,WH))<PAL_CAT_ORBIT_R*1.6) p.recall=false;
        if(!p.recall){
          const tgt=pkNearestEnemy(p.x,p.y,catSeek);
          if(tgt){ p.state="pounce"; p.tgt=tgt; }
        }
      } else {
        const tg=p.tgt;
        const leash=Math.hypot(wd(p.x-PK.x,WW),wd(p.y-PK.y,WH));
        if(!tg || tg.fleeing || tg.hp<=0 || leash>PAL_CAT_LEASH){
          if(leash>PAL_CAT_LEASH) p.recall=true;
          p.state="orbit"; p.tgt=null;
        }
        else {
          const dx=wd(tg.x-p.x,WW), dy=wd(tg.y-p.y,WH), d=Math.hypot(dx,dy)||1;
          p.x=(p.x+dx/d*catSpd*dt+WW)%WW; p.y=(p.y+dy/d*catSpd*dt+WH)%WH;
          p.dir = dx<0 ? -1 : 1;
          if(d<16){
            pkPalHit(tg,1,dx/d,dy/d);
            beep(320,.05,"square",.04,{prio:0});
            p.state="orbit"; p.tgt=null;
          }
        }
      }
    } else if(p.k==="ape"){
      /* rest -> windup -> air -> land, and nothing else. He never chases and never touches
         anything on the way past: the only thing that deals damage is the moment he comes down.
         Between smashes he simply stands there, which is what makes the cooldown upgrades read
         as the whole point of him. */
      p.landT=Math.max(0,p.landT-dt);
      if(p.state==="rest"){
        p.cd-=dt;
        // he faces whatever he is waiting to land on, so the wind-up is legible
        const watch=pkNearestEnemy(p.x,p.y,PAL_APE_SEEK_R);
        if(watch) p.dir = wd(watch.x-p.x,WW)<0 ? -1 : 1;
        // scuffs the dirt as the cooldown runs out — a tell that he is nearly ready
        if(p.cd<0.6 && Math.random()<0.10){
          PK.embers.push({x:p.x+(Math.random()-0.5)*14, y:p.y+6,
            vx:(Math.random()-0.5)*22, vy:-12-Math.random()*16, life:0.3+Math.random()*0.2, dust:true});
        }
        if(p.cd<=0){
          // somewhere worth landing: a target if there is one, otherwise back to BONES' side
          const tgt=pkNearestEnemy(p.x,p.y,PAL_APE_SEEK_R);
          const leash=Math.hypot(wd(p.x-PK.x,WW),wd(p.y-PK.y,WH));
          let tx=null, ty=null;
          if(tgt){ tx=tgt.x; ty=tgt.y; }
          else if(leash>PAL_APE_LEASH*0.5){ tx=PK.x+(Math.random()-0.5)*40; ty=PK.y+24+(Math.random()-0.5)*20; }
          if(tx==null){
            p.cd=0.35;                       // nothing worth jumping at — check again shortly
          } else {
            p.state="wind"; p.windT=PAL_APE_WINDUP; p.tgt=tgt||null;
            p.aimX=tx; p.aimY=ty;
            p.dir = wd(tx-p.x,WW)<0 ? -1 : 1;
            beep(180,.12,"square",.05,{prio:0});
          }
        }
      } else if(p.state==="wind"){
        p.windT-=dt;
        if(Math.random()<0.35){
          PK.embers.push({x:p.x+(Math.random()-0.5)*18, y:p.y+6,
            vx:(Math.random()-0.5)*30, vy:-20-Math.random()*24, life:0.3+Math.random()*0.2, dust:true});
        }
        if(p.windT<=0){
          // commits to where the target was at this instant, like the enemy ape's own leap
          p.state="air"; p.airT=PAL_APE_AIR;
          p.sx0=p.x; p.sy0=p.y;
          p.sdx=wd(p.aimX-p.x,WW); p.sdy=wd(p.aimY-p.y,WH);
          beep(300,.1,"square",.05,{prio:0});
        }
      } else if(p.state==="air"){
        p.airT-=dt;
        const prog=clamp(1-p.airT/PAL_APE_AIR,0,1);
        p.x=(p.sx0+p.sdx*prog+WW)%WW; p.y=(p.sy0+p.sdy*prog+WH)%WH;
        p.dir = p.sdx<0 ? -1 : 1;
        if(p.airT<=0){
          p.state="rest"; p.cd=pkApePalCd(p.tier); p.landT=PAL_APE_LAND; p.tgt=null;
          pkApePalSmash(p,WW,WH);
        }
      }
    }
  }
}
// everything that can hurt a friend, gathered in one place rather than threaded through the nine
// separate player-contact blocks in the enemy loop. The flock is exempt: it is only ever on the
// ground for a heartbeat, and per-bird health would raise "which bird did I just lose?".
function pkPalDamage(dt,WW,WH){
  for(let i=PK.pals.length-1;i>=0;i--){
    const p=PK.pals[i];
    if(p.k==="bird") continue;
    let touching=false;
    for(const e of PK.en){
      if(e.fleeing) continue;
      const dx=wd(e.x-p.x,WW), dy=wd(e.y-p.y,WH), d=Math.hypot(dx,dy)||1;
      if(d<14){
        touching=true;
        p.contactT+=dt;
        if(p.contactT>0.5){
          p.contactT=0; p.hp-=e.alpha?6:2;
          p.kx=-dx/d*160; p.ky=-dy/d*160;
          beep(210,.05,"square",.03,{prio:0});
        }
        break;
      }
    }
    if(!touching) p.contactT=0;
    for(const e of PK.en){
      if(!e.madsq || e.fleeing || e.laserState!=="sweep") continue;
      const ux=Math.cos(e.aimAng), uy=Math.sin(e.aimAng);
      const dx=wd(p.x-e.x,WW), dy=wd(p.y-e.y,WH);
      const al=dx*ux+dy*uy, pe=Math.abs(dx*uy-dy*ux);
      if(al>0 && al<(e.beamLen||pkLaserRange()) && pe<MADSQ_WIDTH){
        p.palBurnT+=dt;   // its own timer: sharing burnT would let a doubly-lit enemy steal ticks
        if(p.palBurnT>0.28){
          p.palBurnT=0; p.hp-=4;
          p.kx=ux*180; p.ky=uy*180;
          PK.embers.push({x:p.x, y:p.y, vx:(Math.random()-0.5)*60, vy:-40, life:0.5});
        }
      }
    }
    if(p.hp<=0){
      PK.fx.push({x:p.x, y:p.y-22, txt:"FRIEND DOWN", life:1.4});
      PK.scorch.push({x:p.x, y:p.y, r:12});
      PK.pals.splice(i,1);
      // the upgrade lives on PK, not on the pal, so losing a cheap friend never voids an expensive one
      toast("A FRIEND WENT DOWN — THE BANDANA DOG HAS MORE",1);
      beep(150,.25,"sawtooth",.06);
    }
  }
}
function pkShopOpen(){
  const statAll=[
    {n:"BIGGER BARK", ic:"bark",  fx:"+10 BARK RADIUS",    c:12, capKey:"barkBigLvl",  f:()=>{PK.barkR=Math.min(BARK_CAP,PK.barkR+10); PK.barkBigLvl++; PK.zoomFromBark=Math.min(0.25,(PK.zoomFromBark||0)+0.025); pkApplyZoom();}},
    {n:"FASTER BARK", ic:"fast",  fx:"-0.35s COOLDOWN",     c:14, capKey:"barkFastLvl",f:()=>{PK.barkMax=Math.max(0.8,PK.barkMax-0.35); PK.barkFastLvl++; PK.zoomFromBark=Math.min(0.25,(PK.zoomFromBark||0)+0.025); pkApplyZoom();}},
    {n:"MIGHTY KNOCKBACK", ic:"knock", fx:"+70 KNOCKBACK", c:10, f:()=>PK.knock+=70},
    {n:"SNACK", ic:"heal",        fx:"HEAL 30 HP",          c:8,  f:()=>PK.hp=Math.min(PK.maxhp,PK.hp+30)},
    {n:"ZOOMIES", ic:"speed",     fx:"+10% SPEED",          c:12, f:()=>PK.spd*=1.1},
    {n:"TOUGH COAT", ic:"hp",     fx:"+15 MAX HP",          c:15, f:()=>{PK.maxhp+=15;PK.hp+=15;}},
    {n:"KEEN NOSE", ic:"nose",    fx:"WIDER BONE PICKUP",   c:11, capKey:"sniffLvl", capMax:SNIFF_LVL_CAP, f:()=>{PK.sniffLvl=(PK.sniffLvl||0)+1;}},
    {n:"AGILITY TRAINING", ic:"agility", fx:"COURSE HEALS +3%, RESETS 4s SOONER", c:13,
     capKey:"agiLvl", capMax:AGI_LVL_CAP, f:()=>{PK.agiLvl=(PK.agiLvl||0)+1;}}
  ];
  // capped upgrades stop appearing once they're maxed out
  const pool=statAll.filter(o=>!o.capKey || PK[o.capKey]<(o.capMax||BARK_LVL_CAP))
    .map(o=>o.capKey ? {...o, fx:o.fx+" (LV "+((PK[o.capKey]||0)+1)+"/"+(o.capMax||BARK_LVL_CAP)+")"} : o);
  // rare chance of a big relic offer alongside the usual upgrades \u2014 never the one already equipped
  const candidates=PK_CHARMS.filter(c=>c.id!==PK.relic);
  if(candidates.length && Math.random()<0.4){
    const pick=candidates[Math.floor(Math.random()*candidates.length)];
    pool.push({n:"\u2b25 "+pick.name, ic:"relic", fx:pick.fx, c:pick.cost, relic:true,
      f:()=>{ pick.apply(); PK.relic=pick.id; tickTodo("j_collar"); }});
  }
  // rare chance to grow the park itself, up to a 4\u00d74 world
  if(PK.worldMult<8 && Math.random()<0.3){
    const next=Math.min(8,PK.worldMult+0.5);
    pool.push({n:"EXPAND THE PARK", ic:"expand", fx:"GROW WORLD TO "+next+"\u00d7"+next, c:Math.round(14+(PK.worldMult-4)*16), expand:true,
      f:()=>pkExpandPark()});
  }
  // the compass and Full Armour aren't in this rolled pool at all any more \u2014 see pkShopRows,
  // where they're two fixed slots flanking SKIP, visible in every shop from wave 1 on
  // wave 1's shop is everyone's first taste of it \u2014 a flat, cheap price on everything so a new
  // run always has enough bones banked to actually buy something after the very first clear
  if(PK.wave===2) pool.forEach(o=>o.c=10);
  const shuffled=pool.sort(()=>Math.random()-0.5);
  // sharpening the blade is offered at the top of every single wave while there are tiers left —
  // never rolled for, never priced down with the rest, so the upgrade path is always available
  if(PK.sword && PK.sword.state==="held" && PK.sword.tier<SWORD_MAX_TIER){
    const nt=PK.sword.tier+1;
    PK.shop=[{n:"SHARPEN THE BLADE", ic:"sword",
      fx:"TIER "+nt+"/"+SWORD_MAX_TIER+" — BIGGER, "+SWORD_DMG_T[nt-1]+" DMG",
      c:SWORD_UP_COST, f:()=>pkSwordUpgrade()}, ...shuffled.slice(0,2)];
  } else {
    PK.shop = shuffled.slice(0,3);
  }
  PK.shopSel = null;      // nothing is bought until it has been confirmed
  PK.joy=null;
}
function parkUpdate(dt){
  if(!PK.active) return;
  // one place catches every hit. Damage is dealt from nine scattered blocks below, several of
  // which bail out of the frame straight afterwards, so the buzz is triggered by watching the
  // health total across frames rather than by touching all nine.
  if(PK.hp<PK.hpSeen){ PK.hurtT=HURT_TIME; PK.shake=Math.max(PK.shake||0,0.22); }
  PK.hpSeen=PK.hp;
  if(PK.shop || PK.convertOpen || PK.friendsOpen || PK.gateAsk) return;   // world pauses while a panel is up
  // the sword's arrival and its collection each take the whole screen: nothing spawns, moves or
  // attacks until they finish, so the drop reads as an event rather than something happening in
  // the corner of a firefight
  if(PK.swordCine){ pkSwordCineUpdate(dt); return; }
  // the wave-ending send-off runs its own real-time clock while the world it is showing slows
  if(PK.waveOutro){ PK.waveOutro.t+=dt; dt*=pkOutroSlow(); }
  // exercise costs him something: DOGPARK deliberately sits outside the day/night clock
  // (tickStats no-ops while PK.active — see its own comment), so this is a small, self-contained
  // drain instead of unblocking that whole system mid-run. A real session leaves him noticeably
  // spent, so there's always something to come home and actually take care of.
  {
    const parkNm=S.senior?0.6:1;   // mirrors tickStats' own senior mercy factor
    S.energy=clamp(S.energy-0.15*parkNm*dt,0,100);
    S.hunger=clamp(S.hunger-0.06*parkNm*dt,0,100);
    S.thirst=clamp(S.thirst-0.10*parkNm*dt,0,100);
  }
  PK.t+=dt; PK.waveT+=dt;
  PK.exitNagT+=dt; PK.exitNagFlashT=Math.max(0,PK.exitNagFlashT-dt);
  PK.hurtT=Math.max(0,PK.hurtT-dt);
  if(PK.over>0){
    const f=clamp(PK.over/Math.max(1,pkOverCap()),0,1);
    PK.over=Math.max(0, PK.over-(OVER_DRAIN+OVER_DRAIN_SCALE*f)*dt);
    if(PK.over>0 && Math.random()<0.30){   // it visibly burns off him while it lasts
      const a5=Math.random()*6.283;
      SPARKS.push({x:PK.x+Math.cos(a5)*12, y:PK.y+Math.sin(a5)*10-8,
                   vx:Math.cos(a5)*10, vy:-24-Math.random()*20, life:0.3+Math.random()*0.2, gold:true});
    }
  }
  if(PK.regenT>0){
    PK.regenT=Math.max(0,PK.regenT-dt);
    PK.regenAcc+=REGEN_RATE*dt;
    while(PK.regenAcc>=1 && PK.hp<PK.maxhp){
      PK.regenAcc-=1; PK.hp=Math.min(PK.maxhp,PK.hp+1);
      PK.fx.push({x:PK.x+(Math.random()-0.5)*16, y:PK.y-18, txt:"+1", life:0.7});
      beep(1000,.03,"sine",.02);
    }
    if(PK.hp>=PK.maxhp) PK.regenAcc=0;
    PK.hpSeen=PK.hp;   // healing is not a hit
  }
  PK.chainT=Math.max(0,PK.chainT-dt); if(PK.chainT<=0) PK.chain=0;
  PK.inv=Math.max(0,PK.inv-dt); PK.pulse=Math.max(0,PK.pulse-dt);
  PK.zoomT=Math.max(0,PK.zoomT-dt);
  if(PK.waveBanner){ PK.waveBanner.life-=dt; if(PK.waveBanner.life<=0) PK.waveBanner=null; }
  if(PK.goldenBanner){ PK.goldenBanner.life-=dt; if(PK.goldenBanner.life<=0) PK.goldenBanner=null; }
  if(PK.shopFlash){ PK.shopFlash.life-=dt; if(PK.shopFlash.life<=0) PK.shopFlash=null; }
  for(let i=HITFX.length-1;i>=0;i--){ HITFX[i].life-=dt; if(HITFX[i].life<=0) HITFX.splice(i,1); }
  for(const e of PK.en){
    if(e.hitT>0) e.hitT-=dt;
    if(e.bounceT>0) e.bounceT=Math.max(0,e.bounceT-dt);   // spin/squash from an ape smash
  }
  for(let i=SPARKS.length-1;i>=0;i--){ const s=SPARKS[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.vy+=140*dt; s.life-=dt; if(s.life<=0) SPARKS.splice(i,1); }
  for(let i=PK.embers.length-1;i>=0;i--){ const em=PK.embers[i]; em.x+=em.vx*dt; em.y+=em.vy*dt; em.vy+=90*dt; em.life-=dt; if(em.life<=0) PK.embers.splice(i,1); }
  // a slow drift of leaves under the canopy — atmosphere for the grove, not gameplay, so it
  // only bothers spawning them for the grove BONES is actually near
  for(let i=PK.leaves.length-1;i>=0;i--){
    const lf=PK.leaves[i]; lf.y+=lf.vy*dt; lf.x+=Math.sin(lf.t*1.3+lf.ph)*7*dt; lf.t+=dt; lf.life-=dt;
    if(lf.life<=0) PK.leaves.splice(i,1);
  }
  const nearGrove=PK.groveCenters.find(g=>Math.hypot(wd(PK.x-g.x,PK.WW),wd(PK.y-g.y,PK.WH))<g.r*1.3);
  if(nearGrove && PK.leaves.length<22 && Math.random()<0.55){
    const a=Math.random()*6.283, r=Math.random()*nearGrove.r*0.9;
    PK.leaves.push({x:nearGrove.x+Math.cos(a)*r, y:nearGrove.y+Math.sin(a)*r*0.6-40,
                     vy:10+Math.random()*8, t:Math.random()*6, ph:Math.random()*6.283, life:4+Math.random()*2});
  }
  if(PK.scorch.length>90) PK.scorch.splice(0, PK.scorch.length-90);
  // hard ceilings on the particle pools. A burning grove full of squirrels can emit faster than
  // they expire, and an unbounded pool is both a draw cost and steady GC pressure; the oldest
  // motes are the ones already fading out, so dropping those is invisible.
  if(SPARKS.length>SPARK_CAP) SPARKS.splice(0, SPARKS.length-SPARK_CAP);
  if(PK.embers.length>EMBER_CAP) PK.embers.splice(0, PK.embers.length-EMBER_CAP);
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  if(!PK.started){
    PK.started=true;
    PK.WW=w*PK.worldMult; PK.WH=h*PK.worldMult;
    PK.gate={x:PK.WW*0.72, y:PK.WH*0.5};
    PK.x=PK.WW*0.25; PK.y=PK.WH*0.5;
    pkBuildBG(PK.WW,PK.WH);
    pkBuildTrees();
  }
  const WW=PK.WW, WH=PK.WH;
  // one rebuild per frame, up front, so every neighbourhood query this frame reads the same
  // consistent snapshot — bark, the sword, pal targeting, separation and the smash all share it
  pkBuildEnGrid(WW,WH);
  // one condition, reading the same counter the HUD shows: put the goal number of enemies down
  const waveClear = pkWaveDone()>=pkWaveGoal();
  // the kill that ends a wave earns a beat of its own — everything drops into slow motion and
  // the last one down tumbles away and fades before the shop takes over (see pkOutroSlow)
  if(waveClear && !PK.waveOutro){
    PK.waveOutro={t:0, hero:PK.lastDowned&&PK.lastDowned.fleeing?PK.lastDowned:null};
    if(PK.waveOutro.hero) PK.waveOutro.hero.heroOutro=true;
    PK.shake=Math.max(PK.shake||0,0.35);
    beep(1180,.1,"sine",.05,{prio:2});
    setTimeout(()=>beep(1580,.16,"sine",.045,{prio:2}),120);
    setTimeout(()=>beep(880,.4,"sine",.04,{prio:2}),300);
  }
  if(PK.waveOutro && PK.waveOutro.t<WAVE_OUTRO_DUR) return;   // hold the wave open for the send-off
  if(waveClear){
    if(PK.waveOutro){
      if(PK.waveOutro.hero) PK.waveOutro.hero.heroOutro=false;
      PK.waveOutro=null;
    }
    // survive the very first wave and it's a straight-up XP bonus
    if(PK.wave===1 && !PK.missionSurviveW1){
      PK.missionSurviveW1=true; pkAwardXP(10);
      pkFanfare(null,false,"\u2713 SURVIVED WAVE 1 \u2014 +10 XP");
    }
    // clear the wave within 60s and a charm slot unlocks in the shop; otherwise it shows
    // locked with a padlock and how far over 60s the clear took
    if(PK.waveT<=60){
      const cands=PK_CHARMS.filter(c=>c.id!==PK.relic);
      PK.speedBonus={unlocked:true, over:0, charm:cands.length?cands[Math.floor(Math.random()*cands.length)]:null};
    } else {
      PK.speedBonus={unlocked:false, over:Math.round(PK.waveT-60), charm:null};
    }
    if(PK.wave===10 && !S.dogParkPlusUnlocked){
      S.dogParkPlusUnlocked=true;
      setTimeout(()=>pkFanfare(null,true,"🏆 DOGPARK+ UNLOCKED!"),300);
    }
    tickStats(2.5, true);   // a cleared wave is 15 game minutes — the only time the park spends
    if(PK.bones>0) PK.exitNagFlashT=2.4;   // a fresh wave is exactly when it's easy to forget what you're carrying
    PK.waveT=0; PK.wave++;
    if(PK.wave>=3) tickTodo("j_wave3");
    PK.barkMax=Math.max(0.85,PK.barkMax-0.16); PK.barkR=Math.min(BARK_CAP,PK.barkR+5.5); PK.knock+=12;
    PK.waveQuota=pkWaveQuota(PK.wave); PK.waveSpawned=0; PK.waveKills=0; PK.lastDowned=null;
    // the golden bird visits every wave — except the one right after she was actually caught,
    // which sits out as her one wave of downtime before she's back
    if(PK.goldenSkipNext){ PK.goldenDone=true; PK.goldenSkipNext=false; }
    else PK.goldenDone=false;
    PK.goldenAt=3+Math.random()*8; PK.goldenWarned=false;
    if(PK.wave===6) pkSpawnAlphaSquad();
    // from wave 6 the types come mixed — that is the point of "you're on your own"
    if(PK.wave>=6){ PK.mixTypes=pkPickMixTypes(); PK.mixLabel=MIX_NAME[PK.mixTypes[0]]+" & "+MIX_NAME[PK.mixTypes[1]]; }
    if(PK.wave===APE_WAVE){ PK.apeKills=0; PK.apeWaveT=2.5; }
    // DOGPARK+ only: wave 2 opens with the sky handing him a weapon. Once the hole it leaves is
    // his, it widens every wave (pkSiteR reads PK.wave directly), and on wave 6 it stops being
    // scenery — from there the park burns for the rest of the run.
    if(PK.plusMode && PK.wave===SWORD_WAVE && !PK.sword && !PK.swordDone) pkSwordDrop();
    if(PK.swordSite && PK.wave>=HELL_WAVE && !PK.hell) pkHellOpen();
    // the roost that just satisfied the PREVIOUS wave's quota, and any stalking cats that came
    // with it, have done their job — clear them out UNLESS the new wave we just landed on
    // shares that same goal type, in which case leaving them be costs nothing (pkSideHazard
    // already excludes them from a quota) and saves the player fighting the same animal twice
    const nextHasBird = PK.wave===1 || PK.wave===2 || (PK.wave>=6 && PK.mixTypes && PK.mixTypes.includes("bird"));
    const nextHasCat  = PK.wave===3 || (PK.wave>=6 && PK.mixTypes && PK.mixTypes.includes("cat"));
    for(let i=PK.en.length-1;i>=0;i--){
      const e=PK.en[i];
      const keep = (e.roost && e.roost.killed>=e.roost.need) ? nextHasBird
                 : (e.stalk || e.stalkAggro)                 ? nextHasCat
                 : true;
      if(!keep) pkEnRemove(i);      // back to the pool rather than dropped on the floor
    }
    PK.waveBanner={text:"WAVE "+PK.wave, sub:pkWaveName(PK.wave), life:3.2, max:3.2};
    beep(500,.08);
    pkShopOpen();
  }
  // the healer keeps her own rolling clock, so she shows up more and more as the waves bite
  PK.healerT-=dt;
  if(PK.healerT<=0){ PK.healerT=pkHealerGap(); if(PK.fr.every(f=>f.golden)) pkSpawnHealer(); }
  // a Golden Axe-style heads-up a beat before she actually appears, so there's a real chance to
  // get in position rather than reacting cold to a 1.7s toast
  if(!PK.goldenWarned && PK.waveT>PK.goldenAt-1.3){
    PK.goldenWarned=true;
    PK.goldenBanner={text:"GOLDEN BIRD INCOMING", sub:"CATCH HER FOR THE ZOOMIES!", life:1.6, max:1.6};
    beep(700,.08); setTimeout(()=>beep(950,.09),90);
  }
  // one golden bird per stage — optional, never counts toward the wave quota
  if(!PK.goldenDone && PK.waveT>PK.goldenAt){
    PK.goldenDone=true;
    pkSpawnGoldenBird();
  }
  // WAVE 3 — the odd decorative bird swooping left to right
  if(PK.wave===3){
    PK.swoopT=(PK.swoopT||0)-dt;
    if(PK.swoopT<=0){ pkSpawnSwoopBird(); PK.swoopT=5+Math.random()*4; }
  }
  // WAVE 8 — apes keep dropping out of the trees in couples, far more often than the rare
  // fire-triggered spawn anywhere else, on top of whatever the normal mix spawner is sending
  if(PK.wave===APE_WAVE){
    PK.apeWaveT=(PK.apeWaveT||0)-dt;
    if(PK.apeWaveT<=0){ pkSpawnApeCouple(); PK.apeWaveT=7+Math.random()*3; }
  }
  PK.spawnT-=dt;
  const aliveNow=pkAliveCount(), maxAlive=pkMaxAlive();
  // starving: hurry the next batch along rather than waiting out the full interval
  if(aliveNow<pkMinAlive() && PK.waveSpawned<PK.waveQuota) PK.spawnT=Math.min(PK.spawnT,0.3);
  if(PK.spawnT<=0 && PK.waveSpawned<PK.waveQuota && !PK.waveOutro && aliveNow<maxAlive){
    const wv=PK.wave;
    if(wv===1){ PK.spawnT=5.5; PK.waveSpawned+=pkSpawnBirdGroup(); }             // CLEAR THE BIRDS: loose roosts, standing until disturbed
    else if(wv===2){ PK.spawnT=8; PK.waveSpawned+=pkSpawnFlock(); }              // BIRD BACKUP: long diagonal formations
    else if(wv===3){ PK.spawnT=4; PK.waveSpawned+=pkSpawnCatSquad(); }           // CAT BACKUP: direct cat squads
    else if(wv===4){ PK.spawnT=4.5; PK.waveSpawned+=pkSpawnRangerSquad(); }      // NUT THROWERS: ranged squirrels
    else if(wv===5){ PK.spawnT=5; PK.waveSpawned+=pkSpawnMadSquad(); }           // out of the trees: rotating-beam squirrels
    // wave 8's goal is apes specifically (the HUD says "N APES LEFT"), so the background mix
    // is thinned right down — the wave should be spent fighting the thing it is asking for
    else { PK.spawnT=pkMixInterval(PK.wave)*(PK.wave===APE_WAVE?2.4:1); PK.waveSpawned+=pkSpawnMixBurst(PK.mixTypes||pkPickMixTypes()); }   // mixed threats, wave 6+
  }
  // idle-gap safety net: something nearby (any enemy — a standing bird flock counts, it's still
  // a "bad guy" to find, it just doesn't have to be attacking — a friend, a powerup, or the NPC)
  // resets this countdown. If it ever empties out for IDLE_GRACE seconds, force this wave's own
  // spawner to fire right now rather than waiting out the rest of its normal interval, so a run
  // of bad luck between scheduled bursts never leaves the player alone for long.
  {
    const IDLE_GRACE=5, presenceR=Math.max(w,h)*0.8;
    const hasPresence =
      PK.en.some(e=>!e.fleeing && Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH))<presenceR) ||
      PK.fr.some(f=>Math.hypot(wd(f.x-PK.x,WW),wd(f.y-PK.y,WH))<presenceR) ||
      PK.powerups.some(pu=>Math.hypot(wd(pu.x-PK.x,WW),wd(pu.y-PK.y,WH))<presenceR) ||
      Math.hypot(wd(PK.npc.x*WW-PK.x,WW),wd(PK.npc.y*WH-PK.y,WH))<presenceR;
    PK.idleT = hasPresence ? 0 : (PK.idleT||0)+dt;
    if(PK.idleT>=IDLE_GRACE && PK.waveSpawned<PK.waveQuota){
      const wv=PK.wave;
      if(wv===1) PK.waveSpawned+=pkSpawnBirdGroup();
      else if(wv===2) PK.waveSpawned+=pkSpawnFlock();
      else if(wv===3) PK.waveSpawned+=pkSpawnCatSquad();
      else if(wv===4) PK.waveSpawned+=pkSpawnRangerSquad();
      else if(wv===5) PK.waveSpawned+=pkSpawnMadSquad();
      else PK.waveSpawned+=pkSpawnMixBurst(PK.mixTypes||pkPickMixTypes());
      PK.idleT=0; PK.spawnT=Math.max(PK.spawnT,1.5);   // don't also let the normal timer double-fire right after
    }
  }
  let mx=0,my=0;
  if(PK.joy){ mx=PK.joy.dx; my=PK.joy.dy; }
  if(Math.hypot(mx,my)>0.1){ const l=Math.hypot(mx,my), sp2=PK.spd*(PK.over>0?OVER_SPEED:1); PK.vx=mx/l*sp2; PK.vy=my/l*sp2; }
  else { PK.vx*=0.8; PK.vy*=0.8; }
  PK.x=(PK.x+PK.vx*dt+WW)%WW;
  PK.y=(PK.y+PK.vy*dt+WH)%WH;
  [PK.x,PK.y]=pkTreeCollide(PK.x,PK.y);
  pkTickTrees(dt);
  PK.barkCd-=dt;
  if((PK.barkCd<=0||PK.zoomT>0) && PK.en.some(e=>!e.fleeing && Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH))<PK.barkR+pkHitR(e))) pkBark();
  if(PK.zoomT>0 && Math.random()<0.55){
    const sa=Math.random()*6.283;
    SPARKS.push({x:PK.x+Math.cos(sa)*14, y:PK.y+Math.sin(sa)*14-10, vx:Math.cos(sa)*18, vy:Math.sin(sa)*18-30, life:0.35+Math.random()*0.25, gold:true});
  }
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    e.kx*=0.88; e.ky*=0.88;
    if(e.fleeing){
      e.shockT=Math.max(0,e.shockT-dt);
      if(e.explodeT!==undefined) e.explodeT=Math.max(0,e.explodeT-dt);
      if(e.shockT<=0){
        e.x=(e.x+e.fleeVx*dt+WW)%WW; e.y=(e.y+e.fleeVy*dt+WH)%WH;
        e.dir = e.fleeVx<0 ? -1 : 1;
        e.fleeT+=dt;
      }
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      if(e.fleeT>FLEE_TIME) pkEnRemove(i);
      continue;
    }
    // WAVE 1 — a roost bird standing dead still until BONES gets close, then it scatters
    // (still alive and hittable — killing it mid-scatter works exactly like any other kill)
    if(e.standing){
      const dxw0=wd(PK.x-e.x,WW), dyw0=wd(PK.y-e.y,WH), d0=Math.hypot(dxw0,dyw0)||1;
      if(d0<STANDING_SPOOK_R){
        e.standing=false; e.spooked=true; e.spookT=0;
        const jit=0.8+Math.random()*0.4;
        e.spookVx=-dxw0/d0*SPOOK_SPEED*jit; e.spookVy=-dyw0/d0*SPOOK_SPEED*jit;
        beep(700+Math.random()*200,.04,"square",.02);
      } else {
        e.ft+=dt; if(e.ft>0.2){ e.ft=0; e.fi++; }
        continue;
      }
    }
    if(e.spooked){
      e.spookT+=dt;
      e.x=(e.x+e.spookVx*dt+WW)%WW; e.y=(e.y+e.spookVy*dt+WH)%WH;
      e.dir = e.spookVx<0 ? -1 : 1;
      e.ft+=dt; if(e.ft>0.1){ e.ft=0; e.fi++; }
      // settles back down instead of vanishing — stays in the world, ready to spook again if approached
      if(e.spookT>SPOOK_LIFE){ e.spooked=false; e.standing=true; e.spookVx=0; e.spookVy=0; }
      continue;
    }
    // WAVES 1-2 — a stalking cat circling a bird flock until BONES gets close, then aggroes
    // for good (leaps in, then keeps chasing — no calming back down)
    if(e.stalk){
      const dxw0=wd(PK.x-e.x,WW), dyw0=wd(PK.y-e.y,WH), d0=Math.hypot(dxw0,dyw0)||1;
      if(d0<STALK_AGGRO_R){
        e.stalk=false; e.stalkAggro=true; e.windT=STALK_WIND; e.leapT=0;
        beep(160,.09,"square",.05);
      } else {
        e.orbitAng+=STALK_ORBIT_SPEED*dt;
        const tx=e.anchorX+Math.cos(e.orbitAng)*STALK_ORBIT_R, ty=e.anchorY+Math.sin(e.orbitAng)*STALK_ORBIT_R*0.6;
        const tdx=wd(tx-e.x,WW), tdy=wd(ty-e.y,WH), tdd=Math.hypot(tdx,tdy)||1;
        const mvx=tdx/tdd*30, mvy=tdy/tdd*30;
        e.dir = mvx<0 ? -1 : 1;
        e.x=(e.x+mvx*dt+WW)%WW; e.y=(e.y+mvy*dt+WH)%WH;
        e.ft+=dt; if(e.ft>0.2){ e.ft=0; e.fi++; }
        continue;
      }
    }
    if(e.stalkAggro){
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH), d=Math.hypot(dxw,dyw)||1;
      if(e.windT>0){
        // crouch first. The leap commits to wherever BONES was when the crouch ended, so
        // a player who reads the tell and moves is genuinely missed.
        e.windT-=dt;
        e.dir = dxw<0 ? -1 : 1;
        if(e.windT<=0){
          e.leapT=STALK_LEAP_TIME;
          e.lvx=dxw/d*STALK_LEAP_SPEED; e.lvy=dyw/d*STALK_LEAP_SPEED;
          beep(220,.06,"square",.05);
        }
      } else if(e.leapT>0){
        e.leapT-=dt;
        e.x=(e.x+e.lvx*dt+WW)%WW; e.y=(e.y+e.lvy*dt+WH)%WH;
        e.dir = e.lvx<0 ? -1 : 1;
      } else {
        const [ux3,uy3]=pkSteer(e,e.x,e.y,dxw/d,dyw/d); const sx=ux3*STALK_CHASE_SPD, sy=uy3*STALK_CHASE_SPD;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
      }
      e.ft+=dt; if(e.ft>0.1){ e.ft=0; e.fi++; }
      if(d<14 && PK.inv<=0 && !pkInvuln()){
        pkHurt(8); PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
        beep(110,.12,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
      }
      continue;
    }
    // WAVE 2 — a dozing sentry squirrel: stays put until BONES wanders close, then wakes
    // up and joins the normal chase-and-bite behaviour below
    // WAVE 3 — decorative swoop bird: straight line, no attack, times out on its own
    if(e.swoop && !e.stormForm){    // the wave-3 fly-past only — never a diving storm bird
      e.x=(e.x+e.vx*dt+WW)%WW;
      e.life-=dt;
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      if(e.life<=0){ pkEnRemove(i); }
      continue;
    }
    // WAVE 4 — NUT THROWERS: approach to a comfortable range, plant, wind up, then lob a nut
    if(e.ranger){
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH), d=Math.hypot(dxw,dyw)||1;
      if(e.atkState==="approach"){
        if(d>RANGER_PLANT_R){
          const [ux2,uy2]=pkSteer(e,e.x,e.y,dxw/d,dyw/d); const sx=ux2*e.sp, sy=uy2*e.sp;
          e.dir = sx<0 ? -1 : 1;
          e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        } else {
          // in range — keeps circling him at that range instead of freezing on the spot the
          // instant it's close enough to throw, so it reads as actively hunting, not planted
          const perpx=-dyw/d, perpy=dxw/d, strafe=e.sp*0.55;
          e.x=(e.x+perpx*strafe*(e.strafeDir||1)*dt+WW)%WW;
          e.y=(e.y+perpy*strafe*(e.strafeDir||1)*dt+WH)%WH;
          e.dir = dxw<0 ? -1 : 1;
          e.atkCd-=dt;
          if(e.atkCd<=0){ e.atkState="windup"; e.windT=RANGER_WINDUP; }
        }
      } else if(e.atkState==="windup"){
        e.dir = dxw<0 ? -1 : 1;
        e.windT-=dt;
        if(e.windT<=0){
          PK.nuts.push({x:e.x,y:e.y,vx:dxw/d*NUT_SPEED,vy:dyw/d*NUT_SPEED,life:2.6});
          e.atkState="approach"; e.atkCd=RANGER_THROW_CD;
          beep(520,.06,"square",.03,{prio:0});
        }
      }
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      if(d<14 && PK.inv<=0 && !pkInvuln()){
        pkHurt(6); PK.inv=0.6; e.kx=-dxw/d*200; e.ky=-dyw/d*200;
        beep(110,.12,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
      }
      continue;
    }
    // WAVE 5 — MAD SQUIRRELS: seek, root and charge a red glow, then sweep a rotating beam
    // for a full 3s (glowing red the whole time), then self-destruct in a satisfying pop —
    // whether or not it ever landed a hit
    if(e.madsq){
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH), d=Math.hypot(dxw,dyw)||1;
      if(e.laserState==="seek"){
        const [ux2,uy2]=pkSteer(e,e.x,e.y,dxw/d,dyw/d); const sx=ux2*e.sp, sy=uy2*e.sp;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        e.cd-=dt;
        const firing=PK.en.reduce((a,o)=>a+((o.madsq&&!o.fleeing&&(o.laserState==="charge"||o.laserState==="sweep"))?1:0),0);
        if(e.cd<=0 && d<pkLaserRange()*0.8 && firing<pkMadsqCap()){
          e.laserState="charge"; e.chargeT=0; e.aimAng=Math.atan2(dyw,dxw);
        }
        if(d<14 && PK.inv<=0 && !pkInvuln()){
          pkHurt(8); PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
        }
      } else if(e.laserState==="charge"){
        e.chargeT+=dt;
        e.x=(e.x+e.kx*dt+WW)%WW; e.y=(e.y+e.ky*dt+WH)%WH;
        // it tracks you early in the wind-up, then locks and holds dead still for the last
        // MADSQ_LOCK seconds — that frozen aim line is the tell
        if(e.chargeT < MADSQ_CHARGE-MADSQ_LOCK) e.aimAng=Math.atan2(dyw,dxw);
        if(e.chargeT>=MADSQ_CHARGE){
          e.laserState="sweep"; e.sweepT=0;
          e.aimBase=e.aimAng;                                  // fires where it was pointing
          e.aimErr=(Math.random()-0.5)*MADSQ_AIM_ERR;          // and they are lousy shots
          e.aimAng=e.aimBase+e.aimErr;
          pkBlastSfx();
        }
      } else if(e.laserState==="sweep"){
        e.sweepT+=dt;
        // the anchor creeps toward the player, but only so fast — outrun it and the beam trails you
        const want=Math.atan2(dyw,dxw), off=wd(want-e.aimBase,6.283);
        e.aimBase += clamp(off,-MADSQ_TRACK_RATE*dt,MADSQ_TRACK_RATE*dt);
        e.aimAng = e.aimBase + e.aimErr + Math.sin(e.sweepT*MADSQ_SWEEP_RATE)*MADSQ_SWEEP_ARC;
        e.dir = Math.cos(e.aimAng)<0 ? -1 : 1;
        const ux=Math.cos(e.aimAng), uy=Math.sin(e.aimAng);
        e.kx-=ux*MADSQ_RECOIL*dt; e.ky-=uy*MADSQ_RECOIL*dt;   // kicked back by their own blast
        e.x=(e.x+e.kx*dt+WW)%WW; e.y=(e.y+e.ky*dt+WH)%WH;     // rooted, but the kick still slides them
        // find whatever the beam actually reaches FIRST — a tree, BONES, or another animal —
        // so it visibly stops there instead of lancing on through to the next thing in line
        const blk=pkBeamBlocker(e.x,e.y,e.aimAng,pkLaserRange());
        const along=dxw*ux+dyw*uy, perp=Math.abs(dxw*uy-dyw*ux);
        let stopDist=blk.dist;
        if(along>0 && perp<MADSQ_WIDTH && along<stopDist) stopDist=along;
        for(const o of PK.en){
          if(o===e || o.fleeing) continue;
          const odx=wd(o.x-e.x,WW), ody=wd(o.y-e.y,WH);
          const oa=odx*ux+ody*uy, op=Math.abs(odx*uy-ody*ux);
          if(oa>10 && op<MADSQ_WIDTH && oa<stopDist) stopDist=oa;
        }
        e.beamLen=stopDist;
        if(blk.tree && blk.dist<=stopDist+0.5){   // the tree is what it actually reached this frame
          pkIgniteTree(blk.tree);
          if(Math.random()<0.25) PK.embers.push({x:e.x+ux*blk.dist, y:e.y+uy*blk.dist, vx:(Math.random()-0.5)*40, vy:-30-Math.random()*50, life:0.6});
        }
        if(along>0 && along<=stopDist+0.5 && perp<MADSQ_WIDTH && PK.inv<=0 && !pkInvuln()){
          pkHurt(MADSQ_DMG); PK.inv=0.55;
          PK.x=(PK.x+ux*MADSQ_KNOCK*dt*6+WW)%WW; PK.y=(PK.y+uy*MADSQ_KNOCK*dt*6+WH)%WH;
          PK.vx=ux*90; PK.vy=uy*90;
          PK.shake=0.5;
          PK.scorch.push({x:PK.x, y:PK.y, r:16+Math.random()*8});
          beep(140,.2,"sawtooth",.07); if(PK.hp<=0) return pkDeath();
        }
        // the beam still hits indiscriminately, but only whatever it actually reaches first —
        // not everything strung out along the same line behind it
        for(const o of PK.en){
          if(o===e || o.fleeing) continue;
          const odx=wd(o.x-e.x,WW), ody=wd(o.y-e.y,WH);
          const oa=odx*ux+ody*uy, op=Math.abs(odx*uy-ody*ux);
          if(oa>10 && oa<=stopDist+0.5 && op<MADSQ_WIDTH){
            o.burnT=(o.burnT||0)+dt;
            if(o.burnT>0.28){
              o.burnT=0;
              o.hp-=MADSQ_FF_DMG;
              o.kx=ux*MADSQ_KNOCK*1.6; o.ky=uy*MADSQ_KNOCK*1.6;
              PK.embers.push({x:o.x, y:o.y, vx:(Math.random()-0.5)*60, vy:-40-Math.random()*40, life:0.5});
              if(o.hp<=0){
                pkDownEnemy(o,ux,uy,{shockT:0.3});
                PK.scorch.push({x:o.x, y:o.y, r:12+Math.random()*6});
                beep(120,.16,"sawtooth",.05,{prio:0});
              }
            }
          }
        }
        if(e.sweepT>=MADSQ_SWEEP_TIME){
          // it burns itself out finishing the sweep — still an enemy off the field, so it still
          // counts, and a wave can never stall on one that killed itself
          pkDownEnemy(e,0,0,{shockT:0, fleeSpeed:0});
          e.madsqExplode=true; e.explodeT=0.5;
          beep(90,.3,"sawtooth",.08);
          continue;
        }
      }
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      continue;
    }
    // WAVE 6 — THE ALPHAS: slow approach, then a gigantic, heavily telegraphed leap once
    // close enough, dealing a big hit, on a long cooldown
    if(e.alpha){
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH), d=Math.hypot(dxw,dyw)||1;
      if(e.leapState==="windup"){
        e.dir = dxw<0 ? -1 : 1;
        e.leapWindT-=dt;
        if(e.leapWindT<=0){
          e.leapState="leap"; e.leapActT=ALPHA_LEAP_TIME;
          e.lvx=Math.cos(e.leapAng)*ALPHA_LEAP_SPEED; e.lvy=Math.sin(e.leapAng)*ALPHA_LEAP_SPEED;
        }
      } else if(e.leapState==="leap"){
        e.leapActT-=dt;
        e.x=(e.x+e.lvx*dt+WW)%WW; e.y=(e.y+e.lvy*dt+WH)%WH;
        e.dir = e.lvx<0 ? -1 : 1;
        if(e.leapActT<=0){ e.leapState=null; e.leapCd=ALPHA_LEAP_CD; }
        if(d<20 && PK.inv<=0 && !pkInvuln()){
          pkHurt(ALPHA_LEAP_DMG); PK.inv=0.7; e.kx=-dxw/d*260; e.ky=-dyw/d*260;
          beep(140,.3,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
        }
      } else {
        const [ux2,uy2]=pkSteer(e,e.x,e.y,dxw/d,dyw/d); const sx=ux2*e.sp, sy=uy2*e.sp;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        e.leapCd-=dt;
        if(e.leapCd<=0 && d<ALPHA_LEAP_R){ e.leapState="windup"; e.leapWindT=0.6; e.leapAng=Math.atan2(dyw,dxw); }
        if(d<16 && PK.inv<=0 && !pkInvuln()){
          pkHurt(14); PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
        }
      }
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      continue;
    }
    // FIRE BOSS — a huge ape: stands and roars for a beat after arriving, then its main
    // attack is a long-range leap. It commits to a fixed landing point the instant the leap
    // begins (wherever BONES was standing then) — not a live homing missile — and telegraphs
    // it the whole time it's airborne with a ground shadow and danger ring that crawl toward
    // that point while the ape itself arcs high overhead. Reading the shadow and moving off it
    // is the dodge; standing still in it is not. It only bites on contact when already adjacent.
    if(e.t==="ape"){
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH), d=Math.hypot(dxw,dyw)||1;
      if(e.introT>0){
        e.introT-=dt; e.dir = dxw<0 ? -1 : 1;
        continue;
      }
      if(e.landT>0) e.landT=Math.max(0,e.landT-dt);
      if(e.leapState==="windup"){
        e.dir = dxw<0 ? -1 : 1;
        e.leapWindT-=dt;
        if(e.leapWindT<=0){
          // commit now: the landing point is BONES' position at this instant, fixed for the
          // whole flight — but capped to APE_LEAP_MAXR, so a target that's genuinely too far
          // away gets a leap that lands short of them rather than one flung at absurd speed
          // to cover the full raw distance in the same capped duration
          const dist=clamp(d,10,APE_LEAP_MAXR), scale=dist/d;
          e.leapDur=clamp(dist/APE_LEAP_SPEED, APE_LEAP_TMIN, APE_LEAP_TMAX);
          e.leapActT=e.leapDur;
          e.leapStartX=e.x; e.leapStartY=e.y;
          e.leapDX=dxw*scale; e.leapDY=dyw*scale;
          e.leapState="leap";
        }
      } else if(e.leapState==="leap"){
        e.leapActT-=dt;
        const prog=clamp(1-e.leapActT/e.leapDur,0,1);
        e.x=(e.leapStartX+e.leapDX*prog+WW)%WW;
        e.y=(e.leapStartY+e.leapDY*prog+WH)%WH;
        e.dir = e.leapDX<0 ? -1 : 1;
        if(e.leapActT<=0){
          e.leapState=null; e.leapCd=APE_LEAP_CD; e.landT=APE_LAND_TIME;
          PK.scorch.push({x:e.x, y:e.y, r:APE_SLAM_R*0.5});
          beep(65,.35,"sawtooth",.1,{prio:2});
          const ldx=wd(PK.x-e.x,WW), ldy=wd(PK.y-e.y,WH), ld=Math.hypot(ldx,ldy)||1;
          if(ld<APE_SLAM_R && PK.inv<=0 && !pkInvuln()){
            pkHurt(APE_SLAM_DMG); PK.inv=0.9; PK.shake=0.8;
            PK.vx=ldx/ld*220; PK.vy=ldy/ld*220;
            beep(120,.3,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
          }
          // destructive landing: anything with cover in the slam radius gets launched
          // outward, tumbling away, and destroyed — a satisfying payoff for a slam that
          // connects near the trees, whatever state they're in
          for(const tr of PK.trees){
            if(tr.knockT>0) continue;
            const tdx=wd(tr.x-e.x,WW), tdy=wd(tr.y-e.y,WH), td=Math.hypot(tdx,tdy)||1;
            if(td<APE_SLAM_R){
              tr.quakeT=0; tr.knockT=TREE_KNOCK_TIME; tr.knockMax=TREE_KNOCK_TIME;
              tr.knockX0=tr.x; tr.knockY0=tr.y;
              const flingDist=TREE_KNOCK_DIST*(0.7+Math.random()*0.6);
              tr.knockDX=tdx/td*flingDist; tr.knockDY=tdy/td*flingDist;
              tr.knockRot=0; tr.knockRotV=(Math.random()<0.5?-1:1)*(7+Math.random()*5);
            }
          }
        }
      } else {
        // a heavy, not-fully-in-control charge: it aims a little behind a fast-moving target
        // (so outrunning it is actually possible), turns toward that at a limited rate, and
        // only spins up to full speed once it's actually facing roughly the right way — so
        // overrunning a target that cuts away and having to wheel back around actually happens
        const tx=PK.x-PK.vx*APE_AIM_LAG, ty=PK.y-PK.vy*APE_AIM_LAG;
        const ldx=wd(tx-e.x,WW), ldy=wd(ty-e.y,WH);
        const [ux2,uy2]=pkSteer(e,e.x,e.y,ldx/(Math.hypot(ldx,ldy)||1),ldy/(Math.hypot(ldx,ldy)||1));
        const wantAng=Math.atan2(uy2,ux2);
        const angDiff=wd(wantAng-e.heading,6.283);
        e.heading+=clamp(angDiff,-APE_TURN_RATE*dt,APE_TURN_RATE*dt);
        const align=Math.cos(angDiff);
        const targetSpd=e.sp*clamp(align,0.05,1);
        e.spdCur+=clamp(targetSpd-e.spdCur,-APE_ACCEL*dt,APE_ACCEL*dt);
        const sx=Math.cos(e.heading)*e.spdCur, sy=Math.sin(e.heading)*e.spdCur;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        // stomping dust when it's really moving, so the charge reads as heavy and out of control
        if(e.spdCur>e.sp*0.55 && Math.random()<0.3){
          PK.embers.push({x:e.x, y:e.y+8, vx:(Math.random()-0.5)*20, vy:-8-Math.random()*10, life:0.25+Math.random()*0.2, dust:true});
        }
        // once hell has it, the ground it covers keeps burning behind it
        if(e.hellish && e.spdCur>e.sp*0.25){
          for(let i=0;i<2;i++){
            PK.embers.push({x:e.x+(Math.random()-0.5)*12, y:e.y+6+(Math.random()-0.5)*6,
              vx:(Math.random()-0.5)*22, vy:-22-Math.random()*30, life:0.45+Math.random()*0.45});
          }
          if(Math.random()<0.18) PK.scorch.push({x:e.x, y:e.y+4, r:9+Math.random()*7});
        }
        e.leapCd-=dt;
        // the leap is the primary attack — it fires on cooldown whenever not already adjacent,
        // regardless of exactly how far away BONES is (long range is the point)
        if(e.leapCd<=0 && d>APE_LEAP_MINR){ e.leapState="windup"; e.leapWindT=APE_WINDUP; }
        if(d<20 && PK.inv<=0 && !pkInvuln()){
          pkHurt(APE_TOUCH_DMG); PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth",.04,{prio:2}); if(PK.hp<=0) return pkDeath();
        }
      }
      e.ft+=dt; if(e.ft>0.14){ e.ft=0; e.fi++; }
      continue;
    }
    if(e.flock){
      // straight-line flight, no homing — if it'd fly clean out of the fray, rubber-band
      // the heading back toward the player's area instead of leaving
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH);
      const d=Math.hypot(dxw,dyw)||1;
      const leash=Math.max(w,h)*0.9;
      if(d>leash){
        const ang2=Math.atan2(dyw,dxw)+(Math.random()-0.5)*0.5;
        e.vx=Math.cos(ang2)*e.sp; e.vy=Math.sin(ang2)*e.sp;
      }
      e.dir = e.vx<0 ? -1 : 1;
      e.ph+=dt*6;
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      e.x=(e.x+(e.vx+e.kx)*dt+WW)%WW;
      e.y=(e.y+(e.vy+e.ky)*dt+WH)%WH;
      if(d<14 && PK.inv<=0 && !pkInvuln()){
        pkHurt(10); PK.inv=0.6;   // +25% over the original 8, matching the flock's own buff
        e.kx=-dxw/d*220; e.ky=-dyw/d*220;
        beep(110,.12,"sawtooth");
        if(PK.hp<=0) return pkDeath();
      }
      continue;
    }
    if(e.stormForm){
      if(e.swoopWindT>0){
        // locked onto BONES and about to dive: it hangs almost in place, shuddering — the red
        // flash (drawn generically off e.swoopWindT>0, same as any other windup) plus this beat
        // of near-stillness IS the player's reaction window before the real, fast dive begins
        e.swoopWindT-=dt;
        e.orbitAng+=e.orbitSpd*dt*2.4;
        e.vx=Math.sin(performance.now()/45+e.ph)*26; e.vy=Math.cos(performance.now()/55+e.ph)*16;
        e.dir = wd(PK.x-e.x,WW)<0 ? -1 : 1;
        e.ph+=dt*14;
        e.ft+=dt; if(e.ft>0.07){ e.ft=0; e.fi++; }
        e.x=(e.x+e.vx*dt+WW)%WW; e.y=(e.y+e.vy*dt+WH)%WH;
        if(e.swoopWindT<=0){ e.diving=true; PK.shake=Math.max(PK.shake||0,0.14); beep(300,.07,"sawtooth",.05); }
        continue;
      }
      if(!e.diving){
        // just swirling — ambient, no threat at all — until its cooldown is up and fewer than
        // STORM_SWIRL_MAX_ACTIVE birds are already mid-dive or already telegraphing one
        e.swoopCd-=dt;
        e.orbitAng+=e.orbitSpd*dt;
        const tx=PK.x+Math.cos(e.orbitAng)*e.orbitR, ty=PK.y+Math.sin(e.orbitAng)*e.orbitR*0.6;
        e.vx=(tx-e.x)*2; e.vy=(ty-e.y)*2;
        e.dir=e.vx<0?-1:1;
        e.ph+=dt*5;
        e.ft+=dt; if(e.ft>0.14){ e.ft=0; e.fi++; }
        e.x=(e.x+e.vx*dt+WW)%WW; e.y=(e.y+e.vy*dt+WH)%WH;
        if(e.swoopCd<=0){
          const activeSwoops=PK.en.reduce((a,o)=>a+(o.stormForm&&(o.diving||o.swoopWindT>0)?1:0),0);
          if(activeSwoops<STORM_SWIRL_MAX_ACTIVE){ e.swoopWindT=STORM_SWOOP_WINDUP; e.swoopCd=99; }
          else e.swoopCd=0.5+Math.random()*0.7;
        }
        continue;
      }
      // swooping: a real dive, homing on BONES — dangerous, and barkable, for the length of the dive
      const dxw2=wd(PK.x-e.x,WW), dyw2=wd(PK.y-e.y,WH), d2=Math.hypot(dxw2,dyw2)||1;
      e.vx=dxw2/d2*e.sp; e.vy=dyw2/d2*e.sp;
      e.dir=e.vx<0?-1:1;
      e.ph+=dt*12;
      e.ft+=dt; if(e.ft>0.08){ e.ft=0; e.fi++; }
      e.x=(e.x+(e.vx+e.kx)*dt+WW)%WW;
      e.y=(e.y+(e.vy+e.ky)*dt+WH)%WH;
      const maxR=Math.max(w,h)*0.95;
      if(d2<14 && PK.inv<=0 && !pkInvuln()){
        pkHurt(10); PK.inv=0.6;
        e.kx=-dxw2/d2*350; e.ky=-dyw2/d2*350;   // a hard shove — he flinches and bolts from the dive
        beep(130,.14,"sawtooth"); toast("A BIRD DIVES — BONES BOLTS!",1);
        if(PK.hp<=0) return pkDeath();
        e.diving=false; e.swoopCd=2+Math.random()*3; e.orbitAng=Math.atan2(e.y-PK.y,e.x-PK.x); e.orbitR=maxR*0.44;
      } else if(d2>maxR){
        // flew clean past — rejoin the swirl for another pass rather than vanishing off-map
        e.diving=false; e.swoopCd=1.2+Math.random()*2; e.orbitAng=Math.atan2(e.y-PK.y,e.x-PK.x); e.orbitR=maxR*0.44;
      }
      continue;
    }
    if(e.vForm){
      // a real dive: homes on BONES instead of flying a fixed line, closing fast — the assault
      const dxw2=wd(PK.x-e.x,WW), dyw2=wd(PK.y-e.y,WH), d2=Math.hypot(dxw2,dyw2)||1;
      e.vx=dxw2/d2*e.sp; e.vy=dyw2/d2*e.sp;
      e.dir=e.vx<0?-1:1;
      e.ph+=dt*10;
      e.ft+=dt; if(e.ft>0.1){ e.ft=0; e.fi++; }
      e.x=(e.x+(e.vx+e.kx)*dt+WW)%WW;
      e.y=(e.y+(e.vy+e.ky)*dt+WH)%WH;
      if(d2<14 && PK.inv<=0 && !pkInvuln()){
        pkHurt(12); PK.inv=0.6;
        e.kx=-dxw2/d2*220; e.ky=-dyw2/d2*220;
        beep(110,.12,"sawtooth");
        if(PK.hp<=0) return pkDeath();
      }
      continue;
    }
    const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH);
    const d=Math.hypot(dxw,dyw)||1;
    let sx=dxw/d*e.sp, sy=dyw/d*e.sp;
    if(e.t==="bird"){ e.ph+=dt*6; sy+=Math.sin(e.ph)*40; }
    e.dir = sx<0 ? -1 : 1;
    e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
    e.x=(e.x+(sx+e.kx)*dt+WW)%WW;
    e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
    if(d<14 && PK.inv<=0 && !pkInvuln()){
      pkHurt(e.t==="bird"?10:8); PK.inv=0.6;   // birds hit 25% harder than the shared baseline
      e.kx=-dxw/d*220; e.ky=-dyw/d*220;
      beep(110,.12,"sawtooth");
      if(PK.hp<=0) return pkDeath();
    }
  }
  pkSeparate(dt,WW,WH);
  pkHuntPlayer(dt,WW,WH);
  pkRecycleStragglers(dt,WW,WH);
  pkPalsUpdate(dt,WW,WH);
  pkPalDamage(dt,WW,WH);
  if(PK.sword && PK.sword.state==="planted") pkSwordPlantedUpdate(dt);
  else if(PK.sword && PK.sword.state==="held") pkSwordHeldUpdate(dt);
  if(PK.hell) pkHellUpdate(dt);
  // the bandana dog: stand near him to shop, and you have to actually walk away before he'll
  // talk again — the world is frozen while the panel is up, so a bare radius test would reopen
  // it the instant it closed. Never while another panel owns the taps.
  {
    const nx=PK.npc.x*WW, ny=PK.npc.y*WH;
    const nd=Math.hypot(wd(nx-PK.x,WW),wd(ny-PK.y,WH));
    if(nd>NPC_REARM_R) PK.friendsArm=true;
    if(nd<NPC_TALK_R && PK.friendsArm && !PK.shop && !PK.convertOpen && !PK.friendsOpen){
      PK.friendsOpen=true; PK.friendsArm=false;
      beep(560,.06); setTimeout(()=>beep(720,.06),80);
    }
  }
  for(let i=PK.fr.length-1;i>=0;i--){
    const f=PK.fr[i];
    f.x=(f.x+f.vx*dt+WW)%WW; f.life-=dt;
    if(Math.hypot(wd(f.x-PK.x,WW),wd(f.y-PK.y,WH))<20){
      if(f.golden){ pkGain(20,f.x,f.y); pkZoomies(); PK.goldenSkipNext=true; }
      else {
        // she doesn't patch you up, she puts you right back together
        PK.hp=PK.maxhp;
        pkGain(9,f.x,f.y);
        S.mood=clamp(S.mood+2,0,100);
        toast("A FRIEND! FULLY HEALED ♥",1);
        beep(660,.07); setTimeout(()=>beep(880,.07),80); setTimeout(()=>beep(1040,.1),160);
      }
      PK.fr.splice(i,1); continue;
    }
    if(f.life<=0){
      if(f.golden){ toast("THE GOLDEN BIRD GOT AWAY"); beep(260,.16,"sawtooth",.05); }
      PK.fr.splice(i,1);
    }
  }
  // thrown nuts — simple straight-line projectiles from ranger/mad squirrels
  for(let i=PK.nuts.length-1;i>=0;i--){
    const n=PK.nuts[i];
    n.x=(n.x+n.vx*dt+WW)%WW; n.y=(n.y+n.vy*dt+WH)%WH; n.life-=dt;
    if(n.life<=0){ PK.nuts.splice(i,1); continue; }
    if(n.pal){
      // a friendly nut is drawn in a different colour and can never touch BONES
      const sp=Math.hypot(n.vx,n.vy)||1;
      let spent=false;
      for(const e of PK.en){
        if(e.fleeing) continue;
        if(Math.hypot(wd(e.x-n.x,WW),wd(e.y-n.y,WH))<13){
          pkPalHit(e,n.dmg||PAL_NUT_DMG,n.vx/sp,n.vy/sp);
          spent=true; break;
        }
      }
      if(spent) PK.nuts.splice(i,1);
      continue;
    }
    if(Math.hypot(wd(n.x-PK.x,WW),wd(n.y-PK.y,WH))<12 && PK.inv<=0 && !pkInvuln()){
      pkHurt(10); PK.inv=0.6; beep(140,.15,"sawtooth");
      PK.nuts.splice(i,1);
      if(PK.hp<=0) return pkDeath();
      continue;
    }
    let hitPal=false;
    for(const p of PK.pals){
      if(p.k==="bird") continue;
      if(Math.hypot(wd(n.x-p.x,WW),wd(n.y-p.y,WH))<12){
        p.hp-=6; beep(180,.08,"square",.03,{prio:0}); hitPal=true; break;
      }
    }
    if(hitPal){ PK.nuts.splice(i,1); continue; }
  }
  for(const a of PK.acts){
    a.cd=Math.max(0,a.cd-dt);
    if(a.cd<=0 && Math.hypot(wd(a.x*WW-PK.x,WW),wd(a.y*WH-PK.y,WH))<22){
      a.cd=pkAgiCd(); PK.sideDone++;
      const heal=Math.max(1,Math.round(PK.maxhp*pkAgiHeal()));
      const before=PK.hp; PK.hp=Math.min(PK.maxhp,PK.hp+heal);
      let got=Math.round(PK.hp-before), over=0, arm=0;
      if(heal-got>0.5){                   // already full: the rest banks as a shield
        let spill=heal-(PK.hp-before);
        // if he's bought Full Armour, the same overflow tops that up first — but each hit of
        // the course is worth a little less to it than the last, so it can't just be farmed
        // for infinite armour; whatever the diminishing rate doesn't use falls through to the
        // ordinary shield exactly as before
        if(PK.armorUnlocked && PK.armor<pkArmorCap()){
          const rate=Math.max(0.15, 1-(PK.armorFeedCount||0)*0.15);
          const feed=Math.min(pkArmorCap()-PK.armor, spill*rate);
          if(feed>0.05){ PK.armor+=feed; PK.armorFeedCount=(PK.armorFeedCount||0)+1; arm=Math.round(feed); spill-=feed; }
        }
        if(spill>0.5){
          const ob=PK.over; PK.over=Math.min(pkOverCap(), PK.over+spill);
          over=Math.round(PK.over-ob);
        }
      }
      PK.fx.push({x:a.x*WW, y:a.y*WH-16,
                  txt: arm>0 ? "+"+arm+" ARMOUR" : over>0 ? "+"+over+" SHIELD" : got>0 ? "+"+got+" HP" : "FULL", life:1.2});
      for(let k=0;k<8;k++){
        const ang=Math.random()*6.283, sp=30+Math.random()*50;
        SPARKS.push({x:a.x*WW,y:a.y*WH-8,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp-20,life:0.5+Math.random()*0.4,heal:true});
      }
      beep(700,.06); setTimeout(()=>beep(940,.07),70);
    }
  }
  if(PARKGHOST && Math.hypot(wd(PARKGHOST.x-PK.x,WW),wd(PARKGHOST.y-PK.y,WH))<18){
    PK.bones+=PARKGHOST.bones;
    PK.fx.push({x:PK.x,y:PK.y-22,txt:"+"+PARKGHOST.bones+" RECOVERED",life:1.4});
    PARKGHOST=null;
    for(let i=0;i<14;i++) pkSpawn(w,h);   // they smelled it
    toast("BONES RECOVERED \u2014 BUT THEY SMELLED IT.",1);
    beep(140,.3,"sawtooth");
  }
  for(let i=PK.fx.length-1;i>=0;i--){ PK.fx[i].life-=dt; if(PK.fx[i].life<=0) PK.fx.splice(i,1); }
  for(let i=PK.drops.length-1;i>=0;i--){
    const dr=PK.drops[i];
    dr.life-=dt;
    if(dr.life<=0){ PK.drops.splice(i,1); continue; }
    if(dr.magnet){   // homes toward the player once the magnet powerup has been picked up
      const mdx=wd(PK.x-dr.x,WW), mdy=wd(PK.y-dr.y,WH), mdd=Math.hypot(mdx,mdy)||1;
      dr.x=(dr.x+mdx/mdd*MAGNET_HOMING_SPEED*dt+WW)%WW;
      dr.y=(dr.y+mdy/mdd*MAGNET_HOMING_SPEED*dt+WH)%WH;
    }
    const sniffR=SNIFF_BASE+SNIFF_STEP*(PK.sniffLvl||0);
    const pickR=PICKUP_BASE+SNIFF_STEP*0.35*(PK.sniffLvl||0);
    const sdx=wd(PK.x-dr.x,WW), sdy=wd(PK.y-dr.y,WH), sdd=Math.hypot(sdx,sdy)||1;
    if(!dr.magnet && sdd<sniffR){       // in sniffing range: the bone rolls his way
      const pull=SNIFF_PULL*(1-sdd/sniffR)*dt;
      dr.x=(dr.x+sdx/sdd*pull+WW)%WW;
      dr.y=(dr.y+sdy/sdd*pull+WH)%WH;
    }
    if(Math.hypot(wd(dr.x-PK.x,WW),wd(dr.y-PK.y,WH))<pickR){
      pkGain(dr.v, dr.x, dr.y);            // chain ticks per pickup — route efficiency pays
      beep(dr.gold?900:640,.06);
      PK.drops.splice(i,1);
    }
  }
  for(let i=PK.powerups.length-1;i>=0;i--){
    const p=PK.powerups[i];
    p.life-=dt;
    if(p.life<=0){ PK.powerups.splice(i,1); continue; }
    if(Math.hypot(wd(p.x-PK.x,WW),wd(p.y-PK.y,WH))<POWERUP_PICKUP_R){
      if(p.type==="regen"){
        PK.regenT+=REGEN_DURATION;   // a second one extends the drip rather than wasting it
        pkFanfare(null,true,"✚ REGEN — +1 HP EVERY SECOND!");
        beep(680,.09); setTimeout(()=>beep(880,.09),90); setTimeout(()=>beep(1100,.12),180);
      } else {
        for(const dr of PK.drops) dr.magnet=true;
        pkFanfare(null,true,"🧲 MAGNET — BONES INCOMING!");
        beep(820,.1); setTimeout(()=>beep(600,.1),90);
      }
      PK.powerups.splice(i,1);
    }
  }
  {
    const gd=Math.hypot(wd(PK.gate.x-PK.x,WW),wd(PK.gate.y-PK.y,WH));
    if(gd>70) PK.gateArm=true;                 // you have to actually walk away before it re-asks
    if(gd<26 && PK.gateArm && !PK.gateAsk){
      PK.gateArm=false; PK.gateAsk=true;
      beep(520,.06);
      openChoice("LEAVE THE PARK?",
        "YOU'RE CARRYING "+PK.bones+" BONES.<br><br>BANK THEM AND HEAD HOME, OR STAY IN<br>AND KEEP GOING?",
        "BANK "+PK.bones+" & LEAVE", ()=>{ PK.gateAsk=false; pkBank(); },
        "STAY IN", ()=>{ PK.gateAsk=false; });
    }
  }
}
function pkExitCosts(){
  S.energy=clamp(S.energy-12,0,100); S.clean=clamp(S.clean-8,0,100);
}
function pkDeath(){
  PK.active=false;
  const lost=Math.round(PK.bones*0.9), kept=PK.bones-lost;
  if(lost>0) PARKGHOST={x:PK.x,y:PK.y,bones:lost + (PARKGHOST?PARKGHOST.bones:0)};
  const earned=pkAwardXP(Math.round(pkRunXP()*0.5));   // dying costs you half of what the run actually earned
  pkExitCosts(); S.fun=clamp(S.fun+10,0,100);
  $("#resTitle").textContent="OVERRUN AT THE PARK"; $("#resTitle").style.color="#f22";
  $("#resPortrait").src=PORTRAITS.sad; $("#resPortraitWrap").classList.add("show");
  $("#resScore").textContent=kept+" BONES";
  const leftBehind = lost>0 ? "<br>YOU LEFT YOUR BONES BEHIND." : "";
  $("#resLines").innerHTML="90% OF HIS BONES ("+lost+") LIE WHERE HE FELL.<br>"+PK.kills+" DOWNED, "+PK.sideDone+" SIDE OBJECTIVES \u2014 "+earned+" XP MADE IT HOME.<br>NEXT VISIT: GO CLAIM THE REST \u2014 IF YOU DARE."+leftBehind;
  $("#result").classList.add("show");
  beep(140,.3,"sawtooth");
  setTimeout(()=>pkReveal(kept,earned,"death"),400);
}
function pkBank(){
  PK.active=false;
  const g=PK.bones;
  const earned=pkAwardXP(pkRunXP());
  LVLFX = earned>0 ? 1.2 : 0;
  pkExitCosts(); S.fun=clamp(S.fun+20,0,100); S.mood=clamp(S.mood+8,0,100);
  $("#resTitle").textContent="XP BANKED"; $("#resTitle").style.color="#fff";
  $("#resPortrait").src = PORTRAITS.content;   // pkReveal takes it from here, building to HAPPY as the pile grows
  $("#resPortraitWrap").classList.add("show");
  $("#resScore").textContent=g+" BONES";
  const rawXP=Math.round(PK.kills*XP_PER_KILL + PK.sideDone*XP_PER_SIDE);
  const capNote = rawXP>earned ? "<br>XP CAPPED AT "+XP_RUN_CAP+" A RUN." : "";
  $("#resLines").innerHTML="WAVE "+PK.wave+" REACHED.<br>"+PK.kills+" DOWNED, "+PK.sideDone+" SIDE OBJECTIVES."+capNote+"<br>A GOOD DAY AT THE PARK.";
  $("#result").classList.add("show");
  beep(660,.1); setTimeout(()=>beep(880,.1),100); setTimeout(()=>beep(1170,.14),200);
  setTimeout(()=>pkReveal(g,earned,"bank"),500);
}
function drawEnemyVector(ctx,e,ex,ey){
  ctx.strokeStyle="#fff"; ctx.fillStyle="#000"; ctx.lineWidth=2;
  if(e.t==="sq"){
    ctx.fillRect(ex-5,ey-4,10,8); ctx.strokeRect(ex-5,ey-4,10,8);
    ctx.beginPath(); ctx.arc(ex-8,ey-6,4,0,7); ctx.stroke();
  } else if(e.t==="bird"){
    ctx.beginPath(); ctx.moveTo(ex-7,ey-3); ctx.lineTo(ex,ey+3); ctx.lineTo(ex+7,ey-3); ctx.stroke();
  } else {
    ctx.fillRect(ex-6,ey-5,12,10); ctx.strokeRect(ex-6,ey-5,12,10);
  }
  ctx.fillStyle="#f22"; ctx.fillRect(ex+1,ey-3,2,2);
}
function drawLaserFX(ctx,e,sx,sy){
  const eyeX=sx+(e.dir<0?-4:4), eyeY=sy-11;
  if(e.laserState==="charge"){
    const p=clamp(e.chargeT/MADSQ_CHARGE,0,1);
    // the wind-up: eye blows up white-hot and drags motes inward
    ctx.save();
    ctx.globalAlpha=0.25+0.45*p; ctx.fillStyle="#f22";
    ctx.beginPath(); ctx.arc(eyeX,eyeY,4+p*16,0,7); ctx.fill();
    ctx.globalAlpha=1; ctx.fillStyle=p>0.7?"#fff":"#ffb347";
    ctx.beginPath(); ctx.arc(eyeX,eyeY,1.5+p*5,0,7); ctx.fill();
    ctx.strokeStyle="rgba(255,120,60,"+(0.4+0.5*p)+")"; ctx.lineWidth=1.5;
    for(let i=0;i<5;i++){
      const a=e.aimAng+(i-2)*0.5, r0=(1-p)*34+12;
      ctx.beginPath();
      ctx.moveTo(eyeX+Math.cos(a)*r0, eyeY+Math.sin(a)*r0);
      ctx.lineTo(eyeX+Math.cos(a)*(r0+7), eyeY+Math.sin(a)*(r0+7));
      ctx.stroke();
    }
    ctx.restore();
  } else if(e.laserState==="sweep"){
    const ang=e.aimAng, range=e.beamLen||pkLaserRange();
    const ux=Math.cos(ang), uy=Math.sin(ang), px=-uy, py=ux;
    const ex=eyeX+ux*range, ey=eyeY+uy*range;
    const t=performance.now()/1000;
    const pulse=0.85+0.15*Math.sin(t*40);
    ctx.save(); ctx.lineCap="round";
    // outer bloom -> hot orange -> white core: a fat, overexposed anime beam
    ctx.globalAlpha=0.30; ctx.strokeStyle="#ff5a1e"; ctx.lineWidth=MADSQ_WIDTH*2.6*pulse;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.globalAlpha=0.65; ctx.strokeStyle="#ff9d2e"; ctx.lineWidth=MADSQ_WIDTH*1.5*pulse;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.globalAlpha=1; ctx.strokeStyle="#fff7e0"; ctx.lineWidth=MADSQ_WIDTH*0.62*pulse;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.strokeStyle="#fff"; ctx.lineWidth=MADSQ_WIDTH*0.22;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    // arcing crackle spitting off the shaft
    ctx.strokeStyle="rgba(255,240,190,.85)"; ctx.lineWidth=1.6;
    for(let i=0;i<7;i++){
      const f=((i*0.19)+(t*1.1)%1)%1, d0=f*range;
      const off=(Math.sin(t*33+i*2.2))*MADSQ_WIDTH*0.9;
      ctx.beginPath();
      ctx.moveTo(eyeX+ux*d0+px*off*0.3, eyeY+uy*d0+py*off*0.3);
      ctx.lineTo(eyeX+ux*(d0+9)+px*off, eyeY+uy*(d0+9)+py*off);
      ctx.stroke();
    }
    // impact head: shockwave rings and a spray of sparks where it lands
    const ip=0.6+0.4*Math.sin(t*26);
    ctx.globalAlpha=0.55; ctx.fillStyle="#ff7a2e";
    ctx.beginPath(); ctx.arc(ex,ey,MADSQ_WIDTH*1.5*ip,0,7); ctx.fill();
    ctx.globalAlpha=1; ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(ex,ey,MADSQ_WIDTH*0.62*ip,0,7); ctx.fill();
    ctx.strokeStyle="rgba(255,180,90,.8)"; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.arc(ex,ey,MADSQ_WIDTH*2.1*ip,0,7); ctx.stroke();
    for(let i=0;i<6;i++){
      const a=t*7+i*1.05, r=MADSQ_WIDTH*(1.4+Math.abs(Math.sin(t*12+i))*1.5);
      ctx.strokeStyle="rgba(255,220,150,.9)"; ctx.lineWidth=1.8;
      ctx.beginPath();
      ctx.moveTo(ex+Math.cos(a)*MADSQ_WIDTH*0.5, ey+Math.sin(a)*MADSQ_WIDTH*0.5);
      ctx.lineTo(ex+Math.cos(a)*r, ey+Math.sin(a)*r);
      ctx.stroke();
    }
    ctx.restore();
  }
}
// scorched ground left behind by beams and burnt-out trees
// a big, unmissable event banner — pops in, holds, lifts and fades. Shared by the wave-transition
// banner (red) and the golden-bird heads-up (gold) so both "something important is happening"
// moments read as the same visual language instead of two competing UI treatments
function pkDrawBanner(ctx,w,h,banner,color){
  if(!banner) return;
  const {text,sub,life,max}=banner, el=max-life;
  const inP=Math.min(1,el/0.35), outP=Math.min(1,life/0.8);
  const alpha=Math.min(inP,outP), rise=(1-outP)*h*0.05;
  // lower-middle of the play area, not the top-middle — the old spot sat right over Bones and
  // the action; this way a wave/golden-bird banner never blocks the fight it's announcing
  const band=sub?h*0.22:h*0.15, top=h*0.90-band-rise;
  ctx.save(); ctx.globalAlpha=alpha;
  ctx.fillStyle="rgba(0,0,0,.68)"; ctx.fillRect(0,top,w,band);
  ctx.strokeStyle=color; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,top); ctx.lineTo(w,top);
  ctx.moveTo(0,top+band); ctx.lineTo(w,top+band); ctx.stroke();
  ctx.textAlign="center";
  ctx.fillStyle="#fff"; ctx.font="14px 'Press Start 2P',monospace";
  ctx.fillText(text, w/2, top+(sub?band*0.36:band*0.62));
  if(sub){
    // long taglines wrap rather than running off a phone screen
    ctx.fillStyle=color; ctx.font="8px 'Press Start 2P',monospace";
    const words=sub.split(" "); const lines=[]; let cur="";
    for(const wd2 of words){
      const trial=cur?cur+" "+wd2:wd2;
      if(ctx.measureText(trial).width > w-28 && cur){ lines.push(cur); cur=wd2; } else cur=trial;
    }
    if(cur) lines.push(cur);
    lines.forEach((ln,i)=>ctx.fillText(ln, w/2, top+band*0.64+i*12));
  }
  ctx.textAlign="left";
  ctx.restore();
}
// safe-exit reminder: a small non-blocking pill that nags whenever bones are actually at risk —
// carrying some, and far enough from the gate that the BANK/STAY prompt (see parkUpdate's gate
// check) isn't already up doing the same job. Gets a brighter, faster pulse right after a wave
// clears (easiest moment to forget what you're holding) or once the pile gets big.
function pkDrawExitNag(ctx,w,h){
  if(!PK.active || PK.bones<=0 || PK.shop || PK.convertOpen || PK.friendsOpen || PK.gateAsk) return;
  const gd=Math.hypot(wd(PK.gate.x-PK.x,PK.WW), wd(PK.gate.y-PK.y,PK.WH));
  if(gd<180) return;
  const urgent = PK.bones>=40 || PK.exitNagFlashT>0;
  const period = urgent ? 2.0 : 4.5;
  const pulse = 0.5+0.5*Math.sin(PK.exitNagT*(2*Math.PI/period));
  const alpha = SETTINGS.reduceMotion ? 0.85 : 0.45+0.55*pulse;
  const txt = "⚠ "+PK.bones+" BONES AT RISK — BANK AT THE EXIT";
  ctx.save();
  ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
  const tw=ctx.measureText(txt).width, padX=10, pillW=tw+padX*2, pillH=18, px=w/2-pillW/2, py=8;
  ctx.globalAlpha=alpha;
  ctx.fillStyle="#000"; ctx.fillRect(px,py,pillW,pillH);
  ctx.strokeStyle="#f22"; ctx.lineWidth=2; ctx.strokeRect(px,py,pillW,pillH);
  ctx.fillStyle="#f22"; ctx.fillText(txt, w/2, py+pillH*0.68);
  ctx.globalAlpha=1; ctx.textAlign="left";
  ctx.restore();
}
// COMPASS powerup: a small pulsing edge-arrow pointing at something off-screen. Once it's
// actually in view there's nothing left to point at, so the arrow just doesn't draw.
function pkDrawCompassArrow(ctx,w,h,DX,DY,SC,t,tx,ty,label,color){
  const [mx,my]=SC(tx,ty);
  if(mx>-30&&mx<w+30&&my>-30&&my<h+30) return;
  const ang=Math.atan2(my-DY,mx-DX);
  const R=Math.min(w,h)/2;
  const ex=DX+Math.cos(ang)*(R-42), ey=DY+Math.sin(ang)*(R-42);
  const pulse=0.4+0.5*Math.abs(Math.sin(t*4));
  ctx.save(); ctx.translate(ex,ey); ctx.rotate(ang);
  ctx.strokeStyle=color; ctx.globalAlpha=pulse; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,-6); ctx.lineTo(-6,6); ctx.closePath(); ctx.stroke();
  ctx.restore();
  const lx=DX+Math.cos(ang)*(R-60), ly=DY+Math.sin(ang)*(R-60);
  ctx.fillStyle=color; ctx.globalAlpha=pulse; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText(label, lx, ly); ctx.textAlign="left"; ctx.globalAlpha=1;
}
function pkDrawScorch(ctx,DX,DY,WW,WH,w,h){
  for(const sc of PK.scorch){
    const x=DX+wd(sc.x-PK.x,WW), y=DY+wd(sc.y-PK.y,WH);
    if(x<-60||x>w+60||y<-60||y>h+60) continue;
    ctx.save(); ctx.globalAlpha=0.5; ctx.fillStyle="#140f0a";
    ctx.beginPath(); ctx.ellipse(x,y,sc.r,sc.r*0.55,0,0,7); ctx.fill();
    ctx.globalAlpha=0.3; ctx.fillStyle="#2b211a";
    ctx.beginPath(); ctx.ellipse(x,y,sc.r*0.6,sc.r*0.33,0,0,7); ctx.fill();
    ctx.restore();
  }
}
// A dense grove can put 500+ ordinary standing trees on screen at once, and each one used to cost
// ~9 separate canvas draws (shadow, trunk fill+stroke, 3 canopy arcs each fill+stroke) — with
// hundreds in view that alone was ~25ms/frame. A healthy, non-burning tree's shape never actually
// changes frame to frame beyond a ±1.4px canopy sway, so it's baked once into a small offscreen
// canvas per (wood/ambient x sway-phase) combination and blitted with a single drawImage from then
// on. Only the ash/burning/quaking/flying states — rare, and never more than a handful at once —
// still fall through to the live per-frame draw below.
const TREE_SPRITE_PHASES=4, TREE_SPRITE_AX=30, TREE_SPRITE_AY=50;
let TREE_SPRITES=null;
function pkBuildTreeSprite(wood,sway){
  const c=document.createElement("canvas"); c.width=60; c.height=64;
  const ctx=c.getContext("2d");
  const x=TREE_SPRITE_AX, y=TREE_SPRITE_AY;
  ctx.fillStyle="rgba(0,0,0,.32)";
  ctx.beginPath(); ctx.ellipse(x,y+4,TREE_R*0.9,TREE_R*0.36,0,0,7); ctx.fill();
  ctx.fillStyle="#4a3520"; ctx.strokeStyle="#0a0806"; ctx.lineWidth=2.5;
  ctx.fillRect(x-5,y-21,10,21); ctx.strokeRect(x-5,y-21,10,21);
  const cy=y-31, cs=wood?1.16:1;
  ctx.fillStyle="#37782f"; ctx.strokeStyle="#0a1a0c"; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(x+sway,cy,TREE_R*cs,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x-TREE_R*0.55*cs+sway,cy+5,TREE_R*0.62*cs,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+TREE_R*0.55*cs+sway,cy+5,TREE_R*0.62*cs,0,7); ctx.fill(); ctx.stroke();
  return c;
}
function pkTreeSprites(){
  if(TREE_SPRITES) return TREE_SPRITES;
  TREE_SPRITES=[[],[]];
  for(let wood=0;wood<2;wood++) for(let p=0;p<TREE_SPRITE_PHASES;p++){
    const sway=(-1.4+2.8*p/(TREE_SPRITE_PHASES-1));
    TREE_SPRITES[wood].push(pkBuildTreeSprite(!!wood,sway));
  }
  return TREE_SPRITES;
}
function pkDrawTree(ctx,tr,x,y,t){
  const burning=tr.state==="fire", ash=tr.state==="ash";
  const quaking=tr.quakeT>0;
  const flying0=tr.knockT>0;
  if(!burning && !ash && !quaking && !flying0){
    // the fast path: a plain standing tree, blitted from cache instead of hand-drawn
    const sprites=pkTreeSprites(), phase=clamp(Math.round((Math.sin(tr.sway)*1.4+1.4)/2.8*(TREE_SPRITE_PHASES-1)),0,TREE_SPRITE_PHASES-1);
    const img=sprites[tr.wood?1:0][phase];
    ctx.drawImage(img, x-TREE_SPRITE_AX, y-TREE_SPRITE_AY);
    return;
  }
  const flying=tr.knockT>0;
  let flyP=0;
  if(flying){
    // launched by an ape's landing: arcs outward while tumbling end over end, fading out
    // just before it comes down for good
    flyP=clamp(1-tr.knockT/tr.knockMax,0,1);
    const arcH=Math.sin(flyP*Math.PI)*TREE_KNOCK_ARC;
    x+=tr.knockDX*flyP; y+=tr.knockDY*flyP-arcH;
  }
  if(quaking){
    // the whole burning tree trembles harder the closer it gets to actually bursting open, with
    // a warm glow building underneath it on top of its own flames — the tell that its occupant
    // is about to erupt out before the fire finishes it off
    const qp=1-clamp(tr.quakeT/tr.quakeMax,0,1);
    const amp=1+qp*3.5;
    x+=(Math.random()-0.5)*amp; y+=(Math.random()-0.5)*amp*0.6;
    ctx.save();
    const R=TREE_R*(2.1+qp*1.7);
    const glowA=0.16+qp*0.34+Math.sin(t*(9+qp*18))*0.05;
    const grad=ctx.createRadialGradient(x,y,0,x,y,R);
    grad.addColorStop(0,   `rgba(255,150,40,${glowA})`);
    grad.addColorStop(0.55,`rgba(255,90,20,${glowA*0.45})`);
    grad.addColorStop(1,   "rgba(255,60,10,0)");
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.ellipse(x,y,R,R*0.55,0,0,7); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if(flying){
    ctx.translate(x,y); ctx.rotate(tr.knockRot||0); ctx.translate(-x,-y);
    ctx.globalAlpha*=1-clamp((flyP-0.65)/0.35,0,1)*0.7;
  }
  ctx.fillStyle="rgba(0,0,0,.32)";
  ctx.beginPath(); ctx.ellipse(x,y+4,TREE_R*0.9,TREE_R*0.36,0,0,7); ctx.fill();
  if(ash){
    // burnt out: a stump in a heap of ash, no cover left
    ctx.fillStyle="#3a332c";
    ctx.beginPath(); ctx.ellipse(x,y,TREE_R*0.95,TREE_R*0.4,0,0,7); ctx.fill();
    ctx.fillStyle="#575049";
    ctx.beginPath(); ctx.ellipse(x-2,y-1,TREE_R*0.55,TREE_R*0.22,0,0,7); ctx.fill();
    ctx.fillStyle="#241d18"; ctx.fillRect(x-3,y-11,6,11);
    ctx.strokeStyle="#100c09"; ctx.lineWidth=1.4; ctx.strokeRect(x-3,y-11,6,11);
    if(Math.floor(t*2)%2){   // last wisps of smoke
      ctx.strokeStyle="rgba(150,150,150,.35)"; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(x,y-12); ctx.lineTo(x-3,y-22); ctx.stroke();
    }
    ctx.restore(); return;
  }
  const sway=Math.sin(tr.sway)*(burning?3:1.4);
  ctx.fillStyle=burning?"#2a1a0e":"#4a3520";
  ctx.strokeStyle="#0a0806"; ctx.lineWidth=2.5;
  ctx.fillRect(x-5,y-21,10,21); ctx.strokeRect(x-5,y-21,10,21);
  const cy=y-31;
  ctx.fillStyle=burning?"#5a3212":"#37782f";
  ctx.strokeStyle="#0a1a0c"; ctx.lineWidth=2.5;
  // grove trees spread their canopy a smidge fuller than an ambient tree — purely a render
  // scale on the foliage, trunk and collision are untouched
  const cs=tr.wood?1.16:1;
  ctx.beginPath(); ctx.arc(x+sway,cy,TREE_R*cs,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x-TREE_R*0.55*cs+sway,cy+5,TREE_R*0.62*cs,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+TREE_R*0.55*cs+sway,cy+5,TREE_R*0.62*cs,0,7); ctx.fill(); ctx.stroke();
  if(burning){
    // roaring flames: layered licks that flicker independently, plus rising heat specks
    const f=tr.fireT;
    for(let i=0;i<11;i++){
      const seed=i*2.31;
      const ph=(t*3.1+seed)%1;
      const fx=x+sway+Math.sin(t*7+seed)*TREE_R*0.85;
      const base=cy+TREE_R*0.5;
      const fy=base-ph*(TREE_R*2.4);
      const sz=(1-ph)*(5+((i%3)*2.6));
      ctx.globalAlpha=0.85*(1-ph);
      ctx.fillStyle = ph<0.3 ? "#fff3c4" : ph<0.6 ? "#ffae24" : "#f2400f";
      ctx.beginPath();
      ctx.moveTo(fx,fy-sz*1.7); ctx.lineTo(fx+sz*0.8,fy); ctx.lineTo(fx,fy+sz*0.5); ctx.lineTo(fx-sz*0.8,fy);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha=0.30; ctx.fillStyle="#ff6a12";
    ctx.beginPath(); ctx.arc(x+sway,cy,TREE_R*(1.7+0.18*Math.sin(t*11)),0,7); ctx.fill();
    ctx.globalAlpha=1;
    for(let i=0;i<5;i++){
      const seed=i*4.7, ph=(t*1.5+seed)%1;
      ctx.globalAlpha=0.8*(1-ph);
      ctx.fillStyle="#ffd06a";
      ctx.fillRect(x+sway+Math.sin(t*4+seed)*TREE_R, cy-ph*TREE_R*4.2, 2, 2);
    }
    ctx.globalAlpha=1;
    // burn-down gauge so you can see how long the cover has left
    const p=1-clamp(f/TREE_BURN_TIME,0,1);
    ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(x-14,y+7,28,4);
    ctx.fillStyle="#f2400f"; ctx.fillRect(x-13,y+8,26*p,2);
  }
  ctx.restore();
}
function drawMadsqExplosion(ctx,sx,sy,explodeT){
  const p=1-clamp(explodeT/0.5,0,1), r=6+p*22;
  ctx.save(); ctx.globalAlpha=1-p;
  ctx.fillStyle="#ffb347";
  ctx.beginPath(); ctx.arc(sx,sy-8,r*0.6,0,7); ctx.fill();
  ctx.strokeStyle="#f22"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(sx,sy-8,r,0,7); ctx.stroke();
  ctx.restore();
}
function drawEnemyHP(ctx,e,sx,sy,eh){
  // only surfaces once an enemy has taken a hit — untouched enemies stay clean/uncluttered
  if(!e.hpMax || e.hpMax<=1 || e.hp>=e.hpMax || e.fleeing) return;
  const bw=16, bh=3, bx=sx-bw/2, by=sy-eh-7;
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillRect(bx-1,by-1,bw+2,bh+2);
  ctx.strokeStyle="#fff"; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bw-1,bh-1);
  const frac=clamp(e.hp/e.hpMax,0,1);
  ctx.fillStyle = frac<0.4 ? "#f22" : "#fff";
  ctx.fillRect(bx+1,by+1,(bw-2)*frac,bh-2);
}
// the fire boss uses its own frame set (idle/run/jump), not the generic cycle-through-every-
// frame scheme drawEnemy uses for everything else, so it gets its own draw path entirely
function drawApe(ctx,e,sx,sy){
  // the wave-ending kill stays at full strength through its send-off instead of instantly
  // dimming to the usual scuttling-away ghost
  const ghost = e.heroOutro ? 1 : (e.fleeing ? 0.34 : 1);
  ctx.save(); ctx.globalAlpha*=ghost;
  ctx.fillStyle="rgba(0,0,0,.32)";
  ctx.beginPath(); ctx.ellipse(sx, sy+5, 15.5, 4.5, 0, 0, 7); ctx.fill();
  if(e.leapState==="windup" && Math.floor(performance.now()/80)%2){
    ctx.fillStyle="#f22"; ctx.beginPath(); ctx.arc(sx, sy-45, 3, 0, 7); ctx.fill();
  }
  let prog=0, lift=0;
  if(e.leapState==="leap"){
    prog=clamp(1-e.leapActT/e.leapDur,0,1);
    lift=Math.sin(prog*Math.PI)*APE_ARC_H;
    // the actual danger zone: a dark landing shadow plus a pulsing ring at true hit radius,
    // both sat at (sx,sy) — the real ground/impact position the leap is crawling toward —
    // while the ape itself is drawn lifted well above it. This is what to dodge, not the sprite.
    ctx.save(); ctx.globalAlpha*=0.5;
    ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(sx, sy, APE_SLAM_R*0.85, APE_SLAM_R*0.4, 0, 0, 7); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha*=0.4+0.35*Math.sin(performance.now()/65);
    ctx.strokeStyle="#f33"; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, APE_SLAM_R, APE_SLAM_R*0.5, 0, 0, 7); ctx.stroke();
    ctx.restore();
  }
  if(e.landT>0){
    // the shockwave ring from the slam, expanding out to the true hit radius then gone
    const p=1-clamp(e.landT/APE_LAND_TIME,0,1);
    ctx.save(); ctx.globalAlpha*=(1-p)*0.75; ctx.strokeStyle="#ffb347"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(sx, sy, APE_SLAM_R*Math.max(0.05,p), 0, 7); ctx.stroke();
    ctx.restore();
  }
  let img, running=false;
  if(e.introT>0) img = APEIMG.idle[0];
  else if(e.leapState==="windup") img = APEIMG.jump[0];
  else if(e.leapState==="leap") img = prog<0.4 ? APEIMG.jump[0] : APEIMG.jump[1];
  else if(e.landT>0) img = APEIMG.jump[2];
  else { img = APEIMG.run[Math.floor(e.fi)%APEIMG.run.length]; running=true; }
  if(!img || !img.complete || !img.naturalWidth){ ctx.restore(); return; }
  const eh=38, ew=eh*img.naturalWidth/img.naturalHeight;
  const dy=sy-lift+(running?APE_RUN_GROUND_FIX:0);
  if(lift>1){
    // a small ground contact shadow keeps drifting under it while it's lifted, distinct from
    // the big dark landing-zone ellipse already drawn above at the true impact point
    ctx.save(); ctx.globalAlpha*=0.25*(lift/APE_ARC_H);
    ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(sx, sy+5, 11, 3.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  if(e.hellish){
    // a furnace burning inside it, bright enough to light the ground it stands on
    const hp2=0.6+0.4*Math.sin(performance.now()/90+(e.ph||0));
    ctx.save();
    const hg=ctx.createRadialGradient(sx,dy-eh*0.45,0,sx,dy-eh*0.45,eh*1.15);
    hg.addColorStop(0,"rgba(255,140,40,"+(0.42*hp2).toFixed(3)+")");
    hg.addColorStop(0.55,"rgba(220,40,10,"+(0.22*hp2).toFixed(3)+")");
    hg.addColorStop(1,"rgba(140,10,0,0)");
    ctx.fillStyle=hg;
    ctx.beginPath(); ctx.ellipse(sx,dy-eh*0.45,eh*1.15,eh*1.05,0,0,7); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(e.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage(e.hellish ? pkTinted(img,"hell","sepia(1) saturate(9) hue-rotate(-32deg) brightness(1.1) contrast(1.25)") : img, sx-ew/2, dy-eh, ew, eh);
  ctx.restore();
  if(e.hellish){
    // molten eyes, and horns of flame licking off its shoulders
    ctx.save();
    ctx.globalAlpha=0.55+0.45*Math.sin(performance.now()/70);
    ctx.fillStyle="#ffe27a";
    ctx.fillRect(sx-(e.dir<0?7:3)-1, dy-eh*0.82, 3, 2.6);
    ctx.fillRect(sx+(e.dir<0?-3:4), dy-eh*0.82, 3, 2.6);
    ctx.restore();
  }
  if(e.hitT>0){
    ctx.save(); ctx.globalAlpha=Math.min(1,e.hitT/0.22)*0.85;
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.ellipse(sx, dy-eh*0.5, ew*0.5, eh*0.5, 0,0,7); ctx.fill();
    ctx.restore();
  }
  if(e.introT>0 && Math.floor(performance.now()/150)%2){
    // its home just burned — a beat of red-hot frustration glaring at the wreckage before it
    // turns that on you
    ctx.fillStyle="#f22"; ctx.font="bold 15px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("!", sx, dy-eh-8); ctx.textAlign="left";
  }
  drawEnemyHP(ctx,e,sx,dy,eh);
  ctx.restore();
}
/* Canvas ctx.filter is re-evaluated per draw call and is startlingly expensive in Chromium —
   with thirty mad squirrels all glowing red at once it was costing 150-200ms in a single frame,
   which is where the remaining stutter during a swarm came from. The sprites never change, so
   each tint is baked into a small offscreen canvas once and blitted from then on. Identical
   result, no per-frame filter cost. */
const PK_TINTED=new WeakMap();
function pkTinted(img,key,filter){
  if(!img || !img.complete || !img.naturalWidth) return img;
  let m=PK_TINTED.get(img);
  if(!m){ m=Object.create(null); PK_TINTED.set(img,m); }
  let c=m[key];
  if(c) return c;
  c=document.createElement("canvas");
  c.width=img.naturalWidth; c.height=img.naturalHeight;
  const g=c.getContext("2d");
  g.imageSmoothingEnabled=false;
  g.filter=filter;
  g.drawImage(img,0,0);
  m[key]=c;
  return c;
}
function drawEnemy(ctx,e,sx,sy){
  if(e.t==="ape") return drawApe(ctx,e,sx,sy);
  // an enemy that has been seen off is already out of the fight, so it fades right down —
  // at a glance you can tell what still needs barking at and what is just running away
  // the wave-ending kill stays at full strength through its send-off instead of instantly
  // dimming to the usual scuttling-away ghost
  const ghost = e.heroOutro ? 1 : (e.fleeing ? 0.34 : 1);
  ctx.save(); ctx.globalAlpha*=ghost;
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx, sy+2, 9, 3, 0, 0, 7); ctx.fill();
  if(e.madsq && !e.fleeing) drawLaserFX(ctx,e,sx,sy);
  if((e.fleeing && e.shockT>0 && !e.madsqExplode || (e.spooked && e.spookT<0.3) || (e.stalkAggro && (e.leapT>0||e.windT>0))) && Math.floor(performance.now()/90)%2){
    ctx.fillStyle="#fff"; ctx.font="bold 13px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("!", sx, sy-24); ctx.textAlign="left";
  }
  if((e.atkState==="windup" || e.leapState==="windup" || e.swoopWindT>0) && Math.floor(performance.now()/80)%2){
    ctx.fillStyle="#f22"; ctx.beginPath(); ctx.arc(sx, sy-26, 2.4, 0, 7); ctx.fill();
  }
  // mad squirrels glow red the whole time they're charging or sweeping their beam
  const madGlow = e.madsq && (e.laserState==="charge" || e.laserState==="sweep");
  // wave 2's circling/V-formation birds are out for blood — same red glow reused for "angry"
  const angryGlow = !!e.angry;
  const frames = ENEMYIMG[e.t];
  const img = frames && frames[e.fi % frames.length];
  if(!img || !img.complete || !img.naturalWidth){ drawEnemyVector(ctx,e,sx,sy); if(e.madsqExplode) drawMadsqExplosion(ctx,sx,sy,e.explodeT); ctx.restore(); return; }
  let eh = e.alpha?32 : e.t==="cat"?(e.small?22*0.7:22):e.t==="bird"?18:16;
  if(e.big) eh*=1.9;
  const ew = eh*img.naturalWidth/img.naturalHeight;
  if(e.alpha){
    ctx.strokeStyle="#f22"; ctx.lineWidth=2;
    ctx.globalAlpha=0.5+0.5*Math.abs(Math.sin(e.ph+performance.now()/300));
    ctx.beginPath(); ctx.ellipse(sx, sy-eh*0.45, ew*0.62, eh*0.6, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if(madGlow||angryGlow){
    ctx.save(); ctx.globalAlpha=0.4+0.3*Math.sin(performance.now()/70); ctx.fillStyle="#f22";
    ctx.beginPath(); ctx.ellipse(sx, sy-eh*0.5, ew*0.65, eh*0.65, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(e.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage((madGlow||angryGlow) ? pkTinted(img,"red","sepia(1) saturate(8) hue-rotate(-50deg) brightness(1.1)") : img, sx-ew/2, sy-eh, ew, eh);
  ctx.restore();
  // the instant of impact: the sprite blows out white
  if(e.hitT>0){
    ctx.save(); ctx.globalAlpha=Math.min(1,e.hitT/0.22)*0.85;
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.ellipse(sx, sy-eh*0.5, ew*0.55, eh*0.55, 0,0,7); ctx.fill();
    ctx.restore();
  }
  drawEnemyHP(ctx,e,sx,sy,eh);
  if(e.madsqExplode) drawMadsqExplosion(ctx,sx,sy,e.explodeT);
  ctx.restore();
}
// friends are drawn from the same frame sets as their enemy counterparts, so a cool blue tint
// is what stops them reading as one more thing trying to eat you. Their health now lives on the
// control screen HUD instead of a floating bar out here (see pkPadDraw). drawEnemy is
// deliberately not reused: it branches on madsq/alpha/fleeing/spooked/stalkAggro/atkState, every
// one of which is wrong for a pal.
function drawPalLaserFX(ctx,p,sx,sy){
  const eyeX=sx+(p.dir<0?-4:4), eyeY=sy-11;
  if(p.laserState==="charge"){
    const f=clamp(p.chargeT/(MADSQ_CHARGE*0.7),0,1);
    ctx.save();
    ctx.globalAlpha=0.25+0.45*f; ctx.fillStyle="#2ad";
    ctx.beginPath(); ctx.arc(eyeX,eyeY,4+f*14,0,7); ctx.fill();
    ctx.globalAlpha=1; ctx.fillStyle=f>0.7?"#fff":"#9ef";
    ctx.beginPath(); ctx.arc(eyeX,eyeY,1.5+f*4,0,7); ctx.fill();
    ctx.restore();
  } else if(p.laserState==="sweep"){
    const ang=p.aimAng, range=p.beamLen||0;
    const ux=Math.cos(ang), uy=Math.sin(ang);
    const ex=eyeX+ux*range, ey=eyeY+uy*range;
    const pulse=0.85+0.15*Math.sin(performance.now()/25);
    ctx.save(); ctx.lineCap="round";
    ctx.globalAlpha=0.30; ctx.strokeStyle="#1e9aff"; ctx.lineWidth=MADSQ_WIDTH*2.4*pulse;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.globalAlpha=0.65; ctx.strokeStyle="#5cd8ff"; ctx.lineWidth=MADSQ_WIDTH*1.4*pulse;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.globalAlpha=1; ctx.strokeStyle="#eaffff"; ctx.lineWidth=MADSQ_WIDTH*0.6*pulse;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.restore();
  }
}
function drawPal(ctx,p,sx,sy,t){
  let lift=0, crouch=0;
  if(p.k==="ape"){
    if(p.state==="air"){
      // the hop itself: a real arc, with the landing spot marked on the ground the whole way
      const prog=clamp(1-p.airT/PAL_APE_AIR,0,1);
      lift=Math.sin(prog*Math.PI)*PAL_APE_ARC;
      ctx.save(); ctx.globalAlpha*=0.34; ctx.fillStyle="#6cf";
      ctx.beginPath(); ctx.ellipse(sx,sy,PAL_APE_SMASH_R*0.5,PAL_APE_SMASH_R*0.24,0,0,7); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.globalAlpha*=0.30+0.25*Math.sin(t*22);
      ctx.strokeStyle="#9fe6ff"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(sx,sy,PAL_APE_SMASH_R,PAL_APE_SMASH_R*0.48,0,0,7); ctx.stroke();
      ctx.restore();
    } else if(p.state==="wind"){
      crouch=4*(1-clamp(p.windT/PAL_APE_WINDUP,0,1));   // gathers himself before he goes
    }
    if(p.landT>0){
      // the shockwave ring, expanding out to the true smash radius then gone
      const lp=1-clamp(p.landT/PAL_APE_LAND,0,1);
      ctx.save(); ctx.globalAlpha*=(1-lp)*0.8; ctx.strokeStyle="#dff3ff"; ctx.lineWidth=3.5;
      ctx.beginPath(); ctx.ellipse(sx,sy,PAL_APE_SMASH_R*Math.max(0.08,lp),PAL_APE_SMASH_R*Math.max(0.08,lp)*0.48,0,0,7); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx,sy+2,p.k==="ape"?12:9,p.k==="ape"?4:3,0,0,7); ctx.fill();
  if(p.k==="sq" && p.tier>=4) drawPalLaserFX(ctx,p,sx,sy);
  // the ape friend shares the enemy ape's own frame set (a separate idle/run/jump object,
  // not the flat per-kind ENEMYIMG table everything else here comes from)
  const frames = p.k==="ape"
    ? (p.state==="air" ? APEIMG.jump : p.state==="wind" ? APEIMG.jump : p.landT>0 ? APEIMG.jump : APEIMG.idle)
    : ENEMYIMG[p.k];
  const img=frames && frames[p.k==="ape" ? (p.state==="air"?1:p.landT>0?2:0) % frames.length : p.fi%frames.length];
  const eh = p.k==="cat" ? 22 : p.k==="ape" ? 30 : 16;
  sy -= lift;
  sy += crouch;
  if(!img || !img.complete || !img.naturalWidth){
    ctx.fillStyle="#6cf"; ctx.beginPath(); ctx.arc(sx,sy-eh*0.5,eh*0.4,0,7); ctx.fill();
  } else {
    const ew=eh*img.naturalWidth/img.naturalHeight;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(p.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
    ctx.drawImage(pkTinted(img,"pal","saturate(0.5) hue-rotate(150deg) brightness(1.15)"), sx-ew/2, sy-eh, ew, eh);
    ctx.restore();
  }
  // no ring, no floating HP bar out here anymore — a pal's health lives on the control screen
  // now, stacked under BONES' own bar (see pkPadDraw), so the DOGPARK world itself stays clean
}
// while the flock is up at altitude only its shadow shows on the grass; the bird itself is drawn
// once it has committed to a dive
function drawPalBird(ctx,bd,sx,sy,t){
  const up=clamp(bd.alt/PAL_BIRD_ALT,0,1);
  ctx.fillStyle="rgba(0,0,0,"+(0.34-0.12*up).toFixed(3)+")";
  ctx.beginPath(); ctx.ellipse(sx,sy+2,7+3*up,2.5+1.2*up,0,0,7); ctx.fill();
  if(up>0.97) return;
  const frames=ENEMYIMG.bird;
  const img=frames && frames[bd.fi%frames.length];
  const by=sy-bd.alt;
  if(!img || !img.complete || !img.naturalWidth){
    ctx.fillStyle="#6cf"; ctx.beginPath(); ctx.arc(sx,by-8,6,0,7); ctx.fill(); return;
  }
  const eh=18, ew=eh*img.naturalWidth/img.naturalHeight;
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(bd.vx<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage(pkTinted(img,"pal","saturate(0.5) hue-rotate(150deg) brightness(1.15)"), sx-ew/2, by-eh, ew, eh);
  ctx.restore();
}
function drawBandanaDog(ctx,sx,sy,t){
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx,sy+12,13,4.5,0,0,7); ctx.fill();
  const glow=0.5+0.5*Math.sin(t*3);
  ctx.save(); ctx.globalAlpha=0.35*glow; ctx.fillStyle="#f22";
  ctx.beginPath(); ctx.ellipse(sx,sy,22,16,0,0,7); ctx.fill(); ctx.restore();
  const img=SHOPDOGIMG[0];   // he does not move a muscle, so he does not animate
  if(img && img.complete && img.naturalWidth){
    const fh=28, fw=fh*img.naturalWidth/img.naturalHeight;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img, sx-fw/2, sy-fh/2, fw, fh);
    ctx.restore();
  }
  ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillStyle="#fff"; ctx.globalAlpha=0.55+0.45*glow;
  ctx.fillText("FRIENDS", sx, sy-20);
  ctx.globalAlpha=1; ctx.textAlign="left";
}
function parkDraw(t){
  if(!PK.active) return;
  const [ctx,w,h]=fit($("#dogcv"));
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const DX=w/2, DY=h/2;
  const SC=(ex,ey)=>[DX+wd(ex-PK.x,WW), DY+wd(ey-PK.y,WH)];
  ctx.save(); ctx.translate(DX,DY); ctx.scale(PK.zoom||1,PK.zoom||1); ctx.translate(-DX,-DY);
  if(PKBG){
    const ox=((PK.x-DX)%WW+WW)%WW, oy=((PK.y-DY)%WH+WH)%WH;
    ctx.imageSmoothingEnabled=false;
    for(const ddx of [0,WW]) for(const ddy of [0,WH]) ctx.drawImage(PKBG,-ox+ddx,-oy+ddy);
  } else { ctx.fillStyle="#20261f"; ctx.fillRect(0,0,w,h); }
  pkDrawScorch(ctx,DX,DY,WW,WH,w,h);
  pkDrawSwordSite(ctx,SC,w,h,t);
  for(const a of PK.acts){
    const [ax,ay]=SC(a.x*WW,a.y*WH);
    if(ax<-70||ax>w+70||ay<-70||ay>h+70) continue;
    const img=PROPIMG[a.k], ph=a.k==="hoop"?42:26;
    const pw=img.naturalWidth?ph*img.naturalWidth/img.naturalHeight:ph*2.5;
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(ax,ay+ph/2-2,pw*0.42,5,0,0,7); ctx.fill();
    if(PK.hell){
      // the course furniture is alight too — nothing in the park is spared
      const fp=0.55+0.45*Math.sin(t*7+a.x*13);
      ctx.save();
      const fg=ctx.createRadialGradient(ax,ay,0,ax,ay,ph*1.1);
      fg.addColorStop(0,"rgba(255,150,50,"+(0.38*fp).toFixed(3)+")");
      fg.addColorStop(0.6,"rgba(210,50,10,"+(0.18*fp).toFixed(3)+")");
      fg.addColorStop(1,"rgba(120,15,0,0)");
      ctx.fillStyle=fg;
      ctx.beginPath(); ctx.ellipse(ax,ay,ph*1.1,ph*0.9,0,0,7); ctx.fill();
      ctx.restore();
      if(Math.random()<0.3){
        PK.embers.push({x:a.x*WW+(Math.random()-0.5)*20, y:a.y*WH-6,
          vx:(Math.random()-0.5)*16, vy:-26-Math.random()*34, life:0.6+Math.random()*0.5,
          dust:Math.random()<0.5});
      }
    }
    ctx.globalAlpha = a.cd<=0 ? 0.85+0.15*Math.sin(t*5) : 0.35;
    if(img.complete&&img.naturalWidth){ ctx.imageSmoothingEnabled=false; ctx.drawImage(img,ax-pw/2,ay-ph/2,pw,ph); }
    ctx.globalAlpha=1;
    if(PK.hell){
      ctx.save(); ctx.globalAlpha=0.5+0.4*Math.sin(t*9+a.y*7);
      ctx.fillStyle="#ff8b30";
      for(let f=0;f<3;f++){
        const fx2=ax-pw*0.28+f*pw*0.28, fy2=ay-ph*0.45-Math.abs(Math.sin(t*8+f*2))*5;
        ctx.beginPath(); ctx.moveTo(fx2,fy2); ctx.lineTo(fx2-3,fy2+7); ctx.lineTo(fx2+3,fy2+7); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
  {
    // shown only where the gate actually is — no off-screen pointer any more, find it for real
    const [gx,gy2]=SC(PK.gate.x,PK.gate.y);
    const pul=0.6+0.4*Math.sin(t*5);
    if(gx>-30&&gx<w+30&&gy2>-45&&gy2<h+45){
      ctx.strokeStyle="#f22"; ctx.globalAlpha=pul; ctx.lineWidth=4;
      ctx.strokeRect(gx-24,gy2-16,48,32); ctx.globalAlpha=1;
      ctx.fillStyle="#000"; ctx.fillRect(gx-30,gy2-9,60,18);   // a solid backdrop so EXIT actually pops
      ctx.fillStyle="#f22"; ctx.globalAlpha=pul;
      ctx.font="11px 'Press Start 2P',monospace"; ctx.textAlign="center";
      ctx.fillText("EXIT",gx,gy2+4);
      ctx.textAlign="left"; ctx.globalAlpha=1;
    }
  }
  if(PARKGHOST){
    const [hx,hy]=SC(PARKGHOST.x,PARKGHOST.y);
    if(hx>-30&&hx<w+30&&hy>-30&&hy<h+30){
      ctx.strokeStyle="#fff"; ctx.globalAlpha=0.4+0.6*Math.abs(Math.sin(t*4)); ctx.lineWidth=2;
      ctx.strokeRect(hx-12,hy-10,24,20);
      ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#fff"; ctx.textAlign="center";
      ctx.fillText("LOST XP",hx,hy-16); ctx.textAlign="left"; ctx.globalAlpha=1;
    } else {
      const ang=Math.atan2(hy-DY,hx-DX);
      const ex=DX+Math.cos(ang)*(Math.min(w,h)/2-42), ey=DY+Math.sin(ang)*(Math.min(w,h)/2-42);
      ctx.save(); ctx.translate(ex,ey); ctx.rotate(ang);
      ctx.strokeStyle="#fff"; ctx.globalAlpha=0.4+0.5*Math.abs(Math.sin(t*4)); ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,-6); ctx.lineTo(-6,6); ctx.closePath(); ctx.stroke();
      ctx.restore(); ctx.globalAlpha=1;
    }
  }
  if(PK.compass){
    // four fixed points, always on: the exit, the bandana dog's FRIENDS shop, the wandering
    // healer (drawn from PK.fr — she's the only non-golden entry that ever lands in it, so this
    // was already finding her, just mislabelled as a generic "FRIEND"), and the nearest loose
    // health pickup
    pkDrawCompassArrow(ctx,w,h,DX,DY,SC,t,PK.gate.x,PK.gate.y,"EXIT","#f22");
    pkDrawCompassArrow(ctx,w,h,DX,DY,SC,t,PK.npc.x*WW,PK.npc.y*WH,"FRIENDS","#6cf");
    let nearestHeal=null, bestHD=Infinity;
    for(const p of PK.powerups){
      if(p.type!=="regen") continue;
      const d=Math.hypot(wd(p.x-PK.x,WW),wd(p.y-PK.y,WH));
      if(d<bestHD){ bestHD=d; nearestHeal=p; }
    }
    if(nearestHeal) pkDrawCompassArrow(ctx,w,h,DX,DY,SC,t,nearestHeal.x,nearestHeal.y,"HEALTH","#3fdc7a");
    let nearestHealer=null, bestFD=Infinity;
    for(const f2 of PK.fr){
      if(f2.golden) continue;
      const d=Math.hypot(wd(f2.x-PK.x,WW),wd(f2.y-PK.y,WH));
      if(d<bestFD){ bestFD=d; nearestHealer=f2; }
    }
    if(nearestHealer) pkDrawCompassArrow(ctx,w,h,DX,DY,SC,t,nearestHealer.x,nearestHealer.y,"HEALER","#f6a");
  }
  for(const f of PK.fr){
    const [fx2,fy2]=SC(f.x,f.y);
    if(fx2<-40||fx2>w+40||fy2<-40||fy2>h+40) continue;
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(fx2,fy2+12,12,4,0,0,7); ctx.fill();
    if(f.golden){
      const glow=0.6+0.4*Math.sin(performance.now()/150);
      ctx.save(); ctx.globalAlpha=glow; ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(fx2,fy2-6,15,0,7); ctx.stroke(); ctx.restore();
    }
    const birdFrames=ENEMYIMG.bird;
    const frames = f.golden && birdFrames ? birdFrames : FRIENDIMG;
    const img=frames[Math.floor(t*8)%frames.length];
    if(img && img.complete && img.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false;
      const fh2=f.golden?18:26, fw2=fh2*img.naturalWidth/img.naturalHeight;
      if(f.vx<0){ ctx.translate(fx2*2,0); ctx.scale(-1,1); }
      if(f.golden) ctx.filter="sepia(1) saturate(6) hue-rotate(-15deg) brightness(1.3)";
      ctx.drawImage(img,fx2-fw2/2,fy2-fh2/2,fw2,fh2); ctx.restore(); }
    if(f.golden) drawBone(ctx, fx2, fy2+11, 0.75, "#e8c14a");
    else if(Math.floor(t*3)%2){ ctx.fillStyle="#f6a"; ctx.fillRect(fx2-2,fy2-22,4,4); }
  }
  for(const n of PK.nuts){
    const nx2=DX+wd(n.x-PK.x,WW), ny2=DY+wd(n.y-PK.y,WH);
    if(nx2<-24||nx2>w+24||ny2<-24||ny2>h+24) continue;
    const ang=Math.atan2(n.vy,n.vx);
    // faint motion trail so a thrown nut reads clearly against the grass
    ctx.strokeStyle = n.pal ? "rgba(150,230,255,.45)" : "rgba(255,220,150,.35)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(nx2,ny2); ctx.lineTo(nx2-Math.cos(ang)*14, ny2-Math.sin(ang)*14); ctx.stroke();
    ctx.fillStyle="rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(nx2,ny2+5,4,2,0,0,7); ctx.fill();
    ctx.save(); ctx.translate(nx2,ny2); ctx.rotate(ang+performance.now()/90);
    ctx.strokeStyle="#2a1808"; ctx.lineWidth=1.5;
    ctx.fillStyle = n.pal ? "#7fd8f0" : "#d99a4a"; ctx.beginPath(); ctx.ellipse(0,0,6,5.5,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = n.pal ? "#2b7f9c" : "#7a4a1f"; ctx.beginPath(); ctx.ellipse(-2.5,-2.5,3.6,3.2,0,0,7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // ground cover renders before any living thing — foliage must never be able to paint over
  // an enemy, pal, or the friends dog, however dense the grove gets
  // the walk in: dark under the canopy itself, then a lighter clearing once you're actually
  // through it — cast before the trunks, so it reads as light/shadow on the ground rather
  // than a tint over the trees
  for(const g of PK.groveCenters){
    const [gcx,gcy]=SC(g.x,g.y);
    const R=g.r*1.15;
    if(gcx<-R||gcx>w+R||gcy<-R||gcy>h+R) continue;
    ctx.save();
    const grad=ctx.createRadialGradient(gcx,gcy,0,gcx,gcy,R);
    grad.addColorStop(0,   "rgba(255,248,222,.16)");   // the clearing: a pool of light at the centre
    grad.addColorStop(0.26,"rgba(255,244,210,.05)");
    grad.addColorStop(0.42,"rgba(5,12,5,.22)");         // into shadow — this is the canopy band
    grad.addColorStop(0.68,"rgba(4,9,4,.48)");
    grad.addColorStop(1,   "rgba(4,9,4,0)");            // and back out to ordinary daylight
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.ellipse(gcx,gcy,R,R*0.62,0,0,7); ctx.fill();
    ctx.restore();
  }
  for(let i=0;i<PK.trees.length;i++){
    const tr=PK.trees[i];
    // projected inline rather than through SC(), which returns a fresh array — at 900+ trees a
    // frame that allocation alone was a measurable share of the budget
    const tx2=DX+wd(tr.x-PK.x,WW), ty2=DY+wd(tr.y-PK.y,WH);
    if(tx2<-70||tx2>w+70||ty2<-90||ty2>h+70) continue;
    pkDrawTree(ctx,tr,tx2,ty2,t);
  }
  for(const e of PK.en){
    const ex2=DX+wd(e.x-PK.x,WW), ey2=DY+wd(e.y-PK.y,WH);
    if(ex2<-40||ex2>w+40||ey2<-40||ey2>h+40) continue;
    if(e.bounceT>0){
      // launched by an ape friend's smash: tumbling, stretched along its flight, and lit
      const bp=1-e.bounceT/(e.bounceMax||0.55);
      ctx.save();
      ctx.translate(ex2,ey2);
      ctx.rotate((1-bp)*(e.bounceSpin||6)*0.34);
      const sq=1+Math.sin(bp*Math.PI)*0.28;
      ctx.scale(sq,2-sq);
      ctx.translate(-ex2,-ey2);
      drawEnemy(ctx,e,ex2,ey2);
      ctx.restore();
      ctx.save();                       // a puff of dust left where it was thrown from
      ctx.globalAlpha=(1-bp)*0.35; ctx.fillStyle="#cbb794";
      ctx.beginPath(); ctx.ellipse(ex2,ey2+4,10+bp*16,4+bp*6,0,0,7); ctx.fill();
      ctx.restore();
      continue;
    }
    if(e.heroOutro && PK.waveOutro){
      // the last one down: lit, spinning away from the blow, fading out as the beat ends
      const p=clamp(PK.waveOutro.t/WAVE_OUTRO_DUR,0,1);
      ctx.save();
      ctx.globalAlpha=1-clamp((p-0.45)/0.55,0,1);
      const halo=(1-p)*0.55;
      if(halo>0.02){
        // a soft bloom behind it rather than a disc over it, so the sprite stays readable
        const hr=24+p*34;
        const hg=ctx.createRadialGradient(ex2,ey2-8,0,ex2,ey2-8,hr);
        hg.addColorStop(0,   "rgba(255,255,255,"+(0.34*halo).toFixed(3)+")");
        hg.addColorStop(0.55,"rgba(255,246,214,"+(0.20*halo).toFixed(3)+")");
        hg.addColorStop(1,   "rgba(255,232,160,0)");
        ctx.save(); ctx.fillStyle=hg;
        ctx.beginPath(); ctx.arc(ex2,ey2-8,hr,0,7); ctx.fill(); ctx.restore();
      }
      ctx.translate(ex2,ey2); ctx.rotate(p*p*3.4*(e.fleeVx<0?-1:1)); ctx.scale(1-p*0.25,1-p*0.25); ctx.translate(-ex2,-ey2);
      drawEnemy(ctx,e,ex2,ey2);
      ctx.restore();
      continue;
    }
    drawEnemy(ctx,e,ex2,ey2);
  }
  if(PK.sword && PK.sword.state!=="held"){
    const [swx,swy]=SC(PK.sword.x,PK.sword.y);
    pkDrawWorldSword(ctx,swx,swy,t);
  }
  {
    // shown only where he actually is — finding him in the grove is the point, no arrow to spoil it
    const [nx2,ny2]=SC(PK.npc.x*WW, PK.npc.y*WH);
    if(nx2>-40&&nx2<w+40&&ny2>-50&&ny2<h+40) drawBandanaDog(ctx,nx2,ny2,t);
  }
  for(const p of PK.pals){
    if(p.k==="bird"){
      for(const bd of p.birds){
        const [bx2,by2]=SC(bd.x,bd.y);
        if(bx2<-40||bx2>w+40||by2<-90||by2>h+40) continue;
        drawPalBird(ctx,bd,bx2,by2,t);
      }
      continue;
    }
    const [px2,py2]=SC(p.x,p.y);
    if(px2<-40||px2>w+40||py2<-40||py2>h+40) continue;
    drawPal(ctx,p,px2,py2,t);
  }
  for(const lf of PK.leaves){
    const lx=DX+wd(lf.x-PK.x,WW), ly=DY+wd(lf.y-PK.y,WH);
    if(lx<-10||lx>w+10||ly<-10||ly>h+10) continue;
    ctx.save();
    ctx.globalAlpha=Math.min(1,lf.life*0.7);
    ctx.translate(lx,ly); ctx.rotate(lf.t*1.4+lf.ph);
    ctx.fillStyle="#5a8a3a"; ctx.beginPath(); ctx.ellipse(0,0,3.2,1.6,0,0,7); ctx.fill();
    ctx.restore();
  }
  for(const em of PK.embers){
    const ex3=DX+wd(em.x-PK.x,WW), ey3=DY+wd(em.y-PK.y,WH);
    if(ex3<-20||ex3>w+20||ey3<-20||ey3>h+20) continue;
    ctx.globalAlpha=Math.max(0,em.life*1.6);
    ctx.fillStyle=em.dust ? (em.life>0.3?"#a08258":"#6b5335") : (em.life>0.3?"#ffd06a":"#f2400f");
    ctx.fillRect(ex3-1.5,ey3-1.5,3,3);
    ctx.globalAlpha=1;
  }
  const frac2=1-clamp(PK.barkCd/PK.barkMax,0,1);
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.globalAlpha=0.35;
  ctx.beginPath(); ctx.arc(DX,DY,Math.max(6,PK.barkR*frac2),0,7); ctx.stroke();
  ctx.globalAlpha=1;
  if(PK.pulse>0){
    ctx.lineWidth=4; ctx.globalAlpha=PK.pulse/0.35;
    ctx.beginPath(); ctx.arc(DX,DY,PK.barkR*(1.35-(PK.pulse/0.35)*0.35),0,7); ctx.stroke();
    ctx.globalAlpha=1; ctx.lineWidth=2;
  }
  ctx.fillStyle="rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(DX,DY+15,15,4.5,0,0,7); ctx.fill();
  const spd=Math.abs(PK.vx)+Math.abs(PK.vy);
  const img=RUNIMG[Math.floor(spd>20?t*10:t*3)%RUNIMG.length];
  // the buzz: a hard horizontal rattle that decays, so a hit is felt as well as seen
  const hz=PK.hurtT>0 ? PK.hurtT/HURT_TIME : 0;
  const buzz=hz>0 ? Math.sin(t*90)*4.5*hz*hz : 0;
  if(hz>0){
    ctx.save();
    ctx.globalAlpha=0.30*hz; ctx.fillStyle="#f22";
    ctx.beginPath(); ctx.arc(DX+buzz,DY,22+10*(1-hz),0,7); ctx.fill();
    ctx.restore();
  }
  if(PK.regenT>0){   // a soft green halo while the drip is running
    const g=0.35+0.25*Math.sin(t*5);
    ctx.save(); ctx.globalAlpha=g*0.5; ctx.strokeStyle="#3fdc7a"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(DX,DY,21,0,7); ctx.stroke(); ctx.restore();
  }
  if(img.complete && !(PK.inv>0&&Math.floor(t*12)%2)){
    if(PK.zoomT>0){   // star power: bones flashes gold and shiny with a pulsing aura
      const rglow=0.5+0.5*Math.sin(t*8);
      ctx.save(); ctx.globalAlpha=rglow*0.35; ctx.fillStyle="#ffd94a";
      ctx.beginPath(); ctx.arc(DX,DY,24,0,7); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(PK.zoomT>0) ctx.filter="sepia(1) saturate(6) hue-rotate(-15deg) brightness(1.35)";
    else if(hz>0) ctx.filter="brightness(0.5) sepia(1) saturate(14) hue-rotate(-35deg)";
    if(PK.vx<0){ ctx.translate(DX*2,0); ctx.scale(-1,1); }
    ctx.drawImage(img,DX-20+(PK.vx<0?-buzz:buzz),DY-16,40,34);
    ctx.restore();
    pkDrawHeldSword(ctx,DX,DY,t);
  }
  for(const dr of PK.drops){
    const dx2=DX+wd(dr.x-PK.x,WW), dy2=DY+wd(dr.y-PK.y,WH);
    if(dx2<-20||dx2>w+20||dy2<-20||dy2>h+20) continue;
    if(dr.life<5 && Math.floor(dr.life*6)%2) continue;   // blink out
    drawBone(ctx, dx2, dy2, dr.gold?1.5:1, dr.gold?"#e8c14a":"#fff");
  }
  for(const p of PK.powerups){
    const [px3,py3]=SC(p.x,p.y);
    if(px3<-20||px3>w+20||py3<-20||py3>h+20) continue;
    if(p.life<4 && Math.floor(p.life*6)%2) continue;   // blink out
    const bob=Math.sin(t*4+p.x)*3;
    if(p.type==="regen"){
      const glow=0.5+0.35*Math.sin(t*7);
      ctx.save(); ctx.globalAlpha=glow; ctx.fillStyle="#3fdc7a";
      ctx.beginPath(); ctx.arc(px3,py3+bob,11,0,7); ctx.fill(); ctx.restore();
      drawRegenIcon(ctx,px3,py3+bob,8);
    } else if(p.type==="star"){
      const glow=0.55+0.35*Math.sin(t*6);
      ctx.save(); ctx.globalAlpha=glow; ctx.fillStyle="#ffd94a";
      ctx.beginPath(); ctx.arc(px3,py3+bob,11,0,7); ctx.fill(); ctx.restore();
      drawStarIcon(ctx,px3,py3+bob,8);
    } else {
      const glow=0.5+0.3*Math.sin(t*6);
      ctx.save(); ctx.globalAlpha=glow; ctx.fillStyle="#e23";
      ctx.beginPath(); ctx.arc(px3,py3+bob,11,0,7); ctx.fill(); ctx.restore();
      drawMagnetIcon(ctx,px3,py3+bob,8);
    }
  }
  for(const fxm of HITFX){
    const hx=DX+wd(fxm.x-PK.x,WW), hy=DY+wd(fxm.y-PK.y,WH);
    const k=1-fxm.life/fxm.max;                 // 0 at impact -> 1 as it snaps outward
    ctx.save();
    ctx.globalAlpha=Math.max(0,1-k);
    ctx.strokeStyle=fxm.down?"#e8c14a":"#fff"; ctx.lineWidth=fxm.down?3:2;
    ctx.beginPath(); ctx.arc(hx,hy,4+k*(fxm.down?24:15),0,7); ctx.stroke();
    const r2=(fxm.down?11:8)*(1-k*0.45);        // the cross snaps in as the ring goes out
    ctx.beginPath();
    ctx.moveTo(hx-r2,hy-r2); ctx.lineTo(hx-r2*0.4,hy-r2*0.4);
    ctx.moveTo(hx+r2,hy-r2); ctx.lineTo(hx+r2*0.4,hy-r2*0.4);
    ctx.moveTo(hx-r2,hy+r2); ctx.lineTo(hx-r2*0.4,hy+r2*0.4);
    ctx.moveTo(hx+r2,hy+r2); ctx.lineTo(hx+r2*0.4,hy+r2*0.4);
    ctx.stroke();
    ctx.restore();
  }
  for(const s of SPARKS){
    const sx=DX+wd(s.x-PK.x,WW), sy=DY+wd(s.y-PK.y,WH);
    ctx.globalAlpha=Math.max(0,s.life);
    ctx.fillStyle=s.heal?"#3fdc7a":s.gold?"#e8c14a":s.steel?"#6cf":"#fff";
    ctx.fillRect(sx-2,sy-2,4,4);
    ctx.globalAlpha=1;
  }
  if(PK.chain>1){
    const f3=clamp(PK.chainT/3,0,1), c3=Math.round(120+135*f3);
    ctx.fillStyle="rgb("+c3+","+c3+","+c3+")";
    ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("x"+PK.chain, DX, DY-42); ctx.textAlign="left";
  }
  pkDrawFloatingSword(ctx,SC,DX,DY,t);
  ctx.restore();   // exit the world zoom transform before any fixed-to-screen overlay
  pkDrawHellOverlay(ctx,w,h,t);
  pkDrawWaveOutro(ctx,w,h,t);
  pkDrawSwordCineOverlay(ctx,w,h,t);
  if(PK.shop){
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("PAUSED \u2014 SHOP ON CONTROLLER", w/2, h/2); ctx.textAlign="left";
  }
  ctx.save(); ctx.translate(DX,DY); ctx.scale(PK.zoom||1,PK.zoom||1); ctx.translate(-DX,-DY);
  ctx.font="8px 'Press Start 2P',monospace"; ctx.fillStyle="#fff";
  for(const f4 of PK.fx){
    const [px2,py2]=SC(f4.x,f4.y);
    ctx.globalAlpha=Math.max(0,f4.life);
    ctx.fillText(f4.txt,px2,py2-(0.9-f4.life)*24);
    ctx.globalAlpha=1;
  }
  ctx.restore();   // back to screen space for the fixed HUD (banners, flashes, health bar)
  // wave-transition banner \u2014 pops in, holds, fades, so a new wave actually reads as an event.
  // the golden-bird heads-up reuses the exact same treatment, just gold instead of red, so the
  // two read as one consistent "big event" idiom rather than two different UI languages
  pkDrawBanner(ctx,w,h,PK.waveBanner,"#f22");
  pkDrawBanner(ctx,w,h,PK.goldenBanner,"#e8c14a");
  pkDrawExitNag(ctx,w,h);
  pkDrawShop(ctx,w,h,t);
  // shop-purchase fanfare — a satisfying beat so spending bones actually feels like a reward
  if(PK.shopFlash){
    const {text,life,max,gold}=PK.shopFlash, el=max-life;
    let alpha; if(el<0.12) alpha=el/0.12; else if(life<0.5) alpha=Math.max(0,life/0.5); else alpha=1;
    const pop = el<0.18 ? 1+0.25*(1-el/0.18) : 1;
    const col=gold?"#e8c14a":"#fff";
    ctx.save(); ctx.globalAlpha=alpha;
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,h*0.58,w,h*0.13);
    ctx.strokeStyle=col; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0,h*0.58); ctx.lineTo(w,h*0.58); ctx.moveTo(0,h*0.71); ctx.lineTo(w,h*0.71); ctx.stroke();
    ctx.fillStyle=col; ctx.font=Math.round((gold?12:10)*pop)+"px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(text, w/2, h*0.665); ctx.textAlign="left";
    ctx.restore();
  }
  const hzh=PK.hurtT>0 ? PK.hurtT/HURT_TIME : 0;
  if(hzh>0){
    // the whole view takes the hit: a red rim that closes in and lets go
    ctx.save();
    const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.28,w/2,h/2,Math.max(w,h)*0.62);
    g.addColorStop(0,"rgba(255,20,20,0)");
    g.addColorStop(1,"rgba(255,20,20,"+(0.55*hzh*hzh).toFixed(3)+")");
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.restore();
  }
  pkPadDraw(t);
}
// the one place a panel's row geometry lives. The shop and the exchange still mirror their own
// numbers between draw and tap; new panels use these instead of adding another pair to keep in sync.
const PANEL_ROW0=0.30, PANEL_STEP=0.115, PANEL_CARDH=0.085;
function pkRowYF(i){ return PANEL_ROW0+i*PANEL_STEP; }
function pkRowHit(yF,i){ return Math.abs(yF-pkRowYF(i))<PANEL_CARDH/2; }

/* ---------- the park shop, drawn on the park screen itself ---------- */
// It used to live on the controller pad, where a thumb already steering BONES would buy
// things by accident between waves. Up here it is out of the way, and nothing is bought
// until it has been confirmed.
function pkShopIcon(ctx,x,y,s2,key,col){
  ctx.save(); ctx.translate(x,y); ctx.scale(s2,s2);
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=1.6; ctx.lineJoin="miter";
  if(key==="bark"){ for(let i=1;i<=3;i++){ ctx.beginPath(); ctx.arc(-4,0,i*3,-0.9,0.9); ctx.stroke(); } ctx.fillRect(-7,-2,3,4); }
  else if(key==="fast"){ ctx.beginPath(); ctx.moveTo(1,-8); ctx.lineTo(-5,1); ctx.lineTo(-1,1); ctx.lineTo(-2,8); ctx.lineTo(5,-1); ctx.lineTo(1,-1); ctx.closePath(); ctx.fill(); }
  else if(key==="knock"){ for(let i=0;i<8;i++){ const a=i*Math.PI/4; ctx.beginPath(); ctx.moveTo(Math.cos(a)*3,Math.sin(a)*3); ctx.lineTo(Math.cos(a)*8,Math.sin(a)*8); ctx.stroke(); } }
  else if(key==="heal"){ ctx.fillRect(-2.5,-8,5,16); ctx.fillRect(-8,-2.5,16,5); }
  else if(key==="speed"){ for(let i=0;i<2;i++){ ctx.beginPath(); ctx.moveTo(-5+i*6,-7); ctx.lineTo(1+i*6,0); ctx.lineTo(-5+i*6,7); ctx.stroke(); } }
  else if(key==="hp"){ ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(7,-4); ctx.lineTo(7,3); ctx.lineTo(0,8); ctx.lineTo(-7,3); ctx.lineTo(-7,-4); ctx.closePath(); ctx.stroke(); ctx.fillRect(-1.5,-4,3,8); ctx.fillRect(-4,-1.5,8,3); }
  else if(key==="nose"){ drawBone(ctx,0,0,0.85,col); }
  else if(key==="relic"){ ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(8,0); ctx.lineTo(0,8); ctx.lineTo(-8,0); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(4,0); ctx.lineTo(0,4); ctx.lineTo(-4,0); ctx.closePath(); ctx.fill(); }
  else if(key==="agility"){ ctx.beginPath(); ctx.arc(0,1,7,Math.PI,0); ctx.stroke();
    ctx.fillRect(-8,1,2,7); ctx.fillRect(6,1,2,7);
    ctx.beginPath(); ctx.moveTo(-4,-4); ctx.lineTo(0,-9); ctx.lineTo(4,-4); ctx.stroke(); }
  else if(key==="expand"){ ctx.strokeRect(-8,-8,16,16); ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(0,8); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.stroke(); }
  else if(key==="compass"){ ctx.beginPath(); ctx.arc(0,0,8,0,7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(2.4,0); ctx.lineTo(0,6); ctx.lineTo(-2.4,0); ctx.closePath(); ctx.fill(); }
  else if(key==="sword"){ ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(2.2,-5); ctx.lineTo(2.2,3); ctx.lineTo(-2.2,3); ctx.lineTo(-2.2,-5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6,3.4); ctx.lineTo(6,3.4); ctx.stroke();
    ctx.fillRect(-1.2,4,2.4,4); ctx.beginPath(); ctx.arc(0,9,1.8,0,7); ctx.stroke(); }
  else if(key==="armour"){ ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(7,-5); ctx.lineTo(7,2); ctx.lineTo(0,9); ctx.lineTo(-7,2); ctx.lineTo(-7,-5); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(0,5); ctx.moveTo(-3.6,-1.5); ctx.lineTo(3.6,-1.5); ctx.stroke(); }
  else if(key==="sqpal"){ ctx.beginPath(); ctx.ellipse(-2,2,5,3.6,0.25,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(3,2.5,4.5,0.15,4.6); ctx.stroke(); }
  else if(key==="birdpal"){ ctx.beginPath(); ctx.moveTo(-8,2); ctx.quadraticCurveTo(-2,-7,0,0); ctx.quadraticCurveTo(2,-7,8,2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,2,0,7); ctx.fill(); }
  else if(key==="catpal"){ ctx.beginPath(); ctx.arc(0,1.5,6,0,7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6,-2); ctx.lineTo(-3,-8.5); ctx.lineTo(-1,-2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6,-2); ctx.lineTo(3,-8.5); ctx.lineTo(1,-2); ctx.closePath(); ctx.fill(); }
  else if(key==="apepal"){ ctx.beginPath(); ctx.arc(0,0,7,0,7); ctx.stroke();
    ctx.fillRect(-5,-2.2,10,2.6); ctx.beginPath(); ctx.arc(-3,2.4,1.3,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(3,2.4,1.3,0,7); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(0,0,6,0,7); ctx.stroke(); }
  ctx.restore();
}
const PAL_ICON={sq:"sqpal", bird:"birdpal", cat:"catpal", ape:"apepal"};
// shrinks the font until the text actually fits maxW, instead of letting a long line run over
// the row border or collide with whatever's drawn to its right — the failure mode this replaces
function pkFitText(ctx,text,x,y,maxW,size){
  let s=size;
  ctx.font=s+"px 'Press Start 2P',monospace";
  while(s>4.4 && ctx.measureText(text).width>maxW){ s-=0.4; ctx.font=s.toFixed(1)+"px 'Press Start 2P',monospace"; }
  ctx.fillText(text,x,y);
}
// one shared row geometry, used by both the draw and the hit test so they can never drift
const ARMOR_COST=40, COMPASS_COST=50;
function pkShopRows(w,h){
  const rows=[];
  const cardH=h*0.125, step=h*0.135, top0=h*0.225;
  for(let i=0;i<3;i++) rows.push({x:w*0.07, y:top0+i*step, w:w*0.86, h:cardH, kind:"offer", idx:i});
  rows.push({x:w*0.07, y:h*0.635, w:w*0.86, h:cardH, kind:"charm", idx:0});
  rows.push({x:w*0.32, y:h*0.80,  w:w*0.36, h:h*0.10, kind:"skip", idx:0});
  // two fixed slots, never rolled and never replaced by the pool above — armour on the left,
  // compass on the right, visible in every shop from wave 1 on
  rows.push({x:w*0.06, y:h*0.80, w:w*0.22, h:h*0.10, kind:"armour"});
  rows.push({x:w*0.72, y:h*0.80, w:w*0.22, h:h*0.10, kind:"compass"});
  return rows;
}
function pkShopCard(ctx,r,o,col,dim,afford){
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.globalAlpha=dim;
  ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(r.x,r.y,r.w,r.h);
  pkShopIcon(ctx, r.x+r.h*0.52, r.y+r.h*0.5, r.h/26, o.ic, col);
  ctx.textAlign="left"; ctx.fillStyle=col;
  const textX=r.x+r.h*1.05, textW=r.w*0.62-r.h*1.05;
  pkFitText(ctx, o.n, textX, r.y+r.h*0.42, textW, 8);
  ctx.fillStyle="#9a9a9a";
  pkFitText(ctx, o.fx, textX, r.y+r.h*0.75, textW, 6);
  ctx.textAlign="right"; ctx.font="8px 'Press Start 2P',monospace";
  ctx.fillStyle = afford ? col : "#f22";
  ctx.fillText(o.c+"◆", r.x+r.w-8, r.y+r.h*0.60);
  ctx.restore();
}
function pkDrawShop(ctx,w,h,t){
  if(!PK.shop) return;
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.82)"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(4,4,w-8,h-8);
  ctx.textAlign="center";
  ctx.fillStyle="#fff"; ctx.font="10px 'Press Start 2P',monospace";
  ctx.fillText("★ PARK SHOP ★", w/2, h*0.105);
  // wallet
  ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2;
  const wbW=w*0.42, wbX=w/2-wbW/2, wbY=h*0.135, wbH=h*0.062;
  ctx.strokeRect(wbX,wbY,wbW,wbH);
  drawBone(ctx, wbX+16, wbY+wbH*0.55, 1, "#e8c14a");
  ctx.fillStyle="#e8c14a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText(PK.bones+" BONES", wbX+28, wbY+wbH*0.68);

  const rows=pkShopRows(w,h);
  // ---- confirm step: the list is replaced entirely, so a stray tap cannot reach a card
  if(PK.shopSel){
    const sel=PK.shopSel, o=sel.item;
    const col=sel.kind==="charm"?"#e8c14a":(o.relic?"#e8c14a":o.expand?"#6cf":"#fff");
    const afford=PK.bones>=o.c;
    const bx=w*0.10, by=h*0.235, bw2=w*0.80, bh2=h*0.30;
    ctx.fillStyle="rgba(0,0,0,.9)"; ctx.fillRect(bx,by,bw2,bh2);
    ctx.strokeStyle=col; ctx.lineWidth=3; ctx.strokeRect(bx,by,bw2,bh2);
    pkShopIcon(ctx, bx+bw2/2, by+bh2*0.26, 1.15, o.ic, col);
    ctx.textAlign="center"; ctx.font="9px 'Press Start 2P',monospace"; ctx.fillStyle=col;
    ctx.fillText(o.n, w/2, by+bh2*0.58);
    ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#9a9a9a";
    ctx.fillText(o.fx, w/2, by+bh2*0.76);
    ctx.font="8px 'Press Start 2P',monospace"; ctx.fillStyle=afford?"#e8c14a":"#f22";
    ctx.fillText(o.c+"◆  —  YOU HAVE "+PK.bones+"◆", w/2, by+bh2*0.94);
    const cy=h*0.58, ch2=h*0.13;
    ctx.fillStyle="rgba(0,0,0,.9)"; ctx.fillRect(w*0.10,cy,w*0.38,ch2); ctx.fillRect(w*0.52,cy,w*0.38,ch2);
    ctx.strokeStyle=afford?"#4a9":"#663333"; ctx.lineWidth=3; ctx.strokeRect(w*0.10,cy,w*0.38,ch2);
    ctx.fillStyle=afford?"#4a9":"#663333"; ctx.font="9px 'Press Start 2P',monospace";
    ctx.fillText(afford?"BUY":"TOO DEAR", w*0.29, cy+ch2*0.62);
    ctx.strokeStyle="#f22"; ctx.lineWidth=3; ctx.strokeRect(w*0.52,cy,w*0.38,ch2);
    ctx.fillStyle="#f22"; ctx.fillText("CANCEL", w*0.71, cy+ch2*0.62);
    ctx.textAlign="left"; ctx.restore(); return;
  }

  PK.shop.forEach((o,i)=>{
    const col = o.relic?"#e8c14a" : o.expand?"#6cf" : "#fff";
    const glow = (o.relic||o.expand) ? 0.72+0.28*Math.sin(t*5) : 1;
    pkShopCard(ctx, rows[i], o, col, glow, PK.bones>=o.c);
  });

  // ---- the 60s clear bonus, deliberately the loudest thing on the panel
  const br=rows[3];
  if(PK.speedBonus && PK.speedBonus.unlocked && PK.speedBonus.charm){
    const ch=PK.speedBonus.charm, afford=PK.bones>=ch.cost;
    const puls=0.6+0.4*Math.sin(t*7);
    ctx.save();
    ctx.globalAlpha=0.30*puls; ctx.fillStyle="#e8c14a";
    ctx.fillRect(br.x-5,br.y-5,br.w+10,br.h+10);          // halo so it cannot be missed
    ctx.restore();
    pkShopCard(ctx, br, {n:"★ "+ch.name, fx:"60s CLEAR REWARD — "+ch.fx, c:ch.cost, ic:"relic"},
               "#e8c14a", 1, afford);
    ctx.save(); ctx.globalAlpha=puls;
    ctx.textAlign="center"; ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#e8c14a";
    ctx.fillText("★ FAST CLEAR UNLOCKED ★", w/2, br.y-8);
    ctx.restore();
  } else if(PK.speedBonus){
    ctx.save();
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(br.x,br.y,br.w,br.h);
    ctx.setLineDash([5,4]); ctx.strokeStyle="#555"; ctx.lineWidth=2;
    ctx.strokeRect(br.x,br.y,br.w,br.h); ctx.setLineDash([]);
    drawLock(ctx, br.x+br.h*0.52, br.y+br.h*0.5, 1, "#777");
    ctx.textAlign="left"; ctx.font="7px 'Press Start 2P',monospace"; ctx.fillStyle="#777";
    ctx.fillText("CHARM LOCKED", br.x+br.h*1.05, br.y+br.h*0.42);
    ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#f22";
    ctx.fillText("CLEAR A WAVE IN 60s — MISSED BY "+PK.speedBonus.over+"s", br.x+br.h*1.05, br.y+br.h*0.75);
    ctx.restore();
  }
  const sk=rows[4];
  ctx.fillStyle="rgba(0,0,0,.7)"; ctx.fillRect(sk.x,sk.y,sk.w,sk.h);
  ctx.strokeStyle="#666"; ctx.lineWidth=2; ctx.strokeRect(sk.x,sk.y,sk.w,sk.h);
  ctx.fillStyle="#999"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText("SKIP", sk.x+sk.w/2, sk.y+sk.h*0.64);
  ctx.textAlign="left";
  // the two fixed slots — drawn small and plain when done, lit and priced while there's still
  // something to buy, so at a glance the row reads "spent" vs "available" without extra text
  const armorFull=PK.armor>=pkArmorCap();
  pkDrawFixedSlot(ctx, rows[5], "armour", "ARMOUR", armorFull, ARMOR_COST, "#6cf");
  pkDrawFixedSlot(ctx, rows[6], "compass", "COMPASS", PK.compass, COMPASS_COST, "#f6a");
  ctx.restore();
}
function pkDrawFixedSlot(ctx,r,ic,label,owned,cost,col){
  const afford=PK.bones>=cost;
  ctx.fillStyle="rgba(0,0,0,.7)"; ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.strokeStyle = owned ? "#444" : (afford?col:"#663333"); ctx.lineWidth=2;
  ctx.strokeRect(r.x,r.y,r.w,r.h);
  pkShopIcon(ctx, r.x+r.h*0.5, r.y+r.h*0.36, r.h/30, ic, owned?"#556":col);
  ctx.textAlign="center"; ctx.font="6px 'Press Start 2P',monospace";
  ctx.fillStyle = owned ? "#556" : (afford?col:"#a55");
  ctx.fillText(owned?label:cost+"◆", r.x+r.w/2, r.y+r.h*0.86);
  ctx.textAlign="left";
}
// shop taps live on the park screen. Registered here rather than in the #dogcv handler in
// bones.js, which bails out early for the whole of a park run.
(function(){
  const cv=document.querySelector("#dogcv");
  cv.addEventListener("pointerdown",e=>{
    if(!PK.active || !PK.shop) return;
    const r=cv.getBoundingClientRect();
    const x=e.clientX-r.left, y=e.clientY-r.top, w=r.width, h=r.height;
    const hit=(rx,ry,rw,rh)=>x>=rx&&x<=rx+rw&&y>=ry&&y<=ry+rh;
    if(PK.shopSel){
      const sel=PK.shopSel, o=sel.item, cy=h*0.58, ch2=h*0.13;
      if(hit(w*0.52,cy,w*0.38,ch2)){ PK.shopSel=null; beep(300,.05); return; }
      if(hit(w*0.10,cy,w*0.38,ch2)){
        if(PK.bones<o.c){ beep(150,.1); return; }
        PK.bones-=o.c;
        if(sel.kind==="charm"){
          o.apply(); PK.relic=o.id; tickTodo("j_collar");
          PK.speedBonus.charm=null; pkFanfare(o.name,true);
        } else { o.f(); pkFanfare(o.n.replace(/^⬥ /,""),!!o.relic); }
        PK.shopSel=null; PK.shop=null;
      }
      return;
    }
    for(const row of pkShopRows(w,h)){
      if(!hit(row.x,row.y,row.w,row.h)) continue;
      if(row.kind==="skip"){ PK.shop=null; PK.shopSel=null; beep(400,.05); return; }
      if(row.kind==="offer"){
        const o=PK.shop[row.idx];
        if(o){ PK.shopSel={kind:"offer", item:o}; beep(620,.05); }
        return;
      }
      if(row.kind==="charm"){
        const sb=PK.speedBonus;
        if(sb && sb.unlocked && sb.charm){
          PK.shopSel={kind:"charm", item:Object.assign({}, sb.charm, {n:"★ "+sb.charm.name, c:sb.charm.cost, ic:"relic", fx:sb.charm.fx})};
          beep(760,.05);
        } else beep(150,.08);
        return;
      }
      // the two fixed slots buy immediately, no confirm step — same one-tap weight as SKIP,
      // since neither is a choice between three rolled options
      if(row.kind==="armour"){
        if(PK.armor>=pkArmorCap()){ beep(150,.08); return; }
        if(PK.bones<ARMOR_COST){ beep(150,.1); return; }
        PK.bones-=ARMOR_COST; PK.armorUnlocked=true; PK.armor=pkArmorCap();
        pkFanfare("FULL ARMOUR",true); beep(700,.08); setTimeout(()=>beep(950,.08),90);
        PK.shop=null; PK.shopSel=null;
        return;
      }
      if(row.kind==="compass"){
        if(PK.compass){ beep(150,.08); return; }
        if(PK.bones<COMPASS_COST){ beep(150,.1); return; }
        PK.bones-=COMPASS_COST; PK.compass=true;
        pkFanfare("COMPASS",true); beep(700,.08); setTimeout(()=>beep(1050,.1),90);
        PK.shop=null; PK.shopSel=null;
        return;
      }
    }
  });
})();
function pkPadDraw(t){
  const [ctx,w,h]=fit($("#parkcv"));
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(6,6,w-12,h-12);
  if(!PK.shop && !PK.joy && !PK.friendsOpen && !PK.convertOpen){
    ctx.fillStyle="#444"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(DN("DRAG ANYWHERE TO MOVE BONES"), w/2, h/2);
  }
  ctx.strokeStyle="#666"; ctx.lineWidth=2; ctx.strokeRect(8,10,110,30);
  drawBone(ctx, 24, 26, 1, "#fff");
  ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText(PK.bones+" BONES", 34, 29);
  {
    // BONES' health lives down here now — up top it sat straight on the wave meter
    const hzh=PK.hurtT>0 ? PK.hurtT/HURT_TIME : 0;
    const hb=hzh>0 ? Math.sin(t*90)*3.5*hzh*hzh : 0;
    const hfrac=clamp(PK.hp/PK.maxhp,0,1);
    const bx=w-140, by=14, bw2=128, bh2=14;
    if(hzh>0){ ctx.save(); ctx.globalAlpha=0.55*hzh; ctx.fillStyle="#f22";
               ctx.fillRect(bx-4+hb,by-4,bw2+8,bh2+8); ctx.restore(); }
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(bx+hb,by,bw2,bh2);
    ctx.strokeStyle = hzh>0 ? "#f22" : "#fff"; ctx.lineWidth = hzh>0 ? 3 : 2;
    ctx.strokeRect(bx+hb,by,bw2,bh2);
    if(PK.regenT>0){
      const ahead=clamp((PK.hp+Math.min(PK.regenT,PK.maxhp-PK.hp))/PK.maxhp,0,1);
      ctx.save(); ctx.globalAlpha=0.35+0.2*Math.sin(t*6); ctx.fillStyle="#3fdc7a";
      ctx.fillRect(bx+3+hb+(bw2-6)*hfrac,by+3,(bw2-6)*(ahead-hfrac),bh2-6); ctx.restore();
    }
    ctx.fillStyle = hzh>0 ? "#fff" : (PK.hp<PK.maxhp*0.3?"#f22":"#fff");
    ctx.fillRect(bx+3+hb,by+3,(bw2-6)*hfrac,bh2-6);
    if(PK.over>0){
      // the shield rides on top of a full bar, and glows harder the bigger it is
      const of2=clamp(PK.over/Math.max(1,pkOverCap()),0,1);
      ctx.save();
      ctx.globalAlpha=0.55+0.45*Math.abs(Math.sin(t*7));
      ctx.fillStyle="#ffd94a";
      ctx.fillRect(bx+3+hb,by+3,(bw2-6)*of2,bh2-6);
      ctx.strokeStyle="#ffd94a"; ctx.lineWidth=2; ctx.strokeRect(bx+hb,by,bw2,bh2);
      ctx.restore();
    }
    ctx.fillStyle=PK.over>0?"#ffd94a":"#fff"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="right";
    ctx.fillText((PK.over>0?"+"+Math.ceil(PK.over)+"  ":"")+Math.max(0,Math.ceil(PK.hp))+"/"+PK.maxhp, bx+bw2, by+bh2+10);
    ctx.textAlign="left"; ctx.lineWidth=2;
    // Full Armour: a whole second bar of its own rather than a tint on the first \u2014 it was bought
    // outright, and it reads as its own asset, not a temporary bonus riding the HP bar
    let armorH=0;
    if(PK.armorUnlocked){
      const ay=by+bh2+4, ah=8, afrac=clamp(PK.armor/Math.max(1,pkArmorCap()),0,1);
      armorH=ah+8;
      ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(bx,ay,bw2,ah);
      ctx.strokeStyle="#6cf"; ctx.lineWidth=2; ctx.strokeRect(bx,ay,bw2,ah);
      ctx.fillStyle="#6cf"; ctx.fillRect(bx+2,ay+2,(bw2-4)*afrac,ah-4);
      ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#6cf"; ctx.textAlign="right";
      ctx.fillText("ARMOUR "+Math.ceil(PK.armor), bx+bw2, ay+ah+8);
      ctx.textAlign="left";
    }
    if(PK.relic){
      const rc=PK_CHARMS.find(c=>c.id===PK.relic);
      if(rc){ ctx.fillStyle="#f22"; ctx.font="6px 'Press Start 2P',monospace"; ctx.fillText("\u2b25 "+rc.name, 10, 46); }
    }
    // sub-friends' health lives directly under BONES' own bar, smaller \u2014 he's their leader.
    // only squirrel/cat carry HP at all (the bird flock is never itself a target). Pushed down
    // past BONES' own hp/maxhp number (drawn just above), and past the armour bar if it's showing,
    // so nothing collides.
    let ppy=by+bh2+24+armorH;
    for(const kind of ["sq","cat","ape"]){
      const p=PK.pals.find(q=>q.k===kind);
      if(!p) continue;
      const pw=86, ph2=8, pbx=bx+bw2-pw;
      const pfrac=clamp(p.hp/p.hpMax,0,1);
      ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(pbx-1,ppy-1,pw+2,ph2+2);
      ctx.strokeStyle="#6cf"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,ppy+0.5,pw-1,ph2-1);
      ctx.fillStyle = pfrac<0.35 ? "#f22" : "#6cf";
      ctx.fillRect(pbx+1,ppy+1,(pw-2)*pfrac,ph2-2);
      ctx.fillStyle="#6cf"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="right";
      ctx.fillText(kind==="sq"?"SQUIRREL":kind==="cat"?"CAT":"APE", pbx-4, ppy+ph2-1);
      ctx.textAlign="left";
      ppy+=ph2+5;
    }
  }
  ctx.textAlign="left";
  if(!PK.shop && !PK.joy && !PK.friendsOpen && !PK.convertOpen){
    // the current wave's objective + clear progress — moved down here from the top of the main
    // play view so the gameplay canvas itself stays clear of overlaid chrome
    const pct=pkWavePct();
    const goal = PK.wave===APE_WAVE ? "CLEAR THE APES" : pkWaveName(PK.wave);
    ctx.textAlign="center"; ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#fff";
    const maxGW=w*0.86;
    const gwords=DN(goal).split(" "); const glines=[]; let gcur="";
    for(const gw of gwords){
      const trial=gcur?gcur+" "+gw:gw;
      if(ctx.measureText(trial).width>maxGW && gcur){ glines.push(gcur); gcur=gw; } else gcur=trial;
    }
    if(gcur) glines.push(gcur);
    const gy0=94, shown=glines.slice(0,2);
    shown.forEach((ln,i)=>ctx.fillText(ln, w/2, gy0+i*10));
    const gby=gy0+shown.length*10-2;
    const gbw=Math.min(220,w*0.7), gbx=w/2-gbw/2;
    ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(gbx,gby,gbw,8);
    ctx.fillStyle="#4a9"; ctx.fillRect(gbx+1,gby+1,(gbw-2)*pct,6);
    ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=1; ctx.strokeRect(gbx,gby,gbw,8);
    ctx.fillStyle="#cfe6ff"; ctx.font="6px 'Press Start 2P',monospace";
    ctx.fillText(Math.round(pct*100)+"% CLEAR", w/2, gby+17);
    ctx.textAlign="left";
  }
  if(PK.zoomT>0){
    const bw=Math.min(170,w*0.62), bx=w/2-bw/2;
    ctx.fillStyle="rgba(255,217,74,.18)"; ctx.fillRect(bx,44,bw,18);
    ctx.strokeStyle="#ffd94a"; ctx.lineWidth=2; ctx.strokeRect(bx,44,bw,18);
    ctx.fillStyle="#ffd94a"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("THE ZOOMIES "+PK.zoomT.toFixed(1)+"s", w/2, 57);
    ctx.textAlign="left";
  }
  if(PK.regenT>0){
    const bw=Math.min(140,w*0.55), bx=w/2-bw/2, by=PK.zoomT>0?66:44;
    ctx.fillStyle="rgba(63,220,122,.18)"; ctx.fillRect(bx,by,bw,18);
    ctx.strokeStyle="#3fdc7a"; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,18);
    ctx.fillStyle="#3fdc7a"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("\u271a REGEN "+PK.regenT.toFixed(1)+"s", w/2, by+13);
    ctx.textAlign="left";
  }
  if(PK.joy){
    ctx.strokeStyle="#fff"; ctx.globalAlpha=0.5; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(PK.joy.ox,PK.joy.oy,26,0,7); ctx.stroke();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(PK.joy.ox+PK.joy.dx*22,PK.joy.oy+PK.joy.dy*22,9,0,7); ctx.fill();
    ctx.globalAlpha=1;
  }
  if(PK.convertOpen){
    ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(w*0.06,h*0.07,w*0.88,h*0.74);
    ctx.fillStyle="#fff"; ctx.font="10px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("EXCHANGE BONES", w/2, h*0.135);
    const wbW=w*0.5, wbX=w/2-wbW/2, wbY=h*0.165, wbH=h*0.065;
    ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2; ctx.strokeRect(wbX,wbY,wbW,wbH);
    drawBone(ctx, w/2-30, wbY+wbH*0.6, 1, "#e8c14a");
    ctx.fillStyle="#e8c14a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
    ctx.fillText(PK.bones+" BONES", w/2-18, wbY+wbH*0.65);
    ctx.textAlign="left";
    const cRowStep=h*0.10, cCardH=h*0.075, cRow0=h*0.33;
    BONES_EXCHANGE.forEach((o,i)=>{
      const y=cRow0+i*cRowStep, top=y-cCardH*0.5;
      const owned = o.label==="COMPASS" && PK.compass;
      const spent = (o.label==="XP" && pkXPLeft()<=0) || owned;
      const afford=PK.bones>=o.cost && !spent;
      ctx.strokeStyle = spent?"#334":(afford?"#fff":"#663333"); ctx.lineWidth=2;
      ctx.strokeRect(w*0.10, top, w*0.80, cCardH);
      ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
      ctx.fillStyle = spent?"#556":(afford?"#fff":"#a55");
      ctx.fillText(o.label, w*0.145, y-1);
      ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle = spent?"#445":"#999";
      ctx.fillText(owned?"ALREADY OWNED THIS RUN":spent?"XP CAP REACHED THIS RUN":o.sub, w*0.145, y+11);
      ctx.textAlign="right"; ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillStyle = afford?"#fff":"#f22";
      ctx.fillText(o.cost+"◆", w*0.855, y+2);
      ctx.textAlign="left";
    });
    const doneY=cRow0+BONES_EXCHANGE.length*cRowStep, doneH=h*0.05;
    ctx.strokeStyle="#666"; ctx.lineWidth=2;
    ctx.strokeRect(w*0.30,doneY-doneH*0.5,w*0.40,doneH);
    ctx.fillStyle="#888"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("DONE", w/2, doneY+doneH*0.15);
    ctx.textAlign="left";
  }
  if(PK.friendsOpen){
    ctx.strokeStyle="#f6a"; ctx.lineWidth=3; ctx.strokeRect(w*0.06,h*0.07,w*0.88,h*0.80);
    ctx.fillStyle="#f6a"; ctx.font="10px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("FRIENDS", w/2, h*0.135);
    ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#999";
    ctx.fillText("UPGRADE THROUGH 4 TIERS \u2014 RUN ONLY", w/2, h*0.185);
    const wbW=w*0.5, wbX=w/2-wbW/2, wbY=h*0.21, wbH=h*0.06;
    ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2; ctx.strokeRect(wbX,wbY,wbW,wbH);
    drawBone(ctx, w/2-30, wbY+wbH*0.6, 1, "#e8c14a");
    ctx.fillStyle="#e8c14a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
    ctx.fillText(PK.bones+" BONES", w/2-18, wbY+wbH*0.65);
    PAL_KINDS.forEach((k,i)=>{
      const tier=pkPalTier(k), buyable=pkPalBuyableK(k), maxTier=PAL_MAXTIER[k]||4;
      const td=pkNextTierData(k);
      const cost=td?td.c:0, afford=PK.bones>=cost;
      const ok=buyable&&afford;
      const y=h*pkRowYF(i), cardH=h*PANEL_CARDH, top=y-cardH*0.5;
      const rowX=w*0.10, rowW=w*0.80;
      ctx.strokeStyle = !buyable ? "#334" : (afford?"#f6a":"#663333"); ctx.lineWidth=2;
      ctx.strokeRect(rowX, top, rowW, cardH);
      // a small icon per companion, same grammar as the wave shop's own cards
      pkShopIcon(ctx, rowX+cardH*0.55, y, cardH/24, PAL_ICON[k], !buyable?"#556":"#f6a");
      // name + action \u2014 shrunk to fit rather than left to run over the pips/cost column
      const textX=rowX+cardH*1.15, textMaxW=rowX+rowW*0.68-textX;
      const label = buyable
        ? (tier===0 ? td.n : "UPGRADE "+td.n)
        : PAL_TIERS[k][maxTier-1].n+" \u2014 "+(maxTier>1?"MAXED":"HIRED");
      ctx.textAlign="left";
      ctx.fillStyle = !buyable ? "#556" : (afford?"#fff":"#a55");
      pkFitText(ctx, label, textX, y-1, textMaxW, 7);
      // description or maxed note
      ctx.fillStyle = buyable?"#999":"#445";
      pkFitText(ctx, buyable ? td.fx : (maxTier>1?"ALL "+maxTier+" TIERS UNLOCKED":"ONE OF A KIND \u2014 ALREADY YOURS"), textX, y+11, textMaxW, 6);
      // tier pips: \u25A0 owned, \u25A1 not yet, shown on right above cost
      ctx.textAlign="right"; ctx.font="7px 'Press Start 2P',monospace";
      const pips="\u25A0".repeat(tier)+"\u25A1".repeat(maxTier-tier);
      ctx.fillStyle = tier>0?"#f6a":"#556";
      ctx.fillText(pips, rowX+rowW*0.97, y-1);
      // cost
      ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillStyle = !buyable?"#445":(ok?"#fff":"#f22");
      ctx.fillText(buyable?(cost+"\u25C6"):"", rowX+rowW*0.97, y+11);
      ctx.textAlign="left";
    });
    const doneY=h*pkRowYF(PAL_KINDS.length), doneH=h*0.055;
    ctx.strokeStyle="#666"; ctx.lineWidth=2;
    ctx.strokeRect(w*0.30,doneY-doneH*0.5,w*0.40,doneH);
    ctx.fillStyle="#888"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("DONE", w/2, doneY+doneH*0.15);
    ctx.textAlign="left";
  }
  if(PK.shop){
    // the shop itself lives on the park screen now, out of reach of the thumb that is busy
    // steering BONES — this is only a pointer so nobody hunts for it down here
    ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2; ctx.strokeRect(w*0.14,h*0.40,w*0.72,h*0.20);
    ctx.fillStyle="#e8c14a"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("\u2605 PARK SHOP OPEN", w/2, h*0.49);
    ctx.font="7px 'Press Start 2P',monospace"; ctx.fillStyle="#888";
    ctx.fillText("LOOK UP \u2191", w/2, h*0.56);
    ctx.textAlign="left";
  }
  ctx.textAlign="left";
}
(function(){
  const cv=document.querySelector("#parkcv");
  cv.addEventListener("pointerdown",e=>{
    if(!PK.active) return;
    const r=cv.getBoundingClientRect();
    if(PK.shop) return;      // shop taps belong to the park screen, not the pad
    if(PK.convertOpen){
      const yF=(e.clientY-r.top)/r.height;
      const cRowStep=0.10, cCardH=0.075, cRow0=0.33, tolF=cCardH/2;
      for(let i=0;i<BONES_EXCHANGE.length;i++){
        if(Math.abs(yF-(cRow0+i*cRowStep))<tolF){
          const o=BONES_EXCHANGE[i];
          if(o.label==="XP" && pkXPLeft()<=0){ beep(150,.1); toast("XP CAP REACHED FOR THIS RUN",1); }
          else if(o.label==="COMPASS" && PK.compass){ beep(150,.1); toast("ALREADY OWNED THIS RUN",1); }
          else if(PK.bones>=o.cost){ PK.bones-=o.cost; o.f(); beep(700,.06); toast(o.sub+" — DONE"); }
          else beep(150,.1);
          return;
        }
      }
      if(Math.abs(yF-(cRow0+BONES_EXCHANGE.length*cRowStep))<0.04){ PK.convertOpen=false; beep(400,.05); }
      return;
    }
    if(PK.friendsOpen){
      const yF=(e.clientY-r.top)/r.height;
      for(let i=0;i<PAL_KINDS.length;i++){
        if(pkRowHit(yF,i)){
          const k=PAL_KINDS[i];
          if(!pkPalBuyableK(k)){ beep(150,.1); return; }
          const td=pkNextTierData(k);
          if(!td || PK.bones<td.c){ beep(150,.1); return; }
          PK.bones-=td.c; pkBuyPal(k);
          const tier=pkPalTier(k);
          const msg=tier===1 ? td.n+" JOINS YOU" : td.n+" → T"+tier;
          toast(msg,1);
          beep(700,.06,"square",.04,{prio:2}); setTimeout(()=>beep(900,.06,"square",.04,{prio:2}),80);
          return;
        }
      }
      if(Math.abs(yF-pkRowYF(PAL_KINDS.length))<0.045){ PK.friendsOpen=false; beep(400,.05); }
      return;
    }
    const px=e.clientX-r.left, py=e.clientY-r.top;
    if(px>8 && px<118 && py>10 && py<40){ PK.convertOpen=true; beep(500,.05); return; }
    PK.joy={ox:e.clientX-r.left,oy:e.clientY-r.top,dx:0,dy:0};
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
  });
  cv.addEventListener("pointermove",e=>{
    if(!PK.active||!PK.joy) return;
    const r=cv.getBoundingClientRect();
    let dx=((e.clientX-r.left)-PK.joy.ox)/30, dy=((e.clientY-r.top)-PK.joy.oy)/30;
    const l=Math.hypot(dx,dy);
    if(l>1){dx/=l;dy/=l;}
    PK.joy.dx=dx; PK.joy.dy=dy;
  });
  const up=()=>{ PK.joy=null; };
  cv.addEventListener("pointerup",up); cv.addEventListener("pointercancel",up);
})();
