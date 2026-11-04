import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { app as api, type Env } from "./server/app";
import { watch } from "./build";

try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional; variables may come from the shell.
}

const port = Number(process.env.PORT ?? 8788);
const server = new Hono();

server.all("/admin/api/*", (c) => api.fetch(c.req.raw, process.env as unknown as Env));
server.get("/admin", (c) => c.redirect("/admin/"));
server.use("/admin/*", serveStatic({ root: "./_site" }));
server.use("/css/*", serveStatic({ root: "./src" }));
server.use("/img/*", serveStatic({ root: "./src" }));
server.get("/", (c) => c.redirect("/admin/"));

await watch();
serve({ fetch: server.fetch, port }, () => {
  console.log(`Blog editor: http://localhost:${port}/admin/`);
});
