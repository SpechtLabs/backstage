import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import {
  oidcAuthenticator,
  oidcSignInResolvers,
} from '@backstage/plugin-auth-backend-module-oidc-provider';

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
            authenticator: oidcAuthenticator,
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
