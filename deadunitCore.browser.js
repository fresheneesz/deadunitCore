"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var deadunitCore = require("./deadunitCore")
var Future = require('async-future')
var stackinfo = require('stackinfo')

module.exports = deadunitCore({
    initialize: function() {},

    initializeMainTest: function(testState) {
        //testState.active = true // make sure

        testState.oldOnerror = window.onerror
        testState.newOnerror = window.onerror = function(errorMessage, filename, line, column) {
            //if(testState.active)
                testState.unhandledErrorHandler("Uncaught error in "+filename+" line "+line+"/"+column+": "+errorMessage)
            if(testState.oldOnerror) testState.oldOnerror.apply(this, arguments)
        }
    },
    mainTestDone: function(testState) {
        //testState.active = false // make sure the test-specific onerror code is no longer run
        /*if(testState.newOnerror === window.onerror) {
            window.onerror = testState.oldOnerror // otherwise something else has overwritten onerror, so don't mess with it
        }*/
    },
    runTestGroup: function(deadunitState, tester, runTest, handleError, handleUnhandledError) {
        runTest()
    },
    getScriptSource: function(path) {
        return undefined //load(path)
    },

    defaultUnhandledErrorHandler: function(e) {
        //if(e !== undefined)
            setTimeout(function() {
                if(e.stack)
                    console.log(e.stack)
                else
                    console.log(e)
            },0)
    },
    defaultTestErrorHandler: function(tester) {
        return function(e) {
            tester.manager.emit('exception', {
                parent: tester.mainSubTest.id,
                time: (new Date()).getTime(),
                error: e
            })
        }
    },

    getLineInfo: function(stackIncrease) {
        return stackinfo()[3+stackIncrease]
    }
})


function load(url) {
    var result = new Future
    var httpReq

    var versions = ["MSXML2.XmlHttp.5.0",
                    "MSXML2.XmlHttp.4.0",
                    "MSXML2.XmlHttp.3.0",
                    "MSXML2.XmlHttp.2.0",
                    "Microsoft.XmlHttp"];

    if(window.XMLHttpRequest) {
        //    For Mozilla, Safari (non IE browsers)
        httpReq = new XMLHttpRequest();
    } else if( window.ActiveXObject ) {
        //    For IE browsers
        for(var i = 0, n=versions.length; i < n; i++ ) {
            try {
                httpReq = new ActiveXObject(versions[i]);
            } catch(e) {   }
        }
    }

    if (!httpReq) {
        throw new Error('Cannot create an XMLHTTP instance')
    }

    httpReq.onreadystatechange = function() {
        if( httpReq.readyState === 4 ) {
            if( httpReq.status === 200 ) {
                result.return(httpReq.responseText)
            } else {
                throw new Error('Error in request')
            }
        }
    };

    httpReq.open('GET', url);
    httpReq.send();

    return result
}