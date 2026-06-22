'use strict';

const fs = require('fs-extra');

const teensy = require('../teensy/teensy');
const logger = require('../utils/logger');
const config = require('../utils/config');
const os = require('../utils/os');

const configuration = config();
const logFile = configuration.teensyLogFilename;

module.exports = {
    sendCommand: async (req, res) => {
        const cmdJson = req.body;
        const log = logger();
        try {
            let cmd;
            if (!cmdJson.cmd) {
                log.error('empty cmd, rejected');
                return res.status(200).json({ error: 'empty cmd, rejected' });
            }
            if (cmdJson.arg !== undefined) cmd = `${cmdJson.cmd} ${cmdJson.arg}`;
            else cmd = `${cmdJson.cmd}`;
            let ret;
            ret = await teensy.sendCommand(cmd, 10000 /* 10 sec */);
            return res.status(200).json(ret);
        }
        catch (err) {
            log.error(err.message);
            return res.status(200).json({ error: err.message });
        }
    },
    clearLog: () => {
        fs.writeFileSync(logFile, `${new Date()}\n`);
        return res.status(200).json( { success: true }); 
    }
};
