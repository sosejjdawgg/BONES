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
function pkHurt(n){
  if(PK.over>0){                       // the shield eats it first
    const ate=Math.min(PK.over,n);
    PK.over-=ate; n-=ate;
    PK.shake=Math.max(PK.shake||0,0.16);
    beep(540,.06,"square",.045);
    for(let i=0;i<5;i++){ const a2=Math.random()*6.283, sp=40+Math.random()*50;
      SPARKS.push({x:PK.x,y:PK.y-12,vx:Math.cos(a2)*sp,vy:Math.sin(a2)*sp-25,life:0.3,gold:true}); }
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
  {label:"TREAT", sub:"15 BONES → 1 BONE TREAT", cost:15, f:()=>{S.snacks+=1;}}
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
    showScreen("home"); renderMeters(); renderShop();
    return;
  }
  const note = pay<biscuits ? "<br><br>HE'S NEARLY FULL — ONLY +"+pay+" XP LEFT IN HIM TODAY." : "";
  openChoice("BONES LEFT OVER",
    "YOU HAVE "+biscuits+" BONES LEFT OVER.<br><br>BURY THEM IN THE GARDEN FOR XP?"+note,
    "BURY THEM — +"+pay+" XP", ()=>{
      const got=pkAwardXP(biscuits); beep(700,.08); setTimeout(()=>beep(950,.09),100);
      toast("+"+got+" XP FROM THE GARDEN.");
      showScreen("home"); renderMeters(); renderShop();
    },
    "LEAVE THEM", ()=>{ showScreen("home"); renderMeters(); renderShop(); });
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
    waveQuota:pkWaveQuota(1), waveSpawned:0,
    goldenDone:false, goldenAt:3+Math.random()*8, goldenWarned:false, goldenBanner:null,
    convertOpen:false, barkedTypes:{}, missionBarkAll:false, missionSurviveW1:false,
    maxhp:Math.round(100+100*S.mood/100),
    spd:95*(0.75+0.5*S.energy/100)*(S.senior?0.85:1)*lvlMul*moodMul,
    barkMax:Math.max(1.2,3-0.06*S.lvl), barkCd:1, pulse:0,
    barkR:21*(0.8+0.4*S.hunger/100), knock:150*(0.85+0.3*S.mood/100),
    bones:0, kills:0, xpFromRun:0, sideDone:0, relic:null, waveBanner:null, shopFlash:null, apeKills:0, apeWaveT:0, idleT:0,
    worldMult:4, groves:1, groveCenters:[], leaves:[], barkBigLvl:0, barkFastLvl:0, agiLvl:0, speedBonus:null, shopSel:null,
    chain:0, chainT:0, inv:0, fx:[],
    x:0,y:0,vx:0,vy:0, joy:null,
    en:[], fr:[], gate:{}, gateArm:true, gateAsk:false, started:false, shop:null, biscuits:[], drops:[], pendingBury:0, nuts:[],
    powerups:[], zoomT:0, over:0, regenT:0, regenAcc:0, hurtT:0, hpSeen:0, zoom:1, sniffLvl:0,
    trees:[], scorch:[], embers:[],
    plusMode:!!plus, mixTypes:null, mixLabel:null, swoopT:0,
    pals:[], palEyes:false, friendsOpen:false, friendsArm:false, npc:{x:.5,y:.5}
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
  PK.en.push({t:type, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
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
// WAVE 2 \u2014 BIRD BACKUP: long formations of birds fly in diagonally from either side (NE/NW/
// SW/SE bearings only), holding a staggered wedge. 1-hit kill like every other bird. If it'd
// fly clean off the engagement area, it rubber-bands its heading back toward the fray instead
// of leaving, so the flock keeps looping through until every last one is knocked down.
function pkSpawnFlock(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  // +25% count and +25% speed over the original baseline — more of them, and meaningfully faster
  const n=Math.min(Math.round((12+Math.floor(Math.random()*9))*1.25)*pkPlusMult(), remaining);
  const diagonals=[Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75];
  const ang=diagonals[Math.floor(Math.random()*4)], perp=ang+Math.PI/2;
  const R=Math.max(w,h)*0.85;
  const cx=PK.x-Math.cos(ang)*R, cy=PK.y-Math.sin(ang)*R;   // upstream of the flight path
  const sp=(90+Math.random()*20)*1.25;
  for(let i=0;i<n;i++){
    const off=(i-(n-1)/2)*15+(Math.random()-0.5)*8;         // staggered wedge formation
    const sxo=cx+Math.cos(perp)*off, syo=cy+Math.sin(perp)*off;
    PK.en.push({t:"bird", flock:true, x:(sxo+WW)%WW, y:(syo+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
      ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  if(Math.random()<STALK_CHANCE) pkSpawnStalkCat(PK.x+(Math.random()-0.5)*80, PK.y+(Math.random()-0.5)*80, 1+Math.floor(Math.random()*2));
  toast(n+" BIRDS INBOUND \u2014 BACKUP ARRIVES!",1);
  beep(520,.09,"square",.05); setTimeout(()=>beep(680,.09,"square",.05),90);
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
  pkBuildWoods(PK.groves||1);
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
  return planted;
}
// the main grove always sits straight up or down from where BONES starts, so you always know
// which way to head to find it; further groves (from expanding the park) land in whichever
// quarter is still empty, so they never stack on top of each other or the first one
function pkBuildWoods(n){
  PK.groveCenters=[];
  const cx=PK.WW*0.5, dir=Math.random()<0.5?1:-1, off=Math.min(PK.WH*0.30, pkGroveOuterR()*2.6);
  pkBuildGrove(cx, PK.WH*0.5+dir*off, true);
  const extraSlots=[[0.5,0.5-dir*off*2.1/PK.WH], [0.18,0.22],[0.82,0.78],[0.18,0.78],[0.82,0.22]];
  for(let i=1;i<n;i++){
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
const FIRE_CAP=5;   // at most this many trees burning at once — a whole ring alight would be unplayable
function pkFireCount(){ let n=0; for(const t of PK.trees) if(t.state==="fire") n++; return n; }
function pkIgniteTree(tr){
  if(!tr || tr.state!=="ok") return;
  if(pkFireCount()>=FIRE_CAP) return;   // the beam still stops here (pkBeamBlocker), it just won't catch
  tr.state="fire"; tr.fireT=0; tr.spawnT=0.25;
  // solo tree, cornered and panicking: the full 15. Packed shoulder-to-shoulder in the ring,
  // there's nowhere for that many to have been living — down to as few as 3.
  tr.spawnMax=clamp(15-pkTreeClusterCount(tr)*1.4, 3, 15);
  toast("THE TREE'S ALIGHT — THEY'RE POURING OUT!",1);
  beep(90,.45,"sawtooth",.09); setTimeout(()=>beep(140,.35,"sawtooth",.07),110);
  // this tree is somebody's home — a small chance something much bigger evacuates while it's
  // still burning (not after: a stump is useless to it). Wave 8 has its own dedicated, far more
  // frequent ape assault, so this rare roll sits out that wave.
  if(PK.wave!==APE_WAVE && pkApeCount()<APE_CAP && Math.random()<0.05){
    tr.quakeT=APE_TELL_TIME; tr.quakeMax=APE_TELL_TIME;
  }
}
function pkSpawnApeRaw(x,y,hpBase){
  const hp=pkEnemyHp(hpBase);
  PK.en.push({t:"ape", boss:true, x, y, hp, hpMax:hp, sp:APE_SPD,
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
    beep(58,.5,"sawtooth",.1); setTimeout(()=>beep(58,.5,"sawtooth",.1),120);
  }
}
// first non-ash tree a beam runs into: it soaks the shot (cover) and catches light
function pkBeamBlocker(ox,oy,ang,range){
  const ux=Math.cos(ang), uy=Math.sin(ang);
  let best=null, bestD=range;
  for(const tr of PK.trees){
    if(tr.state==="ash" || tr.knockT>0) continue;
    const dx=wd(tr.x-ox,PK.WW), dy=wd(tr.y-oy,PK.WH);
    const along=dx*ux+dy*uy;
    if(along<=0 || along>=bestD) continue;
    if(Math.abs(dx*uy-dy*ux)>TREE_R) continue;
    best=tr; bestD=along;
  }
  return {tree:best, dist:bestD};
}
// keeps BONES out of a trunk — slides him around it rather than stopping him dead
function pkTreeCollide(px,py){
  for(const tr of PK.trees){
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
  for(let ti=PK.trees.length-1;ti>=0;ti--){
    const tr=PK.trees[ti];
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
        PK.trees.splice(ti,1);
        continue;
      }
    }
    tr.sway+=dt*(tr.state==="fire"?5:1.1);
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
    if(tr.spawnT<=0 && tr.spawned<(tr.spawnMax||TREE_SPAWN_MAX)){   // a burning nest keeps disgorging squirrels
      tr.spawnT=TREE_SPAWN_EVERY;
      tr.spawned++;
      const a=Math.random()*6.283;
      PK.en.push({t:"sq", madsq:true, fromTree:true,
        x:(tr.x+Math.cos(a)*TREE_R+PK.WW)%PK.WW, y:(tr.y+Math.sin(a)*TREE_R+PK.WH)%PK.WH,
        hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:44, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
        laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.8+Math.random()*1.2});
      beep(320+Math.random()*160,.04,"square",.02);
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
const TREE_R=15, TREE_BURN_TIME=10, TREE_SPAWN_MAX=15, TREE_SPAWN_EVERY=0.65;
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
const APE_TELL_TIME=1.8;   // how long the stump trembles/glows before the ape actually bursts out
function pkApeCount(){ let n=0; for(const e of PK.en) if(e.t==="ape" && !e.fleeing) n++; return n; }
// WAVE 8 — apes start dropping out of the trees themselves, in couples, far more often than
// the rare fire-triggered spawn; clearing this wave means downing APE_WAVE_QUOTA of them while
// the ordinary mixed enemies for this stage keep spawning and attacking in the background
const APE_WAVE=8, APE_WAVE_QUOTA=10, APE_WAVE_CAP=6, APE_WAVE_HP=18;
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
      PK.en.push({t:"bird", standing:true, roost, x:(cx+ox+WW)%WW, y:(cy+oy+WH)%WH,
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
    PK.en.push({t:"cat", stalk:true, x:(ax+WW)%WW, y:(ay+WH)%WH,
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
    PK.en.push({t:"cat", x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
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
  PK.en.push({t:"bird", swoop:true, x:(PK.x-w*0.7+WW)%WW, y,
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
    PK.en.push({t:"sq", ranger:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:RANGER_APPROACH_SPD, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      atkState:"approach", atkCd:0.6+Math.random()*0.8});
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
    PK.en.push({t:"sq", madsq:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:pkEnemyHp(1), hpMax:pkEnemyHp(1), sp:44, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
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
    PK.en.push({t:"cat", alpha:true, big:true, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
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
// waves 6+: the interval between bursts, and how wide a burst fans out — both climb with the
// wave, or by wave 10-11 the player is just walking around waiting for the next trickle instead
// of being run ragged. Fixed at wave 6's original pace, ramps from there.
function pkMixInterval(wv){ return Math.max(0.9, 3.5-Math.max(0,wv-6)*0.35); }
function pkSpawnMixBurst(types){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const remaining=Math.max(1, PK.waveQuota-PK.waveSpawned);
  const climb=Math.max(0,PK.wave-6);
  const n=Math.min(((1+Math.floor(Math.random()*3))+Math.floor(climb/2))*pkPlusMult(), remaining);
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  const spread=Math.min(6.283, 0.9+climb*0.15);   // fans out wider each wave — surrounded, not funneled
  for(let i=0;i<n;i++){
    const type=types[Math.floor(Math.random()*types.length)];
    const a2=ang+(Math.random()-0.5)*spread;
    const x=(PK.x+Math.cos(a2)*R+WW)%WW, y=(PK.y+Math.sin(a2)*R+WH)%WH;
    if(type==="bird") PK.en.push({t:"bird", x,y, hp:pkEnemyHp(1),hpMax:pkEnemyHp(1), sp:106.25, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0});   // +25% over the original 85
    else if(type==="cat") PK.en.push({t:"cat", x,y, hp:pkEnemyHp(2),hpMax:pkEnemyHp(2), sp:48, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0});
    else if(type==="ranger") PK.en.push({t:"sq", ranger:true, x,y, hp:pkEnemyHp(1),hpMax:pkEnemyHp(1), sp:RANGER_APPROACH_SPD, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0, atkState:"approach", atkCd:0.6+Math.random()*0.8});
    else if(type==="madsq") PK.en.push({t:"sq", madsq:true, x,y, hp:pkEnemyHp(1),hpMax:pkEnemyHp(1), sp:44, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0, laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.6+Math.random()*0.8});
  }
  return n;
}
// how many enemies a wave needs cleared \u2014 hand-set to match the redesigned wave-by-wave
// spec. waves beyond 10 keep extending the mix pattern with a gently rising quota.
function pkWaveQuota(wv){
  if(wv===1) return 1;    // literally one bird
  if(wv===2) return 10;   // the birds are upset
  if(wv===3) return 10;   // attack of the cats
  if(wv===4) return 15;   // watch out, nuts
  if(wv===5) return 15;   // coming out of the trees
  return Math.round(20*Math.pow(1.25, wv-6));   // 20, 25, 31, 39, 49, 61, 76...
}
// what each wave is called. 6 onwards is the same escalating joke, told straight.
const WNAME={
  1:"CATCH A BIRD",
  2:"THE BIRDS ARE UPSET — DEFEND YOURSELF!",
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
const BARK_CAP=62;   // hard ceiling: the bark used to reach ~90 and trivialised whole waves
// enemies that never block a wave clearing and never count toward "N LEFT" — side hazards
// the player opted into (a burning tree's squirrels) or ambient extras (stalking cats, the
// decorative wave-3 swoop bird), as opposed to the wave's actual, fixed quota
function pkSideHazard(e){ return e.stalk || e.stalkAggro || e.swoop || e.fromTree || e.decor || e.boss || (e.roost && e.roost.killed>=e.roost.need); }
// shared by both "N LEFT" displays (the pad and the camera header) — wave 8 tracks ape kills
// instead of the usual mixed quota, since that's this stage's actual objective
function pkLeftCount(){
  if(PK.wave===APE_WAVE) return Math.max(0, APE_WAVE_QUOTA-(PK.apeKills||0));
  return Math.max(0,PK.waveQuota-PK.waveSpawned)+PK.en.filter(e=>!e.fleeing && !pkSideHazard(e)).length;
}
function pkWavePct(){
  if(PK.wave===APE_WAVE) return clamp((PK.apeKills||0)/APE_WAVE_QUOTA,0,1);
  return clamp(1-pkLeftCount()/Math.max(1,PK.waveQuota),0,1);
}
const FLEE_SPEED=115, FLEE_TIME=2.2;   // how fast, and how long, a scared-off enemy scuttles before despawning
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
  beep(190,.1,"square",.06);
  let hits=0;
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    if(e.fleeing) continue;   // already scared off — can't be hit again
    const dxw=wd(e.x-PK.x,PK.WW), dyw=wd(e.y-PK.y,PK.WH);
    const d=Math.hypot(dxw,dyw)||1;
    if(d<PK.barkR+pkHitR(e)){
      e.hp--;   // flat, regardless of how many others are in the circle with it — no falloff
      // every enemy type barked at counts toward the "bark at everybody" side mission
      PK.barkedTypes[e.t]=true;
      if(!PK.missionBarkAll && PK.barkedTypes.sq && PK.barkedTypes.bird && PK.barkedTypes.cat){
        PK.missionBarkAll=true; pkAwardXP(20);
        pkFanfare(null,false,"✓ BARKED AT EVERYONE — +20 XP");
      }
      if(e.hp<=0){
        // he doesn't kill anyone anymore: one bone drops where they were caught, they look
        // shocked, then scuttle off-screen on their own — pkEn's fleeing branch handles the rest
        PK.drops.push({x:e.x, y:e.y, v:e.boss?8:1, gold:!!e.alpha||!!e.boss, life:25});
        if(Math.random()<MAGNET_DROP_CHANCE) PK.powerups.push({type:"magnet", x:e.x, y:e.y+10, life:18});
        if(Math.random()<REGEN_DROP_CHANCE) PK.powerups.push({type:"regen", x:e.x, y:e.y, life:18});
        PK.kills++;
        hits++;
        if(e.roost) e.roost.killed++;
        if(e.boss){ PK.apeKills=(PK.apeKills||0)+1; pkFanfare(null,false,"✓ THE APE IS DOWN — +8 BONES"); }
        e.fleeing=true; e.shockT=0.35; e.fleeT=0; e.hitT=0.3;
        e.fleeVx=-dxw/d*FLEE_SPEED; e.fleeVy=-dyw/d*FLEE_SPEED;
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
function pkExpandPark(){
  PK.worldMult=Math.min(8,PK.worldMult+0.5);
  if(Math.random()<0.5 && PK.groves<3){ PK.groves++; toast("THE PARK GREW — AND SO DID THE TREES."); }
  PK.zoom=Math.max(0.76,1-(PK.worldMult-4)*0.06);   // zoom out a touch as the park grows, for a wider view
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
const PAL_KINDS=["sq","bird","cat"];
const PAL_TIERS={
  sq:[
    {n:"SQUIRREL PAL", fx:"FOLLOWS YOU, THROWS NUTS (SLOW)", c:10},
    {n:"SQUIRREL PAL", fx:"FASTER FIRE, MORE DAMAGE",        c:18},
    {n:"SQUIRREL PAL", fx:"FASTER STILL, HEAVIER HITS",      c:26},
    {n:"SQUIRREL PAL", fx:"T4: LASER EYES UNLOCKED",         c:38},
  ],
  bird:[
    {n:"BIRD FLOCK",   fx:"4 BIRDS, EVERY 14 SEC",           c:13},
    {n:"BIRD FLOCK",   fx:"6 BIRDS, EVERY 10 SEC",           c:21},
    {n:"BIRD FLOCK",   fx:"8 BIRDS, EVERY 8 SEC",            c:31},
    {n:"BIRD FLOCK",   fx:"10 BIRDS, EVERY 7 SEC — DOUBLE DAMAGE",c:44},
  ],
  cat:[
    {n:"CAT FRIEND",   fx:"SHORT RANGE, SLOW POUNCE",        c:12},
    {n:"CAT FRIEND",   fx:"WIDER PATROL, FASTER",            c:20},
    {n:"CAT FRIEND",   fx:"QUICK AND AGGRESSIVE",            c:30},
    {n:"CAT FRIEND",   fx:"T4: FULL POWER, POUNCES ANYTHING",c:38},
  ]
};
function pkPalTier(k){ const p=PK.pals.find(q=>q.k===k); return p?p.tier:0; }
function pkPalBuyableK(k){ return pkPalTier(k)<4; }
function pkNextTierData(k){ const t=pkPalTier(k)+1; return t<=4?PAL_TIERS[k][t-1]:null; }
function pkBuyPal(k){
  const existing=PK.pals.find(p=>p.k===k);
  const tier=(existing?existing.tier:0)+1;
  if(tier>4) return;
  if(existing){
    // upgrade: update stats in place, keep position and motion
    existing.tier=tier;
    if(k==="sq"){ existing.hpMax=pkSqHp(tier); existing.hp=Math.min(existing.hp+4,existing.hpMax); existing.cd=pkSqCd(tier); }
    if(k==="cat"){ existing.hpMax=pkCatHp(tier); existing.hp=Math.min(existing.hp+3,existing.hpMax); }
    if(k==="bird"){ existing.passT=Math.min(existing.passT, pkBirdEvery(tier)); }
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
}
// one shared kill path for everything a companion does, so a friend's hit resolves exactly like
// a bark: a bone drops, they look shocked, then they scuttle off under their own steam
function pkPalHit(e,dmg,ux,uy){
  if(e.fleeing) return;
  e.hp-=dmg;
  if(e.hp<=0){
    PK.drops.push({x:e.x, y:e.y, v:e.boss?8:1, gold:!!e.alpha||!!e.boss, life:25});
    if(Math.random()<MAGNET_DROP_CHANCE) PK.powerups.push({type:"magnet", x:e.x, y:e.y+10, life:18});
    if(Math.random()<REGEN_DROP_CHANCE) PK.powerups.push({type:"regen", x:e.x, y:e.y, life:18});
    PK.kills++;
    if(e.roost) e.roost.killed++;
    if(e.boss){ PK.apeKills=(PK.apeKills||0)+1; pkFanfare(null,false,"✓ THE APE IS DOWN — +8 BONES"); }
    e.fleeing=true; e.shockT=0.35; e.fleeT=0;
    e.fleeVx=ux*FLEE_SPEED; e.fleeVy=uy*FLEE_SPEED;
    beep(950,.08,"square",.04);
  } else { e.kx=ux*PK.knock*0.7; e.ky=uy*PK.knock*0.7; }
}
function pkNearestEnemy(x,y,maxR){
  let best=null, bd=maxR;
  for(const e of PK.en){
    if(e.fleeing) continue;
    const d=Math.hypot(wd(e.x-x,PK.WW),wd(e.y-y,PK.WH));
    if(d<bd){ bd=d; best=e; }
  }
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
            beep(1000,.05,"square",.03);
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
          beep(620,.04,"square",.02);
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
            beep(320,.05,"square",.04);
            p.state="orbit"; p.tgt=null;
          }
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
          beep(210,.05,"square",.03);
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
    {n:"BIGGER BARK", ic:"bark",  fx:"+10 BARK RADIUS",    c:12, capKey:"barkBigLvl",  f:()=>{PK.barkR=Math.min(BARK_CAP,PK.barkR+10); PK.barkBigLvl++;}},
    {n:"FASTER BARK", ic:"fast",  fx:"-0.35s COOLDOWN",     c:14, capKey:"barkFastLvl",f:()=>{PK.barkMax=Math.max(0.8,PK.barkMax-0.35); PK.barkFastLvl++;}},
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
  PK.shop = pool.sort(()=>Math.random()-0.5).slice(0,3);
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
  for(const e of PK.en) if(e.hitT>0) e.hitT-=dt;
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
  // a wave only ends once its full quota has spawned AND every last enemy is down (fleeing
  // stragglers don't count \u2014 they're already defeated, just scuttling off in the background;
  // spooked-but-alive roost birds that got away clean also don't block the clear)
  // a startled bird is still very much alive — it only settles back down — so it has to block
  // the clear like anything else. Only downed enemies and ambient extras are ignored here.
  // WAVE 8 is the one exception: its objective is ape kills specifically, not the usual mixed
  // quota (which the normal mix spawner still runs in the background the whole time)
  const waveClear = PK.wave===APE_WAVE
    ? (PK.apeKills||0)>=APE_WAVE_QUOTA
    : (PK.waveSpawned>=PK.waveQuota && !PK.en.some(e=>!e.fleeing && !pkSideHazard(e)));
  if(waveClear){
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
    // the roost that just satisfied this wave's quota, and any stalking cats that came with it,
    // have done their job — clear them out so they don't linger as bird-shaped red herrings the
    // player can keep "catching" with zero effect on the next wave's actual goal
    PK.en=PK.en.filter(e=>!((e.roost && e.roost.killed>=e.roost.need) || e.stalk || e.stalkAggro));
    tickStats(2.5, true);   // a cleared wave is 15 game minutes — the only time the park spends
    PK.waveT=0; PK.wave++;
    if(PK.wave>=3) tickTodo("j_wave3");
    PK.barkMax=Math.max(1,PK.barkMax-0.12); PK.barkR=Math.min(BARK_CAP,PK.barkR+3.5);
    PK.waveQuota=pkWaveQuota(PK.wave); PK.waveSpawned=0;
    PK.goldenDone=false; PK.goldenAt=3+Math.random()*8; PK.goldenWarned=false;
    if(PK.wave===6) pkSpawnAlphaSquad();
    // from wave 6 the types come mixed \u2014 that is the point of "you're on your own"
    if(PK.wave>=6){ PK.mixTypes=pkPickMixTypes(); PK.mixLabel=MIX_NAME[PK.mixTypes[0]]+" & "+MIX_NAME[PK.mixTypes[1]]; }
    if(PK.wave===APE_WAVE){ PK.apeKills=0; PK.apeWaveT=2.5; }
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
  if(PK.spawnT<=0 && PK.waveSpawned<PK.waveQuota){
    const wv=PK.wave;
    if(wv===1){ PK.spawnT=5.5; PK.waveSpawned+=pkSpawnBirdGroup(); }             // CLEAR THE BIRDS: loose roosts, standing until disturbed
    else if(wv===2){ PK.spawnT=8; PK.waveSpawned+=pkSpawnFlock(); }              // BIRD BACKUP: long diagonal formations
    else if(wv===3){ PK.spawnT=4; PK.waveSpawned+=pkSpawnCatSquad(); }           // CAT BACKUP: direct cat squads
    else if(wv===4){ PK.spawnT=4.5; PK.waveSpawned+=pkSpawnRangerSquad(); }      // NUT THROWERS: ranged squirrels
    else if(wv===5){ PK.spawnT=5; PK.waveSpawned+=pkSpawnMadSquad(); }           // out of the trees: rotating-beam squirrels
    else { PK.spawnT=pkMixInterval(PK.wave); PK.waveSpawned+=pkSpawnMixBurst(PK.mixTypes||pkPickMixTypes()); }   // mixed threats, wave 6+
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
      if(e.fleeT>FLEE_TIME) PK.en.splice(i,1);
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
        beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
      }
      continue;
    }
    // WAVE 2 — a dozing sentry squirrel: stays put until BONES wanders close, then wakes
    // up and joins the normal chase-and-bite behaviour below
    // WAVE 3 — decorative swoop bird: straight line, no attack, times out on its own
    if(e.swoop){
      e.x=(e.x+e.vx*dt+WW)%WW;
      e.life-=dt;
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      if(e.life<=0){ PK.en.splice(i,1); }
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
          beep(520,.06,"square",.03);
        }
      }
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
      if(d<14 && PK.inv<=0 && !pkInvuln()){
        pkHurt(6); PK.inv=0.6; e.kx=-dxw/d*200; e.ky=-dyw/d*200;
        beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
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
          beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
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
                PK.drops.push({x:o.x, y:o.y, v:o.boss?8:1, gold:!!o.boss, life:25});
                PK.kills++;
                if(o.roost) o.roost.killed++;
                if(o.boss){ PK.apeKills=(PK.apeKills||0)+1; pkFanfare(null,false,"✓ THE APE IS DOWN — +8 BONES"); }
                o.fleeing=true; o.shockT=0.3; o.fleeT=0;
                o.fleeVx=ux*FLEE_SPEED; o.fleeVy=uy*FLEE_SPEED;
                PK.scorch.push({x:o.x, y:o.y, r:12+Math.random()*6});
                beep(120,.16,"sawtooth",.05);
              }
            }
          }
        }
        if(e.sweepT>=MADSQ_SWEEP_TIME){
          PK.drops.push({x:e.x, y:e.y, v:1, life:25});
          if(Math.random()<MAGNET_DROP_CHANCE) PK.powerups.push({type:"magnet", x:e.x, y:e.y+10, life:18});
          if(Math.random()<REGEN_DROP_CHANCE) PK.powerups.push({type:"regen", x:e.x, y:e.y, life:18});
          PK.kills++;
          e.fleeing=true; e.shockT=0; e.fleeT=0; e.fleeVx=0; e.fleeVy=0;
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
          beep(140,.3,"sawtooth"); if(PK.hp<=0) return pkDeath();
        }
      } else {
        const [ux2,uy2]=pkSteer(e,e.x,e.y,dxw/d,dyw/d); const sx=ux2*e.sp, sy=uy2*e.sp;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        e.leapCd-=dt;
        if(e.leapCd<=0 && d<ALPHA_LEAP_R){ e.leapState="windup"; e.leapWindT=0.6; e.leapAng=Math.atan2(dyw,dxw); }
        if(d<16 && PK.inv<=0 && !pkInvuln()){
          pkHurt(14); PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
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
          beep(65,.35,"sawtooth",.1);
          const ldx=wd(PK.x-e.x,WW), ldy=wd(PK.y-e.y,WH), ld=Math.hypot(ldx,ldy)||1;
          if(ld<APE_SLAM_R && PK.inv<=0 && !pkInvuln()){
            pkHurt(APE_SLAM_DMG); PK.inv=0.9; PK.shake=0.8;
            PK.vx=ldx/ld*220; PK.vy=ldy/ld*220;
            beep(120,.3,"sawtooth"); if(PK.hp<=0) return pkDeath();
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
        e.leapCd-=dt;
        // the leap is the primary attack — it fires on cooldown whenever not already adjacent,
        // regardless of exactly how far away BONES is (long range is the point)
        if(e.leapCd<=0 && d>APE_LEAP_MINR){ e.leapState="windup"; e.leapWindT=APE_WINDUP; }
        if(d<20 && PK.inv<=0 && !pkInvuln()){
          pkHurt(APE_TOUCH_DMG); PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
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
  pkPalsUpdate(dt,WW,WH);
  pkPalDamage(dt,WW,WH);
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
      if(f.golden){ pkGain(20,f.x,f.y); pkZoomies(); }
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
        p.hp-=6; beep(180,.08,"square",.03); hitPal=true; break;
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
      let got=Math.round(PK.hp-before), over=0;
      if(heal-got>0.5){                   // already full: the rest banks as a shield
        const spill=heal-(PK.hp-before);
        const ob=PK.over; PK.over=Math.min(pkOverCap(), PK.over+spill);
        over=Math.round(PK.over-ob);
      }
      PK.fx.push({x:a.x*WW, y:a.y*WH-16,
                  txt: over>0 ? "+"+over+" SHIELD" : got>0 ? "+"+got+" HP" : "FULL", life:1.2});
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
  $("#resLines").innerHTML="90% OF HIS BONES ("+lost+") LIE WHERE HE FELL.<br>"+PK.kills+" DOWNED, "+PK.sideDone+" SIDE OBJECTIVES \u2014 "+earned+" XP MADE IT HOME.<br>NEXT VISIT: GO CLAIM THE REST \u2014 IF YOU DARE.";
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
  const band=sub?h*0.22:h*0.15, top=h*0.33-rise;
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
function pkDrawScorch(ctx,SC,w,h){
  for(const sc of PK.scorch){
    const [x,y]=SC(sc.x,sc.y);
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
  const ghost = e.fleeing ? 0.34 : 1;
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
  let img;
  if(e.introT>0) img = APEIMG.idle[0];
  else if(e.leapState==="windup") img = APEIMG.jump[0];
  else if(e.leapState==="leap") img = prog<0.4 ? APEIMG.jump[0] : APEIMG.jump[1];
  else if(e.landT>0) img = APEIMG.jump[2];
  else img = APEIMG.run[Math.floor(e.fi)%APEIMG.run.length];
  if(!img || !img.complete || !img.naturalWidth){ ctx.restore(); return; }
  const eh=38, ew=eh*img.naturalWidth/img.naturalHeight;
  const dy=sy-lift;
  if(lift>1){
    // a small ground contact shadow keeps drifting under it while it's lifted, distinct from
    // the big dark landing-zone ellipse already drawn above at the true impact point
    ctx.save(); ctx.globalAlpha*=0.25*(lift/APE_ARC_H);
    ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(sx, sy+5, 11, 3.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(e.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage(img, sx-ew/2, dy-eh, ew, eh);
  ctx.restore();
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
function drawEnemy(ctx,e,sx,sy){
  if(e.t==="ape") return drawApe(ctx,e,sx,sy);
  // an enemy that has been seen off is already out of the fight, so it fades right down —
  // at a glance you can tell what still needs barking at and what is just running away
  const ghost = e.fleeing ? 0.34 : 1;
  ctx.save(); ctx.globalAlpha*=ghost;
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx, sy+2, 9, 3, 0, 0, 7); ctx.fill();
  if(e.madsq && !e.fleeing) drawLaserFX(ctx,e,sx,sy);
  if((e.fleeing && e.shockT>0 && !e.madsqExplode || (e.spooked && e.spookT<0.3) || (e.stalkAggro && (e.leapT>0||e.windT>0))) && Math.floor(performance.now()/90)%2){
    ctx.fillStyle="#fff"; ctx.font="bold 13px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("!", sx, sy-24); ctx.textAlign="left";
  }
  if((e.atkState==="windup" || e.leapState==="windup") && Math.floor(performance.now()/80)%2){
    ctx.fillStyle="#f22"; ctx.beginPath(); ctx.arc(sx, sy-26, 2.4, 0, 7); ctx.fill();
  }
  // mad squirrels glow red the whole time they're charging or sweeping their beam
  const madGlow = e.madsq && (e.laserState==="charge" || e.laserState==="sweep");
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
  if(madGlow){
    ctx.save(); ctx.globalAlpha=0.4+0.3*Math.sin(performance.now()/70); ctx.fillStyle="#f22";
    ctx.beginPath(); ctx.ellipse(sx, sy-eh*0.5, ew*0.65, eh*0.65, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(madGlow) ctx.filter="sepia(1) saturate(8) hue-rotate(-50deg) brightness(1.1)";
  if(e.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage(img, sx-ew/2, sy-eh, ew, eh);
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
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx,sy+2,9,3,0,0,7); ctx.fill();
  if(p.k==="sq" && p.tier>=4) drawPalLaserFX(ctx,p,sx,sy);
  const frames=ENEMYIMG[p.k];
  const img=frames && frames[p.fi%frames.length];
  const eh = p.k==="cat" ? 22 : 16;
  if(!img || !img.complete || !img.naturalWidth){
    ctx.fillStyle="#6cf"; ctx.beginPath(); ctx.arc(sx,sy-eh*0.5,eh*0.4,0,7); ctx.fill();
  } else {
    const ew=eh*img.naturalWidth/img.naturalHeight;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    ctx.filter="saturate(0.5) hue-rotate(150deg) brightness(1.15)";
    if(p.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
    ctx.drawImage(img, sx-ew/2, sy-eh, ew, eh);
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
  ctx.filter="saturate(0.5) hue-rotate(150deg) brightness(1.15)";
  if(bd.vx<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage(img, sx-ew/2, by-eh, ew, eh);
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
  pkDrawScorch(ctx,SC,w,h);
  for(const a of PK.acts){
    const [ax,ay]=SC(a.x*WW,a.y*WH);
    if(ax<-70||ax>w+70||ay<-70||ay>h+70) continue;
    const img=PROPIMG[a.k], ph=a.k==="hoop"?42:26;
    const pw=img.naturalWidth?ph*img.naturalWidth/img.naturalHeight:ph*2.5;
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(ax,ay+ph/2-2,pw*0.42,5,0,0,7); ctx.fill();
    ctx.globalAlpha = a.cd<=0 ? 0.85+0.15*Math.sin(t*5) : 0.35;
    if(img.complete&&img.naturalWidth){ ctx.imageSmoothingEnabled=false; ctx.drawImage(img,ax-pw/2,ay-ph/2,pw,ph); }
    ctx.globalAlpha=1;
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
    const [nx2,ny2]=SC(n.x,n.y);
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
  for(const tr of PK.trees){
    const [tx2,ty2]=SC(tr.x,tr.y);
    if(tx2<-70||tx2>w+70||ty2<-90||ty2>h+70) continue;
    pkDrawTree(ctx,tr,tx2,ty2,t);
  }
  for(const e of PK.en){
    const [ex2,ey2]=SC(e.x,e.y);
    if(ex2<-40||ex2>w+40||ey2<-40||ey2>h+40) continue;
    drawEnemy(ctx,e,ex2,ey2);
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
    const [lx,ly]=SC(lf.x,lf.y);
    if(lx<-10||lx>w+10||ly<-10||ly>h+10) continue;
    ctx.save();
    ctx.globalAlpha=Math.min(1,lf.life*0.7);
    ctx.translate(lx,ly); ctx.rotate(lf.t*1.4+lf.ph);
    ctx.fillStyle="#5a8a3a"; ctx.beginPath(); ctx.ellipse(0,0,3.2,1.6,0,0,7); ctx.fill();
    ctx.restore();
  }
  for(const em of PK.embers){
    const [ex3,ey3]=SC(em.x,em.y);
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
  }
  for(const dr of PK.drops){
    const [dx2,dy2]=SC(dr.x,dr.y);
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
    const [hx,hy]=SC(fxm.x,fxm.y);
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
    const [sx,sy]=SC(s.x,s.y);
    ctx.globalAlpha=Math.max(0,s.life);
    ctx.fillStyle=s.heal?"#3fdc7a":s.gold?"#e8c14a":"#fff";
    ctx.fillRect(sx-2,sy-2,4,4);
    ctx.globalAlpha=1;
  }
  if(PK.chain>1){
    const f3=clamp(PK.chainT/3,0,1), c3=Math.round(120+135*f3);
    ctx.fillStyle="rgb("+c3+","+c3+","+c3+")";
    ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("x"+PK.chain, DX, DY-42); ctx.textAlign="left";
  }
  ctx.restore();   // exit the world zoom transform before any fixed-to-screen overlay
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
  {
    // wave progress, sat directly under the DOGPARK header so everything about the wave
    // reads in one place at the top of the screen
    const pct=pkWavePct();
    const bw=w*0.46, bx=w/2-bw/2, by=25;
    ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(bx,by,bw,7);
    ctx.fillStyle="#4a9"; ctx.fillRect(bx+1,by+1,(bw-2)*pct,5);
    ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,7);
    ctx.fillStyle="#cfe6ff"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(Math.round(pct*100)+"% CLEAR", w/2, by+17); ctx.textAlign="left";
  }
  // wave-transition banner \u2014 pops in, holds, fades, so a new wave actually reads as an event.
  // the golden-bird heads-up reuses the exact same treatment, just gold instead of red, so the
  // two read as one consistent "big event" idiom rather than two different UI languages
  pkDrawBanner(ctx,w,h,PK.waveBanner,"#f22");
  pkDrawBanner(ctx,w,h,PK.goldenBanner,"#e8c14a");
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
  else { ctx.beginPath(); ctx.arc(0,0,6,0,7); ctx.stroke(); }
  ctx.restore();
}
// one shared row geometry, used by both the draw and the hit test so they can never drift
function pkShopRows(w,h){
  const rows=[];
  const cardH=h*0.125, step=h*0.135, top0=h*0.225;
  for(let i=0;i<3;i++) rows.push({x:w*0.07, y:top0+i*step, w:w*0.86, h:cardH, kind:"offer", idx:i});
  rows.push({x:w*0.07, y:h*0.635, w:w*0.86, h:cardH, kind:"charm", idx:0});
  rows.push({x:w*0.32, y:h*0.80,  w:w*0.36, h:h*0.10, kind:"skip", idx:0});
  return rows;
}
function pkShopCard(ctx,r,o,col,dim,afford){
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.globalAlpha=dim;
  ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(r.x,r.y,r.w,r.h);
  pkShopIcon(ctx, r.x+r.h*0.52, r.y+r.h*0.5, r.h/26, o.ic, col);
  ctx.textAlign="left"; ctx.font="8px 'Press Start 2P',monospace"; ctx.fillStyle=col;
  ctx.fillText(o.n, r.x+r.h*1.05, r.y+r.h*0.42);
  ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#9a9a9a";
  ctx.fillText(o.fx, r.x+r.h*1.05, r.y+r.h*0.75);
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
  ctx.textAlign="left"; ctx.restore();
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
    if(PK.relic){
      const rc=PK_CHARMS.find(c=>c.id===PK.relic);
      if(rc){ ctx.fillStyle="#f22"; ctx.font="6px 'Press Start 2P',monospace"; ctx.fillText("\u2b25 "+rc.name, 10, 46); }
    }
    // sub-friends' health lives directly under BONES' own bar, smaller \u2014 he's their leader.
    // only squirrel/cat carry HP at all (the bird flock is never itself a target)
    let ppy=by+bh2+8;
    for(const kind of ["sq","cat"]){
      const p=PK.pals.find(q=>q.k===kind);
      if(!p) continue;
      const pw=86, ph2=8, pbx=bx+bw2-pw;
      const pfrac=clamp(p.hp/p.hpMax,0,1);
      ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(pbx-1,ppy-1,pw+2,ph2+2);
      ctx.strokeStyle="#6cf"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,ppy+0.5,pw-1,ph2-1);
      ctx.fillStyle = pfrac<0.35 ? "#f22" : "#6cf";
      ctx.fillRect(pbx+1,ppy+1,(pw-2)*pfrac,ph2-2);
      ctx.fillStyle="#6cf"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="right";
      ctx.fillText(kind==="sq"?"SQUIRREL":"CAT", pbx-4, ppy+ph2-1);
      ctx.textAlign="left";
      ppy+=ph2+5;
    }
  }
  ctx.textAlign="left";
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
    ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(w*0.06,h*0.07,w*0.88,h*0.55);
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
      const spent = o.label==="XP" && pkXPLeft()<=0;
      const afford=PK.bones>=o.cost && !spent;
      ctx.strokeStyle = spent?"#334":(afford?"#fff":"#663333"); ctx.lineWidth=2;
      ctx.strokeRect(w*0.10, top, w*0.80, cCardH);
      ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
      ctx.fillStyle = spent?"#556":(afford?"#fff":"#a55");
      ctx.fillText(o.label, w*0.145, y-1);
      ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle = spent?"#445":"#999";
      ctx.fillText(spent?"XP CAP REACHED THIS RUN":o.sub, w*0.145, y+11);
      ctx.textAlign="right"; ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillStyle = afford?"#fff":"#f22";
      ctx.fillText(o.cost+"◆", w*0.855, y+2);
      ctx.textAlign="left";
    });
    const doneY=cRow0+3*cRowStep, doneH=h*0.05;
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
      const tier=pkPalTier(k), buyable=pkPalBuyableK(k);
      const td=pkNextTierData(k);
      const cost=td?td.c:0, afford=PK.bones>=cost;
      const ok=buyable&&afford;
      const y=h*pkRowYF(i), cardH=h*PANEL_CARDH, top=y-cardH*0.5;
      ctx.strokeStyle = !buyable ? "#334" : (afford?"#f6a":"#663333"); ctx.lineWidth=2;
      ctx.strokeRect(w*0.10, top, w*0.80, cardH);
      // name + action
      const label = buyable
        ? (tier===0 ? td.n : "UPGRADE "+td.n)
        : PAL_TIERS[k][3].n+" \u2014 MAXED";
      ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="left";
      ctx.fillStyle = !buyable ? "#556" : (afford?"#fff":"#a55");
      ctx.fillText(label, w*0.145, y-1);
      // description or maxed note
      ctx.font="6px 'Press Start 2P',monospace";
      ctx.fillStyle = buyable?"#999":"#445";
      ctx.fillText(buyable ? td.fx : "ALL 4 TIERS UNLOCKED", w*0.145, y+11);
      // tier pips: \u25A0 owned, \u25A1 not yet, shown on right above cost
      ctx.textAlign="right"; ctx.font="7px 'Press Start 2P',monospace";
      const pips="\u25A0".repeat(tier)+"\u25A1".repeat(4-tier);
      ctx.fillStyle = tier>0?"#f6a":"#556";
      ctx.fillText(pips, w*0.855, y-1);
      // cost
      ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillStyle = !buyable?"#445":(ok?"#fff":"#f22");
      ctx.fillText(buyable?(cost+"\u25C6"):"", w*0.855, y+11);
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
      for(let i=0;i<3;i++){
        if(Math.abs(yF-(cRow0+i*cRowStep))<tolF){
          const o=BONES_EXCHANGE[i];
          if(o.label==="XP" && pkXPLeft()<=0){ beep(150,.1); toast("XP CAP REACHED FOR THIS RUN",1); }
          else if(PK.bones>=o.cost){ PK.bones-=o.cost; o.f(); beep(700,.06); toast(o.sub+" — DONE"); }
          else beep(150,.1);
          return;
        }
      }
      if(Math.abs(yF-(cRow0+3*cRowStep))<0.04){ PK.convertOpen=false; beep(400,.05); }
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
          beep(700,.06); setTimeout(()=>beep(900,.06),80);
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
