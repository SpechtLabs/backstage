import {
  RELATION_API_PROVIDED_BY,
  RELATION_CONSUMES_API,
  RELATION_DEPENDS_ON,
  stringifyEntityRef,
  type Entity,
} from '@backstage/catalog-model';
import { parsePort, isWildcardPort, type PortRange } from './ports';

/**
 * The annotations that put catalog entities on the tailnet:
 *
 *   API        tailnet-dst    where consumers reach it: tag:... or svc:...
 *              tailnet-ports  on which ports: tcp:443, 3493, ...
 *   Component  tailnet-src    the tags its traffic comes from on the
 *                             tailnet (its egress proxy's, its host's)
 *
 * A Component that consumes an API with tailnet-dst, from outside the
 * provider's cluster, is a tailnet edge: src -> dst on those ports.
 */
export const ANNOTATION_SRC = 'specht-labs.de/tailnet-src';
export const ANNOTATION_DST = 'specht-labs.de/tailnet-dst';
export const ANNOTATION_PORTS = 'specht-labs.de/tailnet-ports';

const SRC_SELECTOR = /^tag:[a-z0-9-]+$/;
const DST_SELECTOR = /^(tag|svc):[a-z0-9-]+$/;

export interface TailnetEdge {
  consumer: string;
  api: string;
  providers: string[];
  src: string[];
  dst: string[];
  ports: PortRange[];
  /** The kubernetes clusters of the consumer and the providers. */
  srcClusters: string[];
  dstClusters: string[];
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

export interface TailnetGraph {
  edges: TailnetEdge[];
  /** Consumer and provider share a cluster: pod network, not the tailnet. */
  local: LocalEdge[];
  /** Crosses the tailnet, but the consumer has no tailnet-src. */
  missingSource: Finding[];
  /** Annotations that are malformed or not allowed. */
  invalid: Finding[];
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function targets(entity: Entity, type: string): string[] {
  return (entity.relations ?? [])
    .filter(r => r.type === type)
    .map(r => r.targetRef);
}

/**
 * Reads the tailnet edges out of the catalog. `entities` must hold the
 * Components and APIs (with relations) and the kubernetes-cluster
 * Resources.
 */
export function buildTailnetGraph(entities: Entity[]): TailnetGraph {
  const byRef = new Map(entities.map(e => [stringifyEntityRef(e), e]));
  const clusters = new Set(
    entities
      .filter(
        e => e.kind === 'Resource' && e.spec?.type === 'kubernetes-cluster',
      )
      .map(e => stringifyEntityRef(e)),
  );
  const clustersOf = (ref: string) => {
    const entity = byRef.get(ref);
    return entity
      ? targets(entity, RELATION_DEPENDS_ON).filter(t => clusters.has(t))
      : [];
  };

  const graph: TailnetGraph = {
    edges: [],
    local: [],
    missingSource: [],
    invalid: [],
  };

  // APIs on the tailnet, with their validated destinations and ports.
  const tailnetApis = new Map<string, { dst: string[]; ports: PortRange[] }>();
  for (const api of entities.filter(e => e.kind === 'API')) {
    const ref = stringifyEntityRef(api);
    const annotations = api.metadata.annotations ?? {};
    if (!annotations[ANNOTATION_DST]) continue;
    const dst = list(annotations[ANNOTATION_DST]);
    const portEntries = list(annotations[ANNOTATION_PORTS]);
    const badDst = dst.filter(d => !DST_SELECTOR.test(d));
    const ports = portEntries.map(parsePort);
    const badPorts = portEntries.filter(
      (_, i) => !ports[i] || isWildcardPort(ports[i]!),
    );
    if (badDst.length) {
      graph.invalid.push({
        entity: ref,
        message: `${ANNOTATION_DST}: only tag:… and svc:… allowed, not ${badDst.join(
          ', ',
        )}`,
      });
    }
    if (!portEntries.length || badPorts.length) {
      graph.invalid.push({
        entity: ref,
        message: portEntries.length
          ? `${ANNOTATION_PORTS}: needs concrete ports, not ${badPorts.join(
              ', ',
            )}`
          : `${ANNOTATION_DST} needs ${ANNOTATION_PORTS} next to it`,
      });
    }
    if (badDst.length || !portEntries.length || badPorts.length) continue;
    tailnetApis.set(ref, { dst, ports: ports as PortRange[] });
  }

  for (const component of entities.filter(e => e.kind === 'Component')) {
    const consumer = stringifyEntityRef(component);
    const src = list(component.metadata.annotations?.[ANNOTATION_SRC]);
    const badSrc = src.filter(s => !SRC_SELECTOR.test(s));
    if (badSrc.length) {
      graph.invalid.push({
        entity: consumer,
        message: `${ANNOTATION_SRC}: only tag:… allowed, not ${badSrc.join(
          ', ',
        )}`,
      });
      continue;
    }
    const srcClusters = clustersOf(consumer);

    for (const apiRef of targets(component, RELATION_CONSUMES_API)) {
      const api = tailnetApis.get(apiRef);
      if (!api) continue;
      const providers = byRef.get(apiRef)
        ? targets(byRef.get(apiRef)!, RELATION_API_PROVIDED_BY)
        : [];
      const dstClusters = [...new Set(providers.flatMap(clustersOf))];
      const shared = srcClusters.find(c => dstClusters.includes(c));
      if (shared && providers.every(p => clustersOf(p).includes(shared))) {
        graph.local.push({ consumer, api: apiRef, providers, cluster: shared });
        continue;
      }
      if (!src.length) {
        graph.missingSource.push({
          entity: consumer,
          message: `consumes ${apiRef} across the tailnet, but has no ${ANNOTATION_SRC}`,
        });
        continue;
      }
      graph.edges.push({
        consumer,
        api: apiRef,
        providers,
        src,
        dst: api.dst,
        ports: api.ports,
        srcClusters,
        dstClusters,
      });
    }
  }

  return graph;
}
