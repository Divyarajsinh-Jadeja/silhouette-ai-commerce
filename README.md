# 🤖 Silhouette AI Commerce
### An Agentic Commerce MCP Server for Silhouette America — Built for ChatGPT

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-%40modelcontextprotocol%2Fext--apps-blueviolet)](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
[![Magento 2](https://img.shields.io/badge/Magento-2.x%20REST%20API-F26322?logo=magento&logoColor=white)](https://devdocs.magento.com/guides/v2.4/rest/bk-rest.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Overview

**Silhouette AI Commerce** is a production-ready **Model Context Protocol (MCP)** server that transforms ChatGPT into a fully autonomous Silhouette America brand assistant.

Instead of just answering questions, this agent can:
- 🛍️ **Browse and search** the live Silhouette America product catalog
- 🛒 **Manage shopping carts** — create, add items, apply coupons
- 📦 **Track orders** and look up order history in real-time
- ↩️ **Initiate returns (RMA)** directly through chat
- 📄 **Fetch CMS policy pages** like Shipping & Returns
- ⭐ **Pull product reviews** for any SKU

Built on top of the **Agentic Commerce Protocol (ACP)** — the future of AI-driven e-commerce.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Smart Product Search** | Fuzzy search with SKU/Name matching + 1-hour NodeCache TTL |
| 🎨 **Premium UI Widget** | Glassmorphic dark-mode card carousel rendered inside ChatGPT |
| 🛒 **Full Cart Lifecycle** | Create → Add items → Apply coupons → Review cart |
| 📦 **Order Tracking** | Real-time shipment tracking via Magento Shipments API |
| ↩️ **Return Management** | Structured RMA initiation with item-level granularity |
| 🔒 **Brand Safety** | AI is instructed to NEVER suggest third-party competitors |
| ⚡ **Sub-100ms Search** | Intelligent caching prevents redundant API calls |

---

## 🏗️ Architecture

```
ChatGPT (User Interface)
        │
        │  MCP Protocol (JSON-RPC over HTTP)
        ▼
┌─────────────────────────┐
│   MCP Server (Node.js)  │  ← server.js (Port 8787)
│   @modelcontextprotocol │
│   /ext-apps SDK         │
└────────────┬────────────┘
             │
             │  REST API (Bearer Token Auth)
             ▼
┌─────────────────────────┐
│  Magento 2 Backend      │
│  (Silhouette America    │
│   Staging/Production)   │
└─────────────────────────┘
```

---

## 🛠️ Tool Suite (11 Tools)

### 🛍️ Catalog & Discovery
| Tool | Description |
|---|---|
| `search_products` | Search live catalog by name or SKU — renders a premium UI card carousel |
| `c_get_categories` | Fetch the full Magento category tree for navigation |
| `c_get_policy_page` | Retrieve CMS pages (e.g., `return-policy`, `shipping-info`) |

### 🛒 Cart Management
| Tool | Description |
|---|---|
| `c_create_cart` | Initialize a new guest shopping cart session |
| `c_add_to_cart` | Add a product by SKU and quantity to the active cart |
| `c_get_cart` | View all items currently in the cart |
| `c_apply_coupon` | Apply a discount coupon code to the cart |

### 📦 Post-Purchase Support
| Tool | Description |
|---|---|
| `admin_get_order` | Retrieve complete order details by Order ID |
| `admin_get_order_tracking` | Get real-time shipment & tracking information |
| `c_initiate_return` | Start a return (RMA) for one or more items |
| `admin_get_product_reviews` | Fetch ratings and reviews for a product SKU |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A Magento 2 store with REST API access
- A Magento 2 Bearer Token (Admin or Integration)
- An [ngrok](https://ngrok.com) account (for local tunneling to ChatGPT)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/silhouette-ai-commerce.git
cd silhouette-ai-commerce
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Open `server.js` and update the configuration constants at the top of the file:

```js
const MAGENTO_BASE_URL = "https://your-magento-store.com/rest";
const MAGENTO_TOKEN = "your_bearer_token_here";
```

> 💡 **Tip**: For production, migrate these to a `.env` file using `dotenv`.

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:8787/mcp`.

### 5. Expose via ngrok

In a separate terminal:

```bash
ngrok http 8787
```

Copy the generated HTTPS URL (e.g., `https://xxxx.ngrok-free.app/mcp`).

### 6. Connect to ChatGPT

1. Go to **ChatGPT** → **Settings** → **Connectors**
2. Click **"Add Connector"** → **"Model Context Protocol"**
3. Paste your ngrok URL
4. Click **Connect**

---

## 📁 Project Structure

```
silhouette-ai-commerce/
├── server.js              # Main MCP server — all tools registered here
├── package.json           # Project manifest & dependencies
├── public/
│   ├── product-widget.html  # Premium glassmorphic product card UI
│   └── hotel-widget.html    # (Demo) Hotel widget UI example
└── README.md              # You are here
```

---

## 🎨 UI Widget

When `search_products` is triggered, ChatGPT loads a custom HTML widget rendered as an iframe inside the chat interface.

**Features:**
- 🌙 Auto dark/light mode based on system preference
- ✨ Glassmorphic badges with backdrop blur
- 🃏 Horizontal scrolling product card carousel
- 🔍 Smart routing: single result → detail view, multiple → carousel
- ⏳ Shimmer skeleton loading states
- 💫 Spring physics micro-animations on hover

---

## 🔒 Brand Safety

This agent is engineered to act **exclusively** as a Silhouette America brand representative:

- ❌ **Never** recommends Amazon, Walmart, Michaels, Joann, or any competitor
- ❌ **Never** tells users to "check elsewhere" if an item is out of stock
- ✅ Always suggests alternative Silhouette products or checking back later
- ✅ All product links route back to `silhouetteamerica.com`

---

## 🔧 Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js (ESM)** | Server runtime |
| **@modelcontextprotocol/ext-apps** | MCP SDK for ChatGPT integration |
| **Zod** | Input schema validation for all tools |
| **node-cache** | In-memory caching (1-hour TTL on product search) |
| **Magento 2 REST API** | Live e-commerce backend |
| **ngrok** | Local-to-public HTTPS tunneling |
| **Vanilla HTML/CSS** | Lightweight, zero-dependency UI widget |

---

## 🗺️ Roadmap

- [ ] Migrate secrets to `.env` using `dotenv`
- [ ] Deploy to permanent host (Vercel / Railway / Fly.io)
- [ ] Implement `c_initiate_return` with live Magento RMA module API
- [ ] Add `c_checkout` tool with Stripe tokenized payment flow (ACP Phase 3)
- [ ] Wishlist management tools
- [ ] Multi-language support (BCP 47)

---

## 📄 License

MIT © 2025 — Built with ❤️ for the Agentic Commerce era.

---

> **Note**: This project is an independent integration built on top of the Magento 2 REST API. "Silhouette" and "Silhouette America" are trademarks of their respective owners.
