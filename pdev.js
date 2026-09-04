/* THE DEV BAR HAS TO FIRE THE REAL PIPELINE.
   The whole point of these buttons is to reach state that is otherwise three gates deep (a
   broken pane needs three thrown hits; the bat needs that PLUS a 1-in-10 roll PLUS the night
   skipped through). A button that sets S.winBroken=true directly would satisfy every "is it
   broken" assertion while testing nothing, so this suite checks for the SIDE EFFECTS only the
   real functions produce - shards in WINFX, the bat's own bite phase setting S.vampire, the
   cure row rendered by renderMystShop's own affordability test. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
/* WHERE THE WORDS ACTUALLY GO. toast() only paints #toast when the park header is up or #game is
   hidden; on the home screen it routes into the doggie log instead. Reading #toast there returns
   an empty string forever, which looks exactly like a button that says nothing. */
const said = (pg)=>pg.evaluate(()=>{
  const t=document.getElementById('toast');
  if(t && t.style.display==='block' && t.textContent) return t.textContent;
  return (typeof DOGLOG!=='undefined' && DOGLOG[0]) ? DOGLOG[0].msg : '';
});
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1900);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);

  // unlock through the REAL pin, not by un-hiding the bars
  await pg.click('#devToggle'); await pg.waitForTimeout(150);
  await pg.evaluate(()=>{ const pad=document.getElementById('pinPad');
    for(const d of "1234") [...pad.children].find(b=>b.textContent===d).click(); });
  await pg.waitForTimeout(250);

  /* ---------- 1. ALL FOUR BARS ARE ONE SWITCH ---------- */
  const bars = await pg.evaluate(()=>{
    const st=()=>["devbar","pkDevbar","runDevbar","pbDevbar"]
      .map(i=>document.getElementById(i))
      .map(e=>e?!e.classList.contains("hidden"):"missing");
    const open=st();
    toggleDevMode();                 // ...and one tap puts all four away again
    const shut=st();
    devBarsShow(true);
    return {open, shut, now:st()};
  });
  console.log('BARS  ', JSON.stringify(bars));
  ck(bars.open.every(v=>v===true), 'the PIN did not open all four bars: '+JSON.stringify(bars.open));
  ck(bars.shut.every(v=>v===false), 'one tap did not hide all four bars: '+JSON.stringify(bars.shut));

  /* ---------- 2. THE CHIP READS REAL STATE ---------- */
  const chip0 = await pg.evaluate(()=>{
    S.winCracks=0; S.winBroken=false; S.vampire=false; CLK.h=9; CLK.day=4; devRefresh();
    const e=document.getElementById('devStatus');
    return {txt:e.textContent, bad:e.classList.contains('bad')};
  });
  console.log('CHIP0 ', JSON.stringify(chip0));
  ck(/WIN 0\/3/.test(chip0.txt) && /VAMP OFF/.test(chip0.txt) && /DAY 4 09:00/.test(chip0.txt),
     'the chip does not read the real state: '+chip0.txt);
  ck(chip0.bad===false, 'the chip is red with a whole window and no curse');

  /* ---------- 3. CRACK PANE runs winTakeHit, one crack per tap ---------- */
  const crack = await pg.evaluate(()=>{
    S.winCracks=0; S.winBroken=false; TRICK.hitWin=false; WINFX.shards.length=0;
    const out=[];
    document.getElementById('devWinCrack').click(); out.push(S.winCracks);
    document.getElementById('devWinCrack').click(); out.push(S.winCracks);
    return {steps:out, broken:S.winBroken, shards:WINFX.shards.length,
            latch:TRICK.hitWin, chip:document.getElementById('devStatus').textContent};
  });
  console.log('CRACK ', JSON.stringify(crack));
  ck(crack.steps[0]===1 && crack.steps[1]===2,
     'CRACK PANE is not stepping the real counter: '+JSON.stringify(crack.steps));
  ck(crack.broken===false, 'two cracks broke the window - that is the third hit\'s job');
  ck(crack.shards===0, 'a mere crack produced shards');
  ck(crack.latch===true, 'winTakeHit did not set its own once-per-throw latch - it was bypassed');
  ck(/WIN 2\/3/.test(crack.chip), 'the chip did not follow the cracks: '+crack.chip);

  /* ---------- 4. SMASH WINDOW goes through the real shatter ---------- */
  /* The tell is WINFX.shards: only winShatter fills it, and only winTakeHit's third-hit branch
     calls winShatter. Setting S.winBroken by hand would leave it empty. */
  const smash = await pg.evaluate(()=>{
    S.winCracks=0; S.winBroken=false; TRICK.hitWin=false; WINFX.shards.length=0;
    document.getElementById('devWinSmash').click();
    const e=document.getElementById('devStatus');
    return {broken:S.winBroken, cracks:S.winCracks, shards:WINFX.shards.length,
            chip:e.textContent, bad:e.classList.contains('bad')};
  });
  console.log('SMASH ', JSON.stringify(smash));
  ck(smash.broken===true && smash.cracks===3, 'SMASH did not take the pane out: '+JSON.stringify(smash));
  ck(smash.shards>20, 'no shards - winShatter never ran, so this is not the real break: '+smash.shards);
  ck(/WIN SMASHED/.test(smash.chip) && smash.bad===true, 'the chip did not go red on a broken pane');

  // ...and a second tap refuses rather than silently doing nothing
  const again = await pg.evaluate(()=>{
    const before=WINFX.shards.length;
    document.getElementById('devWinSmash').click();
    return {before, after:WINFX.shards.length};
  });
  again.toast = await said(pg);
  console.log('AGAIN ', JSON.stringify(again));
  ck(/ALREADY SMASHED/.test(again.toast), 'smashing an already-broken pane said nothing: '+again.toast);

  /* ---------- 5. FIX WINDOW clears the glass AND the shards ---------- */
  const fix = await pg.evaluate(()=>{
    document.getElementById('devWinFix').click();
    return {cracks:S.winCracks, broken:S.winBroken, shards:WINFX.shards.length,
            bad:document.getElementById('devStatus').classList.contains('bad')};
  });
  console.log('FIX   ', JSON.stringify(fix));
  ck(fix.cracks===0 && fix.broken===false && fix.shards===0,
     'FIX left something behind: '+JSON.stringify(fix));
  ck(fix.bad===false, 'the chip stayed red after the glass went back in');

  /* ---------- 6. NIGHT BAT: the real state machine, all the way to the curse ---------- */
  /* Not "does S.vampire end up true" - that could be one assignment. The bat must actually fly:
     phases in -> circle -> bite -> out, S.vampire set from INSIDE the bite phase, and the morning
     waiting on the callback. Watched frame by frame. */
  const bat = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    S.vampire=false; S.winBroken=false; S.winCracks=0; S.dead=false;
    BAT.on=false; BAT.bitten=false;
    document.getElementById('devBatNow').click();
    const t0={on:BAT.on, ph:BAT.ph, broken:S.winBroken, cam:CAM.state,
              chip:document.getElementById('devStatus').textContent};
    const phases=new Set(); let vampAt=null, flash=0;
    for(let i=0;i<160;i++){
      await sleep(60);
      if(BAT.on) phases.add(BAT.ph);
      flash=Math.max(flash, BAT.flash);
      if(vampAt===null && S.vampire) vampAt=BAT.ph;
      /* THE MORNING IS ON A TIMER, NOT ON THE FLAG. batTick clears BAT.on and only THEN does
         setTimeout(done,900) - so stopping the moment the bat leaves stops up to 900ms before
         skipToMorning has run, and reads a clock that is still mid-night. */
      if(!BAT.on && vampAt!==null){ await sleep(1400); break; }
    }
    return {t0, phases:[...phases], vampAt, flash:+flash.toFixed(2),
            vampire:S.vampire, on:BAT.on, hour:+CLK.h.toFixed(1)};
  });
  console.log('BAT   ', JSON.stringify(bat));
  ck(bat.t0.on===true && bat.t0.ph==='in', 'the bat never launched: '+JSON.stringify(bat.t0));
  ck(bat.t0.broken===true, 'NIGHT BAT did not force the pane out first');
  ck(bat.t0.cam==='bedsleep', 'he is not asleep for it: CAM.state='+bat.t0.cam);
  ck(/BAT IN/.test(bat.t0.chip), 'the chip does not say there is something in the room');
  for(const p of ['in','circle','bite','out'])
    ck(bat.phases.includes(p), 'the bat skipped its "'+p+'" phase: '+JSON.stringify(bat.phases));
  ck(bat.vampAt==='bite'||bat.vampAt==='out',
     'the curse did not land from the bite phase (got "'+bat.vampAt+'") - it was set by hand');
  ck(bat.flash>0.5, 'no lightning flash: '+bat.flash);
  ck(bat.vampire===true && bat.on===false, 'the bat never left, or never infected him');
  /* ...and the morning callback ran: skipToMorning winds the clock to 06:00.
     This assertion has now been round the houses, which is worth recording. It read 06:00
     originally; v0.342a gave a cursed dog a midday sleep window and an 18:00 wake, so it became
     18:00 *because* the bat's whole job is to leave him cursed; v0.343a removed the sleep window
     entirely (a vampire being marched off to bed made no sense), so skipping the night is once
     again just "run the rest of the night off" and the night ends at dawn for everybody. The
     assertion tracked the behaviour both times rather than being deleted for being inconvenient. */
  ck(Math.abs(bat.hour-6)<0.3,
     'skipping the night should end at 06:00 for anyone — got CLK.h='+bat.hour);

  /* ...and the bite latch is cleared on the way IN, so a second bat still bites ---------- */
  const twice = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    S.vampire=false; BAT.on=false; BAT.bitten=true;   // as if a previous run was interrupted
    batStart(null);
    const armed=BAT.bitten;
    for(let i=0;i<160 && BAT.on;i++) await sleep(60);
    return {armed, vampire:S.vampire};
  });
  console.log('TWICE ', JSON.stringify(twice));
  ck(twice.armed===false, 'batStart did not clear its own bite latch');
  ck(twice.vampire===true, 'a second bat circled and landed but never bit');

  /* ---------- 7. TOGGLE VAMP ---------- */
  await pg.evaluate(()=>{ S.vampire=false; document.getElementById('devVamp').click(); });
  const vampOnT = await said(pg);
  const vampOn = await pg.evaluate(()=>({v:S.vampire,
              bad:document.getElementById('devStatus').classList.contains('bad')}));
  await pg.evaluate(()=>document.getElementById('devVamp').click());
  const vampOffT = await said(pg);
  const vamp = {on:{...vampOn, t:vampOnT},
                off:{v:await pg.evaluate(()=>S.vampire), t:vampOffT}};
  console.log('VAMP  ', JSON.stringify(vamp));
  ck(vamp.on.v===true && /OUT OF THE SUN/.test(vamp.on.t), 'TOGGLE VAMP on said: '+vamp.on.t);
  ck(vamp.on.bad===true, 'the chip is not red on a cursed dog');
  ck(vamp.off.v===false && /VAMPIRISM OFF/.test(vamp.off.t), 'TOGGLE VAMP off said: '+vamp.off.t);

  /* ---------- 8. CURE + SHOP banks the price and renders the REAL row ---------- */
  const cure = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    S.vampire=false; S.snacks=0;
    document.getElementById('devCure').click();
    const banked={v:S.vampire, snacks:S.snacks, cost:VAMP_CURE_COST};
    await sleep(1300);                       // the whistle's own 900ms window, then the roll-up
    openMystShop();                          // the panel a player taps into after the roll-up
    await sleep(150);
    const html=document.getElementById('mystList').innerHTML;
    const row=/data-cure="1"/.test(html);
    // scoped to the cure row: the shelf carries other bone-priced items he genuinely cannot afford
    const el=document.querySelector('#mystList [data-cure="1"]');
    const poor=!!el && el.classList.contains('poor');
    closeMystShop();
    return {banked, row, poor, myst:MYST.state};
  });
  console.log('CURE  ', JSON.stringify(cure));
  ck(cure.banked.v===true, 'CURE + SHOP did not make him a vampire, so there is nothing to cure');
  ck(cure.banked.snacks>=cure.banked.cost,
     'only '+cure.banked.snacks+' bones banked against a '+cure.banked.cost+' cure');
  ck(cure.row===true, 'the CURE row is not on the shelf - renderMystShop never drew it');
  ck(cure.poor===false, 'the CURE row rendered as unaffordable despite the bones being banked');

  /* ---------- 9. +500 BONES, and the clock buttons ---------- */
  const misc = await pg.evaluate(()=>{
    S.snacks=10; document.getElementById('devBones500').click();
    const bones=S.snacks;
    document.getElementById('devNoon').click();    const noon=CLK.h;
    document.getElementById('devDusk').click();    const dusk=CLK.h;
    document.getElementById('devThreeAm').click(); const three=CLK.h;
    return {bones, noon, dusk, three, hud:document.getElementById('hudBones').textContent};
  });
  console.log('MISC  ', JSON.stringify(misc));
  ck(misc.bones===510, '+500 BONES gave '+misc.bones+' from 10');
  ck(misc.hud==='510', 'the HUD bone count did not follow: '+misc.hud);
  ck(misc.noon===12 && misc.dusk===18.2 && misc.three===3,
     'the clock buttons are wrong: '+JSON.stringify(misc));

  /* ---------- 10. SCENES: mail, save, myst ---------- */
  const scenes = await pg.evaluate(()=>{
    S.mail.length=0;
    document.getElementById('devTestMail').click();
    const mail={n:S.mail.length, kind:S.mail[0]&&S.mail[0].kind,
                html:/DEV PING/.test(document.getElementById('mailList').innerHTML),
                badge:document.getElementById('mailBtn').classList.contains('pulse')};
    document.getElementById('devSave').click();
    const saved=!!localStorage.getItem(SAVE_KEY);
    /* CLEAR THE BED FIRST. The CURE test above leaves him cursed and the clock buttons walk past
       noon, which is a cursed dog's bedtime - so SLEEP.active is set, mystBusy() is true, and the
       mysterious dog quite rightly does not call on a sleeping animal. That is the feature, not a
       fault in MYST NOW, so the harness puts the dog back on his feet before asking. */
    S.vampire=false; closeBedtime(); SLEEP.pending=false;
    S.mystDay=-1; MYST.state="away";
    const busy=mystBusy();
    document.getElementById('devMystNow').click();
    return {mail, saved, busy, mystDay:S.mystDay===CLK.day, mystState:MYST.state};
  });
  console.log('SCENES', JSON.stringify(scenes));
  ck(scenes.mail.n===1 && scenes.mail.kind==='dev', 'TEST MAIL did not land: '+JSON.stringify(scenes.mail));
  ck(scenes.mail.html===true, 'renderMail was not called - the inbox markup is stale');
  ck(scenes.mail.badge===true, 'the mail badge did not light');
  ck(scenes.saved===true, 'SAVE NOW did not write to storage');
  ck(scenes.busy===false, 'the dog was still busy, so this tested the refusal rather than the call');
  ck(scenes.mystDay===true && scenes.mystState==='peek',
     'MYST NOW did not bring him up: '+JSON.stringify(scenes));

  /* ---------- 11. PARK bar ---------- */
  await pg.evaluate(()=>{ document.getElementById('mystPanel').classList.remove('show');
                          MYST.state='away'; startPark(false); });
  await pg.waitForTimeout(900);
  const park = await pg.evaluate(()=>{
    const o={};
    document.getElementById('pkDevPlus').click();
    o.plus={mode:PK.plusMode, label:document.getElementById('camlabel').textContent};
    S.vampire=false; document.getElementById('pkDevVamp').click();
    o.safeToast=document.getElementById('toast').textContent;      // UNLEASHED => safe
    document.getElementById('pkDevVamp').click();                  // off again
    document.getElementById('pkDevDay').click();
    o.day={mode:PK.plusMode, label:document.getElementById('camlabel').textContent};
    document.getElementById('pkDevVamp').click();
    o.burnToast=document.getElementById('toast').textContent;      // daylight => burns
    o.vamp=S.vampire;
    return o;
  });
  console.log('PARK  ', JSON.stringify(park));
  ck(park.plus.mode===true && park.plus.label==='DOGPARK UNLEASHED',
     'FORCE UNLEASHED did not take: '+JSON.stringify(park.plus));
  ck(park.day.mode===false && park.day.label==='DOGPARK',
     'FORCE DAYLIGHT did not take: '+JSON.stringify(park.day));
  ck(/SAFE HERE/.test(park.safeToast),
     'the UNLEASHED vamp toast does not say he is safe: '+park.safeToast);
  // the rate it quotes is a percentage of his max now, not a flat half-point — see pbat CURSE
  ck(/DAYLIGHT BURNS/.test(park.burnToast) && /2% HP\/SEC/.test(park.burnToast),
     'the daylight vamp toast does not say it burns, with the rate: '+park.burnToast);
  ck(park.vamp===true, 'the park vamp toggle did not actually set the flag');

  /* ---------- 12. RUN bar ---------- */
  await pg.evaluate(()=>{ PK.active=false; S.vampire=false; showScreen('home'); });
  await pg.waitForTimeout(400);
  const run = await pg.evaluate(()=>{
    startRun('practice');
    const l0=R.lives, s0=R.spd;
    document.getElementById('runDevLife').click();
    document.getElementById('runDevSpeed').click();
    const o={l0, s0:Math.round(s0), lives:R.lives, spd:Math.round(R.spd)};
    R.active=false; showScreen('home');
    return o;
  });
  console.log('RUN   ', JSON.stringify(run));
  ck(run.lives===run.l0+1, '+1 LIFE gave '+run.lives+' from '+run.l0);
  ck(run.spd>=420, 'MAX SPEED left him at '+run.spd);

  /* ---------- 13. PAPERBOY bar ---------- */
  await pg.waitForTimeout(300);
  const pb = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    S.pbTutorialDone=true;
    document.getElementById('devPaperboy').click();
    await sleep(1600);
    const entered={active:PB.active, mode:MODE};
    document.getElementById('pbDevBay').click();
    const bay={phase:PB.phase, gap:Math.round(pbStopZoneStart()-PB.dist), speed:Math.round(PB.speed)};
    document.getElementById('pbDevCrash').click();
    await sleep(200);
    const crash={crashed:PB.crashed, phase:PB.phase, parked:PB.parked, shake:PB.shake>0};
    document.getElementById('pbDevTut').click();
    const tut=S.pbTutorialDone;
    return {entered, bay, crash, tut};
  });
  console.log('PB    ', JSON.stringify(pb));
  ck(pb.entered.active===true && pb.entered.mode==='paperboy',
     'PAPERBOY did not start the route: '+JSON.stringify(pb.entered));
  ck(pb.bay.phase==='approach' && pb.bay.gap===80,
     'SKIP TO BAY did not land 80 short of the zone: '+JSON.stringify(pb.bay));
  ck(pb.bay.speed>=170, 'SKIP TO BAY arrived crawling: '+pb.bay.speed);
  ck(pb.crash.crashed===true && pb.crash.parked==='crash' && pb.crash.phase==='done',
     'CRASH WALL did not wreck it: '+JSON.stringify(pb.crash));
  ck(pb.crash.shake===true, 'the wreck has no shake - pbCrash was bypassed');
  ck(pb.tut===false, 'REPLAY TUTORIAL did not clear the flag');

  /* ---------- 14. the bar still cannot eat the footer toggle ---------- */
  await pg.evaluate(()=>{ PB.active=false; showScreen('home'); });
  await pg.waitForTimeout(400);
  /* The bar grew by 14 buttons and 3 labels this version, so the question is whether the cap
     still holds it. Measured at TWO sizes, because at 896px tall the bar is 286px and the 38vh cap
     is not even binding - asserting "it overflows" there would pass or fail on the viewport rather
     than on the fix. The property that must hold everywhere is: never taller than its cap, never
     pushing the page, and never covering the one button that closes it. */
  const measure = ()=>pg.evaluate(()=>{
    const el=document.getElementById('devToggle'), r=el.getBoundingClientRect();
    const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
    const bar=document.getElementById('devbar');
    /* max-height is a PERCENTAGE of #home now, so parseFloat alone yields "38" and every bar on
       every screen looks over its cap. Resolve it against the parent the way the browser does. */
    const mh=getComputedStyle(bar).maxHeight;
    const cap=mh.endsWith('%')
      ? bar.parentElement.getBoundingClientRect().height*parseFloat(mh)/100
      : parseFloat(mh);
    return { H:window.innerHeight, cap:Math.round(cap), barH:Math.round(bar.clientHeight),
             scrolls:bar.scrollHeight>bar.clientHeight+2,
             onScreen:r.top>=0 && r.bottom<=window.innerHeight,
             reachable:!!(hit&&(hit===el||el.contains(hit))),
             page:document.documentElement.scrollHeight>document.documentElement.clientHeight+2 };
  });
  const escTall = await measure();
  console.log('ESC-T ', JSON.stringify(escTall));
  await pg.setViewportSize({width:414, height:600});     // a short phone, where the cap does bite
  await pg.waitForTimeout(500);
  const escShort = await measure();
  console.log('ESC-S ', JSON.stringify(escShort));
  await pg.setViewportSize({width:414, height:896});
  await pg.waitForTimeout(300);
  for(const [nm,e] of [['tall',escTall],['short',escShort]]){
    ck(e.onScreen && e.reachable,
       'the fuller dev bar buried the footer toggle on the '+nm+' screen: '+JSON.stringify(e));
    ck(e.barH<=e.cap+1,
       'on the '+nm+' screen the bar is '+e.barH+'px against a '+e.cap+'px cap');
    ck(e.page===false, 'the dev bar made the whole page scroll on the '+nm+' screen');
  }
  ck(escShort.scrolls===true,
     'the cap does not bite even on a 600px phone, so nothing is holding this bar back');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npdev PASS');
})();
