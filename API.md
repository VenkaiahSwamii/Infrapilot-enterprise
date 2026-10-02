# 📡 InfraPilot Enterprise API Reference

## Base URL
`/api/v1`

---

## Endpoint Specification

### Authentication

#### `POST /api/v1/auth/login`
Authenticates a user and returns a JWT access token.

```json
{
  "email": "admin@infrapilot.io",
  "password": "Password123!"
}
```

---

### Enterprise Search (Unified Search)

#### `GET /api/v1/search?q={query}`
Searches platform resources.

#### `POST /api/v1/search/ai`
Natural language query search.

```json
{
  "query": "Which servers are unhealthy?"
}
```

---

### Observability & System Probes

- `GET /health` - System health probe (JSON)
- `GET /ready` - Kubernetes readiness probe (JSON)
- `GET /metrics` - Prometheus metrics exposition (Text)















































