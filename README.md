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

Every push to `main` builds `ghcr.io/spechtlabs/backstage` (tags `latest` and
`sha-<commit>`) with `packages/backend/Dockerfile`, a multi-stage build that
needs no host build steps:

```sh
docker build -f packages/backend/Dockerfile .
```

The cluster side lives in
[`k8s-deployment`](https://github.com/SpechtLabs/k8s-deployment) under
`apps/backstage/`: the Helm release, the CloudNativePG database
(`backstage-db`, backed up to S3), the route and the deployment-specific config
(`app-config.cluster.yaml`: URLs and the tsidp client), loaded after this
repo's `app-config.yaml` and `app-config.production.yaml`.

## Catalog

`catalog/org.yaml` holds users and groups. Sign-in matches the tsidp token's
`email` claim to a User's `spec.profile.email`.

## Upgrading Backstage

```sh
yarn backstage-cli versions:bump
```

Then read the release notes for anything that needs a code change.
