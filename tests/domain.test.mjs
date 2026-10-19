import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, getUrgency, getUrgencyLabel } from '../src/domain.js';

test('formats countdown duration as HH:MM:SS', () => {
  assert.equal(formatDuration(0), '00:00:00');
  assert.equal(formatDuration(1000), '00:00:01');
  assert.equal(formatDuration(3_723_000), '01:02:03');
  assert.equal(formatDuration(100 * 60 * 60 * 1000), '100:00:00');
});

test('never formats negative remaining time as negative', () => {
  assert.equal(formatDuration(-5000), '00:00:00');
});

test('applies urgency thresholds from the real timestamp', () => {
  const now = 1_800_000_000_000;
  assert.equal(getUrgency(now + 2 * 24 * 60 * 60 * 1000, now), 'normal');
  assert.equal(getUrgency(now + 23 * 60 * 60 * 1000, now), 'soon');
  assert.equal(getUrgency(now + 30 * 60 * 1000, now), 'critical');
  assert.equal(getUrgency(now, now), 'ended');
  assert.equal(getUrgency(now - 1, now), 'ended');
});

test('has a clear completion label', () => {
  assert.equal(getUrgencyLabel('ended'), 'DEADLINE ENDED');
});
