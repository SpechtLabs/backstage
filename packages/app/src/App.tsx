import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { authModule } from './modules/auth';
import { apiDocsGrpcModule, grpcDocsPlugin } from './modules/grpcDocs';
import { navModule } from './modules/nav';
import { openCostPlugin } from './modules/opencost';
import { themeModule } from './modules/theme';
import { homeModule } from './modules/home';
import { tailnetPolicyPlugin } from './modules/tailnetPolicy';

export default createApp({
  features: [
    catalogPlugin,
    authModule,
    themeModule,
    navModule,
    homeModule,
    grpcDocsPlugin,
    apiDocsGrpcModule,
    openCostPlugin,
    tailnetPolicyPlugin,
  ],
});
