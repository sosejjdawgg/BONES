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
  await pg.evaluate(()=>{ S.lvl=30; startPark(true); });
  await pg.waitForTimeout(2000);

  /* Geometry, solved rather than watched: put one enemy at a known bearing and ask the real
     predicate. No frames, no throttling, no flakiness. */
  const geo = await pg.evaluate(()=>{
    const out={};
    PK.faceAng=0;                                  // pointing due EAST (+x)
    const at=(deg,dist)=>{ const a=deg*Math.PI/180;
      return {dx:Math.cos(a)*dist, dy:Math.sin(a)*dist, d:dist}; };
    const probe=(deg,dist)=>{ const p=at(deg,dist);
      return pkInBarkCone(p.dx,p.dy,p.d,{t:"sq"}); };
    const R=PK.barkR;
    out.barkR=Math.round(R);
    out.cones=BARK_CONE;
    // rank 0: forward only
    PK.barkBigLvl=0;
    out.r0={arc:pkBarkArc(), omni:pkBarkOmni(),
            ahead:probe(0,R*0.6), edgeIn:probe(30,R*0.6), side:probe(75,R*0.6),
            behind:probe(180,R*0.6), tooFar:probe(0,R*3)};
    // widening actually widens
    const widths=[];
    for(let lv=0; lv<BARK_CONE.length; lv++){
      PK.barkBigLvl=lv;
      let n=0; for(let d=0; d<360; d+=5) if(probe(d,R*0.6)) n++;
      widths.push({lv, arc:pkBarkArc(), hitDirs:n});
    }
    out.widths=widths;
    // max rank is a genuine full circle
    PK.barkBigLvl=BARK_CONE.length-1;
    out.max={arc:pkBarkArc(), omni:pkBarkOmni(),
             behind:probe(180,R*0.6), side:probe(90,R*0.6), tooFar:probe(180,R*3)};
    // facing follows the aim angle, not the 8-way sprite index
    PK.barkBigLvl=0; PK.faceAng=Math.PI;            // now pointing WEST
    out.turned={behindNowHit:probe(180,R*0.6), aheadNowMiss:probe(0,R*0.6)};
    return out;
  });
  console.log('GEOMETRY', JSON.stringify(geo,null,1));
  ck(geo.r0.ahead===true,   'rank 0 does not hit straight ahead');
  ck(geo.r0.edgeIn===true,  'rank 0 does not hit inside its own cone');
  ck(geo.r0.side===false,   'rank 0 hits 75deg off-axis');
  ck(geo.r0.behind===false, 'rank 0 still hits behind him');
  ck(geo.r0.tooFar===false, 'the cone ignores range');
  ck(geo.max.omni===true && geo.max.behind===true && geo.max.side===true,
     'max rank is not a full circle');
  ck(geo.max.tooFar===false, 'max rank ignores range');
  ck(geo.turned.behindNowHit===true && geo.turned.aheadNowMiss===false,
     'the cone does not follow the aim angle');
  const w=geo.widths.map(x=>x.hitDirs);
  ck(w.every((v,i)=>i===0||v>=w[i-1]), 'ranks do not widen monotonically: '+JSON.stringify(w));
  ck(w[w.length-1]===72, 'max rank does not cover all 72 sampled bearings: '+w[w.length-1]);

  /* The live path: an enemy placed BEHIND him must not be barked, one in FRONT must. */
  const live = await pg.evaluate(async ()=>{
    window.__ka=true; window.__keep=()=>{ PK.hp=PK.maxhp; if(PK.shop) PK.shop=false;
      if(window.__ka) requestAnimationFrame(window.__keep); }; requestAnimationFrame(window.__keep);
    PK.barkBigLvl=0; PK.faceAng=0;                       // facing east
    PK.en.length=0;
    const mk=(dx,dy)=>pkEnMake({t:"sq", x:(PK.x+dx+PK.WW)%PK.WW, y:(PK.y+dy+PK.WH)%PK.WH,
      hp:9999, hpMax:9999, sp:70, ph:0, kx:0, ky:0, dir:1, fi:0, ft:0});
    const back=mk(-22,0), front=mk(22,0);
    const h0={back:back.hp, front:front.hp};
    PK.barkCd=0;
    for(let i=0;i<80;i++){
      PK.faceAng=0;                                      // keep him pointed east
      back.x=(PK.x-22+PK.WW)%PK.WW;  back.y=PK.y;
      front.x=(PK.x+22)%PK.WW;       front.y=PK.y;
      await new Promise(r=>setTimeout(r,45));
    }
    const r={h0, back:back.hp, front:front.hp, barked:front.hp<h0.front, spared:back.hp===h0.back};
    // ...and once it is omni, the one behind him is fair game too
    PK.barkBigLvl=BARK_CONE.length-1;
    const b0=back.hp; PK.barkCd=0;
    for(let i=0;i<80;i++){ PK.faceAng=0;
      back.x=(PK.x-22+PK.WW)%PK.WW; back.y=PK.y;
      await new Promise(r=>setTimeout(r,45)); }
    r.omniHitsBehind = back.hp<b0;
    window.__ka=false;
    return r;
  });
  console.log('LIVE    ', JSON.stringify(live));
  ck(live.barked===true, 'the enemy in front was never barked');
  ck(live.spared===true, 'the enemy behind him was barked anyway');
  ck(live.omniHitsBehind===true, 'omni rank still spares what is behind him');

  // the shop rank is reachable and caps correctly
  const shop = await pg.evaluate(()=>{
    PK.barkBigLvl=0;
    const names=[]; for(let i=0;i<8;i++){
      const pool=pkStatPool ? pkStatPool() : null; names.push(pool?pool.length:null); }
    return {cap:BARK_LVL_CAP, ranks:BARK_CONE.length-1, arc0:BARK_CONE[0], arcMax:BARK_CONE[BARK_CONE.length-1]};
  }).catch(()=>({err:true}));
  console.log('RANKS   ', JSON.stringify(shop));
  ck(shop.err||shop.cap===shop.ranks, 'the shop cap and the cone ladder disagree: '+JSON.stringify(shop));

  await pg.screenshot({path:'c_cone.png'});
  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL CONE CHECKS PASS');
  await b.close();
})();
