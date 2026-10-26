import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(new URL('../packages/core/dist/', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'packages/core/tsconfig.json'], { cwd: root, stdio: 'inherit', timeout: 60000 });
const license = new URL('../LICENSE', import.meta.url), destination = new URL('../packages/core/LICENSE', import.meta.url);
if (!existsSync(destination) || !readFileSync(license).equals(readFileSync(destination))) copyFileSync(license, destination);
console.log('Built core ESM and declarations; copied project license.');
