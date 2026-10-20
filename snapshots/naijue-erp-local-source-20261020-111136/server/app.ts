import Fastify, {type FastifyInstance} from 'fastify';
import type {AppConfig} from './config.js';
import {PgDataAccess, type DataAccess} from './database/access.js';
import {IdentityService} from './security/service.js';
import {installIdentity, enforceRouteRegistration} from './security/http.js';
import {MediaStore} from './media/store.js';
import {registerMediaRoutes} from './media/routes.js';
import {registerTransactionCommandRoute} from './domain/transactions/http.js';
import {registerInventoryRoutes} from './domain/inventory/http.js';
import {registerCorrectionRoutes} from './domain/inventory/correction-http.js';
import {registerOutputRoutes} from './domain/outputs/http.js';
import {registerReferenceImportRoutes} from './domain/imports/http.js';
import {registerProductRoutes} from './domain/products/http.js';
import {registerUserStateRoutes} from './user-state/http.js';

declare module 'fastify' {interface FastifyInstance {dataAccess: DataAccess | null}}

export function createApp(config: AppConfig): FastifyInstance {
  if (config.syntheticFundAccounts&&config.environment!=='qa') throw new Error('QA_SYNTHETIC_FUND_SOURCE_QA_ONLY');
  const app = Fastify({logger: false, bodyLimit: 12 * 1024 * 1024});
  // Pools are lazy; foundation startup/health do not connect, migrate or seed identities.
  const dataAccess = config.database ? new PgDataAccess(config.database) : null;
  app.decorate('dataAccess', dataAccess);
  app.addHook('onClose', async () => {await dataAccess?.close();});
  app.get('/api/health', {
    schema: {
      querystring: {type: 'object', additionalProperties: false, properties: {}},
      response: {200: {
        type: 'object', additionalProperties: false,
        required: ['status', 'environment', 'applicationStage', 'businessReady'],
        properties: {
          status: {type: 'string', const: 'ok'},
          environment: {type: 'string', enum: ['local', 'stage', 'qa', 'production']},
          applicationStage: {type: 'string', const: 'foundation'},
          businessReady: {type: 'boolean', const: false},
        },
      }},
    },
  }, async () => ({status: 'ok', environment: config.environment, applicationStage: 'foundation', businessReady: false}));
  const identity = config.database && config.security ? new IdentityService(dataAccess!, config.database, config.security,config.syntheticFundAccounts) : null;
  app.decorate('identity', identity);
  enforceRouteRegistration(app);
  if (identity) {
    installIdentity(app, identity);
    registerUserStateRoutes(app);
    const media = new MediaStore(config.media);
    registerMediaRoutes(app, media);
    registerProductRoutes(app, media);
    registerReferenceImportRoutes(app);
    registerTransactionCommandRoute(app);
    registerInventoryRoutes(app);
    registerCorrectionRoutes(app);
    registerOutputRoutes(app);
  }
  return app;
}
