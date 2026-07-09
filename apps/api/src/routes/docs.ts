import { Router } from 'express';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * API docs: serves the OpenAPI spec and a self-contained Swagger UI page.
 * Public (no auth) so it's easy to share. The spec file is read once at boot.
 */
const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// openapi.yaml lives at the apps/api root (two levels up from src/routes).
const specPath = path.resolve(__dirname, '../../openapi.yaml');

let specCache: string | null = null;
function loadSpec(): string {
  if (specCache === null) {
    try {
      specCache = readFileSync(specPath, 'utf8');
    } catch {
      specCache = 'openapi: 3.0.3\ninfo:\n  title: LeadOS API\n  version: 0.1.0\npaths: {}\n';
    }
  }
  return specCache;
}

/** GET /api/docs/openapi.yaml — raw spec (Postman/CI can fetch this). */
router.get('/openapi.yaml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
  res.send(loadSpec());
});

/** GET /api/docs — Swagger UI (loads swagger-ui-dist from CDN). */
router.get('/', (req: Request, res: Response) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LeadOS API — Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>body{margin:0}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '${base}/api/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
    });
  </script>
</body>
</html>`);
});

export default router;
