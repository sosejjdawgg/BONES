/* ===== GO TO THE PARK (Dogpark) ===== */
// Dogpark is its own self-contained roguelite: BONES (dropped by enemies) is a mini-currency
// that only exists inside a run, spent on stat upgrades and rare charm relics between waves.
// None of it carries over — only a small trickle of real hub XP makes it home, earned from
// how many enemies you downed and how many side objectives (hoop/tunnel/ramp) you hit.
const PK={active:false, godMode:false}; // godMode is a dev-only toggle and deliberately isn't reset per-run
function wd(d,M){ return ((d + M/2) % M + M) % M - M/2; }  // shortest signed delta on the looping world
const XP_PER_KILL=0.4, XP_PER_SIDE=2;
function pkRunXP(){ return Math.max(0, Math.round(PK.kills*XP_PER_KILL + PK.sideDone*XP_PER_SIDE)); }
// Dogpark-only relic pool — same lore/names as the Home Shop charms, but tuned to the verbs
// that actually exist in a Dogpark run (bark, speed, knockback, hp) rather than the runner's
// jump/score stats. Bought with bones from the between-wave shop; one active at a time, and
// none of it persists once the run ends.
const PK_CHARMS=[
  {id:"spike", name:"SPIKED COLLAR", cost:18, fx:"+20% SPEED", apply:()=>{PK.spd*=1.2;}},
  {id:"band",  name:"RED BANDANA",   cost:14, fx:"+25% BARK RADIUS", apply:()=>{PK.barkR*=1.25;}},
  {id:"bell",  name:"BRASS BELL",    cost:16, fx:"-25% BARK COOLDOWN", apply:()=>{PK.barkMax=Math.max(0.6,PK.barkMax*0.75);}},
  {id:"bonec", name:"BONE CHARM",    cost:20, fx:"+30% BONES FROM DROPS", apply:()=>{PK.bonesMult=(PK.bonesMult||1)*1.3;}},
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
function drawLock(ctx,x,y,s,color){
  ctx.strokeStyle=color; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.arc(x,y-2.5*s,3*s,Math.PI,0); ctx.stroke();
  ctx.fillStyle=color; ctx.fillRect(x-4*s,y-3*s,8*s,7*s);
}
const SPARKS=[]; // celebratory burst when a shop purchase lands
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
function pkReveal(biscuits, xpFinal){
  const el=$("#resScore");
  const dur=900, start=performance.now();
  function step(now){
    const p2=Math.min(1,(now-start)/dur);
    const shown = p2<0.5
      ? Math.round(biscuits*(1-p2*2))                    // biscuits count DOWN
      : Math.round(xpFinal*((p2-0.5)*2));                 // then XP counts UP
    el.textContent = p2<0.5 ? shown+" BONES" : shown+" XP";
    if(Math.random()<0.35) beep(380+p2*500,.02,"square",.015);
    if(p2<1){ requestAnimationFrame(step); }
    else{ el.textContent=xpFinal+" XP"; el.classList.add("pop"); setTimeout(()=>el.classList.remove("pop"),160);
      beep(760,.09); setTimeout(()=>beep(1040,.12),110); }
  }
  requestAnimationFrame(step);
}
let PARKGHOST=null;
const FRIENDIMG = FRIENDFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
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
function startPark(){
  Object.assign(PK,{
    active:true,t:0,wave:1,waveT:0,spawnT:1,
    waveQuota:pkWaveQuota(1), waveSpawned:0, flockDone:false,
    goldenDone:false, goldenAt:3+Math.random()*8,
    maxhp:Math.round(50+50*S.mood/100),
    spd:95*(0.75+0.5*S.energy/100)*(S.senior?0.85:1),
    barkMax:Math.max(1.2,3-0.06*S.lvl), barkCd:1, pulse:0,
    barkR:60*(0.8+0.4*S.hunger/100), knock:150,
    bones:0, bonesMult:1, kills:0, sideDone:0, relic:null, waveBanner:null, shopFlash:null,
    worldMult:2, barkBigLvl:0, barkFastLvl:0, speedBonus:null,
    chain:0, chainT:0, inv:0, fx:[],
    x:0,y:0,vx:0,vy:0, joy:null,
    en:[], fr:[], gate:{}, started:false, shop:null, biscuits:[], drops:[]
  });
  PK.hp=PK.maxhp;
  PK.acts=[{k:"hoop",x:.15,y:.125,cd:0},{k:"tunnel",x:.35,y:.36,cd:0},{k:"ramp",x:.11,y:.39,cd:0},{k:"tunnel",x:.62,y:.70,cd:0},{k:"hoop",x:.85,y:.20,cd:0}];
  PK.waveBanner={text:"WAVE 1", life:2.2, max:2.2};
  SPARKS.length=0;
  S.outTimer=0;
  tickTodo("d_park");
  hidePortrait(); closeStatus();
  showScreen("park");
  $("#camstate").textContent="DOGPARK";
  toast("SURVIVE. COLLECT BONES, BANK XP AT THE RED EXIT.");
  beep(660,.08); setTimeout(()=>beep(880,.08),120);
}
function pkGain(n,x,y){
  PK.chain = PK.chainT>0 ? Math.min(3,PK.chain+1) : 1;   // capped lower — chain bonus was inflating bones well past shop costs
  PK.chainT=3;
  const g=Math.round((n+(PK.chain-1))*(PK.bonesMult||1));
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
  PK.en.push({t:type, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
    hp:type==="cat"?2:1,
    sp:(type==="sq"?70:type==="bird"?85:45)*(1+wv*0.05),
    ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
}
function pkSpawnType(type, ang){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  if(Math.random()<0.04){
    const side=Math.random()<0.5?-1:1;
    PK.fr.push({x:(PK.x+side*w*0.65+WW)%WW, y:(PK.y+(Math.random()-0.5)*h*0.8+WH)%WH, vx:-side*42, life:16});
    return;
  }
  const a2 = ang===undefined ? Math.random()*6.283 : ang;
  const R=Math.max(w,h)*0.62, wv=PK.wave;
  PK.en.push({t:type, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
    hp:type==="cat"?2:1,
    sp:(type==="sq"?70:type==="bird"?85:45)*(1+wv*0.05),
    ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
}
function pkSpawnAlpha(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW, WH=PK.WH, a2=Math.random()*6.283, R=Math.max(w,h)*0.62;
  PK.en.push({t:"cat", alpha:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
    hp:4, sp:52, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
  toast("\u2620 THE ALPHA CAT IS HERE.",1);
  beep(120,.35,"sawtooth",.05);
}
// a golden bird carrying a gold bone — one per stage, optional, never counts toward the wave
// quota. flies a fast, straight line across the world; catch it (like the friend NPC) for a
// big bones payout, or miss it and it just disappears.
function pkSpawnGoldenBird(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const side=Math.random()<0.5?-1:1, sp=150+Math.random()*30;
  PK.fr.push({golden:true, x:(PK.x+side*w*0.7+WW)%WW, y:(PK.y+(Math.random()-0.5)*h*0.6+WH)%WH,
    vx:-side*sp, life:11});
  toast("A GOLDEN BIRD FLIES BY — CATCH IT!",1);
  beep(900,.05); setTimeout(()=>beep(1200,.06),70);
}
// a flock of 10-20 birds flies straight in on a shared bearing, from any direction. they
// don't home in like a lone dive-bomber \u2014 they hold their trajectory and, if they'd fly
// clean off the engagement area, rubber-band their heading back toward the fray instead of
// leaving. they keep looping through until every last one is knocked down.
function pkSpawnFlock(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const n=10+Math.floor(Math.random()*11);
  const ang=Math.random()*6.283, perp=ang+Math.PI/2;
  const R=Math.max(w,h)*0.8;
  const cx=PK.x-Math.cos(ang)*R, cy=PK.y-Math.sin(ang)*R;   // upstream of the flight path
  const sp=80+Math.random()*25;
  for(let i=0;i<n;i++){
    const off=(i-(n-1)/2)*16+(Math.random()-0.5)*10;         // staggered wedge formation
    const sxo=cx+Math.cos(perp)*off, syo=cy+Math.sin(perp)*off;
    PK.en.push({t:"bird", flock:true, x:(sxo+WW)%WW, y:(syo+WH)%WH,
      hp:1, sp, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
      ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  PK.waveSpawned += n;
  toast(n+" BIRDS INBOUND!",1);
  beep(520,.09,"square",.05); setTimeout(()=>beep(680,.09,"square",.05),90);
}
const LASER_SQUAD_SIZE=4;
const LASER_CHARGE_TIME=1.6, LASER_FIRE_VIS=0.45, LASER_WIDTH=13, LASER_COOLDOWN=2.4, LASER_RECOIL=70;
function pkLaserRange(){ return Math.min(PK.WW,PK.WH)*0.42; }   // stays under half the world so the
                                                                 // wrap-aware hit-test never disagrees with the straight beam drawn on screen
// wave 8 boss stage: a small squad of squirrels that root in place, charge a red eye-glow,
// then burst a long linear laser out along whichever way they're facing
function pkSpawnLaserSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW, WH=PK.WH;
  for(let i=0;i<LASER_SQUAD_SIZE;i++){
    const ang=(i/LASER_SQUAD_SIZE)*6.283+Math.random()*0.4, R=Math.max(w,h)*0.6;
    PK.en.push({t:"sq", laser:true, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
      hp:3, sp:58, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      laserState:"seek", chargeT:0, aimAng:0, fireT:0, cd:1.2+Math.random()*1.2});
  }
  toast("⚠ LASER SQUIRRELS — WATCH THE RED EYES",1);
  beep(140,.3,"sawtooth",.05); setTimeout(()=>beep(180,.3,"sawtooth",.05),120);
}
// how many enemies a wave spawns before it's cleared, echoing each wave's existing spawn
// cadence (so the ramp still feels like the same mission structure) \u2014 just measured as a
// kill quota instead of a fixed 20s clock. doubled from wave 10 on.
function pkWaveBaseQuota(wv){
  if(wv===8) return LASER_SQUAD_SIZE;   // boss stage: exactly the laser squad, no filler trash
  let interval=1.4, burst=1;
  if(wv===1) interval=1.8;
  else if(wv===2){ interval=2.4; burst=3; }
  else if(wv===3) interval=0.9;
  else if(wv===4) interval=0.55;
  else if(wv===5) interval=1.6;
  else interval=Math.max(0.35,1.4-wv*0.09);
  const n=Math.round(20/interval)*burst;
  return wv===5 ? n+1 : n;   // +1 for the alpha boss
}
function pkWaveQuota(wv){
  const base=pkWaveBaseQuota(wv);
  return wv>=10 ? base*2 : base;
}
function pkBark(){
  PK.barkCd=PK.barkMax; PK.pulse=0.35;
  beep(190,.1,"square",.06);
  let hits=0;
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    const dxw=wd(e.x-PK.x,PK.WW), dyw=wd(e.y-PK.y,PK.WH);
    const d=Math.hypot(dxw,dyw)||1;
    if(d<PK.barkR){
      e.hp--;
      if(e.hp<=0){
        // they drop a bone where they die — BONES must go collect it. kept low: with the chain
        // bonus on top, the old values (10/3/2/1) were putting ~60 bones in reach by wave 2
        // against shop costs of 10-24, so the shop never felt like a real choice.
        PK.drops.push({x:e.x, y:e.y, v:e.alpha?6:e.t==="cat"?2:1, gold:!!e.alpha, life:25});
        PK.kills++;
        hits++;
        PK.en.splice(i,1);
      }
      else { e.kx=dxw/d*PK.knock; e.ky=dyw/d*PK.knock; }
    }
  }
  if(hits>0) beep(300,.05);
}
const BARK_LVL_CAP=4;
function pkExpandPark(){
  PK.worldMult=Math.min(4,PK.worldMult+0.5);
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  PK.WW=w*PK.worldMult; PK.WH=h*PK.worldMult;
  pkBuildBG(PK.WW,PK.WH);
}
function pkShopOpen(){
  const statAll=[
    {n:"BIGGER BARK",   fx:"+14 BARK RADIUS",    c:12, capKey:"barkBigLvl",  f:()=>{PK.barkR+=14; PK.barkBigLvl++;}},
    {n:"FASTER BARK",   fx:"-0.35s COOLDOWN",     c:14, capKey:"barkFastLvl",f:()=>{PK.barkMax=Math.max(0.8,PK.barkMax-0.35); PK.barkFastLvl++;}},
    {n:"MIGHTY KNOCKBACK", fx:"+70 KNOCKBACK",    c:10, f:()=>PK.knock+=70},
    {n:"SNACK",         fx:"HEAL 30 HP",          c:8,  f:()=>PK.hp=Math.min(PK.maxhp,PK.hp+30)},
    {n:"ZOOMIES",       fx:"+10% SPEED",          c:12, f:()=>PK.spd*=1.1},
    {n:"TOUGH COAT",    fx:"+15 MAX HP",          c:15, f:()=>{PK.maxhp+=15;PK.hp+=15;}}
  ];
  // BIGGER BARK / FASTER BARK stop appearing once leveled to the cap
  const pool=statAll.filter(o=>!o.capKey || PK[o.capKey]<BARK_LVL_CAP)
    .map(o=>o.capKey ? {...o, fx:o.fx+" (LV "+(PK[o.capKey]+1)+"/"+BARK_LVL_CAP+")"} : o);
  // rare chance of a big relic offer alongside the usual upgrades \u2014 never the one already equipped
  const candidates=PK_CHARMS.filter(c=>c.id!==PK.relic);
  if(candidates.length && Math.random()<0.4){
    const pick=candidates[Math.floor(Math.random()*candidates.length)];
    pool.push({n:"\u2b25 "+pick.name, fx:pick.fx, c:pick.cost, relic:true,
      f:()=>{ pick.apply(); PK.relic=pick.id; tickTodo("j_collar"); }});
  }
  // rare chance to grow the park itself, up to a 4\u00d74 world
  if(PK.worldMult<4 && Math.random()<0.3){
    const next=Math.min(4,PK.worldMult+0.5);
    pool.push({n:"EXPAND THE PARK", fx:"GROW WORLD TO "+next+"\u00d7"+next, c:Math.round(14+(PK.worldMult-2)*16), expand:true,
      f:()=>pkExpandPark()});
  }
  PK.shop = pool.sort(()=>Math.random()-0.5).slice(0,3);
  PK.joy=null;
}
function parkUpdate(dt){
  if(!PK.active) return;
  if(PK.shop) return;   // world pauses while shopping
  PK.t+=dt; PK.waveT+=dt;
  PK.chainT=Math.max(0,PK.chainT-dt); if(PK.chainT<=0) PK.chain=0;
  PK.inv=Math.max(0,PK.inv-dt); PK.pulse=Math.max(0,PK.pulse-dt);
  if(PK.waveBanner){ PK.waveBanner.life-=dt; if(PK.waveBanner.life<=0) PK.waveBanner=null; }
  if(PK.shopFlash){ PK.shopFlash.life-=dt; if(PK.shopFlash.life<=0) PK.shopFlash=null; }
  for(let i=SPARKS.length-1;i>=0;i--){ const s=SPARKS[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.vy+=140*dt; s.life-=dt; if(s.life<=0) SPARKS.splice(i,1); }
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  if(!PK.started){
    PK.started=true;
    PK.WW=w*PK.worldMult; PK.WH=h*PK.worldMult;
    PK.gate={x:PK.WW*0.72, y:PK.WH*0.5};
    PK.x=PK.WW*0.25; PK.y=PK.WH*0.5;
    pkBuildBG(PK.WW,PK.WH);
  }
  const WW=PK.WW, WH=PK.WH;
  // a wave only ends once its full quota has spawned AND every last enemy is down \u2014
  // no more clearing out on a clock while stragglers are still alive
  if(PK.waveSpawned>=PK.waveQuota && PK.en.length===0){
    // clear the wave within 60s and a charm slot unlocks in the shop; otherwise it shows
    // locked with a padlock and how far over 60s the clear took
    if(PK.waveT<=60){
      const cands=PK_CHARMS.filter(c=>c.id!==PK.relic);
      PK.speedBonus={unlocked:true, over:0, charm:cands.length?cands[Math.floor(Math.random()*cands.length)]:null};
    } else {
      PK.speedBonus={unlocked:false, over:Math.round(PK.waveT-60), charm:null};
    }
    PK.waveT=0; PK.wave++;
    if(PK.wave>=3) tickTodo("j_wave3");
    PK.barkMax=Math.max(1,PK.barkMax-0.12); PK.barkR+=5;
    PK.waveQuota=pkWaveQuota(PK.wave); PK.waveSpawned=0; PK.flockDone=false;
    PK.goldenDone=false; PK.goldenAt=3+Math.random()*8;
    const WNAME={2:"SQUIRREL AMBUSH",3:"BIRD DIVES",4:"THE PACK",5:"\u2620 THE ALPHA",8:"\u26a0 LASER SQUIRRELS"};
    const waveLabel="WAVE "+PK.wave+(WNAME[PK.wave]?" \u2014 "+WNAME[PK.wave]:"");
    toast(waveLabel);
    PK.waveBanner={text:waveLabel, life:2.2, max:2.2};
    beep(500,.08);
    if(PK.wave===5){ pkSpawnAlpha(); PK.waveSpawned++; }
    if(PK.wave===8){ pkSpawnLaserSquad(); PK.waveSpawned+=LASER_SQUAD_SIZE; }
    pkShopOpen();
  }
  // one bird flock per wave (from wave 2 on) \u2014 skipped on the wave 8 boss stage so the
  // laser squirrels get a clean, focused fight instead of being diluted by a flock
  if(!PK.flockDone && PK.wave>=2 && PK.wave!==8 && PK.waveT>3){
    PK.flockDone=true;
    pkSpawnFlock();
  }
  // one golden bird per stage — optional, never counts toward the wave quota
  if(!PK.goldenDone && PK.waveT>PK.goldenAt){
    PK.goldenDone=true;
    pkSpawnGoldenBird();
  }
  PK.spawnT-=dt;
  if(PK.spawnT<=0 && PK.waveSpawned<PK.waveQuota){
    const wv=PK.wave;
    if(wv===1){ PK.spawnT=1.8; pkSpawnType("cat"); PK.waveSpawned++; }                    // STRAYS: slow, tanky, teaches the bark
    else if(wv===2){ PK.spawnT=2.4; const a2=Math.random()*6.283;                        // SQUIRREL AMBUSH: bursts from one bearing
      for(let i=0;i<3;i++) pkSpawnType("sq", a2+(Math.random()-0.5)*0.5); PK.waveSpawned+=3; }
    else if(wv===3){ PK.spawnT=0.9;                                                      // BIRD DIVES: mostly ahead of your movement
      const mv=Math.atan2(PK.vy,PK.vx);
      pkSpawnType(Math.random()<0.75?"bird":"sq",
        (Math.random()<0.6 && (Math.abs(PK.vx)+Math.abs(PK.vy))>10) ? mv+(Math.random()-0.5)*0.8 : undefined); PK.waveSpawned++; }
    else if(wv===4){ PK.spawnT=0.55; pkSpawn(w,h); PK.waveSpawned++; }                    // THE PACK: pure density
    else if(wv===5){ PK.spawnT=1.6; pkSpawnType("sq"); PK.waveSpawned++; }                // THE ALPHA: boss + light trickle
    else if(wv===8){ PK.spawnT=99; }                                                      // LASER SQUIRRELS: boss squad only, no filler
    else { PK.spawnT=Math.max(0.35,1.4-wv*0.09); pkSpawn(w,h); PK.waveSpawned++; }
  }
  let mx=0,my=0;
  if(PK.joy){ mx=PK.joy.dx; my=PK.joy.dy; }
  if(Math.hypot(mx,my)>0.1){ const l=Math.hypot(mx,my); PK.vx=mx/l*PK.spd; PK.vy=my/l*PK.spd; }
  else { PK.vx*=0.8; PK.vy*=0.8; }
  PK.x=(PK.x+PK.vx*dt+WW)%WW;
  PK.y=(PK.y+PK.vy*dt+WH)%WH;
  PK.barkCd-=dt;
  if(PK.barkCd<=0 && PK.en.some(e=>Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH))<PK.barkR)) pkBark();
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    e.kx*=0.88; e.ky*=0.88;
    if(e.laser){
      const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH);
      const d=Math.hypot(dxw,dyw)||1;
      if(e.laserState==="seek"){
        // ordinary squirrel chase until it's in range and its cooldown clears
        const sx=dxw/d*e.sp, sy=dyw/d*e.sp;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW;
        e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        e.cd-=dt;
        if(e.cd<=0 && d<pkLaserRange()*0.85){
          e.laserState="charge"; e.chargeT=0; e.aimAng=Math.atan2(dyw,dxw);
        }
        if(d<14 && PK.inv<=0 && !PK.godMode){
          PK.hp-=8; PK.inv=0.6;
          e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth");
          if(PK.hp<=0) return pkDeath();
        }
      } else if(e.laserState==="charge"){
        // rooted in place, red eye-glow grows — telegraphed, dodgeable
        e.chargeT+=dt;
        if(e.chargeT>=LASER_CHARGE_TIME){
          const ux=Math.cos(e.aimAng), uy=Math.sin(e.aimAng);
          const along=dxw*ux+dyw*uy, perp=Math.abs(dxw*uy-dyw*ux);
          if(along>0 && along<pkLaserRange() && perp<LASER_WIDTH && PK.inv<=0 && !PK.godMode){
            PK.hp-=20; PK.inv=0.6;
            beep(160,.25,"sawtooth");
            if(PK.hp<=0) return pkDeath();
          }
          e.laserState="fire"; e.fireT=0;
          e.kx=-ux*LASER_RECOIL; e.ky=-uy*LASER_RECOIL;   // small recoil jolt to sell the beam's power
        }
      } else if(e.laserState==="fire"){
        e.fireT+=dt;
        e.x=(e.x+e.kx*dt+WW)%WW; e.y=(e.y+e.ky*dt+WH)%WH;   // rides out the recoil, decaying via the shared kx/ky damping above
        if(e.fireT>=LASER_FIRE_VIS){ e.laserState="seek"; e.cd=LASER_COOLDOWN+Math.random()*0.8; }
      }
      e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
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
      if(d<14 && PK.inv<=0 && !PK.godMode){
        PK.hp-=8; PK.inv=0.6;
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
    if(d<14 && PK.inv<=0 && !PK.godMode){
      PK.hp-=(e.alpha?14:8); PK.inv=0.6;
      e.kx=-dxw/d*220; e.ky=-dyw/d*220;
      beep(110,.12,"sawtooth");
      if(PK.hp<=0) return pkDeath();
    }
  }
  for(let i=PK.fr.length-1;i>=0;i--){
    const f=PK.fr[i];
    f.x=(f.x+f.vx*dt+WW)%WW; f.life-=dt;
    if(Math.hypot(wd(f.x-PK.x,WW),wd(f.y-PK.y,WH))<20){
      if(f.golden){ pkGain(20,f.x,f.y); pkFanfare(null,true,"★ GOLDEN BONE CAUGHT!"); }
      else {
        PK.hp=Math.min(PK.maxhp,PK.hp+15);
        pkGain(9,f.x,f.y);
        S.mood=clamp(S.mood+2,0,100);
        beep(760,.08);
      }
      PK.fr.splice(i,1); continue;
    }
    if(f.life<=0) PK.fr.splice(i,1);
  }
  for(const a of PK.acts){
    a.cd=Math.max(0,a.cd-dt);
    if(a.cd<=0 && Math.hypot(wd(a.x*WW-PK.x,WW),wd(a.y*WH-PK.y,WH))<22){
      a.cd=3; pkGain(3+Math.floor(Math.random()*3), a.x*WW, a.y*WH); PK.sideDone++; beep(700,.06);
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
    if(Math.hypot(wd(dr.x-PK.x,WW),wd(dr.y-PK.y,WH))<16){
      pkGain(dr.v, dr.x, dr.y);            // chain ticks per pickup — route efficiency pays
      beep(dr.gold?900:640,.06);
      PK.drops.splice(i,1);
    }
  }
  if(Math.hypot(wd(PK.gate.x-PK.x,WW),wd(PK.gate.y-PK.y,WH))<26) return pkBank();
}
function pkExitCosts(){
  S.energy=clamp(S.energy-12,0,100); S.clean=clamp(S.clean-8,0,100);
}
function pkDeath(){
  PK.active=false;
  const lost=Math.round(PK.bones*0.9), kept=PK.bones-lost;
  if(lost>0) PARKGHOST={x:PK.x,y:PK.y,bones:lost + (PARKGHOST?PARKGHOST.bones:0)};
  const earned=Math.round(pkRunXP()*0.5);   // dying costs you half of what the run actually earned
  if(earned>0) addXP(earned);
  pkExitCosts(); S.fun=clamp(S.fun+10,0,100);
  $("#resTitle").textContent="OVERRUN AT THE PARK"; $("#resTitle").style.color="#f22";
  $("#resPortrait").src=PORTRAITS.sad; $("#resPortrait").classList.add("show");
  $("#resScore").textContent=kept+" BONES";
  $("#resLines").innerHTML="90% OF HIS BONES ("+lost+") LIE WHERE HE FELL.<br>"+PK.kills+" DOWNED, "+PK.sideDone+" SIDE OBJECTIVES \u2014 "+earned+" XP MADE IT HOME.<br>NEXT VISIT: GO CLAIM THE REST \u2014 IF YOU DARE.";
  $("#result").classList.add("show");
  beep(140,.3,"sawtooth");
  setTimeout(()=>pkReveal(kept,earned),400);
}
function pkBank(){
  PK.active=false;
  const g=PK.bones;
  const earned=pkRunXP();
  if(earned>0) addXP(earned);
  LVLFX = earned>0 ? 1.2 : 0;
  pkExitCosts(); S.fun=clamp(S.fun+20,0,100); S.mood=clamp(S.mood+8,0,100);
  $("#resTitle").textContent="XP BANKED"; $("#resTitle").style.color="#fff";
  $("#resPortrait").src = earned>=8 ? PORTRAITS.happy : PORTRAITS.content;
  $("#resPortrait").classList.add("show");
  $("#resScore").textContent=g+" BONES";
  $("#resLines").innerHTML="WAVE "+PK.wave+" REACHED.<br>"+PK.kills+" DOWNED, "+PK.sideDone+" SIDE OBJECTIVES.<br>A GOOD DAY AT THE PARK.";
  $("#result").classList.add("show");
  beep(660,.1); setTimeout(()=>beep(880,.1),100); setTimeout(()=>beep(1170,.14),200);
  setTimeout(()=>pkReveal(g,earned),500);
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
    const p=clamp(e.chargeT/LASER_CHARGE_TIME,0,1);
    ctx.fillStyle="#f22"; ctx.globalAlpha=0.5+0.5*p;
    ctx.beginPath(); ctx.arc(eyeX,eyeY,1+p*4,0,7); ctx.fill();
    ctx.globalAlpha=1;
  } else if(e.laserState==="fire"){
    const ang=e.aimAng, range=pkLaserRange(), fade=1-clamp(e.fireT/LASER_FIRE_VIS,0,1);
    ctx.save(); ctx.globalAlpha=fade;
    ctx.strokeStyle="#f22"; ctx.lineWidth=7;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(eyeX+Math.cos(ang)*range, eyeY+Math.sin(ang)*range); ctx.stroke();
    ctx.strokeStyle="#fff"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(eyeX+Math.cos(ang)*range, eyeY+Math.sin(ang)*range); ctx.stroke();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(eyeX,eyeY,2+3*fade,0,7); ctx.fill();
    ctx.restore();
  }
}
function drawEnemy(ctx,e,sx,sy){
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx, sy+2, 9, 3, 0, 0, 7); ctx.fill();
  if(e.laser) drawLaserFX(ctx,e,sx,sy);
  const frames = ENEMYIMG[e.t];
  const img = frames && frames[e.fi % frames.length];
  if(!img || !img.complete || !img.naturalWidth){ drawEnemyVector(ctx,e,sx,sy); return; }
  const eh = e.alpha?32 : e.t==="cat"?22:e.t==="bird"?18:16;
  const ew = eh*img.naturalWidth/img.naturalHeight;
  if(e.alpha){
    ctx.strokeStyle="#f22"; ctx.lineWidth=2;
    ctx.globalAlpha=0.5+0.5*Math.abs(Math.sin(e.ph+performance.now()/300));
    ctx.beginPath(); ctx.ellipse(sx, sy-eh*0.45, ew*0.62, eh*0.6, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha=1;
  }
  ctx.save(); ctx.imageSmoothingEnabled=false;
  if(e.dir<0){ ctx.translate(sx*2,0); ctx.scale(-1,1); }
  ctx.drawImage(img, sx-ew/2, sy-eh, ew, eh);
  ctx.restore();
}
function parkDraw(t){
  if(!PK.active) return;
  const [ctx,w,h]=fit($("#dogcv"));
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const DX=w/2, DY=h/2;
  const SC=(ex,ey)=>[DX+wd(ex-PK.x,WW), DY+wd(ey-PK.y,WH)];
  if(PKBG){
    const ox=((PK.x-DX)%WW+WW)%WW, oy=((PK.y-DY)%WH+WH)%WH;
    ctx.imageSmoothingEnabled=false;
    for(const ddx of [0,WW]) for(const ddy of [0,WH]) ctx.drawImage(PKBG,-ox+ddx,-oy+ddy);
  } else { ctx.fillStyle="#20261f"; ctx.fillRect(0,0,w,h); }
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
    const [gx,gy2]=SC(PK.gate.x,PK.gate.y);
    const pul=0.6+0.4*Math.sin(t*5);
    if(gx>-30&&gx<w+30&&gy2>-45&&gy2<h+45){
      ctx.strokeStyle="#f22"; ctx.globalAlpha=pul; ctx.lineWidth=4;
      ctx.strokeRect(gx-24,gy2-16,48,32); ctx.globalAlpha=1;
      ctx.fillStyle="#f22"; ctx.globalAlpha=pul;
      ctx.font="11px 'Press Start 2P',monospace"; ctx.textAlign="center";
      ctx.fillText("EXIT",gx,gy2+4);
      ctx.textAlign="left"; ctx.globalAlpha=1;
    } else {
      const ang=Math.atan2(gy2-DY,gx-DX);
      const ex=DX+Math.cos(ang)*(Math.min(w,h)/2-30), ey=DY+Math.sin(ang)*(Math.min(w,h)/2-30);
      ctx.save(); ctx.translate(ex,ey); ctx.rotate(ang);
      ctx.fillStyle="#f22"; ctx.globalAlpha=pul;
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-8,-8); ctx.lineTo(-8,8); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha=1;
      ctx.fillStyle="#f22"; ctx.globalAlpha=pul;
      ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
      ctx.fillText("EXIT", ex-Math.cos(ang)*24, ey-Math.sin(ang)*24+3);
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
  for(const e of PK.en){
    const [ex2,ey2]=SC(e.x,e.y);
    if(ex2<-40||ex2>w+40||ey2<-40||ey2>h+40) continue;
    drawEnemy(ctx,e,ex2,ey2);
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
  if(img.complete && !(PK.inv>0&&Math.floor(t*12)%2)){
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(PK.vx<0){ ctx.translate(DX*2,0); ctx.scale(-1,1); }
    ctx.drawImage(img,DX-20,DY-16,40,34);
    ctx.restore();
  }
  for(const dr of PK.drops){
    const [dx2,dy2]=SC(dr.x,dr.y);
    if(dx2<-20||dx2>w+20||dy2<-20||dy2>h+20) continue;
    if(dr.life<5 && Math.floor(dr.life*6)%2) continue;   // blink out
    drawBone(ctx, dx2, dy2, dr.gold?1.5:1, dr.gold?"#e8c14a":"#fff");
  }
  for(const s of SPARKS){
    const [sx,sy]=SC(s.x,s.y);
    ctx.globalAlpha=Math.max(0,s.life);
    ctx.fillStyle=s.gold?"#e8c14a":"#fff";
    ctx.fillRect(sx-2,sy-2,4,4);
    ctx.globalAlpha=1;
  }
  if(PK.chain>1){
    const f3=clamp(PK.chainT/3,0,1), c3=Math.round(120+135*f3);
    ctx.fillStyle="rgb("+c3+","+c3+","+c3+")";
    ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("x"+PK.chain, DX, DY-42); ctx.textAlign="left";
  }
  if(PK.shop){
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("PAUSED \u2014 SHOP ON CONTROLLER", w/2, h/2); ctx.textAlign="left";
  }
  ctx.font="8px 'Press Start 2P',monospace"; ctx.fillStyle="#fff";
  for(const f4 of PK.fx){
    const [px2,py2]=SC(f4.x,f4.y);
    ctx.globalAlpha=Math.max(0,f4.life);
    ctx.fillText(f4.txt,px2,py2-(0.9-f4.life)*24);
    ctx.globalAlpha=1;
  }
  // wave-transition banner \u2014 pops in, holds, fades, so a new wave actually reads as an event
  if(PK.waveBanner){
    const {text,life,max}=PK.waveBanner, el=max-life;
    let alpha; if(el<0.15) alpha=el/0.15; else if(life<0.6) alpha=Math.max(0,life/0.6); else alpha=1;
    ctx.save(); ctx.globalAlpha=alpha;
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,h*0.36,w,h*0.15);
    ctx.strokeStyle="#f22"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0,h*0.36); ctx.lineTo(w,h*0.36); ctx.moveTo(0,h*0.51); ctx.lineTo(w,h*0.51); ctx.stroke();
    ctx.fillStyle="#fff"; ctx.font="13px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(text, w/2, h*0.45); ctx.textAlign="left";
    ctx.restore();
  }
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
  ctx.fillStyle="rgba(0,0,0,.38)"; ctx.fillRect(0,0,w,44);
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(10,26,90,8);
  ctx.fillStyle=PK.hp<PK.maxhp*0.3?"#f22":"#fff";
  ctx.fillRect(12,28,86*clamp(PK.hp/PK.maxhp,0,1),4);
  if(PK.relic){
    const rc=PK_CHARMS.find(c=>c.id===PK.relic);
    if(rc){ ctx.fillStyle="#f22"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="left"; ctx.fillText("\u2b25 "+rc.name, 10, 41); }
  }
  pkPadDraw(t);
}
function pkPadDraw(t){
  const [ctx,w,h]=fit($("#parkcv"));
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(6,6,w-12,h-12);
  if(!PK.shop && !PK.joy){
    ctx.fillStyle="#444"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(DN("DRAG ANYWHERE TO MOVE BONES"), w/2, h/2);
  }
  drawBone(ctx, 20, 26, 1, "#fff");
  ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText(PK.bones+" BONES", 30, 29);
  const leftToClear=Math.max(0,PK.waveQuota-PK.waveSpawned)+PK.en.length;
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(w-100,10,90,30);
  ctx.fillStyle="#fff"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText("WAVE "+PK.wave, w-55, 23);
  ctx.font="6px 'Press Start 2P',monospace";
  ctx.fillText(leftToClear+" LEFT", w-55, 34);
  if(PK.joy){
    ctx.strokeStyle="#fff"; ctx.globalAlpha=0.5; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(PK.joy.ox,PK.joy.oy,26,0,7); ctx.stroke();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(PK.joy.ox+PK.joy.dx*22,PK.joy.oy+PK.joy.dy*22,9,0,7); ctx.fill();
    ctx.globalAlpha=1;
  }
  if(PK.shop){
    ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(w*0.06,h*0.07,w*0.88,h*0.86);
    ctx.fillStyle="#fff"; ctx.font="10px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("\u2605 PARK SHOP \u2605", w/2, h*0.13);
    // wallet banner \u2014 the balance you're about to spend, front and center
    const wbW=w*0.5, wbX=w/2-wbW/2, wbY=h*0.16, wbH=h*0.07;
    ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2; ctx.strokeRect(wbX,wbY,wbW,wbH);
    drawBone(ctx, w/2-32, wbY+wbH*0.58, 1.1, "#e8c14a");
    ctx.fillStyle="#e8c14a"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="left";
    ctx.fillText(PK.bones+" BONES", w/2-20, wbY+wbH*0.64);
    ctx.textAlign="left";
    // one card-button per offer, evenly spaced \u2014 relics glow gold, park-expansions glow blue
    const ROW_STEP=h*0.125, cardH=h*0.09, row0=h*0.335;
    PK.shop.forEach((o,i)=>{
      const y=row0+i*ROW_STEP, top=y-cardH*0.5;
      const afford=PK.bones>=o.c;
      const glowCol = o.relic?"#e8c14a":o.expand?"#6cf":null;
      const pulse=glowCol ? 0.7+0.3*Math.sin(performance.now()/180) : 1;
      ctx.save();
      if(glowCol) ctx.globalAlpha=pulse;
      ctx.strokeStyle = glowCol || (afford?"#fff":"#663333");
      ctx.lineWidth = glowCol?3:2;
      ctx.strokeRect(w*0.10, top, w*0.80, cardH);
      ctx.restore();
      ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
      ctx.fillStyle = glowCol || (afford?"#fff":"#a55");
      ctx.fillText(o.n, w*0.145, y-2);
      ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#999";
      ctx.fillText(o.fx, w*0.145, y+10);
      ctx.textAlign="right"; ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillStyle = afford ? (glowCol||"#fff") : "#f22";
      ctx.fillText(o.c+"\u25C6", w*0.855, y+2);
      ctx.textAlign="left";
    });
    // speed-clear bonus row \u2014 wipe a wave inside 60s and a charm slot unlocks here; otherwise
    // it's shown locked with a padlock and how far over 60s the clear took
    const bonusY=row0+3*ROW_STEP, bonusTop=bonusY-cardH*0.5;
    if(PK.speedBonus){
      if(PK.speedBonus.unlocked && PK.speedBonus.charm){
        const ch=PK.speedBonus.charm, afford=PK.bones>=ch.cost;
        const pulse=0.7+0.3*Math.sin(performance.now()/180);
        ctx.save(); ctx.globalAlpha=pulse;
        ctx.strokeStyle="#e8c14a"; ctx.lineWidth=3;
        ctx.strokeRect(w*0.10, bonusTop, w*0.80, cardH);
        ctx.restore();
        ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
        ctx.fillStyle=afford?"#e8c14a":"#a55";
        ctx.fillText("\u2605 "+ch.name, w*0.145, bonusY-2);
        ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#999";
        ctx.fillText("60s CLEAR BONUS \u2014 "+ch.fx, w*0.145, bonusY+10);
        ctx.textAlign="right"; ctx.font="7px 'Press Start 2P',monospace";
        ctx.fillStyle=afford?"#e8c14a":"#f22";
        ctx.fillText(ch.cost+"\u25C6", w*0.855, bonusY+2);
        ctx.textAlign="left";
      } else {
        ctx.strokeStyle="#444"; ctx.lineWidth=2;
        ctx.strokeRect(w*0.10, bonusTop, w*0.80, cardH);
        drawLock(ctx, w*0.145+5, bonusY-3, 0.9, "#666");
        ctx.font="7px 'Press Start 2P',monospace"; ctx.fillStyle="#666"; ctx.textAlign="left";
        ctx.fillText("CHARM LOCKED", w*0.21, bonusY-2);
        ctx.font="6px 'Press Start 2P',monospace";
        ctx.fillText("+"+(PK.speedBonus?PK.speedBonus.over:0)+"s OVER THE 60s CLEAR", w*0.21, bonusY+10);
        ctx.textAlign="left";
      }
    }
    const skipY=row0+4*ROW_STEP-cardH*0.15, skipH=h*0.06;
    ctx.strokeStyle="#666"; ctx.lineWidth=2;
    ctx.strokeRect(w*0.30,skipY,w*0.40,skipH);
    ctx.fillStyle="#888"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("SKIP", w/2, skipY+skipH*0.65);
  }
  ctx.textAlign="left";
}
(function(){
  const cv=document.querySelector("#parkcv");
  cv.addEventListener("pointerdown",e=>{
    if(!PK.active) return;
    const r=cv.getBoundingClientRect();
    if(PK.shop){
      const yF=(e.clientY-r.top)/r.height;
      // must mirror pkPadDraw's row0/ROW_STEP/cardH layout exactly, or taps miss the cards
      const rowStepF=0.125, cardHF=0.09, row0F=0.335, tolF=cardHF/2;
      for(let i=0;i<3;i++){
        if(Math.abs(yF-(row0F+i*rowStepF))<tolF){
          const o=PK.shop[i];
          if(PK.bones>=o.c){ PK.bones-=o.c; o.f(); pkFanfare(o.n.replace(/^\u2b25 /,""),!!o.relic); PK.shop=null; }
          else beep(150,.1);
          return;
        }
      }
      if(PK.speedBonus && PK.speedBonus.unlocked && PK.speedBonus.charm && Math.abs(yF-(row0F+3*rowStepF))<tolF){
        const ch=PK.speedBonus.charm;
        if(PK.bones>=ch.cost){
          PK.bones-=ch.cost; ch.apply(); PK.relic=ch.id; tickTodo("j_collar");
          PK.speedBonus.charm=null;
          pkFanfare(ch.name,true); PK.shop=null;
        } else beep(150,.1);
        return;
      }
      const skipYF=row0F+4*rowStepF-cardHF*0.15+0.03;
      if(Math.abs(yF-skipYF)<0.045){ PK.shop=null; beep(400,.05); }
      return;
    }
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
