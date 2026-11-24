# SpechtLabs Backstage

SpechtLabs' developer portal: the software catalog, TechDocs, scaffolder
templates and the views onto ArgoCD, Kubernetes, GitHub and Grafana.

## Where things live

- **This app**: [SpechtLabs/backstage](https://github.com/SpechtLabs/backstage).
  Every push to `main` is a release (`vX.Y.Z`); see the README.
- **The deployment**: `apps/backstage/` in
  [SpechtLabs/k8s-deployment](https://github.com/SpechtLabs/k8s-deployment),
  including `app-config.cluster.yaml` (URLs, sign-in, every credentialed
  plugin) and the CloudNativePG database.

## Adding a repo to the catalog

Put a `catalog-info.yaml` at the repo root. Discovery picks it up within
30 minutes. For docs like these, add `backstage.io/techdocs-ref: dir:.`, an
`mkdocs.yml` and a `docs/` folder.
