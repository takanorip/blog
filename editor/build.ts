import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const clientDir = fileURLToPath(new URL("./client/", import.meta.url));
export const outDir = fileURLToPath(new URL("../_site/admin/", import.meta.url));

const options: esbuild.BuildOptions = {
  entryPoints: [
    { in: `${clientDir}main.ts`, out: "app" },
    { in: `${clientDir}style.css`, out: "app" },
  ],
  outdir: outDir,
  bundle: true,
  format: "esm",
  target: ["es2022", "safari16"],
  minify: true,
  sourcemap: true,
  logLevel: "info",
};

const copyStatic = async () => {
  await mkdir(outDir, { recursive: true });
  await copyFile(`${clientDir}index.html`, `${outDir}index.html`);
  await copyFile(
    `${clientDir}manifest.webmanifest`,
    `${outDir}manifest.webmanifest`,
  );
};

export const watch = async () => {
  await copyStatic();
  const ctx = await esbuild.context(options);
  await ctx.watch();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await copyStatic();
  await esbuild.build(options);
}
