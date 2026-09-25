// #503 AC1 probe: a hung Woolworths upstream through the REAL client, the REAL
// app-wide woolworthsQueue and the REAL ProductMatchService, over real fetch.
// Usage (from backend/, placeholder Supabase env):
//   tsx hung-woolworths-probe.mts "$PWD" <hard cap seconds> <search|seed|slowseed>
import net from "node:net";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const backend = process.argv[2];
const capSeconds = Number(process.argv[3] ?? 25);
const mode = process.argv[4] ?? "search";
let seedCount = 0;
const imp = (rel: string) =>
  import(pathToFileURL(path.join(backend, rel)).href);

const { createWoolworthsClient } = await imp(
  "src/services/woolworthsClient.ts",
);
const { createProductMatchService } = await imp(
  "src/services/ProductMatchService.ts",
);
const RedisMock = (
  await import(
    pathToFileURL(
      path.join(backend, "../node_modules/ioredis-mock/lib/index.js"),
    ).href
  )
).default;
const coriander = JSON.parse(
  readFileSync(
    path.join(backend, "tests/fixtures/woolworths/search-coriander.json"),
    "utf8",
  ),
);

const t0 = Date.now();
const t = () => ((Date.now() - t0) / 1000).toFixed(2) + "s";

// Accepts every connection, reads, never writes a byte back.
const sockets: net.Socket[] = [];
const hung = net.createServer((socket) => {
  sockets.push(socket);
  console.log(`[${t()}] hung server: connection accepted, never answering`);
});
await new Promise<void>((r) => hung.listen(0, "127.0.0.1", r));
const hungPort = (hung.address() as net.AddressInfo).port;

// A well-behaved stand-in: seed GET sets cookies, search POST answers the fixture.
const good = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "GET") {
      const slow = req.url?.includes("slow=1");
      console.log(`[${t()}] good server: seed GET${slow ? " (answering in 6 s)" : ""}`);
      setTimeout(
        () =>
          res
            .writeHead(200, { "set-cookie": ["ak_bmsc=seed; Path=/"] })
            .end("<html></html>"),
        slow ? 6_000 : 0,
      );
      return;
    }
    console.log(
      `[${t()}] good server: search POST "${JSON.parse(body).SearchTerm}"`,
    );
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(coriander));
  });
});
await new Promise<void>((r) => good.listen(0, "127.0.0.1", r));
const goodPort = (good.address() as net.AddressInfo).port;

// fetchImpl: rewrite only the host; call real fetch with the client's own init
// (so whatever signal the client sets is honoured, or its absence felt).
const fetchImpl = ((input: string, init: RequestInit) => {
  const term =
    typeof init?.body === "string"
      ? JSON.parse(init.body).SearchTerm
      : undefined;
  // mode: search = hung search; seed = first (cold) seed hangs;
  // slowseed = first seed answers after 6 s, then the search hangs.
  const firstSeed = term === undefined && ++seedCount === 1;
  const port =
    (mode === "seed" && firstSeed) || (mode !== "seed" && term === "hung")
      ? hungPort
      : goodPort;
  let url = String(input).replace(
    "https://www.woolworths.com.au",
    `http://127.0.0.1:${port}`,
  );
  if (mode === "slowseed" && firstSeed) url += "&slow=1";
  console.log(
    `[${t()}] fetch ${init?.method ?? "GET"} term=${term ?? "(seed)"} -> ${port === hungPort ? "HUNG" : "good"} signal=${init?.signal ? "yes" : "NONE"}`,
  );
  return fetch(url, init);
}) as typeof fetch;

const matcher = createProductMatchService({
  redis: new RedisMock(),
  client: createWoolworthsClient(fetchImpl),
  // enqueue omitted: the real app-wide woolworthsQueue (concurrency 1, 500 ms floor)
  defaultStoreId: 1101,
  successWindowCapMs: 86_400_000,
  failureWindowMs: 3_600_000,
});

const cap = setTimeout(() => {
  console.log(
    `[${t()}] HARD CAP ${capSeconds}s reached: first lookup still pending, second never ran -> killing`,
  );
  process.exit(2);
}, capSeconds * 1000);

const first = matcher.matchProduct("hung").then((o: { status: string }) => {
  console.log(`[${t()}] lookup 1 ("hung") settled: ${JSON.stringify(o)}`);
});
const second = matcher
  .matchProduct("coriander")
  .then((o: { status: string }) => {
    console.log(`[${t()}] lookup 2 ("coriander") settled: status=${o.status}`);
  });
await Promise.all([first, second]);
clearTimeout(cap);
console.log(`[${t()}] DONE both lookups settled`);
sockets.forEach((s) => s.destroy());
hung.close();
good.close();
process.exit(0);
