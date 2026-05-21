import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { viteManifestVersion } from "../../src/express/vite-manifest.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "inertia-manifest-"));
}

describe("viteManifestVersion", () => {
  it("returns null when manifest does not exist", async () => {
    const dir = tmp();
    const v = await viteManifestVersion({ manifestPath: join(dir, "missing.json") })();
    expect(v).toBeNull();
  });

  it("hashes manifest content stably", async () => {
    const dir = tmp();
    const path = join(dir, "manifest.json");
    writeFileSync(
      path,
      JSON.stringify({
        "src/main.ts": { file: "assets/main-AAA.js" },
        "src/style.css": { file: "assets/style-BBB.css" },
      }),
    );
    const fn = viteManifestVersion({ manifestPath: path });
    const v1 = await fn();
    const v2 = await fn();
    expect(v1).toBe(v2);
    expect(typeof v1).toBe("string");
    expect(v1?.length).toBe(16);
  });

  it("changes when manifest contents change", async () => {
    const dir = tmp();
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify({ a: { file: "v1.js" } }));
    const fn = viteManifestVersion({ manifestPath: path });
    const v1 = await fn();
    // Bump mtime + content
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(path, JSON.stringify({ a: { file: "v2.js" } }));
    const v2 = await fn();
    expect(v1).not.toBe(v2);
  });

  it("returns null on malformed JSON", async () => {
    const dir = tmp();
    const path = join(dir, "manifest.json");
    writeFileSync(path, "{not json");
    const v = await viteManifestVersion({ manifestPath: path })();
    expect(v).toBeNull();
  });

  it("hashes entries that lack a `file` property by their JSON form", async () => {
    const dir = tmp();
    const path = join(dir, "manifest.json");
    writeFileSync(
      path,
      JSON.stringify({
        plain: "raw-string",
        normal: { file: "assets/x.js" },
      }),
    );
    const v = await viteManifestVersion({ manifestPath: path })();
    expect(typeof v).toBe("string");
    expect(v?.length).toBe(16);
  });

  it("hashes entries where `file` is a non-string value without crashing", async () => {
    const dir = tmp();
    const pathNull = join(dir, "manifest-null.json");
    const pathNum = join(dir, "manifest-num.json");
    writeFileSync(pathNull, JSON.stringify({ "src/main.ts": { file: null } }));
    writeFileSync(pathNum, JSON.stringify({ "src/main.ts": { file: 42 } }));
    const vNull = await viteManifestVersion({ manifestPath: pathNull })();
    const vNum = await viteManifestVersion({ manifestPath: pathNum })();
    expect(typeof vNull).toBe("string");
    expect(vNull?.length).toBe(16);
    expect(typeof vNum).toBe("string");
    expect(vNum?.length).toBe(16);
    expect(vNull).not.toBe(vNum);
  });

  it("watchMtime: false caches even when the file changes", async () => {
    const dir = tmp();
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify({ a: { file: "v1.js" } }));
    const fn = viteManifestVersion({ manifestPath: path, watchMtime: false });
    const v1 = await fn();
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(path, JSON.stringify({ a: { file: "v2.js" } }));
    const v2 = await fn();
    expect(v2).toBe(v1);
  });
});
