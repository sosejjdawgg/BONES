const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.349a.html';
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

  /* ---------- 1. the fire birds ---------- */
  // Drive a sweep to saturation deterministically, then time the DRAW alone.
  const birds = await pg.evaluate(()=>{
    PK.plusMode=true; PK.bossDone=false; pkBossStart();
    BOSS.introT=BOSS_INTRO; pkBossUpdate(0.016);          // straight past the arrival
    BOSS.phase=3;
    /* SATURATION IS FORCED, and it has to be asked for explicitly now. v0.347a makes the four
       board-filling beats (BOSS_FILL, and sweepL is one) come in SPARSE, because the paws are the
       main stream and a full sweep on top of them leaves no lane. That is the fight working - but
       it means a sweep left to itself now peaks at five birds, and timing the renderer on five
       birds proves nothing about the forty it has to survive. The question here is whether the
       DRAW holds up at the cap, not whether the fight reaches it, so the thinning is switched off
       for the measurement and said so out loud. */
    const arm=()=>{ BOSS.telegraph="sweepL"; BOSS.telegraphT=0; pkBossBeginPattern();
                    for(const sp of BOSS.spawn) sp.sparse=false; };
    pkBossFinishPattern(); arm();
    let peak=0, trailPeak=0;
    for(let i=0;i<420;i++){                              // ~7s of fight at 60fps
      pkBossUpdate(1/60);
      peak=Math.max(peak, BOSS.bullets.filter(x=>x.k==="claw").length);
      trailPeak=Math.max(trailPeak, BOSS.trail.length);
      if(BOSS.ph!=="pattern") arm();
    }
    // ...and now time drawing that exact board
    const warm=20, runs=140;
    for(let i=0;i<warm;i++) pkDrawBoss();
    const t0=performance.now();
    for(let i=0;i<runs;i++) pkDrawBoss();
    const ms=(performance.now()-t0)/runs;
    return {claws:BOSS.bullets.filter(x=>x.k==="claw").length, peak, trailPeak,
            trail:BOSS.trail.length, pool:BOSS.trailPool.length,
            cap:BOSS_CLAW_MAX, trailCap:BOSS_TRAIL_MAX, drawMs:+ms.toFixed(2),
            cached:!!bossBirdFire()};
  });
  console.log('BIRDS  ', JSON.stringify(birds));
  ck(birds.cached===true, 'the burning-bird frames were never pre-rendered');
  ck(birds.peak<=birds.cap, 'the bird cap was exceeded: '+birds.peak+' > '+birds.cap);
  ck(birds.peak>8, 'the sweep never got busy, so this proves nothing: '+birds.peak);
  ck(birds.trailPeak<=birds.trailCap, 'the ember budget was exceeded: '+birds.trailPeak);
  ck(birds.drawMs<8, 'a saturated board still costs '+birds.drawMs+'ms to draw');

  // the expensive calls are gone from the per-frame path
  const calls = await pg.evaluate(()=>{
    const cv=document.querySelector('#bosscv'), ctx=cv.getContext('2d');
    let grads=0, filters=0, imgs=0;
    const og=ctx.createRadialGradient.bind(ctx);
    ctx.createRadialGradient=function(){ grads++; return og.apply(ctx,arguments); };
    const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx),'filter');
    Object.defineProperty(ctx,'filter',{configurable:true,
      get(){ return d.get.call(ctx); },
      set(v){ if(v && v!=="none") filters++; d.set.call(ctx,v); }});
    const odi=ctx.drawImage.bind(ctx);
    ctx.drawImage=function(){ imgs++; return odi.apply(ctx,arguments); };
    pkDrawBoss();
    ctx.createRadialGradient=og; delete ctx.filter; ctx.drawImage=odi;
    return {grads, filters, imgs, claws:BOSS.bullets.filter(x=>x.k==="claw").length};
  });
  console.log('CALLS  ', JSON.stringify(calls));
  ck(calls.filters<=6, 'still setting ctx.filter '+calls.filters+' times a frame with '+calls.claws+' birds');
  ck(calls.grads<=14, 'still building '+calls.grads+' gradients a frame');
  ck(calls.imgs>=calls.claws, 'the birds are not being blitted from the cache');

  /* ---------- 2. the cage is twice as long, and it crunches ---------- */
  const cage = await pg.evaluate(()=>{
    const sfx=[];
    const ob=window.beep, on=window.noiseBurst;
    window.beep=function(f,d){ sfx.push({f:Math.round(f)}); return ob.apply(this,arguments); };
    window.noiseBurst=function(){ sfx.push({n:1}); return on.apply(this,arguments); };
    pkBossReset(); pkBossStart();
    /* Let the intro clock run on its OWN dt. Stepping introT by hand while passing a token dt
       advances the wall clock without advancing the tick timer, which reads as a silent build
       when the build is in fact crunching seven times. */
    const marks={}, DT=1/120;
    const at=()=>+(BOSS.introT-BOSS_CAGE_A).toFixed(3);
    for(let i=0;i<900 && BOSS.ph==="intro";i++){
      const before=sfx.length;
      pkBossUpdate(DT);
      if(BOSS.cageSnap && marks.snap===undefined) marks.snap=at();
      if(BOSS.cageGrow && marks.grow===undefined) marks.grow=at();
      if(BOSS.cageLock && marks.lock===undefined){ marks.lock=at(); marks.lockSfx=sfx.length-before; }
    }
    window.beep=ob; window.noiseBurst=on;
    return {LEN:BOSS_CAGE_LEN, INTRO:BOSS_INTRO, CAGE_A:BOSS_CAGE_A, marks,
            ticks:BOSS.cageTickN, noises:sfx.filter(x=>x.n).length};
  });
  console.log('CAGE   ', JSON.stringify(cage));
  ck(cage.LEN===2.00, 'the cage was not doubled: '+cage.LEN);
  ck(cage.INTRO===cage.CAGE_A+cage.LEN, 'the intro no longer ends with the cage');
  ck(cage.marks.grow>=0.65 && cage.marks.grow<=0.76, 'the build is not ~0.70s: '+cage.marks.grow);
  ck(cage.marks.lock>=1.65 && cage.marks.lock<=1.76, 'the lock is not at ~1.70s: '+cage.marks.lock);
  // ...and it is genuinely double: the same beats at half these times would be the old cage
  ck(cage.marks.snap>=0.09 && cage.marks.snap<=0.12, 'the snap is not at ~0.10s: '+cage.marks.snap);
  ck(cage.ticks>=5, 'the build barely crunched: '+cage.ticks+' ticks');
  ck(cage.noises>=cage.ticks, 'the ticks carry no grit: '+cage.noises+' noise bursts');

  /* ---------- 3. an empty run at the hole ---------- */
  const rage = await pg.evaluate(async ()=>{
    pkBossReset(); PK.bossArmed=false; PK.bossDone=false; BOSS.active=false;
    document.querySelector('#bossPanel').classList.remove('show');
    PK.bones=0;                                   // not one bone in the run
    pkHolePlace(); pkHoleEnter();
    const o={opened:BURY.on, ph0:BURY.ph, pile:buryPile("offer")};
    // through the two setup lines
    for(let i=0;i<600 && BURY.ph==="talk"; i++) pkBuryUpdate(0.016);
    o.after=BURY.ph; o.taunt=BURY.bubTxt;
    const shakes=[]; let smashFire=0, dirtSeen=0;
    for(let i=0;i<400 && BURY.on; i++){
      pkBuryUpdate(0.016);
      shakes.push(+(BURY.shake||0).toFixed(2));
      smashFire=Math.max(smashFire, BURY.fire.length);
      dirtSeen=Math.max(dirtSeen, BURY.dirt.length);
    }
    o.closed=!BURY.on;
    o.panel=document.querySelector('#buryPanel').classList.contains('show');
    o.maxShake=Math.max(...shakes); o.fire=smashFire; o.dirt=dirtSeen;
    o.armed=PK.bossArmed; o.spent=BURY.spent;
    return o;
  });
  console.log('RAGE   ', JSON.stringify(rage));
  ck(rage.pile===0, 'the run was not actually empty: '+rage.pile);
  ck(rage.opened===true && rage.ph0==='talk', 'INVESTIGATE did not open the hole');
  ck(rage.after==='rage', 'an empty run fell through to the normal pour: '+rage.after);
  ck(/WITHOUT A SINGLE BONE/.test(rage.taunt||''), 'no taunt: '+rage.taunt);
  ck(rage.maxShake>0.9, 'the ground never trembled: '+rage.maxShake);
  ck(rage.fire>80, 'nothing came up out of the hole: '+rage.fire+' fire');
  ck(rage.dirt>30, 'the smash threw no earth: '+rage.dirt);
  ck(rage.closed===true && rage.panel===false, 'the burial never closed');
  ck(rage.armed===true, 'the smash did not wake Wolfie');
  ck(rage.spent===0, 'it somehow spent bones it did not have');

  // ...and a run WITH bones still pours as before
  const normal = await pg.evaluate(()=>{
    PK.bones=900; pkHolePlace(); pkHoleEnter();
    for(let i=0;i<600 && BURY.ph==="talk"; i++) pkBuryUpdate(0.016);
    const ph=BURY.ph; const on=BURY.on;
    BURY.on=false; document.querySelector('#buryPanel').classList.remove('show');
    return {ph, on};
  });
  console.log('NORMAL ', JSON.stringify(normal));
  ck(normal.ph==='hold', 'a run WITH bones no longer reaches the pour: '+normal.ph);

  /* ---------- 4. the charge stays under half, the wave is solid ----------
     Only the constants and the wave are checked here; the SHAPE of the charge (two sides, no arc
     stack) belongs to pvfx, which records against the apex and normalises the DPR transform. */
  const alpha = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const seen={charge:[], wave:[]};
    let mode=null;
    const os=ctx.stroke.bind(ctx);
    ctx.stroke=function(){ if(mode) seen[mode].push(+ctx.globalAlpha.toFixed(3)); return os(); };
    // the gauge, fully charged
    PK.barkBigLvl=2; PK.faceAng=0; PK.barkCd=0; PK.pulse=0; PK.en.length=0;
    mode='charge'; parkDraw(1.0); mode=null;
    // ...and the wave, on the frame it fires
    PK.pulse=0.35; PK.pulseAng=0;
    mode='wave'; parkDraw(1.0); mode=null;
    ctx.stroke=os;
    return {chargeMax:Math.max(...seen.charge), waveMax:Math.max(...seen.wave),
            cap:BARK_ARC_MAX, floor:BARK_SIDE_MIN,
            nCharge:seen.charge.length, nWave:seen.wave.length};
  });
  console.log('ALPHA  ', JSON.stringify(alpha));
  ck(alpha.cap===0.5, 'the gauge cap is not 50%: '+alpha.cap);
  ck(alpha.floor<alpha.cap, 'the idle floor is not below the ready cap: '+alpha.floor);
  ck(alpha.waveMax>0.95, 'the fired wave is not solid: '+alpha.waveMax);

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL PERF/CAGE/RAGE/ALPHA CHECKS PASS');
  await b.close();
})();
