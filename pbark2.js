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

  /* ---------- 1. five tiers: four cones, then the circle ---------- */
  const lad = await pg.evaluate(()=>{
    const out={cone:BARK_CONE.slice(), range:BARK_RANGE.slice(), cap:BARK_LVL_CAP,
               rows:BARK_ROW.slice(), fx:BARK_FX.slice(), base:PK.barkR, ranks:[]};
    for(let lv=0; lv<BARK_CONE.length; lv++){
      PK.barkBigLvl=lv;
      out.ranks.push({lv, arc:pkBarkArc(), omni:pkBarkOmni(), R:+pkBarkR().toFixed(1)});
    }
    PK.barkBigLvl=0;
    return out;
  });
  console.log('LADDER ', JSON.stringify(lad));
  ck(lad.cone.length===5, 'not five tiers: '+lad.cone.length);
  // the cone tiers are traffic cones now (v0.314a); pcone2 owns their exact shape
  ck(lad.cone.slice(0,4).every(a=>a>=30&&a<=70), 'the cone tiers are not cone-angled: '+JSON.stringify(lad.cone));
  ck(lad.cone[4]===360, 'the last tier is not the full circle: '+JSON.stringify(lad.cone));
  ck(lad.cap===lad.cone.length-1, 'the cap strands a rank: cap '+lad.cap+' vs '+(lad.cone.length-1));
  ck(lad.ranks.slice(0,4).every(r=>!r.omni), 'a cone tier is secretly omni');
  ck(lad.ranks[4].omni===true, 'the fifth tier is not the full circle');
  /* Reach grows across the four CONE tiers. The circle tier is deliberately SHORTER than tier 4
     - it trades reach for covering every side - so it is not part of this run. */
  const Rs=lad.ranks.slice(0,4).map(r=>r.R);
  ck(Rs.every((v,i)=>i===0||v>=Rs[i-1]), 'the reach does not grow with the rank: '+JSON.stringify(Rs));
  ck(Rs[3]>Rs[0]*1.4, 'tier 4 is not meaningfully longer: '+Rs[3]+' vs '+Rs[0]);
  ck(lad.ranks[4].R<Rs[3], 'the circle tier should trade reach for coverage: '+lad.ranks[4].R);
  ck(lad.rows.length===4 && lad.fx.length===4, 'shop copy does not cover the four upgrades');

  /* the drawn shape and the shape that HITS must be the same at every rank */
  const agree = await pg.evaluate(()=>{
    const bad=[];
    for(let lv=0; lv<BARK_CONE.length; lv++){
      PK.barkBigLvl=lv; PK.faceAng=0;
      const R=pkBarkR(), half=pkBarkArc()*Math.PI/360;
      // just inside the drawn reach, dead ahead: must hit. Just outside: must not.
      const e={t:"sq"};
      const inR =pkInBarkCone(R*0.98,0,R*0.98,e);
      const outR=pkInBarkCone(R*1.6,0,R*1.6,e);
      // just inside/outside the drawn half-angle, at half reach (past the footprint fudge)
      const d=R*0.9;
      const grow=Math.atan2(pkHitR(e),Math.max(10,d));
      const inA =pkInBarkCone(Math.cos(half*0.6)*d, Math.sin(half*0.6)*d, d, e);
      const outA=lv===BARK_CONE.length-1 ? false
        : pkInBarkCone(Math.cos(half+grow+0.25)*d, Math.sin(half+grow+0.25)*d, d, e);
      if(!inR||outR||!inA||outA) bad.push({lv,inR,outR,inA,outA});
    }
    PK.barkBigLvl=0;
    return {bad, badN:bad.length};
  });
  console.log('AGREE  ', JSON.stringify(agree));
  ck(agree.badN===0, 'the drawn reach and the hit test disagree: '+JSON.stringify(agree.bad));

  /* the arcs are drawn at the RANKED reach, not the base one */
  const arcs = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const arc=ctx.arc.bind(ctx); const rec=[];
    let cap=false; ctx.arc=function(x,y,r,a,b2){ if(cap) rec.push({r:+r.toFixed(1),span:+(b2-a).toFixed(3)}); return arc(x,y,r,a,b2); };
    const at=lv=>{ PK.barkBigLvl=lv; PK.barkCd=0; PK.pulse=0; PK.faceAng=0;
      rec.length=0; cap=true; parkDraw(1.0); cap=false;
      const R=pkBarkR();
      // the gauge arcs are the ones at exactly the ranked radii
      // v0.316a: no arc stack - the charge is the two sides, and pvfx owns that spec
      const want=[], found=[];
      const full=pkBarkArc()*Math.PI/180;
      // ...so measure the WAVE instead: it spans the cone and is the only thing that arcs now
      PK.pulse=0.35; PK.pulseAng=0;
      rec.length=0; cap=true; parkDraw(1.0); cap=false;
      PK.pulse=0;
      const spans=rec.map(o=>o.span).filter(sp=>sp>0.01);
      return {R:+R.toFixed(1), want, foundN:found.length,
              maxSpan:spans.length?+Math.max(...spans).toFixed(3):0, full:+full.toFixed(3)};
    };
    const out={t1:at(0), t3:at(2), t5:at(4)};
    ctx.arc=arc; PK.barkBigLvl=0;
    return out;
  });
  console.log('ARCS   ', JSON.stringify(arcs));
  // the wave's span is asserted in pvfx, against a recorder that knows where the apex is
  ck(arcs.t5.R>arcs.t1.R, 'the gauge does not grow with the rank');

  /* ---------- 2. sprite order: BONES, then enemies, then pickups ---------- */
  const order = await pg.evaluate(()=>{
    PK.barkBigLvl=0;
    // put something of each kind on screen, right on top of him
    PK.en.length=0;
    pkEnMake({t:"sq", x:PK.x+6, y:PK.y+2, hp:99, hpMax:99, sp:0, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
    PK.drops.length=0; PK.drops.push({x:PK.x+6, y:PK.y+2, v:1, gold:false, life:25});
    PK.powerups.length=0; PK.powerups.push({x:PK.x+10, y:PK.y+2, type:"star", life:20});
    const seq=[];
    const oClaim=window.pkDrawWingsClaim, oEn=window.drawEnemy, oSq=window.pkPickupSq;
    window.pkDrawWingsClaim=function(){ seq.push('claim'); return oClaim.apply(this,arguments); };
    window.drawEnemy       =function(){ seq.push('en');    return oEn.apply(this,arguments); };
    window.pkPickupSq      =function(){ seq.push('pick');  return oSq.apply(this,arguments); };
    parkDraw(1.0);
    window.pkDrawWingsClaim=oClaim; window.drawEnemy=oEn; window.pkPickupSq=oSq;
    return {seq, claim:seq.indexOf('claim'), firstEn:seq.indexOf('en'),
            lastEn:seq.lastIndexOf('en'), firstPick:seq.indexOf('pick'),
            lastPick:seq.lastIndexOf('pick'),
            nEn:seq.filter(x=>x==='en').length, nPick:seq.filter(x=>x==='pick').length};
  });
  console.log('ORDER  ', JSON.stringify(order));
  ck(order.nEn>0 && order.nPick>0, 'nothing was drawn to compare: '+JSON.stringify(order));
  ck(order.claim>=0, 'the BONES marker never ran');
  /* v0.317a REVERSES v0.312a: with twenty enemies and a floor of loot on screen the one thing
     the player must never lose was the thing getting covered, so BONES is the top of the stack
     again. Enemies and pickups both draw before him; pickups still draw over enemies. */
  ck(order.lastEn<order.claim,   'an enemy is still drawn OVER BONES');
  ck(order.lastPick<order.claim, 'a pickup is still drawn OVER BONES');
  ck(order.firstPick>order.lastEn, 'a pickup is drawn under an enemy');

  /* ---------- 3. pickups turn a full 360, not a flip ---------- */
  const spin = await pg.evaluate(()=>{
    const N=400, per=2*Math.PI/PICKUP_SPIN, v=[];
    for(let i=0;i<N;i++) v.push(pkPickupSq(i*per/N, 0));
    const min=Math.min(...v), max=Math.max(...v);
    let neg=0, pos=0, minAbs=1, crossings=0;
    for(let i=0;i<N;i++){
      if(v[i]<0) neg++; else pos++;
      minAbs=Math.min(minAbs, Math.abs(v[i]));
      if(i && Math.sign(v[i])!==Math.sign(v[i-1])) crossings++;
    }
    // two pickups in different places must not turn in lockstep
    const a=pkPickupSq(1.0, 0), b2=pkPickupSq(1.0, 1.7);
    return {min:+min.toFixed(3), max:+max.toFixed(3), neg, pos, crossings,
            minAbs:+minAbs.toFixed(3), edge:PICKUP_EDGE, seeded:Math.abs(a-b2)>0.15, period:+per.toFixed(2)};
  });
  console.log('SPIN   ', JSON.stringify(spin));
  ck(spin.max>0.98 && spin.min<-0.98, 'it does not turn all the way round: '+spin.min+'..'+spin.max);
  ck(spin.crossings===2, 'a full turn must go edge-on exactly twice, got '+spin.crossings);
  ck(Math.abs(spin.neg-spin.pos)<6, 'the two halves of the turn are not equal');
  ck(spin.minAbs>=spin.edge-0.001, 'it collapses to nothing edge-on: '+spin.minAbs);
  ck(spin.seeded===true, 'every pickup turns in lockstep');

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL BARK/LAYER/SPIN CHECKS PASS');
  await b.close();
})();
