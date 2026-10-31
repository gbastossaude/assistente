import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/** Gera o manifest.json: versão do package.json e connect-src restrito ao projeto Supabase configurado. */
function manifestPlugin(env: Record<string, string>): Plugin {
  return {
    name: "manifest",
    generateBundle() {
      const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"));
      const manifest = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "manifest.template.json"), "utf8"));
      manifest.version = pkg.version;
      if (env.VITE_EXTENSION_NAME) manifest.name = env.VITE_EXTENSION_NAME;
      if (env.VITE_SUPABASE_URL) {
        const url = new URL(env.VITE_SUPABASE_URL);
        const wss = `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`;
        manifest.content_security_policy = {
          extension_pages: `script-src 'self'; object-src 'self'; connect-src 'self' ${url.origin} ${wss}; img-src 'self' data: ${url.origin}`,
        };
      }
      this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "VITE_");
  return {
    base: "./",
    envDir: path.resolve(import.meta.dirname, "../.."),
    plugins: [react(), tailwindcss(), manifestPlugin(env)],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      target: "chrome116",
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        input: {
          sidepanel: path.resolve(import.meta.dirname, "sidepanel.html"),
          background: path.resolve(import.meta.dirname, "src/background.ts"),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
        },
      },
    },
  };
});
