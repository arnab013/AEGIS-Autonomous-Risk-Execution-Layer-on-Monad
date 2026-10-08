# Working on Aegis

Read `skills/typesafe-ai/SKILL.md` before changing Jev or TypeSafe behavior. It is a copy of the official installed TypeSafe skill, version 0.5.7. Read the current API and relevant primitive documentation as the skill directs.

Use `scripts/setup_env.ps1` before installs, builds or tests. Keep caches, temporary files, browser profiles and artifacts under this project on F:. Never put credentials in source or browser bundles. `scripts/setup-typesafe.mjs` reads the key from `F:/Projects/jev_key.txt` and configures the ignored server `.env`.

Keep paid inference off until API-credit usage is approved. Public inference must require owner access and a spending limit. Wallet transactions need an explicit user signing action.

Write code and documentation plainly. Comments should explain a constraint or decision that the code cannot show. Preserve source attribution, pre-existing-work disclosures and the competition's AI-tool disclosure. Distinguish chain reads, simulations, submitted transactions and confirmed fills.
