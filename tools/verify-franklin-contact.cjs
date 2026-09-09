const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader']});
 const out=path.join(__dirname,'../shots-zero-stage/franklin-contact');fs.mkdirSync(out,{recursive:true});
 try {
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:700},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5173/');
   await page.waitForFunction(()=>window.__buildanta?.intro&&window.__zeroMirrorStageBridge?.state.ready&&!document.querySelector('.preload'),null,{timeout:60000});
   const seek=async(source)=>page.evaluate(source=>{const {intro,lenis}=window.__buildanta;const y=intro.st.start+intro.rawForZeroStage(source)*(intro.st.end-intro.st.start);lenis.scrollTo(y,{immediate:true,force:true});},source);
   await seek(.98);
   await page.waitForFunction(()=>window.__zeroMirrorStageBridge.state.progress>.979);
   assert.equal(await page.evaluate(()=>window.__buildanta.intro.franklinPlayback.active),false);
   await seek(.991);
   await page.waitForFunction(()=>window.__buildanta.intro.franklinPlayback.active);
   await page.waitForFunction(()=>window.__buildanta.intro.franklinPlayback.elapsed>.6);
   assert.equal(await page.evaluate(()=>window.__zeroMirrorStageBridge.state.opacity),0);
   await page.mouse.wheel(0,5000);
   assert.equal(await page.evaluate(()=>window.__buildanta.intro.franklinPlayback.active),true);
   assert.ok(await page.evaluate(()=>{const i=window.__buildanta.intro;const b=.768+.848*.224;const local=.945+.053*i.franklinPlayback.elapsed/4.7;return Math.abs(i.progress-(b+(local-.945)/.055*(.992-b)))<.001;}));
   await page.screenshot({path:path.join(out,`${mobile?'phone':'desktop'}-arrival.png`)});
   await page.waitForFunction(()=>window.__buildanta.intro.franklinPlayback.elapsed>1.8,null,{timeout:20000});
   await page.screenshot({path:path.join(out,`${mobile?'phone':'desktop'}-burn.png`)});
   await page.waitForFunction(()=>!window.__buildanta.intro.franklinPlayback.active,null,{timeout:20000});
   assert.equal(await page.evaluate(()=>window.__buildanta.intro.franklinPlayback.elapsed),4.7);
   // Back before contact rearms; one new forward contact can start a replay.
   await seek(.97);
   await page.waitForFunction(()=>!window.__buildanta.intro.franklinPlayback.played);
   await seek(.991);await page.waitForFunction(()=>window.__buildanta.intro.franklinPlayback.active);
   if(mobile){
    const blocked=await page.evaluate(()=>{
     const send=(type,y)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:[{clientY:y}]});window.dispatchEvent(e);return e;};
     send('touchstart',500);const forward=send('touchmove',400);send('touchmove',410);
     return forward.defaultPrevented&&forward.lenisStopPropagation;
    });
    assert.equal(blocked,true);
   }else await page.mouse.wheel(0,-100);
   await page.waitForFunction(()=>!window.__buildanta.intro.franklinPlayback.active);
   // The former unburned scroll window must resolve to active burn too.
   for(const p of [.958,.965,.972]){
    await page.evaluate(p=>{const {intro,lenis}=window.__buildanta;lenis.scrollTo(intro.st.start+intro.rawForP(p)*(intro.st.end-intro.st.start),{immediate:true,force:true});},p);
    await page.waitForFunction(p=>Math.abs(window.__buildanta.intro.progress-p)<.0002,p);
    assert.ok(await page.evaluate(()=>parseFloat(document.querySelector('.consult-zero').style.getPropertyValue('--zero-progress'))>=.945));
   }
   assert.deepEqual(errors,[]);
   console.log(`${mobile?'phone':'desktop'}: contact trigger, automatic arrival/burn/end, reverse replay/cancel PASS`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
