import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  EntityProvider,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { tailnetPolicyApiRef, type Overview } from '../api';
import { TailnetPolicyPage } from './TailnetPolicyPage';
import { EntityTailnetPolicyCard } from './EntityTailnetPolicyCard';

// jsdom has no SVG layout; the flow graph measures its nodes.
beforeAll(() => {
  (SVGElement.prototype as any).getBBox = () => ({
    x: 0,
    y: 0,
    width: 120,
    height: 20,
  });
});

const overview: Overview = {
  renderedAt: new Date().toISOString(),
  basePolicyUrl:
    'https://github.com/cedi/homelab/blob/main/tailscale/policy.hujson',
  summary: {
    grants: 2,
    match: 1,
    broad: 1,
    new: 0,
    declared: 1,
    partial: 0,
    missing: 0,
  },
  grants: [
    {
      id: 'tag:backstage → tag:lab-argocd : tcp:443',
      src: ['tag:backstage'],
      dst: ['tag:lab-argocd'],
      ip: ['tcp:443'],
      status: 'match',
      allowedBy: [
        {
          number: 13,
          line: 212,
          text: 'tag:backstage → tag:lab-argocd : tcp:443',
        },
      ],
      edges: [
        {
          consumer: 'component:default/backstage',
          api: 'api:default/argocd-labk3s-api',
          providers: ['component:default/argocd-labk3s'],
          src: ['tag:backstage'],
          dst: ['tag:lab-argocd'],
          ports: ['tcp:443'],
        },
      ],
    },
    {
      id: 'tag:homelab → tag:homelab : tcp:6443',
      src: ['tag:homelab'],
      dst: ['tag:homelab'],
      ip: ['tcp:6443'],
      status: 'broad',
      allowedBy: [
        { number: 3, line: 143, text: 'tag:homelab → tag:homelab : *' },
      ],
      edges: [
        {
          consumer: 'component:default/k3s-agent',
          api: 'api:default/labk3s-kubernetes-api',
          providers: ['component:default/k3s-server'],
          src: ['tag:homelab'],
          dst: ['tag:homelab'],
          ports: ['tcp:6443'],
        },
      ],
    },
  ],
  handWritten: [
    {
      number: 13,
      line: 212,
      text: 'tag:backstage → tag:lab-argocd : tcp:443',
      src: ['tag:backstage'],
      dst: ['tag:lab-argocd'],
      ip: ['tcp:443'],
      status: 'declared',
      undeclared: [],
      coveredBy: ['tag:backstage → tag:lab-argocd : tcp:443'],
    },
  ],
  notCompared: [
    { number: 18, line: 260, text: 'tag:smarthome → nas : tcp:445' },
  ],
  local: [
    {
      consumer: 'component:default/backstage',
      api: 'api:default/argocd-api',
      providers: ['component:default/argocd'],
      cluster: 'resource:default/specht-labs',
    },
  ],
  invalid: [],
  missingSource: [],
  tagOwners: {},
  capabilities: {
    summary: {
      grants: 1,
      match: 0,
      differs: 1,
      new: 0,
      declared: 0,
      missing: 1,
      handWritten: 1,
    },
    grants: [
      {
        entity: 'tailscalegrant:default/tka-admins',
        title: 'Admins are cluster-admin through TKA',
        targets: ['component:default/tka'],
        src: ['group:admins'],
        dst: ['tag:tka'],
        ip: ['*'],
        app: {
          'specht-labs.de/cap/tka': [{ role: 'cluster-admin', period: '8h' }],
        },
        status: 'differs',
        counterpart: {
          number: 12,
          line: 200,
          text: 'group:admins → tag:tka : *',
        },
        differences: ['specht-labs.de/cap/tka: different values'],
      },
    ],
    handWritten: [
      {
        number: 12,
        line: 200,
        text: 'group:admins → tag:tka : *',
        src: ['group:admins'],
        dst: ['tag:tka'],
        ip: ['*'],
        app: {
          'specht-labs.de/cap/tka': [{ role: 'cluster-admin', period: '1h' }],
        },
        status: 'differs',
        declaredBy: 'tailscalegrant:default/tka-admins',
      },
    ],
  },
  publish: {
    repo: 'SpechtLabs/tailnet-policy-sandbox',
    path: 'tailscale/generated.hujson',
    branch: 'backstage/tailnet-policy',
    last: {
      at: new Date().toISOString(),
      outcome: 'updated',
      url: 'https://github.com/SpechtLabs/tailnet-policy-sandbox/pull/1',
    },
  },
};

const api = { getOverview: async () => overview };
const mountedRoutes = { '/catalog/:namespace/:kind/:name': entityRouteRef };

const entity = (kind: string, name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind,
  metadata: { name, namespace: 'default' },
  spec: {},
});

describe('TailnetPolicyPage', () => {
  it('shows the grants, the comparison and the deep links', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[tailnetPolicyApiRef, api]]}>
        <TailnetPolicyPage />
      </TestApiProvider>,
      { mountedRoutes },
    );
    expect(await screen.findByText('Generated grants')).toBeInTheDocument();
    expect(screen.getAllByText('Allowed only by a broad rule')).toHaveLength(2);
    expect(screen.getAllByText('#13')[0].closest('a')).toHaveAttribute(
      'href',
      'https://github.com/cedi/homelab/blob/main/tailscale/policy.hujson#L212',
    );
    expect(
      screen.getByText('Pull request in SpechtLabs/tailnet-policy-sandbox'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 edges inside a cluster')).toBeInTheDocument();
    expect(screen.getByText('Capability grants')).toBeInTheDocument();
    expect(screen.getAllByText('A TailscaleGrant differs').length).toBe(1);
  });
});

describe('EntityTailnetPolicyCard', () => {
  const renderCard = (e: Entity) =>
    renderInTestApp(
      <TestApiProvider apis={[[tailnetPolicyApiRef, api]]}>
        <EntityProvider entity={e}>
          <EntityTailnetPolicyCard />
        </EntityProvider>
      </TestApiProvider>,
      { mountedRoutes },
    );

  it('shows what a consumer reaches', async () => {
    await renderCard(entity('Component', 'backstage'));
    expect(
      await screen.findByText('Reaches over the tailnet'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('tag:lab-argocd').length).toBeGreaterThan(0);
  });

  it('shows who reaches a provider', async () => {
    await renderCard(entity('Component', 'argocd-labk3s'));
    expect(
      await screen.findByText('Reached over the tailnet by'),
    ).toBeInTheDocument();
  });

  it('shows the capability grants for a target', async () => {
    await renderCard(entity('Component', 'tka'));
    expect(await screen.findByText('Capability grants')).toBeInTheDocument();
    expect(screen.getByText('specht-labs.de/cap/tka')).toBeInTheDocument();
    expect(
      screen.getByText('Differs from the hand-written grant'),
    ).toBeInTheDocument();
  });

  it("shows a TailscaleGrant's own grant", async () => {
    await renderCard({
      apiVersion: 'specht-labs.de/v1alpha1',
      kind: 'TailscaleGrant',
      metadata: { name: 'tka-admins', namespace: 'default' },
      spec: {},
    });
    expect(await screen.findByText('The grant')).toBeInTheDocument();
    expect(screen.getByText('group:admins')).toBeInTheDocument();
    expect(
      screen.getByText('specht-labs.de/cap/tka: different values'),
    ).toBeInTheDocument();
  });

  it('renders nothing off the tailnet', async () => {
    const { container } = await renderCard(entity('Component', 'cilium'));
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText('Tailnet policy')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
