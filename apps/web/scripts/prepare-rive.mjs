import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const output = new URL('../public/brand/', import.meta.url);
await mkdir(output, { recursive: true });
await copyFile(join(dirname(require.resolve('@rive-app/canvas')), 'rive.wasm'), new URL('rive.wasm', output));
