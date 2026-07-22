const { Octokit } = require('@octokit/rest');

function createGithubClient({ token }) {
  const octokit = new Octokit({ auth: token });

  async function createGithubIssue({ owner, repo, title, body, labels }) {
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
