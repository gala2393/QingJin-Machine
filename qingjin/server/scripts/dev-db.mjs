// Local development PostgreSQL without Docker. Production uses the postgres container in deploy/.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = join(root, '.devdb');
const port = Number(process.env.DEV_DB_PORT || 5433);

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'qingjin',
  password: 'qingjin_dev',
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

const fresh = !existsSync(join(databaseDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('qingjin');
console.log(`dev postgres ready on 127.0.0.1:${port} (db qingjin, user qingjin). Ctrl+C to stop.`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
