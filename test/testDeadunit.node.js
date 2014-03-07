"use strict";

var OldDeadunit = require('deadunit')
var Unit = require('../deadunitCore.node')
var Future = require('async-future')

var tests = require("./deadunitTests")

var isDone = new Future
var mainTest = OldDeadunit.test(tests.name, function() {

    this.test('node-specific tests', function() {
        this.count(1)

        // when using fibers/futures, sometimes incorrect causes a future to never be resolved,
        // which causes the program to exit in what should be the middle of a continuation
        // this test is about making sure that you can at least see the results that were collected within that incomplete test
        this.test('fibers/futures - never-resolved future problem', function(t) {
            this.count(10)

            var Fiber = require('fibers')
            var FibersFuture = require('fibers/future')

            var f = new Future, f2 = new Future
            var ff = new FibersFuture

            var test = Unit.test(function() {
                this.timeout(100) // timeout faster
                setTimeout(function() {
                    Fiber(function() {
                        f.return()
                        this.test("Dead fiber after results", function() {
                            this.ok(true)
                            ff.wait()
                            this.ok(false) // not supposed to get here
                        })
                    }.bind(this)).run()
                }.bind(this),0)

                setTimeout(function() {
                    Fiber(function() {
                        f2.return()
                        this.test("Dead fiber before any results", function() { // this previously caused the duration to show up as NaN
                            ff.wait()
                            this.ok(false) // not supposed to get here
                        })
                    }.bind(this)).run()
                }.bind(this),0)
            })

            Future.all([f,f2]).then(function() {
                var results = test.results()

                t.ok(results.results.length === 2, results.results.length)

                t.ok(results.results[0].exceptions.length === 0, require('util').inspect(results.results[0].exceptions))
                t.ok(results.results[0].results.length === 1)
                t.ok(results.results[0].results[0].success === true)
                t.ok(results.results[0].duration !== undefined, results.results[0].duration)
                t.ok(results.results[0].duration >= 0, results.results[0].duration)

                t.ok(results.results[1].exceptions.length === 0, require('util').inspect(results.results[0].exceptions))
                t.ok(results.results[1].results.length === 0)
                t.ok(results.results[1].duration !== undefined, results.results[1].duration)
                t.ok(results.results[1].duration >= 0, results.results[1].duration)
            }).done()
        })
    })

    this.test('common tests', tests.getTests(Unit, isDone))

})

var to = setTimeout(function() {
    mainTest.writeConsole()
    console.log('Had to time out the test')
},4000)


isDone.then(function() {
    mainTest.writeConsole(500)
    clearTimeout(to)
}).done()