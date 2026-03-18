import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const projectRoot = new URL(".", import.meta.url);
const nodeModules = join(pathToFileURL(process.cwd()).href, "node_modules");

register("data:text/javascript," + encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    return nextResolve(specifier, context);
  }
`), projectRoot);
