import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 600 });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = join(__dirname, "public");
if (!existsSync(publicDir)) mkdirSync(publicDir);

const widgetHtml = readFileSync(join(publicDir, "product-widget.html"), "utf8");

const MAGENTO_BASE_URL = process.env.MAGENTO_BASE_URL;
const MAGENTO_MEDIA_URL = process.env.MAGENTO_MEDIA_URL;
const MAGENTO_TOKEN = process.env.MAGENTO_TOKEN;
const KLEVU_SEARCH_URL = process.env.KLEVU_SEARCH_URL;
const KLEVU_API_KEY = process.env.KLEVU_API_KEY;
const MCP_API_KEY = process.env.MCP_API_KEY;

const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

// UI URI - Bumping version for cache busting
const UI_RESOURCE_URI = "ui://widget/product-v27.html";

/** Discovery Engine Logic */
async function fetchKlevuProducts(query) {
  const cacheKey = (query || "*").trim().toLowerCase();
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  const term = query && query.trim() !== "" ? query.trim() : "*";
  const payload = {
    "context": { "apiKeys": [KLEVU_API_KEY] },
    "recordQueries": [{
      "id": "productList",
      "typeOfRequest": "SEARCH",
      "settings": {
        "query": { "term": term },
        "typeOfRecords": ["KLEVU_PRODUCT"],
        "limit": "12",
        "sort": "RELEVANCE",
        "fallbackQueryId": "productListFallback"
      }
    }]
  };

  try {
    const response = await fetch(KLEVU_SEARCH_URL, {
      method: "POST",
      headers: {
        "accept": "*/*",
        "content-type": "application/json; charset=UTF-8",
        "origin": "https://www.silhouetteamerica.com",
        "x-klevu-api-key": KLEVU_API_KEY,
        "x-klevu-integration-type": "jsv2",
        "x-klevu-integration-version": "2.13.1"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    const productQuery = (data.queryResults || []).find(q => q.id === "productList");
    const records = productQuery?.records || [];
    const products = records.map(item => {
      let cleanSku = item.sku || "N/A";
      if (cleanSku.includes(";;;;")) cleanSku = cleanSku.split(";;;;").pop();
      let originalVal = parseFloat(item.price || 0);
      let currentVal = parseFloat(item.startPrice || item.salePrice || originalVal || 0);
      return {
        sku: cleanSku,
        title: item.name || "Silhouette Product",
        price: currentVal > 0 ? `$${currentVal.toFixed(2)}` : "View Store",
        originalPrice: (originalVal > currentVal && originalVal > 0) ? `$${originalVal.toFixed(2)}` : null,
        status: item.inStock === "yes" ? "In Stock" : "Out of stock",
        image: item.imageUrl || "https://www.silhouetteamerica.com/media/catalog/product/placeholder/default/silhouette-logo.png",
        link: item.url || "https://www.silhouetteamerica.com/",
        description: (item.shortDesc || "").substring(0, 200)
      };
    });
    cache.set(cacheKey, products);
    return products;
  } catch (error) { return []; }
}

async function getProductDetails(sku) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/products/${sku}`, { method: "GET", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}` } });
    const item = await res.json();
    const img = (item.custom_attributes || []).find(a => a.attribute_code === "image");
    return {
      sku: item.sku,
      title: item.name,
      price: `$${parseFloat(item.price || 0).toFixed(2)}`,
      image: `${MAGENTO_MEDIA_URL}/${img?.value || ""}`,
      status: "In Stock"
    };
  } catch (e) { return null; }
}

function createProductServer() {
  const server = new McpServer({ name: "silh-discovery", version: "1.0.0" });
  
  registerAppResource(server, "product-widget", UI_RESOURCE_URI, {}, async () => ({
    contents: [{ uri: UI_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml }]
  }));

  registerAppTool(server, "search_products", {
    title: "Discovery...",
    description: "Search catalogue.",
    inputSchema: { query: z.string().optional() },
    _meta: { ui: { resourceUri: UI_RESOURCE_URI } }
  }, async (args) => {
    const products = await fetchKlevuProducts(args?.query);
    return { content: [{ type: "text", text: "Catalogue ready." }], structuredContent: { data: { products } } };
  });

  registerAppTool(server, "get_product_details", {
    title: "Details...",
    description: "Item info.",
    inputSchema: z.object({ sku: z.string() }),
    _meta: { ui: { resourceUri: UI_RESOURCE_URI } }
  }, async (args) => {
    const product = await getProductDetails(args.sku);
    return { content: [{ type: "text", text: "Product info fetched." }], structuredContent: { data: { mode: "detail", product } } };
  });

  return server;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host ?? "localhost"}`);
  const origin = req.headers.origin || "";

  // Set Headers - Including CSP for security and Frame access
  res.setHeader("Access-Control-Allow-Origin", "*"); // Wider CORS for discovery mode
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, authorization, x-mcp-api-key, accept");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  
  // NEW: Content-Security-Policy to allow frame ancestry at ChatGPT
  res.setHeader("Content-Security-Policy", "frame-ancestors https://chatgpt.com https://www.silhouetteamerica.com https://silhouette-ai-ecommerce-mcp.silhouetteamerica.com");
  res.removeHeader("X-Frame-Options"); // Remove standard block

  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method === "GET" && url.pathname === "/") return res.writeHead(200).end("Silhouette MCP (SECURE + UI)");

  if (url.pathname === MCP_PATH) {
    const providedKey = (req.headers.authorization || req.headers["x-mcp-api-key"] || "").replace("Bearer ", "").trim();
    const originHeader = req.headers.origin || req.headers.referer || "";
    const userAgent = req.headers["user-agent"] || "";

    // DEBUG LOG: See EXACTLY what is coming in from ChatGPT
    console.log(`[AUTH-DEBUG] Key: ${providedKey.substring(0, 5)}... Origin: ${originHeader} UA: ${userAgent}`);

    // TEMPORARY BYPASS: If no key is provided, we still allow for testing (REMOVE AFTER SETUP)
    if (MCP_API_KEY && providedKey !== MCP_API_KEY && !originHeader.includes("chatgpt.com") && !userAgent.includes("ChatGPT-User")) {
       console.log("❌ REJECTED - Unauthorized attempt");
       return res.writeHead(401).end("Unauthorized");
    }
    console.log("✅ ACCEPTED - Welcome to the server!");

    const server = createProductServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try { 
      await server.connect(transport); 
      await transport.handleRequest(req, res); 
    } catch (e) { 
      if (!res.headersSent) res.writeHead(500).end("Server error"); 
    }
    return;
  }
  res.writeHead(404).end();
});

httpServer.listen(PORT, () => console.log(`🛡️  Live discovery on port ${PORT}`));
