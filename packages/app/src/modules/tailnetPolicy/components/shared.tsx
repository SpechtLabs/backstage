import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Link,
  StatusAborted,
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
import GroupIcon from '@material-ui/icons/People';
import KeyIcon from '@material-ui/icons/VpnKey';
import {
  tailnetPolicyApiRef,
  type App,
  type CapabilityStatus,
  type DeclaredStatus,
  type HandWrittenCapabilityStatus,
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
  group: { borderColor: theme.palette.text.secondary },
  groupIcon: { color: `${theme.palette.text.secondary} !important` },
  capability: {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
  json: {
    fontFamily:
      "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: '0.75rem',
    margin: theme.spacing(0.5, 0, 0),
    padding: theme.spacing(1, 1.5),
    borderRadius: 8,
    backgroundColor: theme.palette.action.hover,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  summary: {
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
    marginTop: theme.spacing(0.5),
  },
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

const SELECTORS = {
  tag: { Icon: LabelIcon, title: 'Tailscale tag' },
  svc: { Icon: ServiceIcon, title: 'Tailscale Service' },
  group: { Icon: GroupIcon, title: 'Tailscale group (people)' },
} as const;

/** A tag:…, svc:… or group:… selector; links to the policy page filtered to it. */
export function Selector({
  value,
  link = true,
}: {
  value: string;
  link?: boolean;
}) {
  const classes = useStyles();
  const policyLink = usePolicyLink();
  const kind =
    (value.split(':')[0] as keyof typeof SELECTORS) in SELECTORS
      ? (value.split(':')[0] as keyof typeof SELECTORS)
      : 'tag';
  const { Icon, title } = SELECTORS[kind];
  const chip = (
    <Chip
      size="small"
      variant="outlined"
      icon={<Icon fontSize="small" className={classes[`${kind}Icon`]} />}
      label={value}
      className={`${classes.chip} ${classes[kind]}`}
      {...(link
        ? { component: RouterLink, to: policyLink(value), clickable: true }
        : {})}
    />
  );
  return <Tooltip title={title}>{chip}</Tooltip>;
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

/** A capability's name, e.g. tailscale.com/cap/tsidp. */
export function Capability({ name }: { name: string }) {
  const classes = useStyles();
  return (
    <Tooltip title="Application capability">
      <Chip
        size="small"
        variant="outlined"
        icon={<KeyIcon fontSize="small" className={classes.tagIcon} />}
        label={name}
        className={`${classes.chip} ${classes.capability}`}
      />
    </Tooltip>
  );
}

/** The capabilities' names, and their values behind a disclosure. */
export function Capabilities({ app, open }: { app: App; open?: boolean }) {
  const classes = useStyles();
  return (
    <div>
      {Object.keys(app).map(name => (
        <Capability key={name} name={name} />
      ))}
      <details open={open}>
        <summary className={classes.summary}>Values</summary>
        <pre className={classes.json}>{JSON.stringify(app, null, 2)}</pre>
      </details>
    </div>
  );
}

export const capabilityStatusText: Record<CapabilityStatus, string> = {
  match: 'Matches a hand-written grant',
  differs: 'Differs from the hand-written grant',
  new: 'Not in the hand-written policy',
};

export function CapabilityStatusBadge({
  status,
}: {
  status: CapabilityStatus;
}) {
  const text = capabilityStatusText[status];
  if (status === 'match') return <StatusOK>{text}</StatusOK>;
  if (status === 'differs') return <StatusWarning>{text}</StatusWarning>;
  return <StatusError>{text}</StatusError>;
}

export const handWrittenCapabilityText: Record<
  HandWrittenCapabilityStatus,
  string
> = {
  declared: 'Declared by a TailscaleGrant',
  differs: 'A TailscaleGrant differs',
  missing: 'No TailscaleGrant',
  'hand-written': 'Stays hand-written',
};

export function HandWrittenCapabilityBadge({
  status,
}: {
  status: HandWrittenCapabilityStatus;
}) {
  const text = handWrittenCapabilityText[status];
  if (status === 'declared') return <StatusOK>{text}</StatusOK>;
  if (status === 'differs') return <StatusWarning>{text}</StatusWarning>;
  if (status === 'missing') return <StatusError>{text}</StatusError>;
  return <StatusAborted>{text}</StatusAborted>;
}
