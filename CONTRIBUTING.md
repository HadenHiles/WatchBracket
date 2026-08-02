# Contributing to Watch Bracket

Thanks for helping make self-hosted movie night more fun.

## Development setup

1. Install Node.js 22.9+ and pnpm 10.34.x.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm compose:dev` for the complete local stack, or follow `README.md` for process-level development.
4. Use the deterministic mock catalog. A media server and provider credentials are not required.
5. Use `/display/test` to exercise every presentation scene at 720p and 1080p.

Before opening a pull request, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database changes require a generated Drizzle migration and a fresh-database integration test. Protocol changes require schema fixtures and backwards-compatibility notes. Provider changes must preserve the private integration boundary described in `docs/PROVIDER-ADAPTERS.md`.

Never commit credentials, private hostnames, IP addresses, database dumps, user history, or screenshots containing private room data. Keep pull requests focused and explain how the change was verified.

By participating, you agree to the `CODE_OF_CONDUCT.md`. Contributions are licensed under the repository's MIT license.
