"use strict";

var OldDeadunit = require('deadunit')
var Unit = require('../deadunitCore.node')
var Future = require('async-future')

var tests = require("./deadunitTests")

var isDone = new Future
var mainTest = OldDeadunit.test(tests.name, tests.getTests(Unit, isDone))

var to = setTimeout(function() {
    mainTest.writeConsole()
    console.log('Had to time out the test')
},4000)


isDone.then(function() {
    mainTest.writeConsole(500)
    clearTimeout(to)
}).done()