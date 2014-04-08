"use strict";

var Future = require('async-future')

exports.name = "Unit test the unit test-results (these should all succeed)"

exports.getTests = function(Unit, isDone) {
    var moreFutures = []

    return function() {

        this.test('simple success', function(t) {
            this.count(3)
            var test = Unit.test(function() {
                this.ok(true)
            }).events({
                end: function() {
                    var results = test.results()

                    t.ok(results.name === undefined, results.name)
                    t.ok(results.results.length === 1)
                    t.ok(results.results[0].success === true)
                }
            })
        })

        this.test('simple failure', function(t) {
            this.count(3)
            var test = Unit.test(function() {
                this.ok(false)
            }).events({
                end: function() {
                    var results = test.results()

                    t.ok(results.name === undefined)
                    t.ok(results.results.length === 1)
                    t.ok(results.results[0].success === false)
                }
            })
        })
        this.test('simple exception', function(t) {
            this.count(4)
            var test = Unit.test(function() {
                this.count(1)
                this.timeout(0) // just to make the test end faster
                throw Error("sync")
            }).events({
                end: function() {
                    var results = test.results()

                    t.ok(results.name === undefined)
                    t.ok(results.exceptions.length === 1)
                    t.ok(results.exceptions[0].message === 'sync')
                    t.ok(results.timeout === true, results.timeout)
                }
            })
        })

        this.test('simple async exception', function(t) {
            this.count(4)

            var simpleAsyncExceptionFuture = new Future, simpleAsyncExceptionFutureDone = new Future
            var simpleAsyncExceptionTest = Unit.test(function(t) {
                this.count(1)
                setTimeout(function() {
                    setTimeout(function() {
                        t.ok(true) // to prevent it from timing out
                        simpleAsyncExceptionFuture.return()
                    }, 0)
                    throw Error("Async")
                }, 0)
            }).events({
                end: function() {
                    simpleAsyncExceptionFuture.then(function() {
                        var test = simpleAsyncExceptionTest.results()

                        t.ok(test.name === undefined)
                        t.ok(test.exceptions.length === 1)
                        t.ok(test.exceptions[0].message === 'Async')
                        t.ok(test.timeout === false)

                        simpleAsyncExceptionFutureDone.return()
                    }).done()
                }
            })

            moreFutures.push(simpleAsyncExceptionFutureDone)
        })
        //*
        this.test('Testing "Full deadunit test"', function() {
            this.count(10)

            var futuresToWaitOn = []
            var testGroups = Unit.test("Full deadunit test (results of this will be verified)", function() {

                this.test("Test Some Stuff", function() {
                    this.test("assertSomething", function() {
                        this.ok(5 === 5)
                    })
                    this.test("'shouldFail' fails correctly", function() {
                        this.ok(5 === 3, 'actual', 'expected')
                        this.equal(true, false)
                        this.log("test log")
                        this.count(2)
                    })
                    this.test("shouldThrowException", function() {
                        this.ok(true)
                        this.count(1)
                        throw new Error("Ahhhhh!")
                    })
                    this.test("should throw an asynchronous exception", function(t) {
                        this.count(1)

                        var f = new Future
                        futuresToWaitOn.push(f)
                        setTimeout(function() {
                            setTimeout(function() {
                                t.ok(true) // to prevent timeout *and* an early ending of the test
                                f.return()
                            }, 0)
                            throw Error("Asynchronous Ahhhhh!")
                        },0)
                    })

                    this.log("subtest without a name")
                    this.test(function() {
                        this.ok(true)
                    })

                    this.count(4) // 5 actually happen
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

                this.test("asynchronous errors", function() {
                    setTimeout(function() {
                        throw Error("moo")
                    },0)
                    setTimeout(function() {
                        throw "thrown string"
                    },0)
                })

                var f = new Future
                futuresToWaitOn.push(f)
                setTimeout(function() {    // why is this here? Possibly to make sure the "asynchronous errors" finish first?
                    f.return()
                },50)
            }).events({end: function() {

                var futuresForThisTest = Future.all(futuresToWaitOn)
                moreFutures.push(futuresForThisTest)
                futuresForThisTest.then(function() {
                    var test = testGroups.results()

                    this.ok(test.timeout === false, test.timeout)
                    this.ok(test.type === "group")
                    this.ok(test.name === "Full deadunit test (results of this will be verified)")
                    this.ok(test.syncDuration !== undefined && test.syncDuration > 0, test.syncDuration)
                    this.ok(test.exceptions.length === 0)
                    this.ok(test.results.length === 4, test.results.length)

                    this.test("Verify 'Test Some Stuff'", function() {
                        this.count(50)

                        var subtest1 = test.results[0]
                        this.ok(subtest1.type === "group")
                        this.ok(subtest1.name === "Test Some Stuff")
                        this.ok(subtest1.syncDuration !== undefined && subtest1.syncDuration > 0 && subtest1.syncDuration < 100, subtest1.syncDuration)
                        this.ok(subtest1.totalSyncDuration !== undefined && subtest1.totalSyncDuration >= subtest1.totalSyncDuration)  // totalDuration is the duration including before and after
                        this.ok(subtest1.exceptions.length === 0)
                        this.ok(subtest1.results.length === 7, subtest1.results.length)

                        var subtest2 = subtest1.results[0]
                        this.ok(subtest2.type === "group")
                        this.ok(subtest2.name === "assertSomething")
                        this.ok(subtest2.exceptions.length === 0)
                        this.ok(subtest2.results.length === 1)

                        var subtest3 = subtest2.results[0]
                        this.ok(subtest3.type === "assert")
                        this.ok(subtest3.success === true)
                        this.ok(subtest3.sourceLines.indexOf("5 === 5") !== -1)
                        this.ok(subtest3.file === "deadunitTests.js")
                        this.ok(subtest3.line === 98, subtest3.line)
                        //this.ok(subtest3.column === 9, subtest3.column)

                        subtest2 = subtest1.results[1]
                        this.ok(subtest2.name === "'shouldFail' fails correctly", subtest2.name)
                        this.ok(subtest2.syncDuration !== undefined && subtest2.syncDuration >= 0 && subtest2.syncDuration < 10, subtest2.syncDuration)
                        this.ok(subtest2.exceptions.length === 0)
                        this.ok(subtest2.results.length === 4, subtest2.results.length)

                        subtest3 = subtest2.results[0]
                        this.ok(subtest3.success === false)
                        this.ok(subtest3.sourceLines.indexOf("5 === 3") !== -1)
                        this.ok(subtest3.actual === 'actual')
                        this.ok(subtest3.expected === 'expected')

                        subtest3 = subtest2.results[1]
                        this.ok(subtest3.success === false)
                        this.ok(subtest3.sourceLines.indexOf("true, false") !== -1)
                        this.ok(subtest3.file === "deadunitTests.js")
                        this.ok(subtest3.line === 102, subtest3.line)
                        //this.ok(subtest3.column === 9, subtest3.column)

                        subtest3 = subtest2.results[2]
                        this.ok(subtest3.type === "log")
                        this.ok(subtest3.values.length === 1)
                        this.ok(subtest3.values[0] === "test log")


                        subtest3 = subtest2.results[3]      // count
                        this.ok(subtest3.type === "assert", subtest3.type)
                        this.ok(subtest3.success === true, subtest3.success)

                        subtest2 = subtest1.results[2]
                        this.ok(subtest2.name === "shouldThrowException")
                        this.ok(subtest2.syncDuration !== undefined && subtest2.syncDuration >= 0 && subtest2.syncDuration < 10, subtest2.syncDuration)
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
                        this.ok(subtest2.results.length === 2, subtest2.results.length)

                        this.ok(subtest1.results[4].type === 'log', subtest1.results[4].type) // log
                        this.ok(subtest1.results[4].values[0] === 'subtest without a name')

                        subtest2 = subtest1.results[5]
                        this.ok(subtest2.name === undefined)
                        this.ok(subtest2.exceptions.length === 0)
                        this.ok(subtest2.results.length === 1)
                        this.ok(subtest2.results[0].success === true)

                        subtest2 = subtest1.results[6]     // count
                        this.ok(subtest2.success === false, subtest2.success)
                    })

                    this.test("Verify 'SuccessfulTestGroup'", function() {
                        this.count(8)

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
                        this.ok(subtest3.sourceLines.indexOf("true") !== -1)
                    })

                    this.test("Verify 'long before/after'", function() {
                        this.count(5)

                        var subtest1 = test.results[2]
                        this.ok(subtest1.name === "long before/after")
                        this.ok(subtest1.exceptions.length === 0)
                        this.ok(subtest1.results.length === 1)
                        this.ok(subtest1.results[0].name === 'one')
                        this.ok(subtest1.results[0].results[0].success === true, subtest1.results[0].file)
                    })

                    this.test("Verify 'asynchronous errors'", function() {
                        this.count(5)

                        var subtest1 = test.results[3]
                        this.ok(subtest1.name === "asynchronous errors")
                        this.ok(subtest1.exceptions.length === 2)
                        this.ok(subtest1.results.length === 0)

                        this.ok(subtest1.exceptions[0].message === 'moo')
                        this.ok(subtest1.exceptions[1] === 'thrown string')
                    })

                }.bind(this)).done()

                }.bind(this)})

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

        this.test("Asynchronous times", function(t) {
            var f1 = new Future, f2 = new Future, f3 = new Future
            var test = Unit.test(function(test) {
                this.count(1)
                setTimeout(function() {
                    test.ok(true)
                    f1.return()
                }, 100)
                this.test(function(subtest) {
                    this.count(1)
                    setTimeout(function() {
                        subtest.ok(true)
                        f2.return()
                    }, 200)
                })
            })

            t.count(9)
            moreFutures.push(f3)

            Future.all([f1,f2]).then(function() {
                var results = test.results()

                t.ok(results.timeout === false, results.timeout)
                t.ok(results.syncDuration < 50, results.syncDuration)
                t.ok(results.duration >= 200, results.duration)
                t.ok(results.results.length === 3, results.results.length)
                t.ok(results.results[0].results.length === 2)
                t.ok(results.results[0].results[0].success === true)
                t.ok(results.results[0].syncDuration < 50, results.results[0].syncDuration)
                t.ok(results.results[0].duration >= 200, require('util').inspect(results.results[0]))
                t.ok(results.results[1].success === true)

            }).catch(function(e) {
                    t.ok(false, e)
                }).finally(function() {
                    f3.return()
                }).done()
        })

        function testCounts(t, test) {
            var results = test.results()

            t.ok(results.results.length === 3, results.results.length)
            t.ok(results.results[2].actual === 2 && results.results[2].success === true, require('util').inspect(results.results[2]))
            var subtest1 = results.results[0]
            t.ok(subtest1.results[2].actual === 2 && subtest1.results[2].success === true, require('util').inspect(subtest1.results[2]))
            t.ok(subtest1.results.length === 3, subtest1.results.length)
            var subtest2 = subtest1.results[0]
            t.ok(subtest2.results.length === 2, subtest2.results.length)
            t.ok(subtest2.results[1].actual === 1
                && subtest2.results[1].success === true, require('util').inspect(subtest2.results[1]))
        }

        this.test("counts", function(t) {
            this.count(6)
            var test = Unit.test(function() {
                this.count(2)
                this.test(function() {
                    this.count(2)
                    this.test(function() {
                        this.count(1)
                        this.ok(true)
                    })
                    this.ok(true)
                })
                this.ok(true)
            }).events({end: function() {
                testCounts(t, test)
            }})
        })

        this.test("asynchronous counts", function(tester) {
            var f = new Future, done = new Future
            var one = new Future, two = new Future // setTimeout apparently isn't deterministic in node.js (which sucks), so using futures instead to guarantee order

            var test = Unit.test(function(t) {
                t.count(2)
                t.test(function(t) {
                    t.count(2)
                    t.test(function(t) {
                        t.count(1)
                        two.then(function() {
                            t.ok(true)
                            f.return()
                        })
                    })
                    one.then(function() {
                        t.ok(true)
                        two.return()
                    })
                })
                setTimeout(function() {
                    t.ok(true)
                    one.return()
                },0)
            })

            this.count(6)
            moreFutures.push(done)
            f.then(function() {
                testCounts(tester, test)

            }).finally(function() {
                    done.return()
                }).catch(function(e) {
                    tester.ok(false, e)
                }).done()
        })

        this.test("former bugs", function() {
            this.test("multiple timeouts not working correctly ", function(t) {
                this.count(1)

                var test = Unit.test(function(t) {
                    this.test(function() {
                        this.count(1)
                        this.timeout(100)
                    })
                    this.test(function() {
                        this.count(1) // so it times out
                        this.timeout(200)
                    })
                }).events({end: function() {
                    var results = test.results()
                    t.ok(results.timeout === true)
                }})
            })
        })

        /* Unit.error is deprecated
        this.test('unhandled error handler', function(realt) {
            this.count(7)
            var f = new Future
            moreFutures.push(f)

            var errorCount = 0

            var test = Unit.test(function(t) {
                this.count(1)

                this.error(function(e) {
                    errorCount++
                    if(errorCount === 1) {
                        realt.ok(e.message.indexOf('Test results were accessed before asynchronous parts of tests were fully complete.') !== -1)
                        realt.ok(e.message.indexOf("t.ok(true)") !== -1)
                    } else if(errorCount === 2) {
                        realt.ok(e.message.indexOf('test') !== -1)
                    } else if(errorCount === 3) {
                        realt.ok(e.message.indexOf('thrown string') !== -1)
                    } else {
                        realt.ok(false)
                    }
                })

                setTimeout(function() {
                    t.ok(true)
                },0)
                setTimeout(function() {
                    throw Error('test')
                },0)
                setTimeout(function() {
                    throw "thrown string"
                },0)
            }).results()

            realt.ok(test.name === undefined)
            realt.ok(test.results.length === 0, test.results.length)
            realt.ok(test.exceptions.length === 0)
            f.return()
        })


        this.test('logs', function() {

            var array = [1,'a',{a:'b', b:[1,2]}]
            var object = {some: 'object'}
            var error = Error('test')

            var test = Unit.test(function(t) {
                this.log("string")
                this.log(object)
                this.log(array)
                this.log(error)
                this.log("string", object, array, error)

                this.ok(false, "string")
                this.ok(false, object)
                this.ok(false, array)
                this.ok(false, error)

            }).events({end: function() {
                var results = test.results()

                this.ok(results.exceptions.length === 0)
                this.ok(results.results.length === 9)
                this.ok(results.results[0].values.length === 1)
                this.ok(results.results[0].values[0] === "string")
                this.ok(results.results[1].values.length === 1)
                this.ok(results.results[1].values[0] === object, results.results[1].values)
                this.ok(results.results[2].values.length === 1)
                this.ok(results.results[2].values[0] === array, results.results[2].values)
                this.ok(results.results[3].values.length === 1)
                this.ok(results.results[3].values[0] === error, results.results[3].values)
                this.ok(results.results[4].values.length === 4)
                this.ok(results.results[4].values[0] === "string", results.results[4].values[0])
                this.ok(results.results[4].values[1] === object, results.results[4].values[1])
                this.ok(results.results[4].values[2] === array, results.results[4].values[2])
                this.ok(results.results[4].values[3] === error, results.results[4].values[3])

                this.ok(results.results[5].actual === "string", results.results[5].actual)
                this.ok(results.results[6].actual === object, results.results[6].actual)
                this.ok(results.results[7].actual === array, results.results[7].actual)
                this.ok(results.results[8].actual === error, results.results[8].actual)
            }.bind(this)})


        })

        this.test('event stream', function(t) {
            this.count(9)

            var done = new Future
            moreFutures.push(done)

            var groupSequence = sequence()
            var assertSequence = sequence()
            var countSequence = sequence()
            var logSequence = sequence()
            var endSequence = sequence()

            Unit.test('one', function() {
                this.log("string")
                this.ok(false, "string")
                this.ok(true)

                this.test('two', function() {
                    this.count(1)
                    this.ok(true)
                })
            }).events({
                    group: function(e) {
                        groupSequence(function() {
                            t.ok(e.name === 'one')
                        },function() {
                            t.ok(e.name === 'two')
                        })
                    },
                    assert: function(e) {
                        assertSequence(function() {
                            t.ok(e.success === false)
                        },function() {
                            t.ok(e.success === true)
                        },function() {
                            t.ok(e.success === true)
                        })
                    },
                    count: function(e) {
                        countSequence(function() {
                            t.ok(e.success === undefined)
                            t.ok(e.sourceLines === 'this.count(1)')
                        })
                    },
                    log: function(e) {
                        logSequence(function() {
                            t.ok(e.values[0] === "string")
                        })
                    },
                    end: function(e) {
                        done.return()
                        endSequence(function() {
                            t.ok(e.type === 'normal', e.type)
                        })
                    }
                })
        })

        this.test('event stream timeout', function(t) {
            this.count(1)
            var done = new Future
            moreFutures.push(done)
            var endSequence = sequence()

            Unit.test(function() {
                this.count(1) // waiting for 1 assert that will never come
                this.timeout(10)
            }).events({
                    end: function(e) {
                        done.return()
                        endSequence(function() {
                            t.ok(e.type === 'timeout')
                        })
                    }
                })
        })

        this.test('event stream nested call', function(t) {
            this.count(1)

            var unittest = Unit.test(function() {
                this.count(1) // waiting for 1 assert that will never come
                this.timeout(10)
            })

            unittest.events({
                end: function(e) {
                    unittest.events({
                        end: function() {
                            t.ok(true)
                        }
                    })
                }
            })
        })
        //*/

        Future.all(moreFutures).then(function() {
            isDone.return()
        }).done()
    }
}




// returns a function that calls a different function every time
// when it runs out of functions, it errors
function sequence() {
    var n = 0
    return function() {
        var fns = arguments
        n++
        if(n-1 >= fns.length) throw Error("Unexpected call "+n)
        fns[n-1]()

    }
}