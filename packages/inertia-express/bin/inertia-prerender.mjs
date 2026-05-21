#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { argv, exit, stderr, stdout } from "node:process";
import { prerender } from "../dist/express/index.js";

function usage() {
  return `\
Usage: inertia-prerender [options]

Options:
  --base-url <url>          Origin to fetch from (e.g. http://127.0.0.1:3000)   [required]
  --routes <file>           Path to JSON file containing an array of routes, OR
  --route <path>            Repeatable. Single route, e.g. --route /
  --mode <static|warmup|both>   Default "warmup"
  --out-dir <path>          Required when --mode includes static
  --concurrency <n>         Default 4
  --timeout-ms <n>          Per-request timeout. Default 30000
  --header <K: V>           Repeatable. Extra request header
  --fail-on-error           Exit non-zero if any route fails
  --quiet                   Suppress per-route lines
  --help                    Show this help
`;
}

function parseArgs(argv) {
  const args = {
    routes: [],
    headers: {},
    mode: "warmup",
    concurrency: 4,
    timeoutMs: 30000,
    failOnError: false,
    quiet: false,
  };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = () => tokens[++i];
    switch (token) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--base-url":
        args.baseUrl = next();
        break;
      case "--routes":
        args.routesFile = next();
        break;
      case "--route":
        args.routes.push(next());
        break;
      case "--mode":
        args.mode = next();
        break;
      case "--out-dir":
        args.outDir = next();
        break;
      case "--concurrency":
        args.concurrency = Number(next());
        break;
      case "--timeout-ms":
        args.timeoutMs = Number(next());
        break;
      case "--header": {
        const raw = next();
        const idx = raw.indexOf(":");
        if (idx === -1) {
          throw new Error(`bad --header: ${raw}`);
        }
        args.headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
        break;
      }
      case "--fail-on-error":
        args.failOnError = true;
        break;
      case "--quiet":
        args.quiet = true;
        break;
      default:
        throw new Error(`unknown argument: ${token}`);
    }
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    stderr.write(`error: ${err.message}\n${usage()}`);
    exit(2);
  }
  if (args.help) {
    stdout.write(usage());
    return;
  }
  if (!args.baseUrl) {
    stderr.write(`error: --base-url required\n${usage()}`);
    exit(2);
  }

  let routes = args.routes;
  if (args.routesFile) {
    const raw = await readFile(args.routesFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      stderr.write(`error: ${args.routesFile} must contain an array\n`);
      exit(2);
    }
    routes = [...parsed, ...routes];
  }
  if (routes.length === 0) {
    stderr.write(`error: no routes provided (use --route or --routes)\n`);
    exit(2);
  }

  const summary = await prerender({
    baseUrl: args.baseUrl,
    routes,
    mode: args.mode,
    outDir: args.outDir,
    concurrency: args.concurrency,
    timeoutMs: args.timeoutMs,
    headers: args.headers,
  });

  if (!args.quiet) {
    for (const r of summary.results) {
      const tag = r.error ? "FAIL" : `${r.status}`;
      stdout.write(
        `[${tag}] ${r.route} (${r.durationMs}ms, ${r.bytes}B)${r.outputPath ? ` -> ${r.outputPath}` : ""}${r.error ? ` -- ${r.error}` : ""}\n`,
      );
    }
  }
  stdout.write(`done: ${summary.ok}/${summary.total} ok, ${summary.failed} failed\n`);

  if (args.failOnError && summary.failed > 0) {
    exit(1);
  }
}

main().catch((err) => {
  stderr.write(`fatal: ${err.stack ?? err.message}\n`);
  exit(1);
});
