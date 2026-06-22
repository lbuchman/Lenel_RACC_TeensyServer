'use strict';

/* eslint-disable dot-notation */
const { exec } = require('child_process');

/**
 * @private
 * execute shell command
 */
function executeShellCommand(command, log, nothrow = true, maxBuffer = 1024 * 200) {
    // let stderrLocal;
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer }, (err, stdout, stderr) => {
            if (err) {
                log.error(`${command},  stdout =:\n${stdout}`);
                // stderrLocal = stderr;
                reject(err);
            }
            else {
               // log.debug(`"${command}" - command complete success`);
                let output = stdout;
                if (!output) output = 'no output';
                resolve(0);
            }
            if (stdout) {
               // log.debug(`${command},  stdout =:\n${stdout}`);
            }
            if (stderr) {
               // log.debug(`${command},  stderr =:\n -> ${stderr}`);
            }
        });
    })
        .catch((err) => {
            if (nothrow) {
               // log.error(err.message);
               // log.error(`${command},  stderr =:\n${stderrLocal}`);
                return;
            }
            throw (err);
        });
}

module.exports = {
    executeShellCommand
};
