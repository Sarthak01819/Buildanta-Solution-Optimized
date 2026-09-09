const fs = require('fs'), path = require('path');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:700}});
    await page.goto('file:///C:/Users/sarth/Desktop/Buildanta%20site/burningfranklin/index.html');
    await page.locator('#play').click();
    const out = path.join(__dirname,'../shots-zero-stage/franklin-player'); fs.mkdirSync(out,{recursive:true});
    for (const value of [300,650,875]) {
      await page.locator('#scrub').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.screenshot({path:path.join(out,`${value}.png`)});
    }
    console.log(out);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
