import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStagingEnvironment } from './bootstrap.mjs';

const valid = {
  REYMEN_STAGING: 'true',
  DATABASE_URL: `postgresql://reymen_staging:${'a'.repeat(64)}@staging-postgres:5432/reymen_mark_staging`,
  STAGING_ADMIN_PASSWORD: 'b'.repeat(64), STAGING_OWNER_PASSWORD: 'c'.repeat(64),
};

test('bootstrap only accepts the exact isolated target and generated passwords', () => {
  assert.doesNotThrow(() => validateStagingEnvironment(valid));
  for (const change of [
    { REYMEN_STAGING: 'false' }, { DATABASE_URL: valid.DATABASE_URL.replace('staging-postgres', 'production') },
    { DATABASE_URL: valid.DATABASE_URL.replace('/reymen_mark_staging', '/production') },
    { DATABASE_URL: `${valid.DATABASE_URL}?host=/production` },
    { DATABASE_URL: valid.DATABASE_URL.replace('reymen_staging:', 'postgres:') },
    { STAGING_OWNER_PASSWORD: 'password123' }, { STAGING_ADMIN_PASSWORD: '' },
  ]) assert.throws(() => validateStagingEnvironment({ ...valid, ...change }));
});

test('init creates private secrets and refuses to overwrite them', () => {
  const temp = mkdtempSync(join(tmpdir(), 'reymen-staging-init-'));
  try {
    mkdirSync(join(temp, 'deploy/staging'), { recursive: true });
    const script = join(temp, 'deploy/staging/init.sh');
    copyFileSync(new URL('./init.sh', import.meta.url), script);
    execFileSync('bash', [script], { stdio: 'pipe' });
    const target = join(temp, '.env.staging');
    const before = readFileSync(target, 'utf8');
    assert.equal(statSync(target).mode & 0o777, 0o600);
    const values = before.trim().split('\n').map(line => line.split('=')[1]);
    assert.equal(values.length, 6);
    assert.equal(new Set(values).size, 6);
    assert.ok(values.every(value => /^[a-f0-9]{64}$/.test(value)));
    assert.notEqual(spawnSync('bash', [script]).status, 0);
    assert.equal(readFileSync(target, 'utf8'), before);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('resolved Compose keeps staging private and does not inherit external service credentials', () => {
  const env = { ...process.env };
  for (const key of ['DB_PASSWORD', 'AUTH_SECRET', 'WEBHOOK_SECRET', 'CRON_SECRET', 'ADMIN_PASSWORD', 'OWNER_PASSWORD']) {
    env[`STAGING_${key}`] = 'd'.repeat(64);
  }
  const config = JSON.parse(execFileSync('docker', [
    'compose', '--env-file', '/dev/null', '-f', 'docker/docker-compose.staging.yml', 'config', '--format', 'json',
  ], { env, encoding: 'utf8' }));
  assert.equal(config.name, 'reymen-mark-staging');
  assert.equal(config.networks.staging.internal, true);
  assert.deepEqual(Object.keys(config.services), ['app', 'staging-postgres']);
  assert.equal(config.services.app.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services.app.ports[0].published, '3301');
  assert.equal(config.services['staging-postgres'].ports, undefined);
  assert.equal(config.services.app.environment.ANTHROPIC_API_KEY, '');
  assert.equal(config.services.app.environment.AI_PROVIDER, 'mock');
  assert.equal(config.services.app.environment.AI_CHANNEL_CONNECTIONS_ENABLED, 'false');
  assert.equal(config.services.app.environment.AI_MARK_PILOT_BUDGET_ENABLED, 'false');
  assert.deepEqual(config.services.app.networks, { staging: null });
  assert.equal(config.volumes['staging-db'].external, undefined);
});
