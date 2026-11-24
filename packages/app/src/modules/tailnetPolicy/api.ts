import {
  createApiRef,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/frontend-plugin-api';

/*
 * GET /api/tailnet-policy/overview, as packages/backend's tailnetPolicy
 * plugin serves it (render.ts Analysis plus plugin.ts PublishStatus).
 */

export type GrantStatus = 'match' | 'broad' | 'new';
export type DeclaredStatus = 'declared' | 'partial' | 'missing';

export interface PolicyGrantRef {
  number: number;
  line?: number;
  text: string;
}

export interface EdgeView {
  consumer: string;
  api: string;
  providers: string[];
  src: string[];
  dst: string[];
  ports: string[];
}

export interface GeneratedGrant {
  id: string;
  src: string[];
  dst: string[];
  ip: string[];
  edges: EdgeView[];
  status: GrantStatus;
  allowedBy: PolicyGrantRef[];
}

export interface HandWrittenGrant extends PolicyGrantRef {
  src: string[];
  dst: string[];
  ip: string[];
  status: DeclaredStatus;
  undeclared: string[];
  coveredBy: string[];
}

export interface LocalEdge {
  consumer: string;
  api: string;
  providers: string[];
  cluster: string;
}

export interface Finding {
  entity: string;
  message: string;
}

export interface Overview {
  renderedAt: string;
  basePolicyUrl: string;
  summary: Record<GrantStatus | DeclaredStatus | 'grants', number>;
  grants: GeneratedGrant[];
  handWritten: HandWrittenGrant[];
  notCompared: PolicyGrantRef[];
  local: LocalEdge[];
  invalid: Finding[];
  missingSource: Finding[];
  tagOwners: Record<string, string[]>;
  publish?: {
    repo: string;
    path: string;
    branch: string;
    last?: { at: string; outcome: string; url?: string };
  };
}

export interface TailnetPolicyApi {
  getOverview(): Promise<Overview>;
}

export const tailnetPolicyApiRef = createApiRef<TailnetPolicyApi>().with({
  id: 'plugin.tailnet-policy',
  pluginId: 'tailnet-policy',
});

/**
 * Fetches the overview, and keeps it for a minute: every entity page's card
 * reads it, and the backend renders it from the whole catalog.
 */
export class TailnetPolicyClient implements TailnetPolicyApi {
  private cached?: { at: number; overview: Promise<Overview> };

  constructor(
    private readonly deps: { discoveryApi: DiscoveryApi; fetchApi: FetchApi },
  ) {}

  getOverview(): Promise<Overview> {
    if (this.cached && Date.now() - this.cached.at < 60_000) {
      return this.cached.overview;
    }
    const overview = this.load();
    this.cached = { at: Date.now(), overview };
    overview.catch(() => {
      if (this.cached?.overview === overview) this.cached = undefined;
    });
    return overview;
  }

  private async load(): Promise<Overview> {
    const base = await this.deps.discoveryApi.getBaseUrl('tailnet-policy');
    const response = await this.deps.fetchApi.fetch(`${base}/overview`);
    if (!response.ok) {
      throw new Error(
        `Tailnet policy: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as Overview;
  }
}
