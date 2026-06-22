'use strict';

const express = require('express');
const cors = require('cors');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const commands = require('./routes/commands');
const program = require('./routes/program');
const logs = require('./routes/logs');

app.use('/commands', commands);
app.use('/program', program);
app.use('/logs', logs);
app.use('/clear', commands);
module.exports = app;
