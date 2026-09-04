/* THE TRICK TREE, AND THE TWO GESTURES.
   Four unlocks bought with the same points the attributes use. FETCH is the load-bearing one: it
   is what puts a ball in the room at all, so a fresh dog has nothing to throw until the very first
   point is spent. SIT and ROLL are gestures on his body, read off the whole travel of the finger
   rather than the last frame, so petting him cannot set him rolling. */
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
  await pg.waitForTimeout(600);

  /* ---------- 1. a fresh dog knows nothing, and has no ball ---------- */
  /* INVERTED, not dropped. These pinned a flat four-entry list, which is what the tree was for one
     version; it is a graph now - one free root with a branch of his own body down one side and a
     branch of his care down the other - so the questions become shape questions. */
  const fresh = await pg.evaluate(()=>{
    const by={}; for(const t of TRICKS) by[t.k]=t;
    return { tricks:JSON.stringify(S.tricks||{}), owned:S.ballOwned,
      n:TRICKS.length, root:TRICKS.filter(t=>!t.req).map(t=>t.k),
      rootFree:by.bond&&by.bond.cost===0, rootHeld:hasTrick("bond"),
      jumpReq:by.jump.req, rollReq:by.roll.req,
      fetchReq:by.fetch.req, sitReq:by.sit.req,
      real:TRICKS.filter(t=>!t.soon&&!t.root).map(t=>t.k),
      soon:TRICKS.filter(t=>t.soon).length,
      dog:TRICKS.filter(t=>t.side==="dog").length,
      care:TRICKS.filter(t=>t.side==="care").length,
      // every node must hang off something, or it is unreachable
      orphans:TRICKS.filter(t=>t.req && !by[t.req]).map(t=>t.k),
      costs:TRICKS.filter(t=>!t.root).map(t=>t.cost) };
  });
  console.log('FRESH ', JSON.stringify(fresh));
  ck(fresh.tricks==='{}', 'a new dog already knows tricks: '+fresh.tricks);
  ck(fresh.owned===false, 'a new dog has a ball before FETCH is bought');
  ck(fresh.root.join(',')==='bond', 'the tree has more than one root: '+fresh.root.join(','));
  ck(fresh.rootFree && fresh.rootHeld, 'the root is not free and already held');
  ck(fresh.orphans.length===0, 'these nodes hang off nothing: '+fresh.orphans.join(','));
  ck(fresh.real.join(',')==='fetch,sit,jump,roll',
     'the four working unlocks are not the four asked for: '+fresh.real.join(','));
  ck(fresh.soon>=4, 'only '+fresh.soon+' placeholders on the tree');
  ck(fresh.dog>=4 && fresh.care>=4,
     'the two branches are lopsided: '+fresh.dog+' dog / '+fresh.care+' care');
  ck(fresh.costs.every(c=>c>=1), 'a node costs nothing: '+fresh.costs);
  ck(fresh.fetchReq==='bond' && fresh.sitReq==='bond',
     'the two first tricks do not grow out of the root');
  ck(fresh.jumpReq==='fetch', 'JUMP CATCH does not need FETCH first');
  ck(fresh.rollReq==='sit',   'ROLL does not need SIT first');

  /* ...and the tree draws itself, with a hit target for every node */
  const draw = await pg.evaluate(()=>{
    S.pts=3; S.tricks={fetch:1,sit:1}; openSkillPanel();
    drawTree(1.0);
    const cv=document.querySelector('#treecv');
    const o={ hits:TREEHIT.length, nodes:TRICKS.length, sel:TREESEL,
              w:cv.clientWidth, h:cv.clientHeight,
              inside:TREEHIT.every(n=>n.x>0&&n.x<cv.clientWidth&&n.y>0&&n.y<cv.clientHeight),
              minGap:(()=>{ let m=1e9;
                for(let i=0;i<TREEHIT.length;i++) for(let j=i+1;j<TREEHIT.length;j++)
                  m=Math.min(m,Math.hypot(TREEHIT[i].x-TREEHIT[j].x,TREEHIT[i].y-TREEHIT[j].y));
                return Math.round(m); })(),
              r:Math.round(TREEHIT[0].r) };
    document.querySelector('#skillPanel').classList.remove('show');
    return o;
  });
  console.log('DRAW  ', JSON.stringify(draw));
  ck(draw.hits===draw.nodes, 'only '+draw.hits+' of '+draw.nodes+' nodes are tappable');
  ck(draw.inside, 'a node is drawn off the edge of the canvas');
  ck(draw.minGap>draw.r*0.9,
     'two nodes are '+draw.minGap+'px apart with a '+draw.r+'px hit radius - they overlap');
  ck(!!draw.sel, 'opening the tree selected nothing, so the readout is blank');

  /* ---------- 2. the tree has a shape, and points are real ---------- */
  const buy = await pg.evaluate(()=>{
    S.pts=0; S.tricks={};
    const o={};
    learnTrick("fetch");  o.brokeNoPts=!!(S.tricks.fetch);   // no points: nothing happens
    S.pts=1;
    learnTrick("jump");   o.lockedFirst=!!(S.tricks.jump);   // needs FETCH: still nothing
    o.ptsAfterLocked=S.pts;
    learnTrick("fetch");  o.gotFetch=!!S.tricks.fetch; o.ptsAfterFetch=S.pts;
    o.ball=S.ballOwned; o.ballIn=!BALL.off; o.ballAir=BALL.hz>0.05;
    learnTrick("fetch");  o.ptsAfterRebuy=S.pts;             // already learned: free, and no-op
    S.pts=1; learnTrick("jump"); o.gotJump=!!S.tricks.jump;
    S.pts=1; learnTrick("roll"); o.rollBeforeSit=!!S.tricks.roll;
    S.pts=2; learnTrick("sit"); learnTrick("roll");
    o.gotSit=!!S.tricks.sit; o.gotRoll=!!S.tricks.roll; o.ptsEnd=S.pts;
    return o;
  });
  console.log('BUY   ', JSON.stringify(buy));
  ck(buy.brokeNoPts===false, 'a trick was learned with no points to spend');
  ck(buy.lockedFirst===false && buy.ptsAfterLocked===1,
     'JUMP CATCH was bought before FETCH, or charged for the attempt');
  ck(buy.gotFetch===true && buy.ptsAfterFetch===0, 'FETCH did not cost its point');
  ck(buy.ball===true && buy.ballIn===true, 'buying FETCH did not put a ball in the room');
  ck(buy.ballAir===true, 'the new ball did not arrive with a bounce in it');
  ck(buy.ptsAfterRebuy===0, 'a trick already learned was charged for again');
  ck(buy.gotJump===true, 'JUMP CATCH would not unlock once FETCH was in');
  ck(buy.rollBeforeSit===false, 'ROLL unlocked without SIT');
  ck(buy.gotSit===true && buy.gotRoll===true && buy.ptsEnd===0,
     'the SIT->ROLL branch did not complete: '+JSON.stringify(buy));

  /* ---------- 3. the gestures ---------- */
  /* Read off the WHOLE travel from where the finger went down. A stroke that wanders must not
     count, and neither axis may fire on a gesture that is mostly the other one. */
  const gest = await pg.evaluate(()=>{
    const g=(dx,dy)=>{ PET.sx=0.5; PET.sy=0.5; return dogGesture(0.5+dx,0.5+dy); };
    return { down:g(0,0.14), up:g(0,-0.14), right:g(0.14,0), left:g(-0.14,0),
             tiny:g(0,0.03), diagonal:g(0.12,0.11), min:GEST_MIN };
  });
  console.log('GEST  ', JSON.stringify(gest));
  ck(gest.down==='sit',  'swiping down on him is not SIT: '+gest.down);
  ck(gest.up===null,     'swiping UP on him does something: '+gest.up);
  /* REFINED, not relaxed: the sideways swipe still means ROLL, but it now has to say WHICH WAY,
     because he travels while he rolls and a roll with no direction has nowhere to go. */
  ck(gest.right==='rollR' && gest.left==='rollL',
     'a sideways swipe does not carry its direction: '+gest.right+'/'+gest.left);
  ck(gest.tiny===null,   'a stroke of '+gest.min+' counted as a gesture: '+gest.tiny);
  ck(gest.diagonal===null, 'a diagonal wander fired a trick: '+gest.diagonal);

  /* ...and they only work once he has been taught them */
  const doit = await pg.evaluate(()=>{
    const reset=()=>{ CAM.state="idle"; CAM.until=99; CAM.x=0.5; CAM.z=0.6; CAM.lz=0;
                      CAM.leap=null; PARTY.on=false; CAM.rollT=0; };
    const o={};
    S.tricks={};
    S.tricks={fetch:1,sit:1,jump:1,roll:1};
    reset(); dogDoSit();  o.sit=CAM.state;
    reset(); dogDoRoll(); o.roll=CAM.state;
    // ...and the roll plays ONCE, through its own frames, and puts him back on his feet
    const seen=new Set(); let fell=false;
    for(let i=0;i<Math.ceil(ROLL_T*70);i++){
      camBehavior(1/60);
      if(CAM.state==="roll") seen.add(CAM.fi); else { fell=true; break; }
    }
    o.frames=seen.size; o.after=CAM.state; o.ended=fell;
    o.n=DOGCAMART.roll.n; o.body=DOGCAMART.roll.body;
    o.art=CAMFRAME.roll;
    // he will not roll in the middle of something that matters
    reset(); CAM.state="leap"; o.duringLeap=dogDoRoll();
    reset(); CAM.state="rest"; o.duringRest=dogDoRoll();
    reset();
    return o;
  });
  console.log('DO    ', JSON.stringify(doit));
  ck(doit.sit==='begwait', 'SIT did not sit him: '+doit.sit);
  ck(doit.roll==='roll', 'ROLL did not start: '+doit.roll);
  ck(doit.art==='roll', 'the roll does not use the roll strip: '+doit.art);
  ck(doit.n>=5, 'the roll strip is only '+doit.n+' frames');
  ck(doit.body===80, 'the roll strip is stored at body '+doit.body+', not the shared 80');
  ck(doit.frames>=doit.n-1, 'the roll played only '+doit.frames+' of its '+doit.n+' frames');
  ck(doit.ended===true && doit.after!=='roll', 'the roll loops instead of playing once');
  ck(doit.duringLeap===false, 'he rolled out of a leap');
  ck(doit.duringRest===false, 'he rolled out of his bed');

  /* ---------- 4. no ball, no throw ---------- */
  const noball = await pg.evaluate(()=>{
    S.tricks={}; S.ballOwned=false; BALL.off=true;
    const cv=document.querySelector('#dogcv'), r=cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+r.width*0.3,
      clientY:r.top+r.height*0.8, pointerId:9, bubbles:true, pointerType:'touch'}));
    const o={held:BALL.held, shown:marksShown(), teach:slingTeaching()};
    cv.dispatchEvent(new PointerEvent('pointerup',{pointerId:9,bubbles:true}));
    S.tricks={fetch:1,sit:1,jump:1,roll:1}; S.ballOwned=true; BALL.off=false;
    return o;
  });
  console.log('NOBALL', JSON.stringify(noball));
  ck(noball.held===false, 'a ball he does not own was picked up');
  ck(noball.shown===0, 'the target is up for a dog with no ball');
  ck(noball.teach===false, 'the drag prompt is up for a dog with no ball');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>f&&console.log('  - '+f)); process.exit(1); }
  console.log('\nptrick PASS');
})();
