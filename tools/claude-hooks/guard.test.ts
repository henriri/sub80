import { describe, expect, it } from "vitest";
import { decide } from "../../.claude/hooks/guard.mjs";

const bash = (command: string, branch: string | null = "feat/x") =>
  decide({ toolName: "Bash", toolInput: { command }, branch });

function expectBlocked(result: ReturnType<typeof decide>) {
  expect(result.block).toBe(true);
  if (result.block) expect(result.reason).not.toContain("\n");
}

describe("git push", () => {
  it.each([
    "git push origin main",
    "git push -u origin main",
    "git push origin HEAD:main",
    "git push origin feat/x:refs/heads/main",
    "git push origin :main",
    "git -C . push origin main",
    "git status && git push origin main",
    "git push --force origin feat/x",
    "git push -f",
    "git push --force-with-lease origin feat/x",
    "git push origin +feat/x",
    "git push --all",
    'bash -c "git push origin main"',
  ])("blocks %s", (command) => {
    expectBlocked(bash(command));
  });

  it("blocks a bare push on main and on an unknown branch", () => {
    expectBlocked(bash("git push", "main"));
    expectBlocked(bash("git push origin HEAD", "main"));
    expectBlocked(bash("git push", null));
  });

  it.each([
    "git push origin feat/x",
    "git push -u origin feat/x",
    "git push origin HEAD:feat/x",
    "git push origin chore/main-cleanup",
    'git commit -m "do not git push origin main"',
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it("allows a bare push on a feature branch", () => {
    expect(bash("git push", "feat/x").block).toBe(false);
    expect(bash("git push -u origin HEAD", "fix/y").block).toBe(false);
  });
});

describe("git commit and merge", () => {
  it.each(["git commit -m x", "git commit --amend", "git merge feat/x", "git add . && git commit -m x"])(
    "blocks %s on main and on an unknown branch",
    (command) => {
      expectBlocked(bash(command, "main"));
      expectBlocked(bash(command, null));
    },
  );

  it.each(["git commit -m x", "git merge main", "git merge --abort"])("allows %s on a feature branch", (command) => {
    expect(bash(command, "feat/x").block).toBe(false);
  });

  it("allows read-only git on main", () => {
    expect(bash("git status", "main").block).toBe(false);
    expect(bash("git log --oneline", "main").block).toBe(false);
    expect(bash("git checkout -b feat/y", "main").block).toBe(false);
  });
});

describe("supabase", () => {
  it.each([
    "supabase db push --linked",
    "supabase db push --remote",
    "supabase db reset --linked",
    "supabase db pull --linked",
    "supabase db diff --linked",
    "supabase migration list --linked",
    "pnpm supabase db push --linked",
    "pnpm exec supabase db reset --linked",
    "npx supabase db pull --remote",
    "supabase.exe db push --linked",
  ])("blocks %s", (command) => {
    expectBlocked(bash(command));
  });

  it.each([
    "supabase start",
    "supabase stop",
    "supabase db reset",
    "supabase db reset --local",
    "supabase db diff --local",
    "supabase migration new add_table",
    "supabase test db",
    "pnpm test",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe(".env files", () => {
  it.each(["Read", "Edit", "Write", "NotebookEdit"])("blocks %s on env files", (toolName) => {
    for (const filePath of [".env", ".env.local", "D:\\Work\\sub80\\sub80\\.env.local", "/repo/.env.production"]) {
      expectBlocked(decide({ toolName, toolInput: { file_path: filePath } }));
    }
  });

  it("allows .env.example and unrelated files", () => {
    for (const filePath of [".env.example", "D:\\Work\\sub80\\sub80\\.env.example", "src/env.ts", "src/.envrc", "environment.ts"]) {
      expect(decide({ toolName: "Read", toolInput: { file_path: filePath } }).block).toBe(false);
    }
    expect(decide({ toolName: "Write", toolInput: { file_path: "src/lib/supabase/env.ts" } }).block).toBe(false);
  });

  it("blocks Grep aimed at env files by path or glob", () => {
    expectBlocked(decide({ toolName: "Grep", toolInput: { pattern: "KEY", path: ".env.local" } }));
    expectBlocked(decide({ toolName: "Grep", toolInput: { pattern: "KEY", glob: ".env*" } }));
    expectBlocked(decide({ toolName: "Grep", toolInput: { pattern: "KEY", glob: "**/.env.local" } }));
    expect(decide({ toolName: "Grep", toolInput: { pattern: "KEY", glob: "*.ts" } }).block).toBe(false);
    expect(decide({ toolName: "Grep", toolInput: { pattern: "KEY", glob: ".env.example" } }).block).toBe(false);
  });

  it.each([
    "cat .env.local",
    "cat .env",
    "type .env.local",
    "type D:\\Work\\sub80\\sub80\\.env.local",
    "Get-Content .env.local",
    "Get-Content -Path .env.local",
    "gc .env.production",
    'cat ".env.local"',
    "head -n 3 .env.local",
    "grep KEY .env.local",
    "cat < .env.local",
    "echo X=1 > .env.local",
    "cat .env*",
    "ls && cat .env.local",
    "source .env.local",
  ])("blocks %s", (command) => {
    expectBlocked(bash(command));
  });

  it.each([
    "cat .env.example",
    "Get-Content .env.example",
    "cat src/env.ts",
    "git add .env.example",
    "ls -a",
    "pnpm test",
    'git commit -m "never cat .env.local"',
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("everything else", () => {
  it("allows ordinary tool calls", () => {
    expect(decide({ toolName: "Read", toolInput: { file_path: "src/app/page.tsx" } }).block).toBe(false);
    expect(decide({ toolName: "Edit", toolInput: { file_path: "CLAUDE.md" } }).block).toBe(false);
    expect(bash("pnpm lint && pnpm typecheck && pnpm test").block).toBe(false);
    expect(decide({ toolName: "WebSearch", toolInput: { query: "git push origin main" } }).block).toBe(false);
  });
});
