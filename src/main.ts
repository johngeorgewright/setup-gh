import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {
  download,
  extract,
  findDirectoryContainingBinary,
  getRelease,
  login,
} from './lib'

const release = await getRelease()
core.debug(`Resolved version: ${release.version}`)

let found = tc.find('gh', release.version)
core.setOutput('cache-hit', !!found)
if (!found) {
  found = await download(release)
    .then(extract)
    .then((dir) => tc.cacheDir(dir, 'gh', release.version))
}
core.addPath(await findDirectoryContainingBinary(found))
core.setOutput('gh-version', release.version)

const token = core.getInput('token')
if (token) {
  await login(token)
  core.setOutput('auth', true)
} else {
  core.setOutput('auth', false)
}
