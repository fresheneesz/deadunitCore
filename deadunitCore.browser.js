"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var deadunitCore = require("./deadunitCore")
var browserConfig = require('./deadunitCore.browserConfig')

module.exports = deadunitCore(browserConfig())