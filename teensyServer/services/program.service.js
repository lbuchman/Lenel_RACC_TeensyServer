'use strict';

const os = require('../utils/os');
const logger = require('../utils/logger');
const configuration = require('../utils/config');

const config = configuration();
const sleep = t => new Promise(s => setTimeout(s, t));

function initGPIO(log) {
/*
    os.executeShellCommand(`echo ${config.teensyProgGpio} > /sys/class/gpio/export`, log, false)
    .catch((err) => {
        log.error(err);
    });
    os.executeShellCommand(`echo ${config.teensyPowerGpio} > /sys/class/gpio/export`, log, false)
    .catch((err) => {
        log.error(err);
    });
    os.executeShellCommand(`echo "out" > /sys/class/gpio/gpio${config.teensyProgGpio}/direction`, log, false)
    .catch((err) => {
        log.error(err);
    });
    os.executeShellCommand(`echo "out" > /sys/class/gpio/gpio${config.teensyPowerGpio}/direction`, log, false)
    .catch((err) => {
        log.error(err);
    });
    os.executeShellCommand(`echo "0" > /sys/class/gpio/gpio${config.teensyProgGpio}/value`, log, false)
    .catch((err) => {
        log.error(err);
    });
    os.executeShellCommand(`echo "1" > /sys/class/gpio/gpio${config.teensyPowerGpio}/value`, log, false)
    .catch((err) => {
        log.error(err);
    });
*/
}

module.exports = {
    programTeensy: async (req, res) => {
        const cmdJson = req.body;
        const log = logger();
        try {
            let hexfile = cmdJson.hexfile;
            const mcu = cmdJson.mcu;
            await os.executeShellCommand(`echo "1" > /sys/class/gpio/gpio${config.teensyProgGpio}/value`, log, true);
            await sleep(100);
            await os.executeShellCommand(`echo "0" > /sys/class/gpio/gpio${config.teensyProgGpio}/value`, log, true);
            await os.executeShellCommand('killall -9 teensy_loader_cli', log, true);
            if (hexfile.includes('http')) {
                await os.executeShellCommand(`wget -nv --dns-timeout=10 --connect-timeout=10 --read-timeout=4 --tries=8 ${hexfile} -O /tmp/hexfile.hex`, log, false);
                hexfile = '/tmp/hexfile.hex';
            }
            const command = `/usr/bin/teensy_loader_cli  -mmcu=${mcu}  -w -s -v /${hexfile}`;
            const ret = await os.executeShellCommand(command, log, false);
            return res.status(200).json({ ret });
        }
        catch (err) {
            log.error(err.message);
            return res.status(200).json({ error: err.message });
        }
    }
};

initGPIO(logger());
