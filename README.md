`deadunitCore`
============

The core functionality for deadunit.
Has a dead-simple unit testing api that outputs unit-testing results as simple javascript objects that can be accessed programmatically for display or inspection.

Example
=======

```javascript
var Unit = require('dead-unit')

var test = Unit.test('some test name', function() {
    var obj = someFunctionToTest()

    this.ok(obj.x === 5)
    this.ok(obj.y === 'y')

    this.test('nested test', function() {
        this.ok(obj.go() > 4)
    })
})

console.dir(test.results())
```

Install
=======

```javascript
npm install deadunit-core
```

Usage
=====
```javascript
var Unit = require('dead-unit')
```

`Unit.test([<name>, ]<testFunction>)` - runs a suite of unit tests. Returns a `UnitTest` object.

 * `<name>` - (optional) names the test
 * `<testFunction>` - a function that contains the asserts and sub-tests to be run. Both its one parameter and its bound `this` is given the same `UnitTester` object.

`Unit.error(<errorHandler>)` - sets up a function that is called when an unhandled error happens. The main use case for this right now is if the test results were grabbed before the test was finished running.

UnitTester
----------

`this.ok(<success>, [<actualValue>, [expectedValue]])` - makes an assertion about some data. Usually this can be used with just the first parameter.

* `<success>` - a value that the test expects to be true.
* `<actualValue>` - (optional) the "actual value" being tested. The test results will contain information about the actual value. Example: `this.ok(num === 5, num)`
* `<expectedValue>` - (optional) the "expected value". The test results will contain information on the expected value. Example: `this.ok(obj.x === 5, obj.x, 5)

`this.count(<number>)` - Declares that a test contains a certain `<number>` of asserts (the `ok` method call).

`this.log(<message>)` - Records a `<message>`that appears in the test results.

`this.before(<function>)` - Runs the passed `<function>` once before each subtest in the test.

`this.after(<function>)` - Runs the passed `<function>` once after each subtest in the test.

`this.test([<name>, ]<testFunction>)` - runs a subtest. Has the same behavior as `Unit.test`. Any number of subtests can be nested inside eachother.

UnitTest
----------



License
=======
Released under the MIT license: http://opensource.org/licenses/MIT
