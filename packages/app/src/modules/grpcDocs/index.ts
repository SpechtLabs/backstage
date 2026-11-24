import {
  ApiBlueprint,
  createFrontendModule,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/frontend-plugin-api';
import {
  apiDocsConfigRef,
  defaultDefinitionWidgets,
} from '@backstage/plugin-api-docs';
import {
  grpcApiWidget,
  GrpcDocsClient,
  grpcDocsApiRef,
} from '@samuel.fabel/plugin-grpc-docs';

/**
 * gRPC docs (@samuel.fabel/plugin-grpc-docs): the method tree, messages and
 * proto comments of API entities with `spec.type: grpc`, in their Definition
 * tab. The package is classic-frontend only, so it is wired up here.
 *
 * Docs only: its backend (the "Try it out" proxy) is deliberately not
 * installed. In 0.1.0 it serves POST /call/unary unauthenticated and does not
 * enforce grpcDocs.targetAccess yet (on its roadmap), so it would let anyone
 * reaching Backstage call any gRPC target the pod can reach.
 */
export const grpcDocsPlugin = createFrontendPlugin({
  pluginId: 'grpc-docs',
  extensions: [
    ApiBlueprint.make({
      name: 'client',
      params: defineParams =>
        defineParams({
          api: grpcDocsApiRef,
          deps: {
            discoveryApi: discoveryApiRef,
            fetchApi: fetchApiRef,
            identityApi: identityApiRef,
          },
          factory: ({ discoveryApi, fetchApi, identityApi }) =>
            new GrpcDocsClient({ discoveryApi, fetchApi, identityApi }),
        }),
    }),
  ],
});

/** api-docs' definition widgets, plus gRPC. Replaces api:api-docs/config. */
export const apiDocsGrpcModule = createFrontendModule({
  pluginId: 'api-docs',
  extensions: [
    ApiBlueprint.make({
      name: 'config',
      params: defineParams =>
        defineParams({
          api: apiDocsConfigRef,
          deps: {},
          factory: () => {
            const widgets = [...defaultDefinitionWidgets(), grpcApiWidget];
            return {
              getApiDefinitionWidget: entity =>
                widgets.find(w => w.type === entity.spec.type),
            };
          },
        }),
    }),
  ],
});
