"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/


var Future = require('async-future')
var deadunitCore = require("../../src/deadunitCore")
var browserConfig = require('../../src/deadunitCore.browserConfig')

var config = browserConfig()

config.ajax = function() {
    var f = new Future
    f.throw("You called the ajax function that always fails")
    return f
}

module.exports = deadunitCore(config)