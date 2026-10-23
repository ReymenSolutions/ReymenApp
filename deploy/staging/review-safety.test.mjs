import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mark-secret-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, 'deploy', 'staging'); await mkdir(folder, { recursive: true });
  for (const file of ['configure-review.sh', 'check-provider.py']) await copyFile(new URL(file, import.meta.url), join(folder, file));
  const env = join(root, '.env.staging'); await writeFile(env, 'STAGING_DB_PASSWORD=synthetic\n', { mode: 0o600 });
  return { folder, env };
}
test('private configuration hides the key, preserves existing settings and refuses overwrite', async t => {
  const { folder, env } = await fixture(t), key = 'sk-ant-synthetic-fixture-only';
  const call = () => spawnSync('bash', [join(folder, 'configure-review.sh')], { input: `fixture-model\n${key}\n`, encoding: 'utf8' });
  const result = call(); assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.ok(!(result.stdout + result.stderr).includes(key));
  assert.equal((await stat(env)).mode & 0o777, 0o600);
  const saved = await readFile(env, 'utf8'); assert.ok(saved.includes('STAGING_DB_PASSWORD=synthetic'));
  assert.ok(saved.includes('STAGING_MARK_MODEL=fixture-model'));
  const repeat = call(); assert.ifError(repeat.error); assert.notEqual(repeat.status, 0); assert.equal(await readFile(env, 'utf8'), saved);
});
test('metadata check sends only a fixed-host GET and never discloses credentials', async t => {
  const { folder, env } = await fixture(t), key = 'sk-ant-synthetic-fixture-only';
  await writeFile(env, `STAGING_MARK_MODEL=fixture-model\nSTAGING_MARK_ANTHROPIC_API_KEY=${key}\n`, { mode: 0o600 });
  const code = `import runpy,sys,io
from unittest.mock import patch
main=runpy.run_path(sys.argv[1])['main']
with patch('urllib.request.build_opener') as build:
    build.return_value.open.return_value=io.BytesIO(b'{"id":"fixture-model"}')
    main()
    req=build.return_value.open.call_args.args[0]
    assert req.full_url=='https://api.anthropic.com/v1/models/fixture-model'
    assert req.get_method()=='GET'
`;
  const result = spawnSync('python3', ['-c', code, join(folder, 'check-provider.py')], { encoding: 'utf8' });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Modelo disponible: fixture-model'));
  assert.ok(!(result.stdout + result.stderr).includes(key));
});
