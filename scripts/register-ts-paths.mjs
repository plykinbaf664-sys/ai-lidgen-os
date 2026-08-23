import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const base = path.join(root, specifier.slice(2));
    const filename = path.extname(base) ? base : `${base}.ts`;
    if (!existsSync(filename)) return nextResolve(specifier, context);
    return { url: pathToFileURL(filename).href, shortCircuit: true };
  },
});
