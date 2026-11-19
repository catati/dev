import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPERATOR = 'catati-ops';
const CONTEXT = 'verifier-record';
const DOORS_FILE = new URL('../conventions/issues-and-prs.md', import.meta.url);

const PACKAGE_FIELDS = ['version', 'dependencies', 'devDependencies', 'optionalDependencies', 'pnpm.overrides'];
const LOCKFILE = 'pnpm-lock.yaml';
const LINK = 'any symlink or submodule';

export function verdict(head, comments) {
	const pass = `VERIFIER PASS ${head}`;
	const fail = `VERIFIER FAIL ${head}`;
	let found;
	for (const { author, body } of comments) {
		if (author !== OPERATOR) continue;
		const first = (body ?? '').split('\n', 1)[0].trimEnd();
		if (first === pass || first === fail) found = first;
	}
	const short = head.slice(0, 7);
	if (found === pass) return { state: 'success', description: `PASS names ${short}` };
	if (found === fail) return { state: 'failure', description: `FAIL names ${short}` };
	return { state: 'failure', description: `No VERIFIER PASS names ${short}` };
}

export function merger(found) {
	if (!found) return ' · door list unreadable, see conventions/issues-and-prs.md';
	if (!found.length) return ' · an agent merges';
	const [first, ...rest] = found.map((door) => door.file);
	const name = first.length > 60 ? `…${first.slice(-59)}` : first;
	return ` · the operator merges (${name}${rest.length ? ` +${rest.length}` : ''})`;
}

export function parseDoors(markdown) {
	const section = /^### One-way-door paths\n([\s\S]*?)(?=^#{1,3} )/m.exec(`${markdown}\n# end`);
	if (!section) throw new Error('no ### One-way-door paths section');
	const rows = section[1].split('\n').filter((line) => /^\| `/.test(line));
	const patterns = rows.flatMap((row) => [...row.split('|')[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]));
	const packageRow = rows.find((row) => row.startsWith('| `**/package.json`'));
	if (!packageRow) throw new Error('the list has no **/package.json row');
	const missing = [...PACKAGE_FIELDS, LOCKFILE].filter((field) => !packageRow.includes(`\`${field}\``));
	if (missing.length) throw new Error(`the **/package.json exception no longer names ${missing.join(', ')}; update PACKAGE_FIELDS in lib/verifier-record.mjs`);
	if (patterns.length < 10) throw new Error(`only ${patterns.length} paths parsed`);
	return { patterns, links: rows.some((row) => row.includes(LINK)) };
}

const outside = (pkg) => {
	const { version, dependencies, devDependencies, optionalDependencies, ...rest } = pkg ?? {};
	const { overrides, ...pnpm } = rest.pnpm ?? {};
	if (Object.keys(pnpm).length) rest.pnpm = pnpm;
	else delete rest.pnpm;
	return JSON.stringify(rest);
};

// The list means * and ** to match dot-named segments too, which path.matchesGlob does not.
function globRegex(glob) {
	let source = '';
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (glob.startsWith('**/', i)) {
			source += '(?:.*/)?';
			i += 2;
		} else if (glob.startsWith('**', i)) {
			source += '.*';
			i += 1;
		} else if (char === '*') source += '[^/]*';
		else if (char === '?') source += '[^/]';
		else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${source}$`);
}

const isManifest = (file) => basename(file) === 'package.json';

export function doors({ files, links = [], packages = {}, list }) {
	const onlyManifests = files.every((file) => isManifest(file) || file === LOCKFILE);
	const found = [];
	for (const file of files) {
		const matched = list.patterns.filter((glob) => globRegex(glob).test(file));
		if (matched.length === 0) continue;
		if (matched.length === 1 && matched[0] === '**/package.json' && onlyManifests) {
			const change = packages[file];
			if (change && outside(change.base) === outside(change.head)) continue;
		}
		const pattern = matched.find((glob) => glob !== '**/package.json') ?? matched[0];
		found.push({ file, why: `\`${pattern}\`` });
	}
	if (list.links) for (const file of links) if (!found.some((door) => door.file === file)) found.push({ file, why: LINK });
	return found;
}

const gh = (...args) => execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const lines = (text) => text.split('\n').filter(Boolean);
const isNotFound = (error) => /HTTP 404/.test(`${error.stderr ?? ''}${error.stdout ?? ''}`);

function prDoors(api, repo, pr, tip, head) {
	const base = api(`repos/${repo}/compare/${tip}...${head}`, '--jq', '.merge_base_commit.sha').trim();
	const files = lines(api('--paginate', `repos/${repo}/pulls/${pr}/files`, '--jq', '.[] | .filename, (.previous_filename // empty)'));
	const manifestOrAbsent = (file, ref) => {
		const path = file.split('/').map(encodeURIComponent).join('/');
		try {
			return JSON.parse(api('-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${path}?ref=${ref}`));
		} catch (error) {
			if (isNotFound(error)) return undefined;
			throw error;
		}
	};
	const packages = Object.fromEntries(files.filter(isManifest).map((file) => [file, { base: manifestOrAbsent(file, base), head: manifestOrAbsent(file, head) }]));
	const linked = new Set(
		[base, head].flatMap((ref) =>
			lines(api(`repos/${repo}/git/trees/${ref}?recursive=1`, '--jq', '.tree[] | select(.mode == "120000" or .mode == "160000") | .path')),
		),
	);
	const links = files.filter((file) => linked.has(file));
	return doors({ files, links, packages, list: parseDoors(readFileSync(DOORS_FILE, 'utf8')) });
}

export function main({ REPO: repo, PR: pr }, api = gh) {
	const [head, tip] = lines(api(`repos/${repo}/pulls/${pr}`, '--jq', '.head.sha, .base.sha'));
	const comments = lines(api('--paginate', `repos/${repo}/issues/${pr}/comments`, '--jq', '.[] | {author: .user.login, body}')).map((line) => JSON.parse(line));
	const { state, description: record } = verdict(head, comments);
	let found;
	try {
		found = prDoors(api, repo, pr, tip, head);
	} catch (error) {
		console.error(`verifier-record: cannot tell who merges: ${error.message}`);
	}
	const description = record + merger(found);
	api('-X', 'POST', `repos/${repo}/statuses/${head}`, '-f', `state=${state}`, '-f', `context=${CONTEXT}`, '-f', `description=${description}`);
	return { head, state, description };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { head, state, description } = main(process.env);
	process.stdout.write(`${CONTEXT} ${state} on ${head}: ${description}\n`);
}
