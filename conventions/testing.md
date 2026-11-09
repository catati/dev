# Testing

These rules apply to every Catati repo. They define the three test layers, and what an agent proves on dev and leaves to production.

## Layers

| Layer | What it tests | Runs against | External services | Target |
| --- | --- | --- | --- | --- |
| Unit | One module's logic, on its own | Plain Node | None; fakes at the edges | `make test` |
| Integration | Our code with real local versions of its dependencies (Worker, D1, queues, auth) | Local workerd (Miniflare), local D1 | None. Email links and tokens are captured; Turnstile uses test keys | `make test` |
| E2E | A user journey in a real browser through the built app | Local stack in CI; the dev URL after a deploy | Same as integration | `make e2e` |

## Unit tests

| Rule | Check |
| --- | --- |
| A unit test uses no network or disk. | judgment |
| A test that needs a binding is an integration test. | judgment |

## Integration tests

| Rule | Check |
| --- | --- |
| An integration test follows the real path, such as sign-up, the captured verify link, then sign-in. | judgment |
| A fake stands in only for something outside our code. | judgment |
| An integration test calls no external service. It captures email links and tokens, and Turnstile uses its test keys. | judgment |

## E2E tests

| Rule | Check |
| --- | --- |
| Each journey in the repo's product doc has one e2e test. | judgment |
| An e2e test does not repeat logic that a unit or integration test already proves. | judgment |
| CI runs the e2e tests against the local stack. After a deploy to dev, they run against the dev URL. | judgment |

## Dev and production

| Rule | Check |
| --- | --- |
| The agent proves dev works on every change. Every layer is green, then an e2e smoke runs against the deployed dev URL. | judgment |
| Agents do not test production. Production runs the same code as dev. | judgment |
| Agents never create a production account or send real email. | judgment |
| Dev and production differ only by configuration, meaning bindings and secrets. They never take different code paths. | judgment |
| Each switch between dev and production configuration has a unit test. Production refusing the Turnstile test secret is an example. | judgment |
| The code behind each production-only seam below stays thin. | judgment |

## Production-only seams

Only production exercises these seams, so no agent test reaches them.

| Seam | What dev uses instead |
| --- | --- |
| Real email | Captured email links and tokens. |
| Real Turnstile | The Turnstile test keys. |
| Custom domain | The `workers.dev` URL. |
