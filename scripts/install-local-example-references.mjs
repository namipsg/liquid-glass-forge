import{readFile,writeFile,mkdir}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
const args=process.argv.slice(2),at=args.indexOf('--manifest');if(at<0)throw Error('--manifest required');const file=path.resolve(args[at+1]),manifest=JSON.parse(await readFile(file));
if(manifest.schemaVersion!==1||!Array.isArray(manifest.references)||manifest.references.some(r=>r.physical!==false||!['iphone','ipad'].includes(r.deviceClass)||!/^[-a-z0-9]+\.png$/.test(r.file)||!/^[a-f0-9]{64}$/.test(r.sha256)))throw Error('Expected simulator-only Safari references');
await readFile('showcase/dist/examples.html');const out='showcase/dist/examples/references';await mkdir(out,{recursive:true});
for(const ref of manifest.references){const bytes=await readFile(path.join(path.dirname(file),ref.file));if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('Capture hash mismatch');await writeFile(path.join(out,ref.file),bytes);}
await writeFile(path.join(out,'index.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({localOnly:true,publicDeployment:false,references:manifest.references.length,out}));
