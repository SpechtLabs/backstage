import {
  createApiRef,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/frontend-plugin-api';

/*
 * What packages/backend's tailscale plugin serves (compile.ts, access.ts,
 * plugin.ts). Keep in step with those.
 */

export type PrincipalKind =
  | 'any'
  | 'group'
  | 'user'
  | 'tag'
  | 'service'
  | 'autogroup'
  | 'host'
  | 'address'
  | 'ipset';

export interface Principal {
  value: string;
  name: string;
  kind: PrincipalKind;
  entityRef?: string;
  title?: string;
}

export type Lines = [number, number];

export interface Rule {
  id: string;
  entityRef?: string;
  title?: string;
  description?: string;
  lines?: Lines;
}

export interface CatalogEdge {
  consumer: string;
  api: string;
  providers: string[];
  src: string[];
  dst: string[];
  ports: string[];
}

export type App = Record<string, Array<Record<string, unknown>>>;

export interface GrantRule extends Rule {
  origin: 'entity' | 'catalog';
  src: Principal[];
  dst: Principal[];
  ip: string[];
  app?: App;
  via?: Principal[];
  srcPosture?: string[];
  edges?: CatalogEdge[];
}

export interface SshRule extends Rule {
  action: 'accept' | 'check';
  src: Principal[];
  dst: Principal[];
  users: string[];
  checkPeriod?: string;
  acceptEnv?: string[];
  recorder?: Principal[];
  enforceRecorder?: boolean;
}

export interface TagRule extends Rule {
  tag: string;
  owners: Principal[];
  appliesTo: string[];
  usage: number;
}

export interface NodeAttrRule extends Rule {
  nodes: Principal[];
  attr: string[];
  app?: Record<string, unknown>;
  ipPool?: string[];
}

export interface ApproverRule extends Rule {
  kind: 'service' | 'route' | 'exitNode';
  target: string;
  approvers: Principal[];
}

export interface Member {
  login?: string;
  entityRef: string;
  title?: string;
}

export interface GroupView {
  name: string;
  entityRef: string;
  title?: string;
  description?: string;
  members: Member[];
  usage: number;
  lines?: Lines;
}

export interface HostView {
  name: string;
  address: string;
  lines?: Lines;
}

export interface TestRule extends Rule {
  kind: 'acl' | 'ssh';
  src: Principal;
  proto?: string;
  dst?: Principal[];
  accept: string[];
  deny: string[];
  check: string[];
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  entityRef?: string;
}

export type TailscaleType =
  | 'policy'
  | 'grant'
  | 'ssh'
  | 'tag'
  | 'nodeAttr'
  | 'autoApprovers'
  | 'test';

export interface PartSummary {
  entityRef: string;
  type: TailscaleType;
  name: string;
  title?: string;
  description?: string;
  lines: Lines[];
}

export interface Span {
  entityRef: string;
  section: string;
  lines: Lines;
}

export interface Finding {
  entity: string;
  message: string;
}

export interface PolicyView {
  entityRef: string;
  name: string;
  title?: string;
  description?: string;
  tailnet?: string;
  owner?: string;
  renderedAt: string;
  text: string;
  spans: Span[];
  parts: PartSummary[];
  groups: GroupView[];
  hosts: HostView[];
  tags: TagRule[];
  grants: GrantRule[];
  ssh: SshRule[];
  nodeAttrs: NodeAttrRule[];
  autoApprovers: ApproverRule[];
  tests: TestRule[];
  settings: string[];
  catalog: {
    enabled: boolean;
    covered: Array<CatalogEdge & { coveredBy: string[] }>;
    local: Array<{
      consumer: string;
      api: string;
      providers: string[];
      cluster: string;
    }>;
    missingSource: Finding[];
    invalid: Finding[];
  };
  diagnostics: Diagnostic[];
}

export interface PublishStatus {
  repo: string;
  path: string;
  branch: string;
  last?: { at: string; outcome: string; url?: string; error?: string };
}

export interface Overview {
  renderedAt: string;
  policies: PolicyView[];
  orphans: Diagnostic[];
  publish: Record<string, PublishStatus>;
}

export interface Identity {
  name: string;
  source: boolean;
  destination: boolean;
  via: string;
}

export interface EntityAccess {
  policy: { entityRef: string; name: string; title?: string; tailnet?: string };
  identities: Identity[];
  outbound: GrantRule[];
  inbound: GrantRule[];
  sshInto: SshRule[];
  sshFrom: SshRule[];
  tags: TagRule[];
  owns: TagRule[];
  nodeAttrs: NodeAttrRule[];
  approvals: ApproverRule[];
  tests: TestRule[];
  appliesTo: string[];
}

export interface TailscaleApi {
  getOverview(): Promise<Overview>;
  getAccess(entityRef: string): Promise<EntityAccess[]>;
}

export const tailscaleApiRef = createApiRef<TailscaleApi>().with({
  id: 'plugin.tailscale',
  pluginId: 'tailscale',
});

/**
 * Keeps the overview for a minute: the page, the policy tab and every entity
 * card read it, and the backend renders it from the whole catalog.
 */
export class TailscaleClient implements TailscaleApi {
  private cached?: { at: number; overview: Promise<Overview> };

  constructor(
    private readonly deps: { discoveryApi: DiscoveryApi; fetchApi: FetchApi },
  ) {}

  getOverview(): Promise<Overview> {
    if (this.cached && Date.now() - this.cached.at < 60_000) {
      return this.cached.overview;
    }
    const overview = this.get<Overview>('/overview');
    this.cached = { at: Date.now(), overview };
    overview.catch(() => {
      if (this.cached?.overview === overview) this.cached = undefined;
    });
    return overview;
  }

  getAccess(entityRef: string): Promise<EntityAccess[]> {
    return this.get(`/access?entity=${encodeURIComponent(entityRef)}`);
  }

  private async get<T>(path: string): Promise<T> {
    const base = await this.deps.discoveryApi.getBaseUrl('tailscale');
    const response = await this.deps.fetchApi.fetch(`${base}${path}`);
    if (!response.ok) {
      throw new Error(`Tailscale: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }
}
