/**
 * Creates the initial super admin, or resets its password if it exists.
 *   ADMIN_PASSWORD=... npm run seed:admin
 * Without ADMIN_PASSWORD a random password is generated and printed once.
 */
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { createPrisma } from './db';

async function main() {
  const prisma = createPrisma();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const given = process.env.ADMIN_PASSWORD;
  if (given && given.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  const password = given || randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { username },
    create: { username, displayName: '超级管理员', passwordHash, role: 'SUPER_ADMIN' },
    update: { passwordHash, role: 'SUPER_ADMIN', active: true },
  });
  // A password reset should also end existing sessions.
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  console.log(`super admin ready: ${username}`);
  if (!given) console.log(`generated password (shown once): ${password}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
