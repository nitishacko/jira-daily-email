const fs = require("fs");
const path = require("path");

function loadConfig() {
  const configPath = path.resolve(__dirname, "../res/config.json");
  const rawData = fs.readFileSync(configPath);
  return JSON.parse(rawData);
}

module.exports = loadConfig;
