/**
 * Bundle to one self-contained IIFE, plus its stylesheet.
 *
 * IIFE rather than an ES module because the site loads plain
 * `<script src defer>` and has no module anywhere. The shared core is bundled
 * IN rather than loaded separately, so the whole tool is one file with no load
 * order for anyone integrating it to get wrong - worth a few KB of duplication
 * across tools.
 *
 * Deliberately not minified. The site's own scripts are hand-written and
 * readable, this is a public repo people may well read, and the file is small
 * either way. Cache-busting is the site's job and it does it by content hash.
 */

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const banner = `/*! ${pkg.name} v${pkg.version} - ${pkg.license}
 * ${pkg.homepage}
 * Runs entirely in the browser. No network requests, no storage.
 */`;

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/watermarker.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  banner: { js: banner },
  metafile: true,
});

await build({
  entryPoints: ["src/style.css"],
  outfile: "dist/watermarker.css",
  bundle: true,
  minify: false,
  banner: { css: banner },
});

const out = result.metafile.outputs["dist/watermarker.js"];
const css = await readFile(new URL("../dist/watermarker.css", import.meta.url));

// Written next to the bundle so whoever integrates it can see at a glance what
// they are dropping into the site, without running anything.
await writeFile(
  new URL("../dist/BUILD.txt", import.meta.url),
  [
    `${pkg.name} v${pkg.version}`,
    `js   ${out.bytes} bytes`,
    `css  ${css.length} bytes`,
    "",
    "Drop both into the site's assets directory and reference them from the",
    "page. The script is a plain IIFE - no module, no defer requirement beyond",
    "the site's own convention. It does nothing unless the page contains an",
    "element with a data-pfc attribute.",
    "",
  ].join("\n"),
);

console.log(`built  js ${out.bytes}B  css ${css.length}B`);
