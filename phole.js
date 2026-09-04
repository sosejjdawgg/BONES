const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
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
  await pg.evaluate(()=>{ S.lvl=20; startPark(true); });
  await pg.waitForTimeout(2000);
  // keep the run alive and un-panelled while we drive it
  await pg.evaluate(()=>{ window.__ka=true; window.__keep=()=>{
    PK.hp=PK.maxhp; if(PK.shop) PK.shop=false;
    // a stage evolution is modal and the burial waits on it by design; wave it through
    const ep=document.querySelector('#evoPanel'), eg=document.querySelector('#evoGo');
    if(ep && eg && ep.classList.contains('show')) eg.click();
    if(window.__ka) requestAnimationFrame(window.__keep); }; requestAnimationFrame(window.__keep); });
  return {pg,errs};
}
// reach wave 10 the way the game does, so the real advance runs
async function clearTo10(pg){
  await pg.evaluate(()=>{
    PK.plusMode=true; PK.bossDone=false; PK.bossArmed=false; PK.hole=null; PK.holePending=false;
    PK.en.length=0; PK.wave=9; PK.waveT=0; PK.waveOutro=null;
    PK.waveQuota=pkWaveQuota(9); PK.waveSpawned=PK.waveQuota;
    PK.waveKills=PK.waveQuota; PK.apeKills=APE_WAVE_QUOTA;
  });
  await pg.waitForFunction(()=>PK.holePending||PK.holeCine||PK.wave>=10,null,{timeout:40000}).catch(()=>{});
}

(async()=>{
  const b=await chromium.launch();

  /* ---------- 1. wave 9 opens the hole, NOT the boss ---------- */
  { const {pg,errs}=await fresh(b);
    await clearTo10(pg);
    await pg.waitForFunction(()=>!!PK.holeCine,null,{timeout:25000,polling:60}).catch(()=>{});
    const a=await pg.evaluate(()=>({cine:!!PK.holeCine, ph:PK.holeCine&&PK.holeCine.ph,
      hole:!!PK.hole, bossActive:BOSS.active, bossArmed:PK.bossArmed, wave:PK.wave}));
    console.log('OPEN   ', JSON.stringify(a));
    ck(a.cine===true,  'wave 9 did not open the hole');
    ck(a.hole===true,  'no hole was placed in the world');
    ck(a.bossActive===false && a.bossArmed===false, 'the boss started without the hole');

    // the pan reaches the hole and the choice comes up
    await pg.waitForFunction(()=>PK.holeCine&&PK.holeCine.ph==="ask",null,{timeout:25000,polling:60}).catch(()=>{});
    const panel=await pg.evaluate(()=>({ph:PK.holeCine&&PK.holeCine.ph,
      cam:+pkHoleCamProgress().toFixed(2), open:+(PK.hole?PK.hole.open:0).toFixed(2),
      shown:document.querySelector('#choice').classList.contains('show'),
      title:document.querySelector('#chTitle').textContent,
      btns:[document.querySelector('#chA').textContent, document.querySelector('#chB').textContent]}));
    console.log('ASK    ', JSON.stringify(panel));
    ck(panel.cam>0.95, 'the camera never reached the hole ('+panel.cam+')');
    ck(panel.open>0.9, 'the hole never finished opening');
    ck(/LARGE HOLE/.test(panel.title), 'wrong title: '+panel.title);
    ck(panel.btns[0]==='INVESTIGATE' && panel.btns[1]==='NOT NOW', 'wrong buttons: '+panel.btns);
    await pg.screenshot({path:'h_ask.png'});

    /* ---------- 2. NOT NOW resumes the run and leaves the hole ---------- */
    await pg.click('#chB');
    await pg.waitForFunction(()=>PK.holeCine===null,null,{timeout:20000,polling:60}).catch(()=>{});
    await pg.waitForTimeout(1200);
    const no=await pg.evaluate(()=>({cine:PK.holeCine, hole:!!PK.hole, armed:PK.bossArmed,
      boss:BOSS.active, cam:+pkHoleCamProgress().toFixed(2)}));
    console.log('NOTNOW ', JSON.stringify(no));
    ck(no.cine===null, 'NOT NOW did not end the cine');
    ck(no.hole===true, 'NOT NOW removed the hole from the world');
    ck(no.armed===false && no.boss===false, 'NOT NOW started the fight anyway');
    ck(no.cam<0.05, 'the camera never came back off the hole');

    /* ---------- 3. walking back re-asks ---------- */
    await pg.evaluate(()=>{ PK.hole.asked=true;
      window.__walk=()=>{ if(PK.hole && !PK.holeCine){ PK.x=PK.hole.x; PK.y=PK.hole.y; PK.z=0; }
        if(window.__ka) requestAnimationFrame(window.__walk); }; requestAnimationFrame(window.__walk); });
    await pg.waitForFunction(()=>!!PK.holeCine,null,{timeout:20000,polling:60}).catch(()=>{});
    const back=await pg.evaluate(()=>({cine:!!PK.holeCine, ph:PK.holeCine&&PK.holeCine.ph,
      shown:document.querySelector('#choice').classList.contains('show')}));
    console.log('RETURN ', JSON.stringify(back));
    ck(back.cine===true && back.shown===true, 'walking back to the hole did not re-ask');

    /* ---------- 4. INVESTIGATE goes straight into the full-screen hole ---------- */
    await pg.evaluate(()=>{ window.__walk=()=>{}; PK.bones=9000; });
    await pg.click('#chA');
    await pg.waitForTimeout(300);
    const enter=await pg.evaluate(()=>({cine:PK.holeCine, bury:BURY.on, src:BURY.src, ph:BURY.ph,
      panel:document.querySelector('#buryPanel').classList.contains('show'),
      choice:document.querySelector('#choice').classList.contains('show')}));
    console.log('ENTER  ', JSON.stringify(enter));
    ck(enter.bury===true && enter.panel===true, 'INVESTIGATE did not open the full-screen hole');
    ck(enter.ph==='talk', 'it did not land on the dialogue: '+enter.ph);
    ck(enter.src==='offer', 'the offering used the wrong pile: '+enter.src);
    ck(enter.cine===null, 'the park cine was left running under the panel');
    ck(enter.choice===false, 'the choice panel is still up over the hole');

    // the two lines play in there, then it hands over to the hold
    const said=[];
    for(let i=0;i<90;i++){
      const st=await pg.evaluate(()=>({ph:BURY.ph, txt:BURY.bubTxt, bone:!!BURY.bubBone}));
      if(st.txt && said[said.length-1]!==st.txt) said.push(st.txt);
      if(st.ph!=='talk') break;
      await pg.waitForTimeout(120);
    }
    const talk=await pg.evaluate(()=>({ph:BURY.ph, rise:+((BURY.rise)||0).toFixed(2),
      bone:!!BURY.bubBone, on:BURY.on}));
    console.log('TALK   ', JSON.stringify({said, ...talk}));
    ck(said.some(x=>/RUMBLES DEEP BELOW/.test(x)), 'missing the rumble line: '+JSON.stringify(said));
    ck(said.some(x=>/GIVE ME BONES/.test(x)),      'missing GIVE ME BONES: '+JSON.stringify(said));
    ck(talk.bone===true, 'the bone icon was not set on the second line');
    ck(talk.ph==='hold', 'the dialogue never handed over to the hold: '+talk.ph);
    ck(talk.on===true, 'the offering closed itself during the dialogue');
    await pg.screenshot({path:'h_wait.png'});

    /* ---------- 5. holding feeds it ---------- */
    await pg.evaluate(()=>{ BURY.held=true; });
    await pg.waitForTimeout(7000);
    const mid=await pg.evaluate(()=>({spent:BURY.spent, bones:PK.bones, lvl:S.lvl, lvl0:BURY.lvl0,
      boss:BOSS.active, armed:PK.bossArmed}));
    console.log('POUR   ', JSON.stringify(mid));
    ck(mid.spent>0, 'the offering poured nothing');
    ck(mid.bones<9000, "the offering did not spend the run's bones");
    ck(mid.boss===false && mid.armed===false, 'Wolfie woke mid-pour, before the offering ended');
    await pg.screenshot({path:'h_pour.png'});

    // release -> the countdown shows, touching cancels it
    await pg.evaluate(()=>{ BURY.held=false; });
    await pg.waitForTimeout(1400);
    const cd=await pg.evaluate(()=>({idle:+BURY.idle.toFixed(2), letgo:BURY_LETGO, on:BURY.on}));
    console.log('COUNT  ', JSON.stringify(cd));
    ck(cd.letgo===3.0, 'the countdown is not 3s ('+cd.letgo+')');
    ck(cd.on===true && cd.idle>0.3 && cd.idle<3.0, 'the countdown did not run: '+JSON.stringify(cd));
    await pg.screenshot({path:'h_count.png'});
    const resume=await pg.evaluate(async()=>{ BURY.held=true;
      await new Promise(r=>setTimeout(r,600)); return {idle:+BURY.idle.toFixed(2), on:BURY.on}; });
    console.log('RESUME ', JSON.stringify(resume));
    ck(resume.on===true && resume.idle<0.4, 'touching again did not cancel the countdown');

    // ...and let the countdown run all the way out, which is the real way it ends
    await pg.evaluate(()=>{ BURY.held=false; });
    await pg.waitForFunction(()=>!BURY.on,null,{timeout:30000,polling:80}).catch(()=>{});
    await pg.waitForTimeout(1500);
    const done=await pg.evaluate(()=>({bury:BURY.on, armed:PK.bossArmed, boss:BOSS.active,
      panel:document.querySelector('#buryPanel').classList.contains('show')}));
    console.log('DONE   ', JSON.stringify(done));
    ck(done.bury===false && done.panel===false, 'the offering never closed');
    ck(done.armed===true || done.boss===true, 'paying the tribute did not wake Wolfie');

    await pg.waitForFunction(()=>BOSS.active,null,{timeout:25000,polling:80}).catch(()=>{});
    const fight=await pg.evaluate(()=>({boss:BOSS.active, name:BOSS.name, hp:BOSS.hp, max:BOSS.maxhp}));
    console.log('FIGHT  ', JSON.stringify(fight));
    ck(fight.boss===true, 'the fight never started');
    ck(fight.name==='WOLFIE' && fight.max===200, 'wrong name/HP: '+JSON.stringify(fight));
    console.log('ERRORS:', errs.length?errs:'none');
    ck(errs.length===0, 'page errors: '+errs.join(';'));
    await pg.evaluate(()=>{ window.__ka=false; });
    await pg.close();
  }

  /* ---------- 6. a plain Dogpark run never opens it ---------- */
  { const {pg,errs}=await fresh(b);
    await pg.evaluate(()=>{
      PK.plusMode=false; PK.bossDone=false; PK.hole=null; PK.holePending=false;
      PK.en.length=0; PK.wave=9; PK.waveT=0; PK.waveOutro=null;
      PK.waveQuota=pkWaveQuota(9); PK.waveSpawned=PK.waveQuota;
      PK.waveKills=PK.waveQuota; PK.apeKills=APE_WAVE_QUOTA;
    });
    await pg.waitForFunction(()=>PK.wave>=10,null,{timeout:40000}).catch(()=>{});
    await pg.waitForTimeout(2500);
    const plain=await pg.evaluate(()=>({wave:PK.wave, hole:!!PK.hole, pending:PK.holePending,
      cine:!!PK.holeCine, boss:BOSS.active}));
    console.log('PLAIN  ', JSON.stringify(plain));
    ck(plain.hole===false && plain.pending===false && plain.cine===false && plain.boss===false,
       'a regular Dogpark run opened the hole');
    console.log('ERRORS:', errs.length?errs:'none');
    ck(errs.length===0, 'plain page errors: '+errs.join(';'));
    await pg.evaluate(()=>{ window.__ka=false; });
    await pg.close();
  }

  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL HOLE CHECKS PASS');
  await b.close();
})();
