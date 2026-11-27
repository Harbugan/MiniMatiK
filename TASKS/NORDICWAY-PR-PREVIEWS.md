# NordicWay PR Preview Deployments

## Purpose
Every same-repository PR targeting `main` can have an isolated browser-testable MiniMatik deployment without modifying production.

- Production (unchanged): `/Projects/MiniMatik/` from merges to `main`.
- PR previews: `/Projects/MiniMatik/test/pr-<number>/` from an open PR's head commit.
- Example PR #4: `https://lilleoere.eu/Projects/MiniMatik/test/pr-4/` (verify public domain mapping after first deployment).
- Reuse existing `NORDICWAY_FTP_USER` and `NORDICWAY_FTP_PASSWORD` secrets; no new credentials.

## Activation for existing PR04
After this infrastructure PR is approved and merged into `main`, run GitHub Actions > **Deploy MiniMatik PR Preview to NordicWay** > **Run workflow**, enter `4`. This explicitly deploys the current head SHA of PR #4, even if that PR was opened before the workflow existed. The preview workflow will also run on future PR opens, reopens and source pushes that change deployed runtime files. Workflow-only changes are included as triggers.

## Safety
- Only open, same-repository PRs with base `main` are eligible; fork PRs are rejected.
- Preview files are written only to the PR-specific `test/pr-<number>/` folder. No remote deletion or production overwrite.
- The workflow is defined on the trusted default branch when run manually. It checks out PR head solely to package static HTML/CSS/JS; do not execute scripts, install dependencies, or run code from untrusted PR branches in the secrets-bearing deploy job.
- Deployment uses FTPS and existing secrets; never print credentials.
- The preview path must not be treated as a secure private environment. Browser-facing files are public to anyone with the URL unless NordicWay access controls are configured separately.
- Closed/merged PR preview directories are **not automatically removed** in this initial version; retention/cleanup requires a separately approved policy.
- GitHub workflow `paths` filtering means changes limited to documentation will not trigger a preview. Manual dispatch remains available.
- Files removed from a PR's runtime tree may remain on the remote preview folder because this workflow deliberately avoids remote deletions. If this becomes a problem, design a safe per-PR-only cleanup operation.
- Production deploy workflow `.github/workflows/deploy-nordicway.yml` remains untouched.

## QA
1. Verify PR #4 is open, from this repository, targeting main.
2. Merge the infrastructure PR after owner review.
3. Manually dispatch preview workflow with `pr_number=4`.
4. Verify GitHub Actions success and inspect uploaded runtime asset paths.
5. Load the public PR #4 preview URL on an iPad in landscape; confirm CSS/JS loads and no 404s.
6. Push a new runtime change to PR #4; verify its isolated preview updates automatically.
7. Verify the production URL still serves `main`, and other PR previews are unaffected.

## Scope
Infrastructure only; no ChordMatiK code changes, no PR04 branch changes, no automatic merge.
