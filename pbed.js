/* THE BED HE COULD NEVER REACH, AND THREE THINGS AROUND IT.
   Reported: a prime dog walks to bed, does not get in, and chirps the same note forever at frame
   rate. The cause was a second, stale idea of where the bed is - camGoto walked him to
   SPOT.bed.x while the rest state measured him against a `BED = {x:0.56}` left over from the
   pre-room layout, so arriving never counted as arrived and he was sent straight back, beeping.
   Also here: the window's sky through a broken pane, and the backwards mid-air catch. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
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

  /* ---------- 1. THE ORPHAN IS GONE ---------- */
  const orphan = await pg.evaluate(()=>({
    bedGlobal: (typeof BED==="undefined") ? "gone" : JSON.stringify(BED),
    spot: {x:SPOT.bed.x, z:SPOT.bed.z},
    rest: bedRestSpot()
  }));
  console.log('ORPHAN', JSON.stringify(orphan));
  ck(orphan.bedGlobal==="gone",
     'the stale BED position is still in the file: '+orphan.bedGlobal);
  ck(Math.abs(orphan.rest.x-orphan.spot.x)<1e-9,
     'the resting spot is not above the bed: '+JSON.stringify(orphan));

  /* ---------- 2. A PRIME DOG WALKS TO BED, GETS IN, AND STAYS IN ---------- */
  /* Driven through the real camBehavior at the real dt. The tell for the reported bug is not just
     "does he end up resting" - it is whether he keeps being SENT BACK, so the number of
     rest->walk flips is what is counted, and it must be zero after he settles. */
  const settle = await pg.evaluate(()=>{
    S.lvl=30; XPANIM.lvl=30; S.pendingStage.length=0;   // PRIME: the size that was reported
    S.bedTier=3; S.energy=20; S.vampire=false;
    BALL.off=true; FLY.active=false; FLY.next=99;
    CAM.x=0.20; CAM.z=0.70; CAM.lz=0; CAM.leap=null;
    toggleRest();
    const startedWalking=CAM.bedTarget;
    let flips=0, restFrames=0, arrived=-1, prev=CAM.state;
    for(let i=0;i<1400;i++){                    // ~23 seconds of real behaviour
      camBehavior(1/60);
      if(prev==="rest" && CAM.state!=="rest") flips++;
      if(CAM.state==="rest"){ restFrames++; if(arrived<0) arrived=i; }
      prev=CAM.state;
    }
    return {startedWalking, flips, restFrames, arrived,
            state:CAM.state, bedTarget:CAM.bedTarget,
            x:+CAM.x.toFixed(3), z:+CAM.z.toFixed(3),
            spot:bedRestSpot(), atBed:atBedSpot()};
  });
  console.log('SETTLE', JSON.stringify(settle));
  ck(settle.startedWalking===true, 'toggleRest did not send him to bed at all');
  ck(settle.arrived>=0, 'a PRIME dog never reached his bed in 23 seconds: '+JSON.stringify(settle));
  ck(settle.flips===0,
     'he was bounced out of bed and sent back '+settle.flips+' times — this is the reported loop');
  ck(settle.restFrames>600,
     'he only stayed in bed for '+settle.restFrames+' frames of ~1400');
  ck(settle.atBed===true, 'he settled somewhere that is not the bed: '+JSON.stringify(settle));

  /* ...and the same at every stage, since the bed and the dog both scale ---------- */
  const stages = await pg.evaluate(()=>{
    const out={};
    for(const [nm,lvl,tier] of [["puppy",4,1],["junior",12,2],["prime",30,3]]){
      S.lvl=lvl; XPANIM.lvl=lvl; S.bedTier=tier; S.energy=20;
      CAM.state="idle"; CAM.bedTarget=false; CAM.x=0.20; CAM.z=0.70; CAM.lz=0;
      toggleRest();
      let flips=0, prev=CAM.state, rest=0;
      for(let i=0;i<1200;i++){
        camBehavior(1/60);
        if(prev==="rest" && CAM.state!=="rest") flips++;
        if(CAM.state==="rest") rest++;
        prev=CAM.state;
      }
      out[nm]={flips, rest, state:CAM.state};
    }
    return out;
  });
  console.log('STAGES', JSON.stringify(stages));
  for(const k of ["puppy","junior","prime"]){
    ck(stages[k].flips===0, 'a '+k+' is bounced out of bed '+stages[k].flips+' times');
    ck(stages[k].rest>400, 'a '+k+' barely got to rest at all: '+stages[k].rest+' frames');
  }

  /* ...and the arrival chirp fires ONCE, not every frame ---------- */
  /* The audible symptom. beep() is the thing that was machine-gunning, so count the calls. */
  const chirp = await pg.evaluate(()=>{
    S.lvl=30; XPANIM.lvl=30; S.bedTier=3; S.energy=20;
    CAM.state="idle"; CAM.bedTarget=false; CAM.x=0.20; CAM.z=0.70;
    const real=window.beep; let n=0;
    window.beep=function(){ n++; return real.apply(this,arguments); };
    toggleRest();
    for(let i=0;i<1200;i++) camBehavior(1/60);
    window.beep=real;
    return {beeps:n};
  });
  console.log('CHIRP ', JSON.stringify(chirp));
  ck(chirp.beeps<=6,
     'the walk to bed made '+chirp.beeps+' beeps in 20 seconds — the chirp is still repeating');

  /* ---------- 3. THE WINDOW SHOWS THE SKY, WHOLE OR SMASHED ---------- */
  /* Sampled off the real canvas. A broken pane used to be filled with flat near-black AFTER the
     sky was drawn, so the moon and the daylight both vanished behind it exactly when the window
     was most open to the outside. */
  /* NOT AT 23:5x. nightAmount() returns 1 outright while SLEEP.active, and a clock parked just
     short of midnight rolls the day, raises the bedtime panel, and paints the whole room black -
     which reads exactly like "the moon is missing" while telling you nothing about the window.
     02:00 is the same part of the moon's arc with none of that going on. */
  const winPix = async (setup)=>{
    await pg.evaluate((s)=>{
      Object.assign(S, s.S||{});
      CLK.h=s.h; MYST.state="away"; MYST.blind=0;
      SLEEP.pending=false; closeBedtime();
      CAM.x=0.20; CAM.z=0.70; CAM.state="idle";
    }, setup);
    await pg.waitForTimeout(320);
    await pg.evaluate(()=>{ SLEEP.pending=false; closeBedtime(); });
    await pg.waitForTimeout(160);
    return pg.evaluate(()=>{
      const cv=document.getElementById('dogcv');
      const g=cv.getContext('2d');
      let best=0, at=null;
      // a grid across the pane, in DEVICE pixels — fit() puts a DPR transform on the context,
      // so getImageData is in cv.width/cv.height, not in the CSS units everything is drawn in
      for(let i=2;i<=18;i++) for(let j=2;j<=18;j++){
        const px=Math.round((WIN_X+WIN_W*(i/20))*cv.width);
        const py=Math.round((WIN_Y+WIN_H*(j/20))*cv.height);
        const d=g.getImageData(px,py,1,1).data;
        const lum=(d[0]*0.3+d[1]*0.6+d[2]*0.1);
        if(lum>best){ best=lum; at=[+(i/20).toFixed(2),+(j/20).toFixed(2)]; }
      }
      return {lum:Math.round(best), at, night:+nightAmount().toFixed(2), sleep:SLEEP.active};
    });
  };
  const wWholeNight = await winPix({h:2, S:{winBroken:false, winCracks:0, blindsOwned:false, blindsShut:false}});
  const wBrokeNight = await winPix({h:2, S:{winBroken:true,  winCracks:3}});
  const wWholeDay   = await winPix({h:12, S:{winBroken:false, winCracks:0}});
  const wBrokeDay   = await winPix({h:12, S:{winBroken:true,  winCracks:3}});
  const wShut       = await winPix({h:2, S:{winBroken:true,  blindsOwned:true, blindsShut:true, blindsTier:2}});
  console.log('WIN-N ', JSON.stringify({whole:wWholeNight, broke:wBrokeNight}));
  console.log('WIN-D ', JSON.stringify({whole:wWholeDay,   broke:wBrokeDay}));
  console.log('WIN-S ', JSON.stringify(wShut));
  ck(wWholeNight.lum>100, 'no moon through an intact window at midnight: '+wWholeNight.lum);
  ck(wBrokeNight.lum>100,
     'THE MOON IS GONE THROUGH A BROKEN WINDOW ('+wBrokeNight.lum+') — the damage fill is over it');
  ck(Math.abs(wBrokeNight.lum-wWholeNight.lum)<70,
     'the broken pane dims the moon badly: '+wBrokeNight.lum+' vs '+wWholeNight.lum);
  ck(wWholeDay.lum>90, 'the window is dark at noon through intact glass: '+wWholeDay.lum);
  ck(wBrokeDay.lum>=wWholeDay.lum-10,
     'a smashed window is DARKER than an intact one at noon ('+wBrokeDay.lum+' vs '
     +wWholeDay.lum+') — a hole should let more in, not less');
  ck(wShut.lum<90, 'the shutters are down and the sky is still showing through: '+wShut.lum);

  /* ---------- 4. HE HAS TO SEE IT COMING ---------- */
  /* dogLeapPlan is asked the same question with the same ball, twice: once with the dog facing
     the ball and once facing away. Facing away must be strictly worse. */
  const facing = await pg.evaluate(()=>{
    S.lvl=30; XPANIM.lvl=30; S.str=100; S.stam=100;   // a good dog, so the plan is not the limit
    S.tricks={fetch:1,sit:1,jump:1,roll:1};
    /* A REAL LOB — the same shape pleap uses. It has to arc over his head to be a leap at all;
       a flat ball at chest height is one he catches standing up and the plan rightly declines,
       which would make both halves of this test read "false" and prove nothing. */
    const trial=(oct)=>{
      CAM.x=0.30; CAM.z=0.70; CAM.lz=0; CAM.leap=null; CAM.leapCd=0; CAM.oct=oct;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false;
      BALL.x=0.60; BALL.z=0.70; BALL.hz=0.02;
      BALL.vx=-0.26; BALL.vz=0; BALL.vh=1.32; BALL.cool=0; BALL.settle=null;
      return !!dogLeapPlan();
    };
    // the lob comes from +x, so oct 0 faces it and oct 4 has his tail to it
    const o={ toward:trial(0), away:trial(4), side:trial(2) };
    // ...and the measure the gate is built on
    CAM.x=0.30; CAM.z=0.70;
    CAM.oct=0; o.bhAhead=+leapBehindness(0.60,0.70).toFixed(2);
    CAM.oct=4; o.bhBehind=+leapBehindness(0.60,0.70).toFixed(2);
    CAM.oct=2; o.bhSide=+leapBehindness(0.60,0.70).toFixed(2);
    return o;
  });
  console.log('FACE  ', JSON.stringify(facing));
  ck(facing.bhAhead===0, 'a ball dead ahead reads as behind him: '+facing.bhAhead);
  ck(facing.bhSide===0, 'a ball abeam reads as behind him — the side quarters must be free');
  ck(facing.bhBehind>0.9, 'a ball directly astern does not read as behind him: '+facing.bhBehind);
  ck(facing.toward===true, 'he will not leap for a ball he is looking straight at');
  ck(facing.away===false, 'HE STILL LEAPS BACKWARDS for a ball behind his own tail');

  /* ...and it is a penalty, not a blanket ban: given enough time he still turns and gets it ---- */
  const notBan = await pg.evaluate(()=>{
    /* The same lob, but landing right on top of him rather than a run away: there is nothing to
       close, so the turn is all it costs him and he still gets there. If this reads false the gate
       has become a blanket ban on ever catching anything from behind. */
    const trial=(oct)=>{
      CAM.x=0.30; CAM.z=0.70; CAM.lz=0; CAM.leap=null; CAM.leapCd=0; CAM.oct=oct;
      BALL.off=false; BALL.carried=false; BALL.held=false; BALL.pcarried=false;
      BALL.x=0.335; BALL.z=0.70; BALL.hz=0.02;
      BALL.vx=-0.02; BALL.vz=0; BALL.vh=1.32; BALL.cool=0; BALL.settle=null;
      return !!dogLeapPlan();
    };
    return { slowAway:trial(4), slowToward:trial(0) };
  });
  console.log('NOTBAN', JSON.stringify(notBan));
  ck(notBan.slowToward===true, 'the slow-ball control case does not plan at all');
  ck(notBan.slowAway===true,
     'facing away is a total ban rather than a penalty — he can never turn for anything');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npbed PASS');
})();
