// The Nendo host checkout these apps run against (ADR-0040 in the host): NENDO_HOST, or
// ../nendo beside this repository. The apps use its MCP client, uploader and view kit from there.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const hostRoot = path.resolve(process.env.NENDO_HOST ?? path.join(here, '..', '..', 'nendo'));
if (!existsSync(path.join(hostRoot, 'src', 'Nendo.Workbench', 'package.json')))
  throw new Error(`No Nendo host checkout at ${hostRoot}. Clone nendo beside nendo-apps, or set NENDO_HOST to one.`);

export const hostPath = (...parts) => path.join(hostRoot, ...parts);
export const hostTool = name => import(pathToFileURL(hostPath('tools', name)).href);
