**Status**: API finalized, needs testing

`deadunitCore`
============

The core functionality for [deadunit](https://github.com/fresheneesz/deadunit).
Has a dead-simple unit testing api that outputs unit-testing results as simple javascript objects that can be accessed programmatically for display or inspection.


Example
=======

```javascript
var Unit = require('deadunit-core')

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

`Unit.error(<errorHandler>)` - sets up a default function that is called when an unhandled error happens. The main use case for this right now is if the test results were grabbed before the test was finished running.

UnitTester
----------

`this.ok(<success>, [<actualValue>, [expectedValue]])` - makes an assertion about some data. Usually this can be used with just the first parameter.

* `<success>` - a value that the test expects to be true.
* `<actualValue>` - (optional) the "actual value" being tested. The test results will contain information about the actual value. Example: `this.ok(num === 5, num)`
* `<expectedValue>` - (optional) the "expected value". The test results will contain information on the expected value. Example: `this.ok(obj.x === 5, obj.x, 5)

`this.count(<number>)` - Declares that a test contains a certain `<number>` of test groups and asserts (the `ok` method call). Does not count asserts in subtests.

`this.test([<name>, ]<testFunction>)` - runs a subtest. Has the same behavior as `Unit.test`. Any number of subtests can be nested inside eachother.

`this.log(<value>, <value2>, ...)` - Records a concatenated list of values that can be accessed in the test results. This will probably normally be used to record informational string messages.

`this.before(<function>)` - Runs the passed `<function>` once before each subtest in the test.

`this.after(<function>)` - Runs the passed `<function>` once after each subtest in the test.

`this.error(<function>)` - Sets up a function that handles unhandled errors that happen specifically inside `this` test. This overrides a handler set up by `Unit.error`. Currently, this does  *not* catch undhandled errors thrown by child-tests.

UnitTest
----------

`test.results()` - access the test results. Should only be accessed after the entire test has been completed (an asynchronous error will be thrown if more test results happen after the test results have been accessed).

* returns a test group

### Result Types ###

#### group ####
```javascript
{  type: 'group',        // indicates a test group (either a `Unit.test` call or `this.test`)
   name: _,              // the name of the test
   results: _,           // An array of test results, which can be of an `UnitTest` Result Types
   exceptions: _,        // An array of uncaught exceptions thrown in the test,
   duration: _,          // the duration of the test from its start til the last test action (assert, log, etc)
                         //  including asynchronous parts and including subtests
   syncDuration: _,      // the synchronous duration of the test (not including any asynchronous parts)
   totalSyncDuration: _  // syncDuration plus the before and after (if applicable)
}
```

#### assert ####
```javascript
{  type: 'assert',   // indicates an assert (either an `ok` or `count` call)
   success: _,       // true or false, whether the assert passed or failed
   sourceLines: _,   // the text of the actual line of code for the assert
   file: _,          // the filename of the file containing the test
   line: _,          // line number of the assert
   column: _,        // column number of the assert (not sure this is totally accurate)
   expected: _,      // (optional) the value expected in the assert (third parameter to `ok`)
   actual: _         // (optional) the actual value gotten (second parameter to `ok`)
}
```

#### log ####
```javascript
{  type: 'log',       // indicates a test log - this is so you can log something in-line with the test results
   values: _          // the logged values
}
```

Note about tests with asynchronous parts
========================================

Javascript (and node.js especially) has a lot of asynchronous parts.
Deadunit allows your tests to run asychronously/concurrently, but you have to manage that concurrency.
In particular, you shouldn't access the results of a test unit before all parts of the test are complete (or your results will be incomplete).
In order to make sure the tests are all done, you should manage concurrency in some way.

I recommend that you use either:

* [`fibers/future`s](https://github.com/laverdet/node-fibers#futures),
* or my own [async-futures](https://github.com/fresheneesz/asyncFuture)

To Do
=====

* have default timeouts for tests, so that if things hang somewhere the test still returns in a timely way (i think this obviates the need for the process.on exit stuff)
    * on process exit, instead of (or in addition to) writing to the console, throw all the exceptions that were caught by the test
* Allow actual and expected to be set as undefined (without causing them to not show up) - this would require some tricky magic
* do something about the dependence on node.js domains (so browsers can use deadunit)
* allow individual tests be cherry picked (for rerunning tests or testing specific things in development)
* fix up sourceLines grabbing so that it properly grabs the source for asserts that span multiple lines, and also so it strips off the "this.ok()" part of the line (which is useless to print)
* stream semantics for faster running tests (maybe?)

How to Contribute!
============

Anything helps:

* Creating issues (aka tickets/bugs/etc). Please feel free to use issues to report bugs, request features, and discuss changes.
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

Changelog
========

* 1.1.2
  * Changed `log` interface to be able to pass in multiple values
* 1.1.1
  * enabled tests to still get all executed test results even if a [fiber](https://github.com/laverdet/node-fibers) dies midway through a test group
* 1.1.0
  * changed count to count asserts and subtests in the current test, and ignore asserts in subtests
  * changed duration keys in order to make more sense and add asynchronous duration

License
=======
Released under the MIT license: http://opensource.org/licenses/MIT
