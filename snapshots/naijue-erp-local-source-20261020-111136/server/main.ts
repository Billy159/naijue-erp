import {createApp} from './app.js';
import {readConfig} from './config.js';

const config = readConfig();
const app = createApp(config);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
}
try {
  await app.listen({host: config.host, port: config.port});
  console.log(`ERP v0.0.1 foundation listening on ${config.host}:${config.port} (${config.environment})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Application startup failed');
  process.exitCode = 1;
}
