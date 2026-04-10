import { debug, getInput } from '@actions/core'
import { getOctokit } from '@actions/github'
import { createUnauthenticatedAuth } from '@octokit/auth-unauthenticated'
import { downloadTool, extractTar, extractZip } from '@actions/tool-cache'
import { lt, maxSatisfying } from 'semver'
import { readdir } from 'node:fs/promises'
import * as path from 'node:path'

export async function download(version: string) {
  const file = `gh_${version}_${getPlatform()}_${getArch()}.${getExt(version)}`
  return await downloadTool(
    `https://github.com/cli/cli/releases/download/v${version}/${file}`,
  )
}

export async function extract(filename: string) {
  const extracted = filename.endsWith('.zip')
    ? await extractZip(filename)
    : await extractTar(filename)
  debug('### extracted contents')
  debug((await readdir(extracted)).join('\n'))
  return extracted
}

export async function getVersion() {
  const octokit = github()
  const version = getInput('version')
  if (version === 'latest') {
    const { data } = await octokit.rest.repos.getLatestRelease({
      owner: 'cli',
      repo: 'cli',
    })
    return data.tag_name.slice(1)
  } else {
    const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
      owner: 'cli',
      repo: 'cli',
    })
    const versions = releases.map((release) => release.tag_name.slice(1))
    return maxSatisfying(versions, version) ?? version
  }
}

export async function findDirectoryContainingBinary(dir: string) {
  const regex = /(.*)\bgh(\.exe)?$/
  for (const file of await readdir(dir, { recursive: true })) {
    const result = regex.exec(file)
    if (result) return path.join(dir, result[1])
  }
  throw new Error(`Cound not find gh binary in ${dir}`)
}

function getPlatform() {
  switch (process.platform) {
    case 'darwin':
      return 'macOS'
    case 'win32':
      return 'windows'
    default:
      return 'linux'
  }
}

function getArch() {
  switch (process.arch) {
    case 'x64':
      return 'amd64'
    case 'arm64':
      return process.arch
    case 'arm':
      return 'armv6'
    default:
      throw new Error(`Cannot install gh for the ${process.arch} arch`)
  }
}

function getExt(version: string) {
  switch (process.platform) {
    case 'linux':
      return 'tar.gz'
    case 'darwin':
      return lt(version, '2.28.0') ? 'tar.gz' : 'zip'
    default:
      return 'zip'
  }
}

function github() {
  return getInput('cli-token')
    ? getOctokit(getInput('cli-token'))
    : getOctokit(undefined!, {
        authStrategy: createUnauthenticatedAuth,
        auth: { reason: "no 'cli-token' input" },
      })
}
