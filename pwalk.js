const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(2500);

  /* ---------- 1. five strips in, all decoded ---------- */
  const strips = await pg.evaluate(async ()=>{
    const ready=async()=>{ for(let i=0;i<80;i++){
      if(Object.keys(PKWALK).every(k=>PKWALKIMG[k].complete&&PKWALKIMG[k].naturalWidth)) return true;
      await new Promise(r=>setTimeout(r,50)); } return false; };
    const ok=await ready();
    const out={ok, dirs:{}};
    for(const k in PKWALK){
      const d=PKWALK[k], im=PKWALKIMG[k];
      out.dirs[k]={w:d.w,h:d.h,n:d.n,sc:d.sc,ax:d.ax,
                   imgW:im.naturalWidth, imgH:im.naturalHeight,
                   fits:im.naturalWidth===d.w*d.n && im.naturalHeight===d.h};
    }
    return out;
  });
  console.log('STRIPS ', JSON.stringify(strips));
  ck(strips.ok===true, 'the walk strips never decoded');
  ck(Object.keys(strips.dirs).length===5, 'not five walk strips: '+Object.keys(strips.dirs));
  for(const k in strips.dirs){
    const d=strips.dirs[k];
    ck(d.fits===true, k+': the strip is not n cells wide: '+JSON.stringify(d));
    ck(d.n===25, k+': wrong cycle length '+d.n);
    ck(d.sc===1, k+': still needs a draw-time scale fudge ('+d.sc+') - it should be baked in');
  }

  /* ---------- 2. all EIGHT facings resolve, three of them mirrored ---------- */
  const facings = await pg.evaluate(()=>{
    const seen={};
    for(let i=0;i<8;i++){ const D=PKDIR_MAP[i];
      seen[i]={k:D.k, f:D.f, walk:!!PKWALK[D.k], run:!!PKDIRS[D.k]}; }
    return {seen, mirrored:Object.values(seen).filter(o=>o.f).length,
            keys:[...new Set(Object.values(seen).map(o=>o.k))]};
  });
  console.log('FACING ', JSON.stringify(facings.seen));
  ck(Object.values(facings.seen).every(o=>o.walk&&o.run), 'a facing has no strip');
  ck(facings.mirrored===3, 'the other three sides are not mirrored: '+facings.mirrored);
  ck(facings.keys.length===5, 'more than five source strips are in play: '+facings.keys);

  /* ---------- 3. THE SIZE FIX. Walk vs run, direction by direction ----------
     Cross-view comparison is meaningless (a side-on dog is long, a tail-on dog is a column), so
     each facing's WALK is measured against that same facing's RUN - the shipped set, whose scale
     is known good. If N and NE were still small this is where it shows. */
  const size = await pg.evaluate(()=>{
    const c=document.createElement("canvas"); c.width=400; c.height=400;
    const x=c.getContext("2d");
    const box=(walk,faceI)=>{
      x.clearRect(0,0,400,400);
      pkDirDraw(x, 200, 330, 1.0, faceI, 3, 0, null, 1, walk);
      const d=x.getImageData(0,0,400,400).data;
      let T=1e9,B=-1,L=1e9,R=-1;
      for(let py=0;py<400;py++) for(let px=0;px<400;px++){
        if(d[(py*400+px)*4+3]>10){ if(py<T)T=py; if(py>B)B=py; if(px<L)L=px; if(px>R)R=px; }
      }
      return B<0?null:{h:B-T+1, w:R-L+1};
    };
    const out=[];
    for(let i=0;i<8;i++){
      const w=box(true,i), r=box(false,i);
      out.push({i, k:PKDIR_MAP[i].k, f:PKDIR_MAP[i].f,
                walkH:w&&w.h, runH:r&&r.h, walkW:w&&w.w, runW:r&&r.w,
                hRatio:w&&r?+(w.h/r.h).toFixed(3):null});
    }
    return out;
  });
  console.log('SIZE   ', JSON.stringify(size));
  ck(size.every(o=>o.walkH&&o.runH), 'a facing rendered nothing at all');
  /* WIDTH, not height, is the invariant to hold across the two gaits. A run stretches the dog out
     low and long and carries the tail differently, so height moves 0.96-1.26 between gaits on the
     same facing while width moves only 0.87-1.00 - width is body length and girth, which the gait
     does not change. If the walk were mis-scaled it would show here first, and a pop on the
     walk/run switch is exactly what this is guarding. */
  for(const o of size){
    const wR=+(o.walkW/o.runW).toFixed(3);
    ck(wR>0.82 && wR<1.18,
       'facing '+o.i+' ('+o.k+(o.f?' mirrored':'')+'): walk is '+wR+'x the run WIDTH'
       +' ('+o.walkW+' vs '+o.runW+') - he would pop when the gait switches');
  }
  // ...and the eight facings agree with EACH OTHER within the walk set, as they do within the run
  const wh=size.map(o=>o.walkH), rh=size.map(o=>o.runH);
  const spread=a=>+(Math.max(...a)/Math.min(...a)).toFixed(3);
  console.log('SPREAD ', JSON.stringify({walk:spread(wh), run:spread(rh), wh, rh}));
  /* ...and the eight facings agree with EACH OTHER at least as well as the shipped set does.
     This is the check that answers "up and northeast look smaller": in the run set NE renders 58
     against SE's 75, and in the walk set NE is 73 against SE's 72. */
  ck(spread(wh)<=spread(rh)*1.02,
     'the walk set is less consistent across facings than the run set: '+spread(wh)+' vs '+spread(rh));
  const wNE=size[7].walkH, wSE=size[1].walkH, wN=size[6].walkH;
  ck(wNE/wSE>0.88 && wNE/wSE<1.14, 'walk NE is still out of line with SE: '+wNE+' vs '+wSE);
  ck(wN/wSE>0.88  && wN/wSE<1.14,  'walk N is still out of line with SE: '+wN+' vs '+wSE);

  /* ---------- 4. two gaits, chosen by speed ---------- */
  const gait = await pg.evaluate(()=>{
    PK.spd=100;
    const slow=pkGaitWalk(20), mid=pkGaitWalk(50), fast=pkGaitWalk(95);
    // ...and the draw really does reach for a different strip
    const c=document.createElement("canvas"); c.width=300; c.height=300;
    const x=c.getContext("2d");
    let picked=[];
    const od=x.drawImage.bind(x);
    x.drawImage=function(im){ picked.push(im===PKWALKIMG.E?'walk':im===PKDIRIMG.E?'run':'other');
      return od.apply(x,arguments); };
    pkDirDraw(x,150,250,1,0,3,0,null,1,true);  const a=picked.slice(); picked=[];
    pkDirDraw(x,150,250,1,0,3,0,null,1,false); const b2=picked.slice();
    return {slow, mid, fast, walkPick:a, runPick:b2,
            fpsIdle:pkGaitFps(5), fpsWalk:pkGaitFps(40), fpsRun:pkGaitFps(95)};
  });
  console.log('GAIT   ', JSON.stringify(gait));
  ck(gait.slow===true && gait.fast===false, 'the gait does not switch with speed');
  ck(gait.walkPick[0]==='walk', 'asking for the walk drew the run strip');
  ck(gait.runPick[0]==='run',  'asking for the run drew the walk strip');
  ck(gait.fpsWalk>gait.fpsRun, 'the walk does not cycle faster than the run');
  ck(gait.fpsIdle<gait.fpsWalk, 'standing still cycles as fast as walking');

  /* ---------- 5. DOGCAM shares the art ---------- */
  const cam = await pg.evaluate(async ()=>{
    for(let i=0;i<80;i++){
      if(DOGIMG.walk && DOGIMG.walk[0] && DOGIMG.walk[0].complete
         && DOGIMG.come && DOGIMG.come[0] && DOGIMG.come[0].complete) break;
      await new Promise(r=>setTimeout(r,50));
    }
    const tone=(cv)=>{ // lcdify collapses everything to ink / wall (+ warm eyes and tongue)
      const x=cv.getContext("2d"), d=x.getImageData(0,0,cv.width,cv.height).data;
      const set=new Set(); let opaque=0;
      for(let i=0;i<d.length;i+=4){ if(d[i+3]<20) continue; opaque++;
        set.add(d[i]+","+d[i+1]+","+d[i+2]); }
      return {tones:set.size, opaque};
    };
    return {comeArt:!!DOGIMG.come.__art, comeBody:DOGIMG.come.__art&&DOGIMG.come.__art.body,
            walkN:DOGIMG.walk.length, comeN:DOGIMG.come.length,
            walkDim:[DOGIMG.walk[0].naturalWidth, DOGIMG.walk[0].naturalHeight],
            comeDim:[DOGIMG.come[0].naturalWidth, DOGIMG.come[0].naturalHeight],
            srcWalk:[PKWALK.E.w,PKWALK.E.h], srcRun:[PKDIRS.E.w,PKDIRS.E.h],
            walkTone:tone(DOGIMG.walk[0]), comeTone:tone(DOGIMG.come[0])};
  });
  console.log('DOGCAM ', JSON.stringify(cam));
  ck(cam.walkN===25, 'DOGCAM walk is not the 25-frame strip: '+cam.walkN);
  /* REVERSED IN v0.322a, like the tone checks above. These two used to pin DOGCAM's run to the
     DOGPARK strip - which is a deliberately near-black silhouette, drawn to be read small on grass
     with a rim light, and which on a dark living-room wall is the exact thing that got reported.
     The run now has its own full-colour set. What is still worth guarding is that it never goes
     back: DOGCAM's run must not be the park cell, and it must carry its own geometry. */
  ck(cam.comeN>=3, 'DOGCAM run has no frames: '+cam.comeN);
  ck(cam.walkDim[0]===cam.srcWalk[0] && cam.walkDim[1]===cam.srcWalk[1],
     'DOGCAM walk frames are not the park walk cell: '+JSON.stringify(cam));
  ck(!(cam.comeDim[0]===cam.srcRun[0] && cam.comeDim[1]===cam.srcRun[1]),
     'DOGCAM run is the park silhouette again: '+JSON.stringify(cam));
  ck(cam.comeArt && cam.comeBody===80,
     'DOGCAM run carries no shared body scale: '+JSON.stringify([cam.comeArt,cam.comeBody]));
  ck(cam.walkTone.opaque>200 && cam.comeTone.opaque>200, 'a DOGCAM frame is blank');
  /* REVERSED DELIBERATELY IN v0.321a. These two used to demand the DOGCAM strips be quantized to
     the Game & Watch palette; BONES has since been taken off the LCD on purpose, so asserting the
     old behaviour would be asserting a bug. The check still earns its place inverted: the sets
     must carry REAL colour, because the failure mode being guarded against is a filter creeping
     back on and flattening the art to a silhouette again. */
  ck(cam.walkTone.tones>8, 'the DOGCAM walk is quantized again: '+cam.walkTone.tones+' tones');
  ck(cam.comeTone.tones>8, 'the DOGCAM run is quantized again: '+cam.comeTone.tones+' tones');

  /* ---------- 6. the provided music is BACK, and the generated bed is still under it ---------- */
  /* INVERTED for v0.346a, and deliberately so: this block was written when the three MP3s were
     stripped to keep the file small, and it pinned "gone" hard - lengths zero, no src, nothing
     played. v0.346a is the stable beta and ships with its music, so every one of those lines now
     asks the opposite question. The generated bed check is untouched and is the reason this stays
     in one place: the synthesised menu loop must survive the real tracks coming back, because it
     is what plays when the player turns the music off. */
  const audio = await pg.evaluate(()=>{
    const played=[];
    for(const [n,a] of [['home',MOOD_AUDIO],['park',MOOD_AUDIO_PARK],['boss',BOSS_AUDIO]]){
      const op=a.play.bind(a); a.play=function(){ played.push(n); return op(); };
    }
    /* PUT IT IN THE STATE THAT WANTS THE HOME TRACK, and clear the latch first. syncMoodMusic
       only calls play() on a TRANSITION - if the track is already running from the adoption tap,
       a second sync is correctly a no-op, and a harness that just calls it and waits for a play()
       is measuring whether it got there first. */
    SETTINGS.music=true; SETTINGS.sound=true;
    MODE="home"; S.sick=false; S.mood=100; PK.active=false; PK.settingsOpen=false;
    /* ...and get the MENU out of the way. The procedural bed owns the title screen and any
       global panel by design, so with one of those still up the home track is correctly refused
       and the harness is testing the menu, not the music. */
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    for(const id of ['settingsPanel','mystPanel']){
      const el=document.getElementById(id); if(el) el.classList.remove('show'); }
    const st=document.getElementById('start'); if(st) st.style.display='none';
    showScreen('home');
    moodMusicOn=false; parkMusicOn=false; bossMusicOn=false;
    syncMoodMusic();
    // ...and if it still does not take, SAY WHY rather than reporting a bare false
    const why={hidden:document.hidden, menu:menuMusicWanted(), good:pkGoodMoodMusic(),
               mode:MODE, mood:dogMoodState(), sound:SETTINGS.sound, music:SETTINGS.music};
    return {on:{mood:moodMusicOn, park:parkMusicOn, boss:bossMusicOn}, why, len:[MUSIC_GOODMOOD.length, MUSIC_DOGPARK.length, MUSIC_BOSS.length],
            has:[trackHas(MOOD_AUDIO), trackHas(MOOD_AUDIO_PARK), trackHas(BOSS_AUDIO)],
            // ...the PREFIX only. This used to return the attribute itself, and when the tracks
            // came back a one-line failure message printed two megabytes of base64 into the log.
            src:[MOOD_AUDIO.getAttribute("src"), MOOD_AUDIO_PARK.getAttribute("src")]
                  .map(v=>v===null?null:v.slice(0,22)),
            played, gen:{bass:MUSIC_BASS.length, arp:MUSIC_ARP.length, beat:MUSIC_BEAT}};
  });
  console.log('AUDIO  ', JSON.stringify(audio));
  ck(audio.len.every(n=>n>200000), 'a provided track is empty again: '+JSON.stringify(audio.len));
  ck(audio.has.every(h=>h===true), 'a track is loaded but the element does not know it has one');
  ck(audio.src.every(v=>v==='data:audio/mpeg;base64'),
     'an audio element was given something other than an mpeg data URI: '+JSON.stringify(audio.src));
  ck(audio.played.length>=1, 'the music is in the build and nothing plays it: '+JSON.stringify(audio.played));
  ck(audio.on.mood===true, 'the home track is loaded and the home screen did not take it: '+JSON.stringify(audio.why));
  ck(audio.gen.bass>0 && audio.gen.arp>0 && audio.gen.beat>0,
     'the generated menu bed was removed too');

  console.log('ERRORS:', errs.length?errs:'none');
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  console.log(fails.length?('FAILS:\n - '+fails.join('\n - ')):'ALL WALK/DOGCAM/AUDIO CHECKS PASS');
  await b.close();
  // ...and a failing run has to LOOK failed to anything reading exit codes, not just to a human
  // reading the log. Same fix pall.js needed.
  if(fails.length) process.exit(1);
})();
