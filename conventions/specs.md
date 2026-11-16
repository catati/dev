# Specs

A design ends in a spec that the operator approves, and the build works from that spec. These rules say what a spec holds.

| Rule | Check |
| --- | --- |
| A spec holds only what the design knows: the goal, a done check per PR that proves the PR works, the file boundaries, the PR order, who merges and the prod limits (operator, 2026-11-14). | judgment |
| A spec names its execution playbook in one line. It copies no playbook steps, skill sequences or Cursor-only steps (operator, 2026-11-14). | judgment |
| A spec that adds infrastructure, such as a Worker, queue, database, paid service or alert, has a **running-cost** row. The row gives the monthly cost and what scales it (operator, 2026-11-15). | judgment |
| A spec that adds infrastructure also has a **platform-native alternative** row. The row names what Cloudflare or Shopify already offers, and why the design uses it or not (operator, 2026-11-15). | judgment |
| Outbound customer contact, such as an email, SMS or notice, waits for an admin click by default. Automatic sending needs the operator's explicit choice in the spec (operator, 2026-11-14). | judgment |
