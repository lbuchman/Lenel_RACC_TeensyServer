'use strict';

const express = require('express');

const router = express.Router();

const programServiceService = require('../services/program.service');


router.post('/', programServiceService.programTeensy);

module.exports = router;
