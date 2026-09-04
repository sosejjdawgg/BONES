const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F);
  await pg.waitForTimeout(1400);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(900);
  await pg.evaluate(()=>{ S.lvl=20; startPark(true); });
  await pg.waitForTimeout(1800);

  /* ===== 1. INVESTIGATE goes straight into the full-screen hole ===== */
  const inv = await pg.evaluate(async ()=>{
    PK.plusMode=true; PK.bossDone=false; PK.bossArmed=false; PK.bones=9000;
    pkHolePlace(); PK.holeCine={ph:"ask",t:0}; pkHoleAsk();
    document.querySelector('#chA').click();          // INVESTIGATE
    await new Promise(r=>setTimeout(r,220));
    return {cine:PK.holeCine, bury:BURY.on, src:BURY.src, ph:BURY.ph,
            panel:document.querySelector('#buryPanel').classList.contains('show'),
            said:BURY.said, extraTapNeeded:false};
  });
  console.log('INVEST ', JSON.stringify(inv));
  ck(inv.bury===true && inv.panel===true, 'INVESTIGATE did not open the full-screen hole');
  ck(inv.ph==='talk', 'it did not start on the dialogue: '+inv.ph);
  ck(inv.src==='offer', 'wrong pile: '+inv.src);
  ck(inv.cine===null, 'the park cine was left running under the panel');

  // the two lines play there, then it becomes the hold
  const talk = await pg.evaluate(async ()=>{
    const said=[]; let ph=BURY.ph;
    for(let i=0;i<200 && BURY.ph==='talk'; i++){
      if(BURY.bubTxt && said[said.length-1]!==BURY.bubTxt) said.push(BURY.bubTxt);
      await new Promise(r=>setTimeout(r,60));
    }
    return {said, ph:BURY.ph, rise:+(BURY.rise||0).toFixed(2), bone:!!BURY.bubBone};
  });
  console.log('TALK   ', JSON.stringify(talk));
  ck(talk.said.some(x=>/RUMBLES DEEP BELOW/.test(x)), 'no rumble line: '+JSON.stringify(talk.said));
  ck(talk.said.some(x=>/GIVE ME BONES/.test(x)), 'no GIVE ME BONES: '+JSON.stringify(talk.said));
  ck(talk.bone===true, 'no bone icon on the second line');
  ck(talk.ph==='hold', 'the dialogue never handed over to the hold: '+talk.ph);
  await pg.screenshot({path:'f_talk.png'});

  /* ===== 2. a level-up mid-offering must not start Wolfie ===== */
  const lvl = await pg.evaluate(async ()=>{
    S.lvl=9; S.xp=xpNeed(9)-2;             // one shovel from levelling
    const lvl0=S.lvl;
    BURY.held=true;
    let armedDuring=false, bossDuring=false, lvlSeen=lvl0;
    for(let i=0;i<160;i++){
      if(PK.bossArmed) armedDuring=true;
      if(BOSS.active) bossDuring=true;
      lvlSeen=Math.max(lvlSeen,S.lvl);
      if(S.lvl>lvl0+1) break;
      await new Promise(r=>setTimeout(r,50));
    }
    return {lvl0, lvlSeen, levelled:lvlSeen>lvl0, armedDuring, bossDuring,
            bury:BURY.on, ph:BURY.ph};
  });
  console.log('LEVEL  ', JSON.stringify(lvl));
  ck(lvl.levelled===true, 'the offering never levelled him, so this proves nothing');
  ck(lvl.armedDuring===false, 'a level-up armed Wolfie mid-offering');
  ck(lvl.bossDuring===false, 'a level-up STARTED Wolfie mid-offering');
  ck(lvl.bury===true, 'the offering closed itself on the level-up');

  // ...and pkBossStart itself refuses while the panel is up
  const guard = await pg.evaluate(()=>{
    PK.bossArmed=false; PK.bossDone=false;
    pkBossStart();                                   // called directly, mid-burial
    return {boss:BOSS.active, rearmed:PK.bossArmed, bury:BURY.on};
  });
  console.log('GUARD  ', JSON.stringify(guard));
  ck(guard.boss===false, 'pkBossStart ran while the burial owned the screen');
  ck(guard.rearmed===true, 'the refused start was not re-armed for later');

  // finishing IS the one exit
  const done = await pg.evaluate(async ()=>{
    PK.bossArmed=false;
    // level 10 is a stage evolution: its panel is modal and the burial waits on it by design
    for(let i=0;i<40 && BURY.ph==='evo'; i++){
      const go=document.querySelector('#evoGo');
      if(go && document.querySelector('#evoPanel').classList.contains('show')) go.click();
      await new Promise(r=>setTimeout(r,80));
    }
    BURY.held=false;
    for(let i=0;i<200 && BURY.on;i++) await new Promise(r=>setTimeout(r,60));
    const armed=PK.bossArmed;
    for(let i=0;i<120 && !BOSS.active;i++) await new Promise(r=>setTimeout(r,60));
    return {bury:BURY.on, armed, boss:BOSS.active, name:BOSS.name};
  });
  console.log('EXIT   ', JSON.stringify(done));
  ck(done.bury===false, 'the offering never closed');
  ck(done.armed===true || done.boss===true, 'finishing the offering did not wake him');

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL FIX CHECKS PASS');
  await b.close();
})();
