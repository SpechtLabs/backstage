import { parseEntityRef } from '@backstage/catalog-model';
import type { Finding, TailnetEdge, TailnetGraph } from './graph';
import {
  describeFlow,
  describeGrant,
  flowsOf,
  grantAllows,
  grantPorts,
  isServiceGrant,
  type Flow,
  type Grant,
  type ParsedPolicy,
} from './policy';
import { formatPort, isWildcardPort } from './ports';

export interface RenderOptions {
  /** Cluster Resource name -> the tag of the Tailscale operator on it. */
  clusterTagOwners: Record<string, string>;
  /** Owners of every generated tag, besides the operator. */
  defaultTagOwners: string[];
  /** The hand-written policy, as a github.com blob URL. */
  basePolicyUrl: string;
}

export type GrantStatus = 'match' | 'broad' | 'new';
export type DeclaredStatus = 'declared' | 'partial' | 'missing';
export type Summary = Record<GrantStatus | DeclaredStatus | 'grants', number>;

/** A grant in the hand-written policy. */
export interface PolicyGrantRef {
  /** 1-based position in its grants array. */
  number: number;
  /** 1-based line it starts on. */
  line?: number;
  text: string;
}

/** One catalog edge, as the UI shows it. */
export interface EdgeView {
  consumer: string;
  api: string;
  providers: string[];
  src: string[];
  dst: string[];
  ports: string[];
}

export interface GeneratedGrant {
  /** Stable id: the grant's own text. */
  id: string;
  src: string[];
  dst: string[];
  ip: string[];
  edges: EdgeView[];
  status: GrantStatus;
  /** The hand-written grants that allow it today. */
  allowedBy: PolicyGrantRef[];
}

export interface HandWrittenGrant extends PolicyGrantRef {
  src: string[];
  dst: string[];
  ip: string[];
  status: DeclaredStatus;
  /** Its flows the catalog doesn't declare. */
  undeclared: string[];
  /** The generated grants that cover it. */
  coveredBy: string[];
}

export interface LocalEdgeView {
  consumer: string;
  api: string;
  providers: string[];
  cluster: string;
}

/**
 * Everything the plugin knows: what the catalog renders to and how it
 * compares with the hand-written policy. The UI reads this as JSON; the
 * policy fragment and the pull request's report are made from it.
 */
export interface Analysis {
  renderedAt: string;
  basePolicyUrl: string;
  summary: Summary;
  grants: GeneratedGrant[];
  handWritten: HandWrittenGrant[];
  /** Service-shaped grants to named hosts: not expressible in the catalog. */
  notCompared: PolicyGrantRef[];
  local: LocalEdgeView[];
  invalid: Finding[];
  missingSource: Finding[];
  /** Tags the generated grants use that the hand-written policy has no owners for. */
  tagOwners: Record<string, string[]>;
}

/** component:default/backstage -> component:backstage */
export function shortRef(ref: string): string {
  const { kind, namespace, name } = parseEntityRef(ref);
  return namespace === 'default' ? `${kind}:${name}` : ref;
}

function edgeView(edge: TailnetEdge): EdgeView {
  return {
    consumer: edge.consumer,
    api: edge.api,
    providers: edge.providers,
    src: edge.src,
    dst: edge.dst,
    ports: edge.ports.map(formatPort),
  };
}

type Draft = Omit<GeneratedGrant, 'status' | 'allowedBy'>;

function grantsFromGraph(graph: TailnetGraph): Draft[] {
  const byKey = new Map<string, Draft>();
  for (const edge of graph.edges) {
    const src = [...edge.src].sort();
    const dst = [...edge.dst].sort();
    const ip = edge.ports.map(formatPort).sort();
    const id = describeGrant({ src, dst, ip });
    const grant = byKey.get(id);
    if (grant) grant.edges.push(edgeView(edge));
    else byKey.set(id, { id, src, dst, ip, edges: [edgeView(edge)] });
  }
  return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function tagOwnersFor(
  graph: TailnetGraph,
  grants: Draft[],
  parsed: ParsedPolicy,
  options: RenderOptions,
): Record<string, string[]> {
  // The clusters each tag shows up on, to find its operator.
  const clustersOfTag = new Map<string, Set<string>>();
  const note = (tags: string[], clusters: string[]) => {
    for (const tag of tags.filter(t => t.startsWith('tag:'))) {
      const set = clustersOfTag.get(tag) ?? new Set();
      clusters.forEach(c => set.add(parseEntityRef(c).name));
      clustersOfTag.set(tag, set);
    }
  };
  for (const edge of graph.edges) {
    note(edge.src, edge.srcClusters);
    note(edge.dst, edge.dstClusters);
  }
  const owners: Record<string, string[]> = {};
  const tags = new Set(grants.flatMap(g => [...g.src, ...g.dst]));
  for (const tag of [...tags].filter(t => t.startsWith('tag:')).sort()) {
    if (parsed.policy.tagOwners?.[tag]) continue;
    const operators = [...(clustersOfTag.get(tag) ?? [])]
      .map(c => options.clusterTagOwners[c])
      .filter(Boolean);
    owners[tag] = [...new Set([...options.defaultTagOwners, ...operators])];
  }
  return owners;
}

export function analyze(
  graph: TailnetGraph,
  parsed: ParsedPolicy,
  options: RenderOptions,
): Analysis {
  const baseGrants = parsed.policy.grants ?? [];
  const ref = (grant: Grant): PolicyGrantRef => {
    const index = baseGrants.indexOf(grant);
    return {
      number: index + 1,
      line: parsed.grantLines[index],
      text: describeGrant(grant),
    };
  };
  const serviceGrants = baseGrants.filter(isServiceGrant);
  const drafts = grantsFromGraph(graph);
  const summary: Summary = {
    grants: drafts.length,
    match: 0,
    broad: 0,
    new: 0,
    declared: 0,
    partial: 0,
    missing: 0,
  };

  const grants: GeneratedGrant[] = drafts.map(draft => {
    const exact = new Set<Grant>();
    const broad = new Set<Grant>();
    let status: GrantStatus = 'match';
    for (const flow of flowsOf(draft)) {
      const service = serviceGrants.find(g => grantAllows(g, flow));
      if (service) {
        exact.add(service);
        continue;
      }
      const other = baseGrants.find(g => grantAllows(g, flow));
      if (other) {
        broad.add(other);
        if (status === 'match') status = 'broad';
      } else {
        status = 'new';
      }
    }
    summary[status]++;
    const allowedBy = [
      ...(status === 'match' ? exact : new Set([...exact, ...broad])),
    ];
    return { ...draft, status, allowedBy: allowedBy.map(ref) };
  });

  const handWritten: HandWrittenGrant[] = serviceGrants.map(grant => {
    const flows = flowsOf(grant);
    const coveringGrants = (f: Flow) => grants.filter(g => grantAllows(g, f));
    // A bare port allows every protocol; the catalog usually names one.
    const asTcp = (f: Flow) =>
      f.port.proto === '*' &&
      coveringGrants({ ...f, port: { ...f.port, proto: 'tcp' } }).length > 0;
    const missing = flows.filter(f => !coveringGrants(f).length);
    let status: DeclaredStatus = 'partial';
    if (!missing.length) status = 'declared';
    else if (missing.length === flows.length && !missing.some(asTcp))
      status = 'missing';
    summary[status]++;
    const coveredBy = new Set(
      flows.flatMap(f => [
        ...coveringGrants(f),
        ...(asTcp(f)
          ? coveringGrants({ ...f, port: { ...f.port, proto: 'tcp' } })
          : []),
      ]),
    );
    return {
      ...ref(grant),
      src: grant.src,
      dst: grant.dst,
      ip: grant.ip ?? [],
      status,
      undeclared: missing.map(f =>
        asTcp(f)
          ? `${describeFlow(f)} (declared for tcp only)`
          : describeFlow(f),
      ),
      coveredBy: [...coveredBy].map(g => g.id),
    };
  });

  const notCompared = baseGrants
    .filter(
      g =>
        !g.app &&
        g.src.every(src => src.startsWith('tag:')) &&
        g.dst.some(d => !/^(tag|svc|autogroup):/.test(d) && d !== '*') &&
        grantPorts(g).every(p => !isWildcardPort(p)),
    )
    .map(ref);

  return {
    renderedAt: new Date().toISOString(),
    basePolicyUrl: options.basePolicyUrl,
    summary,
    grants,
    handWritten,
    notCompared,
    local: graph.local,
    invalid: graph.invalid,
    missingSource: graph.missingSource,
    tagOwners: tagOwnersFor(graph, drafts, parsed, options),
  };
}

const q = (s: string) => JSON.stringify(s);
const arr = (xs: string[]) => `[${xs.map(q).join(', ')}]`;

/**
 * The generated fragment: grants and the tag owners they need. No tests:
 * tests rendered by the same code would share its mistakes. The hand-written
 * tests check the merged policy instead.
 */
export function policyText(analysis: Analysis): string {
  const lines = [
    '// Generated by Backstage (the tailnet-policy backend plugin) from the',
    '// software catalog: one grant per Component that consumes an API with',
    "// specht-labs.de/tailnet-dst, from outside the provider's cluster.",
    '// Do not edit. Change the catalog-info.yaml files instead.',
    `// Compared against ${analysis.basePolicyUrl}`,
    '{',
    '\t"grants": [',
  ];
  for (const grant of analysis.grants) {
    for (const edge of grant.edges) {
      lines.push(`\t\t// ${shortRef(edge.consumer)} → ${shortRef(edge.api)}`);
    }
    lines.push(
      '\t\t{',
      `\t\t\t"src": ${arr(grant.src)},`,
      `\t\t\t"dst": ${arr(grant.dst)},`,
      `\t\t\t"ip":  ${arr(grant.ip)},`,
      '\t\t},',
    );
  }
  lines.push('\t],');
  if (Object.keys(analysis.tagOwners).length) {
    lines.push(
      '\t// Tags the grants use that the hand-written policy has no owners for.',
      '\t"tagOwners": {',
    );
    for (const [tag, owners] of Object.entries(analysis.tagOwners)) {
      lines.push(`\t\t${q(tag)}: ${arr(owners)},`);
    }
    lines.push('\t},');
  }
  lines.push('}', '');
  return lines.join('\n');
}

const code = (s: string) => `\`${s}\``;

/** The comparison as Markdown, for the pull request's body. */
export function reportMarkdown(analysis: Analysis): string {
  const { summary } = analysis;
  const link = (g: PolicyGrantRef) =>
    g.line
      ? `[#${g.number}](${analysis.basePolicyUrl}#L${g.line})`
      : `#${g.number}`;
  const allowed: Record<GrantStatus, (g: GeneratedGrant) => string> = {
    new: () => '❌ not allowed today',
    broad: g =>
      `⚠️ only by ${g.allowedBy
        .map(r => `${link(r)} ${code(r.text)}`)
        .join(', ')}`,
    match: g => `✅ ${g.allowedBy.map(link).join(', ')}`,
  };
  const declared: Record<DeclaredStatus, (g: HandWrittenGrant) => string> = {
    declared: () => '✅ declared',
    missing: () => '❌ not in the catalog',
    partial: g =>
      `⚠️ partly; not declared: ${g.undeclared.map(code).join(', ')}`,
  };
  const edges = analysis.grants.reduce((n, g) => n + g.edges.length, 0);

  const out: string[] = [
    '## Tailnet policy from the catalog (shadow mode)',
    '',
    `${summary.grants} grants rendered from ${edges} tailnet edges in the catalog, ` +
      `compared with the live policy at ${analysis.basePolicyUrl}. ` +
      'Nothing is applied: this shows what the catalog would produce, next to what is hand-written today.',
    '',
    '| | |',
    '|---|---:|',
    `| ✅ Generated grants a hand-written service grant already allows | ${summary.match} |`,
    `| ⚠️ Generated grants allowed today only by a broader grant | ${summary.broad} |`,
    `| ❌ Generated grants not allowed today (would widen the policy) | ${summary.new} |`,
    `| Hand-written service grants the catalog fully declares | ${summary.declared} of ${analysis.handWritten.length} |`,
    '',
    '### Generated grants',
    '',
    '| Grant | From the catalog | Allowed today by |',
    '|---|---|---|',
    ...analysis.grants.map(
      g =>
        `| ${code(g.id)} | ${g.edges
          .map(e => `${shortRef(e.consumer)} → ${shortRef(e.api)}`)
          .join('<br>')} | ${allowed[g.status](g)} |`,
    ),
    '',
    '### Hand-written service grants',
    '',
    'Grants with tag sources, tag or service destinations and concrete ports: the ones the catalog should produce. ' +
      'Grants for people, zones (`*` ports), wildcards and app capabilities stay hand-written and are not listed.',
    '',
    '| # | Grant | In the catalog |',
    '|---|---|---|',
    ...analysis.handWritten.map(
      g => `| ${link(g)} | ${code(g.text)} | ${declared[g.status](g)} |`,
    ),
  ];

  if (analysis.notCompared.length) {
    out.push(
      '',
      '### Not compared: grants to named hosts',
      '',
      'Catalog destinations are tags or Tailscale Services; these stay hand-written until the host gets one.',
      '',
      ...analysis.notCompared.map(g => `- ${link(g)} ${code(g.text)}`),
    );
  }
  const findings = (title: string, items: Finding[]) => {
    if (!items.length) return;
    out.push('', `### ${title}`, '');
    for (const f of items)
      out.push(`- ${code(shortRef(f.entity))}: ${f.message}`);
  };
  findings('Invalid annotations (ignored)', analysis.invalid);
  findings(
    'Crossing the tailnet without a tailnet identity',
    analysis.missingSource,
  );

  const owners = Object.entries(analysis.tagOwners);
  if (owners.length) {
    out.push(
      '',
      '### Tags without owners in the hand-written policy',
      '',
      ...owners.map(
        ([tag, o]) =>
          `- ${code(tag)}: would be owned by ${o.map(code).join(', ')}`,
      ),
    );
  }
  if (analysis.local.length) {
    out.push(
      '',
      `<details><summary>${analysis.local.length} edges inside a cluster (pod network, not the tailnet; Cilium's, later)</summary>`,
      '',
      ...analysis.local.map(
        e =>
          `- ${shortRef(e.consumer)} → ${shortRef(e.api)} (${
            parseEntityRef(e.cluster).name
          })`,
      ),
      '',
      '</details>',
    );
  }
  return `${out.join('\n')}\n`;
}
