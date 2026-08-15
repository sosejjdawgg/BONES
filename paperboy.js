/* ===== PAPERBOY ROUTE — van delivery work minigame ===== */
// The primary money-earning job. An isometric delivery route: the van drives down the road
// while houses sit back from it, each joined to the road by its own long thin path. Delivering
// is a single action — hold, and don't let go. The van pulls over, the driver walks the parcel
// up the path, hands it over and walks back, all while a ticking countdown runs. Let go before
// the box has actually changed hands and he trips, fumbling it — a fast, funny, costly miss.
const PB_ROUTE_LEN=12, PB_HOUSE_GAP=250;
// the street has far more addressed houses than parcels today — PB_STREET_LEN houses total,
// laid out UK-style (odd numbers up one side, even up the other, each side incrementing by 2),
// with only PB_ROUTE_LEN of them actually due a delivery.
const PB_STREET_LEN=PB_ROUTE_LEN*3;
// The van pulls away slowly and keeps building all route long — the ramp is the point, so every
// restart (a hand delivery, the start line) is a fresh run up through the gears with the
// speedometer climbing and the speed lines thickening behind it.
const PB_SPEED0=70, PB_SPEED_MAX=215, PB_SPEED_RAMP=14;
const PB_TOL={doormat:11, window:50};
/* PAY — deliberately lopsided. A lost parcel (never attempted) hurts; a fumbled one (started,
   then let go too early) hurts far more — you already spent the time on it. */
const PB_PERFECT_PAY=4;         // handed over safely
const PB_MISS_PENALTY=7;        // never attempted — driven past
const PB_FUMBLE_PENALTY=42;     // let go early — he trips, the parcel's ruined
const PB_TIP_CHANCE=0.75, PB_TIP_MIN=1, PB_TIP_MAX=4;
const PB_PARK_BONUS=6;          // parked cleanly in the bay at the end of the road
const PB_CRASH_PENALTY=15;      // drove into the wall
// Run time is rated against this. Hand delivering is safe but eats seconds, so the clock is the
// cost that keeps it from simply being the correct answer every time.
const PB_PAR_TIME=45;

/* HAND DELIVERY — the van pulls up, the driver walks the parcel to the door, hands it over and
   walks back. The box is only ever at risk during "stop"+"out" — while it's still in his hands;
   once "give" fires he's already handed it over and the outcome is locked in, safe or not. */
const PB_HAND={ stop:0.45, out:0.85, give:0.55, back:0.85 };
const PB_HAND_TOTAL=PB_HAND.stop+PB_HAND.out+PB_HAND.give+PB_HAND.back;
const PB_HAND_TICK=0.15;        // cadence of the ticking countdown while the box is still in hand

/* THE FUMBLE — let go too early and he trips: a beat sprawled on the ground, then the box goes
   tumbling on toward the house on its own. Incredibly simple on purpose — it's a quick, readable
   punishment, not a whole new animation system. */
const PB_FUMBLE={ fall:0.35, roll:0.55 };
const PB_FUMBLE_TOTAL=PB_FUMBLE.fall+PB_FUMBLE.roll;

/* THE END OF THE ROAD — past the last house the job changes: get it stopped in the bay. The bay
   is a bit over two van lengths, and at full speed you need to be on the brake as you reach it,
   so the SLOW DOWN sign is the cue rather than a decoration. */
const PB_STOP_ZONE_LEN=100, PB_BRAKE_DECEL=260;
const PB_SIGN_LEAD=300;         // how far before the bay the SLOW DOWN sign stands

// --- isometric world layout (x = along the road, y = lateral offset, z = up) ---
const PB_S=0.42, PB_IX=0.866, PB_IY=0.5;         // projection scale + iso basis
const PB_ROAD_HALF=19;                            // road half-width — kept narrow so it reads as a lane
const PB_PATH_LEN=118;                            // long thin garden path, road edge -> front door
const PB_PATH_W=PB_TOL.doormat*2;                 // path is exactly the doormat window wide
const PB_HOUSE_Y0=PB_ROAD_HALF+PB_PATH_LEN;       // house front edge, set well back from the road
const PB_HOUSE_DEPTH=64, PB_HOUSE_W=94;
const PB_WALL_H=60, PB_ROOF_H=32;

const PB={
  active:false, run:false, tutorial:false, settingsOpen:false,
  dist:0, speed:0, houses:[], decoys:[], nextIdx:0,
  pressing:false, shake:0,
  camX:0, camY:0,
  // phase: "route" while parcels remain, "approach" once they're all done and the bay is ahead,
  // "stopping" from the moment the brakes go on, "done" once it has come to rest or hit the wall
  phase:"route", hand:null, roadEnd:0, braking:false, wobble:0, wobbleT:0,
  crashed:false, parked:null, elapsed:0, lines:[],
  stats:{perfect:0, fumble:0, miss:0, tips:0}
};
/* Engine note: one oscillator held for the whole run, its pitch and volume riding the speedometer,
   so acceleration is something you hear building rather than just watch. Lives outside the SFX
   helpers because it is continuous — beep() is for one-shots. */
const PBAUD={osc:null, gain:null, filt:null, screech:null, screechGain:null};
function pbEngineStart(){
  if(!SETTINGS.sound || PBAUD.osc) return;
  try{
    audioInit();
    const o=AC.createOscillator(), g=AC.createGain(), f=AC.createBiquadFilter();
    o.type="sawtooth"; o.frequency.value=52;
    f.type="lowpass"; f.frequency.value=420; f.Q.value=6;
    g.gain.value=0.0001;
    o.connect(f); f.connect(g); g.connect(SFXBUS); o.start();
    PBAUD.osc=o; PBAUD.gain=g; PBAUD.filt=f;
  }catch(e){}
}
function pbEngineStop(){
  try{
    if(PBAUD.osc){ PBAUD.gain.gain.cancelScheduledValues(AC.currentTime);
      PBAUD.gain.gain.setTargetAtTime(0.0001,AC.currentTime,0.05);
      const o=PBAUD.osc; setTimeout(()=>{ try{o.stop();}catch(_){} },300); }
    if(PBAUD.screech){ const s=PBAUD.screech; PBAUD.screechGain.gain.setTargetAtTime(0.0001,AC.currentTime,0.04);
      setTimeout(()=>{ try{s.stop();}catch(_){} },260); }
  }catch(e){}
  PBAUD.osc=null; PBAUD.gain=null; PBAUD.filt=null; PBAUD.screech=null; PBAUD.screechGain=null;
}
function pbEngineTick(){
  if(!PBAUD.osc) return;
  try{
    const f=clamp(PB.speed/PB_SPEED_MAX,0,1);
    const t=AC.currentTime;
    PBAUD.osc.frequency.setTargetAtTime(46+f*104, t, 0.08);
    PBAUD.filt.frequency.setTargetAtTime(360+f*1500, t, 0.08);
    PBAUD.gain.gain.setTargetAtTime((PB.hand||PB.phase==="done") ? 0.006 : 0.018+f*0.05, t, 0.08);
  }catch(e){}
}
// tyre squeal, held for as long as the brakes are on
function pbScreech(on){
  try{
    if(on && !PBAUD.screech && SETTINGS.sound){
      audioInit();
      const b=AC.createBufferSource(), g=AC.createGain(), f=AC.createBiquadFilter();
      const len=AC.sampleRate*0.5, buf=AC.createBuffer(1,len,AC.sampleRate), d=buf.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*0.6;
      b.buffer=buf; b.loop=true;
      f.type="bandpass"; f.frequency.value=2100; f.Q.value=9;
      g.gain.value=0.0001;
      b.connect(f); f.connect(g); g.connect(SFXBUS); b.start();
      g.gain.setTargetAtTime(0.10,AC.currentTime,0.02);
      PBAUD.screech=b; PBAUD.screechGain=g;
    } else if(!on && PBAUD.screech){
      const s=PBAUD.screech;
      PBAUD.screechGain.gain.setTargetAtTime(0.0001,AC.currentTime,0.05);
      setTimeout(()=>{ try{s.stop();}catch(_){} },300);
      PBAUD.screech=null; PBAUD.screechGain=null;
    }
  }catch(e){}
}

/* ---------- tutorial: one house teaches hold-to-deliver (retrying in place if fumbled), then a
   last stretch of road teaches the real end-of-route brake — see SPEED_RUN ---------- */
const PBTUT_STEP={DRIVE_TO_1:0, TEACH_HOLD:1, CELEBRATE_1:2, SPEED_RUN:3, COMPLETE:4};
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
  // the road runs on past the last address, giving the sign and then the bay somewhere to live
  const lastDist=street[street.length-1].worldDist;
  Object.assign(PB,{
    houses, decoys, nextIdx:0, dist:0, speed:PB_SPEED0,
    pressing:false, shake:0,
    phase:"route", hand:null, braking:false, wobble:0, wobbleT:0, crashed:false, parked:null,
    roadEnd:lastDist+PB_SIGN_LEAD+PB_STOP_ZONE_LEN+140, elapsed:0, lines:[],
    stats:{perfect:0, fumble:0, miss:0, tips:0}
  });
}
function pbStopZoneStart(){ return PB.roadEnd-PB_STOP_ZONE_LEN; }
function enterPaperboy(){
  if(!S.pbTutorialDone){ enterPaperboyTutorial(); return; }
  hidePortrait(); closeStatus();
  transition("STARTING THE ROUTE",()=>{
    showScreen("paperboy");
    pbNewRoute();
    PB.active=true; PB.run=true;
    pbEngineStart();
    toast("HOLD TO DELIVER — DON'T LET GO TOO EARLY!",1);
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
// Once every parcel is gone the controls change meaning entirely: there is nothing left to throw,
// so any press is the brake pedal. This is why the SLOW DOWN sign only appears after the last house.
function pbBrakeMode(){ return (!PB.tutorial || PBTUT.step===PBTUT_STEP.SPEED_RUN) && (PB.phase==="approach"||PB.phase==="stopping"); }
function pbStartBraking(){
  if(PB.phase!=="approach") return;
  PB.phase="stopping"; PB.braking=true;
  pbScreech(true);
  PB.shake=Math.max(PB.shake,0.6);
  haptic([30,20,30]);
}
// One action: hold. Pressing commits immediately — no more tap-vs-hold decision — and letting
// go early is only punished while the box is still actually in his hands (see pbHandUpdate).
function pbPressStart(){
  if((!PB.run && !PB.tutorial) || PB.pressing) return;
  if(pbBrakeMode()){ pbStartBraking(); return; }   // checked before the waitingInput gate below,
                                                    // so braking always works once in brake mode
  if(PB.tutorial && !PBTUT.waitingInput) return;
  if(PB.hand) return;                       // already out of the van
  PB.pressing=true;
  pbBeginHand();
}
function pbPressEnd(){
  if(!PB.pressing) return;
  PB.pressing=false;
  if(PB.hand && (PB.hand.phase==="stop"||PB.hand.phase==="out")) pbFumble();
}
/* Committing walks this one up the path right away. The van brakes to a halt on its own from
   here; the cost is the ticking clock and the risk of letting go, not attention. */
function pbBeginHand(){
  const h=PB.houses[PB.nextIdx];
  if(!h || PB.hand) return;
  PB.hand={h, phase:"stop", t:0, from:PB.dist, tickN:0};
  PB.nextIdx++;                     // claimed the moment he commits, so it can't be attempted twice
  h.thrown=true;
  pbScreech(true);
  beep(300,.12,"square",.05);
}
// the payoff for walking it up: a guaranteed doormat, a customer who stays out on the step, and
// a tip far more often than not
function pbCompleteHand(h){
  PB.stats.perfect++;
  h.zone="doormat"; h.handed=true; h.customerOut=true; h.happyT=999;
  haptic([20,30,20]);
  if(Math.random()<PB_TIP_CHANCE){
    h.tip=PB_TIP_MIN+Math.floor(Math.random()*(PB_TIP_MAX-PB_TIP_MIN+1));
    PB.stats.tips+=h.tip;
    toast("HANDED OVER — +$"+h.tip+" TIP",1);
  } else toast("HANDED OVER",1);
  beep(880,.07); setTimeout(()=>beep(1180,.09),80); setTimeout(()=>beep(1480,.11),160);
}
// letting go while the box is still in hand: he trips, it tumbles the rest of the way there on
// its own — see pbHandUpdate's "fumble" phase for the resolution and pbDrawFumble for the visual
function pbFumble(){
  const H=PB.hand;
  if(!H || (H.phase!=="stop" && H.phase!=="out")) return;
  H.phase="fumble"; H.t=0;
  pbScreech(false);
  PB.shake=Math.max(PB.shake,0.4);
  haptic([50,40,80]);
  beep(160,.18,"sawtooth",.06); setTimeout(()=>beep(90,.22,"sawtooth",.07),90);
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
function pbTimeStr(sec){
  const m=Math.floor(sec/60), s=Math.floor(sec%60);
  return m+":"+(s<10?"0":"")+s;
}
function pbFinish(){
  if(!PB.active) return;               // both the rest and the crash schedule this — only once
  PB.run=false; PB.active=false;
  pbEngineStop();
  const s=PB.stats, total=PB.houses.length;
  const delivered=s.perfect;
  const gross = s.perfect*PB_PERFECT_PAY + s.tips
              + (PB.parked==="bay" ? PB_PARK_BONUS : 0);
  const deduction = s.fumble*PB_FUMBLE_PENALTY + s.miss*PB_MISS_PENALTY
                  + (PB.crashed ? PB_CRASH_PENALTY : 0);
  // the floor is zero: a bad shift pays nothing, but nobody ever pays to go to work
  const net=Math.max(0,gross-deduction);
  S.money+=net; S.earned+=net;
  const secs=PB.elapsed;
  const ratio=secs/PB_PAR_TIME;
  const timeRating = ratio<=0.8 ? "FLYING" : ratio<=1.0 ? "ON TIME" : ratio<=1.25 ? "BEHIND" : "SLOW";
  const timeCol = ratio<=1.0 ? "#3fdc7a" : ratio<=1.25 ? "#ffd94a" : "#f22";
  // grade weighs the round as a whole: what got delivered, what got fumbled, and the clock
  let score=(s.perfect*2 - s.fumble*4 - s.miss*1.5)/total;
  if(ratio<=0.8) score+=0.35; else if(ratio>1.25) score-=0.35;
  if(PB.parked==="bay") score+=0.2;
  if(PB.crashed) score-=0.6;
  let grade;
  if(s.perfect===total && !PB.crashed && ratio<=1.0) grade="S";
  else if(score>=1.3) grade="A";
  else if(score>=0.9) grade="B";
  else if(score>=0.5) grade="C";
  else if(score>=0.1) grade="D";
  else grade="F";
  tickTodo("work");
  if(delivered>0) addXP(s.perfect);
  $("#resTitle").textContent="ROUTE COMPLETE — GRADE "+grade;
  $("#resTitle").style.color = (grade==="F"||grade==="D") ? "#f22" : "#fff";
  $("#resPortraitWrap").classList.remove("show");
  pbDrawReportIcon(grade);
  $("#resScore").textContent="$"+net;
  const parkLine = PB.crashed ? '<span style="color:#f22">CRASHED INTO THE WALL — −$'+PB_CRASH_PENALTY+'</span>'
    : PB.parked==="bay" ? '<span style="color:#3fdc7a">PARKED IN THE BAY — +$'+PB_PARK_BONUS+'</span>'
    : '<span style="color:#8a8a8a">STOPPED SHORT OF THE BAY</span>';
  $("#resLines").innerHTML=
    "DELIVERED "+delivered+"/"+total+"<br>"+
    s.fumble+" FUMBLED, "+s.miss+" MISSED"+(s.tips?" — $"+s.tips+" IN TIPS":"")+"<br>"+
    parkLine+"<br>"+
    'TIME '+pbTimeStr(secs)+' vs '+pbTimeStr(PB_PAR_TIME)+' — <span style="color:'+timeCol+'">'+timeRating+"</span><br>"+
    "GROSS $"+gross+" − $"+deduction+" DEDUCTIONS = <b>$"+net+"</b>";
  $("#result").classList.add("show");
  renderMeters();
  beep(700,.1); setTimeout(()=>beep(950,.1),120);
}
function updatePaperboy(dt){
  if(PB.settingsOpen) return;   // the world pauses while the shared settings panel covers it
  if(PB.tutorial){ pbTutorialUpdate(dt); return; }
  if(!PB.run) return;
  PB.shake=Math.max(0,PB.shake-dt);
  for(const hh of PB.houses){
    if(hh.angryT>0) hh.angryT=Math.max(0,hh.angryT-dt);
    // someone handed a parcel in person stays out on the step for the rest of the run
    if(hh.happyT>0 && !hh.customerOut) hh.happyT=Math.max(0,hh.happyT-dt);
  }

  PB.elapsed+=dt;
  pbEngineTick();
  pbTickSpeedLines(dt);
  if(PB.wobbleT>0){ PB.wobbleT=Math.max(0,PB.wobbleT-dt); }

  // --- hand delivery owns the van completely while it runs ---
  if(PB.hand){ pbHandUpdate(dt); return; }

  if(PB.phase==="stopping"){
    PB.speed=Math.max(0,PB.speed-PB_BRAKE_DECEL*dt);
    PB.dist+=PB.speed*dt;
    PB.shake=Math.max(PB.shake, 0.25+0.5*(PB.speed/PB_SPEED_MAX));
    if(PB.dist>=PB.roadEnd && PB.speed>0){ pbCrash(); return; }
    if(PB.speed<=0){ pbComeToRest(); }
    return;
  }

  PB.speed=Math.min(PB_SPEED_MAX, PB.speed+PB_SPEED_RAMP*dt);
  PB.dist+=PB.speed*dt;
  // the road itself rumbles harder the faster you take it
  PB.shake=Math.max(PB.shake, 0.10*Math.pow(clamp(PB.speed/PB_SPEED_MAX,0,1),2));

  if(PB.phase==="route"){
    const h=PB.houses[PB.nextIdx];
    if(h && !h.thrown && (PB.dist-h.worldDist)>PB_TOL.window){
      h.thrown=true; h.zone="miss";
      PB.stats.miss++;
      PB.nextIdx++;
      beep(150,.1);
    }
    if(PB.nextIdx>=PB.houses.length){
      PB.phase="approach";
      toast("END OF THE ROAD — TAP TO BRAKE",1);
      beep(420,.1); setTimeout(()=>beep(330,.14),120);
    }
  } else if(PB.phase==="approach"){
    // never braked at all: straight into the wall
    if(PB.dist>=PB.roadEnd){ pbCrash(); return; }
  }
}
/* The stop itself. Where the van's nose ends up decides whether that was a park or an overshoot,
   and either way it rocks on its springs for a beat before it settles — that wobble is the whole
   reason the stop feels like it had weight behind it. */
// skipFinish: the tutorial's own speed-and-brake finale reuses this exact same physics/audio/
// haptic feedback for a real-feeling stop, but it isn't a real paid route — nothing to score,
// so it skips scheduling the result screen and lets the tutorial's own step machine take over
function pbComeToRest(skipFinish){
  PB.speed=0; PB.braking=false; PB.phase="done";
  pbScreech(false);
  const z0=pbStopZoneStart();
  const inBay = PB.dist>=z0 && PB.dist<=PB.roadEnd;
  PB.parked = inBay ? "bay" : "short";
  PB.wobble=inBay?1:0.6; PB.wobbleT=inBay?1.15:0.8;
  PB.shake=0.55;
  haptic(inBay?[40,40,60]:[30]);
  if(inBay){ beep(760,.09); setTimeout(()=>beep(1020,.11),110); setTimeout(()=>beep(1360,.14),230); }
  else { beep(420,.12); setTimeout(()=>beep(330,.12),120); }
  if(!skipFinish) setTimeout(pbFinish, 1450);
}
function pbCrash(skipFinish){
  PB.dist=PB.roadEnd; PB.speed=0; PB.braking=false; PB.phase="done";
  PB.crashed=true; PB.parked="crash";
  pbScreech(false);
  PB.wobble=1.5; PB.wobbleT=1.5;
  PB.shake=1.4;
  haptic([90,50,90]);
  beep(90,.42,"sawtooth",.12); setTimeout(()=>beep(140,.3,"sawtooth",.08),70);
  if(!skipFinish) toast("INTO THE WALL!",1);
  if(!skipFinish) setTimeout(pbFinish, 1650);
}
/* Out of the van, up the path, hand it over, back again. Each leg is a fixed slice of time so the
   whole errand always costs the same — see PB_HAND. */
// how far into the whole errand this frame is — drives both the ticking countdown and the
// "give" transition below, so they always agree on exactly where things stand
function pbHandElapsed(){
  const H=PB.hand; if(!H) return 0;
  if(H.phase==="stop") return H.t;
  if(H.phase==="out")  return PB_HAND.stop+H.t;
  if(H.phase==="give") return PB_HAND.stop+PB_HAND.out+H.t;
  if(H.phase==="back") return PB_HAND.stop+PB_HAND.out+PB_HAND.give+H.t;
  return PB_HAND_TOTAL;
}
function pbHandUpdate(dt){
  const H=PB.hand, ph=H.phase;
  H.t+=dt;
  if(ph==="fumble"){ pbFumbleUpdate(dt); return; }
  if(ph==="stop"||ph==="out"){
    // the ticking countdown: a brisk, regular beep for as long as the box is still in his hands —
    // this is the whole risk window, so it's meant to read as tension building, not decoration
    const n=Math.floor(pbHandElapsed()/PB_HAND_TICK);
    if(n>H.tickN){ H.tickN=n; beep(1300,.03,"square",.02,{prio:0}); }
  }
  if(ph==="stop"){
    // brake AND draw level with the door: stopping wherever the hold happened to land would leave
    // the driver hiking half the street, so the van rolls up outside the house it's delivering to
    const target=H.h.worldDist;
    PB.speed=Math.max(0,PB.speed-PB_BRAKE_DECEL*0.75*dt);
    PB.dist += (target-PB.dist)*Math.min(1,dt*5.5);
    PB.shake=Math.max(PB.shake,0.3*(PB.speed/PB_SPEED_MAX));
    if(H.t>=PB_HAND.stop){
      PB.speed=0; PB.dist=target; pbScreech(false);
      PB.wobble=0.7; PB.wobbleT=0.6;
      H.phase="out"; H.t=0; H.stoppedAt=PB.dist;
    }
    return;
  }
  if(ph==="out"){
    // the box changes hands right here — from this point on letting go costs nothing, the
    // delivery is already locked in
    if(H.t>=PB_HAND.out){ H.phase="give"; H.t=0; pbCompleteHand(H.h); }
    return;
  }
  if(ph==="give"){
    if(H.t>=PB_HAND.give){ H.phase="back"; H.t=0; }
    return;
  }
  // "back" — once he's in, pull away and let the whole speed ramp start again from a standstill
  if(H.t>=PB_HAND.back){
    PB.hand=null; PB.speed=PB_SPEED0*0.4;
    beep(240,.1,"square",.05);
    if(PB.nextIdx>=PB.houses.length && PB.phase==="route"){
      PB.phase="approach";
      toast("END OF THE ROAD — TAP TO BRAKE",1);
    }
  }
}
/* He trips, sprawls for a beat, and the box rolls the rest of the way there on its own — then
   an angry customer, same as driving past without ever attempting the house. Incredibly simple
   on purpose: a fast, readable punishment, not a whole new animation system. */
function pbFumbleUpdate(dt){
  const H=PB.hand;
  if(H.t<PB_FUMBLE_TOTAL) return;
  const h=H.h;
  h.zone="fumble"; h.angryT=3.5;
  PB.stats.fumble++;
  toast("HE TRIPPED — PARCEL'S TOAST",1);
  beep(150,.14,"sawtooth",.05);
  PB.hand=null; PB.speed=PB_SPEED0*0.4;
  if(PB.nextIdx>=PB.houses.length && PB.phase==="route"){
    PB.phase="approach";
    toast("END OF THE ROAD — TAP TO BRAKE",1);
  }
}
// how far along the path the driver currently is, 0 at the van and 1 at the door
function pbHandWalkP(){
  const H=PB.hand; if(!H) return 0;
  if(H.phase==="stop") return 0;
  if(H.phase==="out")  return clamp(H.t/PB_HAND.out,0,1);
  if(H.phase==="give") return 1;
  return 1-clamp(H.t/PB_HAND.back,0,1);
}
/* Speed lines: short streaks flung backwards past the camera. They only start showing up once the
   van is genuinely moving, and both how many there are and how long they are climb with the
   speedometer, so the screen gets busier the harder you push. */
function pbTickSpeedLines(dt){
  const f=clamp((PB.speed-PB_SPEED0*0.7)/(PB_SPEED_MAX-PB_SPEED0*0.7),0,1);
  for(let i=PB.lines.length-1;i>=0;i--){
    const L=PB.lines[i];
    L.life-=dt; L.p+=dt*(1.6+f*2.4);
    if(L.life<=0||L.p>=1) PB.lines.splice(i,1);
  }
  if(f>0.05 && PB.lines.length<34 && Math.random()<f*0.9){
    PB.lines.push({ y:Math.random(), side:Math.random()<0.5?-1:1, off:0.25+Math.random()*0.9,
                    p:0, life:0.28+Math.random()*0.2, len:0.4+Math.random()*0.6 });
  }
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
  if(!PB.tutorial || PBTUT.step>=PBTUT_STEP.SPEED_RUN) pbDrawRoadEnd(ctx);
}
/* Everything at the far end of the street: the warning sign, the hatched bay you are trying to
   stop in, and the wall behind it that ends the run badly if you arrive still moving. All of it
   is drawn as part of the road so it slides toward you at the same rate as everything else and
   you can read the distance off it. */
function pbDrawRoadEnd(ctx){
  const R=PB_ROAD_HALF, z0=pbStopZoneStart(), end=PB.roadEnd;
  if(end-PB.dist>1400) return;
  // --- the bay: hatched box, brighter once it's the live target ---
  const live = PB.phase!=="route";
  pbQuad(ctx,[pbP(z0,-R,0),pbP(end,-R,0),pbP(end,R,0),pbP(z0,R,0)],
         live?"#2b2410":"#1b1b1b", live?"#ffd94a":"#555", 2);
  ctx.save(); ctx.globalAlpha=live?0.55:0.28;
  ctx.strokeStyle=live?"#ffd94a":"#666"; ctx.lineWidth=2;
  for(let x=z0;x<end;x+=22){
    const a=pbP(x,-R,0), b=pbP(x+16,R,0);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
  }
  ctx.restore();
  // --- the wall across the road ---
  const WH=52;
  pbQuad(ctx,[pbP(end,-R,0),pbP(end,R,0),pbP(end,R,WH),pbP(end,-R,WH)],"#1a1a1a","#f22",3);
  ctx.save(); ctx.globalAlpha=0.9;
  for(let i=0;i<5;i++){   // hazard chevrons
    const y=-R+(2*R)*(i/5);
    pbQuad(ctx,[pbP(end,y,6),pbP(end,y+(2*R)/10,6),pbP(end,y+(2*R)/10,WH-6),pbP(end,y,WH-6)],
           i%2?"#f22":"#111",null);
  }
  ctx.restore();
}
/* The sign is depth-sorted along with the houses and the van rather than painted with the road,
   so driving past it puts the van in front of it exactly when it should. */
function pbDrawSlowSign(ctx){
  const R=PB_ROAD_HALF, signX=pbStopZoneStart()-PB_SIGN_LEAD;
  {
    const sy=R+22, postTop=54;
    const base=pbP(signX,sy,0), top=pbP(signX,sy,postTop);
    ctx.strokeStyle="#999"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(base[0],base[1]); ctx.lineTo(top[0],top[1]); ctx.stroke();
    const blink = PB.phase==="route" ? 1 : (Math.floor(performance.now()/260)%2 ? 1 : 0.45);
    ctx.save(); ctx.globalAlpha=blink;
    pbQuad(ctx,[pbP(signX-62,sy,postTop),pbP(signX+62,sy,postTop),
                pbP(signX+62,sy,postTop+52),pbP(signX-62,sy,postTop+52)],"#000","#ffd94a",3);
    const c=pbP(signX,sy,postTop+26);
    ctx.fillStyle="#ffd94a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("SLOW", c[0], c[1]-4);
    ctx.fillText("DOWN", c[0], c[1]+8);
    ctx.textAlign="left"; ctx.restore();
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
  const line = "#fff";
  // walls: the two camera-facing faces
  pbQuad(ctx,[pbP(x0,yhi,0),pbP(x1,yhi,0),pbP(x1,yhi,H),pbP(x0,yhi,H)],"#000",line,2);
  pbQuad(ctx,[pbP(x1,ylo,0),pbP(x1,yhi,0),pbP(x1,yhi,H),pbP(x1,ylo,H)],"#050505",line,2);
  // pitched roof — both slopes read from this angle, meeting at the ridge
  pbQuad(ctx,[pbP(x0,ylo,H),pbP(x1,ylo,H),pbP(x1,ymid,H+RH),pbP(x0,ymid,H+RH)],"#0a0a0a",line,2);
  pbQuad(ctx,[pbP(x0,yhi,H),pbP(x1,yhi,H),pbP(x1,ymid,H+RH),pbP(x0,ymid,H+RH)],"#000",line,2);
  pbQuad(ctx,[pbP(x1,ylo,H),pbP(x1,ymid,H+RH),pbP(x1,yhi,H)],"#050505",line,2);
  // window on the down-right face
  const wy0=ymid-15, wy1=ymid+15, wz0=H*0.34, wz1=H*0.70;
  pbQuad(ctx,[pbP(x1,wy0,wz0),pbP(x1,wy1,wz0),pbP(x1,wy1,wz1),pbP(x1,wy0,wz1)],"#9cf","#ccc",1.5);
  // big door number across the wide down-left face
  const c=pbP((x0+x1)/2,yhi,H*0.52);
  const bad = h.zone==="miss"||h.zone==="fumble";
  pbFaceText(ctx,c[0],c[1],PB_IX,PB_IY,""+h.doorNum,17, bad?"#f22":"#fff");
  // delighted customer — comes out, waves, and shows the tip if they left one
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
const PB_VAN_L=42;
// a decaying rock on the suspension — driven by whatever last jolted it (a stop, a crash) and
// dying away over its own timer, so the van visibly settles rather than freezing dead still
function pbVanRock(){
  if(PB.wobbleT<=0) return 0;
  return PB.wobble*PB.wobbleT*Math.sin(performance.now()/1000*17);
}
function pbDrawVan(ctx,t){
  const braking = PB.braking?1:0;
  const L=PB_VAN_L, Wd=26, Hh=34;
  const x0=PB.dist-L/2, x1=PB.dist+L/2, y0=-Wd/2, y1=Wd/2;
  const rock=pbVanRock();
  const anchor=pbP(PB.dist,0,0);
  ctx.save();
  if(Math.abs(rock)>0.001){    // pitch the whole body about where it meets the road
    ctx.translate(anchor[0],anchor[1]);
    ctx.rotate(rock*0.10);
    ctx.translate(0,-Math.abs(rock)*2.2);
    ctx.translate(-anchor[0],-anchor[1]);
  }
  const line = braking ? "#f22" : "#fff";
  pbQuad(ctx,[pbP(x0,y1,0),pbP(x1,y1,0),pbP(x1,y1,Hh),pbP(x0,y1,Hh)],"#000",line,2);
  pbQuad(ctx,[pbP(x1,y0,0),pbP(x1,y1,0),pbP(x1,y1,Hh),pbP(x1,y0,Hh)],"#050505",line,2);
  pbQuad(ctx,[pbP(x0,y0,Hh),pbP(x1,y0,Hh),pbP(x1,y1,Hh),pbP(x0,y1,Hh)],"#111",line,2);
  // windscreen on the leading face
  pbQuad(ctx,[pbP(x1,y0+4,Hh*0.42),pbP(x1,y1-4,Hh*0.42),pbP(x1,y1-4,Hh*0.82),pbP(x1,y0+4,Hh*0.82)],"#9cf","#ccc",1.5);
  if(braking){   // brake lights on the back panel, and rubber burning off both rear corners
    pbQuad(ctx,[pbP(x0,y0+3,Hh*0.30),pbP(x0,y0+9,Hh*0.30),pbP(x0,y0+9,Hh*0.52),pbP(x0,y0+3,Hh*0.52)],"#f22","#f66",1);
    pbQuad(ctx,[pbP(x0,y1-9,Hh*0.30),pbP(x0,y1-3,Hh*0.30),pbP(x0,y1-3,Hh*0.52),pbP(x0,y1-9,Hh*0.52)],"#f22","#f66",1);
    ctx.save(); ctx.globalAlpha=0.5;
    ctx.strokeStyle="#666"; ctx.lineWidth=4;
    for(const sy of [y0+4,y1-4]){
      const a=pbP(x0,sy,0), b=pbP(x0-70,sy,0);
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    }
    ctx.restore();
    for(let i=0;i<2;i++){       // smoke off the tyres
      const sy=(i?y1-4:y0+4), q=pbP(x0-6-Math.random()*18, sy, 2+Math.random()*10);
      ctx.save(); ctx.globalAlpha=0.10+Math.random()*0.18; ctx.fillStyle="#ddd";
      ctx.beginPath(); ctx.arc(q[0],q[1],4+Math.random()*7,0,7); ctx.fill(); ctx.restore();
    }
  }
  ctx.restore();
}
/* The driver, on foot. Only ever on screen during a hand delivery: he tracks along the same path
   the parcel would have flown down, box in hand on the way out and empty-handed on the way back. */
function pbDrawDriver(ctx,t){
  const H=PB.hand; if(!H || H.phase==="stop") return;
  if(H.phase==="fumble"){ pbDrawFumble(ctx); return; }
  const h=H.h, s=pbSideY(h.side), p=pbHandWalkP();
  const x=H.stoppedAt+(h.worldDist-H.stoppedAt)*p;
  const y=s*(PB_HOUSE_Y0-26)*p;
  const q=pbP(x,y,0);
  const step=Math.sin(t*13)*(p>0&&p<1?1:0);
  ctx.save(); ctx.translate(q[0],q[1]);
  ctx.fillStyle="rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(0,1,7,3,0,0,7); ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath(); ctx.arc(0,-25,5,0,7); ctx.fill();     // head
  ctx.fillRect(-4,-20,8,13);                              // body
  ctx.fillRect(-4,-7,3,7+step);                           // legs
  ctx.fillRect(1,-7,3,7-step);
  if(H.phase==="out"||H.phase==="stop"){                  // parcel still in his arms
    ctx.fillStyle="#eee"; ctx.fillRect(3,-19,9,8);
    ctx.fillStyle="#f22"; ctx.fillRect(3,-19,9,2);
    ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.strokeRect(3,-19,9,8);
  }
  ctx.restore();
}
/* The fumble: he trips a step or two out from the van and goes down, then the box — already
   loose — tumbles on toward the door by itself. Two flat beats, no walk cycle, nothing fancy. */
function pbDrawFumble(ctx){
  const H=PB.hand, h=H.h, s=pbSideY(h.side);
  const fallP=clamp(H.t/PB_FUMBLE.fall,0,1);
  const rollP=clamp((H.t-PB_FUMBLE.fall)/PB_FUMBLE.roll,0,1);
  const tripX=H.stoppedAt+(h.worldDist-H.stoppedAt)*0.15;
  const tripY=s*(PB_HOUSE_Y0-26)*0.15;
  const dq=pbP(tripX,tripY,0);
  ctx.save(); ctx.translate(dq[0],dq[1]); ctx.rotate(fallP*1.1);
  ctx.fillStyle="rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(5,4,9,3,0,0,7); ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath(); ctx.arc(5,-4,5,0,7); ctx.fill();       // head, pitched low and forward
  ctx.fillRect(-3,-8,10,9);                                // sprawled body
  ctx.restore();
  if(H.t>=PB_FUMBLE.fall){
    // the box, tumbling on toward the door on its own
    const bx=tripX+(h.worldDist-tripX)*rollP;
    const by=tripY+(s*(PB_HOUSE_Y0-4)-tripY)*rollP;
    const bq=pbP(bx,by,0);
    ctx.save(); ctx.translate(bq[0],bq[1]); ctx.rotate(rollP*24);
    ctx.fillStyle="#eee"; ctx.fillRect(-5,-4,10,8);
    ctx.fillStyle="#f22"; ctx.fillRect(-5,-4,10,2);
    ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.strokeRect(-5,-4,10,8);
    ctx.restore();
  }
}
// shared between the real HUD and the tutorial: the errand's status line, and — for as long as
// the box is still actually in his hands — the ticking countdown that's the whole point
function pbDrawHandStatus(ctx,w,h){
  const H=PB.hand; if(!H) return;
  if(H.phase==="fumble"){
    ctx.fillStyle="rgba(0,0,0,.75)"; ctx.fillRect(w*0.14,h*0.68,w*0.72,26);
    ctx.strokeStyle="#f22"; ctx.lineWidth=2; ctx.strokeRect(w*0.14,h*0.68,w*0.72,26);
    ctx.fillStyle="#f22"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("HE TRIPPED!", w/2, h*0.68+17);
    ctx.textAlign="left";
    return;
  }
  if(H.phase==="stop"||H.phase==="out"){
    const window=PB_HAND.stop+PB_HAND.out;
    const remain=Math.max(0, window-pbHandElapsed());
    const bw=w*0.6, bx=w/2-bw/2, by=h*0.65;
    const pulse=Math.floor(performance.now()/150)%2;
    ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(bx-6,by-18,bw+12,48);
    ctx.fillStyle=pulse?"#ffd94a":"#f22"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("DON'T LET GO…", w/2, by-5);
    ctx.strokeStyle="#ffd94a"; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,12);
    ctx.fillStyle="#ffd94a"; ctx.fillRect(bx,by,bw*clamp(remain/window,0,1),12);
    ctx.fillStyle="#ffd94a"; ctx.font="8px 'Press Start 2P',monospace";
    ctx.fillText(remain.toFixed(1)+"s", w/2, by+27);
    ctx.textAlign="left";
    return;
  }
  const lbl = H.phase==="give" ? "HANDING IT OVER" : "BACK TO THE VAN";
  ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(w*0.18,h*0.68,w*0.64,26);
  ctx.fillStyle="#3fdc7a"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText(lbl, w/2, h*0.68+17);
  ctx.textAlign="left";
}
function pbDrawHUD(ctx,w,h){
  const nextH=PB.houses[PB.nextIdx];
  ctx.fillStyle="rgba(0,0,0,.72)"; ctx.fillRect(0,0,96,84);
  ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText("NEXT", 12, 22);
  ctx.font="26px 'Press Start 2P',monospace";
  ctx.fillText(nextH ? ""+nextH.doorNum : "--", 12, 50);
  ctx.fillStyle="#f22"; ctx.fillRect(12,58,58,4);
  ctx.textAlign="right"; ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace";
  ctx.fillText(PB.nextIdx+"/"+PB.houses.length, w-12, 22);
  ctx.textAlign="left";
  pbDrawHandStatus(ctx,w,h);
  // the one instruction that matters once the parcels are gone
  if(PB.phase==="approach" && Math.floor(performance.now()/300)%2){
    ctx.fillStyle="rgba(0,0,0,.75)"; ctx.fillRect(w*0.16,h*0.55,w*0.68,30);
    ctx.strokeStyle="#f22"; ctx.lineWidth=2; ctx.strokeRect(w*0.16,h*0.55,w*0.68,30);
    ctx.fillStyle="#f22"; ctx.font="10px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("TAP TO BRAKE", w/2, h*0.55+20);
    ctx.textAlign="left";
  }
  if(PB.phase==="done"){
    const msg = PB.crashed ? "CRASHED" : PB.parked==="bay" ? "PARKED!" : "STOPPED SHORT";
    const col = PB.crashed ? "#f22" : PB.parked==="bay" ? "#3fdc7a" : "#ffd94a";
    ctx.fillStyle="rgba(0,0,0,.8)"; ctx.fillRect(w*0.2,h*0.44,w*0.6,34);
    ctx.strokeStyle=col; ctx.lineWidth=3; ctx.strokeRect(w*0.2,h*0.44,w*0.6,34);
    ctx.fillStyle=col; ctx.font="13px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(msg, w/2, h*0.44+23);
    ctx.textAlign="left";
  }
}
/* Speed lines. Drawn in screen space rather than world space so they read as motion blur past the
   camera rather than as objects in the street; they thicken, lengthen and brighten together as the
   speedometer climbs, which is most of why fast feels fast. */
function pbDrawSpeedLines(ctx,w,h){
  const f=clamp((PB.speed-PB_SPEED0*0.7)/(PB_SPEED_MAX-PB_SPEED0*0.7),0,1);
  if(f<=0.02 || !PB.lines.length) return;
  ctx.save();
  ctx.lineCap="round";
  for(const L of PB.lines){
    const fade=Math.sin(Math.min(1,L.p)*Math.PI);
    const x = w*(1.05 - L.p*1.25);
    const y = h*(0.10+L.y*0.74);
    const len = w*0.10*L.len*(0.4+f);
    ctx.globalAlpha=0.10+0.55*fade*f;
    ctx.strokeStyle = f>0.8 ? "#ffd94a" : "#fff";
    ctx.lineWidth=1+2.5*f*L.len;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+len,y); ctx.stroke();
  }
  ctx.restore();
}
/* Speedometer, bottom-right: a dial that sweeps 200° with a red band up top, the needle riding the
   real PB.speed, and the number spelled out underneath. Goes gold once the van is genuinely flat out. */
function pbDrawSpeedo(ctx,w,h){
  const r=34, cx=w-r-16, cy=h-r-52;
  const f=clamp(PB.speed/PB_SPEED_MAX,0,1);
  const A0=Math.PI*0.80, A1=Math.PI*2.20;      // sweep, measured clockwise from the left
  const hot=f>0.86;
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.72)";
  ctx.beginPath(); ctx.arc(cx,cy,r+4,0,7); ctx.fill();
  ctx.strokeStyle=hot?"#ffd94a":"#666"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(cx,cy,r+4,0,7); ctx.stroke();
  // track, then the red line at the top end
  ctx.strokeStyle="#333"; ctx.lineWidth=6;
  ctx.beginPath(); ctx.arc(cx,cy,r-5,A0,A1); ctx.stroke();
  ctx.strokeStyle="#5a1414";
  ctx.beginPath(); ctx.arc(cx,cy,r-5,A0+(A1-A0)*0.86,A1); ctx.stroke();
  // the live sweep
  ctx.strokeStyle=hot?"#f22":"#3fdc7a"; ctx.lineWidth=6;
  ctx.beginPath(); ctx.arc(cx,cy,r-5,A0,A0+(A1-A0)*f); ctx.stroke();
  // ticks
  ctx.strokeStyle="#888"; ctx.lineWidth=1.5;
  for(let i=0;i<=5;i++){
    const a=A0+(A1-A0)*(i/5);
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*(r-12), cy+Math.sin(a)*(r-12));
    ctx.lineTo(cx+Math.cos(a)*(r-16), cy+Math.sin(a)*(r-16));
    ctx.stroke();
  }
  // needle
  const na=A0+(A1-A0)*f;
  ctx.strokeStyle=hot?"#ffd94a":"#fff"; ctx.lineWidth=2.5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(na)*(r-11), cy+Math.sin(na)*(r-11)); ctx.stroke();
  ctx.fillStyle=hot?"#ffd94a":"#fff";
  ctx.beginPath(); ctx.arc(cx,cy,3,0,7); ctx.fill();
  ctx.fillStyle=hot?"#ffd94a":"#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText(Math.round(PB.speed), cx, cy+16);
  ctx.font="5px 'Press Start 2P',monospace"; ctx.fillStyle="#8a8a8a";
  ctx.fillText("MPH", cx, cy+25);
  ctx.textAlign="left";
  ctx.restore();
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
    if(hh.zone==="doormat"){ fill="#3fdc7a"; stroke="#0a5c2c"; }
    else if(hh.zone==="fumble"||hh.zone==="miss"){ fill="#f22"; stroke="#7a0000"; }
    ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=1;
    ctx.fillRect(x-3,y0,6,barH); ctx.strokeRect(x-3,y0,6,barH);
  }
  if(Math.floor(performance.now()/220)%2){
    const x=xAt(PB.dist);
    ctx.fillStyle="#ffd94a";
    ctx.beginPath(); ctx.arc(x,y0+barH/2,4,0,7); ctx.fill();
  }
}
// The tutorial reuses the real house/van/hand-delivery code path directly — the van is simply
// eased to a dead stop exactly on the house's worldDist first, so holding always works from the
// very start (see DRIVE_TO_1). A fumble here just resets the house and asks for another try
// rather than failing the tutorial outright — the mistake itself is the lesson.
function pbTutorialStart(){
  const doorStart=20+Math.floor(Math.random()*70);
  const h1={doorNum:doorStart, side:Math.random()<0.5?"L":"R", worldDist:PB_HOUSE_GAP*1, thrown:false, zone:null, angryT:0, happyT:0, tip:0};
  Object.assign(PB,{
    // same formula pbNewRoute uses for the real street, just off the tutorial's own one house —
    // a short, snappy stretch to the bay, not a long empty drive
    houses:[h1], decoys:[], nextIdx:0, dist:0, speed:0,
    pressing:false, shake:0,
    phase:"route", hand:null, braking:false, wobble:0, wobbleT:0, crashed:false, parked:null,
    roadEnd:h1.worldDist+PB_SIGN_LEAD+PB_STOP_ZONE_LEN+140, elapsed:0, lines:[],
    stats:{perfect:0, fumble:0, miss:0, tips:0},
    tutorial:true, active:true, run:false
  });
  Object.assign(PBTUT,{step:PBTUT_STEP.DRIVE_TO_1, stepT:0, arrowPulse:0, waitingInput:false, bannerT:0, houseIdx:0, target:h1.worldDist});
}
function pbTutorialUpdate(dt){
  PB.shake=Math.max(0,PB.shake-dt);
  for(const hh of PB.houses){
    if(hh.angryT>0) hh.angryT=Math.max(0,hh.angryT-dt);
    // someone handed a parcel in person stays out on the step for the rest of the run
    if(hh.happyT>0 && !hh.customerOut) hh.happyT=Math.max(0,hh.happyT-dt);
  }
  const S_=PBTUT_STEP, st=PBTUT.step;
  if(st===S_.DRIVE_TO_1){
    PBTUT.stepT+=dt;
    PB.dist += (PBTUT.target-PB.dist)*Math.min(1,dt*2.2);
    if(Math.abs(PBTUT.target-PB.dist)<0.6 || PBTUT.stepT>4){
      PB.dist=PBTUT.target;
      PBTUT.step=S_.TEACH_HOLD; PBTUT.stepT=0; PBTUT.waitingInput=true;
    }
  } else if(st===S_.TEACH_HOLD){
    PBTUT.arrowPulse+=dt;
    // hand delivery, once committed, runs on exactly the same code as the real route — including
    // a fumble, which just resets the house and gives it a beat before letting them try again
    if(PB.hand){
      pbHandUpdate(dt);
      if(!PB.hand){
        const h=PB.houses[0];
        if(h.zone==="doormat"){ PBTUT.waitingInput=false; PBTUT.step=S_.CELEBRATE_1; PBTUT.stepT=0; }
        else { h.thrown=false; h.zone=null; PB.nextIdx=0; PBTUT.waitingInput=false; PBTUT.stepT=0; }
      }
      return;
    }
    if(!PBTUT.waitingInput){
      PBTUT.stepT+=dt;
      if(PBTUT.stepT>0.9) PBTUT.waitingInput=true;   // a beat after a fumble before trying again
    }
  } else if(st===S_.CELEBRATE_1){
    PBTUT.stepT+=dt;
    if(PBTUT.stepT>1.2){
      PBTUT.step=S_.SPEED_RUN; PBTUT.stepT=0;
      PB.phase="approach";   // no parcels left — every remaining tap is the brake, same as a real route
      toast("BUILD SPEED, THEN BRAKE FOR THE BAY",1);
    }
  } else if(st===S_.SPEED_RUN){
    // one last stretch, played out on the exact same physics as the end of a real route: the
    // speedometer climbs, the SLOW DOWN sign and bay appear, and braking too late means the wall
    PBTUT.stepT+=dt;
    if(PB.phase==="done"){
      if(PBTUT.stepT>1.4){ PBTUT.step=S_.COMPLETE; PBTUT.stepT=0; PBTUT.bannerT=0; }
      return;
    }
    if(PB.phase==="stopping"){
      PB.speed=Math.max(0,PB.speed-PB_BRAKE_DECEL*dt);
      PB.dist+=PB.speed*dt;
      PB.shake=Math.max(PB.shake, 0.25+0.5*(PB.speed/PB_SPEED_MAX));
      if(PB.dist>=PB.roadEnd && PB.speed>0){ pbCrash(true); PBTUT.stepT=0; return; }
      if(PB.speed<=0){ pbComeToRest(true); PBTUT.stepT=0; }
      return;
    }
    PB.speed=Math.min(PB_SPEED_MAX, PB.speed+PB_SPEED_RAMP*dt);
    PB.dist+=PB.speed*dt;
    PB.shake=Math.max(PB.shake, 0.10*Math.pow(clamp(PB.speed/PB_SPEED_MAX,0,1),2));
    if(PB.dist>=PB.roadEnd){ pbCrash(true); PBTUT.stepT=0; }
  } else if(st===S_.COMPLETE){
    PBTUT.bannerT+=dt;
    if(PBTUT.bannerT>2.0){
      S.pbTutorialDone=true; PB.tutorial=false;
      pbNewRoute(); PB.active=true; PB.run=true;
      pbEngineStart();
      toast("HOLD TO DELIVER — DON'T LET GO TOO EARLY!",1);
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
  if(PB.hand) drawables.push({d:PB.dist+11, f:()=>pbDrawDriver(ctx,t)});
  // the last stretch reuses the real route's own SLOW DOWN sign, sorted into the scene exactly
  // the same way drawPaperboy does it
  if(st===S_.SPEED_RUN||st===S_.COMPLETE){
    const sx=pbStopZoneStart()-PB_SIGN_LEAD;
    if(sx-PB.dist>-260 && sx-PB.dist<1400) drawables.push({d:sx+PB_ROAD_HALF+22, f:()=>pbDrawSlowSign(ctx)});
  }
  drawables.sort((a,b)=>a.d-b.d);
  for(const dd of drawables) dd.f();
  pbDrawHandStatus(ctx,w,h);
  if(st===S_.SPEED_RUN||st===S_.COMPLETE){ pbDrawSpeedLines(ctx,w,h); pbDrawSpeedo(ctx,w,h); }

  let title="", sub="";
  if(st===S_.DRIVE_TO_1) title="DRIVING TO THE HOUSE...";
  else if(st===S_.TEACH_HOLD){ title="HOLD TO DELIVER"; sub="DON'T LET GO UNTIL HE'S BACK IN THE VAN"; }
  else if(st===S_.CELEBRATE_1) title="HANDED OVER!";
  else if(st===S_.SPEED_RUN){
    if(PB.phase==="done"){
      title = PB.crashed ? "INTO THE WALL!" : PB.parked==="bay" ? "PARKED PERFECTLY!" : "STOPPED — CLOSE ENOUGH";
      sub = PB.crashed ? "EASE OFF THE BRAKE A LITTLE EARLIER NEXT TIME" : "";
    } else { title="ONE LAST STRETCH"; sub="BUILD SPEED, THEN TAP TO BRAKE FOR THE BAY"; }
  }
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

  if(PBTUT.waitingInput && !PB.hand && st===S_.TEACH_HOLD){
    const pulse=0.85+0.15*Math.sin(PBTUT.arrowPulse*5);
    const cx=w/2, cy=h*0.5;
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(pulse,pulse);
    ctx.strokeStyle="#ffd94a"; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(0,0,22,0,7); ctx.stroke();
    ctx.fillStyle="#ffd94a"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("HOLD", 0, 4);
    ctx.textAlign="left";
    ctx.restore();
  }
}
function drawPaperboy(t){
  const [ctx,w,h]=fit($("#paperboycv"));
  ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
  PB.camX = w*0.36 + (Math.random()-0.5)*PB.shake*7;
  PB.camY = h*0.26 + (Math.random()-0.5)*PB.shake*7;
  // end run only makes sense on the real paid route, never the two-house tutorial
  $("#pbEndRunBtn").style.display = PB.run ? "" : "none";
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
  // painter's order: farther from the camera (smaller x+y) draws first
  const drawables=[];
  for(const hh of [...PB.houses, ...PB.decoys]){
    if(Math.abs(hh.worldDist-PB.dist)>900) continue;
    const yhi=Math.max(pbSideY(hh.side)*PB_HOUSE_Y0, pbSideY(hh.side)*(PB_HOUSE_Y0+PB_HOUSE_DEPTH));
    drawables.push({d:hh.worldDist+yhi, f:()=>pbDrawHouse(ctx,hh,t)});
  }
  drawables.push({d:PB.dist+10, f:()=>pbDrawVan(ctx,t)});
  if(PB.hand) drawables.push({d:PB.dist+11, f:()=>pbDrawDriver(ctx,t)});
  {
    const sx=pbStopZoneStart()-PB_SIGN_LEAD;
    if(sx-PB.dist>-260 && sx-PB.dist<1400) drawables.push({d:sx+PB_ROAD_HALF+22, f:()=>pbDrawSlowSign(ctx)});
  }
  drawables.sort((a,b)=>a.d-b.d);
  for(const dd of drawables) dd.f();
  pbDrawSpeedLines(ctx,w,h);
  pbDrawHUD(ctx,w,h);
  pbDrawSpeedo(ctx,w,h);
  pbDrawMinimap(ctx,w,h);
}
(function(){
  // One action, two equivalent inputs: press and hold anywhere on the route view, or the HOLD
  // button below it. Releasing early — while the box is still in his hands — is what fumbles it.
  const cv=$("#paperboycv");
  cv.addEventListener("pointerdown",e=>{
    if(!PB.run && !PB.tutorial) return;
    e.preventDefault();
    pbPressStart();
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
  });
  cv.addEventListener("pointerup",()=>pbPressEnd());
  cv.addEventListener("pointercancel",()=>pbPressEnd());
  const bh=$("#bHold");
  bh.addEventListener("pointerdown",e=>{ e.preventDefault(); pbPressStart(); });
  bh.addEventListener("pointerup",()=>pbPressEnd());
  bh.addEventListener("pointercancel",()=>pbPressEnd());
  document.addEventListener("keydown",e=>{
    if(MODE!=="paperboy") return;
    if(e.code==="Space"||e.code==="ArrowLeft"||e.code==="ArrowRight") pbPressStart();
  });
  document.addEventListener("keyup",e=>{
    if(MODE!=="paperboy") return;
    if(e.code==="Space"||e.code==="ArrowLeft"||e.code==="ArrowRight") pbPressEnd();
  });
  // settings + end run, top-left of the HUD — end run only makes sense on the real paid route,
  // not the two-house tutorial, so it's hidden there (see the display toggle in drawPaperboy)
  $("#pbSettingsBtn").addEventListener("click",()=>{
    PB.settingsOpen=true;
    if(PB.run) pbEngineStop();   // don't let the engine drone on under the menu melody
    renderSettings();
    $("#settingsPanel").classList.add("show");
    beep(500,.05);
  });
  $("#pbEndRunBtn").addEventListener("click",()=>{
    if(!PB.run) return;
    beep(300,.06);
    openChoice("END THE ROUTE?",
      "YOU'LL BE PAID FOR EVERYTHING ALREADY DELIVERED, THEN HEAD HOME.",
      "YES, END ROUTE", ()=>{ pbFinish(); },
      "KEEP DRIVING", null);
  });
})();
