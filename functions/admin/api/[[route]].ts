import { handle } from "hono/cloudflare-pages";
import { app } from "../../../editor/server/app";

export const onRequest = handle(app);
