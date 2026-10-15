// API smoke test. Requires the API running and the seeded admin.
//   SMOKE_PASSWORD=... npm run smoke
const base = process.env.SMOKE_BASE || 'http://localhost:3000/api';
const username = process.env.SMOKE_USER || 'admin';
const password = process.env.SMOKE_PASSWORD;
if (!password) throw new Error('set SMOKE_PASSWORD');

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) failed++;
};
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};

check('health', (await call('GET', '/health')).status === 200);
check('machines without token -> 401', (await call('GET', '/machines')).status === 401);
check('bad password -> 401', (await call('POST', '/auth/login', { body: { username, password: 'wrong-password' } })).status === 401);
check('unknown field rejected -> 400', (await call('POST', '/auth/login', { body: { username, password, x: 1 } })).status === 400);

const login = await call('POST', '/auth/login', { body: { username, password } });
check('login -> 200', login.status === 200, login.data?.user?.role);
const { accessToken, refreshToken } = login.data ?? {};

const me = await call('GET', '/auth/me', { token: accessToken });
check('me', me.status === 200 && me.data.username === username);

const cats = await call('GET', '/categories', { token: accessToken });
check('categories = 8', cats.status === 200 && cats.data.length === 8, cats.data?.map((c) => `${c.slug}:${c.machineCount}`).join(' '));

const all = await call('GET', '/machines?pageSize=200', { token: accessToken });
check('machines total = 107', all.data?.total === 107);
check('every machine has a cover', all.data?.items.every((m) => m.coverUrl));

const search = await call('GET', '/machines?q=dz390', { token: accessToken });
check('search "dz390" finds DZ-390', search.data?.items.some((m) => m.model === 'DZ-390'), search.data?.items.map((m) => m.model).join(','));

const filtered = await call('GET', `/machines?categoryId=${cats.data[0].id}&pageSize=200`, { token: accessToken });
check('category filter', filtered.data?.total === cats.data[0].machineCount);

const one = await call('GET', `/machines/${all.data.items[0].id}`, { token: accessToken });
check('machine detail has params + images', one.status === 200 && one.data.params.length > 0 && one.data.images.length === 1);

const img = await fetch(base.replace(/\/api$/, '') + all.data.items[0].coverUrl);
check('cover image served', img.status === 200 && img.headers.get('content-type')?.includes('webp'));

check('bad pageSize -> 400', (await call('GET', '/machines?pageSize=9999', { token: accessToken })).status === 400);

const r1 = await call('POST', '/auth/refresh', { body: { refreshToken } });
check('refresh rotates token', r1.status === 200 && r1.data.refreshToken !== refreshToken);
const reuse = await call('POST', '/auth/refresh', { body: { refreshToken } });
check('reusing old refresh token -> 401', reuse.status === 401);
const r2 = await call('POST', '/auth/refresh', { body: { refreshToken: r1.data.refreshToken } });
check('reuse revoked the whole family', r2.status === 401);

const login2 = await call('POST', '/auth/login', { body: { username, password } });
const out = await call('POST', '/auth/logout', { body: { refreshToken: login2.data.refreshToken } });
check('logout -> 204', out.status === 204);
check('refresh after logout -> 401', (await call('POST', '/auth/refresh', { body: { refreshToken: login2.data.refreshToken } })).status === 401);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
