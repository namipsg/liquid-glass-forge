import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['core', 'dom']) {
  rmSync(new URL(`../packages/${name}/dist/`, import.meta.url), { recursive: true, force: true });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', `packages/${name}/tsconfig.json`], { cwd: root, stdio: 'inherit', timeout: 60000 });
  const license = new URL('../LICENSE', import.meta.url), destination = new URL(`../packages/${name}/LICENSE`, import.meta.url);
  if (!existsSync(destination) || !readFileSync(license).equals(readFileSync(destination))) copyFileSync(license, destination);
}
copyFileSync(new URL('../packages/dom/src/styles.css', import.meta.url), new URL('../packages/dom/dist/styles.css', import.meta.url));
console.log('Built core and DOM ESM/declarations/CSS; copied project licenses.');
