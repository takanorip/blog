// Cloudflare Pages sets CF_PAGES_BRANCH to the git branch being built.
// Production deploys of this repo come from master. Every other branch is a
// preview deployment, and its environment variables are separate from Production.
export const PRODUCTION_BRANCH = "master";

export const shouldSyncAlgolia = (env: NodeJS.ProcessEnv) => {
  const branch = env.CF_PAGES_BRANCH;
  return !(env.CF_PAGES === "1" && !!branch && branch !== PRODUCTION_BRANCH);
};
