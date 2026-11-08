import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati-dev.mjs', import.meta.url).pathname;
const head = '0123456789abcdef0123456789abcdef01234567';
const older = 'fedcba9876543210fedcba9876543210fedcba98';

function checkVerified({ args = ['--head', head], input, env = {} }) {
	const { GITHUB_ACTIONS, HEAD_SHA, ...rest } = process.env;
	const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'check-verified', ...args], { encoding: 'utf8', input, env: { ...rest, ...env } });
	const lines = stdout.split('\n').filter(Boolean);
	const errors = stderr.split('\n').filter(Boolean);
	return errors.length > 0 ? { status, lines, errors } : { status, lines };
}

const comment = (body, author_association = 'COLLABORATOR') => ({ body, author_association });
const comments = (...list) => JSON.stringify(list);
const missing = `not verified: no comment's first line reads "Verified at ${head}"`;

test('a PR with no comment is not verified', () => {
	assert.deepEqual(checkVerified({ input: '[]' }), { status: 1, lines: [missing] });
});

test('a comment for an older SHA is not verified', () => {
	assert.deepEqual(checkVerified({ input: comments(comment(`Verified at ${older}`)) }), { status: 1, lines: [missing] });
});

test('a collaborator comment whose first line names the head is verified', () => {
	const input = comments(comment('Looks fine so far'), comment(`Verified at ${head}\r\n\nAll criteria pass.`, 'MEMBER'));
	assert.deepEqual(checkVerified({ input }), { status: 0, lines: [`verified: "Verified at ${head}" is from MEMBER`] });
});

test('a correct comment from an author_association of NONE is not verified', () => {
	assert.deepEqual(checkVerified({ input: comments(comment(`Verified at ${head}`, 'NONE')) }), {
		status: 1,
		lines: [`not verified: the "Verified at ${head}" comment is from NONE, not OWNER, MEMBER or COLLABORATOR`],
	});
});

test('Verified at on a later line, or with text around it, is not verified', () => {
	const input = comments(comment(`Verdict below.\nVerified at ${head}`), comment(`Verified at ${head} (pending)`), comment(` Verified at ${head}`));
	assert.deepEqual(checkVerified({ input }), { status: 1, lines: [missing] });
});

test('a comment that names a short SHA is not verified', () => {
	assert.deepEqual(checkVerified({ input: comments(comment(`Verified at ${head.slice(0, 7)}`)) }), { status: 1, lines: [missing] });
});

test('in GitHub Actions a failure is an error annotation', () => {
	assert.deepEqual(checkVerified({ input: '[]', env: { GITHUB_ACTIONS: 'true' } }), { status: 1, lines: [`::error::${missing}`] });
});

test('the head SHA can come from HEAD_SHA and the comments from a file', () => {
	const file = join(mkdtempSync(join(tmpdir(), 'check-verified-')), 'comments.json');
	writeFileSync(file, comments(comment(`Verified at ${head}`, 'OWNER')));
	assert.deepEqual(checkVerified({ args: [file], env: { HEAD_SHA: head } }), { status: 0, lines: [`verified: "Verified at ${head}" is from OWNER`] });
});

test('bad input prints one line and exits with 2', () => {
	const usage = 'usage: catati-dev check-verified [--head <full head SHA>] [<comments JSON file>]';
	const cases = [
		[{ args: [], input: '[]' }, `catati-dev: check-verified needs the head SHA in --head or HEAD_SHA; ${usage}`],
		[{ args: ['--head', head.slice(0, 7)], input: '[]' }, `catati-dev: check-verified head SHA "${head.slice(0, 7)}" is not a full 40-character lowercase SHA`],
		[{ args: ['--head', head, '--fix'], input: '[]' }, `catati-dev: check-verified unknown option --fix; ${usage}`],
		[{ args: ['--head', head, 'a.json', 'b.json'] }, `catati-dev: check-verified takes one comments file, not b.json; ${usage}`],
		[{ input: 'not json' }, 'catati-dev: check-verified comments are not valid JSON'],
		[{ input: '{"body":"x"}' }, 'catati-dev: check-verified comments JSON must be an array of objects with a string body and author_association'],
		[{ input: '[{"body":"x"}]' }, 'catati-dev: check-verified comments JSON must be an array of objects with a string body and author_association'],
	];
	for (const [run, error] of cases) assert.deepEqual(checkVerified(run), { status: 2, lines: [], errors: [error] });
});
