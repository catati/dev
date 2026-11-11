# Testing

These facts apply to every Catati repo: where each test layer runs, and what only production exercises. How to write and prove tests is pstack's.

## Layers

| Layer | What it tests | Runs against | External services | Target |
| --- | --- | --- | --- | --- |
| Unit | One module's logic, on its own | Plain Node | None; fakes at the edges | `make test` |
| Integration | Our code with real local versions of its dependencies (Worker, D1, queues, auth) | Local workerd (Miniflare), local D1 | None. Email links and tokens are captured; Turnstile uses test keys | `make test` |
| E2E | A user journey in a real browser through the built app | Local stack in CI; the dev URL after a deploy | Same as integration | `make e2e` |

## Dev and production

| Rule | Check |
| --- | --- |
| Agents do not test production. Production runs the same code as dev. | judgment |
| Agents never create a production account or send real email. | judgment |
| Dev and production differ only by configuration, meaning bindings and secrets. They never take different code paths. | judgment |

## Production-only seams

Only production exercises these seams, so no agent test reaches them.

| Seam | What dev uses instead |
| --- | --- |
| Real email | Captured email links and tokens. |
| Real Turnstile | The Turnstile test keys. |
| Custom domain | The `workers.dev` URL. |
