"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var domain = require('domain').create
var fs = require('fs')
var path = require("path")

var stackTrace = require('stack-trace')
var Future = require('async-future')
var resolveSourceMap = Future.wrap(require('source-map-resolve').resolveSourceMap)
var color = require('colors/safe')

var deadunitCore = require("./deadunitCore")

var readFileCache = {}
var nodeReadFile = Future.wrap(fs.readFile)
var readFile = function(filePath) {
    if(readFileCache[filePath] === undefined) {
        readFileCache[filePath] = nodeReadFile(filePath).then(function(fileBuffer) {
            return Future(fileBuffer.toString())
        })
    }
    return readFileCache[filePath]
}
var exists = function(filePath) {
    var existsFuture = new Future
    fs.exists(filePath, function(exists) {
        existsFuture.return(exists)
    })
    return existsFuture
}

module.exports = deadunitCore({
    initialize: function() {},
    initializeMainTest: function() {},
    mainTestDone: function() {},

    getDomain: function() {
        return process.domain
    },

    runTestGroup: function(deadunitState, tester, runTest, handleError) {

        var d = domain()
        d.on('error', function(err) {
            try {
                handleError(err, true).then(function() {
                    if(tester.mainTester.resultsAccessed) {
                        if(err instanceof Error) {
                            var errorToShow = err.stack
                        } else {
                            var errorToShow = err
                        }

                        handleUnhandledError(tester, Error("Test results were accessed before asynchronous parts of tests were fully complete."
                                                     +" Got error: "+errorToShow ))
                    }
                }).catch(function(e) {
                    handleUnhandledError(tester, Error("Deadunit threw up : ( - "+e.stack ))
                    console.log(e.stack)
                }).done()

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

    getScriptSourceLines: function(filePath) {
        return exists(filePath).then(function(exists) {
            if(exists) {
                return readFile(filePath).then(function(fileContents) {
                    return Future(fileContents.split('\n'))
                })
            } else {
                return Future(undefined)
            }
        })
    },

    getSourceMapObject: function(filePath, warningHandler) {
        return exists(filePath).then(function(fileExists) {
            if(fileExists) {
                return readFile(filePath).then(function(fileContents) {
                    return resolveSourceMap(fileContents.toString(), filePath, fs.readFile).catch(function(e){
                        warningHandler(e)
                        return Future(undefined)

                    }).then(function(sourceMapObject) {
                        if(sourceMapObject !== null) {
                            return Future(sourceMapObject.map)
                        } else {
                            return Future(undefined)
                        }

                        /*if(sourceMapFileName !== null) {

                            var sourceMapPath = path.join(path.dirname(filePath), sourceMapFileName)

                            return exists(sourceMapPath).then(function(fileExists) {
                                if(fileExists) {
                                    return readFile(sourceMapPath)
                                } else if(sourceMapFileName.indexOf('data:') === 0) {
                                    return Future(decodeDataUrl(sourceMapFileName))
                                } else {
                                    warningHandler(new Error("Couldn't find sourcemap file: "+sourceMapFileName))
                                    return Future(undefined)
                                }
                            })
                        } else {
                            return Future(undefined)
                        }*/
                    })
                })
            } else {
                return Future(undefined)
            }
        })
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
    },

    getExceptionInfo: function(e) {
        var info = stackTrace.parse(e)

        var results = []
        for(var n=0; n<info.length; n++) {
            var infoElement = info[n]

            var result = {
                function: infoElement.getFunctionName(),
                file: infoElement.getFileName(),
                line: infoElement.getLineNumber(),
                column: infoElement.getColumnNumber()
            }

            for(var key in result) {
                if(result[key] === null) result[key] = undefined
            }

            results.push(result)
        }

        return results
    }
})

function defaultUnhandledErrorHandler(e) {
    setTimeout(function() {
        if(e.stack)
            var errorString = e.stack
        else
            var errorString = e.toString()

        console.log(color.red(errorString))
    },0)
}