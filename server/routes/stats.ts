import { Hono } from "hono";
import { computeStats } from "../derive/stats.ts";

const app = new Hono();

app.get("/", (c) => c.json(computeStats()));

export default app;
