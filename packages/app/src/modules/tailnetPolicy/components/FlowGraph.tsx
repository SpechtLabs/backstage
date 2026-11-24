import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DependencyGraph,
  DependencyGraphTypes,
} from '@backstage/core-components';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import type { GeneratedGrant, GrantStatus } from '../api';
import { entityName } from './shared';

type NodeData = {
  kind: 'tag' | 'svc';
  /** The services behind the selector, for its second line. */
  services: string[];
  selected: boolean;
};
type EdgeData = { status: GrantStatus };

const useStyles = makeStyles(theme => ({
  node: { cursor: 'pointer' },
  box: {
    fill: theme.palette.background.paper,
    stroke: theme.palette.divider,
    strokeWidth: 1,
  },
  selected: {
    stroke: theme.palette.primary.main,
    strokeWidth: 2,
  },
  title: {
    fill: theme.palette.text.primary,
    fontFamily:
      "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: 13,
    fontWeight: 600,
  },
  subtitle: {
    fill: theme.palette.text.secondary,
    fontSize: 11,
  },
  label: {
    fontFamily:
      "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: 11,
    fontWeight: 600,
  },
  labelBox: { fill: theme.palette.background.paper },
}));

function summarise(names: string[]) {
  const unique = [...new Set(names)].sort();
  if (unique.length <= 2) return unique.join(', ');
  return `${unique.slice(0, 2).join(', ')} +${unique.length - 2}`;
}

function SelectorNode({
  node,
  onSelect,
}: DependencyGraphTypes.RenderNodeProps<NodeData> & {
  onSelect: (id: string) => void;
}) {
  const classes = useStyles();
  const theme = useTheme();
  const textRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measured = Math.round(textRef.current?.getBBox().width ?? 0);
    if (measured !== width) setWidth(measured);
  }, [width, node.id]);
  const color =
    node.kind === 'svc'
      ? theme.palette.secondary.main
      : theme.palette.primary.main;
  const padded = width + 36;
  return (
    <g className={classes.node} onClick={() => onSelect(node.id)}>
      <title>{`${node.id}: ${node.services.join(', ')}`}</title>
      <rect
        className={`${classes.box} ${node.selected ? classes.selected : ''}`}
        width={padded}
        height={46}
        rx={10}
      />
      <rect width={4} height={30} x={8} y={8} rx={2} fill={color} />
      <g ref={textRef} transform="translate(22, 0)">
        <text className={classes.title} y={20}>
          {node.id}
        </text>
        <text className={classes.subtitle} y={36}>
          {summarise(node.services)}
        </text>
      </g>
    </g>
  );
}

function PortsLabel({ edge }: DependencyGraphTypes.RenderLabelProps<EdgeData>) {
  const classes = useStyles();
  const theme = useTheme();
  const color = {
    match: theme.palette.status.ok,
    broad: theme.palette.status.warning,
    new: theme.palette.status.error,
  }[edge.status];
  return (
    <g>
      <text
        className={classes.label}
        textAnchor="middle"
        fill={color}
        stroke={theme.palette.background.paper}
        strokeWidth={4}
        paintOrder="stroke"
      >
        {edge.label}
      </text>
    </g>
  );
}

/**
 * The generated grants as a graph of tags and Tailscale Services: who may
 * reach whom, on which ports, coloured by how the hand-written policy
 * compares. Clicking a node filters the page to it.
 */
export function FlowGraph({
  grants,
  selected,
  onSelect,
}: {
  grants: GeneratedGrant[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const byId = new Map<
      string,
      DependencyGraphTypes.DependencyNode<NodeData>
    >();
    const add = (id: string, services: string[]) => {
      const node = byId.get(id) ?? {
        id,
        kind: id.startsWith('svc:') ? 'svc' : 'tag',
        services: [],
        selected: id === selected,
      };
      node.services.push(...services);
      byId.set(id, node);
    };
    const flows = new Map<
      string,
      DependencyGraphTypes.DependencyEdge<EdgeData>
    >();
    for (const grant of grants) {
      const consumers = grant.edges.map(e => entityName(e.consumer));
      const apis = grant.edges.map(e => entityName(e.api));
      grant.src.forEach(s => add(s, consumers));
      grant.dst.forEach(d => add(d, apis));
      for (const from of grant.src) {
        for (const to of grant.dst) {
          const key = `${from}|${to}`;
          const existing = flows.get(key);
          const ports = [...(existing?.label?.split(', ') ?? []), ...grant.ip];
          // The worst status wins when two grants share a pair.
          const rank = { match: 0, broad: 1, new: 2 };
          const status =
            existing && rank[existing.status] > rank[grant.status]
              ? existing.status
              : grant.status;
          flows.set(key, {
            from,
            to,
            label: [...new Set(ports)].join(', '),
            status,
          });
        }
      }
    }
    return { nodes: [...byId.values()], edges: [...flows.values()] };
  }, [grants, selected]);

  if (!nodes.length) return null;
  return (
    <DependencyGraph<NodeData, EdgeData>
      nodes={nodes}
      edges={edges}
      direction={DependencyGraphTypes.Direction.LEFT_RIGHT}
      renderNode={props => <SelectorNode {...props} onSelect={onSelect} />}
      renderLabel={props => <PortsLabel {...props} />}
      labelPosition={DependencyGraphTypes.LabelPosition.RIGHT}
      labelOffset={4}
      rankMargin={140}
      nodeMargin={24}
      paddingX={16}
      paddingY={16}
      zoom="enable-on-click"
      fit="contain"
      curve="curveMonotoneX"
      showArrowHeads
    />
  );
}
