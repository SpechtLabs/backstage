import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Link,
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { parseEntityRef } from '@backstage/catalog-model';
import { Chip, Tooltip, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import LabelIcon from '@material-ui/icons/LocalOffer';
import ServiceIcon from '@material-ui/icons/Dns';
import {
  tailnetPolicyApiRef,
  type DeclaredStatus,
  type GeneratedGrant,
  type GrantStatus,
  type Overview,
  type PolicyGrantRef,
} from '../api';
import { rootRouteRef } from '../routes';

const useStyles = makeStyles(theme => ({
  mono: {
    fontFamily:
      "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: '0.8rem',
  },
  chip: {
    fontFamily:
      "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: '0.78rem',
    height: 24,
    margin: theme.spacing(0.25, 0.5, 0.25, 0),
    borderRadius: 6,
  },
  tag: { borderColor: theme.palette.primary.main },
  svc: { borderColor: theme.palette.secondary.main },
  tagIcon: { color: `${theme.palette.primary.main} !important` },
  svcIcon: { color: `${theme.palette.secondary.main} !important` },
  port: {
    backgroundColor: theme.palette.action.hover,
    border: 'none',
  },
  arrow: {
    color: theme.palette.text.secondary,
    margin: theme.spacing(0, 0.75),
  },
  flow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chain: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: theme.spacing(0.75),
  },
  muted: { color: theme.palette.text.secondary },
}));

/** The overview from the backend, as React state. */
export function useOverview() {
  const api = useApi(tailnetPolicyApiRef);
  const [state, setState] = useState<{
    overview?: Overview;
    error?: Error;
    loading: boolean;
  }>({ loading: true });
  useEffect(() => {
    let live = true;
    api.getOverview().then(
      overview => live && setState({ overview, loading: false }),
      error => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [api]);
  return state;
}

/** A link to the policy page, filtered to `q`. */
export function usePolicyLink() {
  const root = useRouteRef(rootRouteRef);
  return (q?: string) => {
    const path = root?.() ?? '/tailnet-policy';
    return q ? `${path}?q=${encodeURIComponent(q)}` : path;
  };
}

/** A tag:… or svc:… selector; links to the policy page filtered to it. */
export function Selector({
  value,
  link = true,
}: {
  value: string;
  link?: boolean;
}) {
  const classes = useStyles();
  const policyLink = usePolicyLink();
  const svc = value.startsWith('svc:');
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      icon={
        svc ? (
          <ServiceIcon fontSize="small" className={classes.svcIcon} />
        ) : (
          <LabelIcon fontSize="small" className={classes.tagIcon} />
        )
      }
      label={value}
      className={`${classes.chip} ${svc ? classes.svc : classes.tag}`}
      {...(link
        ? { component: RouterLink, to: policyLink(value), clickable: true }
        : {})}
    />
  );
  return (
    <Tooltip title={svc ? 'Tailscale Service' : 'Tailscale tag'}>
      {chip}
    </Tooltip>
  );
}

export function Port({ value }: { value: string }) {
  const classes = useStyles();
  return (
    <Chip
      size="small"
      variant="outlined"
      label={value}
      className={`${classes.chip} ${classes.port}`}
    />
  );
}

/** src → dst : ports, as chips. */
export function Flow({
  src,
  dst,
  ports,
  link = true,
}: {
  src: string[];
  dst: string[];
  ports: string[];
  link?: boolean;
}) {
  const classes = useStyles();
  return (
    <span className={classes.flow}>
      {src.map(s => (
        <Selector key={s} value={s} link={link} />
      ))}
      <span className={classes.arrow}>→</span>
      {dst.map(d => (
        <Selector key={d} value={d} link={link} />
      ))}
      <span className={classes.arrow}>:</span>
      {ports.map(p => (
        <Port key={p} value={p} />
      ))}
    </span>
  );
}

/** consumer → API (provided by …), as catalog links. */
export function EdgeChain({
  consumer,
  api,
  providers,
}: {
  consumer?: string;
  api: string;
  providers: string[];
}) {
  const classes = useStyles();
  return (
    <span className={classes.chain}>
      {consumer && (
        <>
          <EntityRefLink entityRef={consumer} />
          <span className={classes.muted}>consumes</span>
        </>
      )}
      <EntityRefLink entityRef={api} />
      {providers.length > 0 && (
        <>
          <span className={classes.muted}>from</span>
          {providers.map((p, i) => (
            <span key={p}>
              <EntityRefLink entityRef={p} />
              {i < providers.length - 1 ? ',' : ''}
            </span>
          ))}
        </>
      )}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.mono}>{children}</span>;
}

/** #13, linked to its line in the hand-written policy. */
export function PolicyGrantLink({
  grant,
  basePolicyUrl,
  withText,
}: {
  grant: PolicyGrantRef;
  basePolicyUrl: string;
  withText?: boolean;
}) {
  const href = grant.line ? `${basePolicyUrl}#L${grant.line}` : basePolicyUrl;
  return (
    <Tooltip title={grant.text}>
      <span>
        <Link to={href}>#{grant.number}</Link>
        {withText && (
          <>
            {' '}
            <Mono>{grant.text}</Mono>
          </>
        )}
      </span>
    </Tooltip>
  );
}

export const grantStatusText: Record<GrantStatus, string> = {
  match: 'Matches a hand-written grant',
  broad: 'Allowed only by a broad rule',
  new: 'Would widen the policy',
};

export function GrantStatusBadge({
  grant,
}: {
  grant: Pick<GeneratedGrant, 'status'>;
}) {
  const text = grantStatusText[grant.status];
  if (grant.status === 'match') return <StatusOK>{text}</StatusOK>;
  if (grant.status === 'broad') return <StatusWarning>{text}</StatusWarning>;
  return <StatusError>{text}</StatusError>;
}

export const declaredStatusText: Record<DeclaredStatus, string> = {
  declared: 'Declared in the catalog',
  partial: 'Partly declared',
  missing: 'Not in the catalog',
};

export function DeclaredStatusBadge({ status }: { status: DeclaredStatus }) {
  const text = declaredStatusText[status];
  if (status === 'declared') return <StatusOK>{text}</StatusOK>;
  if (status === 'partial') return <StatusWarning>{text}</StatusWarning>;
  return <StatusError>{text}</StatusError>;
}

/** "component:default/backstage" -> "backstage" */
export function entityName(ref: string) {
  return parseEntityRef(ref).name;
}

export function Caption({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="textSecondary">
      {children}
    </Typography>
  );
}

/** "3 minutes ago" */
export function since(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}
