'use strict';

const assert=require('node:assert/strict');
const contract=require('../ui/kinojo-my-info-image-contract.js');
const upload=require('../ui/kinojo-my-info-image-upload.js');

const result={
  slot:'FRONT',blob:{size:12345,type:'image/webp'},mimeType:'image/webp',width:800,height:1200,
  outputReady:true,uploadConnected:false,originalUploaded:false,metadataStripped:true
};
const valid=upload.validateEditedOutput(result,contract);
assert.equal(valid.slot,'FRONT');
assert.equal(valid.sizeBytes,12345);
assert.throws(()=>upload.validateEditedOutput({...result,width:799},contract),/EDITED_IMAGE_DIMENSIONS_INVALID/);
assert.throws(()=>upload.validateEditedOutput({...result,mimeType:'image/png'},contract),/EDITED_IMAGE_WEBP_REQUIRED/);
assert.throws(()=>upload.validateEditedOutput({...result,originalUploaded:true},contract),/EDITED_IMAGE_BOUNDARY_INVALID/);

const prepared=upload.validatePreparedUpload({ok:true,upload:{
  bucket:'kinojo-member-reference',objectPath:'characters/41/FRONT/0123456789abcdef0123456789abcdef.webp',
  uploadUrl:'https://example.supabase.co/storage/v1/object/upload/sign/kinojo-member-reference/x?token=signed',
  upsert:false,mimeType:'image/webp',sizeBytes:12345
}}, {...valid,characterId:41});
assert.equal(prepared.bucket,'kinojo-member-reference');
assert.throws(()=>upload.validatePreparedUpload({ok:true,upload:{...prepared,upsert:true,mimeType:'image/webp',sizeBytes:12345}}, {...valid,characterId:41}),/EDITED_IMAGE_UPLOAD_PREPARE_INVALID/);

assert.equal(upload.validateCompletedPixels({upload:{pixelVerified:true,pixelContract:'B3',pixelWidth:800,pixelHeight:1200}},valid),true);
assert.throws(()=>upload.validateCompletedPixels({upload:{pixelVerified:true,pixelContract:'B3',pixelWidth:800,pixelHeight:1199}},valid),/EDITED_IMAGE_SERVER_PIXELS_INVALID/);
assert.throws(()=>upload.validateCompletedPixels({upload:{pixelVerified:false,pixelContract:'B3',pixelWidth:800,pixelHeight:1200}},valid),/EDITED_IMAGE_SERVER_PIXELS_INVALID/);

assert.deepEqual(upload.constants.SLOT_KEYS,['PROFILE','FRONT','BACK','UPPER_BODY']);
assert.equal(upload.constants.MAX_BYTES,5*1024*1024);

console.log('KINOJO My Info edited-image safe upload contract: PASS');
