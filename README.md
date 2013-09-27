`deadunitCore`
============

The core functionality for (deadunit)[https://github.com/fresheneesz/deadunit].
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

```
npm install deadunit-core
```

Usage
=====
```javascript
var Unit = require('deadunit-core')
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

`test.results()` - access the test results. Should only be accessed after the entire test has been completed (an asynchronous error will be thrown if more test results happen after the test results have been accessed).

* returns a test group

### Result Types ###

#### group ####
```javascript
{  type: 'group',           // indicates a test group (either a `Unit.test` call or `this.test`)
   name: <name>,            // the name of the test
   results: <results>,      // An array of test results, which can be of an `UnitTest` Result Types
   exceptions: <exceptions> // An array of uncaught exceptions thrown in the test
}
```

#### assert ####
```javascript
{  type: 'assert',              // indicates an assert (either an `ok` or `count` call)
   success: <success>,          // true or false, whether the assert passed or failed
   sourceLines: <sourceLines>,  // the text of the actual line of code for the assert
   file: <filename>,            // the filename of the file containing the test
   line: <lineNumber>,          // line number of the assert
   column: <column>,            // column number of the assert (not sure this is totally accurate)
   expected: <expected>,        // (optional) the value expected in the assert (third parameter to `ok`)
   actual: <actualvalue>        // (optional) the actual value gotten (second parameter to `ok`)
}
```

#### log ####
```javascript
{  type: 'log',           // indicates a test log - this is so you can log something in-line with the test results
   msg: <msg>             // the log message
}
```


How to Contribute!
============

Anything helps:

* Creating issues (aka tickets/bugs/etc). Please feel free to use issues to report bugs, request features, and discuss changes
* Updating the documentation: ie this readme file. Be bold! Help create amazing documentation!
* Submitting pull requests.

How to submit pull requests:

1. Please create an issue and get my input before spending too much time creating a feature. Work with me to ensure your feature or addition is optimal and fits with the purpose of the project.
2. Fork the repository
3. clone your forked repo onto your machine and run `npm install` at its root
4. If you're gonna work on multiple separate things, its best to create a separate branch for each of them
5. edit!
6. If it's a code change, please add to the unit tests (at test/testDeadunitCore.js) to verify that your change
7. When you're done, run the unit tests and ensure they all pass
8. Commit and push your changes
9. Submit a pull request: https://help.github.com/articles/creating-a-pull-request

License
=======
Released under the MIT license: http://opensource.org/licenses/MIT
