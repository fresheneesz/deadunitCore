
var Future = require('async-future')

var tests = require("./deadunitTests")

module.exports = function(Unit, testEnvironment) {
    return function(t) {
        this.count(2)
        this.timeout(15*1000)
        var browserSpecificFutures = []

        var expectedExceptions = 10
        var errorCount = 0
        this.error(function(e) {
            errorCount++
            if(errorCount > expectedExceptions) {  // there are a bunch of exceptions that are expected
                t.ok(false, e)
            } else {
                t.log(e)
            }
        })


        //*
        this.test('browser-specific tests', function() {

            if(testEnvironment === 'web') {
                this.test('sourcemap', function(t) {
                    this.count(5)
                    this.timeout(2000)

                    var f = new Future; browserSpecificFutures.push(f)
                    var unittest = Unit.test(function() {
                        this.test('webpack source map file', grobal.webpackTest)
                    }).events({
                        end: function(e) {
                            var results = unittest.results()

                            t.ok(results.results[0].results[0].line === 2)
                            t.ok(results.results[0].results[0].sourceLines === 'this.ok(true)')
                            t.ok(results.results[0].exceptions.length === 1)
                            t.ok(results.results[0].exceptions[0].message === "webpack bundle error")
                            var webpackExceptionLine = 3
                            t.ok(results.results[0].exceptions[0].stack.match(
                                    new RegExp("webpackTest \\(.*webpackTest.js:"+webpackExceptionLine+"(:[0-9]+)?\\)")
                                ) !== null,
                                results.results[0].exceptions[0].stack)
                            t.log(results.results[0].exceptions[0])

                            f.return()
                        }
                    })
                })
            }

            // note: this test used to cause a stack loop that crashed chrome and blew firefox's memory usage way up (probably until it'd crash too)
            this.test('ajax failure', function(t) {
                this.count(4)

                var FailUnit = require('./deadunitCore.browserAjaxFailure')

                var f = new Future; browserSpecificFutures.push(f)
                var unittest = FailUnit.test(function(t) {
                    this.count(2)
                    this.ok(true)
                    setTimeout(function() {
                        t.ok(true)
                        throw new Error('asynchronous error')
                    }, 0)
                    throw new Error('synchronous error')
                }).events({
                    end: function(e) {
                        var results = unittest.results()

                        t.ok(results.results.length === 3, results.results.length)
                        t.ok(results.exceptions.length >= 2, results.exceptions.length) //  honestly i'm just happy if this test doesn't crash the browser

                        f.return()
                    }
                })

                var FailUnit2 = require('./deadunitCore.browserAjaxThrow')

                var f2 = new Future; browserSpecificFutures.push(f2)
                var unittest2 = FailUnit2.test(function(t) {
                    this.count(2)
                    this.ok(true)
                    setTimeout(function() {
                        t.ok(true)
                        throw new Error('asynchronous error')
                    }, 0)
                    throw new Error('synchronous error')
                }).events({
                    end: function(e) {
                        var results = unittest2.results()

                        t.ok(results.results.length === 3, results.results.length)
                        t.ok(results.exceptions.length >= 2, results.exceptions.length) //  honestly i'm just happy if this test doesn't crash the browser

                        f2.return()
                    }
                })

            })

        })

        Future.all(browserSpecificFutures).then(function() {
            t.test("common tests", tests.getTests(Unit, testEnvironment, {return: function(){}}))
        })
        //*/
    }
}