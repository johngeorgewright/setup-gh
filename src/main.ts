import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as github from "@actions/github";
import semver from "semver";
import process from "node:process";
import { $ } from "execa";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import * as path from 'node:path';
import { readdir } from "node:fs/promises";

const octokit = core.getInput("cli-token")
  ? github.getOctokit(core.getInput("cli-token"))
  : github.getOctokit(undefined!, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'cli-token' input" },
    });
let version = core.getInput("version");
if (version === "latest") {
  const { data } = await octokit.rest.repos.getLatestRelease({
    owner: "cli",
    repo: "cli",
  });
  version = data.tag_name.slice(1);
} else {
  const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: "cli",
    repo: "cli",
  });
  const versions = releases.map((release) => release.tag_name.slice(1));
  version = semver.maxSatisfying(versions, version) ?? version;
}
core.debug(`Resolved version: ${version}`);

let found = tc.find("gh", version);
core.setOutput("cache-hit", !!found);
if (!found) {
  const platform = {
    linux: "linux",
    darwin: "macOS",
    win32: "windows",
  }[process.platform as string];
  const arch = {
    x64: "amd64",
    arm: "arm",
    arm64: "arm64",
  }[process.arch as string];
  const ext = {
    linux: "tar.gz",
    darwin: semver.lt(version, "2.28.0") ? "tar.gz" : "zip",
    win32: "zip",
  }[process.platform as string];
  const file = `gh_${version}_${platform}_${arch}.${ext}`;
  found = await tc.downloadTool(
    `https://github.com/cli/cli/releases/download/v${version}/${file}`
  );
  if (file.endsWith(".zip")) {
    found = await tc.extractZip(found);
  } else {
    found = await tc.extractTar(found);
  }
  core.debug('### extracted contents')
  core.debug((await readdir(found)).join('\n'))
  found = await tc.cacheDir(found, "gh", version);
}
core.addPath(await findDirectoryContainingBinary(found));
core.setOutput("gh-version", version);

const token = core.getInput("token");
if (token) {
  const { hostname } = new URL(core.getInput("github-server-url"));
  await $({ input: token })`gh auth login --with-token --hostname ${hostname}`;
  core.setOutput("auth", true);
} else {
  core.setOutput("auth", false);
}

async function findDirectoryContainingBinary(dir: string) {
  for (const file of await readdir(dir, { recursive: true })) {
    if (path.basename(file, '.exe') === 'gh')
      return path.join(dir, path.dirname(file));
  }
  throw new Error(`Cound not find gh binary in ${dir}`);
}
