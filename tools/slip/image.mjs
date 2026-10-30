// A Slip image with its kernel loaded, for the tests: what the view does on boot, from disk.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Image, KERNEL_FILES } from '../../extensions/slip/vm/image.mjs';

export const root = path.resolve(import.meta.dirname, '../../extensions/slip');
export const kernelSource = name => readFileSync(path.join(root, 'kernel', name), 'utf8');
export const kernelOnDisk = () => readdirSync(path.join(root, 'kernel')).filter(f => f.endsWith('.st')).sort();

/** A fresh image; `transcript` collects what Transcript shows. Kernel errors throw. */
export function bootImage(hooks = {}) {
  const shown = [];
  const image = new Image({ transcript: text => shown.push(text), ...hooks });
  image.vm.quiet++;
  try {
    for (const name of KERNEL_FILES) {
      const result = image.fileIn(kernelSource(name), name);
      if (result.errors.length) throw new Error(`The kernel did not load: ${result.errors.join('; ')}`);
    }
  } finally { image.vm.quiet--; }
  image.shown = shown;
  return image;
}
