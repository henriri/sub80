// PreToolUse safety hook for Claude Code (see "Safety hooks and CI" in CLAUDE.md).
// Reads the tool call as JSON on stdin. Exit 2 with a one-line reason on stderr blocks it.
// `decide` is pure and importable; everything with side effects lives in `main`.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROTECTED_BRANCH = "main";

// Commands that read, copy or load a file. Any of them naming a protected env file is blocked.
const FILE_READERS = new Set([
  "cat", "type", "get-content", "gc", "more", "less", "head", "tail", "bat", "nl", "tac",
  "grep", "egrep", "fgrep", "rg", "sed", "awk", "select-string", "sls", "cp", "copy",
  "copy-item", "mv", "move", "move-item", "source", ".", "xxd", "od", "strings", "sort", "cut",
]);
const SHELLS = new Set(["bash", "sh", "zsh", "pwsh", "powershell", "cmd", "eval"]);
const PACKAGE_RUNNERS = new Set(["pnpm", "npx", "npm", "yarn", "bunx", "exec", "dlx", "run"]);

/** @typedef {{ block: false } | { block: true, reason: string }} Decision */

const allow = /** @type {Decision} */ ({ block: false });
/** @param {string} reason @returns {Decision} */
const deny = (reason) => ({ block: true, reason });

/** @param {string} filePath */
function baseName(filePath) {
  return filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

/** True for `.env` and `.env.*`, except `.env.example`. */
function isProtectedEnvPath(/** @type {string} */ filePath) {
  const name = baseName(filePath.replace(/^["']|["']$/g, ""));
  return /^\.env(\..+|\*.*)?$/.test(name) && name !== ".env.example";
}

/** Same check for a glob such as `.env*`, `**\/.env.local` or `{.env,.env.local}`. */
function isProtectedEnvGlob(/** @type {string} */ glob) {
  return /(^|[\\/{,])\.env(\.|\*|$|[,}])/i.test(glob) && !/\.env\.example$/i.test(glob);
}

/**
 * Split a command line into segments of tokens. Quotes group words, so a commit message
 * mentioning "git push origin main" is one token. `<` and `>` become their own tokens.
 * @param {string} command
 * @returns {string[][]}
 */
function tokenize(command) {
  /** @type {string[][]} */
  const segments = [];
  /** @type {string[]} */
  let tokens = [];
  let word = "";
  let inWord = false;
  /** @type {string | null} */
  let quote = null;

  const endWord = () => {
    if (inWord) tokens.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };

  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (char === ";" || char === "|" || char === "&" || char === "\n" || char === "\r") {
      endSegment();
    } else if (char === "<" || char === ">") {
      endWord();
      tokens.push(char);
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  endSegment();
  return segments;
}

/** @param {string} token */
function commandName(token) {
  return baseName(token).replace(/\.(exe|cmd|bat|ps1)$/, "");
}

/**
 * @param {string[]} args arguments after `git push`
 * @param {string | null} branch
 * @returns {Decision}
 */
function checkGitPush(args, branch) {
  const refspecs = [];
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (/^--(force|force-with-lease|force-if-includes)(=|$)/.test(arg) || /^-[a-zA-Z]*f/.test(arg)) {
      return deny("Blocked: force push is not allowed.");
    }
    if (arg === "--all" || arg === "--mirror") {
      return deny(`Blocked: git push ${arg} would push ${PROTECTED_BRANCH}.`);
    }
    if (arg === "--repo" || arg === "-o" || arg === "--push-option") skipNext = true;
    if (!arg.startsWith("-")) refspecs.push(arg);
  }

  // The first positional is the remote; the rest are refspecs.
  const targets = refspecs.slice(1);
  for (const target of targets) {
    if (target.startsWith("+")) return deny("Blocked: force push (+refspec) is not allowed.");
    const destination = target.split(":").pop() ?? target;
    if (destination.replace(/^refs\/heads\//, "") === PROTECTED_BRANCH) {
      return deny(`Blocked: pushing to ${PROTECTED_BRANCH} is not allowed. Push a branch and open a pull request.`);
    }
  }

  // No explicit branch (or HEAD) pushes the current branch.
  const pushesCurrentBranch = targets.length === 0 || targets.every((target) => target === "HEAD");
  if (pushesCurrentBranch && (branch === null || branch === PROTECTED_BRANCH)) {
    return deny(`Blocked: git push from ${branch ?? "an unknown branch"} may push ${PROTECTED_BRANCH}. Switch to a feature branch first.`);
  }
  return allow;
}

/**
 * @param {string[]} tokens one command segment
 * @param {string | null} branch
 * @returns {Decision}
 */
function checkGit(tokens, branch) {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (token === "-C" || token === "-c") index += 2;
    else if (token.startsWith("-")) index += 1;
    else break;
  }
  const subcommand = tokens[index];
  const args = tokens.slice(index + 1);

  if (subcommand === "push") return checkGitPush(args, branch);
  if ((subcommand === "commit" || subcommand === "merge") && (branch === null || branch === PROTECTED_BRANCH)) {
    return deny(`Blocked: git ${subcommand} on ${branch ?? "an unknown branch"} is not allowed. Work on a feat/, fix/ or chore/ branch.`);
  }
  return allow;
}

/**
 * Any --remote/--linked flag is blocked, which covers `db push|reset|pull|diff` carrying one.
 * A bare `supabase db push` or `db pull` is not caught: they default to the linked project.
 * @param {string[]} tokens one command segment
 * @returns {Decision}
 */
function checkSupabase(tokens) {
  const touchesRemote = tokens.some((token) => /^--(remote|linked)(=|$)/.test(token));
  if (touchesRemote) return deny("Blocked: supabase --remote/--linked touches the remote database. Use migrations through a PR.");
  return allow;
}

/**
 * @param {string[]} tokens one command segment
 * @returns {Decision}
 */
function checkEnvFiles(tokens) {
  const command = commandName(tokens[0] ?? "");
  const isReader = FILE_READERS.has(command);
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const previous = tokens[index - 1];
    const isRedirected = previous === "<" || previous === ">";
    if ((isReader || isRedirected) && isProtectedEnvPath(token)) {
      return deny("Blocked: .env files are off limits (only .env.example may be touched).");
    }
  }
  return allow;
}

/**
 * @param {string} command
 * @param {string | null} branch
 * @returns {Decision}
 */
function checkBash(command, branch) {
  for (const raw of tokenize(command)) {
    // Drop leading VAR=value assignments.
    const tokens = [...raw];
    while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
    const first = commandName(tokens[0] ?? "");
    if (!first) continue;

    if (SHELLS.has(first)) {
      for (const token of tokens.slice(1)) {
        if (/\s/.test(token)) {
          const nested = checkBash(token, branch);
          if (nested.block) return nested;
        }
      }
    }

    const decisions = [checkEnvFiles(tokens)];
    if (first === "git") decisions.push(checkGit(tokens, branch));
    if (first === "supabase") {
      decisions.push(checkSupabase(tokens));
    } else if (PACKAGE_RUNNERS.has(first) && tokens.slice(1, 4).some((token) => commandName(token) === "supabase")) {
      decisions.push(checkSupabase(tokens));
    }

    const blocked = decisions.find((decision) => decision.block);
    if (blocked) return blocked;
  }
  return allow;
}

/**
 * Decide whether a tool call is allowed.
 * @param {{ toolName: string, toolInput?: Record<string, unknown>, branch?: string | null }} call
 *   `branch` is the current git branch; null or undefined means it could not be determined,
 *   which is treated as main for commit, merge and bare push.
 * @returns {Decision}
 */
export function decide({ toolName, toolInput = {}, branch = null }) {
  const text = (/** @type {string} */ key) => (typeof toolInput[key] === "string" ? toolInput[key] : "");

  if (toolName === "Bash") return checkBash(text("command"), branch);

  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = text(key);
    if (value && isProtectedEnvPath(value)) {
      return deny("Blocked: .env files are off limits (only .env.example may be touched).");
    }
  }
  const glob = text("glob");
  if (glob && isProtectedEnvGlob(glob)) {
    return deny("Blocked: .env files are off limits (only .env.example may be touched).");
  }
  return allow;
}

/** @param {string} cwd */
function currentBranch(cwd) {
  try {
    const name = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return name || null;
  } catch {
    return null;
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // A hook bug must never lock the session.
  }

  const toolName = typeof input?.tool_name === "string" ? input.tool_name : "";
  const toolInput = input?.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const needsBranch = toolName === "Bash" && /\bgit\b/.test(String(toolInput.command ?? ""));

  const decision = decide({ toolName, toolInput, branch: needsBranch ? currentBranch(cwd) : null });
  if (decision.block) {
    process.stderr.write(`${decision.reason}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
