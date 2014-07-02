"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/


var Future = require('async-future')
var deadunitCore = require("../deadunitCore")
var browserConfig = require('../deadunitCore.browserConfig')

var config = browserConfig()

config.ajax = function() {
    throw new Error("You called the ajax function that always fails")
}

module.exports = deadunitCore(config)