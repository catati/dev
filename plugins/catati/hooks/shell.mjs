// Reads a Bash command into its simple commands, each a list of words, as the shell splits it:
// quotes, comments, $(…), backticks, subshells and heredocs. A word is dynamic when the shell
// would expand part of it. Command substitutions count as commands of their own, and a heredoc
// body counts only for the substitutions an unquoted one expands. A command's list also carries
// stdin, the text of its heredoc or here-string, piped, true when a pipe feeds it, and scope, which
// names the subshell it runs in: '' for the shell itself, and a child's scope starts with its
// parent's and a slash. It throws when a heredoc that never closes holds gh, since what runs then is unclear.
export function simpleCommands(source) {
	return scan(source)[0];
}

let scopes = 0;

function scan(source, start = 0, inner = false, scope = '') {
	const commands = [];
	const heredocs = [];
	const stack = [];
	const here = () => [scope, ...stack].join('/');
	const child = () => `${here()}/${++scopes}`;
	let words = [];
	let word = null;
	let quote = null;
	let depth = 0;
	const add = (text, dynamic = false) => {
		word ??= { text: '', dynamic: false };
		word.text += text;
		word.dynamic ||= dynamic;
	};
	let redirect = false;
	let herestring = false;
	let piped = false;
	const end = () => {
		if (word && herestring) words.stdin = word.text;
		else if (word && !redirect) words.push(word);
		if (word) redirect = herestring = false;
		word = null;
	};
	const close = () => {
		end();
		if (words.length) {
			words.piped = piped;
			words.scope = here();
			commands.push(words);
			piped = false;
		}
		words = [];
	};
	const nested = (from) => {
		const [found, after] = scan(source, from, true, child());
		commands.push(...found);
		add('', true);
		return after;
	};
	let index = start;
	while (index < source.length) {
		const char = source[index];
		const next = source[index + 1] ?? '';
		if (quote === "'") {
			if (char === "'") quote = null;
			else add(char);
			index++;
		} else if (quote === "$'") {
			if (char === "'") quote = null;
			else add(char === '\\' ? next : char);
			index += char === '\\' ? 2 : 1;
		} else if (char === '\\') {
			if (next !== '\n') add(next);
			index += 2;
		} else if (char === '`') {
			const [text, after] = backticks(source, index);
			commands.push(...scan(text, 0, false, child())[0]);
			add('', true);
			index = after;
		} else if (char === '(' && next === '(' && !word && arithmetic(source, index) > 0) {
			index = arithmetic(source, index);
		} else if (char === '$' && next === '(' && source[index + 2] === '(' && arithmetic(source, index + 1) > 0) {
			add('', true);
			index = arithmetic(source, index + 1);
		} else if (char === '$' && next === '(') {
			index = nested(index + 2);
		} else if (char === '$' && next === "'" && !quote) {
			quote = "$'";
			add('');
			index += 2;
		} else if (char === '$' && /[\w{@*#?!$-]/.test(next)) {
			add(char, true);
			index++;
		} else if (quote === '"') {
			if (char === '"') quote = null;
			else add(char);
			index++;
		} else if (char === "'" || char === '"') {
			quote = char;
			add('');
			index++;
		} else if (char === '#' && !word) {
			while (index < source.length && source[index] !== '\n') index++;
		} else if (char === '<' && next === '<' && source[index + 2] === '<') {
			end();
			herestring = true;
			index += 3;
		} else if (char === '<' && next === '<') {
			end();
			index += source[index + 2] === '-' ? 3 : 2;
			while (source[index] === ' ' || source[index] === '\t') index++;
			const delimiter = source.slice(index).match(/^[^\s;&|()<>]+/)?.[0] ?? '';
			index += delimiter.length;
			heredocs.push({ delimiter: delimiter.replace(/["'\\]/g, ''), expands: !/["'\\]/.test(delimiter), owner: words });
		} else if (char === '>' || (char === '<' && next !== '<')) {
			if (word && /^\d+$/.test(word.text)) word = null;
			end();
			index++;
			if (source[index] === '>' || source[index] === '|') index++;
			if (source[index] === '&') index++;
			redirect = true;
		} else if (char === ')' && inner && depth === 0) {
			close();
			return [commands, index + 1];
		} else if (char === '\n' || ';&|()'.includes(char)) {
			close();
			if (char === '(') {
				depth++;
				stack.push(++scopes);
			}
			if (char === ')') {
				depth = Math.max(0, depth - 1);
				stack.pop();
			}
			index++;
			if (char === '|' && next !== '|' && source[index - 2] !== '|') piped = true;
			if (char !== '\n') continue;
			for (const { delimiter, expands, owner } of heredocs.splice(0)) {
				const body = index;
				let bodyEnd = source.length;
				let closed = false;
				while (index < source.length && !closed) {
					const stop = source.indexOf('\n', index);
					const line = source.slice(index, stop < 0 ? source.length : stop);
					const tabs = line.match(/^\t*/)[0].length;
					if (line.slice(tabs) === delimiter) {
						closed = true;
						bodyEnd = index;
						index = stop < 0 ? source.length : stop;
					} else if (inner && line.slice(tabs).startsWith(`${delimiter})`)) {
						closed = true;
						bodyEnd = index;
						index += tabs + delimiter.length;
					} else index = stop < 0 ? source.length : stop + 1;
				}
				const text = source.slice(body, bodyEnd);
				if (!closed && /\bgh\b/.test(text)) throw new Error('a heredoc that never closes holds gh');
				owner.stdin = text;
				if (expands) commands.push(...substitutions(text, here()));
			}
		} else if (/\s/.test(char)) {
			end();
			index++;
		} else {
			add(char);
			index++;
		}
	}
	close();
	return [commands, index];
}

// The command inside the backticks that open at index, unescaped as bash does (\`, \\ and \$),
// so an escaped backtick inside nests, and the index after the closing one.
function backticks(source, index) {
	let text = '';
	let at = index + 1;
	while (at < source.length && source[at] !== '`') {
		const escaped = source[at] === '\\' && '`\\$'.includes(source[at + 1] ?? 'x');
		text += escaped ? source[at + 1] : source[at];
		at += escaped ? 2 : 1;
	}
	return [text, at + 1];
}

// Where the (( at index ends, when it is plain arithmetic, or -1. A (( holding quotes, an escape,
// a substitution or gh is read as subshells instead, which may over-read but never hides a command.
function arithmetic(source, index) {
	let depth = 0;
	for (let at = index + 2; at < source.length; at++) {
		if (source[at] === '(') depth++;
		else if (source[at] === ')' && depth > 0) depth--;
		else if (source[at] === ')') {
			const body = source.slice(index + 2, at);
			if (source[at + 1] !== ')' || /['"\\`]|\$\(|\bgh\b/.test(body)) return -1;
			return at + 2;
		}
	}
	return -1;
}

// The commands an unquoted heredoc body runs: its $(…) and backticks, each in a subshell of scope.
function substitutions(body, scope) {
	const found = [];
	let index = 0;
	while (index < body.length) {
		if (body[index] === '\\') index += 2;
		else if (body.startsWith('$(', index)) {
			const [commands, after] = scan(body, index + 2, true, `${scope}/${++scopes}`);
			found.push(...commands);
			index = after;
		} else if (body[index] === '`') {
			const [text, after] = backticks(body, index);
			found.push(...scan(text, 0, false, `${scope}/${++scopes}`)[0]);
			index = after;
		} else index++;
	}
	return found;
}

export const isAssignment = (word) => !word.dynamic && /^[A-Za-z_]\w*=/.test(word.text);
// Words that open a group or a clause, so the command after them is the one that runs.
export const isReserved = (word) => !word.dynamic && RESERVED.has(word.text);
const RESERVED = new Set(['{', '!', 'if', 'then', 'else', 'elif', 'while', 'until', 'do', 'time']);
