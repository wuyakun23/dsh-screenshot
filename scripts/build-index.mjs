#!/usr/bin/env node
/**
 * Build the plugin-market index (format 1) for this repository.
 *
 * Usage:
 *   node scripts/build-index.mjs <commit-sha>
 *
 * The commit must be the 40-hex SHA of the pushed commit that contains this
 * package (git rev-parse HEAD after pushing to the repository named in
 * package.json "repository.url"). The index is written to ./index.json and is
 * meant to be served from a stable https URL, for example
 * https://raw.githubusercontent.com/OWNER/REPO/main/index.json
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8').replace(/^\uFEFF/u, ''))

const repoUrl = String(pkg.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '')
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl)) {
  console.error('Set package.json "repository.url" to https://github.com/<owner>/<repo> first.')
  process.exit(1)
}

let commit = process.argv[2]
if (commit === undefined) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    commit = ''
  }
}
if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error('Pass the pushed commit SHA: node scripts/build-index.mjs <40-hex-sha>')
  process.exit(1)
}

const index = {
  format: 1,
  title: { en: 'DeepSeek Harness plugins', zh: 'DeepSeek Harness 插件' },
  description: {
    en: 'Community bundles for DeepSeek Harness.',
    zh: 'DeepSeek Harness 的社区插件。',
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Screenshot', zh: '截图' },
      description: {
        en: 'Full-screen region picker, annotations (rectangle, line, pen), copy or download. Windows only.',
        zh: '全屏框选截图，支持矩形/直线/画笔标注，可复制或下载。仅支持 Windows。',
      },
      icon: 'icon.svg',
      homepage: pkg.homepage,
      repository: { url: repoUrl },
      metadata: { keywords: ['screenshot', 'annotation', 'windows'] },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: 'git', url: repoUrl, commit },
          engines: { dsh: pkg.engines?.dsh ?? '>=0.2.1-rc.5' },
        },
      ],
    },
  ],
}

writeFileSync(join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`index.json written for ${pkg.name}@${pkg.version} at commit ${commit}`)
