"use strict";
const $ = q => document.querySelector(q);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const DPR = Math.min(2, window.devicePixelRatio||1);

/* ---------- audio ----------
   A burning grove full of squirrels can ask for dozens of sounds in the same handful of
   milliseconds. Every voice used to be built raw and wired straight to the destination, which
   caused three separate problems at once: the summed signal ran past full scale and crackled,
   oscillators starting and stopping at full amplitude clicked, and the sounds that actually
   matter (taking a hit, a wave ending, a purchase) were buried under incidental chatter.

   The fix is the standard game-audio arrangement:
     - one limiter on the master so stacked voices compress instead of clipping
     - separate buses, so critical sounds can duck the busy layer rather than compete with it
     - a polyphony ceiling, with the least important voices dropped first under load
     - coalescing, so thirty identical chirps in one instant become one chirp
     - a short attack/release on every voice, which is what removes the clicking
   Priorities: 0 = incidental chatter, 1 = normal, 2 = critical (never dropped, always ducks). */
let AC=null, MASTER=null, SFXBUS=null, PRIOBUS=null, MUSICBUS=null;
const SFX_MAX_VOICES=16;     // hard polyphony ceiling
const SFX_COALESCE=0.055;    // seconds — identical sounds inside this window collapse into one
const SFX_LAST=Object.create(null);
// Voices are tracked by when they finish on the audio clock rather than by a timer. A timer-based
// release stops running the moment the main thread is busy — exactly when the park is at its
// loudest — which would leak the voice count upward and silence the game until it caught up.
const SFX_ENDS=[];
function sfxActive(now){
  while(SFX_ENDS.length && SFX_ENDS[0]<=now) SFX_ENDS.shift();
  return SFX_ENDS.length;
}
function audioInit(){
  if(AC) return AC;
  AC = new (window.AudioContext||window.webkitAudioContext)();
  MASTER=AC.createDynamicsCompressor();
  // limiter-shaped: hard ratio, no knee, fast attack — catches transient stacks without pumping
  MASTER.threshold.value=-10; MASTER.knee.value=0; MASTER.ratio.value=20;
  MASTER.attack.value=0.003; MASTER.release.value=0.25;
  MASTER.connect(AC.destination);
  SFXBUS=AC.createGain();   SFXBUS.gain.value=1;   SFXBUS.connect(MASTER);
  PRIOBUS=AC.createGain();  PRIOBUS.gain.value=1;  PRIOBUS.connect(MASTER);
  MUSICBUS=AC.createGain(); MUSICBUS.gain.value=1; MUSICBUS.connect(MASTER);
  return AC;
}
function sfxOut(prio){ return prio>=2 ? PRIOBUS : SFXBUS; }
// a critical sound briefly pushes the busy layer down, so it cuts through a swarm instead of
// being one more voice inside it
function sfxDuck(){
  if(!AC) return;
  const t=AC.currentTime;
  for(const [bus,to,back] of [[SFXBUS,0.38,0.34],[MUSICBUS,0.45,0.40]]){
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value,t);
    bus.gain.linearRampToValueAtTime(to,t+0.02);
    bus.gain.linearRampToValueAtTime(1,t+back);
  }
}
function sfxAllow(key,prio,now){
  const live=sfxActive(now);
  if(prio>=2){ SFX_LAST[key]=now; return true; }        // critical always speaks
  const last=SFX_LAST[key];
  if(last!=null && now-last<SFX_COALESCE) return false;  // the same sound, the same instant
  if(live>=SFX_MAX_VOICES) return false;
  if(prio<=0 && live>=SFX_MAX_VOICES*0.55) return false;   // chatter yields first
  SFX_LAST[key]=now;
  return true;
}
function sfxVoice(endT){
  SFX_ENDS.push(endT);
  SFX_ENDS.sort((a,b)=>a-b);      // at most a handful of entries, so this stays trivial
}
function beep(f=440,d=.06,type="square",g=.04,opt){
  if(!SETTINGS.sound) return;
  try{
    audioInit();
    const prio = opt && opt.prio!=null ? opt.prio : 1;
    // sounds group by timbre and rough pitch, so near-identical chirps coalesce automatically
    // without every one of the hundred call sites having to name itself
    const key = (opt && opt.key) || (type+"|"+Math.round(f/60));
    const now=AC.currentTime;
    if(!sfxAllow(key,prio,now)) return;
    if(prio>=2) sfxDuck();
    const o=AC.createOscillator(), gn=AC.createGain();
    o.type=type; o.frequency.value=f;
    // a few ms of attack and release: a square wave switched on at full amplitude clicks, and
    // thirty of those at once is most of what "harsh when it gets busy" actually was
    const atk=Math.min(0.006,d*0.25), rel=Math.min(0.02,d*0.35);
    gn.gain.setValueAtTime(0.0001,now);
    gn.gain.linearRampToValueAtTime(g,now+atk);
    gn.gain.setValueAtTime(g,now+Math.max(atk,d-rel));
    gn.gain.linearRampToValueAtTime(0.0001,now+d);
    o.connect(gn); gn.connect(sfxOut(prio));
    o.start(now); o.stop(now+d+0.02);
    sfxVoice(now+d+0.02);
  }catch(e){}
}
// a short burst of filtered noise — the breathy "chuff" texture layered under bark() and
// other percussive hits, so they don't read as pure tone
function noiseBurst(dur,freq,q,gain,t0){
  const buf=AC.createBuffer(1, Math.max(1,Math.floor(AC.sampleRate*dur)), AC.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length);
  const src=AC.createBufferSource(); src.buffer=buf;
  const f=AC.createBiquadFilter(); f.type="bandpass"; f.frequency.value=freq; f.Q.value=q;
  const g=AC.createGain(); g.gain.setValueAtTime(gain,t0); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  src.connect(f); f.connect(g); g.connect(PRIOBUS);
  src.start(t0);
}
// a real synthesised woof — a fast downward sawtooth sweep (the tonal body) layered with a
// bandpassed noise burst (the breathy chuff) — instead of a flat beep standing in for a bark.
// strength scales pitch + noise brightness so DOGPARK's rapid-fire barks can read a little
// smaller/tighter than Bones' full home-screen woof.
function bark(strength=1){
  if(!SETTINGS.sound) return;
  try{
    audioInit();
    const t0=AC.currentTime;
    const o=AC.createOscillator(), og=AC.createGain();
    o.type="sawtooth";
    o.frequency.setValueAtTime(360*strength,t0);
    o.frequency.exponentialRampToValueAtTime(115*strength,t0+0.11);
    og.gain.setValueAtTime(0.0001,t0);
    og.gain.exponentialRampToValueAtTime(0.24,t0+0.012);
    og.gain.exponentialRampToValueAtTime(0.0001,t0+0.15);
    o.connect(og); og.connect(PRIOBUS);
    o.start(t0); o.stop(t0+0.17);
    noiseBurst(0.1, 950*strength, 0.9, 0.14, t0);
  }catch(e){}
}
function sfxLevelUp(){
  if(!SETTINGS.sound) return;
  try{
    audioInit();
    const t0=AC.currentTime;
    const notes=[523.25,659.25,783.99,1046.5];   // C5 E5 G5 C6 — a clean major fanfare
    notes.forEach((f,i)=>{
      const t=t0+i*0.09, last=i===notes.length-1;
      const o=AC.createOscillator(), g=AC.createGain();
      o.type = last ? "triangle" : "square";
      o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.09,t+0.015);
      g.gain.exponentialRampToValueAtTime(0.0001,t+(last?0.35:0.13));
      o.connect(g); g.connect(PRIOBUS);
      o.start(t); o.stop(t+(last?0.38:0.16));
    });
  }catch(e){}
}
function sfxSick(){
  if(!SETTINGS.sound) return;
  try{
    audioInit();
    const t0=AC.currentTime;
    const o=AC.createOscillator(), g=AC.createGain();
    o.type="sawtooth";
    o.frequency.setValueAtTime(220,t0);
    o.frequency.exponentialRampToValueAtTime(70,t0+0.55);
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(0.1,t0+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+0.6);
    o.connect(g); g.connect(PRIOBUS);
    o.start(t0); o.stop(t0+0.62);
  }catch(e){}
}
function sfxBetter(){
  if(!SETTINGS.sound) return;
  try{
    audioInit();
    const t0=AC.currentTime;
    [520,700,900].forEach((f,i)=>{
      const t=t0+i*0.07;
      const o=AC.createOscillator(), g=AC.createGain();
      o.type="triangle"; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.08,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.14);
      o.connect(g); g.connect(PRIOBUS); o.start(t); o.stop(t+0.16);
    });
  }catch(e){}
}
// the one moment in the whole game that should feel heaviest — a slow, solemn descent instead
// of the usual bright arcade beeps
function sfxGoodbye(){
  if(!SETTINGS.sound) return;
  try{
    audioInit();
    const t0=AC.currentTime;
    const notes=[392,349.23,293.66,261.63];   // G4 F4 D4 C4 — a slow, solemn descent
    notes.forEach((f,i)=>{
      const t=t0+i*0.55;
      const o=AC.createOscillator(), g=AC.createGain();
      o.type="sine"; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.1,t+0.08); g.gain.exponentialRampToValueAtTime(0.0001,t+0.9);
      o.connect(g); g.connect(PRIOBUS); o.start(t); o.stop(t+0.95);
    });
  }catch(e){}
}
function haptic(pattern){
  try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
}
/* ---------- background music: a small looping chiptune bed, purely procedural ---------- */
const MUSIC_BASS=[110,110,98,110, 87.31,87.31,98,110];        // A2 A2 G2 A2 F2 F2 G2 A2
const MUSIC_ARP=[220,277.18,329.63,440];                       // A3 C#4 E4 A4
const MUSIC_BEAT=380;                  // ms per step — the title sequence lands its letters on this
let musicTimer=null, musicStep=0;
// 0..1, scaled into every note this melody plays. The title sequence brings it up from silence;
// it lives here rather than on MUSICBUS so it can never collide with sfxDuck's own gain schedule.
let MUSIC_FADE=1;
function musicTick(){
  if(!SETTINGS.music || !SETTINGS.sound) return;
  if(MUSIC_FADE<=0.001) { musicStep++; return; }
  try{
    audioInit();
    const t0=AC.currentTime;
    const bo=AC.createOscillator(), bg=AC.createGain();
    bo.type="triangle"; bo.frequency.value=MUSIC_BASS[musicStep%MUSIC_BASS.length];
    bg.gain.setValueAtTime(0.0001,t0); bg.gain.exponentialRampToValueAtTime(0.05*MUSIC_FADE,t0+0.02); bg.gain.exponentialRampToValueAtTime(0.0001,t0+0.34);
    bo.connect(bg); bg.connect(MUSICBUS); bo.start(t0); bo.stop(t0+0.36);

    const ao=AC.createOscillator(), ag=AC.createGain();
    ao.type="square"; ao.frequency.value=MUSIC_ARP[musicStep%MUSIC_ARP.length];
    ag.gain.setValueAtTime(0.0001,t0); ag.gain.exponentialRampToValueAtTime(0.022*MUSIC_FADE,t0+0.01); ag.gain.exponentialRampToValueAtTime(0.0001,t0+0.16);
    ao.connect(ag); ag.connect(MUSICBUS); ao.start(t0); ao.stop(t0+0.18);

    musicStep++;
  }catch(e){}
}
function fadeMelodyIn(ms){
  MUSIC_FADE=0;
  const steps=Math.max(1,Math.round(ms/60)); let i=0;
  const id=setInterval(()=>{ i++; MUSIC_FADE=Math.min(1,i/steps); if(i>=steps) clearInterval(id); },60);
}
function startMusic(){ if(!musicTimer) musicTimer=setInterval(musicTick,MUSIC_BEAT); }
function stopMusic(){ if(musicTimer){ clearInterval(musicTimer); musicTimer=null; } }

/* ---------- DOGCAM ambient loop: a real track for when things are good ----------
   The procedural bed above is the fallback for everywhere a mood-specific track doesn't exist
   yet (bad mood/sick — still planned). Two real ones exist now: a relaxed chiptune loop for
   hanging out with BONES on the home screen while he's actually doing well, and a driving one
   for DOGPARK runs. */
const TRACK_VOL=0.42;
const MOOD_AUDIO = new Audio(MUSIC_GOODMOOD);
MOOD_AUDIO.loop = true; MOOD_AUDIO.volume = TRACK_VOL; MOOD_AUDIO.preload = "auto";
let moodMusicOn = false;
const MOOD_AUDIO_PARK = new Audio(MUSIC_DOGPARK);
MOOD_AUDIO_PARK.loop = true; MOOD_AUDIO_PARK.volume = TRACK_VOL; MOOD_AUDIO_PARK.preload = "auto";
let parkMusicOn = false;
/* Cross-context switches used to cut a track dead the instant MODE changed, so leaving DOGCAM for
   a run clipped one loop off mid-bar while the next one started underneath it. Every start/stop
   below goes through these instead: the outgoing track rides its volume down and only then pauses,
   the incoming one comes up from silence, and each track owns a single timer so a fast
   back-and-forth (home -> park -> home) can never leave two fades fighting over the same element. */
const AUDIO_FADES=new WeakMap();
function fadeAudio(a, to, ms, thenPause){
  clearInterval(AUDIO_FADES.get(a));
  const from=a.volume, steps=Math.max(1,Math.round(ms/40));
  let i=0;
  const id=setInterval(()=>{
    i++;
    a.volume=clamp(from+(to-from)*(i/steps),0,1);
    if(i>=steps){
      clearInterval(id); AUDIO_FADES.delete(a);
      if(thenPause){ a.pause(); a.volume=TRACK_VOL; }
    }
  },40);
  AUDIO_FADES.set(a,id);
}
/* play() resolves a frame or two late, which is long enough for a fast context switch (closing
   Settings straight into a park run) to have already asked this same track to fade out. Without a
   token the stale resolve would cancel that fade-out and pull the track back up — two tracks
   playing at once, which is the exact thing the fades exist to prevent. Every start/stop takes a
   fresh token, and a resolve holding a stale one does nothing. */
const AUDIO_GEN=new WeakMap();
function bumpGen(a){ const g=(AUDIO_GEN.get(a)||0)+1; AUDIO_GEN.set(a,g); return g; }
function trackIn(a){
  clearInterval(AUDIO_FADES.get(a)); AUDIO_FADES.delete(a);
  const gen=bumpGen(a);
  a.volume=0;
  a.play().then(()=>{
    if(AUDIO_GEN.get(a)!==gen) return;    // something else took the room while we were starting
    fadeAudio(a,TRACK_VOL,420,false);
  }).catch(()=>{ if(AUDIO_GEN.get(a)===gen) a.volume=TRACK_VOL; });
}
function trackOut(a){ bumpGen(a); fadeAudio(a,0,320,true); }
function pkGoodMoodMusic(){ return MODE==="home" && !S.sick && dogMoodState()!=="sad"; }
function pkParkMoodMusic(){ return MODE==="park" && PK.active; }
/* The little procedural melody is the game's front-of-house theme: it owns every screen that
   isn't the world itself — the title/adoption sequence on first load, the settings panel, and
   any panel that has the world paused underneath it. Stepping into DOGCAM or a park run hands
   over to that context's own chiptune track, and stepping back out hands it straight back. */
function menuMusicWanted(){
  if($("#start") && $("#start").offsetParent) return true;          // title + adoption sequence
  if($("#settingsPanel") && $("#settingsPanel").classList.contains("show")) return true;
  if($("#mystPanel") && $("#mystPanel").classList.contains("show")) return true;
  if(typeof PK!=="undefined" && PK.active && (PK.settingsOpen||PK.shop||PK.friendsOpen||PK.convertOpen||PK.gateAsk||PK.endRunAsk)) return true;
  return false;
}
// idempotent by design — always computes the state every music system should be in right now,
// rather than only acting on a change, so it's safe to call from anywhere (boot, a screen
// switch, the settings toggle, or just the periodic meter refresh) with no ordering assumptions.
// The three contexts are mutually exclusive, so at most one of them ever wants to be playing.
function syncMoodMusic(){
  const base = SETTINGS.music && SETTINGS.sound && !document.hidden;
  const wantMenu = base && menuMusicWanted();
  const wantHome = base && !wantMenu && pkGoodMoodMusic();
  const wantPark = base && !wantMenu && pkParkMoodMusic();
  if(wantHome){
    if(!moodMusicOn){ moodMusicOn=true; stopMusic(); trackIn(MOOD_AUDIO); }
  } else if(moodMusicOn){ moodMusicOn=false; trackOut(MOOD_AUDIO); }
  if(wantPark){
    if(!parkMusicOn){ parkMusicOn=true; stopMusic(); trackIn(MOOD_AUDIO_PARK); }
  } else if(parkMusicOn){ parkMusicOn=false; trackOut(MOOD_AUDIO_PARK); }
  if(!wantHome && !wantPark){
    if(base) startMusic(); else stopMusic();
  }
}
// The AudioContext boots suspended until the page has seen a real gesture, so the title melody
// can't actually sound on a cold load however early it's asked to. This catches the very first
// interaction anywhere, wakes the context, and re-runs the sync so whatever should be playing
// by then starts for real.
(function(){
  const wake=()=>{
    try{ audioInit(); if(AC.state==="suspended") AC.resume(); }catch(e){}
    syncMoodMusic();
  };
  for(const ev of ["pointerdown","keydown","touchstart"]) window.addEventListener(ev,wake,{once:true});
})();

/* ---------- toast ---------- */
let toastT=0;
function toast(msg,red){
  msg=DN(msg);
  const t=$("#toast"); t.textContent=msg; t.className=red?"red":"";
  t.style.display="block"; clearTimeout(toastT);
  toastT=setTimeout(()=>t.style.display="none",1700);
}

/* ---------- state ---------- */
const S = {
  dogName:"BONES", sel:"bones",
  pup:{owned:false,name:"",hunger:70,thirst:70,mood:75,xp:0,lvl:1},
  pFeed:false, pPlay:false, pPet:false,
  hunger:52, thirst:48, energy:80, clean:80, fun:70, mood:70, groom:90,
  money:10, earned:0, petCd:0,
  owned:{}, equipped:null,
  dailyUsed:false, bestDaily:0, bestPractice:0,
  streak:0, dayNeglected:false, sick:false, sickTimer:0, wellTimer:0, dead:false, neglectNight:false, neglectNights:0,
  kibble:3, snacks:2, beach:false, compsToday:0,
  mystDay:-1, mystMet:false,   // the mysterious dog: last day he showed, and whether you've met him
  jWave3:false, jCollar:false, jTrick:false,
  dHappy:false, dNour:false, dBall:false, dPark:false, dClean:false, dWater:false, dFood:false,
  hoopOwned:false, ballOwned:false, ballStock:0, brushOwned:false, shampooOwned:false, shampooPct:0, firstWater:false, firstFood:false, bedHinted:false, pbTutorialDone:false, mail:[],
  bedTier:0, todoWork:false, todoLvl5:false, todoBed:false, todoPark:false, todoBall:false, todoBowls:false, twW:false, twF:false, todoHide:false, outTimer:0,
  lvl:1, xp:0, gen:1, senior:false, seniorDays:0, lifePathChosen:false, litter:false, memorialSrc:null, pendingStage:[],
  lastSaveAt:null, lastSaveDay:0, lastSaveH:0, dogParkPlusUnlocked:false
};
// music on by default: the title sequence is scored to the melody, so a silent first boot would
// hide the whole opening. A save that already carries an explicit preference still wins (see
// loadGame), so nobody who deliberately turned it off gets it switched back on.
const SETTINGS = { sound:true, reduceMotion:false, music:true, musicDefaultMigrated:true, barkStyle:"circle", nightMode:true, vignette:60, shake:"full" };
const CHARMS = [
  {id:"spike", name:"SPIKED COLLAR", cost:15, unlock:2,   fx:"+15% SPEED / -10% JUMP",            mod:{spd:1.15,jmp:0.90}},
  {id:"band",  name:"RED BANDANA",   cost:10, unlock:5,   fx:"+15% JUMP",                          mod:{jmp:1.15}},
  {id:"bell",  name:"BRASS BELL",    cost:12, unlock:7,  fx:"OBSTACLES SPAWN FARTHER OUT",        mod:{tele:1.35}},
  {id:"bonec", name:"BONE CHARM",    cost:20, unlock:10,  fx:"+25% SCORE / -8% SPEED",             mod:{scr:1.25,spd:0.92}},
  {id:"tag",   name:"STEEL TAG",     cost:18, unlock:13,  fx:"+1 LIFELINE (PRACTICE ONLY)",        mod:{life:1}},
  {id:"rope",  name:"LUCKY ROPE",    cost:15, unlock:16,  fx:"DAILY GATE HINT STAYS ON SCREEN",    mod:{hint:1}},
  {id:"shadow",name:"SHADOW LEASH",  cost:25, unlock:21,  fx:"+25% SPEED / COURSE GOES DARK",      mod:{spd:1.25,dark:1}},
  {id:"chain", name:"CHAIN COLLAR",  cost:30, unlock:26, fx:"+10% SPD +10% JMP / MOOD DRAINS FAST",mod:{spd:1.10,jmp:1.10,moodDrain:1}}
,
  {id:"legacy",name:"LEGACY TAG", cost:0, unlock:1, fx:"+10% SPD/JMP/SCORE \u2014 INHERITED", mod:{spd:1.10,jmp:1.10,scr:1.10}}
];
function mods(){
  const m={spd:1,jmp:1,scr:1,tele:1,life:0,hint:0,dark:0,moodDrain:0};
  const c=CHARMS.find(c=>c.id===S.equipped);
  if(c) Object.assign(m,{...m,...c.mod});
  return m;
}

/* ---------- meters ---------- */
const METERS=[["HUNGER","hunger"],["THIRST","thirst"],["ENERGY","energy"],["CLEAN","clean"],["FUN","fun"],["MOOD","mood"],["GROOM","groom"]];
function buildMeters(){
  $("#meters").innerHTML = METERS.map(([lb,k])=>
    `<div class="mrow"><span class="lb">${lb}</span><div class="bar" id="bar_${k}"><i></i></div></div>`).join("");
}
$("#money1").style.cursor="pointer"; $("#money2").style.cursor="pointer"; $("#money3").style.cursor="pointer";
// set by the main loop while a park run is on screen. Declared with var, and never read
// during init, because park.js (and its `const PK`) is concatenated after this file.
var PARK_HDR=false;
function syncParkHeader(){
  $("#camlabel").textContent = PK.plusMode ? "DOGPARK UNLEASHED" : "DOGPARK";
  $("#clock").textContent    = "WAVE "+PK.wave;
  $("#camstate").textContent = pkLeftCount()+pkLeftLabel();
  $("#needAlert").classList.add("hidden");     // home needs are not the park's business
}
function restoreCamHeader(){
  $("#camlabel").innerHTML='<span class="rec">&#9679;</span> DOGCAM';
}
function renderMeters(){
  for(const [,k] of METERS){
    const el=$("#bar_"+k);
    // clamp defensively on the way to the DOM: an out-of-range or non-finite value (NaN,
    // undefined, a stray negative from somewhere) is invalid CSS and gets silently ignored by
    // the browser, leaving the bar frozen at whatever width it last had rather than reflecting
    // the real (now-fixed) stat underneath
    const v=clamp(Number(S[k])||0,0,100);
    el.classList.toggle("crit", v<25);
    el.firstElementChild.style.width = v+"%";
  }
  if(S.mood>=90) tickTodo("d_happy");
  if(S.pup.owned){ renderDogSel._t=(renderDogSel._t||0)+1; if(renderDogSel._t%8===0) renderDogSel();
    if((S.pup.hunger<30||S.pup.thirst<30) && Math.random()<0.05){ toast(S.pup.name+" IS WHINING \u2014 CHECK THE BOWLS",1); beep(180,.2,"sawtooth",.03); } }
  const minv=Math.min(S.hunger,S.thirst,S.energy,S.clean,S.fun,S.mood);
  const na=$("#needAlert");
  na.classList.toggle("hidden", minv>=80);
  na.classList.toggle("crit", minv<40);
  const neg=S.money<0, mstr=(neg?"-$":"$")+Math.abs(S.money);
  for(const id of ["money1","money2","money3"]){ const el=$("#"+id); if(el){ el.textContent=mstr; el.style.color=neg?"#f22":"#fff"; } }
  $("#hudBones").textContent = "◆ "+S.snacks+" BONES";   // the bone stock park runs bank into, right under the wallet
  syncMoodMusic();   // cheap and idempotent — this is where a drifting mood/sickness gets noticed
  if(PARK_HDR) return;              // the park owns the header; don't stamp the clock over it
  $("#clock").textContent = "DAY "+CLK.day+" "+String(Math.floor(CLK.h)).padStart(2,"0")+":00"+(atWorkNow()?" ▶▶":"");
  $("#bests").textContent = "STREAK "+S.streak+"d";
}

/* ---------- stats sim ---------- */
// While the owner is out at a job the dogcam runs on fast-forward: the clock races, BONES
// scampers through his usual routine at speed, and his needs drain a little quicker than they
// would at home — so leaving him alone for a shift has a real cost.
const WORK_CLOCK_FF=2.5, WORK_NEED_FF=1.25;
let WORK_FF=1, NEED_FF=1;
function atWorkNow(){ return MODE==="work" || MODE==="paperboy"; }
function tickStats(dt, force){
  // The park exists outside the day. Nothing decays and the clock does not move while a run
  // is on; each cleared wave spends a flat 15 minutes instead (see parkUpdate). Without this
  // a long run burned a whole night and you came home straight into the bedtime panel.
  if(PK.active && !force) return;
  const m=mods();
  const nm=(S.senior?0.6:1)*NEED_FF;
  S.hunger = clamp(S.hunger - 0.18*nm*dt, 0, 100);
  S.thirst = clamp(S.thirst - 0.30*nm*dt, 0, 100);
  S.clean  = clamp(S.clean  - 0.09*nm*dt, 0, 100);
  S.groom  = clamp(S.groom  - 0.012*nm*dt, 0, 100);   // coat matts far slower than anything else
  S.fun    = clamp(S.fun    - 0.15*nm*dt, 0, 100);
  const resting = CAM.state==="rest" || CAM.state==="bedsleep";
  const energyCap = resting ? (bedAdequate()?100:70) : 100;
  S.energy = clamp(S.energy + (resting?2.4:(MODE==="home"?0.10:-0.02*NEED_FF))*dt, 0, energyCap);
  const target=(S.hunger+S.thirst+S.energy+S.clean+S.fun)/5;
  S.mood = clamp(S.mood + (target-S.mood)*0.05*dt - (m.moodDrain?0.15*dt:0), 0, 100);
  if(MOOD_BOOST_T>0){ MOOD_BOOST_T=Math.max(0,MOOD_BOOST_T-dt); S.mood=100; }
  S.petCd = Math.max(0, S.petCd-dt);
  S.outTimer += dt;
  if(S.clean<70) SPONGE.rew=false;
  if(S.groom<70) BRUSH.rew=false;
  if(POOS.length){ S.mood=clamp(S.mood-0.025*POOS.length*dt,0,100); S.clean=clamp(S.clean-0.01*POOS.length*dt,0,100); }
  if(S.outTimer>150 && POOS.length<3 && !R.active && !OUTING.active){
    S.outTimer=40;
    const cv=$("#dogcv"), br=bedRect(cv.clientWidth,cv.clientHeight);   // lands right on the bed spot \u2014 an inadequate bed means a rough night
    POOS.push({x:(br.bx+Math.random()*br.bw2)/cv.clientWidth});
    toast("BONES POOPED INDOORS \u2014 TAP TO PICK UP",1); beep(160,.15,"sawtooth",.03);
  }
  // 24h game clock: 10 real seconds = 1 game hour (1 day = 4 min)
  // sickness: sustained severe neglect makes him properly ill
  if(avgStat()<20){ S.sickTimer+=dt; S.wellTimer=0; } else { S.wellTimer+=dt; }
  if(!S.sick && S.sickTimer>75){ S.sick=true; toast("BONES IS SICK. HE NEEDS CARE \u2014 NO RUNS UNTIL HE RECOVERS.",1); sfxSick(); haptic([50,60,50]); }
  if(S.sick && S.wellTimer>25){ S.sick=false; S.sickTimer=0; S.dead=false; toast("BONES IS FEELING BETTER."); sfxBetter(); }
  if(avgStat()<25) S.dayNeglected=true;
  CLK.h += dt*WORK_FF/10;
  if(CLK.h>=24){
    CLK.h-=24; CLK.day++;
    SLEEP.pending=true;
    if(!S.dayNeglected){
      S.streak++; S.money+=5; addXP(25);
      toast("GOOD CARE STREAK: "+S.streak+" DAY"+(S.streak>1?"S":"")+" \u2014 +$5"); beep(760,.08); setTimeout(()=>beep(980,.08),100);
    } else {
      if(S.streak>0) toast("STREAK BROKEN \u2014 BONES WAS NEGLECTED");
      S.streak=0;
      addMail("neglect","A ROUGH NIGHT", NAME().toUpperCase()+" WAS NEGLECTED OVERNIGHT \u2014 HIS CARE NEEDS ATTENTION TODAY.");
    }
    S.dayNeglected=false;
    S.compsToday=0;
    for(const k of ["dHappy","dNour","dBall","dPark","dClean","dWater","dFood","pFeed","pPlay","pPet"]) S[k]=false;
    TODO_NEW=TODO_NEW.filter(k=>!k.startsWith("d_"));   // unclaimed daily rewards expire
    renderTodo();
    addMail("newday","A NEW DAY HAS BEGUN","FRESH TO-DOS ARE WAITING FOR "+NAME().toUpperCase()+" \u2014 CHECK THE LIST.");
    if(CLK.day-(S.lastSaveDay||0)>=2){
      addMail("save","DON'T FORGET TO SAVE","IT'S BEEN "+(CLK.day-(S.lastSaveDay||0))+" DAYS SINCE YOUR LAST SAVE \u2014 YOU COULD LOSE "+NAME().toUpperCase()+"'S PROGRESS.");
    }
    if(S.senior){ S.seniorDays++; if(S.seniorDays===5) setTimeout(startGoodbye,800); }
    if((CLK.day-1)%7===0){ // every 7 days the bills land
      const why=["RENT","BILLS","INSURANCE","VET FUND","BOILER REPAIR"][Math.floor(Math.random()*5)];
      S.money-=20;
      toast(why+" DUE \u2014 -$20"+(S.money<0?" \u2014 YOU'RE IN THE RED":""),1);
      beep(90,.3,"sawtooth");
      renderMeters(); renderShop();
    }
  }
}
// groom is deliberately excluded: it decays over days, so folding it in would slowly poison
// the sickness and neglect checks that key off this average
function avgStat(){ return (S.hunger+S.thirst+S.energy+S.clean+S.fun+S.mood)/6; }
const XPF=[]; let LVLFX=0; let MEMIMG=null;
const XPANIM={lvl:1,frac:0,snd:0,pauseT:0,parts:[],ready:false};
let XPLOCK=false;
function xpLevelTap(){
  if(!XPANIM.ready) return;
  XPANIM.ready=false; XPANIM.pauseT=0.7;
  const cvd=$("#dogcv"), w=cvd.clientWidth, h=cvd.clientHeight;
  beep(880,.09); setTimeout(()=>beep(1170,.12),110);
  for(let i=0;i<20;i++){
    const fromDog=i>=12, sp=40+Math.random()*90, a=Math.random()*Math.PI;
    XPANIM.parts.push({
      x: fromDog ? (CAM.x+0.12)*w : w-14,
      y: fromDog ? h*0.55 : h-20,
      vx: Math.cos(a)*sp*(Math.random()<0.5?-1:1),
      vy: -Math.abs(Math.sin(a))*sp-30,
      life: 0.9+Math.random()*0.4,
      red: Math.random()<0.2
    });
  }
}
const EVO={active:false,t:0,from:1,to:1,label:"",lines:""};
function startEvo(label,from,to,lines){
  EVO.active=true; EVO.t=0; EVO.from=from; EVO.to=to; EVO.label=label; EVO.lines=lines;
  hidePortrait(); closeStatus();
  for(let i=0;i<8;i++) setTimeout(()=>beep(300+i*90,.06,"square",.05), i*280);
  setTimeout(()=>{ beep(660,.12); setTimeout(()=>beep(880,.14),110); setTimeout(()=>beep(1320,.2),230); },2400);
}
function NAME(){ return (S.dogName||"BONES")+(S.gen>1?[" II"," III"," IV"," V"," VI"][Math.min(S.gen-2,4)]:""); }
function DN(s){ return (S.dogName && S.dogName!=="BONES") ? String(s).replace(/BONES/g,S.dogName) : s; }
function stageName(l){ const v=l===undefined?S.lvl:l; return v<10?"PUPPY":v<25?"JUNIOR":(S.senior?"SENIOR":"PRIME"); }
function stageScale(l){ const v=l===undefined?S.lvl:l; return v<10?0.5:v<25?0.82:(S.senior?0.94:1); }
/* ---------- dog bed: sized to match BONES' current growth stage ---------- */
function dogStageIdx(){ return S.lvl<10?1:(S.lvl<25?2:3); }
function bedAdequate(){ return S.bedTier>=dogStageIdx(); }
function bedTierName(n){ return ["NONE","PUPPY BED","MEDIUM BED","LARGE BED"][n]||"NONE"; }
function bedRect(w,h){
  const u=h/42, bwlX=w*0.04, bwlW=u*4, fbX=bwlX+bwlW+8;
  const bx=fbX+bwlW+16;
  const sizeTier = S.bedTier>0 ? S.bedTier : dogStageIdx();  // the "no bed" outline hints the size he actually needs
  const bw2=w*(0.15+0.065*(sizeTier-1)), bh2=h*(0.030+0.012*(sizeTier-1));
  return {bx,bw2,bh2};
}
function drawDogBed(ctx,bx,gy,bw2,bh2,t,owned,adequate){
  if(!owned){
    const hint=(S.lvl>=2||S.bedHinted)&&Math.floor(t*2)%2===0;
    ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle=hint?"#f22":"#555"; ctx.lineWidth=2;
    ctx.strokeRect(bx,gy-bh2,bw2,bh2); ctx.restore();
    ctx.fillStyle="#555"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("NO BED", bx+bw2/2, gy-bh2/2+2); ctx.textAlign="left";
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
    return;
  }
  // puffy bolster rim, warm tones, sunken cushion — a proper cozy pet bed instead of a plain box
  const rim=Math.max(3,bh2*0.24);
  ctx.fillStyle="#6b4a34";
  ctx.beginPath();
  ctx.moveTo(bx+rim,gy-bh2); ctx.lineTo(bx+bw2-rim,gy-bh2);
  ctx.quadraticCurveTo(bx+bw2,gy-bh2,bx+bw2,gy-bh2+rim);
  ctx.lineTo(bx+bw2,gy-rim); ctx.quadraticCurveTo(bx+bw2,gy,bx+bw2-rim,gy);
  ctx.lineTo(bx+rim,gy); ctx.quadraticCurveTo(bx,gy,bx,gy-rim);
  ctx.lineTo(bx,gy-bh2+rim); ctx.quadraticCurveTo(bx,gy-bh2,bx+rim,gy-bh2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle="#c99a6b";
  ctx.fillRect(bx+rim*1.4, gy-bh2+rim*1.4, bw2-rim*2.8, bh2-rim*2.2);
  ctx.strokeStyle="#7a5638"; ctx.lineWidth=1;
  ctx.strokeRect(bx+rim*1.4, gy-bh2+rim*1.4, bw2-rim*2.8, bh2-rim*2.2);
  ctx.strokeStyle="rgba(122,86,56,.6)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(bx+bw2*0.32,gy-bh2*0.28); ctx.quadraticCurveTo(bx+bw2*0.5,gy-bh2*0.05,bx+bw2*0.68,gy-bh2*0.28); ctx.stroke();
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  if(!adequate){
    ctx.fillStyle = Math.floor(t*2)%2 ? "#f22" : "#fff";
    ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("TOO SMALL", bx+bw2/2, gy-bh2-6);
    ctx.textAlign="left";
  }
}
const LVLREWARDS={2:"SPIKED COLLAR IN SHOP",5:"RED BANDANA IN SHOP",7:"BRASS BELL IN SHOP",8:"AGILITY TRAINING UNLOCKED",10:"BONE CHARM IN SHOP",13:"STEEL TAG IN SHOP",16:"LUCKY ROPE IN SHOP",18:"LITTER OPTION UNLOCKED",21:"SHADOW LEASH IN SHOP",26:"CHAIN COLLAR IN SHOP"};
function xpNeed(l){ return 20+l*8; }
function addXP(n){
  if(n<=0||S.lvl>=250) return;
  S.xp+=n;
  XPF.push({x:0.40+Math.random()*0.18, y:0.58, life:1.3, txt:"+"+n+" XP"});
  while(S.xp>=xpNeed(S.lvl) && S.lvl<250){
    S.xp-=xpNeed(S.lvl); S.lvl++;
    LVLFX=1.2;
    if(S.lvl===15) tickTodo("lvl5");
    sfxLevelUp(); haptic(40);
    toast("LEVEL "+S.lvl+"!"+(LVLREWARDS[S.lvl]?" "+LVLREWARDS[S.lvl]:""));
    if(S.lvl===5) S.pendingStage.push(5);
    if(S.lvl===10) S.pendingStage.push(10);
    if(S.lvl===25) S.pendingStage.push(25);
    if(S.lvl===50 && !S.lifePathChosen) S.pendingStage.push(50);
    renderShop(); renderMeters();
  }
}
// cTxt/cFn are optional — a third, visually quieter escape hatch for dialogs that force a real
// pick between two live options (nothing to compare against yet, changed your mind, opened it
// by accident) so the player is never stuck having to commit to one of two choices they didn't
// actually want. Screens with a real "not now"/"cancel" already built into bTxt don't need it.
function openChoice(title,lines,aTxt,aFn,bTxt,bFn,cTxt,cFn){
  $("#chTitle").textContent=DN(title); $("#chLines").innerHTML=DN(lines);
  const A=$("#chA"),B=$("#chB"),C=$("#chC");
  A.textContent=aTxt; A.onclick=()=>{ $("#choice").classList.remove("show"); aFn&&aFn(); };
  if(bTxt){ B.style.display=""; B.textContent=bTxt; B.onclick=()=>{ $("#choice").classList.remove("show"); bFn&&bFn(); }; }
  else B.style.display="none";
  if(cTxt){ C.style.display=""; C.textContent=cTxt; C.onclick=()=>{ $("#choice").classList.remove("show"); cFn&&cFn(); }; }
  else C.style.display="none";
  $("#choice").classList.add("show");
}
function fireStageCeremony(stg){
  if(stg===5){
    tickTodo("park");
    openChoice("YOU UNLOCKED THE DOGPARK!",
      "SURVIVE THE WAVES. BANK BIG XP AT THE<br>RED GATE.<br><br>IF BONES GETS CAUGHT, YOU LOSE IT ALL ☠️",
      "GO THERE NOW",()=>startPark(), "LATER",null);
  }
  else if(stg===50) openLifeChoice();
  else if(stg===10){ startEvo("A JUNIOR",0.5,0.82,"HE'S BIGGER AND STRONGER.<br><br>COMING UP:<br>STEEL TAG — LV.13<br>LUCKY ROPE — LV.16<br>THE LITTER — LV.18");
    if(S.bedTier>0 && !bedAdequate()) setTimeout(()=>toast("HE'S OUTGROWN HIS BED — TIME FOR A BIGGER ONE",1),3000); }
  else if(stg===25){ startEvo("IN HIS PRIME",0.82,1,"FULL SIZE. PEAK CONDITION.<br>TOP FORM MULTIPLIERS ON EVERY RUN.<br><br>AHEAD:<br>SHADOW LEASH — LV.21<br>CHAIN COLLAR — LV.26<br>THE CROSSROADS — LV.50");
    if(S.bedTier>0 && !bedAdequate()) setTimeout(()=>toast("HE'S OUTGROWN HIS BED — TIME FOR A BIGGER ONE",1),3000); }
}
function openLifeChoice(){
  XPLOCK=true;
  openChoice("A CROSSROADS",
    "BONES HAS REACHED HIS PRIME.<br>WOULD YOU LIKE HIM TO BECOME A SENIOR?<br><br>SENIOR: NEEDS EASE, HE SLOWS DOWN,<br>AND ONE DAY HE'LL SAY GOODBYE,<br>LEAVING A LEGACY BEHIND.<br><br>PRIME FOREVER: PEAK CONDITION. NO END.",
    "BECOME SENIOR",()=>{ S.senior=true; S.lifePathChosen=true; XPLOCK=false;
      startEvo("A SENIOR",1,0.94,"HIS NEEDS EASE (-40% DECAY)<br>AND HE TAKES LIFE SLOWER NOW.<br><br>CHERISH THESE DAYS."); },
    "STAY PRIME FOREVER",()=>{ S.lifePathChosen=true; XPLOCK=false; toast("BONES STAYS IN HIS PRIME. FOREVER."); });
}
function startGoodbye(){
  sfxGoodbye(); haptic([80,100,80,100,150]);
  openChoice("GOODBYE, BONES",
    "AFTER A GOOD, LONG LIFE, BONES PASSED<br>PEACEFULLY IN HIS SLEEP.<br><br>HIS PHOTO NOW HANGS ON THE WALL.<br>HE LEAVES A LEGACY TAG"+(S.litter?"<br>\u2014 AND A PUP WHO'S BEEN WAITING.":"<br>FOR THE PUPPY WHO COMES NEXT."),
    "CONTINUE", successor);
}
function successor(){
  S.memorialSrc=PORTRAITS.happy; MEMIMG=new Image(); MEMIMG.src=S.memorialSrc;
  S.owned.legacy=1; S.equipped="legacy";
  S.gen++; S.lvl=1; S.xp=0; S.senior=false; S.seniorDays=0; S.lifePathChosen=false; S.litter=false;
  S.sick=false; S.sickTimer=0; S.wellTimer=0;
  Object.assign(S,{hunger:70,thirst:70,energy:85,clean:85,fun:75,mood:75});
  BOWL.level=1; FBOWL.level=1;
  toast(NAME()+" HAS BEEN ADOPTED. THE LEGACY CONTINUES.");
  renderMeters(); renderShop();
}
function triggerDeath(){
  beep(60,.9,"sawtooth",.04);
  haptic([100,50,100,50,200]);
  if(PK.active){ PK.active=false; showScreen("home"); }
  if(R.active){ R.active=false; showScreen("home"); }
  OUTING.active=false;
  clearInterval(_vetInterval); _vetInterval=null;
  const hasSave=S.lastSaveAt!=null;
  const canVet=S.money>=500;
  if(canVet){
    let secs=30;
    const vetMsg=()=>"HE WENT TO SLEEP WITHOUT FOOD OR WATER<br>AND DIDN'T WAKE UP.<br><br>EMERGENCY VET — HURRY! "+secs+"s LEFT.";
    openChoice(
      "BONES DIDN'T MAKE IT",
      vetMsg(),
      "EMERGENCY VET — $500",
      ()=>{ clearInterval(_vetInterval); _vetInterval=null; doVet(); },
      hasSave?"LOAD LAST SAVE":"CONTINUE",
      ()=>{ clearInterval(_vetInterval); _vetInterval=null; doRewind(); }
    );
    _vetInterval=setInterval(()=>{
      secs--;
      if(secs<=0){
        clearInterval(_vetInterval); _vetInterval=null;
        $("#choice").classList.remove("show");
        doRewind();
        return;
      }
      $("#chLines").innerHTML=DN(vetMsg());
    },1000);
  } else {
    openChoice(
      "BONES DIDN'T MAKE IT",
      hasSave
        ? "HE WENT TO SLEEP WITHOUT FOOD OR WATER<br>AND DIDN'T WAKE UP.<br><br>LOAD YOUR LAST SAVE AND TAKE BETTER<br>CARE OF HIM."
        : "BONES NEEDED CARE AND DIDN'T GET IT.<br><br>FEED HIM. WATER HIM. HE NEEDS YOU.",
      hasSave?"LOAD LAST SAVE":"CONTINUE",
      doRewind
    );
  }
}
function doVet(){
  S.money-=500;
  S.dead=false; S.neglectNight=false; S.neglectNights=0;
  S.sick=false; S.sickTimer=0; S.wellTimer=0;
  S.hunger=clamp(S.hunger+45,0,100); S.thirst=clamp(S.thirst+45,0,100);
  S.energy=clamp(S.energy+30,0,100); S.mood=clamp(S.mood+25,0,100);
  if($("#game").classList.contains("hidden")){ $("#start").classList.add("hidden"); $("#game").classList.remove("hidden"); }
  showScreen("home");
  renderMeters(); renderShop(); renderTodo();
  beep(440,.08); setTimeout(()=>beep(554,.08),130); setTimeout(()=>beep(660,.1),260);
  toast("VET VISIT: $500. BONES IS RECOVERING.",1);
}
function doRewind(){
  clearInterval(_vetInterval); _vetInterval=null;
  const ok=loadGame();
  S.dead=false; S.neglectNight=false; S.neglectNights=0;
  if(!ok){
    S.sick=false; S.sickTimer=0; S.wellTimer=0;
    Object.assign(S,{hunger:35,thirst:35,energy:40,clean:40,fun:40,mood:40});
  }
  if($("#game").classList.contains("hidden")){ $("#start").classList.add("hidden"); $("#game").classList.remove("hidden"); }
  showScreen("home");
  renderMeters(); renderShop(); renderTodo();
  toast("TAKE BETTER CARE OF HIM.",1);
}
function dogMoodState(){
  if(R.active && R.mode==="daily") return "savage";
  const a=avgStat();
  if(a>=65) return "happy";
  if(a<=35) return "sad";
  return "neutral";
}

/* ---------- portraits (tap BONES on DOGCAM) ---------- */
function portraitState(){
  const a=avgStat();
  if(a<=35) return "sad";
  if(Object.values({h:S.hunger,t:S.thirst,e:S.energy,c:S.clean}).some(v=>v<25)) return "confused"; // something's wrong but he can't tell you what
  if(a>=65) return "happy";
  return "content";
}
let portraitT=0;
function showPortrait(state,dur){
  const p=$("#portrait");
  clearInterval(showPortrait._tv);
  if(state==="treat"){
    let f=0; $("#portraitImg").src=TREATIMG[0].src;
    showPortrait._tv=setInterval(()=>{ f^=1; $("#portraitImg").src=TREATIMG[f].src; },420);
  } else $("#portraitImg").src = PORTRAITS[state];
  const lb=$("#portraitLb");
  lb.textContent = {confused:"CONFUSED",happy:"HAPPY",sad:"SAD",content:"CONTENT",savage:"SAVAGE-THIRSTY",treat:"MORE?? PLEASE"}[state];
  lb.className = state==="savage" ? "red" : "";
  p.classList.toggle("savage", state==="savage");
  // place the card on whichever side of BONES has more room right now
  if(CAM.x < 0.5){ p.style.right="8px"; p.style.left="auto"; }
  else { p.style.left="8px"; p.style.right="auto"; }
  p.classList.add("show");
  clearTimeout(portraitT);
  portraitT=setTimeout(hidePortrait, dur||2600);
  beep(state==="savage"?120:560, .07, state==="savage"?"sawtooth":"square");
}
function hidePortrait(){ clearTimeout(portraitT); clearInterval(showPortrait._tv); $("#portrait").classList.remove("show"); }
const stAnim={t:0,i:0,src:""};
function statusFrame(dt){
  stAnim.t+=dt;
  if(stAnim.t>=0.4){ stAnim.t=0; stAnim.i++; }
  const arr = STATPORT[portraitState()] || STATPORT.content;
  const want = arr[stAnim.i % arr.length];
  if(want!==stAnim.src){ stAnim.src=want; $("#stImg").src=want; }
}
function tapBowl(kind){
  const now=performance.now()/1000;
  const T=TAPS[kind];
  T.combo = (now-T.t<0.6) ? Math.min(3,T.combo+1) : 1;
  T.t=now;
  if(kind==="water"){
    if(BOWL.level>0.97){ beep(300,.04); return toast("WATER BOWL IS FULL."); }
    BOWL.level=Math.min(1,BOWL.level+1/3);
    if(!S.firstWater){ S.firstWater=true; addXP(6); toast("GOOD! FRESH WATER. +6 XP"); }
    S.twW=true; if(S.twF) tickTodo("bowls");
    S.dWater=true; if(S.dFood) tickTodo("d_nour");
    addXP(T.combo); beep(560+T.combo*70,.05);
    if(S.thirst<80) drawAttention("drinkgo");
  } else {
    if(FBOWL.level>0.97){ beep(300,.04); return toast("FOOD BOWL IS FULL."); }
    if(S.kibble<=0){ toast("NO KIBBLE \u2014 RESTOCK IN THE SHOP",1); return openShopPanel(); }
    S.kibble--; FBOWL.level=Math.min(1,FBOWL.level+1/3);
    if(!S.firstFood){ S.firstFood=true; addXP(6); toast("GOOD! HE'S FED. +6 XP"); }
    S.twF=true; if(S.twW) tickTodo("bowls");
    S.dFood=true; if(S.dWater) tickTodo("d_nour");
    addXP(T.combo); beep(520+T.combo*70,.05);
    renderMeters();
    if(S.hunger<80) drawAttention("eatgo");
  }
}
function drawAttention(st){
  const busy=["rest","come","fetch","wash","drink","eat","beg","stay","begwait"].includes(CAM.state)||CAM.bedTarget||WASH.pending;
  if(busy||R.active||OUTING.active) return;
  CAM.state=st; CAM.until=99; CAM.t=0; CAM.fi=0;
}
function buyBed(){
  if(S.bedTier>0) return;
  if(S.money<25) return toast("NOT ENOUGH \u2014 THE BED IS $25",1);
  S.money-=25; S.bedTier=dogStageIdx();
  tickTodo("bed");
  toast("BONES HAS A PROPER BED NOW."); heartsBurst(2); beep(700,.08);
  renderMeters(); renderSupplies();
}
function buyBiggerBed(){
  if(bedAdequate()) return;
  if(S.money<45) return toast("NOT ENOUGH \u2014 A BIGGER BED IS $45",1);
  S.money-=45; S.bedTier=dogStageIdx();
  toast("A BIGGER BED \u2014 HE CAN STRETCH OUT NOW."); heartsBurst(2); beep(700,.08); setTimeout(()=>beep(950,.09),100);
  renderMeters(); renderSupplies(); renderShop();
}
// up to 5 balls total (one in play + spares in supplies) \u2014 the spares exist so a ball that's
// truly gone for good (lost off-screen, or just worn out) never leaves the player stuck without
// one. The first purchase places a ball immediately; every one after that banks as stock instead.
const BALL_MAX=5;
function ballTotalOwned(){ return (S.ballOwned?1:0)+S.ballStock; }
function buyBall(){
  if(S.lvl<2){ toast("A BALL UNLOCKS AT LV.2",1); return; }
  if(ballTotalOwned()>=BALL_MAX){ toast("5 BALLS IS PLENTY \u2014 THAT'S THE MOST HE CAN KEEP.",1); return; }
  if(S.money<5){ toast("NOT ENOUGH \u2014 A BALL IS $5",1); return; }
  S.money-=5;
  if(!S.ballOwned){
    S.ballOwned=true;
    BALL.x=0.28; BALL.y=0.795; BALL.vx=0; BALL.vy=0; BALL.off=false; BALL.carried=false; BALL.pcarried=false;
    tickTodo("ball");
    toast("A BALL! FLING IT \u2014 HE'LL BRING IT BACK.");
  } else {
    S.ballStock++;
    toast("A SPARE BALL \u2014 "+S.ballStock+" WAITING IN SUPPLIES.");
  }
  beep(700,.07); setTimeout(()=>beep(950,.09),100);
  renderMeters(); renderSupplies(); renderShop(); renderTodo();
}
// pulls one ball from supplies and sets it down fresh \u2014 the manual fix for a ball that's stuck,
// lost, or just to swap the one currently rolling around for a new one
function placeBallFromStock(){
  if(S.ballStock<=0) return;
  S.ballStock--;
  BALL.x=clamp(CAM.x+CAMDWF*0.6,0.03,0.95); BALL.y=0.795; BALL.vx=0; BALL.vy=0;
  BALL.off=false; BALL.carried=false; BALL.pcarried=false; BALL.cool=0.5;
  toast("A FRESH BALL, SET DOWN.");
  beep(700,.06); setTimeout(()=>beep(950,.07),90);
  renderSupplies();
}
const TODO_META=[
  ["bowls","todoBowls",'REFILL BOTH OF HIS BOWLS<br><span class="tiny">WATER + FOOD \u2014 +$5</span>',"+$5"],
  ["bed","todoBed",'BUY BONES A DOG BED<br><span class="tiny">PERFECT SLEEP</span>',"SWEET DREAMS"],
  ["ball","todoBall",'GET BONES A BALL<br><span class="tiny">FETCH & TRICK SHOTS</span>',"GAME ON"],
  ["work","todoWork",'GO TO WORK \u2014 KEEP AN EYE<br>ON BONES <span class="tiny">REWARD $25</span>',"+$25"],
  ["park","todoPark",'TRAIN BONES TO LEVEL 5<br><span class="tiny">UNLOCKS THE DOGPARK</span>',"DOGPARK OPEN"],
  ["lvl5","todoLvl5",'TRAIN BONES TO LEVEL 15<br><span class="tiny">UNLOCKS COMPETITIONS</span>',"COMPETITIONS OPEN"],
  ["d_happy","dHappy",'MAKE BONES HAPPY<br><span class="tiny">MOOD 90+ \u2014 50 XP</span>',"+50 XP",1],
  ["d_clean","dClean",'CLEAN BONES<br><span class="tiny">SPONGE HIM SPOTLESS \u2014 10 XP</span>',"+10 XP",1],
  ["d_park","dPark",'TAKE BONES TO THE PARK<br><span class="tiny">12 XP</span>',"+12 XP",1],
  ["d_nour","dNour",'NOURISH BONES<br><span class="tiny">WATER + FOOD \u2014 10 XP</span>',"+10 XP",1],
  ["d_ball","dBall",'PLAY WITH THE BALL<br><span class="tiny">10 XP</span>',"+10 XP",1],
  ["j_wave3","jWave3",'SURVIVE UNTIL WAVE 3<br><span class="tiny">IN THE DOGPARK \u2014 40 XP</span>',"+40 XP",2],
  ["j_collar","jCollar",'BUY BONES A NEW COLLAR<br><span class="tiny">ANY CHARM \u2014 25 XP</span>',"+25 XP",2],
  ["j_trick","jTrick",'TEACH BONES A TRICK<br><span class="tiny">TAP HIM WHILE HE BEGS \u2014 25 XP</span>',"+25 XP",2],
  ["p_feed","pFeed",'GIVE THE PUP A BONE TREAT<br><span class="tiny">8 PUP XP</span>',"+8 PUP XP",3],
  ["p_play","pPlay",'PLAY FETCH WITH THE PUP<br><span class="tiny">10 PUP XP</span>',"+10 PUP XP",3],
  ["p_pet","pPet",'PET THE PUP<br><span class="tiny">6 PUP XP</span>',"+6 PUP XP",3]
];
let TODO_NEW=[], TODO_ANIM=false;
function todoCount(){ return TODO_META.reduce((a,m)=>a+(S[m[1]]?1:0),0); }
function tickTodo(k){
  const m=TODO_META.find(x=>x[0]===k);
  if(!m||S[m[1]]) return;
  S[m[1]]=true; TODO_NEW.push(k);
  $("#todoBar").classList.add("pulse");
  beep(900,.08); setTimeout(()=>beep(1170,.09),110);
  toast("TO-DO \u2713 \u2014 CHECK THE LIST");
  renderTodo(); renderMeters();
}
function startersDone(){ return TODO_META.filter(m=>!m[4]).every(m=>S[m[1]]); }
function renderTodo(){
  const bar=$("#todoBar"), list=$("#todoList");
  const jOpen=startersDone();
  // fixed label \u2014 the blink is the signal now, not a running count
  bar.textContent = "\u25B8 TO-DO LIST";
  bar.classList.toggle("pulse", TODO_NEW.length>0);
  let html="";
  for(const k of TODO_NEW){
    const m=TODO_META.find(x=>x[0]===k);
    html+='<div class="prow claim" data-k="'+k+'"><span class="nm">\u2611 '+m[2]+'<br><span class="claimTag">TAP TO CLAIM '+m[3]+'</span></span></div>';
  }
  const sect=t=>'<div class="tiny" style="color:#777;letter-spacing:2px;padding:4px 0">'+t+'</div>';
  const rows=stage=>TODO_META.filter(m=>(m[4]||0)===stage && !S[m[1]] && !(m[0]==="d_ball" && !S.ballOwned) && !(m[0]==="lvl5" && !S.todoPark)).map(m=>{
    const btn = m[0]==="bed" ? '<button data-todo="bed" '+(S.money<25?"disabled":"")+'>BUY $25</button>'
      : m[0]==="ball" ? (S.lvl<2 ? '<button data-todo="ball">LOCKED</button>' : '<button data-todo="ball" '+(S.money<5?"disabled":"")+'>BUY $5</button>')
      : "";
    return '<div class="prow"><span class="nm">\u2610 '+m[2]+'</span>'+btn+'</div>';
  }).join("");
  const st=rows(0), dl=rows(1), jr=rows(2);
  if(st) html+=sect("GETTING STARTED")+st;
  else if(jOpen && jr) html+=sect("JUNIOR STAGE")+jr;
  html+=sect("DAILIES")+(dl||'<div class="tiny" style="color:#555;padding:6px 0">ALL DONE TODAY. GOOD OWNER.</div>');
  if(S.pup.owned){
    const pd=rows(3);
    html+=sect("PUP DAILIES")+(pd||'<div class="tiny" style="color:#555;padding:6px 0">THE PUP IS WELL LOVED TODAY.</div>');
  }
  const done=TODO_META.filter(m=>S[m[1]] && !TODO_NEW.includes(m[0])).map(m=>
    '<div class="prow" style="opacity:.35;border-color:#444"><span class="nm">\u2611 '+m[2]+'</span></div>').join("");
  if(done) html+=sect("COMPLETED")+done;
  list.innerHTML=html;
}
/* ---------- MAIL: a small inbox of reminders from us to the owner, separate from the to-do list ---------- */
// Keyed by "kind" so a re-triggered reminder (e.g. another day passes unsaved) replaces the
// stale copy instead of piling up duplicates — at most one live notice per kind at a time.
function addMail(kind,title,body){
  S.mail=S.mail.filter(m=>m.kind!==kind);
  S.mail.push({id:"m"+Date.now()+"_"+Math.floor(Math.random()*1000), kind, title, body});
  renderMailBadge();
}
function renderMailBadge(){ $("#mailBtn").classList.toggle("pulse", S.mail.length>0); }
function renderMail(){
  const list=$("#mailList");
  list.innerHTML = S.mail.length
    ? S.mail.map(m=>'<div class="prow" data-id="'+m.id+'" style="cursor:pointer"><span class="nm">✉ '+m.title+'<br><span class="tiny">'+m.body+'</span></span></div>').join("")
    : '<div class="tiny" style="color:#555;padding:6px 0">NO NEW ALERTS.</div>';
  renderMailBadge();
}
function petStroke(amt){
  const take=Math.min(amt, PET.left);
  if(take<=0) return;
  PET.left-=take; PET.heat=0.6;
  S.mood=clamp(S.mood+take,0,100);
  if(Math.random()<0.10) heartsBurst(1);
  if(Math.random()<0.15) beep(700+Math.random()*100,.04,"square",.02);
}
function showLowestNeed(){
  let lk=METERS[0], lv=101;
  for(const [lb,k] of METERS){ if(S[k]<lv){ lv=S[k]; lk=[lb,k]; } }
  openStatus();
  const bar=$("#bar_"+lk[1]);
  bar.classList.add("attn");
  setTimeout(()=>bar.classList.remove("attn"),4200);
  toast("BONES NEEDS: "+lk[0]+" ("+Math.round(lv)+"%)",1);
}
function openStatus(){
  hidePortrait();
  stAnim.t=0; stAnim.i=0; stAnim.src="";
  statusFrame(0);
  renderMeters();
  $("#status").classList.add("show");
  beep(560,.06);
}
function closeStatus(){ $("#status").classList.remove("show"); }
function blockAtWork(){
  CAM.workBlockT = 2.2;
  beep(90,.18,"sawtooth");
  openChoice(
    "YOU ARE AT WORK",
    "CANNOT DO THAT FROM HERE.<br><br>MAYBE A ROBOT COULD DO THIS FOR YOU SOMEDAY...",
    "OK", null
  );
}
let _vetInterval = null;
$("#dogcv").addEventListener("pointerdown",e=>{
  if(R.active||OUTING.active||PK.active) return; // BONES is out
  if(WASH.active) return;             // scrubbing uses drag, not taps
  const r=e.currentTarget.getBoundingClientRect();
  const fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height;
  if(XPANIM.ready && fy>0.86){ xpLevelTap(); return; }
  if(mystHitWindow(fx,fy)){ mystOpen(); return; }   // caught him at the glass
  if(S.memorialSrc && fx>0.12 && fx<0.28 && fy>0.12 && fy<0.34){ // the photo on the wall
    $("#portraitImg").src=S.memorialSrc;
    const lb=$("#portraitLb"); lb.textContent="IN LOVING MEMORY"; lb.className="";
    $("#portrait").classList.toggle("savage",false);
    $("#portrait").style.right="auto"; $("#portrait").style.left="8px";
    $("#portrait").classList.add("show");
    clearTimeout(portraitT); portraitT=setTimeout(hidePortrait,3200);
    beep(420,.1); return;
  }
  // righting the bot is allowed even from work — he IS the remote-care mechanism, so leaving
  // him face-down and untappable during a shift would strand BONES with nobody able to help
  if(S.owned.robot && ROBOT.state==="down" && fy>0.55 && Math.abs(fx-ROBOT.x)<0.10){ botRight(); return; }
  if(atWorkNow() && !S.owned.robot){ blockAtWork(); return; }
  // a tap that lands on BONES belongs to BONES — wall items never steal it
  const onDogNow = fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30;
  if(S.brushOwned && !BRUSH.held && !onDogNow && Math.hypot(fx-BRUSH_X,fy-BRUSH_Y)<0.055){
    BRUSH.held=true; BRUSH.x=fx; BRUSH.y=fy;
    try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
    beep(430,.04); return;
  }
  const spx=SPONGE.held?SPONGE.x:SPONGE_X, spy=SPONGE.held?SPONGE.y:SPONGE_Y;
  if(!SPONGE.held && onDogNow){ /* fall through to the dog */ }
  else if(Math.hypot(fx-spx,fy-spy)<0.06){                  // grab the sponge off the wall
    if(S.shampooPct<=0){
      openChoice("NO DOG SHAMPOO", "BONES NEEDS SHAMPOO BEFORE YOU CAN WASH HIM.",
        "GO TO SHOP", ()=>openShopPanel(), "CANCEL", ()=>{});
      beep(300,.1); return;
    }
    SPONGE.held=true; SPONGE.x=fx; SPONGE.y=fy;
    try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
    for(let i=0;i<5;i++) DRIPS.push({x:fx+(Math.random()-0.5)*0.03, y:fy+0.015, vy:0.14+Math.random()*0.2, life:0.6+Math.random()*0.3});
    beep(480,.04); return;
  }
  // poo piles: tap to pick up \u2014 checked before the ball/bowls/bed so an accident
  // sitting in front of them always wins the tap, since it can't be moved out of the way
  for(let i=0;i<POOS.length;i++){
    if(fy>0.68 && Math.abs(fx-POOS[i].x)<0.05){
      POOS.splice(i,1); addXP(2); beep(500,.05);
      toast("PICKED UP. GOOD OWNER."); return;
    }
  }
  if(S.ballOwned && !BALL.pcarried && Math.hypot(fx-BALL.x,(fy-BALL.y)*1.4)<0.07){ // grab the ball \u2014 checked next since it can be dragged clear
    BALL.held=true; BALL.tx=fx; BALL.ty=fy;
    try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
    return;
  }
  // bowls (bottom-left) + the bed, tucked in right beside them
  const uPx=r.height/42, wbX=0.04*r.width, wbW=4*uPx, fbX2=wbX+wbW+8;
  const {bx:bedXpx, bw2:bedWpx} = bedRect(r.width, r.height);
  const px=fx*r.width;
  if(px>=bedXpx && px<=bedXpx+bedWpx && fy>0.62){
    if(S.bedTier===0){
      S.bedHinted=true;
      toast("HE HAS NOWHERE PROPER TO SLEEP \u2014 SEE THE LIST",1);
      beep(300,.1);
      renderTodo(); $("#todoPanel").classList.add("show");
      return;
    }
    if(!bedAdequate()){
      openChoice("HE'S OUTGROWN HIS BED",
        "IT'S TOO SMALL FOR HIM NOW \u2014 HE WON'T GET A FULL NIGHT'S REST.<br><br>UPGRADE TO A BIGGER BED?",
        "BIGGER BED \u2014 $45", ()=>buyBiggerBed(),
        "NOT NOW", ()=>toggleRest());
      beep(300,.1); return;
    }
    toggleRest(); return;
  } // the bed
  if(fy>0.70){
    if(px>=wbX-6 && px<=wbX+wbW+4){ tapBowl("water"); return; }
    if(px>=fbX2-4 && px<=fbX2+wbW+6){ tapBowl("food"); return; }
  }
  const onDog = fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30;
  if(S.pup.owned && fx>PUP.x-0.02 && fx<PUP.x+PUP.w+0.04 && fy>0.55){
    S.sel="pup"; renderDogSel(); flashDogSel();
    S.pup.mood=clamp(S.pup.mood+2,0,100); tickTodo("p_pet");
    heartsBurst(1); beep(720,.05);
    return;
  }
  if(onDog && S.sel!=="bones"){ S.sel="bones"; renderDogSel(); flashDogSel(); }
  if(onDog && CAM.state==="begwait"){
    S.mood=clamp(S.mood+4,0,100); heartsBurst(2); beep(760,.07);
    tickTodo("j_trick");
    toast("SHAKE! GOOD BOY!");
    return;
  }
  if(onDog){
    PET.down=true; PET.px=fx; PET.py=fy; PET.stroked=false;
    clearTimeout(PET.lp);
    PET.lp=setTimeout(()=>{ if(!PET.stroked) openStatus(); },550); // long-press = status
    petStroke(0.4);
    return;
  }
  // empty room: nothing — the whistle button calls him now
});
$("#dogcv").addEventListener("pointermove",e=>{
  const r=e.currentTarget.getBoundingClientRect();
  const fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height;
  if(BRUSH.held){
    BRUSH.x=fx; BRUSH.y=fy;
    if(fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30 && fy<0.85 && !R.active && !OUTING.active && !PK.active){
      const was=S.groom;
      S.groom=clamp(S.groom+0.32,0,100);
      S.mood=clamp(S.mood+0.05,0,100);
      // loose fur lifts off him as he is worked over — the payoff is the feel, not the XP
      if(Math.random()<0.55){
        SUDS.push({x:fx+(Math.random()-0.5)*0.05, y:fy+(Math.random()-0.5)*0.04,
                   life:0.55+Math.random()*0.5, r:1.5+Math.random()*4});
        if(SUDS.length>60) SUDS.splice(0,SUDS.length-60);
      }
      // bristle rasp, pitched up as his coat comes good
      if(Math.random()<0.16) beep(170+S.groom*1.2+Math.random()*60, .03, "square", .012);
      // a chime at each quarter so progress reads without paying out
      for(const mark of [25,50,75]) if(was<mark && S.groom>=mark){ beep(560+mark*3,.05); heartsBurst(1); }
      if(S.groom>=100 && !BRUSH.rew){
        BRUSH.rew=true; addXP(6); heartsBurst(2);
        toast("WELL GROOMED. HE LOOKS SHARP."); beep(880,.08);
      }
    }
    return;
  }
  if(SPONGE.held){
    SPONGE.x=fx; SPONGE.y=fy;
    if(Math.random()<0.4){ DRIPS.push({x:fx+(Math.random()-0.5)*0.015,y:fy+0.015,vy:0.12+Math.random()*0.18,life:0.5+Math.random()*0.3}); if(DRIPS.length>50) DRIPS.splice(0,DRIPS.length-50); }
    if(fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30 && fy<0.85 && !R.active && !OUTING.active && !PK.active && S.shampooPct>0){
      S.clean=clamp(S.clean+0.6,0,100); WASH.heat=0.5;
      S.shampooPct=clamp(S.shampooPct-0.2,0,100);
      if(Math.random()<0.5){ SUDS.push({x:fx,y:fy,life:0.9,r:3+Math.random()*5}); if(SUDS.length>60) SUDS.splice(0,SUDS.length-60); }
      if(S.clean>=100 && !SPONGE.rew){
        SPONGE.rew=true; addXP(6); heartsBurst(2);
        tickTodo("d_clean");
        toast("SQUEAKY CLEAN!"); beep(880,.08);
      }
    }
    return;
  }
  if(PET.down && !WASH.active && !BALL.held){
    const onDog = fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30;
    if(onDog){
      if(Math.hypot(fx-PET.px, fy-PET.py)>0.02){
        PET.stroked=true; clearTimeout(PET.lp);
        PET.px=fx; PET.py=fy;
        petStroke(0.15);
      }
    } else { PET.stroked=true; clearTimeout(PET.lp); }
  }
  if(WASH.active){
    if(fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30 && fy<0.85){
      S.clean=clamp(S.clean+0.7,0,100); WASH.heat=0.4;
      if(Math.random()<0.5) SUDS.push({x:fx,y:fy,life:0.9,r:3+Math.random()*5});
    }
    return;
  }
  if(!BALL.held) return;
  BALL.tx=clamp(fx,0.02,0.97);
  BALL.ty=clamp(fy,0.05,0.80);
});
$("#dogcv").addEventListener("pointerup",()=>{
  if(PET.down && !PET.stroked) openStatus();   // quick tap on BONES = his needs
  if(BALL.held && (Math.abs(BALL.vx)>0.25 || Math.abs(BALL.vy)>0.25)){
    TRICK.live=true; TRICK.mult=1; TRICK.ticks=0; TRICK.airT=0; TRICK.floorB=0; TRICK.hitWall=false; TRICK.hitWin=false; TRICK.swish=0;
  }
  BALL.held=false; PET.down=false; SPONGE.held=false; BRUSH.held=false; clearTimeout(PET.lp);
});
$("#dogcv").addEventListener("pointercancel",()=>{ BALL.held=false; PET.down=false; SPONGE.held=false; BRUSH.held=false; clearTimeout(PET.lp); });
$("#stClose").onclick=closeStatus;
$("#meters").addEventListener("click",()=>{
  closeStatus();
  $("#home .body").scrollTop=0;
  toast("QUICK CARE IS BELOW THE MAIN BUTTONS");
  beep(500,.05);
});
$("#portrait").addEventListener("pointerdown",hidePortrait);


/* money counter shortcut */
function openMoneyPick(){ $("#mpWork").style.display = (MODE==="work"||MODE==="paperboy") ? "none" : ""; $("#moneyPick").classList.add("show"); beep(500,.05); }
$("#money1").onclick=openMoneyPick;
$("#money2").onclick=openMoneyPick;
$("#money3").onclick=openMoneyPick;
$("#mpCancel").onclick=()=>$("#moneyPick").classList.remove("show");
$("#mpWork").onclick=()=>{ $("#moneyPick").classList.remove("show"); enterPaperboy(); };
$("#mpShop").onclick=()=>{
  $("#moneyPick").classList.remove("show");
  const openShop=()=>{ renderShop(); $("#shopPanel").classList.add("show"); };
  if(MODE==="work"){ W.run=false; transition("DRIVING HOME",()=>{ showScreen("home"); renderMeters(); openShop(); }); }
  else if(MODE==="paperboy"){ PB.run=false; PB.active=false; transition("DRIVING HOME",()=>{ showScreen("home"); renderMeters(); openShop(); }); }
  else openShop();
};

/* ---------- canvas setup ---------- */
function fit(cv){
  const w=cv.clientWidth, h=cv.clientHeight;
  if(cv.width!==Math.round(w*DPR)){ cv.width=Math.round(w*DPR); cv.height=Math.round(h*DPR); }
  const ctx=cv.getContext("2d");
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.imageSmoothingEnabled=false;
  return [ctx,w,h];
}

/* ---------- dog sprite (programmatic pixel-blocks) ---------- */
function drawDog(ctx,x,gy,u,o){
  // o: {state, t, run, flip}
  const st=o.state, t=o.t, run=o.run;
  ctx.save();
  if(o.flip){ ctx.translate(x*2,0); ctx.scale(-1,1); }
  ctx.lineWidth=Math.max(2,u*0.7);
  ctx.strokeStyle="#fff"; ctx.fillStyle="#000";
  const box=(bx,by,w,h,fill)=>{ ctx.fillStyle=fill||"#000"; ctx.fillRect(bx,by,w,h); ctx.strokeRect(bx,by,w,h); };
  const bw=13*u, bh=6*u;
  const bob = run?0 : Math.sin(t*2)*u*0.3;
  const by = gy-9*u+bob;
  // legs
  const legLen=3.6*u;
  for(let i=0;i<4;i++){
    const lx = x + 1.2*u + i*(bw-2.8*u)/3;
    const off = run ? Math.sin(t*14 + i*Math.PI)*u*1.1 : 0;
    box(lx, gy-legLen+Math.min(0,off*0.4), 1.5*u, legLen+off*0.4);
  }
  // tail
  ctx.save();
  ctx.translate(x+0.6*u, by+1.4*u);
  let ta;
  if(st==="happy") ta = -0.9 + Math.sin(t*13)*0.55;
  else if(st==="sad") ta = 0.9;
  else if(st==="savage") ta = -0.3;
  else ta = -0.5 + Math.sin(t*3)*0.15;
  ctx.rotate(ta);
  box(-4.4*u,-0.7*u,4.6*u,1.4*u);
  ctx.restore();
  // body
  box(x, by, bw, bh);
  // head
  const hx=x+bw-2.2*u, hy=by-4.2*u, hw=6*u, hh=5*u;
  box(hx,hy,hw,hh);
  // muzzle
  box(hx+hw-1.2*u, hy+2.2*u, 2.6*u, 2.2*u);
  // ears
  if(st==="sad"){
    box(hx-0.8*u, hy+0.6*u, 1.4*u, 2.6*u);
    box(hx+2.2*u, hy-0.4*u, 2.2*u, 1.2*u);
  } else {
    box(hx+0.6*u, hy-2*u, 1.5*u, 2.4*u);
    box(hx+3.2*u, hy-2*u, 1.5*u, 2.4*u);
  }
  // eye
  ctx.fillStyle = st==="savage" ? "#f22" : "#fff";
  ctx.fillRect(hx+3*u, hy+1.3*u, 1.3*u, 1.3*u);
  // brow (sad)
  if(st==="sad"){
    ctx.strokeStyle="#fff"; ctx.beginPath();
    ctx.moveTo(hx+2.4*u, hy+0.6*u); ctx.lineTo(hx+4.6*u, hy+1.2*u); ctx.stroke();
  }
  // mouth
  if(st==="happy"){
    ctx.fillStyle="#f22";
    const wag=Math.sin(t*10)*u*0.25;
    ctx.fillRect(hx+hw+0.4*u, hy+4.2*u+wag, 1.2*u, 2*u);
    ctx.strokeStyle="#fff";
    ctx.strokeRect(hx+hw+0.4*u, hy+4.2*u+wag, 1.2*u, 2*u);
  } else if(st==="savage"){
    ctx.fillStyle="#fff";
    for(let i=0;i<3;i++){
      const tx=hx+hw-0.6*u+i*0.9*u, ty=hy+4.2*u;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+0.45*u,ty+0.9*u); ctx.lineTo(tx+0.9*u,ty); ctx.fill();
    }
    // drool
    const dy=(t*3)%1;
    ctx.fillRect(hx+hw+1.4*u, hy+4.6*u+dy*2*u, 0.5*u, 0.9*u);
  }
  ctx.restore();
}

/* ---------- DOGCAM ---------- */
const RUNIMG = RUNFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const JUMPIMG = JUMPFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const SLIDEIMG = SLIDEFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const DOGIMG = {};
const _ALLFRAMES = Object.assign({}, DOGFRAMES, DOGFRAMES2, DOGFRAMES3);
const SENIORIMG = SENIORFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const BEGIMG    = BEGFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const SAVAGEIMG = SAVAGEFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const TREATIMG  = TREATFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
// NOURISH-BOT frames, ordered by how far he leans in: 0 upright/idle, 1 reaching,
// 2-3 leaning, 4 hunched right down (the refill pose). All five share a ground line
// and track anchor, so cycling them never makes him hop.
const ROBOTIMG  = ROBOTFRAMES.map(u=>{ const i=new Image(); i.src=u; return i; });
const ROBOT = { x:0.88, dockX:0.88, tx:0.88, dir:-1, state:"dock", job:null, t:0, downT:0,
                acting:false, pourFrom:0, battery:100, downKind:null, zoomArm:false,
                flee:0, pauseT:0, pauseMsg:"", mimicT:0, sawPhoto:false };
for(const k in _ALLFRAMES) DOGIMG[k] = _ALLFRAMES[k].map(u=>{ const i=new Image(); i.src=u; return i; });
/* GAME & WATCH FILTER — the happy accident, made law.
   Every DOGCAM sprite quantizes to two tones: ink, and the room's own grey.
   Highlights melt into the wall by definition; every frame matches. One-time cost at load. */
function lcdify(img){
  const c=document.createElement("canvas");
  c.width=img.naturalWidth; c.height=img.naturalHeight;
  const x=c.getContext("2d");
  x.drawImage(img,0,0);
  const d=x.getImageData(0,0,c.width,c.height), p=d.data;
  const Ls=[];
  for(let i=0;i<p.length;i+=4)
    if(p[i+3]>=20) Ls.push(0.299*p[i]+0.587*p[i+1]+0.114*p[i+2]);
  Ls.sort((a,b)=>a-b);
  const T=clamp(Ls[Math.floor(Ls.length*0.58)]||55, 30, 95);  // adaptive: darkest ~58% of THIS frame = ink
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<20){ p[i+3]=0; continue; }
    if(p[i]>80 && p[i]-p[i+2]>30 && p[i]>=p[i+1]-10){ p[i+3]=255; continue; }  // warm pixels — his brown eyes & tongue keep true color
    const L=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];
    if(L<T){ p[i]=14; p[i+1]=14; p[i+2]=18; }         // ink
    else   { p[i]=52; p[i+1]=52; p[i+2]=60; }          // #34343c — the wall
    p[i+3]=255;
  }
  x.putImageData(d,0,0);
  c.complete=true; c.naturalWidth=c.width; c.naturalHeight=c.height; // shim so draw checks pass
  return c;
}
function lcdSet(arr){
  arr.forEach((im,i)=>{
    const ap=()=>{ arr[i]=lcdify(im); };
    (im.complete && im.naturalWidth) ? ap() : im.addEventListener("load",ap);
  });
}
for(const k in DOGIMG) lcdSet(DOGIMG[k]);
lcdSet(BEGIMG); lcdSet(SENIORIMG); lcdSet(ROBOTIMG);   // the bot lives on the same LCD as BONES
const HEARTIMG = HEARTS.map(u=>{ const i=new Image(); i.src=u; return i; });

/* ==================== THE MYSTERIOUS DOG ====================
   Some hours he is simply there: a black shape behind the blinds, rocking gently, watching the
   room. Ten seconds and he is gone again. Tap him in time and the blinds go up and he does
   business — bones only, and only for things nobody else sells. Meet him once and he leaves you
   a whistle, so afterwards you can call him rather than wait on him.
   He is drawn straight into DOGCAM (see mystDrawWindow, called from the blinds block) and runs
   off the same game clock as everything else: one 5% roll per game hour, at most one visit a day. */
const WIN_X=0.72, WIN_Y=0.14, WIN_W=0.18, WIN_H=0.20;   // the DOGCAM window, in canvas fractions
const MYST_PEEK=10;                 // seconds he will wait at the glass before giving up on you
const MYST_HOUR_CHANCE=0.05;        // per game hour, on the hours he is allowed to come at all
const MYST_PRICE=999;
const MYST = { state:"away", t:0, blind:0, lastHour:-1, flash:0 };
// every silhouette in the game is the same trick: draw the sprite, then flood it with black
// through source-in so only its own alpha survives. Cached per image — it never changes.
const MYST_SIL=new WeakMap();
function mystSil(img){
  if(!img) return null;
  const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
  if(!iw||!ih) return null;
  let c=MYST_SIL.get(img);
  if(c) return c;
  c=document.createElement("canvas"); c.width=iw; c.height=ih;
  const x=c.getContext("2d");
  x.imageSmoothingEnabled=false;
  x.drawImage(img,0,0);
  x.globalCompositeOperation="source-in";
  x.fillStyle="#000"; x.fillRect(0,0,iw,ih);
  MYST_SIL.set(img,c);
  return c;
}
function mystFrame(){ const a=DOGIMG.idle; return a&&a.length?a[0]:null; }
function mystBusy(){
  return R.active||PK.active||OUTING.active||WASH.active||EVO.active||SLEEP.active||atWorkNow();
}
function mystSfxArrive(){ beep(150,.16,"sine",.05); setTimeout(()=>beep(112,.26,"sine",.045),150); }
function mystSfxWhistle(){   // two rising slides, the way a real dog whistle reads
  const p=[1180,1560,1950,1720,2100];
  p.forEach((f,i)=>setTimeout(()=>beep(f,.07,"sine",.045),i*68));
}
function mystSfxRoll(){      // the blinds going up: a quick ladder of wooden ticks
  for(let i=0;i<9;i++) setTimeout(()=>beep(320+i*46,.028,"square",.03),i*52);
  setTimeout(()=>beep(880,.1,"sine",.05),9*52+40);
}
function mystArrive(quiet){
  if(MYST.state!=="away"&&MYST.state!=="leaving") return;
  MYST.state="peek"; MYST.t=0; MYST.blind=0; MYST.flash=1;
  if(!quiet) mystSfxArrive();
}
// the whistle route: he comes whatever the hour, and walks straight into the roll-up
function mystWhistle(){
  if(mystBusy()){ beep(160,.14,"sawtooth",.04); toast("NOT NOW — BONES IS BUSY.",1); return; }
  $("#supplies").classList.remove("show");
  mystSfxWhistle();
  MYST.state="peek"; MYST.t=0; MYST.blind=0; MYST.flash=1;   // rises into the frame, then opens up
  setTimeout(()=>{ if(MYST.state==="peek") mystOpen(); },900);
}
function mystOpen(){
  if(MYST.state!=="peek") return;
  MYST.state="opening"; MYST.t=0;
  if(!S.mystMet){
    S.mystMet=true;
    setTimeout(()=>toast("HE LEFT YOU A WHISTLE. IT'S IN YOUR SUPPLIES."),2400);
  }
  mystSfxRoll();
}
function mystTick(dt){
  if(MYST.flash>0) MYST.flash=Math.max(0,MYST.flash-dt*1.6);
  // one roll per game hour, and never twice in a day
  const hr=Math.floor(CLK.h);
  if(MYST.lastHour!==hr){
    MYST.lastHour=hr;
    if(MYST.state==="away" && !mystBusy() && MODE==="home" && S.mystDay!==CLK.day
       && Math.random()<MYST_HOUR_CHANCE){
      S.mystDay=CLK.day; mystArrive();
    }
  }
  MYST.t+=dt;
  if(MYST.state==="peek"){
    if(mystBusy()){ MYST.state="leaving"; MYST.t=0; return; }
    if(MYST.t>=MYST_PEEK){ MYST.state="leaving"; MYST.t=0; }
  } else if(MYST.state==="leaving"){
    if(MYST.t>=0.7){ MYST.state="away"; MYST.blind=0; }
  } else if(MYST.state==="opening"){
    MYST.blind=Math.min(1,MYST.t/0.62);
    if(MYST.blind>=1){ MYST.state="shop"; openMystShop(); }
  } else if(MYST.state==="shop"){
    MYST.blind=1;
  } else if(MYST.state==="closing"){
    MYST.blind=Math.max(0,1-MYST.t/0.5);
    if(MYST.blind<=0){ MYST.state="away"; }
  }
}
// how far up he is sitting in the window: 0 fully below the sill, 1 fully in view
function mystRise(){
  if(MYST.state==="peek")    return Math.min(1,MYST.t/0.55);
  if(MYST.state==="leaving") return Math.max(0,1-MYST.t/0.7);
  if(MYST.state==="away")    return 0;
  return 1;
}
// drawn as part of the window: he sits behind the glass, the blinds go over the top of him, and
// the whole thing is clipped to the frame so he can never spill into the room
function mystDrawWindow(ctx,w,h){
  const winX=w*WIN_X, winY=h*WIN_Y, winW=w*WIN_W, winH=h*WIN_H;
  const rise=mystRise();
  if(rise>0){
    const sil=mystSil(mystFrame());
    ctx.save();
    ctx.beginPath(); ctx.rect(winX+1.5,winY+1.5,winW-3,winH-3); ctx.clip();
    // a wash of cold light behind him so the shape separates from the glass
    const g=ctx.createLinearGradient(0,winY,0,winY+winH);
    g.addColorStop(0,"rgba(120,140,190,0.16)"); g.addColorStop(1,"rgba(120,140,190,0)");
    ctx.fillStyle=g; ctx.fillRect(winX,winY,winW,winH);
    if(sil){
      const bob=Math.sin(performance.now()/430)*winH*0.035;
      const sw=winW*0.80, sh=sw*(sil.height/sil.width);
      const sx=winX+winW*0.5-sw/2;
      // sits low in the frame and rises into it — head and shoulders only, like someone
      // standing outside on their back legs with their paws on the sill
      const sy=winY+winH-sh*0.62 - rise*winH*0.30 + bob;
      ctx.globalAlpha=0.92*rise;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(sil,sx,sy,sw,sh);
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(w*0.81,winY); ctx.lineTo(w*0.81,winY+winH); ctx.stroke();
  // venetian blinds — explains the striped light drawSunray() throws across the room. They
  // gather at the top as MYST.blind climbs, so the window clears from the bottom upward.
  const slatN=7, coverH=winH*(1-MYST.blind);
  ctx.strokeStyle="#15151a"; ctx.lineWidth=1.4;
  for(let i=1;i<slatN;i++){
    const sy=winY+(winH/slatN)*i;
    if(sy>winY+coverH) continue;
    ctx.beginPath(); ctx.moveTo(winX+1,sy); ctx.lineTo(winX+winW-1,sy); ctx.stroke();
  }
  if(MYST.blind>0.02){   // the gathered bundle sitting at the head of the frame
    ctx.fillStyle="#15151a";
    ctx.fillRect(winX+1,winY+1,winW-2,Math.min(winH*0.10,winH*0.10*MYST.blind+1));
  }
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  // while he is waiting, the frame breathes — the only nudge you get that someone is out there
  if(MYST.state==="peek"){
    const pul=0.35+0.65*Math.abs(Math.sin(performance.now()/520));
    ctx.save();
    ctx.globalAlpha=pul*0.9; ctx.strokeStyle="#e8c14a"; ctx.lineWidth=2;
    ctx.strokeRect(winX-2.5,winY-2.5,winW+5,winH+5);
    ctx.restore();
  }
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
}
function mystHitWindow(fx,fy){
  return MYST.state==="peek" && fx>WIN_X-0.03 && fx<WIN_X+WIN_W+0.03
      && fy>WIN_Y-0.03 && fy<WIN_Y+WIN_H+0.03;
}
/* His stock. Every one of these is a placeholder: the price is real and the flavour is real, but
   nothing is wired to an effect yet, so buying takes no bones — he simply refuses the sale. That
   way the shelf can be browsed and priced without anyone paying 999 bones for nothing. */
const MYST_GOODS=[
  {n:"THE LONG NIGHT",  d:"HE SAYS IT KEEPS THE DARK OFF YOU"},
  {n:"SECOND WIND",     d:"FOR THE RUN THAT SHOULD HAVE ENDED"},
  {n:"THE IRON COLLAR", d:"HEAVIER THAN IT LOOKS. MUCH HEAVIER"},
  {n:"NINE LIVES",      d:"HE WON'T SAY WHERE HE GOT THEM"},
  {n:"THE QUIET DOOR",  d:"IT OPENS ONTO SOMEWHERE ELSE"}
];
function renderMystShop(){
  $("#mystBal").textContent = S.snacks+" BONES";
  $("#mystList").innerHTML = MYST_GOODS.map((g,i)=>
    '<div class="mrow2'+(S.snacks<MYST_PRICE?" poor":"")+'" data-myst="'+i+'">'
    +'<span class="mn">'+g.n+'<span class="md">'+g.d+'</span></span>'
    +'<span class="mc">'+MYST_PRICE+' ◆</span></div>').join("");
  mystDrawBig();
}
/* Where his head actually is, in 0..1 of the silhouette box. Read off the sprite's own alpha
   rather than guessed at, so the eyes sit in the head whichever frame he happens to be drawn
   from: find the first row with any ink in it, then take the middle of the ink in the band just
   below it. Measured once per sprite and cached. */
const MYST_HEAD=new WeakMap();
function mystHeadSpot(sil){
  let hit=MYST_HEAD.get(sil);
  if(hit) return hit;
  const x=sil.getContext("2d");
  const d=x.getImageData(0,0,sil.width,sil.height).data;
  const op=(px,py)=>d[(py*sil.width+px)*4+3]>10;
  let top=-1;
  for(let py=0;py<sil.height && top<0;py++)
    for(let px=0;px<sil.width;px++) if(op(px,py)){ top=py; break; }
  if(top<0){ hit={hx:0.5,hy:0.2}; MYST_HEAD.set(sil,hit); return hit; }
  // A raised tail reaches as high as the head, so the ink up here is usually two separate blobs.
  // Taking the midpoint of all of it would land squarely on his back — instead split the band
  // into contiguous runs of inked columns and keep the heaviest one. A head outweighs a tail.
  const band=Math.max(2,Math.round(sil.height*0.18));
  const bot=Math.min(sil.height,top+band);
  const col=new Array(sil.width).fill(0);
  for(let px=0;px<sil.width;px++)
    for(let py=top;py<bot;py++) if(op(px,py)) col[px]++;
  let best={lo:0,hi:sil.width-1,mass:-1}, run=null;
  for(let px=0;px<=sil.width;px++){
    const inked = px<sil.width && col[px]>0;
    if(inked){ if(!run) run={lo:px,hi:px,mass:0}; run.hi=px; run.mass+=col[px]; }
    else if(run){ if(run.mass>best.mass) best=run; run=null; }
  }
  hit={ hx:((best.lo+best.hi)/2)/sil.width, hy:(top+band*0.5)/sil.height };
  MYST_HEAD.set(sil,hit);
  return hit;
}
// the half-screen cut-out: the same silhouette trick as the window, blown up. He is lit from
// behind so the black shape separates from the black room, and his eyes burn out of it.
function mystDrawBig(){
  const cv=$("#mystCv"); if(!cv) return;
  const w=cv.clientWidth||360, h=cv.clientHeight||300;
  if(!w||!h) return;
  cv.width=w; cv.height=h;
  const x=cv.getContext("2d");
  x.clearRect(0,0,w,h);
  const sil=mystSil(mystFrame());
  if(!sil) return;
  // framed on the head rather than the whole animal: blown up well past the panel so only head
  // and shoulders are in shot, the rest running off the bottom edge. Anchoring on the measured
  // head spot is what keeps him composed at any scale instead of drifting off frame.
  const {hx,hy}=mystHeadSpot(sil);
  const sh=h*1.75, sw=sh*(sil.width/sil.height);
  const headX=w*0.5, headY=h*0.40;
  const sx=headX-hx*sw, sy=headY-hy*sh;
  const pul=0.62+0.38*Math.sin(performance.now()/700);
  // one clean pool of cold light behind him — no outline tricks, just something for the black
  // mass to sit against so its edge reads on a black panel
  const glow=x.createRadialGradient(headX,headY+h*0.08,0,headX,headY+h*0.08,w*0.62);
  glow.addColorStop(0,"rgba(176,196,246,"+(0.20*pul+0.12).toFixed(3)+")");
  glow.addColorStop(0.5,"rgba(120,142,200,0.10)");
  glow.addColorStop(1,"rgba(0,0,0,0)");
  x.fillStyle=glow; x.fillRect(0,0,w,h);
  x.imageSmoothingEnabled=false;
  x.drawImage(sil,sx,sy,sw,sh);
  // eyes, dropped straight onto the head the sprite actually has
  const ey=headY, er=Math.max(2.6,w*0.011), gap=w*0.052;
  for(const ex of [headX-gap, headX+gap]){
    const eg=x.createRadialGradient(ex,ey,0,ex,ey,er*6);
    eg.addColorStop(0,"rgba(255,232,160,"+(0.95*pul).toFixed(3)+")");
    eg.addColorStop(0.3,"rgba(232,193,74,"+(0.5*pul).toFixed(3)+")");
    eg.addColorStop(1,"rgba(232,193,74,0)");
    x.fillStyle=eg; x.beginPath(); x.arc(ex,ey,er*6,0,7); x.fill();
    x.fillStyle="#fff6d0"; x.beginPath(); x.arc(ex,ey,er,0,7); x.fill();
  }
}
let mystBigTimer=null;
function openMystShop(){
  renderMystShop();
  $("#mystPanel").classList.add("show");
  beep(560,.07,"sine",.05); setTimeout(()=>beep(750,.09,"sine",.05),110);
  clearInterval(mystBigTimer);
  mystBigTimer=setInterval(mystDrawBig,80);   // keeps the eyes breathing while he waits on you
  syncMoodMusic();
}
function closeMystShop(){
  clearInterval(mystBigTimer); mystBigTimer=null;
  $("#mystPanel").classList.remove("show");
  MYST.state="closing"; MYST.t=0;             // blinds come back down behind him
  beep(300,.09,"sine",.04);
  syncMoodMusic();
}
// He has to hold a facing for a beat before he is allowed to turn again, or targets that sit
// near his centre line make him strobe. Any turn that goes through here is rate-limited.
const CAM_FLIP_MIN=0.45;
function camFace(want, dt){
  CAM.dirT=(CAM.dirT||0)+(dt||0);
  if(want===CAM.dir){ return; }
  if((CAM.dirT||0) < CAM_FLIP_MIN) return;
  CAM.dir=want; CAM.dirT=0;
}
const CAM = { x:0.32, dir:1, dirT:9, state:"idle", t:0, fi:0, ft:0, until:1.5, woof:0, bedTarget:false, cameCalled:false, fetchPhase:0, workBlockT:0 };
const BED = { x:0.56 };
const BOWL = { level:0 };
const FBOWL = { level:0 };
const POOS=[];
const TAPS={water:{t:0,combo:0},food:{t:0,combo:0}};
// both hang high on the wall, above where BONES' head reaches, so tapping him for his
// stats can never grab one by accident
const SPONGE_X=0.135, SPONGE_Y=0.355, BRUSH_X=0.055, BRUSH_Y=0.355;
const SPONGE={held:false,x:SPONGE_X,y:SPONGE_Y,rew:false};
const BRUSH={held:false,x:BRUSH_X,y:BRUSH_Y,rew:false};
// Bone treats are real objects in the room, not an instant stat bump: each one you give is
// tossed in, tumbles, bounces, rolls to a stop and piles on whatever settled before it, and
// only counts once BONES trots over and actually eats it.
const TREATS=[];
const BONE_G=3.1, BONE_REST=0.42, BONE_FRIC=0.88, BONE_HW=0.034, BONE_STACK=0.032;
const BONE_FLOOR_Y=0.791, BONE_MAX=12, BONE_ZOOM_AT=5;   // centre height that sits a bone flat on the floor line
// a bone rests on the floor, or on the highest already-settled bone it overlaps
function boneSupportY(tr){
  let y=BONE_FLOOR_Y;
  for(const o of TREATS){
    if(o===tr || !o.settled) continue;
    if(o.y<=tr.y+0.002) continue;                 // only bones underneath can hold this one up
    if(Math.abs(o.x-tr.x)<BONE_HW*1.35) y=Math.min(y, o.y-BONE_STACK);
  }
  return y;
}
function tickTreats(dt){
  for(const tr of TREATS){
    const fy=boneSupportY(tr);
    if(tr.settled && fy>tr.y+0.004) tr.settled=false;   // whatever it was resting on is gone
    if(!tr.settled){
      tr.vy += BONE_G*dt;
      tr.x += tr.vx*dt; tr.y += tr.vy*dt; tr.rot += tr.vrot*dt;
      if(tr.x<0.03){ tr.x=0.03; tr.vx=Math.abs(tr.vx)*0.55; tr.vrot*=-0.6; }
      if(tr.x>0.97){ tr.x=0.97; tr.vx=-Math.abs(tr.vx)*0.55; tr.vrot*=-0.6; }
      if(tr.y>=fy){
        tr.y=fy;
        if(Math.abs(tr.vy)>0.14){            // bounce, squashing on impact
          tr.vy=-tr.vy*BONE_REST; tr.vx*=BONE_FRIC; tr.vrot*=0.55; tr.squash=0.5;
          beep(300+Math.random()*120,.03,"square",.012);
        } else { tr.vy=0; tr.settled=true; tr.vrot*=0.3; }
      }
    } else {
      tr.y=fy;
      tr.x += tr.vx*dt; tr.rot += tr.vrot*dt;
      tr.vx*=(1-3.2*dt); tr.vrot*=(1-3.4*dt);
      if(Math.abs(tr.vx)<0.004) tr.vx=0;
      if(Math.abs(tr.vrot)<0.3){          // spin bleeds off, then it eases flat on the pile
        tr.vrot=0;
        const flat=Math.round(tr.rot/Math.PI)*Math.PI;
        tr.rot += (flat-tr.rot)*Math.min(1,6*dt);
      }
      if(tr.x<0.03){ tr.x=0.03; tr.vx=0; }
      if(tr.x>0.97){ tr.x=0.97; tr.vx=0; }
    }
    if(tr.squash) tr.squash=Math.max(0,tr.squash-dt*2.4);
  }
  // relaxation pass: bones sharing a layer shoulder each other apart instead of interpenetrating,
  // so a heap spreads along the floor first and only then starts climbing
  for(let i=0;i<TREATS.length;i++){
    for(let j=i+1;j<TREATS.length;j++){
      const a=TREATS[i], b=TREATS[j];
      if(Math.abs(b.y-a.y)>BONE_STACK*0.9) continue;   // different layers never clash
      const dx=b.x-a.x, d=Math.abs(dx), minD=BONE_HW*1.15;
      if(d>=minD) continue;
      const s = d<1e-5 ? (Math.random()<0.5?-1:1) : (dx>0?1:-1);
      const push=(minD-d)*0.5;
      a.x=clamp(a.x-s*push,0.03,0.97); b.x=clamp(b.x+s*push,0.03,0.97);
      a.vx-=s*push*2.0; b.vx+=s*push*2.0;
      a.vrot-=s*push*7; b.vrot+=s*push*7;
    }
  }
}
// The bone itself: a hard brutalist silhouette — heavy black outline laid down by drawing the
// shape oversized underneath — with warm ivory on top, a shadowed underside and a hard specular
// band, so it reads as a solid object rather than a flat sticker.
function boneShapePath(ctx){
  ctx.beginPath();
  ctx.rect(-6.0,-2.6,12.0,5.2);
  ctx.moveTo(-3.0,-3.3); ctx.arc(-6.0,-3.3,3.0,0,7);
  ctx.moveTo(-3.0, 3.3); ctx.arc(-6.0, 3.3,3.0,0,7);
  ctx.moveTo( 9.0,-3.3); ctx.arc( 6.0,-3.3,3.0,0,7);
  ctx.moveTo( 9.0, 3.3); ctx.arc( 6.0, 3.3,3.0,0,7);
}
function drawBoneTreat(ctx,px,py,s,rot,squash){
  const sq=1-(squash||0)*0.45;
  ctx.save();
  ctx.translate(px,py); ctx.rotate(rot||0); ctx.scale(s*(1+(squash||0)*0.18), s*sq);
  ctx.save(); ctx.scale(1.22,1.22); boneShapePath(ctx); ctx.fillStyle="#0b0a08"; ctx.fill(); ctx.restore();
  boneShapePath(ctx); ctx.fillStyle="#f4ecdb"; ctx.fill();
  ctx.save(); boneShapePath(ctx); ctx.clip();
  ctx.fillStyle="#c9b99b"; ctx.fillRect(-11,0.9,22,9);      // weight underneath
  ctx.fillStyle="#8f8064"; ctx.fillRect(-11,3.1,22,9);      // deepest shadow at the base
  ctx.fillStyle="#fffdf5"; ctx.fillRect(-11,-6.6,22,2.0);   // hard specular band along the top
  ctx.restore();
  ctx.restore();
}
function nearestTreatIdx(){
  let best=-1, bd=9;
  for(let i=0;i<TREATS.length;i++){
    const d=Math.abs(TREATS[i].x-CAM.x);
    if(d<bd){ bd=d; best=i; }
  }
  return best;
}
function eatBoneEffects(){
  S.hunger=clamp(S.hunger+8,0,100); S.energy=clamp(S.energy+12,0,100);
  S.mood=clamp(S.mood+8,0,100); S.fun=clamp(S.fun+6,0,100);
  addXP(0.3); heartsBurst(1);
  beep(700,.05); setTimeout(()=>beep(940,.06),80);
  renderMeters(); renderNourish();
}
// 5 real minutes pinned at peak mood, then tickStats' own target-tracking (see there) eases him
// back down toward whatever his hunger/thirst/energy/clean/fun actually add up to — a real high,
// not a permanent free ride
let MOOD_BOOST_T=0;
function triggerBoneZoomies(){
  if(CAM.state==="zoomies"||R.active||OUTING.active||PK.active||WASH.active) return;
  S.mood=100; MOOD_BOOST_T=300; S.fun=clamp(S.fun+20,0,100);
  CAM.state="zoomies"; CAM.zTarget=CAM.x<0.4?0.98:-0.18; CAM.t=0; CAM.until=5.5; CAM.fi=0;
  ROBOT.zoomArm=true;               // one topple roll per zoomies, not one per frame
  heartsBurst(6); toast("THE ZOOMIES!! HE'S SENDING BONES FLYING!");
  beep(500,.05); setTimeout(()=>beep(750,.05),90); setTimeout(()=>beep(1000,.06),180);
}
function giveBone(){
  if(S.pup.owned && S.sel==="pup"){
    if(S.snacks<=0){ toast("NO BONES LEFT — RESTOCK IN THE SHOP",1); return openShopPanel(); }
    S.snacks--;
    S.pup.hunger=clamp(S.pup.hunger+12,0,100); S.pup.mood=clamp(S.pup.mood+10,0,100);
    pupAddXP(2); tickTodo("p_feed");
    heartsBurst(2); beep(700,.06); toast(S.pup.name+" GOBBLES IT UP!");
    renderMeters(); renderNourish(); return;
  }
  if(S.snacks<=0){ toast("NO BONES LEFT — RESTOCK IN THE SHOP",1); return openShopPanel(); }
  if(TREATS.length>=BONE_MAX){ toast("THAT'S PLENTY OF BONES ON THE FLOOR!",1); beep(200,.08); return; }
  S.snacks--;
  TREATS.push({
    x:clamp(CAM.x+(Math.random()-0.5)*0.36, 0.08, 0.92),
    y:0.10+Math.random()*0.07,
    vx:(Math.random()-0.5)*0.26, vy:0.04,
    rot:Math.random()*6.283, vrot:(Math.random()-0.5)*16,
    settled:false, squash:0
  });
  beep(560+Math.random()*90,.05);
  toast("A BONE FOR "+NAME()+" — "+S.snacks+" LEFT");
  renderMeters(); renderNourish(); renderSupplies();
  if(TREATS.length>=BONE_ZOOM_AT) triggerBoneZoomies();
}
const PULSE={k:null,t:0};
function setPulse(k){ PULSE.k=k; PULSE.t=3; }
const PUP={x:0.72,dir:-1,st:"idle",t:0,until:2,fi:0,ft:0,w:0.1,hF:0.12,tx:0,next:"idle"};
const STAY={bones:0,pup:0};
const TRICK={live:false, mult:1, ticks:0, airT:0, floorB:0, hitWall:false, hitWin:false, swish:0};
const HOOP={x0:0.585,x1:0.685,y:0.44};
function trickBounce(){
  if(!TRICK.live) return;
  TRICK.mult=Math.min(6,TRICK.mult+1);
  beep(260+TRICK.mult*110,.05,"square",.04);
}
const CAMZ=()=>S.pup.owned?0.8:1;
function pupAddXP(n){
  if(!S.pup.owned) return;
  S.pup.xp=(S.pup.xp||0)+n;
  let need=15+S.pup.lvl*6;
  while(S.pup.xp>=need && S.pup.lvl<50){
    S.pup.xp-=need; S.pup.lvl++;
    need=15+S.pup.lvl*6;
    toast(S.pup.name+" REACHED LV."+S.pup.lvl+"!");
    heartsBurst(3); beep(880,.08); setTimeout(()=>beep(1170,.1),110);
  }
  renderDogSel();
}
function doStay(id){
  STAY[id]=Date.now()+120000;
  if(id==="bones"){
    dropBallHere(); CAM.bedTarget=false; hidePortrait();
    CAM.state="stay"; CAM.until=99; CAM.t=0; CAM.fi=0;
    toast(NAME()+", STAY. GOOD DOG.");
  } else {
    PUP.st="stay";
    toast(S.pup.name+", STAY. GOOD PUP.");
  }
  beep(500,.06); setTimeout(()=>beep(500,.06),140);
  renderDogSel();
}
function pupTick(dt){
  if(!S.pup.owned) return;
  const P2=S.pup;
  P2.hunger=clamp(P2.hunger-0.030*dt*1.5,0,100);
  P2.thirst=clamp(P2.thirst-0.036*dt*1.5,0,100);
  P2.mood=clamp(P2.mood-0.012*dt*1.5,0,100);
  PUP.t+=dt; PUP.ft+=dt;
  if(PUP.ft>0.3){ PUP.ft=0; PUP.fi++; }
  if(PUP.st==="stay"){
    if(STAY.pup<=Date.now()){ PUP.st="idle"; PUP.t=0; PUP.until=1; renderDogSel(); }
    return;
  }
  if(PUP.st==="fetchgo"){
    PUP.tx = clamp(BALL.x-0.02,0.03,0.92);
    PUP.dir = PUP.tx>PUP.x?1:-1;
    PUP.x += PUP.dir*0.09*dt;
    if(Math.abs(PUP.x-PUP.tx)<0.025){
      BALL.pcarried=true; BALL.held=false; BALL.vx=0; BALL.vy=0; BALL.off=false; TRICK.live=false;
      PUP.st="fetchret"; PUP.tx=0.42; beep(320,.06);
    }
    return;
  }
  if(PUP.st==="fetchret"){
    PUP.dir = PUP.tx>PUP.x?1:-1;
    PUP.x += PUP.dir*0.08*dt;
    if(Math.abs(PUP.x-PUP.tx)<0.02){
      BALL.pcarried=false;
      BALL.x=clamp(PUP.x+PUP.w*0.8,0.03,0.95); BALL.y=0.795; BALL.vx=0; BALL.vy=0; BALL.cool=1.5;
      PUP.st="yip"; PUP.t=0; PUP.until=1.2;
      heartsBurst(2); beep(900,.06); setTimeout(()=>beep(1050,.07),120);
      pupAddXP(6); tickTodo("p_play");
      toast(S.pup.name+" BRINGS IT BACK! GOOD PUP!");
    }
    return;
  }
  if(PUP.st==="yip"){
    if(PUP.t>=PUP.until){ PUP.st="idle"; PUP.t=0; PUP.until=1.5; }
    return;
  }
  if(PUP.st==="nap"){
    P2.mood=clamp(P2.mood+1.2*dt,0,100);
    if(!(CLK.h>=22||CLK.h<6)){ PUP.st="idle"; PUP.t=0; PUP.until=1; }
    return;
  }
  if(PUP.st==="drink"||PUP.st==="eat"){
    if(PUP.st==="drink"){ P2.thirst=clamp(P2.thirst+10*dt,0,100); BOWL.level=Math.max(0,BOWL.level-0.05*dt); }
    else { P2.hunger=clamp(P2.hunger+9*dt,0,100); FBOWL.level=Math.max(0,FBOWL.level-0.05*dt); }
    if(PUP.t>4 || (PUP.st==="drink"?P2.thirst:P2.hunger)>=90 || (PUP.st==="drink"?BOWL:FBOWL).level<=0){
      PUP.st="idle"; PUP.t=0; PUP.until=1.5;
    }
    return;
  }
  if(PUP.st==="go"){
    PUP.dir = PUP.tx>PUP.x?1:-1;
    PUP.x += PUP.dir*0.06*dt;
    if(Math.abs(PUP.x-PUP.tx)<0.02){ PUP.st=PUP.next; PUP.dir=-1; PUP.t=0; if(PUP.next==="idle") PUP.until=1.5; }
    return;
  }
  if((PUP.st==="idle"||PUP.st==="walk") && Math.abs((PUP.x+PUP.w/2)-(CAM.x+CAMDWF/2))<0.14){
    PUP.st="walk";
    PUP.dir = (PUP.x+PUP.w/2)<(CAM.x+CAMDWF/2) ? -1 : 1;
    PUP.until=Math.max(PUP.until,0.8);
  }
  if(PUP.st==="walk"){
    PUP.x=clamp(PUP.x+PUP.dir*0.045*dt,0.05,0.9);
    if(PUP.x<=0.05||PUP.x>=0.9) PUP.dir*=-1;
  }
  if(PUP.t>=PUP.until){
    PUP.t=0;
    if(P2.thirst<48 && BOWL.level>0.05){ PUP.st="go"; PUP.tx=0.06; PUP.next="drink"; PUP.until=99; return; }
    if(P2.hunger<48 && FBOWL.level>0.05){ PUP.st="go"; PUP.tx=0.14; PUP.next="eat"; PUP.until=99; return; }
    if((CLK.h>=22||CLK.h<6) && S.bedTier>0){ PUP.st="go"; PUP.tx=0.845; PUP.next="nap"; PUP.until=99; return; }
    PUP.st = Math.random()<0.5 ? "walk" : "idle";
    PUP.dir = Math.random()<0.5?-1:1;
    PUP.until = 1.5+Math.random()*2.5;
  }
}
const PET = { left:6, timer:0, lp:0, px:0, py:0, stroked:false, heat:0, down:false };
const CLK = { h:8, day:1 };
const SLEEP = { pending:false, active:false };
const FLY = { active:false, x:0, y:0.45, dir:1, t:0, next:35+Math.random()*50 };
const BALL = { x:0.28, y:0.795, vx:0, vy:0, held:false, tx:0, ty:0, cool:0, off:false, offSide:1, carried:false, pcarried:false, carryT:0 };
const HP = []; let heartNext=0;
const WASH={active:false,pending:false,timer:0,heat:0};
const SUDS=[];
const DRIPS=[]; // blue water drips shed by the wet sponge
const OUTING={active:false,timer:0,kind:""};
function startOuting(kind,dur){
  OUTING.active=true; OUTING.timer=dur; OUTING.kind=kind;
  S.outTimer=0;
  hidePortrait(); closeStatus();
  toast("BONES IS OUT: "+kind); beep(600,.08);
}
let CAMDWF=0.30; // live sprite width as fraction of cam

function heartsBurst(n){
  for(let i=0;i<n;i++) HP.push({x:CAM.x+0.10+(Math.random()-0.5)*0.10, rise:Math.random()*12, life:1.6, i:Math.floor(Math.random()*HEARTIMG.length)});
}
function dropBallHere(){
  if(BALL.pcarried){
    BALL.pcarried=false;
    BALL.x=clamp(PUP.x+PUP.w*0.7,0.03,0.95); BALL.y=0.795;
    BALL.vx=0; BALL.vy=0; BALL.cool=1.5;
  }
  if(!BALL.carried) return;
  BALL.carried=false; BALL.off=false;
  BALL.x=clamp(CAM.x+CAMDWF*0.8,0.03,0.95); BALL.y=0.795;
  BALL.vx=0; BALL.vy=0; BALL.cool=1.5;
  CAM.fetchPhase=0;
}
function toggleRest(){
  dropBallHere();
  if(CAM.state==="rest"||CAM.bedTarget){
    CAM.state="idle"; CAM.bedTarget=false; CAM.t=0; CAM.until=1+Math.random(); CAM.fi=0;
    toast("BONES IS UP."); beep(520,.06);
  } else {
    CAM.bedTarget=true; CAM.state="walk"; CAM.t=0; CAM.until=99; CAM.fi=0;
    toast("BONES HEADS TO BED."); beep(360,.08);
  }
}
function callBones(){
  STAY.bones=0;
  dropBallHere();
  CAM.bedTarget=false;
  CAM.state="come"; CAM.t=0; CAM.until=99; CAM.fi=0;
  beep(950,.06); setTimeout(()=>beep(1250,.08),90); // whistle
}
function camBehavior(dt){
  if(EVO.active){
    EVO.t+=dt;
    if(EVO.t>=3.9){
      EVO.active=false; LVLFX=1.0;
      openChoice("BONES IS NOW "+EVO.label+"!", EVO.lines, "CONTINUE", null);
    }
    return;
  }
  if(OUTING.active) return;
  const moodMul=(0.55+0.9*S.mood/100)*(S.senior?0.7:1);
  CAM.t+=dt; CAM.ft+=dt; CAM.woof=Math.max(0,CAM.woof-dt);
  CAM.dirT=(CAM.dirT||0)+dt;
  const fd = CAM.state==="rest"?0.5 : (CAM.state==="come"||CAM.state==="chase"||CAM.state==="fetch")?0.11 : (CAM.state==="walk"||CAM.state==="drinkgo"||CAM.state==="eatgo"||CAM.state==="beggo")?0.16/Math.max(0.6,moodMul) : CAM.state==="shake"?0.12 : CAM.state==="catch"?0.30 : CAM.state==="bark"?0.20 : 0.24;
  if(CAM.ft>=fd){ CAM.ft=0; CAM.fi++; }
  // hearts when fully satisfied
  if(avgStat()>90){
    heartNext-=dt;
    if(heartNext<=0){ heartNext=1.1; heartsBurst(1); }
  }
  for(let i=HP.length-1;i>=0;i--){ const p=HP[i]; p.rise+=26*dt; p.life-=dt; if(p.life<=0) HP.splice(i,1); }
  for(let i=SUDS.length-1;i>=0;i--){ const s=SUDS[i]; s.y-=0.04*dt; s.life-=dt; if(s.life<=0) SUDS.splice(i,1); }
  if(SPONGE.held && Math.random()<0.3) DRIPS.push({x:SPONGE.x+(Math.random()-0.5)*0.01, y:SPONGE.y+0.015, vy:0.12+Math.random()*0.18, life:0.5+Math.random()*0.3});
  for(let i=DRIPS.length-1;i>=0;i--){ const d=DRIPS[i]; d.y+=d.vy*dt; d.life-=dt; if(d.life<=0) DRIPS.splice(i,1); }
  if(DRIPS.length>60) DRIPS.splice(0,DRIPS.length-60);
  PET.timer+=dt; if(PET.timer>20){ PET.timer=0; PET.left=6; }
  PET.heat=Math.max(0,PET.heat-dt);
  if(BALL.carried && CAM.state!=="fetch") dropBallHere(); // watchdog: no eternal ball-mouth
  PULSE.t=Math.max(0,PULSE.t-dt);
  LVLFX=Math.max(0,LVLFX-dt);
  for(let i=XPF.length-1;i>=0;i--){ XPF[i].life-=dt; if(XPF[i].life<=0) XPF.splice(i,1); }
  // ball physics (heavy, springy drag)
  BALL.cool=Math.max(0,BALL.cool-dt);
  const FLOOR=0.795;
  if(BALL.pcarried){
    BALL.x = PUP.x + (PUP.dir>0? PUP.w*0.75 : PUP.w*0.05);
    BALL.y = 0.82 - (PUP.hF||0.12)*0.45;
  } else if(BALL.carried){
    BALL.x = CAM.x + (CAM.dir>0? CAMDWF*0.85 : CAMDWF*0.10);
    BALL.y = 0.82 - (0.46*stageScale(Math.min(XPANIM.lvl,S.lvl)))*0.40;      // scales with his real on-screen size — always at the mouth
  } else if(BALL.off){
    /* out of the room, waiting to be fetched */
  } else if(BALL.held){
    BALL.vx += ((BALL.tx-BALL.x)*16 - BALL.vx*7)*dt;
    BALL.vy += ((BALL.ty-BALL.y)*16 - BALL.vy*7)*dt;
    BALL.x+=BALL.vx*dt; BALL.y+=BALL.vy*dt;
  } else {
    BALL.vy += 2.6*dt;
    BALL.x+=BALL.vx*dt; BALL.y+=BALL.vy*dt;
    // window is solid glass: clean reflections, extra style points
    if(BALL.x>0.72 && BALL.x<0.90 && BALL.y>0.14 && BALL.y<0.34){
      const pl=BALL.x-0.72, pr=0.90-BALL.x, pt=BALL.y-0.14, pb=0.34-BALL.y;
      const m=Math.min(pl,pr,pt,pb);
      if(m===pl){ BALL.x=0.72; BALL.vx=-Math.abs(BALL.vx)*0.75; }
      else if(m===pr){ BALL.x=0.90; BALL.vx=Math.abs(BALL.vx)*0.75; }
      else if(m===pt){ BALL.y=0.14; BALL.vy=-Math.abs(BALL.vy)*0.75; }
      else { BALL.y=0.34; BALL.vy=Math.abs(BALL.vy)*0.75; }
      trickBounce(); TRICK.hitWin=true;
      beep(1400,.05,"square",.03);   // glass tink
    }
    if(S.hoopOwned){
      const py=BALL.y-BALL.vy*dt;   // previous y this frame
      if(BALL.vy>0 && py<=HOOP.y && BALL.y>HOOP.y && BALL.x>HOOP.x0+0.018 && BALL.x<HOOP.x1-0.018){
        TRICK.swish++;
        if(TRICK.live) TRICK.mult=Math.min(6,TRICK.mult+1);
        addXP(1); renderMeters();
        beep(980,.06); setTimeout(()=>beep(1320,.08),80);   // swish!
      }
      for(const rx of [HOOP.x0,HOOP.x1]){
        if(Math.hypot(BALL.x-rx,(BALL.y-HOOP.y)*1.2)<0.022){
          BALL.vx = (BALL.x<rx?-1:1)*Math.max(0.25,Math.abs(BALL.vx))*0.8;
          BALL.vy*=-0.5;
          trickBounce();
        }
      }
    }
    if(TRICK.live){
      if(BALL.y<0.38){
        TRICK.airT+=dt;
        while(TRICK.airT>0.09){
          TRICK.airT-=0.09; TRICK.ticks++;
          beep(880+Math.min(TRICK.ticks,30)*22,.03,"square",.022);
        }
      }
      if(BALL.y>=FLOOR-0.01 && BALL.vy===0){ TRICK.live=false; }   // rolling or resting = dead, instantly
    }
    if(BALL.y>FLOOR){
      BALL.y=FLOOR;
      if(Math.abs(BALL.vy)>0.30){
        trickBounce();
        TRICK.floorB++;
        if(TRICK.floorB>=3 && TRICK.live){ TRICK.live=false; beep(160,.12,"sawtooth",.03); }  // 3rd floor bounce kills it
      }
      // settle instead of bounce once the incoming speed is small — checking the INCOMING
      // velocity (not what's left after the *-0.69 damping) means a resting ball actually stops,
      // rather than micro-bouncing forever off gravity alone. That mattered: at accelerated
      // (work/Delivery Driver) timescales a single gravity tick was enough to push a "resting"
      // ball's vy back over the 0.05 "is this ball live" threshold, so BONES never stopped
      // re-noticing and re-fetching it — a fetch loop that never actually settled.
      if(Math.abs(BALL.vy)<0.12) BALL.vy=0;
      else BALL.vy*=-0.69;
      BALL.vx*=0.92;
    }
    if(BALL.y<0.05 && BALL.vy<0){ BALL.y=0.05; BALL.vy*=-0.75; trickBounce(); }
    if(BALL.x<0.02){ if(Math.abs(BALL.vx)>0.45){ BALL.off=true; BALL.offSide=-1; BALL.vx=0; BALL.vy=0; } else { BALL.x=0.02; BALL.vx*=-0.75; trickBounce(); TRICK.hitWall=true; } }
    if(BALL.x>0.98){ if(Math.abs(BALL.vx)>0.45){ BALL.off=true; BALL.offSide=1;  BALL.vx=0; BALL.vy=0; } else { BALL.x=0.98; BALL.vx*=-0.75; trickBounce(); TRICK.hitWall=true; } }
    BALL.vx*=(1-0.4*dt);
    if(BALL.off && CAM.state!=="fetch"){ CAM.state="fetch"; CAM.fetchPhase=1; CAM.bedTarget=false; CAM.until=99; CAM.t=0; CAM.fi=0; toast("BONES GOES AFTER IT!"); }
  }
  // the fly
  FLY.next-=dt;
  if(!FLY.active && FLY.next<=0 && CAM.state!=="rest" && !CAM.bedTarget){
    FLY.active=true; FLY.t=0; FLY.dir=Math.random()<0.5?1:-1;
    FLY.x=FLY.dir>0?-0.05:1.05;
  }
  if(FLY.active){
    FLY.t+=dt; FLY.x+=FLY.dir*0.07*dt; FLY.y=0.45+Math.sin(FLY.t*7)*0.08;
    const near=Math.abs(FLY.x-(CAM.x+0.10))<0.16;
    if(near && CAM.state!=="catch" && CAM.state!=="rest" && CAM.state!=="come"){ CAM.state="catch"; CAM.fi=0; CAM.t=0; CAM.until=99; }
    if(CAM.state==="catch" && !BALL.held){
      CAM.dir = FLY.x>CAM.x+0.10?1:-1;
      if(near && FLY.t>0.8 && Math.random()<0.010){
        FLY.active=false; FLY.next=60+Math.random()*90;
        S.fun=clamp(S.fun+10,0,100); S.mood=clamp(S.mood+4,0,100);
        addXP(4); toast("BONES CAUGHT THE FLY. +FUN"); beep(900,.08);
        CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0;
      }
    }
    if(FLY.active&&(FLY.x<-0.08||FLY.x>1.08)){
      FLY.active=false; FLY.next=60+Math.random()*90;
      if(CAM.state==="catch"){ CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0; }
    }
  }
  // fetch: ball flew out of the room
  if(CAM.state==="fetch"){
    if(CAM.fetchPhase===5){                       // sent by the FETCH button: retrieve from wherever it lies
      const tx=clamp(BALL.x - CAMDWF*0.5, 0.02, 0.95);
      CAM.dir = tx>CAM.x?1:-1;
      CAM.x += CAM.dir*0.13*dt;
      if(Math.abs(CAM.x-tx)<0.025){
        BALL.carried=true; BALL.vx=0; BALL.vy=0; BALL.held=false;
        CAM.fetchPhase=3; CAM.t=0; beep(320,.06);
      }
      return;
    }
    if(CAM.fetchPhase===4){                       // holds it in his mouth a moment
      if(CAM.t>1.0){ CAM.fetchPhase=3; CAM.t=0; }
    } else if(CAM.fetchPhase===1){                       // sprint to the edge (and out of frame)
      CAM.dir = BALL.offSide;
      CAM.x += CAM.dir*0.22*dt;
      if((BALL.offSide>0&&CAM.x>=1.0)||(BALL.offSide<0&&CAM.x<=-0.20)){ CAM.fetchPhase=2; CAM.t=0; }
    } else if(CAM.fetchPhase===2){                // a beat off-screen
      if(CAM.t>0.5){ BALL.off=false; BALL.carried=true; CAM.fetchPhase=3; }
    } else {                                      // trot back, drop it, bark
      const cx=0.40;
      CAM.dir = cx>CAM.x?1:-1;
      CAM.x += CAM.dir*0.15*dt;
      if(Math.abs(CAM.x-cx)<0.02){
        BALL.carried=false;
        BALL.x=clamp(CAM.x + CAMDWF*0.80, 0.05, 0.95);
        BALL.y=0.795; BALL.vx=0; BALL.vy=0; BALL.cool=2;
        S.fun=clamp(S.fun+12,0,100); S.mood=clamp(S.mood+6,0,100); heartsBurst(3);
        toast("BONES DROPS THE BALL! +FUN"); beep(880,.07); setTimeout(()=>beep(1100,.07),90);
        bark(1); setTimeout(()=>bark(0.9),150);
        CAM.state="bark"; CAM.woof=1.8; CAM.t=0; CAM.until=1.8; CAM.fi=0; CAM.fetchPhase=0;
      }
    }
    return;
  }
  // chase: a moving or held ball is irresistible
  const ballLive = S.ballOwned && (BALL.held || Math.abs(BALL.vx)>0.05 || Math.abs(BALL.vy)>0.05);
  if(!BALL.off && !BALL.carried && !BALL.held && ballLive && BALL.cool<=0 && CAM.state!=="rest" && CAM.state!=="come" && CAM.state!=="zoomies" && CAM.state!=="stay" && !BALL.pcarried && !CAM.bedTarget){
    const aim = clamp(BALL.x + BALL.vx*0.25, 0.02, 0.95); // reads the throw, not the ball
    // compare against his CENTRE, never the dir-dependent mouth: deriving the mouth from the
    // facing and the facing from the mouth is what made him strobe under a held ball
    const ctr = CAM.x + CAMDWF*0.5;
    if(Math.abs(aim-ctr) > CAMDWF*0.34) camFace(aim>ctr?1:-1, dt);
    const mouth = CAM.x + (CAM.dir>0? CAMDWF*0.80 : CAMDWF*0.20);
    const near = Math.abs(aim-mouth)<0.10;
    CAM.state = (near && BALL.y<0.60) ? "catch" : "chase"; // rears only when it is above him
    tickTodo("d_ball");
    CAM.until=99;
    CAM.x = clamp(CAM.x + CAM.dir*(near?0.06:0.16)*dt, 0.02, 0.86);
    if(Math.abs(BALL.x-mouth)<0.05 && BALL.y>0.50){
      BALL.held=false; BALL.vx=0; BALL.vy=0; BALL.carried=true;
      let bonus=0, m0=TRICK.mult, t0=TRICK.ticks;
      if(TRICK.live){
        const airborne = BALL.vy!==0 || BALL.y<FLOOR-0.02;
        let q=0, label="CATCH";
        if(airborne){ q=2; label="AIR CATCH"; }
        if(airborne && BALL.vy>0.9){ q=4; label="LEAPING CATCH"; }
        if(TRICK.hitWin){ q+=3; label="OFF-THE-WINDOW "+label; }
        else if(TRICK.hitWall){ q+=2; label="WALL-BOUNCE "+label; }
        if(TRICK.swish>0){ q+=3; label="SWISH "+label; }
        bonus=Math.min(30,(m0-1)*3+Math.floor(t0/4)+q);
        TRICK.live=false;
        if(bonus>0){
          toast(label+(m0>1?" x"+m0:"")+"! +"+(4+bonus)+" XP");
          heartsBurst(Math.min(5,1+m0));
          beep(700,.05); setTimeout(()=>beep(1000,.07),90); setTimeout(()=>beep(1300,.08),180);
        } else beep(700,.05);
      } else beep(700,.05); // rolling pickup: no ceremony
      addXP(4+bonus);
      CAM.state="fetch"; CAM.fetchPhase=4; CAM.t=0; CAM.until=99; CAM.fi=0;
    }
  } else if(!ballLive && !FLY.active && (CAM.state==="catch"||CAM.state==="chase")){
    CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0;
  }
  // the zoomies: pure joy, darting off both edges and back
  if(CAM.state==="zoomies"){
    CAM.dir = CAM.zTarget>CAM.x?1:-1;
    CAM.x += CAM.dir*0.62*dt;
    // barrelling through the pile sends bones tumbling everywhere
    for(const tr of TREATS){
      if(Math.abs(tr.x-CAM.x)<0.075 && tr.y>0.72){
        tr.settled=false;
        tr.vx += CAM.dir*(0.30+Math.random()*0.40);
        tr.vy = -(0.32+Math.random()*0.45);
        tr.vrot = (Math.random()-0.5)*26;
        tr.squash=0.4;
      }
    }
    if(Math.abs(CAM.x-CAM.zTarget)<0.04) CAM.zTarget = CAM.zTarget>0.4 ? -0.18 : 0.98;
    CAM.zHeart=(CAM.zHeart||0)-dt;
    if(CAM.zHeart<=0){ CAM.zHeart=0.22; heartsBurst(1); beep(680+Math.random()*260,.04,"square",.025); }
    if(CAM.t>=CAM.until){ CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0; toast("BONES SETTLES DOWN, TAIL STILL WAGGING."); }
    return;
  }
  // called: pounce-run to centre, bark in response, wait
  if(CAM.state==="come"){
    const cx=0.40;
    CAM.dir = cx>CAM.x?1:-1;
    CAM.x += CAM.dir*0.16*dt;
    if(Math.abs(CAM.x-cx)<0.02){
      if(WASH.pending){
        WASH.pending=false; WASH.active=true; WASH.timer=15; WASH.heat=0;
        CAM.state="wash"; CAM.t=0; CAM.until=99; CAM.fi=0;
        toast("SCRUB BONES WITH YOUR FINGER!");
      } else {
        CAM.state="bark"; CAM.t=0; CAM.until=1.6; CAM.woof=1.6; CAM.cameCalled=true; CAM.fi=0;
        bark(1); setTimeout(()=>bark(0.95),150);
        if(CAM.needCheck){ CAM.needCheck=false; setTimeout(showLowestNeed,900); }
      }
    }
    return;
  }
  if(CAM.state==="rest"){
    const cap=bedAdequate()?100:70;
    if(S.energy>=cap){
      if(!bedAdequate()) toast(S.bedTier===0?"NO PROPER BED \u2014 BONES ONLY RESTS TO 70%":"BED TOO SMALL \u2014 BONES ONLY RESTS TO 70%",1);
      toggleRest();
    }
    return;
  }
  if(CAM.state==="catch") return;
  if(CAM.state==="wash"){
    WASH.timer-=dt; WASH.heat=Math.max(0,WASH.heat-dt*2);
    for(let i=SUDS.length-1;i>=0;i--){ const s=SUDS[i]; s.y-=0.04*dt; s.life-=dt; if(s.life<=0) SUDS.splice(i,1); }
    if(S.clean>=100 || WASH.timer<=0){
      WASH.active=false; SUDS.length=0;
      S.mood=clamp(S.mood+5,0,100); addXP(6); heartsBurst(2);
      toast(S.clean>=99 ? "SQUEAKY CLEAN!" : "BATH TIME OVER."); beep(880,.08);
      CAM.state="shake"; CAM.t=0; CAM.until=1.4; CAM.fi=0; // shakes himself dry
    }
    return;
  }
  // trotting over to a bone on the floor, then wolfing it down
  if(CAM.state==="treatgo"){
    const i=nearestTreatIdx();
    if(i<0){ CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0; return; }
    const tx=TREATS[i].x;
    CAM.dir = tx>CAM.x?1:-1;
    CAM.x += CAM.dir*0.17*dt;
    if(Math.abs(CAM.x-tx)<0.035){ CAM.state="treateat"; CAM.t=0; CAM.until=0.7; CAM.fi=0; }
    return;
  }
  if(CAM.state==="treateat"){
    if(CAM.t>=CAM.until){
      const i=nearestTreatIdx();
      if(i>=0 && Math.abs(TREATS[i].x-CAM.x)<0.09){ TREATS.splice(i,1); eatBoneEffects(); }
      CAM.state="idle"; CAM.t=0; CAM.until=0.4; CAM.fi=0;
    }
    return;
  }
  if(CAM.state==="eatgo"){
    const tx=0.135;
    CAM.dir = tx>CAM.x?1:-1;
    CAM.x += CAM.dir*0.08*dt;
    if(Math.abs(CAM.x-tx)<0.015){ CAM.state="eat"; CAM.dir=-1; CAM.t=0; CAM.until=99; CAM.fi=0; }
    return;
  }
  if(CAM.state==="eat"){
    S.hunger=clamp(S.hunger+9*dt,0,100);
    FBOWL.level=Math.max(0,FBOWL.level-0.09*dt);
    if(S.hunger>=88 || FBOWL.level<=0 || CAM.t>6){
      if(S.hunger>=88){ heartsBurst(1); addXP(2); }
      CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0;
    }
    return;
  }
  if(CAM.state==="stay"){
    if(STAY.bones<=Date.now()){
      CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0;
      toast(NAME()+" RELAXES."); renderDogSel();
    }
    return;
  }
  if(CAM.state==="begwait"){
    if(CAM.t>=CAM.until){ hidePortrait(); CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0; }
    return;
  }
  if(CAM.state==="beggo"){
    const tx = CAM.begKind==="water"?0.05:0.135;
    CAM.dir = tx>CAM.x?1:-1;
    CAM.x += CAM.dir*0.08*dt;
    if(Math.abs(CAM.x-tx)<0.015){
      CAM.state="beg"; CAM.dir=-1; CAM.t=0; CAM.until=99; CAM.fi=0;
      CAM.begT=0; CAM.nextWhine=30;
      showPortrait("confused",5000);   // "the bowl is empty...?"
    }
    return;
  }
  if(CAM.state==="beg"){
    CAM.begT+=dt;
    const empty = CAM.begKind==="water" ? BOWL.level<=0.05 : FBOWL.level<=0.05;
    if(!empty){ hidePortrait(); CAM.state="idle"; CAM.t=0; CAM.until=0.4; CAM.fi=0; return; }
    if(CAM.begT>CAM.nextWhine){    // prolonged: confusion turns to sadness
      CAM.nextWhine += 20;
      showPortrait("sad",6000);
      beep(140,.3,"sawtooth",.03); // low whine
      S.mood=clamp(S.mood-2,0,100);
    }
    return;
  }
  if(CAM.state==="drinkgo"){
    const tx=0.05;
    CAM.dir = tx>CAM.x?1:-1;
    CAM.x += CAM.dir*0.08*dt;
    if(Math.abs(CAM.x-tx)<0.015){ CAM.state="drink"; CAM.dir=-1; CAM.t=0; CAM.until=99; CAM.fi=0; }
    return;
  }
  if(CAM.state==="drink"){
    S.thirst = clamp(S.thirst+9*dt,0,100);
    BOWL.level = Math.max(0, BOWL.level-0.09*dt);
    if(S.thirst>=88 || BOWL.level<=0 || CAM.t>6){
      if(S.thirst>=88){ heartsBurst(1); addXP(2); }
      CAM.state="idle"; CAM.t=0; CAM.until=1; CAM.fi=0;
    }
    return;
  }
  if(CAM.state==="walk"){
    if(CAM.bedTarget){
      CAM.dir = BED.x+0.02>CAM.x?1:-1;
      CAM.x += CAM.dir*0.07*dt;
      if(Math.abs(CAM.x-(BED.x+0.02))<0.015){ CAM.bedTarget=false; CAM.state="rest"; CAM.fi=0; CAM.t=0; CAM.until=99; beep(300,.1); }
      return;
    }
    CAM.x += CAM.dir*0.05*moodMul*dt;
    if(CAM.x>0.82){CAM.x=0.82;CAM.dir=-1}
    if(CAM.x<0.05){CAM.x=0.05;CAM.dir=1}
  }
  if(CAM.t>=CAM.until){
    CAM.t=0; CAM.fi=0;
    if(TREATS.some(tr=>tr.settled)){ CAM.state="treatgo"; CAM.until=99; }   // a bone on the floor wins every time
    else if(S.thirst<48 && BOWL.level>0.05){ CAM.state="drinkgo"; CAM.until=99; }
    else if(S.hunger<48 && FBOWL.level>0.05){ CAM.state="eatgo"; CAM.until=99; }
    else if((S.thirst<45 && BOWL.level<=0.05) || (S.hunger<45 && FBOWL.level<=0.05)){
      CAM.begKind = (S.thirst<45 && BOWL.level<=0.05) ? "water" : "food";
      CAM.state="beggo"; CAM.until=99;
    }
    else if(CAM.state==="walk"){
      const r=Math.random();
      if(S.fun<30 && r<0.45){ CAM.state="bark"; CAM.until=2.4; CAM.woof=2.4; bark(0.75); setTimeout(()=>bark(0.7),160); }
      else if(r<0.15){ CAM.state="shake"; CAM.until=1.3; }
      else if(r<0.65){ CAM.state="sniff"; CAM.until=2+Math.random()*2.5; }
      else { CAM.state="idle"; CAM.until=1.2+Math.random()*1.5; }
    } else if(CAM.state==="bark" && CAM.cameCalled){
      CAM.cameCalled=false; CAM.state="idle"; CAM.until=4; // waits for you
    } else {
      CAM.state="walk";
      if(Math.random()<0.4) CAM.dir*=-1;
      CAM.until=2.5+Math.random()*3;
    }
  }
}
function nightAmount(){
  // bright all day, dims through the 23:00 hour, fully dark right at midnight (bedtime) —
  // and stays fully dark through the sleep choice, so it never flashes bright mid-decision
  if(SLEEP.active) return 1;
  const h=CLK.h;
  return h<23 ? 0 : clamp(h-23,0,1);
}
// soft window-light: two overlapping gradient beams fan down-left from the window across the
// room, plus a handful of drifting dust motes catching the light — fades out with nightAmount()
// so it only shows during the brighter hours, never competing with the night tint
function drawSunray(ctx,w,h,t){
  const vis = 1-nightAmount();
  if(vis<=0.02) return;
  ctx.save();
  // the shaft is pinned to the window's own corners: its top edge leaves the top-left corner
  // and its bottom edge leaves the bottom-right one — the two extremes of the opening as seen
  // along the light — so the beam visibly belongs to the window instead of floating mid-room
  const winX=w*0.72, winY=h*0.14, winW=w*0.18, winH=h*0.20;
  const ax=winX, ay=winY;                      // top-left corner  -> upper edge of the shaft
  const cx=winX+winW, cy=winY+winH;            // bottom-right corner -> lower edge
  const angTop=2.83, angBot=2.29;              // edges splay slightly, so the shaft fans out
  const len=Math.max(w,h)*1.35;
  const txp=ax+Math.cos(angTop)*len, typ=ay+Math.sin(angTop)*len;
  const bxp=cx+Math.cos(angBot)*len, byp=cy+Math.sin(angBot)*len;
  // venetian-blind slats: parallel bands with dark gaps between them, each one starting on the
  // window plane and widening toward the floor — that's what gives real blind-light its stripes
  const nSlats=7;
  for(let i=0;i<nSlats;i++){
    const f0=i/nSlats, f1=f0+0.58/nSlats;   // slat is ~58% of its slot; the rest is shadow
    const n0x=ax+(cx-ax)*f0, n0y=ay+(cy-ay)*f0;
    const n1x=ax+(cx-ax)*f1, n1y=ay+(cy-ay)*f1;
    const f0x=txp+(bxp-txp)*f0, f0y=typ+(byp-typ)*f0;
    const f1x=txp+(bxp-txp)*f1, f1y=typ+(byp-typ)*f1;
    const shimmer=0.5+0.5*Math.sin(t*0.2+i*1.35);
    const alpha=(0.055+0.032*shimmer)*vis;
    const grad=ctx.createLinearGradient((ax+cx)/2,(ay+cy)/2,(txp+bxp)/2,(typ+byp)/2);
    grad.addColorStop(0,"rgba(255,247,214,"+alpha+")");
    grad.addColorStop(0.6,"rgba(255,247,214,"+(alpha*0.4)+")");
    grad.addColorStop(1,"rgba(255,247,214,0)");
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(n0x,n0y); ctx.lineTo(n1x,n1y); ctx.lineTo(f1x,f1y); ctx.lineTo(f0x,f0y);
    ctx.closePath(); ctx.fill();
  }
  // dust motes riding the beam — same drift/twinkle as before, just re-aimed down the new shaft
  const mox=(ax+cx)/2, moy=(ay+cy)/2;
  const mdx0=(txp+bxp)/2-mox, mdy0=(typ+byp)/2-moy, mlen=Math.hypot(mdx0,mdy0)||1;
  const dx=mdx0/mlen, dy=mdy0/mlen, px=-dy, py=dx;
  for(let i=0;i<10;i++){
    const seed=i*13.37;
    const travel=(t*(7+(i%4)*2)+seed*11)%len;
    const spread=8+(travel/len)*46;    // motes fan out with the beam
    const wobble=Math.sin(t*0.5+seed)*spread;
    const mx=mox+dx*travel+px*wobble, my=moy+dy*travel+py*wobble;
    const a=(0.3+0.3*Math.sin(t*1.4+seed))*vis;
    if(a<=0.04 || my>h*0.85) continue;
    ctx.fillStyle="rgba(255,250,225,"+a+")";
    ctx.fillRect(mx,my,1.5,1.5);
  }
  ctx.restore();
}
/* ---------- the NOURISH-BOT ---------- */
// He is deliberately not a replacement for the owner: he fills bowls and tidies up, but he
// never ticks a to-do, never earns XP and never lifts mood. Being cared for BY someone is
// still the only thing that counts.
const BF={IDLE:0,REACH:1,LEAN1:2,LEAN2:3,LEAN3:4,LOW1:5,LOW2:6,LOW3:7,COLLAPSED:8,
          FLAIL:9,FALLING:10,TIPPED:11,DOCKED:12};
// where the drawn pixels actually start in each frame, as a fraction of the shared canvas
// height — the poses vary a lot in height, so the battery pip needs this to sit just above
// his head whichever one is showing instead of floating off the top of a hunched frame
const ROBOTTOP=[0,0,0.045,0.023,0.258,0,0,0.28,0.303,0,0.311,0.333,0.386];
const BOT_IDLE_DRAIN=8.0;    // % per game hour while off the dock — the dock has to matter
const BOT_MOVE_DRAIN=0.35;   // % per real second on top of that, whenever the tracks are turning
const BOT_CHARGE=100/12;     // % per game hour: a full charge is half a game day
const BOT_COST={water:20, food:20, poo:15, ball:5};  // two bowl runs is over half his charge
const BOT_RECHARGE_FEE=5;    // the electricity is not free
const BOT_RESERVE=22;        // he won't leave the dock without enough charge to get home again
const BOT_SPEED=0.13;        // screen widths per second
const BOT_GIVEUP=8;          // game hours face-down before he picks himself up (anti-softlock)
function botBowlX(kind){
  const cv=$("#dogcv"), w=cv.clientWidth, h=cv.clientHeight, u=h/42;
  const bwlX=w*0.04, bwlW=u*4, fbX=bwlX+bwlW+8;
  return ((kind==="water"?bwlX:fbX)+bwlW/2)/w;
}
function botJob(){
  if(BOWL.level<0.25) return "water";
  if(FBOWL.level<0.25 && S.kibble>0) return "food";
  if(POOS.length) return "poo";
  if(S.ballOwned && !BALL.off && !BALL.carried && !BALL.held && !BALL.pcarried
     && S.fun<45 && ROBOT.battery>60) return "ball";
  return null;
}
function botJobX(j){
  // he parks to the RIGHT of a bowl rather than on top of it: every pose reaches with the
  // left arm, so this puts the bowl under his hand and keeps the pour clear of his body
  if(j==="water"||j==="food") return botBowlX(j)+0.095;
  if(j==="poo")  return POOS.length?POOS[0].x:ROBOT.dockX;
  if(j==="ball") return BALL.x;
  return ROBOT.dockX;
}
function botFell(kind){
  if(ROBOT.state==="down"||ROBOT.state==="knock"||ROBOT.state==="slump") return;
  ROBOT.state = kind==="battery" ? "slump" : "knock";
  ROBOT.downKind=kind; ROBOT.t=0; ROBOT.job=null; ROBOT.acting=false;
  beep(kind==="battery"?90:150,.3,"sawtooth");
  toast(kind==="battery" ? "NOURISH-BOT IS OUT OF CHARGE — TAP HIM"
                         : "BONES BOWLED THE NOURISH-BOT OVER — TAP HIM",1);
}
function botRight(){
  if(ROBOT.state!=="down") return;
  ROBOT.state="goto"; ROBOT.tx=ROBOT.dockX; ROBOT.job=null; ROBOT.t=0; ROBOT.downKind=null;
  beep(420,.06); setTimeout(()=>beep(620,.08),90);
  for(let i=0;i<7;i++) SUDS.push({x:ROBOT.x+(Math.random()-0.5)*0.07, y:0.79, r:2+Math.random()*3, life:0.45});
  toast("BACK ON HIS TRACKS — OFF TO CHARGE.");
}
function botFinish(j){
  if(j==="water"){ BOWL.level=1; beep(880,.09); }
  else if(j==="food"){ if(S.kibble>0){ S.kibble--; FBOWL.level=1; } beep(400,.09,"square"); renderMeters(); }
  else if(j==="poo"){
    if(POOS.length) POOS.shift();
    beep(300,.08);
    ROBOT.pauseT=1.8; ROBOT.pauseMsg="...";          // he needs a moment after that one
  }
  else if(j==="ball"){
    // he is a bowl-filling appliance with one stubby arm, so the throw is pitiful on purpose
    BALL.vx=(ROBOT.x<0.5?1:-1)*0.16; BALL.vy=-0.42; BALL.cool=0.4;
    beep(660,.06); toast("THE NOURISH-BOT THROWS THE BALL. A LITTLE WAY.");
  }
  ROBOT.battery=Math.max(0, ROBOT.battery-(BOT_COST[j]||0));
}
function robotTick(dt){
  if(!S.owned.robot) return;
  if(R.active||OUTING.active||PK.active||SLEEP.active) return;   // only while the room is live
  const B=ROBOT, gh=dt*WORK_FF/10;                               // game hours elapsed this frame
  B.t+=dt;
  if(B.state==="knock"){ if(B.t>0.85){ B.state="down"; B.t=0; B.downT=0; } return; }
  if(B.state==="slump"){ if(B.t>1.8){ B.state="down"; B.t=0; B.downT=0; } return; }
  if(B.state==="down"){
    B.downT+=gh;
    if(B.downT>BOT_GIVEUP) botRight();      // he must never be able to starve BONES by lying there
    return;
  }
  if(B.state==="dock") B.battery=Math.min(100,B.battery+BOT_CHARGE*gh);
  else {
    // Standby drain runs the whole time he is off the dock, so every trip costs real charge.
    // He only actually gives out mid-errand though: limping home he runs on fumes and may reach
    // 0 without collapsing, otherwise a tap would just re-kill him short of the dock forever.
    B.battery=Math.max(0, B.battery-BOT_IDLE_DRAIN*gh);
    if(B.battery<=0 && B.job){ botFell("battery"); return; }
    if(CAM.state==="zoomies" && B.zoomArm && Math.abs(CAM.x-B.x)<0.12){
      B.zoomArm=false;
      if(Math.random()<0.30){ botFell("zoom"); return; }
      B.job=null; B.tx=B.dockX; B.state="goto"; B.t=0; B.flee=1.6;   // survived it, and bolts
      toast("THE NOURISH-BOT MAKES A RUN FOR IT");
      beep(520,.05); setTimeout(()=>beep(680,.05),70);
    }
  }
  if(B.mimicT>0) B.mimicT-=dt;
  if(B.pauseT>0){ B.pauseT-=dt; if(B.state==="goto") return; }
  if(B.state==="dock"){
    // he copies BONES' shake trick — badly. one in a few hundred ticks, no reward, just for
    // whoever happens to be watching at the time
    if(B.mimicT<=0 && ["beg","begwait","shake","bark"].includes(CAM.state)
       && Math.abs(CAM.x-B.x)<0.34 && Math.random()<0.006){
      B.mimicT=1.3; beep(300,.05,"square"); setTimeout(()=>beep(250,.06,"square"),150);
    }
    const j=botJob();
    if(j && B.battery>=BOT_RESERVE+BOT_COST[j]){
      B.job=j; B.tx=botJobX(j); B.state="goto"; B.t=0; B.sawPhoto=false;
    }
    return;
  }
  if(B.state==="goto"){
    if(B.flee>0) B.flee-=dt;
    // BONES parked on the charging plate: he will not shove past, he just waits it out
    if(!B.job && Math.abs(CAM.x-B.dockX)<0.07 && Math.abs(B.x-B.dockX)<0.22){
      B.pauseT=0.3; B.pauseMsg="..."; return;
    }
    const d=B.tx-B.x, step=BOT_SPEED*(B.flee>0?2.3:1)*dt;
    if(Math.abs(d)<=step){
      B.x=B.tx;
      if(B.job){ B.state="work"; B.t=0; B.acting=false; }
      else {
        B.state="dock"; B.t=0;
        if(B.battery<95){                      // plugging in puts it on the bill
          S.money-=BOT_RECHARGE_FEE;
          toast("NOURISH-BOT ON CHARGE — -$"+BOT_RECHARGE_FEE+(S.money<0?" — YOU'RE IN THE RED":""),1);
          beep(240,.09,"square"); renderMeters(); renderShop();
        }
      }
    } else {
      B.dir=Math.sign(d);                     // he faces where he is going, and holds that pose
      B.x+=step*B.dir;
      B.battery=Math.max(0, B.battery-BOT_MOVE_DRAIN*dt*(B.flee>0?3:1));  // the tracks cost extra
      if(Math.random()<0.22)                  // grit kicked up behind the tracks
        SUDS.push({x:B.x-B.dir*0.035, y:0.795, r:1.4+Math.random()*2.2, life:0.32});
      // he pauses under the photo of the BONES who came before. once per trip.
      if(S.memorialSrc && !B.sawPhoto && B.x>0.15 && B.x<0.25){
        B.sawPhoto=true;
        if(Math.random()<0.5){ B.pauseT=1.7; B.pauseMsg="..."; }
      }
    }
    return;
  }
  if(B.state==="work"){
    const j=B.job;
    if(B.t>=0.45 && B.t<1.35){                       // the pour/scoop window
      if(!B.acting){ B.acting=true; B.pourFrom = j==="water"?BOWL.level : j==="food"?FBOWL.level : 0; }
      const prog=(B.t-0.45)/0.90;
      if(j==="water"||j==="food"){
        const lv=B.pourFrom+(1-B.pourFrom)*prog;
        if(j==="water") BOWL.level=lv; else FBOWL.level=lv;
        const bx=botBowlX(j);
        if(Math.random()<0.55){
          if(j==="water") DRIPS.push({x:bx+(Math.random()-0.5)*0.055, y:0.745+Math.random()*0.03,
                                      vy:0.30+Math.random()*0.30, life:0.30+Math.random()*0.22});
          else SUDS.push({x:bx+(Math.random()-0.5)*0.045, y:0.765, r:1.4+Math.random()*2, life:0.28});
        }
        if(Math.floor(prog*7)!==Math.floor((prog-dt/0.9)*7))    // descending sploosh / dry rattle
          beep(j==="water" ? 720-prog*300 : 300+prog*80, .05, j==="water"?"sine":"square", .03);
      }
    }
    if(B.t>=1.35 && B.acting){ B.acting=false; botFinish(j); }
    if(B.t>1.85){ B.job=null; B.acting=false; B.tx=B.dockX; B.state="goto"; B.t=0; }
    return;
  }
}
function robotFrame(){
  const B=ROBOT;
  if(B.state==="dock")  return BF.DOCKED;
  if(B.state==="down")  return B.downKind==="battery"?BF.COLLAPSED:BF.TIPPED;
  if(B.state==="knock") return B.t<0.25?BF.FLAIL : B.t<0.60?BF.FALLING : BF.TIPPED;
  if(B.state==="slump") return B.t<0.5?BF.LOW1 : B.t<1.0?BF.LOW2 : B.t<1.5?BF.LOW3 : BF.COLLAPSED;
  // rolling: one held pose, arm out front, mirrored by ROBOT.dir in drawRobot. Cycling frames
  // here just made him flap his arms and reverse home without ever turning round.
  if(B.state==="goto")  return B.battery<25 ? BF.LOW1 : BF.REACH;
  if(B.state==="work"){
    if(B.t<0.15) return BF.LEAN1;
    if(B.t<0.30) return BF.LEAN2;
    if(B.t<1.35) return BF.LEAN3;
    if(B.t<1.60) return BF.LEAN2;
    return BF.LEAN1;
  }
  return BF.IDLE;
}
// Drawn with the room fixtures (after BONES) so he can never end up hidden behind him.
// The sprite's ground line sits on gy like everything else in the room.
function drawRobot(ctx,w,h,gy,t){
  const bh=h*0.30, px=ROBOT.x*w, dx=ROBOT.dockX*w, dw=bh*0.66;
  if(ROBOT.state!=="dock"){                                   // the empty dock, waiting for him
    ctx.strokeStyle="#666"; ctx.lineWidth=2;
    ctx.strokeRect(dx-dw/2, gy-5, dw, 5);
    ctx.beginPath(); ctx.moveTo(dx+dw/2-3,gy-5); ctx.lineTo(dx+dw/2-3,gy-bh*0.62); ctx.stroke();
    ctx.fillStyle="#666";
    ctx.beginPath();
    ctx.moveTo(dx+dw/2-6,gy-bh*0.50); ctx.lineTo(dx+dw/2-1,gy-bh*0.56);
    ctx.lineTo(dx+dw/2-4,gy-bh*0.60); ctx.lineTo(dx+dw/2+1,gy-bh*0.66);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle="rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(px, gy-2, bh*0.24, bh*0.065, 0,0,7); ctx.fill();
  const fr=robotFrame(), img=ROBOTIMG[fr];
  if(img && img.complete && img.naturalWidth){
    const bw=bh*img.naturalWidth/img.naturalHeight;
    // the sprite is drawn arm-to-the-left, so mirror it whenever he is heading right
    const flip = ROBOT.state==="goto" && ROBOT.dir>0;
    // tracked vehicle: he shakes as he rolls, and never while parked or waiting
    const rolling = ROBOT.state==="goto" && ROBOT.pauseT<=0;
    const rum = rolling ? (Math.floor(t*24)%2?1:0) : 0;
    // the copycat wobble — a stiff little servo shuffle, nothing like an actual shake
    const wob = ROBOT.mimicT>0 ? Math.sin(t*26)*2.4 : 0;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(px*2,0); ctx.scale(-1,1); }
    ctx.drawImage(img, px-bw/2+wob, gy-bh-rum, bw, bh);
    ctx.restore();
  }
  // the pour, drawn over the sprite: an arc from his outstretched hand down into the bowl,
  // with the droplets robotTick throws landing around it
  if(ROBOT.state==="work" && (ROBOT.job==="water"||ROBOT.job==="food") && ROBOT.t>=0.45 && ROBOT.t<1.35){
    const bx=botBowlX(ROBOT.job)*w, hx=px-bh*0.30, hy=gy-bh*0.44, by=gy-h*0.045;
    ctx.fillStyle = ROBOT.job==="water" ? "#3b82f6" : "#8a5a2b";
    for(let s=0;s<=1.001;s+=0.055){
      const x=hx+(bx-hx)*s, y=hy+(by-hy)*(s*s);               // gravity: falls away as it travels
      ctx.fillRect(x-2+Math.sin(s*9+t*20)*1.4, y, 4, 3);
    }
  }
  const bx2=px-11, by2=gy-bh*(1-(ROBOTTOP[fr]||0))-9;         // battery pip just above his head
  ctx.strokeStyle="#888"; ctx.lineWidth=1; ctx.strokeRect(bx2,by2,22,5);
  const lowBat=ROBOT.battery<=20;
  ctx.fillStyle = lowBat ? (Math.floor(t*4)%2?"#f22":"#600") : "#fff";
  ctx.fillRect(bx2+1, by2+1, 20*clamp(ROBOT.battery/100,0,1), 3);
  if(ROBOT.state==="down"){                                   // tap prompt
    ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillStyle=Math.floor(t*2)%2?"#f22":"#fff";
    ctx.fillText("TAP", px, by2-5); ctx.textAlign="left";
  } else if(ROBOT.pauseT>0 && ROBOT.pauseMsg){                // stopped for a think
    ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillStyle="#aaa"; ctx.fillText(ROBOT.pauseMsg, px, by2-5); ctx.textAlign="left";
  }
  // BONES has no idea what to make of a robot lying on its side. The bubble tracks his real
  // drawn height, so it sits just over his head as a puppy as well as at full size.
  if(ROBOT.state==="down" && Math.abs(CAM.x-ROBOT.x)<0.22){
    const dogH=h*0.44*stageScale(Math.min(XPANIM.lvl,S.lvl))*CAMZ();
    ctx.font="12px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillStyle=Math.floor(t*2)%2?"#fff":"#f22";
    ctx.fillText("?", CAM.x*w+CAMDWF*w*0.5, gy-dogH-6); ctx.textAlign="left";
  }
  ctx.fillStyle="#fff"; ctx.strokeStyle="#fff"; ctx.lineWidth=3;
}
function drawCam(t){
  const [ctx,w,h]=fit($("#dogcv"));
  ctx.fillStyle="#34343c"; ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#2a2a31"; ctx.fillRect(0,h*0.82,w,h*0.18);
  const gy=h*0.82, u=h/42;
  // shared bowl/bed layout — declared early so both the PULSE reticle (drawn now) and the
  // actual bowl/bed sprites (drawn after BONES, so he can't visually cover them) agree on position
  const bwlX=w*0.04, bwlW=u*4, bwlH=u*1.6, fbX=bwlX+bwlW+8;
  const {bx,bw2,bh2} = bedRect(w,h);
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(w,gy); ctx.stroke();
  ctx.strokeRect(w*WIN_X,h*WIN_Y,w*WIN_W,h*WIN_H); // window
  mystDrawWindow(ctx,w,h);   // whoever is behind the glass, then the mullion and the blinds
  if(S.hoopOwned){
    const hx0=HOOP.x0*w, hx1=HOOP.x1*w, hy=HOOP.y*h;
    ctx.strokeStyle="#888"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(hx0+3,hy); ctx.lineTo(w*0.74,h*0.34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx1-3,hy); ctx.lineTo(w*0.80,h*0.34); ctx.stroke();
    ctx.strokeStyle="#f22"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(hx0,hy); ctx.lineTo(hx1,hy); ctx.stroke();
    ctx.strokeStyle="#aaa"; ctx.lineWidth=1.5;
    for(let i=0;i<4;i++){
      const nx=hx0+(hx1-hx0)*(0.2+i*0.2);
      ctx.beginPath(); ctx.moveTo(nx,hy); ctx.lineTo(hx0+(hx1-hx0)*0.5,hy+h*0.05); ctx.stroke();
    }
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  }
  // memorial photo of the previous BONES (tappable)
  if(S.memorialSrc && MEMIMG && MEMIMG.complete){
    const mw2=w*0.11, mh2=mw2*1.25;
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
    ctx.strokeRect(w*0.14-3, h*0.15-3, mw2+6, mh2+6);
    ctx.drawImage(MEMIMG, w*0.14, h*0.15, mw2, mh2);
  }
  if(S.bedTier>0 && S.pup.owned){
    const bx3=w*0.83, bw3=w*0.13, bh3=h*0.05;
    ctx.strokeRect(bx3,gy-bh3,bw3,bh3);
    ctx.strokeRect(bx3+4,gy-bh3+4,bw3-8,bh3-4);
    if(PUP.st==="nap"){
      ctx.fillStyle="#888"; ctx.font="7px 'Press Start 2P',monospace";
      ctx.fillText("z", bx3+bw3*0.7, gy-bh3-6);
      ctx.fillStyle="#fff";
    }
  }
  // wall sponge (drag onto BONES to scrub) — yellow, chamfered sponge silhouette with pore dimples
  {
    const sx=(SPONGE.held?SPONGE.x:SPONGE_X)*w, sy=(SPONGE.held?SPONGE.y:SPONGE_Y)*h;
    if(!SPONGE.held){ ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sx,sy-14); ctx.lineTo(sx,sy-8); ctx.stroke(); } // hook
    const sw2=20, sh2=13, c2=4;
    ctx.fillStyle="#e8c93a";
    ctx.beginPath();
    ctx.moveTo(sx-sw2/2+c2, sy-sh2/2);
    ctx.lineTo(sx+sw2/2-c2, sy-sh2/2);
    ctx.lineTo(sx+sw2/2, sy-sh2/2+c2);
    ctx.lineTo(sx+sw2/2, sy+sh2/2-c2);
    ctx.lineTo(sx+sw2/2-c2, sy+sh2/2);
    ctx.lineTo(sx-sw2/2+c2, sy+sh2/2);
    ctx.lineTo(sx-sw2/2, sy+sh2/2-c2);
    ctx.lineTo(sx-sw2/2, sy-sh2/2+c2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#a8891f"; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle="#c9a62e";
    for(const [px2,py2] of [[-6,-3],[2,-3],[-2,1],[5,2],[-6,3]]) ctx.fillRect(sx+px2-1,sy+py2-1,2,2);
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  }
  // the dog brush on its hook, once bought — drag it onto BONES to work his coat out
  if(S.brushOwned){
    const bx4=(BRUSH.held?BRUSH.x:BRUSH_X)*w, by4=(BRUSH.held?BRUSH.y:BRUSH_Y)*h;
    if(!BRUSH.held){ ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(bx4,by4-14); ctx.lineTo(bx4,by4-7); ctx.stroke(); }
    ctx.fillStyle="#7a4a22"; ctx.fillRect(bx4-9,by4-6,18,7);          // wooden head
    ctx.strokeStyle="#3a2410"; ctx.lineWidth=1; ctx.strokeRect(bx4-9,by4-6,18,7);
    ctx.fillStyle="#7a4a22"; ctx.fillRect(bx4-2.5,by4+1,5,10);        // handle
    ctx.strokeStyle="#cfcfcf"; ctx.lineWidth=1;
    for(let i=0;i<6;i++){ const tx4=bx4-7.5+i*3; ctx.beginPath(); ctx.moveTo(tx4,by4-6); ctx.lineTo(tx4,by4-11); ctx.stroke(); }
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  }
  // blue drips shed by the wet sponge
  for(const d of DRIPS){
    ctx.globalAlpha=Math.max(0,d.life);
    ctx.fillStyle="#3b82f6";
    ctx.fillRect(d.x*w-2, d.y*h-2, 4, 4);
    ctx.fillRect(d.x*w-1, d.y*h-6, 2, 4);
    ctx.globalAlpha=1;
  }
  // supply-item highlight pulse
  if(PULSE.t>0 && Math.floor(t*4)%2){
    ctx.strokeStyle="#f22"; ctx.lineWidth=3;
    if(PULSE.k==="water") ctx.strokeRect(w*0.04-4, gy-u*1.6-4, u*4+8, u*1.6+8);
    else if(PULSE.k==="food") ctx.strokeRect(w*0.04+u*4+4, gy-u*1.6-4, u*4+8, u*1.6+8);
    else if(PULSE.k==="sponge") ctx.strokeRect(SPONGE_X*w-14, SPONGE_Y*h-12, 28, 24);
    else if(PULSE.k==="brush") ctx.strokeRect(BRUSH_X*w-13, BRUSH_Y*h-12, 26, 24);
    else if(PULSE.k==="bed") ctx.strokeRect(bx-4, gy-bh2-4, bw2+8, bh2+8);
    ctx.strokeStyle="#fff";
  }
  if(R.active || OUTING.active || PK.active){
    for(let i=0;i<160;i++){
      ctx.fillStyle = Math.random()<0.5 ? "#26262c" : "#45454f";
      ctx.fillRect(Math.random()*w, Math.random()*h, 3, 3);
    }
    ctx.fillStyle="#fff"; ctx.font="10px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(DN("BONES IS OUT"), w/2, h/2);
    $("#camstate").textContent = PK.active ? "AT THE PARK" : OUTING.active ? "ON A TRIP" : (R.mode==="daily" ? "SAVAGE-THIRSTY" : "OUT");
    return;
  }
  // ball (hidden while out of the room)
  if(!BALL.off && S.ballOwned){
    const bpx=BALL.x*w, bpy=BALL.y*h;
    ctx.fillStyle="#f22"; ctx.beginPath(); ctx.arc(bpx,bpy,8,0,7); ctx.fill();
    ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(bpx,bpy,8,0,7); ctx.stroke();
    if(TRICK.live && (TRICK.mult>1 || TRICK.ticks>0)){
      ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
      if(TRICK.mult>1){
        ctx.fillStyle = TRICK.mult>=3 ? "#f22" : "#fff";
        ctx.fillText("x"+TRICK.mult, bpx, bpy-16);
      }
      if(TRICK.ticks>0){
        ctx.fillStyle="#aaa"; ctx.font="6px 'Press Start 2P',monospace";
        ctx.fillText("+"+TRICK.ticks, bpx, bpy-(TRICK.mult>1?28:16));
      }
      ctx.textAlign="left";
    }
  }
  const stt=CAM.state;
  const fkey = stt==="zoomies" ? "come" : stt==="chase" ? "come" : stt==="fetch" ? (CAM.fetchPhase===4?"idle":"come") : (stt==="drinkgo"||stt==="eatgo"||stt==="beggo"||stt==="treatgo") ? "walk" : (stt==="drink"||stt==="eat"||stt==="treateat") ? "sniff" : stt==="beg" ? "idle" : stt==="wash" ? (WASH.heat>0.05?"shake":"idle") : stt==="bedsleep" ? "rest" : stt;
  let frames = DOGIMG[fkey] || DOGIMG.idle;
  if(S.senior && (fkey==="walk"||fkey==="idle"||fkey==="sniff"||fkey==="come")) frames=SENIORIMG;
  if(stt==="beg"||stt==="begwait"||stt==="stay") frames=BEGIMG;
  const img = frames[CAM.fi % frames.length];
  const dhF = (stt==="rest"||stt==="bedsleep")?0.28 : stt==="stay"?0.46 : stt==="catch"?0.52 : stt==="bark"?0.46 : (stt==="come"||stt==="chase"||stt==="fetch"||stt==="zoomies")?0.46 : 0.44;
  let scl = stageScale(Math.min(XPANIM.lvl,S.lvl));   // growth only through the ceremony
  if(EVO.active){
    const et=EVO.t-1.0;
    scl = et<0 ? EVO.from : et<2.4 ? (Math.sin(et*(6+et*6))>0 ? EVO.from : EVO.to) : EVO.to;
  }
  let dx=CAM.x*w, dh=h*dhF*scl*CAMZ(), dw=0;
  if(img.complete && img.naturalWidth){
    dw = dh*img.naturalWidth/img.naturalHeight;
    CAMDWF = dw/w;
    const bob = stt==="walk" ? Math.sin(t*10)*1.5 : 0;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    const flip = (stt==="zoomies"||stt==="walk"||stt==="sniff"||stt==="idle"||stt==="catch"||stt==="come"||stt==="chase"||stt==="fetch"||stt==="drinkgo"||stt==="drink"||stt==="eatgo"||stt==="eat"||stt==="treatgo"||stt==="treateat"||stt==="beggo"||stt==="beg"||stt==="begwait"||stt==="stay") && CAM.dir<0;
    if(flip){ ctx.translate(dx*2+dw,0); ctx.scale(-1,1); }
    ctx.drawImage(img, dx, gy-dh+bob, dw, dh);
    ctx.restore();
  }
  // the bot stands on the same floor as BONES and obeys the same depth rules, so he goes in
  // here — after BONES, but before the bowls and the bed, which both occlude him
  if(S.owned.robot) drawRobot(ctx,w,h,gy,t);
  // water bowl (blue) + food bowl (kibble chunks), both tappable — drawn on top of BONES so
  // he never visually swallows them up when he dips down to drink/eat. an opaque backing
  // fill first means an empty bowl still blocks him out instead of showing him through the rim.
  ctx.fillStyle="#34343c"; ctx.fillRect(bwlX, gy-bwlH, bwlW, bwlH);
  if(BOWL.level>0.03){
    ctx.fillStyle="#3b82f6";
    ctx.fillRect(bwlX+3, gy-3-(bwlH-6)*BOWL.level, bwlW-6, (bwlH-6)*BOWL.level);
  }
  ctx.strokeStyle = ((BOWL.level<=0.05 && (S.thirst<40 || !S.firstWater)) && Math.floor(t*2)%2===0) ? "#f22" : "#fff";
  ctx.strokeRect(bwlX, gy-bwlH, bwlW, bwlH);
  ctx.fillStyle="#34343c"; ctx.fillRect(fbX, gy-bwlH, bwlW, bwlH);
  if(FBOWL.level>0.03){
    ctx.fillStyle="#8a5a2b";
    const nCh=Math.round(FBOWL.level*8);
    for(let i=0;i<nCh;i++){
      const cxp=fbX+4+(i%4)*(bwlW-10)/3, cyp=gy-5-Math.floor(i/4)*(bwlH*0.35);
      ctx.fillRect(cxp, cyp-3, 4, 4);
    }
  }
  ctx.strokeStyle = ((FBOWL.level<=0.05 && (S.hunger<40 || !S.firstFood)) && Math.floor(t*2+1)%2===0) ? "#f22" : "#fff";
  ctx.strokeRect(fbX, gy-bwlH, bwlW, bwlH);
  ctx.strokeStyle="#fff";
  // dog bed (or the sad empty spot where one should be) — sized to BONES' current growth stage,
  // and drawn on top of him so he can't visually cover it when he heads over to rest
  drawDogBed(ctx,bx,gy,bw2,bh2,t,S.bedTier>0,bedAdequate());
  // indoor accidents — drawn last of the room fixtures so a poo pile is always visible (and
  // tappable) on top of everything, even if it landed right on the bed
  for(const p of POOS){
    const pxp=p.x*w;
    ctx.strokeStyle="rgba(0,0,0,.6)"; ctx.lineWidth=1.4;
    ctx.strokeRect(pxp-7.5,gy-5.5,15,6); ctx.strokeRect(pxp-5.5,gy-9.5,11,5); ctx.strokeRect(pxp-2.5,gy-12.5,6,4);
    ctx.fillStyle="#6b4423";
    ctx.fillRect(pxp-7,gy-5,14,5);
    ctx.fillRect(pxp-5,gy-9,10,4);
    ctx.fillRect(pxp-2,gy-12,5,3);
    if(Math.floor(t*2)%2){
      ctx.strokeStyle="#888"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(pxp-4,gy-16); ctx.lineTo(pxp-6,gy-22);
      ctx.moveTo(pxp+4,gy-16); ctx.lineTo(pxp+2,gy-22); ctx.stroke();
      ctx.strokeStyle="#fff"; ctx.lineWidth=3;
    }
  }
  // bone treats scattered on the floor — drawn last so the pile always reads on top
  for(const tr of TREATS){
    const px=tr.x*w, py=tr.y*h;
    const air=clamp((gy-py)/70,0,1);
    ctx.fillStyle="rgba(0,0,0,"+(0.36*(1-air*0.62))+")";
    ctx.beginPath(); ctx.ellipse(px, gy-1.5, 9.5*(1-air*0.3), 2.8*(1-air*0.3), 0,0,7); ctx.fill();
    drawBoneTreat(ctx,px,py,1.25,tr.rot,tr.squash);
  }
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  if(CAM.woof>0 && stt==="bark"){
    const wx=Math.min(w-72,dx+dw*0.5), wy=gy-dh-32;
    ctx.fillStyle="#000"; ctx.strokeStyle="#fff"; ctx.lineWidth=3;
    ctx.fillRect(wx,wy,64,22); ctx.strokeRect(wx,wy,64,22);
    ctx.beginPath(); ctx.moveTo(wx+12,wy+22); ctx.lineTo(wx+5,wy+31); ctx.stroke();
    ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("WOOF!", wx+32, wy+15);
  }
  if(FLY.active){
    const fx=FLY.x*w, fy=FLY.y*h;
    ctx.fillStyle="#101014";
    ctx.fillRect(fx-2,fy-2,4,4);
    if(Math.floor(t*20)%2){ ctx.fillRect(fx-4,fy-4,2,2); ctx.fillRect(fx+3,fy-4,2,2); }
  }
  for(const p of HP){
    const im2=HEARTIMG[p.i];
    if(!im2.complete||!im2.naturalWidth) continue;
    ctx.globalAlpha=Math.max(0,p.life/1.6);
    const hw2=26, hh2=hw2*im2.naturalHeight/im2.naturalWidth;
    ctx.drawImage(im2, p.x*w-hw2/2, gy-h*0.52-p.rise, hw2, hh2);
    ctx.globalAlpha=1;
  }
  drawSunray(ctx,w,h,t);
  // night overlay + sick tint, drawn last
  const night = nightAmount();
  if(night>0){ ctx.fillStyle="rgba(6,10,28,"+night+")"; ctx.fillRect(0,0,w,h); }
  if(S.sick){ ctx.fillStyle="rgba(90,10,10,"+(0.16+0.05*Math.sin(t*3))+")"; ctx.fillRect(0,0,w,h); }
  if(CAM.workBlockT > 0){
    const shk = Math.round(Math.sin(t*38)*5*Math.min(1,CAM.workBlockT));
    ctx.canvas.style.transform = shk ? "translateX("+shk+"px)" : "";
    ctx.fillStyle="rgba(200,0,0,"+Math.min(0.45,CAM.workBlockT*0.21)+")";
    ctx.fillRect(0,0,w,h);
  } else if(ctx.canvas.style.transform){
    ctx.canvas.style.transform="";
  }
  if(EVO.active){
    const et=EVO.t-1.0;
    let fl=0, cap="...WAIT, SOMETHING IS HAPPENING...";
    if(et<0){ fl=0.10+0.08*Math.sin(EVO.t*4); }
    else { cap=DN("WHAT? BONES IS CHANGING!"); fl = et<2.4 ? (Math.sin(et*18)>0.55?0.45:0) : Math.max(0,0.9*(1-(et-2.4)/0.5)); }
    if(fl>0){ ctx.fillStyle="rgba(255,255,255,"+fl+")"; ctx.fillRect(0,0,w,h); }
    ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText(cap, w/2, h*0.16); ctx.textAlign="left";
  }
  // XP bar (crystal style): pulses near level-up
  if(S.pup.owned){
    const pk2 = PUP.st==="walk"||PUP.st==="go" ? "walk" : (PUP.st==="drink"||PUP.st==="eat") ? "sniff" : "idle";
    const pfr = DOGIMG[pk2]||DOGIMG.idle;
    const pim = pfr[PUP.fi%pfr.length];
    if(pim.complete && pim.naturalWidth){
      const ph2=h*0.44*0.42*CAMZ(), pw2=ph2*pim.naturalWidth/pim.naturalHeight;
      PUP.hF=ph2/h;
      PUP.w=pw2/w;
      const px2=PUP.x*w;
      ctx.save(); ctx.imageSmoothingEnabled=false;
      if(PUP.dir<0){ ctx.translate(px2*2+pw2,0); ctx.scale(-1,1); }
      ctx.drawImage(pim, px2, gy-ph2, pw2, ph2);
      ctx.restore();
    }
  }
  const need=xpNeed(S.lvl), tFrac=clamp(S.xp/need,0,1);
  if(S.lvl<XPANIM.lvl){ XPANIM.lvl=S.lvl; XPANIM.frac=tFrac; XPANIM.pauseT=0; } // successor reset
  if(XPANIM.pauseT>0){
    XPANIM.pauseT-=0.016;                       // the celebration beat
    if(XPANIM.pauseT<=0){
      XPANIM.lvl++; XPANIM.frac=0;
      if(S.pendingStage.length && S.pendingStage[0]<=XPANIM.lvl){
        fireStageCeremony(S.pendingStage.shift());
      }
    }
  } else if(EVO.active || XPLOCK){
    // bar holds perfectly still while an evolution or crossroads is in progress
  } else if(!XPANIM.ready){
    const aTarget = XPANIM.lvl===S.lvl ? tFrac : 1;
    if(XPANIM.frac < aTarget-0.002){
      XPANIM.frac += 0.016*(0.35 + 0.55*(aTarget-XPANIM.frac));
      if(aTarget-XPANIM.frac<0.004) XPANIM.frac=aTarget;  // snap: no stuck-at-99% bars
      if(t-XPANIM.snd>0.12){ XPANIM.snd=t; beep(440+XPANIM.frac*480,.03,"square",.02); }
    }
    if(XPANIM.lvl!==S.lvl && XPANIM.frac>=0.997){
      XPANIM.frac=1; XPANIM.ready=true;         // bar holds full, waits for the tap
      beep(880,.06);
    }
  }
  const frac = (XPANIM.pauseT>0||XPANIM.ready) ? 1 : XPANIM.frac;
  const showPup = S.pup.owned && S.sel==="pup" && !XPANIM.ready && XPANIM.pauseT<=0;
  const pupNeed=15+S.pup.lvl*6, pupFrac=clamp((S.pup.xp||0)/pupNeed,0,1);
  const barFrac = showPup ? pupFrac : frac;
  const xbX=8, xbW=w-16, xbY=h-20, xbH=12;
  ctx.globalAlpha = XPANIM.pauseT>0 ? (Math.floor(t*14)%2?1:0.35) : XPANIM.ready ? (0.65+0.35*Math.sin(t*6)) : (frac>0.8 ? 0.6+0.4*Math.sin(t*8) : 1);
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(xbX,xbY,xbW,xbH);
  ctx.fillStyle="#fff"; ctx.fillRect(xbX+2,xbY+2,(xbW-4)*barFrac,xbH-4);
  ctx.globalAlpha=1;
  ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="left";
  const dl=Math.min(XPANIM.lvl,S.lvl);
  ctx.fillText(showPup ? S.pup.name+" \u2014 PUPPY LV."+S.pup.lvl : NAME()+" \u2014 "+stageName(dl)+" LV."+dl, xbX, xbY-5);
  ctx.textAlign="right";
  if(XPANIM.ready){ ctx.fillStyle=Math.floor(t*3)%2?"#fff":"#f22"; ctx.fillText("TAP \u25B2 LEVEL UP!", xbX+xbW, xbY-5); ctx.fillStyle="#fff"; }
  else ctx.fillText("XP", xbX+xbW, xbY-5);
  ctx.textAlign="left";
  // floating +XP
  ctx.font="8px 'Press Start 2P',monospace";
  for(const f of XPF){
    ctx.globalAlpha=Math.max(0,f.life/1.3);
    ctx.fillText(f.txt, f.x*w, f.y*h-(1.3-f.life)*30);
    ctx.globalAlpha=1;
  }
  for(let i=XPANIM.parts.length-1;i>=0;i--){
    const sp2=XPANIM.parts[i];
    sp2.vy+=150*0.016; sp2.x+=sp2.vx*0.016; sp2.y+=sp2.vy*0.016; sp2.life-=0.016;
    if(sp2.life<=0){ XPANIM.parts.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,sp2.life);
    ctx.fillStyle=sp2.red?"#f22":"#fff";
    ctx.fillRect(sp2.x,sp2.y,3,3);
    ctx.globalAlpha=1;
  }
  if(LVLFX>0){
    ctx.strokeStyle="#fff"; ctx.lineWidth=5; ctx.strokeRect(3,3,w-6,h-6);
    ctx.font="12px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("LEVEL UP!", w/2, h*0.30); ctx.textAlign="left";
  }
  for(const s of SUDS){
    ctx.globalAlpha=Math.max(0,s.life);
    ctx.strokeStyle="#fff"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(s.x*w, s.y*h, s.r, 0, 7); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if(WASH.active){
    ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("SCRUB! CLEAN "+Math.round(S.clean)+"%", w/2, h*0.14); ctx.textAlign="left";
  }
  $("#camstate").textContent = S.sick ? "SICK" : S.fun<30 ? "BORED" : {happy:"HAPPY",content:"OK",sad:"NEGLECTED",confused:"CONFUSED"}[portraitState()];
  $("#camstate").classList.toggle("sick", S.sick);
}

/* ---------- home actions ---------- */

/* ---------- shop icons — small line-art pictograms so every row shows what it actually is ---------- */
function makeIcon(draw){
  const c=document.createElement("canvas"); c.width=30; c.height=30;
  const x=c.getContext("2d"); x.imageSmoothingEnabled=false;
  draw(x,30,30);
  return c.toDataURL();
}
const ICONS = {
  water: makeIcon((x,w,h)=>{
    x.strokeStyle="#fff"; x.lineWidth=2;
    x.beginPath(); x.moveTo(w*0.20,h*0.42); x.lineTo(w*0.26,h*0.78); x.quadraticCurveTo(w*0.5,h*0.90,w*0.74,h*0.78); x.lineTo(w*0.80,h*0.42); x.stroke();
    x.fillStyle="#3b82f6";
    x.beginPath(); x.moveTo(w*0.24,h*0.50); x.lineTo(w*0.28,h*0.74); x.quadraticCurveTo(w*0.5,h*0.84,w*0.72,h*0.74); x.lineTo(w*0.76,h*0.50); x.closePath(); x.fill();
    x.strokeStyle="#cfe6ff"; x.lineWidth=1.4;
    x.beginPath(); x.moveTo(w*0.32,h*0.60); x.quadraticCurveTo(w*0.42,h*0.56,w*0.5,h*0.60); x.quadraticCurveTo(w*0.58,h*0.64,w*0.68,h*0.60); x.stroke();
    x.strokeStyle="#fff"; x.lineWidth=2;
    x.beginPath(); x.ellipse(w*0.5,h*0.42,w*0.30,h*0.07,0,0,Math.PI*2); x.stroke();
  }),
  food: makeIcon((x,w,h)=>{
    x.strokeStyle="#fff"; x.lineWidth=2;
    x.beginPath(); x.moveTo(w*0.20,h*0.42); x.lineTo(w*0.26,h*0.78); x.quadraticCurveTo(w*0.5,h*0.90,w*0.74,h*0.78); x.lineTo(w*0.80,h*0.42); x.stroke();
    x.beginPath(); x.ellipse(w*0.5,h*0.42,w*0.30,h*0.07,0,0,Math.PI*2); x.stroke();
    x.fillStyle="#8a5a2b";
    const chunks=[[0.40,0.55],[0.50,0.50],[0.60,0.56],[0.45,0.65],[0.56,0.66]];
    for(const [cxf,cyf] of chunks) x.fillRect(w*cxf-2.5,h*cyf-2.5,5,5);
  }),
  sponge: makeIcon((x,w,h)=>{
    x.fillStyle="#e8c93a";
    const sw=w*0.62, sh=h*0.42, cx=w/2, cy=h*0.56, c2=4;
    x.beginPath();
    x.moveTo(cx-sw/2+c2, cy-sh/2); x.lineTo(cx+sw/2-c2, cy-sh/2); x.lineTo(cx+sw/2, cy-sh/2+c2);
    x.lineTo(cx+sw/2, cy+sh/2-c2); x.lineTo(cx+sw/2-c2, cy+sh/2); x.lineTo(cx-sw/2+c2, cy+sh/2);
    x.lineTo(cx-sw/2, cy+sh/2-c2); x.lineTo(cx-sw/2, cy-sh/2+c2); x.closePath(); x.fill();
    x.strokeStyle="#a8891f"; x.lineWidth=1.4; x.stroke();
    x.fillStyle="#c9a62e";
    for(const [px,py] of [[-7,-4],[3,-3],[-3,2],[6,3],[-7,5]]) x.fillRect(cx+px-1,cy+py-1,2,2);
    x.strokeStyle="#fff"; x.lineWidth=2;
    x.beginPath(); x.moveTo(cx,cy-sh/2-8); x.lineTo(cx,cy-sh/2-2); x.stroke();
  }),
  bed: makeIcon((x,w,h)=>{
    x.fillStyle="#26262c"; x.strokeStyle="#fff"; x.lineWidth=2;
    x.fillRect(w*0.15,h*0.40,w*0.70,h*0.34); x.strokeRect(w*0.15,h*0.40,w*0.70,h*0.34);
    x.strokeRect(w*0.22,h*0.46,w*0.56,h*0.22);
    x.beginPath(); x.moveTo(w*0.15,h*0.40); x.lineTo(w*0.15,h*0.74); x.moveTo(w*0.85,h*0.40); x.lineTo(w*0.85,h*0.74); x.stroke();
  }),
  kibble: makeIcon((x,w,h)=>{
    x.fillStyle="#8a5a2b";
    const chunks=[[0.36,0.62],[0.50,0.52],[0.64,0.62],[0.43,0.72],[0.57,0.72],[0.50,0.40]];
    for(const [cxf,cyf] of chunks){ x.fillRect(w*cxf-3.5,h*cyf-3.5,7,7); }
    x.strokeStyle="#c99a5b"; x.lineWidth=1;
    for(const [cxf,cyf] of chunks) x.strokeRect(w*cxf-3.5,h*cyf-3.5,7,7);
  }),
  snack: makeIcon((x,w,h)=>{
    x.fillStyle="#e8b98a"; x.strokeStyle="#a8754a"; x.lineWidth=1.5;
    const bx=w*0.28,by=h*0.36,bw=w*0.44,bh=h*0.34;
    x.beginPath();
    x.arc(bx,by,bh*0.42,0,Math.PI*2);
    x.arc(bx+bw*0.5,by,bh*0.5,0,Math.PI*2);
    x.arc(bx+bw,by,bh*0.42,0,Math.PI*2);
    x.arc(bx,by+bh*0.7,bh*0.42,0,Math.PI*2);
    x.arc(bx+bw*0.5,by+bh*0.7,bh*0.5,0,Math.PI*2);
    x.arc(bx+bw,by+bh*0.7,bh*0.42,0,Math.PI*2);
    x.fill(); x.stroke();
  }),
  ball: makeIcon((x,w,h)=>{
    x.fillStyle="#f22"; x.beginPath(); x.arc(w/2,h*0.56,w*0.30,0,Math.PI*2); x.fill();
    x.strokeStyle="#fff"; x.lineWidth=1.6;
    x.beginPath(); x.arc(w/2,h*0.56,w*0.30,0,Math.PI*2); x.stroke();
    x.beginPath(); x.moveTo(w/2,h*0.26); x.lineTo(w/2,h*0.86); x.stroke();
    x.beginPath(); x.moveTo(w*0.22,h*0.56); x.lineTo(w*0.78,h*0.56); x.stroke();
    x.fillStyle="rgba(255,255,255,.55)";
    x.beginPath(); x.arc(w*0.40,h*0.46,w*0.07,0,Math.PI*2); x.fill();
  }),
  brush: makeIcon((x,w,h)=>{
    x.strokeStyle="#fff"; x.lineWidth=2;
    x.strokeRect(w*0.22,h*0.30,w*0.56,h*0.22);          // the head
    x.beginPath(); x.moveTo(w*0.42,h*0.52); x.lineTo(w*0.42,h*0.78);
    x.moveTo(w*0.58,h*0.52); x.lineTo(w*0.58,h*0.78); x.stroke();   // handle
    x.strokeStyle="#8a8a8a"; x.lineWidth=1.4;
    for(let i=0;i<5;i++){ const bx=w*(0.27+i*0.115); x.beginPath(); x.moveTo(bx,h*0.30); x.lineTo(bx,h*0.16); x.stroke(); }
  }),
  hoop: makeIcon((x,w,h)=>{
    x.strokeStyle="#f22"; x.lineWidth=2.4;
    x.beginPath(); x.ellipse(w/2,h*0.38,w*0.34,h*0.09,0,0,Math.PI*2); x.stroke();
    x.strokeStyle="#aaa"; x.lineWidth=1.2;
    for(let i=0;i<5;i++){
      const t0=i/4, nx=w*0.5+(t0-0.5)*w*0.62;
      x.beginPath(); x.moveTo(nx,h*0.40); x.lineTo(w*0.5+(t0-0.5)*w*0.22,h*0.78); x.stroke();
    }
    x.strokeStyle="#888"; x.lineWidth=2;
    x.beginPath(); x.moveTo(w*0.84,h*0.20); x.lineTo(w*0.68,h*0.34); x.stroke();
    x.beginPath(); x.moveTo(w*0.90,h*0.30); x.lineTo(w*0.74,h*0.40); x.stroke();
  }),
  shampoo: makeIcon((x,w,h)=>{
    x.fillStyle="#3fa5c9"; x.strokeStyle="#fff"; x.lineWidth=1.8;
    x.fillRect(w*0.32,h*0.24,w*0.14,h*0.10); x.strokeRect(w*0.32,h*0.24,w*0.14,h*0.10);
    x.fillRect(w*0.24,h*0.36,w*0.52,h*0.48); x.strokeRect(w*0.24,h*0.36,w*0.52,h*0.48);
    x.fillStyle="rgba(255,255,255,.5)";
    x.fillRect(w*0.30,h*0.46,w*0.08,h*0.30);
    x.strokeStyle="#fff"; x.lineWidth=1.2;
    x.beginPath(); x.arc(w*0.70,h*0.20,2.4,0,Math.PI*2); x.stroke();
    x.beginPath(); x.arc(w*0.78,h*0.30,1.6,0,Math.PI*2); x.stroke();
  })
};
function icn(key){ return '<img class="shopicon" src="'+ICONS[key]+'" alt="">'; }
function pctIcon(pct){
  // a clean ring gauge — the % itself reads better as text beside it than crammed inside 22px
  const src=makeIcon((x,w,h)=>{
    const cx=w/2, cy=h/2, r=w*0.36;
    x.strokeStyle="#444"; x.lineWidth=4;
    x.beginPath(); x.arc(cx,cy,r,0,Math.PI*2); x.stroke();
    x.strokeStyle = pct<25 ? "#f22" : "#3fa5c9"; x.lineWidth=4;
    x.beginPath(); x.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(pct/100,0,1)); x.stroke();
  });
  return '<img class="shopicon" src="'+src+'" alt="">';
}

/* ---------- shop ---------- */
function openShopPanel(){ renderShop(); $("#shopPanel").classList.add("show"); }
function renderShopSup(){
  const el=$("#shopSup"); if(!el) return;
  // same low-lock-first ordering as GO OUT
  const rows=[
    {req:0, html:'<div class="prow"><span class="nm">'+icn("kibble")+' KIBBLE x'+S.kibble+'<br><span class="tiny">1 POUR \u2014 3 FILL A BOWL</span></span><button data-sup="kibble" '+(S.money<2?"disabled":"")+'>BUY $2</button></div>'},
    {req:0, html:'<div class="prow"><span class="nm">'+icn("snack")+' BONE TREATS x'+S.snacks+'<br><span class="tiny">HIS FAVOURITE \u2014 +ENERGY +MOOD</span></span><button data-sup="snack" '+(S.money<3?"disabled":"")+'>BUY $3</button></div>'},
    {req:0, html:'<div class="prow"><span class="nm">'+icn("shampoo")+' DOG SHAMPOO '+Math.round(S.shampooPct)+'%<br><span class="tiny">TOPS UP FOR BATHS</span></span><button data-sup="shampoo" '+(S.money<5||S.shampooPct>=100?"disabled":"")+'>BUY $5</button></div>'},
    {req:1, html:(S.bedTier===0
      ? '<div class="prow"><span class="nm">'+icn("bed")+' DOG BED<br><span class="tiny">PERFECT SLEEP \u2014 ONE-TIME</span></span><button data-sup="bed" '+(S.money<25?"disabled":"")+'>BUY $25</button></div>'
      : !bedAdequate()
        ? '<div class="prow" style="border-color:#f22"><span class="nm" style="color:#f22">'+icn("bed")+' BIGGER BED<br><span class="tiny">HE\'S OUTGROWN HIS BED</span></span><button data-sup="biggerbed" '+(S.money<45?"disabled":"")+'>BUY $45</button></div>'
        : "")},
    {req:2, html:(ballTotalOwned()>=BALL_MAX?"":'<div class="prow'+(S.lvl<2?" locked":"")+'"><span class="nm">'+icn("ball")+' RUBBER BALL ('+ballTotalOwned()+'/'+BALL_MAX+')<br><span class="tiny">'+(S.lvl<2?"UNLOCKS LV.2":"FETCH, TRICK SHOTS \u2014 SPARES KEEP IN SUPPLIES")+'</span></span><button data-sup="ball" '+(S.lvl<2||S.money<5?"disabled":"")+'>BUY $5</button></div>')},
    {req:2, html:(S.brushOwned?"":'<div class="prow"><span class="nm">'+icn("brush")+' DOG BRUSH<br><span class="tiny">HANGS BY THE SPONGE \u2014 KEEPS HIS COAT RIGHT</span></span><button data-sup="brush" '+(S.money<18?"disabled":"")+'>BUY $18</button></div>')},
    {req:3, html:(S.hoopOwned?"":'<div class="prow"><span class="nm">'+icn("hoop")+' BASKETBALL HOOP<br><span class="tiny">TRICK SHOTS BY THE WINDOW \u2014 ONE-TIME</span></span><button data-sup="hoop" '+(S.money<40?"disabled":"")+'>BUY $40</button></div>')},
    {req:4, html:(S.owned.robot?"":'<div class="prow"><span class="nm">\ud83e\udd16 NOURISH-BOT<br><span class="tiny">FEEDS &amp; WATERS BONES WHILE AT WORK \u2014 ONE-TIME</span></span><button data-sup="robot" '+(S.money<350?"disabled":"")+'>BUY $350</button></div>')}
  ];
  el.innerHTML = unlockSort(rows);
}
function renderShop(){
  renderShopSup();
  const wl=$("#shopWallet"), wi=$("#walletIcn");
  if(wl){ const neg=S.money<0; wl.textContent=(neg?"-$":"$")+Math.abs(S.money);
          wl.parentElement.style.borderColor=neg?"#f22":"#e8c14a";
          wl.parentElement.style.color=neg?"#f22":"#e8c14a"; }
  if(wi && !wi.src) wi.src=ICONS.kibble;
}

/* ---------- mode switching ---------- */
let MODE="home";
function showScreen(id){
  const prevId=MODE;
  // the hidden/unhidden state itself changes exactly when it always has — nothing downstream
  // that depends on the new screen already being in the DOM the instant this returns has to
  // wait on an animation. The fade-in is a purely cosmetic class added on top of that.
  for(const s of ["home","work","run","park","paperboy"]) $("#"+s).classList.toggle("hidden", s!==id);
  MODE=id;
  $("#rSnack").classList.toggle("hidden", id!=="work");
  $("#rWalk").classList.toggle("hidden", id!=="work");
  if(prevId!==id){
    const next=$("#"+id);
    next.classList.remove("screen-in");
    void next.offsetWidth;   // restart the animation even if the same screen is re-entered quickly
    next.classList.add("screen-in");
    syncMoodMusic();         // the ambient DOGCAM loop only ever plays on the home screen
  }
}
function transition(label,cb){
  $("#transLabel").textContent=label;
  const tr=$("#trans"); tr.classList.add("show");
  const car=$("#car"); car.style.animation="none"; void car.offsetWidth; car.style.animation="";
  beep(200,.15,"sawtooth"); setTimeout(()=>beep(240,.15,"sawtooth"),300);
  setTimeout(()=>{ tr.classList.remove("show"); cb(); }, 1350);
}

/* ---------- WORK: stamping ---------- */
const SYMS=["circle","square","tri","star"];
const W={plates:[],sel:0,speed:70,spawn:0,intv:2.2,streak:0,flash:0,run:false};
function enterWork(){
  hidePortrait(); closeStatus();
  transition("DRIVING TO WORK",()=>{
    showScreen("work");
    Object.assign(W,{plates:[],sel:0,speed:70,spawn:0.5,intv:2.2,streak:0,flash:0,run:true});
  });
}
function leaveWork(){
  W.run=false;
  transition("DRIVING HOME",()=>{ returnHomeFromActivity(); });
}

/* ---------- bedtime: forced nightly sleep at midnight ---------- */
function triggerBedtime(){
  SLEEP.active=true;
  hidePortrait(); closeStatus();
  CAM.state="bedsleep"; CAM.fi=0; CAM.t=0; CAM.until=99;
  const img=$("#bedtimeImg");
  img.src=SLEEPFRAMES[0];
  const bad = S.sick && avgStat()<20;
  if(bad){
    S.neglectNight=true;
    $("#bedtimeLines").textContent="HE COLLAPSES INTO BED. BONES NEEDS CARE.";
    beep(100,.35,"sawtooth");
  } else {
    S.neglectNight=false; S.neglectNights=0;
    $("#bedtimeLines").textContent="HIS EYES ARE HEAVY... TIME FOR BED.";
    beep(220,.25,"sawtooth");
  }
  $("#bedtimeBtns").classList.remove("ready");
  $("#bedtimePanel").classList.add("show");
  const sleepMsg = bad ? "THE NIGHT WON'T HELP HIM." : "HE'S FAST ASLEEP.";
  setTimeout(()=>{ img.src=SLEEPFRAMES[1]; $("#bedtimeLines").textContent=sleepMsg; if(!bad) beep(180,.3,"sine"); },1400);
  setTimeout(()=>{ $("#bedtimeBtns").classList.add("ready"); },2200);
}
function closeBedtime(){
  $("#bedtimePanel").classList.remove("show");
  SLEEP.active=false;
}
function pkMorningCheck(){
  if(!S.neglectNight) return;
  S.neglectNight=false;
  S.neglectNights=(S.neglectNights||0)+1;
  // the night made things worse: sleep without care drained him further
  S.hunger=Math.max(0,S.hunger-10); S.thirst=Math.max(0,S.thirst-15);
  S.energy=Math.max(0,S.energy-8);  S.mood=Math.max(0,S.mood-12);
  renderMeters();
  if(S.neglectNights>=2 && !S.dead){
    S.dead=true; triggerDeath();
  } else {
    toast("ROUGH NIGHT. BONES NEEDS FOOD AND WATER NOW.",1);
    beep(80,.3,"sawtooth");
  }
}
function skipToMorning(){
  let remaining=(6-CLK.h)*10;
  while(remaining>0){ const step=Math.min(1,remaining); tickStats(step); remaining-=step; }
  CAM.state="idle"; CAM.fi=0; CAM.until=1;
  pkMorningCheck();
  if(!S.dead){
    renderMeters(); renderTodo();
    if(!S.neglectNight) toast("MORNING — 06:00. BONES IS UP.");
    if(!S.neglectNight){ beep(660,.1); setTimeout(()=>beep(880,.1),120); }
  }
}
$("#bBedWork").onclick=()=>{ closeBedtime(); enterPaperboy(); };
$("#bBedSkip").onclick=()=>{ closeBedtime(); skipToMorning(); };
function drawSym(ctx,sym,cx,cy,r,col){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=3;
  if(sym==="circle"){ ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.stroke(); }
  if(sym==="square"){ ctx.strokeRect(cx-r,cy-r,r*2,r*2); }
  if(sym==="tri"){ ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r,cy+r); ctx.lineTo(cx-r,cy+r); ctx.closePath(); ctx.stroke(); }
  if(sym==="star"){ ctx.beginPath();
    ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r*0.3,cy-r*0.3); ctx.lineTo(cx+r,cy);
    ctx.lineTo(cx+r*0.3,cy+r*0.3); ctx.lineTo(cx,cy+r); ctx.lineTo(cx-r*0.3,cy+r*0.3);
    ctx.lineTo(cx-r,cy); ctx.lineTo(cx-r*0.3,cy-r*0.3); ctx.closePath(); ctx.stroke(); }
}
function updateWork(dt){
  if(!W.run) return;
  W.spawn-=dt;
  W.intv=Math.max(1.35, W.intv-0.008*dt);
  W.speed=Math.min(115, W.speed+0.5*dt);
  if(W.spawn<=0){ W.spawn=W.intv;
    W.plates.push({x:-46, sym:SYMS[Math.floor(Math.random()*4)], stamped:0, missed:false}); }
  const cv=$("#workcv"), w=cv.clientWidth;
  for(const p of W.plates){
    p.x += W.speed*dt;
    if(p.stamped) p.stamped=Math.min(1,p.stamped+dt*3);
    if(!p.stamped && !p.missed && p.x > w*0.72){ p.missed=true; W.streak=0; W.flash=0.35; beep(140,.12,"sawtooth"); }
  }
  W.plates = W.plates.filter(p=>p.x<w+60);
  W.flash=Math.max(0,W.flash-dt);
}
function stampNow(){
  if(MODE!=="work") return;
  const cv=$("#workcv"), w=cv.clientWidth;
  const zc=w*0.5;
  const p=W.plates.find(p=>!p.stamped && !p.missed && Math.abs(p.x-zc)<40);
  if(!p){ W.flash=0.25; beep(150,.08); return; }
  if(SYMS[W.sel]===p.sym){
    p.stamped=0.01; S.money+=3; S.earned+=3; W.streak++; addXP(2); tickTodo("work");
    beep(880,.06); if(W.streak%5===0) beep(1200,.1);
    toast("+$3"+(W.streak>1?"  STREAK x"+W.streak:""));
  } else { p.missed=true; W.streak=0; W.flash=0.4; beep(120,.15,"sawtooth"); toast("WRONG STAMP",1); }
  renderMeters();
}
function drawWork(t){
  const [ctx,w,h]=fit($("#workcv"));
  ctx.fillStyle = W.flash>0 ? "#2a0000" : "#000";
  ctx.fillRect(0,0,w,h);
  // machines
  const mw=Math.min(72,(w-40)/4), y0=14;
  for(let i=0;i<4;i++){
    const mx=w/2+(i-1.5)*(mw+8)-mw/2;
    const sel=i===W.sel;
    ctx.fillStyle=sel?"#fff":"#000"; ctx.strokeStyle=sel?"#fff":"#fff"; ctx.lineWidth=3;
    ctx.fillRect(mx,y0,mw,mw*0.8); ctx.strokeRect(mx,y0,mw,mw*0.8);
    drawSym(ctx,SYMS[i],mx+mw/2,y0+mw*0.4,mw*0.24, sel?"#000":"#fff");
  }
  ctx.fillStyle="#666"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
  ctx.fillText("TAP A MACHINE TO SELECT ITS DIE", w/2, y0+mw*0.8+14);
  // conveyor
  const cy=h*0.68;
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,cy+30); ctx.lineTo(w,cy+30); ctx.stroke();
  ctx.setLineDash([10,10]); ctx.lineDashOffset=-(t*W.speed)%20;
  ctx.beginPath(); ctx.moveTo(0,cy+38); ctx.lineTo(w,cy+38); ctx.stroke();
  ctx.setLineDash([]);
  // stamp zone brackets
  const zc=w*0.5;
  ctx.strokeStyle=W.flash>0?"#f22":"#fff"; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(zc-44,cy-46); ctx.lineTo(zc-44,cy-58); ctx.lineTo(zc-30,cy-58);
  ctx.moveTo(zc+44,cy-46); ctx.lineTo(zc+44,cy-58); ctx.lineTo(zc+30,cy-58);
  ctx.stroke();
  // plates
  for(const p of W.plates){
    ctx.strokeStyle = p.missed ? "#f22" : "#fff";
    ctx.fillStyle="#000"; ctx.lineWidth=3;
    ctx.fillRect(p.x-24,cy-18,48,48); ctx.strokeRect(p.x-24,cy-18,48,48);
    drawSym(ctx,p.sym,p.x,cy+6,13, p.missed?"#f22":"#fff");
    if(p.stamped){
      ctx.fillStyle="rgba(255,255,255,"+(1-p.stamped)+")";
      ctx.fillRect(p.x-24,cy-18,48,48);
      ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace";
      ctx.fillText("OK",p.x,cy-26);
    }
  }
  ctx.fillStyle="#fff"; ctx.font="8px 'Press Start 2P',monospace"; ctx.textAlign="left";
  ctx.fillText("STREAK "+W.streak, 10, h-12);
}
$("#workcv").addEventListener("pointerdown",e=>{
  const r=e.currentTarget.getBoundingClientRect();
  const x=e.clientX-r.left, y=e.clientY-r.top;
  const w=r.width, mw=Math.min(72,(w-40)/4);
  if(y<80){
    for(let i=0;i<4;i++){
      const mx=w/2+(i-1.5)*(mw+8)-mw/2;
      if(x>=mx&&x<=mx+mw){ W.sel=i; beep(500,.04); return; }
    }
  }
  W.swipe={y:e.clientY};
});
$("#workcv").addEventListener("pointerup",e=>{
  if(W.swipe && e.clientY-W.swipe.y>26) stampNow();
  W.swipe=null;
});

/* ---------- RUNNER ---------- */
const R={active:false};
function computeForm(daily){
  const m=mods();
  return {
    spd:(0.80+0.40*S.energy/100)*m.spd*(daily?1.12:1),
    jmp:(0.85+0.35*S.hunger/100)*m.jmp,
    tele:(0.85+0.30*S.thirst/100)*m.tele,
    scr:(0.70+0.60*S.mood/100)*m.scr,
    life:m.life, hint:m.hint, dark:m.dark
  };
}
function openPre(mode){
  if(mode==="comp" && S.lvl<15) return toast("COMPETITIONS UNLOCK AT LV.15",1);
  if(mode==="comp" && S.compsToday>=3) return toast("3 COMPETITION ENTRIES PER DAY MAX.",1);
  if(mode==="daily" && S.sick) return toast("BONES IS TOO SICK TO RUN. CARE FOR HIM FIRST.",1);
  if(mode==="daily" && S.dailyUsed) return toast("DAILY BONE ALREADY ATTEMPTED. COME BACK TOMORROW.",1);
  R.pending=mode;
  const f=computeForm(mode==="daily");
  $("#preTitle").textContent = mode==="daily"?"GET THE DAILY BONE":mode==="comp"?"DOG COMPETITION":"PRACTICE RUN";
  $("#preTitle").style.color = mode==="daily"?"#f22":"#fff";
  const sv=$("#preSavage");
  if(mode==="daily"){ sv.src=PORTRAITS.savage; sv.classList.add("show"); }
  else sv.classList.remove("show");
  $("#preLines").innerHTML =
    "TODAY'S FORM (FROM DOGCAM)<br>"+
    "SPEED x"+f.spd.toFixed(2)+" &#8212; JUMP x"+f.jmp.toFixed(2)+"<br>"+
    "REACTION x"+f.tele.toFixed(2)+" &#8212; SCORE x"+f.scr.toFixed(2)+"<br><br>"+
    (mode==="daily"
      ? "ONE ATTEMPT. NO LIFELINES.<br>MEMORIZE THE GATE SIGN.<br>SCORE LOCKS ONLY IF YOU BRING THE BONE HOME."
      : mode==="comp"
      ? "PRIZE: $1 PER 25 SCORE. LIFELINES: 2.<br>"+(3-S.compsToday)+" ENTRIES LEFT TODAY."
      : "LIFELINES: "+(3+f.life)+" &#8212; RUN FOREVER. TAP=JUMP, SWIPE DOWN=SLIDE.");
  $("#pre").classList.add("show");
}
$("#bPreBack").onclick=()=>{ $("#pre").classList.remove("show"); };
$("#bGo").onclick=()=>{ $("#pre").classList.remove("show"); startRun(R.pending); };

function startRun(mode){
  const f=computeForm(mode==="daily");
  Object.assign(R,{
    active:true, mode, phase:"run", f, t:0,
    px:0, courseLen: mode==="daily"?2400:Infinity,
    spd:230*f.spd, y:0, vy:0, slide:0, inv:0,
    obs:[], spawn:1, lives: mode==="daily"?1:(mode==="comp"?2:3+f.life),
    hintSym: SYMS[Math.floor(Math.random()*4)], hintSeen:false,
    gates:null, gatePicked:false, flash:0, score:0
  });
  S.outTimer=0;
  if(mode==="daily") tickTodo("d_bone");
  hidePortrait(); closeStatus(); showScreen("run"); beep(660,.08); setTimeout(()=>beep(880,.08),140);
}
function endRun(success,msg){
  msg=DN(msg);
  R.active=false;
  $("#resPortraitWrap").classList.remove("show");
  let compPrize=0;
  const daily=R.mode==="daily";
  let score=0;
  if(daily){
    S.dailyUsed=true;
    if(success){ score=Math.round((R.courseLen*2/10+500)*R.f.scr); S.bestDaily=Math.max(S.bestDaily,score); }
  } else {
    score=Math.round(R.px/10*R.f.scr);
    S.bestPractice=Math.max(S.bestPractice,score);
    if(R.mode==="comp"){ compPrize=Math.round(score/25); S.money+=compPrize; S.compsToday++; }
  }
  S.energy=clamp(S.energy-10,0,100); S.thirst=clamp(S.thirst-8,0,100); S.clean=clamp(S.clean-8,0,100); S.fun=clamp(S.fun+18,0,100);
  addXP(R.mode==="daily" ? (success===true?80:5) : Math.min(40, Math.round(score/15)+5));
  $("#resTitle").textContent = success===true ? "BONE SECURED" : (daily?"NO BONE TODAY":"RUN OVER");
  $("#resTitle").style.color = success===true ? "#fff" : "#f22";
  $("#resScore").textContent = String(score);
  if(daily && !success) $("#resScore").textContent="—";
  $("#resLines").innerHTML = msg + (daily?"<br>DAILY RANK LOCKED FOR TODAY.":R.mode==="comp"?"<br>PRIZE: $"+compPrize+" \u2014 "+(3-S.compsToday)+" ENTRIES LEFT TODAY":"<br>PRACTICE SCORES DON'T RANK.");
  $("#result").classList.add("show");
}
let hiddenAt=0;
document.addEventListener("visibilitychange",()=>{
  syncMoodMusic();   // pause the ambient loop when the tab isn't visible, resume when it is
  if(document.hidden){ hiddenAt=Date.now(); return; }
  if(!hiddenAt) return;
  const gap=(Date.now()-hiddenAt)/1000; hiddenAt=0;
  if(gap<90) return;
  if(R.active||OUTING.active||PK.active||EVO.active||$("#start").offsetParent) return;
  dropBallHere(); CAM.bedTarget=false;
  CAM.state="come"; CAM.t=0; CAM.until=99; CAM.fi=0; CAM.cameCalled=false; CAM.needCheck=false;
  toast(NAME()+" MISSED YOU!"); heartsBurst(4);
  beep(700,.08); setTimeout(()=>beep(950,.1),120);
  if(gap>600){
    setTimeout(()=>{
      if(CAM.state!=="zoomies" && !R.active && !PK.active){
        S.mood=clamp(S.mood+10,0,100);
        CAM.state="zoomies"; CAM.zTarget=CAM.x<0.4?0.98:-0.18; CAM.t=0; CAM.until=5; CAM.fi=0;
        ROBOT.zoomArm=true;
        toast("HE CAN'T BELIEVE YOU'RE BACK!!");
      }
    },2200);
  }
});
$("#bResHome").onclick=()=>{
  $("#result").classList.remove("show");
  returnHomeFromActivity();
};

function jump(){
  if(!R.active||R.phase==="gates") return;
  if(R.y===0){ R.vy=-760*R.f.jmp; R.slide=0; beep(700,.05); }
}
function slideStart(){ if(R.active&&R.y===0&&R.phase!=="gates"){ R.slide=1; } }
function slideEnd(){ R.slide=0; }

function updateRun(dt){
  if(!R.active) return;
  R.t+=dt; R.flash=Math.max(0,R.flash-dt); R.inv=Math.max(0,R.inv-dt);
  if(R.phase==="gates") return;
  const dir = R.phase==="return" ? -1 : 1;
  R.px += R.spd*dt*dir;
  // physics
  R.vy += 2400*dt; R.y += R.vy*dt;
  if(R.y>0){ R.y=0; R.vy=0; }
  // spawn
  R.spawn -= dt;
  if(R.spawn<=0){
    R.spawn = (0.95+Math.random()*0.5)/R.f.tele * (R.mode==="daily"?0.9:1);
    const type = Math.random()<0.55 ? "hurdle" : "sign";
    R.obs.push({x: 520, type, h: type==="hurdle" ? (Math.random()<0.5?34:50) : 0});
  }
  const cv=$("#runcv");
  for(const o of R.obs) o.x -= R.spd*dt;
  R.obs = R.obs.filter(o=>o.x>-80);
  // collide
  const dg={x:70, w:46, h: R.slide?24:42};
  const dogTop = (cv.clientHeight*0.8) + R.y - dg.h;
  for(const o of R.obs){
    if(o.hit) continue;
    const gy=cv.clientHeight*0.8;
    let ox=o.x, ow=26, oy, oh;
    if(o.type==="hurdle"){ oy=gy-o.h; oh=o.h; } else { oy=gy-110; oh=78; }
    if(dg.x < ox+ow && dg.x+dg.w > ox && dogTop < oy+oh && dogTop+dg.h > oy){
      o.hit=true;
      if(R.inv>0) continue;
      if(R.mode==="daily"){ beep(90,.3,"sawtooth"); return endRun(false,"BONES CLIPPED AN OBSTACLE."); }
      R.lives--; R.inv=1.2; R.flash=0.4; beep(110,.2,"sawtooth");
      if(R.lives<0) return endRun(false,"OUT OF LIFELINES.");
      toast("LIFELINE USED — "+R.lives+" LEFT",1);
    }
  }
  // daily phase changes
  if(R.mode==="daily"){
    if(R.phase==="run" && R.px>=R.courseLen){
      R.phase="gates"; R.obs=[];
      const others=SYMS.filter(s=>s!==R.hintSym).sort(()=>Math.random()-0.5).slice(0,2);
      R.gates=[R.hintSym,...others].sort(()=>Math.random()-0.5);
      beep(500,.1); beep(700,.1);
    }
    if(R.phase==="return" && R.px<=0){
      return endRun(true,"BONES BROUGHT THE BONE HOME.");
    }
  }
}
function pickGate(i){
  if(R.phase!=="gates"||R.gatePicked) return;
  R.gatePicked=true;
  if(R.gates[i]===R.hintSym){
    beep(880,.1); beep(1100,.12);
    toast("BONE GRABBED — RUN HOME!");
    setTimeout(()=>{ R.phase="return"; R.gatePicked=false; R.spd*=1.12; R.obs=[]; R.spawn=1; },500);
  } else {
    beep(90,.35,"sawtooth");
    setTimeout(()=>endRun(false,"WRONG GATE. THE BONE STAYS."),400);
  }
}
function drawRun(t){
  const [ctx,w,h]=fit($("#runcv"));
  ctx.fillStyle = R.flash>0 ? "#2a0000" : "#000";
  ctx.fillRect(0,0,w,h);
  const gy=h*0.8, u=h/64;
  // ground
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(w,gy); ctx.stroke();
  ctx.setLineDash([14,18]); ctx.lineDashOffset = (R.phase==="return"? -1:1) * -(R.px%32);
  ctx.strokeStyle="#333";
  ctx.beginPath(); ctx.moveTo(0,gy+14); ctx.lineTo(w,gy+14); ctx.stroke();
  ctx.setLineDash([]);
  if(R.phase==="gates"){
    ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("PICK THE GATE FROM THE SIGN", w/2, 34);
    for(let i=0;i<3;i++){
      const gx=w*(0.2+0.3*i);
      ctx.strokeStyle="#fff"; ctx.lineWidth=4;
      ctx.strokeRect(gx-38, gy-120, 76, 120);
      drawSym(ctx,R.gates[i],gx,gy-64,18,"#fff");
    }
    const gimg=RUNIMG[0];
    if(gimg.complete&&gimg.naturalWidth){
      const gh=64, gw=gh*gimg.naturalWidth/gimg.naturalHeight;
      ctx.save(); ctx.imageSmoothingEnabled=false;
      ctx.shadowColor="#f22"; ctx.shadowBlur=12;
      ctx.drawImage(gimg, w*0.5-gw/2, gy-gh, gw, gh);
      ctx.restore();
    }
  } else {
    // obstacles
    for(const o of R.obs){
      ctx.strokeStyle = o.hit ? "#f22" : "#fff"; ctx.lineWidth=3; ctx.fillStyle="#000";
      if(o.type==="hurdle"){
        ctx.fillRect(o.x,gy-o.h,26,o.h); ctx.strokeRect(o.x,gy-o.h,26,o.h);
        ctx.beginPath(); ctx.moveTo(o.x,gy-o.h); ctx.lineTo(o.x+26,gy-o.h+8); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(o.x+13,0); ctx.lineTo(o.x+13,gy-110); ctx.stroke();
        ctx.fillRect(o.x,gy-110,26,78); ctx.strokeRect(o.x,gy-110,26,78);
        ctx.fillStyle="#f22"; ctx.fillRect(o.x+7,gy-78,12,6);
      }
    }
    // hint sign (daily, mid-course)
    if(R.mode==="daily" && R.phase==="run"){
      const hintWorldX = R.courseLen*0.4;
      const sx = hintWorldX - R.px + 70;
      if(sx>-80 && sx<w+80){
        R.hintSeen=true;
        ctx.strokeStyle="#f22"; ctx.lineWidth=4;
        ctx.strokeRect(sx-34, gy-190, 68, 62);
        ctx.beginPath(); ctx.moveTo(sx,gy-128); ctx.lineTo(sx,gy); ctx.stroke();
        drawSym(ctx,R.hintSym,sx,gy-159,16,"#f22");
        ctx.fillStyle="#f22"; ctx.font="7px 'Press Start 2P',monospace"; ctx.textAlign="center";
        ctx.fillText("REMEMBER", sx, gy-198);
      }
    }
    // dog — gallop sprite, animation speed tied to ground speed; real jump/slide poses when airborne or sliding
    const blinkOff = R.inv>0 && Math.floor(t*12)%2===0;
    if(!blinkOff){
      let img, dh, dw;
      if(R.y<-4){
        const jf=JUMPIMG[Math.floor(t*10)%JUMPIMG.length];
        img=jf; dh=58; dw = jf.naturalWidth ? dh*jf.naturalWidth/jf.naturalHeight : dh;
      } else if(R.slide){
        const sf=SLIDEIMG[Math.floor(t*10)%SLIDEIMG.length];
        img=sf; dh=34; dw = sf.naturalWidth ? dh*sf.naturalWidth/sf.naturalHeight : dh*1.7;
      } else {
        const arr=(R.mode==="daily")?SAVAGEIMG:RUNIMG;
        img=arr[Math.floor(Math.abs(R.px)/26)%arr.length]; dh=60; dw = img.naturalWidth ? dh*img.naturalWidth/img.naturalHeight : dh*1.5;
      }
      if(img.complete && img.naturalWidth){
        const dx = 44, dy = gy + R.y - dh;
        ctx.save();
        ctx.imageSmoothingEnabled=false;
        if(R.mode==="daily"){ ctx.shadowColor="#f22"; ctx.shadowBlur=10; }
        if(R.phase==="return"){ ctx.translate(dx*2+dw,0); ctx.scale(-1,1); }
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
      }
    }
    // bone carried on return
    if(R.phase==="return"){
      ctx.fillStyle="#fff";
      ctx.fillRect(38, gy+R.y-52, 30, 8);
      ctx.fillRect(34, gy+R.y-56, 8, 16); ctx.fillRect(64, gy+R.y-56, 8, 16);
    }
  }
  // lucky rope persistent hint
  if(R.mode==="daily" && R.f.hint && R.hintSeen && R.phase!=="gates"){
    ctx.strokeStyle="#f22"; ctx.lineWidth=2; ctx.strokeRect(w-52,10,42,42);
    drawSym(ctx,R.hintSym,w-31,31,11,"#f22");
  }
  // dark modifier / daily darkness
  if(R.f && (R.f.dark || R.mode==="daily")){
    ctx.fillStyle = "rgba(0,0,0,"+(R.f.dark?0.42:0.22)+")";
    ctx.fillRect(0,0,w,h);
  }
  // HUD
  ctx.fillStyle="#fff"; ctx.font="9px 'Press Start 2P',monospace"; ctx.textAlign="left";
  if(R.mode==="daily"){
    const total=R.courseLen*2;
    const prog = R.phase==="return" ? R.courseLen + (R.courseLen-R.px) : Math.min(R.px,R.courseLen);
    ctx.fillText(R.phase==="return"?"RUN HOME":"DAILY BONE", 10, 20);
    ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(10,28,w-20,8);
    ctx.fillRect(10,28,(w-20)*clamp(prog/total,0,1),8);
  } else {
    ctx.fillText("SCORE "+Math.round(R.px/10*R.f.scr), 10, 20);
    ctx.fillText("LIVES "+Math.max(0,R.lives), 10, 36);
  }
}
$("#runcv").addEventListener("pointerdown",e=>{
  const r=e.currentTarget.getBoundingClientRect();
  if(R.phase==="gates"){
    const x=(e.clientX-r.left)/r.width;
    pickGate(x<0.35?0 : x<0.65?1 : 2);
    return;
  }
  R.touch={y:e.clientY,t:performance.now(),acted:false};
});
$("#runcv").addEventListener("pointermove",e=>{
  if(R.touch && !R.touch.acted && e.clientY-R.touch.y>24){ R.touch.acted=true; slideStart(); setTimeout(slideEnd,550); }
});
$("#runcv").addEventListener("pointerup",e=>{
  if(R.touch && !R.touch.acted) jump();
  R.touch=null;
});
$("#bJump").addEventListener("pointerdown",e=>{e.preventDefault();jump();});
$("#bSlide").addEventListener("pointerdown",e=>{e.preventDefault();slideStart();});
$("#bSlide").addEventListener("pointerup",slideEnd);
$("#bSlide").addEventListener("pointerleave",slideEnd);
document.addEventListener("keydown",e=>{
  if(e.repeat) return;
  if(e.code==="Space"||e.code==="ArrowUp"){ e.preventDefault(); jump(); }
  if(e.code==="ArrowDown"){ e.preventDefault(); slideStart(); }
  if(MODE==="work" && e.code==="Space"){ stampNow(); }
  if(R.phase==="gates" && ["Digit1","Digit2","Digit3"].includes(e.code)) pickGate(+e.code.slice(-1)-1);
});
document.addEventListener("keyup",e=>{ if(e.code==="ArrowDown") slideEnd(); });

/* ---------- wiring ---------- */
document.querySelectorAll(".breed.locked").forEach(el=>{
  el.addEventListener("click",()=>{ toast("THIS BREED IS COMING SOON.",1); beep(200,.06); });
});
$("#breedBones").onclick=()=>{
  $("#breedBones").classList.add("picked");
  $("#namebox").classList.remove("hidden");
  const inp=$("#dogNameIn"); inp.focus(); inp.select();
  beep(600,.06);
};
$("#adopt").onclick=()=>{
  const v=$("#dogNameIn").value.trim().toUpperCase().slice(0,10);
  S.dogName = v || "BONES";
  renderMeters();
  $("#start").classList.add("hidden");
  $("#game").classList.remove("hidden");
  beep(440,.1); setTimeout(()=>beep(660,.12),120);
  toast("BONES IS HOME. KEEP HIM ALIVE.");
  saveGame(true);
};
$("#bHome1").onclick=leaveWork;
$("#bStamp").onclick=stampNow;
$("#rSnack").onclick=()=>{ if(S.money<3) return toast("NO MONEY",1);
  S.money-=3; S.hunger=clamp(S.hunger+22,0,100); beep(520); toast("REMOTE BONE DISPENSED"); renderMeters(); };
$("#rWalk").onclick=()=>{ if(S.money<5) return toast("NO MONEY",1);
  S.money-=5; S.mood=clamp(S.mood+18,0,100); S.clean=clamp(S.clean-4,0,100); beep(640); toast("DOGWALKER BOOKED"); renderMeters(); };
// DOGPARK performance leans on energy and mood (see startPark's spd formula) — a dog running on
// empty is visibly slower out there, so warn before he wastes a run being sluggish rather than
// let the player find out mid-wave. Whichever of energy/hunger/mood is worst picks the wording.
function pkFitnessWarning(){
  const cands=[{v:S.energy,word:"TIRED"},{v:S.hunger,word:"HUNGRY"},{v:S.mood,word:"DOWN"}];
  cands.sort((a,b)=>a.v-b.v);
  return cands[0].v<40 ? cands[0].word : null;
}
function reallyEnterDogpark(){
  if(S.dogParkPlusUnlocked){
    openChoice("CHOOSE YOUR PARK",
      "DOGPARK UNLEASHED REPEATS THE SAME 10 WAVES UNDER A DARKER NIGHT SKY WITH DOUBLE THE ENEMIES ON SCREEN AT ONCE.",
      "NORMAL", ()=>{ toast("SURVIVE THE WAVES, BANK BIG XP. IF BONES GETS CAUGHT, YOU LOSE IT ALL \u2620\ufe0f",1); startPark(false); },
      "UNLEASHED", ()=>{ toast("DOGPARK UNLEASHED \u2014 DOUBLE THE ENEMIES, SAME WAVES, UNDER COVER OF NIGHT.",1); startPark(true); },
      "\u2190 BACK", null);
    return;
  }
  toast("SURVIVE THE WAVES, BANK BIG XP. IF BONES GETS CAUGHT, YOU LOSE IT ALL \u2620\ufe0f",1);
  startPark(false);
}
$("#bWalk").onclick=()=>{
  if(S.lvl<5) return toast("THE DOGPARK UNLOCKS AT LV.5",1);
  if(S.sick) return toast("BONES IS TOO SICK FOR THE PARK",1);
  const warnWord=pkFitnessWarning();
  if(warnWord){
    openChoice("BONES LOOKS "+warnWord,
      "HE WON'T BE AT HIS BEST OUT THERE LIKE THIS \u2014 SLOWER THAN USUAL IN THE PARK.<br><br>ARE YOU SURE YOU WANT TO GO?",
      "GO ANYWAY", reallyEnterDogpark,
      "TAKE CARE OF HIM FIRST", null);
    return;
  }
  reallyEnterDogpark();
};
function openSupplies(){ renderSupplies(); $("#supplies").classList.add("show"); }
function renderSupplies(){
  const it=(icon,name,tiny,key,owned)=>'<div class="prow'+(owned===false?' locked':'')+'" data-it="'+key+'"><span class="nm">'+icon+' '+name+'<br><span class="tiny">'+tiny+'</span></span></div>';
  $("#suppliesList").innerHTML =
    it(icn("water"),"WATER BOWL","TAP TO POUR \u2014 FREE. HE DRINKS WHEN THIRSTY","water")+
    it(icn("food"),"FOOD BOWL","POUR KIBBLE (x"+S.kibble+" LEFT) \u2014 3 POURS FILL","food")+
    (S.shampooPct>0
      ? it(icn("sponge"),"SPONGE","DRAG OFF THE WALL \u2014 SCRUB HIM CLEAN","sponge")
      : it(icn("sponge"),"SPONGE","NEEDS SHAMPOO \u2014 FIND IT IN THE SHOP","spongebuy",false))+
    (S.bedTier===0
      ? it(icn("bed"),"DOG BED","NOT OWNED \u2014 FIND IT IN THE SHOP","bedbuy",false)
      : bedAdequate()
        ? it(icn("bed"),"DOG BED ("+bedTierName(S.bedTier)+")","TAP THE BED \u2014 FULL REST","bed")
        : it(icn("bed"),"DOG BED ("+bedTierName(S.bedTier)+")","HE'S OUTGROWN IT \u2014 UPGRADE IN SHOP","bedbuy",false))+
    (S.shampooOwned ? it(pctIcon(S.shampooPct),"DOG SHAMPOO "+Math.round(S.shampooPct)+"%","BATHS USE IT UP \u2014 RESTOCK IN THE SHOP","shampooinfo") : "")+
    it(icn("kibble"),"KIBBLE x"+S.kibble,"RESTOCK IN THE SHOP","food")+
    it(icn("snack"),"BONE TREATS x"+S.snacks,"GIVE ONE FROM NOURISH BONES","snack")+
    (S.ballOwned ? '<div class="prow"><span class="nm">'+icn("ball")+' SPARE BALLS x'+S.ballStock
      +'<br><span class="tiny">SET ONE DOWN IF HIS CURRENT ONE IS LOST OR STUCK</span></span>'
      +'<button data-supact="ball" '+(S.ballStock<=0?"disabled":"")+'>SET DOWN</button></div>' : "")+
    // left behind the first time the mysterious dog did business with you — blow it and he comes
    (S.mystMet ? '<div class="prow" style="border-color:#e8c14a"><span class="nm" style="color:#e8c14a">◎ DOG WHISTLE'
      +'<br><span class="tiny">NOBODY ELSE HEARS IT. HE DOES.</span></span>'
      +'<button data-supact="whistle">BLOW IT</button></div>' : "");
}
$("#shopSup").addEventListener("click",e=>{
  const t=e.target.closest("button"); if(!t) return;
  if(t.dataset.sup==="kibble"&&S.money>=2){ S.money-=2; S.kibble++; beep(600,.05); }
  if(t.dataset.sup==="bed") buyBed();
  if(t.dataset.sup==="biggerbed") buyBiggerBed();
  if(t.dataset.sup==="ball"){ buyBall(); }
  if(t.dataset.sup==="brush"&&S.money>=18&&!S.brushOwned){ S.money-=18; S.brushOwned=true; beep(660,.07); setTimeout(()=>beep(880,.09),100); toast("A DOG BRUSH. IT HANGS BY THE SPONGE."); }
  if(t.dataset.sup==="hoop"&&S.money>=40&&!S.hoopOwned){ S.money-=40; S.hoopOwned=true; beep(880,.08); setTimeout(()=>beep(1170,.1),100); toast("HOOP MOUNTED BY THE WINDOW. SWISH \u2014 +1 XP A BASKET."); }
  if(t.dataset.sup==="shampoo"&&S.money>=5&&S.shampooPct<100){ S.money-=5; S.shampooOwned=true; S.shampooPct=100; beep(700,.07); setTimeout(()=>beep(950,.09),100); toast("SHAMPOO TOPPED UP \u2014 TIME FOR A BATH!"); }
  if(t.dataset.sup==="snack"&&S.money>=3){ S.money-=3; S.snacks++; beep(600,.05); }
  if(t.dataset.sup==="robot"&&S.money>=350&&!S.owned.robot){ S.money-=350; S.owned.robot=true; beep(660,.08); setTimeout(()=>beep(880,.08),120); setTimeout(()=>beep(1100,.1),240); toast("NOURISH-BOT INSTALLED! BONES EATS AND DRINKS WHILE YOU WORK."); }
  renderMeters(); renderShop();
});
$("#mystClose").onclick=closeMystShop;
$("#mystList").addEventListener("click",e=>{
  const row=e.target.closest("[data-myst]"); if(!row) return;
  // nothing here is wired up yet, so he takes nothing — see MYST_GOODS
  beep(220,.1,"sine",.04);
  toast("“NOT YET. YOU'RE NOT READY FOR THAT ONE.”",1);
});
$("#suppliesList").addEventListener("click",e=>{
  const wbtn=e.target.closest("button[data-supact='whistle']");
  if(wbtn){ mystWhistle(); return; }
  const abtn=e.target.closest("button[data-supact]");
  if(abtn){ if(abtn.dataset.supact==="ball") placeBallFromStock(); return; }
  const row=e.target.closest(".prow"); if(!row) return;
  const k=row.dataset.it;
  const info={
    water:"WATER BOWL: TAP IT IN THE DOGCAM TO POUR. THREE TAPS FILL IT.",
    food:"FOOD BOWL: TAPS POUR KIBBLE. HE FEEDS HIMSELF WHEN HUNGRY.",
    sponge:"SPONGE: DRAG IT OFF THE WALL AND SCRUB HIM. SUDS = CLEAN.",
    bed:"THE BED: TAP IT AND HE'LL GO REST TO FULL ENERGY.",
    snack:"BONE TREATS: GIVE HIM ONE AND HE TROTS OVER TO CHEW IT. FIVE ON THE FLOOR AND HE GETS THE ZOOMIES.",
    bedbuy: S.bedTier===0 ? "NO BED YET \u2014 HE ONLY RESTS TO 70%. IT'S IN THE SHOP." : "HE'S OUTGROWN THIS BED \u2014 HE ONLY RESTS TO 70%. UPGRADE IN THE SHOP.",
    spongebuy:"NO SHAMPOO YET \u2014 HE CAN'T BE WASHED. IT'S IN THE SHOP.",
    shampooinfo:"DOG SHAMPOO: EACH BATH USES SOME UP. RESTOCK IT IN THE SHOP."
  }[k];
  if(!info) return;
  toast(info);
  if(k!=="snack"&&k!=="bedbuy"&&k!=="spongebuy"&&k!=="shampooinfo") setPulse(k);
  if(k==="bedbuy"||k==="spongebuy") openShopPanel();
  beep(520,.05);
});
// every list of gated activities sorts the same way: whatever unlocks earliest sits at the
// top, the deepest lock sits at the bottom, so the list reads as a progression ladder
function unlockSort(rows){ return rows.sort((a,b)=>a.req-b.req).map(r=>r.html).join(""); }
function renderGoOut(){
  const workL=S.earned<5000, compL=S.lvl<15, beachL=S.lvl<9, litL=S.lvl<18, agiL=S.lvl<8;
  const rows=[
    {req:0, html:'<div class="prow"><span class="nm">&#9642; DELIVERY DRIVER<br><span class="tiny">DELIVER PARCELS FOR CASH</span></span><button data-go="paperboy">GO</button></div>'},
    {req:8, html:'<div class="prow'+(agiL?" locked":"")+'"><span class="nm">&#9650; AGILITY TRAINING<br><span class="tiny">'+(agiL?"UNLOCKS LV.8":"-15 ENERGY \u2014 +12 XP")+'</span></span><button data-go="agility" '+(agiL?"disabled":"")+'>TRAIN</button></div>'},
    {req:9, html:'<div class="prow'+(beachL?" locked":"")+'"><span class="nm">&#9679; BEACH DAY<br><span class="tiny">'+(beachL?"UNLOCKS LV.9":(S.beach?"OWNED \u2014 BIG FUN":"UNLOCK $25"))+'</span></span><button data-go="beach" '+(beachL||OUTING.active?"disabled":"")+'>'+(S.beach?"GO":"BUY")+'</button></div>'},
    {req:15, html:'<div class="prow'+(compL?" locked":"")+'"><span class="nm">&#9733; DOG COMPETITION<br><span class="tiny">'+(compL?"UNLOCKS LV.15":"PRIZE MONEY \u2014 "+(3-S.compsToday)+"/3 TODAY")+'</span></span><button data-go="comp" '+(compL?"disabled":"")+'>ENTER</button></div>'},
    {req:18, html:'<div class="prow'+(litL?" locked":"")+'"><span class="nm">&#9829; VISIT THE BREEDER<br><span class="tiny">'+(litL?"UNLOCKS LV.18":(S.litter?"A PUP AWAITS":"ONE LITTER, ONE SUCCESSOR"))+'</span></span><button data-go="litter" '+(litL?"disabled":"")+'>GO</button></div>'},
    // money-gated rather than level-gated, and $5000 is a long grind \u2014 so it anchors the bottom
    {req:99, html:'<div class="prow'+(workL?" locked":"")+'"><span class="nm">&#9830; STAMPING PLANT<br><span class="tiny">'+(workL?"UNLOCKS AT $5000 EARNED":"EARN MONEY")+'</span></span><button data-go="work" '+(workL?"disabled":"")+'>GO</button></div>'}
  ];
  $("#gooutList").innerHTML = unlockSort(rows);
}
$("#gooutList").addEventListener("click",e=>{
  const t=e.target.closest("button"); if(!t||t.disabled) return;
  const g=t.dataset.go;
  $("#goout").classList.remove("show");
  if(g==="work") enterWork();
  if(g==="paperboy") enterPaperboy();
  if(g==="comp") openPre("comp");
  if(g==="agility"){
    if(S.energy<20) return toast("BONES IS TOO TIRED TO TRAIN",1);
    S.energy=clamp(S.energy-15,0,100); S.fun=clamp(S.fun+8,0,100); S.mood=clamp(S.mood+4,0,100);
    addXP(12); beep(820,.06); toast("AGILITY DRILLS DONE. +XP"); renderMeters();
  }
  if(g==="beach"){
    if(!S.beach){ if(S.money<25) return toast("NOT ENOUGH MONEY \u2014 $25 TO UNLOCK",1); S.money-=25; S.beach=true; toast("BEACH UNLOCKED!"); renderMeters(); }
    else startOuting("BEACH",25);
  }
  if(g==="litter"){
    openChoice("THE BREEDER",
      "TWO WAYS TO GROW THE FAMILY:<br><br>A LITTER \u2014 ONE PUP WAITS TO CARRY<br>THE LEGACY WHEN BONES RETIRES.<br><br>OR TAKE A PUPPY HOME TODAY \u2014 $500 \u2014<br>A SECOND MOUTH TO FEED, RIGHT NOW.",
      "THE LITTER (LEGACY)",()=>{
        if(S.litter) return toast("BONES ALREADY HAS A PUP WAITING.");
        S.litter=true; heartsBurst(5); beep(700,.08); setTimeout(()=>beep(900,.1),110);
        toast("A LITTER! ONE PUP WILL CARRY THE LEGACY.");
      },
      "TAKE A PUPPY \u2014 $500",()=>{
        if(S.pup.owned) return toast("ONE PUPPY IS PLENTY OF CHAOS.",1);
        if(S.money<500) return toast("A PUPPY COSTS $500. KEEP WORKING.",1);
        S.money-=500;
        const suf=[" II"," III"," IV"," V"," VI"][Math.min(S.gen-1,4)];
        const nm=(prompt("NAME THE PUPPY", (S.dogName||"BONES")+suf)||"").trim().toUpperCase().slice(0,10);
        S.pup.owned=true; S.pup.name=nm||((S.dogName||"BONES")+suf);
        S.pup.hunger=70; S.pup.thirst=70; S.pup.mood=80; S.pup.xp=0; S.pup.lvl=1;
        renderDogSel();
        PUP.x=0.72; PUP.st="idle"; PUP.t=0; PUP.until=2;
        heartsBurst(6); beep(700,.09); setTimeout(()=>beep(920,.1),110); setTimeout(()=>beep(1180,.12),220);
        toast(S.pup.name+" IS HOME!");
        renderMeters();
      },
      "\u2190 BACK", null);
  }
});
$("#todoClose").onclick=()=>$("#todoPanel").classList.remove("show");
$("#todoBar").onclick=()=>{
  renderTodo();
  $("#todoPanel").classList.add("show");
};
function todoReward(k){
  ({work:()=>S.money+=25, bowls:()=>S.money+=5,
    d_happy:()=>addXP(50), d_nour:()=>addXP(10), d_ball:()=>addXP(10),
    d_park:()=>addXP(12), d_clean:()=>addXP(10),
    j_wave3:()=>addXP(40), j_collar:()=>addXP(25), j_trick:()=>addXP(25),
    p_feed:()=>pupAddXP(8), p_play:()=>pupAddXP(10), p_pet:()=>pupAddXP(6)}[k]||(()=>{}))();
}
function claimTodo(k,row){
  const i=TODO_NEW.indexOf(k); if(i<0) return;
  TODO_NEW.splice(i,1);
  todoReward(k); renderMeters();
  const m=TODO_META.find(x=>x[0]===k);
  beep(660,.09); setTimeout(()=>beep(880,.1),100); setTimeout(()=>beep(1170,.12),200);
  toast("\u2713 CLAIMED "+m[3]);
  if(row){ row.classList.add("fade"); setTimeout(renderTodo,600); }
  else renderTodo();
}
$("#todoList").addEventListener("click",e=>{
  const bt=e.target.closest("button");
  if(bt && bt.dataset.todo==="bed"){ buyBed(); renderTodo(); return; }
  if(bt && bt.dataset.todo==="ball"){
    if(!S.ballOwned) buyBall();
    return;
  }
  const row=e.target.closest(".prow.claim");
  if(row) claimTodo(row.dataset.k,row);
});
function renderDogSel(){
  const el=$("#dogSel"), sec=$("#dogSelSect");
  if(!el) return;
  const show=S.pup.owned;
  el.classList.toggle("hidden",!show);
  if(sec) sec.classList.toggle("hidden",!show);
  if(!show){ el.innerHTML=""; return; }
  const stayLbl=id=> STAY[id]>Date.now() ? "STAYING" : "STAY";
  const btn=(id,nm,stage,act)=>'<div class="dogbtn'+(act?" active":"")+'" data-dog="'+id+'"><img src="'+PORTRAITS.happy+'"><span>'+nm+'<br><span class="tiny" style="color:#999">'+stage+'</span></span><button class="staybtn" data-stay="'+id+'">'+stayLbl(id)+'</button></div>';
  el.innerHTML = btn("bones", NAME(), stageName(Math.min(XPANIM.lvl,S.lvl))+" LV."+Math.min(XPANIM.lvl,S.lvl), S.sel==="bones")
    + btn("pup", S.pup.name, "PUPPY LV."+S.pup.lvl+" \u2014 GEN "+["II","III","IV","V","VI","VII"][Math.min(S.gen-1,5)], S.sel==="pup");
}
function flashDogSel(){
  const el=document.querySelector('#dogSel .dogbtn[data-dog="'+S.sel+'"]');
  if(el){ el.classList.add("flash"); setTimeout(()=>el.classList.remove("flash"),1600); }
}
$("#dogSel").addEventListener("click",e=>{
  const sb=e.target.closest(".staybtn");
  if(sb){ doStay(sb.dataset.stay); return; }
  const bt=e.target.closest(".dogbtn"); if(!bt) return;
  S.sel=bt.dataset.dog; renderDogSel(); beep(560,.05);
});
$("#bSupplies").onclick=openSupplies;
$("#bGoOut").onclick=()=>{ renderGoOut(); $("#goout").classList.add("show"); };
$("#bFetch").onclick=()=>{
  if(R.active||OUTING.active||PK.active) return toast("BONES ISN'T HOME",1);
  if(!S.ballOwned) return toast(S.lvl<2?"A BALL UNLOCKS AT LV.2":"BUY A BALL \u2014 $5 IN THE SHOP",1);
  if(S.pup.owned && S.sel==="pup"){
    if(BALL.pcarried) return toast(S.pup.name+" ALREADY HAS IT!");
    if(BALL.carried) return toast(NAME()+" HAS THE BALL \u2014 CALL HIM OFF.",1);
    if(BALL.off) return toast("THE BALL ROLLED OUT OF SIGHT.",1);
    STAY.pup=0;
    PUP.st="fetchgo"; PUP.tx=clamp(BALL.x-0.02,0.03,0.92); PUP.until=99; PUP.t=0;
    beep(660,.07); toast(S.pup.name+": FETCH!");
    return;
  }
  if(WASH.active||WASH.pending||EVO.active) return;
  if(BALL.carried) return toast("HE'S ALREADY GOT IT.");
  if(BALL.pcarried) return toast(S.pup.name+" HAS IT \u2014 LET THE PUP FINISH!",1);
  if(CAM.state==="rest") toggleRest();
  CAM.bedTarget=false; hidePortrait();
  if(BALL.off){
    // it's actually out of the room \u2014 send him after it for real instead of just saying so.
    // this used to just toast "he'll find it" and do nothing, which could leave the ball stuck
    // off-screen forever if the automatic pickup (see the BALL.off check in the physics tick)
    // never fired in the first place
    CAM.state="fetch"; CAM.fetchPhase=1; CAM.t=0; CAM.until=99; CAM.fi=0;
    beep(660,.07); toast("BONES GOES AFTER IT!");
    return;
  }
  CAM.state="fetch"; CAM.fetchPhase=5; CAM.t=0; CAM.until=99; CAM.fi=0;
  beep(660,.07); toast("FETCH!");
};
$("#bShopBtn").onclick=()=>{ renderShop(); $("#shopPanel").classList.add("show"); };
$("#supClose").onclick=()=>$("#supplies").classList.remove("show");
$("#goClose").onclick=()=>$("#goout").classList.remove("show");
$("#shopClose").onclick=()=>$("#shopPanel").classList.remove("show");
$("#camstate").onclick=openStatus;
$("#needAlert").onclick=openStatus;
$("#bMenu").onclick=()=>{
  $("#menuPanel").classList.add("show"); renderSaveCard();
  $("#saveStatus").textContent="PROGRESS ONLY PERSISTS WHEN YOU SAVE.";
  beep(500,.05);
};
$("#menuClose").onclick=()=>$("#menuPanel").classList.remove("show");
$("#mCare").onclick=()=>{ $("#menuPanel").classList.remove("show"); $("#careGuidePanel").classList.add("show"); beep(500,.05); };
$("#careClose").onclick=()=>$("#careGuidePanel").classList.remove("show");
$("#mailBtn").onclick=()=>{ renderMail(); $("#mailPanel").classList.add("show"); beep(500,.05); };
$("#mailClose").onclick=()=>$("#mailPanel").classList.remove("show");
$("#mailList").addEventListener("click",e=>{
  const row=e.target.closest(".prow"); if(!row) return;
  S.mail=S.mail.filter(m=>m.id!==row.dataset.id);
  renderMail();
});
function dayClock(day,h){ return "DAY "+day+" "+String(Math.floor(h)).padStart(2,"0")+":00"; }
function renderSaveCard(){
  $("#saveName").textContent = NAME();
  $("#saveLvl").textContent = "LV. "+S.lvl;
  $("#saveMoney").textContent = "$"+S.money;
  $("#saveBones").textContent = S.snacks;   // the bone stock park runs bank into
  $("#saveDay").textContent = dayClock(CLK.day,CLK.h);
  $("#saveLast").textContent = S.lastSaveAt ? dayClock(S.lastSaveDay,S.lastSaveH) : "\u2014 NEVER \u2014";
}
function renderSettings(){
  $("#setSound").textContent = SETTINGS.sound ? "ON" : "OFF";
  $("#setMusic").textContent = SETTINGS.music ? "ON" : "OFF";
  $("#setMotion").textContent = SETTINGS.reduceMotion ? "ON" : "OFF";
  $("#setBarkStyle").textContent = SETTINGS.barkStyle==="lines" ? "LINES" : "CIRCLE";
  // only makes sense from the DOGCAM settings — mid-run this would yank the player straight out
  // of DOGPARK and into the delivery driver minigame, with the park run left dangling; same logic
  // mid-route, where it would restart the tutorial on top of the live delivery route
  $("#mReplayTutorial").style.display = (S.pbTutorialDone && !PK.active && !PB.run) ? "" : "none";
  // only relevant mid-run — opened from DOGPARK's own settings button (see #pkSettingsBtn)
  $("#setEndRunPk").style.display = PK.active ? "" : "none";
  // only relevant during a live DOGPARK UNLEASHED run — switching it off reverts the whole night
  // treatment (tint, fog-of-war, fireflies) back to how regular DOGPARK looks, live, mid-run
  $("#setNightModeRow").style.display = (PK.active && PK.plusMode) ? "" : "none";
  $("#setNightMode").textContent = SETTINGS.nightMode ? "ON" : "OFF";
  $("#setShake").textContent = SETTINGS.shake==="off" ? "OFF" : SETTINGS.shake==="reduced" ? "REDUCED" : "FULL";
  $("#setVignette").value = SETTINGS.vignette;
  $("#setVignetteVal").textContent = SETTINGS.vignette+"%";
  renderGlobalMusicBtn();
}
// kept separate from renderSettings() so the corner button can refresh on its own
// (boot, toggling from the button itself) without needing the settings panel involved
function renderGlobalMusicBtn(){
  const btn=$("#globalMusicBtn");
  btn.classList.toggle("muted", !SETTINGS.music);
  btn.title = SETTINGS.music ? "MUSIC: ON" : "MUSIC: OFF";
}
$("#mSettings").onclick=()=>{
  $("#menuPanel").classList.remove("show"); renderSettings();
  $("#settingsPanel").classList.add("show"); beep(500,.05);
  syncMoodMusic();   // settings hands the room back to the menu melody
};
// PK.settingsOpen/PB.settingsOpen only matter while a DOGPARK run or delivery route is live (see
// pkPadDraw's gear button and the paperboy HUD's) — pausing the world while this panel covers the
// screen, same as the shop/friends/gate prompts
$("#settingsClose").onclick=()=>{
  $("#settingsPanel").classList.remove("show");
  if(typeof PK!=="undefined") PK.settingsOpen=false;
  if(typeof PB!=="undefined"){ PB.settingsOpen=false; if(PB.run) pbEngineStart(); }
  syncMoodMusic();
};
$("#setSound").onclick=()=>{
  SETTINGS.sound=!SETTINGS.sound; renderSettings();
  if(SETTINGS.sound) beep(500,.05);
};
$("#setBarkStyle").onclick=()=>{
  SETTINGS.barkStyle = SETTINGS.barkStyle==="lines" ? "circle" : "lines";
  renderSettings(); beep(500,.05);
};
$("#setNightMode").onclick=()=>{
  SETTINGS.nightMode=!SETTINGS.nightMode;
  renderSettings(); beep(500,.05);
};
$("#setShake").onclick=()=>{
  SETTINGS.shake = SETTINGS.shake==="full" ? "reduced" : SETTINGS.shake==="reduced" ? "off" : "full";
  renderSettings(); beep(500,.05);
};
// live-updates as the slider drags — no need to wait for release before the vignette responds
$("#setVignette").addEventListener("input",()=>{
  SETTINGS.vignette = parseInt($("#setVignette").value,10)||0;
  $("#setVignetteVal").textContent = SETTINGS.vignette+"%";
});
$("#setEndRunPk").onclick=()=>{
  $("#settingsPanel").classList.remove("show"); PK.settingsOpen=false;
  PK.endRunAsk=true;
  openChoice("LEAVE EARLY?",
    "YOU'LL LOSE ALL "+PK.bones+" BONES AND ALL THE XP FROM<br>THIS RUN — NONE OF IT COMES HOME.<br><br>DO YOU REALLY WANT TO LEAVE EARLY?",
    "YES, END RUN", ()=>{ PK.endRunAsk=false; pkForfeitRun(); },
    "KEEP PLAYING", ()=>{ PK.endRunAsk=false; });
};
$("#setMusic").onclick=()=>{
  SETTINGS.music=!SETTINGS.music;
  syncMoodMusic();
  renderSettings(); beep(500,.05);
};
$("#globalMusicBtn").onclick=()=>{
  SETTINGS.music=!SETTINGS.music;
  syncMoodMusic();
  renderGlobalMusicBtn();
  if(SETTINGS.music) beep(500,.05);
};
$("#setMotion").onclick=()=>{
  SETTINGS.reduceMotion=!SETTINGS.reduceMotion;
  document.body.classList.toggle("reduce-motion",SETTINGS.reduceMotion);
  renderSettings(); beep(500,.05);
};
$("#mReplayTutorial").onclick=()=>{
  $("#settingsPanel").classList.remove("show");
  enterPaperboyTutorial();
};
// Pok\u00e9mon-style save: nothing persists until this is pressed \u2014 a short "saving, don't turn off
// the power" beat, then the card updates to show exactly when/what got saved.
// the actual write, shared by the deliberate menu save and the quick post-activity prompt
function performSave(){
  if(!STORAGE_OK) return false;
  S.lastSaveAt=Date.now(); S.lastSaveDay=CLK.day; S.lastSaveH=CLK.h;
  return saveGame(true);
}
$("#mSaveGame").onclick=()=>{
  if(!STORAGE_OK){ beep(150,.15); toast("SAVE UNAVAILABLE \u2014 STORAGE IS BLOCKED ON THIS DEVICE.",1); return; }
  $("#mSaveGame").disabled=true;
  $("#saveStatus").textContent="SAVING... DON'T CLOSE THE APP.";
  beep(400,.05);
  setTimeout(()=>{
    const ok=performSave();
    $("#saveStatus").textContent = ok ? "SAVED!" : "SAVE FAILED \u2014 STORAGE MAY BE FULL.";
    renderSaveCard();
    $("#mSaveGame").disabled=false;
    if(ok){ beep(700,.06); setTimeout(()=>beep(950,.08),100); }
    else beep(150,.15);
  }, 500);
};
// a quieter version for the post-activity save prompt \u2014 no "saving..." pause, just a toast
function quickSave(){
  const ok=performSave();
  toast(ok?"SAVED!":"SAVE FAILED \u2014 STORAGE MAY BE FULL.",1);
  if(ok){ beep(700,.06); setTimeout(()=>beep(950,.08),100); } else beep(150,.15);
}
// prompted once whenever the player lands back home from DOGPARK, a job, or a run \u2014 those are
// exactly the moments real progress (money, XP, bones) was just earned and is still unsaved
function maybeAskSave(){
  if(!STORAGE_OK) return;
  openChoice("SAVE YOUR PROGRESS?",
    "LOCK IN WHAT YOU JUST EARNED SO IT ISN'T LOST IF THE APP CLOSES.",
    "SAVE NOW", ()=>quickSave(),
    "NOT NOW", null);
}
function returnHomeFromActivity(){
  showScreen("home"); renderMeters(); renderShop();
  maybeAskSave();
}
function startNewGame(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  location.reload();
}
$("#mNewGame").onclick=()=>{
  $("#menuPanel").classList.remove("show");
  openChoice("START OVER?",
    "THIS DELETES "+NAME()+"'S SAVE FOR GOOD \u2014 THERE'S NO GETTING IT BACK.<br><br>ARE YOU SURE?",
    "YES, START OVER", startNewGame,
    "CANCEL", null);
};
$("#bCall").onclick=()=>{
  if(R.active||OUTING.active) return toast("BONES ISN'T HOME",1);
  if(S.pup.owned && S.sel==="pup"){
    STAY.pup=0;
    PUP.st="go"; PUP.tx=0.42; PUP.next="idle"; PUP.until=99; PUP.t=0;
    heartsBurst(1); beep(880,.06); setTimeout(()=>beep(880,.06),140);
    toast(S.pup.name+" COMES RUNNING!");
    return;
  }
  CAM.needCheck=true; callBones();
};
/* ---------- NOURISH BONES: everything that feeds hunger / thirst / energy in one place ---------- */
function openNourish(){ renderNourish(); $("#nourish").classList.add("show"); beep(500,.05); }
function renderNourish(){
  const mrow=(lb,k)=>'<div class="mrow"><span class="lb">'+lb+'</span><div class="bar'+(S[k]<25?" crit":"")+'"><i style="width:'+S[k]+'%"></i></div></div>';
  $("#nourishMeters").innerHTML = mrow("HUNGER","hunger")+mrow("THIRST","thirst")+mrow("ENERGY","energy");
  const waterFull=BOWL.level>0.97, foodFull=FBOWL.level>0.97;
  const rows=[
    {req:0, html:'<div class="prow"><span class="nm">'+icn("water")+' WATER BOWL — '+Math.round(BOWL.level*100)+'%<br><span class="tiny">'+(waterFull?"FULL — HE\'LL DRINK WHEN THIRSTY":"FREE POUR — FILLS THIRST")+'</span></span><button data-nsh="water" '+(waterFull?"disabled":"")+'>POUR</button></div>'},
    {req:0, html:'<div class="prow"><span class="nm">'+icn("food")+' FOOD BOWL — '+Math.round(FBOWL.level*100)+'%<br><span class="tiny">KIBBLE x'+S.kibble+(foodFull?" — BOWL FULL":" — 3 POURS FILL IT")+'</span></span><button data-nsh="food" '+(foodFull||S.kibble<=0?"disabled":"")+'>POUR</button></div>'},
    {req:0, html:'<div class="prow"><span class="nm">'+icn("snack")+' BONE TREATS x'+S.snacks+'<br><span class="tiny">TOSS HIM ONE \u2014 HE WILL COME AND EAT IT</span></span><button data-nsh="snack" '+(S.snacks<=0?"disabled":"")+'>GIVE BONE</button></div>'},
    {req:9, html:'<div class="prow'+(S.money<2?" locked":"")+'"><span class="nm">'+icn("kibble")+' RESTOCK KIBBLE<br><span class="tiny">BUY A BAG — $2</span></span><button data-nsh="buykibble" '+(S.money<2?"disabled":"")+'>BUY $2</button></div>'},
    {req:9, html:'<div class="prow'+(S.money<3?" locked":"")+'"><span class="nm">'+icn("snack")+' RESTOCK BONE TREATS<br><span class="tiny">BUY A BOX — $3</span></span><button data-nsh="buysnack" '+(S.money<3?"disabled":"")+'>BUY $3</button></div>'}
  ];
  $("#nourishList").innerHTML = unlockSort(rows);
}
$("#bSnacks").onclick=openNourish;
$("#nourishClose").onclick=()=>$("#nourish").classList.remove("show");
$("#nourishList").addEventListener("click",e=>{
  const t=e.target.closest("button"); if(!t||t.disabled) return;
  const k=t.dataset.nsh;
  if(k==="water") tapBowl("water");
  if(k==="food") tapBowl("food");
  if(k==="snack") giveBone();   // panel stays open, so you can hand him several in a row
  if(k==="buykibble" && S.money>=2){ S.money-=2; S.kibble++; beep(600,.05); }
  if(k==="buysnack" && S.money>=3){ S.money-=3; S.snacks++; beep(600,.05); }
  renderMeters(); renderNourish(); renderShop();
});
let PIN="";
function pinRender(){ $("#pinDots").textContent=[0,1,2,3].map(i=>i<PIN.length?"\u25CF":"\u2013").join(" "); }
// shared by #devToggle (Home footer) and #pkDevToggle (a small always-there corner tap inside
// Dogpark) \u2014 #pinPanel itself is a global overlay, but its only trigger used to live in Home's
// footer, which is invisible while any other screen (like the park) is active
function toggleDevMode(){
  if(!$("#devbar").classList.contains("hidden")){ $("#devbar").classList.add("hidden"); $("#pkDevbar").classList.add("hidden"); return; } // tap again hides
  PIN=""; pinRender(); $("#pinPanel").classList.add("show"); beep(400,.04);
}
$("#devToggle").onclick=toggleDevMode;
$("#pkDevToggle").onclick=toggleDevMode;
(function(){
  const pad=$("#pinPad");
  [1,2,3,4,5,6,7,8,9,0].forEach(n=>{
    const bt=document.createElement("button");
    bt.textContent=n; bt.style.padding="16px 0"; bt.style.fontSize="12px";
    bt.onclick=()=>{
      PIN+=n; beep(480+n*30,.04); pinRender();
      if(PIN.length>=4){
        if(PIN==="1234"){
          $("#pinPanel").classList.remove("show");
          $("#devbar").classList.remove("hidden");
          $("#pkDevbar").classList.remove("hidden");
          toast("MAINTENANCE MODE."); beep(880,.08);
        } else { toast("WRONG CODE",1); beep(150,.15); PIN=""; pinRender(); }
      }
    };
    pad.appendChild(bt);
  });
})();
$("#pinClose").onclick=()=>$("#pinPanel").classList.remove("show");
$("#devEvo").onclick=()=>{
  const next = S.lvl<10?10 : S.lvl<25?25 : S.lvl<50?50 : null;
  if(!next) return toast("NO EVOLUTIONS LEFT (DEV)");
  while(S.lvl<next) addXP(Math.max(1, xpNeed(S.lvl)-S.xp));
  devSync(); renderMeters(); renderShop();
  toast("INSTANT-EVOLVED \u2014 "+stageName()+" (DEV, NO CEREMONY)");
};
$("#devStock").onclick=()=>{ S.kibble+=10; S.snacks+=10; toast("+10 KIBBLE +10 BONE TREATS (DEV)"); renderMeters(); };
$("#devSick").onclick=()=>{ S.sick=!S.sick; toast(S.sick?"BONES IS SICK (DEV)":"CURED (DEV)"); renderMeters(); };
$("#devPoo").onclick=()=>{ if(POOS.length<3){ const cv=$("#dogcv"), br=bedRect(cv.clientWidth,cv.clientHeight); POOS.push({x:(br.bx+Math.random()*br.bw2)/cv.clientWidth}); toast("DROPPED ONE (DEV)"); } };
$("#devReset").onclick=()=>{ S.dailyUsed=false; toast("DAY RESET (DEV)"); };
function devSync(){
  XPANIM.lvl=S.lvl;
  XPANIM.frac=clamp(S.xp/xpNeed(S.lvl),0,1);
  XPANIM.ready=false; XPANIM.pauseT=0; XPANIM.parts.length=0;
  S.pendingStage.length=0;                 // dev skips every ceremony
}
$("#devLvl").onclick=()=>{
  for(let i=0;i<5 && S.lvl<250;i++) addXP(Math.max(1, xpNeed(S.lvl)-S.xp));
  devSync(); renderMeters();
};
$("#devCash").onclick=()=>{ S.money+=50; toast("+$50 (DEV)"); renderMeters(); renderShop(); };
$("#devMax").onclick=()=>{
  Object.assign(S,{hunger:100,thirst:100,energy:100,clean:100,fun:100,mood:100});
  BOWL.level=1; S.sick=false; S.sickTimer=0; S.wellTimer=0;
  toast("STATS MAXED (DEV)"); renderMeters();
};
$("#devBad").onclick=()=>{
  Object.assign(S,{hunger:12,thirst:12,energy:12,clean:12,fun:12,mood:12});
  BOWL.level=0;
  toast("NEGLECT SIMULATED (DEV)",1); renderMeters();
};
$("#devDay").onclick=()=>{ CLK.h=23.98; toast("FAST-FORWARDING TO MIDNIGHT (DEV)"); };
// ceremony previews — call the real ceremony functions directly, bypassing the level/XP
// gates entirely, so any ceremony can be checked on demand regardless of current save state.
// devStage50 in particular ignores S.lifePathChosen, so it also works as the escape hatch for
// saves where devEvo previously set that flag without ever showing the panel.
$("#devStage5").onclick=()=>fireStageCeremony(5);
$("#devStage10").onclick=()=>fireStageCeremony(10);
$("#devStage25").onclick=()=>fireStageCeremony(25);
$("#devStage50").onclick=()=>fireStageCeremony(50);
$("#devGoodbye").onclick=()=>startGoodbye();
$("#devKill").onclick=()=>{ S.dead=true; triggerDeath(); };
$("#devBedtime").onclick=()=>{ if(!SLEEP.active) triggerBedtime(); };
// one-way and instant (skips the drive animation) — #devbar lives inside #home, so it
// vanishes along with the rest of the screen once at work; CLOCK OUT is the way back.
$("#devWork").onclick=()=>{
  if(MODE!=="home") return;
  hidePortrait(); closeStatus(); showScreen("work");
  Object.assign(W,{plates:[],sel:0,speed:70,spawn:0.5,intv:2.2,streak:0,flash:0,run:true});
  toast("AT WORK (DEV) — CLOCK OUT TO RETURN");
};
$("#devRobot").onclick=()=>{ S.owned.robot=!S.owned.robot; toast(S.owned.robot?"NOURISH-BOT OWNED (DEV)":"NOURISH-BOT REMOVED (DEV)"); renderShop(); };
$("#devRich").onclick=()=>{ S.money+=500; toast("+$500 (DEV)"); renderMeters(); renderShop(); };
// Dogpark-only dev tools — the bar itself is nested inside #park, so it's only ever
// visible while a run is on screen; unlocking it still goes through the same PIN as #devbar.
$("#pkDevSkip").onclick=()=>{
  if(!PK.active) return;
  PK.en.length=0; PK.waveSpawned=PK.waveQuota;
  toast("WAVE SKIPPED (DEV)");
};
$("#pkDevHeal").onclick=()=>{
  if(!PK.active) return;
  PK.hp=PK.maxhp; toast("FULL HEAL (DEV)");
};
$("#pkDevGod").onclick=()=>{
  PK.godMode=!PK.godMode;
  $("#pkDevGod").classList.toggle("active",PK.godMode);
  toast(PK.godMode?"GOD MODE ON (DEV)":"GOD MODE OFF (DEV)");
};
$("#pkDevHealerNow").onclick=()=>{
  if(!PK.active) return;
  pkSpawnHealer(); toast("HEALER SPAWNED (DEV)");
};
$("#pkDevInvuln").onclick=()=>{
  if(!PK.active) return;
  for(const p of PK.pals){ if(p.k!=="bird") p.invulnT=2.0; }
  toast("FRIENDS INVULNERABLE 2s (DEV)");
};
$("#pkDevSpin").onclick=()=>{
  if(!PK.active) return;
  if(!PK.plusMode || pkSwordTier()<1){ toast("NEEDS DOGPARK UNLEASHED AND A HELD SWORD (DEV)",1); return; }
  PK.swordSpinCd=0; pkWhirlwindSlash();
  toast("WHIRLWIND SLASH TRIGGERED (DEV)");
};
$("#pkDevRage").onclick=()=>{
  if(!PK.active) return;
  if(!PK.plusMode){ toast("NEEDS DOGPARK UNLEASHED (DEV)",1); return; }
  PK.rage=100;
  toast("RAGE FULL — TAP THE BAR (DEV)");
};
$("#pkDevBones").onclick=()=>{
  if(!PK.active) return;
  PK.bones+=50; toast("+50 BONES (DEV)");
};

/* ---------- save / persistence ---------- */
const SAVE_KEY="bones_save_v1";
function hasStorage(){
  try{ const k="__bones_test__"; localStorage.setItem(k,"1"); localStorage.removeItem(k); return true; }
  catch(e){ return false; }
}
const STORAGE_OK = hasStorage();

// merges saved data onto the live defaults object instead of replacing it,
// so a save from an older version that's missing newer keys doesn't erase their defaults
function deepAssign(target,src){
  if(!src || typeof src!=="object") return;
  for(const k in src){
    const sv=src[k];
    if(sv && typeof sv==="object" && !Array.isArray(sv) && target[k] && typeof target[k]==="object" && !Array.isArray(target[k])) deepAssign(target[k],sv);
    else target[k]=sv;
  }
}
function snapshot(){
  return { v:1, S, PUP, BALL, BOWL:{level:BOWL.level}, FBOWL:{level:FBOWL.level}, STAY, CLK, TODO_NEW, SETTINGS,
    XPANIM:{lvl:XPANIM.lvl,frac:XPANIM.frac,ready:XPANIM.ready,pauseT:XPANIM.pauseT} };
}
function saveGame(silent){
  if(!STORAGE_OK) return false;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
    if(!silent){ beep(500,.05); toast("SAVED."); }
    return true;
  }catch(e){ if(!silent) toast("SAVE FAILED — STORAGE MAY BE FULL.",1); return false; }
}
function loadGame(){
  if(!STORAGE_OK) return false;
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const data=JSON.parse(raw);
    if(!data || !data.S) return false;
    deepAssign(S,data.S); deepAssign(PUP,data.PUP); deepAssign(BALL,data.BALL);
    if(data.BOWL) BOWL.level=data.BOWL.level;
    if(data.FBOWL) FBOWL.level=data.FBOWL.level;
    deepAssign(STAY,data.STAY); deepAssign(CLK,data.CLK);
    if(data.SETTINGS) deepAssign(SETTINGS,data.SETTINGS);
    // a save old enough to predate this flag is from the era when music was forced off, so it
    // keeps that; every save since stores a real preference, which the deepAssign above honours
    // over the (now on-by-default) SETTINGS value. Either way Settings can flip it.
    if(!SETTINGS.musicDefaultMigrated){ SETTINGS.music=false; SETTINGS.musicDefaultMigrated=true; }
    if(Array.isArray(data.TODO_NEW)) TODO_NEW=data.TODO_NEW.slice();
    if(data.XPANIM) Object.assign(XPANIM,data.XPANIM);
    else { XPANIM.lvl=S.lvl; XPANIM.frac=clamp(S.xp/xpNeed(S.lvl),0,1); } // save predates XPANIM persistence
    return true;
  }catch(e){ return false; }
}
// no autosave by design — progress only persists when SAVE GAME is pressed in Settings,
// same as an old cartridge: forget to save and a closed tab loses the session's progress.

/* ---------- welcome back: a real gap since the last save gets a proper panel instead of a
   toast — quiet, responsible, matching "A DOG IS FOR LIFE" rather than a cute homecoming ---------- */
const WELCOME_BACK_MS = 90*60*1000;   // 90 minutes of real time — quick tab switches skip this entirely
function welcomeBackLine(){
  if(S.sick)         return {text:"HE GOT SICK WHILE YOU WERE GONE.", crit:true};
  if(S.thirst<25)    return {text:"THE WATER BOWL IS EMPTY.",         crit:true};
  if(S.hunger<25)    return {text:"THE FOOD BOWL IS EMPTY.",          crit:true};
  if(S.energy<25)    return {text:"HE'S EXHAUSTED.",                  crit:true};
  if(S.mood<25)      return {text:"HE'S BEEN LONELY.",                crit:true};
  if(avgStat()>=70)  return {text:"EVERYTHING IS FINE.",              crit:false};
  return {text:"HE WAITED.", crit:false};
}
function showWelcomeBack(gapMs){
  const hrs=gapMs/3600000;
  $("#wbTitle").textContent = !S.sick && hrs>=48 ? "YOU'RE BACK" : !S.sick && hrs>=8 ? "GOOD MORNING" : "YOU'RE HOME";
  if(hrs>=24){ const d=Math.max(1,Math.round(hrs/24)); $("#wbGap").textContent="IT'S BEEN "+d+" DAY"+(d===1?"":"S"); }
  else { const h=Math.max(1,Math.round(hrs)); $("#wbGap").textContent="IT'S BEEN "+h+" HOUR"+(h===1?"":"S"); }
  $("#wbImg").src = PORTRAITS[portraitState()];
  $("#wbMeters").innerHTML = [["HUNGER","hunger"],["THIRST","thirst"],["ENERGY","energy"],["MOOD","mood"]].map(([lb,k])=>{
    const v=S[k];
    return '<div class="mrow"><span class="lb">'+lb+'</span><div class="bar'+(v<25?" crit":"")+'"><i style="width:'+v+'%"></i></div></div>';
  }).join("");
  const {text,crit}=welcomeBackLine();
  $("#wbLine").textContent=text;
  $("#wbLine").classList.toggle("crit",crit);
  $("#welcomeBack").classList.add("show");
}
$("#bWelcomeHome").onclick=()=>{ $("#welcomeBack").classList.remove("show"); beep(500,.05); };

/* ---------- the cold open ----------
   #start ships with .intro on it, so the very first painted frame is pure black — no flash of a
   half-built adoption screen before anything has been arranged. From there the melody comes up
   out of silence and the five letters of BONES march in from the right, one per beat of that same
   melody, each landing with a short side-to-side knock before it settles. Only once the word is
   whole does the border draw itself and the dog and the rest of the adoption UI come up from
   black. Reduce-motion skips straight to the finished screen. */
function runTitleSequence(onDone){
  const start=$("#start"), title=$("#startTitle");
  const spans=Array.from(title.querySelectorAll("span"));
  if(SETTINGS.reduceMotion){
    start.classList.remove("intro"); title.classList.add("lit");
    onDone&&onDone(); return;
  }
  fadeMelodyIn(1600);
  const LEAD=520;   // a beat of pure black and rising melody before the first letter arrives
  spans.forEach((s,i)=>{
    setTimeout(()=>{
      s.style.opacity="1"; s.style.transform="translateX(0)";
      beep(392+i*66,.05,"square",.02);                       // each letter knocks as it lands
      setTimeout(()=>{ s.style.transform="translateX(-5px)"; }, 330);
      setTimeout(()=>{ s.style.transform="translateX(0)"; },   430);
    }, LEAD+i*MUSIC_BEAT);
  });
  const settledAt=LEAD+spans.length*MUSIC_BEAT;
  setTimeout(()=>{ title.classList.add("lit","settled"); beep(660,.09); }, settledAt);
  setTimeout(()=>{ start.classList.remove("intro"); onDone&&onDone(); }, settledAt+MUSIC_BEAT);
}
// A save no longer skips the cold open — it plays for everyone, and only once it has landed does
// the returning player get asked which door they're going through. Enter is deferred rather than
// done at boot so the title is never cut short by the game screen appearing underneath it.
function enterLoadedGame(){
  $("#start").classList.add("hidden"); $("#game").classList.remove("hidden");
  syncMoodMusic();
  const gapMs = S.lastSaveAt ? Date.now()-S.lastSaveAt : 0;
  if(gapMs>=WELCOME_BACK_MS) setTimeout(()=>showWelcomeBack(gapMs),450);
  else setTimeout(()=>toast(S.lastSaveAt ? "WELCOME BACK — LAST SAVED "+dayClock(S.lastSaveDay,S.lastSaveH) : "WELCOME BACK",1),450);
}
function showStartChoice(){
  $("#breedRow").classList.add("hidden");
  $("#startChoice").classList.remove("hidden");
  $("#continueLine").textContent =
    NAME().toUpperCase()+" — LV."+S.lvl+(S.lastSaveAt?" — SAVED "+dayClock(S.lastSaveDay,S.lastSaveH):"");
}
$("#btnContinue").onclick=()=>{ beep(660,.07); setTimeout(()=>beep(880,.09),90); enterLoadedGame(); };
$("#btnNewGame").onclick=()=>{
  beep(400,.06);
  openChoice("START OVER?",
    "THIS DELETES "+NAME()+"'S SAVE FOR GOOD — THERE'S NO GETTING IT BACK.<br><br>ARE YOU SURE?",
    "YES, START OVER", startNewGame,
    "CANCEL", null);
};

/* ---------- main loop ---------- */
const RESTORED = loadGame();
document.body.classList.toggle("reduce-motion", SETTINGS.reduceMotion);
$("#startDog").src = PORTRAITS.happy;
// the cold open runs every single time, save or no save; what it hands over to is what differs
runTitleSequence(RESTORED ? showStartChoice : null);
if(!STORAGE_OK) addMail("storage","PROGRESS CAN'T BE SAVED","STORAGE IS BLOCKED ON THIS DEVICE — "+NAME().toUpperCase()+"'S PROGRESS WON'T PERSIST BETWEEN VISITS.");
buildMeters(); renderMeters(); renderShop(); renderTodo(); renderDogSel(); renderMailBadge();
syncMoodMusic();
renderGlobalMusicBtn();
let nagNext = performance.now()/1000 + 45;
let last=performance.now(), meterAcc=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  const t=now/1000;
  const ff = atWorkNow();
  WORK_FF = ff ? WORK_CLOCK_FF : 1;
  NEED_FF = ff ? WORK_NEED_FF : 1;
  tickStats(dt);
  meterAcc+=dt;
  if(meterAcc>0.5){ meterAcc=0; renderMeters(); }
  if(!$("#game").classList.contains("hidden")){
    if(SLEEP.pending && !SLEEP.active && MODE==="home" && !R.active && !PK.active && !OUTING.active){
      SLEEP.pending=false; triggerBedtime();
    }
    // at work the dogcam runs on fast-forward, so BONES visibly races through his routine
    if(!R.active && !PK.active){ camBehavior(dt*WORK_FF); pupTick(dt*WORK_FF); tickTreats(dt*WORK_FF); }
    mystTick(dt);
    if(CAM.workBlockT > 0) CAM.workBlockT = Math.max(0, CAM.workBlockT - dt);
    robotTick(dt);
    if(MODE==="park" && PK.active){ parkUpdate(dt); parkDraw(t); PARK_HDR=true; syncParkHeader(); }
    else { if(PARK_HDR){ PARK_HDR=false; restoreCamHeader(); } drawCam(t); }
    if(OUTING.active){
      OUTING.timer-=dt;
      if(OUTING.timer<=0){
        OUTING.active=false;
        if(OUTING.kind==="PARK"){ S.fun=clamp(S.fun+25,0,100); S.mood=clamp(S.mood+10,0,100); S.clean=clamp(S.clean-10,0,100); addXP(8); }
        else { S.fun=clamp(S.fun+40,0,100); S.mood=clamp(S.mood+20,0,100); S.clean=clamp(S.clean-18,0,100); addXP(15); }
        toast("BONES IS BACK \u2014 WHAT A TRIP!"); heartsBurst(3); beep(760,.09);
        renderMeters();
      }
    }
    // status bubble hovers above BONES and moves with him
    const stEl=$("#status");
    if(stEl.classList.contains("show")){
      if(R.active) closeStatus();
      else {
        statusFrame(dt);
        const cw=$("#dogcv").clientWidth, ch=$("#dogcv").clientHeight;
        const bw=stEl.offsetWidth, bh=stEl.offsetHeight;
        const dogTop = ch*0.82 - ch*0.44;
        stEl.style.left = clamp(CAM.x*cw - bw/2 + 24, 4, cw-bw-4) + "px";
        stEl.style.top  = clamp(dogTop - bh - 4, 24, ch-bh-4) + "px";
      }
    }
    // unhappy alert: SAD portrait surfaces periodically so the player notices
    if(t>nagNext && !R.active && !PK.active && !$("#status").classList.contains("show")){
      if(portraitState()==="sad"){
        showPortrait("sad",15000);
        beep(180,.2,"sawtooth");
        nagNext = t + 15 + 40 + Math.random()*40;
      } else nagNext = t + 20;
    }
    if(MODE==="work"){ updateWork(dt); drawWork(t); }
    if(MODE==="run"){ updateRun(dt); if(R.active||MODE==="run") drawRun(t); }
    if(MODE==="paperboy"){ updatePaperboy(dt); drawPaperboy(t); }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
