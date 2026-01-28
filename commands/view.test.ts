import { test, expect, describe } from "bun:test";
import type { StackboiConfig, Stack } from "./init";
import type { BranchInfo, StackWithInfo, SyncStatus, PRStatus, SyncState, SyncProgress, MergedPRNotification } from "./view";

describe("view", () => {
  const createMockConfig = (stacks: Stack[]): StackboiConfig => ({
    version: 1,
    stacks,
    settings: {
      rerere: { enabled: true, autoupdate: true },
      defaultBaseBranch: "main",
      pollIntervalMs: 30000,
    },
  });

  describe("BranchInfo structure", () => {
    test("branch info includes all required fields", () => {
      const branch: BranchInfo = {
        name: "feature-1",
        prNumber: 123,
        prStatus: "open",
        syncStatus: "up-to-date",
      };

      expect(branch.name).toBe("feature-1");
      expect(branch.prNumber).toBe(123);
      expect(branch.prStatus).toBe("open");
      expect(branch.syncStatus).toBe("up-to-date");
    });

    test("branch info can have null PR", () => {
      const branch: BranchInfo = {
        name: "feature-1",
        prNumber: null,
        prStatus: "none",
        syncStatus: "needs-push",
      };

      expect(branch.prNumber).toBeNull();
      expect(branch.prStatus).toBe("none");
    });
  });

  describe("SyncStatus types", () => {
    test("all sync statuses are valid", () => {
      const statuses: SyncStatus[] = [
        "up-to-date",
        "needs-push",
        "needs-rebase",
        "conflicts",
        "pending-sync",
        "unknown",
      ];

      expect(statuses).toHaveLength(6);
      statuses.forEach((status) => {
        expect(typeof status).toBe("string");
      });
    });
  });

  describe("SyncState types", () => {
    test("all sync states are valid", () => {
      const states: SyncState[] = [
        "idle",
        "fetching",
        "rebasing",
        "success",
        "error",
      ];

      expect(states).toHaveLength(5);
      states.forEach((state) => {
        expect(typeof state).toBe("string");
      });
    });
  });

  describe("SyncProgress structure", () => {
    test("sync progress includes all required fields", () => {
      const progress: SyncProgress = {
        state: "rebasing",
        message: "Rebasing child branches...",
        mergedBranch: "feature-1",
        childBranches: ["feature-2", "feature-3"],
        currentBranch: "feature-2",
        error: null,
      };

      expect(progress.state).toBe("rebasing");
      expect(progress.message).toBe("Rebasing child branches...");
      expect(progress.mergedBranch).toBe("feature-1");
      expect(progress.childBranches).toHaveLength(2);
      expect(progress.currentBranch).toBe("feature-2");
      expect(progress.error).toBeNull();
    });

    test("sync progress can have error state", () => {
      const progress: SyncProgress = {
        state: "error",
        message: "Rebase failed",
        mergedBranch: "feature-1",
        childBranches: ["feature-2"],
        currentBranch: "feature-2",
        error: "Conflicts detected",
      };

      expect(progress.state).toBe("error");
      expect(progress.error).toBe("Conflicts detected");
    });

    test("sync progress success state", () => {
      const progress: SyncProgress = {
        state: "success",
        message: "Sync completed successfully!",
        mergedBranch: "feature-1",
        childBranches: ["feature-2"],
        currentBranch: null,
        error: null,
      };

      expect(progress.state).toBe("success");
      expect(progress.currentBranch).toBeNull();
    });
  });

  describe("MergedPRNotification structure", () => {
    test("notification includes all required fields", () => {
      const notification: MergedPRNotification = {
        branchName: "feature-1",
        prNumber: 123,
        childBranches: ["feature-2", "feature-3"],
        stackName: "stack-feature",
      };

      expect(notification.branchName).toBe("feature-1");
      expect(notification.prNumber).toBe(123);
      expect(notification.childBranches).toHaveLength(2);
      expect(notification.stackName).toBe("stack-feature");
    });

    test("notification can have no child branches", () => {
      const notification: MergedPRNotification = {
        branchName: "feature-last",
        prNumber: 456,
        childBranches: [],
        stackName: "stack-feature",
      };

      expect(notification.childBranches).toHaveLength(0);
    });
  });

  describe("PRStatus types", () => {
    test("all PR statuses are valid", () => {
      const statuses: PRStatus[] = [
        "open",
        "merged",
        "closed",
        "draft",
        "none",
      ];

      expect(statuses).toHaveLength(5);
      statuses.forEach((status) => {
        expect(typeof status).toBe("string");
      });
    });
  });

  describe("StackWithInfo structure", () => {
    test("stack with info includes stack and branches", () => {
      const stack: Stack = {
        name: "stack-feature",
        baseBranch: "main",
        branches: ["feature-1", "feature-2"],
      };

      const stackWithInfo: StackWithInfo = {
        stack,
        branches: [
          {
            name: "feature-1",
            prNumber: 123,
            prStatus: "open",
            syncStatus: "up-to-date",
          },
          {
            name: "feature-2",
            prNumber: null,
            prStatus: "none",
            syncStatus: "needs-push",
          },
        ],
      };

      expect(stackWithInfo.stack.name).toBe("stack-feature");
      expect(stackWithInfo.branches).toHaveLength(2);
      expect(stackWithInfo.branches[0]!.name).toBe("feature-1");
      expect(stackWithInfo.branches[1]!.name).toBe("feature-2");
    });
  });

  describe("navigation items", () => {
    test("nav items are built from stacks in order", () => {
      const stacks: StackWithInfo[] = [
        {
          stack: {
            name: "stack-feature",
            baseBranch: "main",
            branches: ["feature-1", "feature-2"],
          },
          branches: [
            { name: "feature-1", prNumber: null, prStatus: "none", syncStatus: "up-to-date" },
            { name: "feature-2", prNumber: null, prStatus: "none", syncStatus: "up-to-date" },
          ],
        },
        {
          stack: {
            name: "stack-fix",
            baseBranch: "main",
            branches: ["fix-1"],
          },
          branches: [
            { name: "fix-1", prNumber: 456, prStatus: "open", syncStatus: "up-to-date" },
          ],
        },
      ];

      // Simulate buildNavItems
      const navItems: { branchName: string }[] = [];
      for (const stackInfo of stacks) {
        for (const branch of stackInfo.branches) {
          navItems.push({ branchName: branch.name });
        }
      }

      expect(navItems).toHaveLength(3);
      expect(navItems[0]!.branchName).toBe("feature-1");
      expect(navItems[1]!.branchName).toBe("feature-2");
      expect(navItems[2]!.branchName).toBe("fix-1");
    });

    test("empty stacks results in empty nav items", () => {
      const stacks: StackWithInfo[] = [];
      const navItems: { branchName: string }[] = [];

      for (const stackInfo of stacks) {
        for (const branch of stackInfo.branches) {
          navItems.push({ branchName: branch.name });
        }
      }

      expect(navItems).toHaveLength(0);
    });
  });

  describe("tree rendering logic", () => {
    test("last branch in stack uses lastBranch character", () => {
      const TREE_CHARS = {
        vertical: "│",
        branch: "├",
        lastBranch: "└",
        horizontal: "─",
      };

      const branches = ["feature-1", "feature-2", "feature-3"];

      for (let i = 0; i < branches.length; i++) {
        const isLast = i === branches.length - 1;
        const prefix = isLast
          ? `${TREE_CHARS.lastBranch}${TREE_CHARS.horizontal}`
          : `${TREE_CHARS.branch}${TREE_CHARS.horizontal}`;

        if (isLast) {
          expect(prefix).toBe("└─");
        } else {
          expect(prefix).toBe("├─");
        }
      }
    });
  });
});
