# Coding Standards

## Git

- **Always rebase, never merge.** Integrate upstream changes with `git pull --rebase` (or `git rebase origin/main`), never with a merge commit, so history stays linear. To make plain `git pull` rebase by default, run `git config pull.rebase true` in your clone.
