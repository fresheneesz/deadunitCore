module.exports = function returnResults(unitTestObject, printLateEvents) {

    var results;
    var groups = {}
    var groupMetadata = {}

    var primaryGroup;
    var ended = false

    var warningWritten = false
    function warnAboutLateEvents() {
        if(!warningWritten) {
            unitTestObject.mainTester.mainTester.mainTestState.unhandledErrorHandler(
                'Test results were accessed before asynchronous parts of tests were fully complete'
                +" If you have tests with asynchronous parts, make sure to use `this.count` to declare how many assertions you're waiting for."
            )
            warningWritten = true
        }
    }

    function writeLateEvent(ended, eventToPrint) {
        if(ended && printLateEvents) {
            warnAboutLateEvents()
            unitTestObject.mainTester.mainTester.mainTestState.unhandledErrorHandler(eventToPrint)
        }
    }

    unitTestObject.events({
        group: function(e) {
            var g = {
               parent: e.parent,
               id: e.id,              // a unique id for the test group
               type: 'group',         // indicates a test group (either a `Unit.test` call or `this.test`)
               name: e.name,          // the name of the test
               results: [],           // An array of test results, which can be of an `UnitTest` Result Types
               exceptions: [],        // An array of uncaught exceptions thrown in the test,
               time: e.time,
               duration: 0            // the duration of the test from its start til the last test action (assert, log, etc)
               //                       including asynchronous parts and including subtests
               //syncDuration: _,      // the synchronous duration of the test (not including any asynchronous parts)
               //totalSyncDuration: _  // syncDuration plus the before and after (if applicable)
            }

            if(primaryGroup === undefined) primaryGroup = g

            groups[e.id] = g
            groupMetadata[e.id] = {}
            if(e.parent === undefined) {
                results = g
            } else {
                groups[e.parent].results.push(g)
            }
        },
        assert: function(e) {
            writeLateEvent(ended,JSON.stringify(e))

            e.type = 'assert'
            groups[e.parent].results.push(e)
            setGroupDuration(e.parent, e.time)
        },
        count: function(e) {
            writeLateEvent(ended,JSON.stringify(e))

            e.type = 'assert'
            setGroupDuration(e.parent, e.time)

            groupMetadata[e.parent].countInfo = e
        },
        exception: function(e) {
            writeLateEvent(ended,"At time: "+e.time+" "+(e.error.stack?e.error.stack:e.error.toString()))

            groups[e.parent].exceptions.push(e.error)
            setGroupDuration(e.parent, e.time)
        },
        log: function(e) {
            writeLateEvent(ended,JSON.stringify(e))

            e.type = 'log'
            groups[e.parent].results.push(e)
            setGroupDuration(e.parent, e.time)
        },
        before: function(e) {
            groups[e.parent].beforeStart = e.time
        },
        after: function(e) {
            groups[e.parent].afterStart = e.time
        },
        beforeEnd: function(e) {
            groups[e.parent].beforeDuration = e.time - groups[e.parent].beforeStart
        },
        afterEnd: function(e) {
            groups[e.parent].afterDuration = e.time - groups[e.parent].afterStart
        },
        groupEnd: function(e) {
            setGroupDuration(e.id, e.time)

            groups[e.id].totalSyncDuration = e.time - groups[e.id].time

            groups[e.id].syncDuration = groups[e.id].totalSyncDuration
            if(groups[e.id].beforeDuration !== undefined)
                groups[e.id].syncDuration -= groups[e.id].beforeDuration
            if(groups[e.id].afterDuration !== undefined)
                groups[e.id].syncDuration -= groups[e.id].afterDuration
        },
        end: function(e) {
            primaryGroup.timeout = e.type === 'timeout'

            // make the count assertions
            eachTest(primaryGroup, function(subtest, parenttest) {
                var countInfo = groupMetadata[subtest.id].countInfo
                if(countInfo !== undefined) {
                    var info = countInfo
                    var actualCount = 0
                    subtest.results.forEach(function(a) {
                        if(a.type === 'assert' || a.type === 'group')
                            actualCount++
                    })

                    subtest.results.push({
                        parent: subtest.id,
                        type: 'assert',
                        success: actualCount === info.expected,
                        time: info.time,
                        sourceLines: info.sourceLines,
                        file: info.file,
                        line: info.line,
                        column: info.column,
                        expected: info.expected,
                        actual: actualCount
                    })
                }
            })

            ended = true
        }
    })

    function setGroupDuration(groupid, time) {
        groups[groupid].duration = time - groups[groupid].time
        if(groups[groupid].parent) {
            setGroupDuration(groups[groupid].parent, time)
        }
    }

    return results
}


// iterates through the tests and subtests leaves first (depth first)
function eachTest(test, callback, parent) {
    test.results.forEach(function(result) {
        if(result.type === 'group') {
            eachTest(result, callback, test)
        }
    })

    callback(test, parent)
}