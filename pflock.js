/* THE BIRD FLYBY, THE CHASE HOLD, THE DELIVERY FLOOR, AND ONE MISSING BRACE.
   Four things that all came from the same kind of mistake: a number that was right once and stopped
   being right when something around it changed, and nothing in the battery watching. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.347a.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1900);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.pendingStage.length=0;
                          S.tricks={fetch:1,sit:1,jump:1,roll:1}; S.ballOwned=true; });
  await pg.waitForTimeout(700);

  /* ---------- 1. the CSS parses, all of it ---------- */
  /* A bare `}` left behind by a deleted rule put the parser into error recovery and it swallowed
     the whole of the NEXT rule - #portrait lost its position, its size and its display:none and
     sat permanently over the XP bar as a stray CONFUSED chip. Nothing in the battery could see a
     dropped CSS rule, so now something does. */
  const css = await pg.evaluate(()=>{
    let rules=0;
    for(const sh of document.styleSheets){
      let rs; try{ rs=sh.cssRules; }catch(_){ continue; }
      rules+=rs.length;
    }
    const p=document.getElementById('portrait'), c=getComputedStyle(p);
    return { rules, pos:c.position, disp:c.display,
             shown:p.classList.contains('show'),
             box:(()=>{const q=p.getBoundingClientRect();return {h:Math.round(q.height)};})() };
  });
  console.log('CSS   ', JSON.stringify(css));
  ck(css.pos==='absolute',
     '#portrait is '+css.pos+' - its rule was dropped, which means a CSS parse error upstream');
  ck(css.disp==='none' && !css.shown, 'the portrait card is visible with nothing showing it');
  ck(css.box.h===0, 'a hidden portrait still occupies '+css.box.h+'px');

  /* ---------- 2. the birds make a PASS ---------- */
  /* They used to wrap around the torus with a life scaled by the world's own size - and the world
     grows every wave - so from wave 2 the flock outlived the gap to the next one and sat on top of
     him permanently. A pass has to arrive, cross, and be gone. */
  await pg.evaluate(()=>{ startPark(true); });      // PK only exists once a run has started
  await pg.waitForTimeout(900);
  const flock = await pg.evaluate(()=>{
    PK.active=true; PK.hp=PK.maxhp;
    PK.pals.length=0; PK.pals.push({k:"bird", tier:3, passT:0.01, birds:[]});
    const WW=PK.WW, WH=PK.WH;                      // the world's size lives on PK, not on a global
    PK.x=WW*0.5; PK.y=WH*0.5; PK.vx=0; PK.vy=0;
    const p=PK.pals[0];
    let spawned=0, minD=1e9, maxD=0, gone=0, frames=0, withBirds=0;
    /* pkPalsUpdate(dt, WW, WH) takes the world's size as ARGUMENTS. Calling it with dt alone left
       both undefined inside, which made the pass radius NaN, which made every bird's life NaN,
       which made `life<=0` false forever - a flock that never expired, produced entirely by the
       harness. Worth remembering: an undefined number does not throw, it just quietly wins every
       comparison it is in. */
    for(let i=0;i<3600;i++){
      const n0=p.birds.length;
      pkPalsUpdate(1/60, WW, WH);
      if(p.birds.length>n0) spawned++;
      frames++;
      if(p.birds.length) withBirds++; else gone++;
      for(const bd of p.birds){
        const d=Math.hypot(bd.x-PK.x, bd.y-PK.y);   // he is parked mid-world, so no wrap to undo
        minD=Math.min(minD,d); maxD=Math.max(maxD,d);
      }
    }
    return { spawned, pct:Math.round(100*withBirds/frames), minD:Math.round(minD),
             maxD:Math.round(maxD), pass:PAL_BIRD_PASS, lane:PAL_BIRD_LANE,
             every:pkBirdEvery(3), left:p.birds.length };
  });
  console.log('FLOCK ', JSON.stringify(flock));
  ck(flock.spawned>=3, 'only '+flock.spawned+' passes in a minute - they never come back');
  ck(flock.pct<75, 'birds are on screen '+flock.pct+'% of the time - that is a permanent cloud');
  ck(flock.minD>flock.lane*0.5,
     'the flock came within '+flock.minD+'px of him - the lane runs straight through him');
  ck(flock.maxD>400, 'the flock never got further than '+flock.maxD+'px away - it never leaves');

  /* ---------- 3. he gives the throw a chance to land ---------- */
  const hold = await pg.evaluate(()=>{
    const setup=(bx,bz)=>{
      CAM.state="idle"; CAM.until=99; CAM.x=0.5; CAM.z=0.85; CAM.leap=null; CAM.leapCd=9;
      PARTY.on=false; FLY.active=false; FLY.next=1e9;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
      BALL.x=bx; BALL.z=bz; BALL.hz=0; BALL.vx=0; BALL.vz=0; BALL.vh=0;
    };
    const o={};
    // a throw at the far cross: he must not be on it immediately
    FETCH.eagerT=0; setup(0.5,0.12);
    BALL.needsFetch=true; BALL.hold=chaseHoldFor();
    o.farHold=+BALL.hold.toFixed(2);
    let moved=0;
    for(let i=0;i<12;i++){ const x0=CAM.x,z0=CAM.z; camBehavior(1/60);
                           if(Math.hypot(CAM.x-x0,CAM.z-z0)>1e-4) moved++; }
    o.movedEarly=moved;
    // ...but he does go, and he does get there
    for(let i=0;i<600;i++){ camBehavior(1/60); if(BALL.carried) break; }
    o.fetched=BALL.carried;
    // ...and brings it back to the drop spot, where the job is finally cleared
    for(let i=0;i<1200;i++){ camBehavior(1/60); if(!BALL.needsFetch) break; }
    o.returned=!BALL.needsFetch;
    o.dropX=+BALL.x.toFixed(2); o.dropZ=+BALL.z.toFixed(2);
    // a ball dropped at his feet barely holds him at all
    FETCH.eagerT=0; setup(0.5,0.84);
    BALL.needsFetch=true; o.nearHold=+chaseHoldFor().toFixed(2);
    // PLAY FETCH means go
    FETCH.eagerT=CHASE_EAGER_T; setup(0.5,0.12);
    o.eagerHold=+chaseHoldFor().toFixed(2);
    FETCH.eagerT=0;
    return o;
  });
  console.log('HOLD  ', JSON.stringify(hold));
  ck(hold.farHold>0.9, 'a throw at the far cross only holds him '+hold.farHold+'s');
  ck(hold.movedEarly===0, 'he set off on '+hold.movedEarly+' frames before the ball had landed');
  ck(hold.nearHold<hold.farHold*0.6,
     'a ball at his feet holds him as long as one across the room: '+hold.nearHold);
  ck(hold.eagerHold===0, 'PLAY FETCH did not clear the hold: '+hold.eagerHold);
  ck(hold.fetched===true, 'he never went and got it');
  ck(hold.returned===true, 'he never brought it back');
  ck(Math.abs(hold.dropX-0.5)<0.18 && hold.dropZ>0.7,
     'he did not drop it front and centre: '+hold.dropX+'/'+hold.dropZ);

  /* ---------- 4. a shift that delivered always pays ---------- */
  const pay = await pg.evaluate(()=>{
    const shift=(gross,dest,fumble,miss,crash)=>{
      const raw=dest*PB_DESTRUCTION_PENALTY+fumble*PB_FUMBLE_PENALTY+miss*PB_MISS_PENALTY
               +(crash?PB_CRASH_PENALTY:0);
      const ded=Math.min(raw, Math.round(gross*(1-PB_KEEP)));
      return {raw, ded, net:Math.max(0,gross-ded)};
    };
    return { keep:PB_KEEP, dest:PB_DESTRUCTION_PENALTY, fumble:PB_FUMBLE_PENALTY,
             miss:PB_MISS_PENALTY, crash:PB_CRASH_PENALTY, perfect:PB_PERFECT_PAY,
             good:shift(80,0,0,0,false), rough:shift(70,2,1,2,true),
             awful:shift(60,4,3,5,true) };
  });
  console.log('PAY   ', JSON.stringify(pay));
  ck(pay.dest<=pay.perfect*4,
     'a broken window still costs '+pay.dest+' - '+(pay.dest/pay.perfect).toFixed(1)+' clean deliveries');
  ck(pay.good.net===80, 'a clean shift lost money to nothing');
  ck(pay.rough.net>0, 'a rough-but-productive shift still pays nothing');
  ck(pay.awful.net>0, 'a disastrous shift pays nothing at all - nobody works for free');
  ck(pay.awful.net>=Math.round(60*pay.keep)-1,
     'the floor did not hold: '+pay.awful.net+' of 60 gross');
  ck(pay.rough.ded<pay.rough.raw, 'the cap never bites on a shift with real mistakes');

  /* ---------- 5. the music is BACK IN the file ---------- */
  /* INVERTED AGAIN, and the flip-flop is the point of writing it down. This line has now read
     three ways: "the tracks are present" (they were), then "the tracks are empty" (v0.336a took
     them out, four of eleven megabytes, and every rebuild paid for all of them), and now
     "present" once more, because v0.346a is the stable beta and a stable beta ships with its
     music. The build cost was always the argument against, never a claim that silence was
     better; the moment someone asks for the beta, the cost is worth paying. pnight.js is where
     the tracks are checked properly - decoded, not merely non-empty; this one only pins that
     they are HERE, so the next size-cutting pass has to come through a failing test. */
  const music = await pg.evaluate(()=>({
    good:MUSIC_GOODMOOD.length, park:MUSIC_DOGPARK.length, boss:MUSIC_BOSS.length,
    on:SETTINGS.music
  }));
  console.log('MUSIC ', JSON.stringify(music));
  ck(music.good>200000 && music.park>200000 && music.boss>200000,
     'a track is empty again - the music was stripped out of the beta: '+JSON.stringify(music));
  ck(music.on===true, 'music is off by default');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npflock PASS');
})();
