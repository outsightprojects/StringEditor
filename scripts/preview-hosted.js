const http = require("node:http");
const fs = require("node:fs");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4174);

async function loadWorker() {
  const code = fs.readFileSync("dist/server/index.js", "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

loadWorker()
  .then((mod) => {
    const server = http.createServer(async (req, res) => {
      try {
        const request = new Request(`http://${HOST}:${PORT}${req.url}`, {
          method: req.method,
          headers: req.headers
        });
        const response = await mod.default.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(error.message);
      }
    });

    server.listen(PORT, HOST, () => {
      console.log(`Hosted preview running at http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
