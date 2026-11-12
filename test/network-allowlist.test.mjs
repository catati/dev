import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const catatiZones = ['catati.co.nz', 'catati.nz', 'cathotel.nz', 'catshop.nz', 'catsper.app'];
const allowlist = readFileSync(new URL('../env/network-allowlist.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);

test('the network allowlist lets every Catati domain and its subdomains through', () => {
	const missing = catatiZones.flatMap((zone) => [zone, `*.${zone}`]).filter((host) => !allowlist.includes(host));
	assert.deepEqual(missing, []);
});

test('the network allowlist holds each host once', () => {
	assert.deepEqual(allowlist.filter((host, index) => allowlist.indexOf(host) !== index), []);
});
