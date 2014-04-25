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
            var that = this
            var args = arguments
            this.manager = EventManager()

            setTimeout(function() {
                runTest.call(that, args)
            },0)
        }

        this.events = function(handlers) {
            this.manager.add(handlers)
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
                fakeTest.mainTestState = {get unhandledErrorHandler(){return fakeTest.unhandledErrorHandler || options.defaultTestErrorHandler(fakeTest)}}

                options.initializeMainTest(fakeTest.mainTestState)

                timeout(fakeTest, 3000, true) // initial (default) timeout
                fakeTest.onDone = function() { // will execute when this test is done
                    done(fakeTest)
                    options.mainTestDone(fakeTest.mainTestState)
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
            this.history.push({type:type, data: eventData})
            this.handlers[type].forEach(function(handler) {
                try {
                    handler.call(undefined, eventData)
                } catch(e) {
                    setTimeout(function() {
                        throw e // throw error asynchronously because these error should be separate from the test exceptions
                    },0)
                }
            })
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
                var typeHandlers = this.handlers[type]
                if(typeHandlers === undefined) {
                    throw new Error("event type '"+type+"' invalid")
                }

                typeHandlers.push(handlers[type])
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
        this.waitingAsserts = 0 // since asserting is asynchronous, need to make sure they complete before the test can be declared finished
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

                if(this.id === undefined) { // ie its the top-level fake test
                    this.mainSubTest = tester
                }

                tester.onDone = function() { // will execute when this test is done
                    that.doneTests += 1

                    that.manager.emit('groupEnd', {
                        id: tester.id,
                        time: now()
                    })

                    checkGroupDone(that)
                }

                tester.mainTester.callOnDone(function() {
                    if(!tester.doneCalled) { // a timeout happened - end the test
                        tester.doneCalled = true
                        that.manager.emit('groupEnd', {
                            id: tester.id,
                            time: now()
                        })
                    }
                })

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

                tester.groupEnded = true
                checkGroupDone(tester)

                return tester
            },

            ok: function(success, actualValue, expectedValue) {
                this.doneAsserts += 1
                assert(this, success, actualValue, expectedValue, 'assert', "ok").then(function() {
                    this.waitingAsserts --
                    this.mainTester.waitingAsserts --
                    checkGroupDone(this)
                }.bind(this)).done()
            },
            equal: function(expectedValue, testValue) {
                this.doneAsserts += 1
                assert(this, expectedValue === testValue, testValue, expectedValue, 'assert', "equal").then(function() {
                    this.waitingAsserts --
                    this.mainTester.waitingAsserts --
                    checkGroupDone(this)
                }.bind(this)).done()
            },
            count: function(number) {
                if(this.countExpected !== undefined)
                    throw Error("count called multiple times for this test")
                this.countExpected = number

                assert(this, undefined, undefined, number, 'count', "count").then(function() {
                    this.waitingAsserts --
                    this.mainTester.waitingAsserts --
                    checkGroupDone(this)
                }.bind(this)).done()
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
        if(!group.doneCalled && group.groupEnded === true && group.waitingAsserts === 0
            && ((group.countExpected === undefined || group.countExpected <= group.doneAsserts+group.doneTests)
                && group.runningTests === group.doneTests)
        ) {
            group.doneCalled = true // don't call twice
            group.onDone()
        }

    }

    function done(unitTester) {
        if(unitTester.mainTester.ended) {
            unitTester.mainTester.manager.emit('exception', {
                parent: unitTester.mainTester.mainSubTest.id,
                time: now(),
                error: new Error("done called more than once (probably because the test timed out before it finished)")
            })
        } else {
            unitTester.mainTester.timeouts.forEach(function(to) {
                clearTimeout(to)
            })
            unitTester.mainTester.timeouts = []

            endTest(unitTester, 'normal')
        }
    }

    // if a timeout is the default, it can be overridden
    function timeout(that, t, theDefault) {
        var to = setTimeout(function() {
            remove(that.mainTester.timeouts, to)

            if(that.mainTester.timeouts.length === 0 && !that.mainTester.ended) {
                that.mainTester.timingOut = true
                checkIfTestIsReadyToEnd()
            }

            function checkIfTestIsReadyToEnd() {
                setTimeout(function() {
                    if(that.mainTester.waitingAsserts <= 0) {
                        endTest(that.mainTester, 'timeout')
                    } else {
                        checkIfTestIsReadyToEnd()
                    }
                },10)
            }
        }, t)

        that.mainTester.timeouts.push(to)

        if(theDefault) {
            that.mainTester.timeouts.default = to
        } else if(that.mainTester.timeouts.default !== undefined) {
            clearTimeout(that.mainTester.timeouts.default)
            remove(that.mainTester.timeouts, that.mainTester.timeouts.default)
            that.mainTester.timeouts.default = undefined
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

        that.manager.emit('end', {
            type: type,
            time: now()
        })
    }

    function assert(that, success, actualValue, expectedValue, type, functionName/*="ok"*/, lineInfo/*=dynamic*/, stackIncrease/*=0*/) {
        if(!stackIncrease) stackIncrease = 1
        if(!functionName) functionName = "ok"
        if(!lineInfo)
            var lineInfoFuture = getLineInformation(functionName, stackIncrease)
        else
            var lineInfoFuture = Future(lineInfo)

        that.waitingAsserts += 1
        if(!that.mainTester.timingOut) {
            that.mainTester.waitingAsserts += 1
        }

        return lineInfoFuture.then(function(lineInfo) {
            var result = lineInfo
            result.type = 'assert'
            result.success = success

            if(actualValue !== undefined)     result.actual = actualValue
            if(expectedValue !== undefined)   result.expected = expectedValue

            result.parent = that.id
            result.time = now()

            that.manager.emit(type, result)
        })
    }


    function getLineInformation(functionName, stackIncrease) {
        var info = options.getLineInfo(stackIncrease)
        return getFunctionCallLines(info.file, functionName, info.line).then(function(sourceLines) {
            return Future({
                sourceLines: sourceLines,
                file: path.basename(info.file),
                line: info.line,
                column: info.column
            })
        })
    }

    // gets the actual lines of the call
    // todo: make this work when call is over multiple lines (you would need to count parens and check for quotations)
    function getFunctionCallLines(fileName, functionName, lineNumber) {
        return options.getScriptSource(fileName).then(function(file) {

            if(file !== undefined) {
                var fileLines = file.split("\n")

                var lines = []
                for(var n=0; n<true; n++) {
                    var line = fileLines[lineNumber - 1 - n]
                    if(line === undefined) {
                        break;
                    }

                    lines.push(line.trim())
                    var containsFunction = line.indexOf(functionName) !== -1
                    if(containsFunction) {
                        return Future(lines.reverse().join('\n'))
                    }
                    if(lineNumber - n < 0) {
                        return Future("<no lines found (possibly an error?)> ")	// something went wrong if this is being returned (the functionName wasn't found above - means you didn't get the function name right)
                    }
                }
            }
            // else
            return Future("<source not available>")
        })
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