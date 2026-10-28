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
  console.log('Built core and DOM sources ESM/declarations; copied project licenses.');
