/* NO DEAD ENDS.
   Every panel here takes over the bottom half of the phone, which is where every control lives -
   so a panel open at the wrong moment is not a menu left open, it is a game that cannot be played
   or left. This suite asks three questions of every one of them: can you get out, is the way out
   actually ON THE SCREEN, and does it survive a change of screen it has no business surviving.
   It also replays the exact trap that was reported: a level conferred, DOGPARK started inside the
   900ms before the skill tree is offered, and the tree arriving on top of the park's controls. */
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
  await pg.evaluate(()=>{ S.lvl=12; XPANIM.lvl=12; S.pts=4; S.money=900; S.bones=200;
                          S.pendingStage.length=0; S.ballOwned=true; });
  await pg.waitForTimeout(600);

  /* ---------- 1. THE REPORTED TRAP ---------- */
  /* awardSkillPoint offers the tree on a 900ms timer. The question "is now a good moment" used to
     be asked when the timer was SET, so anything started inside that window - DOGPARK, most
     obviously - got a skill tree dropped on top of its controls. */
  const trap = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    awardSkillPoint(1);            // ...schedules the offer
    await sleep(120);
    startPark(false);              // ...and the player is gone before it lands
    await sleep(1400);             // long enough for the old timer to have fired
    const sp=document.getElementById('skillPanel');
    const o={ open:sp.classList.contains('show'), mode:MODE, park:PK.active };
    // ...and the park's own controls are reachable: nothing is covering the pad
    const pad=document.getElementById('parkcv').getBoundingClientRect();
    const mid=document.elementFromPoint(pad.left+pad.width/2, pad.top+pad.height*0.6);
    o.overPad = mid ? (mid.id||mid.className||mid.tagName) : 'nothing';
    o.blocked = !!(mid && mid.closest && mid.closest('.overpanel'));
    return o;
  });
  console.log('TRAP  ', JSON.stringify(trap));
  ck(trap.open===false,
     'the skill tree opened on top of a DOGPARK run - this is the reported bug, unfixed');
  ck(trap.park===true && trap.mode==='park', 'the run did not actually start: '+JSON.stringify(trap));
  ck(trap.blocked===false,
     'a panel is covering the park pad: elementFromPoint found "'+trap.overPad+'"');

  /* ---------- 2. changing screen sweeps what the player was browsing ---------- */
  const sweep = await pg.evaluate(()=>{
    // back home first, then open one of everything the player can browse
    PK.active=false; showScreen("home");
    const browse=["todoPanel","mailPanel","dlogPanel","skillPanel","supplies","nourish",
                  "goout","menuPanel","careGuidePanel","settingsPanel","shopPanel","moneyPick"];
    for(const id of browse) document.getElementById(id).classList.add("show");
    // ...and one of the flow modals the game raises itself, which must NOT be swept
    document.getElementById("result").classList.add("show");
    /* THE STATUS CARD IS NOT AN .overpanel AND TAKES THE SCREEN JUST AS HARD. It is offered on
       a 900ms timer of its own after CALL BONES, so it can arrive over a run the same way. */
    openStatus(); showPortrait("sad",9000);
    const before=document.querySelectorAll(".overpanel.show").length;
    const closed=uiCloseOverlays();
    const stillStatus=document.getElementById("status").classList.contains("show");
    const stillPortrait=document.getElementById("portrait").classList.contains("show");
    const left=[...document.querySelectorAll(".overpanel.show")].map(e=>e.id);
    document.getElementById("result").classList.remove("show");
    return {before, closed, left, keep:UI_KEEP, stillStatus, stillPortrait};
  });
  console.log('SWEEP ', JSON.stringify(sweep));
  ck(sweep.closed>=12, 'the sweep only closed '+sweep.closed+' of '+sweep.before+' panels');
  ck(sweep.left.length===1 && sweep.left[0]==='result',
     'the sweep ate a flow modal, or left a browsable one open: '+JSON.stringify(sweep.left));
  ck(sweep.stillStatus===false, 'the status card survived the sweep and still covers the screen');
  ck(sweep.stillPortrait===false, 'the portrait card survived the sweep');

  /* ...and it is wired to the screen change itself, not bolted onto one caller */
  const wired = await pg.evaluate(()=>{
    showScreen("home");
    document.getElementById("menuPanel").classList.add("show");
    document.getElementById("skillPanel").classList.add("show");
    showScreen("work");
    const after=[...document.querySelectorAll(".overpanel.show")].map(e=>e.id);
    showScreen("home");
    return after;
  });
  console.log('WIRED ', JSON.stringify(wired));
  ck(wired.length===0, 'changing screen left '+JSON.stringify(wired)+' open over the new one');

  /* ---------- 3. every panel has a way out, and it is ON THE SCREEN ---------- */
  /* Not "has a close button somewhere in its markup" - has one a thumb can reach without knowing
     to scroll for it. The skill tree failed exactly this: LATER exists, at the end of a scrolling
     column, off the bottom of a tall phone. */
  const exits = await pg.evaluate(()=>{
    const EXIT={ todoPanel:"todoClose", mailPanel:"mailClose", dlogPanel:"dlogClose",
                 skillPanel:"skillClose", supplies:"supClose", nourish:"nourishClose",
                 goout:"gooutClose", menuPanel:"menuClose", careGuidePanel:"careClose",
                 settingsPanel:"settingsClose", shopPanel:"shopClose", mystPanel:"mystClose",
                 pinPanel:"pinClose", moneyPick:"mpCancel", pre:"bPreBack", result:"bResHome" };
    const out=[];
    const W=window.innerWidth, H=window.innerHeight;
    for(const [pid,bid] of Object.entries(EXIT)){
      const p=document.getElementById(pid), btn=document.getElementById(bid);
      if(!p||!btn){ out.push({pid, missing:!p?'panel':'button'}); continue; }
      p.classList.add("show");
      // ...with the panel as full of content as it will ever be
      const r=btn.getBoundingClientRect();
      const onScreen = r.width>0 && r.height>0 && r.top>=0 && r.bottom<=H && r.left>=0 && r.right<=W;
      const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
      out.push({pid, onScreen, top:Math.round(r.top), bottom:Math.round(r.bottom),
                reachable: !!(hit && (hit===btn || btn.contains(hit)))});
      p.classList.remove("show");
    }
    return {H, out};
  });
  console.log('EXITS ', JSON.stringify(exits.out.filter(e=>e.missing||!e.onScreen||!e.reachable)));
  for(const e of exits.out){
    ck(!e.missing, e.pid+' has no '+e.missing+' for its way out');
    ck(e.onScreen!==false, e.pid+"'s way out is off the screen: "+e.top+'..'+e.bottom
       +' of '+exits.H);
    ck(e.reachable!==false, e.pid+"'s way out is on the screen but something is over it");
  }

  /* ---------- 4. the skill tree's exit stays put however far you scroll ---------- */
  const pinned = await pg.evaluate(()=>{
    S.pts=4; openSkillPanel();
    const btn=document.getElementById('skillClose');
    const body=document.getElementById('treeBody');
    const a=btn.getBoundingClientRect().top;
    body.scrollTop=body.scrollHeight;
    const bt=btn.getBoundingClientRect().top;
    const later=document.getElementById('skillLater').getBoundingClientRect();
    body.scrollTop=0;
    document.getElementById('skillPanel').classList.remove('show');
    return {a:Math.round(a), b:Math.round(bt), later:Math.round(later.bottom),
            H:window.innerHeight};
  });
  console.log('PINNED', JSON.stringify(pinned));
  ck(pinned.a===pinned.b,
     'the CLOSE button moved when the tree was scrolled ('+pinned.a+' -> '+pinned.b+
     ') - it is inside the scrolling body');
  ck(pinned.a>=0 && pinned.a<pinned.H, 'the CLOSE button is not on screen at all: '+pinned.a);

  /* ---------- 5. ...and it really does close it ---------- */
  const shut = await pg.evaluate(()=>{
    S.pts=4; openSkillPanel();
    const was=document.getElementById('skillPanel').classList.contains('show');
    document.getElementById('skillClose').click();
    return {was, now:document.getElementById('skillPanel').classList.contains('show')};
  });
  console.log('SHUT  ', JSON.stringify(shut));
  ck(shut.was===true && shut.now===false, 'CLOSE did not close the tree: '+JSON.stringify(shut));

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\nptidy PASS');
})();
