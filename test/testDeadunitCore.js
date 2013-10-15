"use strict";

var OldDeadunit = require('deadunit')
var Unit = require('../deadunitCore')
var Future = require('async-future')

var futuresToWaitOn = []

var testGroups = Unit.test("Full deadunit test (results of this will be verified)", function() {

	this.test("Test Some Stuff", function() {
		this.test("assertSomething", function() {
			this.ok(5 === 5)
		})
		this.test("shouldFail", function() {
			this.ok(5 === 3, 'actual', 'expected')
			this.equal(true, false)
            this.log("test log")
            this.count(3)
		})
		this.test("shouldThrowException", function() {
            this.ok(true)
            this.count(1)
			throw new Error("Ahhhhh!")
		})
		this.test("should throw an asynchronous exception", function() {
            var f = new Future
            futuresToWaitOn.push(f)
            setTimeout(function() {
                f.return()
                throw Error("Asynchronous Ahhhhh!")
            },0)
		})

        this.count(4)
	})
	this.test("SuccessfulTestGroup", function() {
		this.test("yay", function() {
			this.equal(true, true)
		})
	})

    this.test("long before/after", function() {
        var x = 0
        this.before(function() {
            for(var n=0; n<1000000; n++) {
                x += x+1
            }
        })

        this.test("one", function() {
            this.ok(x === Infinity, x)
        })
    })
})

Future.all(futuresToWaitOn).then(function() {

    var moreFutures = []
    var mainTest = OldDeadunit.test("Unit test the unit test-results (these should all succeed)", function() {

        this.test('simple success', function() {
            var test = Unit.test(function() {
                this.ok(true)
            }).results()

            this.ok(test.name === undefined)
            this.ok(test.results.length === 1)
            this.ok(test.results[0].success === true)
        })
        this.test('simple failure', function() {
            var test = Unit.test(function() {
                this.ok(false)
            }).results()

            this.ok(test.name === undefined)
            this.ok(test.results.length === 1)
            this.ok(test.results[0].success === false)
        })
        this.test('simple exception', function() {
            var test = Unit.test(function() {
                throw Error("sync")
            }).results()

            this.ok(test.name === undefined)
            this.ok(test.exceptions.length === 1)
            this.ok(test.exceptions[0].message === 'sync')
        })
        this.test('simple async exception', function(t) {
            var simpleAsyncExceptionFuture = new Future, simpleAsyncExceptionFutureDone = new Future
            var simpleAsyncExceptionTest = Unit.test(function() {
                setTimeout(function() {
                    simpleAsyncExceptionFuture.return()
                    throw Error("Async")
                }, 0)
            })

            simpleAsyncExceptionFuture.then(function() {
                console.log("\nsimple async exception")
                var test = simpleAsyncExceptionTest.results()

                t.ok(test.name === undefined)
                t.ok(test.exceptions.length === 1)
                t.ok(test.exceptions[0].message === 'Async')

                simpleAsyncExceptionFutureDone.return()
            })

            moreFutures.push(simpleAsyncExceptionFutureDone)
        })

        this.test('Testing "Full deadunit test"', function() {
            var test = testGroups.results()

            this.ok(test.type === "group")
            this.ok(test.name === "Full deadunit test (results of this will be verified)")
            this.ok(test.testDuration !== undefined && test.testDuration > 0, test.testDuration)
            this.ok(test.exceptions.length === 0)
            this.ok(test.results.length === 3, test.results.length)

            this.test("Verify 'Test Some Stuff'", function() {
                var subtest1 = test.results[0]
                this.ok(subtest1.type === "group")
                this.ok(subtest1.name === "Test Some Stuff")
                this.ok(subtest1.testDuration !== undefined && subtest1.testDuration > 0 && subtest1.testDuration < 100, subtest1.testDuration)
                this.ok(subtest1.totalDuration !== undefined && subtest1.totalDuration >= subtest1.testDuration)  // totalDuration is the duration including before and after
                this.ok(subtest1.exceptions.length === 0)
                this.ok(subtest1.results.length === 5, subtest1.results.length)

                    var subtest2 = subtest1.results[0]
                    this.ok(subtest2.type === "group")
                    this.ok(subtest2.name === "assertSomething")
                    this.ok(subtest2.exceptions.length === 0)
                    this.ok(subtest2.results.length === 1)

                        var subtest3 = subtest2.results[0]
                        this.ok(subtest3.type === "assert")
                        this.ok(subtest3.success === true)
                        this.ok(subtest3.sourceLines.join("\n").indexOf("5 === 5") !== -1)
                        this.ok(subtest3.file === "testDeadunitCore.js")
                        this.ok(subtest3.line === 13, subtest3.line)
                        //this.ok(subtest3.column === 9, subtest3.column)

                    subtest2 = subtest1.results[1]
                    this.ok(subtest2.name === "shouldFail")
                    this.ok(subtest2.testDuration !== undefined && subtest2.testDuration >= 0 && subtest2.testDuration < 10, subtest2.testDuration)
                    this.ok(subtest2.exceptions.length === 0)
                    this.ok(subtest2.results.length === 4, subtest2.results.length)

                        subtest3 = subtest2.results[0]
                        this.ok(subtest3.success === false)
                        this.ok(subtest3.sourceLines.join("\n").indexOf("5 === 3") !== -1)
                        this.ok(subtest3.actual === 'actual')
                        this.ok(subtest3.expected === 'expected')

                        subtest3 = subtest2.results[1]
                        this.ok(subtest3.success === false)
                        this.ok(subtest3.sourceLines.join("\n").indexOf("true, false") !== -1)
                        this.ok(subtest3.file === "testDeadunitCore.js")
                        this.ok(subtest3.line === 17, subtest3.line)
                        //this.ok(subtest3.column === 9, subtest3.column)

                        subtest3 = subtest2.results[2]
                        this.ok(subtest3.type === "log")
                        this.ok(subtest3.msg === "test log")

                        subtest3 = subtest2.results[3]      // count
                        this.ok(subtest3.type === "assert", subtest3.type)
                        this.ok(subtest3.success === false, subtest3.success)

                    subtest2 = subtest1.results[2]
                    this.ok(subtest2.name === "shouldThrowException")
                    this.ok(subtest2.testDuration !== undefined && subtest2.testDuration >= 0 && subtest2.testDuration < 10, subtest2.testDuration)
                    this.ok(subtest2.exceptions.length === 1)
                    this.ok(subtest2.exceptions[0].message === "Ahhhhh!")
                    this.ok(subtest2.results.length === 2, subtest2.results.length)

                        subtest3 = subtest2.results[0]
                        this.ok(subtest3.success === true)

                        subtest3 = subtest2.results[1]     // count
                        this.ok(subtest3.success === true)

                    subtest2 = subtest1.results[3]
                    this.ok(subtest2.name === "should throw an asynchronous exception")
                    this.ok(subtest2.exceptions.length === 1)
                    this.ok(subtest2.exceptions[0].message === "Asynchronous Ahhhhh!")
                    this.ok(subtest2.results.length === 0)

                    subtest2 = subtest1.results[4]     // count
                    this.ok(subtest2.success === true)
            })

            this.test("Verify 'SuccessfulTestGroup'", function() {
                var subtest1 = test.results[1]
                this.ok(subtest1.name === "SuccessfulTestGroup")
                this.ok(subtest1.exceptions.length === 0)
                this.ok(subtest1.results.length === 1)

                    var subtest2 = subtest1.results[0]
                    this.ok(subtest2.name === "yay")
                    this.ok(subtest2.exceptions.length === 0)
                    this.ok(subtest2.results.length === 1)

                        var subtest3 = subtest2.results[0]
                        this.ok(subtest3.success === true)
                        this.ok(subtest3.sourceLines.join("\n").indexOf("true") !== -1)
            })

            this.test("Verify 'long before/after'", function() {

            })
        })

        this.test("befores and afters", function() {
            var x = 0
            var that = this

            this.before(function(that2) {
                this.ok(this === that)
                this.ok(this === that2)
                this.log("before: "+x)
                x++
            })
            this.after(function(that2) {
                this.ok(this === that)
                this.ok(this === that2)
                this.log("after: "+x)
                x+=10
            })

            this.test("one", function() {
                this.log("x is: "+x)
                this.ok(x===1, x)
            })
            this.test("two", function() {
                this.ok(x===12, x)
            })
        })

        this.test("Asynchronous counts", function(t) {
            this.count(3)

            this.ok(true)
            var f1 = new Future
            setTimeout(function() {
                t.ok(true)
                f1.return()
            }, 100)
            var f2 = new Future
            setTimeout(function() {
                t.ok(true)
                f2.return()
            }, 200)

            moreFutures.push(f1,f2)
        })

        this.test('unhandled error handler', function(t) {
            this.count(4)
            var f = new Future
            moreFutures.push(f)
            Unit.error(function(e) {
                t.ok(true)
                t.ok(e.message.indexOf('Test results were accessed before asynchronous parts of tests were fully complete.') !== -1)
                t.log(e)
                f.return()
            })
            var test = Unit.test(function(t) {
                setTimeout(function() {
                    t.ok(true)
                },10)
            }).results()

            this.ok(test.name === undefined)
            this.ok(test.results.length === 0)
        })

    })

    Future.all(moreFutures).then(function() {
        mainTest.writeConsole()
    })

}).done()




