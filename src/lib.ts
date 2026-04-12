import { debug, getInput } from '@actions/core'
import { getOctokit } from '@actions/github'
import { createUnauthenticatedAuth } from '@octokit/auth-unauthenticated'
import { downloadTool, extractTar, extractZip } from '@actions/tool-cache'
import { coerce, lt, satisfies } from 'semver'
import { readdir } from 'node:fs/promises'
import * as path from 'node:path'
import { $ } from 'execa'
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import type { GitHub } from '@actions/github/lib/utils'

export async function download(release: Release) {
  const platformArchIdentifier = `${getPlatform()} ${getArch()}`
  const asset = release.assets.find((asset) =>
    asset.label?.endsWith(platformArchIdentifier),
  )
  if (!asset)
    throw new Error(`Cannot find release asset for ${platformArchIdentifier}`)
  return await downloadTool(asset.browser_download_url)
}

export async function extract(filename: string) {
  const extracted = filename.endsWith('.zip')
    ? await extractZip(filename)
    : await extractTar(filename)
  debug('### extracted contents')
  debug((await readdir(extracted)).join('\n'))
  return extracted
}

export async function getRelease(): Promise<VersionedRelease> {
  const octokit = github()
  const version = getInput('gh-version')
  let release: Release | undefined
  if (version === 'latest') {
    ;({ data: release } = await octokit.rest.repos.getLatestRelease({
      owner: 'cli',
      repo: 'cli',
    }))
  } else {
    const coercedVersion = coerce(version)
    if (!coercedVersion)
      throw new Error(`"${version}" cannot be coerced to semver`)
    for await (const $release of iterateReleases(octokit)) {
      const releaseVersion = getReleaseVersion($release)
      if (lt(releaseVersion, coercedVersion)) noReleaseError()
      if (satisfies(releaseVersion, version)) {
        release = $release
        break
      }
    }
  }
  if (!release) noReleaseError()
  return { ...release, version: getReleaseVersion(release) }
}

export async function findDirectoryContainingBinary(dir: string) {
  for (const file of await readdir(dir, { recursive: true })) {
    if (path.basename(file, '.exe') === 'gh')
      return path.join(dir, path.dirname(file))
  }
  throw new Error(`Cound not find gh binary in ${dir}`)
}

export async function login(token: string) {
  const { hostname } = new URL(getInput('github-server-url'))
  await $({ input: token })`gh auth login --with-token --hostname ${hostname}`
}

function getReleaseVersion(release: Release) {
  return release.tag_name.replace(/^v/, '')
}

function noReleaseError(): never {
  throw new Error(`Cannot find version "${getInput('gh-version')}"`)
}

async function* iterateReleases(octokit: Octokit) {
  for await (const response of octokit.paginate.iterator(
    octokit.rest.repos.listReleases,
    {
      owner: 'cli',
      repo: 'cli',
    },
  )) {
    yield* response.data
  }
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

function github() {
  return getInput('cli-token')
    ? getOctokit(getInput('cli-token'))
    : getOctokit(undefined!, {
        authStrategy: createUnauthenticatedAuth,
        auth: { reason: "no 'cli-token' input" },
      })
}

type Release =
  RestEndpointMethodTypes['repos']['getLatestRelease']['response']['data']

type VersionedRelease = Release & { version: string }

type Octokit = InstanceType<typeof GitHub>
