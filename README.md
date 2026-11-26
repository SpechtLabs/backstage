# SpechtLabs Backstage

The SpechtLabs [Backstage](https://backstage.io) app: software catalog,
scaffolder, TechDocs. Runs on the `specht-labs` cluster at
<https://backstage.specht-labs.de>, with sign-in through tsidp (Tailscale's
OIDC IdP).

## Local development

Node and Yarn come from `mise.toml`:

```sh
mise install
yarn install
yarn start
```

Locally the app uses in-memory SQLite and offers guest sign-in.

## Deployment

Every push to `main` is a release. `.github/workflows/image.yaml` takes the
next version from the conventional commits since the last `v*` tag (breaking
→ major, `feat` → minor, anything else → patch), builds
`ghcr.io/spechtlabs/backstage` with `packages/backend/Dockerfile` (a
multi-stage build that needs no host steps), pushes it as `X.Y.Z`, `X.Y`,
`sha-<commit>` and `latest`, then tags and releases `vX.Y.Z` on GitHub.

```sh
docker build -f packages/backend/Dockerfile .
```

The cluster side lives in
[`k8s-deployment`](https://github.com/SpechtLabs/k8s-deployment) under
`apps/backstage/`: the Helm release, the CloudNativePG database
(`backstage-db`, backed up to S3), the route and the deployment-specific config
(`app-config.cluster.yaml`: URLs and the tsidp client), loaded after this
repo's `app-config.yaml` and `app-config.production.yaml`. The image version is
pinned there; Renovate opens (and automerges) a PR for each new release.

## Dependencies

Renovate (`renovate.json`) runs Monday mornings: all `@backstage/*` packages
in one PR, Node (mise and the Dockerfile) in another. Everything but majors
merges once the image build passes, and each merge is a patch release, which
then rolls out through k8s-deployment. Majors wait on the Dependency Dashboard.

## Catalog

Users and groups, and the Tech Radar, live in the private
[SpechtLabs/backstage_resources](https://github.com/SpechtLabs/backstage_resources):
Backstage reads them from GitHub, so changing them needs no release. Sign-in
matches the tsidp token's `email` claim to a User's `spec.profile.email`.

## Tailscale

The Tailscale pages and cards come from
[SpechtLabs/backstage-plugin-tailscale](https://github.com/SpechtLabs/backstage-plugin-tailscale),
published to npm as `@spechtlabs/backstage-plugin-tailscale` (app),
`-tailscale-backend` and `-catalog-backend-module-tailscale` (backend).
Changes to the plugin go there; a new release here is a version bump.
`.yarnrc.yml` lets `@spechtlabs/*` skip the 3-day minimum age, like
`@backstage/*`.

To check a policy change before pushing it, render from local checkouts and
compare with the policy file that gets applied:

```sh
yarn tailscale:diff ~/src/gh/cedi/homelab/tailscale/policy.hujson \
  ~/src/gh/cedi/homelab ~/src/gh/SpechtLabs/k8s-deployment \
  ~/src/gh/SpechtLabs/backstage_resources
```

See the plugin's README for what it prints. Exit status 1 means a difference
or an error.

## Upgrading Backstage by hand

```sh
yarn backstage-cli versions:bump
```

Then read the release notes for anything that needs a code change.
