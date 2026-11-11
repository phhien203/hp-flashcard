# Changesets

Every PR that changes the published behaviour of `@hp-flashcard/ui` needs a changeset:

```sh
pnpm changeset
```

Pick the bump (patch / minor / major) and write a one-line, consumer-facing summary.
See [RELEASING.md](../RELEASING.md) for how changesets become npm releases.
