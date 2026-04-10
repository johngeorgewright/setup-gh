import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import { $ } from 'execa'
import {
  download,
  extract,
  findDirectoryContainingBinary,
  getVersion,
} from './lib'

const version = await getVersion()
core.debug(`Resolved version: ${version}`)

let found = tc.find('gh', version)
core.setOutput('cache-hit', !!found)
if (!found) {
  found = await download(version)
    .then(extract)
    .then((dir) => tc.cacheDir(dir, 'gh', version))
}
core.addPath(await findDirectoryContainingBinary(found))
core.setOutput('gh-version', version)

const token = core.getInput('token')
if (token) {
  const { hostname } = new URL(core.getInput('github-server-url'))
  await $({ input: token })`gh auth login --with-token --hostname ${hostname}`
  core.setOutput('auth', true)
} else {
  core.setOutput('auth', false)
}
