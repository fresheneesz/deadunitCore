!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self);var n=o;n=n.deadunitCore||(n.deadunitCore={}),n=n.browser||(n.browser={}),n.gen=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var deadunitCore = _dereq_("./deadunitCore")
var browserConfig = _dereq_('./deadunitCore.browserConfig')

module.exports = deadunitCore(browserConfig())
},{"./deadunitCore":3,"./deadunitCore.browserConfig":2}],2:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var path = _dereq_('path');

var Future = _dereq_('async-future')
var proto = _dereq_('proto')
var stackinfo = _dereq_('stackinfo')
var ajax = _dereq_("ajax")
var resolveSourceMap = Future.wrap(_dereq_('source-map-resolve').resolveSourceMap)

var deadunitCore = _dereq_("./deadunitCore")
var isRelative = _dereq_('./isRelative')

ajax.setSynchronous(true) // todo: REMOVE THIS once this chrome bug is fixed in a public release: https://code.google.com/p/chromium/issues/detail?id=368444

// add sourceFile contents into stacktrace.js's cache
var sourceCache = {}
var cacheGet = function(url) {
    return sourceCache[url]
}
var cacheSet = function(url, responseFuture) {
    sourceCache[url] = responseFuture
    if(stackinfo.sourceCache[url] === undefined) {
        responseFuture.then(function(response) {
            stackinfo.sourceCache[url] = response.text.split('\n')
        }).done()
    }
}

if(window.setImmediate === undefined) {
    window.setImmediate = function(fn, params) {
        setTimeout(function() {
            fn.apply(this,params)
        },0)
    }
}

ajax.cacheGet(cacheGet)
ajax.cacheSet(cacheSet)


var config = module.exports = proto(function() {
    this.init = function() {
        var that = this
        // node.js errback style readFile
        /*private*/ this.readFile = function(url, callback) {
            that.ajax(url).then(function(response) { // need to use 'that' because readFile will not be called with this config object as the context
                callback(undefined, response.text)
            }).catch(callback).done()
        }
    }

    this.ajax = ajax

    this.initialize = function() {}

    this.initializeMainTest = function(testState, fakeTest) {
        //testState.active = true // make sure

        testState.oldOnerror = window.onerror
        testState.newOnerror = window.onerror = function(errorMessage, filename, line, column) {
            if(column === undefined) var columnText = ''
            else                     var columnText = "/"+column


            try {
                throw new Error("Uncaught error in "+filename+" line "+line+columnText+": "+errorMessage) // IE needs the exception to actually be thrown before it will have a stack trace
            } catch(e) {
                if(errorMessage  === 'Script error.') {  // happens when a javascript call violates the same origin policy (this will happen for all file:// protocol stuff)
                    fakeTest.mainSubTest.warningHandler(e)
                } else {
                    testState.unhandledErrorHandler(e, true)
                }

                if(testState.oldOnerror)
                    testState.oldOnerror.apply(this, arguments)
            }
        }
    }
    this.mainTestDone= function(testState) {
        //testState.active = false // make sure the test-specific onerror code is no longer run
        /*if(testState.newOnerror === window.onerror) {
            window.onerror = testState.oldOnerror // otherwise something else has overwritten onerror, so don't mess with it
        }*/
    }

    this.getDomain= function() {
        return undefined // domains don't exist in-browser
    }

    this.runTestGroup= function(deadunitState, tester, runTest, handleError, handleUnhandledError) {
        runTest()
    }
    this.getScriptSourceLines= function(path) {
        if(stackinfo.sourceCache[path] !== undefined) {
            return Future(stackinfo.sourceCache[path])
        } else {
            return this.ajax(path).then(function(response) {
                return Future(response.text.split('\n'))
            })
        }

    }
    this.getSourceMapObject = function(url, warningHandler) {
        var that = this
        return this.ajax(url).then(function(response) {
            var headers = response.headers
            if(headers['SourceMap'] !== undefined) {
                var headerSourceMap = headers['SourceMap']
            } else if(headers['X-SourceMap']) {
                var headerSourceMap = headers['X-SourceMap']
            }

            if(headerSourceMap !== undefined) {
                if(isRelative(headerSourceMap)) {
                    headerSourceMap = path.join(path.dirname(url),headerSourceMap)
                }

                return that.ajax(headerSourceMap).then(function(response) {
                    return Future(JSON.parse(response.text))
                })

            } else {
                return resolveSourceMap(response.text, url, that.readFile).catch(function(e){
                    warningHandler(e)
                    return Future(undefined)

                }).then(function(sourceMapObject) {
                    if(sourceMapObject !== null) {
                        return Future(sourceMapObject.map)
                    } else {
                        return Future(undefined)
                    }
                })
            }
        })
    }

    this.defaultUnhandledErrorHandler= function(e) {
        //if(e !== undefined)
            setTimeout(function() {
                if(e.stack)
                    console.log(e.stack)
                else
                    console.log(e)
            },0)
    }
    this.defaultTestErrorHandler= function(tester) {
        return function(e) {
            tester.manager.emit('exception', {
                parent: tester.mainSubTest.id,
                time: (new Date()).getTime(),
                error: e
            })
        }
    }

    this.getLineInfo= function(stackIncrease) {
        return stackinfo()[3+stackIncrease]
    }

    this.getExceptionInfo= function(e) {
        return stackinfo(e)
    }
})
},{"./deadunitCore":3,"./isRelative":4,"ajax":5,"async-future":8,"path":11,"proto":17,"source-map-resolve":20,"stackinfo":33}],3:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var path = _dereq_('path')
var Url = _dereq_("url")

var proto = _dereq_('proto')
var Future = _dereq_('async-future')
var SourceMapConsumer = _dereq_('source-map').SourceMapConsumer

var processResults = _dereq_('./processResults')
var isRelative = _dereq_('./isRelative')

// returns a module intended for a specific environment (that environment being described by the options)
// options can contain:
    // initialization - a function run once that can setup things (like a global error handler).
        // Gets a single parameter 'state' which has the following form:
            // unhandledErrorHandler(error,warn)
    // initializeMainTest - a function run once that can setup things (like a test-specific handler).
        // Gets a single parameter 'mainTestState' which has the following form:
            // unhandledErrorHandler(error,warn) - the error handler for that test
    // getDomain - a function that returns the current domain, or undefined if the environment (*cough* browsers) doesn't have domains
    // getSourceMapObject - a function that returns a future of the pre-parsed source map object for a file, or future undefined
        // gets the parameter:
            // url - the url of the file to find a sourcemap for
            // warningHandler - a warningHandler function that expects an error to be passed to it
    // runTestGroup - a function run that allows you to wrap the actual test run in some way (intended for node.js domains)
        // gets parameters:
            // state - the same state object sent into `initialization`
            // tester - a UnitTester object for the test
            // runTest - the function that you should call to run the test group. Already has a synchronous try catch inside it (so you don't need to worry about that)
            // handleError - a function that handles an error if one comes up. Takes the error as its only parameter. Returns a future.
    // mainTestDone - a function run once a test is done
        // gets the 'mainTestState' parameter
    // defaultUnhandledErrorHandler - a function that handles an error unhandled by any other handler
        // gets the 'error' as its only parameter
    // defaultTestErrorHandler - is passed the current test, and should return a function that handles an error
module.exports = function(options) {

    // a variable that holds changeable state
    var state = {
        unhandledErrorHandler: options.defaultUnhandledErrorHandler
    }

    options.initialize(state)

    // the prototype of objects used to manage accessing and displaying results of a unit test
    var UnitTest = proto(function() {
        this.init = function(/*mainName=undefined, groups*/) {
            var that = this
            var args = arguments
            this.manager = EventManager(this)

            setTimeout(function() {
                runTest.call(that, args)
            },0)
        }

        this.events = function(handlers) {
            this.manager.add(handlers, options.getDomain())
            return this
        }

        this.results = function() {
            return processResults(this)
        }

        // private

        function runTest(args) {
            var fakeTest = new UnitTester()
                fakeTest.id = undefined // fake test doesn't get an id
                fakeTest.manager = this.manager
                fakeTest.timeouts = []
                fakeTest.onDoneCallbacks = []

                var getUnhandledErrorHandler = function() {
                    var unhandledErrorHandler = createUnhandledErrorHandler(fakeTest.mainSubTest)
                    getUnhandledErrorHandler = function() { // memoize this junk
                        return unhandledErrorHandler
                    }
                    return unhandledErrorHandler
                }
                fakeTest.mainTestState = {get unhandledErrorHandler(){return getUnhandledErrorHandler() || options.defaultTestErrorHandler(fakeTest)}}

                var warningInfoMessageHasBeenOutput = false
                fakeTest.warningHandler = function(w) {
                    var errorHandler = getUnhandledErrorHandler()
                    if(warningInfoMessageHasBeenOutput === false) {
                        var warning = newError("You've received at least one warning. If you don't want to treat warnings as errors, use the `warning` method to redefine how to handle them.")
                        errorHandler(warning, false)
                        warningInfoMessageHasBeenOutput = true
                    }

                    errorHandler(w, false)
                }

                options.initializeMainTest(fakeTest.mainTestState, fakeTest)

                timeout(fakeTest, 3000, true) // initial (default) timeout
                fakeTest.onDone = function() { // will execute when this test is done
                    fakeTest.manager.lastEmitFuture.then(function() { // wait for all the already-registered emits to emit before finalizing the test
                        done(fakeTest)
                        options.mainTestDone(fakeTest.mainTestState)
                    }).done()
                }
                fakeTest.callOnDone = function(cb) {
                    fakeTest.onDoneCallbacks.push(cb)
                }

            UnitTester.prototype.test.apply(fakeTest, args) // set so the error handler can access the real test
            this.mainTester = fakeTest

            fakeTest.groupEnded = true
            checkGroupDone(fakeTest)
        }
    })

    var EventManager = proto(function() {

        this.init = function(testObject) {
            this.handlers = {
                group: [],
                assert: [],
                count: [],
                exception: [],
                log: [],
                end: [],
                groupEnd: [],
                before: [],
                after: [],
                beforeEnd: [],
                afterEnd: []
            }

            this.history = []
            this.emitDepth = 0 // records how many futures are waiting on eachother, so we can make sure maximum stack depth isn't exceeded
            this.lastEmitFuture = Future(undefined)
            this.testObject = testObject
        }

        this.testObject; // used to get the right warningHandler

        // emits an event
        // eventDataFuture resolves to either an eventData object, or undefined if nothing should be emitted
        this.emit = function(type, eventDataFuture) {
            var that = this
            var lastEmitFuture = that.lastEmitFuture // capture it for the possible setTimeout threadlet
            var doStuff = function(f) {
                var resultFuture = lastEmitFuture.then(function() {
                    return eventDataFuture
                }).then(function(eventData){
                    if(eventData !== undefined)
                        recordAndTriggerHandlers.call(that, type, eventData)
                }).catch(function(e) {
                    that.testObject.warningHandler(e)
                })

                if(f !== undefined) {
                    resultFuture.finally(function() {
                        setTimeout(function(){f.return()},0) // make sure we don't get a "too much recursion error" // todo: test not doing this once browsers all support proper tail calls
                    })
                    return f
                } else {
                    return resultFuture
                }
            }

            this.emitDepth++
            if(this.emitDepth % 50 === 0) {
                that.lastEmitFuture = doStuff(new Future)
            } else {
                that.lastEmitFuture = doStuff()
            }

            return this.lastEmitFuture
        }

        // adds a set of listening handlers to the event stream, and runs those handlers on the stream's history
        // domain is optional, but if defined will be the node.js domain that unhandled errors will be routed to
        this.add = function(handlers, domain) {
            // run the history of events on the the handlers
            this.history.forEach(function(e) {
                if(handlers[e.type] !== undefined) {
                    handlers[e.type].call(undefined, e.data)
                }
            })

            // then have those handlers listen on future events
            for(var type in handlers) {
                var typeHandlers = this.handlers[type]
                if(typeHandlers === undefined) {
                    throw new Error("event type '"+type+"' invalid")
                }

                typeHandlers.push({handler: handlers[type], domain: domain})
            }
        }

        // the synchronous part of emitting
        function recordAndTriggerHandlers(type, eventData) {
            this.history.push({type:type, data: eventData})
            this.handlers[type].forEach(function(handlerInfo) {
                try {
                    handlerInfo.handler.call(undefined, eventData)
                } catch(e) {

                    var throwErrorFn = function() {
                        throw e // throw error asynchronously because these error should be separate from the test exceptions
                    }

                    if(handlerInfo.domain) {
                        throwErrorFn = handlerInfo.domain.bind(throwErrorFn)    // this domain bind is needed because emit is done inside deadunit's test domain, which isn't where we want to put errors caused by the event handlers
                    }

                    setTimeout(throwErrorFn, 0)
                }
            })
        }
    })

    function testGroup(tester, test) {

        // handles any error (synchronous or asynchronous errors)
        var handleError = createUnhandledErrorHandler(tester)

        var runTest = function() {
            try {
                test.call(tester, tester) // tester is both 'this' and the first parameter (for flexibility)
            } catch(e) {
                handleError(e, true).done()
            }
         }

        options.runTestGroup(state, tester, runTest, handleError)
    }

    function createUnhandledErrorHandler(tester) {

        var handleErrorInErrorHandler = function(warn, newError) {
            if(warn !== false) {
                try {
                    tester.warningHandler(newError)
                } catch(warningHandlerError) {
                    tester.manager.emit('exception', Future(warningHandlerError)).done() // if shit gets this bad, that sucks
                }
            } else {
                console.error(newError)
            }
        }

        // warn should be set to false if the handler is being called to report a warning
        return function(e, warn) {
            if(tester.unhandledErrorHandler !== undefined) {
                try {
                    tester.unhandledErrorHandler(e)
                    return Future(undefined)

                } catch(newError) {     // error handler had an error...
                    handleErrorInErrorHandler(warn, newError)
                }
            }
            // else

            var errorToEmit = mapException(e, tester.warningHandler).catch(function(newError) {
                if(newError.message !== "Accessing the 'caller' property of a function or arguments object is not allowed in strict mode") { // stacktrace.js doesn't support IE for certain things
                    handleErrorInErrorHandler(warn, newError)
                }
                return Future(e) // use the original unmapped exception

            }).then(function(exception){
                return Future(exceptionEmitData(tester,exception))
            })

            var emitFuture = tester.manager.emit('exception', errorToEmit)
            return afterWaitingEmitIsComplete(tester, emitFuture)

        }
    }

    function exceptionEmitData(tester, e) {
        return {
            parent: tester.id,
            time: now(),
            error: e
        }
    }


    // the prototype of objects used to write tests and contain the results of tests
    var UnitTester = function(name, mainTester) {
        if(!mainTester) mainTester = this

        this.id = groupid()
        this.mainTester = mainTester // the mainTester is used to easily figure out if the test results have been accessed (so early accesses can be detected)
        this.name = name

        this.doneTests = 0
        this.doneAsserts = 0
        this.runningTests = 0 // the number of subtests created synchronously
        this.doneCalled = false
        this.doSourcemappery = true // whether to do source mapping, if possible, within this test
    }

        UnitTester.prototype = {
            test: function() {
                if(arguments.length === 1) {
                    var test = arguments[0]

                // named test
                } else {
                    var name = arguments[0]
                    var test = arguments[1]
                }

                var that = this
                this.runningTests++

                var tester = new UnitTester(name, this.mainTester)
                tester.manager = this.manager
                tester.doSourcemappery = this.doSourcemappery // inherit from parent test
                tester.warningHandler = this.warningHandler

                if(this.id === undefined) { // ie its the top-level fake test
                    this.mainSubTest = tester
                }

                tester.onDone = function() { // will execute when this test is done
                    that.doneTests += 1

                    that.manager.emit('groupEnd', Future({
                        id: tester.id,
                        time: now()
                    }))

                    checkGroupDone(that)
                }

                tester.mainTester.callOnDone(function() {
                    if(!tester.doneCalled) { // a timeout happened - end the test
                        tester.doneCalled = true
                        that.manager.emit('groupEnd', Future({
                            id: tester.id,
                            time: now()
                        }))
                    }
                })

                this.manager.emit('group', Future({
                    id: tester.id,
                    parent: this.id,
                    name: name,
                    time: now()
                }))

                if(this.beforeFn) {
                    this.manager.emit('before', Future({
                        parent: tester.id,
                        time: now()
                    }))

                    this.beforeFn.call(this, this)

                    this.manager.emit('beforeEnd', Future({
                        parent: tester.id,
                        time: now()
                    }))
                }

                testGroup(tester, test)

                if(this.afterFn) {
                    this.manager.emit('after', Future({
                        parent: tester.id,
                        time: now()
                    }))

                    this.afterFn.call(this, this)

                    this.manager.emit('afterEnd', Future({
                        parent: tester.id,
                        time: now()
                    }))
                }

                tester.groupEnded = true
                checkGroupDone(tester)

                return tester
            },

            ok: function(success, actualValue, expectedValue) {
                this.doneAsserts += 1
                afterWaitingEmitIsComplete(this, assert(this, success, actualValue, expectedValue, 'assert', "ok")).done()
            },
            eq: function(actualValue, expectedValue) {
                this.doneAsserts += 1
                afterWaitingEmitIsComplete(this, assert(this, expectedValue === actualValue, actualValue, expectedValue, 'assert', "eq")).done()
            },
            count: function(number) {
                if(this.countExpected !== undefined)
                    throw Error("count called multiple times for this test")
                this.countExpected = number

                afterWaitingEmitIsComplete(this,assert(this, undefined, undefined, number, 'count', "count")).done()
            },

            before: function(fn) {
                if(this.beforeFn !== undefined)
                    throw Error("before called multiple times for this test")

                this.beforeFn = fn
            },
            after: function(fn) {
                if(this.afterFn !== undefined)
                    throw Error("after called multiple times for this test")

                this.afterFn = fn
            },

            log: function(/*arguments*/) {
                this.manager.emit('log', Future({
                    parent: this.id,
                    time: now(),
                    values: Array.prototype.slice.call(arguments, 0)
                }))
            },

            timeout: function(t) {
                timeout(this, t, false)
            },

            error: function(handler) {
                this.unhandledErrorHandler = handler
            },
            warning: function(handler) {
                this.warningHandler = handler
            },

            sourcemap: function(doSourcemappery) {
                this.doSourcemappery = doSourcemappery
            }
        }

    function afterWaitingEmitIsComplete(that, assertFuture) {
        return assertFuture.finally(function() {
            checkGroupDone(that)
        })
    }

    function checkGroupDone(group) {
        if(!group.doneCalled && group.groupEnded === true
            && ((group.countExpected === undefined || group.countExpected <= group.doneAsserts+group.doneTests)
                && group.runningTests === group.doneTests)
        ) {
            group.doneCalled = true // don't call twice
            group.onDone()
        }

    }

    function done(unitTester) {
        if(unitTester.mainTester.ended) {
            unitTester.mainTester.manager.emit('exception', Future({
                parent: unitTester.mainTester.mainSubTest.id,
                time: now(),
                error: newError("done called more than once (probably because the test timed out before it finished)")
            }))
        } else {
            unitTester.mainTester.timeouts.forEach(function(to) {
                clearTimeout(to)
            })
            unitTester.mainTester.timeouts = []

            endTest(unitTester, 'normal')
        }
    }

    // if a timeout is the default, it can be overridden
    function timeout(unitTester, t, theDefault) {
        var timeouts = unitTester.mainTester.timeouts

        var to = setTimeout(function() {
            remove(timeouts, to)

            if(timeouts.length === 0 && !unitTester.mainTester.ended) {
                endTest(unitTester.mainTester, 'timeout')
            }
        }, t)

        timeouts.push(to)

        if(theDefault) {
            timeouts.default = to
        } else if(timeouts.default !== undefined) {
            clearTimeout(timeouts.default)
            remove(timeouts, timeouts.default)
            timeouts.default = undefined
        }

        function remove(array, item) {
            var index = array.indexOf(item)
            if(index === -1)
                throw Error("Item doesn't exist to remove")
            array.splice(index, 1)
        }
    }

    function endTest(that, type) {
        that.mainTester.ended = true

        if(that.mainTester === that) { // if its the main tester
            that.onDoneCallbacks.forEach(function(cb) {
                cb()
            })
        }

        setTimeout(function() { // setTimeout here is to make it so the currently running threadlet that caused the test to end can finish before the end event is sent
            that.manager.emit('end', Future({
                type: type,
                time: now()
            }))
        },0)
    }

    function assert(that, success, actualValue, expectedValue, type, functionName/*="ok"*/, lineInfo/*=dynamic*/, stackIncrease/*=0*/) {
        if(!stackIncrease) stackIncrease = 1
        if(!functionName) functionName = "ok"
        if(!lineInfo)
            var lineInfoFuture = getLineInformation(functionName, stackIncrease, that.doSourcemappery, that.warningHandler)
        else
            var lineInfoFuture = Future(lineInfo)

        var emitData = lineInfoFuture.then(function(lineInfo) {
            var result = lineInfo
            result.type = 'assert'
            result.success = success

            if(actualValue !== undefined)     result.actual = actualValue
            if(expectedValue !== undefined)   result.expected = expectedValue

            result.parent = that.id
            result.time = now()

           return Future(result)
        })

        return that.manager.emit(type, emitData)
    }


    function getLineInformation(functionName, stackIncrease, doSourcemappery, warningHandler) {
        var info = options.getLineInfo(stackIncrease)

        var file, line, column;

        return getSourceMapConsumer(info.file, warningHandler).catch(function(e){
            warningHandler(e)
            return Future(undefined)

        }).then(function(sourceMapConsumer) {
            if(sourceMapConsumer !== undefined && doSourcemappery) {

                var mappedInfo = getMappedSourceInfo(sourceMapConsumer, info.file, info.line, info.column)
                file = mappedInfo.file
                line = mappedInfo.line
                column = mappedInfo.column

                var multiLineSearch = !mappedInfo.usingOriginalFile // don't to a multi-line search if the source has been mapped (the file might not be javascript)
                return getFunctionCallLines(mappedInfo.file, functionName, mappedInfo.line, multiLineSearch, warningHandler)

            } else {
                file = info.file
                line = info.line
                column = info.column
                return getFunctionCallLines(file, functionName, line, true, warningHandler)
            }
        }).catch(function(e) {
            warningHandler(e)
            return Future("<source not available>")
        }).then(function(sourceLines) {
            return Future({
                sourceLines: sourceLines,
                file: path.basename(file),
                line: line,
                column: column
            })
        })
    }

    // returns the line, column, and filename mapped from a source map
    // appropriately handles cases where some information is missing
    function getMappedSourceInfo(sourceMapConsumer, originalFilePath, originalLine, originalColumn, originalFunctionName) {
        var sourceMapInfo = sourceMapConsumer.originalPositionFor({line:originalLine, column:originalColumn||0})       // the 0 is for browsers (like firefox) that don't output column numbers
        var line = sourceMapInfo.line
        var column = sourceMapInfo.column
        var fn = sourceMapInfo.name

        if(sourceMapInfo.source !== null) {
            var relative = isRelative(sourceMapInfo.source)

            if(sourceMapConsumer.sourceRoot !== null) {
                sourceMapInfo.source = sourceMapInfo.source.replace(sourceMapConsumer.sourceRoot, '') // remove sourceRoot (todo: quesion: is this the right thing to do? See https://github.com/webpack/webpack/issues/238)
            }

            if(relative) {
                var file = Url.resolve(originalFilePath, path.basename(sourceMapInfo.source))
            } else {
                var file = sourceMapInfo.source
            }


            var originalFile = true
        } else {
            var file = originalFilePath
            var originalFile = false
        }

        if(fn === null || !originalFile) {
            fn = originalFunctionName
        }
        if(line === null || !originalFile) {
            line = originalLine
            column = originalColumn
        }
        if(column === null) {
            column = undefined
        }

        return {
            file: file,
            function: fn,
            line: line,
            column: column,
            usingOriginalFile: originalFile
        }
    }

    // gets the actual lines of the call
    // if multiLineSearch is true, it finds
    function getFunctionCallLines(filePath, functionName, lineNumber, multiLineSearch, warningHandler) {
        return options.getScriptSourceLines(filePath).catch(function(e) {
            warningHandler(e)
            return Future(undefined)

        }).then(function(fileLines) {
            if(fileLines !== undefined) {

                var startLine = findStartLine(fileLines, functionName, lineNumber)
                if(startLine === 'lineOfCodeNotFound') {
                    return Future("<line of code not found (possibly an error?)> ")

                } else if(startLine !== 'sourceNotAvailable') {
                    if(multiLineSearch) {
                        return Future(findFullSourceLine(fileLines, startLine))
                    } else {
                        return Future(fileLines[startLine].trim())
                    }
                }
            }
            // else
            return Future("<source not available>")

        })
    }

    var sourceMapConsumerCache = {} // a map from a script url to a future of its SourceMapConsumer object (null means no sourcemap exists)
    function getSourceMapConsumer(url, warningHandler) {
        if(sourceMapConsumerCache[url] === undefined) {
            try {
                sourceMapConsumerCache[url] = options.getSourceMapObject(url, warningHandler).then(function(sourceMapObject) {
                    if(sourceMapObject !== undefined) {
                        if(sourceMapObject.version === undefined) {
                            warningHandler(new Error("Sourcemap for "+url+" doesn't contain the required 'version' property. Assuming version 2."))
                            sourceMapObject.version = 2 // assume version 2 to make browserify's broken sourcemap format that omits the version
                        }
                        return Future(new SourceMapConsumer(sourceMapObject))
                    } else {
                        return Future(undefined)
                    }
                })
            } catch(e) {
                sourceMapConsumerCache[url] = Future(undefined)
                warningHandler(e)
            }
        }

        return sourceMapConsumerCache[url]
    }

    // takes an exception and returns a future exception that has a stacktrace with sourcemapped tracelines
    function mapException(exception, warningHandler) {
        try {
            if(exception instanceof Error) {
                var trace = options.getExceptionInfo(exception)
                var smcFutures = []
                for(var n=0; n<trace.length; n++) {
                    if(trace[n].file !== undefined) {
                        smcFutures.push(getSourceMapConsumer(trace[n].file, warningHandler))
                    } else {
                        smcFutures.push(Future(undefined))
                    }
                }

                return Future.all(smcFutures).then(function(sourceMapConsumers) {
                    var CustomMappedException = proto(MappedException, function() {
                        // set the name so it looks like the original exception when printed
                        // this subclasses MappedException so that name won't be an own-property
                        this.name = exception.name
                    })

                    try {
                        throw CustomMappedException(exception, trace, sourceMapConsumers)  // IE doesn't give exceptions stack traces unless they're actually thrown
                    } catch(mappedExcetion) {
                        return Future(mappedExcetion)
                    }
                })
            } else {
                return Future(exception)
            }
        } catch(e) {
            var errorFuture = new Future
            errorFuture.throw(e)
            return errorFuture
        }
    }

    // an exception where the stacktrace's files and lines are mapped to the original file (when applicable)
    var MappedException = proto(Error, function(superclass) {

        // constructor. Takes the parameters:
            // originalError
            // traceInfo - an array where each element is an object containing information about that stacktrace line
            // sourceMapConsumers - an array of the same length as traceInfo where each element is the sourcemap consumer for the corresponding info in traceInfo
        this.init = function(originalError, traceInfo, sourceMapConsumers) {
            superclass.call(this, originalError.message)

            for(var p in originalError) {
                if(Object.hasOwnProperty.call(originalError, p)) {
                    this[p] = originalError[p]
                }
            }

            var newTraceLines = []
            for(var n=0; n<traceInfo.length; n++) {
                var info = traceInfo[n]
                if(sourceMapConsumers[n] !== undefined) {
                    info = getMappedSourceInfo(sourceMapConsumers[n], info.file, info.line, info.column, info.function)
                }

                var fileLineColumn = info.line
                if(info.column !== undefined) {
                    fileLineColumn += ':'+info.column
                }
                if(info.file !== undefined) {
                    fileLineColumn = info.file+':'+fileLineColumn
                }

                var traceLine = "    at "
                if(info.function !== undefined) {
                    traceLine += info.function+' ('+fileLineColumn+')'
                } else {
                    traceLine += fileLineColumn
                }

                newTraceLines.push(traceLine)
            }

            this.stack = this.name+': '+this.message+'\n'+newTraceLines.join('\n')
        }
    })

    // attempts to find the full function call expression (over multiple lines) given the sources lines and a starting point
    function findFullSourceLine(fileLines, startLine) {
        var lines = []
        var parenCount = 0
        var mode = 0 // mode 0 for paren searching, mode 1 for double-quote searching, mode 2 for single-quote searching
        var lastWasBackslash = false // used for quote searching
        for(var n=startLine; true; n++) {
            var line = fileLines[n]
            lines.push(line.trim())

            for(var i=0; i<line.length; i++) {
                var c = line[i]

                if(mode === 0) {
                    if(c === '(') {
                        parenCount++
                        //if(parenCount === 0) {
                          //  return lines.join('\n') // done
                        //}
                    } else if(c === ')' && parenCount > 0) {
                        parenCount--
                        if(parenCount === 0) {
                            return lines.join('\n') // done
                        }
                    } else if(c === '"') {
                        mode = 1
                    } else if(c === "'") {
                        mode = 2
                    }
                } else if(mode === 1) {
                    if(c === '"' && !lastWasBackslash) {
                        mode = 0
                    }

                    lastWasBackslash = c==='\\'
                } else { // mode === 2
                    if(c === "'" && !lastWasBackslash) {
                        mode = 0
                    }

                    lastWasBackslash = c==='\\'
                }
            }
        }

        return lines.join('\n') // if it gets here, something minor went wrong
    }

    // finds the line a function started on given the file's lines, and the stack trace line number (and function name)
    // returns undefined if something went wrong finding the startline
    function findStartLine(fileLines, functionName, lineNumber) {
        var startLine = lineNumber - 1
        while(true) {
            if(startLine < 0) {
                return 'lineOfCodeNotFound' // something went wrong if this is being returned (the functionName wasn't found above - means you didn't get the function name right)
            }

            var line = fileLines[startLine]
            if(line === undefined) {
                return 'sourceNotAvailable'
            }

            //lines.push(line.trim())
            var containsFunction = line.indexOf(functionName) !== -1
            if(containsFunction) {
                return startLine
            }

            startLine--
        }
    }

    function groupid() {
        groupid.next++
        return groupid.next
    }
    groupid.next = -1

    // returns a Unix Timestamp for now
    function now() {
        return (new Date()).getTime()
    }

    return {
        test: UnitTest
    }
}

function newError(message, ErrorPrototype) {
    try {
        throw new Error(message) // IE needs an exception to be actually thrown to get a stack trace property
    } catch(e) {
        return e
    }
}
},{"./isRelative":4,"./processResults":35,"async-future":8,"path":11,"proto":17,"source-map":21,"url":16}],4:[function(_dereq_,module,exports){
var path = _dereq_('path')

module.exports = function isRelative(p) {
    var normal = path.normalize(p)
    var absolute = path.resolve(p)
    return normal != absolute && p.indexOf('://') === -1// second part for urls
}
},{"path":11}],5:[function(_dereq_,module,exports){
var Future = _dereq_("async-future")

// returns the XHR function or equivalent for use with ajax
// memoizes the function for faster repeated use
var createXMLHTTPObject = function() {
    var versions = ["Msxml2.XMLHTTP",
                    "Msxml3.XMLHTTP",
                    "Microsoft.XMLHTTP",
                    "MSXML2.XmlHttp.6.0",
                    "MSXML2.XmlHttp.5.0",
                    "MSXML2.XmlHttp.4.0",
                    "MSXML2.XmlHttp.3.0",
                    "MSXML2.XmlHttp.2.0"
    ]

    if(XMLHttpRequest !== undefined) {  // For non-IE browsers
        createXMLHTTPObject = function() {  // Use memoization to cache the factory
            return new XMLHttpRequest()
        }
        return createXMLHTTPObject()

    } else { // IE
        for(var i=0, n=versions.length; i<n; i++) {
            try {
                var version = versions[i]
                var fn = function() {
                    return new ActiveXObject(version)
                }
                createXMLHTTPObject = fn   // Use memoization to cache the factory
                return createXMLHTTPObject()

            } catch(e) {   }
        }
    }

    throw new Error('Cant get XmlHttpRequest object')
}



var HEADER = "([^\\s]+): (.*)"

// returns the contents and headers from a given URL
exports = module.exports = function(url) {
    if(getFromCache(url))
        return getFromCache(url)

    var futureResult = new Future
    setOnCache(url, futureResult)

    var req = createXMLHTTPObject()
    req.onreadystatechange = function() {
        if( req.readyState === 4 ) {
            if( req.status === 200 ) {
                var headers = {}
                req.getAllResponseHeaders().split('\n').forEach(function(line) {
                    var match = line.match(HEADER)
                    if(match !== null) {
                        var name = match[1]
                        var value = match[2]

                        headers[name] = value
                    }
                })

                futureResult.return({text: req.responseText, headers: headers})

            } else {
                var error = new Error('Error in request: Status '+req.status)
                error.status = req.status
                futureResult.throw(error)
            }
        }
    }

    req.onerror = function(e) {
        futureResult.throw(e)
    }


    req.open('GET', url, asynchronous)
    try {
        req.send()
    } catch(e) {
        futureResult.throw(e)
    }

    return futureResult
}

var cache = {}
var getFromCache = function(url) {
    return cache[url]
}
var setOnCache = function(url, futureResponse) {
    cache[url] = futureResponse
}

var asynchronous = true
exports.setSynchronous = function(synchronous) { // this is here so I can work around this bug in chrome: https://code.google.com/p/chromium/issues/detail?id=368444
    asynchronous = !synchronous
}

exports.cacheGet = function(fn) {
    getFromCache = fn
}
exports.cacheSet = function(fn) {
    setOnCache = fn
}
},{"async-future":6}],6:[function(_dereq_,module,exports){
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var trimArgs = _dereq_("trimArguments")


module.exports = Future

Future.debug = false // switch this to true if you want ids and long stack traces

var curId = 0         // for ids\
function Future(value) {
	if(arguments.length > 0) {
		var f = new Future()
        f.return(value)
        return f
	} else {
        this.isResolved = false
        this.queue = []
        if(Future.debug) {
            curId++
            this.id = curId
        }
    }
}

// static methods

// has one parameter: either a bunch of futures, or a single array of futures
// returns a promise that resolves when one of them errors, or when all of them succeeds
Future.all = function() {
    if(arguments[0] instanceof Array) {
        var futures = arguments[0]
    } else {
        var futures = trimArgs(arguments)
    }

    var f = new Future()
    var results = []

    if(futures.length > 0) {
        var current = futures[0]
        futures.forEach(function(future, index) {
            current = current.then(function(v) {
                results[index] = v
                return futures[index+1]
            })
        })

        //if
        current.catch(function(e) {
            f.throw(e)
        })
        // else
        current.then(function() {
            f.return(results)
        })


    } else {
        f.return(results)
    }

    return f
}

// either used like futureWrap(function(){ ... })(arg1,arg2,etc) or
//  futureWrap(object, 'methodName')(arg1,arg2,etc)
Future.wrap = function() {
    // function
    if(arguments.length === 1) {
        var fn = arguments[0]
        var object = undefined


    // object, function
    } else {
        var object = arguments[0]
        var fn = object[arguments[1]]
    }

    return function() {
        var args = Array.prototype.slice.call(arguments)
        var future = new Future
        args.push(future.resolver())
        var me = this
        if(object) me = object
        fn.apply(me, args)
        return future
    }
}


// default
var unhandledErrorHandler = function(e) {
    setTimeout(function() {
        throw e
    },0)
}

// setup unhandled error handler
// unhandled errors happen when done is called, and  then an exception is thrown from the future
Future.error = function(handler) {
    unhandledErrorHandler = handler
}

// instance methods

// returns a value for the future (can only be executed once)
// if there are callbacks waiting on this value, they are run in the next tick
    // (ie they aren't run immediately, allowing the current thread of execution to complete)
Future.prototype.return = function(v) {
    resolve(this, 'return', v)
}
Future.prototype.throw = function(e) {
    resolve(this, 'error', e)
}

function setNext(that, future) {
    if(future !== undefined && !isLikeAFuture(future) )
        throw Error("Value returned from then or catch *not* a Future: "+future)

    resolve(that, 'next', future)
}

function wait(that, cb) {
    if(that.isResolved) {
        executeCallbacks(that, [cb])
    } else {
        that.queue.push(cb)
    }
}

// duck typing to determine if something is or isn't a future
function isLikeAFuture(x) {
    return x.isResolved !== undefined && x.queue !== undefined && x.then !== undefined
}

function waitOnResult(f, result, cb) {
    wait(result, function() {
        if(this.hasError) {
            f.throw(this.error)
        } else if(this.hasNext) {
            waitOnResult(f, this.next, cb)
        } else {
            try {
                setNext(f, cb(this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
}


// cb takes one parameter - the value returned
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.then = function(cb) {
    var f = new Future
    wait(this, function() {
        if(this.hasError)
            f.throw(this.error)
        else if(this.hasNext)
            waitOnResult(f, this.next, cb)
        else {
            try {
                setNext(f, cb(this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
    return f
}
// cb takes one parameter - the error caught
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.catch = function(cb) {
    var f = new Future
    wait(this, function() {
        if(this.hasError) {
            try {
                setNext(f, cb(this.error))
            } catch(e) {
                f.throw(e)
            }
        } else if(this.hasNext) {
            this.next.then(function(v) {
                f.return(v)
            }).catch(function(e) {
                setNext(f, cb(e))
            })
        } else {
            f.return(this.result)
        }
    })
    return f
}
// cb takes no parameters
// callback's return value is ignored, but thrown exceptions propogate normally
Future.prototype.finally = function(cb) {
    var f = new Future
    wait(this, function() {
        try {
            var that = this
            if(this.hasNext) {
                this.next.then(function(v) {
                    var x = cb()
                    f.return(v)
                    return x
                }).catch(function(e) {
                    var x = cb()
                    f.throw(e)
                    return x
                }).done()
            } else if(this.hasError) {
                Future(true).then(function() {
                    return cb()
                }).then(function() {
                    f.throw(that.error)
                }).catch(function(e) {
                    f.throw(e)
                }).done()

            } else  {
                Future(true).then(function() {
                    return cb()
                }).then(function() {
                    f.return(that.result)
                }).catch(function(e) {
                    f.throw(e)
                }).done()
            }
        } catch(e) {
            f.throw(e)
        }
    })
    return f
}

// all unused futures should end with this (e.g. most then-chains)
// detatches the future so any propogated exception is thrown (so the exception isn't silently lost)
Future.prototype.done = function() {
    wait(this, function() {
        if(this.hasError) {
            unhandledErrorHandler(this.error)
        } else if(this.hasNext) {
            this.next.catch(function(e) {
                unhandledErrorHandler(e)
            })
        }
    })
}



Future.prototype.resolver = function() {
    var me = this

    return function(e,v) {
        if(e) { // error argument
            me.throw(e)
        } else {
            me.return(v)
        }
    }
}

Future.prototype.resolved = function() {
    return this.isResolved
}


function resolve(that, type, value) {
    if(that.isResolved)
        throw Error("Future resolved more than once! Resolution: "+value)

    that.isResolved = true
    that.hasError = type === 'error'
    that.hasNext = type === 'next' && value !== undefined

    if(that.hasError)
        that.error = value
    else if(that.hasNext)
        that.next = value
    else
        that.result = value

    executeCallbacks(that, that.queue)
}

function executeCallbacks(that, callbacks) {
    if(callbacks.length > 0) {
        setTimeout(function() {
            callbacks.forEach(function(cb) {
                cb.apply(that)
            })
        },0)
    }
}

},{"trimArguments":7}],7:[function(_dereq_,module,exports){
// resolves varargs variable into more usable form
// args - should be a function arguments variable
// returns a javascript Array object of arguments that doesn't count trailing undefined values in the length
module.exports = function(theArguments) {
    var args = Array.prototype.slice.call(theArguments, 0)

    var count = 0;
    for(var n=args.length-1; n>=0; n--) {
        if(args[n] === undefined)
            count++
    }
    args.splice(-0, count)
    return args
}
},{}],8:[function(_dereq_,module,exports){
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var trimArgs = _dereq_("trimArguments")


module.exports = Future

Future.debug = false // switch this to true if you want ids and long stack traces

var curId = 0         // for ids\
function Future(value) {
	if(arguments.length > 0) {
		var f = new Future()
        f.return(value)
        return f
	} else {
        this.isResolved = false
        this.queue = []
        if(Future.debug) {
            curId++
            this.id = curId
        }
    }
}

// static methods

// has one parameter: either a bunch of futures, or a single array of futures
// returns a promise that resolves when one of them errors, or when all of them succeeds
Future.all = function() {
    if(arguments[0] instanceof Array) {
        var futures = arguments[0]
    } else {
        var futures = trimArgs(arguments)
    }

    var f = new Future()
    var results = []

    if(futures.length > 0) {
        var current = futures[0]
        futures.forEach(function(future, index) {
            current = current.then(function(v) {
                results[index] = v
                return futures[index+1]
            })
        })

        //if
        current.catch(function(e) {
            f.throw(e)
        })
        // else
        current.then(function() {
            f.return(results)
        })


    } else {
        f.return(results)
    }

    return f
}

// either used like futureWrap(function(){ ... })(arg1,arg2,etc) or
//  futureWrap(object, 'methodName')(arg1,arg2,etc)
Future.wrap = function() {
    // function
    if(arguments.length === 1) {
        var fn = arguments[0]
        var object = undefined


    // object, function
    } else {
        var object = arguments[0]
        var fn = object[arguments[1]]
    }

    return function() {
        var args = Array.prototype.slice.call(arguments)
        var future = new Future
        args.push(future.resolver())
        var me = this
        if(object) me = object
        fn.apply(me, args)
        return future
    }
}


// default
var unhandledErrorHandler = function(e) {
    setTimeout(function() {
        throw e
    },0)
}

// setup unhandled error handler
// unhandled errors happen when done is called, and  then an exception is thrown from the future
Future.error = function(handler) {
    unhandledErrorHandler = handler
}

// instance methods

// returns a value for the future (can only be executed once)
// if there are callbacks waiting on this value, they are run in the next tick
    // (ie they aren't run immediately, allowing the current thread of execution to complete)
Future.prototype.return = function(v) {
    resolve(this, 'return', v)
}
Future.prototype.throw = function(e) {
    resolve(this, 'error', e)
}

function setNext(that, future) {
    if(future !== undefined && !isLikeAFuture(future) )
        throw Error("Value returned from then or catch *not* a Future: "+future)

    resolve(that, 'next', future)
}

function wait(that, cb) {
    if(that.isResolved) {
        executeCallbacks(that, [cb])
    } else {
        that.queue.push(cb)
    }
}

// duck typing to determine if something is or isn't a future
var isLikeAFuture = Future.isLikeAFuture = function(x) {
    return x.isResolved !== undefined && x.queue !== undefined && x.then !== undefined
}

function waitOnResult(f, result, cb) {
    wait(result, function() {
        if(this.hasError) {
            f.throw(this.error)
        } else if(this.hasNext) {
            waitOnResult(f, this.next, cb)
        } else {
            try {
                setNext(f, cb(this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
}


// cb takes one parameter - the value returned
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.then = function(cb) {
    var f = new Future
    wait(this, function() {
        if(this.hasError)
            f.throw(this.error)
        else if(this.hasNext)
            waitOnResult(f, this.next, cb)
        else {
            try {
                setNext(f, cb(this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
    return f
}
// cb takes one parameter - the error caught
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.catch = function(cb) {
    var f = new Future
    wait(this, function() {
        if(this.hasError) {
            try {
                setNext(f, cb(this.error))
            } catch(e) {
                f.throw(e)
            }
        } else if(this.hasNext) {
            this.next.then(function(v) {
                f.return(v)
            }).catch(function(e) {
                setNext(f, cb(e))
            })
        } else {
            f.return(this.result)
        }
    })
    return f
}
// cb takes no parameters
// callback's return value is ignored, but thrown exceptions propogate normally
Future.prototype.finally = function(cb) {
    var f = new Future
    wait(this, function() {
        try {
            var that = this
            if(this.hasNext) {
                this.next.then(function(v) {
                    var x = cb()
                    f.return(v)
                    return x
                }).catch(function(e) {
                    var x = cb()
                    f.throw(e)
                    return x
                }).done()
            } else if(this.hasError) {
                Future(true).then(function() {
                    return cb()
                }).then(function() {
                    f.throw(that.error)
                }).catch(function(e) {
                    f.throw(e)
                }).done()

            } else  {
                Future(true).then(function() {
                    return cb()
                }).then(function() {
                    f.return(that.result)
                }).catch(function(e) {
                    f.throw(e)
                }).done()
            }
        } catch(e) {
            f.throw(e)
        }
    })
    return f
}

// all unused futures should end with this (e.g. most then-chains)
// detatches the future so any propogated exception is thrown (so the exception isn't silently lost)
Future.prototype.done = function() {
    wait(this, function() {
        if(this.hasError) {
            unhandledErrorHandler(this.error)
        } else if(this.hasNext) {
            this.next.catch(function(e) {
                unhandledErrorHandler(e)
            })
        }
    })
}



Future.prototype.resolver = function() {
    var me = this

    return function(e,v) {
        if(e) { // error argument
            me.throw(e)
        } else {
            me.return(v)
        }
    }
}

Future.prototype.resolved = function() {
    return this.isResolved
}


function resolve(that, type, value) {
    if(that.isResolved)
        throw Error("Future resolved more than once! Resolution: "+value)

    that.isResolved = true
    that.hasError = type === 'error'
    that.hasNext = type === 'next' && value !== undefined

    if(that.hasError)
        that.error = value
    else if(that.hasNext)
        that.next = value
    else
        that.result = value

    executeCallbacks(that, that.queue)
}

function executeCallbacks(that, callbacks) {
    if(callbacks.length > 0) {
        try {
            callbacks.forEach(function(cb) {
                cb.apply(that)
            })
        } catch(e) {
            unhandledErrorHandler(e)
        }
    }
}
},{"trimArguments":9}],9:[function(_dereq_,module,exports){
module.exports=_dereq_(7)
},{}],10:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],11:[function(_dereq_,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,_dereq_("F:\\billysFile\\code\\javascript\\nodejs\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"))
},{"F:\\billysFile\\code\\javascript\\nodejs\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":10}],12:[function(_dereq_,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],13:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],14:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],15:[function(_dereq_,module,exports){
'use strict';

exports.decode = exports.parse = _dereq_('./decode');
exports.encode = exports.stringify = _dereq_('./encode');

},{"./decode":13,"./encode":14}],16:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = _dereq_('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = _dereq_('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":12,"querystring":15}],17:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var prototypeName='prototype', undefined, protoUndefined='undefined', init='init', ownProperty=({}).hasOwnProperty; // minifiable variables
function proto() {
    var args = arguments // minifiable variables

    if(args.length == 1) {
        var parent = {}
        var prototypeBuilder = args[0]

    } else { // length == 2
        var parent = args[0]
        var prototypeBuilder = args[1]
    }

    // special handling for Error objects
    var namePointer = {}
    if([Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError].indexOf(parent) !== -1) {
        parent = normalizeErrorObject(parent, namePointer)
    }

    // set up the parent into the prototype chain if a parent is passed
    var parentIsFunction = typeof(parent) === "function"
    if(parentIsFunction) {
        prototypeBuilder[prototypeName] = parent[prototypeName]
    } else {
        prototypeBuilder[prototypeName] = parent
    }

    // the prototype that will be used to make instances
    var prototype = new prototypeBuilder(parent)
    prototype.constructor = ProtoObjectFactory;    // set the constructor property on the prototype
    namePointer.name = prototype.name

    // if there's no init, assume its inheriting a non-proto class, so default to applying the superclass's constructor.
    if(!prototype[init] && parentIsFunction) {
        prototype[init] = function() {
            parent.apply(this, arguments)
        }
    }

    // constructor for empty object which will be populated via the constructor
    var F = function() {}
        F[prototypeName] = prototype    // set the prototype for created instances

    function ProtoObjectFactory() {     // result object factory
        var x = new F()                 // empty object

        if(prototype[init]) {
            var result = prototype[init].apply(x, arguments)    // populate object via the constructor
            if(result === proto[protoUndefined])
                return undefined
            else if(result !== undefined)
                return result
            else
                return x
        } else {
            return x
        }
    }

    // add all the prototype properties onto the static class as well (so you can access that class when you want to reference superclass properties)
    for(var n in prototype) {
        try {
            ProtoObjectFactory[n] = prototype[n]
        } catch(e) {
            // do nothing, if a property (like `name`) can't be set, just ignore it
        }
    }

    ProtoObjectFactory[prototypeName] = prototype  // set the prototype on the object factory

    return ProtoObjectFactory;
}

proto[protoUndefined] = {} // a special marker for when you want to return undefined from a constructor

module.exports = proto

function normalizeErrorObject(ErrorObject, namePointer) {
    function NormalizedError() {
        var tmp = new ErrorObject(arguments[0])
        tmp.name = namePointer.name

        this.stack = tmp.stack
        this.message = tmp.message

        return this
    }
        var IntermediateInheritor = function() {}
            IntermediateInheritor.prototype = ErrorObject.prototype
        NormalizedError.prototype = new IntermediateInheritor()
    return NormalizedError
}
},{}],18:[function(_dereq_,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.resolveUrl = factory()
  }
}(this, function() {

  function resolveUrl(/* ...urls */) {
    var numUrls = arguments.length

    if (numUrls === 0) {
      throw new Error("resolveUrl requires at least one argument; got none.")
    }

    var base = document.createElement("base")
    base.href = arguments[0]

    if (numUrls === 1) {
      return base.href
    }

    var head = document.getElementsByTagName("head")[0]
    head.insertBefore(base, head.firstChild)

    var a = document.createElement("a")
    var resolved

    for (var index = 1; index < numUrls; index++) {
      a.href = arguments[index]
      resolved = a.href
      base.href = resolved
    }

    head.removeChild(base)

    return resolved
  }

  return resolveUrl

}));

},{}],19:[function(_dereq_,module,exports){
// Copyright 2014 Simon Lydell

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.sourceMappingURL = factory()
  }
}(this, function(undefined) {

  var innerRegex = /[#@] sourceMappingURL=([^\s'"]*)/
  var newlineRegex = /\r\n?|\n/

  var regex = RegExp(
    "(^|(?:" + newlineRegex.source + "))" +
    "(?:" +
      "/\\*" +
      "(?:\\s*(?:" + newlineRegex.source + ")(?://)?)?" +
      "(?:" + innerRegex.source + ")" +
      "\\s*" +
      "\\*/" +
      "|" +
      "//(?:" + innerRegex.source + ")" +
    ")" +
    "\\s*$"
  )

  function SourceMappingURL(commentSyntax) {
    this._commentSyntax = commentSyntax
  }

  SourceMappingURL.prototype.regex = regex
  SourceMappingURL.prototype._innerRegex = innerRegex
  SourceMappingURL.prototype._newlineRegex = newlineRegex

  SourceMappingURL.prototype.get = function(code) {
    var match = code.match(this.regex)
    if (!match) {
      return null
    }
    return match[2] || match[3] || ""
  }

  SourceMappingURL.prototype.set = function(code, url, commentSyntax) {
    if (!commentSyntax) {
      commentSyntax = this._commentSyntax
    }
    // Use a newline present in the code, or fall back to '\n'.
    var newline = String(code.match(this._newlineRegex) || "\n")
    var open = commentSyntax[0], close = commentSyntax[1] || ""
    code = this.remove(code)
    return code + newline + open + "# sourceMappingURL=" + url + close
  }

  SourceMappingURL.prototype.remove = function(code) {
    return code.replace(this.regex, "")
  }

  SourceMappingURL.prototype.insertBefore = function(code, string) {
    var match = code.match(this.regex)
    if (match) {
      var hasNewline = Boolean(match[1])
      return code.slice(0, match.index) +
        string +
        (hasNewline ? "" : "\n") +
        code.slice(match.index)
    } else {
      return code + string
    }
  }

  SourceMappingURL.prototype.SourceMappingURL = SourceMappingURL

  return new SourceMappingURL(["/*", " */"])

}));

},{}],20:[function(_dereq_,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

// Note: source-map-resolve.js is generated from source-map-resolve-node.js and
// source-map-resolve-template.js. Only edit the two latter files, _not_
// source-map-resolve.js!

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(["source-map-url", "resolve-url"], factory)
  } else if (typeof exports === "object") {
    var sourceMappingURL = _dereq_("source-map-url")
    var resolveUrl = _dereq_("resolve-url")
    module.exports = factory(sourceMappingURL, resolveUrl)
  } else {
    root.sourceMapResolve = factory(root.sourceMappingURL, root.resolveUrl)
  }
}(this, function(sourceMappingURL, resolveUrl) {

  function callbackAsync(callback, error, result) {
    setImmediate(function() { callback(error, result) })
  }

  function sig(name, codeOrMap, url, read, callback) {
    var type = (name.indexOf("Sources") >= 0 ? "map" : "code")

    var throwError = function(num, what, got) {
      throw new Error(
        name + " requires argument " + num + " to be " + what + ". Got:\n" + got
      )
    }

    if (type === "map") {
      if (typeof codeOrMap !== "object" || codeOrMap === null) {
        throwError(1, "a source map", codeOrMap)
      }
    } else {
      if (typeof codeOrMap !== "string") {
        throwError(1, "some code", codeOrMap)
      }
    }
    if (typeof url !== "string") {
      throwError(2, "the " + type + " url", url)
    }
    if (typeof read !== "function") {
      throwError(3, "a reading function", read)
    }
    if (arguments.length === 1 + 4 && typeof callback !== "function") {
      throwError(4, "a callback function", callback)
    }
  }

  function parseMapToJSON(string) {
    return JSON.parse(string.replace(/^\)\]\}'/, ""))
  }



  function resolveSourceMap(code, codeUrl, read, callback) {
    sig("resolveSourceMap", code, codeUrl, read, callback)
    var mapData
    try {
      mapData = resolveSourceMapHelper(code, codeUrl)
    } catch (error) {
      return callbackAsync(callback, error)
    }
    if (!mapData || mapData.map) {
      return callbackAsync(callback, null, mapData)
    }
    read(mapData.url, function(error, result) {
      if (error) {
        return callback(error)
      }
      try {
        mapData.map = parseMapToJSON(String(result))
      } catch (error) {
        return callback(error)
      }
      callback(null, mapData)
    })
  }

  function resolveSourceMapSync(code, codeUrl, read) {
    sig("resolveSourceMapSync", code, codeUrl, read)
    var mapData = resolveSourceMapHelper(code, codeUrl)
    if (!mapData || mapData.map) {
      return mapData
    }
    mapData.map = parseMapToJSON(String(read(mapData.url)))
    return mapData
  }

  var dataUriRegex = /^data:([^,;]*)(;[^,;]*)*(?:,(.*))?$/
  var jsonMimeTypeRegex = /^(?:application|text)\/json$/

  function resolveSourceMapHelper(code, codeUrl) {
    var url = sourceMappingURL.get(code)
    if (!url) {
      return null
    }

    var dataUri = url.match(dataUriRegex)
    if (dataUri) {
      var mimeType = dataUri[1]
      var lastParameter = dataUri[2]
      var encoded = dataUri[3]
      if (!jsonMimeTypeRegex.test(mimeType)) {
        throw new Error("Unuseful data uri mime type: " + (mimeType || "text/plain"))
      }
      return {
        sourceMappingURL: url,
        url: null,
        sourcesRelativeTo: codeUrl,
        map: parseMapToJSON(lastParameter === ";base64" ? atob(encoded) : decodeURIComponent(encoded))
      }
    }

    var mapUrl = resolveUrl(codeUrl, url)
    return {
      sourceMappingURL: url,
      url: mapUrl,
      sourcesRelativeTo: mapUrl,
      map: null
    }
  }



  function resolveSources(map, mapUrl, read, callback) {
    sig("resolveSources", map, mapUrl, read, callback)
    var pending = map.sources.length
    var errored = false
    var sources = []

    var done = function(error) {
      if (errored) {
        return
      }
      if (error) {
        errored = true
        return callback(error)
      }
      pending--
      if (pending === 0) {
        callback(null, sources)
      }
    }

    resolveSourcesHelper(map, mapUrl, function(fullUrl, sourceContent, index) {
      if (typeof sourceContent === "string") {
        sources[index] = sourceContent
        callbackAsync(done, null)
      } else {
        read(fullUrl, function(error, result) {
          sources[index] = String(result)
          done(error)
        })
      }
    })
  }

  function resolveSourcesSync(map, mapUrl, read) {
    sig("resolveSourcesSync", map, mapUrl, read)
    var sources = []
    resolveSourcesHelper(map, mapUrl, function(fullUrl, sourceContent, index) {
      if (typeof sourceContent === "string") {
        sources[index] = sourceContent
      } else {
        sources[index] = String(read(fullUrl))
      }
    })
    return sources
  }

  var endingSlash = /\/?$/

  function resolveSourcesHelper(map, mapUrl, fn) {
    var fullUrl
    var sourceContent
    for (var index = 0, len = map.sources.length; index < len; index++) {
      if (map.sourceRoot) {
        // Make sure that the sourceRoot ends with a slash, so that `/scripts/subdir` becomes
        // `/scripts/subdir/<source>`, not `/scripts/<source>`. Pointing to a file as source root
        // does not make sense.
        fullUrl = resolveUrl(mapUrl, map.sourceRoot.replace(endingSlash, "/"), map.sources[index])
      } else {
        fullUrl = resolveUrl(mapUrl, map.sources[index])
      }
      sourceContent = (map.sourceContents || [])[index]
      fn(fullUrl, sourceContent, index)
    }
  }



  function resolve(code, codeUrl, read, callback) {
    sig("resolve", code, codeUrl, read, callback)
    resolveSourceMap(code, codeUrl, read, function(error, mapData) {
      if (error) {
        return callback(error)
      }
      if (!mapData) {
        return callback(null, null)
      }
      resolveSources(mapData.map, mapData.sourcesRelativeTo, read, function(error, sources) {
        if (error) {
          return callback(error)
        }
        mapData.sources = sources
        callback(null, mapData)
      })
    })
  }

  function resolveSync(code, codeUrl, read) {
    sig("resolveSync", code, codeUrl, read)
    var mapData = resolveSourceMapSync(code, codeUrl, read)
    if (!mapData) {
      return null
    }
    mapData.sources = resolveSourcesSync(mapData.map, mapData.sourcesRelativeTo, read)
    return mapData
  }



  return {
    resolveSourceMap:     resolveSourceMap,
    resolveSourceMapSync: resolveSourceMapSync,
    resolveSources:       resolveSources,
    resolveSourcesSync:   resolveSourcesSync,
    resolve:              resolve,
    resolveSync:          resolveSync
  }

}));

},{"resolve-url":18,"source-map-url":19}],21:[function(_dereq_,module,exports){
/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = _dereq_('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = _dereq_('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = _dereq_('./source-map/source-node').SourceNode;

},{"./source-map/source-map-consumer":26,"./source-map/source-map-generator":27,"./source-map/source-node":28}],22:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var util = _dereq_('./util');

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i], aAllowDuplicates);
    }
    return set;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
    var isDuplicate = this.has(aStr);
    var idx = this._array.length;
    if (!isDuplicate || aAllowDuplicates) {
      this._array.push(aStr);
    }
    if (!isDuplicate) {
      this._set[util.toSetString(aStr)] = idx;
    }
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                util.toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[util.toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

},{"./util":29,"amdefine":30}],23:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var base64 = _dereq_('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string.
   */
  exports.decode = function base64VLQ_decode(aStr) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    return {
      value: fromVLQSigned(result),
      rest: aStr.slice(i)
    };
  };

});

},{"./base64":24,"amdefine":30}],24:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});

},{"amdefine":30}],25:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the next
    //      closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return null.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return aHaystack[mid];
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return aHaystack[mid];
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0
        ? null
        : aHaystack[aLow];
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the next lowest value checked if there is no exact hit. This is because
   * mappings between original and generated line/col pairs are single points,
   * and there is an implicit region between each of them, so a miss just means
   * that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    return aHaystack.length > 0
      ? recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
      : null;
  };

});

},{"amdefine":30}],26:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var util = _dereq_('./util');
  var binarySearch = _dereq_('./binary-search');
  var ArraySet = _dereq_('./array-set').ArraySet;
  var base64VLQ = _dereq_('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - sourcesContent: Optional. An array of contents of the original source files.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: Optional. The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
    // requires the array) to play nice here.
    var names = util.getArg(sourceMap, 'names', []);
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file', null);

    // Once again, Sass deviates from the spec and supplies the version as a
    // string rather than a number, so we use loose equality checking here.
    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    // Pass `true` below to allow duplicate names and sources. While source maps
    // are intended to be compressed and deduplicated, the TypeScript compiler
    // sometimes generates source maps with duplicates in them. See Github issue
    // #72 and bugzil.la/889492.
    this._names = ArraySet.fromArray(names, true);
    this._sources = ArraySet.fromArray(sources, true);

    this.sourceRoot = sourceRoot;
    this.sourcesContent = sourcesContent;
    this._mappings = mappings;
    this.file = file;
  }

  /**
   * Create a SourceMapConsumer from a SourceMapGenerator.
   *
   * @param SourceMapGenerator aSourceMap
   *        The source map that will be consumed.
   * @returns SourceMapConsumer
   */
  SourceMapConsumer.fromSourceMap =
    function SourceMapConsumer_fromSourceMap(aSourceMap) {
      var smc = Object.create(SourceMapConsumer.prototype);

      smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
      smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
      smc.sourceRoot = aSourceMap._sourceRoot;
      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                              smc.sourceRoot);
      smc.file = aSourceMap._file;

      smc.__generatedMappings = aSourceMap._mappings.slice()
        .sort(util.compareByGeneratedPositions);
      smc.__originalMappings = aSourceMap._mappings.slice()
        .sort(util.compareByOriginalPositions);

      return smc;
    };

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this.sourceRoot ? util.join(this.sourceRoot, s) : s;
      }, this);
    }
  });

  // `__generatedMappings` and `__originalMappings` are arrays that hold the
  // parsed mapping coordinates from the source map's "mappings" attribute. They
  // are lazily instantiated, accessed via the `_generatedMappings` and
  // `_originalMappings` getters respectively, and we only parse the mappings
  // and create these arrays once queried for a source location. We jump through
  // these hoops because there can be many thousands of mappings, and parsing
  // them is expensive, so we only want to do it if we must.
  //
  // Each object in the arrays is of the form:
  //
  //     {
  //       generatedLine: The line number in the generated code,
  //       generatedColumn: The column number in the generated code,
  //       source: The path to the original source file that generated this
  //               chunk of code,
  //       originalLine: The line number in the original source that
  //                     corresponds to this chunk of generated code,
  //       originalColumn: The column number in the original source that
  //                       corresponds to this chunk of generated code,
  //       name: The name of the original symbol which generated this chunk of
  //             code.
  //     }
  //
  // All properties except for `generatedLine` and `generatedColumn` can be
  // `null`.
  //
  // `_generatedMappings` is ordered by the generated positions.
  //
  // `_originalMappings` is ordered by the original positions.

  SourceMapConsumer.prototype.__generatedMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
    get: function () {
      if (!this.__generatedMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__generatedMappings;
    }
  });

  SourceMapConsumer.prototype.__originalMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
    get: function () {
      if (!this.__originalMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__originalMappings;
    }
  });

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var mappingSeparator = /^[,;]/;
      var str = aStr;
      var mapping;
      var temp;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          temp = base64VLQ.decode(str);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
            // Original source.
            temp = base64VLQ.decode(str);
            mapping.source = this._sources.at(previousSource + temp.value);
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            temp = base64VLQ.decode(str);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            temp = base64VLQ.decode(str);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
              // Original name.
              temp = base64VLQ.decode(str);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this.__generatedMappings.push(mapping);
          if (typeof mapping.originalLine === 'number') {
            this.__originalMappings.push(mapping);
          }
        }
      }

      this.__generatedMappings.sort(util.compareByGeneratedPositions);
      this.__originalMappings.sort(util.compareByOriginalPositions);
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var mapping = this._findMapping(needle,
                                      this._generatedMappings,
                                      "generatedLine",
                                      "generatedColumn",
                                      util.compareByGeneratedPositions);

      if (mapping && mapping.generatedLine === needle.generatedLine) {
        var source = util.getArg(mapping, 'source', null);
        if (source && this.sourceRoot) {
          source = util.join(this.sourceRoot, source);
        }
        return {
          source: source,
          line: util.getArg(mapping, 'originalLine', null),
          column: util.getArg(mapping, 'originalColumn', null),
          name: util.getArg(mapping, 'name', null)
        };
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * availible.
   */
  SourceMapConsumer.prototype.sourceContentFor =
    function SourceMapConsumer_sourceContentFor(aSource) {
      if (!this.sourcesContent) {
        return null;
      }

      if (this.sourceRoot) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot
          && (url = util.urlParse(this.sourceRoot))) {
        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
        // many users. We can help them out when they expect file:// URIs to
        // behave like it would if they were running a local HTTP server. See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
        if (url.scheme == "file"
            && this._sources.has(fileUriAbsPath)) {
          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
        }

        if ((!url.path || url.path == "/")
            && this._sources.has("/" + aSource)) {
          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
        }
      }

      throw new Error('"' + aSource + '" is not in the SourceMap.');
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      if (this.sourceRoot) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var mapping = this._findMapping(needle,
                                      this._originalMappings,
                                      "originalLine",
                                      "originalColumn",
                                      util.compareByOriginalPositions);

      if (mapping) {
        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null)
        };
      }

      return {
        line: null,
        column: null
      };
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      var sourceRoot = this.sourceRoot;
      mappings.map(function (mapping) {
        var source = mapping.source;
        if (source && sourceRoot) {
          source = util.join(sourceRoot, source);
        }
        return {
          source: source,
          generatedLine: mapping.generatedLine,
          generatedColumn: mapping.generatedColumn,
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: mapping.name
        };
      }).forEach(aCallback, context);
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});

},{"./array-set":22,"./base64-vlq":23,"./binary-search":25,"./util":29,"amdefine":30}],27:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var base64VLQ = _dereq_('./base64-vlq');
  var util = _dereq_('./util');
  var ArraySet = _dereq_('./array-set').ArraySet;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. You may pass an object with the following
   * properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: A root for all relative URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    if (!aArgs) {
      aArgs = {};
    }
    this._file = util.getArg(aArgs, 'file', null);
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = [];
    this._sourcesContents = null;
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Creates a new SourceMapGenerator based on a SourceMapConsumer
   *
   * @param aSourceMapConsumer The SourceMap.
   */
  SourceMapGenerator.fromSourceMap =
    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
      var sourceRoot = aSourceMapConsumer.sourceRoot;
      var generator = new SourceMapGenerator({
        file: aSourceMapConsumer.file,
        sourceRoot: sourceRoot
      });
      aSourceMapConsumer.eachMapping(function (mapping) {
        var newMapping = {
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };

        if (mapping.source) {
          newMapping.source = mapping.source;
          if (sourceRoot) {
            newMapping.source = util.relative(sourceRoot, newMapping.source);
          }

          newMapping.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };

          if (mapping.name) {
            newMapping.name = mapping.name;
          }
        }

        generator.addMapping(newMapping);
      });
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content) {
          generator.setSourceContent(sourceFile, content);
        }
      });
      return generator;
    };

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      this._validateMapping(generated, original, source, name);

      if (source && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.push({
        generatedLine: generated.line,
        generatedColumn: generated.column,
        originalLine: original != null && original.line,
        originalColumn: original != null && original.column,
        source: source,
        name: name
      });
    };

  /**
   * Set the source content for a source file.
   */
  SourceMapGenerator.prototype.setSourceContent =
    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
      var source = aSourceFile;
      if (this._sourceRoot) {
        source = util.relative(this._sourceRoot, source);
      }

      if (aSourceContent !== null) {
        // Add the source content to the _sourcesContents map.
        // Create a new _sourcesContents map if the property is null.
        if (!this._sourcesContents) {
          this._sourcesContents = {};
        }
        this._sourcesContents[util.toSetString(source)] = aSourceContent;
      } else {
        // Remove the source file from the _sourcesContents map.
        // If the _sourcesContents map is empty, set the property to null.
        delete this._sourcesContents[util.toSetString(source)];
        if (Object.keys(this._sourcesContents).length === 0) {
          this._sourcesContents = null;
        }
      }
    };

  /**
   * Applies the mappings of a sub-source-map for a specific source file to the
   * source map being generated. Each mapping to the supplied source file is
   * rewritten using the supplied source map. Note: The resolution for the
   * resulting mappings is the minimium of this map and the supplied map.
   *
   * @param aSourceMapConsumer The source map to be applied.
   * @param aSourceFile Optional. The filename of the source file.
   *        If omitted, SourceMapConsumer's file property will be used.
   * @param aSourceMapPath Optional. The dirname of the path to the source map
   *        to be applied. If relative, it is relative to the SourceMapConsumer.
   *        This parameter is needed when the two source maps aren't in the same
   *        directory, and the source map to be applied contains relative source
   *        paths. If so, those relative source paths need to be rewritten
   *        relative to the SourceMapGenerator.
   */
  SourceMapGenerator.prototype.applySourceMap =
    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
      // If aSourceFile is omitted, we will use the file property of the SourceMap
      if (!aSourceFile) {
        if (!aSourceMapConsumer.file) {
          throw new Error(
            'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
            'or the source map\'s "file" property. Both were omitted.'
          );
        }
        aSourceFile = aSourceMapConsumer.file;
      }
      var sourceRoot = this._sourceRoot;
      // Make "aSourceFile" relative if an absolute Url is passed.
      if (sourceRoot) {
        aSourceFile = util.relative(sourceRoot, aSourceFile);
      }
      // Applying the SourceMap can add and remove items from the sources and
      // the names array.
      var newSources = new ArraySet();
      var newNames = new ArraySet();

      // Find mappings for the "aSourceFile"
      this._mappings.forEach(function (mapping) {
        if (mapping.source === aSourceFile && mapping.originalLine) {
          // Check if it can be mapped by the source map, then update the mapping.
          var original = aSourceMapConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn
          });
          if (original.source !== null) {
            // Copy mapping
            mapping.source = original.source;
            if (aSourceMapPath) {
              mapping.source = util.join(aSourceMapPath, mapping.source)
            }
            if (sourceRoot) {
              mapping.source = util.relative(sourceRoot, mapping.source);
            }
            mapping.originalLine = original.line;
            mapping.originalColumn = original.column;
            if (original.name !== null && mapping.name !== null) {
              // Only use the identifier name if it's an identifier
              // in both SourceMaps
              mapping.name = original.name;
            }
          }
        }

        var source = mapping.source;
        if (source && !newSources.has(source)) {
          newSources.add(source);
        }

        var name = mapping.name;
        if (name && !newNames.has(name)) {
          newNames.add(name);
        }

      }, this);
      this._sources = newSources;
      this._names = newNames;

      // Copy sourcesContents of applied map.
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content) {
          if (sourceRoot) {
            sourceFile = util.relative(sourceRoot, sourceFile);
          }
          this.setSourceContent(sourceFile, content);
        }
      }, this);
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping: ' + JSON.stringify({
          generated: aGenerated,
          source: aSource,
          original: aOriginal,
          name: aName
        }));
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      // The mappings must be guaranteed to be in sorted order before we start
      // serializing them or else the generated line numbers (which are defined
      // via the ';' separators) will be all messed up. Note: it might be more
      // performant to maintain the sorting as we insert them, rather than as we
      // serialize them, but the big O is the same either way.
      this._mappings.sort(util.compareByGeneratedPositions);

      for (var i = 0, len = this._mappings.length; i < len; i++) {
        mapping = this._mappings[i];

        if (mapping.generatedLine !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generatedLine !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            if (!util.compareByGeneratedPositions(mapping, this._mappings[i - 1])) {
              continue;
            }
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generatedColumn
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generatedColumn;

        if (mapping.source) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.originalLine - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.originalLine - 1;

          result += base64VLQ.encode(mapping.originalColumn
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.originalColumn;

          if (mapping.name) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  SourceMapGenerator.prototype._generateSourcesContent =
    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
      return aSources.map(function (source) {
        if (!this._sourcesContents) {
          return null;
        }
        if (aSourceRoot) {
          source = util.relative(aSourceRoot, source);
        }
        var key = util.toSetString(source);
        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                                                    key)
          ? this._sourcesContents[key]
          : null;
      }, this);
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        file: this._file,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._sourceRoot) {
        map.sourceRoot = this._sourceRoot;
      }
      if (this._sourcesContents) {
        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
      }

      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

},{"./array-set":22,"./base64-vlq":23,"./util":29,"amdefine":30}],28:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var SourceMapGenerator = _dereq_('./source-map-generator').SourceMapGenerator;
  var util = _dereq_('./util');

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   * @param aName The original identifier.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
    this.children = [];
    this.sourceContents = {};
    this.line = aLine === undefined ? null : aLine;
    this.column = aColumn === undefined ? null : aColumn;
    this.source = aSource === undefined ? null : aSource;
    this.name = aName === undefined ? null : aName;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Creates a SourceNode from generated code and a SourceMapConsumer.
   *
   * @param aGeneratedCode The generated code
   * @param aSourceMapConsumer The SourceMap for the generated code
   */
  SourceNode.fromStringWithSourceMap =
    function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer) {
      // The SourceNode we want to fill with the generated code
      // and the SourceMap
      var node = new SourceNode();

      // The generated code
      // Processed fragments are removed from this array.
      var remainingLines = aGeneratedCode.split('\n');

      // We need to remember the position of "remainingLines"
      var lastGeneratedLine = 1, lastGeneratedColumn = 0;

      // The generate SourceNodes we need a code range.
      // To extract it current and last mapping is used.
      // Here we store the last mapping.
      var lastMapping = null;

      aSourceMapConsumer.eachMapping(function (mapping) {
        if (lastMapping !== null) {
          // We add the code from "lastMapping" to "mapping":
          // First check if there is a new line in between.
          if (lastGeneratedLine < mapping.generatedLine) {
            var code = "";
            // Associate first line with "lastMapping"
            addMappingWithCode(lastMapping, remainingLines.shift() + "\n");
            lastGeneratedLine++;
            lastGeneratedColumn = 0;
            // The remaining code is added without mapping
          } else {
            // There is no new line in between.
            // Associate the code between "lastGeneratedColumn" and
            // "mapping.generatedColumn" with "lastMapping"
            var nextLine = remainingLines[0];
            var code = nextLine.substr(0, mapping.generatedColumn -
                                          lastGeneratedColumn);
            remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                                                lastGeneratedColumn);
            lastGeneratedColumn = mapping.generatedColumn;
            addMappingWithCode(lastMapping, code);
            // No more remaining code, continue
            lastMapping = mapping;
            return;
          }
        }
        // We add the generated code until the first mapping
        // to the SourceNode without any mapping.
        // Each line is added as separate string.
        while (lastGeneratedLine < mapping.generatedLine) {
          node.add(remainingLines.shift() + "\n");
          lastGeneratedLine++;
        }
        if (lastGeneratedColumn < mapping.generatedColumn) {
          var nextLine = remainingLines[0];
          node.add(nextLine.substr(0, mapping.generatedColumn));
          remainingLines[0] = nextLine.substr(mapping.generatedColumn);
          lastGeneratedColumn = mapping.generatedColumn;
        }
        lastMapping = mapping;
      }, this);
      // We have processed all mappings.
      if (remainingLines.length > 0) {
        if (lastMapping) {
          // Associate the remaining code in the current line with "lastMapping"
          var lastLine = remainingLines.shift();
          if (remainingLines.length > 0) lastLine += "\n";
          addMappingWithCode(lastMapping, lastLine);
        }
        // and add the remaining lines without any mapping
        node.add(remainingLines.join("\n"));
      }

      // Copy sourcesContent into SourceNode
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content) {
          node.setSourceContent(sourceFile, content);
        }
      });

      return node;

      function addMappingWithCode(mapping, code) {
        if (mapping === null || mapping.source === undefined) {
          node.add(code);
        } else {
          node.add(new SourceNode(mapping.originalLine,
                                  mapping.originalColumn,
                                  mapping.source,
                                  code,
                                  mapping.name));
        }
      }
    };

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    var chunk;
    for (var i = 0, len = this.children.length; i < len; i++) {
      chunk = this.children[i];
      if (chunk instanceof SourceNode) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source,
                       line: this.line,
                       column: this.column,
                       name: this.name });
        }
      }
    }
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length;
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild instanceof SourceNode) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Set the source content for a source file. This will be added to the SourceMapGenerator
   * in the sourcesContent field.
   *
   * @param aSourceFile The filename of the source file
   * @param aSourceContent The content of the source file
   */
  SourceNode.prototype.setSourceContent =
    function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
      this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
    };

  /**
   * Walk over the tree of SourceNodes. The walking function is called for each
   * source file content and is passed the filename and source content.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walkSourceContents =
    function SourceNode_walkSourceContents(aFn) {
      for (var i = 0, len = this.children.length; i < len; i++) {
        if (this.children[i] instanceof SourceNode) {
          this.children[i].walkSourceContents(aFn);
        }
      }

      var sources = Object.keys(this.sourceContents);
      for (var i = 0, len = sources.length; i < len; i++) {
        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
      }
    };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    var sourceMappingActive = false;
    var lastOriginalSource = null;
    var lastOriginalLine = null;
    var lastOriginalColumn = null;
    var lastOriginalName = null;
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source !== null
          && original.line !== null
          && original.column !== null) {
        if(lastOriginalSource !== original.source
           || lastOriginalLine !== original.line
           || lastOriginalColumn !== original.column
           || lastOriginalName !== original.name) {
          map.addMapping({
            source: original.source,
            original: {
              line: original.line,
              column: original.column
            },
            generated: {
              line: generated.line,
              column: generated.column
            },
            name: original.name
          });
        }
        lastOriginalSource = original.source;
        lastOriginalLine = original.line;
        lastOriginalColumn = original.column;
        lastOriginalName = original.name;
        sourceMappingActive = true;
      } else if (sourceMappingActive) {
        map.addMapping({
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
        lastOriginalSource = null;
        sourceMappingActive = false;
      }
      chunk.split('').forEach(function (ch, idx, array) {
        if (ch === '\n') {
          generated.line++;
          generated.column = 0;
          // Mappings end at eol
          if (idx + 1 === array.length) {
            lastOriginalSource = null;
            sourceMappingActive = false;
          } else if (sourceMappingActive) {
            map.addMapping({
              source: original.source,
              original: {
                line: original.line,
                column: original.column
              },
              generated: {
                line: generated.line,
                column: generated.column
              },
              name: original.name
            });
          }
        } else {
          generated.column++;
        }
      });
    });
    this.walkSourceContents(function (sourceFile, sourceContent) {
      map.setSourceContent(sourceFile, sourceContent);
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});

},{"./source-map-generator":27,"./util":29,"amdefine":30}],29:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
  var dataUrlRegexp = /^data:.+\,.+$/;

  function urlParse(aUrl) {
    var match = aUrl.match(urlRegexp);
    if (!match) {
      return null;
    }
    return {
      scheme: match[1],
      auth: match[2],
      host: match[3],
      port: match[4],
      path: match[5]
    };
  }
  exports.urlParse = urlParse;

  function urlGenerate(aParsedUrl) {
    var url = '';
    if (aParsedUrl.scheme) {
      url += aParsedUrl.scheme + ':';
    }
    url += '//';
    if (aParsedUrl.auth) {
      url += aParsedUrl.auth + '@';
    }
    if (aParsedUrl.host) {
      url += aParsedUrl.host;
    }
    if (aParsedUrl.port) {
      url += ":" + aParsedUrl.port
    }
    if (aParsedUrl.path) {
      url += aParsedUrl.path;
    }
    return url;
  }
  exports.urlGenerate = urlGenerate;

  /**
   * Normalizes a path, or the path portion of a URL:
   *
   * - Replaces consequtive slashes with one slash.
   * - Removes unnecessary '.' parts.
   * - Removes unnecessary '<dir>/..' parts.
   *
   * Based on code in the Node.js 'path' core module.
   *
   * @param aPath The path or url to normalize.
   */
  function normalize(aPath) {
    var path = aPath;
    var url = urlParse(aPath);
    if (url) {
      if (!url.path) {
        return aPath;
      }
      path = url.path;
    }
    var isAbsolute = (path.charAt(0) === '/');

    var parts = path.split(/\/+/);
    for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
      part = parts[i];
      if (part === '.') {
        parts.splice(i, 1);
      } else if (part === '..') {
        up++;
      } else if (up > 0) {
        if (part === '') {
          // The first part is blank if the path is absolute. Trying to go
          // above the root is a no-op. Therefore we can remove all '..' parts
          // directly after the root.
          parts.splice(i + 1, up);
          up = 0;
        } else {
          parts.splice(i, 2);
          up--;
        }
      }
    }
    path = parts.join('/');

    if (path === '') {
      path = isAbsolute ? '/' : '.';
    }

    if (url) {
      url.path = path;
      return urlGenerate(url);
    }
    return path;
  }
  exports.normalize = normalize;

  /**
   * Joins two paths/URLs.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be joined with the root.
   *
   * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
   *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
   *   first.
   * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
   *   is updated with the result and aRoot is returned. Otherwise the result
   *   is returned.
   *   - If aPath is absolute, the result is aPath.
   *   - Otherwise the two paths are joined with a slash.
   * - Joining for example 'http://' and 'www.example.com' is also supported.
   */
  function join(aRoot, aPath) {
    var aPathUrl = urlParse(aPath);
    var aRootUrl = urlParse(aRoot);
    if (aRootUrl) {
      aRoot = aRootUrl.path || '/';
    }

    // `join(foo, '//www.example.org')`
    if (aPathUrl && !aPathUrl.scheme) {
      if (aRootUrl) {
        aPathUrl.scheme = aRootUrl.scheme;
      }
      return urlGenerate(aPathUrl);
    }

    if (aPathUrl || aPath.match(dataUrlRegexp)) {
      return aPath;
    }

    // `join('http://', 'www.example.com')`
    if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
      aRootUrl.host = aPath;
      return urlGenerate(aRootUrl);
    }

    var joined = aPath.charAt(0) === '/'
      ? aPath
      : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

    if (aRootUrl) {
      aRootUrl.path = joined;
      return urlGenerate(aRootUrl);
    }
    return joined;
  }
  exports.join = join;

  /**
   * Because behavior goes wacky when you set `__proto__` on objects, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  function toSetString(aStr) {
    return '$' + aStr;
  }
  exports.toSetString = toSetString;

  function fromSetString(aStr) {
    return aStr.substr(1);
  }
  exports.fromSetString = fromSetString;

  function relative(aRoot, aPath) {
    aRoot = aRoot.replace(/\/$/, '');

    var url = urlParse(aRoot);
    if (aPath.charAt(0) == "/" && url && url.path == "/") {
      return aPath.slice(1);
    }

    return aPath.indexOf(aRoot + '/') === 0
      ? aPath.substr(aRoot.length + 1)
      : aPath;
  }
  exports.relative = relative;

  function strcmp(aStr1, aStr2) {
    var s1 = aStr1 || "";
    var s2 = aStr2 || "";
    return (s1 > s2) - (s1 < s2);
  }

  /**
   * Comparator between two mappings where the original positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same original source/line/column, but different generated
   * line and column the same. Useful when searching for a mapping with a
   * stubbed out mapping.
   */
  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
    var cmp;

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp || onlyCompareOriginal) {
      return cmp;
    }

    cmp = strcmp(mappingA.name, mappingB.name);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    return mappingA.generatedColumn - mappingB.generatedColumn;
  };
  exports.compareByOriginalPositions = compareByOriginalPositions;

  /**
   * Comparator between two mappings where the generated positions are
   * compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same generated line and column, but different
   * source/name/original line and column the same. Useful when searching for a
   * mapping with a stubbed out mapping.
   */
  function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
    var cmp;

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp || onlyCompareGenerated) {
      return cmp;
    }

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp) {
      return cmp;
    }

    return strcmp(mappingA.name, mappingB.name);
  };
  exports.compareByGeneratedPositions = compareByGeneratedPositions;

});

},{"amdefine":30}],30:[function(_dereq_,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 0.1.0 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/amdefine for details
 */

/*jslint node: true */
/*global module, process */
'use strict';

/**
 * Creates a define for node.
 * @param {Object} module the "module" object that is defined by Node for the
 * current module.
 * @param {Function} [requireFn]. Node's require function for the current module.
 * It only needs to be passed in Node versions before 0.5, when module.require
 * did not exist.
 * @returns {Function} a define function that is usable for the current node
 * module.
 */
function amdefine(module, requireFn) {
    'use strict';
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        path = _dereq_('path'),
        makeRequire, stringRequire;

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i+= 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function normalize(name, baseName) {
        var baseParts;

        //Adjust any relative paths.
        if (name && name.charAt(0) === '.') {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                baseParts = baseName.split('/');
                baseParts = baseParts.slice(0, baseParts.length - 1);
                baseParts = baseParts.concat(name.split('/'));
                trimDots(baseParts);
                name = baseParts.join('/');
            }
        }

        return name;
    }

    /**
     * Create the normalize() function passed to a loader plugin's
     * normalize method.
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(id) {
        function load(value) {
            loaderCache[id] = value;
        }

        load.fromText = function (id, text) {
            //This one is difficult because the text can/probably uses
            //define, and any relative paths and requires should be relative
            //to that id was it would be found on disk. But this would require
            //bootstrapping a module/require fairly deeply from node core.
            //Not sure how best to go about that yet.
            throw new Error('amdefine does not implement load.fromText');
        };

        return load;
    }

    makeRequire = function (systemRequire, exports, module, relId) {
        function amdRequire(deps, callback) {
            if (typeof deps === 'string') {
                //Synchronous, single module require('')
                return stringRequire(systemRequire, exports, module, deps, relId);
            } else {
                //Array of dependencies with a callback.

                //Convert the dependencies to modules.
                deps = deps.map(function (depName) {
                    return stringRequire(systemRequire, exports, module, depName, relId);
                });

                //Wait for next tick to call back the require call.
                process.nextTick(function () {
                    callback.apply(null, deps);
                });
            }
        }

        amdRequire.toUrl = function (filePath) {
            if (filePath.indexOf('.') === 0) {
                return normalize(filePath, path.dirname(module.filename));
            } else {
                return filePath;
            }
        };

        return amdRequire;
    };

    //Favor explicit value, passed in if the module wants to support Node 0.4.
    requireFn = requireFn || function req() {
        return module.require.apply(module, arguments);
    };

    function runFactory(id, deps, factory) {
        var r, e, m, result;

        if (id) {
            e = loaderCache[id] = {};
            m = {
                id: id,
                uri: __filename,
                exports: e
            };
            r = makeRequire(requireFn, e, m, id);
        } else {
            //Only support one define call per file
            if (alreadyCalled) {
                throw new Error('amdefine with no module ID cannot be called more than once per file.');
            }
            alreadyCalled = true;

            //Use the real variables from node
            //Use module.exports for exports, since
            //the exports in here is amdefine exports.
            e = module.exports;
            m = module;
            r = makeRequire(requireFn, e, m, module.id);
        }

        //If there are dependencies, they are strings, so need
        //to convert them to dependency values.
        if (deps) {
            deps = deps.map(function (depName) {
                return r(depName);
            });
        }

        //Call the factory with the right dependencies.
        if (typeof factory === 'function') {
            result = factory.apply(m.exports, deps);
        } else {
            result = factory;
        }

        if (result !== undefined) {
            m.exports = result;
            if (id) {
                loaderCache[id] = m.exports;
            }
        }
    }

    stringRequire = function (systemRequire, exports, module, id, relId) {
        //Split the ID by a ! so that
        var index = id.indexOf('!'),
            originalId = id,
            prefix, plugin;

        if (index === -1) {
            id = normalize(id, relId);

            //Straight module lookup. If it is one of the special dependencies,
            //deal with it, otherwise, delegate to node.
            if (id === 'require') {
                return makeRequire(systemRequire, exports, module, relId);
            } else if (id === 'exports') {
                return exports;
            } else if (id === 'module') {
                return module;
            } else if (loaderCache.hasOwnProperty(id)) {
                return loaderCache[id];
            } else if (defineCache[id]) {
                runFactory.apply(null, defineCache[id]);
                return loaderCache[id];
            } else {
                if(systemRequire) {
                    return systemRequire(originalId);
                } else {
                    throw new Error('No module with ID: ' + id);
                }
            }
        } else {
            //There is a plugin in play.
            prefix = id.substring(0, index);
            id = id.substring(index + 1, id.length);

            plugin = stringRequire(systemRequire, exports, module, prefix, relId);

            if (plugin.normalize) {
                id = plugin.normalize(id, makeNormalize(relId));
            } else {
                //Normalize the ID normally.
                id = normalize(id, relId);
            }

            if (loaderCache[id]) {
                return loaderCache[id];
            } else {
                plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});

                return loaderCache[id];
            }
        }
    };

    //Create a define function specific to the module asking for amdefine.
    function define(id, deps, factory) {
        if (Array.isArray(id)) {
            factory = deps;
            deps = id;
            id = undefined;
        } else if (typeof id !== 'string') {
            factory = id;
            id = deps = undefined;
        }

        if (deps && !Array.isArray(deps)) {
            factory = deps;
            deps = undefined;
        }

        if (!deps) {
            deps = ['require', 'exports', 'module'];
        }

        //Set up properties for this module. If an ID, then use
        //internal cache. If no ID, then use the external variables
        //for this node module.
        if (id) {
            //Put the module in deep freeze until there is a
            //require call for it.
            defineCache[id] = [id, deps, factory];
        } else {
            runFactory(id, deps, factory);
        }
    }

    //define.require, which has access to all the values in the
    //cache. Useful for AMD modules that all have IDs in the file,
    //but need to finally export a value to node based on one of those
    //IDs.
    define.require = function (id) {
        if (loaderCache[id]) {
            return loaderCache[id];
        }

        if (defineCache[id]) {
            runFactory.apply(null, defineCache[id]);
            return loaderCache[id];
        }
    };

    define.amd = {};

    return define;
}

module.exports = amdefine;

}).call(this,_dereq_("F:\\billysFile\\code\\javascript\\nodejs\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"),"/node_modules\\source-map\\node_modules\\amdefine\\amdefine.js")
},{"F:\\billysFile\\code\\javascript\\nodejs\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":10,"path":11}],31:[function(_dereq_,module,exports){


module.exports = exceptionMode(createException()) // basically what browser this is

// verbatim from `mode` in stacktrace.js as of 2014-01-23
function exceptionMode(e) {
    if (e['arguments'] && e.stack) {
        return 'chrome';
    } else if (e.stack && e.sourceURL) {
        return 'safari';
    } else if (e.stack && e.number) {
        return 'ie';
    } else if (typeof e.message === 'string' && typeof window !== 'undefined' && window.opera) {
        // e.message.indexOf("Backtrace:") > -1 -> opera
        // !e.stacktrace -> opera
        if (!e.stacktrace) {
            return 'opera9'; // use e.message
        }
        // 'opera#sourceloc' in e -> opera9, opera10a
        if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
            return 'opera9'; // use e.message
        }
        // e.stacktrace && !e.stack -> opera10a
        if (!e.stack) {
            return 'opera10a'; // use e.stacktrace
        }
        // e.stacktrace && e.stack -> opera10b
        if (e.stacktrace.indexOf("called from line") < 0) {
            return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
        }
        // e.stacktrace && e.stack -> opera11
        return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
    } else if (e.stack && !e.fileName) {
        // Chrome 27 does not have e.arguments as earlier versions,
        // but still does not have e.fileName as Firefox
        return 'chrome';
    } else if (e.stack) {
        return 'firefox';
    }
    return 'other';
}

function createException() {
    try {
        this.undef();
    } catch (e) {
        return e;
    }
}

},{}],32:[function(_dereq_,module,exports){
// Domain Public by Eric Wendelin http://eriwen.com/ (2008)
//                  Luke Smith http://lucassmith.name/ (2008)
//                  Loic Dachary <loic@dachary.org> (2008)
//                  Johan Euphrosine <proppy@aminche.com> (2008)
//                  Oyvind Sean Kinsey http://kinsey.no/blog (2010)
//                  Victor Homyakov <victor-homyakov@users.sourceforge.net> (2010)
(function(global, factory) {
  // Node
  if (typeof exports === 'object') {
    module.exports = factory();

  // AMD
  } else if (typeof define === 'function' && define.amd) {
    define(factory);

  // Browser globals
  } else {
    global.printStackTrace = factory();
  }
}(this, function() {
	/**
	 * Main function giving a function stack trace with a forced or passed in Error
	 *
	 * @cfg {Error} e The error to create a stacktrace from (optional)
	 * @cfg {Boolean} guess If we should try to resolve the names of anonymous functions
	 * @return {Array} of Strings with functions, lines, files, and arguments where possible
	 */
	function printStackTrace(options) {
	    options = options || {guess: true};
	    var ex = options.e || null, guess = !!options.guess;
	    var p = new printStackTrace.implementation(), result = p.run(ex);
	    return (guess) ? p.guessAnonymousFunctions(result) : result;
	}

	printStackTrace.implementation = function() {
	};

	printStackTrace.implementation.prototype = {
	    /**
	     * @param {Error} ex The error to create a stacktrace from (optional)
	     * @param {String} mode Forced mode (optional, mostly for unit tests)
	     */
	    run: function(ex, mode) {
	        ex = ex || this.createException();
	        // examine exception properties w/o debugger
	        //for (var prop in ex) {alert("Ex['" + prop + "']=" + ex[prop]);}
	        mode = mode || this.mode(ex);
	        if (mode === 'other') {
	            return this.other(arguments.callee);
	        } else {
	            return this[mode](ex);
	        }
	    },

	    createException: function() {
	        try {
	            this.undef();
	        } catch (e) {
	            return e;
	        }
	    },

	    /**
	     * Mode could differ for different exception, e.g.
	     * exceptions in Chrome may or may not have arguments or stack.
	     *
	     * @return {String} mode of operation for the exception
	     */
	    mode: function(e) {
	        if (e['arguments'] && e.stack) {
	            return 'chrome';
	        } else if (e.stack && e.sourceURL) {
	            return 'safari';
	        } else if (e.stack && e.number) {
	            return 'ie';
	        } else if (typeof e.message === 'string' && typeof window !== 'undefined' && window.opera) {
	            // e.message.indexOf("Backtrace:") > -1 -> opera
	            // !e.stacktrace -> opera
	            if (!e.stacktrace) {
	                return 'opera9'; // use e.message
	            }
	            // 'opera#sourceloc' in e -> opera9, opera10a
	            if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
	                return 'opera9'; // use e.message
	            }
	            // e.stacktrace && !e.stack -> opera10a
	            if (!e.stack) {
	                return 'opera10a'; // use e.stacktrace
	            }
	            // e.stacktrace && e.stack -> opera10b
	            if (e.stacktrace.indexOf("called from line") < 0) {
	                return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
	            }
	            // e.stacktrace && e.stack -> opera11
	            return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
	        } else if (e.stack && !e.fileName) {
	            // Chrome 27 does not have e.arguments as earlier versions,
	            // but still does not have e.fileName as Firefox
	            return 'chrome';
	        } else if (e.stack) {
	            return 'firefox';
	        }
	        return 'other';
	    },

	    /**
	     * Given a context, function name, and callback function, overwrite it so that it calls
	     * printStackTrace() first with a callback and then runs the rest of the body.
	     *
	     * @param {Object} context of execution (e.g. window)
	     * @param {String} functionName to instrument
	     * @param {Function} callback function to call with a stack trace on invocation
	     */
	    instrumentFunction: function(context, functionName, callback) {
	        context = context || window;
	        var original = context[functionName];
	        context[functionName] = function instrumented() {
	            callback.call(this, printStackTrace().slice(4));
	            return context[functionName]._instrumented.apply(this, arguments);
	        };
	        context[functionName]._instrumented = original;
	    },

	    /**
	     * Given a context and function name of a function that has been
	     * instrumented, revert the function to it's original (non-instrumented)
	     * state.
	     *
	     * @param {Object} context of execution (e.g. window)
	     * @param {String} functionName to de-instrument
	     */
	    deinstrumentFunction: function(context, functionName) {
	        if (context[functionName].constructor === Function &&
	                context[functionName]._instrumented &&
	                context[functionName]._instrumented.constructor === Function) {
	            context[functionName] = context[functionName]._instrumented;
	        }
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Chrome's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    chrome: function(e) {
	        var stack = (e.stack + '\n').replace(/^\S[^\(]+?[\n$]/gm, '').
	          replace(/^\s+(at eval )?at\s+/gm, '').
	          replace(/^([^\(]+?)([\n$])/gm, '{anonymous}()@$1$2').
	          replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}()@$1').split('\n');
	        stack.pop();
	        return stack;
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Safari's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    safari: function(e) {
	        return e.stack.replace(/\[native code\]\n/m, '')
	            .replace(/^(?=\w+Error\:).*$\n/m, '')
	            .replace(/^@/gm, '{anonymous}()@')
	            .split('\n');
	    },

	    /**
	     * Given an Error object, return a formatted Array based on IE's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    ie: function(e) {
	        var lineRE = /^.*at (\w+) \(([^\)]+)\)$/gm;
	        return e.stack.replace(/at Anonymous function /gm, '{anonymous}()@')
	            .replace(/^(?=\w+Error\:).*$\n/m, '')
	            .replace(lineRE, '$1@$2')
	            .split('\n');
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Firefox's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    firefox: function(e) {
	        return e.stack.replace(/(?:\n@:0)?\s+$/m, '').replace(/^[\(@]/gm, '{anonymous}()@').split('\n');
	    },

	    opera11: function(e) {
	        var ANON = '{anonymous}', lineRE = /^.*line (\d+), column (\d+)(?: in (.+))? in (\S+):$/;
	        var lines = e.stacktrace.split('\n'), result = [];

	        for (var i = 0, len = lines.length; i < len; i += 2) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                var location = match[4] + ':' + match[1] + ':' + match[2];
	                var fnName = match[3] || "global code";
	                fnName = fnName.replace(/<anonymous function: (\S+)>/, "$1").replace(/<anonymous function>/, ANON);
	                result.push(fnName + '@' + location + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
	            }
	        }

	        return result;
	    },

	    opera10b: function(e) {
	        // "<anonymous function: run>([arguments not available])@file://localhost/G:/js/stacktrace.js:27\n" +
	        // "printStackTrace([arguments not available])@file://localhost/G:/js/stacktrace.js:18\n" +
	        // "@file://localhost/G:/js/test/functional/testcase1.html:15"
	        var lineRE = /^(.*)@(.+):(\d+)$/;
	        var lines = e.stacktrace.split('\n'), result = [];

	        for (var i = 0, len = lines.length; i < len; i++) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                var fnName = match[1]? (match[1] + '()') : "global code";
	                result.push(fnName + '@' + match[2] + ':' + match[3]);
	            }
	        }

	        return result;
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Opera 10's stacktrace string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    opera10a: function(e) {
	        // "  Line 27 of linked script file://localhost/G:/js/stacktrace.js\n"
	        // "  Line 11 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html: In function foo\n"
	        var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
	        var lines = e.stacktrace.split('\n'), result = [];

	        for (var i = 0, len = lines.length; i < len; i += 2) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                var fnName = match[3] || ANON;
	                result.push(fnName + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
	            }
	        }

	        return result;
	    },

	    // Opera 7.x-9.2x only!
	    opera9: function(e) {
	        // "  Line 43 of linked script file://localhost/G:/js/stacktrace.js\n"
	        // "  Line 7 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html\n"
	        var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
	        var lines = e.message.split('\n'), result = [];

	        for (var i = 2, len = lines.length; i < len; i += 2) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                result.push(ANON + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
	            }
	        }

	        return result;
	    },

	    // Safari 5-, IE 9-, and others
	    other: function(curr) {
	        var ANON = '{anonymous}', fnRE = /function\s*([\w\-$]+)?\s*\(/i, stack = [], fn, args, maxStackSize = 10;
	        while (curr && curr['arguments'] && stack.length < maxStackSize) {
	            fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
	            args = Array.prototype.slice.call(curr['arguments'] || []);
	            stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
	            curr = curr.caller;
	        }
	        return stack;
	    },

	    /**
	     * Given arguments array as a String, substituting type names for non-string types.
	     *
	     * @param {Arguments,Array} args
	     * @return {String} stringified arguments
	     */
	    stringifyArguments: function(args) {
	        var result = [];
	        var slice = Array.prototype.slice;
	        for (var i = 0; i < args.length; ++i) {
	            var arg = args[i];
	            if (arg === undefined) {
	                result[i] = 'undefined';
	            } else if (arg === null) {
	                result[i] = 'null';
	            } else if (arg.constructor) {
	                if (arg.constructor === Array) {
	                    if (arg.length < 3) {
	                        result[i] = '[' + this.stringifyArguments(arg) + ']';
	                    } else {
	                        result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
	                    }
	                } else if (arg.constructor === Object) {
	                    result[i] = '#object';
	                } else if (arg.constructor === Function) {
	                    result[i] = '#function';
	                } else if (arg.constructor === String) {
	                    result[i] = '"' + arg + '"';
	                } else if (arg.constructor === Number) {
	                    result[i] = arg;
	                }
	            }
	        }
	        return result.join(',');
	    },

	    sourceCache: {},

	    /**
	     * @return the text from a given URL
	     */
	    ajax: function(url) {
	        var req = this.createXMLHTTPObject();
	        if (req) {
	            try {
	                req.open('GET', url, false);
	                //req.overrideMimeType('text/plain');
	                //req.overrideMimeType('text/javascript');
	                req.send(null);
	                //return req.status == 200 ? req.responseText : '';
	                return req.responseText;
	            } catch (e) {
	            }
	        }
	        return '';
	    },

	    /**
	     * Try XHR methods in order and store XHR factory.
	     *
	     * @return <Function> XHR function or equivalent
	     */
	    createXMLHTTPObject: function() {
	        var xmlhttp, XMLHttpFactories = [
	            function() {
	                return new XMLHttpRequest();
	            }, function() {
	                return new ActiveXObject('Msxml2.XMLHTTP');
	            }, function() {
	                return new ActiveXObject('Msxml3.XMLHTTP');
	            }, function() {
	                return new ActiveXObject('Microsoft.XMLHTTP');
	            }
	        ];
	        for (var i = 0; i < XMLHttpFactories.length; i++) {
	            try {
	                xmlhttp = XMLHttpFactories[i]();
	                // Use memoization to cache the factory
	                this.createXMLHTTPObject = XMLHttpFactories[i];
	                return xmlhttp;
	            } catch (e) {
	            }
	        }
	    },

	    /**
	     * Given a URL, check if it is in the same domain (so we can get the source
	     * via Ajax).
	     *
	     * @param url <String> source url
	     * @return <Boolean> False if we need a cross-domain request
	     */
	    isSameDomain: function(url) {
	        return typeof location !== "undefined" && url.indexOf(location.hostname) !== -1; // location may not be defined, e.g. when running from nodejs.
	    },

	    /**
	     * Get source code from given URL if in the same domain.
	     *
	     * @param url <String> JS source URL
	     * @return <Array> Array of source code lines
	     */
	    getSource: function(url) {
	        // TODO reuse source from script tags?
	        if (!(url in this.sourceCache)) {
	            this.sourceCache[url] = this.ajax(url).split('\n');
	        }
	        return this.sourceCache[url];
	    },

	    guessAnonymousFunctions: function(stack) {
	        for (var i = 0; i < stack.length; ++i) {
	            var reStack = /\{anonymous\}\(.*\)@(.*)/,
	                reRef = /^(.*?)(?::(\d+))(?::(\d+))?(?: -- .+)?$/,
	                frame = stack[i], ref = reStack.exec(frame);

	            if (ref) {
	                var m = reRef.exec(ref[1]);
	                if (m) { // If falsey, we did not get any file/line information
	                    var file = m[1], lineno = m[2], charno = m[3] || 0;
	                    if (file && this.isSameDomain(file) && lineno) {
	                        var functionName = this.guessAnonymousFunction(file, lineno, charno);
	                        stack[i] = frame.replace('{anonymous}', functionName);
	                    }
	                }
	            }
	        }
	        return stack;
	    },

	    guessAnonymousFunction: function(url, lineNo, charNo) {
	        var ret;
	        try {
	            ret = this.findFunctionName(this.getSource(url), lineNo);
	        } catch (e) {
	            ret = 'getSource failed with url: ' + url + ', exception: ' + e.toString();
	        }
	        return ret;
	    },

	    findFunctionName: function(source, lineNo) {
	        // FIXME findFunctionName fails for compressed source
	        // (more than one function on the same line)
	        // function {name}({args}) m[1]=name m[2]=args
	        var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
	        // {name} = function ({args}) TODO args capture
	        // /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*function(?:[^(]*)/
	        var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
	        // {name} = eval()
	        var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
	        // Walk backwards in the source lines until we find
	        // the line which matches one of the patterns above
	        var code = "", line, maxLines = Math.min(lineNo, 20), m, commentPos;
	        for (var i = 0; i < maxLines; ++i) {
	            // lineNo is 1-based, source[] is 0-based
	            line = source[lineNo - i - 1];
	            commentPos = line.indexOf('//');
	            if (commentPos >= 0) {
	                line = line.substr(0, commentPos);
	            }
	            // TODO check other types of comments? Commented code may lead to false positive
	            if (line) {
	                code = line + code;
	                m = reFunctionExpression.exec(code);
	                if (m && m[1]) {
	                    return m[1];
	                }
	                m = reFunctionDeclaration.exec(code);
	                if (m && m[1]) {
	                    //return m[1] + "(" + (m[2] || "") + ")";
	                    return m[1];
	                }
	                m = reFunctionEvaluation.exec(code);
	                if (m && m[1]) {
	                    return m[1];
	                }
	            }
	        }
	        return '(?)';
	    }
	};

	return printStackTrace;
}));
},{}],33:[function(_dereq_,module,exports){
var printStackTrace = _dereq_('stacktrace-js')
var parsers = _dereq_('./tracelineParser')
var mode = _dereq_('./exceptionMode')

module.exports = function(ex) {
    if(parsers[mode] === undefined)
        throw new Error("browser "+mode+" not supported")

    var options = undefined
    if(ex !== undefined) {
        if(mode === 'ie' && ex.number === undefined)
            ex.number = 1    // work around for this: https://github.com/stacktracejs/stacktrace.js/issues/80
        options = {e:ex, guess: true}
    }
    var trace = printStackTrace(options)

    if(ex === undefined) {
        trace.splice(0,4) // strip stacktrace-js internals
    }

    return parseStacktrace(trace)
}

function TraceInfo(traceline) {
    this.traceline = traceline
}
TraceInfo.prototype = {
    get file() {
        return getInfo(this).file
    },
    get function() {
        return getInfo(this).function
    },
    get line() {
        return getInfo(this).line
    },
    get column() {
        return getInfo(this).column
    },
    get info() {
        return getInfo(this)
    }
}

function getInfo(traceInfo) {
    if(traceInfo.cache === undefined) {
        var info = parsers[mode](traceInfo.traceline)
        if(info.line !== undefined)
            info.line = parseInt(info.line)
        if(info.column !== undefined)
            info.column = parseInt(info.column)

        traceInfo.cache = info
    }

    return traceInfo.cache
}

function parseStacktrace(trace) {
    var results = []
    for(var n = 0; n<trace.length; n++) {
        results.push(new TraceInfo(trace[n]))
    }
    return results
}

// here because i'm lazy, they're here for testing only
module.exports.parsers = parsers
module.exports.mode = mode
module.exports.sourceCache = printStackTrace.implementation.prototype.sourceCache // expose this so you can consolidate caches together from different libraries

},{"./exceptionMode":31,"./tracelineParser":34,"stacktrace-js":32}],34:[function(_dereq_,module,exports){

module.exports = {
    chrome: function(line) {
        var m = line.match(CHROME_STACK_LINE);
        if (m) {
            var file = m[9] || m[18] || m[26]
            var fn = m[4] || m[7] || m[14] || m[23]
            var lineNumber = m[11] || m[20]
            var column = m[13] || m[22]
        } else {
            //throw new Error("Couldn't parse exception line: "+line)
        }
        
        return {
            file: file,
            function: fn,
            line: lineNumber,
            column: column
        }
    },
    
    firefox: function(line) {
        var m = line.match(FIREFOX_STACK_LINE);
        if (m) {
            var file = m[8]
            var fn = m[1]
            var lineNumber = m[10]
            var column = m[12]
        }
        
        return {
            file: file,
            function: fn,
            line: lineNumber,
            column: column
        }
    },
    
    ie: function(line) {
        var m = line.match(IE_STACK_LINE);
        if (m) {
            var file = m[3] || m[10]
            var fn = m[2] || m[9]
            var lineNumber = m[5] || m[12]
            var column = m[7] || m[14]
        }
        
        return {
            file: file,
            function: fn,
            line: lineNumber,
            column: column
        }
    }
}

// The following 2 regex patterns were originally taken from google closure library: https://code.google.com/p/closure-library/source/browse/closure/goog/testing/stacktrace.js
// RegExp pattern for JavaScript identifiers. We don't support Unicode identifiers defined in ECMAScript v3.
var IDENTIFIER_PATTERN_ = '[a-zA-Z_$][\\w$]*';
// RegExp pattern for an URL + position inside the file.
var URL_PATTERN_ = '((?:http|https|file)://[^\\s)]+?|javascript:.*)';
var FILE_AND_LINE = URL_PATTERN_+'(:(\\d*)(:(\\d*))?)'

var STACKTRACE_JS_GETSOURCE_FAILURE = 'getSource failed with url'

var CHROME_STACKTRACE_JS_GETSOURCE_FAILURE = STACKTRACE_JS_GETSOURCE_FAILURE+'((?!'+'\\(\\)@'+').)*'

var CHROME_FILE_AND_LINE = FILE_AND_LINE//URL_PATTERN_+'(:(\\d*):(\\d*))'
var CHROME_IDENTIFIER_PATTERN = '\\<?'+IDENTIFIER_PATTERN_+'\\>?'
var CHROME_COMPOUND_IDENTIFIER = "((new )?"+CHROME_IDENTIFIER_PATTERN+'(\\.'+CHROME_IDENTIFIER_PATTERN+')*)( \\[as '+IDENTIFIER_PATTERN_+'])?'
var CHROME_UNKNOWN_IDENTIFIER = "(\\(\\?\\))"

// output from stacktrace.js is: "name()@..." instead of "name (...)"
var CHROME_ANONYMOUS_FUNCTION = '('+CHROME_STACKTRACE_JS_GETSOURCE_FAILURE+'|'+CHROME_COMPOUND_IDENTIFIER+'|'+CHROME_UNKNOWN_IDENTIFIER+')'
                                    +'\\(\\)'+'@'+CHROME_FILE_AND_LINE
var CHROME_NORMAL_FUNCTION = CHROME_COMPOUND_IDENTIFIER+' \\('+CHROME_FILE_AND_LINE+'\\)'
var CHROME_NATIVE_FUNCTION = CHROME_COMPOUND_IDENTIFIER+' (\\(native\\))'

var CHROME_FUNCTION_CALL = '('+CHROME_ANONYMOUS_FUNCTION+"|"+CHROME_NORMAL_FUNCTION+"|"+CHROME_NATIVE_FUNCTION+')'

var CHROME_STACK_LINE = new RegExp('^'+CHROME_FUNCTION_CALL+'$')  // precompile them so its faster


var FIREFOX_STACKTRACE_JS_GETSOURCE_FAILURE = STACKTRACE_JS_GETSOURCE_FAILURE+'((?!'+'\\(\\)@'+').)*'+'\\(\\)'
var FIREFOX_FILE_AND_LINE = FILE_AND_LINE//URL_PATTERN_+'((:(\\d*):(\\d*))|(:(\\d*)))'
var FIREFOX_ARRAY_PART = '\\[\\d*\\]'
var FIREFOX_WEIRD_PART = '\\(\\?\\)'
var FIREFOX_COMPOUND_IDENTIFIER = '(('+IDENTIFIER_PATTERN_+'|'+FIREFOX_ARRAY_PART+'|'+FIREFOX_WEIRD_PART+')((\\(\\))?|(\\.|\\<|/)*))*'
var FIREFOX_FUNCTION_CALL = '('+FIREFOX_COMPOUND_IDENTIFIER+'|'+FIREFOX_STACKTRACE_JS_GETSOURCE_FAILURE+')@'+FIREFOX_FILE_AND_LINE
var FIREFOX_STACK_LINE = new RegExp('^'+FIREFOX_FUNCTION_CALL+'$')

var IE_WHITESPACE = '[\\w \\t]'
var IE_FILE_AND_LINE = FILE_AND_LINE
var IE_ANONYMOUS = '('+IE_WHITESPACE+'*({anonymous}\\(\\)))@\\('+IE_FILE_AND_LINE+'\\)'
var IE_NORMAL_FUNCTION = '('+IDENTIFIER_PATTERN_+')@'+IE_FILE_AND_LINE
var IE_FUNCTION_CALL = '('+IE_NORMAL_FUNCTION+'|'+IE_ANONYMOUS+')'+IE_WHITESPACE+'*'
var IE_STACK_LINE = new RegExp('^'+IE_FUNCTION_CALL+'$')
},{}],35:[function(_dereq_,module,exports){
module.exports = function returnResults(unitTestObject) {

    var results;
    var groups = {}
    var groupMetadata = {}

    var primaryGroup;
    var ended = false

    unitTestObject.events({
        group: function(e) {
            var g = {
               parent: e.parent,
               id: e.id,              // a unique id for the test group
               type: 'group',         // indicates a test group (either a `Unit.test` call or `this.test`)
               name: e.name,          // the name of the test
               results: [],           // An array of test results, which can be of an `UnitTest` Result Types
               exceptions: [],        // An array of uncaught exceptions thrown in the test,
               time: e.time,
               duration: 0            // the duration of the test from its start til the last test action (assert, log, etc)
               //                       including asynchronous parts and including subtests
               //syncDuration: _,      // the synchronous duration of the test (not including any asynchronous parts)
               //totalSyncDuration: _  // syncDuration plus the before and after (if applicable)
            }

            if(primaryGroup === undefined) primaryGroup = g

            groups[e.id] = g
            groupMetadata[e.id] = {}
            if(e.parent === undefined) {
                results = g
            } else {
                groups[e.parent].results.push(g)
            }
        },
        assert: function(e) {
            e.type = 'assert'
            groups[e.parent].results.push(e)
            setGroupDuration(e.parent, e.time)
        },
        count: function(e) {
            e.type = 'assert'
            setGroupDuration(e.parent, e.time)

            groupMetadata[e.parent].countInfo = e
        },
        exception: function(e) {
            groups[e.parent].exceptions.push(e.error)
            setGroupDuration(e.parent, e.time)
        },
        log: function(e) {
            e.type = 'log'
            groups[e.parent].results.push(e)
            setGroupDuration(e.parent, e.time)
        },
        before: function(e) {
            groups[e.parent].beforeStart = e.time
        },
        after: function(e) {
            groups[e.parent].afterStart = e.time
        },
        beforeEnd: function(e) {
            groups[e.parent].beforeDuration = e.time - groups[e.parent].beforeStart
        },
        afterEnd: function(e) {
            groups[e.parent].afterDuration = e.time - groups[e.parent].afterStart
        },
        groupEnd: function(e) {
            setGroupDuration(e.id, e.time)
        },
        end: function(e) {
            primaryGroup.timeout = e.type === 'timeout'
            setGroupDuration(primaryGroup.id, e.time)

            // make the count assertions
            eachTest(primaryGroup, function(subtest, parenttest) {
                var countInfo = groupMetadata[subtest.id].countInfo
                if(countInfo !== undefined) {
                    var info = countInfo
                    var actualCount = 0
                    subtest.results.forEach(function(a) {
                        if(a.type === 'assert' || a.type === 'group')
                            actualCount++
                    })

                    subtest.results.splice(0,0,{
                        parent: subtest.id,
                        type: 'assert',
                        success: actualCount === info.expected,
                        time: info.time,
                        sourceLines: info.sourceLines,
                        file: info.file,
                        line: info.line,
                        column: info.column,
                        expected: info.expected,
                        actual: actualCount
                    })
                }
            })

            ended = true
        }
    })

    function setGroupDuration(groupid, time) {
        var newDuration = time - groups[groupid].time
        if(newDuration > groups[groupid].duration) {
            groups[groupid].duration = newDuration
        }

        if(groups[groupid].parent) {
            setGroupDuration(groups[groupid].parent, time)
        }
    }

    return results
}


// iterates through the tests and subtests leaves first (depth first)
function eachTest(test, callback, parent) {
    test.results.forEach(function(result) {
        if(result.type === 'group') {
            eachTest(result, callback, test)
        }
    })

    callback(test, parent)
}
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyJGOlxcYmlsbHlzRmlsZVxcY29kZVxcamF2YXNjcmlwdFxcbm9kZWpzXFxkZWFkdW5pdENvcmVcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9kZWFkdW5pdENvcmUuYnJvd3Nlci5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvZGVhZHVuaXRDb3JlLmJyb3dzZXJDb25maWcuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL2RlYWR1bml0Q29yZS5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvaXNSZWxhdGl2ZS5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2FqYXgvYWpheC5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2FqYXgvbm9kZV9tb2R1bGVzL2FzeW5jLWZ1dHVyZS9hc3luY0Z1dHVyZS5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2FqYXgvbm9kZV9tb2R1bGVzL2FzeW5jLWZ1dHVyZS9ub2RlX21vZHVsZXMvdHJpbUFyZ3VtZW50cy90cmltQXJndW1lbnRzLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYXN5bmMtZnV0dXJlL2FzeW5jRnV0dXJlLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnkvaW5kZXguanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wdW55Y29kZS9wdW55Y29kZS5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9kZWNvZGUuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2luZGV4LmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXJsL3VybC5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3Byb3RvL3Byb3RvLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC1yZXNvbHZlL25vZGVfbW9kdWxlcy9yZXNvbHZlLXVybC9yZXNvbHZlLXVybC5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAtcmVzb2x2ZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC11cmwvc291cmNlLW1hcC11cmwuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwLXJlc29sdmUvc291cmNlLW1hcC1yZXNvbHZlLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYXJyYXktc2V0LmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9iYXNlNjQtdmxxLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9iYXNlNjQuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL2JpbmFyeS1zZWFyY2guanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL3NvdXJjZS1tYXAtY29uc3VtZXIuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL3NvdXJjZS1tYXAtZ2VuZXJhdG9yLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9zb3VyY2Utbm9kZS5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvdXRpbC5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbm9kZV9tb2R1bGVzL2FtZGVmaW5lL2FtZGVmaW5lLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2tpbmZvL2V4Y2VwdGlvbk1vZGUuanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja2luZm8vbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtanMvc3RhY2t0cmFjZS5qcyIsIkY6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3N0YWNraW5mby9zdGFja2luZm8uanMiLCJGOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja2luZm8vdHJhY2VsaW5lUGFyc2VyLmpzIiwiRjovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL2RlYWR1bml0Q29yZS9wcm9jZXNzUmVzdWx0cy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbDJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMzU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25zQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5ZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbllBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcclxuLyogQ29weXJpZ2h0IChjKSAyMDE0IEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xyXG5cclxudmFyIGRlYWR1bml0Q29yZSA9IHJlcXVpcmUoXCIuL2RlYWR1bml0Q29yZVwiKVxyXG52YXIgYnJvd3NlckNvbmZpZyA9IHJlcXVpcmUoJy4vZGVhZHVuaXRDb3JlLmJyb3dzZXJDb25maWcnKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBkZWFkdW5pdENvcmUoYnJvd3NlckNvbmZpZygpKSIsIlwidXNlIHN0cmljdFwiO1xyXG4vKiBDb3B5cmlnaHQgKGMpIDIwMTQgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXHJcblxyXG52YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcclxuXHJcbnZhciBGdXR1cmUgPSByZXF1aXJlKCdhc3luYy1mdXR1cmUnKVxyXG52YXIgcHJvdG8gPSByZXF1aXJlKCdwcm90bycpXHJcbnZhciBzdGFja2luZm8gPSByZXF1aXJlKCdzdGFja2luZm8nKVxyXG52YXIgYWpheCA9IHJlcXVpcmUoXCJhamF4XCIpXHJcbnZhciByZXNvbHZlU291cmNlTWFwID0gRnV0dXJlLndyYXAocmVxdWlyZSgnc291cmNlLW1hcC1yZXNvbHZlJykucmVzb2x2ZVNvdXJjZU1hcClcclxuXHJcbnZhciBkZWFkdW5pdENvcmUgPSByZXF1aXJlKFwiLi9kZWFkdW5pdENvcmVcIilcclxudmFyIGlzUmVsYXRpdmUgPSByZXF1aXJlKCcuL2lzUmVsYXRpdmUnKVxyXG5cclxuYWpheC5zZXRTeW5jaHJvbm91cyh0cnVlKSAvLyB0b2RvOiBSRU1PVkUgVEhJUyBvbmNlIHRoaXMgY2hyb21lIGJ1ZyBpcyBmaXhlZCBpbiBhIHB1YmxpYyByZWxlYXNlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MzY4NDQ0XHJcblxyXG4vLyBhZGQgc291cmNlRmlsZSBjb250ZW50cyBpbnRvIHN0YWNrdHJhY2UuanMncyBjYWNoZVxyXG52YXIgc291cmNlQ2FjaGUgPSB7fVxyXG52YXIgY2FjaGVHZXQgPSBmdW5jdGlvbih1cmwpIHtcclxuICAgIHJldHVybiBzb3VyY2VDYWNoZVt1cmxdXHJcbn1cclxudmFyIGNhY2hlU2V0ID0gZnVuY3Rpb24odXJsLCByZXNwb25zZUZ1dHVyZSkge1xyXG4gICAgc291cmNlQ2FjaGVbdXJsXSA9IHJlc3BvbnNlRnV0dXJlXHJcbiAgICBpZihzdGFja2luZm8uc291cmNlQ2FjaGVbdXJsXSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmVzcG9uc2VGdXR1cmUudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xyXG4gICAgICAgICAgICBzdGFja2luZm8uc291cmNlQ2FjaGVbdXJsXSA9IHJlc3BvbnNlLnRleHQuc3BsaXQoJ1xcbicpXHJcbiAgICAgICAgfSkuZG9uZSgpXHJcbiAgICB9XHJcbn1cclxuXHJcbmlmKHdpbmRvdy5zZXRJbW1lZGlhdGUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgd2luZG93LnNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uKGZuLCBwYXJhbXMpIHtcclxuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBmbi5hcHBseSh0aGlzLHBhcmFtcylcclxuICAgICAgICB9LDApXHJcbiAgICB9XHJcbn1cclxuXHJcbmFqYXguY2FjaGVHZXQoY2FjaGVHZXQpXHJcbmFqYXguY2FjaGVTZXQoY2FjaGVTZXQpXHJcblxyXG5cclxudmFyIGNvbmZpZyA9IG1vZHVsZS5leHBvcnRzID0gcHJvdG8oZnVuY3Rpb24oKSB7XHJcbiAgICB0aGlzLmluaXQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgdGhhdCA9IHRoaXNcclxuICAgICAgICAvLyBub2RlLmpzIGVycmJhY2sgc3R5bGUgcmVhZEZpbGVcclxuICAgICAgICAvKnByaXZhdGUqLyB0aGlzLnJlYWRGaWxlID0gZnVuY3Rpb24odXJsLCBjYWxsYmFjaykge1xyXG4gICAgICAgICAgICB0aGF0LmFqYXgodXJsKS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7IC8vIG5lZWQgdG8gdXNlICd0aGF0JyBiZWNhdXNlIHJlYWRGaWxlIHdpbGwgbm90IGJlIGNhbGxlZCB3aXRoIHRoaXMgY29uZmlnIG9iamVjdCBhcyB0aGUgY29udGV4dFxyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXNwb25zZS50ZXh0KVxyXG4gICAgICAgICAgICB9KS5jYXRjaChjYWxsYmFjaykuZG9uZSgpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuYWpheCA9IGFqYXhcclxuXHJcbiAgICB0aGlzLmluaXRpYWxpemUgPSBmdW5jdGlvbigpIHt9XHJcblxyXG4gICAgdGhpcy5pbml0aWFsaXplTWFpblRlc3QgPSBmdW5jdGlvbih0ZXN0U3RhdGUsIGZha2VUZXN0KSB7XHJcbiAgICAgICAgLy90ZXN0U3RhdGUuYWN0aXZlID0gdHJ1ZSAvLyBtYWtlIHN1cmVcclxuXHJcbiAgICAgICAgdGVzdFN0YXRlLm9sZE9uZXJyb3IgPSB3aW5kb3cub25lcnJvclxyXG4gICAgICAgIHRlc3RTdGF0ZS5uZXdPbmVycm9yID0gd2luZG93Lm9uZXJyb3IgPSBmdW5jdGlvbihlcnJvck1lc3NhZ2UsIGZpbGVuYW1lLCBsaW5lLCBjb2x1bW4pIHtcclxuICAgICAgICAgICAgaWYoY29sdW1uID09PSB1bmRlZmluZWQpIHZhciBjb2x1bW5UZXh0ID0gJydcclxuICAgICAgICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgIHZhciBjb2x1bW5UZXh0ID0gXCIvXCIrY29sdW1uXHJcblxyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuY2F1Z2h0IGVycm9yIGluIFwiK2ZpbGVuYW1lK1wiIGxpbmUgXCIrbGluZStjb2x1bW5UZXh0K1wiOiBcIitlcnJvck1lc3NhZ2UpIC8vIElFIG5lZWRzIHRoZSBleGNlcHRpb24gdG8gYWN0dWFsbHkgYmUgdGhyb3duIGJlZm9yZSBpdCB3aWxsIGhhdmUgYSBzdGFjayB0cmFjZVxyXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgIGlmKGVycm9yTWVzc2FnZSAgPT09ICdTY3JpcHQgZXJyb3IuJykgeyAgLy8gaGFwcGVucyB3aGVuIGEgamF2YXNjcmlwdCBjYWxsIHZpb2xhdGVzIHRoZSBzYW1lIG9yaWdpbiBwb2xpY3kgKHRoaXMgd2lsbCBoYXBwZW4gZm9yIGFsbCBmaWxlOi8vIHByb3RvY29sIHN0dWZmKVxyXG4gICAgICAgICAgICAgICAgICAgIGZha2VUZXN0Lm1haW5TdWJUZXN0Lndhcm5pbmdIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRlc3RTdGF0ZS51bmhhbmRsZWRFcnJvckhhbmRsZXIoZSwgdHJ1ZSlcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZih0ZXN0U3RhdGUub2xkT25lcnJvcilcclxuICAgICAgICAgICAgICAgICAgICB0ZXN0U3RhdGUub2xkT25lcnJvci5hcHBseSh0aGlzLCBhcmd1bWVudHMpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICB0aGlzLm1haW5UZXN0RG9uZT0gZnVuY3Rpb24odGVzdFN0YXRlKSB7XHJcbiAgICAgICAgLy90ZXN0U3RhdGUuYWN0aXZlID0gZmFsc2UgLy8gbWFrZSBzdXJlIHRoZSB0ZXN0LXNwZWNpZmljIG9uZXJyb3IgY29kZSBpcyBubyBsb25nZXIgcnVuXHJcbiAgICAgICAgLyppZih0ZXN0U3RhdGUubmV3T25lcnJvciA9PT0gd2luZG93Lm9uZXJyb3IpIHtcclxuICAgICAgICAgICAgd2luZG93Lm9uZXJyb3IgPSB0ZXN0U3RhdGUub2xkT25lcnJvciAvLyBvdGhlcndpc2Ugc29tZXRoaW5nIGVsc2UgaGFzIG92ZXJ3cml0dGVuIG9uZXJyb3IsIHNvIGRvbid0IG1lc3Mgd2l0aCBpdFxyXG4gICAgICAgIH0qL1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuZ2V0RG9tYWluPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkIC8vIGRvbWFpbnMgZG9uJ3QgZXhpc3QgaW4tYnJvd3NlclxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucnVuVGVzdEdyb3VwPSBmdW5jdGlvbihkZWFkdW5pdFN0YXRlLCB0ZXN0ZXIsIHJ1blRlc3QsIGhhbmRsZUVycm9yLCBoYW5kbGVVbmhhbmRsZWRFcnJvcikge1xyXG4gICAgICAgIHJ1blRlc3QoKVxyXG4gICAgfVxyXG4gICAgdGhpcy5nZXRTY3JpcHRTb3VyY2VMaW5lcz0gZnVuY3Rpb24ocGF0aCkge1xyXG4gICAgICAgIGlmKHN0YWNraW5mby5zb3VyY2VDYWNoZVtwYXRoXSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoc3RhY2tpbmZvLnNvdXJjZUNhY2hlW3BhdGhdKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFqYXgocGF0aCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShyZXNwb25zZS50ZXh0LnNwbGl0KCdcXG4nKSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcblxyXG4gICAgfVxyXG4gICAgdGhpcy5nZXRTb3VyY2VNYXBPYmplY3QgPSBmdW5jdGlvbih1cmwsIHdhcm5pbmdIYW5kbGVyKSB7XHJcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYWpheCh1cmwpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcclxuICAgICAgICAgICAgdmFyIGhlYWRlcnMgPSByZXNwb25zZS5oZWFkZXJzXHJcbiAgICAgICAgICAgIGlmKGhlYWRlcnNbJ1NvdXJjZU1hcCddICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHZhciBoZWFkZXJTb3VyY2VNYXAgPSBoZWFkZXJzWydTb3VyY2VNYXAnXVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYoaGVhZGVyc1snWC1Tb3VyY2VNYXAnXSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGhlYWRlclNvdXJjZU1hcCA9IGhlYWRlcnNbJ1gtU291cmNlTWFwJ11cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYoaGVhZGVyU291cmNlTWFwICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGlmKGlzUmVsYXRpdmUoaGVhZGVyU291cmNlTWFwKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlclNvdXJjZU1hcCA9IHBhdGguam9pbihwYXRoLmRpcm5hbWUodXJsKSxoZWFkZXJTb3VyY2VNYXApXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoYXQuYWpheChoZWFkZXJTb3VyY2VNYXApLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKEpTT04ucGFyc2UocmVzcG9uc2UudGV4dCkpXHJcbiAgICAgICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlU291cmNlTWFwKHJlc3BvbnNlLnRleHQsIHVybCwgdGhhdC5yZWFkRmlsZSkuY2F0Y2goZnVuY3Rpb24oZSl7XHJcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKHVuZGVmaW5lZClcclxuXHJcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcE9iamVjdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKHNvdXJjZU1hcE9iamVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKHNvdXJjZU1hcE9iamVjdC5tYXApXHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZSh1bmRlZmluZWQpXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5kZWZhdWx0VW5oYW5kbGVkRXJyb3JIYW5kbGVyPSBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgLy9pZihlICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBpZihlLnN0YWNrKVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGUuc3RhY2spXHJcbiAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coZSlcclxuICAgICAgICAgICAgfSwwKVxyXG4gICAgfVxyXG4gICAgdGhpcy5kZWZhdWx0VGVzdEVycm9ySGFuZGxlcj0gZnVuY3Rpb24odGVzdGVyKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgdGVzdGVyLm1hbmFnZXIuZW1pdCgnZXhjZXB0aW9uJywge1xyXG4gICAgICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIubWFpblN1YlRlc3QuaWQsXHJcbiAgICAgICAgICAgICAgICB0aW1lOiAobmV3IERhdGUoKSkuZ2V0VGltZSgpLFxyXG4gICAgICAgICAgICAgICAgZXJyb3I6IGVcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5nZXRMaW5lSW5mbz0gZnVuY3Rpb24oc3RhY2tJbmNyZWFzZSkge1xyXG4gICAgICAgIHJldHVybiBzdGFja2luZm8oKVszK3N0YWNrSW5jcmVhc2VdXHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5nZXRFeGNlcHRpb25JbmZvPSBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgcmV0dXJuIHN0YWNraW5mbyhlKVxyXG4gICAgfVxyXG59KSIsIlwidXNlIHN0cmljdFwiO1xyXG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXHJcblxyXG52YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxyXG52YXIgVXJsID0gcmVxdWlyZShcInVybFwiKVxyXG5cclxudmFyIHByb3RvID0gcmVxdWlyZSgncHJvdG8nKVxyXG52YXIgRnV0dXJlID0gcmVxdWlyZSgnYXN5bmMtZnV0dXJlJylcclxudmFyIFNvdXJjZU1hcENvbnN1bWVyID0gcmVxdWlyZSgnc291cmNlLW1hcCcpLlNvdXJjZU1hcENvbnN1bWVyXHJcblxyXG52YXIgcHJvY2Vzc1Jlc3VsdHMgPSByZXF1aXJlKCcuL3Byb2Nlc3NSZXN1bHRzJylcclxudmFyIGlzUmVsYXRpdmUgPSByZXF1aXJlKCcuL2lzUmVsYXRpdmUnKVxyXG5cclxuLy8gcmV0dXJucyBhIG1vZHVsZSBpbnRlbmRlZCBmb3IgYSBzcGVjaWZpYyBlbnZpcm9ubWVudCAodGhhdCBlbnZpcm9ubWVudCBiZWluZyBkZXNjcmliZWQgYnkgdGhlIG9wdGlvbnMpXHJcbi8vIG9wdGlvbnMgY2FuIGNvbnRhaW46XHJcbiAgICAvLyBpbml0aWFsaXphdGlvbiAtIGEgZnVuY3Rpb24gcnVuIG9uY2UgdGhhdCBjYW4gc2V0dXAgdGhpbmdzIChsaWtlIGEgZ2xvYmFsIGVycm9yIGhhbmRsZXIpLlxyXG4gICAgICAgIC8vIEdldHMgYSBzaW5nbGUgcGFyYW1ldGVyICdzdGF0ZScgd2hpY2ggaGFzIHRoZSBmb2xsb3dpbmcgZm9ybTpcclxuICAgICAgICAgICAgLy8gdW5oYW5kbGVkRXJyb3JIYW5kbGVyKGVycm9yLHdhcm4pXHJcbiAgICAvLyBpbml0aWFsaXplTWFpblRlc3QgLSBhIGZ1bmN0aW9uIHJ1biBvbmNlIHRoYXQgY2FuIHNldHVwIHRoaW5ncyAobGlrZSBhIHRlc3Qtc3BlY2lmaWMgaGFuZGxlcikuXHJcbiAgICAgICAgLy8gR2V0cyBhIHNpbmdsZSBwYXJhbWV0ZXIgJ21haW5UZXN0U3RhdGUnIHdoaWNoIGhhcyB0aGUgZm9sbG93aW5nIGZvcm06XHJcbiAgICAgICAgICAgIC8vIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlcnJvcix3YXJuKSAtIHRoZSBlcnJvciBoYW5kbGVyIGZvciB0aGF0IHRlc3RcclxuICAgIC8vIGdldERvbWFpbiAtIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjdXJyZW50IGRvbWFpbiwgb3IgdW5kZWZpbmVkIGlmIHRoZSBlbnZpcm9ubWVudCAoKmNvdWdoKiBicm93c2VycykgZG9lc24ndCBoYXZlIGRvbWFpbnNcclxuICAgIC8vIGdldFNvdXJjZU1hcE9iamVjdCAtIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgZnV0dXJlIG9mIHRoZSBwcmUtcGFyc2VkIHNvdXJjZSBtYXAgb2JqZWN0IGZvciBhIGZpbGUsIG9yIGZ1dHVyZSB1bmRlZmluZWRcclxuICAgICAgICAvLyBnZXRzIHRoZSBwYXJhbWV0ZXI6XHJcbiAgICAgICAgICAgIC8vIHVybCAtIHRoZSB1cmwgb2YgdGhlIGZpbGUgdG8gZmluZCBhIHNvdXJjZW1hcCBmb3JcclxuICAgICAgICAgICAgLy8gd2FybmluZ0hhbmRsZXIgLSBhIHdhcm5pbmdIYW5kbGVyIGZ1bmN0aW9uIHRoYXQgZXhwZWN0cyBhbiBlcnJvciB0byBiZSBwYXNzZWQgdG8gaXRcclxuICAgIC8vIHJ1blRlc3RHcm91cCAtIGEgZnVuY3Rpb24gcnVuIHRoYXQgYWxsb3dzIHlvdSB0byB3cmFwIHRoZSBhY3R1YWwgdGVzdCBydW4gaW4gc29tZSB3YXkgKGludGVuZGVkIGZvciBub2RlLmpzIGRvbWFpbnMpXHJcbiAgICAgICAgLy8gZ2V0cyBwYXJhbWV0ZXJzOlxyXG4gICAgICAgICAgICAvLyBzdGF0ZSAtIHRoZSBzYW1lIHN0YXRlIG9iamVjdCBzZW50IGludG8gYGluaXRpYWxpemF0aW9uYFxyXG4gICAgICAgICAgICAvLyB0ZXN0ZXIgLSBhIFVuaXRUZXN0ZXIgb2JqZWN0IGZvciB0aGUgdGVzdFxyXG4gICAgICAgICAgICAvLyBydW5UZXN0IC0gdGhlIGZ1bmN0aW9uIHRoYXQgeW91IHNob3VsZCBjYWxsIHRvIHJ1biB0aGUgdGVzdCBncm91cC4gQWxyZWFkeSBoYXMgYSBzeW5jaHJvbm91cyB0cnkgY2F0Y2ggaW5zaWRlIGl0IChzbyB5b3UgZG9uJ3QgbmVlZCB0byB3b3JyeSBhYm91dCB0aGF0KVxyXG4gICAgICAgICAgICAvLyBoYW5kbGVFcnJvciAtIGEgZnVuY3Rpb24gdGhhdCBoYW5kbGVzIGFuIGVycm9yIGlmIG9uZSBjb21lcyB1cC4gVGFrZXMgdGhlIGVycm9yIGFzIGl0cyBvbmx5IHBhcmFtZXRlci4gUmV0dXJucyBhIGZ1dHVyZS5cclxuICAgIC8vIG1haW5UZXN0RG9uZSAtIGEgZnVuY3Rpb24gcnVuIG9uY2UgYSB0ZXN0IGlzIGRvbmVcclxuICAgICAgICAvLyBnZXRzIHRoZSAnbWFpblRlc3RTdGF0ZScgcGFyYW1ldGVyXHJcbiAgICAvLyBkZWZhdWx0VW5oYW5kbGVkRXJyb3JIYW5kbGVyIC0gYSBmdW5jdGlvbiB0aGF0IGhhbmRsZXMgYW4gZXJyb3IgdW5oYW5kbGVkIGJ5IGFueSBvdGhlciBoYW5kbGVyXHJcbiAgICAgICAgLy8gZ2V0cyB0aGUgJ2Vycm9yJyBhcyBpdHMgb25seSBwYXJhbWV0ZXJcclxuICAgIC8vIGRlZmF1bHRUZXN0RXJyb3JIYW5kbGVyIC0gaXMgcGFzc2VkIHRoZSBjdXJyZW50IHRlc3QsIGFuZCBzaG91bGQgcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCBoYW5kbGVzIGFuIGVycm9yXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG5cclxuICAgIC8vIGEgdmFyaWFibGUgdGhhdCBob2xkcyBjaGFuZ2VhYmxlIHN0YXRlXHJcbiAgICB2YXIgc3RhdGUgPSB7XHJcbiAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyOiBvcHRpb25zLmRlZmF1bHRVbmhhbmRsZWRFcnJvckhhbmRsZXJcclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLmluaXRpYWxpemUoc3RhdGUpXHJcblxyXG4gICAgLy8gdGhlIHByb3RvdHlwZSBvZiBvYmplY3RzIHVzZWQgdG8gbWFuYWdlIGFjY2Vzc2luZyBhbmQgZGlzcGxheWluZyByZXN1bHRzIG9mIGEgdW5pdCB0ZXN0XHJcbiAgICB2YXIgVW5pdFRlc3QgPSBwcm90byhmdW5jdGlvbigpIHtcclxuICAgICAgICB0aGlzLmluaXQgPSBmdW5jdGlvbigvKm1haW5OYW1lPXVuZGVmaW5lZCwgZ3JvdXBzKi8pIHtcclxuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzXHJcbiAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzXHJcbiAgICAgICAgICAgIHRoaXMubWFuYWdlciA9IEV2ZW50TWFuYWdlcih0aGlzKVxyXG5cclxuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIHJ1blRlc3QuY2FsbCh0aGF0LCBhcmdzKVxyXG4gICAgICAgICAgICB9LDApXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmV2ZW50cyA9IGZ1bmN0aW9uKGhhbmRsZXJzKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFuYWdlci5hZGQoaGFuZGxlcnMsIG9wdGlvbnMuZ2V0RG9tYWluKCkpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlc3VsdHMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHByb2Nlc3NSZXN1bHRzKHRoaXMpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBwcml2YXRlXHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIHJ1blRlc3QoYXJncykge1xyXG4gICAgICAgICAgICB2YXIgZmFrZVRlc3QgPSBuZXcgVW5pdFRlc3RlcigpXHJcbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5pZCA9IHVuZGVmaW5lZCAvLyBmYWtlIHRlc3QgZG9lc24ndCBnZXQgYW4gaWRcclxuICAgICAgICAgICAgICAgIGZha2VUZXN0Lm1hbmFnZXIgPSB0aGlzLm1hbmFnZXJcclxuICAgICAgICAgICAgICAgIGZha2VUZXN0LnRpbWVvdXRzID0gW11cclxuICAgICAgICAgICAgICAgIGZha2VUZXN0Lm9uRG9uZUNhbGxiYWNrcyA9IFtdXHJcblxyXG4gICAgICAgICAgICAgICAgdmFyIGdldFVuaGFuZGxlZEVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB1bmhhbmRsZWRFcnJvckhhbmRsZXIgPSBjcmVhdGVVbmhhbmRsZWRFcnJvckhhbmRsZXIoZmFrZVRlc3QubWFpblN1YlRlc3QpXHJcbiAgICAgICAgICAgICAgICAgICAgZ2V0VW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24oKSB7IC8vIG1lbW9pemUgdGhpcyBqdW5rXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmhhbmRsZWRFcnJvckhhbmRsZXJcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuaGFuZGxlZEVycm9ySGFuZGxlclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZmFrZVRlc3QubWFpblRlc3RTdGF0ZSA9IHtnZXQgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKCl7cmV0dXJuIGdldFVuaGFuZGxlZEVycm9ySGFuZGxlcigpIHx8IG9wdGlvbnMuZGVmYXVsdFRlc3RFcnJvckhhbmRsZXIoZmFrZVRlc3QpfX1cclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgd2FybmluZ0luZm9NZXNzYWdlSGFzQmVlbk91dHB1dCA9IGZhbHNlXHJcbiAgICAgICAgICAgICAgICBmYWtlVGVzdC53YXJuaW5nSGFuZGxlciA9IGZ1bmN0aW9uKHcpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgZXJyb3JIYW5kbGVyID0gZ2V0VW5oYW5kbGVkRXJyb3JIYW5kbGVyKClcclxuICAgICAgICAgICAgICAgICAgICBpZih3YXJuaW5nSW5mb01lc3NhZ2VIYXNCZWVuT3V0cHV0ID09PSBmYWxzZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgd2FybmluZyA9IG5ld0Vycm9yKFwiWW91J3ZlIHJlY2VpdmVkIGF0IGxlYXN0IG9uZSB3YXJuaW5nLiBJZiB5b3UgZG9uJ3Qgd2FudCB0byB0cmVhdCB3YXJuaW5ncyBhcyBlcnJvcnMsIHVzZSB0aGUgYHdhcm5pbmdgIG1ldGhvZCB0byByZWRlZmluZSBob3cgdG8gaGFuZGxlIHRoZW0uXCIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9ySGFuZGxlcih3YXJuaW5nLCBmYWxzZSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZ0luZm9NZXNzYWdlSGFzQmVlbk91dHB1dCA9IHRydWVcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGVycm9ySGFuZGxlcih3LCBmYWxzZSlcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmluaXRpYWxpemVNYWluVGVzdChmYWtlVGVzdC5tYWluVGVzdFN0YXRlLCBmYWtlVGVzdClcclxuXHJcbiAgICAgICAgICAgICAgICB0aW1lb3V0KGZha2VUZXN0LCAzMDAwLCB0cnVlKSAvLyBpbml0aWFsIChkZWZhdWx0KSB0aW1lb3V0XHJcbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5vbkRvbmUgPSBmdW5jdGlvbigpIHsgLy8gd2lsbCBleGVjdXRlIHdoZW4gdGhpcyB0ZXN0IGlzIGRvbmVcclxuICAgICAgICAgICAgICAgICAgICBmYWtlVGVzdC5tYW5hZ2VyLmxhc3RFbWl0RnV0dXJlLnRoZW4oZnVuY3Rpb24oKSB7IC8vIHdhaXQgZm9yIGFsbCB0aGUgYWxyZWFkeS1yZWdpc3RlcmVkIGVtaXRzIHRvIGVtaXQgYmVmb3JlIGZpbmFsaXppbmcgdGhlIHRlc3RcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9uZShmYWtlVGVzdClcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5tYWluVGVzdERvbmUoZmFrZVRlc3QubWFpblRlc3RTdGF0ZSlcclxuICAgICAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGZha2VUZXN0LmNhbGxPbkRvbmUgPSBmdW5jdGlvbihjYikge1xyXG4gICAgICAgICAgICAgICAgICAgIGZha2VUZXN0Lm9uRG9uZUNhbGxiYWNrcy5wdXNoKGNiKVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgVW5pdFRlc3Rlci5wcm90b3R5cGUudGVzdC5hcHBseShmYWtlVGVzdCwgYXJncykgLy8gc2V0IHNvIHRoZSBlcnJvciBoYW5kbGVyIGNhbiBhY2Nlc3MgdGhlIHJlYWwgdGVzdFxyXG4gICAgICAgICAgICB0aGlzLm1haW5UZXN0ZXIgPSBmYWtlVGVzdFxyXG5cclxuICAgICAgICAgICAgZmFrZVRlc3QuZ3JvdXBFbmRlZCA9IHRydWVcclxuICAgICAgICAgICAgY2hlY2tHcm91cERvbmUoZmFrZVRlc3QpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuXHJcbiAgICB2YXIgRXZlbnRNYW5hZ2VyID0gcHJvdG8oZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgICAgIHRoaXMuaW5pdCA9IGZ1bmN0aW9uKHRlc3RPYmplY3QpIHtcclxuICAgICAgICAgICAgdGhpcy5oYW5kbGVycyA9IHtcclxuICAgICAgICAgICAgICAgIGdyb3VwOiBbXSxcclxuICAgICAgICAgICAgICAgIGFzc2VydDogW10sXHJcbiAgICAgICAgICAgICAgICBjb3VudDogW10sXHJcbiAgICAgICAgICAgICAgICBleGNlcHRpb246IFtdLFxyXG4gICAgICAgICAgICAgICAgbG9nOiBbXSxcclxuICAgICAgICAgICAgICAgIGVuZDogW10sXHJcbiAgICAgICAgICAgICAgICBncm91cEVuZDogW10sXHJcbiAgICAgICAgICAgICAgICBiZWZvcmU6IFtdLFxyXG4gICAgICAgICAgICAgICAgYWZ0ZXI6IFtdLFxyXG4gICAgICAgICAgICAgICAgYmVmb3JlRW5kOiBbXSxcclxuICAgICAgICAgICAgICAgIGFmdGVyRW5kOiBbXVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLmhpc3RvcnkgPSBbXVxyXG4gICAgICAgICAgICB0aGlzLmVtaXREZXB0aCA9IDAgLy8gcmVjb3JkcyBob3cgbWFueSBmdXR1cmVzIGFyZSB3YWl0aW5nIG9uIGVhY2hvdGhlciwgc28gd2UgY2FuIG1ha2Ugc3VyZSBtYXhpbXVtIHN0YWNrIGRlcHRoIGlzbid0IGV4Y2VlZGVkXHJcbiAgICAgICAgICAgIHRoaXMubGFzdEVtaXRGdXR1cmUgPSBGdXR1cmUodW5kZWZpbmVkKVxyXG4gICAgICAgICAgICB0aGlzLnRlc3RPYmplY3QgPSB0ZXN0T2JqZWN0XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnRlc3RPYmplY3Q7IC8vIHVzZWQgdG8gZ2V0IHRoZSByaWdodCB3YXJuaW5nSGFuZGxlclxyXG5cclxuICAgICAgICAvLyBlbWl0cyBhbiBldmVudFxyXG4gICAgICAgIC8vIGV2ZW50RGF0YUZ1dHVyZSByZXNvbHZlcyB0byBlaXRoZXIgYW4gZXZlbnREYXRhIG9iamVjdCwgb3IgdW5kZWZpbmVkIGlmIG5vdGhpbmcgc2hvdWxkIGJlIGVtaXR0ZWRcclxuICAgICAgICB0aGlzLmVtaXQgPSBmdW5jdGlvbih0eXBlLCBldmVudERhdGFGdXR1cmUpIHtcclxuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzXHJcbiAgICAgICAgICAgIHZhciBsYXN0RW1pdEZ1dHVyZSA9IHRoYXQubGFzdEVtaXRGdXR1cmUgLy8gY2FwdHVyZSBpdCBmb3IgdGhlIHBvc3NpYmxlIHNldFRpbWVvdXQgdGhyZWFkbGV0XHJcbiAgICAgICAgICAgIHZhciBkb1N0dWZmID0gZnVuY3Rpb24oZikge1xyXG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdEZ1dHVyZSA9IGxhc3RFbWl0RnV0dXJlLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV2ZW50RGF0YUZ1dHVyZVxyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbihldmVudERhdGEpe1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKGV2ZW50RGF0YSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRBbmRUcmlnZ2VySGFuZGxlcnMuY2FsbCh0aGF0LCB0eXBlLCBldmVudERhdGEpXHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhhdC50ZXN0T2JqZWN0Lndhcm5pbmdIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgICAgIGlmKGYgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdEZ1dHVyZS5maW5hbGx5KGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7Zi5yZXR1cm4oKX0sMCkgLy8gbWFrZSBzdXJlIHdlIGRvbid0IGdldCBhIFwidG9vIG11Y2ggcmVjdXJzaW9uIGVycm9yXCIgLy8gdG9kbzogdGVzdCBub3QgZG9pbmcgdGhpcyBvbmNlIGJyb3dzZXJzIGFsbCBzdXBwb3J0IHByb3BlciB0YWlsIGNhbGxzXHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZlxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0RnV0dXJlXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuZW1pdERlcHRoKytcclxuICAgICAgICAgICAgaWYodGhpcy5lbWl0RGVwdGggJSA1MCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhhdC5sYXN0RW1pdEZ1dHVyZSA9IGRvU3R1ZmYobmV3IEZ1dHVyZSlcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoYXQubGFzdEVtaXRGdXR1cmUgPSBkb1N0dWZmKClcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubGFzdEVtaXRGdXR1cmVcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIGFkZHMgYSBzZXQgb2YgbGlzdGVuaW5nIGhhbmRsZXJzIHRvIHRoZSBldmVudCBzdHJlYW0sIGFuZCBydW5zIHRob3NlIGhhbmRsZXJzIG9uIHRoZSBzdHJlYW0ncyBoaXN0b3J5XHJcbiAgICAgICAgLy8gZG9tYWluIGlzIG9wdGlvbmFsLCBidXQgaWYgZGVmaW5lZCB3aWxsIGJlIHRoZSBub2RlLmpzIGRvbWFpbiB0aGF0IHVuaGFuZGxlZCBlcnJvcnMgd2lsbCBiZSByb3V0ZWQgdG9cclxuICAgICAgICB0aGlzLmFkZCA9IGZ1bmN0aW9uKGhhbmRsZXJzLCBkb21haW4pIHtcclxuICAgICAgICAgICAgLy8gcnVuIHRoZSBoaXN0b3J5IG9mIGV2ZW50cyBvbiB0aGUgdGhlIGhhbmRsZXJzXHJcbiAgICAgICAgICAgIHRoaXMuaGlzdG9yeS5mb3JFYWNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIGlmKGhhbmRsZXJzW2UudHlwZV0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzW2UudHlwZV0uY2FsbCh1bmRlZmluZWQsIGUuZGF0YSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgICAgIC8vIHRoZW4gaGF2ZSB0aG9zZSBoYW5kbGVycyBsaXN0ZW4gb24gZnV0dXJlIGV2ZW50c1xyXG4gICAgICAgICAgICBmb3IodmFyIHR5cGUgaW4gaGFuZGxlcnMpIHtcclxuICAgICAgICAgICAgICAgIHZhciB0eXBlSGFuZGxlcnMgPSB0aGlzLmhhbmRsZXJzW3R5cGVdXHJcbiAgICAgICAgICAgICAgICBpZih0eXBlSGFuZGxlcnMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImV2ZW50IHR5cGUgJ1wiK3R5cGUrXCInIGludmFsaWRcIilcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0eXBlSGFuZGxlcnMucHVzaCh7aGFuZGxlcjogaGFuZGxlcnNbdHlwZV0sIGRvbWFpbjogZG9tYWlufSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gdGhlIHN5bmNocm9ub3VzIHBhcnQgb2YgZW1pdHRpbmdcclxuICAgICAgICBmdW5jdGlvbiByZWNvcmRBbmRUcmlnZ2VySGFuZGxlcnModHlwZSwgZXZlbnREYXRhKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlzdG9yeS5wdXNoKHt0eXBlOnR5cGUsIGRhdGE6IGV2ZW50RGF0YX0pXHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlcnNbdHlwZV0uZm9yRWFjaChmdW5jdGlvbihoYW5kbGVySW5mbykge1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVySW5mby5oYW5kbGVyLmNhbGwodW5kZWZpbmVkLCBldmVudERhdGEpXHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRocm93RXJyb3JGbiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlIC8vIHRocm93IGVycm9yIGFzeW5jaHJvbm91c2x5IGJlY2F1c2UgdGhlc2UgZXJyb3Igc2hvdWxkIGJlIHNlcGFyYXRlIGZyb20gdGhlIHRlc3QgZXhjZXB0aW9uc1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYoaGFuZGxlckluZm8uZG9tYWluKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93RXJyb3JGbiA9IGhhbmRsZXJJbmZvLmRvbWFpbi5iaW5kKHRocm93RXJyb3JGbikgICAgLy8gdGhpcyBkb21haW4gYmluZCBpcyBuZWVkZWQgYmVjYXVzZSBlbWl0IGlzIGRvbmUgaW5zaWRlIGRlYWR1bml0J3MgdGVzdCBkb21haW4sIHdoaWNoIGlzbid0IHdoZXJlIHdlIHdhbnQgdG8gcHV0IGVycm9ycyBjYXVzZWQgYnkgdGhlIGV2ZW50IGhhbmRsZXJzXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KHRocm93RXJyb3JGbiwgMClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICB9KVxyXG5cclxuICAgIGZ1bmN0aW9uIHRlc3RHcm91cCh0ZXN0ZXIsIHRlc3QpIHtcclxuXHJcbiAgICAgICAgLy8gaGFuZGxlcyBhbnkgZXJyb3IgKHN5bmNocm9ub3VzIG9yIGFzeW5jaHJvbm91cyBlcnJvcnMpXHJcbiAgICAgICAgdmFyIGhhbmRsZUVycm9yID0gY3JlYXRlVW5oYW5kbGVkRXJyb3JIYW5kbGVyKHRlc3RlcilcclxuXHJcbiAgICAgICAgdmFyIHJ1blRlc3QgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHRlc3QuY2FsbCh0ZXN0ZXIsIHRlc3RlcikgLy8gdGVzdGVyIGlzIGJvdGggJ3RoaXMnIGFuZCB0aGUgZmlyc3QgcGFyYW1ldGVyIChmb3IgZmxleGliaWxpdHkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgaGFuZGxlRXJyb3IoZSwgdHJ1ZSkuZG9uZSgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgfVxyXG5cclxuICAgICAgICBvcHRpb25zLnJ1blRlc3RHcm91cChzdGF0ZSwgdGVzdGVyLCBydW5UZXN0LCBoYW5kbGVFcnJvcilcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVVbmhhbmRsZWRFcnJvckhhbmRsZXIodGVzdGVyKSB7XHJcblxyXG4gICAgICAgIHZhciBoYW5kbGVFcnJvckluRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24od2FybiwgbmV3RXJyb3IpIHtcclxuICAgICAgICAgICAgaWYod2FybiAhPT0gZmFsc2UpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGVzdGVyLndhcm5pbmdIYW5kbGVyKG5ld0Vycm9yKVxyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCh3YXJuaW5nSGFuZGxlckVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGVzdGVyLm1hbmFnZXIuZW1pdCgnZXhjZXB0aW9uJywgRnV0dXJlKHdhcm5pbmdIYW5kbGVyRXJyb3IpKS5kb25lKCkgLy8gaWYgc2hpdCBnZXRzIHRoaXMgYmFkLCB0aGF0IHN1Y2tzXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKG5ld0Vycm9yKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyB3YXJuIHNob3VsZCBiZSBzZXQgdG8gZmFsc2UgaWYgdGhlIGhhbmRsZXIgaXMgYmVpbmcgY2FsbGVkIHRvIHJlcG9ydCBhIHdhcm5pbmdcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZSwgd2Fybikge1xyXG4gICAgICAgICAgICBpZih0ZXN0ZXIudW5oYW5kbGVkRXJyb3JIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGVzdGVyLnVuaGFuZGxlZEVycm9ySGFuZGxlcihlKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxyXG5cclxuICAgICAgICAgICAgICAgIH0gY2F0Y2gobmV3RXJyb3IpIHsgICAgIC8vIGVycm9yIGhhbmRsZXIgaGFkIGFuIGVycm9yLi4uXHJcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3JJbkVycm9ySGFuZGxlcih3YXJuLCBuZXdFcnJvcilcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBlbHNlXHJcblxyXG4gICAgICAgICAgICB2YXIgZXJyb3JUb0VtaXQgPSBtYXBFeGNlcHRpb24oZSwgdGVzdGVyLndhcm5pbmdIYW5kbGVyKS5jYXRjaChmdW5jdGlvbihuZXdFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgaWYobmV3RXJyb3IubWVzc2FnZSAhPT0gXCJBY2Nlc3NpbmcgdGhlICdjYWxsZXInIHByb3BlcnR5IG9mIGEgZnVuY3Rpb24gb3IgYXJndW1lbnRzIG9iamVjdCBpcyBub3QgYWxsb3dlZCBpbiBzdHJpY3QgbW9kZVwiKSB7IC8vIHN0YWNrdHJhY2UuanMgZG9lc24ndCBzdXBwb3J0IElFIGZvciBjZXJ0YWluIHRoaW5nc1xyXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZUVycm9ySW5FcnJvckhhbmRsZXIod2FybiwgbmV3RXJyb3IpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKGUpIC8vIHVzZSB0aGUgb3JpZ2luYWwgdW5tYXBwZWQgZXhjZXB0aW9uXHJcblxyXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKGV4Y2VwdGlvbil7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKGV4Y2VwdGlvbkVtaXREYXRhKHRlc3RlcixleGNlcHRpb24pKVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgdmFyIGVtaXRGdXR1cmUgPSB0ZXN0ZXIubWFuYWdlci5lbWl0KCdleGNlcHRpb24nLCBlcnJvclRvRW1pdClcclxuICAgICAgICAgICAgcmV0dXJuIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRlc3RlciwgZW1pdEZ1dHVyZSlcclxuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGV4Y2VwdGlvbkVtaXREYXRhKHRlc3RlciwgZSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxyXG4gICAgICAgICAgICB0aW1lOiBub3coKSxcclxuICAgICAgICAgICAgZXJyb3I6IGVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8vIHRoZSBwcm90b3R5cGUgb2Ygb2JqZWN0cyB1c2VkIHRvIHdyaXRlIHRlc3RzIGFuZCBjb250YWluIHRoZSByZXN1bHRzIG9mIHRlc3RzXHJcbiAgICB2YXIgVW5pdFRlc3RlciA9IGZ1bmN0aW9uKG5hbWUsIG1haW5UZXN0ZXIpIHtcclxuICAgICAgICBpZighbWFpblRlc3RlcikgbWFpblRlc3RlciA9IHRoaXNcclxuXHJcbiAgICAgICAgdGhpcy5pZCA9IGdyb3VwaWQoKVxyXG4gICAgICAgIHRoaXMubWFpblRlc3RlciA9IG1haW5UZXN0ZXIgLy8gdGhlIG1haW5UZXN0ZXIgaXMgdXNlZCB0byBlYXNpbHkgZmlndXJlIG91dCBpZiB0aGUgdGVzdCByZXN1bHRzIGhhdmUgYmVlbiBhY2Nlc3NlZCAoc28gZWFybHkgYWNjZXNzZXMgY2FuIGJlIGRldGVjdGVkKVxyXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWVcclxuXHJcbiAgICAgICAgdGhpcy5kb25lVGVzdHMgPSAwXHJcbiAgICAgICAgdGhpcy5kb25lQXNzZXJ0cyA9IDBcclxuICAgICAgICB0aGlzLnJ1bm5pbmdUZXN0cyA9IDAgLy8gdGhlIG51bWJlciBvZiBzdWJ0ZXN0cyBjcmVhdGVkIHN5bmNocm9ub3VzbHlcclxuICAgICAgICB0aGlzLmRvbmVDYWxsZWQgPSBmYWxzZVxyXG4gICAgICAgIHRoaXMuZG9Tb3VyY2VtYXBwZXJ5ID0gdHJ1ZSAvLyB3aGV0aGVyIHRvIGRvIHNvdXJjZSBtYXBwaW5nLCBpZiBwb3NzaWJsZSwgd2l0aGluIHRoaXMgdGVzdFxyXG4gICAgfVxyXG5cclxuICAgICAgICBVbml0VGVzdGVyLnByb3RvdHlwZSA9IHtcclxuICAgICAgICAgICAgdGVzdDogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlc3QgPSBhcmd1bWVudHNbMF1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBuYW1lZCB0ZXN0XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBuYW1lID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlc3QgPSBhcmd1bWVudHNbMV1cclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXNcclxuICAgICAgICAgICAgICAgIHRoaXMucnVubmluZ1Rlc3RzKytcclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgdGVzdGVyID0gbmV3IFVuaXRUZXN0ZXIobmFtZSwgdGhpcy5tYWluVGVzdGVyKVxyXG4gICAgICAgICAgICAgICAgdGVzdGVyLm1hbmFnZXIgPSB0aGlzLm1hbmFnZXJcclxuICAgICAgICAgICAgICAgIHRlc3Rlci5kb1NvdXJjZW1hcHBlcnkgPSB0aGlzLmRvU291cmNlbWFwcGVyeSAvLyBpbmhlcml0IGZyb20gcGFyZW50IHRlc3RcclxuICAgICAgICAgICAgICAgIHRlc3Rlci53YXJuaW5nSGFuZGxlciA9IHRoaXMud2FybmluZ0hhbmRsZXJcclxuXHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLmlkID09PSB1bmRlZmluZWQpIHsgLy8gaWUgaXRzIHRoZSB0b3AtbGV2ZWwgZmFrZSB0ZXN0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYWluU3ViVGVzdCA9IHRlc3RlclxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHRlc3Rlci5vbkRvbmUgPSBmdW5jdGlvbigpIHsgLy8gd2lsbCBleGVjdXRlIHdoZW4gdGhpcyB0ZXN0IGlzIGRvbmVcclxuICAgICAgICAgICAgICAgICAgICB0aGF0LmRvbmVUZXN0cyArPSAxXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHRoYXQubWFuYWdlci5lbWl0KCdncm91cEVuZCcsIEZ1dHVyZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0ZXN0ZXIuaWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXHJcbiAgICAgICAgICAgICAgICAgICAgfSkpXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrR3JvdXBEb25lKHRoYXQpXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgdGVzdGVyLm1haW5UZXN0ZXIuY2FsbE9uRG9uZShmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZighdGVzdGVyLmRvbmVDYWxsZWQpIHsgLy8gYSB0aW1lb3V0IGhhcHBlbmVkIC0gZW5kIHRoZSB0ZXN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlc3Rlci5kb25lQ2FsbGVkID0gdHJ1ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGF0Lm1hbmFnZXIuZW1pdCgnZ3JvdXBFbmQnLCBGdXR1cmUoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHRlc3Rlci5pZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2dyb3VwJywgRnV0dXJlKHtcclxuICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxyXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGhpcy5pZCxcclxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXHJcbiAgICAgICAgICAgICAgICB9KSlcclxuXHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLmJlZm9yZUZuKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2JlZm9yZScsIEZ1dHVyZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxyXG4gICAgICAgICAgICAgICAgICAgIH0pKVxyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJlZm9yZUZuLmNhbGwodGhpcywgdGhpcylcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2JlZm9yZUVuZCcsIEZ1dHVyZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxyXG4gICAgICAgICAgICAgICAgICAgIH0pKVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHRlc3RHcm91cCh0ZXN0ZXIsIHRlc3QpXHJcblxyXG4gICAgICAgICAgICAgICAgaWYodGhpcy5hZnRlckZuKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2FmdGVyJywgRnV0dXJlKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIuaWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXHJcbiAgICAgICAgICAgICAgICAgICAgfSkpXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWZ0ZXJGbi5jYWxsKHRoaXMsIHRoaXMpXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWFuYWdlci5lbWl0KCdhZnRlckVuZCcsIEZ1dHVyZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxyXG4gICAgICAgICAgICAgICAgICAgIH0pKVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHRlc3Rlci5ncm91cEVuZGVkID0gdHJ1ZVxyXG4gICAgICAgICAgICAgICAgY2hlY2tHcm91cERvbmUodGVzdGVyKVxyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiB0ZXN0ZXJcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIG9rOiBmdW5jdGlvbihzdWNjZXNzLCBhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kb25lQXNzZXJ0cyArPSAxXHJcbiAgICAgICAgICAgICAgICBhZnRlcldhaXRpbmdFbWl0SXNDb21wbGV0ZSh0aGlzLCBhc3NlcnQodGhpcywgc3VjY2VzcywgYWN0dWFsVmFsdWUsIGV4cGVjdGVkVmFsdWUsICdhc3NlcnQnLCBcIm9rXCIpKS5kb25lKClcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZXE6IGZ1bmN0aW9uKGFjdHVhbFZhbHVlLCBleHBlY3RlZFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRvbmVBc3NlcnRzICs9IDFcclxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsIGFzc2VydCh0aGlzLCBleHBlY3RlZFZhbHVlID09PSBhY3R1YWxWYWx1ZSwgYWN0dWFsVmFsdWUsIGV4cGVjdGVkVmFsdWUsICdhc3NlcnQnLCBcImVxXCIpKS5kb25lKClcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgY291bnQ6IGZ1bmN0aW9uKG51bWJlcikge1xyXG4gICAgICAgICAgICAgICAgaWYodGhpcy5jb3VudEV4cGVjdGVkICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJjb3VudCBjYWxsZWQgbXVsdGlwbGUgdGltZXMgZm9yIHRoaXMgdGVzdFwiKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jb3VudEV4cGVjdGVkID0gbnVtYmVyXHJcblxyXG4gICAgICAgICAgICAgICAgYWZ0ZXJXYWl0aW5nRW1pdElzQ29tcGxldGUodGhpcyxhc3NlcnQodGhpcywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG51bWJlciwgJ2NvdW50JywgXCJjb3VudFwiKSkuZG9uZSgpXHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICBiZWZvcmU6IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLmJlZm9yZUZuICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJiZWZvcmUgY2FsbGVkIG11bHRpcGxlIHRpbWVzIGZvciB0aGlzIHRlc3RcIilcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJlZm9yZUZuID0gZm5cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgYWZ0ZXI6IGZ1bmN0aW9uKGZuKSB7XHJcbiAgICAgICAgICAgICAgICBpZih0aGlzLmFmdGVyRm4gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcImFmdGVyIGNhbGxlZCBtdWx0aXBsZSB0aW1lcyBmb3IgdGhpcyB0ZXN0XCIpXHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5hZnRlckZuID0gZm5cclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIGxvZzogZnVuY3Rpb24oLyphcmd1bWVudHMqLykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2xvZycsIEZ1dHVyZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0aGlzLmlkLFxyXG4gICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlczogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKVxyXG4gICAgICAgICAgICAgICAgfSkpXHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICB0aW1lb3V0OiBmdW5jdGlvbih0KSB7XHJcbiAgICAgICAgICAgICAgICB0aW1lb3V0KHRoaXMsIHQsIGZhbHNlKVxyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgZXJyb3I6IGZ1bmN0aW9uKGhhbmRsZXIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gaGFuZGxlclxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB3YXJuaW5nOiBmdW5jdGlvbihoYW5kbGVyKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLndhcm5pbmdIYW5kbGVyID0gaGFuZGxlclxyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgc291cmNlbWFwOiBmdW5jdGlvbihkb1NvdXJjZW1hcHBlcnkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZG9Tb3VyY2VtYXBwZXJ5ID0gZG9Tb3VyY2VtYXBwZXJ5XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYWZ0ZXJXYWl0aW5nRW1pdElzQ29tcGxldGUodGhhdCwgYXNzZXJ0RnV0dXJlKSB7XHJcbiAgICAgICAgcmV0dXJuIGFzc2VydEZ1dHVyZS5maW5hbGx5KGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBjaGVja0dyb3VwRG9uZSh0aGF0KVxyXG4gICAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY2hlY2tHcm91cERvbmUoZ3JvdXApIHtcclxuICAgICAgICBpZighZ3JvdXAuZG9uZUNhbGxlZCAmJiBncm91cC5ncm91cEVuZGVkID09PSB0cnVlXHJcbiAgICAgICAgICAgICYmICgoZ3JvdXAuY291bnRFeHBlY3RlZCA9PT0gdW5kZWZpbmVkIHx8IGdyb3VwLmNvdW50RXhwZWN0ZWQgPD0gZ3JvdXAuZG9uZUFzc2VydHMrZ3JvdXAuZG9uZVRlc3RzKVxyXG4gICAgICAgICAgICAgICAgJiYgZ3JvdXAucnVubmluZ1Rlc3RzID09PSBncm91cC5kb25lVGVzdHMpXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIGdyb3VwLmRvbmVDYWxsZWQgPSB0cnVlIC8vIGRvbid0IGNhbGwgdHdpY2VcclxuICAgICAgICAgICAgZ3JvdXAub25Eb25lKClcclxuICAgICAgICB9XHJcblxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRvbmUodW5pdFRlc3Rlcikge1xyXG4gICAgICAgIGlmKHVuaXRUZXN0ZXIubWFpblRlc3Rlci5lbmRlZCkge1xyXG4gICAgICAgICAgICB1bml0VGVzdGVyLm1haW5UZXN0ZXIubWFuYWdlci5lbWl0KCdleGNlcHRpb24nLCBGdXR1cmUoe1xyXG4gICAgICAgICAgICAgICAgcGFyZW50OiB1bml0VGVzdGVyLm1haW5UZXN0ZXIubWFpblN1YlRlc3QuaWQsXHJcbiAgICAgICAgICAgICAgICB0aW1lOiBub3coKSxcclxuICAgICAgICAgICAgICAgIGVycm9yOiBuZXdFcnJvcihcImRvbmUgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIChwcm9iYWJseSBiZWNhdXNlIHRoZSB0ZXN0IHRpbWVkIG91dCBiZWZvcmUgaXQgZmluaXNoZWQpXCIpXHJcbiAgICAgICAgICAgIH0pKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHRvKSB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodG8pXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0cyA9IFtdXHJcblxyXG4gICAgICAgICAgICBlbmRUZXN0KHVuaXRUZXN0ZXIsICdub3JtYWwnKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBpZiBhIHRpbWVvdXQgaXMgdGhlIGRlZmF1bHQsIGl0IGNhbiBiZSBvdmVycmlkZGVuXHJcbiAgICBmdW5jdGlvbiB0aW1lb3V0KHVuaXRUZXN0ZXIsIHQsIHRoZURlZmF1bHQpIHtcclxuICAgICAgICB2YXIgdGltZW91dHMgPSB1bml0VGVzdGVyLm1haW5UZXN0ZXIudGltZW91dHNcclxuXHJcbiAgICAgICAgdmFyIHRvID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmVtb3ZlKHRpbWVvdXRzLCB0bylcclxuXHJcbiAgICAgICAgICAgIGlmKHRpbWVvdXRzLmxlbmd0aCA9PT0gMCAmJiAhdW5pdFRlc3Rlci5tYWluVGVzdGVyLmVuZGVkKSB7XHJcbiAgICAgICAgICAgICAgICBlbmRUZXN0KHVuaXRUZXN0ZXIubWFpblRlc3RlciwgJ3RpbWVvdXQnKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgdClcclxuXHJcbiAgICAgICAgdGltZW91dHMucHVzaCh0bylcclxuXHJcbiAgICAgICAgaWYodGhlRGVmYXVsdCkge1xyXG4gICAgICAgICAgICB0aW1lb3V0cy5kZWZhdWx0ID0gdG9cclxuICAgICAgICB9IGVsc2UgaWYodGltZW91dHMuZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0cy5kZWZhdWx0KVxyXG4gICAgICAgICAgICByZW1vdmUodGltZW91dHMsIHRpbWVvdXRzLmRlZmF1bHQpXHJcbiAgICAgICAgICAgIHRpbWVvdXRzLmRlZmF1bHQgPSB1bmRlZmluZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIHJlbW92ZShhcnJheSwgaXRlbSkge1xyXG4gICAgICAgICAgICB2YXIgaW5kZXggPSBhcnJheS5pbmRleE9mKGl0ZW0pXHJcbiAgICAgICAgICAgIGlmKGluZGV4ID09PSAtMSlcclxuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKFwiSXRlbSBkb2Vzbid0IGV4aXN0IHRvIHJlbW92ZVwiKVxyXG4gICAgICAgICAgICBhcnJheS5zcGxpY2UoaW5kZXgsIDEpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVuZFRlc3QodGhhdCwgdHlwZSkge1xyXG4gICAgICAgIHRoYXQubWFpblRlc3Rlci5lbmRlZCA9IHRydWVcclxuXHJcbiAgICAgICAgaWYodGhhdC5tYWluVGVzdGVyID09PSB0aGF0KSB7IC8vIGlmIGl0cyB0aGUgbWFpbiB0ZXN0ZXJcclxuICAgICAgICAgICAgdGhhdC5vbkRvbmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbihjYikge1xyXG4gICAgICAgICAgICAgICAgY2IoKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgLy8gc2V0VGltZW91dCBoZXJlIGlzIHRvIG1ha2UgaXQgc28gdGhlIGN1cnJlbnRseSBydW5uaW5nIHRocmVhZGxldCB0aGF0IGNhdXNlZCB0aGUgdGVzdCB0byBlbmQgY2FuIGZpbmlzaCBiZWZvcmUgdGhlIGVuZCBldmVudCBpcyBzZW50XHJcbiAgICAgICAgICAgIHRoYXQubWFuYWdlci5lbWl0KCdlbmQnLCBGdXR1cmUoe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogdHlwZSxcclxuICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXHJcbiAgICAgICAgICAgIH0pKVxyXG4gICAgICAgIH0sMClcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBhc3NlcnQodGhhdCwgc3VjY2VzcywgYWN0dWFsVmFsdWUsIGV4cGVjdGVkVmFsdWUsIHR5cGUsIGZ1bmN0aW9uTmFtZS8qPVwib2tcIiovLCBsaW5lSW5mby8qPWR5bmFtaWMqLywgc3RhY2tJbmNyZWFzZS8qPTAqLykge1xyXG4gICAgICAgIGlmKCFzdGFja0luY3JlYXNlKSBzdGFja0luY3JlYXNlID0gMVxyXG4gICAgICAgIGlmKCFmdW5jdGlvbk5hbWUpIGZ1bmN0aW9uTmFtZSA9IFwib2tcIlxyXG4gICAgICAgIGlmKCFsaW5lSW5mbylcclxuICAgICAgICAgICAgdmFyIGxpbmVJbmZvRnV0dXJlID0gZ2V0TGluZUluZm9ybWF0aW9uKGZ1bmN0aW9uTmFtZSwgc3RhY2tJbmNyZWFzZSwgdGhhdC5kb1NvdXJjZW1hcHBlcnksIHRoYXQud2FybmluZ0hhbmRsZXIpXHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB2YXIgbGluZUluZm9GdXR1cmUgPSBGdXR1cmUobGluZUluZm8pXHJcblxyXG4gICAgICAgIHZhciBlbWl0RGF0YSA9IGxpbmVJbmZvRnV0dXJlLnRoZW4oZnVuY3Rpb24obGluZUluZm8pIHtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGxpbmVJbmZvXHJcbiAgICAgICAgICAgIHJlc3VsdC50eXBlID0gJ2Fzc2VydCdcclxuICAgICAgICAgICAgcmVzdWx0LnN1Y2Nlc3MgPSBzdWNjZXNzXHJcblxyXG4gICAgICAgICAgICBpZihhY3R1YWxWYWx1ZSAhPT0gdW5kZWZpbmVkKSAgICAgcmVzdWx0LmFjdHVhbCA9IGFjdHVhbFZhbHVlXHJcbiAgICAgICAgICAgIGlmKGV4cGVjdGVkVmFsdWUgIT09IHVuZGVmaW5lZCkgICByZXN1bHQuZXhwZWN0ZWQgPSBleHBlY3RlZFZhbHVlXHJcblxyXG4gICAgICAgICAgICByZXN1bHQucGFyZW50ID0gdGhhdC5pZFxyXG4gICAgICAgICAgICByZXN1bHQudGltZSA9IG5vdygpXHJcblxyXG4gICAgICAgICAgIHJldHVybiBGdXR1cmUocmVzdWx0KVxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIHJldHVybiB0aGF0Lm1hbmFnZXIuZW1pdCh0eXBlLCBlbWl0RGF0YSlcclxuICAgIH1cclxuXHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0TGluZUluZm9ybWF0aW9uKGZ1bmN0aW9uTmFtZSwgc3RhY2tJbmNyZWFzZSwgZG9Tb3VyY2VtYXBwZXJ5LCB3YXJuaW5nSGFuZGxlcikge1xyXG4gICAgICAgIHZhciBpbmZvID0gb3B0aW9ucy5nZXRMaW5lSW5mbyhzdGFja0luY3JlYXNlKVxyXG5cclxuICAgICAgICB2YXIgZmlsZSwgbGluZSwgY29sdW1uO1xyXG5cclxuICAgICAgICByZXR1cm4gZ2V0U291cmNlTWFwQ29uc3VtZXIoaW5mby5maWxlLCB3YXJuaW5nSGFuZGxlcikuY2F0Y2goZnVuY3Rpb24oZSl7XHJcbiAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxyXG5cclxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcENvbnN1bWVyKSB7XHJcbiAgICAgICAgICAgIGlmKHNvdXJjZU1hcENvbnN1bWVyICE9PSB1bmRlZmluZWQgJiYgZG9Tb3VyY2VtYXBwZXJ5KSB7XHJcblxyXG4gICAgICAgICAgICAgICAgdmFyIG1hcHBlZEluZm8gPSBnZXRNYXBwZWRTb3VyY2VJbmZvKHNvdXJjZU1hcENvbnN1bWVyLCBpbmZvLmZpbGUsIGluZm8ubGluZSwgaW5mby5jb2x1bW4pXHJcbiAgICAgICAgICAgICAgICBmaWxlID0gbWFwcGVkSW5mby5maWxlXHJcbiAgICAgICAgICAgICAgICBsaW5lID0gbWFwcGVkSW5mby5saW5lXHJcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBtYXBwZWRJbmZvLmNvbHVtblxyXG5cclxuICAgICAgICAgICAgICAgIHZhciBtdWx0aUxpbmVTZWFyY2ggPSAhbWFwcGVkSW5mby51c2luZ09yaWdpbmFsRmlsZSAvLyBkb24ndCB0byBhIG11bHRpLWxpbmUgc2VhcmNoIGlmIHRoZSBzb3VyY2UgaGFzIGJlZW4gbWFwcGVkICh0aGUgZmlsZSBtaWdodCBub3QgYmUgamF2YXNjcmlwdClcclxuICAgICAgICAgICAgICAgIHJldHVybiBnZXRGdW5jdGlvbkNhbGxMaW5lcyhtYXBwZWRJbmZvLmZpbGUsIGZ1bmN0aW9uTmFtZSwgbWFwcGVkSW5mby5saW5lLCBtdWx0aUxpbmVTZWFyY2gsIHdhcm5pbmdIYW5kbGVyKVxyXG5cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGZpbGUgPSBpbmZvLmZpbGVcclxuICAgICAgICAgICAgICAgIGxpbmUgPSBpbmZvLmxpbmVcclxuICAgICAgICAgICAgICAgIGNvbHVtbiA9IGluZm8uY29sdW1uXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZ2V0RnVuY3Rpb25DYWxsTGluZXMoZmlsZSwgZnVuY3Rpb25OYW1lLCBsaW5lLCB0cnVlLCB3YXJuaW5nSGFuZGxlcilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcclxuICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShcIjxzb3VyY2Ugbm90IGF2YWlsYWJsZT5cIilcclxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZUxpbmVzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoe1xyXG4gICAgICAgICAgICAgICAgc291cmNlTGluZXM6IHNvdXJjZUxpbmVzLFxyXG4gICAgICAgICAgICAgICAgZmlsZTogcGF0aC5iYXNlbmFtZShmaWxlKSxcclxuICAgICAgICAgICAgICAgIGxpbmU6IGxpbmUsXHJcbiAgICAgICAgICAgICAgICBjb2x1bW46IGNvbHVtblxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcbiAgICB9XHJcblxyXG4gICAgLy8gcmV0dXJucyB0aGUgbGluZSwgY29sdW1uLCBhbmQgZmlsZW5hbWUgbWFwcGVkIGZyb20gYSBzb3VyY2UgbWFwXHJcbiAgICAvLyBhcHByb3ByaWF0ZWx5IGhhbmRsZXMgY2FzZXMgd2hlcmUgc29tZSBpbmZvcm1hdGlvbiBpcyBtaXNzaW5nXHJcbiAgICBmdW5jdGlvbiBnZXRNYXBwZWRTb3VyY2VJbmZvKHNvdXJjZU1hcENvbnN1bWVyLCBvcmlnaW5hbEZpbGVQYXRoLCBvcmlnaW5hbExpbmUsIG9yaWdpbmFsQ29sdW1uLCBvcmlnaW5hbEZ1bmN0aW9uTmFtZSkge1xyXG4gICAgICAgIHZhciBzb3VyY2VNYXBJbmZvID0gc291cmNlTWFwQ29uc3VtZXIub3JpZ2luYWxQb3NpdGlvbkZvcih7bGluZTpvcmlnaW5hbExpbmUsIGNvbHVtbjpvcmlnaW5hbENvbHVtbnx8MH0pICAgICAgIC8vIHRoZSAwIGlzIGZvciBicm93c2VycyAobGlrZSBmaXJlZm94KSB0aGF0IGRvbid0IG91dHB1dCBjb2x1bW4gbnVtYmVyc1xyXG4gICAgICAgIHZhciBsaW5lID0gc291cmNlTWFwSW5mby5saW5lXHJcbiAgICAgICAgdmFyIGNvbHVtbiA9IHNvdXJjZU1hcEluZm8uY29sdW1uXHJcbiAgICAgICAgdmFyIGZuID0gc291cmNlTWFwSW5mby5uYW1lXHJcblxyXG4gICAgICAgIGlmKHNvdXJjZU1hcEluZm8uc291cmNlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHZhciByZWxhdGl2ZSA9IGlzUmVsYXRpdmUoc291cmNlTWFwSW5mby5zb3VyY2UpXHJcblxyXG4gICAgICAgICAgICBpZihzb3VyY2VNYXBDb25zdW1lci5zb3VyY2VSb290ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBJbmZvLnNvdXJjZSA9IHNvdXJjZU1hcEluZm8uc291cmNlLnJlcGxhY2Uoc291cmNlTWFwQ29uc3VtZXIuc291cmNlUm9vdCwgJycpIC8vIHJlbW92ZSBzb3VyY2VSb290ICh0b2RvOiBxdWVzaW9uOiBpcyB0aGlzIHRoZSByaWdodCB0aGluZyB0byBkbz8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS93ZWJwYWNrL3dlYnBhY2svaXNzdWVzLzIzOClcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYocmVsYXRpdmUpIHtcclxuICAgICAgICAgICAgICAgIHZhciBmaWxlID0gVXJsLnJlc29sdmUob3JpZ2luYWxGaWxlUGF0aCwgcGF0aC5iYXNlbmFtZShzb3VyY2VNYXBJbmZvLnNvdXJjZSkpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZmlsZSA9IHNvdXJjZU1hcEluZm8uc291cmNlXHJcbiAgICAgICAgICAgIH1cclxuXHJcblxyXG4gICAgICAgICAgICB2YXIgb3JpZ2luYWxGaWxlID0gdHJ1ZVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciBmaWxlID0gb3JpZ2luYWxGaWxlUGF0aFxyXG4gICAgICAgICAgICB2YXIgb3JpZ2luYWxGaWxlID0gZmFsc2VcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKGZuID09PSBudWxsIHx8ICFvcmlnaW5hbEZpbGUpIHtcclxuICAgICAgICAgICAgZm4gPSBvcmlnaW5hbEZ1bmN0aW9uTmFtZVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihsaW5lID09PSBudWxsIHx8ICFvcmlnaW5hbEZpbGUpIHtcclxuICAgICAgICAgICAgbGluZSA9IG9yaWdpbmFsTGluZVxyXG4gICAgICAgICAgICBjb2x1bW4gPSBvcmlnaW5hbENvbHVtblxyXG4gICAgICAgIH1cclxuICAgICAgICBpZihjb2x1bW4gPT09IG51bGwpIHtcclxuICAgICAgICAgICAgY29sdW1uID0gdW5kZWZpbmVkXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBmaWxlOiBmaWxlLFxyXG4gICAgICAgICAgICBmdW5jdGlvbjogZm4sXHJcbiAgICAgICAgICAgIGxpbmU6IGxpbmUsXHJcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uLFxyXG4gICAgICAgICAgICB1c2luZ09yaWdpbmFsRmlsZTogb3JpZ2luYWxGaWxlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIGdldHMgdGhlIGFjdHVhbCBsaW5lcyBvZiB0aGUgY2FsbFxyXG4gICAgLy8gaWYgbXVsdGlMaW5lU2VhcmNoIGlzIHRydWUsIGl0IGZpbmRzXHJcbiAgICBmdW5jdGlvbiBnZXRGdW5jdGlvbkNhbGxMaW5lcyhmaWxlUGF0aCwgZnVuY3Rpb25OYW1lLCBsaW5lTnVtYmVyLCBtdWx0aUxpbmVTZWFyY2gsIHdhcm5pbmdIYW5kbGVyKSB7XHJcbiAgICAgICAgcmV0dXJuIG9wdGlvbnMuZ2V0U2NyaXB0U291cmNlTGluZXMoZmlsZVBhdGgpLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcclxuICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZSh1bmRlZmluZWQpXHJcblxyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oZmlsZUxpbmVzKSB7XHJcbiAgICAgICAgICAgIGlmKGZpbGVMaW5lcyAhPT0gdW5kZWZpbmVkKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0TGluZSA9IGZpbmRTdGFydExpbmUoZmlsZUxpbmVzLCBmdW5jdGlvbk5hbWUsIGxpbmVOdW1iZXIpXHJcbiAgICAgICAgICAgICAgICBpZihzdGFydExpbmUgPT09ICdsaW5lT2ZDb2RlTm90Rm91bmQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShcIjxsaW5lIG9mIGNvZGUgbm90IGZvdW5kIChwb3NzaWJseSBhbiBlcnJvcj8pPiBcIilcclxuXHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoc3RhcnRMaW5lICE9PSAnc291cmNlTm90QXZhaWxhYmxlJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKG11bHRpTGluZVNlYXJjaCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKGZpbmRGdWxsU291cmNlTGluZShmaWxlTGluZXMsIHN0YXJ0TGluZSkpXHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShmaWxlTGluZXNbc3RhcnRMaW5lXS50cmltKCkpXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIGVsc2VcclxuICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShcIjxzb3VyY2Ugbm90IGF2YWlsYWJsZT5cIilcclxuXHJcbiAgICAgICAgfSlcclxuICAgIH1cclxuXHJcbiAgICB2YXIgc291cmNlTWFwQ29uc3VtZXJDYWNoZSA9IHt9IC8vIGEgbWFwIGZyb20gYSBzY3JpcHQgdXJsIHRvIGEgZnV0dXJlIG9mIGl0cyBTb3VyY2VNYXBDb25zdW1lciBvYmplY3QgKG51bGwgbWVhbnMgbm8gc291cmNlbWFwIGV4aXN0cylcclxuICAgIGZ1bmN0aW9uIGdldFNvdXJjZU1hcENvbnN1bWVyKHVybCwgd2FybmluZ0hhbmRsZXIpIHtcclxuICAgICAgICBpZihzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgc291cmNlTWFwQ29uc3VtZXJDYWNoZVt1cmxdID0gb3B0aW9ucy5nZXRTb3VyY2VNYXBPYmplY3QodXJsLCB3YXJuaW5nSGFuZGxlcikudGhlbihmdW5jdGlvbihzb3VyY2VNYXBPYmplY3QpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBPYmplY3QgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBPYmplY3QudmVyc2lvbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nSGFuZGxlcihuZXcgRXJyb3IoXCJTb3VyY2VtYXAgZm9yIFwiK3VybCtcIiBkb2Vzbid0IGNvbnRhaW4gdGhlIHJlcXVpcmVkICd2ZXJzaW9uJyBwcm9wZXJ0eS4gQXNzdW1pbmcgdmVyc2lvbiAyLlwiKSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU1hcE9iamVjdC52ZXJzaW9uID0gMiAvLyBhc3N1bWUgdmVyc2lvbiAyIHRvIG1ha2UgYnJvd3NlcmlmeSdzIGJyb2tlbiBzb3VyY2VtYXAgZm9ybWF0IHRoYXQgb21pdHMgdGhlIHZlcnNpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKG5ldyBTb3VyY2VNYXBDb25zdW1lcihzb3VyY2VNYXBPYmplY3QpKVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgc291cmNlTWFwQ29uc3VtZXJDYWNoZVt1cmxdID0gRnV0dXJlKHVuZGVmaW5lZClcclxuICAgICAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF1cclxuICAgIH1cclxuXHJcbiAgICAvLyB0YWtlcyBhbiBleGNlcHRpb24gYW5kIHJldHVybnMgYSBmdXR1cmUgZXhjZXB0aW9uIHRoYXQgaGFzIGEgc3RhY2t0cmFjZSB3aXRoIHNvdXJjZW1hcHBlZCB0cmFjZWxpbmVzXHJcbiAgICBmdW5jdGlvbiBtYXBFeGNlcHRpb24oZXhjZXB0aW9uLCB3YXJuaW5nSGFuZGxlcikge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmKGV4Y2VwdGlvbiBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgdHJhY2UgPSBvcHRpb25zLmdldEV4Y2VwdGlvbkluZm8oZXhjZXB0aW9uKVxyXG4gICAgICAgICAgICAgICAgdmFyIHNtY0Z1dHVyZXMgPSBbXVxyXG4gICAgICAgICAgICAgICAgZm9yKHZhciBuPTA7IG48dHJhY2UubGVuZ3RoOyBuKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBpZih0cmFjZVtuXS5maWxlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc21jRnV0dXJlcy5wdXNoKGdldFNvdXJjZU1hcENvbnN1bWVyKHRyYWNlW25dLmZpbGUsIHdhcm5pbmdIYW5kbGVyKSlcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzbWNGdXR1cmVzLnB1c2goRnV0dXJlKHVuZGVmaW5lZCkpXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUuYWxsKHNtY0Z1dHVyZXMpLnRoZW4oZnVuY3Rpb24oc291cmNlTWFwQ29uc3VtZXJzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIEN1c3RvbU1hcHBlZEV4Y2VwdGlvbiA9IHByb3RvKE1hcHBlZEV4Y2VwdGlvbiwgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgbmFtZSBzbyBpdCBsb29rcyBsaWtlIHRoZSBvcmlnaW5hbCBleGNlcHRpb24gd2hlbiBwcmludGVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgc3ViY2xhc3NlcyBNYXBwZWRFeGNlcHRpb24gc28gdGhhdCBuYW1lIHdvbid0IGJlIGFuIG93bi1wcm9wZXJ0eVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5hbWUgPSBleGNlcHRpb24ubmFtZVxyXG4gICAgICAgICAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IEN1c3RvbU1hcHBlZEV4Y2VwdGlvbihleGNlcHRpb24sIHRyYWNlLCBzb3VyY2VNYXBDb25zdW1lcnMpICAvLyBJRSBkb2Vzbid0IGdpdmUgZXhjZXB0aW9ucyBzdGFjayB0cmFjZXMgdW5sZXNzIHRoZXkncmUgYWN0dWFsbHkgdGhyb3duXHJcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaChtYXBwZWRFeGNldGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKG1hcHBlZEV4Y2V0aW9uKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKGV4Y2VwdGlvbilcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICB2YXIgZXJyb3JGdXR1cmUgPSBuZXcgRnV0dXJlXHJcbiAgICAgICAgICAgIGVycm9yRnV0dXJlLnRocm93KGUpXHJcbiAgICAgICAgICAgIHJldHVybiBlcnJvckZ1dHVyZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBhbiBleGNlcHRpb24gd2hlcmUgdGhlIHN0YWNrdHJhY2UncyBmaWxlcyBhbmQgbGluZXMgYXJlIG1hcHBlZCB0byB0aGUgb3JpZ2luYWwgZmlsZSAod2hlbiBhcHBsaWNhYmxlKVxyXG4gICAgdmFyIE1hcHBlZEV4Y2VwdGlvbiA9IHByb3RvKEVycm9yLCBmdW5jdGlvbihzdXBlcmNsYXNzKSB7XHJcblxyXG4gICAgICAgIC8vIGNvbnN0cnVjdG9yLiBUYWtlcyB0aGUgcGFyYW1ldGVyczpcclxuICAgICAgICAgICAgLy8gb3JpZ2luYWxFcnJvclxyXG4gICAgICAgICAgICAvLyB0cmFjZUluZm8gLSBhbiBhcnJheSB3aGVyZSBlYWNoIGVsZW1lbnQgaXMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgaW5mb3JtYXRpb24gYWJvdXQgdGhhdCBzdGFja3RyYWNlIGxpbmVcclxuICAgICAgICAgICAgLy8gc291cmNlTWFwQ29uc3VtZXJzIC0gYW4gYXJyYXkgb2YgdGhlIHNhbWUgbGVuZ3RoIGFzIHRyYWNlSW5mbyB3aGVyZSBlYWNoIGVsZW1lbnQgaXMgdGhlIHNvdXJjZW1hcCBjb25zdW1lciBmb3IgdGhlIGNvcnJlc3BvbmRpbmcgaW5mbyBpbiB0cmFjZUluZm9cclxuICAgICAgICB0aGlzLmluaXQgPSBmdW5jdGlvbihvcmlnaW5hbEVycm9yLCB0cmFjZUluZm8sIHNvdXJjZU1hcENvbnN1bWVycykge1xyXG4gICAgICAgICAgICBzdXBlcmNsYXNzLmNhbGwodGhpcywgb3JpZ2luYWxFcnJvci5tZXNzYWdlKVxyXG5cclxuICAgICAgICAgICAgZm9yKHZhciBwIGluIG9yaWdpbmFsRXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGlmKE9iamVjdC5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9yaWdpbmFsRXJyb3IsIHApKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpc1twXSA9IG9yaWdpbmFsRXJyb3JbcF1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdmFyIG5ld1RyYWNlTGluZXMgPSBbXVxyXG4gICAgICAgICAgICBmb3IodmFyIG49MDsgbjx0cmFjZUluZm8ubGVuZ3RoOyBuKyspIHtcclxuICAgICAgICAgICAgICAgIHZhciBpbmZvID0gdHJhY2VJbmZvW25dXHJcbiAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBDb25zdW1lcnNbbl0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGluZm8gPSBnZXRNYXBwZWRTb3VyY2VJbmZvKHNvdXJjZU1hcENvbnN1bWVyc1tuXSwgaW5mby5maWxlLCBpbmZvLmxpbmUsIGluZm8uY29sdW1uLCBpbmZvLmZ1bmN0aW9uKVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHZhciBmaWxlTGluZUNvbHVtbiA9IGluZm8ubGluZVxyXG4gICAgICAgICAgICAgICAgaWYoaW5mby5jb2x1bW4gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZpbGVMaW5lQ29sdW1uICs9ICc6JytpbmZvLmNvbHVtblxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYoaW5mby5maWxlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBmaWxlTGluZUNvbHVtbiA9IGluZm8uZmlsZSsnOicrZmlsZUxpbmVDb2x1bW5cclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgdHJhY2VMaW5lID0gXCIgICAgYXQgXCJcclxuICAgICAgICAgICAgICAgIGlmKGluZm8uZnVuY3Rpb24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyYWNlTGluZSArPSBpbmZvLmZ1bmN0aW9uKycgKCcrZmlsZUxpbmVDb2x1bW4rJyknXHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyYWNlTGluZSArPSBmaWxlTGluZUNvbHVtblxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIG5ld1RyYWNlTGluZXMucHVzaCh0cmFjZUxpbmUpXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuc3RhY2sgPSB0aGlzLm5hbWUrJzogJyt0aGlzLm1lc3NhZ2UrJ1xcbicrbmV3VHJhY2VMaW5lcy5qb2luKCdcXG4nKVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcblxyXG4gICAgLy8gYXR0ZW1wdHMgdG8gZmluZCB0aGUgZnVsbCBmdW5jdGlvbiBjYWxsIGV4cHJlc3Npb24gKG92ZXIgbXVsdGlwbGUgbGluZXMpIGdpdmVuIHRoZSBzb3VyY2VzIGxpbmVzIGFuZCBhIHN0YXJ0aW5nIHBvaW50XHJcbiAgICBmdW5jdGlvbiBmaW5kRnVsbFNvdXJjZUxpbmUoZmlsZUxpbmVzLCBzdGFydExpbmUpIHtcclxuICAgICAgICB2YXIgbGluZXMgPSBbXVxyXG4gICAgICAgIHZhciBwYXJlbkNvdW50ID0gMFxyXG4gICAgICAgIHZhciBtb2RlID0gMCAvLyBtb2RlIDAgZm9yIHBhcmVuIHNlYXJjaGluZywgbW9kZSAxIGZvciBkb3VibGUtcXVvdGUgc2VhcmNoaW5nLCBtb2RlIDIgZm9yIHNpbmdsZS1xdW90ZSBzZWFyY2hpbmdcclxuICAgICAgICB2YXIgbGFzdFdhc0JhY2tzbGFzaCA9IGZhbHNlIC8vIHVzZWQgZm9yIHF1b3RlIHNlYXJjaGluZ1xyXG4gICAgICAgIGZvcih2YXIgbj1zdGFydExpbmU7IHRydWU7IG4rKykge1xyXG4gICAgICAgICAgICB2YXIgbGluZSA9IGZpbGVMaW5lc1tuXVxyXG4gICAgICAgICAgICBsaW5lcy5wdXNoKGxpbmUudHJpbSgpKVxyXG5cclxuICAgICAgICAgICAgZm9yKHZhciBpPTA7IGk8bGluZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGMgPSBsaW5lW2ldXHJcblxyXG4gICAgICAgICAgICAgICAgaWYobW9kZSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKGMgPT09ICcoJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbkNvdW50KytcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy9pZihwYXJlbkNvdW50ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKSAvLyBkb25lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjID09PSAnKScgJiYgcGFyZW5Db3VudCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW5Db3VudC0tXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHBhcmVuQ291bnQgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKSAvLyBkb25lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYoYyA9PT0gJ1wiJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlID0gMVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjID09PSBcIidcIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlID0gMlxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihtb2RlID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYoYyA9PT0gJ1wiJyAmJiAhbGFzdFdhc0JhY2tzbGFzaCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlID0gMFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGFzdFdhc0JhY2tzbGFzaCA9IGM9PT0nXFxcXCdcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7IC8vIG1vZGUgPT09IDJcclxuICAgICAgICAgICAgICAgICAgICBpZihjID09PSBcIidcIiAmJiAhbGFzdFdhc0JhY2tzbGFzaCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlID0gMFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGFzdFdhc0JhY2tzbGFzaCA9IGM9PT0nXFxcXCdcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpIC8vIGlmIGl0IGdldHMgaGVyZSwgc29tZXRoaW5nIG1pbm9yIHdlbnQgd3JvbmdcclxuICAgIH1cclxuXHJcbiAgICAvLyBmaW5kcyB0aGUgbGluZSBhIGZ1bmN0aW9uIHN0YXJ0ZWQgb24gZ2l2ZW4gdGhlIGZpbGUncyBsaW5lcywgYW5kIHRoZSBzdGFjayB0cmFjZSBsaW5lIG51bWJlciAoYW5kIGZ1bmN0aW9uIG5hbWUpXHJcbiAgICAvLyByZXR1cm5zIHVuZGVmaW5lZCBpZiBzb21ldGhpbmcgd2VudCB3cm9uZyBmaW5kaW5nIHRoZSBzdGFydGxpbmVcclxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydExpbmUoZmlsZUxpbmVzLCBmdW5jdGlvbk5hbWUsIGxpbmVOdW1iZXIpIHtcclxuICAgICAgICB2YXIgc3RhcnRMaW5lID0gbGluZU51bWJlciAtIDFcclxuICAgICAgICB3aGlsZSh0cnVlKSB7XHJcbiAgICAgICAgICAgIGlmKHN0YXJ0TGluZSA8IDApIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiAnbGluZU9mQ29kZU5vdEZvdW5kJyAvLyBzb21ldGhpbmcgd2VudCB3cm9uZyBpZiB0aGlzIGlzIGJlaW5nIHJldHVybmVkICh0aGUgZnVuY3Rpb25OYW1lIHdhc24ndCBmb3VuZCBhYm92ZSAtIG1lYW5zIHlvdSBkaWRuJ3QgZ2V0IHRoZSBmdW5jdGlvbiBuYW1lIHJpZ2h0KVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB2YXIgbGluZSA9IGZpbGVMaW5lc1tzdGFydExpbmVdXHJcbiAgICAgICAgICAgIGlmKGxpbmUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuICdzb3VyY2VOb3RBdmFpbGFibGUnXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vbGluZXMucHVzaChsaW5lLnRyaW0oKSlcclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5zRnVuY3Rpb24gPSBsaW5lLmluZGV4T2YoZnVuY3Rpb25OYW1lKSAhPT0gLTFcclxuICAgICAgICAgICAgaWYoY29udGFpbnNGdW5jdGlvbikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXJ0TGluZVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBzdGFydExpbmUtLVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBncm91cGlkKCkge1xyXG4gICAgICAgIGdyb3VwaWQubmV4dCsrXHJcbiAgICAgICAgcmV0dXJuIGdyb3VwaWQubmV4dFxyXG4gICAgfVxyXG4gICAgZ3JvdXBpZC5uZXh0ID0gLTFcclxuXHJcbiAgICAvLyByZXR1cm5zIGEgVW5peCBUaW1lc3RhbXAgZm9yIG5vd1xyXG4gICAgZnVuY3Rpb24gbm93KCkge1xyXG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0VGltZSgpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0ZXN0OiBVbml0VGVzdFxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBuZXdFcnJvcihtZXNzYWdlLCBFcnJvclByb3RvdHlwZSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSkgLy8gSUUgbmVlZHMgYW4gZXhjZXB0aW9uIHRvIGJlIGFjdHVhbGx5IHRocm93biB0byBnZXQgYSBzdGFjayB0cmFjZSBwcm9wZXJ0eVxyXG4gICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgcmV0dXJuIGVcclxuICAgIH1cclxufSIsInZhciBwYXRoID0gcmVxdWlyZSgncGF0aCcpXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzUmVsYXRpdmUocCkge1xyXG4gICAgdmFyIG5vcm1hbCA9IHBhdGgubm9ybWFsaXplKHApXHJcbiAgICB2YXIgYWJzb2x1dGUgPSBwYXRoLnJlc29sdmUocClcclxuICAgIHJldHVybiBub3JtYWwgIT0gYWJzb2x1dGUgJiYgcC5pbmRleE9mKCc6Ly8nKSA9PT0gLTEvLyBzZWNvbmQgcGFydCBmb3IgdXJsc1xyXG59IiwidmFyIEZ1dHVyZSA9IHJlcXVpcmUoXCJhc3luYy1mdXR1cmVcIilcblxuLy8gcmV0dXJucyB0aGUgWEhSIGZ1bmN0aW9uIG9yIGVxdWl2YWxlbnQgZm9yIHVzZSB3aXRoIGFqYXhcbi8vIG1lbW9pemVzIHRoZSBmdW5jdGlvbiBmb3IgZmFzdGVyIHJlcGVhdGVkIHVzZVxudmFyIGNyZWF0ZVhNTEhUVFBPYmplY3QgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgdmVyc2lvbnMgPSBbXCJNc3htbDIuWE1MSFRUUFwiLFxuICAgICAgICAgICAgICAgICAgICBcIk1zeG1sMy5YTUxIVFRQXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTWljcm9zb2Z0LlhNTEhUVFBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNU1hNTDIuWG1sSHR0cC42LjBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNU1hNTDIuWG1sSHR0cC41LjBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNU1hNTDIuWG1sSHR0cC40LjBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNU1hNTDIuWG1sSHR0cC4zLjBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNU1hNTDIuWG1sSHR0cC4yLjBcIlxuICAgIF1cblxuICAgIGlmKFhNTEh0dHBSZXF1ZXN0ICE9PSB1bmRlZmluZWQpIHsgIC8vIEZvciBub24tSUUgYnJvd3NlcnNcbiAgICAgICAgY3JlYXRlWE1MSFRUUE9iamVjdCA9IGZ1bmN0aW9uKCkgeyAgLy8gVXNlIG1lbW9pemF0aW9uIHRvIGNhY2hlIHRoZSBmYWN0b3J5XG4gICAgICAgICAgICByZXR1cm4gbmV3IFhNTEh0dHBSZXF1ZXN0KClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY3JlYXRlWE1MSFRUUE9iamVjdCgpXG5cbiAgICB9IGVsc2UgeyAvLyBJRVxuICAgICAgICBmb3IodmFyIGk9MCwgbj12ZXJzaW9ucy5sZW5ndGg7IGk8bjsgaSsrKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciB2ZXJzaW9uID0gdmVyc2lvbnNbaV1cbiAgICAgICAgICAgICAgICB2YXIgZm4gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KHZlcnNpb24pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNyZWF0ZVhNTEhUVFBPYmplY3QgPSBmbiAgIC8vIFVzZSBtZW1vaXphdGlvbiB0byBjYWNoZSB0aGUgZmFjdG9yeVxuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVYTUxIVFRQT2JqZWN0KClcblxuICAgICAgICAgICAgfSBjYXRjaChlKSB7ICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKCdDYW50IGdldCBYbWxIdHRwUmVxdWVzdCBvYmplY3QnKVxufVxuXG5cblxudmFyIEhFQURFUiA9IFwiKFteXFxcXHNdKyk6ICguKilcIlxuXG4vLyByZXR1cm5zIHRoZSBjb250ZW50cyBhbmQgaGVhZGVycyBmcm9tIGEgZ2l2ZW4gVVJMXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih1cmwpIHtcbiAgICBpZihnZXRGcm9tQ2FjaGUodXJsKSlcbiAgICAgICAgcmV0dXJuIGdldEZyb21DYWNoZSh1cmwpXG5cbiAgICB2YXIgZnV0dXJlUmVzdWx0ID0gbmV3IEZ1dHVyZVxuICAgIHNldE9uQ2FjaGUodXJsLCBmdXR1cmVSZXN1bHQpXG5cbiAgICB2YXIgcmVxID0gY3JlYXRlWE1MSFRUUE9iamVjdCgpXG4gICAgcmVxLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiggcmVxLnJlYWR5U3RhdGUgPT09IDQgKSB7XG4gICAgICAgICAgICBpZiggcmVxLnN0YXR1cyA9PT0gMjAwICkge1xuICAgICAgICAgICAgICAgIHZhciBoZWFkZXJzID0ge31cbiAgICAgICAgICAgICAgICByZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkuc3BsaXQoJ1xcbicpLmZvckVhY2goZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWF0Y2ggPSBsaW5lLm1hdGNoKEhFQURFUilcbiAgICAgICAgICAgICAgICAgICAgaWYobWF0Y2ggIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuYW1lID0gbWF0Y2hbMV1cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IG1hdGNoWzJdXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRlcnNbbmFtZV0gPSB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICAgIGZ1dHVyZVJlc3VsdC5yZXR1cm4oe3RleHQ6IHJlcS5yZXNwb25zZVRleHQsIGhlYWRlcnM6IGhlYWRlcnN9KVxuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcignRXJyb3IgaW4gcmVxdWVzdDogU3RhdHVzICcrcmVxLnN0YXR1cylcbiAgICAgICAgICAgICAgICBlcnJvci5zdGF0dXMgPSByZXEuc3RhdHVzXG4gICAgICAgICAgICAgICAgZnV0dXJlUmVzdWx0LnRocm93KGVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVxLm9uZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIGZ1dHVyZVJlc3VsdC50aHJvdyhlKVxuICAgIH1cblxuXG4gICAgcmVxLm9wZW4oJ0dFVCcsIHVybCwgYXN5bmNocm9ub3VzKVxuICAgIHRyeSB7XG4gICAgICAgIHJlcS5zZW5kKClcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgZnV0dXJlUmVzdWx0LnRocm93KGUpXG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1dHVyZVJlc3VsdFxufVxuXG52YXIgY2FjaGUgPSB7fVxudmFyIGdldEZyb21DYWNoZSA9IGZ1bmN0aW9uKHVybCkge1xuICAgIHJldHVybiBjYWNoZVt1cmxdXG59XG52YXIgc2V0T25DYWNoZSA9IGZ1bmN0aW9uKHVybCwgZnV0dXJlUmVzcG9uc2UpIHtcbiAgICBjYWNoZVt1cmxdID0gZnV0dXJlUmVzcG9uc2Vcbn1cblxudmFyIGFzeW5jaHJvbm91cyA9IHRydWVcbmV4cG9ydHMuc2V0U3luY2hyb25vdXMgPSBmdW5jdGlvbihzeW5jaHJvbm91cykgeyAvLyB0aGlzIGlzIGhlcmUgc28gSSBjYW4gd29yayBhcm91bmQgdGhpcyBidWcgaW4gY2hyb21lOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MzY4NDQ0XG4gICAgYXN5bmNocm9ub3VzID0gIXN5bmNocm9ub3VzXG59XG5cbmV4cG9ydHMuY2FjaGVHZXQgPSBmdW5jdGlvbihmbikge1xuICAgIGdldEZyb21DYWNoZSA9IGZuXG59XG5leHBvcnRzLmNhY2hlU2V0ID0gZnVuY3Rpb24oZm4pIHtcbiAgICBzZXRPbkNhY2hlID0gZm5cbn0iLCIvKiBDb3B5cmlnaHQgKGMpIDIwMTMgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXHJcblxyXG52YXIgdHJpbUFyZ3MgPSByZXF1aXJlKFwidHJpbUFyZ3VtZW50c1wiKVxyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRnV0dXJlXHJcblxyXG5GdXR1cmUuZGVidWcgPSBmYWxzZSAvLyBzd2l0Y2ggdGhpcyB0byB0cnVlIGlmIHlvdSB3YW50IGlkcyBhbmQgbG9uZyBzdGFjayB0cmFjZXNcclxuXHJcbnZhciBjdXJJZCA9IDAgICAgICAgICAvLyBmb3IgaWRzXFxcclxuZnVuY3Rpb24gRnV0dXJlKHZhbHVlKSB7XHJcblx0aWYoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcclxuXHRcdHZhciBmID0gbmV3IEZ1dHVyZSgpXHJcbiAgICAgICAgZi5yZXR1cm4odmFsdWUpXHJcbiAgICAgICAgcmV0dXJuIGZcclxuXHR9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuaXNSZXNvbHZlZCA9IGZhbHNlXHJcbiAgICAgICAgdGhpcy5xdWV1ZSA9IFtdXHJcbiAgICAgICAgaWYoRnV0dXJlLmRlYnVnKSB7XHJcbiAgICAgICAgICAgIGN1cklkKytcclxuICAgICAgICAgICAgdGhpcy5pZCA9IGN1cklkXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBzdGF0aWMgbWV0aG9kc1xyXG5cclxuLy8gaGFzIG9uZSBwYXJhbWV0ZXI6IGVpdGhlciBhIGJ1bmNoIG9mIGZ1dHVyZXMsIG9yIGEgc2luZ2xlIGFycmF5IG9mIGZ1dHVyZXNcclxuLy8gcmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIG9uZSBvZiB0aGVtIGVycm9ycywgb3Igd2hlbiBhbGwgb2YgdGhlbSBzdWNjZWVkc1xyXG5GdXR1cmUuYWxsID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZihhcmd1bWVudHNbMF0gaW5zdGFuY2VvZiBBcnJheSkge1xyXG4gICAgICAgIHZhciBmdXR1cmVzID0gYXJndW1lbnRzWzBdXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBmdXR1cmVzID0gdHJpbUFyZ3MoYXJndW1lbnRzKVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZSgpXHJcbiAgICB2YXIgcmVzdWx0cyA9IFtdXHJcblxyXG4gICAgaWYoZnV0dXJlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFyIGN1cnJlbnQgPSBmdXR1cmVzWzBdXHJcbiAgICAgICAgZnV0dXJlcy5mb3JFYWNoKGZ1bmN0aW9uKGZ1dHVyZSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQudGhlbihmdW5jdGlvbih2KSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRzW2luZGV4XSA9IHZcclxuICAgICAgICAgICAgICAgIHJldHVybiBmdXR1cmVzW2luZGV4KzFdXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuXHJcbiAgICAgICAgLy9pZlxyXG4gICAgICAgIGN1cnJlbnQuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgfSlcclxuICAgICAgICAvLyBlbHNlXHJcbiAgICAgICAgY3VycmVudC50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBmLnJldHVybihyZXN1bHRzKVxyXG4gICAgICAgIH0pXHJcblxyXG5cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZi5yZXR1cm4ocmVzdWx0cylcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZlxyXG59XHJcblxyXG4vLyBlaXRoZXIgdXNlZCBsaWtlIGZ1dHVyZVdyYXAoZnVuY3Rpb24oKXsgLi4uIH0pKGFyZzEsYXJnMixldGMpIG9yXHJcbi8vICBmdXR1cmVXcmFwKG9iamVjdCwgJ21ldGhvZE5hbWUnKShhcmcxLGFyZzIsZXRjKVxyXG5GdXR1cmUud3JhcCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgLy8gZnVuY3Rpb25cclxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICB2YXIgZm4gPSBhcmd1bWVudHNbMF1cclxuICAgICAgICB2YXIgb2JqZWN0ID0gdW5kZWZpbmVkXHJcblxyXG5cclxuICAgIC8vIG9iamVjdCwgZnVuY3Rpb25cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIG9iamVjdCA9IGFyZ3VtZW50c1swXVxyXG4gICAgICAgIHZhciBmbiA9IG9iamVjdFthcmd1bWVudHNbMV1dXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxyXG4gICAgICAgIHZhciBmdXR1cmUgPSBuZXcgRnV0dXJlXHJcbiAgICAgICAgYXJncy5wdXNoKGZ1dHVyZS5yZXNvbHZlcigpKVxyXG4gICAgICAgIHZhciBtZSA9IHRoaXNcclxuICAgICAgICBpZihvYmplY3QpIG1lID0gb2JqZWN0XHJcbiAgICAgICAgZm4uYXBwbHkobWUsIGFyZ3MpXHJcbiAgICAgICAgcmV0dXJuIGZ1dHVyZVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuLy8gZGVmYXVsdFxyXG52YXIgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICB0aHJvdyBlXHJcbiAgICB9LDApXHJcbn1cclxuXHJcbi8vIHNldHVwIHVuaGFuZGxlZCBlcnJvciBoYW5kbGVyXHJcbi8vIHVuaGFuZGxlZCBlcnJvcnMgaGFwcGVuIHdoZW4gZG9uZSBpcyBjYWxsZWQsIGFuZCAgdGhlbiBhbiBleGNlcHRpb24gaXMgdGhyb3duIGZyb20gdGhlIGZ1dHVyZVxyXG5GdXR1cmUuZXJyb3IgPSBmdW5jdGlvbihoYW5kbGVyKSB7XHJcbiAgICB1bmhhbmRsZWRFcnJvckhhbmRsZXIgPSBoYW5kbGVyXHJcbn1cclxuXHJcbi8vIGluc3RhbmNlIG1ldGhvZHNcclxuXHJcbi8vIHJldHVybnMgYSB2YWx1ZSBmb3IgdGhlIGZ1dHVyZSAoY2FuIG9ubHkgYmUgZXhlY3V0ZWQgb25jZSlcclxuLy8gaWYgdGhlcmUgYXJlIGNhbGxiYWNrcyB3YWl0aW5nIG9uIHRoaXMgdmFsdWUsIHRoZXkgYXJlIHJ1biBpbiB0aGUgbmV4dCB0aWNrXHJcbiAgICAvLyAoaWUgdGhleSBhcmVuJ3QgcnVuIGltbWVkaWF0ZWx5LCBhbGxvd2luZyB0aGUgY3VycmVudCB0aHJlYWQgb2YgZXhlY3V0aW9uIHRvIGNvbXBsZXRlKVxyXG5GdXR1cmUucHJvdG90eXBlLnJldHVybiA9IGZ1bmN0aW9uKHYpIHtcclxuICAgIHJlc29sdmUodGhpcywgJ3JldHVybicsIHYpXHJcbn1cclxuRnV0dXJlLnByb3RvdHlwZS50aHJvdyA9IGZ1bmN0aW9uKGUpIHtcclxuICAgIHJlc29sdmUodGhpcywgJ2Vycm9yJywgZSlcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0TmV4dCh0aGF0LCBmdXR1cmUpIHtcclxuICAgIGlmKGZ1dHVyZSAhPT0gdW5kZWZpbmVkICYmICFpc0xpa2VBRnV0dXJlKGZ1dHVyZSkgKVxyXG4gICAgICAgIHRocm93IEVycm9yKFwiVmFsdWUgcmV0dXJuZWQgZnJvbSB0aGVuIG9yIGNhdGNoICpub3QqIGEgRnV0dXJlOiBcIitmdXR1cmUpXHJcblxyXG4gICAgcmVzb2x2ZSh0aGF0LCAnbmV4dCcsIGZ1dHVyZSlcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdCh0aGF0LCBjYikge1xyXG4gICAgaWYodGhhdC5pc1Jlc29sdmVkKSB7XHJcbiAgICAgICAgZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBbY2JdKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGF0LnF1ZXVlLnB1c2goY2IpXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIGR1Y2sgdHlwaW5nIHRvIGRldGVybWluZSBpZiBzb21ldGhpbmcgaXMgb3IgaXNuJ3QgYSBmdXR1cmVcclxuZnVuY3Rpb24gaXNMaWtlQUZ1dHVyZSh4KSB7XHJcbiAgICByZXR1cm4geC5pc1Jlc29sdmVkICE9PSB1bmRlZmluZWQgJiYgeC5xdWV1ZSAhPT0gdW5kZWZpbmVkICYmIHgudGhlbiAhPT0gdW5kZWZpbmVkXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdhaXRPblJlc3VsdChmLCByZXN1bHQsIGNiKSB7XHJcbiAgICB3YWl0KHJlc3VsdCwgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYodGhpcy5oYXNFcnJvcikge1xyXG4gICAgICAgICAgICBmLnRocm93KHRoaXMuZXJyb3IpXHJcbiAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICB3YWl0T25SZXN1bHQoZiwgdGhpcy5uZXh0LCBjYilcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgc2V0TmV4dChmLCBjYih0aGlzLnJlc3VsdCkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxufVxyXG5cclxuXHJcbi8vIGNiIHRha2VzIG9uZSBwYXJhbWV0ZXIgLSB0aGUgdmFsdWUgcmV0dXJuZWRcclxuLy8gY2IgY2FuIHJldHVybiBhIEZ1dHVyZSwgaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IG9mIHRoYXQgRnV0dXJlIGlzIHBhc3NlZCB0byBuZXh0LWluLWNoYWluXHJcbkZ1dHVyZS5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmVcclxuICAgIHdhaXQodGhpcywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYodGhpcy5oYXNFcnJvcilcclxuICAgICAgICAgICAgZi50aHJvdyh0aGlzLmVycm9yKVxyXG4gICAgICAgIGVsc2UgaWYodGhpcy5oYXNOZXh0KVxyXG4gICAgICAgICAgICB3YWl0T25SZXN1bHQoZiwgdGhpcy5uZXh0LCBjYilcclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHNldE5leHQoZiwgY2IodGhpcy5yZXN1bHQpKVxyXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbiAgICByZXR1cm4gZlxyXG59XHJcbi8vIGNiIHRha2VzIG9uZSBwYXJhbWV0ZXIgLSB0aGUgZXJyb3IgY2F1Z2h0XHJcbi8vIGNiIGNhbiByZXR1cm4gYSBGdXR1cmUsIGluIHdoaWNoIGNhc2UgdGhlIHJlc3VsdCBvZiB0aGF0IEZ1dHVyZSBpcyBwYXNzZWQgdG8gbmV4dC1pbi1jaGFpblxyXG5GdXR1cmUucHJvdG90eXBlLmNhdGNoID0gZnVuY3Rpb24oY2IpIHtcclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZVxyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGNiKHRoaXMuZXJyb3IpKVxyXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgdGhpcy5uZXh0LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgZi5yZXR1cm4odilcclxuICAgICAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgc2V0TmV4dChmLCBjYihlKSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmLnJldHVybih0aGlzLnJlc3VsdClcclxuICAgICAgICB9XHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIGZcclxufVxyXG4vLyBjYiB0YWtlcyBubyBwYXJhbWV0ZXJzXHJcbi8vIGNhbGxiYWNrJ3MgcmV0dXJuIHZhbHVlIGlzIGlnbm9yZWQsIGJ1dCB0aHJvd24gZXhjZXB0aW9ucyBwcm9wb2dhdGUgbm9ybWFsbHlcclxuRnV0dXJlLnByb3RvdHlwZS5maW5hbGx5ID0gZnVuY3Rpb24oY2IpIHtcclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZVxyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXNcclxuICAgICAgICAgICAgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm5leHQudGhlbihmdW5jdGlvbih2KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBjYigpXHJcbiAgICAgICAgICAgICAgICAgICAgZi5yZXR1cm4odilcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geFxyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID0gY2IoKVxyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4geFxyXG4gICAgICAgICAgICAgICAgfSkuZG9uZSgpXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBGdXR1cmUodHJ1ZSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IoKVxyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KHRoYXQuZXJyb3IpXHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgfSkuZG9uZSgpXHJcblxyXG4gICAgICAgICAgICB9IGVsc2UgIHtcclxuICAgICAgICAgICAgICAgIEZ1dHVyZSh0cnVlKS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYigpXHJcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYucmV0dXJuKHRoYXQucmVzdWx0KVxyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgICAgIH0pLmRvbmUoKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICB9XHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gYWxsIHVudXNlZCBmdXR1cmVzIHNob3VsZCBlbmQgd2l0aCB0aGlzIChlLmcuIG1vc3QgdGhlbi1jaGFpbnMpXHJcbi8vIGRldGF0Y2hlcyB0aGUgZnV0dXJlIHNvIGFueSBwcm9wb2dhdGVkIGV4Y2VwdGlvbiBpcyB0aHJvd24gKHNvIHRoZSBleGNlcHRpb24gaXNuJ3Qgc2lsZW50bHkgbG9zdClcclxuRnV0dXJlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24oKSB7XHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKHRoaXMuZXJyb3IpXHJcbiAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICB0aGlzLm5leHQuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxufVxyXG5cclxuXHJcblxyXG5GdXR1cmUucHJvdG90eXBlLnJlc29sdmVyID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgbWUgPSB0aGlzXHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGUsdikge1xyXG4gICAgICAgIGlmKGUpIHsgLy8gZXJyb3IgYXJndW1lbnRcclxuICAgICAgICAgICAgbWUudGhyb3coZSlcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBtZS5yZXR1cm4odilcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbkZ1dHVyZS5wcm90b3R5cGUucmVzb2x2ZWQgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmlzUmVzb2x2ZWRcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmUodGhhdCwgdHlwZSwgdmFsdWUpIHtcclxuICAgIGlmKHRoYXQuaXNSZXNvbHZlZClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIkZ1dHVyZSByZXNvbHZlZCBtb3JlIHRoYW4gb25jZSEgUmVzb2x1dGlvbjogXCIrdmFsdWUpXHJcblxyXG4gICAgdGhhdC5pc1Jlc29sdmVkID0gdHJ1ZVxyXG4gICAgdGhhdC5oYXNFcnJvciA9IHR5cGUgPT09ICdlcnJvcidcclxuICAgIHRoYXQuaGFzTmV4dCA9IHR5cGUgPT09ICduZXh0JyAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkXHJcblxyXG4gICAgaWYodGhhdC5oYXNFcnJvcilcclxuICAgICAgICB0aGF0LmVycm9yID0gdmFsdWVcclxuICAgIGVsc2UgaWYodGhhdC5oYXNOZXh0KVxyXG4gICAgICAgIHRoYXQubmV4dCA9IHZhbHVlXHJcbiAgICBlbHNlXHJcbiAgICAgICAgdGhhdC5yZXN1bHQgPSB2YWx1ZVxyXG5cclxuICAgIGV4ZWN1dGVDYWxsYmFja3ModGhhdCwgdGhhdC5xdWV1ZSlcclxufVxyXG5cclxuZnVuY3Rpb24gZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBjYWxsYmFja3MpIHtcclxuICAgIGlmKGNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgY2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24oY2IpIHtcclxuICAgICAgICAgICAgICAgIGNiLmFwcGx5KHRoYXQpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSwwKVxyXG4gICAgfVxyXG59XHJcbiIsIi8vIHJlc29sdmVzIHZhcmFyZ3MgdmFyaWFibGUgaW50byBtb3JlIHVzYWJsZSBmb3JtXG4vLyBhcmdzIC0gc2hvdWxkIGJlIGEgZnVuY3Rpb24gYXJndW1lbnRzIHZhcmlhYmxlXG4vLyByZXR1cm5zIGEgamF2YXNjcmlwdCBBcnJheSBvYmplY3Qgb2YgYXJndW1lbnRzIHRoYXQgZG9lc24ndCBjb3VudCB0cmFpbGluZyB1bmRlZmluZWQgdmFsdWVzIGluIHRoZSBsZW5ndGhcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odGhlQXJndW1lbnRzKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGVBcmd1bWVudHMsIDApXG5cbiAgICB2YXIgY291bnQgPSAwO1xuICAgIGZvcih2YXIgbj1hcmdzLmxlbmd0aC0xOyBuPj0wOyBuLS0pIHtcbiAgICAgICAgaWYoYXJnc1tuXSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY291bnQrK1xuICAgIH1cbiAgICBhcmdzLnNwbGljZSgtMCwgY291bnQpXG4gICAgcmV0dXJuIGFyZ3Ncbn0iLCIvKiBDb3B5cmlnaHQgKGMpIDIwMTMgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXHJcblxyXG52YXIgdHJpbUFyZ3MgPSByZXF1aXJlKFwidHJpbUFyZ3VtZW50c1wiKVxyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRnV0dXJlXHJcblxyXG5GdXR1cmUuZGVidWcgPSBmYWxzZSAvLyBzd2l0Y2ggdGhpcyB0byB0cnVlIGlmIHlvdSB3YW50IGlkcyBhbmQgbG9uZyBzdGFjayB0cmFjZXNcclxuXHJcbnZhciBjdXJJZCA9IDAgICAgICAgICAvLyBmb3IgaWRzXFxcclxuZnVuY3Rpb24gRnV0dXJlKHZhbHVlKSB7XHJcblx0aWYoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcclxuXHRcdHZhciBmID0gbmV3IEZ1dHVyZSgpXHJcbiAgICAgICAgZi5yZXR1cm4odmFsdWUpXHJcbiAgICAgICAgcmV0dXJuIGZcclxuXHR9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuaXNSZXNvbHZlZCA9IGZhbHNlXHJcbiAgICAgICAgdGhpcy5xdWV1ZSA9IFtdXHJcbiAgICAgICAgaWYoRnV0dXJlLmRlYnVnKSB7XHJcbiAgICAgICAgICAgIGN1cklkKytcclxuICAgICAgICAgICAgdGhpcy5pZCA9IGN1cklkXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBzdGF0aWMgbWV0aG9kc1xyXG5cclxuLy8gaGFzIG9uZSBwYXJhbWV0ZXI6IGVpdGhlciBhIGJ1bmNoIG9mIGZ1dHVyZXMsIG9yIGEgc2luZ2xlIGFycmF5IG9mIGZ1dHVyZXNcclxuLy8gcmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIG9uZSBvZiB0aGVtIGVycm9ycywgb3Igd2hlbiBhbGwgb2YgdGhlbSBzdWNjZWVkc1xyXG5GdXR1cmUuYWxsID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZihhcmd1bWVudHNbMF0gaW5zdGFuY2VvZiBBcnJheSkge1xyXG4gICAgICAgIHZhciBmdXR1cmVzID0gYXJndW1lbnRzWzBdXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBmdXR1cmVzID0gdHJpbUFyZ3MoYXJndW1lbnRzKVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZSgpXHJcbiAgICB2YXIgcmVzdWx0cyA9IFtdXHJcblxyXG4gICAgaWYoZnV0dXJlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdmFyIGN1cnJlbnQgPSBmdXR1cmVzWzBdXHJcbiAgICAgICAgZnV0dXJlcy5mb3JFYWNoKGZ1bmN0aW9uKGZ1dHVyZSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQudGhlbihmdW5jdGlvbih2KSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRzW2luZGV4XSA9IHZcclxuICAgICAgICAgICAgICAgIHJldHVybiBmdXR1cmVzW2luZGV4KzFdXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuXHJcbiAgICAgICAgLy9pZlxyXG4gICAgICAgIGN1cnJlbnQuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgfSlcclxuICAgICAgICAvLyBlbHNlXHJcbiAgICAgICAgY3VycmVudC50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBmLnJldHVybihyZXN1bHRzKVxyXG4gICAgICAgIH0pXHJcblxyXG5cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZi5yZXR1cm4ocmVzdWx0cylcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZlxyXG59XHJcblxyXG4vLyBlaXRoZXIgdXNlZCBsaWtlIGZ1dHVyZVdyYXAoZnVuY3Rpb24oKXsgLi4uIH0pKGFyZzEsYXJnMixldGMpIG9yXHJcbi8vICBmdXR1cmVXcmFwKG9iamVjdCwgJ21ldGhvZE5hbWUnKShhcmcxLGFyZzIsZXRjKVxyXG5GdXR1cmUud3JhcCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgLy8gZnVuY3Rpb25cclxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICB2YXIgZm4gPSBhcmd1bWVudHNbMF1cclxuICAgICAgICB2YXIgb2JqZWN0ID0gdW5kZWZpbmVkXHJcblxyXG5cclxuICAgIC8vIG9iamVjdCwgZnVuY3Rpb25cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIG9iamVjdCA9IGFyZ3VtZW50c1swXVxyXG4gICAgICAgIHZhciBmbiA9IG9iamVjdFthcmd1bWVudHNbMV1dXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxyXG4gICAgICAgIHZhciBmdXR1cmUgPSBuZXcgRnV0dXJlXHJcbiAgICAgICAgYXJncy5wdXNoKGZ1dHVyZS5yZXNvbHZlcigpKVxyXG4gICAgICAgIHZhciBtZSA9IHRoaXNcclxuICAgICAgICBpZihvYmplY3QpIG1lID0gb2JqZWN0XHJcbiAgICAgICAgZm4uYXBwbHkobWUsIGFyZ3MpXHJcbiAgICAgICAgcmV0dXJuIGZ1dHVyZVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuLy8gZGVmYXVsdFxyXG52YXIgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICB0aHJvdyBlXHJcbiAgICB9LDApXHJcbn1cclxuXHJcbi8vIHNldHVwIHVuaGFuZGxlZCBlcnJvciBoYW5kbGVyXHJcbi8vIHVuaGFuZGxlZCBlcnJvcnMgaGFwcGVuIHdoZW4gZG9uZSBpcyBjYWxsZWQsIGFuZCAgdGhlbiBhbiBleGNlcHRpb24gaXMgdGhyb3duIGZyb20gdGhlIGZ1dHVyZVxyXG5GdXR1cmUuZXJyb3IgPSBmdW5jdGlvbihoYW5kbGVyKSB7XHJcbiAgICB1bmhhbmRsZWRFcnJvckhhbmRsZXIgPSBoYW5kbGVyXHJcbn1cclxuXHJcbi8vIGluc3RhbmNlIG1ldGhvZHNcclxuXHJcbi8vIHJldHVybnMgYSB2YWx1ZSBmb3IgdGhlIGZ1dHVyZSAoY2FuIG9ubHkgYmUgZXhlY3V0ZWQgb25jZSlcclxuLy8gaWYgdGhlcmUgYXJlIGNhbGxiYWNrcyB3YWl0aW5nIG9uIHRoaXMgdmFsdWUsIHRoZXkgYXJlIHJ1biBpbiB0aGUgbmV4dCB0aWNrXHJcbiAgICAvLyAoaWUgdGhleSBhcmVuJ3QgcnVuIGltbWVkaWF0ZWx5LCBhbGxvd2luZyB0aGUgY3VycmVudCB0aHJlYWQgb2YgZXhlY3V0aW9uIHRvIGNvbXBsZXRlKVxyXG5GdXR1cmUucHJvdG90eXBlLnJldHVybiA9IGZ1bmN0aW9uKHYpIHtcclxuICAgIHJlc29sdmUodGhpcywgJ3JldHVybicsIHYpXHJcbn1cclxuRnV0dXJlLnByb3RvdHlwZS50aHJvdyA9IGZ1bmN0aW9uKGUpIHtcclxuICAgIHJlc29sdmUodGhpcywgJ2Vycm9yJywgZSlcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0TmV4dCh0aGF0LCBmdXR1cmUpIHtcclxuICAgIGlmKGZ1dHVyZSAhPT0gdW5kZWZpbmVkICYmICFpc0xpa2VBRnV0dXJlKGZ1dHVyZSkgKVxyXG4gICAgICAgIHRocm93IEVycm9yKFwiVmFsdWUgcmV0dXJuZWQgZnJvbSB0aGVuIG9yIGNhdGNoICpub3QqIGEgRnV0dXJlOiBcIitmdXR1cmUpXHJcblxyXG4gICAgcmVzb2x2ZSh0aGF0LCAnbmV4dCcsIGZ1dHVyZSlcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdCh0aGF0LCBjYikge1xyXG4gICAgaWYodGhhdC5pc1Jlc29sdmVkKSB7XHJcbiAgICAgICAgZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBbY2JdKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGF0LnF1ZXVlLnB1c2goY2IpXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIGR1Y2sgdHlwaW5nIHRvIGRldGVybWluZSBpZiBzb21ldGhpbmcgaXMgb3IgaXNuJ3QgYSBmdXR1cmVcclxudmFyIGlzTGlrZUFGdXR1cmUgPSBGdXR1cmUuaXNMaWtlQUZ1dHVyZSA9IGZ1bmN0aW9uKHgpIHtcclxuICAgIHJldHVybiB4LmlzUmVzb2x2ZWQgIT09IHVuZGVmaW5lZCAmJiB4LnF1ZXVlICE9PSB1bmRlZmluZWQgJiYgeC50aGVuICE9PSB1bmRlZmluZWRcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdE9uUmVzdWx0KGYsIHJlc3VsdCwgY2IpIHtcclxuICAgIHdhaXQocmVzdWx0LCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHdhaXRPblJlc3VsdChmLCB0aGlzLm5leHQsIGNiKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGNiKHRoaXMucmVzdWx0KSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9KVxyXG59XHJcblxyXG5cclxuLy8gY2IgdGFrZXMgb25lIHBhcmFtZXRlciAtIHRoZSB2YWx1ZSByZXR1cm5lZFxyXG4vLyBjYiBjYW4gcmV0dXJuIGEgRnV0dXJlLCBpbiB3aGljaCBjYXNlIHRoZSByZXN1bHQgb2YgdGhhdCBGdXR1cmUgaXMgcGFzc2VkIHRvIG5leHQtaW4tY2hhaW5cclxuRnV0dXJlLnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24oY2IpIHtcclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZVxyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKVxyXG4gICAgICAgICAgICBmLnRocm93KHRoaXMuZXJyb3IpXHJcbiAgICAgICAgZWxzZSBpZih0aGlzLmhhc05leHQpXHJcbiAgICAgICAgICAgIHdhaXRPblJlc3VsdChmLCB0aGlzLm5leHQsIGNiKVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgc2V0TmV4dChmLCBjYih0aGlzLnJlc3VsdCkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgb25lIHBhcmFtZXRlciAtIHRoZSBlcnJvciBjYXVnaHRcclxuLy8gY2IgY2FuIHJldHVybiBhIEZ1dHVyZSwgaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IG9mIHRoYXQgRnV0dXJlIGlzIHBhc3NlZCB0byBuZXh0LWluLWNoYWluXHJcbkZ1dHVyZS5wcm90b3R5cGUuY2F0Y2ggPSBmdW5jdGlvbihjYikge1xyXG4gICAgdmFyIGYgPSBuZXcgRnV0dXJlXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHNldE5leHQoZiwgY2IodGhpcy5lcnJvcikpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICB0aGlzLm5leHQudGhlbihmdW5jdGlvbih2KSB7XHJcbiAgICAgICAgICAgICAgICBmLnJldHVybih2KVxyXG4gICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGNiKGUpKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGYucmV0dXJuKHRoaXMucmVzdWx0KVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbiAgICByZXR1cm4gZlxyXG59XHJcbi8vIGNiIHRha2VzIG5vIHBhcmFtZXRlcnNcclxuLy8gY2FsbGJhY2sncyByZXR1cm4gdmFsdWUgaXMgaWdub3JlZCwgYnV0IHRocm93biBleGNlcHRpb25zIHByb3BvZ2F0ZSBub3JtYWxseVxyXG5GdXR1cmUucHJvdG90eXBlLmZpbmFsbHkgPSBmdW5jdGlvbihjYikge1xyXG4gICAgdmFyIGYgPSBuZXcgRnV0dXJlXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpc1xyXG4gICAgICAgICAgICBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IGNiKClcclxuICAgICAgICAgICAgICAgICAgICBmLnJldHVybih2KVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4XHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBjYigpXHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4XHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIEZ1dHVyZSh0cnVlKS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYigpXHJcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3codGhhdC5lcnJvcilcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuXHJcbiAgICAgICAgICAgIH0gZWxzZSAge1xyXG4gICAgICAgICAgICAgICAgRnV0dXJlKHRydWUpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi5yZXR1cm4odGhhdC5yZXN1bHQpXHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgfSkuZG9uZSgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbiAgICByZXR1cm4gZlxyXG59XHJcblxyXG4vLyBhbGwgdW51c2VkIGZ1dHVyZXMgc2hvdWxkIGVuZCB3aXRoIHRoaXMgKGUuZy4gbW9zdCB0aGVuLWNoYWlucylcclxuLy8gZGV0YXRjaGVzIHRoZSBmdXR1cmUgc28gYW55IHByb3BvZ2F0ZWQgZXhjZXB0aW9uIGlzIHRocm93biAoc28gdGhlIGV4Y2VwdGlvbiBpc24ndCBzaWxlbnRseSBsb3N0KVxyXG5GdXR1cmUucHJvdG90eXBlLmRvbmUgPSBmdW5jdGlvbigpIHtcclxuICAgIHdhaXQodGhpcywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYodGhpcy5oYXNFcnJvcikge1xyXG4gICAgICAgICAgICB1bmhhbmRsZWRFcnJvckhhbmRsZXIodGhpcy5lcnJvcilcclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dC5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICB1bmhhbmRsZWRFcnJvckhhbmRsZXIoZSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICB9KVxyXG59XHJcblxyXG5cclxuXHJcbkZ1dHVyZS5wcm90b3R5cGUucmVzb2x2ZXIgPSBmdW5jdGlvbigpIHtcclxuICAgIHZhciBtZSA9IHRoaXNcclxuXHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZSx2KSB7XHJcbiAgICAgICAgaWYoZSkgeyAvLyBlcnJvciBhcmd1bWVudFxyXG4gICAgICAgICAgICBtZS50aHJvdyhlKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG1lLnJldHVybih2KVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuRnV0dXJlLnByb3RvdHlwZS5yZXNvbHZlZCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuaXNSZXNvbHZlZFxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gcmVzb2x2ZSh0aGF0LCB0eXBlLCB2YWx1ZSkge1xyXG4gICAgaWYodGhhdC5pc1Jlc29sdmVkKVxyXG4gICAgICAgIHRocm93IEVycm9yKFwiRnV0dXJlIHJlc29sdmVkIG1vcmUgdGhhbiBvbmNlISBSZXNvbHV0aW9uOiBcIit2YWx1ZSlcclxuXHJcbiAgICB0aGF0LmlzUmVzb2x2ZWQgPSB0cnVlXHJcbiAgICB0aGF0Lmhhc0Vycm9yID0gdHlwZSA9PT0gJ2Vycm9yJ1xyXG4gICAgdGhhdC5oYXNOZXh0ID0gdHlwZSA9PT0gJ25leHQnICYmIHZhbHVlICE9PSB1bmRlZmluZWRcclxuXHJcbiAgICBpZih0aGF0Lmhhc0Vycm9yKVxyXG4gICAgICAgIHRoYXQuZXJyb3IgPSB2YWx1ZVxyXG4gICAgZWxzZSBpZih0aGF0Lmhhc05leHQpXHJcbiAgICAgICAgdGhhdC5uZXh0ID0gdmFsdWVcclxuICAgIGVsc2VcclxuICAgICAgICB0aGF0LnJlc3VsdCA9IHZhbHVlXHJcblxyXG4gICAgZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCB0aGF0LnF1ZXVlKVxyXG59XHJcblxyXG5mdW5jdGlvbiBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIGNhbGxiYWNrcykge1xyXG4gICAgaWYoY2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbihjYikge1xyXG4gICAgICAgICAgICAgICAgY2IuYXBwbHkodGhhdClcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKGUpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59IiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJGOlxcXFxiaWxseXNGaWxlXFxcXGNvZGVcXFxcamF2YXNjcmlwdFxcXFxub2RlanNcXFxcZGVhZHVuaXRDb3JlXFxcXG5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5XFxcXG5vZGVfbW9kdWxlc1xcXFxpbnNlcnQtbW9kdWxlLWdsb2JhbHNcXFxcbm9kZV9tb2R1bGVzXFxcXHByb2Nlc3NcXFxcYnJvd3Nlci5qc1wiKSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKiEgaHR0cDovL210aHMuYmUvcHVueWNvZGUgdjEuMi40IGJ5IEBtYXRoaWFzICovXG47KGZ1bmN0aW9uKHJvb3QpIHtcblxuXHQvKiogRGV0ZWN0IGZyZWUgdmFyaWFibGVzICovXG5cdHZhciBmcmVlRXhwb3J0cyA9IHR5cGVvZiBleHBvcnRzID09ICdvYmplY3QnICYmIGV4cG9ydHM7XG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHRtb2R1bGUuZXhwb3J0cyA9PSBmcmVlRXhwb3J0cyAmJiBtb2R1bGU7XG5cdHZhciBmcmVlR2xvYmFsID0gdHlwZW9mIGdsb2JhbCA9PSAnb2JqZWN0JyAmJiBnbG9iYWw7XG5cdGlmIChmcmVlR2xvYmFsLmdsb2JhbCA9PT0gZnJlZUdsb2JhbCB8fCBmcmVlR2xvYmFsLndpbmRvdyA9PT0gZnJlZUdsb2JhbCkge1xuXHRcdHJvb3QgPSBmcmVlR2xvYmFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBgcHVueWNvZGVgIG9iamVjdC5cblx0ICogQG5hbWUgcHVueWNvZGVcblx0ICogQHR5cGUgT2JqZWN0XG5cdCAqL1xuXHR2YXIgcHVueWNvZGUsXG5cblx0LyoqIEhpZ2hlc3QgcG9zaXRpdmUgc2lnbmVkIDMyLWJpdCBmbG9hdCB2YWx1ZSAqL1xuXHRtYXhJbnQgPSAyMTQ3NDgzNjQ3LCAvLyBha2EuIDB4N0ZGRkZGRkYgb3IgMl4zMS0xXG5cblx0LyoqIEJvb3RzdHJpbmcgcGFyYW1ldGVycyAqL1xuXHRiYXNlID0gMzYsXG5cdHRNaW4gPSAxLFxuXHR0TWF4ID0gMjYsXG5cdHNrZXcgPSAzOCxcblx0ZGFtcCA9IDcwMCxcblx0aW5pdGlhbEJpYXMgPSA3Mixcblx0aW5pdGlhbE4gPSAxMjgsIC8vIDB4ODBcblx0ZGVsaW1pdGVyID0gJy0nLCAvLyAnXFx4MkQnXG5cblx0LyoqIFJlZ3VsYXIgZXhwcmVzc2lvbnMgKi9cblx0cmVnZXhQdW55Y29kZSA9IC9eeG4tLS8sXG5cdHJlZ2V4Tm9uQVNDSUkgPSAvW14gLX5dLywgLy8gdW5wcmludGFibGUgQVNDSUkgY2hhcnMgKyBub24tQVNDSUkgY2hhcnNcblx0cmVnZXhTZXBhcmF0b3JzID0gL1xceDJFfFxcdTMwMDJ8XFx1RkYwRXxcXHVGRjYxL2csIC8vIFJGQyAzNDkwIHNlcGFyYXRvcnNcblxuXHQvKiogRXJyb3IgbWVzc2FnZXMgKi9cblx0ZXJyb3JzID0ge1xuXHRcdCdvdmVyZmxvdyc6ICdPdmVyZmxvdzogaW5wdXQgbmVlZHMgd2lkZXIgaW50ZWdlcnMgdG8gcHJvY2VzcycsXG5cdFx0J25vdC1iYXNpYyc6ICdJbGxlZ2FsIGlucHV0ID49IDB4ODAgKG5vdCBhIGJhc2ljIGNvZGUgcG9pbnQpJyxcblx0XHQnaW52YWxpZC1pbnB1dCc6ICdJbnZhbGlkIGlucHV0J1xuXHR9LFxuXG5cdC8qKiBDb252ZW5pZW5jZSBzaG9ydGN1dHMgKi9cblx0YmFzZU1pbnVzVE1pbiA9IGJhc2UgLSB0TWluLFxuXHRmbG9vciA9IE1hdGguZmxvb3IsXG5cdHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUsXG5cblx0LyoqIFRlbXBvcmFyeSB2YXJpYWJsZSAqL1xuXHRrZXk7XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBlcnJvciB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgZXJyb3IgdHlwZS5cblx0ICogQHJldHVybnMge0Vycm9yfSBUaHJvd3MgYSBgUmFuZ2VFcnJvcmAgd2l0aCB0aGUgYXBwbGljYWJsZSBlcnJvciBtZXNzYWdlLlxuXHQgKi9cblx0ZnVuY3Rpb24gZXJyb3IodHlwZSkge1xuXHRcdHRocm93IFJhbmdlRXJyb3IoZXJyb3JzW3R5cGVdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgYEFycmF5I21hcGAgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGl0ZXJhdGUgb3Zlci5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5IGFycmF5XG5cdCAqIGl0ZW0uXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgYXJyYXkgb2YgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcChhcnJheSwgZm4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXHRcdHdoaWxlIChsZW5ndGgtLSkge1xuXHRcdFx0YXJyYXlbbGVuZ3RoXSA9IGZuKGFycmF5W2xlbmd0aF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJyYXk7XG5cdH1cblxuXHQvKipcblx0ICogQSBzaW1wbGUgYEFycmF5I21hcGAtbGlrZSB3cmFwcGVyIHRvIHdvcmsgd2l0aCBkb21haW4gbmFtZSBzdHJpbmdzLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZS5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5XG5cdCAqIGNoYXJhY3Rlci5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBzdHJpbmcgb2YgY2hhcmFjdGVycyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2tcblx0ICogZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXBEb21haW4oc3RyaW5nLCBmbikge1xuXHRcdHJldHVybiBtYXAoc3RyaW5nLnNwbGl0KHJlZ2V4U2VwYXJhdG9ycyksIGZuKS5qb2luKCcuJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBudW1lcmljIGNvZGUgcG9pbnRzIG9mIGVhY2ggVW5pY29kZVxuXHQgKiBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZy4gV2hpbGUgSmF2YVNjcmlwdCB1c2VzIFVDUy0yIGludGVybmFsbHksXG5cdCAqIHRoaXMgZnVuY3Rpb24gd2lsbCBjb252ZXJ0IGEgcGFpciBvZiBzdXJyb2dhdGUgaGFsdmVzIChlYWNoIG9mIHdoaWNoXG5cdCAqIFVDUy0yIGV4cG9zZXMgYXMgc2VwYXJhdGUgY2hhcmFjdGVycykgaW50byBhIHNpbmdsZSBjb2RlIHBvaW50LFxuXHQgKiBtYXRjaGluZyBVVEYtMTYuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZW5jb2RlYFxuXHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBkZWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZyBUaGUgVW5pY29kZSBpbnB1dCBzdHJpbmcgKFVDUy0yKS5cblx0ICogQHJldHVybnMge0FycmF5fSBUaGUgbmV3IGFycmF5IG9mIGNvZGUgcG9pbnRzLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmRlY29kZShzdHJpbmcpIHtcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGNvdW50ZXIgPSAwLFxuXHRcdCAgICBsZW5ndGggPSBzdHJpbmcubGVuZ3RoLFxuXHRcdCAgICB2YWx1ZSxcblx0XHQgICAgZXh0cmE7XG5cdFx0d2hpbGUgKGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdHZhbHVlID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdGlmICh2YWx1ZSA+PSAweEQ4MDAgJiYgdmFsdWUgPD0gMHhEQkZGICYmIGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gaGlnaCBzdXJyb2dhdGUsIGFuZCB0aGVyZSBpcyBhIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdGV4dHJhID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdFx0aWYgKChleHRyYSAmIDB4RkMwMCkgPT0gMHhEQzAwKSB7IC8vIGxvdyBzdXJyb2dhdGVcblx0XHRcdFx0XHRvdXRwdXQucHVzaCgoKHZhbHVlICYgMHgzRkYpIDw8IDEwKSArIChleHRyYSAmIDB4M0ZGKSArIDB4MTAwMDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHVubWF0Y2hlZCBzdXJyb2dhdGU7IG9ubHkgYXBwZW5kIHRoaXMgY29kZSB1bml0LCBpbiBjYXNlIHRoZSBuZXh0XG5cdFx0XHRcdFx0Ly8gY29kZSB1bml0IGlzIHRoZSBoaWdoIHN1cnJvZ2F0ZSBvZiBhIHN1cnJvZ2F0ZSBwYWlyXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGNvdW50ZXItLTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBzdHJpbmcgYmFzZWQgb24gYW4gYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5kZWNvZGVgXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGVuY29kZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBjb2RlUG9pbnRzIFRoZSBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgbmV3IFVuaWNvZGUgc3RyaW5nIChVQ1MtMikuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZW5jb2RlKGFycmF5KSB7XG5cdFx0cmV0dXJuIG1hcChhcnJheSwgZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdHZhciBvdXRwdXQgPSAnJztcblx0XHRcdGlmICh2YWx1ZSA+IDB4RkZGRikge1xuXHRcdFx0XHR2YWx1ZSAtPSAweDEwMDAwO1xuXHRcdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlID4+PiAxMCAmIDB4M0ZGIHwgMHhEODAwKTtcblx0XHRcdFx0dmFsdWUgPSAweERDMDAgfCB2YWx1ZSAmIDB4M0ZGO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSk7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH0pLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgYmFzaWMgY29kZSBwb2ludCBpbnRvIGEgZGlnaXQvaW50ZWdlci5cblx0ICogQHNlZSBgZGlnaXRUb0Jhc2ljKClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBjb2RlUG9pbnQgVGhlIGJhc2ljIG51bWVyaWMgY29kZSBwb2ludCB2YWx1ZS5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50IChmb3IgdXNlIGluXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaW4gdGhlIHJhbmdlIGAwYCB0byBgYmFzZSAtIDFgLCBvciBgYmFzZWAgaWZcblx0ICogdGhlIGNvZGUgcG9pbnQgZG9lcyBub3QgcmVwcmVzZW50IGEgdmFsdWUuXG5cdCAqL1xuXHRmdW5jdGlvbiBiYXNpY1RvRGlnaXQoY29kZVBvaW50KSB7XG5cdFx0aWYgKGNvZGVQb2ludCAtIDQ4IDwgMTApIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSAyMjtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDY1IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA2NTtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDk3IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA5Nztcblx0XHR9XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBkaWdpdC9pbnRlZ2VyIGludG8gYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAc2VlIGBiYXNpY1RvRGlnaXQoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGRpZ2l0IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIGJhc2ljIGNvZGUgcG9pbnQgd2hvc2UgdmFsdWUgKHdoZW4gdXNlZCBmb3Jcblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpcyBgZGlnaXRgLCB3aGljaCBuZWVkcyB0byBiZSBpbiB0aGUgcmFuZ2Vcblx0ICogYDBgIHRvIGBiYXNlIC0gMWAuIElmIGBmbGFnYCBpcyBub24temVybywgdGhlIHVwcGVyY2FzZSBmb3JtIGlzXG5cdCAqIHVzZWQ7IGVsc2UsIHRoZSBsb3dlcmNhc2UgZm9ybSBpcyB1c2VkLiBUaGUgYmVoYXZpb3IgaXMgdW5kZWZpbmVkXG5cdCAqIGlmIGBmbGFnYCBpcyBub24temVybyBhbmQgYGRpZ2l0YCBoYXMgbm8gdXBwZXJjYXNlIGZvcm0uXG5cdCAqL1xuXHRmdW5jdGlvbiBkaWdpdFRvQmFzaWMoZGlnaXQsIGZsYWcpIHtcblx0XHQvLyAgMC4uMjUgbWFwIHRvIEFTQ0lJIGEuLnogb3IgQS4uWlxuXHRcdC8vIDI2Li4zNSBtYXAgdG8gQVNDSUkgMC4uOVxuXHRcdHJldHVybiBkaWdpdCArIDIyICsgNzUgKiAoZGlnaXQgPCAyNikgLSAoKGZsYWcgIT0gMCkgPDwgNSk7XG5cdH1cblxuXHQvKipcblx0ICogQmlhcyBhZGFwdGF0aW9uIGZ1bmN0aW9uIGFzIHBlciBzZWN0aW9uIDMuNCBvZiBSRkMgMzQ5Mi5cblx0ICogaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzQ5MiNzZWN0aW9uLTMuNFxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gYWRhcHQoZGVsdGEsIG51bVBvaW50cywgZmlyc3RUaW1lKSB7XG5cdFx0dmFyIGsgPSAwO1xuXHRcdGRlbHRhID0gZmlyc3RUaW1lID8gZmxvb3IoZGVsdGEgLyBkYW1wKSA6IGRlbHRhID4+IDE7XG5cdFx0ZGVsdGEgKz0gZmxvb3IoZGVsdGEgLyBudW1Qb2ludHMpO1xuXHRcdGZvciAoLyogbm8gaW5pdGlhbGl6YXRpb24gKi87IGRlbHRhID4gYmFzZU1pbnVzVE1pbiAqIHRNYXggPj4gMTsgayArPSBiYXNlKSB7XG5cdFx0XHRkZWx0YSA9IGZsb29yKGRlbHRhIC8gYmFzZU1pbnVzVE1pbik7XG5cdFx0fVxuXHRcdHJldHVybiBmbG9vcihrICsgKGJhc2VNaW51c1RNaW4gKyAxKSAqIGRlbHRhIC8gKGRlbHRhICsgc2tldykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scyB0byBhIHN0cmluZyBvZiBVbmljb2RlXG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGRlY29kZShpbnB1dCkge1xuXHRcdC8vIERvbid0IHVzZSBVQ1MtMlxuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGgsXG5cdFx0ICAgIG91dCxcblx0XHQgICAgaSA9IDAsXG5cdFx0ICAgIG4gPSBpbml0aWFsTixcblx0XHQgICAgYmlhcyA9IGluaXRpYWxCaWFzLFxuXHRcdCAgICBiYXNpYyxcblx0XHQgICAgaixcblx0XHQgICAgaW5kZXgsXG5cdFx0ICAgIG9sZGksXG5cdFx0ICAgIHcsXG5cdFx0ICAgIGssXG5cdFx0ICAgIGRpZ2l0LFxuXHRcdCAgICB0LFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgYmFzZU1pbnVzVDtcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHM6IGxldCBgYmFzaWNgIGJlIHRoZSBudW1iZXIgb2YgaW5wdXQgY29kZVxuXHRcdC8vIHBvaW50cyBiZWZvcmUgdGhlIGxhc3QgZGVsaW1pdGVyLCBvciBgMGAgaWYgdGhlcmUgaXMgbm9uZSwgdGhlbiBjb3B5XG5cdFx0Ly8gdGhlIGZpcnN0IGJhc2ljIGNvZGUgcG9pbnRzIHRvIHRoZSBvdXRwdXQuXG5cblx0XHRiYXNpYyA9IGlucHV0Lmxhc3RJbmRleE9mKGRlbGltaXRlcik7XG5cdFx0aWYgKGJhc2ljIDwgMCkge1xuXHRcdFx0YmFzaWMgPSAwO1xuXHRcdH1cblxuXHRcdGZvciAoaiA9IDA7IGogPCBiYXNpYzsgKytqKSB7XG5cdFx0XHQvLyBpZiBpdCdzIG5vdCBhIGJhc2ljIGNvZGUgcG9pbnRcblx0XHRcdGlmIChpbnB1dC5jaGFyQ29kZUF0KGopID49IDB4ODApIHtcblx0XHRcdFx0ZXJyb3IoJ25vdC1iYXNpYycpO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0LnB1c2goaW5wdXQuY2hhckNvZGVBdChqKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBkZWNvZGluZyBsb29wOiBzdGFydCBqdXN0IGFmdGVyIHRoZSBsYXN0IGRlbGltaXRlciBpZiBhbnkgYmFzaWMgY29kZVxuXHRcdC8vIHBvaW50cyB3ZXJlIGNvcGllZDsgc3RhcnQgYXQgdGhlIGJlZ2lubmluZyBvdGhlcndpc2UuXG5cblx0XHRmb3IgKGluZGV4ID0gYmFzaWMgPiAwID8gYmFzaWMgKyAxIDogMDsgaW5kZXggPCBpbnB1dExlbmd0aDsgLyogbm8gZmluYWwgZXhwcmVzc2lvbiAqLykge1xuXG5cdFx0XHQvLyBgaW5kZXhgIGlzIHRoZSBpbmRleCBvZiB0aGUgbmV4dCBjaGFyYWN0ZXIgdG8gYmUgY29uc3VtZWQuXG5cdFx0XHQvLyBEZWNvZGUgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlciBpbnRvIGBkZWx0YWAsXG5cdFx0XHQvLyB3aGljaCBnZXRzIGFkZGVkIHRvIGBpYC4gVGhlIG92ZXJmbG93IGNoZWNraW5nIGlzIGVhc2llclxuXHRcdFx0Ly8gaWYgd2UgaW5jcmVhc2UgYGlgIGFzIHdlIGdvLCB0aGVuIHN1YnRyYWN0IG9mZiBpdHMgc3RhcnRpbmdcblx0XHRcdC8vIHZhbHVlIGF0IHRoZSBlbmQgdG8gb2J0YWluIGBkZWx0YWAuXG5cdFx0XHRmb3IgKG9sZGkgPSBpLCB3ID0gMSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cblx0XHRcdFx0aWYgKGluZGV4ID49IGlucHV0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZ2l0ID0gYmFzaWNUb0RpZ2l0KGlucHV0LmNoYXJDb2RlQXQoaW5kZXgrKykpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA+PSBiYXNlIHx8IGRpZ2l0ID4gZmxvb3IoKG1heEludCAtIGkpIC8gdykpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGkgKz0gZGlnaXQgKiB3O1xuXHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPCB0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdGlmICh3ID4gZmxvb3IobWF4SW50IC8gYmFzZU1pbnVzVCkpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHcgKj0gYmFzZU1pbnVzVDtcblxuXHRcdFx0fVxuXG5cdFx0XHRvdXQgPSBvdXRwdXQubGVuZ3RoICsgMTtcblx0XHRcdGJpYXMgPSBhZGFwdChpIC0gb2xkaSwgb3V0LCBvbGRpID09IDApO1xuXG5cdFx0XHQvLyBgaWAgd2FzIHN1cHBvc2VkIHRvIHdyYXAgYXJvdW5kIGZyb20gYG91dGAgdG8gYDBgLFxuXHRcdFx0Ly8gaW5jcmVtZW50aW5nIGBuYCBlYWNoIHRpbWUsIHNvIHdlJ2xsIGZpeCB0aGF0IG5vdzpcblx0XHRcdGlmIChmbG9vcihpIC8gb3V0KSA+IG1heEludCAtIG4pIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdG4gKz0gZmxvb3IoaSAvIG91dCk7XG5cdFx0XHRpICU9IG91dDtcblxuXHRcdFx0Ly8gSW5zZXJ0IGBuYCBhdCBwb3NpdGlvbiBgaWAgb2YgdGhlIG91dHB1dFxuXHRcdFx0b3V0cHV0LnNwbGljZShpKyssIDAsIG4pO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVjczJlbmNvZGUob3V0cHV0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMgdG8gYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBlbmNvZGUoaW5wdXQpIHtcblx0XHR2YXIgbixcblx0XHQgICAgZGVsdGEsXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50LFxuXHRcdCAgICBiYXNpY0xlbmd0aCxcblx0XHQgICAgYmlhcyxcblx0XHQgICAgaixcblx0XHQgICAgbSxcblx0XHQgICAgcSxcblx0XHQgICAgayxcblx0XHQgICAgdCxcblx0XHQgICAgY3VycmVudFZhbHVlLFxuXHRcdCAgICBvdXRwdXQgPSBbXSxcblx0XHQgICAgLyoqIGBpbnB1dExlbmd0aGAgd2lsbCBob2xkIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgaW4gYGlucHV0YC4gKi9cblx0XHQgICAgaW5wdXRMZW5ndGgsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsXG5cdFx0ICAgIGJhc2VNaW51c1QsXG5cdFx0ICAgIHFNaW51c1Q7XG5cblx0XHQvLyBDb252ZXJ0IHRoZSBpbnB1dCBpbiBVQ1MtMiB0byBVbmljb2RlXG5cdFx0aW5wdXQgPSB1Y3MyZGVjb2RlKGlucHV0KTtcblxuXHRcdC8vIENhY2hlIHRoZSBsZW5ndGhcblx0XHRpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aDtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHN0YXRlXG5cdFx0biA9IGluaXRpYWxOO1xuXHRcdGRlbHRhID0gMDtcblx0XHRiaWFzID0gaW5pdGlhbEJpYXM7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzXG5cdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IDB4ODApIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGN1cnJlbnRWYWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhhbmRsZWRDUENvdW50ID0gYmFzaWNMZW5ndGggPSBvdXRwdXQubGVuZ3RoO1xuXG5cdFx0Ly8gYGhhbmRsZWRDUENvdW50YCBpcyB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIHRoYXQgaGF2ZSBiZWVuIGhhbmRsZWQ7XG5cdFx0Ly8gYGJhc2ljTGVuZ3RoYCBpcyB0aGUgbnVtYmVyIG9mIGJhc2ljIGNvZGUgcG9pbnRzLlxuXG5cdFx0Ly8gRmluaXNoIHRoZSBiYXNpYyBzdHJpbmcgLSBpZiBpdCBpcyBub3QgZW1wdHkgLSB3aXRoIGEgZGVsaW1pdGVyXG5cdFx0aWYgKGJhc2ljTGVuZ3RoKSB7XG5cdFx0XHRvdXRwdXQucHVzaChkZWxpbWl0ZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZW5jb2RpbmcgbG9vcDpcblx0XHR3aGlsZSAoaGFuZGxlZENQQ291bnQgPCBpbnB1dExlbmd0aCkge1xuXG5cdFx0XHQvLyBBbGwgbm9uLWJhc2ljIGNvZGUgcG9pbnRzIDwgbiBoYXZlIGJlZW4gaGFuZGxlZCBhbHJlYWR5LiBGaW5kIHRoZSBuZXh0XG5cdFx0XHQvLyBsYXJnZXIgb25lOlxuXHRcdFx0Zm9yIChtID0gbWF4SW50LCBqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPj0gbiAmJiBjdXJyZW50VmFsdWUgPCBtKSB7XG5cdFx0XHRcdFx0bSA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmNyZWFzZSBgZGVsdGFgIGVub3VnaCB0byBhZHZhbmNlIHRoZSBkZWNvZGVyJ3MgPG4saT4gc3RhdGUgdG8gPG0sMD4sXG5cdFx0XHQvLyBidXQgZ3VhcmQgYWdhaW5zdCBvdmVyZmxvd1xuXHRcdFx0aGFuZGxlZENQQ291bnRQbHVzT25lID0gaGFuZGxlZENQQ291bnQgKyAxO1xuXHRcdFx0aWYgKG0gLSBuID4gZmxvb3IoKG1heEludCAtIGRlbHRhKSAvIGhhbmRsZWRDUENvdW50UGx1c09uZSkpIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGRlbHRhICs9IChtIC0gbikgKiBoYW5kbGVkQ1BDb3VudFBsdXNPbmU7XG5cdFx0XHRuID0gbTtcblxuXHRcdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IG4gJiYgKytkZWx0YSA+IG1heEludCkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA9PSBuKSB7XG5cdFx0XHRcdFx0Ly8gUmVwcmVzZW50IGRlbHRhIGFzIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXJcblx0XHRcdFx0XHRmb3IgKHEgPSBkZWx0YSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cdFx0XHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblx0XHRcdFx0XHRcdGlmIChxIDwgdCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHFNaW51c1QgPSBxIC0gdDtcblx0XHRcdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKFxuXHRcdFx0XHRcdFx0XHRzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHQgKyBxTWludXNUICUgYmFzZU1pbnVzVCwgMCkpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0cSA9IGZsb29yKHFNaW51c1QgLyBiYXNlTWludXNUKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHEsIDApKSk7XG5cdFx0XHRcdFx0YmlhcyA9IGFkYXB0KGRlbHRhLCBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsIGhhbmRsZWRDUENvdW50ID09IGJhc2ljTGVuZ3RoKTtcblx0XHRcdFx0XHRkZWx0YSA9IDA7XG5cdFx0XHRcdFx0KytoYW5kbGVkQ1BDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQrK2RlbHRhO1xuXHRcdFx0KytuO1xuXG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gVW5pY29kZS4gT25seSB0aGVcblx0ICogUHVueWNvZGVkIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCBvbiBhIHN0cmluZyB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gY29udmVydGVkIHRvXG5cdCAqIFVuaWNvZGUuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBQdW55Y29kZSBkb21haW4gbmFtZSB0byBjb252ZXJ0IHRvIFVuaWNvZGUuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBVbmljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBQdW55Y29kZVxuXHQgKiBzdHJpbmcuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b1VuaWNvZGUoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4UHVueWNvZGUudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gZGVjb2RlKHN0cmluZy5zbGljZSg0KS50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFVuaWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFB1bnljb2RlLiBPbmx5IHRoZVxuXHQgKiBub24tQVNDSUkgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCdzIGFscmVhZHkgaW4gQVNDSUkuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZSB0byBjb252ZXJ0LCBhcyBhIFVuaWNvZGUgc3RyaW5nLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgUHVueWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGRvbWFpbiBuYW1lLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9BU0NJSShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhOb25BU0NJSS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyAneG4tLScgKyBlbmNvZGUoc3RyaW5nKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKiBEZWZpbmUgdGhlIHB1YmxpYyBBUEkgKi9cblx0cHVueWNvZGUgPSB7XG5cdFx0LyoqXG5cdFx0ICogQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBjdXJyZW50IFB1bnljb2RlLmpzIHZlcnNpb24gbnVtYmVyLlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIFN0cmluZ1xuXHRcdCAqL1xuXHRcdCd2ZXJzaW9uJzogJzEuMi40Jyxcblx0XHQvKipcblx0XHQgKiBBbiBvYmplY3Qgb2YgbWV0aG9kcyB0byBjb252ZXJ0IGZyb20gSmF2YVNjcmlwdCdzIGludGVybmFsIGNoYXJhY3RlclxuXHRcdCAqIHJlcHJlc2VudGF0aW9uIChVQ1MtMikgdG8gVW5pY29kZSBjb2RlIHBvaW50cywgYW5kIGJhY2suXG5cdFx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBPYmplY3Rcblx0XHQgKi9cblx0XHQndWNzMic6IHtcblx0XHRcdCdkZWNvZGUnOiB1Y3MyZGVjb2RlLFxuXHRcdFx0J2VuY29kZSc6IHVjczJlbmNvZGVcblx0XHR9LFxuXHRcdCdkZWNvZGUnOiBkZWNvZGUsXG5cdFx0J2VuY29kZSc6IGVuY29kZSxcblx0XHQndG9BU0NJSSc6IHRvQVNDSUksXG5cdFx0J3RvVW5pY29kZSc6IHRvVW5pY29kZVxuXHR9O1xuXG5cdC8qKiBFeHBvc2UgYHB1bnljb2RlYCAqL1xuXHQvLyBTb21lIEFNRCBidWlsZCBvcHRpbWl6ZXJzLCBsaWtlIHIuanMsIGNoZWNrIGZvciBzcGVjaWZpYyBjb25kaXRpb24gcGF0dGVybnNcblx0Ly8gbGlrZSB0aGUgZm9sbG93aW5nOlxuXHRpZiAoXG5cdFx0dHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmXG5cdFx0dHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiZcblx0XHRkZWZpbmUuYW1kXG5cdCkge1xuXHRcdGRlZmluZSgncHVueWNvZGUnLCBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBwdW55Y29kZTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChmcmVlRXhwb3J0cyAmJiAhZnJlZUV4cG9ydHMubm9kZVR5cGUpIHtcblx0XHRpZiAoZnJlZU1vZHVsZSkgeyAvLyBpbiBOb2RlLmpzIG9yIFJpbmdvSlMgdjAuOC4wK1xuXHRcdFx0ZnJlZU1vZHVsZS5leHBvcnRzID0gcHVueWNvZGU7XG5cdFx0fSBlbHNlIHsgLy8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdGZvciAoa2V5IGluIHB1bnljb2RlKSB7XG5cdFx0XHRcdHB1bnljb2RlLmhhc093blByb3BlcnR5KGtleSkgJiYgKGZyZWVFeHBvcnRzW2tleV0gPSBwdW55Y29kZVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7IC8vIGluIFJoaW5vIG9yIGEgd2ViIGJyb3dzZXJcblx0XHRyb290LnB1bnljb2RlID0gcHVueWNvZGU7XG5cdH1cblxufSh0aGlzKSk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gSWYgb2JqLmhhc093blByb3BlcnR5IGhhcyBiZWVuIG92ZXJyaWRkZW4sIHRoZW4gY2FsbGluZ1xuLy8gb2JqLmhhc093blByb3BlcnR5KHByb3ApIHdpbGwgYnJlYWsuXG4vLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9qb3llbnQvbm9kZS9pc3N1ZXMvMTcwN1xuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxcywgc2VwLCBlcSwgb3B0aW9ucykge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgdmFyIG9iaiA9IHt9O1xuXG4gIGlmICh0eXBlb2YgcXMgIT09ICdzdHJpbmcnIHx8IHFzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICB2YXIgcmVnZXhwID0gL1xcKy9nO1xuICBxcyA9IHFzLnNwbGl0KHNlcCk7XG5cbiAgdmFyIG1heEtleXMgPSAxMDAwO1xuICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5tYXhLZXlzID09PSAnbnVtYmVyJykge1xuICAgIG1heEtleXMgPSBvcHRpb25zLm1heEtleXM7XG4gIH1cblxuICB2YXIgbGVuID0gcXMubGVuZ3RoO1xuICAvLyBtYXhLZXlzIDw9IDAgbWVhbnMgdGhhdCB3ZSBzaG91bGQgbm90IGxpbWl0IGtleXMgY291bnRcbiAgaWYgKG1heEtleXMgPiAwICYmIGxlbiA+IG1heEtleXMpIHtcbiAgICBsZW4gPSBtYXhLZXlzO1xuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgIHZhciB4ID0gcXNbaV0ucmVwbGFjZShyZWdleHAsICclMjAnKSxcbiAgICAgICAgaWR4ID0geC5pbmRleE9mKGVxKSxcbiAgICAgICAga3N0ciwgdnN0ciwgaywgdjtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAga3N0ciA9IHguc3Vic3RyKDAsIGlkeCk7XG4gICAgICB2c3RyID0geC5zdWJzdHIoaWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtzdHIgPSB4O1xuICAgICAgdnN0ciA9ICcnO1xuICAgIH1cblxuICAgIGsgPSBkZWNvZGVVUklDb21wb25lbnQoa3N0cik7XG4gICAgdiA9IGRlY29kZVVSSUNvbXBvbmVudCh2c3RyKTtcblxuICAgIGlmICghaGFzT3duUHJvcGVydHkob2JqLCBrKSkge1xuICAgICAgb2JqW2tdID0gdjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgb2JqW2tdLnB1c2godik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ialtrXSA9IFtvYmpba10sIHZdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvYmo7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzdHJpbmdpZnlQcmltaXRpdmUgPSBmdW5jdGlvbih2KSB7XG4gIHN3aXRjaCAodHlwZW9mIHYpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHY7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB2ID8gJ3RydWUnIDogJ2ZhbHNlJztcblxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gaXNGaW5pdGUodikgPyB2IDogJyc7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9iaiwgc2VwLCBlcSwgbmFtZSkge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgaWYgKG9iaiA9PT0gbnVsbCkge1xuICAgIG9iaiA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBtYXAob2JqZWN0S2V5cyhvYmopLCBmdW5jdGlvbihrKSB7XG4gICAgICB2YXIga3MgPSBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKGspKSArIGVxO1xuICAgICAgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgICByZXR1cm4gb2JqW2tdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG4gICAgICAgIH0pLmpvaW4oc2VwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqW2tdKSk7XG4gICAgICB9XG4gICAgfSkuam9pbihzZXApO1xuXG4gIH1cblxuICBpZiAoIW5hbWUpIHJldHVybiAnJztcbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUobmFtZSkpICsgZXEgK1xuICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmopKTtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG5mdW5jdGlvbiBtYXAgKHhzLCBmKSB7XG4gIGlmICh4cy5tYXApIHJldHVybiB4cy5tYXAoZik7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgIHJlcy5wdXNoKGYoeHNbaV0sIGkpKTtcbiAgfVxuICByZXR1cm4gcmVzO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHJlcy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZGVjb2RlID0gZXhwb3J0cy5wYXJzZSA9IHJlcXVpcmUoJy4vZGVjb2RlJyk7XG5leHBvcnRzLmVuY29kZSA9IGV4cG9ydHMuc3RyaW5naWZ5ID0gcmVxdWlyZSgnLi9lbmNvZGUnKTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgcHVueWNvZGUgPSByZXF1aXJlKCdwdW55Y29kZScpO1xuXG5leHBvcnRzLnBhcnNlID0gdXJsUGFyc2U7XG5leHBvcnRzLnJlc29sdmUgPSB1cmxSZXNvbHZlO1xuZXhwb3J0cy5yZXNvbHZlT2JqZWN0ID0gdXJsUmVzb2x2ZU9iamVjdDtcbmV4cG9ydHMuZm9ybWF0ID0gdXJsRm9ybWF0O1xuXG5leHBvcnRzLlVybCA9IFVybDtcblxuZnVuY3Rpb24gVXJsKCkge1xuICB0aGlzLnByb3RvY29sID0gbnVsbDtcbiAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgdGhpcy5hdXRoID0gbnVsbDtcbiAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgdGhpcy5wb3J0ID0gbnVsbDtcbiAgdGhpcy5ob3N0bmFtZSA9IG51bGw7XG4gIHRoaXMuaGFzaCA9IG51bGw7XG4gIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgdGhpcy5xdWVyeSA9IG51bGw7XG4gIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuICB0aGlzLnBhdGggPSBudWxsO1xuICB0aGlzLmhyZWYgPSBudWxsO1xufVxuXG4vLyBSZWZlcmVuY2U6IFJGQyAzOTg2LCBSRkMgMTgwOCwgUkZDIDIzOTZcblxuLy8gZGVmaW5lIHRoZXNlIGhlcmUgc28gYXQgbGVhc3QgdGhleSBvbmx5IGhhdmUgdG8gYmVcbi8vIGNvbXBpbGVkIG9uY2Ugb24gdGhlIGZpcnN0IG1vZHVsZSBsb2FkLlxudmFyIHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2ksXG4gICAgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgcmVzZXJ2ZWQgZm9yIGRlbGltaXRpbmcgVVJMcy5cbiAgICAvLyBXZSBhY3R1YWxseSBqdXN0IGF1dG8tZXNjYXBlIHRoZXNlLlxuICAgIGRlbGltcyA9IFsnPCcsICc+JywgJ1wiJywgJ2AnLCAnICcsICdcXHInLCAnXFxuJywgJ1xcdCddLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgbm90IGFsbG93ZWQgZm9yIHZhcmlvdXMgcmVhc29ucy5cbiAgICB1bndpc2UgPSBbJ3snLCAnfScsICd8JywgJ1xcXFwnLCAnXicsICdgJ10uY29uY2F0KGRlbGltcyksXG5cbiAgICAvLyBBbGxvd2VkIGJ5IFJGQ3MsIGJ1dCBjYXVzZSBvZiBYU1MgYXR0YWNrcy4gIEFsd2F5cyBlc2NhcGUgdGhlc2UuXG4gICAgYXV0b0VzY2FwZSA9IFsnXFwnJ10uY29uY2F0KHVud2lzZSksXG4gICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZS5cbiAgICAvLyBOb3RlIHRoYXQgYW55IGludmFsaWQgY2hhcnMgYXJlIGFsc28gaGFuZGxlZCwgYnV0IHRoZXNlXG4gICAgLy8gYXJlIHRoZSBvbmVzIHRoYXQgYXJlICpleHBlY3RlZCogdG8gYmUgc2Vlbiwgc28gd2UgZmFzdC1wYXRoXG4gICAgLy8gdGhlbS5cbiAgICBub25Ib3N0Q2hhcnMgPSBbJyUnLCAnLycsICc/JywgJzsnLCAnIyddLmNvbmNhdChhdXRvRXNjYXBlKSxcbiAgICBob3N0RW5kaW5nQ2hhcnMgPSBbJy8nLCAnPycsICcjJ10sXG4gICAgaG9zdG5hbWVNYXhMZW4gPSAyNTUsXG4gICAgaG9zdG5hbWVQYXJ0UGF0dGVybiA9IC9eW2EtejAtOUEtWl8tXXswLDYzfSQvLFxuICAgIGhvc3RuYW1lUGFydFN0YXJ0ID0gL14oW2EtejAtOUEtWl8tXXswLDYzfSkoLiopJC8sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgY2FuIGFsbG93IFwidW5zYWZlXCIgYW5kIFwidW53aXNlXCIgY2hhcnMuXG4gICAgdW5zYWZlUHJvdG9jb2wgPSB7XG4gICAgICAnamF2YXNjcmlwdCc6IHRydWUsXG4gICAgICAnamF2YXNjcmlwdDonOiB0cnVlXG4gICAgfSxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG4gICAgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgICAgICdqYXZhc2NyaXB0JzogdHJ1ZSxcbiAgICAgICdqYXZhc2NyaXB0Oic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuICAgIHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdodHRwczonOiB0cnVlLFxuICAgICAgJ2Z0cDonOiB0cnVlLFxuICAgICAgJ2dvcGhlcjonOiB0cnVlLFxuICAgICAgJ2ZpbGU6JzogdHJ1ZVxuICAgIH0sXG4gICAgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgJiYgaXNPYmplY3QodXJsKSAmJiB1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgdmFyIHUgPSBuZXcgVXJsO1xuICB1LnBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpO1xuICByZXR1cm4gdTtcbn1cblxuVXJsLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKCFpc1N0cmluZyh1cmwpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlBhcmFtZXRlciAndXJsJyBtdXN0IGJlIGEgc3RyaW5nLCBub3QgXCIgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIHZhciByZXN0ID0gdXJsO1xuXG4gIC8vIHRyaW0gYmVmb3JlIHByb2NlZWRpbmcuXG4gIC8vIFRoaXMgaXMgdG8gc3VwcG9ydCBwYXJzZSBzdHVmZiBsaWtlIFwiICBodHRwOi8vZm9vLmNvbSAgXFxuXCJcbiAgcmVzdCA9IHJlc3QudHJpbSgpO1xuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICByZXN0ID0gcmVzdC5zdWJzdHIocHJvdG8ubGVuZ3RoKTtcbiAgfVxuXG4gIC8vIGZpZ3VyZSBvdXQgaWYgaXQncyBnb3QgYSBob3N0XG4gIC8vIHVzZXJAc2VydmVyIGlzICphbHdheXMqIGludGVycHJldGVkIGFzIGEgaG9zdG5hbWUsIGFuZCB1cmxcbiAgLy8gcmVzb2x1dGlvbiB3aWxsIHRyZWF0IC8vZm9vL2JhciBhcyBob3N0PWZvbyxwYXRoPWJhciBiZWNhdXNlIHRoYXQnc1xuICAvLyBob3cgdGhlIGJyb3dzZXIgcmVzb2x2ZXMgcmVsYXRpdmUgVVJMcy5cbiAgaWYgKHNsYXNoZXNEZW5vdGVIb3N0IHx8IHByb3RvIHx8IHJlc3QubWF0Y2goL15cXC9cXC9bXkBcXC9dK0BbXkBcXC9dKy8pKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LnN1YnN0cigwLCAyKSA9PT0gJy8vJztcbiAgICBpZiAoc2xhc2hlcyAmJiAhKHByb3RvICYmIGhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dKSkge1xuICAgICAgcmVzdCA9IHJlc3Quc3Vic3RyKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmXG4gICAgICAoc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoZWRQcm90b2NvbFtwcm90b10pKSkge1xuXG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpjIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICAvLyBmaW5kIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiBhbnkgaG9zdEVuZGluZ0NoYXJzXG4gICAgdmFyIGhvc3RFbmQgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhvc3RFbmRpbmdDaGFycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhlYyA9IHJlc3QuaW5kZXhPZihob3N0RW5kaW5nQ2hhcnNbaV0pO1xuICAgICAgaWYgKGhlYyAhPT0gLTEgJiYgKGhvc3RFbmQgPT09IC0xIHx8IGhlYyA8IGhvc3RFbmQpKVxuICAgICAgICBob3N0RW5kID0gaGVjO1xuICAgIH1cblxuICAgIC8vIGF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgIHZhciBhdXRoLCBhdFNpZ247XG4gICAgaWYgKGhvc3RFbmQgPT09IC0xKSB7XG4gICAgICAvLyBhdFNpZ24gY2FuIGJlIGFueXdoZXJlLlxuICAgICAgYXRTaWduID0gcmVzdC5sYXN0SW5kZXhPZignQCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBhdFNpZ24gbXVzdCBiZSBpbiBhdXRoIHBvcnRpb24uXG4gICAgICAvLyBodHRwOi8vYUBiL2NAZCA9PiBob3N0OmIgYXV0aDphIHBhdGg6L2NAZFxuICAgICAgYXRTaWduID0gcmVzdC5sYXN0SW5kZXhPZignQCcsIGhvc3RFbmQpO1xuICAgIH1cblxuICAgIC8vIE5vdyB3ZSBoYXZlIGEgcG9ydGlvbiB3aGljaCBpcyBkZWZpbml0ZWx5IHRoZSBhdXRoLlxuICAgIC8vIFB1bGwgdGhhdCBvZmYuXG4gICAgaWYgKGF0U2lnbiAhPT0gLTEpIHtcbiAgICAgIGF1dGggPSByZXN0LnNsaWNlKDAsIGF0U2lnbik7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZShhdFNpZ24gKyAxKTtcbiAgICAgIHRoaXMuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG5cbiAgICAvLyB0aGUgaG9zdCBpcyB0aGUgcmVtYWluaW5nIHRvIHRoZSBsZWZ0IG9mIHRoZSBmaXJzdCBub24taG9zdCBjaGFyXG4gICAgaG9zdEVuZCA9IC0xO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9uSG9zdENoYXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaGVjID0gcmVzdC5pbmRleE9mKG5vbkhvc3RDaGFyc1tpXSk7XG4gICAgICBpZiAoaGVjICE9PSAtMSAmJiAoaG9zdEVuZCA9PT0gLTEgfHwgaGVjIDwgaG9zdEVuZCkpXG4gICAgICAgIGhvc3RFbmQgPSBoZWM7XG4gICAgfVxuICAgIC8vIGlmIHdlIHN0aWxsIGhhdmUgbm90IGhpdCBpdCwgdGhlbiB0aGUgZW50aXJlIHRoaW5nIGlzIGEgaG9zdC5cbiAgICBpZiAoaG9zdEVuZCA9PT0gLTEpXG4gICAgICBob3N0RW5kID0gcmVzdC5sZW5ndGg7XG5cbiAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKDAsIGhvc3RFbmQpO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKGhvc3RFbmQpO1xuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lIHx8ICcnO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZVswXSA9PT0gJ1snICYmXG4gICAgICAgIHRoaXMuaG9zdG5hbWVbdGhpcy5ob3N0bmFtZS5sZW5ndGggLSAxXSA9PT0gJ10nO1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHZhciBob3N0cGFydHMgPSB0aGlzLmhvc3RuYW1lLnNwbGl0KC9cXC4vKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gaG9zdHBhcnRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcGFydCA9IGhvc3RwYXJ0c1tpXTtcbiAgICAgICAgaWYgKCFwYXJ0KSBjb250aW51ZTtcbiAgICAgICAgaWYgKCFwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFBhdHRlcm4pKSB7XG4gICAgICAgICAgdmFyIG5ld3BhcnQgPSAnJztcbiAgICAgICAgICBmb3IgKHZhciBqID0gMCwgayA9IHBhcnQubGVuZ3RoOyBqIDwgazsgaisrKSB7XG4gICAgICAgICAgICBpZiAocGFydC5jaGFyQ29kZUF0KGopID4gMTI3KSB7XG4gICAgICAgICAgICAgIC8vIHdlIHJlcGxhY2Ugbm9uLUFTQ0lJIGNoYXIgd2l0aCBhIHRlbXBvcmFyeSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgICAvLyB3ZSBuZWVkIHRoaXMgdG8gbWFrZSBzdXJlIHNpemUgb2YgaG9zdG5hbWUgaXMgbm90XG4gICAgICAgICAgICAgIC8vIGJyb2tlbiBieSByZXBsYWNpbmcgbm9uLUFTQ0lJIGJ5IG5vdGhpbmdcbiAgICAgICAgICAgICAgbmV3cGFydCArPSAneCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXdwYXJ0ICs9IHBhcnRbal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHdlIHRlc3QgYWdhaW4gd2l0aCBBU0NJSSBjaGFyIG9ubHlcbiAgICAgICAgICBpZiAoIW5ld3BhcnQubWF0Y2goaG9zdG5hbWVQYXJ0UGF0dGVybikpIHtcbiAgICAgICAgICAgIHZhciB2YWxpZFBhcnRzID0gaG9zdHBhcnRzLnNsaWNlKDAsIGkpO1xuICAgICAgICAgICAgdmFyIG5vdEhvc3QgPSBob3N0cGFydHMuc2xpY2UoaSArIDEpO1xuICAgICAgICAgICAgdmFyIGJpdCA9IHBhcnQubWF0Y2goaG9zdG5hbWVQYXJ0U3RhcnQpO1xuICAgICAgICAgICAgaWYgKGJpdCkge1xuICAgICAgICAgICAgICB2YWxpZFBhcnRzLnB1c2goYml0WzFdKTtcbiAgICAgICAgICAgICAgbm90SG9zdC51bnNoaWZ0KGJpdFsyXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm90SG9zdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgcmVzdCA9ICcvJyArIG5vdEhvc3Quam9pbignLicpICsgcmVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB2YWxpZFBhcnRzLmpvaW4oJy4nKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLmhvc3RuYW1lLmxlbmd0aCA+IGhvc3RuYW1lTWF4TGVuKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGhvc3RuYW1lcyBhcmUgYWx3YXlzIGxvd2VyIGNhc2UuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cblxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55IGNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHRoZSBwYXJ0IG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgaW4gQVNDSUkuXG4gICAgICB2YXIgZG9tYWluQXJyYXkgPSB0aGlzLmhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvbWFpbkFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzID0gZG9tYWluQXJyYXlbaV07XG4gICAgICAgIG5ld091dC5wdXNoKHMubWF0Y2goL1teQS1aYS16MC05Xy1dLykgP1xuICAgICAgICAgICAgJ3huLS0nICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RuYW1lID0gbmV3T3V0LmpvaW4oJy4nKTtcbiAgICB9XG5cbiAgICB2YXIgcCA9IHRoaXMucG9ydCA/ICc6JyArIHRoaXMucG9ydCA6ICcnO1xuICAgIHZhciBoID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcbiAgICB0aGlzLmhvc3QgPSBoICsgcDtcbiAgICB0aGlzLmhyZWYgKz0gdGhpcy5ob3N0O1xuXG4gICAgLy8gc3RyaXAgWyBhbmQgXSBmcm9tIHRoZSBob3N0bmFtZVxuICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgaWYgKGlwdjZIb3N0bmFtZSkge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUuc3Vic3RyKDEsIHRoaXMuaG9zdG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBpZiAocmVzdFswXSAhPT0gJy8nKSB7XG4gICAgICAgIHJlc3QgPSAnLycgKyByZXN0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAvLyBjaG9wIG9mZiBhbnkgZGVsaW0gY2hhcnMuXG4gIGlmICghdW5zYWZlUHJvdG9jb2xbbG93ZXJQcm90b10pIHtcblxuICAgIC8vIEZpcnN0LCBtYWtlIDEwMCUgc3VyZSB0aGF0IGFueSBcImF1dG9Fc2NhcGVcIiBjaGFycyBnZXRcbiAgICAvLyBlc2NhcGVkLCBldmVuIGlmIGVuY29kZVVSSUNvbXBvbmVudCBkb2Vzbid0IHRoaW5rIHRoZXlcbiAgICAvLyBuZWVkIHRvIGJlLlxuICAgIGZvciAodmFyIGkgPSAwLCBsID0gYXV0b0VzY2FwZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHZhciBhZSA9IGF1dG9Fc2NhcGVbaV07XG4gICAgICB2YXIgZXNjID0gZW5jb2RlVVJJQ29tcG9uZW50KGFlKTtcbiAgICAgIGlmIChlc2MgPT09IGFlKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShhZSk7XG4gICAgICB9XG4gICAgICByZXN0ID0gcmVzdC5zcGxpdChhZSkuam9pbihlc2MpO1xuICAgIH1cbiAgfVxuXG5cbiAgLy8gY2hvcCBvZmYgZnJvbSB0aGUgdGFpbCBmaXJzdC5cbiAgdmFyIGhhc2ggPSByZXN0LmluZGV4T2YoJyMnKTtcbiAgaWYgKGhhc2ggIT09IC0xKSB7XG4gICAgLy8gZ290IGEgZnJhZ21lbnQgc3RyaW5nLlxuICAgIHRoaXMuaGFzaCA9IHJlc3Quc3Vic3RyKGhhc2gpO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKDAsIGhhc2gpO1xuICB9XG4gIHZhciBxbSA9IHJlc3QuaW5kZXhPZignPycpO1xuICBpZiAocW0gIT09IC0xKSB7XG4gICAgdGhpcy5zZWFyY2ggPSByZXN0LnN1YnN0cihxbSk7XG4gICAgdGhpcy5xdWVyeSA9IHJlc3Quc3Vic3RyKHFtICsgMSk7XG4gICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnF1ZXJ5KTtcbiAgICB9XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoMCwgcW0pO1xuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG4gIGlmIChyZXN0KSB0aGlzLnBhdGhuYW1lID0gcmVzdDtcbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtsb3dlclByb3RvXSAmJlxuICAgICAgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgdmFyIHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIHZhciBzID0gdGhpcy5zZWFyY2ggfHwgJyc7XG4gICAgdGhpcy5wYXRoID0gcCArIHM7XG4gIH1cblxuICAvLyBmaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgdGhpcy5ocmVmID0gdGhpcy5mb3JtYXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBmb3JtYXQgYSBwYXJzZWQgb2JqZWN0IGludG8gYSB1cmwgc3RyaW5nXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKGlzU3RyaW5nKG9iaikpIG9iaiA9IHVybFBhcnNlKG9iaik7XG4gIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHJldHVybiBVcmwucHJvdG90eXBlLmZvcm1hdC5jYWxsKG9iaik7XG4gIHJldHVybiBvYmouZm9ybWF0KCk7XG59XG5cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8ICcnO1xuICBpZiAoYXV0aCkge1xuICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgYXV0aCA9IGF1dGgucmVwbGFjZSgvJTNBL2ksICc6Jyk7XG4gICAgYXV0aCArPSAnQCc7XG4gIH1cblxuICB2YXIgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8ICcnLFxuICAgICAgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8ICcnLFxuICAgICAgaGFzaCA9IHRoaXMuaGFzaCB8fCAnJyxcbiAgICAgIGhvc3QgPSBmYWxzZSxcbiAgICAgIHF1ZXJ5ID0gJyc7XG5cbiAgaWYgKHRoaXMuaG9zdCkge1xuICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICB9IGVsc2UgaWYgKHRoaXMuaG9zdG5hbWUpIHtcbiAgICBob3N0ID0gYXV0aCArICh0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSA9PT0gLTEgP1xuICAgICAgICB0aGlzLmhvc3RuYW1lIDpcbiAgICAgICAgJ1snICsgdGhpcy5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgaG9zdCArPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkgJiZcbiAgICAgIGlzT2JqZWN0KHRoaXMucXVlcnkpICYmXG4gICAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJ5KS5sZW5ndGgpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcbiAgfVxuXG4gIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgKCc/JyArIHF1ZXJ5KSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLnN1YnN0cigtMSkgIT09ICc6JykgcHJvdG9jb2wgKz0gJzonO1xuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8XG4gICAgICAoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJBdCgwKSAhPT0gJy8nKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9IGVsc2UgaWYgKCFob3N0KSB7XG4gICAgaG9zdCA9ICcnO1xuICB9XG5cbiAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQXQoMCkgIT09ICcjJykgaGFzaCA9ICcjJyArIGhhc2g7XG4gIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJBdCgwKSAhPT0gJz8nKSBzZWFyY2ggPSAnPycgKyBzZWFyY2g7XG5cbiAgcGF0aG5hbWUgPSBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gIH0pO1xuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24ocmVsYXRpdmUpIHtcbiAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdCh1cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uKHJlbGF0aXZlKSB7XG4gIGlmIChpc1N0cmluZyhyZWxhdGl2ZSkpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgT2JqZWN0LmtleXModGhpcykuZm9yRWFjaChmdW5jdGlvbihrKSB7XG4gICAgcmVzdWx0W2tdID0gdGhpc1trXTtcbiAgfSwgdGhpcyk7XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICBPYmplY3Qua2V5cyhyZWxhdGl2ZSkuZm9yRWFjaChmdW5jdGlvbihrKSB7XG4gICAgICBpZiAoayAhPT0gJ3Byb3RvY29sJylcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgfSk7XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJlxuICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSAnLyc7XG4gICAgfVxuXG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgLy8gaWYgaXQncyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgLy8gYmVjYXVzZSB0aGF0J3Mga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgIGlmICghc2xhc2hlZFByb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXSkge1xuICAgICAgT2JqZWN0LmtleXMocmVsYXRpdmUpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgIH0pO1xuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmICghcmVsYXRpdmUuaG9zdCAmJiAhaG9zdGxlc3NQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gJyc7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9ICcnO1xuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckF0KDApID09PSAnLycpLFxuICAgICAgaXNSZWxBYnMgPSAoXG4gICAgICAgICAgcmVsYXRpdmUuaG9zdCB8fFxuICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICApLFxuICAgICAgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKSxcbiAgICAgIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzLFxuICAgICAgc3JjUGF0aCA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpIHx8IFtdLFxuICAgICAgcHN5Y2hvdGljID0gcmVzdWx0LnByb3RvY29sICYmICFzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXTtcblxuICAvLyBpZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9ICcnO1xuICAgIHJlc3VsdC5wb3J0ID0gbnVsbDtcbiAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgIH1cbiAgICByZXN1bHQuaG9zdCA9ICcnO1xuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgcmVsYXRpdmUucG9ydCA9IG51bGw7XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gJycpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgIH1cbiAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgIH1cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gJycgfHwgc3JjUGF0aFswXSA9PT0gJycpO1xuICB9XG5cbiAgaWYgKGlzUmVsQWJzKSB7XG4gICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICByZXN1bHQuaG9zdCA9IChyZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09ICcnKSA/XG4gICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gKHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmICghaXNOdWxsT3JVbmRlZmluZWQocmVsYXRpdmUuc2VhcmNoKSkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmICghaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIWlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICtcbiAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCkgJiYgKGxhc3QgPT09ICcuJyB8fCBsYXN0ID09PSAnLi4nKSB8fFxuICAgICAgbGFzdCA9PT0gJycpO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09ICcuJykge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gJycgJiZcbiAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJBdCgwKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiAoc3JjUGF0aC5qb2luKCcvJykuc3Vic3RyKC0xKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09ICcnIHx8XG4gICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJBdCgwKSA9PT0gJy8nKTtcblxuICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlID8gJycgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3JjUGF0aC5sZW5ndGggPyBzcmNQYXRoLnNoaWZ0KCkgOiAnJztcbiAgICAvL29jY2F0aW9uYWx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/XG4gICAgICAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmICghaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIWlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gIH1cbiAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGhvc3QgPSB0aGlzLmhvc3Q7XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICB0aGlzLnBvcnQgPSBwb3J0LnN1YnN0cigxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc3Vic3RyKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gXCJzdHJpbmdcIjtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gIGFyZyA9PSBudWxsO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbi8qIENvcHlyaWdodCAoYykgMjAxMyBCaWxseSBUZXRydWQgLSBGcmVlIHRvIHVzZSBmb3IgYW55IHB1cnBvc2U6IE1JVCBMaWNlbnNlKi9cclxuXHJcbnZhciBwcm90b3R5cGVOYW1lPSdwcm90b3R5cGUnLCB1bmRlZmluZWQsIHByb3RvVW5kZWZpbmVkPSd1bmRlZmluZWQnLCBpbml0PSdpbml0Jywgb3duUHJvcGVydHk9KHt9KS5oYXNPd25Qcm9wZXJ0eTsgLy8gbWluaWZpYWJsZSB2YXJpYWJsZXNcclxuZnVuY3Rpb24gcHJvdG8oKSB7XHJcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cyAvLyBtaW5pZmlhYmxlIHZhcmlhYmxlc1xyXG5cclxuICAgIGlmKGFyZ3MubGVuZ3RoID09IDEpIHtcclxuICAgICAgICB2YXIgcGFyZW50ID0ge31cclxuICAgICAgICB2YXIgcHJvdG90eXBlQnVpbGRlciA9IGFyZ3NbMF1cclxuXHJcbiAgICB9IGVsc2UgeyAvLyBsZW5ndGggPT0gMlxyXG4gICAgICAgIHZhciBwYXJlbnQgPSBhcmdzWzBdXHJcbiAgICAgICAgdmFyIHByb3RvdHlwZUJ1aWxkZXIgPSBhcmdzWzFdXHJcbiAgICB9XHJcblxyXG4gICAgLy8gc3BlY2lhbCBoYW5kbGluZyBmb3IgRXJyb3Igb2JqZWN0c1xyXG4gICAgdmFyIG5hbWVQb2ludGVyID0ge31cclxuICAgIGlmKFtFcnJvciwgRXZhbEVycm9yLCBSYW5nZUVycm9yLCBSZWZlcmVuY2VFcnJvciwgU3ludGF4RXJyb3IsIFR5cGVFcnJvciwgVVJJRXJyb3JdLmluZGV4T2YocGFyZW50KSAhPT0gLTEpIHtcclxuICAgICAgICBwYXJlbnQgPSBub3JtYWxpemVFcnJvck9iamVjdChwYXJlbnQsIG5hbWVQb2ludGVyKVxyXG4gICAgfVxyXG5cclxuICAgIC8vIHNldCB1cCB0aGUgcGFyZW50IGludG8gdGhlIHByb3RvdHlwZSBjaGFpbiBpZiBhIHBhcmVudCBpcyBwYXNzZWRcclxuICAgIHZhciBwYXJlbnRJc0Z1bmN0aW9uID0gdHlwZW9mKHBhcmVudCkgPT09IFwiZnVuY3Rpb25cIlxyXG4gICAgaWYocGFyZW50SXNGdW5jdGlvbikge1xyXG4gICAgICAgIHByb3RvdHlwZUJ1aWxkZXJbcHJvdG90eXBlTmFtZV0gPSBwYXJlbnRbcHJvdG90eXBlTmFtZV1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcHJvdG90eXBlQnVpbGRlcltwcm90b3R5cGVOYW1lXSA9IHBhcmVudFxyXG4gICAgfVxyXG5cclxuICAgIC8vIHRoZSBwcm90b3R5cGUgdGhhdCB3aWxsIGJlIHVzZWQgdG8gbWFrZSBpbnN0YW5jZXNcclxuICAgIHZhciBwcm90b3R5cGUgPSBuZXcgcHJvdG90eXBlQnVpbGRlcihwYXJlbnQpXHJcbiAgICBwcm90b3R5cGUuY29uc3RydWN0b3IgPSBQcm90b09iamVjdEZhY3Rvcnk7ICAgIC8vIHNldCB0aGUgY29uc3RydWN0b3IgcHJvcGVydHkgb24gdGhlIHByb3RvdHlwZVxyXG4gICAgbmFtZVBvaW50ZXIubmFtZSA9IHByb3RvdHlwZS5uYW1lXHJcblxyXG4gICAgLy8gaWYgdGhlcmUncyBubyBpbml0LCBhc3N1bWUgaXRzIGluaGVyaXRpbmcgYSBub24tcHJvdG8gY2xhc3MsIHNvIGRlZmF1bHQgdG8gYXBwbHlpbmcgdGhlIHN1cGVyY2xhc3MncyBjb25zdHJ1Y3Rvci5cclxuICAgIGlmKCFwcm90b3R5cGVbaW5pdF0gJiYgcGFyZW50SXNGdW5jdGlvbikge1xyXG4gICAgICAgIHByb3RvdHlwZVtpbml0XSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBjb25zdHJ1Y3RvciBmb3IgZW1wdHkgb2JqZWN0IHdoaWNoIHdpbGwgYmUgcG9wdWxhdGVkIHZpYSB0aGUgY29uc3RydWN0b3JcclxuICAgIHZhciBGID0gZnVuY3Rpb24oKSB7fVxyXG4gICAgICAgIEZbcHJvdG90eXBlTmFtZV0gPSBwcm90b3R5cGUgICAgLy8gc2V0IHRoZSBwcm90b3R5cGUgZm9yIGNyZWF0ZWQgaW5zdGFuY2VzXHJcblxyXG4gICAgZnVuY3Rpb24gUHJvdG9PYmplY3RGYWN0b3J5KCkgeyAgICAgLy8gcmVzdWx0IG9iamVjdCBmYWN0b3J5XHJcbiAgICAgICAgdmFyIHggPSBuZXcgRigpICAgICAgICAgICAgICAgICAvLyBlbXB0eSBvYmplY3RcclxuXHJcbiAgICAgICAgaWYocHJvdG90eXBlW2luaXRdKSB7XHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBwcm90b3R5cGVbaW5pdF0uYXBwbHkoeCwgYXJndW1lbnRzKSAgICAvLyBwb3B1bGF0ZSBvYmplY3QgdmlhIHRoZSBjb25zdHJ1Y3RvclxyXG4gICAgICAgICAgICBpZihyZXN1bHQgPT09IHByb3RvW3Byb3RvVW5kZWZpbmVkXSlcclxuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWRcclxuICAgICAgICAgICAgZWxzZSBpZihyZXN1bHQgIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHhcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4geFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBhZGQgYWxsIHRoZSBwcm90b3R5cGUgcHJvcGVydGllcyBvbnRvIHRoZSBzdGF0aWMgY2xhc3MgYXMgd2VsbCAoc28geW91IGNhbiBhY2Nlc3MgdGhhdCBjbGFzcyB3aGVuIHlvdSB3YW50IHRvIHJlZmVyZW5jZSBzdXBlcmNsYXNzIHByb3BlcnRpZXMpXHJcbiAgICBmb3IodmFyIG4gaW4gcHJvdG90eXBlKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgUHJvdG9PYmplY3RGYWN0b3J5W25dID0gcHJvdG90eXBlW25dXHJcbiAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgIC8vIGRvIG5vdGhpbmcsIGlmIGEgcHJvcGVydHkgKGxpa2UgYG5hbWVgKSBjYW4ndCBiZSBzZXQsIGp1c3QgaWdub3JlIGl0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIFByb3RvT2JqZWN0RmFjdG9yeVtwcm90b3R5cGVOYW1lXSA9IHByb3RvdHlwZSAgLy8gc2V0IHRoZSBwcm90b3R5cGUgb24gdGhlIG9iamVjdCBmYWN0b3J5XHJcblxyXG4gICAgcmV0dXJuIFByb3RvT2JqZWN0RmFjdG9yeTtcclxufVxyXG5cclxucHJvdG9bcHJvdG9VbmRlZmluZWRdID0ge30gLy8gYSBzcGVjaWFsIG1hcmtlciBmb3Igd2hlbiB5b3Ugd2FudCB0byByZXR1cm4gdW5kZWZpbmVkIGZyb20gYSBjb25zdHJ1Y3RvclxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBwcm90b1xyXG5cclxuZnVuY3Rpb24gbm9ybWFsaXplRXJyb3JPYmplY3QoRXJyb3JPYmplY3QsIG5hbWVQb2ludGVyKSB7XHJcbiAgICBmdW5jdGlvbiBOb3JtYWxpemVkRXJyb3IoKSB7XHJcbiAgICAgICAgdmFyIHRtcCA9IG5ldyBFcnJvck9iamVjdChhcmd1bWVudHNbMF0pXHJcbiAgICAgICAgdG1wLm5hbWUgPSBuYW1lUG9pbnRlci5uYW1lXHJcblxyXG4gICAgICAgIHRoaXMuc3RhY2sgPSB0bXAuc3RhY2tcclxuICAgICAgICB0aGlzLm1lc3NhZ2UgPSB0bXAubWVzc2FnZVxyXG5cclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG4gICAgICAgIHZhciBJbnRlcm1lZGlhdGVJbmhlcml0b3IgPSBmdW5jdGlvbigpIHt9XHJcbiAgICAgICAgICAgIEludGVybWVkaWF0ZUluaGVyaXRvci5wcm90b3R5cGUgPSBFcnJvck9iamVjdC5wcm90b3R5cGVcclxuICAgICAgICBOb3JtYWxpemVkRXJyb3IucHJvdG90eXBlID0gbmV3IEludGVybWVkaWF0ZUluaGVyaXRvcigpXHJcbiAgICByZXR1cm4gTm9ybWFsaXplZEVycm9yXHJcbn0iLCIvLyBDb3B5cmlnaHQgMjAxNCBTaW1vbiBMeWRlbGxcclxuLy8gWDExICjigJxNSVTigJ0pIExpY2Vuc2VkLiAoU2VlIExJQ0VOU0UuKVxyXG5cclxudm9pZCAoZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xyXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgZGVmaW5lKGZhY3RvcnkpXHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KClcclxuICB9IGVsc2Uge1xyXG4gICAgcm9vdC5yZXNvbHZlVXJsID0gZmFjdG9yeSgpXHJcbiAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG5cclxuICBmdW5jdGlvbiByZXNvbHZlVXJsKC8qIC4uLnVybHMgKi8pIHtcclxuICAgIHZhciBudW1VcmxzID0gYXJndW1lbnRzLmxlbmd0aFxyXG5cclxuICAgIGlmIChudW1VcmxzID09PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcInJlc29sdmVVcmwgcmVxdWlyZXMgYXQgbGVhc3Qgb25lIGFyZ3VtZW50OyBnb3Qgbm9uZS5cIilcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJiYXNlXCIpXHJcbiAgICBiYXNlLmhyZWYgPSBhcmd1bWVudHNbMF1cclxuXHJcbiAgICBpZiAobnVtVXJscyA9PT0gMSkge1xyXG4gICAgICByZXR1cm4gYmFzZS5ocmVmXHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcImhlYWRcIilbMF1cclxuICAgIGhlYWQuaW5zZXJ0QmVmb3JlKGJhc2UsIGhlYWQuZmlyc3RDaGlsZClcclxuXHJcbiAgICB2YXIgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpXHJcbiAgICB2YXIgcmVzb2x2ZWRcclxuXHJcbiAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgbnVtVXJsczsgaW5kZXgrKykge1xyXG4gICAgICBhLmhyZWYgPSBhcmd1bWVudHNbaW5kZXhdXHJcbiAgICAgIHJlc29sdmVkID0gYS5ocmVmXHJcbiAgICAgIGJhc2UuaHJlZiA9IHJlc29sdmVkXHJcbiAgICB9XHJcblxyXG4gICAgaGVhZC5yZW1vdmVDaGlsZChiYXNlKVxyXG5cclxuICAgIHJldHVybiByZXNvbHZlZFxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJlc29sdmVVcmxcclxuXHJcbn0pKTtcclxuIiwiLy8gQ29weXJpZ2h0IDIwMTQgU2ltb24gTHlkZWxsXHJcblxyXG52b2lkIChmdW5jdGlvbihyb290LCBmYWN0b3J5KSB7XHJcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICBkZWZpbmUoZmFjdG9yeSlcclxuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKVxyXG4gIH0gZWxzZSB7XHJcbiAgICByb290LnNvdXJjZU1hcHBpbmdVUkwgPSBmYWN0b3J5KClcclxuICB9XHJcbn0odGhpcywgZnVuY3Rpb24odW5kZWZpbmVkKSB7XHJcblxyXG4gIHZhciBpbm5lclJlZ2V4ID0gL1sjQF0gc291cmNlTWFwcGluZ1VSTD0oW15cXHMnXCJdKikvXHJcbiAgdmFyIG5ld2xpbmVSZWdleCA9IC9cXHJcXG4/fFxcbi9cclxuXHJcbiAgdmFyIHJlZ2V4ID0gUmVnRXhwKFxyXG4gICAgXCIoXnwoPzpcIiArIG5ld2xpbmVSZWdleC5zb3VyY2UgKyBcIikpXCIgK1xyXG4gICAgXCIoPzpcIiArXHJcbiAgICAgIFwiL1xcXFwqXCIgK1xyXG4gICAgICBcIig/OlxcXFxzKig/OlwiICsgbmV3bGluZVJlZ2V4LnNvdXJjZSArIFwiKSg/Oi8vKT8pP1wiICtcclxuICAgICAgXCIoPzpcIiArIGlubmVyUmVnZXguc291cmNlICsgXCIpXCIgK1xyXG4gICAgICBcIlxcXFxzKlwiICtcclxuICAgICAgXCJcXFxcKi9cIiArXHJcbiAgICAgIFwifFwiICtcclxuICAgICAgXCIvLyg/OlwiICsgaW5uZXJSZWdleC5zb3VyY2UgKyBcIilcIiArXHJcbiAgICBcIilcIiArXHJcbiAgICBcIlxcXFxzKiRcIlxyXG4gIClcclxuXHJcbiAgZnVuY3Rpb24gU291cmNlTWFwcGluZ1VSTChjb21tZW50U3ludGF4KSB7XHJcbiAgICB0aGlzLl9jb21tZW50U3ludGF4ID0gY29tbWVudFN5bnRheFxyXG4gIH1cclxuXHJcbiAgU291cmNlTWFwcGluZ1VSTC5wcm90b3R5cGUucmVnZXggPSByZWdleFxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLl9pbm5lclJlZ2V4ID0gaW5uZXJSZWdleFxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLl9uZXdsaW5lUmVnZXggPSBuZXdsaW5lUmVnZXhcclxuXHJcbiAgU291cmNlTWFwcGluZ1VSTC5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24oY29kZSkge1xyXG4gICAgdmFyIG1hdGNoID0gY29kZS5tYXRjaCh0aGlzLnJlZ2V4KVxyXG4gICAgaWYgKCFtYXRjaCkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1hdGNoWzJdIHx8IG1hdGNoWzNdIHx8IFwiXCJcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKGNvZGUsIHVybCwgY29tbWVudFN5bnRheCkge1xyXG4gICAgaWYgKCFjb21tZW50U3ludGF4KSB7XHJcbiAgICAgIGNvbW1lbnRTeW50YXggPSB0aGlzLl9jb21tZW50U3ludGF4XHJcbiAgICB9XHJcbiAgICAvLyBVc2UgYSBuZXdsaW5lIHByZXNlbnQgaW4gdGhlIGNvZGUsIG9yIGZhbGwgYmFjayB0byAnXFxuJy5cclxuICAgIHZhciBuZXdsaW5lID0gU3RyaW5nKGNvZGUubWF0Y2godGhpcy5fbmV3bGluZVJlZ2V4KSB8fCBcIlxcblwiKVxyXG4gICAgdmFyIG9wZW4gPSBjb21tZW50U3ludGF4WzBdLCBjbG9zZSA9IGNvbW1lbnRTeW50YXhbMV0gfHwgXCJcIlxyXG4gICAgY29kZSA9IHRoaXMucmVtb3ZlKGNvZGUpXHJcbiAgICByZXR1cm4gY29kZSArIG5ld2xpbmUgKyBvcGVuICsgXCIjIHNvdXJjZU1hcHBpbmdVUkw9XCIgKyB1cmwgKyBjbG9zZVxyXG4gIH1cclxuXHJcbiAgU291cmNlTWFwcGluZ1VSTC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oY29kZSkge1xyXG4gICAgcmV0dXJuIGNvZGUucmVwbGFjZSh0aGlzLnJlZ2V4LCBcIlwiKVxyXG4gIH1cclxuXHJcbiAgU291cmNlTWFwcGluZ1VSTC5wcm90b3R5cGUuaW5zZXJ0QmVmb3JlID0gZnVuY3Rpb24oY29kZSwgc3RyaW5nKSB7XHJcbiAgICB2YXIgbWF0Y2ggPSBjb2RlLm1hdGNoKHRoaXMucmVnZXgpXHJcbiAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgdmFyIGhhc05ld2xpbmUgPSBCb29sZWFuKG1hdGNoWzFdKVxyXG4gICAgICByZXR1cm4gY29kZS5zbGljZSgwLCBtYXRjaC5pbmRleCkgK1xyXG4gICAgICAgIHN0cmluZyArXHJcbiAgICAgICAgKGhhc05ld2xpbmUgPyBcIlwiIDogXCJcXG5cIikgK1xyXG4gICAgICAgIGNvZGUuc2xpY2UobWF0Y2guaW5kZXgpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gY29kZSArIHN0cmluZ1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgU291cmNlTWFwcGluZ1VSTC5wcm90b3R5cGUuU291cmNlTWFwcGluZ1VSTCA9IFNvdXJjZU1hcHBpbmdVUkxcclxuXHJcbiAgcmV0dXJuIG5ldyBTb3VyY2VNYXBwaW5nVVJMKFtcIi8qXCIsIFwiICovXCJdKVxyXG5cclxufSkpO1xyXG4iLCIvLyBDb3B5cmlnaHQgMjAxNCBTaW1vbiBMeWRlbGxcbi8vIFgxMSAo4oCcTUlU4oCdKSBMaWNlbnNlZC4gKFNlZSBMSUNFTlNFLilcblxuLy8gTm90ZTogc291cmNlLW1hcC1yZXNvbHZlLmpzIGlzIGdlbmVyYXRlZCBmcm9tIHNvdXJjZS1tYXAtcmVzb2x2ZS1ub2RlLmpzIGFuZFxuLy8gc291cmNlLW1hcC1yZXNvbHZlLXRlbXBsYXRlLmpzLiBPbmx5IGVkaXQgdGhlIHR3byBsYXR0ZXIgZmlsZXMsIF9ub3RfXG4vLyBzb3VyY2UtbWFwLXJlc29sdmUuanMhXG5cbnZvaWQgKGZ1bmN0aW9uKHJvb3QsIGZhY3RvcnkpIHtcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKFtcInNvdXJjZS1tYXAtdXJsXCIsIFwicmVzb2x2ZS11cmxcIl0sIGZhY3RvcnkpXG4gIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcbiAgICB2YXIgc291cmNlTWFwcGluZ1VSTCA9IHJlcXVpcmUoXCJzb3VyY2UtbWFwLXVybFwiKVxuICAgIHZhciByZXNvbHZlVXJsID0gcmVxdWlyZShcInJlc29sdmUtdXJsXCIpXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHNvdXJjZU1hcHBpbmdVUkwsIHJlc29sdmVVcmwpXG4gIH0gZWxzZSB7XG4gICAgcm9vdC5zb3VyY2VNYXBSZXNvbHZlID0gZmFjdG9yeShyb290LnNvdXJjZU1hcHBpbmdVUkwsIHJvb3QucmVzb2x2ZVVybClcbiAgfVxufSh0aGlzLCBmdW5jdGlvbihzb3VyY2VNYXBwaW5nVVJMLCByZXNvbHZlVXJsKSB7XG5cbiAgZnVuY3Rpb24gY2FsbGJhY2tBc3luYyhjYWxsYmFjaywgZXJyb3IsIHJlc3VsdCkge1xuICAgIHNldEltbWVkaWF0ZShmdW5jdGlvbigpIHsgY2FsbGJhY2soZXJyb3IsIHJlc3VsdCkgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHNpZyhuYW1lLCBjb2RlT3JNYXAsIHVybCwgcmVhZCwgY2FsbGJhY2spIHtcbiAgICB2YXIgdHlwZSA9IChuYW1lLmluZGV4T2YoXCJTb3VyY2VzXCIpID49IDAgPyBcIm1hcFwiIDogXCJjb2RlXCIpXG5cbiAgICB2YXIgdGhyb3dFcnJvciA9IGZ1bmN0aW9uKG51bSwgd2hhdCwgZ290KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIG5hbWUgKyBcIiByZXF1aXJlcyBhcmd1bWVudCBcIiArIG51bSArIFwiIHRvIGJlIFwiICsgd2hhdCArIFwiLiBHb3Q6XFxuXCIgKyBnb3RcbiAgICAgIClcbiAgICB9XG5cbiAgICBpZiAodHlwZSA9PT0gXCJtYXBcIikge1xuICAgICAgaWYgKHR5cGVvZiBjb2RlT3JNYXAgIT09IFwib2JqZWN0XCIgfHwgY29kZU9yTWFwID09PSBudWxsKSB7XG4gICAgICAgIHRocm93RXJyb3IoMSwgXCJhIHNvdXJjZSBtYXBcIiwgY29kZU9yTWFwKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHlwZW9mIGNvZGVPck1hcCAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvd0Vycm9yKDEsIFwic29tZSBjb2RlXCIsIGNvZGVPck1hcClcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHR5cGVvZiB1cmwgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHRocm93RXJyb3IoMiwgXCJ0aGUgXCIgKyB0eXBlICsgXCIgdXJsXCIsIHVybClcbiAgICB9XG4gICAgaWYgKHR5cGVvZiByZWFkICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHRocm93RXJyb3IoMywgXCJhIHJlYWRpbmcgZnVuY3Rpb25cIiwgcmVhZClcbiAgICB9XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEgKyA0ICYmIHR5cGVvZiBjYWxsYmFjayAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICB0aHJvd0Vycm9yKDQsIFwiYSBjYWxsYmFjayBmdW5jdGlvblwiLCBjYWxsYmFjaylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZU1hcFRvSlNPTihzdHJpbmcpIHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShzdHJpbmcucmVwbGFjZSgvXlxcKVxcXVxcfScvLCBcIlwiKSlcbiAgfVxuXG5cblxuICBmdW5jdGlvbiByZXNvbHZlU291cmNlTWFwKGNvZGUsIGNvZGVVcmwsIHJlYWQsIGNhbGxiYWNrKSB7XG4gICAgc2lnKFwicmVzb2x2ZVNvdXJjZU1hcFwiLCBjb2RlLCBjb2RlVXJsLCByZWFkLCBjYWxsYmFjaylcbiAgICB2YXIgbWFwRGF0YVxuICAgIHRyeSB7XG4gICAgICBtYXBEYXRhID0gcmVzb2x2ZVNvdXJjZU1hcEhlbHBlcihjb2RlLCBjb2RlVXJsKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2tBc3luYyhjYWxsYmFjaywgZXJyb3IpXG4gICAgfVxuICAgIGlmICghbWFwRGF0YSB8fCBtYXBEYXRhLm1hcCkge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrQXN5bmMoY2FsbGJhY2ssIG51bGwsIG1hcERhdGEpXG4gICAgfVxuICAgIHJlYWQobWFwRGF0YS51cmwsIGZ1bmN0aW9uKGVycm9yLCByZXN1bHQpIHtcbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3IpXG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBtYXBEYXRhLm1hcCA9IHBhcnNlTWFwVG9KU09OKFN0cmluZyhyZXN1bHQpKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9yKVxuICAgICAgfVxuICAgICAgY2FsbGJhY2sobnVsbCwgbWFwRGF0YSlcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZU1hcFN5bmMoY29kZSwgY29kZVVybCwgcmVhZCkge1xuICAgIHNpZyhcInJlc29sdmVTb3VyY2VNYXBTeW5jXCIsIGNvZGUsIGNvZGVVcmwsIHJlYWQpXG4gICAgdmFyIG1hcERhdGEgPSByZXNvbHZlU291cmNlTWFwSGVscGVyKGNvZGUsIGNvZGVVcmwpXG4gICAgaWYgKCFtYXBEYXRhIHx8IG1hcERhdGEubWFwKSB7XG4gICAgICByZXR1cm4gbWFwRGF0YVxuICAgIH1cbiAgICBtYXBEYXRhLm1hcCA9IHBhcnNlTWFwVG9KU09OKFN0cmluZyhyZWFkKG1hcERhdGEudXJsKSkpXG4gICAgcmV0dXJuIG1hcERhdGFcbiAgfVxuXG4gIHZhciBkYXRhVXJpUmVnZXggPSAvXmRhdGE6KFteLDtdKikoO1teLDtdKikqKD86LCguKikpPyQvXG4gIHZhciBqc29uTWltZVR5cGVSZWdleCA9IC9eKD86YXBwbGljYXRpb258dGV4dClcXC9qc29uJC9cblxuICBmdW5jdGlvbiByZXNvbHZlU291cmNlTWFwSGVscGVyKGNvZGUsIGNvZGVVcmwpIHtcbiAgICB2YXIgdXJsID0gc291cmNlTWFwcGluZ1VSTC5nZXQoY29kZSlcbiAgICBpZiAoIXVybCkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgZGF0YVVyaSA9IHVybC5tYXRjaChkYXRhVXJpUmVnZXgpXG4gICAgaWYgKGRhdGFVcmkpIHtcbiAgICAgIHZhciBtaW1lVHlwZSA9IGRhdGFVcmlbMV1cbiAgICAgIHZhciBsYXN0UGFyYW1ldGVyID0gZGF0YVVyaVsyXVxuICAgICAgdmFyIGVuY29kZWQgPSBkYXRhVXJpWzNdXG4gICAgICBpZiAoIWpzb25NaW1lVHlwZVJlZ2V4LnRlc3QobWltZVR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVudXNlZnVsIGRhdGEgdXJpIG1pbWUgdHlwZTogXCIgKyAobWltZVR5cGUgfHwgXCJ0ZXh0L3BsYWluXCIpKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc291cmNlTWFwcGluZ1VSTDogdXJsLFxuICAgICAgICB1cmw6IG51bGwsXG4gICAgICAgIHNvdXJjZXNSZWxhdGl2ZVRvOiBjb2RlVXJsLFxuICAgICAgICBtYXA6IHBhcnNlTWFwVG9KU09OKGxhc3RQYXJhbWV0ZXIgPT09IFwiO2Jhc2U2NFwiID8gYXRvYihlbmNvZGVkKSA6IGRlY29kZVVSSUNvbXBvbmVudChlbmNvZGVkKSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbWFwVXJsID0gcmVzb2x2ZVVybChjb2RlVXJsLCB1cmwpXG4gICAgcmV0dXJuIHtcbiAgICAgIHNvdXJjZU1hcHBpbmdVUkw6IHVybCxcbiAgICAgIHVybDogbWFwVXJsLFxuICAgICAgc291cmNlc1JlbGF0aXZlVG86IG1hcFVybCxcbiAgICAgIG1hcDogbnVsbFxuICAgIH1cbiAgfVxuXG5cblxuICBmdW5jdGlvbiByZXNvbHZlU291cmNlcyhtYXAsIG1hcFVybCwgcmVhZCwgY2FsbGJhY2spIHtcbiAgICBzaWcoXCJyZXNvbHZlU291cmNlc1wiLCBtYXAsIG1hcFVybCwgcmVhZCwgY2FsbGJhY2spXG4gICAgdmFyIHBlbmRpbmcgPSBtYXAuc291cmNlcy5sZW5ndGhcbiAgICB2YXIgZXJyb3JlZCA9IGZhbHNlXG4gICAgdmFyIHNvdXJjZXMgPSBbXVxuXG4gICAgdmFyIGRvbmUgPSBmdW5jdGlvbihlcnJvcikge1xuICAgICAgaWYgKGVycm9yZWQpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgZXJyb3JlZCA9IHRydWVcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9yKVxuICAgICAgfVxuICAgICAgcGVuZGluZy0tXG4gICAgICBpZiAocGVuZGluZyA9PT0gMCkge1xuICAgICAgICBjYWxsYmFjayhudWxsLCBzb3VyY2VzKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJlc29sdmVTb3VyY2VzSGVscGVyKG1hcCwgbWFwVXJsLCBmdW5jdGlvbihmdWxsVXJsLCBzb3VyY2VDb250ZW50LCBpbmRleCkge1xuICAgICAgaWYgKHR5cGVvZiBzb3VyY2VDb250ZW50ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHNvdXJjZXNbaW5kZXhdID0gc291cmNlQ29udGVudFxuICAgICAgICBjYWxsYmFja0FzeW5jKGRvbmUsIG51bGwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWFkKGZ1bGxVcmwsIGZ1bmN0aW9uKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICBzb3VyY2VzW2luZGV4XSA9IFN0cmluZyhyZXN1bHQpXG4gICAgICAgICAgZG9uZShlcnJvcilcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZXNTeW5jKG1hcCwgbWFwVXJsLCByZWFkKSB7XG4gICAgc2lnKFwicmVzb2x2ZVNvdXJjZXNTeW5jXCIsIG1hcCwgbWFwVXJsLCByZWFkKVxuICAgIHZhciBzb3VyY2VzID0gW11cbiAgICByZXNvbHZlU291cmNlc0hlbHBlcihtYXAsIG1hcFVybCwgZnVuY3Rpb24oZnVsbFVybCwgc291cmNlQ29udGVudCwgaW5kZXgpIHtcbiAgICAgIGlmICh0eXBlb2Ygc291cmNlQ29udGVudCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBzb3VyY2VzW2luZGV4XSA9IHNvdXJjZUNvbnRlbnRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNvdXJjZXNbaW5kZXhdID0gU3RyaW5nKHJlYWQoZnVsbFVybCkpXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gc291cmNlc1xuICB9XG5cbiAgdmFyIGVuZGluZ1NsYXNoID0gL1xcLz8kL1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VzSGVscGVyKG1hcCwgbWFwVXJsLCBmbikge1xuICAgIHZhciBmdWxsVXJsXG4gICAgdmFyIHNvdXJjZUNvbnRlbnRcbiAgICBmb3IgKHZhciBpbmRleCA9IDAsIGxlbiA9IG1hcC5zb3VyY2VzLmxlbmd0aDsgaW5kZXggPCBsZW47IGluZGV4KyspIHtcbiAgICAgIGlmIChtYXAuc291cmNlUm9vdCkge1xuICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB0aGUgc291cmNlUm9vdCBlbmRzIHdpdGggYSBzbGFzaCwgc28gdGhhdCBgL3NjcmlwdHMvc3ViZGlyYCBiZWNvbWVzXG4gICAgICAgIC8vIGAvc2NyaXB0cy9zdWJkaXIvPHNvdXJjZT5gLCBub3QgYC9zY3JpcHRzLzxzb3VyY2U+YC4gUG9pbnRpbmcgdG8gYSBmaWxlIGFzIHNvdXJjZSByb290XG4gICAgICAgIC8vIGRvZXMgbm90IG1ha2Ugc2Vuc2UuXG4gICAgICAgIGZ1bGxVcmwgPSByZXNvbHZlVXJsKG1hcFVybCwgbWFwLnNvdXJjZVJvb3QucmVwbGFjZShlbmRpbmdTbGFzaCwgXCIvXCIpLCBtYXAuc291cmNlc1tpbmRleF0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmdWxsVXJsID0gcmVzb2x2ZVVybChtYXBVcmwsIG1hcC5zb3VyY2VzW2luZGV4XSlcbiAgICAgIH1cbiAgICAgIHNvdXJjZUNvbnRlbnQgPSAobWFwLnNvdXJjZUNvbnRlbnRzIHx8IFtdKVtpbmRleF1cbiAgICAgIGZuKGZ1bGxVcmwsIHNvdXJjZUNvbnRlbnQsIGluZGV4KVxuICAgIH1cbiAgfVxuXG5cblxuICBmdW5jdGlvbiByZXNvbHZlKGNvZGUsIGNvZGVVcmwsIHJlYWQsIGNhbGxiYWNrKSB7XG4gICAgc2lnKFwicmVzb2x2ZVwiLCBjb2RlLCBjb2RlVXJsLCByZWFkLCBjYWxsYmFjaylcbiAgICByZXNvbHZlU291cmNlTWFwKGNvZGUsIGNvZGVVcmwsIHJlYWQsIGZ1bmN0aW9uKGVycm9yLCBtYXBEYXRhKSB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9yKVxuICAgICAgfVxuICAgICAgaWYgKCFtYXBEYXRhKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCBudWxsKVxuICAgICAgfVxuICAgICAgcmVzb2x2ZVNvdXJjZXMobWFwRGF0YS5tYXAsIG1hcERhdGEuc291cmNlc1JlbGF0aXZlVG8sIHJlYWQsIGZ1bmN0aW9uKGVycm9yLCBzb3VyY2VzKSB7XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcilcbiAgICAgICAgfVxuICAgICAgICBtYXBEYXRhLnNvdXJjZXMgPSBzb3VyY2VzXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIG1hcERhdGEpXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNvbHZlU3luYyhjb2RlLCBjb2RlVXJsLCByZWFkKSB7XG4gICAgc2lnKFwicmVzb2x2ZVN5bmNcIiwgY29kZSwgY29kZVVybCwgcmVhZClcbiAgICB2YXIgbWFwRGF0YSA9IHJlc29sdmVTb3VyY2VNYXBTeW5jKGNvZGUsIGNvZGVVcmwsIHJlYWQpXG4gICAgaWYgKCFtYXBEYXRhKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgICBtYXBEYXRhLnNvdXJjZXMgPSByZXNvbHZlU291cmNlc1N5bmMobWFwRGF0YS5tYXAsIG1hcERhdGEuc291cmNlc1JlbGF0aXZlVG8sIHJlYWQpXG4gICAgcmV0dXJuIG1hcERhdGFcbiAgfVxuXG5cblxuICByZXR1cm4ge1xuICAgIHJlc29sdmVTb3VyY2VNYXA6ICAgICByZXNvbHZlU291cmNlTWFwLFxuICAgIHJlc29sdmVTb3VyY2VNYXBTeW5jOiByZXNvbHZlU291cmNlTWFwU3luYyxcbiAgICByZXNvbHZlU291cmNlczogICAgICAgcmVzb2x2ZVNvdXJjZXMsXG4gICAgcmVzb2x2ZVNvdXJjZXNTeW5jOiAgIHJlc29sdmVTb3VyY2VzU3luYyxcbiAgICByZXNvbHZlOiAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICByZXNvbHZlU3luYzogICAgICAgICAgcmVzb2x2ZVN5bmNcbiAgfVxuXG59KSk7XG4iLCIvKlxuICogQ29weXJpZ2h0IDIwMDktMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0UudHh0IG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5leHBvcnRzLlNvdXJjZU1hcEdlbmVyYXRvciA9IHJlcXVpcmUoJy4vc291cmNlLW1hcC9zb3VyY2UtbWFwLWdlbmVyYXRvcicpLlNvdXJjZU1hcEdlbmVyYXRvcjtcbmV4cG9ydHMuU291cmNlTWFwQ29uc3VtZXIgPSByZXF1aXJlKCcuL3NvdXJjZS1tYXAvc291cmNlLW1hcC1jb25zdW1lcicpLlNvdXJjZU1hcENvbnN1bWVyO1xuZXhwb3J0cy5Tb3VyY2VOb2RlID0gcmVxdWlyZSgnLi9zb3VyY2UtbWFwL3NvdXJjZS1ub2RlJykuU291cmNlTm9kZTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcblxuICAvKipcbiAgICogQSBkYXRhIHN0cnVjdHVyZSB3aGljaCBpcyBhIGNvbWJpbmF0aW9uIG9mIGFuIGFycmF5IGFuZCBhIHNldC4gQWRkaW5nIGEgbmV3XG4gICAqIG1lbWJlciBpcyBPKDEpLCB0ZXN0aW5nIGZvciBtZW1iZXJzaGlwIGlzIE8oMSksIGFuZCBmaW5kaW5nIHRoZSBpbmRleCBvZiBhblxuICAgKiBlbGVtZW50IGlzIE8oMSkuIFJlbW92aW5nIGVsZW1lbnRzIGZyb20gdGhlIHNldCBpcyBub3Qgc3VwcG9ydGVkLiBPbmx5XG4gICAqIHN0cmluZ3MgYXJlIHN1cHBvcnRlZCBmb3IgbWVtYmVyc2hpcC5cbiAgICovXG4gIGZ1bmN0aW9uIEFycmF5U2V0KCkge1xuICAgIHRoaXMuX2FycmF5ID0gW107XG4gICAgdGhpcy5fc2V0ID0ge307XG4gIH1cblxuICAvKipcbiAgICogU3RhdGljIG1ldGhvZCBmb3IgY3JlYXRpbmcgQXJyYXlTZXQgaW5zdGFuY2VzIGZyb20gYW4gZXhpc3RpbmcgYXJyYXkuXG4gICAqL1xuICBBcnJheVNldC5mcm9tQXJyYXkgPSBmdW5jdGlvbiBBcnJheVNldF9mcm9tQXJyYXkoYUFycmF5LCBhQWxsb3dEdXBsaWNhdGVzKSB7XG4gICAgdmFyIHNldCA9IG5ldyBBcnJheVNldCgpO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBhQXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHNldC5hZGQoYUFycmF5W2ldLCBhQWxsb3dEdXBsaWNhdGVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHNldDtcbiAgfTtcblxuICAvKipcbiAgICogQWRkIHRoZSBnaXZlbiBzdHJpbmcgdG8gdGhpcyBzZXQuXG4gICAqXG4gICAqIEBwYXJhbSBTdHJpbmcgYVN0clxuICAgKi9cbiAgQXJyYXlTZXQucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIEFycmF5U2V0X2FkZChhU3RyLCBhQWxsb3dEdXBsaWNhdGVzKSB7XG4gICAgdmFyIGlzRHVwbGljYXRlID0gdGhpcy5oYXMoYVN0cik7XG4gICAgdmFyIGlkeCA9IHRoaXMuX2FycmF5Lmxlbmd0aDtcbiAgICBpZiAoIWlzRHVwbGljYXRlIHx8IGFBbGxvd0R1cGxpY2F0ZXMpIHtcbiAgICAgIHRoaXMuX2FycmF5LnB1c2goYVN0cik7XG4gICAgfVxuICAgIGlmICghaXNEdXBsaWNhdGUpIHtcbiAgICAgIHRoaXMuX3NldFt1dGlsLnRvU2V0U3RyaW5nKGFTdHIpXSA9IGlkeDtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIElzIHRoZSBnaXZlbiBzdHJpbmcgYSBtZW1iZXIgb2YgdGhpcyBzZXQ/XG4gICAqXG4gICAqIEBwYXJhbSBTdHJpbmcgYVN0clxuICAgKi9cbiAgQXJyYXlTZXQucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uIEFycmF5U2V0X2hhcyhhU3RyKSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLl9zZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dGlsLnRvU2V0U3RyaW5nKGFTdHIpKTtcbiAgfTtcblxuICAvKipcbiAgICogV2hhdCBpcyB0aGUgaW5kZXggb2YgdGhlIGdpdmVuIHN0cmluZyBpbiB0aGUgYXJyYXk/XG4gICAqXG4gICAqIEBwYXJhbSBTdHJpbmcgYVN0clxuICAgKi9cbiAgQXJyYXlTZXQucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiBBcnJheVNldF9pbmRleE9mKGFTdHIpIHtcbiAgICBpZiAodGhpcy5oYXMoYVN0cikpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zZXRbdXRpbC50b1NldFN0cmluZyhhU3RyKV07XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignXCInICsgYVN0ciArICdcIiBpcyBub3QgaW4gdGhlIHNldC4nKTtcbiAgfTtcblxuICAvKipcbiAgICogV2hhdCBpcyB0aGUgZWxlbWVudCBhdCB0aGUgZ2l2ZW4gaW5kZXg/XG4gICAqXG4gICAqIEBwYXJhbSBOdW1iZXIgYUlkeFxuICAgKi9cbiAgQXJyYXlTZXQucHJvdG90eXBlLmF0ID0gZnVuY3Rpb24gQXJyYXlTZXRfYXQoYUlkeCkge1xuICAgIGlmIChhSWR4ID49IDAgJiYgYUlkeCA8IHRoaXMuX2FycmF5Lmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHRoaXMuX2FycmF5W2FJZHhdO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGVsZW1lbnQgaW5kZXhlZCBieSAnICsgYUlkeCk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGFycmF5IHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgc2V0ICh3aGljaCBoYXMgdGhlIHByb3BlciBpbmRpY2VzXG4gICAqIGluZGljYXRlZCBieSBpbmRleE9mKS4gTm90ZSB0aGF0IHRoaXMgaXMgYSBjb3B5IG9mIHRoZSBpbnRlcm5hbCBhcnJheSB1c2VkXG4gICAqIGZvciBzdG9yaW5nIHRoZSBtZW1iZXJzIHNvIHRoYXQgbm8gb25lIGNhbiBtZXNzIHdpdGggaW50ZXJuYWwgc3RhdGUuXG4gICAqL1xuICBBcnJheVNldC5wcm90b3R5cGUudG9BcnJheSA9IGZ1bmN0aW9uIEFycmF5U2V0X3RvQXJyYXkoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FycmF5LnNsaWNlKCk7XG4gIH07XG5cbiAgZXhwb3J0cy5BcnJheVNldCA9IEFycmF5U2V0O1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKlxuICogQmFzZWQgb24gdGhlIEJhc2UgNjQgVkxRIGltcGxlbWVudGF0aW9uIGluIENsb3N1cmUgQ29tcGlsZXI6XG4gKiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nsb3N1cmUtY29tcGlsZXIvc291cmNlL2Jyb3dzZS90cnVuay9zcmMvY29tL2dvb2dsZS9kZWJ1Z2dpbmcvc291cmNlbWFwL0Jhc2U2NFZMUS5qYXZhXG4gKlxuICogQ29weXJpZ2h0IDIwMTEgVGhlIENsb3N1cmUgQ29tcGlsZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZVxuICogbWV0OlxuICpcbiAqICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlXG4gKiAgICBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZ1xuICogICAgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkXG4gKiAgICB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEdvb2dsZSBJbmMuIG5vciB0aGUgbmFtZXMgb2YgaXRzXG4gKiAgICBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzIGRlcml2ZWRcbiAqICAgIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTXG4gKiBcIkFTIElTXCIgQU5EIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UXG4gKiBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1JcbiAqIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUXG4gKiBPV05FUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUiBBTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCxcbiAqIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIChJTkNMVURJTkcsIEJVVCBOT1RcbiAqIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7IExPU1MgT0YgVVNFLFxuICogREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT04gQU5ZXG4gKiBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0VcbiAqIE9GIFRISVMgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIGJhc2U2NCA9IHJlcXVpcmUoJy4vYmFzZTY0Jyk7XG5cbiAgLy8gQSBzaW5nbGUgYmFzZSA2NCBkaWdpdCBjYW4gY29udGFpbiA2IGJpdHMgb2YgZGF0YS4gRm9yIHRoZSBiYXNlIDY0IHZhcmlhYmxlXG4gIC8vIGxlbmd0aCBxdWFudGl0aWVzIHdlIHVzZSBpbiB0aGUgc291cmNlIG1hcCBzcGVjLCB0aGUgZmlyc3QgYml0IGlzIHRoZSBzaWduLFxuICAvLyB0aGUgbmV4dCBmb3VyIGJpdHMgYXJlIHRoZSBhY3R1YWwgdmFsdWUsIGFuZCB0aGUgNnRoIGJpdCBpcyB0aGVcbiAgLy8gY29udGludWF0aW9uIGJpdC4gVGhlIGNvbnRpbnVhdGlvbiBiaXQgdGVsbHMgdXMgd2hldGhlciB0aGVyZSBhcmUgbW9yZVxuICAvLyBkaWdpdHMgaW4gdGhpcyB2YWx1ZSBmb2xsb3dpbmcgdGhpcyBkaWdpdC5cbiAgLy9cbiAgLy8gICBDb250aW51YXRpb25cbiAgLy8gICB8ICAgIFNpZ25cbiAgLy8gICB8ICAgIHxcbiAgLy8gICBWICAgIFZcbiAgLy8gICAxMDEwMTFcblxuICB2YXIgVkxRX0JBU0VfU0hJRlQgPSA1O1xuXG4gIC8vIGJpbmFyeTogMTAwMDAwXG4gIHZhciBWTFFfQkFTRSA9IDEgPDwgVkxRX0JBU0VfU0hJRlQ7XG5cbiAgLy8gYmluYXJ5OiAwMTExMTFcbiAgdmFyIFZMUV9CQVNFX01BU0sgPSBWTFFfQkFTRSAtIDE7XG5cbiAgLy8gYmluYXJ5OiAxMDAwMDBcbiAgdmFyIFZMUV9DT05USU5VQVRJT05fQklUID0gVkxRX0JBU0U7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGZyb20gYSB0d28tY29tcGxlbWVudCB2YWx1ZSB0byBhIHZhbHVlIHdoZXJlIHRoZSBzaWduIGJpdCBpc1xuICAgKiBpcyBwbGFjZWQgaW4gdGhlIGxlYXN0IHNpZ25pZmljYW50IGJpdC4gIEZvciBleGFtcGxlLCBhcyBkZWNpbWFsczpcbiAgICogICAxIGJlY29tZXMgMiAoMTAgYmluYXJ5KSwgLTEgYmVjb21lcyAzICgxMSBiaW5hcnkpXG4gICAqICAgMiBiZWNvbWVzIDQgKDEwMCBiaW5hcnkpLCAtMiBiZWNvbWVzIDUgKDEwMSBiaW5hcnkpXG4gICAqL1xuICBmdW5jdGlvbiB0b1ZMUVNpZ25lZChhVmFsdWUpIHtcbiAgICByZXR1cm4gYVZhbHVlIDwgMFxuICAgICAgPyAoKC1hVmFsdWUpIDw8IDEpICsgMVxuICAgICAgOiAoYVZhbHVlIDw8IDEpICsgMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyB0byBhIHR3by1jb21wbGVtZW50IHZhbHVlIGZyb20gYSB2YWx1ZSB3aGVyZSB0aGUgc2lnbiBiaXQgaXNcbiAgICogaXMgcGxhY2VkIGluIHRoZSBsZWFzdCBzaWduaWZpY2FudCBiaXQuICBGb3IgZXhhbXBsZSwgYXMgZGVjaW1hbHM6XG4gICAqICAgMiAoMTAgYmluYXJ5KSBiZWNvbWVzIDEsIDMgKDExIGJpbmFyeSkgYmVjb21lcyAtMVxuICAgKiAgIDQgKDEwMCBiaW5hcnkpIGJlY29tZXMgMiwgNSAoMTAxIGJpbmFyeSkgYmVjb21lcyAtMlxuICAgKi9cbiAgZnVuY3Rpb24gZnJvbVZMUVNpZ25lZChhVmFsdWUpIHtcbiAgICB2YXIgaXNOZWdhdGl2ZSA9IChhVmFsdWUgJiAxKSA9PT0gMTtcbiAgICB2YXIgc2hpZnRlZCA9IGFWYWx1ZSA+PiAxO1xuICAgIHJldHVybiBpc05lZ2F0aXZlXG4gICAgICA/IC1zaGlmdGVkXG4gICAgICA6IHNoaWZ0ZWQ7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgYmFzZSA2NCBWTFEgZW5jb2RlZCB2YWx1ZS5cbiAgICovXG4gIGV4cG9ydHMuZW5jb2RlID0gZnVuY3Rpb24gYmFzZTY0VkxRX2VuY29kZShhVmFsdWUpIHtcbiAgICB2YXIgZW5jb2RlZCA9IFwiXCI7XG4gICAgdmFyIGRpZ2l0O1xuXG4gICAgdmFyIHZscSA9IHRvVkxRU2lnbmVkKGFWYWx1ZSk7XG5cbiAgICBkbyB7XG4gICAgICBkaWdpdCA9IHZscSAmIFZMUV9CQVNFX01BU0s7XG4gICAgICB2bHEgPj4+PSBWTFFfQkFTRV9TSElGVDtcbiAgICAgIGlmICh2bHEgPiAwKSB7XG4gICAgICAgIC8vIFRoZXJlIGFyZSBzdGlsbCBtb3JlIGRpZ2l0cyBpbiB0aGlzIHZhbHVlLCBzbyB3ZSBtdXN0IG1ha2Ugc3VyZSB0aGVcbiAgICAgICAgLy8gY29udGludWF0aW9uIGJpdCBpcyBtYXJrZWQuXG4gICAgICAgIGRpZ2l0IHw9IFZMUV9DT05USU5VQVRJT05fQklUO1xuICAgICAgfVxuICAgICAgZW5jb2RlZCArPSBiYXNlNjQuZW5jb2RlKGRpZ2l0KTtcbiAgICB9IHdoaWxlICh2bHEgPiAwKTtcblxuICAgIHJldHVybiBlbmNvZGVkO1xuICB9O1xuXG4gIC8qKlxuICAgKiBEZWNvZGVzIHRoZSBuZXh0IGJhc2UgNjQgVkxRIHZhbHVlIGZyb20gdGhlIGdpdmVuIHN0cmluZyBhbmQgcmV0dXJucyB0aGVcbiAgICogdmFsdWUgYW5kIHRoZSByZXN0IG9mIHRoZSBzdHJpbmcuXG4gICAqL1xuICBleHBvcnRzLmRlY29kZSA9IGZ1bmN0aW9uIGJhc2U2NFZMUV9kZWNvZGUoYVN0cikge1xuICAgIHZhciBpID0gMDtcbiAgICB2YXIgc3RyTGVuID0gYVN0ci5sZW5ndGg7XG4gICAgdmFyIHJlc3VsdCA9IDA7XG4gICAgdmFyIHNoaWZ0ID0gMDtcbiAgICB2YXIgY29udGludWF0aW9uLCBkaWdpdDtcblxuICAgIGRvIHtcbiAgICAgIGlmIChpID49IHN0ckxlbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBtb3JlIGRpZ2l0cyBpbiBiYXNlIDY0IFZMUSB2YWx1ZS5cIik7XG4gICAgICB9XG4gICAgICBkaWdpdCA9IGJhc2U2NC5kZWNvZGUoYVN0ci5jaGFyQXQoaSsrKSk7XG4gICAgICBjb250aW51YXRpb24gPSAhIShkaWdpdCAmIFZMUV9DT05USU5VQVRJT05fQklUKTtcbiAgICAgIGRpZ2l0ICY9IFZMUV9CQVNFX01BU0s7XG4gICAgICByZXN1bHQgPSByZXN1bHQgKyAoZGlnaXQgPDwgc2hpZnQpO1xuICAgICAgc2hpZnQgKz0gVkxRX0JBU0VfU0hJRlQ7XG4gICAgfSB3aGlsZSAoY29udGludWF0aW9uKTtcblxuICAgIHJldHVybiB7XG4gICAgICB2YWx1ZTogZnJvbVZMUVNpZ25lZChyZXN1bHQpLFxuICAgICAgcmVzdDogYVN0ci5zbGljZShpKVxuICAgIH07XG4gIH07XG5cbn0pO1xuIiwiLyogLSotIE1vZGU6IGpzOyBqcy1pbmRlbnQtbGV2ZWw6IDI7IC0qLSAqL1xuLypcbiAqIENvcHlyaWdodCAyMDExIE1vemlsbGEgRm91bmRhdGlvbiBhbmQgY29udHJpYnV0b3JzXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTmV3IEJTRCBsaWNlbnNlLiBTZWUgTElDRU5TRSBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuaWYgKHR5cGVvZiBkZWZpbmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgZGVmaW5lID0gcmVxdWlyZSgnYW1kZWZpbmUnKShtb2R1bGUsIHJlcXVpcmUpO1xufVxuZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblxuICB2YXIgY2hhclRvSW50TWFwID0ge307XG4gIHZhciBpbnRUb0NoYXJNYXAgPSB7fTtcblxuICAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLydcbiAgICAuc3BsaXQoJycpXG4gICAgLmZvckVhY2goZnVuY3Rpb24gKGNoLCBpbmRleCkge1xuICAgICAgY2hhclRvSW50TWFwW2NoXSA9IGluZGV4O1xuICAgICAgaW50VG9DaGFyTWFwW2luZGV4XSA9IGNoO1xuICAgIH0pO1xuXG4gIC8qKlxuICAgKiBFbmNvZGUgYW4gaW50ZWdlciBpbiB0aGUgcmFuZ2Ugb2YgMCB0byA2MyB0byBhIHNpbmdsZSBiYXNlIDY0IGRpZ2l0LlxuICAgKi9cbiAgZXhwb3J0cy5lbmNvZGUgPSBmdW5jdGlvbiBiYXNlNjRfZW5jb2RlKGFOdW1iZXIpIHtcbiAgICBpZiAoYU51bWJlciBpbiBpbnRUb0NoYXJNYXApIHtcbiAgICAgIHJldHVybiBpbnRUb0NoYXJNYXBbYU51bWJlcl07XG4gICAgfVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IGJlIGJldHdlZW4gMCBhbmQgNjM6IFwiICsgYU51bWJlcik7XG4gIH07XG5cbiAgLyoqXG4gICAqIERlY29kZSBhIHNpbmdsZSBiYXNlIDY0IGRpZ2l0IHRvIGFuIGludGVnZXIuXG4gICAqL1xuICBleHBvcnRzLmRlY29kZSA9IGZ1bmN0aW9uIGJhc2U2NF9kZWNvZGUoYUNoYXIpIHtcbiAgICBpZiAoYUNoYXIgaW4gY2hhclRvSW50TWFwKSB7XG4gICAgICByZXR1cm4gY2hhclRvSW50TWFwW2FDaGFyXTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk5vdCBhIHZhbGlkIGJhc2UgNjQgZGlnaXQ6IFwiICsgYUNoYXIpO1xuICB9O1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgLyoqXG4gICAqIFJlY3Vyc2l2ZSBpbXBsZW1lbnRhdGlvbiBvZiBiaW5hcnkgc2VhcmNoLlxuICAgKlxuICAgKiBAcGFyYW0gYUxvdyBJbmRpY2VzIGhlcmUgYW5kIGxvd2VyIGRvIG5vdCBjb250YWluIHRoZSBuZWVkbGUuXG4gICAqIEBwYXJhbSBhSGlnaCBJbmRpY2VzIGhlcmUgYW5kIGhpZ2hlciBkbyBub3QgY29udGFpbiB0aGUgbmVlZGxlLlxuICAgKiBAcGFyYW0gYU5lZWRsZSBUaGUgZWxlbWVudCBiZWluZyBzZWFyY2hlZCBmb3IuXG4gICAqIEBwYXJhbSBhSGF5c3RhY2sgVGhlIG5vbi1lbXB0eSBhcnJheSBiZWluZyBzZWFyY2hlZC5cbiAgICogQHBhcmFtIGFDb21wYXJlIEZ1bmN0aW9uIHdoaWNoIHRha2VzIHR3byBlbGVtZW50cyBhbmQgcmV0dXJucyAtMSwgMCwgb3IgMS5cbiAgICovXG4gIGZ1bmN0aW9uIHJlY3Vyc2l2ZVNlYXJjaChhTG93LCBhSGlnaCwgYU5lZWRsZSwgYUhheXN0YWNrLCBhQ29tcGFyZSkge1xuICAgIC8vIFRoaXMgZnVuY3Rpb24gdGVybWluYXRlcyB3aGVuIG9uZSBvZiB0aGUgZm9sbG93aW5nIGlzIHRydWU6XG4gICAgLy9cbiAgICAvLyAgIDEuIFdlIGZpbmQgdGhlIGV4YWN0IGVsZW1lbnQgd2UgYXJlIGxvb2tpbmcgZm9yLlxuICAgIC8vXG4gICAgLy8gICAyLiBXZSBkaWQgbm90IGZpbmQgdGhlIGV4YWN0IGVsZW1lbnQsIGJ1dCB3ZSBjYW4gcmV0dXJuIHRoZSBuZXh0XG4gICAgLy8gICAgICBjbG9zZXN0IGVsZW1lbnQgdGhhdCBpcyBsZXNzIHRoYW4gdGhhdCBlbGVtZW50LlxuICAgIC8vXG4gICAgLy8gICAzLiBXZSBkaWQgbm90IGZpbmQgdGhlIGV4YWN0IGVsZW1lbnQsIGFuZCB0aGVyZSBpcyBubyBuZXh0LWNsb3Nlc3RcbiAgICAvLyAgICAgIGVsZW1lbnQgd2hpY2ggaXMgbGVzcyB0aGFuIHRoZSBvbmUgd2UgYXJlIHNlYXJjaGluZyBmb3IsIHNvIHdlXG4gICAgLy8gICAgICByZXR1cm4gbnVsbC5cbiAgICB2YXIgbWlkID0gTWF0aC5mbG9vcigoYUhpZ2ggLSBhTG93KSAvIDIpICsgYUxvdztcbiAgICB2YXIgY21wID0gYUNvbXBhcmUoYU5lZWRsZSwgYUhheXN0YWNrW21pZF0sIHRydWUpO1xuICAgIGlmIChjbXAgPT09IDApIHtcbiAgICAgIC8vIEZvdW5kIHRoZSBlbGVtZW50IHdlIGFyZSBsb29raW5nIGZvci5cbiAgICAgIHJldHVybiBhSGF5c3RhY2tbbWlkXTtcbiAgICB9XG4gICAgZWxzZSBpZiAoY21wID4gMCkge1xuICAgICAgLy8gYUhheXN0YWNrW21pZF0gaXMgZ3JlYXRlciB0aGFuIG91ciBuZWVkbGUuXG4gICAgICBpZiAoYUhpZ2ggLSBtaWQgPiAxKSB7XG4gICAgICAgIC8vIFRoZSBlbGVtZW50IGlzIGluIHRoZSB1cHBlciBoYWxmLlxuICAgICAgICByZXR1cm4gcmVjdXJzaXZlU2VhcmNoKG1pZCwgYUhpZ2gsIGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpO1xuICAgICAgfVxuICAgICAgLy8gV2UgZGlkIG5vdCBmaW5kIGFuIGV4YWN0IG1hdGNoLCByZXR1cm4gdGhlIG5leHQgY2xvc2VzdCBvbmVcbiAgICAgIC8vICh0ZXJtaW5hdGlvbiBjYXNlIDIpLlxuICAgICAgcmV0dXJuIGFIYXlzdGFja1ttaWRdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIC8vIGFIYXlzdGFja1ttaWRdIGlzIGxlc3MgdGhhbiBvdXIgbmVlZGxlLlxuICAgICAgaWYgKG1pZCAtIGFMb3cgPiAxKSB7XG4gICAgICAgIC8vIFRoZSBlbGVtZW50IGlzIGluIHRoZSBsb3dlciBoYWxmLlxuICAgICAgICByZXR1cm4gcmVjdXJzaXZlU2VhcmNoKGFMb3csIG1pZCwgYU5lZWRsZSwgYUhheXN0YWNrLCBhQ29tcGFyZSk7XG4gICAgICB9XG4gICAgICAvLyBUaGUgZXhhY3QgbmVlZGxlIGVsZW1lbnQgd2FzIG5vdCBmb3VuZCBpbiB0aGlzIGhheXN0YWNrLiBEZXRlcm1pbmUgaWZcbiAgICAgIC8vIHdlIGFyZSBpbiB0ZXJtaW5hdGlvbiBjYXNlICgyKSBvciAoMykgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgdGhpbmcuXG4gICAgICByZXR1cm4gYUxvdyA8IDBcbiAgICAgICAgPyBudWxsXG4gICAgICAgIDogYUhheXN0YWNrW2FMb3ddO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGlzIGFuIGltcGxlbWVudGF0aW9uIG9mIGJpbmFyeSBzZWFyY2ggd2hpY2ggd2lsbCBhbHdheXMgdHJ5IGFuZCByZXR1cm5cbiAgICogdGhlIG5leHQgbG93ZXN0IHZhbHVlIGNoZWNrZWQgaWYgdGhlcmUgaXMgbm8gZXhhY3QgaGl0LiBUaGlzIGlzIGJlY2F1c2VcbiAgICogbWFwcGluZ3MgYmV0d2VlbiBvcmlnaW5hbCBhbmQgZ2VuZXJhdGVkIGxpbmUvY29sIHBhaXJzIGFyZSBzaW5nbGUgcG9pbnRzLFxuICAgKiBhbmQgdGhlcmUgaXMgYW4gaW1wbGljaXQgcmVnaW9uIGJldHdlZW4gZWFjaCBvZiB0aGVtLCBzbyBhIG1pc3MganVzdCBtZWFuc1xuICAgKiB0aGF0IHlvdSBhcmVuJ3Qgb24gdGhlIHZlcnkgc3RhcnQgb2YgYSByZWdpb24uXG4gICAqXG4gICAqIEBwYXJhbSBhTmVlZGxlIFRoZSBlbGVtZW50IHlvdSBhcmUgbG9va2luZyBmb3IuXG4gICAqIEBwYXJhbSBhSGF5c3RhY2sgVGhlIGFycmF5IHRoYXQgaXMgYmVpbmcgc2VhcmNoZWQuXG4gICAqIEBwYXJhbSBhQ29tcGFyZSBBIGZ1bmN0aW9uIHdoaWNoIHRha2VzIHRoZSBuZWVkbGUgYW5kIGFuIGVsZW1lbnQgaW4gdGhlXG4gICAqICAgICBhcnJheSBhbmQgcmV0dXJucyAtMSwgMCwgb3IgMSBkZXBlbmRpbmcgb24gd2hldGhlciB0aGUgbmVlZGxlIGlzIGxlc3NcbiAgICogICAgIHRoYW4sIGVxdWFsIHRvLCBvciBncmVhdGVyIHRoYW4gdGhlIGVsZW1lbnQsIHJlc3BlY3RpdmVseS5cbiAgICovXG4gIGV4cG9ydHMuc2VhcmNoID0gZnVuY3Rpb24gc2VhcmNoKGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpIHtcbiAgICByZXR1cm4gYUhheXN0YWNrLmxlbmd0aCA+IDBcbiAgICAgID8gcmVjdXJzaXZlU2VhcmNoKC0xLCBhSGF5c3RhY2subGVuZ3RoLCBhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKVxuICAgICAgOiBudWxsO1xuICB9O1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbiAgdmFyIGJpbmFyeVNlYXJjaCA9IHJlcXVpcmUoJy4vYmluYXJ5LXNlYXJjaCcpO1xuICB2YXIgQXJyYXlTZXQgPSByZXF1aXJlKCcuL2FycmF5LXNldCcpLkFycmF5U2V0O1xuICB2YXIgYmFzZTY0VkxRID0gcmVxdWlyZSgnLi9iYXNlNjQtdmxxJyk7XG5cbiAgLyoqXG4gICAqIEEgU291cmNlTWFwQ29uc3VtZXIgaW5zdGFuY2UgcmVwcmVzZW50cyBhIHBhcnNlZCBzb3VyY2UgbWFwIHdoaWNoIHdlIGNhblxuICAgKiBxdWVyeSBmb3IgaW5mb3JtYXRpb24gYWJvdXQgdGhlIG9yaWdpbmFsIGZpbGUgcG9zaXRpb25zIGJ5IGdpdmluZyBpdCBhIGZpbGVcbiAgICogcG9zaXRpb24gaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UuXG4gICAqXG4gICAqIFRoZSBvbmx5IHBhcmFtZXRlciBpcyB0aGUgcmF3IHNvdXJjZSBtYXAgKGVpdGhlciBhcyBhIEpTT04gc3RyaW5nLCBvclxuICAgKiBhbHJlYWR5IHBhcnNlZCB0byBhbiBvYmplY3QpLiBBY2NvcmRpbmcgdG8gdGhlIHNwZWMsIHNvdXJjZSBtYXBzIGhhdmUgdGhlXG4gICAqIGZvbGxvd2luZyBhdHRyaWJ1dGVzOlxuICAgKlxuICAgKiAgIC0gdmVyc2lvbjogV2hpY2ggdmVyc2lvbiBvZiB0aGUgc291cmNlIG1hcCBzcGVjIHRoaXMgbWFwIGlzIGZvbGxvd2luZy5cbiAgICogICAtIHNvdXJjZXM6IEFuIGFycmF5IG9mIFVSTHMgdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlcy5cbiAgICogICAtIG5hbWVzOiBBbiBhcnJheSBvZiBpZGVudGlmaWVycyB3aGljaCBjYW4gYmUgcmVmZXJyZW5jZWQgYnkgaW5kaXZpZHVhbCBtYXBwaW5ncy5cbiAgICogICAtIHNvdXJjZVJvb3Q6IE9wdGlvbmFsLiBUaGUgVVJMIHJvb3QgZnJvbSB3aGljaCBhbGwgc291cmNlcyBhcmUgcmVsYXRpdmUuXG4gICAqICAgLSBzb3VyY2VzQ29udGVudDogT3B0aW9uYWwuIEFuIGFycmF5IG9mIGNvbnRlbnRzIG9mIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXMuXG4gICAqICAgLSBtYXBwaW5nczogQSBzdHJpbmcgb2YgYmFzZTY0IFZMUXMgd2hpY2ggY29udGFpbiB0aGUgYWN0dWFsIG1hcHBpbmdzLlxuICAgKiAgIC0gZmlsZTogT3B0aW9uYWwuIFRoZSBnZW5lcmF0ZWQgZmlsZSB0aGlzIHNvdXJjZSBtYXAgaXMgYXNzb2NpYXRlZCB3aXRoLlxuICAgKlxuICAgKiBIZXJlIGlzIGFuIGV4YW1wbGUgc291cmNlIG1hcCwgdGFrZW4gZnJvbSB0aGUgc291cmNlIG1hcCBzcGVjWzBdOlxuICAgKlxuICAgKiAgICAge1xuICAgKiAgICAgICB2ZXJzaW9uIDogMyxcbiAgICogICAgICAgZmlsZTogXCJvdXQuanNcIixcbiAgICogICAgICAgc291cmNlUm9vdCA6IFwiXCIsXG4gICAqICAgICAgIHNvdXJjZXM6IFtcImZvby5qc1wiLCBcImJhci5qc1wiXSxcbiAgICogICAgICAgbmFtZXM6IFtcInNyY1wiLCBcIm1hcHNcIiwgXCJhcmVcIiwgXCJmdW5cIl0sXG4gICAqICAgICAgIG1hcHBpbmdzOiBcIkFBLEFCOztBQkNERTtcIlxuICAgKiAgICAgfVxuICAgKlxuICAgKiBbMF06IGh0dHBzOi8vZG9jcy5nb29nbGUuY29tL2RvY3VtZW50L2QvMVUxUkdBZWhRd1J5cFVUb3ZGMUtSbHBpT0Z6ZTBiLV8yZ2M2ZkFIMEtZMGsvZWRpdD9wbGk9MSNcbiAgICovXG4gIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyKGFTb3VyY2VNYXApIHtcbiAgICB2YXIgc291cmNlTWFwID0gYVNvdXJjZU1hcDtcbiAgICBpZiAodHlwZW9mIGFTb3VyY2VNYXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICBzb3VyY2VNYXAgPSBKU09OLnBhcnNlKGFTb3VyY2VNYXAucmVwbGFjZSgvXlxcKVxcXVxcfScvLCAnJykpO1xuICAgIH1cblxuICAgIHZhciB2ZXJzaW9uID0gdXRpbC5nZXRBcmcoc291cmNlTWFwLCAndmVyc2lvbicpO1xuICAgIHZhciBzb3VyY2VzID0gdXRpbC5nZXRBcmcoc291cmNlTWFwLCAnc291cmNlcycpO1xuICAgIC8vIFNhc3MgMy4zIGxlYXZlcyBvdXQgdGhlICduYW1lcycgYXJyYXksIHNvIHdlIGRldmlhdGUgZnJvbSB0aGUgc3BlYyAod2hpY2hcbiAgICAvLyByZXF1aXJlcyB0aGUgYXJyYXkpIHRvIHBsYXkgbmljZSBoZXJlLlxuICAgIHZhciBuYW1lcyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ25hbWVzJywgW10pO1xuICAgIHZhciBzb3VyY2VSb290ID0gdXRpbC5nZXRBcmcoc291cmNlTWFwLCAnc291cmNlUm9vdCcsIG51bGwpO1xuICAgIHZhciBzb3VyY2VzQ29udGVudCA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZXNDb250ZW50JywgbnVsbCk7XG4gICAgdmFyIG1hcHBpbmdzID0gdXRpbC5nZXRBcmcoc291cmNlTWFwLCAnbWFwcGluZ3MnKTtcbiAgICB2YXIgZmlsZSA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ2ZpbGUnLCBudWxsKTtcblxuICAgIC8vIE9uY2UgYWdhaW4sIFNhc3MgZGV2aWF0ZXMgZnJvbSB0aGUgc3BlYyBhbmQgc3VwcGxpZXMgdGhlIHZlcnNpb24gYXMgYVxuICAgIC8vIHN0cmluZyByYXRoZXIgdGhhbiBhIG51bWJlciwgc28gd2UgdXNlIGxvb3NlIGVxdWFsaXR5IGNoZWNraW5nIGhlcmUuXG4gICAgaWYgKHZlcnNpb24gIT0gdGhpcy5fdmVyc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCB2ZXJzaW9uOiAnICsgdmVyc2lvbik7XG4gICAgfVxuXG4gICAgLy8gUGFzcyBgdHJ1ZWAgYmVsb3cgdG8gYWxsb3cgZHVwbGljYXRlIG5hbWVzIGFuZCBzb3VyY2VzLiBXaGlsZSBzb3VyY2UgbWFwc1xuICAgIC8vIGFyZSBpbnRlbmRlZCB0byBiZSBjb21wcmVzc2VkIGFuZCBkZWR1cGxpY2F0ZWQsIHRoZSBUeXBlU2NyaXB0IGNvbXBpbGVyXG4gICAgLy8gc29tZXRpbWVzIGdlbmVyYXRlcyBzb3VyY2UgbWFwcyB3aXRoIGR1cGxpY2F0ZXMgaW4gdGhlbS4gU2VlIEdpdGh1YiBpc3N1ZVxuICAgIC8vICM3MiBhbmQgYnVnemlsLmxhLzg4OTQ5Mi5cbiAgICB0aGlzLl9uYW1lcyA9IEFycmF5U2V0LmZyb21BcnJheShuYW1lcywgdHJ1ZSk7XG4gICAgdGhpcy5fc291cmNlcyA9IEFycmF5U2V0LmZyb21BcnJheShzb3VyY2VzLCB0cnVlKTtcblxuICAgIHRoaXMuc291cmNlUm9vdCA9IHNvdXJjZVJvb3Q7XG4gICAgdGhpcy5zb3VyY2VzQ29udGVudCA9IHNvdXJjZXNDb250ZW50O1xuICAgIHRoaXMuX21hcHBpbmdzID0gbWFwcGluZ3M7XG4gICAgdGhpcy5maWxlID0gZmlsZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBTb3VyY2VNYXBDb25zdW1lciBmcm9tIGEgU291cmNlTWFwR2VuZXJhdG9yLlxuICAgKlxuICAgKiBAcGFyYW0gU291cmNlTWFwR2VuZXJhdG9yIGFTb3VyY2VNYXBcbiAgICogICAgICAgIFRoZSBzb3VyY2UgbWFwIHRoYXQgd2lsbCBiZSBjb25zdW1lZC5cbiAgICogQHJldHVybnMgU291cmNlTWFwQ29uc3VtZXJcbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLmZyb21Tb3VyY2VNYXAgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2Zyb21Tb3VyY2VNYXAoYVNvdXJjZU1hcCkge1xuICAgICAgdmFyIHNtYyA9IE9iamVjdC5jcmVhdGUoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlKTtcblxuICAgICAgc21jLl9uYW1lcyA9IEFycmF5U2V0LmZyb21BcnJheShhU291cmNlTWFwLl9uYW1lcy50b0FycmF5KCksIHRydWUpO1xuICAgICAgc21jLl9zb3VyY2VzID0gQXJyYXlTZXQuZnJvbUFycmF5KGFTb3VyY2VNYXAuX3NvdXJjZXMudG9BcnJheSgpLCB0cnVlKTtcbiAgICAgIHNtYy5zb3VyY2VSb290ID0gYVNvdXJjZU1hcC5fc291cmNlUm9vdDtcbiAgICAgIHNtYy5zb3VyY2VzQ29udGVudCA9IGFTb3VyY2VNYXAuX2dlbmVyYXRlU291cmNlc0NvbnRlbnQoc21jLl9zb3VyY2VzLnRvQXJyYXkoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc21jLnNvdXJjZVJvb3QpO1xuICAgICAgc21jLmZpbGUgPSBhU291cmNlTWFwLl9maWxlO1xuXG4gICAgICBzbWMuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IGFTb3VyY2VNYXAuX21hcHBpbmdzLnNsaWNlKClcbiAgICAgICAgLnNvcnQodXRpbC5jb21wYXJlQnlHZW5lcmF0ZWRQb3NpdGlvbnMpO1xuICAgICAgc21jLl9fb3JpZ2luYWxNYXBwaW5ncyA9IGFTb3VyY2VNYXAuX21hcHBpbmdzLnNsaWNlKClcbiAgICAgICAgLnNvcnQodXRpbC5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyk7XG5cbiAgICAgIHJldHVybiBzbWM7XG4gICAgfTtcblxuICAvKipcbiAgICogVGhlIHZlcnNpb24gb2YgdGhlIHNvdXJjZSBtYXBwaW5nIHNwZWMgdGhhdCB3ZSBhcmUgY29uc3VtaW5nLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLl92ZXJzaW9uID0gMztcblxuICAvKipcbiAgICogVGhlIGxpc3Qgb2Ygb3JpZ2luYWwgc291cmNlcy5cbiAgICovXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUsICdzb3VyY2VzJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRoaXMuX3NvdXJjZXMudG9BcnJheSgpLm1hcChmdW5jdGlvbiAocykge1xuICAgICAgICByZXR1cm4gdGhpcy5zb3VyY2VSb290ID8gdXRpbC5qb2luKHRoaXMuc291cmNlUm9vdCwgcykgOiBzO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfVxuICB9KTtcblxuICAvLyBgX19nZW5lcmF0ZWRNYXBwaW5nc2AgYW5kIGBfX29yaWdpbmFsTWFwcGluZ3NgIGFyZSBhcnJheXMgdGhhdCBob2xkIHRoZVxuICAvLyBwYXJzZWQgbWFwcGluZyBjb29yZGluYXRlcyBmcm9tIHRoZSBzb3VyY2UgbWFwJ3MgXCJtYXBwaW5nc1wiIGF0dHJpYnV0ZS4gVGhleVxuICAvLyBhcmUgbGF6aWx5IGluc3RhbnRpYXRlZCwgYWNjZXNzZWQgdmlhIHRoZSBgX2dlbmVyYXRlZE1hcHBpbmdzYCBhbmRcbiAgLy8gYF9vcmlnaW5hbE1hcHBpbmdzYCBnZXR0ZXJzIHJlc3BlY3RpdmVseSwgYW5kIHdlIG9ubHkgcGFyc2UgdGhlIG1hcHBpbmdzXG4gIC8vIGFuZCBjcmVhdGUgdGhlc2UgYXJyYXlzIG9uY2UgcXVlcmllZCBmb3IgYSBzb3VyY2UgbG9jYXRpb24uIFdlIGp1bXAgdGhyb3VnaFxuICAvLyB0aGVzZSBob29wcyBiZWNhdXNlIHRoZXJlIGNhbiBiZSBtYW55IHRob3VzYW5kcyBvZiBtYXBwaW5ncywgYW5kIHBhcnNpbmdcbiAgLy8gdGhlbSBpcyBleHBlbnNpdmUsIHNvIHdlIG9ubHkgd2FudCB0byBkbyBpdCBpZiB3ZSBtdXN0LlxuICAvL1xuICAvLyBFYWNoIG9iamVjdCBpbiB0aGUgYXJyYXlzIGlzIG9mIHRoZSBmb3JtOlxuICAvL1xuICAvLyAgICAge1xuICAvLyAgICAgICBnZW5lcmF0ZWRMaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBjb2RlLFxuICAvLyAgICAgICBnZW5lcmF0ZWRDb2x1bW46IFRoZSBjb2x1bW4gbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgY29kZSxcbiAgLy8gICAgICAgc291cmNlOiBUaGUgcGF0aCB0byB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGUgdGhhdCBnZW5lcmF0ZWQgdGhpc1xuICAvLyAgICAgICAgICAgICAgIGNodW5rIG9mIGNvZGUsXG4gIC8vICAgICAgIG9yaWdpbmFsTGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBvcmlnaW5hbCBzb3VyY2UgdGhhdFxuICAvLyAgICAgICAgICAgICAgICAgICAgIGNvcnJlc3BvbmRzIHRvIHRoaXMgY2h1bmsgb2YgZ2VuZXJhdGVkIGNvZGUsXG4gIC8vICAgICAgIG9yaWdpbmFsQ29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlIHRoYXRcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgIGNvcnJlc3BvbmRzIHRvIHRoaXMgY2h1bmsgb2YgZ2VuZXJhdGVkIGNvZGUsXG4gIC8vICAgICAgIG5hbWU6IFRoZSBuYW1lIG9mIHRoZSBvcmlnaW5hbCBzeW1ib2wgd2hpY2ggZ2VuZXJhdGVkIHRoaXMgY2h1bmsgb2ZcbiAgLy8gICAgICAgICAgICAgY29kZS5cbiAgLy8gICAgIH1cbiAgLy9cbiAgLy8gQWxsIHByb3BlcnRpZXMgZXhjZXB0IGZvciBgZ2VuZXJhdGVkTGluZWAgYW5kIGBnZW5lcmF0ZWRDb2x1bW5gIGNhbiBiZVxuICAvLyBgbnVsbGAuXG4gIC8vXG4gIC8vIGBfZ2VuZXJhdGVkTWFwcGluZ3NgIGlzIG9yZGVyZWQgYnkgdGhlIGdlbmVyYXRlZCBwb3NpdGlvbnMuXG4gIC8vXG4gIC8vIGBfb3JpZ2luYWxNYXBwaW5nc2AgaXMgb3JkZXJlZCBieSB0aGUgb3JpZ2luYWwgcG9zaXRpb25zLlxuXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fX2dlbmVyYXRlZE1hcHBpbmdzID0gbnVsbDtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZSwgJ19nZW5lcmF0ZWRNYXBwaW5ncycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICghdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzKSB7XG4gICAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wYXJzZU1hcHBpbmdzKHRoaXMuX21hcHBpbmdzLCB0aGlzLnNvdXJjZVJvb3QpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzO1xuICAgIH1cbiAgfSk7XG5cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLl9fb3JpZ2luYWxNYXBwaW5ncyA9IG51bGw7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUsICdfb3JpZ2luYWxNYXBwaW5ncycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICghdGhpcy5fX29yaWdpbmFsTWFwcGluZ3MpIHtcbiAgICAgICAgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzID0gW107XG4gICAgICAgIHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzID0gW107XG4gICAgICAgIHRoaXMuX3BhcnNlTWFwcGluZ3ModGhpcy5fbWFwcGluZ3MsIHRoaXMuc291cmNlUm9vdCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncztcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBQYXJzZSB0aGUgbWFwcGluZ3MgaW4gYSBzdHJpbmcgaW4gdG8gYSBkYXRhIHN0cnVjdHVyZSB3aGljaCB3ZSBjYW4gZWFzaWx5XG4gICAqIHF1ZXJ5ICh0aGUgb3JkZXJlZCBhcnJheXMgaW4gdGhlIGB0aGlzLl9fZ2VuZXJhdGVkTWFwcGluZ3NgIGFuZFxuICAgKiBgdGhpcy5fX29yaWdpbmFsTWFwcGluZ3NgIHByb3BlcnRpZXMpLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLl9wYXJzZU1hcHBpbmdzID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9wYXJzZU1hcHBpbmdzKGFTdHIsIGFTb3VyY2VSb290KSB7XG4gICAgICB2YXIgZ2VuZXJhdGVkTGluZSA9IDE7XG4gICAgICB2YXIgcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gPSAwO1xuICAgICAgdmFyIHByZXZpb3VzT3JpZ2luYWxMaW5lID0gMDtcbiAgICAgIHZhciBwcmV2aW91c09yaWdpbmFsQ29sdW1uID0gMDtcbiAgICAgIHZhciBwcmV2aW91c1NvdXJjZSA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNOYW1lID0gMDtcbiAgICAgIHZhciBtYXBwaW5nU2VwYXJhdG9yID0gL15bLDtdLztcbiAgICAgIHZhciBzdHIgPSBhU3RyO1xuICAgICAgdmFyIG1hcHBpbmc7XG4gICAgICB2YXIgdGVtcDtcblxuICAgICAgd2hpbGUgKHN0ci5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChzdHIuY2hhckF0KDApID09PSAnOycpIHtcbiAgICAgICAgICBnZW5lcmF0ZWRMaW5lKys7XG4gICAgICAgICAgc3RyID0gc3RyLnNsaWNlKDEpO1xuICAgICAgICAgIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdHIuY2hhckF0KDApID09PSAnLCcpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgbWFwcGluZyA9IHt9O1xuICAgICAgICAgIG1hcHBpbmcuZ2VuZXJhdGVkTGluZSA9IGdlbmVyYXRlZExpbmU7XG5cbiAgICAgICAgICAvLyBHZW5lcmF0ZWQgY29sdW1uLlxuICAgICAgICAgIHRlbXAgPSBiYXNlNjRWTFEuZGVjb2RlKHN0cik7XG4gICAgICAgICAgbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4gPSBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiArIHRlbXAudmFsdWU7XG4gICAgICAgICAgcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gPSBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbjtcbiAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG5cbiAgICAgICAgICBpZiAoc3RyLmxlbmd0aCA+IDAgJiYgIW1hcHBpbmdTZXBhcmF0b3IudGVzdChzdHIuY2hhckF0KDApKSkge1xuICAgICAgICAgICAgLy8gT3JpZ2luYWwgc291cmNlLlxuICAgICAgICAgICAgdGVtcCA9IGJhc2U2NFZMUS5kZWNvZGUoc3RyKTtcbiAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gdGhpcy5fc291cmNlcy5hdChwcmV2aW91c1NvdXJjZSArIHRlbXAudmFsdWUpO1xuICAgICAgICAgICAgcHJldmlvdXNTb3VyY2UgKz0gdGVtcC52YWx1ZTtcbiAgICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcbiAgICAgICAgICAgIGlmIChzdHIubGVuZ3RoID09PSAwIHx8IG1hcHBpbmdTZXBhcmF0b3IudGVzdChzdHIuY2hhckF0KDApKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIGEgc291cmNlLCBidXQgbm8gbGluZSBhbmQgY29sdW1uJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9yaWdpbmFsIGxpbmUuXG4gICAgICAgICAgICB0ZW1wID0gYmFzZTY0VkxRLmRlY29kZShzdHIpO1xuICAgICAgICAgICAgbWFwcGluZy5vcmlnaW5hbExpbmUgPSBwcmV2aW91c09yaWdpbmFsTGluZSArIHRlbXAudmFsdWU7XG4gICAgICAgICAgICBwcmV2aW91c09yaWdpbmFsTGluZSA9IG1hcHBpbmcub3JpZ2luYWxMaW5lO1xuICAgICAgICAgICAgLy8gTGluZXMgYXJlIHN0b3JlZCAwLWJhc2VkXG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsTGluZSArPSAxO1xuICAgICAgICAgICAgc3RyID0gdGVtcC5yZXN0O1xuICAgICAgICAgICAgaWYgKHN0ci5sZW5ndGggPT09IDAgfHwgbWFwcGluZ1NlcGFyYXRvci50ZXN0KHN0ci5jaGFyQXQoMCkpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRm91bmQgYSBzb3VyY2UgYW5kIGxpbmUsIGJ1dCBubyBjb2x1bW4nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT3JpZ2luYWwgY29sdW1uLlxuICAgICAgICAgICAgdGVtcCA9IGJhc2U2NFZMUS5kZWNvZGUoc3RyKTtcbiAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxDb2x1bW4gPSBwcmV2aW91c09yaWdpbmFsQ29sdW1uICsgdGVtcC52YWx1ZTtcbiAgICAgICAgICAgIHByZXZpb3VzT3JpZ2luYWxDb2x1bW4gPSBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uO1xuICAgICAgICAgICAgc3RyID0gdGVtcC5yZXN0O1xuXG4gICAgICAgICAgICBpZiAoc3RyLmxlbmd0aCA+IDAgJiYgIW1hcHBpbmdTZXBhcmF0b3IudGVzdChzdHIuY2hhckF0KDApKSkge1xuICAgICAgICAgICAgICAvLyBPcmlnaW5hbCBuYW1lLlxuICAgICAgICAgICAgICB0ZW1wID0gYmFzZTY0VkxRLmRlY29kZShzdHIpO1xuICAgICAgICAgICAgICBtYXBwaW5nLm5hbWUgPSB0aGlzLl9uYW1lcy5hdChwcmV2aW91c05hbWUgKyB0ZW1wLnZhbHVlKTtcbiAgICAgICAgICAgICAgcHJldmlvdXNOYW1lICs9IHRlbXAudmFsdWU7XG4gICAgICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9fZ2VuZXJhdGVkTWFwcGluZ3MucHVzaChtYXBwaW5nKTtcbiAgICAgICAgICBpZiAodHlwZW9mIG1hcHBpbmcub3JpZ2luYWxMaW5lID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhpcy5fX29yaWdpbmFsTWFwcGluZ3MucHVzaChtYXBwaW5nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzLnNvcnQodXRpbC5jb21wYXJlQnlHZW5lcmF0ZWRQb3NpdGlvbnMpO1xuICAgICAgdGhpcy5fX29yaWdpbmFsTWFwcGluZ3Muc29ydCh1dGlsLmNvbXBhcmVCeU9yaWdpbmFsUG9zaXRpb25zKTtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBGaW5kIHRoZSBtYXBwaW5nIHRoYXQgYmVzdCBtYXRjaGVzIHRoZSBoeXBvdGhldGljYWwgXCJuZWVkbGVcIiBtYXBwaW5nIHRoYXRcbiAgICogd2UgYXJlIHNlYXJjaGluZyBmb3IgaW4gdGhlIGdpdmVuIFwiaGF5c3RhY2tcIiBvZiBtYXBwaW5ncy5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fZmluZE1hcHBpbmcgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2ZpbmRNYXBwaW5nKGFOZWVkbGUsIGFNYXBwaW5ncywgYUxpbmVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFDb2x1bW5OYW1lLCBhQ29tcGFyYXRvcikge1xuICAgICAgLy8gVG8gcmV0dXJuIHRoZSBwb3NpdGlvbiB3ZSBhcmUgc2VhcmNoaW5nIGZvciwgd2UgbXVzdCBmaXJzdCBmaW5kIHRoZVxuICAgICAgLy8gbWFwcGluZyBmb3IgdGhlIGdpdmVuIHBvc2l0aW9uIGFuZCB0aGVuIHJldHVybiB0aGUgb3Bwb3NpdGUgcG9zaXRpb24gaXRcbiAgICAgIC8vIHBvaW50cyB0by4gQmVjYXVzZSB0aGUgbWFwcGluZ3MgYXJlIHNvcnRlZCwgd2UgY2FuIHVzZSBiaW5hcnkgc2VhcmNoIHRvXG4gICAgICAvLyBmaW5kIHRoZSBiZXN0IG1hcHBpbmcuXG5cbiAgICAgIGlmIChhTmVlZGxlW2FMaW5lTmFtZV0gPD0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdMaW5lIG11c3QgYmUgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDEsIGdvdCAnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBhTmVlZGxlW2FMaW5lTmFtZV0pO1xuICAgICAgfVxuICAgICAgaWYgKGFOZWVkbGVbYUNvbHVtbk5hbWVdIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdDb2x1bW4gbXVzdCBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gMCwgZ290ICdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArIGFOZWVkbGVbYUNvbHVtbk5hbWVdKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGJpbmFyeVNlYXJjaC5zZWFyY2goYU5lZWRsZSwgYU1hcHBpbmdzLCBhQ29tcGFyYXRvcik7XG4gICAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgb3JpZ2luYWwgc291cmNlLCBsaW5lLCBhbmQgY29sdW1uIGluZm9ybWF0aW9uIGZvciB0aGUgZ2VuZXJhdGVkXG4gICAqIHNvdXJjZSdzIGxpbmUgYW5kIGNvbHVtbiBwb3NpdGlvbnMgcHJvdmlkZWQuIFRoZSBvbmx5IGFyZ3VtZW50IGlzIGFuIG9iamVjdFxuICAgKiB3aXRoIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICpcbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZS5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UuXG4gICAqXG4gICAqIGFuZCBhbiBvYmplY3QgaXMgcmV0dXJuZWQgd2l0aCB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBzb3VyY2U6IFRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZSwgb3IgbnVsbC5cbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gbmFtZTogVGhlIG9yaWdpbmFsIGlkZW50aWZpZXIsIG9yIG51bGwuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUub3JpZ2luYWxQb3NpdGlvbkZvciA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfb3JpZ2luYWxQb3NpdGlvbkZvcihhQXJncykge1xuICAgICAgdmFyIG5lZWRsZSA9IHtcbiAgICAgICAgZ2VuZXJhdGVkTGluZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdsaW5lJyksXG4gICAgICAgIGdlbmVyYXRlZENvbHVtbjogdXRpbC5nZXRBcmcoYUFyZ3MsICdjb2x1bW4nKVxuICAgICAgfTtcblxuICAgICAgdmFyIG1hcHBpbmcgPSB0aGlzLl9maW5kTWFwcGluZyhuZWVkbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2dlbmVyYXRlZE1hcHBpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdlbmVyYXRlZExpbmVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW5lcmF0ZWRDb2x1bW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXRpbC5jb21wYXJlQnlHZW5lcmF0ZWRQb3NpdGlvbnMpO1xuXG4gICAgICBpZiAobWFwcGluZyAmJiBtYXBwaW5nLmdlbmVyYXRlZExpbmUgPT09IG5lZWRsZS5nZW5lcmF0ZWRMaW5lKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSB1dGlsLmdldEFyZyhtYXBwaW5nLCAnc291cmNlJywgbnVsbCk7XG4gICAgICAgIGlmIChzb3VyY2UgJiYgdGhpcy5zb3VyY2VSb290KSB7XG4gICAgICAgICAgc291cmNlID0gdXRpbC5qb2luKHRoaXMuc291cmNlUm9vdCwgc291cmNlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHNvdXJjZTogc291cmNlLFxuICAgICAgICAgIGxpbmU6IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdvcmlnaW5hbExpbmUnLCBudWxsKSxcbiAgICAgICAgICBjb2x1bW46IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdvcmlnaW5hbENvbHVtbicsIG51bGwpLFxuICAgICAgICAgIG5hbWU6IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICduYW1lJywgbnVsbClcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc291cmNlOiBudWxsLFxuICAgICAgICBsaW5lOiBudWxsLFxuICAgICAgICBjb2x1bW46IG51bGwsXG4gICAgICAgIG5hbWU6IG51bGxcbiAgICAgIH07XG4gICAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgb3JpZ2luYWwgc291cmNlIGNvbnRlbnQuIFRoZSBvbmx5IGFyZ3VtZW50IGlzIHRoZSB1cmwgb2YgdGhlXG4gICAqIG9yaWdpbmFsIHNvdXJjZSBmaWxlLiBSZXR1cm5zIG51bGwgaWYgbm8gb3JpZ2luYWwgc291cmNlIGNvbnRlbnQgaXNcbiAgICogYXZhaWxpYmxlLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLnNvdXJjZUNvbnRlbnRGb3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX3NvdXJjZUNvbnRlbnRGb3IoYVNvdXJjZSkge1xuICAgICAgaWYgKCF0aGlzLnNvdXJjZXNDb250ZW50KSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zb3VyY2VSb290KSB7XG4gICAgICAgIGFTb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHRoaXMuc291cmNlUm9vdCwgYVNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9zb3VyY2VzLmhhcyhhU291cmNlKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zb3VyY2VzQ29udGVudFt0aGlzLl9zb3VyY2VzLmluZGV4T2YoYVNvdXJjZSldO1xuICAgICAgfVxuXG4gICAgICB2YXIgdXJsO1xuICAgICAgaWYgKHRoaXMuc291cmNlUm9vdFxuICAgICAgICAgICYmICh1cmwgPSB1dGlsLnVybFBhcnNlKHRoaXMuc291cmNlUm9vdCkpKSB7XG4gICAgICAgIC8vIFhYWDogZmlsZTovLyBVUklzIGFuZCBhYnNvbHV0ZSBwYXRocyBsZWFkIHRvIHVuZXhwZWN0ZWQgYmVoYXZpb3IgZm9yXG4gICAgICAgIC8vIG1hbnkgdXNlcnMuIFdlIGNhbiBoZWxwIHRoZW0gb3V0IHdoZW4gdGhleSBleHBlY3QgZmlsZTovLyBVUklzIHRvXG4gICAgICAgIC8vIGJlaGF2ZSBsaWtlIGl0IHdvdWxkIGlmIHRoZXkgd2VyZSBydW5uaW5nIGEgbG9jYWwgSFRUUCBzZXJ2ZXIuIFNlZVxuICAgICAgICAvLyBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD04ODU1OTcuXG4gICAgICAgIHZhciBmaWxlVXJpQWJzUGF0aCA9IGFTb3VyY2UucmVwbGFjZSgvXmZpbGU6XFwvXFwvLywgXCJcIik7XG4gICAgICAgIGlmICh1cmwuc2NoZW1lID09IFwiZmlsZVwiXG4gICAgICAgICAgICAmJiB0aGlzLl9zb3VyY2VzLmhhcyhmaWxlVXJpQWJzUGF0aCkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zb3VyY2VzQ29udGVudFt0aGlzLl9zb3VyY2VzLmluZGV4T2YoZmlsZVVyaUFic1BhdGgpXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCghdXJsLnBhdGggfHwgdXJsLnBhdGggPT0gXCIvXCIpXG4gICAgICAgICAgICAmJiB0aGlzLl9zb3VyY2VzLmhhcyhcIi9cIiArIGFTb3VyY2UpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKFwiL1wiICsgYVNvdXJjZSldO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcignXCInICsgYVNvdXJjZSArICdcIiBpcyBub3QgaW4gdGhlIFNvdXJjZU1hcC4nKTtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBnZW5lcmF0ZWQgbGluZSBhbmQgY29sdW1uIGluZm9ybWF0aW9uIGZvciB0aGUgb3JpZ2luYWwgc291cmNlLFxuICAgKiBsaW5lLCBhbmQgY29sdW1uIHBvc2l0aW9ucyBwcm92aWRlZC4gVGhlIG9ubHkgYXJndW1lbnQgaXMgYW4gb2JqZWN0IHdpdGhcbiAgICogdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gc291cmNlOiBUaGUgZmlsZW5hbWUgb2YgdGhlIG9yaWdpbmFsIHNvdXJjZS5cbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLlxuICAgKlxuICAgKiBhbmQgYW4gb2JqZWN0IGlzIHJldHVybmVkIHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gbGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZSwgb3IgbnVsbC5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5nZW5lcmF0ZWRQb3NpdGlvbkZvciA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfZ2VuZXJhdGVkUG9zaXRpb25Gb3IoYUFyZ3MpIHtcbiAgICAgIHZhciBuZWVkbGUgPSB7XG4gICAgICAgIHNvdXJjZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdzb3VyY2UnKSxcbiAgICAgICAgb3JpZ2luYWxMaW5lOiB1dGlsLmdldEFyZyhhQXJncywgJ2xpbmUnKSxcbiAgICAgICAgb3JpZ2luYWxDb2x1bW46IHV0aWwuZ2V0QXJnKGFBcmdzLCAnY29sdW1uJylcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNvdXJjZVJvb3QpIHtcbiAgICAgICAgbmVlZGxlLnNvdXJjZSA9IHV0aWwucmVsYXRpdmUodGhpcy5zb3VyY2VSb290LCBuZWVkbGUuc291cmNlKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG1hcHBpbmcgPSB0aGlzLl9maW5kTWFwcGluZyhuZWVkbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX29yaWdpbmFsTWFwcGluZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwib3JpZ2luYWxMaW5lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwib3JpZ2luYWxDb2x1bW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXRpbC5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyk7XG5cbiAgICAgIGlmIChtYXBwaW5nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbGluZTogdXRpbC5nZXRBcmcobWFwcGluZywgJ2dlbmVyYXRlZExpbmUnLCBudWxsKSxcbiAgICAgICAgICBjb2x1bW46IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdnZW5lcmF0ZWRDb2x1bW4nLCBudWxsKVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBsaW5lOiBudWxsLFxuICAgICAgICBjb2x1bW46IG51bGxcbiAgICAgIH07XG4gICAgfTtcblxuICBTb3VyY2VNYXBDb25zdW1lci5HRU5FUkFURURfT1JERVIgPSAxO1xuICBTb3VyY2VNYXBDb25zdW1lci5PUklHSU5BTF9PUkRFUiA9IDI7XG5cbiAgLyoqXG4gICAqIEl0ZXJhdGUgb3ZlciBlYWNoIG1hcHBpbmcgYmV0d2VlbiBhbiBvcmlnaW5hbCBzb3VyY2UvbGluZS9jb2x1bW4gYW5kIGFcbiAgICogZ2VuZXJhdGVkIGxpbmUvY29sdW1uIGluIHRoaXMgc291cmNlIG1hcC5cbiAgICpcbiAgICogQHBhcmFtIEZ1bmN0aW9uIGFDYWxsYmFja1xuICAgKiAgICAgICAgVGhlIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIHdpdGggZWFjaCBtYXBwaW5nLlxuICAgKiBAcGFyYW0gT2JqZWN0IGFDb250ZXh0XG4gICAqICAgICAgICBPcHRpb25hbC4gSWYgc3BlY2lmaWVkLCB0aGlzIG9iamVjdCB3aWxsIGJlIHRoZSB2YWx1ZSBvZiBgdGhpc2AgZXZlcnlcbiAgICogICAgICAgIHRpbWUgdGhhdCBgYUNhbGxiYWNrYCBpcyBjYWxsZWQuXG4gICAqIEBwYXJhbSBhT3JkZXJcbiAgICogICAgICAgIEVpdGhlciBgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSYCBvclxuICAgKiAgICAgICAgYFNvdXJjZU1hcENvbnN1bWVyLk9SSUdJTkFMX09SREVSYC4gU3BlY2lmaWVzIHdoZXRoZXIgeW91IHdhbnQgdG9cbiAgICogICAgICAgIGl0ZXJhdGUgb3ZlciB0aGUgbWFwcGluZ3Mgc29ydGVkIGJ5IHRoZSBnZW5lcmF0ZWQgZmlsZSdzIGxpbmUvY29sdW1uXG4gICAqICAgICAgICBvcmRlciBvciB0aGUgb3JpZ2luYWwncyBzb3VyY2UvbGluZS9jb2x1bW4gb3JkZXIsIHJlc3BlY3RpdmVseS4gRGVmYXVsdHMgdG9cbiAgICogICAgICAgIGBTb3VyY2VNYXBDb25zdW1lci5HRU5FUkFURURfT1JERVJgLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLmVhY2hNYXBwaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9lYWNoTWFwcGluZyhhQ2FsbGJhY2ssIGFDb250ZXh0LCBhT3JkZXIpIHtcbiAgICAgIHZhciBjb250ZXh0ID0gYUNvbnRleHQgfHwgbnVsbDtcbiAgICAgIHZhciBvcmRlciA9IGFPcmRlciB8fCBTb3VyY2VNYXBDb25zdW1lci5HRU5FUkFURURfT1JERVI7XG5cbiAgICAgIHZhciBtYXBwaW5ncztcbiAgICAgIHN3aXRjaCAob3JkZXIpIHtcbiAgICAgIGNhc2UgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSOlxuICAgICAgICBtYXBwaW5ncyA9IHRoaXMuX2dlbmVyYXRlZE1hcHBpbmdzO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgU291cmNlTWFwQ29uc3VtZXIuT1JJR0lOQUxfT1JERVI6XG4gICAgICAgIG1hcHBpbmdzID0gdGhpcy5fb3JpZ2luYWxNYXBwaW5ncztcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIG9yZGVyIG9mIGl0ZXJhdGlvbi5cIik7XG4gICAgICB9XG5cbiAgICAgIHZhciBzb3VyY2VSb290ID0gdGhpcy5zb3VyY2VSb290O1xuICAgICAgbWFwcGluZ3MubWFwKGZ1bmN0aW9uIChtYXBwaW5nKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBtYXBwaW5nLnNvdXJjZTtcbiAgICAgICAgaWYgKHNvdXJjZSAmJiBzb3VyY2VSb290KSB7XG4gICAgICAgICAgc291cmNlID0gdXRpbC5qb2luKHNvdXJjZVJvb3QsIHNvdXJjZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgICBnZW5lcmF0ZWRMaW5lOiBtYXBwaW5nLmdlbmVyYXRlZExpbmUsXG4gICAgICAgICAgZ2VuZXJhdGVkQ29sdW1uOiBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbixcbiAgICAgICAgICBvcmlnaW5hbExpbmU6IG1hcHBpbmcub3JpZ2luYWxMaW5lLFxuICAgICAgICAgIG9yaWdpbmFsQ29sdW1uOiBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uLFxuICAgICAgICAgIG5hbWU6IG1hcHBpbmcubmFtZVxuICAgICAgICB9O1xuICAgICAgfSkuZm9yRWFjaChhQ2FsbGJhY2ssIGNvbnRleHQpO1xuICAgIH07XG5cbiAgZXhwb3J0cy5Tb3VyY2VNYXBDb25zdW1lciA9IFNvdXJjZU1hcENvbnN1bWVyO1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIGJhc2U2NFZMUSA9IHJlcXVpcmUoJy4vYmFzZTY0LXZscScpO1xuICB2YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xuICB2YXIgQXJyYXlTZXQgPSByZXF1aXJlKCcuL2FycmF5LXNldCcpLkFycmF5U2V0O1xuXG4gIC8qKlxuICAgKiBBbiBpbnN0YW5jZSBvZiB0aGUgU291cmNlTWFwR2VuZXJhdG9yIHJlcHJlc2VudHMgYSBzb3VyY2UgbWFwIHdoaWNoIGlzXG4gICAqIGJlaW5nIGJ1aWx0IGluY3JlbWVudGFsbHkuIFlvdSBtYXkgcGFzcyBhbiBvYmplY3Qgd2l0aCB0aGUgZm9sbG93aW5nXG4gICAqIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBmaWxlOiBUaGUgZmlsZW5hbWUgb2YgdGhlIGdlbmVyYXRlZCBzb3VyY2UuXG4gICAqICAgLSBzb3VyY2VSb290OiBBIHJvb3QgZm9yIGFsbCByZWxhdGl2ZSBVUkxzIGluIHRoaXMgc291cmNlIG1hcC5cbiAgICovXG4gIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcihhQXJncykge1xuICAgIGlmICghYUFyZ3MpIHtcbiAgICAgIGFBcmdzID0ge307XG4gICAgfVxuICAgIHRoaXMuX2ZpbGUgPSB1dGlsLmdldEFyZyhhQXJncywgJ2ZpbGUnLCBudWxsKTtcbiAgICB0aGlzLl9zb3VyY2VSb290ID0gdXRpbC5nZXRBcmcoYUFyZ3MsICdzb3VyY2VSb290JywgbnVsbCk7XG4gICAgdGhpcy5fc291cmNlcyA9IG5ldyBBcnJheVNldCgpO1xuICAgIHRoaXMuX25hbWVzID0gbmV3IEFycmF5U2V0KCk7XG4gICAgdGhpcy5fbWFwcGluZ3MgPSBbXTtcbiAgICB0aGlzLl9zb3VyY2VzQ29udGVudHMgPSBudWxsO1xuICB9XG5cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5fdmVyc2lvbiA9IDM7XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgU291cmNlTWFwR2VuZXJhdG9yIGJhc2VkIG9uIGEgU291cmNlTWFwQ29uc3VtZXJcbiAgICpcbiAgICogQHBhcmFtIGFTb3VyY2VNYXBDb25zdW1lciBUaGUgU291cmNlTWFwLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLmZyb21Tb3VyY2VNYXAgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl9mcm9tU291cmNlTWFwKGFTb3VyY2VNYXBDb25zdW1lcikge1xuICAgICAgdmFyIHNvdXJjZVJvb3QgPSBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlUm9vdDtcbiAgICAgIHZhciBnZW5lcmF0b3IgPSBuZXcgU291cmNlTWFwR2VuZXJhdG9yKHtcbiAgICAgICAgZmlsZTogYVNvdXJjZU1hcENvbnN1bWVyLmZpbGUsXG4gICAgICAgIHNvdXJjZVJvb3Q6IHNvdXJjZVJvb3RcbiAgICAgIH0pO1xuICAgICAgYVNvdXJjZU1hcENvbnN1bWVyLmVhY2hNYXBwaW5nKGZ1bmN0aW9uIChtYXBwaW5nKSB7XG4gICAgICAgIHZhciBuZXdNYXBwaW5nID0ge1xuICAgICAgICAgIGdlbmVyYXRlZDoge1xuICAgICAgICAgICAgbGluZTogbWFwcGluZy5nZW5lcmF0ZWRMaW5lLFxuICAgICAgICAgICAgY29sdW1uOiBtYXBwaW5nLmdlbmVyYXRlZENvbHVtblxuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBpZiAobWFwcGluZy5zb3VyY2UpIHtcbiAgICAgICAgICBuZXdNYXBwaW5nLnNvdXJjZSA9IG1hcHBpbmcuc291cmNlO1xuICAgICAgICAgIGlmIChzb3VyY2VSb290KSB7XG4gICAgICAgICAgICBuZXdNYXBwaW5nLnNvdXJjZSA9IHV0aWwucmVsYXRpdmUoc291cmNlUm9vdCwgbmV3TWFwcGluZy5zb3VyY2UpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIG5ld01hcHBpbmcub3JpZ2luYWwgPSB7XG4gICAgICAgICAgICBsaW5lOiBtYXBwaW5nLm9yaWdpbmFsTGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogbWFwcGluZy5vcmlnaW5hbENvbHVtblxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBpZiAobWFwcGluZy5uYW1lKSB7XG4gICAgICAgICAgICBuZXdNYXBwaW5nLm5hbWUgPSBtYXBwaW5nLm5hbWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZ2VuZXJhdG9yLmFkZE1hcHBpbmcobmV3TWFwcGluZyk7XG4gICAgICB9KTtcbiAgICAgIGFTb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzLmZvckVhY2goZnVuY3Rpb24gKHNvdXJjZUZpbGUpIHtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlQ29udGVudEZvcihzb3VyY2VGaWxlKTtcbiAgICAgICAgaWYgKGNvbnRlbnQpIHtcbiAgICAgICAgICBnZW5lcmF0b3Iuc2V0U291cmNlQ29udGVudChzb3VyY2VGaWxlLCBjb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gZ2VuZXJhdG9yO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIEFkZCBhIHNpbmdsZSBtYXBwaW5nIGZyb20gb3JpZ2luYWwgc291cmNlIGxpbmUgYW5kIGNvbHVtbiB0byB0aGUgZ2VuZXJhdGVkXG4gICAqIHNvdXJjZSdzIGxpbmUgYW5kIGNvbHVtbiBmb3IgdGhpcyBzb3VyY2UgbWFwIGJlaW5nIGNyZWF0ZWQuIFRoZSBtYXBwaW5nXG4gICAqIG9iamVjdCBzaG91bGQgaGF2ZSB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBnZW5lcmF0ZWQ6IEFuIG9iamVjdCB3aXRoIHRoZSBnZW5lcmF0ZWQgbGluZSBhbmQgY29sdW1uIHBvc2l0aW9ucy5cbiAgICogICAtIG9yaWdpbmFsOiBBbiBvYmplY3Qgd2l0aCB0aGUgb3JpZ2luYWwgbGluZSBhbmQgY29sdW1uIHBvc2l0aW9ucy5cbiAgICogICAtIHNvdXJjZTogVGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlIChyZWxhdGl2ZSB0byB0aGUgc291cmNlUm9vdCkuXG4gICAqICAgLSBuYW1lOiBBbiBvcHRpb25hbCBvcmlnaW5hbCB0b2tlbiBuYW1lIGZvciB0aGlzIG1hcHBpbmcuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLmFkZE1hcHBpbmcgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl9hZGRNYXBwaW5nKGFBcmdzKSB7XG4gICAgICB2YXIgZ2VuZXJhdGVkID0gdXRpbC5nZXRBcmcoYUFyZ3MsICdnZW5lcmF0ZWQnKTtcbiAgICAgIHZhciBvcmlnaW5hbCA9IHV0aWwuZ2V0QXJnKGFBcmdzLCAnb3JpZ2luYWwnLCBudWxsKTtcbiAgICAgIHZhciBzb3VyY2UgPSB1dGlsLmdldEFyZyhhQXJncywgJ3NvdXJjZScsIG51bGwpO1xuICAgICAgdmFyIG5hbWUgPSB1dGlsLmdldEFyZyhhQXJncywgJ25hbWUnLCBudWxsKTtcblxuICAgICAgdGhpcy5fdmFsaWRhdGVNYXBwaW5nKGdlbmVyYXRlZCwgb3JpZ2luYWwsIHNvdXJjZSwgbmFtZSk7XG5cbiAgICAgIGlmIChzb3VyY2UgJiYgIXRoaXMuX3NvdXJjZXMuaGFzKHNvdXJjZSkpIHtcbiAgICAgICAgdGhpcy5fc291cmNlcy5hZGQoc291cmNlKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG5hbWUgJiYgIXRoaXMuX25hbWVzLmhhcyhuYW1lKSkge1xuICAgICAgICB0aGlzLl9uYW1lcy5hZGQobmFtZSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX21hcHBpbmdzLnB1c2goe1xuICAgICAgICBnZW5lcmF0ZWRMaW5lOiBnZW5lcmF0ZWQubGluZSxcbiAgICAgICAgZ2VuZXJhdGVkQ29sdW1uOiBnZW5lcmF0ZWQuY29sdW1uLFxuICAgICAgICBvcmlnaW5hbExpbmU6IG9yaWdpbmFsICE9IG51bGwgJiYgb3JpZ2luYWwubGluZSxcbiAgICAgICAgb3JpZ2luYWxDb2x1bW46IG9yaWdpbmFsICE9IG51bGwgJiYgb3JpZ2luYWwuY29sdW1uLFxuICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgbmFtZTogbmFtZVxuICAgICAgfSk7XG4gICAgfTtcblxuICAvKipcbiAgICogU2V0IHRoZSBzb3VyY2UgY29udGVudCBmb3IgYSBzb3VyY2UgZmlsZS5cbiAgICovXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuc2V0U291cmNlQ29udGVudCA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3NldFNvdXJjZUNvbnRlbnQoYVNvdXJjZUZpbGUsIGFTb3VyY2VDb250ZW50KSB7XG4gICAgICB2YXIgc291cmNlID0gYVNvdXJjZUZpbGU7XG4gICAgICBpZiAodGhpcy5fc291cmNlUm9vdCkge1xuICAgICAgICBzb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHRoaXMuX3NvdXJjZVJvb3QsIHNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChhU291cmNlQ29udGVudCAhPT0gbnVsbCkge1xuICAgICAgICAvLyBBZGQgdGhlIHNvdXJjZSBjb250ZW50IHRvIHRoZSBfc291cmNlc0NvbnRlbnRzIG1hcC5cbiAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IF9zb3VyY2VzQ29udGVudHMgbWFwIGlmIHRoZSBwcm9wZXJ0eSBpcyBudWxsLlxuICAgICAgICBpZiAoIXRoaXMuX3NvdXJjZXNDb250ZW50cykge1xuICAgICAgICAgIHRoaXMuX3NvdXJjZXNDb250ZW50cyA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3NvdXJjZXNDb250ZW50c1t1dGlsLnRvU2V0U3RyaW5nKHNvdXJjZSldID0gYVNvdXJjZUNvbnRlbnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBSZW1vdmUgdGhlIHNvdXJjZSBmaWxlIGZyb20gdGhlIF9zb3VyY2VzQ29udGVudHMgbWFwLlxuICAgICAgICAvLyBJZiB0aGUgX3NvdXJjZXNDb250ZW50cyBtYXAgaXMgZW1wdHksIHNldCB0aGUgcHJvcGVydHkgdG8gbnVsbC5cbiAgICAgICAgZGVsZXRlIHRoaXMuX3NvdXJjZXNDb250ZW50c1t1dGlsLnRvU2V0U3RyaW5nKHNvdXJjZSldO1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5fc291cmNlc0NvbnRlbnRzKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aGlzLl9zb3VyY2VzQ29udGVudHMgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAvKipcbiAgICogQXBwbGllcyB0aGUgbWFwcGluZ3Mgb2YgYSBzdWItc291cmNlLW1hcCBmb3IgYSBzcGVjaWZpYyBzb3VyY2UgZmlsZSB0byB0aGVcbiAgICogc291cmNlIG1hcCBiZWluZyBnZW5lcmF0ZWQuIEVhY2ggbWFwcGluZyB0byB0aGUgc3VwcGxpZWQgc291cmNlIGZpbGUgaXNcbiAgICogcmV3cml0dGVuIHVzaW5nIHRoZSBzdXBwbGllZCBzb3VyY2UgbWFwLiBOb3RlOiBUaGUgcmVzb2x1dGlvbiBmb3IgdGhlXG4gICAqIHJlc3VsdGluZyBtYXBwaW5ncyBpcyB0aGUgbWluaW1pdW0gb2YgdGhpcyBtYXAgYW5kIHRoZSBzdXBwbGllZCBtYXAuXG4gICAqXG4gICAqIEBwYXJhbSBhU291cmNlTWFwQ29uc3VtZXIgVGhlIHNvdXJjZSBtYXAgdG8gYmUgYXBwbGllZC5cbiAgICogQHBhcmFtIGFTb3VyY2VGaWxlIE9wdGlvbmFsLiBUaGUgZmlsZW5hbWUgb2YgdGhlIHNvdXJjZSBmaWxlLlxuICAgKiAgICAgICAgSWYgb21pdHRlZCwgU291cmNlTWFwQ29uc3VtZXIncyBmaWxlIHByb3BlcnR5IHdpbGwgYmUgdXNlZC5cbiAgICogQHBhcmFtIGFTb3VyY2VNYXBQYXRoIE9wdGlvbmFsLiBUaGUgZGlybmFtZSBvZiB0aGUgcGF0aCB0byB0aGUgc291cmNlIG1hcFxuICAgKiAgICAgICAgdG8gYmUgYXBwbGllZC4gSWYgcmVsYXRpdmUsIGl0IGlzIHJlbGF0aXZlIHRvIHRoZSBTb3VyY2VNYXBDb25zdW1lci5cbiAgICogICAgICAgIFRoaXMgcGFyYW1ldGVyIGlzIG5lZWRlZCB3aGVuIHRoZSB0d28gc291cmNlIG1hcHMgYXJlbid0IGluIHRoZSBzYW1lXG4gICAqICAgICAgICBkaXJlY3RvcnksIGFuZCB0aGUgc291cmNlIG1hcCB0byBiZSBhcHBsaWVkIGNvbnRhaW5zIHJlbGF0aXZlIHNvdXJjZVxuICAgKiAgICAgICAgcGF0aHMuIElmIHNvLCB0aG9zZSByZWxhdGl2ZSBzb3VyY2UgcGF0aHMgbmVlZCB0byBiZSByZXdyaXR0ZW5cbiAgICogICAgICAgIHJlbGF0aXZlIHRvIHRoZSBTb3VyY2VNYXBHZW5lcmF0b3IuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLmFwcGx5U291cmNlTWFwID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfYXBwbHlTb3VyY2VNYXAoYVNvdXJjZU1hcENvbnN1bWVyLCBhU291cmNlRmlsZSwgYVNvdXJjZU1hcFBhdGgpIHtcbiAgICAgIC8vIElmIGFTb3VyY2VGaWxlIGlzIG9taXR0ZWQsIHdlIHdpbGwgdXNlIHRoZSBmaWxlIHByb3BlcnR5IG9mIHRoZSBTb3VyY2VNYXBcbiAgICAgIGlmICghYVNvdXJjZUZpbGUpIHtcbiAgICAgICAgaWYgKCFhU291cmNlTWFwQ29uc3VtZXIuZmlsZSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICdTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLmFwcGx5U291cmNlTWFwIHJlcXVpcmVzIGVpdGhlciBhbiBleHBsaWNpdCBzb3VyY2UgZmlsZSwgJyArXG4gICAgICAgICAgICAnb3IgdGhlIHNvdXJjZSBtYXBcXCdzIFwiZmlsZVwiIHByb3BlcnR5LiBCb3RoIHdlcmUgb21pdHRlZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBhU291cmNlRmlsZSA9IGFTb3VyY2VNYXBDb25zdW1lci5maWxlO1xuICAgICAgfVxuICAgICAgdmFyIHNvdXJjZVJvb3QgPSB0aGlzLl9zb3VyY2VSb290O1xuICAgICAgLy8gTWFrZSBcImFTb3VyY2VGaWxlXCIgcmVsYXRpdmUgaWYgYW4gYWJzb2x1dGUgVXJsIGlzIHBhc3NlZC5cbiAgICAgIGlmIChzb3VyY2VSb290KSB7XG4gICAgICAgIGFTb3VyY2VGaWxlID0gdXRpbC5yZWxhdGl2ZShzb3VyY2VSb290LCBhU291cmNlRmlsZSk7XG4gICAgICB9XG4gICAgICAvLyBBcHBseWluZyB0aGUgU291cmNlTWFwIGNhbiBhZGQgYW5kIHJlbW92ZSBpdGVtcyBmcm9tIHRoZSBzb3VyY2VzIGFuZFxuICAgICAgLy8gdGhlIG5hbWVzIGFycmF5LlxuICAgICAgdmFyIG5ld1NvdXJjZXMgPSBuZXcgQXJyYXlTZXQoKTtcbiAgICAgIHZhciBuZXdOYW1lcyA9IG5ldyBBcnJheVNldCgpO1xuXG4gICAgICAvLyBGaW5kIG1hcHBpbmdzIGZvciB0aGUgXCJhU291cmNlRmlsZVwiXG4gICAgICB0aGlzLl9tYXBwaW5ncy5mb3JFYWNoKGZ1bmN0aW9uIChtYXBwaW5nKSB7XG4gICAgICAgIGlmIChtYXBwaW5nLnNvdXJjZSA9PT0gYVNvdXJjZUZpbGUgJiYgbWFwcGluZy5vcmlnaW5hbExpbmUpIHtcbiAgICAgICAgICAvLyBDaGVjayBpZiBpdCBjYW4gYmUgbWFwcGVkIGJ5IHRoZSBzb3VyY2UgbWFwLCB0aGVuIHVwZGF0ZSB0aGUgbWFwcGluZy5cbiAgICAgICAgICB2YXIgb3JpZ2luYWwgPSBhU291cmNlTWFwQ29uc3VtZXIub3JpZ2luYWxQb3NpdGlvbkZvcih7XG4gICAgICAgICAgICBsaW5lOiBtYXBwaW5nLm9yaWdpbmFsTGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogbWFwcGluZy5vcmlnaW5hbENvbHVtblxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChvcmlnaW5hbC5zb3VyY2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgIC8vIENvcHkgbWFwcGluZ1xuICAgICAgICAgICAgbWFwcGluZy5zb3VyY2UgPSBvcmlnaW5hbC5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoYVNvdXJjZU1hcFBhdGgpIHtcbiAgICAgICAgICAgICAgbWFwcGluZy5zb3VyY2UgPSB1dGlsLmpvaW4oYVNvdXJjZU1hcFBhdGgsIG1hcHBpbmcuc291cmNlKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNvdXJjZVJvb3QpIHtcbiAgICAgICAgICAgICAgbWFwcGluZy5zb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHNvdXJjZVJvb3QsIG1hcHBpbmcuc291cmNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxMaW5lID0gb3JpZ2luYWwubGluZTtcbiAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxDb2x1bW4gPSBvcmlnaW5hbC5jb2x1bW47XG4gICAgICAgICAgICBpZiAob3JpZ2luYWwubmFtZSAhPT0gbnVsbCAmJiBtYXBwaW5nLm5hbWUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgLy8gT25seSB1c2UgdGhlIGlkZW50aWZpZXIgbmFtZSBpZiBpdCdzIGFuIGlkZW50aWZpZXJcbiAgICAgICAgICAgICAgLy8gaW4gYm90aCBTb3VyY2VNYXBzXG4gICAgICAgICAgICAgIG1hcHBpbmcubmFtZSA9IG9yaWdpbmFsLm5hbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNvdXJjZSA9IG1hcHBpbmcuc291cmNlO1xuICAgICAgICBpZiAoc291cmNlICYmICFuZXdTb3VyY2VzLmhhcyhzb3VyY2UpKSB7XG4gICAgICAgICAgbmV3U291cmNlcy5hZGQoc291cmNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuYW1lID0gbWFwcGluZy5uYW1lO1xuICAgICAgICBpZiAobmFtZSAmJiAhbmV3TmFtZXMuaGFzKG5hbWUpKSB7XG4gICAgICAgICAgbmV3TmFtZXMuYWRkKG5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgIH0sIHRoaXMpO1xuICAgICAgdGhpcy5fc291cmNlcyA9IG5ld1NvdXJjZXM7XG4gICAgICB0aGlzLl9uYW1lcyA9IG5ld05hbWVzO1xuXG4gICAgICAvLyBDb3B5IHNvdXJjZXNDb250ZW50cyBvZiBhcHBsaWVkIG1hcC5cbiAgICAgIGFTb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzLmZvckVhY2goZnVuY3Rpb24gKHNvdXJjZUZpbGUpIHtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlQ29udGVudEZvcihzb3VyY2VGaWxlKTtcbiAgICAgICAgaWYgKGNvbnRlbnQpIHtcbiAgICAgICAgICBpZiAoc291cmNlUm9vdCkge1xuICAgICAgICAgICAgc291cmNlRmlsZSA9IHV0aWwucmVsYXRpdmUoc291cmNlUm9vdCwgc291cmNlRmlsZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuc2V0U291cmNlQ29udGVudChzb3VyY2VGaWxlLCBjb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSwgdGhpcyk7XG4gICAgfTtcblxuICAvKipcbiAgICogQSBtYXBwaW5nIGNhbiBoYXZlIG9uZSBvZiB0aGUgdGhyZWUgbGV2ZWxzIG9mIGRhdGE6XG4gICAqXG4gICAqICAgMS4gSnVzdCB0aGUgZ2VuZXJhdGVkIHBvc2l0aW9uLlxuICAgKiAgIDIuIFRoZSBHZW5lcmF0ZWQgcG9zaXRpb24sIG9yaWdpbmFsIHBvc2l0aW9uLCBhbmQgb3JpZ2luYWwgc291cmNlLlxuICAgKiAgIDMuIEdlbmVyYXRlZCBhbmQgb3JpZ2luYWwgcG9zaXRpb24sIG9yaWdpbmFsIHNvdXJjZSwgYXMgd2VsbCBhcyBhIG5hbWVcbiAgICogICAgICB0b2tlbi5cbiAgICpcbiAgICogVG8gbWFpbnRhaW4gY29uc2lzdGVuY3ksIHdlIHZhbGlkYXRlIHRoYXQgYW55IG5ldyBtYXBwaW5nIGJlaW5nIGFkZGVkIGZhbGxzXG4gICAqIGluIHRvIG9uZSBvZiB0aGVzZSBjYXRlZ29yaWVzLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5fdmFsaWRhdGVNYXBwaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfdmFsaWRhdGVNYXBwaW5nKGFHZW5lcmF0ZWQsIGFPcmlnaW5hbCwgYVNvdXJjZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFOYW1lKSB7XG4gICAgICBpZiAoYUdlbmVyYXRlZCAmJiAnbGluZScgaW4gYUdlbmVyYXRlZCAmJiAnY29sdW1uJyBpbiBhR2VuZXJhdGVkXG4gICAgICAgICAgJiYgYUdlbmVyYXRlZC5saW5lID4gMCAmJiBhR2VuZXJhdGVkLmNvbHVtbiA+PSAwXG4gICAgICAgICAgJiYgIWFPcmlnaW5hbCAmJiAhYVNvdXJjZSAmJiAhYU5hbWUpIHtcbiAgICAgICAgLy8gQ2FzZSAxLlxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBlbHNlIGlmIChhR2VuZXJhdGVkICYmICdsaW5lJyBpbiBhR2VuZXJhdGVkICYmICdjb2x1bW4nIGluIGFHZW5lcmF0ZWRcbiAgICAgICAgICAgICAgICYmIGFPcmlnaW5hbCAmJiAnbGluZScgaW4gYU9yaWdpbmFsICYmICdjb2x1bW4nIGluIGFPcmlnaW5hbFxuICAgICAgICAgICAgICAgJiYgYUdlbmVyYXRlZC5saW5lID4gMCAmJiBhR2VuZXJhdGVkLmNvbHVtbiA+PSAwXG4gICAgICAgICAgICAgICAmJiBhT3JpZ2luYWwubGluZSA+IDAgJiYgYU9yaWdpbmFsLmNvbHVtbiA+PSAwXG4gICAgICAgICAgICAgICAmJiBhU291cmNlKSB7XG4gICAgICAgIC8vIENhc2VzIDIgYW5kIDMuXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbWFwcGluZzogJyArIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBnZW5lcmF0ZWQ6IGFHZW5lcmF0ZWQsXG4gICAgICAgICAgc291cmNlOiBhU291cmNlLFxuICAgICAgICAgIG9yaWdpbmFsOiBhT3JpZ2luYWwsXG4gICAgICAgICAgbmFtZTogYU5hbWVcbiAgICAgICAgfSkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgLyoqXG4gICAqIFNlcmlhbGl6ZSB0aGUgYWNjdW11bGF0ZWQgbWFwcGluZ3MgaW4gdG8gdGhlIHN0cmVhbSBvZiBiYXNlIDY0IFZMUXNcbiAgICogc3BlY2lmaWVkIGJ5IHRoZSBzb3VyY2UgbWFwIGZvcm1hdC5cbiAgICovXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX3NlcmlhbGl6ZU1hcHBpbmdzID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3Jfc2VyaWFsaXplTWFwcGluZ3MoKSB7XG4gICAgICB2YXIgcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gPSAwO1xuICAgICAgdmFyIHByZXZpb3VzR2VuZXJhdGVkTGluZSA9IDE7XG4gICAgICB2YXIgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNPcmlnaW5hbExpbmUgPSAwO1xuICAgICAgdmFyIHByZXZpb3VzTmFtZSA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNTb3VyY2UgPSAwO1xuICAgICAgdmFyIHJlc3VsdCA9ICcnO1xuICAgICAgdmFyIG1hcHBpbmc7XG5cbiAgICAgIC8vIFRoZSBtYXBwaW5ncyBtdXN0IGJlIGd1YXJhbnRlZWQgdG8gYmUgaW4gc29ydGVkIG9yZGVyIGJlZm9yZSB3ZSBzdGFydFxuICAgICAgLy8gc2VyaWFsaXppbmcgdGhlbSBvciBlbHNlIHRoZSBnZW5lcmF0ZWQgbGluZSBudW1iZXJzICh3aGljaCBhcmUgZGVmaW5lZFxuICAgICAgLy8gdmlhIHRoZSAnOycgc2VwYXJhdG9ycykgd2lsbCBiZSBhbGwgbWVzc2VkIHVwLiBOb3RlOiBpdCBtaWdodCBiZSBtb3JlXG4gICAgICAvLyBwZXJmb3JtYW50IHRvIG1haW50YWluIHRoZSBzb3J0aW5nIGFzIHdlIGluc2VydCB0aGVtLCByYXRoZXIgdGhhbiBhcyB3ZVxuICAgICAgLy8gc2VyaWFsaXplIHRoZW0sIGJ1dCB0aGUgYmlnIE8gaXMgdGhlIHNhbWUgZWl0aGVyIHdheS5cbiAgICAgIHRoaXMuX21hcHBpbmdzLnNvcnQodXRpbC5jb21wYXJlQnlHZW5lcmF0ZWRQb3NpdGlvbnMpO1xuXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5fbWFwcGluZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgbWFwcGluZyA9IHRoaXMuX21hcHBpbmdzW2ldO1xuXG4gICAgICAgIGlmIChtYXBwaW5nLmdlbmVyYXRlZExpbmUgIT09IHByZXZpb3VzR2VuZXJhdGVkTGluZSkge1xuICAgICAgICAgIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgICAgICB3aGlsZSAobWFwcGluZy5nZW5lcmF0ZWRMaW5lICE9PSBwcmV2aW91c0dlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICAgIHJlc3VsdCArPSAnOyc7XG4gICAgICAgICAgICBwcmV2aW91c0dlbmVyYXRlZExpbmUrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICBpZiAoIXV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKG1hcHBpbmcsIHRoaXMuX21hcHBpbmdzW2kgLSAxXSkpIHtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQgKz0gJywnO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdCArPSBiYXNlNjRWTFEuZW5jb2RlKG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4pO1xuICAgICAgICBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiA9IG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uO1xuXG4gICAgICAgIGlmIChtYXBwaW5nLnNvdXJjZSkge1xuICAgICAgICAgIHJlc3VsdCArPSBiYXNlNjRWTFEuZW5jb2RlKHRoaXMuX3NvdXJjZXMuaW5kZXhPZihtYXBwaW5nLnNvdXJjZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtIHByZXZpb3VzU291cmNlKTtcbiAgICAgICAgICBwcmV2aW91c1NvdXJjZSA9IHRoaXMuX3NvdXJjZXMuaW5kZXhPZihtYXBwaW5nLnNvdXJjZSk7XG5cbiAgICAgICAgICAvLyBsaW5lcyBhcmUgc3RvcmVkIDAtYmFzZWQgaW4gU291cmNlTWFwIHNwZWMgdmVyc2lvbiAzXG4gICAgICAgICAgcmVzdWx0ICs9IGJhc2U2NFZMUS5lbmNvZGUobWFwcGluZy5vcmlnaW5hbExpbmUgLSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSBwcmV2aW91c09yaWdpbmFsTGluZSk7XG4gICAgICAgICAgcHJldmlvdXNPcmlnaW5hbExpbmUgPSBtYXBwaW5nLm9yaWdpbmFsTGluZSAtIDE7XG5cbiAgICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZShtYXBwaW5nLm9yaWdpbmFsQ29sdW1uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSBwcmV2aW91c09yaWdpbmFsQ29sdW1uKTtcbiAgICAgICAgICBwcmV2aW91c09yaWdpbmFsQ29sdW1uID0gbWFwcGluZy5vcmlnaW5hbENvbHVtbjtcblxuICAgICAgICAgIGlmIChtYXBwaW5nLm5hbWUpIHtcbiAgICAgICAgICAgIHJlc3VsdCArPSBiYXNlNjRWTFEuZW5jb2RlKHRoaXMuX25hbWVzLmluZGV4T2YobWFwcGluZy5uYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSBwcmV2aW91c05hbWUpO1xuICAgICAgICAgICAgcHJldmlvdXNOYW1lID0gdGhpcy5fbmFtZXMuaW5kZXhPZihtYXBwaW5nLm5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG5cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5fZ2VuZXJhdGVTb3VyY2VzQ29udGVudCA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX2dlbmVyYXRlU291cmNlc0NvbnRlbnQoYVNvdXJjZXMsIGFTb3VyY2VSb290KSB7XG4gICAgICByZXR1cm4gYVNvdXJjZXMubWFwKGZ1bmN0aW9uIChzb3VyY2UpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9zb3VyY2VzQ29udGVudHMpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYVNvdXJjZVJvb3QpIHtcbiAgICAgICAgICBzb3VyY2UgPSB1dGlsLnJlbGF0aXZlKGFTb3VyY2VSb290LCBzb3VyY2UpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBrZXkgPSB1dGlsLnRvU2V0U3RyaW5nKHNvdXJjZSk7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5fc291cmNlc0NvbnRlbnRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtleSlcbiAgICAgICAgICA/IHRoaXMuX3NvdXJjZXNDb250ZW50c1trZXldXG4gICAgICAgICAgOiBudWxsO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfTtcblxuICAvKipcbiAgICogRXh0ZXJuYWxpemUgdGhlIHNvdXJjZSBtYXAuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLnRvSlNPTiA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3RvSlNPTigpIHtcbiAgICAgIHZhciBtYXAgPSB7XG4gICAgICAgIHZlcnNpb246IHRoaXMuX3ZlcnNpb24sXG4gICAgICAgIGZpbGU6IHRoaXMuX2ZpbGUsXG4gICAgICAgIHNvdXJjZXM6IHRoaXMuX3NvdXJjZXMudG9BcnJheSgpLFxuICAgICAgICBuYW1lczogdGhpcy5fbmFtZXMudG9BcnJheSgpLFxuICAgICAgICBtYXBwaW5nczogdGhpcy5fc2VyaWFsaXplTWFwcGluZ3MoKVxuICAgICAgfTtcbiAgICAgIGlmICh0aGlzLl9zb3VyY2VSb290KSB7XG4gICAgICAgIG1hcC5zb3VyY2VSb290ID0gdGhpcy5fc291cmNlUm9vdDtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLl9zb3VyY2VzQ29udGVudHMpIHtcbiAgICAgICAgbWFwLnNvdXJjZXNDb250ZW50ID0gdGhpcy5fZ2VuZXJhdGVTb3VyY2VzQ29udGVudChtYXAuc291cmNlcywgbWFwLnNvdXJjZVJvb3QpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWFwO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFJlbmRlciB0aGUgc291cmNlIG1hcCBiZWluZyBnZW5lcmF0ZWQgdG8gYSBzdHJpbmcuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLnRvU3RyaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfdG9TdHJpbmcoKSB7XG4gICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodGhpcyk7XG4gICAgfTtcblxuICBleHBvcnRzLlNvdXJjZU1hcEdlbmVyYXRvciA9IFNvdXJjZU1hcEdlbmVyYXRvcjtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciBTb3VyY2VNYXBHZW5lcmF0b3IgPSByZXF1aXJlKCcuL3NvdXJjZS1tYXAtZ2VuZXJhdG9yJykuU291cmNlTWFwR2VuZXJhdG9yO1xuICB2YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xuXG4gIC8qKlxuICAgKiBTb3VyY2VOb2RlcyBwcm92aWRlIGEgd2F5IHRvIGFic3RyYWN0IG92ZXIgaW50ZXJwb2xhdGluZy9jb25jYXRlbmF0aW5nXG4gICAqIHNuaXBwZXRzIG9mIGdlbmVyYXRlZCBKYXZhU2NyaXB0IHNvdXJjZSBjb2RlIHdoaWxlIG1haW50YWluaW5nIHRoZSBsaW5lIGFuZFxuICAgKiBjb2x1bW4gaW5mb3JtYXRpb24gYXNzb2NpYXRlZCB3aXRoIHRoZSBvcmlnaW5hbCBzb3VyY2UgY29kZS5cbiAgICpcbiAgICogQHBhcmFtIGFMaW5lIFRoZSBvcmlnaW5hbCBsaW5lIG51bWJlci5cbiAgICogQHBhcmFtIGFDb2x1bW4gVGhlIG9yaWdpbmFsIGNvbHVtbiBudW1iZXIuXG4gICAqIEBwYXJhbSBhU291cmNlIFRoZSBvcmlnaW5hbCBzb3VyY2UncyBmaWxlbmFtZS5cbiAgICogQHBhcmFtIGFDaHVua3MgT3B0aW9uYWwuIEFuIGFycmF5IG9mIHN0cmluZ3Mgd2hpY2ggYXJlIHNuaXBwZXRzIG9mXG4gICAqICAgICAgICBnZW5lcmF0ZWQgSlMsIG9yIG90aGVyIFNvdXJjZU5vZGVzLlxuICAgKiBAcGFyYW0gYU5hbWUgVGhlIG9yaWdpbmFsIGlkZW50aWZpZXIuXG4gICAqL1xuICBmdW5jdGlvbiBTb3VyY2VOb2RlKGFMaW5lLCBhQ29sdW1uLCBhU291cmNlLCBhQ2h1bmtzLCBhTmFtZSkge1xuICAgIHRoaXMuY2hpbGRyZW4gPSBbXTtcbiAgICB0aGlzLnNvdXJjZUNvbnRlbnRzID0ge307XG4gICAgdGhpcy5saW5lID0gYUxpbmUgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhTGluZTtcbiAgICB0aGlzLmNvbHVtbiA9IGFDb2x1bW4gPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhQ29sdW1uO1xuICAgIHRoaXMuc291cmNlID0gYVNvdXJjZSA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IGFTb3VyY2U7XG4gICAgdGhpcy5uYW1lID0gYU5hbWUgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhTmFtZTtcbiAgICBpZiAoYUNodW5rcyAhPSBudWxsKSB0aGlzLmFkZChhQ2h1bmtzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgU291cmNlTm9kZSBmcm9tIGdlbmVyYXRlZCBjb2RlIGFuZCBhIFNvdXJjZU1hcENvbnN1bWVyLlxuICAgKlxuICAgKiBAcGFyYW0gYUdlbmVyYXRlZENvZGUgVGhlIGdlbmVyYXRlZCBjb2RlXG4gICAqIEBwYXJhbSBhU291cmNlTWFwQ29uc3VtZXIgVGhlIFNvdXJjZU1hcCBmb3IgdGhlIGdlbmVyYXRlZCBjb2RlXG4gICAqL1xuICBTb3VyY2VOb2RlLmZyb21TdHJpbmdXaXRoU291cmNlTWFwID1cbiAgICBmdW5jdGlvbiBTb3VyY2VOb2RlX2Zyb21TdHJpbmdXaXRoU291cmNlTWFwKGFHZW5lcmF0ZWRDb2RlLCBhU291cmNlTWFwQ29uc3VtZXIpIHtcbiAgICAgIC8vIFRoZSBTb3VyY2VOb2RlIHdlIHdhbnQgdG8gZmlsbCB3aXRoIHRoZSBnZW5lcmF0ZWQgY29kZVxuICAgICAgLy8gYW5kIHRoZSBTb3VyY2VNYXBcbiAgICAgIHZhciBub2RlID0gbmV3IFNvdXJjZU5vZGUoKTtcblxuICAgICAgLy8gVGhlIGdlbmVyYXRlZCBjb2RlXG4gICAgICAvLyBQcm9jZXNzZWQgZnJhZ21lbnRzIGFyZSByZW1vdmVkIGZyb20gdGhpcyBhcnJheS5cbiAgICAgIHZhciByZW1haW5pbmdMaW5lcyA9IGFHZW5lcmF0ZWRDb2RlLnNwbGl0KCdcXG4nKTtcblxuICAgICAgLy8gV2UgbmVlZCB0byByZW1lbWJlciB0aGUgcG9zaXRpb24gb2YgXCJyZW1haW5pbmdMaW5lc1wiXG4gICAgICB2YXIgbGFzdEdlbmVyYXRlZExpbmUgPSAxLCBsYXN0R2VuZXJhdGVkQ29sdW1uID0gMDtcblxuICAgICAgLy8gVGhlIGdlbmVyYXRlIFNvdXJjZU5vZGVzIHdlIG5lZWQgYSBjb2RlIHJhbmdlLlxuICAgICAgLy8gVG8gZXh0cmFjdCBpdCBjdXJyZW50IGFuZCBsYXN0IG1hcHBpbmcgaXMgdXNlZC5cbiAgICAgIC8vIEhlcmUgd2Ugc3RvcmUgdGhlIGxhc3QgbWFwcGluZy5cbiAgICAgIHZhciBsYXN0TWFwcGluZyA9IG51bGw7XG5cbiAgICAgIGFTb3VyY2VNYXBDb25zdW1lci5lYWNoTWFwcGluZyhmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICBpZiAobGFzdE1hcHBpbmcgIT09IG51bGwpIHtcbiAgICAgICAgICAvLyBXZSBhZGQgdGhlIGNvZGUgZnJvbSBcImxhc3RNYXBwaW5nXCIgdG8gXCJtYXBwaW5nXCI6XG4gICAgICAgICAgLy8gRmlyc3QgY2hlY2sgaWYgdGhlcmUgaXMgYSBuZXcgbGluZSBpbiBiZXR3ZWVuLlxuICAgICAgICAgIGlmIChsYXN0R2VuZXJhdGVkTGluZSA8IG1hcHBpbmcuZ2VuZXJhdGVkTGluZSkge1xuICAgICAgICAgICAgdmFyIGNvZGUgPSBcIlwiO1xuICAgICAgICAgICAgLy8gQXNzb2NpYXRlIGZpcnN0IGxpbmUgd2l0aCBcImxhc3RNYXBwaW5nXCJcbiAgICAgICAgICAgIGFkZE1hcHBpbmdXaXRoQ29kZShsYXN0TWFwcGluZywgcmVtYWluaW5nTGluZXMuc2hpZnQoKSArIFwiXFxuXCIpO1xuICAgICAgICAgICAgbGFzdEdlbmVyYXRlZExpbmUrKztcbiAgICAgICAgICAgIGxhc3RHZW5lcmF0ZWRDb2x1bW4gPSAwO1xuICAgICAgICAgICAgLy8gVGhlIHJlbWFpbmluZyBjb2RlIGlzIGFkZGVkIHdpdGhvdXQgbWFwcGluZ1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBUaGVyZSBpcyBubyBuZXcgbGluZSBpbiBiZXR3ZWVuLlxuICAgICAgICAgICAgLy8gQXNzb2NpYXRlIHRoZSBjb2RlIGJldHdlZW4gXCJsYXN0R2VuZXJhdGVkQ29sdW1uXCIgYW5kXG4gICAgICAgICAgICAvLyBcIm1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uXCIgd2l0aCBcImxhc3RNYXBwaW5nXCJcbiAgICAgICAgICAgIHZhciBuZXh0TGluZSA9IHJlbWFpbmluZ0xpbmVzWzBdO1xuICAgICAgICAgICAgdmFyIGNvZGUgPSBuZXh0TGluZS5zdWJzdHIoMCwgbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4gLVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdEdlbmVyYXRlZENvbHVtbik7XG4gICAgICAgICAgICByZW1haW5pbmdMaW5lc1swXSA9IG5leHRMaW5lLnN1YnN0cihtYXBwaW5nLmdlbmVyYXRlZENvbHVtbiAtXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0R2VuZXJhdGVkQ29sdW1uKTtcbiAgICAgICAgICAgIGxhc3RHZW5lcmF0ZWRDb2x1bW4gPSBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbjtcbiAgICAgICAgICAgIGFkZE1hcHBpbmdXaXRoQ29kZShsYXN0TWFwcGluZywgY29kZSk7XG4gICAgICAgICAgICAvLyBObyBtb3JlIHJlbWFpbmluZyBjb2RlLCBjb250aW51ZVxuICAgICAgICAgICAgbGFzdE1hcHBpbmcgPSBtYXBwaW5nO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBhZGQgdGhlIGdlbmVyYXRlZCBjb2RlIHVudGlsIHRoZSBmaXJzdCBtYXBwaW5nXG4gICAgICAgIC8vIHRvIHRoZSBTb3VyY2VOb2RlIHdpdGhvdXQgYW55IG1hcHBpbmcuXG4gICAgICAgIC8vIEVhY2ggbGluZSBpcyBhZGRlZCBhcyBzZXBhcmF0ZSBzdHJpbmcuXG4gICAgICAgIHdoaWxlIChsYXN0R2VuZXJhdGVkTGluZSA8IG1hcHBpbmcuZ2VuZXJhdGVkTGluZSkge1xuICAgICAgICAgIG5vZGUuYWRkKHJlbWFpbmluZ0xpbmVzLnNoaWZ0KCkgKyBcIlxcblwiKTtcbiAgICAgICAgICBsYXN0R2VuZXJhdGVkTGluZSsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsYXN0R2VuZXJhdGVkQ29sdW1uIDwgbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4pIHtcbiAgICAgICAgICB2YXIgbmV4dExpbmUgPSByZW1haW5pbmdMaW5lc1swXTtcbiAgICAgICAgICBub2RlLmFkZChuZXh0TGluZS5zdWJzdHIoMCwgbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4pKTtcbiAgICAgICAgICByZW1haW5pbmdMaW5lc1swXSA9IG5leHRMaW5lLnN1YnN0cihtYXBwaW5nLmdlbmVyYXRlZENvbHVtbik7XG4gICAgICAgICAgbGFzdEdlbmVyYXRlZENvbHVtbiA9IG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uO1xuICAgICAgICB9XG4gICAgICAgIGxhc3RNYXBwaW5nID0gbWFwcGluZztcbiAgICAgIH0sIHRoaXMpO1xuICAgICAgLy8gV2UgaGF2ZSBwcm9jZXNzZWQgYWxsIG1hcHBpbmdzLlxuICAgICAgaWYgKHJlbWFpbmluZ0xpbmVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKGxhc3RNYXBwaW5nKSB7XG4gICAgICAgICAgLy8gQXNzb2NpYXRlIHRoZSByZW1haW5pbmcgY29kZSBpbiB0aGUgY3VycmVudCBsaW5lIHdpdGggXCJsYXN0TWFwcGluZ1wiXG4gICAgICAgICAgdmFyIGxhc3RMaW5lID0gcmVtYWluaW5nTGluZXMuc2hpZnQoKTtcbiAgICAgICAgICBpZiAocmVtYWluaW5nTGluZXMubGVuZ3RoID4gMCkgbGFzdExpbmUgKz0gXCJcXG5cIjtcbiAgICAgICAgICBhZGRNYXBwaW5nV2l0aENvZGUobGFzdE1hcHBpbmcsIGxhc3RMaW5lKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBhbmQgYWRkIHRoZSByZW1haW5pbmcgbGluZXMgd2l0aG91dCBhbnkgbWFwcGluZ1xuICAgICAgICBub2RlLmFkZChyZW1haW5pbmdMaW5lcy5qb2luKFwiXFxuXCIpKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ29weSBzb3VyY2VzQ29udGVudCBpbnRvIFNvdXJjZU5vZGVcbiAgICAgIGFTb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzLmZvckVhY2goZnVuY3Rpb24gKHNvdXJjZUZpbGUpIHtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlQ29udGVudEZvcihzb3VyY2VGaWxlKTtcbiAgICAgICAgaWYgKGNvbnRlbnQpIHtcbiAgICAgICAgICBub2RlLnNldFNvdXJjZUNvbnRlbnQoc291cmNlRmlsZSwgY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gbm9kZTtcblxuICAgICAgZnVuY3Rpb24gYWRkTWFwcGluZ1dpdGhDb2RlKG1hcHBpbmcsIGNvZGUpIHtcbiAgICAgICAgaWYgKG1hcHBpbmcgPT09IG51bGwgfHwgbWFwcGluZy5zb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIG5vZGUuYWRkKGNvZGUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5vZGUuYWRkKG5ldyBTb3VyY2VOb2RlKG1hcHBpbmcub3JpZ2luYWxMaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxDb2x1bW4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwcGluZy5zb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXBwaW5nLm5hbWUpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgLyoqXG4gICAqIEFkZCBhIGNodW5rIG9mIGdlbmVyYXRlZCBKUyB0byB0aGlzIHNvdXJjZSBub2RlLlxuICAgKlxuICAgKiBAcGFyYW0gYUNodW5rIEEgc3RyaW5nIHNuaXBwZXQgb2YgZ2VuZXJhdGVkIEpTIGNvZGUsIGFub3RoZXIgaW5zdGFuY2Ugb2ZcbiAgICogICAgICAgIFNvdXJjZU5vZGUsIG9yIGFuIGFycmF5IHdoZXJlIGVhY2ggbWVtYmVyIGlzIG9uZSBvZiB0aG9zZSB0aGluZ3MuXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX2FkZChhQ2h1bmspIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShhQ2h1bmspKSB7XG4gICAgICBhQ2h1bmsuZm9yRWFjaChmdW5jdGlvbiAoY2h1bmspIHtcbiAgICAgICAgdGhpcy5hZGQoY2h1bmspO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGFDaHVuayBpbnN0YW5jZW9mIFNvdXJjZU5vZGUgfHwgdHlwZW9mIGFDaHVuayA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgaWYgKGFDaHVuaykge1xuICAgICAgICB0aGlzLmNoaWxkcmVuLnB1c2goYUNodW5rKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICBcIkV4cGVjdGVkIGEgU291cmNlTm9kZSwgc3RyaW5nLCBvciBhbiBhcnJheSBvZiBTb3VyY2VOb2RlcyBhbmQgc3RyaW5ncy4gR290IFwiICsgYUNodW5rXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvKipcbiAgICogQWRkIGEgY2h1bmsgb2YgZ2VuZXJhdGVkIEpTIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhpcyBzb3VyY2Ugbm9kZS5cbiAgICpcbiAgICogQHBhcmFtIGFDaHVuayBBIHN0cmluZyBzbmlwcGV0IG9mIGdlbmVyYXRlZCBKUyBjb2RlLCBhbm90aGVyIGluc3RhbmNlIG9mXG4gICAqICAgICAgICBTb3VyY2VOb2RlLCBvciBhbiBhcnJheSB3aGVyZSBlYWNoIG1lbWJlciBpcyBvbmUgb2YgdGhvc2UgdGhpbmdzLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUucHJlcGVuZCA9IGZ1bmN0aW9uIFNvdXJjZU5vZGVfcHJlcGVuZChhQ2h1bmspIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShhQ2h1bmspKSB7XG4gICAgICBmb3IgKHZhciBpID0gYUNodW5rLmxlbmd0aC0xOyBpID49IDA7IGktLSkge1xuICAgICAgICB0aGlzLnByZXBlbmQoYUNodW5rW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoYUNodW5rIGluc3RhbmNlb2YgU291cmNlTm9kZSB8fCB0eXBlb2YgYUNodW5rID09PSBcInN0cmluZ1wiKSB7XG4gICAgICB0aGlzLmNoaWxkcmVuLnVuc2hpZnQoYUNodW5rKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICBcIkV4cGVjdGVkIGEgU291cmNlTm9kZSwgc3RyaW5nLCBvciBhbiBhcnJheSBvZiBTb3VyY2VOb2RlcyBhbmQgc3RyaW5ncy4gR290IFwiICsgYUNodW5rXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvKipcbiAgICogV2FsayBvdmVyIHRoZSB0cmVlIG9mIEpTIHNuaXBwZXRzIGluIHRoaXMgbm9kZSBhbmQgaXRzIGNoaWxkcmVuLiBUaGVcbiAgICogd2Fsa2luZyBmdW5jdGlvbiBpcyBjYWxsZWQgb25jZSBmb3IgZWFjaCBzbmlwcGV0IG9mIEpTIGFuZCBpcyBwYXNzZWQgdGhhdFxuICAgKiBzbmlwcGV0IGFuZCB0aGUgaXRzIG9yaWdpbmFsIGFzc29jaWF0ZWQgc291cmNlJ3MgbGluZS9jb2x1bW4gbG9jYXRpb24uXG4gICAqXG4gICAqIEBwYXJhbSBhRm4gVGhlIHRyYXZlcnNhbCBmdW5jdGlvbi5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLndhbGsgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3dhbGsoYUZuKSB7XG4gICAgdmFyIGNodW5rO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBjaHVuayA9IHRoaXMuY2hpbGRyZW5baV07XG4gICAgICBpZiAoY2h1bmsgaW5zdGFuY2VvZiBTb3VyY2VOb2RlKSB7XG4gICAgICAgIGNodW5rLndhbGsoYUZuKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBpZiAoY2h1bmsgIT09ICcnKSB7XG4gICAgICAgICAgYUZuKGNodW5rLCB7IHNvdXJjZTogdGhpcy5zb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmNvbHVtbixcbiAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogdGhpcy5uYW1lIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBMaWtlIGBTdHJpbmcucHJvdG90eXBlLmpvaW5gIGV4Y2VwdCBmb3IgU291cmNlTm9kZXMuIEluc2VydHMgYGFTdHJgIGJldHdlZW5cbiAgICogZWFjaCBvZiBgdGhpcy5jaGlsZHJlbmAuXG4gICAqXG4gICAqIEBwYXJhbSBhU2VwIFRoZSBzZXBhcmF0b3IuXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS5qb2luID0gZnVuY3Rpb24gU291cmNlTm9kZV9qb2luKGFTZXApIHtcbiAgICB2YXIgbmV3Q2hpbGRyZW47XG4gICAgdmFyIGk7XG4gICAgdmFyIGxlbiA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuICAgIGlmIChsZW4gPiAwKSB7XG4gICAgICBuZXdDaGlsZHJlbiA9IFtdO1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbi0xOyBpKyspIHtcbiAgICAgICAgbmV3Q2hpbGRyZW4ucHVzaCh0aGlzLmNoaWxkcmVuW2ldKTtcbiAgICAgICAgbmV3Q2hpbGRyZW4ucHVzaChhU2VwKTtcbiAgICAgIH1cbiAgICAgIG5ld0NoaWxkcmVuLnB1c2godGhpcy5jaGlsZHJlbltpXSk7XG4gICAgICB0aGlzLmNoaWxkcmVuID0gbmV3Q2hpbGRyZW47XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIC8qKlxuICAgKiBDYWxsIFN0cmluZy5wcm90b3R5cGUucmVwbGFjZSBvbiB0aGUgdmVyeSByaWdodC1tb3N0IHNvdXJjZSBzbmlwcGV0LiBVc2VmdWxcbiAgICogZm9yIHRyaW1taW5nIHdoaXRlc3BhY2UgZnJvbSB0aGUgZW5kIG9mIGEgc291cmNlIG5vZGUsIGV0Yy5cbiAgICpcbiAgICogQHBhcmFtIGFQYXR0ZXJuIFRoZSBwYXR0ZXJuIHRvIHJlcGxhY2UuXG4gICAqIEBwYXJhbSBhUmVwbGFjZW1lbnQgVGhlIHRoaW5nIHRvIHJlcGxhY2UgdGhlIHBhdHRlcm4gd2l0aC5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLnJlcGxhY2VSaWdodCA9IGZ1bmN0aW9uIFNvdXJjZU5vZGVfcmVwbGFjZVJpZ2h0KGFQYXR0ZXJuLCBhUmVwbGFjZW1lbnQpIHtcbiAgICB2YXIgbGFzdENoaWxkID0gdGhpcy5jaGlsZHJlblt0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDFdO1xuICAgIGlmIChsYXN0Q2hpbGQgaW5zdGFuY2VvZiBTb3VyY2VOb2RlKSB7XG4gICAgICBsYXN0Q2hpbGQucmVwbGFjZVJpZ2h0KGFQYXR0ZXJuLCBhUmVwbGFjZW1lbnQpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgbGFzdENoaWxkID09PSAnc3RyaW5nJykge1xuICAgICAgdGhpcy5jaGlsZHJlblt0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDFdID0gbGFzdENoaWxkLnJlcGxhY2UoYVBhdHRlcm4sIGFSZXBsYWNlbWVudCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhpcy5jaGlsZHJlbi5wdXNoKCcnLnJlcGxhY2UoYVBhdHRlcm4sIGFSZXBsYWNlbWVudCkpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvKipcbiAgICogU2V0IHRoZSBzb3VyY2UgY29udGVudCBmb3IgYSBzb3VyY2UgZmlsZS4gVGhpcyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBTb3VyY2VNYXBHZW5lcmF0b3JcbiAgICogaW4gdGhlIHNvdXJjZXNDb250ZW50IGZpZWxkLlxuICAgKlxuICAgKiBAcGFyYW0gYVNvdXJjZUZpbGUgVGhlIGZpbGVuYW1lIG9mIHRoZSBzb3VyY2UgZmlsZVxuICAgKiBAcGFyYW0gYVNvdXJjZUNvbnRlbnQgVGhlIGNvbnRlbnQgb2YgdGhlIHNvdXJjZSBmaWxlXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS5zZXRTb3VyY2VDb250ZW50ID1cbiAgICBmdW5jdGlvbiBTb3VyY2VOb2RlX3NldFNvdXJjZUNvbnRlbnQoYVNvdXJjZUZpbGUsIGFTb3VyY2VDb250ZW50KSB7XG4gICAgICB0aGlzLnNvdXJjZUNvbnRlbnRzW3V0aWwudG9TZXRTdHJpbmcoYVNvdXJjZUZpbGUpXSA9IGFTb3VyY2VDb250ZW50O1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFdhbGsgb3ZlciB0aGUgdHJlZSBvZiBTb3VyY2VOb2Rlcy4gVGhlIHdhbGtpbmcgZnVuY3Rpb24gaXMgY2FsbGVkIGZvciBlYWNoXG4gICAqIHNvdXJjZSBmaWxlIGNvbnRlbnQgYW5kIGlzIHBhc3NlZCB0aGUgZmlsZW5hbWUgYW5kIHNvdXJjZSBjb250ZW50LlxuICAgKlxuICAgKiBAcGFyYW0gYUZuIFRoZSB0cmF2ZXJzYWwgZnVuY3Rpb24uXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS53YWxrU291cmNlQ29udGVudHMgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU5vZGVfd2Fsa1NvdXJjZUNvbnRlbnRzKGFGbikge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKHRoaXMuY2hpbGRyZW5baV0gaW5zdGFuY2VvZiBTb3VyY2VOb2RlKSB7XG4gICAgICAgICAgdGhpcy5jaGlsZHJlbltpXS53YWxrU291cmNlQ29udGVudHMoYUZuKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgc291cmNlcyA9IE9iamVjdC5rZXlzKHRoaXMuc291cmNlQ29udGVudHMpO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHNvdXJjZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgYUZuKHV0aWwuZnJvbVNldFN0cmluZyhzb3VyY2VzW2ldKSwgdGhpcy5zb3VyY2VDb250ZW50c1tzb3VyY2VzW2ldXSk7XG4gICAgICB9XG4gICAgfTtcblxuICAvKipcbiAgICogUmV0dXJuIHRoZSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhpcyBzb3VyY2Ugbm9kZS4gV2Fsa3Mgb3ZlciB0aGUgdHJlZVxuICAgKiBhbmQgY29uY2F0ZW5hdGVzIGFsbCB0aGUgdmFyaW91cyBzbmlwcGV0cyB0b2dldGhlciB0byBvbmUgc3RyaW5nLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3RvU3RyaW5nKCkge1xuICAgIHZhciBzdHIgPSBcIlwiO1xuICAgIHRoaXMud2FsayhmdW5jdGlvbiAoY2h1bmspIHtcbiAgICAgIHN0ciArPSBjaHVuaztcbiAgICB9KTtcbiAgICByZXR1cm4gc3RyO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhpcyBzb3VyY2Ugbm9kZSBhbG9uZyB3aXRoIGEgc291cmNlXG4gICAqIG1hcC5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLnRvU3RyaW5nV2l0aFNvdXJjZU1hcCA9IGZ1bmN0aW9uIFNvdXJjZU5vZGVfdG9TdHJpbmdXaXRoU291cmNlTWFwKGFBcmdzKSB7XG4gICAgdmFyIGdlbmVyYXRlZCA9IHtcbiAgICAgIGNvZGU6IFwiXCIsXG4gICAgICBsaW5lOiAxLFxuICAgICAgY29sdW1uOiAwXG4gICAgfTtcbiAgICB2YXIgbWFwID0gbmV3IFNvdXJjZU1hcEdlbmVyYXRvcihhQXJncyk7XG4gICAgdmFyIHNvdXJjZU1hcHBpbmdBY3RpdmUgPSBmYWxzZTtcbiAgICB2YXIgbGFzdE9yaWdpbmFsU291cmNlID0gbnVsbDtcbiAgICB2YXIgbGFzdE9yaWdpbmFsTGluZSA9IG51bGw7XG4gICAgdmFyIGxhc3RPcmlnaW5hbENvbHVtbiA9IG51bGw7XG4gICAgdmFyIGxhc3RPcmlnaW5hbE5hbWUgPSBudWxsO1xuICAgIHRoaXMud2FsayhmdW5jdGlvbiAoY2h1bmssIG9yaWdpbmFsKSB7XG4gICAgICBnZW5lcmF0ZWQuY29kZSArPSBjaHVuaztcbiAgICAgIGlmIChvcmlnaW5hbC5zb3VyY2UgIT09IG51bGxcbiAgICAgICAgICAmJiBvcmlnaW5hbC5saW5lICE9PSBudWxsXG4gICAgICAgICAgJiYgb3JpZ2luYWwuY29sdW1uICE9PSBudWxsKSB7XG4gICAgICAgIGlmKGxhc3RPcmlnaW5hbFNvdXJjZSAhPT0gb3JpZ2luYWwuc291cmNlXG4gICAgICAgICAgIHx8IGxhc3RPcmlnaW5hbExpbmUgIT09IG9yaWdpbmFsLmxpbmVcbiAgICAgICAgICAgfHwgbGFzdE9yaWdpbmFsQ29sdW1uICE9PSBvcmlnaW5hbC5jb2x1bW5cbiAgICAgICAgICAgfHwgbGFzdE9yaWdpbmFsTmFtZSAhPT0gb3JpZ2luYWwubmFtZSkge1xuICAgICAgICAgIG1hcC5hZGRNYXBwaW5nKHtcbiAgICAgICAgICAgIHNvdXJjZTogb3JpZ2luYWwuc291cmNlLFxuICAgICAgICAgICAgb3JpZ2luYWw6IHtcbiAgICAgICAgICAgICAgbGluZTogb3JpZ2luYWwubGluZSxcbiAgICAgICAgICAgICAgY29sdW1uOiBvcmlnaW5hbC5jb2x1bW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZW5lcmF0ZWQ6IHtcbiAgICAgICAgICAgICAgbGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgICAgICAgIGNvbHVtbjogZ2VuZXJhdGVkLmNvbHVtblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG5hbWU6IG9yaWdpbmFsLm5hbWVcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0T3JpZ2luYWxTb3VyY2UgPSBvcmlnaW5hbC5zb3VyY2U7XG4gICAgICAgIGxhc3RPcmlnaW5hbExpbmUgPSBvcmlnaW5hbC5saW5lO1xuICAgICAgICBsYXN0T3JpZ2luYWxDb2x1bW4gPSBvcmlnaW5hbC5jb2x1bW47XG4gICAgICAgIGxhc3RPcmlnaW5hbE5hbWUgPSBvcmlnaW5hbC5uYW1lO1xuICAgICAgICBzb3VyY2VNYXBwaW5nQWN0aXZlID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoc291cmNlTWFwcGluZ0FjdGl2ZSkge1xuICAgICAgICBtYXAuYWRkTWFwcGluZyh7XG4gICAgICAgICAgZ2VuZXJhdGVkOiB7XG4gICAgICAgICAgICBsaW5lOiBnZW5lcmF0ZWQubGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogZ2VuZXJhdGVkLmNvbHVtblxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGxhc3RPcmlnaW5hbFNvdXJjZSA9IG51bGw7XG4gICAgICAgIHNvdXJjZU1hcHBpbmdBY3RpdmUgPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGNodW5rLnNwbGl0KCcnKS5mb3JFYWNoKGZ1bmN0aW9uIChjaCwgaWR4LCBhcnJheSkge1xuICAgICAgICBpZiAoY2ggPT09ICdcXG4nKSB7XG4gICAgICAgICAgZ2VuZXJhdGVkLmxpbmUrKztcbiAgICAgICAgICBnZW5lcmF0ZWQuY29sdW1uID0gMDtcbiAgICAgICAgICAvLyBNYXBwaW5ncyBlbmQgYXQgZW9sXG4gICAgICAgICAgaWYgKGlkeCArIDEgPT09IGFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgbGFzdE9yaWdpbmFsU291cmNlID0gbnVsbDtcbiAgICAgICAgICAgIHNvdXJjZU1hcHBpbmdBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHNvdXJjZU1hcHBpbmdBY3RpdmUpIHtcbiAgICAgICAgICAgIG1hcC5hZGRNYXBwaW5nKHtcbiAgICAgICAgICAgICAgc291cmNlOiBvcmlnaW5hbC5zb3VyY2UsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiB7XG4gICAgICAgICAgICAgICAgbGluZTogb3JpZ2luYWwubGluZSxcbiAgICAgICAgICAgICAgICBjb2x1bW46IG9yaWdpbmFsLmNvbHVtblxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBnZW5lcmF0ZWQ6IHtcbiAgICAgICAgICAgICAgICBsaW5lOiBnZW5lcmF0ZWQubGluZSxcbiAgICAgICAgICAgICAgICBjb2x1bW46IGdlbmVyYXRlZC5jb2x1bW5cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgbmFtZTogb3JpZ2luYWwubmFtZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGdlbmVyYXRlZC5jb2x1bW4rKztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy53YWxrU291cmNlQ29udGVudHMoZnVuY3Rpb24gKHNvdXJjZUZpbGUsIHNvdXJjZUNvbnRlbnQpIHtcbiAgICAgIG1hcC5zZXRTb3VyY2VDb250ZW50KHNvdXJjZUZpbGUsIHNvdXJjZUNvbnRlbnQpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHsgY29kZTogZ2VuZXJhdGVkLmNvZGUsIG1hcDogbWFwIH07XG4gIH07XG5cbiAgZXhwb3J0cy5Tb3VyY2VOb2RlID0gU291cmNlTm9kZTtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIC8qKlxuICAgKiBUaGlzIGlzIGEgaGVscGVyIGZ1bmN0aW9uIGZvciBnZXR0aW5nIHZhbHVlcyBmcm9tIHBhcmFtZXRlci9vcHRpb25zXG4gICAqIG9iamVjdHMuXG4gICAqXG4gICAqIEBwYXJhbSBhcmdzIFRoZSBvYmplY3Qgd2UgYXJlIGV4dHJhY3RpbmcgdmFsdWVzIGZyb21cbiAgICogQHBhcmFtIG5hbWUgVGhlIG5hbWUgb2YgdGhlIHByb3BlcnR5IHdlIGFyZSBnZXR0aW5nLlxuICAgKiBAcGFyYW0gZGVmYXVsdFZhbHVlIEFuIG9wdGlvbmFsIHZhbHVlIHRvIHJldHVybiBpZiB0aGUgcHJvcGVydHkgaXMgbWlzc2luZ1xuICAgKiBmcm9tIHRoZSBvYmplY3QuIElmIHRoaXMgaXMgbm90IHNwZWNpZmllZCBhbmQgdGhlIHByb3BlcnR5IGlzIG1pc3NpbmcsIGFuXG4gICAqIGVycm9yIHdpbGwgYmUgdGhyb3duLlxuICAgKi9cbiAgZnVuY3Rpb24gZ2V0QXJnKGFBcmdzLCBhTmFtZSwgYURlZmF1bHRWYWx1ZSkge1xuICAgIGlmIChhTmFtZSBpbiBhQXJncykge1xuICAgICAgcmV0dXJuIGFBcmdzW2FOYW1lXTtcbiAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDMpIHtcbiAgICAgIHJldHVybiBhRGVmYXVsdFZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIGFOYW1lICsgJ1wiIGlzIGEgcmVxdWlyZWQgYXJndW1lbnQuJyk7XG4gICAgfVxuICB9XG4gIGV4cG9ydHMuZ2V0QXJnID0gZ2V0QXJnO1xuXG4gIHZhciB1cmxSZWdleHAgPSAvXig/OihbXFx3K1xcLS5dKyk6KT9cXC9cXC8oPzooXFx3KzpcXHcrKUApPyhbXFx3Ll0qKSg/OjooXFxkKykpPyhcXFMqKSQvO1xuICB2YXIgZGF0YVVybFJlZ2V4cCA9IC9eZGF0YTouK1xcLC4rJC87XG5cbiAgZnVuY3Rpb24gdXJsUGFyc2UoYVVybCkge1xuICAgIHZhciBtYXRjaCA9IGFVcmwubWF0Y2godXJsUmVnZXhwKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHNjaGVtZTogbWF0Y2hbMV0sXG4gICAgICBhdXRoOiBtYXRjaFsyXSxcbiAgICAgIGhvc3Q6IG1hdGNoWzNdLFxuICAgICAgcG9ydDogbWF0Y2hbNF0sXG4gICAgICBwYXRoOiBtYXRjaFs1XVxuICAgIH07XG4gIH1cbiAgZXhwb3J0cy51cmxQYXJzZSA9IHVybFBhcnNlO1xuXG4gIGZ1bmN0aW9uIHVybEdlbmVyYXRlKGFQYXJzZWRVcmwpIHtcbiAgICB2YXIgdXJsID0gJyc7XG4gICAgaWYgKGFQYXJzZWRVcmwuc2NoZW1lKSB7XG4gICAgICB1cmwgKz0gYVBhcnNlZFVybC5zY2hlbWUgKyAnOic7XG4gICAgfVxuICAgIHVybCArPSAnLy8nO1xuICAgIGlmIChhUGFyc2VkVXJsLmF1dGgpIHtcbiAgICAgIHVybCArPSBhUGFyc2VkVXJsLmF1dGggKyAnQCc7XG4gICAgfVxuICAgIGlmIChhUGFyc2VkVXJsLmhvc3QpIHtcbiAgICAgIHVybCArPSBhUGFyc2VkVXJsLmhvc3Q7XG4gICAgfVxuICAgIGlmIChhUGFyc2VkVXJsLnBvcnQpIHtcbiAgICAgIHVybCArPSBcIjpcIiArIGFQYXJzZWRVcmwucG9ydFxuICAgIH1cbiAgICBpZiAoYVBhcnNlZFVybC5wYXRoKSB7XG4gICAgICB1cmwgKz0gYVBhcnNlZFVybC5wYXRoO1xuICAgIH1cbiAgICByZXR1cm4gdXJsO1xuICB9XG4gIGV4cG9ydHMudXJsR2VuZXJhdGUgPSB1cmxHZW5lcmF0ZTtcblxuICAvKipcbiAgICogTm9ybWFsaXplcyBhIHBhdGgsIG9yIHRoZSBwYXRoIHBvcnRpb24gb2YgYSBVUkw6XG4gICAqXG4gICAqIC0gUmVwbGFjZXMgY29uc2VxdXRpdmUgc2xhc2hlcyB3aXRoIG9uZSBzbGFzaC5cbiAgICogLSBSZW1vdmVzIHVubmVjZXNzYXJ5ICcuJyBwYXJ0cy5cbiAgICogLSBSZW1vdmVzIHVubmVjZXNzYXJ5ICc8ZGlyPi8uLicgcGFydHMuXG4gICAqXG4gICAqIEJhc2VkIG9uIGNvZGUgaW4gdGhlIE5vZGUuanMgJ3BhdGgnIGNvcmUgbW9kdWxlLlxuICAgKlxuICAgKiBAcGFyYW0gYVBhdGggVGhlIHBhdGggb3IgdXJsIHRvIG5vcm1hbGl6ZS5cbiAgICovXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZShhUGF0aCkge1xuICAgIHZhciBwYXRoID0gYVBhdGg7XG4gICAgdmFyIHVybCA9IHVybFBhcnNlKGFQYXRoKTtcbiAgICBpZiAodXJsKSB7XG4gICAgICBpZiAoIXVybC5wYXRoKSB7XG4gICAgICAgIHJldHVybiBhUGF0aDtcbiAgICAgIH1cbiAgICAgIHBhdGggPSB1cmwucGF0aDtcbiAgICB9XG4gICAgdmFyIGlzQWJzb2x1dGUgPSAocGF0aC5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgICB2YXIgcGFydHMgPSBwYXRoLnNwbGl0KC9cXC8rLyk7XG4gICAgZm9yICh2YXIgcGFydCwgdXAgPSAwLCBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHBhcnQgPSBwYXJ0c1tpXTtcbiAgICAgIGlmIChwYXJ0ID09PSAnLicpIHtcbiAgICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgfSBlbHNlIGlmIChwYXJ0ID09PSAnLi4nKSB7XG4gICAgICAgIHVwKys7XG4gICAgICB9IGVsc2UgaWYgKHVwID4gMCkge1xuICAgICAgICBpZiAocGFydCA9PT0gJycpIHtcbiAgICAgICAgICAvLyBUaGUgZmlyc3QgcGFydCBpcyBibGFuayBpZiB0aGUgcGF0aCBpcyBhYnNvbHV0ZS4gVHJ5aW5nIHRvIGdvXG4gICAgICAgICAgLy8gYWJvdmUgdGhlIHJvb3QgaXMgYSBuby1vcC4gVGhlcmVmb3JlIHdlIGNhbiByZW1vdmUgYWxsICcuLicgcGFydHNcbiAgICAgICAgICAvLyBkaXJlY3RseSBhZnRlciB0aGUgcm9vdC5cbiAgICAgICAgICBwYXJ0cy5zcGxpY2UoaSArIDEsIHVwKTtcbiAgICAgICAgICB1cCA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGFydHMuc3BsaWNlKGksIDIpO1xuICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcGF0aCA9IHBhcnRzLmpvaW4oJy8nKTtcblxuICAgIGlmIChwYXRoID09PSAnJykge1xuICAgICAgcGF0aCA9IGlzQWJzb2x1dGUgPyAnLycgOiAnLic7XG4gICAgfVxuXG4gICAgaWYgKHVybCkge1xuICAgICAgdXJsLnBhdGggPSBwYXRoO1xuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKHVybCk7XG4gICAgfVxuICAgIHJldHVybiBwYXRoO1xuICB9XG4gIGV4cG9ydHMubm9ybWFsaXplID0gbm9ybWFsaXplO1xuXG4gIC8qKlxuICAgKiBKb2lucyB0d28gcGF0aHMvVVJMcy5cbiAgICpcbiAgICogQHBhcmFtIGFSb290IFRoZSByb290IHBhdGggb3IgVVJMLlxuICAgKiBAcGFyYW0gYVBhdGggVGhlIHBhdGggb3IgVVJMIHRvIGJlIGpvaW5lZCB3aXRoIHRoZSByb290LlxuICAgKlxuICAgKiAtIElmIGFQYXRoIGlzIGEgVVJMIG9yIGEgZGF0YSBVUkksIGFQYXRoIGlzIHJldHVybmVkLCB1bmxlc3MgYVBhdGggaXMgYVxuICAgKiAgIHNjaGVtZS1yZWxhdGl2ZSBVUkw6IFRoZW4gdGhlIHNjaGVtZSBvZiBhUm9vdCwgaWYgYW55LCBpcyBwcmVwZW5kZWRcbiAgICogICBmaXJzdC5cbiAgICogLSBPdGhlcndpc2UgYVBhdGggaXMgYSBwYXRoLiBJZiBhUm9vdCBpcyBhIFVSTCwgdGhlbiBpdHMgcGF0aCBwb3J0aW9uXG4gICAqICAgaXMgdXBkYXRlZCB3aXRoIHRoZSByZXN1bHQgYW5kIGFSb290IGlzIHJldHVybmVkLiBPdGhlcndpc2UgdGhlIHJlc3VsdFxuICAgKiAgIGlzIHJldHVybmVkLlxuICAgKiAgIC0gSWYgYVBhdGggaXMgYWJzb2x1dGUsIHRoZSByZXN1bHQgaXMgYVBhdGguXG4gICAqICAgLSBPdGhlcndpc2UgdGhlIHR3byBwYXRocyBhcmUgam9pbmVkIHdpdGggYSBzbGFzaC5cbiAgICogLSBKb2luaW5nIGZvciBleGFtcGxlICdodHRwOi8vJyBhbmQgJ3d3dy5leGFtcGxlLmNvbScgaXMgYWxzbyBzdXBwb3J0ZWQuXG4gICAqL1xuICBmdW5jdGlvbiBqb2luKGFSb290LCBhUGF0aCkge1xuICAgIHZhciBhUGF0aFVybCA9IHVybFBhcnNlKGFQYXRoKTtcbiAgICB2YXIgYVJvb3RVcmwgPSB1cmxQYXJzZShhUm9vdCk7XG4gICAgaWYgKGFSb290VXJsKSB7XG4gICAgICBhUm9vdCA9IGFSb290VXJsLnBhdGggfHwgJy8nO1xuICAgIH1cblxuICAgIC8vIGBqb2luKGZvbywgJy8vd3d3LmV4YW1wbGUub3JnJylgXG4gICAgaWYgKGFQYXRoVXJsICYmICFhUGF0aFVybC5zY2hlbWUpIHtcbiAgICAgIGlmIChhUm9vdFVybCkge1xuICAgICAgICBhUGF0aFVybC5zY2hlbWUgPSBhUm9vdFVybC5zY2hlbWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gdXJsR2VuZXJhdGUoYVBhdGhVcmwpO1xuICAgIH1cblxuICAgIGlmIChhUGF0aFVybCB8fCBhUGF0aC5tYXRjaChkYXRhVXJsUmVnZXhwKSkge1xuICAgICAgcmV0dXJuIGFQYXRoO1xuICAgIH1cblxuICAgIC8vIGBqb2luKCdodHRwOi8vJywgJ3d3dy5leGFtcGxlLmNvbScpYFxuICAgIGlmIChhUm9vdFVybCAmJiAhYVJvb3RVcmwuaG9zdCAmJiAhYVJvb3RVcmwucGF0aCkge1xuICAgICAgYVJvb3RVcmwuaG9zdCA9IGFQYXRoO1xuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKGFSb290VXJsKTtcbiAgICB9XG5cbiAgICB2YXIgam9pbmVkID0gYVBhdGguY2hhckF0KDApID09PSAnLydcbiAgICAgID8gYVBhdGhcbiAgICAgIDogbm9ybWFsaXplKGFSb290LnJlcGxhY2UoL1xcLyskLywgJycpICsgJy8nICsgYVBhdGgpO1xuXG4gICAgaWYgKGFSb290VXJsKSB7XG4gICAgICBhUm9vdFVybC5wYXRoID0gam9pbmVkO1xuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKGFSb290VXJsKTtcbiAgICB9XG4gICAgcmV0dXJuIGpvaW5lZDtcbiAgfVxuICBleHBvcnRzLmpvaW4gPSBqb2luO1xuXG4gIC8qKlxuICAgKiBCZWNhdXNlIGJlaGF2aW9yIGdvZXMgd2Fja3kgd2hlbiB5b3Ugc2V0IGBfX3Byb3RvX19gIG9uIG9iamVjdHMsIHdlXG4gICAqIGhhdmUgdG8gcHJlZml4IGFsbCB0aGUgc3RyaW5ncyBpbiBvdXIgc2V0IHdpdGggYW4gYXJiaXRyYXJ5IGNoYXJhY3Rlci5cbiAgICpcbiAgICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL3NvdXJjZS1tYXAvcHVsbC8zMSBhbmRcbiAgICogaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvc291cmNlLW1hcC9pc3N1ZXMvMzBcbiAgICpcbiAgICogQHBhcmFtIFN0cmluZyBhU3RyXG4gICAqL1xuICBmdW5jdGlvbiB0b1NldFN0cmluZyhhU3RyKSB7XG4gICAgcmV0dXJuICckJyArIGFTdHI7XG4gIH1cbiAgZXhwb3J0cy50b1NldFN0cmluZyA9IHRvU2V0U3RyaW5nO1xuXG4gIGZ1bmN0aW9uIGZyb21TZXRTdHJpbmcoYVN0cikge1xuICAgIHJldHVybiBhU3RyLnN1YnN0cigxKTtcbiAgfVxuICBleHBvcnRzLmZyb21TZXRTdHJpbmcgPSBmcm9tU2V0U3RyaW5nO1xuXG4gIGZ1bmN0aW9uIHJlbGF0aXZlKGFSb290LCBhUGF0aCkge1xuICAgIGFSb290ID0gYVJvb3QucmVwbGFjZSgvXFwvJC8sICcnKTtcblxuICAgIHZhciB1cmwgPSB1cmxQYXJzZShhUm9vdCk7XG4gICAgaWYgKGFQYXRoLmNoYXJBdCgwKSA9PSBcIi9cIiAmJiB1cmwgJiYgdXJsLnBhdGggPT0gXCIvXCIpIHtcbiAgICAgIHJldHVybiBhUGF0aC5zbGljZSgxKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYVBhdGguaW5kZXhPZihhUm9vdCArICcvJykgPT09IDBcbiAgICAgID8gYVBhdGguc3Vic3RyKGFSb290Lmxlbmd0aCArIDEpXG4gICAgICA6IGFQYXRoO1xuICB9XG4gIGV4cG9ydHMucmVsYXRpdmUgPSByZWxhdGl2ZTtcblxuICBmdW5jdGlvbiBzdHJjbXAoYVN0cjEsIGFTdHIyKSB7XG4gICAgdmFyIHMxID0gYVN0cjEgfHwgXCJcIjtcbiAgICB2YXIgczIgPSBhU3RyMiB8fCBcIlwiO1xuICAgIHJldHVybiAoczEgPiBzMikgLSAoczEgPCBzMik7XG4gIH1cblxuICAvKipcbiAgICogQ29tcGFyYXRvciBiZXR3ZWVuIHR3byBtYXBwaW5ncyB3aGVyZSB0aGUgb3JpZ2luYWwgcG9zaXRpb25zIGFyZSBjb21wYXJlZC5cbiAgICpcbiAgICogT3B0aW9uYWxseSBwYXNzIGluIGB0cnVlYCBhcyBgb25seUNvbXBhcmVHZW5lcmF0ZWRgIHRvIGNvbnNpZGVyIHR3b1xuICAgKiBtYXBwaW5ncyB3aXRoIHRoZSBzYW1lIG9yaWdpbmFsIHNvdXJjZS9saW5lL2NvbHVtbiwgYnV0IGRpZmZlcmVudCBnZW5lcmF0ZWRcbiAgICogbGluZSBhbmQgY29sdW1uIHRoZSBzYW1lLiBVc2VmdWwgd2hlbiBzZWFyY2hpbmcgZm9yIGEgbWFwcGluZyB3aXRoIGFcbiAgICogc3R1YmJlZCBvdXQgbWFwcGluZy5cbiAgICovXG4gIGZ1bmN0aW9uIGNvbXBhcmVCeU9yaWdpbmFsUG9zaXRpb25zKG1hcHBpbmdBLCBtYXBwaW5nQiwgb25seUNvbXBhcmVPcmlnaW5hbCkge1xuICAgIHZhciBjbXA7XG5cbiAgICBjbXAgPSBzdHJjbXAobWFwcGluZ0Euc291cmNlLCBtYXBwaW5nQi5zb3VyY2UpO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0Eub3JpZ2luYWxMaW5lIC0gbWFwcGluZ0Iub3JpZ2luYWxMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0Eub3JpZ2luYWxDb2x1bW4gLSBtYXBwaW5nQi5vcmlnaW5hbENvbHVtbjtcbiAgICBpZiAoY21wIHx8IG9ubHlDb21wYXJlT3JpZ2luYWwpIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLm5hbWUsIG1hcHBpbmdCLm5hbWUpO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0EuZ2VuZXJhdGVkTGluZSAtIG1hcHBpbmdCLmdlbmVyYXRlZExpbmU7XG4gICAgaWYgKGNtcCkge1xuICAgICAgcmV0dXJuIGNtcDtcbiAgICB9XG5cbiAgICByZXR1cm4gbWFwcGluZ0EuZ2VuZXJhdGVkQ29sdW1uIC0gbWFwcGluZ0IuZ2VuZXJhdGVkQ29sdW1uO1xuICB9O1xuICBleHBvcnRzLmNvbXBhcmVCeU9yaWdpbmFsUG9zaXRpb25zID0gY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnM7XG5cbiAgLyoqXG4gICAqIENvbXBhcmF0b3IgYmV0d2VlbiB0d28gbWFwcGluZ3Mgd2hlcmUgdGhlIGdlbmVyYXRlZCBwb3NpdGlvbnMgYXJlXG4gICAqIGNvbXBhcmVkLlxuICAgKlxuICAgKiBPcHRpb25hbGx5IHBhc3MgaW4gYHRydWVgIGFzIGBvbmx5Q29tcGFyZUdlbmVyYXRlZGAgdG8gY29uc2lkZXIgdHdvXG4gICAqIG1hcHBpbmdzIHdpdGggdGhlIHNhbWUgZ2VuZXJhdGVkIGxpbmUgYW5kIGNvbHVtbiwgYnV0IGRpZmZlcmVudFxuICAgKiBzb3VyY2UvbmFtZS9vcmlnaW5hbCBsaW5lIGFuZCBjb2x1bW4gdGhlIHNhbWUuIFVzZWZ1bCB3aGVuIHNlYXJjaGluZyBmb3IgYVxuICAgKiBtYXBwaW5nIHdpdGggYSBzdHViYmVkIG91dCBtYXBwaW5nLlxuICAgKi9cbiAgZnVuY3Rpb24gY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKG1hcHBpbmdBLCBtYXBwaW5nQiwgb25seUNvbXBhcmVHZW5lcmF0ZWQpIHtcbiAgICB2YXIgY21wO1xuXG4gICAgY21wID0gbWFwcGluZ0EuZ2VuZXJhdGVkTGluZSAtIG1hcHBpbmdCLmdlbmVyYXRlZExpbmU7XG4gICAgaWYgKGNtcCkge1xuICAgICAgcmV0dXJuIGNtcDtcbiAgICB9XG5cbiAgICBjbXAgPSBtYXBwaW5nQS5nZW5lcmF0ZWRDb2x1bW4gLSBtYXBwaW5nQi5nZW5lcmF0ZWRDb2x1bW47XG4gICAgaWYgKGNtcCB8fCBvbmx5Q29tcGFyZUdlbmVyYXRlZCkge1xuICAgICAgcmV0dXJuIGNtcDtcbiAgICB9XG5cbiAgICBjbXAgPSBzdHJjbXAobWFwcGluZ0Euc291cmNlLCBtYXBwaW5nQi5zb3VyY2UpO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0Eub3JpZ2luYWxMaW5lIC0gbWFwcGluZ0Iub3JpZ2luYWxMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0Eub3JpZ2luYWxDb2x1bW4gLSBtYXBwaW5nQi5vcmlnaW5hbENvbHVtbjtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIHJldHVybiBzdHJjbXAobWFwcGluZ0EubmFtZSwgbWFwcGluZ0IubmFtZSk7XG4gIH07XG4gIGV4cG9ydHMuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zID0gY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zO1xuXG59KTtcbiIsIihmdW5jdGlvbiAocHJvY2VzcyxfX2ZpbGVuYW1lKXtcbi8qKiB2aW06IGV0OnRzPTQ6c3c9NDpzdHM9NFxuICogQGxpY2Vuc2UgYW1kZWZpbmUgMC4xLjAgQ29weXJpZ2h0IChjKSAyMDExLCBUaGUgRG9qbyBGb3VuZGF0aW9uIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBBdmFpbGFibGUgdmlhIHRoZSBNSVQgb3IgbmV3IEJTRCBsaWNlbnNlLlxuICogc2VlOiBodHRwOi8vZ2l0aHViLmNvbS9qcmJ1cmtlL2FtZGVmaW5lIGZvciBkZXRhaWxzXG4gKi9cblxuLypqc2xpbnQgbm9kZTogdHJ1ZSAqL1xuLypnbG9iYWwgbW9kdWxlLCBwcm9jZXNzICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGRlZmluZSBmb3Igbm9kZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBtb2R1bGUgdGhlIFwibW9kdWxlXCIgb2JqZWN0IHRoYXQgaXMgZGVmaW5lZCBieSBOb2RlIGZvciB0aGVcbiAqIGN1cnJlbnQgbW9kdWxlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW3JlcXVpcmVGbl0uIE5vZGUncyByZXF1aXJlIGZ1bmN0aW9uIGZvciB0aGUgY3VycmVudCBtb2R1bGUuXG4gKiBJdCBvbmx5IG5lZWRzIHRvIGJlIHBhc3NlZCBpbiBOb2RlIHZlcnNpb25zIGJlZm9yZSAwLjUsIHdoZW4gbW9kdWxlLnJlcXVpcmVcbiAqIGRpZCBub3QgZXhpc3QuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IGEgZGVmaW5lIGZ1bmN0aW9uIHRoYXQgaXMgdXNhYmxlIGZvciB0aGUgY3VycmVudCBub2RlXG4gKiBtb2R1bGUuXG4gKi9cbmZ1bmN0aW9uIGFtZGVmaW5lKG1vZHVsZSwgcmVxdWlyZUZuKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIHZhciBkZWZpbmVDYWNoZSA9IHt9LFxuICAgICAgICBsb2FkZXJDYWNoZSA9IHt9LFxuICAgICAgICBhbHJlYWR5Q2FsbGVkID0gZmFsc2UsXG4gICAgICAgIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gICAgICAgIG1ha2VSZXF1aXJlLCBzdHJpbmdSZXF1aXJlO1xuXG4gICAgLyoqXG4gICAgICogVHJpbXMgdGhlIC4gYW5kIC4uIGZyb20gYW4gYXJyYXkgb2YgcGF0aCBzZWdtZW50cy5cbiAgICAgKiBJdCB3aWxsIGtlZXAgYSBsZWFkaW5nIHBhdGggc2VnbWVudCBpZiBhIC4uIHdpbGwgYmVjb21lXG4gICAgICogdGhlIGZpcnN0IHBhdGggc2VnbWVudCwgdG8gaGVscCB3aXRoIG1vZHVsZSBuYW1lIGxvb2t1cHMsXG4gICAgICogd2hpY2ggYWN0IGxpa2UgcGF0aHMsIGJ1dCBjYW4gYmUgcmVtYXBwZWQuIEJ1dCB0aGUgZW5kIHJlc3VsdCxcbiAgICAgKiBhbGwgcGF0aHMgdGhhdCB1c2UgdGhpcyBmdW5jdGlvbiBzaG91bGQgbG9vayBub3JtYWxpemVkLlxuICAgICAqIE5PVEU6IHRoaXMgbWV0aG9kIE1PRElGSUVTIHRoZSBpbnB1dCBhcnJheS5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBhcnkgdGhlIGFycmF5IG9mIHBhdGggc2VnbWVudHMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gdHJpbURvdHMoYXJ5KSB7XG4gICAgICAgIHZhciBpLCBwYXJ0O1xuICAgICAgICBmb3IgKGkgPSAwOyBhcnlbaV07IGkrPSAxKSB7XG4gICAgICAgICAgICBwYXJ0ID0gYXJ5W2ldO1xuICAgICAgICAgICAgaWYgKHBhcnQgPT09ICcuJykge1xuICAgICAgICAgICAgICAgIGFyeS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgaSAtPSAxO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJ0ID09PSAnLi4nKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IDEgJiYgKGFyeVsyXSA9PT0gJy4uJyB8fCBhcnlbMF0gPT09ICcuLicpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vRW5kIG9mIHRoZSBsaW5lLiBLZWVwIGF0IGxlYXN0IG9uZSBub24tZG90XG4gICAgICAgICAgICAgICAgICAgIC8vcGF0aCBzZWdtZW50IGF0IHRoZSBmcm9udCBzbyBpdCBjYW4gYmUgbWFwcGVkXG4gICAgICAgICAgICAgICAgICAgIC8vY29ycmVjdGx5IHRvIGRpc2suIE90aGVyd2lzZSwgdGhlcmUgaXMgbGlrZWx5XG4gICAgICAgICAgICAgICAgICAgIC8vbm8gcGF0aCBtYXBwaW5nIGZvciBhIHBhdGggc3RhcnRpbmcgd2l0aCAnLi4nLlxuICAgICAgICAgICAgICAgICAgICAvL1RoaXMgY2FuIHN0aWxsIGZhaWwsIGJ1dCBjYXRjaGVzIHRoZSBtb3N0IHJlYXNvbmFibGVcbiAgICAgICAgICAgICAgICAgICAgLy91c2VzIG9mIC4uXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXJ5LnNwbGljZShpIC0gMSwgMik7XG4gICAgICAgICAgICAgICAgICAgIGkgLT0gMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub3JtYWxpemUobmFtZSwgYmFzZU5hbWUpIHtcbiAgICAgICAgdmFyIGJhc2VQYXJ0cztcblxuICAgICAgICAvL0FkanVzdCBhbnkgcmVsYXRpdmUgcGF0aHMuXG4gICAgICAgIGlmIChuYW1lICYmIG5hbWUuY2hhckF0KDApID09PSAnLicpIHtcbiAgICAgICAgICAgIC8vSWYgaGF2ZSBhIGJhc2UgbmFtZSwgdHJ5IHRvIG5vcm1hbGl6ZSBhZ2FpbnN0IGl0LFxuICAgICAgICAgICAgLy9vdGhlcndpc2UsIGFzc3VtZSBpdCBpcyBhIHRvcC1sZXZlbCByZXF1aXJlIHRoYXQgd2lsbFxuICAgICAgICAgICAgLy9iZSByZWxhdGl2ZSB0byBiYXNlVXJsIGluIHRoZSBlbmQuXG4gICAgICAgICAgICBpZiAoYmFzZU5hbWUpIHtcbiAgICAgICAgICAgICAgICBiYXNlUGFydHMgPSBiYXNlTmFtZS5zcGxpdCgnLycpO1xuICAgICAgICAgICAgICAgIGJhc2VQYXJ0cyA9IGJhc2VQYXJ0cy5zbGljZSgwLCBiYXNlUGFydHMubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICAgICAgYmFzZVBhcnRzID0gYmFzZVBhcnRzLmNvbmNhdChuYW1lLnNwbGl0KCcvJykpO1xuICAgICAgICAgICAgICAgIHRyaW1Eb3RzKGJhc2VQYXJ0cyk7XG4gICAgICAgICAgICAgICAgbmFtZSA9IGJhc2VQYXJ0cy5qb2luKCcvJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgdGhlIG5vcm1hbGl6ZSgpIGZ1bmN0aW9uIHBhc3NlZCB0byBhIGxvYWRlciBwbHVnaW4nc1xuICAgICAqIG5vcm1hbGl6ZSBtZXRob2QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZU5vcm1hbGl6ZShyZWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShuYW1lLCByZWxOYW1lKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYWtlTG9hZChpZCkge1xuICAgICAgICBmdW5jdGlvbiBsb2FkKHZhbHVlKSB7XG4gICAgICAgICAgICBsb2FkZXJDYWNoZVtpZF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvYWQuZnJvbVRleHQgPSBmdW5jdGlvbiAoaWQsIHRleHQpIHtcbiAgICAgICAgICAgIC8vVGhpcyBvbmUgaXMgZGlmZmljdWx0IGJlY2F1c2UgdGhlIHRleHQgY2FuL3Byb2JhYmx5IHVzZXNcbiAgICAgICAgICAgIC8vZGVmaW5lLCBhbmQgYW55IHJlbGF0aXZlIHBhdGhzIGFuZCByZXF1aXJlcyBzaG91bGQgYmUgcmVsYXRpdmVcbiAgICAgICAgICAgIC8vdG8gdGhhdCBpZCB3YXMgaXQgd291bGQgYmUgZm91bmQgb24gZGlzay4gQnV0IHRoaXMgd291bGQgcmVxdWlyZVxuICAgICAgICAgICAgLy9ib290c3RyYXBwaW5nIGEgbW9kdWxlL3JlcXVpcmUgZmFpcmx5IGRlZXBseSBmcm9tIG5vZGUgY29yZS5cbiAgICAgICAgICAgIC8vTm90IHN1cmUgaG93IGJlc3QgdG8gZ28gYWJvdXQgdGhhdCB5ZXQuXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FtZGVmaW5lIGRvZXMgbm90IGltcGxlbWVudCBsb2FkLmZyb21UZXh0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGxvYWQ7XG4gICAgfVxuXG4gICAgbWFrZVJlcXVpcmUgPSBmdW5jdGlvbiAoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCByZWxJZCkge1xuICAgICAgICBmdW5jdGlvbiBhbWRSZXF1aXJlKGRlcHMsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGRlcHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgLy9TeW5jaHJvbm91cywgc2luZ2xlIG1vZHVsZSByZXF1aXJlKCcnKVxuICAgICAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgZGVwcywgcmVsSWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL0FycmF5IG9mIGRlcGVuZGVuY2llcyB3aXRoIGEgY2FsbGJhY2suXG5cbiAgICAgICAgICAgICAgICAvL0NvbnZlcnQgdGhlIGRlcGVuZGVuY2llcyB0byBtb2R1bGVzLlxuICAgICAgICAgICAgICAgIGRlcHMgPSBkZXBzLm1hcChmdW5jdGlvbiAoZGVwTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIGRlcE5hbWUsIHJlbElkKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vV2FpdCBmb3IgbmV4dCB0aWNrIHRvIGNhbGwgYmFjayB0aGUgcmVxdWlyZSBjYWxsLlxuICAgICAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseShudWxsLCBkZXBzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGFtZFJlcXVpcmUudG9VcmwgPSBmdW5jdGlvbiAoZmlsZVBhdGgpIHtcbiAgICAgICAgICAgIGlmIChmaWxlUGF0aC5pbmRleE9mKCcuJykgPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9ybWFsaXplKGZpbGVQYXRoLCBwYXRoLmRpcm5hbWUobW9kdWxlLmZpbGVuYW1lKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaWxlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gYW1kUmVxdWlyZTtcbiAgICB9O1xuXG4gICAgLy9GYXZvciBleHBsaWNpdCB2YWx1ZSwgcGFzc2VkIGluIGlmIHRoZSBtb2R1bGUgd2FudHMgdG8gc3VwcG9ydCBOb2RlIDAuNC5cbiAgICByZXF1aXJlRm4gPSByZXF1aXJlRm4gfHwgZnVuY3Rpb24gcmVxKCkge1xuICAgICAgICByZXR1cm4gbW9kdWxlLnJlcXVpcmUuYXBwbHkobW9kdWxlLCBhcmd1bWVudHMpO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBydW5GYWN0b3J5KGlkLCBkZXBzLCBmYWN0b3J5KSB7XG4gICAgICAgIHZhciByLCBlLCBtLCByZXN1bHQ7XG5cbiAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICBlID0gbG9hZGVyQ2FjaGVbaWRdID0ge307XG4gICAgICAgICAgICBtID0ge1xuICAgICAgICAgICAgICAgIGlkOiBpZCxcbiAgICAgICAgICAgICAgICB1cmk6IF9fZmlsZW5hbWUsXG4gICAgICAgICAgICAgICAgZXhwb3J0czogZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHIgPSBtYWtlUmVxdWlyZShyZXF1aXJlRm4sIGUsIG0sIGlkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vT25seSBzdXBwb3J0IG9uZSBkZWZpbmUgY2FsbCBwZXIgZmlsZVxuICAgICAgICAgICAgaWYgKGFscmVhZHlDYWxsZWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FtZGVmaW5lIHdpdGggbm8gbW9kdWxlIElEIGNhbm5vdCBiZSBjYWxsZWQgbW9yZSB0aGFuIG9uY2UgcGVyIGZpbGUuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbHJlYWR5Q2FsbGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy9Vc2UgdGhlIHJlYWwgdmFyaWFibGVzIGZyb20gbm9kZVxuICAgICAgICAgICAgLy9Vc2UgbW9kdWxlLmV4cG9ydHMgZm9yIGV4cG9ydHMsIHNpbmNlXG4gICAgICAgICAgICAvL3RoZSBleHBvcnRzIGluIGhlcmUgaXMgYW1kZWZpbmUgZXhwb3J0cy5cbiAgICAgICAgICAgIGUgPSBtb2R1bGUuZXhwb3J0cztcbiAgICAgICAgICAgIG0gPSBtb2R1bGU7XG4gICAgICAgICAgICByID0gbWFrZVJlcXVpcmUocmVxdWlyZUZuLCBlLCBtLCBtb2R1bGUuaWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9JZiB0aGVyZSBhcmUgZGVwZW5kZW5jaWVzLCB0aGV5IGFyZSBzdHJpbmdzLCBzbyBuZWVkXG4gICAgICAgIC8vdG8gY29udmVydCB0aGVtIHRvIGRlcGVuZGVuY3kgdmFsdWVzLlxuICAgICAgICBpZiAoZGVwcykge1xuICAgICAgICAgICAgZGVwcyA9IGRlcHMubWFwKGZ1bmN0aW9uIChkZXBOYW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHIoZGVwTmFtZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vQ2FsbCB0aGUgZmFjdG9yeSB3aXRoIHRoZSByaWdodCBkZXBlbmRlbmNpZXMuXG4gICAgICAgIGlmICh0eXBlb2YgZmFjdG9yeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmVzdWx0ID0gZmFjdG9yeS5hcHBseShtLmV4cG9ydHMsIGRlcHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gZmFjdG9yeTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbS5leHBvcnRzID0gcmVzdWx0O1xuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgbG9hZGVyQ2FjaGVbaWRdID0gbS5leHBvcnRzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RyaW5nUmVxdWlyZSA9IGZ1bmN0aW9uIChzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIGlkLCByZWxJZCkge1xuICAgICAgICAvL1NwbGl0IHRoZSBJRCBieSBhICEgc28gdGhhdFxuICAgICAgICB2YXIgaW5kZXggPSBpZC5pbmRleE9mKCchJyksXG4gICAgICAgICAgICBvcmlnaW5hbElkID0gaWQsXG4gICAgICAgICAgICBwcmVmaXgsIHBsdWdpbjtcblxuICAgICAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICBpZCA9IG5vcm1hbGl6ZShpZCwgcmVsSWQpO1xuXG4gICAgICAgICAgICAvL1N0cmFpZ2h0IG1vZHVsZSBsb29rdXAuIElmIGl0IGlzIG9uZSBvZiB0aGUgc3BlY2lhbCBkZXBlbmRlbmNpZXMsXG4gICAgICAgICAgICAvL2RlYWwgd2l0aCBpdCwgb3RoZXJ3aXNlLCBkZWxlZ2F0ZSB0byBub2RlLlxuICAgICAgICAgICAgaWYgKGlkID09PSAncmVxdWlyZScpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWFrZVJlcXVpcmUoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCByZWxJZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlkID09PSAnZXhwb3J0cycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwb3J0cztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQgPT09ICdtb2R1bGUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1vZHVsZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobG9hZGVyQ2FjaGUuaGFzT3duUHJvcGVydHkoaWQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvYWRlckNhY2hlW2lkXTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGVmaW5lQ2FjaGVbaWRdKSB7XG4gICAgICAgICAgICAgICAgcnVuRmFjdG9yeS5hcHBseShudWxsLCBkZWZpbmVDYWNoZVtpZF0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmKHN5c3RlbVJlcXVpcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN5c3RlbVJlcXVpcmUob3JpZ2luYWxJZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBtb2R1bGUgd2l0aCBJRDogJyArIGlkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL1RoZXJlIGlzIGEgcGx1Z2luIGluIHBsYXkuXG4gICAgICAgICAgICBwcmVmaXggPSBpZC5zdWJzdHJpbmcoMCwgaW5kZXgpO1xuICAgICAgICAgICAgaWQgPSBpZC5zdWJzdHJpbmcoaW5kZXggKyAxLCBpZC5sZW5ndGgpO1xuXG4gICAgICAgICAgICBwbHVnaW4gPSBzdHJpbmdSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcHJlZml4LCByZWxJZCk7XG5cbiAgICAgICAgICAgIGlmIChwbHVnaW4ubm9ybWFsaXplKSB7XG4gICAgICAgICAgICAgICAgaWQgPSBwbHVnaW4ubm9ybWFsaXplKGlkLCBtYWtlTm9ybWFsaXplKHJlbElkKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vTm9ybWFsaXplIHRoZSBJRCBub3JtYWxseS5cbiAgICAgICAgICAgICAgICBpZCA9IG5vcm1hbGl6ZShpZCwgcmVsSWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobG9hZGVyQ2FjaGVbaWRdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvYWRlckNhY2hlW2lkXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGx1Z2luLmxvYWQoaWQsIG1ha2VSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcmVsSWQpLCBtYWtlTG9hZChpZCksIHt9KTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy9DcmVhdGUgYSBkZWZpbmUgZnVuY3Rpb24gc3BlY2lmaWMgdG8gdGhlIG1vZHVsZSBhc2tpbmcgZm9yIGFtZGVmaW5lLlxuICAgIGZ1bmN0aW9uIGRlZmluZShpZCwgZGVwcywgZmFjdG9yeSkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpZCkpIHtcbiAgICAgICAgICAgIGZhY3RvcnkgPSBkZXBzO1xuICAgICAgICAgICAgZGVwcyA9IGlkO1xuICAgICAgICAgICAgaWQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGlkICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZmFjdG9yeSA9IGlkO1xuICAgICAgICAgICAgaWQgPSBkZXBzID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlcHMgJiYgIUFycmF5LmlzQXJyYXkoZGVwcykpIHtcbiAgICAgICAgICAgIGZhY3RvcnkgPSBkZXBzO1xuICAgICAgICAgICAgZGVwcyA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVwcykge1xuICAgICAgICAgICAgZGVwcyA9IFsncmVxdWlyZScsICdleHBvcnRzJywgJ21vZHVsZSddO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9TZXQgdXAgcHJvcGVydGllcyBmb3IgdGhpcyBtb2R1bGUuIElmIGFuIElELCB0aGVuIHVzZVxuICAgICAgICAvL2ludGVybmFsIGNhY2hlLiBJZiBubyBJRCwgdGhlbiB1c2UgdGhlIGV4dGVybmFsIHZhcmlhYmxlc1xuICAgICAgICAvL2ZvciB0aGlzIG5vZGUgbW9kdWxlLlxuICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgIC8vUHV0IHRoZSBtb2R1bGUgaW4gZGVlcCBmcmVlemUgdW50aWwgdGhlcmUgaXMgYVxuICAgICAgICAgICAgLy9yZXF1aXJlIGNhbGwgZm9yIGl0LlxuICAgICAgICAgICAgZGVmaW5lQ2FjaGVbaWRdID0gW2lkLCBkZXBzLCBmYWN0b3J5XTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJ1bkZhY3RvcnkoaWQsIGRlcHMsIGZhY3RvcnkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy9kZWZpbmUucmVxdWlyZSwgd2hpY2ggaGFzIGFjY2VzcyB0byBhbGwgdGhlIHZhbHVlcyBpbiB0aGVcbiAgICAvL2NhY2hlLiBVc2VmdWwgZm9yIEFNRCBtb2R1bGVzIHRoYXQgYWxsIGhhdmUgSURzIGluIHRoZSBmaWxlLFxuICAgIC8vYnV0IG5lZWQgdG8gZmluYWxseSBleHBvcnQgYSB2YWx1ZSB0byBub2RlIGJhc2VkIG9uIG9uZSBvZiB0aG9zZVxuICAgIC8vSURzLlxuICAgIGRlZmluZS5yZXF1aXJlID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIGlmIChsb2FkZXJDYWNoZVtpZF0pIHtcbiAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGVmaW5lQ2FjaGVbaWRdKSB7XG4gICAgICAgICAgICBydW5GYWN0b3J5LmFwcGx5KG51bGwsIGRlZmluZUNhY2hlW2lkXSk7XG4gICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGRlZmluZS5hbWQgPSB7fTtcblxuICAgIHJldHVybiBkZWZpbmU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYW1kZWZpbmU7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiRjpcXFxcYmlsbHlzRmlsZVxcXFxjb2RlXFxcXGphdmFzY3JpcHRcXFxcbm9kZWpzXFxcXGRlYWR1bml0Q29yZVxcXFxub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeVxcXFxub2RlX21vZHVsZXNcXFxcaW5zZXJ0LW1vZHVsZS1nbG9iYWxzXFxcXG5vZGVfbW9kdWxlc1xcXFxwcm9jZXNzXFxcXGJyb3dzZXIuanNcIiksXCIvbm9kZV9tb2R1bGVzXFxcXHNvdXJjZS1tYXBcXFxcbm9kZV9tb2R1bGVzXFxcXGFtZGVmaW5lXFxcXGFtZGVmaW5lLmpzXCIpIiwiXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGV4Y2VwdGlvbk1vZGUoY3JlYXRlRXhjZXB0aW9uKCkpIC8vIGJhc2ljYWxseSB3aGF0IGJyb3dzZXIgdGhpcyBpc1xyXG5cclxuLy8gdmVyYmF0aW0gZnJvbSBgbW9kZWAgaW4gc3RhY2t0cmFjZS5qcyBhcyBvZiAyMDE0LTAxLTIzXHJcbmZ1bmN0aW9uIGV4Y2VwdGlvbk1vZGUoZSkge1xyXG4gICAgaWYgKGVbJ2FyZ3VtZW50cyddICYmIGUuc3RhY2spIHtcclxuICAgICAgICByZXR1cm4gJ2Nocm9tZSc7XHJcbiAgICB9IGVsc2UgaWYgKGUuc3RhY2sgJiYgZS5zb3VyY2VVUkwpIHtcclxuICAgICAgICByZXR1cm4gJ3NhZmFyaSc7XHJcbiAgICB9IGVsc2UgaWYgKGUuc3RhY2sgJiYgZS5udW1iZXIpIHtcclxuICAgICAgICByZXR1cm4gJ2llJztcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGUubWVzc2FnZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93Lm9wZXJhKSB7XHJcbiAgICAgICAgLy8gZS5tZXNzYWdlLmluZGV4T2YoXCJCYWNrdHJhY2U6XCIpID4gLTEgLT4gb3BlcmFcclxuICAgICAgICAvLyAhZS5zdGFja3RyYWNlIC0+IG9wZXJhXHJcbiAgICAgICAgaWYgKCFlLnN0YWNrdHJhY2UpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdvcGVyYTknOyAvLyB1c2UgZS5tZXNzYWdlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vICdvcGVyYSNzb3VyY2Vsb2MnIGluIGUgLT4gb3BlcmE5LCBvcGVyYTEwYVxyXG4gICAgICAgIGlmIChlLm1lc3NhZ2UuaW5kZXhPZignXFxuJykgPiAtMSAmJiBlLm1lc3NhZ2Uuc3BsaXQoJ1xcbicpLmxlbmd0aCA+IGUuc3RhY2t0cmFjZS5zcGxpdCgnXFxuJykubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnb3BlcmE5JzsgLy8gdXNlIGUubWVzc2FnZVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBlLnN0YWNrdHJhY2UgJiYgIWUuc3RhY2sgLT4gb3BlcmExMGFcclxuICAgICAgICBpZiAoIWUuc3RhY2spIHtcclxuICAgICAgICAgICAgcmV0dXJuICdvcGVyYTEwYSc7IC8vIHVzZSBlLnN0YWNrdHJhY2VcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gZS5zdGFja3RyYWNlICYmIGUuc3RhY2sgLT4gb3BlcmExMGJcclxuICAgICAgICBpZiAoZS5zdGFja3RyYWNlLmluZGV4T2YoXCJjYWxsZWQgZnJvbSBsaW5lXCIpIDwgMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ29wZXJhMTBiJzsgLy8gdXNlIGUuc3RhY2t0cmFjZSwgZm9ybWF0IGRpZmZlcnMgZnJvbSAnb3BlcmExMGEnXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGUuc3RhY2t0cmFjZSAmJiBlLnN0YWNrIC0+IG9wZXJhMTFcclxuICAgICAgICByZXR1cm4gJ29wZXJhMTEnOyAvLyB1c2UgZS5zdGFja3RyYWNlLCBmb3JtYXQgZGlmZmVycyBmcm9tICdvcGVyYTEwYScsICdvcGVyYTEwYidcclxuICAgIH0gZWxzZSBpZiAoZS5zdGFjayAmJiAhZS5maWxlTmFtZSkge1xyXG4gICAgICAgIC8vIENocm9tZSAyNyBkb2VzIG5vdCBoYXZlIGUuYXJndW1lbnRzIGFzIGVhcmxpZXIgdmVyc2lvbnMsXHJcbiAgICAgICAgLy8gYnV0IHN0aWxsIGRvZXMgbm90IGhhdmUgZS5maWxlTmFtZSBhcyBGaXJlZm94XHJcbiAgICAgICAgcmV0dXJuICdjaHJvbWUnO1xyXG4gICAgfSBlbHNlIGlmIChlLnN0YWNrKSB7XHJcbiAgICAgICAgcmV0dXJuICdmaXJlZm94JztcclxuICAgIH1cclxuICAgIHJldHVybiAnb3RoZXInO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVFeGNlcHRpb24oKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIHRoaXMudW5kZWYoKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICByZXR1cm4gZTtcclxuICAgIH1cclxufVxyXG4iLCIvLyBEb21haW4gUHVibGljIGJ5IEVyaWMgV2VuZGVsaW4gaHR0cDovL2VyaXdlbi5jb20vICgyMDA4KVxuLy8gICAgICAgICAgICAgICAgICBMdWtlIFNtaXRoIGh0dHA6Ly9sdWNhc3NtaXRoLm5hbWUvICgyMDA4KVxuLy8gICAgICAgICAgICAgICAgICBMb2ljIERhY2hhcnkgPGxvaWNAZGFjaGFyeS5vcmc+ICgyMDA4KVxuLy8gICAgICAgICAgICAgICAgICBKb2hhbiBFdXBocm9zaW5lIDxwcm9wcHlAYW1pbmNoZS5jb20+ICgyMDA4KVxuLy8gICAgICAgICAgICAgICAgICBPeXZpbmQgU2VhbiBLaW5zZXkgaHR0cDovL2tpbnNleS5uby9ibG9nICgyMDEwKVxuLy8gICAgICAgICAgICAgICAgICBWaWN0b3IgSG9teWFrb3YgPHZpY3Rvci1ob215YWtvdkB1c2Vycy5zb3VyY2Vmb3JnZS5uZXQ+ICgyMDEwKVxuKGZ1bmN0aW9uKGdsb2JhbCwgZmFjdG9yeSkge1xuICAvLyBOb2RlXG4gIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcblxuICAvLyBBTURcbiAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoZmFjdG9yeSk7XG5cbiAgLy8gQnJvd3NlciBnbG9iYWxzXG4gIH0gZWxzZSB7XG4gICAgZ2xvYmFsLnByaW50U3RhY2tUcmFjZSA9IGZhY3RvcnkoKTtcbiAgfVxufSh0aGlzLCBmdW5jdGlvbigpIHtcblx0LyoqXG5cdCAqIE1haW4gZnVuY3Rpb24gZ2l2aW5nIGEgZnVuY3Rpb24gc3RhY2sgdHJhY2Ugd2l0aCBhIGZvcmNlZCBvciBwYXNzZWQgaW4gRXJyb3Jcblx0ICpcblx0ICogQGNmZyB7RXJyb3J9IGUgVGhlIGVycm9yIHRvIGNyZWF0ZSBhIHN0YWNrdHJhY2UgZnJvbSAob3B0aW9uYWwpXG5cdCAqIEBjZmcge0Jvb2xlYW59IGd1ZXNzIElmIHdlIHNob3VsZCB0cnkgdG8gcmVzb2x2ZSB0aGUgbmFtZXMgb2YgYW5vbnltb3VzIGZ1bmN0aW9uc1xuXHQgKiBAcmV0dXJuIHtBcnJheX0gb2YgU3RyaW5ncyB3aXRoIGZ1bmN0aW9ucywgbGluZXMsIGZpbGVzLCBhbmQgYXJndW1lbnRzIHdoZXJlIHBvc3NpYmxlXG5cdCAqL1xuXHRmdW5jdGlvbiBwcmludFN0YWNrVHJhY2Uob3B0aW9ucykge1xuXHQgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge2d1ZXNzOiB0cnVlfTtcblx0ICAgIHZhciBleCA9IG9wdGlvbnMuZSB8fCBudWxsLCBndWVzcyA9ICEhb3B0aW9ucy5ndWVzcztcblx0ICAgIHZhciBwID0gbmV3IHByaW50U3RhY2tUcmFjZS5pbXBsZW1lbnRhdGlvbigpLCByZXN1bHQgPSBwLnJ1bihleCk7XG5cdCAgICByZXR1cm4gKGd1ZXNzKSA/IHAuZ3Vlc3NBbm9ueW1vdXNGdW5jdGlvbnMocmVzdWx0KSA6IHJlc3VsdDtcblx0fVxuXG5cdHByaW50U3RhY2tUcmFjZS5pbXBsZW1lbnRhdGlvbiA9IGZ1bmN0aW9uKCkge1xuXHR9O1xuXG5cdHByaW50U3RhY2tUcmFjZS5pbXBsZW1lbnRhdGlvbi5wcm90b3R5cGUgPSB7XG5cdCAgICAvKipcblx0ICAgICAqIEBwYXJhbSB7RXJyb3J9IGV4IFRoZSBlcnJvciB0byBjcmVhdGUgYSBzdGFja3RyYWNlIGZyb20gKG9wdGlvbmFsKVxuXHQgICAgICogQHBhcmFtIHtTdHJpbmd9IG1vZGUgRm9yY2VkIG1vZGUgKG9wdGlvbmFsLCBtb3N0bHkgZm9yIHVuaXQgdGVzdHMpXG5cdCAgICAgKi9cblx0ICAgIHJ1bjogZnVuY3Rpb24oZXgsIG1vZGUpIHtcblx0ICAgICAgICBleCA9IGV4IHx8IHRoaXMuY3JlYXRlRXhjZXB0aW9uKCk7XG5cdCAgICAgICAgLy8gZXhhbWluZSBleGNlcHRpb24gcHJvcGVydGllcyB3L28gZGVidWdnZXJcblx0ICAgICAgICAvL2ZvciAodmFyIHByb3AgaW4gZXgpIHthbGVydChcIkV4WydcIiArIHByb3AgKyBcIiddPVwiICsgZXhbcHJvcF0pO31cblx0ICAgICAgICBtb2RlID0gbW9kZSB8fCB0aGlzLm1vZGUoZXgpO1xuXHQgICAgICAgIGlmIChtb2RlID09PSAnb3RoZXInKSB7XG5cdCAgICAgICAgICAgIHJldHVybiB0aGlzLm90aGVyKGFyZ3VtZW50cy5jYWxsZWUpO1xuXHQgICAgICAgIH0gZWxzZSB7XG5cdCAgICAgICAgICAgIHJldHVybiB0aGlzW21vZGVdKGV4KTtcblx0ICAgICAgICB9XG5cdCAgICB9LFxuXG5cdCAgICBjcmVhdGVFeGNlcHRpb246IGZ1bmN0aW9uKCkge1xuXHQgICAgICAgIHRyeSB7XG5cdCAgICAgICAgICAgIHRoaXMudW5kZWYoKTtcblx0ICAgICAgICB9IGNhdGNoIChlKSB7XG5cdCAgICAgICAgICAgIHJldHVybiBlO1xuXHQgICAgICAgIH1cblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogTW9kZSBjb3VsZCBkaWZmZXIgZm9yIGRpZmZlcmVudCBleGNlcHRpb24sIGUuZy5cblx0ICAgICAqIGV4Y2VwdGlvbnMgaW4gQ2hyb21lIG1heSBvciBtYXkgbm90IGhhdmUgYXJndW1lbnRzIG9yIHN0YWNrLlxuXHQgICAgICpcblx0ICAgICAqIEByZXR1cm4ge1N0cmluZ30gbW9kZSBvZiBvcGVyYXRpb24gZm9yIHRoZSBleGNlcHRpb25cblx0ICAgICAqL1xuXHQgICAgbW9kZTogZnVuY3Rpb24oZSkge1xuXHQgICAgICAgIGlmIChlWydhcmd1bWVudHMnXSAmJiBlLnN0YWNrKSB7XG5cdCAgICAgICAgICAgIHJldHVybiAnY2hyb21lJztcblx0ICAgICAgICB9IGVsc2UgaWYgKGUuc3RhY2sgJiYgZS5zb3VyY2VVUkwpIHtcblx0ICAgICAgICAgICAgcmV0dXJuICdzYWZhcmknO1xuXHQgICAgICAgIH0gZWxzZSBpZiAoZS5zdGFjayAmJiBlLm51bWJlcikge1xuXHQgICAgICAgICAgICByZXR1cm4gJ2llJztcblx0ICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBlLm1lc3NhZ2UgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5vcGVyYSkge1xuXHQgICAgICAgICAgICAvLyBlLm1lc3NhZ2UuaW5kZXhPZihcIkJhY2t0cmFjZTpcIikgPiAtMSAtPiBvcGVyYVxuXHQgICAgICAgICAgICAvLyAhZS5zdGFja3RyYWNlIC0+IG9wZXJhXG5cdCAgICAgICAgICAgIGlmICghZS5zdGFja3RyYWNlKSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gJ29wZXJhOSc7IC8vIHVzZSBlLm1lc3NhZ2Vcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAvLyAnb3BlcmEjc291cmNlbG9jJyBpbiBlIC0+IG9wZXJhOSwgb3BlcmExMGFcblx0ICAgICAgICAgICAgaWYgKGUubWVzc2FnZS5pbmRleE9mKCdcXG4nKSA+IC0xICYmIGUubWVzc2FnZS5zcGxpdCgnXFxuJykubGVuZ3RoID4gZS5zdGFja3RyYWNlLnNwbGl0KCdcXG4nKS5sZW5ndGgpIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiAnb3BlcmE5JzsgLy8gdXNlIGUubWVzc2FnZVxuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIC8vIGUuc3RhY2t0cmFjZSAmJiAhZS5zdGFjayAtPiBvcGVyYTEwYVxuXHQgICAgICAgICAgICBpZiAoIWUuc3RhY2spIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiAnb3BlcmExMGEnOyAvLyB1c2UgZS5zdGFja3RyYWNlXG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgLy8gZS5zdGFja3RyYWNlICYmIGUuc3RhY2sgLT4gb3BlcmExMGJcblx0ICAgICAgICAgICAgaWYgKGUuc3RhY2t0cmFjZS5pbmRleE9mKFwiY2FsbGVkIGZyb20gbGluZVwiKSA8IDApIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiAnb3BlcmExMGInOyAvLyB1c2UgZS5zdGFja3RyYWNlLCBmb3JtYXQgZGlmZmVycyBmcm9tICdvcGVyYTEwYSdcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAvLyBlLnN0YWNrdHJhY2UgJiYgZS5zdGFjayAtPiBvcGVyYTExXG5cdCAgICAgICAgICAgIHJldHVybiAnb3BlcmExMSc7IC8vIHVzZSBlLnN0YWNrdHJhY2UsIGZvcm1hdCBkaWZmZXJzIGZyb20gJ29wZXJhMTBhJywgJ29wZXJhMTBiJ1xuXHQgICAgICAgIH0gZWxzZSBpZiAoZS5zdGFjayAmJiAhZS5maWxlTmFtZSkge1xuXHQgICAgICAgICAgICAvLyBDaHJvbWUgMjcgZG9lcyBub3QgaGF2ZSBlLmFyZ3VtZW50cyBhcyBlYXJsaWVyIHZlcnNpb25zLFxuXHQgICAgICAgICAgICAvLyBidXQgc3RpbGwgZG9lcyBub3QgaGF2ZSBlLmZpbGVOYW1lIGFzIEZpcmVmb3hcblx0ICAgICAgICAgICAgcmV0dXJuICdjaHJvbWUnO1xuXHQgICAgICAgIH0gZWxzZSBpZiAoZS5zdGFjaykge1xuXHQgICAgICAgICAgICByZXR1cm4gJ2ZpcmVmb3gnO1xuXHQgICAgICAgIH1cblx0ICAgICAgICByZXR1cm4gJ290aGVyJztcblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2l2ZW4gYSBjb250ZXh0LCBmdW5jdGlvbiBuYW1lLCBhbmQgY2FsbGJhY2sgZnVuY3Rpb24sIG92ZXJ3cml0ZSBpdCBzbyB0aGF0IGl0IGNhbGxzXG5cdCAgICAgKiBwcmludFN0YWNrVHJhY2UoKSBmaXJzdCB3aXRoIGEgY2FsbGJhY2sgYW5kIHRoZW4gcnVucyB0aGUgcmVzdCBvZiB0aGUgYm9keS5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0ge09iamVjdH0gY29udGV4dCBvZiBleGVjdXRpb24gKGUuZy4gd2luZG93KVxuXHQgICAgICogQHBhcmFtIHtTdHJpbmd9IGZ1bmN0aW9uTmFtZSB0byBpbnN0cnVtZW50XG5cdCAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvbiB0byBjYWxsIHdpdGggYSBzdGFjayB0cmFjZSBvbiBpbnZvY2F0aW9uXG5cdCAgICAgKi9cblx0ICAgIGluc3RydW1lbnRGdW5jdGlvbjogZnVuY3Rpb24oY29udGV4dCwgZnVuY3Rpb25OYW1lLCBjYWxsYmFjaykge1xuXHQgICAgICAgIGNvbnRleHQgPSBjb250ZXh0IHx8IHdpbmRvdztcblx0ICAgICAgICB2YXIgb3JpZ2luYWwgPSBjb250ZXh0W2Z1bmN0aW9uTmFtZV07XG5cdCAgICAgICAgY29udGV4dFtmdW5jdGlvbk5hbWVdID0gZnVuY3Rpb24gaW5zdHJ1bWVudGVkKCkge1xuXHQgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIHByaW50U3RhY2tUcmFjZSgpLnNsaWNlKDQpKTtcblx0ICAgICAgICAgICAgcmV0dXJuIGNvbnRleHRbZnVuY3Rpb25OYW1lXS5faW5zdHJ1bWVudGVkLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdCAgICAgICAgfTtcblx0ICAgICAgICBjb250ZXh0W2Z1bmN0aW9uTmFtZV0uX2luc3RydW1lbnRlZCA9IG9yaWdpbmFsO1xuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBHaXZlbiBhIGNvbnRleHQgYW5kIGZ1bmN0aW9uIG5hbWUgb2YgYSBmdW5jdGlvbiB0aGF0IGhhcyBiZWVuXG5cdCAgICAgKiBpbnN0cnVtZW50ZWQsIHJldmVydCB0aGUgZnVuY3Rpb24gdG8gaXQncyBvcmlnaW5hbCAobm9uLWluc3RydW1lbnRlZClcblx0ICAgICAqIHN0YXRlLlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0IG9mIGV4ZWN1dGlvbiAoZS5nLiB3aW5kb3cpXG5cdCAgICAgKiBAcGFyYW0ge1N0cmluZ30gZnVuY3Rpb25OYW1lIHRvIGRlLWluc3RydW1lbnRcblx0ICAgICAqL1xuXHQgICAgZGVpbnN0cnVtZW50RnVuY3Rpb246IGZ1bmN0aW9uKGNvbnRleHQsIGZ1bmN0aW9uTmFtZSkge1xuXHQgICAgICAgIGlmIChjb250ZXh0W2Z1bmN0aW9uTmFtZV0uY29uc3RydWN0b3IgPT09IEZ1bmN0aW9uICYmXG5cdCAgICAgICAgICAgICAgICBjb250ZXh0W2Z1bmN0aW9uTmFtZV0uX2luc3RydW1lbnRlZCAmJlxuXHQgICAgICAgICAgICAgICAgY29udGV4dFtmdW5jdGlvbk5hbWVdLl9pbnN0cnVtZW50ZWQuY29uc3RydWN0b3IgPT09IEZ1bmN0aW9uKSB7XG5cdCAgICAgICAgICAgIGNvbnRleHRbZnVuY3Rpb25OYW1lXSA9IGNvbnRleHRbZnVuY3Rpb25OYW1lXS5faW5zdHJ1bWVudGVkO1xuXHQgICAgICAgIH1cblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2l2ZW4gYW4gRXJyb3Igb2JqZWN0LCByZXR1cm4gYSBmb3JtYXR0ZWQgQXJyYXkgYmFzZWQgb24gQ2hyb21lJ3Mgc3RhY2sgc3RyaW5nLlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSBlIC0gRXJyb3Igb2JqZWN0IHRvIGluc3BlY3Rcblx0ICAgICAqIEByZXR1cm4gQXJyYXk8U3RyaW5nPiBvZiBmdW5jdGlvbiBjYWxscywgZmlsZXMgYW5kIGxpbmUgbnVtYmVyc1xuXHQgICAgICovXG5cdCAgICBjaHJvbWU6IGZ1bmN0aW9uKGUpIHtcblx0ICAgICAgICB2YXIgc3RhY2sgPSAoZS5zdGFjayArICdcXG4nKS5yZXBsYWNlKC9eXFxTW15cXChdKz9bXFxuJF0vZ20sICcnKS5cblx0ICAgICAgICAgIHJlcGxhY2UoL15cXHMrKGF0IGV2YWwgKT9hdFxccysvZ20sICcnKS5cblx0ICAgICAgICAgIHJlcGxhY2UoL14oW15cXChdKz8pKFtcXG4kXSkvZ20sICd7YW5vbnltb3VzfSgpQCQxJDInKS5cblx0ICAgICAgICAgIHJlcGxhY2UoL15PYmplY3QuPGFub255bW91cz5cXHMqXFwoKFteXFwpXSspXFwpL2dtLCAne2Fub255bW91c30oKUAkMScpLnNwbGl0KCdcXG4nKTtcblx0ICAgICAgICBzdGFjay5wb3AoKTtcblx0ICAgICAgICByZXR1cm4gc3RhY2s7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdpdmVuIGFuIEVycm9yIG9iamVjdCwgcmV0dXJuIGEgZm9ybWF0dGVkIEFycmF5IGJhc2VkIG9uIFNhZmFyaSdzIHN0YWNrIHN0cmluZy5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0gZSAtIEVycm9yIG9iamVjdCB0byBpbnNwZWN0XG5cdCAgICAgKiBAcmV0dXJuIEFycmF5PFN0cmluZz4gb2YgZnVuY3Rpb24gY2FsbHMsIGZpbGVzIGFuZCBsaW5lIG51bWJlcnNcblx0ICAgICAqL1xuXHQgICAgc2FmYXJpOiBmdW5jdGlvbihlKSB7XG5cdCAgICAgICAgcmV0dXJuIGUuc3RhY2sucmVwbGFjZSgvXFxbbmF0aXZlIGNvZGVcXF1cXG4vbSwgJycpXG5cdCAgICAgICAgICAgIC5yZXBsYWNlKC9eKD89XFx3K0Vycm9yXFw6KS4qJFxcbi9tLCAnJylcblx0ICAgICAgICAgICAgLnJlcGxhY2UoL15AL2dtLCAne2Fub255bW91c30oKUAnKVxuXHQgICAgICAgICAgICAuc3BsaXQoJ1xcbicpO1xuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBHaXZlbiBhbiBFcnJvciBvYmplY3QsIHJldHVybiBhIGZvcm1hdHRlZCBBcnJheSBiYXNlZCBvbiBJRSdzIHN0YWNrIHN0cmluZy5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0gZSAtIEVycm9yIG9iamVjdCB0byBpbnNwZWN0XG5cdCAgICAgKiBAcmV0dXJuIEFycmF5PFN0cmluZz4gb2YgZnVuY3Rpb24gY2FsbHMsIGZpbGVzIGFuZCBsaW5lIG51bWJlcnNcblx0ICAgICAqL1xuXHQgICAgaWU6IGZ1bmN0aW9uKGUpIHtcblx0ICAgICAgICB2YXIgbGluZVJFID0gL14uKmF0IChcXHcrKSBcXCgoW15cXCldKylcXCkkL2dtO1xuXHQgICAgICAgIHJldHVybiBlLnN0YWNrLnJlcGxhY2UoL2F0IEFub255bW91cyBmdW5jdGlvbiAvZ20sICd7YW5vbnltb3VzfSgpQCcpXG5cdCAgICAgICAgICAgIC5yZXBsYWNlKC9eKD89XFx3K0Vycm9yXFw6KS4qJFxcbi9tLCAnJylcblx0ICAgICAgICAgICAgLnJlcGxhY2UobGluZVJFLCAnJDFAJDInKVxuXHQgICAgICAgICAgICAuc3BsaXQoJ1xcbicpO1xuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBHaXZlbiBhbiBFcnJvciBvYmplY3QsIHJldHVybiBhIGZvcm1hdHRlZCBBcnJheSBiYXNlZCBvbiBGaXJlZm94J3Mgc3RhY2sgc3RyaW5nLlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSBlIC0gRXJyb3Igb2JqZWN0IHRvIGluc3BlY3Rcblx0ICAgICAqIEByZXR1cm4gQXJyYXk8U3RyaW5nPiBvZiBmdW5jdGlvbiBjYWxscywgZmlsZXMgYW5kIGxpbmUgbnVtYmVyc1xuXHQgICAgICovXG5cdCAgICBmaXJlZm94OiBmdW5jdGlvbihlKSB7XG5cdCAgICAgICAgcmV0dXJuIGUuc3RhY2sucmVwbGFjZSgvKD86XFxuQDowKT9cXHMrJC9tLCAnJykucmVwbGFjZSgvXltcXChAXS9nbSwgJ3thbm9ueW1vdXN9KClAJykuc3BsaXQoJ1xcbicpO1xuXHQgICAgfSxcblxuXHQgICAgb3BlcmExMTogZnVuY3Rpb24oZSkge1xuXHQgICAgICAgIHZhciBBTk9OID0gJ3thbm9ueW1vdXN9JywgbGluZVJFID0gL14uKmxpbmUgKFxcZCspLCBjb2x1bW4gKFxcZCspKD86IGluICguKykpPyBpbiAoXFxTKyk6JC87XG5cdCAgICAgICAgdmFyIGxpbmVzID0gZS5zdGFja3RyYWNlLnNwbGl0KCdcXG4nKSwgcmVzdWx0ID0gW107XG5cblx0ICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDIpIHtcblx0ICAgICAgICAgICAgdmFyIG1hdGNoID0gbGluZVJFLmV4ZWMobGluZXNbaV0pO1xuXHQgICAgICAgICAgICBpZiAobWF0Y2gpIHtcblx0ICAgICAgICAgICAgICAgIHZhciBsb2NhdGlvbiA9IG1hdGNoWzRdICsgJzonICsgbWF0Y2hbMV0gKyAnOicgKyBtYXRjaFsyXTtcblx0ICAgICAgICAgICAgICAgIHZhciBmbk5hbWUgPSBtYXRjaFszXSB8fCBcImdsb2JhbCBjb2RlXCI7XG5cdCAgICAgICAgICAgICAgICBmbk5hbWUgPSBmbk5hbWUucmVwbGFjZSgvPGFub255bW91cyBmdW5jdGlvbjogKFxcUyspPi8sIFwiJDFcIikucmVwbGFjZSgvPGFub255bW91cyBmdW5jdGlvbj4vLCBBTk9OKTtcblx0ICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGZuTmFtZSArICdAJyArIGxvY2F0aW9uICsgJyAtLSAnICsgbGluZXNbaSArIDFdLnJlcGxhY2UoL15cXHMrLywgJycpKTtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblxuXHQgICAgICAgIHJldHVybiByZXN1bHQ7XG5cdCAgICB9LFxuXG5cdCAgICBvcGVyYTEwYjogZnVuY3Rpb24oZSkge1xuXHQgICAgICAgIC8vIFwiPGFub255bW91cyBmdW5jdGlvbjogcnVuPihbYXJndW1lbnRzIG5vdCBhdmFpbGFibGVdKUBmaWxlOi8vbG9jYWxob3N0L0c6L2pzL3N0YWNrdHJhY2UuanM6MjdcXG5cIiArXG5cdCAgICAgICAgLy8gXCJwcmludFN0YWNrVHJhY2UoW2FyZ3VtZW50cyBub3QgYXZhaWxhYmxlXSlAZmlsZTovL2xvY2FsaG9zdC9HOi9qcy9zdGFja3RyYWNlLmpzOjE4XFxuXCIgK1xuXHQgICAgICAgIC8vIFwiQGZpbGU6Ly9sb2NhbGhvc3QvRzovanMvdGVzdC9mdW5jdGlvbmFsL3Rlc3RjYXNlMS5odG1sOjE1XCJcblx0ICAgICAgICB2YXIgbGluZVJFID0gL14oLiopQCguKyk6KFxcZCspJC87XG5cdCAgICAgICAgdmFyIGxpbmVzID0gZS5zdGFja3RyYWNlLnNwbGl0KCdcXG4nKSwgcmVzdWx0ID0gW107XG5cblx0ICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0ICAgICAgICAgICAgdmFyIG1hdGNoID0gbGluZVJFLmV4ZWMobGluZXNbaV0pO1xuXHQgICAgICAgICAgICBpZiAobWF0Y2gpIHtcblx0ICAgICAgICAgICAgICAgIHZhciBmbk5hbWUgPSBtYXRjaFsxXT8gKG1hdGNoWzFdICsgJygpJykgOiBcImdsb2JhbCBjb2RlXCI7XG5cdCAgICAgICAgICAgICAgICByZXN1bHQucHVzaChmbk5hbWUgKyAnQCcgKyBtYXRjaFsyXSArICc6JyArIG1hdGNoWzNdKTtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblxuXHQgICAgICAgIHJldHVybiByZXN1bHQ7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdpdmVuIGFuIEVycm9yIG9iamVjdCwgcmV0dXJuIGEgZm9ybWF0dGVkIEFycmF5IGJhc2VkIG9uIE9wZXJhIDEwJ3Mgc3RhY2t0cmFjZSBzdHJpbmcuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIGUgLSBFcnJvciBvYmplY3QgdG8gaW5zcGVjdFxuXHQgICAgICogQHJldHVybiBBcnJheTxTdHJpbmc+IG9mIGZ1bmN0aW9uIGNhbGxzLCBmaWxlcyBhbmQgbGluZSBudW1iZXJzXG5cdCAgICAgKi9cblx0ICAgIG9wZXJhMTBhOiBmdW5jdGlvbihlKSB7XG5cdCAgICAgICAgLy8gXCIgIExpbmUgMjcgb2YgbGlua2VkIHNjcmlwdCBmaWxlOi8vbG9jYWxob3N0L0c6L2pzL3N0YWNrdHJhY2UuanNcXG5cIlxuXHQgICAgICAgIC8vIFwiICBMaW5lIDExIG9mIGlubGluZSMxIHNjcmlwdCBpbiBmaWxlOi8vbG9jYWxob3N0L0c6L2pzL3Rlc3QvZnVuY3Rpb25hbC90ZXN0Y2FzZTEuaHRtbDogSW4gZnVuY3Rpb24gZm9vXFxuXCJcblx0ICAgICAgICB2YXIgQU5PTiA9ICd7YW5vbnltb3VzfScsIGxpbmVSRSA9IC9MaW5lIChcXGQrKS4qc2NyaXB0ICg/OmluICk/KFxcUyspKD86OiBJbiBmdW5jdGlvbiAoXFxTKykpPyQvaTtcblx0ICAgICAgICB2YXIgbGluZXMgPSBlLnN0YWNrdHJhY2Uuc3BsaXQoJ1xcbicpLCByZXN1bHQgPSBbXTtcblxuXHQgICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMikge1xuXHQgICAgICAgICAgICB2YXIgbWF0Y2ggPSBsaW5lUkUuZXhlYyhsaW5lc1tpXSk7XG5cdCAgICAgICAgICAgIGlmIChtYXRjaCkge1xuXHQgICAgICAgICAgICAgICAgdmFyIGZuTmFtZSA9IG1hdGNoWzNdIHx8IEFOT047XG5cdCAgICAgICAgICAgICAgICByZXN1bHQucHVzaChmbk5hbWUgKyAnKClAJyArIG1hdGNoWzJdICsgJzonICsgbWF0Y2hbMV0gKyAnIC0tICcgKyBsaW5lc1tpICsgMV0ucmVwbGFjZSgvXlxccysvLCAnJykpO1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXG5cdCAgICAgICAgcmV0dXJuIHJlc3VsdDtcblx0ICAgIH0sXG5cblx0ICAgIC8vIE9wZXJhIDcueC05LjJ4IG9ubHkhXG5cdCAgICBvcGVyYTk6IGZ1bmN0aW9uKGUpIHtcblx0ICAgICAgICAvLyBcIiAgTGluZSA0MyBvZiBsaW5rZWQgc2NyaXB0IGZpbGU6Ly9sb2NhbGhvc3QvRzovanMvc3RhY2t0cmFjZS5qc1xcblwiXG5cdCAgICAgICAgLy8gXCIgIExpbmUgNyBvZiBpbmxpbmUjMSBzY3JpcHQgaW4gZmlsZTovL2xvY2FsaG9zdC9HOi9qcy90ZXN0L2Z1bmN0aW9uYWwvdGVzdGNhc2UxLmh0bWxcXG5cIlxuXHQgICAgICAgIHZhciBBTk9OID0gJ3thbm9ueW1vdXN9JywgbGluZVJFID0gL0xpbmUgKFxcZCspLipzY3JpcHQgKD86aW4gKT8oXFxTKykvaTtcblx0ICAgICAgICB2YXIgbGluZXMgPSBlLm1lc3NhZ2Uuc3BsaXQoJ1xcbicpLCByZXN1bHQgPSBbXTtcblxuXHQgICAgICAgIGZvciAodmFyIGkgPSAyLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMikge1xuXHQgICAgICAgICAgICB2YXIgbWF0Y2ggPSBsaW5lUkUuZXhlYyhsaW5lc1tpXSk7XG5cdCAgICAgICAgICAgIGlmIChtYXRjaCkge1xuXHQgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goQU5PTiArICcoKUAnICsgbWF0Y2hbMl0gKyAnOicgKyBtYXRjaFsxXSArICcgLS0gJyArIGxpbmVzW2kgKyAxXS5yZXBsYWNlKC9eXFxzKy8sICcnKSk7XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICB9XG5cblx0ICAgICAgICByZXR1cm4gcmVzdWx0O1xuXHQgICAgfSxcblxuXHQgICAgLy8gU2FmYXJpIDUtLCBJRSA5LSwgYW5kIG90aGVyc1xuXHQgICAgb3RoZXI6IGZ1bmN0aW9uKGN1cnIpIHtcblx0ICAgICAgICB2YXIgQU5PTiA9ICd7YW5vbnltb3VzfScsIGZuUkUgPSAvZnVuY3Rpb25cXHMqKFtcXHdcXC0kXSspP1xccypcXCgvaSwgc3RhY2sgPSBbXSwgZm4sIGFyZ3MsIG1heFN0YWNrU2l6ZSA9IDEwO1xuXHQgICAgICAgIHdoaWxlIChjdXJyICYmIGN1cnJbJ2FyZ3VtZW50cyddICYmIHN0YWNrLmxlbmd0aCA8IG1heFN0YWNrU2l6ZSkge1xuXHQgICAgICAgICAgICBmbiA9IGZuUkUudGVzdChjdXJyLnRvU3RyaW5nKCkpID8gUmVnRXhwLiQxIHx8IEFOT04gOiBBTk9OO1xuXHQgICAgICAgICAgICBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoY3VyclsnYXJndW1lbnRzJ10gfHwgW10pO1xuXHQgICAgICAgICAgICBzdGFja1tzdGFjay5sZW5ndGhdID0gZm4gKyAnKCcgKyB0aGlzLnN0cmluZ2lmeUFyZ3VtZW50cyhhcmdzKSArICcpJztcblx0ICAgICAgICAgICAgY3VyciA9IGN1cnIuY2FsbGVyO1xuXHQgICAgICAgIH1cblx0ICAgICAgICByZXR1cm4gc3RhY2s7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdpdmVuIGFyZ3VtZW50cyBhcnJheSBhcyBhIFN0cmluZywgc3Vic3RpdHV0aW5nIHR5cGUgbmFtZXMgZm9yIG5vbi1zdHJpbmcgdHlwZXMuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIHtBcmd1bWVudHMsQXJyYXl9IGFyZ3Ncblx0ICAgICAqIEByZXR1cm4ge1N0cmluZ30gc3RyaW5naWZpZWQgYXJndW1lbnRzXG5cdCAgICAgKi9cblx0ICAgIHN0cmluZ2lmeUFyZ3VtZW50czogZnVuY3Rpb24oYXJncykge1xuXHQgICAgICAgIHZhciByZXN1bHQgPSBbXTtcblx0ICAgICAgICB2YXIgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG5cdCAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgKytpKSB7XG5cdCAgICAgICAgICAgIHZhciBhcmcgPSBhcmdzW2ldO1xuXHQgICAgICAgICAgICBpZiAoYXJnID09PSB1bmRlZmluZWQpIHtcblx0ICAgICAgICAgICAgICAgIHJlc3VsdFtpXSA9ICd1bmRlZmluZWQnO1xuXHQgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZyA9PT0gbnVsbCkge1xuXHQgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gJ251bGwnO1xuXHQgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZy5jb25zdHJ1Y3Rvcikge1xuXHQgICAgICAgICAgICAgICAgaWYgKGFyZy5jb25zdHJ1Y3RvciA9PT0gQXJyYXkpIHtcblx0ICAgICAgICAgICAgICAgICAgICBpZiAoYXJnLmxlbmd0aCA8IDMpIHtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gJ1snICsgdGhpcy5zdHJpbmdpZnlBcmd1bWVudHMoYXJnKSArICddJztcblx0ICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXHQgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSAnWycgKyB0aGlzLnN0cmluZ2lmeUFyZ3VtZW50cyhzbGljZS5jYWxsKGFyZywgMCwgMSkpICsgJy4uLicgKyB0aGlzLnN0cmluZ2lmeUFyZ3VtZW50cyhzbGljZS5jYWxsKGFyZywgLTEpKSArICddJztcblx0ICAgICAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZy5jb25zdHJ1Y3RvciA9PT0gT2JqZWN0KSB7XG5cdCAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gJyNvYmplY3QnO1xuXHQgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhcmcuY29uc3RydWN0b3IgPT09IEZ1bmN0aW9uKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gJyNmdW5jdGlvbic7XG5cdCAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZy5jb25zdHJ1Y3RvciA9PT0gU3RyaW5nKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gJ1wiJyArIGFyZyArICdcIic7XG5cdCAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZy5jb25zdHJ1Y3RvciA9PT0gTnVtYmVyKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gYXJnO1xuXHQgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiByZXN1bHQuam9pbignLCcpO1xuXHQgICAgfSxcblxuXHQgICAgc291cmNlQ2FjaGU6IHt9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEByZXR1cm4gdGhlIHRleHQgZnJvbSBhIGdpdmVuIFVSTFxuXHQgICAgICovXG5cdCAgICBhamF4OiBmdW5jdGlvbih1cmwpIHtcblx0ICAgICAgICB2YXIgcmVxID0gdGhpcy5jcmVhdGVYTUxIVFRQT2JqZWN0KCk7XG5cdCAgICAgICAgaWYgKHJlcSkge1xuXHQgICAgICAgICAgICB0cnkge1xuXHQgICAgICAgICAgICAgICAgcmVxLm9wZW4oJ0dFVCcsIHVybCwgZmFsc2UpO1xuXHQgICAgICAgICAgICAgICAgLy9yZXEub3ZlcnJpZGVNaW1lVHlwZSgndGV4dC9wbGFpbicpO1xuXHQgICAgICAgICAgICAgICAgLy9yZXEub3ZlcnJpZGVNaW1lVHlwZSgndGV4dC9qYXZhc2NyaXB0Jyk7XG5cdCAgICAgICAgICAgICAgICByZXEuc2VuZChudWxsKTtcblx0ICAgICAgICAgICAgICAgIC8vcmV0dXJuIHJlcS5zdGF0dXMgPT0gMjAwID8gcmVxLnJlc3BvbnNlVGV4dCA6ICcnO1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuIHJlcS5yZXNwb25zZVRleHQ7XG5cdCAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblx0ICAgICAgICByZXR1cm4gJyc7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIFRyeSBYSFIgbWV0aG9kcyBpbiBvcmRlciBhbmQgc3RvcmUgWEhSIGZhY3RvcnkuXG5cdCAgICAgKlxuXHQgICAgICogQHJldHVybiA8RnVuY3Rpb24+IFhIUiBmdW5jdGlvbiBvciBlcXVpdmFsZW50XG5cdCAgICAgKi9cblx0ICAgIGNyZWF0ZVhNTEhUVFBPYmplY3Q6IGZ1bmN0aW9uKCkge1xuXHQgICAgICAgIHZhciB4bWxodHRwLCBYTUxIdHRwRmFjdG9yaWVzID0gW1xuXHQgICAgICAgICAgICBmdW5jdGlvbigpIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0ICAgICAgICAgICAgfSwgZnVuY3Rpb24oKSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01zeG1sMi5YTUxIVFRQJyk7XG5cdCAgICAgICAgICAgIH0sIGZ1bmN0aW9uKCkge1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNc3htbDMuWE1MSFRUUCcpO1xuXHQgICAgICAgICAgICB9LCBmdW5jdGlvbigpIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTWljcm9zb2Z0LlhNTEhUVFAnKTtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIF07XG5cdCAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBYTUxIdHRwRmFjdG9yaWVzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICAgICAgICAgIHRyeSB7XG5cdCAgICAgICAgICAgICAgICB4bWxodHRwID0gWE1MSHR0cEZhY3Rvcmllc1tpXSgpO1xuXHQgICAgICAgICAgICAgICAgLy8gVXNlIG1lbW9pemF0aW9uIHRvIGNhY2hlIHRoZSBmYWN0b3J5XG5cdCAgICAgICAgICAgICAgICB0aGlzLmNyZWF0ZVhNTEhUVFBPYmplY3QgPSBYTUxIdHRwRmFjdG9yaWVzW2ldO1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuIHhtbGh0dHA7XG5cdCAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2l2ZW4gYSBVUkwsIGNoZWNrIGlmIGl0IGlzIGluIHRoZSBzYW1lIGRvbWFpbiAoc28gd2UgY2FuIGdldCB0aGUgc291cmNlXG5cdCAgICAgKiB2aWEgQWpheCkuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIHVybCA8U3RyaW5nPiBzb3VyY2UgdXJsXG5cdCAgICAgKiBAcmV0dXJuIDxCb29sZWFuPiBGYWxzZSBpZiB3ZSBuZWVkIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3Rcblx0ICAgICAqL1xuXHQgICAgaXNTYW1lRG9tYWluOiBmdW5jdGlvbih1cmwpIHtcblx0ICAgICAgICByZXR1cm4gdHlwZW9mIGxvY2F0aW9uICE9PSBcInVuZGVmaW5lZFwiICYmIHVybC5pbmRleE9mKGxvY2F0aW9uLmhvc3RuYW1lKSAhPT0gLTE7IC8vIGxvY2F0aW9uIG1heSBub3QgYmUgZGVmaW5lZCwgZS5nLiB3aGVuIHJ1bm5pbmcgZnJvbSBub2RlanMuXG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdldCBzb3VyY2UgY29kZSBmcm9tIGdpdmVuIFVSTCBpZiBpbiB0aGUgc2FtZSBkb21haW4uXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIHVybCA8U3RyaW5nPiBKUyBzb3VyY2UgVVJMXG5cdCAgICAgKiBAcmV0dXJuIDxBcnJheT4gQXJyYXkgb2Ygc291cmNlIGNvZGUgbGluZXNcblx0ICAgICAqL1xuXHQgICAgZ2V0U291cmNlOiBmdW5jdGlvbih1cmwpIHtcblx0ICAgICAgICAvLyBUT0RPIHJldXNlIHNvdXJjZSBmcm9tIHNjcmlwdCB0YWdzP1xuXHQgICAgICAgIGlmICghKHVybCBpbiB0aGlzLnNvdXJjZUNhY2hlKSkge1xuXHQgICAgICAgICAgICB0aGlzLnNvdXJjZUNhY2hlW3VybF0gPSB0aGlzLmFqYXgodXJsKS5zcGxpdCgnXFxuJyk7XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiB0aGlzLnNvdXJjZUNhY2hlW3VybF07XG5cdCAgICB9LFxuXG5cdCAgICBndWVzc0Fub255bW91c0Z1bmN0aW9uczogZnVuY3Rpb24oc3RhY2spIHtcblx0ICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0YWNrLmxlbmd0aDsgKytpKSB7XG5cdCAgICAgICAgICAgIHZhciByZVN0YWNrID0gL1xce2Fub255bW91c1xcfVxcKC4qXFwpQCguKikvLFxuXHQgICAgICAgICAgICAgICAgcmVSZWYgPSAvXiguKj8pKD86OihcXGQrKSkoPzo6KFxcZCspKT8oPzogLS0gLispPyQvLFxuXHQgICAgICAgICAgICAgICAgZnJhbWUgPSBzdGFja1tpXSwgcmVmID0gcmVTdGFjay5leGVjKGZyYW1lKTtcblxuXHQgICAgICAgICAgICBpZiAocmVmKSB7XG5cdCAgICAgICAgICAgICAgICB2YXIgbSA9IHJlUmVmLmV4ZWMocmVmWzFdKTtcblx0ICAgICAgICAgICAgICAgIGlmIChtKSB7IC8vIElmIGZhbHNleSwgd2UgZGlkIG5vdCBnZXQgYW55IGZpbGUvbGluZSBpbmZvcm1hdGlvblxuXHQgICAgICAgICAgICAgICAgICAgIHZhciBmaWxlID0gbVsxXSwgbGluZW5vID0gbVsyXSwgY2hhcm5vID0gbVszXSB8fCAwO1xuXHQgICAgICAgICAgICAgICAgICAgIGlmIChmaWxlICYmIHRoaXMuaXNTYW1lRG9tYWluKGZpbGUpICYmIGxpbmVubykge1xuXHQgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZnVuY3Rpb25OYW1lID0gdGhpcy5ndWVzc0Fub255bW91c0Z1bmN0aW9uKGZpbGUsIGxpbmVubywgY2hhcm5vKTtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbaV0gPSBmcmFtZS5yZXBsYWNlKCd7YW5vbnltb3VzfScsIGZ1bmN0aW9uTmFtZSk7XG5cdCAgICAgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiBzdGFjaztcblx0ICAgIH0sXG5cblx0ICAgIGd1ZXNzQW5vbnltb3VzRnVuY3Rpb246IGZ1bmN0aW9uKHVybCwgbGluZU5vLCBjaGFyTm8pIHtcblx0ICAgICAgICB2YXIgcmV0O1xuXHQgICAgICAgIHRyeSB7XG5cdCAgICAgICAgICAgIHJldCA9IHRoaXMuZmluZEZ1bmN0aW9uTmFtZSh0aGlzLmdldFNvdXJjZSh1cmwpLCBsaW5lTm8pO1xuXHQgICAgICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgICAgICAgICAgcmV0ID0gJ2dldFNvdXJjZSBmYWlsZWQgd2l0aCB1cmw6ICcgKyB1cmwgKyAnLCBleGNlcHRpb246ICcgKyBlLnRvU3RyaW5nKCk7XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiByZXQ7XG5cdCAgICB9LFxuXG5cdCAgICBmaW5kRnVuY3Rpb25OYW1lOiBmdW5jdGlvbihzb3VyY2UsIGxpbmVObykge1xuXHQgICAgICAgIC8vIEZJWE1FIGZpbmRGdW5jdGlvbk5hbWUgZmFpbHMgZm9yIGNvbXByZXNzZWQgc291cmNlXG5cdCAgICAgICAgLy8gKG1vcmUgdGhhbiBvbmUgZnVuY3Rpb24gb24gdGhlIHNhbWUgbGluZSlcblx0ICAgICAgICAvLyBmdW5jdGlvbiB7bmFtZX0oe2FyZ3N9KSBtWzFdPW5hbWUgbVsyXT1hcmdzXG5cdCAgICAgICAgdmFyIHJlRnVuY3Rpb25EZWNsYXJhdGlvbiA9IC9mdW5jdGlvblxccysoW14oXSo/KVxccypcXCgoW14pXSopXFwpLztcblx0ICAgICAgICAvLyB7bmFtZX0gPSBmdW5jdGlvbiAoe2FyZ3N9KSBUT0RPIGFyZ3MgY2FwdHVyZVxuXHQgICAgICAgIC8vIC9bJ1wiXT8oWzAtOUEtWmEtel9dKylbJ1wiXT9cXHMqWzo9XVxccypmdW5jdGlvbig/OlteKF0qKS9cblx0ICAgICAgICB2YXIgcmVGdW5jdGlvbkV4cHJlc3Npb24gPSAvWydcIl0/KFskX0EtWmEtel1bJF9BLVphLXowLTldKilbJ1wiXT9cXHMqWzo9XVxccypmdW5jdGlvblxcYi87XG5cdCAgICAgICAgLy8ge25hbWV9ID0gZXZhbCgpXG5cdCAgICAgICAgdmFyIHJlRnVuY3Rpb25FdmFsdWF0aW9uID0gL1snXCJdPyhbJF9BLVphLXpdWyRfQS1aYS16MC05XSopWydcIl0/XFxzKls6PV1cXHMqKD86ZXZhbHxuZXcgRnVuY3Rpb24pXFxiLztcblx0ICAgICAgICAvLyBXYWxrIGJhY2t3YXJkcyBpbiB0aGUgc291cmNlIGxpbmVzIHVudGlsIHdlIGZpbmRcblx0ICAgICAgICAvLyB0aGUgbGluZSB3aGljaCBtYXRjaGVzIG9uZSBvZiB0aGUgcGF0dGVybnMgYWJvdmVcblx0ICAgICAgICB2YXIgY29kZSA9IFwiXCIsIGxpbmUsIG1heExpbmVzID0gTWF0aC5taW4obGluZU5vLCAyMCksIG0sIGNvbW1lbnRQb3M7XG5cdCAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXhMaW5lczsgKytpKSB7XG5cdCAgICAgICAgICAgIC8vIGxpbmVObyBpcyAxLWJhc2VkLCBzb3VyY2VbXSBpcyAwLWJhc2VkXG5cdCAgICAgICAgICAgIGxpbmUgPSBzb3VyY2VbbGluZU5vIC0gaSAtIDFdO1xuXHQgICAgICAgICAgICBjb21tZW50UG9zID0gbGluZS5pbmRleE9mKCcvLycpO1xuXHQgICAgICAgICAgICBpZiAoY29tbWVudFBvcyA+PSAwKSB7XG5cdCAgICAgICAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHIoMCwgY29tbWVudFBvcyk7XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgLy8gVE9ETyBjaGVjayBvdGhlciB0eXBlcyBvZiBjb21tZW50cz8gQ29tbWVudGVkIGNvZGUgbWF5IGxlYWQgdG8gZmFsc2UgcG9zaXRpdmVcblx0ICAgICAgICAgICAgaWYgKGxpbmUpIHtcblx0ICAgICAgICAgICAgICAgIGNvZGUgPSBsaW5lICsgY29kZTtcblx0ICAgICAgICAgICAgICAgIG0gPSByZUZ1bmN0aW9uRXhwcmVzc2lvbi5leGVjKGNvZGUpO1xuXHQgICAgICAgICAgICAgICAgaWYgKG0gJiYgbVsxXSkge1xuXHQgICAgICAgICAgICAgICAgICAgIHJldHVybiBtWzFdO1xuXHQgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAgICAgbSA9IHJlRnVuY3Rpb25EZWNsYXJhdGlvbi5leGVjKGNvZGUpO1xuXHQgICAgICAgICAgICAgICAgaWYgKG0gJiYgbVsxXSkge1xuXHQgICAgICAgICAgICAgICAgICAgIC8vcmV0dXJuIG1bMV0gKyBcIihcIiArIChtWzJdIHx8IFwiXCIpICsgXCIpXCI7XG5cdCAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1bMV07XG5cdCAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgICAgICBtID0gcmVGdW5jdGlvbkV2YWx1YXRpb24uZXhlYyhjb2RlKTtcblx0ICAgICAgICAgICAgICAgIGlmIChtICYmIG1bMV0pIHtcblx0ICAgICAgICAgICAgICAgICAgICByZXR1cm4gbVsxXTtcblx0ICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblx0ICAgICAgICByZXR1cm4gJyg/KSc7XG5cdCAgICB9XG5cdH07XG5cblx0cmV0dXJuIHByaW50U3RhY2tUcmFjZTtcbn0pKTsiLCJ2YXIgcHJpbnRTdGFja1RyYWNlID0gcmVxdWlyZSgnc3RhY2t0cmFjZS1qcycpXHJcbnZhciBwYXJzZXJzID0gcmVxdWlyZSgnLi90cmFjZWxpbmVQYXJzZXInKVxyXG52YXIgbW9kZSA9IHJlcXVpcmUoJy4vZXhjZXB0aW9uTW9kZScpXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGV4KSB7XHJcbiAgICBpZihwYXJzZXJzW21vZGVdID09PSB1bmRlZmluZWQpXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYnJvd3NlciBcIittb2RlK1wiIG5vdCBzdXBwb3J0ZWRcIilcclxuXHJcbiAgICB2YXIgb3B0aW9ucyA9IHVuZGVmaW5lZFxyXG4gICAgaWYoZXggIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGlmKG1vZGUgPT09ICdpZScgJiYgZXgubnVtYmVyID09PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIGV4Lm51bWJlciA9IDEgICAgLy8gd29yayBhcm91bmQgZm9yIHRoaXM6IGh0dHBzOi8vZ2l0aHViLmNvbS9zdGFja3RyYWNlanMvc3RhY2t0cmFjZS5qcy9pc3N1ZXMvODBcclxuICAgICAgICBvcHRpb25zID0ge2U6ZXgsIGd1ZXNzOiB0cnVlfVxyXG4gICAgfVxyXG4gICAgdmFyIHRyYWNlID0gcHJpbnRTdGFja1RyYWNlKG9wdGlvbnMpXHJcblxyXG4gICAgaWYoZXggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRyYWNlLnNwbGljZSgwLDQpIC8vIHN0cmlwIHN0YWNrdHJhY2UtanMgaW50ZXJuYWxzXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHBhcnNlU3RhY2t0cmFjZSh0cmFjZSlcclxufVxyXG5cclxuZnVuY3Rpb24gVHJhY2VJbmZvKHRyYWNlbGluZSkge1xyXG4gICAgdGhpcy50cmFjZWxpbmUgPSB0cmFjZWxpbmVcclxufVxyXG5UcmFjZUluZm8ucHJvdG90eXBlID0ge1xyXG4gICAgZ2V0IGZpbGUoKSB7XHJcbiAgICAgICAgcmV0dXJuIGdldEluZm8odGhpcykuZmlsZVxyXG4gICAgfSxcclxuICAgIGdldCBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZ2V0SW5mbyh0aGlzKS5mdW5jdGlvblxyXG4gICAgfSxcclxuICAgIGdldCBsaW5lKCkge1xyXG4gICAgICAgIHJldHVybiBnZXRJbmZvKHRoaXMpLmxpbmVcclxuICAgIH0sXHJcbiAgICBnZXQgY29sdW1uKCkge1xyXG4gICAgICAgIHJldHVybiBnZXRJbmZvKHRoaXMpLmNvbHVtblxyXG4gICAgfSxcclxuICAgIGdldCBpbmZvKCkge1xyXG4gICAgICAgIHJldHVybiBnZXRJbmZvKHRoaXMpXHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEluZm8odHJhY2VJbmZvKSB7XHJcbiAgICBpZih0cmFjZUluZm8uY2FjaGUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHZhciBpbmZvID0gcGFyc2Vyc1ttb2RlXSh0cmFjZUluZm8udHJhY2VsaW5lKVxyXG4gICAgICAgIGlmKGluZm8ubGluZSAhPT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICBpbmZvLmxpbmUgPSBwYXJzZUludChpbmZvLmxpbmUpXHJcbiAgICAgICAgaWYoaW5mby5jb2x1bW4gIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgaW5mby5jb2x1bW4gPSBwYXJzZUludChpbmZvLmNvbHVtbilcclxuXHJcbiAgICAgICAgdHJhY2VJbmZvLmNhY2hlID0gaW5mb1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0cmFjZUluZm8uY2FjaGVcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VTdGFja3RyYWNlKHRyYWNlKSB7XHJcbiAgICB2YXIgcmVzdWx0cyA9IFtdXHJcbiAgICBmb3IodmFyIG4gPSAwOyBuPHRyYWNlLmxlbmd0aDsgbisrKSB7XHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKG5ldyBUcmFjZUluZm8odHJhY2Vbbl0pKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdHNcclxufVxyXG5cclxuLy8gaGVyZSBiZWNhdXNlIGknbSBsYXp5LCB0aGV5J3JlIGhlcmUgZm9yIHRlc3Rpbmcgb25seVxyXG5tb2R1bGUuZXhwb3J0cy5wYXJzZXJzID0gcGFyc2Vyc1xyXG5tb2R1bGUuZXhwb3J0cy5tb2RlID0gbW9kZVxyXG5tb2R1bGUuZXhwb3J0cy5zb3VyY2VDYWNoZSA9IHByaW50U3RhY2tUcmFjZS5pbXBsZW1lbnRhdGlvbi5wcm90b3R5cGUuc291cmNlQ2FjaGUgLy8gZXhwb3NlIHRoaXMgc28geW91IGNhbiBjb25zb2xpZGF0ZSBjYWNoZXMgdG9nZXRoZXIgZnJvbSBkaWZmZXJlbnQgbGlicmFyaWVzXHJcbiIsIlxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIGNocm9tZTogZnVuY3Rpb24obGluZSkge1xyXG4gICAgICAgIHZhciBtID0gbGluZS5tYXRjaChDSFJPTUVfU1RBQ0tfTElORSk7XHJcbiAgICAgICAgaWYgKG0pIHtcclxuICAgICAgICAgICAgdmFyIGZpbGUgPSBtWzldIHx8IG1bMThdIHx8IG1bMjZdXHJcbiAgICAgICAgICAgIHZhciBmbiA9IG1bNF0gfHwgbVs3XSB8fCBtWzE0XSB8fCBtWzIzXVxyXG4gICAgICAgICAgICB2YXIgbGluZU51bWJlciA9IG1bMTFdIHx8IG1bMjBdXHJcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBtWzEzXSB8fCBtWzIyXVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgcGFyc2UgZXhjZXB0aW9uIGxpbmU6IFwiK2xpbmUpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGZpbGU6IGZpbGUsXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uOiBmbixcclxuICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcclxuICAgICAgICAgICAgY29sdW1uOiBjb2x1bW5cclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBmaXJlZm94OiBmdW5jdGlvbihsaW5lKSB7XHJcbiAgICAgICAgdmFyIG0gPSBsaW5lLm1hdGNoKEZJUkVGT1hfU1RBQ0tfTElORSk7XHJcbiAgICAgICAgaWYgKG0pIHtcclxuICAgICAgICAgICAgdmFyIGZpbGUgPSBtWzhdXHJcbiAgICAgICAgICAgIHZhciBmbiA9IG1bMV1cclxuICAgICAgICAgICAgdmFyIGxpbmVOdW1iZXIgPSBtWzEwXVxyXG4gICAgICAgICAgICB2YXIgY29sdW1uID0gbVsxMl1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZmlsZTogZmlsZSxcclxuICAgICAgICAgICAgZnVuY3Rpb246IGZuLFxyXG4gICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxyXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcclxuICAgIGllOiBmdW5jdGlvbihsaW5lKSB7XHJcbiAgICAgICAgdmFyIG0gPSBsaW5lLm1hdGNoKElFX1NUQUNLX0xJTkUpO1xyXG4gICAgICAgIGlmIChtKSB7XHJcbiAgICAgICAgICAgIHZhciBmaWxlID0gbVszXSB8fCBtWzEwXVxyXG4gICAgICAgICAgICB2YXIgZm4gPSBtWzJdIHx8IG1bOV1cclxuICAgICAgICAgICAgdmFyIGxpbmVOdW1iZXIgPSBtWzVdIHx8IG1bMTJdXHJcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBtWzddIHx8IG1bMTRdXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGZpbGU6IGZpbGUsXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uOiBmbixcclxuICAgICAgICAgICAgbGluZTogbGluZU51bWJlcixcclxuICAgICAgICAgICAgY29sdW1uOiBjb2x1bW5cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFRoZSBmb2xsb3dpbmcgMiByZWdleCBwYXR0ZXJucyB3ZXJlIG9yaWdpbmFsbHkgdGFrZW4gZnJvbSBnb29nbGUgY2xvc3VyZSBsaWJyYXJ5OiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nsb3N1cmUtbGlicmFyeS9zb3VyY2UvYnJvd3NlL2Nsb3N1cmUvZ29vZy90ZXN0aW5nL3N0YWNrdHJhY2UuanNcclxuLy8gUmVnRXhwIHBhdHRlcm4gZm9yIEphdmFTY3JpcHQgaWRlbnRpZmllcnMuIFdlIGRvbid0IHN1cHBvcnQgVW5pY29kZSBpZGVudGlmaWVycyBkZWZpbmVkIGluIEVDTUFTY3JpcHQgdjMuXHJcbnZhciBJREVOVElGSUVSX1BBVFRFUk5fID0gJ1thLXpBLVpfJF1bXFxcXHckXSonO1xyXG4vLyBSZWdFeHAgcGF0dGVybiBmb3IgYW4gVVJMICsgcG9zaXRpb24gaW5zaWRlIHRoZSBmaWxlLlxyXG52YXIgVVJMX1BBVFRFUk5fID0gJygoPzpodHRwfGh0dHBzfGZpbGUpOi8vW15cXFxccyldKz98amF2YXNjcmlwdDouKiknO1xyXG52YXIgRklMRV9BTkRfTElORSA9IFVSTF9QQVRURVJOXysnKDooXFxcXGQqKSg6KFxcXFxkKikpPyknXHJcblxyXG52YXIgU1RBQ0tUUkFDRV9KU19HRVRTT1VSQ0VfRkFJTFVSRSA9ICdnZXRTb3VyY2UgZmFpbGVkIHdpdGggdXJsJ1xyXG5cclxudmFyIENIUk9NRV9TVEFDS1RSQUNFX0pTX0dFVFNPVVJDRV9GQUlMVVJFID0gU1RBQ0tUUkFDRV9KU19HRVRTT1VSQ0VfRkFJTFVSRSsnKCg/IScrJ1xcXFwoXFxcXClAJysnKS4pKidcclxuXHJcbnZhciBDSFJPTUVfRklMRV9BTkRfTElORSA9IEZJTEVfQU5EX0xJTkUvL1VSTF9QQVRURVJOXysnKDooXFxcXGQqKTooXFxcXGQqKSknXHJcbnZhciBDSFJPTUVfSURFTlRJRklFUl9QQVRURVJOID0gJ1xcXFw8PycrSURFTlRJRklFUl9QQVRURVJOXysnXFxcXD4/J1xyXG52YXIgQ0hST01FX0NPTVBPVU5EX0lERU5USUZJRVIgPSBcIigobmV3ICk/XCIrQ0hST01FX0lERU5USUZJRVJfUEFUVEVSTisnKFxcXFwuJytDSFJPTUVfSURFTlRJRklFUl9QQVRURVJOKycpKikoIFxcXFxbYXMgJytJREVOVElGSUVSX1BBVFRFUk5fKyddKT8nXHJcbnZhciBDSFJPTUVfVU5LTk9XTl9JREVOVElGSUVSID0gXCIoXFxcXChcXFxcP1xcXFwpKVwiXHJcblxyXG4vLyBvdXRwdXQgZnJvbSBzdGFja3RyYWNlLmpzIGlzOiBcIm5hbWUoKUAuLi5cIiBpbnN0ZWFkIG9mIFwibmFtZSAoLi4uKVwiXHJcbnZhciBDSFJPTUVfQU5PTllNT1VTX0ZVTkNUSU9OID0gJygnK0NIUk9NRV9TVEFDS1RSQUNFX0pTX0dFVFNPVVJDRV9GQUlMVVJFKyd8JytDSFJPTUVfQ09NUE9VTkRfSURFTlRJRklFUisnfCcrQ0hST01FX1VOS05PV05fSURFTlRJRklFUisnKSdcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKydcXFxcKFxcXFwpJysnQCcrQ0hST01FX0ZJTEVfQU5EX0xJTkVcclxudmFyIENIUk9NRV9OT1JNQUxfRlVOQ1RJT04gPSBDSFJPTUVfQ09NUE9VTkRfSURFTlRJRklFUisnIFxcXFwoJytDSFJPTUVfRklMRV9BTkRfTElORSsnXFxcXCknXHJcbnZhciBDSFJPTUVfTkFUSVZFX0ZVTkNUSU9OID0gQ0hST01FX0NPTVBPVU5EX0lERU5USUZJRVIrJyAoXFxcXChuYXRpdmVcXFxcKSknXHJcblxyXG52YXIgQ0hST01FX0ZVTkNUSU9OX0NBTEwgPSAnKCcrQ0hST01FX0FOT05ZTU9VU19GVU5DVElPTitcInxcIitDSFJPTUVfTk9STUFMX0ZVTkNUSU9OK1wifFwiK0NIUk9NRV9OQVRJVkVfRlVOQ1RJT04rJyknXHJcblxyXG52YXIgQ0hST01FX1NUQUNLX0xJTkUgPSBuZXcgUmVnRXhwKCdeJytDSFJPTUVfRlVOQ1RJT05fQ0FMTCsnJCcpICAvLyBwcmVjb21waWxlIHRoZW0gc28gaXRzIGZhc3RlclxyXG5cclxuXHJcbnZhciBGSVJFRk9YX1NUQUNLVFJBQ0VfSlNfR0VUU09VUkNFX0ZBSUxVUkUgPSBTVEFDS1RSQUNFX0pTX0dFVFNPVVJDRV9GQUlMVVJFKycoKD8hJysnXFxcXChcXFxcKUAnKycpLikqJysnXFxcXChcXFxcKSdcclxudmFyIEZJUkVGT1hfRklMRV9BTkRfTElORSA9IEZJTEVfQU5EX0xJTkUvL1VSTF9QQVRURVJOXysnKCg6KFxcXFxkKik6KFxcXFxkKikpfCg6KFxcXFxkKikpKSdcclxudmFyIEZJUkVGT1hfQVJSQVlfUEFSVCA9ICdcXFxcW1xcXFxkKlxcXFxdJ1xyXG52YXIgRklSRUZPWF9XRUlSRF9QQVJUID0gJ1xcXFwoXFxcXD9cXFxcKSdcclxudmFyIEZJUkVGT1hfQ09NUE9VTkRfSURFTlRJRklFUiA9ICcoKCcrSURFTlRJRklFUl9QQVRURVJOXysnfCcrRklSRUZPWF9BUlJBWV9QQVJUKyd8JytGSVJFRk9YX1dFSVJEX1BBUlQrJykoKFxcXFwoXFxcXCkpP3woXFxcXC58XFxcXDx8LykqKSkqJ1xyXG52YXIgRklSRUZPWF9GVU5DVElPTl9DQUxMID0gJygnK0ZJUkVGT1hfQ09NUE9VTkRfSURFTlRJRklFUisnfCcrRklSRUZPWF9TVEFDS1RSQUNFX0pTX0dFVFNPVVJDRV9GQUlMVVJFKycpQCcrRklSRUZPWF9GSUxFX0FORF9MSU5FXHJcbnZhciBGSVJFRk9YX1NUQUNLX0xJTkUgPSBuZXcgUmVnRXhwKCdeJytGSVJFRk9YX0ZVTkNUSU9OX0NBTEwrJyQnKVxyXG5cclxudmFyIElFX1dISVRFU1BBQ0UgPSAnW1xcXFx3IFxcXFx0XSdcclxudmFyIElFX0ZJTEVfQU5EX0xJTkUgPSBGSUxFX0FORF9MSU5FXHJcbnZhciBJRV9BTk9OWU1PVVMgPSAnKCcrSUVfV0hJVEVTUEFDRSsnKih7YW5vbnltb3VzfVxcXFwoXFxcXCkpKUBcXFxcKCcrSUVfRklMRV9BTkRfTElORSsnXFxcXCknXHJcbnZhciBJRV9OT1JNQUxfRlVOQ1RJT04gPSAnKCcrSURFTlRJRklFUl9QQVRURVJOXysnKUAnK0lFX0ZJTEVfQU5EX0xJTkVcclxudmFyIElFX0ZVTkNUSU9OX0NBTEwgPSAnKCcrSUVfTk9STUFMX0ZVTkNUSU9OKyd8JytJRV9BTk9OWU1PVVMrJyknK0lFX1dISVRFU1BBQ0UrJyonXHJcbnZhciBJRV9TVEFDS19MSU5FID0gbmV3IFJlZ0V4cCgnXicrSUVfRlVOQ1RJT05fQ0FMTCsnJCcpIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiByZXR1cm5SZXN1bHRzKHVuaXRUZXN0T2JqZWN0KSB7XHJcblxyXG4gICAgdmFyIHJlc3VsdHM7XHJcbiAgICB2YXIgZ3JvdXBzID0ge31cclxuICAgIHZhciBncm91cE1ldGFkYXRhID0ge31cclxuXHJcbiAgICB2YXIgcHJpbWFyeUdyb3VwO1xyXG4gICAgdmFyIGVuZGVkID0gZmFsc2VcclxuXHJcbiAgICB1bml0VGVzdE9iamVjdC5ldmVudHMoe1xyXG4gICAgICAgIGdyb3VwOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIHZhciBnID0ge1xyXG4gICAgICAgICAgICAgICBwYXJlbnQ6IGUucGFyZW50LFxyXG4gICAgICAgICAgICAgICBpZDogZS5pZCwgICAgICAgICAgICAgIC8vIGEgdW5pcXVlIGlkIGZvciB0aGUgdGVzdCBncm91cFxyXG4gICAgICAgICAgICAgICB0eXBlOiAnZ3JvdXAnLCAgICAgICAgIC8vIGluZGljYXRlcyBhIHRlc3QgZ3JvdXAgKGVpdGhlciBhIGBVbml0LnRlc3RgIGNhbGwgb3IgYHRoaXMudGVzdGApXHJcbiAgICAgICAgICAgICAgIG5hbWU6IGUubmFtZSwgICAgICAgICAgLy8gdGhlIG5hbWUgb2YgdGhlIHRlc3RcclxuICAgICAgICAgICAgICAgcmVzdWx0czogW10sICAgICAgICAgICAvLyBBbiBhcnJheSBvZiB0ZXN0IHJlc3VsdHMsIHdoaWNoIGNhbiBiZSBvZiBhbiBgVW5pdFRlc3RgIFJlc3VsdCBUeXBlc1xyXG4gICAgICAgICAgICAgICBleGNlcHRpb25zOiBbXSwgICAgICAgIC8vIEFuIGFycmF5IG9mIHVuY2F1Z2h0IGV4Y2VwdGlvbnMgdGhyb3duIGluIHRoZSB0ZXN0LFxyXG4gICAgICAgICAgICAgICB0aW1lOiBlLnRpbWUsXHJcbiAgICAgICAgICAgICAgIGR1cmF0aW9uOiAwICAgICAgICAgICAgLy8gdGhlIGR1cmF0aW9uIG9mIHRoZSB0ZXN0IGZyb20gaXRzIHN0YXJ0IHRpbCB0aGUgbGFzdCB0ZXN0IGFjdGlvbiAoYXNzZXJ0LCBsb2csIGV0YylcclxuICAgICAgICAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICAgIGluY2x1ZGluZyBhc3luY2hyb25vdXMgcGFydHMgYW5kIGluY2x1ZGluZyBzdWJ0ZXN0c1xyXG4gICAgICAgICAgICAgICAvL3N5bmNEdXJhdGlvbjogXywgICAgICAvLyB0aGUgc3luY2hyb25vdXMgZHVyYXRpb24gb2YgdGhlIHRlc3QgKG5vdCBpbmNsdWRpbmcgYW55IGFzeW5jaHJvbm91cyBwYXJ0cylcclxuICAgICAgICAgICAgICAgLy90b3RhbFN5bmNEdXJhdGlvbjogXyAgLy8gc3luY0R1cmF0aW9uIHBsdXMgdGhlIGJlZm9yZSBhbmQgYWZ0ZXIgKGlmIGFwcGxpY2FibGUpXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKHByaW1hcnlHcm91cCA9PT0gdW5kZWZpbmVkKSBwcmltYXJ5R3JvdXAgPSBnXHJcblxyXG4gICAgICAgICAgICBncm91cHNbZS5pZF0gPSBnXHJcbiAgICAgICAgICAgIGdyb3VwTWV0YWRhdGFbZS5pZF0gPSB7fVxyXG4gICAgICAgICAgICBpZihlLnBhcmVudCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRzID0gZ1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZ3JvdXBzW2UucGFyZW50XS5yZXN1bHRzLnB1c2goZylcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYXNzZXJ0OiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGUudHlwZSA9ICdhc3NlcnQnXHJcbiAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0ucmVzdWx0cy5wdXNoKGUpXHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24oZS5wYXJlbnQsIGUudGltZSlcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvdW50OiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGUudHlwZSA9ICdhc3NlcnQnXHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24oZS5wYXJlbnQsIGUudGltZSlcclxuXHJcbiAgICAgICAgICAgIGdyb3VwTWV0YWRhdGFbZS5wYXJlbnRdLmNvdW50SW5mbyA9IGVcclxuICAgICAgICB9LFxyXG4gICAgICAgIGV4Y2VwdGlvbjogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmV4Y2VwdGlvbnMucHVzaChlLmVycm9yKVxyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUucGFyZW50LCBlLnRpbWUpXHJcbiAgICAgICAgfSxcclxuICAgICAgICBsb2c6IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZS50eXBlID0gJ2xvZydcclxuICAgICAgICAgICAgZ3JvdXBzW2UucGFyZW50XS5yZXN1bHRzLnB1c2goZSlcclxuICAgICAgICAgICAgc2V0R3JvdXBEdXJhdGlvbihlLnBhcmVudCwgZS50aW1lKVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYmVmb3JlOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0uYmVmb3JlU3RhcnQgPSBlLnRpbWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIGFmdGVyOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0uYWZ0ZXJTdGFydCA9IGUudGltZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYmVmb3JlRW5kOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0uYmVmb3JlRHVyYXRpb24gPSBlLnRpbWUgLSBncm91cHNbZS5wYXJlbnRdLmJlZm9yZVN0YXJ0XHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZnRlckVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmFmdGVyRHVyYXRpb24gPSBlLnRpbWUgLSBncm91cHNbZS5wYXJlbnRdLmFmdGVyU3RhcnRcclxuICAgICAgICB9LFxyXG4gICAgICAgIGdyb3VwRW5kOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24oZS5pZCwgZS50aW1lKVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZW5kOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlHcm91cC50aW1lb3V0ID0gZS50eXBlID09PSAndGltZW91dCdcclxuICAgICAgICAgICAgc2V0R3JvdXBEdXJhdGlvbihwcmltYXJ5R3JvdXAuaWQsIGUudGltZSlcclxuXHJcbiAgICAgICAgICAgIC8vIG1ha2UgdGhlIGNvdW50IGFzc2VydGlvbnNcclxuICAgICAgICAgICAgZWFjaFRlc3QocHJpbWFyeUdyb3VwLCBmdW5jdGlvbihzdWJ0ZXN0LCBwYXJlbnR0ZXN0KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgY291bnRJbmZvID0gZ3JvdXBNZXRhZGF0YVtzdWJ0ZXN0LmlkXS5jb3VudEluZm9cclxuICAgICAgICAgICAgICAgIGlmKGNvdW50SW5mbyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGluZm8gPSBjb3VudEluZm9cclxuICAgICAgICAgICAgICAgICAgICB2YXIgYWN0dWFsQ291bnQgPSAwXHJcbiAgICAgICAgICAgICAgICAgICAgc3VidGVzdC5yZXN1bHRzLmZvckVhY2goZnVuY3Rpb24oYSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihhLnR5cGUgPT09ICdhc3NlcnQnIHx8IGEudHlwZSA9PT0gJ2dyb3VwJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbENvdW50KytcclxuICAgICAgICAgICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBzdWJ0ZXN0LnJlc3VsdHMuc3BsaWNlKDAsMCx7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogc3VidGVzdC5pZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2Fzc2VydCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGFjdHVhbENvdW50ID09PSBpbmZvLmV4cGVjdGVkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBpbmZvLnRpbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUxpbmVzOiBpbmZvLnNvdXJjZUxpbmVzLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxlOiBpbmZvLmZpbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IGluZm8ubGluZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uOiBpbmZvLmNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IGluZm8uZXhwZWN0ZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbDogYWN0dWFsQ291bnRcclxuICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgICAgZW5kZWQgPSB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuXHJcbiAgICBmdW5jdGlvbiBzZXRHcm91cER1cmF0aW9uKGdyb3VwaWQsIHRpbWUpIHtcclxuICAgICAgICB2YXIgbmV3RHVyYXRpb24gPSB0aW1lIC0gZ3JvdXBzW2dyb3VwaWRdLnRpbWVcclxuICAgICAgICBpZihuZXdEdXJhdGlvbiA+IGdyb3Vwc1tncm91cGlkXS5kdXJhdGlvbikge1xyXG4gICAgICAgICAgICBncm91cHNbZ3JvdXBpZF0uZHVyYXRpb24gPSBuZXdEdXJhdGlvblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYoZ3JvdXBzW2dyb3VwaWRdLnBhcmVudCkge1xyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGdyb3Vwc1tncm91cGlkXS5wYXJlbnQsIHRpbWUpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHRzXHJcbn1cclxuXHJcblxyXG4vLyBpdGVyYXRlcyB0aHJvdWdoIHRoZSB0ZXN0cyBhbmQgc3VidGVzdHMgbGVhdmVzIGZpcnN0IChkZXB0aCBmaXJzdClcclxuZnVuY3Rpb24gZWFjaFRlc3QodGVzdCwgY2FsbGJhY2ssIHBhcmVudCkge1xyXG4gICAgdGVzdC5yZXN1bHRzLmZvckVhY2goZnVuY3Rpb24ocmVzdWx0KSB7XHJcbiAgICAgICAgaWYocmVzdWx0LnR5cGUgPT09ICdncm91cCcpIHtcclxuICAgICAgICAgICAgZWFjaFRlc3QocmVzdWx0LCBjYWxsYmFjaywgdGVzdClcclxuICAgICAgICB9XHJcbiAgICB9KVxyXG5cclxuICAgIGNhbGxiYWNrKHRlc3QsIHBhcmVudClcclxufSJdfQ==
(1)
});
