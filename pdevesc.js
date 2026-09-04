/* THE ESCAPE HATCH ITSELF CANNOT BE BLOCKED.
   Reported: the dev menu open, then something like the bedtime overlay comes up on top of home,
   and the one button that closes the dev menu - the secret version-number span in the footer -
   is buried under it or scrolled off with the rest of the page. This suite proves the toggle is
   reachable (on top, hit-testable, inside the viewport) in every state that used to bury it, and
   that opening the dev menu itself cannot grow the page or push its own close button away. */
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

  const hitTest = ()=>pg.evaluate(()=>{
    const el=document.getElementById('devToggle');
    if(!el) return {missing:true};
    const r=el.getBoundingClientRect();
    const W=window.innerWidth, H=window.innerHeight;
    const onScreen = r.width>0 && r.height>0 && r.top>=0 && r.bottom<=H && r.left>=0 && r.right<=W;
    const cx=(r.left+r.right)/2, cy=(r.top+r.bottom)/2;
    const hit=document.elementFromPoint(cx,cy);
    return { onScreen, top:Math.round(r.top), bottom:Math.round(r.bottom), H,
             reachable: !!(hit && (hit===el || el.contains(hit))),
             hitWas: hit ? (hit.id||hit.className||hit.tagName) : 'nothing',
             pageScrolls: document.documentElement.scrollHeight>document.documentElement.clientHeight+2 };
  });

  /* ---------- 1. baseline: the toggle sits where it always has ---------- */
  const base = await hitTest();
  console.log('BASE  ', JSON.stringify(base));
  ck(base.onScreen===true && base.reachable===true, 'the toggle is not reachable at baseline: '+JSON.stringify(base));

  /* ---------- 2. open the dev menu - it must not push the toggle away or grow the page ---------- */
  /* toggleDevMode gates the FIRST open behind a 4-digit PIN panel (#pinPanel, itself a full-screen
     overlay) - so opening it for real means going through that, not just tapping the toggle once. */
  await pg.click('#devToggle');
  await pg.waitForTimeout(150);
  await pg.evaluate(()=>{
    const pad=document.getElementById('pinPad');
    for(const d of "1234") [...pad.children].find(b=>b.textContent===d).click();
  });
  await pg.waitForTimeout(200);
  const opened = await hitTest();
  console.log('OPEN  ', JSON.stringify(opened));
  ck(opened.onScreen===true && opened.reachable===true,
     'opening the dev menu buried its own close button: '+JSON.stringify(opened));
  ck(opened.pageScrolls===false,
     'opening the dev menu made the whole page scroll - content is escaping its box');

  /* ...and the menu did not eat the home controls underneath it. THIS IS THE ORIGINAL COMPLAINT:
     a dev bar that covers the buttons is the same trap as one that covers its own exit. Checked at
     four heights down to an SE, because the bar and .body share one column and which of them gives
     way is exactly what changes with the screen - a single-viewport check passes on the phone it
     was written for and says nothing about any other. */
  const probe = ()=>pg.evaluate(()=>{
    const q=id=>{ const r=document.getElementById(id).getBoundingClientRect();
      const h=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
      return h?(h.id||h.tagName):'nothing'; };
    const bar=document.getElementById('devbar');
    return { H:window.innerHeight, bar:Math.round(bar.clientHeight),
             scrolls:bar.scrollHeight>bar.clientHeight+2,
             fetch:q('bFetch'), call:q('bCall'), walk:q('bWalk'), toggle:q('devToggle'),
             page:document.documentElement.scrollHeight>document.documentElement.clientHeight+2 };
  });
  for(const H of [896,760,640,568]){
    await pg.setViewportSize({width:414, height:H});
    await pg.waitForTimeout(420);
    const g=await probe();
    console.log('GRID  ', JSON.stringify(g));
    ck(g.fetch==='bFetch', 'at '+H+'px PLAY FETCH is covered by the dev menu: hit "'+g.fetch+'"');
    ck(g.call==='bCall',   'at '+H+'px CALL BONES is covered by the dev menu: hit "'+g.call+'"');
    ck(g.walk==='bWalk',   'at '+H+'px GO TO DOGPARK is covered by the dev menu: hit "'+g.walk+'"');
    ck(g.toggle==='devToggle', 'at '+H+'px the dev bar covers its own exit');
    ck(g.page===false, 'at '+H+'px the dev bar made the whole page scroll');
    ck(g.scrolls===true, 'at '+H+'px the dev bar is not scrolling, so its overflow has nowhere to go');
  }
  await pg.setViewportSize({width:414, height:896});
  await pg.waitForTimeout(420);

  /* ---------- 3. THE REPORTED CASE: a full-screen overlay comes up while the menu is open ---------- */
  await pg.evaluate(()=>{ document.getElementById('bedtimePanel').classList.add('show'); });
  await pg.waitForTimeout(200);
  const bedtime = await hitTest();
  console.log('BED   ', JSON.stringify(bedtime));
  ck(bedtime.onScreen===true && bedtime.reachable===true,
     'the bedtime overlay buried the dev toggle - this is the reported stuck state: '+JSON.stringify(bedtime));

  // and tapping it from here actually closes the dev menu, proving it is not just visually on top
  await pg.click('#devToggle');
  await pg.waitForTimeout(200);
  const closedUnderBed = await pg.evaluate(()=>document.getElementById('devbar').classList.contains('hidden'));
  console.log('CLOSE ', closedUnderBed);
  ck(closedUnderBed===true, 'tapping the toggle through the bedtime overlay did not close the dev menu');
  await pg.evaluate(()=>document.getElementById('bedtimePanel').classList.remove('show'));

  /* ---------- 4. other overlays that can raise over home: status card, portrait ---------- */
  await pg.evaluate(()=>{ openStatus(); showPortrait("sad",9000); });
  await pg.waitForTimeout(200);
  const status = await hitTest();
  console.log('STATUS', JSON.stringify(status));
  ck(status.onScreen===true && status.reachable===true,
     'the status/portrait cards bury the dev toggle: '+JSON.stringify(status));
  await pg.evaluate(()=>{ closeStatus(); hidePortrait(); });

  /* ---------- 5. the delivery-driver and DOGPARK gear icons got the same fix ---------- */
  const others = await pg.evaluate(()=>{
    const out={};
    for(const id of ['runDevToggle','pkDevToggle','pbDevToggle']){
      const el=document.getElementById(id);
      out[id]=el?getComputedStyle(el).zIndex:'missing';
    }
    return out;
  });
  console.log('OTHERZ', JSON.stringify(others));
  ck(+others.runDevToggle>=90, 'runDevToggle is still low z-index: '+others.runDevToggle);
  ck(+others.pkDevToggle>=90, 'pkDevToggle is still low z-index: '+others.pkDevToggle);
  ck(+others.pbDevToggle>=90, 'pbDevToggle is still low z-index: '+others.pbDevToggle);

  await pg.evaluate(()=>document.getElementById('devbar').classList.add('hidden'));
  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npdevesc PASS');
})();
