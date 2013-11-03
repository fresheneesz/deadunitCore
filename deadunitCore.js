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
        var fakeTest = new UnitTester()
            fakeTest.mainTester = fakeTest
        UnitTester.prototype.test.apply(fakeTest, arguments)
        
        this.testResults = fakeTest.results[0]
    }

    this.results = function() {
        if(!this.testResults.tester.mainTester.resultsAccessed) { // if its the first time results were grabbed
            eachTest(this.testResults, function(subtest, parenttest) {
                if(subtest.tester.countInfo !== undefined) {
                    var info = subtest.tester.countInfo
                    var actualCount = subtest.tester.numberOfSubtests + subtest.tester.numberOfAsserts
                    assert(subtest.tester, actualCount === info.expectedCount, actualCount, info.expectedCount, 'count', info.lineInfo)
                }

                if(parenttest !== undefined) {
                    //parenttest.tester.numberOfAsserts += subtest.tester.numberOfAsserts
                    if(parenttest.tester.lastAction < subtest.tester.lastAction)
                        parenttest.tester.lastAction = subtest.tester.lastAction
                }

                subtest.duration = subtest.tester.lastAction - subtest.tester.startTime
            })
            
            this.testResults.tester.mainTester.resultsAccessed = true
        }

        // resultsAccessed allows the unit test to do special alerting if asynchronous tests aren't completed before the test is completed
		
		
        return this.testResults
    }
})

function testGroup(tester, test) {
    var d = domain()
    d.on('error', function(err) {
        try {
            tester.exceptions.push(err)
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
        }
    })
}

// the prototype of objects used to write tests and contain the results of tests
var UnitTester = function(name, mainTester) {
	if(!mainTester) mainTester = this

	this.mainTester = mainTester // the mainTester is used to easily figure out if the test results have been accessed (so early accesses can be detected)
	this.name = name
    this.results = []
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

            var startTime = new Date()

            if(this.beforeFn)
                this.beforeFn.call(this, this)

            var testStart = new Date()
			var tester = new UnitTester(name, this.mainTester)

            // i'm creating the result object and pushing it into the test results *before* running the test in case the test never completes (this can happen when using node fibers)
            var result = {
                type: 'group',

                name: tester.name,
                results: tester.results,
		        exceptions: tester.exceptions,
                tester: tester
            }
            this.results.push(result)

            testGroup(tester, test)

            result.syncDuration = (new Date()).getTime() - testStart.getTime()

            if(this.afterFn)
                this.afterFn.call(this, this)

            var endTime = (new Date).getTime()
            result.totalSyncDuration = endTime - startTime.getTime()
            tester.startTime = startTime
            tester.lastAction = endTime


            this.lastAction = endTime
		},

        ok: function(success, actualValue, expectedValue) {
            assert(this, success, actualValue, expectedValue, "ok")
        },
        equal: function(expectedValue, testValue) {
            assert(this, expectedValue === testValue, expectedValue, testValue, "equal")
        },
        count: function(number) {
            if(this.expectedCount !== undefined)
                throw Error("count called multiple times for this test")
            this.countInfo = {
                expectedCount: number,
                lineInfo: getLineInformation('count', 0)
            }
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
            this.results.push({
                type: 'log',
                values: Array.prototype.slice.call(arguments, 0)
            })

            this.lastAction = (new Date).getTime()
        },
        error: function(handler) {
            this.unhandledErrorHandler = handler

            this.lastAction = (new Date).getTime()
        }
    }

function assert(that, success, actualValue, expectedValue, functionName/*="ok"*/, lineInfo/*=dynamic*/, stackIncrease/*=0*/) {
    if(!stackIncrease) stackIncrease = 1
    if(!functionName) functionName = "ok"
    if(!lineInfo) lineInfo = getLineInformation(functionName, stackIncrease)

    that.numberOfAsserts += 1

    var result = lineInfo
    result.type = 'assert'
    result.success = success

    if(actualValue !== undefined)     result.actual = actualValue
    if(expectedValue !== undefined)   result.expected = expectedValue

    that.results.push(result)

    if(that.mainTester.resultsAccessed) {
         handleUnhandledError(that, Error("Test results were accessed before asynchronous parts of tests were fully complete."+
                         " Got assert result: "+ JSON.stringify(result)))
    }

    that.lastAction = (new Date).getTime()
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
        	return lines.reverse()
        }
        if(lineNumber - n < 0) {
        	throw Error("Didn't get any lines")//return ""	// something went wrong if this is being returned (the functionName wasn't found above - means you didn't get the function name right)
        }
    }
}

