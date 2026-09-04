const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
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
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.ballOwned=true; S.bedTier=2; });
  await pg.waitForTimeout(900);

  /* ---------- 1. the projection is a room, and it is self-consistent ---------- */
  const proj = await pg.evaluate(()=>{
    const o={ y0:+rmY(0).toFixed(4), y1:+rmY(1).toFixed(4),
              hw0:+rmHW(0).toFixed(4), hw1:+rmHW(1).toFixed(4),
              sc0:+rmSc(0).toFixed(4), sc1:+rmSc(1).toFixed(4) };
    // scale must track the floor's own widening, or one floor unit means different things at
    // different depths and every physical quantity in the room quietly stops meaning anything
    o.scRatio=+(o.sc1/o.sc0).toFixed(3); o.hwRatio=+(o.hw1/o.hw0).toFixed(3);
    // the inverse must actually invert
    const t=[]; for(const [x,z] of [[0.2,0.15],[0.5,0.5],[0.9,0.95]]){
      const sx=rmX(x,z), sy=rmY(z);
      const z2=rmZof(sy), x2=rmXof(sx,z2);
      t.push({dx:+Math.abs(x2-x).toFixed(5), dz:+Math.abs(z2-z).toFixed(5)});
    }
    o.inv=t;
    return o;
  });
  console.log('PROJ  ', JSON.stringify(proj));
  ck(proj.y1>proj.y0, 'the near edge is not below the back wall');
  ck(proj.hw1>proj.hw0, 'the floor does not widen toward you');
  ck(Math.abs(proj.scRatio-proj.hwRatio)<0.02,
     'scale and floor width disagree: '+proj.scRatio+' vs '+proj.hwRatio);
  for(const t of proj.inv) ck(t.dx<0.002 && t.dz<0.002, 'the projection does not invert: '+JSON.stringify(t));

  /* ---------- 2. depth reads three ways ---------- */
  const depth = await pg.evaluate(()=>{
    const at=(z)=>{ BALL.x=0.5; BALL.z=z; BALL.hz=0; const p=ballScreen();
                    return {z, y:+p.y.toFixed(4), sc:+p.sc.toFixed(3)}; };
    const rows=[at(0.05),at(0.35),at(0.65),at(0.95)];
    // ...and a HELD ball, which must be bigger than a floor ball at the same depth
    BALL.z=0.9; const heldNear=ballHeldScale(), floorNear=rmSc(0.9);
    BALL.z=0.15; const heldFar=ballHeldScale();
    BALL.z=0.55; BALL.hz=0;
    return {rows, heldNear:+heldNear.toFixed(3), floorNear:+floorNear.toFixed(3),
            heldFar:+heldFar.toFixed(3)};
  });
  console.log('DEPTH ', JSON.stringify(depth));
  for(let i=1;i<depth.rows.length;i++){
    ck(depth.rows[i].y>depth.rows[i-1].y, 'nearer is not lower on the glass');
    ck(depth.rows[i].sc>depth.rows[i-1].sc, 'nearer is not bigger');
  }
  ck(depth.heldNear>depth.floorNear, 'a held ball is not bigger than one on the floor at the same spot');
  ck(depth.heldNear>depth.heldFar*1.5, 'dragging it down the glass barely grows it: '
     +depth.heldFar+' -> '+depth.heldNear);

  /* ---------- 3. the room is not a catapult ---------- */
  /* INVERTED TWICE NOW, AND KEPT BOTH TIMES. First this pinned a FLICK - swipe up the glass, thumb
     speed sets the power - which threw differently every time you did the same thing. Then it
     pinned an in-room SLINGSHOT: pull the ball back, let go, it fires where the band points. Now
     there is no throw in the room at all. The deck slingshot below the split is the only launcher
     there is, and a drag that stays up in the room simply DROPS the ball at the near edge, ready
     for one. So the questions are the same three - what does a pull do, what does a tap do, what
     does a back-and-right drag do - and every answer is now "nothing; it falls". */
  const sling = await pg.evaluate(async ()=>{
    const HOME=BALL_HOME_Z;
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const cv=document.querySelector('#dogcv'), r=cv.getBoundingClientRect();
    const send=(t,fx,fy,id)=>cv.dispatchEvent(new PointerEvent(t,{
      clientX:r.left+fx*r.width, clientY:r.top+fy*r.height,
      pointerId:id, bubbles:true, pointerType:'touch'}));
    const doThrow=async (x0,y0,x1,y1,steps,gapMs)=>{
      CAM.state="rest"; CAM.until=99;                 // keep him out of the way
      BALL.carried=false; BALL.off=false; BALL.pcarried=false; BALL.cool=0;
      BALL.x=rmXof(x0,rmZof(y0)); BALL.z=rmZof(y0); BALL.hz=0;
      BALL.vx=0; BALL.vz=0; BALL.vh=0;
      const p=ballScreen();
      send('pointerdown',p.x,p.y,9);
      const held=BALL.held, anch={ax:SLING.ax, ay:SLING.ay};
      for(let i=1;i<=steps;i++){
        const k=i/steps;
        send('pointermove', x0+(x1-x0)*k, y0+(y1-y0)*k, 9);
        await sleep(gapMs);
      }
      const drew=SLING.draw;
      send('pointerup',x1,y1,9);
      const settling=!!BALL.settle;
      const v={vx:+BALL.vx.toFixed(3), vz:+BALL.vz.toFixed(3), vh:+BALL.vh.toFixed(3)};
      // ...and let it finish falling, so where it ENDS UP can be asserted too
      for(let i=0;i<400 && BALL.settle;i++) camBehavior(1/60);
      return {held, anch, drew:+drew.toFixed(4), settling,
              restZ:+BALL.z.toFixed(3), vx:v.vx, vz:v.vz, vh:v.vh, live:FETCH.live};
    };
    // a hard pull straight DOWN the glass, which used to be the biggest shot in the room
    const pull =await doThrow(0.5,0.55,0.5,0.85,8,10);
    // ...the same, four times slower
    const slow =await doThrow(0.5,0.55,0.5,0.85,8,45);
    // ...half of it
    const half =await doThrow(0.5,0.55,0.5,0.70,8,10);
    // ...and a nudge, which was never a shot even then
    const tap  =await doThrow(0.5,0.85,0.502,0.848,3,20);
    // ...and back-and-right, which used to fire away-left
    const diag =await doThrow(0.5,0.55,0.72,0.82,8,10);
    return {pull,slow,half,tap,diag,max:SLING_MAX,home:HOME};
  });
  console.log('SLING ', JSON.stringify(sling));
  ck(sling.pull.held===true, 'the ball was not picked up by a press on it');
  for(const k of ['pull','slow','half','tap','diag'])
    ck(sling[k].vx===0 && sling[k].vz===0 && sling[k].vh===0,
       'the "'+k+'" drag still threw the ball inside the room: '+JSON.stringify(sling[k]));
  for(const k of ['pull','slow','half','tap','diag'])
    ck(sling[k].live===false, 'the "'+k+'" drag started a scoring throw with no throw in it');
  ck(sling.pull.drew>=sling.max-1e-6,
     'the draw is not even being measured any more: '+sling.pull.drew);
  ck(sling.pull.settling===true, 'letting go in the room did not start the ball dropping home');
  for(const k of ['pull','half','diag'])
    ck(Math.abs(sling[k].restZ-sling.home)<0.02,
       'the "'+k+'" drop came to rest at z='+sling[k].restZ+' rather than the near edge at '
       +sling.home);

  /* ---------- 4. it can reach the back wall, and cannot leave the room ---------- */
  const reach = await pg.evaluate(()=>{
    const run=(vx,vz,vh,n)=>{
      CAM.state="rest"; CAM.until=99;
      /* A DROP STILL EASING HOME OWNS THE BALL'S TICK. The block above now ends with the ball
         settling, and a probe that sets velocities on top of that measures the settle, not the
         flight - which reads exactly like a throw that cannot reach the back wall. */
      BALL.settle=null;
      /* ...AND THE TARGET GOES BACK ON THE CARPET. This block is about the ball being contained by
         the room and counting its banks; with the cross able to live UP a wall now, a ball driven
         into that same wall can be scored a BULLSEYE instead - which closes the throw and stops
         the bank ever being counted. Right behaviour, wrong question for this block. */
      MARK.wall=null; MARK.x=SPOT.mark.x; MARK.z=SPOT.mark.z; MARK.hz=0; MARKPOP.t=0;
      BALL.held=false; BALL.carried=false; BALL.off=false;
      BALL.x=0.5; BALL.z=0.92; BALL.hz=0.05; BALL.vx=vx; BALL.vz=vz; BALL.vh=vh;
      FETCH.live=true; FETCH.banks=0; FETCH.foul=false;
      let minZ=9, maxH=0, out=false;
      for(let i=0;i<n;i++){
        camBehavior(1/60);
        minZ=Math.min(minZ,BALL.z); maxH=Math.max(maxH,BALL.hz);
        if(BALL.x<-0.01||BALL.x>1.01||BALL.z<-0.01||BALL.z>1.01) out=true;
      }
      return {minZ:+minZ.toFixed(3), maxH:+maxH.toFixed(3), out, banks:FETCH.banks,
              label:FETCH.label};
    };
    return { hard:run(0,-1.5,0.9,150), soft:run(0,-0.25,0.25,150),
             wide:run(1.6,-1.2,0.8,200) };
  });
  console.log('REACH ', JSON.stringify(reach));
  ck(reach.hard.minZ<0.12, 'a hard throw cannot reach the back wall: minZ='+reach.hard.minZ);
  ck(reach.soft.minZ>0.35, 'a soft throw still flies to the back: minZ='+reach.soft.minZ);
  ck(!reach.hard.out && !reach.wide.out, 'the ball left the room');
  ck(reach.wide.banks>=1, 'a ball driven into the side wall recorded no bank: '+reach.wide.banks);
  ck(!!reach.hard.label, 'a completed throw produced no result label');

  /* ---------- 5. scoring tells the throws apart ---------- */
  const score = await pg.evaluate(()=>{
    /* FETCH.hot HAS TO BE CLEARED BETWEEN CASES. A landed shot opens the other two targets and
       keeps them open, so once `direct` scores, the very next case is measured against three
       targets instead of one - and a "near miss" of the middle X is a bullseye on a side one.
       That is the feature working; leaving it on between unrelated cases is the harness lying. */
    /* ...AND SO HAS THE TARGET ITSELF, NOW THAT IT MOVES. Landing on the cross POPS it and paints
       it somewhere else, so the second case in this block was being scored against a target that
       the first case had already sent to the other side of the room - and every distance came out
       a MISS. SPOT.mark is only where it STARTS; MARK is where it is. Put it back before each. */
    const m=SPOT.mark;
    const land=(x,z,banks,foul)=>{
      MARK.x=m.x; MARK.z=m.z; MARK.hz=0; MARK.wall=null; MARKPOP.t=0;
      FETCH.live=true; FETCH.banks=banks; FETCH.foul=foul; FETCH.hot=false;
      BALL.x=x; BALL.z=z; fetchLand(); return FETCH.label;
    };
    return { direct:land(m.x,m.z,0,false),
             close:land(m.x+0.20,m.z+0.10,0,false),
             miss:land(0.95,0.92,0,false),
             one:land(m.x+0.10,m.z+0.10,1,false),
             two:land(m.x+0.10,m.z+0.10,2,false),
             foul:land(m.x,m.z,0,true) };
  });
  console.log('SCORE ', JSON.stringify(score));
  ck(score.direct==="DIRECT", 'a shot on the mark is not DIRECT: '+score.direct);
  ck(score.close==="CLOSE",   'a near miss is not CLOSE: '+score.close);
  ck(score.miss==="MISS",     'a shot across the room is not MISS: '+score.miss);
  ck(score.one==="1-BANK",    'a one-wall shot is not 1-BANK: '+score.one);
  ck(score.two==="2-BANK",    'a two-wall shot is not 2-BANK: '+score.two);
  ck(score.foul==="FOUL",     'landing in a bowl is not FOUL: '+score.foul);

  /* ...and the ONE target it is scored against.
     INVERTED, not dropped. This briefly pinned a three-target board that opened up as you landed
     shots. One thick cross reads better and gives the throw a single thing to be about, so the
     same three questions - how many, when are they up, what scores - get the new answers. */
  const board = await pg.evaluate(()=>{
    /* MARK.showT IS PART OF THE ANSWER NOW. The cross shows for a couple of seconds after it
       MOVES, whatever else is happening, so you can see where it went - and the block above just
       popped it twice. Clear the grace to ask the steady-state question, then ask the new one. */
    const at=(held,deck,live)=>{ BALL.held=held; SLING.deck=deck; FETCH.live=live; MARK.showT=0;
                                 return marksShown(); };
    const o={ n:MARKS.length, live:marksLive(),
              cold:at(false,false,false),    // nothing in play: no X on the carpet
              inHand:at(true,false,false),
              inFlight:at(false,false,true),
              onDeck:at(false,true,false) };
    BALL.held=false; SLING.deck=false; FETCH.live=false;
    MARK.showT=2.6; o.justMoved=marksShown(); MARK.showT=0;
    // ...and it must sit clear of the furniture, or a shot on it also fouls on a bowl
    const bx=BALL.x, bz=BALL.z;
    MARK.x=SPOT.mark.x; MARK.z=SPOT.mark.z; MARK.hz=0; MARK.wall=null;
    BALL.x=MARKS[0].x; BALL.z=MARKS[0].z; o.foul=ballFouled();
    BALL.x=bx; BALL.z=bz;
    return o;
  });
  console.log('BOARD ', JSON.stringify(board));
  ck(board.n===1, 'there is more than one target: '+board.n);
  ck(board.live===1, 'more than one target can be scored on: '+board.live);
  ck(board.cold===0, 'the target is up with the ball out of play');
  ck(board.justMoved===1,
     'the cross moved and did not show itself - you would never see where it went');
  ck(board.inHand===1 && board.inFlight===1 && board.onDeck===1,
     'the target is not up while the ball is in play: '+JSON.stringify(board));
  ck(board.foul===false, 'the target sits inside the furniture');

  /* ---------- he brings it back to where CALL BONES puts him ---------- */
  const home = await pg.evaluate(()=>({ near:SPOT.near, mark:SPOT.mark }));
  console.log('HOME  ', JSON.stringify(home));
  ck(Math.abs(home.near.x-0.5)<0.06,
     'his drop-off is not front and centre: x='+home.near.x);
  ck(home.near.z>0.8, 'his drop-off is not down at the near edge: z='+home.near.z);

  /* ---------- 6. streaks, and what breaks them ---------- */
  const streak = await pg.evaluate(()=>{
    FETCH.streak=0;
    const good=()=>{ FETCH.good=true; fetchReturned(); return FETCH.streak; };
    const bad =()=>{ FETCH.good=false; fetchReturned(); return FETCH.streak; };
    const a=[good(),good(),good(),good()];
    const onAt4=(()=>{ FETCH.live=true; BALL.hz=0.3; BALL.carried=false; BALL.held=false;
                       CAM.state="idle"; return fetchInterceptWanted(); })();
    const afterBreak=(()=>{ fetchBreakStreak(); return FETCH.streak; })();
    FETCH.streak=3;
    const onAt3=(()=>{ FETCH.live=true; BALL.hz=0.3; return fetchInterceptWanted(); })();
    FETCH.streak=0; const dud=bad();
    return {a, onAt4, onAt3, afterBreak, dud, at:FETCH_INTER_AT};
  });
  console.log('STREAK', JSON.stringify(streak));
  ck(JSON.stringify(streak.a)==="[1,2,3,4]", 'good returns do not build a streak: '+JSON.stringify(streak.a));
  ck(streak.onAt4===true,  'the intercept is not armed at the streak threshold');
  ck(streak.onAt3===false, 'the intercept arms below the threshold');
  ck(streak.afterBreak===0, 'an intercept did not break the streak');
  ck(streak.dud===0, 'a bad throw did not reset the streak');

  /* ---------- 7. he still walks the floor, on the right sheet ---------- */
  const walk = await pg.evaluate(()=>{
    const seen={};
    for(const [dx,dz,name] of [[1,0,'right'],[-1,0,'left'],[0,-1,'away'],[0,1,'toward'],
                               [1,1,'toward-right'],[-1,1,'toward-left']]){
      const o=dogOctant(dx,dz); seen[name]={oct:o, sheet:DOGDIR_MAP[o].k, flip:DOGDIR_MAP[o].f};
    }
    // and that he actually crosses the floor
    /* wanderRest HAS TO GO TOO. The blocks above leave him having stood around for hundreds of
       frames, and a dog resting between wanders stands perfectly still however explicitly you
       hand him somewhere to be - which reads here as "he did not cross the floor". */
    CAM.state="walk"; CAM.bedTarget=false; CAM.x=0.2; CAM.z=0.3; CAM.wander={x:0.8,z:0.85};
    CAM.wanderRest=0; CAM.freeze=0; CAM.until=99; BALL.settle=null;
    const p0={x:CAM.x,z:CAM.z};
    for(let i=0;i<120;i++) camBehavior(1/60);
    return {seen, moved:+Math.hypot(CAM.x-p0.x,CAM.z-p0.z).toFixed(3),
            n:Object.keys(DOGDIR).length, frames:DOGDIR.E.n};
  });
  console.log('WALK  ', JSON.stringify(walk));
  ck(walk.seen.right.sheet==='E' && walk.seen.right.flip===0, 'right is not the E sheet');
  ck(walk.seen.left.sheet==='E'  && walk.seen.left.flip===1,  'left is not a mirrored E');
  ck(walk.seen.toward.sheet==='S', 'toward the camera is not the S sheet');
  ck(walk.seen.away.sheet==='N',   'away is not the N sheet');
  ck(walk.seen['toward-right'].sheet==='SE' && walk.seen['toward-right'].flip===0, 'SE wrong');
  ck(walk.seen['toward-left'].sheet==='SE'  && walk.seen['toward-left'].flip===1,  'SW is not a mirrored SE');
  ck(walk.moved>0.2, 'he did not cross the floor: '+walk.moved);
  /* INVERTED, not dropped. This used to pin the pack at four sheets of five frames, which was the
     honest description of what had arrived at the time; it is five sheets of twenty-five now, and
     the five-frame version was a quarter of the reason he looked like he was staggering. */
  ck(walk.n===5 && walk.frames===25,
     'the direction set is not 5 sheets of 25: '+walk.n+'/'+walk.frames);

  /* ---------- 8. the v0.324a layout pass ---------- */
  const layout = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), w=cv.clientWidth, h=cv.clientHeight;
    const FR=camFurnRects(w,h);
    const frac=(q)=>({l:+(q.x/w).toFixed(3), r:+((q.x+q.w)/w).toFixed(3),
                      t:+((q.y-q.h)/h).toFixed(3), b:+(q.y/h).toFixed(3)});
    // the back wall's span, which is where a flat window has to live
    const wallL=rmX(0,0), wallR=rmX(1,0);
    return {
      xp:{ l1:xpNeed(1), l5:xpNeed(5), l6:xpNeed(6), l10:xpNeed(10) },
      water:frac(FR.water), food:frac(FR.food), bed:frac(FR.bed),
      // the floor's edges and its line at the depth the FURNITURE stands at, which is a little
      // in front of the wall and therefore a little wider than the wall itself
      fz:SPOT.water.z, floorL:+rmX(0,SPOT.water.z).toFixed(3),
      floorR:+rmX(1,SPOT.water.z).toFixed(3), floorY:+rmY(SPOT.water.z).toFixed(3),
      win:{x:WIN_X,y:WIN_Y,w:WIN_W,h:WIN_H, wallL:+wallL.toFixed(3), wallR:+wallR.toFixed(3),
           backY:ROOM.backY,
           across:+(((WIN_X+WIN_W/2)-wallL)/(wallR-wallL)).toFixed(3)},
      size:(()=>{ const o={};
        for(const [lab,z,lvl] of [['farPup',0,1],['nearPup',1,1],['farOld',0,30],['nearOld',1,30]]){
          const z0=CAM.z, l0=S.lvl, x0=XPANIM.lvl;
          CAM.z=z; S.lvl=lvl; XPANIM.lvl=lvl;
          o[lab]=+dogBodyF().toFixed(4);
          CAM.z=z0; S.lvl=l0; XPANIM.lvl=x0;
        } return o; })()
    };
  });
  console.log('LAYOUT', JSON.stringify(layout));
  // 1. half the XP for the first five levels, full price from six
  // half price, and then a further quarter off that: the opening five are the tutorial
  ck(layout.xp.l1===1.125*(20+8) && layout.xp.l5===1.125*(20+40),
     'levels 1-5 are not at 1.125x: '+layout.xp.l1+'/'+layout.xp.l5);
  ck(layout.xp.l6===3*(20+48), 'level 6 is not back to full price: '+layout.xp.l6);
  /* 2 + 5. INVERTED, not dropped. These pinned the furniture down at the near edge, low and left
     and drawn double size, which was the right answer while it lived there; it is on the FAR WALL
     now, so the same three questions get the opposite answers - it stands on the back floor line,
     it is sized for that depth rather than for the front of the room, and the middle of the wall
     is left clear because that is where the target X is. */
  /* THE BOWLS ONLY, on the back wall. The bed used to stand up here beside them; it is the rug in
     the MIDDLE of the floor now, so these three questions - does it stand on the back floor line,
     is it beside the bowls, is it clear of the target X - all have the opposite answer on purpose
     and are asked of the bed separately below. */
  for(const k of ['water','food']){
    const q=layout[k];
    ck(q.l>=-0.005 && q.r<=1.005, k+' runs off the side: '+JSON.stringify(q));
    ck(q.b<=1.0 && q.t>=0.0, k+' runs off the top or bottom: '+JSON.stringify(q));
    ck(Math.abs(q.b-layout.floorY)<0.006,
       k+' is not standing on the far floor line: bottom '+q.b+' vs '+layout.floorY);
    /* ...and it must be inside the floor AT ITS OWN DEPTH. Measured against the back wall's own
       edges it reads as overhanging, because the floor widens the moment you step forward off it. */
    ck(q.l>=layout.floorL-0.012 && q.r<=layout.floorR+0.012,
       k+' overhangs the floor at z='+layout.fz+': '+JSON.stringify(q)
       +' vs ['+layout.floorL+','+layout.floorR+']');
  }
  ck(layout.water.r<layout.food.l+0.02, 'the bowls overlap');
  /* THE BED, wherever the room says it is. It is a rug lying flat in the middle of the floor: it
     must be well clear of the back wall, centred across the room, and comfortably inside the
     floor at its own depth. It may sit under the target X, which the bowls may not - a cross
     painted on a flat rug is as hittable as one painted on the carpet, and the whole point of
     moving it here was to put his bed in the middle of the picture. */
  ck(layout.bed.b>layout.floorY+0.05,
     'the bed is still up against the back wall: bottom '+layout.bed.b+' vs floor '+layout.floorY);
  ck(layout.bed.b<=1.0 && layout.bed.t>=0.0, 'the bed runs off the top or bottom');
  ck(Math.abs((layout.bed.l+layout.bed.r)/2-0.5)<0.02,
     'the bed is not centred across the room: '+JSON.stringify(layout.bed));
  ck(layout.bed.l>0.10 && layout.bed.r<0.90,
     'the bed reaches the side walls: '+JSON.stringify(layout.bed));
  ck(layout.bed.t>layout.food.b,
     'the bed overlaps the bowls it is supposed to be well clear of');
  /* The target X sits on the back wall, and every throw is aimed at it. Nothing standing may sit
     under it, or half the honest throws foul on a bowl. */
  const markL=0.5-0.055, markR=0.5+0.055;
  for(const k of ['water','food'])
    ck(layout[k].r<markL || layout[k].l>markR,
       k+' is sitting under the target X: '+JSON.stringify(layout[k]));
  /* Sized for the depth it is at: smaller than it drew at the near edge, but a bowl you can still
     read the level of and hit with a thumb. */
  const bwF=layout.water.r-layout.water.l;
  ck(bwF>0.075 && bwF<0.16, 'the bowls are the wrong size for the far wall: '+bwF.toFixed(3));
  // 3. his smallest is now what his biggest used to be, puppy included
  ck(layout.size.farPup>=0.174,
     'a puppy at the back wall is smaller than the old maximum: '+layout.size.farPup);
  ck(layout.size.nearOld>layout.size.farPup*1.5,
     'he no longer grows with depth at all: '+JSON.stringify(layout.size));
  ck(layout.size.nearOld<0.40, 'he is now absurdly large up close: '+layout.size.nearOld);
  // 4. the window is flat on the back wall, 80% across it, clear of the floor line
  ck(layout.win.y+layout.win.h < layout.win.backY,
     'the window crosses the floor line: '+(layout.win.y+layout.win.h)+' vs '+layout.win.backY);
  ck(layout.win.x>layout.win.wallL && layout.win.x+layout.win.w<layout.win.wallR,
     'the window runs off the back wall onto a side wall');
  ck(Math.abs(layout.win.across-0.80)<0.04,
     'the window is not 80% across the back wall: '+layout.win.across);

  console.log('ERRORS:', errs.length?errs:'none');
  /* ---------- the furniture is BEHIND him now ---------- */
  /* It used to be painted last on purpose: at the near edge he stood in front of his own bowls
     and hid the one thing you most need to read. On the far wall the geometry is reversed, so
     the same intent gives the opposite answer and a bowl over a nearer dog would be plainly
     wrong. drawRoomFurniture is a top-level declaration, so the identifier drawCam calls and the
     window property are one binding - swapping it out is enough to time the call. */
  const order = await pg.evaluate(()=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    /* THE SIDE SETS ARE BLITTED AS PER-FRAME CANVASES, not as the source image - stripFrames cuts
       them up at load. A spy that only knows DOGCAMIMG sees nothing at all for a standing dog. */
    const dogs=new Set();
    for(const k in DOGDIR) dogs.add(DOGDIRIMG[k]);
    for(const k in DOGCAMART) for(const f of (DOGIMG[k]||[])) dogs.add(f);
    const seq=[], of_=window.drawRoomFurniture, ob_=window.drawRobot, od=ctx.drawImage.bind(ctx);
    window.drawRoomFurniture=function(){ seq.push('furn'); return of_.apply(this,arguments); };
    window.drawRobot=function(){ seq.push('bot'); return ob_.apply(this,arguments); };
    ctx.drawImage=function(im){ if(dogs.has(im)) seq.push('dog'); return od.apply(ctx,arguments); };
    S.owned.robot=true; ROBOT.state="goto"; ROBOT.x=0.45;
    CAM.state="idle"; CAM.until=99; CAM.x=0.50; CAM.z=0.62; CAM.moving=false; CAM.fi=1;
    try{ drawCam(1.0); }
    finally { ctx.drawImage=od; window.drawRoomFurniture=of_; window.drawRobot=ob_; }
    return {furn:seq.indexOf('furn'), bot:seq.indexOf('bot'), dog:seq.indexOf('dog'),
            seq:seq.slice(0,6)};
  });
  console.log('ORDER ', JSON.stringify(order));
  ck(order.furn>=0, 'the furniture was never drawn');
  ck(order.dog>=0, 'he was never drawn');
  ck(order.bot>=0, 'the bot was never drawn');
  /* It is the furthest thing in the room that is not the room itself, so it goes in first and
     everything else paints over it: the bot standing in front of the bowls he tends, and the dog
     in front of both. The bot was the tell - the bowls were being painted over him. */
  ck(order.furn<order.bot && order.furn<order.dog,
     'the far-wall furniture is still painted over what stands in front of it: '+JSON.stringify(order));
  ck(order.bot<order.dog, 'the bot is drawn over the dog');

  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL ROOM/FETCH CHECKS PASS');
  await b.close();
  process.exit(fails.length?1:0);
})();
