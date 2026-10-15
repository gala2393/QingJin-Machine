/**
 * Publishes the current database content without the admin UI, e.g. right after the first deployment
 * when nothing is live yet.
 *   npm run publish:site -- "备注"        (dev, ts-node)
 *   npm run publish:site:prod -- "备注"   (production, compiled)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PublishService } from '../publish/publish.service';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const publish = app.get(PublishService);
    const release = await publish.publish(process.argv[2] ?? '命令行发布', null);
    console.log(`building v${release.version} …`);
    await publish.lastBuild;
    const done = await app.get(PrismaService).release.findUniqueOrThrow({ where: { id: release.id } });
    console.log(`v${done.version}: ${done.status}`);
    if (done.status !== 'SUCCESS') {
      console.log(done.log?.slice(-3000));
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
