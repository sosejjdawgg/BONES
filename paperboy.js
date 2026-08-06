/* ===== PAPERBOY ROUTE — van delivery work minigame ===== */
// The primary money-earning job. An isometric delivery route: the van drives down the road
// while houses sit back from it, each joined to the road by its own long thin path. Parcels
// are thrown left or right in strict door-number order — a quick tap for a normal throw, or
// a held 3-second charge for an all-or-nothing power throw. Accuracy is a pure timing skill:
// the path IS the aiming guide, and it's drawn exactly as wide as the doormat tolerance, so
// "throw while the van is over the path" is literally the rule for a perfect delivery.
const PB_ROUTE_LEN=12, PB_HOUSE_GAP=250;
// the street has far more addressed houses than parcels today — PB_STREET_LEN houses total,
// laid out UK-style (odd numbers up one side, even up the other, each side incrementing by 2),
// with only PB_ROUTE_LEN of them actually due a delivery.
const PB_STREET_LEN=PB_ROUTE_LEN*3;
const PB_SPEED0=95, PB_SPEED_MAX=155, PB_SPEED_RAMP=0.7;
const PB_TOL={doormat:11, house:27, window:50};
const PB_CHARGE_TIME=3.0, PB_TAP_MAX=0.22, PB_SWIPE_MIN=26;
const PB_HOUSE_VALUE=5, PB_PERFECT_BONUS=2, PB_DESTRUCTION_PENALTY=3, PB_MISS_PENALTY=1;
// SKILLSHOT: a fully-charged throw that lands the doormat. Pays a bonus on top of the normal
// perfect bonus and delights the customer, who often comes out and tips on top of that.
const PB_SKILLSHOT_BONUS=3, PB_TIP_CHANCE=0.55, PB_TIP_MIN=1, PB_TIP_MAX=4;

// --- isometric world layout (x = along the road, y = lateral offset, z = up) ---
const PB_S=0.42, PB_IX=0.866, PB_IY=0.5;         // projection scale + iso basis
const PB_ROAD_HALF=19;                            // road half-width — kept narrow so it reads as a lane
const PB_PATH_LEN=118;                            // long thin garden path, road edge -> front door
const PB_PATH_W=PB_TOL.doormat*2;                 // path is exactly the doormat window wide
const PB_HOUSE_Y0=PB_ROAD_HALF+PB_PATH_LEN;       // house front edge, set well back from the road
const PB_HOUSE_DEPTH=64, PB_HOUSE_W=94;
const PB_WALL_H=60, PB_ROOF_H=32;

const PB={
  active:false, run:false, tutorial:false,
  dist:0, speed:0, houses:[], decoys:[], nextIdx:0,
  pressing:false, pressSide:null, pressT:0,
  charging:null, fx:[], shake:0,
  camX:0, camY:0, swipe:null,
  stats:{perfect:0, house:0, destruction:0, miss:0, skillshot:0, tips:0}
};

/* ---------- tutorial: two houses, van stops at each, teaches swipe-throw then hold-skillshot ---------- */
const PBTUT_STEP={DRIVE_TO_1:0, TEACH_SWIPE:1, CELEBRATE_1:2, DRIVE_TO_2:3, TEACH_CHARGE:4, CELEBRATE_2:5, COMPLETE:6};
const PBTUT={step:0, stepT:0, arrowPulse:0, waitingInput:false, bannerT:0, houseIdx:0, target:0};

function pbNewRoute(){
  // one continuous, correctly-numbered street: side flips every house in lockstep with doorNum
  // incrementing by 1, so every house on one side always shares the same parity — real UK-style
  // odd-one-side/even-other-side numbering, not two independently-numbered arrays.
  const street=[];
  const doorStart=20+Math.floor(Math.random()*70);
  let side=Math.random()<0.5?"L":"R";
  for(let i=0;i<PB_STREET_LEN;i++){
    street.push({doorNum:doorStart+i, side, worldDist:PB_HOUSE_GAP*(i+1)});
    side = side==="L" ? "R" : "L";
  }
  // not everyone on the street is expecting a parcel today — pick PB_ROUTE_LEN of the street's
  // houses as due, one per even-sized bucket so they're spread out rather than clustered.
  const bucket=PB_STREET_LEN/PB_ROUTE_LEN;
  const dueIdx=new Set();
  for(let b=0;b<PB_ROUTE_LEN;b++) dueIdx.add(b*bucket+Math.floor(Math.random()*bucket));
  const houses=[], decoys=[];
  for(let i=0;i<street.length;i++){
    const st=street[i];
    if(dueIdx.has(i)) houses.push({doorNum:st.doorNum, side:st.side, worldDist:st.worldDist, thrown:false, zone:null, angryT:0, happyT:0, tip:0});
    else decoys.push({doorNum:st.doorNum, side:st.side, worldDist:st.worldDist, zone:null});
  }
  Object.assign(PB,{
    houses, decoys, nextIdx:0, dist:0, speed:PB_SPEED0,
    pressing:false, pressSide:null, pressT:0, charging:null, fx:[], shake:0, swipe:null,
    stats:{perfect:0, house:0, destruction:0, miss:0, skillshot:0, tips:0}
  });
}
function enterPaperboy(){
  if(!S.pbTutorialDone){ enterPaperboyTutorial(); return; }
  hidePortrait(); closeStatus();
  transition("STARTING THE ROUTE",()=>{
    showScreen("paperboy");
    pbNewRoute();
    PB.active=true; PB.run=true;
    toast("SWIPE OR TAP TO THROW AS THE VAN CROSSES THE PATH — HOLD TO CHARGE A SKILLSHOT",1);
    beep(500,.06); setTimeout(()=>beep(700,.07),110);
  });
}
function enterPaperboyTutorial(){
  hidePortrait(); closeStatus();
  transition("DELIVERY TRAINING",()=>{
    showScreen("paperboy");
    pbTutorialStart();
    toast("LET'S LEARN THE ROUTE",1);
    beep(500,.06); setTimeout(()=>beep(700,.07),110);
  });
}
function pbSideY(side){ return side==="L" ? 1 : -1; }   // L = down-left of road, R = up-right
function pbPressStart(side){
  if((!PB.run && !PB.tutorial) || PB.pressing) return;
  if(PB.tutorial && !PBTUT.waitingInput) return;
  PB.pressing=true; PB.pressSide=side; PB.pressT=0;
}
function pbPressEnd(side){
  if(!PB.pressing || PB.pressSide!==side) return;
  PB.pressing=false;
  if(PB.tutorial){ pbTutorialThrow(side,false); return; }
  if(PB.charging){
    PB.charging=null;
    beep(200,.08,"sawtooth");
    toast("SKILLSHOT ABORTED",1);
  } else {
    pbThrow(side,false);
  }
}
// Swipe input decides its direction at the flick, not at the press — so a held charge parks at
// full power and waits for the swipe to tell it which way to launch. A swipe always throws:
// fully charged it's a SKILLSHOT, otherwise it's an ordinary throw.
function pbLaunch(side){
  if(!PB.run && !PB.tutorial) return;
  const power = !!(PB.charging && PB.charging.t>=PB_CHARGE_TIME);
  PB.charging=null; PB.pressing=false; PB.pressSide=null;
  if(PB.tutorial){ pbTutorialThrow(side,power); return; }
  pbThrow(side,power);
}
function pbSpawnParcelFX(house,kind){
  PB.fx.push({t:"parcel", house, ox:PB.dist, p:0, dur:0.34, kind});
}
function pbThrow(side,power){
  const h=PB.houses[PB.nextIdx];
  if(!h) return;
  PB.nextIdx++;
  h.thrown=true;
  let zone;
  if(side!==h.side){
    zone = power ? "destruction" : "miss";
  } else {
    const off=Math.abs(h.worldDist-PB.dist);
    if(power){ zone = off<PB_TOL.doormat ? "doormat" : "destruction"; }
    else if(off<PB_TOL.doormat) zone="doormat";
    else if(off<PB_TOL.house) zone="house";
    else if(off<PB_TOL.window) zone="window";
    else zone="miss";
  }
  h.zone=zone;
  pbApplyResult(h,zone,power);
}
function pbApplyResult(h,zone,power){
  if(zone==="doormat"){
    PB.stats.perfect++;
    pbSpawnParcelFX(h,"doormat");
    if(power){
      // SKILLSHOT — bonus pay, a delighted customer, and often a tip on the doorstep
      PB.stats.skillshot++;
      h.happyT=3.5;
      if(Math.random()<PB_TIP_CHANCE){
        h.tip=PB_TIP_MIN+Math.floor(Math.random()*(PB_TIP_MAX-PB_TIP_MIN+1));
        PB.stats.tips+=h.tip;
        toast("SKILLSHOT! +$"+h.tip+" TIP",1);
      } else toast("SKILLSHOT!",1);
      beep(980,.07); setTimeout(()=>beep(1320,.09),80); setTimeout(()=>beep(1660,.11),160);
    } else { beep(880,.07); setTimeout(()=>beep(1180,.09),80); }
  } else if(zone==="house"){
    PB.stats.house++;
    pbSpawnParcelFX(h,"house");
    beep(600,.06);
  } else if(zone==="window"){
    PB.stats.destruction++;
    pbSpawnParcelFX(h,"window");
    h.angryT=3.5;
    beep(160,.2,"sawtooth");
  } else if(zone==="destruction"){
    PB.stats.destruction++;
    pbSpawnParcelFX(h,power?"power-destruction":"destruction");
    h.angryT=3.5;
    beep(120,.3,"sawtooth",.1);
  } else {
    PB.stats.miss++;
    beep(150,.1);
  }
}
function pbDrawReportIcon(grade){
  const cv=$("#revealcv"), ctx=cv.getContext("2d");
  ctx.clearRect(0,0,130,130);
  ctx.save();
  ctx.translate(65,68); ctx.rotate(-0.12);
  ctx.fillStyle="rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0,30,40,9,0,0,7); ctx.fill();
  ctx.fillStyle="#eee"; ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.fillRect(-34,-24,68,48); ctx.strokeRect(-34,-24,68,48);
  ctx.fillStyle="#f22"; ctx.fillRect(-34,-24,68,11);
  ctx.strokeStyle="#999"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(0,24); ctx.stroke();
  ctx.restore();
  const gCol = (grade==="S"||grade==="A") ? "#e8c14a" : (grade==="F"||grade==="D") ? "#f22" : "#fff";
  ctx.fillStyle=gCol; ctx.font="26px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText(grade, 65, 118);
  ctx.textAlign="left";
}
function pbFinish(){
  PB.run=false; PB.active=false;
  const s=PB.stats, total=PB.houses.length;
  const delivered=s.perfect+s.house;
  const gross=delivered*PB_HOUSE_VALUE + s.perfect*PB_PERFECT_BONUS + s.skillshot*PB_SKILLSHOT_BONUS + s.tips;
  const deduction=s.destruction*PB_DESTRUCTION_PENALTY + s.miss*PB_MISS_PENALTY;
  const net=Math.max(0,gross-deduction);
  S.money+=net; S.earned+=net;
  const score=(s.perfect*2 + s.house - s.destruction*1.5 - s.miss)/total;
  let grade;
  if(s.perfect===total) grade="S";
  else if(score>=1.3) grade="A";
  else if(score>=0.9) grade="B";
  else if(score>=0.5) grade="C";
  else if(score>=0.1) grade="D";
  else grade="F";
  tickTodo("work");
  if(delivered>0) addXP(Math.round(delivered*0.5+s.perfect*0.5));
  $("#resTitle").textContent="ROUTE COMPLETE — GRADE "+grade;
  $("#resTitle").style.color = (grade==="F"||grade==="D") ? "#f22" : "#fff";
  $("#resPortraitWrap").classList.remove("show");
  pbDrawReportIcon(grade);
  $("#resScore").textContent="$"+net;
  $("#resLines").innerHTML=
    "DELIVERED "+delivered+"/"+total+" ("+s.perfect+" PERFECT)<br>"+
    s.skillshot+(s.skillshot===1?" SKILLSHOT":" SKILLSHOTS")+(s.tips?" — $"+s.tips+" IN TIPS":"")+"<br>"+
    s.destruction+" DESTROYED, "+s.miss+" MISSED<br>"+
    "GROSS $"+gross+" − $"+deduction+" DEDUCTIONS = <b>$"+net+"</b>";
  $("#result").classList.add("show");
  renderMeters();
  beep(700,.1); setTimeout(()=>beep(950,.1),120);
}
function updatePaperboy(dt){
  if(PB.tutorial){ pbTutorialUpdate(dt); return; }
  if(!PB.run) return;
  PB.shake=Math.max(0,PB.shake-dt);
  for(let i=PB.fx.length-1;i>=0;i--){
    const f=PB.fx[i];
    if(f.t==="parcel"){ f.p=Math.min(1,f.p+dt/f.dur); if(f.p>=1) PB.fx.splice(i,1); }
  }
  for(const hh of PB.houses){
    if(hh.angryT>0) hh.angryT=Math.max(0,hh.angryT-dt);
    if(hh.happyT>0) hh.happyT=Math.max(0,hh.happyT-dt);
  }

  if(PB.pressing && !PB.charging){
    PB.pressT+=dt;
    if(PB.pressT>=PB_TAP_MAX){
      PB.charging={side:PB.pressSide, t:0};
      beep(90,.4,"sawtooth",.1);
    }
  }
  if(PB.charging){
    PB.charging.t=Math.min(PB_CHARGE_TIME,PB.charging.t+dt);
    PB.shake=0.5;
    if(PB.charging.t>=PB_CHARGE_TIME){
      const side=PB.charging.side;
      // a button charge knows its direction and fires the instant it maxes out; a swipe charge
      // doesn't yet, so it parks at full power waiting for the flick to point it somewhere
      if(side){
        PB.charging=null; PB.pressing=false;
        pbThrow(side,true);
      } else if(!PB.charging.rang){ PB.charging.rang=true; beep(1200,.09); }
    }
    return;   // van stays fully stopped while charging — nothing scrolls
  }
  PB.speed=Math.min(PB_SPEED_MAX, PB.speed+PB_SPEED_RAMP*dt);
  PB.dist+=PB.speed*dt;

  const h=PB.houses[PB.nextIdx];
  if(h && !h.thrown && (PB.dist-h.worldDist)>PB_TOL.window){
    h.thrown=true; h.zone="miss";
    PB.stats.miss++;
    PB.nextIdx++;
  }
  if(PB.nextIdx>=PB.houses.length) pbFinish();
}

/* ---------- isometric drawing ---------- */
// world (x along road, y lateral, z up) -> screen. The camera is locked to the van, so the
// world slides under a fixed viewpoint.
function pbP(x,y,z){
  const rx=x-PB.dist;
  return [ PB.camX + (rx-y)*PB_IX*PB_S,
           PB.camY + (rx+y)*PB_IY*PB_S - (z||0)*PB_S ];
}
function pbQuad(ctx,pts,fill,stroke,lw){
  ctx.beginPath();
  ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=lw||2; ctx.stroke(); }
}
// paints text flat onto a vertical iso wall: local +x runs along the wall, +y stays screen-down
function pbFaceText(ctx,ox,oy,ux,uy,txt,size,col){
  ctx.save();
  ctx.transform(ux,uy,0,1,ox,oy);
  ctx.fillStyle=col;
  ctx.font=size+"px 'Press Start 2P',monospace";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(txt,0,0);
  ctx.restore();
  ctx.textAlign="left"; ctx.textBaseline="alphabetic";
}
function pbDrawRoad(ctx){
  const x0=PB.dist-500, x1=PB.dist+1100, R=PB_ROAD_HALF;
  pbQuad(ctx,[pbP(x0,-R,0),pbP(x1,-R,0),pbP(x1,R,0),pbP(x0,R,0)],"#141414",null);
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.globalAlpha=.85;
  let a=pbP(x0,-R,0), b=pbP(x1,-R,0);
  ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
  a=pbP(x0,R,0); b=pbP(x1,R,0);
  ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
  ctx.globalAlpha=1;
  const step=78, s0=Math.floor(x0/step)*step;
  for(let x=s0;x<x1;x+=step){
    pbQuad(ctx,[pbP(x,-3,0),pbP(x+30,-3,0),pbP(x+30,3,0),pbP(x,3,0)],"#fff",null);
  }
}
function pbDrawGround(ctx,h,isNext){
  const s=pbSideY(h.side);
  const aim = isNext && Math.abs(h.worldDist-PB.dist)<PB_TOL.doormat;
  const px0=h.worldDist-PB_PATH_W/2, px1=h.worldDist+PB_PATH_W/2;
  // the long thin path — the aiming guide. It is exactly as wide as the perfect window.
  pbQuad(ctx,[pbP(px0,s*PB_ROAD_HALF,0),pbP(px1,s*PB_ROAD_HALF,0),
              pbP(px1,s*PB_HOUSE_Y0,0),pbP(px0,s*PB_HOUSE_Y0,0)],
    aim?"#7a7a7a":"#343434", aim?"#f22":"#8f8f8f", aim?3:1.5);
  // doormat at the top of the path, right at the front door
  pbQuad(ctx,[pbP(h.worldDist-11,s*(PB_HOUSE_Y0-15),0),pbP(h.worldDist+11,s*(PB_HOUSE_Y0-15),0),
              pbP(h.worldDist+11,s*PB_HOUSE_Y0,0),pbP(h.worldDist-11,s*PB_HOUSE_Y0,0)],
    h.zone==="doormat"?"#fff":"#8a8a8a","#fff",1.5);
}
function pbDrawHouse(ctx,h,t){
  const s=pbSideY(h.side);
  const x0=h.worldDist-PB_HOUSE_W/2, x1=h.worldDist+PB_HOUSE_W/2;
  const yf=s*PB_HOUSE_Y0, yb=s*(PB_HOUSE_Y0+PB_HOUSE_DEPTH);
  const ylo=Math.min(yf,yb), yhi=Math.max(yf,yb), ymid=(ylo+yhi)/2;
  const H=PB_WALL_H, RH=PB_ROOF_H;
  const wrecked = h.zone==="window"||h.zone==="destruction"||h.zone==="power-destruction";
  const line = wrecked ? "#f22" : "#fff";
  // walls: the two camera-facing faces
  pbQuad(ctx,[pbP(x0,yhi,0),pbP(x1,yhi,0),pbP(x1,yhi,H),pbP(x0,yhi,H)],"#000",line,2);
  pbQuad(ctx,[pbP(x1,ylo,0),pbP(x1,yhi,0),pbP(x1,yhi,H),pbP(x1,ylo,H)],"#050505",line,2);
  // pitched roof — both slopes read from this angle, meeting at the ridge
  pbQuad(ctx,[pbP(x0,ylo,H),pbP(x1,ylo,H),pbP(x1,ymid,H+RH),pbP(x0,ymid,H+RH)],"#0a0a0a",line,2);
  pbQuad(ctx,[pbP(x0,yhi,H),pbP(x1,yhi,H),pbP(x1,ymid,H+RH),pbP(x0,ymid,H+RH)],"#000",line,2);
  pbQuad(ctx,[pbP(x1,ylo,H),pbP(x1,ymid,H+RH),pbP(x1,yhi,H)],"#050505",line,2);
  // window on the down-right face, so the shatter always reads no matter which side of the road
  const wy0=ymid-15, wy1=ymid+15, wz0=H*0.34, wz1=H*0.70;
  pbQuad(ctx,[pbP(x1,wy0,wz0),pbP(x1,wy1,wz0),pbP(x1,wy1,wz1),pbP(x1,wy0,wz1)],
    wrecked?"#1a0000":"#9cf", wrecked?"#f22":"#ccc",1.5);
  if(wrecked){
    const g0=pbP(x1,wy0,wz0), g1=pbP(x1,wy1,wz1), g2=pbP(x1,wy1,wz0), g3=pbP(x1,wy0,wz1);
    ctx.strokeStyle="#f22"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(g0[0],g0[1]); ctx.lineTo(g1[0],g1[1]);
    ctx.moveTo(g2[0],g2[1]); ctx.lineTo(g3[0],g3[1]); ctx.stroke();
  }
  // big door number across the wide down-left face
  const c=pbP((x0+x1)/2,yhi,H*0.52);
  pbFaceText(ctx,c[0],c[1],PB_IX,PB_IY,""+h.doorNum,17, h.zone==="miss"?"#f22":"#fff");
  // delighted customer after a SKILLSHOT — comes out, waves, and shows the tip if they left one
  if(h.happyT>0){
    const p=pbP(h.worldDist, s*(PB_HOUSE_Y0-48), 0);
    const wave=Math.sin(t*9)*4;
    ctx.save(); ctx.translate(p[0],p[1]);
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(0,-24,5,0,7); ctx.fill();
    ctx.fillRect(-4,-19,8,13);
    ctx.save(); ctx.translate(6,-20); ctx.rotate(-0.9+wave*0.06);
    ctx.fillRect(0,-2,9,4);
    ctx.restore();
    if(h.tip){
      ctx.fillStyle="#ffd94a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
      ctx.fillText("+$"+h.tip, 0, -34); ctx.textAlign="left";
    }
    ctx.restore();
  }
  // furious occupant out on the path, shaking a fist as you drive off
  if(h.angryT>0){
    const p=pbP(h.worldDist, s*(PB_HOUSE_Y0-48), 0);
    const wig=Math.sin(t*15)*3;
    ctx.save(); ctx.translate(p[0],p[1]);
    ctx.fillStyle="#f22";
    ctx.beginPath(); ctx.arc(0,-24,5,0,7); ctx.fill();
    ctx.fillRect(-4,-19,8,13);
    ctx.save(); ctx.translate(6,-17+wig); ctx.rotate(-0.5+Math.sin(t*15)*0.35);
    ctx.fillRect(0,-2,9,5);
    ctx.restore(); ctx.restore();
  }
}
function pbDrawVan(ctx,t){
  const glow = PB.charging ? clamp(PB.charging.t/PB_CHARGE_TIME,0,1) : 0;
  const L=42, Wd=26, Hh=34;
  const x0=PB.dist-L/2, x1=PB.dist+L/2, y0=-Wd/2, y1=Wd/2;
  if(glow>0){
    const g=pbP(PB.dist,0,Hh*0.5);
    ctx.save(); ctx.globalAlpha=0.25+0.55*glow;
    ctx.strokeStyle = Math.floor(t*14)%2 ? "#f22" : "#fff"; ctx.lineWidth=3+glow*4;
    ctx.beginPath(); ctx.arc(g[0],g[1],24+glow*18,0,7); ctx.stroke();
    ctx.restore();
  }
  const line = glow>0 ? "#f22" : "#fff";
  pbQuad(ctx,[pbP(x0,y1,0),pbP(x1,y1,0),pbP(x1,y1,Hh),pbP(x0,y1,Hh)],"#000",line,2);
  pbQuad(ctx,[pbP(x1,y0,0),pbP(x1,y1,0),pbP(x1,y1,Hh),pbP(x1,y0,Hh)],"#050505",line,2);
  pbQuad(ctx,[pbP(x0,y0,Hh),pbP(x1,y0,Hh),pbP(x1,y1,Hh),pbP(x0,y1,Hh)],"#111",line,2);
  // windscreen on the leading face
  pbQuad(ctx,[pbP(x1,y0+4,Hh*0.42),pbP(x1,y1-4,Hh*0.42),pbP(x1,y1-4,Hh*0.82),pbP(x1,y0+4,Hh*0.82)],"#9cf","#ccc",1.5);
  if(glow>0){
    ctx.strokeStyle="rgba(255,255,255,"+(0.5*glow)+")"; ctx.lineWidth=2;
    for(let i=0;i<3;i++){
      const a=pbP(x0-8-i*12, y0+i*7, Hh*0.5), b=pbP(x0-26-i*12, y0+i*7, Hh*0.5);
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    }
  }
}
function pbDrawParcelFX(ctx,f){
  const h=f.house, s=pbSideY(h.side), p=f.p;
  const x=f.ox+(h.worldDist-f.ox)*p;
  const y=s*PB_HOUSE_Y0*p;
  const z=Math.sin(p*Math.PI)*46;
  const q=pbP(x,y,z);
  ctx.save(); ctx.translate(q[0],q[1]); ctx.rotate(p*9);
  ctx.fillStyle="#eee"; ctx.fillRect(-5,-4,10,8);
  ctx.fillStyle="#f22"; ctx.fillRect(-5,-4,10,2);
  ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.strokeRect(-5,-4,10,8);
  ctx.restore();
}
function pbDrawHUD(ctx,w,h){
  const nextH=PB.houses[PB.nextIdx];
  ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(0,0,96,84);
  ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText("NEXT", 12, 22);
  ctx.font="26px 'Press Start 2P',monospace";
  ctx.fillText(nextH ? ""+nextH.doorNum : "--", 12, 50);
  ctx.fillStyle="#f22"; ctx.fillRect(12,58,58,4);
  ctx.font="7px 'Press Start 2P',monospace"; ctx.fillStyle="#8a8a8a";
  ctx.fillText(nextH ? (nextH.side==="L"?"◀ LEFT":"RIGHT ▶") : "", 12, 74);
  ctx.textAlign="right"; ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace";
  ctx.fillText(PB.nextIdx+"/"+PB.houses.length, w-12, 22);
  ctx.textAlign="left";
  if(PB.charging){
    const p=clamp(PB.charging.t/PB_CHARGE_TIME,0,1), full=p>=1;
    const bw=w*0.6, bx=w/2-bw/2, by=h*0.68;
    const col = full ? "#ffd94a" : "#f22";
    ctx.fillStyle="rgba(0,0,0,.7)"; ctx.fillRect(bx-5,by-18,bw+10,48);
    ctx.fillStyle=col; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("SKILLSHOT", w/2, by-5);
    ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,12);
    ctx.fillStyle=col; ctx.fillRect(bx,by,bw*p,12);
    if(full && !PB.charging.side && Math.floor(performance.now()/220)%2){
      ctx.fillStyle="#ffd94a"; ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillText("SWIPE TO LAUNCH", w/2, by+26);
    }
    ctx.textAlign="left";
  }
}
// Route minimap: a strip of the whole street, one small square per house. White = due a delivery,
// not thrown yet. Green/red = thrown, matching the doorstep outcome (good vs bad zone). Decoys —
// houses that were never due a delivery — get a dim neutral marker that never changes. A blinking
// dot tracks the van's live position along the same strip.
function pbDrawMinimap(ctx,w,h){
  const x0=14, barW=w-28, y0=h-26, barH=14;
  const domainMax=PB_HOUSE_GAP*(PB_STREET_LEN+1);
  const xAt = d => x0 + barW*clamp(d/domainMax,0,1);
  ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(x0-6,y0-4,barW+12,barH+8);
  ctx.strokeStyle="rgba(255,255,255,.25)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x0,y0+barH/2); ctx.lineTo(x0+barW,y0+barH/2); ctx.stroke();
  for(const hh of PB.decoys){
    const x=xAt(hh.worldDist);
    ctx.fillStyle="#444"; ctx.strokeStyle="#222"; ctx.lineWidth=1;
    ctx.fillRect(x-3,y0+2,6,barH-4); ctx.strokeRect(x-3,y0+2,6,barH-4);
  }
  for(const hh of PB.houses){
    const x=xAt(hh.worldDist);
    let fill="#fff", stroke="#888";
    if(hh.zone==="doormat"||hh.zone==="house"){ fill="#3fdc7a"; stroke="#0a5c2c"; }
    else if(hh.zone==="window"||hh.zone==="destruction"||hh.zone==="miss"){ fill="#f22"; stroke="#7a0000"; }
    ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=1;
    ctx.fillRect(x-3,y0,6,barH); ctx.strokeRect(x-3,y0,6,barH);
  }
  if(Math.floor(performance.now()/220)%2){
    const x=xAt(PB.dist);
    ctx.fillStyle="#ffd94a";
    ctx.beginPath(); ctx.arc(x,y0+barH/2,4,0,7); ctx.fill();
  }
}
// The tutorial reuses the real house/van/parcel renderer and the real pbThrow/pbApplyResult
// scoring path — the van is simply eased to a dead stop exactly on each house's worldDist, so
// every throw resolves as a genuine doormat hit by construction, not by faking the result.
function pbTutorialStart(){
  const doorStart=20+Math.floor(Math.random()*70);
  const side1=Math.random()<0.5?"L":"R", side2=side1==="L"?"R":"L";
  const h1={doorNum:doorStart, side:side1, worldDist:PB_HOUSE_GAP*1, thrown:false, zone:null, angryT:0, happyT:0, tip:0};
  const h2={doorNum:doorStart+1, side:side2, worldDist:PB_HOUSE_GAP*2, thrown:false, zone:null, angryT:0, happyT:0, tip:0};
  Object.assign(PB,{
    houses:[h1,h2], decoys:[], nextIdx:0, dist:0, speed:0,
    pressing:false, pressSide:null, pressT:0, charging:null, fx:[], shake:0, swipe:null,
    stats:{perfect:0, house:0, destruction:0, miss:0, skillshot:0, tips:0},
    tutorial:true, active:true, run:false
  });
  Object.assign(PBTUT,{step:PBTUT_STEP.DRIVE_TO_1, stepT:0, arrowPulse:0, waitingInput:false, bannerT:0, houseIdx:0, target:h1.worldDist});
}
function pbTutorialThrow(side,power){
  const S_=PBTUT_STEP;
  if(PBTUT.step!==S_.TEACH_SWIPE && PBTUT.step!==S_.TEACH_CHARGE) return;
  const h=PB.houses[PBTUT.houseIdx];
  if(!h) return;
  if(side!==h.side){
    beep(300,.08);
    toast(h.side==="L"?"SWIPE LEFT, TOWARD THE HOUSE":"SWIPE RIGHT, TOWARD THE HOUSE",1);
    PB.charging=null; PB.pressing=false;
    return;
  }
  if(PBTUT.step===S_.TEACH_CHARGE && !power){
    toast("HOLD IT A LITTLE LONGER, THEN SWIPE",1);
    return;
  }
  pbThrow(side,power);   // off===0 at a dead stop, so this always lands the doormat
  PBTUT.waitingInput=false;
  PBTUT.step = PBTUT.houseIdx===0 ? S_.CELEBRATE_1 : S_.CELEBRATE_2;
  PBTUT.stepT=0;
}
function pbTutorialUpdate(dt){
  PB.shake=Math.max(0,PB.shake-dt);
  for(let i=PB.fx.length-1;i>=0;i--){
    const f=PB.fx[i];
    if(f.t==="parcel"){ f.p=Math.min(1,f.p+dt/f.dur); if(f.p>=1) PB.fx.splice(i,1); }
  }
  for(const hh of PB.houses){
    if(hh.angryT>0) hh.angryT=Math.max(0,hh.angryT-dt);
    if(hh.happyT>0) hh.happyT=Math.max(0,hh.happyT-dt);
  }
  const S_=PBTUT_STEP, st=PBTUT.step;
  if(st===S_.DRIVE_TO_1 || st===S_.DRIVE_TO_2){
    PBTUT.stepT+=dt;
    PB.dist += (PBTUT.target-PB.dist)*Math.min(1,dt*2.2);
    if(Math.abs(PBTUT.target-PB.dist)<0.6 || PBTUT.stepT>4){
      PB.dist=PBTUT.target;
      PBTUT.step = st===S_.DRIVE_TO_1 ? S_.TEACH_SWIPE : S_.TEACH_CHARGE;
      PBTUT.stepT=0; PBTUT.waitingInput=true;
    }
  } else if(st===S_.TEACH_SWIPE || st===S_.TEACH_CHARGE){
    PBTUT.arrowPulse+=dt;
    // same tap-vs-hold conversion the real route uses, so the muscle memory transfers directly
    if(PB.pressing && !PB.charging){
      PB.pressT+=dt;
      if(PB.pressT>=PB_TAP_MAX){ PB.charging={side:PB.pressSide, t:0}; beep(90,.4,"sawtooth",.1); }
    }
    if(PB.charging){
      PB.charging.t=Math.min(PB_CHARGE_TIME,PB.charging.t+dt);
      PB.shake=0.5;
      if(PB.charging.t>=PB_CHARGE_TIME){
        const side=PB.charging.side;
        if(side){ PB.charging=null; PB.pressing=false; pbTutorialThrow(side,true); }
        else if(!PB.charging.rang){ PB.charging.rang=true; beep(1200,.09); }
      }
    }
  } else if(st===S_.CELEBRATE_1){
    PBTUT.stepT+=dt;
    if(PBTUT.stepT>1.2){ PBTUT.step=S_.DRIVE_TO_2; PBTUT.stepT=0; PBTUT.houseIdx=1; PBTUT.target=PB.houses[1].worldDist; }
  } else if(st===S_.CELEBRATE_2){
    PBTUT.stepT+=dt;
    if(PBTUT.stepT>1.2){ PBTUT.step=S_.COMPLETE; PBTUT.stepT=0; PBTUT.bannerT=0; }
  } else if(st===S_.COMPLETE){
    PBTUT.bannerT+=dt;
    if(PBTUT.bannerT>2.0){
      S.pbTutorialDone=true; PB.tutorial=false;
      pbNewRoute(); PB.active=true; PB.run=true;
      toast("SWIPE OR TAP TO THROW AS THE VAN CROSSES THE PATH — HOLD TO CHARGE A SKILLSHOT",1);
      beep(500,.06); setTimeout(()=>beep(700,.07),110);
    }
  }
}
function pbTutorialDraw(ctx,w,h,t){
  const S_=PBTUT_STEP, st=PBTUT.step;
  pbDrawRoad(ctx);
  for(let i=0;i<PB.houses.length;i++) pbDrawGround(ctx,PB.houses[i],i===PBTUT.houseIdx);
  const drawables=[];
  for(const hh of PB.houses){
    const yhi=Math.max(pbSideY(hh.side)*PB_HOUSE_Y0, pbSideY(hh.side)*(PB_HOUSE_Y0+PB_HOUSE_DEPTH));
    drawables.push({d:hh.worldDist+yhi, f:()=>pbDrawHouse(ctx,hh,t)});
  }
  drawables.push({d:PB.dist+10, f:()=>pbDrawVan(ctx,t)});
  drawables.sort((a,b)=>a.d-b.d);
  for(const dd of drawables) dd.f();
  for(const f of PB.fx){ if(f.t==="parcel") pbDrawParcelFX(ctx,f); }

  const h0=PB.houses[PBTUT.houseIdx];
  let title="", sub="";
  if(st===S_.DRIVE_TO_1||st===S_.DRIVE_TO_2) title="DRIVING TO THE NEXT HOUSE...";
  else if(st===S_.TEACH_SWIPE){ title="YOUR FIRST DELIVERY"; sub="SWIPE "+(h0.side==="L"?"LEFT":"RIGHT")+" TO THROW THE PARCEL"; }
  else if(st===S_.CELEBRATE_1) title="PERFECT!";
  else if(st===S_.TEACH_CHARGE){ title="THE SKILLSHOT"; sub="HOLD, THEN SWIPE "+(h0.side==="L"?"LEFT":"RIGHT")+" FOR A POWER THROW"; }
  else if(st===S_.CELEBRATE_2) title="SKILLSHOT!";
  else if(st===S_.COMPLETE) title="TUTORIAL COMPLETE";

  ctx.textAlign="center";
  if(st!==S_.COMPLETE){
    ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(w*0.06,10,w*0.88,sub?54:34);
    ctx.fillStyle="#fff"; ctx.font="11px 'Press Start 2P',monospace";
    ctx.fillText(title, w/2, 30);
    if(sub){ ctx.fillStyle="#ffd94a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.fillText(sub, w/2, 50); }
  } else {
    const a=Math.min(1,PBTUT.bannerT*2);
    ctx.globalAlpha=a;
    ctx.fillStyle="rgba(0,0,0,.85)"; ctx.fillRect(w*0.1,h*0.4,w*0.8,60);
    ctx.strokeStyle="#ffd94a"; ctx.lineWidth=3; ctx.strokeRect(w*0.1,h*0.4,w*0.8,60);
    ctx.fillStyle="#ffd94a"; ctx.font="14px 'Press Start 2P',monospace";
    ctx.fillText(title, w/2, h*0.4+38);
    ctx.globalAlpha=1;
  }
  ctx.textAlign="left";

  if(PBTUT.waitingInput && (st===S_.TEACH_SWIPE||st===S_.TEACH_CHARGE)){
    const dir = h0.side==="L" ? -1 : 1;
    const pulse=0.85+0.15*Math.sin(PBTUT.arrowPulse*5);
    const cx=w/2+dir*w*0.16, cy=h*0.5;
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(pulse*dir,pulse);
    pbQuad(ctx,[[-20,-8],[6,-8],[6,-20],[30,0],[6,20],[6,8],[-20,8]],"#ffd94a",null);
    ctx.restore();
    if(st===S_.TEACH_CHARGE && PB.charging){
      const p=clamp(PB.charging.t/PB_CHARGE_TIME,0,1);
      ctx.strokeStyle="#f22"; ctx.lineWidth=4;
      ctx.beginPath(); ctx.arc(cx,cy,34,-Math.PI/2,-Math.PI/2+p*6.283); ctx.stroke();
    }
  }
}
function drawPaperboy(t){
  const [ctx,w,h]=fit($("#paperboycv"));
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
  PB.camX = w*0.36 + (Math.random()-0.5)*PB.shake*7;
  PB.camY = h*0.26 + (Math.random()-0.5)*PB.shake*7;
  if(PB.tutorial){ pbTutorialDraw(ctx,w,h,t); return; }
  pbDrawRoad(ctx);
  // ground layer first, so every path/doormat sits under every building. Decoys render exactly
  // like real houses but are never "next", so their path/doormat never highlights.
  for(let i=0;i<PB.houses.length;i++){
    const hh=PB.houses[i];
    if(Math.abs(hh.worldDist-PB.dist)>900) continue;
    pbDrawGround(ctx,hh,i===PB.nextIdx);
  }
  for(const hh of PB.decoys){
    if(Math.abs(hh.worldDist-PB.dist)>900) continue;
    pbDrawGround(ctx,hh,false);
  }
  // the throw line: shows exactly where a parcel leaves the van, so lining it up with a
  // path is the whole aiming read
  {
    const a=pbP(PB.dist,-PB_HOUSE_Y0,0), b=pbP(PB.dist,PB_HOUSE_Y0,0);
    ctx.strokeStyle = PB.charging ? "#f22" : "#fff"; ctx.globalAlpha=.35; ctx.lineWidth=2;
    ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
  }
  // painter's order: farther from the camera (smaller x+y) draws first
  const drawables=[];
  for(const hh of [...PB.houses, ...PB.decoys]){
    if(Math.abs(hh.worldDist-PB.dist)>900) continue;
    const yhi=Math.max(pbSideY(hh.side)*PB_HOUSE_Y0, pbSideY(hh.side)*(PB_HOUSE_Y0+PB_HOUSE_DEPTH));
    drawables.push({d:hh.worldDist+yhi, f:()=>pbDrawHouse(ctx,hh,t)});
  }
  drawables.push({d:PB.dist+10, f:()=>pbDrawVan(ctx,t)});
  drawables.sort((a,b)=>a.d-b.d);
  for(const dd of drawables) dd.f();
  for(const f of PB.fx){ if(f.t==="parcel") pbDrawParcelFX(ctx,f); }
  pbDrawHUD(ctx,w,h);
  pbDrawMinimap(ctx,w,h);
}
(function(){
  // Swipe delivery straight on the route view: flick left or right to throw that way. Press and
  // hold still first to wind up a SKILLSHOT, then flick to launch it.
  const cv=$("#paperboycv");
  cv.addEventListener("pointerdown",e=>{
    if(!PB.run && !PB.tutorial) return;
    e.preventDefault();
    PB.swipe={x:e.clientX, y:e.clientY, fired:false};
    pbPressStart(null);
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
  });
  cv.addEventListener("pointermove",e=>{
    if((!PB.run && !PB.tutorial) || !PB.swipe || PB.swipe.fired) return;
    const dx=e.clientX-PB.swipe.x;
    if(Math.abs(dx)>=PB_SWIPE_MIN){
      PB.swipe.fired=true;
      pbLaunch(dx<0 ? "L" : "R");
    }
  });
  const swEnd=()=>{
    if(!PB.swipe) return;
    const fired=PB.swipe.fired;
    PB.swipe=null;
    // lifted without a flick: cancel the wind-up rather than burning a parcel
    if(!fired && PB.pressSide===null){
      PB.pressing=false;
      if(PB.charging){ PB.charging=null; beep(200,.08,"sawtooth"); toast("SKILLSHOT ABORTED",1); }
    }
  };
  cv.addEventListener("pointerup",swEnd);
  cv.addEventListener("pointercancel",swEnd);
  const bl=$("#bThrowL"), br=$("#bThrowR");
  bl.addEventListener("pointerdown",e=>{ e.preventDefault(); pbPressStart("L"); });
  bl.addEventListener("pointerup",()=>pbPressEnd("L"));
  bl.addEventListener("pointercancel",()=>pbPressEnd("L"));
  br.addEventListener("pointerdown",e=>{ e.preventDefault(); pbPressStart("R"); });
  br.addEventListener("pointerup",()=>pbPressEnd("R"));
  br.addEventListener("pointercancel",()=>pbPressEnd("R"));
  document.addEventListener("keydown",e=>{
    if(MODE!=="paperboy") return;
    if(e.code==="ArrowLeft") pbPressStart("L");
    if(e.code==="ArrowRight") pbPressStart("R");
  });
  document.addEventListener("keyup",e=>{
    if(MODE!=="paperboy") return;
    if(e.code==="ArrowLeft") pbPressEnd("L");
    if(e.code==="ArrowRight") pbPressEnd("R");
  });
})();
