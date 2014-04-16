`deadunitCore`
============

The core functionality for [deadunit](https://github.com/fresheneesz/deadunit).
Has a dead-simple, flexible unit testing api that outputs unit-testing results as simple javascript objects that can be accessed programmatically for display or inspection.


Example
=======

Simple output
```javascript
var Unit = require('deadunit-core')

var test = Unit.test('some test name', function() {
    var obj = someFunctionToTest()

    this.ok(obj.x === 5)
    this.ok(obj.y === 'y')

    this.test('nested test', function() {
        this.ok(obj.go() > 4)
    })

    this.done()
}).events({
 	end: function() {
    	console.dir(test.results())
    }
})


```

Event driven output
```javascript

Unit.test('another test', function() {
    var obj = someFunctionToTest()
    this.ok(obj.msg.indexof("hi") !== -1)
    this.done()
}).events({
    group: function(g) {
        console.log(g.name +" started at "+g.time)
    },
    assert: function(e) {
        console.log(e.success +" - "+e.sourceLines)
    },
    log: function(log) {
        console.dir(log.values)
    },
    end: function() {
        console.log("Done!")
    }
})

```

Install
=======

```
npm install deadunit-core
```

Usage
=====
```javascript
var Unit = require('deadunit-core') // node.js

// require js
require(['node_modules/browserPackage/deadunitCore.browser.gen.umd'], function(Unit) {
   // ...
}

// browser global (the global variable will be 'deaunitCore')
<script src='node_modules/browserPackage/deadunitCore.browser.gen.umd'></script>
```

`Unit.test([<name>, ]<testFunction>)` - runs a suite of unit tests. Returns a `UnitTest` object. Returns without having run the tests first - the tests are scheduled to run asynchronously soon thereafter.

 * `<name>` - (optional) names the test
 * `<testFunction>` - a function that contains the asserts and sub-tests to be run. Both its one parameter and its bound `this` is given the same `UnitTester` object.

`Unit.error(<errorHandler>)` - sets up a default function that is called when an unhandled error happens. The main use case for this right now is if the test results were grabbed before the test was finished running.

UnitTester
----------

`this.ok(<success>, [<actualValue>, [expectedValue]])` - makes an assertion about some data. Usually this can be used with just the first parameter.

* `<success>` - a value that the test expects to be true.
* `<actualValue>` - (optional) the "actual value" being tested. The test results will contain information about the actual value. Example: `this.ok(num === 5, num)`
* `<expectedValue>` - (optional) the "expected value". The test results will contain information on the expected value. Example: `this.ok(obj.x === 5, obj.x, 5)

`this.count(<number>)` - Declares that a test contains a certain `<number>` of test groups and asserts (the `ok` method call). Does not count asserts in subtests. This should only be called once per group, and shouldn't be called asynchronously. This is also used to determine when tests are complete. If `count` is not called in a test, that test completes when all of its subtests complete. If `count` is called, then the test completes when the count is reached.

`this.test([<name>, ]<testFunction>)` - runs a subtest. Has the same behavior as `Unit.test`. Any number of subtests can be nested inside eachother.

`this.log(<value>, <value2>, ...)` - Records a concatenated list of values that can be accessed in the test results. This will probably normally be used to record informational string messages.

`this.timeout(<milliseconds>)` - adds a timeout of `<milliseconds>`  from the time at which its called. The test will only time out when all added timeouts expire. When `Unit.test` is called, a timeout of `3000ms` is set, and the first time `this.timeout` is called, it will override this default instead of just adding an extra timeout - so you can reduce the timeout from this default. Note that this is a timeout for the entire test, not just the specific test-group.

`this.before(<function>)` - Runs the passed `<function>` once before each subtest in the test.

`this.after(<function>)` - Runs the passed `<function>` once after each subtest in the test.

`this.error(<function>)` - Sets up a function that handles unhandled errors that happen specifically inside `this` test. This overrides a handler set up by `Unit.error`. Currently, this does  *not* catch undhandled errors thrown by child-tests.

UnitTest
----------

`test.results()` - access the test results. Should only be accessed after the entire test has been completed (an asynchronous error will be thrown if more test results happen after the test results have been accessed).

* returns a TestGroup (see **Result Types**)

`test.events(<handlers>)` - sets up handlers that are called as test results come through. Test results are buffered, so event handlers will always get 100% of the test results, even tho it is called after the unit tests have started. `<handlers>` is an object of handler `Function`s with the following properties - note that the parameter name of the handler indicates an **Event Object** type below:
* `group(<groupStartEvent>)` - called when a new test group is started.
* `assert(<assertEvent>` - called when an assert (`ok` method) happens.
* `count(<countEvent>)` - called when a `count` happens.
* `exception(<exceptionEvent>)` - called when an exception happens inside a test group.
* `log(<logEvent>)` - called when a `log` happens.
* `end(<endEvent>)` - called either when the `done` method is called, or when the tests time out.
* `groupEnd(<groupEvent>)` - called when a test group is done (all expected assertions have happened and all its subtests are complete or the whole test has timed out)
* `before(<groupEvent>)` - called when a `before` handler is started
* `after(<groupEvent>)` - called when a `before` handler is started
* `beforeEnd(<groupEvent>)` - called when a `before` handler is finished
* `afterEnd(<groupEvent>)` - called when a `before` handler is finished

### Event Objects ###

#### groupStartEvent

```javascript
{  id: _,                // a unique id for the test group
   parent: _,            // the id of the parent group (undefined if it is the top-level test group)
   name: _,              // the name of the test
   time: _              // a Unix Timestamp of when the test group started.
}
```

#### groupEvent

```javascript
{  id: _,                // the id of the test group
   time: _               // a Unix Timestamp of when the test group event happened.
}
```

#### assertEvent ####
```javascript
{  parent: _,        // the id of the group this assert is part of
   success: _,       // true or false, whether the assert passed or failed
   time: _,          // a Unix Timestamp of the time when the assert happened
   sourceLines: _,   // the text of the actual line of code for the assert
   file: _,          // the filename of the file containing the test
   line: _,          // line number of the assert
   column: _,        // column number of the assert (not sure this is totally accurate)
   expected: _,      // (optional) the value expected in the assert (third parameter to `ok`)
   actual: _         // (optional) the actual value gotten (second parameter to `ok`)
}
```

#### countEvent ####
```javascript
{  parent: _,        // the id of the group this assert is part of
   success: _,       // true or false, whether the assert passed or failed
   time: _,          // a Unix Timestamp of the time when the assert happened
   sourceLines: _,   // the text of the actual line of code for the assert
   file: _,          // the filename of the file containing the test
   line: _,          // line number of the assert
   column: _,        // column number of the assert (not sure this is totally accurate)
   expected: _       // the number of asserts and tests expected
}
```

#### exceptionEvent ####
```javascript
{  parent: _,        // the id of the group this assert is part of
   time: _,          // a Unix Timestamp of the time when the assert happened
   error: _          // the thrown object
}
```

#### logEvent ####
```javascript
{  parent: _,        // the id of the group this log is part of
   time: _,          // a Unix Timestamp of the time when the log happened
   values: _         // the logged values
}
```

#### endEvent ####
```javascript
{  type: _,          // will either be "timeout" if a the test timed out, or "normal" otherwise
   time: _           // a Unix Timestamp of the time when the test ended
}
```

### Result Types ###

#### group ####
```javascript
{  id: _,                // a unique id for the test group
   type: 'group',        // indicates a test group (either a `Unit.test` call or `this.test`)
   name: _,              // the name of the test
   results: _,           // An array of test results, which can be of an `UnitTest` Result Types
   exceptions: _,        // An array of uncaught exceptions thrown in the test,
   duration: _,          // the duration of the test from its start til the last test action (assert, log, timeout, etc)
   //                       including asynchronous parts and including subtests
   timeout: _            // Set to true if the test times out. This key is only available on the top-level group object.
}
```

#### assert ####
```javascript
{  parent: _,        // the id of the group this assert is part of
   type: 'assert',   // indicates an assert (either an `ok` or `count` call)
   success: _,       // true or false, whether the assert passed or failed
   time: _,			 // a Unix Timestamp of the time when the assert happened
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
{  parent: _,        // the id of the group this log is part of
   type: 'log',      // indicates a test log - this is so you can log something in-line with the test results
   time: _,          // a Unix Timestamp of the time when the log happened
   values: _         // the logged values
}
```
Environment/Browser Support
=============

* node.js
* Browsers
 * Chrome 31
 * Firefox 26
 * IE 10

This needs more testing! Please help by testing and reporting bugs in other browsers or browser versions!

To Do
=====

* There's already a way to work around dead fibers, but still need to make a way to work around dead futures
  * put each subtest in its own timeout, and resolve a future either when the previous test completes or when it times out
    * note that this method would effectively force sequential test running - not entirely a bad thing in my opinion (since if you really wanted to squeeze out speed of your test, you can organize it within the same test)
* Get rid of `Unit.error` and make `test.error` catch unhandled exceptions from child tests (if the child tests don't have their own handler)
* allow individual tests be cherry picked (for rerunning tests or testing specific things in development)
* fix up sourceLines grabbing so that it properly grabs the source for asserts that span multiple lines
  * maybe also so it strips off the "this.ok()" part of the line

How to Contribute!
============

###Anything helps

* Creating issues (aka tickets/bugs/etc). Please feel free to use issues to report bugs, request features, and discuss changes.
* Updating the documentation: ie this readme file. Be bold! Help create amazing documentation!
* Submitting pull requests.

###How to submit pull requests

1. Please create an issue and get my input before spending too much time creating a feature. Work with me to ensure your feature or addition is optimal and fits with the purpose of the project.
2. Fork the repository
3. clone your forked repo onto your machine and run `npm install` at its root
4. If you're gonna work on multiple separate things, its best to create a separate branch for each of them
5. edit!
6. If it's a code change, please add to the unit tests (at test/testDeadunitCore.js) to verify that your change
7. When you're done, run the unit tests and ensure they all pass
  * Make sure you run `node build.js` to build the browser packages (browserPackage/deadunitCore.browser.gen.umd.js and test/deadunitTests.browser.umd.js) before running the browser tests
  * For a full test, also run testServer.js and access the browser tests by going to http://localhost:8000/
8. Commit and push your changes
9. Submit a pull request: https://help.github.com/articles/creating-a-pull-request

Changelog
========

* 4.0.1 - Added getting source lines for tests in-browser
* 4.0.0 - removing syncDuration and totalSyncDuration, and making duration the total time it took for a test to complete its expected asserts
* 3.0.3 - fixing issue where the first timeout to expire would time the test out rather than the last timeout to expire
* 3.0.2 - get rid of late events warning in deadunit-core (thats a job for deadunit proper)
* 3.0.1 - moving build-modules (which uses browserify) to be a devDependency
* 3.0.0
 * making top-level test run asynchronously to make some things work better with node fibers
 * since this means you basically always have to wait for the 'end' event before getting results, it may break old tests (fixable with minor tweaking), so upping major versions
* 2.0.9
 * fixing silent-failure issue when the test times out before it completes synchronously
* 2.0.7
 * Increasing stackinfo version to get minor chrome stacktrace info improvements
* 2.0.6
 * Fixing bug when a test event handler is called inside a test event handler. So meta.
* 2.0.5
 * Making logs come out in real-time instead of waiting for the scheduler (using setTimeout).
* 2.0.2
 * Firefox and IE support!
* 2.0.1
 * Browser support! Supports chrome only at this point.
* 2.0.0 - *Breaking Change*
 * tests use `this.count` to determine when tests are done
 * added an event driven api for maximal flexibility.
 * tests can time out, added timeout control
 * count is no longer an assertEvent, but a countEvent
 * sourceLines is now a string rather than an array
* 1.1.3 - Fixed a bug with times when fibers die mid-test
* 1.1.2 - Changed `log` interface to be able to pass in multiple values
* 1.1.1 - enabled tests to still get all executed test results even if a [fiber](https://github.com/laverdet/node-fibers) dies midway through a test group
* 1.1.0
  * changed count to count asserts and subtests in the current test, and ignore asserts in subtests
  * changed duration keys in order to make more sense and add asynchronous duration

License
=======
Released under the MIT license: http://opensource.org/licenses/MIT
