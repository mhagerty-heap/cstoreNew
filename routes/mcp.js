const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const db = require('../config/database');

// @modelcontextprotocol/ext-apps ships ESM-only and Vercel's runtime doesn't
// allow require()-ing it from a CJS file (ERR_REQUIRE_ESM) even though this
// works fine on a locally-installed Node — load it lazily via dynamic
// import() instead, cached after the first call.
let extAppsPromise = null;
function loadExtApps() {
  if (!extAppsPromise) extAppsPromise = import('@modelcontextprotocol/ext-apps/server');
  return extAppsPromise;
}

const router = express.Router();
router.use(cors());

const WIDGET_URI = 'ui://widget/search-sneakers.html';
const widgetHtml = fs.readFileSync(path.join(__dirname, '..', 'mcp', 'widget', 'search-sneakers.html'), 'utf8');

// ContentSquare's tracking domains need to be explicitly allowlisted for the
// widget's embedded CSQ tag to actually load and fire inside the sandboxed
// ChatGPT iframe — this is what makes "session replay inside the ChatGPT
// App iframe" (Layer 2 of the Human & Agent Interactions use case) real.
// contentsquare.com (not just .net) is also required — the tag's own
// tagVerificationDomain (tcvsapi.contentsquare.com) calls a
// verify-installation endpoint there, seen getting blocked live in the
// browser console with only *.contentsquare.net allowlisted. Product image
// hosts need the same treatment — demo.pre-sales.fr is where the real
// catalog images live, and picsum.photos is the fallback used when a
// product has no seeded image.
const CSQ_CSP = {
  connectDomains: ['https://*.contentsquare.net', 'https://*.contentsquare.com', 'https://cstore-new.vercel.app'],
  resourceDomains: ['https://*.contentsquare.net', 'https://*.contentsquare.com', 'https://demo.pre-sales.fr', 'https://picsum.photos'],
};

function searchSneakers({ query, max_price, color, size, category }) {
  // Every product is tagged to a subcategory (e.g. "running-shoes", not the
  // parent "running"), and models tend to pass general category-ish phrases
  // for `query` alongside structured filters — so match query word-by-word
  // against name/description/category name, and resolve `category` against
  // either the exact slug or any child of a matching parent slug.
  const conditions = ["p.status = 'active'"];
  const params = {};

  if (query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const wordConds = words.map((w, i) => {
      params['w' + i] = w;
      return `(p.name LIKE '%'||@w${i}||'%' OR p.short_description LIKE '%'||@w${i}||'%' OR c.name LIKE '%'||@w${i}||'%')`;
    });
    if (wordConds.length) conditions.push('(' + wordConds.join(' OR ') + ')');
  }
  if (max_price != null) {
    conditions.push('p.price <= @max_price');
    params.max_price = max_price;
  }
  if (category) {
    conditions.push('(c.slug = @category OR c.parent_id = (SELECT id FROM categories WHERE slug = @category))');
    params.category = category;
  }
  if (color) {
    conditions.push(`EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.product_id = p.id AND pa.name = 'Color' AND pa.attr_values LIKE '%'||@color||'%')`);
    params.color = color;
  }
  if (size) {
    conditions.push(`EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.product_id = p.id AND pa.name = 'Size' AND pa.attr_values LIKE '%'||@size||'%')`);
    params.size = size;
  }

  const rows = db.prepare(`
    SELECT DISTINCT p.id, p.name, p.slug, p.price, p.compare_price, p.sku, pi.url as image_url
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.sort_order = 0
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.created_at DESC
    LIMIT 12
  `).all(params);

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    price: r.price,
    compare_price: r.compare_price,
    image_url: r.image_url || ('https://picsum.photos/seed/p' + r.id + '/400/400'),
  }));
}

async function createServer() {
  const { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } = await loadExtApps();
  const server = new McpServer({ name: 'cstore-sneaker-finder', version: '0.1.0' });

  registerAppResource(
    server,
    'search-sneakers-widget',
    WIDGET_URI,
    {},
    async () => ({
      contents: [{
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        _meta: { ui: { prefersBorder: true, csp: CSQ_CSP } },
      }],
    })
  );

  registerAppTool(
    server,
    'search_sneakers',
    {
      title: 'Search CStore Sneakers',
      description: 'Searches CStore\'s real sneaker catalog by keyword, max price, color, size, and category. ' +
        'Use this whenever the user asks to find, search, or browse sneakers/shoes on CStore.',
      inputSchema: {
        query: z.string().optional().describe("Free-text search, e.g. 'running shoes' or 'basketball sneakers'"),
        max_price: z.number().optional().describe('Maximum price in USD'),
        color: z.string().optional().describe("Color, e.g. 'black', 'navy', 'white'"),
        size: z.coerce.string().optional().describe("US shoe size, e.g. '10' or '9.5'"),
        category: z.string().optional().describe("Category slug, e.g. 'running', 'basketball', 'lifestyle'"),
      },
      outputSchema: {
        products: z.array(z.object({
          id: z.number(),
          name: z.string(),
          slug: z.string(),
          price: z.number(),
          compare_price: z.number().nullable(),
          image_url: z.string(),
        })),
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async (args) => {
      const products = searchSneakers(args || {});
      return {
        structuredContent: { products },
        content: [{
          type: 'text',
          text: products.length
            ? `Found ${products.length} sneaker${products.length === 1 ? '' : 's'} on CStore matching your search.`
            : 'No sneakers matched those filters on CStore — try loosening the price, color, or size.',
        }],
      };
    }
  );

  return server;
}

router.all('/mcp', async (req, res) => {
  const server = await createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

module.exports = router;
