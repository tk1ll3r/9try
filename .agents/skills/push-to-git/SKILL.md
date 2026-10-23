---
name: push-to-git
description: Review selected repository changes, create a commit, and push the current branch when the user asks to publish code to Git.
---

# Push to Git

Use this skill when the user explicitly asks to commit or push repository changes.

## Workflow

1. Inspect the current branch, upstream, remotes, and `git status --short --branch`. Review the staged and relevant unstaged diff before deciding what belongs in the commit. Treat untracked files separately; do not assume they should be included.
2. Determine the exact file scope. Use files the user named. If the user only invoked the skill, use already-staged files when present; otherwise summarize the changed paths and ask which files to include. Never stage the whole repository by default.
3. Check the intended commit message and destination branch. If either is unclear, suggest a concise message and ask. Stay on the current branch; do not switch branches, reset, rebase, amend unrelated commits, or force-push.
4. Before changing Git state, show the files to be committed and the destination. Proceed when the user has clearly requested that scope and destination; otherwise ask for confirmation.
5. Stage only the agreed paths, inspect `git diff --cached`, and run `git diff --cached --check`. Do not include secrets, local environment files, credentials, or generated output unless the user explicitly asks and it is appropriate for the repository.
6. Create the commit, then push the current branch to its configured upstream. If there is no upstream, show the remote and proposed branch target and ask before setting one. Stop if the branch is detached or the push is rejected; do not force-push or rewrite history.
7. Report the commit hash, branch, remote, and push result. Do not run a deployment or release as part of this workflow.

Do not run the project test suite unless the user asks for tests. Git inspection and the staged whitespace check are part of this workflow.
