# Development evidence

These reports record earlier development passes, with their original measured
counts and limitations. Current setup and validation commands are in the
[project README](../../README.md).

- [Hardening and progression handoff](hardening-handoff.md)
- [Balance output](balance-report.txt)
- [Initial browser playtest](playtest-report.txt)
- [Progression browser playtest](playtest-v2-report.txt)
- [Original implementation plan](gameplay-hardening-plan.md)

A few images remain in `media/` for the roadmap and reset flows. Repetitive panel,
viewport and reload captures were removed from the current tree after review.
Their exact original evidence remains available in Git history:

- [shots](https://github.com/Figo5/startup-tycoon/tree/7e09fe45571f0f42e95edd9bbf6e7bd3bf39d599/shots)
- [shots-v2](https://github.com/Figo5/startup-tycoon/tree/7e09fe45571f0f42e95edd9bbf6e7bd3bf39d599/shots-v2)
- [shots-reset](https://github.com/Figo5/startup-tycoon/tree/7e09fe45571f0f42e95edd9bbf6e7bd3bf39d599/shots-reset)

Paths inside historical reports describe the original checkout/output locations.
Reports are evidence, not current instructions or new test claims.

Browser harnesses generate ignored `shots/`, `shots-v2/` and `shots-reset/` folders.
Install Playwright separately and pass its module path via `PLAYWRIGHT_PATH` when
running the retained `tools/playtest*.mjs` scripts.
