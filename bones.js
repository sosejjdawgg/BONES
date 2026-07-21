"use strict";
const $ = q => document.querySelector(q);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const DPR = Math.min(2, window.devicePixelRatio||1);

/* ---------- audio ---------- */
let AC=null;
function beep(f=440,d=.06,type="square",g=.04){
  if(!SETTINGS.sound) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(), gn=AC.createGain();
    o.type=type; o.frequency.value=f; gn.gain.value=g;
    o.connect(gn); gn.connect(AC.destination);
    o.start(); o.stop(AC.currentTime+d);
  }catch(e){}
}

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
  hunger:52, thirst:48, energy:80, clean:80, fun:70, mood:70,
  money:10, earned:0, petCd:0,
  owned:{}, equipped:null,
  dailyUsed:false, bestDaily:0, bestPractice:0,
  streak:0, dayNeglected:false, sick:false, sickTimer:0, wellTimer:0,
  kibble:3, snacks:2, beach:false, compsToday:0,
  jWave3:false, jCollar:false, jTrick:false,
  dHappy:false, dNour:false, dBall:false, dPark:false, dBone:false, dClean:false, dWater:false, dFood:false,
  hoopOwned:false, ballOwned:false, firstWater:false, firstFood:false, bedHinted:false,
  bedOwned:false, todoWork:false, todoLvl5:false, todoBed:false, todoPark:false, todoBall:false, todoBowls:false, twW:false, twF:false, todoHide:false, outTimer:0,
  lvl:1, xp:0, gen:1, senior:false, seniorDays:0, lifePathChosen:false, litter:false, memorialSrc:null, pendingStage:[]
};
const SETTINGS = { sound:true, reduceMotion:false };
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
const METERS=[["HUNGER","hunger"],["THIRST","thirst"],["ENERGY","energy"],["CLEAN","clean"],["FUN","fun"],["MOOD","mood"]];
function buildMeters(){
  $("#meters").innerHTML = METERS.map(([lb,k])=>
    `<div class="mrow"><span class="lb">${lb}</span><div class="bar" id="bar_${k}"><i></i></div></div>`).join("");
}
$("#money1").style.cursor="pointer"; $("#money2").style.cursor="pointer";
function renderMeters(){
  for(const [,k] of METERS){
    const el=$("#bar_"+k), v=S[k];
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
  $("#snackCt").textContent="x"+S.snacks;
  const neg=S.money<0, mstr=(neg?"-$":"$")+Math.abs(S.money);
  for(const id of ["money1","money2"]){ const el=$("#"+id); el.textContent=mstr; el.style.color=neg?"#f22":"#fff"; }
  $("#clock").textContent = "DAY "+CLK.day+" "+String(Math.floor(CLK.h)).padStart(2,"0")+":00";
  $("#bests").textContent = "STREAK "+S.streak+"d  \u2022  BEST DAILY "+S.bestDaily+" / FREE "+S.bestPractice;
}

/* ---------- stats sim ---------- */
function tickStats(dt){
  const m=mods();
  const nm=S.senior?0.6:1;
  S.hunger = clamp(S.hunger - 0.18*nm*dt, 0, 100);
  S.thirst = clamp(S.thirst - 0.30*nm*dt, 0, 100);
  S.clean  = clamp(S.clean  - 0.09*nm*dt, 0, 100);
  S.fun    = clamp(S.fun    - 0.15*nm*dt, 0, 100);
  const resting = CAM.state==="rest";
  S.energy = clamp(S.energy + (resting?2.4:(MODE==="home"?0.10:-0.02))*dt, 0, 100);
  const target=(S.hunger+S.thirst+S.energy+S.clean+S.fun)/5;
  S.mood = clamp(S.mood + (target-S.mood)*0.05*dt - (m.moodDrain?0.15*dt:0), 0, 100);
  S.petCd = Math.max(0, S.petCd-dt);
  S.outTimer += dt;
  if(S.clean<70) SPONGE.rew=false;
  if(POOS.length){ S.mood=clamp(S.mood-0.025*POOS.length*dt,0,100); S.clean=clamp(S.clean-0.01*POOS.length*dt,0,100); }
  if(S.outTimer>360 && POOS.length<3 && !R.active && !OUTING.active){
    S.outTimer=120;
    POOS.push({x:0.22+Math.random()*0.24});
    toast("BONES POOPED INDOORS \u2014 TAP TO PICK UP",1); beep(160,.15,"sawtooth",.03);
  }
  // 24h game clock: 10 real seconds = 1 game hour (1 day = 4 min)
  // sickness: sustained severe neglect makes him properly ill
  if(avgStat()<20){ S.sickTimer+=dt; S.wellTimer=0; } else { S.wellTimer+=dt; }
  if(!S.sick && S.sickTimer>75){ S.sick=true; toast("BONES IS SICK. HE NEEDS CARE \u2014 NO RUNS UNTIL HE RECOVERS.",1); beep(100,.4,"sawtooth"); }
  if(S.sick && S.wellTimer>25){ S.sick=false; S.sickTimer=0; toast("BONES IS FEELING BETTER."); beep(700,.1); }
  if(avgStat()<25) S.dayNeglected=true;
  CLK.h += dt/10;
  if(CLK.h>=24){
    CLK.h-=24; CLK.day++;
    if(!S.dayNeglected){
      S.streak++; S.money+=5; addXP(25);
      toast("GOOD CARE STREAK: "+S.streak+" DAY"+(S.streak>1?"S":"")+" \u2014 +$5"); beep(760,.08); setTimeout(()=>beep(980,.08),100);
    } else { if(S.streak>0) toast("STREAK BROKEN \u2014 BONES WAS NEGLECTED"); S.streak=0; }
    S.dayNeglected=false;
    S.compsToday=0;
    for(const k of ["dHappy","dNour","dBall","dPark","dBone","dClean","dWater","dFood","pFeed","pPlay","pPet"]) S[k]=false;
    TODO_NEW=TODO_NEW.filter(k=>!k.startsWith("d_"));   // unclaimed daily rewards expire
    renderTodo();
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
    beep(660,.07); setTimeout(()=>beep(880,.07),90); setTimeout(()=>beep(1170,.1),180);
    toast("LEVEL "+S.lvl+"!"+(LVLREWARDS[S.lvl]?" "+LVLREWARDS[S.lvl]:""));
    if(S.lvl===5) S.pendingStage.push(5);
    if(S.lvl===10) S.pendingStage.push(10);
    if(S.lvl===25) S.pendingStage.push(25);
    if(S.lvl===50 && !S.lifePathChosen) S.pendingStage.push(50);
    renderShop(); renderMeters();
  }
}
function openChoice(title,lines,aTxt,aFn,bTxt,bFn){
  $("#chTitle").textContent=DN(title); $("#chLines").innerHTML=DN(lines);
  const A=$("#chA"),B=$("#chB");
  A.textContent=aTxt; A.onclick=()=>{ $("#choice").classList.remove("show"); aFn&&aFn(); };
  if(bTxt){ B.style.display=""; B.textContent=bTxt; B.onclick=()=>{ $("#choice").classList.remove("show"); bFn&&bFn(); }; }
  else B.style.display="none";
  $("#choice").classList.add("show");
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
  if(S.bedOwned) return;
  if(S.money<25) return toast("NOT ENOUGH \u2014 THE BED IS $25",1);
  S.money-=25; S.bedOwned=true;
  tickTodo("bed");
  toast("BONES HAS A PROPER BED NOW."); heartsBurst(2); beep(700,.08);
  renderMeters(); renderSupplies();
}
const TODO_META=[
  ["park","todoPark",'REACH LEVEL 5<br><span class="tiny">UNLOCKS THE DOGPARK</span>',"DOGPARK OPEN"],
  ["work","todoWork",'GO TO WORK \u2014 KEEP AN EYE<br>ON BONES <span class="tiny">REWARD $25</span>',"+$25"],
  ["bowls","todoBowls",'REFILL BOTH OF HIS BOWLS<br><span class="tiny">WATER + FOOD \u2014 +$5</span>',"+$5"],
  ["lvl5","todoLvl5",'TRAIN BONES TO LEVEL 15<br><span class="tiny">UNLOCKS COMPETITIONS</span>',"COMPETITIONS OPEN"],
  ["bed","todoBed",'BUY BONES A DOG BED<br><span class="tiny">PERFECT SLEEP</span>',"SWEET DREAMS"],
  ["d_happy","dHappy",'MAKE BONES HAPPY<br><span class="tiny">MOOD 90+ \u2014 50 XP</span>',"+50 XP",1],
  ["d_nour","dNour",'NOURISH BONES<br><span class="tiny">WATER + FOOD \u2014 10 XP</span>',"+10 XP",1],
  ["d_ball","dBall",'PLAY WITH THE BALL<br><span class="tiny">10 XP</span>',"+10 XP",1],
  ["d_park","dPark",'TAKE BONES TO THE PARK<br><span class="tiny">12 XP</span>',"+12 XP",1],
  ["d_bone","dBone",'ATTEMPT THE DAILY BONE<br><span class="tiny">12 XP</span>',"+12 XP",1],
  ["d_clean","dClean",'CLEAN BONES<br><span class="tiny">SPONGE HIM SPOTLESS \u2014 10 XP</span>',"+10 XP",1],
  ["j_wave3","jWave3",'SURVIVE UNTIL WAVE 3<br><span class="tiny">IN THE DOGPARK \u2014 40 XP</span>',"+40 XP",2],
  ["j_collar","jCollar",'BUY BONES A NEW COLLAR<br><span class="tiny">ANY CHARM \u2014 25 XP</span>',"+25 XP",2],
  ["j_trick","jTrick",'TEACH BONES A TRICK<br><span class="tiny">TAP HIM WHILE HE BEGS \u2014 25 XP</span>',"+25 XP",2],
  ["p_feed","pFeed",'FEED THE PUP A SNACK<br><span class="tiny">8 PUP XP</span>',"+8 PUP XP",3],
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
  const n=TODO_META.reduce((a,m)=>a+((!S[m[1]] && (m[4]!==2||jOpen) && (m[4]!==3||S.pup.owned) && !(m[0]==="d_ball"&&!S.ballOwned))?1:0),0);
  bar.textContent = TODO_NEW.length ? "\u2605 TO-DO "+TODO_NEW.length+" READY!" : (n ? "\u25B8 TO-DO "+n+" LEFT" : "\u2713 TO-DO");
  bar.classList.toggle("pulse", TODO_NEW.length>0);
  let html="";
  for(const k of TODO_NEW){
    const m=TODO_META.find(x=>x[0]===k);
    html+='<div class="prow claim" data-k="'+k+'"><span class="nm">\u2611 '+m[2]+'<br><b style="color:#f22">TAP TO CLAIM '+m[3]+'</b></span></div>';
  }
  const sect=t=>'<div class="tiny" style="color:#777;letter-spacing:2px;padding:4px 0">'+t+'</div>';
  const rows=stage=>TODO_META.filter(m=>(m[4]||0)===stage && !S[m[1]] && !(m[0]==="d_ball" && !S.ballOwned)).map(m=>{
    const btn = m[0]==="bed" ? '<button data-todo="bed" '+(S.money<25?"disabled":"")+'>BUY $25</button>' : "";
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
$("#dogcv").addEventListener("pointerdown",e=>{
  if(R.active||OUTING.active||PK.active) return; // BONES is out
  if(WASH.active) return;             // scrubbing uses drag, not taps
  const r=e.currentTarget.getBoundingClientRect();
  const fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height;
  if(XPANIM.ready && fy>0.86){ xpLevelTap(); return; }
  if(S.memorialSrc && fx>0.12 && fx<0.28 && fy>0.12 && fy<0.34){ // the photo on the wall
    $("#portraitImg").src=S.memorialSrc;
    const lb=$("#portraitLb"); lb.textContent="IN LOVING MEMORY"; lb.className="";
    $("#portrait").classList.toggle("savage",false);
    $("#portrait").style.right="auto"; $("#portrait").style.left="8px";
    $("#portrait").classList.add("show");
    clearTimeout(portraitT); portraitT=setTimeout(hidePortrait,3200);
    beep(420,.1); return;
  }
  const spx=SPONGE.held?SPONGE.x:0.135, spy=SPONGE.held?SPONGE.y:0.50;
  if(Math.hypot(fx-spx,fy-spy)<0.06){                       // grab the sponge off the wall
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
  const bedXpx=fbX2+wbW+16, bedWpx=r.width*0.22;
  const px=fx*r.width;
  if(px>=bedXpx && px<=bedXpx+bedWpx && fy>0.62){
    if(!S.bedOwned){
      S.bedHinted=true;
      toast("HE HAS NOWHERE PROPER TO SLEEP \u2014 SEE THE LIST",1);
      beep(300,.1);
      renderTodo(); $("#todoPanel").classList.add("show");
      return;
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
  if(SPONGE.held){
    SPONGE.x=fx; SPONGE.y=fy;
    if(Math.random()<0.4){ DRIPS.push({x:fx+(Math.random()-0.5)*0.015,y:fy+0.015,vy:0.12+Math.random()*0.18,life:0.5+Math.random()*0.3}); if(DRIPS.length>50) DRIPS.splice(0,DRIPS.length-50); }
    if(fx>CAM.x-0.02 && fx<CAM.x+CAMDWF+0.04 && fy>0.30 && fy<0.85 && !R.active && !OUTING.active && !PK.active){
      S.clean=clamp(S.clean+0.6,0,100); WASH.heat=0.5;
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
  BALL.held=false; PET.down=false; SPONGE.held=false; clearTimeout(PET.lp);
});
$("#dogcv").addEventListener("pointercancel",()=>{ BALL.held=false; PET.down=false; SPONGE.held=false; clearTimeout(PET.lp); });
$("#stClose").onclick=closeStatus;
$("#meters").addEventListener("click",()=>{
  closeStatus();
  $("#home .body").scrollTop=0;
  toast("QUICK CARE IS BELOW THE MAIN BUTTONS");
  beep(500,.05);
});
$("#portrait").addEventListener("pointerdown",hidePortrait);


/* money counter shortcut */
function openMoneyPick(){ $("#mpWork").style.display = MODE==="work" ? "none" : ""; $("#moneyPick").classList.add("show"); beep(500,.05); }
$("#money1").onclick=openMoneyPick;
$("#money2").onclick=openMoneyPick;
$("#mpCancel").onclick=()=>$("#moneyPick").classList.remove("show");
$("#mpWork").onclick=()=>{ $("#moneyPick").classList.remove("show"); enterWork(); };
$("#mpShop").onclick=()=>{
  $("#moneyPick").classList.remove("show");
  const openShop=()=>{ renderShop(); $("#shopPanel").classList.add("show"); };
  if(MODE==="work"){ W.run=false; transition("DRIVING HOME",()=>{ showScreen("home"); renderMeters(); openShop(); }); }
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
lcdSet(BEGIMG); lcdSet(SENIORIMG);
const HEARTIMG = HEARTS.map(u=>{ const i=new Image(); i.src=u; return i; });
const CAM = { x:0.32, dir:1, state:"idle", t:0, fi:0, ft:0, until:1.5, woof:0, bedTarget:false, cameCalled:false, fetchPhase:0 };
const BED = { x:0.56 };
const BOWL = { level:0 };
const FBOWL = { level:0 };
const POOS=[];
const TAPS={water:{t:0,combo:0},food:{t:0,combo:0}};
const SPONGE={held:false,x:0.135,y:0.50,rew:false};
const SNACKTRACK={t:[]};
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
    if((CLK.h>=22||CLK.h<6) && S.bedOwned){ PUP.st="go"; PUP.tx=0.845; PUP.next="nap"; PUP.until=99; return; }
    PUP.st = Math.random()<0.5 ? "walk" : "idle";
    PUP.dir = Math.random()<0.5?-1:1;
    PUP.until = 1.5+Math.random()*2.5;
  }
}
const PET = { left:6, timer:0, lp:0, px:0, py:0, stroked:false, heat:0, down:false };
const CLK = { h:8, day:1 };
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
      BALL.vy*=-0.69; BALL.vx*=0.92;
      if(Math.abs(BALL.vy)<0.05) BALL.vy=0;
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
        CAM.state="bark"; CAM.woof=1.8; CAM.t=0; CAM.until=1.8; CAM.fi=0; CAM.fetchPhase=0;
      }
    }
    return;
  }
  // chase: a moving or held ball is irresistible
  const ballLive = S.ballOwned && (BALL.held || Math.abs(BALL.vx)>0.05 || Math.abs(BALL.vy)>0.05);
  if(!BALL.off && !BALL.carried && !BALL.held && ballLive && BALL.cool<=0 && CAM.state!=="rest" && CAM.state!=="come" && CAM.state!=="zoomies" && CAM.state!=="stay" && !BALL.pcarried && !CAM.bedTarget){
    const aim = clamp(BALL.x + BALL.vx*0.25, 0.02, 0.95); // reads the throw, not the ball
    const mouth = CAM.x + (CAM.dir>0? CAMDWF*0.80 : CAMDWF*0.20);
    CAM.dir = aim>mouth?1:-1;
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
        beep(260,.09); setTimeout(()=>beep(260,.09),150);
        if(CAM.needCheck){ CAM.needCheck=false; setTimeout(showLowestNeed,900); }
      }
    }
    return;
  }
  if(CAM.state==="rest"){
    const cap=S.bedOwned?100:70;
    if(S.energy>=cap){
      if(!S.bedOwned) toast("NO PROPER BED \u2014 BONES ONLY RESTS TO 70%",1);
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
    if(S.thirst<48 && BOWL.level>0.05){ CAM.state="drinkgo"; CAM.until=99; }
    else if(S.hunger<48 && FBOWL.level>0.05){ CAM.state="eatgo"; CAM.until=99; }
    else if((S.thirst<45 && BOWL.level<=0.05) || (S.hunger<45 && FBOWL.level<=0.05)){
      CAM.begKind = (S.thirst<45 && BOWL.level<=0.05) ? "water" : "food";
      CAM.state="beggo"; CAM.until=99;
    }
    else if(CAM.state==="walk"){
      const r=Math.random();
      if(S.fun<30 && r<0.45){ CAM.state="bark"; CAM.until=2.4; CAM.woof=2.4; beep(240,.09); setTimeout(()=>beep(240,.09),160); }
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
  // darkest at 0-4h & 22-24h, fully bright 8-18h, smooth transitions
  const h=CLK.h;
  const d = Math.min(Math.abs(h-3), Math.abs(h-27), Math.abs(h-3-24));
  const n = clamp(1 - d/9, 0, 1);
  return h>18||h<8 ? clamp(n,0.15,0.62) : 0;
}
function drawCam(t){
  const [ctx,w,h]=fit($("#dogcv"));
  ctx.fillStyle="#34343c"; ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#2a2a31"; ctx.fillRect(0,h*0.82,w,h*0.18);
  const gy=h*0.82, u=h/42;
  ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(w,gy); ctx.stroke();
  ctx.strokeRect(w*0.72,h*0.14,w*0.18,h*0.20); // window
  ctx.beginPath(); ctx.moveTo(w*0.81,h*0.14); ctx.lineTo(w*0.81,h*0.34); ctx.stroke();
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
  // water bowl (blue) + food bowl (kibble chunks), both tappable
  const bwlX=w*0.04, bwlW=u*4, bwlH=u*1.6;
  if(BOWL.level>0.03){
    ctx.fillStyle="#3b82f6";
    ctx.fillRect(bwlX+3, gy-3-(bwlH-6)*BOWL.level, bwlW-6, (bwlH-6)*BOWL.level);
  }
  ctx.strokeStyle = ((BOWL.level<=0.05 && (S.thirst<40 || !S.firstWater)) && Math.floor(t*2)%2===0) ? "#f22" : "#fff";
  ctx.strokeRect(bwlX, gy-bwlH, bwlW, bwlH);
  const fbX=bwlX+bwlW+8;
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
  // memorial photo of the previous BONES (tappable)
  if(S.memorialSrc && MEMIMG && MEMIMG.complete){
    const mw2=w*0.11, mh2=mw2*1.25;
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
    ctx.strokeRect(w*0.14-3, h*0.15-3, mw2+6, mh2+6);
    ctx.drawImage(MEMIMG, w*0.14, h*0.15, mw2, mh2);
  }
  // dog bed (or the sad empty spot where one should be) — half height, tucked beside the bowls
  const bx=fbX+bwlW+16, bw2=w*0.22, bh2=h*0.0425;
  if(S.bedOwned){
    ctx.fillStyle="#26262c"; ctx.fillRect(bx,gy-bh2,bw2,bh2);
    ctx.strokeRect(bx,gy-bh2,bw2,bh2);
    ctx.strokeRect(bx+4,gy-bh2+3,bw2-8,bh2-4);
  } else {
    const hint = (S.lvl>=2 || S.bedHinted) && Math.floor(t*2)%2===0;
    ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle=hint?"#f22":"#555"; ctx.lineWidth=2;
    ctx.strokeRect(bx,gy-bh2,bw2,bh2); ctx.restore();
    ctx.fillStyle="#555"; ctx.font="6px 'Press Start 2P',monospace"; ctx.textAlign="center";
    ctx.fillText("NO BED", bx+bw2/2, gy-bh2/2+2); ctx.textAlign="left";
    ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  }
  if(S.bedOwned && S.pup.owned){
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
    const sx=(SPONGE.held?SPONGE.x:0.135)*w, sy=(SPONGE.held?SPONGE.y:0.50)*h;
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
    else if(PULSE.k==="sponge") ctx.strokeRect(0.135*w-14, 0.50*h-12, 28, 24);
    else if(PULSE.k==="bed") ctx.strokeRect(bx-4, gy-bh2-4, bw2+8, bh2+8);
    ctx.strokeStyle="#fff";
  }
  // indoor accidents
  for(const p of POOS){
    const pxp=p.x*w;
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
  const fkey = stt==="zoomies" ? "come" : stt==="chase" ? "come" : stt==="fetch" ? (CAM.fetchPhase===4?"idle":"come") : (stt==="drinkgo"||stt==="eatgo"||stt==="beggo") ? "walk" : (stt==="drink"||stt==="eat") ? "sniff" : stt==="beg" ? "idle" : stt==="wash" ? (WASH.heat>0.05?"shake":"idle") : stt;
  let frames = DOGIMG[fkey] || DOGIMG.idle;
  if(S.senior && (fkey==="walk"||fkey==="idle"||fkey==="sniff"||fkey==="come")) frames=SENIORIMG;
  if(stt==="beg"||stt==="begwait"||stt==="stay") frames=BEGIMG;
  const img = frames[CAM.fi % frames.length];
  const dhF = stt==="rest"?0.28 : stt==="stay"?0.46 : stt==="catch"?0.52 : stt==="bark"?0.46 : (stt==="come"||stt==="chase"||stt==="fetch"||stt==="zoomies")?0.46 : 0.44;
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
    const flip = (stt==="zoomies"||stt==="walk"||stt==="sniff"||stt==="idle"||stt==="catch"||stt==="come"||stt==="chase"||stt==="fetch"||stt==="drinkgo"||stt==="drink"||stt==="eatgo"||stt==="eat"||stt==="beggo"||stt==="beg"||stt==="begwait"||stt==="stay") && CAM.dir<0;
    if(flip){ ctx.translate(dx*2+dw,0); ctx.scale(-1,1); }
    ctx.drawImage(img, dx, gy-dh+bob, dw, dh);
    ctx.restore();
  }
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
  // night overlay + sick tint, drawn last
  const night = nightAmount();
  if(night>0){ ctx.fillStyle="rgba(6,10,28,"+night+")"; ctx.fillRect(0,0,w,h); }
  if(S.sick){ ctx.fillStyle="rgba(90,10,10,"+(0.16+0.05*Math.sin(t*3))+")"; ctx.fillRect(0,0,w,h); }
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
        const stg=S.pendingStage.shift();
        if(stg===5){
          tickTodo("park");
          openChoice("YOU UNLOCKED THE DOGPARK!",
            "SURVIVE THE WAVES. BANK BIG XP AT THE<br>RED GATE.<br><br>IF BONES GETS CAUGHT, YOU LOSE IT ALL \u2620\ufe0f",
            "GO THERE NOW",()=>startPark(), "LATER",null);
        }
        else if(stg===50) openLifeChoice();
        else if(stg===10) startEvo("A JUNIOR",0.5,0.82,"HE'S BIGGER AND STRONGER.<br><br>COMING UP:<br>STEEL TAG \u2014 LV.13<br>LUCKY ROPE \u2014 LV.16<br>THE LITTER \u2014 LV.18");
        else if(stg===25) startEvo("IN HIS PRIME",0.82,1,"FULL SIZE. PEAK CONDITION.<br>TOP FORM MULTIPLIERS ON EVERY RUN.<br><br>AHEAD:<br>SHADOW LEASH \u2014 LV.21<br>CHAIN COLLAR \u2014 LV.26<br>THE CROSSROADS \u2014 LV.50");
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

/* ---------- shop ---------- */
function openShopPanel(){ renderShop(); $("#shopPanel").classList.add("show"); }
function renderShopSup(){
  const el=$("#shopSup"); if(!el) return;
  el.innerHTML =
    '<div class="prow"><span class="nm">&#9670; KIBBLE x'+S.kibble+'<br><span class="tiny">1 POUR \u2014 3 FILL A BOWL</span></span><button data-sup="kibble" '+(S.money<2?"disabled":"")+'>BUY $2</button></div>'+
    '<div class="prow"><span class="nm">&#9679; SNACKS x'+S.snacks+'<br><span class="tiny">+ENERGY +MOOD, FAST</span></span><button data-sup="snack" '+(S.money<3?"disabled":"")+'>BUY $3</button></div>'+
    (S.bedOwned?"":'<div class="prow"><span class="nm">&#9632; DOG BED<br><span class="tiny">PERFECT SLEEP \u2014 ONE-TIME</span></span><button data-sup="bed" '+(S.money<25?"disabled":"")+'>BUY $25</button></div>')+
    (S.lvl<2||S.ballOwned?"":'<div class="prow"><span class="nm">&#9679; RUBBER BALL<br><span class="tiny">FETCH, TRICK SHOTS \u2014 ONE-TIME</span></span><button data-sup="ball" '+(S.money<5?"disabled":"")+'>BUY $5</button></div>')+
    (S.hoopOwned?"":'<div class="prow"><span class="nm">&#9675; BASKETBALL HOOP<br><span class="tiny">TRICK SHOTS BY THE WINDOW \u2014 ONE-TIME</span></span><button data-sup="hoop" '+(S.money<40?"disabled":"")+'>BUY $40</button></div>');
}
function renderShop(){
  renderShopSup();
}

/* ---------- mode switching ---------- */
let MODE="home";
function showScreen(id){
  for(const s of ["home","work","run","park"]) $("#"+s).classList.toggle("hidden", s!==id);
  MODE=id;
  $("#rSnack").classList.toggle("hidden", id!=="work");
  $("#rWalk").classList.toggle("hidden", id!=="work");
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
  transition("DRIVING HOME",()=>{ showScreen("home"); renderMeters(); renderShop(); });
}
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
  $("#resPortrait").classList.remove("show");
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
        toast("HE CAN'T BELIEVE YOU'RE BACK!!");
      }
    },2200);
  }
});
$("#bResHome").onclick=()=>{
  $("#result").classList.remove("show");
  showScreen("home"); renderMeters(); renderShop();
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
  S.money-=3; S.hunger=clamp(S.hunger+22,0,100); beep(520); toast("REMOTE SNACK DISPENSED"); renderMeters(); };
$("#rWalk").onclick=()=>{ if(S.money<5) return toast("NO MONEY",1);
  S.money-=5; S.mood=clamp(S.mood+18,0,100); S.clean=clamp(S.clean-4,0,100); beep(640); toast("DOGWALKER BOOKED"); renderMeters(); };
$("#bWalk").onclick=()=>{
  if(S.lvl<5) return toast("THE DOGPARK UNLOCKS AT LV.5",1);
  if(S.sick) return toast("BONES IS TOO SICK FOR THE PARK",1);
  toast("SURVIVE THE WAVES, BANK BIG XP. IF BONES GETS CAUGHT, YOU LOSE IT ALL \u2620\ufe0f",1);
  startPark();
};
function openSupplies(){ renderSupplies(); $("#supplies").classList.add("show"); }
function renderSupplies(){
  const it=(icon,name,tiny,key,owned)=>'<div class="prow'+(owned===false?' locked':'')+'" data-it="'+key+'"><span class="nm">'+icon+' '+name+'<br><span class="tiny">'+tiny+'</span></span></div>';
  $("#suppliesList").innerHTML =
    it("&#9679;","WATER BOWL","TAP TO POUR \u2014 FREE. HE DRINKS WHEN THIRSTY","water")+
    it("&#9670;","FOOD BOWL","POUR KIBBLE (x"+S.kibble+" LEFT) \u2014 3 POURS FILL","food")+
    it("&#10047;","SPONGE","DRAG OFF THE WALL \u2014 SCRUB HIM CLEAN","sponge")+
    (S.bedOwned
      ? it("&#9632;","DOG BED","TAP THE BED \u2014 FULL REST","bed")
      : it("&#9632;","DOG BED","NOT OWNED \u2014 FIND IT IN THE SHOP","bedbuy",false))+
    it("&#9670;","KIBBLE x"+S.kibble,"RESTOCK IN THE SHOP","food")+
    it("&#9679;","SNACKS x"+S.snacks,"USE THE FEED SNACKS BUTTON","snack");
}
$("#shopSup").addEventListener("click",e=>{
  const t=e.target.closest("button"); if(!t) return;
  if(t.dataset.sup==="kibble"&&S.money>=2){ S.money-=2; S.kibble++; beep(600,.05); }
  if(t.dataset.sup==="bed") buyBed();
  if(t.dataset.sup==="ball"&&S.money>=5&&!S.ballOwned){ S.money-=5; S.ballOwned=true; BALL.x=0.28; BALL.y=0.795; BALL.vx=0; BALL.vy=0; BALL.off=false; beep(700,.07); setTimeout(()=>beep(950,.09),100); toast("A BALL! FLING IT \u2014 HE'LL BRING IT BACK."); }
  if(t.dataset.sup==="hoop"&&S.money>=40&&!S.hoopOwned){ S.money-=40; S.hoopOwned=true; beep(880,.08); setTimeout(()=>beep(1170,.1),100); toast("HOOP MOUNTED BY THE WINDOW. SWISH \u2014 +1 XP A BASKET."); }
  if(t.dataset.sup==="snack"&&S.money>=3){ S.money-=3; S.snacks++; beep(600,.05); }
  renderMeters(); renderShop();
});
$("#suppliesList").addEventListener("click",e=>{
  const row=e.target.closest(".prow"); if(!row) return;
  const k=row.dataset.it;
  const info={
    water:"WATER BOWL: TAP IT IN THE DOGCAM TO POUR. THREE TAPS FILL IT.",
    food:"FOOD BOWL: TAPS POUR KIBBLE. HE FEEDS HIMSELF WHEN HUNGRY.",
    sponge:"SPONGE: DRAG IT OFF THE WALL AND SCRUB HIM. SUDS = CLEAN.",
    bed:"THE BED: TAP IT AND HE'LL GO REST TO FULL ENERGY.",
    snack:"SNACKS: THE FEED SNACKS BUTTON HYPES HIM UP FAST.",
    bedbuy:"NO BED YET \u2014 HE ONLY RESTS TO 70%. IT'S IN THE SHOP."
  }[k];
  if(!info) return;
  toast(info);
  if(k!=="snack"&&k!=="bedbuy") setPulse(k);
  if(k==="bedbuy") openShopPanel();
  beep(520,.05);
});
function renderGoOut(){
  const rows=[];
  rows.push('<div class="prow"><span class="nm">&#9830; STAMPING PLANT<br><span class="tiny">EARN MONEY</span></span><button data-go="work">GO</button></div>');
  rows.push('<div class="prow" style="border-color:#f22"><span class="nm" style="color:#f22">&#9733; THE DAILY BONE<br><span class="tiny">1 ATTEMPT / RANKED</span></span><button data-go="daily" class="red">GO</button></div>');
  const compL=S.lvl<15, beachL=S.lvl<9, litL=S.lvl<18;
  rows.push('<div class="prow'+(compL?" locked":"")+'"><span class="nm">&#9733; DOG COMPETITION<br><span class="tiny">'+(compL?"UNLOCKS LV.15":"PRIZE MONEY \u2014 "+(3-S.compsToday)+"/3 TODAY")+'</span></span><button data-go="comp" '+(compL?"disabled":"")+'>ENTER</button></div>');
  const agiL=S.lvl<8;
  rows.push('<div class="prow'+(agiL?" locked":"")+'"><span class="nm">&#9650; AGILITY TRAINING<br><span class="tiny">'+(agiL?"UNLOCKS LV.8":"-15 ENERGY \u2014 +12 XP")+'</span></span><button data-go="agility" '+(agiL?"disabled":"")+'>TRAIN</button></div>');
  rows.push('<div class="prow'+(beachL?" locked":"")+'"><span class="nm">&#9679; BEACH DAY<br><span class="tiny">'+(beachL?"UNLOCKS LV.9":(S.beach?"OWNED \u2014 BIG FUN":"UNLOCK $25"))+'</span></span><button data-go="beach" '+(beachL||OUTING.active?"disabled":"")+'>'+(S.beach?"GO":"BUY")+'</button></div>');
  rows.push('<div class="prow'+(litL?" locked":"")+'"><span class="nm">&#9829; VISIT THE BREEDER<br><span class="tiny">'+(litL?"UNLOCKS LV.18":(S.litter?"A PUP AWAITS":"ONE LITTER, ONE SUCCESSOR"))+'</span></span><button data-go="litter" '+(litL?"disabled":"")+'>GO</button></div>');
  $("#gooutList").innerHTML = rows.join("");
}
$("#gooutList").addEventListener("click",e=>{
  const t=e.target.closest("button"); if(!t||t.disabled) return;
  const g=t.dataset.go;
  $("#goout").classList.remove("show");
  if(g==="work") enterWork();
  if(g==="daily") openDailyPick();
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
      });
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
    d_park:()=>addXP(12), d_bone:()=>addXP(12), d_clean:()=>addXP(10),
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
  const row=e.target.closest(".prow.claim");
  if(row) claimTodo(row.dataset.k,row);
});
const BOARD=[{n:"MATILDA",s:2140},{n:"JAYNATHON",s:1870},{n:"JAXEPH",s:1420}];
function openDailyPick(){
  const rows=[...BOARD,{n:"YOU",s:S.bestDaily,me:1}].sort((a,b)=>b.s-a.s);
  $("#dpBoard").innerHTML="LOCAL LEADERBOARD<br><br>"+rows.map((r,i)=>(i+1)+". "+(r.me?'<span style="color:#f22">':'')+r.n+" \u2014 "+r.s+(r.me?"</span>":"")).join("<br>");
  $("#dailyPick").classList.add("show");
}
$("#dpRanked").onclick=()=>{ $("#dailyPick").classList.remove("show"); openPre("daily"); };
$("#dpPractice").onclick=()=>{ $("#dailyPick").classList.remove("show"); openPre("practice"); };
$("#dpClose").onclick=()=>$("#dailyPick").classList.remove("show");
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
  if(BALL.off) return toast("THE BALL ROLLED OUT OF SIGHT \u2014 HE'LL FIND IT.");
  if(CAM.state==="rest") toggleRest();
  CAM.bedTarget=false; hidePortrait();
  CAM.state="fetch"; CAM.fetchPhase=5; CAM.t=0; CAM.until=99; CAM.fi=0;
  beep(660,.07); toast("FETCH!");
};
$("#bShopBtn").onclick=()=>{ renderShop(); $("#shopPanel").classList.add("show"); };
$("#supClose").onclick=()=>$("#supplies").classList.remove("show");
$("#goClose").onclick=()=>$("#goout").classList.remove("show");
$("#shopClose").onclick=()=>$("#shopPanel").classList.remove("show");
$("#camstate").onclick=openStatus;
$("#needAlert").onclick=openStatus;
$("#bMenu").onclick=()=>{ $("#menuPanel").classList.add("show"); beep(500,.05); };
$("#menuClose").onclick=()=>$("#menuPanel").classList.remove("show");
$("#mSave").onclick=()=>{
  $("#menuPanel").classList.remove("show");
  if(!STORAGE_OK){ beep(150,.15); toast("SAVE UNAVAILABLE \u2014 STORAGE IS BLOCKED ON THIS DEVICE.",1); return; }
  saveGame();
};
$("#mCare").onclick=()=>{ $("#menuPanel").classList.remove("show"); $("#careGuidePanel").classList.add("show"); beep(500,.05); };
$("#careClose").onclick=()=>$("#careGuidePanel").classList.remove("show");
function renderSettings(){
  $("#setSound").textContent = SETTINGS.sound ? "ON" : "OFF";
  $("#setMotion").textContent = SETTINGS.reduceMotion ? "ON" : "OFF";
}
$("#mSettings").onclick=()=>{ $("#menuPanel").classList.remove("show"); renderSettings(); $("#settingsPanel").classList.add("show"); beep(500,.05); };
$("#settingsClose").onclick=()=>$("#settingsPanel").classList.remove("show");
$("#setSound").onclick=()=>{
  SETTINGS.sound=!SETTINGS.sound; renderSettings();
  if(SETTINGS.sound) beep(500,.05);
  saveGame(true);
};
$("#setMotion").onclick=()=>{
  SETTINGS.reduceMotion=!SETTINGS.reduceMotion;
  document.body.classList.toggle("reduce-motion",SETTINGS.reduceMotion);
  renderSettings(); beep(500,.05); saveGame(true);
};
function startNewGame(){
  SAVE_SUSPENDED=true;   // block the pagehide autosave the reload is about to trigger
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
$("#bSnacks").onclick=()=>{
  if(S.pup.owned && S.sel==="pup"){
    if(S.snacks<=0){ toast("NO SNACKS \u2014 RESTOCK IN THE SHOP",1); return openShopPanel(); }
    S.snacks--;
    S.pup.hunger=clamp(S.pup.hunger+12,0,100); S.pup.mood=clamp(S.pup.mood+10,0,100);
    pupAddXP(2); tickTodo("p_feed");
    heartsBurst(2); beep(700,.06); toast(S.pup.name+" GOBBLES IT UP!"); renderMeters();
    return;
  }
  if(S.snacks<=0){ toast("NO SNACKS \u2014 RESTOCK IN THE SHOP",1); return openShopPanel(); }
  S.snacks--; S.hunger=clamp(S.hunger+8,0,100); S.energy=clamp(S.energy+12,0,100); S.mood=clamp(S.mood+8,0,100); S.fun=clamp(S.fun+6,0,100);
  addXP(2); heartsBurst(1); beep(640,.06); toast("SNACK! "+S.snacks+" LEFT."); renderMeters(); renderSupplies();
  const now=performance.now()/1000;
  SNACKTRACK.t = SNACKTRACK.t.filter(x=>now-x<8); SNACKTRACK.t.push(now);
  if(SNACKTRACK.t.length>=5 && CAM.state!=="zoomies" && !R.active && !OUTING.active && !PK.active){
    SNACKTRACK.t=[];
    S.mood=clamp(S.mood+25,0,100); S.fun=clamp(S.fun+20,0,100);
    CAM.state="zoomies"; CAM.zTarget=CAM.x<0.4?0.98:-0.18; CAM.t=0; CAM.until=5.5; CAM.fi=0;
    heartsBurst(6); toast("THE ZOOMIES!! HE'S SO HAPPY!"); beep(500,.05); setTimeout(()=>beep(750,.05),90); setTimeout(()=>beep(1000,.06),180);
  }
  if(CAM.state!=="zoomies" && !R.active && !OUTING.active && !PK.active && !WASH.active){
    CAM.state="begwait"; CAM.t=0; CAM.until=4; CAM.fi=0; CAM.dir=-1;
    showPortrait("treat",4200);
  }
};
let PIN="";
function pinRender(){ $("#pinDots").textContent=[0,1,2,3].map(i=>i<PIN.length?"\u25CF":"\u2013").join(" "); }
$("#devToggle").onclick=()=>{
  if(!$("#devbar").classList.contains("hidden")){ $("#devbar").classList.add("hidden"); return; } // tap again hides
  PIN=""; pinRender(); $("#pinPanel").classList.add("show"); beep(400,.04);
};
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
  if(next===50) S.lifePathChosen=true;     // skip the crossroads panel too
  devSync(); renderMeters(); renderShop();
  toast("INSTANT-EVOLVED \u2014 "+stageName()+" (DEV)");
};
$("#devStock").onclick=()=>{ S.kibble+=10; S.snacks+=10; toast("+10 KIBBLE +10 SNACKS (DEV)"); renderMeters(); };
$("#devSick").onclick=()=>{ S.sick=!S.sick; toast(S.sick?"BONES IS SICK (DEV)":"CURED (DEV)"); renderMeters(); };
$("#devPoo").onclick=()=>{ if(POOS.length<3){ POOS.push({x:0.22+Math.random()*0.24}); toast("DROPPED ONE (DEV)"); } };
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

/* ---------- save / persistence ---------- */
const SAVE_KEY="bones_save_v1";
function hasStorage(){
  try{ const k="__bones_test__"; localStorage.setItem(k,"1"); localStorage.removeItem(k); return true; }
  catch(e){ return false; }
}
const STORAGE_OK = hasStorage();
let SAVE_SUSPENDED=false; // set right before a New Game wipe so the pagehide/visibilitychange
                          // autosave firing during the reload can't write the save right back

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
  if(!STORAGE_OK || SAVE_SUSPENDED) return false;
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
    if(Array.isArray(data.TODO_NEW)) TODO_NEW=data.TODO_NEW.slice();
    if(data.XPANIM) Object.assign(XPANIM,data.XPANIM);
    else { XPANIM.lvl=S.lvl; XPANIM.frac=clamp(S.xp/xpNeed(S.lvl),0,1); } // save predates XPANIM persistence
    return true;
  }catch(e){ return false; }
}
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") saveGame(true); });
window.addEventListener("pagehide",()=>saveGame(true));
setInterval(()=>{ if(!$("#game").classList.contains("hidden")) saveGame(true); }, 15000);

/* ---------- main loop ---------- */
const RESTORED = loadGame();
if(RESTORED){ $("#start").classList.add("hidden"); $("#game").classList.remove("hidden"); }
document.body.classList.toggle("reduce-motion", SETTINGS.reduceMotion);
$("#startDog").src = PORTRAITS.happy;
buildMeters(); renderMeters(); renderShop(); renderTodo(); renderDogSel();
let nagNext = performance.now()/1000 + 45;
let last=performance.now(), meterAcc=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  const t=now/1000;
  tickStats(dt);
  meterAcc+=dt;
  if(meterAcc>0.5){ meterAcc=0; renderMeters(); }
  if(!$("#game").classList.contains("hidden")){
    if(!R.active && !PK.active){ camBehavior(dt); pupTick(dt); }
    if(MODE==="park" && PK.active){ parkUpdate(dt); parkDraw(t); }
    else drawCam(t);
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
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
