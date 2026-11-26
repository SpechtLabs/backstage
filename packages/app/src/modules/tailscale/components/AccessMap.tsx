import { useMemo, useState } from 'react';
import type { GrantRule, PrincipalKind } from '../api';
import { kindOf } from './primitives';

const COLOUR: Record<PrincipalKind, string> = {
  group: 'var(--ts-group)',
  user: 'var(--ts-user)',
  tag: 'var(--ts-tag)',
  service: 'var(--ts-service)',
  autogroup: 'var(--ts-neutral)',
  host: 'var(--ts-neutral)',
  address: 'var(--ts-neutral)',
  ipset: 'var(--ts-neutral)',
  any: 'var(--ts-any)',
};

const ROW = 30;
const NODE_HEIGHT = 22;
const TOP = 34;
const WIDTH = 980;
const charWidth = 7.3;

interface Node {
  name: string;
  kind: PrincipalKind;
  y: number;
  width: number;
}

/**
 * Who reaches what: every grant's sources on the left, its destinations on
 * the right. Hovering a selector shows its grants; clicking it filters.
 */
export function AccessMap(props: {
  grants: GrantRule[];
  onSelect?: (name: string) => void;
}) {
  const [hover, setHover] = useState<string>();

  const { sources, destinations, edges, height } = useMemo(() => {
    const sourceNames = new Set<string>();
    const destinationNames = new Set<string>();
    const pairs = new Map<
      string,
      {
        src: string;
        dst: string;
        ports: Set<string>;
        caps: Set<string>;
        catalog: boolean;
      }
    >();
    for (const g of props.grants) {
      for (const s of g.src) {
        sourceNames.add(s.name);
        for (const d of g.dst) {
          destinationNames.add(d.name);
          const key = `${s.name}\u0000${d.name}`;
          const pair = pairs.get(key) ?? {
            src: s.name,
            dst: d.name,
            ports: new Set(),
            caps: new Set(),
            catalog: false,
          };
          g.ip.forEach(p => pair.ports.add(p));
          Object.keys(g.app ?? {}).forEach(c =>
            pair.caps.add(c.split('/cap/')[1] ?? c),
          );
          pair.catalog ||= g.origin === 'catalog';
          pairs.set(key, pair);
        }
      }
    }
    const order = (names: Set<string>) => {
      const rank: Record<string, number> = {
        group: 0,
        user: 1,
        autogroup: 2,
        tag: 3,
        service: 4,
        host: 5,
        address: 6,
        ipset: 7,
        any: 8,
      };
      return [...names].sort(
        (a, b) => rank[kindOf(a)] - rank[kindOf(b)] || a.localeCompare(b),
      );
    };
    const place = (names: string[]): Node[] =>
      names.map((name, i) => ({
        name,
        kind: kindOf(name),
        y: TOP + i * ROW,
        width: Math.max(80, (name === '*' ? 10 : name.length) * charWidth + 34),
      }));
    const left = place(order(sourceNames));
    const right = place(order(destinationNames));
    return {
      sources: left,
      destinations: right,
      edges: [...pairs.values()],
      height: TOP + Math.max(left.length, right.length) * ROW + 4,
    };
  }, [props.grants]);

  if (!edges.length) return null;
  const leftWidth = Math.max(...sources.map(n => n.width));
  const rightX = WIDTH - Math.max(...destinations.map(n => n.width));
  const at = (nodes: Node[], name: string) => nodes.find(n => n.name === name)!;
  const touches = (e: { src: string; dst: string }) =>
    !hover || e.src === hover || e.dst === hover;
  const lit = new Set(
    edges.filter(e => hover && touches(e)).flatMap(e => [e.src, e.dst]),
  );

  const nodeView = (n: Node, side: 'left' | 'right') => {
    const x = side === 'left' ? leftWidth - n.width : rightX;
    const dim = hover && !lit.has(n.name);
    return (
      <g
        key={`${side}:${n.name}`}
        className={`ts-map-node${dim ? ' ts-map-dim' : ''}`}
        transform={`translate(${x}, ${n.y})`}
        onMouseEnter={() => setHover(n.name)}
        onMouseLeave={() => setHover(undefined)}
        onClick={() => props.onSelect?.(n.name)}
        role="button"
        aria-label={n.name}
      >
        <rect
          width={n.width}
          height={NODE_HEIGHT}
          rx={6}
          style={{
            fill: `color-mix(in srgb, ${
              COLOUR[n.kind]
            } 10%, var(--bui-bg-neutral-1))`,
            stroke: `color-mix(in srgb, ${COLOUR[n.kind]} 40%, transparent)`,
          }}
        />
        <circle
          cx={11}
          cy={NODE_HEIGHT / 2}
          r={3.5}
          style={{ fill: COLOUR[n.kind] }}
        />
        <text x={22} y={15} style={{ fill: COLOUR[n.kind] }}>
          {n.name === '*' ? 'everything' : n.name}
        </text>
      </g>
    );
  };

  return (
    <svg
      className="ts-map"
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label="Access map: sources and the destinations their grants reach"
    >
      <text className="ts-map-heading" x={0} y={14}>
        Sources
      </text>
      <text className="ts-map-heading" x={WIDTH} y={14} textAnchor="end">
        Destinations
      </text>
      {edges.map(e => {
        const from = at(sources, e.src);
        const to = at(destinations, e.dst);
        const x1 = leftWidth;
        const y1 = from.y + NODE_HEIGHT / 2;
        const x2 = rightX;
        const y2 = to.y + NODE_HEIGHT / 2;
        const mid = (x1 + x2) / 2;
        const on = hover && touches(e);
        return (
          <path
            key={`${e.src}->${e.dst}`}
            d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
            className={`ts-map-edge${hover && !on ? ' ts-map-dim' : ''}${
              on ? ' ts-map-on' : ''
            }`}
            style={{
              stroke: COLOUR[kindOf(e.src)],
              strokeDasharray: e.caps.size && !e.ports.size ? '4 3' : undefined,
              opacity: hover ? undefined : 0.55,
            }}
          >
            <title>
              {`${e.src} → ${e.dst}: ${[...e.ports].join(', ') || 'no ports'}${
                e.caps.size ? ` · ${[...e.caps].join(', ')}` : ''
              }${e.catalog ? ' · from the catalog' : ''}`}
            </title>
          </path>
        );
      })}
      {sources.map(n => nodeView(n, 'left'))}
      {destinations.map(n => nodeView(n, 'right'))}
    </svg>
  );
}
