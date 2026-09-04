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

  /* A recorder for everything the park strokes: arcs by centre/radius/span, and straight
     segments by their two endpoints. Everything below is asked of this one capture. */
  await pg.evaluate(()=>{ window.__cap=(setup)=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const arcs=[], segs=[]; let pen=null;
    /* fit() puts a DPR transform on the context, so getTransform() yields DEVICE pixels while
       the apex is computed in CSS pixels. Everything recorded is divided back down by that
       ratio, or the comparison misses by exactly a factor of DPR and records nothing. */
    const SS=cv.width/cv.clientWidth;
    const oa=ctx.arc.bind(ctx), om=ctx.moveTo.bind(ctx), ol=ctx.lineTo.bind(ctx),
          ob=ctx.beginPath.bind(ctx), os=ctx.stroke.bind(ctx),
          ot=ctx.translate.bind(ctx), orr=ctx.rotate.bind(ctx);
    ctx.beginPath=function(){ pen=[]; return ob(); };
    ctx.arc=function(x,y,r,a,b2){
      // record in SCREEN space: the sides are drawn inside a translate+rotate
      const m=ctx.getTransform();
      arcs.push({x:(m.a*x+m.c*y+m.e)/SS, y:(m.b*x+m.d*y+m.f)/SS, r:r*Math.hypot(m.a,m.b)/SS,
                 span:+(b2-a).toFixed(4), al:+ctx.globalAlpha.toFixed(3)});
      pen=null; return oa(x,y,r,a,b2);
    };
    const px=(x,y)=>{ const m=ctx.getTransform();
      return [(m.a*x+m.c*y+m.e)/SS, (m.b*x+m.d*y+m.f)/SS]; };
    ctx.moveTo=function(x,y){ if(pen)pen.push(px(x,y)); return om(x,y); };
    ctx.lineTo=function(x,y){ if(pen)pen.push(px(x,y)); return ol(x,y); };
    ctx.stroke=function(){ if(pen&&pen.length===2)
      segs.push({a:pen[0], b:pen[1], al:+ctx.globalAlpha.toFixed(3),
                 grad:typeof ctx.strokeStyle==="object"}); return os(); };
    PK.en.length=0; PK.drops.length=0; PK.powerups.length=0; PK.faceAng=0;
    setup();
    parkDraw(1.0);
    ctx.arc=oa; ctx.moveTo=om; ctx.lineTo=ol; ctx.beginPath=ob; ctx.stroke=os;
    const w=cv.clientWidth, h=cv.clientHeight;
    const omni=pkBarkOmni(), R=pkBarkR();
    const AX=w/2+(omni?0:pkBarkApexX()), AY=h/2+(omni?0:pkBarkApexY());
    const half=omni?Math.PI:pkBarkArc()*Math.PI/360;
    // the cone's own strokes: centred on the apex, or leaving it
    const near=(p)=>Math.hypot(p[0]-AX,p[1]-AY)<0.8;
    return {
      R:+R.toFixed(2), half:+half.toFixed(4), omni,
      coneArcs: arcs.filter(o=>Math.hypot(o.x-AX,o.y-AY)<0.8)
                    .map(o=>({r:+o.r.toFixed(2), span:o.span, al:o.al})),
      sides: segs.filter(sg=>near(sg.a))
                 .map(sg=>({len:+Math.hypot(sg.b[0]-sg.a[0],sg.b[1]-sg.a[1]).toFixed(2),
                            al:sg.al, grad:sg.grad}))
    };
  }; });

  /* ---------- 1. charging: two sides, nothing else ---------- */
  const charge = await pg.evaluate(()=>{
    const out={};
    out.ready  =window.__cap(()=>{ PK.barkBigLvl=2; PK.barkCd=0; PK.pulse=0; });
    out.idle   =window.__cap(()=>{ PK.barkBigLvl=2; PK.barkCd=PK.barkMax; PK.pulse=0; });
    out.omni   =window.__cap(()=>{ PK.barkBigLvl=4; PK.barkCd=0; PK.pulse=0; });
    out.omniIdle=window.__cap(()=>{ PK.barkBigLvl=4; PK.barkCd=PK.barkMax; PK.pulse=0; });
    PK.barkBigLvl=0;
    out.hint=BARK_OMNI_HINT; out.max=BARK_ARC_MAX; out.min=BARK_SIDE_MIN;
    return out;
  });
  console.log('CHARGE ', JSON.stringify(charge));
  for(const k of ['ready','idle']){
    const c=charge[k];
    ck(c.sides.length===2, k+': not exactly two side lines: '+c.sides.length);
    ck(c.coneArcs.length===0, k+': the arc stack is still being drawn: '+JSON.stringify(c.coneArcs));
    ck(c.sides.every(s=>Math.abs(s.len-c.R)<0.8), k+': a side is not the full reach: '+JSON.stringify(c.sides));
    ck(c.sides.every(s=>s.grad===true), k+': the sides do not fade along their length');
    ck(c.sides.every(s=>s.al<=charge.max+0.001), k+': a side is above half opacity: '+JSON.stringify(c.sides));
  }
  ck(charge.ready.sides[0].al>charge.idle.sides[0].al,
     'the sides do not brighten as it charges: '+charge.idle.sides[0].al+' -> '+charge.ready.sides[0].al);
  ck(Math.abs(charge.idle.sides[0].al-charge.min)<0.001, 'the idle floor is wrong: '+charge.idle.sides[0].al);
  // the circle rank gets almost nothing
  ck(charge.omni.sides.length===0, 'the circle rank draws cone sides: '+charge.omni.sides.length);
  ck(charge.omni.coneArcs.length<=1, 'the circle rank draws a stack: '+charge.omni.coneArcs.length);
  ck(charge.omni.coneArcs.every(a=>a.al<=charge.hint+0.001),
     'the circle rank hint is not almost nothing: '+JSON.stringify(charge.omni.coneArcs));
  ck(charge.omniIdle.coneArcs.length===0, 'the circle rank shows a rim before it is ready');

  /* ---------- 2. firing: the wave only, and it travels ---------- */
  const wave = await pg.evaluate(()=>{
    const frames=[];
    for(let p=0.35; p>0; p-=0.02){
      frames.push(window.__cap(()=>{ PK.barkBigLvl=2; PK.barkCd=PK.barkMax;
        PK.pulse=p; PK.pulseAng=0; }));
    }
    PK.barkBigLvl=0; PK.pulse=0;
    return {R:frames[0].R, half:frames[0].half,
            f:frames.map(o=>({n:o.coneArcs.length, sides:o.sides.length,
              lead:o.coneArcs.length?+Math.max(...o.coneArcs.map(a=>a.r)).toFixed(1):0,
              leadAl:o.coneArcs.length?+Math.max(...o.coneArcs.map(a=>a.al)).toFixed(2):0,
              spans:o.coneArcs.map(a=>a.span)}))};
  });
  const F2=wave.f;
  console.log('WAVE   ', JSON.stringify({R:wave.R, first:F2[0], mid:F2[Math.floor(F2.length/2)],
    last:F2[F2.length-1], n:F2.length}));
  ck(F2.every(f=>f.sides===0), 'the charge sides are still drawn while the bark is in the air');
  ck(F2.every(f=>f.n>=1), 'the wave is not drawn on some frame');
  const leads=F2.map(f=>f.lead);
  ck(leads.every((v,i)=>i===0||v>=leads[i-1]-0.01), 'the front does not travel outward: '+JSON.stringify(leads));
  ck(leads[0]<wave.R*0.25, 'the front starts at full reach instead of at the mouth: '+leads[0]);
  ck(leads[leads.length-1]>wave.R, 'the front never reaches the end of the cone: '+leads[leads.length-1]);
  ck(leads[leads.length-1]<=wave.R*1.12, 'the overshoot is too big: '+leads[leads.length-1]+' vs '+wave.R);
  ck(F2.some(f=>f.leadAl>0.98), 'the wave is never at full opacity: '+Math.max(...F2.map(f=>f.leadAl)));
  ck(F2[F2.length-1].leadAl<0.7, 'the wave does not fade out at the end: '+F2[F2.length-1].leadAl);
  // it sweeps the cone's own angle, so what is seen is what hit
  ck(F2.every(f=>f.spans.every(sp=>Math.abs(sp-wave.half*2)<0.02)),
     'the wave does not span the cone: '+JSON.stringify(F2[0].spans)+' vs '+(wave.half*2).toFixed(3));

  /* ---------- 3. the length fade is cached, not rebuilt per frame ---------- */
  const cost = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    let lin=0;
    const ol=ctx.createLinearGradient.bind(ctx);
    ctx.createLinearGradient=function(){ lin++; return ol.apply(ctx,arguments); };
    PK.barkBigLvl=2; PK.barkCd=0; PK.pulse=0; PK.faceAng=0;
    parkDraw(1.0); lin=0;                       // let it warm, then count
    for(let i=0;i<30;i++){ PK.faceAng=i*0.2; parkDraw(1.0); }
    ctx.createLinearGradient=ol; PK.barkBigLvl=0;
    return {perFrame:+(lin/30).toFixed(2)};
  });
  console.log('COST   ', JSON.stringify(cost));
  ck(cost.perFrame<1, 'the side gradient is rebuilt every frame: '+cost.perFrame);

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL BARK VFX CHECKS PASS');
  await b.close();
})();
