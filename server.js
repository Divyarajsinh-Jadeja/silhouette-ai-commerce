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

const searchProductsInputSchema = {
  query: z.string().optional().describe("Exact phrase (e.g. 'deep-cut blade')"),
};

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
    const curlCommand = `curl -X POST "${KLEVU_SEARCH_URL}" \\
      -H "content-type: application/json" \\
      -H "x-klevu-api-key: ${KLEVU_API_KEY}" \\
      -d '${JSON.stringify(payload)}'`;
    
    console.log("\n--- [KLEVU REQUEST (cURL)] ---");
    console.log(curlCommand);
    console.log("------------------------------\n");

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
    console.log("--- [KLEVU RESPONSE DATA] ---");
    console.log(JSON.stringify(data, null, 2));

    const productQuery = (data.queryResults || []).find(q => q.id === "productList");
    const records = productQuery?.records || [];

    const finalProducts = records.map(item => {
      let cleanSku = item.sku || "N/A";
      if (cleanSku.includes(";;;;")) cleanSku = cleanSku.split(";;;;").pop();
      
      // DUAL PRICE LOGIC: Get original and start/sale price
      let originalVal = parseFloat(item.price || 0);
      let currentVal = parseFloat(item.startPrice || item.salePrice || originalVal || 0);
      
      let finalPrice = currentVal > 0 ? `$${currentVal.toFixed(2)}` : "View Store";
      let finalOriginal = (originalVal > currentVal && originalVal > 0) ? `$${originalVal.toFixed(2)}` : null;
      
      return {
        sku: cleanSku,
        title: item.name || "Silhouette Product",
        price: finalPrice,
        originalPrice: finalOriginal,
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

// REST OF THE FUNCTIONS... (createGuestCart, addToGuestCart, etc.)
async function createGuestCart() {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/guest-carts`, { method: "POST", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}`, "Content-Type": "application/json" } });
    const cartId = await res.json();
    return { content: [{ type: "text", text: `Successfully created shopping cart! ID: ${cartId}.` }] };
  } catch (e) { return { content: [{ type: "text", text: `Failed: ${e.message}` }] }; }
}

async function addToGuestCart(cartId, sku, qty) {
  try {
    const body = JSON.stringify({ cartItem: { sku, qty, quote_id: cartId } });
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/guest-carts/${cartId}/items`, { method: "POST", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}`, "Content-Type": "application/json" }, body });
    const data = await res.json();
    return { content: [{ type: "text", text: data.message ? `Failed: ${data.message}` : `Added ${qty} of SKU ${sku} into Cart ${cartId}.` }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
}

async function getGuestCartItems(cartId) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/guest-carts/${cartId}/items`, { method: "GET", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}`, "Content-Type": "application/json" } });
    const items = await res.json();
    return { content: [{ type: "text", text: `Active Items: ${JSON.stringify(items)}` }] };
  } catch (e) { return { content: [{ type: "text", text: `Failed: ${e.message}` }] }; }
}

async function getCategories() {
  const payload = { "context": { "apiKeys": [KLEVU_API_KEY] }, "recordQueries": [{ "id": "categoryList", "typeOfRequest": "SEARCH", "settings": { "query": { "term": "*" }, "typeOfRecords": ["KLEVU_CATEGORY"], "limit": "20", "sort": "RELEVANCE" } }] };
  try {
    const res = await fetch(KLEVU_SEARCH_URL, { method: "POST", headers: { "content-type": "application/json", "x-klevu-api-key": KLEVU_API_KEY }, body: JSON.stringify(payload) });
    const data = await res.json();
    const categories = (data.queryResults || []).find(q => q.id === "categoryList")?.records || [];
    return { content: [{ type: "text", text: `Categories: ${categories.map(c => c.name).join(", ")}` }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
}

async function getCmsPage(query) {
  const payload = { "context": { "apiKeys": [KLEVU_API_KEY] }, "recordQueries": [{ "id": "cmsSearch", "typeOfRequest": "SEARCH", "settings": { "query": { "term": query }, "typeOfRecords": ["KLEVU_CMS"], "limit": "1" } }] };
  try {
    const res = await fetch(KLEVU_SEARCH_URL, { method: "POST", headers: { "content-type": "application/json", "x-klevu-api-key": KLEVU_API_KEY }, body: JSON.stringify(payload) });
    const data = await res.json();
    const page = (data.queryResults || []).find(q => q.id === "cmsSearch")?.records?.[0];
    return { content: [{ type: "text", text: page ? `Found: ${page.url}` : `Not found for ${query}` }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
}

async function applyCoupon(cartId, couponCode) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/guest-carts/${cartId}/coupons/${couponCode}`, { method: "PUT", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}` } });
    const success = await res.json();
    return { content: [{ type: "text", text: success === true ? "Coupon applied!" : "Failed." }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
}

async function getOrder(orderId) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/orders/${orderId}`, { method: "GET", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}` } });
    const order = await res.json();
    return { content: [{ type: "text", text: `Order: ${JSON.stringify(order)}` }] };
  } catch (e) { return { content: [{ type: "text", text: `Failed: ${e.message}` }] }; }
}

async function getTracking(orderId) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/shipments?searchCriteria[filter_groups][0][filters][0][field]=order_id&searchCriteria[filter_groups][0][filters][0][value]=${orderId}`, { method: "GET", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}` } });
    const data = await res.json();
    const tracking = data.items?.[0]?.tracks || [];
    return { content: [{ type: "text", text: `Tracking: ${JSON.stringify(tracking)}` }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
}

async function getReviews(sku) {
  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/V1/products/${sku}`, { method: "GET", headers: { "Authorization": `Bearer ${MAGENTO_TOKEN}` } });
    const p = await res.json();
    return { content: [{ type: "text", text: `Reviews: ${JSON.stringify(p.extension_attributes?.review_info || "None")}` }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }] }; }
}

async function initiateReturn(orderId, items) {
  return { content: [{ type: "text", text: `Return initiated for Order #${orderId}` }] };
}

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
      description: desc?.value || "Details on store.",
      image: `${MAGENTO_MEDIA_URL}/${img?.value || ""}`,
      status: "In Stock",
      link: `https://www.silhouetteamerica.com/shop/${item.sku}`
    };
  } catch (e) { return null; }
}

function createProductServer() {
  const server = new McpServer({ name: "silhouette-app", version: "1.0.0" });

  registerAppResource(server, "product-widget", "ui://widget/product-v24.html", {}, async () => ({
    contents: [{ uri: "ui://widget/product-v24.html", mimeType: RESOURCE_MIME_TYPE, text: widgetHtml }]
  }));

  registerAppTool(server, "search_products", {
    title: "Searching...",
    description: "Search products. e.g. 'deep-cut blade'.",
    inputSchema: searchProductsInputSchema,
    _meta: { ui: { resourceUri: "ui://widget/product-v24.html" } }
  }, async (args) => {
    const products = await fetchKlevuProducts(args?.query);
    return { content: [{ type: "text", text: `Found ${products.length} products.` }], structuredContent: { data: { products } } };
  });

  registerAppTool(server, "get_product_details", {
    title: "Details...",
    description: "Get product details by SKU. e.g. 'VINYL-PRINT'.",
    inputSchema: z.object({ sku: z.string() }),
    _meta: { ui: { resourceUri: "ui://widget/product-v24.html" } }
  }, async (args) => {
    const product = await getProductDetails(args.sku);
    return { content: [{ type: "text", text: "Details fetched." }], structuredContent: { data: { mode: "detail", product } } };
  });

  registerAppTool(server, "c_create_cart", { title: "Cart", description: "Create cart", inputSchema: z.object({}), _meta: {} }, async () => await createGuestCart());
  registerAppTool(server, "c_add_to_cart", { title: "Add", description: "Add item SKU", inputSchema: z.object({ cartId: z.string(), sku: z.string(), qty: z.number() }), _meta: {} }, async (p) => await addToGuestCart(p.cartId, p.sku, p.qty));
  registerAppTool(server, "c_get_cart", { title: "Get", description: "Get items", inputSchema: z.object({ cartId: z.string() }), _meta: {} }, async (p) => await getGuestCartItems(p.cartId));
  registerAppTool(server, "c_get_categories", { title: "Categories", description: "Get categories", inputSchema: z.object({}), _meta: {} }, async () => await getCategories());
  registerAppTool(server, "c_get_policy_page", { title: "Policy", description: "Get policy", inputSchema: z.object({ pageIdentifier: z.string() }), _meta: {} }, async (p) => await getCmsPage(p.pageIdentifier));
  registerAppTool(server, "c_apply_coupon", { title: "Coupon", description: "Apply coupon", inputSchema: z.object({ cartId: z.string(), couponCode: z.string() }), _meta: {} }, async (p) => await applyCoupon(p.cartId, p.couponCode));
  registerAppTool(server, "admin_get_order", { title: "Order", description: "Get order status", inputSchema: z.object({ orderId: z.string() }), _meta: {} }, async (p) => await getOrder(p.orderId));
  registerAppTool(server, "admin_get_order_tracking", { title: "Tracking", description: "Track shipment", inputSchema: z.object({ orderId: z.string() }), _meta: {} }, async (p) => await getTracking(p.orderId));
  registerAppTool(server, "admin_get_product_reviews", { title: "Reviews", description: "See ratings", inputSchema: z.object({ sku: z.string() }), _meta: {} }, async (p) => await getReviews(p.sku));
  registerAppTool(server, "c_initiate_return", { title: "Return", description: "Start return request", inputSchema: z.object({ orderId: z.string(), items: z.array(z.object({ sku: z.string(), qty: z.number() })) }), _meta: {} }, async (p) => await initiateReturn(p.orderId, p.items));

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  if (!req.url) return res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "content-type, mcp-session-id", "Access-Control-Expose-Headers": "Mcp-Session-Id" });
    return res.end();
  }
  if (req.method === "GET" && url.pathname === "/") return res.writeHead(200, { "content-type": "text/plain" }).end("Silhouette Magento MCP server");
  if (url.pathname === MCP_PATH && (new Set(["POST", "GET", "DELETE"])).has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createProductServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res); } catch (e) { if (!res.headersSent) res.writeHead(500).end("Error"); }
    return;
  }
  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => console.log(`🚀 v24 Server running on http://localhost:${port}${MCP_PATH}`));
