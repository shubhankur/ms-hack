import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./config.js";
import { closePool, listEvents, listTracks, setupDatabase } from "./db.js";
import { chatRecommendEvents, recommendEvents } from "./matcher.js";
import { syncTechWeek } from "./techWeek.js";

const port = Number(process.env.PORT || 8000);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return sendFile(response, "public/index.html", "text/html; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/app.css") {
      return sendFile(response, "public/app.css", "text/css; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/app.js") {
      return sendFile(response, "public/app.js", "application/javascript; charset=utf-8");
    }

    if (request.method === "GET" && url.pathname === "/tracks") {
      return sendJson(response, { tracks: await listTracks() });
    }

    if (request.method === "GET" && url.pathname === "/events") {
      const limit = Number(url.searchParams.get("limit") || 25);
      return sendJson(response, { events: await listEvents({ limit }) });
    }

    if (request.method === "POST" && url.pathname === "/sync") {
      return sendJson(response, await syncTechWeek());
    }

    if (request.method === "POST" && url.pathname === "/recommend") {
      const body = await readJson(request);
      return sendJson(
        response,
        { events: await recommendEvents({ message: body.message, limit: body.limit || 10 }) }
      );
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      const body = await readJson(request);
      return sendJson(
        response,
        await chatRecommendEvents({
          message: body.message,
          messages: body.messages || [],
          limit: body.limit || 10,
        })
      );
    }

    if (request.method === "POST" && url.pathname === "/setup") {
      await setupDatabase();
      return sendJson(response, { ok: true });
    }

    sendJson(response, { error: "not_found" }, 404);
  } catch (error) {
    sendJson(response, { error: error.name, message: error.message }, 500);
  }
});

server.listen(port, () => {
  console.log(`Listening on http://127.0.0.1:${port}`);
});

process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

function sendJson(response, payload, status = 200) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function sendFile(response, relativePath, contentType) {
  const filePath = path.join(rootDir, relativePath);
  const body = await fs.readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
