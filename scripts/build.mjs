import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
const wasm = await readFile("vendor/dds/dds.wasm");
if (!wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])))
  throw new Error(
    "Missing or invalid DDS WebAssembly binary. Run npm run build:wasm.",
  );
for (const file of [
  "index.html",
  "styles.css",
  "favicon.svg",
  "src",
  "vendor",
  "samples",
])
  await cp(file, `dist/${file}`, { recursive: true });
await writeFile("dist/.nojekyll", "");
console.log("Static site ready in dist/ (DDS WASM included).");
