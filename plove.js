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
  await pg.evaluate(()=>{ S.lvl=30; startPark(true); });
  await pg.waitForTimeout(1800);
  /* pkEnemiesNear reads a spatial grid that parkUpdate rebuilds EVERY frame. Driving the love
     tick by hand without rebuilding it leaves the grid holding enemies from the live run that are
     no longer in PK.en - the allies then chase a ghost off across the park, scuffling with an
     object nothing else can see. Rebuild it on every step, exactly as the game does. */
  await pg.evaluate(()=>{ window.__step=(dt,extra)=>{
    pkBuildEnGrid(PK.WW,PK.WH);
    pkLoveTick(dt);
    if(extra) for(const e of extra){ pkBuildEnGrid(PK.WW,PK.WH); pkLoveEnemyTick(e,dt,PK.WW,PK.WH); }
  }; });
  await pg.evaluate(()=>{ window.__mk=(dx,dy,hp)=>pkEnMake({t:"sq",
      x:(PK.x+dx+PK.WW)%PK.WW, y:(PK.y+dy+PK.WH)%PK.WH,
      hp:hp||6, hpMax:hp||6, sp:0, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0}); });

  /* ---------- 1. HP doubles exactly once ---------- */
  const hp = await pg.evaluate(()=>{
    PK.en.length=0; PK.loveMode=null; PK.loveTrail=null;
    const e=window.__mk(200,0,7);
    const before={hp:e.hp, max:e.hpMax};
    pkLoveTake(e);
    const once={hp:e.hp, max:e.hpMax, love:!!e.love, latch:!!e.loveHp};
    pkLoveTake(e);                       // re-applied: must NOT double again
    e.love=false; pkLoveTake(e);         // ...nor if the flag itself is re-asserted
    const twice={hp:e.hp, max:e.hpMax, love:!!e.love};
    return {before, once, twice};
  });
  console.log('HP     ', JSON.stringify(hp));
  ck(hp.once.hp===hp.before.hp*2 && hp.once.max===hp.before.max*2,
     'convert did not double HP: '+JSON.stringify(hp));
  ck(hp.once.love===true && hp.once.latch===true, 'the convert did not take');
  ck(hp.twice.hp===hp.once.hp && hp.twice.max===hp.once.max,
     'HP doubled more than once: '+JSON.stringify(hp.twice));

  /* ---------- 2. pink survives the mode ending ---------- */
  const persist = await pg.evaluate(async ()=>{
    PK.en.length=0; PK.loveTrail=null;
    const a=window.__mk(200,0,6), c=window.__mk(210,10,6);
    pkLoveActivate();                    // opens the mode; these two are out of burst range
    pkLoveTake(a); pkLoveTake(c);
    const during={mode:!!PK.loveMode, aLove:!!a.love, cLove:!!c.love, dogPink:!!PK.loveMode};
    /* ...and a fresh enemy to make sure the wave is not "all pink" (that path is tested below).
       It has to be within the ally's target search radius or the ally never acquires one at all -
       at 440px away this proved nothing except that the search has a range. */
    const foe=window.__mk(206,0,999);
    PK.waveSpawned=0; PK.waveQuota=99;   // quota not exhausted, so no send-off
    PK.loveMode.t=0.01;
    for(let i=0;i<20;i++) window.__step(1/60);
    const after={mode:!!PK.loveMode, aLove:!!a.love, cLove:!!c.love,
                 aHp:a.hp, tgt:!!a.loveTgt};
    // they keep fighting after the mode: run the ally tick and watch the foe take damage
    const foeHp0=foe.hp;
    for(let i=0;i<400;i++) window.__step(1/60,[a]);
    return {during, after, fought:foe.hp<foeHp0, foeHp0, foeHp:foe.hp, mode:!!PK.loveMode};
  });
  console.log('PERSIST', JSON.stringify(persist));
  ck(persist.during.mode===true && persist.during.aLove===true, 'the convert never happened');
  ck(persist.after.mode===false, 'the mode never ended');
  ck(persist.after.aLove===true && persist.after.cLove===true,
     'the pink was stripped when the mode ended: '+JSON.stringify(persist.after));
  ck(persist.fought===true, 'a surviving ally stopped fighting once the mode ended: foe at '
     +persist.foeHp+' of '+persist.foeHp0);

  /* ---------- 3. they never turn on BONES ---------- */
  const loyal = await pg.evaluate(()=>{
    PK.en.length=0; PK.loveMode=null;
    const a=window.__mk(30,0,6);
    pkLoveTake(a);
    const hp0=PK.hp;
    PK.waveSpawned=0; PK.waveQuota=99;
    for(let i=0;i<600;i++){ PK.loveMode=null; window.__step(1/60,[a]); }
    return {hurt:PK.hp<hp0, tgt:a.loveTgt===null, love:!!a.love};
  });
  console.log('LOYAL  ', JSON.stringify(loyal));
  ck(loyal.hurt===false, 'a persisting ally attacked BONES');
  ck(loyal.love===true, 'the ally stopped being pink on its own');

  /* ---------- 4. an all-pink wave still finishes ---------- */
  const stall = await pg.evaluate(()=>{
    PK.en.length=0; PK.loveMode=null; PK.waveOutro=null;
    const kills0=PK.waveKills||0;
    for(let i=0;i<4;i++) pkLoveTake(window.__mk(60+i*20,0,6));
    PK.waveSpawned=20; PK.waveQuota=20;      // everything this wave will ever spawn HAS spawned
    let ticks=0;
    for(let i=0;i<600;i++){ window.__step(1/60); ticks++;
      if(PK.en.every(e=>e.fleeing)) break; }
    return {sendoff:LOVE_SENDOFF, secs:+(ticks/60).toFixed(2),
            fleeing:PK.en.filter(e=>e.fleeing).length,
            credited:(PK.waveKills||0)-kills0, drops:PK.drops.length};
  });
  console.log('STALL  ', JSON.stringify(stall));
  ck(stall.fleeing===4, 'the all-pink wave never cleared itself: '+stall.fleeing);
  ck(stall.credited===4, 'the send-off did not credit the wave: '+stall.credited+' kills');
  ck(stall.secs>=stall.sendoff && stall.secs<stall.sendoff+1.0,
     'the send-off fired at the wrong time: '+stall.secs+'s');

  // ...and it does NOT fire while there is still something to fight
  const nostall = await pg.evaluate(()=>{
    PK.en.length=0; PK.loveMode=null; PK.waveOutro=null;
    for(let i=0;i<3;i++) pkLoveTake(window.__mk(60+i*20,0,6));
    window.__mk(-200,0,999);                  // one un-charmed enemy left alive
    PK.waveSpawned=20; PK.waveQuota=20;
    for(let i=0;i<600;i++) window.__step(1/60);
    return {fleeing:PK.en.filter(e=>e.fleeing).length, allies:PK.en.filter(e=>e.love).length};
  });
  console.log('NOSEND ', JSON.stringify(nostall));
  ck(nostall.fleeing===0, 'the friends were sent off while a foe was still standing');
  ck(nostall.allies===3, 'the allies were lost some other way');

  /* ---------- 5. exclusions still hold ---------- */
  const excl = await pg.evaluate(()=>{
    PK.en.length=0; PK.loveMode=null;
    const boss=window.__mk(20,0,50); boss.boss=true;
    const roost=window.__mk(24,0,10); roost.roost={killed:0};
    const decor=window.__mk(26,0,10); decor.decor=true;
    const took=[pkLoveTake(boss), pkLoveTake(roost), pkLoveTake(decor)];
    return {took, hp:[boss.hp, roost.hp, decor.hp], love:[!!boss.love,!!roost.love,!!decor.love]};
  });
  console.log('EXCL   ', JSON.stringify(excl));
  ck(excl.took.every(x=>x===false), 'an excluded enemy was charmed: '+JSON.stringify(excl.took));
  ck(excl.love.every(x=>x===false), 'an excluded enemy went pink');
  ck(excl.hp[0]===50, 'an excluded enemy still had its HP doubled');

  /* ---------- 6. the scuffle FX survive the mode ---------- */
  const fx = await pg.evaluate(()=>{
    PK.en.length=0; PK.loveMode=null; SPARKS.length=0; HITFX.length=0;
    const a=window.__mk(0,0,6); pkLoveTake(a);
    const foe=window.__mk(6,0,999);
    PK.waveSpawned=0; PK.waveQuota=99;
    let clash=0;
    for(let i=0;i<300;i++){
      const n=HITFX.length;
      window.__step(1/60,[a]);
      if(HITFX.length>n) clash++;
    }
    return {clash, mode:!!PK.loveMode, budget:PK.loveScuffle, foeHurt:foe.hp<999};
  });
  console.log('FX     ', JSON.stringify(fx));
  ck(fx.mode===false, 'the mode was somehow running');
  ck(fx.foeHurt===true, 'no fighting happened at all');
  ck(fx.clash>0, 'the scuffle went silent once the mode ended: '+fx.clash);

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL LOVE CHECKS PASS');
  await b.close();
})();
