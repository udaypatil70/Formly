import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  noExternal: ["@repo"], // transpile and bundle all `@repo/*` workspace packages
  splitting: false,
  bundle: true,
  outDir: "./dist",
  clean: true,
  env: { IS_SERVER_BUILD: "true" },
  loader: { ".json": "copy" },
  minify: true,
  sourcemap: false,
});
