'use strict';

const fs = require('fs-extra');

let config;
const log = console;

function getConfig() {
    let configJson;
    if (config) return config;

    const configFile = '/etc/bdArm.json';
    try {
        configJson = fs.readJsonSync(configFile);
    }
    catch (err) {
        log.info(err);
        process.exit(-1);
    }

    config = configJson.teensyServer;
    return config;
}
module.exports = getConfig;
