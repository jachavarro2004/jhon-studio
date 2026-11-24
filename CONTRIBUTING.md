# Contributing to jhon-studio

Thanks for wanting to help. jhon-studio is maintained by one person, so the
process below keeps every change easy to review.

## Questions, ideas and bugs

- **A question or an idea to talk through:** open a Discussion.
- **A bug:** open an issue with the bug form. Say what you ran, what you
  expected and what happened, with your `jhon-studio --version`, your Node
  version and what `jhon-studio doctor` prints.
- **A proposal:** open an issue with the proposal form before you write
  code, so we can agree on the shape first.
- **A security problem:** never in public; see [SECURITY.md](SECURITY.md).

## Pull requests

1. Start from an issue we agreed on, unless the fix is small and obvious
   (a typo, a broken link, a one-line bug).
2. Keep a pull request to one change. A large change is easier to review as
   a few smaller pull requests.
3. Behaviour changes come with tests, written first. The tests need no
   model, GPU or network: the README's "Development" section says how they
   run.
4. Run the tests before you push, on Node 22 or newer (no build step, no
   dependencies):

   ```sh
   node --experimental-strip-types --no-warnings --test test/*.test.ts
   ```

   CI runs the same command on Node 22, 24 and the current LTS.
5. Keep the repository generic: the hygiene test refuses what belongs to
   one particular project.
6. Update the docs and the help text (`--help`) that describe what you
   changed.
7. Use a [Conventional Commits](https://www.conventionalcommits.org) message,
   such as `fix(capture): …` or `docs: …`.

Every pull request needs the CI checks green and the maintainer's review
before it is merged.

## License

jhon-studio is licensed under the [Apache License 2.0](LICENSE). By
contributing, you agree that your contribution is licensed under the same
terms.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
