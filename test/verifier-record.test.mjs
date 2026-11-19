import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OPERATOR, doors, main, merger, parseDoors, verdict } from '../lib/verifier-record.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const conventions = read('conventions/issues-and-prs.md');
const list = parseDoors(conventions);
const isDoor = (files, extra = {}) => doors({ files, list, ...extra }).length > 0;

const head = 'a'.repeat(40);
const old = 'b'.repeat(40);
const by = (body, author = OPERATOR) => ({ author, body });
const state = (...comments) => verdict(head, comments).state;

test('a PASS from the operator whose first line names the exact head passes', () => {
	assert.equal(state(by(`VERIFIER PASS ${head}`)), 'success');
	assert.equal(state(by(`VERIFIER PASS ${head}\n\nNotes below the first line.`)), 'success', 'PASS+NOTES');
	assert.equal(state(by(`VERIFIER PASS ${head}\r\nNotes`)), 'success', 'CRLF line ends');
});

test('anything short of that fails', () => {
	assert.equal(state(), 'failure', 'no record');
	assert.equal(state(by(`VERIFIER FAIL ${head}`)), 'failure', 'a FAIL');
	assert.equal(state(by(`VERIFIER PASS ${old}`)), 'failure', 'an older head');
	assert.equal(state(by(`VERIFIER PASS ${head.slice(0, 7)}`)), 'failure', 'a short SHA');
	assert.equal(state(by(`Looks good. VERIFIER PASS ${head}`)), 'failure', 'not the whole first line');
	assert.equal(state(by(`Summary\nVERIFIER PASS ${head}`)), 'failure', 'not the first line');
	assert.equal(state(by(`VERIFIER PASS ${head}`, 'someone-else')), 'failure', 'not the operator');
	assert.equal(state(by(`VERIFIER PASS ${head} (retracted)`)), 'failure', 'a first line edited away from the record');
});

test('the latest record from the operator decides', () => {
	assert.equal(state(by(`VERIFIER PASS ${head}`), by(`VERIFIER FAIL ${head}`)), 'failure', 'a later FAIL wins');
	assert.equal(state(by(`VERIFIER FAIL ${head}`), by(`VERIFIER PASS ${head}`)), 'success', 'a later PASS wins');
	assert.equal(state(by(`VERIFIER PASS ${head}`), by(`VERIFIER FAIL ${head}`, 'someone-else')), 'success', "another account's FAIL changes nothing");
	assert.equal(state(by(`VERIFIER PASS ${head}`), by('Thanks!')), 'success', 'a later plain comment changes nothing');
});

test('the description names the head and who merges, within the 140 characters a status allows', () => {
	assert.equal(verdict(head, [by(`VERIFIER PASS ${head}`)]).description, 'PASS names aaaaaaa');
	assert.equal(verdict(head, []).description, 'No VERIFIER PASS names aaaaaaa');
	assert.equal(merger([]), ' · an agent merges');
	assert.equal(merger([{ file: 'Makefile' }]), ' · the operator merges (Makefile)');
	assert.equal(merger([{ file: 'Makefile' }, { file: '.github/a.yml' }]), ' · the operator merges (Makefile +1)');
	assert.match(merger(undefined), /unreadable, see conventions\/issues-and-prs\.md/);
	const longest = [verdict(head, []).description + merger([{ file: 'x/'.repeat(200) }, { file: 'y' }]), verdict(head, []).description + merger(undefined)];
	for (const description of longest) assert.ok(description.length <= 140, description);
});

test("the door list is read from this repo's conventions/issues-and-prs.md", () => {
	assert.ok(list.links, 'the symlink and submodule rule');
	for (const pattern of ['.github/**', '**/package.json', 'env/setup.sh', 'templates/githooks/**', '**/wrangler.jsonc', 'firestore.indexes.json'])
		assert.ok(list.patterns.includes(pattern), pattern);
	assert.ok(!list.patterns.includes('pnpm-lock.yaml'), 'only the Path column is read');
	assert.throws(() => parseDoors('# Nothing here\n'), /no ### One-way-door paths/);
	assert.throws(() => parseDoors(conventions.replace('`optionalDependencies`', 'optional dependencies')), /update PACKAGE_FIELDS/, 'a changed package.json exception fails loudly');
});

test('a PR is a one-way door when a file matches a path on the list', () => {
	const dev127 = ['README.md', 'conventions/ci.md', 'conventions/deploy.md', 'conventions/naming.md', 'lib/check.mjs', 'package.json', 'plugins/catati/.claude-plugin/plugin.json', 'plugins/catati/skills/repo-setup/SKILL.md', 'test/check.test.mjs'];
	assert.deepEqual(doors({ files: dev127, list }).map((door) => door.file), ['package.json'], 'dev#127');
	assert.ok(!isDoor(['README.md', 'docs/cli.md', 'conventions/naming.md', 'lib/check.mjs', 'test/check.test.mjs']), 'docs and code alone');
	for (const file of ['.github/workflows/verifier-record.yml', 'Makefile', 'ops.mk', 'env/setup.sh', 'templates/githooks/pre-push', 'api/migrations/0001.sql', 'web/.npmrc', 'plugins/catati/hooks/main.mjs', 'compose.dev.yml'])
		assert.ok(isDoor([file]), `${file} is a door`);
	for (const file of ['.github/.gitkeep', '.claude/hooks/.lib.mjs', '.githooks/pre-push'])
		assert.ok(isDoor([file]), `${file} is a door, though a segment starts with a dot`);
	for (const file of ['web/firebase.json', 'pnpm-lock.yaml', 'env/README.md', 'templates/node-version']) assert.ok(!isDoor([file]), `${file} is not a door`);
});

test('a PR of only manifests that changes only versions and dependencies is not a door', () => {
	const bump = { base: { version: '0.16.0', engines: { node: '>=24.15' } }, head: { version: '0.17.0', engines: { node: '>=24.15' } } };
	const deps = { base: { devDependencies: { a: '1' } }, head: { devDependencies: { a: '2' } } };
	const overrides = { base: { pnpm: { overrides: { a: '1' }, onlyBuiltDependencies: ['b'] } }, head: { pnpm: { overrides: { a: '2' }, onlyBuiltDependencies: ['b'] } } };
	assert.ok(!isDoor(['package.json'], { packages: { 'package.json': bump } }), 'a version bump');
	assert.ok(!isDoor(['package.json', 'pnpm-lock.yaml'], { packages: { 'package.json': deps } }), 'a dependency bump with its lockfile');
	assert.ok(!isDoor(['package.json'], { packages: { 'package.json': overrides } }), 'pnpm.overrides');

	const scripts = { base: { scripts: { test: 'node --test' } }, head: { scripts: { test: 'sh evil.sh' } } };
	const engines = { base: { engines: { node: '>=24' } }, head: { engines: { node: '>=22' } } };
	const built = { base: { pnpm: { onlyBuiltDependencies: ['b'] } }, head: { pnpm: { onlyBuiltDependencies: ['b', 'c'] } } };
	assert.ok(isDoor(['package.json'], { packages: { 'package.json': scripts } }), 'scripts');
	assert.ok(isDoor(['package.json'], { packages: { 'package.json': engines } }), 'engines');
	assert.ok(isDoor(['package.json'], { packages: { 'package.json': built } }), 'other pnpm fields');
	assert.ok(isDoor(['package.json'], { packages: {} }), 'a manifest whose sides were not read');
	assert.ok(isDoor(['package.json', 'lib/check.mjs'], { packages: { 'package.json': bump } }), 'a manifest beside other code');
	assert.ok(isDoor(['web/foo-package.json', 'web/package.json'], { packages: { 'web/package.json': deps } }), 'only a file named package.json counts as a manifest');
	assert.ok(isDoor(['api/migrations/package.json'], { packages: { 'api/migrations/package.json': deps } }), 'a manifest another door path matches');
});

test('a changed symlink or submodule is a door', () => {
	assert.deepEqual(doors({ files: ['README.md', 'vendor/sub'], links: ['vendor/sub'], list }), [{ file: 'vendor/sub', why: 'any symlink or submodule' }]);
	assert.deepEqual(doors({ files: ['.github/ci'], links: ['.github/ci'], list }).map((door) => door.why), ['`.github/**`'], 'a link on a door path is listed once');
	assert.ok(!isDoor(['vendor/sub'], { links: ['vendor/sub'], list: { ...list, links: false } }), 'only while the list names links');
});

function fakeApi(pr) {
	const posted = [];
	const api = (...args) => {
		if (args[0] === '-X') {
			posted.push(args);
			return '{}';
		}
		const path = args.find((arg) => arg.startsWith('repos/'));
		const route = path.replace(/^repos\/catati\/x\//, '');
		if (route === 'pulls/7') return `${pr.head}\n${pr.tip}\n`;
		if (route === 'issues/7/comments') return pr.comments.map((comment) => `${JSON.stringify(comment)}\n`).join('');
		if (route.startsWith('compare/')) return `${pr.base}\n`;
		if (route === 'pulls/7/files') return pr.files.map((file) => `${file}\n`).join('');
		if (route.startsWith('git/trees/')) return '';
		if (route.startsWith('contents/')) return JSON.stringify(pr.packages[route.split('?')[0].slice('contents/'.length)][route.endsWith(`ref=${pr.base}`) ? 'base' : 'head']);
		throw new Error(`unexpected gh api ${args.join(' ')}`);
	};
	return { api, posted };
}

test('main posts the record as the verifier-record status on the head', () => {
	const pr = { head, tip: old, base: old, files: ['package.json'], packages: { 'package.json': { base: { version: '1.0.0' }, head: { version: '1.1.0' } } }, comments: [by(`VERIFIER PASS ${head}`), by('Thanks!', 'someone-else')] };
	const { api, posted } = fakeApi(pr);
	assert.deepEqual(main({ REPO: 'catati/x', PR: '7' }, api), { head, state: 'success', description: 'PASS names aaaaaaa · an agent merges' });
	assert.deepEqual(posted, [['-X', 'POST', `repos/catati/x/statuses/${head}`, '-f', 'state=success', '-f', 'context=verifier-record', '-f', 'description=PASS names aaaaaaa · an agent merges']]);
});

test('main still posts the verdict when it cannot tell who merges', (t) => {
	t.mock.method(console, 'error', () => {});
	const { api, posted } = fakeApi({ head, tip: old, base: old, files: ['package.json'], packages: {}, comments: [] });
	assert.equal(main({ REPO: 'catati/x', PR: '7' }, api).description, 'No VERIFIER PASS names aaaaaaa · door list unreadable, see conventions/issues-and-prs.md');
	assert.equal(posted.length, 1);
});

test('the workflow runs only catati/dev code at its own commit, never the PR head', () => {
	const workflow = read('.github/workflows/verifier-record.yml');
	for (const trigger of ['pull_request_target', 'issue_comment', 'workflow_call']) assert.match(workflow, new RegExp(`^ {2}${trigger}:$`, 'm'), trigger);
	assert.deepEqual([...workflow.matchAll(/^\s+ref: (.*)$/gm)].map((match) => match[1]), ['${{ job.workflow_sha }}']);
	assert.match(workflow, /^\s+repository: \$\{\{ job\.workflow_repository \}\}$/m);
	assert.match(workflow, /^\s+persist-credentials: false$/m);
	assert.match(workflow, /^\s+run: node lib\/verifier-record\.mjs$/m);
});
