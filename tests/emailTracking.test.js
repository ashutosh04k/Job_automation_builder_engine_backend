import test from 'node:test';
import assert from 'node:assert/strict';
import { getJobTargetById, updateJobTarget } from '../services/storageService.js';

test('email open updates target open status and count', async () => {
  const targetId = '6ace1b3d2fbb434fe6077b3e';
  const target = await getJobTargetById(targetId);
  assert.ok(target, 'target exists');

  const prevCount = target.openCount || 0;
  const now = new Date().toISOString();
  await updateJobTarget(targetId, {
    isOpened: true,
    openedAt: target.openedAt || now,
    lastOpenedAt: now,
    openCount: prevCount + 1
  });

  const updated = await getJobTargetById(targetId);
  assert.equal(updated.isOpened, true);
  assert.equal(updated.openCount, prevCount + 1);
  assert.ok(updated.openedAt);
});

test('link click also marks target as opened', async () => {
  const targetId = '6ace1b3d2fbb434fe6077b3c';
  const target = await getJobTargetById(targetId);
  assert.ok(target, 'target exists');

  const now = new Date().toISOString();
  await updateJobTarget(targetId, {
    isOpened: true,
    openedAt: target.openedAt || now,
    lastOpenedAt: now,
    openCount: target.openCount || 1,
    clickedAt: now,
    clickCount: (target.clickCount || 0) + 1
  });

  const updated = await getJobTargetById(targetId);
  assert.equal(updated.isOpened, true);
  assert.ok(updated.clickCount >= 1);
});
