const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.349a.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };

async function fresh(b){
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F);
  await pg.waitForTimeout(1400);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(900);
  return {pg,errs};
}

(async()=>{
  const b=await chromium.launch();

  /* ============ JOB C: the gate, the unlock, the panel states ============ */
  { const {pg,errs}=await fresh(b);
    const gate=await pg.evaluate(()=>{
      const out={};
      out.defaultLocked = S.hollowBeaten===false;
      // regular Dogpark must never queue him, even on wave 10
      S.lvl=30; startPark(false);
      PK.wave=10; PK.bossPending=false; PK.bossDone=false; PK.plusMode=false;
      PK.hole=null; PK.holePending=false;
      out.plainMode=PK.plusMode;
      return out;
    });
    await pg.waitForTimeout(1600);
    const g2=await pg.evaluate(()=>({pendingPlain:!!(PK.bossPending||PK.holePending||PK.hole), wave:PK.wave, plus:PK.plusMode}));
    // ...and Unleashed must. bossPending is set on the wave ADVANCE, so wave 10 has to be
    // arrived at rather than assigned - the real clear pipeline is the thing under test.
    await pg.evaluate(()=>{
      PK.plusMode=true; PK.bossDone=false; PK.bossPending=false; PK.hole=null; PK.holePending=false;
      PK.en.length=0; PK.wave=9; PK.waveT=0; PK.waveOutro=null;
      PK.waveQuota=pkWaveQuota(9); PK.waveSpawned=PK.waveQuota;
      PK.waveKills=PK.waveQuota; PK.apeKills=APE_WAVE_QUOTA;
    });
    await pg.waitForFunction(()=>PK.wave>=10||PK.holePending||PK.holeCine||BOSS.active,null,{timeout:40000}).catch(()=>{});
    for(let i=0;i<12;i++){
      await pg.evaluate(()=>{ if(PK.shop) PK.shop=false;
        if(PK.wave===10 && !PK.holePending && !PK.holeCine && !BOSS.active && !PK.bossDone){
          PK.waveKills=PK.waveQuota; PK.apeKills=APE_WAVE_QUOTA; PK.waveSpawned=PK.waveQuota; PK.en.length=0; } });
      await pg.waitForTimeout(500);
      if(await pg.evaluate(()=>!!(PK.holePending||PK.holeCine||BOSS.active))) break;
    }
    // wave 10 arms THE HOLE now, not the fight - the fight is what the hole leads to
    const g3=await pg.evaluate(()=>({pendingPlus:!!(PK.holePending||PK.holeCine||BOSS.active), wave10:PK.wave}));
    console.log('GATE   ', JSON.stringify({...gate,...g2,...g3}));
    ck(gate.defaultLocked, 'S.hollowBeaten does not default to false');
    ck(g2.pendingPlain===false, 'regular Dogpark queued WOLFIE/the hole on wave 10');
    ck(g3.pendingPlus===true, 'Unleashed wave 10 did NOT open the hole (wave '+g3.wave10+')');

    // burial refuses while locked, from both entry points
    const locked=await pg.evaluate(()=>{
      S.snacks=800; PK.bones=800;
      const before=BURY.on; pkBuryStart("home");
      return {opened:BURY.on, before, sub:burySubFor("home"), unlocked:buryUnlocked()};
    });
    console.log('LOCKED ', JSON.stringify(locked));
    ck(!locked.opened, 'burial opened while WOLFIE was still alive');
    ck(/WOLFIE/.test(locked.sub), 'locked exchange row does not say why: '+locked.sub);

    // killing him opens it, permanently, and across a generation
    const won=await pg.evaluate(async ()=>{
      PK.bossDone=false; pkBossStart();
      await new Promise(r=>setTimeout(r,300));
      BOSS.hp=0; pkBossKill();
      await new Promise(r=>setTimeout(r,300));
      const afterKill=S.hollowBeaten;
      const genBefore=S.gen; S.gen++; S.lvl=1; S.xp=0;      // the generation reset's own fields
      return {afterKill, keptAcrossGen:S.hollowBeaten, unlocked:buryUnlocked()};
    });
    console.log('WON    ', JSON.stringify(won));
    ck(won.afterKill===true, 'beating WOLFIE did not set S.hollowBeaten');
    ck(won.keptAcrossGen===true, 'the unlock did not survive a new generation');
    console.log('ERRORS:', errs.length?errs:'none');
    ck(errs.length===0, 'gate page errors: '+errs.join(';'));
    await pg.close();
  }

  /* ============ JOB C: layers, cash-in, the red hole ============ */
  { const {pg,errs}=await fresh(b);
    const pile=await pg.evaluate(async ()=>{
      S.hollowBeaten=true; S.snacks=20000;
      pkBuryStart("home");
      const o={opened:BURY.on, step:BURY_PILE_STEP, max:BURY_PILE_MAX};
      // drive the pile straight, without waiting on the hold loop's real cadence
      BURY.ph="hold";
      const layersAt=[];
      let burned=0, fireSeen=0, moundsSeen=0;
      for(let i=0;i<80;i++){
        // same gate the real drop loop uses: nothing is added while the hole is burning
        if(BURY.burnT<=0){
          BURY.pileBones+=BURY_PILE_STEP;               // one whole layer per step
          if(BURY.pileBones>=BURY_PILE_STEP*BURY_PILE_MAX){ pkBuryCashIn(); burned++; }
        }
        layersAt.push(Math.floor(BURY.pileBones/BURY_PILE_STEP));
        fireSeen=Math.max(fireSeen,BURY.fire.length);
        await new Promise(r=>setTimeout(r,60));
        moundsSeen=Math.max(moundsSeen,BURY.mounds);
      }
      return {...o, burned, fireSeen, moundsSeen, maxLayerSeen:Math.max(...layersAt),
              nowLayers:Math.floor(BURY.pileBones/BURY_PILE_STEP), fireLeft:BURY.fire.length};
    });
    console.log('PILE   ', JSON.stringify(pile));
    ck(pile.step===300, 'BURY_PILE_STEP is '+pile.step+', want 300');
    ck(pile.opened, 'burial would not open once unlocked');
    ck(pile.burned>=3, 'only '+pile.burned+' cash-ins in 80 layers');
    ck(pile.fireSeen>50, 'the cash-in threw no flame ('+pile.fireSeen+')');
    ck(pile.moundsSeen>=3, 'mounds counter did not advance ('+pile.moundsSeen+')');
    ck(pile.maxLayerSeen<=pile.max, 'the pile went past full ('+pile.maxLayerSeen+' > '+pile.max+')');
    ck(pile.nowLayers<pile.max, 'the mound did not restart empty after burning');
    ck(pile.maxLayerSeen>=pile.max-1, 'the pile never got near full ('+pile.maxLayerSeen+')');

    // a real held burial: the XP still lands and it still finishes
    const real=await pg.evaluate(async ()=>{
      BURY.on=false; document.querySelector('#buryPanel').classList.remove('show');
      /* LEVEL 12, NOT 6. Under v0.348a's percentage rate 900 bones is about four levels at any
         level, and from 6 that runs straight through 10 - which is a STAGE, so the burial
         correctly stops and hands the screen to a growth spurt, and this test sat waiting for a
         panel it never dismissed and reported that the burial never closed. Starting at 12 the
         same 900 bones buys the same four levels without crossing 5, 10, 25 or 99, so what is
         under test here stays the burial rather than the ceremony. pevo owns the ceremony. */
      S.snacks=900; S.lvl=12; S.xp=0;
      const lvl0=S.lvl, xp0=S.xp, need0=xpNeed(S.lvl);
      const rate0=buryXPPerShovel();
      pkBuryStart("home");
      BURY.held=true;
      await new Promise(r=>setTimeout(r,9000));
      const mid={spent:BURY.spent, lvl:S.lvl, layers:Math.floor(BURY.pileBones/BURY_PILE_STEP)};
      BURY.held=false;
      await new Promise(r=>setTimeout(r,6000));
      return {lvl0, xp0, need0:+need0.toFixed(1), rate0:+rate0.toFixed(2),
              ...mid, xp:+S.xp.toFixed(1), lvls:BURY.levels, done:!BURY.on, snacks:S.snacks,
              paid:Math.round(BURY.paid||0),
              panel:document.querySelector('#buryPanel').classList.contains('show')};
    });
    console.log('REAL   ', JSON.stringify(real));
    ck(real.spent>0, 'a held burial buried nothing');
    /* THE RATE, RE-PINNED. This used to read `xp >= spent*2 - 2`, which was the flat two-XP
       shovel v0.348a replaced; it would now pass on anything at all, since a shovel at level 12
       is worth seventeen. The check is the RULE instead of a number: a shovel pays five percent
       of the level it was dug at, so the total paid is at least the shovels times that - and
       strictly more, because a burial that levels re-bases onto the next level's bigger
       requirement as it goes. */
    ck(Math.abs(real.rate0-real.need0*0.05)<0.01,
       'a shovel is not 5% of the level: '+real.rate0+' against '+real.need0);
    ck(real.paid>=Math.round(real.spent*real.rate0)-2,
       'XP did not track the shovels ('+real.paid+' from '+real.spent+' at '+real.rate0+' each)');
    ck(real.lvls>=2, 'a 900-bone burial bought only '+real.lvls+' levels - the rate is not paying out');
    ck(real.snacks<900, 'treats were not spent');
    ck(real.done && !real.panel, 'the burial never closed');
    await pg.evaluate(()=>{ BURY.on=false; document.querySelector('#buryPanel').classList.remove('show'); });
    console.log('ERRORS:', errs.length?errs:'none');
    ck(errs.length===0, 'pile page errors: '+errs.join(';'));
    await pg.close();
  }

  /* ============ JOB C: the three wallet states ============ */
  { const {pg,errs}=await fresh(b);
    const st=async (snacks,beaten)=>await pg.evaluate(([sn,bt])=>{
      S.snacks=sn; S.hollowBeaten=bt;
      document.querySelectorAll('.show').forEach(n=>n.classList.remove('show'));
      document.querySelector('#bonesRow').click();
      const p=document.querySelector('#choice')||document.querySelector('#choicePanel');
      const txt=(p?p.innerText:document.body.innerText);
      const btns=[...document.querySelectorAll('#choice button, #choicePanel button')].map(x=>x.textContent.trim());
      return {btns, has:{lock:/UNLOCKS AT|UNLOCK UNLEASHED|\u{1f512}/u.test(txt),
                          unleashed:/DOGPARK UNLEASHED/.test(txt),
                          bury:/HOLD TO BURY/.test(txt)}};
    },[snacks,beaten]);
    const a=await st(100,false);   console.log('W-LOCK ', JSON.stringify(a));
    const c=await st(9000,false);  console.log('W-ADV  ', JSON.stringify(c));
    const d=await st(9000,true);   console.log('W-BURY ', JSON.stringify(d));
    ck(a.btns.some(x=>/BURY FOR XP/.test(x)) && a.has.lock, 'locked wallet state wrong');
    ck(c.btns.some(x=>/DOGPARK UNLEASHED/.test(x)), 'advise state does not offer Unleashed');
    ck(d.btns.some(x=>/HOLD TO BURY/.test(x)), 'unlocked state does not offer the ceremony');
    console.log('ERRORS:', errs.length?errs:'none');
    ck(errs.length===0, 'wallet page errors: '+errs.join(';'));
    await pg.close();
  }

  /* ============ JOB B: Lovey Dovey 2.0 ============ */
  { const {pg,errs}=await fresh(b);
    await pg.evaluate(()=>{ S.lvl=30; startPark(true); });
    await pg.waitForTimeout(2500);
    // Build our OWN test enemies with the game's own constructor. Hunting for one in PK.en is
    // a coin flip: wave 1 is roosting birds, which are deliberately not charmable, so the test
    // was measuring the wave it happened to land in rather than the brush.
    await pg.evaluate(()=>{
      window.__mk=(dx,dy)=>pkEnMake({t:"sq", x:(PK.x+dx+PK.WW)%PK.WW, y:(PK.y+dy+PK.WH)%PK.WH,
        hp:9999, hpMax:9999, sp:70, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
    });

    const t1=await pg.evaluate(()=>{ pkLoveSpawn();
      return {nodes:PK.loveTrail.nodes.length, tune:LOVE_TUNE.length, brushR:LOVE_BRUSH_R, modeT:LOVE_MODE_T}; });
    console.log('LOVE-C ', JSON.stringify(t1));
    ck(t1.nodes===7, 'trail is '+t1.nodes+' hearts, want 7');
    ck(t1.modeT===15, 'mode is '+t1.modeT+'s, want 15');

    /* WALKED IN ONE GO, IN THE PAGE. This used to teleport onto each node and then wait on the
       browser for `next` to advance - seven Playwright round-trips, each polling at 50ms, all of
       them racing LOVE_LIFE's 22-second fuse. On a loaded machine the walk lost that race, the
       trail expired mid-way, and six assertions downstream failed for a reason that had nothing to
       do with what they were testing (~1 run in 3). The collection itself is still the REAL one:
       pkLoveTick is the function the park loop calls, driven here at the same dt, with the ground
       check (PK.z) honoured - only the transport between hearts is instant now. */
    await pg.evaluate(()=>{
      for(let i=0;i<7 && PK.loveTrail;i++){
        const nd=PK.loveTrail.nodes[PK.loveTrail.next]; if(!nd) break;
        PK.x=nd.x; PK.y=nd.y; PK.z=0;
        for(let k=0;k<4 && PK.loveTrail && PK.loveTrail.next===i;k++) pkLoveTick(1/60);
      }
    });
    const act=await pg.evaluate(()=>({mode:!!PK.loveMode,
      pink:!!(PK.loveMode&&PK.loveMode.pink), trail:!!PK.loveTrail}));
    console.log('LOVE-A ', JSON.stringify(act));
    ck(act.mode && act.pink && !act.trail, 'the seventh heart did not activate the mode');

    // THE BRUSH: one enemy pinned ON him, one pinned well clear of him
    await pg.evaluate(()=>{
      window.__near=window.__mk(5,3);
      window.__far =window.__mk(140,0);
      window.__pin=()=>{
        PK.hp=PK.maxhp;                                   // nobody is driving; nobody may die
        // parkUpdate returns early on ANY open panel, and a cleared wave opens the shop - which
        // freezes the love tick and made this read as "the brush stopped working"
        PK.shop=false; PK.convertOpen=false; PK.friendsOpen=false; PK.waveOutro=null;
        PK.waveKills=0; PK.waveSpawned=999999; PK.waveQuota=999999;

        if(PK.loveMode) PK.loveMode.t=Math.max(PK.loveMode.t,8);
        const n=window.__near, f=window.__far;
        if(n){ n.hp=9999; if(!n.love){ n.x=PK.x+5; n.y=PK.y+3; } }
        if(f){ f.hp=9999; f.x=(PK.x+140)%PK.WW; f.y=PK.y; }
        requestAnimationFrame(window.__pin);
      };
      requestAnimationFrame(window.__pin);
    });
    await pg.waitForFunction(()=>window.__near&&window.__near.love,null,
                             {timeout:20000, polling:60}).catch(()=>{});
    await pg.waitForTimeout(3000);
    const brush=await pg.evaluate(()=>({
      converted:!!(window.__near&&window.__near.love),
      farTaken:!!(window.__far&&window.__far.love),
      apeProtected:!pkLoveCanCharm({x:PK.x,y:PK.y,love:false,fleeing:false,boss:true,hp:9}),
      flash:!!(window.__near&&window.__near.loveFlash!==undefined),
      love:PK.en.filter(x=>x.love).length }));
    console.log('LOVE-B ', JSON.stringify(brush));
    ck(brush.converted===true, 'the brush did not convert on contact');
    ck(brush.farTaken===false, 'the brush reached an enemy 140px away');
    ck(brush.apeProtected===true, 'the wave-objective ape can be charmed');

    // THE SCUFFLE: hold the charmed one and a stranger in contact and watch both sides marked
    await pg.evaluate(()=>{
      window.__pin=()=>{};
      window.__fx={clash:0,hearts:0,pulses:0,pink:0};
      window.__brawl=()=>{
        PK.hp=PK.maxhp;
        // parkUpdate returns early on ANY open panel, and a cleared wave opens the shop - which
        // freezes the love tick and made this read as "the brush stopped working"
        PK.shop=false; PK.convertOpen=false; PK.friendsOpen=false; PK.waveOutro=null;
        PK.waveKills=0; PK.waveSpawned=999999; PK.waveQuota=999999;
        if(PK.loveMode) PK.loveMode.t=Math.max(PK.loveMode.t,8);
        const l=window.__near, u=window.__far;
        if(l&&u){ l.hp=9999; u.hp=9999; u.love=false;
                  u.x=(l.x+8)%PK.WW; u.y=l.y; l.loveTgt=u; }
        const F=window.__fx;
        if(HITFX.some(f=>f.clash)) F.clash++;
        F.hearts=Math.max(F.hearts,SPARKS.filter(s=>s.heart).length);
        F.pulses=Math.max(F.pulses,PK.en.filter(e=>e.lovePulse>0).length);
        F.pink=Math.max(F.pink,SPARKS.filter(s=>s.love).length);
        requestAnimationFrame(window.__brawl);
      };
      requestAnimationFrame(window.__brawl);
    });
    await pg.waitForTimeout(9000);
    const fight=await pg.evaluate(()=>({...window.__fx,
      scuffles:PK.loveMode?(PK.loveMode.scuffle||0):0, love:PK.en.filter(e=>e.love).length,
      why:{active:PK.active, shop:PK.shop, boss:bossOn(), mode:!!PK.loveMode,
           tgt:!!(window.__near&&window.__near.loveTgt)}}));
    console.log('LOVE-F ', JSON.stringify(fight));
    await pg.screenshot({path:'v_love.png'});
    ck(fight.pink>0, 'no pink sparks anywhere');
    ck(fight.clash>0, 'no clash mark on a love-vs-stranger hit');
    ck(fight.pulses>0, 'the lover never pulsed pink');
    ck(fight.hearts>0, 'no hearts thrown off the scuffle');

    /* OUTWARD BIAS. Two candidates equidistant from the LOVER, at different distances from
       BONES, both inside the 180px clamp. Read in ONE tick with the grid blanked, because the
       moment a frame passes the ordinary enemy AI walks the stand-ins somewhere else - which is
       exactly what made the previous attempt read 15px and 148px instead of 50 and 50. */
    const bias=await pg.evaluate(()=>{
      window.__brawl=()=>{};
      const keep=PK.en.slice();
      const mk=(dx,dy,love)=>({x:(PK.x+dx+PK.WW)%PK.WW, y:(PK.y+dy+PK.WH)%PK.WH, love,
                               fleeing:false, hp:9999, sp:70, ft:0, fi:0, dir:1, t:"sq", loveTgt:null});
      const L=mk(60,0,true), near=mk(10,0,false), far=mk(110,0,false);
      PK.en.length=0; PK.en.push(L,near,far);
      const d=(a,c)=>Math.round(Math.hypot(wd(a.x-c.x,PK.WW),wd(a.y-c.y,PK.WH)));
      const pre={dNear:d(near,L), dFar:d(far,L), awayNear:d(near,PK), awayFar:d(far,PK)};
      ENG=null;                              // force pkEnemiesNear's straight-scan fallback
      pkLoveEnemyTick(L,0.016,PK.WW,PK.WH);  // ...which also STEPS the lover, so measure first
      const chose = L.loveTgt===far?"far" : L.loveTgt===near?"near" : L.loveTgt?"other":"none";
      const out={chose, ...pre};
      PK.en.length=0; for(const e of keep) PK.en.push(e);
      return out;
    });
    console.log('LOVE-X ', JSON.stringify(bias));
    ck(bias.dNear===bias.dFar, 'the bias test candidates are not equidistant from the lover');
    ck(bias.chose==="far", 'no outward bias: it chose the '+bias.chose+' target');

    /* MODE END: the friends STAY (v0.316a). The mode governed only whether new enemies turn;
       the ones already pink keep their doubled health and keep fighting until killed or cleared.
       The keep-alive below pins waveSpawned/Quota apart so the all-pink send-off cannot fire and
       take them away for a different reason. */
    await pg.evaluate(()=>{ window.__pin=()=>{}; window.__brawl=()=>{}; });
    await pg.waitForTimeout(1500);                 // let both self-scheduling chains unwind
    await pg.evaluate(()=>{
      PK.hp=PK.maxhp;
      if(!PK.active){ S.lvl=30; startPark(true); }
      window.__keepAlive=()=>{
        PK.hp=PK.maxhp; PK.shop=false; PK.convertOpen=false; PK.friendsOpen=false;
        PK.waveOutro=null; PK.waveKills=0; PK.waveSpawned=999999; PK.waveQuota=999999;
        if(window.__ka) requestAnimationFrame(window.__keepAlive);
      };
      window.__ka=true; requestAnimationFrame(window.__keepAlive);
      PK.loveMode={t:0.6, pink:true, scuffle:0};
      for(const e of PK.en.slice(0,3)) if(!e.boss){ e.love=true; e.loveTgt=null; }
    });
    await pg.waitForFunction(()=>PK.loveMode===null,null,{timeout:25000,polling:60}).catch(()=>{});
    const end=await pg.evaluate(()=>{ window.__ka=false;
      return {mode:PK.loveMode, love:PK.en.filter(e=>e.love).length,
              tgt:PK.en.filter(e=>e.loveTgt).length,
              why:{active:PK.active, shop:PK.shop, boss:bossOn(), bury:BURY.on, outro:!!PK.waveOutro}}; });
    console.log('LOVE-E ', JSON.stringify(end));
    ck(end.mode===null, 'the mode did not clear: '+JSON.stringify(end.mode));
    // at least the three charmed here - earlier blocks in this suite charmed some too, and now
    // that love outlives the mode those survive across blocks as well
    ck(end.love>=3, 'the pink was stripped when the mode ended: '+end.love+' left');
    console.log('ERRORS:', errs.length?errs:'none');
    ck(errs.length===0, 'love page errors: '+errs.join(';'));
    await pg.close();
  }

  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL CHECKS PASS');
  await b.close();
  /* AND IT HAS TO SAY SO IN ITS EXIT CODE. This suite printed FAILS and then exited 0, so a run
     that reported six failures looked identical to a clean one from outside - which is exactly how
     a battery driven by exit codes misses a regression. Every other suite here already does this;
     this one was the odd one out. */
  if(fails.length) process.exit(1);
})();
