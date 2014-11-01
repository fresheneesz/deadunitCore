"use strict";

var Future = require('async-future')

exports.name = "Unit test the unit test-results (these should all succeed)"

exports.getTests = function(Unit, testEnvironment) {

    if(testEnvironment === 'web' || testEnvironment === 'web_fileProtocol') {
        var testFileName = "deadunitTests.browser.umd.js"

    } else if(testEnvironment === 'node') {
        var testFileName = "deadunitTests.js"

    } else throw "invalid environment: "+testEnvironment

    return function(t) {

        this.count(18)
        this.timeout(5 * 1000)

        var errorCount = 0
        this.error(function(e) {
            if(errorCount === 0) {
                e.message.indexOf("Async" !== -1)
            } else {
                t.ok(false, e)
            }

            errorCount++
        })

        function catchWarningsIfNeccessary(that) {
            if(testEnvironment === 'web_fileProtocol') {
                that.warning(function(e) {
                    console.log(e.message)
                })
            }
        }




        //*
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

        var simpleExceptionDone = new Future
        this.test('simple exception', function(t) {
            this.count(4)
            var test = Unit.test(function() {
                catchWarningsIfNeccessary(this)
                this.count(1)
                this.timeout(0) // just to make the test end faster
                throw Error("sync")
            }).events({
                end: function() {
                    var results = test.results()

                    t.ok(results.name === undefined)
                    t.ok(results.exceptions.length === 1, results.exceptions.length)
                    t.ok(results.exceptions[0].message === 'sync')
                    t.ok(results.timeout === true, results.timeout)

                    simpleExceptionDone.return()
                }
            })
        })

        simpleExceptionDone.then(function() {
            var simpleAsyncExceptionFutureDone = new Future
            t.test('simple async exception', function(t) {
                this.count(4)

                var simpleAsyncExceptionFuture = new Future
                var simpleAsyncExceptionTest = Unit.test(function(t) {
                    catchWarningsIfNeccessary(this)
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
                            if(testEnvironment === 'node') {
                                t.ok(test.exceptions[0].message === 'Async')
                            } else {
                                t.ok(
                                    test.exceptions[0].message.indexOf('Uncaught error in') === 0
                                    && test.exceptions[0].message.indexOf('Async') !== -1
                                    && test.exceptions[0].message.indexOf('deadunitTests.browser.umd.js') !== -1
                                )
                            }
                            t.ok(test.timeout === false)

                            simpleAsyncExceptionFutureDone.return()
                        }).done()
                    }
                })
            })

            return simpleAsyncExceptionFutureDone

        }).then(function() {

            var fullDeadunitTestFuture = new Future
            t.test('Testing "Full deadunit test"', function(t) {
                this.count(9)
                this.timeout(5 * 1000)

                var futuresToWaitOn = []
                var testGroups = Unit.test("Full deadunit test (results of this will be verified)", function() {

                    this.timeout(4000)

                    this.test("Test Some Stuff", function() {
                        this.test("assertSomething", function() {
                            this.ok(5 === 5)
                        })
                        this.test("'shouldFail' fails correctly", function() {
                            this.ok(5 === 3, 'actual', 'expected')
                            this.eq(true, false)
                            this.log("test log")
                            this.count(2)
                        })
                        this.test("shouldThrowException", function() {
                            this.count(1)
                            this.ok(true)
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
                            this.eq(true, true)
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
                    futuresForThisTest.then(function() {
                        var test = testGroups.results()

                        this.ok(test.timeout === false, test.timeout)
                        this.ok(test.type === "group")
                        this.ok(test.name === "Full deadunit test (results of this will be verified)")
                        if(testEnvironment === 'node') {
                            this.ok(test.exceptions.length === 0)
                        } else {
                            this.ok(test.exceptions.length === 3, test.exceptions)
                        }



                        this.ok(test.results.length === 4, test.results.length)

                        this.test("Verify 'Test Some Stuff'", function() {
                            this.count(46)

                            var subtest1 = test.results[0]
                            this.ok(subtest1.type === "group")
                            this.ok(subtest1.name === "Test Some Stuff")
                            this.ok(subtest1.exceptions.length === 0)
                            this.ok(subtest1.results.length === 7, subtest1.results.length)

                                var subtest2 = subtest1.results[0]     // count
                                this.ok(subtest2.success === false, subtest2.success)

                                subtest2 = subtest1.results[1]
                                this.ok(subtest2.type === "group")
                                this.ok(subtest2.name === "assertSomething")
                                this.ok(subtest2.exceptions.length === 0)
                                this.ok(subtest2.results.length === 1)

                                    var subtest3 = subtest2.results[0]
                                    this.ok(subtest3.type === "assert")
                                    this.ok(subtest3.success === true)
                                    this.ok(subtest3.sourceLines.indexOf("5 === 5") !== -1)
                                    this.ok(subtest3.file === testFileName)

                                    if(testEnvironment === 'node') {
                                        var subtest3line = 153
                                        this.ok(subtest3.line === subtest3line, subtest3.line)
                                    } else {
                                        var subtest3line = 7951
                                        this.ok(subtest3.line === subtest3line, subtest3.line) // browserify bug causes sourcemap to not be found
                                    }

                                    //this.ok(subtest3.column === 9, subtest3.column)

                                subtest2 = subtest1.results[2]
                                this.ok(subtest2.name === "'shouldFail' fails correctly", subtest2.name)
                                this.ok(subtest2.exceptions.length === 0)
                                this.ok(subtest2.results.length === 4, subtest2.results.length)

                                    subtest3 = subtest2.results[0]      // count
                                    this.ok(subtest3.type === "assert", subtest3.type)
                                    this.ok(subtest3.success === true, subtest3.success)

                                    subtest3 = subtest2.results[1]
                                    this.ok(subtest3.success === false)
                                    this.ok(subtest3.sourceLines.indexOf("5 === 3") !== -1)
                                    this.ok(subtest3.actual === 'actual')
                                    this.ok(subtest3.expected === 'expected')

                                    subtest3 = subtest2.results[2]
                                    this.ok(subtest3.success === false)
                                    this.ok(subtest3.sourceLines.indexOf("true, false") !== -1)
                                    this.ok(subtest3.file === testFileName)
                                    this.ok(subtest3.line === subtest3line+4, subtest3.line)
                                    //this.ok(subtest3.column === 9, subtest3.column)

                                    subtest3 = subtest2.results[3]
                                    this.ok(subtest3.type === "log")
                                    this.ok(subtest3.values.length === 1)
                                    this.ok(subtest3.values[0] === "test log")

                                subtest2 = subtest1.results[3]
                                this.ok(subtest2.name === "shouldThrowException")
                                this.ok(subtest2.exceptions.length === 1)
                                this.ok(subtest2.exceptions[0].message === "Ahhhhh!")

                                this.ok(subtest2.results.length === 2, subtest2.results.length)

                                    subtest3 = subtest2.results[0]     // count
                                    this.ok(subtest3.success === true)

                                    subtest3 = subtest2.results[1]
                                    this.ok(subtest3.success === true)

                                subtest2 = subtest1.results[4]
                                this.ok(subtest2.name === "should throw an asynchronous exception")
                                if(testEnvironment === 'node') {
                                    this.ok(subtest2.exceptions.length === 1)
                                    this.ok(subtest2.exceptions[0].message === "Asynchronous Ahhhhh!")
                                } else {
                                    this.ok(subtest2.exceptions.length === 0)
                                    this.ok(test.exceptions[0].message.indexOf('Asynchronous Ahhhhh!') !== -1)

                                }

                                this.ok(subtest2.results.length === 2, subtest2.results.length)

                                subtest2 = subtest1.results[5]
                                this.ok(subtest2.type === 'log', subtest2.type) // log
                                this.ok(subtest2.values[0] === 'subtest without a name')

                                subtest2 = subtest1.results[6]
                                this.ok(subtest2.name === undefined)
                                this.ok(subtest2.exceptions.length === 0)
                                this.ok(subtest2.results.length === 1)
                                this.ok(subtest2.results[0].success === true)
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
                            this.ok(subtest1.results.length === 0)

                            if(testEnvironment === 'node') {
                                this.ok(subtest1.exceptions.length === 2)
                                this.ok(subtest1.exceptions[0].message === 'moo')
                                this.ok(subtest1.exceptions[1] === 'thrown string')
                            } else {
                                this.ok(subtest1.exceptions.length === 0)

                                this.ok(test.exceptions[1].message.indexOf('moo') !== -1)
                                this.ok(test.exceptions[2].message.indexOf('thrown string') !== -1) // in the browser, async errors are converted to the stupid onerror format, and so deadunit makes them all Error objects after that
                            }

                        })

                        fullDeadunitTestFuture.return()

                    }.bind(this)).done()

                }.bind(this)})

            })

            return fullDeadunitTestFuture

        }).then(function() {

            //*
            t.test("befores and afters", function() {
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

            t.test("Asynchronous times", function(t) {
                t.count(7)

                var f1 = new Future, f2 = new Future, f3 = new Future
                var test = Unit.test(function(test) {
                    this.count(2)
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
                }).events({end: function() {
                    Future.all([f1,f2]).then(function() {
                        var results = test.results()

                        t.ok(results.timeout === false, results.timeout)
                        t.ok(results.duration >= 200, results.duration)
                        t.ok(results.results.length === 3, results.results.length)
                        t.ok(results.results[0].success === true)  // count
                        t.ok(results.results[1].results.length === 2)
                        t.ok(results.results[1].results[0].success === true)
                        t.ok(results.results[1].duration >= 200, require('util').inspect(results.results[0]))

                    }).catch(function(e) {
                        t.ok(false, e)
                    }).finally(function() {
                        f3.return()
                    }).done()
                }})
            })

            function testCounts(t, test) {
                var results = test.results()

                t.ok(results.results.length === 3, results.results.length)
                t.ok(results.results[0].actual === 2 && results.results[2].success === true, require('util').inspect(results.results[2]))
                var subtest1 = results.results[1]
                    var subtest1Count = subtest1.results[0]
                    t.ok(subtest1Count.actual === 2 && subtest1Count.success === true, require('util').inspect(subtest1Count))
                    t.ok(subtest1.results.length === 3, subtest1.results.length)
                    var subtest2 = subtest1.results[1]
                        var subtest2Count = subtest2.results[0]
                        t.ok(subtest2.results.length === 2, subtest2.results.length)
                        t.ok(subtest2Count.actual === 1
                            && subtest2Count.success === true, require('util').inspect(subtest2Count))
            }

            t.test("counts", function(t) {
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

            t.test("asynchronous counts", function(tester) {
                var f = new Future, done = new Future
                var one = new Future, two = new Future // setTimeout apparently isn't deterministic in node.js (which sucks), so using futures instead to guarantee order

                this.count(6)

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
                }).events({end: function(){
                    f.then(function() {
                        testCounts(tester, test)

                    }).finally(function() {
                            done.return()
                    }).catch(function(e) {
                        tester.ok(false, e)
                    }).done()
                }})
            })

            t.test("timeouts", function(t) {
                this.count(1)
                this.timeout(2000)

                var test = Unit.test(function(t) {
                    this.timeout(500)
                    this.test(function() {
                        this.count(1) // to make it timeout
                        this.timeout(50)
                    })
                }).events({end: function() {
                    var results = test.results()
                    t.ok(results.duration >= 500, results.duration)
                }})
            })

            var unhandledErrorHandlerFuture = new Future
            t.test('unhandled error handler', function(realt) {
                this.count(8)

                var errorSequence = sequence()
                var warningSequence = sequence()
                var test = Unit.test(function(t) {
                    this.count(1)

                    this.error(function(e) {
                        errorSequence(function() {
                            realt.ok(e.message === 'synchronous', e)

                        },function() {
                            if(testEnvironment === 'node') {
                                realt.ok(e.message === 'a freaking test error', e)
                            } else {
                                realt.ok(e.message.indexOf('a freaking test error') !== -1)
                            }
                        },function() {
                            if(testEnvironment === 'node') {
                                realt.ok(e === 'thrown string', e)
                            } else {
                                realt.ok(e.message.indexOf('thrown string') !== -1, e)
                            }
                        },function() {
                            throw new Error('error inside error handler')
                        })
                    })

                    this.warning(function(w) {
                        warningSequence(function() {
                            realt.ok(w.message === 'error inside error handler')
                        })
                    })

                    setTimeout(function() {
                        throw new Error('a freaking test error')
                    },0)
                    setTimeout(function() {
                        throw "thrown string"
                    },0)
                    setTimeout(function() {
                        throw new Error('One more')
                    },0)
                    setTimeout(function() {
                        t.ok(true) // here to make sure all the exceptions are waited for
                    },0)
                    unhandledErrorHandlerFuture.then(function() {
                        this.error(undefined) // get rid of error handler once test is done
                    }.bind(this))

                    throw new Error("synchronous")

                }).events({end: function() {
                    var results = test.results()

                    realt.ok(results.name === undefined)
                    realt.ok(results.results.length === 2, results.results)
                    realt.ok(results.exceptions.length === 1, results.exceptions)

                    if(testEnvironment === 'node') {
                        realt.ok(results.exceptions[0].message === 'One more')
                    } else {
                        realt.ok(results.exceptions[0].message.indexOf('One more') !== -1, results.exceptions[0])
                    }

                    unhandledErrorHandlerFuture.return()
                }})
            })

            return unhandledErrorHandlerFuture

        }).then(function(){
            //*
            var logsFuture = new Future
            t.test('logs', function() {
                this.timeout(2000)

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

                    logsFuture.return()
                }.bind(this)})


            })

            return logsFuture

        }).then(function(){

            t.test('event stream', function(t) {
                this.count(9)

                var groupSequence = sequence()
                var assertSequence = sequence()
                var countSequence = sequence()
                var logSequence = sequence()
                var endSequence = sequence()

                Unit.test('one', function() {
                    this.timeout(9000) // because ie is slow
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
                                t.ok(e.sourceLines === 'this.count(1)', e.sourceLines)
                            })
                        },
                        log: function(e) {
                            logSequence(function() {
                                t.ok(e.values[0] === "string")
                            })
                        },
                        end: function(e) {
                            endSequence(function() {
                                t.ok(e.type === 'normal', e.type)
                            })
                        }
                    })
            })

            t.test('event stream timeout', function(t) {
                this.count(1)
                var endSequence = sequence()

                Unit.test(function() {
                    this.count(1) // waiting for 1 assert that will never come
                    this.timeout(10)
                }).events({
                        end: function(e) {
                            endSequence(function() {
                                t.ok(e.type === 'timeout')
                            })
                        }
                    })
            })

            t.test('event stream nested call', function(t) {
                this.count(1)

                var unittest = Unit.test(function() {
                    this.count(1) // waiting for 1 assert that will never come
                    this.timeout(10)
                }).events({
                    end: function(e) {
                        unittest.events({
                            end: function() {
                                t.ok(true)
                            }
                        })
                    }
                })
            })

            t.test('sourcemap', function(t) {
                this.count(19)
                this.timeout(2000)

                var unittest = Unit.test(function() {
                    this.test('coffeescript file', global.sourceMapTest)  // coffeescript sucks
                    this.test('inline source map file', grobal.inlineSourceMapTest)
                    this.test('sourcemap file not found', grobal.deadlinkSourcemapPath)
                    this.test('original file not found', grobal.deadlinkSourceOriginal)
                }).events({
                    end: function(e) {
                        var results = unittest.results()

                        t.eq(results.results[0].results[0].line , 4)
                        t.eq(results.results[0].results[0].sourceLines , 'this.ok true')

                        t.ok(results.results[0].results[1].results[0].line === 11) // in the original source it's 8, this tests turning off source map printing
                        t.ok(results.results[0].results[1].results[0].sourceLines === 'return this.ok(true);')
                        t.ok(results.results[0].exceptions.length === 1)
                        t.eq(results.results[0].exceptions[0].message , 'sourcemap test error')
                        t.ok(results.results[0].exceptions[0].stack.match(
                                /sourceMapTest \(.*sourceMapTest.coffee:10(:[0-9]+)?\)/
                            ) !== null,
                            results.results[0].exceptions[0].stack)
                        t.log(results.results[0].exceptions[0])

                        t.eq(results.results[1].results[0].line , 3) // IMPORTANT NOTE: the line *should* be 2, but looks like browserify messed this one up
                        t.eq(results.results[1].results[0].sourceLines, 'this.ok(true)')

                        t.eq(results.results[2].results[0].line , 3) // IMPORTANT NOTE: the line *should* be 2, but looks like browserify messed this one up
                        t.ok(results.results[2].results[0].sourceLines === 'this.ok(true)')
                        t.ok(results.results[2].exceptions.length === 1)
                        t.ok(results.results[2].exceptions[0].message === "deadlink sourcemap path error")
                        var deadlinkSourceMapPath_line = 4
                        t.ok(results.results[2].exceptions[0].stack.match(
                                new RegExp("deadlinkSourcemapPath \\(.*deadlinkSourcemapPath.umd.js:"+deadlinkSourceMapPath_line+"(:[0-9]+)?\\)") // /deadlinkSourcemapPath \(.*deadlinkSourcemapPath.umd.js:7(:[0-9]+)?\)/
                            ) !== null,
                            results.results[2].exceptions[0].stack)
                        t.log(results.results[2].exceptions[0])

                        t.eq(results.results[3].results[0].line , 3)   // IMPORTANT NOTE: the line *should* be 2, but looks like browserify messed this one up
                        t.ok(results.results[3].results[0].sourceLines === 'this.ok(true)')
                        t.ok(results.results[3].exceptions.length === 1)
                        t.ok(results.results[3].exceptions[0].message === "deadlink source original error")
                        var deadlinkSourceOriginal_line = 4
                        t.ok(results.results[3].exceptions[0].stack.match(
                                new RegExp("deadlinkSourceOriginal \\(.*deadlinkSourceOriginal.umd.js:"+deadlinkSourceOriginal_line+"(:[0-9]+)?\\)") // /deadlinkSourceOriginal \(.*deadlinkSourceOriginal.umd.js:7(:[0-9]+)?\)/
                            ) !== null,
                            results.results[3].exceptions[0].stack)
                        t.log(results.results[3].exceptions[0])
                    }
                })
            })


            t.test('using result of `test` as future', function(realTest) {
                realTest.count(6)

                var eventSequence = sequence()
                var event = function(x) {
                    eventSequence(function() {
                        realTest.eq(x,1)
                    }, function() {
                        realTest.eq(x,2)
                    }, function() {
                        realTest.eq(x,3)
                    }, function() {
                        realTest.eq(x,4)
                    }, function() {
                        realTest.eq(x,5)
                    }, function() {
                        realTest.eq(x,6)
                    })
                }

                var unittest = Unit.test(function(innerTest) {
                    innerTest.test(function() {
                        this.ok(true)
                        event(1)
                    }).complete.then(function() {
                        event(2)
                        return innerTest.test(function(t2) {
                            this.count(1)
                            this.timeout(1000)
                            event(3)
                            setTimeout(function() {
                                t2.ok(true)
                                event(4)
                            },100)
                        }).complete
                    }).then(function() {
                        event(5)
                    }).catch(function(e) {
                            t.ok(false, e)
                    }).done()
                }).events({
                    end: function(e) {
                        event(6)
                    }
                })
            })


            t.test('former bugs', function() {
                this.count(3)

                this.test('deadunit would crash if an asynchronous error was thrown in the top-level main test', function(t) {
                    this.count(2)

                    var unittest = Unit.test(function() {
                        this.count(1)
                        this.timeout(100)
                        setTimeout(function() {
                            throw Error("Don't break!")  // tests a former bug where
                        }, 0)
                    })
                    unittest.events({
                        end: function(e) {
                            var results = unittest.results()

                            t.ok(results.exceptions.length === 1, results.exceptions)
                            if(testEnvironment === 'node') {
                                t.ok(results.exceptions[0].message === "Don't break!")
                            } else {
                                t.ok(results.exceptions[0].message.indexOf("Don't break!") !== -1)
                            }
                        }
                    })
                })

                this.test('multi-line asserts', function(t) {
                    this.count(3)
                    var unittest = Unit.test(function() {
                        this.ok(
                            true
                        )
                        this.ok(
                            (true)
                        )
                        this.ok(
                            ")" === ")"
                        )
                    })
                    unittest.events({
                        end: function(e) {
                            var results = unittest.results()
                            var sourceLines = results.results[0].sourceLines
                            var squashedSourceLines = sourceLines.replace(/ /g, '')

                            t.ok(squashedSourceLines === "this.ok(\ntrue\n)", squashedSourceLines)
                            t.ok(results.results[1].sourceLines.replace(/ /g, '') === "this.ok(\n(true)\n)")
                            t.ok(results.results[2].sourceLines.replace(/ /g, '') === 'this.ok(\n")"===")"\n)', results.results[2].sourceLines.replace(/ /g, ''))
                        }
                    })
                })

                // note: I couldn't get this to cause too much recursion in node.js no matter how high I set maxN
                    // but it manifested in Chrome as a crash and Firefox as a "too much recursion" error
                this.test('too much recursion / EMFILE issue', function(t) {
                    this.count(1)
                    var maxN = 1000
                    var unittest = Unit.test(function() {
                        for(var n=0; n<maxN; n++) {
                            this.ok(true)
                        }
                    }).events({
                        end: function(e) {
                            var results = unittest.results()
                            t.eq(results.results.length, maxN)
                        }
                    })
                })
            })

        }).done()

        //*/
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