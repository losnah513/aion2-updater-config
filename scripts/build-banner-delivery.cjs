'use strict';
// Lossy delivery derivatives only: originals, asset IDs and playlists stay unchanged.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require(process.env.SHARP_MODULE||'sharp');
const sources=['2026/09/785ddeaa-480d-4410-8bc7-55b0dd8a6813.png','2026/08/ad45f799-0f19-4425-ad56-e5bc92380f04.png','2026/08/98fb449f-540f-4152-a164-042af9033bf9.png'];
(async()=>{for(const source of sources){
 const url='https://josvoltpktvwysrasffq.supabase.co/storage/v1/object/public/kinojo-site-banners/'+source;
 const response=await fetch(url);if(!response.ok)throw Error('source HTTP '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 const metadata=await sharp(bytes).metadata();
 const output=await sharp(bytes).webp({quality:86,effort:6}).toBuffer();
 if(output.length>600*1024)throw Error('MAIN delivery exceeds 600KB');
 const file=path.resolve(__dirname,'../assets/images/common',path.basename(source,'.png')+'.webp');
 fs.writeFileSync(file,output);
 console.log(JSON.stringify({source,url,width:metadata.width,height:metadata.height,sourceBytes:bytes.length,deliveryBytes:output.length,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),deliverySha256:crypto.createHash('sha256').update(output).digest('hex')}));
}})().catch(e=>{console.error(e);process.exitCode=1;});
