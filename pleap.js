const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1600);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1500);
  /* MAXED ON PURPOSE. This suite tests the leap MACHINERY - can he plan one, does he actually
     leave the floor, does the mouth meet the ball, does the hitstop fire - and the leap is no
     longer attribute-free: stamina and strength now buy the lane speed, the reach, the wind-up
     and the mid-air correction, and an untrained dog genuinely does not get up to a soft lob
     (he walks over and takes it off the carpet instead, which is correct and is what this suite
     read as "he caught it with his feet on the floor"). Whose leap is being tested has to be
     stated. The skill SCALE itself is pdeck.js's job. */
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.ballOwned=true;
                          S.stam=ATTR_FULL; S.str=ATTR_FULL;
                          // ...and JUMP CATCH is a trick he has to be taught now
                          S.tricks={fetch:1,sit:1,jump:1,roll:1}; });
  await pg.waitForTimeout(800);

  /* ---------- 1. the art arrived, and it is NOT two-tone any more ---------- */
  const art = await pg.evaluate(()=>{
    const tone=(im)=>{
      const w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const x=c.getContext('2d'); x.drawImage(im,0,0);
      const p=x.getImageData(0,0,w,h).data, seen=new Set(); let ink=0, op=0;
      for(let i=0;i<p.length;i+=4){ if(p[i+3]<20) continue; op++;
        seen.add((p[i]>>3)+','+(p[i+1]>>3)+','+(p[i+2]>>3));
        if(p[i]===14&&p[i+1]===14&&p[i+2]===18) ink++; }
      return {tones:seen.size, inkPct:+(100*ink/op).toFixed(1), op};
    };
    return {
      idle:{n:DOGIMG.idle.length, art:!!DOGIMG.idle.__art, tone:tone(DOGIMG.idle[0])},
      jump:{n:DOGIMG.jump.length, art:!!DOGIMG.jump.__art, tone:tone(DOGIMG.jump[10])},
      walk:{n:DOGIMG.walk.length, tone:tone(DOGIMG.walk[0])},
      sniff:{n:DOGIMG.sniff.length, tone:tone(DOGIMG.sniff[0])},
      robot:{tone:tone(ROBOTIMG[0])},
      geom:{foot:DOGCAMART.jump.foot, body:DOGCAMART.jump.body, h:DOGCAMART.jump.h,
            liftPeak:Math.max(...DOGCAMART.jump.lift),
            topMin:Math.min(...DOGCAMART.jump.top), topStand:DOGCAMART.jump.top[0],
            idleBody:DOGCAMART.idle.body}
    };
  });
  console.log('ART    ', JSON.stringify(art));
  ck(art.idle.n===25 && art.jump.n===25, 'the new strips did not slice: '+art.idle.n+'/'+art.jump.n);
  ck(art.idle.art && art.jump.art, 'the new sets carry no geometry');
  // the LCD is off him: two-tone means ~2 buckets, real art means many
  for(const k of ['idle','jump','walk','sniff'])
    ck(art[k].tone.tones>8, k+' is still quantized to '+art[k].tone.tones+' tones');
  for(const k of ['idle','jump','walk','sniff'])
    ck(art[k].tone.inkPct<50, k+' is still '+art[k].tone.inkPct+'% flat ink');
  // ...and the bot, which was not asked for, still is
  ck(art.robot.tone.tones<=6, 'the bot came off the LCD too: '+art.robot.tone.tones+' tones');
  // one body scale across both sets, or he changes size when he leaves the floor
  ck(art.geom.body===art.geom.idleBody, 'the two sheets disagree on his size: '
     +art.geom.body+' vs '+art.geom.idleBody);
  ck(art.geom.liftPeak>20, 'the jump strip does not leave the ground: '+art.geom.liftPeak);
  ck(art.geom.topStand-art.geom.topMin > art.geom.liftPeak,
     'his head does not out-travel his feet, so he is not stretching: '
     +(art.geom.topStand-art.geom.topMin)+' vs '+art.geom.liftPeak);

  /* ---------- 2. the predictor agrees with the world ----------
     A plan made against different physics plans a catch that misses. Run ballPath forward and
     then let the GAME integrate the same ball, and compare. */
  const pred = await pg.evaluate(()=>{
    BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=9;
    BALL.x=0.30; BALL.z=0.70; BALL.hz=0.30; BALL.vx=0.20; BALL.vz=-0.40; BALL.vh=0.60;
    const path=ballPath(40,1/60);
    const s0={x:BALL.x,z:BALL.z,hz:BALL.hz,vx:BALL.vx,vz:BALL.vz,vh:BALL.vh};
    CAM.state="rest";                        // keep him out of it while the ball flies
    for(let i=0;i<40;i++) camBehavior(1/60);
    const real={x:BALL.x,z:BALL.z,hz:BALL.hz};
    Object.assign(BALL,s0);
    return {predicted:path[39], real, dx:Math.abs(path[39].x-real.x),
            dy:Math.max(Math.abs(path[39].z-real.z), Math.abs(path[39].hz-real.hz))};
  });
  console.log('PRED   ', JSON.stringify(pred));
  ck(pred.dx<0.004 && pred.dy<0.004,
     'the predictor and the world disagree by '+pred.dx.toFixed(4)+'/'+pred.dy.toFixed(4));

  /* ---------- 3. the mouth is where the art says it is ----------
     dogMouthPt must track the sprite through the arc, not sit at a fixed height. */
  const mouth = await pg.evaluate(()=>{
    /* Measured as HEIGHT ABOVE THE FLOOR now, not as a y on the glass, so the arc reads the
       natural way round: bigger is higher. The room made the old sign convention a trap. */
    CAM.state="leap"; CAM.dir=1; CAM.lz=0; CAM.leapK=1;
    const ys=[];
    for(const fi of [0,4,7,10,11,14,18,24]){ CAM.fi=fi; ys.push(+dogMouthHz().toFixed(4)); }
    CAM.fi=11; const apex=dogMouthHz();
    CAM.fi=0;  const stand=dogMouthHz();
    CAM.state="idle"; CAM.fi=0; CAM.lz=0;
    const idleY=dogMouthHz();
    return {ys, apex:+apex.toFixed(4), stand:+stand.toFixed(4), idle:+idleY.toFixed(4),
            rise:+(apex-stand).toFixed(4), bodyF:+dogBodyFloor().toFixed(4)};
  });
  console.log('MOUTH  ', JSON.stringify(mouth));
  ck(mouth.apex>mouth.stand, 'his mouth does not rise through the jump');
  ck(mouth.rise>mouth.bodyF*0.5, 'the leap barely lifts his mouth: '+mouth.rise+' vs body '+mouth.bodyF);
  ck(Math.abs(mouth.idle-mouth.stand)<0.02,
     'the two sets put his mouth in different places while standing: '+mouth.idle+' vs '+mouth.stand);
  // it must be monotone up then down across the air frames, not jittering
  const air=mouth.ys.slice(2,6);
  ck(air[0]<air[1] && air[1]<=air[2] && air[3]<air[2], 'the arc is not an arc: '+JSON.stringify(air));

  /* ---------- 4. he actually catches a thrown ball out of the air ----------
     Throw properly - over his head, from a distance - and run the real clock. */
  const throwAt = async (bx,bz,bh,vx,vz,vh)=>pg.evaluate(({bx,bz,bh,vx,vz,vh})=>{
    CAM.state="idle"; CAM.t=0; CAM.until=9; CAM.fi=0; CAM.leap=null; CAM.lz=0; CAM.leapCd=0;
    CAM.freeze=0; CAM.bedTarget=false; CAM.x=0.34; CAM.dir=1; CAM.fetchPhase=0;
    /* AND HE IS WATCHING IT. dogLeapPlan now charges him for a ball behind his back - he has to
       turn before his legs count for anything - so the direction he is pointed is part of the
       setup rather than whatever the previous test left in CAM.oct. This helper holds him in
       "idle" for the whole run and never sets BALL.needsFetch, so the chase never fires and
       nothing would ever turn him: left stale, he stood with his tail to the throw for 180 frames
       and refused a lob he should have taken. A dog being thrown a ball is looking at the thrower. */
    CAM.oct=dogOctant(bx-CAM.x, bz-0.70);
    BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
    BALL.x=bx; BALL.z=bz; BALL.hz=bh; BALL.vx=vx; BALL.vz=vz; BALL.vh=vh;
    CAM.x=0.34; CAM.z=0.70;
    TRICK.live=true; TRICK.mult=1; TRICK.ticks=0; TRICK.floorB=0; TRICK.swish=0;
    TRICK.hitWall=false; TRICK.hitWin=false;
    const seen={leapt:false, maxLift:0, caught:false, catchY:null, catchLift:0,
                frames:[], freeze:0, fx:0, states:new Set()};
    for(let i=0;i<180;i++){
      camBehavior(1/60);
      seen.states.add(CAM.state);
      if(CAM.state==="leap"){
        seen.leapt=true; seen.frames.push(CAM.fi);
        seen.maxLift=Math.max(seen.maxLift, dogLift());
        if(!seen.from) seen.from=seen.prevState;
        if(!BALL.carried){
          const mh=dogMouthHz();
          const d=Math.hypot(BALL.x-CAM.x,(BALL.z-CAM.z)*1.1,(BALL.hz-mh)*0.85);
          if(seen.near===undefined||d<seen.near){
            seen.near=+d.toFixed(4); seen.nearDx=+(BALL.x-CAM.x).toFixed(4);
            seen.nearDy=+(BALL.hz-mh).toFixed(4);
          }
        }
      }
      seen.prevState=CAM.state;
      seen.freeze=Math.max(seen.freeze, CAM.freeze||0);
      seen.fx=Math.max(seen.fx, CAMFX.length);
      if(BALL.carried && !seen.caught){
        seen.caught=true; seen.catchY=+BALL.hz.toFixed(3); seen.catchLift=+dogLift().toFixed(4);
        seen.atFrame=CAM.fi; seen.i=i;
      }
    }
    seen.states=[...seen.states];
    seen.frameSpan=seen.frames.length?[Math.min(...seen.frames),Math.max(...seen.frames)]:null;
    seen.maxLift=+seen.maxLift.toFixed(4);
    return seen;
  },{bx,bz,bh,vx,vz,vh});

  // a lob that arrives over his head: launched from across the room, arcing down onto him
  const highLob = await throwAt(0.62, 0.70, 0.05, -0.30, 0.0, 1.15);
  console.log('LOB    ', JSON.stringify(highLob));
  ck(highLob.leapt, 'a lob over his head did not make him jump');
  ck(highLob.caught, 'he jumped but never took the ball');
  ck(highLob.catchLift>0, 'he "caught" it with his feet on the floor: lift '+highLob.catchLift);
  ck(highLob.catchY>0.02, 'the catch happened at floor height '+highLob.catchY+', not in the air');
  ck(highLob.freeze>0, 'no hitstop on the catch');
  ck(highLob.fx>0, 'the contact threw no rings');
  ck(highLob.frameSpan && highLob.frameSpan[0]<=6 && highLob.frameSpan[1]>=14,
     'the jump did not play crouch-through-air: frames '+JSON.stringify(highLob.frameSpan));

  const flatFast = await throwAt(0.80, 0.70, 0.22, -0.55, 0.0, 1.20);
  console.log('FLAT   ', JSON.stringify(flatFast));
  ck(flatFast.leapt, 'a fast flat ball across him drew no leap');

  /* ---------- 5. ...and he does NOT leap at what he cannot reach ---------- */
  const impossible = await pg.evaluate(()=>{
    const trial=(bx,bz,bh,vx,vz,vh,label)=>{
      CAM.state="idle"; CAM.t=0; CAM.until=9; CAM.leap=null; CAM.lz=0; CAM.leapCd=0; CAM.freeze=0;
      CAM.x=0.34; CAM.dir=1; CAM.fetchPhase=0; CAM.bedTarget=false;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
      BALL.x=bx; BALL.z=bz; BALL.hz=bh; BALL.vx=vx; BALL.vz=vz; BALL.vh=vh;
      // the far-corner case only means anything if he is in the OPPOSITE corner. This was
      // silently leaving him beside the ball, so "he leapt at something unreachable" was really
      // "he leapt at something two feet away", which is correct behaviour badly described.
      const far=label.indexOf('far corner')>=0;
      CAM.x=far?0.95:0.34; CAM.z=far?0.95:0.70;
      let leapt=false;
      /* Asked of the PLAN, on the frame the situation exists. Running the clock forward instead
         lets him trot toward the ball first, so a later frame answers a different question than
         the one being posed - and with his new stride he really can cross most of the room. */
      const planned=!!dogLeapPlan();
      for(let i=0;i<8;i++){ camBehavior(1/60); if(CAM.state==="leap") leapt=true; }
      return {label, leapt:leapt||planned};
    };
    /* "High above him" is NOT unreachable and asserting it was my mistake: gravity brings that
       ball straight back down through his reach, and timing the leap for the moment it arrives is
       exactly the behaviour wanted. These three are genuinely not leapable. */
    return [ trial(0.34,0.70,0,0.55,0,0,'rolling flat along the carpet'),
             /* NOT "flying away": the room is closed, so a ball driven at a wall bounces
                straight back into his reach and going for it is correct. The genuinely
                impossible one is a ball arriving in the far corner sooner than he can cross
                the floor to it. */
             trial(0.05,0.12,0.55,0,0,0.1,'arriving in the far corner, too soon to reach'),
             trial(0.34,0.70,0,0,0,0,'sitting still on the carpet') ];
  });
  console.log('NOLEAP ', JSON.stringify(impossible));
  for(const t of impossible) ck(!t.leapt, 'he leapt at a ball '+t.label);
  const busy = await pg.evaluate(()=>{
    const trial=(st)=>{
      CAM.state=st; CAM.leap=null; CAM.lz=0; CAM.leapK=1; CAM.leapCd=0; CAM.freeze=0;
      CAM.x=0.34; CAM.dir=1; CAM.bedTarget=false;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.cool=0;
      BALL.x=0.62; BALL.y=0.55; BALL.vx=-0.42; BALL.vy=-1.05;
      /* Over a second a resting dog may legitimately get up and then jump - what must never
         happen is the leap INTERRUPTING one of these. So record the state it was entered from. */
      let from=null, prev=st;
      for(let i=0;i<70;i++){ camBehavior(1/60); if(CAM.state==="leap" && !from) from=prev; prev=CAM.state; }
      return {st, from};
    };
    return ['rest','zoomies','stay','come'].map(trial);
  });
  console.log('BUSY   ', JSON.stringify(busy));
  const OK=['idle','walk','sniff','catch','chase','bark',null];
  for(const t of busy) ck(OK.includes(t.from), 'he leapt straight out of "'+t.from+'"');

  /* the height is chosen, not fixed: a low ball and a high one must pick different K */
  const heights = await pg.evaluate(()=>{
    /* FOUR REAL LOBS, not four hovering balls. A ball with no upward velocity falls clean through
       his reach in the few frames before the plan's window even opens, so probing with one asks a
       question the game never faces. Throw them properly, at increasing loft, and record the jump
       he actually chose - which is the thing worth knowing. */
    const B=dogBodyFloor();
    const lob=(vh)=>{
      CAM.state="idle"; CAM.x=0.34; CAM.z=0.70; CAM.dir=1; CAM.leap=null; CAM.lz=0;
      CAM.leapK=1; CAM.leapCd=0; CAM.freeze=0; CAM.until=9; CAM.fetchPhase=0;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false; BALL.cool=0;
      BALL.x=0.60; BALL.z=0.70; BALL.hz=0.02; BALL.vx=-0.26; BALL.vz=0; BALL.vh=vh;
      /* A BALL IS ONLY OUTSTANDING IF SOMETHING THREW IT. Every real throw path sets needsFetch
         and a hold; a probe that assigns velocities by hand sets neither, so he correctly ignores
         a ball nobody gave him. Arm it the way PLAY FETCH does - no hold, because what is being
         measured here is the leap band, not the patience. */
      BALL.needsFetch=true; BALL.hold=0;
      let K=null, got=false;
      for(let i=0;i<90;i++){
        camBehavior(1/60);
        if(CAM.state==="leap" && K===null) K=+CAM.leapK.toFixed(3);
        if(BALL.carried) got=true;
      }
      return {vh, K, got, apex:+(vh*vh/(2*BALL_G)/B).toFixed(2)};
    };
    return [lob(0.90), lob(1.10), lob(1.28), lob(1.45)];
  });
  console.log('HEIGHT ', JSON.stringify(heights));
  /* A LOW LOB SHOULD NOT MAKE HIM JUMP. Its apex is below his standing muzzle, so he can take it
     with his feet on the carpet - leaping for it would be the same overreaction as a person
     jumping to catch something at chest height. What must be true is that the ones he DOES leave
     the floor for ask for bigger jumps the higher they are. */
  const Ks=heights.filter(h=>h.K!==null).map(h=>h.K);
  ck(Ks.length>=2, 'only '+Ks.length+' of four lobs drew a leap at all');
  ck(new Set(Ks).size>=2, 'every lob that drew a leap gets the same height: '+JSON.stringify(Ks));
  /* WHERE THE LEAP BAND ACTUALLY STARTS. His standing muzzle is 0.73 of his body; the LOWEST a
     scaled-down jump can put it is about 1.0 of his body, because the frames only climb so little
     of the way back down. So anything peaking under a body-length is his to take on his feet, and
     that is the right answer - it is the same overreaction as a person jumping for something at
     chest height. Above a body-length he has to leave the floor. */
  for(const hgt of heights){
    if(hgt.K===null) ck(+hgt.apex<1.05, 'a lob peaking at '+hgt.apex+
      ' body-lengths drew no leap, which is above anything he can reach standing');
    else ck(+hgt.apex>0.80, 'he leapt for a lob peaking at only '+hgt.apex+' body-lengths');
    ck(hgt.got, 'a lob at vh='+hgt.vh+' was never collected at all');
  }
  for(let i=1;i<heights.length;i++)
    if(heights[i].K!==null && heights[i-1].K!==null)
      ck(heights[i].K>=heights[i-1].K-0.12,
         'a higher lob asks for a much smaller jump: '+JSON.stringify(heights));

  /* ---------- 6. he always comes back down ---------- */
  const settle = await pg.evaluate(()=>{
    CAM.state="idle"; CAM.leap=null; CAM.lz=0; CAM.leapCd=0; CAM.freeze=0; CAM.x=0.34; CAM.dir=1;
    BALL.off=false; BALL.carried=false; BALL.held=false; BALL.cool=0;
    /* The loft has to clear his STANDING muzzle or he just takes it on his feet, which is right
       and is not what this section is testing. He grew in v0.324a, so a lob that used to be
       comfortably over his head now is not - the probe follows the dog. */
    BALL.x=0.62; BALL.z=0.70; BALL.hz=0.05; BALL.vx=-0.30; BALL.vz=0; BALL.vh=1.15;
    CAM.x=0.34; CAM.z=0.70;
    let sawLeap=false;
    for(let i=0;i<420;i++){ camBehavior(1/60); if(CAM.state==="leap") sawLeap=true; }
    return {sawLeap, state:CAM.state, leap:CAM.leap, lz:CAM.lz, freeze:CAM.freeze,
            lift:+dogLift().toFixed(4)};
  });
  console.log('SETTLE ', JSON.stringify(settle));
  ck(settle.sawLeap, 'the settle run never got him off the ground');
  ck(settle.leap===null, 'he is still mid-leap seven seconds later');
  ck(settle.state!=="leap", 'he never left the leap state: '+settle.state);
  ck(settle.lift===0, 'he is stuck in the air: lift '+settle.lift);

  /* ---------- 7. and a picture of the arc ---------- */
  const png = await pg.evaluate(()=>{
    const cam=document.querySelector('#dogcv');
    const [ctx,w,h]=fit(cam);
    const shots=[];
    CAM.state="leap"; CAM.dir=1; CAM.x=0.34;
    CAM.leap={ph:"air",t:0,lzMax:0.05,tx:0.5,caught:false};
    for(const fi of [2,5,7,9,11,13,15,17]){
      CAM.fi=fi; CAM.lz=(fi>=7&&fi<=14)?0.04:0;
      drawCam(performance.now()/1000);
      shots.push(cam.toDataURL('image/png'));
    }
    CAM.state="idle"; CAM.leap=null; CAM.lz=0; CAM.fi=0;
    return shots;
  });
  for(let i=0;i<png.length;i++)
    fs.writeFileSync('leap_'+i+'.png', Buffer.from(png[i].split(',')[1],'base64'));

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL LEAP CHECKS PASS');
  await b.close();
  process.exit(fails.length?1:0);
})();
