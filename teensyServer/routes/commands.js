'use strict';

const express = require('express');

const router = express.Router();
const cors = require('cors');

// ✅ Apply CORS at router level
router.use(cors());
router.options('*', cors());

const commandsService = require('../services/commands.service');

router.post('/', cors(), commandsService.sendCommand);
router.get('/', cors(), commandsService.clearLog);

module.exports = router;
