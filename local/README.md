# local/ — internal scratch space (not committed)

This folder is for internal testing and whatnot: experiments, scratch notes,
one-off scripts (`npx tsx local/scratch.ts`), sample data, local debugging.

- Everything in here is **git-ignored** except this README, so it never lands
  in a commit or PR. Safe to create, rename, and delete freely.
- Don't put real secrets or credentials here — use `.env.local` (also ignored)
  for those.
- Don't import anything from `local/` into `src/`; the production build must
  never depend on this folder.
