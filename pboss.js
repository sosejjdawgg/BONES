/* WOLFIE'S PAWS — THE ARRIVAL AND PHASE 0.5.
   The chain is intro -> pawslam -> pawwarm -> the fight, and every link is a place the previous
   one can strand the fight forever, so each is driven for real and asked where it ended up.
   Three things here are RULES rather than observations, and they are the ones worth the machinery:
     1. every k:"bone" on the board was born at a live pentagram - sampled every frame, not once
     2. nothing is ever born INSIDE the cage - the audit the whole spawn discipline exists for
     3. phase 0.5 never has two swipes alive at once, and every throw is telegraphed first
   SPLIT IN v0.354a. This suite ran for ten minutes on its own and had to be given a lane to
   itself, which is the point at which a suite stops being one thing: the chain up to the first
   telegraph and the fight that follows it are two subjects, and running them in one page meant
   waiting for both in series when they could have been two pages in parallel. This half owns
   everything up to the hand-over — the boundary, the scream, the suspense, the warm-up and the X
   — plus the pose language, which is about the hands rather than about the beat. The fight lives
   in pbossfight.js and installs the same watchdog. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
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
    window.__W={ bad:[], inside:[], swipe2:0, swipeSame:0, maxSwipeAny:0, maxAlive:0, kinds:{}, phases:[], teleSeen:0,
                 dN:0, dSum:0, dNear:0, dStN:0, dStNear:0,
                 throwsNoTele:0, hits0:0, fired:0, streak:0, pawSeen:{L:0,R:0}, frames:0 };
    const origAdd=window.bossAdd;
    window.bossAdd=function(bb){
      const B=BOSS.box;
      // a bullet this suite places ITSELF to photograph is not a spawn the game made: see the
      // colour test below, which puts one in the middle of the board on purpose
      if(bb.probe) return origAdd.call(this,bb);
      if(bb.x>2 && bb.x<B.w-2 && bb.y>2 && bb.y<B.h-2)
        // THE STACK GOES IN THE RECORD. A violation that reports only a coordinate costs an
        // afternoon of reading spawners; one that names its caller costs a minute.
        __W.inside.push({k:bb.k, x:Math.round(bb.x), y:Math.round(bb.y), ph:BOSS.ph,
                         tele:BOSS.telegraph, spawns:BOSS.spawn.map(sp=>sp.kind),
                         st:((new Error()).stack||"").split("\n").slice(1,5).join(" | ").slice(0,300)});
      if(bb.k==="bone"){
        // a bone must name the paw it came out of, and that paw must be somewhere real
        const q=bb.fromPaw && BOSS.paw[bb.fromPaw];
        if(!q) __W.bad.push({why:"no paw", ph:BOSS.ph, tele:BOSS.telegraph});
        else {
          const d=Math.hypot((q.x-B.x)-bb.x,(q.y-B.y)-bb.y);
          // ...and HOW far, not just whether it was too far: a bone leaving the bars instead of
          // the palm passes the 34px audit and still looks like it came from the wrong place
          __W.dN++; __W.dSum+=d; if(d<=4) __W.dNear++;
          /* ...ASKED ONLY OF A HAND ON A STATION. A paw genuinely inside the cage — the phase-two
             orbit crosses it — has its muzzle walked back out by pawMuzzle, and it must: no bone
             is born on the board. Counting those against "it came out of the mark" measures how
             often the shuffle put the orbit over the box, which is a fact about the deck rather
             than about where bones come from. */
          if(!pawInBox(q.x,q.y)){ __W.dStN++; if(d<=4) __W.dStNear++; }
          // the paw's own position goes in the record: "a bone came from the wrong place" is not
          // actionable without knowing where the hand actually was when it did
          if(d>34) __W.bad.push({why:"far from paw", d:Math.round(d), ph:BOSS.ph, tele:BOSS.telegraph,
                                 paw:bb.fromPaw, px:Math.round(q.x-B.x), py:Math.round(q.y-B.y),
                                 bx:Math.round(bb.x), by:Math.round(bb.y),
                                 pound:!!(BOSS.paw.pound&&BOSS.paw.pound.on)});
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
      /* INVERTED IN v0.354a, AND THE RULE IS BETTER FOR IT. "Never two swipes alive at once" was
         protecting the readability of the TUTORIAL swipes — one slow threat, one line to read —
         and the X ends phase 0.5 with both hands raking at the same time on purpose. What still
         has to hold, and is the stronger claim, is that no HAND is ever overtaking itself: the
         combo is one paw after another, so two live strokes from the same side would mean a hand
         had been asked to be in two places. Counted per side, and the old board-wide count is
         kept for the single-swipe beats, which are still one at a time. */
      let sw=0, swL=0, swR=0;
      for(const bb of BOSS.bullets) if(bb.k==="pawswipe"){ sw++; if(bb.side==="L") swL++; else swR++; }
      if(swL>1||swR>1) __W.swipeSame++;
      if(BOSS.bullets.length>__W.maxAlive) __W.maxAlive=BOSS.bullets.length;
      const inX = BOSS.paw.warmPh==="xstrike";
      if(BOSS.ph==="pawwarm" && !inX && sw>1) __W.swipe2++;
      if(sw>__W.maxSwipeAny) __W.maxSwipeAny=sw;
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

  /* ---------- 0. THE CAGE BOUNDARY, ASKED DIRECTLY ----------
     The spawn audit below catches a paw firing from inside the cage, but only if the fight
     happens to walk one in there - and the case that actually shipped was a paw drifting through
     a two-pixel band just inside a lip, which turned up about once in four thousand frames. Three
     green runs of a random fight is not evidence that the band is closed. So the boundary is asked
     as a question instead of waited for: put a paw one pixel inside each lip and check that the
     clamp moves it out and the muzzle stays at the hand, and put one exactly ON its bar and check
     that neither touches it. */
  const edge = await pg.evaluate(()=>{
    const B=BOSS.box, out={};
    const mk=(x,y,ang)=>({x,y,ang,spd:0});
    const off=BOSS_PAW_R*0.42;
    // one pixel inside each of the four lips: every one must be pushed out
    const spots=[[B.x+1, B.y+B.h*0.5], [B.x+B.w-1, B.y+B.h*0.5],
                 [B.x+B.w*0.5, B.y+1],  [B.x+B.w*0.5, B.y+B.h-1]];
    out.clamped=spots.map(([x,y])=>{ const q=mk(x,y,Math.PI); pawClampOut(q);
                                     return pawInBox(q.x,q.y); });
    // ...and once clamped, the muzzle is at the hand rather than walked across the board
    out.muzzleD=spots.map(([x,y])=>{ const q=mk(x,y,Math.PI); pawClampOut(q);
                                     const m=pawMuzzle(q,off);
                                     return Math.round(Math.hypot((q.x-B.x)-m.x,(q.y-B.y)-m.y)); });
    // a paw ON its own bar is the one pose the exemption exists for, and it must not be lifted
    const grip=pawGrip("L"), qg=mk(grip.x,grip.y,0), was={x:qg.x,y:qg.y};
    pawClampOut(qg);
    out.gripHeld = qg.x===was.x && qg.y===was.y;
    const gripR=pawGrip("R"), qr=mk(gripR.x,gripR.y,Math.PI), wasR={x:qr.x,y:qr.y};
    pawClampOut(qr);
    out.gripHeldR = qr.x===wasR.x && qr.y===wasR.y;
    return out;
  });
  console.log('EDGE  ', JSON.stringify(edge));
  ck(edge.clamped.every(v=>v===false),
     'a paw one pixel inside a lip was left in the cage: '+JSON.stringify(edge.clamped));
  ck(edge.muzzleD.every(d=>d<=Math.ceil(26.4*0.42)+1),
     'the muzzle was walked away from the hand it belongs to: '+JSON.stringify(edge.muzzleD));
  ck(edge.gripHeld===true && edge.gripHeldR===true,
     'a paw holding its own bar was lifted off it by the clamp');

  /* ---------- 1. the slam ---------- */
  /* Driven through the real start and the real intro clock rather than by setting ph="pawslam",
     because "does the intro hand over to the slam" is half of what this suite is for. */
  await pg.evaluate(()=>{ PK.active=true; pkBossStart(); });
  await pg.waitForTimeout(300);
  const arriving = await state();
  console.log('START ', JSON.stringify({ph:arriving.ph, box:arriving.box}));
  ck(arriving.ph==='intro', 'the fight did not start in the intro: '+arriving.ph);

  /* ---------- 1a. THE SCREAM: FISTS, EITHER SIDE OF HIS HEAD ----------
     The first thing the hands ever do is hold still. Sampled inside the roar window, which the
     skip below jumps straight over — so it has to be asked here or not at all. */
  const fists = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    BOSS.introT=BOSS_ROAR_A+0.10;
    await sleep(260);
    const P=BOSS.paw;
    return {pose:{L:pawPoseFor(P.L,"L"), R:pawPoseFor(P.R,"R")},
            fistT:P.L.fistT, thrown:BOSS.bullets.length,
            dxL:Math.round(BOSS.headX-P.L.x), dxR:Math.round(P.R.x-BOSS.headX),
            dyL:Math.round(P.L.y-BOSS.headY), dyR:Math.round(P.R.y-BOSS.headY),
            flip:{L:pawFlip("L","fist"), R:pawFlip("R","fist")},
            t:+BOSS.introT.toFixed(2), roar:+bossRoarT().toFixed(2)};
  });
  console.log('FISTS ', JSON.stringify(fists));
  ck(fists.roar>=0, 'the fists were not sampled inside the roar: '+fists.t);
  ck(fists.pose.L==='fist' && fists.pose.R==='fist',
     'the hands are not clenched during the scream: '+JSON.stringify(fists.pose));
  ck(fists.dxL>40 && fists.dxL<190 && fists.dxR>40 && fists.dxR<190,
     'the fists are not either side of his head: '+fists.dxL+' / '+fists.dxR);
  ck(Math.abs(fists.dxL-fists.dxR)<12, 'the fists are not level with each other');
  ck(Math.abs(fists.dyL)<110 && Math.abs(fists.dyR)<110, 'the fists are nowhere near his head');
  ck(fists.flip.L!==fists.flip.R, 'the two fists are not mirror images of each other');
  ck(fists.thrown===0, 'something was thrown during the scream');

  /* THE RECORDER GOES ON FIRST. The opening beat of the suspense is a third of a second long and
     a round-trip to node costs more than that, so sampling after the hand-over measures whatever
     is left rather than what happened. Armed here, read back at the end of the sequence. */
  await pg.evaluate(()=>{
    window.__SUS={seq:[], glowPre:0, thrown:0, inBox:0, sawGlow:false};
    window.__susT=setInterval(()=>{
      if(BOSS.ph!=="pawslam") return;
      const B=BOSS.box, q=BOSS.paw.L, p=pawPoseFor(q,"L");
      if(__SUS.seq[__SUS.seq.length-1]!==p) __SUS.seq.push(p);
      if(p==="glow") __SUS.sawGlow=true;
      if(p==="palm" && !__SUS.sawGlow) __SUS.glowPre=Math.max(__SUS.glowPre,q.glow);
      __SUS.thrown=Math.max(__SUS.thrown, BOSS.bullets.length);
      if(B.w>0 && q.x>B.x && q.x<B.x+B.w && q.y>B.y && q.y<B.y+B.h) __SUS.inBox++;
    },16);
  });
  // skip to just before the scream ends, then watch the hand-over
  await pg.evaluate(()=>{ BOSS.introT=BOSS_INTRO-0.12; });
  ck(await waitFor(()=>BOSS.ph!=="intro", 6000), 'the intro never ended');
  const slam = await state();
  console.log('SLAM  ', JSON.stringify(slam));
  ck(slam.ph==='pawslam', 'the intro did not hand over to the paw slam: '+slam.ph);
  ck(slam.mode===0.5, 'the warm-up mode was not armed by the slam: '+slam.mode);
  /* ---------- 1b. THE SUSPENSE: FIST -> OPEN -> MARK -> SLAM, AND NOTHING THROWN ----------
     The order is the whole beat. A sequence that reached the same end state by a different route
     would look completely different and pass every "did it end up on the wall" check there is. */
  await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<400 && BOSS.ph==="pawslam";i++) await sleep(25);
    clearInterval(window.__susT);
  });
  const susp = await pg.evaluate(()=>({...window.__SUS}));
  console.log('SUSP  ', JSON.stringify(susp));
  const at=(p)=>susp.seq.indexOf(p);
  ck(at('fist')===0, 'the suspense does not open on the clenched fists: '+susp.seq.join('>'));
  ck(at('palm')>at('fist'), 'the fists never opened into empty palms: '+susp.seq.join('>'));
  ck(at('glow')>at('palm'), 'the marks did not light AFTER the palms opened: '+susp.seq.join('>'));
  ck(at('slam')>at('glow'), 'the hands never slammed onto the bars at the end: '+susp.seq.join('>'));
  ck(susp.glowPre<0.25, 'the palms were already burning before the mark beat: '+susp.glowPre);
  ck(susp.thrown===0, 'something was thrown during the suspense - it is meant to be empty');
  ck(susp.inBox===0, 'a hand went inside the cage during the wind-up');

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

  /* THE X RECORDER, ARMED FIRST. The warm-up sampler below runs the whole of phase 0.5 to its
     end, so anything asked afterwards is asked of a beat that finished several seconds ago. */
  await pg.evaluate(()=>{
    window.__X={seq:[], strokes:[], order:"", warnT:0, drift:0, ends:0, sameSide:0,
                cross:null, dogAt:null, shots:-1, teleWant:BOSS_X_TELE, holdWant:BOSS_X_HOLD};
    let last="", markT=0, cAt=null, firstStrike=0;
    window.__xi=setInterval(()=>{
      if(BOSS.ph!=="pawwarm") return;
      const P=BOSS.paw, B=BOSS.box;
      if(P.warmPh!==last){ __X.seq.push(P.warmPh); last=P.warmPh; }
      if(P.warmPh==="xtele" && !markT && P.xC){ markT=BOSS.t; cAt={x:P.xC.x,y:P.xC.y}; }
      if(cAt && P.xC) __X.drift=Math.max(__X.drift, Math.hypot(P.xC.x-cAt.x, P.xC.y-cAt.y));
      const sw=BOSS.bullets.filter(b=>b.k==="pawswipe");
      if(sw.length && P.warmPh==="xstrike"){
        if(!firstStrike){ firstStrike=BOSS.t; __X.warnT=+(BOSS.t-markT).toFixed(2); __X.shots=P.warmShots; }
        const l=sw.filter(b=>b.side==="L").length, r=sw.filter(b=>b.side==="R").length;
        if(l>1||r>1) __X.sameSide++;
      }
      if(P.xStrokes && !__X.strokes.length){
        __X.strokes=P.xStrokes.map(st=>({side:st.side, len:Math.round(st.len)}));
        __X.order=P.xStrokes.map(st=>st.side).join("");
        __X.ends=P.xStrokes.filter(st=>
          (st.sx>0&&st.sx<B.w&&st.sy>0&&st.sy<B.h)||(st.ex>0&&st.ex<B.w&&st.ey>0&&st.ey<B.h)).length;
        __X.cross={x:Math.round(P.xC.x), y:Math.round(P.xC.y)};
        __X.dogAt={x:Math.round(BOSS.dog.x), y:Math.round(BOSS.dog.y)};
      }
    },16);
  });

  /* ---------- 2. the warm-up: one swipe at a time, always telegraphed ---------- */
  const warm = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const seen={maxSwipes:0, sawTele:0, sawFly:0, dirs:{}, teleY:[], caught:0, bones:0,
                rideMax:0, rideIn:0, faces:{}, scratchMax:0, parkedFrames:0};
    const t0=BOSS.paw.warmShots;
    for(let i=0;i<1400;i++){
      await sleep(40);
      if(BOSS.ph!=="pawwarm") break;
      const sw=BOSS.bullets.filter(b=>b.k==="pawswipe");
      // the singles are one at a time; the X is measured on its own terms below
      if(BOSS.paw.warmPh!=="xstrike") seen.maxSwipes=Math.max(seen.maxSwipes, sw.length);
      for(const b of sw) seen.dirs[b.side]=(seen.dirs[b.side]||0)+1;
      if(BOSS.paw.warmPh==="tele"){ seen.sawTele++; if(BOSS.paw.teleK>0.9) seen.teleY.push(Math.round(BOSS.paw.teleY)); }
      if(BOSS.paw.warmPh==="fly"){
        seen.sawFly++;
        /* THE HAND GOES WITH THE SWIPE. "The paw should follow its trail across the cell rather
           than stay in position" is the whole of the note, so it is measured as a distance from
           the thing it threw rather than as "did it move at all". */
        const b=BOSS.bullets.find(x=>x.k==="pawswipe" && x.side===BOSS.paw.warmSide);
        const q=BOSS.paw[BOSS.paw.warmSide], B=BOSS.box;
        if(b){
          seen.rideMax=Math.max(seen.rideMax, Math.hypot((B.x+b.x)-q.x,(B.y+b.y)-q.y));
          if(q.x>B.x && q.x<B.x+B.w) seen.rideIn++;
          if(Math.abs(q.x-pawGrip(BOSS.paw.warmSide).x)<3) seen.parkedFrames++;
          // measured off the ANGLE, which is the thing that actually turns the claws now
          seen.faces[Math.round(Math.cos(q.ang))]=(seen.faces[Math.round(Math.cos(q.ang))]||0)+1;
        }
      }
      seen.scratchMax=Math.max(seen.scratchMax, BOSS.scratch.length);
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
  /* 22px, not 2. The paw is placed ON the bullet every frame, so the only lag this can ever see is
     one sample's worth of travel between the two being read - at 150px/s and a 40ms poll that is
     six pixels of honest jitter. What it has to rule out is the old behaviour, which parked the
     hand on the wall while the swipe crossed 300px of board. */
  ck(warm.rideMax<22, 'the paw does not travel with its own swipe: it fell '+Math.round(warm.rideMax)+'px behind');
  ck(warm.rideIn>20, 'the paw never actually crossed into the cell: '+warm.rideIn+' frames inside');
  ck(warm.parkedFrames<10, 'the paw sat on its wall for '+warm.parkedFrames+' frames of a swipe');
  // out, round, and back: the claws turn with it rather than dragging backwards
  ck(warm.faces['1']>0 && warm.faces['-1']>0,
     'the claws never turned round at the far wall: '+JSON.stringify(warm.faces));
  ck(warm.scratchMax>6, 'the swipe left no scratch marks on the floor: '+warm.scratchMax);
  const noTele = await pg.evaluate(()=>__W.throwsNoTele);
  ck(noTele===0, noTele+' swipes were thrown without a wind-up');

  /* ---------- 2b. THE X: THE END OF PHASE 0.5 ----------
     One from the left, one from the right, and then he crosses the board twice with both hands.
     Recorded from before the second catch, because the whole beat — telegraph, the held second,
     four strokes — is over in about four seconds and a round-trip to node is not free.
     What is being pinned is FAIRNESS as much as shape: the cross is fixed where the dog was when
     the marks went up, so the answer is "be somewhere else", and there is a measured amount of
     time to be somewhere else in. */
  const xcombo = await pg.evaluate(()=>{ clearInterval(window.__xi); return {...window.__X, done:BOSS.paw.xDone}; });
  console.log('XCOMBO', JSON.stringify(xcombo));
  ck(xcombo.seq.join(">").includes("xtele>xhold>xstrike"),
     'the X does not telegraph, hold, then strike: '+xcombo.seq.join(">"));
  ck(xcombo.strokes.length===4, 'the X is not four strokes: '+xcombo.strokes.length);
  ck(xcombo.order==='LRLR', 'the hands do not alternate through the X: '+xcombo.order);
  ck(xcombo.sameSide===0, 'a hand was raking twice at once during the X');
  ck(xcombo.ends===0, xcombo.ends+' X strokes start or finish inside the cage');
  ck(xcombo.drift<0.01, 'the cross followed the dog after it was drawn: '+xcombo.drift+'px');
  /* THE WARNING. Telegraph plus hold, measured from the marks appearing to the first rake — this
     is the whole of "telegraphed with enough time then the dog has enough chance to dodge", and
     it is the one number in the beat a future tuning pass must not quietly erode. */
  ck(xcombo.warnT > (xcombo.teleWant+xcombo.holdWant)*0.85,
     'the X strikes only '+xcombo.warnT+'s after its marks appear');
  ck(xcombo.done===true, 'the X never finished');
  ck(xcombo.shots===2, 'the X did not follow exactly one swipe from each side: '+xcombo.shots);

  /* ...and a dog that leaves the cross is not hit by it. */
  const xdodge = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const B=BOSS.box, P=BOSS.paw;
    // rebuild the beat by hand: the warm-up is over by now, so this drives the pieces directly
    BOSS.bullets.length=0; PK.hp=PK.maxhp=100000;
    BOSS.dog.x=B.w*0.5; BOSS.dog.y=B.h*0.5;
    const keepPh=BOSS.ph;
    BOSS.ph="pawwarm"; P.warmPh="wait"; P.warmT2=0; P.xDone=false;
    pkPawXTele();
    /* THE GAME'S OWN TICK IS STILL RUNNING under this probe, and it clears xStrokes the moment the
       combo finishes — so the count is taken now and the loops below never dereference it. */
    const cx=P.xC.x, cy=P.xC.y, nStrokes=P.xStrokes.length;
    const xOver=()=>(P.xNext>=nStrokes || !P.xStrokes) && !BOSS.bullets.some(b=>b.k==="pawswipe");
    // ...he walks off the cross while the marks are up, exactly as a player would
    const hits0=BOSS.hits;
    P.warmPh="xstrike"; P.warmT2=0; P.xNext=0;
    // a corner of the board that no arm of a centred X passes through
    BOSS.dog.x=B.w*0.5; BOSS.dog.y=B.h*0.06;
    let minD=1e9;
    for(let i=0;i<220;i++){
      await sleep(16);
      BOSS.dog.x=B.w*0.5; BOSS.dog.y=B.h*0.06;
      for(const b of BOSS.bullets) if(b.k==="pawswipe"){
        const bl=Math.hypot(b.vx,b.vy)||1;
        const pe=Math.abs((b.x-BOSS.dog.x)*(b.vy/bl)-(b.y-BOSS.dog.y)*(b.vx/bl));
        minD=Math.min(minD,pe);
      }
      if(xOver()) break;
    }
    const moved=BOSS.hits-hits0;
    // ...and standing on the crossing point is not survivable, which is what makes it a threat
    BOSS.bullets.length=0; P.warmPh="wait"; P.xDone=false; P.warmT2=0;
    BOSS.dog.x=B.w*0.5; BOSS.dog.y=B.h*0.5;
    pkPawXTele();
    const n2=P.xStrokes.length, c2={x:P.xC.x, y:P.xC.y};
    P.warmPh="xstrike"; P.warmT2=0; P.xNext=0;
    const h1=BOSS.hits;
    for(let i=0;i<220;i++){
      await sleep(16);
      BOSS.dog.x=c2.x; BOSS.dog.y=c2.y;           // stands exactly where the marks crossed
      BOSS.invulnT=0;                             // ...counting every rake, not one per window
      if((P.xNext>=n2 || !P.xStrokes) && !BOSS.bullets.some(b=>b.k==="pawswipe")) break;
    }
    const stood=BOSS.hits-h1;
    BOSS.bullets.length=0; P.xDone=true; P.warmPh="wait"; BOSS.ph=keepPh;
    return {moved, stood, minD:Math.round(minD), cross:{x:Math.round(cx),y:Math.round(cy)}};
  });
  console.log('XDODGE', JSON.stringify(xdodge));
  ck(xdodge.moved===0,
     'a dog that left the cross was still hit '+xdodge.moved+' times by the X');
  ck(xdodge.stood>0, 'standing on the crossing point of the X is safe - it is not a threat');
  /* ---------- 4b. THE SPRITES, AND WHICH POSE MEANS WHAT ---------- */
  /* The poses are not decoration - the brief makes them a language the player has to be able to
     read: the mark is showing means he is not shooting, claws leading means he is. So the test is
     not "does a sprite exist", it is "does the pose the picker chooses match the state".

     INVERTED IN v0.353a, AND THE REASONING MATTERS. Four of the assertions below used to pin the
     old sheets - `grip`/`firing` on the three-quarter paw, `moving` on the face-on palm, and
     `swish` on the streak. New art arrived with its own four-state language (moving / charging /
     charged / firing) and the note that ONLY those four are to appear around the box, so every
     one of those pins now names a pose the fight is meant never to reach there. They are turned
     over rather than deleted: what they were protecting - that the picture on the hand tells you
     what the hand is about to do - is exactly what the new set is for, and the assertions still
     say so, about the new names.
     `swish` is the one that changed KIND rather than value. The streak is no longer a pose any
     hand wears; it is the wake drawn behind one, so a fast paw wears the FLYING pose, which is
     the sprite the artist captioned "flying, moving while not attacking". */
  const art = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={loaded:{}, poses:{}};
    for(const k in PAWIMG){
      const im=PAWIMG[k];
      out.loaded[k]={ok:!!(im.complete&&im.naturalWidth>0), w:im.naturalWidth, h:im.naturalHeight};
    }
    /* THE PAWS ARE NOT GHOSTS. The four cage sheets were keyed on brightness when they were made,
       and brightness cannot tell black FUR from a black BACKGROUND — so 91% of every sprite came
       out part see-through and the hands read as transparent against the cage. Measured off the
       decoded image rather than trusted: what has to be true is that the BODY of the paw is
       solid, so this samples the middle of the hand and counts how much of it is fully opaque. */
    out.solid={};
    for(const k of ["move","chg","chgb","fire"]){
      const im=PAWIMG[k];
      const c=document.createElement("canvas");
      c.width=im.naturalWidth; c.height=im.naturalHeight;
      const x=c.getContext("2d",{willReadFrequently:true});
      x.drawImage(im,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data;
      let body=0, opaque=0;
      for(let i=3;i<d.length;i+=4){ if(d[i]>0){ body++; if(d[i]>=250) opaque++; } }
      out.solid[k]=+(opaque/Math.max(1,body)).toFixed(3);
    }
    /* THE STATE HAS TO BE NEUTRAL FIRST. A pound left running by the section above outranks every
       other pose - correctly - so this measured "gripping the wall" and got "fist", which is the
       picker doing its job on a fight that was still mid-swing. The BEAT has to be neutral too
       now: the charge is read off the telegraph, so a probe run during one reads as charging
       whatever it does to the paw. */
    BOSS.paw.pound=null; BOSS.stiff=0;
    const q=BOSS.paw.L, keep={...q}, ph0=BOSS.ph, tt0=BOSS.telegraphT;
    BOSS.ph="pattern";
    const at=(o)=>{ Object.assign(q,{spd:0,fireT:0,teleT:0,glow:0,fistT:0,rideT:0}, o); return pawPoseFor(q,"L"); };
    const B=BOSS.box;
    q.x=B.x; q.y=B.y+B.h*0.45; q.ang=0;              // gripping the left wall
    out.poses.grip   = at({});
    out.poses.firing = at({fireT:0.3});
    out.poses.swish  = at({spd:PAW_SWISH_SPD+60});
    out.poses.riding = at({rideT:0.1, spd:150});
    q.x=B.x+B.w*0.5; q.y=B.y+B.h*0.5;                // mid-board (only ever true in transit)
    out.poses.moving = at({spd:PAW_MOVE_SPD+30});
    // ...and the wind-up, which is the BEAT rather than anything on the paw
    q.x=B.x; q.y=B.y+B.h*0.45;
    BOSS.ph="telegraph"; BOSS.telegraphLen=0.60;
    BOSS.telegraphT=0.55;  out.poses.wind     = at({});
    BOSS.telegraphT=0.55;  out.poses.windFast = at({spd:900});
    BOSS.telegraphT=0.05;  out.poses.windFull = at({});
    BOSS.ph=ph0; BOSS.telegraphT=tt0;
    Object.assign(q,keep);
    return out;
  });
  console.log('ART   ', JSON.stringify(art));
  for(const k of ['palm','glow','q34','q34b','fist','slam','swipe','move','chg','chgb','fire'])
    ck(art.loaded[k] && art.loaded[k].ok, 'the "'+k+'" paw sprite did not decode: '+JSON.stringify(art.loaded[k]));
  for(const k of ['move','chg','chgb','fire'])
    ck(art.solid[k]>0.20,
       'the "'+k+'" paw is mostly see-through: only '+Math.round(art.solid[k]*100)+'% of it is opaque');
  ck(art.poses.grip==='move', 'a paw holding a bar is not in the neutral pose: '+art.poses.grip);
  ck(art.poses.firing==='fire', 'a FIRING paw does not wear the erupting mark: '+art.poses.firing);
  ck(art.poses.wind==='chg', 'a paw winding up does not show the charging mark: '+art.poses.wind);
  ck(art.poses.windFull==='chgb',
     'the end of a wind-up is not the fully-charged mark: '+art.poses.windFull);
  ck(art.poses.windFast==='chg',
     'a fast wind-up loses the mark instead of keeping it: '+art.poses.windFast);
  ck(art.poses.swish==='move',
     'a fast paw still wears the streak instead of the flying pose: '+art.poses.swish);
  ck(art.poses.moving==='move', 'a travelling paw is not in the flying pose: '+art.poses.moving);
  ck(art.poses.riding==='move', 'a paw riding its swipe is not in the flying pose: '+art.poses.riding);

  /* ---------- 4b-ii. AND NOTHING ELSE APPEARS AROUND THE BOX ----------
     "Only those four during the attack phases" is a claim about every frame, not about the six
     states a probe happens to construct. Sampled across a real fight, both hands, at all three
     phases: anything from the old vocabulary showing up here is the bug the note is about. */
  /* TWO ADDITIONS IN v0.356a, AND ONLY ONE OF THEM IS A NEW SHEET.
     `fistd` is the SAME clenched drawing as `fist`, held at a steeper angle for BADDOG's cocked
     hands - PAWPOSE.fistd carries `img:"fist"`, so nothing new is being reached for and the rule
     the brief set is untouched.
     `palm` is a genuine exemption and is therefore checked rather than waved through: BADDOG ends
     with him spent, and a clenched fist hanging off the bars still reads as ready. The brief's
     rule is about the ATTACK phases around the box; the rest is the one stretch of this fight
     where he is attacking nothing. So it is allowed exactly there and nowhere else, which is a
     sharper claim than the blanket list it replaces. */
  const vocab = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const seen={}, seenRest={}, ok=["move","chg","chgb","fire","fist","fistd"];
    const pin=setInterval(()=>{ PK.hp=PK.maxhp=100000; },48);
    for(const frac of [0.90,0.50,0.20]){
      BOSS.hp=BOSS.maxhp*frac; pkBossPhaseCheck(); BOSS.coolOwed=false; BOSS.coolT=0;
      for(let i=0;i<140;i++){          // 420 samples over three phases is plenty for a vocabulary
        await sleep(20);
        BOSS.hp=BOSS.maxhp*frac;
        if(BOSS.ph==="intro"||BOSS.ph==="pawslam"||BOSS.ph==="outro"||BOSS.ph==="win") continue;
        const resting=!!(BOSS.paw.pound && BOSS.paw.pound.on && BOSS.paw.pound.stage==="rest");
        for(const sd of ["L","R"]){
          const p=pawPoseFor(BOSS.paw[sd],sd);
          (resting?seenRest:seen)[p]=((resting?seenRest:seen)[p]||0)+1;
        }
      }
    }
    clearInterval(pin);
    return {seen, seenRest,
            bad:Object.keys(seen).filter(k=>!ok.includes(k)),
            badRest:Object.keys(seenRest).filter(k=>!ok.includes(k) && k!=="palm"),
            borrows:PAWPOSE.fistd && PAWPOSE.fistd.img};
  });
  console.log('VOCAB ', JSON.stringify(vocab));
  ck(vocab.bad.length===0,
     'the fight still reaches the old paw sheets: '+JSON.stringify(vocab.bad));
  ck(vocab.badRest.length===0,
     'BADDOG\'s rest reaches the old paw sheets: '+JSON.stringify(vocab.badRest));
  // ...and the cocked fist really is the fist, not a twelfth drawing nobody supplied
  ck(vocab.borrows==='fist',
     'the cocked fist is not borrowing the fist sheet: '+vocab.borrows);
  for(const k of ['move','chg','fire'])
    ck((vocab.seen[k]||0)>0, 'the "'+k+'" pose is never reached in a real fight');

  /* ---------- 4b-iii. A HAND ON THE RIGHT WALL IS THE LEFT ONE TURNED OVER ----------
     The complaint the new art answers is a hand lying on its back against the bars, so what has
     to hold is that the aim decides the picture EXACTLY: mirrored across the middle of the cage,
     and turned a quarter over the lid so the claws face the floor of the board. */
  const aimed = await pg.evaluate(()=>{
    const B=BOSS.box, out={};
    const rotOf=(ang)=>{
      let a=ang; while(a>Math.PI) a-=6.283; while(a<-Math.PI) a+=6.283;
      const mir=Math.abs(a)>Math.PI/2;
      return {mir, rot:+((mir ? (a>0?a-Math.PI:a+Math.PI) : a)).toFixed(3),
              // where the claws end up pointing in the world, from art that points along +x
              claw:+((mir ? Math.PI+ (a>0?a-Math.PI:a+Math.PI) : a)).toFixed(3)};
    };
    out.left  = rotOf(0);            // left wall, reaching right
    out.right = rotOf(Math.PI);      // right wall, reaching left
    out.lid   = rotOf(Math.PI/2);    // over the lid, reaching down
    out.under = rotOf(-Math.PI/2);   // under the box, reaching up
    out.aimPoses = ["move","chg","chgb","fire"].map(k=>!!PAWPOSE[k].aim);
    out.flipOff  = ["move","chg","chgb","fire"].map(k=>pawFlip("L",k));
    return out;
  });
  console.log('AIM   ', JSON.stringify(aimed));
  ck(aimed.aimPoses.every(v=>v===true), 'the cage poses are not aim-driven');
  ck(aimed.flipOff.every(v=>v===false),
     'pawFlip is still second-guessing the mirror for the aim poses');
  ck(aimed.left.mir===false && Math.abs(aimed.left.rot)<0.01, 'the left-wall hand is not upright');
  ck(aimed.right.mir===true && Math.abs(aimed.right.rot)<0.01,
     'the right-wall hand is rotated instead of mirrored: '+JSON.stringify(aimed.right));
  ck(Math.abs(aimed.lid.claw-Math.PI/2)<0.01,
     'a hand over the lid does not point its claws at the floor: '+aimed.lid.claw);
  ck(Math.abs(aimed.under.claw+Math.PI/2)<0.01,
     'a hand under the box does not point its claws up into it: '+aimed.under.claw);
  ck(Math.abs(aimed.right.claw-Math.PI)<0.01,
     'the right-wall hand does not reach into the cage: '+aimed.right.claw);
  /* ---------- 6. the rules, over everything that just ran ----------
     The bone audit stays in BOTH halves: the warm-up must fire no pentagram bones at all and the
     fight must fire nothing away from a mark, and the same watchdog answers both. What is asked
     of the counts differs, because each half only drove its own part of the fight. */
  const W = await pg.evaluate(()=>({bad:__W.bad.slice(0,6), badN:__W.bad.length,
                                    inside:__W.inside.slice(0,6), insideN:__W.inside.length,
                                    swipe2:__W.swipe2, swipeSame:__W.swipeSame,
                                    maxSwipeAny:__W.maxSwipeAny, maxAlive:__W.maxAlive,
                                    kinds:__W.kinds, frames:__W.frames,
                                    seen:__W.pawSeen}));
  console.log('RULES ', JSON.stringify(W));
  ck(W.badN===0, 'a k:"bone" was born away from a pentagram x'+W.badN+': '+JSON.stringify(W.bad));
  ck(W.insideN===0, 'something was spawned INSIDE the cage x'+W.insideN+': '+JSON.stringify(W.inside));
  ck(W.swipe2===0, 'two swipes were alive at once outside the X on '+W.swipe2+' frames');
  ck(W.swipeSame===0,
     'a hand was overtaking itself: two of its own strokes alive on '+W.swipeSame+' frames');
  ck(W.maxSwipeAny<=2, 'more than two rakes were in the air at once: '+W.maxSwipeAny);
  ck(W.kinds.pawswipe>=2, 'no swipes were ever created: '+JSON.stringify(W.kinds));
  ck(W.seen.L>W.frames*0.9 && W.seen.R>W.frames*0.9,
     'a paw was missing for part of the fight: '+JSON.stringify(W.seen)+' of '+W.frames);

  await pg.evaluate(()=>{ pkBossEnd(); PK.active=false; showScreen('home'); });
  await pg.waitForTimeout(300);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npboss PASS');
})();
