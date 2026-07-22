const TITLE_MAX_LENGTH = 100;

const BUG_KEYWORDS = ['bug', 'crash', 'error', 'broken', 'fails', 'fail', 'exception', "doesn't work", 'not working'];
const FEATURE_KEYWORDS = ['feature', 'please add', 'would be nice', 'feature request', 'enhancement'];

function guessLabel(text) {
  const lower = text.toLowerCase();
  if (BUG_KEYWORDS.some((kw) => lower.includes(kw))) return 'bug';
  if (FEATURE_KEYWORDS.some((kw) => lower.includes(kw))) return 'enhancement';
  return null;
}

function buildTitle(text) {
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX_LENGTH - 1).trim()}…`;
}

/**
 * Turns raw Discord message text into a GitHub issue {title, body, labels}.
 * Returns null when there's no usable text to file.
 */
function parseMessage(rawText, { author, sourceUrl, extraContext, defaultLabels = [] } = {}) {
  const text = rawText.trim();
  if (!text) return null;

  const title = buildTitle(text);
  const guessedLabel = guessLabel(text);
  const labels = [...defaultLabels];
  if (guessedLabel && !labels.includes(guessedLabel)) labels.push(guessedLabel);

  const bodyLines = [text];

  if (extraContext && extraContext.trim()) {
    bodyLines.push('', `> ${extraContext.trim()}`);
  }

  bodyLines.push('', '---');
  if (author) bodyLines.push(`Reported by **${author}** via Discord.`);
  if (sourceUrl) bodyLines.push(`[Original message](${sourceUrl})`);

  return {
    title,
    body: bodyLines.join('\n'),
    labels,
  };
}

module.exports = { parseMessage };
