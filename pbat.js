/* THE LIGHT, THE GLASS, THE THING THAT COMES THROUGH IT, AND HIS MOUTH.
   Two of these were the same old mistake - a rectangle written down twice and left to drift, and a
   body part guessed at rather than measured. The rest is new machinery, and the parts of it worth
   pinning are the ones a screenshot cannot settle: does the beam actually leave the window, does
   the ball's damage land on the pane you can see, does the mouth track the frame on screen. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.349a.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1900);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ S.lvl=14; XPANIM.lvl=14; S.pendingStage.length=0; S.ballOwned=true;
                          FLY.active=false; FLY.next=1e9; });
  await pg.waitForTimeout(600);

  /* ---------- 1. THE BEAM LEAVES THE WINDOW ---------- */
  /* It was hand-typed at 0.72 wide by 0.18 while the window is drawn at 0.585 by 0.135 - a seventh
     of the room to the right of the glass it was supposedly coming through. The shaft's origin
     edges must be window CORNERS, not numbers that once looked about right. */
  const ray = await pg.evaluate(()=>{
    CLK.h=12; CLK.m=0;
    const cv=document.querySelector('#dogcv'); const [ctx,w,h]=fit(cv);
    // record the first quad the shaft lays down: its near edge is the opening itself
    const pts=[]; let cur=null;
    const spy={ save(){}, restore(){}, beginPath(){ cur=[]; },
      moveTo(x,y){ if(cur) cur.push([x,y]); }, lineTo(x,y){ if(cur) cur.push([x,y]); },
      closePath(){}, fill(){ if(cur&&cur.length===4&&pts.length<1) pts.push(cur); },
      fillRect(){}, createLinearGradient(){ return {addColorStop(){}}; },
      set fillStyle(v){}, set globalAlpha(v){}, set strokeStyle(v){}, set lineWidth(v){} };
    drawSunray(spy,w,h,1.0);
    const winX=WIN_X*w, winY=WIN_Y*h, winW=WIN_W*w, winH=WIN_H*h;
    if(!pts.length) return {none:true};
    // the two NEAR corners of the first slat sit on the window; how far off it are they?
    const near=[pts[0][0], pts[0][1]];
    const off=near.map(p=>{
      const dx=Math.max(winX-p[0], 0, p[0]-(winX+winW));
      const dy=Math.max(winY-p[1], 0, p[1]-(winY+winH));
      return Math.round(Math.hypot(dx,dy));
    });
    return { worst:Math.max(...off), winX:Math.round(winX), winW:Math.round(winW),
             near:near.map(p=>[Math.round(p[0]),Math.round(p[1])]) };
  });
  console.log('RAY   ', JSON.stringify(ray));
  ck(!ray.none, 'the shaft drew nothing at midday');
  ck(ray.worst<=2, 'the beam starts '+ray.worst+'px off the window it comes through');

  /* ...and it tips through the day rather than being painted on */
  const tip = await pg.evaluate(()=>{
    const at=(h)=>{ CLK.h=h; CLK.m=0; const s=sunSky(); return s?+s.ang.toFixed(3):null; };
    const el=(h)=>{ CLK.h=h; CLK.m=0; const s=sunSky(); return s?+s.elev.toFixed(2):null; };
    const o={ dawn:at(7), noon:at(12), dusk:at(17), night:at(2),
              eDawn:el(7), eNoon:el(12), eDusk:el(17) };
    CLK.h=12; return o;
  });
  console.log('TIP   ', JSON.stringify(tip));
  ck(tip.night===null, 'the sun is still up at 2am');
  ck(tip.noon<tip.dawn && tip.noon<tip.dusk,
     'the beam is not steepest at midday: '+JSON.stringify(tip));
  ck(tip.eNoon>tip.eDawn && tip.eNoon>tip.eDusk, 'the sun does not rise and set');
  ck(Math.abs(tip.dawn-tip.dusk)>0.05,
     'morning and evening are the same picture: '+tip.dawn+' vs '+tip.dusk);

  /* ---------- 2. THE GLASS THE BALL CAN BREAK IS THE GLASS YOU CAN SEE ---------- */
  const glass = await pg.evaluate(()=>{
    const r=winBackRect();
    // ...the same rectangle, taken the other way round: project it back to the screen
    const up=rmUp(0), y0=rmY(0);
    const sx0=rmX(r.x0,0), sx1=rmX(r.x1,0);
    const sy0=y0-r.hz1*up, sy1=y0-r.hz0*up;
    const o={ back:[+r.x0.toFixed(3),+r.x1.toFixed(3),+r.hz0.toFixed(3),+r.hz1.toFixed(3)],
              err:Math.max(Math.abs(sx0-WIN_X),Math.abs(sx1-(WIN_X+WIN_W)),
                           Math.abs(sy0-WIN_Y),Math.abs(sy1-(WIN_Y+WIN_H))) };
    // three hits take it out, and only a THROWN ball counts
    S.winCracks=0; S.winBroken=false;
    const hit=(x,hz,live)=>{ TRICK.hitWin=false; FETCH.live=live;
                             BALL.x=x; BALL.hz=hz; if(live&&ballHitsWindow()) winTakeHit(); };
    const mid=(r.x0+r.x1)/2, midH=(r.hz0+r.hz1)/2;
    hit(mid,midH,false); o.notThrown=S.winCracks;
    hit(mid,midH,true);  o.one=S.winCracks;
    hit(mid,midH,true);  o.two=S.winCracks;
    hit(mid,midH,true);  o.three=S.winCracks; o.broke=S.winBroken; o.shards=WINFX.shards.length;
    hit(mid,midH,true);  o.afterBroken=S.winCracks;
    // ...and a ball nowhere near it never touches it
    S.winCracks=0; S.winBroken=false; WINFX.shards.length=0;
    hit(0.05,midH,true); hit(mid,0.02,true); o.missed=S.winCracks;
    // one hit per throw, however many times it rattles in the frame
    TRICK.hitWin=false; FETCH.live=true; BALL.x=mid; BALL.hz=midH;
    winTakeHit(); winTakeHit(); winTakeHit(); o.perThrow=S.winCracks;
    S.winCracks=0; S.winBroken=false; WINFX.shards.length=0; TRICK.hitWin=false; FETCH.live=false;
    return o;
  });
  console.log('GLASS ', JSON.stringify(glass));
  ck(glass.err<0.002, 'the pane the ball hits is '+glass.err.toFixed(4)+' off the pane on screen');
  ck(glass.notThrown===0, 'a ball nobody threw cracked the window');
  ck(glass.one===1 && glass.two===2 && glass.three===3, 'three hits do not take three hits: '
     +JSON.stringify(glass));
  ck(glass.broke===true, 'the third hit did not break it');
  ck(glass.shards>=12, 'the break threw only '+glass.shards+' shards');
  ck(glass.afterBroken===3, 'a broken window kept taking damage');
  ck(glass.missed===0, 'a ball wide of the window still broke it');
  ck(glass.perThrow===1, 'one throw rattled the frame for '+glass.perThrow+' hits');

  /* ---------- 3. THE THING THAT COMES THROUGH IT ---------- */
  const bat = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    S.winBroken=true; S.vampire=false; S.dead=false;
    // the roll is 10% a night; drive it directly so the sequence itself can be watched
    let done=false;
    CAM.x=0.45; CAM.z=0.62;
    batStart(()=>{ done=true; });
    const seen=new Set(); let maxFlash=0, inRoom=0;
    for(let i=0;i<420;i++){
      batTick(1/60);
      if(BAT.on){ seen.add(BAT.ph); maxFlash=Math.max(maxFlash,BAT.flash); inRoom++; }
    }
    await sleep(1200);
    return { phases:[...seen], vamp:S.vampire, flash:+maxFlash.toFixed(2),
             gone:!BAT.on, frames:inRoom, chance:BAT_CHANCE, done };
  });
  console.log('BAT   ', JSON.stringify(bat));
  ck(bat.phases.includes('in') && bat.phases.includes('circle') &&
     bat.phases.includes('bite') && bat.phases.includes('out'),
     'the bat skipped part of its visit: '+JSON.stringify(bat.phases));
  ck(bat.vamp===true, 'the bite did not infect him');
  ck(bat.flash>0.5, 'there was no lightning: '+bat.flash);
  ck(bat.gone===true, 'the bat never left');
  ck(bat.done===true, 'the morning never resumed after the bat');
  ck(Math.abs(bat.chance-0.10)<1e-9, 'the nightly chance is '+bat.chance+', not 1 in 10');

  /* ...and it only happens through a hole, only once, and only to a well dog */
  const gate = await pg.evaluate(()=>{
    const o={};
    const roll=(broken,vamp)=>{
      S.winBroken=broken; S.vampire=vamp; S.dead=false;
      let n=0; for(let i=0;i<4000;i++) if(batWanted()) n++;
      return n;
    };
    o.shut=roll(false,false);           // the window is whole: nothing can get in
    o.already=roll(true,true);          // he is already cursed: nothing left to do
    o.open=roll(true,false);            // ...and the case that should fire about a tenth of the time
    S.winBroken=false; S.vampire=false;
    return o;
  });
  console.log('GATE  ', JSON.stringify(gate));
  ck(gate.shut===0, 'the bat got in through an unbroken window '+gate.shut+' times');
  ck(gate.already===0, 'a dog who is already a vampire got bitten again');
  ck(gate.open>250 && gate.open<550, 'the roll is not 1 in 10: '+(gate.open/4000).toFixed(3));

  /* ---------- 4. WHAT IT COSTS HIM ---------- */
  const curse = await pg.evaluate(()=>{
    /* THIS USED TO READ VAMP_PARK_DPS AND EXPECT A FLAT HALF-POINT. That was the whole complaint:
       half a point a second is punishing on a puppy and beneath notice on a maxed-out dog, so the
       curse now bills a SHARE of his current maximum. Inverted rather than deleted - the question
       "does ten seconds of daylight cost the right amount" is still the right question, it just
       has a different right answer now. */
    const o={ pct:VAMP_PARK_PCT, cure:VAMP_CURE_COST };
    // the daylight park burns him; UNLEASHED runs at night and does not
    /* THE BURN, WITH NOTHING PUTTING IT BACK. A cursed dog HEALS off bone pickups now, so ten
       seconds of a live park is burn minus whatever he happened to hoover up on the way - which
       came out at 35 most runs and 26 on one, and would have gone on failing at random forever.
       The drops are cleared each frame so this measures the one thing it is named after; the heal
       has a test of its own in pvamp. */
    startPark(false);
    PK.active=true; PK.hp=PK.maxhp; PK.vampAcc=0; S.vampire=true; PK.plusMode=false;
    const hp0=PK.hp;
    for(let i=0;i<600;i++){ PK.drops.length=0; parkUpdate(1/60); }
    o.dayLoss=hp0-PK.hp; o.safeDay=pkVampSafe(); o.max=PK.maxhp;
    PK.hp=PK.maxhp; PK.vampAcc=0; PK.plusMode=true;
    const hp1=PK.hp;
    for(let i=0;i<600;i++){ PK.drops.length=0; parkUpdate(1/60); }
    o.nightLoss=hp1-PK.hp; o.safeNight=pkVampSafe();
    // ...and a dog who is not cursed pays nothing either way
    PK.hp=PK.maxhp; PK.vampAcc=0; PK.plusMode=false; S.vampire=false;
    const hp2=PK.hp;
    for(let i=0;i<600;i++){ PK.drops.length=0; parkUpdate(1/60); }
    o.cleanLoss=hp2-PK.hp;
    PK.active=false; showScreen("home");
    return o;
  });
  console.log('CURSE ', JSON.stringify(curse));
  ck(Math.abs(curse.pct-0.02)<1e-9, 'the drain is '+curse.pct+' of max a second, not 2%');
  ck(Math.abs(curse.dayLoss-curse.max*0.2)<=2,
     'ten seconds of daylight cost him '+curse.dayLoss+' of a '+curse.max
     +' pool, rather than the ~'+Math.round(curse.max*0.2)+' that 2% a second comes to');
  ck(curse.safeNight===true && curse.safeDay===false,
     'UNLEASHED is not the safe one: '+JSON.stringify(curse));
  ck(curse.nightLoss===0, 'the night run burned him for '+curse.nightLoss);
  ck(curse.cleanLoss===0, 'an uninfected dog is losing '+curse.cleanLoss+' health to nothing');

  /* ...he keeps out of the light, and the cure is on the shelf when there is something to cure */
  const shun = await pg.evaluate(()=>{
    CLK.h=12; CLK.m=0; RMW=414; RMH=371;
    const p=sunPatch();
    if(!p) return {none:true};
    S.vampire=true;
    /* THE BIAS IS NOW STATE-DEPENDENT, so the state has to be stated. Treating the patch as solid
       in every state made it a wall he would rather fail than cross - a ball thrown through the
       beam could not be fetched. It bends his path while he is pleasing himself and lets him
       through when he has a job in hand, and vampSunTick charges him for the crossing. */
    CAM.state="walk";
    const [px,pz]=camSolid(p.x,p.z,null);
    const pushed=Math.hypot(px-p.x,(pz-p.z)*1.5);
    CAM.state="fetch";
    const [rx,rz]=camSolid(p.x,p.z,null);
    const chasing=Math.hypot(rx-p.x,(rz-p.z)*1.5);
    CAM.state="walk";
    S.vampire=false;
    const [qx,qz]=camSolid(p.x,p.z,null);
    const free=Math.hypot(qx-p.x,(qz-p.z)*1.5);
    // and the shop only offers the cure to a dog who needs it
    S.vampire=false; renderMystShop();
    const off=!!document.querySelector('#mystList [data-cure]');
    S.vampire=true; renderMystShop();
    const on=!!document.querySelector('#mystList [data-cure]');
    S.snacks=VAMP_CURE_COST;
    document.querySelector('#mystList [data-cure]').click();
    const cured=!S.vampire, left=S.snacks;
    return { patch:[+p.x.toFixed(2),+p.z.toFixed(2)], pushed:+pushed.toFixed(3),
             chasing:+chasing.toFixed(3),
             free:+free.toFixed(3), off, on, cured, left };
  });
  console.log('SHUN  ', JSON.stringify(shun));
  ck(!shun.none, 'there is no sunlit patch on the floor at midday');
  ck(shun.pushed>0.10, 'the light does not move a WANDERING dog at all: '+shun.pushed);
  ck(shun.chasing===0,
     'the light still blocks a dog with a job in hand — it is a wall again: '+shun.chasing);
  ck(shun.free===0, 'an uninfected dog is being shoved out of the sunshine too');
  ck(shun.off===false, 'the cure is on the shelf for a dog who is not cursed');
  ck(shun.on===true, 'the cure is not on the shelf for a dog who is');
  ck(shun.cured===true, 'buying the cure did not lift it');
  ck(shun.left===0, 'the cure did not cost what it says');

  /* ---------- 5. HIS MOUTH IS HIS MOUTH ---------- */
  /* Measured against the frame that is actually on screen: the muzzle must sit toward the FRONT of
     the sprite and high up his body, mirror exactly when he does, and sit on the centre line for
     the two sheets that have no side-on snout at all. */
  const mouth = await pg.evaluate(()=>{
    const out={};
    const at=(name,setup)=>{
      setup();
      const S_=dogSprite(); if(!S_) return;
      const a=S_.art, per=dogBodyFloor()/a.body, m=dogMouthOff();
      out[name]={ key:S_.key, across:+(m.dx/((a.w/2)*per)).toFixed(2),
                  up:+(m.hz/dogBodyFloor()).toFixed(2) };
    };
    const base=()=>{ CAM.x=0.5; CAM.z=0.6; CAM.lz=0; CAM.freeze=0; PARTY.on=false; };
    at('idleR',()=>{ base(); CAM.state="idle"; CAM.moving=false; CAM.fi=0; CAM.dir=1; });
    at('idleL',()=>{ base(); CAM.state="idle"; CAM.moving=false; CAM.fi=0; CAM.dir=-1; });
    for(const [oct,n] of [[0,'E'],[1,'SE'],[2,'S'],[4,'W'],[6,'N'],[7,'NE']])
      at(n,()=>{ base(); CAM.state="walk"; CAM.moving=true; CAM.oct=oct; CAM.walkPh=6; });
    // ...and it rides the jump rather than sitting where his feet were
    CAM.state="leap"; CAM.moving=false; CAM.dir=1; CAM.lz=0; CAM.leapK=1;
    CAM.fi=0;  const stand=dogMouthOff().hz;
    CAM.fi=11; const apex=dogMouthOff().hz;
    CAM.state="idle"; CAM.fi=0;
    out.leap={ stand:+stand.toFixed(3), apex:+apex.toFixed(3), body:+dogBodyFloor().toFixed(3) };
    return out;
  });
  console.log('MOUTH ', JSON.stringify(mouth));
  for(const k of ['idleR','E','SE','NE']){
    ck(mouth[k] && mouth[k].across>0.60 && mouth[k].across<0.98,
       k+': the mouth sits '+(mouth[k]&&mouth[k].across)+' across the sprite, not at the muzzle');
    ck(mouth[k] && mouth[k].up>0.55 && mouth[k].up<0.95,
       k+': the mouth sits '+(mouth[k]&&mouth[k].up)+' up his body');
  }
  ck(Math.abs(mouth.idleR.across+mouth.idleL.across)<0.01,
     'facing the other way does not mirror the mouth: '+mouth.idleR.across+'/'+mouth.idleL.across);
  ck(Math.abs(mouth.E.across+mouth.W.across)<0.01,
     'the mirrored walk sheet does not mirror its mouth');
  for(const k of ['S','N'])
    ck(Math.abs(mouth[k].across)<0.16,
       k+' faces the camera or away, so its mouth belongs on the centre line, not at '
       +mouth[k].across);
  ck(mouth.leap.apex-mouth.leap.stand > mouth.leap.body*0.4,
     'the mouth barely rises through the leap: '+JSON.stringify(mouth.leap));

  /* ...and the carried ball is put exactly there, for as long as he is carrying it.
     Asked ACROSS A REAL FETCH rather than at one frozen instant: his size is still settling after
     a level, the frame advances inside every tick, and the sheet swaps the moment he starts
     moving - chase any one of those and the probe ends up testing its own grasp of the frame
     counter. What must hold on EVERY frame is that the ball is out at his muzzle, on the side he
     is facing, at head height. */
  const carry = await pg.evaluate(()=>{
    XPANIM.lvl=S.lvl; XPANIM.frac=0; XPANIM.ready=false;   // stop him growing mid-measurement
    CAM.x=0.30; CAM.z=0.45; CAM.lz=0; CAM.freeze=0; CAM.until=99;
    CAM.state="fetch"; CAM.fetchPhase=4;
    BALL.off=false; BALL.held=false; BALL.pcarried=false; BALL.carried=true; BALL.settle=null;
    let frames=0, wrongSide=0, offCentre=0, badHeight=0, minAbs=9, maxAbs=0;
    for(let i=0;i<150 && BALL.carried;i++){
      camBehavior(1/60);
      if(!BALL.carried) break;
      frames++;
      const dx=BALL.x-CAM.x, body=dogBodyFloor();
      const sp=dogSprite(); if(!sp) continue;
      const halfW=(sp.art.w/2)*(body/sp.art.body);
      if(sp.face!==0 && Math.sign(dx)!==Math.sign(sp.flip?-1:1)) wrongSide++;
      if(sp.face!==0 && Math.abs(dx)<halfW*0.45) offCentre++;
      if(BALL.hz<body*0.5 || BALL.hz>body*1.0) badHeight++;
      minAbs=Math.min(minAbs,Math.abs(dx)/halfW); maxAbs=Math.max(maxAbs,Math.abs(dx)/halfW);
    }
    return { frames, wrongSide, offCentre, badHeight,
             minAbs:+minAbs.toFixed(2), maxAbs:+maxAbs.toFixed(2) };
  });
  console.log('CARRY ', JSON.stringify(carry));
  ck(carry.frames>=40, 'he only carried it for '+carry.frames+' frames - nothing was measured');
  ck(carry.wrongSide===0,
     'on '+carry.wrongSide+' frames the ball was on the wrong side of him for the way he faced');
  ck(carry.offCentre===0,
     'on '+carry.offCentre+' frames the ball sat inside his body rather than out at his muzzle');
  ck(carry.badHeight===0,
     'on '+carry.badHeight+' frames the ball was at his feet or over his back');
  ck(carry.maxAbs<1.0, 'the ball hangs off the end of him: '+carry.maxAbs+' of a half-width');

  /* ---------- 6. the park invitation lost its snarl and gained a way out ---------- */
  const evo = await pg.evaluate(()=>{
    openEvoPanel(5,null);
    const o={ pic:EVO_STAGES[5].pic,
              imgShown:getComputedStyle(document.getElementById('evoImgWrap')).display,
              noShown:getComputedStyle(document.getElementById('evoNo')).display };
    document.getElementById('evoNo').click();
    o.closed=!document.getElementById('evoPanel').classList.contains('show');
    o.park=PK.active;
    openEvoPanel(10,null);
    o.imgAt10=getComputedStyle(document.getElementById('evoImgWrap')).display;
    o.noAt10=getComputedStyle(document.getElementById('evoNo')).display;
    document.getElementById('evoPanel').classList.remove('show');
    return o;
  });
  console.log('EVO   ', JSON.stringify(evo));
  ck(evo.pic===null, 'the park invitation still carries a portrait: '+evo.pic);
  ck(evo.imgShown==='none', 'the portrait frame is still taking up the screen');
  ck(evo.noShown!=='none', 'there is no way to decline the park');
  ck(evo.closed===true && evo.park!==true, 'declining the park started a run anyway');
  ck(evo.imgAt10!=='none', 'the growing-up ceremony lost its portrait too');
  ck(evo.noAt10==='none', 'a ceremony you cannot decline is offering a NO THANKS');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npbat PASS');
})();
