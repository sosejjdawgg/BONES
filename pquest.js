/* v0.348a: THE RUN GETS A SHAPE, AND THE HOARD GETS A PRICE.
   Five things, and the ones worth the machinery are the two that are ARITHMETIC rather than
   animation - a burial rate that is now a percentage of a moving target, and a wallet that is
   debited on the way into a run. Both are places where "it looked right on screen" is worth
   nothing: bones can be duplicated, XP can be paid twice, and neither shows up in a screenshot.
     1. 0.5% of the level's requirement per bone => 200 bones is one level at EVERY level
     2. carrying bones in moves them, exactly once, and only for UNLEASHED
     3. the six objectives fire from the real events and are worth what they say
     4. the box closes, in order, and the card asks the question
     5. the payout awards every objective's XP once, and a skip costs nothing */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const F='file://'+__dirname+'/bones-latest.html';
const fails=[]; const ck=(c,m)=>{ if(!c) fails.push(m); };
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto(F); await pg.waitForTimeout(2100);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1700);

  /* ---------- 1. 200 BONES IS ONE LEVEL, AT EVERY LEVEL ---------- */
  /* The old rate was two flat XP a shovel, which is a fifth of a level at level 3 and a rounding
     error at level 40 - the mode built around hoarding paid less the deeper you got. The new rate
     is a percentage, so the assertion has to be checked ACROSS levels or it is checking one. */
  const rate = await pg.evaluate(()=>{
    const kl=S.lvl, kx=S.xp;
    const out={rows:[], pct:BURY_XP_PCT, unit:BURY_UNIT};
    for(const L of [3,7,12,25,40,60]){
      S.lvl=L; S.xp=0;
      const need=xpNeed(L);
      const one=buryXPPerShovel();
      const p200=buryProject(200), p1000=buryProject(1000);
      out.rows.push({L, need:+need.toFixed(1), shovel:one,
                     xp200:p200.xp, lv200:p200.levels, lv1000:p1000.levels});
    }
    // ...and the two halves of the estimate agree with each other
    S.lvl=20; S.xp=0;
    const pr=buryProject(600);
    out.agree = pkLevelsFromXP(pr.xp)===pr.levels;
    out.xpFromBury = xpFromBury(600)===pr.xp;
    S.lvl=kl; S.xp=kx;
    return out;
  });
  console.log('RATE  ', JSON.stringify(rate));
  ck(rate.pct===0.005, 'the rate is not half a percent a bone: '+rate.pct);
  for(const r of rate.rows){
    ck(Math.abs(r.shovel-r.need*0.05)<1.2,
       'at LV'+r.L+' a shovel pays '+r.shovel+' against a level of '+r.need+' - that is not 5%');
    ck(r.lv200===1, 'at LV'+r.L+' 200 bones bought '+r.lv200+' levels, not 1');
    ck(r.lv1000>=4 && r.lv1000<=6, 'at LV'+r.L+' 1000 bones bought '+r.lv1000+' levels');
  }
  ck(rate.agree, 'buryProject and pkLevelsFromXP disagree about the same pile');
  ck(rate.xpFromBury, 'xpFromBury does not match buryProject');
  // the rate RE-BASES as he climbs: a big hoard must not be paid out at the level it started at
  const rebase = await pg.evaluate(()=>{
    const kl=S.lvl, kx=S.xp;
    S.lvl=10; S.xp=0;
    const flat=buryXPPerShovel()*Math.floor(1000/BURY_UNIT);   // if it never re-based
    const real=buryProject(1000).xp;
    S.lvl=kl; S.xp=kx;
    return {flat, real};
  });
  console.log('REBASE', JSON.stringify(rebase));
  ck(rebase.real>rebase.flat*1.05,
     'a 1000-bone burial pays the same as if it never levelled: '+rebase.real+' vs '+rebase.flat);

  /* ---------- 2. CARRYING BONES IN MOVES THEM, ONCE ---------- */
  const carry = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const out={};
    S.snacks=1000; S.lvl=12; PK.active=false;
    CARRY_N=0;
    openCarry();
    await sleep(150);
    out.opened=$("#carry").classList.contains("show");
    out.max=+$("#carryRange").max;
    $("#carryAll").click(); out.all=CARRY_N;
    $("#carryH").click();   out.half=CARRY_N;
    carrySet(255);          out.snapped=CARRY_N;      // only whole shovels may be carried
    carrySet(99999);        out.clamped=CARRY_N;
    carrySet(-50);          out.floored=CARRY_N;
    carrySet(300);
    const before=S.snacks;
    $("#carryGo").click();
    await sleep(600);
    out.wallet=[before, S.snacks];
    out.inRun=PK.bones;
    out.plus=PK.plusMode;
    out.panelGone=!$("#carry").classList.contains("show");
    // ...and a SECOND run does not carry the same bones again
    const w2=S.snacks;
    PK.active=false; startPark(true);
    out.second={wallet:[w2,S.snacks], inRun:PK.bones};
    // REGULAR never carries, whatever the picker was left at
    CARRY_N=200; const w3=S.snacks;
    PK.active=false; startPark(false);
    out.regular={wallet:[w3,S.snacks], inRun:PK.bones, carryAfter:CARRY_N};
    PK.active=false; showScreen('home');
    return out;
  });
  console.log('CARRY ', JSON.stringify(carry));
  ck(carry.opened, 'the carry panel never opened');
  ck(carry.max===1000, 'the slider ceiling is not the whole wallet: '+carry.max);
  ck(carry.all===1000 && carry.half===500, 'the presets do not pick the right amounts: '+carry.all+'/'+carry.half);
  ck(carry.snapped===260, '255 bones did not snap to whole shovels: '+carry.snapped);
  ck(carry.clamped===1000 && carry.floored===0, 'the picker is not clamped: '+carry.clamped+'/'+carry.floored);
  ck(carry.wallet[0]-carry.wallet[1]===300,
     'the wallet did not lose exactly what was carried: '+JSON.stringify(carry.wallet));
  ck(carry.inRun===300, 'the run did not start with the carried bones: '+carry.inRun);
  ck(carry.plus===true, 'the carry picker started a REGULAR run');
  ck(carry.panelGone, 'the carry panel stayed up over the run');
  ck(carry.second.wallet[0]===carry.second.wallet[1] && carry.second.inRun===0,
     'THE SAME BONES WERE CARRIED TWICE: '+JSON.stringify(carry.second));
  ck(carry.regular.wallet[0]===carry.regular.wallet[1] && carry.regular.inRun===0,
     'a REGULAR run took bones out of the wallet: '+JSON.stringify(carry.regular));

  /* ---------- 3. THE SIX OBJECTIVES ---------- */
  const quests = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    S.lvl=20; S.snacks=0; CARRY_N=0;
    startPark(true);
    await sleep(300);
    const out={ids:PK_QUESTS.map(q=>q.id), xp:PK_QUESTS.map(q=>q.xp), fired:[], list0:"", list1:""};
    out.list0=$("#pkQuests").innerHTML;
    out.hidden0=$("#pkQuests").classList.contains("hidden");
    out.base=pkRunXP();
    // a) the bandana dog. Driven by walking, not by calling the hit directly.
    PK.x=PK.npc.x; PK.y=PK.npc.y; PK.friendsArm=true; PK.friendsOpen=false;
    PK.shop=null; PK.convertOpen=false;
    for(let i=0;i<40 && !pkQuestIs("friends");i++){ parkUpdate(1/60); }
    out.friends=pkQuestIs("friends");
    PK.friendsOpen=false;
    // b) 100 birds, through the one door an enemy leaves the field by
    for(let i=0;i<100;i++){
      const e={t:"bird", x:PK.x+30, y:PK.y, fleeing:false, hp:1};
      pkDownEnemy(e,1,0,{});
    }
    out.birds={n:PK.quest.birds, done:pkQuestIs("birds")};
    // ...and one more must not fire it twice
    const ord0=PK.quest.order.length;
    pkDownEnemy({t:"bird",x:0,y:0,fleeing:false},1,0,{});
    out.noDouble = PK.quest.order.length===ord0;
    // c) recruit, then the whole crew
    pkBuyPal("cat");
    await sleep(60);
    out.recruit=pkQuestIs("recruit");
    out.crewEarly=pkQuestIs("crew");
    for(const k of ["sq","bird","cat","ape"]) while(pkPalTier(k)<(PAL_MAXTIER[k]||4)) pkBuyPal(k);
    await sleep(80); pkQuestTick();
    out.crew=pkQuestIs("crew");
    // d) the grove at its cap
    out.fireCap=FIRE_CAP;
    let lit=0;
    for(const tr of PK.trees){ if(pkIgniteTree(tr,true,0)) lit++; }
    pkQuestTick();
    out.burning={lit, count:pkFireCount(), done:pkQuestIs("burning")};
    /* e) the golden bird. CLEAR THE WAVE SEND-OFF FIRST: a hundred fake bird kills is a hundred
       real kills as far as the wave goal is concerned, so by now the run is sitting in a
       between-wave outro and parkUpdate correctly returns before it reaches anything in the
       world. The first version of this reported that catching the golden bird did nothing, on a
       build where catching it works - the harness had put the park on pause and then complained
       that the park was paused. */
    PK.waveOutro=null; PK.waveKills=0; PK.shop=null; PK.friendsOpen=false;
    PK.fr.push({x:PK.x, y:PK.y, vx:0, life:9, golden:true});
    for(let i=0;i<10 && !pkQuestIs("golden");i++) parkUpdate(1/60);
    out.golden=pkQuestIs("golden");
    out.all=PK.quest.order.slice();
    out.questXP=pkQuestXP();
    out.runXP=pkRunXP();
    out.list1=$("#pkQuests").innerHTML;
    out.doneRows=($("#pkQuests").innerHTML.match(/qrow done/g)||[]).length;
    return out;
  });
  console.log('QUEST ', JSON.stringify({ids:quests.ids, xp:quests.xp, friends:quests.friends,
    birds:quests.birds, noDouble:quests.noDouble, recruit:quests.recruit, crewEarly:quests.crewEarly,
    crew:quests.crew, burning:quests.burning, golden:quests.golden, all:quests.all,
    questXP:quests.questXP, runXP:quests.runXP, doneRows:quests.doneRows, hidden0:quests.hidden0}));
  ck(quests.ids.join()==='friends,birds,recruit,crew,burning,golden',
     'the objective list is not the six asked for: '+quests.ids.join());
  ck(quests.xp.join()==='500,200,200,1000,500,500', 'the objective XP is wrong: '+quests.xp.join());
  ck(quests.hidden0===false, 'the goals list is hidden during a run');
  ck(quests.friends===true, 'walking up to the bandana dog did not complete FIND YOUR FRIENDS');
  ck(quests.birds.done===true && quests.birds.n>=100, 'CLEAR 100 BIRDS never fired: '+JSON.stringify(quests.birds));
  ck(quests.noDouble===true, 'an objective fired twice');
  ck(quests.recruit===true, 'hiring a friend did not complete RECRUIT A FRIEND');
  ck(quests.crewEarly===false, 'TEAMWORK fired on the first hire, not on a maxed crew');
  ck(quests.crew===true, 'a fully maxed crew did not complete TEAMWORK');
  ck(quests.burning.done===true, 'the grove at its cap did not complete THE FOREST IS BURNING: '+JSON.stringify(quests.burning));
  ck(quests.golden===true, 'catching the golden bird did not complete GOLDEN BOY');
  ck(quests.all.length===6, 'not all six can be completed in one run: '+quests.all.join());
  ck(quests.questXP===2900, 'the six are not worth 2900 XP: '+quests.questXP);
  ck(quests.runXP>quests.questXP-1, 'the run total does not include the objectives: '+quests.runXP);
  ck(quests.doneRows===6, 'the goals list does not cross off what is done: '+quests.doneRows+' struck rows');

  /* ---------- 4. THE BOX CLOSES, IN ORDER ---------- */
  const box = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show');
    PK.active=true; PK.bones=400; PK.lvl0=S.lvl-3;      // pretend the hole already paid out
    pkBossStart();
    BOSS.introT=BOSS_INTRO-0.05;
    for(let i=0;i<400 && BOSS.ph==="intro";i++) await sleep(20);
    BOSS.hp=0; pkBossKill();
    const seen=[], segs=[];
    for(let i=0;i<900;i++){
      await sleep(20);
      if(seen[seen.length-1]!==BOSS.ph) seen.push(BOSS.ph);
      if(BOSS.win) segs.push(BOSS.win.seg);
      if(document.getElementById('choice').classList.contains('show')) break;
    }
    const btns=[...document.querySelectorAll('#choice button')].map(b=>b.textContent.trim());
    // monotone: a slab may never un-close
    let mono=true; for(let i=1;i<segs.length;i++) if(segs[i]<segs[i-1]) mono=false;
    return {seen, segs:[segs[0], segs[segs.length-1]], mono, max:Math.max(...segs),
            SEGS:BOSS_WIN_SEGS, card:document.getElementById('choice').classList.contains('show'),
            btns, title:document.getElementById('chTitle').textContent,
            lines:document.getElementById('chLines').innerHTML,
            overlayGone:!document.getElementById('bossPanel').classList.contains('show'),
            bossOff:!BOSS.active};
  });
  console.log('BOX   ', JSON.stringify({seen:box.seen, segs:box.segs, mono:box.mono, max:box.max,
    SEGS:box.SEGS, card:box.card, btns:box.btns, title:box.title, gone:box.overlayGone, off:box.bossOff}));
  ck(box.seen.indexOf('win')>box.seen.indexOf('outro'),
     'the outro never handed over to the closing box: '+box.seen.join('>'));
  ck(box.mono, 'a slab of the box un-closed itself');
  ck(box.max===box.SEGS, 'the box did not close all '+box.SEGS+' slabs: got '+box.max);
  ck(box.card===true, 'the victory card never came up');
  ck(/WOLFIE/.test(box.title||''), 'the card is not the victory card: "'+box.title+'"');
  ck(box.btns.some(t=>/BANK/.test(t)), 'no BANK button on the victory card: '+JSON.stringify(box.btns));
  ck(box.btns.some(t=>/CONTINUE/.test(t)), 'no CONTINUE button on the victory card: '+JSON.stringify(box.btns));
  ck(/3 LEVELS/.test(box.lines||''), 'the card does not say how many levels the run bought: '+box.lines);
  ck(box.overlayGone && box.bossOff, 'the boss overlay was left up behind the card');

  // CONTINUE puts him back out there with nothing banked
  const cont = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const snacks0=S.snacks, bones0=PK.bones;
    [...document.querySelectorAll('#choice button')].find(b=>/CONTINUE/.test(b.textContent)).click();
    await sleep(400);
    return {active:PK.active, bones:PK.bones, banked:S.snacks-snacks0, bones0,
            res:document.getElementById('result').classList.contains('show')};
  });
  console.log('CONT  ', JSON.stringify(cont));
  ck(cont.active===true, 'CONTINUE ended the run: '+JSON.stringify(cont));
  ck(cont.banked===0, 'CONTINUE banked the bones anyway: '+cont.banked);
  ck(cont.bones===cont.bones0, 'CONTINUE spent the run bones');
  ck(cont.res===false, 'CONTINUE put the result card up');

  /* ---------- 5. THE PAYOUT AWARDS EACH OBJECTIVE ONCE ---------- */
  const pay = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    S.lvl=30; S.xp=0; S.snacks=0;
    // a fresh run with three objectives banked, driven through the real bank
    startPark(true); await sleep(120);
    PK.kills=0; PK.sideDone=0; PK.bones=50;
    pkQuestHit("friends"); pkQuestHit("birds"); pkQuestHit("golden");
    const want=pkQuestXP();
    const lvl0=S.lvl, xp0=S.xp;
    const totalBefore=lvl0*1e6+xp0;
    pkBank();
    /* THE LIST STARTS AT 2.6s, behind the bone pile and the XP counter - deliberately, so the two
       never talk over each other. Sampling at 400ms measured a card that had not been built yet
       and reported that the payout builds no rows. Wait for it to actually start. */
    for(let i=0;i<200 && !RQ_RUN;i++) await sleep(40);
    await sleep(120);
    const rowsAtStart=document.querySelectorAll('#rqRows .rqrow').length;
    const hitAtStart=document.querySelectorAll('#rqRows .rqrow.hit').length;
    const homeHidden=$("#bResHome").style.visibility==="hidden";
    // let it run the whole way rather than skipping: the timing is the feature
    for(let i=0;i<300 && RQ_RUN;i++) await sleep(60);
    const hitEnd=document.querySelectorAll('#rqRows .rqrow.hit').length;
    // how much XP actually landed, counted in absolute terms across the levels it crossed
    let gained=0, l=lvl0, x=xp0;
    while(l<S.lvl){ gained+=xpNeed(l)-x; x=0; l++; }
    gained+=S.xp-x;
    return {want, rows:rowsAtStart, hitAtStart, hitEnd, homeHidden,
            homeBack:$("#bResHome").style.visibility!=="hidden",
            gained:Math.round(gained), lvl0, lvl:S.lvl,
            shown:$("#rqTot").textContent, running:!!RQ_RUN,
            barW:$("#rqBar").style.width};
  });
  console.log('PAY   ', JSON.stringify(pay));
  ck(pay.rows===3, 'the payout list did not build a row per objective: '+pay.rows);
  ck(pay.hitAtStart===0, 'every row was already lit before the sequence started');
  ck(pay.hitEnd===3, 'the payout did not light every row: '+pay.hitEnd);
  ck(pay.homeHidden===true, 'BACK HOME was tappable during the payout');
  ck(pay.homeBack===true, 'BACK HOME never came back after the payout');
  ck(pay.running===false, 'the payout never finished');
  ck(Math.abs(pay.gained-pay.want)<3,
     'the payout awarded '+pay.gained+' XP for '+pay.want+' worth of objectives');
  ck(pay.shown==='+'+pay.want+' XP', 'the running total is wrong: '+pay.shown);

  // ...and skipping it costs nothing
  const skip = await pg.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    $("#result").classList.remove("show");
    S.lvl=30; S.xp=0;
    startPark(true); await sleep(120);
    PK.kills=0; PK.sideDone=0; PK.bones=0;
    pkQuestHit("crew"); pkQuestHit("burning");
    const want=pkQuestXP(), lvl0=S.lvl, xp0=S.xp;
    pkBank();
    for(let i=0;i<200 && !RQ_RUN;i++) await sleep(40);
    await sleep(200);
    $("#resQuests").click();                 // skip
    await sleep(200);
    let gained=0, l=lvl0, x=xp0;
    while(l<S.lvl){ gained+=xpNeed(l)-x; x=0; l++; }
    gained+=S.xp-x;
    return {want, gained:Math.round(gained), running:!!RQ_RUN,
            hit:document.querySelectorAll('#rqRows .rqrow.hit').length};
  });
  console.log('SKIP  ', JSON.stringify(skip));
  ck(Math.abs(skip.gained-skip.want)<3,
     'SKIPPING THE PAYOUT COST XP: '+skip.gained+' of '+skip.want);
  ck(skip.hit===2, 'a skipped payout did not light every row: '+skip.hit);
  ck(skip.running===false, 'the payout is still running after a skip');

  await pg.evaluate(()=>{ PK.active=false; showScreen('home');
    for(const el of document.querySelectorAll('.overpanel.show')) el.classList.remove('show'); });
  await pg.waitForTimeout(300);
  ck(errs.length===0, 'page errors: '+errs.join(';'));
  await b.close();
  if(fails.length){ console.log('\nFAIL x'+fails.length); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
  console.log('\npquest PASS');
})();
