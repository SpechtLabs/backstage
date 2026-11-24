import {
  ApiBlueprint,
  configApiRef,
  createApiRef,
  createFrontendModule,
  discoveryApiRef,
  oauthRequestApiRef,
  useApi,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
} from '@backstage/frontend-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import {
  SignInPage,
  type SignInProviderConfig,
} from '@backstage/core-components';
import {
  SignInPageBlueprint,
  type SignInPageProps,
} from '@backstage/plugin-app-react';

/**
 * Sign-in through tsidp, Tailscale's OIDC identity provider. The backend side
 * is the `oidc` provider (auth.providers.oidc in app-config).
 */
export const tsidpAuthApiRef = createApiRef<
  OAuthApi &
    OpenIdConnectApi &
    ProfileInfoApi &
    BackstageIdentityApi &
    SessionApi
>().with({ id: 'auth.tsidp', pluginId: 'app' });

const tsidpAuthApi = ApiBlueprint.make({
  name: 'tsidp',
  params: defineParams =>
    defineParams({
      api: tsidpAuthApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
      },
      factory: ({ configApi, discoveryApi, oauthRequestApi }) =>
        OAuth2.create({
          configApi,
          discoveryApi,
          oauthRequestApi,
          provider: { id: 'oidc', title: 'Tailscale', icon: () => null },
          environment: configApi.getOptionalString('auth.environment'),
          defaultScopes: ['openid', 'profile', 'email'],
        }),
    }),
});

const tsidpProvider: SignInProviderConfig = {
  id: 'oidc',
  title: 'Tailscale',
  message: 'Sign in with your tailnet identity',
  apiRef: tsidpAuthApiRef,
};

function TsidpSignInPage(props: SignInPageProps) {
  const configApi = useApi(configApiRef);
  // Guest sign-in only for local `yarn start`; production has no guest provider.
  const isDevelopment =
    (configApi.getOptionalString('auth.environment') ?? 'development') ===
    'development';

  return isDevelopment ? (
    <SignInPage {...props} providers={['guest', tsidpProvider]} />
  ) : (
    <SignInPage {...props} auto provider={tsidpProvider} />
  );
}

const signInPage = SignInPageBlueprint.make({
  params: {
    loader: async () => TsidpSignInPage,
  },
});

export const authModule = createFrontendModule({
  pluginId: 'app',
  extensions: [tsidpAuthApi, signInPage],
});
