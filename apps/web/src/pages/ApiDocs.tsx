import { Card } from '../components/ui';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * API Docs — embeds the live Swagger UI served by the API. Swagger UI loads
 * from a CDN, so it renders fully in a real browser. (In the sandboxed preview
 * iframe, external CDNs are blocked, so use the "Open in new tab" link.)
 */
export default function ApiDocs() {
  const docsUrl = `${API}/api/docs`;
  const specUrl = `${API}/api/docs/openapi.yaml`;
  return (
    <div>
      <div className="row between">
        <div>
          <div className="h1">API Documentation</div>
          <p className="subtle" style={{ marginTop: 0 }}>Interactive OpenAPI reference (Swagger UI).</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn outline" href={specUrl} target="_blank" rel="noreferrer">⬇ openapi.yaml</a>
          <a className="btn primary" href={docsUrl} target="_blank" rel="noreferrer">↗ Open Swagger UI</a>
        </div>
      </div>

      <div className="mt16">
        <Card>
          <div className="hint" style={{ marginBottom: 10 }}>
            Live docs below. If it doesn't render (e.g. in the in-app preview), use
            <strong> Open Swagger UI</strong> above. Import <code>openapi.yaml</code> into Postman for a full collection.
          </div>
          <iframe
            title="Swagger UI"
            src={docsUrl}
            style={{ width: '100%', height: '70vh', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }}
          />
        </Card>
      </div>
    </div>
  );
}
