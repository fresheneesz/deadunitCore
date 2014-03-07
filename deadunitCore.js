"use strict";
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var path = require('path')

var proto = require('proto')
var Future = require('async-future')

var processResults = require('./processResults')

// returns a module intended for a specific environment (that environment being described by the options)
// options can contain:
    // initialization - a function run once that can setup things (like a global error handler).
        // Gets a single parameter 'state' which has the following form:
            // unhandledErrorHandler
    // initializeMainTest - a function run once that can setup things (like a test-specific handler).
        // Gets a single parameter 'mainTestState' which has the following form:
            // unhandledErrorHandler - the error handler for that test
    // runTestGroup - a function run that allows you to wrap the actual test run in some way (intended for node.js domains)
        // gets parameters:
            // state - the same state object sent into `initialization`
            // tester - a UnitTester object for the test
            // runTest - the function that you should call to run the test group. Already has a synchronous try catch inside it (so you don't need to worry about that)
            // handleError - a function that handles an error if one comes up. Takes the error as its only parameter.
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

    // setup default unhandled error handler
    // unhandled errors happen after the test has completed
    function error(handler) {
        state.unhandledErrorHandler = handler
    }

    // the prototype of objects used to manage accessing and displaying results of a unit test
    var UnitTest = proto(function() {
        this.init = function(/*mainName=undefined, groups*/) {
            this.manager = EventManager()

            var fakeTest = new UnitTester()
                fakeTest.id = undefined // fake test doesn't get an id
                fakeTest.manager = this.manager
                fakeTest.mainTester.timeoutCount = 0
                fakeTest.timeouts = []
                fakeTest.mainTestState = {get unhandledErrorHandler(){return fakeTest.unhandledErrorHandler || options.defaultTestErrorHandler(fakeTest)}}

                options.initializeMainTest(fakeTest.mainTestState)

                timeout(fakeTest, 3000, true) // initial (default) timeout
                fakeTest.onDone = function() { // will execute when this test is done
                    done(fakeTest)
                    options.mainTestDone(fakeTest.mainTestState)
                }

            fakeTest.mainSubTest = UnitTester.prototype.test.apply(fakeTest, arguments) // set so the error handler can access the real test
            this.mainTester = fakeTest

            fakeTest.groupEnded = true
            checkGroupDone(fakeTest)
        }

        this.events = function(handlers) {
            this.manager.add(handlers)
        }

        this.results = function(printLateEvents) {
            if(printLateEvents === undefined) printLateEvents = true
            return processResults(this, printLateEvents)
        }
    })

    var EventManager = proto(function() {

        this.init = function() {
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
        }

        // emits an event
        this.emit = function(type, eventData) {
            this.handlers[type].forEach(function(handler) {
                try {
                    handler.call(undefined, eventData)
                } catch(e) {
                    setTimeout(function() {
                        throw e // throw error asynchronously because these error should be separate from the test exceptions
                    },0)
                }
            })
            this.history.push({type:type, data: eventData})
        }

        // adds a set of listening handlers to the event stream, and runs those handlers on the stream's history
        this.add = function(handlers) {
            // run the history of events on the the handlers
            this.history.forEach(function(e) {
                if(handlers[e.type] !== undefined) {
                    handlers[e.type].call(undefined, e.data)
                }
            })

            // then have those handlers listen on future events
            for(var type in handlers) {
                this.handlers[type].push(handlers[type])
            }
        }
    })

    function testGroup(tester, test) {

        // handles any error (synchronous or asynchronous errors)
        var handleError = function(e) {
            tester.manager.emit('exception', {
                parent: tester.id,
                time: now(),
                error: e
            })
        }

        var runTest = function() {
            try {
                test.call(tester, tester) // tester is both 'this' and the first parameter (for flexibility)
            } catch(e) {
                handleError(e)
            }
        }

        options.runTestGroup(state, tester, runTest, handleError)
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

                tester.onDone = function() { // will execute when this test is done
                    that.doneTests += 1
                    checkGroupDone(that)
                }

                this.manager.emit('group', {
                    id: tester.id,
                    parent: this.id,
                    name: name,
                    time: now()
                })

                if(this.beforeFn) {
                    this.manager.emit('before', {
                        parent: tester.id,
                        time: now()
                    })

                    this.beforeFn.call(this, this)

                    this.manager.emit('beforeEnd', {
                        parent: tester.id,
                        time: now()
                    })
                }

                testGroup(tester, test)

                if(this.afterFn) {
                    this.manager.emit('after', {
                        parent: tester.id,
                        time: now()
                    })

                    this.afterFn.call(this, this)

                    this.manager.emit('afterEnd', {
                        parent: tester.id,
                        time: now()
                    })
                }

                this.manager.emit('groupEnd', {
                    id: tester.id,
                    time: now()
                })

                tester.groupEnded = true
                checkGroupDone(tester)

                return tester
            },

            ok: function(success, actualValue, expectedValue) {
                this.doneAsserts += 1
                assert(this, success, actualValue, expectedValue, 'assert', "ok")
                checkGroupDone(this)
            },
            equal: function(expectedValue, testValue) {
                this.doneAsserts += 1
                assert(this, expectedValue === testValue, testValue, expectedValue, 'assert', "equal")
                checkGroupDone(this)
            },
            count: function(number) {
                if(this.countExpected !== undefined)
                    throw Error("count called multiple times for this test")
                this.countExpected = number

                assert(this, undefined, undefined, number, 'count', "count")
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
                this.manager.emit('log', {
                    parent: this.id,
                    time: now(),
                    values: Array.prototype.slice.call(arguments, 0)
                })
            },

            timeout: function(t) {
                timeout(this, t, false)

            },

            error: function(handler) {
                this.unhandledErrorHandler = handler
            }
        }

    function checkGroupDone(group) {
        if(!group.doneCalled && group.groupEnded === true
            && ((group.countExpected === undefined || group.countExpected <= group.doneAsserts+group.doneTests)
                && group.runningTests === group.doneTests)
        ) {
            group.doneCalled = true // don't call
            group.onDone()
        }

    }

    function done(unitTester) {
        if(unitTester.mainTester.ended)
            throw Error("done called more than once")

        endTest(unitTester, 'normal')
        unitTester.mainTester.timeouts.forEach(function(to) {
            clearTimeout(to)
        })
    }

    // if a timeout is the default, it can be overridden
    function timeout(that, t, theDefault) {
        that.mainTester.timeoutCount++

        var to = setTimeout(function() {
            that.mainTester.timeoutCount--
            if(that.mainTester.timeoutCount === 0 && !that.mainTester.ended) {
                endTest(that, 'timeout')
            }
        }, t)

        that.mainTester.timeouts.push(to)

        if(theDefault) {
            that.mainTester.timeouts.default = to
        } else if(that.mainTester.timeouts.default !== undefined) {
            clearTimeout(that.mainTester.timeouts.default)
            that.mainTester.timeoutCount--
        }
    }

    function endTest(that, type) {
        that.mainTester.ended = true

        that.manager.emit('end', {
            type: type,
            time: now()
        })
    }

    function assert(that, success, actualValue, expectedValue, type, functionName/*="ok"*/, lineInfo/*=dynamic*/, stackIncrease/*=0*/) {
        if(!stackIncrease) stackIncrease = 1
        if(!functionName) functionName = "ok"
        if(!lineInfo) lineInfo = getLineInformation(functionName, stackIncrease)

        var result = lineInfo
        result.type = 'assert'
        result.success = success

        if(actualValue !== undefined)     result.actual = actualValue
        if(expectedValue !== undefined)   result.expected = expectedValue

        result.parent = that.id
        result.time = now()

        that.manager.emit(type, result)
    }


    function getLineInformation(functionName, stackIncrease) {
        var info = options.getLineInfo(stackIncrease)
        var sourceLines = getFunctionCallLines(info.file, functionName, info.line)

        return {
            sourceLines: sourceLines,
            file: path.basename(info.file),
            line: info.line,
            column: info.column
        }
    }

    // gets the actual lines of the call
    // todo: make this work when call is over multiple lines (you would need to count parens and check for quotations)
    function getFunctionCallLines(fileName, functionName, lineNumber) {
        var file = options.getScriptSource(fileName)

        if(file !== undefined) {
            var fileLines = file.split("\n")

            var lines = []
            for(var n=0; true; n++) {
                lines.push(fileLines[lineNumber - 1 - n].trim())
                var containsFunction = fileLines[lineNumber - 1 - n].indexOf(functionName) !== -1
                if(containsFunction) {
                    return lines.reverse().join('\n')
                }
                if(lineNumber - n < 0) {
                    throw Error("Didn't get any lines")//return ""	// something went wrong if this is being returned (the functionName wasn't found above - means you didn't get the function name right)
                }
            }
        } else {
            return "<source not available>"
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
        error: error,
        test: UnitTest
    }
}