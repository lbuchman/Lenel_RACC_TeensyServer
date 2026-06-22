#!/usr/bin/env node

'use strict';

const app = require('../index');
const config = require('../utils/config');
const teensyUSB = require('../teensy/teensySerialLogPort');

const log = console;
const configuration = config();

teensyUSB.init(log);

app.listen(configuration.tcpPort, '0.0.0.0', (err) => {
    if (err) throw err;
    log.log(`Server is running on port ${configuration.tcpPort}`);
});
