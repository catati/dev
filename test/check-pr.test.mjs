import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const cli = new URL('../bin/catati-dev.mjs', import.meta.url).pathname;
const template = readFileSync(new URL('../templates/pull_request_template.md', import.meta.url), 'utf8');

const validTitle = 'cli: Every repo checks its PR title and body the same way';
const validBody = template.replace('Closes #\n', 'Closes #30\n');

function checkPr(env, args = []) {
	const { GITHUB_ACTIONS, PR_TITLE, PR_BODY, PR_ACTOR, ...rest } = process.env;
	const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'check-pr', ...args], { encoding: 'utf8', env: { ...rest, ...env } });
	const lines = stdout.split('\n').filter(Boolean);
	const errors = stderr.split('\n').filter(Boolean);
	return errors.length > 0 ? { status, lines, errors } : { status, lines };
}

const pr = (overrides = {}) => ({ PR_TITLE: validTitle, PR_BODY: validBody, PR_ACTOR: 'catati-ops', ...overrides });

test('a PR with an <area>: <outcome> title and a filled template passes', () => {
	assert.deepEqual(checkPr(pr()), { status: 0, lines: [] });
});

test('a bad title is a finding', () => {
	assert.deepEqual(checkPr(pr({ PR_TITLE: 'Add verify-availability skill' })), {
		status: 1,
		lines: ['title: "Add verify-availability skill" does not read "<area>: <outcome>", such as "admin: Warn before an admin change overbooks a room"'],
	});
});

test('a body without ## Why is a finding', () => {
	assert.deepEqual(checkPr(pr({ PR_BODY: validBody.replace('## Why\n', '') })), {
		status: 1,
		lines: ['body: has no "## Why" in template order; copy .github/pull_request_template.md and fill every section'],
	});
});

test('a body without the > [!NOTE] card is a finding', () => {
	assert.deepEqual(checkPr(pr({ PR_BODY: validBody.replace('> [!NOTE]\n', '') })), {
		status: 1,
		lines: ['body: has no "> [!NOTE]" in template order; copy .github/pull_request_template.md and fill every section'],
	});
});

test('a body without ### Risk is a finding', () => {
	assert.deepEqual(checkPr(pr({ PR_BODY: validBody.replace('### Risk\n', '') })), {
		status: 1,
		lines: ['body: has no "### Risk" in template order; copy .github/pull_request_template.md and fill every section'],
	});
});

test('a body without Closes #N is a finding', () => {
	assert.deepEqual(checkPr(pr({ PR_BODY: template })), { status: 1, lines: ['body: has no "Closes #<issue number>"'] });
});

test('sections out of template order and a missing Door are findings', () => {
	const body = validBody.replace('## Evidence', '## Moved').replace('## Merge Danger', '## Evidence\n\n## Merge Danger').replace('**Door:** `two-way`', '');
	assert.deepEqual(checkPr(pr({ PR_BODY: body })), {
		status: 1,
		lines: [
			'body: has no "## Guards" in template order; copy .github/pull_request_template.md and fill every section',
			'body: Merge Danger has no "**Door:** `two-way`" or "**Door:** `one-way`"',
		],
	});
});

test('a PR opened by a bot is skipped', () => {
	assert.deepEqual(checkPr(pr({ PR_TITLE: 'build(deps): bump x', PR_BODY: '', PR_ACTOR: 'dependabot[bot]' })), {
		status: 0,
		lines: ['skipped: dependabot[bot] is a bot'],
	});
});

test('in GitHub Actions each finding is an error annotation', () => {
	assert.deepEqual(checkPr({ ...pr({ PR_BODY: template }), GITHUB_ACTIONS: 'true' }), {
		status: 1,
		lines: ['::error::body: has no "Closes #<issue number>"'],
	});
});

test('a run without PR_TITLE or PR_BODY, or with an argument, prints one line and exits with 2', () => {
	assert.deepEqual(checkPr({ PR_ACTOR: 'catati-ops' }), {
		status: 2,
		lines: [],
		errors: ['catati-dev: check-pr needs PR_TITLE and PR_BODY in the environment'],
	});
	assert.deepEqual(checkPr(pr(), ['--fix']), { status: 2, lines: [], errors: ['catati-dev: check-pr takes no arguments, not --fix'] });
});
