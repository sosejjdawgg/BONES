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
  await pg.evaluate(()=>{ S.lvl=20; startPark(false); });
  await pg.waitForTimeout(1600);

  /* ---------- 1. the curve itself ---------- */
  const curve = await pg.evaluate(()=>{
    const at=m=>+pkJoyThrottle(m).toFixed(4);
    const xs=[0,0.05,0.10,0.16,0.161,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0];
    const ys=xs.map(at);
    let mono=true;
    for(let i=1;i<ys.length;i++) if(ys[i]<ys[i-1]) mono=false;
    return {R:JOY_R, dead:JOY_DEAD, min:JOY_MIN, curveK:JOY_CURVE,
            xs, ys, mono, full:at(1), justPast:at(JOY_DEAD+1e-3), atDead:at(JOY_DEAD),
            runAt:+pkJoyRunAt().toFixed(4), spd:Math.round(PK.spd)};
  });
  console.log('CURVE  ', JSON.stringify(curve));
  ck(curve.R>30, 'the pad did not get bigger: '+curve.R);
  ck(curve.atDead===0, 'the deadzone does not hold him still: '+curve.atDead);
  ck(curve.justPast>0 && curve.justPast<=curve.min+0.001,
     'the first push past the deadzone is not the slow creep: '+curve.justPast);
  ck(curve.full===1, 'a fully pushed stick is not full speed: '+curve.full);
  ck(curve.mono, 'the throttle is not monotonic: '+JSON.stringify(curve.ys));
  // ...and it is genuinely a CURVE, not the old on/off. Half the pad must be nowhere near full.
  ck(curve.ys[curve.xs.indexOf(0.5)]<0.75,
     'half a stick is already '+curve.ys[curve.xs.indexOf(0.5)]+' of top speed');
  ck(curve.runAt>0.4 && curve.runAt<0.85, 'the run ring is at a silly place: '+curve.runAt);

  /* ---------- 2. deflection -> real speed on the board ----------
     Drive the stick by hand and let the game's OWN parkUpdate move him. Reading PK.vx/vy after a
     tick is the only thing that proves the throttle reached the movement code rather than just
     existing as a function nobody calls. */
  const drive = await pg.evaluate(()=>{
    const out=[];
    const run=(m,ang)=>{
      PK.jump=null; PK.z=0; PK.over=0; PK.wingSlowT=0;
      PK.joy={ox:100,oy:100,dx:Math.cos(ang)*m,dy:Math.sin(ang)*m};
      for(let i=0;i<8;i++) parkUpdate(1/60);
      const s=Math.hypot(PK.vx,PK.vy);
      return {m:+m.toFixed(2), frac:+(s/PK.spd).toFixed(3), walk:pkGaitWalk(s)};
    };
    for(const m of [0,0.10,0.16,0.25,0.40,0.55,0.634,0.75,0.90,1.0]) out.push(run(m,0));
    // the same deflections on a diagonal must give the same gait - the Manhattan bug
    const diag=[0.40,0.55,0.75,1.0].map(m=>run(m,Math.PI/4));
    const axis=[0.40,0.55,0.75,1.0].map(m=>run(m,0));
    PK.joy=null;
    return {out, diag, axis, spd:Math.round(PK.spd), runAt:pkJoyRunAt()};
  });
  console.log('DRIVE  ', JSON.stringify(drive.out));
  const g=m=>drive.out.find(o=>Math.abs(o.m-m)<0.005);
  ck(g(0.10).frac===0, 'a tenth of a push already moves him: '+g(0.10).frac);
  ck(g(0.40).frac>0.05 && g(0.40).frac<0.75,
     'a light push is not a light speed: '+g(0.40).frac+' of top');
  ck(g(1.0).frac>0.99, 'a full push is not full speed: '+g(1.0).frac);
  // strictly increasing across the whole live range - this is the actual "sensitivity"
  const fr=drive.out.map(o=>o.frac);
  let liveMono=true; for(let i=1;i<fr.length;i++) if(fr[i]<fr[i-1]) liveMono=false;
  ck(liveMono, 'speed on the board does not track the stick: '+JSON.stringify(fr));
  ck(new Set(fr.slice(3)).size>=5,
     'only '+new Set(fr.slice(3)).size+' distinct speeds - it is still effectively on/off');

  console.log('AXIS   ', JSON.stringify(drive.axis));
  console.log('DIAG   ', JSON.stringify(drive.diag));
  for(let i=0;i<drive.axis.length;i++)
    ck(drive.axis[i].walk===drive.diag[i].walk,
       'gait depends on facing at m='+drive.axis[i].m+
       ' (axis walk='+drive.axis[i].walk+', diagonal walk='+drive.diag[i].walk+')');

  /* ---------- 3. the walk STRIP is what actually gets blitted ----------
     pkGaitWalk returning true proves the decision; it does not prove the walking art reached the
     screen. Spy on the park canvas' drawImage and identify the source against the two sets. */
  const strip = await pg.evaluate(()=>{
    // the WORLD is #dogcv; #parkcv is the pad the stick is drawn on
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const idOf=img=>{
      for(const k in PKWALKIMG) if(PKWALKIMG[k]===img) return 'walk:'+k;
      for(const k in PKDIRIMG)  if(PKDIRIMG[k]===img)  return 'run:'+k;
      return null;
    };
    const sample=(m)=>{
      PK.jump=null; PK.z=0; PK.over=0; PK.wingSlowT=0;
      PK.joy={ox:100,oy:100,dx:m,dy:0};
      for(let i=0;i<8;i++) parkUpdate(1/60);
      const hits=[]; const od=ctx.drawImage.bind(ctx);
      ctx.drawImage=function(){ const t=idOf(arguments[0]); if(t) hits.push(t); return od.apply(ctx,arguments); };
      parkDraw(1.0);
      ctx.drawImage=od;
      return {m, hits:[...new Set(hits)], spd:+Math.hypot(PK.vx,PK.vy).toFixed(1)};
    };
    const idle=(()=>{ PK.joy=null; PK.vx=0; PK.vy=0;
      const hits=[]; const od=ctx.drawImage.bind(ctx);
      ctx.drawImage=function(){ const t=idOf(arguments[0]); if(t) hits.push(t); return od.apply(ctx,arguments); };
      parkDraw(1.0); ctx.drawImage=od; return [...new Set(hits)]; })();
    const slow=sample(0.40), fast=sample(1.0);
    PK.joy=null;
    return {slow, fast, idle, frames:{walk:PKWALK.E.n||8, run:PKDIRS.E.n||8}};
  });
  console.log('STRIP  ', JSON.stringify(strip));
  ck(strip.slow.hits.some(h=>h.startsWith('walk:')),
     'a light push does not draw the walking sprites: '+JSON.stringify(strip.slow.hits));
  ck(!strip.slow.hits.some(h=>h.startsWith('run:')),
     'a light push still draws the running sprites too: '+JSON.stringify(strip.slow.hits));
  ck(strip.fast.hits.some(h=>h.startsWith('run:')),
     'a full push does not draw the running sprites: '+JSON.stringify(strip.fast.hits));
  ck(!strip.fast.hits.some(h=>h.startsWith('walk:')),
     'a full push still draws the walking sprites: '+JSON.stringify(strip.fast.hits));
  ck(strip.fast.spd>strip.slow.spd, 'the full push is not faster on the board');

  /* ---------- 4. the pad drawn is the pad measured ---------- */
  const pad = await pg.evaluate(()=>{
    const cv=document.querySelector('#parkcv'), ctx=cv.getContext('2d');
    const dpr=cv.width/cv.clientWidth;
    PK.joy={ox:100,oy:100,dx:1,dy:0};
    const arcs=[]; const oa=ctx.arc.bind(ctx);
    ctx.arc=function(x,y,r){
      const T=ctx.getTransform();
      arcs.push({x:+((T.a*x+T.c*y+T.e)/dpr).toFixed(1),
                 y:+((T.b*x+T.d*y+T.f)/dpr).toFixed(1), r:+(r*T.a/dpr).toFixed(1)});
      return oa.apply(ctx,arguments); };
    parkDraw(1.0);
    ctx.arc=oa;
    // the ring and the knob, found by geometry: a circle centred exactly on the stick origin
    const rings=arcs.filter(a=>Math.abs(a.x-100)<0.6 && Math.abs(a.y-100)<0.6).map(a=>a.r);
    const knob=arcs.filter(a=>Math.abs(a.x-(100+JOY_R))<1.2 && Math.abs(a.y-100)<1.2).map(a=>a.r);
    PK.joy=null;
    return {rings:[...new Set(rings)].sort((p,q)=>q-p), knob:[...new Set(knob)],
            R:JOY_R, runAt:+pkJoyRunAt().toFixed(3)};
  });
  console.log('PAD    ', JSON.stringify(pad));
  ck(pad.rings.includes(pad.R), 'the ring drawn is not the pad measured: '+JSON.stringify(pad.rings)+' vs R='+pad.R);
  ck(pad.rings.some(r=>Math.abs(r-pad.R*pad.runAt)<1.0),
     'no walk/run ring at '+(pad.R*pad.runAt).toFixed(1)+': '+JSON.stringify(pad.rings));
  ck(pad.knob.length>0, 'the knob does not ride the ring at full deflection');
  ck(pad.R>=42, 'the ring is not meaningfully bigger than the old 26: '+pad.R);

  /* ---------- 5. the pad reads out to its own radius ---------- */
  const reach = await pg.evaluate(async ()=>{
    const cv=document.querySelector('#parkcv'), r=cv.getBoundingClientRect();
    const ox=r.left+r.width*0.30, oy=r.top+r.height*0.75;
    const send=(t,x,y,id)=>cv.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,pointerId:id,bubbles:true,pointerType:'touch'}));
    const out={};
    send('pointerdown',ox,oy,7);
    out.origin=PK.joy?{dx:PK.joy.dx,dy:PK.joy.dy}:null;
    send('pointermove',ox+JOY_R*0.5,oy,7); out.half=PK.joy?+PK.joy.dx.toFixed(3):null;
    send('pointermove',ox+JOY_R,oy,7);     out.edge=PK.joy?+PK.joy.dx.toFixed(3):null;
    send('pointermove',ox+JOY_R*3,oy,7);   out.past=PK.joy?+PK.joy.dx.toFixed(3):null;
    send('pointermove',ox+30,oy,7);        out.oldR=PK.joy?+PK.joy.dx.toFixed(3):null;
    send('pointerup',ox,oy,7);             out.released=PK.joy;
    return out;
  });
  console.log('REACH  ', JSON.stringify(reach));
  ck(reach.origin && reach.origin.dx===0, 'the stick does not start centred on the touch');
  ck(Math.abs(reach.half-0.5)<0.02, 'half the radius is not half deflection: '+reach.half);
  ck(Math.abs(reach.edge-1)<0.02, 'the radius is not full deflection: '+reach.edge);
  ck(Math.abs(reach.past-1)<0.02, 'dragging past the ring exceeds full: '+reach.past);
  ck(reach.oldR<0.75, 'the old 30px throw is still full deflection: '+reach.oldR);
  ck(reach.released===null, 'letting go did not release the stick');

  /* ---------- 6. nothing that read the stick before was broken by this ---------- */
  const keep = await pg.evaluate(()=>{
    const o={};
    // the whirlwind gate is a raw deflection and must still be reachable
    PK.joy={ox:0,oy:0,dx:0.9,dy:0}; o.spinMag=Math.hypot(PK.joy.dx,PK.joy.dy);
    // airborne: the stick steers but does NOT throttle - J.sp owns the speed up there
    PK.jump={ph:"hover",t:0,dx:1,dy:0,sp:120,z0:0,ft:0}; PK.z=30;
    pkFlyTick(1/60,0.30,0); const slowAir=Math.hypot(PK.vx,PK.vy);
    PK.jump={ph:"hover",t:0,dx:1,dy:0,sp:120,z0:0,ft:0};
    pkFlyTick(1/60,1.0,0);  const fastAir=Math.hypot(PK.vx,PK.vy);
    PK.jump=null; PK.z=0; PK.joy=null;
    o.slowAir=+slowAir.toFixed(2); o.fastAir=+fastAir.toFixed(2);
    return o;
  });
  console.log('KEEP   ', JSON.stringify(keep));
  ck(keep.spinMag>=0.6, 'the whirlwind gate is out of the pad reach: '+keep.spinMag);
  ck(Math.abs(keep.slowAir-keep.fastAir)<0.01,
     'the throttle leaked into the air, where the pounce owns the speed: '+keep.slowAir+' vs '+keep.fastAir);

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL JOYSTICK CHECKS PASS');
  await b.close();
  process.exit(fails.length?1:0);
})();
