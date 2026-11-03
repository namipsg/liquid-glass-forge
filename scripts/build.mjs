import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['core', 'cpu', 'dom', 'webgl', 'react', 'vue']) {
  rmSync(new URL(`../packages/${name}/dist/`, import.meta.url), { recursive: true, force: true });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', `packages/${name}/tsconfig.json`], { cwd: root, stdio: 'inherit', timeout: 60000 });
  const license = new URL('../LICENSE', import.meta.url), destination = new URL(`../packages/${name}/LICENSE`, import.meta.url);
  if (!existsSync(destination) || !readFileSync(license).equals(readFileSync(destination))) copyFileSync(license, destination);
}
copyFileSync(new URL('../packages/dom/src/styles.css', import.meta.url), new URL('../packages/dom/dist/styles.css', import.meta.url));
// Native workers cannot inherit the document import map. Retain a standalone,
// relative ESM graph without a bundler or consumer install hook.
const { writeFileSync } = await import('node:fs');
const cpuDist = new URL('../packages/cpu/dist/', import.meta.url);
copyFileSync(new URL('../packages/core/dist/index.js', import.meta.url), new URL('worker-core.js', cpuDist));
for (const name of ['kernel', 'protocol']) {
  const source = readFileSync(new URL(`${name}.js`, cpuDist), 'utf8')
    .replaceAll("'@liquid-glass-forge/core'", "'./worker-core.js'")
    .replaceAll("'./kernel.js'", "'./worker-kernel.js'");
  writeFileSync(new URL(`worker-${name}.js`, cpuDist), source);
}
const worker = new URL('worker.js', cpuDist);
writeFileSync(worker, readFileSync(worker, 'utf8').replaceAll("'./protocol.js'", "'./worker-protocol.js'"));
const includeAngular = !process.argv.includes('--base');
if(includeAngular)execFileSync(process.execPath,['tools/angular/node_modules/ng-packagr/src/cli/main.js','-p','packages/angular/ng-package.json','-c','packages/angular/tsconfig.lib.json'],{cwd:root,stdio:'inherit',timeout:120000});
console.log(`Built core, DOM, CPU, WebGL, React and Vue ESM/declarations/CSS${includeAngular ? ' plus Angular APF' : ''}; copied project licenses.`);
