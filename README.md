# 🤖 Silhouette AI Commerce
### An Agentic Commerce MCP Server for Silhouette America — Built for ChatGPT

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-%40modelcontextprotocol%2Fext--apps-blueviolet)](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
[![Klevu AI](https://img.shields.io/badge/Klevu-AI%20Search-blue?logo=lightning&logoColor=white)](https://www.klevu.com/)
[![Magento 2](https://img.shields.io/badge/Magento-2.x%20REST%20API-F26322?logo=magento&logoColor=white)](https://devdocs.magento.com/guides/v2.4/rest/bk-rest.html)

---

## 📖 Overview

**Silhouette AI Commerce** is a production-ready **Model Context Protocol (MCP)** server that transforms ChatGPT into a fully autonomous Silhouette America brand assistant. 

Unlike standard search, this system uses a **Hybrid Architecture**:
- ⚡ **Klevu AI**: Powers lightning-fast product discovery, categories, and policy page searches.
- 🛍️ **Magento 2 REST API**: Handles transactional tasks like cart management, order tracking, and reviews.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Klevu AI Search** | Typo-tolerant, sub-100ms natural language search for products and policies. |
| 🎨 **Premium UI Widget** | Glassmorphic cards with "Buy Now" direct-to-web redirection for Expedia-style checkout. |
| 🛒 **Full Cart Lifecycle** | Invisible guest cart management (Create → Add items → Apply coupons). |
| 📦 **Order Tracking** | Real-time shipment tracking for customers directly within the chat. |
| ↩️ **Return Management** | Structured RMA initiation flow for a seamless post-purchase experience. |
| ⚡ **Smart RAM Caching** | 10-minute NodeCache TTL to balance data freshness and API performance. |
| 🔒 **Brand Safety** | Hardcoded instructions to never suggest third-party competitors (Amazon, etc.). |

---

## 🏗️ Architecture

```
ChatGPT (User Interface)
        │
        │  MCP Protocol (JSON-RPC over HTTP)
        ▼
┌─────────────────────────┐
│   MCP Server (Node.js)  │  ← server.js (Port 8787)
│   (Hybrid Intelligence) │
└────────────┬────────────┘
             │
      ┌──────┴───────┐
      ▼              ▼
┌────────────┐ ┌────────────┐
│  Klevu AI  │ │ Magento 2  │
│  (Search)  │ │ (Commerce) │
└────────────┘ └────────────┘
```

---

## 🛠️ Tool Suite

### 🛍️ Discovery (Powered by Klevu AI)
- `search_products`: Multi-dimensional product search with premium UI cards.
- `c_get_categories`: Browse the live category hierarchy.
- `c_get_policy_page`: Instant lookup of Store Policies (Shipping, Returns, etc.).

### 🛒 Cart & Checkout (Magento REST)
- `c_create_cart`: Initialize a secure guest shopping session.
- `c_add_to_cart`: Add products to cart for seamless handoff.
- `c_apply_coupon`: Apply discount codes in real-time.

### 📦 Customer Support
- `admin_get_order`: Full order detail retrieval.
- `admin_get_order_tracking`: Real-time tracking status.
- `admin_get_product_reviews`: Fetch public ratings and feedback.
- `c_initiate_return`: Start the return/RMA process.

---

## 🚀 Getting Started

### 1. Configure Environment
Create a `.env` file in the root directory:
```env
PORT=8787
MAGENTO_BASE_URL=https://www.silhouetteamerica.com/rest
MAGENTO_MEDIA_URL=https://www.silhouetteamerica.com/media/catalog/product
MAGENTO_TOKEN=your_token
KLEVU_SEARCH_URL=https://uscs32v2.ksearchnet.com/cs/v2/search
KLEVU_API_KEY=your_klevu_key
```

### 2. Install & Run
```bash
npm install
npm start
```

### 3. Expose & Connect
```bash
ngrok http 8787
```
Paste the ngrok URL into **ChatGPT Settings > Apps & Connectors > Add Connector**.

---

## 📁 Project Structure

```
silhouette-ai-commerce/
├── server.js              # Core MCP Logic & API Adapters
├── .env                   # Protected API Credentials
├── public/
│   └── product-widget.html  # Premium UI Widget Source (Tailwind-like Vanilla CSS)
└── README.md              # Documentation
```

---

## 📄 License
MIT © 2026 — Built for Silhouette America.
