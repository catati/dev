import { readFileSync } from 'node:fs';

const prTemplate = new URL('../templates/pull_request_template.md', import.meta.url);

const titlePattern = /^[a-z][a-z0-9-]*: \S/;

function templateMarkers(template) {
	return template
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => /^#{2,3} \S/.test(line) || line === '> [!NOTE]');
}

function prFindings({ title, body }, template) {
	const findings = [];
	if (!titlePattern.test(title)) {
		findings.push({ part: 'title', problem: `"${title}" does not read "<area>: <outcome>", such as "admin: Warn before an admin change overbooks a room"` });
	}
	let from = 0;
	for (const marker of templateMarkers(template)) {
		const at = body.indexOf(marker, from);
		if (at === -1) {
			findings.push({ part: 'body', problem: `has no "${marker}" in template order; copy .github/pull_request_template.md and fill every section` });
			continue;
		}
		from = at + marker.length;
	}
	if (!/Closes #\d+/.test(body)) findings.push({ part: 'body', problem: 'has no "Closes #<issue number>"' });
	if (!/\*\*Door:\*\* `(two-way|one-way)`/.test(body)) {
		findings.push({ part: 'body', problem: 'Merge Danger has no "**Door:** `two-way`" or "**Door:** `one-way`"' });
	}
	return findings;
}

export function checkPr(cwd, args = []) {
	const { env } = process;
	if (args.length > 0) {
		console.error(`catati-dev: check-pr takes no arguments, not ${args[0]}`);
		return 2;
	}
	const unset = ['PR_TITLE', 'PR_BODY'].filter((name) => env[name] === undefined);
	if (unset.length > 0) {
		console.error(`catati-dev: check-pr needs ${unset.join(' and ')} in the environment`);
		return 2;
	}
	const actor = env.PR_ACTOR ?? '';
	if (actor.endsWith('[bot]')) {
		console.log(`skipped: ${actor} is a bot`);
		return 0;
	}
	const findings = prFindings({ title: env.PR_TITLE, body: env.PR_BODY }, readFileSync(prTemplate, 'utf8'));
	const prefix = env.GITHUB_ACTIONS === 'true' ? '::error::' : '';
	for (const { part, problem } of findings) console.log(`${prefix}${part}: ${problem}`);
	return findings.length > 0 ? 1 : 0;
}
