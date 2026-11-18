import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Names a tool reads, so they keep the tool's spelling.
const toolNames = [
	'CLOUDFLARE_ACCOUNT_ID',
	'CLOUDFLARE_API_TOKEN',
	'COREPACK_ENABLE_DOWNLOAD_PROMPT',
	'SHOPIFY_CLI_NO_ANALYTICS',
	'SHOPIFY_SERVICE_ACCOUNT_TOKEN',
	'WRANGLER_SEND_METRICS',
];
const repoPrefixes = ['CAT_HOTEL_', 'CATSPER_', 'TERRAFORM_', 'DEV_'];

const names = readFileSync(new URL('../env/.env.example', import.meta.url), 'utf8')
	.split('\n')
	.filter((line) => line && !line.startsWith('#'))
	.map((line) => line.split('=')[0]);

test('every env/.env.example name is a tool name or starts with a repo stem', () => {
	const misnamed = names.filter((name) => !toolNames.includes(name) && !repoPrefixes.some((prefix) => name.startsWith(prefix)));
	assert.deepEqual(misnamed, []);
});

test('env/.env.example holds each name once', () => {
	assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), []);
});
