import { $ } from "bun";
import {
  type StackboiConfig,
  type Stack,
  getGitRoot,
  isGitRepo,
  checkGhAuth,
} from "./init";
import { loadConfig, getCurrentBranch, findStackByBranch } from "./new";

export interface CreatePROptions {
  branchName?: string;
  draft?: boolean;
}

export interface CreatePRResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
}

/**
 * Get the parent branch for a given branch in a stack.
 * Returns the stack's base branch if this is the first branch in the stack.
 */
export function getParentBranch(stack: Stack, branchName: string): string {
  const branchIndex = stack.branches.indexOf(branchName);
  if (branchIndex <= 0) {
    // First branch in stack or not found - use base branch
    return stack.baseBranch;
  }
  // Return the previous branch in the stack
  return stack.branches[branchIndex - 1]!;
}

/**
 * Get branch position in stack (1-indexed) and total count
 */
export function getStackPosition(
  stack: Stack,
  branchName: string
): { position: number; total: number } {
  const branchIndex = stack.branches.indexOf(branchName);
  return {
    position: branchIndex + 1,
    total: stack.branches.length,
  };
}

/**
 * Generate PR title from branch name.
 * Converts kebab-case/snake_case to Title Case and removes common prefixes.
 */
export function generateTitleFromBranchName(branchName: string): string {
  // Remove common prefixes like feature/, fix/, etc.
  const prefixPattern = /^(feature|feat|fix|bugfix|hotfix|chore|refactor|docs|test|ci)\//i;
  const cleanName = branchName.replace(prefixPattern, "");

  // Convert kebab-case or snake_case to words
  const words = cleanName.split(/[-_]+/);

  // Capitalize first letter of each word
  const titleCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return titleCase;
}

/**
 * Get the first commit message on this branch (relative to parent).
 */
async function getFirstCommitMessage(parentBranch: string): Promise<string | null> {
  const result = await $`git log ${parentBranch}..HEAD --format=%s --reverse`
    .quiet()
    .nothrow();

  if (result.exitCode !== 0) {
    return null;
  }

  const commits = result.stdout.toString().trim().split("\n");
  return commits[0] || null;
}

/**
 * Generate stack visualization for PR description.
 * Shows all branches in the stack with their PR status.
 */
export async function generateStackVisualization(
  stack: Stack,
  currentBranch: string,
  ghAuthenticated: boolean
): Promise<string> {
  const lines: string[] = [];
  lines.push("### Stack Overview");
  lines.push("");
  lines.push("```");
  lines.push(`${stack.baseBranch} (base)`);

  for (let i = 0; i < stack.branches.length; i++) {
    const branch = stack.branches[i]!;
    const isLast = i === stack.branches.length - 1;
    const isCurrent = branch === currentBranch;
    const prefix = isLast ? "└─" : "├─";

    // Get PR info for this branch
    let prInfo = "";
    if (ghAuthenticated) {
      const prResult =
        await $`gh pr view ${branch} --json number,state,isDraft`.nothrow().quiet();
      if (prResult.exitCode === 0) {
        try {
          const pr = JSON.parse(prResult.stdout.toString());
          const status = pr.isDraft ? "draft" : pr.state.toLowerCase();
          prInfo = ` [#${pr.number} ${status}]`;
        } catch {
          prInfo = "";
        }
      }
    }

    const marker = isCurrent ? " ◀ this PR" : "";
    lines.push(`${prefix} ${branch}${prInfo}${marker}`);
  }

  lines.push("```");
  lines.push("");
  lines.push(
    "_Created with [stackboi](https://github.com/stackboi/stackboi)_"
  );

  return lines.join("\n");
}

/**
 * Create or get the stack position label
 */
async function ensureStackLabel(position: number, total: number): Promise<string> {
  const labelName = `stack:${position}/${total}`;

  // Try to create the label (will fail silently if it exists)
  await $`gh label create "${labelName}" --description "Branch ${position} of ${total} in stack" --color "5319E7"`
    .quiet()
    .nothrow();

  return labelName;
}

/**
 * Check if a PR already exists for the branch
 */
async function getPRForBranch(
  branchName: string
): Promise<{ exists: boolean; number?: number; url?: string }> {
  const result = await $`gh pr view ${branchName} --json number,url`
    .quiet()
    .nothrow();

  if (result.exitCode !== 0) {
    return { exists: false };
  }

  try {
    const pr = JSON.parse(result.stdout.toString());
    return { exists: true, number: pr.number, url: pr.url };
  } catch {
    return { exists: false };
  }
}

/**
 * Create a GitHub PR for the current branch
 */
export async function createPR(options?: CreatePROptions): Promise<CreatePRResult> {
  if (!(await isGitRepo())) {
    return { success: false, error: "Not a git repository" };
  }

  const ghAuthenticated = await checkGhAuth();
  if (!ghAuthenticated) {
    return {
      success: false,
      error: "GitHub CLI not authenticated. Run 'gh auth login' first.",
    };
  }

  const gitRoot = await getGitRoot();
  const config = await loadConfig(gitRoot);

  // Determine which branch to create PR for
  const branchName = options?.branchName ?? (await getCurrentBranch());

  // Find the stack containing this branch
  const stack = findStackByBranch(config, branchName);
  if (!stack) {
    return {
      success: false,
      error: `Branch '${branchName}' is not part of any stack`,
    };
  }

  // Check if branch is in the stack's branches array (not the base branch)
  if (!stack.branches.includes(branchName)) {
    return {
      success: false,
      error: `Branch '${branchName}' is the base branch, not a stack branch`,
    };
  }

  // Check if PR already exists
  const existingPR = await getPRForBranch(branchName);
  if (existingPR.exists) {
    return {
      success: false,
      error: `PR already exists for branch '${branchName}': #${existingPR.number}`,
    };
  }

  // Get parent branch (base for this PR)
  const parentBranch = getParentBranch(stack, branchName);

  // Generate PR title
  const firstCommit = await getFirstCommitMessage(parentBranch);
  const title = firstCommit || generateTitleFromBranchName(branchName);

  // Get stack position for label
  const { position, total } = getStackPosition(stack, branchName);

  // Generate stack visualization for body
  const stackViz = await generateStackVisualization(stack, branchName, ghAuthenticated);

  // Ensure the stack label exists
  const labelName = await ensureStackLabel(position, total);

  // Build the PR body
  const body = `${stackViz}`;

  // Create the PR
  const draftFlag = options?.draft ? "--draft" : "";
  const createCmd = draftFlag
    ? $`gh pr create --base ${parentBranch} --title ${title} --body ${body} --label ${labelName} --draft`
    : $`gh pr create --base ${parentBranch} --title ${title} --body ${body} --label ${labelName}`;

  const createResult = await createCmd.quiet().nothrow();

  if (createResult.exitCode !== 0) {
    const stderr = createResult.stderr.toString();
    return {
      success: false,
      error: `Failed to create PR: ${stderr}`,
    };
  }

  // Get the created PR info
  const prInfo = await getPRForBranch(branchName);
  if (!prInfo.exists) {
    return {
      success: false,
      error: "PR was created but could not retrieve its information",
    };
  }

  // Open the PR in browser
  await $`gh pr view ${branchName} --web`.quiet().nothrow();

  return {
    success: true,
    prNumber: prInfo.number,
    prUrl: prInfo.url,
  };
}
