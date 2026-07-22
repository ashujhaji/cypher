require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { parseMessage } = require('./parseMessage');
const { createGithubClient } = require('./githubClient');
const { Store } = require('./store');
const { loadChannelMap, resolveTarget } = require('./channelMap');

const log = {
  info: (...args) => console.log(new Date().toISOString(), 'INFO', ...args),
  warn: (...args) => console.warn(new Date().toISOString(), 'WARN', ...args),
  error: (...args) => console.error(new Date().toISOString(), 'ERROR', ...args),
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    log.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  githubToken: requireEnv('GITHUB_TOKEN'),
  allowedRoleIds: (process.env.ALLOWED_ROLE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  defaultLabels: (process.env.DEFAULT_LABELS || 'from-discord')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean),
  storePath: process.env.STORE_PATH || './data/store.json',
  cooldownSeconds: Number(process.env.COOLDOWN_SECONDS || 10),
  channelMapPath: process.env.CHANNEL_MAP_PATH || './channels.json',
};

const store = new Store(config.storePath);
const github = createGithubClient({ token: config.githubToken });

let channelMap;
try {
  channelMap = loadChannelMap(config.channelMapPath);
} catch (err) {
  log.error(err.message);
  process.exit(1);
}

if (Object.keys(channelMap).length === 0) {
  log.error(
    `${config.channelMapPath} has no entries. Add at least one Discord channel -> repo mapping (see channels.json.example) — there is no fallback repo.`
  );
  process.exit(1);
}

const lastUsedByUser = new Map();

function isOnCooldown(userId) {
  const lastUsed = lastUsedByUser.get(userId);
  if (!lastUsed) return false;
  return (Date.now() - lastUsed) / 1000 < config.cooldownSeconds;
}

function hasPermission(message) {
  if (config.allowedRoleIds.length === 0) return true;
  if (!message.member) return false;
  return message.member.roles.cache.some((role) => config.allowedRoleIds.includes(role.id));
}

function stripBotMention(content, botUserId) {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, 'g');
  return content.replace(mentionPattern, '').trim();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

client.once('ready', () => {
  log.info(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.mentions.has(client.user)) return;

    if (!hasPermission(message)) {
      await message.reply("You don't have permission to file issues via this bot.");
      return;
    }

    if (isOnCooldown(message.author.id)) {
      await message.reply(`Please wait a few seconds before filing another issue.`);
      return;
    }

    const target = resolveTarget(channelMap, message.channel.id, config.defaultLabels);

    if (!target) {
      await message.reply("This channel isn't wired to a GitHub repo yet. Ask an admin to add it to the channel map.");
      return;
    }

    const strippedContent = stripBotMention(message.content, client.user.id);

    let sourceText;
    let sourceAuthor;
    let sourceUrl;
    let dedupeKey;
    let extraContext;

    if (message.reference) {
      const referenced = await message.fetchReference();
      sourceText = referenced.content;
      sourceAuthor = referenced.author.tag;
      sourceUrl = referenced.url;
      dedupeKey = referenced.id;
      extraContext = strippedContent || undefined;
    } else {
      sourceText = strippedContent;
      sourceAuthor = message.author.tag;
      sourceUrl = message.url;
      dedupeKey = message.id;
    }

    if (!sourceText || !sourceText.trim()) {
      await message.reply(
        'Mention me with a description, or reply to the message you want filed with just a mention.'
      );
      return;
    }

    const existingIssueUrl = store.get(dedupeKey);
    if (existingIssueUrl) {
      await message.reply(`Already filed: ${existingIssueUrl}`);
      return;
    }

    const parsed = parseMessage(sourceText, {
      author: sourceAuthor,
      sourceUrl,
      extraContext,
      defaultLabels: target.labels,
    });

    if (!parsed) {
      await message.reply('Nothing to file — the message is empty.');
      return;
    }

    lastUsedByUser.set(message.author.id, Date.now());

    const issue = await github.createGithubIssue({ ...parsed, owner: target.owner, repo: target.repo });
    await store.set(dedupeKey, issue.url);
    await message.react('✅');
    await message.reply(`Filed issue #${issue.number}: ${issue.url}`);
  } catch (err) {
    log.error('Failed to handle message', err);
    try {
      await message.react('❌');
      await message.reply('Something went wrong filing this issue. Please try again later.');
    } catch (replyErr) {
      log.error('Failed to send error reply', replyErr);
    }
  }
});

client.on('error', (err) => log.error('Discord client error', err));

process.on('unhandledRejection', (err) => log.error('Unhandled rejection', err));
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', err);
  process.exit(1);
});

async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down...`);
  await client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.discordToken).catch((err) => {
  log.error('Failed to log in to Discord', err);
  process.exit(1);
});
