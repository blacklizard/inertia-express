import http from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";

/**
 * Issue a QUERY request to an Express app. supertest has no QUERY verb; Node 24
 * lists QUERY in http.METHODS and Express 5 routes it via app.all().
 *
 * @param app The Express app to listen on an ephemeral port.
 * @param path Request path.
 * @param headers Request headers.
 */
export async function queryRequest(app: express.Express, path: string, headers: Record<string, string>) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    return await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path, method: "QUERY", headers }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      });
      req.on("error", reject);
      req.end();
    });
  } finally {
    server.close();
  }
}
