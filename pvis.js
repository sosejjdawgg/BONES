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

  /* ---------- 1. the zoom starts later in plain DOGPARK, same destination ---------- */
  const zoom = await pg.evaluate(()=>{
    const run=(plus)=>{
      PK.plusMode=plus; PK.zoomFromWave=0;
      const steps=[];
      for(let w=1; w<=14; w++){
        PK.wave=w;
        const before=PK.zoomFromWave;
        // take the outcome directly: reduceMotion is the same maths without the travel
        const wasRM=SETTINGS.reduceMotion; SETTINGS.reduceMotion=true;
        pkWaveZoomStep();
        SETTINGS.reduceMotion=wasRM;
        if(PK.zoomFromWave>before) steps.push({w, d:+(PK.zoomFromWave-before).toFixed(4)});
      }
      return {first:steps.length?steps[0].w:null, last:steps.length?steps[steps.length-1].w:null,
              n:steps.length, step:steps.length?steps[0].d:0,
              total:+PK.zoomFromWave.toFixed(4)};
    };
    const plain=run(false), plus=run(true);
    PK.plusMode=true; PK.zoomFromWave=0; PK.wave=1; pkApplyZoom();
    return {plain, plus, TOTAL:PK_ZOOM_TOTAL, LAST:PK_ZOOM_LAST_WAVE, OLD_STEP:PK_ZOOM_STEP};
  });
  console.log('ZOOM   ', JSON.stringify(zoom));
  ck(zoom.plain.first===6, 'plain DOGPARK does not start zooming at wave 6: '+zoom.plain.first);
  ck(zoom.plain.last===10, 'plain DOGPARK does not carry on to wave 10: '+zoom.plain.last);
  ck(zoom.plus.first===2, 'UNLEASHED no longer starts at wave 2: '+zoom.plus.first);
  ck(zoom.plus.last===10, 'UNLEASHED no longer ends at wave 10: '+zoom.plus.last);
  ck(Math.abs(zoom.plus.step-zoom.OLD_STEP)<1e-6,
     'UNLEASHED step changed: '+zoom.plus.step+' vs '+zoom.OLD_STEP);
  ck(Math.abs(zoom.plus.total-zoom.plain.total)<1e-6,
     'the two modes no longer finish in the same framing: '+zoom.plain.total+' vs '+zoom.plus.total);
  ck(Math.abs(zoom.plus.total-zoom.TOTAL)<1e-6, 'the destination moved: '+zoom.plus.total);
  ck(zoom.plain.step>zoom.plus.step, 'the later start did not take bigger steps');

  /* ---------- 2. BONES is on top of everything ---------- */
  const order = await pg.evaluate(()=>{
    PK.plusMode=true; SETTINGS.nightMode=true;      // night, so the nut glow marker fires too
    PK.en.length=0; PK.drops.length=0; PK.powerups.length=0; PK.nuts.length=0;
    pkEnMake({t:"sq", x:PK.x+8, y:PK.y+2, hp:99, hpMax:99, sp:0, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
    PK.drops.push({x:PK.x+8, y:PK.y+2, v:1, gold:false, life:25});
    PK.powerups.push({x:PK.x+12, y:PK.y+2, type:"star", life:20});
    PK.nuts.push({x:PK.x+10, y:PK.y, vx:20, vy:0, life:2});
    const seq=[];
    const oN=window.pkDrawNightTint, oE=window.drawEnemy, oP=window.pkPickupSq,
          oG=window.pkGrad, oR=window.pkDogRim;
    window.pkDrawNightTint=function(){ seq.push('night'); return oN.apply(this,arguments); };
    window.drawEnemy      =function(){ seq.push('en');    return oE.apply(this,arguments); };
    window.pkPickupSq     =function(){ seq.push('pick');  return oP.apply(this,arguments); };
    window.pkGrad         =function(c,k){ if(k==='nut') seq.push('nut'); return oG.apply(this,arguments); };
    window.pkDogRim       =function(){ seq.push('dog');   return oR.apply(this,arguments); };
    parkDraw(1.0);
    window.pkDrawNightTint=oN; window.drawEnemy=oE; window.pkPickupSq=oP;
    window.pkGrad=oG; window.pkDogRim=oR;
    const at=k=>seq.indexOf(k);
    return {seq, night:at('night'), en:at('en'), pick:at('pick'), nut:at('nut'), dog:at('dog'),
            lastEn:seq.lastIndexOf('en'), lastPick:seq.lastIndexOf('pick')};
  });
  console.log('ORDER  ', JSON.stringify(order));
  ck(order.dog>=0 && order.en>=0 && order.pick>=0 && order.nut>=0,
     'something was not drawn at all: '+JSON.stringify(order));
  ck(order.dog>order.lastEn,   'an enemy is still drawn over BONES');
  ck(order.dog>order.lastPick, 'a pickup is still drawn over BONES');
  ck(order.dog>order.nut,      'a nut is still drawn over BONES');
  ck(order.pick>order.lastEn,  'pickups fell under the enemies');
  // ...and the nuts are no longer inside the night multiply
  ck(order.nut>order.night, 'the nuts are still drawn BEFORE the night tint darkens them');
  ck(order.en>order.night,  'enemies fell back inside the night multiply');

  /* ---------- 3. the rim ---------- */
  const rim = await pg.evaluate(()=>{
    const read=(setup)=>{
      const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
      let hit=null;
      const proto=Object.getPrototypeOf(ctx);
      const dBlur=Object.getOwnPropertyDescriptor(proto,'shadowBlur');
      const dCol =Object.getOwnPropertyDescriptor(proto,'shadowColor');
      let blur=0, col='';
      Object.defineProperty(ctx,'shadowBlur',{configurable:true,
        get(){return dBlur.get.call(ctx);}, set(v){ blur=v; dBlur.set.call(ctx,v); }});
      Object.defineProperty(ctx,'shadowColor',{configurable:true,
        get(){return dCol.get.call(ctx);}, set(v){ col=v; dCol.set.call(ctx,v); }});
      const oR=window.pkDogRim;
      window.pkDogRim=function(){ const r=oR.apply(this,arguments); hit={...r, blurSet:0}; return r; };
      setup();
      /* pkDogRim counts the crowd through pkEnemiesNear, which reads the grid parkUpdate
         rebuilds EVERY frame. Calling parkDraw on its own leaves the grid holding whatever the
         live run last put in it - the count comes back as 1 regardless of what was just placed. */
      pkBuildEnGrid(PK.WW,PK.WH);
      parkDraw(1.0);
      window.pkDogRim=oR;
      delete ctx.shadowBlur; delete ctx.shadowColor;
      return {a:hit?+hit.a.toFixed(3):null, n:hit?hit.n:null, blur:+(+blur).toFixed(2), col};
    };
    const clear=()=>{ PK.en.length=0; PK.drops.length=0; PK.powerups.length=0; PK.nuts.length=0; };
    const mk=(dx)=>pkEnMake({t:"sq", x:(PK.x+dx+PK.WW)%PK.WW, y:PK.y, hp:99, hpMax:99,
      sp:0, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
    const day    =read(()=>{ PK.plusMode=false; SETTINGS.nightMode=true;  clear(); });
    const night  =read(()=>{ PK.plusMode=true;  SETTINGS.nightMode=true;  clear(); });
    const dayOff =read(()=>{ PK.plusMode=true;  SETTINGS.nightMode=false; clear(); });
    const crowd  =read(()=>{ PK.plusMode=true;  SETTINGS.nightMode=true;  clear();
                             for(let i=0;i<5;i++) mk(6+i*4); });
    const dayCrowd=read(()=>{ PK.plusMode=false; SETTINGS.nightMode=true; clear();
                             for(let i=0;i<5;i++) mk(6+i*4); });
    PK.plusMode=true; SETTINGS.nightMode=true; clear();
    return {day, night, dayOff, crowd, dayCrowd,
            DAY:PK_RIM_DAY, NIGHT:PK_RIM_NIGHT, CROWD:PK_RIM_CROWD, NEAR:PK_RIM_NEAR};
  });
  console.log('RIM    ', JSON.stringify(rim));
  ck(rim.day.a!==null, 'the rim never ran');
  ck(/rgba\(255,255,255/.test(rim.night.col||''), 'the rim is not white: '+rim.night.col);
  ck(rim.night.blur>0, 'no blur was set, so nothing is drawn: '+rim.night.blur);
  ck(Math.abs(rim.day.a-rim.DAY)<0.001, 'the daylight rim is not the daylight constant: '+rim.day.a);
  ck(Math.abs(rim.night.a-rim.NIGHT)<0.001, 'the night rim is not the night constant: '+rim.night.a);
  ck(rim.night.a>rim.day.a, 'the rim does not strengthen at night');
  ck(rim.night.blur>rim.day.blur, 'the halo does not widen at night');
  // UNLEASHED with nightMode off is daylight as far as the rim is concerned
  ck(Math.abs(rim.dayOff.a-rim.DAY)<0.001, 'the rim ignores the nightMode setting: '+rim.dayOff.a);
  // ...and a crowd lifts it in either mode
  ck(rim.crowd.n>=4, 'the crowd was not counted: '+rim.crowd.n);
  /* At night the rim already sits at 0.75 against a 0.95 ceiling, so a crowd can only ever add
     the remaining 0.20 - it is a real lift, just a bounded one. Daylight has the whole range. */
  ck(rim.crowd.a>rim.night.a, 'a crowd does not brighten the night rim: '+rim.night.a+' -> '+rim.crowd.a);
  ck(rim.crowd.blur>rim.night.blur, 'a crowd does not widen the night halo');
  ck(rim.dayCrowd.a>rim.day.a+0.2, 'a crowd does not brighten the daylight rim');
  ck(rim.crowd.a<=0.95, 'the rim went over its ceiling: '+rim.crowd.a);

  /* ---------- 4. the nuts carry their own light at night, and cost one gradient ---------- */
  const nuts = await pg.evaluate(()=>{
    /* Count how many DISTINCT gradient objects the nuts are handed. The park builds a couple of
        dozen gradients a frame for its own lighting, so counting createRadialGradient globally
        measures the park, not this cache. */
    const glowN=(plus)=>{
      PK.plusMode=plus; SETTINGS.nightMode=true;
      PK.en.length=0; PK.nuts.length=0;
      for(let i=0;i<14;i++) PK.nuts.push({x:PK.x+i*7-40, y:PK.y+8, vx:30, vy:0, life:2});
      let n=0;
      const oG=window.pkGrad;
      window.pkGrad=function(c,k){ if(k==='nut') n++; return oG.apply(this,arguments); };
      parkDraw(1.0);
      window.pkGrad=oG;
      return n;
    };
    const atNight=glowN(true), byDay=glowN(false);
    PK.plusMode=true; SETTINGS.nightMode=true;
    PK.nuts.length=0;
    for(let i=0;i<14;i++) PK.nuts.push({x:PK.x+i*7-40, y:PK.y+8, vx:30, vy:0, life:2});
    const seen=new Set(); let handed=0;
    const oG=window.pkGrad;
    window.pkGrad=function(c,k){ const g=oG.apply(this,arguments);
      if(k==='nut'){ seen.add(g); handed++; } return g; };
    for(let i=0;i<20;i++) parkDraw(1.0);
    window.pkGrad=oG;
    PK.nuts.length=0;
    return {atNight, byDay, distinct:seen.size, handed, nuts:14};
  });
  console.log('NUTS   ', JSON.stringify(nuts));
  ck(nuts.atNight===nuts.nuts, 'not every nut glows at night: '+nuts.atNight+' of '+nuts.nuts);
  ck(nuts.byDay===0, 'the nuts glow in daylight too: '+nuts.byDay);
  ck(nuts.handed>=200, 'the glow barely ran, so the cache proves nothing: '+nuts.handed);
  ck(nuts.distinct===1, nuts.handed+' nut glows were handed '+nuts.distinct+' different gradients'
     +' - it is being rebuilt rather than cached');

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL ZOOM/ORDER/RIM/NUT CHECKS PASS');
  await b.close();
})();
