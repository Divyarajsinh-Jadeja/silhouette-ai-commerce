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
const MCP_API_KEY = process.env.MCP_API_KEY; // NEW: PRODUCTION AUTH KEY

const searchProductsInputSchema = {
  query: z.string().optional().describe("Search keyword (e.g. 'blade')"),
};

/** Klevu Discovery Service */
async function fetchKlevuProducts(query) {
  const cacheKey = (query || "*").trim().toLowerCase();
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  const term = query && query.trim() !== "" ? query.trim() : "*";

  const payload = {
    "context": { "apiKeys": [KLEVU_API_KEY] },
    "recordQueries": [
      {
        "id": "productList",
        "typeOfRequest": "SEARCH",
        "settings": {
          "query": { "term": term },
          "typeOfRecords": ["KLEVU_PRODUCT"],
          "limit": "12",
          "sort": "RELEVANCE",
          "fallbackQueryId": "productListFallback"
        }
      }
    ]
  };

  try {
    // SECURITY: Muted the full CURL log to prevent Magento Token leaking in logs
    console.log(`[Klevu Search] Initiating discovery for term: "${term}"`);

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

    const finalProducts = records.map(item => {
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

    cache.set(cacheKey, finalProducts);
    return finalProducts;
  } catch (error) {
    console.error("Klevu Fetch Failure:", error);
    return [];
  }
}

/** Magento Product Details Service */
async function getProductDetails(sku) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/products/${sku}`, { method: "GET", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}` } });
    const item = await res.json();
    const desc = (item.custom_attributes || []).find(a => a.attribute_code === "description");
    const img = (item.custom_attributes || []).find(a => a.attribute_code === "image");
    return {
      sku: item.sku,
      title: item.name,
      price: `$${parseFloat(item.price || 0).toFixed(2)}`,
      description: desc?.value || "Info on store.",
      image: `${MAGENTO_MEDIA_URL}/${img?.value || ""}`,
      status: "In Stock",
      link: `https://www.silhouetteamerica.com/shop/${item.sku}`
    };
  } catch (e) { return null; }
}

async function getCategories() {
  const payload = { "context": { "apiKeys": [KLEVU_API_KEY] }, "recordQueries": [{ "id": "categoryList", "typeOfRequest": "SEARCH", "settings": { "query": { "term": "*" }, "typeOfRecords": ["KLEVU_CATEGORY"], "limit": "20", "sort": "RELEVANCE" } }] };
  const res = await fetch(KLEVU_SEARCH_URL, { method: "POST", headers: { "content-type": "application/json", "x-klevu-api-key": KLEVU_API_KEY }, body: JSON.stringify(payload) });
  const data = await res.json();
  const categories = (data.queryResults || []).find(q => q.id === "categoryList")?.records || [];
  return { content: [{ type: "text", text: `Categories: ${categories.map(c => c.name).join(", ")}` }] };
}

async function getCmsPage(query) {
  const payload = { "context": { "apiKeys": [KLEVU_API_KEY] }, "recordQueries": [{ "id": "cmsSearch", "typeOfRequest": "SEARCH", "settings": { "query": { "term": query }, "typeOfRecords": ["KLEVU_CMS"], "limit": "1" } }] };
  const res = await fetch(KLEVU_SEARCH_URL, { method: "POST", headers: { "content-type": "application/json", "x-klevu-api-key": KLEVU_API_KEY }, body: JSON.stringify(payload) });
  const data = await res.json();
  const page = (data.queryResults || []).find(q => q.id === "cmsSearch")?.records?.[0];
  return { content: [{ type: "text", text: page ? `Found: ${page.url}` : `Not found for ${query}` }] };
}

function createProductServer() {
  const server = new McpServer({ name: "silhouette-app-lite", version: "1.0.0" });

  registerAppResource(server, "product-widget", "ui://widget/product-v26.html", {}, async () => ({
    contents: [{ uri: "ui://widget/product-v26.html", mimeType: RESOURCE_MIME_TYPE, text: widgetHtml }]
  }));

  registerAppTool(server, "search_products", {
    title: "Searching...",
    description: "Find Silhouette products. e.g. 'blade'.",
    inputSchema: searchProductsInputSchema,
    _meta: { ui: { resourceUri: "ui://widget/product-v26.html" } }
  }, async (args) => {
    const products = await fetchKlevuProducts(args?.query);
    return { content: [{ type: "text", text: "Results ready." }], structuredContent: { data: { products } } };
  });

  registerAppTool(server, "get_product_details", {
    title: "Details...",
    description: "Get SKU details.",
    inputSchema: z.object({ sku: z.string() }),
    _meta: { ui: { resourceUri: "ui://widget/product-v26.html" } }
  }, async (args) => {
    const product = await getProductDetails(args.sku);
    return { content: [{ type: "text", text: "Details ready." }], structuredContent: { data: { mode: "detail", product } } };
  });

  registerAppTool(server, "c_get_categories", { title: "Store Categories", description: "Browsing categories.", inputSchema: z.object({}), _meta: {} }, async () => await getCategories());
  registerAppTool(server, "c_get_policy_page", { title: "Store Policies", description: "Fetch store policies.", inputSchema: z.object({ pageIdentifier: z.string() }), _meta: {} }, async (p) => await getCmsPage(p.pageIdentifier));

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

/**
 * PRODUCTION-GRADE HTTP SERVER WITH AUTHENTICATION
 */
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host ?? "localhost"}`);

  // SECURITY: Handle CORS restricted to official OpenAI/Silhouette origins
  const allowedOrigins = [
    "https://chatgpt.com",
    "https://www.silhouetteamerica.com",
    "https://silhouette-ai-ecommerce-mcp.silhouetteamerica.com"
  ];
  const origin = req.headers.origin || "";
  
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes(origin) ? origin : "https://chatgpt.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, authorization, x-mcp-api-key");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
     return res.writeHead(204).end();
  }

  // SECURITY: HEALTH CHECK FOR PUBLIC DOMAIN (Doesn't require API Key)
  if (req.method === "GET" && url.pathname === "/") {
    return res.writeHead(200, { "content-type": "text/plain" }).end("Silhouette Discovery MCP Server (SECURE)");
  }

  // --- API KEY AUTHENTICATION MIDDLEWARE ---
  if (url.pathname === MCP_PATH) {
    const authHeader = req.headers.authorization || "";
    const customAuthHeader = req.headers["x-mcp-api-key"] || "";
    
    // Check for "Bearer <token>" or raw "X-MCP-API-KEY" header
    const token = authHeader.replace("Bearer ", "").trim();
    const providedKey = token || customAuthHeader;

    if (MCP_API_KEY && providedKey !== MCP_API_KEY) {
      console.warn(`[SECURITY] REJECTED unauthorized hit from IP: ${req.socket.remoteAddress}`);
      return res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "Unauthorized: Invalid or missing MCP_API_KEY" }));
    }

    // AUTH SUCCESS -> Route to MCP Server
    const server = createProductServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try { 
      await server.connect(transport); 
      await transport.handleRequest(req, res); 
    } catch (e) { 
      if (!res.headersSent) res.writeHead(500).end("Internal Server Error"); 
    }
    return;
  }

  res.writeHead(404).end("Page Not Found");
});

httpServer.listen(port, () => {
    console.log(`🛡️  PRODUCTION SERVER RUNNING (SECURE MODE)`);
});
