const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
const F='file://'+__dirname+'/bones-v0.346a.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };

/* Every state DOGCAM can put him in, driven through the real drawCam, measured three ways:
   is the art full colour, is he the same size in every pose, and do his feet touch the floor. */
const STATES=['idle','walk','sniff','rest','bedsleep','come','chase','zoomies','bark',
              'beg','begwait','stay','drinkgo','eatgo','beggo','treatgo',
              'drink','eat','treateat','leap','catch','shake'];

(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1500);
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.ballOwned=true; });
  await pg.waitForTimeout(800);

  /* ---------- 1. the sets themselves ---------- */
  const sets = await pg.evaluate(()=>{
    const tone=(im)=>{
      const w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const x=c.getContext('2d'); x.drawImage(im,0,0);
      const p=x.getImageData(0,0,w,h).data, seen=new Set(); let ink=0, op=0;
      for(let i=0;i<p.length;i+=4){ if(p[i+3]<20) continue; op++;
        seen.add((p[i]>>3)+','+(p[i+1]>>3)+','+(p[i+2]>>3));
        if(p[i]===14&&p[i+1]===14&&p[i+2]===18) ink++; }
      return {tones:seen.size, ink:+(100*ink/op).toFixed(1), op};
    };
    const o={};
    for(const k of Object.keys(DOGCAMART))
      o[k]={n:DOGIMG[k].length, art:DOGIMG[k].__art===DOGCAMART[k],
            body:DOGCAMART[k].body, h:DOGCAMART[k].h, foot:DOGCAMART[k].foot,
            tone:tone(DOGIMG[k][Math.min(1,DOGIMG[k].length-1)])};
    o.__robot=tone(ROBOTIMG[0]);
    return o;
  });
  console.log('SETS   ', JSON.stringify(sets));
  const keys=Object.keys(sets).filter(k=>k[0]!=='_');
  ck(keys.length>=7, 'only '+keys.length+' art sets built');
  for(const k of keys){
    ck(sets[k].art, k+' did not take the new art');
    ck(sets[k].tone.tones>8, k+' is quantized to '+sets[k].tone.tones+' tones');
    ck(sets[k].tone.ink<20, k+' is '+sets[k].tone.ink+'% flat ink');
    ck(sets[k].body===80, k+' has body '+sets[k].body+', not the shared 80');
    ck(sets[k].foot<=sets[k].h, k+' floor line is below its own image');
  }
  // the run/fetch/call set - the one that was reported - specifically
  ck(sets.come && sets.come.n>=3, 'the trot set is missing or too short: '+(sets.come&&sets.come.n));
  ck(sets.__robot.tones<=6, 'the bot came off the LCD: '+sets.__robot.tones+' tones');

  /* ---------- 2. no DOGCAM state still reaches for the park strips ----------
     The park art is a near-black silhouette by design. Identify it by object identity, through
     the per-frame canvases stripFrames made, rather than by guessing at pixels. */
  const src = await pg.evaluate((STATES)=>{
    const parkWalk=new Set(DOGIMG.walk), out={};
    for(const st of STATES){
      CAM.state=st; CAM.fetchPhase=0; CAM.fi=1;
      const fkey = st==="fetch" ? (CAM.fetchPhase===4?"idle":"come")
                 : st==="wash"  ? (WASH.heat>0.05?"shake":"idle")
                 : (CAMFRAME[st]||st);
      const frames=DOGIMG[fkey]||DOGIMG.idle;
      out[st]={fkey, art:!!frames.__art, park:frames.some(f=>parkWalk.has(f)), n:frames.length};
    }
    CAM.state="idle";
    return out;
  }, STATES);
  console.log('STATE  ', JSON.stringify(src));
  const LEGACY=['catch','shake'];   // no new art supplied for these two
  for(const st of STATES){
    ck(!src[st].park, st+' still draws the DOGPARK silhouette');
    if(!LEGACY.includes(st)) ck(src[st].art, st+' resolves to "'+src[st].fkey+'", which has no new art');
  }

  /* ---------- 3. one dog, one size, feet on the floor ----------
     Drive the REAL drawCam and read the blit. A per-state dhF used to set the whole sprite height,
     so a set whose image is mostly air (the jump strip) or mostly floor (the lying one) came out
     the wrong size. Now `body` does it, and this proves it end to end. */
  const geom = await pg.evaluate((STATES)=>{
    const cv=document.querySelector('#dogcv'), ctx=cv.getContext('2d');
    const [, w, h]=[0, cv.clientWidth, cv.clientHeight];
    // The floor is a PLANE now, so "the floor" is wherever he happens to be standing on it. It has
    // to be read per state, immediately before the draw: the page's own frame loop runs between
    // evaluates and walks him a little, which is enough to make one captured value stale.
    const byImg=new Map();
    for(const k of Object.keys(DOGCAMART)) for(const f of DOGIMG[k]) byImg.set(f,k);
    // ...and the directional strips, which are blitted whole with a source rect (nine arguments)
    // rather than as per-frame canvases (five). A spy that only knows the five-argument form sees
    // nothing at all for every state that walks, which reads as "the sprite vanished".
    const byDir=new Map();
    for(const k of Object.keys(DOGDIR)) byDir.set(DOGDIRIMG[k],k);
    const out={};
    const od=ctx.drawImage.bind(ctx);
    for(const st of STATES){
      // frame 11 for the leap: frames 0-6 and 16-24 of the jump strip are GROUNDED, so probing
      // "is he airborne" at frame 1 asks the question of a frame whose feet are meant to be down
      /* CAM.moving is the condition the walk sheets are gated on, and it is set by camBehavior on
         any frame he actually takes a step. The harness does not run camBehavior, so it has to
         state the case it is testing: a walking state, mid-step. Left to chance it samples
         whatever the page's own frame loop happened to leave behind. */
      CAM.state=st; CAM.fetchPhase=0; CAM.fi=(st==="leap"?11:1); CAM.lz=0; CAM.leapK=1;
      CAM.moving=['walk','come','chase','zoomies','drinkgo','eatgo','beggo','treatgo'].includes(st);
      CAM.leap = st==="leap" ? {ph:"air",t:0,lzMax:0,tx:0.5,caught:false} : null;
      let hit=null;
      ctx.drawImage=function(im,a1,a2,a3,a4,a5,a6,a7,a8){
        if(arguments.length===5){
          const k=byImg.get(im);
          if(k) hit={k,dx:a1,dy:a2,dw:a3,dh:a4,dir:false};
        } else if(arguments.length===9){
          const k=byDir.get(im);
          if(k) hit={k,dx:a5,dy:a6,dw:a7,dh:a8,dir:true};
        }
        return od.apply(ctx,arguments);
      };
      const gy=rmY(CAM.z)*h;
      drawCam(1.0);
      ctx.drawImage=od;
      if(!hit){ out[st]=null; continue; }
      const a=hit.dir?DOGDIR[hit.k]:DOGCAMART[hit.k];
      /* THE FRAME THE DRAW USED, AND THE FOOT LINE IT USED WITH IT. The walk sheets are indexed by
         walkPh, not by CAM.fi, and since v0.335a each frame is hung from ITS OWN lowest paw rather
         than from one number for the whole sheet - the art's lowest row moves 6-7px across a
         cycle. Reading a.foot here made this assertion pass or fail on which frame happened to be
         up when the probe ran, which is the definition of a flake. */
      const fi = hit.dir ? ((((CAM.walkPh|0)%a.n)+a.n)%a.n) : (((CAM.fi%a.n)+a.n)%a.n);
      const feet = hit.dir ? dogDirFeet(hit.k) : null;
      const anchor = (feet && feet[fi]) || a.foot;
      /* TWO DIFFERENT QUESTIONS. The set's FLOOR LINE always lands on gy - that is the anchoring
         rule and it is true by construction, so asserting it proves nothing about the leap. His
         actual FEET are lift[fi] above that line, and "is he airborne" is a question about the
         feet. Measuring the line and calling it the feet is what made the leap look grounded. */
      out[st]={k:hit.k, fi,
               body:+(hit.dh*a.body/a.h).toFixed(1),          // his standing height on screen
               line:+(hit.dy+hit.dh*(anchor/a.h)).toFixed(1),  // where the frame's floor line landed
               feet:+(hit.dy+hit.dh*((anchor-((a.lift&&a.lift[fi])||0))/a.h)).toFixed(1),
               dir:!!hit.dir, gy:+gy.toFixed(1)};
    }
    CAM.state="idle"; CAM.leap=null;
    return out;
  }, STATES);
  console.log('GEOM   ', JSON.stringify(geom));
  const bodies=Object.values(geom).filter(Boolean).map(g=>g.body);
  ck(bodies.length>=20, 'only '+bodies.length+' states blitted a known set');
  /* THE WALKING STATES MUST BE ON THE WALK SHEETS. That is the whole point of the direction art:
     anything crossing the floor under its own steam should be drawn facing where it is going. */
  const WALKY=['walk','come','chase','zoomies','drinkgo','eatgo','beggo','treatgo'];
  for(const st of WALKY) if(geom[st]) ck(geom[st].dir===true,
    st+' is not drawn from the directional set: '+geom[st].k);
  /* ONE SIZE, FULL STOP - and this used to be two separate checks, one per family, because the
     walk sheets were stored at their own body target AND had the room's depth multiplied in a
     second time on top of the depth dogBodyF() already carries. He grew by a third the instant he
     started walking at the near edge. Both families share the one stored body now, so the whole
     set of poses is checked against each other at a single depth. */
  ck(Math.max(...bodies)-Math.min(...bodies)<1.0,
     'he changes size between poses: '+Math.min(...bodies)+' to '+Math.max(...bodies)
     +' :: '+JSON.stringify(Object.fromEntries(Object.entries(geom)
        .filter(([,g])=>g).map(([k,g])=>[k,g.body]))));
  for(const st in geom){
    const g=geom[st]; if(!g) continue;
    ck(Math.abs(g.line-g.gy)<1.5, st+' is not hung from the floor line: '+g.line+' vs '+g.gy);
    if(st==='leap') continue;                    // deliberately off the floor
    ck(Math.abs(g.feet-g.gy)<1.5, st+' does not stand on the floor: feet '+g.feet+' vs '+g.gy);
  }
  /* ...and the leap, at its apex, must be the one that IS off it. Measured against HIS OWN BODY
     rather than a pixel count: he draws about a third the size in the room that he did on the old
     flat elevation, so a fixed 20px threshold silently became "half a dog" and then failed. */
  if(geom.leap) ck(geom.leap.feet < geom.leap.gy - geom.leap.body*0.25,
    'the leap apex is not airborne: feet '+geom.leap.feet+' vs floor '+geom.leap.gy
    +' (body '+geom.leap.body+')');

  /* ---------- 4. a picture of every state, in the real room ---------- */
  const shots = await pg.evaluate((STATES)=>{
    const cv=document.querySelector('#dogcv'), out=[];
    for(const st of STATES){
      CAM.state=st; CAM.fetchPhase=0; CAM.fi=(st==="leap"?11:1); CAM.x=0.30; CAM.dir=1; CAM.lz=0; CAM.leapK=1;
      CAM.moving=['walk','come','chase','zoomies','drinkgo','eatgo','beggo','treatgo'].includes(st);
      CAM.leap = st==="leap" ? {ph:"air",t:0,lzMax:0,tx:0.5,caught:false} : null;
      drawCam(1.0);
      out.push([st, cv.toDataURL('image/png')]);
    }
    CAM.state="idle"; CAM.leap=null;
    return out;
  }, STATES);
  fs.mkdirSync('camshots',{recursive:true});
  for(const [st,url] of shots)
    fs.writeFileSync('camshots/'+st+'.png', Buffer.from(url.split(',')[1],'base64'));
  console.log('SHOTS  ', shots.length);

  console.log('ERRORS:', errs.length?errs:'none');
  /* ---------- the walk pack itself ---------- */
  const dirs = await pg.evaluate(()=>{
    const o={keys:Object.keys(DOGDIR), map:DOGDIR_MAP.map(m=>m.k+(m.f?'|m':'')),
             bodies:{}, n:{}, h:{}, loaded:{}};
    for(const k in DOGDIR){ o.bodies[k]=DOGDIR[k].body; o.n[k]=DOGDIR[k].n; o.h[k]=DOGDIR[k].h;
                            o.loaded[k]=!!(DOGDIRIMG[k]&&DOGDIRIMG[k].naturalWidth); }
    return o;
  });
  console.log('DIRS  ', JSON.stringify(dirs));
  for(const k of ['E','SE','NE','S','N']) ck(dirs.keys.includes(k), 'the walk pack has no '+k);
  for(const k in dirs.bodies) ck(dirs.bodies[k]===80,
    k+' is stored at body '+dirs.bodies[k]+', not the shared 80 - he resizes when he turns');
  for(const k in dirs.n) ck(dirs.n[k]>=20,
    k+' carries only '+dirs.n[k]+' frames; five frames of a twenty-five frame cycle is a stagger');
  /* THE FIVE FACINGS MUST BE ONE DOG. The sheets are NOT drawn at a common size in the source - a
     paw is 16px across on the side sheet and 8.5px on the rear one, and a paw does not change
     width with the angle you look at it from - so each is normalised to its own standing height.
     Stored heights within a few percent of each other is what that looks like from here; a shared
     scale gave N 59px against E's 83 and he shrank by a third every time he turned away. */
  const hs=Object.values(dirs.h);
  ck(Math.max(...hs)/Math.min(...hs) < 1.12,
     'the facings are stored at different sizes, so he resizes as he turns: '+JSON.stringify(dirs.h));
  for(const k in dirs.loaded) ck(dirs.loaded[k], k+' never decoded');
  /* Every octant, and the away-diagonals must be the away-facing three-quarter rather than a
     fallback to N - showing his back is right, showing his face while walking away is not. */
  ck(dirs.map.length===8, 'the octant map is '+dirs.map.length+' long');
  ck(dirs.map[5]==='NE|m' && dirs.map[7]==='NE',
     'the away-diagonals are not on the away-facing sheet: '+JSON.stringify(dirs.map));
  ck(dirs.map[2]==='S' && dirs.map[6]==='N',
     'toward and away are crossed over: '+JSON.stringify(dirs.map));

  /* ---------- and what he wears when he ISN'T moving ---------- */
  /* `come` is a side-on bound with all four feet off the carpet. Standing still in it is the
     "running when he doesn't have to be" the walk pack was brought in to end, and a table entry
     is the only way it can get back in. */
  const still = await pg.evaluate(()=>{
    const o={};
    for(const st of ['walk','bark','chase','drinkgo','eatgo','beggo','treatgo','zoomies'])
      o[st]=CAMFRAME[st]||st;
    return o;
  });
  console.log('STILL ', JSON.stringify(still));
  for(const st in still) ck(still[st]!=='come',
    st+' falls back to the bound sheet when he is standing still');

  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL DOGCAM ART CHECKS PASS');
  await b.close();
  process.exit(fails.length?1:0);
})();
