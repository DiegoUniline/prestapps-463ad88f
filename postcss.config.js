import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const resolveFromProject = (packageName) => {
  try {
    return require(path.join(process.cwd(), "node_modules", packageName));
  } catch {
    return require(packageName);
  }
};

const tailwindcss = resolveFromProject("tailwindcss");
const autoprefixer = resolveFromProject("autoprefixer");

export default {
  plugins: [tailwindcss(), autoprefixer()],
};
