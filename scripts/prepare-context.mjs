import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, lstatSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Prepare ordinary WireMock files; no additional server or client protocol.
export function withContext(value, context) {
  if (typeof value === 'string') {
    return value.replaceAll('{{request.baseUrl}}/rest/', '{{request.baseUrl}}' + context + '/rest/')
      .replace(/request\.pathSegments\.\[(\d+)\]/g, (_, index) => 'request.pathSegments.[' + (Number(index) + (context ? 1 : 0)) + ']')
      .replace(/^\/rest\//, context + '/rest/');
  }
  if (Array.isArray(value)) return value.map(item => withContext(item, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, key === 'context' && item === '' ? context : withContext(item, context)]));
  return value;
}

export function prepareContext() {
  for (const product of ['jira', 'confluence']) {
    const context = process.env[product.toUpperCase() + '_CONTEXT'] ?? '';
    if (!['', '/' + product].includes(context)) throw new Error('Unsupported context for ' + product);
  }
  for (const product of ['jira', 'confluence']) {
    const context = process.env[product.toUpperCase() + '_CONTEXT'] ?? '';
    const source = resolve('services', product);
    const target = resolve('.runtime', product);
    // Only the two fixed staging directories may be replaced; never follow a symlink.
    if (existsSync(resolve('.runtime')) && lstatSync(resolve('.runtime')).isSymbolicLink()) throw new Error('Symlink staging root');
    if (target !== resolve('.runtime') + (process.platform === 'win32' ? '\\' : '/') + product) throw new Error('Unsafe staging path');
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error('Symlink staging product');
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    for (const dir of ['mappings', '__files']) {
      cpSync(resolve(source, dir), resolve(target, dir), { recursive: true });
      const visit = path => {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const file = resolve(path, entry.name);
          if (entry.isDirectory()) visit(file);
          else if (entry.name.endsWith('.json')) writeFileSync(file,
            JSON.stringify(withContext(JSON.parse(readFileSync(file, 'utf8')), context), null, 2) + '\n');
        }
      };
      visit(resolve(target, dir));
    }
    console.log(product + ': prepared .runtime/' + product + ' context=' + JSON.stringify(context));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) prepareContext();
