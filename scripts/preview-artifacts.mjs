import {readFileSync} from 'node:fs';
import path from 'node:path';
import {digest,integrity,inspectTarball} from './distribution-artifacts.mjs';

export function loadPreview(file) {
  file=path.resolve(file);const bundle=JSON.parse(readFileSync(file));
  const expected=['core','cpu','dom','webgl','react','vue','angular'];
  if(bundle.kind!=='experimental-preview'||bundle.version!=='0.1.0-rc.1'||bundle.tag!=='next'||bundle.qualified!==false||bundle.testsDeferred!==true)throw Error('Expected the explicitly unqualified owner-directed preview');
  if(bundle.artifacts?.length!==7||new Set(bundle.artifacts.map(a=>a.name)).size!==7||bundle.artifacts.some(a=>!expected.includes(a.name)))throw Error('Exact seven-package preview required');
  for(const a of bundle.artifacts){
    if(path.basename(a.tarball)!==a.tarball)throw Error('Unsafe artifact path');
    const tarball=path.join(path.dirname(file),a.tarball),bytes=readFileSync(tarball);
    if(digest(bytes)!==a.sha256||integrity(bytes)!==a.integrity)throw Error('Preview artifact bytes changed: '+a.name);
    const inspected=inspectTarball(tarball,a.name,bundle.version);
    if(inspected.manifest.private!==false||JSON.stringify(inspected.fileSha256)!==JSON.stringify(a.fileSha256))throw Error('Preview package metadata/inventory changed');
    if(inspected.manifest.gitHead)throw Error('Working-tree preview must not claim an old gitHead');
  }
  return {file,bundle};
}
