/* WOLFIE'S PAWS, v0.347a.
   The chain is intro -> pawslam -> pawwarm -> the fight, and every link is a place the previous
   one can strand the fight forever, so each is driven for real and asked where it ended up.
   Three things here are RULES rather than observations, and they are the ones worth the machinery:
     1. every k:"bone" on the board was born at a live pentagram - sampled every frame, not once
     2. nothing is ever born INSIDE the cage - the audit the whole spawn discipline exists for
     3. phase 0.5 never has two swipes alive at once, and every throw is telegraphed first
   The rest measures whether it is playable: bullets alive, and how often a dodging dog is hit. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.347a.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(2100);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);

  /* The watchdog goes on BEFORE the fight starts and stays on for the whole run. Every rule
     above is a per-frame rule; checking it at the end of a beat is checking the one frame the
     violation is least likely to be visible in. */
  await pg.evaluate(()=>{
    window.__W={ bad:[], inside:[], swipe2:0, maxAlive:0, kinds:{}, phases:[], teleSeen:0,
                 throwsNoTele:0, hits0:0, fired:0, streak:0, pawSeen:{L:0,R:0}, frames:0 };
    const origAdd=window.bossAdd;
    window.bossAdd=function(bb){
      const B=BOSS.box;
      if(bb.x>2 && bb.x<B.w-2 && bb.y>2 && bb.y<B.h-2)
        __W.inside.push({k:bb.k, x:Math.round(bb.x), y:Math.round(bb.y), ph:BOSS.ph});
      if(bb.k==="bone"){
        // a bone must name the paw it came out of, and that paw must be somewhere real
        const q=bb.fromPaw && BOSS.paw[bb.fromPaw];
        if(!q) __W.bad.push({why:"no paw", ph:BOSS.ph, tele:BOSS.telegraph});
        else {
          const d=Math.hypot((q.x-B.x)-bb.x,(q.y-B.y)-bb.y);
          if(d>34) __W.bad.push({why:"far from paw", d:Math.round(d), ph:BOSS.ph, tele:BOSS.telegraph});
        }
      }
      __W.kinds[bb.k]=(__W.kinds[bb.k]||0)+1;
      if(bb.k==="bone") __W.fired++;
      return origAdd.call(this,bb);
    };
    const origThrow=window.pkPawWarmThrow;
    window.pkPawWarmThrow=function(){ if(BOSS.paw.warmPh!=="tele") __W.throwsNoTele++; return origThrow.call(this); };
    const origFire=window.pawFire;
    window.pawFire=function(sd){ __W.streak++; return origFire.call(this,sd); };
    const origTele=window.pkPawWarmTele;
    window.pkPawWarmTele=function(){ __W.teleSeen++; return origTele.call(this); };
    const origUp=window.pkBossUpdate;
    window.pkBossUpdate=function(dt){
      const r=origUp.call(this,dt);
      if(!BOSS.active) return r;
      __W.frames++;
      let sw=0; for(const bb of BOSS.bullets) if(bb.k==="pawswipe") sw++;
      if(sw>1) __W.swipe2++;
      if(BOSS.bullets.length>__W.maxAlive) __W.maxAlive=BOSS.bullets.length;
      if(BOSS.ph==="pawwarm" && sw>1) __W.swipe2++;
      const p=__W.phases[__W.phases.length-1];
      if(!p || p.ph!==BOSS.ph || p.mode!==BOSS.paw.mode)
        __W.phases.push({ph:BOSS.ph, mode:BOSS.paw.mode, t:+BOSS.t.toFixed(2), phase:BOSS.phase});
      for(const k of ["L","R"]) if(BOSS.paw[k].x||BOSS.paw[k].y) __W.pawSeen[k]++;
      return r;
    };
  });

  /* WAIT ON THE GAME, NOT ON THE WALL. Headless Chromium runs rAF well under real time - the
     first version of this suite slept 1100ms for a 1.15s slam, got 0.65s of game time, and
     reported that the slam never ended. Every wait below is a predicate on the fight's own state
     with a generous wall-clock ceiling behind it. */
  const waitFor = (fn, ms)=>pg.evaluate(async([src,cap])=>{
    const sleep=t=>new Promise(r=>setTimeout(r,t));
    const f=new Function('return ('+src+')')();
    for(let i=0;i<cap/40;i++){ if(f()) return true; await sleep(40); }
    return false;
  }, [fn.toString(), ms||12000]);

  const state = ()=>pg.evaluate(()=>({
    ph:BOSS.ph, phase:BOSS.phase, hp:BOSS.hp, t:+BOSS.t.toFixed(2), pk:PK.hp,
    mode:BOSS.paw.mode, warmPh:BOSS.paw.warmPh, shots:BOSS.paw.warmShots,
    cycle:BOSS.paw.cycle, active:BOSS.paw.active,
    alive:BOSS.bullets.length, swipes:BOSS.bullets.filter(b=>b.k==="pawswipe").length,
    L:{x:Math.round(BOSS.paw.L.x), y:Math.round(BOSS.paw.L.y)},
    R:{x:Math.round(BOSS.paw.R.x), y:Math.round(BOSS.paw.R.y)},
    box:{x:Math.round(BOSS.box.x), y:Math.round(BOSS.box.y),
         w:Math.round(BOSS.box.w), h:Math.round(BOSS.box.h)}
  }));

  /* ---------- 1. the slam ---------- */
  /* Driven through the real start and the real intro clock rather than by setting ph="pawslam",
     because "does the intro hand over to the slam" is half of what this suite is for. */
  await pg.evaluate(()=>{ PK.active=true; pkBossStart(); });
  await pg.waitForTimeout(300);
  const arriving = await state();
  console.log('START ', JSON.stringify({ph:arriving.ph, box:arriving.box}));
  ck(arriving.ph==='intro', 'the fight did not start in the intro: '+arriving.ph);

  // skip to just before the scream ends, then watch the hand-over
  await pg.evaluate(()=>{ BOSS.introT=BOSS_INTRO-0.12; });
  ck(await waitFor(()=>BOSS.ph!=="intro", 6000), 'the intro never ended');
  const slam = await state();
  console.log('SLAM  ', JSON.stringify(slam));
  ck(slam.ph==='pawslam', 'the intro did not hand over to the paw slam: '+slam.ph);
  ck(slam.mode===0.5, 'the warm-up mode was not armed by the slam: '+slam.mode);
  // both paws are on their own wall by the time the slam is over
  ck(await waitFor(()=>BOSS.ph!=="pawslam", 12000), 'the slam never ended');
  const gripped = await state();
  console.log('GRIP  ', JSON.stringify(gripped));
  ck(gripped.ph==='pawwarm', 'the slam never handed over to the warm-up: '+gripped.ph);
  ck(Math.abs(gripped.L.x-gripped.box.x)<3,
     'the left paw is not on the left wall: '+gripped.L.x+' vs '+gripped.box.x);
  ck(Math.abs(gripped.R.x-(gripped.box.x+gripped.box.w))<3,
     'the right paw is not on the right wall: '+gripped.R.x);
  ck(Math.abs(gripped.L.y-(gripped.box.y+gripped.box.h*0.45))<6, 'the paws are not at grip height');
  console.log('P2LOG (printed after P2 runs)');

  /* ---------- 2. the warm-up: one swipe at a time, always telegraphed ---------- */
  const warm = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const seen={maxSwipes:0, sawTele:0, sawFly:0, dirs:{}, teleY:[], caught:0, bones:0};
    const t0=BOSS.paw.warmShots;
    for(let i=0;i<1400;i++){
      await sleep(40);
      if(BOSS.ph!=="pawwarm") break;
      const sw=BOSS.bullets.filter(b=>b.k==="pawswipe");
      seen.maxSwipes=Math.max(seen.maxSwipes, sw.length);
      for(const b of sw) seen.dirs[b.side]=(seen.dirs[b.side]||0)+1;
      if(BOSS.paw.warmPh==="tele"){ seen.sawTele++; if(BOSS.paw.teleK>0.9) seen.teleY.push(Math.round(BOSS.paw.teleY)); }
      if(BOSS.paw.warmPh==="fly") seen.sawFly++;
      seen.bones += BOSS.bullets.filter(b=>b.k==="bone").length;
    }
    seen.caught=BOSS.paw.warmShots-t0;
    seen.ph=BOSS.ph; seen.mode=BOSS.paw.mode; seen.warmT=+BOSS.paw.warmT.toFixed(1);
    return seen;
  });
  console.log('WARM  ', JSON.stringify(warm));
  ck(warm.maxSwipes<=1, 'phase 0.5 had '+warm.maxSwipes+' swipes alive at once');
  ck(warm.sawTele>0, 'no wind-up was ever observed in the warm-up');
  ck(warm.sawFly>0, 'no swipe was ever observed in flight');
  ck(warm.caught>=2, 'the warm-up only completed '+warm.caught+' throws');
  ck(warm.dirs.L>0 && warm.dirs.R>0, 'the warm-up only ever threw from one side: '+JSON.stringify(warm.dirs));
  ck(warm.bones===0, 'a pentagram bone was fired during the warm-up - it is swipes only');
  ck(warm.ph!=="pawwarm", 'the warm-up never ended (warmT '+warm.warmT+'s)');
  ck(warm.mode===1, 'the warm-up did not hand over to phase 1: mode '+warm.mode);
  const noTele = await pg.evaluate(()=>__W.throwsNoTele);
  ck(noTele===0, noTele+' swipes were thrown without a wind-up');

  /* ---------- 3. the fight: stations, escalation, and the bone rule ---------- */
  /* PIN THE HP. A clean pattern takes 16 off a 200-point boss, so a phase-three measurement
     starting at 40 HP kills him three patterns in and then measures an empty board - which is
     what the first run of this did: every dodge number came back 0.0 and read like the paws had
     stopped firing. Both his health and the player's are held for the length of a measurement. */
  const fightAt = async (hpFrac, secs)=>pg.evaluate(async([f,S])=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    BOSS.hp=BOSS.maxhp*f; pkBossPhaseCheck();
    const o={ lidFrames:0, sideFrames:0, orbitFrames:0, alive:[], hits:0, bones:0, paws:0,
              bothFire:0, pawX:[], pawY:[] };
    const hp0=PK.hp, pin=setInterval(()=>{ BOSS.hp=BOSS.maxhp*f; PK.hp=PK.maxhp=9999; },16);
    PK.hp=PK.maxhp=9999;             // measure the stream, not the death
    const fired0=__W.fired, streak0=__W.streak, gt0=BOSS.t;
    for(let i=0;i<S*25;i++){
      await sleep(40);
      const B=BOSS.box, L=BOSS.paw.L, R=BOSS.paw.R;
      o.alive.push(BOSS.bullets.length);
      o.paws=Math.max(o.paws, BOSS.bullets.filter(b=>b.k==="bone"||b.k==="pawswipe").length);
      o.bones=Math.max(o.bones, BOSS.bullets.filter(b=>b.k==="bone").length);
      if(L.y<B.y-6 || R.y<B.y-6) o.lidFrames++;
      if(L.x<B.x-6 && R.x>B.x+B.w+6) o.sideFrames++;
      o.pawX.push(Math.round(L.x-B.x)); o.pawY.push(Math.round(L.y-B.y));
      o.rx=(o.rx||[]); o.rx.push(Math.round(R.x-B.x));
    }
    o.phase=BOSS.phase; o.mode=BOSS.paw.mode; o.cycle=BOSS.paw.cycle;
    o.maxAlive=Math.max(...o.alive); o.avgAlive=+(o.alive.reduce((a,c)=>a+c,0)/o.alive.length).toFixed(1);
    o.gt=+(BOSS.t-gt0).toFixed(1);
    o.firedPerSec=+((__W.fired-fired0)/Math.max(0.1,BOSS.t-gt0)).toFixed(2);
    o.streamPerSec=+((__W.streak-streak0)/Math.max(0.1,BOSS.t-gt0)).toFixed(2);
    clearInterval(pin); PK.hp=hp0;
    return o;
  }, [hpFrac, secs]);

  const p1 = await fightAt(0.90, 12);
  console.log('P1    ', JSON.stringify({phase:p1.phase,mode:p1.mode,paws:p1.paws,avg:p1.avgAlive,
                                        fps:p1.firedPerSec,lid:p1.lidFrames,n:p1.alive.length}));
  ck(p1.phase===1 && p1.mode===1, 'phase 1 did not take: '+p1.phase+'/'+p1.mode);
  ck(p1.lidFrames>0, 'the phase-1 paw never went over the lid');
  ck(p1.bones>0, 'phase 1 fired no bones at all');

  const p2 = await fightAt(0.50, 12);
  console.log('P2    ', JSON.stringify({phase:p2.phase,mode:p2.mode,max:p2.maxAlive,avg:p2.avgAlive,
                                        bones:p2.bones,xr:[Math.min(...p2.pawX),Math.max(...p2.pawX)],
                                        yr:[Math.min(...p2.pawY),Math.max(...p2.pawY)]}));
  ck(p2.phase===2 && p2.mode===2, 'phase 2 did not take: '+p2.phase+'/'+p2.mode);
  // an ORBIT means it moved in both axes, well outside the box on each
  ck(Math.max(...p2.pawX)-Math.min(...p2.pawX) > p2.pawX.length*0 + 120 &&
     Math.max(...p2.pawY)-Math.min(...p2.pawY) > 90,
     'the phase-2 paw does not orbit: x '+Math.min(...p2.pawX)+'..'+Math.max(...p2.pawX)+
     ' y '+Math.min(...p2.pawY)+'..'+Math.max(...p2.pawY));

  const p3 = await fightAt(0.20, 12);
  console.log('P3    ', JSON.stringify({phase:p3.phase,mode:p3.mode,paws:p3.paws,avg:p3.avgAlive,
                                        fps:p3.firedPerSec,side:p3.sideFrames,n:p3.alive.length,
                                        lx:[Math.min(...p3.pawX),Math.max(...p3.pawX)],
                                        rx:[Math.min(...p3.rx),Math.max(...p3.rx)]}));
  ck(p3.phase===3 && p3.mode===3, 'phase 3 did not take: '+p3.phase+'/'+p3.mode);
  /* Not "always": a BURY beat deliberately takes one paw up over the lid at every phase, because
     a fan aimed at the floor thrown from beside the board is aimed at nothing. Half the frames is
     the honest bar for "both on the sides is the phase-three posture". */
  ck(p3.sideFrames>p3.alive.length*0.45,
     'the phase-3 paws are not on the sides for most of it: '+p3.sideFrames+'/'+p3.alive.length);
  // the cap is on bones + swipes, which is what it says it is; birds and bars sit outside it
  ck(p3.paws<=40, 'the paw cap was breached: '+p3.paws+' bones/swipes alive');
  ck(p2.paws<=40, 'the paw cap was breached in phase 2: '+p2.paws);
  /* TWO RATES, AND ONLY ONE OF THEM IS THE ESCALATION.
     Bullets ALIVE cannot answer it: every phase sits on the 40 cap, so "40 -> 40" reads as no
     escalation when the truth is that phase three refills the cap far faster.
     Total bones fired cannot answer it either, and that one is subtler: a BURY beat fans seven
     bones at once out of the pentagram, so a phase-one window that happened to draw BURY twice
     outfired a phase-two window that drew MAW - the measurement was reporting which beat came up,
     not which phase it was in. The escalation lives in the STREAM: pawFire calls per game second.
     The fan is a beat's shape; the stream is the phase's pressure. */
  console.log('RATES ', JSON.stringify({p1:[p1.streamPerSec,p1.firedPerSec],
                                        p2:[p2.streamPerSec,p2.firedPerSec],
                                        p3:[p3.streamPerSec,p3.firedPerSec]}));
  ck(p3.streamPerSec > p1.streamPerSec*2.2,
     'phase 3 does not escalate the stream: '+p1.streamPerSec+' -> '+p3.streamPerSec+'/sec');
  ck(p2.streamPerSec > p1.streamPerSec*1.25,
     'phase 2 does not escalate the stream: '+p1.streamPerSec+' -> '+p2.streamPerSec+'/sec');
  ck(p3.avgAlive > p1.avgAlive, 'phase 3 is no busier on the board than phase 1');

  /* ---------- 4. IS IT DODGEABLE? ---------- */
  /* A stationary dog SHOULD be hit constantly - that is the fight working. The question is
     whether a dog that keeps moving away from the nearest bone can survive phase three, because
     the brief's own fire rate put 38 bones a second on a board 315px across and something had to
     give. This is the measurement that decides whether the numbers shipped are the brief's. */
  const dodge = await pg.evaluate(async(secs)=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    BOSS.hp=BOSS.maxhp*0.20; pkBossPhaseCheck();
    /* NOT BOSS.invulnT. The first version of this cleared the invulnerability window every 16ms
       "to count every hit", which meant the dog took a hit on every frame it was touching
       anything - so both numbers pinned at the 2-per-second ceiling the window itself imposes and
       the harness reported an undodgeable fight it had made undodgeable. */
    /* 48ms, not 16. Two rival 16ms intervals plus the awaits starved the page's own rAF in
       headless: the second half of this measurement got ZERO game seconds and reported a fight
       the dog was never hit in, which reads like a pass and is worth less than nothing. The bot
       below moved into the sleep loop for the same reason. */
    const pin=setInterval(()=>{ BOSS.hp=BOSS.maxhp*0.20; PK.hp=PK.maxhp=100000; },48);
    PK.hp=PK.maxhp=100000;
    const B=BOSS.box;
    let hits0=BOSS.hits, still, moving, gt0=BOSS.t;
    // a) standing still
    BOSS.dog.x=B.w/2; BOSS.dog.y=B.h/2; BOSS.drag=false;
    for(let i=0;i<secs*25;i++){ await sleep(40); BOSS.dog.vx=BOSS.dog.vy=0; }
    still=BOSS.hits-hits0;
    const gtStill=BOSS.t-gt0; gt0=BOSS.t;
    // b) a dog that walks away from whatever is closest - the crudest possible player
    hits0=BOSS.hits;
    for(let i=0;i<secs*25;i++){
      await sleep(40);
      let bx=0,by=0,best=1e9;
      for(const b of BOSS.bullets){
        const dx=BOSS.dog.x-b.x, dy=BOSS.dog.y-b.y, d=dx*dx+dy*dy;
        if(d<best){ best=d; bx=dx; by=dy; }
      }
      const L=Math.hypot(bx,by)||1;
      BOSS.dog.x=Math.max(8,Math.min(B.w-8, BOSS.dog.x+bx/L*11));
      BOSS.dog.y=Math.max(8,Math.min(B.h-8, BOSS.dog.y+by/L*11));
    }
    clearInterval(pin);
    moving=BOSS.hits-hits0;
    const gtMove=BOSS.t-gt0;
    /* Per GAME second, not per wall second. Headless runs the loop slowly and unevenly, so a
       rate divided by the sleep budget is a rate divided by the wrong number. */
    return {still, moving, gs:+gtStill.toFixed(1), gm:+gtMove.toFixed(1),
            stillPerSec:+(still/Math.max(0.1,gtStill)).toFixed(2),
            movePerSec:+(moving/Math.max(0.1,gtMove)).toFixed(2)};
  }, 14);
  console.log('DODGE ', JSON.stringify(dodge));
  ck(dodge.stillPerSec>dodge.movePerSec,
     'standing still is no worse than moving: '+dodge.stillPerSec+' vs '+dodge.movePerSec+' a second');
  ck(dodge.movePerSec<1.4,
     'PHASE THREE IS NOT DODGEABLE: a dog that keeps moving is still hit '+dodge.movePerSec+' times a second');
  ck(dodge.stillPerSec>0.3, 'standing still in phase three is safe - the paws are not covering the board');

  /* ---------- 5. reduceMotion keeps the FIGHT and drops the FLOURISH ---------- */
  /* The setting must never make the boss unreadable in the name of being gentler: the telegraph,
     the danger line, the slam's impact and every hitbox stay exactly as they are. What goes is
     travel - trails, the directional nudge, particle counts, the glow blur. */
  const calm = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const was=SETTINGS.reduceMotion; SETTINGS.reduceMotion=true;
    BOSS.hp=BOSS.maxhp*0.20; pkBossPhaseCheck();
    const pin=setInterval(()=>{ BOSS.hp=BOSS.maxhp*0.20; PK.hp=PK.maxhp=100000; },48);
    const o={trail:0, fizz:0, kick:0, fired:0, drew:0, err:null};
    const f0=__W.fired;
    try{
      for(let i=0;i<160;i++){
        await sleep(40);
        o.trail=Math.max(o.trail,BOSS.trail.length);
        o.fizz=Math.max(o.fizz,BOSS.fizz.length);
        o.kick=Math.max(o.kick,BOSS.paw.kick||0);
        pkDrawBoss(); o.drew++;
      }
    }catch(e){ o.err=String(e); }
    o.fired=__W.fired-f0;
    clearInterval(pin); SETTINGS.reduceMotion=was;
    return o;
  });
  console.log('CALM  ', JSON.stringify(calm));
  ck(calm.err===null, 'reduceMotion threw while drawing the paws: '+calm.err);
  ck(calm.drew>100, 'the reduceMotion pass never drew');
  ck(calm.fired>0, 'reduceMotion silenced the paws entirely - the fight has to still be a fight');
  /* NOT BOSS.trail. That pool is shared with the MAW's mouthfuls, which have burned all the way
     down since v0.338a with no calm guard on them - so a phase-three window with a MAW beat in it
     reads 13 trail particles and the assertion fires at code it does not own. The paws have two
     pools entirely to themselves, and those are the ones to ask: fizz (every spark a pentagram
     throws) and the throw's directional nudge. */
  ck(calm.fizz===0, 'reduceMotion still throws pentagram sparks: '+calm.fizz);
  ck(calm.kick===0, 'reduceMotion still nudges the screen on a throw: '+calm.kick);

  /* ---------- 6. the rules, over everything that just ran ---------- */
  const W = await pg.evaluate(()=>({bad:__W.bad.slice(0,6), badN:__W.bad.length,
                                    inside:__W.inside.slice(0,6), insideN:__W.inside.length,
                                    swipe2:__W.swipe2, maxAlive:__W.maxAlive,
                                    kinds:__W.kinds, frames:__W.frames,
                                    seen:__W.pawSeen}));
  console.log('RULES ', JSON.stringify(W));
  ck(W.badN===0, 'a k:"bone" was born away from a pentagram x'+W.badN+': '+JSON.stringify(W.bad));
  ck(W.insideN===0, 'something was spawned INSIDE the cage x'+W.insideN+': '+JSON.stringify(W.inside));
  ck(W.swipe2===0, 'two swipes were alive at once on '+W.swipe2+' frames');
  ck(W.kinds.pawswipe>=2, 'no swipes were ever created: '+JSON.stringify(W.kinds));
  ck((W.kinds.bone||0)>50, 'barely any pentagram bones over the whole run: '+JSON.stringify(W.kinds));
  ck(W.seen.L>W.frames*0.9 && W.seen.R>W.frames*0.9,
     'a paw was missing for part of the fight: '+JSON.stringify(W.seen)+' of '+W.frames);

  await pg.evaluate(()=>{ pkBossEnd(); PK.active=false; showScreen('home'); });
  await pg.waitForTimeout(300);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npboss PASS');
})();
