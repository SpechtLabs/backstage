import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { HomePageWidgetBlueprint } from '@backstage/plugin-home-react/alpha';
import { MarkdownContent } from '@backstage/core-components';

const content = `
The catalog of everything SpechtLabs runs: services, the infrastructure
under them, who owns what, and where it is deployed.

- **[Catalog](/catalog)**: components, systems and resources. A component's
  *Kubernetes* tab shows its pods on specht-labs.
- **[Create](/create)**: scaffold something new from a template.
- **[Docs](/docs)**: TechDocs next to the code.

### Add something to the catalog

Put a \`catalog-info.yaml\` at the root of any SpechtLabs repo
([format](https://backstage.io/docs/features/software-catalog/descriptor-format)):
discovery picks it up within 30 minutes. Annotations wire up the tabs:

- \`argocd/app-name\`: its ArgoCD Application
- \`backstage.io/kubernetes-label-selector\` (and
  \`backstage.io/kubernetes-namespace\`): its workloads
- \`github.com/project-slug\`: its repo

This card lives in \`packages/app/src/modules/home/homeModule.tsx\` in
[SpechtLabs/backstage](https://github.com/SpechtLabs/backstage).
`;

const welcomeWidget = HomePageWidgetBlueprint.make({
  name: 'welcome',
  params: {
    name: 'Welcome',
    title: 'SpechtLabs Backstage',
    description: 'What is here and how to add to it',
    components: async () => ({
      Content: () => <MarkdownContent content={content} />,
    }),
  },
});

export const homeModule = createFrontendModule({
  pluginId: 'home',
  extensions: [welcomeWidget],
});
