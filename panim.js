/* WHY HIS ANIMATIONS WERE "ALL OVER THE PLACE".
   Four separate faults, none of them visible in a still frame, all of them visible the moment he
   moved: the toward-camera sheet was wired up as N so he showed you his face while walking away;
   the three-quarter sheet was a GALLOP whose bottom edge wandered 17px, anchored on one floor line,
   which is a hop; only five frames of a twenty-five frame cycle were stored, so the walk played
   every fifth pose; and the cycle ran on the wall clock, so his feet skated at every speed but one.
   On top of that he never stopped walking (a new wander target was picked on the frame he reached
   the last one) and he left the floor for a ball at ankle height.
   This suite pins the behaviour, not the pixels - pdog.js already checks the art. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1600);
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.ballOwned=true; });
  await pg.waitForTimeout(700);

  /* ---------- 1. which way he is facing is which way he is going ---------- */
  const face = await pg.evaluate(()=>{
    const go=(dx,dz)=>{ const o=dogOctant(dx,dz); const m=DOGDIR_MAP[o];
                        return {oct:o, k:m.k, mirror:!!m.f}; };
    return {
      right : go( 1, 0),   left : go(-1, 0),
      toward: go( 0, 1),   away : go( 0,-1),   // +z is toward the camera, which is DOWN the glass
      awayR : go( 1,-1),   awayL: go(-1,-1),
      towR  : go( 1, 1),   towL : go(-1, 1)
    };
  });
  console.log('FACE  ', JSON.stringify(face));
  ck(face.right.k==='E'  && !face.right.mirror, 'walking right is not the side sheet');
  ck(face.left.k==='E'   &&  face.left.mirror,  'walking left is not the mirrored side sheet');
  ck(face.toward.k==='S', 'walking TOWARD the camera plays "'+face.toward.k+'"');
  ck(face.away.k==='N',   'walking AWAY from the camera plays "'+face.away.k+'"');
  ck(face.awayR.k==='NE' && !face.awayR.mirror, 'away-right is not the away three-quarter');
  ck(face.awayL.k==='NE' &&  face.awayL.mirror, 'away-left is not the mirrored away three-quarter');
  ck(face.towR.k==='SE'  && !face.towR.mirror,  'toward-right is not the toward three-quarter');
  ck(face.towL.k==='SE'  &&  face.towL.mirror,  'toward-left is not mirrored');

  /* ---------- 2. the cycle runs on distance, not on the clock ---------- */
  /* Standing still must not advance it by one frame, however long he stands there; and walking the
     same distance must advance it the same amount however long that walk took. */
  const phase = await pg.evaluate(()=>{
    const run=(steps,dt,move)=>{
      CAM.state="walk"; CAM.until=99; CAM.wander=null; CAM.wanderRest=99;  // no wander of its own
      CAM.x=0.30; CAM.z=0.50; CAM.px=undefined; CAM.pz=undefined;
      CAM.walkPh=0; CAM.walkHold=0;
      for(let i=0;i<steps;i++){ CAM.x+=move; camBehavior(dt); }
      return {ph:+CAM.walkPh.toFixed(3), moving:CAM.moving};
    };
    const still  = run(120, 1/60, 0);
    const walked = run(120, 1/60, 0.0020);   // 0.24 floor units, at 60fps
    const slow   = run( 40, 1/20, 0.0060);   // the same 0.24, at a third of the frame rate
    return {still, walked, slow, stride:WALK_STRIDE, n:DOGDIR_N};
  });
  console.log('PHASE ', JSON.stringify(phase));
  ck(phase.still.ph===0, 'the walk cycle ran while he stood still: '+phase.still.ph);
  ck(phase.still.moving===false, 'he reads as moving while stood still');
  ck(phase.walked.ph>0 && phase.walked.moving===true, 'walking advanced nothing');
  ck(Math.abs(phase.walked.ph-phase.slow.ph)<0.5,
     'the same distance at a different frame rate gave a different cycle: '
     +phase.walked.ph+' vs '+phase.slow.ph);
  // 0.24 floor units over a 0.22 stride is a whisker over one full turn of the cycle
  ck(Math.abs(phase.walked.ph-(0.24/phase.stride)*phase.n)<1.2,
     'the cycle is not paced to the stride: '+phase.walked.ph);

  /* ---------- 3. he does not flicker out of the walk sheets mid-walk ---------- */
  /* The old gate was a per-frame flag that every state had to remember to set. One frame where he
     had arrived but the state had not changed yet put him in the bound sheet for that frame. */
  const flick = await pg.evaluate(()=>{
    CAM.state="walk"; CAM.until=99; CAM.wander=null; CAM.wanderRest=0;
    CAM.x=0.20; CAM.z=0.50; CAM.px=undefined; CAM.pz=undefined; CAM.walkHold=0;
    let drops=0, moved=0, wasMoving=false;
    for(let i=0;i<260;i++){
      const x0=CAM.x, z0=CAM.z;
      camBehavior(1/60);
      const stepped=Math.hypot(CAM.x-x0,CAM.z-z0)>2e-4;
      if(stepped) moved++;
      // a frame where he took a step but was NOT on the walk sheets is the flicker
      if(stepped && wasMoving && !CAM.moving) drops++;
      wasMoving=wasMoving||stepped;
    }
    return {drops, moved};
  });
  console.log('FLICK ', JSON.stringify(flick));
  ck(flick.moved>40, 'the wander never moved him: '+flick.moved+' frames');
  ck(flick.drops===0, 'he dropped out of the walk sheets on '+flick.drops+' moving frames');

  /* ---------- 4. ...and he does stop, between one wander target and the next ---------- */
  const rest = await pg.evaluate(()=>{
    CAM.state="walk"; CAM.until=1e9; CAM.wander=null; CAM.wanderRest=0;
    CAM.x=0.50; CAM.z=0.50; CAM.px=undefined; CAM.pz=undefined;
    let still=0, arrivals=0;
    for(let i=0;i<3000;i++){
      const w0=CAM.wander;
      const x0=CAM.x, z0=CAM.z;
      camBehavior(1/60);
      if(Math.hypot(CAM.x-x0,CAM.z-z0)<=2e-4) still++;
      if(w0 && !CAM.wander) arrivals++;
    }
    return {still, arrivals, pct:+(100*still/3000).toFixed(1)};
  });
  console.log('REST  ', JSON.stringify(rest));
  ck(rest.arrivals>=2, 'he never finished a wander in 50 seconds: '+rest.arrivals);
  ck(rest.pct>8, 'he spent only '+rest.pct+'% of the wander stood still - he never stops walking');

  /* ---------- 5. the leap is for a ball he cannot reach standing ---------- */
  /* REFINED, not relaxed. This used to ask one dog one question, because every dog had the same
     leap; the wind-up is stamina-scaled now, so "will he go for this" has to name whose legs.
     An untrained dog is slow enough off the mark that a ball only just over his head has already
     fallen out of the band by the time he could be up there, and declining it is right - what
     would be wrong is either dog leaving the floor for something at knee height. */
  const leap = await pg.evaluate(()=>{
    /* HE HAS TO HAVE BEEN TAUGHT IT. JUMP CATCH is a trick bought in the tree now, so an untaught
       dog correctly never leaves the floor and every case below would pass for the wrong reason. */
    const at=(hzMul,stam,str)=>{
      S.tricks=S.tricks||{}; S.tricks.fetch=1; S.tricks.jump=1;
      S.stam=stam; S.str=str;
      CAM.state="idle"; CAM.until=99; CAM.leapCd=0; CAM.x=0.50; CAM.z=0.70; CAM.lz=0;
      CAM.leap=null; CAM.freeze=0; CAM.bedTarget=false;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
      BALL.x=0.52; BALL.z=0.70; BALL.hz=dogBodyFloor()*hzMul;
      BALL.vx=0; BALL.vz=0; BALL.vh=0.02;      // barely moving, so it hangs where it is put
      camBehavior(1/60);
      return CAM.state==="leap";
    };
    const W=[ATTR_START,ATTR_START], F=[ATTR_FULL,ATTR_FULL];
    const o={ ankleW:at(0.30,...W), kneeW:at(0.50,...W), overW:at(1.30,...W), highW:at(1.60,...W),
              ankleF:at(0.30,...F), kneeF:at(0.50,...F), overF:at(1.30,...F), highF:at(1.60,...F),
              cd:LEAP_CD, kmin:LEAP_K_MIN };
    S.stam=ATTR_START; S.str=ATTR_START;
    return o;
  });
  console.log('LEAP  ', JSON.stringify(leap));
  for(const who of ['W','F']){
    ck(leap['ankle'+who]===false, who+': he leaves the floor for a ball at ankle height');
    ck(leap['knee'+who]===false,  who+': he leaves the floor for a ball he can take standing');
    ck(leap['high'+who]===true,   who+': he will not leap for a ball well over his head');
  }
  ck(leap.overF===true, 'a trained dog will not go for a ball just over his head');
  ck(leap.overW===false,
     'an untrained dog is still quick enough off the mark to take a ball just over his head');
  ck(leap.cd>=1.0, 'the leap cooldown is '+leap.cd+'s - a bouncing ball is a pogo stick');
  // ...and without the trick he keeps his feet on the carpet whatever is thrown over him
  const untaught = await pg.evaluate(()=>{
    S.tricks={fetch:1};                       // a ball, but no JUMP CATCH
    S.stam=ATTR_FULL; S.str=ATTR_FULL;
    CAM.state="idle"; CAM.until=99; CAM.leapCd=0; CAM.x=0.50; CAM.z=0.70; CAM.lz=0;
    CAM.leap=null; CAM.freeze=0; CAM.bedTarget=false;
    BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
    BALL.x=0.52; BALL.z=0.70; BALL.hz=dogBodyFloor()*1.6; BALL.vx=0; BALL.vz=0; BALL.vh=0.02;
    camBehavior(1/60);
    const o={leapt:CAM.state==="leap"};
    S.tricks.jump=1; CAM.state="idle"; CAM.leap=null; CAM.leapCd=0;
    BALL.hz=dogBodyFloor()*1.6; BALL.vh=0.02;
    camBehavior(1/60);
    o.taught=CAM.state==="leap";
    return o;
  });
  console.log('TRICK ', JSON.stringify(untaught));
  ck(untaught.leapt===false, 'he leaps for a ball without ever having been taught JUMP CATCH');
  ck(untaught.taught===true, 'teaching him JUMP CATCH did not give him the leap');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npanim PASS');
})();
