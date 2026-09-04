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

  /* ---------- 1. it is a cone, not a fan ---------- */
  const shape = await pg.evaluate(()=>{
    const out={cone:BARK_CONE.slice(), range:BARK_RANGE.slice(), apex:BARK_APEX,
               reachCap:BARK_REACH_CAP, base:+PK.barkR.toFixed(1), ranks:[]};
    for(let lv=0; lv<4; lv++){
      PK.barkBigLvl=lv;
      const R=pkBarkR(), half=pkBarkArc()*Math.PI/360;
      // the drawn cone: base width across the two side rays, height along the facing
      const w=2*R*Math.sin(half), h=R*Math.cos(half);
      out.ranks.push({lv, arc:pkBarkArc(), R:+R.toFixed(1),
                      hw:+(h/w).toFixed(2), area:Math.round(0.5*R*R*half*2)});
    }
    PK.barkBigLvl=4;
    out.omni={arc:pkBarkArc(), omni:pkBarkOmni(), R:+pkBarkR().toFixed(1),
              area:Math.round(Math.PI*pkBarkR()*pkBarkR())};
    PK.barkBigLvl=0;
    return out;
  });
  console.log('SHAPE  ', JSON.stringify(shape));
  ck(shape.cone.slice(0,4).every(a=>a<=70), 'a cone rank is still fan-wide: '+shape.cone);
  // a traffic cone is longer than it is wide; even the widest rank stays near square
  ck(shape.ranks.every(r=>r.hw>=0.85), 'a rank is wider than it is long: '+JSON.stringify(shape.ranks.map(r=>r.hw)));
  ck(shape.ranks[0].hw>=1.4, 'rank 1 is not a narrow cone: '+shape.ranks[0].hw);
  // ...and it gets progressively longer AND wider-based, per the rank sketch
  const Rs=shape.ranks.map(r=>r.R), hws=shape.ranks.map(r=>r.hw), As=shape.ranks.map(r=>r.area);
  ck(Rs.every((v,i)=>i===0||v>Rs[i-1]), 'the reach does not grow every rank: '+Rs);
  ck(hws.every((v,i)=>i===0||v<hws[i-1]), 'the base does not widen every rank: '+hws);
  ck(As.every((v,i)=>i===0||v>As[i-1]), 'a rank is not stronger than the one below: '+As);
  ck(shape.omni.omni===true && shape.omni.area>As[3], 'the circle rank is not the biggest');
  // it reaches further than it used to (old rank-1 multiplier was 1.00 of the base)
  ck(Rs[0]>shape.base*1.3, 'rank 1 is no longer than before: '+Rs[0]+' vs base '+shape.base);

  /* ---------- 2. the drawn shape and the shape that BITES are the same object ---------- */
  const agree = await pg.evaluate(()=>{
    const bad=[];
    for(let lv=0; lv<BARK_CONE.length; lv++){
      PK.barkBigLvl=lv; PK.faceAng=0;
      const R=pkBarkR(), half=pkBarkArc()*Math.PI/360, e={t:"sq"};
      const ax=pkBarkApexX(), ay=pkBarkApexY();       // everything is measured from the apex
      const at=(ang,d)=>pkInBarkCone(ax+Math.cos(ang)*d, ay+Math.sin(ang)*d, 0, e);
      const inR =at(0, R*0.96), outR=at(0, R*1.9);
      const d=R*0.9, grow=Math.atan2(pkHitR(e),Math.max(10,d));
      const inA =at(half*0.6, d);
      const outA=lv===BARK_CONE.length-1 ? false : at(half+grow+0.25, d);
      if(!inR||outR||!inA||outA) bad.push({lv,inR,outR,inA,outA});
    }
    PK.barkBigLvl=0;
    return {bad, badN:bad.length};
  });
  console.log('AGREE  ', JSON.stringify(agree));
  ck(agree.badN===0, 'the drawn cone and the hit cone disagree: '+JSON.stringify(agree.bad));

  // the apex really is ahead of him: something just behind the mouth but in front of his centre
  const apex = await pg.evaluate(()=>{
    PK.barkBigLvl=0; PK.faceAng=0;
    const e={t:"sq"}, R=pkBarkR();
    // straight out the back, at a distance that WOULD be in range of a centre-origin cone
    const behind=pkInBarkCone(-R*0.5,0,R*0.5,e);
    // ...and the far tip: reachable from the mouth, past reach from the centre
    const tipFromMouth=pkInBarkCone(BARK_APEX+R*0.97, 0, BARK_APEX+R*0.97, e);
    return {behind, tipFromMouth, apex:BARK_APEX, R:+R.toFixed(1)};
  });
  console.log('APEX   ', JSON.stringify(apex));
  ck(apex.behind===false, 'the cone still bites behind him');
  ck(apex.tipFromMouth===true, 'the far tip is not reachable from the mouth');

  /* ---------- 3. the UI closes into a cone: two straight sides, ends on them ---------- */
  const drawn = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const arcs=[], segs=[]; let pen=null, cap=false;
    const oa=ctx.arc.bind(ctx), om=ctx.moveTo.bind(ctx), ol=ctx.lineTo.bind(ctx),
          ob=ctx.beginPath.bind(ctx), os=ctx.stroke.bind(ctx);
    ctx.beginPath=function(){ pen=[]; return ob(); };
    ctx.arc=function(x,y,r,a,b2){ if(cap) arcs.push({x:+x.toFixed(2),y:+y.toFixed(2),
      r:+r.toFixed(2),a:+a.toFixed(4),b:+b2.toFixed(4)}); pen=null; return oa(x,y,r,a,b2); };
    ctx.moveTo=function(x,y){ if(pen)pen.push([x,y]); return om(x,y); };
    ctx.lineTo=function(x,y){ if(pen)pen.push([x,y]); return ol(x,y); };
    ctx.stroke=function(){ if(cap && pen && pen.length===2) segs.push(pen.slice()); return os(); };
    PK.barkBigLvl=2; PK.faceAng=0; PK.barkCd=0; PK.pulse=0; PK.en.length=0;
    cap=true; parkDraw(1.0); cap=false;
    ctx.arc=oa; ctx.moveTo=om; ctx.lineTo=ol; ctx.beginPath=ob; ctx.stroke=os;
    const R=pkBarkR(), half=pkBarkArc()*Math.PI/360;
    // v0.316a: the charge draws NO arcs at all - just the two sides. pvfx owns the VFX spec.
    const gauge=arcs.filter(o=>Math.abs((o.b-o.a)/2-half)<0.01);
    // ...and the sides are segments of length R leaving one common point
    const sides=segs.filter(sg=>Math.abs(Math.hypot(sg[1][0]-sg[0][0],sg[1][1]-sg[0][1])-R)<0.6);
    const apexes=sides.map(sg=>sg[0]);
    const same=apexes.length===2 && Math.hypot(apexes[0][0]-apexes[1][0],apexes[0][1]-apexes[1][1])<0.01;
    // every side's far end must land on the outermost arc, at its ends
    const outer=gauge.length ? gauge.reduce((m,o)=>o.r>m.r?o:m) : null;
    const onArc=outer ? sides.every(sg=>{
      const d=Math.hypot(sg[1][0]-outer.x, sg[1][1]-outer.y);
      const ang=Math.atan2(sg[1][1]-outer.y, sg[1][0]-outer.x);
      let da=Math.min(Math.abs(ang-outer.a), Math.abs(ang-outer.b));
      while(da>Math.PI) da-=2*Math.PI;
      return Math.abs(d-outer.r)<0.6 && Math.abs(da)<0.01;
    }) : false;
    return {gauge:gauge.length, sides:sides.length, sharedApex:same, onArc,
            R:+R.toFixed(1), outerR:outer?outer.r:null,
            apexAhead: apexes.length? +(apexes[0][0]).toFixed(2) : null};
  });
  console.log('DRAWN  ', JSON.stringify(drawn));
  /* Arc counting lives in pvfx, which filters on the apex AND normalises the DPR transform.
     This recorder has neither, so it matches unrelated park arcs - what it is good for is the
     two SIDES, which are the only segments leaving a common point at exactly the cone's reach. */
  ck(drawn.sides===2, 'the cone has no straight sides drawn: '+drawn.sides);
  ck(drawn.sharedApex===true, 'the two sides do not meet at one apex');

  // the circle rank draws no sides at all
  const omniDraw = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    let segs=0, pen=null, cap=false, full=0;
    const om=ctx.moveTo.bind(ctx), ol=ctx.lineTo.bind(ctx), ob=ctx.beginPath.bind(ctx),
          os=ctx.stroke.bind(ctx), oa=ctx.arc.bind(ctx);
    ctx.beginPath=function(){ pen=[]; return ob(); };
    ctx.moveTo=function(x,y){ if(pen)pen.push([x,y]); return om(x,y); };
    ctx.lineTo=function(x,y){ if(pen)pen.push([x,y]); return ol(x,y); };
    // >= a full turn: this codebase writes a full circle as arc(...,0,7), not as exactly 2*PI
    ctx.arc=function(x,y,r,a,b2){ if(cap && (b2-a)>=2*Math.PI-0.01) full++; pen=null; return oa(x,y,r,a,b2); };
    ctx.stroke=function(){ if(cap && pen && pen.length===2){
      const R=pkBarkR();
      if(Math.abs(Math.hypot(pen[1][0]-pen[0][0],pen[1][1]-pen[0][1])-R)<0.6) segs++; } return os(); };
    PK.barkBigLvl=4; PK.barkCd=0; PK.pulse=0;
    cap=true; parkDraw(1.0); cap=false;
    ctx.moveTo=om; ctx.lineTo=ol; ctx.beginPath=ob; ctx.stroke=os; ctx.arc=oa;
    PK.barkBigLvl=0;
    return {sides:segs, fullCircles:full};
  });
  console.log('OMNI   ', JSON.stringify(omniDraw));
  ck(omniDraw.sides===0, 'the circle rank still draws cone sides: '+omniDraw.sides);
  // one faint ready-rim now, not a stack of three (see BARK_OMNI_HINT)
  ck(omniDraw.fullCircles>=1, 'the circle rank shows nothing at all when ready: '+omniDraw.fullCircles);

  /* ---------- 4. still half / solid ---------- */
  const alpha = await pg.evaluate(()=>{
    /* Scoped to the CONE's own strokes - anything centred on, or leaving, the apex. Capturing
       every stroke in parkDraw catches the wave banner's solid red rule and reads as the gauge
       being drawn at full opacity when it is not. */
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const seen={charge:[], wave:[]}; let mode=null, path=null, apex=null;
    const oa=ctx.arc.bind(ctx), om=ctx.moveTo.bind(ctx), ob=ctx.beginPath.bind(ctx),
          os=ctx.stroke.bind(ctx);
    const near=(x,y)=>apex && Math.hypot(x-apex[0],y-apex[1])<0.6;
    ctx.beginPath=function(){ path=null; return ob(); };
    ctx.arc=function(x,y,r,a,b2){ path=near(x,y)?'cone':null; return oa(x,y,r,a,b2); };
    ctx.moveTo=function(x,y){ path=near(x,y)?'cone':null; return om(x,y); };
    ctx.stroke=function(){ if(mode && path==='cone') seen[mode].push(+ctx.globalAlpha.toFixed(3)); return os(); };
    PK.barkBigLvl=2; PK.faceAng=0; PK.barkCd=0; PK.pulse=0; PK.en.length=0;
    // the apex, in screen space: the park draws BONES dead centre of its own canvas
    const w=cv.clientWidth, h=cv.clientHeight;
    apex=[w/2+pkBarkApexX(), h/2+pkBarkApexY()];
    mode='charge'; parkDraw(1.0); mode=null;
    PK.pulse=0.35; PK.pulseAng=0;
    mode='wave'; parkDraw(1.0); mode=null;
    ctx.arc=oa; ctx.moveTo=om; ctx.beginPath=ob; ctx.stroke=os;
    return {chargeMax:Math.max(...seen.charge), waveMax:Math.max(...seen.wave),
            nCharge:seen.charge.length, nWave:seen.wave.length, apex};
  });
  console.log('ALPHA  ', JSON.stringify(alpha));
  /* The charge is two SIDES now (v0.316a), drawn inside a translate+rotate - this recorder
     compares the raw moveTo args against a screen-space apex and so matches nothing. pvfx owns
     the alpha spec against a recorder that resolves the transform; all this one can still say
     honestly is that the fired wave is solid. */
  ck(alpha.nWave>=1, 'the wave strokes were not found at the apex: '+alpha.nWave);
  ck(alpha.waveMax>0.95, 'the fired wave is not solid: '+alpha.waveMax);

  /* ---------- 5. the live path still hits what it points at ---------- */
  const live = await pg.evaluate(async ()=>{
    window.__ka=true; window.__keep=()=>{ PK.hp=PK.maxhp; if(PK.shop) PK.shop=false;
      if(window.__ka) requestAnimationFrame(window.__keep); }; requestAnimationFrame(window.__keep);
    PK.barkBigLvl=0; PK.faceAng=0; PK.en.length=0;
    const R=pkBarkR();
    const mk=(dx,dy)=>pkEnMake({t:"sq", x:(PK.x+dx+PK.WW)%PK.WW, y:(PK.y+dy+PK.WH)%PK.WH,
      hp:9999, hpMax:9999, sp:0, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
    const far=mk(R*0.8,0), side=mk(0,R*0.8), back=mk(-R*0.6,0);
    const h0={far:far.hp, side:side.hp, back:back.hp};
    PK.barkCd=0;
    for(let i=0;i<90;i++){
      PK.faceAng=0;
      far.x=(PK.x+R*0.8)%PK.WW;  far.y=PK.y;
      side.x=PK.x;               side.y=(PK.y+R*0.8)%PK.WH;
      back.x=(PK.x-R*0.6+PK.WW)%PK.WW; back.y=PK.y;
      await new Promise(r=>setTimeout(r,45));
    }
    window.__ka=false;
    return {R:+R.toFixed(1), farHit:far.hp<h0.far, sideHit:side.hp<h0.side, backHit:back.hp<h0.back};
  });
  console.log('LIVE   ', JSON.stringify(live));
  ck(live.farHit===true,  'the long reach does not actually connect down the facing');
  ck(live.sideHit===false,'a narrow cone still hits square off to the side');
  ck(live.backHit===false,'it still hits behind him');

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL TRAFFIC-CONE CHECKS PASS');
  await b.close();
})();
