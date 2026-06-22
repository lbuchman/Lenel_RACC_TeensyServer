'use strict';

const { SerialPort } = require('serialport');
const fsNative = require('fs');
const fs = require('fs-extra');
const conf = require('../utils/config');

let port = null;
let ledLastDevice;
let logFile;
let logStream;
let reconnectTimer;
const reconnectDelayMs = 2000;

function ensureLogStream(log) {
    fs.ensureFileSync(logFile);
    if (logStream) return;
    logStream = fsNative.createWriteStream(logFile, { flags: 'a' });
    logStream.on('error', (err) => {
        log.error(err.message);
    });
}

function scheduleReconnect(config, log) {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initSerial(config, log).catch((err) => {
            log.error(err.message);
            scheduleReconnect(config, log);
        });
    }, reconnectDelayMs);
}

/**
* @public
* init
* @param {object} log
*/
function initSerial(config, log) {
    ensureLogStream(log);
    if (!fs.existsSync(logFile) || fs.statSync(logFile).size === 0) {
        logStream.write(`${new Date()}\n`);
    }
    log.info('opening serial port');
    const devFile = config.logSerialDev;
    return new Promise((resolve, reject) => {
        if (devFile !== ledLastDevice) {
            port = new SerialPort({
                path: devFile,
                baudRate: parseInt(config.logSerialDevBaudRate, 10),
                autoOpen: false
            });
            ledLastDevice = devFile;

            port.on('error', (error) => {
                log.error(error, error.message);
                scheduleReconnect(config, log);
            });

            port.on('close', () => {
                log.warn('log serial port closed');
                scheduleReconnect(config, log);
            });

            port.on('data', (data) => {
                const outputData = data.toString().replaceAll('\r', '');
                if (logStream) {
                    logStream.write(outputData);
                }
            });
        }

        if (port && port.isOpen) {
            resolve();
            return;
        }

        port.open((err) => {
            if (err) {
                reject(new Error(`Error opening log serial port: ${err.message}`));
                return;
            }

            resolve();
        });
    });
}

/**
* @public
* init led, and start interval to update LED every 1 sec
* @param {object} ledBlinkingPatterns
* @param {object} log
*/
async function init(log) {
    const configFIle = conf();
    logFile = configFIle.teensyLogFilename;
    try {
        await initSerial(configFIle, log);
    }
    catch (err) {
        log.error(err);
        scheduleReconnect(configFIle, log);
    }
}

module.exports = {
    init
};
