#!/usr/bin/env node

'use strict';

const { SerialPort } = require('serialport');
const path = require('path');
const mkdirs = require('mkdirs');
const logger = require('../utils/logger');
const config = require('../utils/config');


class TeensyControl {
    constructor() {
        this.config = config();
        this.remoteIp = '';
        const name = 'teensyControl';
        mkdirs(path.dirname(config().teensyServerLogFilename));
        const logFilePath = config().teensyServerLogFilename;
        const logFilePathDebug = config().teensyServerLogDebugFilename;
        this.logger = logger(name, logFilePath, logFilePathDebug, 'debug');
        this.serialPort = null;
        this.currentState = {};
        this.inData = null;
        this.tmpInData = null;
        this.busy = false;
        this.timeoutHandler = null;
        this.setTeensyDatetime = true;
        this.reconnectDelayMs = 2000;
        this.reconnectTimer = null;
        this.commandQueue = [];
        this.processingQueue = false;
        this.maxQueueLength = this.getPositiveInt(this.config.serialQueueMaxLength, 8);
        this.maxQueueWaitMs = this.getPositiveInt(this.config.serialQueueWaitTimeoutMs, 30000);
        this.queueFlushMs = this.getPositiveInt(this.config.serialQueueFlushMs, 5000);
        this.queueFlushTimer = null;
    }

    // eslint-disable-next-line class-methods-use-this
    getPositiveInt(value, fallback) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) return fallback;
        return parsed;
    }

    isPortReady() {
        return this.serialPort && this.serialPort.isOpen;
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.initSerial().catch((err) => {
                this.logger.error(err.message);
                this.scheduleReconnect();
            });
        }, this.reconnectDelayMs);
    }

    writeAndDrain(data) {
        return new Promise((resolve, reject) => {
            this.serialPort.write(data, (writeErr) => {
                if (writeErr) {
                    reject(writeErr);
                    return;
                }
                this.serialPort.drain((drainErr) => {
                    if (drainErr) {
                        reject(drainErr);
                        return;
                    }
                    resolve();
                });
            });
        });
    }

    enqueueCommand(task) {
        return new Promise((resolve, reject) => {
            if (this.commandQueue.length >= this.maxQueueLength) {
                reject(new Error(`command queue is full (max ${this.maxQueueLength})`));
                return;
            }
            this.commandQueue.push({
                task,
                resolve,
                reject,
                queuedAt: Date.now()
            });
            this.startQueueFlushTimer();
            this.processQueue();
        });
    }

    startQueueFlushTimer() {
        if (this.queueFlushTimer || this.commandQueue.length === 0) return;
        this.queueFlushTimer = setTimeout(() => {
            this.queueFlushTimer = null;
            if (this.commandQueue.length === 0) return;
            const pending = this.commandQueue.splice(0, this.commandQueue.length);
            pending.forEach((queued) => {
                queued.reject(new Error(`command queue flushed after ${this.queueFlushMs}ms`));
            });
        }, this.queueFlushMs);
    }

    clearQueueFlushTimer() {
        if (!this.queueFlushTimer) return;
        clearTimeout(this.queueFlushTimer);
        this.queueFlushTimer = null;
    }

    async processQueue() {
        if (this.processingQueue) return;
        this.processingQueue = true;
        while (this.commandQueue.length > 0) {
            this.startQueueFlushTimer();
            const queued = this.commandQueue.shift();
            if (Date.now() - queued.queuedAt > this.maxQueueWaitMs) {
                queued.reject(new Error(`command queue wait timeout (${this.maxQueueWaitMs}ms)`));
                continue;
            }
            try {
                const result = await queued.task();
                queued.resolve(result);
            }
            catch (err) {
                queued.reject(err);
            }
        }
        this.clearQueueFlushTimer();
        this.processingQueue = false;
    }

    waitForReply(timeout, json) {
        const maxCount = Math.round(timeout / this.config.serialPullInt);
        return new Promise((resolve, reject) => {
            let count = 0;
            const interval = setInterval(() => {
                if (count >= maxCount) {
                    clearInterval(interval);
                    reject(new Error('no reply from teensy'));
                    return;
                }

                if (this.inData) {
                    const ret = this.inData;
                    this.inData = null;
                    clearInterval(interval);
                    if (json) {
                        try {
                            const jsonRet = JSON.parse(ret.toString());
                            if (jsonRet.cmd === 'printstatus' && !this.setTeensyDatetime) {
                                const utcTime = Math.round(new Date() / 1000);
                                const utcDate = new Date();
                                const offset = -1 * utcDate.getTimezoneOffset() / 60;
                                if (Math.abs(utcTime - jsonRet.epoch) > Math.abs((offset * 3600)) + 10) {
                                    this.setTeensyDatetime = true;
                                }
                            }
                            resolve(jsonRet);
                            return;
                        }
                        catch (err) {
                            this.logger.error(err.message);
                            this.logger.error(ret.toString());
                            reject(err);
                            return;
                        }
                    }
                    resolve(ret);
                    return;
                }
                count += 1;
            }, this.config.serialPullInt);
        });
    }

    async executeCommand(cmd, timeout = 1000, json = true) {
        if (!this.isPortReady()) {
            throw new Error('serial port is not connected');
        }

        this.busy = true;
        this.inData = null;
        const timeoutHandle = setTimeout(() => {
            this.busy = false;
        }, timeout);

        try {
            await this.writeAndDrain(`${cmd}\n\r`);
            return await this.waitForReply(timeout, json);
        }
        finally {
            this.busy = false;
            clearTimeout(timeoutHandle);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getTeensySetTimeCmd() {
        const utcTime = Math.round(new Date() / 1000);
        const utcDate = new Date();
        if (utcDate.getYear() < 121) {
            throw (new Error('pi time is not set'));
        }
        const offset = -1 * utcDate.getTimezoneOffset() / 60;
        return `settime ${Math.round(utcTime)} ${offset}`;
    }

    /**
      * @public
      * send command
      * @param {object} log
      */
    async sendCommand(cmd, timeout = 1000, json = true) {
        return this.enqueueCommand(() => this.executeCommand(cmd, timeout, json));
    }

    /**
    * @public
    * init
    * @param {object} log
    */
    initSerial() {
        const log = this.logger;
        if (this.isPortReady()) {
            return Promise.resolve();
        }
        log.debug('opening serial port');
        if (!this.serialPort) {
            this.serialPort = new SerialPort({
                path: this.config.serialDev,
                baudRate: parseInt(this.config.serialBaud, 10),
                autoOpen: false
            });

            this.serialPort.on('error', (error) => {
                log.error(error, error.message);
                this.scheduleReconnect();
            });

            this.serialPort.on('close', () => {
                log.warn('serial port closed');
                this.scheduleReconnect();
            });

            this.serialPort.on('data', (data) => {
                if (this.timeoutHandler) {
                    clearTimeout(this.timeoutHandler);
                    this.timeoutHandler = null;
                }
                if (this.tmpInData) this.tmpInData = Buffer.concat([this.tmpInData, data]);
                else this.tmpInData = data;
                this.timeoutHandler = setTimeout(() => {
                    this.inData = this.tmpInData;
                    this.tmpInData = null;
                }, this.config.serialInterbyteTimeout);
            });
        }

        return new Promise((resolve, reject) => {
            this.serialPort.open((err) => {
                if (err) {
                    reject(new Error(`Error opening serial port: ${err.message}`));
                    return;
                }
                resolve();
            });
        });
    }
}
// eslint-disable-next-line no-unused-vars
const teensyControl = new TeensyControl();
teensyControl.initSerial()
    .catch((err) => {
        const log = console;
        log.error(err.message);
        process.exit(-1);
    });

module.exports = teensyControl;
