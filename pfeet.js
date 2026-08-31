/* SIX THINGS, MOST OF THEM THE SAME MISTAKE.
   A number that was right once and stopped being right: one foot line for twenty-five frames of
   art whose lowest paw moves; one stride length for a floor drawn in perspective; one height
   variable that two states set and every other state had to remember to clear. Plus two rules
   that were never stated - the room is not a catapult, and a rolling dog travels. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-v0.346a.html';
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
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.pendingStage.length=0; S.ballOwned=true;
                          S.tricks={fetch:1,sit:1,jump:1,roll:1}; });
  await pg.waitForTimeout(700);

  /* ---------- 1. his lowest paw is ON the carpet, in every frame of every sheet ---------- */
  /* The old anchor was one number per sheet; the art's lowest opaque row moves 6-7px across the
     cycle, so some frames hovered and others sank. Measured against the ART, so this stays true
     if the sheets are ever redrawn - and fails loudly if they are redrawn badly. */
  const feet = await pg.evaluate(()=>{
    const out={};
    for(const k of Object.keys(DOGDIR)){
      const a=DOGDIR[k], img=DOGDIRIMG[k];
      const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
      const x=c.getContext('2d'); x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data;
      const F=dogDirFeet(k);
      let worst=0, sheetWorst=0;
      for(let f=0;f<a.n;f++){
        let low=-1;
        for(let yy=a.h-1;yy>=0;yy--){
          let any=false;
          for(let xx=f*a.w;xx<(f+1)*a.w;xx++){ if(d[(yy*c.width+xx)*4+3]>24){any=true;break;} }
          if(any){ low=yy+1; break; }
        }
        worst=Math.max(worst, Math.abs(F[f]-low));           // per-frame anchor vs the truth
        sheetWorst=Math.max(sheetWorst, Math.abs(a.foot-low)); // ...what one sheet number gave
      }
      out[k]={n:a.n, worst, sheetWorst};
    }
    return out;
  });
  console.log('FEET  ', JSON.stringify(feet));
  for(const k of Object.keys(feet)){
    ck(feet[k].worst===0,
       k+': the anchor is up to '+feet[k].worst+'px off its own art - he floats or sinks');
    ck(feet[k].sheetWorst>0,
       k+': the sheet-wide foot line was already exact, so nothing here was ever the problem');
  }

  /* ---------- 2. ...and the drawn sprite really does sit on the floor line ---------- */
  const drawn = await pg.evaluate(()=>{
    /* fit() LEAVES A DPR TRANSFORM ON THE CONTEXT. Drawing is in CSS pixels, getImageData is in
       device pixels - reading (0,0,w,h) reads the top-left quarter of the canvas, which is the
       one part of it the dog is never in. Measure in the backing store's own units. */
    const cam=document.querySelector('#dogcv'); const [ctx,w,h]=fit(cam);
    const BW=cam.width, BH=cam.height, sc=BW/w;
    const rows=[];
    CAM.x=0.5; CAM.z=0.6; CAM.lz=0;
    for(const oct of [0,1,2,3,4,5,6,7]){
      let lo=1e9, hi=-1e9;
      for(let f=0;f<25;f+=3){
        ctx.clearRect(0,0,w,h);
        dogDirDraw(ctx,w,h,CAM.x,CAM.z,oct,f);
        const d=ctx.getImageData(0,0,BW,BH).data;
        let bottom=-1;
        for(let yy=BH-1;yy>=0;yy--){
          let any=false;
          for(let xx=0;xx<BW;xx+=2){ if(d[(yy*BW+xx)*4+3]>24){any=true;break;} }
          if(any){ bottom=yy; break; }
        }
        if(bottom>=0){ lo=Math.min(lo,bottom); hi=Math.max(hi,bottom); }
      }
      rows.push({oct, spread:Math.round((hi-lo)/sc), lo:Math.round(lo/sc), hi:Math.round(hi/sc),
                 floor:Math.round(rmY(CAM.z)*h)});
    }
    ctx.clearRect(0,0,w,h);
    return rows;
  });
  console.log('DRAWN ', JSON.stringify(drawn.map(r=>r.oct+':'+r.spread)));
  for(const r of drawn)
    ck(r.spread<=2, 'octant '+r.oct+"'s feet wander "+r.spread+'px between frames - that is the bob');
  for(const r of drawn)
    ck(Math.abs(r.hi-r.floor)<=3,
       'octant '+r.oct+' draws its feet '+(r.hi-r.floor)+'px off the floor line');

  /* ---------- 3. the cycle is paced by what you SEE ---------- */
  /* Walking away covers far less glass than walking across, because the floor is in perspective.
     Pacing on floor distance ran his legs at the same rate either way, which is why the away
     diagonals looked like a sprint on the spot. */
  const pace = await pg.evaluate(()=>{
    const run=(dx,dz)=>{
      CAM.state="walk"; CAM.until=99; CAM.wander=null; CAM.wanderRest=99;
      CAM.x=0.50; CAM.z=0.50; CAM.px=undefined; CAM.pz=undefined; CAM.walkPh=0; CAM.walkHold=0;
      let sx=rmX(CAM.x,CAM.z), sy=rmY(CAM.z);
      for(let i=0;i<100;i++){ CAM.x+=dx; CAM.z+=dz; camBehavior(1/60); }
      const glass=Math.hypot((rmX(CAM.x,CAM.z)-sx)*RMW,(rmY(CAM.z)-sy)*RMH);
      return { ph:+CAM.walkPh.toFixed(2), glass:Math.round(glass),
               perPx:+(CAM.walkPh/Math.max(1,glass)).toFixed(4) };
    };
    const across=run(0.002,0), away=run(0,-0.002), diag=run(0.0014,-0.0014);
    return {across, away, diag};
  });
  console.log('PACE  ', JSON.stringify(pace));
  ck(pace.away.glass < pace.across.glass*0.8,
     'walking away covers as much glass as walking across - the room is not in perspective at all');
  /* THE POINT: the same number of screen pixels buys the same number of frames, whichever way he
     is pointed. That is what "his legs keep up with the ground" means. */
  for(const k of ['away','diag'])
    ck(Math.abs(pace[k].perPx-pace.across.perPx) < pace.across.perPx*0.12,
       'walking '+k+' runs the cycle at '+pace[k].perPx+' frames per pixel against '
       +pace.across.perPx+' across - his legs are racing his own travel');

  /* ---------- 4. nothing hovers ---------- */
  const hover = await pg.evaluate(()=>{
    const o={};
    // a fly hop interrupted by literally anything must not leave him in the air
    /* catchTried ON PURPOSE: this is asking about the ARC, and a level-20 dog catches at the
       first apex every time, which lands him back on the floor before the probe reads anything. */
    CAM.freeze=0; OUTING.active=false; PARTY.on=false; BALL.held=false;
    FLY.active=true; FLY.t=1; FLY.x=CAM.x+0.10; FLY.y=0.45;
    CAM.state="catch"; CAM.catchT=0.30; CAM.lz=0; CAM.catchTried=true;
    camBehavior(1/60);
    o.upMid=+CAM.lz.toFixed(4);
    /* ...now yank him out of the catch the way a stray state change would. THE FLY HAS TO GO
       FIRST: while it is still buzzing next to him the fly block correctly puts him straight back
       into the catch on the same frame, and the probe measures a dog jumping, not a ghost. */
    FLY.active=false; FLY.next=1e9;
    CAM.state="idle"; CAM.until=9;
    camBehavior(1/60);
    o.afterYank=+CAM.lz.toFixed(4);
    // ...and the same from a leap
    CAM.lz=0.04; CAM.state="walk"; CAM.leap=null;
    camBehavior(1/60);
    o.afterLeapYank=+CAM.lz.toFixed(4);
    FLY.active=false; FLY.next=999; CAM.state="idle"; CAM.lz=0;
    return o;
  });
  console.log('HOVER ', JSON.stringify(hover));
  ck(hover.upMid>0, 'he does not leave the floor at a fly at all: '+hover.upMid);
  ck(hover.afterYank===0, 'he is stuck '+hover.afterYank+' off the carpet after the catch ended');
  ck(hover.afterLeapYank===0, 'a leap that ended without tidying up left him hovering');

  /* ---------- 5. the fly is one roll per jump, and the odds grow ---------- */
  const fly = await pg.evaluate(()=>{
    const at=(lvl)=>{ const was=S.lvl; S.lvl=lvl; const c=+flyCatchChance().toFixed(3);
                      S.lvl=was; return c; };
    // ...and it is resolved ONCE per hop, not once per frame
    S.lvl=1;
    let tries=0;
    FLY.active=true; FLY.t=1; FLY.x=0.5; FLY.y=0.45;
    CAM.x=0.40; CAM.z=0.6; CAM.state="catch"; CAM.catchT=0; CAM.catchTried=false;
    const realRandom=Math.random;
    Math.random=()=>{ tries++; return 0.99; };      // always a miss, and counted
    for(let i=0;i<60;i++){                          // one full 0.80s loop at 60fps... plus a bit
      if(!FLY.active) break;
      CAM.state="catch";
      camBehavior(1/60);
    }
    Math.random=realRandom;
    FLY.active=false; FLY.next=999; CAM.state="idle"; CAM.lz=0; CAM.catchT=0;
    return { p1:at(1), p2:at(2), p3:at(3), p5:at(5), p7:at(7), p20:at(20), tries };
  });
  console.log('FLY   ', JSON.stringify(fly));
  ck(Math.abs(fly.p1-0.70)<1e-6, 'a puppy catches the fly '+(fly.p1*100)+'% of the time, not 70');
  ck(Math.abs(fly.p2-0.70)<1e-6, 'level 2 already improved - it is meant to be every TWO levels');
  ck(Math.abs(fly.p3-0.80)<1e-6, 'level 3 is '+fly.p3+', not 0.80');
  ck(Math.abs(fly.p5-0.90)<1e-6, 'level 5 is '+fly.p5+', not 0.90');
  ck(fly.p7>=1 && fly.p20<=1, 'the odds run past certainty: '+fly.p7+'/'+fly.p20);
  // one 0.8s loop is 48 frames; a per-frame coin flip would burn dozens of rolls
  ck(fly.tries<=3, 'the catch rolled the dice '+fly.tries+' times in one jump');

  /* ---------- 6. the room is not a catapult ---------- */
  const drop = await pg.evaluate(()=>{
    const o={};
    o.noConsts = (typeof SLING_K==='undefined');
    BALL.off=false; BALL.carried=false; BALL.pcarried=false; BALL.cool=0;
    BALL.x=0.30; BALL.z=0.35; BALL.hz=0.30; BALL.held=true;
    BALL.tx=BALL.x; BALL.tz=BALL.z;
    SLING.on=true; SLING.draw=SLING_MAX; SLING.deck=false;
    SLING.ax=0.5; SLING.ay=0.9; SLING.x=0.3; SLING.y=0.3;
    ballRelease();
    o.vx=+BALL.vx.toFixed(4); o.vz=+BALL.vz.toFixed(4); o.vh=+BALL.vh.toFixed(4);
    o.settling=!!BALL.settle; o.needsFetch=BALL.needsFetch; o.live=FETCH.live;
    o.stillHeld=BALL.held;      // ...and it let go: a drop that stays stuck to the finger is not one
    const x0=BALL.x;
    // the ball is ticked INSIDE camBehavior, so that is what has to be stepped
    CAM.state="rest"; CAM.until=1e9; CAM.freeze=0; FLY.active=false; FLY.next=1e9;
    for(let i=0;i<400 && BALL.settle;i++) camBehavior(1/60);
    o.restX=+BALL.x.toFixed(3); o.restZ=+BALL.z.toFixed(3); o.restH=+BALL.hz.toFixed(3);
    o.driftX=+Math.abs(BALL.x-x0).toFixed(3);
    o.home=BALL_HOME_Z;
    CAM.state="idle";
    return o;
  });
  console.log('DROP  ', JSON.stringify(drop));
  ck(drop.noConsts, 'the in-room throw constants are still there, so something can still fling it');
  ck(drop.vx===0 && drop.vz===0 && drop.vh===0,
     'letting go in the room still gave the ball velocity: '+JSON.stringify(drop));
  ck(drop.settling===true, 'the ball did not start dropping home');
  ck(drop.stillHeld===false, 'the ball is still held after being dropped');
  ck(drop.live===false, 'a drop was scored as a throw');
  ck(drop.needsFetch===false, 'he is being sent to fetch a ball nobody threw');
  ck(Math.abs(drop.restZ-drop.home)<0.01,
     'it came to rest at z='+drop.restZ+' rather than the near edge at '+drop.home);
  ck(drop.restH===0, 'it settled in mid-air at height '+drop.restH);
  ck(drop.driftX<0.02, 'it slid '+drop.driftX+' sideways on the way down - it should fall straight');

  /* ---------- 7. the roll travels, the way you swiped ---------- */
  const roll = await pg.evaluate(()=>{
    const go=(dir)=>{
      CAM.state="idle"; CAM.until=9; CAM.x=0.50; CAM.z=0.60; CAM.lz=0;
      PARTY.on=false; FLY.active=false; FLY.next=1e9;
      if(!dogDoRoll(dir)) return {failed:true};
      const x0=CAM.x;
      let mid=null;
      for(let i=0;i<Math.ceil(ROLL_T*60)+8;i++){
        camBehavior(1/60);
        if(mid===null && CAM.rollT>=ROLL_T*0.5) mid=CAM.x;
      }
      return { moved:+(CAM.x-x0).toFixed(3), mid:+((mid-x0)/(CAM.x-x0)).toFixed(2),
               dir:CAM.dir, state:CAM.state };
    };
    const g=(fx0,fy0,fx1,fy1)=>{ PET.sx=fx0; PET.sy=fy0; return dogGesture(fx1,fy1); };
    return { right:go(1), left:go(-1), travel:ROLL_TRAVEL,
             gR:g(0.3,0.5,0.55,0.51), gL:g(0.6,0.5,0.35,0.51),
             gSit:g(0.5,0.3,0.51,0.6), gNone:g(0.5,0.5,0.52,0.52) };
  });
  console.log('ROLL  ', JSON.stringify(roll));
  ck(roll.gR==='rollR' && roll.gL==='rollL',
     'a sideways swipe no longer says which way: '+roll.gR+'/'+roll.gL);
  ck(roll.gSit==='sit', 'a downward swipe stopped being SIT: '+roll.gSit);
  ck(roll.gNone===null, 'a twitch now counts as a gesture: '+roll.gNone);
  ck(Math.abs(roll.right.moved-roll.travel)<0.01,
     'rolling right went '+roll.right.moved+' rather than '+roll.travel);
  ck(Math.abs(roll.left.moved+roll.travel)<0.01,
     'rolling left went '+roll.left.moved+' rather than -'+roll.travel);
  ck(roll.left.dir===-1 && roll.right.dir===1, 'he is not facing the way he rolled');
  // ...eased, not slid: half the clock is roughly half the distance but not exactly
  ck(roll.right.mid>0.35 && roll.right.mid<0.65,
     'the roll is not eased - it slides at a constant rate: '+roll.right.mid);
  ck(roll.right.state==='idle', 'he never got back up: '+roll.right.state);

  /* ---------- 8. the XP bar is the door to the tree ---------- */
  const tree = await pg.evaluate(()=>{
    const sp=document.getElementById('skillPanel');
    const o={};
    // not full, no points at all: it still opens, because the tree is a map not a receipt
    sp.classList.remove('show'); XPANIM.ready=false; S.pts=0; PARTY.on=false;
    xpBarTap();
    o.emptyOpens=sp.classList.contains('show');
    // ...and a point survives closing it without spending
    sp.classList.remove('show'); S.pts=3;
    xpBarTap(); o.withPts=sp.classList.contains('show');
    document.getElementById('skillClose').click();
    o.kept=S.pts;
    // full: the tap confers the level
    XPANIM.ready=true; XPANIM.lvl=S.lvl-1;
    const lvl0=XPANIM.lvl;
    xpBarTap();
    o.conferred = !XPANIM.ready;
    o.danced = PARTY.on;
    PARTY.on=false; XPANIM.ready=false; XPANIM.lvl=S.lvl;
    sp.classList.remove('show');
    return o;
  });
  console.log('TREE  ', JSON.stringify(tree));
  ck(tree.emptyOpens===true, 'tapping the bar with no points banked did not open the tree');
  ck(tree.withPts===true, 'tapping the bar with points did not open the tree');
  ck(tree.kept===3, 'closing the tree without choosing anything spent '+(3-tree.kept)+' points');
  ck(tree.conferred===true, 'tapping a full bar did not take the level');
  ck(tree.danced===true, 'the level went in without the dance');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npfeet PASS');
})();
