import assert from 'node:assert/strict';
import test from 'node:test';

test('a failing test fails the verify check', () => {
	assert.equal(1, 2);
});
