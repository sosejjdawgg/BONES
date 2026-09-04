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
  await pg.waitForTimeout(1600);

  /* Drive the arrival by hand: introT is the only clock, so the whole beat is reproducible
     without waiting on a single frame of wall time. */
  await pg.evaluate(()=>{
    PK.plusMode=true; PK.bossDone=false; PK.bossArmed=false;
    pkBossStart();
    // stop the rAF loop from also advancing it: park each step ourselves
    window.__stop=true;
  });
  const cfg = await pg.evaluate(()=>({
    ROAR_A:BOSS_ROAR_A, SCREAM_A:BOSS_SCREAM_A, SCREAM_B:BOSS_SCREAM_B, FAN:BOSS_SCREAM_FAN,
    CAGE_A:BOSS_CAGE_A, LEN:BOSS_CAGE_LEN, SNAP:BOSS_CAGE_SNAP, BUILT:BOSS_CAGE_BUILT,
    GROWN:BOSS_CAGE_GROWN, TINY:BOSS_CAGE_TINY, INTRO:BOSS_INTRO, SET_A:BOSS_SET_A,
    box:BOSS.box, band:BOSS_BAND}));
  console.log('CFG    ', JSON.stringify(cfg));
  ck(cfg.INTRO===cfg.CAGE_A+cfg.LEN, 'the intro does not end when the cage does');
  ck(cfg.SET_A===cfg.CAGE_A, 'the dog goes live at a different moment from the cage');

  /* ---------- 1. the scream is short, and it is on his face ---------- */
  // Trap every triangle the scream fills, in screen space, and measure it against the head.
  const scream = await pg.evaluate(async (cfg)=>{
    const rec=[];
    const cv=document.querySelector('#bosscv'), ctx=cv.getContext('2d');
    let pen=null, capture=false;
    const mt=ctx.moveTo.bind(ctx), lt=ctx.lineTo.bind(ctx), bp=ctx.beginPath.bind(ctx),
          fl=ctx.fill.bind(ctx);
    ctx.beginPath=function(){ pen=[]; return bp(); };
    ctx.moveTo=function(x,y){ if(pen)pen.push([x,y]); return mt(x,y); };
    ctx.lineTo=function(x,y){ if(pen)pen.push([x,y]); return lt(x,y); };
    ctx.fill=function(){ if(capture && pen && pen.length===3) rec.push(pen.slice()); return fl(); };
    // step the clock straight to the scream's peak
    BOSS.introT=cfg.ROAR_A+cfg.SCREAM_A+0.12;
    pkBossUpdate(0.001);
    capture=true; pkDrawBoss(); capture=false;
    ctx.beginPath=bp; ctx.moveTo=mt; ctx.lineTo=lt; ctx.fill=fl;
    const hx=BOSS.headX, hy=BOSS.headY, band=cv.clientHeight*cfg.band;
    const out=rec.map(tri=>{
      // the apex is the tip; the base is the two points closest together
      const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
      const pairs=[[0,1,2],[1,2,0],[0,2,1]].sort((p,q)=>d(tri[p[0]],tri[p[1]])-d(tri[q[0]],tri[q[1]]));
      const base=[tri[pairs[0][0]],tri[pairs[0][1]]], tip=tri[pairs[0][2]];
      const bx=(base[0][0]+base[1][0])/2, by=(base[0][1]+base[1][1])/2;
      return { anchorD:Math.hypot(bx-hx,by-hy), len:Math.hypot(tip[0]-bx,tip[1]-by),
               ang:Math.atan2(by-hy,bx-hx) };
    });
    // the head sprite's own drawn half-extents, which is what "on the face" has to mean
    const hcell=WOLF["head_"+bossHeadNow()]||WOLF.head_front, hsc=band/480;
    const HW=hcell.w*hsc/2, HH=hcell.h*hsc/2;
    const tipD=out.map(o=>o.anchorD+o.len);
    return {n:out.length, band:Math.round(band), HW:Math.round(HW), HH:Math.round(HH),
            maxAnchor:Math.round(Math.max(...out.map(o=>o.anchorD))),
            minAnchor:Math.round(Math.min(...out.map(o=>o.anchorD))),
            maxLen:Math.round(Math.max(...out.map(o=>o.len))),
            minLen:Math.round(Math.min(...out.map(o=>o.len))),
            maxTip:Math.round(Math.max(...tipD)),
            head:{x:Math.round(hx),y:Math.round(hy)}};
  }, cfg);
  console.log('SCREAM ', JSON.stringify(scream));
  ck(scream.n>=12 && scream.n<=16, 'wrong number of rays: '+scream.n);
  /* Every ray leaves from the head's OUTLINE. Inside it a ray is a scratch on his own fur (the
     first attempt at this, invisible in every frame); far outside it, it is a laser off the body
     (the version before that). So: no apex further out than the sprite's own half-diagonal, and
     none of them inside the smaller half-extent either. */
  const halfDiag=Math.hypot(scream.HW,scream.HH);
  ck(scream.maxAnchor <= halfDiag+8,
     'a ray is anchored off the body ('+scream.maxAnchor+'px, head half-diagonal '+Math.round(halfDiag)+')');
  ck(scream.minAnchor >= Math.min(scream.HW,scream.HH)-8,
     'a ray starts inside his own fur: '+scream.minAnchor+' vs '+Math.min(scream.HW,scream.HH));
  // ...and none of them is a beam
  ck(scream.maxLen <= scream.band*0.30,
     'a ray is longer than 30% of the band: '+scream.maxLen+' of '+scream.band);
  ck(scream.minLen > 4, 'a ray has no length at all');
  // the whole halo stays tight to the head rather than reaching down the body
  ck(scream.maxTip <= scream.band*0.58,
     'the halo reaches too far from the head: '+scream.maxTip+' of '+scream.band);

  // it is over well before the roar is
  const win = await pg.evaluate(async (cfg)=>{
    const cv=document.querySelector('#bosscv'), ctx=cv.getContext('2d');
    const fl=ctx.fill.bind(ctx), bp=ctx.beginPath.bind(ctx), mt=ctx.moveTo.bind(ctx), lt=ctx.lineTo.bind(ctx);
    let pen=null, n=0, capture=false;
    ctx.beginPath=function(){ pen=[]; return bp(); };
    ctx.moveTo=function(x,y){ if(pen)pen.push([x,y]); return mt(x,y); };
    ctx.lineTo=function(x,y){ if(pen)pen.push([x,y]); return lt(x,y); };
    ctx.fill=function(){ if(capture && pen && pen.length===3) n++; return fl(); };
    const seen=[];
    for(let r=0; r<=1.0; r+=0.02){
      BOSS.introT=cfg.ROAR_A+r; pkBossUpdate(0.001);
      n=0; capture=true; pkDrawBoss(); capture=false;
      if(n>0) seen.push(+r.toFixed(2));
    }
    ctx.beginPath=bp; ctx.moveTo=mt; ctx.lineTo=lt; ctx.fill=fl;
    return {first:seen[0], last:seen[seen.length-1], span:seen.length};
  }, cfg);
  console.log('WINDOW ', JSON.stringify(win));
  ck(win.first>=cfg.SCREAM_A-0.03 && win.first<=cfg.SCREAM_A+0.03, 'the scream starts late/early: '+win.first);
  ck(win.last<=cfg.SCREAM_B, 'the scream outlives its window: '+win.last);
  ck(win.last<0.60, 'the scream lingers past the roar: '+win.last);

  /* ---------- 2. the cage: snap tiny, build, grow, lock ---------- */
  const cage = await pg.evaluate(async (cfg)=>{
    const B={...BOSS.box};
    // pkBossIntroTick advances introT ITSELF, so park the clock a step short and let it land
    const at=c=>{ BOSS.introT=cfg.CAGE_A+c*cfg.LEN-0.001; pkBossUpdate(0.001);
      return bossCageRect(BOSS.box, bossCageGrow(bossCageK())); };
    const samp={};
    samp.pre   =at(0.02);
    samp.snap  =at(0.06);
    samp.build =at(0.30);
    samp.mid   =at(0.45);
    // the whole opening, so its SHAPE can be checked rather than one point on it
    samp.curve =(()=>{ const o=[]; for(let c=BOSS_CAGE_BUILT;c<=0.995;c+=0.01) o.push(+at(c).w.toFixed(2)); return o; })();
    samp.peak  =(()=>{ let best=null; for(let c=0.50;c<=0.85;c+=0.005){ const r=at(c);
        if(!best||r.w>best.w) best={...r,c:+c.toFixed(3)}; } return best; })();
    samp.grown =at(0.85);
    samp.lock  =at(0.995);
    return {B, ...samp,
            dog:{x:BOSS.dog.x,y:BOSS.dog.y}, cage:{x:BOSS.cageX,y:BOSS.cageY},
            flags:{snap:BOSS.cageSnap, grow:BOSS.cageGrow, lock:BOSS.cageLock, seal:+BOSS.seal.toFixed(2)}};
  }, cfg);
  const R=r=>({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.w),h:Math.round(r.h)});
  console.log('CAGE   ', JSON.stringify({B:R(cage.B), snap:R(cage.snap), build:R(cage.build),
    mid:R(cage.mid), peak:R(cage.peak), grown:R(cage.grown), lock:R(cage.lock),
    peakAt:cage.peak.c, flags:cage.flags}));
  ck(Math.abs(cage.snap.w-cfg.TINY)<0.5, 'the snap box is not tiny: '+cage.snap.w);
  ck(Math.abs(cage.build.w-cfg.TINY)<0.5, 'it grew before it finished building: '+cage.build.w);
  ck(cage.mid.w>cage.build.w && cage.mid.w<cage.B.w,
     'the grow does not pass through the middle: '+cage.mid.w+' (box '+cage.B.w+')');
  { /* An ease-out with an overshoot has exactly one shape: strictly up to a single peak, then
       strictly back down to the box. Anything else is a wobble, not a settle. */
    const cv=cage.curve, pi=cv.indexOf(Math.max(...cv));
    const up=cv.slice(0,pi+1).every((v,i)=>i===0||v>cv[i-1]);
    // ...non-increasing, not strictly: past BOSS_CAGE_GROWN it is parked on the box for the lock
    const down=cv.slice(pi).every((v,i)=>i===0||v<=cv[pi+i-1]);
    const flat=cv.slice(pi).filter((v,i)=>i>0 && v===cv[pi+i-1]).length;
    console.log('CURVE  ', JSON.stringify({n:cv.length, peakAt:pi, first:cv[0], peak:cv[pi],
      last:cv[cv.length-1], up, down, heldAtFull:flat}));
    ck(up,   'the cage does not open monotonically up to its peak');
    ck(down, 'it does not settle monotonically back onto the board');
    ck(pi>0 && pi<cv.length-1, 'the peak is at an end, so there is no settle at all');
    ck(flat>=10, 'it never parks on the box before the lock: '+flat+' held frames'); }
  ck(cage.peak.w>cage.B.w, 'no overshoot at all: peak '+cage.peak.w+' vs box '+cage.B.w);
  { const os=(cage.peak.w-34)/(cage.B.w-34);      // as a share of the DISTANCE it travelled
    console.log('OVER   ', JSON.stringify({s:+os.toFixed(4), at:cage.peak.c}));
    ck(os>1.035 && os<1.065, 'the overshoot is not the ~5% the beat wants: '+os.toFixed(4)); }
  ck(Math.abs(cage.grown.w-cage.B.w)<0.6 && Math.abs(cage.grown.h-cage.B.h)<0.6,
     'it does not settle on the board: '+JSON.stringify(R(cage.grown)));
  ck(Math.abs(cage.lock.w-cage.B.w)<0.6, 'the lock is not at full size');
  ck(cage.flags.snap && cage.flags.grow && cage.flags.lock, 'a cage beat never fired: '+JSON.stringify(cage.flags));
  ck(cage.flags.seal>0.9, 'the park never sealed: '+cage.flags.seal);

  // the tiny box is centred on BONES, and he is inside the rect at every step
  const inside = await pg.evaluate(async (cfg)=>{
    let bad=[]; let worst=0;
    for(let c=cfg.SNAP; c<=0.99; c+=0.01){
      BOSS.introT=cfg.CAGE_A+c*cfg.LEN-0.016; pkBossUpdate(0.016);
      const B=BOSS.box, R=bossCageRect(B,bossCageGrow(bossCageK()));
      const dx=B.x+BOSS.dog.x, dy=B.y+BOSS.dog.y;
      const m=Math.min(dx-R.x, R.x+R.w-dx, dy-R.y, R.y+R.h-dy);
      if(m<0) bad.push({c:+c.toFixed(2), m:+m.toFixed(1)});
      if(!bad.length) worst=Math.max(worst,0);
    }
    return {bad, badN:bad.length};
  }, cfg);
  console.log('INSIDE ', JSON.stringify(inside));
  ck(inside.badN===0, 'BONES was outside the cage: '+JSON.stringify(inside.bad.slice(0,4)));

  // ...and it holds even when he is driving into a wall the whole time
  const pinned = await pg.evaluate(async (cfg)=>{
    pkBossReset(); pkBossStart(); BOSS.introT=cfg.CAGE_A;
    let bad=0, drifted=0;
    for(let c=0; c<=0.99; c+=0.01){
      BOSS.joy={dx:1,dy:1};                       // hard into the bottom-right corner, all beat
      BOSS.introT=cfg.CAGE_A+c*cfg.LEN-0.016; pkBossUpdate(0.016);
      const B=BOSS.box, R=bossCageRect(B,bossCageGrow(bossCageK()));
      const dx=B.x+BOSS.dog.x, dy=B.y+BOSS.dog.y;
      if(dx<R.x-0.5||dx>R.x+R.w+0.5||dy<R.y-0.5||dy>R.y+R.h+0.5) bad++;
      if(BOSS.dog.x<0||BOSS.dog.x>B.w||BOSS.dog.y<0||BOSS.dog.y>B.h) drifted++;
    }
    BOSS.joy=null;
    return {bad, drifted};
  }, cfg);
  console.log('PINNED ', JSON.stringify(pinned));
  ck(pinned.bad===0,     'running at the wall pushed him out of the cage on '+pinned.bad+' frames');
  ck(pinned.drifted===0, 'he wrapped through the cage wall onto the far side of the board');

  // nothing is thrown until it has finished
  const quiet = await pg.evaluate(async (cfg)=>{
    pkBossReset(); pkBossStart();
    let firedAt=null, tele=null;
    for(let c=0; c<=0.99; c+=0.01){
      BOSS.introT=cfg.CAGE_A+c*cfg.LEN-0.016; pkBossUpdate(0.016);
      if(BOSS.bullets.length && firedAt===null) firedAt=+c.toFixed(2);
      if(BOSS.ph!=="intro" && tele===null) tele=+c.toFixed(2);
    }
    return {firedAt, tele, ph:BOSS.ph, bullets:BOSS.bullets.length};
  }, cfg);
  console.log('QUIET  ', JSON.stringify(quiet));
  const after = await pg.evaluate(()=>{
    // one more step takes it past BOSS_INTRO: the cage must hand the board back untouched
    BOSS.introT=BOSS_INTRO; pkBossUpdate(0.016);
    return {k:bossCageK(), ph:BOSS.ph, box:{w:Math.round(BOSS.box.w),h:Math.round(BOSS.box.h)}};
  });
  console.log('AFTER  ', JSON.stringify(after));
  ck(after.k===-1, 'the cage is still claiming the board after the intro');
  ck(after.ph!=="intro", 'the intro never ended');
  ck(quiet.firedAt===null, 'a bullet was thrown during the cage, at c='+quiet.firedAt);
  ck(quiet.tele===null || quiet.tele>=1.0, 'the fight armed before the cage locked: '+quiet.tele);

  /* ---------- 3. reduceMotion gets the beat without the kick ---------- */
  const calm = await pg.evaluate(async (cfg)=>{
    const was=SETTINGS.reduceMotion; SETTINGS.reduceMotion=true;
    let peak=0; const B=BOSS.box;
    for(let c=0.35;c<=0.995;c+=0.005){
      BOSS.introT=cfg.CAGE_A+c*cfg.LEN-0.001; pkBossUpdate(0.001);
      peak=Math.max(peak, bossCageRect(B,bossCageGrow(bossCageK())).w);
    }
    const end=bossCageGrow(1.0);
    SETTINGS.reduceMotion=was;
    return {peak:Math.round(peak), boxW:Math.round(B.w), end:+end.toFixed(3)};
  }, cfg);
  console.log('CALM   ', JSON.stringify(calm));
  ck(calm.peak<=calm.boxW+0.6, 'reduceMotion still overshoots: '+calm.peak+' vs '+calm.boxW);
  ck(Math.abs(calm.end-1)<0.001, 'reduceMotion does not reach full size');

  /* ---------- 4. a real, un-driven arrival still gets there ---------- */
  await pg.evaluate(()=>{ pkBossReset(); pkBossStart(); });
  await pg.waitForFunction(()=>BOSS.ph!=="intro", null, {timeout:20000, polling:60}).catch(()=>{});
  const real = await pg.evaluate(()=>({ph:BOSS.ph, introT:+BOSS.introT.toFixed(2),
    lock:BOSS.cageLock, seal:+BOSS.seal.toFixed(2), box:BOSS.box.w>0}));
  console.log('REAL   ', JSON.stringify(real));
  ck(real.ph!=="intro", 'the arrival never finished on its own');
  ck(real.lock===true, 'the real arrival never locked the cage');

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL ROAR/CAGE CHECKS PASS');
  await b.close();
})();
