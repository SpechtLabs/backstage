import type { Entity } from '@backstage/catalog-model';
import { parsePolicy } from './policy';
import {
  TailscaleGrantProcessor,
  validateTailscaleGrantSpec,
  type TailscaleGrantEntity,
} from './kind';
import { compareCapabilities } from './capabilities';
import { CATALOG_FIELDS } from './plugin';
import { isTailscaleGrant } from './kind';

const grant = (
  name: string,
  spec: Partial<TailscaleGrantEntity['spec']> = {},
): TailscaleGrantEntity => ({
  apiVersion: 'specht-labs.de/v1alpha1',
  kind: 'TailscaleGrant',
  metadata: { name, namespace: 'default' },
  spec: {
    owner: 'group:spechtlabs',
    targets: ['component:tsidp', 'component:argocd'],
    src: ['group:sre'],
    dst: ['tag:tsidp'],
    ip: ['*'],
    app: {
      'tailscale.com/cap/tsidp': [
        { users: ['group:sre'], resources: ['argocd'] },
      ],
    },
    ...spec,
  },
});

describe('validateTailscaleGrantSpec', () => {
  it('accepts a capability grant', () => {
    expect(validateTailscaleGrantSpec(grant('ok').spec)).toEqual([]);
  });

  it('refuses wildcards, autogroups and grants without capabilities', () => {
    const errors = validateTailscaleGrantSpec(
      grant('bad', {
        src: ['autogroup:member', '*'],
        dst: ['*'],
        ip: ['nope'],
        app: {},
        targets: [],
      }).spec,
    );
    expect(errors).toEqual([
      'spec.targets needs at least one entity reference',
      'spec.src: only group:… and tag:…, not autogroup:member, *',
      'spec.dst: only tag:… and svc:…, not *',
      'spec.ip: not ports: nope',
      'spec.app needs at least one capability: a grant without one is a tailnet edge (annotations), not a TailscaleGrant',
    ]);
  });

  it('refuses malformed capability names and values', () => {
    expect(
      validateTailscaleGrantSpec(
        grant('bad', { app: { 'not a cap': [], 'x.de/cap/y': ['str'] as any } })
          .spec,
      ),
    ).toEqual([
      'spec.app: not a cap is not a capability name (<domain>/cap/<name>)',
      'spec.app.not a cap must be a list of objects',
      'spec.app.x.de/cap/y must be a list of objects',
    ]);
  });
});

describe('TailscaleGrantProcessor', () => {
  const processor = new TailscaleGrantProcessor();

  it('validates only its own kind', async () => {
    const component: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'x' },
    };
    await expect(processor.validateEntityKind(component)).resolves.toBe(false);
    await expect(processor.validateEntityKind(grant('ok'))).resolves.toBe(true);
    await expect(
      processor.validateEntityKind(grant('bad', { src: ['*'] })),
    ).rejects.toThrow('Invalid TailscaleGrant: spec.src');
  });

  it('relates the grant to its owner and targets, both ways', async () => {
    const emitted: any[] = [];
    await processor.postProcessEntity(
      grant('sre-argocd-login', { system: 'homelab' }),
      { type: 'url', target: 'https://example.com/grants.yaml' },
      r => emitted.push(r),
    );
    const relations = emitted.map(
      r =>
        `${r.relation.source.kind}:${r.relation.source.name} ${r.relation.type} ${r.relation.target.kind}:${r.relation.target.name}`,
    );
    expect(relations).toEqual([
      'TailscaleGrant:sre-argocd-login ownedBy group:spechtlabs',
      'group:spechtlabs ownerOf TailscaleGrant:sre-argocd-login',
      'TailscaleGrant:sre-argocd-login partOf System:homelab',
      'System:homelab hasPart TailscaleGrant:sre-argocd-login',
      'TailscaleGrant:sre-argocd-login grantsAccessTo component:tsidp',
      'component:tsidp accessGrantedBy TailscaleGrant:sre-argocd-login',
      'TailscaleGrant:sre-argocd-login grantsAccessTo component:argocd',
      'component:argocd accessGrantedBy TailscaleGrant:sre-argocd-login',
    ]);
  });
});

describe('compareCapabilities', () => {
  const parsed = parsePolicy(`{
    "grants": [
      {"src": ["group:sre"], "dst": ["tag:tsidp"], "ip": ["*"],
       "app": {"tailscale.com/cap/tsidp": [{"resources": ["argocd"], "users": ["group:sre"]}]}},
      {"src": ["group:admins"], "dst": ["tag:tka"], "ip": ["*"],
       "app": {"specht-labs.de/cap/tka": [{"role": "cluster-admin", "period": "1h"}]}},
      {"src": ["group:admins"], "dst": ["tag:smarthome"], "ip": ["5252"],
       "app": {"tailscale.com/cap/webui": [{"canEdit": ["*"]}]}},
      {"src": ["autogroup:member"], "dst": ["autogroup:self"], "ip": ["5252"],
       "app": {"tailscale.com/cap/webui": [{"canEdit": ["account"]}]}},
      {"src": ["tag:homelab"], "dst": ["tag:homelab"], "ip": ["*"]},
    ],
  }`);
  const refOf = (g: any) => ({
    number: parsed.policy.grants!.indexOf(g) + 1,
    text: 'grant',
  });

  const result = compareCapabilities(
    [
      grant('sre-argocd-login'), // same, keys in another order: a match
      grant('tka-admins', {
        src: ['group:admins'],
        dst: ['tag:tka'],
        ip: ['tcp:443'],
        app: {
          'specht-labs.de/cap/tka': [{ role: 'cluster-admin', period: '8h' }],
        },
      }),
      grant('new-one', { src: ['group:guests'] }),
      grant('broken', { src: ['*'] }),
    ],
    parsed,
    refOf,
  );

  it('matches, diffs and finds new grants', () => {
    expect(
      result.catalog.map(g => [
        g.entity,
        g.status,
        g.counterpart?.number,
        g.differences,
      ]),
    ).toEqual([
      ['tailscalegrant:default/new-one', 'new', undefined, []],
      ['tailscalegrant:default/sre-argocd-login', 'match', 1, []],
      [
        'tailscalegrant:default/tka-admins',
        'differs',
        2,
        [
          'ports: hand-written *, catalog tcp:443',
          'specht-labs.de/cap/tka: different values',
        ],
      ],
    ]);
    expect(result.invalid.map(f => f.entity)).toEqual([
      'tailscalegrant:default/broken',
    ]);
  });

  it('says which hand-written capability grants are declared', () => {
    expect(
      result.handWritten.map(h => [h.number, h.status, h.declaredBy]),
    ).toEqual([
      [1, 'declared', 'tailscalegrant:default/sre-argocd-login'],
      [2, 'differs', 'tailscalegrant:default/tka-admins'],
      [3, 'missing', undefined],
      [4, 'hand-written', undefined],
    ]);
    expect(result.summary).toEqual({
      grants: 3,
      match: 1,
      differs: 1,
      new: 1,
      declared: 1,
      missing: 1,
      handWritten: 1,
    });
  });
});

describe('CATALOG_FIELDS', () => {
  it('fetches enough of a TailscaleGrant to recognise and read it', () => {
    // What the catalog returns for a query with these fields.
    const pick = (entity: any) => {
      const out: any = {};
      for (const field of CATALOG_FIELDS) {
        const path = field.split('.');
        let from = entity;
        let to = out;
        path.forEach((key, i) => {
          if (from?.[key] === undefined) return;
          if (i === path.length - 1) to[key] = from[key];
          else {
            to[key] = to[key] ?? {};
            to = to[key];
            from = from[key];
          }
        });
      }
      return out;
    };
    const fetched = pick(grant('tka-admins'));
    expect(isTailscaleGrant(fetched)).toBe(true);
    expect(validateTailscaleGrantSpec(fetched.spec)).toEqual([]);
  });
});
