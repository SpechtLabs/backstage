import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
  type OAuthAuthenticator,
} from '@backstage/plugin-auth-node';
import {
  oidcAuthenticator,
  oidcSignInResolvers,
} from '@backstage/plugin-auth-backend-module-oidc-provider';

type OidcContext = typeof oidcAuthenticator extends OAuthAuthenticator<
  infer C,
  any
>
  ? C
  : never;

/**
 * The stock authenticator, but it retries discovery. Upstream fetches the
 * IdP's metadata once, when the backend starts, and keeps the promise: if
 * tsidp is unreachable at that moment, every sign-in fails with that error
 * (ECONNREFUSED) until the next restart. Here a failed discovery is redone
 * on the next sign-in.
 */
export const retryingOidcAuthenticator: typeof oidcAuthenticator = {
  ...oidcAuthenticator,
  initialize(options) {
    let failed = false;
    const start = () => {
      const context = oidcAuthenticator.initialize(options);
      failed = false;
      context.promise.catch(() => {
        failed = true;
      });
      return context;
    };
    let inner = start();
    const context: OidcContext = {
      get initializedPrompt() {
        return inner.initializedPrompt;
      },
      get searchParams() {
        return inner.searchParams;
      },
      get promise() {
        if (failed) inner = start();
        return inner.promise;
      },
    };
    return context;
  },
};

/**
 * The `oidc` sign-in provider, for tsidp (Tailscale's OIDC IdP). It replaces
 * `@backstage/plugin-auth-backend-module-oidc-provider`'s module and differs
 * from it in one way: the profile's email.
 *
 * The stock profile transform keeps `email` only when the IdP also sends
 * `email_verified: true`. tsidp sends no `email_verified` (it isn't in its
 * claims_supported), so the email was dropped and sign-in failed with "user
 * profile does not contain an email". tsidp's `email` is the user's tailnet
 * identity and tsidp is the authority for it, so it's taken as is.
 *
 * It also retries a failed discovery (see retryingOidcAuthenticator).
 */
export const authModuleTsidpProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'tsidp-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'oidc',
          factory: createOAuthProviderFactory({
            authenticator: retryingOidcAuthenticator,
            profileTransform: async ({ fullProfile }) => {
              const { userinfo } = fullProfile;
              return {
                profile: {
                  email: userinfo.email,
                  displayName:
                    userinfo.name ??
                    (userinfo.username as string | undefined) ??
                    userinfo.email,
                  picture: userinfo.picture,
                },
              };
            },
            signInResolverFactories: { ...oidcSignInResolvers },
          }),
        });
      },
    });
  },
});
