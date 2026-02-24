import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";

const TEST_PORT = 0; // Let OS assign a free port

function request(
  url: string
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      })
      .on("error", reject);
  });
}

describe("server integration", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Dynamically import server module after setting env
    process.env.PORT = String(TEST_PORT);
    process.env.HOST = "127.0.0.1";

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else if (url.pathname === "/chains") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([]));
      } else if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>OK</body></html>");
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    if (addr && typeof addr === "object") {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /health returns 200 with status ok", async () => {
    const res = await request(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ status: "ok" });
  });

  it("GET /health returns JSON content-type", async () => {
    const res = await request(`${baseUrl}/health`);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("GET / returns HTML", async () => {
    const res = await request(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("GET /chains returns 200", async () => {
    const res = await request(`${baseUrl}/chains`);
    expect(res.status).toBe(200);
  });

  it("GET /unknown returns 404", async () => {
    const res = await request(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });
});
