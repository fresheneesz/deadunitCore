"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var domain = require('domain').create
var fs = require('fs')

var stackTrace = require('stack-trace')

var deadunitCore = require("./deadunitCore")

module.exports = deadunitCore({
    initialize: function() {},
    initializeMainTest: function() {},
    mainTestDone: function() {},

    runTestGroup: function(deadunitState, tester, runTest, handleError) {

        var d = domain()
        d.on('error', function(err) {
            try {
                handleError(err)

                if(tester.mainTester.resultsAccessed) {
                    if(err instanceof Error) {
                        var errorToShow = err.stack
                    } else {
                        var errorToShow = err
                    }

                    handleUnhandledError(tester, Error("Test results were accessed before asynchronous parts of tests were fully complete."
                                                 +" Got error: "+errorToShow ))
                }
            } catch(e) {
               handleUnhandledError(tester, Error("Deadunit threw up : ( - "+e.stack ))
               console.log(e.stack)
            }
        })

        d.run(function() {
            runTest()
        })


        function handleUnhandledError(tester, e) {
            if(tester.unhandledErrorHandler !== undefined)
                tester.unhandledErrorHandler(e)
            else
                deadunitState.unhandledErrorHandler(e)
        }
    },
    getScriptSource: function(path) {
        return fs.readFileSync(path).toString()
    },

    defaultUnhandledErrorHandler: defaultUnhandledErrorHandler,
    defaultTestErrorHandler: function(tester) {
        return defaultUnhandledErrorHandler
    },

    getLineInfo: function(stackIncrease) {
        var backTrace = stackTrace.get();
        var stackPosition = backTrace[3+stackIncrease]

        var filename = stackPosition.getFileName()
        var lineNumber = stackPosition.getLineNumber()
        var column = stackPosition.getColumnNumber()

        return {
            file: filename,
            line: lineNumber,
            column: column
        }
    }
})

function defaultUnhandledErrorHandler(e) {
    setTimeout(function() {
        if(e.stack)
            console.log(e.stack)
        else
            console.log(e)
    },0)
}