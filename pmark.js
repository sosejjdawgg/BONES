/* THE TARGET THAT RUNS AWAY, AND THE BARS THAT SAY THERE IS MORE.
   Two things that are easy to build and hard to be sure of. A target that relocates is only fun
   if every place it can go is a place the ball can actually get to - and the honest way to know
   that is not to reason about the physics but to THROW at it. A scroll region is only useful if
   it can reach its own last child. Both are measured here, not argued. */
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
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.pts=6; S.pendingStage.length=0;
                          S.tricks={fetch:1,sit:1,jump:1,roll:1}; S.ballOwned=true; });
  await pg.waitForTimeout(700);

  /* ---------- 1. every place the target can go is a place the ball has BEEN ---------- */
  /* The pool is built by throwing, so this is really a check that the sweep did not quietly
     produce an empty or one-sided set - a pool of nothing but floor spots would pass every other
     assertion in this file while the feature did not exist. */
  const pool = await pg.evaluate(()=>{
    const P=markPool();
    const by={floor:0, back:0, left:0, right:0};
    let hzMax=0, hzMin=9;
    for(const m of P){
      by[m.wall||'floor']++;
      if(m.wall){ hzMax=Math.max(hzMax,m.hz); hzMin=Math.min(hzMin,m.hz); }
    }
    const ps={floor:[],back:[],side:[]};
    for(const m of P) ps[m.wall==='back'?'back':m.wall?'side':'floor'].push(m.p);
    const rng=a=>a.length?[+Math.min(...a).toFixed(2),+Math.max(...a).toFixed(2)]:[null,null];
    return {n:P.length, by, hzMin:+hzMin.toFixed(3), hzMax:+hzMax.toFixed(3),
            floorP:rng(ps.floor), sideP:rng(ps.side), backP:rng(ps.back)};
  });
  console.log('POOL  ', JSON.stringify(pool));
  ck(pool.n>=600, 'the pool of places only holds '+pool.n+' spots');
  ck(pool.by.floor>=400, 'only '+pool.by.floor+' of them are on the carpet');
  /* THIS NUMBER CAME DOWN ON PURPOSE, from 60. The side walls used to run the full depth of the
     room, and their near ends - the ones almost level with the camera - are precisely the shots
     that were called out as problematic to hit. Fencing them off costs about half the spots on
     each wall, and that is the fence working rather than the wall disappearing: what still has to
     be true is that there is real variety left, which is what 20-odd distinct spots per wall,
     spread across both depth and height, is. */
  ck(pool.by.left>=20 && pool.by.right>=20,
     'the side walls got '+pool.by.left+'/'+pool.by.right+' spots between them, which is not '+
     'enough variety - the target will keep landing on the same handful');
  ck(pool.by.left+pool.by.right>=50,
     'only '+(pool.by.left+pool.by.right)+' side-wall spots survive the no-go');
  ck(pool.hzMax>0.34, 'nothing on a wall is higher than '+pool.hzMax+
     ' - the tops of the walls have dropped out of the game again');
  /* THE BACK WALL IS IN, AND THIS ASSERTION DID ITS JOB. It used to read "the back wall is empty
     and that is the measurement" - a full-power lob reached z=0 exactly as it landed, so the wall
     could only be touched at carpet height - and it said out loud that if the throw were ever
     retuned this would fail and ask to be looked at. The throw WAS retuned (SLING_DECK_K 0.95 ->
     1.10) precisely so the far wall could be a target, so here is the other half of the promise. */
  ck(pool.by.back>=20,
     'only '+pool.by.back+' spots on the back wall - it is meant to be in the game now');
  ck(pool.backP[0]>0.88,
     'the back wall is cheap now ('+pool.backP[0]+') - it is the furthest surface in the room and '+
     'is supposed to be the power shot');
  /* ...and everything that is NOT the far wall is a pull you would make without thinking. This is
     the whole complaint - wall shots wanted an ungodly amount of power - expressed as a number. */
  ck(pool.sideP[1]<=0.90,
     'a side-wall target still asks for '+pool.sideP[1]+' of the draw');
  ck(pool.floorP[1]<=0.90, 'a floor target asks for '+pool.floorP[1]+' of the draw');

  /* ---------- 2. ...and none of them is under the furniture, off the wall, or IN THE NO-GO ----
     The band nearest the camera and the two strips down the sides are places the throw arrives at
     almost sideways: the cross is there, it is legal, and hitting it is a coin flip you have no
     way to aim. They are out of the pool entirely now, and this is the assertion that keeps them
     out - it is worth saying that these are DELIBERATELY smaller than the floor the ball may use.
     The ball still goes everywhere; only the target is fenced. */
  const legal = await pg.evaluate(()=>{
    const bad=[];
    for(const m of markPool()){
      if(!m.wall){
        /* THE BOWLS ONLY. The bed was in this list while it was a basket against the back wall
           that a ball could foul on; it is a flat rug in the middle of the floor now, and a cross
           on a rug is as hittable as one on the carpet. Keeping it here would have fenced off the
           middle of the room and cost the target a third of its places. */
        for(const k of ['water','food']){
          const p=SPOT[k];
          if(Math.hypot(m.x-p.x,(m.z-p.z)*1.4) < ROOM_R*2.4) bad.push(k+' '+m.x.toFixed(2));
        }
        if(m.z<0.05||m.z>0.74||m.x<0.10||m.x>0.90) bad.push('offfloor '+m.x.toFixed(2)+'/'+m.z.toFixed(2));
        if(m.z>0.55) bad.push('nogo-near z='+m.z.toFixed(2));
        if(m.x<0.18||m.x>0.82) bad.push('nogo-edge x='+m.x.toFixed(2));
      } else if(m.hz<=0.05 || m.hz>0.55) bad.push('wall hz '+m.hz.toFixed(2));
      else if(m.wall!=='back' && m.z>=0.50) bad.push('nogo-wall z='+m.z.toFixed(2));
    }
    // ...and none of them is drawn off the top of the room or below its own floor line
    let above=0, below=0;
    for(const m of markPool()){
      const P=markScreenPt(m);
      if(P.y < ROOM.wallTop) above++;
      if(P.y > 1.01) below++;
    }
    return {bad:bad.slice(0,6), n:bad.length, above, below};
  });
  console.log('LEGAL ', JSON.stringify(legal));
  ck(legal.n===0, legal.n+' illegal spots in the pool: '+JSON.stringify(legal.bad));
  ck(legal.above===0, legal.above+' spots draw above the ceiling');
  ck(legal.below===0, legal.below+' spots draw below the floor');

  /* ...and fencing it did not fence it out of existence. A no-go that swallows the carpet would
     satisfy every assertion above by leaving three spots in the pool. */
  const spread = await pg.evaluate(()=>{
    const P=markPool().filter(m=>!m.wall);
    const xs=P.map(m=>m.x), zs=P.map(m=>m.z);
    return {n:P.length, x0:+Math.min(...xs).toFixed(2), x1:+Math.max(...xs).toFixed(2),
            z0:+Math.min(...zs).toFixed(2), z1:+Math.max(...zs).toFixed(2)};
  });
  console.log('SPREAD', JSON.stringify(spread));
  ck(spread.x1-spread.x0>0.5, 'the carpet targets only span '+(spread.x1-spread.x0)+' across');
  ck(spread.z1-spread.z0>0.3, 'the carpet targets only span '+(spread.z1-spread.z0)+' deep');

  /* ---------- 3. IT IS REACHABLE. Not by argument - by throwing at it. ---------- */
  /* Place the target a hundred times and, for each placement, sweep real throws until one hits it
     using the game's own hit tests. If a single placement survives the whole sweep unhit, the
     target can be painted somewhere no player can ever clear it. */
  const reach = await pg.evaluate(()=>{
    const hitFloor=(m,x,z)=> !m.wall && Math.hypot(x-m.x,(z-m.z)*1.3) < MARK_FLOOR_R;
    const hitWall=(m,wall,x,z,hz)=>{
      if(m.wall!==wall) return false;
      const along = wall==="back" ? Math.abs(x-m.x) : Math.abs(z-m.z);
      return Math.hypot(along/MARK_WALL_RX,(hz-m.hz)/MARK_WALL_RH) <= 1;
    };
    // one throw, integrated exactly as the flight branch does it, reporting whether it found m
    const throwAt=(m,ang,p,sx)=>{
      const dt=1/60, ux=Math.sin(ang), uy=-Math.cos(ang);
      let x=sx, z=SPOT.near.z, hz=0.02;
      let vx=clamp(ux*p*SLING_DECK_K,-FLICK_MAX,FLICK_MAX);
      let vz=clamp(uy*p*SLING_DECK_K,-FLICK_MAX,FLICK_MAX);
      let vh=slingLoft(p)*SLING_DECK_UP*(0.30+0.70*Math.max(0,-uy));
      for(let i=0;i<300;i++){
        vh-=BALL_G*dt; hz+=vh*dt; x+=vx*dt; z+=vz*dt;
        if(x<BALL_R){ x=BALL_R; if(hitWall(m,"left",x,z,hz)) return true; vx=Math.abs(vx)*0.72; }
        else if(x>1-BALL_R){ x=1-BALL_R; if(hitWall(m,"right",x,z,hz)) return true; vx=-Math.abs(vx)*0.72; }
        if(z<BALL_R){ z=BALL_R; if(hitWall(m,"back",x,z,hz)) return true; vz=Math.abs(vz)*0.72; }
        if(z>1-BALL_R*0.5){ z=1-BALL_R*0.5; vz=-Math.abs(vz)*0.6; }
        if(hz<=0) return hitFloor(m,x,z);
        vx*=(1-0.55*dt); vz*=(1-0.55*dt);
      }
      return false;
    };
    const unreachable=[]; let kinds={floor:0,back:0,left:0,right:0}; let moved=0, tried=0;
    for(let n=0;n<100;n++){
      const was={x:MARK.x,z:MARK.z,hz:MARK.hz,wall:MARK.wall};
      markPlace();
      tried++;
      if(markDist(MARK,was)>MARK_MOVE_MIN) moved++;
      kinds[MARK.wall||'floor']++;
      const m={x:MARK.x,z:MARK.z,hz:MARK.hz,wall:MARK.wall};
      /* SWEPT FROM EVERY LAUNCH SPOT THE PLAYER HAS, not just the middle: the ball is dragged to
         where you want it before the flick, and carrying it over to the left wall before letting
         go is an ordinary thing to do. What is being proved is that SOME legitimate throw hits
         the target - not that the laziest one does. */
      let got=false;
      for(const sx of [0.12,0.30,0.50,0.70,0.88]){
        if(got) break;
        for(let a=-30;a<=30 && !got;a++)
          for(let p=6;p<=20 && !got;p++)
            if(throwAt(m, a/30*1.2, p/20, sx)) got=true;
      }
      if(!got) unreachable.push(m);
    }
    return {tried, moved, kinds, un:unreachable.length, ex:unreachable.slice(0,3)};
  });
  console.log('REACH ', JSON.stringify(reach));
  ck(reach.un===0, reach.un+' of '+reach.tried+' placements cannot be hit by any throw: '
     +JSON.stringify(reach.ex));
  ck(reach.moved>=reach.tried*0.9,
     'only '+reach.moved+' of '+reach.tried+' placements actually moved somewhere else');
  ck(reach.kinds.floor>=30 && reach.kinds.floor<=80,
     'the floor/wall mix is off: '+JSON.stringify(reach.kinds));
  ck(reach.kinds.back+reach.kinds.left+reach.kinds.right>=20,
     'the target almost never goes up a wall: '+JSON.stringify(reach.kinds));

  /* ---------- 4. a hit pops it and moves it; a near miss does neither ---------- */
  const pop = await pg.evaluate(()=>{
    const o={};
    const put=(x,z)=>{ MARK.x=x; MARK.z=z; MARK.hz=0; MARK.wall=null; };
    // a ball that comes down ON the cross
    put(0.50,0.30);
    const at={x:MARK.x,z:MARK.z};
    FETCH.live=true; FETCH.banks=0; FETCH.foul=false;
    BALL.x=0.50; BALL.z=0.30; BALL.hz=0; BALL.vh=0; BALL.vx=0; BALL.vz=0;
    MARKPOP.t=0;
    fetchLand();
    o.onLabel=FETCH.label; o.onPop=MARKPOP.t>0;
    o.onMoved=Math.hypot(MARK.x-at.x,MARK.z-at.z)>0.001 || !!MARK.wall;
    // ...and one that lands a foot away: scored generously, but the cross is untouched
    put(0.50,0.30); MARKPOP.t=0;
    const at2={x:MARK.x,z:MARK.z,wall:MARK.wall};
    FETCH.live=true; FETCH.banks=0; FETCH.foul=false;
    BALL.x=0.50; BALL.z=0.53; BALL.hz=0; BALL.vh=0;
    fetchLand();
    o.nearLabel=FETCH.label; o.nearPop=MARKPOP.t>0;
    o.nearMoved=Math.hypot(MARK.x-at2.x,MARK.z-at2.z)>0.001 || MARK.wall!==at2.wall;
    // a wall cross, struck in flight
    MARK.wall="back"; MARK.x=0.50; MARK.z=0; MARK.hz=0.30; MARKPOP.t=0;
    const at3={x:MARK.x,hz:MARK.hz};
    FETCH.live=true; FETCH.good=false;
    BALL.x=0.50; BALL.z=BALL_R*0.5; BALL.hz=0.30; BALL.vz=-0.5; BALL.vx=0; BALL.vh=0;
    ballWalls(1/60);
    o.wallLabel=FETCH.label; o.wallGood=FETCH.good; o.wallPop=MARKPOP.t>0;
    o.wallLive=FETCH.live;
    o.wallMoved=(MARK.wall!=="back")||Math.abs(MARK.x-at3.x)>0.001||Math.abs(MARK.hz-at3.hz)>0.001;
    // ...and the same wall, missed by a foot of height
    MARK.wall="back"; MARK.x=0.50; MARK.z=0; MARK.hz=0.30; MARKPOP.t=0;
    FETCH.live=true; FETCH.good=false; FETCH.label="";
    BALL.x=0.50; BALL.z=BALL_R*0.5; BALL.hz=0.05; BALL.vz=-0.5;
    ballWalls(1/60);
    o.wallMissPop=MARKPOP.t>0; o.wallMissGood=FETCH.good;
    MARK.wall=null; MARK.x=0.5; MARK.z=0.11; MARK.hz=0; FETCH.live=false; MARKPOP.t=0;
    return o;
  });
  console.log('POP   ', JSON.stringify(pop));
  ck(pop.onLabel==='DIRECT', 'a ball landing on the cross scored "'+pop.onLabel+'"');
  ck(pop.onPop===true, 'landing on the cross did not pop it');
  ck(pop.onMoved===true, 'the cross popped and then stayed exactly where it was');
  ck(pop.nearLabel==='CLOSE', 'a ball a foot away scored "'+pop.nearLabel+'"');
  ck(pop.nearPop===false, 'a near miss popped the cross');
  ck(pop.nearMoved===false, 'a near miss moved the cross');
  ck(pop.wallGood===true, 'striking the wall cross did not score');
  ck(pop.wallLabel==='BULLSEYE!', 'the wall strike read "'+pop.wallLabel+'"');
  ck(pop.wallPop===true && pop.wallMoved===true, 'the wall cross did not pop and move');
  ck(pop.wallLive===false,
     'the throw is still live after finding the target - the landing will score it a second time');
  ck(pop.wallMissPop===false && pop.wallMissGood===false,
     'a ball hitting the wall well under the cross counted as a hit');

  /* ---------- 5. the tree panel, and everything else, can reach its own last child ---------- */
  await pg.evaluate(()=>{ openSkillPanel(); });
  await pg.waitForTimeout(900);
  const scroll = await pg.evaluate(()=>{
    const body=document.getElementById('treeBody');
    const rows=document.getElementById('skillRows');
    const cv=document.getElementById('treecv');
    const canScroll=body.scrollHeight-body.clientHeight;
    body.scrollTop=body.scrollHeight;                 // ...and it really does go there
    const at=body.scrollTop;
    const r=rows.getBoundingClientRect(), p=body.getBoundingClientRect();
    body.scrollTop=0;
    return { over:Math.round(canScroll), landed:Math.round(at),
             rowsBottom:Math.round(r.bottom), panelBottom:Math.round(p.bottom),
             cvH:Math.round(cv.clientHeight), cvW:Math.round(cv.clientWidth),
             rowsN:rows.children.length };
  });
  console.log('SCROLL', JSON.stringify(scroll));
  ck(scroll.cvH>100 && scroll.cvW>100,
     'the tree canvas collapsed inside the scroller: '+scroll.cvW+'x'+scroll.cvH);
  ck(scroll.rowsN>=3, 'the attribute rows never rendered: '+scroll.rowsN);
  ck(scroll.over>0, 'the tree body does not overflow at all, so nothing is being tested');
  ck(scroll.landed>=scroll.over-1, 'the tree body would not scroll to its end: '
     +scroll.landed+' of '+scroll.over);
  ck(scroll.rowsBottom<=scroll.panelBottom+2,
     'the last attribute row sits '+(scroll.rowsBottom-scroll.panelBottom)+'px past the panel');

  /* ...and there is a bar on it that a person can SEE, which the platform's own is not: iOS
     ignores ::-webkit-scrollbar and every other engine fades its overlay out when you stop. */
  const bar = await pg.evaluate(()=>{
    const body=document.getElementById('treeBody');
    sbarSync(body);
    const S=body.__sbar; if(!S) return {none:true};
    const H=parseFloat(S.bar.style.height), th=parseFloat(S.th.style.height);
    const top0=S.th.style.transform;
    body.scrollTop=body.scrollHeight; sbarSync(body);
    const top1=S.th.style.transform;
    const at1=parseFloat(top1.replace(/[^0-9.\-]/g,''));
    body.scrollTop=0; sbarSync(body);
    return { shown:S.bar.style.display, trackH:Math.round(H), thumbH:Math.round(th),
             moved:top0!==top1, atEnd:Math.round(at1), room:Math.round(H-th) };
  });
  console.log('BAR   ', JSON.stringify(bar));
  ck(!bar.none, 'the tree body never got a scrollbar attached');
  ck(bar.shown==='block', 'the scrollbar on an overflowing panel is not displayed');
  ck(bar.thumbH>0 && bar.thumbH<bar.trackH,
     'the thumb fills its whole track, so it says nothing: '+bar.thumbH+'/'+bar.trackH);
  ck(bar.moved===true, 'the thumb did not move when the panel was scrolled');
  ck(Math.abs(bar.atEnd-bar.room)<=1,
     'scrolled to the bottom, the thumb stopped '+(bar.room-bar.atEnd)+'px short of the end');
  /* and it is inert: a bar sitting over a list of buttons that can take a tap is a bug */
  const inert = await pg.evaluate(()=>
    getComputedStyle(document.getElementById('treeBody').__sbar.bar).pointerEvents);
  ck(inert==='none', 'the scrollbar takes pointer events ('+inert+') and can swallow a tap');

  /* every other scrolling region got one too, and none of them is cut off */
  const others = await pg.evaluate(()=>{
    const out=[];
    for(const el of document.querySelectorAll('.pscroll,#resLines,#preLines,#careGuidePanel .lines,#home .body')){
      const cs=getComputedStyle(el);
      out.push({id:el.id||el.className, oy:cs.overflowY});
    }
    return out;
  });
  console.log('OTHER ', JSON.stringify(others.map(o=>o.id+':'+o.oy)));
  for(const o of others) ck(o.oy==='auto'||o.oy==='scroll', o.id+' does not scroll: '+o.oy);

  await pg.evaluate(()=>{ document.getElementById('skillPanel').classList.remove('show'); });
  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npmark PASS');
})();
