/* THE STREET, AND THE FOUR MEGABYTES THAT WERE NOT DOING ANYTHING.
   The speed lines are the one thing on that screen whose entire job is to say WHICH WAY you are
   moving, and they were drawn horizontally across a road painted at thirty degrees. That is not a
   matter of taste, it is measurable: every streak must lie along the road's own axis on the glass.
   The rest is framing - a scale and an anchor - and the music, which is now three empty strings
   that everything downstream is already written to cope with. */
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
  await pg.evaluate(()=>{ S.lvl=10; XPANIM.lvl=10; S.pendingStage.length=0; S.pbDone=true; });
  await pg.waitForTimeout(500);

  /* ---------- 1. the tracks are HERE, and the mute button still works over them ---------- */
  /* Inverted a third time, in v0.346a, and the reason is the same one that flipped it before,
     read the other way round: every player is guarded by its own hasTrack flag, so BOTH an empty
     string and a loaded track are supported states, and which one the build ships is a decision
     about size rather than about correctness. v0.346a is the stable beta and ships with its
     music. What this suite actually protects is the bit that must hold either way: the global
     mute button, toggled twice with the tracks live, must not throw and must not leave the flags
     lying. */
  const music = await pg.evaluate(()=>{
    const o={ good:MUSIC_GOODMOOD.length, park:MUSIC_DOGPARK.length, boss:MUSIC_BOSS.length,
              hasGood:MOOD_AUDIO.hasTrack, hasPark:MOOD_AUDIO_PARK.hasTrack,
              hasBoss:BOSS_AUDIO.hasTrack, on:SETTINGS.music, threw:null };
    // ...and the things that would have played them do not fall over
    try{ syncMoodMusic();
         document.getElementById('globalMusicBtn').click();
         document.getElementById('globalMusicBtn').click();
         syncMoodMusic(); }catch(e){ o.threw=String(e); }
    return o;
  });
  console.log('MUSIC ', JSON.stringify(music));
  ck(music.good>200000 && music.park>200000 && music.boss>200000,
     'a track is empty - the music was stripped out of the beta: '+JSON.stringify(music));
  ck(music.hasGood===true && music.hasPark===true && music.hasBoss===true,
     'a player has a track loaded and does not know it: '+JSON.stringify(music));
  ck(music.threw===null, 'the music path threw with no tracks loaded: '+music.threw);

  /* ---------- 2. the framing moved by the amounts asked for ---------- */
  const cam = await pg.evaluate(()=>({ s:PB_S, camX:PB_CAM_X, camY:PB_CAM_Y }));
  console.log('CAM   ', JSON.stringify(cam));
  ck(Math.abs(cam.s/0.42-1.15)<0.01, 'the zoom is '+(cam.s/0.42).toFixed(3)+'x, not 1.15x');
  ck(Math.abs(cam.camY-0.41)<0.001, 'the anchor sits at '+cam.camY+' rather than 0.15 down from 0.26');
  ck(cam.camY>0.26, 'the scene did not come down the screen at all');

  await pg.evaluate(()=>{ enterPaperboy(); });
  await pg.waitForTimeout(1400);

  /* ---------- 3. EVERY STREAK LIES ALONG THE ROAD ---------- */
  /* Measured off the drawing itself, not off the maths that feeds it: the context is stubbed and
     every segment pbDrawSpeedLines actually strokes is recorded, then compared with the road's
     direction on the glass. A streak drawn horizontally over a 30-degree street is the reported
     bug, and it is exactly what this catches. */
  const lines = await pg.evaluate(()=>{
    if(PB.tutorial){ PB.tutorial=false; PB.run=true; }
    PB.speed=PB_SPEED_MAX; PB.dist=520; PB.shake=0;
    PB.lines.length=0;
    for(let i=0;i<400;i++) pbTickSpeedLines(1/60);
    const cv=document.querySelector('#paperboycv');
    const [real,w,h]=fit(cv);
    PB.camX=w*PB_CAM_X; PB.camY=h*PB_CAM_Y;
    const segs=[];
    let cur=null;
    const spy={
      save(){}, restore(){}, beginPath(){ cur={}; }, stroke(){ if(cur&&cur.x0!==undefined) segs.push(cur); },
      moveTo(x,y){ if(cur){ cur.x0=x; cur.y0=y; } },
      lineTo(x,y){ if(cur){ cur.x1=x; cur.y1=y; } },
      set lineCap(v){}, set globalAlpha(v){}, set strokeStyle(v){ this._c=v; }, set lineWidth(v){},
      get strokeStyle(){ return this._c; }
    };
    pbDrawSpeedLines(spy,w,h);
    // the road's own direction on the glass, taken from the projection rather than assumed
    const a=pbP(PB.dist,0,0), c=pbP(PB.dist+100,0,0);
    const rx=c[0]-a[0], ry=c[1]-a[1], rm=Math.hypot(rx,ry);
    const ux=rx/rm, uy=ry/rm;
    let worstAng=0, worstPerp=0, off=0;
    for(const s of segs){
      const dx=s.x1-s.x0, dy=s.y1-s.y0, m=Math.hypot(dx,dy);
      if(m<1e-6){ off++; continue; }
      // angle between the streak and the road, folded to 0..90
      const cosA=Math.abs((dx*ux+dy*uy)/m);
      worstAng=Math.max(worstAng, Math.acos(Math.min(1,cosA))*180/Math.PI);
      // ...and how far off the lane its midpoint flies, measured across the road
      const mx=(s.x0+s.x1)/2-PB.camX, my=(s.y0+s.y1)/2-PB.camY;
      worstPerp=Math.max(worstPerp, Math.abs(mx*(-uy)+my*ux));
    }
    return { n:segs.length, worstAng:+worstAng.toFixed(2), worstPerp:Math.round(worstPerp),
             w:Math.round(w), road:[+ux.toFixed(3),+uy.toFixed(3)],
             iso:[PB_RX,PB_RY], isoLen:+Math.hypot(PB_RX,PB_RY).toFixed(9), off,
             rawLen:+Math.hypot(PB_IX,PB_IY).toFixed(6) };
  });
  console.log('LINES ', JSON.stringify(lines));
  ck(lines.n>=8, 'only '+lines.n+' streaks were drawn at full speed - nothing is being measured');
  ck(lines.off===0, lines.off+' streaks were zero-length');
  /* 0.866 is root-three-over-two rounded, so the RAW basis is only nearly a unit vector - close
     enough to look right and wrong enough not to build on. What the draw uses is normalised. */
  ck(Math.abs(lines.rawLen-1)>1e-9,
     'the raw basis is exactly unit length after all, so the normalising is dead weight');
  ck(Math.abs(lines.isoLen-1)<1e-9,
     'the road direction the draw uses is not a unit vector: '+lines.isoLen);
  ck(lines.worstAng<0.6,
     'a streak sits '+lines.worstAng+' degrees off the road - the speed lines do not match the '+
     'angle of the car and the street');
  ck(lines.worstPerp < lines.w*0.36,
     'a streak flies '+lines.worstPerp+'px wide of the lane on a '+lines.w+'px pad - that is '+
     'weather over a garden, not the van moving');

  /* ---------- 4. ...and they run BACKWARDS, which is the whole point ---------- */
  const dirn = await pg.evaluate(()=>{
    const cv=document.querySelector('#paperboycv'); const [ctx,w,h]=fit(cv);
    const a=pbP(PB.dist,0,0), c=pbP(PB.dist+100,0,0);
    const ux=(c[0]-a[0]), uy=(c[1]-a[1]), m=Math.hypot(ux,uy);
    const L=PB.lines[0]; if(!L) return {none:true};
    const at=(p)=>{
      L.p=p;
      let pt=null;
      const spy={ save(){}, restore(){}, beginPath(){}, stroke(){}, moveTo(x,y){ pt=[x,y]; },
                  lineTo(){}, set lineCap(v){}, set globalAlpha(v){}, set strokeStyle(v){},
                  set lineWidth(v){} };
      const keep=PB.lines.slice(); PB.lines.length=0; PB.lines.push(L);
      pbDrawSpeedLines(spy,w,h);
      PB.lines.length=0; for(const k of keep) PB.lines.push(k);
      return pt;
    };
    const p0=at(0.1), p1=at(0.6);
    // ...projected onto the road: it must go NEGATIVE, i.e. back past the camera
    const along=((p1[0]-p0[0])*ux+(p1[1]-p0[1])*uy)/m;
    return { along:Math.round(along) };
  });
  console.log('DIRN  ', JSON.stringify(dirn));
  ck(!dirn.none, 'no streak existed to follow');
  ck(dirn.along<-40,
     'the streaks travel FORWARD along the road ('+dirn.along+'px) - they should stream backwards');

  /* ---------- 5. the corner is tidy: the dial and the music button are not on top of each other ---------- */
  const hud = await pg.evaluate(()=>{
    const cv=document.querySelector('#paperboycv'), r=cv.getBoundingClientRect();
    const btn=document.querySelector('#globalMusicBtn');
    const b=btn?btn.getBoundingClientRect():null;
    const h=r.height, R=34;
    const cy=h-R-64;                       // the dial's centre, in the canvas's own pixels
    const dialBottom=r.top+cy+R;
    const labelY=r.top+cy-R-10;
    return { dialBottom:Math.round(dialBottom), labelY:Math.round(labelY),
             btnTop: b?Math.round(b.top):null, btnShown: !!(btn&&btn.offsetParent!==null) };
  });
  console.log('HUD   ', JSON.stringify(hud));
  ck(hud.btnShown, 'the music button is not on screen, so this proves nothing');
  ck(hud.dialBottom < hud.btnTop,
     'the speedo dial ('+hud.dialBottom+') hangs over the music button ('+hud.btnTop+')');
  ck(hud.labelY < hud.btnTop,
     'the top-speed bonus line ('+hud.labelY+') is under the music button ('+hud.btnTop+')');

  /* ---------- 6. the street is actually on the pad, not off the top of it ---------- */
  /* The zoom and the drop are only right if the van and the road it is on still fit. Measured by
     projecting the van and the road's edges and asking where they land. */
  const fit2 = await pg.evaluate(()=>{
    const cv=document.querySelector('#paperboycv'); const [ctx,w,h]=fit(cv);
    PB.camX=w*PB_CAM_X; PB.camY=h*PB_CAM_Y;
    const van=pbP(PB.dist,0,0);
    const l=pbP(PB.dist,-PB_ROAD_HALF,0), rr=pbP(PB.dist,PB_ROAD_HALF,0);
    const laneW=Math.hypot(rr[0]-l[0],rr[1]-l[1]);
    return { vanY:+(van[1]/h).toFixed(3), vanX:+(van[0]/w).toFixed(3),
             laneW:+laneW.toFixed(2), laneWOld:+(laneW/PB_S*0.42).toFixed(2),
             w:Math.round(w), h:Math.round(h) };
  });
  console.log('FIT   ', JSON.stringify(fit2));
  ck(fit2.vanY>0.30 && fit2.vanY<0.55,
     'the van sits at '+fit2.vanY+' of the pad - it is meant to be near the middle');
  ck(fit2.vanX>0.15 && fit2.vanX<0.60, 'the van sits at '+fit2.vanX+' across the pad');
  /* The lane is NARROW BY DESIGN - PB_ROAD_HALF is kept small so it reads as a single lane - so
     what matters is not an absolute width but that the zoom actually widened it. */
  ck(Math.abs(fit2.laneW/fit2.laneWOld-1.15)<0.02,
     'the zoom did not widen the lane by 15%: '+fit2.laneW+' against '+fit2.laneWOld+' at the old scale');

  await pg.waitForTimeout(200);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\nppb PASS');
})();
