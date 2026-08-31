/* v0.346a: THE FIVE THINGS ASKED FOR, EACH PINNED TO THE THING THAT WOULD BREAK IT AGAIN.
   1. the music is back in the file and is actually audio, not an empty string that "exists"
   2. day -> night is a FADE, so the test is continuity: no step anywhere on the clock face,
      and specifically none across midnight, which is where the old code snapped back to noon
   3. the moon starts climbing as the dark completes - so moonrise and the end of dusk are one
      instant, checked as such rather than as two numbers that happen to both be 19
   4. the smash is a big CENTRAL hole: measured by where the dark pixels actually are inside the
      pane, not by whether some drawing code ran
   5. UNLEASHED is a night door and REGULAR is not - and the lock has to actually refuse, so each
      case is driven through the real button and then asked whether a run started. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.346a.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(2100);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);

  /* ---------- 1. THE MUSIC IS IN THE FILE ---------- */
  /* v0.336a stripped these to keep the build small and nobody noticed for ten versions, because
     nothing ever asserted on them - a silent game looks exactly like a working one in a
     screenshot. A length floor as well as a prefix: "data:audio/mpeg;base64," on its own is a
     valid-looking URI with no song in it. */
  const music = await pg.evaluate(()=>{
    const out={};
    for(const k of ['MUSIC_GOODMOOD','MUSIC_DOGPARK','MUSIC_BOSS']){
      const v = (typeof window[k]==='string') ? window[k] : (eval('typeof '+k+'==="string"') ? eval(k) : null);
      out[k] = v===null ? {missing:true} : {
        len:v.length, pre:v.slice(0,22),
        // base64 payload must decode: a truncated tail is the other way this dies quietly
        ok:(()=>{ try{ const p=v.slice(v.indexOf(',')+1); return atob(p.slice(0,4096)).length>0; }catch(e){ return false; } })()
      };
    }
    return out;
  });
  console.log('MUSIC ', JSON.stringify(music));
  for(const k of ['MUSIC_GOODMOOD','MUSIC_DOGPARK','MUSIC_BOSS']){
    const m=music[k];
    ck(!m.missing, k+' is not defined at all - the music was stripped again');
    if(m.missing) continue;
    ck(m.pre==='data:audio/mpeg;base64', k+' is not an mpeg data URI: "'+m.pre+'"');
    ck(m.len>200000, k+' is only '+m.len+' chars - that is not a song');
    ck(m.ok===true, k+' base64 does not decode');
  }

  /* ---------- 2. DAY -> NIGHT IS A FADE ---------- */
  /* The reported bug is a FLICK, so the assertion is on the derivative, not on any one value.
     Sampled every 3 minutes of game time right round the clock and wrapped past midnight, because
     the old bug lived exactly at the wrap: 23:59 dark, 00:00 broad daylight. */
  const fade = await pg.evaluate(()=>{
    const keep=CLK.h, sleeping=SLEEP.active; SLEEP.active=false;
    const N=480, vals=[];
    for(let i=0;i<N;i++){ CLK.h=i*24/N; vals.push(nightAmount()); }
    let worst=0, worstAt=-1;
    for(let i=0;i<N;i++){
      const j=(i+1)%N;                       // ...the wrap is just another step
      const d=Math.abs(vals[j]-vals[i]);
      if(d>worst){ worst=d; worstAt=i*24/N; }
    }
    const at=h=>{ CLK.h=h; return +nightAmount().toFixed(3); };
    const o={ worst:+worst.toFixed(4), worstAt:+worstAt.toFixed(2),
              noon:at(12), h16:at(16), h17:at(17), h18:at(18), h19:at(19),
              mid:at(0), h4:at(4), h5:at(5), h6:at(6), h7:at(7), h9:at(9) };
    CLK.h=keep; SLEEP.active=sleeping;
    return o;
  });
  console.log('FADE  ', JSON.stringify(fade));
  ck(fade.worst<0.05, 'the light still jumps '+fade.worst+' in one 3-minute step at '+fade.worstAt+':00 - that is the flick');
  ck(fade.noon===0, 'midday is not full daylight: '+fade.noon);
  ck(fade.mid===1,  'MIDNIGHT IS NOT DARK ('+fade.mid+') - this is the old snap-back at the wrap');
  ck(fade.h4===1,   '04:00 is not dark: '+fade.h4);
  ck(fade.h9===0,   '09:00 is not full daylight: '+fade.h9);
  ck(fade.h16<fade.h17 && fade.h17<fade.h18 && fade.h18<fade.h19,
     'dusk does not darken monotonically: '+[fade.h16,fade.h17,fade.h18,fade.h19].join(','));
  ck(fade.h5>fade.h6 && fade.h6>fade.h7, 'dawn does not lighten monotonically: '+[fade.h5,fade.h6,fade.h7].join(','));
  ck(fade.h19===1 && fade.h5===1, 'the night is not fully dark at its own two edges');
  // ...and the fade is LONG. A "slower fade" that takes ten minutes is the same complaint again.
  const span = await pg.evaluate(()=>{
    const keep=CLK.h, sl=SLEEP.active; SLEEP.active=false;
    let lo=99, hi=-1;
    for(let h=6;h<20;h+=0.02){ CLK.h=h; const n=nightAmount();
      if(n>0.02 && lo>90) lo=h; if(n<0.98) hi=h; }
    CLK.h=keep; SLEEP.active=sl;
    return {start:+lo.toFixed(2), end:+hi.toFixed(2)};
  });
  console.log('SPAN  ', JSON.stringify(span));
  ck(span.end-span.start>1.5, 'the whole day->night fade takes only '+((span.end-span.start)*60).toFixed(0)+' game-minutes');

  /* ---------- 3. THE MOON RISES AS THE DARK COMPLETES ---------- */
  const moon = await pg.evaluate(()=>{
    const keep=CLK.h, sl=SLEEP.active; SLEEP.active=false;
    const at=h=>{ CLK.h=h; const m=moonSky(); return m?{u:+m.u.toFixed(3), elev:+m.elev.toFixed(3), gain:+m.gain.toFixed(3)}:null; };
    const o={ riseConst:MOON_RISE, setConst:MOON_SET, duskEnd:DUSK_END,
              h12:at(12), h18:at(18), h1850:at(18.9), h1910:at(19.1), h21:at(21),
              h0:at(0), h3:at(3), h48:at(4.8), h6:at(6),
              nightAtRise:(CLK.h=MOON_RISE, +nightAmount().toFixed(3)) };
    // ...and it climbs, hour after hour, rather than appearing already high
    const climb=[];
    for(const h of [19.2,20,21,22,23]){ CLK.h=h; const m=moonSky(); climb.push(m?+m.elev.toFixed(3):-1); }
    o.climb=climb;
    CLK.h=keep; SLEEP.active=sl;
    return o;
  });
  console.log('MOON  ', JSON.stringify(moon));
  ck(moon.duskEnd===moon.riseConst,
     'dusk ends at '+moon.duskEnd+' but the moon rises at '+moon.riseConst+' - the sky and the clock disagree');
  ck(moon.h12===null && moon.h18===null && moon.h1850===null, 'there is a moon in the daylight');
  ck(moon.h1910!==null, 'the moon has not started to rise at 19:06, just after dark');
  ck(moon.h6===null, 'the moon is still up at 06:00');
  ck(moon.h1910.elev<0.10, 'the moon POPS IN already high at 19:06: elev '+moon.h1910.elev);
  ck(moon.climb.every((v,i)=>i===0||v>moon.climb[i-1]),
     'the moon does not climb through the evening: '+moon.climb.join(','));
  ck(moon.h0.elev>0.9, 'the moon is not at its highest around midnight: '+moon.h0.elev);
  ck(moon.h48.elev<0.15, 'the moon has not come back down by 04:48: '+moon.h48.elev);
  ck(moon.nightAtRise===1, 'the room is not fully dark at the moment the moon rises: '+moon.nightAtRise);

  /* ...and the moon LIGHTS the room. Capping the night tint stopped the room going pitch black,
     but a flat sheet over ten hours dimmed the moon along with the carpet; the wash is what makes
     the night a lit scene rather than a grey one, so it is pinned to the moon that casts it. */
  const wash = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const keepB={owned:S.blindsOwned, shut:S.blindsShut, tier:S.blindsTier};
    const cv=document.getElementById('dogcv'), g=cv.getContext('2d');
    // a patch of floor under the window, where the pool falls
    const patch=()=>{ const d=g.getImageData(Math.round(cv.width*0.55),Math.round(cv.height*0.50),
                                             Math.round(cv.width*0.14),Math.round(cv.height*0.10)).data;
      let t=0; for(let o=0;o<d.length;o+=4) t+=(d[o]+d[o+1]+d[o+2])/3;
      return +(t/(d.length/4)).toFixed(1); };
    S.blindsOwned=false; S.blindsShut=false; SLEEP.active=false;
    CLK.h=0;    await sleep(420); const high=patch();
    CLK.h=19.1; await sleep(420); const low=patch();
    CLK.h=0; S.blindsOwned=true; S.blindsShut=true; S.blindsTier=2;
    await sleep(420); const sealed=patch();
    S.blindsOwned=keepB.owned; S.blindsShut=keepB.shut; S.blindsTier=keepB.tier;
    await sleep(200);
    return {high, low, sealed};
  });
  console.log('WASH  ', JSON.stringify(wash));
  ck(wash.high>wash.low+3, 'the moon at its highest lights the room no better than the moment it rose: '
     +wash.high+' vs '+wash.low);
  ck(wash.sealed<wash.high-3, 'the moonlight comes through shut blinds: '+wash.sealed+' vs '+wash.high);

  /* ---------- 4. THE SMASH IS A BIG CENTRAL HOLE ---------- */
  /* Measured, not assumed. Point samples were the wrong instrument here and said so loudly: the
     pane carries blind slats and a white centre bar, so a single pixel at the middle read 254
     (the bar) and the corners read 23 (a slat) on a perfectly good hole. Regions instead, and the
     comparison is against the SAME pane unbroken - which is the only way to tell a hole from a
     window that was always dark. */
  const smash = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const keep=CLK.h; CLK.h=12; SLEEP.active=false;
    S.winBroken=false; S.winCracks=0; S.blindsShut=false;
    await sleep(500);
    const cv=document.getElementById('dogcv'), cx=cv.getContext('2d');
    const dpr=cv.width/cv.clientWidth;
    const PX=f=>Math.round((WIN_X+WIN_W*f)*cv.clientWidth*dpr);
    const PY=f=>Math.round((WIN_Y+WIN_H*f)*cv.clientHeight*dpr);
    // mean luminance over a fractional sub-rect of the pane
    const mean=(x0,y0,x1,y1)=>{
      const a=PX(x0), b=PY(y0), w=PX(x1)-a, h=PY(y1)-b;
      const d=cx.getImageData(a,b,w,h).data;
      let t=0; for(let o=0;o<d.length;o+=4) t+=(d[o]+d[o+1]+d[o+2])/3;
      return t/(d.length/4);
    };
    /* The grid itself comes back, not a verdict about it. An absolute "how many pixels are
       near-black" was calibrated to the version that filled the glass opaque - now that the glass
       is a glaze and the opening is shaded rather than blacked out, the hole at midday averages
       ~115, and a threshold at 52 finds nothing while the hole is plainly there. What "the window
       broke HERE" means is where the pane CHANGED, so the pane is sampled twice and differenced. */
    const grid=()=>{
      const x0=PX(0.10), y0=PY(0.10), x1=PX(0.90), y1=PY(0.90);
      const d=cx.getImageData(x0,y0,x1-x0,y1-y0), W=x1-x0, H=y1-y0;
      const g=[]; 
      for(let j=0;j<H;j+=2){ const row=[];
        for(let i=0;i<W;i+=2){ const o=(j*W+i)*4; row.push((d.data[o]+d.data[o+1]+d.data[o+2])/3); }
        g.push(row); }
      return g;
    };
    const read=()=>{
      // the white centre bar: how much of the middle column is still bar-bright
      const bar=cx.getImageData(PX(0.49),PY(0.30),Math.max(2,PX(0.51)-PX(0.49)),PY(0.70)-PY(0.30));
      let lit=0; for(let o=0;o<bar.data.length;o+=4)
        if((bar.data[o]+bar.data[o+1]+bar.data[o+2])/3 > 170) lit++;
      return { g:grid(),
               inner:+mean(0.33,0.33,0.67,0.67).toFixed(1),
               edge:+((mean(0.06,0.06,0.94,0.20)+mean(0.06,0.80,0.94,0.94))/2).toFixed(1),
               bar:+(lit/(bar.data.length/4)).toFixed(3) };
    };
    const before=read();
    S.winBroken=true; await sleep(500);
    const after=read();
    S.winBroken=false; CLK.h=keep; await sleep(300);
    return {before,after};
  });
  const A=smash.after, B=smash.before;
  // where the pane changed, and how much of it: the break itself, isolated from the sky behind it
  /* THE GLAZE MOVES EVERY PIXEL A LITTLE; THE HOLE MOVES ITS OWN PIXELS A LOT. At a threshold of
     18 the whole pane counts as "changed" (0.81 of it) because the remaining glass picked up a
     glaze it did not have before - which is real, and is not the break. The break is the part
     that changed HARD, so the threshold is set above the glaze and the numbers at both are
     printed, so a future version that inverts them again is visible rather than merely failing. */
  const H=B.g.length, W=B.g[0].length;
  const measure=(thr)=>{
    let hit=0,n=0,sx=0,sy=0,minx=9,maxx=-9,miny=9,maxy=-9;
    for(let j=0;j<H;j++) for(let i=0;i<W;i++){
      n++;
      if(Math.abs(B.g[j][i]-A.g[j][i])>thr){
        hit++; sx+=i/W; sy+=j/H;
        if(i/W<minx)minx=i/W; if(i/W>maxx)maxx=i/W;
        if(j/H<miny)miny=j/H; if(j/H>maxy)maxy=j/H;
      }
    }
    return {frac:hit/n, cx:hit?sx/hit:-1, cy:hit?sy/hit:-1, minx,maxx,miny,maxy, hit};
  };
  const glaze=measure(18), M=measure(38);
  console.log('DELTA ', JSON.stringify({glaze:+glaze.frac.toFixed(3), hard:+M.frac.toFixed(3)}));
  const frac=M.frac, ccx=M.cx, ccy=M.cy;
  const minx=M.minx, maxx=M.maxx, miny=M.miny, maxy=M.maxy;
  console.log('SMASH ', JSON.stringify({frac:+frac.toFixed(3), cx:+ccx.toFixed(3), cy:+ccy.toFixed(3),
    box:[minx,miny,maxx,maxy].map(v=>+v.toFixed(2)),
    inner:[B.inner,A.inner], edge:[B.edge,A.edge], bar:[B.bar,A.bar]}));
  ck(frac>0.15, 'the break is tiny - only '+(frac*100).toFixed(1)+'% of the pane broke through');
  ck(frac<0.70, 'the whole pane broke through - the glass has not broken, it has vanished');
  ck(glaze.frac>frac, 'the glass around the break did not change at all - it is not glazed, it is gone');
  ck(Math.abs(ccx-0.5)<0.12, 'the break is not central across: centroid x '+ccx.toFixed(3));
  ck(Math.abs(ccy-0.5)<0.12, 'the break is not central down: centroid y '+ccy.toFixed(3));
  // ...and it is a LARGE break, spanning most of the pane rather than a chip in the middle
  ck((maxx-minx)>0.55 && (maxy-miny)>0.55,
     'the break is small: it spans '+((maxx-minx)*100).toFixed(0)+'% x '+((maxy-miny)*100).toFixed(0)+'% of the pane');
  // the MIDDLE is what darkened, and it darkened relative to the pane's own edges - which is the
  // difference between "a hole in the middle" and "the window went dark"
  ck(A.inner < A.edge-18,
     'the middle of a smashed pane is not the dark part: inner '+A.inner+' vs edge '+A.edge);
  ck((B.inner-A.inner) > (B.edge-A.edge)+15,
     'the break darkened the edges as much as the centre - that is not a central hole: '
     +'inner '+B.inner+'->'+A.inner+', edge '+B.edge+'->'+A.edge);
  // ...and the frame's centre bar is broken through with it, rather than running across the hole
  ck(B.bar>0.30, 'the intact pane has no centre bar to break - this measurement is pointing at nothing: '+B.bar);
  ck(A.bar<0.10, 'the white centre bar still runs straight across the hole: '+A.bar+' of it is lit');

  /* ---------- 5. UNLEASHED IS A NIGHT DOOR; REGULAR IS ALWAYS OPEN ---------- */
  const gate = await pg.evaluate(()=>({ ok19:(CLK.h=19, unleashedHoursOk()), ok23:(CLK.h=23, unleashedHoursOk()),
                                        ok03:(CLK.h=3, unleashedHoursOk()), ok0459:(CLK.h=4.99, unleashedHoursOk()),
                                        ok05:(CLK.h=5, unleashedHoursOk()), ok12:(CLK.h=12, unleashedHoursOk()),
                                        ok1859:(CLK.h=18.99, unleashedHoursOk()) }));
  console.log('GATE  ', JSON.stringify(gate));
  ck(gate.ok19 && gate.ok23 && gate.ok03 && gate.ok0459, 'the night window rejects a real night hour: '+JSON.stringify(gate));
  ck(!gate.ok05 && !gate.ok12 && !gate.ok1859, 'the night window is open in daylight: '+JSON.stringify(gate));

  // drive it for real, through the button, at both hours
  const tryUnleashed = (h)=>pg.evaluate(async(H)=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    PK.active=false; showScreen('home'); CLK.h=H; S.snacks=9999; S.lvl=20; S.sick=false;
    S.energy=S.hunger=S.mood=100;
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    reallyEnterDogpark();
    await sleep(220);
    const btns=[...document.querySelectorAll('#choice button')];
    const lab=btns.map(b=>b.textContent.trim());
    const un=btns.find(b=>/UNLEASHED/.test(b.textContent));
    if(!un) return {noButton:true, lab};
    un.click(); await sleep(500);
    const started={park:PK.active, mode:MODE, plus:PK.plusMode};
    PK.active=false; showScreen('home');
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    return {lab, btn:un.textContent.trim(), ...started};
  }, h);

  const day = await tryUnleashed(12);
  console.log('DAY   ', JSON.stringify(day));
  ck(!day.noButton, 'no UNLEASHED button in the park choice: '+JSON.stringify(day.lab));
  ck(day.park!==true, 'DOGPARK UNLEASHED STARTED AT MIDDAY - the night lock does nothing');
  ck((day.btn||'').indexOf('\u{1F31A}')===0,
     'the daytime UNLEASHED button does not say it is locked: "'+day.btn+'"');

  await pg.waitForTimeout(400);
  const night = await tryUnleashed(21);
  console.log('NIGHT ', JSON.stringify(night));
  ck(night.park===true && night.mode==='park', 'UNLEASHED will not start at 21:00 either: '+JSON.stringify(night));
  ck(night.plus===true, 'it started, but not in UNLEASHED mode: '+JSON.stringify(night));

  // REGULAR is untouched: middle of the day, straight in
  await pg.waitForTimeout(400);
  const reg = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    PK.active=false; showScreen('home'); CLK.h=12; S.lvl=20; S.snacks=0;
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    reallyEnterDogpark(); await sleep(220);
    const btn=[...document.querySelectorAll('#choice button')].find(b=>/REGULAR/.test(b.textContent));
    if(!btn) return {noButton:true};
    btn.click(); await sleep(500);
    const o={park:PK.active, mode:MODE, plus:PK.plusMode};
    PK.active=false; showScreen('home');
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    return o;
  });
  console.log('REG   ', JSON.stringify(reg));
  ck(reg.park===true && reg.mode==='park', 'REGULAR no longer works at midday - the lock caught the wrong door: '+JSON.stringify(reg));
  ck(reg.plus!==true, 'REGULAR started an UNLEASHED run');

  // ...and the OTHER door into UNLEASHED, from the bone-treats pitch, is locked the same way.
  // Two entry points is exactly how a gate ends up half-applied.
  await pg.waitForTimeout(400);
  const advice = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    for(const H of [12,21]){
      PK.active=false; showScreen('home'); CLK.h=H;
      for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
      pkUnleashedAdvice(); await sleep(220);
      const btn=[...document.querySelectorAll('#choice button')].find(b=>/GO/.test(b.textContent));
      if(!btn){ out['h'+H]={noButton:true}; continue; }
      btn.click(); await sleep(500);
      out['h'+H]={park:PK.active, plus:PK.plusMode};
      PK.active=false; showScreen('home');
      for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
      await sleep(250);
    }
    return out;
  });
  console.log('ADVICE', JSON.stringify(advice));
  ck(advice.h12 && advice.h12.park!==true, 'the bone-treats GO button walks straight past the night lock at midday');
  ck(advice.h21 && advice.h21.park===true, 'the bone-treats GO button will not start UNLEASHED at night either');

  await pg.waitForTimeout(300);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npnight PASS');
})();
