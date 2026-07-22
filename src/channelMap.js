const fs = require('fs');

/**
 * Loads a Discord channel ID -> { owner, repo, labels? } map from a JSON file.
 * Every entry must carry both owner and repo — there is no env-level fallback,
 * so a malformed entry is a config error caught here rather than a silent
 * per-message failure later.
 */
function loadChannelMap(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new Error(`Failed to read channel map at ${filePath}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Channel map at ${filePath} is not valid JSON: ${err.message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Channel map at ${filePath} must be a JSON object keyed by Discord channel ID`);
  }

  for (const [channelId, entry] of Object.entries(parsed)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Channel map entry for "${channelId}" in ${filePath} must be an object`);
    }
    if (typeof entry.owner !== 'string' || !entry.owner) {
      throw new Error(`Channel map entry for "${channelId}" in ${filePath} is missing "owner"`);
    }
    if (typeof entry.repo !== 'string' || !entry.repo) {
      throw new Error(`Channel map entry for "${channelId}" in ${filePath} is missing "repo"`);
    }
    if (entry.labels !== undefined && !Array.isArray(entry.labels)) {
      throw new Error(`Channel map entry for "${channelId}" in ${filePath}: "labels" must be an array`);
    }
  }

  return parsed;
}

/**
 * Resolves the {owner, repo, labels} to file an issue against for a channel.
 * Returns null when the channel has no entry — there is no fallback repo.
 */
function resolveTarget(channelMap, channelId, defaultLabels = []) {
  const entry = channelMap[channelId];
  if (!entry) return null;
  return { owner: entry.owner, repo: entry.repo, labels: entry.labels || defaultLabels };
}

module.exports = { loadChannelMap, resolveTarget };
