import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const projectNodeModules = path.join(process.cwd(), "node_modules");
const existingNodePath = process.env.NODE_PATH ?? "";
const nodePathEntries = existingNodePath.split(path.delimiter).filter(Boolean);

if (!nodePathEntries.includes(projectNodeModules)) {
  process.env.NODE_PATH = [projectNodeModules, ...nodePathEntries].join(path.delimiter);
  Module._initPaths();
}

const require = createRequire(import.meta.url);
const projectRequire = createRequire(path.join(process.cwd(), "package.json"));

const resolvePackage = (packageName) => {
  try {
    return projectRequire(packageName);
  } catch {
    return require(packageName);
  }
};

const tailwindcss = resolvePackage("tailwindcss");
const autoprefixer = resolvePackage("autoprefixer");

export default {
  plugins: [tailwindcss(), autoprefixer()],
};
