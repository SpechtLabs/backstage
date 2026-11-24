import type { ReactNode } from 'react';
import { InfoCard, StatusWarning } from '@backstage/core-components';
import { useEntity, EntityRefLink } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Box, Divider, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import type { EdgeView, GeneratedGrant, Overview } from '../api';
import {
  Caption,
  EdgeChain,
  Flow,
  GrantStatusBadge,
  PolicyGrantLink,
  entityName,
  usePolicyLink,
  useOverview,
} from './shared';

const useStyles = makeStyles(theme => ({
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.spacing(0.5, 2),
    padding: theme.spacing(1.25, 0),
    '& + &': { borderTop: `1px solid ${theme.palette.divider}` },
  },
  status: { justifySelf: 'end', whiteSpace: 'nowrap', textAlign: 'right' },
  section: { marginTop: theme.spacing(1) },
  heading: { marginTop: theme.spacing(1.5) },
}));

interface Involvement {
  /** Edges where this entity is the consumer: what it reaches. */
  reaches: Array<{ edge: EdgeView; grant: GeneratedGrant }>;
  /** Edges where it is the API or a provider: who reaches it. */
  reachedBy: Array<{ edge: EdgeView; grant: GeneratedGrant }>;
  local: Overview['local'];
  findings: Overview['invalid'];
}

function involvement(overview: Overview, ref: string): Involvement {
  const pairs = overview.grants.flatMap(grant =>
    grant.edges.map(edge => ({ edge, grant })),
  );
  return {
    reaches: pairs.filter(p => p.edge.consumer === ref),
    reachedBy: pairs.filter(
      p => p.edge.api === ref || p.edge.providers.includes(ref),
    ),
    local: overview.local.filter(
      e => e.consumer === ref || e.api === ref || e.providers.includes(ref),
    ),
    findings: [...overview.invalid, ...overview.missingSource].filter(
      f => f.entity === ref,
    ),
  };
}

function Row({
  children,
  grant,
  overview,
}: {
  children: ReactNode;
  grant: GeneratedGrant;
  overview: Overview;
}) {
  const classes = useStyles();
  return (
    <div className={classes.row}>
      <div>{children}</div>
      <div className={classes.status}>
        <GrantStatusBadge grant={grant} />
        <div>
          {grant.allowedBy.map(ref => (
            <span key={ref.number}>
              <PolicyGrantLink
                grant={ref}
                basePolicyUrl={overview.basePolicyUrl}
              />{' '}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * On a Component's or API's page: the tailnet grants it causes in the
 * policy rendered from the catalog. Renders nothing for entities that
 * aren't on the tailnet, so the overview page stays as it was for them.
 */
export function EntityTailnetPolicyCard() {
  const classes = useStyles();
  const { entity } = useEntity();
  const { overview } = useOverview();
  const policyLink = usePolicyLink();
  if (!overview) return null;

  const ref = stringifyEntityRef(entity);
  const found = involvement(overview, ref);
  const isApi = entity.kind.toLowerCase() === 'api';
  if (
    !found.reaches.length &&
    !found.reachedBy.length &&
    !found.findings.length
  ) {
    return null;
  }

  return (
    <InfoCard
      title="Tailnet policy"
      subheader="The Tailscale grants this entity causes in the policy rendered from the catalog (shadow mode)"
      deepLink={{
        title: 'Whole tailnet policy',
        link: policyLink(entityName(ref)),
      }}
    >
      {found.findings.map(f => (
        <Box key={f.message} mb={1}>
          <StatusWarning>{f.message}</StatusWarning>
        </Box>
      ))}

      {found.reaches.length > 0 && (
        <Box className={classes.section}>
          <Typography variant="overline">Reaches over the tailnet</Typography>
          {found.reaches.map(({ edge, grant }) => (
            <Row key={edge.api} grant={grant} overview={overview}>
              <EdgeChain api={edge.api} providers={edge.providers} />
              <Flow src={edge.src} dst={edge.dst} ports={edge.ports} />
            </Row>
          ))}
        </Box>
      )}

      {found.reachedBy.length > 0 && (
        <Box className={classes.section}>
          <Typography variant="overline">
            {isApi
              ? 'Consumed over the tailnet by'
              : 'Reached over the tailnet by'}
          </Typography>
          {found.reachedBy.map(({ edge, grant }) => (
            <Row
              key={`${edge.consumer}|${edge.api}`}
              grant={grant}
              overview={overview}
            >
              <EntityRefLink entityRef={edge.consumer} />
              {!isApi && (
                <Caption>
                  through <EntityRefLink entityRef={edge.api} />
                </Caption>
              )}
              <Flow src={edge.src} dst={edge.dst} ports={edge.ports} />
            </Row>
          ))}
        </Box>
      )}

      {found.local.length > 0 && (
        <>
          <Divider className={classes.heading} />
          <Box mt={1.5}>
            <Caption>
              Also {found.local.length} edge
              {found.local.length === 1 ? '' : 's'} inside its cluster, on the
              pod network (no tailnet grant):{' '}
              {found.local.map((e, i) => (
                <span key={`${e.consumer}|${e.api}`}>
                  <EntityRefLink
                    entityRef={e.consumer === ref ? e.api : e.consumer}
                  />
                  {i < found.local.length - 1 ? ', ' : ''}
                </span>
              ))}
            </Caption>
          </Box>
        </>
      )}
    </InfoCard>
  );
}
