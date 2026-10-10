# adf-web

ADF's React/TypeScript interface for projects, tasks, visual workflows, versioned agent configuration and execution monitoring. This independent repository is a pinned submodule of the [ADF umbrella](https://github.com/alex-kzr/adf-meta). The API and host worker provide execution authority; this application has no local mock backend.

The implemented screens use real REST mutations and authenticated SSE. Whole-system readiness remains false until the umbrella acceptance gates and real provider checks pass. See [frontend development and verification](docs/development.md) for implemented behavior, contracts and remaining integration evidence.

## Development

Use Node 24 LTS; CI uses 24.14.0. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run lint
npm test
npm run build
npm run dev
```

The development server binds to `127.0.0.1:5173` and proxies `/api` to the local API on port 8080. The umbrella Docker workflow serves the production build with the same-origin API proxy. Enter the configured local admin bearer token after each reload; it remains in memory. Authenticate subscription CLI providers separately in the WSL host worker account.

## Documentation

- [Frontend development and verification](docs/development.md)
- [Architecture](../docs/architecture.md)
- [Product and acceptance](../docs/product.md)
- [Frontend design](../docs/frontend.md)
- [Contracts](../docs/contracts.md)
- [Implemented API wire contract](../services/api/docs/wire-contract.md)
- [Security](../docs/security.md)
- [Local Docker / WSL workflow](../docs/local-development.md)
- [Backlog](../docs/backlog.md)
- [Repository publication](../docs/repositories.md)

Relative shared links require the initialized umbrella checkout. For a standalone clone, obtain the matching [adf-meta documentation](https://github.com/alex-kzr/adf-meta/tree/main/docs) and module pins. The user supplied the existing [adf-web origin](https://github.com/alex-kzr/adf-web); publication is a separate authorized action.
