import { defineConfig } from "vite";
import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectTrackRadii } from "./src/simulation/inspection";
import type { MapState } from "./src/simulation/model";

interface SaveIndexEntry {
  filename: string;
  revision: number;
}

interface SaveIndex {
  version: 1;
  saves: Record<string, SaveIndexEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSaveFile(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || value.formatVersion !== 1 || !isRecord(value.metadata) || !isRecord(value.state)) return false;
  const metadata = value.metadata;
  const state = value.state;
  return typeof metadata.name === "string"
    && metadata.name.trim().length >= 1
    && metadata.name.trim().length <= 80
    && typeof metadata.createdAt === "string"
    && Number.isFinite(Date.parse(metadata.createdAt))
    && typeof metadata.updatedAt === "string"
    && Number.isFinite(Date.parse(metadata.updatedAt))
    && Number.isInteger(state.version);
}

function safeSaveId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ? value : null;
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function aiIntegrationPlugin(): Plugin {
  return {
    name: "save-json-api",
    configureServer(server) {
      const savesDir = path.resolve(process.cwd(), "saves");
      const indexPath = path.join(savesDir, ".save-index.json");
      fs.mkdirSync(savesDir, { recursive: true });

      const readIndex = (): SaveIndex => {
        try {
          const value = JSON.parse(fs.readFileSync(indexPath, "utf8")) as SaveIndex;
          if (value.version === 1 && isRecord(value.saves)) return value;
        } catch {
          // The index is optional and is recreated for a new repository.
        }
        return { version: 1, saves: {} };
      };
      const writeIndex = (index: SaveIndex): void => fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        if (requestUrl.pathname === "/api/server-saves" && req.method === "GET") {
          const index = readIndex();
          const indexed = new Set(Object.values(index.saves).map((entry) => entry.filename));
          const legacy = fs.readdirSync(savesDir).filter((filename) => filename.endsWith(".json") && !filename.startsWith(".") && !indexed.has(filename));
          const entries = [
            ...Object.entries(index.saves).flatMap(([id, entry]) => {
              const filename = entry.filename;
              try {
                const save = JSON.parse(fs.readFileSync(path.join(savesDir, filename), "utf8"));
                return [{ id, revision: entry.revision, filename, metadata: save.metadata }];
              } catch { return []; }
            }),
            ...legacy.flatMap((filename) => {
              try {
                const save = JSON.parse(fs.readFileSync(path.join(savesDir, filename), "utf8"));
                return [{ id: filename, revision: 1, filename, metadata: save.metadata }];
              } catch { return []; }
            }),
          ];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(entries));
          return;
        }

        if (requestUrl.pathname === "/api/server-saves" && req.method === "POST") {
          try {
            const parsed: unknown = JSON.parse(await readBody(req));
            const synchronized = isRecord(parsed) && "save" in parsed;
            const save = synchronized && isRecord(parsed) ? parsed.save : parsed;
            if (!isSaveFile(save)) {
              res.statusCode = 400;
              res.end("Invalid SaveFile");
              return;
            }
            const index = readIndex();
            const requestedId = synchronized && isRecord(parsed) ? safeSaveId(parsed.saveId) : null;
            const id = requestedId ?? randomUUID();
            const current = index.saves[id];
            const expectedRevision = synchronized && isRecord(parsed) && Number.isInteger(parsed.expectedRevision) ? parsed.expectedRevision as number : 0;
            if (current && expectedRevision !== current.revision) {
              res.statusCode = 409;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ id, revision: current.revision }));
              return;
            }
            if (!current && expectedRevision !== 0) {
              res.statusCode = 409;
              res.end(JSON.stringify({ id, revision: 0 }));
              return;
            }
            const revision = (current?.revision ?? 0) + 1;
            const filename = current?.filename ?? `${id}.json`;
            fs.writeFileSync(path.join(savesDir, filename), JSON.stringify(save, null, 2));
            index.saves[id] = { filename, revision };
            writeIndex(index);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, id, revision, filename }));
          } catch {
            res.statusCode = 400;
            res.end("Bad Request");
          }
          return;
        }

        if (requestUrl.pathname === "/api/server-saves/inspect" && req.method === "POST") {
          try {
            const parsed: unknown = JSON.parse(await readBody(req));
            const save = isRecord(parsed) && "save" in parsed ? parsed.save : parsed;
            if (!isSaveFile(save)) {
              res.statusCode = 400;
              res.end("Invalid SaveFile");
              return;
            }
            const inspection = inspectTrackRadii(save.state as unknown as MapState);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(inspection));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Bad Request" }));
          }
          return;
        }

        if (requestUrl.pathname.startsWith("/api/server-saves/") && req.method === "GET") {
          const identifier = decodeURIComponent(requestUrl.pathname.slice("/api/server-saves/".length));
          const index = readIndex();
          const indexed = index.saves[identifier];
          const legacyFilename = path.basename(identifier) === identifier && identifier.endsWith(".json") ? identifier : null;
          const filename = indexed?.filename ?? legacyFilename;
          if (!filename) {
            res.statusCode = 400;
            res.end("Bad Request");
            return;
          }
          const filepath = path.join(savesDir, filename);
          if (!fs.existsSync(filepath)) {
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Save-Id", indexed ? identifier : filename);
          res.setHeader("ETag", `\"${indexed?.revision ?? 1}\"`);
          res.end(fs.readFileSync(filepath, "utf8"));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [aiIntegrationPlugin()],
  test: {
    include: ["tests/**/*.test.{ts,js}"],
  },
});
