/* ===== PAPERBOY ROUTE — van delivery work minigame ===== */
// The primary money-earning job. Continuous diagonal-scroll route: houses appear on
// alternating sides in strict door-number sequence, and the player throws the current
// next parcel left or right — a quick tap for a normal throw, or a held-down 3-second
// charge for an all-or-nothing power throw. Accuracy is purely a timing skill (how close
// the house is to the fixed throw-line the instant the parcel leaves the hand).
const PB_ROUTE_LEN=12, PB_HOUSE_GAP=250;
const PB_SPEED0=95, PB_SPEED_MAX=155, PB_SPEED_RAMP=0.7;
const PB_TOL={doormat:11, house:27, window:50};
const PB_CHARGE_TIME=3.0, PB_TAP_MAX=0.22;
const PB_HOUSE_VALUE=5, PB_PERFECT_BONUS=2, PB_DESTRUCTION_PENALTY=3, PB_MISS_PENALTY=1;
const PB_LANE=90;

const PB={
  active:false, run:false,
  dist:0, speed:0, houses:[], nextIdx:0,
  pressing:false, pressSide:null, pressT:0,
  charging:null, fx:[], shake:0,
  stats:{perfect:0, house:0, destruction:0, miss:0}
};

function pbNewRoute(){
  const houses=[];
  const doorStart=20+Math.floor(Math.random()*70);
  let side=Math.random()<0.5?"L":"R";
  for(let i=0;i<PB_ROUTE_LEN;i++){
    houses.push({doorNum:doorStart+i, side, worldDist:PB_HOUSE_GAP*(i+1), thrown:false, zone:null, angryT:0});
    side = side==="L" ? "R" : "L";
  }
  Object.assign(PB,{
    houses, nextIdx:0, dist:0, speed:PB_SPEED0,
    pressing:false, pressSide:null, pressT:0, charging:null, fx:[], shake:0,
    stats:{perfect:0, house:0, destruction:0, miss:0}
  });
}
function enterPaperboy(){
  hidePortrait(); closeStatus();
  transition("STARTING THE ROUTE",()=>{
    showScreen("paperboy");
    pbNewRoute();
    PB.active=true; PB.run=true;
    toast("DELIVER "+PB_ROUTE_LEN+" PARCELS IN ORDER — TAP TO THROW, HOLD FOR A POWER THROW",1);
    beep(500,.06); setTimeout(()=>beep(700,.07),110);
  });
}
function pbPressStart(side){
  if(!PB.run || PB.pressing) return;
  PB.pressing=true; PB.pressSide=side; PB.pressT=0;
}
function pbPressEnd(side){
  if(!PB.pressing || PB.pressSide!==side) return;
  PB.pressing=false;
  if(PB.charging){
    PB.charging=null;
    beep(200,.08,"sawtooth");
    toast("POWER THROW ABORTED",1);
  } else {
    pbThrow(side,false);
  }
}
function pbSpawnParcelFX(house,kind){
  PB.fx.push({t:"parcel", house, p:0, dur:0.3, kind});
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
    beep(880,.07); setTimeout(()=>beep(1180,.09),80);
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
  const gross=delivered*PB_HOUSE_VALUE + s.perfect*PB_PERFECT_BONUS;
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
    s.destruction+" DESTROYED, "+s.miss+" MISSED<br>"+
    "GROSS $"+gross+" − $"+deduction+" DEDUCTIONS = <b>$"+net+"</b>";
  $("#result").classList.add("show");
  renderMeters();
  beep(700,.1); setTimeout(()=>beep(950,.1),120);
}
function updatePaperboy(dt){
  if(!PB.run) return;
  PB.shake=Math.max(0,PB.shake-dt);
  for(let i=PB.fx.length-1;i>=0;i--){
    const f=PB.fx[i];
    if(f.t==="parcel"){ f.p=Math.min(1,f.p+dt/f.dur); if(f.p>=1) PB.fx.splice(i,1); }
  }
  for(const hh of PB.houses){ if(hh.angryT>0) hh.angryT=Math.max(0,hh.angryT-dt); }

  if(PB.pressing && !PB.charging){
    PB.pressT+=dt;
    if(PB.pressT>=PB_TAP_MAX){
      PB.charging={side:PB.pressSide, t:0};
      beep(90,.4,"sawtooth",.1);
    }
  }
  if(PB.charging){
    PB.charging.t+=dt;
    PB.shake=0.5;
    if(PB.charging.t>=PB_CHARGE_TIME){
      const side=PB.charging.side;
      PB.charging=null; PB.pressing=false;
      pbThrow(side,true);
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
function pbDrawHouse(ctx,hh,lx,ly,t){
  ctx.save();
  ctx.translate(lx,ly);
  ctx.fillStyle="rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(0,34,30,8,0,0,7); ctx.fill();
  ctx.fillStyle="#050505"; ctx.strokeStyle = hh.angryT>0 ? "#f22" : "#eee"; ctx.lineWidth=3;
  ctx.fillRect(-30,-26,60,52); ctx.strokeRect(-30,-26,60,52);
  ctx.beginPath(); ctx.moveTo(-36,-26); ctx.lineTo(0,-50); ctx.lineTo(36,-26); ctx.closePath();
  ctx.fillStyle="#050505"; ctx.fill(); ctx.stroke();
  ctx.strokeStyle="#ccc"; ctx.lineWidth=2;
  ctx.strokeRect(-9,2,18,24);
  ctx.fillStyle = hh.zone==="doormat" ? "#fff" : "#ccc";
  ctx.fillRect(-13,24,26,6);
  const winBroken = hh.zone==="window" || hh.zone==="destruction" || hh.zone==="power-destruction";
  ctx.fillStyle = winBroken ? "#111" : "#9cf";
  ctx.fillRect(-24,-16,14,14);
  ctx.strokeStyle="#333"; ctx.lineWidth=1; ctx.strokeRect(-24,-16,14,14);
  if(winBroken){
    ctx.strokeStyle="#f22"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-24,-16); ctx.lineTo(-10,-2); ctx.moveTo(-10,-16); ctx.lineTo(-24,-2); ctx.stroke();
  }
  ctx.fillStyle="#000"; ctx.fillRect(-17,-25,34,11);
  ctx.strokeStyle="#fff"; ctx.lineWidth=1; ctx.strokeRect(-17,-25,34,11);
  ctx.fillStyle = hh.zone==="miss" ? "#f22" : "#fff";
  ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText(""+hh.doorNum, 0, -17);
  ctx.textAlign="left";
  if(hh.zone==="doormat"){
    ctx.fillStyle="#fff"; ctx.fillRect(-6,20,12,6);
    ctx.fillStyle="#f22"; ctx.fillRect(-6,20,12,2);
  } else if(hh.zone==="house"){
    ctx.save(); ctx.translate(9,12); ctx.rotate(0.4);
    ctx.fillStyle="#ccc"; ctx.fillRect(-6,-4,12,8); ctx.fillStyle="#f22"; ctx.fillRect(-6,-4,12,2);
    ctx.restore();
  }
  if(hh.angryT>0){
    const wig=Math.sin(t*14)*4;
    ctx.save(); ctx.translate(0,-9);
    ctx.fillStyle="#f22";
    ctx.beginPath(); ctx.arc(0,-4,5,0,7); ctx.fill();
    ctx.fillRect(-4,0,8,10);
    ctx.save(); ctx.translate(6+wig,2); ctx.rotate(-0.6+Math.sin(t*14)*0.3);
    ctx.fillRect(0,-2,8,5);
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}
function pbDrawParcelFX(ctx,f){
  const ly=PB.dist-f.house.worldDist;
  const lx=f.house.side==="L" ? -PB_LANE : PB_LANE;
  const p=f.p;
  const px=lx*p, py=ly*p - Math.sin(p*Math.PI)*30;
  ctx.save(); ctx.translate(px,py); ctx.rotate(p*8);
  ctx.fillStyle="#eee"; ctx.fillRect(-5,-4,10,8);
  ctx.fillStyle="#f22"; ctx.fillRect(-5,-4,10,2);
  ctx.restore();
}
function pbDrawVan(ctx,t){
  const glow = PB.charging ? clamp(PB.charging.t/PB_CHARGE_TIME,0,1) : 0;
  if(glow>0){
    ctx.save(); ctx.globalAlpha=0.3+0.5*glow;
    ctx.strokeStyle = Math.floor(t*14)%2 ? "#f22" : "#fff"; ctx.lineWidth=3+glow*4;
    ctx.beginPath(); ctx.arc(0,0,26+glow*14,0,7); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle="#000"; ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.fillRect(-16,-14,32,28); ctx.strokeRect(-16,-14,32,28);
  ctx.fillStyle="#9cf"; ctx.fillRect(-11,-9,22,9);
  ctx.fillStyle="#fff"; ctx.fillRect(-16,10,8,4); ctx.fillRect(8,10,8,4);
  if(glow>0){
    for(let i=0;i<3;i++){
      ctx.strokeStyle="rgba(255,255,255,"+(0.4*glow)+")"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-20-i*4,-6+i*6); ctx.lineTo(-30-i*4,-6+i*6); ctx.stroke();
    }
  }
  ctx.restore();
}
function pbDrawHUD(ctx,w,h){
  ctx.fillStyle="rgba(0,0,0,.4)"; ctx.fillRect(0,0,w,34);
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,34); ctx.lineTo(w,34); ctx.stroke();
  const nextH=PB.houses[PB.nextIdx];
  ctx.font="8px 'Press Start 2P',monospace"; ctx.fillStyle="#fff"; ctx.textAlign="left";
  ctx.fillText(nextH ? "NEXT: #"+nextH.doorNum+" ("+(nextH.side==="L"?"LEFT":"RIGHT")+")" : "ROUTE DONE", 10, 21);
  ctx.textAlign="right";
  ctx.fillText(PB.nextIdx+"/"+PB.houses.length, w-10, 21);
  ctx.textAlign="left";
  if(PB.charging){
    const p=clamp(PB.charging.t/PB_CHARGE_TIME,0,1);
    const bw=w*0.6, bx=w/2-bw/2, by=h*0.42;
    ctx.fillStyle="rgba(0,0,0,.65)"; ctx.fillRect(bx-4,by-16,bw+8,32);
    ctx.fillStyle="#f22"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("POWER THROW", w/2, by-4);
    ctx.strokeStyle="#f22"; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,12);
    ctx.fillStyle="#f22"; ctx.fillRect(bx,by,bw*p,12);
    ctx.textAlign="left";
  }
}
function drawPaperboy(t){
  const [ctx,w,h]=fit($("#paperboycv"));
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
  const cx=w*0.40, cy=h*0.36;
  const shakeX=(Math.random()-0.5)*PB.shake*6, shakeY=(Math.random()-0.5)*PB.shake*6;
  ctx.save();
  ctx.translate(cx+shakeX, cy+shakeY);
  ctx.rotate(0.15);
  ctx.fillStyle="#111";
  ctx.fillRect(-140,-h*1.4,280,h*2.8);
  ctx.strokeStyle="#2a2a2a"; ctx.lineWidth=3; ctx.setLineDash([16,14]);
  ctx.lineDashOffset=-PB.dist%30;
  ctx.beginPath(); ctx.moveTo(0,-h*1.4); ctx.lineTo(0,h*1.4); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = PB.charging ? "#f22" : "#fff"; ctx.lineWidth=2; ctx.globalAlpha=0.45;
  ctx.beginPath(); ctx.moveTo(-140,0); ctx.lineTo(140,0); ctx.stroke();
  ctx.globalAlpha=1;
  for(const hh of PB.houses){
    const ly=PB.dist-hh.worldDist;
    if(ly<-420||ly>260) continue;
    const lx = hh.side==="L" ? -PB_LANE : PB_LANE;
    pbDrawHouse(ctx,hh,lx,ly,t);
  }
  for(const f of PB.fx){ if(f.t==="parcel") pbDrawParcelFX(ctx,f); }
  pbDrawVan(ctx,t);
  ctx.restore();
  pbDrawHUD(ctx,w,h);
}
(function(){
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
