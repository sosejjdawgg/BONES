/* ===== GO TO THE PARK (Dogpark) ===== */
const PK={active:false};
function wd(d,M){ return ((d + M/2) % M + M) % M - M/2; }  // shortest signed delta on the looping world
const BANK_RATE=0.22; // run-XP is big and spendable; only this fraction becomes real leveling XP
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
/* ── ANGEL WINGS ────────────────────────────────────────────────────────────
   A cooldown-gated special with its own stamina pool — nothing to do with HP
   or the bark. Double-tap the pad to launch; HOLD the second tap to stay up
   (5s ceiling); release to dive. Contact with the ground = stomp AoE.
   While he is above WING.clearZ he and the horde simply cannot reach
   each other — that is the whole point of the ability. */
const WINGIMG = WINGFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const WING = {
  cost:45,           // stamina per leap
  cd:8,              // seconds of cooldown after landing
  hover:5,           // hard ceiling on airtime
  minHover:0.55,     // you always get this much, even on a flick-tap
  rise:0.26, dive:0.30,
  apex:112,          // fake height in screen px
  clearZ:34,         // above this: no collisions, either way
  push:2.7,          // pounce speed as a multiple of ground speed
  aspect:196/131, anchorY:127/131
};
function pkWingFrame(t){
  const J=PK.jump;
  if(!J) return (Math.floor(t*2)%9===0)?1:0;                                 // folded, occasional twitch
  if(J.flop) return Math.floor(t*11)%2;                                      // pitiful half-flutter
  if(J.ph==="rise") return Math.min(6,Math.floor(clamp(J.t/WING.rise,0,1)*6.99));
  if(J.ph==="hover") return [4,5,6,5][Math.floor(t*9)%4];                    // beat loop, fully spread
  return [6,5][Math.floor(t*12)%2];
}
function pkRing(x,y,r,life,col,fill){ PK.rings.push({x,y,r,life,max:life,col,fill}); }
function pkFeather(x,y,z){
  const a=Math.random()*6.283, sp=20+Math.random()*46;
  PK.fth.push({x,y,z:z+Math.random()*18, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, vz:12+Math.random()*30,
    rot:Math.random()*6.283, vr:(Math.random()-0.5)*7, life:0.7+Math.random()*0.7, max:1.4});
}
function pkParticles(dt){
  for(let i=PK.rings.length-1;i>=0;i--){ PK.rings[i].life-=dt; if(PK.rings[i].life<=0) PK.rings.splice(i,1); }
  for(let i=PK.fth.length-1;i>=0;i--){
    const f=PK.fth[i]; f.life-=dt;
    if(f.life<=0){ PK.fth.splice(i,1); continue; }
    f.x=(f.x+f.vx*dt+PK.WW)%PK.WW; f.y=(f.y+f.vy*dt+PK.WH)%PK.WH;
    f.vx*=0.94; f.vy*=0.94;
    f.vz-=90*dt; f.z+=f.vz*dt;
    if(f.z<0){ f.z=0; f.vz=0; }
    f.rot+=f.vr*dt;
  }
  if(PK.jump && !PK.jump.flop){
    PK.jump.ft+=dt;
    if(PK.jump.ft>0.055){ PK.jump.ft=0; pkFeather(PK.x,PK.y,PK.z*0.6+8); }
  }
}
function pkLeap(){
  if(!PK.active||PK.shop||PK.wdrop||PK.jump) return;
  if(!PK.wings){ beep(150,.07); toast("NO WINGS \u2014 THE PARK SHOP HAS THEM"); return; }
  if(PK.jcd>0){ beep(150,.06); PK.fx.push({x:PK.x,y:PK.y-28,txt:"WINGS COLD "+PK.jcd.toFixed(1)+"s",life:0.8}); return; }
  if(PK.wst<WING.cost) return pkFlop();
  PK.wst-=WING.cost;
  let dx=0,dy=0;
  const jl=PK.joy?Math.hypot(PK.joy.dx,PK.joy.dy):0;
  if(jl>0.18){ dx=PK.joy.dx/jl; dy=PK.joy.dy/jl; }
  else { const m=Math.hypot(PK.vx,PK.vy); if(m>20){ dx=PK.vx/m; dy=PK.vy/m; } }   // no stick = straight up
  PK.jump={ph:"rise",t:0,dx,dy,sp:(dx||dy)?PK.spd*WING.push:0,z0:0,ft:0};
  PK.held=true; PK.inv=Math.max(PK.inv,0.25);
  pkRing(PK.x,PK.y,54,0.30,"#fff");
  for(let i=0;i<10;i++) pkFeather(PK.x,PK.y,10);
  beep(430,.06); setTimeout(()=>beep(720,.07),60); setTimeout(()=>beep(980,.09),130);
}
function pkFlop(){                                   // empty tank: a sad little hop and a limp
  PK.jump={ph:"rise",t:0,dx:0,dy:0,sp:0,z0:0,ft:0,flop:true};
  PK.held=false; PK.jcd=Math.max(PK.jcd,2.2); PK.slowT=1.6;
  PK.fx.push({x:PK.x,y:PK.y-28,txt:"NO STAMINA",life:0.9});
  beep(200,.09,"sawtooth",.05); setTimeout(()=>beep(120,.16,"sawtooth",.05),110);
}
function pkFlyTick(dt,mx,my){
  const J=PK.jump;
  J.t+=dt;
  const AP = J.flop?22:WING.apex;
  if(Math.hypot(mx,my)>0.15){ J.dx=J.dx*0.9+mx*0.1; J.dy=J.dy*0.9+my*0.1; }   // half authority mid-air
  if(J.ph==="rise"){
    const k=clamp(J.t/(J.flop?0.16:WING.rise),0,1);
    PK.z=AP*(1-(1-k)*(1-k));                                                   // ease-out: punchy off the floor
    if(k>=1){ J.ph="hover"; J.t=0; }
  } else if(J.ph==="hover"){
    PK.z=AP+Math.sin(J.t*3.4)*(J.flop?1:5);                                    // wing-beat bob
    const cap=J.flop?0.08:WING.hover, minH=J.flop?0.08:WING.minHover;
    if(J.t>cap || (!PK.held && J.t>minH)){ J.ph="dive"; J.t=0; J.z0=PK.z; }
  } else {
    const k=clamp(J.t/(J.flop?0.18:WING.dive),0,1);
    PK.z=J.z0*(1-k*k);                                                         // ease-in: he drops like a verdict
    if(k>=1){ pkLand(); return; }
    J.sp*=0.85;
  }
  J.sp=Math.max(J.flop?0:PK.spd*0.55, J.sp*Math.exp(-dt*0.85));
  const l=Math.hypot(J.dx,J.dy)||1;
  PK.vx=J.dx/l*J.sp; PK.vy=J.dy/l*J.sp;
}
function pkLand(){
  const J=PK.jump;
  PK.jump=null; PK.z=0; PK.held=false;
  if(J.flop){ PK.vx*=0.2; PK.vy*=0.2; beep(150,.1,"sawtooth"); pkRing(PK.x,PK.y,20,0.25,"#fff"); return; }
  PK.jcd=WING.cd; PK.shake=1; PK.pulse=0.35; PK.noBlink=0.5;
  pkRing(PK.x,PK.y,PK.stompR*0.85,0.16,"#fff",true);      // the impact flash
  pkRing(PK.x,PK.y,PK.stompR*1.20,0.50,"#fff");
  pkRing(PK.x,PK.y,PK.stompR*0.95,0.38,"#e8c14a");
  pkRing(PK.x,PK.y,PK.stompR*0.55,0.26,"#fff");
  for(let i=0;i<26;i++) pkFeather(PK.x,PK.y,30);
  let kills=0;
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    const dxw=wd(e.x-PK.x,PK.WW), dyw=wd(e.y-PK.y,PK.WH);
    const d=Math.hypot(dxw,dyw)||1;
    if(d<PK.stompR){
      const near=1-clamp(d/PK.stompR,0,1);
      e.hp-=Math.max(1,Math.round(PK.stompD*(0.55+0.45*near)));
      if(e.hp<=0){
        PK.drops.push({x:e.x,y:e.y,v:e.alpha?10:e.t==="cat"?3:e.t==="bird"?2:1,gold:!!e.alpha,life:25});
        kills++; PK.en.splice(i,1);
      } else { e.kx=dxw/d*PK.stompK*(0.5+0.5*near); e.ky=dyw/d*PK.stompK*(0.5+0.5*near); }
    }
  }
  for(let i=PK.drops.length-1;i>=0;i--){                  // the shockwave sweeps loose bones in
    const dr=PK.drops[i];
    if(Math.hypot(wd(dr.x-PK.x,PK.WW),wd(dr.y-PK.y,PK.WH))<PK.stompR*0.55){ pkGain(dr.v,dr.x,dr.y); PK.drops.splice(i,1); }
  }
  if(kills>0) PK.fx.push({x:PK.x,y:PK.y-32,txt:"STOMP x"+kills,life:1.1});
  PK.inv=Math.max(PK.inv,0.35);
  beep(90,.22,"sawtooth",.07); setTimeout(()=>beep(180,.1,"square",.05),40);
  if(kills>0) setTimeout(()=>beep(520,.07),110);
}
function pkWingsBuy(){
  PK.wdrop={t:0}; PK.jcd=0; PK.wst=0; PK.joy=null;
  beep(880,.12); setTimeout(()=>beep(1170,.12),160);
  setTimeout(()=>beep(1560,.20),340); setTimeout(()=>beep(1976,.30),700);
}
function startPark(){
  Object.assign(PK,{
    active:true,t:0,wave:1,waveT:0,spawnT:1,
    maxhp:Math.round(50+50*S.mood/100),
    spd:95*(0.75+0.5*S.energy/100)*(S.senior?0.85:1),
    barkMax:Math.max(1.2,3-0.06*S.lvl), barkCd:1, pulse:0,
    barkR:60*(0.8+0.4*S.hunger/100), knock:150,
    xp:0, chain:0, chainT:0, inv:0, fx:[],
    x:0,y:0,vx:0,vy:0, joy:null,
    en:[], fr:[], gate:{}, started:false, shop:null, biscuits:[], drops:[],
    // wings
    wings:!!S.devWings, z:0, jump:null, jcd:0, slowT:0, held:false, tapT:-9,
    wst:100, wstMax:100, wregen:9, stompR:78, stompD:3, stompK:420, noBlink:0,
    fth:[], rings:[], shake:0, wdrop:null
  });
  PK.hp=PK.maxhp;
  PK.acts=[{k:"hoop",x:.15,y:.125,cd:0},{k:"tunnel",x:.35,y:.36,cd:0},{k:"ramp",x:.11,y:.39,cd:0},{k:"tunnel",x:.62,y:.70,cd:0},{k:"hoop",x:.85,y:.20,cd:0}];
  S.outTimer=0;
  tickTodo("d_park");
  hidePortrait(); closeStatus();
  showScreen("park");
  $("#camstate").textContent="DOGPARK";
  toast("SURVIVE. BANK XP AT THE RED GATE.");
  beep(660,.08); setTimeout(()=>beep(880,.08),120);
}
function pkGain(n,x,y){
  PK.chain = PK.chainT>0 ? Math.min(6,PK.chain+1) : 1;
  PK.chainT=3;
  const g=n+(PK.chain-1);
  PK.xp+=g;
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
        // they drop a bone where they die — BONES must go collect it
        PK.drops.push({x:e.x, y:e.y, v:e.alpha?10:e.t==="cat"?3:e.t==="bird"?2:1, gold:!!e.alpha, life:25});
        hits++;
        PK.en.splice(i,1);
      }
      else { e.kx=dxw/d*PK.knock; e.ky=dyw/d*PK.knock; }
    }
  }
  if(hits>0) beep(300,.05);
}
function pkShopOpen(){
  const pool=[
    {n:"BIGGER BARK",c:12,f:()=>PK.barkR+=14},
    {n:"FASTER BARK",c:14,f:()=>PK.barkMax=Math.max(0.8,PK.barkMax-0.35)},
    {n:"MIGHTY KNOCKBACK",c:10,f:()=>PK.knock+=70},
    {n:"SNACK \u2014 HEAL 30",c:8,f:()=>PK.hp=Math.min(PK.maxhp,PK.hp+30)},
    {n:"ZOOMIES +10% SPEED",c:12,f:()=>PK.spd*=1.1},
    {n:"TOUGH COAT +15 HP",c:15,f:()=>{PK.maxhp+=15;PK.hp+=15;}}
  ];
  if(PK.wings) pool.push(
    {n:"DEEP LUNGS \u2014 WING CAP",c:16,f:()=>{PK.wstMax+=45;PK.wst=PK.wstMax;}},
    {n:"FAST FEATHERS \u2014 REGEN",c:14,f:()=>PK.wregen+=5},
    {n:"HEAVIER STOMP",c:18,f:()=>{PK.stompD+=2;PK.stompK+=140;}},
    {n:"WIDER STOMP",c:15,f:()=>PK.stompR+=22}
  );
  PK.shop=pool.sort(()=>Math.random()-0.5).slice(0,3);
  if(!PK.wings) PK.shop.unshift({n:"\u2726 ANGEL WINGS",c:500,gold:true,f:pkWingsBuy});
  PK.joy=null;
}
function parkUpdate(dt){
  if(!PK.active) return;
  if(PK.shop) return;   // world pauses while shopping
  if(PK.wdrop){        // ...and while the heavens are busy
    PK.wdrop.t+=dt;
    if(PK.wdrop.t>=2.9){
      PK.wdrop=null; PK.wings=true; PK.wst=PK.wstMax; PK.jcd=0;
      toast("\u2726 WINGS OF THE GOOD BOY \u2014 DOUBLE-TAP TO LEAP");
    }
    return;
  }
  PK.t+=dt; PK.waveT+=dt;
  PK.chainT=Math.max(0,PK.chainT-dt); if(PK.chainT<=0) PK.chain=0;
  PK.inv=Math.max(0,PK.inv-dt); PK.pulse=Math.max(0,PK.pulse-dt);
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight;
  if(!PK.started){
    PK.started=true;
    PK.WW=w*2; PK.WH=h*2;
    PK.gate={x:PK.WW*0.72, y:PK.WH*0.5};
    PK.x=PK.WW*0.25; PK.y=PK.WH*0.5;
    pkBuildBG(PK.WW,PK.WH);
  }
  const WW=PK.WW, WH=PK.WH;
  PK.slowT=Math.max(0,PK.slowT-dt);
  PK.jcd=Math.max(0,PK.jcd-dt);
  PK.shake=Math.max(0,PK.shake-dt*3.4);
  PK.noBlink=Math.max(0,PK.noBlink-dt);
  if(PK.wings && !PK.jump) PK.wst=Math.min(PK.wstMax, PK.wst+PK.wregen*dt);
  pkParticles(dt);
  if(PK.waveT>20){
    PK.waveT=0; PK.wave++;
    if(PK.wave>=3) tickTodo("j_wave3");
    PK.barkMax=Math.max(1,PK.barkMax-0.12); PK.barkR+=5;
    const WNAME={2:"SQUIRREL AMBUSH",3:"BIRD DIVES",4:"THE PACK",5:"\u2620 THE ALPHA"};
    toast("WAVE "+PK.wave+(WNAME[PK.wave]?" \u2014 "+WNAME[PK.wave]:""));
    beep(500,.08);
    if(PK.wave===5) pkSpawnAlpha();
    pkShopOpen();
  }
  PK.spawnT-=dt;
  if(PK.spawnT<=0){
    const wv=PK.wave;
    if(wv===1){ PK.spawnT=1.8; pkSpawnType("cat"); }                                     // STRAYS: slow, tanky, teaches the bark
    else if(wv===2){ PK.spawnT=2.4; const a2=Math.random()*6.283;                        // SQUIRREL AMBUSH: bursts from one bearing
      for(let i=0;i<3;i++) pkSpawnType("sq", a2+(Math.random()-0.5)*0.5); }
    else if(wv===3){ PK.spawnT=0.9;                                                      // BIRD DIVES: mostly ahead of your movement
      const mv=Math.atan2(PK.vy,PK.vx);
      pkSpawnType(Math.random()<0.75?"bird":"sq",
        (Math.random()<0.6 && (Math.abs(PK.vx)+Math.abs(PK.vy))>10) ? mv+(Math.random()-0.5)*0.8 : undefined); }
    else if(wv===4){ PK.spawnT=0.55; pkSpawn(w,h); }                                     // THE PACK: pure density
    else if(wv===5){ PK.spawnT=1.6; pkSpawnType("sq"); }                                 // THE ALPHA: boss + light trickle
    else { PK.spawnT=Math.max(0.35,1.4-wv*0.09); pkSpawn(w,h); }
  }
  let mx=0,my=0;
  if(PK.joy){ mx=PK.joy.dx; my=PK.joy.dy; }
  const gspd=PK.spd*(PK.slowT>0?0.45:1);            // a failed deployment costs him his legs for a moment
  if(PK.jump) pkFlyTick(dt,mx,my);
  else if(Math.hypot(mx,my)>0.1){ const l=Math.hypot(mx,my); PK.vx=mx/l*gspd; PK.vy=my/l*gspd; }
  else { PK.vx*=0.8; PK.vy*=0.8; }
  PK.x=(PK.x+PK.vx*dt+WW)%WW;
  PK.y=(PK.y+PK.vy*dt+WH)%WH;
  PK.barkCd-=dt;
  if(PK.barkCd<=0 && PK.z<WING.clearZ && PK.en.some(e=>Math.hypot(wd(e.x-PK.x,WW),wd(e.y-PK.y,WH))<PK.barkR)) pkBark();
  for(let i=PK.en.length-1;i>=0;i--){
    const e=PK.en[i];
    e.kx*=0.88; e.ky*=0.88;
    const dxw=wd(PK.x-e.x,WW), dyw=wd(PK.y-e.y,WH);
    const d=Math.hypot(dxw,dyw)||1;
    let sx=dxw/d*e.sp, sy=dyw/d*e.sp;
    if(e.t==="bird"){ e.ph+=dt*6; sy+=Math.sin(e.ph)*40; }
    e.dir = sx<0 ? -1 : 1;
    e.ft+=dt; if(e.ft>0.12){ e.ft=0; e.fi++; }
    e.x=(e.x+(sx+e.kx)*dt+WW)%WW;
    e.y=(e.y+(sy+e.ky)*dt+WH)%WH;
    if(d<14 && PK.inv<=0 && PK.z<WING.clearZ){
      PK.hp-=(e.alpha?14:8); PK.inv=0.6;
      e.kx=-dxw/d*220; e.ky=-dyw/d*220;
      beep(110,.12,"sawtooth");
      if(PK.hp<=0) return pkDeath();
    }
  }
  for(let i=PK.fr.length-1;i>=0;i--){
    const f=PK.fr[i];
    f.x=(f.x+f.vx*dt+WW)%WW; f.life-=dt;
    if(PK.z<WING.clearZ && Math.hypot(wd(f.x-PK.x,WW),wd(f.y-PK.y,WH))<20){
      PK.hp=Math.min(PK.maxhp,PK.hp+15);
      pkGain(9,f.x,f.y);
      S.mood=clamp(S.mood+2,0,100);
      beep(760,.08);
      PK.fr.splice(i,1); continue;
    }
    if(f.life<=0) PK.fr.splice(i,1);
  }
  for(const a of PK.acts){
    a.cd=Math.max(0,a.cd-dt);
    if(a.cd<=0 && PK.z<WING.clearZ && Math.hypot(wd(a.x*WW-PK.x,WW),wd(a.y*WH-PK.y,WH))<22){
      a.cd=3; pkGain(3+Math.floor(Math.random()*3), a.x*WW, a.y*WH); beep(700,.06);
    }
  }
  if(PARKGHOST && PK.z<WING.clearZ && Math.hypot(wd(PARKGHOST.x-PK.x,WW),wd(PARKGHOST.y-PK.y,WH))<18){
    PK.xp+=PARKGHOST.xp;
    PK.fx.push({x:PK.x,y:PK.y-22,txt:"+"+PARKGHOST.xp+" RECOVERED",life:1.4});
    PARKGHOST=null;
    for(let i=0;i<14;i++) pkSpawn(w,h);   // they smelled it
    toast("XP RECOVERED \u2014 BUT THEY SMELLED IT.",1);
    beep(140,.3,"sawtooth");
  }
  for(let i=PK.fx.length-1;i>=0;i--){ PK.fx[i].life-=dt; if(PK.fx[i].life<=0) PK.fx.splice(i,1); }
  for(let i=PK.drops.length-1;i>=0;i--){
    const dr=PK.drops[i];
    dr.life-=dt;
    if(dr.life<=0){ PK.drops.splice(i,1); continue; }
    if(PK.z<WING.clearZ && Math.hypot(wd(dr.x-PK.x,WW),wd(dr.y-PK.y,WH))<16){
      pkGain(dr.v, dr.x, dr.y);            // chain ticks per pickup — route efficiency pays
      beep(dr.gold?900:640,.06);
      PK.drops.splice(i,1);
    }
  }
  if(PK.z<WING.clearZ && Math.hypot(wd(PK.gate.x-PK.x,WW),wd(PK.gate.y-PK.y,WH))<26) return pkBank();
}
function pkExitCosts(){
  S.energy=clamp(S.energy-12,0,100); S.clean=clamp(S.clean-8,0,100);
}
function pkDeath(){
  PK.active=false;
  const lost=Math.round(PK.xp*0.9), kept=PK.xp-lost;
  if(lost>0) PARKGHOST={x:PK.x,y:PK.y,xp:lost + (PARKGHOST?PARKGHOST.xp:0)};
  if(kept>0) addXP(Math.max(1,Math.round(kept*BANK_RATE)));
  pkExitCosts(); S.fun=clamp(S.fun+10,0,100);
  const keptXP=Math.max(0,Math.round(kept*BANK_RATE));
  $("#resTitle").textContent="OVERRUN AT THE PARK"; $("#resTitle").style.color="#f22";
  $("#resPortrait").src=PORTRAITS.sad; $("#resPortrait").classList.add("show");
  $("#resScore").textContent=kept+" BONES";
  $("#resLines").innerHTML="90% OF HIS BONES ("+lost+") LIE WHERE HE FELL.<br>NEXT VISIT: GO CLAIM THEM \u2014 IF YOU DARE.";
  $("#result").classList.add("show");
  beep(140,.3,"sawtooth");
  setTimeout(()=>pkReveal(kept,keptXP),400);
}
function pkBank(){
  PK.active=false;
  const g=PK.xp;
  addXP(Math.max(1,Math.round(g*BANK_RATE))); LVLFX=1.2;
  pkExitCosts(); S.fun=clamp(S.fun+20,0,100); S.mood=clamp(S.mood+8,0,100);
  const bankedXP=Math.max(1,Math.round(g*BANK_RATE));
  $("#resTitle").textContent="XP BANKED"; $("#resTitle").style.color="#fff";
  $("#resPortrait").src = bankedXP>=8 ? PORTRAITS.happy : PORTRAITS.content;
  $("#resPortrait").classList.add("show");
  $("#resScore").textContent=g+" BONES";
  $("#resLines").innerHTML="WAVE "+PK.wave+" REACHED.<br>A GOOD DAY AT THE PARK.";
  $("#result").classList.add("show");
  beep(660,.1); setTimeout(()=>beep(880,.1),100); setTimeout(()=>beep(1170,.14),200);
  setTimeout(()=>pkReveal(g,bankedXP),500);
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
function drawEnemy(ctx,e,sx,sy){
  ctx.fillStyle="rgba(0,0,0,.25)";
  ctx.beginPath(); ctx.ellipse(sx, sy+2, 9, 3, 0, 0, 7); ctx.fill();
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
  const shk=PK.shake*PK.shake;
  ctx.save();
  if(shk>0.001) ctx.translate((Math.random()-0.5)*11*shk,(Math.random()-0.5)*11*shk);
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
      ctx.strokeRect(gx-14,gy2-26,28,52); ctx.globalAlpha=1;
      ctx.fillStyle="#f22"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
      ctx.fillText("BANK",gx,gy2-32); ctx.fillText("XP",gx,gy2+42); ctx.textAlign="left";
    } else {
      const ang=Math.atan2(gy2-DY,gx-DX);
      const ex=DX+Math.cos(ang)*(Math.min(w,h)/2-26), ey=DY+Math.sin(ang)*(Math.min(w,h)/2-26);
      ctx.save(); ctx.translate(ex,ey); ctx.rotate(ang);
      ctx.fillStyle="#f22"; ctx.globalAlpha=pul;
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-8,-8); ctx.lineTo(-8,8); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha=1;
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
    const img=FRIENDIMG[Math.floor(t*8)%FRIENDIMG.length];
    if(img.complete&&img.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false;
      const fh2=26, fw2=fh2*img.naturalWidth/img.naturalHeight;
      if(f.vx<0){ ctx.translate(fx2*2,0); ctx.scale(-1,1); }
      ctx.drawImage(img,fx2-fw2/2,fy2-fh2/2,fw2,fh2); ctx.restore(); }
    if(Math.floor(t*3)%2){ ctx.fillStyle="#f6a"; ctx.fillRect(fx2-2,fy2-22,4,4); }
  }
  for(const e of PK.en){
    const [ex2,ey2]=SC(e.x,e.y);
    if(ex2<-40||ex2>w+40||ey2<-40||ey2>h+40) continue;
    drawEnemy(ctx,e,ex2,ey2);
  }
  for(const r of PK.rings){
    const [rx,ry]=SC(r.x,r.y);
    const k=1-r.life/r.max;
    ctx.globalAlpha=(1-k)*(r.fill?0.55:0.85);
    ctx.beginPath(); ctx.ellipse(rx,ry+6,r.r*k,r.r*k*0.42,0,0,7);
    if(r.fill){ ctx.fillStyle=r.col; ctx.fill(); }
    else { ctx.strokeStyle=r.col; ctx.lineWidth=Math.max(1,6*(1-k)); ctx.stroke(); }
  }
  ctx.globalAlpha=1; ctx.lineWidth=2;
  for(const f of PK.fth){
    const [fx3,fy3]=SC(f.x,f.y);
    if(fx3<-20||fx3>w+20||fy3<-20||fy3>h+20) continue;
    ctx.save(); ctx.translate(fx3,fy3-f.z); ctx.rotate(f.rot);
    ctx.globalAlpha=clamp(f.life,0,1)*0.9; ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.ellipse(0,0,3.4,1.4,0,0,7); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha=1;
  const frac2=1-clamp(PK.barkCd/PK.barkMax,0,1);
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.globalAlpha=0.35;
  ctx.beginPath(); ctx.arc(DX,DY,Math.max(6,PK.barkR*frac2),0,7); ctx.stroke();
  ctx.globalAlpha=1;
  if(PK.pulse>0){
    ctx.lineWidth=4; ctx.globalAlpha=PK.pulse/0.35;
    ctx.beginPath(); ctx.arc(DX,DY,PK.barkR*(1.35-(PK.pulse/0.35)*0.35),0,7); ctx.stroke();
    ctx.globalAlpha=1; ctx.lineWidth=2;
  }
  {
    const z=PK.z||0, hk=clamp(z/WING.apex,0,1), dy=DY-z;
    // a shaft of the good light finds him, and only him
    if(hk>0.02){
      ctx.save(); ctx.globalCompositeOperation="lighter";
      const g1=ctx.createLinearGradient(0,-20,0,dy+16);
      g1.addColorStop(0,"rgba(255,214,110,0)");
      g1.addColorStop(0.55,"rgba(255,206,96,"+(0.15*hk).toFixed(3)+")");
      g1.addColorStop(1,"rgba(255,238,176,"+(0.38*hk).toFixed(3)+")");
      ctx.fillStyle=g1;
      ctx.beginPath();
      ctx.moveTo(DX-46-26*hk,-20); ctx.lineTo(DX+46+26*hk,-20);
      ctx.lineTo(DX+20,dy+14); ctx.lineTo(DX-20,dy+14); ctx.closePath(); ctx.fill();
      const g2=ctx.createRadialGradient(DX,dy-2,2,DX,dy-2,56);
      g2.addColorStop(0,"rgba(255,242,196,"+(0.40*hk).toFixed(3)+")");
      g2.addColorStop(1,"rgba(255,214,110,0)");
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(DX,dy-2,56,0,7); ctx.fill();
      ctx.restore();
    }
    // the shadow is the altimeter: it shrinks and pales as he climbs
    const ss=1-hk*0.5;
    ctx.fillStyle="rgba(0,0,0,"+(0.30-0.10*hk).toFixed(3)+")";
    ctx.beginPath(); ctx.ellipse(DX,DY+15,15*ss,4.5*ss,0,0,7); ctx.fill();
    if(hk>0.05){
      ctx.strokeStyle="rgba(0,0,0,"+(0.10+0.14*(1-hk)).toFixed(3)+")"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(DX,DY+15,15*ss+4,4.5*ss+1.8,0,0,7); ctx.stroke();
      ctx.strokeStyle="rgba(255,255,255,"+(0.20*hk).toFixed(3)+")";       // tether: shadow to paw
      ctx.setLineDash([3,5]);
      ctx.beginPath(); ctx.moveTo(DX,DY+13); ctx.lineTo(DX,dy+14); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth=2;
    }
    // speed streaks while the pounce is still hot
    if(PK.jump && !PK.jump.flop && PK.jump.sp>PK.spd*1.15){
      const a=Math.atan2(PK.vy,PK.vx);
      ctx.strokeStyle="#fff"; ctx.globalAlpha=0.3;
      for(let i=0;i<5;i++){
        const o=(i-2)*5, L=12+Math.random()*16;
        ctx.beginPath();
        ctx.moveTo(DX-Math.cos(a)*12+Math.sin(a)*o, dy-Math.sin(a)*12-Math.cos(a)*o);
        ctx.lineTo(DX-Math.cos(a)*(12+L)+Math.sin(a)*o, dy-Math.sin(a)*(12+L)-Math.cos(a)*o);
        ctx.stroke();
      }
      ctx.globalAlpha=1;
    }
    const sc=1+hk*0.30;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(PK.vx<0){ ctx.translate(DX*2,0); ctx.scale(-1,1); }
    if(PK.wings){
      const wimg=WINGIMG[pkWingFrame(t)];
      if(wimg.complete&&wimg.naturalWidth){
        const wh=(46+12*hk)*sc, ww=wh*WING.aspect;
        const oy=7-11*(1-hk);            // folded, they have to ride high enough to clear his back
        ctx.globalAlpha=PK.jump?1:0.92;
        ctx.drawImage(wimg, DX-ww/2, dy+oy-wh*WING.anchorY, ww, wh);
        ctx.globalAlpha=1;
      }
    }
    const spd=Math.abs(PK.vx)+Math.abs(PK.vy);
    const img=RUNIMG[Math.floor(spd>20?t*10:t*3)%RUNIMG.length];
    if(img.complete && !(PK.inv>0 && !PK.jump && PK.noBlink<=0 && Math.floor(t*12)%2)){
      ctx.drawImage(img,DX-20*sc,dy-16*sc,40*sc,34*sc);
    }
    ctx.restore();
  }
  for(const dr of PK.drops){
    const [dx2,dy2]=SC(dr.x,dr.y);
    if(dx2<-20||dx2>w+20||dy2<-20||dy2>h+20) continue;
    if(dr.life<5 && Math.floor(dr.life*6)%2) continue;   // blink out
    const c=dr.gold?"#e8c14a":"#fff", s=dr.gold?1.5:1;
    ctx.fillStyle=c;
    ctx.fillRect(dx2-5*s, dy2-1.5*s, 10*s, 3*s);
    ctx.beginPath();
    ctx.arc(dx2-5*s,dy2-2*s,2.2*s,0,7); ctx.arc(dx2-5*s,dy2+2*s,2.2*s,0,7);
    ctx.arc(dx2+5*s,dy2-2*s,2.2*s,0,7); ctx.arc(dx2+5*s,dy2+2*s,2.2*s,0,7);
    ctx.fill();
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
  ctx.restore();
  if(PK.wdrop){
    const k=clamp(PK.wdrop.t/2.9,0,1), ez=1-Math.pow(1-k,2.2);
    const y0=-150, y1=DY-34, wy=y0+(y1-y0)*ez;
    ctx.save(); ctx.globalCompositeOperation="lighter";
    const g3=ctx.createLinearGradient(0,-40,0,DY+30);
    g3.addColorStop(0,"rgba(255,226,148,0)");
    g3.addColorStop(0.5,"rgba(255,214,110,0.22)");
    g3.addColorStop(1,"rgba(255,246,206,0.40)");
    ctx.fillStyle=g3;
    ctx.beginPath(); ctx.moveTo(DX-124,-40); ctx.lineTo(DX+124,-40);
    ctx.lineTo(DX+28,DY+22); ctx.lineTo(DX-28,DY+22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(255,236,180,0.30)"; ctx.lineWidth=2;
    for(let i=0;i<10;i++){
      const a=(i/10)*6.283+t*0.55, L=30+18*Math.sin(t*3+i);
      ctx.beginPath();
      ctx.moveTo(DX+Math.cos(a)*22,wy+Math.sin(a)*22);
      ctx.lineTo(DX+Math.cos(a)*(22+L),wy+Math.sin(a)*(22+L)); ctx.stroke();
    }
    ctx.restore();
    const wimg=WINGIMG[6];
    if(wimg.complete&&wimg.naturalWidth){
      const wh=58+8*Math.sin(t*3), ww=wh*WING.aspect;
      ctx.save(); ctx.imageSmoothingEnabled=false;
      ctx.drawImage(wimg, DX-ww/2, wy-wh*WING.anchorY, ww, wh);
      ctx.restore();
    }
    ctx.fillStyle="#e8c14a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("WINGS OF THE GOOD BOY", DX, h-22); ctx.textAlign="left";
    if(k>0.93){ ctx.fillStyle="rgba(255,255,255,"+((k-0.93)/0.07).toFixed(3)+")"; ctx.fillRect(0,0,w,h); }
  }
  ctx.fillStyle="rgba(0,0,0,.38)"; ctx.fillRect(0,0,w,PK.wings?54:44);
  ctx.fillStyle="#fff";
  ctx.textAlign="right"; ctx.fillText("WAVE "+PK.wave,w-10,34); ctx.textAlign="left";
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(10,26,90,8);
  ctx.fillStyle=PK.hp<PK.maxhp*0.3?"#f22":"#fff";
  ctx.fillRect(12,28,86*clamp(PK.hp/PK.maxhp,0,1),4);
  if(PK.wings){
    ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2; ctx.strokeRect(10,38,90,7);
    ctx.fillStyle = PK.jcd>0 ? "#6b5a20" : (PK.wst<WING.cost ? "#9a7a20" : "#e8c14a");
    ctx.fillRect(12,40,86*clamp(PK.wst/PK.wstMax,0,1),3);
    ctx.font="6px 'Press Start 2P',monospace"; ctx.fillStyle="#e8c14a";
    ctx.fillText(PK.jcd>0?PK.jcd.toFixed(1)+"s":"WINGS",106,45);
    ctx.font="8px 'Press Start 2P',monospace";
  }
  pkPadDraw(t);
}
function pkFlee(){
  pkDeath();
  $("#resTitle").textContent="FLED THE PARK";
  $("#resLines").innerHTML=DN("BONES BOLTED FOR HOME.<br>90% OF HIS BONES LEFT BEHIND \u2014 CLAIM THEM NEXT VISIT.");
}
function pkPadDraw(t){
  const [ctx,w,h]=fit($("#parkcv"));
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(6,6,w-12,h-12);
  if(!PK.shop && !PK.joy){
    ctx.fillStyle="#444"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(DN("DRAG ANYWHERE TO MOVE BONES"), w/2, h/2);
  }
  ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText("\u25C6 "+PK.xp+" BONES", 14, 29);
  ctx.strokeStyle="#f22"; ctx.lineWidth=2; ctx.strokeRect(w-96,12,84,26);
  ctx.fillStyle="#f22"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText("FLEE -90%XP", w-54, 29);
  if(PK.joy){
    ctx.strokeStyle="#fff"; ctx.globalAlpha=0.5; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(PK.joy.ox,PK.joy.oy,26,0,7); ctx.stroke();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(PK.joy.ox+PK.joy.dx*22,PK.joy.oy+PK.joy.dy*22,9,0,7); ctx.fill();
    ctx.globalAlpha=1;
  }
  if(PK.wings && !PK.shop){
    const bw=Math.min(180,w*0.5), bx=w/2-bw/2, by=h-24;
    ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,10);
    ctx.fillStyle="#e8c14a"; ctx.globalAlpha=PK.jcd>0?0.35:1;
    ctx.fillRect(bx+2,by+2,(bw-4)*clamp(PK.wst/PK.wstMax,0,1),6);
    ctx.globalAlpha=1;
    ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center"; ctx.fillStyle="#e8c14a";
    ctx.fillText(PK.jcd>0 ? "WINGS "+PK.jcd.toFixed(1)+"s"
               : PK.wst>=WING.cost ? DN("DOUBLE-TAP TO LEAP") : "WINGS TIRED", w/2, by-6);
    ctx.textAlign="left";
  }
  if(PK.shop){
    ctx.strokeStyle="#fff"; ctx.lineWidth=3; ctx.strokeRect(w*0.08,h*0.08,w*0.84,h*0.82);
    ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("PARK SHOP \u2014 SPEND RUN XP", w/2, h*0.20);
    ctx.font="8px 'Press Start 2P',monospace";
    PK.shop.forEach((o,i)=>{
      const y=h*(0.36+i*0.12);
      ctx.fillStyle = o.gold ? (PK.xp>=o.c?"#e8c14a":"#7a5f18") : (PK.xp>=o.c?"#fff":"#f22");
      ctx.fillText(o.n+"  ["+o.c+" "+(o.gold?"BONES":"XP")+"]", w/2, y);
    });
    ctx.fillStyle="#888"; ctx.fillText("TAP HERE TO SKIP", w/2, h*(0.36+PK.shop.length*0.12));
  }
  ctx.textAlign="left";
}
(function(){
  const cv=document.querySelector("#parkcv");
  cv.addEventListener("pointerdown",e=>{
    if(!PK.active) return;
    const r=cv.getBoundingClientRect();
    const px=e.clientX-r.left, py=e.clientY-r.top;
    if(!PK.shop && px>r.width-96 && py<44){ pkFlee(); return; }
    if(PK.shop){
      const yF=(e.clientY-r.top)/r.height;
      for(let i=0;i<PK.shop.length;i++){
        if(Math.abs(yF-(0.36+i*0.12))<0.05){
          const o=PK.shop[i];
          if(PK.xp>=o.c){ PK.xp-=o.c; o.f(); beep(760,.07); toast(o.n+" \u2014 BOUGHT"); PK.shop=null; }
          else beep(150,.1);
          return;
        }
      }
      if(Math.abs(yF-(0.36+PK.shop.length*0.12))<0.055){ PK.shop=null; beep(400,.05); }
      return;
    }
    // double-tap anywhere on the pad: deploy
    const nowS=performance.now()/1000;
    if(nowS-PK.tapT<0.32){ PK.tapT=-9; pkLeap(); }
    else PK.tapT=nowS;
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
  const up=()=>{ PK.joy=null; PK.held=false; };   // letting go folds the wings
  cv.addEventListener("pointerup",up); cv.addEventListener("pointercancel",up);
})();
