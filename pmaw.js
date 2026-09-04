const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1400);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(900);
  await pg.evaluate(()=>{ S.lvl=20; startPark(true); });
  await pg.waitForTimeout(1800);
  await pg.evaluate(()=>{ PK.plusMode=true; PK.bossDone=false; pkBossStart();
                          BOSS.introT=BOSS_INTRO; pkBossUpdate(0.016); });
  /* Drive the beat the way the fight does. BOSS.phase is DERIVED from HP (pkBossPhaseCheck), so
     assigning it at full health is undone the first time anything checks - the spawner captures
     phase when the pattern begins, and it was capturing 2. Drop the HP instead, then let the
     telegraph expire on its own so pkBossBeginPattern runs from the real path. */
  await pg.evaluate(()=>{ window.__startMaw=(phase)=>{
    /* The test dog stands still and gets shot for thousands of frames; once PK.hp hits zero
       pkBossUpdate calls pkDeath, PK.active goes false, and every block after that starts on a
       dead run drawing an empty board. Revive before each beat, and top him up inside the loops. */
    PK.active=true; PK.hp=PK.maxhp;
    pkBossReset(); pkBossStart(); BOSS.introT=BOSS_INTRO; pkBossUpdate(0.016);
    if(phase>=3){ BOSS.hp=BOSS.maxhp*0.20; pkBossPhaseCheck(); }
    else if(phase>=2){ BOSS.hp=BOSS.maxhp*0.50; pkBossPhaseCheck(); }
    BOSS.spawn.length=0; BOSS.bullets.length=0;
    BOSS.ph="telegraph"; BOSS.telegraph="maw"; BOSS.telegraphT=0.001;
    pkBossUpdate(1/60);
    return {ph:BOSS.ph, phase:BOSS.phase, kinds:BOSS.spawn.map(s=>s.kind)};
  }; });

  /* ---------- 1. everything on the board is 20% bigger, draw AND hitbox ---------- */
  const scale = await pg.evaluate(()=>({
    S:BOSS_SCALE, dogSc:+BOSS_DOG_SC.toFixed(4), dogR:+BOSS_DOG_R.toFixed(3),
    bullet:+BOSS_BULLET_R.toFixed(3), maw:+BOSS_MAW_R.toFixed(3),
    shot:+BOSS_MAW_SHOT.toFixed(3), catchR:+BOSS_BIRD_CATCH_R.toFixed(2),
    birdS:+BIRDFIRE.S.toFixed(1)
  }));
  console.log('SCALE  ', JSON.stringify(scale));
  const near=(a,b2)=>Math.abs(a-b2)<0.005;
  ck(scale.S===1.2, 'BOSS_SCALE is not 1.20: '+scale.S);
  ck(near(scale.dogSc, 0.62*1.2), 'the dog sprite did not scale: '+scale.dogSc);
  ck(near(scale.dogR, 4.4*1.2), 'the dog HITBOX did not scale with it: '+scale.dogR);
  ck(near(scale.bullet, 5*1.2), 'bullets did not scale: '+scale.bullet);
  ck(near(scale.maw, 5*1.2*2.4), 'the heavy mouthful did not follow: '+scale.maw);
  ck(near(scale.catchR, 19*1.2), 'the bird catch radius did not follow: '+scale.catchR);
  ck(near(scale.birdS, 34*1.2), 'the cached bird frame did not scale: '+scale.birdS);

  // the red dot is gone, and nothing red is painted on him any more
  const dot = await pg.evaluate(()=>{
    const cv=document.querySelector('#bosscv'), ctx=cv.getContext('2d');
    const fills=[]; let path=null;
    const oa=ctx.arc.bind(ctx), ob=ctx.beginPath.bind(ctx), of=ctx.fill.bind(ctx);
    ctx.beginPath=function(){ path=null; return ob(); };
    ctx.arc=function(x,y,r,a,b2){ path={x,y,r}; return oa(x,y,r,a,b2); };
    ctx.fill=function(){ if(path) fills.push({r:+path.r.toFixed(2), s:String(ctx.fillStyle),
      d:+Math.hypot(path.x-BOSS.dog.x, path.y-BOSS.dog.y).toFixed(2)}); return of(); };
    BOSS.golden=0; BOSS.bird=null;
    pkDrawBoss();
    ctx.arc=oa; ctx.beginPath=ob; ctx.fill=of;
    // anything small, red, and sitting on the dog would be the dot
    const onDog=fills.filter(f=>f.d<2 && f.r<BOSS_DOG_R*2.2);
    return {onDog, reds:onDog.filter(f=>/#ff3b4e|#e23|red/i.test(f.s)).length, n:fills.length};
  });
  console.log('DOT    ', JSON.stringify(dot));
  ck(dot.reds===0, 'the red hitbox dot is still drawn: '+JSON.stringify(dot.onDog));

  /* ---------- 2. he leans in, without ever reaching the cage ---------- */
  const lean = await pg.evaluate(()=>{
    const cv=document.querySelector('#bosscv'), w=cv.clientWidth, h=cv.clientHeight;
    const headAt=()=>{ const sp=pkBossSpine(w,h); return sp[sp.length-1]; };
    BOSS.mawLean=0; const rest=headAt();
    BOSS.mawLean=1; const inn=headAt();
    /* The mouth must stay clear of the lip at full lean - measured at the REAL jaw, which is a
       fraction of the head cell below the joint and moves with the head's scale, not the flat
       14px the old mouth used. */
    const B=BOSS.box;
    BOSS.headSc=inn.sc; BOSS.headAng=inn.ang; BOSS.headX=inn.x; BOSS.headY=inn.y;
    const mouthY=pkBossMouthPanel().y;
    BOSS.mawLean=0;
    return {restY:+rest.y.toFixed(1), inY:+inn.y.toFixed(1),
            restSc:+rest.sc.toFixed(4), inSc:+inn.sc.toFixed(4),
            grow:+(inn.sc/rest.sc).toFixed(3), drop:+(inn.y-rest.y).toFixed(1),
            mouthY:+mouthY.toFixed(1), boxTop:+B.y.toFixed(1),
            clear:+(B.y-mouthY).toFixed(1), need:BOSS_MAW_CLEAR};
  });
  console.log('LEAN   ', JSON.stringify(lean));
  ck(Math.abs(lean.grow-1.30)<0.01, 'the head does not grow 30%: '+lean.grow);
  ck(lean.drop>30, 'the head does not come closer: '+lean.drop+'px');
  ck(lean.clear>=lean.need, 'the mouth leans inside the cage margin: '+lean.clear+' < '+lean.need);
  ck(lean.mouthY<lean.boxTop, 'THE MOUTH IS INSIDE THE BOX at full lean');

  // and the lean actually runs for the beat, telegraph included
  const ramp = await pg.evaluate(()=>{
    pkBossFinishPattern();
    BOSS.telegraph="maw"; BOSS.telegraphT=BOSS_TELE.maw; BOSS.ph="telegraph";
    let atTele=0;
    for(let i=0;i<40;i++){ pkBossUpdate(1/60); atTele=Math.max(atTele,BOSS.mawLean); }
    const teleLean=BOSS.mawLean;
    for(let i=0;i<60;i++) pkBossUpdate(1/60);
    const firing=BOSS.mawLean;
    // ...and it lets go once the beat is over
    BOSS.spawn.length=0; BOSS.telegraph="rain"; BOSS.ph="breath"; BOSS.breathT=99;
    for(let i=0;i<90;i++) pkBossUpdate(1/60);
    return {teleLean:+teleLean.toFixed(2), firing:+firing.toFixed(2), after:+BOSS.mawLean.toFixed(2)};
  });
  console.log('RAMP   ', JSON.stringify(ramp));
  ck(ramp.teleLean>0.5, 'he has not leaned in by the time the gun opens: '+ramp.teleLean);
  ck(ramp.firing>0.95, 'he is not fully leaned in while firing: '+ramp.firing);
  ck(ramp.after<0.05, 'he never straightens up again: '+ramp.after);

  /* ---------- 3. it is a machine gun ---------- */
  const gun = await pg.evaluate(()=>{
    const setup=window.__startMaw(3);
    // count at the SOURCE: splices shift indices, so diffing the array misses rounds
    const born=[]; const oadd=window.bossAdd;
    window.bossAdd=function(b){ if(b&&b.k==="maw") born.push({x:b.x, aim:b.vx, heavy:!!b.heavy, r:b.r});
      return oadd.apply(this,arguments); };
    let peak=0, trailPeak=0, flashes=0;
    for(let i=0;i<620;i++){
      PK.hp=PK.maxhp;
      pkBossUpdate(1/60);
      peak=Math.max(peak, BOSS.bullets.filter(x=>x.k==="maw").length);
      trailPeak=Math.max(trailPeak, BOSS.trail.length);
      if(BOSS.mawFlash>0.9) flashes++;
      if(BOSS.ph!=="pattern") break;
    }
    window.bossAdd=oadd;
    return {setup, rounds:born.length, peak, trailPeak, flashes,
            heavies:born.filter(b=>b.heavy).length,
            cap:BOSS_MAW_MAX, trailCap:BOSS_TRAIL_MAX,
            burst:BOSS_MAW_BURST, bursts:3,
            shotR:+BOSS_MAW_SHOT.toFixed(2), heavyR:+BOSS_MAW_R.toFixed(2),
            len:+BOSS.patternLen.toFixed(1)};
  });
  console.log('GUN    ', JSON.stringify(gun));
  ck(gun.setup.phase===3, 'the fight never reached phase three: '+JSON.stringify(gun.setup));
  ck(gun.setup.kinds.indexOf('maw')>=0, 'the beat that ran was not MAW: '+JSON.stringify(gun.setup));
  ck(gun.rounds>=28, 'that is not a machine gun: '+gun.rounds+' rounds in the whole beat');
  ck(gun.rounds<=gun.burst*gun.bursts+1, 'it fired more than its bursts allow: '+gun.rounds);
  ck(gun.heavies===1, 'phase three lost its punctuation shot: '+gun.heavies);
  ck(gun.shotR<gun.heavyR*0.55, 'the rounds are as heavy as the old single mouthful');
  ck(gun.peak<=gun.cap+1, 'the round ceiling was blown: '+gun.peak+' > '+gun.cap);
  ck(gun.trailPeak<=gun.trailCap, 'the ember budget was blown: '+gun.trailPeak);
  ck(gun.flashes>=20, 'the muzzle barely flashed: '+gun.flashes);

  // the barrel PANS: within a burst, successive rounds march across the board
  const pan = await pg.evaluate(()=>{
    window.__startMaw(2);
    const B=BOSS.box, hits=[]; const oadd=window.bossAdd;
    window.bossAdd=function(b){
      if(b&&b.k==="maw"){
        // where it is aimed: solve the same flight the spawner did
        const fall=(-b.vy+Math.sqrt(b.vy*b.vy+2*b.g*Math.max(40,B.h*0.55-b.y)))/b.g;
        hits.push(+(b.x+b.vx*fall).toFixed(1));
      }
      return oadd.apply(this,arguments);
    };
    for(let i=0;i<620 && BOSS.ph==="pattern";i++){ PK.hp=PK.maxhp; pkBossUpdate(1/60); }
    window.bossAdd=oadd;
    // split into bursts of BOSS_MAW_BURST and check each marches one way
    const bursts=[];
    for(let i=0;i<hits.length;i+=BOSS_MAW_BURST) bursts.push(hits.slice(i,i+BOSS_MAW_BURST));
    const spans=bursts.filter(b2=>b2.length>=5).map(b2=>{
      const dir=Math.sign(b2[b2.length-1]-b2[0]);
      let good=0; for(let i=1;i<b2.length;i++) if(Math.sign(b2[i]-b2[i-1])===dir) good++;
      return {span:+Math.abs(b2[b2.length-1]-b2[0]).toFixed(0), mono:good/(b2.length-1)};
    });
    return {n:hits.length, bursts:spans, w:Math.round(B.w)};
  });
  console.log('PAN    ', JSON.stringify(pan));
  ck(pan.bursts.length>=1, 'no burst was long enough to check the pan');
  ck(pan.bursts.every(b2=>b2.span>pan.w*0.5),
     'the gun does not sweep across the board: '+JSON.stringify(pan.bursts));
  ck(pan.bursts.every(b2=>b2.mono>=0.8),
     'the rounds do not march in one direction: '+JSON.stringify(pan.bursts));

  /* ---------- 4. and none of it is born inside the cage ---------- */
  const cage = await pg.evaluate(()=>{
    pkBossReset(); pkBossStart(); BOSS.introT=BOSS_INTRO; pkBossUpdate(0.016);
    const bad=[]; let n=0, hurtOut=0;
    const oadd=window.bossAdd;
    window.bossAdd=function(b){
      if(b && b.k){ n++; if(!bossOutside(b.x,b.y)) bad.push({k:b.k,x:Math.round(b.x),y:Math.round(b.y)}); }
      return oadd.apply(this,arguments);
    };
    for(const ph of [1,3]){
      BOSS.phase=ph;
      for(const kind of ["rain","sweepL","sweepR","ring","cross","surge","maw"]){
        pkBossFinishPattern(); BOSS.telegraph=kind; BOSS.telegraphT=0; pkBossBeginPattern();
        for(let i=0;i<420 && BOSS.ph==="pattern";i++){
          PK.hp=PK.maxhp;
          pkBossUpdate(1/60);
          const hp=PK.hp; 
          for(const b of BOSS.bullets) if(b.out && b.hurtMark) hurtOut++;
        }
      }
    }
    window.bossAdd=oadd;
    return {bad, badN:bad.length, spawned:n, alive:PK.active,
            box:{w:Math.round(BOSS.box.w),h:Math.round(BOSS.box.h)}};
  });
  console.log('CAGE   ', JSON.stringify(cage));
  ck(cage.box.w>0, 'the box was never sized, so this proves nothing');
  ck(cage.spawned>50, 'nothing spawned, so this proves nothing: '+cage.spawned);
  ck(cage.alive===true, 'the run died mid-audit, so the later patterns never ran');
  ck(cage.badN===0, 'something was born INSIDE the cage: '+JSON.stringify(cage.bad.slice(0,5)));

  /* ---------- 5. a burst is still cheap to draw ---------- */
  const cost = await pg.evaluate(()=>{
    window.__startMaw(3);
    /* Stop INSIDE a burst. The gun fires in bursts with a gap between them, so a fixed number of
       frames can easily land in the quiet and time an empty board. */
    let peak=0, live=0;
    for(let i=0;i<200;i++){
      PK.hp=PK.maxhp;
      pkBossUpdate(1/60);
      live=BOSS.bullets.filter(x=>x.k==="maw").length;
      peak=Math.max(peak,live);
      if(live>=12) break;
    }
    const setup2={ph:BOSS.ph, active:PK.active, kinds:BOSS.spawn.map(s=>s.kind)};
    const cv=document.querySelector('#bosscv'), ctx=cv.getContext('2d');
    let grads=0;
    const og=ctx.createRadialGradient.bind(ctx);
    ctx.createRadialGradient=function(){ grads++; return og.apply(ctx,arguments); };
    for(let i=0;i<20;i++) pkDrawBoss();
    grads=0;
    const t0=performance.now();
    for(let i=0;i<120;i++) pkDrawBoss();
    const ms=(performance.now()-t0)/120;
    ctx.createRadialGradient=og;
    return {setup2, maw:BOSS.bullets.filter(x=>x.k==="maw").length, peak,
            drawMs:+ms.toFixed(2), gradsPerFrame:+(grads/120).toFixed(1)};
  });
  console.log('COST   ', JSON.stringify(cost));
  ck(cost.maw>=12, 'the timing ran on a quiet board, so it proves nothing: '+cost.maw+' rounds up');
  ck(cost.drawMs<8, 'a full burst costs '+cost.drawMs+'ms a frame');
  ck(cost.gradsPerFrame<=14, 'a gradient per round per frame is back: '+cost.gradsPerFrame);

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL SCALE/MAW CHECKS PASS');
  await b.close();
})();
