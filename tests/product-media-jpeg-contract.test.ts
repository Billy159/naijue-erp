/** Real Sharp and disposable private media only. No database, network or real images. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,realpath,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PrivateProductMediaStage} from '../adapters/media/src/product-media-stage.ts';
import {SharpProductImageCodec} from '../adapters/media/src/sharp-product-image-codec.ts';
import {PrivateControlledProductMedia} from '../adapters/media/src/controlled-product-media.ts';
import {actor,sid} from './support/synthetic-fixtures.ts';
const productId=sid('product',19001),imageId=sid('product',19002),signal=()=>new AbortController().signal;
for(const kind of ['jpeg','exif','trailing','png','webp'] as const)test('B09 upload-consume-manifest-delivery exact bytes: '+kind,async t=>{
 const root=await mkdtemp(path.join(await realpath(tmpdir()),'b09-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let now=new Date('2026-10-28T00:00:00Z');const codec=new SharpProductImageCodec();
 const source=sharp({create:{width:40,height:20,channels:3,background:'#123456'}});
 const format=kind==='png'||kind==='webp'?kind:'jpeg';
 let bytes=await (kind==='exif'?source.withMetadata({orientation:6}):source).toFormat(format).toBuffer();
 if(kind==='trailing')bytes=Buffer.concat([bytes,Buffer.from(' \nSYNTHETIC_JPEG_TRAILER')]);
 const mime=`image/${format}`,store=new PrivateProductMediaStage({root,rootKey:'synthetic',publicRoots:[root+'-public'],codec,authorize:async()=>{},now:()=>now});
 const uploaded=await store.stage({actor,productId,commandKey:'B09-original-key',uploadKey:kind,declaredMime:mime,bytes,signal:signal()});
 const prepared=await store.consume({actor,productId,commandKey:'B09-original-key',uploadId:uploaded.uploadId,signal:signal()});
 assert.equal(prepared.original.sha256,createHash('sha256').update(bytes).digest('hex'));
 const image={id:imageId,productId,fileRef:prepared.fileRef,mime:prepared.original.mime,byteSize:prepared.original.byteSize,displayOrder:0};
 const provider=new PrivateControlledProductMedia({deliveryOrigin:'https://synthetic.invalid',basePath:'/api',privateRoots:{synthetic:root},publicRoots:[root+'-public'],manifests:store.createManifestResolver(),authorization:{async authorize(){return {productId};}},reader:{async readCurrentImage(){return image;}}});
 now=new Date(now.getTime()+25*3600*1000);
 await assert.rejects(store.consume({actor,productId,commandKey:'B09-original-key',uploadId:uploaded.uploadId,signal:signal()}),{code:'UPLOAD_EXPIRED'});
 const read={actor,productId,grant:{productId},images:[image],signal:signal()};
 for(const variant of ['original','thumbnail'] as const){
  const link=variant==='original'?await provider.resolveOriginal(read):(await provider.resolveThumbnails(read))[0]!;
  const revision=new URL(link.url).pathname.split('/').at(-2)!;
  const result=await provider.deliver({actor,productId,imageId,revision,variant,signal:signal()});
  if(variant==='original')assert.deepEqual(result.bytes,bytes);else assert.equal((await sharp(result.bytes).metadata()).format,'webp');
 }
});
test('B09 corrupt and truncated JPEG cannot publish consumable stage',async t=>{
 const root=await mkdtemp(path.join(await realpath(tmpdir()),'b09-invalid-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bytes=await sharp({create:{width:40,height:20,channels:3,background:'#123456'}}).jpeg().toBuffer();
 const store=new PrivateProductMediaStage({root,rootKey:'synthetic',publicRoots:[root+'-public'],codec:new SharpProductImageCodec(),authorize:async()=>{},now:()=>new Date('2026-10-28T00:00:00Z')});
 for(const [i,bad]of [bytes.subarray(0,Math.floor(bytes.length/2)),Buffer.from([255,216,255,0,0,0,0,0])].entries())await assert.rejects(store.stage({actor,productId,commandKey:'B09-invalid',uploadKey:String(i),declaredMime:'image/jpeg',bytes:bad,signal:signal()}),{code:'INVALID_UPLOAD'});
 assert.deepEqual(await readdir(path.join(root,'stages')),[]);
});
