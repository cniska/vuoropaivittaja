#!/usr/bin/env node
import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const PORT = 3000;
const ROOT = new URL(".", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
};

const server = createServer(async (req, res) => {
  const filePath = join(ROOT, req.url === "/" ? "test.html" : req.url);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(filePath)] ?? "text/plain",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

const url = `http://localhost:${PORT}/test.html`;
server.listen(PORT, () => {
  console.log(`Serving at ${url}`);
  exec(`open "${url}"`);
});
