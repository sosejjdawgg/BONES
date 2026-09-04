/* ONE THING AT A TIME.
   Levels 5, 10, 25 and 99 each raise a ceremony 0.7s after you tap the XP bar, and the tap also
   used to start a FIVE SECOND dance. So the two ran on top of each other: the shrink/grow flicker
   - the only moment in the game where you actually watch him get bigger - played on a dog who was
   simultaneously hopping on the spot at PARTY_SIDE, with the stage panel over the top of both,
   and the skill tree arriving over that. Nobody could have told you the evolution was fine.
   This suite pins the ORDER: flicker, then panel, then celebration, then the tree - and pins that
   each one is given room rather than being merely sequenced by a millisecond. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
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

  /* Put the game exactly where it is when the bug bites: level 10 banked and waiting in the bar,
     the stage queued behind it, and the bar ready for the tap that confers it. */
  const arm = (lvl)=>pg.evaluate((L)=>{
    PARTY.on=false; EVO.active=false; EVO.after=null; XPLOCK=false;
    XPANIM.danceOwed=false; XPANIM.pauseT=0; XPANIM.parts.length=0;
    document.getElementById('evoPanel').classList.remove('show');
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    S.lvl=L; S.xp=0; S.pts=0; S.pendingStage.length=0; S.pendingStage.push(L);
    XPANIM.lvl=L-1; XPANIM.frac=1; XPANIM.ready=true;
  }, lvl);

  const snap = ()=>pg.evaluate(()=>({
    party:PARTY.on, evo:EVO.active, panel:document.getElementById('evoPanel').classList.contains('show'),
    tree:document.getElementById('skillPanel').classList.contains('show'),
    owed:XPANIM.danceOwed, lvl:XPANIM.lvl, pts:S.pts
  }));

  /* ---------- 1. LEVEL 10: the flicker gets the screen to itself ---------- */
  await arm(10);
  await pg.evaluate(()=>xpLevelTap());
  const t0 = await snap();
  console.log('TAP10 ', JSON.stringify(t0));
  ck(t0.party===false,
     'the dance started on the tap - it is on top of the evolution again');
  ck(t0.owed===true, 'the dance was skipped but never marked owed, so he never gets it');

  // 1.2s in: the level is conferred and the flicker is running, alone
  await pg.waitForTimeout(1200);
  const t1 = await snap();
  console.log('FLICK ', JSON.stringify(t1));
  ck(t1.evo===true, 'the shrink/grow flicker is not running 1.2s after the tap: '+JSON.stringify(t1));
  ck(t1.panel===false, 'the stage panel is already up over the flicker');
  ck(t1.party===false, 'he is dancing underneath the flicker');
  ck(t1.tree===false, 'the skill tree is up over the flicker');
  ck(t1.lvl===10, 'the level was not conferred: '+t1.lvl);

  /* ...and it plays for its full length. In v0.351a "its full length" stopped being 3.9 seconds
     of flicker and became the six-beat Pokemon sequence, so this no longer counts a bare minimum
     of frames - it rides the whole thing out and pins that every beat was reached in order and
     that the world was genuinely stopped underneath it. The old ">=1.5s of something" assertion
     would still pass on a sequence that skipped straight from hush to cheer. */
  const held = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const hunger0=S.hunger, day0=CLK.day+CLK.h;
    let frames=0; const seen=[]; let lastPh=''; let froze=true;
    for(let i=0;i<150;i++){
      await sleep(100);
      if(!EVO.active) break;
      frames++;
      // sampled INSIDE the window: read after the loop and the ceremony has already ended, so
      // up to a frame of ordinary ticking has run and the test measures its own timing
      if(S.hunger!==hunger0 || (CLK.day+CLK.h)!==day0) froze=false;
      const ph=evoAt(EVO.t).ph;
      if(ph!==lastPh){ seen.push(ph); lastPh=ph; }
    }
    return {frames, t:+EVO.t.toFixed(2), end:+EVO.end.toFixed(2), seen, froze};
  });
  console.log('HELD  ', JSON.stringify(held));
  ck(held.frames>=55, 'the sequence was over after only ~'+(held.frames*100)+'ms');
  ck(held.t>=held.end-0.6, 'it ended early at t='+held.t+' of '+held.end);
  // every beat, in order, and none of them skipped
  ck(JSON.stringify(held.seen)===JSON.stringify(['hush','rays','morph','burst','reveal','cheer']),
     'the sequence did not pass through its six beats in order: '+JSON.stringify(held.seen));
  // THE WORLD STOPS. Needs draining or the clock ticking under the ceremony is the whole
  // complaint the sequence was written to answer.
  ck(held.froze===true, 'the room kept running underneath the evolution');

  /* ...and the panel arrives AFTER it, not with it. Generous, because EVO.t is advanced by the
     frame's own dt and runs a little behind the wall clock - the question here is ORDER, and a
     harness that measures order with a stopwatch set to the exact expected duration is measuring
     its own patience instead. */
  await pg.waitForTimeout(1400);
  const t2 = await snap();
  console.log('PANEL ', JSON.stringify(t2));
  ck(t2.evo===false, 'the flicker never ended');
  ck(t2.panel===true, 'the stage panel never came up after the flicker: '+JSON.stringify(t2));
  ck(t2.party===false, 'he is dancing behind the stage panel');
  ck(t2.tree===false, 'the skill tree is up over the stage panel');

  /* ---------- 2. ...and the celebration is what happens when you dismiss it ---------- */
  await pg.click('#evoGo');
  await pg.waitForTimeout(900);
  const t3 = await snap();
  console.log('DANCE ', JSON.stringify(t3));
  ck(t3.panel===false, 'CONTINUE did not close the stage panel');
  ck(t3.party===true, 'he never got his celebration: '+JSON.stringify(t3));
  ck(t3.owed===false, 'the owed dance was paid but the flag is still set - he will dance twice');

  // ...and the tree follows into the dance, exactly as it does for a plain level
  await pg.waitForTimeout(900);
  const t4 = await snap();
  console.log('TREE  ', JSON.stringify(t4));
  ck(t4.tree===true, 'the skill point was conferred and the tree was never offered at all');
  ck(t4.pts>=1, 'no skill point was conferred by the level: '+t4.pts);

  await pg.evaluate(()=>{ document.getElementById('skillPanel').classList.remove('show');
                          PARTY.on=false; });

  /* ---------- 3. LEVEL 5 has no flicker, so the panel is immediate - and still uncovered ------ */
  /* This is the case the old canPromptSkill() could not see: #evoPanel is not an .overpanel, so
     the 900ms skill-tree timer sailed straight through and landed on top of it. */
  await arm(5);
  await pg.evaluate(()=>xpLevelTap());
  await pg.waitForTimeout(1900);
  const f5 = await snap();
  console.log('LV5   ', JSON.stringify(f5));
  ck(f5.panel===true, 'the level 5 stage panel never opened');
  ck(f5.tree===false, 'the skill tree opened on top of the level 5 stage panel');
  ck(f5.party===false, 'he is dancing behind the level 5 stage panel');
  ck(f5.owed===true, 'level 5 forgot it owed him a dance');

  // NO THANKS also pays the dance out - declining the park is not declining your level
  await pg.click('#evoNo');
  await pg.waitForTimeout(900);
  const f5b = await snap();
  console.log('LV5NO ', JSON.stringify(f5b));
  ck(f5b.party===true, 'declining the park cost him his celebration');
  await pg.evaluate(()=>{ PARTY.on=false;
    document.getElementById('skillPanel').classList.remove('show'); });
  await pg.waitForTimeout(1200);
  await pg.evaluate(()=>{ PARTY.on=false;
    document.getElementById('skillPanel').classList.remove('show'); });

  /* ---------- 4. GO THERE NOW takes you to the park, and he does NOT dance in it ---------- */
  await arm(5);
  await pg.evaluate(()=>xpLevelTap());
  await pg.waitForTimeout(1600);
  await pg.click('#evoGo');
  await pg.waitForTimeout(1400);
  const park = await pg.evaluate(()=>({park:PK.active, mode:MODE, party:PARTY.on,
                                       owed:XPANIM.danceOwed,
                                       tree:document.getElementById('skillPanel').classList.contains('show')}));
  console.log('PARK  ', JSON.stringify(park));
  ck(park.park===true && park.mode==='park', 'GO THERE NOW did not start the run: '+JSON.stringify(park));
  ck(park.party===false, 'he is dancing in the middle of a DOGPARK run');
  ck(park.tree===false, 'the skill tree opened over a DOGPARK run');
  ck(park.owed===false, 'the owed dance is still pending and will fire in the park later');

  await pg.evaluate(()=>{ PK.active=false; showScreen('home'); PARTY.on=false; });
  await pg.waitForTimeout(700);

  /* ---------- 5. a plain level is UNCHANGED: it still dances on the tap ---------- */
  const plain = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    PARTY.on=false; EVO.active=false; XPLOCK=false; XPANIM.danceOwed=false; XPANIM.pauseT=0;
    document.getElementById('evoPanel').classList.remove('show');
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    S.lvl=13; S.xp=0; S.pts=0; S.pendingStage.length=0;
    XPANIM.lvl=12; XPANIM.frac=1; XPANIM.ready=true;
    xpLevelTap();
    const now={party:PARTY.on, owed:XPANIM.danceOwed};
    await sleep(1800);
    now.tree=document.getElementById('skillPanel').classList.contains('show');
    now.stillDancing=PARTY.on;
    document.getElementById('skillPanel').classList.remove('show'); PARTY.on=false;
    return now;
  });
  console.log('PLAIN ', JSON.stringify(plain));
  ck(plain.party===true, 'a plain level no longer dances at all: '+JSON.stringify(plain));
  ck(plain.owed===false, 'a plain level marked a dance owed as well as dancing');
  ck(plain.tree===true, 'a plain level stopped offering the tree');
  ck(plain.stillDancing===true, 'the plain-level dance is over before the tree even arrives');

  /* ---------- 6. the dev stage buttons still work and owe nothing ---------- */
  const dev = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    PARTY.on=false; XPANIM.danceOwed=false; S.lvl=25;
    fireStageCeremony(25);
    const a={evo:EVO.active};
    await sleep(EVO.end*1000+1800);        // the sequence is eleven seconds long now, not four
    a.panel=document.getElementById('evoPanel').classList.contains('show');
    a.party=PARTY.on;
    document.getElementById('evoPanel').classList.remove('show');
    return a;
  });
  console.log('DEV   ', JSON.stringify(dev));
  ck(dev.evo===true, 'the dev stage-25 button no longer starts the flicker');
  ck(dev.panel===true, 'the dev stage-25 panel never followed the flicker');
  ck(dev.party===false, 'a ceremony with no level behind it still danced');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npevo PASS');
})();
