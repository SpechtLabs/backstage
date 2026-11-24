import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Content,
  InfoCard,
  Link,
  Progress,
  ResponseErrorPanel,
  StatusWarning,
} from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { parseEntityRef } from '@backstage/catalog-model';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Grid,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import SearchIcon from '@material-ui/icons/Search';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import type {
  EdgeView,
  GeneratedGrant,
  HandWrittenGrant,
  LocalEdge,
  Overview,
} from '../api';
import { FlowGraph } from './FlowGraph';
import {
  Caption,
  DeclaredStatusBadge,
  EdgeChain,
  Flow,
  GrantStatusBadge,
  Mono,
  PolicyGrantLink,
  Selector,
  since,
  useOverview,
} from './shared';

const useStyles = makeStyles(theme => ({
  intro: { maxWidth: 820, marginBottom: theme.spacing(3) },
  stat: {
    height: '100%',
    padding: theme.spacing(2, 2.5),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    backgroundColor: theme.palette.background.paper,
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
  },
  ok: { color: theme.palette.status.ok },
  warning: { color: theme.palette.status.warning },
  error: { color: theme.palette.status.error },
  filter: { minWidth: 360, margin: theme.spacing(1, 0, 3) },
  graph: { minHeight: 320 },
  cellTop: { verticalAlign: 'top' },
  edgeLine: { padding: theme.spacing(0.25, 0) },
  nowrap: { whiteSpace: 'nowrap' },
  section: { marginTop: theme.spacing(3) },
}));

function matches(q: string, ...values: string[]) {
  const needle = q.trim().toLowerCase();
  return !needle || values.some(v => v.toLowerCase().includes(needle));
}

const edgeValues = (e: EdgeView | LocalEdge) => [
  e.consumer,
  e.api,
  ...e.providers,
];

function Stat({
  value,
  label,
  tone,
}: {
  value: ReactNode;
  label: string;
  tone?: 'ok' | 'warning' | 'error';
}) {
  const classes = useStyles();
  return (
    <div className={classes.stat}>
      <div className={`${classes.statValue} ${tone ? classes[tone] : ''}`}>
        {value}
      </div>
      <Caption>{label}</Caption>
    </div>
  );
}

function GeneratedTable({
  grants,
  overview,
}: {
  grants: GeneratedGrant[];
  overview: Overview;
}) {
  const classes = useStyles();
  if (!grants.length) {
    return <Caption>No generated grant matches the filter.</Caption>;
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Grant</TableCell>
          <TableCell>From the catalog</TableCell>
          <TableCell>Today</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {grants.map(grant => (
          <TableRow key={grant.id}>
            <TableCell className={classes.cellTop}>
              <Flow src={grant.src} dst={grant.dst} ports={grant.ip} />
            </TableCell>
            <TableCell className={classes.cellTop}>
              {grant.edges.map(e => (
                <div
                  key={`${e.consumer}|${e.api}`}
                  className={classes.edgeLine}
                >
                  <EdgeChain {...e} />
                </div>
              ))}
            </TableCell>
            <TableCell className={`${classes.cellTop} ${classes.nowrap}`}>
              <GrantStatusBadge grant={grant} />
              <div>
                {grant.allowedBy.map(ref => (
                  <span key={ref.number}>
                    <PolicyGrantLink
                      grant={ref}
                      basePolicyUrl={overview.basePolicyUrl}
                      withText={grant.status === 'broad'}
                    />{' '}
                  </span>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HandWrittenTable({
  grants,
  overview,
}: {
  grants: HandWrittenGrant[];
  overview: Overview;
}) {
  const classes = useStyles();
  if (!grants.length) {
    return <Caption>No hand-written service grant matches the filter.</Caption>;
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>#</TableCell>
          <TableCell>Grant</TableCell>
          <TableCell>In the catalog</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {grants.map(grant => (
          <TableRow key={grant.number}>
            <TableCell className={classes.cellTop}>
              <PolicyGrantLink
                grant={grant}
                basePolicyUrl={overview.basePolicyUrl}
              />
            </TableCell>
            <TableCell className={classes.cellTop}>
              <Flow src={grant.src} dst={grant.dst} ports={grant.ip} />
            </TableCell>
            <TableCell className={classes.cellTop}>
              <DeclaredStatusBadge status={grant.status} />
              {grant.undeclared.map(u => (
                <div key={u}>
                  <Caption>
                    Not declared: <Mono>{u}</Mono>
                  </Caption>
                </div>
              ))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Attention({ overview, q }: { overview: Overview; q: string }) {
  const invalid = overview.invalid.filter(f => matches(q, f.entity));
  const missing = overview.missingSource.filter(f => matches(q, f.entity));
  const hosts = overview.notCompared.filter(g => matches(q, g.text));
  const owners = Object.entries(overview.tagOwners).filter(([tag]) =>
    matches(q, tag),
  );
  if (!invalid.length && !missing.length && !hosts.length && !owners.length) {
    return null;
  }
  const finding = (f: { entity: string; message: string }) => (
    <li key={`${f.entity}|${f.message}`}>
      <EntityRefLink entityRef={f.entity} />: {f.message}
    </li>
  );
  return (
    <InfoCard title="Needs a look">
      {invalid.length > 0 && (
        <>
          <StatusWarning>Invalid annotations, ignored</StatusWarning>
          <ul>{invalid.map(finding)}</ul>
        </>
      )}
      {missing.length > 0 && (
        <>
          <StatusWarning>
            Crossing the tailnet without a tailnet identity
          </StatusWarning>
          <ul>{missing.map(finding)}</ul>
        </>
      )}
      {owners.length > 0 && (
        <>
          <StatusWarning>
            Tags without owners in the hand-written policy
          </StatusWarning>
          <ul>
            {owners.map(([tag, o]) => (
              <li key={tag}>
                <Selector value={tag} /> would be owned by{' '}
                <Mono>{o.join(', ')}</Mono>
              </li>
            ))}
          </ul>
        </>
      )}
      {hosts.length > 0 && (
        <>
          <Caption>
            Not compared: hand-written grants to named hosts. Catalog
            destinations are tags or Tailscale Services.
          </Caption>
          <ul>
            {hosts.map(g => (
              <li key={g.number}>
                <PolicyGrantLink
                  grant={g}
                  basePolicyUrl={overview.basePolicyUrl}
                  withText
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </InfoCard>
  );
}

function LocalEdges({ edges }: { edges: LocalEdge[] }) {
  const byCluster = new Map<string, LocalEdge[]>();
  for (const e of edges) {
    byCluster.set(e.cluster, [...(byCluster.get(e.cluster) ?? []), e]);
  }
  return (
    <Accordion variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box>
          <Typography variant="subtitle1">
            {edges.length} edges inside a cluster
          </Typography>
          <Caption>
            Consumer and provider share a cluster, so the traffic stays on the
            pod network: no tailnet grant. These are what Cilium policies will
            be rendered from later.
          </Caption>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box width="100%">
          {[...byCluster.entries()].map(([cluster, list]) => (
            <Box key={cluster} mb={2}>
              <Typography variant="overline">
                <EntityRefLink entityRef={cluster}>
                  {parseEntityRef(cluster).name}
                </EntityRefLink>
              </Typography>
              {list.map(e => (
                <div key={`${e.consumer}|${e.api}`}>
                  <EdgeChain {...e} />
                </div>
              ))}
            </Box>
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * The whole tailnet policy the catalog renders to, next to the hand-written
 * one. ?q= filters everything to a tag, service or entity.
 */
export function TailnetPolicyPage() {
  const classes = useStyles();
  const { overview, error, loading } = useOverview();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const setQuery = (value: string) =>
    setParams(value ? { q: value } : {}, { replace: true });

  const filtered = useMemo(() => {
    if (!overview) return undefined;
    return {
      grants: overview.grants.filter(g =>
        matches(q, ...g.src, ...g.dst, ...g.ip, ...g.edges.flatMap(edgeValues)),
      ),
      handWritten: overview.handWritten.filter(g =>
        matches(q, ...g.src, ...g.dst, ...g.ip, g.text),
      ),
      local: overview.local.filter(e => matches(q, ...edgeValues(e))),
    };
  }, [overview, q]);

  if (loading) return <Progress />;
  if (error || !overview || !filtered) {
    return (
      <Content>
        <ResponseErrorPanel error={error ?? new Error('No tailnet policy')} />
      </Content>
    );
  }
  const { summary, publish } = overview;
  const pullRequests = publish
    ? publish.last?.url ??
      `https://github.com/${publish.repo}/pulls?q=head%3A${encodeURIComponent(
        publish.branch,
      )}`
    : undefined;

  return (
    <Content>
      <Box className={classes.intro}>
        <Typography variant="body1" paragraph>
          Tailscale grants rendered from the software catalog. A Component with{' '}
          <Mono>specht-labs.de/tailnet-src</Mono> that consumes an API with{' '}
          <Mono>specht-labs.de/tailnet-dst</Mono> from outside the provider's
          cluster gets a grant from its tags to the API's, on the API's ports.{' '}
          <b>Shadow mode:</b> compared with the{' '}
          <Link to={overview.basePolicyUrl}>hand-written policy</Link>, nothing
          is applied.
        </Typography>
        <Caption>
          Rendered {since(overview.renderedAt)}
          {pullRequests && (
            <>
              {' · '}
              <Link to={pullRequests}>Pull request in {publish!.repo}</Link>
            </>
          )}
        </Caption>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={6} md>
          <Stat value={summary.grants} label="Grants from the catalog" />
        </Grid>
        <Grid item xs={6} md>
          <Stat
            value={summary.match}
            tone="ok"
            label="Match a hand-written grant"
          />
        </Grid>
        <Grid item xs={6} md>
          <Stat
            value={summary.broad}
            tone={summary.broad ? 'warning' : undefined}
            label="Allowed only by a broad rule"
          />
        </Grid>
        <Grid item xs={6} md>
          <Stat
            value={summary.new}
            tone={summary.new ? 'error' : 'ok'}
            label="Would widen the policy"
          />
        </Grid>
        <Grid item xs={12} md>
          <Stat
            value={`${summary.declared}/${overview.handWritten.length}`}
            label="Hand-written service grants declared"
          />
        </Grid>
      </Grid>

      <Box className={classes.section}>
        <TextField
          className={classes.filter}
          variant="outlined"
          size="small"
          placeholder="Filter by tag, service or entity"
          value={q}
          onChange={e => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InfoCard
            title="Flows"
            subheader="Tags and Tailscale Services, and the ports between them. Click one to filter."
          >
            <div className={classes.graph}>
              <FlowGraph
                grants={filtered.grants}
                selected={q}
                onSelect={setQuery}
              />
            </div>
          </InfoCard>
        </Grid>
        <Grid item xs={12}>
          <InfoCard
            title="Generated grants"
            subheader="One per tailnet source, destination and ports, with the catalog edges behind it."
          >
            <GeneratedTable grants={filtered.grants} overview={overview} />
          </InfoCard>
        </Grid>
        <Grid item xs={12}>
          <InfoCard
            title="Hand-written service grants"
            subheader="Tag sources, tag or service destinations, concrete ports: the ones the catalog should produce. People, zones, wildcards and app capabilities stay hand-written."
          >
            <HandWrittenTable
              grants={filtered.handWritten}
              overview={overview}
            />
          </InfoCard>
        </Grid>
        <Grid item xs={12}>
          <Attention overview={overview} q={q} />
        </Grid>
        {filtered.local.length > 0 && (
          <Grid item xs={12}>
            <LocalEdges edges={filtered.local} />
          </Grid>
        )}
      </Grid>
    </Content>
  );
}
