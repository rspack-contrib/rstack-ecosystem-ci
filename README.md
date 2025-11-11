# rstack-ecosystem-ci

This repository provides a unified ecosystem CI harness for Rstack projects.

## Via GitHub workflow

### scheduled

Workflows are scheduled to run automatically every day

### manually

- open [workflow](../../actions/workflows/ecosystem-ci-selected.yml)
- click 'Run workflow' button on top right of the list
- select suite to run in dropdown
- start workflow

## Via CLI

- clone this repo
- run `pnpm i`
- run `pnpm test -- --stack <stack>` to run every suite under the selected stack (`rsbuild`, `rspack`, `rstest`, `rslib`, `rsdoctor`, or `rslint`)
- run `pnpm test -- --stack rspack` to execute all Rspack suites (available stacks: `rsbuild`, `rspack`, `rstest`, `rslib`, `rsdoctor`, `rslint`)
- run `pnpm test -- --stack rslib` to execute all Rslib suites
- run `pnpm test -- --stack rsbuild plugins` to target a specific suite
- or invoke `tsx ecosystem-ci.ts` directly for advanced commands such as `build`, `run-suites`, or `bisect`

The version selection flags apply to the chosen stack:

- `--tag v2.8.0-beta.1`, `--branch some-branch` or `--commit abcd1234` pick the stack source to build
- `--release 2.7.13` skips the local build and pulls the stack from the registry instead

The repositories are checked out into `workspace` subdirectory as shallow clones

### Cheat sheet

- `pnpm test -- --stack rspack --release nightly <suite>`: run a nightly release of the selected stack
- `pnpm test -- --stack rsbuild --branch main --suite-branch update-rsbuild <suite>`: use `update-rsbuild` branch for the suite to test `main`

# How to add a new integration test

- check out the existing suites under `tests/<stack>` and add one yourself. Thanks to the shared utilities it is really easy
- once you are confidente the suite works, add it to the lists of suites in the [workflows](../../actions/)

> the current utilities focus on pnpm based projects. Consider switching to pnpm or contribute utilities for other pms

# Reporting results

### On your own server

- Go to `Server settings > Integrations > Webhooks` and click `New Webhook`
- Give it a name, icon and a channel to post to
- copy the webhook url
- get in touch with admins of this repo so they can add the webhook

## Credits

Thanks to:

- [vitejs/vite-ecosystem-ci](https://github.com/vitejs/vite-ecosystem-ci)
- [vuejs/ecosystem-ci](https://github.com/vuejs/ecosystem-ci)

which inspired the development of this project.
