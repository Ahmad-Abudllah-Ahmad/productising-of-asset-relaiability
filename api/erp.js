// Vercel serverless function for the ERP integration API: /api/erp/* is rewritten to /api/erp?p=<route> (see vercel.json).
// Same code as server.js uses locally: reliability/js/erp/handler.js. Read-only. With no environment variables it serves the mock SAP adapter.
module.exports = async (req, res) => {
  try {
    const [erp, seed] = await Promise.all([import("../reliability/js/erp/handler.js"), import("../reliability/js/data/seed.js")]);
    const { p, ...rest } = req.query || {};
    const route = Array.isArray(p) ? p.join("/") : String(p || "status");
    await erp.respond(req, res, { path: `/api/erp/${route}`, query: rest, env: process.env, loadSeed: async () => seed.generateSeed() });
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: { code: "internal", message: "The ERP layer failed to start." } }));
  }
};
