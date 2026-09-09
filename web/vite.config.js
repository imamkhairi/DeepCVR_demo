import { defineConfig } from 'vite';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubProjectBase = process.env.GITHUB_ACTIONS && repository && !repository.endsWith('.github.io')
  ? `/${repository}/`
  : '/';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? githubProjectBase,
});
