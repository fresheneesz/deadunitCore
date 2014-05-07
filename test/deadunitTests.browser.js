
var Future = require('async-future')

var tests = require("./deadunitTests")

module.exports = function(Unit) {
    return function(t) {
        this.count(2)
        this.timeout(10 * 1000)
        var browserSpecificFuture = new Future

        var errorCount = 0
        this.error(function(e) {
            errorCount++
            if(errorCount > 8) {  // there are a bunch of exceptions that are expected
                t.ok(false, e)
            } else {
                t.log(e)
            }
        })

        //*
        this.test('browser-specific tests', function() {
            this.test('sourcemap', function(t) {
                this.count(5)
                this.timeout(2000)

                var unittest = Unit.test(function() {
                    this.test('webpack source map file', window.sourceMapTest3)
                }).events({
                    end: function(e) {
                        var results = unittest.results()
                        browserSpecificFuture.return()

                        t.ok(results.results[0].results[0].line === 4)
                        t.ok(results.results[0].results[0].sourceLines === 'this.ok(true)')
                        t.ok(results.results[0].exceptions.length === 1)
                        t.ok(results.results[0].exceptions[0].message === "webpack bundle error")
                        t.ok(results.results[0].exceptions[0].stack.match(/sourceMapTest3 \(.*webpackTest.js:5(:[0-9]+)?\)/) !== null, results.results[0].exceptions[0].stack)
                        t.log(results.results[0].exceptions[0])
                    }
                })
            })
        })

        browserSpecificFuture.then(function() {
            t.test("common tests", tests.getTests(Unit, 'web', {return: function(){}}))
        })
        //Z*/
    }
}