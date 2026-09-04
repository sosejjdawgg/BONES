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
  await pg.waitForTimeout(1800);

  const cage = await pg.evaluate(()=>{
    PK.bossDone=false; pkBossStart();
    for(let i=0;i<400;i++) pkBossUpdate(0.033);        // finish the arrival for real
    const B=BOSS.box;
    if(!B.w) return {err:'box never sized'};
    window.__bad=[]; const orig=bossAdd;
    bossAdd=function(bb){ if(!bossOutside(bb.x,bb.y))
        window.__bad.push({k:bb.k,x:Math.round(bb.x),y:Math.round(bb.y)});
      return orig(bb); };
    let spawns=0, hurtWhileOut=0;
    for(const kind of ["rain","sweepL","sweepR","ring","cross","surge","maw"]){
      for(const ph of [1,3]){                          // normal AND phase-three doubles
        BOSS.phase=ph;
        BOSS.bullets.length=0; BOSS.spawn.length=0;
        BOSS.ph="pattern"; BOSS.telegraph=kind; BOSS.patternT=0;
        BOSS.spawn.push(pkBossSpawner(kind)); BOSS.patternLen=BOSS.spawn[0].life;
        for(let i=0;i<420;i++){
          BOSS.hp=BOSS.maxhp; PK.hp=PK.maxhp; BOSS.invulnT=0;
          BOSS.dog.x=B.w/2; BOSS.dog.y=B.h/2;          // parked dead centre
          const h0=BOSS.hits;
          pkBossUpdate(0.033);
          spawns=Math.max(spawns,BOSS.bullets.length);
          // anything that hurt him this frame must have been INSIDE
          if(BOSS.hits>h0){
            const near=BOSS.bullets.filter(x=>x.out &&
              Math.hypot(x.x-BOSS.dog.x, x.y-BOSS.dog.y) < x.r+BOSS_DOG_R);
            if(near.length) hurtWhileOut++;
          }
        }
      }
    }
    bossAdd=orig;
    return {bad:window.__bad.slice(0,10), badN:window.__bad.length, hurtWhileOut, sawBullets:spawns,
            box:{w:Math.round(B.w),h:Math.round(B.h)}};
  });
  console.log('CAGE   ', JSON.stringify(cage));
  ck(!cage.err, 'setup: '+cage.err);
  ck(cage.sawBullets>0, 'no bullets were produced at all, so this proves nothing');
  ck(cage.badN===0, 'projectiles born INSIDE the box: '+JSON.stringify(cage.bad));
  ck(cage.hurtWhileOut===0, 'an out-of-box projectile dealt damage');

  const ring = await pg.evaluate(()=>{
    const B=BOSS.box, R=Math.hypot(B.w,B.h)*0.5+26;
    let minOut=1e9;
    for(let i=0;i<720;i++){ const a=i/720*6.283;
      const x=B.w/2+Math.cos(a)*R, y=B.h/2+Math.sin(a)*R;
      minOut=Math.min(minOut, Math.max(-x, x-B.w, -y, y-B.h)); }
    const old=Math.max(B.w,B.h)*0.62;
    let oldWorst=1e9;
    for(let i=0;i<720;i++){ const a=i/720*6.283;
      const x=B.w/2+Math.cos(a)*old, y=B.h/2+Math.sin(a)*old;
      oldWorst=Math.min(oldWorst, Math.max(-x, x-B.w, -y, y-B.h)); }
    return {R:Math.round(R), worstClearance:Math.round(minOut),
            oldR:Math.round(old), oldWorst:Math.round(oldWorst)};
  });
  console.log('RING   ', JSON.stringify(ring));
  ck(ring.worstClearance>0, 'the ring still forms inside the box somewhere');
  ck(ring.oldWorst<0, 'the old radius was fine, so this fix was unnecessary');

  const tele = await pg.evaluate(()=>{
    const out={};
    for(const k of ["rain","sweepL","sweepR","cross","surge","ring","maw"]){
      BOSS.ph="breath"; BOSS.breathT=0; pkBossPickPattern=()=>{BOSS.last=k;return k;};
      pkBossTelegraph(); out[k]=BOSS.teleEdge;
    }
    return out;
  });
  console.log('TELE   ', JSON.stringify(tele));
  ck(tele.rain==='t'&&tele.sweepL==='l'&&tele.sweepR==='r'&&tele.surge==='b'&&tele.ring==='lrtb'
     &&tele.cross==='lt'&&tele.maw==='', 'edge telegraphs wrong: '+JSON.stringify(tele));

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL CAGE CHECKS PASS');
  await b.close();
})();
