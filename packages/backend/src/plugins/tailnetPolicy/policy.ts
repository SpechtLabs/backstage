import {
  findNodeAtLocation,
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type ParseError,
} from 'jsonc-parser';
import {
  formatPort,
  isWildcardPort,
  parsePort,
  portCovers,
  type PortRange,
} from './ports';

/** The parts of a Tailscale policy file this plugin reads. */
export interface Grant {
  src: string[];
  dst: string[];
  ip?: string[];
  app?: Record<string, unknown>;
}

export interface Policy {
  grants?: Grant[];
  tagOwners?: Record<string, string[]>;
  tests?: unknown[];
}

export interface ParsedPolicy {
  policy: Policy;
  /** The 1-based line each grant starts on, for links into the file. */
  grantLines: number[];
}

/** policy.hujson: JSON with comments and trailing commas. */
export function parsePolicy(text: string): ParsedPolicy {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: true });
  if (!tree || errors.length) {
    const detail = errors
      .map(e => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(', ');
    throw new Error(`The policy file does not parse: ${detail}`);
  }
  const lineOf = (offset: number) => text.slice(0, offset).split('\n').length;
  const grants = findNodeAtLocation(tree, ['grants']);
  return {
    policy: getNodeValue(tree) as Policy,
    grantLines: (grants?.children ?? []).map(node => lineOf(node.offset)),
  };
}

/** One src -> dst flow on one port range. */
export interface Flow {
  src: string;
  dst: string;
  port: PortRange;
}

export function grantPorts(grant: Grant): PortRange[] {
  return (grant.ip ?? []).flatMap(entry => parsePort(entry) ?? []);
}

export function flowsOf(grant: Grant): Flow[] {
  const ports = grantPorts(grant);
  return grant.src.flatMap(src =>
    grant.dst.flatMap(dst => ports.map(port => ({ src, dst, port }))),
  );
}

function srcMatches(selector: string, src: string) {
  return (
    selector === src ||
    selector === '*' ||
    (selector === 'autogroup:tagged' && src.startsWith('tag:'))
  );
}

export function grantAllows(grant: Grant, flow: Flow): boolean {
  return (
    grant.src.some(s => srcMatches(s, flow.src)) &&
    grant.dst.some(d => d === flow.dst || d === '*') &&
    grantPorts(grant).some(p => portCovers(p, flow.port))
  );
}

/**
 * A service grant: tag sources, tag or Tailscale Service destinations,
 * concrete ports, no app capabilities. These are what the catalog should
 * produce. Everything else (people, zones, wildcards, capabilities) stays
 * hand-written.
 */
export function isServiceGrant(grant: Grant): boolean {
  const ports = grantPorts(grant);
  return (
    !grant.app &&
    grant.src.length > 0 &&
    grant.src.every(s => /^tag:/.test(s)) &&
    grant.dst.length > 0 &&
    grant.dst.every(d => /^(tag|svc):/.test(d)) &&
    ports.length > 0 &&
    ports.length === (grant.ip ?? []).length &&
    ports.every(p => !isWildcardPort(p))
  );
}

export function describeGrant(grant: Grant): string {
  const ip = grant.ip?.length ? grant.ip.join(', ') : '(no ip)';
  return `${grant.src.join(', ')} → ${grant.dst.join(', ')} : ${ip}`;
}

export function describeFlow(flow: Flow): string {
  return `${flow.src} → ${flow.dst} : ${formatPort(flow.port)}`;
}
