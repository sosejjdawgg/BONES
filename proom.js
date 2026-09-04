const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
const F='file://'+__dirname+'/bones-latest.html';
(async()=>{
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:414,height:896}, deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await pg.goto(F); await pg.waitForTimeout(1700);
  await pg.evaluate(()=>{ const n=document.querySelector('#btnNewGame'); if(n&&n.offsetParent!==null) n.click(); });
  await pg.waitForTimeout(250);
  await pg.click('#breedBones').catch(()=>{}); await pg.waitForTimeout(150);
  await pg.click('#adopt').catch(()=>{}); await pg.waitForTimeout(1600);
  await pg.evaluate(()=>{ S.lvl=20; XPANIM.lvl=20; S.ballOwned=true; S.bedTier=2; BOWL.level=0.8; FBOWL.level=0.8; });
  await pg.waitForTimeout(1200);
  console.log('ERRORS:', errs.length?errs.slice(0,6):'none');
  const st=await pg.evaluate(()=>({state:CAM.state,x:+CAM.x.toFixed(3),z:+CAM.z.toFixed(3),
     oct:CAM.oct, ball:{x:+BALL.x.toFixed(3),z:+BALL.z.toFixed(3),hz:+BALL.hz.toFixed(3)},
     rm:{y0:+rmY(0).toFixed(3),y1:+rmY(1).toFixed(3),sc0:+rmSc(0).toFixed(3),sc1:+rmSc(1).toFixed(3)}}));
  console.log('STATE ', JSON.stringify(st));
  await pg.screenshot({path:'room0.png'});
  // walk him about and grab a few
  for(let i=0;i<3;i++){
    await pg.evaluate((k)=>{ CAM.state="walk"; CAM.bedTarget=false;
      CAM.wander={x:[0.20,0.80,0.5][k], z:[0.12,0.55,0.92][k]}; }, i);
    await pg.waitForTimeout(2200);
    await pg.screenshot({path:'room_w'+i+'.png'});
  }
  // ...and a puppy, which is the size that was unreadable
  await pg.evaluate(()=>{ S.lvl=1; XPANIM.lvl=1; CAM.state="walk"; CAM.wander={x:0.3,z:0.25}; });
  await pg.waitForTimeout(2200);
  await pg.screenshot({path:'room_pup.png'});
  await b.close();
})();
