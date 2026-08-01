/* ===== GO TO THE PARK (Dogpark) ===== */
// Dogpark is its own self-contained roguelite: BONES (dropped by enemies) is a mini-currency
// that only exists inside a run, spent on stat upgrades and rare charm relics between waves.
// None of it carries over — only a small trickle of real hub XP makes it home, earned from
// how many enemies you downed and how many side objectives (hoop/tunnel/ramp) you hit.
const PK={active:false, godMode:false}; // godMode is a dev-only toggle and deliberately isn't reset per-run
function wd(d,M){ return ((d + M/2) % M + M) % M - M/2; }  // shortest signed delta on the looping world
function pkInvuln(){ return PK.godMode || PK.starT>0; }   // star power grants temporary invincibility
const XP_PER_KILL=0.4, XP_PER_SIDE=2;
// rare enemy-drop powerups — 1% chance each, independent of the guaranteed bone drop
const STAR_DROP_CHANCE=0.01, MAGNET_DROP_CHANCE=0.01, STAR_DURATION=15, MAGNET_HOMING_SPEED=280;
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
  {label:"XP",    sub:"10 BONES → 2 XP",    cost:10, f:()=>addXP(2)},
  {label:"MONEY", sub:"10 BONES → $5",      cost:10, f:()=>{S.money+=5;}},
  {label:"SNACK", sub:"15 BONES → 1 SNACK", cost:15, f:()=>{S.snacks+=1;}}
];
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
  openChoice("BONES LEFT OVER",
    "YOU HAVE "+biscuits+" BONES LEFT OVER.<br><br>BURY THEM IN THE GARDEN FOR XP?",
    "BURY THEM — +"+biscuits+" XP", ()=>{
      addXP(biscuits); beep(700,.08); setTimeout(()=>beep(950,.09),100);
      toast("+"+biscuits+" XP FROM THE GARDEN.");
      showScreen("home"); renderMeters(); renderShop();
    },
    "LEAVE THEM", ()=>{ showScreen("home"); renderMeters(); renderShop(); });
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
function startPark(plus){
  Object.assign(PK,{
    active:true,t:0,wave:1,waveT:0,spawnT:1,
    waveQuota:pkWaveQuota(1), waveSpawned:0,
    goldenDone:false, goldenAt:3+Math.random()*8,
    convertOpen:false, barkedTypes:{}, missionBarkAll:false, missionSurviveW1:false,
    maxhp:Math.round(50+50*S.mood/100),
    spd:95*(0.75+0.5*S.energy/100)*(S.senior?0.85:1),
    barkMax:Math.max(1.2,3-0.06*S.lvl), barkCd:1, pulse:0,
    barkR:30*(0.8+0.4*S.hunger/100), knock:150,
    bones:0, bonesMult:1, kills:0, sideDone:0, relic:null, waveBanner:null, shopFlash:null,
    worldMult:2, barkBigLvl:0, barkFastLvl:0, speedBonus:null,
    chain:0, chainT:0, inv:0, fx:[],
    x:0,y:0,vx:0,vy:0, joy:null,
    en:[], fr:[], gate:{}, started:false, shop:null, biscuits:[], drops:[], pendingBury:0, nuts:[],
    powerups:[], starT:0, zoom:1,
    plusMode:!!plus, mixTypes:null, mixLabel:null, swoopT:0
  });
  PK.hp=PK.maxhp;
  PK.acts=[{k:"hoop",x:.15,y:.125,cd:0},{k:"tunnel",x:.35,y:.36,cd:0},{k:"ramp",x:.11,y:.39,cd:0},{k:"tunnel",x:.62,y:.70,cd:0},{k:"hoop",x:.85,y:.20,cd:0}];
  PK.waveBanner={text:"WAVE 1 — CLEAR THE BIRDS", life:2.2, max:2.2};
  SPARKS.length=0;
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
  const hp0=type==="cat"?2:1;
  PK.en.push({t:type, x:(PK.x+Math.cos(ang)*R+WW)%WW, y:(PK.y+Math.sin(ang)*R+WH)%WH,
    hp:hp0, hpMax:hp0,
    sp:(type==="sq"?70:type==="bird"?85:45)*(1+wv*0.05),
    ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
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
// WAVE 2 \u2014 BIRD BACKUP: long formations of birds fly in diagonally from either side (NE/NW/
// SW/SE bearings only), holding a staggered wedge. 1-hit kill like every other bird. If it'd
// fly clean off the engagement area, it rubber-bands its heading back toward the fray instead
// of leaving, so the flock keeps looping through until every last one is knocked down.
function pkSpawnFlock(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const n=(12+Math.floor(Math.random()*9))*pkPlusMult();
  const diagonals=[Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75];
  const ang=diagonals[Math.floor(Math.random()*4)], perp=ang+Math.PI/2;
  const R=Math.max(w,h)*0.85;
  const cx=PK.x-Math.cos(ang)*R, cy=PK.y-Math.sin(ang)*R;   // upstream of the flight path
  const sp=90+Math.random()*20;
  for(let i=0;i<n;i++){
    const off=(i-(n-1)/2)*15+(Math.random()-0.5)*8;         // staggered wedge formation
    const sxo=cx+Math.cos(perp)*off, syo=cy+Math.sin(perp)*off;
    PK.en.push({t:"bird", flock:true, x:(sxo+WW)%WW, y:(syo+WH)%WH,
      hp:1, hpMax:1, sp, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
      ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  PK.waveSpawned += n;
  if(Math.random()<STALK_CHANCE) pkSpawnStalkCat(PK.x+(Math.random()-0.5)*80, PK.y+(Math.random()-0.5)*80, 1+Math.floor(Math.random()*2));
  toast(n+" BIRDS INBOUND \u2014 BACKUP ARRIVES!",1);
  beep(520,.09,"square",.05); setTimeout(()=>beep(680,.09,"square",.05),90);
  return n;
}
const LASER_WIDTH=13;
function pkLaserRange(){ return Math.min(PK.WW,PK.WH)*0.42; }   // stays under half the world so the
                                                                 // wrap-aware hit-test never disagrees with the straight beam drawn on screen
function pkPlusMult(){ return PK.plusMode ? 2 : 1; }   // DOGPARK+: same wave structure, double enemies on screen at once
// ===== WAVE REDESIGN v2 =====
const STANDING_SPOOK_R=58, SPOOK_SPEED=100, SPOOK_LIFE=3.2;   // wave 1: how close before a roost startles, and how it scatters
const STALK_CHANCE=0.20;                                      // waves 1-2: chance a bird-flock spawn also drops stalking cats
const STALK_CAT_SOFTCAP=6, STALK_AGGRO_R=65, STALK_ORBIT_R=48, STALK_ORBIT_SPEED=0.9, STALK_LEAP_SPEED=185, STALK_LEAP_TIME=0.3, STALK_CHASE_SPD=62;
const NUT_SPEED=145;                                          // wave 4/mix: thrown-nut projectile speed
const RANGER_PLANT_R=200, RANGER_APPROACH_SPD=55, RANGER_WINDUP=0.55, RANGER_THROW_CD=1.5;   // wave 4: nut-throwing squirrels
const MADSQ_CHARGE=1.4, MADSQ_SWEEP_TIME=3.0, MADSQ_SWEEP_ARC=0.9, MADSQ_SWEEP_RATE=2.4;      // wave 5: rotating-beam squirrels
const ALPHA_LEAP_R=170, ALPHA_LEAP_SPEED=280, ALPHA_LEAP_TIME=0.45, ALPHA_LEAP_CD=4, ALPHA_LEAP_DMG=20, ALPHA_APPROACH_SPD=50; // wave 6
// WAVE 1 — CLEAR THE BIRDS: loose flocks of 3-7 birds clustered together, standing until
// BONES gets close, then the whole flock startles and scatters (still hittable mid-scatter,
// and settles back into a roost instead of despawning if it gets away clean). 1-hit kill.
function pkSpawnBirdGroup(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  const cx=(PK.x+Math.cos(ang)*R+WW)%WW, cy=(PK.y+Math.sin(ang)*R+WH)%WH;
  const n=(3+Math.floor(Math.random()*5))*pkPlusMult();   // 3-7 birds
  for(let i=0;i<n;i++){
    const ox=(Math.random()-0.5)*46, oy=(Math.random()-0.5)*34;
    PK.en.push({t:"bird", standing:true, x:(cx+ox+WW)%WW, y:(cy+oy+WH)%WH,
      hp:1, hpMax:1, sp:0, ph:Math.random()*6, kx:0, ky:0, dir:Math.random()<0.5?-1:1, fi:0, ft:0});
  }
  if(Math.random()<STALK_CHANCE) pkSpawnStalkCat(cx,cy, 1+Math.floor(Math.random()*2));
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
      hp:2, hpMax:2, sp:0, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      anchorX:(ax+WW)%WW, anchorY:(ay+WH)%WH, orbitAng:Math.random()*6.283});
  }
}
// WAVE 3 — CAT BACKUP: squads of 2-4 cats charging in directly. 2-hit kill.
function pkSpawnCatSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const n=(2+Math.floor(Math.random()*3))*pkPlusMult();
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  for(let i=0;i<n;i++){
    const a2=ang+(Math.random()-0.5)*0.8;
    PK.en.push({t:"cat", x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:2, hpMax:2, sp:48, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0});
  }
  PK.waveSpawned+=n;
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
  const n=(2+Math.floor(Math.random()*2))*pkPlusMult();
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.65;
  for(let i=0;i<n;i++){
    const a2=ang+(Math.random()-0.5)*0.9;
    PK.en.push({t:"sq", ranger:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:1, hpMax:1, sp:RANGER_APPROACH_SPD, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      atkState:"approach", atkCd:0.6+Math.random()*0.8});
  }
  PK.waveSpawned+=n;
  return n;
}
// WAVE 5 — MAD SQUIRRELS: you made them mad. Same weak 1 HP, but their eyes glow red and they
// root in place to sweep a rotating beam — a boss-style swooping attack — for a full 3 seconds,
// then overheat and self-destruct in a satisfying pop, whether or not they ever hit BONES.
function pkSpawnMadSquad(){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const n=(2+Math.floor(Math.random()*2))*pkPlusMult();
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  for(let i=0;i<n;i++){
    const a2=ang+(Math.random()-0.5)*0.9;
    PK.en.push({t:"sq", madsq:true, x:(PK.x+Math.cos(a2)*R+WW)%WW, y:(PK.y+Math.sin(a2)*R+WH)%WH,
      hp:1, hpMax:1, sp:44, ph:Math.random()*6, kx:0, ky:0, dir:1, fi:0, ft:0,
      laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.6+Math.random()*0.8});
  }
  PK.waveSpawned+=n;
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
      hp:5, hpMax:5, sp:ALPHA_APPROACH_SPD, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0, leapCd:1.5+Math.random()});
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
function pkSpawnMixBurst(types){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  const WW=PK.WW||w*2, WH=PK.WH||h*2;
  const n=(1+Math.floor(Math.random()*3))*pkPlusMult();
  const ang=Math.random()*6.283, R=Math.max(w,h)*0.62;
  for(let i=0;i<n;i++){
    const type=types[Math.floor(Math.random()*types.length)];
    const a2=ang+(Math.random()-0.5)*0.9;
    const x=(PK.x+Math.cos(a2)*R+WW)%WW, y=(PK.y+Math.sin(a2)*R+WH)%WH;
    if(type==="bird") PK.en.push({t:"bird", x,y, hp:1,hpMax:1, sp:85, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0});
    else if(type==="cat") PK.en.push({t:"cat", x,y, hp:2,hpMax:2, sp:48, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0});
    else if(type==="ranger") PK.en.push({t:"sq", ranger:true, x,y, hp:1,hpMax:1, sp:RANGER_APPROACH_SPD, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0, atkState:"approach", atkCd:0.6+Math.random()*0.8});
    else if(type==="madsq") PK.en.push({t:"sq", madsq:true, x,y, hp:1,hpMax:1, sp:44, ph:Math.random()*6, kx:0,ky:0, dir:1, fi:0, ft:0, laserState:"seek", chargeT:0, aimAng:0, sweepT:0, cd:0.6+Math.random()*0.8});
  }
  PK.waveSpawned+=n;
  return n;
}
// how many enemies a wave needs cleared \u2014 hand-set to match the redesigned wave-by-wave
// spec. waves beyond 10 keep extending the mix pattern with a gently rising quota.
function pkWaveQuota(wv){
  if(wv===1) return 5;
  if(wv===2) return 20;
  if(wv===3) return 10;
  if(wv===4) return 20;
  if(wv===5) return 25;
  if(wv===6) return 22;   // 2 alphas + 20 regular cats
  if(wv>=7 && wv<=10) return 20+(wv-7)*2;   // 20, 22, 24, 26
  return 26+(wv-10)*2;
}
const FLEE_SPEED=115, FLEE_TIME=2.2;   // how fast, and how long, a scared-off enemy scuttles before despawning
function pkBark(){
  PK.barkCd = PK.starT>0 ? 0 : PK.barkMax;   // star power: unlimited barking, no cooldown
  PK.pulse=0.35;
  beep(190,.1,"square",.06);
  let hits=0;
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    if(e.fleeing) continue;   // already scared off — can't be hit again
    const dxw=wd(e.x-PK.x,PK.WW), dyw=wd(e.y-PK.y,PK.WH);
    const d=Math.hypot(dxw,dyw)||1;
    if(d<PK.barkR){
      e.hp--;
      // every enemy type barked at counts toward the "bark at everybody" side mission
      PK.barkedTypes[e.t]=true;
      if(!PK.missionBarkAll && PK.barkedTypes.sq && PK.barkedTypes.bird && PK.barkedTypes.cat){
        PK.missionBarkAll=true; addXP(20);
        pkFanfare(null,false,"✓ BARKED AT EVERYONE — +20 XP");
      }
      if(e.hp<=0){
        // he doesn't kill anyone anymore: one bone drops where they were caught, they look
        // shocked, then scuttle off-screen on their own — pkEn's fleeing branch handles the rest
        PK.drops.push({x:e.x, y:e.y, v:1, gold:!!e.alpha, life:25});
        if(Math.random()<STAR_DROP_CHANCE) PK.powerups.push({type:"star", x:e.x, y:e.y-10, life:18});
        if(Math.random()<MAGNET_DROP_CHANCE) PK.powerups.push({type:"magnet", x:e.x, y:e.y+10, life:18});
        PK.kills++;
        hits++;
        e.fleeing=true; e.shockT=0.35; e.fleeT=0;
        e.fleeVx=-dxw/d*FLEE_SPEED; e.fleeVy=-dyw/d*FLEE_SPEED;
        beep(950,.08,"square",.04);
      }
      else {
        e.kx=dxw/d*PK.knock; e.ky=dyw/d*PK.knock;
        if(e.flock && !e.circling) e.circling=true;   // survives a hit -> breaks formation to circle and dive-attack
      }
    }
  }
  if(hits>0) beep(300,.05);
}
const BARK_LVL_CAP=4;
function pkExpandPark(){
  PK.worldMult=Math.min(4,PK.worldMult+0.5);
  PK.zoom=Math.max(0.76,1-(PK.worldMult-2)*0.12);   // zoom out a touch as the park grows, for a wider view
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
  if(PK.shop || PK.convertOpen) return;   // world pauses while shopping or exchanging bones
  PK.t+=dt; PK.waveT+=dt;
  PK.chainT=Math.max(0,PK.chainT-dt); if(PK.chainT<=0) PK.chain=0;
  PK.inv=Math.max(0,PK.inv-dt); PK.pulse=Math.max(0,PK.pulse-dt);
  PK.starT=Math.max(0,PK.starT-dt);
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
  // a wave only ends once its full quota has spawned AND every last enemy is down (fleeing
  // stragglers don't count \u2014 they're already defeated, just scuttling off in the background;
  // spooked-but-alive roost birds that got away clean also don't block the clear)
  if(PK.waveSpawned>=PK.waveQuota && !PK.en.some(e=>!e.fleeing && !e.spooked && !e.stalk && !e.stalkAggro && !e.swoop)){
    // survive the very first wave and it's a straight-up XP bonus
    if(PK.wave===1 && !PK.missionSurviveW1){
      PK.missionSurviveW1=true; addXP(10);
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
    PK.waveT=0; PK.wave++;
    if(PK.wave>=3) tickTodo("j_wave3");
    PK.barkMax=Math.max(1,PK.barkMax-0.12); PK.barkR+=5;
    PK.waveQuota=pkWaveQuota(PK.wave); PK.waveSpawned=0;
    PK.goldenDone=false; PK.goldenAt=3+Math.random()*8;
    const WNAME={1:"CLEAR THE BIRDS",2:"BIRD BACKUP",3:"CAT BACKUP",4:"NUT THROWERS",5:"\u26a0 MAD SQUIRRELS",6:"\u2620 THE ALPHAS"};
    if(PK.wave===6) pkSpawnAlphaSquad();
    if(PK.wave>=7){ PK.mixTypes=pkPickMixTypes(); PK.mixLabel=MIX_NAME[PK.mixTypes[0]]+" & "+MIX_NAME[PK.mixTypes[1]]; }
    const label = PK.wave>=7 ? PK.mixLabel : WNAME[PK.wave];
    const waveLabel="WAVE "+PK.wave+(label?" \u2014 "+label:"");
    toast(waveLabel);
    PK.waveBanner={text:waveLabel, life:2.2, max:2.2};
    beep(500,.08);
    if(PK.wave===4) setTimeout(()=>toast("WATCH OUT, NUTS INCOMING",1),2300);
    pkShopOpen();
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
  PK.spawnT-=dt;
  if(PK.spawnT<=0 && PK.waveSpawned<PK.waveQuota){
    const wv=PK.wave;
    if(wv===1){ PK.spawnT=5.5; PK.waveSpawned+=pkSpawnBirdGroup(); }             // CLEAR THE BIRDS: loose roosts, standing until disturbed
    else if(wv===2){ PK.spawnT=8; PK.waveSpawned+=pkSpawnFlock(); }              // BIRD BACKUP: long diagonal formations
    else if(wv===3){ PK.spawnT=4; PK.waveSpawned+=pkSpawnCatSquad(); }           // CAT BACKUP: direct cat squads
    else if(wv===4){ PK.spawnT=4.5; PK.waveSpawned+=pkSpawnRangerSquad(); }      // NUT THROWERS: ranged squirrels
    else if(wv===5){ PK.spawnT=5; PK.waveSpawned+=pkSpawnMadSquad(); }           // MAD SQUIRRELS: rotating-beam squirrels
    else if(wv===6){ PK.spawnT=4; PK.waveSpawned+=pkSpawnCatSquad(); }           // THE ALPHAS: regular-cat trickle (alphas spawned once at wave start)
    else { PK.spawnT=3.5; PK.waveSpawned+=pkSpawnMixBurst(PK.mixTypes||pkPickMixTypes()); }   // mixed threats, waves 7+
  }
  let mx=0,my=0;
  if(PK.joy){ mx=PK.joy.dx; my=PK.joy.dy; }
  if(Math.hypot(mx,my)>0.1){ const l=Math.hypot(mx,my); PK.vx=mx/l*PK.spd; PK.vy=my/l*PK.spd; }
  else { PK.vx*=0.8; PK.vy*=0.8; }
  PK.x=(PK.x+PK.vx*dt+WW)%WW;
  PK.y=(PK.y+PK.vy*dt+WH)%WH;
  PK.barkCd-=dt;
  if((PK.barkCd<=0||PK.starT>0) && PK.en.some(e=>!e.fleeing && Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH))<PK.barkR)) pkBark();
  if(PK.starT>0 && Math.random()<0.55){
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
        e.stalk=false; e.stalkAggro=true; e.leapT=STALK_LEAP_TIME;
        e.lvx=dxw0/d0*STALK_LEAP_SPEED; e.lvy=dyw0/d0*STALK_LEAP_SPEED;
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
      if(e.leapT>0){
        e.leapT-=dt;
        e.x=(e.x+e.lvx*dt+WW)%WW; e.y=(e.y+e.lvy*dt+WH)%WH;
        e.dir = e.lvx<0 ? -1 : 1;
      } else {
        const sx=dxw/d*STALK_CHASE_SPD, sy=dyw/d*STALK_CHASE_SPD;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
      }
      e.ft+=dt; if(e.ft>0.1){ e.ft=0; e.fi++; }
      if(d<14 && PK.inv<=0 && !pkInvuln()){
        PK.hp-=8; PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
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
          const sx=dxw/d*e.sp, sy=dyw/d*e.sp;
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
        PK.hp-=6; PK.inv=0.6; e.kx=-dxw/d*200; e.ky=-dyw/d*200;
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
        const sx=dxw/d*e.sp, sy=dyw/d*e.sp;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        e.cd-=dt;
        if(e.cd<=0 && d<pkLaserRange()*0.8){ e.laserState="charge"; e.chargeT=0; e.aimAng=Math.atan2(dyw,dxw); }
        if(d<14 && PK.inv<=0 && !pkInvuln()){
          PK.hp-=8; PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
        }
      } else if(e.laserState==="charge"){
        e.chargeT+=dt;
        if(e.chargeT>=MADSQ_CHARGE){ e.laserState="sweep"; e.sweepT=0; e.aimAng=Math.atan2(dyw,dxw); }
      } else if(e.laserState==="sweep"){
        e.sweepT+=dt;
        e.aimAng = Math.atan2(dyw,dxw) + Math.sin(e.sweepT*MADSQ_SWEEP_RATE)*MADSQ_SWEEP_ARC;
        e.dir = Math.cos(e.aimAng)<0 ? -1 : 1;
        const ux=Math.cos(e.aimAng), uy=Math.sin(e.aimAng);
        const along=dxw*ux+dyw*uy, perp=Math.abs(dxw*uy-dyw*ux);
        if(along>0 && along<pkLaserRange() && perp<LASER_WIDTH && PK.inv<=0 && !pkInvuln()){
          PK.hp-=12; PK.inv=0.5;
          beep(150,.15,"sawtooth"); if(PK.hp<=0) return pkDeath();
        }
        if(e.sweepT>=MADSQ_SWEEP_TIME){
          PK.drops.push({x:e.x, y:e.y, v:1, life:25});
          if(Math.random()<STAR_DROP_CHANCE) PK.powerups.push({type:"star", x:e.x, y:e.y-10, life:18});
          if(Math.random()<MAGNET_DROP_CHANCE) PK.powerups.push({type:"magnet", x:e.x, y:e.y+10, life:18});
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
          PK.hp-=ALPHA_LEAP_DMG; PK.inv=0.7; e.kx=-dxw/d*260; e.ky=-dyw/d*260;
          beep(140,.3,"sawtooth"); if(PK.hp<=0) return pkDeath();
        }
      } else {
        const sx=dxw/d*e.sp, sy=dyw/d*e.sp;
        e.dir = sx<0 ? -1 : 1;
        e.x=(e.x+(sx+e.kx)*dt+WW)%WW; e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
        e.leapCd-=dt;
        if(e.leapCd<=0 && d<ALPHA_LEAP_R){ e.leapState="windup"; e.leapWindT=0.6; e.leapAng=Math.atan2(dyw,dxw); }
        if(d<16 && PK.inv<=0 && !pkInvuln()){
          PK.hp-=14; PK.inv=0.6; e.kx=-dxw/d*220; e.ky=-dyw/d*220;
          beep(110,.12,"sawtooth"); if(PK.hp<=0) return pkDeath();
        }
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
      if(d<14 && PK.inv<=0 && !pkInvuln()){
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
    if(d<14 && PK.inv<=0 && !pkInvuln()){
      PK.hp-=8; PK.inv=0.6;
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
  // thrown nuts — simple straight-line projectiles from ranger/mad squirrels
  for(let i=PK.nuts.length-1;i>=0;i--){
    const n=PK.nuts[i];
    n.x=(n.x+n.vx*dt+WW)%WW; n.y=(n.y+n.vy*dt+WH)%WH; n.life-=dt;
    if(n.life<=0){ PK.nuts.splice(i,1); continue; }
    if(Math.hypot(wd(n.x-PK.x,WW),wd(n.y-PK.y,WH))<12 && PK.inv<=0 && !pkInvuln()){
      PK.hp-=10; PK.inv=0.6; beep(140,.15,"sawtooth");
      PK.nuts.splice(i,1);
      if(PK.hp<=0) return pkDeath();
      continue;
    }
  }
  for(const a of PK.acts){
    a.cd=Math.max(0,a.cd-dt);
    if(a.cd<=0 && Math.hypot(wd(a.x*WW-PK.x,WW),wd(a.y*WH-PK.y,WH))<22){
      a.cd=3; pkGain(2, a.x*WW, a.y*WH); PK.sideDone++; beep(700,.06);
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
    if(Math.hypot(wd(dr.x-PK.x,WW),wd(dr.y-PK.y,WH))<16){
      pkGain(dr.v, dr.x, dr.y);            // chain ticks per pickup — route efficiency pays
      beep(dr.gold?900:640,.06);
      PK.drops.splice(i,1);
    }
  }
  for(let i=PK.powerups.length-1;i>=0;i--){
    const p=PK.powerups[i];
    p.life-=dt;
    if(p.life<=0){ PK.powerups.splice(i,1); continue; }
    if(Math.hypot(wd(p.x-PK.x,WW),wd(p.y-PK.y,WH))<18){
      if(p.type==="star"){
        PK.starT=STAR_DURATION;
        pkFanfare(null,true,"★ STAR POWER — 15s OF FEARLESS BARKING!");
        beep(1100,.1); setTimeout(()=>beep(1400,.12),100);
      } else {
        for(const dr of PK.drops) dr.magnet=true;
        pkFanfare(null,true,"🧲 MAGNET — BONES INCOMING!");
        beep(820,.1); setTimeout(()=>beep(600,.1),90);
      }
      PK.powerups.splice(i,1);
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
  const earned=pkRunXP();
  if(earned>0) addXP(earned);
  LVLFX = earned>0 ? 1.2 : 0;
  pkExitCosts(); S.fun=clamp(S.fun+20,0,100); S.mood=clamp(S.mood+8,0,100);
  $("#resTitle").textContent="XP BANKED"; $("#resTitle").style.color="#fff";
  $("#resPortrait").src = PORTRAITS.content;   // pkReveal takes it from here, building to HAPPY as the pile grows
  $("#resPortraitWrap").classList.add("show");
  $("#resScore").textContent=g+" BONES";
  $("#resLines").innerHTML="WAVE "+PK.wave+" REACHED.<br>"+PK.kills+" DOWNED, "+PK.sideDone+" SIDE OBJECTIVES.<br>A GOOD DAY AT THE PARK.";
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
    ctx.fillStyle="#f22"; ctx.globalAlpha=0.5+0.5*p;
    ctx.beginPath(); ctx.arc(eyeX,eyeY,1+p*4,0,7); ctx.fill();
    ctx.globalAlpha=1;
  } else if(e.laserState==="sweep"){
    const ang=e.aimAng, range=pkLaserRange();
    ctx.strokeStyle="#f22"; ctx.lineWidth=7;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(eyeX+Math.cos(ang)*range, eyeY+Math.sin(ang)*range); ctx.stroke();
    ctx.strokeStyle="#fff"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(eyeX,eyeY); ctx.lineTo(eyeX+Math.cos(ang)*range, eyeY+Math.sin(ang)*range); ctx.stroke();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(eyeX,eyeY,3,0,7); ctx.fill();
  }
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
function drawEnemy(ctx,e,sx,sy){
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx, sy+2, 9, 3, 0, 0, 7); ctx.fill();
  if(e.madsq && !e.fleeing) drawLaserFX(ctx,e,sx,sy);
  if((e.fleeing && e.shockT>0 && !e.madsqExplode || (e.spooked && e.spookT<0.3) || (e.stalkAggro && e.leapT>0)) && Math.floor(performance.now()/90)%2){
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
  if(!img || !img.complete || !img.naturalWidth){ drawEnemyVector(ctx,e,sx,sy); if(e.madsqExplode) drawMadsqExplosion(ctx,sx,sy,e.explodeT); return; }
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
  drawEnemyHP(ctx,e,sx,sy,eh);
  if(e.madsqExplode) drawMadsqExplosion(ctx,sx,sy,e.explodeT);
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
  for(const n of PK.nuts){
    const [nx2,ny2]=SC(n.x,n.y);
    if(nx2<-24||nx2>w+24||ny2<-24||ny2>h+24) continue;
    const ang=Math.atan2(n.vy,n.vx);
    // faint motion trail so a thrown nut reads clearly against the grass
    ctx.strokeStyle="rgba(255,220,150,.35)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(nx2,ny2); ctx.lineTo(nx2-Math.cos(ang)*14, ny2-Math.sin(ang)*14); ctx.stroke();
    ctx.fillStyle="rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(nx2,ny2+5,4,2,0,0,7); ctx.fill();
    ctx.save(); ctx.translate(nx2,ny2); ctx.rotate(ang+performance.now()/90);
    ctx.strokeStyle="#2a1808"; ctx.lineWidth=1.5;
    ctx.fillStyle="#d99a4a"; ctx.beginPath(); ctx.ellipse(0,0,6,5.5,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle="#7a4a1f"; ctx.beginPath(); ctx.ellipse(-2.5,-2.5,3.6,3.2,0,0,7); ctx.fill(); ctx.stroke();
    ctx.restore();
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
    if(PK.starT>0){   // star power: bones flashes gold and shiny with a pulsing aura
      const rglow=0.5+0.5*Math.sin(t*8);
      ctx.save(); ctx.globalAlpha=rglow*0.35; ctx.fillStyle="#ffd94a";
      ctx.beginPath(); ctx.arc(DX,DY,24,0,7); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(PK.starT>0) ctx.filter="sepia(1) saturate(6) hue-rotate(-15deg) brightness(1.35)";
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
  for(const p of PK.powerups){
    const [px3,py3]=SC(p.x,p.y);
    if(px3<-20||px3>w+20||py3<-20||py3>h+20) continue;
    if(p.life<4 && Math.floor(p.life*6)%2) continue;   // blink out
    const bob=Math.sin(t*4+p.x)*3;
    if(p.type==="star"){
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
  ctx.strokeStyle="#666"; ctx.lineWidth=2; ctx.strokeRect(8,10,110,30);
  drawBone(ctx, 24, 26, 1, "#fff");
  ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText(PK.bones+" BONES", 34, 29);
  const leftToClear=Math.max(0,PK.waveQuota-PK.waveSpawned)+PK.en.filter(e=>!e.fleeing).length;
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(w-100,10,90,30);
  ctx.fillStyle="#fff"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText("WAVE "+PK.wave, w-55, 23);
  ctx.font="6px 'Press Start 2P',monospace";
  ctx.fillText(leftToClear+" LEFT", w-55, 34);
  const waveTotal=Math.max(1,PK.waveQuota), wavePct=clamp(Math.round((1-leftToClear/waveTotal)*100),0,100);
  ctx.fillStyle="#fff"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText(wavePct+"% CLEAR", w-55, 51);
  ctx.strokeStyle="#666"; ctx.lineWidth=1; ctx.strokeRect(w-100,54,90,8);
  ctx.fillStyle="#4a9"; ctx.fillRect(w-99,55,88*wavePct/100,6);
  ctx.textAlign="left";
  if(PK.starT>0){
    const bw=Math.min(140,w*0.55), bx=w/2-bw/2;
    ctx.fillStyle="rgba(255,217,74,.18)"; ctx.fillRect(bx,44,bw,18);
    ctx.strokeStyle="#ffd94a"; ctx.lineWidth=2; ctx.strokeRect(bx,44,bw,18);
    ctx.fillStyle="#ffd94a"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("★ STAR "+PK.starT.toFixed(1)+"s", w/2, 57);
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
      const afford=PK.bones>=o.cost;
      ctx.strokeStyle = afford?"#fff":"#663333"; ctx.lineWidth=2;
      ctx.strokeRect(w*0.10, top, w*0.80, cCardH);
      ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
      ctx.fillStyle = afford?"#fff":"#a55";
      ctx.fillText(o.label, w*0.145, y-1);
      ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#999";
      ctx.fillText(o.sub, w*0.145, y+11);
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
    if(PK.convertOpen){
      const yF=(e.clientY-r.top)/r.height;
      const cRowStep=0.10, cCardH=0.075, cRow0=0.33, tolF=cCardH/2;
      for(let i=0;i<3;i++){
        if(Math.abs(yF-(cRow0+i*cRowStep))<tolF){
          const o=BONES_EXCHANGE[i];
          if(PK.bones>=o.cost){ PK.bones-=o.cost; o.f(); beep(700,.06); toast(o.sub+" — DONE"); }
          else beep(150,.1);
          return;
        }
      }
      if(Math.abs(yF-(cRow0+3*cRowStep))<0.04){ PK.convertOpen=false; beep(400,.05); }
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
