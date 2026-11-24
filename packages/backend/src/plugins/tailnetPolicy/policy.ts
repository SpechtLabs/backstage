import JSON5 from 'json5';
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

/** policy.hujson is JSON with comments and trailing commas: JSON5 reads it. */
export function parsePolicy(text: string): Policy {
  return JSON5.parse(text) as Policy;
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
