// Run against Vite. PLAYWRIGHT_PATH and EXECUTABLE_PATH select a local Chromium.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base=process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const modelDir=new URL('../public/assets/unseal/models/',import.meta.url);
const artDir=new URL('../public/assets/cases/workshop/',import.meta.url);
await Promise.all([mkdir(modelDir,{recursive:true}),mkdir(artDir,{recursive:true})]);
const ids=process.argv.slice(2);
if(!ids.length)ids.push('foundry','relay','pelagic','aperture','salt-flat','signal-flag','polar-night','blackbird');
const browser=await chromium.launch({headless:true,executablePath:process.env.EXECUTABLE_PATH});
try {
  const page=await browser.newPage({viewport:{width:1200,height:825},deviceScaleFactor:1});
  await page.route('**/__workshop__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block;width:1200px;height:825px}</style><main></main>'}));
  await page.goto(new URL('/__workshop__',base).href);
  for(const id of ids) {
    const encoded=await page.evaluate(async id=>{
      const {buildWorkshopModel}=await import('/scripts/workshop-model.mjs');
      return buildWorkshopModel(id);
    },id);
    await writeFile(fileURLToPath(new URL(id+'.glb',modelDir)),Buffer.from(encoded,'base64'));
    const art=await page.evaluate(async id=>{
      const {createInspectionScene}=await import('/src/inspection-scene.ts');
      const {cases}=await import('/src/data/cases.ts');
      const item=cases.find(c=>c.id===id);
      if(!item)throw new Error('Unknown workshop model '+id);
      const canvas=document.createElement('canvas');
      document.querySelector('main').replaceChildren(canvas);
      const controller=new AbortController();
      try {
        const scene=await createInspectionScene(canvas,item,controller.signal);
        scene.render(0);
        const shot=document.createElement('canvas');shot.width=canvas.width;shot.height=canvas.height;
        const c=shot.getContext('2d',{willReadFrequently:true});c.drawImage(canvas,0,0);
        const {data}=c.getImageData(0,0,shot.width,shot.height);
        let left=shot.width,top=shot.height,right=0,bottom=0;
        for(let y=0;y<shot.height;y++)for(let x=0;x<shot.width;x++){
          if(data[(y*shot.width+x)*4+3]<140)continue;
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        const w=right-left+1,h=bottom-top+1;
        const output=document.createElement('canvas');output.width=960;output.height=640;
        const scale=Math.min(output.width*.89/w,output.height*.82/h);
        const ctx=output.getContext('2d');
        ctx.imageSmoothingQuality='high';
        ctx.drawImage(shot,(output.width-w*scale)/2-left*scale,(output.height-h*scale)/2-top*scale,shot.width*scale,shot.height*scale);
        const webp=canvas=>canvas.toDataURL('image/webp',.94).split(',')[1];
        let hero;
        if(id==='foundry') {
          scene.render(0,-.26);
          c.clearRect(0,0,shot.width,shot.height);
          c.drawImage(canvas,0,0);
          hero=webp(shot);
        }
        return { card:webp(output), hero };
      } finally {controller.abort();}
    },id);
    await writeFile(fileURLToPath(new URL(id+'.webp',artDir)),Buffer.from(art.card,'base64'));
    if(art.hero)await writeFile(fileURLToPath(new URL('../features/foundry-inspect.webp',artDir)),Buffer.from(art.hero,'base64'));
    console.log('Workshop model and catalogue art:',id);
  }
} finally {await browser.close();}

