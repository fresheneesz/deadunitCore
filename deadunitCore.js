"use strict";
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var fs = require('fs')
var path = require('path')
var domain = require('domain').create

var stackTrace = require('stack-trace')
var proto = require('proto')

// default
var unhandledErrorHandler = function(e) {
    setTimeout(function() { //  nextTick
        console.log(e.toString())
    },0)
}

// setup default unhandled error handler
// unhandled errors happen when done is called, and  then an exception is thrown from the future
exports.error = function(handler) {
    unhandledErrorHandler = handler
}

// the prototype of objects used to manage accessing and displaying results of a unit test
var UnitTest = exports.test = proto(function() {
    this.init = function(/*mainName=undefined, groups*/) {
        this.manager = EventManager()

        var fakeTest = new UnitTester()
            fakeTest.id = undefined // fake test doesn't get an id
            fakeTest.manager = this.manager
            fakeTest.mainTester.timeoutCount = 0
            fakeTest.timeouts = []
            timeout(fakeTest, 3000, true) // initial (default) timeout


        UnitTester.prototype.test.apply(fakeTest, arguments)
        this.mainTester = fakeTest

    }

    this.events = function(handlers) {
        this.manager.add(handlers)
    }

    this.results = function() {
        //if(!this.testResults.tester.mainTester.resultsAccessed) { // if its the first time results were grabbed

            var results;
            var groups = {}

            var primaryGroup;

            this.events({
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

                    groups[e.parent].countInfo = e
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

                    groups[e.id].totalSyncDuration = e.time - groups[e.id].time

                    groups[e.id].syncDuration = groups[e.id].totalSyncDuration
                    if(groups[e.id].beforeDuration !== undefined)
                        groups[e.id].syncDuration -= groups[e.id].beforeDuration
                    if(groups[e.id].afterDuration !== undefined)
                        groups[e.id].syncDuration -= groups[e.id].afterDuration
                },
                end: function(e) {
                    primaryGroup.timeout = e.type === 'timeout'

                    // make the count assertions
                    eachTest(primaryGroup, function(subtest, parenttest) {
                        if(subtest.countInfo !== undefined) {
                            var info = subtest.countInfo
                            var actualCount = subtest.results.length
                            //assert(subtest.tester, actualCount === info.expectedCount, actualCount, info.expectedCount, 'count', info.lineInfo)
                            subtest.results.push({
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
                }
            })

            function setGroupDuration(groupid, time) {
                groups[groupid].duration = time - groups[groupid].time
                if(groups[groupid].parent) {
                    setGroupDuration(groups[groupid].parent, time)
                }
            }
            
            this.mainTester.resultsAccessed = true
            return results
        //}

        // resultsAccessed allows the unit test to do special alerting if asynchronous tests aren't completed before the test is completed
		
		
        //return this.testResults
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
            setTimeout(function() { // next tick
                handler.call(undefined, eventData)
            },0)
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
    var d = domain()
    d.on('error', function(err) {
        try {
            tester.exceptions.push(err)
            tester.manager.emit('exception', {
                parent: tester.id,
                time: now(),
                error: err
            })

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
        try {
            test.call(tester, tester) // tester is both 'this' and the first parameter (for flexibility)
        } catch(e) {
            tester.exceptions.push(e)
            tester.manager.emit('exception', {
                parent: tester.id,
                time: now(),
                error: e
            })
        }
    })
}

// the prototype of objects used to write tests and contain the results of tests
var UnitTester = function(name, mainTester) {
	if(!mainTester) mainTester = this

    this.id = groupid()
	this.mainTester = mainTester // the mainTester is used to easily figure out if the test results have been accessed (so early accesses can be detected)
	this.name = name
    //this.results = []
    this.exceptions = []
    this.numberOfAsserts = 0
    this.numberOfSubtests = 0
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

            this.numberOfSubtests += 1

            var tester = new UnitTester(name, this.mainTester)
            tester.manager = this.manager

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


            // i'm creating the result object and pushing it into the test results *before* running the test in case the test never completes (this can happen when using node fibers)
            var result = {
                type: 'group',

                name: tester.name,
                results: tester.results,
		        exceptions: tester.exceptions,
                tester: tester
            }
            //this.results.push(result)

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
		},

        ok: function(success, actualValue, expectedValue) {
            assert(this, success, actualValue, expectedValue, 'assert', "ok")
        },
        equal: function(expectedValue, testValue) {
            assert(this, expectedValue === testValue, testValue, expectedValue, 'assert', "equal")
        },
        count: function(number) {
            if(this.countCalled !== undefined)
                throw Error("count called multiple times for this test")
            this.countCalled = true

            assert(this, undefined, undefined, number, 'count', "count")

            /*this.countInfo = {
                expectedCount: number,
                lineInfo: getLineInformation('count', 0)
            }*/
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
            /*this.results.push({
                type: 'log',
                values: Array.prototype.slice.call(arguments, 0)
            })  */

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
        },

        done: function() {
            done(this)
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

    // make the count assertions
    /*eachTest(that.mainTester.results[0], function(subtest, parenttest) {
        if(subtest.tester.countInfo !== undefined) {
            var info = subtest.tester.countInfo
            var actualCount = subtest.tester.numberOfSubtests + subtest.tester.numberOfAsserts
            assert(subtest.tester, actualCount === info.expectedCount, actualCount, info.expectedCount, 'count', info.lineInfo)
        }
    })*/

    that.manager.emit('end', {
        type: type,
        time: now()
    })
}

function assert(that, success, actualValue, expectedValue, type, functionName/*="ok"*/, lineInfo/*=dynamic*/, stackIncrease/*=0*/) {
    if(!stackIncrease) stackIncrease = 1
    if(!functionName) functionName = "ok"
    if(!lineInfo) lineInfo = getLineInformation(functionName, stackIncrease)

    that.numberOfAsserts += 1

    var result = lineInfo
    result.type = 'assert'
    result.success = success

    if(actualValue !== undefined)     result.actual = actualValue
    if(expectedValue !== undefined)   result.expected = expectedValue

    result.parent = that.id
    result.time = now()

    that.manager.emit(type, result)

    //that.results.push(result)

    if(that.mainTester.resultsAccessed) {
         handleUnhandledError(that, Error("Test results were accessed before asynchronous parts of tests were fully complete."+
                         " Got assert result: "+ JSON.stringify(result)))
    }
}

function handleUnhandledError(tester, e) {
    if(tester.unhandledErrorHandler !== undefined)
        tester.unhandledErrorHandler(e)
    else
        unhandledErrorHandler(e)
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




function getLineInformation(functionName, stackIncrease) {
    var backTrace = stackTrace.get();
    var stackPosition = backTrace[2+stackIncrease]

    var filename = stackPosition.getFileName()
    var lineNumber = stackPosition.getLineNumber()
    var column = stackPosition.getColumnNumber()

    var sourceLines = getFunctionCallLines(filename, functionName, lineNumber)

    return {
        sourceLines: sourceLines,
        file: path.basename(filename),
        line: lineNumber,
        column: column
    }
}

// gets the actual lines of the call
// todo: make this work when call is over multiple lines (you would need to count parens and check for quotations)
function getFunctionCallLines(fileName, functionName, lineNumber) {
    var file = fs.readFileSync(fileName).toString().split("\n")

    var lines = []
    for(var n=0; true; n++) {
    	lines.push(file[lineNumber - 1 - n].trim())
        var containsFunction = file[lineNumber - 1 - n].indexOf(functionName) !== -1
        if(containsFunction) {
        	return lines.reverse().join('\n')
        }
        if(lineNumber - n < 0) {
        	throw Error("Didn't get any lines")//return ""	// something went wrong if this is being returned (the functionName wasn't found above - means you didn't get the function name right)
        }
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