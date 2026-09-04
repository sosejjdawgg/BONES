/* THE DECK SLINGSHOT, THE INTERCEPT'S SKILL FLOOR, AND THE LEVEL-UP SHOW.
   The deck half of the slingshot is the one thing in this game that spans both canvases and the
   DOM in between, so nearly everything worth asserting about it is a coordinate question: does
   the lock actually freeze the origin, does the origin stay put while the finger keeps moving,
   does a full pull still reach the back wall from down there, and does pulling back-left really
   fire away-right. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1600);
  // every trick taught: this suite is about the slingshot and the intercept, not the tree
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.ballOwned=true; S.bedTier=2;
                          S.tricks={fetch:1,sit:1,jump:1,roll:1}; });
  await pg.waitForTimeout(800);

  /* ---------- 0. the overlay exists, and stays out of the way ---------- */
  const glass = await pg.evaluate(()=>{
    const cv=document.querySelector('#slingcv');
    const st=cv?getComputedStyle(cv):null;
    return { there:!!cv, display:st&&st.display, pe:st&&st.pointerEvents,
             parent:cv&&cv.parentElement.id, z:st&&st.zIndex };
  });
  console.log('GLASS ', JSON.stringify(glass));
  ck(glass.there, 'there is no #slingcv to draw the deck half on');
  ck(glass.display==='none', 'the overlay is showing with nothing being aimed: '+glass.display);
  ck(glass.pe==='none', 'the overlay takes pointer events, so it is covering the buttons');
  ck(glass.parent==='game', 'the overlay is not inside #game, so it cannot span both halves');

  /* ---------- 1. the lock ---------- */
  const lock = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const cv=document.querySelector('#dogcv'), r=cv.getBoundingClientRect();
    // fy is measured against the DOGCAM, so fy>1 is a finger down on the black deck
    const send=(t,fx,fy)=>cv.dispatchEvent(new PointerEvent(t,{
      clientX:r.left+fx*r.width, clientY:r.top+fy*r.height,
      pointerId:9, bubbles:true, pointerType:'touch'}));
    CAM.state="rest"; CAM.until=99;
    BALL.carried=false; BALL.off=false; BALL.pcarried=false; BALL.cool=0;
    BALL.x=0.50; BALL.z=0.60; BALL.hz=0; BALL.vx=0; BALL.vz=0; BALL.vh=0;
    const p=ballScreen();
    send('pointerdown',p.x,p.y);
    const before={deck:SLING.deck, held:BALL.held};
    send('pointermove',0.50,0.90);                 // still in the room
    await sleep(40);
    const inRoom={deck:SLING.deck, z:+BALL.z.toFixed(4)};
    send('pointermove',0.50,1.20);                 // ...and now over the deck
    await sleep(40);
    const atLock={deck:SLING.deck, lockX:+SLING.lockX.toFixed(4), lockZ:+SLING.lockZ.toFixed(4),
                  pull:+SLING.pull.toFixed(3), shown:document.querySelector('#slingcv').style.display};
    // keep dragging: the ORIGIN must not follow the finger any further
    send('pointermove',0.20,2.40);
    await sleep(40);
    const deeper={lockX:+SLING.lockX.toFixed(4), lockZ:+SLING.lockZ.toFixed(4),
                  pull:+SLING.pull.toFixed(3), ballX:+BALL.x.toFixed(4), ballZ:+BALL.z.toFixed(4)};
    send('pointerup',0.20,2.40);
    const fired={vx:+BALL.vx.toFixed(3), vz:+BALL.vz.toFixed(3), vh:+BALL.vh.toFixed(3),
                 x:+BALL.x.toFixed(4), z:+BALL.z.toFixed(4), deck:SLING.deck, live:FETCH.live,
                 fx:!!SLING.fx};
    return {before, inRoom, atLock, deeper, fired};
  });
  console.log('LOCK  ', JSON.stringify(lock));
  ck(lock.before.held===true, 'the ball was not picked up');
  ck(lock.inRoom.deck===false, 'a drag inside the room already locked to the deck');
  ck(lock.atLock.deck===true, 'crossing the lock line did not lock');
  ck(lock.atLock.shown==='block', 'the overlay did not come up for the aim');
  ck(lock.deeper.lockX===lock.atLock.lockX && lock.deeper.lockZ===lock.atLock.lockZ,
     'the origin followed the finger after the lock: '+JSON.stringify(lock.atLock)+' -> '+JSON.stringify(lock.deeper));
  ck(lock.deeper.ballX===lock.atLock.lockX && lock.deeper.ballZ===lock.atLock.lockZ,
     'the ball drifted off its locked origin while aiming');
  ck(lock.deeper.pull>lock.atLock.pull, 'pulling further down the deck added no power: '
     +lock.atLock.pull+' -> '+lock.deeper.pull);
  ck(lock.fired.x===lock.atLock.lockX && lock.fired.z===lock.atLock.lockZ,
     'the shot did not leave from the locked origin');
  ck(lock.fired.deck===false, 'the deck aim survived the release');
  ck(lock.fired.live===true, 'a deck shot did not start a scoring throw');
  ck(lock.fired.fx===true, 'the band did not pop on release');

  /* ---------- 2. power is the depth, and the aim is the band ---------- */
  const shots = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const cv=document.querySelector('#dogcv'), r=cv.getBoundingClientRect();
    const send=(t,fx,fy)=>cv.dispatchEvent(new PointerEvent(t,{
      clientX:r.left+fx*r.width, clientY:r.top+fy*r.height,
      pointerId:9, bubbles:true, pointerType:'touch'}));
    const shot=async (fx,fy,steps,gap)=>{
      CAM.state="rest"; CAM.until=99;
      BALL.carried=false; BALL.off=false; BALL.pcarried=false; BALL.cool=0;
      BALL.x=0.50; BALL.z=0.72; BALL.hz=0; BALL.vx=0; BALL.vz=0; BALL.vh=0;
      const p=ballScreen();
      send('pointerdown',p.x,p.y);
      for(let i=1;i<=steps;i++){
        const k=i/steps;
        send('pointermove', p.x+(fx-p.x)*k, p.y+(fy-p.y)*k);
        await sleep(gap);
      }
      const pull=+SLING.pull.toFixed(3);
      send('pointerup',fx,fy);
      return {pull, vx:+BALL.vx.toFixed(3), vz:+BALL.vz.toFixed(3), vh:+BALL.vh.toFixed(3)};
    };
    // straight down: the deeper into the deck, the harder it goes
    const shallow=await shot(0.50,1.12,6,10);
    const mid    =await shot(0.50,1.75,6,10);
    const deep   =await shot(0.50,2.55,6,10);
    // ...and the same deep pull, four times slower. Depth is the power, not the thumb.
    const slow   =await shot(0.50,2.55,6,45);
    // pull back-LEFT: fires away-RIGHT
    const left   =await shot(0.18,2.20,6,10);
    // pull back-RIGHT: fires away-LEFT
    const right  =await shot(0.86,2.20,6,10);
    return {shallow, mid, deep, slow, left, right};
  });
  console.log('SHOTS ', JSON.stringify(shots));
  ck(shots.shallow.pull<shots.mid.pull && shots.mid.pull<shots.deep.pull,
     'power is not continuous with depth: '+JSON.stringify(shots));
  ck(Math.abs(shots.shallow.vz)<Math.abs(shots.mid.vz) && Math.abs(shots.mid.vz)<Math.abs(shots.deep.vz),
     'a deeper pull is not a harder shot');
  ck(shots.deep.vz<0 && shots.mid.vz<0, 'pulling down the deck does not fire toward the back wall');
  ck(Math.abs(shots.deep.vz-shots.slow.vz)<0.02,
     'the same pull at a different speed threw differently: '+shots.deep.vz+' vs '+shots.slow.vz);
  ck(shots.left.vx>0 && shots.left.vz<0,
     'pulling back-LEFT does not fire away-right: '+JSON.stringify(shots.left));
  ck(shots.right.vx<0 && shots.right.vz<0,
     'pulling back-RIGHT does not fire away-left: '+JSON.stringify(shots.right));

  /* ---------- 3. a full pull reaches the back wall from down there ---------- */
  const reach = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const cv=document.querySelector('#dogcv'), r=cv.getBoundingClientRect();
    const send=(t,fx,fy)=>cv.dispatchEvent(new PointerEvent(t,{
      clientX:r.left+fx*r.width, clientY:r.top+fy*r.height,
      pointerId:9, bubbles:true, pointerType:'touch'}));
    CAM.state="rest"; CAM.until=99; CAM.x=0.05; CAM.z=0.95;   // him well out of the way
    BALL.carried=false; BALL.off=false; BALL.pcarried=false; BALL.cool=0;
    BALL.x=0.50; BALL.z=0.80; BALL.hz=0; BALL.vx=0; BALL.vz=0; BALL.vh=0;
    const p=ballScreen();
    send('pointerdown',p.x,p.y);
    for(let i=1;i<=6;i++) { send('pointermove',0.50,p.y+(2.60-p.y)*i/6); await sleep(10); }
    const pull=+SLING.pull.toFixed(3);
    send('pointerup',0.50,2.60);
    // fly it by hand, with the same integrator the game uses
    let minZ=9, maxH=0;
    for(let i=0;i<220;i++){
      BALL.vh-=BALL_G/60; BALL.hz=Math.max(0,BALL.hz+BALL.vh/60);
      BALL.x+=BALL.vx/60; BALL.z+=BALL.vz/60; ballWalls(1/60);
      BALL.vx*=(1-0.55/60); BALL.vz*=(1-0.55/60);
      minZ=Math.min(minZ,BALL.z); maxH=Math.max(maxH,BALL.hz);
      if(BALL.hz<=0 && Math.abs(BALL.vz)<0.02) break;
    }
    return {pull, minZ:+minZ.toFixed(3), maxH:+maxH.toFixed(3), markZ:SPOT.mark.z};
  });
  console.log('REACH ', JSON.stringify(reach));
  ck(reach.pull>0.95, 'the bottom of the deck is not a full draw: '+reach.pull);
  ck(reach.minZ<=reach.markZ+0.03,
     'a full deck pull cannot reach the mark: got to z='+reach.minZ+', mark at '+reach.markZ);

  /* ---------- 4. the intercept has a skill floor now ---------- */
  const skill = await pg.evaluate(()=>{
    const at=(stam,str)=>{
      S.stam=stam; S.str=str;
      return { run:+leapRun().toFixed(4), grab:+leapCatchR().toFixed(4),
               crouch:+leapCrouch().toFixed(4), track:+leapTrack().toFixed(3) };
    };
    const start=at(ATTR_START,ATTR_START);
    const half =at(50,50);
    const full =at(ATTR_FULL,ATTR_FULL);
    S.stam=ATTR_START; S.str=ATTR_START;
    return {start, half, full, base:ATTR_START};
  });
  console.log('SKILL ', JSON.stringify(skill));
  ck(skill.start.run<skill.full.run*0.72,
     'an untrained dog runs the lane nearly as fast: '+skill.start.run+' vs '+skill.full.run);
  ck(skill.start.grab<skill.full.grab*0.62,
     'an untrained dog has nearly the same reach: '+skill.start.grab+' vs '+skill.full.grab);
  ck(skill.start.crouch>skill.full.crouch*1.5,
     'an untrained dog is off the mark just as fast: '+skill.start.crouch+' vs '+skill.full.crouch);
  ck(skill.start.track<skill.full.track*0.55,
     'an untrained dog still homes in mid-air: '+skill.start.track+' vs '+skill.full.track);
  ck(skill.half.run>skill.start.run && skill.half.run<skill.full.run, 'the scale is not monotonic');
  // the values at full are exactly what every dog used to get for free
  ck(Math.abs(skill.full.track-0.45)<0.005, 'a maxed dog no longer tracks like the old one: '+skill.full.track);

  /* ...and it shows up as actual misses.
     THE PROBE HAD TO BE REWRITTEN ONCE. The first version lobbed a ball that fell back inside his
     standing reach, so he simply walked up and took it off the floor - `tried:0` catches:24 for
     both dogs, which says nothing about the intercept because the intercept never happened. The
     ball here stays ABOVE his standing reach for the whole crossing, and a frame where it drops
     below that is scored a miss even if he picks it up afterwards. */
  const miss = await pg.evaluate(()=>{
    const trial=(stam,str,seedX)=>{
      S.stam=stam; S.str=str;
      let caught=0, tried=0;
      for(let n=0;n<60;n++){
        CAM.state="idle"; CAM.until=99; CAM.x=0.50; CAM.z=0.62; CAM.lz=0; CAM.leap=null;
        CAM.leapCd=0; CAM.freeze=0; CAM.bedTarget=false; PARTY.on=false;
        /* NOTHING ELSE IN THE ROOM. 60 trials x 140 frames is 140 seconds of simulated cam, which
           is long enough for the FLY to turn up and pull him into `catch` mid-lane - and it does
           so on its own random clock, so the same maxed dog scored 59/60 one run and 44/60 the
           next. That is the harness measuring the fly. */
        FLY.active=false; FLY.next=1e9; TREATS.length=0; POOS.length=0; heartNext=1e9;
        BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
        // a fast ball crossing his lane, high enough that only a jump reaches it
        BALL.x=0.08+seedX; BALL.z=0.60+(n%4)*0.03; BALL.hz=0.30;
        BALL.vx=1.05+(n%5)*0.06; BALL.vz=-0.04; BALL.vh=0.35;
        let sawLeap=false, got=false;
        for(let f=0;f<140;f++){
          camBehavior(1/60);
          if(CAM.state==="leap") sawLeap=true;
          if(BALL.carried){ got=true; break; }
          // once it is back inside what he can take standing, the intercept is over
          if(BALL.hz < dogBodyFloor()*0.85) break;
        }
        if(sawLeap) tried++;
        if(got) caught++;
      }
      return {caught, tried};
    };
    const weak=trial(ATTR_START,ATTR_START,0);
    const mid=trial(50,50,0);
    const strong=trial(ATTR_FULL,ATTR_FULL,0);
    S.stam=ATTR_START; S.str=ATTR_START;
    return {weak, mid, strong};
  });
  console.log('MISS  ', JSON.stringify(miss));
  ck(miss.strong.tried>0 && miss.weak.tried>0,
     'neither dog even attempted the intercept, so the probe is not testing it: '+JSON.stringify(miss));
  ck(miss.strong.caught>miss.weak.caught,
     'a trained dog is no better at the same ball: '+JSON.stringify(miss));
  ck(miss.weak.caught<60, 'an untrained dog caught every single one - still a magnet: '+miss.weak.caught);
  ck(miss.strong.caught>=miss.strong.tried*0.9,
     'a maxed dog should still take nearly all of these: '+JSON.stringify(miss.strong));
  ck(miss.weak.caught<=miss.mid.caught && miss.mid.caught<=miss.strong.caught,
     'the intercept does not climb with training: '+JSON.stringify(miss));
  ck(miss.weak.caught<miss.weak.tried*0.8,
     'an untrained dog takes '+miss.weak.caught+'/'+miss.weak.tried+' - still too safe a bet');

  /* ---------- 5. the level-up show ---------- */
  const party = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    /* THE DANCE MOVED TO THE TAP. A level is BANKED when the XP lands and CONFERRED when you tap
       the bar, which can be minutes apart; addXP no longer celebrates a level nobody has claimed.
       So the probe has to do what a player does - fill the bar, then tap it. */
    S.lvl=8; S.xp=0; XPANIM.lvl=8; PARTY.on=false;
    CAM.state="walk"; CAM.until=99;
    addXP(xpNeed(8)+2);
    XPANIM.ready=true;                       // the bar, full and waiting
    xpLevelTap();
    const at0={on:PARTY.on, lvl:PARTY.lvl, state:CAM.state, conf:PARTY.conf.length, sLvl:S.lvl,
               x:+CAM.x.toFixed(3)};
    await sleep(500);
    const mid={on:PARTY.on, lz:CAM.lz>0, t:+PARTY.t.toFixed(2),
               fell:PARTY.conf.some(c=>c.y>at0.top)};
    // he must be on the DANCE strip - up on his hind legs - and never on the bound
    const art={fkey:CAMFRAME.party, has:!!(DOGIMG.dance&&DOGIMG.dance.length),
               n:DOGCAMART.dance&&DOGCAMART.dance.n,
               body:DOGCAMART.dance&&DOGCAMART.dance.body,
               h:DOGCAMART.dance&&DOGCAMART.dance.h,
               fi:CAM.fi};
    await sleep(5400);                       // ...and it runs long enough to choose a trick under
    const done={on:PARTY.on, state:CAM.state, lz:CAM.lz};
    return {at0, mid, art, done, dur:PARTY_LONG, side:PARTY_SIDE};
  });
  console.log('PARTY ', JSON.stringify(party));
  ck(party.at0.on===true, 'levelling up started no show');
  ck(party.at0.state==='party', 'he carried on with his errand through his own level-up');
  ck(party.at0.lvl===party.at0.sLvl, 'the show names the wrong level');
  ck(party.at0.conf>40, 'only '+party.at0.conf+' pieces of confetti');
  ck(party.art.fkey==='dance', 'the celebration does not use the dance strip: '+party.art.fkey);
  ck(party.art.has && party.art.n>=12, 'the dance strip is missing or too short: '+party.art.n);
  ck(party.art.body===80, 'the dance strip is stored at body '+party.art.body+', not the shared 80');
  /* UP ON HIS HIND LEGS, AND STORED THAT WAY. If this sheet had been normalised to its own height
     the way the grounded sets are, a rearing dog would draw exactly as tall as a standing one. */
  ck(party.art.h > party.art.body*1.5,
     'the dance strip is no taller than a standing dog ('+party.art.h+' vs body '+party.art.body
     +') - he was normalised flat');
  ck(party.art.fi>0, 'the dance strip never advanced a frame');
  ck(party.mid.on===true && party.mid.t>0.3, 'the show ended before it started');
  ck(party.dur>=4.5, 'the level-up dance is only '+party.dur+'s - too short to choose under');
  ck(party.at0.x<0.35,
     'he dances in the middle, where the skill panel covers him: x='+party.at0.x);
  ck(party.mid.lz===true, 'he never left the floor - there is no bounce');
  ck(party.done.on===false, 'the show never ended');
  /* He settles back to IDLE and then gets on with his life - by the time this reads, five seconds
     later, he may well have decided to go and beg at an empty bowl. What must be true is that he
     is off the dance and back on the floor, not that he is standing exactly where it left him. */
  ck(party.done.state!=='party' && party.done.lz===0,
     'he did not settle back off the dance: '+JSON.stringify(party.done));

  /* ---------- 6. a short phone can still reach NEW GAME ---------- */
  /* A flex column does not overflow, it SQUASHES - so on a short screen the bottom of the menu was
     simply gone, with nothing to scroll. Checked on a 640-tall viewport, which is where it bit. */
  const short = await b.newPage({viewport:{width:414, height:640}, deviceScaleFactor:2});
  await short.goto(F); await short.waitForTimeout(1600);
  await short.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await short.waitForTimeout(250);
  await short.click('#breedBones').catch(()=>{}); await short.waitForTimeout(150);
  await short.click('#adopt').catch(()=>{}); await short.waitForTimeout(1500);
  await short.click('#bMenu'); await short.waitForTimeout(450);
  const scroll = await short.evaluate(()=>{
    const read=(panelId,btnId)=>{
      const sc=document.querySelector('#'+panelId+' .pscroll');
      if(!sc) return {sc:false};
      const b=document.getElementById(btnId);
      sc.scrollTop=sc.scrollHeight;
      const br=b.getBoundingClientRect(), pr=sc.getBoundingClientRect();
      // ...measured against the PANEL's own top, not the window's: the panel starts 42% down the
      // screen, so a window-relative "is it near the top" test fails on a button that never moved
      const P=document.getElementById(panelId).getBoundingClientRect();
      const cl=document.querySelector('#'+panelId+' .pclose').getBoundingClientRect();
      return { sc:true, over:sc.scrollHeight>sc.clientHeight+2,
               inView:br.top>=pr.top-1 && br.bottom<=pr.bottom+1,
               onScreen:br.bottom<=innerHeight+1 && br.top>=0,
               closeOff:Math.round(cl.top-P.top) };
    };
    const menu=read('menuPanel','mNewGame');
    document.getElementById('mSettings').click();
    return {menu};
  });
  await short.waitForTimeout(450);
  const scroll2 = await short.evaluate(()=>{
    const sc=document.querySelector('#settingsPanel .pscroll');
    if(!sc) return {sc:false};
    sc.scrollTop=sc.scrollHeight;
    /* THE LAST VISIBLE THING, not the last child. #mReplayTutorial is display:none unless the
       delivery tutorial is replayable, so it reports a 0x0 rect at the origin and reads as
       "unreachable" however well the panel scrolls. */
    const b=document.getElementById('setVignette');
    const br=b.getBoundingClientRect(), pr=sc.getBoundingClientRect();
    // nested scrollers are a trap: the inner one eats the drag and the outer never moves
    const inner=[...sc.querySelectorAll('*')].filter(e=>{
      const st=getComputedStyle(e);
      return (st.overflowY==='auto'||st.overflowY==='scroll') && e.scrollHeight>e.clientHeight+2;
    }).length;
    return { sc:true, over:sc.scrollHeight>sc.clientHeight+2, inner,
             inView:br.top>=pr.top-1 && br.bottom<=pr.bottom+1,
             onScreen:br.bottom<=innerHeight+1 };
  });
  console.log('SCROLL', JSON.stringify({menu:scroll.menu, settings:scroll2}));
  ck(scroll.menu.sc, 'the menu has no scrolling body');
  ck(scroll.menu.over, 'the menu does not actually overflow on a 640-tall phone - probe is stale');
  ck(scroll.menu.inView && scroll.menu.onScreen,
     'NEW GAME is still unreachable after scrolling to the bottom: '+JSON.stringify(scroll.menu));
  ck(scroll.menu.closeOff>=0 && scroll.menu.closeOff<40,
     'CLOSE scrolled away with the content: '+scroll.menu.closeOff+'px below the panel top');
  ck(scroll2.sc && scroll2.inView && scroll2.onScreen,
     'the bottom of SETTINGS is unreachable: '+JSON.stringify(scroll2));
  ck(scroll2.inner===0, scroll2.inner+' nested scrollers inside SETTINGS - the inner one eats the drag');
  await short.close();

  /* ---------- 7. one slingshot UI, not two ---------- */
  /* The room used to draw its own forks and aim ray the instant you touched the ball, and with the
     deck line doing the same job a foot lower it was two slingshots arguing over one gesture. A
     drag that stays inside the room must now put NOTHING on #dogcv but the ball and the prompt. */
  const ui = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const count=()=>{ let n=0; const os=ctx.stroke.bind(ctx), od=ctx.setLineDash.bind(ctx);
      ctx.setLineDash=function(a){ if(a&&a.length) n++; return od(a); };
      CAM.state="rest"; CAM.until=99;
      drawCam(1.0);
      ctx.setLineDash=od; ctx.stroke=os; return n; };
    S.slingShots=99;                                  // prompt retired, so it cannot be the source
    BALL.carried=false; BALL.off=false; BALL.pcarried=false;
    BALL.x=0.50; BALL.z=0.60; BALL.hz=0; BALL.held=false; SLING.on=false; SLING.deck=false;
    const idle=count();
    // ...now hold it, mid-room, exactly where the old band would have drawn
    BALL.held=true; SLING.on=true; SLING.ax=0.5; SLING.ay=0.5; SLING.x=0.5; SLING.y=0.8;
    SLING.draw=SLING_MAX; SLING.deck=false;
    const held=count();
    BALL.held=false; SLING.on=false;
    return {idle, held, glass:document.querySelector('#slingcv').style.display};
  });
  console.log('UI    ', JSON.stringify(ui));
  ck(ui.held===ui.idle,
     'the room still draws an aim ray for an in-room drag: '+ui.idle+' -> '+ui.held+' dashed strokes');
  ck(ui.glass!=='block', 'the deck overlay is up for a drag that never left the room');

  /* ---------- 8. the prompt teaches, then gets out of the way ---------- */
  const teach = await pg.evaluate(()=>{
    const at=(n)=>{ S.slingShots=n; return slingTeaching(); };
    BALL.carried=false; BALL.off=false; BALL.pcarried=false; SLING.deck=false;
    const o={ fresh:at(0), four:at(SLING_TEACH-1), five:at(SLING_TEACH), many:at(20),
              need:SLING_TEACH };
    // ...and it counts DECK shots, which is the gesture being taught
    S.slingShots=0;
    BALL.x=0.5; BALL.z=0.7; BALL.hz=0;
    SLING.deck=true; SLING.pull=0.8; SLING.lockX=0.5; SLING.lockZ=0.7;
    SLING.lockSX=200; SLING.lockSY=372; SLING.dx=200; SLING.dy=600;
    ballRelease();
    o.afterDeck=S.slingShots;
    // an in-room release is not the lesson, and must not count towards it
    SLING.deck=false; SLING.on=true; SLING.ax=0.5; SLING.ay=0.4;
    SLING.x=0.5; SLING.y=0.75; SLING.draw=SLING_MAX;
    ballRelease();
    o.afterRoom=S.slingShots;
    S.slingShots=99;
    return o;
  });
  console.log('TEACH ', JSON.stringify(teach));
  ck(teach.fresh===true && teach.four===true, 'the prompt is not up for a player who has never thrown');
  ck(teach.five===false && teach.many===false,
     'the prompt never retires: still on after '+teach.need+' shots');
  ck(teach.afterDeck===1, 'a deck shot did not count towards the lesson: '+teach.afterDeck);
  ck(teach.afterRoom===1,
     'an in-room release counted towards the deck lesson: '+teach.afterRoom);

  /* ---------- 9. it has to ARC, not rifle ---------- */
  /* The old numbers crossed the whole room in half a second and hit the back wall before the ball
     had come down at all: flat, fast and over. What makes a throw watchable is hang time and a
     shadow that visibly shrinks away underneath it, so both are pinned. */
  const arc = await pg.evaluate(()=>{
    const fly=(pw)=>{
      CAM.state="rest"; CAM.until=99; CAM.x=0.04; CAM.z=0.99;   // him out of the way
      BALL.carried=false; BALL.off=false; BALL.held=false; BALL.pcarried=false;
      BALL.x=0.50; BALL.z=0.86; BALL.hz=0.02;
      BALL.vx=0; BALL.vz=-pw*SLING_DECK_K; BALL.vh=pw*SLING_DECK_UP;
      let maxH=0, t=0;
      for(let i=0;i<400;i++){
        BALL.vh-=BALL_G/60; BALL.hz=Math.max(0,BALL.hz+BALL.vh/60);
        BALL.x+=BALL.vx/60; BALL.z+=BALL.vz/60; ballWalls(1/60);
        BALL.vx*=(1-0.55/60); BALL.vz*=(1-0.55/60);
        maxH=Math.max(maxH,BALL.hz); t=i/60;
        if(BALL.hz<=0 && i>4) break;
      }
      return {flight:+t.toFixed(2), apex:+maxH.toFixed(3),
              bodies:+(maxH/dogBodyFloor()).toFixed(2), landZ:+BALL.z.toFixed(3)};
    };
    const o={ full:fly(1), three:fly(0.75), half:fly(0.5), mark:SPOT.mark.z };
    // the shadow is the height gauge: it must keep shrinking all the way up, with no ceiling
    const sh=(hz)=>({ r:+(0.017/(1+hz*3.2)).toFixed(5), a:+(0.36/(1+hz*4.0)).toFixed(4) });
    o.shadow={ floor:sh(0), mid:sh(o.full.apex/2), apex:sh(o.full.apex) };
    return o;
  });
  console.log('ARC   ', JSON.stringify(arc));
  ck(arc.full.flight>0.9, 'a full pull is over in '+arc.full.flight+'s - that is a rifle shot');
  ck(arc.full.bodies>1.2,
     'a full pull peaks at only '+arc.full.bodies+' dog-heights - there is no arc to watch');
  ck(arc.full.apex>arc.three.apex && arc.three.apex>arc.half.apex,
     'the arc does not grow with the pull: '+JSON.stringify(arc));
  ck(arc.full.landZ<=arc.mark+0.06,
     'a full pull no longer carries to the mark: lands at '+arc.full.landZ);
  ck(arc.half.landZ>arc.mark+0.2, 'a half pull already reaches the mark, so aim does not matter');
  ck(arc.shadow.apex.r < arc.shadow.mid.r && arc.shadow.mid.r < arc.shadow.floor.r,
     'the shadow does not shrink smoothly with height: '+JSON.stringify(arc.shadow));
  ck(arc.shadow.apex.r < arc.shadow.floor.r*0.5,
     'the shadow barely moves over the whole arc: '+JSON.stringify(arc.shadow));

  /* ---------- 10. two hundred throws and it goes ---------- */
  const pop = await pg.evaluate(async ()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    CAM.state="rest"; CAM.until=99;
    BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false;
    BALL.x=0.5; BALL.z=0.5; BALL.hz=0;
    BURST.on=false; FETCH.hot=false;
    S.ballThrows=BALL_LIFE-1;
    FETCH.live=true; FETCH.banks=0; FETCH.foul=false;
    fetchLand();                                  // one short of it: nothing happens
    const before={burst:BURST.on, off:BALL.off, n:S.ballThrows};
    S.ballThrows=BALL_LIFE;
    BALL.off=false; FETCH.live=true;
    fetchLand();                                  // ...and this is the two-hundredth
    const at={burst:BURST.on, off:BALL.off, bits:BURST.bits.length, n:S.ballThrows,
              hot:FETCH.hot, streak:FETCH.streak};
    await sleep(1900);                            // the new one is on a timer
    const after={off:BALL.off, hz:+BALL.hz.toFixed(3), burst:BURST.on, n:S.ballThrows};
    return {before, at, after, life:BALL_LIFE};
  });
  console.log('POP   ', JSON.stringify(pop));
  ck(pop.before.burst===false && pop.before.off===false,
     'the ball burst a throw early: '+JSON.stringify(pop.before));
  ck(pop.at.burst===true, 'the ball survived its '+pop.life+'th throw');
  ck(pop.at.off===true, 'a burst ball is still in the room');
  ck(pop.at.bits>=12, 'the burst threw only '+pop.at.bits+' pieces');
  ck(pop.at.n===0, 'the throw count did not reset with the new ball: '+pop.at.n);
  ck(pop.at.hot===false && pop.at.streak===0, 'the burst left the board open');
  ck(pop.after.off===false, 'no new ball turned up after the burst');
  ck(pop.after.burst===false, 'the burst never finished');
  // ...and the ball is free, so a fresh save has one
  const free = await pg.evaluate(()=>({owned:S.ballOwned, throws:S.ballThrows}));
  console.log('FREE  ', JSON.stringify(free));
  ck(free.owned===true, 'the ball is not free');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npdeck PASS');
})();
