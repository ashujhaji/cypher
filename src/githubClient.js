const { Octokit } = require('@octokit/rest');

function createGithubClient({ token, owner, repo }) {
  const octokit = new Octokit({ auth: token });

  async function createGithubIssue({ title, body, labels }) {
    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });
    return { url: data.html_url, number: data.number };
  }

  return { createGithubIssue };
}

module.exports = { createGithubClient };
