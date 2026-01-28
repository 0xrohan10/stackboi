#!/usr/bin/env bun

import { init } from "./commands/init";
import { newStack } from "./commands/new";
import { addBranch } from "./commands/add";
import { view } from "./commands/view";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "init":
      await init();
      break;
    case "new": {
      const branchName = args[1];
      await newStack({ branchName });
      break;
    }
    case "add": {
      const branchName = args[1];
      await addBranch({ branchName });
      break;
    }
    case "view":
      await view();
      break;
    case undefined:
    case "--help":
    case "-h":
      console.log(`stackboi - A stacked branch workflow tool

Usage: stackboi <command>

Commands:
  init          Initialize stackboi in the current repository
  new <branch>  Create a new stack with the given branch name
  add <branch>  Add a new branch to the current stack
  view          Display stacks in an interactive tree view
`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
