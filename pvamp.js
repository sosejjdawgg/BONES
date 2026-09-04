/* THE CURSE, END TO END.
   Four things have to be true at once for this to be a loop rather than a debuff: the burn scales
   with the dog so it means the same at every size, bones put health back so a run is a chase and
   not a countdown, the light is something he crosses and pays for rather than a wall he cannot
   pass, and the shutters actually turn it all off. Plus the part that is easy to get wrong and
   impossible to notice: the strength/stamina buff must be READ, never written, or curing him
   hands back a dog whose training has been overwritten with 100s. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
const said = (pg)=>pg.evaluate(()=>{
  const t=document.getElementById('toast');
  if(t && t.style.display==='block' && t.textContent) return t.textContent;
  return (typeof DOGLOG!=='undefined' && DOGLOG[0]) ? DOGLOG[0].msg : '';
});
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1900);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; XPANIM.ready=false; S.pendingStage.length=0;
                          S.money=900; S.ballOwned=true; });
  await pg.waitForTimeout(400);

  /* ---------- 1. THE BURN SCALES WITH THE DOG ---------- */
  /* A flat rate is the thing being replaced, so the assertion is explicitly about the RATIO: the
     same seconds must cost twice as much on a dog with twice the health. */
  const burn = await pg.evaluate(()=>{
    const run=(maxhp)=>{
      PK.active=true; PK.plusMode=false; PK.maxhp=maxhp; PK.hp=maxhp;
      // PK is a bare object until a run starts — fx does not exist yet
      PK.fx=PK.fx||[]; PK.vampAcc=0; PK.vampToldSun=false; PK.fx.length=0; S.vampire=true;
      let t=0; const dt=1/60;
      // just the curse block, driven the way parkUpdate drives it
      for(let i=0;i<600;i++){                       // 10 seconds
        PK.vampAcc+=PK.maxhp*VAMP_PARK_PCT*dt;
        while(PK.vampAcc>=1){ PK.vampAcc-=1; PK.hp=Math.max(0,PK.hp-1); }
        t+=dt;
      }
      return maxhp-PK.hp;
    };
    const a=run(100), b=run(200);
    PK.active=false; S.vampire=false;
    return {pct:VAMP_PARK_PCT, lost100:a, lost200:b};
  });
  console.log('BURN  ', JSON.stringify(burn));
  ck(burn.pct===0.02, 'the burn is not 2%: '+burn.pct);
  ck(Math.abs(burn.lost100-20)<=1, '10s at maxhp 100 cost '+burn.lost100+', expected ~20');
  ck(Math.abs(burn.lost200-40)<=1, '10s at maxhp 200 cost '+burn.lost200+', expected ~40');
  ck(Math.abs(burn.lost200-burn.lost100*2)<=2,
     'the burn does not scale with the dog: '+burn.lost100+' vs '+burn.lost200);

  /* ...and it runs through the REAL park loop, ending in a real death ---------- */
  const live = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    startPark(false);
    await sleep(700);
    S.vampire=true; PK.godMode=false; PK.vampToldSun=false; PK.vampAcc=0;
    const hp0=PK.hp, max=PK.maxhp;
    await sleep(2000);
    const dropped=hp0-PK.hp;
    const toldSun=PK.vampToldSun;
    // ...and it can finish him: drop him to a sliver and let the sun do the rest
    PK.hp=2; PK.vampAcc=0;
    await sleep(2500);
    const dead=!PK.active || PK.hp<=0;
    return {max, hp0, dropped, toldSun, dead, plus:PK.plusMode};
  });
  console.log('LIVE  ', JSON.stringify(live));
  ck(live.plus===false, 'this was meant to be the daylight run');
  ck(live.dropped>0, 'two seconds of daylight took nothing off a cursed dog');
  ck(live.toldSun===true, 'the run never said THE SUN IS ON HIM');
  ck(live.dead===true, 'the curse could not finish him even from 2hp');

  /* ---------- 2. NIGHT IS SAFE, AND BONES STILL HEAL ---------- */
  const night = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    PK.active=false; showScreen('home');
    await sleep(300);
    startPark(true);                       // UNLEASHED — the night run
    await sleep(700);
    S.vampire=true; PK.godMode=false; PK.hp=Math.round(PK.maxhp*0.5);
    const safe=pkVampSafe();
    const hp0=PK.hp;
    await sleep(1600);
    const burned=hp0-PK.hp;
    // a bone picked up at night must still heal
    PK.hp=Math.round(PK.maxhp*0.5); PK.fx.length=0; PK.chainT=0;
    const before=PK.hp;
    pkGain(4, PK.x, PK.y);
    const greens=PK.fx.filter(f=>f.col==='#4f8');
    return {safe, burned, before, after:PK.hp, max:PK.maxhp,
            greens:greens.length, txt:greens[0]&&greens[0].txt};
  });
  console.log('NIGHT ', JSON.stringify(night));
  ck(night.safe===true, 'UNLEASHED did not report as safe');
  ck(night.burned<=0, 'he burned at night: lost '+night.burned);
  ck(night.after>night.before, 'a bone at night healed nothing');
  ck(night.greens===1, 'the heal did not push exactly one green fx: '+night.greens);

  /* ...and the heal is 0.25% of maxhp per unit, floored at 1 ---------- */
  const heal = await pg.evaluate(()=>{
    const probe=(max,n)=>{
      PK.maxhp=max; PK.hp=1; PK.fx.length=0; PK.chainT=0; PK.chain=0;
      const before=PK.hp; pkGain(n,0,0);
      return PK.hp-before;
    };
    S.vampire=true;
    const o={pct:VAMP_BONE_HEAL, big:probe(400,10), small:probe(100,1), mid:probe(200,8)};
    // ...and an uncursed dog gets nothing back at all
    S.vampire=false;
    o.plain=probe(400,10);
    return o;
  });
  console.log('HEAL  ', JSON.stringify(heal));
  ck(heal.pct===0.0025, 'the heal rate is not 0.25%: '+heal.pct);
  ck(heal.big===10, '10 bones on a 400hp dog healed '+heal.big+', expected 10');
  ck(heal.small===1, 'one bone on a 100hp dog healed '+heal.small+', expected the floor of 1');
  ck(heal.mid===4, '8 bones on a 200hp dog healed '+heal.mid+', expected 4');
  ck(heal.plain===0, 'an UNCURSED dog healed '+heal.plain+' off a bone pickup');

  await pg.evaluate(()=>{ PK.active=false; S.vampire=false; showScreen('home'); });
  await pg.waitForTimeout(500);

  /* ---------- 3. THE LIGHT IS CROSSABLE, COSTLY, AND NOT A BED ---------- */
  const sun = await pg.evaluate(()=>{
    S.vampire=true; S.blindsOwned=false; S.blindsShut=false; CLK.h=12;
    const p=sunPatch();
    if(!p) return {none:true};
    const o={patch:{x:+p.x.toFixed(3), z:+p.z.toFixed(3), r:p.r}};
    /* BIAS while pleasing himself: camSolid shoves him out. Measured with the bed moved aside,
       because camSolid runs the furniture push AFTER the sun push and the two can disagree - at
       noon the patch lands near the back wall, right where the bed lives, and being shoved off the
       bed puts him a little way back into the light. That is not a bug in the sun term (which is
       exactly `r` on its own, asserted here); it is why the dart in vampSunTick exists, and the
       SIZZLE block below is what proves he does not end up standing in it. */
    CAM.state="walk";
    const bed={x:SPOT.bed.x, z:SPOT.bed.z};
    SPOT.bed.x=0.05; SPOT.bed.z=0.90;
    const [bx,bz]=camSolid(p.x,p.z,null);
    o.pushed=+Math.hypot(bx-p.x,(bz-p.z)*1.5).toFixed(3);
    SPOT.bed.x=bed.x; SPOT.bed.z=bed.z;
    const [cx,cz]=camSolid(p.x,p.z,null);
    o.pushedNearBed=+Math.hypot(cx-p.x,(cz-p.z)*1.5).toFixed(3);
    // ...but a job in hand goes straight through
    CAM.state="fetch";
    const [fx,fz]=camSolid(p.x,p.z,null);
    o.chaseThrough=+Math.hypot(fx-p.x,(fz-p.z)*1.5).toFixed(3);
    CAM.state="leap";
    const [lx,lz]=camSolid(p.x,p.z,null);
    o.leapThrough=+Math.hypot(lx-p.x,(lz-p.z)*1.5).toFixed(3);
    return o;
  });
  console.log('SUN   ', JSON.stringify(sun));
  ck(!sun.none, 'there is no sun patch at noon to test with');
  ck(sun.pushed>=sun.patch.r-0.001,
     'the patch does not push a wandering dog out: '+sun.pushed+' of r='+sun.patch.r);
  ck(sun.pushedNearBed>sun.patch.r*0.6,
     'furniture beside the patch cancels the sun bias almost entirely: '+sun.pushedNearBed);
  ck(sun.chaseThrough===0,
     'a dog CHASING is still blocked by the light — it is a wall again: '+sun.chaseThrough);
  ck(sun.leapThrough===0, 'a LEAP is blocked by the light: '+sun.leapThrough);

  /* standing in it drains him, sizzles, and makes him bolt ---------- */
  const sizzle = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const p=sunPatch();
    S.vampire=true;
    Object.assign(S,{hunger:100,thirst:100,fun:100,mood:100});
    VAMPFX.motes.length=0; VAMPFX.told=0; VAMPFX.dwell=0; VAMPFX.dart=0;
    // park him dead centre of the beam, in a state he is allowed to be shooed out of
    CAM.state="idle"; CAM.until=99; CAM.t=0; CAM.x=p.x; CAM.z=p.z; CAM.wander=null;
    const before={h:S.hunger,t:S.thirst,f:S.fun,m:S.mood};
    let motes=0, sawWalk=false, scarper=0;
    for(let i=0;i<40;i++){
      await sleep(50);
      motes=Math.max(motes,VAMPFX.motes.length);
      if(CAM.state==="walk"){ sawWalk=true; scarper=Math.max(scarper,CAM.scarper||0); }
    }
    const p2=sunPatch();
    const out = p2 ? Math.hypot(CAM.x-p2.x,(CAM.z-p2.z)*1.5) > p2.r : true;
    return { before, after:{h:+S.hunger.toFixed(1),t:+S.thirst.toFixed(1),
                            f:+S.fun.toFixed(1),m:+S.mood.toFixed(1)},
             motes, sawWalk, scarper, out, told:VAMPFX.told>0 };
  });
  console.log('SIZZLE', JSON.stringify(sizzle));
  ck(sizzle.after.f < sizzle.before.f-2, 'standing in the sun did not drain FUN: '+JSON.stringify(sizzle.after));
  ck(sizzle.after.t < sizzle.before.t-1, 'standing in the sun did not drain THIRST');
  ck(sizzle.after.h < sizzle.before.h-1, 'standing in the sun did not drain HUNGER');
  ck(sizzle.motes>0, 'no embers — nothing on screen says he is cooking');
  ck(sizzle.told===true, 'he never said HE HATES THE LIGHT');
  ck(sizzle.sawWalk===true, 'he stood in the beam and never bolted');
  ck(sizzle.scarper>0, 'he walked out at his ordinary amble rather than scarpering');
  ck(sizzle.out===true, 'he is still standing in the light after all that');

  // ...and he will not settle into a nap in it
  const nap = await pg.evaluate(()=>{
    const p=sunPatch();
    S.vampire=true; S.bedTier=3;
    /* SAVED AND PUT BACK, not retyped. This used to restore SPOT.bed by writing 0.80/0.085 back
       into it - the bed's address at the time - so the moment the bed moved to the middle of the
       floor this test silently dragged it back to the old corner for every test after it. A
       harness that hardcodes the value it is restoring is a harness that quietly un-ships the
       change it is meant to be checking. */
    const bed0={x:SPOT.bed.x, z:SPOT.bed.z};
    SPOT.bed.x=p.x; SPOT.bed.z=p.z-0.09;          // put the bed under the beam for the test
    CAM.x=p.x; CAM.z=p.z; CAM.state="walk"; CAM.bedTarget=true; CAM.t=0; CAM.until=99;
    for(let i=0;i<40;i++) camBehavior(1/60);
    const o={state:CAM.state, bedTarget:CAM.bedTarget};
    SPOT.bed.x=bed0.x; SPOT.bed.z=bed0.z;
    return o;
  });
  console.log('NAP   ', JSON.stringify(nap));
  ck(nap.state!=="rest", 'he lay down for a nap inside the sunbeam');

  /* ---------- 4. THE SHUTTERS TURN IT ALL OFF ---------- */
  const blinds = await pg.evaluate(()=>{
    S.vampire=true; CLK.h=12;
    S.blindsOwned=false; S.blindsShut=false; S.blindsTier=0;
    const o={before:!!sunPatch()};
    S.blindsOwned=true; S.blindsTier=1; S.blindsShut=true;
    o.after=!!sunPatch();
    o.sealing=blindsSealing();
    // ...and with no patch there is nothing to burn him
    Object.assign(S,{fun:100});
    VAMPFX.motes.length=0;
    CAM.state="idle"; CAM.x=0.5; CAM.z=0.4;
    for(let i=0;i<60;i++) vampSunTick(1/60);
    o.funHeld=S.fun===100;
    o.motes=VAMPFX.motes.length;
    // blackout + shut seals a broken pane against the bat
    S.winBroken=true; S.vampire=false;
    o.batTier1=(()=>{ let any=false; for(let i=0;i<400;i++) if(batWanted()) any=true; return any; })();
    S.blindsTier=2;
    o.batTier2=(()=>{ let any=false; for(let i=0;i<400;i++) if(batWanted()) any=true; return any; })();
    S.blindsShut=false;                       // open blackout is not a seal
    o.batOpen=(()=>{ let any=false; for(let i=0;i<400;i++) if(batWanted()) any=true; return any; })();
    S.winBroken=false; S.blindsShut=true;
    return o;
  });
  console.log('BLINDS', JSON.stringify(blinds));
  ck(blinds.before===true, 'there was no sun patch to shut out at noon');
  ck(blinds.after===false, 'the blinds are down and the sun patch is still there');
  ck(blinds.sealing===true, 'blindsSealing() disagrees with its own flags');
  ck(blinds.funHeld===true, 'he burned behind closed blinds');
  ck(blinds.motes===0, 'embers behind closed blinds');
  ck(blinds.batTier1===true, 'plain blinds stopped the bat — only blackout should');
  ck(blinds.batTier2===false, 'blackout + shut did not seal the broken pane against the bat');
  ck(blinds.batOpen===true, 'blackout left OPEN still sealed the window');

  /* the swipe, on the real canvas, through the real listeners ---------- */
  const swipe = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    S.blindsOwned=true; S.blindsTier=1; S.blindsShut=false;
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    const cv=document.getElementById('dogcv'), r=cv.getBoundingClientRect();
    const cx=r.left+r.width*(WIN_X+WIN_W/2), cy=r.top+r.height*(WIN_Y+WIN_H/2);
    const fire=(type,x,y)=>cv.dispatchEvent(new PointerEvent(type,
      {clientX:x, clientY:y, pointerId:1, bubbles:true, isPrimary:true}));
    fire('pointerdown',cx,cy); fire('pointerup',cx,cy+60);      // swipe DOWN
    await sleep(60);
    const down=S.blindsShut;
    fire('pointerdown',cx,cy); fire('pointerup',cx,cy-60);      // swipe UP
    await sleep(60);
    const up=S.blindsShut;
    fire('pointerdown',cx,cy); fire('pointerup',cx,cy+2);       // a tap
    await sleep(60);
    const panel=document.getElementById('choice').classList.contains('show');
    const title=document.getElementById('chTitle').textContent;
    const btns=[...document.querySelectorAll('#choice button')]
      .filter(b=>b.style.display!=='none').map(b=>b.textContent);
    document.getElementById('choice').classList.remove('show');
    return {down, up, panel, title, btns};
  });
  console.log('SWIPE ', JSON.stringify(swipe));
  ck(swipe.down===true, 'a swipe DOWN on the window did not shut the blinds');
  ck(swipe.up===false, 'a swipe UP on the window did not open them');
  ck(swipe.panel===true && swipe.title==='SHUTTERS', 'a tap did not raise the shutters panel');
  ck(swipe.btns.includes('LEAVE'),
     'the shutters panel has no way out: '+JSON.stringify(swipe.btns));
  ck(swipe.btns.length<=3, 'more options than openChoice has buttons: '+JSON.stringify(swipe.btns));

  /* ...and with a broken pane AND an upgrade available, LEAVE still survives ---------- */
  const crowded = await pg.evaluate(()=>{
    S.blindsOwned=true; S.blindsTier=1; S.blindsShut=true; S.winBroken=true; S.winCracks=3;
    openShutterPanel();
    const btns=[...document.querySelectorAll('#choice button')]
      .filter(b=>b.style.display!=='none').map(b=>b.textContent);
    document.getElementById('choice').classList.remove('show');
    S.winBroken=false; S.winCracks=0;
    return btns;
  });
  console.log('CROWD ', JSON.stringify(crowded));
  ck(crowded.includes('LEAVE'), 'a damaged pane crowded LEAVE out of the panel: '+JSON.stringify(crowded));
  ck(crowded.some(b=>/RE-GLAZE/.test(b)),
     'with the slats down there is no route to the glazier at all: '+JSON.stringify(crowded));

  /* ---------- 5. THE BUFF IS READ, NEVER WRITTEN ---------- */
  /* This is the one that would go unnoticed for weeks: if the curse writes 100 into S.str, the
     dog is briefly stronger and permanently robbed of whatever he had trained. */
  const buff = await pg.evaluate(()=>{
    S.vampire=false; S.str=31; S.stam=42; S.vit=27;
    const plain={str:attrF("str"), stam:attrF("stam"), vit:attrF("vit")};
    S.vampire=true;
    const cursed={str:attrF("str"), stam:attrF("stam"), vit:attrF("vit")};
    const disk={str:S.str, stam:S.stam, vit:S.vit};
    S.vampire=false;
    const cured={str:attrF("str"), stam:attrF("stam"), vit:attrF("vit")};
    return {plain, cursed, disk, cured, diskAfter:{str:S.str, stam:S.stam, vit:S.vit}};
  });
  console.log('BUFF  ', JSON.stringify(buff));
  ck(buff.cursed.str===1 && buff.cursed.stam===1,
     'the curse does not max strength/stamina: '+JSON.stringify(buff.cursed));
  ck(buff.cursed.vit===buff.plain.vit, 'the curse also raised VITALITY, which it should not');
  ck(buff.disk.str===31 && buff.disk.stam===42,
     'THE CURSE WROTE TO DISK — training destroyed: '+JSON.stringify(buff.disk));
  ck(buff.cured.str===buff.plain.str && buff.cured.stam===buff.plain.stam,
     'curing him did not give the trained values back: '+JSON.stringify(buff.cured));

  /* an overfilled attribute must not be dragged DOWN to 100 by the curse ---------- */
  const over = await pg.evaluate(()=>{
    S.str=130; S.vampire=false; const plain=attrF("str");
    S.vampire=true; const cursed=attrF("str");
    S.vampire=false; S.str=31;
    return {plain:+plain.toFixed(2), cursed:+cursed.toFixed(2)};
  });
  console.log('OVER  ', JSON.stringify(over));
  ck(over.cursed>=over.plain, 'the curse capped an overfilled attribute back to full: '+JSON.stringify(over));

  /* form ignores hunger and energy while cursed ---------- */
  const form = await pg.evaluate(()=>{
    S.vampire=false; Object.assign(S,{energy:5,hunger:5,thirst:60,mood:60});
    const starved=computeForm(false);
    Object.assign(S,{energy:100,hunger:100});
    const fed=computeForm(false);
    Object.assign(S,{energy:5,hunger:5});
    S.vampire=true;
    const cursed=computeForm(false);
    S.vampire=false; Object.assign(S,{energy:80,hunger:80,thirst:80,mood:80});
    return {starvedSpd:+starved.spd.toFixed(3), fedSpd:+fed.spd.toFixed(3),
            cursedSpd:+cursed.spd.toFixed(3),
            starvedJmp:+starved.jmp.toFixed(3), fedJmp:+fed.jmp.toFixed(3),
            cursedJmp:+cursed.jmp.toFixed(3)};
  });
  console.log('FORM  ', JSON.stringify(form));
  ck(form.cursedSpd>=form.fedSpd-1e-6,
     'a starving cursed dog is slower than a fed one: '+JSON.stringify(form));
  ck(form.cursedJmp>=form.fedJmp-1e-6, 'a starving cursed dog jumps worse than a fed one');
  ck(form.cursedSpd>form.starvedSpd, 'the curse made no difference to speed at all');

  /* ---------- 6. NEVER SICK, AND HUNGRIER ---------- */
  const sick = await pg.evaluate(()=>{
    S.vampire=true; S.sick=true; S.sickTimer=999;
    Object.assign(S,{hunger:1,thirst:1,energy:1,clean:1,fun:1,mood:1});
    tickStats(1, true);
    const cleared={sick:S.sick, timer:S.sickTimer};
    // ...and the run gates do not bounce him
    const gate=(()=>{ let msg=""; const old=toast; window.toast=(m)=>{msg=m;};
      try{ openPre("daily"); } finally { window.toast=old; }
      document.getElementById('pre').classList.remove('show');
      return msg; })();
    S.vampire=false; S.sick=false; S.sickTimer=0;
    return {cleared, gate};
  });
  console.log('SICK  ', JSON.stringify(sick));
  ck(sick.cleared.sick===false, 'a cursed dog stayed sick through a tick');
  ck(sick.cleared.timer===0, 'the sick clock kept running while cursed');
  ck(!/TOO SICK/.test(sick.gate), 'the daily-run gate still bounced a cursed dog: '+sick.gate);

  const drain = await pg.evaluate(()=>{
    const run=(v)=>{ S.vampire=v; S.hunger=100; S.thirst=100;
      for(let i=0;i<10;i++) tickStats(1, true);
      return {h:+(100-S.hunger).toFixed(2), t:+(100-S.thirst).toFixed(2)}; };
    const plain=run(false), cursed=run(true);
    S.vampire=false; S.hunger=80; S.thirst=80;
    return {plain, cursed};
  });
  console.log('DRAIN ', JSON.stringify(drain));
  ck(Math.abs(drain.cursed.h - drain.plain.h*2) < 0.4,
     'hunger does not drain twice as fast while cursed: '+JSON.stringify(drain));
  ck(Math.abs(drain.cursed.t - drain.plain.t*2) < 0.4,
     'thirst does not drain twice as fast while cursed: '+JSON.stringify(drain));

  /* ---------- 7. THE UNDEAD ARE NEVER SENT TO BED ----------
     This block is INVERTED, not deleted. It used to assert that a cursed dog had his own bedtime
     at midday - which was a smaller version of the same wrong idea, since the thing that makes no
     sense for a vampire is not WHEN he is marched off to bed but that anything marches him at all.
     The question "who gets sent to bed, and when" is still exactly the right question to ask; it
     has a different right answer now. */
  const hours = await pg.evaluate(()=>{
    const o={};
    // UNCURSED: midnight still raises bedtime, and midday never did
    S.vampire=false; SLEEP.pending=false; CLK.h=11.99; tickStats(0.2, true);
    o.plainNoon=SLEEP.pending;
    SLEEP.pending=false; CLK.h=23.98; tickStats(0.5, true);
    o.plainMidnight=SLEEP.pending;
    // CURSED: neither hour raises it, nor any hour in between
    S.vampire=true; SLEEP.pending=false; CLK.h=11.95; tickStats(0.6, true);
    o.vampNoon=SLEEP.pending;
    SLEEP.pending=false; CLK.h=23.98; tickStats(0.5, true);
    o.vampMidnight=SLEEP.pending;
    SLEEP.pending=false; CLK.h=0;
    for(let i=0;i<240;i++) tickStats(1, true);       // a whole day, hour by hour
    o.vampWholeDay=SLEEP.pending;
    SLEEP.pending=false; S.vampire=false; CLK.h=8;
    return o;
  });
  console.log('HOURS ', JSON.stringify(hours));
  ck(hours.plainNoon===false, 'an ordinary dog was sent to bed at midday');
  ck(hours.plainMidnight===true, 'the ordinary midnight bedtime stopped firing');
  ck(hours.vampNoon===false, 'a cursed dog is still being sent to bed at midday');
  ck(hours.vampMidnight===false, 'a cursed dog is still being sent to bed at midnight');
  ck(hours.vampWholeDay===false,
     'a cursed dog was sent to bed at some point during a full 24 hours');

  /* ...and a bedtime BANKED before the curse landed is dropped rather than served once ---------- */
  const banked = await pg.evaluate(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    closeBedtime();
    S.vampire=true; SLEEP.pending=true; SLEEP.active=false;
    showScreen('home'); PK.active=false; R.active=false; OUTING.active=false;
    await sleep(400);                                 // the loop's gate runs every frame
    const o={pend:SLEEP.pending, active:SLEEP.active,
             panel:document.getElementById('bedtimePanel').classList.contains('show')};
    S.vampire=false; SLEEP.pending=false; closeBedtime();
    return o;
  });
  console.log('BANKED', JSON.stringify(banked));
  ck(banked.panel===false && banked.active===false,
     'a bedtime banked before the bite was still served to the vampire: '+JSON.stringify(banked));
  ck(banked.pend===false, 'the stale bedtime flag is still sitting there armed');

  const wake = await pg.evaluate(()=>{
    S.vampire=true; S.dead=false; S.neglectNight=false; BAT.on=false;
    S.winBroken=false; CLK.h=1.0;
    skipToMorning();
    const v=+CLK.h.toFixed(2);
    S.vampire=false; CLK.h=1.0;
    skipToMorning();
    const p=+CLK.h.toFixed(2);
    return {vamp:v, plain:p};
  });
  console.log('WAKE  ', JSON.stringify(wake));
  // skipping the night ends at dawn for EVERYONE now — the 18:00 wake matched a window that is gone
  ck(Math.abs(wake.vamp-6)<0.2, 'a cursed dog did not run the night off to 06:00: '+wake.vamp);
  ck(Math.abs(wake.plain-6)<0.2, 'an ordinary dog did not wake at 06:00: '+wake.plain);

  /* ---------- 7b. THE MOON ---------- */
  /* The whole trick here is the WRAP: 19:00-05:00 crosses midnight, so a naive u=(h-19)/10 makes
     every hour after midnight negative and the moon simply never appears. Sampled right across
     the night rather than at one convenient hour. */
  const moon = await pg.evaluate(()=>{
    const at=h=>{ CLK.h=h; const m=moonSky();
      return m?{u:+m.u.toFixed(3), elev:+m.elev.toFixed(3), gain:+m.gain.toFixed(3)}:null; };
    const o={ rise:MOON_RISE, set:MOON_SET, span:MOON_SPAN,
              noon:at(12), six:at(6), eighteen:at(18),
              justUp:at(19.2), late:at(22), mid:at(24-0.001), past:at(0.5),
              small:at(3), justDown:at(4.8), gone:at(5.5) };
    // the arc, sampled all the way across the night
    const seq=[]; for(let i=0;i<=20;i++){ const h=(19+i*0.5)%24; const m=at(h);
      seq.push(m?m.elev:null); }
    o.seq=seq;
    CLK.h=8;
    return o;
  });
  console.log('MOON  ', JSON.stringify({r:moon.rise,s:moon.set,span:moon.span,
    noon:moon.noon, justUp:moon.justUp, mid:moon.mid, past:moon.past, gone:moon.gone}));
  console.log('MOONARC', JSON.stringify(moon.seq));
  ck(moon.span===10, 'the night is not ten hours long: '+moon.span);
  ck(moon.noon===null && moon.six===null && moon.eighteen===null,
     'the moon is out in broad daylight');
  ck(moon.gone===null, 'the moon is still up at 05:30');
  ck(moon.justUp && moon.mid && moon.past && moon.small,
     'the moon is missing from part of its own night: '+JSON.stringify(moon));
  ck(moon.past!==null,
     'THE WRAP IS BROKEN — the moon vanishes after midnight, which is the whole difficulty here');
  // it RISES and LOWERS: low at both ends, highest around midnight
  ck(moon.mid.elev>0.97, 'the moon is not at its highest at midnight: '+moon.mid.elev);
  ck(moon.justUp.elev<0.25, 'the moon is already high the moment it rises: '+moon.justUp.elev);
  ck(moon.justDown.elev<0.25, 'the moon has not come back down by moonset: '+moon.justDown.elev);
  const arc=moon.seq.filter(v=>v!==null);
  ck(arc.length>=17, 'the moon is only up for '+arc.length+' of 21 samples across its night');
  ck(Math.max(...arc)>0.97 && Math.min(...arc)<0.2,
     'the moon does not travel an arc: '+JSON.stringify(arc));

  /* ---------- 8. SHOP + DEV SKIPS ---------- */
  const shop = await pg.evaluate(()=>{
    S.blindsOwned=false; S.blindsTier=0; S.blindsShut=false; S.money=900;
    S.bedTier=0; S.lvl=20; XPANIM.lvl=20;      // a bed to buy, and the level that unlocks the row
    renderShop();
    const html=()=>document.getElementById('shopSup').innerHTML;
    /* rugRow is INVERTED: the rug is no longer sold as homeware because it is his bed, bought and
       upgraded through the DOG BED / BIGGER BED rows like any other bed. */
    const o={home:/HOMEWARE/.test(html()), blindsRow:/data-sup="blinds"/.test(html()),
             rugRow:/data-sup="rug"/.test(html()),
             bedRow:/data-sup="bed"|data-sup="biggerbed"/.test(html()),
             blackoutHidden:!/data-sup="blackout"/.test(html())};
    const click=k=>{ const b=document.querySelector('#shopSup [data-sup="'+k+'"]');
                     if(b) b.click(); return !!b; };
    const m0=S.money;
    click('blinds');
    o.blinds={owned:S.blindsOwned, tier:S.blindsTier, spent:m0-S.money};
    renderShop();
    o.blackoutNow=/data-sup="blackout"/.test(html());
    const m1=S.money; click('blackout');
    o.blackout={tier:S.blindsTier, spent:m1-S.money};
    return o;
  });
  console.log('SHOP  ', JSON.stringify(shop));
  ck(shop.home===true, 'there is no HOMEWARE section in the shop');
  ck(shop.blindsRow, 'the blinds row is missing');
  ck(shop.rugRow===false,
     'the rug is still sold separately — it is his BED now, bought through the bed rows');
  ck(shop.bedRow===true, 'there is no way to buy or upgrade the bed at all');
  ck(shop.blackoutHidden===true, 'blackout lining is offered before the blinds exist');
  ck(shop.blinds.owned===true && shop.blinds.tier===1 && shop.blinds.spent===100,
     'buying blinds went wrong: '+JSON.stringify(shop.blinds));
  ck(shop.blackoutNow===true, 'blackout lining never appeared after buying blinds');
  ck(shop.blackout.tier===2 && shop.blackout.spent===80,
     'buying the lining went wrong: '+JSON.stringify(shop.blackout));


  // the dev skips must move time through tickStats, not by assignment
  await pg.click('#devToggle'); await pg.waitForTimeout(150);
  await pg.evaluate(()=>{ const pad=document.getElementById('pinPad');
    for(const d of "1234") [...pad.children].find(b=>b.textContent===d).click(); });
  await pg.waitForTimeout(300);
  const skip = await pg.evaluate(()=>{
    S.vampire=false; SLEEP.pending=false; CLK.h=8; CLK.day=3;
    S.hunger=100; S.thirst=100;
    document.getElementById('devSkip3').click();
    const a={h:+CLK.h.toFixed(2), day:CLK.day, hunger:+S.hunger.toFixed(1)};
    // 12 hours from 20:00 must roll the DAY, which only tickStats can do
    CLK.h=20; CLK.day=3; SLEEP.pending=false;
    document.getElementById('devSkip12').click();
    const b={h:+CLK.h.toFixed(2), day:CLK.day, sleep:SLEEP.pending};
    return {a,b};
  });
  console.log('SKIP  ', JSON.stringify(skip));
  ck(Math.abs(skip.a.h-11)<0.2, 'SKIP 3H landed at '+skip.a.h+', expected 11');
  ck(skip.a.hunger<100, 'SKIP 3H moved the clock without draining anything — it bypassed tickStats');
  ck(skip.b.day===4, 'SKIP 12H across midnight did not roll the day: '+JSON.stringify(skip.b));
  ck(skip.b.sleep===true, 'SKIP 12H across midnight did not raise bedtime');

  const devbtn = await pg.evaluate(()=>{
    S.blindsOwned=false; S.blindsShut=false;
    document.getElementById('devBlinds').click();
    const a={owned:S.blindsOwned, shut:S.blindsShut};
    // GIVE RUG became BED TIER+ when the rug became the bed: it cycles none/puppy/medium/large
    S.bedTier=0; const tiers=[];
    for(let i=0;i<5;i++){ document.getElementById('devRug').click(); tiers.push(S.bedTier); }
    return {a, tiers, chip:document.getElementById('devStatus').textContent};
  });
  console.log('DEVBTN', JSON.stringify(devbtn));
  ck(devbtn.a.owned===true && devbtn.a.shut===true, 'TOGGLE BLINDS did not fit and shut them');
  ck(JSON.stringify(devbtn.tiers)==='[1,2,3,0,1]',
     'BED TIER+ does not cycle the four tiers: '+JSON.stringify(devbtn.tiers));
  ck(/BLINDS DOWN/.test(devbtn.chip), 'the chip does not report the blinds: '+devbtn.chip);

  /* ---------- 9. THE BED IS NOT GEOMETRY ----------
     The rug this used to test IS the bed now: it moved to the middle of the floor and took over
     from the basket that stood against the back wall. That makes this assertion matter far more
     than it did as a decoration check - the bed sits dead centre of the room, so if anything still
     treated it as solid it would fence off the middle of the floor and make his own bed the one
     place he could not stand. The basket WAS solid, so this is a genuine reversal. */
  const bed = await pg.evaluate(()=>{
    S.bedTier=3; S.vampire=false; CAM.state="walk";
    const b=SPOT.bed;
    const [x,z]=camSolid(b.x,b.z,null);
    return {moved:+Math.hypot(x-b.x,z-b.z).toFixed(4),
            at:{x:b.x, z:b.z}, rest:bedRestSpot(), r:+bedFloorR().toFixed(3)};
  });
  console.log('BED   ', JSON.stringify(bed));
  ck(bed.moved===0,
     'the bed is pushing the dog off the middle of his own floor: '+JSON.stringify(bed));
  ck(Math.abs(bed.at.x-0.5)<0.02, 'the bed is not in the middle of the room: '+JSON.stringify(bed.at));
  ck(bed.rest.x===bed.at.x && bed.rest.z===bed.at.z,
     'he does not sleep in the CENTRE of it: '+JSON.stringify(bed));

  /* ---------- THE GLASS MENDS ----------
     A cracked pane used to stay cracked until you paid a glazier, so "three hits" meant three
     hits ever, spread across as many days as you liked - which is why nobody could tell they
     were doing it. It heals now: ten quiet seconds and it starts to knit, ten more and it is
     clear. Three hits still takes the window out, but they have to land inside the same window
     of time, which is a thing you can actually see yourself doing. */
  const winheal = await pg.evaluate(()=>{
    const run=(sec)=>{ for(let i=0;i<Math.round(sec*60);i++) winHealTick(1/60); };
    const hit=()=>{ TRICK.hitWin=false; winTakeHit(); };
    const out={delay:WIN_HEAL_DELAY, time:WIN_HEAL_TIME};
    S.winCracks=0; S.winBroken=false; S.winHealT=0;

    hit();
    out.afterHit={n:S.winCracks, frac:winHealFrac()};
    run(9.5);
    out.beforeDelay={n:S.winCracks, frac:+winHealFrac().toFixed(3)};   // still nothing has moved
    run(5.0);                                                          // 14.5s: half knitted
    out.midway={n:S.winCracks, frac:+winHealFrac().toFixed(2)};
    run(6.0);                                                          // 20.5s: clear
    out.healed={n:S.winCracks, broken:S.winBroken, frac:winHealFrac()};

    // three inside the window is still what takes it out
    S.winCracks=0; S.winBroken=false; S.winHealT=0;
    hit(); run(2); hit(); run(2); hit();
    out.fast={n:S.winCracks, broken:S.winBroken};

    // ...but three spread across the healing is not: each one starts from clear glass
    S.winCracks=0; S.winBroken=false; S.winHealT=0;
    hit(); run(21); hit(); run(21); hit();
    out.slow={n:S.winCracks, broken:S.winBroken};

    // ...and two, then a wait, then one, is one crack rather than a smash
    S.winCracks=0; S.winBroken=false; S.winHealT=0;
    hit(); hit(); run(21); hit();
    out.twoThenWait={n:S.winCracks, broken:S.winBroken};

    // a smashed window does not heal itself back into a pane
    S.winCracks=3; S.winBroken=true; S.winHealT=0;
    run(30);
    out.smashed={broken:S.winBroken, n:S.winCracks};
    S.winCracks=0; S.winBroken=false; S.winHealT=0;
    return out;
  });
  console.log('HEAL  ', JSON.stringify(winheal));
  ck(winheal.delay===10 && winheal.time===10, 'the heal is not 10s then 10s: '+winheal.delay+'/'+winheal.time);
  ck(winheal.afterHit.n===1, 'one throw did not crack the glass');
  ck(winheal.beforeDelay.n===1 && winheal.beforeDelay.frac===0,
     'it started mending before the ten quiet seconds were up: '+JSON.stringify(winheal.beforeDelay));
  ck(winheal.midway.n===1 && winheal.midway.frac>0.3 && winheal.midway.frac<0.7,
     'it is not half-mended halfway through the mend: '+JSON.stringify(winheal.midway));
  ck(winheal.healed.n===0 && winheal.healed.broken===false,
     'twenty seconds of quiet did not clear the crack: '+JSON.stringify(winheal.healed));
  ck(winheal.fast.broken===true, 'three hits inside the window did NOT break it: '+JSON.stringify(winheal.fast));
  ck(winheal.slow.broken===false && winheal.slow.n===1,
     'three hits spread across three heals still broke it: '+JSON.stringify(winheal.slow));
  ck(winheal.twoThenWait.broken===false && winheal.twoThenWait.n===1,
     'two cracks did not heal off before the third: '+JSON.stringify(winheal.twoThenWait));
  ck(winheal.smashed.broken===true, 'a SMASHED window healed itself: '+JSON.stringify(winheal.smashed));

  await pg.waitForTimeout(300);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npvamp PASS');
})();
