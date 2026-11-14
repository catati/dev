import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('templates/labels.json holds the status labels that naming.md names, in a form GitHub accepts', () => {
	const labels = JSON.parse(read('templates/labels.json'));
	const row = read('conventions/naming.md')
		.split('\n')
		.find((line) => /^\| The status labels are /.test(line));
	assert.ok(row, 'naming.md has a status labels row');
	const named = [...row.split('|')[1].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
	assert.deepEqual(labels.map((label) => label.name), named);
	for (const label of labels) {
		assert.deepEqual(Object.keys(label).sort(), ['color', 'description', 'name'], label.name);
		assert.match(label.color, /^[0-9a-f]{6}$/, label.name);
		assert.ok(label.description.length > 0 && label.description.length <= 100, label.name);
	}
});
