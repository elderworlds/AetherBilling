import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 5000;

const app = express();

app.disable("x-powered-by");

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aether-terminal-web" });
});

function assetCacheHeaders(res, filePath) {
  const base = path.basename(filePath);
  if (base === "sw.js" || base.startsWith("workbox-") || base === "registerSW.js") {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    return;
  }
  if (/\.(js|css|woff2|png|svg|ico|webp)$/i.test(filePath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  if (filePath.endsWith(".webmanifest")) {
    res.type("application/manifest+json");
  }
}

app.use(
  express.static(DIST, {
    index: false,
    fallthrough: true,
    setHeaders: assetCacheHeaders,
  })
);

function runtimeConfig() {
  const billingApiUrl = (
    process.env.BILLING_API_URL || "https://billing.aetherframeworks.dev"
  ).replace(/\/$/, "");
  const stripePublishableKey = (process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  return { billingApiUrl, stripePublishableKey };
}

function injectRuntimeConfig(html) {
  const snippet = `<script>window.__AETHER_CONFIG__=${JSON.stringify(runtimeConfig())};</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${snippet}\n  </head>`);
  }
  return `${snippet}${html}`;
}

function sendSpaIndex(_req, res) {
  const indexPath = path.join(DIST, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.status(503).type("text/plain").send("Build missing. Run: npm run build");
    return;
  }
  const html = injectRuntimeConfig(fs.readFileSync(indexPath, "utf8"));
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(html);
}

app.get(["/", "/oauth-return"], sendSpaIndex);

app.get("*", (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  const rel = decodeURIComponent(req.path).replace(/^\//, "");
  if (rel && !rel.includes("..")) {
    const candidate = path.join(DIST, rel);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      next();
      return;
    }
  }
  sendSpaIndex(req, res);
});

app.listen(PORT, () => {
  console.log(`Aether Terminal Web listening on port ${PORT}`);
});
