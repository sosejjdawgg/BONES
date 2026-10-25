import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HF=process.env.HF, OUT=process.env.OUT, ONLY=(process.env.ONLY||'').split(',').filter(Boolean);
const b=await chromium.launch(); const errs=[];
async function fresh(theme){
  const ctx=await b.newContext({viewport:{width:412,height:860},deviceScaleFactor:2.5,isMobile:true,hasTouch:true});
  if(theme) await ctx.addInitScript(t=>{ try{ localStorage.setItem('bones_theme',t); }catch(e){} },theme);
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+HF); await p.waitForTimeout(4500);
  return {ctx,p};
}
const adopt=async p=>{ await p.evaluate(()=>document.querySelector('#breedBones').click()); await p.waitForTimeout(300);
  await p.evaluate(()=>document.querySelector('#adopt').click()); await p.waitForTimeout(2200); };
const scenes={
  title: async()=>{ const {ctx,p}=await fresh(); await p.waitForTimeout(1500); await p.screenshot({path:OUT+'/raw_title.png'}); await ctx.close(); },
  home: async()=>{ const {ctx,p}=await fresh(); await adopt(p); await p.waitForTimeout(2500); await p.screenshot({path:OUT+'/raw_home.png'}); await ctx.close(); },
  park: async()=>{ const {ctx,p}=await fresh(); await adopt(p);
    await p.evaluate(()=>{ S.lvl=30; XPANIM.lvl=30; S.energy=100; S.mood=100; startPark(false); PK.hp=PK.maxhp=99999; if(PK.round) PK.round.t=95; });
    await p.waitForTimeout(1200);
    await p.evaluate(()=>{ for(const k of ["sq","bird","cat"]) while(pkPalTier(k)<3) pkBuyPal(k); pkDevSetWave(+(window.__W||7)); PK.mixTypes=["cat","bird"]; PK.mixLabel="CATS & BIRDS"; PK.bones=1240; pkTick&&0; });
    await p.evaluate(()=>{ const t=()=>{ if(!PK.active) return; if(PK.quest){ PK.quest.open=false; PK.quest.peek=0; } if(PK.barkCd<=0 && PK.barkHot) pkBark(); requestAnimationFrame(t); }; requestAnimationFrame(t); setInterval(()=>pkQuestRender(),200); });
    const r=await p.evaluate(()=>{const r=document.querySelector('#park').getBoundingClientRect(); return {x:r.left+r.width*0.72,y:r.top+r.height*0.55};});
    await p.mouse.move(r.x,r.y); await p.mouse.down();
    for(let i=0;i<6;i++){ for(let k=0;k<25;k++){ const a=(i*25+k)*0.09; await p.mouse.move(r.x+Math.cos(a)*30,r.y+Math.sin(a)*30); await p.waitForTimeout(110); }
      await p.screenshot({path:OUT+'/raw_park'+i+'.png'}); }
    await p.mouse.up(); await ctx.close(); },
  boss: async()=>{ const {ctx,p}=await fresh(); await adopt(p);
    await p.evaluate(()=>{ S.lvl=40; XPANIM.lvl=40; S.energy=100; startPark(true); PK.hp=PK.maxhp=99999; if(PK.round) PK.round.t=999; PK.plusMode=true; });
    await p.waitForTimeout(1200);
    await p.evaluate(()=>{ document.querySelector('#pkDevSword').click(); pkBossStart(); });
    for(let i=0;i<5;i++){ await p.waitForTimeout(3200); await p.screenshot({path:OUT+'/raw_boss'+i+'.png'}); }
    await ctx.close(); },
  herd: async()=>{ const {ctx,p}=await fresh(); await adopt(p);
    await p.evaluate(()=>{ S.lvl=30; XPANIM.lvl=30; S.energy=100; S.herd.applied=true; herdOpenMap(); }); await p.waitForTimeout(900);
    await p.screenshot({path:OUT+'/raw_herdmap.png'});
    await p.evaluate(()=>document.querySelector('.hm-node[data-lv="1"]').click()); await p.waitForTimeout(3000);
    // push the flock up the field: circle behind them and bark now and then
    await p.evaluate(()=>{ let k=0; const t=()=>{ if(!HERD.active) return; const sh=S.herd.shift; const c=herdCentroid(sh); if(c){ const d=sh.dog; const tx=c.x, ty=c.y+60; const dx=tx-d.x, dy=ty-d.y, m=Math.hypot(dx,dy)||1; HERD.joy={dx:dx/m*Math.min(1,m/40),dy:dy/m*Math.min(1,m/40),stick:true}; if(m<30 && (k++%90)===0) herdBark(); } requestAnimationFrame(t); }; requestAnimationFrame(t); });
    for(let i=0;i<4;i++){ await p.waitForTimeout(3500); await p.screenshot({path:OUT+'/raw_herd'+i+'.png'}); }
    await ctx.close(); },
  themes: async()=>{ for(const th of ['biscuit','brat','pocket','scrapbook','spatial','terminal','riso','pitwall']){ const {ctx,p}=await fresh(th); await adopt(p); await p.waitForTimeout(1500); await p.screenshot({path:OUT+'/raw_th_'+th+'.png'}); await ctx.close(); } },
};
for(const [k,f] of Object.entries(scenes)){ if(ONLY.length && !ONLY.includes(k)) continue; await f(); console.log('done',k); }
console.log('pageerrors',errs.length,errs.slice(0,3)); await b.close();
