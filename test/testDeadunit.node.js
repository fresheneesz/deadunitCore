"use strict";

var OldDeadunit = require('deadunit')
var Unit = require('../deadunitCore.node')
var Future = require('async-future')

var tests = require("./deadunitTests")

// these two are required for the 'sourcemap' test, but need to be here because the files can't be built into the bundle (or the sourcemap comment will eff things up)
require('./inlineSourceMapTest.browserified.umd')
require('./sourceMapTest.js') // it needs to be global in the browser context so its sourcemap doesn't conflict inside the bundle

var mainTest = OldDeadunit.test(tests.name, function(t) {



    //*
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
                this.count(2) // timeout
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
            }).events({end: function() {
                Future.all([f,f2]).then(function() {
                    var results = test.results()

                    t.ok(results.results.length === 3, results.results.length)

                    t.ok(results.results[0].exceptions.length === 0, require('util').inspect(results.results[0].exceptions))
                    t.ok(results.results[0].results.length === 1, results.results[0].results.length)
                    t.ok(results.results[0].results[0].success === true)
                    t.ok(results.results[0].duration !== undefined, results.results[0].duration)
                    t.ok(results.results[0].duration >= 0, results.results[0].duration)

                    t.ok(results.results[1].exceptions.length === 0, require('util').inspect(results.results[0].exceptions))
                    t.ok(results.results[1].results.length === 0)
                    t.ok(results.results[1].duration !== undefined, results.results[1].duration)
                    t.ok(results.results[1].duration >= 0, results.results[1].duration)
                }).done()
            }})
        })



    })


    this.test('common tests', tests.getTests(Unit, 'node'))

    //*/


}).writeConsole(500)



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