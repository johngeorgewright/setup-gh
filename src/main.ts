import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {
  download,
  extract,
  findDirectoryContainingBinary,
  getVersion,
  login,
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
  await login(token)
  core.setOutput('auth', true)
} else {
  core.setOutput('auth', false)
}
