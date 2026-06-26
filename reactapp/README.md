# reacApp

## Development Endpoints

In development, the React app reads service URLs from `.env`:

```dotenv
REACT_APP_REST_API_BASE_URL=http://localhost:3300
REACT_APP_LOG_API_BASE_URL=http://localhost:3300
REACT_APP_FRONTAIL_BASE_URL=http://localhost:8080
```

In production, these values are ignored and the app automatically uses `window.location.hostname`
with the built-in service ports.
