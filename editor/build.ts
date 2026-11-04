import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const clientDir = fileURLToPath(new URL("./client/", import.meta.url));
const tailwindBin = fileURLToPath(
  new URL("../node_modules/.bin/tailwindcss", import.meta.url),
);
export const outDir = fileURLToPath(new URL("../_site/admin/", import.meta.url));

const options = (dev: boolean): esbuild.BuildOptions => ({
  entryPoints: [{ in: `${clientDir}main.tsx`, out: "app" }],
  outdir: outDir,
  bundle: true,
  format: "esm",
  target: ["es2022", "safari16"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  minify: !dev,
  sourcemap: true,
  logLevel: "info",
});

const tailwind = (watch: boolean) =>
  new Promise<void>((resolve, reject) => {
    const args = ["-i", `${clientDir}style.css`, "-o", `${outDir}app.css`, "--minify"];
    if (watch) args.push("--watch");
    const child = spawn(tailwindBin, args, { stdio: "inherit" });
    if (watch) {
      child.on("spawn", () => resolve());
    } else {
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`tailwindcss exited with ${code}`)),
      );
    }
    child.on("error", reject);
  });

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
  await tailwind(true);
  const ctx = await esbuild.context(options(true));
  await ctx.watch();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await copyStatic();
  await Promise.all([esbuild.build(options(false)), tailwind(false)]);
}
