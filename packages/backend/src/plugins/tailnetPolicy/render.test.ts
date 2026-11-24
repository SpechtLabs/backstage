import type { Entity } from '@backstage/catalog-model';
import { buildTailnetGraph } from './graph';
import { parsePolicy } from './policy';
import { renderPolicy } from './render';

function entity(
  kind: string,
  name: string,
  opts: {
    annotations?: Record<string, string>;
    type?: string;
    relations?: Array<[string, string]>;
  } = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind,
    metadata: { name, namespace: 'default', annotations: opts.annotations },
    spec: opts.type ? { type: opts.type } : {},
    relations: (opts.relations ?? []).map(([type, targetRef]) => ({
      type,
      targetRef,
    })),
  };
}

const catalog: Entity[] = [
  entity('Resource', 'specht-labs', { type: 'kubernetes-cluster' }),
  entity('Resource', 'labk3s', { type: 'kubernetes-cluster' }),
  // backstage (specht-labs) -> argocd-labk3s-api (labk3s): a tailnet edge
  entity('Component', 'backstage', {
    annotations: { 'specht-labs.de/tailnet-src': 'tag:backstage' },
    relations: [
      ['dependsOn', 'resource:default/specht-labs'],
      ['consumesApi', 'api:default/argocd-labk3s-api'],
      ['consumesApi', 'api:default/argocd-api'],
    ],
  }),
  entity('Component', 'argocd-labk3s', {
    relations: [['dependsOn', 'resource:default/labk3s']],
  }),
  entity('API', 'argocd-labk3s-api', {
    annotations: {
      'specht-labs.de/tailnet-dst': 'tag:lab-argocd',
      'specht-labs.de/tailnet-ports': 'tcp:443',
    },
    relations: [['apiProvidedBy', 'component:default/argocd-labk3s']],
  }),
  // argocd-api is on specht-labs too: pod network, not a tailnet edge
  entity('Component', 'argocd', {
    relations: [['dependsOn', 'resource:default/specht-labs']],
  }),
  entity('API', 'argocd-api', {
    annotations: {
      'specht-labs.de/tailnet-dst': 'tag:k8s',
      'specht-labs.de/tailnet-ports': 'tcp:443',
    },
    relations: [['apiProvidedBy', 'component:default/argocd']],
  }),
  // nut-client (hosts) -> nut, the hand-written grant allows any protocol
  entity('Component', 'nut-client', {
    annotations: { 'specht-labs.de/tailnet-src': 'tag:homelab' },
    relations: [['consumesApi', 'api:default/nut']],
  }),
  entity('API', 'nut', {
    annotations: {
      'specht-labs.de/tailnet-dst': 'tag:core-infra',
      'specht-labs.de/tailnet-ports': 'tcp:3493',
    },
  }),
  // a consumer on the tailnet without an identity
  entity('Component', 'alloy-labk3s', {
    relations: [
      ['dependsOn', 'resource:default/labk3s'],
      ['consumesApi', 'api:default/nut'],
    ],
  }),
  // only allowed by the homelab zone rule
  entity('Component', 'k3s-agent', {
    annotations: { 'specht-labs.de/tailnet-src': 'tag:homelab' },
    relations: [['consumesApi', 'api:default/k3s-api']],
  }),
  entity('API', 'k3s-api', {
    annotations: {
      'specht-labs.de/tailnet-dst': 'tag:homelab',
      'specht-labs.de/tailnet-ports': 'tcp:6443',
    },
  }),
  // new, and invalid
  entity('Component', 'newcomer', {
    annotations: { 'specht-labs.de/tailnet-src': 'tag:newcomer' },
    relations: [
      ['consumesApi', 'api:default/k3s-api'],
      ['consumesApi', 'api:default/wide-open'],
    ],
  }),
  entity('API', 'wide-open', {
    annotations: {
      'specht-labs.de/tailnet-dst': '*',
      'specht-labs.de/tailnet-ports': '*',
    },
  }),
];

const base = parsePolicy(`{
  // comments and trailing commas, like policy.hujson
  "tagOwners": {
    "tag:backstage": ["group:admins", "tag:k8s-operator"],
    "tag:lab-argocd": ["group:admins", "tag:k3s-operator"],
  },
  "grants": [
    {"src": ["group:admins"], "dst": ["*"], "ip": ["*"]},
    {"src": ["tag:homelab"], "dst": ["tag:homelab"], "ip": ["*"]},
    {"src": ["tag:homelab"], "dst": ["tag:core-infra"], "ip": ["3493"]},
    {"src": ["tag:backstage"], "dst": ["tag:lab-argocd"], "ip": ["tcp:443"]},
    {"src": ["tag:homelab"], "dst": ["tag:buckle-server"], "ip": ["tcp:7700"]},
  ],
}`);

const options = {
  basePolicyUrl: 'https://example.com/policy.hujson',
  clusterTagOwners: {
    'specht-labs': 'tag:k8s-operator',
    labk3s: 'tag:k3s-operator',
  },
  defaultTagOwners: ['group:admins'],
};

describe('buildTailnetGraph', () => {
  const graph = buildTailnetGraph(catalog);

  it('finds edges that cross the tailnet', () => {
    expect(graph.edges.map(e => `${e.consumer} ${e.api}`).sort()).toEqual([
      'component:default/backstage api:default/argocd-labk3s-api',
      'component:default/k3s-agent api:default/k3s-api',
      'component:default/newcomer api:default/k3s-api',
      'component:default/nut-client api:default/nut',
    ]);
  });

  it('keeps edges inside a cluster apart', () => {
    expect(graph.local).toEqual([
      {
        consumer: 'component:default/backstage',
        api: 'api:default/argocd-api',
        cluster: 'resource:default/specht-labs',
      },
    ]);
  });

  it('reports consumers without a tailnet identity', () => {
    expect(graph.missingSource.map(f => f.entity)).toEqual([
      'component:default/alloy-labk3s',
    ]);
  });

  it('rejects wildcard destinations and ports', () => {
    expect(graph.invalid.map(f => f.entity)).toEqual([
      'api:default/wide-open',
      'api:default/wide-open',
    ]);
  });
});

describe('renderPolicy', () => {
  const rendered = renderPolicy(buildTailnetGraph(catalog), base, options);

  it('renders one grant per src/dst/ports', () => {
    expect(rendered.grants.map(g => [g.src, g.dst, g.ip, g.from])).toEqual([
      [
        ['tag:backstage'],
        ['tag:lab-argocd'],
        ['tcp:443'],
        ['component:backstage → api:argocd-labk3s-api'],
      ],
      [
        ['tag:homelab'],
        ['tag:core-infra'],
        ['tcp:3493'],
        ['component:nut-client → api:nut'],
      ],
      [
        ['tag:homelab'],
        ['tag:homelab'],
        ['tcp:6443'],
        ['component:k3s-agent → api:k3s-api'],
      ],
      [
        ['tag:newcomer'],
        ['tag:homelab'],
        ['tcp:6443'],
        ['component:newcomer → api:k3s-api'],
      ],
    ]);
  });

  it('compares with the hand-written policy', () => {
    expect(rendered.summary).toEqual({
      grants: 4,
      match: 2, // backstage, nut
      broad: 1, // k3s-agent, by the homelab zone rule
      new: 1, // newcomer
      declared: 1, // backstage -> lab-argocd
      partial: 1, // nut: the catalog says tcp, the grant allows any protocol
      missing: 1, // buckle
    });
  });

  it('owns new tags and writes tests', () => {
    expect(rendered.tagOwners).toEqual({
      'tag:core-infra': ['group:admins'],
      'tag:homelab': ['group:admins'],
      'tag:newcomer': ['group:admins'],
    });
    expect(rendered.tests[0]).toEqual({
      src: 'tag:backstage',
      accept: ['tag:lab-argocd:443'],
    });
  });

  it('writes a policy that parses back', () => {
    const parsed = parsePolicy(rendered.policyText);
    expect(parsed.grants).toHaveLength(4);
    expect(parsed.grants![0]).toEqual({
      src: ['tag:backstage'],
      dst: ['tag:lab-argocd'],
      ip: ['tcp:443'],
    });
  });
});
