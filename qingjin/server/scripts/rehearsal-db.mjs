// Throwaway PostgreSQL for rehearsing the import; never touches server/.devdb.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const databaseDir = join(process.env.TEMP || '/tmp', 'qj-rehearsal', 'pgdata');
const port = 5440;
const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'qingjin',
  password: 'qingjin_dev',
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});
if (!existsSync(join(databaseDir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
await pg.createDatabase('qingjin');
console.log(`rehearsal postgres ready on 127.0.0.1:${port}`);
const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
