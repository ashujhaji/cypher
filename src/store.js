const fs = require('fs');
const path = require('path');

/**
 * JSON-file backed dedupe map: Discord message ID -> GitHub issue URL.
 * Writes are serialized through a queue since fs writes here are async
 * but multiple Discord events can be in flight concurrently.
 */
class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.writeQueue = Promise.resolve();
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.data = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.data = {};
    }
  }

  _persist() {
    this.writeQueue = this.writeQueue.then(() => {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmpPath = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmpPath, this.filePath);
    });
    return this.writeQueue;
  }

  get(messageId) {
    return this.data[messageId];
  }

  async set(messageId, issueUrl) {
    this.data[messageId] = issueUrl;
    await this._persist();
  }
}

module.exports = { Store };
