!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self);var n=o;n=n.deadunitCore||(n.deadunitCore={}),n=n.browser||(n.browser={}),n.gen=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var Future = _dereq_("async-future")

// returns the XHR function or equivalent for use with ajax
// memoizes the function for faster repeated use
var createXMLHTTPObject = function() {
    var versions = ["Msxml2.XMLHTTP",
                    "Msxml3.XMLHTTP",
                    "Microsoft.XMLHTTP",
                    "MSXML2.XmlHttp.6.0",
                    "MSXML2.XmlHttp.5.0",
                    "MSXML2.XmlHttp.4.0",
                    "MSXML2.XmlHttp.3.0",
                    "MSXML2.XmlHttp.2.0"
    ]

    if(XMLHttpRequest !== undefined) {  // For non-IE browsers
        createXMLHTTPObject = function() {  // Use memoization to cache the factory
            return new XMLHttpRequest()
        }
        return createXMLHTTPObject()

    } else { // IE
        for(var i=0, n=versions.length; i<n; i++) {
            try {
                var version = versions[i]
                var fn = function() {
                    return new ActiveXObject(version)
                }
                createXMLHTTPObject = fn   // Use memoization to cache the factory
                return createXMLHTTPObject()

            } catch(e) {   }
        }
    }

    throw new Error('Cant get XmlHttpRequest object')
}



var HEADER = "([^\\s]+): (.*)"

// returns the contents and headers from a given URL
exports = module.exports = function(url) {
    if(getFromCache(url))
        return getFromCache(url)

    var futureResult = new Future
    setOnCache(url, futureResult)

    var req = createXMLHTTPObject()
    req.onreadystatechange = function() {
        if( req.readyState === 4 ) {
            if( req.status === 200 ) {
                var headers = {}
                req.getAllResponseHeaders().split('\n').forEach(function(line) {
                    var match = line.match(HEADER)
                    if(match !== null) {
                        var name = match[1]
                        var value = match[2]

                        headers[name] = value
                    }
                })

                futureResult.return({text: req.responseText, headers: headers})

            } else {
                var error = new Error('Error in request: Status '+req.status)
                error.status = req.status
                futureResult.throw(error)
            }
        }
    }

    req.onerror = function(e) {
        futureResult.throw(e)
    }


    req.open('GET', url, asynchronous)
    try {
        req.send()
    } catch(e) {
        futureResult.throw(e)
    }

    return futureResult
}

var cache = {}
var getFromCache = function(url) {
    return cache[url]
}
var setOnCache = function(url, futureResponse) {
    cache[url] = futureResponse
}

var asynchronous = true
exports.setSynchronous = function(synchronous) { // this is here so I can work around this bug in chrome: https://code.google.com/p/chromium/issues/detail?id=368444
    asynchronous = !synchronous
}

exports.cacheGet = function(fn) {
    getFromCache = fn
}
exports.cacheSet = function(fn) {
    setOnCache = fn
}
},{"async-future":2}],2:[function(_dereq_,module,exports){
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var trimArgs = _dereq_("trimArguments")


module.exports = Future

Future.debug = false // switch this to true if you want ids and long stack traces

var curId = 0         // for ids\
function Future(value) {
	if(arguments.length > 0) {
		var f = new Future()
        f.return(value)
        return f
	} else {
        this.isResolved = false
        this.queue = []
        if(Future.debug) {
            curId++
            this.id = curId
        }
    }
}

// static methods

// has one parameter: either a bunch of futures, or a single array of futures
// returns a promise that resolves when one of them errors, or when all of them succeeds
Future.all = function() {
    if(arguments[0] instanceof Array) {
        var futures = arguments[0]
    } else {
        var futures = trimArgs(arguments)
    }

    var f = new Future()
    var results = []

    if(futures.length > 0) {
        var current = futures[0]
        futures.forEach(function(future, index) {
            current = current.then(function(v) {
                results[index] = v
                return futures[index+1]
            })
        })

        //if
        current.catch(function(e) {
            f.throw(e)
        })
        // else
        current.then(function() {
            f.return(results)
        })


    } else {
        f.return(results)
    }

    return f
}

// either used like futureWrap(function(){ ... })(arg1,arg2,etc) or
//  futureWrap(object, 'methodName')(arg1,arg2,etc)
Future.wrap = function() {
    // function
    if(arguments.length === 1) {
        var fn = arguments[0]
        var object = undefined


    // object, function
    } else {
        var object = arguments[0]
        var fn = object[arguments[1]]
    }

    return function() {
        var args = Array.prototype.slice.call(arguments)
        var future = new Future
        args.push(future.resolver())
        var me = this
        if(object) me = object
        fn.apply(me, args)
        return future
    }
}


// default
var unhandledErrorHandler = function(e) {
    setTimeout(function() {
        throw e
    },0)
}

// setup unhandled error handler
// unhandled errors happen when done is called, and  then an exception is thrown from the future
Future.error = function(handler) {
    unhandledErrorHandler = handler
}

// instance methods

// returns a value for the future (can only be executed once)
// if there are callbacks waiting on this value, they are run in the next tick
    // (ie they aren't run immediately, allowing the current thread of execution to complete)
Future.prototype.return = function(v) {
    resolve(this, 'return', v)
}
Future.prototype.throw = function(e) {
    resolve(this, 'error', e)
}

function setNext(that, future) {
    if(future !== undefined && !isLikeAFuture(future) )
        throw Error("Value returned from then or catch *not* a Future: "+future)

    resolve(that, 'next', future)
}

function wait(that, cb) {
    if(that.isResolved) {
        executeCallbacks(that, [cb])
    } else {
        that.queue.push(cb)
    }
}

// duck typing to determine if something is or isn't a future
function isLikeAFuture(x) {
    return x.isResolved !== undefined && x.queue !== undefined && x.then !== undefined
}

function waitOnResult(f, result, cb) {
    wait(result, function() {
        if(this.hasError) {
            f.throw(this.error)
        } else if(this.hasNext) {
            waitOnResult(f, this.next, cb)
        } else {
            try {
                setNext(f, cb(this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
}


// cb takes one parameter - the value returned
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.then = function(cb) {
    var f = new Future
    wait(this, function() {
        if(this.hasError)
            f.throw(this.error)
        else if(this.hasNext)
            waitOnResult(f, this.next, cb)
        else {
            try {
                setNext(f, cb(this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
    return f
}
// cb takes one parameter - the error caught
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.catch = function(cb) {
    var f = new Future
    wait(this, function() {
        if(this.hasError) {
            try {
                setNext(f, cb(this.error))
            } catch(e) {
                f.throw(e)
            }
        } else if(this.hasNext) {
            this.next.then(function(v) {
                f.return(v)
            }).catch(function(e) {
                setNext(f, cb(e))
            })
        } else {
            f.return(this.result)
        }
    })
    return f
}
// cb takes no parameters
// callback's return value is ignored, but thrown exceptions propogate normally
Future.prototype.finally = function(cb) {
    var f = new Future
    wait(this, function() {
        try {
            var that = this
            if(this.hasNext) {
                this.next.then(function(v) {
                    var x = cb()
                    f.return(v)
                    return x
                }).catch(function(e) {
                    var x = cb()
                    f.throw(e)
                    return x
                }).done()
            } else if(this.hasError) {
                Future(true).then(function() {
                    return cb()
                }).then(function() {
                    f.throw(that.error)
                }).catch(function(e) {
                    f.throw(e)
                }).done()

            } else  {
                Future(true).then(function() {
                    return cb()
                }).then(function() {
                    f.return(that.result)
                }).catch(function(e) {
                    f.throw(e)
                }).done()
            }
        } catch(e) {
            f.throw(e)
        }
    })
    return f
}

// all unused futures should end with this (e.g. most then-chains)
// detatches the future so any propogated exception is thrown (so the exception isn't silently lost)
Future.prototype.done = function() {
    wait(this, function() {
        if(this.hasError) {
            unhandledErrorHandler(this.error)
        } else if(this.hasNext) {
            this.next.catch(function(e) {
                unhandledErrorHandler(e)
            })
        }
    })
}



Future.prototype.resolver = function() {
    var me = this

    return function(e,v) {
        if(e) { // error argument
            me.throw(e)
        } else {
            me.return(v)
        }
    }
}

Future.prototype.resolved = function() {
    return this.isResolved
}


function resolve(that, type, value) {
    if(that.isResolved)
        throw Error("Future resolved more than once! Resolution: "+value)

    that.isResolved = true
    that.hasError = type === 'error'
    that.hasNext = type === 'next' && value !== undefined

    if(that.hasError)
        that.error = value
    else if(that.hasNext)
        that.next = value
    else
        that.result = value

    executeCallbacks(that, that.queue)
}

function executeCallbacks(that, callbacks) {
    if(callbacks.length > 0) {
        setTimeout(function() {
            callbacks.forEach(function(cb) {
                cb.apply(that)
            })
        },0)
    }
}

},{"trimArguments":28}],3:[function(_dereq_,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 1.0.1 Copyright (c) 2011-2016, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/amdefine for details
 */

/*jslint node: true */
/*global module, process */
'use strict';

/**
 * Creates a define for node.
 * @param {Object} module the "module" object that is defined by Node for the
 * current module.
 * @param {Function} [requireFn]. Node's require function for the current module.
 * It only needs to be passed in Node versions before 0.5, when module.require
 * did not exist.
 * @returns {Function} a define function that is usable for the current node
 * module.
 */
function amdefine(module, requireFn) {
    'use strict';
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        path = _dereq_('path'),
        makeRequire, stringRequire;

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i+= 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function normalize(name, baseName) {
        var baseParts;

        //Adjust any relative paths.
        if (name && name.charAt(0) === '.') {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                baseParts = baseName.split('/');
                baseParts = baseParts.slice(0, baseParts.length - 1);
                baseParts = baseParts.concat(name.split('/'));
                trimDots(baseParts);
                name = baseParts.join('/');
            }
        }

        return name;
    }

    /**
     * Create the normalize() function passed to a loader plugin's
     * normalize method.
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(id) {
        function load(value) {
            loaderCache[id] = value;
        }

        load.fromText = function (id, text) {
            //This one is difficult because the text can/probably uses
            //define, and any relative paths and requires should be relative
            //to that id was it would be found on disk. But this would require
            //bootstrapping a module/require fairly deeply from node core.
            //Not sure how best to go about that yet.
            throw new Error('amdefine does not implement load.fromText');
        };

        return load;
    }

    makeRequire = function (systemRequire, exports, module, relId) {
        function amdRequire(deps, callback) {
            if (typeof deps === 'string') {
                //Synchronous, single module require('')
                return stringRequire(systemRequire, exports, module, deps, relId);
            } else {
                //Array of dependencies with a callback.

                //Convert the dependencies to modules.
                deps = deps.map(function (depName) {
                    return stringRequire(systemRequire, exports, module, depName, relId);
                });

                //Wait for next tick to call back the require call.
                if (callback) {
                    process.nextTick(function () {
                        callback.apply(null, deps);
                    });
                }
            }
        }

        amdRequire.toUrl = function (filePath) {
            if (filePath.indexOf('.') === 0) {
                return normalize(filePath, path.dirname(module.filename));
            } else {
                return filePath;
            }
        };

        return amdRequire;
    };

    //Favor explicit value, passed in if the module wants to support Node 0.4.
    requireFn = requireFn || function req() {
        return module.require.apply(module, arguments);
    };

    function runFactory(id, deps, factory) {
        var r, e, m, result;

        if (id) {
            e = loaderCache[id] = {};
            m = {
                id: id,
                uri: __filename,
                exports: e
            };
            r = makeRequire(requireFn, e, m, id);
        } else {
            //Only support one define call per file
            if (alreadyCalled) {
                throw new Error('amdefine with no module ID cannot be called more than once per file.');
            }
            alreadyCalled = true;

            //Use the real variables from node
            //Use module.exports for exports, since
            //the exports in here is amdefine exports.
            e = module.exports;
            m = module;
            r = makeRequire(requireFn, e, m, module.id);
        }

        //If there are dependencies, they are strings, so need
        //to convert them to dependency values.
        if (deps) {
            deps = deps.map(function (depName) {
                return r(depName);
            });
        }

        //Call the factory with the right dependencies.
        if (typeof factory === 'function') {
            result = factory.apply(m.exports, deps);
        } else {
            result = factory;
        }

        if (result !== undefined) {
            m.exports = result;
            if (id) {
                loaderCache[id] = m.exports;
            }
        }
    }

    stringRequire = function (systemRequire, exports, module, id, relId) {
        //Split the ID by a ! so that
        var index = id.indexOf('!'),
            originalId = id,
            prefix, plugin;

        if (index === -1) {
            id = normalize(id, relId);

            //Straight module lookup. If it is one of the special dependencies,
            //deal with it, otherwise, delegate to node.
            if (id === 'require') {
                return makeRequire(systemRequire, exports, module, relId);
            } else if (id === 'exports') {
                return exports;
            } else if (id === 'module') {
                return module;
            } else if (loaderCache.hasOwnProperty(id)) {
                return loaderCache[id];
            } else if (defineCache[id]) {
                runFactory.apply(null, defineCache[id]);
                return loaderCache[id];
            } else {
                if(systemRequire) {
                    return systemRequire(originalId);
                } else {
                    throw new Error('No module with ID: ' + id);
                }
            }
        } else {
            //There is a plugin in play.
            prefix = id.substring(0, index);
            id = id.substring(index + 1, id.length);

            plugin = stringRequire(systemRequire, exports, module, prefix, relId);

            if (plugin.normalize) {
                id = plugin.normalize(id, makeNormalize(relId));
            } else {
                //Normalize the ID normally.
                id = normalize(id, relId);
            }

            if (loaderCache[id]) {
                return loaderCache[id];
            } else {
                plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});

                return loaderCache[id];
            }
        }
    };

    //Create a define function specific to the module asking for amdefine.
    function define(id, deps, factory) {
        if (Array.isArray(id)) {
            factory = deps;
            deps = id;
            id = undefined;
        } else if (typeof id !== 'string') {
            factory = id;
            id = deps = undefined;
        }

        if (deps && !Array.isArray(deps)) {
            factory = deps;
            deps = undefined;
        }

        if (!deps) {
            deps = ['require', 'exports', 'module'];
        }

        //Set up properties for this module. If an ID, then use
        //internal cache. If no ID, then use the external variables
        //for this node module.
        if (id) {
            //Put the module in deep freeze until there is a
            //require call for it.
            defineCache[id] = [id, deps, factory];
        } else {
            runFactory(id, deps, factory);
        }
    }

    //define.require, which has access to all the values in the
    //cache. Useful for AMD modules that all have IDs in the file,
    //but need to finally export a value to node based on one of those
    //IDs.
    define.require = function (id) {
        if (loaderCache[id]) {
            return loaderCache[id];
        }

        if (defineCache[id]) {
            runFactory.apply(null, defineCache[id]);
            return loaderCache[id];
        }
    };

    define.amd = {};

    return define;
}

module.exports = amdefine;

}).call(this,_dereq_("D:\\billysFile\\code\\modules\\deadunitCore\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"),"/..\\node_modules\\amdefine\\amdefine.js")
},{"D:\\billysFile\\code\\modules\\deadunitCore\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":6,"path":7}],4:[function(_dereq_,module,exports){
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var trimArgs = _dereq_("trimArguments")


module.exports = Future

Future.debug = false // switch this to true if you want ids and long stack traces

var curId = 0         // for ids\
function Future(value) {
	if(arguments.length > 0) {
		var f = new Future()
        f.return(value)
        return f
	} else {
        this.isResolved = false
        this.queue = []
        this.n = 1 // future depth (for preventing "too much recursion" RangeErrors)
        if(Future.debug) {
            curId++
            this.id = curId
        }
    }
}

// static methods

// has one parameter: either a bunch of futures, or a single array of futures
// returns a promise that resolves when one of them errors, or when all of them succeeds
Future.all = function() {
    if(arguments[0] instanceof Array) {
        var futures = arguments[0]
    } else {
        var futures = trimArgs(arguments)
    }

    var f = new Future()
    var results = []

    if(futures.length > 0) {
        var current = futures[0]
        futures.forEach(function(future, index) {
            current = current.then(function(v) {
                results[index] = v
                return futures[index+1]
            })
        })

        //if
        current.catch(function(e) {
            f.throw(e)
        })
        // else
        current.then(function() {
            f.return(results)
        })


    } else {
        f.return(results)
    }

    return f
}

// either used like futureWrap(function(){ ... })(arg1,arg2,etc) or
//  futureWrap(object, 'methodName')(arg1,arg2,etc)
Future.wrap = function() {
    // function
    if(arguments.length === 1) {
        var fn = arguments[0]
        var object = undefined


    // object, function
    } else {
        var object = arguments[0]
        var fn = object[arguments[1]]
    }

    return function() {
        var args = Array.prototype.slice.call(arguments)
        var future = new Future
        args.push(future.resolver())
        var me = this
        if(object) me = object
        fn.apply(me, args)
        return future
    }
}

// future wraps a function who's callback only takes one parameter - the return value (no error is available)
// eg: function(result) {}
Future.wrapSingleParameter = function() {
    if(arguments.length === 1) {
        var fn = arguments[0]
    } else {
        var object = arguments[0]
        var method = arguments[1]
        var fn = object[method]
    }

    return function() {
        var args = Array.prototype.slice.call(arguments)
		var future = new Future
		args.push(function(result) {
		    future.return(result)
		})
		var me = this
        if(object) me = object
        fn.apply(me, args)
		return future
    }
}


// default
var unhandledErrorHandler = function(e) {
    setTimeout(function() {
        throw e
    },0)
}

// setup unhandled error handler
// unhandled errors happen when done is called, and  then an exception is thrown from the future
Future.error = function(handler) {
    unhandledErrorHandler = handler
}

// instance methods

// returns a value for the future (can only be executed once)
// if there are callbacks waiting on this value, they are run in the next tick
    // (ie they aren't run immediately, allowing the current thread of execution to complete)
Future.prototype.return = function(v) {
    resolve(this, 'return', v)
}
Future.prototype.throw = function(e) {
    if(this.location !== undefined) {
        e.stack += '\n    ---------------------------\n'+this.location.stack.split('\n').slice(4).join('\n')
    }
    resolve(this, 'error', e)
    return this
}

function setNext(that, future) {
    resolve(that, 'next', future)
}

function wait(that, cb) {
    if(that.isResolved) {
        executeCallbacks(that, [cb])
    } else {
        that.queue.push(cb)
    }
}

// duck typing to determine if something is or isn't a future
var isLikeAFuture = Future.isLikeAFuture = function(x) {
    return x.isResolved !== undefined && x.queue !== undefined && x.then !== undefined
}

function waitOnResult(f, result, cb) {
    wait(result, function() {
        if(this.hasError) {
            f.throw(this.error)
        } else if(this.hasNext) {
            waitOnResult(f, this.next, cb)
        } else {
            try {
                setNext(f, executeCallback(cb,this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
}


// cb takes one parameter - the value returned
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.then = function(cb) {
    var f = createChainFuture(this)
    wait(this, function() {
        if(this.hasError)
            f.throw(this.error)
        else if(this.hasNext)
            waitOnResult(f, this.next, cb)
        else {
            try {
                setNext(f, executeCallback(cb,this.result))
            } catch(e) {
                f.throw(e)
            }
        }
    })
    return f
}
// cb takes one parameter - the error caught
// cb can return a Future, in which case the result of that Future is passed to next-in-chain
Future.prototype.catch = function(cb) {
    var f = createChainFuture(this)
    wait(this, function() {
        if(this.hasError) {
            try {
                setNext(f, executeCallback(cb,this.error))
            } catch(e) {
                f.throw(e)
            }
        } else if(this.hasNext) {
            this.next.then(function(v) {
                f.return(v)
            }).catch(function(e) {
                try {
                    setNext(f, executeCallback(cb,e))
                } catch(e) {
                    f.throw(e)
                }
            })
        } else {
            f.return(this.result)
        }
    })
    return f
}
// cb takes no parameters
// callback's return value is ignored, but thrown exceptions propogate normally
Future.prototype.finally = function(cb) {
    var f = createChainFuture(this)
    wait(this, function() {
        try {
            var that = this
            if(this.hasNext) {
                this.next.then(function(v) {
                    var x = executeCallback(cb)
                    f.return(v)
                    return x
                }).catch(function(e) {
                    var x = executeCallback(cb)
                    f.throw(e)
                    return x
                }).done()
            } else if(this.hasError) {
                Future(true).then(function() {
                    return executeCallback(cb)
                }).then(function() {
                    f.throw(that.error)
                }).catch(function(e) {
                    f.throw(e)
                }).done()

            } else  {
                Future(true).then(function() {
                    return executeCallback(cb)
                }).then(function() {
                    f.return(that.result)
                }).catch(function(e) {
                    f.throw(e)
                }).done()
            }
        } catch(e) {
            f.throw(e)
        }
    })
    return f
}

// a future created for the chain functions (then, catch, and finally)
function createChainFuture(that) {
    var f = new Future
    f.n = that.n + 1
    if(Future.debug) {
        f.location = createException()  // used for long traces
    }
    return f
}

// all unused futures should end with this (e.g. most then-chains)
// detatches the future so any propogated exception is thrown (so the exception isn't silently lost)
Future.prototype.done = function() {
    wait(this, function() {
        if(this.hasError) {
            unhandledErrorHandler(this.error)
        } else if(this.hasNext) {
            this.next.catch(function(e) {
                unhandledErrorHandler(e)
            })
        }
    })
}



Future.prototype.resolver = function() {
    var me = this

    return function(e,v) {
        if(e) { // error argument
            me.throw(e)
        } else {
            me.return(v)
        }
    }
}

Future.prototype.resolved = function() {
    return this.isResolved
}


function resolve(that, type, value) {
    if(that.isResolved)
        throw Error("Future resolved more than once! Resolution: "+value)

    that.isResolved = true
    that.hasError = type === 'error'
    that.hasNext = type === 'next' && value !== undefined

    if(that.hasError)
        that.error = value
    else if(that.hasNext)
        that.next = value
    else
        that.result = value

    // 100 is a pretty arbitrary number - it should be set significantly lower than common maximum stack depths, and high enough to make sure performance isn't significantly affected
    // in using this for deadunit, firefox was getting a recursion error at 150, but not at 100. This doesn't mean that it can't happen at 100 too, but it'll certainly make it less likely
    // if you're getting recursion errors even with this mechanism, you probably need to figure that out in your own code
    if(that.n % 100 !== 0) {
        executeCallbacks(that, that.queue)
    } else {
        setTimeout(function() { // this prevents too much recursion errors
            executeCallbacks(that, that.queue)
        }, 0)
    }
}

function executeCallbacks(that, callbacks) {
    if(callbacks.length > 0) {
        try {
            callbacks.forEach(function(cb) {
                cb.apply(that)
            })
        } catch(e) {
            unhandledErrorHandler(e)
        }
    }
}

// executes a callback and ensures that it returns a future
function executeCallback(cb, arg) {
    var r = cb(arg)
    if(r !== undefined && !isLikeAFuture(r) )
        throw Error("Value returned from then or catch ("+r+") is *not* a Future. Callback: "+cb.toString())

    return r
}

function createException() {
    try {
        throw new Error()
    } catch(e) {
        return e
    }
}
},{"trimArguments":28}],5:[function(_dereq_,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],6:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],7:[function(_dereq_,module,exports){
(function (process){
// .dirname, .basename, and .extname methods are extracted from Node.js v8.11.1,
// backported and transplited with Babel, with backwards-compat fixes

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function (path) {
  if (typeof path !== 'string') path = path + '';
  if (path.length === 0) return '.';
  var code = path.charCodeAt(0);
  var hasRoot = code === 47 /*/*/;
  var end = -1;
  var matchedSlash = true;
  for (var i = path.length - 1; i >= 1; --i) {
    code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
      // We saw the first non-path separator
      matchedSlash = false;
    }
  }

  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) {
    // return '//';
    // Backwards-compat fix:
    return '/';
  }
  return path.slice(0, end);
};

function basename(path) {
  if (typeof path !== 'string') path = path + '';

  var start = 0;
  var end = -1;
  var matchedSlash = true;
  var i;

  for (i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // path component
      matchedSlash = false;
      end = i + 1;
    }
  }

  if (end === -1) return '';
  return path.slice(start, end);
}

// Uses a mixed approach for backwards-compatibility, as ext behavior changed
// in new Node.js versions, so only basename() above is backported here
exports.basename = function (path, ext) {
  var f = basename(path);
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};

exports.extname = function (path) {
  if (typeof path !== 'string') path = path + '';
  var startDot = -1;
  var startPart = 0;
  var end = -1;
  var matchedSlash = true;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  var preDotState = 0;
  for (var i = path.length - 1; i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46 /*.*/) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1)
          startDot = i;
        else if (preDotState !== 1)
          preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }

  if (startDot === -1 || end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    return '';
  }
  return path.slice(startDot, end);
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,_dereq_("D:\\billysFile\\code\\modules\\deadunitCore\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"))
},{"D:\\billysFile\\code\\modules\\deadunitCore\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":6}],8:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var noop = function() {}

var prototypeName='prototype', undefined, protoUndefined='undefined', init='init', ownProperty=({}).hasOwnProperty; // minifiable variables
function proto() {
    var args = arguments // minifiable variables

    if(args.length == 1) {
        var parent = {init: noop}
        var prototypeBuilder = args[0]

    } else { // length == 2
        var parent = args[0]
        var prototypeBuilder = args[1]
    }

    // special handling for Error objects
    var namePointer = {}    // name used only for Error Objects
    if([Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError].indexOf(parent) !== -1) {
        parent = normalizeErrorObject(parent, namePointer)
    }

    // set up the parent into the prototype chain if a parent is passed
    var parentIsFunction = typeof(parent) === "function"
    if(parentIsFunction) {
        prototypeBuilder[prototypeName] = parent[prototypeName]
    } else {
        prototypeBuilder[prototypeName] = parent
    }

    // the prototype that will be used to make instances
    var prototype = new prototypeBuilder(parent)
    namePointer.name = prototype.name

    // if there's no init, assume its inheriting a non-proto class, so default to applying the superclass's constructor.
    if(!prototype[init] && parentIsFunction) {
        prototype[init] = function() {
            parent.apply(this, arguments)
        }
    }

    // constructor for empty object which will be populated via the constructor
    var F = function() {}
        F[prototypeName] = prototype    // set the prototype for created instances

    var constructorName = prototype.name?prototype.name:''
    if(prototype[init] === undefined || prototype[init] === noop) {
        var ProtoObjectFactory = new Function('F',
            "return function " + constructorName + "(){" +
                "return new F()" +
            "}"
        )(F)
    } else {
        // dynamically creating this function cause there's no other way to dynamically name a function
        var ProtoObjectFactory = new Function('F','i','u','n', // shitty variables cause minifiers aren't gonna minify my function string here
            "return function " + constructorName + "(){ " +
                "var x=new F(),r=i.apply(x,arguments)\n" +    // populate object via the constructor
                "if(r===n)\n" +
                    "return x\n" +
                "else if(r===u)\n" +
                    "return n\n" +
                "else\n" +
                    "return r\n" +
            "}"
        )(F, prototype[init], proto[protoUndefined]) // note that n is undefined
    }

    prototype.constructor = ProtoObjectFactory;    // set the constructor property on the prototype

    // add all the prototype properties onto the static class as well (so you can access that class when you want to reference superclass properties)
    for(var n in prototype) {
        addProperty(ProtoObjectFactory, prototype, n)
    }

    // add properties from parent that don't exist in the static class object yet
    for(var n in parent) {
        if(ownProperty.call(parent, n) && ProtoObjectFactory[n] === undefined) {
            addProperty(ProtoObjectFactory, parent, n)
        }
    }

    ProtoObjectFactory.parent = parent;            // special parent property only available on the returned proto class
    ProtoObjectFactory[prototypeName] = prototype  // set the prototype on the object factory

    return ProtoObjectFactory;
}

proto[protoUndefined] = {} // a special marker for when you want to return undefined from a constructor

module.exports = proto

function normalizeErrorObject(ErrorObject, namePointer) {
    function NormalizedError() {
        var tmp = new ErrorObject(arguments[0])
        tmp.name = namePointer.name

        this.message = tmp.message
        if(Object.defineProperty) {
            /*this.stack = */Object.defineProperty(this, 'stack', { // getter for more optimizy goodness
                get: function() {
                    return tmp.stack
                },
                configurable: true // so you can change it if you want
            })
        } else {
            this.stack = tmp.stack
        }

        return this
    }

    var IntermediateInheritor = function() {}
        IntermediateInheritor.prototype = ErrorObject.prototype
    NormalizedError.prototype = new IntermediateInheritor()

    return NormalizedError
}

function addProperty(factoryObject, prototype, property) {
    try {
        var info = Object.getOwnPropertyDescriptor(prototype, property)
        if(info.get !== undefined || info.get !== undefined && Object.defineProperty !== undefined) {
            Object.defineProperty(factoryObject, property, info)
        } else {
            factoryObject[property] = prototype[property]
        }
    } catch(e) {
        // do nothing, if a property (like `name`) can't be set, just ignore it
    }
}
},{}],9:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],10:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],11:[function(_dereq_,module,exports){
'use strict';

exports.decode = exports.parse = _dereq_('./decode');
exports.encode = exports.stringify = _dereq_('./encode');

},{"./decode":9,"./encode":10}],12:[function(_dereq_,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.resolveUrl = factory()
  }
}(this, function() {

  function resolveUrl(/* ...urls */) {
    var numUrls = arguments.length

    if (numUrls === 0) {
      throw new Error("resolveUrl requires at least one argument; got none.")
    }

    var base = document.createElement("base")
    base.href = arguments[0]

    if (numUrls === 1) {
      return base.href
    }

    var head = document.getElementsByTagName("head")[0]
    head.insertBefore(base, head.firstChild)

    var a = document.createElement("a")
    var resolved

    for (var index = 1; index < numUrls; index++) {
      a.href = arguments[index]
      resolved = a.href
      base.href = resolved
    }

    head.removeChild(base)

    return resolved
  }

  return resolveUrl

}));

},{}],13:[function(_dereq_,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

// Note: source-map-resolve.js is generated from source-map-resolve-node.js and
// source-map-resolve-template.js. Only edit the two latter files, _not_
// source-map-resolve.js!

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(["source-map-url", "resolve-url"], factory)
  } else if (typeof exports === "object") {
    var sourceMappingURL = _dereq_("source-map-url")
    var resolveUrl = _dereq_("resolve-url")
    module.exports = factory(sourceMappingURL, resolveUrl)
  } else {
    root.sourceMapResolve = factory(root.sourceMappingURL, root.resolveUrl)
  }
}(this, function(sourceMappingURL, resolveUrl) {

  function callbackAsync(callback, error, result) {
    setImmediate(function() { callback(error, result) })
  }

  function sig(name, codeOrMap, url, read, callback) {
    var type = (name.indexOf("Sources") >= 0 ? "map" : "code")

    var throwError = function(num, what, got) {
      throw new Error(
        name + " requires argument " + num + " to be " + what + ". Got:\n" + got
      )
    }

    if (type === "map") {
      if (typeof codeOrMap !== "object" || codeOrMap === null) {
        throwError(1, "a source map", codeOrMap)
      }
    } else {
      if (typeof codeOrMap !== "string") {
        throwError(1, "some code", codeOrMap)
      }
    }
    if (typeof url !== "string") {
      throwError(2, "the " + type + " url", url)
    }
    if (typeof read !== "function") {
      throwError(3, "a reading function", read)
    }
    if (arguments.length === 1 + 4 && typeof callback !== "function") {
      throwError(4, "a callback function", callback)
    }
  }

  function parseMapToJSON(string) {
    return JSON.parse(string.replace(/^\)\]\}'/, ""))
  }



  function resolveSourceMap(code, codeUrl, read, callback) {
    sig("resolveSourceMap", code, codeUrl, read, callback)
    var mapData
    try {
      mapData = resolveSourceMapHelper(code, codeUrl)
    } catch (error) {
      return callbackAsync(callback, error)
    }
    if (!mapData || mapData.map) {
      return callbackAsync(callback, null, mapData)
    }
    read(mapData.url, function(error, result) {
      if (error) {
        return callback(error)
      }
      try {
        mapData.map = parseMapToJSON(String(result))
      } catch (error) {
        return callback(error)
      }
      callback(null, mapData)
    })
  }

  function resolveSourceMapSync(code, codeUrl, read) {
    sig("resolveSourceMapSync", code, codeUrl, read)
    var mapData = resolveSourceMapHelper(code, codeUrl)
    if (!mapData || mapData.map) {
      return mapData
    }
    mapData.map = parseMapToJSON(String(read(mapData.url)))
    return mapData
  }

  var dataUriRegex = /^data:([^,;]*)(;[^,;]*)*(?:,(.*))?$/
  var jsonMimeTypeRegex = /^(?:application|text)\/json$/

  function resolveSourceMapHelper(code, codeUrl) {
    var url = sourceMappingURL.get(code)
    if (!url) {
      return null
    }

    var dataUri = url.match(dataUriRegex)
    if (dataUri) {
      var mimeType = dataUri[1]
      var lastParameter = dataUri[2]
      var encoded = dataUri[3]
      if (!jsonMimeTypeRegex.test(mimeType)) {
        throw new Error("Unuseful data uri mime type: " + (mimeType || "text/plain"))
      }
      return {
        sourceMappingURL: url,
        url: null,
        sourcesRelativeTo: codeUrl,
        map: parseMapToJSON(lastParameter === ";base64" ? atob(encoded) : decodeURIComponent(encoded))
      }
    }

    var mapUrl = resolveUrl(codeUrl, url)
    return {
      sourceMappingURL: url,
      url: mapUrl,
      sourcesRelativeTo: mapUrl,
      map: null
    }
  }



  function resolveSources(map, mapUrl, read, callback) {
    sig("resolveSources", map, mapUrl, read, callback)
    var pending = map.sources.length
    var errored = false
    var sources = []

    var done = function(error) {
      if (errored) {
        return
      }
      if (error) {
        errored = true
        return callback(error)
      }
      pending--
      if (pending === 0) {
        callback(null, sources)
      }
    }

    resolveSourcesHelper(map, mapUrl, function(fullUrl, sourceContent, index) {
      if (typeof sourceContent === "string") {
        sources[index] = sourceContent
        callbackAsync(done, null)
      } else {
        read(fullUrl, function(error, result) {
          sources[index] = String(result)
          done(error)
        })
      }
    })
  }

  function resolveSourcesSync(map, mapUrl, read) {
    sig("resolveSourcesSync", map, mapUrl, read)
    var sources = []
    resolveSourcesHelper(map, mapUrl, function(fullUrl, sourceContent, index) {
      if (typeof sourceContent === "string") {
        sources[index] = sourceContent
      } else {
        sources[index] = String(read(fullUrl))
      }
    })
    return sources
  }

  var endingSlash = /\/?$/

  function resolveSourcesHelper(map, mapUrl, fn) {
    var fullUrl
    var sourceContent
    for (var index = 0, len = map.sources.length; index < len; index++) {
      if (map.sourceRoot) {
        // Make sure that the sourceRoot ends with a slash, so that `/scripts/subdir` becomes
        // `/scripts/subdir/<source>`, not `/scripts/<source>`. Pointing to a file as source root
        // does not make sense.
        fullUrl = resolveUrl(mapUrl, map.sourceRoot.replace(endingSlash, "/"), map.sources[index])
      } else {
        fullUrl = resolveUrl(mapUrl, map.sources[index])
      }
      sourceContent = (map.sourceContents || [])[index]
      fn(fullUrl, sourceContent, index)
    }
  }



  function resolve(code, codeUrl, read, callback) {
    sig("resolve", code, codeUrl, read, callback)
    resolveSourceMap(code, codeUrl, read, function(error, mapData) {
      if (error) {
        return callback(error)
      }
      if (!mapData) {
        return callback(null, null)
      }
      resolveSources(mapData.map, mapData.sourcesRelativeTo, read, function(error, sources) {
        if (error) {
          return callback(error)
        }
        mapData.sources = sources
        callback(null, mapData)
      })
    })
  }

  function resolveSync(code, codeUrl, read) {
    sig("resolveSync", code, codeUrl, read)
    var mapData = resolveSourceMapSync(code, codeUrl, read)
    if (!mapData) {
      return null
    }
    mapData.sources = resolveSourcesSync(mapData.map, mapData.sourcesRelativeTo, read)
    return mapData
  }



  return {
    resolveSourceMap:     resolveSourceMap,
    resolveSourceMapSync: resolveSourceMapSync,
    resolveSources:       resolveSources,
    resolveSourcesSync:   resolveSourcesSync,
    resolve:              resolve,
    resolveSync:          resolveSync
  }

}));

},{"resolve-url":12,"source-map-url":14}],14:[function(_dereq_,module,exports){
// Copyright 2014 Simon Lydell

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.sourceMappingURL = factory()
  }
}(this, function(undefined) {

  var innerRegex = /[#@] sourceMappingURL=([^\s'"]*)/
  var newlineRegex = /\r\n?|\n/

  var regex = RegExp(
    "(^|(?:" + newlineRegex.source + "))" +
    "(?:" +
      "/\\*" +
      "(?:\\s*(?:" + newlineRegex.source + ")(?://)?)?" +
      "(?:" + innerRegex.source + ")" +
      "\\s*" +
      "\\*/" +
      "|" +
      "//(?:" + innerRegex.source + ")" +
    ")" +
    "\\s*$"
  )

  function SourceMappingURL(commentSyntax) {
    this._commentSyntax = commentSyntax
  }

  SourceMappingURL.prototype.regex = regex
  SourceMappingURL.prototype._innerRegex = innerRegex
  SourceMappingURL.prototype._newlineRegex = newlineRegex

  SourceMappingURL.prototype.get = function(code) {
    var match = code.match(this.regex)
    if (!match) {
      return null
    }
    return match[2] || match[3] || ""
  }

  SourceMappingURL.prototype.set = function(code, url, commentSyntax) {
    if (!commentSyntax) {
      commentSyntax = this._commentSyntax
    }
    // Use a newline present in the code, or fall back to '\n'.
    var newline = String(code.match(this._newlineRegex) || "\n")
    var open = commentSyntax[0], close = commentSyntax[1] || ""
    code = this.remove(code)
    return code + newline + open + "# sourceMappingURL=" + url + close
  }

  SourceMappingURL.prototype.remove = function(code) {
    return code.replace(this.regex, "")
  }

  SourceMappingURL.prototype.insertBefore = function(code, string) {
    var match = code.match(this.regex)
    if (match) {
      var hasNewline = Boolean(match[1])
      return code.slice(0, match.index) +
        string +
        (hasNewline ? "" : "\n") +
        code.slice(match.index)
    } else {
      return code + string
    }
  }

  SourceMappingURL.prototype.SourceMappingURL = SourceMappingURL

  return new SourceMappingURL(["/*", " */"])

}));

},{}],15:[function(_dereq_,module,exports){
/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = _dereq_('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = _dereq_('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = _dereq_('./source-map/source-node').SourceNode;

},{"./source-map/source-map-consumer":20,"./source-map/source-map-generator":21,"./source-map/source-node":22}],16:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var util = _dereq_('./util');

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i], aAllowDuplicates);
    }
    return set;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
    var isDuplicate = this.has(aStr);
    var idx = this._array.length;
    if (!isDuplicate || aAllowDuplicates) {
      this._array.push(aStr);
    }
    if (!isDuplicate) {
      this._set[util.toSetString(aStr)] = idx;
    }
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                util.toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[util.toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

},{"./util":23,"amdefine":3}],17:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var base64 = _dereq_('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string.
   */
  exports.decode = function base64VLQ_decode(aStr) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    return {
      value: fromVLQSigned(result),
      rest: aStr.slice(i)
    };
  };

});

},{"./base64":18,"amdefine":3}],18:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});

},{"amdefine":3}],19:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the next
    //      closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return null.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return aHaystack[mid];
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return aHaystack[mid];
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0
        ? null
        : aHaystack[aLow];
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the next lowest value checked if there is no exact hit. This is because
   * mappings between original and generated line/col pairs are single points,
   * and there is an implicit region between each of them, so a miss just means
   * that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    return aHaystack.length > 0
      ? recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
      : null;
  };

});

},{"amdefine":3}],20:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var util = _dereq_('./util');
  var binarySearch = _dereq_('./binary-search');
  var ArraySet = _dereq_('./array-set').ArraySet;
  var base64VLQ = _dereq_('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - sourcesContent: Optional. An array of contents of the original source files.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: Optional. The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
    // requires the array) to play nice here.
    var names = util.getArg(sourceMap, 'names', []);
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file', null);

    // Once again, Sass deviates from the spec and supplies the version as a
    // string rather than a number, so we use loose equality checking here.
    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    // Pass `true` below to allow duplicate names and sources. While source maps
    // are intended to be compressed and deduplicated, the TypeScript compiler
    // sometimes generates source maps with duplicates in them. See Github issue
    // #72 and bugzil.la/889492.
    this._names = ArraySet.fromArray(names, true);
    this._sources = ArraySet.fromArray(sources, true);

    this.sourceRoot = sourceRoot;
    this.sourcesContent = sourcesContent;
    this._mappings = mappings;
    this.file = file;
  }

  /**
   * Create a SourceMapConsumer from a SourceMapGenerator.
   *
   * @param SourceMapGenerator aSourceMap
   *        The source map that will be consumed.
   * @returns SourceMapConsumer
   */
  SourceMapConsumer.fromSourceMap =
    function SourceMapConsumer_fromSourceMap(aSourceMap) {
      var smc = Object.create(SourceMapConsumer.prototype);

      smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
      smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
      smc.sourceRoot = aSourceMap._sourceRoot;
      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                              smc.sourceRoot);
      smc.file = aSourceMap._file;

      smc.__generatedMappings = aSourceMap._mappings.slice()
        .sort(util.compareByGeneratedPositions);
      smc.__originalMappings = aSourceMap._mappings.slice()
        .sort(util.compareByOriginalPositions);

      return smc;
    };

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this.sourceRoot ? util.join(this.sourceRoot, s) : s;
      }, this);
    }
  });

  // `__generatedMappings` and `__originalMappings` are arrays that hold the
  // parsed mapping coordinates from the source map's "mappings" attribute. They
  // are lazily instantiated, accessed via the `_generatedMappings` and
  // `_originalMappings` getters respectively, and we only parse the mappings
  // and create these arrays once queried for a source location. We jump through
  // these hoops because there can be many thousands of mappings, and parsing
  // them is expensive, so we only want to do it if we must.
  //
  // Each object in the arrays is of the form:
  //
  //     {
  //       generatedLine: The line number in the generated code,
  //       generatedColumn: The column number in the generated code,
  //       source: The path to the original source file that generated this
  //               chunk of code,
  //       originalLine: The line number in the original source that
  //                     corresponds to this chunk of generated code,
  //       originalColumn: The column number in the original source that
  //                       corresponds to this chunk of generated code,
  //       name: The name of the original symbol which generated this chunk of
  //             code.
  //     }
  //
  // All properties except for `generatedLine` and `generatedColumn` can be
  // `null`.
  //
  // `_generatedMappings` is ordered by the generated positions.
  //
  // `_originalMappings` is ordered by the original positions.

  SourceMapConsumer.prototype.__generatedMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
    get: function () {
      if (!this.__generatedMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__generatedMappings;
    }
  });

  SourceMapConsumer.prototype.__originalMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
    get: function () {
      if (!this.__originalMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__originalMappings;
    }
  });

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var mappingSeparator = /^[,;]/;
      var str = aStr;
      var mapping;
      var temp;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          temp = base64VLQ.decode(str);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
            // Original source.
            temp = base64VLQ.decode(str);
            mapping.source = this._sources.at(previousSource + temp.value);
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            temp = base64VLQ.decode(str);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            temp = base64VLQ.decode(str);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
              // Original name.
              temp = base64VLQ.decode(str);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this.__generatedMappings.push(mapping);
          if (typeof mapping.originalLine === 'number') {
            this.__originalMappings.push(mapping);
          }
        }
      }

      this.__generatedMappings.sort(util.compareByGeneratedPositions);
      this.__originalMappings.sort(util.compareByOriginalPositions);
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var mapping = this._findMapping(needle,
                                      this._generatedMappings,
                                      "generatedLine",
                                      "generatedColumn",
                                      util.compareByGeneratedPositions);

      if (mapping && mapping.generatedLine === needle.generatedLine) {
        var source = util.getArg(mapping, 'source', null);
        if (source && this.sourceRoot) {
          source = util.join(this.sourceRoot, source);
        }
        return {
          source: source,
          line: util.getArg(mapping, 'originalLine', null),
          column: util.getArg(mapping, 'originalColumn', null),
          name: util.getArg(mapping, 'name', null)
        };
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * availible.
   */
  SourceMapConsumer.prototype.sourceContentFor =
    function SourceMapConsumer_sourceContentFor(aSource) {
      if (!this.sourcesContent) {
        return null;
      }

      if (this.sourceRoot) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot
          && (url = util.urlParse(this.sourceRoot))) {
        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
        // many users. We can help them out when they expect file:// URIs to
        // behave like it would if they were running a local HTTP server. See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
        if (url.scheme == "file"
            && this._sources.has(fileUriAbsPath)) {
          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
        }

        if ((!url.path || url.path == "/")
            && this._sources.has("/" + aSource)) {
          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
        }
      }

      throw new Error('"' + aSource + '" is not in the SourceMap.');
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      if (this.sourceRoot) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var mapping = this._findMapping(needle,
                                      this._originalMappings,
                                      "originalLine",
                                      "originalColumn",
                                      util.compareByOriginalPositions);

      if (mapping) {
        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null)
        };
      }

      return {
        line: null,
        column: null
      };
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      var sourceRoot = this.sourceRoot;
      mappings.map(function (mapping) {
        var source = mapping.source;
        if (source && sourceRoot) {
          source = util.join(sourceRoot, source);
        }
        return {
          source: source,
          generatedLine: mapping.generatedLine,
          generatedColumn: mapping.generatedColumn,
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: mapping.name
        };
      }).forEach(aCallback, context);
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});

},{"./array-set":16,"./base64-vlq":17,"./binary-search":19,"./util":23,"amdefine":3}],21:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var base64VLQ = _dereq_('./base64-vlq');
  var util = _dereq_('./util');
  var ArraySet = _dereq_('./array-set').ArraySet;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. You may pass an object with the following
   * properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: A root for all relative URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    if (!aArgs) {
      aArgs = {};
    }
    this._file = util.getArg(aArgs, 'file', null);
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = [];
    this._sourcesContents = null;
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Creates a new SourceMapGenerator based on a SourceMapConsumer
   *
   * @param aSourceMapConsumer The SourceMap.
   */
  SourceMapGenerator.fromSourceMap =
    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
      var sourceRoot = aSourceMapConsumer.sourceRoot;
      var generator = new SourceMapGenerator({
        file: aSourceMapConsumer.file,
        sourceRoot: sourceRoot
      });
      aSourceMapConsumer.eachMapping(function (mapping) {
        var newMapping = {
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };

        if (mapping.source) {
          newMapping.source = mapping.source;
          if (sourceRoot) {
            newMapping.source = util.relative(sourceRoot, newMapping.source);
          }

          newMapping.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };

          if (mapping.name) {
            newMapping.name = mapping.name;
          }
        }

        generator.addMapping(newMapping);
      });
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content) {
          generator.setSourceContent(sourceFile, content);
        }
      });
      return generator;
    };

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      this._validateMapping(generated, original, source, name);

      if (source && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.push({
        generatedLine: generated.line,
        generatedColumn: generated.column,
        originalLine: original != null && original.line,
        originalColumn: original != null && original.column,
        source: source,
        name: name
      });
    };

  /**
   * Set the source content for a source file.
   */
  SourceMapGenerator.prototype.setSourceContent =
    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
      var source = aSourceFile;
      if (this._sourceRoot) {
        source = util.relative(this._sourceRoot, source);
      }

      if (aSourceContent !== null) {
        // Add the source content to the _sourcesContents map.
        // Create a new _sourcesContents map if the property is null.
        if (!this._sourcesContents) {
          this._sourcesContents = {};
        }
        this._sourcesContents[util.toSetString(source)] = aSourceContent;
      } else {
        // Remove the source file from the _sourcesContents map.
        // If the _sourcesContents map is empty, set the property to null.
        delete this._sourcesContents[util.toSetString(source)];
        if (Object.keys(this._sourcesContents).length === 0) {
          this._sourcesContents = null;
        }
      }
    };

  /**
   * Applies the mappings of a sub-source-map for a specific source file to the
   * source map being generated. Each mapping to the supplied source file is
   * rewritten using the supplied source map. Note: The resolution for the
   * resulting mappings is the minimium of this map and the supplied map.
   *
   * @param aSourceMapConsumer The source map to be applied.
   * @param aSourceFile Optional. The filename of the source file.
   *        If omitted, SourceMapConsumer's file property will be used.
   * @param aSourceMapPath Optional. The dirname of the path to the source map
   *        to be applied. If relative, it is relative to the SourceMapConsumer.
   *        This parameter is needed when the two source maps aren't in the same
   *        directory, and the source map to be applied contains relative source
   *        paths. If so, those relative source paths need to be rewritten
   *        relative to the SourceMapGenerator.
   */
  SourceMapGenerator.prototype.applySourceMap =
    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
      // If aSourceFile is omitted, we will use the file property of the SourceMap
      if (!aSourceFile) {
        if (!aSourceMapConsumer.file) {
          throw new Error(
            'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
            'or the source map\'s "file" property. Both were omitted.'
          );
        }
        aSourceFile = aSourceMapConsumer.file;
      }
      var sourceRoot = this._sourceRoot;
      // Make "aSourceFile" relative if an absolute Url is passed.
      if (sourceRoot) {
        aSourceFile = util.relative(sourceRoot, aSourceFile);
      }
      // Applying the SourceMap can add and remove items from the sources and
      // the names array.
      var newSources = new ArraySet();
      var newNames = new ArraySet();

      // Find mappings for the "aSourceFile"
      this._mappings.forEach(function (mapping) {
        if (mapping.source === aSourceFile && mapping.originalLine) {
          // Check if it can be mapped by the source map, then update the mapping.
          var original = aSourceMapConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn
          });
          if (original.source !== null) {
            // Copy mapping
            mapping.source = original.source;
            if (aSourceMapPath) {
              mapping.source = util.join(aSourceMapPath, mapping.source)
            }
            if (sourceRoot) {
              mapping.source = util.relative(sourceRoot, mapping.source);
            }
            mapping.originalLine = original.line;
            mapping.originalColumn = original.column;
            if (original.name !== null && mapping.name !== null) {
              // Only use the identifier name if it's an identifier
              // in both SourceMaps
              mapping.name = original.name;
            }
          }
        }

        var source = mapping.source;
        if (source && !newSources.has(source)) {
          newSources.add(source);
        }

        var name = mapping.name;
        if (name && !newNames.has(name)) {
          newNames.add(name);
        }

      }, this);
      this._sources = newSources;
      this._names = newNames;

      // Copy sourcesContents of applied map.
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content) {
          if (sourceRoot) {
            sourceFile = util.relative(sourceRoot, sourceFile);
          }
          this.setSourceContent(sourceFile, content);
        }
      }, this);
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping: ' + JSON.stringify({
          generated: aGenerated,
          source: aSource,
          original: aOriginal,
          name: aName
        }));
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      // The mappings must be guaranteed to be in sorted order before we start
      // serializing them or else the generated line numbers (which are defined
      // via the ';' separators) will be all messed up. Note: it might be more
      // performant to maintain the sorting as we insert them, rather than as we
      // serialize them, but the big O is the same either way.
      this._mappings.sort(util.compareByGeneratedPositions);

      for (var i = 0, len = this._mappings.length; i < len; i++) {
        mapping = this._mappings[i];

        if (mapping.generatedLine !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generatedLine !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            if (!util.compareByGeneratedPositions(mapping, this._mappings[i - 1])) {
              continue;
            }
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generatedColumn
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generatedColumn;

        if (mapping.source) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.originalLine - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.originalLine - 1;

          result += base64VLQ.encode(mapping.originalColumn
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.originalColumn;

          if (mapping.name) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  SourceMapGenerator.prototype._generateSourcesContent =
    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
      return aSources.map(function (source) {
        if (!this._sourcesContents) {
          return null;
        }
        if (aSourceRoot) {
          source = util.relative(aSourceRoot, source);
        }
        var key = util.toSetString(source);
        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                                                    key)
          ? this._sourcesContents[key]
          : null;
      }, this);
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        file: this._file,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._sourceRoot) {
        map.sourceRoot = this._sourceRoot;
      }
      if (this._sourcesContents) {
        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
      }

      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

},{"./array-set":16,"./base64-vlq":17,"./util":23,"amdefine":3}],22:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  var SourceMapGenerator = _dereq_('./source-map-generator').SourceMapGenerator;
  var util = _dereq_('./util');

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   * @param aName The original identifier.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
    this.children = [];
    this.sourceContents = {};
    this.line = aLine === undefined ? null : aLine;
    this.column = aColumn === undefined ? null : aColumn;
    this.source = aSource === undefined ? null : aSource;
    this.name = aName === undefined ? null : aName;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Creates a SourceNode from generated code and a SourceMapConsumer.
   *
   * @param aGeneratedCode The generated code
   * @param aSourceMapConsumer The SourceMap for the generated code
   */
  SourceNode.fromStringWithSourceMap =
    function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer) {
      // The SourceNode we want to fill with the generated code
      // and the SourceMap
      var node = new SourceNode();

      // The generated code
      // Processed fragments are removed from this array.
      var remainingLines = aGeneratedCode.split('\n');

      // We need to remember the position of "remainingLines"
      var lastGeneratedLine = 1, lastGeneratedColumn = 0;

      // The generate SourceNodes we need a code range.
      // To extract it current and last mapping is used.
      // Here we store the last mapping.
      var lastMapping = null;

      aSourceMapConsumer.eachMapping(function (mapping) {
        if (lastMapping !== null) {
          // We add the code from "lastMapping" to "mapping":
          // First check if there is a new line in between.
          if (lastGeneratedLine < mapping.generatedLine) {
            var code = "";
            // Associate first line with "lastMapping"
            addMappingWithCode(lastMapping, remainingLines.shift() + "\n");
            lastGeneratedLine++;
            lastGeneratedColumn = 0;
            // The remaining code is added without mapping
          } else {
            // There is no new line in between.
            // Associate the code between "lastGeneratedColumn" and
            // "mapping.generatedColumn" with "lastMapping"
            var nextLine = remainingLines[0];
            var code = nextLine.substr(0, mapping.generatedColumn -
                                          lastGeneratedColumn);
            remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                                                lastGeneratedColumn);
            lastGeneratedColumn = mapping.generatedColumn;
            addMappingWithCode(lastMapping, code);
            // No more remaining code, continue
            lastMapping = mapping;
            return;
          }
        }
        // We add the generated code until the first mapping
        // to the SourceNode without any mapping.
        // Each line is added as separate string.
        while (lastGeneratedLine < mapping.generatedLine) {
          node.add(remainingLines.shift() + "\n");
          lastGeneratedLine++;
        }
        if (lastGeneratedColumn < mapping.generatedColumn) {
          var nextLine = remainingLines[0];
          node.add(nextLine.substr(0, mapping.generatedColumn));
          remainingLines[0] = nextLine.substr(mapping.generatedColumn);
          lastGeneratedColumn = mapping.generatedColumn;
        }
        lastMapping = mapping;
      }, this);
      // We have processed all mappings.
      if (remainingLines.length > 0) {
        if (lastMapping) {
          // Associate the remaining code in the current line with "lastMapping"
          var lastLine = remainingLines.shift();
          if (remainingLines.length > 0) lastLine += "\n";
          addMappingWithCode(lastMapping, lastLine);
        }
        // and add the remaining lines without any mapping
        node.add(remainingLines.join("\n"));
      }

      // Copy sourcesContent into SourceNode
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content) {
          node.setSourceContent(sourceFile, content);
        }
      });

      return node;

      function addMappingWithCode(mapping, code) {
        if (mapping === null || mapping.source === undefined) {
          node.add(code);
        } else {
          node.add(new SourceNode(mapping.originalLine,
                                  mapping.originalColumn,
                                  mapping.source,
                                  code,
                                  mapping.name));
        }
      }
    };

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    var chunk;
    for (var i = 0, len = this.children.length; i < len; i++) {
      chunk = this.children[i];
      if (chunk instanceof SourceNode) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source,
                       line: this.line,
                       column: this.column,
                       name: this.name });
        }
      }
    }
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length;
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild instanceof SourceNode) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Set the source content for a source file. This will be added to the SourceMapGenerator
   * in the sourcesContent field.
   *
   * @param aSourceFile The filename of the source file
   * @param aSourceContent The content of the source file
   */
  SourceNode.prototype.setSourceContent =
    function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
      this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
    };

  /**
   * Walk over the tree of SourceNodes. The walking function is called for each
   * source file content and is passed the filename and source content.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walkSourceContents =
    function SourceNode_walkSourceContents(aFn) {
      for (var i = 0, len = this.children.length; i < len; i++) {
        if (this.children[i] instanceof SourceNode) {
          this.children[i].walkSourceContents(aFn);
        }
      }

      var sources = Object.keys(this.sourceContents);
      for (var i = 0, len = sources.length; i < len; i++) {
        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
      }
    };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    var sourceMappingActive = false;
    var lastOriginalSource = null;
    var lastOriginalLine = null;
    var lastOriginalColumn = null;
    var lastOriginalName = null;
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source !== null
          && original.line !== null
          && original.column !== null) {
        if(lastOriginalSource !== original.source
           || lastOriginalLine !== original.line
           || lastOriginalColumn !== original.column
           || lastOriginalName !== original.name) {
          map.addMapping({
            source: original.source,
            original: {
              line: original.line,
              column: original.column
            },
            generated: {
              line: generated.line,
              column: generated.column
            },
            name: original.name
          });
        }
        lastOriginalSource = original.source;
        lastOriginalLine = original.line;
        lastOriginalColumn = original.column;
        lastOriginalName = original.name;
        sourceMappingActive = true;
      } else if (sourceMappingActive) {
        map.addMapping({
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
        lastOriginalSource = null;
        sourceMappingActive = false;
      }
      chunk.split('').forEach(function (ch, idx, array) {
        if (ch === '\n') {
          generated.line++;
          generated.column = 0;
          // Mappings end at eol
          if (idx + 1 === array.length) {
            lastOriginalSource = null;
            sourceMappingActive = false;
          } else if (sourceMappingActive) {
            map.addMapping({
              source: original.source,
              original: {
                line: original.line,
                column: original.column
              },
              generated: {
                line: generated.line,
                column: generated.column
              },
              name: original.name
            });
          }
        } else {
          generated.column++;
        }
      });
    });
    this.walkSourceContents(function (sourceFile, sourceContent) {
      map.setSourceContent(sourceFile, sourceContent);
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});

},{"./source-map-generator":21,"./util":23,"amdefine":3}],23:[function(_dereq_,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = _dereq_('amdefine')(module, _dereq_);
}
define(function (_dereq_, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
  var dataUrlRegexp = /^data:.+\,.+$/;

  function urlParse(aUrl) {
    var match = aUrl.match(urlRegexp);
    if (!match) {
      return null;
    }
    return {
      scheme: match[1],
      auth: match[2],
      host: match[3],
      port: match[4],
      path: match[5]
    };
  }
  exports.urlParse = urlParse;

  function urlGenerate(aParsedUrl) {
    var url = '';
    if (aParsedUrl.scheme) {
      url += aParsedUrl.scheme + ':';
    }
    url += '//';
    if (aParsedUrl.auth) {
      url += aParsedUrl.auth + '@';
    }
    if (aParsedUrl.host) {
      url += aParsedUrl.host;
    }
    if (aParsedUrl.port) {
      url += ":" + aParsedUrl.port
    }
    if (aParsedUrl.path) {
      url += aParsedUrl.path;
    }
    return url;
  }
  exports.urlGenerate = urlGenerate;

  /**
   * Normalizes a path, or the path portion of a URL:
   *
   * - Replaces consequtive slashes with one slash.
   * - Removes unnecessary '.' parts.
   * - Removes unnecessary '<dir>/..' parts.
   *
   * Based on code in the Node.js 'path' core module.
   *
   * @param aPath The path or url to normalize.
   */
  function normalize(aPath) {
    var path = aPath;
    var url = urlParse(aPath);
    if (url) {
      if (!url.path) {
        return aPath;
      }
      path = url.path;
    }
    var isAbsolute = (path.charAt(0) === '/');

    var parts = path.split(/\/+/);
    for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
      part = parts[i];
      if (part === '.') {
        parts.splice(i, 1);
      } else if (part === '..') {
        up++;
      } else if (up > 0) {
        if (part === '') {
          // The first part is blank if the path is absolute. Trying to go
          // above the root is a no-op. Therefore we can remove all '..' parts
          // directly after the root.
          parts.splice(i + 1, up);
          up = 0;
        } else {
          parts.splice(i, 2);
          up--;
        }
      }
    }
    path = parts.join('/');

    if (path === '') {
      path = isAbsolute ? '/' : '.';
    }

    if (url) {
      url.path = path;
      return urlGenerate(url);
    }
    return path;
  }
  exports.normalize = normalize;

  /**
   * Joins two paths/URLs.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be joined with the root.
   *
   * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
   *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
   *   first.
   * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
   *   is updated with the result and aRoot is returned. Otherwise the result
   *   is returned.
   *   - If aPath is absolute, the result is aPath.
   *   - Otherwise the two paths are joined with a slash.
   * - Joining for example 'http://' and 'www.example.com' is also supported.
   */
  function join(aRoot, aPath) {
    var aPathUrl = urlParse(aPath);
    var aRootUrl = urlParse(aRoot);
    if (aRootUrl) {
      aRoot = aRootUrl.path || '/';
    }

    // `join(foo, '//www.example.org')`
    if (aPathUrl && !aPathUrl.scheme) {
      if (aRootUrl) {
        aPathUrl.scheme = aRootUrl.scheme;
      }
      return urlGenerate(aPathUrl);
    }

    if (aPathUrl || aPath.match(dataUrlRegexp)) {
      return aPath;
    }

    // `join('http://', 'www.example.com')`
    if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
      aRootUrl.host = aPath;
      return urlGenerate(aRootUrl);
    }

    var joined = aPath.charAt(0) === '/'
      ? aPath
      : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

    if (aRootUrl) {
      aRootUrl.path = joined;
      return urlGenerate(aRootUrl);
    }
    return joined;
  }
  exports.join = join;

  /**
   * Because behavior goes wacky when you set `__proto__` on objects, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  function toSetString(aStr) {
    return '$' + aStr;
  }
  exports.toSetString = toSetString;

  function fromSetString(aStr) {
    return aStr.substr(1);
  }
  exports.fromSetString = fromSetString;

  function relative(aRoot, aPath) {
    aRoot = aRoot.replace(/\/$/, '');

    var url = urlParse(aRoot);
    if (aPath.charAt(0) == "/" && url && url.path == "/") {
      return aPath.slice(1);
    }

    return aPath.indexOf(aRoot + '/') === 0
      ? aPath.substr(aRoot.length + 1)
      : aPath;
  }
  exports.relative = relative;

  function strcmp(aStr1, aStr2) {
    var s1 = aStr1 || "";
    var s2 = aStr2 || "";
    return (s1 > s2) - (s1 < s2);
  }

  /**
   * Comparator between two mappings where the original positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same original source/line/column, but different generated
   * line and column the same. Useful when searching for a mapping with a
   * stubbed out mapping.
   */
  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
    var cmp;

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp || onlyCompareOriginal) {
      return cmp;
    }

    cmp = strcmp(mappingA.name, mappingB.name);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    return mappingA.generatedColumn - mappingB.generatedColumn;
  };
  exports.compareByOriginalPositions = compareByOriginalPositions;

  /**
   * Comparator between two mappings where the generated positions are
   * compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same generated line and column, but different
   * source/name/original line and column the same. Useful when searching for a
   * mapping with a stubbed out mapping.
   */
  function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
    var cmp;

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp || onlyCompareGenerated) {
      return cmp;
    }

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp) {
      return cmp;
    }

    return strcmp(mappingA.name, mappingB.name);
  };
  exports.compareByGeneratedPositions = compareByGeneratedPositions;

});

},{"amdefine":3}],24:[function(_dereq_,module,exports){


module.exports = exceptionMode(createException()) // basically what browser this is

// verbatim from `mode` in stacktrace.js as of 2014-01-23
function exceptionMode(e) {
    if (e['arguments'] && e.stack) {
        return 'chrome';
    } else if (e.stack && e.sourceURL) {
        return 'safari';
    } else if (e.stack && e.number) {
        return 'ie';
    } else if (typeof e.message === 'string' && typeof window !== 'undefined' && window.opera) {
        // e.message.indexOf("Backtrace:") > -1 -> opera
        // !e.stacktrace -> opera
        if (!e.stacktrace) {
            return 'opera9'; // use e.message
        }
        // 'opera#sourceloc' in e -> opera9, opera10a
        if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
            return 'opera9'; // use e.message
        }
        // e.stacktrace && !e.stack -> opera10a
        if (!e.stack) {
            return 'opera10a'; // use e.stacktrace
        }
        // e.stacktrace && e.stack -> opera10b
        if (e.stacktrace.indexOf("called from line") < 0) {
            return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
        }
        // e.stacktrace && e.stack -> opera11
        return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
    } else if (e.stack && !e.fileName) {
        // Chrome 27 does not have e.arguments as earlier versions,
        // but still does not have e.fileName as Firefox
        return 'chrome';
    } else if (e.stack) {
        return 'firefox';
    }
    return 'other';
}

function createException() {
    try {
        this.undef();
    } catch (e) {
        return e;
    }
}

},{}],25:[function(_dereq_,module,exports){
var printStackTrace = _dereq_('stacktrace-js')
var parsers = _dereq_('./tracelineParser')
var mode = _dereq_('./exceptionMode')

module.exports = function(ex) {
    if(parsers[mode] === undefined)
        throw new Error("browser "+mode+" not supported")

    var options = undefined
    if(ex !== undefined) {
        if(mode === 'ie' && ex.number === undefined)
            ex.number = 1    // work around for this: https://github.com/stacktracejs/stacktrace.js/issues/80
        options = {e:ex, guess: true}
    }
    var trace = printStackTrace(options)

    if(ex === undefined) {
        trace.splice(0,4) // strip stacktrace-js internals
    }

    return parseStacktrace(trace)
}

function TraceInfo(traceline) {
    this.traceline = traceline
}
TraceInfo.prototype = {
    get file() {
        return getInfo(this).file
    },
    get function() {
        return getInfo(this).function
    },
    get line() {
        return getInfo(this).line
    },
    get column() {
        return getInfo(this).column
    },
    get info() {
        return getInfo(this)
    }
}

function getInfo(traceInfo) {
    if(traceInfo.cache === undefined) {
        var info = parsers[mode](traceInfo.traceline)
        if(info.line !== undefined)
            info.line = parseInt(info.line, 10)
        if(info.column !== undefined)
            info.column = parseInt(info.column, 10)

        traceInfo.cache = info
    }

    return traceInfo.cache
}

function parseStacktrace(trace) {
    var results = []
    for(var n = 0; n<trace.length; n++) {
        results.push(new TraceInfo(trace[n]))
    }
    return results
}

// here because i'm lazy, they're here for testing only
module.exports.parsers = parsers
module.exports.mode = mode
module.exports.sourceCache = printStackTrace.implementation.prototype.sourceCache // expose this so you can consolidate caches together from different libraries

},{"./exceptionMode":24,"./tracelineParser":26,"stacktrace-js":27}],26:[function(_dereq_,module,exports){

module.exports = {
    chrome: function(line) {
        var m = line.match(CHROME_STACK_LINE);
        if (m) {
            var file = m[9] || m[18] || m[26]
            var fn = m[4] || m[7] || m[14] || m[23]
            var lineNumber = m[11] || m[20]
            var column = m[13] || m[22]
        } else {
            //throw new Error("Couldn't parse exception line: "+line)
        }
        
        return {
            file: file,
            function: fn,
            line: lineNumber,
            column: column
        }
    },
    
    firefox: function(line) {
        var m = line.match(FIREFOX_STACK_LINE);
        if (m) {
            var file = m[8]
            var fn = m[1]
            var lineNumber = m[10]
            var column = m[12]
        }
        
        return {
            file: file,
            function: fn,
            line: lineNumber,
            column: column
        }
    },
    
    ie: function(line) {
        var m = line.match(IE_STACK_LINE);
        if (m) {
            var file = m[3] || m[10]
            var fn = m[2] || m[9]
            var lineNumber = m[5] || m[12]
            var column = m[7] || m[14]
        }
        
        return {
            file: file,
            function: fn,
            line: lineNumber,
            column: column
        }
    }
}

// The following 2 regex patterns were originally taken from google closure library: https://code.google.com/p/closure-library/source/browse/closure/goog/testing/stacktrace.js
// RegExp pattern for JavaScript identifiers. We don't support Unicode identifiers defined in ECMAScript v3.
var IDENTIFIER_PATTERN_ = '[\\w$]*';
// RegExp pattern for an URL + position inside the file.
var URL_PATTERN_ = '((?:http|https|file)://[^\\s)]+?|javascript:.*)';
var FILE_AND_LINE = URL_PATTERN_+'(:(\\d*)(:(\\d*))?)'

var STACKTRACE_JS_GETSOURCE_FAILURE = 'getSource failed with url'

var CHROME_STACKTRACE_JS_GETSOURCE_FAILURE = STACKTRACE_JS_GETSOURCE_FAILURE+'((?!'+'\\(\\)@'+').)*'

var CHROME_FILE_AND_LINE = FILE_AND_LINE//URL_PATTERN_+'(:(\\d*):(\\d*))'
var CHROME_IDENTIFIER_PATTERN = '\\<?'+IDENTIFIER_PATTERN_+'\\>?'
var CHROME_COMPOUND_IDENTIFIER = "((new )?"+CHROME_IDENTIFIER_PATTERN+'(\\.'+CHROME_IDENTIFIER_PATTERN+')*)( \\[as '+IDENTIFIER_PATTERN_+'])?'
var CHROME_UNKNOWN_IDENTIFIER = "(\\(\\?\\))"

// output from stacktrace.js is: "name()@..." instead of "name (...)"
var CHROME_ANONYMOUS_FUNCTION = '('+CHROME_STACKTRACE_JS_GETSOURCE_FAILURE+'|'+CHROME_COMPOUND_IDENTIFIER+'|'+CHROME_UNKNOWN_IDENTIFIER+')'
                                    +'\\(\\)'+'@'+CHROME_FILE_AND_LINE
var CHROME_NORMAL_FUNCTION = CHROME_COMPOUND_IDENTIFIER+' \\('+CHROME_FILE_AND_LINE+'\\)'
var CHROME_NATIVE_FUNCTION = CHROME_COMPOUND_IDENTIFIER+' (\\(native\\))'

var CHROME_FUNCTION_CALL = '('+CHROME_ANONYMOUS_FUNCTION+"|"+CHROME_NORMAL_FUNCTION+"|"+CHROME_NATIVE_FUNCTION+')'

var CHROME_STACK_LINE = new RegExp('^'+CHROME_FUNCTION_CALL+'$')  // precompile them so its faster


var FIREFOX_STACKTRACE_JS_GETSOURCE_FAILURE = STACKTRACE_JS_GETSOURCE_FAILURE+'((?!'+'\\(\\)@'+').)*'+'\\(\\)'
var FIREFOX_FILE_AND_LINE = FILE_AND_LINE//URL_PATTERN_+'((:(\\d*):(\\d*))|(:(\\d*)))'
var FIREFOX_ARRAY_PART = '\\[\\d*\\]'
var FIREFOX_WEIRD_PART = '\\(\\?\\)'
var FIREFOX_COMPOUND_IDENTIFIER = '(('+IDENTIFIER_PATTERN_+'|'+FIREFOX_ARRAY_PART+'|'+FIREFOX_WEIRD_PART+')((\\(\\))?|(\\.|\\<|/)*))*'
var FIREFOX_FUNCTION_CALL = '('+FIREFOX_COMPOUND_IDENTIFIER+'|'+FIREFOX_STACKTRACE_JS_GETSOURCE_FAILURE+')@'+FIREFOX_FILE_AND_LINE
var FIREFOX_STACK_LINE = new RegExp('^'+FIREFOX_FUNCTION_CALL+'$')

var IE_WHITESPACE = '[\\w \\t]'
var IE_FILE_AND_LINE = FILE_AND_LINE
var IE_ANONYMOUS = '('+IE_WHITESPACE+'*({anonymous}\\(\\)))@\\('+IE_FILE_AND_LINE+'\\)'
var IE_NORMAL_FUNCTION = '('+IDENTIFIER_PATTERN_+')@'+IE_FILE_AND_LINE
var IE_FUNCTION_CALL = '('+IE_NORMAL_FUNCTION+'|'+IE_ANONYMOUS+')'+IE_WHITESPACE+'*'
var IE_STACK_LINE = new RegExp('^'+IE_FUNCTION_CALL+'$')
},{}],27:[function(_dereq_,module,exports){
// Domain Public by Eric Wendelin http://eriwen.com/ (2008)
//                  Luke Smith http://lucassmith.name/ (2008)
//                  Loic Dachary <loic@dachary.org> (2008)
//                  Johan Euphrosine <proppy@aminche.com> (2008)
//                  Oyvind Sean Kinsey http://kinsey.no/blog (2010)
//                  Victor Homyakov <victor-homyakov@users.sourceforge.net> (2010)
(function(global, factory) {
  // Node
  if (typeof exports === 'object') {
    module.exports = factory();

  // AMD
  } else if (typeof define === 'function' && define.amd) {
    define(factory);

  // Browser globals
  } else {
    global.printStackTrace = factory();
  }
}(this, function() {
	/**
	 * Main function giving a function stack trace with a forced or passed in Error
	 *
	 * @cfg {Error} e The error to create a stacktrace from (optional)
	 * @cfg {Boolean} guess If we should try to resolve the names of anonymous functions
	 * @return {Array} of Strings with functions, lines, files, and arguments where possible
	 */
	function printStackTrace(options) {
	    options = options || {guess: true};
	    var ex = options.e || null, guess = !!options.guess;
	    var p = new printStackTrace.implementation(), result = p.run(ex);
	    return (guess) ? p.guessAnonymousFunctions(result) : result;
	}

	printStackTrace.implementation = function() {
	};

	printStackTrace.implementation.prototype = {
	    /**
	     * @param {Error} ex The error to create a stacktrace from (optional)
	     * @param {String} mode Forced mode (optional, mostly for unit tests)
	     */
	    run: function(ex, mode) {
	        ex = ex || this.createException();
	        // examine exception properties w/o debugger
	        //for (var prop in ex) {alert("Ex['" + prop + "']=" + ex[prop]);}
	        mode = mode || this.mode(ex);
	        if (mode === 'other') {
	            return this.other(arguments.callee);
	        } else {
	            return this[mode](ex);
	        }
	    },

	    createException: function() {
	        try {
	            this.undef();
	        } catch (e) {
	            return e;
	        }
	    },

	    /**
	     * Mode could differ for different exception, e.g.
	     * exceptions in Chrome may or may not have arguments or stack.
	     *
	     * @return {String} mode of operation for the exception
	     */
	    mode: function(e) {
	        if (e['arguments'] && e.stack) {
	            return 'chrome';
	        } else if (e.stack && e.sourceURL) {
	            return 'safari';
	        } else if (e.stack && e.number) {
	            return 'ie';
	        } else if (typeof e.message === 'string' && typeof window !== 'undefined' && window.opera) {
	            // e.message.indexOf("Backtrace:") > -1 -> opera
	            // !e.stacktrace -> opera
	            if (!e.stacktrace) {
	                return 'opera9'; // use e.message
	            }
	            // 'opera#sourceloc' in e -> opera9, opera10a
	            if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
	                return 'opera9'; // use e.message
	            }
	            // e.stacktrace && !e.stack -> opera10a
	            if (!e.stack) {
	                return 'opera10a'; // use e.stacktrace
	            }
	            // e.stacktrace && e.stack -> opera10b
	            if (e.stacktrace.indexOf("called from line") < 0) {
	                return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
	            }
	            // e.stacktrace && e.stack -> opera11
	            return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
	        } else if (e.stack && !e.fileName) {
	            // Chrome 27 does not have e.arguments as earlier versions,
	            // but still does not have e.fileName as Firefox
	            return 'chrome';
	        } else if (e.stack) {
	            return 'firefox';
	        }
	        return 'other';
	    },

	    /**
	     * Given a context, function name, and callback function, overwrite it so that it calls
	     * printStackTrace() first with a callback and then runs the rest of the body.
	     *
	     * @param {Object} context of execution (e.g. window)
	     * @param {String} functionName to instrument
	     * @param {Function} callback function to call with a stack trace on invocation
	     */
	    instrumentFunction: function(context, functionName, callback) {
	        context = context || window;
	        var original = context[functionName];
	        context[functionName] = function instrumented() {
	            callback.call(this, printStackTrace().slice(4));
	            return context[functionName]._instrumented.apply(this, arguments);
	        };
	        context[functionName]._instrumented = original;
	    },

	    /**
	     * Given a context and function name of a function that has been
	     * instrumented, revert the function to it's original (non-instrumented)
	     * state.
	     *
	     * @param {Object} context of execution (e.g. window)
	     * @param {String} functionName to de-instrument
	     */
	    deinstrumentFunction: function(context, functionName) {
	        if (context[functionName].constructor === Function &&
	                context[functionName]._instrumented &&
	                context[functionName]._instrumented.constructor === Function) {
	            context[functionName] = context[functionName]._instrumented;
	        }
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Chrome's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    chrome: function(e) {
	        var stack = (e.stack + '\n').replace(/^\S[^\(]+?[\n$]/gm, '').
	          replace(/^\s+(at eval )?at\s+/gm, '').
	          replace(/^([^\(]+?)([\n$])/gm, '{anonymous}()@$1$2').
	          replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}()@$1').split('\n');
	        stack.pop();
	        return stack;
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Safari's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    safari: function(e) {
	        return e.stack.replace(/\[native code\]\n/m, '')
	            .replace(/^(?=\w+Error\:).*$\n/m, '')
	            .replace(/^@/gm, '{anonymous}()@')
	            .split('\n');
	    },

	    /**
	     * Given an Error object, return a formatted Array based on IE's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    ie: function(e) {
	        var lineRE = /^.*at (\w+) \(([^\)]+)\)$/gm;
	        return e.stack.replace(/at Anonymous function /gm, '{anonymous}()@')
	            .replace(/^(?=\w+Error\:).*$\n/m, '')
	            .replace(lineRE, '$1@$2')
	            .split('\n');
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Firefox's stack string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    firefox: function(e) {
	        return e.stack.replace(/(?:\n@:0)?\s+$/m, '').replace(/^[\(@]/gm, '{anonymous}()@').split('\n');
	    },

	    opera11: function(e) {
	        var ANON = '{anonymous}', lineRE = /^.*line (\d+), column (\d+)(?: in (.+))? in (\S+):$/;
	        var lines = e.stacktrace.split('\n'), result = [];

	        for (var i = 0, len = lines.length; i < len; i += 2) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                var location = match[4] + ':' + match[1] + ':' + match[2];
	                var fnName = match[3] || "global code";
	                fnName = fnName.replace(/<anonymous function: (\S+)>/, "$1").replace(/<anonymous function>/, ANON);
	                result.push(fnName + '@' + location + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
	            }
	        }

	        return result;
	    },

	    opera10b: function(e) {
	        // "<anonymous function: run>([arguments not available])@file://localhost/G:/js/stacktrace.js:27\n" +
	        // "printStackTrace([arguments not available])@file://localhost/G:/js/stacktrace.js:18\n" +
	        // "@file://localhost/G:/js/test/functional/testcase1.html:15"
	        var lineRE = /^(.*)@(.+):(\d+)$/;
	        var lines = e.stacktrace.split('\n'), result = [];

	        for (var i = 0, len = lines.length; i < len; i++) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                var fnName = match[1]? (match[1] + '()') : "global code";
	                result.push(fnName + '@' + match[2] + ':' + match[3]);
	            }
	        }

	        return result;
	    },

	    /**
	     * Given an Error object, return a formatted Array based on Opera 10's stacktrace string.
	     *
	     * @param e - Error object to inspect
	     * @return Array<String> of function calls, files and line numbers
	     */
	    opera10a: function(e) {
	        // "  Line 27 of linked script file://localhost/G:/js/stacktrace.js\n"
	        // "  Line 11 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html: In function foo\n"
	        var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
	        var lines = e.stacktrace.split('\n'), result = [];

	        for (var i = 0, len = lines.length; i < len; i += 2) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                var fnName = match[3] || ANON;
	                result.push(fnName + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
	            }
	        }

	        return result;
	    },

	    // Opera 7.x-9.2x only!
	    opera9: function(e) {
	        // "  Line 43 of linked script file://localhost/G:/js/stacktrace.js\n"
	        // "  Line 7 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html\n"
	        var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
	        var lines = e.message.split('\n'), result = [];

	        for (var i = 2, len = lines.length; i < len; i += 2) {
	            var match = lineRE.exec(lines[i]);
	            if (match) {
	                result.push(ANON + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
	            }
	        }

	        return result;
	    },

	    // Safari 5-, IE 9-, and others
	    other: function(curr) {
	        var ANON = '{anonymous}', fnRE = /function\s*([\w\-$]+)?\s*\(/i, stack = [], fn, args, maxStackSize = 10;
	        while (curr && curr['arguments'] && stack.length < maxStackSize) {
	            fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
	            args = Array.prototype.slice.call(curr['arguments'] || []);
	            stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
	            curr = curr.caller;
	        }
	        return stack;
	    },

	    /**
	     * Given arguments array as a String, substituting type names for non-string types.
	     *
	     * @param {Arguments,Array} args
	     * @return {String} stringified arguments
	     */
	    stringifyArguments: function(args) {
	        var result = [];
	        var slice = Array.prototype.slice;
	        for (var i = 0; i < args.length; ++i) {
	            var arg = args[i];
	            if (arg === undefined) {
	                result[i] = 'undefined';
	            } else if (arg === null) {
	                result[i] = 'null';
	            } else if (arg.constructor) {
	                if (arg.constructor === Array) {
	                    if (arg.length < 3) {
	                        result[i] = '[' + this.stringifyArguments(arg) + ']';
	                    } else {
	                        result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
	                    }
	                } else if (arg.constructor === Object) {
	                    result[i] = '#object';
	                } else if (arg.constructor === Function) {
	                    result[i] = '#function';
	                } else if (arg.constructor === String) {
	                    result[i] = '"' + arg + '"';
	                } else if (arg.constructor === Number) {
	                    result[i] = arg;
	                }
	            }
	        }
	        return result.join(',');
	    },

	    sourceCache: {},

	    /**
	     * @return the text from a given URL
	     */
	    ajax: function(url) {
	        var req = this.createXMLHTTPObject();
	        if (req) {
	            try {
	                req.open('GET', url, false);
	                //req.overrideMimeType('text/plain');
	                //req.overrideMimeType('text/javascript');
	                req.send(null);
	                //return req.status == 200 ? req.responseText : '';
	                return req.responseText;
	            } catch (e) {
	            }
	        }
	        return '';
	    },

	    /**
	     * Try XHR methods in order and store XHR factory.
	     *
	     * @return <Function> XHR function or equivalent
	     */
	    createXMLHTTPObject: function() {
	        var xmlhttp, XMLHttpFactories = [
	            function() {
	                return new XMLHttpRequest();
	            }, function() {
	                return new ActiveXObject('Msxml2.XMLHTTP');
	            }, function() {
	                return new ActiveXObject('Msxml3.XMLHTTP');
	            }, function() {
	                return new ActiveXObject('Microsoft.XMLHTTP');
	            }
	        ];
	        for (var i = 0; i < XMLHttpFactories.length; i++) {
	            try {
	                xmlhttp = XMLHttpFactories[i]();
	                // Use memoization to cache the factory
	                this.createXMLHTTPObject = XMLHttpFactories[i];
	                return xmlhttp;
	            } catch (e) {
	            }
	        }
	    },

	    /**
	     * Given a URL, check if it is in the same domain (so we can get the source
	     * via Ajax).
	     *
	     * @param url <String> source url
	     * @return <Boolean> False if we need a cross-domain request
	     */
	    isSameDomain: function(url) {
	        return typeof location !== "undefined" && url.indexOf(location.hostname) !== -1; // location may not be defined, e.g. when running from nodejs.
	    },

	    /**
	     * Get source code from given URL if in the same domain.
	     *
	     * @param url <String> JS source URL
	     * @return <Array> Array of source code lines
	     */
	    getSource: function(url) {
	        // TODO reuse source from script tags?
	        if (!(url in this.sourceCache)) {
	            this.sourceCache[url] = this.ajax(url).split('\n');
	        }
	        return this.sourceCache[url];
	    },

	    guessAnonymousFunctions: function(stack) {
	        for (var i = 0; i < stack.length; ++i) {
	            var reStack = /\{anonymous\}\(.*\)@(.*)/,
	                reRef = /^(.*?)(?::(\d+))(?::(\d+))?(?: -- .+)?$/,
	                frame = stack[i], ref = reStack.exec(frame);

	            if (ref) {
	                var m = reRef.exec(ref[1]);
	                if (m) { // If falsey, we did not get any file/line information
	                    var file = m[1], lineno = m[2], charno = m[3] || 0;
	                    if (file && this.isSameDomain(file) && lineno) {
	                        var functionName = this.guessAnonymousFunction(file, lineno, charno);
	                        stack[i] = frame.replace('{anonymous}', functionName);
	                    }
	                }
	            }
	        }
	        return stack;
	    },

	    guessAnonymousFunction: function(url, lineNo, charNo) {
	        var ret;
	        try {
	            ret = this.findFunctionName(this.getSource(url), lineNo);
	        } catch (e) {
	            ret = 'getSource failed with url: ' + url + ', exception: ' + e.toString();
	        }
	        return ret;
	    },

	    findFunctionName: function(source, lineNo) {
	        // FIXME findFunctionName fails for compressed source
	        // (more than one function on the same line)
	        // function {name}({args}) m[1]=name m[2]=args
	        var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
	        // {name} = function ({args}) TODO args capture
	        // /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*function(?:[^(]*)/
	        var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
	        // {name} = eval()
	        var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
	        // Walk backwards in the source lines until we find
	        // the line which matches one of the patterns above
	        var code = "", line, maxLines = Math.min(lineNo, 20), m, commentPos;
	        for (var i = 0; i < maxLines; ++i) {
	            // lineNo is 1-based, source[] is 0-based
	            line = source[lineNo - i - 1];
	            commentPos = line.indexOf('//');
	            if (commentPos >= 0) {
	                line = line.substr(0, commentPos);
	            }
	            // TODO check other types of comments? Commented code may lead to false positive
	            if (line) {
	                code = line + code;
	                m = reFunctionExpression.exec(code);
	                if (m && m[1]) {
	                    return m[1];
	                }
	                m = reFunctionDeclaration.exec(code);
	                if (m && m[1]) {
	                    //return m[1] + "(" + (m[2] || "") + ")";
	                    return m[1];
	                }
	                m = reFunctionEvaluation.exec(code);
	                if (m && m[1]) {
	                    return m[1];
	                }
	            }
	        }
	        return '(?)';
	    }
	};

	return printStackTrace;
}));
},{}],28:[function(_dereq_,module,exports){
// resolves varargs variable into more usable form
// args - should be a function arguments variable
// returns a javascript Array object of arguments that doesn't count trailing undefined values in the length
module.exports = function(theArguments) {
    var args = Array.prototype.slice.call(theArguments, 0)

    var count = 0;
    for(var n=args.length-1; n>=0; n--) {
        if(args[n] === undefined)
            count++
    }
    args.splice(-0, count)
    return args
}
},{}],29:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = _dereq_('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = _dereq_('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":5,"querystring":11}],30:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var deadunitCore = _dereq_("./deadunitCore")
var browserConfig = _dereq_('./deadunitCore.browserConfig')

module.exports = deadunitCore(browserConfig())
},{"./deadunitCore":32,"./deadunitCore.browserConfig":31}],31:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var path = _dereq_('path');

var Future = _dereq_('async-future')
var proto = _dereq_('proto')
var stackinfo = _dereq_('stackinfo')
var ajax = _dereq_("ajax")
var resolveSourceMap = Future.wrap(_dereq_('source-map-resolve').resolveSourceMap)

var deadunitCore = _dereq_("./deadunitCore")
var isRelative = _dereq_('./isRelative')

ajax.setSynchronous(true) // todo: REMOVE THIS once this chrome bug is fixed in a public release: https://code.google.com/p/chromium/issues/detail?id=368444

// add sourceFile contents into stacktrace.js's cache
var sourceCache = {}
var cacheGet = function(url) {
    return sourceCache[url]
}
var cacheSet = function(url, responseFuture) {
    sourceCache[url] = responseFuture
    if(stackinfo.sourceCache[url] === undefined) {
        responseFuture.then(function(response) {
            stackinfo.sourceCache[url] = response.text.split('\n')
        }).done()
    }
}

// source-map-resolve assumed the availability of setImmediate
if(window.setImmediate === undefined) {
    window.setImmediate = function(fn, params) {
        setTimeout(function() {
            fn.apply(this,params)
        },0)
    }
}

ajax.cacheGet(cacheGet)
ajax.cacheSet(cacheSet)


var config = module.exports = proto(function() {
    this.init = function() {
        var that = this
        // node.js errback style readFile
        /*private*/ this.readFile = function(url, callback) {
            that.ajax(url).then(function(response) { // need to use 'that' because readFile will not be called with this config object as the context
                callback(undefined, response.text)
            }).catch(callback).done()
        }
    }

    this.ajax = ajax

    this.initialize = function() {}

    this.initializeMainTest = function(testState) {
        //testState.active = true // make sure

        testState.oldOnerror = window.onerror
        testState.newOnerror = window.onerror = function(errorMessage, filename, line, column) {
            if(column === undefined) var columnText = ''
            else                     var columnText = "/"+column

            try {
                throw new Error("Uncaught error in "+filename+" line "+line+columnText+": "+errorMessage) // IE needs the exception to actually be thrown before it will have a stack trace
            } catch(e) {
                testState.unhandledErrorHandler(e, true)
                if(testState.oldOnerror)
                    testState.oldOnerror.apply(this, arguments)
            }
        }
    }
    this.mainTestDone= function(testState) {
        //testState.active = false // make sure the test-specific onerror code is no longer run
        /*if(testState.newOnerror === window.onerror) {
            window.onerror = testState.oldOnerror // otherwise something else has overwritten onerror, so don't mess with it
        }*/
    }

    this.getDomain= function() {
        return undefined // domains don't exist in-browser
    }

    this.runTestGroup= function(deadunitState, tester, runTest, handleError, handleUnhandledError) {
        runTest()
    }
    this.getScriptSourceLines= function(path) {
        if(stackinfo.sourceCache[path] !== undefined) {
            return Future(stackinfo.sourceCache[path])
        } else {
            return this.ajax(path).then(function(response) {
                return Future(response.text.split('\n'))
            })
        }

    }
    this.getSourceMapObject = function(url, warningHandler) {
        var that = this
        return this.ajax(url).then(function(response) {
            var headers = response.headers
            if(headers['SourceMap'] !== undefined) {
                var headerSourceMap = headers['SourceMap']
            } else if(headers['X-SourceMap']) {
                var headerSourceMap = headers['X-SourceMap']
            }

            if(headerSourceMap !== undefined) {
                if(isRelative(headerSourceMap)) {
                    headerSourceMap = path.join(path.dirname(url),headerSourceMap)
                }

                return that.ajax(headerSourceMap).then(function(response) {
                    return Future(JSON.parse(response.text))
                })

            } else {
                return resolveSourceMap(response.text, url, that.readFile).catch(function(e){
                    warningHandler(e)
                    return Future(null)

                }).then(function(sourceMapObject) {
                    if(sourceMapObject !== null) {
                        return Future(sourceMapObject.map)
                    } else {
                        return Future(undefined)
                    }
                })
            }
        })
    }

    this.defaultUnhandledErrorHandler= function(e) {
        //if(e !== undefined)
            setTimeout(function() {
                if(e.stack)
                    console.log(e.stack)
                else
                    console.log(e)
            },0)
    }
    this.defaultTestErrorHandler= function(tester) {
        return function(e) {
            tester.manager.emit('exception', {
                parent: tester.mainSubTest.id,
                time: (new Date()).getTime(),
                error: e
            })
        }
    }

    this.getLineInfo= function(stackIncrease) {
        return Future(stackinfo()[3+stackIncrease])
    }

    this.getExceptionInfo= function(e) {
        return Future(stackinfo(e))
    }

    this.throwAsyncException = function(e) {
        setTimeout(function() {
            if(e.stack !== undefined) throw e.stack
            else                      throw e
        },0)
    }
})

},{"./deadunitCore":32,"./isRelative":33,"ajax":1,"async-future":4,"path":7,"proto":8,"source-map-resolve":13,"stackinfo":25}],32:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2013 Billy Tetrud - Free to use for any purpose: MIT License*/

var path = _dereq_('path')
var Url = _dereq_("url")

var proto = _dereq_('proto')
var Future = _dereq_('async-future')
var SourceMapConsumer = _dereq_('source-map').SourceMapConsumer

var processResults = _dereq_('./processResults')
var isRelative = _dereq_('./isRelative')

// returns a module intended for a specific environment (that environment being described by the options)
// options can contain:
    // initialization - a function run once that can setup things (like a global error handler).
        // Gets a single parameter 'state' which has the following form:
            // unhandledErrorHandler(error,warn)
    // initializeMainTest - a function run once that can setup things (like a test-specific handler).
        // Gets a single parameter 'mainTestState' which has the following form:
            // unhandledErrorHandler(error,warn) - the error handler for that test
    // getDomain - a function that returns the current domain, or undefined if the environment (*cough* browsers) doesn't have domains
    // getSourceMapObject - a function that returns a future of the pre-parsed source map object for a file, or future undefined
        // gets the parameter:
            // url - the url of the file to find a sourcemap for
            // warningHandler - a warningHandler function that expects an error to be passed to it
    // runTestGroup - a function run that allows you to wrap the actual test run in some way (intended for node.js domains)
        // gets parameters:
            // state - the same state object sent into `initialization`
            // tester - a UnitTester object for the test
            // runTest - the function that you should call to run the test group. Already has a synchronous try catch inside it (so you don't need to worry about that)
            // handleError - a function that handles an error if one comes up. Takes the error as its only parameter. Returns a future.
    // mainTestDone - a function run once a test is done
        // gets the 'mainTestState' parameter
    // defaultUnhandledErrorHandler - a function that handles an error unhandled by any other handler
        // gets the 'error' as its only parameter
    // defaultTestErrorHandler - is passed the current test, and should return a function that handles an error
module.exports = function(options) {

    // a variable that holds changeable state
    var state = {
        unhandledErrorHandler: options.defaultUnhandledErrorHandler
    }

    options.initialize(state)

    // the prototype of objects used to manage accessing and displaying results of a unit test
    var UnitTest = proto(function() {
        this.init = function(/*mainName=undefined, groups*/) {
            var that = this
            var args = arguments
            this.manager = EventManager(this)

            setTimeout(function() {
                runTest.call(that, args)
            },0)
        }

        this.events = function(handlers) {
            this.manager.add(handlers, options.getDomain())
            return this
        }

        this.results = function() {
            return processResults(this)
        }

        // private

        function runTest(args) {
            var fakeTest = new UnitTester()
                fakeTest.id = undefined // fake test doesn't get an id
                fakeTest.manager = this.manager
                fakeTest.timeouts = []
                fakeTest.onDoneCallbacks = []

                var getUnhandledErrorHandler = function() {
                    var unhandledErrorHandler = createUnhandledErrorHandler(fakeTest.mainSubTest)
                    getUnhandledErrorHandler = function() { // memoize this junk
                        return unhandledErrorHandler
                    }
                    return unhandledErrorHandler
                }
                fakeTest.mainTestState = {get unhandledErrorHandler(){return getUnhandledErrorHandler() || options.defaultTestErrorHandler(fakeTest)}}

                var warningInfoMessageHasBeenOutput = false
                this.manager.testObject.warningHandler = fakeTest.warningHandler = function(w) {
                    var errorHandler = getUnhandledErrorHandler()
                    if(warningInfoMessageHasBeenOutput === false) {
                        var warning = newError("You've received at least one warning. If you don't want to treat warnings as errors, use the `warning` method to redefine how to handle them.")
                        errorHandler(warning, false)
                        warningInfoMessageHasBeenOutput = true
                    }

                    errorHandler(w, false)
                }

                options.initializeMainTest(fakeTest.mainTestState)

                timeout(fakeTest, 3000, true) // initial (default) timeout
                fakeTest.onDone = function() { // will execute when this test is done
                    fakeTest.manager.lastEmitFuture.then(function() { // wait for all the already-registered emits to emit before finalizing the test
                        done(fakeTest)
                        options.mainTestDone(fakeTest.mainTestState)
                    }).done()
                }
                fakeTest.callOnDone = function(cb) {
                    fakeTest.onDoneCallbacks.push(cb)
                }

            UnitTester.prototype.test.apply(fakeTest, args) // set so the error handler can access the real test
            this.mainTester = fakeTest
            this.parentTester = fakeTest

            fakeTest.groupEnded = true
            checkGroupDone(fakeTest)
        }
    })

    var EventManager = proto(function() {

        this.init = function(testObject) {
            this.handlers = {
                group: [],
                assert: [],
                count: [],
                exception: [],
                log: [],
                end: [],
                groupEnd: [],
                before: [],
                after: [],
                beforeEnd: [],
                afterEnd: []
            }

            this.history = []
            this.emitDepth = 0 // records how many futures are waiting on eachother, so we can make sure maximum stack depth isn't exceeded
            this.lastEmitFuture = Future(undefined)
            this.testObject = testObject
        }

        this.testObject; // used to get the right warningHandler

        // emits an event
        // eventDataFuture resolves to either an eventData object, or undefined if nothing should be emitted
        this.emit = function(type, eventDataFuture) {
            var that = this
            var lastEmitFuture = that.lastEmitFuture // capture it for the possible setTimeout threadlet
            var doStuff = function(f) {
                var resultFuture = lastEmitFuture.then(function() {
                    return eventDataFuture
                }).then(function(eventData){
                    if(eventData !== undefined)
                        recordAndTriggerHandlers.call(that, type, eventData)
                }).catch(function(e) {
                    that.testObject.warningHandler(e)
                })

                if(f !== undefined) {
                    resultFuture.finally(function() {
                        setTimeout(function(){f.return()},0) // make sure we don't get a "too much recursion error" // todo: test not doing this once browsers all support proper tail calls
                    })
                    return f
                } else {
                    return resultFuture
                }
            }

            this.emitDepth++
            if(this.emitDepth % 40 === 0) { // 40 seems to be the magic number here for firefox - such a finicky browser
                that.lastEmitFuture = doStuff(new Future)
            } else {
                that.lastEmitFuture = doStuff()
            }

            return this.lastEmitFuture
        }

        // adds a set of listening handlers to the event stream, and runs those handlers on the stream's history
        // domain is optional, but if defined will be the node.js domain that unhandled errors will be routed to
        this.add = function(handlers, domain) {
            // run the history of events on the the handlers
            this.history.forEach(function(e) {
                if(handlers[e.type] !== undefined) {
                    handlers[e.type].call(undefined, e.data)
                }
            })

            // then have those handlers listen on future events
            for(var type in handlers) {
                var typeHandlers = this.handlers[type]
                if(typeHandlers === undefined) {
                    throw new Error("event type '"+type+"' invalid")
                }

                typeHandlers.push({handler: handlers[type], domain: domain})
            }
        }

        // the synchronous part of emitting
        function recordAndTriggerHandlers(type, eventData) {
            this.history.push({type:type, data: eventData})
            this.handlers[type].forEach(function(handlerInfo) {
                try {
                    handlerInfo.handler.call(undefined, eventData)
                } catch(e) {

                    // throw error asynchronously because these error should be separate from the test exceptions
                    var throwErrorFn = options.throwAsyncException

                    if(handlerInfo.domain) {
                        throwErrorFn = handlerInfo.domain.bind(throwErrorFn)    // this domain bind is needed because emit is done inside deadunit's test domain, which isn't where we want to put errors caused by the event handlers
                    }

                    throwErrorFn(e)
                }
            })
        }
    })

    function testGroup(tester, test) {

        // handles any error (synchronous or asynchronous errors)
        var handleError = createUnhandledErrorHandler(tester)

        var runTest = function() {
            try {
                test.call(tester, tester) // tester is both 'this' and the first parameter (for flexibility)
            } catch(e) {
                handleError(e, true).done()
            }
         }

        options.runTestGroup(state, tester, runTest, handleError)
    }

    function createUnhandledErrorHandler(tester) {

        var handleErrorInErrorHandler = function(warn, newError) {
            var textForOriginalError = newError.stack?newError.stack:newError

            if(warn !== false) {
                try {
                    tester.warningHandler(newError)
                } catch(warningHandlerError) {
                    var warningHandlerErrorText = warningHandlerError.stack?warningHandlerError.stack:warningHandlerErro

                    var errorception = new Error("An error happened in the error handler: "+warningHandlerErrorText+"\n"+textForOriginalError)
                    tester.manager.emit('exception', Future(errorception)).done() // if shit gets this bad, that sucks
                }
            } else {
                console.error(textForOriginalError)
            }
        }

        // warn should be set to false if the handler is being called to report a warning
        return function(e, warn) {
            if(tester.unhandledErrorHandler !== undefined) {
                try {
                    tester.unhandledErrorHandler(e)
                    return Future(undefined)

                } catch(newError) {     // error handler had an error...
                    handleErrorInErrorHandler(warn, newError)
                }
            }
            // else

            var errorToEmit = mapException(e, tester.warningHandler).catch(function(newError) {
                if(newError.message !== "Accessing the 'caller' property of a function or arguments object is not allowed in strict mode") { // stacktrace.js doesn't support IE for certain things
                    handleErrorInErrorHandler(warn, newError)
                }
                return Future(e) // use the original unmapped exception

            }).then(function(exception){
                return Future(exceptionEmitData(tester,exception))
            })

            var emitFuture = tester.manager.emit('exception', errorToEmit)
            return afterWaitingEmitIsComplete(tester, emitFuture)

        }
    }

    function exceptionEmitData(tester, e) {
        return {
            parent: tester.id,
            time: now(),
            error: e
        }
    }


    // the prototype of objects used to write tests and contain the results of tests
    var UnitTester = function(name, mainTester, parentTester) {
        if(!mainTester) mainTester = this

        this.id = groupid()
        this.mainTester = mainTester // the mainTester is used to easily figure out if the test results have been accessed (so early accesses can be detected)
        this.parentTester = parentTester // used to reset timeouts
        this.name = name

        this.doneTests = 0
        this.doneAsserts = 0
        this.runningTests = 0 // the number of subtests created synchronously
        this.doneCalled = false
        this.doSourcemappery = true // whether to do source mapping, if possible, within this test

        this.complete = new Future // resolved when done
    }

        UnitTester.prototype = {
            test: function() {
                if(arguments.length === 1) {
                    var test = arguments[0]

                // named test
                } else {
                    var name = arguments[0]
                    var test = arguments[1]
                }

                var that = this
                this.runningTests++

                var tester = new UnitTester(name, this.mainTester, this)
                tester.manager = this.manager
                tester.doSourcemappery = this.doSourcemappery // inherit from parent test
                tester.warningHandler = this.warningHandler

                if(this.id === undefined) { // ie its the top-level fake test
                    this.mainSubTest = tester
                }

                tester.onDone = function() { // will execute when this test is done
                    that.doneTests += 1

                    that.manager.emit('groupEnd', Future({
                        id: tester.id,
                        time: now()
                    }))

                    try {
                        tester.complete.return()
                    } catch(e) {
                        createUnhandledErrorHandler(tester)(e)
                    }

                    checkGroupDone(that)
                }

                tester.mainTester.callOnDone(function() {
                    if(!tester.doneCalled) { // a timeout happened - end the test
                        tester.doneCalled = true
                        that.manager.emit('groupEnd', Future({
                            id: tester.id,
                            time: now()
                        }))
                    }
                })

                this.manager.emit('group', Future({
                    id: tester.id,
                    parent: this.id,
                    name: name,
                    time: now()
                }))

                if(this.beforeFn) {
                    this.manager.emit('before', Future({
                        parent: tester.id,
                        time: now()
                    }))

                    this.beforeFn.call(this, this)

                    this.manager.emit('beforeEnd', Future({
                        parent: tester.id,
                        time: now()
                    }))
                }

                testGroup(tester, test)

                if(this.afterFn) {
                    this.manager.emit('after', Future({
                        parent: tester.id,
                        time: now()
                    }))

                    this.afterFn.call(this, this)

                    this.manager.emit('afterEnd', Future({
                        parent: tester.id,
                        time: now()
                    }))
                }

                tester.groupEnded = true
                checkGroupDone(tester)

                return tester
            },

            ok: function(success, actualValue, expectedValue) {
                this.doneAsserts += 1
                afterWaitingEmitIsComplete(this, assert(this, success, actualValue, expectedValue, 'assert', "ok")).done()
            },
            eq: function(actualValue, expectedValue) {
                this.doneAsserts += 1
                afterWaitingEmitIsComplete(this, assert(this, expectedValue === actualValue, actualValue, expectedValue, 'assert', "eq")).done()
            },
            count: function(number) {
                if(this.countExpected !== undefined)
                    throw Error("count called multiple times for this test")
                this.countExpected = number

                afterWaitingEmitIsComplete(this,assert(this, undefined, undefined, number, 'count', "count")).done()
            },

            before: function(fn) {
                if(this.beforeFn !== undefined)
                    throw Error("before called multiple times for this test")

                this.beforeFn = fn
            },
            after: function(fn) {
                if(this.afterFn !== undefined)
                    throw Error("after called multiple times for this test")

                this.afterFn = fn
            },

            log: function(/*arguments*/) {
                this.manager.emit('log', Future({
                    parent: this.id,
                    time: now(),
                    values: Array.prototype.slice.call(arguments, 0)
                }))
            },

            timeout: function(t) {
                timeout(this, t, false)
            },

            error: function(handler) {
                this.unhandledErrorHandler = handler
            },
            warning: function(handler) {
                this.warningHandler = handler
            },

            sourcemap: function(doSourcemappery) {
                this.doSourcemappery = doSourcemappery
            }
        }

    function afterWaitingEmitIsComplete(that, assertFuture) {
        return assertFuture.finally(function() {
            checkGroupDone(that)
        })
    }

    function checkGroupDone(group) {
        if(!group.doneCalled && group.groupEnded === true
            && ((group.countExpected === undefined || group.countExpected <= group.doneAsserts+group.doneTests)
                && group.runningTests === group.doneTests)
        ) {
            group.doneCalled = true // don't call twice
            group.onDone()
        }

    }

    function done(unitTester) {
        if(unitTester.mainTester.ended) {
            unitTester.mainTester.manager.emit('exception', Future({
                parent: unitTester.mainTester.mainSubTest.id,
                time: now(),
                error: newError("done called more than once (probably because the test timed out before it finished)")
            }))
        } else {
            unitTester.mainTester.timeouts.forEach(function(to) {
                clearTimeout(to)
            })
            unitTester.mainTester.timeouts = []

            endTest(unitTester, 'normal')
        }
    }

    function timeout(unitTester, t, theDefault) {
        var timeouts = unitTester.mainTester.timeouts

        unitTester.timeoutTime = t

        if(theDefault) {
            timeouts.defaultTimeout = true
        } else if(unitTester === unitTester.mainTester && timeouts.defaultTimeout) { // if a timeout is the default, it can be overridden
            clearTimeout(unitTester.timeoutHandle)
            remove(timeouts, unitTester.timeoutHandle)
            timeouts.defaultTimeout = undefined
            delete unitTester.timeoutHandle
        }

        setTesterTimeout(unitTester)
    }

    // sets or resets a timeout for a unitTester
    function setTesterTimeout(unitTester) {
        var timeouts = unitTester.mainTester.timeouts
        if(unitTester.timeoutHandle !== undefined) {
            clearTimeout(unitTester.timeoutHandle)
            remove(timeouts, unitTester.timeoutHandle)
        }

        unitTester.timeoutHandle = setTimeout(function() {
            remove(timeouts, unitTester.timeoutHandle)
            delete unitTester.timeoutHandle

            if(timeouts.length === 0 && !unitTester.mainTester.ended) {
                endTest(unitTester.mainTester, 'timeout')
            }
        }, unitTester.timeoutTime)

        timeouts.push(unitTester.timeoutHandle)
    }

    // removes an item from an array
    function remove(array, item) {
        var index = array.indexOf(item)
        if(index !== -1)
            array.splice(index, 1) // no longer throwing Error("Item doesn't exist to remove") if there's nothing to remove - in the case that mainTester.timeouts gets set back to [] (when done), it won't be there

    }

    function endTest(that, type) {
        that.mainTester.ended = true

        if(that.mainTester === that) { // if its the main tester
            that.onDoneCallbacks.forEach(function(cb) {
                cb()
            })
        }

        setTimeout(function() { // setTimeout here is to make it so the currently running threadlet that caused the test to end can finish before the end event is sent
            that.manager.emit('end', Future({
                type: type,
                time: now()
            }))
        },0)
    }

    // type - either "count" or "assert"
    function assert(that, success, actualValue, expectedValue, type, functionName/*="ok"*/, lineInfo/*=dynamic*/, stackIncrease/*=0*/) {
        if(!stackIncrease) stackIncrease = 1
        if(!functionName) functionName = "ok"
        if(!lineInfo)
            var lineInfoFuture = getLineInformation(functionName, stackIncrease, that.doSourcemappery, that.warningHandler)
        else
            var lineInfoFuture = Future(lineInfo)

        // reste timeouts up the chain
        var cur = that
        while(cur !== undefined) {
            setTesterTimeout(cur)
            cur = cur.parentTester
        }

        var emitData = lineInfoFuture.then(function(lineInfo) {
            var result = lineInfo
            result.type = 'assert'
            if(type !=='count') result.success = success === true

            if(actualValue !== undefined)     result.actual = actualValue
            if(expectedValue !== undefined)   result.expected = expectedValue

            result.parent = that.id
            result.time = now()

           return Future(result)
        })

        return that.manager.emit(type, emitData)
    }


    function getLineInformation(functionName, stackIncrease, doSourcemappery, warningHandler) {

        var file, line, column, lineinfo;
        return options.getLineInfo(stackIncrease).then(function(info){
            lineinfo = info
            return getSourceMapConsumer(info.file, warningHandler)
        }).catch(function(e){
            warningHandler(e)
            return Future(undefined)

        }).then(function(sourceMapConsumer) {
            if(sourceMapConsumer !== undefined && doSourcemappery) {

                var mappedInfo = getMappedSourceInfo(sourceMapConsumer, lineinfo.file, lineinfo.line, lineinfo.column)
                file = mappedInfo.file
                line = mappedInfo.line
                column = mappedInfo.column
                var sourceLines = mappedInfo.sourceLines

                var multiLineSearch = !mappedInfo.usingOriginalFile // don't to a multi-line search if the source has been mapped (the file might not be javascript)
            } else {
                file = lineinfo.file
                line = lineinfo.line
                column = lineinfo.column
                var sourceLines = undefined
                var multiLineSearch = true
            }

            return getFunctionCallLines(sourceLines, file, functionName, line, multiLineSearch, warningHandler)

        }).catch(function(e) {
            warningHandler(e)
            return Future("<source not available>")
        }).then(function(sourceLines) {
            return Future({
                sourceLines: sourceLines,
                file: path.basename(file),
                line: line,
                column: column
            })
        })
    }

    // returns the line, column, and filename mapped from a source map
    // appropriately handles cases where some information is missing
    function getMappedSourceInfo(sourceMapConsumer, originalFilePath, originalLine, originalColumn, originalFunctionName) {
        var sourceMapInfo = sourceMapConsumer.originalPositionFor({line:originalLine, column:originalColumn||0})       // the 0 is for browsers (like firefox) that don't output column numbers
        var line = sourceMapInfo.line
        var column = sourceMapInfo.column
        var fn = sourceMapInfo.name

        if(sourceMapInfo.source !== null) {
            var relative = isRelative(sourceMapInfo.source)

            /* I don't think this is needed any longer, and probably isn't correct - this was working around an issue in webpack: See https://github.com/webpack/webpack/issues/559 and https://github.com/webpack/webpack/issues/238
            if(sourceMapConsumer.sourceRoot !== null) {
                sourceMapInfo.source = sourceMapInfo.source.replace(sourceMapConsumer.sourceRoot, '') // remove sourceRoot
            }*/

            if(relative) {
                var file = Url.resolve(originalFilePath, path.basename(sourceMapInfo.source))
            } else {
                var file = sourceMapInfo.source
            }


            var originalFile = true
        } else {
            var file = originalFilePath
            var originalFile = false
        }

        if(fn === null || !originalFile) {
            fn = originalFunctionName
        }
        if(line === null || !originalFile) {
            line = originalLine
            column = originalColumn
        }
        if(column === null) {
            column = undefined
        }

        if(file != undefined && sourceMapConsumer.sourcesContent != undefined) { // intentional single !=
            var index = sourceMapConsumer.sources.indexOf(file)
            var sourceLines = sourceMapConsumer.sourcesContent[index]
            if(sourceLines !== undefined) sourceLines = sourceLines.split('\n')
        }

        return {
            file: file,
            function: fn,
            line: line,
            column: column,
            usingOriginalFile: originalFile,
            sourceLines: sourceLines
        }
    }

    // gets the actual lines of the call
    // if multiLineSearch is true, it finds
    function getFunctionCallLines(sourcesContent, filePath, functionName, lineNumber, multiLineSearch, warningHandler) {
        if(sourcesContent !==  undefined) {
            var source = Future(sourcesContent)
        } else {
            var source = options.getScriptSourceLines(filePath)
        }
        return source.catch(function(e) {
            warningHandler(e)
            return Future(undefined)

        }).then(function(fileLines) {
            if(fileLines !== undefined) {

                var startLine = findStartLine(fileLines, functionName, lineNumber)
                if(startLine === 'lineOfCodeNotFound') {
                    return Future("<line of code not found (possibly an error?)> ")

                } else if(startLine !== 'sourceNotAvailable') {
                    if(multiLineSearch) {
                        return Future(findFullSourceLine(fileLines, startLine))
                    } else {
                        return Future(fileLines[startLine].trim())
                    }
                }
            }
            // else
            return Future("<source not available>")

        })
    }

    var sourceMapConsumerCache = {} // a map from a script url to a future of its SourceMapConsumer object (null means no sourcemap exists)
    function getSourceMapConsumer(url, warningHandler) {
        if(sourceMapConsumerCache[url] === undefined) {
            try {
                sourceMapConsumerCache[url] = options.getSourceMapObject(url, warningHandler).then(function(sourceMapObject) {
                    if(sourceMapObject !== undefined) {
                        if(sourceMapObject.version === undefined) {
                            warningHandler(new Error("Sourcemap for "+url+" doesn't contain the required 'version' property. Assuming version 2."))
                            sourceMapObject.version = 2 // assume version 2 to make browserify's broken sourcemap format that omits the version
                        }
                        return Future(new SourceMapConsumer(sourceMapObject))
                    } else {
                        return Future(undefined)
                    }
                })
            } catch(e) {
                sourceMapConsumerCache[url] = Future(undefined)
                warningHandler(e)
            }
        }

        return sourceMapConsumerCache[url]
    }

    // takes an exception and returns a future exception that has a stacktrace with sourcemapped tracelines
    function mapException(exception, warningHandler) {
        try {
            if(exception instanceof Error) {
                var stacktrace;
                return options.getExceptionInfo(exception).then(function(trace){
                    stacktrace = trace

                    var smcFutures = []
                    for(var n=0; n<trace.length; n++) {
                        if(trace[n].file !== undefined) {
                            smcFutures.push(getSourceMapConsumer(trace[n].file, warningHandler))
                        } else {
                            smcFutures.push(Future(undefined))
                        }
                    }

                    return Future.all(smcFutures)
                }).then(function(sourceMapConsumers) {
                    var CustomMappedException = proto(MappedException, function() {
                        // set the name so it looks like the original exception when printed
                        // this subclasses MappedException so that name won't be an own-property
                        this.name = exception.name
                    })

                    try {
                        throw CustomMappedException(exception, stacktrace, sourceMapConsumers)  // IE doesn't give exceptions stack traces unless they're actually thrown
                    } catch(mappedExcetion) {
                        return Future(mappedExcetion)
                    }
                })
            } else {
                return Future(exception)
            }
        } catch(e) {
            var errorFuture = new Future
            errorFuture.throw(e)
            return errorFuture
        }
    }

    // an exception where the stacktrace's files and lines are mapped to the original file (when applicable)
    var MappedException = proto(Error, function(superclass) {

        // constructor. Takes the parameters:
            // originalError
            // traceInfo - an array where each element is an object containing information about that stacktrace line
            // sourceMapConsumers - an array of the same length as traceInfo where each element is the sourcemap consumer for the corresponding info in traceInfo
        this.init = function(originalError, traceInfo, sourceMapConsumers) {
            superclass.call(this, originalError.message)

            for(var p in originalError) {
                if(Object.hasOwnProperty.call(originalError, p)) {
                    try {
                        this[p] = originalError[p]
                    } catch(e) {
                        console.log("Error setting property "+p+' with value '+originalError[p])
                    }
                }
            }

            var newTraceLines = []
            for(var n=0; n<traceInfo.length; n++) {
                var info = traceInfo[n]
                if(sourceMapConsumers[n] !== undefined) {
                    info = getMappedSourceInfo(sourceMapConsumers[n], info.file, info.line, info.column, info.function)
                }

                var fileLineColumn = info.line
                if(info.column !== undefined) {
                    fileLineColumn += ':'+info.column
                }
                if(info.file !== undefined) {
                    fileLineColumn = info.file+':'+fileLineColumn
                }

                var traceLine = "    at "
                if(info.function !== undefined) {
                    traceLine += info.function+' ('+fileLineColumn+')'
                } else {
                    traceLine += fileLineColumn
                }

                newTraceLines.push(traceLine)
            }

            Object.defineProperty(this, 'stack', {
                get: function() {
                    return this.name+': '+this.message+'\n'+newTraceLines.join('\n')
                }
            })
        }
    })

    // attempts to find the full function call expression (over multiple lines) given the sources lines and a starting point
    function findFullSourceLine(fileLines, startLine) {
        var lines = []
        var parenCount = 0
        var mode = 0 // mode 0 for paren searching, mode 1 for double-quote searching, mode 2 for single-quote searching
        var lastWasBackslash = false // used for quote searching
        for(var n=startLine; n<fileLines.length; n++) {
            var line = fileLines[n]
            lines.push(line.trim())

            for(var i=0; i<line.length; i++) {
                var c = line[i]

                if(mode === 0) {
                    if(c === '(') {
                        parenCount++
                        //if(parenCount === 0) {
                          //  return lines.join('\n') // done
                        //}
                    } else if(c === ')' && parenCount > 0) {
                        parenCount--
                        if(parenCount === 0) {
                            return lines.join('\n') // done
                        }
                    } else if(c === '"') {
                        mode = 1
                    } else if(c === "'") {
                        mode = 2
                    }
                } else if(mode === 1) {
                    if(c === '"' && !lastWasBackslash) {
                        mode = 0
                    }

                    lastWasBackslash = c==='\\'
                } else { // mode === 2
                    if(c === "'" && !lastWasBackslash) {
                        mode = 0
                    }

                    lastWasBackslash = c==='\\'
                }
            }
        }

        return lines.join('\n') // if it gets here, something minor went wrong
    }

    // finds the line a function started on given the file's lines, and the stack trace line number (and function name)
    // returns undefined if something went wrong finding the startline
    function findStartLine(fileLines, functionName, lineNumber) {
        var startLine = lineNumber - 1
        while(true) {
            if(startLine < 0) {
                return 'lineOfCodeNotFound' // something went wrong if this is being returned (the functionName wasn't found above - means you didn't get the function name right)
            }

            var line = fileLines[startLine]
            if(line === undefined) {
                return 'sourceNotAvailable'
            }

            //lines.push(line.trim())
            var containsFunction = line.indexOf(functionName) !== -1
            if(containsFunction) {
                return startLine
            }

            startLine--
        }
    }

    function groupid() {
        groupid.next++
        return groupid.next
    }
    groupid.next = -1

    // returns a Unix Timestamp for now
    function now() {
        return (new Date()).getTime()
    }

    return {
        test: UnitTest
    }
}

function newError(message, ErrorPrototype) {
    try {
        throw new Error(message) // IE needs an exception to be actually thrown to get a stack trace property
    } catch(e) {
        return e
    }
}

},{"./isRelative":33,"./processResults":34,"async-future":4,"path":7,"proto":8,"source-map":15,"url":29}],33:[function(_dereq_,module,exports){
var path = _dereq_('path')

module.exports = function isRelative(p) {
    var normal = path.normalize(p)
    var absolute = path.resolve(p)
    return normal != absolute && p.indexOf('://') === -1// second part for urls
}
},{"path":7}],34:[function(_dereq_,module,exports){
module.exports = function returnResults(unitTestObject) {

    var results;
    var groups = {}
    var groupMetadata = {}

    var primaryGroup;
    var ended = false

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
            e.type = 'assert'
            groups[e.parent].results.push(e)
            setGroupDuration(e.parent, e.time)
        },
        count: function(e) {
            e.type = 'assert'
            setGroupDuration(e.parent, e.time)

            groupMetadata[e.parent].countInfo = e
        },
        exception: function(e) {
            groups[e.parent].exceptions.push(e.error)
            setGroupDuration(e.parent, e.time)
        },
        log: function(e) {
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
        },
        end: function(e) {
            primaryGroup.timeout = e.type === 'timeout'
            setGroupDuration(primaryGroup.id, e.time)

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

                    subtest.results.splice(0,0,{
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
        var newDuration = time - groups[groupid].time
        if(newDuration > groups[groupid].duration) {
            groups[groupid].duration = newDuration
        }

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
},{}]},{},[30])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkQ6XFxiaWxseXNGaWxlXFxjb2RlXFxtb2R1bGVzXFxkZWFkdW5pdENvcmVcXG5vZGVfbW9kdWxlc1xcYnJvd3Nlci1wYWNrXFxfcHJlbHVkZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYWpheC9hamF4LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9hamF4L25vZGVfbW9kdWxlcy9hc3luYy1mdXR1cmUvYXN5bmNGdXR1cmUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2FtZGVmaW5lL2FtZGVmaW5lLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9hc3luYy1mdXR1cmUvYXN5bmNGdXR1cmUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9wcm90by9wcm90by5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2RlY29kZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2VuY29kZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2luZGV4LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9yZXNvbHZlLXVybC9yZXNvbHZlLXVybC5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC1yZXNvbHZlL3NvdXJjZS1tYXAtcmVzb2x2ZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC11cmwvc291cmNlLW1hcC11cmwuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYXJyYXktc2V0LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL2Jhc2U2NC12bHEuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYmFzZTY0LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL2JpbmFyeS1zZWFyY2guanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvc291cmNlLW1hcC1jb25zdW1lci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9zb3VyY2UtbWFwLWdlbmVyYXRvci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9zb3VyY2Utbm9kZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC91dGlsLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja2luZm8vZXhjZXB0aW9uTW9kZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2tpbmZvL3N0YWNraW5mby5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2tpbmZvL3RyYWNlbGluZVBhcnNlci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1qcy9zdGFja3RyYWNlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy90cmltQXJndW1lbnRzL3RyaW1Bcmd1bWVudHMuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3VybC91cmwuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvbW9kdWxlcy9kZWFkdW5pdENvcmUvc3JjL2RlYWR1bml0Q29yZS5icm93c2VyLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL3NyYy9kZWFkdW5pdENvcmUuYnJvd3NlckNvbmZpZy5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9tb2R1bGVzL2RlYWR1bml0Q29yZS9zcmMvZGVhZHVuaXRDb3JlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL3NyYy9pc1JlbGF0aXZlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL21vZHVsZXMvZGVhZHVuaXRDb3JlL3NyYy9wcm9jZXNzUmVzdWx0cy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25ZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25zQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3I2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBGdXR1cmUgPSByZXF1aXJlKFwiYXN5bmMtZnV0dXJlXCIpXG5cbi8vIHJldHVybnMgdGhlIFhIUiBmdW5jdGlvbiBvciBlcXVpdmFsZW50IGZvciB1c2Ugd2l0aCBhamF4XG4vLyBtZW1vaXplcyB0aGUgZnVuY3Rpb24gZm9yIGZhc3RlciByZXBlYXRlZCB1c2VcbnZhciBjcmVhdGVYTUxIVFRQT2JqZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZlcnNpb25zID0gW1wiTXN4bWwyLlhNTEhUVFBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNc3htbDMuWE1MSFRUUFwiLFxuICAgICAgICAgICAgICAgICAgICBcIk1pY3Jvc29mdC5YTUxIVFRQXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuNi4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuNS4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuNC4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuMy4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuMi4wXCJcbiAgICBdXG5cbiAgICBpZihYTUxIdHRwUmVxdWVzdCAhPT0gdW5kZWZpbmVkKSB7ICAvLyBGb3Igbm9uLUlFIGJyb3dzZXJzXG4gICAgICAgIGNyZWF0ZVhNTEhUVFBPYmplY3QgPSBmdW5jdGlvbigpIHsgIC8vIFVzZSBtZW1vaXphdGlvbiB0byBjYWNoZSB0aGUgZmFjdG9yeVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZVhNTEhUVFBPYmplY3QoKVxuXG4gICAgfSBlbHNlIHsgLy8gSUVcbiAgICAgICAgZm9yKHZhciBpPTAsIG49dmVyc2lvbnMubGVuZ3RoOyBpPG47IGkrKykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgdmVyc2lvbiA9IHZlcnNpb25zW2ldXG4gICAgICAgICAgICAgICAgdmFyIGZuID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCh2ZXJzaW9uKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjcmVhdGVYTUxIVFRQT2JqZWN0ID0gZm4gICAvLyBVc2UgbWVtb2l6YXRpb24gdG8gY2FjaGUgdGhlIGZhY3RvcnlcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlWE1MSFRUUE9iamVjdCgpXG5cbiAgICAgICAgICAgIH0gY2F0Y2goZSkgeyAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcignQ2FudCBnZXQgWG1sSHR0cFJlcXVlc3Qgb2JqZWN0Jylcbn1cblxuXG5cbnZhciBIRUFERVIgPSBcIihbXlxcXFxzXSspOiAoLiopXCJcblxuLy8gcmV0dXJucyB0aGUgY29udGVudHMgYW5kIGhlYWRlcnMgZnJvbSBhIGdpdmVuIFVSTFxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odXJsKSB7XG4gICAgaWYoZ2V0RnJvbUNhY2hlKHVybCkpXG4gICAgICAgIHJldHVybiBnZXRGcm9tQ2FjaGUodXJsKVxuXG4gICAgdmFyIGZ1dHVyZVJlc3VsdCA9IG5ldyBGdXR1cmVcbiAgICBzZXRPbkNhY2hlKHVybCwgZnV0dXJlUmVzdWx0KVxuXG4gICAgdmFyIHJlcSA9IGNyZWF0ZVhNTEhUVFBPYmplY3QoKVxuICAgIHJlcS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYoIHJlcS5yZWFkeVN0YXRlID09PSA0ICkge1xuICAgICAgICAgICAgaWYoIHJlcS5zdGF0dXMgPT09IDIwMCApIHtcbiAgICAgICAgICAgICAgICB2YXIgaGVhZGVycyA9IHt9XG4gICAgICAgICAgICAgICAgcmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpLnNwbGl0KCdcXG4nKS5mb3JFYWNoKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gbGluZS5tYXRjaChIRUFERVIpXG4gICAgICAgICAgICAgICAgICAgIGlmKG1hdGNoICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmFtZSA9IG1hdGNoWzFdXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBtYXRjaFsyXVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkZXJzW25hbWVdID0gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICBmdXR1cmVSZXN1bHQucmV0dXJuKHt0ZXh0OiByZXEucmVzcG9uc2VUZXh0LCBoZWFkZXJzOiBoZWFkZXJzfSlcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ0Vycm9yIGluIHJlcXVlc3Q6IFN0YXR1cyAnK3JlcS5zdGF0dXMpXG4gICAgICAgICAgICAgICAgZXJyb3Iuc3RhdHVzID0gcmVxLnN0YXR1c1xuICAgICAgICAgICAgICAgIGZ1dHVyZVJlc3VsdC50aHJvdyhlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlcS5vbmVycm9yID0gZnVuY3Rpb24oZSkge1xuICAgICAgICBmdXR1cmVSZXN1bHQudGhyb3coZSlcbiAgICB9XG5cblxuICAgIHJlcS5vcGVuKCdHRVQnLCB1cmwsIGFzeW5jaHJvbm91cylcbiAgICB0cnkge1xuICAgICAgICByZXEuc2VuZCgpXG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGZ1dHVyZVJlc3VsdC50aHJvdyhlKVxuICAgIH1cblxuICAgIHJldHVybiBmdXR1cmVSZXN1bHRcbn1cblxudmFyIGNhY2hlID0ge31cbnZhciBnZXRGcm9tQ2FjaGUgPSBmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gY2FjaGVbdXJsXVxufVxudmFyIHNldE9uQ2FjaGUgPSBmdW5jdGlvbih1cmwsIGZ1dHVyZVJlc3BvbnNlKSB7XG4gICAgY2FjaGVbdXJsXSA9IGZ1dHVyZVJlc3BvbnNlXG59XG5cbnZhciBhc3luY2hyb25vdXMgPSB0cnVlXG5leHBvcnRzLnNldFN5bmNocm9ub3VzID0gZnVuY3Rpb24oc3luY2hyb25vdXMpIHsgLy8gdGhpcyBpcyBoZXJlIHNvIEkgY2FuIHdvcmsgYXJvdW5kIHRoaXMgYnVnIGluIGNocm9tZTogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTM2ODQ0NFxuICAgIGFzeW5jaHJvbm91cyA9ICFzeW5jaHJvbm91c1xufVxuXG5leHBvcnRzLmNhY2hlR2V0ID0gZnVuY3Rpb24oZm4pIHtcbiAgICBnZXRGcm9tQ2FjaGUgPSBmblxufVxuZXhwb3J0cy5jYWNoZVNldCA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgc2V0T25DYWNoZSA9IGZuXG59IiwiLyogQ29weXJpZ2h0IChjKSAyMDEzIEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xyXG5cclxudmFyIHRyaW1BcmdzID0gcmVxdWlyZShcInRyaW1Bcmd1bWVudHNcIilcclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZ1dHVyZVxyXG5cclxuRnV0dXJlLmRlYnVnID0gZmFsc2UgLy8gc3dpdGNoIHRoaXMgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBpZHMgYW5kIGxvbmcgc3RhY2sgdHJhY2VzXHJcblxyXG52YXIgY3VySWQgPSAwICAgICAgICAgLy8gZm9yIGlkc1xcXHJcbmZ1bmN0aW9uIEZ1dHVyZSh2YWx1ZSkge1xyXG5cdGlmKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcblx0XHR2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgICAgIGYucmV0dXJuKHZhbHVlKVxyXG4gICAgICAgIHJldHVybiBmXHJcblx0fSBlbHNlIHtcclxuICAgICAgICB0aGlzLmlzUmVzb2x2ZWQgPSBmYWxzZVxyXG4gICAgICAgIHRoaXMucXVldWUgPSBbXVxyXG4gICAgICAgIGlmKEZ1dHVyZS5kZWJ1Zykge1xyXG4gICAgICAgICAgICBjdXJJZCsrXHJcbiAgICAgICAgICAgIHRoaXMuaWQgPSBjdXJJZFxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gc3RhdGljIG1ldGhvZHNcclxuXHJcbi8vIGhhcyBvbmUgcGFyYW1ldGVyOiBlaXRoZXIgYSBidW5jaCBvZiBmdXR1cmVzLCBvciBhIHNpbmdsZSBhcnJheSBvZiBmdXR1cmVzXHJcbi8vIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBvbmUgb2YgdGhlbSBlcnJvcnMsIG9yIHdoZW4gYWxsIG9mIHRoZW0gc3VjY2VlZHNcclxuRnV0dXJlLmFsbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQXJyYXkpIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IGFyZ3VtZW50c1swXVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IHRyaW1BcmdzKGFyZ3VtZW50cylcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgdmFyIHJlc3VsdHMgPSBbXVxyXG5cclxuICAgIGlmKGZ1dHVyZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhciBjdXJyZW50ID0gZnV0dXJlc1swXVxyXG4gICAgICAgIGZ1dHVyZXMuZm9yRWFjaChmdW5jdGlvbihmdXR1cmUsIGluZGV4KSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0c1tpbmRleF0gPSB2XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnV0dXJlc1tpbmRleCsxXVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC8vaWZcclxuICAgICAgICBjdXJyZW50LmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLy8gZWxzZVxyXG4gICAgICAgIGN1cnJlbnQudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4ocmVzdWx0cylcclxuICAgICAgICB9KVxyXG5cclxuXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGYucmV0dXJuKHJlc3VsdHMpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gZWl0aGVyIHVzZWQgbGlrZSBmdXR1cmVXcmFwKGZ1bmN0aW9uKCl7IC4uLiB9KShhcmcxLGFyZzIsZXRjKSBvclxyXG4vLyAgZnV0dXJlV3JhcChvYmplY3QsICdtZXRob2ROYW1lJykoYXJnMSxhcmcyLGV0YylcclxuRnV0dXJlLndyYXAgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIGZ1bmN0aW9uXHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgdmFyIGZuID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgdmFyIG9iamVjdCA9IHVuZGVmaW5lZFxyXG5cclxuXHJcbiAgICAvLyBvYmplY3QsIGZ1bmN0aW9uXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBvYmplY3QgPSBhcmd1bWVudHNbMF1cclxuICAgICAgICB2YXIgZm4gPSBvYmplY3RbYXJndW1lbnRzWzFdXVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cylcclxuICAgICAgICB2YXIgZnV0dXJlID0gbmV3IEZ1dHVyZVxyXG4gICAgICAgIGFyZ3MucHVzaChmdXR1cmUucmVzb2x2ZXIoKSlcclxuICAgICAgICB2YXIgbWUgPSB0aGlzXHJcbiAgICAgICAgaWYob2JqZWN0KSBtZSA9IG9iamVjdFxyXG4gICAgICAgIGZuLmFwcGx5KG1lLCBhcmdzKVxyXG4gICAgICAgIHJldHVybiBmdXR1cmVcclxuICAgIH1cclxufVxyXG5cclxuXHJcbi8vIGRlZmF1bHRcclxudmFyIHVuaGFuZGxlZEVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcclxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdGhyb3cgZVxyXG4gICAgfSwwKVxyXG59XHJcblxyXG4vLyBzZXR1cCB1bmhhbmRsZWQgZXJyb3IgaGFuZGxlclxyXG4vLyB1bmhhbmRsZWQgZXJyb3JzIGhhcHBlbiB3aGVuIGRvbmUgaXMgY2FsbGVkLCBhbmQgIHRoZW4gYW4gZXhjZXB0aW9uIGlzIHRocm93biBmcm9tIHRoZSBmdXR1cmVcclxuRnV0dXJlLmVycm9yID0gZnVuY3Rpb24oaGFuZGxlcikge1xyXG4gICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gaGFuZGxlclxyXG59XHJcblxyXG4vLyBpbnN0YW5jZSBtZXRob2RzXHJcblxyXG4vLyByZXR1cm5zIGEgdmFsdWUgZm9yIHRoZSBmdXR1cmUgKGNhbiBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UpXHJcbi8vIGlmIHRoZXJlIGFyZSBjYWxsYmFja3Mgd2FpdGluZyBvbiB0aGlzIHZhbHVlLCB0aGV5IGFyZSBydW4gaW4gdGhlIG5leHQgdGlja1xyXG4gICAgLy8gKGllIHRoZXkgYXJlbid0IHJ1biBpbW1lZGlhdGVseSwgYWxsb3dpbmcgdGhlIGN1cnJlbnQgdGhyZWFkIG9mIGV4ZWN1dGlvbiB0byBjb21wbGV0ZSlcclxuRnV0dXJlLnByb3RvdHlwZS5yZXR1cm4gPSBmdW5jdGlvbih2KSB7XHJcbiAgICByZXNvbHZlKHRoaXMsICdyZXR1cm4nLCB2KVxyXG59XHJcbkZ1dHVyZS5wcm90b3R5cGUudGhyb3cgPSBmdW5jdGlvbihlKSB7XHJcbiAgICByZXNvbHZlKHRoaXMsICdlcnJvcicsIGUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldE5leHQodGhhdCwgZnV0dXJlKSB7XHJcbiAgICBpZihmdXR1cmUgIT09IHVuZGVmaW5lZCAmJiAhaXNMaWtlQUZ1dHVyZShmdXR1cmUpIClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIlZhbHVlIHJldHVybmVkIGZyb20gdGhlbiBvciBjYXRjaCAqbm90KiBhIEZ1dHVyZTogXCIrZnV0dXJlKVxyXG5cclxuICAgIHJlc29sdmUodGhhdCwgJ25leHQnLCBmdXR1cmUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdhaXQodGhhdCwgY2IpIHtcclxuICAgIGlmKHRoYXQuaXNSZXNvbHZlZCkge1xyXG4gICAgICAgIGV4ZWN1dGVDYWxsYmFja3ModGhhdCwgW2NiXSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhhdC5xdWV1ZS5wdXNoKGNiKVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBkdWNrIHR5cGluZyB0byBkZXRlcm1pbmUgaWYgc29tZXRoaW5nIGlzIG9yIGlzbid0IGEgZnV0dXJlXHJcbmZ1bmN0aW9uIGlzTGlrZUFGdXR1cmUoeCkge1xyXG4gICAgcmV0dXJuIHguaXNSZXNvbHZlZCAhPT0gdW5kZWZpbmVkICYmIHgucXVldWUgIT09IHVuZGVmaW5lZCAmJiB4LnRoZW4gIT09IHVuZGVmaW5lZFxyXG59XHJcblxyXG5mdW5jdGlvbiB3YWl0T25SZXN1bHQoZiwgcmVzdWx0LCBjYikge1xyXG4gICAgd2FpdChyZXN1bHQsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgZi50aHJvdyh0aGlzLmVycm9yKVxyXG4gICAgICAgIH0gZWxzZSBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgd2FpdE9uUmVzdWx0KGYsIHRoaXMubmV4dCwgY2IpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHNldE5leHQoZiwgY2IodGhpcy5yZXN1bHQpKVxyXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbn1cclxuXHJcblxyXG4vLyBjYiB0YWtlcyBvbmUgcGFyYW1ldGVyIC0gdGhlIHZhbHVlIHJldHVybmVkXHJcbi8vIGNiIGNhbiByZXR1cm4gYSBGdXR1cmUsIGluIHdoaWNoIGNhc2UgdGhlIHJlc3VsdCBvZiB0aGF0IEZ1dHVyZSBpcyBwYXNzZWQgdG8gbmV4dC1pbi1jaGFpblxyXG5GdXR1cmUucHJvdG90eXBlLnRoZW4gPSBmdW5jdGlvbihjYikge1xyXG4gICAgdmFyIGYgPSBuZXcgRnV0dXJlXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpXHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICBlbHNlIGlmKHRoaXMuaGFzTmV4dClcclxuICAgICAgICAgICAgd2FpdE9uUmVzdWx0KGYsIHRoaXMubmV4dCwgY2IpXHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGNiKHRoaXMucmVzdWx0KSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIGZcclxufVxyXG4vLyBjYiB0YWtlcyBvbmUgcGFyYW1ldGVyIC0gdGhlIGVycm9yIGNhdWdodFxyXG4vLyBjYiBjYW4gcmV0dXJuIGEgRnV0dXJlLCBpbiB3aGljaCBjYXNlIHRoZSByZXN1bHQgb2YgdGhhdCBGdXR1cmUgaXMgcGFzc2VkIHRvIG5leHQtaW4tY2hhaW5cclxuRnV0dXJlLnByb3RvdHlwZS5jYXRjaCA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmVcclxuICAgIHdhaXQodGhpcywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYodGhpcy5oYXNFcnJvcikge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgc2V0TmV4dChmLCBjYih0aGlzLmVycm9yKSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgIGYucmV0dXJuKHYpXHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIHNldE5leHQoZiwgY2IoZSkpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4odGhpcy5yZXN1bHQpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgbm8gcGFyYW1ldGVyc1xyXG4vLyBjYWxsYmFjaydzIHJldHVybiB2YWx1ZSBpcyBpZ25vcmVkLCBidXQgdGhyb3duIGV4Y2VwdGlvbnMgcHJvcG9nYXRlIG5vcm1hbGx5XHJcbkZ1dHVyZS5wcm90b3R5cGUuZmluYWxseSA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmVcclxuICAgIHdhaXQodGhpcywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzXHJcbiAgICAgICAgICAgIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID0gY2IoKVxyXG4gICAgICAgICAgICAgICAgICAgIGYucmV0dXJuKHYpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IGNiKClcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhcclxuICAgICAgICAgICAgICAgIH0pLmRvbmUoKVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgRnV0dXJlKHRydWUpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyh0aGF0LmVycm9yKVxyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgICAgIH0pLmRvbmUoKVxyXG5cclxuICAgICAgICAgICAgfSBlbHNlICB7XHJcbiAgICAgICAgICAgICAgICBGdXR1cmUodHJ1ZSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IoKVxyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnJldHVybih0aGF0LnJlc3VsdClcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuXHJcbi8vIGFsbCB1bnVzZWQgZnV0dXJlcyBzaG91bGQgZW5kIHdpdGggdGhpcyAoZS5nLiBtb3N0IHRoZW4tY2hhaW5zKVxyXG4vLyBkZXRhdGNoZXMgdGhlIGZ1dHVyZSBzbyBhbnkgcHJvcG9nYXRlZCBleGNlcHRpb24gaXMgdGhyb3duIChzbyB0aGUgZXhjZXB0aW9uIGlzbid0IHNpbGVudGx5IGxvc3QpXHJcbkZ1dHVyZS5wcm90b3R5cGUuZG9uZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcih0aGlzLmVycm9yKVxyXG4gICAgICAgIH0gZWxzZSBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgdGhpcy5uZXh0LmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbn1cclxuXHJcblxyXG5cclxuRnV0dXJlLnByb3RvdHlwZS5yZXNvbHZlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIG1lID0gdGhpc1xyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbihlLHYpIHtcclxuICAgICAgICBpZihlKSB7IC8vIGVycm9yIGFyZ3VtZW50XHJcbiAgICAgICAgICAgIG1lLnRocm93KGUpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbWUucmV0dXJuKHYpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5GdXR1cmUucHJvdG90eXBlLnJlc29sdmVkID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5pc1Jlc29sdmVkXHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiByZXNvbHZlKHRoYXQsIHR5cGUsIHZhbHVlKSB7XHJcbiAgICBpZih0aGF0LmlzUmVzb2x2ZWQpXHJcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJGdXR1cmUgcmVzb2x2ZWQgbW9yZSB0aGFuIG9uY2UhIFJlc29sdXRpb246IFwiK3ZhbHVlKVxyXG5cclxuICAgIHRoYXQuaXNSZXNvbHZlZCA9IHRydWVcclxuICAgIHRoYXQuaGFzRXJyb3IgPSB0eXBlID09PSAnZXJyb3InXHJcbiAgICB0aGF0Lmhhc05leHQgPSB0eXBlID09PSAnbmV4dCcgJiYgdmFsdWUgIT09IHVuZGVmaW5lZFxyXG5cclxuICAgIGlmKHRoYXQuaGFzRXJyb3IpXHJcbiAgICAgICAgdGhhdC5lcnJvciA9IHZhbHVlXHJcbiAgICBlbHNlIGlmKHRoYXQuaGFzTmV4dClcclxuICAgICAgICB0aGF0Lm5leHQgPSB2YWx1ZVxyXG4gICAgZWxzZVxyXG4gICAgICAgIHRoYXQucmVzdWx0ID0gdmFsdWVcclxuXHJcbiAgICBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIHRoYXQucXVldWUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4ZWN1dGVDYWxsYmFja3ModGhhdCwgY2FsbGJhY2tzKSB7XHJcbiAgICBpZihjYWxsYmFja3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uKGNiKSB7XHJcbiAgICAgICAgICAgICAgICBjYi5hcHBseSh0aGF0KVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0sMClcclxuICAgIH1cclxufVxyXG4iLCIoZnVuY3Rpb24gKHByb2Nlc3MsX19maWxlbmFtZSl7XG4vKiogdmltOiBldDp0cz00OnN3PTQ6c3RzPTRcbiAqIEBsaWNlbnNlIGFtZGVmaW5lIDEuMC4xIENvcHlyaWdodCAoYykgMjAxMS0yMDE2LCBUaGUgRG9qbyBGb3VuZGF0aW9uIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBBdmFpbGFibGUgdmlhIHRoZSBNSVQgb3IgbmV3IEJTRCBsaWNlbnNlLlxuICogc2VlOiBodHRwOi8vZ2l0aHViLmNvbS9qcmJ1cmtlL2FtZGVmaW5lIGZvciBkZXRhaWxzXG4gKi9cblxuLypqc2xpbnQgbm9kZTogdHJ1ZSAqL1xuLypnbG9iYWwgbW9kdWxlLCBwcm9jZXNzICovXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGRlZmluZSBmb3Igbm9kZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBtb2R1bGUgdGhlIFwibW9kdWxlXCIgb2JqZWN0IHRoYXQgaXMgZGVmaW5lZCBieSBOb2RlIGZvciB0aGVcbiAqIGN1cnJlbnQgbW9kdWxlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW3JlcXVpcmVGbl0uIE5vZGUncyByZXF1aXJlIGZ1bmN0aW9uIGZvciB0aGUgY3VycmVudCBtb2R1bGUuXG4gKiBJdCBvbmx5IG5lZWRzIHRvIGJlIHBhc3NlZCBpbiBOb2RlIHZlcnNpb25zIGJlZm9yZSAwLjUsIHdoZW4gbW9kdWxlLnJlcXVpcmVcbiAqIGRpZCBub3QgZXhpc3QuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IGEgZGVmaW5lIGZ1bmN0aW9uIHRoYXQgaXMgdXNhYmxlIGZvciB0aGUgY3VycmVudCBub2RlXG4gKiBtb2R1bGUuXG4gKi9cbmZ1bmN0aW9uIGFtZGVmaW5lKG1vZHVsZSwgcmVxdWlyZUZuKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIHZhciBkZWZpbmVDYWNoZSA9IHt9LFxuICAgICAgICBsb2FkZXJDYWNoZSA9IHt9LFxuICAgICAgICBhbHJlYWR5Q2FsbGVkID0gZmFsc2UsXG4gICAgICAgIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gICAgICAgIG1ha2VSZXF1aXJlLCBzdHJpbmdSZXF1aXJlO1xuXG4gICAgLyoqXG4gICAgICogVHJpbXMgdGhlIC4gYW5kIC4uIGZyb20gYW4gYXJyYXkgb2YgcGF0aCBzZWdtZW50cy5cbiAgICAgKiBJdCB3aWxsIGtlZXAgYSBsZWFkaW5nIHBhdGggc2VnbWVudCBpZiBhIC4uIHdpbGwgYmVjb21lXG4gICAgICogdGhlIGZpcnN0IHBhdGggc2VnbWVudCwgdG8gaGVscCB3aXRoIG1vZHVsZSBuYW1lIGxvb2t1cHMsXG4gICAgICogd2hpY2ggYWN0IGxpa2UgcGF0aHMsIGJ1dCBjYW4gYmUgcmVtYXBwZWQuIEJ1dCB0aGUgZW5kIHJlc3VsdCxcbiAgICAgKiBhbGwgcGF0aHMgdGhhdCB1c2UgdGhpcyBmdW5jdGlvbiBzaG91bGQgbG9vayBub3JtYWxpemVkLlxuICAgICAqIE5PVEU6IHRoaXMgbWV0aG9kIE1PRElGSUVTIHRoZSBpbnB1dCBhcnJheS5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBhcnkgdGhlIGFycmF5IG9mIHBhdGggc2VnbWVudHMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gdHJpbURvdHMoYXJ5KSB7XG4gICAgICAgIHZhciBpLCBwYXJ0O1xuICAgICAgICBmb3IgKGkgPSAwOyBhcnlbaV07IGkrPSAxKSB7XG4gICAgICAgICAgICBwYXJ0ID0gYXJ5W2ldO1xuICAgICAgICAgICAgaWYgKHBhcnQgPT09ICcuJykge1xuICAgICAgICAgICAgICAgIGFyeS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgaSAtPSAxO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJ0ID09PSAnLi4nKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IDEgJiYgKGFyeVsyXSA9PT0gJy4uJyB8fCBhcnlbMF0gPT09ICcuLicpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vRW5kIG9mIHRoZSBsaW5lLiBLZWVwIGF0IGxlYXN0IG9uZSBub24tZG90XG4gICAgICAgICAgICAgICAgICAgIC8vcGF0aCBzZWdtZW50IGF0IHRoZSBmcm9udCBzbyBpdCBjYW4gYmUgbWFwcGVkXG4gICAgICAgICAgICAgICAgICAgIC8vY29ycmVjdGx5IHRvIGRpc2suIE90aGVyd2lzZSwgdGhlcmUgaXMgbGlrZWx5XG4gICAgICAgICAgICAgICAgICAgIC8vbm8gcGF0aCBtYXBwaW5nIGZvciBhIHBhdGggc3RhcnRpbmcgd2l0aCAnLi4nLlxuICAgICAgICAgICAgICAgICAgICAvL1RoaXMgY2FuIHN0aWxsIGZhaWwsIGJ1dCBjYXRjaGVzIHRoZSBtb3N0IHJlYXNvbmFibGVcbiAgICAgICAgICAgICAgICAgICAgLy91c2VzIG9mIC4uXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYXJ5LnNwbGljZShpIC0gMSwgMik7XG4gICAgICAgICAgICAgICAgICAgIGkgLT0gMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub3JtYWxpemUobmFtZSwgYmFzZU5hbWUpIHtcbiAgICAgICAgdmFyIGJhc2VQYXJ0cztcblxuICAgICAgICAvL0FkanVzdCBhbnkgcmVsYXRpdmUgcGF0aHMuXG4gICAgICAgIGlmIChuYW1lICYmIG5hbWUuY2hhckF0KDApID09PSAnLicpIHtcbiAgICAgICAgICAgIC8vSWYgaGF2ZSBhIGJhc2UgbmFtZSwgdHJ5IHRvIG5vcm1hbGl6ZSBhZ2FpbnN0IGl0LFxuICAgICAgICAgICAgLy9vdGhlcndpc2UsIGFzc3VtZSBpdCBpcyBhIHRvcC1sZXZlbCByZXF1aXJlIHRoYXQgd2lsbFxuICAgICAgICAgICAgLy9iZSByZWxhdGl2ZSB0byBiYXNlVXJsIGluIHRoZSBlbmQuXG4gICAgICAgICAgICBpZiAoYmFzZU5hbWUpIHtcbiAgICAgICAgICAgICAgICBiYXNlUGFydHMgPSBiYXNlTmFtZS5zcGxpdCgnLycpO1xuICAgICAgICAgICAgICAgIGJhc2VQYXJ0cyA9IGJhc2VQYXJ0cy5zbGljZSgwLCBiYXNlUGFydHMubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICAgICAgYmFzZVBhcnRzID0gYmFzZVBhcnRzLmNvbmNhdChuYW1lLnNwbGl0KCcvJykpO1xuICAgICAgICAgICAgICAgIHRyaW1Eb3RzKGJhc2VQYXJ0cyk7XG4gICAgICAgICAgICAgICAgbmFtZSA9IGJhc2VQYXJ0cy5qb2luKCcvJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgdGhlIG5vcm1hbGl6ZSgpIGZ1bmN0aW9uIHBhc3NlZCB0byBhIGxvYWRlciBwbHVnaW4nc1xuICAgICAqIG5vcm1hbGl6ZSBtZXRob2QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZU5vcm1hbGl6ZShyZWxOYW1lKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShuYW1lLCByZWxOYW1lKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYWtlTG9hZChpZCkge1xuICAgICAgICBmdW5jdGlvbiBsb2FkKHZhbHVlKSB7XG4gICAgICAgICAgICBsb2FkZXJDYWNoZVtpZF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvYWQuZnJvbVRleHQgPSBmdW5jdGlvbiAoaWQsIHRleHQpIHtcbiAgICAgICAgICAgIC8vVGhpcyBvbmUgaXMgZGlmZmljdWx0IGJlY2F1c2UgdGhlIHRleHQgY2FuL3Byb2JhYmx5IHVzZXNcbiAgICAgICAgICAgIC8vZGVmaW5lLCBhbmQgYW55IHJlbGF0aXZlIHBhdGhzIGFuZCByZXF1aXJlcyBzaG91bGQgYmUgcmVsYXRpdmVcbiAgICAgICAgICAgIC8vdG8gdGhhdCBpZCB3YXMgaXQgd291bGQgYmUgZm91bmQgb24gZGlzay4gQnV0IHRoaXMgd291bGQgcmVxdWlyZVxuICAgICAgICAgICAgLy9ib290c3RyYXBwaW5nIGEgbW9kdWxlL3JlcXVpcmUgZmFpcmx5IGRlZXBseSBmcm9tIG5vZGUgY29yZS5cbiAgICAgICAgICAgIC8vTm90IHN1cmUgaG93IGJlc3QgdG8gZ28gYWJvdXQgdGhhdCB5ZXQuXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FtZGVmaW5lIGRvZXMgbm90IGltcGxlbWVudCBsb2FkLmZyb21UZXh0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGxvYWQ7XG4gICAgfVxuXG4gICAgbWFrZVJlcXVpcmUgPSBmdW5jdGlvbiAoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCByZWxJZCkge1xuICAgICAgICBmdW5jdGlvbiBhbWRSZXF1aXJlKGRlcHMsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGRlcHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgLy9TeW5jaHJvbm91cywgc2luZ2xlIG1vZHVsZSByZXF1aXJlKCcnKVxuICAgICAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgZGVwcywgcmVsSWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL0FycmF5IG9mIGRlcGVuZGVuY2llcyB3aXRoIGEgY2FsbGJhY2suXG5cbiAgICAgICAgICAgICAgICAvL0NvbnZlcnQgdGhlIGRlcGVuZGVuY2llcyB0byBtb2R1bGVzLlxuICAgICAgICAgICAgICAgIGRlcHMgPSBkZXBzLm1hcChmdW5jdGlvbiAoZGVwTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIGRlcE5hbWUsIHJlbElkKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vV2FpdCBmb3IgbmV4dCB0aWNrIHRvIGNhbGwgYmFjayB0aGUgcmVxdWlyZSBjYWxsLlxuICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KG51bGwsIGRlcHMpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhbWRSZXF1aXJlLnRvVXJsID0gZnVuY3Rpb24gKGZpbGVQYXRoKSB7XG4gICAgICAgICAgICBpZiAoZmlsZVBhdGguaW5kZXhPZignLicpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShmaWxlUGF0aCwgcGF0aC5kaXJuYW1lKG1vZHVsZS5maWxlbmFtZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmlsZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGFtZFJlcXVpcmU7XG4gICAgfTtcblxuICAgIC8vRmF2b3IgZXhwbGljaXQgdmFsdWUsIHBhc3NlZCBpbiBpZiB0aGUgbW9kdWxlIHdhbnRzIHRvIHN1cHBvcnQgTm9kZSAwLjQuXG4gICAgcmVxdWlyZUZuID0gcmVxdWlyZUZuIHx8IGZ1bmN0aW9uIHJlcSgpIHtcbiAgICAgICAgcmV0dXJuIG1vZHVsZS5yZXF1aXJlLmFwcGx5KG1vZHVsZSwgYXJndW1lbnRzKTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcnVuRmFjdG9yeShpZCwgZGVwcywgZmFjdG9yeSkge1xuICAgICAgICB2YXIgciwgZSwgbSwgcmVzdWx0O1xuXG4gICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgZSA9IGxvYWRlckNhY2hlW2lkXSA9IHt9O1xuICAgICAgICAgICAgbSA9IHtcbiAgICAgICAgICAgICAgICBpZDogaWQsXG4gICAgICAgICAgICAgICAgdXJpOiBfX2ZpbGVuYW1lLFxuICAgICAgICAgICAgICAgIGV4cG9ydHM6IGVcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByID0gbWFrZVJlcXVpcmUocmVxdWlyZUZuLCBlLCBtLCBpZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL09ubHkgc3VwcG9ydCBvbmUgZGVmaW5lIGNhbGwgcGVyIGZpbGVcbiAgICAgICAgICAgIGlmIChhbHJlYWR5Q2FsbGVkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhbWRlZmluZSB3aXRoIG5vIG1vZHVsZSBJRCBjYW5ub3QgYmUgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIHBlciBmaWxlLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWxyZWFkeUNhbGxlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vVXNlIHRoZSByZWFsIHZhcmlhYmxlcyBmcm9tIG5vZGVcbiAgICAgICAgICAgIC8vVXNlIG1vZHVsZS5leHBvcnRzIGZvciBleHBvcnRzLCBzaW5jZVxuICAgICAgICAgICAgLy90aGUgZXhwb3J0cyBpbiBoZXJlIGlzIGFtZGVmaW5lIGV4cG9ydHMuXG4gICAgICAgICAgICBlID0gbW9kdWxlLmV4cG9ydHM7XG4gICAgICAgICAgICBtID0gbW9kdWxlO1xuICAgICAgICAgICAgciA9IG1ha2VSZXF1aXJlKHJlcXVpcmVGbiwgZSwgbSwgbW9kdWxlLmlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vSWYgdGhlcmUgYXJlIGRlcGVuZGVuY2llcywgdGhleSBhcmUgc3RyaW5ncywgc28gbmVlZFxuICAgICAgICAvL3RvIGNvbnZlcnQgdGhlbSB0byBkZXBlbmRlbmN5IHZhbHVlcy5cbiAgICAgICAgaWYgKGRlcHMpIHtcbiAgICAgICAgICAgIGRlcHMgPSBkZXBzLm1hcChmdW5jdGlvbiAoZGVwTmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByKGRlcE5hbWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL0NhbGwgdGhlIGZhY3Rvcnkgd2l0aCB0aGUgcmlnaHQgZGVwZW5kZW5jaWVzLlxuICAgICAgICBpZiAodHlwZW9mIGZhY3RvcnkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZhY3RvcnkuYXBwbHkobS5leHBvcnRzLCBkZXBzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZhY3Rvcnk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG0uZXhwb3J0cyA9IHJlc3VsdDtcbiAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgIGxvYWRlckNhY2hlW2lkXSA9IG0uZXhwb3J0cztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0cmluZ1JlcXVpcmUgPSBmdW5jdGlvbiAoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCBpZCwgcmVsSWQpIHtcbiAgICAgICAgLy9TcGxpdCB0aGUgSUQgYnkgYSAhIHNvIHRoYXRcbiAgICAgICAgdmFyIGluZGV4ID0gaWQuaW5kZXhPZignIScpLFxuICAgICAgICAgICAgb3JpZ2luYWxJZCA9IGlkLFxuICAgICAgICAgICAgcHJlZml4LCBwbHVnaW47XG5cbiAgICAgICAgaWYgKGluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgaWQgPSBub3JtYWxpemUoaWQsIHJlbElkKTtcblxuICAgICAgICAgICAgLy9TdHJhaWdodCBtb2R1bGUgbG9va3VwLiBJZiBpdCBpcyBvbmUgb2YgdGhlIHNwZWNpYWwgZGVwZW5kZW5jaWVzLFxuICAgICAgICAgICAgLy9kZWFsIHdpdGggaXQsIG90aGVyd2lzZSwgZGVsZWdhdGUgdG8gbm9kZS5cbiAgICAgICAgICAgIGlmIChpZCA9PT0gJ3JlcXVpcmUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1ha2VSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcmVsSWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpZCA9PT0gJ2V4cG9ydHMnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cG9ydHM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlkID09PSAnbW9kdWxlJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2R1bGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGxvYWRlckNhY2hlLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRlZmluZUNhY2hlW2lkXSkge1xuICAgICAgICAgICAgICAgIHJ1bkZhY3RvcnkuYXBwbHkobnVsbCwgZGVmaW5lQ2FjaGVbaWRdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZihzeXN0ZW1SZXF1aXJlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzeXN0ZW1SZXF1aXJlKG9yaWdpbmFsSWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbW9kdWxlIHdpdGggSUQ6ICcgKyBpZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9UaGVyZSBpcyBhIHBsdWdpbiBpbiBwbGF5LlxuICAgICAgICAgICAgcHJlZml4ID0gaWQuc3Vic3RyaW5nKDAsIGluZGV4KTtcbiAgICAgICAgICAgIGlkID0gaWQuc3Vic3RyaW5nKGluZGV4ICsgMSwgaWQubGVuZ3RoKTtcblxuICAgICAgICAgICAgcGx1Z2luID0gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIHByZWZpeCwgcmVsSWQpO1xuXG4gICAgICAgICAgICBpZiAocGx1Z2luLm5vcm1hbGl6ZSkge1xuICAgICAgICAgICAgICAgIGlkID0gcGx1Z2luLm5vcm1hbGl6ZShpZCwgbWFrZU5vcm1hbGl6ZShyZWxJZCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL05vcm1hbGl6ZSB0aGUgSUQgbm9ybWFsbHkuXG4gICAgICAgICAgICAgICAgaWQgPSBub3JtYWxpemUoaWQsIHJlbElkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxvYWRlckNhY2hlW2lkXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBsdWdpbi5sb2FkKGlkLCBtYWtlUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIHJlbElkKSwgbWFrZUxvYWQoaWQpLCB7fSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vQ3JlYXRlIGEgZGVmaW5lIGZ1bmN0aW9uIHNwZWNpZmljIHRvIHRoZSBtb2R1bGUgYXNraW5nIGZvciBhbWRlZmluZS5cbiAgICBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlcHMsIGZhY3RvcnkpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaWQpKSB7XG4gICAgICAgICAgICBmYWN0b3J5ID0gZGVwcztcbiAgICAgICAgICAgIGRlcHMgPSBpZDtcbiAgICAgICAgICAgIGlkID0gdW5kZWZpbmVkO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGZhY3RvcnkgPSBpZDtcbiAgICAgICAgICAgIGlkID0gZGVwcyA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkZXBzICYmICFBcnJheS5pc0FycmF5KGRlcHMpKSB7XG4gICAgICAgICAgICBmYWN0b3J5ID0gZGVwcztcbiAgICAgICAgICAgIGRlcHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWRlcHMpIHtcbiAgICAgICAgICAgIGRlcHMgPSBbJ3JlcXVpcmUnLCAnZXhwb3J0cycsICdtb2R1bGUnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vU2V0IHVwIHByb3BlcnRpZXMgZm9yIHRoaXMgbW9kdWxlLiBJZiBhbiBJRCwgdGhlbiB1c2VcbiAgICAgICAgLy9pbnRlcm5hbCBjYWNoZS4gSWYgbm8gSUQsIHRoZW4gdXNlIHRoZSBleHRlcm5hbCB2YXJpYWJsZXNcbiAgICAgICAgLy9mb3IgdGhpcyBub2RlIG1vZHVsZS5cbiAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAvL1B1dCB0aGUgbW9kdWxlIGluIGRlZXAgZnJlZXplIHVudGlsIHRoZXJlIGlzIGFcbiAgICAgICAgICAgIC8vcmVxdWlyZSBjYWxsIGZvciBpdC5cbiAgICAgICAgICAgIGRlZmluZUNhY2hlW2lkXSA9IFtpZCwgZGVwcywgZmFjdG9yeV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBydW5GYWN0b3J5KGlkLCBkZXBzLCBmYWN0b3J5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vZGVmaW5lLnJlcXVpcmUsIHdoaWNoIGhhcyBhY2Nlc3MgdG8gYWxsIHRoZSB2YWx1ZXMgaW4gdGhlXG4gICAgLy9jYWNoZS4gVXNlZnVsIGZvciBBTUQgbW9kdWxlcyB0aGF0IGFsbCBoYXZlIElEcyBpbiB0aGUgZmlsZSxcbiAgICAvL2J1dCBuZWVkIHRvIGZpbmFsbHkgZXhwb3J0IGEgdmFsdWUgdG8gbm9kZSBiYXNlZCBvbiBvbmUgb2YgdGhvc2VcbiAgICAvL0lEcy5cbiAgICBkZWZpbmUucmVxdWlyZSA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICBpZiAobG9hZGVyQ2FjaGVbaWRdKSB7XG4gICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlZmluZUNhY2hlW2lkXSkge1xuICAgICAgICAgICAgcnVuRmFjdG9yeS5hcHBseShudWxsLCBkZWZpbmVDYWNoZVtpZF0pO1xuICAgICAgICAgICAgcmV0dXJuIGxvYWRlckNhY2hlW2lkXTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBkZWZpbmUuYW1kID0ge307XG5cbiAgICByZXR1cm4gZGVmaW5lO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFtZGVmaW5lO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIkQ6XFxcXGJpbGx5c0ZpbGVcXFxcY29kZVxcXFxtb2R1bGVzXFxcXGRlYWR1bml0Q29yZVxcXFxub2RlX21vZHVsZXNcXFxcaW5zZXJ0LW1vZHVsZS1nbG9iYWxzXFxcXG5vZGVfbW9kdWxlc1xcXFxwcm9jZXNzXFxcXGJyb3dzZXIuanNcIiksXCIvLi5cXFxcbm9kZV9tb2R1bGVzXFxcXGFtZGVmaW5lXFxcXGFtZGVmaW5lLmpzXCIpIiwiLyogQ29weXJpZ2h0IChjKSAyMDEzIEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xyXG5cclxudmFyIHRyaW1BcmdzID0gcmVxdWlyZShcInRyaW1Bcmd1bWVudHNcIilcclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZ1dHVyZVxyXG5cclxuRnV0dXJlLmRlYnVnID0gZmFsc2UgLy8gc3dpdGNoIHRoaXMgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBpZHMgYW5kIGxvbmcgc3RhY2sgdHJhY2VzXHJcblxyXG52YXIgY3VySWQgPSAwICAgICAgICAgLy8gZm9yIGlkc1xcXHJcbmZ1bmN0aW9uIEZ1dHVyZSh2YWx1ZSkge1xyXG5cdGlmKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcblx0XHR2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgICAgIGYucmV0dXJuKHZhbHVlKVxyXG4gICAgICAgIHJldHVybiBmXHJcblx0fSBlbHNlIHtcclxuICAgICAgICB0aGlzLmlzUmVzb2x2ZWQgPSBmYWxzZVxyXG4gICAgICAgIHRoaXMucXVldWUgPSBbXVxyXG4gICAgICAgIHRoaXMubiA9IDEgLy8gZnV0dXJlIGRlcHRoIChmb3IgcHJldmVudGluZyBcInRvbyBtdWNoIHJlY3Vyc2lvblwiIFJhbmdlRXJyb3JzKVxyXG4gICAgICAgIGlmKEZ1dHVyZS5kZWJ1Zykge1xyXG4gICAgICAgICAgICBjdXJJZCsrXHJcbiAgICAgICAgICAgIHRoaXMuaWQgPSBjdXJJZFxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gc3RhdGljIG1ldGhvZHNcclxuXHJcbi8vIGhhcyBvbmUgcGFyYW1ldGVyOiBlaXRoZXIgYSBidW5jaCBvZiBmdXR1cmVzLCBvciBhIHNpbmdsZSBhcnJheSBvZiBmdXR1cmVzXHJcbi8vIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBvbmUgb2YgdGhlbSBlcnJvcnMsIG9yIHdoZW4gYWxsIG9mIHRoZW0gc3VjY2VlZHNcclxuRnV0dXJlLmFsbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQXJyYXkpIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IGFyZ3VtZW50c1swXVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IHRyaW1BcmdzKGFyZ3VtZW50cylcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgdmFyIHJlc3VsdHMgPSBbXVxyXG5cclxuICAgIGlmKGZ1dHVyZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhciBjdXJyZW50ID0gZnV0dXJlc1swXVxyXG4gICAgICAgIGZ1dHVyZXMuZm9yRWFjaChmdW5jdGlvbihmdXR1cmUsIGluZGV4KSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0c1tpbmRleF0gPSB2XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnV0dXJlc1tpbmRleCsxXVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC8vaWZcclxuICAgICAgICBjdXJyZW50LmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLy8gZWxzZVxyXG4gICAgICAgIGN1cnJlbnQudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4ocmVzdWx0cylcclxuICAgICAgICB9KVxyXG5cclxuXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGYucmV0dXJuKHJlc3VsdHMpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gZWl0aGVyIHVzZWQgbGlrZSBmdXR1cmVXcmFwKGZ1bmN0aW9uKCl7IC4uLiB9KShhcmcxLGFyZzIsZXRjKSBvclxyXG4vLyAgZnV0dXJlV3JhcChvYmplY3QsICdtZXRob2ROYW1lJykoYXJnMSxhcmcyLGV0YylcclxuRnV0dXJlLndyYXAgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIGZ1bmN0aW9uXHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgdmFyIGZuID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgdmFyIG9iamVjdCA9IHVuZGVmaW5lZFxyXG5cclxuXHJcbiAgICAvLyBvYmplY3QsIGZ1bmN0aW9uXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBvYmplY3QgPSBhcmd1bWVudHNbMF1cclxuICAgICAgICB2YXIgZm4gPSBvYmplY3RbYXJndW1lbnRzWzFdXVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cylcclxuICAgICAgICB2YXIgZnV0dXJlID0gbmV3IEZ1dHVyZVxyXG4gICAgICAgIGFyZ3MucHVzaChmdXR1cmUucmVzb2x2ZXIoKSlcclxuICAgICAgICB2YXIgbWUgPSB0aGlzXHJcbiAgICAgICAgaWYob2JqZWN0KSBtZSA9IG9iamVjdFxyXG4gICAgICAgIGZuLmFwcGx5KG1lLCBhcmdzKVxyXG4gICAgICAgIHJldHVybiBmdXR1cmVcclxuICAgIH1cclxufVxyXG5cclxuLy8gZnV0dXJlIHdyYXBzIGEgZnVuY3Rpb24gd2hvJ3MgY2FsbGJhY2sgb25seSB0YWtlcyBvbmUgcGFyYW1ldGVyIC0gdGhlIHJldHVybiB2YWx1ZSAobm8gZXJyb3IgaXMgYXZhaWxhYmxlKVxyXG4vLyBlZzogZnVuY3Rpb24ocmVzdWx0KSB7fVxyXG5GdXR1cmUud3JhcFNpbmdsZVBhcmFtZXRlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgIHZhciBmbiA9IGFyZ3VtZW50c1swXVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgb2JqZWN0ID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgdmFyIG1ldGhvZCA9IGFyZ3VtZW50c1sxXVxyXG4gICAgICAgIHZhciBmbiA9IG9iamVjdFttZXRob2RdXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxyXG5cdFx0dmFyIGZ1dHVyZSA9IG5ldyBGdXR1cmVcclxuXHRcdGFyZ3MucHVzaChmdW5jdGlvbihyZXN1bHQpIHtcclxuXHRcdCAgICBmdXR1cmUucmV0dXJuKHJlc3VsdClcclxuXHRcdH0pXHJcblx0XHR2YXIgbWUgPSB0aGlzXHJcbiAgICAgICAgaWYob2JqZWN0KSBtZSA9IG9iamVjdFxyXG4gICAgICAgIGZuLmFwcGx5KG1lLCBhcmdzKVxyXG5cdFx0cmV0dXJuIGZ1dHVyZVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuLy8gZGVmYXVsdFxyXG52YXIgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICB0aHJvdyBlXHJcbiAgICB9LDApXHJcbn1cclxuXHJcbi8vIHNldHVwIHVuaGFuZGxlZCBlcnJvciBoYW5kbGVyXHJcbi8vIHVuaGFuZGxlZCBlcnJvcnMgaGFwcGVuIHdoZW4gZG9uZSBpcyBjYWxsZWQsIGFuZCAgdGhlbiBhbiBleGNlcHRpb24gaXMgdGhyb3duIGZyb20gdGhlIGZ1dHVyZVxyXG5GdXR1cmUuZXJyb3IgPSBmdW5jdGlvbihoYW5kbGVyKSB7XHJcbiAgICB1bmhhbmRsZWRFcnJvckhhbmRsZXIgPSBoYW5kbGVyXHJcbn1cclxuXHJcbi8vIGluc3RhbmNlIG1ldGhvZHNcclxuXHJcbi8vIHJldHVybnMgYSB2YWx1ZSBmb3IgdGhlIGZ1dHVyZSAoY2FuIG9ubHkgYmUgZXhlY3V0ZWQgb25jZSlcclxuLy8gaWYgdGhlcmUgYXJlIGNhbGxiYWNrcyB3YWl0aW5nIG9uIHRoaXMgdmFsdWUsIHRoZXkgYXJlIHJ1biBpbiB0aGUgbmV4dCB0aWNrXHJcbiAgICAvLyAoaWUgdGhleSBhcmVuJ3QgcnVuIGltbWVkaWF0ZWx5LCBhbGxvd2luZyB0aGUgY3VycmVudCB0aHJlYWQgb2YgZXhlY3V0aW9uIHRvIGNvbXBsZXRlKVxyXG5GdXR1cmUucHJvdG90eXBlLnJldHVybiA9IGZ1bmN0aW9uKHYpIHtcclxuICAgIHJlc29sdmUodGhpcywgJ3JldHVybicsIHYpXHJcbn1cclxuRnV0dXJlLnByb3RvdHlwZS50aHJvdyA9IGZ1bmN0aW9uKGUpIHtcclxuICAgIGlmKHRoaXMubG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGUuc3RhY2sgKz0gJ1xcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4nK3RoaXMubG9jYXRpb24uc3RhY2suc3BsaXQoJ1xcbicpLnNsaWNlKDQpLmpvaW4oJ1xcbicpXHJcbiAgICB9XHJcbiAgICByZXNvbHZlKHRoaXMsICdlcnJvcicsIGUpXHJcbiAgICByZXR1cm4gdGhpc1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXROZXh0KHRoYXQsIGZ1dHVyZSkge1xyXG4gICAgcmVzb2x2ZSh0aGF0LCAnbmV4dCcsIGZ1dHVyZSlcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdCh0aGF0LCBjYikge1xyXG4gICAgaWYodGhhdC5pc1Jlc29sdmVkKSB7XHJcbiAgICAgICAgZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBbY2JdKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGF0LnF1ZXVlLnB1c2goY2IpXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIGR1Y2sgdHlwaW5nIHRvIGRldGVybWluZSBpZiBzb21ldGhpbmcgaXMgb3IgaXNuJ3QgYSBmdXR1cmVcclxudmFyIGlzTGlrZUFGdXR1cmUgPSBGdXR1cmUuaXNMaWtlQUZ1dHVyZSA9IGZ1bmN0aW9uKHgpIHtcclxuICAgIHJldHVybiB4LmlzUmVzb2x2ZWQgIT09IHVuZGVmaW5lZCAmJiB4LnF1ZXVlICE9PSB1bmRlZmluZWQgJiYgeC50aGVuICE9PSB1bmRlZmluZWRcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdE9uUmVzdWx0KGYsIHJlc3VsdCwgY2IpIHtcclxuICAgIHdhaXQocmVzdWx0LCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHdhaXRPblJlc3VsdChmLCB0aGlzLm5leHQsIGNiKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGV4ZWN1dGVDYWxsYmFjayhjYix0aGlzLnJlc3VsdCkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxufVxyXG5cclxuXHJcbi8vIGNiIHRha2VzIG9uZSBwYXJhbWV0ZXIgLSB0aGUgdmFsdWUgcmV0dXJuZWRcclxuLy8gY2IgY2FuIHJldHVybiBhIEZ1dHVyZSwgaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IG9mIHRoYXQgRnV0dXJlIGlzIHBhc3NlZCB0byBuZXh0LWluLWNoYWluXHJcbkZ1dHVyZS5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IGNyZWF0ZUNoYWluRnV0dXJlKHRoaXMpXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpXHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICBlbHNlIGlmKHRoaXMuaGFzTmV4dClcclxuICAgICAgICAgICAgd2FpdE9uUmVzdWx0KGYsIHRoaXMubmV4dCwgY2IpXHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGV4ZWN1dGVDYWxsYmFjayhjYix0aGlzLnJlc3VsdCkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgb25lIHBhcmFtZXRlciAtIHRoZSBlcnJvciBjYXVnaHRcclxuLy8gY2IgY2FuIHJldHVybiBhIEZ1dHVyZSwgaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IG9mIHRoYXQgRnV0dXJlIGlzIHBhc3NlZCB0byBuZXh0LWluLWNoYWluXHJcbkZ1dHVyZS5wcm90b3R5cGUuY2F0Y2ggPSBmdW5jdGlvbihjYikge1xyXG4gICAgdmFyIGYgPSBjcmVhdGVDaGFpbkZ1dHVyZSh0aGlzKVxyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGV4ZWN1dGVDYWxsYmFjayhjYix0aGlzLmVycm9yKSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgIGYucmV0dXJuKHYpXHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0TmV4dChmLCBleGVjdXRlQ2FsbGJhY2soY2IsZSkpXHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4odGhpcy5yZXN1bHQpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgbm8gcGFyYW1ldGVyc1xyXG4vLyBjYWxsYmFjaydzIHJldHVybiB2YWx1ZSBpcyBpZ25vcmVkLCBidXQgdGhyb3duIGV4Y2VwdGlvbnMgcHJvcG9nYXRlIG5vcm1hbGx5XHJcbkZ1dHVyZS5wcm90b3R5cGUuZmluYWxseSA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IGNyZWF0ZUNoYWluRnV0dXJlKHRoaXMpXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpc1xyXG4gICAgICAgICAgICBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IGV4ZWN1dGVDYWxsYmFjayhjYilcclxuICAgICAgICAgICAgICAgICAgICBmLnJldHVybih2KVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4XHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBleGVjdXRlQ2FsbGJhY2soY2IpXHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4XHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIEZ1dHVyZSh0cnVlKS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBleGVjdXRlQ2FsbGJhY2soY2IpXHJcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3codGhhdC5lcnJvcilcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuXHJcbiAgICAgICAgICAgIH0gZWxzZSAge1xyXG4gICAgICAgICAgICAgICAgRnV0dXJlKHRydWUpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4ZWN1dGVDYWxsYmFjayhjYilcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi5yZXR1cm4odGhhdC5yZXN1bHQpXHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgfSkuZG9uZSgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbiAgICByZXR1cm4gZlxyXG59XHJcblxyXG4vLyBhIGZ1dHVyZSBjcmVhdGVkIGZvciB0aGUgY2hhaW4gZnVuY3Rpb25zICh0aGVuLCBjYXRjaCwgYW5kIGZpbmFsbHkpXHJcbmZ1bmN0aW9uIGNyZWF0ZUNoYWluRnV0dXJlKHRoYXQpIHtcclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZVxyXG4gICAgZi5uID0gdGhhdC5uICsgMVxyXG4gICAgaWYoRnV0dXJlLmRlYnVnKSB7XHJcbiAgICAgICAgZi5sb2NhdGlvbiA9IGNyZWF0ZUV4Y2VwdGlvbigpICAvLyB1c2VkIGZvciBsb25nIHRyYWNlc1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gYWxsIHVudXNlZCBmdXR1cmVzIHNob3VsZCBlbmQgd2l0aCB0aGlzIChlLmcuIG1vc3QgdGhlbi1jaGFpbnMpXHJcbi8vIGRldGF0Y2hlcyB0aGUgZnV0dXJlIHNvIGFueSBwcm9wb2dhdGVkIGV4Y2VwdGlvbiBpcyB0aHJvd24gKHNvIHRoZSBleGNlcHRpb24gaXNuJ3Qgc2lsZW50bHkgbG9zdClcclxuRnV0dXJlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24oKSB7XHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKHRoaXMuZXJyb3IpXHJcbiAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICB0aGlzLm5leHQuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxufVxyXG5cclxuXHJcblxyXG5GdXR1cmUucHJvdG90eXBlLnJlc29sdmVyID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgbWUgPSB0aGlzXHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGUsdikge1xyXG4gICAgICAgIGlmKGUpIHsgLy8gZXJyb3IgYXJndW1lbnRcclxuICAgICAgICAgICAgbWUudGhyb3coZSlcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBtZS5yZXR1cm4odilcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbkZ1dHVyZS5wcm90b3R5cGUucmVzb2x2ZWQgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmlzUmVzb2x2ZWRcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmUodGhhdCwgdHlwZSwgdmFsdWUpIHtcclxuICAgIGlmKHRoYXQuaXNSZXNvbHZlZClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIkZ1dHVyZSByZXNvbHZlZCBtb3JlIHRoYW4gb25jZSEgUmVzb2x1dGlvbjogXCIrdmFsdWUpXHJcblxyXG4gICAgdGhhdC5pc1Jlc29sdmVkID0gdHJ1ZVxyXG4gICAgdGhhdC5oYXNFcnJvciA9IHR5cGUgPT09ICdlcnJvcidcclxuICAgIHRoYXQuaGFzTmV4dCA9IHR5cGUgPT09ICduZXh0JyAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkXHJcblxyXG4gICAgaWYodGhhdC5oYXNFcnJvcilcclxuICAgICAgICB0aGF0LmVycm9yID0gdmFsdWVcclxuICAgIGVsc2UgaWYodGhhdC5oYXNOZXh0KVxyXG4gICAgICAgIHRoYXQubmV4dCA9IHZhbHVlXHJcbiAgICBlbHNlXHJcbiAgICAgICAgdGhhdC5yZXN1bHQgPSB2YWx1ZVxyXG5cclxuICAgIC8vIDEwMCBpcyBhIHByZXR0eSBhcmJpdHJhcnkgbnVtYmVyIC0gaXQgc2hvdWxkIGJlIHNldCBzaWduaWZpY2FudGx5IGxvd2VyIHRoYW4gY29tbW9uIG1heGltdW0gc3RhY2sgZGVwdGhzLCBhbmQgaGlnaCBlbm91Z2ggdG8gbWFrZSBzdXJlIHBlcmZvcm1hbmNlIGlzbid0IHNpZ25pZmljYW50bHkgYWZmZWN0ZWRcclxuICAgIC8vIGluIHVzaW5nIHRoaXMgZm9yIGRlYWR1bml0LCBmaXJlZm94IHdhcyBnZXR0aW5nIGEgcmVjdXJzaW9uIGVycm9yIGF0IDE1MCwgYnV0IG5vdCBhdCAxMDAuIFRoaXMgZG9lc24ndCBtZWFuIHRoYXQgaXQgY2FuJ3QgaGFwcGVuIGF0IDEwMCB0b28sIGJ1dCBpdCdsbCBjZXJ0YWlubHkgbWFrZSBpdCBsZXNzIGxpa2VseVxyXG4gICAgLy8gaWYgeW91J3JlIGdldHRpbmcgcmVjdXJzaW9uIGVycm9ycyBldmVuIHdpdGggdGhpcyBtZWNoYW5pc20sIHlvdSBwcm9iYWJseSBuZWVkIHRvIGZpZ3VyZSB0aGF0IG91dCBpbiB5b3VyIG93biBjb2RlXHJcbiAgICBpZih0aGF0Lm4gJSAxMDAgIT09IDApIHtcclxuICAgICAgICBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIHRoYXQucXVldWUpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IC8vIHRoaXMgcHJldmVudHMgdG9vIG11Y2ggcmVjdXJzaW9uIGVycm9yc1xyXG4gICAgICAgICAgICBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIHRoYXQucXVldWUpXHJcbiAgICAgICAgfSwgMClcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBjYWxsYmFja3MpIHtcclxuICAgIGlmKGNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24oY2IpIHtcclxuICAgICAgICAgICAgICAgIGNiLmFwcGx5KHRoYXQpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gZXhlY3V0ZXMgYSBjYWxsYmFjayBhbmQgZW5zdXJlcyB0aGF0IGl0IHJldHVybnMgYSBmdXR1cmVcclxuZnVuY3Rpb24gZXhlY3V0ZUNhbGxiYWNrKGNiLCBhcmcpIHtcclxuICAgIHZhciByID0gY2IoYXJnKVxyXG4gICAgaWYociAhPT0gdW5kZWZpbmVkICYmICFpc0xpa2VBRnV0dXJlKHIpIClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIlZhbHVlIHJldHVybmVkIGZyb20gdGhlbiBvciBjYXRjaCAoXCIrcitcIikgaXMgKm5vdCogYSBGdXR1cmUuIENhbGxiYWNrOiBcIitjYi50b1N0cmluZygpKVxyXG5cclxuICAgIHJldHVybiByXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUV4Y2VwdGlvbigpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKClcclxuICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgIHJldHVybiBlXHJcbiAgICB9XHJcbn0iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKiEgaHR0cDovL210aHMuYmUvcHVueWNvZGUgdjEuMi40IGJ5IEBtYXRoaWFzICovXG47KGZ1bmN0aW9uKHJvb3QpIHtcblxuXHQvKiogRGV0ZWN0IGZyZWUgdmFyaWFibGVzICovXG5cdHZhciBmcmVlRXhwb3J0cyA9IHR5cGVvZiBleHBvcnRzID09ICdvYmplY3QnICYmIGV4cG9ydHM7XG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHRtb2R1bGUuZXhwb3J0cyA9PSBmcmVlRXhwb3J0cyAmJiBtb2R1bGU7XG5cdHZhciBmcmVlR2xvYmFsID0gdHlwZW9mIGdsb2JhbCA9PSAnb2JqZWN0JyAmJiBnbG9iYWw7XG5cdGlmIChmcmVlR2xvYmFsLmdsb2JhbCA9PT0gZnJlZUdsb2JhbCB8fCBmcmVlR2xvYmFsLndpbmRvdyA9PT0gZnJlZUdsb2JhbCkge1xuXHRcdHJvb3QgPSBmcmVlR2xvYmFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBgcHVueWNvZGVgIG9iamVjdC5cblx0ICogQG5hbWUgcHVueWNvZGVcblx0ICogQHR5cGUgT2JqZWN0XG5cdCAqL1xuXHR2YXIgcHVueWNvZGUsXG5cblx0LyoqIEhpZ2hlc3QgcG9zaXRpdmUgc2lnbmVkIDMyLWJpdCBmbG9hdCB2YWx1ZSAqL1xuXHRtYXhJbnQgPSAyMTQ3NDgzNjQ3LCAvLyBha2EuIDB4N0ZGRkZGRkYgb3IgMl4zMS0xXG5cblx0LyoqIEJvb3RzdHJpbmcgcGFyYW1ldGVycyAqL1xuXHRiYXNlID0gMzYsXG5cdHRNaW4gPSAxLFxuXHR0TWF4ID0gMjYsXG5cdHNrZXcgPSAzOCxcblx0ZGFtcCA9IDcwMCxcblx0aW5pdGlhbEJpYXMgPSA3Mixcblx0aW5pdGlhbE4gPSAxMjgsIC8vIDB4ODBcblx0ZGVsaW1pdGVyID0gJy0nLCAvLyAnXFx4MkQnXG5cblx0LyoqIFJlZ3VsYXIgZXhwcmVzc2lvbnMgKi9cblx0cmVnZXhQdW55Y29kZSA9IC9eeG4tLS8sXG5cdHJlZ2V4Tm9uQVNDSUkgPSAvW14gLX5dLywgLy8gdW5wcmludGFibGUgQVNDSUkgY2hhcnMgKyBub24tQVNDSUkgY2hhcnNcblx0cmVnZXhTZXBhcmF0b3JzID0gL1xceDJFfFxcdTMwMDJ8XFx1RkYwRXxcXHVGRjYxL2csIC8vIFJGQyAzNDkwIHNlcGFyYXRvcnNcblxuXHQvKiogRXJyb3IgbWVzc2FnZXMgKi9cblx0ZXJyb3JzID0ge1xuXHRcdCdvdmVyZmxvdyc6ICdPdmVyZmxvdzogaW5wdXQgbmVlZHMgd2lkZXIgaW50ZWdlcnMgdG8gcHJvY2VzcycsXG5cdFx0J25vdC1iYXNpYyc6ICdJbGxlZ2FsIGlucHV0ID49IDB4ODAgKG5vdCBhIGJhc2ljIGNvZGUgcG9pbnQpJyxcblx0XHQnaW52YWxpZC1pbnB1dCc6ICdJbnZhbGlkIGlucHV0J1xuXHR9LFxuXG5cdC8qKiBDb252ZW5pZW5jZSBzaG9ydGN1dHMgKi9cblx0YmFzZU1pbnVzVE1pbiA9IGJhc2UgLSB0TWluLFxuXHRmbG9vciA9IE1hdGguZmxvb3IsXG5cdHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUsXG5cblx0LyoqIFRlbXBvcmFyeSB2YXJpYWJsZSAqL1xuXHRrZXk7XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBlcnJvciB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgZXJyb3IgdHlwZS5cblx0ICogQHJldHVybnMge0Vycm9yfSBUaHJvd3MgYSBgUmFuZ2VFcnJvcmAgd2l0aCB0aGUgYXBwbGljYWJsZSBlcnJvciBtZXNzYWdlLlxuXHQgKi9cblx0ZnVuY3Rpb24gZXJyb3IodHlwZSkge1xuXHRcdHRocm93IFJhbmdlRXJyb3IoZXJyb3JzW3R5cGVdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgYEFycmF5I21hcGAgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGl0ZXJhdGUgb3Zlci5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5IGFycmF5XG5cdCAqIGl0ZW0uXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgYXJyYXkgb2YgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcChhcnJheSwgZm4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXHRcdHdoaWxlIChsZW5ndGgtLSkge1xuXHRcdFx0YXJyYXlbbGVuZ3RoXSA9IGZuKGFycmF5W2xlbmd0aF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJyYXk7XG5cdH1cblxuXHQvKipcblx0ICogQSBzaW1wbGUgYEFycmF5I21hcGAtbGlrZSB3cmFwcGVyIHRvIHdvcmsgd2l0aCBkb21haW4gbmFtZSBzdHJpbmdzLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZS5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5XG5cdCAqIGNoYXJhY3Rlci5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBzdHJpbmcgb2YgY2hhcmFjdGVycyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2tcblx0ICogZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXBEb21haW4oc3RyaW5nLCBmbikge1xuXHRcdHJldHVybiBtYXAoc3RyaW5nLnNwbGl0KHJlZ2V4U2VwYXJhdG9ycyksIGZuKS5qb2luKCcuJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBudW1lcmljIGNvZGUgcG9pbnRzIG9mIGVhY2ggVW5pY29kZVxuXHQgKiBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZy4gV2hpbGUgSmF2YVNjcmlwdCB1c2VzIFVDUy0yIGludGVybmFsbHksXG5cdCAqIHRoaXMgZnVuY3Rpb24gd2lsbCBjb252ZXJ0IGEgcGFpciBvZiBzdXJyb2dhdGUgaGFsdmVzIChlYWNoIG9mIHdoaWNoXG5cdCAqIFVDUy0yIGV4cG9zZXMgYXMgc2VwYXJhdGUgY2hhcmFjdGVycykgaW50byBhIHNpbmdsZSBjb2RlIHBvaW50LFxuXHQgKiBtYXRjaGluZyBVVEYtMTYuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZW5jb2RlYFxuXHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBkZWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZyBUaGUgVW5pY29kZSBpbnB1dCBzdHJpbmcgKFVDUy0yKS5cblx0ICogQHJldHVybnMge0FycmF5fSBUaGUgbmV3IGFycmF5IG9mIGNvZGUgcG9pbnRzLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmRlY29kZShzdHJpbmcpIHtcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGNvdW50ZXIgPSAwLFxuXHRcdCAgICBsZW5ndGggPSBzdHJpbmcubGVuZ3RoLFxuXHRcdCAgICB2YWx1ZSxcblx0XHQgICAgZXh0cmE7XG5cdFx0d2hpbGUgKGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdHZhbHVlID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdGlmICh2YWx1ZSA+PSAweEQ4MDAgJiYgdmFsdWUgPD0gMHhEQkZGICYmIGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gaGlnaCBzdXJyb2dhdGUsIGFuZCB0aGVyZSBpcyBhIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdGV4dHJhID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdFx0aWYgKChleHRyYSAmIDB4RkMwMCkgPT0gMHhEQzAwKSB7IC8vIGxvdyBzdXJyb2dhdGVcblx0XHRcdFx0XHRvdXRwdXQucHVzaCgoKHZhbHVlICYgMHgzRkYpIDw8IDEwKSArIChleHRyYSAmIDB4M0ZGKSArIDB4MTAwMDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHVubWF0Y2hlZCBzdXJyb2dhdGU7IG9ubHkgYXBwZW5kIHRoaXMgY29kZSB1bml0LCBpbiBjYXNlIHRoZSBuZXh0XG5cdFx0XHRcdFx0Ly8gY29kZSB1bml0IGlzIHRoZSBoaWdoIHN1cnJvZ2F0ZSBvZiBhIHN1cnJvZ2F0ZSBwYWlyXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGNvdW50ZXItLTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBzdHJpbmcgYmFzZWQgb24gYW4gYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5kZWNvZGVgXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGVuY29kZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBjb2RlUG9pbnRzIFRoZSBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgbmV3IFVuaWNvZGUgc3RyaW5nIChVQ1MtMikuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZW5jb2RlKGFycmF5KSB7XG5cdFx0cmV0dXJuIG1hcChhcnJheSwgZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdHZhciBvdXRwdXQgPSAnJztcblx0XHRcdGlmICh2YWx1ZSA+IDB4RkZGRikge1xuXHRcdFx0XHR2YWx1ZSAtPSAweDEwMDAwO1xuXHRcdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlID4+PiAxMCAmIDB4M0ZGIHwgMHhEODAwKTtcblx0XHRcdFx0dmFsdWUgPSAweERDMDAgfCB2YWx1ZSAmIDB4M0ZGO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSk7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH0pLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgYmFzaWMgY29kZSBwb2ludCBpbnRvIGEgZGlnaXQvaW50ZWdlci5cblx0ICogQHNlZSBgZGlnaXRUb0Jhc2ljKClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBjb2RlUG9pbnQgVGhlIGJhc2ljIG51bWVyaWMgY29kZSBwb2ludCB2YWx1ZS5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50IChmb3IgdXNlIGluXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaW4gdGhlIHJhbmdlIGAwYCB0byBgYmFzZSAtIDFgLCBvciBgYmFzZWAgaWZcblx0ICogdGhlIGNvZGUgcG9pbnQgZG9lcyBub3QgcmVwcmVzZW50IGEgdmFsdWUuXG5cdCAqL1xuXHRmdW5jdGlvbiBiYXNpY1RvRGlnaXQoY29kZVBvaW50KSB7XG5cdFx0aWYgKGNvZGVQb2ludCAtIDQ4IDwgMTApIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSAyMjtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDY1IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA2NTtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDk3IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA5Nztcblx0XHR9XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBkaWdpdC9pbnRlZ2VyIGludG8gYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAc2VlIGBiYXNpY1RvRGlnaXQoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGRpZ2l0IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIGJhc2ljIGNvZGUgcG9pbnQgd2hvc2UgdmFsdWUgKHdoZW4gdXNlZCBmb3Jcblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpcyBgZGlnaXRgLCB3aGljaCBuZWVkcyB0byBiZSBpbiB0aGUgcmFuZ2Vcblx0ICogYDBgIHRvIGBiYXNlIC0gMWAuIElmIGBmbGFnYCBpcyBub24temVybywgdGhlIHVwcGVyY2FzZSBmb3JtIGlzXG5cdCAqIHVzZWQ7IGVsc2UsIHRoZSBsb3dlcmNhc2UgZm9ybSBpcyB1c2VkLiBUaGUgYmVoYXZpb3IgaXMgdW5kZWZpbmVkXG5cdCAqIGlmIGBmbGFnYCBpcyBub24temVybyBhbmQgYGRpZ2l0YCBoYXMgbm8gdXBwZXJjYXNlIGZvcm0uXG5cdCAqL1xuXHRmdW5jdGlvbiBkaWdpdFRvQmFzaWMoZGlnaXQsIGZsYWcpIHtcblx0XHQvLyAgMC4uMjUgbWFwIHRvIEFTQ0lJIGEuLnogb3IgQS4uWlxuXHRcdC8vIDI2Li4zNSBtYXAgdG8gQVNDSUkgMC4uOVxuXHRcdHJldHVybiBkaWdpdCArIDIyICsgNzUgKiAoZGlnaXQgPCAyNikgLSAoKGZsYWcgIT0gMCkgPDwgNSk7XG5cdH1cblxuXHQvKipcblx0ICogQmlhcyBhZGFwdGF0aW9uIGZ1bmN0aW9uIGFzIHBlciBzZWN0aW9uIDMuNCBvZiBSRkMgMzQ5Mi5cblx0ICogaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzQ5MiNzZWN0aW9uLTMuNFxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gYWRhcHQoZGVsdGEsIG51bVBvaW50cywgZmlyc3RUaW1lKSB7XG5cdFx0dmFyIGsgPSAwO1xuXHRcdGRlbHRhID0gZmlyc3RUaW1lID8gZmxvb3IoZGVsdGEgLyBkYW1wKSA6IGRlbHRhID4+IDE7XG5cdFx0ZGVsdGEgKz0gZmxvb3IoZGVsdGEgLyBudW1Qb2ludHMpO1xuXHRcdGZvciAoLyogbm8gaW5pdGlhbGl6YXRpb24gKi87IGRlbHRhID4gYmFzZU1pbnVzVE1pbiAqIHRNYXggPj4gMTsgayArPSBiYXNlKSB7XG5cdFx0XHRkZWx0YSA9IGZsb29yKGRlbHRhIC8gYmFzZU1pbnVzVE1pbik7XG5cdFx0fVxuXHRcdHJldHVybiBmbG9vcihrICsgKGJhc2VNaW51c1RNaW4gKyAxKSAqIGRlbHRhIC8gKGRlbHRhICsgc2tldykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scyB0byBhIHN0cmluZyBvZiBVbmljb2RlXG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGRlY29kZShpbnB1dCkge1xuXHRcdC8vIERvbid0IHVzZSBVQ1MtMlxuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGgsXG5cdFx0ICAgIG91dCxcblx0XHQgICAgaSA9IDAsXG5cdFx0ICAgIG4gPSBpbml0aWFsTixcblx0XHQgICAgYmlhcyA9IGluaXRpYWxCaWFzLFxuXHRcdCAgICBiYXNpYyxcblx0XHQgICAgaixcblx0XHQgICAgaW5kZXgsXG5cdFx0ICAgIG9sZGksXG5cdFx0ICAgIHcsXG5cdFx0ICAgIGssXG5cdFx0ICAgIGRpZ2l0LFxuXHRcdCAgICB0LFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgYmFzZU1pbnVzVDtcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHM6IGxldCBgYmFzaWNgIGJlIHRoZSBudW1iZXIgb2YgaW5wdXQgY29kZVxuXHRcdC8vIHBvaW50cyBiZWZvcmUgdGhlIGxhc3QgZGVsaW1pdGVyLCBvciBgMGAgaWYgdGhlcmUgaXMgbm9uZSwgdGhlbiBjb3B5XG5cdFx0Ly8gdGhlIGZpcnN0IGJhc2ljIGNvZGUgcG9pbnRzIHRvIHRoZSBvdXRwdXQuXG5cblx0XHRiYXNpYyA9IGlucHV0Lmxhc3RJbmRleE9mKGRlbGltaXRlcik7XG5cdFx0aWYgKGJhc2ljIDwgMCkge1xuXHRcdFx0YmFzaWMgPSAwO1xuXHRcdH1cblxuXHRcdGZvciAoaiA9IDA7IGogPCBiYXNpYzsgKytqKSB7XG5cdFx0XHQvLyBpZiBpdCdzIG5vdCBhIGJhc2ljIGNvZGUgcG9pbnRcblx0XHRcdGlmIChpbnB1dC5jaGFyQ29kZUF0KGopID49IDB4ODApIHtcblx0XHRcdFx0ZXJyb3IoJ25vdC1iYXNpYycpO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0LnB1c2goaW5wdXQuY2hhckNvZGVBdChqKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBkZWNvZGluZyBsb29wOiBzdGFydCBqdXN0IGFmdGVyIHRoZSBsYXN0IGRlbGltaXRlciBpZiBhbnkgYmFzaWMgY29kZVxuXHRcdC8vIHBvaW50cyB3ZXJlIGNvcGllZDsgc3RhcnQgYXQgdGhlIGJlZ2lubmluZyBvdGhlcndpc2UuXG5cblx0XHRmb3IgKGluZGV4ID0gYmFzaWMgPiAwID8gYmFzaWMgKyAxIDogMDsgaW5kZXggPCBpbnB1dExlbmd0aDsgLyogbm8gZmluYWwgZXhwcmVzc2lvbiAqLykge1xuXG5cdFx0XHQvLyBgaW5kZXhgIGlzIHRoZSBpbmRleCBvZiB0aGUgbmV4dCBjaGFyYWN0ZXIgdG8gYmUgY29uc3VtZWQuXG5cdFx0XHQvLyBEZWNvZGUgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlciBpbnRvIGBkZWx0YWAsXG5cdFx0XHQvLyB3aGljaCBnZXRzIGFkZGVkIHRvIGBpYC4gVGhlIG92ZXJmbG93IGNoZWNraW5nIGlzIGVhc2llclxuXHRcdFx0Ly8gaWYgd2UgaW5jcmVhc2UgYGlgIGFzIHdlIGdvLCB0aGVuIHN1YnRyYWN0IG9mZiBpdHMgc3RhcnRpbmdcblx0XHRcdC8vIHZhbHVlIGF0IHRoZSBlbmQgdG8gb2J0YWluIGBkZWx0YWAuXG5cdFx0XHRmb3IgKG9sZGkgPSBpLCB3ID0gMSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cblx0XHRcdFx0aWYgKGluZGV4ID49IGlucHV0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZ2l0ID0gYmFzaWNUb0RpZ2l0KGlucHV0LmNoYXJDb2RlQXQoaW5kZXgrKykpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA+PSBiYXNlIHx8IGRpZ2l0ID4gZmxvb3IoKG1heEludCAtIGkpIC8gdykpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGkgKz0gZGlnaXQgKiB3O1xuXHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPCB0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdGlmICh3ID4gZmxvb3IobWF4SW50IC8gYmFzZU1pbnVzVCkpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHcgKj0gYmFzZU1pbnVzVDtcblxuXHRcdFx0fVxuXG5cdFx0XHRvdXQgPSBvdXRwdXQubGVuZ3RoICsgMTtcblx0XHRcdGJpYXMgPSBhZGFwdChpIC0gb2xkaSwgb3V0LCBvbGRpID09IDApO1xuXG5cdFx0XHQvLyBgaWAgd2FzIHN1cHBvc2VkIHRvIHdyYXAgYXJvdW5kIGZyb20gYG91dGAgdG8gYDBgLFxuXHRcdFx0Ly8gaW5jcmVtZW50aW5nIGBuYCBlYWNoIHRpbWUsIHNvIHdlJ2xsIGZpeCB0aGF0IG5vdzpcblx0XHRcdGlmIChmbG9vcihpIC8gb3V0KSA+IG1heEludCAtIG4pIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdG4gKz0gZmxvb3IoaSAvIG91dCk7XG5cdFx0XHRpICU9IG91dDtcblxuXHRcdFx0Ly8gSW5zZXJ0IGBuYCBhdCBwb3NpdGlvbiBgaWAgb2YgdGhlIG91dHB1dFxuXHRcdFx0b3V0cHV0LnNwbGljZShpKyssIDAsIG4pO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVjczJlbmNvZGUob3V0cHV0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMgdG8gYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBlbmNvZGUoaW5wdXQpIHtcblx0XHR2YXIgbixcblx0XHQgICAgZGVsdGEsXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50LFxuXHRcdCAgICBiYXNpY0xlbmd0aCxcblx0XHQgICAgYmlhcyxcblx0XHQgICAgaixcblx0XHQgICAgbSxcblx0XHQgICAgcSxcblx0XHQgICAgayxcblx0XHQgICAgdCxcblx0XHQgICAgY3VycmVudFZhbHVlLFxuXHRcdCAgICBvdXRwdXQgPSBbXSxcblx0XHQgICAgLyoqIGBpbnB1dExlbmd0aGAgd2lsbCBob2xkIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgaW4gYGlucHV0YC4gKi9cblx0XHQgICAgaW5wdXRMZW5ndGgsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsXG5cdFx0ICAgIGJhc2VNaW51c1QsXG5cdFx0ICAgIHFNaW51c1Q7XG5cblx0XHQvLyBDb252ZXJ0IHRoZSBpbnB1dCBpbiBVQ1MtMiB0byBVbmljb2RlXG5cdFx0aW5wdXQgPSB1Y3MyZGVjb2RlKGlucHV0KTtcblxuXHRcdC8vIENhY2hlIHRoZSBsZW5ndGhcblx0XHRpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aDtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHN0YXRlXG5cdFx0biA9IGluaXRpYWxOO1xuXHRcdGRlbHRhID0gMDtcblx0XHRiaWFzID0gaW5pdGlhbEJpYXM7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzXG5cdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IDB4ODApIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGN1cnJlbnRWYWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhhbmRsZWRDUENvdW50ID0gYmFzaWNMZW5ndGggPSBvdXRwdXQubGVuZ3RoO1xuXG5cdFx0Ly8gYGhhbmRsZWRDUENvdW50YCBpcyB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIHRoYXQgaGF2ZSBiZWVuIGhhbmRsZWQ7XG5cdFx0Ly8gYGJhc2ljTGVuZ3RoYCBpcyB0aGUgbnVtYmVyIG9mIGJhc2ljIGNvZGUgcG9pbnRzLlxuXG5cdFx0Ly8gRmluaXNoIHRoZSBiYXNpYyBzdHJpbmcgLSBpZiBpdCBpcyBub3QgZW1wdHkgLSB3aXRoIGEgZGVsaW1pdGVyXG5cdFx0aWYgKGJhc2ljTGVuZ3RoKSB7XG5cdFx0XHRvdXRwdXQucHVzaChkZWxpbWl0ZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZW5jb2RpbmcgbG9vcDpcblx0XHR3aGlsZSAoaGFuZGxlZENQQ291bnQgPCBpbnB1dExlbmd0aCkge1xuXG5cdFx0XHQvLyBBbGwgbm9uLWJhc2ljIGNvZGUgcG9pbnRzIDwgbiBoYXZlIGJlZW4gaGFuZGxlZCBhbHJlYWR5LiBGaW5kIHRoZSBuZXh0XG5cdFx0XHQvLyBsYXJnZXIgb25lOlxuXHRcdFx0Zm9yIChtID0gbWF4SW50LCBqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPj0gbiAmJiBjdXJyZW50VmFsdWUgPCBtKSB7XG5cdFx0XHRcdFx0bSA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmNyZWFzZSBgZGVsdGFgIGVub3VnaCB0byBhZHZhbmNlIHRoZSBkZWNvZGVyJ3MgPG4saT4gc3RhdGUgdG8gPG0sMD4sXG5cdFx0XHQvLyBidXQgZ3VhcmQgYWdhaW5zdCBvdmVyZmxvd1xuXHRcdFx0aGFuZGxlZENQQ291bnRQbHVzT25lID0gaGFuZGxlZENQQ291bnQgKyAxO1xuXHRcdFx0aWYgKG0gLSBuID4gZmxvb3IoKG1heEludCAtIGRlbHRhKSAvIGhhbmRsZWRDUENvdW50UGx1c09uZSkpIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGRlbHRhICs9IChtIC0gbikgKiBoYW5kbGVkQ1BDb3VudFBsdXNPbmU7XG5cdFx0XHRuID0gbTtcblxuXHRcdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IG4gJiYgKytkZWx0YSA+IG1heEludCkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA9PSBuKSB7XG5cdFx0XHRcdFx0Ly8gUmVwcmVzZW50IGRlbHRhIGFzIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXJcblx0XHRcdFx0XHRmb3IgKHEgPSBkZWx0YSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cdFx0XHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblx0XHRcdFx0XHRcdGlmIChxIDwgdCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHFNaW51c1QgPSBxIC0gdDtcblx0XHRcdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKFxuXHRcdFx0XHRcdFx0XHRzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHQgKyBxTWludXNUICUgYmFzZU1pbnVzVCwgMCkpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0cSA9IGZsb29yKHFNaW51c1QgLyBiYXNlTWludXNUKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHEsIDApKSk7XG5cdFx0XHRcdFx0YmlhcyA9IGFkYXB0KGRlbHRhLCBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsIGhhbmRsZWRDUENvdW50ID09IGJhc2ljTGVuZ3RoKTtcblx0XHRcdFx0XHRkZWx0YSA9IDA7XG5cdFx0XHRcdFx0KytoYW5kbGVkQ1BDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQrK2RlbHRhO1xuXHRcdFx0KytuO1xuXG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gVW5pY29kZS4gT25seSB0aGVcblx0ICogUHVueWNvZGVkIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCBvbiBhIHN0cmluZyB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gY29udmVydGVkIHRvXG5cdCAqIFVuaWNvZGUuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBQdW55Y29kZSBkb21haW4gbmFtZSB0byBjb252ZXJ0IHRvIFVuaWNvZGUuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBVbmljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBQdW55Y29kZVxuXHQgKiBzdHJpbmcuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b1VuaWNvZGUoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4UHVueWNvZGUudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gZGVjb2RlKHN0cmluZy5zbGljZSg0KS50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFVuaWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFB1bnljb2RlLiBPbmx5IHRoZVxuXHQgKiBub24tQVNDSUkgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCdzIGFscmVhZHkgaW4gQVNDSUkuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZSB0byBjb252ZXJ0LCBhcyBhIFVuaWNvZGUgc3RyaW5nLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgUHVueWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGRvbWFpbiBuYW1lLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9BU0NJSShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhOb25BU0NJSS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyAneG4tLScgKyBlbmNvZGUoc3RyaW5nKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKiBEZWZpbmUgdGhlIHB1YmxpYyBBUEkgKi9cblx0cHVueWNvZGUgPSB7XG5cdFx0LyoqXG5cdFx0ICogQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBjdXJyZW50IFB1bnljb2RlLmpzIHZlcnNpb24gbnVtYmVyLlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIFN0cmluZ1xuXHRcdCAqL1xuXHRcdCd2ZXJzaW9uJzogJzEuMi40Jyxcblx0XHQvKipcblx0XHQgKiBBbiBvYmplY3Qgb2YgbWV0aG9kcyB0byBjb252ZXJ0IGZyb20gSmF2YVNjcmlwdCdzIGludGVybmFsIGNoYXJhY3RlclxuXHRcdCAqIHJlcHJlc2VudGF0aW9uIChVQ1MtMikgdG8gVW5pY29kZSBjb2RlIHBvaW50cywgYW5kIGJhY2suXG5cdFx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBPYmplY3Rcblx0XHQgKi9cblx0XHQndWNzMic6IHtcblx0XHRcdCdkZWNvZGUnOiB1Y3MyZGVjb2RlLFxuXHRcdFx0J2VuY29kZSc6IHVjczJlbmNvZGVcblx0XHR9LFxuXHRcdCdkZWNvZGUnOiBkZWNvZGUsXG5cdFx0J2VuY29kZSc6IGVuY29kZSxcblx0XHQndG9BU0NJSSc6IHRvQVNDSUksXG5cdFx0J3RvVW5pY29kZSc6IHRvVW5pY29kZVxuXHR9O1xuXG5cdC8qKiBFeHBvc2UgYHB1bnljb2RlYCAqL1xuXHQvLyBTb21lIEFNRCBidWlsZCBvcHRpbWl6ZXJzLCBsaWtlIHIuanMsIGNoZWNrIGZvciBzcGVjaWZpYyBjb25kaXRpb24gcGF0dGVybnNcblx0Ly8gbGlrZSB0aGUgZm9sbG93aW5nOlxuXHRpZiAoXG5cdFx0dHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmXG5cdFx0dHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiZcblx0XHRkZWZpbmUuYW1kXG5cdCkge1xuXHRcdGRlZmluZSgncHVueWNvZGUnLCBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBwdW55Y29kZTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChmcmVlRXhwb3J0cyAmJiAhZnJlZUV4cG9ydHMubm9kZVR5cGUpIHtcblx0XHRpZiAoZnJlZU1vZHVsZSkgeyAvLyBpbiBOb2RlLmpzIG9yIFJpbmdvSlMgdjAuOC4wK1xuXHRcdFx0ZnJlZU1vZHVsZS5leHBvcnRzID0gcHVueWNvZGU7XG5cdFx0fSBlbHNlIHsgLy8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdGZvciAoa2V5IGluIHB1bnljb2RlKSB7XG5cdFx0XHRcdHB1bnljb2RlLmhhc093blByb3BlcnR5KGtleSkgJiYgKGZyZWVFeHBvcnRzW2tleV0gPSBwdW55Y29kZVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7IC8vIGluIFJoaW5vIG9yIGEgd2ViIGJyb3dzZXJcblx0XHRyb290LnB1bnljb2RlID0gcHVueWNvZGU7XG5cdH1cblxufSh0aGlzKSk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyAuZGlybmFtZSwgLmJhc2VuYW1lLCBhbmQgLmV4dG5hbWUgbWV0aG9kcyBhcmUgZXh0cmFjdGVkIGZyb20gTm9kZS5qcyB2OC4xMS4xLFxuLy8gYmFja3BvcnRlZCBhbmQgdHJhbnNwbGl0ZWQgd2l0aCBCYWJlbCwgd2l0aCBiYWNrd2FyZHMtY29tcGF0IGZpeGVzXG5cbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzb2x2ZWRQYXRoID0gJycsXG4gICAgICByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICB2YXIgcGF0aCA9IChpID49IDApID8gYXJndW1lbnRzW2ldIDogcHJvY2Vzcy5jd2QoKTtcblxuICAgIC8vIFNraXAgZW1wdHkgYW5kIGludmFsaWQgZW50cmllc1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLnJlc29sdmUgbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfSBlbHNlIGlmICghcGF0aCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRQYXRoID0gcGF0aCArICcvJyArIHJlc29sdmVkUGF0aDtcbiAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcbiAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihyZXNvbHZlZFBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhcmVzb2x2ZWRBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIHJldHVybiAoKHJlc29sdmVkQWJzb2x1dGUgPyAnLycgOiAnJykgKyByZXNvbHZlZFBhdGgpIHx8ICcuJztcbn07XG5cbi8vIHBhdGgubm9ybWFsaXplKHBhdGgpXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIGlzQWJzb2x1dGUgPSBleHBvcnRzLmlzQWJzb2x1dGUocGF0aCksXG4gICAgICB0cmFpbGluZ1NsYXNoID0gc3Vic3RyKHBhdGgsIC0xKSA9PT0gJy8nO1xuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICBwYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhaXNBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIGlmICghcGF0aCAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHBhdGggPSAnLic7XG4gIH1cbiAgaWYgKHBhdGggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gJy8nO1xuICB9XG5cbiAgcmV0dXJuIChpc0Fic29sdXRlID8gJy8nIDogJycpICsgcGF0aDtcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuaXNBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguY2hhckF0KDApID09PSAnLyc7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHBhdGhzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgcmV0dXJuIGV4cG9ydHMubm9ybWFsaXplKGZpbHRlcihwYXRocywgZnVuY3Rpb24ocCwgaW5kZXgpIHtcbiAgICBpZiAodHlwZW9mIHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5qb2luIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfSkuam9pbignLycpKTtcbn07XG5cblxuLy8gcGF0aC5yZWxhdGl2ZShmcm9tLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVsYXRpdmUgPSBmdW5jdGlvbihmcm9tLCB0bykge1xuICBmcm9tID0gZXhwb3J0cy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTtcbiAgdG8gPSBleHBvcnRzLnJlc29sdmUodG8pLnN1YnN0cigxKTtcblxuICBmdW5jdGlvbiB0cmltKGFycikge1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgZm9yICg7IHN0YXJ0IDwgYXJyLmxlbmd0aDsgc3RhcnQrKykge1xuICAgICAgaWYgKGFycltzdGFydF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICB2YXIgZW5kID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgZm9yICg7IGVuZCA+PSAwOyBlbmQtLSkge1xuICAgICAgaWYgKGFycltlbmRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0ID4gZW5kKSByZXR1cm4gW107XG4gICAgcmV0dXJuIGFyci5zbGljZShzdGFydCwgZW5kIC0gc3RhcnQgKyAxKTtcbiAgfVxuXG4gIHZhciBmcm9tUGFydHMgPSB0cmltKGZyb20uc3BsaXQoJy8nKSk7XG4gIHZhciB0b1BhcnRzID0gdHJpbSh0by5zcGxpdCgnLycpKTtcblxuICB2YXIgbGVuZ3RoID0gTWF0aC5taW4oZnJvbVBhcnRzLmxlbmd0aCwgdG9QYXJ0cy5sZW5ndGgpO1xuICB2YXIgc2FtZVBhcnRzTGVuZ3RoID0gbGVuZ3RoO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGZyb21QYXJ0c1tpXSAhPT0gdG9QYXJ0c1tpXSkge1xuICAgICAgc2FtZVBhcnRzTGVuZ3RoID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBvdXRwdXRQYXJ0cyA9IFtdO1xuICBmb3IgKHZhciBpID0gc2FtZVBhcnRzTGVuZ3RoOyBpIDwgZnJvbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0UGFydHMucHVzaCgnLi4nKTtcbiAgfVxuXG4gIG91dHB1dFBhcnRzID0gb3V0cHV0UGFydHMuY29uY2F0KHRvUGFydHMuc2xpY2Uoc2FtZVBhcnRzTGVuZ3RoKSk7XG5cbiAgcmV0dXJuIG91dHB1dFBhcnRzLmpvaW4oJy8nKTtcbn07XG5cbmV4cG9ydHMuc2VwID0gJy8nO1xuZXhwb3J0cy5kZWxpbWl0ZXIgPSAnOic7XG5cbmV4cG9ydHMuZGlybmFtZSA9IGZ1bmN0aW9uIChwYXRoKSB7XG4gIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHBhdGggPSBwYXRoICsgJyc7XG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcuJztcbiAgdmFyIGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG4gIHZhciBoYXNSb290ID0gY29kZSA9PT0gNDcgLyovKi87XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIGZvciAodmFyIGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMTsgLS1pKSB7XG4gICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3JcbiAgICAgIG1hdGNoZWRTbGFzaCA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChlbmQgPT09IC0xKSByZXR1cm4gaGFzUm9vdCA/ICcvJyA6ICcuJztcbiAgaWYgKGhhc1Jvb3QgJiYgZW5kID09PSAxKSB7XG4gICAgLy8gcmV0dXJuICcvLyc7XG4gICAgLy8gQmFja3dhcmRzLWNvbXBhdCBmaXg6XG4gICAgcmV0dXJuICcvJztcbiAgfVxuICByZXR1cm4gcGF0aC5zbGljZSgwLCBlbmQpO1xufTtcblxuZnVuY3Rpb24gYmFzZW5hbWUocGF0aCkge1xuICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSBwYXRoID0gcGF0aCArICcnO1xuXG4gIHZhciBzdGFydCA9IDA7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIHZhciBpO1xuXG4gIGZvciAoaSA9IHBhdGgubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICBpZiAocGF0aC5jaGFyQ29kZUF0KGkpID09PSA0NyAvKi8qLykge1xuICAgICAgICAvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuICAgICAgICAvLyBzZXBhcmF0b3JzIGF0IHRoZSBlbmQgb2YgdGhlIHN0cmluZywgc3RvcCBub3dcbiAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICBzdGFydCA9IGkgKyAxO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcbiAgICAgIC8vIHBhdGggY29tcG9uZW50XG4gICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgIGVuZCA9IGkgKyAxO1xuICAgIH1cbiAgfVxuXG4gIGlmIChlbmQgPT09IC0xKSByZXR1cm4gJyc7XG4gIHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xufVxuXG4vLyBVc2VzIGEgbWl4ZWQgYXBwcm9hY2ggZm9yIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5LCBhcyBleHQgYmVoYXZpb3IgY2hhbmdlZFxuLy8gaW4gbmV3IE5vZGUuanMgdmVyc2lvbnMsIHNvIG9ubHkgYmFzZW5hbWUoKSBhYm92ZSBpcyBiYWNrcG9ydGVkIGhlcmVcbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbiAocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gYmFzZW5hbWUocGF0aCk7XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5leHBvcnRzLmV4dG5hbWUgPSBmdW5jdGlvbiAocGF0aCkge1xuICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSBwYXRoID0gcGF0aCArICcnO1xuICB2YXIgc3RhcnREb3QgPSAtMTtcbiAgdmFyIHN0YXJ0UGFydCA9IDA7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIC8vIFRyYWNrIHRoZSBzdGF0ZSBvZiBjaGFyYWN0ZXJzIChpZiBhbnkpIHdlIHNlZSBiZWZvcmUgb3VyIGZpcnN0IGRvdCBhbmRcbiAgLy8gYWZ0ZXIgYW55IHBhdGggc2VwYXJhdG9yIHdlIGZpbmRcbiAgdmFyIHByZURvdFN0YXRlID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhdGgubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgLy8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcbiAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgIGlmICghbWF0Y2hlZFNsYXNoKSB7XG4gICAgICAgICAgc3RhcnRQYXJ0ID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcbiAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgbWF0Y2hlZFNsYXNoID0gZmFsc2U7XG4gICAgICBlbmQgPSBpICsgMTtcbiAgICB9XG4gICAgaWYgKGNvZGUgPT09IDQ2IC8qLiovKSB7XG4gICAgICAgIC8vIElmIHRoaXMgaXMgb3VyIGZpcnN0IGRvdCwgbWFyayBpdCBhcyB0aGUgc3RhcnQgb2Ygb3VyIGV4dGVuc2lvblxuICAgICAgICBpZiAoc3RhcnREb3QgPT09IC0xKVxuICAgICAgICAgIHN0YXJ0RG90ID0gaTtcbiAgICAgICAgZWxzZSBpZiAocHJlRG90U3RhdGUgIT09IDEpXG4gICAgICAgICAgcHJlRG90U3RhdGUgPSAxO1xuICAgIH0gZWxzZSBpZiAoc3RhcnREb3QgIT09IC0xKSB7XG4gICAgICAvLyBXZSBzYXcgYSBub24tZG90IGFuZCBub24tcGF0aCBzZXBhcmF0b3IgYmVmb3JlIG91ciBkb3QsIHNvIHdlIHNob3VsZFxuICAgICAgLy8gaGF2ZSBhIGdvb2QgY2hhbmNlIGF0IGhhdmluZyBhIG5vbi1lbXB0eSBleHRlbnNpb25cbiAgICAgIHByZURvdFN0YXRlID0gLTE7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0YXJ0RG90ID09PSAtMSB8fCBlbmQgPT09IC0xIHx8XG4gICAgICAvLyBXZSBzYXcgYSBub24tZG90IGNoYXJhY3RlciBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGRvdFxuICAgICAgcHJlRG90U3RhdGUgPT09IDAgfHxcbiAgICAgIC8vIFRoZSAocmlnaHQtbW9zdCkgdHJpbW1lZCBwYXRoIGNvbXBvbmVudCBpcyBleGFjdGx5ICcuLidcbiAgICAgIHByZURvdFN0YXRlID09PSAxICYmIHN0YXJ0RG90ID09PSBlbmQgLSAxICYmIHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG4gIHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0RG90LCBlbmQpO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIkQ6XFxcXGJpbGx5c0ZpbGVcXFxcY29kZVxcXFxtb2R1bGVzXFxcXGRlYWR1bml0Q29yZVxcXFxub2RlX21vZHVsZXNcXFxcaW5zZXJ0LW1vZHVsZS1nbG9iYWxzXFxcXG5vZGVfbW9kdWxlc1xcXFxwcm9jZXNzXFxcXGJyb3dzZXIuanNcIikpIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbi8qIENvcHlyaWdodCAoYykgMjAxMyBCaWxseSBUZXRydWQgLSBGcmVlIHRvIHVzZSBmb3IgYW55IHB1cnBvc2U6IE1JVCBMaWNlbnNlKi9cclxuXHJcbnZhciBub29wID0gZnVuY3Rpb24oKSB7fVxyXG5cclxudmFyIHByb3RvdHlwZU5hbWU9J3Byb3RvdHlwZScsIHVuZGVmaW5lZCwgcHJvdG9VbmRlZmluZWQ9J3VuZGVmaW5lZCcsIGluaXQ9J2luaXQnLCBvd25Qcm9wZXJ0eT0oe30pLmhhc093blByb3BlcnR5OyAvLyBtaW5pZmlhYmxlIHZhcmlhYmxlc1xyXG5mdW5jdGlvbiBwcm90bygpIHtcclxuICAgIHZhciBhcmdzID0gYXJndW1lbnRzIC8vIG1pbmlmaWFibGUgdmFyaWFibGVzXHJcblxyXG4gICAgaWYoYXJncy5sZW5ndGggPT0gMSkge1xyXG4gICAgICAgIHZhciBwYXJlbnQgPSB7aW5pdDogbm9vcH1cclxuICAgICAgICB2YXIgcHJvdG90eXBlQnVpbGRlciA9IGFyZ3NbMF1cclxuXHJcbiAgICB9IGVsc2UgeyAvLyBsZW5ndGggPT0gMlxyXG4gICAgICAgIHZhciBwYXJlbnQgPSBhcmdzWzBdXHJcbiAgICAgICAgdmFyIHByb3RvdHlwZUJ1aWxkZXIgPSBhcmdzWzFdXHJcbiAgICB9XHJcblxyXG4gICAgLy8gc3BlY2lhbCBoYW5kbGluZyBmb3IgRXJyb3Igb2JqZWN0c1xyXG4gICAgdmFyIG5hbWVQb2ludGVyID0ge30gICAgLy8gbmFtZSB1c2VkIG9ubHkgZm9yIEVycm9yIE9iamVjdHNcclxuICAgIGlmKFtFcnJvciwgRXZhbEVycm9yLCBSYW5nZUVycm9yLCBSZWZlcmVuY2VFcnJvciwgU3ludGF4RXJyb3IsIFR5cGVFcnJvciwgVVJJRXJyb3JdLmluZGV4T2YocGFyZW50KSAhPT0gLTEpIHtcclxuICAgICAgICBwYXJlbnQgPSBub3JtYWxpemVFcnJvck9iamVjdChwYXJlbnQsIG5hbWVQb2ludGVyKVxyXG4gICAgfVxyXG5cclxuICAgIC8vIHNldCB1cCB0aGUgcGFyZW50IGludG8gdGhlIHByb3RvdHlwZSBjaGFpbiBpZiBhIHBhcmVudCBpcyBwYXNzZWRcclxuICAgIHZhciBwYXJlbnRJc0Z1bmN0aW9uID0gdHlwZW9mKHBhcmVudCkgPT09IFwiZnVuY3Rpb25cIlxyXG4gICAgaWYocGFyZW50SXNGdW5jdGlvbikge1xyXG4gICAgICAgIHByb3RvdHlwZUJ1aWxkZXJbcHJvdG90eXBlTmFtZV0gPSBwYXJlbnRbcHJvdG90eXBlTmFtZV1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcHJvdG90eXBlQnVpbGRlcltwcm90b3R5cGVOYW1lXSA9IHBhcmVudFxyXG4gICAgfVxyXG5cclxuICAgIC8vIHRoZSBwcm90b3R5cGUgdGhhdCB3aWxsIGJlIHVzZWQgdG8gbWFrZSBpbnN0YW5jZXNcclxuICAgIHZhciBwcm90b3R5cGUgPSBuZXcgcHJvdG90eXBlQnVpbGRlcihwYXJlbnQpXHJcbiAgICBuYW1lUG9pbnRlci5uYW1lID0gcHJvdG90eXBlLm5hbWVcclxuXHJcbiAgICAvLyBpZiB0aGVyZSdzIG5vIGluaXQsIGFzc3VtZSBpdHMgaW5oZXJpdGluZyBhIG5vbi1wcm90byBjbGFzcywgc28gZGVmYXVsdCB0byBhcHBseWluZyB0aGUgc3VwZXJjbGFzcydzIGNvbnN0cnVjdG9yLlxyXG4gICAgaWYoIXByb3RvdHlwZVtpbml0XSAmJiBwYXJlbnRJc0Z1bmN0aW9uKSB7XHJcbiAgICAgICAgcHJvdG90eXBlW2luaXRdID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIGNvbnN0cnVjdG9yIGZvciBlbXB0eSBvYmplY3Qgd2hpY2ggd2lsbCBiZSBwb3B1bGF0ZWQgdmlhIHRoZSBjb25zdHJ1Y3RvclxyXG4gICAgdmFyIEYgPSBmdW5jdGlvbigpIHt9XHJcbiAgICAgICAgRltwcm90b3R5cGVOYW1lXSA9IHByb3RvdHlwZSAgICAvLyBzZXQgdGhlIHByb3RvdHlwZSBmb3IgY3JlYXRlZCBpbnN0YW5jZXNcclxuXHJcbiAgICB2YXIgY29uc3RydWN0b3JOYW1lID0gcHJvdG90eXBlLm5hbWU/cHJvdG90eXBlLm5hbWU6JydcclxuICAgIGlmKHByb3RvdHlwZVtpbml0XSA9PT0gdW5kZWZpbmVkIHx8IHByb3RvdHlwZVtpbml0XSA9PT0gbm9vcCkge1xyXG4gICAgICAgIHZhciBQcm90b09iamVjdEZhY3RvcnkgPSBuZXcgRnVuY3Rpb24oJ0YnLFxyXG4gICAgICAgICAgICBcInJldHVybiBmdW5jdGlvbiBcIiArIGNvbnN0cnVjdG9yTmFtZSArIFwiKCl7XCIgK1xyXG4gICAgICAgICAgICAgICAgXCJyZXR1cm4gbmV3IEYoKVwiICtcclxuICAgICAgICAgICAgXCJ9XCJcclxuICAgICAgICApKEYpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIGR5bmFtaWNhbGx5IGNyZWF0aW5nIHRoaXMgZnVuY3Rpb24gY2F1c2UgdGhlcmUncyBubyBvdGhlciB3YXkgdG8gZHluYW1pY2FsbHkgbmFtZSBhIGZ1bmN0aW9uXHJcbiAgICAgICAgdmFyIFByb3RvT2JqZWN0RmFjdG9yeSA9IG5ldyBGdW5jdGlvbignRicsJ2knLCd1JywnbicsIC8vIHNoaXR0eSB2YXJpYWJsZXMgY2F1c2UgbWluaWZpZXJzIGFyZW4ndCBnb25uYSBtaW5pZnkgbXkgZnVuY3Rpb24gc3RyaW5nIGhlcmVcclxuICAgICAgICAgICAgXCJyZXR1cm4gZnVuY3Rpb24gXCIgKyBjb25zdHJ1Y3Rvck5hbWUgKyBcIigpeyBcIiArXHJcbiAgICAgICAgICAgICAgICBcInZhciB4PW5ldyBGKCkscj1pLmFwcGx5KHgsYXJndW1lbnRzKVxcblwiICsgICAgLy8gcG9wdWxhdGUgb2JqZWN0IHZpYSB0aGUgY29uc3RydWN0b3JcclxuICAgICAgICAgICAgICAgIFwiaWYocj09PW4pXFxuXCIgK1xyXG4gICAgICAgICAgICAgICAgICAgIFwicmV0dXJuIHhcXG5cIiArXHJcbiAgICAgICAgICAgICAgICBcImVsc2UgaWYocj09PXUpXFxuXCIgK1xyXG4gICAgICAgICAgICAgICAgICAgIFwicmV0dXJuIG5cXG5cIiArXHJcbiAgICAgICAgICAgICAgICBcImVsc2VcXG5cIiArXHJcbiAgICAgICAgICAgICAgICAgICAgXCJyZXR1cm4gclxcblwiICtcclxuICAgICAgICAgICAgXCJ9XCJcclxuICAgICAgICApKEYsIHByb3RvdHlwZVtpbml0XSwgcHJvdG9bcHJvdG9VbmRlZmluZWRdKSAvLyBub3RlIHRoYXQgbiBpcyB1bmRlZmluZWRcclxuICAgIH1cclxuXHJcbiAgICBwcm90b3R5cGUuY29uc3RydWN0b3IgPSBQcm90b09iamVjdEZhY3Rvcnk7ICAgIC8vIHNldCB0aGUgY29uc3RydWN0b3IgcHJvcGVydHkgb24gdGhlIHByb3RvdHlwZVxyXG5cclxuICAgIC8vIGFkZCBhbGwgdGhlIHByb3RvdHlwZSBwcm9wZXJ0aWVzIG9udG8gdGhlIHN0YXRpYyBjbGFzcyBhcyB3ZWxsIChzbyB5b3UgY2FuIGFjY2VzcyB0aGF0IGNsYXNzIHdoZW4geW91IHdhbnQgdG8gcmVmZXJlbmNlIHN1cGVyY2xhc3MgcHJvcGVydGllcylcclxuICAgIGZvcih2YXIgbiBpbiBwcm90b3R5cGUpIHtcclxuICAgICAgICBhZGRQcm9wZXJ0eShQcm90b09iamVjdEZhY3RvcnksIHByb3RvdHlwZSwgbilcclxuICAgIH1cclxuXHJcbiAgICAvLyBhZGQgcHJvcGVydGllcyBmcm9tIHBhcmVudCB0aGF0IGRvbid0IGV4aXN0IGluIHRoZSBzdGF0aWMgY2xhc3Mgb2JqZWN0IHlldFxyXG4gICAgZm9yKHZhciBuIGluIHBhcmVudCkge1xyXG4gICAgICAgIGlmKG93blByb3BlcnR5LmNhbGwocGFyZW50LCBuKSAmJiBQcm90b09iamVjdEZhY3Rvcnlbbl0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBhZGRQcm9wZXJ0eShQcm90b09iamVjdEZhY3RvcnksIHBhcmVudCwgbilcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgUHJvdG9PYmplY3RGYWN0b3J5LnBhcmVudCA9IHBhcmVudDsgICAgICAgICAgICAvLyBzcGVjaWFsIHBhcmVudCBwcm9wZXJ0eSBvbmx5IGF2YWlsYWJsZSBvbiB0aGUgcmV0dXJuZWQgcHJvdG8gY2xhc3NcclxuICAgIFByb3RvT2JqZWN0RmFjdG9yeVtwcm90b3R5cGVOYW1lXSA9IHByb3RvdHlwZSAgLy8gc2V0IHRoZSBwcm90b3R5cGUgb24gdGhlIG9iamVjdCBmYWN0b3J5XHJcblxyXG4gICAgcmV0dXJuIFByb3RvT2JqZWN0RmFjdG9yeTtcclxufVxyXG5cclxucHJvdG9bcHJvdG9VbmRlZmluZWRdID0ge30gLy8gYSBzcGVjaWFsIG1hcmtlciBmb3Igd2hlbiB5b3Ugd2FudCB0byByZXR1cm4gdW5kZWZpbmVkIGZyb20gYSBjb25zdHJ1Y3RvclxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBwcm90b1xyXG5cclxuZnVuY3Rpb24gbm9ybWFsaXplRXJyb3JPYmplY3QoRXJyb3JPYmplY3QsIG5hbWVQb2ludGVyKSB7XHJcbiAgICBmdW5jdGlvbiBOb3JtYWxpemVkRXJyb3IoKSB7XHJcbiAgICAgICAgdmFyIHRtcCA9IG5ldyBFcnJvck9iamVjdChhcmd1bWVudHNbMF0pXHJcbiAgICAgICAgdG1wLm5hbWUgPSBuYW1lUG9pbnRlci5uYW1lXHJcblxyXG4gICAgICAgIHRoaXMubWVzc2FnZSA9IHRtcC5tZXNzYWdlXHJcbiAgICAgICAgaWYoT2JqZWN0LmRlZmluZVByb3BlcnR5KSB7XHJcbiAgICAgICAgICAgIC8qdGhpcy5zdGFjayA9ICovT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdzdGFjaycsIHsgLy8gZ2V0dGVyIGZvciBtb3JlIG9wdGltaXp5IGdvb2RuZXNzXHJcbiAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0bXAuc3RhY2tcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUgLy8gc28geW91IGNhbiBjaGFuZ2UgaXQgaWYgeW91IHdhbnRcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnN0YWNrID0gdG1wLnN0YWNrXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBJbnRlcm1lZGlhdGVJbmhlcml0b3IgPSBmdW5jdGlvbigpIHt9XHJcbiAgICAgICAgSW50ZXJtZWRpYXRlSW5oZXJpdG9yLnByb3RvdHlwZSA9IEVycm9yT2JqZWN0LnByb3RvdHlwZVxyXG4gICAgTm9ybWFsaXplZEVycm9yLnByb3RvdHlwZSA9IG5ldyBJbnRlcm1lZGlhdGVJbmhlcml0b3IoKVxyXG5cclxuICAgIHJldHVybiBOb3JtYWxpemVkRXJyb3JcclxufVxyXG5cclxuZnVuY3Rpb24gYWRkUHJvcGVydHkoZmFjdG9yeU9iamVjdCwgcHJvdG90eXBlLCBwcm9wZXJ0eSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICB2YXIgaW5mbyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IocHJvdG90eXBlLCBwcm9wZXJ0eSlcclxuICAgICAgICBpZihpbmZvLmdldCAhPT0gdW5kZWZpbmVkIHx8IGluZm8uZ2V0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmRlZmluZVByb3BlcnR5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGZhY3RvcnlPYmplY3QsIHByb3BlcnR5LCBpbmZvKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGZhY3RvcnlPYmplY3RbcHJvcGVydHldID0gcHJvdG90eXBlW3Byb3BlcnR5XVxyXG4gICAgICAgIH1cclxuICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgIC8vIGRvIG5vdGhpbmcsIGlmIGEgcHJvcGVydHkgKGxpa2UgYG5hbWVgKSBjYW4ndCBiZSBzZXQsIGp1c3QgaWdub3JlIGl0XHJcbiAgICB9XHJcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwiLy8gQ29weXJpZ2h0IDIwMTQgU2ltb24gTHlkZWxsXHJcbi8vIFgxMSAo4oCcTUlU4oCdKSBMaWNlbnNlZC4gKFNlZSBMSUNFTlNFLilcclxuXHJcbnZvaWQgKGZ1bmN0aW9uKHJvb3QsIGZhY3RvcnkpIHtcclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHtcclxuICAgIGRlZmluZShmYWN0b3J5KVxyXG4gIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcclxuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpXHJcbiAgfSBlbHNlIHtcclxuICAgIHJvb3QucmVzb2x2ZVVybCA9IGZhY3RvcnkoKVxyXG4gIH1cclxufSh0aGlzLCBmdW5jdGlvbigpIHtcclxuXHJcbiAgZnVuY3Rpb24gcmVzb2x2ZVVybCgvKiAuLi51cmxzICovKSB7XHJcbiAgICB2YXIgbnVtVXJscyA9IGFyZ3VtZW50cy5sZW5ndGhcclxuXHJcbiAgICBpZiAobnVtVXJscyA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJyZXNvbHZlVXJsIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBhcmd1bWVudDsgZ290IG5vbmUuXCIpXHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYmFzZVwiKVxyXG4gICAgYmFzZS5ocmVmID0gYXJndW1lbnRzWzBdXHJcblxyXG4gICAgaWYgKG51bVVybHMgPT09IDEpIHtcclxuICAgICAgcmV0dXJuIGJhc2UuaHJlZlxyXG4gICAgfVxyXG5cclxuICAgIHZhciBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJoZWFkXCIpWzBdXHJcbiAgICBoZWFkLmluc2VydEJlZm9yZShiYXNlLCBoZWFkLmZpcnN0Q2hpbGQpXHJcblxyXG4gICAgdmFyIGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKVxyXG4gICAgdmFyIHJlc29sdmVkXHJcblxyXG4gICAgZm9yICh2YXIgaW5kZXggPSAxOyBpbmRleCA8IG51bVVybHM7IGluZGV4KyspIHtcclxuICAgICAgYS5ocmVmID0gYXJndW1lbnRzW2luZGV4XVxyXG4gICAgICByZXNvbHZlZCA9IGEuaHJlZlxyXG4gICAgICBiYXNlLmhyZWYgPSByZXNvbHZlZFxyXG4gICAgfVxyXG5cclxuICAgIGhlYWQucmVtb3ZlQ2hpbGQoYmFzZSlcclxuXHJcbiAgICByZXR1cm4gcmVzb2x2ZWRcclxuICB9XHJcblxyXG4gIHJldHVybiByZXNvbHZlVXJsXHJcblxyXG59KSk7XHJcbiIsIi8vIENvcHlyaWdodCAyMDE0IFNpbW9uIEx5ZGVsbFxuLy8gWDExICjigJxNSVTigJ0pIExpY2Vuc2VkLiAoU2VlIExJQ0VOU0UuKVxuXG4vLyBOb3RlOiBzb3VyY2UtbWFwLXJlc29sdmUuanMgaXMgZ2VuZXJhdGVkIGZyb20gc291cmNlLW1hcC1yZXNvbHZlLW5vZGUuanMgYW5kXG4vLyBzb3VyY2UtbWFwLXJlc29sdmUtdGVtcGxhdGUuanMuIE9ubHkgZWRpdCB0aGUgdHdvIGxhdHRlciBmaWxlcywgX25vdF9cbi8vIHNvdXJjZS1tYXAtcmVzb2x2ZS5qcyFcblxudm9pZCAoZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoW1wic291cmNlLW1hcC11cmxcIiwgXCJyZXNvbHZlLXVybFwiXSwgZmFjdG9yeSlcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xuICAgIHZhciBzb3VyY2VNYXBwaW5nVVJMID0gcmVxdWlyZShcInNvdXJjZS1tYXAtdXJsXCIpXG4gICAgdmFyIHJlc29sdmVVcmwgPSByZXF1aXJlKFwicmVzb2x2ZS11cmxcIilcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3Rvcnkoc291cmNlTWFwcGluZ1VSTCwgcmVzb2x2ZVVybClcbiAgfSBlbHNlIHtcbiAgICByb290LnNvdXJjZU1hcFJlc29sdmUgPSBmYWN0b3J5KHJvb3Quc291cmNlTWFwcGluZ1VSTCwgcm9vdC5yZXNvbHZlVXJsKVxuICB9XG59KHRoaXMsIGZ1bmN0aW9uKHNvdXJjZU1hcHBpbmdVUkwsIHJlc29sdmVVcmwpIHtcblxuICBmdW5jdGlvbiBjYWxsYmFja0FzeW5jKGNhbGxiYWNrLCBlcnJvciwgcmVzdWx0KSB7XG4gICAgc2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhlcnJvciwgcmVzdWx0KSB9KVxuICB9XG5cbiAgZnVuY3Rpb24gc2lnKG5hbWUsIGNvZGVPck1hcCwgdXJsLCByZWFkLCBjYWxsYmFjaykge1xuICAgIHZhciB0eXBlID0gKG5hbWUuaW5kZXhPZihcIlNvdXJjZXNcIikgPj0gMCA/IFwibWFwXCIgOiBcImNvZGVcIilcblxuICAgIHZhciB0aHJvd0Vycm9yID0gZnVuY3Rpb24obnVtLCB3aGF0LCBnb3QpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgbmFtZSArIFwiIHJlcXVpcmVzIGFyZ3VtZW50IFwiICsgbnVtICsgXCIgdG8gYmUgXCIgKyB3aGF0ICsgXCIuIEdvdDpcXG5cIiArIGdvdFxuICAgICAgKVxuICAgIH1cblxuICAgIGlmICh0eXBlID09PSBcIm1hcFwiKSB7XG4gICAgICBpZiAodHlwZW9mIGNvZGVPck1hcCAhPT0gXCJvYmplY3RcIiB8fCBjb2RlT3JNYXAgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3dFcnJvcigxLCBcImEgc291cmNlIG1hcFwiLCBjb2RlT3JNYXApXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0eXBlb2YgY29kZU9yTWFwICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93RXJyb3IoMSwgXCJzb21lIGNvZGVcIiwgY29kZU9yTWFwKVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAodHlwZW9mIHVybCAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgdGhyb3dFcnJvcigyLCBcInRoZSBcIiArIHR5cGUgKyBcIiB1cmxcIiwgdXJsKVxuICAgIH1cbiAgICBpZiAodHlwZW9mIHJlYWQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgdGhyb3dFcnJvcigzLCBcImEgcmVhZGluZyBmdW5jdGlvblwiLCByZWFkKVxuICAgIH1cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSArIDQgJiYgdHlwZW9mIGNhbGxiYWNrICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHRocm93RXJyb3IoNCwgXCJhIGNhbGxiYWNrIGZ1bmN0aW9uXCIsIGNhbGxiYWNrKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTWFwVG9KU09OKHN0cmluZykge1xuICAgIHJldHVybiBKU09OLnBhcnNlKHN0cmluZy5yZXBsYWNlKC9eXFwpXFxdXFx9Jy8sIFwiXCIpKVxuICB9XG5cblxuXG4gIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VNYXAoY29kZSwgY29kZVVybCwgcmVhZCwgY2FsbGJhY2spIHtcbiAgICBzaWcoXCJyZXNvbHZlU291cmNlTWFwXCIsIGNvZGUsIGNvZGVVcmwsIHJlYWQsIGNhbGxiYWNrKVxuICAgIHZhciBtYXBEYXRhXG4gICAgdHJ5IHtcbiAgICAgIG1hcERhdGEgPSByZXNvbHZlU291cmNlTWFwSGVscGVyKGNvZGUsIGNvZGVVcmwpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBjYWxsYmFja0FzeW5jKGNhbGxiYWNrLCBlcnJvcilcbiAgICB9XG4gICAgaWYgKCFtYXBEYXRhIHx8IG1hcERhdGEubWFwKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2tBc3luYyhjYWxsYmFjaywgbnVsbCwgbWFwRGF0YSlcbiAgICB9XG4gICAgcmVhZChtYXBEYXRhLnVybCwgZnVuY3Rpb24oZXJyb3IsIHJlc3VsdCkge1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcilcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIG1hcERhdGEubWFwID0gcGFyc2VNYXBUb0pTT04oU3RyaW5nKHJlc3VsdCkpXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3IpXG4gICAgICB9XG4gICAgICBjYWxsYmFjayhudWxsLCBtYXBEYXRhKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNvbHZlU291cmNlTWFwU3luYyhjb2RlLCBjb2RlVXJsLCByZWFkKSB7XG4gICAgc2lnKFwicmVzb2x2ZVNvdXJjZU1hcFN5bmNcIiwgY29kZSwgY29kZVVybCwgcmVhZClcbiAgICB2YXIgbWFwRGF0YSA9IHJlc29sdmVTb3VyY2VNYXBIZWxwZXIoY29kZSwgY29kZVVybClcbiAgICBpZiAoIW1hcERhdGEgfHwgbWFwRGF0YS5tYXApIHtcbiAgICAgIHJldHVybiBtYXBEYXRhXG4gICAgfVxuICAgIG1hcERhdGEubWFwID0gcGFyc2VNYXBUb0pTT04oU3RyaW5nKHJlYWQobWFwRGF0YS51cmwpKSlcbiAgICByZXR1cm4gbWFwRGF0YVxuICB9XG5cbiAgdmFyIGRhdGFVcmlSZWdleCA9IC9eZGF0YTooW14sO10qKSg7W14sO10qKSooPzosKC4qKSk/JC9cbiAgdmFyIGpzb25NaW1lVHlwZVJlZ2V4ID0gL14oPzphcHBsaWNhdGlvbnx0ZXh0KVxcL2pzb24kL1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VNYXBIZWxwZXIoY29kZSwgY29kZVVybCkge1xuICAgIHZhciB1cmwgPSBzb3VyY2VNYXBwaW5nVVJMLmdldChjb2RlKVxuICAgIGlmICghdXJsKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHZhciBkYXRhVXJpID0gdXJsLm1hdGNoKGRhdGFVcmlSZWdleClcbiAgICBpZiAoZGF0YVVyaSkge1xuICAgICAgdmFyIG1pbWVUeXBlID0gZGF0YVVyaVsxXVxuICAgICAgdmFyIGxhc3RQYXJhbWV0ZXIgPSBkYXRhVXJpWzJdXG4gICAgICB2YXIgZW5jb2RlZCA9IGRhdGFVcmlbM11cbiAgICAgIGlmICghanNvbk1pbWVUeXBlUmVnZXgudGVzdChtaW1lVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW51c2VmdWwgZGF0YSB1cmkgbWltZSB0eXBlOiBcIiArIChtaW1lVHlwZSB8fCBcInRleHQvcGxhaW5cIikpXG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzb3VyY2VNYXBwaW5nVVJMOiB1cmwsXG4gICAgICAgIHVybDogbnVsbCxcbiAgICAgICAgc291cmNlc1JlbGF0aXZlVG86IGNvZGVVcmwsXG4gICAgICAgIG1hcDogcGFyc2VNYXBUb0pTT04obGFzdFBhcmFtZXRlciA9PT0gXCI7YmFzZTY0XCIgPyBhdG9iKGVuY29kZWQpIDogZGVjb2RlVVJJQ29tcG9uZW50KGVuY29kZWQpKVxuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBtYXBVcmwgPSByZXNvbHZlVXJsKGNvZGVVcmwsIHVybClcbiAgICByZXR1cm4ge1xuICAgICAgc291cmNlTWFwcGluZ1VSTDogdXJsLFxuICAgICAgdXJsOiBtYXBVcmwsXG4gICAgICBzb3VyY2VzUmVsYXRpdmVUbzogbWFwVXJsLFxuICAgICAgbWFwOiBudWxsXG4gICAgfVxuICB9XG5cblxuXG4gIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VzKG1hcCwgbWFwVXJsLCByZWFkLCBjYWxsYmFjaykge1xuICAgIHNpZyhcInJlc29sdmVTb3VyY2VzXCIsIG1hcCwgbWFwVXJsLCByZWFkLCBjYWxsYmFjaylcbiAgICB2YXIgcGVuZGluZyA9IG1hcC5zb3VyY2VzLmxlbmd0aFxuICAgIHZhciBlcnJvcmVkID0gZmFsc2VcbiAgICB2YXIgc291cmNlcyA9IFtdXG5cbiAgICB2YXIgZG9uZSA9IGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3JlZCkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICBlcnJvcmVkID0gdHJ1ZVxuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3IpXG4gICAgICB9XG4gICAgICBwZW5kaW5nLS1cbiAgICAgIGlmIChwZW5kaW5nID09PSAwKSB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHNvdXJjZXMpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmVzb2x2ZVNvdXJjZXNIZWxwZXIobWFwLCBtYXBVcmwsIGZ1bmN0aW9uKGZ1bGxVcmwsIHNvdXJjZUNvbnRlbnQsIGluZGV4KSB7XG4gICAgICBpZiAodHlwZW9mIHNvdXJjZUNvbnRlbnQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgc291cmNlc1tpbmRleF0gPSBzb3VyY2VDb250ZW50XG4gICAgICAgIGNhbGxiYWNrQXN5bmMoZG9uZSwgbnVsbClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlYWQoZnVsbFVybCwgZnVuY3Rpb24oZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgIHNvdXJjZXNbaW5kZXhdID0gU3RyaW5nKHJlc3VsdClcbiAgICAgICAgICBkb25lKGVycm9yKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiByZXNvbHZlU291cmNlc1N5bmMobWFwLCBtYXBVcmwsIHJlYWQpIHtcbiAgICBzaWcoXCJyZXNvbHZlU291cmNlc1N5bmNcIiwgbWFwLCBtYXBVcmwsIHJlYWQpXG4gICAgdmFyIHNvdXJjZXMgPSBbXVxuICAgIHJlc29sdmVTb3VyY2VzSGVscGVyKG1hcCwgbWFwVXJsLCBmdW5jdGlvbihmdWxsVXJsLCBzb3VyY2VDb250ZW50LCBpbmRleCkge1xuICAgICAgaWYgKHR5cGVvZiBzb3VyY2VDb250ZW50ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHNvdXJjZXNbaW5kZXhdID0gc291cmNlQ29udGVudFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc291cmNlc1tpbmRleF0gPSBTdHJpbmcocmVhZChmdWxsVXJsKSlcbiAgICAgIH1cbiAgICB9KVxuICAgIHJldHVybiBzb3VyY2VzXG4gIH1cblxuICB2YXIgZW5kaW5nU2xhc2ggPSAvXFwvPyQvXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZXNIZWxwZXIobWFwLCBtYXBVcmwsIGZuKSB7XG4gICAgdmFyIGZ1bGxVcmxcbiAgICB2YXIgc291cmNlQ29udGVudFxuICAgIGZvciAodmFyIGluZGV4ID0gMCwgbGVuID0gbWFwLnNvdXJjZXMubGVuZ3RoOyBpbmRleCA8IGxlbjsgaW5kZXgrKykge1xuICAgICAgaWYgKG1hcC5zb3VyY2VSb290KSB7XG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHRoZSBzb3VyY2VSb290IGVuZHMgd2l0aCBhIHNsYXNoLCBzbyB0aGF0IGAvc2NyaXB0cy9zdWJkaXJgIGJlY29tZXNcbiAgICAgICAgLy8gYC9zY3JpcHRzL3N1YmRpci88c291cmNlPmAsIG5vdCBgL3NjcmlwdHMvPHNvdXJjZT5gLiBQb2ludGluZyB0byBhIGZpbGUgYXMgc291cmNlIHJvb3RcbiAgICAgICAgLy8gZG9lcyBub3QgbWFrZSBzZW5zZS5cbiAgICAgICAgZnVsbFVybCA9IHJlc29sdmVVcmwobWFwVXJsLCBtYXAuc291cmNlUm9vdC5yZXBsYWNlKGVuZGluZ1NsYXNoLCBcIi9cIiksIG1hcC5zb3VyY2VzW2luZGV4XSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZ1bGxVcmwgPSByZXNvbHZlVXJsKG1hcFVybCwgbWFwLnNvdXJjZXNbaW5kZXhdKVxuICAgICAgfVxuICAgICAgc291cmNlQ29udGVudCA9IChtYXAuc291cmNlQ29udGVudHMgfHwgW10pW2luZGV4XVxuICAgICAgZm4oZnVsbFVybCwgc291cmNlQ29udGVudCwgaW5kZXgpXG4gICAgfVxuICB9XG5cblxuXG4gIGZ1bmN0aW9uIHJlc29sdmUoY29kZSwgY29kZVVybCwgcmVhZCwgY2FsbGJhY2spIHtcbiAgICBzaWcoXCJyZXNvbHZlXCIsIGNvZGUsIGNvZGVVcmwsIHJlYWQsIGNhbGxiYWNrKVxuICAgIHJlc29sdmVTb3VyY2VNYXAoY29kZSwgY29kZVVybCwgcmVhZCwgZnVuY3Rpb24oZXJyb3IsIG1hcERhdGEpIHtcbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3IpXG4gICAgICB9XG4gICAgICBpZiAoIW1hcERhdGEpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIG51bGwpXG4gICAgICB9XG4gICAgICByZXNvbHZlU291cmNlcyhtYXBEYXRhLm1hcCwgbWFwRGF0YS5zb3VyY2VzUmVsYXRpdmVUbywgcmVhZCwgZnVuY3Rpb24oZXJyb3IsIHNvdXJjZXMpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9yKVxuICAgICAgICB9XG4gICAgICAgIG1hcERhdGEuc291cmNlcyA9IHNvdXJjZXNcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgbWFwRGF0YSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc29sdmVTeW5jKGNvZGUsIGNvZGVVcmwsIHJlYWQpIHtcbiAgICBzaWcoXCJyZXNvbHZlU3luY1wiLCBjb2RlLCBjb2RlVXJsLCByZWFkKVxuICAgIHZhciBtYXBEYXRhID0gcmVzb2x2ZVNvdXJjZU1hcFN5bmMoY29kZSwgY29kZVVybCwgcmVhZClcbiAgICBpZiAoIW1hcERhdGEpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICAgIG1hcERhdGEuc291cmNlcyA9IHJlc29sdmVTb3VyY2VzU3luYyhtYXBEYXRhLm1hcCwgbWFwRGF0YS5zb3VyY2VzUmVsYXRpdmVUbywgcmVhZClcbiAgICByZXR1cm4gbWFwRGF0YVxuICB9XG5cblxuXG4gIHJldHVybiB7XG4gICAgcmVzb2x2ZVNvdXJjZU1hcDogICAgIHJlc29sdmVTb3VyY2VNYXAsXG4gICAgcmVzb2x2ZVNvdXJjZU1hcFN5bmM6IHJlc29sdmVTb3VyY2VNYXBTeW5jLFxuICAgIHJlc29sdmVTb3VyY2VzOiAgICAgICByZXNvbHZlU291cmNlcyxcbiAgICByZXNvbHZlU291cmNlc1N5bmM6ICAgcmVzb2x2ZVNvdXJjZXNTeW5jLFxuICAgIHJlc29sdmU6ICAgICAgICAgICAgICByZXNvbHZlLFxuICAgIHJlc29sdmVTeW5jOiAgICAgICAgICByZXNvbHZlU3luY1xuICB9XG5cbn0pKTtcbiIsIi8vIENvcHlyaWdodCAyMDE0IFNpbW9uIEx5ZGVsbFxyXG5cclxudm9pZCAoZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xyXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgZGVmaW5lKGZhY3RvcnkpXHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KClcclxuICB9IGVsc2Uge1xyXG4gICAgcm9vdC5zb3VyY2VNYXBwaW5nVVJMID0gZmFjdG9yeSgpXHJcbiAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaW5uZXJSZWdleCA9IC9bI0BdIHNvdXJjZU1hcHBpbmdVUkw9KFteXFxzJ1wiXSopL1xyXG4gIHZhciBuZXdsaW5lUmVnZXggPSAvXFxyXFxuP3xcXG4vXHJcblxyXG4gIHZhciByZWdleCA9IFJlZ0V4cChcclxuICAgIFwiKF58KD86XCIgKyBuZXdsaW5lUmVnZXguc291cmNlICsgXCIpKVwiICtcclxuICAgIFwiKD86XCIgK1xyXG4gICAgICBcIi9cXFxcKlwiICtcclxuICAgICAgXCIoPzpcXFxccyooPzpcIiArIG5ld2xpbmVSZWdleC5zb3VyY2UgKyBcIikoPzovLyk/KT9cIiArXHJcbiAgICAgIFwiKD86XCIgKyBpbm5lclJlZ2V4LnNvdXJjZSArIFwiKVwiICtcclxuICAgICAgXCJcXFxccypcIiArXHJcbiAgICAgIFwiXFxcXCovXCIgK1xyXG4gICAgICBcInxcIiArXHJcbiAgICAgIFwiLy8oPzpcIiArIGlubmVyUmVnZXguc291cmNlICsgXCIpXCIgK1xyXG4gICAgXCIpXCIgK1xyXG4gICAgXCJcXFxccyokXCJcclxuICApXHJcblxyXG4gIGZ1bmN0aW9uIFNvdXJjZU1hcHBpbmdVUkwoY29tbWVudFN5bnRheCkge1xyXG4gICAgdGhpcy5fY29tbWVudFN5bnRheCA9IGNvbW1lbnRTeW50YXhcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLnJlZ2V4ID0gcmVnZXhcclxuICBTb3VyY2VNYXBwaW5nVVJMLnByb3RvdHlwZS5faW5uZXJSZWdleCA9IGlubmVyUmVnZXhcclxuICBTb3VyY2VNYXBwaW5nVVJMLnByb3RvdHlwZS5fbmV3bGluZVJlZ2V4ID0gbmV3bGluZVJlZ2V4XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGNvZGUpIHtcclxuICAgIHZhciBtYXRjaCA9IGNvZGUubWF0Y2godGhpcy5yZWdleClcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICAgIHJldHVybiBtYXRjaFsyXSB8fCBtYXRjaFszXSB8fCBcIlwiXHJcbiAgfVxyXG5cclxuICBTb3VyY2VNYXBwaW5nVVJMLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbihjb2RlLCB1cmwsIGNvbW1lbnRTeW50YXgpIHtcclxuICAgIGlmICghY29tbWVudFN5bnRheCkge1xyXG4gICAgICBjb21tZW50U3ludGF4ID0gdGhpcy5fY29tbWVudFN5bnRheFxyXG4gICAgfVxyXG4gICAgLy8gVXNlIGEgbmV3bGluZSBwcmVzZW50IGluIHRoZSBjb2RlLCBvciBmYWxsIGJhY2sgdG8gJ1xcbicuXHJcbiAgICB2YXIgbmV3bGluZSA9IFN0cmluZyhjb2RlLm1hdGNoKHRoaXMuX25ld2xpbmVSZWdleCkgfHwgXCJcXG5cIilcclxuICAgIHZhciBvcGVuID0gY29tbWVudFN5bnRheFswXSwgY2xvc2UgPSBjb21tZW50U3ludGF4WzFdIHx8IFwiXCJcclxuICAgIGNvZGUgPSB0aGlzLnJlbW92ZShjb2RlKVxyXG4gICAgcmV0dXJuIGNvZGUgKyBuZXdsaW5lICsgb3BlbiArIFwiIyBzb3VyY2VNYXBwaW5nVVJMPVwiICsgdXJsICsgY2xvc2VcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGNvZGUpIHtcclxuICAgIHJldHVybiBjb2RlLnJlcGxhY2UodGhpcy5yZWdleCwgXCJcIilcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLmluc2VydEJlZm9yZSA9IGZ1bmN0aW9uKGNvZGUsIHN0cmluZykge1xyXG4gICAgdmFyIG1hdGNoID0gY29kZS5tYXRjaCh0aGlzLnJlZ2V4KVxyXG4gICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgIHZhciBoYXNOZXdsaW5lID0gQm9vbGVhbihtYXRjaFsxXSlcclxuICAgICAgcmV0dXJuIGNvZGUuc2xpY2UoMCwgbWF0Y2guaW5kZXgpICtcclxuICAgICAgICBzdHJpbmcgK1xyXG4gICAgICAgIChoYXNOZXdsaW5lID8gXCJcIiA6IFwiXFxuXCIpICtcclxuICAgICAgICBjb2RlLnNsaWNlKG1hdGNoLmluZGV4KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGNvZGUgKyBzdHJpbmdcclxuICAgIH1cclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLlNvdXJjZU1hcHBpbmdVUkwgPSBTb3VyY2VNYXBwaW5nVVJMXHJcblxyXG4gIHJldHVybiBuZXcgU291cmNlTWFwcGluZ1VSTChbXCIvKlwiLCBcIiAqL1wiXSlcclxuXHJcbn0pKTtcclxuIiwiLypcbiAqIENvcHlyaWdodCAyMDA5LTIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFLnR4dCBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuZXhwb3J0cy5Tb3VyY2VNYXBHZW5lcmF0b3IgPSByZXF1aXJlKCcuL3NvdXJjZS1tYXAvc291cmNlLW1hcC1nZW5lcmF0b3InKS5Tb3VyY2VNYXBHZW5lcmF0b3I7XG5leHBvcnRzLlNvdXJjZU1hcENvbnN1bWVyID0gcmVxdWlyZSgnLi9zb3VyY2UtbWFwL3NvdXJjZS1tYXAtY29uc3VtZXInKS5Tb3VyY2VNYXBDb25zdW1lcjtcbmV4cG9ydHMuU291cmNlTm9kZSA9IHJlcXVpcmUoJy4vc291cmNlLW1hcC9zb3VyY2Utbm9kZScpLlNvdXJjZU5vZGU7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG5cbiAgLyoqXG4gICAqIEEgZGF0YSBzdHJ1Y3R1cmUgd2hpY2ggaXMgYSBjb21iaW5hdGlvbiBvZiBhbiBhcnJheSBhbmQgYSBzZXQuIEFkZGluZyBhIG5ld1xuICAgKiBtZW1iZXIgaXMgTygxKSwgdGVzdGluZyBmb3IgbWVtYmVyc2hpcCBpcyBPKDEpLCBhbmQgZmluZGluZyB0aGUgaW5kZXggb2YgYW5cbiAgICogZWxlbWVudCBpcyBPKDEpLiBSZW1vdmluZyBlbGVtZW50cyBmcm9tIHRoZSBzZXQgaXMgbm90IHN1cHBvcnRlZC4gT25seVxuICAgKiBzdHJpbmdzIGFyZSBzdXBwb3J0ZWQgZm9yIG1lbWJlcnNoaXAuXG4gICAqL1xuICBmdW5jdGlvbiBBcnJheVNldCgpIHtcbiAgICB0aGlzLl9hcnJheSA9IFtdO1xuICAgIHRoaXMuX3NldCA9IHt9O1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXRpYyBtZXRob2QgZm9yIGNyZWF0aW5nIEFycmF5U2V0IGluc3RhbmNlcyBmcm9tIGFuIGV4aXN0aW5nIGFycmF5LlxuICAgKi9cbiAgQXJyYXlTZXQuZnJvbUFycmF5ID0gZnVuY3Rpb24gQXJyYXlTZXRfZnJvbUFycmF5KGFBcnJheSwgYUFsbG93RHVwbGljYXRlcykge1xuICAgIHZhciBzZXQgPSBuZXcgQXJyYXlTZXQoKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYUFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBzZXQuYWRkKGFBcnJheVtpXSwgYUFsbG93RHVwbGljYXRlcyk7XG4gICAgfVxuICAgIHJldHVybiBzZXQ7XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCB0aGUgZ2l2ZW4gc3RyaW5nIHRvIHRoaXMgc2V0LlxuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiBBcnJheVNldF9hZGQoYVN0ciwgYUFsbG93RHVwbGljYXRlcykge1xuICAgIHZhciBpc0R1cGxpY2F0ZSA9IHRoaXMuaGFzKGFTdHIpO1xuICAgIHZhciBpZHggPSB0aGlzLl9hcnJheS5sZW5ndGg7XG4gICAgaWYgKCFpc0R1cGxpY2F0ZSB8fCBhQWxsb3dEdXBsaWNhdGVzKSB7XG4gICAgICB0aGlzLl9hcnJheS5wdXNoKGFTdHIpO1xuICAgIH1cbiAgICBpZiAoIWlzRHVwbGljYXRlKSB7XG4gICAgICB0aGlzLl9zZXRbdXRpbC50b1NldFN0cmluZyhhU3RyKV0gPSBpZHg7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBJcyB0aGUgZ2l2ZW4gc3RyaW5nIGEgbWVtYmVyIG9mIHRoaXMgc2V0P1xuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiBBcnJheVNldF9oYXMoYVN0cikge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5fc2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXRpbC50b1NldFN0cmluZyhhU3RyKSk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFdoYXQgaXMgdGhlIGluZGV4IG9mIHRoZSBnaXZlbiBzdHJpbmcgaW4gdGhlIGFycmF5P1xuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5pbmRleE9mID0gZnVuY3Rpb24gQXJyYXlTZXRfaW5kZXhPZihhU3RyKSB7XG4gICAgaWYgKHRoaXMuaGFzKGFTdHIpKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc2V0W3V0aWwudG9TZXRTdHJpbmcoYVN0cildO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIGFTdHIgKyAnXCIgaXMgbm90IGluIHRoZSBzZXQuJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFdoYXQgaXMgdGhlIGVsZW1lbnQgYXQgdGhlIGdpdmVuIGluZGV4P1xuICAgKlxuICAgKiBAcGFyYW0gTnVtYmVyIGFJZHhcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5hdCA9IGZ1bmN0aW9uIEFycmF5U2V0X2F0KGFJZHgpIHtcbiAgICBpZiAoYUlkeCA+PSAwICYmIGFJZHggPCB0aGlzLl9hcnJheS5sZW5ndGgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9hcnJheVthSWR4XTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBlbGVtZW50IGluZGV4ZWQgYnkgJyArIGFJZHgpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBhcnJheSByZXByZXNlbnRhdGlvbiBvZiB0aGlzIHNldCAod2hpY2ggaGFzIHRoZSBwcm9wZXIgaW5kaWNlc1xuICAgKiBpbmRpY2F0ZWQgYnkgaW5kZXhPZikuIE5vdGUgdGhhdCB0aGlzIGlzIGEgY29weSBvZiB0aGUgaW50ZXJuYWwgYXJyYXkgdXNlZFxuICAgKiBmb3Igc3RvcmluZyB0aGUgbWVtYmVycyBzbyB0aGF0IG5vIG9uZSBjYW4gbWVzcyB3aXRoIGludGVybmFsIHN0YXRlLlxuICAgKi9cbiAgQXJyYXlTZXQucHJvdG90eXBlLnRvQXJyYXkgPSBmdW5jdGlvbiBBcnJheVNldF90b0FycmF5KCkge1xuICAgIHJldHVybiB0aGlzLl9hcnJheS5zbGljZSgpO1xuICB9O1xuXG4gIGV4cG9ydHMuQXJyYXlTZXQgPSBBcnJheVNldDtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICpcbiAqIEJhc2VkIG9uIHRoZSBCYXNlIDY0IFZMUSBpbXBsZW1lbnRhdGlvbiBpbiBDbG9zdXJlIENvbXBpbGVyOlxuICogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jbG9zdXJlLWNvbXBpbGVyL3NvdXJjZS9icm93c2UvdHJ1bmsvc3JjL2NvbS9nb29nbGUvZGVidWdnaW5nL3NvdXJjZW1hcC9CYXNlNjRWTFEuamF2YVxuICpcbiAqIENvcHlyaWdodCAyMDExIFRoZSBDbG9zdXJlIENvbXBpbGVyIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmVcbiAqIG1ldDpcbiAqXG4gKiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZVxuICogICAgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmdcbiAqICAgIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZFxuICogICAgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICogTmVpdGhlciB0aGUgbmFtZSBvZiBHb29nbGUgSW5jLiBub3IgdGhlIG5hbWVzIG9mIGl0c1xuICogICAgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0cyBkZXJpdmVkXG4gKiAgICBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SU1xuICogXCJBUyBJU1wiIEFORCBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVFxuICogTElNSVRFRCBUTywgVEhFIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SXG4gKiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVFxuICogT1dORVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1IgQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsXG4gKiBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UXG4gKiBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTOyBMT1NTIE9GIFVTRSxcbiAqIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OIEFOWVxuICogVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFXG4gKiBPRiBUSElTIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciBiYXNlNjQgPSByZXF1aXJlKCcuL2Jhc2U2NCcpO1xuXG4gIC8vIEEgc2luZ2xlIGJhc2UgNjQgZGlnaXQgY2FuIGNvbnRhaW4gNiBiaXRzIG9mIGRhdGEuIEZvciB0aGUgYmFzZSA2NCB2YXJpYWJsZVxuICAvLyBsZW5ndGggcXVhbnRpdGllcyB3ZSB1c2UgaW4gdGhlIHNvdXJjZSBtYXAgc3BlYywgdGhlIGZpcnN0IGJpdCBpcyB0aGUgc2lnbixcbiAgLy8gdGhlIG5leHQgZm91ciBiaXRzIGFyZSB0aGUgYWN0dWFsIHZhbHVlLCBhbmQgdGhlIDZ0aCBiaXQgaXMgdGhlXG4gIC8vIGNvbnRpbnVhdGlvbiBiaXQuIFRoZSBjb250aW51YXRpb24gYml0IHRlbGxzIHVzIHdoZXRoZXIgdGhlcmUgYXJlIG1vcmVcbiAgLy8gZGlnaXRzIGluIHRoaXMgdmFsdWUgZm9sbG93aW5nIHRoaXMgZGlnaXQuXG4gIC8vXG4gIC8vICAgQ29udGludWF0aW9uXG4gIC8vICAgfCAgICBTaWduXG4gIC8vICAgfCAgICB8XG4gIC8vICAgViAgICBWXG4gIC8vICAgMTAxMDExXG5cbiAgdmFyIFZMUV9CQVNFX1NISUZUID0gNTtcblxuICAvLyBiaW5hcnk6IDEwMDAwMFxuICB2YXIgVkxRX0JBU0UgPSAxIDw8IFZMUV9CQVNFX1NISUZUO1xuXG4gIC8vIGJpbmFyeTogMDExMTExXG4gIHZhciBWTFFfQkFTRV9NQVNLID0gVkxRX0JBU0UgLSAxO1xuXG4gIC8vIGJpbmFyeTogMTAwMDAwXG4gIHZhciBWTFFfQ09OVElOVUFUSU9OX0JJVCA9IFZMUV9CQVNFO1xuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBmcm9tIGEgdHdvLWNvbXBsZW1lbnQgdmFsdWUgdG8gYSB2YWx1ZSB3aGVyZSB0aGUgc2lnbiBiaXQgaXNcbiAgICogaXMgcGxhY2VkIGluIHRoZSBsZWFzdCBzaWduaWZpY2FudCBiaXQuICBGb3IgZXhhbXBsZSwgYXMgZGVjaW1hbHM6XG4gICAqICAgMSBiZWNvbWVzIDIgKDEwIGJpbmFyeSksIC0xIGJlY29tZXMgMyAoMTEgYmluYXJ5KVxuICAgKiAgIDIgYmVjb21lcyA0ICgxMDAgYmluYXJ5KSwgLTIgYmVjb21lcyA1ICgxMDEgYmluYXJ5KVxuICAgKi9cbiAgZnVuY3Rpb24gdG9WTFFTaWduZWQoYVZhbHVlKSB7XG4gICAgcmV0dXJuIGFWYWx1ZSA8IDBcbiAgICAgID8gKCgtYVZhbHVlKSA8PCAxKSArIDFcbiAgICAgIDogKGFWYWx1ZSA8PCAxKSArIDA7XG4gIH1cblxuICAvKipcbiAgICogQ29udmVydHMgdG8gYSB0d28tY29tcGxlbWVudCB2YWx1ZSBmcm9tIGEgdmFsdWUgd2hlcmUgdGhlIHNpZ24gYml0IGlzXG4gICAqIGlzIHBsYWNlZCBpbiB0aGUgbGVhc3Qgc2lnbmlmaWNhbnQgYml0LiAgRm9yIGV4YW1wbGUsIGFzIGRlY2ltYWxzOlxuICAgKiAgIDIgKDEwIGJpbmFyeSkgYmVjb21lcyAxLCAzICgxMSBiaW5hcnkpIGJlY29tZXMgLTFcbiAgICogICA0ICgxMDAgYmluYXJ5KSBiZWNvbWVzIDIsIDUgKDEwMSBiaW5hcnkpIGJlY29tZXMgLTJcbiAgICovXG4gIGZ1bmN0aW9uIGZyb21WTFFTaWduZWQoYVZhbHVlKSB7XG4gICAgdmFyIGlzTmVnYXRpdmUgPSAoYVZhbHVlICYgMSkgPT09IDE7XG4gICAgdmFyIHNoaWZ0ZWQgPSBhVmFsdWUgPj4gMTtcbiAgICByZXR1cm4gaXNOZWdhdGl2ZVxuICAgICAgPyAtc2hpZnRlZFxuICAgICAgOiBzaGlmdGVkO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGJhc2UgNjQgVkxRIGVuY29kZWQgdmFsdWUuXG4gICAqL1xuICBleHBvcnRzLmVuY29kZSA9IGZ1bmN0aW9uIGJhc2U2NFZMUV9lbmNvZGUoYVZhbHVlKSB7XG4gICAgdmFyIGVuY29kZWQgPSBcIlwiO1xuICAgIHZhciBkaWdpdDtcblxuICAgIHZhciB2bHEgPSB0b1ZMUVNpZ25lZChhVmFsdWUpO1xuXG4gICAgZG8ge1xuICAgICAgZGlnaXQgPSB2bHEgJiBWTFFfQkFTRV9NQVNLO1xuICAgICAgdmxxID4+Pj0gVkxRX0JBU0VfU0hJRlQ7XG4gICAgICBpZiAodmxxID4gMCkge1xuICAgICAgICAvLyBUaGVyZSBhcmUgc3RpbGwgbW9yZSBkaWdpdHMgaW4gdGhpcyB2YWx1ZSwgc28gd2UgbXVzdCBtYWtlIHN1cmUgdGhlXG4gICAgICAgIC8vIGNvbnRpbnVhdGlvbiBiaXQgaXMgbWFya2VkLlxuICAgICAgICBkaWdpdCB8PSBWTFFfQ09OVElOVUFUSU9OX0JJVDtcbiAgICAgIH1cbiAgICAgIGVuY29kZWQgKz0gYmFzZTY0LmVuY29kZShkaWdpdCk7XG4gICAgfSB3aGlsZSAodmxxID4gMCk7XG5cbiAgICByZXR1cm4gZW5jb2RlZDtcbiAgfTtcblxuICAvKipcbiAgICogRGVjb2RlcyB0aGUgbmV4dCBiYXNlIDY0IFZMUSB2YWx1ZSBmcm9tIHRoZSBnaXZlbiBzdHJpbmcgYW5kIHJldHVybnMgdGhlXG4gICAqIHZhbHVlIGFuZCB0aGUgcmVzdCBvZiB0aGUgc3RyaW5nLlxuICAgKi9cbiAgZXhwb3J0cy5kZWNvZGUgPSBmdW5jdGlvbiBiYXNlNjRWTFFfZGVjb2RlKGFTdHIpIHtcbiAgICB2YXIgaSA9IDA7XG4gICAgdmFyIHN0ckxlbiA9IGFTdHIubGVuZ3RoO1xuICAgIHZhciByZXN1bHQgPSAwO1xuICAgIHZhciBzaGlmdCA9IDA7XG4gICAgdmFyIGNvbnRpbnVhdGlvbiwgZGlnaXQ7XG5cbiAgICBkbyB7XG4gICAgICBpZiAoaSA+PSBzdHJMZW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgbW9yZSBkaWdpdHMgaW4gYmFzZSA2NCBWTFEgdmFsdWUuXCIpO1xuICAgICAgfVxuICAgICAgZGlnaXQgPSBiYXNlNjQuZGVjb2RlKGFTdHIuY2hhckF0KGkrKykpO1xuICAgICAgY29udGludWF0aW9uID0gISEoZGlnaXQgJiBWTFFfQ09OVElOVUFUSU9OX0JJVCk7XG4gICAgICBkaWdpdCAmPSBWTFFfQkFTRV9NQVNLO1xuICAgICAgcmVzdWx0ID0gcmVzdWx0ICsgKGRpZ2l0IDw8IHNoaWZ0KTtcbiAgICAgIHNoaWZ0ICs9IFZMUV9CQVNFX1NISUZUO1xuICAgIH0gd2hpbGUgKGNvbnRpbnVhdGlvbik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmFsdWU6IGZyb21WTFFTaWduZWQocmVzdWx0KSxcbiAgICAgIHJlc3Q6IGFTdHIuc2xpY2UoaSlcbiAgICB9O1xuICB9O1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIGNoYXJUb0ludE1hcCA9IHt9O1xuICB2YXIgaW50VG9DaGFyTWFwID0ge307XG5cbiAgJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5mb3JFYWNoKGZ1bmN0aW9uIChjaCwgaW5kZXgpIHtcbiAgICAgIGNoYXJUb0ludE1hcFtjaF0gPSBpbmRleDtcbiAgICAgIGludFRvQ2hhck1hcFtpbmRleF0gPSBjaDtcbiAgICB9KTtcblxuICAvKipcbiAgICogRW5jb2RlIGFuIGludGVnZXIgaW4gdGhlIHJhbmdlIG9mIDAgdG8gNjMgdG8gYSBzaW5nbGUgYmFzZSA2NCBkaWdpdC5cbiAgICovXG4gIGV4cG9ydHMuZW5jb2RlID0gZnVuY3Rpb24gYmFzZTY0X2VuY29kZShhTnVtYmVyKSB7XG4gICAgaWYgKGFOdW1iZXIgaW4gaW50VG9DaGFyTWFwKSB7XG4gICAgICByZXR1cm4gaW50VG9DaGFyTWFwW2FOdW1iZXJdO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBiZSBiZXR3ZWVuIDAgYW5kIDYzOiBcIiArIGFOdW1iZXIpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBEZWNvZGUgYSBzaW5nbGUgYmFzZSA2NCBkaWdpdCB0byBhbiBpbnRlZ2VyLlxuICAgKi9cbiAgZXhwb3J0cy5kZWNvZGUgPSBmdW5jdGlvbiBiYXNlNjRfZGVjb2RlKGFDaGFyKSB7XG4gICAgaWYgKGFDaGFyIGluIGNoYXJUb0ludE1hcCkge1xuICAgICAgcmV0dXJuIGNoYXJUb0ludE1hcFthQ2hhcl07XG4gICAgfVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJOb3QgYSB2YWxpZCBiYXNlIDY0IGRpZ2l0OiBcIiArIGFDaGFyKTtcbiAgfTtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIC8qKlxuICAgKiBSZWN1cnNpdmUgaW1wbGVtZW50YXRpb24gb2YgYmluYXJ5IHNlYXJjaC5cbiAgICpcbiAgICogQHBhcmFtIGFMb3cgSW5kaWNlcyBoZXJlIGFuZCBsb3dlciBkbyBub3QgY29udGFpbiB0aGUgbmVlZGxlLlxuICAgKiBAcGFyYW0gYUhpZ2ggSW5kaWNlcyBoZXJlIGFuZCBoaWdoZXIgZG8gbm90IGNvbnRhaW4gdGhlIG5lZWRsZS5cbiAgICogQHBhcmFtIGFOZWVkbGUgVGhlIGVsZW1lbnQgYmVpbmcgc2VhcmNoZWQgZm9yLlxuICAgKiBAcGFyYW0gYUhheXN0YWNrIFRoZSBub24tZW1wdHkgYXJyYXkgYmVpbmcgc2VhcmNoZWQuXG4gICAqIEBwYXJhbSBhQ29tcGFyZSBGdW5jdGlvbiB3aGljaCB0YWtlcyB0d28gZWxlbWVudHMgYW5kIHJldHVybnMgLTEsIDAsIG9yIDEuXG4gICAqL1xuICBmdW5jdGlvbiByZWN1cnNpdmVTZWFyY2goYUxvdywgYUhpZ2gsIGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpIHtcbiAgICAvLyBUaGlzIGZ1bmN0aW9uIHRlcm1pbmF0ZXMgd2hlbiBvbmUgb2YgdGhlIGZvbGxvd2luZyBpcyB0cnVlOlxuICAgIC8vXG4gICAgLy8gICAxLiBXZSBmaW5kIHRoZSBleGFjdCBlbGVtZW50IHdlIGFyZSBsb29raW5nIGZvci5cbiAgICAvL1xuICAgIC8vICAgMi4gV2UgZGlkIG5vdCBmaW5kIHRoZSBleGFjdCBlbGVtZW50LCBidXQgd2UgY2FuIHJldHVybiB0aGUgbmV4dFxuICAgIC8vICAgICAgY2xvc2VzdCBlbGVtZW50IHRoYXQgaXMgbGVzcyB0aGFuIHRoYXQgZWxlbWVudC5cbiAgICAvL1xuICAgIC8vICAgMy4gV2UgZGlkIG5vdCBmaW5kIHRoZSBleGFjdCBlbGVtZW50LCBhbmQgdGhlcmUgaXMgbm8gbmV4dC1jbG9zZXN0XG4gICAgLy8gICAgICBlbGVtZW50IHdoaWNoIGlzIGxlc3MgdGhhbiB0aGUgb25lIHdlIGFyZSBzZWFyY2hpbmcgZm9yLCBzbyB3ZVxuICAgIC8vICAgICAgcmV0dXJuIG51bGwuXG4gICAgdmFyIG1pZCA9IE1hdGguZmxvb3IoKGFIaWdoIC0gYUxvdykgLyAyKSArIGFMb3c7XG4gICAgdmFyIGNtcCA9IGFDb21wYXJlKGFOZWVkbGUsIGFIYXlzdGFja1ttaWRdLCB0cnVlKTtcbiAgICBpZiAoY21wID09PSAwKSB7XG4gICAgICAvLyBGb3VuZCB0aGUgZWxlbWVudCB3ZSBhcmUgbG9va2luZyBmb3IuXG4gICAgICByZXR1cm4gYUhheXN0YWNrW21pZF07XG4gICAgfVxuICAgIGVsc2UgaWYgKGNtcCA+IDApIHtcbiAgICAgIC8vIGFIYXlzdGFja1ttaWRdIGlzIGdyZWF0ZXIgdGhhbiBvdXIgbmVlZGxlLlxuICAgICAgaWYgKGFIaWdoIC0gbWlkID4gMSkge1xuICAgICAgICAvLyBUaGUgZWxlbWVudCBpcyBpbiB0aGUgdXBwZXIgaGFsZi5cbiAgICAgICAgcmV0dXJuIHJlY3Vyc2l2ZVNlYXJjaChtaWQsIGFIaWdoLCBhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKTtcbiAgICAgIH1cbiAgICAgIC8vIFdlIGRpZCBub3QgZmluZCBhbiBleGFjdCBtYXRjaCwgcmV0dXJuIHRoZSBuZXh0IGNsb3Nlc3Qgb25lXG4gICAgICAvLyAodGVybWluYXRpb24gY2FzZSAyKS5cbiAgICAgIHJldHVybiBhSGF5c3RhY2tbbWlkXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAvLyBhSGF5c3RhY2tbbWlkXSBpcyBsZXNzIHRoYW4gb3VyIG5lZWRsZS5cbiAgICAgIGlmIChtaWQgLSBhTG93ID4gMSkge1xuICAgICAgICAvLyBUaGUgZWxlbWVudCBpcyBpbiB0aGUgbG93ZXIgaGFsZi5cbiAgICAgICAgcmV0dXJuIHJlY3Vyc2l2ZVNlYXJjaChhTG93LCBtaWQsIGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpO1xuICAgICAgfVxuICAgICAgLy8gVGhlIGV4YWN0IG5lZWRsZSBlbGVtZW50IHdhcyBub3QgZm91bmQgaW4gdGhpcyBoYXlzdGFjay4gRGV0ZXJtaW5lIGlmXG4gICAgICAvLyB3ZSBhcmUgaW4gdGVybWluYXRpb24gY2FzZSAoMikgb3IgKDMpIGFuZCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIHRoaW5nLlxuICAgICAgcmV0dXJuIGFMb3cgPCAwXG4gICAgICAgID8gbnVsbFxuICAgICAgICA6IGFIYXlzdGFja1thTG93XTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyBhbiBpbXBsZW1lbnRhdGlvbiBvZiBiaW5hcnkgc2VhcmNoIHdoaWNoIHdpbGwgYWx3YXlzIHRyeSBhbmQgcmV0dXJuXG4gICAqIHRoZSBuZXh0IGxvd2VzdCB2YWx1ZSBjaGVja2VkIGlmIHRoZXJlIGlzIG5vIGV4YWN0IGhpdC4gVGhpcyBpcyBiZWNhdXNlXG4gICAqIG1hcHBpbmdzIGJldHdlZW4gb3JpZ2luYWwgYW5kIGdlbmVyYXRlZCBsaW5lL2NvbCBwYWlycyBhcmUgc2luZ2xlIHBvaW50cyxcbiAgICogYW5kIHRoZXJlIGlzIGFuIGltcGxpY2l0IHJlZ2lvbiBiZXR3ZWVuIGVhY2ggb2YgdGhlbSwgc28gYSBtaXNzIGp1c3QgbWVhbnNcbiAgICogdGhhdCB5b3UgYXJlbid0IG9uIHRoZSB2ZXJ5IHN0YXJ0IG9mIGEgcmVnaW9uLlxuICAgKlxuICAgKiBAcGFyYW0gYU5lZWRsZSBUaGUgZWxlbWVudCB5b3UgYXJlIGxvb2tpbmcgZm9yLlxuICAgKiBAcGFyYW0gYUhheXN0YWNrIFRoZSBhcnJheSB0aGF0IGlzIGJlaW5nIHNlYXJjaGVkLlxuICAgKiBAcGFyYW0gYUNvbXBhcmUgQSBmdW5jdGlvbiB3aGljaCB0YWtlcyB0aGUgbmVlZGxlIGFuZCBhbiBlbGVtZW50IGluIHRoZVxuICAgKiAgICAgYXJyYXkgYW5kIHJldHVybnMgLTEsIDAsIG9yIDEgZGVwZW5kaW5nIG9uIHdoZXRoZXIgdGhlIG5lZWRsZSBpcyBsZXNzXG4gICAqICAgICB0aGFuLCBlcXVhbCB0bywgb3IgZ3JlYXRlciB0aGFuIHRoZSBlbGVtZW50LCByZXNwZWN0aXZlbHkuXG4gICAqL1xuICBleHBvcnRzLnNlYXJjaCA9IGZ1bmN0aW9uIHNlYXJjaChhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKSB7XG4gICAgcmV0dXJuIGFIYXlzdGFjay5sZW5ndGggPiAwXG4gICAgICA/IHJlY3Vyc2l2ZVNlYXJjaCgtMSwgYUhheXN0YWNrLmxlbmd0aCwgYU5lZWRsZSwgYUhheXN0YWNrLCBhQ29tcGFyZSlcbiAgICAgIDogbnVsbDtcbiAgfTtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG4gIHZhciBiaW5hcnlTZWFyY2ggPSByZXF1aXJlKCcuL2JpbmFyeS1zZWFyY2gnKTtcbiAgdmFyIEFycmF5U2V0ID0gcmVxdWlyZSgnLi9hcnJheS1zZXQnKS5BcnJheVNldDtcbiAgdmFyIGJhc2U2NFZMUSA9IHJlcXVpcmUoJy4vYmFzZTY0LXZscScpO1xuXG4gIC8qKlxuICAgKiBBIFNvdXJjZU1hcENvbnN1bWVyIGluc3RhbmNlIHJlcHJlc2VudHMgYSBwYXJzZWQgc291cmNlIG1hcCB3aGljaCB3ZSBjYW5cbiAgICogcXVlcnkgZm9yIGluZm9ybWF0aW9uIGFib3V0IHRoZSBvcmlnaW5hbCBmaWxlIHBvc2l0aW9ucyBieSBnaXZpbmcgaXQgYSBmaWxlXG4gICAqIHBvc2l0aW9uIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKlxuICAgKiBUaGUgb25seSBwYXJhbWV0ZXIgaXMgdGhlIHJhdyBzb3VyY2UgbWFwIChlaXRoZXIgYXMgYSBKU09OIHN0cmluZywgb3JcbiAgICogYWxyZWFkeSBwYXJzZWQgdG8gYW4gb2JqZWN0KS4gQWNjb3JkaW5nIHRvIHRoZSBzcGVjLCBzb3VyY2UgbWFwcyBoYXZlIHRoZVxuICAgKiBmb2xsb3dpbmcgYXR0cmlidXRlczpcbiAgICpcbiAgICogICAtIHZlcnNpb246IFdoaWNoIHZlcnNpb24gb2YgdGhlIHNvdXJjZSBtYXAgc3BlYyB0aGlzIG1hcCBpcyBmb2xsb3dpbmcuXG4gICAqICAgLSBzb3VyY2VzOiBBbiBhcnJheSBvZiBVUkxzIHRvIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXMuXG4gICAqICAgLSBuYW1lczogQW4gYXJyYXkgb2YgaWRlbnRpZmllcnMgd2hpY2ggY2FuIGJlIHJlZmVycmVuY2VkIGJ5IGluZGl2aWR1YWwgbWFwcGluZ3MuXG4gICAqICAgLSBzb3VyY2VSb290OiBPcHRpb25hbC4gVGhlIFVSTCByb290IGZyb20gd2hpY2ggYWxsIHNvdXJjZXMgYXJlIHJlbGF0aXZlLlxuICAgKiAgIC0gc291cmNlc0NvbnRlbnQ6IE9wdGlvbmFsLiBBbiBhcnJheSBvZiBjb250ZW50cyBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzLlxuICAgKiAgIC0gbWFwcGluZ3M6IEEgc3RyaW5nIG9mIGJhc2U2NCBWTFFzIHdoaWNoIGNvbnRhaW4gdGhlIGFjdHVhbCBtYXBwaW5ncy5cbiAgICogICAtIGZpbGU6IE9wdGlvbmFsLiBUaGUgZ2VuZXJhdGVkIGZpbGUgdGhpcyBzb3VyY2UgbWFwIGlzIGFzc29jaWF0ZWQgd2l0aC5cbiAgICpcbiAgICogSGVyZSBpcyBhbiBleGFtcGxlIHNvdXJjZSBtYXAsIHRha2VuIGZyb20gdGhlIHNvdXJjZSBtYXAgc3BlY1swXTpcbiAgICpcbiAgICogICAgIHtcbiAgICogICAgICAgdmVyc2lvbiA6IDMsXG4gICAqICAgICAgIGZpbGU6IFwib3V0LmpzXCIsXG4gICAqICAgICAgIHNvdXJjZVJvb3QgOiBcIlwiLFxuICAgKiAgICAgICBzb3VyY2VzOiBbXCJmb28uanNcIiwgXCJiYXIuanNcIl0sXG4gICAqICAgICAgIG5hbWVzOiBbXCJzcmNcIiwgXCJtYXBzXCIsIFwiYXJlXCIsIFwiZnVuXCJdLFxuICAgKiAgICAgICBtYXBwaW5nczogXCJBQSxBQjs7QUJDREU7XCJcbiAgICogICAgIH1cbiAgICpcbiAgICogWzBdOiBodHRwczovL2RvY3MuZ29vZ2xlLmNvbS9kb2N1bWVudC9kLzFVMVJHQWVoUXdSeXBVVG92RjFLUmxwaU9GemUwYi1fMmdjNmZBSDBLWTBrL2VkaXQ/cGxpPTEjXG4gICAqL1xuICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcihhU291cmNlTWFwKSB7XG4gICAgdmFyIHNvdXJjZU1hcCA9IGFTb3VyY2VNYXA7XG4gICAgaWYgKHR5cGVvZiBhU291cmNlTWFwID09PSAnc3RyaW5nJykge1xuICAgICAgc291cmNlTWFwID0gSlNPTi5wYXJzZShhU291cmNlTWFwLnJlcGxhY2UoL15cXClcXF1cXH0nLywgJycpKTtcbiAgICB9XG5cbiAgICB2YXIgdmVyc2lvbiA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3ZlcnNpb24nKTtcbiAgICB2YXIgc291cmNlcyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZXMnKTtcbiAgICAvLyBTYXNzIDMuMyBsZWF2ZXMgb3V0IHRoZSAnbmFtZXMnIGFycmF5LCBzbyB3ZSBkZXZpYXRlIGZyb20gdGhlIHNwZWMgKHdoaWNoXG4gICAgLy8gcmVxdWlyZXMgdGhlIGFycmF5KSB0byBwbGF5IG5pY2UgaGVyZS5cbiAgICB2YXIgbmFtZXMgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICduYW1lcycsIFtdKTtcbiAgICB2YXIgc291cmNlUm9vdCA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZVJvb3QnLCBudWxsKTtcbiAgICB2YXIgc291cmNlc0NvbnRlbnQgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICdzb3VyY2VzQ29udGVudCcsIG51bGwpO1xuICAgIHZhciBtYXBwaW5ncyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ21hcHBpbmdzJyk7XG4gICAgdmFyIGZpbGUgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICdmaWxlJywgbnVsbCk7XG5cbiAgICAvLyBPbmNlIGFnYWluLCBTYXNzIGRldmlhdGVzIGZyb20gdGhlIHNwZWMgYW5kIHN1cHBsaWVzIHRoZSB2ZXJzaW9uIGFzIGFcbiAgICAvLyBzdHJpbmcgcmF0aGVyIHRoYW4gYSBudW1iZXIsIHNvIHdlIHVzZSBsb29zZSBlcXVhbGl0eSBjaGVja2luZyBoZXJlLlxuICAgIGlmICh2ZXJzaW9uICE9IHRoaXMuX3ZlcnNpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgdmVyc2lvbjogJyArIHZlcnNpb24pO1xuICAgIH1cblxuICAgIC8vIFBhc3MgYHRydWVgIGJlbG93IHRvIGFsbG93IGR1cGxpY2F0ZSBuYW1lcyBhbmQgc291cmNlcy4gV2hpbGUgc291cmNlIG1hcHNcbiAgICAvLyBhcmUgaW50ZW5kZWQgdG8gYmUgY29tcHJlc3NlZCBhbmQgZGVkdXBsaWNhdGVkLCB0aGUgVHlwZVNjcmlwdCBjb21waWxlclxuICAgIC8vIHNvbWV0aW1lcyBnZW5lcmF0ZXMgc291cmNlIG1hcHMgd2l0aCBkdXBsaWNhdGVzIGluIHRoZW0uIFNlZSBHaXRodWIgaXNzdWVcbiAgICAvLyAjNzIgYW5kIGJ1Z3ppbC5sYS84ODk0OTIuXG4gICAgdGhpcy5fbmFtZXMgPSBBcnJheVNldC5mcm9tQXJyYXkobmFtZXMsIHRydWUpO1xuICAgIHRoaXMuX3NvdXJjZXMgPSBBcnJheVNldC5mcm9tQXJyYXkoc291cmNlcywgdHJ1ZSk7XG5cbiAgICB0aGlzLnNvdXJjZVJvb3QgPSBzb3VyY2VSb290O1xuICAgIHRoaXMuc291cmNlc0NvbnRlbnQgPSBzb3VyY2VzQ29udGVudDtcbiAgICB0aGlzLl9tYXBwaW5ncyA9IG1hcHBpbmdzO1xuICAgIHRoaXMuZmlsZSA9IGZpbGU7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgU291cmNlTWFwQ29uc3VtZXIgZnJvbSBhIFNvdXJjZU1hcEdlbmVyYXRvci5cbiAgICpcbiAgICogQHBhcmFtIFNvdXJjZU1hcEdlbmVyYXRvciBhU291cmNlTWFwXG4gICAqICAgICAgICBUaGUgc291cmNlIG1hcCB0aGF0IHdpbGwgYmUgY29uc3VtZWQuXG4gICAqIEByZXR1cm5zIFNvdXJjZU1hcENvbnN1bWVyXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5mcm9tU291cmNlTWFwID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9mcm9tU291cmNlTWFwKGFTb3VyY2VNYXApIHtcbiAgICAgIHZhciBzbWMgPSBPYmplY3QuY3JlYXRlKFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZSk7XG5cbiAgICAgIHNtYy5fbmFtZXMgPSBBcnJheVNldC5mcm9tQXJyYXkoYVNvdXJjZU1hcC5fbmFtZXMudG9BcnJheSgpLCB0cnVlKTtcbiAgICAgIHNtYy5fc291cmNlcyA9IEFycmF5U2V0LmZyb21BcnJheShhU291cmNlTWFwLl9zb3VyY2VzLnRvQXJyYXkoKSwgdHJ1ZSk7XG4gICAgICBzbWMuc291cmNlUm9vdCA9IGFTb3VyY2VNYXAuX3NvdXJjZVJvb3Q7XG4gICAgICBzbWMuc291cmNlc0NvbnRlbnQgPSBhU291cmNlTWFwLl9nZW5lcmF0ZVNvdXJjZXNDb250ZW50KHNtYy5fc291cmNlcy50b0FycmF5KCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNtYy5zb3VyY2VSb290KTtcbiAgICAgIHNtYy5maWxlID0gYVNvdXJjZU1hcC5fZmlsZTtcblxuICAgICAgc21jLl9fZ2VuZXJhdGVkTWFwcGluZ3MgPSBhU291cmNlTWFwLl9tYXBwaW5ncy5zbGljZSgpXG4gICAgICAgIC5zb3J0KHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcbiAgICAgIHNtYy5fX29yaWdpbmFsTWFwcGluZ3MgPSBhU291cmNlTWFwLl9tYXBwaW5ncy5zbGljZSgpXG4gICAgICAgIC5zb3J0KHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuXG4gICAgICByZXR1cm4gc21jO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwcGluZyBzcGVjIHRoYXQgd2UgYXJlIGNvbnN1bWluZy5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fdmVyc2lvbiA9IDM7XG5cbiAgLyoqXG4gICAqIFRoZSBsaXN0IG9mIG9yaWdpbmFsIHNvdXJjZXMuXG4gICAqL1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLCAnc291cmNlcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zb3VyY2VzLnRvQXJyYXkoKS5tYXAoZnVuY3Rpb24gKHMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlUm9vdCA/IHV0aWwuam9pbih0aGlzLnNvdXJjZVJvb3QsIHMpIDogcztcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gYF9fZ2VuZXJhdGVkTWFwcGluZ3NgIGFuZCBgX19vcmlnaW5hbE1hcHBpbmdzYCBhcmUgYXJyYXlzIHRoYXQgaG9sZCB0aGVcbiAgLy8gcGFyc2VkIG1hcHBpbmcgY29vcmRpbmF0ZXMgZnJvbSB0aGUgc291cmNlIG1hcCdzIFwibWFwcGluZ3NcIiBhdHRyaWJ1dGUuIFRoZXlcbiAgLy8gYXJlIGxhemlseSBpbnN0YW50aWF0ZWQsIGFjY2Vzc2VkIHZpYSB0aGUgYF9nZW5lcmF0ZWRNYXBwaW5nc2AgYW5kXG4gIC8vIGBfb3JpZ2luYWxNYXBwaW5nc2AgZ2V0dGVycyByZXNwZWN0aXZlbHksIGFuZCB3ZSBvbmx5IHBhcnNlIHRoZSBtYXBwaW5nc1xuICAvLyBhbmQgY3JlYXRlIHRoZXNlIGFycmF5cyBvbmNlIHF1ZXJpZWQgZm9yIGEgc291cmNlIGxvY2F0aW9uLiBXZSBqdW1wIHRocm91Z2hcbiAgLy8gdGhlc2UgaG9vcHMgYmVjYXVzZSB0aGVyZSBjYW4gYmUgbWFueSB0aG91c2FuZHMgb2YgbWFwcGluZ3MsIGFuZCBwYXJzaW5nXG4gIC8vIHRoZW0gaXMgZXhwZW5zaXZlLCBzbyB3ZSBvbmx5IHdhbnQgdG8gZG8gaXQgaWYgd2UgbXVzdC5cbiAgLy9cbiAgLy8gRWFjaCBvYmplY3QgaW4gdGhlIGFycmF5cyBpcyBvZiB0aGUgZm9ybTpcbiAgLy9cbiAgLy8gICAgIHtcbiAgLy8gICAgICAgZ2VuZXJhdGVkTGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgY29kZSxcbiAgLy8gICAgICAgZ2VuZXJhdGVkQ29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIGNvZGUsXG4gIC8vICAgICAgIHNvdXJjZTogVGhlIHBhdGggdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlIHRoYXQgZ2VuZXJhdGVkIHRoaXNcbiAgLy8gICAgICAgICAgICAgICBjaHVuayBvZiBjb2RlLFxuICAvLyAgICAgICBvcmlnaW5hbExpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlIHRoYXRcbiAgLy8gICAgICAgICAgICAgICAgICAgICBjb3JyZXNwb25kcyB0byB0aGlzIGNodW5rIG9mIGdlbmVyYXRlZCBjb2RlLFxuICAvLyAgICAgICBvcmlnaW5hbENvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZSB0aGF0XG4gIC8vICAgICAgICAgICAgICAgICAgICAgICBjb3JyZXNwb25kcyB0byB0aGlzIGNodW5rIG9mIGdlbmVyYXRlZCBjb2RlLFxuICAvLyAgICAgICBuYW1lOiBUaGUgbmFtZSBvZiB0aGUgb3JpZ2luYWwgc3ltYm9sIHdoaWNoIGdlbmVyYXRlZCB0aGlzIGNodW5rIG9mXG4gIC8vICAgICAgICAgICAgIGNvZGUuXG4gIC8vICAgICB9XG4gIC8vXG4gIC8vIEFsbCBwcm9wZXJ0aWVzIGV4Y2VwdCBmb3IgYGdlbmVyYXRlZExpbmVgIGFuZCBgZ2VuZXJhdGVkQ29sdW1uYCBjYW4gYmVcbiAgLy8gYG51bGxgLlxuICAvL1xuICAvLyBgX2dlbmVyYXRlZE1hcHBpbmdzYCBpcyBvcmRlcmVkIGJ5IHRoZSBnZW5lcmF0ZWQgcG9zaXRpb25zLlxuICAvL1xuICAvLyBgX29yaWdpbmFsTWFwcGluZ3NgIGlzIG9yZGVyZWQgYnkgdGhlIG9yaWdpbmFsIHBvc2l0aW9ucy5cblxuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IG51bGw7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUsICdfZ2VuZXJhdGVkTWFwcGluZ3MnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoIXRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncykge1xuICAgICAgICB0aGlzLl9fZ2VuZXJhdGVkTWFwcGluZ3MgPSBbXTtcbiAgICAgICAgdGhpcy5fX29yaWdpbmFsTWFwcGluZ3MgPSBbXTtcbiAgICAgICAgdGhpcy5fcGFyc2VNYXBwaW5ncyh0aGlzLl9tYXBwaW5ncywgdGhpcy5zb3VyY2VSb290KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncztcbiAgICB9XG4gIH0pO1xuXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fX29yaWdpbmFsTWFwcGluZ3MgPSBudWxsO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLCAnX29yaWdpbmFsTWFwcGluZ3MnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoIXRoaXMuX19vcmlnaW5hbE1hcHBpbmdzKSB7XG4gICAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wYXJzZU1hcHBpbmdzKHRoaXMuX21hcHBpbmdzLCB0aGlzLnNvdXJjZVJvb3QpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fX29yaWdpbmFsTWFwcGluZ3M7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogUGFyc2UgdGhlIG1hcHBpbmdzIGluIGEgc3RyaW5nIGluIHRvIGEgZGF0YSBzdHJ1Y3R1cmUgd2hpY2ggd2UgY2FuIGVhc2lseVxuICAgKiBxdWVyeSAodGhlIG9yZGVyZWQgYXJyYXlzIGluIHRoZSBgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzYCBhbmRcbiAgICogYHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzYCBwcm9wZXJ0aWVzKS5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fcGFyc2VNYXBwaW5ncyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfcGFyc2VNYXBwaW5ncyhhU3RyLCBhU291cmNlUm9vdCkge1xuICAgICAgdmFyIGdlbmVyYXRlZExpbmUgPSAxO1xuICAgICAgdmFyIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgIHZhciBwcmV2aW91c09yaWdpbmFsTGluZSA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNTb3VyY2UgPSAwO1xuICAgICAgdmFyIHByZXZpb3VzTmFtZSA9IDA7XG4gICAgICB2YXIgbWFwcGluZ1NlcGFyYXRvciA9IC9eWyw7XS87XG4gICAgICB2YXIgc3RyID0gYVN0cjtcbiAgICAgIHZhciBtYXBwaW5nO1xuICAgICAgdmFyIHRlbXA7XG5cbiAgICAgIHdoaWxlIChzdHIubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAoc3RyLmNoYXJBdCgwKSA9PT0gJzsnKSB7XG4gICAgICAgICAgZ2VuZXJhdGVkTGluZSsrO1xuICAgICAgICAgIHN0ciA9IHN0ci5zbGljZSgxKTtcbiAgICAgICAgICBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc3RyLmNoYXJBdCgwKSA9PT0gJywnKSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIG1hcHBpbmcgPSB7fTtcbiAgICAgICAgICBtYXBwaW5nLmdlbmVyYXRlZExpbmUgPSBnZW5lcmF0ZWRMaW5lO1xuXG4gICAgICAgICAgLy8gR2VuZXJhdGVkIGNvbHVtbi5cbiAgICAgICAgICB0ZW1wID0gYmFzZTY0VkxRLmRlY29kZShzdHIpO1xuICAgICAgICAgIG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uID0gcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gKyB0ZW1wLnZhbHVlO1xuICAgICAgICAgIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW47XG4gICAgICAgICAgc3RyID0gdGVtcC5yZXN0O1xuXG4gICAgICAgICAgaWYgKHN0ci5sZW5ndGggPiAwICYmICFtYXBwaW5nU2VwYXJhdG9yLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcbiAgICAgICAgICAgIC8vIE9yaWdpbmFsIHNvdXJjZS5cbiAgICAgICAgICAgIHRlbXAgPSBiYXNlNjRWTFEuZGVjb2RlKHN0cik7XG4gICAgICAgICAgICBtYXBwaW5nLnNvdXJjZSA9IHRoaXMuX3NvdXJjZXMuYXQocHJldmlvdXNTb3VyY2UgKyB0ZW1wLnZhbHVlKTtcbiAgICAgICAgICAgIHByZXZpb3VzU291cmNlICs9IHRlbXAudmFsdWU7XG4gICAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG4gICAgICAgICAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCB8fCBtYXBwaW5nU2VwYXJhdG9yLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCBhIHNvdXJjZSwgYnV0IG5vIGxpbmUgYW5kIGNvbHVtbicpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPcmlnaW5hbCBsaW5lLlxuICAgICAgICAgICAgdGVtcCA9IGJhc2U2NFZMUS5kZWNvZGUoc3RyKTtcbiAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxMaW5lID0gcHJldmlvdXNPcmlnaW5hbExpbmUgKyB0ZW1wLnZhbHVlO1xuICAgICAgICAgICAgcHJldmlvdXNPcmlnaW5hbExpbmUgPSBtYXBwaW5nLm9yaWdpbmFsTGluZTtcbiAgICAgICAgICAgIC8vIExpbmVzIGFyZSBzdG9yZWQgMC1iYXNlZFxuICAgICAgICAgICAgbWFwcGluZy5vcmlnaW5hbExpbmUgKz0gMTtcbiAgICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcbiAgICAgICAgICAgIGlmIChzdHIubGVuZ3RoID09PSAwIHx8IG1hcHBpbmdTZXBhcmF0b3IudGVzdChzdHIuY2hhckF0KDApKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIGEgc291cmNlIGFuZCBsaW5lLCBidXQgbm8gY29sdW1uJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9yaWdpbmFsIGNvbHVtbi5cbiAgICAgICAgICAgIHRlbXAgPSBiYXNlNjRWTFEuZGVjb2RlKHN0cik7XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uID0gcHJldmlvdXNPcmlnaW5hbENvbHVtbiArIHRlbXAudmFsdWU7XG4gICAgICAgICAgICBwcmV2aW91c09yaWdpbmFsQ29sdW1uID0gbWFwcGluZy5vcmlnaW5hbENvbHVtbjtcbiAgICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcblxuICAgICAgICAgICAgaWYgKHN0ci5sZW5ndGggPiAwICYmICFtYXBwaW5nU2VwYXJhdG9yLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcbiAgICAgICAgICAgICAgLy8gT3JpZ2luYWwgbmFtZS5cbiAgICAgICAgICAgICAgdGVtcCA9IGJhc2U2NFZMUS5kZWNvZGUoc3RyKTtcbiAgICAgICAgICAgICAgbWFwcGluZy5uYW1lID0gdGhpcy5fbmFtZXMuYXQocHJldmlvdXNOYW1lICsgdGVtcC52YWx1ZSk7XG4gICAgICAgICAgICAgIHByZXZpb3VzTmFtZSArPSB0ZW1wLnZhbHVlO1xuICAgICAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzLnB1c2gobWFwcGluZyk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBtYXBwaW5nLm9yaWdpbmFsTGluZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzLnB1c2gobWFwcGluZyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncy5zb3J0KHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcbiAgICAgIHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzLnNvcnQodXRpbC5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyk7XG4gICAgfTtcblxuICAvKipcbiAgICogRmluZCB0aGUgbWFwcGluZyB0aGF0IGJlc3QgbWF0Y2hlcyB0aGUgaHlwb3RoZXRpY2FsIFwibmVlZGxlXCIgbWFwcGluZyB0aGF0XG4gICAqIHdlIGFyZSBzZWFyY2hpbmcgZm9yIGluIHRoZSBnaXZlbiBcImhheXN0YWNrXCIgb2YgbWFwcGluZ3MuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuX2ZpbmRNYXBwaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9maW5kTWFwcGluZyhhTmVlZGxlLCBhTWFwcGluZ3MsIGFMaW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhQ29sdW1uTmFtZSwgYUNvbXBhcmF0b3IpIHtcbiAgICAgIC8vIFRvIHJldHVybiB0aGUgcG9zaXRpb24gd2UgYXJlIHNlYXJjaGluZyBmb3IsIHdlIG11c3QgZmlyc3QgZmluZCB0aGVcbiAgICAgIC8vIG1hcHBpbmcgZm9yIHRoZSBnaXZlbiBwb3NpdGlvbiBhbmQgdGhlbiByZXR1cm4gdGhlIG9wcG9zaXRlIHBvc2l0aW9uIGl0XG4gICAgICAvLyBwb2ludHMgdG8uIEJlY2F1c2UgdGhlIG1hcHBpbmdzIGFyZSBzb3J0ZWQsIHdlIGNhbiB1c2UgYmluYXJ5IHNlYXJjaCB0b1xuICAgICAgLy8gZmluZCB0aGUgYmVzdCBtYXBwaW5nLlxuXG4gICAgICBpZiAoYU5lZWRsZVthTGluZU5hbWVdIDw9IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignTGluZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byAxLCBnb3QgJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgYU5lZWRsZVthTGluZU5hbWVdKTtcbiAgICAgIH1cbiAgICAgIGlmIChhTmVlZGxlW2FDb2x1bW5OYW1lXSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ29sdW1uIG11c3QgYmUgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDAsIGdvdCAnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBhTmVlZGxlW2FDb2x1bW5OYW1lXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBiaW5hcnlTZWFyY2guc2VhcmNoKGFOZWVkbGUsIGFNYXBwaW5ncywgYUNvbXBhcmF0b3IpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG9yaWdpbmFsIHNvdXJjZSwgbGluZSwgYW5kIGNvbHVtbiBpbmZvcm1hdGlvbiBmb3IgdGhlIGdlbmVyYXRlZFxuICAgKiBzb3VyY2UncyBsaW5lIGFuZCBjb2x1bW4gcG9zaXRpb25zIHByb3ZpZGVkLiBUaGUgb25seSBhcmd1bWVudCBpcyBhbiBvYmplY3RcbiAgICogd2l0aCB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBsaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UuXG4gICAqICAgLSBjb2x1bW46IFRoZSBjb2x1bW4gbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKlxuICAgKiBhbmQgYW4gb2JqZWN0IGlzIHJldHVybmVkIHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gc291cmNlOiBUaGUgb3JpZ2luYWwgc291cmNlIGZpbGUsIG9yIG51bGwuXG4gICAqICAgLSBsaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZSwgb3IgbnVsbC5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZSwgb3IgbnVsbC5cbiAgICogICAtIG5hbWU6IFRoZSBvcmlnaW5hbCBpZGVudGlmaWVyLCBvciBudWxsLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLm9yaWdpbmFsUG9zaXRpb25Gb3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX29yaWdpbmFsUG9zaXRpb25Gb3IoYUFyZ3MpIHtcbiAgICAgIHZhciBuZWVkbGUgPSB7XG4gICAgICAgIGdlbmVyYXRlZExpbmU6IHV0aWwuZ2V0QXJnKGFBcmdzLCAnbGluZScpLFxuICAgICAgICBnZW5lcmF0ZWRDb2x1bW46IHV0aWwuZ2V0QXJnKGFBcmdzLCAnY29sdW1uJylcbiAgICAgIH07XG5cbiAgICAgIHZhciBtYXBwaW5nID0gdGhpcy5fZmluZE1hcHBpbmcobmVlZGxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9nZW5lcmF0ZWRNYXBwaW5ncyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW5lcmF0ZWRMaW5lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VuZXJhdGVkQ29sdW1uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcblxuICAgICAgaWYgKG1hcHBpbmcgJiYgbWFwcGluZy5nZW5lcmF0ZWRMaW5lID09PSBuZWVkbGUuZ2VuZXJhdGVkTGluZSkge1xuICAgICAgICB2YXIgc291cmNlID0gdXRpbC5nZXRBcmcobWFwcGluZywgJ3NvdXJjZScsIG51bGwpO1xuICAgICAgICBpZiAoc291cmNlICYmIHRoaXMuc291cmNlUm9vdCkge1xuICAgICAgICAgIHNvdXJjZSA9IHV0aWwuam9pbih0aGlzLnNvdXJjZVJvb3QsIHNvdXJjZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgICBsaW5lOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnb3JpZ2luYWxMaW5lJywgbnVsbCksXG4gICAgICAgICAgY29sdW1uOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnb3JpZ2luYWxDb2x1bW4nLCBudWxsKSxcbiAgICAgICAgICBuYW1lOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnbmFtZScsIG51bGwpXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNvdXJjZTogbnVsbCxcbiAgICAgICAgbGluZTogbnVsbCxcbiAgICAgICAgY29sdW1uOiBudWxsLFxuICAgICAgICBuYW1lOiBudWxsXG4gICAgICB9O1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG9yaWdpbmFsIHNvdXJjZSBjb250ZW50LiBUaGUgb25seSBhcmd1bWVudCBpcyB0aGUgdXJsIG9mIHRoZVxuICAgKiBvcmlnaW5hbCBzb3VyY2UgZmlsZS4gUmV0dXJucyBudWxsIGlmIG5vIG9yaWdpbmFsIHNvdXJjZSBjb250ZW50IGlzXG4gICAqIGF2YWlsaWJsZS5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5zb3VyY2VDb250ZW50Rm9yID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9zb3VyY2VDb250ZW50Rm9yKGFTb3VyY2UpIHtcbiAgICAgIGlmICghdGhpcy5zb3VyY2VzQ29udGVudCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc291cmNlUm9vdCkge1xuICAgICAgICBhU291cmNlID0gdXRpbC5yZWxhdGl2ZSh0aGlzLnNvdXJjZVJvb3QsIGFTb3VyY2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fc291cmNlcy5oYXMoYVNvdXJjZSkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKGFTb3VyY2UpXTtcbiAgICAgIH1cblxuICAgICAgdmFyIHVybDtcbiAgICAgIGlmICh0aGlzLnNvdXJjZVJvb3RcbiAgICAgICAgICAmJiAodXJsID0gdXRpbC51cmxQYXJzZSh0aGlzLnNvdXJjZVJvb3QpKSkge1xuICAgICAgICAvLyBYWFg6IGZpbGU6Ly8gVVJJcyBhbmQgYWJzb2x1dGUgcGF0aHMgbGVhZCB0byB1bmV4cGVjdGVkIGJlaGF2aW9yIGZvclxuICAgICAgICAvLyBtYW55IHVzZXJzLiBXZSBjYW4gaGVscCB0aGVtIG91dCB3aGVuIHRoZXkgZXhwZWN0IGZpbGU6Ly8gVVJJcyB0b1xuICAgICAgICAvLyBiZWhhdmUgbGlrZSBpdCB3b3VsZCBpZiB0aGV5IHdlcmUgcnVubmluZyBhIGxvY2FsIEhUVFAgc2VydmVyLiBTZWVcbiAgICAgICAgLy8gaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9ODg1NTk3LlxuICAgICAgICB2YXIgZmlsZVVyaUFic1BhdGggPSBhU291cmNlLnJlcGxhY2UoL15maWxlOlxcL1xcLy8sIFwiXCIpO1xuICAgICAgICBpZiAodXJsLnNjaGVtZSA9PSBcImZpbGVcIlxuICAgICAgICAgICAgJiYgdGhpcy5fc291cmNlcy5oYXMoZmlsZVVyaUFic1BhdGgpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKGZpbGVVcmlBYnNQYXRoKV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgoIXVybC5wYXRoIHx8IHVybC5wYXRoID09IFwiL1wiKVxuICAgICAgICAgICAgJiYgdGhpcy5fc291cmNlcy5oYXMoXCIvXCIgKyBhU291cmNlKSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnNvdXJjZXNDb250ZW50W3RoaXMuX3NvdXJjZXMuaW5kZXhPZihcIi9cIiArIGFTb3VyY2UpXTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIGFTb3VyY2UgKyAnXCIgaXMgbm90IGluIHRoZSBTb3VyY2VNYXAuJyk7XG4gICAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgZ2VuZXJhdGVkIGxpbmUgYW5kIGNvbHVtbiBpbmZvcm1hdGlvbiBmb3IgdGhlIG9yaWdpbmFsIHNvdXJjZSxcbiAgICogbGluZSwgYW5kIGNvbHVtbiBwb3NpdGlvbnMgcHJvdmlkZWQuIFRoZSBvbmx5IGFyZ3VtZW50IGlzIGFuIG9iamVjdCB3aXRoXG4gICAqIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICpcbiAgICogICAtIHNvdXJjZTogVGhlIGZpbGVuYW1lIG9mIHRoZSBvcmlnaW5hbCBzb3VyY2UuXG4gICAqICAgLSBsaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZS5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZS5cbiAgICpcbiAgICogYW5kIGFuIG9iamVjdCBpcyByZXR1cm5lZCB3aXRoIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICpcbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZSwgb3IgbnVsbC5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UsIG9yIG51bGwuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuZ2VuZXJhdGVkUG9zaXRpb25Gb3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2dlbmVyYXRlZFBvc2l0aW9uRm9yKGFBcmdzKSB7XG4gICAgICB2YXIgbmVlZGxlID0ge1xuICAgICAgICBzb3VyY2U6IHV0aWwuZ2V0QXJnKGFBcmdzLCAnc291cmNlJyksXG4gICAgICAgIG9yaWdpbmFsTGluZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdsaW5lJyksXG4gICAgICAgIG9yaWdpbmFsQ29sdW1uOiB1dGlsLmdldEFyZyhhQXJncywgJ2NvbHVtbicpXG4gICAgICB9O1xuXG4gICAgICBpZiAodGhpcy5zb3VyY2VSb290KSB7XG4gICAgICAgIG5lZWRsZS5zb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHRoaXMuc291cmNlUm9vdCwgbmVlZGxlLnNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIHZhciBtYXBwaW5nID0gdGhpcy5fZmluZE1hcHBpbmcobmVlZGxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9vcmlnaW5hbE1hcHBpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm9yaWdpbmFsTGluZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm9yaWdpbmFsQ29sdW1uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuXG4gICAgICBpZiAobWFwcGluZykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGxpbmU6IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdnZW5lcmF0ZWRMaW5lJywgbnVsbCksXG4gICAgICAgICAgY29sdW1uOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnZ2VuZXJhdGVkQ29sdW1uJywgbnVsbClcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbGluZTogbnVsbCxcbiAgICAgICAgY29sdW1uOiBudWxsXG4gICAgICB9O1xuICAgIH07XG5cbiAgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSID0gMTtcbiAgU291cmNlTWFwQ29uc3VtZXIuT1JJR0lOQUxfT1JERVIgPSAyO1xuXG4gIC8qKlxuICAgKiBJdGVyYXRlIG92ZXIgZWFjaCBtYXBwaW5nIGJldHdlZW4gYW4gb3JpZ2luYWwgc291cmNlL2xpbmUvY29sdW1uIGFuZCBhXG4gICAqIGdlbmVyYXRlZCBsaW5lL2NvbHVtbiBpbiB0aGlzIHNvdXJjZSBtYXAuXG4gICAqXG4gICAqIEBwYXJhbSBGdW5jdGlvbiBhQ2FsbGJhY2tcbiAgICogICAgICAgIFRoZSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCB3aXRoIGVhY2ggbWFwcGluZy5cbiAgICogQHBhcmFtIE9iamVjdCBhQ29udGV4dFxuICAgKiAgICAgICAgT3B0aW9uYWwuIElmIHNwZWNpZmllZCwgdGhpcyBvYmplY3Qgd2lsbCBiZSB0aGUgdmFsdWUgb2YgYHRoaXNgIGV2ZXJ5XG4gICAqICAgICAgICB0aW1lIHRoYXQgYGFDYWxsYmFja2AgaXMgY2FsbGVkLlxuICAgKiBAcGFyYW0gYU9yZGVyXG4gICAqICAgICAgICBFaXRoZXIgYFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUmAgb3JcbiAgICogICAgICAgIGBTb3VyY2VNYXBDb25zdW1lci5PUklHSU5BTF9PUkRFUmAuIFNwZWNpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvXG4gICAqICAgICAgICBpdGVyYXRlIG92ZXIgdGhlIG1hcHBpbmdzIHNvcnRlZCBieSB0aGUgZ2VuZXJhdGVkIGZpbGUncyBsaW5lL2NvbHVtblxuICAgKiAgICAgICAgb3JkZXIgb3IgdGhlIG9yaWdpbmFsJ3Mgc291cmNlL2xpbmUvY29sdW1uIG9yZGVyLCByZXNwZWN0aXZlbHkuIERlZmF1bHRzIHRvXG4gICAqICAgICAgICBgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSYC5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5lYWNoTWFwcGluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfZWFjaE1hcHBpbmcoYUNhbGxiYWNrLCBhQ29udGV4dCwgYU9yZGVyKSB7XG4gICAgICB2YXIgY29udGV4dCA9IGFDb250ZXh0IHx8IG51bGw7XG4gICAgICB2YXIgb3JkZXIgPSBhT3JkZXIgfHwgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSO1xuXG4gICAgICB2YXIgbWFwcGluZ3M7XG4gICAgICBzd2l0Y2ggKG9yZGVyKSB7XG4gICAgICBjYXNlIFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUjpcbiAgICAgICAgbWFwcGluZ3MgPSB0aGlzLl9nZW5lcmF0ZWRNYXBwaW5ncztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFNvdXJjZU1hcENvbnN1bWVyLk9SSUdJTkFMX09SREVSOlxuICAgICAgICBtYXBwaW5ncyA9IHRoaXMuX29yaWdpbmFsTWFwcGluZ3M7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biBvcmRlciBvZiBpdGVyYXRpb24uXCIpO1xuICAgICAgfVxuXG4gICAgICB2YXIgc291cmNlUm9vdCA9IHRoaXMuc291cmNlUm9vdDtcbiAgICAgIG1hcHBpbmdzLm1hcChmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICB2YXIgc291cmNlID0gbWFwcGluZy5zb3VyY2U7XG4gICAgICAgIGlmIChzb3VyY2UgJiYgc291cmNlUm9vdCkge1xuICAgICAgICAgIHNvdXJjZSA9IHV0aWwuam9pbihzb3VyY2VSb290LCBzb3VyY2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc291cmNlOiBzb3VyY2UsXG4gICAgICAgICAgZ2VuZXJhdGVkTGluZTogbWFwcGluZy5nZW5lcmF0ZWRMaW5lLFxuICAgICAgICAgIGdlbmVyYXRlZENvbHVtbjogbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4sXG4gICAgICAgICAgb3JpZ2luYWxMaW5lOiBtYXBwaW5nLm9yaWdpbmFsTGluZSxcbiAgICAgICAgICBvcmlnaW5hbENvbHVtbjogbWFwcGluZy5vcmlnaW5hbENvbHVtbixcbiAgICAgICAgICBuYW1lOiBtYXBwaW5nLm5hbWVcbiAgICAgICAgfTtcbiAgICAgIH0pLmZvckVhY2goYUNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICB9O1xuXG4gIGV4cG9ydHMuU291cmNlTWFwQ29uc3VtZXIgPSBTb3VyY2VNYXBDb25zdW1lcjtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciBiYXNlNjRWTFEgPSByZXF1aXJlKCcuL2Jhc2U2NC12bHEnKTtcbiAgdmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbiAgdmFyIEFycmF5U2V0ID0gcmVxdWlyZSgnLi9hcnJheS1zZXQnKS5BcnJheVNldDtcblxuICAvKipcbiAgICogQW4gaW5zdGFuY2Ugb2YgdGhlIFNvdXJjZU1hcEdlbmVyYXRvciByZXByZXNlbnRzIGEgc291cmNlIG1hcCB3aGljaCBpc1xuICAgKiBiZWluZyBidWlsdCBpbmNyZW1lbnRhbGx5LiBZb3UgbWF5IHBhc3MgYW4gb2JqZWN0IHdpdGggdGhlIGZvbGxvd2luZ1xuICAgKiBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gZmlsZTogVGhlIGZpbGVuYW1lIG9mIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKiAgIC0gc291cmNlUm9vdDogQSByb290IGZvciBhbGwgcmVsYXRpdmUgVVJMcyBpbiB0aGlzIHNvdXJjZSBtYXAuXG4gICAqL1xuICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3IoYUFyZ3MpIHtcbiAgICBpZiAoIWFBcmdzKSB7XG4gICAgICBhQXJncyA9IHt9O1xuICAgIH1cbiAgICB0aGlzLl9maWxlID0gdXRpbC5nZXRBcmcoYUFyZ3MsICdmaWxlJywgbnVsbCk7XG4gICAgdGhpcy5fc291cmNlUm9vdCA9IHV0aWwuZ2V0QXJnKGFBcmdzLCAnc291cmNlUm9vdCcsIG51bGwpO1xuICAgIHRoaXMuX3NvdXJjZXMgPSBuZXcgQXJyYXlTZXQoKTtcbiAgICB0aGlzLl9uYW1lcyA9IG5ldyBBcnJheVNldCgpO1xuICAgIHRoaXMuX21hcHBpbmdzID0gW107XG4gICAgdGhpcy5fc291cmNlc0NvbnRlbnRzID0gbnVsbDtcbiAgfVxuXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX3ZlcnNpb24gPSAzO1xuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFNvdXJjZU1hcEdlbmVyYXRvciBiYXNlZCBvbiBhIFNvdXJjZU1hcENvbnN1bWVyXG4gICAqXG4gICAqIEBwYXJhbSBhU291cmNlTWFwQ29uc3VtZXIgVGhlIFNvdXJjZU1hcC5cbiAgICovXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5mcm9tU291cmNlTWFwID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfZnJvbVNvdXJjZU1hcChhU291cmNlTWFwQ29uc3VtZXIpIHtcbiAgICAgIHZhciBzb3VyY2VSb290ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZVJvb3Q7XG4gICAgICB2YXIgZ2VuZXJhdG9yID0gbmV3IFNvdXJjZU1hcEdlbmVyYXRvcih7XG4gICAgICAgIGZpbGU6IGFTb3VyY2VNYXBDb25zdW1lci5maWxlLFxuICAgICAgICBzb3VyY2VSb290OiBzb3VyY2VSb290XG4gICAgICB9KTtcbiAgICAgIGFTb3VyY2VNYXBDb25zdW1lci5lYWNoTWFwcGluZyhmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICB2YXIgbmV3TWFwcGluZyA9IHtcbiAgICAgICAgICBnZW5lcmF0ZWQ6IHtcbiAgICAgICAgICAgIGxpbmU6IG1hcHBpbmcuZ2VuZXJhdGVkTGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW5cbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKG1hcHBpbmcuc291cmNlKSB7XG4gICAgICAgICAgbmV3TWFwcGluZy5zb3VyY2UgPSBtYXBwaW5nLnNvdXJjZTtcbiAgICAgICAgICBpZiAoc291cmNlUm9vdCkge1xuICAgICAgICAgICAgbmV3TWFwcGluZy5zb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHNvdXJjZVJvb3QsIG5ld01hcHBpbmcuc291cmNlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBuZXdNYXBwaW5nLm9yaWdpbmFsID0ge1xuICAgICAgICAgICAgbGluZTogbWFwcGluZy5vcmlnaW5hbExpbmUsXG4gICAgICAgICAgICBjb2x1bW46IG1hcHBpbmcub3JpZ2luYWxDb2x1bW5cbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgaWYgKG1hcHBpbmcubmFtZSkge1xuICAgICAgICAgICAgbmV3TWFwcGluZy5uYW1lID0gbWFwcGluZy5uYW1lO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGdlbmVyYXRvci5hZGRNYXBwaW5nKG5ld01hcHBpbmcpO1xuICAgICAgfSk7XG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2VGaWxlKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZUNvbnRlbnRGb3Ioc291cmNlRmlsZSk7XG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgZ2VuZXJhdG9yLnNldFNvdXJjZUNvbnRlbnQoc291cmNlRmlsZSwgY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGdlbmVyYXRvcjtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgYSBzaW5nbGUgbWFwcGluZyBmcm9tIG9yaWdpbmFsIHNvdXJjZSBsaW5lIGFuZCBjb2x1bW4gdG8gdGhlIGdlbmVyYXRlZFxuICAgKiBzb3VyY2UncyBsaW5lIGFuZCBjb2x1bW4gZm9yIHRoaXMgc291cmNlIG1hcCBiZWluZyBjcmVhdGVkLiBUaGUgbWFwcGluZ1xuICAgKiBvYmplY3Qgc2hvdWxkIGhhdmUgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gZ2VuZXJhdGVkOiBBbiBvYmplY3Qgd2l0aCB0aGUgZ2VuZXJhdGVkIGxpbmUgYW5kIGNvbHVtbiBwb3NpdGlvbnMuXG4gICAqICAgLSBvcmlnaW5hbDogQW4gb2JqZWN0IHdpdGggdGhlIG9yaWdpbmFsIGxpbmUgYW5kIGNvbHVtbiBwb3NpdGlvbnMuXG4gICAqICAgLSBzb3VyY2U6IFRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZSAocmVsYXRpdmUgdG8gdGhlIHNvdXJjZVJvb3QpLlxuICAgKiAgIC0gbmFtZTogQW4gb3B0aW9uYWwgb3JpZ2luYWwgdG9rZW4gbmFtZSBmb3IgdGhpcyBtYXBwaW5nLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5hZGRNYXBwaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfYWRkTWFwcGluZyhhQXJncykge1xuICAgICAgdmFyIGdlbmVyYXRlZCA9IHV0aWwuZ2V0QXJnKGFBcmdzLCAnZ2VuZXJhdGVkJyk7XG4gICAgICB2YXIgb3JpZ2luYWwgPSB1dGlsLmdldEFyZyhhQXJncywgJ29yaWdpbmFsJywgbnVsbCk7XG4gICAgICB2YXIgc291cmNlID0gdXRpbC5nZXRBcmcoYUFyZ3MsICdzb3VyY2UnLCBudWxsKTtcbiAgICAgIHZhciBuYW1lID0gdXRpbC5nZXRBcmcoYUFyZ3MsICduYW1lJywgbnVsbCk7XG5cbiAgICAgIHRoaXMuX3ZhbGlkYXRlTWFwcGluZyhnZW5lcmF0ZWQsIG9yaWdpbmFsLCBzb3VyY2UsIG5hbWUpO1xuXG4gICAgICBpZiAoc291cmNlICYmICF0aGlzLl9zb3VyY2VzLmhhcyhzb3VyY2UpKSB7XG4gICAgICAgIHRoaXMuX3NvdXJjZXMuYWRkKHNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChuYW1lICYmICF0aGlzLl9uYW1lcy5oYXMobmFtZSkpIHtcbiAgICAgICAgdGhpcy5fbmFtZXMuYWRkKG5hbWUpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLl9tYXBwaW5ncy5wdXNoKHtcbiAgICAgICAgZ2VuZXJhdGVkTGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgIGdlbmVyYXRlZENvbHVtbjogZ2VuZXJhdGVkLmNvbHVtbixcbiAgICAgICAgb3JpZ2luYWxMaW5lOiBvcmlnaW5hbCAhPSBudWxsICYmIG9yaWdpbmFsLmxpbmUsXG4gICAgICAgIG9yaWdpbmFsQ29sdW1uOiBvcmlnaW5hbCAhPSBudWxsICYmIG9yaWdpbmFsLmNvbHVtbixcbiAgICAgICAgc291cmNlOiBzb3VyY2UsXG4gICAgICAgIG5hbWU6IG5hbWVcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgc291cmNlIGNvbnRlbnQgZm9yIGEgc291cmNlIGZpbGUuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLnNldFNvdXJjZUNvbnRlbnQgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl9zZXRTb3VyY2VDb250ZW50KGFTb3VyY2VGaWxlLCBhU291cmNlQ29udGVudCkge1xuICAgICAgdmFyIHNvdXJjZSA9IGFTb3VyY2VGaWxlO1xuICAgICAgaWYgKHRoaXMuX3NvdXJjZVJvb3QpIHtcbiAgICAgICAgc291cmNlID0gdXRpbC5yZWxhdGl2ZSh0aGlzLl9zb3VyY2VSb290LCBzb3VyY2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYVNvdXJjZUNvbnRlbnQgIT09IG51bGwpIHtcbiAgICAgICAgLy8gQWRkIHRoZSBzb3VyY2UgY29udGVudCB0byB0aGUgX3NvdXJjZXNDb250ZW50cyBtYXAuXG4gICAgICAgIC8vIENyZWF0ZSBhIG5ldyBfc291cmNlc0NvbnRlbnRzIG1hcCBpZiB0aGUgcHJvcGVydHkgaXMgbnVsbC5cbiAgICAgICAgaWYgKCF0aGlzLl9zb3VyY2VzQ29udGVudHMpIHtcbiAgICAgICAgICB0aGlzLl9zb3VyY2VzQ29udGVudHMgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zb3VyY2VzQ29udGVudHNbdXRpbC50b1NldFN0cmluZyhzb3VyY2UpXSA9IGFTb3VyY2VDb250ZW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBzb3VyY2UgZmlsZSBmcm9tIHRoZSBfc291cmNlc0NvbnRlbnRzIG1hcC5cbiAgICAgICAgLy8gSWYgdGhlIF9zb3VyY2VzQ29udGVudHMgbWFwIGlzIGVtcHR5LCBzZXQgdGhlIHByb3BlcnR5IHRvIG51bGwuXG4gICAgICAgIGRlbGV0ZSB0aGlzLl9zb3VyY2VzQ29udGVudHNbdXRpbC50b1NldFN0cmluZyhzb3VyY2UpXTtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuX3NvdXJjZXNDb250ZW50cykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5fc291cmNlc0NvbnRlbnRzID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgLyoqXG4gICAqIEFwcGxpZXMgdGhlIG1hcHBpbmdzIG9mIGEgc3ViLXNvdXJjZS1tYXAgZm9yIGEgc3BlY2lmaWMgc291cmNlIGZpbGUgdG8gdGhlXG4gICAqIHNvdXJjZSBtYXAgYmVpbmcgZ2VuZXJhdGVkLiBFYWNoIG1hcHBpbmcgdG8gdGhlIHN1cHBsaWVkIHNvdXJjZSBmaWxlIGlzXG4gICAqIHJld3JpdHRlbiB1c2luZyB0aGUgc3VwcGxpZWQgc291cmNlIG1hcC4gTm90ZTogVGhlIHJlc29sdXRpb24gZm9yIHRoZVxuICAgKiByZXN1bHRpbmcgbWFwcGluZ3MgaXMgdGhlIG1pbmltaXVtIG9mIHRoaXMgbWFwIGFuZCB0aGUgc3VwcGxpZWQgbWFwLlxuICAgKlxuICAgKiBAcGFyYW0gYVNvdXJjZU1hcENvbnN1bWVyIFRoZSBzb3VyY2UgbWFwIHRvIGJlIGFwcGxpZWQuXG4gICAqIEBwYXJhbSBhU291cmNlRmlsZSBPcHRpb25hbC4gVGhlIGZpbGVuYW1lIG9mIHRoZSBzb3VyY2UgZmlsZS5cbiAgICogICAgICAgIElmIG9taXR0ZWQsIFNvdXJjZU1hcENvbnN1bWVyJ3MgZmlsZSBwcm9wZXJ0eSB3aWxsIGJlIHVzZWQuXG4gICAqIEBwYXJhbSBhU291cmNlTWFwUGF0aCBPcHRpb25hbC4gVGhlIGRpcm5hbWUgb2YgdGhlIHBhdGggdG8gdGhlIHNvdXJjZSBtYXBcbiAgICogICAgICAgIHRvIGJlIGFwcGxpZWQuIElmIHJlbGF0aXZlLCBpdCBpcyByZWxhdGl2ZSB0byB0aGUgU291cmNlTWFwQ29uc3VtZXIuXG4gICAqICAgICAgICBUaGlzIHBhcmFtZXRlciBpcyBuZWVkZWQgd2hlbiB0aGUgdHdvIHNvdXJjZSBtYXBzIGFyZW4ndCBpbiB0aGUgc2FtZVxuICAgKiAgICAgICAgZGlyZWN0b3J5LCBhbmQgdGhlIHNvdXJjZSBtYXAgdG8gYmUgYXBwbGllZCBjb250YWlucyByZWxhdGl2ZSBzb3VyY2VcbiAgICogICAgICAgIHBhdGhzLiBJZiBzbywgdGhvc2UgcmVsYXRpdmUgc291cmNlIHBhdGhzIG5lZWQgdG8gYmUgcmV3cml0dGVuXG4gICAqICAgICAgICByZWxhdGl2ZSB0byB0aGUgU291cmNlTWFwR2VuZXJhdG9yLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5hcHBseVNvdXJjZU1hcCA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX2FwcGx5U291cmNlTWFwKGFTb3VyY2VNYXBDb25zdW1lciwgYVNvdXJjZUZpbGUsIGFTb3VyY2VNYXBQYXRoKSB7XG4gICAgICAvLyBJZiBhU291cmNlRmlsZSBpcyBvbWl0dGVkLCB3ZSB3aWxsIHVzZSB0aGUgZmlsZSBwcm9wZXJ0eSBvZiB0aGUgU291cmNlTWFwXG4gICAgICBpZiAoIWFTb3VyY2VGaWxlKSB7XG4gICAgICAgIGlmICghYVNvdXJjZU1hcENvbnN1bWVyLmZpbGUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5hcHBseVNvdXJjZU1hcCByZXF1aXJlcyBlaXRoZXIgYW4gZXhwbGljaXQgc291cmNlIGZpbGUsICcgK1xuICAgICAgICAgICAgJ29yIHRoZSBzb3VyY2UgbWFwXFwncyBcImZpbGVcIiBwcm9wZXJ0eS4gQm90aCB3ZXJlIG9taXR0ZWQuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYVNvdXJjZUZpbGUgPSBhU291cmNlTWFwQ29uc3VtZXIuZmlsZTtcbiAgICAgIH1cbiAgICAgIHZhciBzb3VyY2VSb290ID0gdGhpcy5fc291cmNlUm9vdDtcbiAgICAgIC8vIE1ha2UgXCJhU291cmNlRmlsZVwiIHJlbGF0aXZlIGlmIGFuIGFic29sdXRlIFVybCBpcyBwYXNzZWQuXG4gICAgICBpZiAoc291cmNlUm9vdCkge1xuICAgICAgICBhU291cmNlRmlsZSA9IHV0aWwucmVsYXRpdmUoc291cmNlUm9vdCwgYVNvdXJjZUZpbGUpO1xuICAgICAgfVxuICAgICAgLy8gQXBwbHlpbmcgdGhlIFNvdXJjZU1hcCBjYW4gYWRkIGFuZCByZW1vdmUgaXRlbXMgZnJvbSB0aGUgc291cmNlcyBhbmRcbiAgICAgIC8vIHRoZSBuYW1lcyBhcnJheS5cbiAgICAgIHZhciBuZXdTb3VyY2VzID0gbmV3IEFycmF5U2V0KCk7XG4gICAgICB2YXIgbmV3TmFtZXMgPSBuZXcgQXJyYXlTZXQoKTtcblxuICAgICAgLy8gRmluZCBtYXBwaW5ncyBmb3IgdGhlIFwiYVNvdXJjZUZpbGVcIlxuICAgICAgdGhpcy5fbWFwcGluZ3MuZm9yRWFjaChmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICBpZiAobWFwcGluZy5zb3VyY2UgPT09IGFTb3VyY2VGaWxlICYmIG1hcHBpbmcub3JpZ2luYWxMaW5lKSB7XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgaXQgY2FuIGJlIG1hcHBlZCBieSB0aGUgc291cmNlIG1hcCwgdGhlbiB1cGRhdGUgdGhlIG1hcHBpbmcuXG4gICAgICAgICAgdmFyIG9yaWdpbmFsID0gYVNvdXJjZU1hcENvbnN1bWVyLm9yaWdpbmFsUG9zaXRpb25Gb3Ioe1xuICAgICAgICAgICAgbGluZTogbWFwcGluZy5vcmlnaW5hbExpbmUsXG4gICAgICAgICAgICBjb2x1bW46IG1hcHBpbmcub3JpZ2luYWxDb2x1bW5cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAob3JpZ2luYWwuc291cmNlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBDb3B5IG1hcHBpbmdcbiAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gb3JpZ2luYWwuc291cmNlO1xuICAgICAgICAgICAgaWYgKGFTb3VyY2VNYXBQYXRoKSB7XG4gICAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gdXRpbC5qb2luKGFTb3VyY2VNYXBQYXRoLCBtYXBwaW5nLnNvdXJjZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzb3VyY2VSb290KSB7XG4gICAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gdXRpbC5yZWxhdGl2ZShzb3VyY2VSb290LCBtYXBwaW5nLnNvdXJjZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsTGluZSA9IG9yaWdpbmFsLmxpbmU7XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uID0gb3JpZ2luYWwuY29sdW1uO1xuICAgICAgICAgICAgaWYgKG9yaWdpbmFsLm5hbWUgIT09IG51bGwgJiYgbWFwcGluZy5uYW1lICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoZSBpZGVudGlmaWVyIG5hbWUgaWYgaXQncyBhbiBpZGVudGlmaWVyXG4gICAgICAgICAgICAgIC8vIGluIGJvdGggU291cmNlTWFwc1xuICAgICAgICAgICAgICBtYXBwaW5nLm5hbWUgPSBvcmlnaW5hbC5uYW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzb3VyY2UgPSBtYXBwaW5nLnNvdXJjZTtcbiAgICAgICAgaWYgKHNvdXJjZSAmJiAhbmV3U291cmNlcy5oYXMoc291cmNlKSkge1xuICAgICAgICAgIG5ld1NvdXJjZXMuYWRkKHNvdXJjZSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbmFtZSA9IG1hcHBpbmcubmFtZTtcbiAgICAgICAgaWYgKG5hbWUgJiYgIW5ld05hbWVzLmhhcyhuYW1lKSkge1xuICAgICAgICAgIG5ld05hbWVzLmFkZChuYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICB9LCB0aGlzKTtcbiAgICAgIHRoaXMuX3NvdXJjZXMgPSBuZXdTb3VyY2VzO1xuICAgICAgdGhpcy5fbmFtZXMgPSBuZXdOYW1lcztcblxuICAgICAgLy8gQ29weSBzb3VyY2VzQ29udGVudHMgb2YgYXBwbGllZCBtYXAuXG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2VGaWxlKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZUNvbnRlbnRGb3Ioc291cmNlRmlsZSk7XG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgaWYgKHNvdXJjZVJvb3QpIHtcbiAgICAgICAgICAgIHNvdXJjZUZpbGUgPSB1dGlsLnJlbGF0aXZlKHNvdXJjZVJvb3QsIHNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnNldFNvdXJjZUNvbnRlbnQoc291cmNlRmlsZSwgY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0sIHRoaXMpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIEEgbWFwcGluZyBjYW4gaGF2ZSBvbmUgb2YgdGhlIHRocmVlIGxldmVscyBvZiBkYXRhOlxuICAgKlxuICAgKiAgIDEuIEp1c3QgdGhlIGdlbmVyYXRlZCBwb3NpdGlvbi5cbiAgICogICAyLiBUaGUgR2VuZXJhdGVkIHBvc2l0aW9uLCBvcmlnaW5hbCBwb3NpdGlvbiwgYW5kIG9yaWdpbmFsIHNvdXJjZS5cbiAgICogICAzLiBHZW5lcmF0ZWQgYW5kIG9yaWdpbmFsIHBvc2l0aW9uLCBvcmlnaW5hbCBzb3VyY2UsIGFzIHdlbGwgYXMgYSBuYW1lXG4gICAqICAgICAgdG9rZW4uXG4gICAqXG4gICAqIFRvIG1haW50YWluIGNvbnNpc3RlbmN5LCB3ZSB2YWxpZGF0ZSB0aGF0IGFueSBuZXcgbWFwcGluZyBiZWluZyBhZGRlZCBmYWxsc1xuICAgKiBpbiB0byBvbmUgb2YgdGhlc2UgY2F0ZWdvcmllcy5cbiAgICovXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX3ZhbGlkYXRlTWFwcGluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3ZhbGlkYXRlTWFwcGluZyhhR2VuZXJhdGVkLCBhT3JpZ2luYWwsIGFTb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhTmFtZSkge1xuICAgICAgaWYgKGFHZW5lcmF0ZWQgJiYgJ2xpbmUnIGluIGFHZW5lcmF0ZWQgJiYgJ2NvbHVtbicgaW4gYUdlbmVyYXRlZFxuICAgICAgICAgICYmIGFHZW5lcmF0ZWQubGluZSA+IDAgJiYgYUdlbmVyYXRlZC5jb2x1bW4gPj0gMFxuICAgICAgICAgICYmICFhT3JpZ2luYWwgJiYgIWFTb3VyY2UgJiYgIWFOYW1lKSB7XG4gICAgICAgIC8vIENhc2UgMS5cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZWxzZSBpZiAoYUdlbmVyYXRlZCAmJiAnbGluZScgaW4gYUdlbmVyYXRlZCAmJiAnY29sdW1uJyBpbiBhR2VuZXJhdGVkXG4gICAgICAgICAgICAgICAmJiBhT3JpZ2luYWwgJiYgJ2xpbmUnIGluIGFPcmlnaW5hbCAmJiAnY29sdW1uJyBpbiBhT3JpZ2luYWxcbiAgICAgICAgICAgICAgICYmIGFHZW5lcmF0ZWQubGluZSA+IDAgJiYgYUdlbmVyYXRlZC5jb2x1bW4gPj0gMFxuICAgICAgICAgICAgICAgJiYgYU9yaWdpbmFsLmxpbmUgPiAwICYmIGFPcmlnaW5hbC5jb2x1bW4gPj0gMFxuICAgICAgICAgICAgICAgJiYgYVNvdXJjZSkge1xuICAgICAgICAvLyBDYXNlcyAyIGFuZCAzLlxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG1hcHBpbmc6ICcgKyBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZ2VuZXJhdGVkOiBhR2VuZXJhdGVkLFxuICAgICAgICAgIHNvdXJjZTogYVNvdXJjZSxcbiAgICAgICAgICBvcmlnaW5hbDogYU9yaWdpbmFsLFxuICAgICAgICAgIG5hbWU6IGFOYW1lXG4gICAgICAgIH0pKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIC8qKlxuICAgKiBTZXJpYWxpemUgdGhlIGFjY3VtdWxhdGVkIG1hcHBpbmdzIGluIHRvIHRoZSBzdHJlYW0gb2YgYmFzZSA2NCBWTFFzXG4gICAqIHNwZWNpZmllZCBieSB0aGUgc291cmNlIG1hcCBmb3JtYXQuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLl9zZXJpYWxpemVNYXBwaW5ncyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3NlcmlhbGl6ZU1hcHBpbmdzKCkge1xuICAgICAgdmFyIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgIHZhciBwcmV2aW91c0dlbmVyYXRlZExpbmUgPSAxO1xuICAgICAgdmFyIHByZXZpb3VzT3JpZ2luYWxDb2x1bW4gPSAwO1xuICAgICAgdmFyIHByZXZpb3VzT3JpZ2luYWxMaW5lID0gMDtcbiAgICAgIHZhciBwcmV2aW91c05hbWUgPSAwO1xuICAgICAgdmFyIHByZXZpb3VzU291cmNlID0gMDtcbiAgICAgIHZhciByZXN1bHQgPSAnJztcbiAgICAgIHZhciBtYXBwaW5nO1xuXG4gICAgICAvLyBUaGUgbWFwcGluZ3MgbXVzdCBiZSBndWFyYW50ZWVkIHRvIGJlIGluIHNvcnRlZCBvcmRlciBiZWZvcmUgd2Ugc3RhcnRcbiAgICAgIC8vIHNlcmlhbGl6aW5nIHRoZW0gb3IgZWxzZSB0aGUgZ2VuZXJhdGVkIGxpbmUgbnVtYmVycyAod2hpY2ggYXJlIGRlZmluZWRcbiAgICAgIC8vIHZpYSB0aGUgJzsnIHNlcGFyYXRvcnMpIHdpbGwgYmUgYWxsIG1lc3NlZCB1cC4gTm90ZTogaXQgbWlnaHQgYmUgbW9yZVxuICAgICAgLy8gcGVyZm9ybWFudCB0byBtYWludGFpbiB0aGUgc29ydGluZyBhcyB3ZSBpbnNlcnQgdGhlbSwgcmF0aGVyIHRoYW4gYXMgd2VcbiAgICAgIC8vIHNlcmlhbGl6ZSB0aGVtLCBidXQgdGhlIGJpZyBPIGlzIHRoZSBzYW1lIGVpdGhlciB3YXkuXG4gICAgICB0aGlzLl9tYXBwaW5ncy5zb3J0KHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHRoaXMuX21hcHBpbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIG1hcHBpbmcgPSB0aGlzLl9tYXBwaW5nc1tpXTtcblxuICAgICAgICBpZiAobWFwcGluZy5nZW5lcmF0ZWRMaW5lICE9PSBwcmV2aW91c0dlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiA9IDA7XG4gICAgICAgICAgd2hpbGUgKG1hcHBpbmcuZ2VuZXJhdGVkTGluZSAhPT0gcHJldmlvdXNHZW5lcmF0ZWRMaW5lKSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gJzsnO1xuICAgICAgICAgICAgcHJldmlvdXNHZW5lcmF0ZWRMaW5lKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgaWYgKCF1dGlsLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyhtYXBwaW5nLCB0aGlzLl9tYXBwaW5nc1tpIC0gMV0pKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0ICs9ICcsJztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZShtYXBwaW5nLmdlbmVyYXRlZENvbHVtblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uKTtcbiAgICAgICAgcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gPSBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbjtcblxuICAgICAgICBpZiAobWFwcGluZy5zb3VyY2UpIHtcbiAgICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZSh0aGlzLl9zb3VyY2VzLmluZGV4T2YobWFwcGluZy5zb3VyY2UpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSBwcmV2aW91c1NvdXJjZSk7XG4gICAgICAgICAgcHJldmlvdXNTb3VyY2UgPSB0aGlzLl9zb3VyY2VzLmluZGV4T2YobWFwcGluZy5zb3VyY2UpO1xuXG4gICAgICAgICAgLy8gbGluZXMgYXJlIHN0b3JlZCAwLWJhc2VkIGluIFNvdXJjZU1hcCBzcGVjIHZlcnNpb24gM1xuICAgICAgICAgIHJlc3VsdCArPSBiYXNlNjRWTFEuZW5jb2RlKG1hcHBpbmcub3JpZ2luYWxMaW5lIC0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNPcmlnaW5hbExpbmUpO1xuICAgICAgICAgIHByZXZpb3VzT3JpZ2luYWxMaW5lID0gbWFwcGluZy5vcmlnaW5hbExpbmUgLSAxO1xuXG4gICAgICAgICAgcmVzdWx0ICs9IGJhc2U2NFZMUS5lbmNvZGUobWFwcGluZy5vcmlnaW5hbENvbHVtblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNPcmlnaW5hbENvbHVtbik7XG4gICAgICAgICAgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IG1hcHBpbmcub3JpZ2luYWxDb2x1bW47XG5cbiAgICAgICAgICBpZiAobWFwcGluZy5uYW1lKSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZSh0aGlzLl9uYW1lcy5pbmRleE9mKG1hcHBpbmcubmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNOYW1lKTtcbiAgICAgICAgICAgIHByZXZpb3VzTmFtZSA9IHRoaXMuX25hbWVzLmluZGV4T2YobWFwcGluZy5uYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX2dlbmVyYXRlU291cmNlc0NvbnRlbnQgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl9nZW5lcmF0ZVNvdXJjZXNDb250ZW50KGFTb3VyY2VzLCBhU291cmNlUm9vdCkge1xuICAgICAgcmV0dXJuIGFTb3VyY2VzLm1hcChmdW5jdGlvbiAoc291cmNlKSB7XG4gICAgICAgIGlmICghdGhpcy5fc291cmNlc0NvbnRlbnRzKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFTb3VyY2VSb290KSB7XG4gICAgICAgICAgc291cmNlID0gdXRpbC5yZWxhdGl2ZShhU291cmNlUm9vdCwgc291cmNlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5ID0gdXRpbC50b1NldFN0cmluZyhzb3VyY2UpO1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuX3NvdXJjZXNDb250ZW50cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXkpXG4gICAgICAgICAgPyB0aGlzLl9zb3VyY2VzQ29udGVudHNba2V5XVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIEV4dGVybmFsaXplIHRoZSBzb3VyY2UgbWFwLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl90b0pTT04oKSB7XG4gICAgICB2YXIgbWFwID0ge1xuICAgICAgICB2ZXJzaW9uOiB0aGlzLl92ZXJzaW9uLFxuICAgICAgICBmaWxlOiB0aGlzLl9maWxlLFxuICAgICAgICBzb3VyY2VzOiB0aGlzLl9zb3VyY2VzLnRvQXJyYXkoKSxcbiAgICAgICAgbmFtZXM6IHRoaXMuX25hbWVzLnRvQXJyYXkoKSxcbiAgICAgICAgbWFwcGluZ3M6IHRoaXMuX3NlcmlhbGl6ZU1hcHBpbmdzKClcbiAgICAgIH07XG4gICAgICBpZiAodGhpcy5fc291cmNlUm9vdCkge1xuICAgICAgICBtYXAuc291cmNlUm9vdCA9IHRoaXMuX3NvdXJjZVJvb3Q7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fc291cmNlc0NvbnRlbnRzKSB7XG4gICAgICAgIG1hcC5zb3VyY2VzQ29udGVudCA9IHRoaXMuX2dlbmVyYXRlU291cmNlc0NvbnRlbnQobWFwLnNvdXJjZXMsIG1hcC5zb3VyY2VSb290KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcDtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBSZW5kZXIgdGhlIHNvdXJjZSBtYXAgYmVpbmcgZ2VuZXJhdGVkIHRvIGEgc3RyaW5nLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3RvU3RyaW5nKCkge1xuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMpO1xuICAgIH07XG5cbiAgZXhwb3J0cy5Tb3VyY2VNYXBHZW5lcmF0b3IgPSBTb3VyY2VNYXBHZW5lcmF0b3I7XG5cbn0pO1xuIiwiLyogLSotIE1vZGU6IGpzOyBqcy1pbmRlbnQtbGV2ZWw6IDI7IC0qLSAqL1xuLypcbiAqIENvcHlyaWdodCAyMDExIE1vemlsbGEgRm91bmRhdGlvbiBhbmQgY29udHJpYnV0b3JzXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTmV3IEJTRCBsaWNlbnNlLiBTZWUgTElDRU5TRSBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuaWYgKHR5cGVvZiBkZWZpbmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgZGVmaW5lID0gcmVxdWlyZSgnYW1kZWZpbmUnKShtb2R1bGUsIHJlcXVpcmUpO1xufVxuZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblxuICB2YXIgU291cmNlTWFwR2VuZXJhdG9yID0gcmVxdWlyZSgnLi9zb3VyY2UtbWFwLWdlbmVyYXRvcicpLlNvdXJjZU1hcEdlbmVyYXRvcjtcbiAgdmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcblxuICAvKipcbiAgICogU291cmNlTm9kZXMgcHJvdmlkZSBhIHdheSB0byBhYnN0cmFjdCBvdmVyIGludGVycG9sYXRpbmcvY29uY2F0ZW5hdGluZ1xuICAgKiBzbmlwcGV0cyBvZiBnZW5lcmF0ZWQgSmF2YVNjcmlwdCBzb3VyY2UgY29kZSB3aGlsZSBtYWludGFpbmluZyB0aGUgbGluZSBhbmRcbiAgICogY29sdW1uIGluZm9ybWF0aW9uIGFzc29jaWF0ZWQgd2l0aCB0aGUgb3JpZ2luYWwgc291cmNlIGNvZGUuXG4gICAqXG4gICAqIEBwYXJhbSBhTGluZSBUaGUgb3JpZ2luYWwgbGluZSBudW1iZXIuXG4gICAqIEBwYXJhbSBhQ29sdW1uIFRoZSBvcmlnaW5hbCBjb2x1bW4gbnVtYmVyLlxuICAgKiBAcGFyYW0gYVNvdXJjZSBUaGUgb3JpZ2luYWwgc291cmNlJ3MgZmlsZW5hbWUuXG4gICAqIEBwYXJhbSBhQ2h1bmtzIE9wdGlvbmFsLiBBbiBhcnJheSBvZiBzdHJpbmdzIHdoaWNoIGFyZSBzbmlwcGV0cyBvZlxuICAgKiAgICAgICAgZ2VuZXJhdGVkIEpTLCBvciBvdGhlciBTb3VyY2VOb2Rlcy5cbiAgICogQHBhcmFtIGFOYW1lIFRoZSBvcmlnaW5hbCBpZGVudGlmaWVyLlxuICAgKi9cbiAgZnVuY3Rpb24gU291cmNlTm9kZShhTGluZSwgYUNvbHVtbiwgYVNvdXJjZSwgYUNodW5rcywgYU5hbWUpIHtcbiAgICB0aGlzLmNoaWxkcmVuID0gW107XG4gICAgdGhpcy5zb3VyY2VDb250ZW50cyA9IHt9O1xuICAgIHRoaXMubGluZSA9IGFMaW5lID09PSB1bmRlZmluZWQgPyBudWxsIDogYUxpbmU7XG4gICAgdGhpcy5jb2x1bW4gPSBhQ29sdW1uID09PSB1bmRlZmluZWQgPyBudWxsIDogYUNvbHVtbjtcbiAgICB0aGlzLnNvdXJjZSA9IGFTb3VyY2UgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhU291cmNlO1xuICAgIHRoaXMubmFtZSA9IGFOYW1lID09PSB1bmRlZmluZWQgPyBudWxsIDogYU5hbWU7XG4gICAgaWYgKGFDaHVua3MgIT0gbnVsbCkgdGhpcy5hZGQoYUNodW5rcyk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIFNvdXJjZU5vZGUgZnJvbSBnZW5lcmF0ZWQgY29kZSBhbmQgYSBTb3VyY2VNYXBDb25zdW1lci5cbiAgICpcbiAgICogQHBhcmFtIGFHZW5lcmF0ZWRDb2RlIFRoZSBnZW5lcmF0ZWQgY29kZVxuICAgKiBAcGFyYW0gYVNvdXJjZU1hcENvbnN1bWVyIFRoZSBTb3VyY2VNYXAgZm9yIHRoZSBnZW5lcmF0ZWQgY29kZVxuICAgKi9cbiAgU291cmNlTm9kZS5mcm9tU3RyaW5nV2l0aFNvdXJjZU1hcCA9XG4gICAgZnVuY3Rpb24gU291cmNlTm9kZV9mcm9tU3RyaW5nV2l0aFNvdXJjZU1hcChhR2VuZXJhdGVkQ29kZSwgYVNvdXJjZU1hcENvbnN1bWVyKSB7XG4gICAgICAvLyBUaGUgU291cmNlTm9kZSB3ZSB3YW50IHRvIGZpbGwgd2l0aCB0aGUgZ2VuZXJhdGVkIGNvZGVcbiAgICAgIC8vIGFuZCB0aGUgU291cmNlTWFwXG4gICAgICB2YXIgbm9kZSA9IG5ldyBTb3VyY2VOb2RlKCk7XG5cbiAgICAgIC8vIFRoZSBnZW5lcmF0ZWQgY29kZVxuICAgICAgLy8gUHJvY2Vzc2VkIGZyYWdtZW50cyBhcmUgcmVtb3ZlZCBmcm9tIHRoaXMgYXJyYXkuXG4gICAgICB2YXIgcmVtYWluaW5nTGluZXMgPSBhR2VuZXJhdGVkQ29kZS5zcGxpdCgnXFxuJyk7XG5cbiAgICAgIC8vIFdlIG5lZWQgdG8gcmVtZW1iZXIgdGhlIHBvc2l0aW9uIG9mIFwicmVtYWluaW5nTGluZXNcIlxuICAgICAgdmFyIGxhc3RHZW5lcmF0ZWRMaW5lID0gMSwgbGFzdEdlbmVyYXRlZENvbHVtbiA9IDA7XG5cbiAgICAgIC8vIFRoZSBnZW5lcmF0ZSBTb3VyY2VOb2RlcyB3ZSBuZWVkIGEgY29kZSByYW5nZS5cbiAgICAgIC8vIFRvIGV4dHJhY3QgaXQgY3VycmVudCBhbmQgbGFzdCBtYXBwaW5nIGlzIHVzZWQuXG4gICAgICAvLyBIZXJlIHdlIHN0b3JlIHRoZSBsYXN0IG1hcHBpbmcuXG4gICAgICB2YXIgbGFzdE1hcHBpbmcgPSBudWxsO1xuXG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuZWFjaE1hcHBpbmcoZnVuY3Rpb24gKG1hcHBpbmcpIHtcbiAgICAgICAgaWYgKGxhc3RNYXBwaW5nICE9PSBudWxsKSB7XG4gICAgICAgICAgLy8gV2UgYWRkIHRoZSBjb2RlIGZyb20gXCJsYXN0TWFwcGluZ1wiIHRvIFwibWFwcGluZ1wiOlxuICAgICAgICAgIC8vIEZpcnN0IGNoZWNrIGlmIHRoZXJlIGlzIGEgbmV3IGxpbmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICBpZiAobGFzdEdlbmVyYXRlZExpbmUgPCBtYXBwaW5nLmdlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBjb2RlID0gXCJcIjtcbiAgICAgICAgICAgIC8vIEFzc29jaWF0ZSBmaXJzdCBsaW5lIHdpdGggXCJsYXN0TWFwcGluZ1wiXG4gICAgICAgICAgICBhZGRNYXBwaW5nV2l0aENvZGUobGFzdE1hcHBpbmcsIHJlbWFpbmluZ0xpbmVzLnNoaWZ0KCkgKyBcIlxcblwiKTtcbiAgICAgICAgICAgIGxhc3RHZW5lcmF0ZWRMaW5lKys7XG4gICAgICAgICAgICBsYXN0R2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgICAgICAgIC8vIFRoZSByZW1haW5pbmcgY29kZSBpcyBhZGRlZCB3aXRob3V0IG1hcHBpbmdcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhlcmUgaXMgbm8gbmV3IGxpbmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICAgIC8vIEFzc29jaWF0ZSB0aGUgY29kZSBiZXR3ZWVuIFwibGFzdEdlbmVyYXRlZENvbHVtblwiIGFuZFxuICAgICAgICAgICAgLy8gXCJtYXBwaW5nLmdlbmVyYXRlZENvbHVtblwiIHdpdGggXCJsYXN0TWFwcGluZ1wiXG4gICAgICAgICAgICB2YXIgbmV4dExpbmUgPSByZW1haW5pbmdMaW5lc1swXTtcbiAgICAgICAgICAgIHZhciBjb2RlID0gbmV4dExpbmUuc3Vic3RyKDAsIG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uIC1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RHZW5lcmF0ZWRDb2x1bW4pO1xuICAgICAgICAgICAgcmVtYWluaW5nTGluZXNbMF0gPSBuZXh0TGluZS5zdWJzdHIobWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4gLVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdEdlbmVyYXRlZENvbHVtbik7XG4gICAgICAgICAgICBsYXN0R2VuZXJhdGVkQ29sdW1uID0gbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW47XG4gICAgICAgICAgICBhZGRNYXBwaW5nV2l0aENvZGUobGFzdE1hcHBpbmcsIGNvZGUpO1xuICAgICAgICAgICAgLy8gTm8gbW9yZSByZW1haW5pbmcgY29kZSwgY29udGludWVcbiAgICAgICAgICAgIGxhc3RNYXBwaW5nID0gbWFwcGluZztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgYWRkIHRoZSBnZW5lcmF0ZWQgY29kZSB1bnRpbCB0aGUgZmlyc3QgbWFwcGluZ1xuICAgICAgICAvLyB0byB0aGUgU291cmNlTm9kZSB3aXRob3V0IGFueSBtYXBwaW5nLlxuICAgICAgICAvLyBFYWNoIGxpbmUgaXMgYWRkZWQgYXMgc2VwYXJhdGUgc3RyaW5nLlxuICAgICAgICB3aGlsZSAobGFzdEdlbmVyYXRlZExpbmUgPCBtYXBwaW5nLmdlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICBub2RlLmFkZChyZW1haW5pbmdMaW5lcy5zaGlmdCgpICsgXCJcXG5cIik7XG4gICAgICAgICAgbGFzdEdlbmVyYXRlZExpbmUrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAobGFzdEdlbmVyYXRlZENvbHVtbiA8IG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uKSB7XG4gICAgICAgICAgdmFyIG5leHRMaW5lID0gcmVtYWluaW5nTGluZXNbMF07XG4gICAgICAgICAgbm9kZS5hZGQobmV4dExpbmUuc3Vic3RyKDAsIG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uKSk7XG4gICAgICAgICAgcmVtYWluaW5nTGluZXNbMF0gPSBuZXh0TGluZS5zdWJzdHIobWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4pO1xuICAgICAgICAgIGxhc3RHZW5lcmF0ZWRDb2x1bW4gPSBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbjtcbiAgICAgICAgfVxuICAgICAgICBsYXN0TWFwcGluZyA9IG1hcHBpbmc7XG4gICAgICB9LCB0aGlzKTtcbiAgICAgIC8vIFdlIGhhdmUgcHJvY2Vzc2VkIGFsbCBtYXBwaW5ncy5cbiAgICAgIGlmIChyZW1haW5pbmdMaW5lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChsYXN0TWFwcGluZykge1xuICAgICAgICAgIC8vIEFzc29jaWF0ZSB0aGUgcmVtYWluaW5nIGNvZGUgaW4gdGhlIGN1cnJlbnQgbGluZSB3aXRoIFwibGFzdE1hcHBpbmdcIlxuICAgICAgICAgIHZhciBsYXN0TGluZSA9IHJlbWFpbmluZ0xpbmVzLnNoaWZ0KCk7XG4gICAgICAgICAgaWYgKHJlbWFpbmluZ0xpbmVzLmxlbmd0aCA+IDApIGxhc3RMaW5lICs9IFwiXFxuXCI7XG4gICAgICAgICAgYWRkTWFwcGluZ1dpdGhDb2RlKGxhc3RNYXBwaW5nLCBsYXN0TGluZSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYW5kIGFkZCB0aGUgcmVtYWluaW5nIGxpbmVzIHdpdGhvdXQgYW55IG1hcHBpbmdcbiAgICAgICAgbm9kZS5hZGQocmVtYWluaW5nTGluZXMuam9pbihcIlxcblwiKSk7XG4gICAgICB9XG5cbiAgICAgIC8vIENvcHkgc291cmNlc0NvbnRlbnQgaW50byBTb3VyY2VOb2RlXG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2VGaWxlKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZUNvbnRlbnRGb3Ioc291cmNlRmlsZSk7XG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgbm9kZS5zZXRTb3VyY2VDb250ZW50KHNvdXJjZUZpbGUsIGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIG5vZGU7XG5cbiAgICAgIGZ1bmN0aW9uIGFkZE1hcHBpbmdXaXRoQ29kZShtYXBwaW5nLCBjb2RlKSB7XG4gICAgICAgIGlmIChtYXBwaW5nID09PSBudWxsIHx8IG1hcHBpbmcuc291cmNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBub2RlLmFkZChjb2RlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBub2RlLmFkZChuZXcgU291cmNlTm9kZShtYXBwaW5nLm9yaWdpbmFsTGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcHBpbmcuc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwcGluZy5uYW1lKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgYSBjaHVuayBvZiBnZW5lcmF0ZWQgSlMgdG8gdGhpcyBzb3VyY2Ugbm9kZS5cbiAgICpcbiAgICogQHBhcmFtIGFDaHVuayBBIHN0cmluZyBzbmlwcGV0IG9mIGdlbmVyYXRlZCBKUyBjb2RlLCBhbm90aGVyIGluc3RhbmNlIG9mXG4gICAqICAgICAgICBTb3VyY2VOb2RlLCBvciBhbiBhcnJheSB3aGVyZSBlYWNoIG1lbWJlciBpcyBvbmUgb2YgdGhvc2UgdGhpbmdzLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gU291cmNlTm9kZV9hZGQoYUNodW5rKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYUNodW5rKSkge1xuICAgICAgYUNodW5rLmZvckVhY2goZnVuY3Rpb24gKGNodW5rKSB7XG4gICAgICAgIHRoaXMuYWRkKGNodW5rKTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgICBlbHNlIGlmIChhQ2h1bmsgaW5zdGFuY2VvZiBTb3VyY2VOb2RlIHx8IHR5cGVvZiBhQ2h1bmsgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGlmIChhQ2h1bmspIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlbi5wdXNoKGFDaHVuayk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgXCJFeHBlY3RlZCBhIFNvdXJjZU5vZGUsIHN0cmluZywgb3IgYW4gYXJyYXkgb2YgU291cmNlTm9kZXMgYW5kIHN0cmluZ3MuIEdvdCBcIiArIGFDaHVua1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCBhIGNodW5rIG9mIGdlbmVyYXRlZCBKUyB0byB0aGUgYmVnaW5uaW5nIG9mIHRoaXMgc291cmNlIG5vZGUuXG4gICAqXG4gICAqIEBwYXJhbSBhQ2h1bmsgQSBzdHJpbmcgc25pcHBldCBvZiBnZW5lcmF0ZWQgSlMgY29kZSwgYW5vdGhlciBpbnN0YW5jZSBvZlxuICAgKiAgICAgICAgU291cmNlTm9kZSwgb3IgYW4gYXJyYXkgd2hlcmUgZWFjaCBtZW1iZXIgaXMgb25lIG9mIHRob3NlIHRoaW5ncy5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLnByZXBlbmQgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3ByZXBlbmQoYUNodW5rKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYUNodW5rKSkge1xuICAgICAgZm9yICh2YXIgaSA9IGFDaHVuay5sZW5ndGgtMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdGhpcy5wcmVwZW5kKGFDaHVua1tpXSk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGFDaHVuayBpbnN0YW5jZW9mIFNvdXJjZU5vZGUgfHwgdHlwZW9mIGFDaHVuayA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgdGhpcy5jaGlsZHJlbi51bnNoaWZ0KGFDaHVuayk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgXCJFeHBlY3RlZCBhIFNvdXJjZU5vZGUsIHN0cmluZywgb3IgYW4gYXJyYXkgb2YgU291cmNlTm9kZXMgYW5kIHN0cmluZ3MuIEdvdCBcIiArIGFDaHVua1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLyoqXG4gICAqIFdhbGsgb3ZlciB0aGUgdHJlZSBvZiBKUyBzbmlwcGV0cyBpbiB0aGlzIG5vZGUgYW5kIGl0cyBjaGlsZHJlbi4gVGhlXG4gICAqIHdhbGtpbmcgZnVuY3Rpb24gaXMgY2FsbGVkIG9uY2UgZm9yIGVhY2ggc25pcHBldCBvZiBKUyBhbmQgaXMgcGFzc2VkIHRoYXRcbiAgICogc25pcHBldCBhbmQgdGhlIGl0cyBvcmlnaW5hbCBhc3NvY2lhdGVkIHNvdXJjZSdzIGxpbmUvY29sdW1uIGxvY2F0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0gYUZuIFRoZSB0cmF2ZXJzYWwgZnVuY3Rpb24uXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS53YWxrID0gZnVuY3Rpb24gU291cmNlTm9kZV93YWxrKGFGbikge1xuICAgIHZhciBjaHVuaztcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgY2h1bmsgPSB0aGlzLmNoaWxkcmVuW2ldO1xuICAgICAgaWYgKGNodW5rIGluc3RhbmNlb2YgU291cmNlTm9kZSkge1xuICAgICAgICBjaHVuay53YWxrKGFGbik7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgaWYgKGNodW5rICE9PSAnJykge1xuICAgICAgICAgIGFGbihjaHVuaywgeyBzb3VyY2U6IHRoaXMuc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5jb2x1bW4sXG4gICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMubmFtZSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICAvKipcbiAgICogTGlrZSBgU3RyaW5nLnByb3RvdHlwZS5qb2luYCBleGNlcHQgZm9yIFNvdXJjZU5vZGVzLiBJbnNlcnRzIGBhU3RyYCBiZXR3ZWVuXG4gICAqIGVhY2ggb2YgYHRoaXMuY2hpbGRyZW5gLlxuICAgKlxuICAgKiBAcGFyYW0gYVNlcCBUaGUgc2VwYXJhdG9yLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUuam9pbiA9IGZ1bmN0aW9uIFNvdXJjZU5vZGVfam9pbihhU2VwKSB7XG4gICAgdmFyIG5ld0NoaWxkcmVuO1xuICAgIHZhciBpO1xuICAgIHZhciBsZW4gPSB0aGlzLmNoaWxkcmVuLmxlbmd0aDtcbiAgICBpZiAobGVuID4gMCkge1xuICAgICAgbmV3Q2hpbGRyZW4gPSBbXTtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW4tMTsgaSsrKSB7XG4gICAgICAgIG5ld0NoaWxkcmVuLnB1c2godGhpcy5jaGlsZHJlbltpXSk7XG4gICAgICAgIG5ld0NoaWxkcmVuLnB1c2goYVNlcCk7XG4gICAgICB9XG4gICAgICBuZXdDaGlsZHJlbi5wdXNoKHRoaXMuY2hpbGRyZW5baV0pO1xuICAgICAgdGhpcy5jaGlsZHJlbiA9IG5ld0NoaWxkcmVuO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvKipcbiAgICogQ2FsbCBTdHJpbmcucHJvdG90eXBlLnJlcGxhY2Ugb24gdGhlIHZlcnkgcmlnaHQtbW9zdCBzb3VyY2Ugc25pcHBldC4gVXNlZnVsXG4gICAqIGZvciB0cmltbWluZyB3aGl0ZXNwYWNlIGZyb20gdGhlIGVuZCBvZiBhIHNvdXJjZSBub2RlLCBldGMuXG4gICAqXG4gICAqIEBwYXJhbSBhUGF0dGVybiBUaGUgcGF0dGVybiB0byByZXBsYWNlLlxuICAgKiBAcGFyYW0gYVJlcGxhY2VtZW50IFRoZSB0aGluZyB0byByZXBsYWNlIHRoZSBwYXR0ZXJuIHdpdGguXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS5yZXBsYWNlUmlnaHQgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3JlcGxhY2VSaWdodChhUGF0dGVybiwgYVJlcGxhY2VtZW50KSB7XG4gICAgdmFyIGxhc3RDaGlsZCA9IHRoaXMuY2hpbGRyZW5bdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxXTtcbiAgICBpZiAobGFzdENoaWxkIGluc3RhbmNlb2YgU291cmNlTm9kZSkge1xuICAgICAgbGFzdENoaWxkLnJlcGxhY2VSaWdodChhUGF0dGVybiwgYVJlcGxhY2VtZW50KTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIGxhc3RDaGlsZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRoaXMuY2hpbGRyZW5bdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxXSA9IGxhc3RDaGlsZC5yZXBsYWNlKGFQYXR0ZXJuLCBhUmVwbGFjZW1lbnQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRoaXMuY2hpbGRyZW4ucHVzaCgnJy5yZXBsYWNlKGFQYXR0ZXJuLCBhUmVwbGFjZW1lbnQpKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgc291cmNlIGNvbnRlbnQgZm9yIGEgc291cmNlIGZpbGUuIFRoaXMgd2lsbCBiZSBhZGRlZCB0byB0aGUgU291cmNlTWFwR2VuZXJhdG9yXG4gICAqIGluIHRoZSBzb3VyY2VzQ29udGVudCBmaWVsZC5cbiAgICpcbiAgICogQHBhcmFtIGFTb3VyY2VGaWxlIFRoZSBmaWxlbmFtZSBvZiB0aGUgc291cmNlIGZpbGVcbiAgICogQHBhcmFtIGFTb3VyY2VDb250ZW50IFRoZSBjb250ZW50IG9mIHRoZSBzb3VyY2UgZmlsZVxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUuc2V0U291cmNlQ29udGVudCA9XG4gICAgZnVuY3Rpb24gU291cmNlTm9kZV9zZXRTb3VyY2VDb250ZW50KGFTb3VyY2VGaWxlLCBhU291cmNlQ29udGVudCkge1xuICAgICAgdGhpcy5zb3VyY2VDb250ZW50c1t1dGlsLnRvU2V0U3RyaW5nKGFTb3VyY2VGaWxlKV0gPSBhU291cmNlQ29udGVudDtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBXYWxrIG92ZXIgdGhlIHRyZWUgb2YgU291cmNlTm9kZXMuIFRoZSB3YWxraW5nIGZ1bmN0aW9uIGlzIGNhbGxlZCBmb3IgZWFjaFxuICAgKiBzb3VyY2UgZmlsZSBjb250ZW50IGFuZCBpcyBwYXNzZWQgdGhlIGZpbGVuYW1lIGFuZCBzb3VyY2UgY29udGVudC5cbiAgICpcbiAgICogQHBhcmFtIGFGbiBUaGUgdHJhdmVyc2FsIGZ1bmN0aW9uLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUud2Fsa1NvdXJjZUNvbnRlbnRzID1cbiAgICBmdW5jdGlvbiBTb3VyY2VOb2RlX3dhbGtTb3VyY2VDb250ZW50cyhhRm4pIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmICh0aGlzLmNoaWxkcmVuW2ldIGluc3RhbmNlb2YgU291cmNlTm9kZSkge1xuICAgICAgICAgIHRoaXMuY2hpbGRyZW5baV0ud2Fsa1NvdXJjZUNvbnRlbnRzKGFGbik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIHNvdXJjZXMgPSBPYmplY3Qua2V5cyh0aGlzLnNvdXJjZUNvbnRlbnRzKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzb3VyY2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGFGbih1dGlsLmZyb21TZXRTdHJpbmcoc291cmNlc1tpXSksIHRoaXMuc291cmNlQ29udGVudHNbc291cmNlc1tpXV0pO1xuICAgICAgfVxuICAgIH07XG5cbiAgLyoqXG4gICAqIFJldHVybiB0aGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgc291cmNlIG5vZGUuIFdhbGtzIG92ZXIgdGhlIHRyZWVcbiAgICogYW5kIGNvbmNhdGVuYXRlcyBhbGwgdGhlIHZhcmlvdXMgc25pcHBldHMgdG9nZXRoZXIgdG8gb25lIHN0cmluZy5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gU291cmNlTm9kZV90b1N0cmluZygpIHtcbiAgICB2YXIgc3RyID0gXCJcIjtcbiAgICB0aGlzLndhbGsoZnVuY3Rpb24gKGNodW5rKSB7XG4gICAgICBzdHIgKz0gY2h1bms7XG4gICAgfSk7XG4gICAgcmV0dXJuIHN0cjtcbiAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgc291cmNlIG5vZGUgYWxvbmcgd2l0aCBhIHNvdXJjZVxuICAgKiBtYXAuXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS50b1N0cmluZ1dpdGhTb3VyY2VNYXAgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3RvU3RyaW5nV2l0aFNvdXJjZU1hcChhQXJncykge1xuICAgIHZhciBnZW5lcmF0ZWQgPSB7XG4gICAgICBjb2RlOiBcIlwiLFxuICAgICAgbGluZTogMSxcbiAgICAgIGNvbHVtbjogMFxuICAgIH07XG4gICAgdmFyIG1hcCA9IG5ldyBTb3VyY2VNYXBHZW5lcmF0b3IoYUFyZ3MpO1xuICAgIHZhciBzb3VyY2VNYXBwaW5nQWN0aXZlID0gZmFsc2U7XG4gICAgdmFyIGxhc3RPcmlnaW5hbFNvdXJjZSA9IG51bGw7XG4gICAgdmFyIGxhc3RPcmlnaW5hbExpbmUgPSBudWxsO1xuICAgIHZhciBsYXN0T3JpZ2luYWxDb2x1bW4gPSBudWxsO1xuICAgIHZhciBsYXN0T3JpZ2luYWxOYW1lID0gbnVsbDtcbiAgICB0aGlzLndhbGsoZnVuY3Rpb24gKGNodW5rLCBvcmlnaW5hbCkge1xuICAgICAgZ2VuZXJhdGVkLmNvZGUgKz0gY2h1bms7XG4gICAgICBpZiAob3JpZ2luYWwuc291cmNlICE9PSBudWxsXG4gICAgICAgICAgJiYgb3JpZ2luYWwubGluZSAhPT0gbnVsbFxuICAgICAgICAgICYmIG9yaWdpbmFsLmNvbHVtbiAhPT0gbnVsbCkge1xuICAgICAgICBpZihsYXN0T3JpZ2luYWxTb3VyY2UgIT09IG9yaWdpbmFsLnNvdXJjZVxuICAgICAgICAgICB8fCBsYXN0T3JpZ2luYWxMaW5lICE9PSBvcmlnaW5hbC5saW5lXG4gICAgICAgICAgIHx8IGxhc3RPcmlnaW5hbENvbHVtbiAhPT0gb3JpZ2luYWwuY29sdW1uXG4gICAgICAgICAgIHx8IGxhc3RPcmlnaW5hbE5hbWUgIT09IG9yaWdpbmFsLm5hbWUpIHtcbiAgICAgICAgICBtYXAuYWRkTWFwcGluZyh7XG4gICAgICAgICAgICBzb3VyY2U6IG9yaWdpbmFsLnNvdXJjZSxcbiAgICAgICAgICAgIG9yaWdpbmFsOiB7XG4gICAgICAgICAgICAgIGxpbmU6IG9yaWdpbmFsLmxpbmUsXG4gICAgICAgICAgICAgIGNvbHVtbjogb3JpZ2luYWwuY29sdW1uXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2VuZXJhdGVkOiB7XG4gICAgICAgICAgICAgIGxpbmU6IGdlbmVyYXRlZC5saW5lLFxuICAgICAgICAgICAgICBjb2x1bW46IGdlbmVyYXRlZC5jb2x1bW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBuYW1lOiBvcmlnaW5hbC5uYW1lXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdE9yaWdpbmFsU291cmNlID0gb3JpZ2luYWwuc291cmNlO1xuICAgICAgICBsYXN0T3JpZ2luYWxMaW5lID0gb3JpZ2luYWwubGluZTtcbiAgICAgICAgbGFzdE9yaWdpbmFsQ29sdW1uID0gb3JpZ2luYWwuY29sdW1uO1xuICAgICAgICBsYXN0T3JpZ2luYWxOYW1lID0gb3JpZ2luYWwubmFtZTtcbiAgICAgICAgc291cmNlTWFwcGluZ0FjdGl2ZSA9IHRydWU7XG4gICAgICB9IGVsc2UgaWYgKHNvdXJjZU1hcHBpbmdBY3RpdmUpIHtcbiAgICAgICAgbWFwLmFkZE1hcHBpbmcoe1xuICAgICAgICAgIGdlbmVyYXRlZDoge1xuICAgICAgICAgICAgbGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgICAgICBjb2x1bW46IGdlbmVyYXRlZC5jb2x1bW5cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBsYXN0T3JpZ2luYWxTb3VyY2UgPSBudWxsO1xuICAgICAgICBzb3VyY2VNYXBwaW5nQWN0aXZlID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBjaHVuay5zcGxpdCgnJykuZm9yRWFjaChmdW5jdGlvbiAoY2gsIGlkeCwgYXJyYXkpIHtcbiAgICAgICAgaWYgKGNoID09PSAnXFxuJykge1xuICAgICAgICAgIGdlbmVyYXRlZC5saW5lKys7XG4gICAgICAgICAgZ2VuZXJhdGVkLmNvbHVtbiA9IDA7XG4gICAgICAgICAgLy8gTWFwcGluZ3MgZW5kIGF0IGVvbFxuICAgICAgICAgIGlmIChpZHggKyAxID09PSBhcnJheS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxhc3RPcmlnaW5hbFNvdXJjZSA9IG51bGw7XG4gICAgICAgICAgICBzb3VyY2VNYXBwaW5nQWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgfSBlbHNlIGlmIChzb3VyY2VNYXBwaW5nQWN0aXZlKSB7XG4gICAgICAgICAgICBtYXAuYWRkTWFwcGluZyh7XG4gICAgICAgICAgICAgIHNvdXJjZTogb3JpZ2luYWwuc291cmNlLFxuICAgICAgICAgICAgICBvcmlnaW5hbDoge1xuICAgICAgICAgICAgICAgIGxpbmU6IG9yaWdpbmFsLmxpbmUsXG4gICAgICAgICAgICAgICAgY29sdW1uOiBvcmlnaW5hbC5jb2x1bW5cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgZ2VuZXJhdGVkOiB7XG4gICAgICAgICAgICAgICAgbGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgICAgICAgICAgY29sdW1uOiBnZW5lcmF0ZWQuY29sdW1uXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIG5hbWU6IG9yaWdpbmFsLm5hbWVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBnZW5lcmF0ZWQuY29sdW1uKys7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHRoaXMud2Fsa1NvdXJjZUNvbnRlbnRzKGZ1bmN0aW9uIChzb3VyY2VGaWxlLCBzb3VyY2VDb250ZW50KSB7XG4gICAgICBtYXAuc2V0U291cmNlQ29udGVudChzb3VyY2VGaWxlLCBzb3VyY2VDb250ZW50KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB7IGNvZGU6IGdlbmVyYXRlZC5jb2RlLCBtYXA6IG1hcCB9O1xuICB9O1xuXG4gIGV4cG9ydHMuU291cmNlTm9kZSA9IFNvdXJjZU5vZGU7XG5cbn0pO1xuIiwiLyogLSotIE1vZGU6IGpzOyBqcy1pbmRlbnQtbGV2ZWw6IDI7IC0qLSAqL1xuLypcbiAqIENvcHlyaWdodCAyMDExIE1vemlsbGEgRm91bmRhdGlvbiBhbmQgY29udHJpYnV0b3JzXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTmV3IEJTRCBsaWNlbnNlLiBTZWUgTElDRU5TRSBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuaWYgKHR5cGVvZiBkZWZpbmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgZGVmaW5lID0gcmVxdWlyZSgnYW1kZWZpbmUnKShtb2R1bGUsIHJlcXVpcmUpO1xufVxuZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblxuICAvKipcbiAgICogVGhpcyBpcyBhIGhlbHBlciBmdW5jdGlvbiBmb3IgZ2V0dGluZyB2YWx1ZXMgZnJvbSBwYXJhbWV0ZXIvb3B0aW9uc1xuICAgKiBvYmplY3RzLlxuICAgKlxuICAgKiBAcGFyYW0gYXJncyBUaGUgb2JqZWN0IHdlIGFyZSBleHRyYWN0aW5nIHZhbHVlcyBmcm9tXG4gICAqIEBwYXJhbSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBwcm9wZXJ0eSB3ZSBhcmUgZ2V0dGluZy5cbiAgICogQHBhcmFtIGRlZmF1bHRWYWx1ZSBBbiBvcHRpb25hbCB2YWx1ZSB0byByZXR1cm4gaWYgdGhlIHByb3BlcnR5IGlzIG1pc3NpbmdcbiAgICogZnJvbSB0aGUgb2JqZWN0LiBJZiB0aGlzIGlzIG5vdCBzcGVjaWZpZWQgYW5kIHRoZSBwcm9wZXJ0eSBpcyBtaXNzaW5nLCBhblxuICAgKiBlcnJvciB3aWxsIGJlIHRocm93bi5cbiAgICovXG4gIGZ1bmN0aW9uIGdldEFyZyhhQXJncywgYU5hbWUsIGFEZWZhdWx0VmFsdWUpIHtcbiAgICBpZiAoYU5hbWUgaW4gYUFyZ3MpIHtcbiAgICAgIHJldHVybiBhQXJnc1thTmFtZV07XG4gICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzKSB7XG4gICAgICByZXR1cm4gYURlZmF1bHRWYWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdcIicgKyBhTmFtZSArICdcIiBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50LicpO1xuICAgIH1cbiAgfVxuICBleHBvcnRzLmdldEFyZyA9IGdldEFyZztcblxuICB2YXIgdXJsUmVnZXhwID0gL14oPzooW1xcdytcXC0uXSspOik/XFwvXFwvKD86KFxcdys6XFx3KylAKT8oW1xcdy5dKikoPzo6KFxcZCspKT8oXFxTKikkLztcbiAgdmFyIGRhdGFVcmxSZWdleHAgPSAvXmRhdGE6LitcXCwuKyQvO1xuXG4gIGZ1bmN0aW9uIHVybFBhcnNlKGFVcmwpIHtcbiAgICB2YXIgbWF0Y2ggPSBhVXJsLm1hdGNoKHVybFJlZ2V4cCk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBzY2hlbWU6IG1hdGNoWzFdLFxuICAgICAgYXV0aDogbWF0Y2hbMl0sXG4gICAgICBob3N0OiBtYXRjaFszXSxcbiAgICAgIHBvcnQ6IG1hdGNoWzRdLFxuICAgICAgcGF0aDogbWF0Y2hbNV1cbiAgICB9O1xuICB9XG4gIGV4cG9ydHMudXJsUGFyc2UgPSB1cmxQYXJzZTtcblxuICBmdW5jdGlvbiB1cmxHZW5lcmF0ZShhUGFyc2VkVXJsKSB7XG4gICAgdmFyIHVybCA9ICcnO1xuICAgIGlmIChhUGFyc2VkVXJsLnNjaGVtZSkge1xuICAgICAgdXJsICs9IGFQYXJzZWRVcmwuc2NoZW1lICsgJzonO1xuICAgIH1cbiAgICB1cmwgKz0gJy8vJztcbiAgICBpZiAoYVBhcnNlZFVybC5hdXRoKSB7XG4gICAgICB1cmwgKz0gYVBhcnNlZFVybC5hdXRoICsgJ0AnO1xuICAgIH1cbiAgICBpZiAoYVBhcnNlZFVybC5ob3N0KSB7XG4gICAgICB1cmwgKz0gYVBhcnNlZFVybC5ob3N0O1xuICAgIH1cbiAgICBpZiAoYVBhcnNlZFVybC5wb3J0KSB7XG4gICAgICB1cmwgKz0gXCI6XCIgKyBhUGFyc2VkVXJsLnBvcnRcbiAgICB9XG4gICAgaWYgKGFQYXJzZWRVcmwucGF0aCkge1xuICAgICAgdXJsICs9IGFQYXJzZWRVcmwucGF0aDtcbiAgICB9XG4gICAgcmV0dXJuIHVybDtcbiAgfVxuICBleHBvcnRzLnVybEdlbmVyYXRlID0gdXJsR2VuZXJhdGU7XG5cbiAgLyoqXG4gICAqIE5vcm1hbGl6ZXMgYSBwYXRoLCBvciB0aGUgcGF0aCBwb3J0aW9uIG9mIGEgVVJMOlxuICAgKlxuICAgKiAtIFJlcGxhY2VzIGNvbnNlcXV0aXZlIHNsYXNoZXMgd2l0aCBvbmUgc2xhc2guXG4gICAqIC0gUmVtb3ZlcyB1bm5lY2Vzc2FyeSAnLicgcGFydHMuXG4gICAqIC0gUmVtb3ZlcyB1bm5lY2Vzc2FyeSAnPGRpcj4vLi4nIHBhcnRzLlxuICAgKlxuICAgKiBCYXNlZCBvbiBjb2RlIGluIHRoZSBOb2RlLmpzICdwYXRoJyBjb3JlIG1vZHVsZS5cbiAgICpcbiAgICogQHBhcmFtIGFQYXRoIFRoZSBwYXRoIG9yIHVybCB0byBub3JtYWxpemUuXG4gICAqL1xuICBmdW5jdGlvbiBub3JtYWxpemUoYVBhdGgpIHtcbiAgICB2YXIgcGF0aCA9IGFQYXRoO1xuICAgIHZhciB1cmwgPSB1cmxQYXJzZShhUGF0aCk7XG4gICAgaWYgKHVybCkge1xuICAgICAgaWYgKCF1cmwucGF0aCkge1xuICAgICAgICByZXR1cm4gYVBhdGg7XG4gICAgICB9XG4gICAgICBwYXRoID0gdXJsLnBhdGg7XG4gICAgfVxuICAgIHZhciBpc0Fic29sdXRlID0gKHBhdGguY2hhckF0KDApID09PSAnLycpO1xuXG4gICAgdmFyIHBhcnRzID0gcGF0aC5zcGxpdCgvXFwvKy8pO1xuICAgIGZvciAodmFyIHBhcnQsIHVwID0gMCwgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBwYXJ0ID0gcGFydHNbaV07XG4gICAgICBpZiAocGFydCA9PT0gJy4nKSB7XG4gICAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIH0gZWxzZSBpZiAocGFydCA9PT0gJy4uJykge1xuICAgICAgICB1cCsrO1xuICAgICAgfSBlbHNlIGlmICh1cCA+IDApIHtcbiAgICAgICAgaWYgKHBhcnQgPT09ICcnKSB7XG4gICAgICAgICAgLy8gVGhlIGZpcnN0IHBhcnQgaXMgYmxhbmsgaWYgdGhlIHBhdGggaXMgYWJzb2x1dGUuIFRyeWluZyB0byBnb1xuICAgICAgICAgIC8vIGFib3ZlIHRoZSByb290IGlzIGEgbm8tb3AuIFRoZXJlZm9yZSB3ZSBjYW4gcmVtb3ZlIGFsbCAnLi4nIHBhcnRzXG4gICAgICAgICAgLy8gZGlyZWN0bHkgYWZ0ZXIgdGhlIHJvb3QuXG4gICAgICAgICAgcGFydHMuc3BsaWNlKGkgKyAxLCB1cCk7XG4gICAgICAgICAgdXAgPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnRzLnNwbGljZShpLCAyKTtcbiAgICAgICAgICB1cC0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHBhdGggPSBwYXJ0cy5qb2luKCcvJyk7XG5cbiAgICBpZiAocGF0aCA9PT0gJycpIHtcbiAgICAgIHBhdGggPSBpc0Fic29sdXRlID8gJy8nIDogJy4nO1xuICAgIH1cblxuICAgIGlmICh1cmwpIHtcbiAgICAgIHVybC5wYXRoID0gcGF0aDtcbiAgICAgIHJldHVybiB1cmxHZW5lcmF0ZSh1cmwpO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuICBleHBvcnRzLm5vcm1hbGl6ZSA9IG5vcm1hbGl6ZTtcblxuICAvKipcbiAgICogSm9pbnMgdHdvIHBhdGhzL1VSTHMuXG4gICAqXG4gICAqIEBwYXJhbSBhUm9vdCBUaGUgcm9vdCBwYXRoIG9yIFVSTC5cbiAgICogQHBhcmFtIGFQYXRoIFRoZSBwYXRoIG9yIFVSTCB0byBiZSBqb2luZWQgd2l0aCB0aGUgcm9vdC5cbiAgICpcbiAgICogLSBJZiBhUGF0aCBpcyBhIFVSTCBvciBhIGRhdGEgVVJJLCBhUGF0aCBpcyByZXR1cm5lZCwgdW5sZXNzIGFQYXRoIGlzIGFcbiAgICogICBzY2hlbWUtcmVsYXRpdmUgVVJMOiBUaGVuIHRoZSBzY2hlbWUgb2YgYVJvb3QsIGlmIGFueSwgaXMgcHJlcGVuZGVkXG4gICAqICAgZmlyc3QuXG4gICAqIC0gT3RoZXJ3aXNlIGFQYXRoIGlzIGEgcGF0aC4gSWYgYVJvb3QgaXMgYSBVUkwsIHRoZW4gaXRzIHBhdGggcG9ydGlvblxuICAgKiAgIGlzIHVwZGF0ZWQgd2l0aCB0aGUgcmVzdWx0IGFuZCBhUm9vdCBpcyByZXR1cm5lZC4gT3RoZXJ3aXNlIHRoZSByZXN1bHRcbiAgICogICBpcyByZXR1cm5lZC5cbiAgICogICAtIElmIGFQYXRoIGlzIGFic29sdXRlLCB0aGUgcmVzdWx0IGlzIGFQYXRoLlxuICAgKiAgIC0gT3RoZXJ3aXNlIHRoZSB0d28gcGF0aHMgYXJlIGpvaW5lZCB3aXRoIGEgc2xhc2guXG4gICAqIC0gSm9pbmluZyBmb3IgZXhhbXBsZSAnaHR0cDovLycgYW5kICd3d3cuZXhhbXBsZS5jb20nIGlzIGFsc28gc3VwcG9ydGVkLlxuICAgKi9cbiAgZnVuY3Rpb24gam9pbihhUm9vdCwgYVBhdGgpIHtcbiAgICB2YXIgYVBhdGhVcmwgPSB1cmxQYXJzZShhUGF0aCk7XG4gICAgdmFyIGFSb290VXJsID0gdXJsUGFyc2UoYVJvb3QpO1xuICAgIGlmIChhUm9vdFVybCkge1xuICAgICAgYVJvb3QgPSBhUm9vdFVybC5wYXRoIHx8ICcvJztcbiAgICB9XG5cbiAgICAvLyBgam9pbihmb28sICcvL3d3dy5leGFtcGxlLm9yZycpYFxuICAgIGlmIChhUGF0aFVybCAmJiAhYVBhdGhVcmwuc2NoZW1lKSB7XG4gICAgICBpZiAoYVJvb3RVcmwpIHtcbiAgICAgICAgYVBhdGhVcmwuc2NoZW1lID0gYVJvb3RVcmwuc2NoZW1lO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKGFQYXRoVXJsKTtcbiAgICB9XG5cbiAgICBpZiAoYVBhdGhVcmwgfHwgYVBhdGgubWF0Y2goZGF0YVVybFJlZ2V4cCkpIHtcbiAgICAgIHJldHVybiBhUGF0aDtcbiAgICB9XG5cbiAgICAvLyBgam9pbignaHR0cDovLycsICd3d3cuZXhhbXBsZS5jb20nKWBcbiAgICBpZiAoYVJvb3RVcmwgJiYgIWFSb290VXJsLmhvc3QgJiYgIWFSb290VXJsLnBhdGgpIHtcbiAgICAgIGFSb290VXJsLmhvc3QgPSBhUGF0aDtcbiAgICAgIHJldHVybiB1cmxHZW5lcmF0ZShhUm9vdFVybCk7XG4gICAgfVxuXG4gICAgdmFyIGpvaW5lZCA9IGFQYXRoLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICA/IGFQYXRoXG4gICAgICA6IG5vcm1hbGl6ZShhUm9vdC5yZXBsYWNlKC9cXC8rJC8sICcnKSArICcvJyArIGFQYXRoKTtcblxuICAgIGlmIChhUm9vdFVybCkge1xuICAgICAgYVJvb3RVcmwucGF0aCA9IGpvaW5lZDtcbiAgICAgIHJldHVybiB1cmxHZW5lcmF0ZShhUm9vdFVybCk7XG4gICAgfVxuICAgIHJldHVybiBqb2luZWQ7XG4gIH1cbiAgZXhwb3J0cy5qb2luID0gam9pbjtcblxuICAvKipcbiAgICogQmVjYXVzZSBiZWhhdmlvciBnb2VzIHdhY2t5IHdoZW4geW91IHNldCBgX19wcm90b19fYCBvbiBvYmplY3RzLCB3ZVxuICAgKiBoYXZlIHRvIHByZWZpeCBhbGwgdGhlIHN0cmluZ3MgaW4gb3VyIHNldCB3aXRoIGFuIGFyYml0cmFyeSBjaGFyYWN0ZXIuXG4gICAqXG4gICAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9zb3VyY2UtbWFwL3B1bGwvMzEgYW5kXG4gICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL3NvdXJjZS1tYXAvaXNzdWVzLzMwXG4gICAqXG4gICAqIEBwYXJhbSBTdHJpbmcgYVN0clxuICAgKi9cbiAgZnVuY3Rpb24gdG9TZXRTdHJpbmcoYVN0cikge1xuICAgIHJldHVybiAnJCcgKyBhU3RyO1xuICB9XG4gIGV4cG9ydHMudG9TZXRTdHJpbmcgPSB0b1NldFN0cmluZztcblxuICBmdW5jdGlvbiBmcm9tU2V0U3RyaW5nKGFTdHIpIHtcbiAgICByZXR1cm4gYVN0ci5zdWJzdHIoMSk7XG4gIH1cbiAgZXhwb3J0cy5mcm9tU2V0U3RyaW5nID0gZnJvbVNldFN0cmluZztcblxuICBmdW5jdGlvbiByZWxhdGl2ZShhUm9vdCwgYVBhdGgpIHtcbiAgICBhUm9vdCA9IGFSb290LnJlcGxhY2UoL1xcLyQvLCAnJyk7XG5cbiAgICB2YXIgdXJsID0gdXJsUGFyc2UoYVJvb3QpO1xuICAgIGlmIChhUGF0aC5jaGFyQXQoMCkgPT0gXCIvXCIgJiYgdXJsICYmIHVybC5wYXRoID09IFwiL1wiKSB7XG4gICAgICByZXR1cm4gYVBhdGguc2xpY2UoMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFQYXRoLmluZGV4T2YoYVJvb3QgKyAnLycpID09PSAwXG4gICAgICA/IGFQYXRoLnN1YnN0cihhUm9vdC5sZW5ndGggKyAxKVxuICAgICAgOiBhUGF0aDtcbiAgfVxuICBleHBvcnRzLnJlbGF0aXZlID0gcmVsYXRpdmU7XG5cbiAgZnVuY3Rpb24gc3RyY21wKGFTdHIxLCBhU3RyMikge1xuICAgIHZhciBzMSA9IGFTdHIxIHx8IFwiXCI7XG4gICAgdmFyIHMyID0gYVN0cjIgfHwgXCJcIjtcbiAgICByZXR1cm4gKHMxID4gczIpIC0gKHMxIDwgczIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbXBhcmF0b3IgYmV0d2VlbiB0d28gbWFwcGluZ3Mgd2hlcmUgdGhlIG9yaWdpbmFsIHBvc2l0aW9ucyBhcmUgY29tcGFyZWQuXG4gICAqXG4gICAqIE9wdGlvbmFsbHkgcGFzcyBpbiBgdHJ1ZWAgYXMgYG9ubHlDb21wYXJlR2VuZXJhdGVkYCB0byBjb25zaWRlciB0d29cbiAgICogbWFwcGluZ3Mgd2l0aCB0aGUgc2FtZSBvcmlnaW5hbCBzb3VyY2UvbGluZS9jb2x1bW4sIGJ1dCBkaWZmZXJlbnQgZ2VuZXJhdGVkXG4gICAqIGxpbmUgYW5kIGNvbHVtbiB0aGUgc2FtZS4gVXNlZnVsIHdoZW4gc2VhcmNoaW5nIGZvciBhIG1hcHBpbmcgd2l0aCBhXG4gICAqIHN0dWJiZWQgb3V0IG1hcHBpbmcuXG4gICAqL1xuICBmdW5jdGlvbiBjb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyhtYXBwaW5nQSwgbWFwcGluZ0IsIG9ubHlDb21wYXJlT3JpZ2luYWwpIHtcbiAgICB2YXIgY21wO1xuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLnNvdXJjZSwgbWFwcGluZ0Iuc291cmNlKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsTGluZSAtIG1hcHBpbmdCLm9yaWdpbmFsTGluZTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsQ29sdW1uIC0gbWFwcGluZ0Iub3JpZ2luYWxDb2x1bW47XG4gICAgaWYgKGNtcCB8fCBvbmx5Q29tcGFyZU9yaWdpbmFsKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IHN0cmNtcChtYXBwaW5nQS5uYW1lLCBtYXBwaW5nQi5uYW1lKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLmdlbmVyYXRlZExpbmUgLSBtYXBwaW5nQi5nZW5lcmF0ZWRMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hcHBpbmdBLmdlbmVyYXRlZENvbHVtbiAtIG1hcHBpbmdCLmdlbmVyYXRlZENvbHVtbjtcbiAgfTtcbiAgZXhwb3J0cy5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyA9IGNvbXBhcmVCeU9yaWdpbmFsUG9zaXRpb25zO1xuXG4gIC8qKlxuICAgKiBDb21wYXJhdG9yIGJldHdlZW4gdHdvIG1hcHBpbmdzIHdoZXJlIHRoZSBnZW5lcmF0ZWQgcG9zaXRpb25zIGFyZVxuICAgKiBjb21wYXJlZC5cbiAgICpcbiAgICogT3B0aW9uYWxseSBwYXNzIGluIGB0cnVlYCBhcyBgb25seUNvbXBhcmVHZW5lcmF0ZWRgIHRvIGNvbnNpZGVyIHR3b1xuICAgKiBtYXBwaW5ncyB3aXRoIHRoZSBzYW1lIGdlbmVyYXRlZCBsaW5lIGFuZCBjb2x1bW4sIGJ1dCBkaWZmZXJlbnRcbiAgICogc291cmNlL25hbWUvb3JpZ2luYWwgbGluZSBhbmQgY29sdW1uIHRoZSBzYW1lLiBVc2VmdWwgd2hlbiBzZWFyY2hpbmcgZm9yIGFcbiAgICogbWFwcGluZyB3aXRoIGEgc3R1YmJlZCBvdXQgbWFwcGluZy5cbiAgICovXG4gIGZ1bmN0aW9uIGNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyhtYXBwaW5nQSwgbWFwcGluZ0IsIG9ubHlDb21wYXJlR2VuZXJhdGVkKSB7XG4gICAgdmFyIGNtcDtcblxuICAgIGNtcCA9IG1hcHBpbmdBLmdlbmVyYXRlZExpbmUgLSBtYXBwaW5nQi5nZW5lcmF0ZWRMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0EuZ2VuZXJhdGVkQ29sdW1uIC0gbWFwcGluZ0IuZ2VuZXJhdGVkQ29sdW1uO1xuICAgIGlmIChjbXAgfHwgb25seUNvbXBhcmVHZW5lcmF0ZWQpIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLnNvdXJjZSwgbWFwcGluZ0Iuc291cmNlKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsTGluZSAtIG1hcHBpbmdCLm9yaWdpbmFsTGluZTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsQ29sdW1uIC0gbWFwcGluZ0Iub3JpZ2luYWxDb2x1bW47XG4gICAgaWYgKGNtcCkge1xuICAgICAgcmV0dXJuIGNtcDtcbiAgICB9XG5cbiAgICByZXR1cm4gc3RyY21wKG1hcHBpbmdBLm5hbWUsIG1hcHBpbmdCLm5hbWUpO1xuICB9O1xuICBleHBvcnRzLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyA9IGNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucztcblxufSk7XG4iLCJcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZXhjZXB0aW9uTW9kZShjcmVhdGVFeGNlcHRpb24oKSkgLy8gYmFzaWNhbGx5IHdoYXQgYnJvd3NlciB0aGlzIGlzXHJcblxyXG4vLyB2ZXJiYXRpbSBmcm9tIGBtb2RlYCBpbiBzdGFja3RyYWNlLmpzIGFzIG9mIDIwMTQtMDEtMjNcclxuZnVuY3Rpb24gZXhjZXB0aW9uTW9kZShlKSB7XHJcbiAgICBpZiAoZVsnYXJndW1lbnRzJ10gJiYgZS5zdGFjaykge1xyXG4gICAgICAgIHJldHVybiAnY2hyb21lJztcclxuICAgIH0gZWxzZSBpZiAoZS5zdGFjayAmJiBlLnNvdXJjZVVSTCkge1xyXG4gICAgICAgIHJldHVybiAnc2FmYXJpJztcclxuICAgIH0gZWxzZSBpZiAoZS5zdGFjayAmJiBlLm51bWJlcikge1xyXG4gICAgICAgIHJldHVybiAnaWUnO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZS5tZXNzYWdlID09PSAnc3RyaW5nJyAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cub3BlcmEpIHtcclxuICAgICAgICAvLyBlLm1lc3NhZ2UuaW5kZXhPZihcIkJhY2t0cmFjZTpcIikgPiAtMSAtPiBvcGVyYVxyXG4gICAgICAgIC8vICFlLnN0YWNrdHJhY2UgLT4gb3BlcmFcclxuICAgICAgICBpZiAoIWUuc3RhY2t0cmFjZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ29wZXJhOSc7IC8vIHVzZSBlLm1lc3NhZ2VcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gJ29wZXJhI3NvdXJjZWxvYycgaW4gZSAtPiBvcGVyYTksIG9wZXJhMTBhXHJcbiAgICAgICAgaWYgKGUubWVzc2FnZS5pbmRleE9mKCdcXG4nKSA+IC0xICYmIGUubWVzc2FnZS5zcGxpdCgnXFxuJykubGVuZ3RoID4gZS5zdGFja3RyYWNlLnNwbGl0KCdcXG4nKS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdvcGVyYTknOyAvLyB1c2UgZS5tZXNzYWdlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGUuc3RhY2t0cmFjZSAmJiAhZS5zdGFjayAtPiBvcGVyYTEwYVxyXG4gICAgICAgIGlmICghZS5zdGFjaykge1xyXG4gICAgICAgICAgICByZXR1cm4gJ29wZXJhMTBhJzsgLy8gdXNlIGUuc3RhY2t0cmFjZVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBlLnN0YWNrdHJhY2UgJiYgZS5zdGFjayAtPiBvcGVyYTEwYlxyXG4gICAgICAgIGlmIChlLnN0YWNrdHJhY2UuaW5kZXhPZihcImNhbGxlZCBmcm9tIGxpbmVcIikgPCAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnb3BlcmExMGInOyAvLyB1c2UgZS5zdGFja3RyYWNlLCBmb3JtYXQgZGlmZmVycyBmcm9tICdvcGVyYTEwYSdcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gZS5zdGFja3RyYWNlICYmIGUuc3RhY2sgLT4gb3BlcmExMVxyXG4gICAgICAgIHJldHVybiAnb3BlcmExMSc7IC8vIHVzZSBlLnN0YWNrdHJhY2UsIGZvcm1hdCBkaWZmZXJzIGZyb20gJ29wZXJhMTBhJywgJ29wZXJhMTBiJ1xyXG4gICAgfSBlbHNlIGlmIChlLnN0YWNrICYmICFlLmZpbGVOYW1lKSB7XHJcbiAgICAgICAgLy8gQ2hyb21lIDI3IGRvZXMgbm90IGhhdmUgZS5hcmd1bWVudHMgYXMgZWFybGllciB2ZXJzaW9ucyxcclxuICAgICAgICAvLyBidXQgc3RpbGwgZG9lcyBub3QgaGF2ZSBlLmZpbGVOYW1lIGFzIEZpcmVmb3hcclxuICAgICAgICByZXR1cm4gJ2Nocm9tZSc7XHJcbiAgICB9IGVsc2UgaWYgKGUuc3RhY2spIHtcclxuICAgICAgICByZXR1cm4gJ2ZpcmVmb3gnO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuICdvdGhlcic7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUV4Y2VwdGlvbigpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdGhpcy51bmRlZigpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIHJldHVybiBlO1xyXG4gICAgfVxyXG59XHJcbiIsInZhciBwcmludFN0YWNrVHJhY2UgPSByZXF1aXJlKCdzdGFja3RyYWNlLWpzJylcbnZhciBwYXJzZXJzID0gcmVxdWlyZSgnLi90cmFjZWxpbmVQYXJzZXInKVxudmFyIG1vZGUgPSByZXF1aXJlKCcuL2V4Y2VwdGlvbk1vZGUnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGV4KSB7XG4gICAgaWYocGFyc2Vyc1ttb2RlXSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJicm93c2VyIFwiK21vZGUrXCIgbm90IHN1cHBvcnRlZFwiKVxuXG4gICAgdmFyIG9wdGlvbnMgPSB1bmRlZmluZWRcbiAgICBpZihleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmKG1vZGUgPT09ICdpZScgJiYgZXgubnVtYmVyID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBleC5udW1iZXIgPSAxICAgIC8vIHdvcmsgYXJvdW5kIGZvciB0aGlzOiBodHRwczovL2dpdGh1Yi5jb20vc3RhY2t0cmFjZWpzL3N0YWNrdHJhY2UuanMvaXNzdWVzLzgwXG4gICAgICAgIG9wdGlvbnMgPSB7ZTpleCwgZ3Vlc3M6IHRydWV9XG4gICAgfVxuICAgIHZhciB0cmFjZSA9IHByaW50U3RhY2tUcmFjZShvcHRpb25zKVxuXG4gICAgaWYoZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0cmFjZS5zcGxpY2UoMCw0KSAvLyBzdHJpcCBzdGFja3RyYWNlLWpzIGludGVybmFsc1xuICAgIH1cblxuICAgIHJldHVybiBwYXJzZVN0YWNrdHJhY2UodHJhY2UpXG59XG5cbmZ1bmN0aW9uIFRyYWNlSW5mbyh0cmFjZWxpbmUpIHtcbiAgICB0aGlzLnRyYWNlbGluZSA9IHRyYWNlbGluZVxufVxuVHJhY2VJbmZvLnByb3RvdHlwZSA9IHtcbiAgICBnZXQgZmlsZSgpIHtcbiAgICAgICAgcmV0dXJuIGdldEluZm8odGhpcykuZmlsZVxuICAgIH0sXG4gICAgZ2V0IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gZ2V0SW5mbyh0aGlzKS5mdW5jdGlvblxuICAgIH0sXG4gICAgZ2V0IGxpbmUoKSB7XG4gICAgICAgIHJldHVybiBnZXRJbmZvKHRoaXMpLmxpbmVcbiAgICB9LFxuICAgIGdldCBjb2x1bW4oKSB7XG4gICAgICAgIHJldHVybiBnZXRJbmZvKHRoaXMpLmNvbHVtblxuICAgIH0sXG4gICAgZ2V0IGluZm8oKSB7XG4gICAgICAgIHJldHVybiBnZXRJbmZvKHRoaXMpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRJbmZvKHRyYWNlSW5mbykge1xuICAgIGlmKHRyYWNlSW5mby5jYWNoZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHZhciBpbmZvID0gcGFyc2Vyc1ttb2RlXSh0cmFjZUluZm8udHJhY2VsaW5lKVxuICAgICAgICBpZihpbmZvLmxpbmUgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGluZm8ubGluZSA9IHBhcnNlSW50KGluZm8ubGluZSwgMTApXG4gICAgICAgIGlmKGluZm8uY29sdW1uICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBpbmZvLmNvbHVtbiA9IHBhcnNlSW50KGluZm8uY29sdW1uLCAxMClcblxuICAgICAgICB0cmFjZUluZm8uY2FjaGUgPSBpbmZvXG4gICAgfVxuXG4gICAgcmV0dXJuIHRyYWNlSW5mby5jYWNoZVxufVxuXG5mdW5jdGlvbiBwYXJzZVN0YWNrdHJhY2UodHJhY2UpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdXG4gICAgZm9yKHZhciBuID0gMDsgbjx0cmFjZS5sZW5ndGg7IG4rKykge1xuICAgICAgICByZXN1bHRzLnB1c2gobmV3IFRyYWNlSW5mbyh0cmFjZVtuXSkpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzXG59XG5cbi8vIGhlcmUgYmVjYXVzZSBpJ20gbGF6eSwgdGhleSdyZSBoZXJlIGZvciB0ZXN0aW5nIG9ubHlcbm1vZHVsZS5leHBvcnRzLnBhcnNlcnMgPSBwYXJzZXJzXG5tb2R1bGUuZXhwb3J0cy5tb2RlID0gbW9kZVxubW9kdWxlLmV4cG9ydHMuc291cmNlQ2FjaGUgPSBwcmludFN0YWNrVHJhY2UuaW1wbGVtZW50YXRpb24ucHJvdG90eXBlLnNvdXJjZUNhY2hlIC8vIGV4cG9zZSB0aGlzIHNvIHlvdSBjYW4gY29uc29saWRhdGUgY2FjaGVzIHRvZ2V0aGVyIGZyb20gZGlmZmVyZW50IGxpYnJhcmllc1xuIiwiXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgY2hyb21lOiBmdW5jdGlvbihsaW5lKSB7XHJcbiAgICAgICAgdmFyIG0gPSBsaW5lLm1hdGNoKENIUk9NRV9TVEFDS19MSU5FKTtcclxuICAgICAgICBpZiAobSkge1xyXG4gICAgICAgICAgICB2YXIgZmlsZSA9IG1bOV0gfHwgbVsxOF0gfHwgbVsyNl1cclxuICAgICAgICAgICAgdmFyIGZuID0gbVs0XSB8fCBtWzddIHx8IG1bMTRdIHx8IG1bMjNdXHJcbiAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gbVsxMV0gfHwgbVsyMF1cclxuICAgICAgICAgICAgdmFyIGNvbHVtbiA9IG1bMTNdIHx8IG1bMjJdXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy90aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBwYXJzZSBleGNlcHRpb24gbGluZTogXCIrbGluZSlcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZmlsZTogZmlsZSxcclxuICAgICAgICAgICAgZnVuY3Rpb246IGZuLFxyXG4gICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxyXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcclxuICAgIGZpcmVmb3g6IGZ1bmN0aW9uKGxpbmUpIHtcclxuICAgICAgICB2YXIgbSA9IGxpbmUubWF0Y2goRklSRUZPWF9TVEFDS19MSU5FKTtcclxuICAgICAgICBpZiAobSkge1xyXG4gICAgICAgICAgICB2YXIgZmlsZSA9IG1bOF1cclxuICAgICAgICAgICAgdmFyIGZuID0gbVsxXVxyXG4gICAgICAgICAgICB2YXIgbGluZU51bWJlciA9IG1bMTBdXHJcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBtWzEyXVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBmaWxlOiBmaWxlLFxyXG4gICAgICAgICAgICBmdW5jdGlvbjogZm4sXHJcbiAgICAgICAgICAgIGxpbmU6IGxpbmVOdW1iZXIsXHJcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uXHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuICAgIFxyXG4gICAgaWU6IGZ1bmN0aW9uKGxpbmUpIHtcclxuICAgICAgICB2YXIgbSA9IGxpbmUubWF0Y2goSUVfU1RBQ0tfTElORSk7XHJcbiAgICAgICAgaWYgKG0pIHtcclxuICAgICAgICAgICAgdmFyIGZpbGUgPSBtWzNdIHx8IG1bMTBdXHJcbiAgICAgICAgICAgIHZhciBmbiA9IG1bMl0gfHwgbVs5XVxyXG4gICAgICAgICAgICB2YXIgbGluZU51bWJlciA9IG1bNV0gfHwgbVsxMl1cclxuICAgICAgICAgICAgdmFyIGNvbHVtbiA9IG1bN10gfHwgbVsxNF1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZmlsZTogZmlsZSxcclxuICAgICAgICAgICAgZnVuY3Rpb246IGZuLFxyXG4gICAgICAgICAgICBsaW5lOiBsaW5lTnVtYmVyLFxyXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gVGhlIGZvbGxvd2luZyAyIHJlZ2V4IHBhdHRlcm5zIHdlcmUgb3JpZ2luYWxseSB0YWtlbiBmcm9tIGdvb2dsZSBjbG9zdXJlIGxpYnJhcnk6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2xvc3VyZS1saWJyYXJ5L3NvdXJjZS9icm93c2UvY2xvc3VyZS9nb29nL3Rlc3Rpbmcvc3RhY2t0cmFjZS5qc1xyXG4vLyBSZWdFeHAgcGF0dGVybiBmb3IgSmF2YVNjcmlwdCBpZGVudGlmaWVycy4gV2UgZG9uJ3Qgc3VwcG9ydCBVbmljb2RlIGlkZW50aWZpZXJzIGRlZmluZWQgaW4gRUNNQVNjcmlwdCB2My5cclxudmFyIElERU5USUZJRVJfUEFUVEVSTl8gPSAnW1xcXFx3JF0qJztcclxuLy8gUmVnRXhwIHBhdHRlcm4gZm9yIGFuIFVSTCArIHBvc2l0aW9uIGluc2lkZSB0aGUgZmlsZS5cclxudmFyIFVSTF9QQVRURVJOXyA9ICcoKD86aHR0cHxodHRwc3xmaWxlKTovL1teXFxcXHMpXSs/fGphdmFzY3JpcHQ6LiopJztcclxudmFyIEZJTEVfQU5EX0xJTkUgPSBVUkxfUEFUVEVSTl8rJyg6KFxcXFxkKikoOihcXFxcZCopKT8pJ1xyXG5cclxudmFyIFNUQUNLVFJBQ0VfSlNfR0VUU09VUkNFX0ZBSUxVUkUgPSAnZ2V0U291cmNlIGZhaWxlZCB3aXRoIHVybCdcclxuXHJcbnZhciBDSFJPTUVfU1RBQ0tUUkFDRV9KU19HRVRTT1VSQ0VfRkFJTFVSRSA9IFNUQUNLVFJBQ0VfSlNfR0VUU09VUkNFX0ZBSUxVUkUrJygoPyEnKydcXFxcKFxcXFwpQCcrJykuKSonXHJcblxyXG52YXIgQ0hST01FX0ZJTEVfQU5EX0xJTkUgPSBGSUxFX0FORF9MSU5FLy9VUkxfUEFUVEVSTl8rJyg6KFxcXFxkKik6KFxcXFxkKikpJ1xyXG52YXIgQ0hST01FX0lERU5USUZJRVJfUEFUVEVSTiA9ICdcXFxcPD8nK0lERU5USUZJRVJfUEFUVEVSTl8rJ1xcXFw+PydcclxudmFyIENIUk9NRV9DT01QT1VORF9JREVOVElGSUVSID0gXCIoKG5ldyApP1wiK0NIUk9NRV9JREVOVElGSUVSX1BBVFRFUk4rJyhcXFxcLicrQ0hST01FX0lERU5USUZJRVJfUEFUVEVSTisnKSopKCBcXFxcW2FzICcrSURFTlRJRklFUl9QQVRURVJOXysnXSk/J1xyXG52YXIgQ0hST01FX1VOS05PV05fSURFTlRJRklFUiA9IFwiKFxcXFwoXFxcXD9cXFxcKSlcIlxyXG5cclxuLy8gb3V0cHV0IGZyb20gc3RhY2t0cmFjZS5qcyBpczogXCJuYW1lKClALi4uXCIgaW5zdGVhZCBvZiBcIm5hbWUgKC4uLilcIlxyXG52YXIgQ0hST01FX0FOT05ZTU9VU19GVU5DVElPTiA9ICcoJytDSFJPTUVfU1RBQ0tUUkFDRV9KU19HRVRTT1VSQ0VfRkFJTFVSRSsnfCcrQ0hST01FX0NPTVBPVU5EX0lERU5USUZJRVIrJ3wnK0NIUk9NRV9VTktOT1dOX0lERU5USUZJRVIrJyknXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsnXFxcXChcXFxcKScrJ0AnK0NIUk9NRV9GSUxFX0FORF9MSU5FXHJcbnZhciBDSFJPTUVfTk9STUFMX0ZVTkNUSU9OID0gQ0hST01FX0NPTVBPVU5EX0lERU5USUZJRVIrJyBcXFxcKCcrQ0hST01FX0ZJTEVfQU5EX0xJTkUrJ1xcXFwpJ1xyXG52YXIgQ0hST01FX05BVElWRV9GVU5DVElPTiA9IENIUk9NRV9DT01QT1VORF9JREVOVElGSUVSKycgKFxcXFwobmF0aXZlXFxcXCkpJ1xyXG5cclxudmFyIENIUk9NRV9GVU5DVElPTl9DQUxMID0gJygnK0NIUk9NRV9BTk9OWU1PVVNfRlVOQ1RJT04rXCJ8XCIrQ0hST01FX05PUk1BTF9GVU5DVElPTitcInxcIitDSFJPTUVfTkFUSVZFX0ZVTkNUSU9OKycpJ1xyXG5cclxudmFyIENIUk9NRV9TVEFDS19MSU5FID0gbmV3IFJlZ0V4cCgnXicrQ0hST01FX0ZVTkNUSU9OX0NBTEwrJyQnKSAgLy8gcHJlY29tcGlsZSB0aGVtIHNvIGl0cyBmYXN0ZXJcclxuXHJcblxyXG52YXIgRklSRUZPWF9TVEFDS1RSQUNFX0pTX0dFVFNPVVJDRV9GQUlMVVJFID0gU1RBQ0tUUkFDRV9KU19HRVRTT1VSQ0VfRkFJTFVSRSsnKCg/IScrJ1xcXFwoXFxcXClAJysnKS4pKicrJ1xcXFwoXFxcXCknXHJcbnZhciBGSVJFRk9YX0ZJTEVfQU5EX0xJTkUgPSBGSUxFX0FORF9MSU5FLy9VUkxfUEFUVEVSTl8rJygoOihcXFxcZCopOihcXFxcZCopKXwoOihcXFxcZCopKSknXHJcbnZhciBGSVJFRk9YX0FSUkFZX1BBUlQgPSAnXFxcXFtcXFxcZCpcXFxcXSdcclxudmFyIEZJUkVGT1hfV0VJUkRfUEFSVCA9ICdcXFxcKFxcXFw/XFxcXCknXHJcbnZhciBGSVJFRk9YX0NPTVBPVU5EX0lERU5USUZJRVIgPSAnKCgnK0lERU5USUZJRVJfUEFUVEVSTl8rJ3wnK0ZJUkVGT1hfQVJSQVlfUEFSVCsnfCcrRklSRUZPWF9XRUlSRF9QQVJUKycpKChcXFxcKFxcXFwpKT98KFxcXFwufFxcXFw8fC8pKikpKidcclxudmFyIEZJUkVGT1hfRlVOQ1RJT05fQ0FMTCA9ICcoJytGSVJFRk9YX0NPTVBPVU5EX0lERU5USUZJRVIrJ3wnK0ZJUkVGT1hfU1RBQ0tUUkFDRV9KU19HRVRTT1VSQ0VfRkFJTFVSRSsnKUAnK0ZJUkVGT1hfRklMRV9BTkRfTElORVxyXG52YXIgRklSRUZPWF9TVEFDS19MSU5FID0gbmV3IFJlZ0V4cCgnXicrRklSRUZPWF9GVU5DVElPTl9DQUxMKyckJylcclxuXHJcbnZhciBJRV9XSElURVNQQUNFID0gJ1tcXFxcdyBcXFxcdF0nXHJcbnZhciBJRV9GSUxFX0FORF9MSU5FID0gRklMRV9BTkRfTElORVxyXG52YXIgSUVfQU5PTllNT1VTID0gJygnK0lFX1dISVRFU1BBQ0UrJyooe2Fub255bW91c31cXFxcKFxcXFwpKSlAXFxcXCgnK0lFX0ZJTEVfQU5EX0xJTkUrJ1xcXFwpJ1xyXG52YXIgSUVfTk9STUFMX0ZVTkNUSU9OID0gJygnK0lERU5USUZJRVJfUEFUVEVSTl8rJylAJytJRV9GSUxFX0FORF9MSU5FXHJcbnZhciBJRV9GVU5DVElPTl9DQUxMID0gJygnK0lFX05PUk1BTF9GVU5DVElPTisnfCcrSUVfQU5PTllNT1VTKycpJytJRV9XSElURVNQQUNFKycqJ1xyXG52YXIgSUVfU1RBQ0tfTElORSA9IG5ldyBSZWdFeHAoJ14nK0lFX0ZVTkNUSU9OX0NBTEwrJyQnKSIsIi8vIERvbWFpbiBQdWJsaWMgYnkgRXJpYyBXZW5kZWxpbiBodHRwOi8vZXJpd2VuLmNvbS8gKDIwMDgpXG4vLyAgICAgICAgICAgICAgICAgIEx1a2UgU21pdGggaHR0cDovL2x1Y2Fzc21pdGgubmFtZS8gKDIwMDgpXG4vLyAgICAgICAgICAgICAgICAgIExvaWMgRGFjaGFyeSA8bG9pY0BkYWNoYXJ5Lm9yZz4gKDIwMDgpXG4vLyAgICAgICAgICAgICAgICAgIEpvaGFuIEV1cGhyb3NpbmUgPHByb3BweUBhbWluY2hlLmNvbT4gKDIwMDgpXG4vLyAgICAgICAgICAgICAgICAgIE95dmluZCBTZWFuIEtpbnNleSBodHRwOi8va2luc2V5Lm5vL2Jsb2cgKDIwMTApXG4vLyAgICAgICAgICAgICAgICAgIFZpY3RvciBIb215YWtvdiA8dmljdG9yLWhvbXlha292QHVzZXJzLnNvdXJjZWZvcmdlLm5ldD4gKDIwMTApXG4oZnVuY3Rpb24oZ2xvYmFsLCBmYWN0b3J5KSB7XG4gIC8vIE5vZGVcbiAgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuXG4gIC8vIEFNRFxuICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShmYWN0b3J5KTtcblxuICAvLyBCcm93c2VyIGdsb2JhbHNcbiAgfSBlbHNlIHtcbiAgICBnbG9iYWwucHJpbnRTdGFja1RyYWNlID0gZmFjdG9yeSgpO1xuICB9XG59KHRoaXMsIGZ1bmN0aW9uKCkge1xuXHQvKipcblx0ICogTWFpbiBmdW5jdGlvbiBnaXZpbmcgYSBmdW5jdGlvbiBzdGFjayB0cmFjZSB3aXRoIGEgZm9yY2VkIG9yIHBhc3NlZCBpbiBFcnJvclxuXHQgKlxuXHQgKiBAY2ZnIHtFcnJvcn0gZSBUaGUgZXJyb3IgdG8gY3JlYXRlIGEgc3RhY2t0cmFjZSBmcm9tIChvcHRpb25hbClcblx0ICogQGNmZyB7Qm9vbGVhbn0gZ3Vlc3MgSWYgd2Ugc2hvdWxkIHRyeSB0byByZXNvbHZlIHRoZSBuYW1lcyBvZiBhbm9ueW1vdXMgZnVuY3Rpb25zXG5cdCAqIEByZXR1cm4ge0FycmF5fSBvZiBTdHJpbmdzIHdpdGggZnVuY3Rpb25zLCBsaW5lcywgZmlsZXMsIGFuZCBhcmd1bWVudHMgd2hlcmUgcG9zc2libGVcblx0ICovXG5cdGZ1bmN0aW9uIHByaW50U3RhY2tUcmFjZShvcHRpb25zKSB7XG5cdCAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7Z3Vlc3M6IHRydWV9O1xuXHQgICAgdmFyIGV4ID0gb3B0aW9ucy5lIHx8IG51bGwsIGd1ZXNzID0gISFvcHRpb25zLmd1ZXNzO1xuXHQgICAgdmFyIHAgPSBuZXcgcHJpbnRTdGFja1RyYWNlLmltcGxlbWVudGF0aW9uKCksIHJlc3VsdCA9IHAucnVuKGV4KTtcblx0ICAgIHJldHVybiAoZ3Vlc3MpID8gcC5ndWVzc0Fub255bW91c0Z1bmN0aW9ucyhyZXN1bHQpIDogcmVzdWx0O1xuXHR9XG5cblx0cHJpbnRTdGFja1RyYWNlLmltcGxlbWVudGF0aW9uID0gZnVuY3Rpb24oKSB7XG5cdH07XG5cblx0cHJpbnRTdGFja1RyYWNlLmltcGxlbWVudGF0aW9uLnByb3RvdHlwZSA9IHtcblx0ICAgIC8qKlxuXHQgICAgICogQHBhcmFtIHtFcnJvcn0gZXggVGhlIGVycm9yIHRvIGNyZWF0ZSBhIHN0YWNrdHJhY2UgZnJvbSAob3B0aW9uYWwpXG5cdCAgICAgKiBAcGFyYW0ge1N0cmluZ30gbW9kZSBGb3JjZWQgbW9kZSAob3B0aW9uYWwsIG1vc3RseSBmb3IgdW5pdCB0ZXN0cylcblx0ICAgICAqL1xuXHQgICAgcnVuOiBmdW5jdGlvbihleCwgbW9kZSkge1xuXHQgICAgICAgIGV4ID0gZXggfHwgdGhpcy5jcmVhdGVFeGNlcHRpb24oKTtcblx0ICAgICAgICAvLyBleGFtaW5lIGV4Y2VwdGlvbiBwcm9wZXJ0aWVzIHcvbyBkZWJ1Z2dlclxuXHQgICAgICAgIC8vZm9yICh2YXIgcHJvcCBpbiBleCkge2FsZXJ0KFwiRXhbJ1wiICsgcHJvcCArIFwiJ109XCIgKyBleFtwcm9wXSk7fVxuXHQgICAgICAgIG1vZGUgPSBtb2RlIHx8IHRoaXMubW9kZShleCk7XG5cdCAgICAgICAgaWYgKG1vZGUgPT09ICdvdGhlcicpIHtcblx0ICAgICAgICAgICAgcmV0dXJuIHRoaXMub3RoZXIoYXJndW1lbnRzLmNhbGxlZSk7XG5cdCAgICAgICAgfSBlbHNlIHtcblx0ICAgICAgICAgICAgcmV0dXJuIHRoaXNbbW9kZV0oZXgpO1xuXHQgICAgICAgIH1cblx0ICAgIH0sXG5cblx0ICAgIGNyZWF0ZUV4Y2VwdGlvbjogZnVuY3Rpb24oKSB7XG5cdCAgICAgICAgdHJ5IHtcblx0ICAgICAgICAgICAgdGhpcy51bmRlZigpO1xuXHQgICAgICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgICAgICAgICAgcmV0dXJuIGU7XG5cdCAgICAgICAgfVxuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBNb2RlIGNvdWxkIGRpZmZlciBmb3IgZGlmZmVyZW50IGV4Y2VwdGlvbiwgZS5nLlxuXHQgICAgICogZXhjZXB0aW9ucyBpbiBDaHJvbWUgbWF5IG9yIG1heSBub3QgaGF2ZSBhcmd1bWVudHMgb3Igc3RhY2suXG5cdCAgICAgKlxuXHQgICAgICogQHJldHVybiB7U3RyaW5nfSBtb2RlIG9mIG9wZXJhdGlvbiBmb3IgdGhlIGV4Y2VwdGlvblxuXHQgICAgICovXG5cdCAgICBtb2RlOiBmdW5jdGlvbihlKSB7XG5cdCAgICAgICAgaWYgKGVbJ2FyZ3VtZW50cyddICYmIGUuc3RhY2spIHtcblx0ICAgICAgICAgICAgcmV0dXJuICdjaHJvbWUnO1xuXHQgICAgICAgIH0gZWxzZSBpZiAoZS5zdGFjayAmJiBlLnNvdXJjZVVSTCkge1xuXHQgICAgICAgICAgICByZXR1cm4gJ3NhZmFyaSc7XG5cdCAgICAgICAgfSBlbHNlIGlmIChlLnN0YWNrICYmIGUubnVtYmVyKSB7XG5cdCAgICAgICAgICAgIHJldHVybiAnaWUnO1xuXHQgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGUubWVzc2FnZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93Lm9wZXJhKSB7XG5cdCAgICAgICAgICAgIC8vIGUubWVzc2FnZS5pbmRleE9mKFwiQmFja3RyYWNlOlwiKSA+IC0xIC0+IG9wZXJhXG5cdCAgICAgICAgICAgIC8vICFlLnN0YWNrdHJhY2UgLT4gb3BlcmFcblx0ICAgICAgICAgICAgaWYgKCFlLnN0YWNrdHJhY2UpIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiAnb3BlcmE5JzsgLy8gdXNlIGUubWVzc2FnZVxuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIC8vICdvcGVyYSNzb3VyY2Vsb2MnIGluIGUgLT4gb3BlcmE5LCBvcGVyYTEwYVxuXHQgICAgICAgICAgICBpZiAoZS5tZXNzYWdlLmluZGV4T2YoJ1xcbicpID4gLTEgJiYgZS5tZXNzYWdlLnNwbGl0KCdcXG4nKS5sZW5ndGggPiBlLnN0YWNrdHJhY2Uuc3BsaXQoJ1xcbicpLmxlbmd0aCkge1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuICdvcGVyYTknOyAvLyB1c2UgZS5tZXNzYWdlXG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgLy8gZS5zdGFja3RyYWNlICYmICFlLnN0YWNrIC0+IG9wZXJhMTBhXG5cdCAgICAgICAgICAgIGlmICghZS5zdGFjaykge1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuICdvcGVyYTEwYSc7IC8vIHVzZSBlLnN0YWNrdHJhY2Vcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAvLyBlLnN0YWNrdHJhY2UgJiYgZS5zdGFjayAtPiBvcGVyYTEwYlxuXHQgICAgICAgICAgICBpZiAoZS5zdGFja3RyYWNlLmluZGV4T2YoXCJjYWxsZWQgZnJvbSBsaW5lXCIpIDwgMCkge1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuICdvcGVyYTEwYic7IC8vIHVzZSBlLnN0YWNrdHJhY2UsIGZvcm1hdCBkaWZmZXJzIGZyb20gJ29wZXJhMTBhJ1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIC8vIGUuc3RhY2t0cmFjZSAmJiBlLnN0YWNrIC0+IG9wZXJhMTFcblx0ICAgICAgICAgICAgcmV0dXJuICdvcGVyYTExJzsgLy8gdXNlIGUuc3RhY2t0cmFjZSwgZm9ybWF0IGRpZmZlcnMgZnJvbSAnb3BlcmExMGEnLCAnb3BlcmExMGInXG5cdCAgICAgICAgfSBlbHNlIGlmIChlLnN0YWNrICYmICFlLmZpbGVOYW1lKSB7XG5cdCAgICAgICAgICAgIC8vIENocm9tZSAyNyBkb2VzIG5vdCBoYXZlIGUuYXJndW1lbnRzIGFzIGVhcmxpZXIgdmVyc2lvbnMsXG5cdCAgICAgICAgICAgIC8vIGJ1dCBzdGlsbCBkb2VzIG5vdCBoYXZlIGUuZmlsZU5hbWUgYXMgRmlyZWZveFxuXHQgICAgICAgICAgICByZXR1cm4gJ2Nocm9tZSc7XG5cdCAgICAgICAgfSBlbHNlIGlmIChlLnN0YWNrKSB7XG5cdCAgICAgICAgICAgIHJldHVybiAnZmlyZWZveCc7XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiAnb3RoZXInO1xuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBHaXZlbiBhIGNvbnRleHQsIGZ1bmN0aW9uIG5hbWUsIGFuZCBjYWxsYmFjayBmdW5jdGlvbiwgb3ZlcndyaXRlIGl0IHNvIHRoYXQgaXQgY2FsbHNcblx0ICAgICAqIHByaW50U3RhY2tUcmFjZSgpIGZpcnN0IHdpdGggYSBjYWxsYmFjayBhbmQgdGhlbiBydW5zIHRoZSByZXN0IG9mIHRoZSBib2R5LlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0IG9mIGV4ZWN1dGlvbiAoZS5nLiB3aW5kb3cpXG5cdCAgICAgKiBAcGFyYW0ge1N0cmluZ30gZnVuY3Rpb25OYW1lIHRvIGluc3RydW1lbnRcblx0ICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGNhbGwgd2l0aCBhIHN0YWNrIHRyYWNlIG9uIGludm9jYXRpb25cblx0ICAgICAqL1xuXHQgICAgaW5zdHJ1bWVudEZ1bmN0aW9uOiBmdW5jdGlvbihjb250ZXh0LCBmdW5jdGlvbk5hbWUsIGNhbGxiYWNrKSB7XG5cdCAgICAgICAgY29udGV4dCA9IGNvbnRleHQgfHwgd2luZG93O1xuXHQgICAgICAgIHZhciBvcmlnaW5hbCA9IGNvbnRleHRbZnVuY3Rpb25OYW1lXTtcblx0ICAgICAgICBjb250ZXh0W2Z1bmN0aW9uTmFtZV0gPSBmdW5jdGlvbiBpbnN0cnVtZW50ZWQoKSB7XG5cdCAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgcHJpbnRTdGFja1RyYWNlKCkuc2xpY2UoNCkpO1xuXHQgICAgICAgICAgICByZXR1cm4gY29udGV4dFtmdW5jdGlvbk5hbWVdLl9pbnN0cnVtZW50ZWQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0ICAgICAgICB9O1xuXHQgICAgICAgIGNvbnRleHRbZnVuY3Rpb25OYW1lXS5faW5zdHJ1bWVudGVkID0gb3JpZ2luYWw7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdpdmVuIGEgY29udGV4dCBhbmQgZnVuY3Rpb24gbmFtZSBvZiBhIGZ1bmN0aW9uIHRoYXQgaGFzIGJlZW5cblx0ICAgICAqIGluc3RydW1lbnRlZCwgcmV2ZXJ0IHRoZSBmdW5jdGlvbiB0byBpdCdzIG9yaWdpbmFsIChub24taW5zdHJ1bWVudGVkKVxuXHQgICAgICogc3RhdGUuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQgb2YgZXhlY3V0aW9uIChlLmcuIHdpbmRvdylcblx0ICAgICAqIEBwYXJhbSB7U3RyaW5nfSBmdW5jdGlvbk5hbWUgdG8gZGUtaW5zdHJ1bWVudFxuXHQgICAgICovXG5cdCAgICBkZWluc3RydW1lbnRGdW5jdGlvbjogZnVuY3Rpb24oY29udGV4dCwgZnVuY3Rpb25OYW1lKSB7XG5cdCAgICAgICAgaWYgKGNvbnRleHRbZnVuY3Rpb25OYW1lXS5jb25zdHJ1Y3RvciA9PT0gRnVuY3Rpb24gJiZcblx0ICAgICAgICAgICAgICAgIGNvbnRleHRbZnVuY3Rpb25OYW1lXS5faW5zdHJ1bWVudGVkICYmXG5cdCAgICAgICAgICAgICAgICBjb250ZXh0W2Z1bmN0aW9uTmFtZV0uX2luc3RydW1lbnRlZC5jb25zdHJ1Y3RvciA9PT0gRnVuY3Rpb24pIHtcblx0ICAgICAgICAgICAgY29udGV4dFtmdW5jdGlvbk5hbWVdID0gY29udGV4dFtmdW5jdGlvbk5hbWVdLl9pbnN0cnVtZW50ZWQ7XG5cdCAgICAgICAgfVxuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBHaXZlbiBhbiBFcnJvciBvYmplY3QsIHJldHVybiBhIGZvcm1hdHRlZCBBcnJheSBiYXNlZCBvbiBDaHJvbWUncyBzdGFjayBzdHJpbmcuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIGUgLSBFcnJvciBvYmplY3QgdG8gaW5zcGVjdFxuXHQgICAgICogQHJldHVybiBBcnJheTxTdHJpbmc+IG9mIGZ1bmN0aW9uIGNhbGxzLCBmaWxlcyBhbmQgbGluZSBudW1iZXJzXG5cdCAgICAgKi9cblx0ICAgIGNocm9tZTogZnVuY3Rpb24oZSkge1xuXHQgICAgICAgIHZhciBzdGFjayA9IChlLnN0YWNrICsgJ1xcbicpLnJlcGxhY2UoL15cXFNbXlxcKF0rP1tcXG4kXS9nbSwgJycpLlxuXHQgICAgICAgICAgcmVwbGFjZSgvXlxccysoYXQgZXZhbCApP2F0XFxzKy9nbSwgJycpLlxuXHQgICAgICAgICAgcmVwbGFjZSgvXihbXlxcKF0rPykoW1xcbiRdKS9nbSwgJ3thbm9ueW1vdXN9KClAJDEkMicpLlxuXHQgICAgICAgICAgcmVwbGFjZSgvXk9iamVjdC48YW5vbnltb3VzPlxccypcXCgoW15cXCldKylcXCkvZ20sICd7YW5vbnltb3VzfSgpQCQxJykuc3BsaXQoJ1xcbicpO1xuXHQgICAgICAgIHN0YWNrLnBvcCgpO1xuXHQgICAgICAgIHJldHVybiBzdGFjaztcblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2l2ZW4gYW4gRXJyb3Igb2JqZWN0LCByZXR1cm4gYSBmb3JtYXR0ZWQgQXJyYXkgYmFzZWQgb24gU2FmYXJpJ3Mgc3RhY2sgc3RyaW5nLlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSBlIC0gRXJyb3Igb2JqZWN0IHRvIGluc3BlY3Rcblx0ICAgICAqIEByZXR1cm4gQXJyYXk8U3RyaW5nPiBvZiBmdW5jdGlvbiBjYWxscywgZmlsZXMgYW5kIGxpbmUgbnVtYmVyc1xuXHQgICAgICovXG5cdCAgICBzYWZhcmk6IGZ1bmN0aW9uKGUpIHtcblx0ICAgICAgICByZXR1cm4gZS5zdGFjay5yZXBsYWNlKC9cXFtuYXRpdmUgY29kZVxcXVxcbi9tLCAnJylcblx0ICAgICAgICAgICAgLnJlcGxhY2UoL14oPz1cXHcrRXJyb3JcXDopLiokXFxuL20sICcnKVxuXHQgICAgICAgICAgICAucmVwbGFjZSgvXkAvZ20sICd7YW5vbnltb3VzfSgpQCcpXG5cdCAgICAgICAgICAgIC5zcGxpdCgnXFxuJyk7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdpdmVuIGFuIEVycm9yIG9iamVjdCwgcmV0dXJuIGEgZm9ybWF0dGVkIEFycmF5IGJhc2VkIG9uIElFJ3Mgc3RhY2sgc3RyaW5nLlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSBlIC0gRXJyb3Igb2JqZWN0IHRvIGluc3BlY3Rcblx0ICAgICAqIEByZXR1cm4gQXJyYXk8U3RyaW5nPiBvZiBmdW5jdGlvbiBjYWxscywgZmlsZXMgYW5kIGxpbmUgbnVtYmVyc1xuXHQgICAgICovXG5cdCAgICBpZTogZnVuY3Rpb24oZSkge1xuXHQgICAgICAgIHZhciBsaW5lUkUgPSAvXi4qYXQgKFxcdyspIFxcKChbXlxcKV0rKVxcKSQvZ207XG5cdCAgICAgICAgcmV0dXJuIGUuc3RhY2sucmVwbGFjZSgvYXQgQW5vbnltb3VzIGZ1bmN0aW9uIC9nbSwgJ3thbm9ueW1vdXN9KClAJylcblx0ICAgICAgICAgICAgLnJlcGxhY2UoL14oPz1cXHcrRXJyb3JcXDopLiokXFxuL20sICcnKVxuXHQgICAgICAgICAgICAucmVwbGFjZShsaW5lUkUsICckMUAkMicpXG5cdCAgICAgICAgICAgIC5zcGxpdCgnXFxuJyk7XG5cdCAgICB9LFxuXG5cdCAgICAvKipcblx0ICAgICAqIEdpdmVuIGFuIEVycm9yIG9iamVjdCwgcmV0dXJuIGEgZm9ybWF0dGVkIEFycmF5IGJhc2VkIG9uIEZpcmVmb3gncyBzdGFjayBzdHJpbmcuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIGUgLSBFcnJvciBvYmplY3QgdG8gaW5zcGVjdFxuXHQgICAgICogQHJldHVybiBBcnJheTxTdHJpbmc+IG9mIGZ1bmN0aW9uIGNhbGxzLCBmaWxlcyBhbmQgbGluZSBudW1iZXJzXG5cdCAgICAgKi9cblx0ICAgIGZpcmVmb3g6IGZ1bmN0aW9uKGUpIHtcblx0ICAgICAgICByZXR1cm4gZS5zdGFjay5yZXBsYWNlKC8oPzpcXG5AOjApP1xccyskL20sICcnKS5yZXBsYWNlKC9eW1xcKEBdL2dtLCAne2Fub255bW91c30oKUAnKS5zcGxpdCgnXFxuJyk7XG5cdCAgICB9LFxuXG5cdCAgICBvcGVyYTExOiBmdW5jdGlvbihlKSB7XG5cdCAgICAgICAgdmFyIEFOT04gPSAne2Fub255bW91c30nLCBsaW5lUkUgPSAvXi4qbGluZSAoXFxkKyksIGNvbHVtbiAoXFxkKykoPzogaW4gKC4rKSk/IGluIChcXFMrKTokLztcblx0ICAgICAgICB2YXIgbGluZXMgPSBlLnN0YWNrdHJhY2Uuc3BsaXQoJ1xcbicpLCByZXN1bHQgPSBbXTtcblxuXHQgICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMikge1xuXHQgICAgICAgICAgICB2YXIgbWF0Y2ggPSBsaW5lUkUuZXhlYyhsaW5lc1tpXSk7XG5cdCAgICAgICAgICAgIGlmIChtYXRjaCkge1xuXHQgICAgICAgICAgICAgICAgdmFyIGxvY2F0aW9uID0gbWF0Y2hbNF0gKyAnOicgKyBtYXRjaFsxXSArICc6JyArIG1hdGNoWzJdO1xuXHQgICAgICAgICAgICAgICAgdmFyIGZuTmFtZSA9IG1hdGNoWzNdIHx8IFwiZ2xvYmFsIGNvZGVcIjtcblx0ICAgICAgICAgICAgICAgIGZuTmFtZSA9IGZuTmFtZS5yZXBsYWNlKC88YW5vbnltb3VzIGZ1bmN0aW9uOiAoXFxTKyk+LywgXCIkMVwiKS5yZXBsYWNlKC88YW5vbnltb3VzIGZ1bmN0aW9uPi8sIEFOT04pO1xuXHQgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goZm5OYW1lICsgJ0AnICsgbG9jYXRpb24gKyAnIC0tICcgKyBsaW5lc1tpICsgMV0ucmVwbGFjZSgvXlxccysvLCAnJykpO1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXG5cdCAgICAgICAgcmV0dXJuIHJlc3VsdDtcblx0ICAgIH0sXG5cblx0ICAgIG9wZXJhMTBiOiBmdW5jdGlvbihlKSB7XG5cdCAgICAgICAgLy8gXCI8YW5vbnltb3VzIGZ1bmN0aW9uOiBydW4+KFthcmd1bWVudHMgbm90IGF2YWlsYWJsZV0pQGZpbGU6Ly9sb2NhbGhvc3QvRzovanMvc3RhY2t0cmFjZS5qczoyN1xcblwiICtcblx0ICAgICAgICAvLyBcInByaW50U3RhY2tUcmFjZShbYXJndW1lbnRzIG5vdCBhdmFpbGFibGVdKUBmaWxlOi8vbG9jYWxob3N0L0c6L2pzL3N0YWNrdHJhY2UuanM6MThcXG5cIiArXG5cdCAgICAgICAgLy8gXCJAZmlsZTovL2xvY2FsaG9zdC9HOi9qcy90ZXN0L2Z1bmN0aW9uYWwvdGVzdGNhc2UxLmh0bWw6MTVcIlxuXHQgICAgICAgIHZhciBsaW5lUkUgPSAvXiguKilAKC4rKTooXFxkKykkLztcblx0ICAgICAgICB2YXIgbGluZXMgPSBlLnN0YWNrdHJhY2Uuc3BsaXQoJ1xcbicpLCByZXN1bHQgPSBbXTtcblxuXHQgICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHQgICAgICAgICAgICB2YXIgbWF0Y2ggPSBsaW5lUkUuZXhlYyhsaW5lc1tpXSk7XG5cdCAgICAgICAgICAgIGlmIChtYXRjaCkge1xuXHQgICAgICAgICAgICAgICAgdmFyIGZuTmFtZSA9IG1hdGNoWzFdPyAobWF0Y2hbMV0gKyAnKCknKSA6IFwiZ2xvYmFsIGNvZGVcIjtcblx0ICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGZuTmFtZSArICdAJyArIG1hdGNoWzJdICsgJzonICsgbWF0Y2hbM10pO1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXG5cdCAgICAgICAgcmV0dXJuIHJlc3VsdDtcblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2l2ZW4gYW4gRXJyb3Igb2JqZWN0LCByZXR1cm4gYSBmb3JtYXR0ZWQgQXJyYXkgYmFzZWQgb24gT3BlcmEgMTAncyBzdGFja3RyYWNlIHN0cmluZy5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0gZSAtIEVycm9yIG9iamVjdCB0byBpbnNwZWN0XG5cdCAgICAgKiBAcmV0dXJuIEFycmF5PFN0cmluZz4gb2YgZnVuY3Rpb24gY2FsbHMsIGZpbGVzIGFuZCBsaW5lIG51bWJlcnNcblx0ICAgICAqL1xuXHQgICAgb3BlcmExMGE6IGZ1bmN0aW9uKGUpIHtcblx0ICAgICAgICAvLyBcIiAgTGluZSAyNyBvZiBsaW5rZWQgc2NyaXB0IGZpbGU6Ly9sb2NhbGhvc3QvRzovanMvc3RhY2t0cmFjZS5qc1xcblwiXG5cdCAgICAgICAgLy8gXCIgIExpbmUgMTEgb2YgaW5saW5lIzEgc2NyaXB0IGluIGZpbGU6Ly9sb2NhbGhvc3QvRzovanMvdGVzdC9mdW5jdGlvbmFsL3Rlc3RjYXNlMS5odG1sOiBJbiBmdW5jdGlvbiBmb29cXG5cIlxuXHQgICAgICAgIHZhciBBTk9OID0gJ3thbm9ueW1vdXN9JywgbGluZVJFID0gL0xpbmUgKFxcZCspLipzY3JpcHQgKD86aW4gKT8oXFxTKykoPzo6IEluIGZ1bmN0aW9uIChcXFMrKSk/JC9pO1xuXHQgICAgICAgIHZhciBsaW5lcyA9IGUuc3RhY2t0cmFjZS5zcGxpdCgnXFxuJyksIHJlc3VsdCA9IFtdO1xuXG5cdCAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAyKSB7XG5cdCAgICAgICAgICAgIHZhciBtYXRjaCA9IGxpbmVSRS5leGVjKGxpbmVzW2ldKTtcblx0ICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG5cdCAgICAgICAgICAgICAgICB2YXIgZm5OYW1lID0gbWF0Y2hbM10gfHwgQU5PTjtcblx0ICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGZuTmFtZSArICcoKUAnICsgbWF0Y2hbMl0gKyAnOicgKyBtYXRjaFsxXSArICcgLS0gJyArIGxpbmVzW2kgKyAxXS5yZXBsYWNlKC9eXFxzKy8sICcnKSk7XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICB9XG5cblx0ICAgICAgICByZXR1cm4gcmVzdWx0O1xuXHQgICAgfSxcblxuXHQgICAgLy8gT3BlcmEgNy54LTkuMnggb25seSFcblx0ICAgIG9wZXJhOTogZnVuY3Rpb24oZSkge1xuXHQgICAgICAgIC8vIFwiICBMaW5lIDQzIG9mIGxpbmtlZCBzY3JpcHQgZmlsZTovL2xvY2FsaG9zdC9HOi9qcy9zdGFja3RyYWNlLmpzXFxuXCJcblx0ICAgICAgICAvLyBcIiAgTGluZSA3IG9mIGlubGluZSMxIHNjcmlwdCBpbiBmaWxlOi8vbG9jYWxob3N0L0c6L2pzL3Rlc3QvZnVuY3Rpb25hbC90ZXN0Y2FzZTEuaHRtbFxcblwiXG5cdCAgICAgICAgdmFyIEFOT04gPSAne2Fub255bW91c30nLCBsaW5lUkUgPSAvTGluZSAoXFxkKykuKnNjcmlwdCAoPzppbiApPyhcXFMrKS9pO1xuXHQgICAgICAgIHZhciBsaW5lcyA9IGUubWVzc2FnZS5zcGxpdCgnXFxuJyksIHJlc3VsdCA9IFtdO1xuXG5cdCAgICAgICAgZm9yICh2YXIgaSA9IDIsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAyKSB7XG5cdCAgICAgICAgICAgIHZhciBtYXRjaCA9IGxpbmVSRS5leGVjKGxpbmVzW2ldKTtcblx0ICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG5cdCAgICAgICAgICAgICAgICByZXN1bHQucHVzaChBTk9OICsgJygpQCcgKyBtYXRjaFsyXSArICc6JyArIG1hdGNoWzFdICsgJyAtLSAnICsgbGluZXNbaSArIDFdLnJlcGxhY2UoL15cXHMrLywgJycpKTtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblxuXHQgICAgICAgIHJldHVybiByZXN1bHQ7XG5cdCAgICB9LFxuXG5cdCAgICAvLyBTYWZhcmkgNS0sIElFIDktLCBhbmQgb3RoZXJzXG5cdCAgICBvdGhlcjogZnVuY3Rpb24oY3Vycikge1xuXHQgICAgICAgIHZhciBBTk9OID0gJ3thbm9ueW1vdXN9JywgZm5SRSA9IC9mdW5jdGlvblxccyooW1xcd1xcLSRdKyk/XFxzKlxcKC9pLCBzdGFjayA9IFtdLCBmbiwgYXJncywgbWF4U3RhY2tTaXplID0gMTA7XG5cdCAgICAgICAgd2hpbGUgKGN1cnIgJiYgY3VyclsnYXJndW1lbnRzJ10gJiYgc3RhY2subGVuZ3RoIDwgbWF4U3RhY2tTaXplKSB7XG5cdCAgICAgICAgICAgIGZuID0gZm5SRS50ZXN0KGN1cnIudG9TdHJpbmcoKSkgPyBSZWdFeHAuJDEgfHwgQU5PTiA6IEFOT047XG5cdCAgICAgICAgICAgIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChjdXJyWydhcmd1bWVudHMnXSB8fCBbXSk7XG5cdCAgICAgICAgICAgIHN0YWNrW3N0YWNrLmxlbmd0aF0gPSBmbiArICcoJyArIHRoaXMuc3RyaW5naWZ5QXJndW1lbnRzKGFyZ3MpICsgJyknO1xuXHQgICAgICAgICAgICBjdXJyID0gY3Vyci5jYWxsZXI7XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiBzdGFjaztcblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2l2ZW4gYXJndW1lbnRzIGFycmF5IGFzIGEgU3RyaW5nLCBzdWJzdGl0dXRpbmcgdHlwZSBuYW1lcyBmb3Igbm9uLXN0cmluZyB0eXBlcy5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0ge0FyZ3VtZW50cyxBcnJheX0gYXJnc1xuXHQgICAgICogQHJldHVybiB7U3RyaW5nfSBzdHJpbmdpZmllZCBhcmd1bWVudHNcblx0ICAgICAqL1xuXHQgICAgc3RyaW5naWZ5QXJndW1lbnRzOiBmdW5jdGlvbihhcmdzKSB7XG5cdCAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuXHQgICAgICAgIHZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcblx0ICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcblx0ICAgICAgICAgICAgdmFyIGFyZyA9IGFyZ3NbaV07XG5cdCAgICAgICAgICAgIGlmIChhcmcgPT09IHVuZGVmaW5lZCkge1xuXHQgICAgICAgICAgICAgICAgcmVzdWx0W2ldID0gJ3VuZGVmaW5lZCc7XG5cdCAgICAgICAgICAgIH0gZWxzZSBpZiAoYXJnID09PSBudWxsKSB7XG5cdCAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSAnbnVsbCc7XG5cdCAgICAgICAgICAgIH0gZWxzZSBpZiAoYXJnLmNvbnN0cnVjdG9yKSB7XG5cdCAgICAgICAgICAgICAgICBpZiAoYXJnLmNvbnN0cnVjdG9yID09PSBBcnJheSkge1xuXHQgICAgICAgICAgICAgICAgICAgIGlmIChhcmcubGVuZ3RoIDwgMykge1xuXHQgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSAnWycgKyB0aGlzLnN0cmluZ2lmeUFyZ3VtZW50cyhhcmcpICsgJ10nO1xuXHQgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFtpXSA9ICdbJyArIHRoaXMuc3RyaW5naWZ5QXJndW1lbnRzKHNsaWNlLmNhbGwoYXJnLCAwLCAxKSkgKyAnLi4uJyArIHRoaXMuc3RyaW5naWZ5QXJndW1lbnRzKHNsaWNlLmNhbGwoYXJnLCAtMSkpICsgJ10nO1xuXHQgICAgICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYXJnLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcblx0ICAgICAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSAnI29iamVjdCc7XG5cdCAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFyZy5jb25zdHJ1Y3RvciA9PT0gRnVuY3Rpb24pIHtcblx0ICAgICAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSAnI2Z1bmN0aW9uJztcblx0ICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYXJnLmNvbnN0cnVjdG9yID09PSBTdHJpbmcpIHtcblx0ICAgICAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSAnXCInICsgYXJnICsgJ1wiJztcblx0ICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYXJnLmNvbnN0cnVjdG9yID09PSBOdW1iZXIpIHtcblx0ICAgICAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSBhcmc7XG5cdCAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICB9XG5cdCAgICAgICAgcmV0dXJuIHJlc3VsdC5qb2luKCcsJyk7XG5cdCAgICB9LFxuXG5cdCAgICBzb3VyY2VDYWNoZToge30sXG5cblx0ICAgIC8qKlxuXHQgICAgICogQHJldHVybiB0aGUgdGV4dCBmcm9tIGEgZ2l2ZW4gVVJMXG5cdCAgICAgKi9cblx0ICAgIGFqYXg6IGZ1bmN0aW9uKHVybCkge1xuXHQgICAgICAgIHZhciByZXEgPSB0aGlzLmNyZWF0ZVhNTEhUVFBPYmplY3QoKTtcblx0ICAgICAgICBpZiAocmVxKSB7XG5cdCAgICAgICAgICAgIHRyeSB7XG5cdCAgICAgICAgICAgICAgICByZXEub3BlbignR0VUJywgdXJsLCBmYWxzZSk7XG5cdCAgICAgICAgICAgICAgICAvL3JlcS5vdmVycmlkZU1pbWVUeXBlKCd0ZXh0L3BsYWluJyk7XG5cdCAgICAgICAgICAgICAgICAvL3JlcS5vdmVycmlkZU1pbWVUeXBlKCd0ZXh0L2phdmFzY3JpcHQnKTtcblx0ICAgICAgICAgICAgICAgIHJlcS5zZW5kKG51bGwpO1xuXHQgICAgICAgICAgICAgICAgLy9yZXR1cm4gcmVxLnN0YXR1cyA9PSAyMDAgPyByZXEucmVzcG9uc2VUZXh0IDogJyc7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gcmVxLnJlc3BvbnNlVGV4dDtcblx0ICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiAnJztcblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogVHJ5IFhIUiBtZXRob2RzIGluIG9yZGVyIGFuZCBzdG9yZSBYSFIgZmFjdG9yeS5cblx0ICAgICAqXG5cdCAgICAgKiBAcmV0dXJuIDxGdW5jdGlvbj4gWEhSIGZ1bmN0aW9uIG9yIGVxdWl2YWxlbnRcblx0ICAgICAqL1xuXHQgICAgY3JlYXRlWE1MSFRUUE9iamVjdDogZnVuY3Rpb24oKSB7XG5cdCAgICAgICAgdmFyIHhtbGh0dHAsIFhNTEh0dHBGYWN0b3JpZXMgPSBbXG5cdCAgICAgICAgICAgIGZ1bmN0aW9uKCkge1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHQgICAgICAgICAgICB9LCBmdW5jdGlvbigpIHtcblx0ICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCgnTXN4bWwyLlhNTEhUVFAnKTtcblx0ICAgICAgICAgICAgfSwgZnVuY3Rpb24oKSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gbmV3IEFjdGl2ZVhPYmplY3QoJ01zeG1sMy5YTUxIVFRQJyk7XG5cdCAgICAgICAgICAgIH0sIGZ1bmN0aW9uKCkge1xuXHQgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNaWNyb3NvZnQuWE1MSFRUUCcpO1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgXTtcblx0ICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IFhNTEh0dHBGYWN0b3JpZXMubGVuZ3RoOyBpKyspIHtcblx0ICAgICAgICAgICAgdHJ5IHtcblx0ICAgICAgICAgICAgICAgIHhtbGh0dHAgPSBYTUxIdHRwRmFjdG9yaWVzW2ldKCk7XG5cdCAgICAgICAgICAgICAgICAvLyBVc2UgbWVtb2l6YXRpb24gdG8gY2FjaGUgdGhlIGZhY3Rvcnlcblx0ICAgICAgICAgICAgICAgIHRoaXMuY3JlYXRlWE1MSFRUUE9iamVjdCA9IFhNTEh0dHBGYWN0b3JpZXNbaV07XG5cdCAgICAgICAgICAgICAgICByZXR1cm4geG1saHR0cDtcblx0ICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXHQgICAgfSxcblxuXHQgICAgLyoqXG5cdCAgICAgKiBHaXZlbiBhIFVSTCwgY2hlY2sgaWYgaXQgaXMgaW4gdGhlIHNhbWUgZG9tYWluIChzbyB3ZSBjYW4gZ2V0IHRoZSBzb3VyY2Vcblx0ICAgICAqIHZpYSBBamF4KS5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0gdXJsIDxTdHJpbmc+IHNvdXJjZSB1cmxcblx0ICAgICAqIEByZXR1cm4gPEJvb2xlYW4+IEZhbHNlIGlmIHdlIG5lZWQgYSBjcm9zcy1kb21haW4gcmVxdWVzdFxuXHQgICAgICovXG5cdCAgICBpc1NhbWVEb21haW46IGZ1bmN0aW9uKHVybCkge1xuXHQgICAgICAgIHJldHVybiB0eXBlb2YgbG9jYXRpb24gIT09IFwidW5kZWZpbmVkXCIgJiYgdXJsLmluZGV4T2YobG9jYXRpb24uaG9zdG5hbWUpICE9PSAtMTsgLy8gbG9jYXRpb24gbWF5IG5vdCBiZSBkZWZpbmVkLCBlLmcuIHdoZW4gcnVubmluZyBmcm9tIG5vZGVqcy5cblx0ICAgIH0sXG5cblx0ICAgIC8qKlxuXHQgICAgICogR2V0IHNvdXJjZSBjb2RlIGZyb20gZ2l2ZW4gVVJMIGlmIGluIHRoZSBzYW1lIGRvbWFpbi5cblx0ICAgICAqXG5cdCAgICAgKiBAcGFyYW0gdXJsIDxTdHJpbmc+IEpTIHNvdXJjZSBVUkxcblx0ICAgICAqIEByZXR1cm4gPEFycmF5PiBBcnJheSBvZiBzb3VyY2UgY29kZSBsaW5lc1xuXHQgICAgICovXG5cdCAgICBnZXRTb3VyY2U6IGZ1bmN0aW9uKHVybCkge1xuXHQgICAgICAgIC8vIFRPRE8gcmV1c2Ugc291cmNlIGZyb20gc2NyaXB0IHRhZ3M/XG5cdCAgICAgICAgaWYgKCEodXJsIGluIHRoaXMuc291cmNlQ2FjaGUpKSB7XG5cdCAgICAgICAgICAgIHRoaXMuc291cmNlQ2FjaGVbdXJsXSA9IHRoaXMuYWpheCh1cmwpLnNwbGl0KCdcXG4nKTtcblx0ICAgICAgICB9XG5cdCAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlQ2FjaGVbdXJsXTtcblx0ICAgIH0sXG5cblx0ICAgIGd1ZXNzQW5vbnltb3VzRnVuY3Rpb25zOiBmdW5jdGlvbihzdGFjaykge1xuXHQgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RhY2subGVuZ3RoOyArK2kpIHtcblx0ICAgICAgICAgICAgdmFyIHJlU3RhY2sgPSAvXFx7YW5vbnltb3VzXFx9XFwoLipcXClAKC4qKS8sXG5cdCAgICAgICAgICAgICAgICByZVJlZiA9IC9eKC4qPykoPzo6KFxcZCspKSg/OjooXFxkKykpPyg/OiAtLSAuKyk/JC8sXG5cdCAgICAgICAgICAgICAgICBmcmFtZSA9IHN0YWNrW2ldLCByZWYgPSByZVN0YWNrLmV4ZWMoZnJhbWUpO1xuXG5cdCAgICAgICAgICAgIGlmIChyZWYpIHtcblx0ICAgICAgICAgICAgICAgIHZhciBtID0gcmVSZWYuZXhlYyhyZWZbMV0pO1xuXHQgICAgICAgICAgICAgICAgaWYgKG0pIHsgLy8gSWYgZmFsc2V5LCB3ZSBkaWQgbm90IGdldCBhbnkgZmlsZS9saW5lIGluZm9ybWF0aW9uXG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIGZpbGUgPSBtWzFdLCBsaW5lbm8gPSBtWzJdLCBjaGFybm8gPSBtWzNdIHx8IDA7XG5cdCAgICAgICAgICAgICAgICAgICAgaWYgKGZpbGUgJiYgdGhpcy5pc1NhbWVEb21haW4oZmlsZSkgJiYgbGluZW5vKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHZhciBmdW5jdGlvbk5hbWUgPSB0aGlzLmd1ZXNzQW5vbnltb3VzRnVuY3Rpb24oZmlsZSwgbGluZW5vLCBjaGFybm8pO1xuXHQgICAgICAgICAgICAgICAgICAgICAgICBzdGFja1tpXSA9IGZyYW1lLnJlcGxhY2UoJ3thbm9ueW1vdXN9JywgZnVuY3Rpb25OYW1lKTtcblx0ICAgICAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICB9XG5cdCAgICAgICAgcmV0dXJuIHN0YWNrO1xuXHQgICAgfSxcblxuXHQgICAgZ3Vlc3NBbm9ueW1vdXNGdW5jdGlvbjogZnVuY3Rpb24odXJsLCBsaW5lTm8sIGNoYXJObykge1xuXHQgICAgICAgIHZhciByZXQ7XG5cdCAgICAgICAgdHJ5IHtcblx0ICAgICAgICAgICAgcmV0ID0gdGhpcy5maW5kRnVuY3Rpb25OYW1lKHRoaXMuZ2V0U291cmNlKHVybCksIGxpbmVObyk7XG5cdCAgICAgICAgfSBjYXRjaCAoZSkge1xuXHQgICAgICAgICAgICByZXQgPSAnZ2V0U291cmNlIGZhaWxlZCB3aXRoIHVybDogJyArIHVybCArICcsIGV4Y2VwdGlvbjogJyArIGUudG9TdHJpbmcoKTtcblx0ICAgICAgICB9XG5cdCAgICAgICAgcmV0dXJuIHJldDtcblx0ICAgIH0sXG5cblx0ICAgIGZpbmRGdW5jdGlvbk5hbWU6IGZ1bmN0aW9uKHNvdXJjZSwgbGluZU5vKSB7XG5cdCAgICAgICAgLy8gRklYTUUgZmluZEZ1bmN0aW9uTmFtZSBmYWlscyBmb3IgY29tcHJlc3NlZCBzb3VyY2Vcblx0ICAgICAgICAvLyAobW9yZSB0aGFuIG9uZSBmdW5jdGlvbiBvbiB0aGUgc2FtZSBsaW5lKVxuXHQgICAgICAgIC8vIGZ1bmN0aW9uIHtuYW1lfSh7YXJnc30pIG1bMV09bmFtZSBtWzJdPWFyZ3Ncblx0ICAgICAgICB2YXIgcmVGdW5jdGlvbkRlY2xhcmF0aW9uID0gL2Z1bmN0aW9uXFxzKyhbXihdKj8pXFxzKlxcKChbXildKilcXCkvO1xuXHQgICAgICAgIC8vIHtuYW1lfSA9IGZ1bmN0aW9uICh7YXJnc30pIFRPRE8gYXJncyBjYXB0dXJlXG5cdCAgICAgICAgLy8gL1snXCJdPyhbMC05QS1aYS16X10rKVsnXCJdP1xccypbOj1dXFxzKmZ1bmN0aW9uKD86W14oXSopL1xuXHQgICAgICAgIHZhciByZUZ1bmN0aW9uRXhwcmVzc2lvbiA9IC9bJ1wiXT8oWyRfQS1aYS16XVskX0EtWmEtejAtOV0qKVsnXCJdP1xccypbOj1dXFxzKmZ1bmN0aW9uXFxiLztcblx0ICAgICAgICAvLyB7bmFtZX0gPSBldmFsKClcblx0ICAgICAgICB2YXIgcmVGdW5jdGlvbkV2YWx1YXRpb24gPSAvWydcIl0/KFskX0EtWmEtel1bJF9BLVphLXowLTldKilbJ1wiXT9cXHMqWzo9XVxccyooPzpldmFsfG5ldyBGdW5jdGlvbilcXGIvO1xuXHQgICAgICAgIC8vIFdhbGsgYmFja3dhcmRzIGluIHRoZSBzb3VyY2UgbGluZXMgdW50aWwgd2UgZmluZFxuXHQgICAgICAgIC8vIHRoZSBsaW5lIHdoaWNoIG1hdGNoZXMgb25lIG9mIHRoZSBwYXR0ZXJucyBhYm92ZVxuXHQgICAgICAgIHZhciBjb2RlID0gXCJcIiwgbGluZSwgbWF4TGluZXMgPSBNYXRoLm1pbihsaW5lTm8sIDIwKSwgbSwgY29tbWVudFBvcztcblx0ICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1heExpbmVzOyArK2kpIHtcblx0ICAgICAgICAgICAgLy8gbGluZU5vIGlzIDEtYmFzZWQsIHNvdXJjZVtdIGlzIDAtYmFzZWRcblx0ICAgICAgICAgICAgbGluZSA9IHNvdXJjZVtsaW5lTm8gLSBpIC0gMV07XG5cdCAgICAgICAgICAgIGNvbW1lbnRQb3MgPSBsaW5lLmluZGV4T2YoJy8vJyk7XG5cdCAgICAgICAgICAgIGlmIChjb21tZW50UG9zID49IDApIHtcblx0ICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5lLnN1YnN0cigwLCBjb21tZW50UG9zKTtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAvLyBUT0RPIGNoZWNrIG90aGVyIHR5cGVzIG9mIGNvbW1lbnRzPyBDb21tZW50ZWQgY29kZSBtYXkgbGVhZCB0byBmYWxzZSBwb3NpdGl2ZVxuXHQgICAgICAgICAgICBpZiAobGluZSkge1xuXHQgICAgICAgICAgICAgICAgY29kZSA9IGxpbmUgKyBjb2RlO1xuXHQgICAgICAgICAgICAgICAgbSA9IHJlRnVuY3Rpb25FeHByZXNzaW9uLmV4ZWMoY29kZSk7XG5cdCAgICAgICAgICAgICAgICBpZiAobSAmJiBtWzFdKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1bMV07XG5cdCAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgICAgICBtID0gcmVGdW5jdGlvbkRlY2xhcmF0aW9uLmV4ZWMoY29kZSk7XG5cdCAgICAgICAgICAgICAgICBpZiAobSAmJiBtWzFdKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgLy9yZXR1cm4gbVsxXSArIFwiKFwiICsgKG1bMl0gfHwgXCJcIikgKyBcIilcIjtcblx0ICAgICAgICAgICAgICAgICAgICByZXR1cm4gbVsxXTtcblx0ICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgICAgIG0gPSByZUZ1bmN0aW9uRXZhbHVhdGlvbi5leGVjKGNvZGUpO1xuXHQgICAgICAgICAgICAgICAgaWYgKG0gJiYgbVsxXSkge1xuXHQgICAgICAgICAgICAgICAgICAgIHJldHVybiBtWzFdO1xuXHQgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfVxuXHQgICAgICAgIHJldHVybiAnKD8pJztcblx0ICAgIH1cblx0fTtcblxuXHRyZXR1cm4gcHJpbnRTdGFja1RyYWNlO1xufSkpOyIsIi8vIHJlc29sdmVzIHZhcmFyZ3MgdmFyaWFibGUgaW50byBtb3JlIHVzYWJsZSBmb3JtXG4vLyBhcmdzIC0gc2hvdWxkIGJlIGEgZnVuY3Rpb24gYXJndW1lbnRzIHZhcmlhYmxlXG4vLyByZXR1cm5zIGEgamF2YXNjcmlwdCBBcnJheSBvYmplY3Qgb2YgYXJndW1lbnRzIHRoYXQgZG9lc24ndCBjb3VudCB0cmFpbGluZyB1bmRlZmluZWQgdmFsdWVzIGluIHRoZSBsZW5ndGhcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odGhlQXJndW1lbnRzKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGVBcmd1bWVudHMsIDApXG5cbiAgICB2YXIgY291bnQgPSAwO1xuICAgIGZvcih2YXIgbj1hcmdzLmxlbmd0aC0xOyBuPj0wOyBuLS0pIHtcbiAgICAgICAgaWYoYXJnc1tuXSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY291bnQrK1xuICAgIH1cbiAgICBhcmdzLnNwbGljZSgtMCwgY291bnQpXG4gICAgcmV0dXJuIGFyZ3Ncbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuZXhwb3J0cy5VcmwgPSBVcmw7XG5cbmZ1bmN0aW9uIFVybCgpIHtcbiAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gIHRoaXMuYXV0aCA9IG51bGw7XG4gIHRoaXMuaG9zdCA9IG51bGw7XG4gIHRoaXMucG9ydCA9IG51bGw7XG4gIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICB0aGlzLmhhc2ggPSBudWxsO1xuICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gIHRoaXMucXVlcnkgPSBudWxsO1xuICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcbiAgdGhpcy5wYXRoID0gbnVsbDtcbiAgdGhpcy5ocmVmID0gbnVsbDtcbn1cblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbnZhciBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pLFxuICAgIHBvcnRQYXR0ZXJuID0gLzpbMC05XSokLyxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIHJlc2VydmVkIGZvciBkZWxpbWl0aW5nIFVSTHMuXG4gICAgLy8gV2UgYWN0dWFsbHkganVzdCBhdXRvLWVzY2FwZSB0aGVzZS5cbiAgICBkZWxpbXMgPSBbJzwnLCAnPicsICdcIicsICdgJywgJyAnLCAnXFxyJywgJ1xcbicsICdcXHQnXSxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIG5vdCBhbGxvd2VkIGZvciB2YXJpb3VzIHJlYXNvbnMuXG4gICAgdW53aXNlID0gWyd7JywgJ30nLCAnfCcsICdcXFxcJywgJ14nLCAnYCddLmNvbmNhdChkZWxpbXMpLFxuXG4gICAgLy8gQWxsb3dlZCBieSBSRkNzLCBidXQgY2F1c2Ugb2YgWFNTIGF0dGFja3MuICBBbHdheXMgZXNjYXBlIHRoZXNlLlxuICAgIGF1dG9Fc2NhcGUgPSBbJ1xcJyddLmNvbmNhdCh1bndpc2UpLFxuICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUuXG4gICAgLy8gTm90ZSB0aGF0IGFueSBpbnZhbGlkIGNoYXJzIGFyZSBhbHNvIGhhbmRsZWQsIGJ1dCB0aGVzZVxuICAgIC8vIGFyZSB0aGUgb25lcyB0aGF0IGFyZSAqZXhwZWN0ZWQqIHRvIGJlIHNlZW4sIHNvIHdlIGZhc3QtcGF0aFxuICAgIC8vIHRoZW0uXG4gICAgbm9uSG9zdENoYXJzID0gWyclJywgJy8nLCAnPycsICc7JywgJyMnXS5jb25jYXQoYXV0b0VzY2FwZSksXG4gICAgaG9zdEVuZGluZ0NoYXJzID0gWycvJywgJz8nLCAnIyddLFxuICAgIGhvc3RuYW1lTWF4TGVuID0gMjU1LFxuICAgIGhvc3RuYW1lUGFydFBhdHRlcm4gPSAvXlthLXowLTlBLVpfLV17MCw2M30kLyxcbiAgICBob3N0bmFtZVBhcnRTdGFydCA9IC9eKFthLXowLTlBLVpfLV17MCw2M30pKC4qKSQvLFxuICAgIC8vIHByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuICAgIHVuc2FmZVByb3RvY29sID0ge1xuICAgICAgJ2phdmFzY3JpcHQnOiB0cnVlLFxuICAgICAgJ2phdmFzY3JpcHQ6JzogdHJ1ZVxuICAgIH0sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgbmV2ZXIgaGF2ZSBhIGhvc3RuYW1lLlxuICAgIGhvc3RsZXNzUHJvdG9jb2wgPSB7XG4gICAgICAnamF2YXNjcmlwdCc6IHRydWUsXG4gICAgICAnamF2YXNjcmlwdDonOiB0cnVlXG4gICAgfSxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBhbHdheXMgY29udGFpbiBhIC8vIGJpdC5cbiAgICBzbGFzaGVkUHJvdG9jb2wgPSB7XG4gICAgICAnaHR0cCc6IHRydWUsXG4gICAgICAnaHR0cHMnOiB0cnVlLFxuICAgICAgJ2Z0cCc6IHRydWUsXG4gICAgICAnZ29waGVyJzogdHJ1ZSxcbiAgICAgICdmaWxlJzogdHJ1ZSxcbiAgICAgICdodHRwOic6IHRydWUsXG4gICAgICAnaHR0cHM6JzogdHJ1ZSxcbiAgICAgICdmdHA6JzogdHJ1ZSxcbiAgICAgICdnb3BoZXI6JzogdHJ1ZSxcbiAgICAgICdmaWxlOic6IHRydWVcbiAgICB9LFxuICAgIHF1ZXJ5c3RyaW5nID0gcmVxdWlyZSgncXVlcnlzdHJpbmcnKTtcblxuZnVuY3Rpb24gdXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodXJsICYmIGlzT2JqZWN0KHVybCkgJiYgdXJsIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gdXJsO1xuXG4gIHZhciB1ID0gbmV3IFVybDtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cblVybC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbih1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICghaXNTdHJpbmcodXJsKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICsgdHlwZW9mIHVybCk7XG4gIH1cblxuICB2YXIgcmVzdCA9IHVybDtcblxuICAvLyB0cmltIGJlZm9yZSBwcm9jZWVkaW5nLlxuICAvLyBUaGlzIGlzIHRvIHN1cHBvcnQgcGFyc2Ugc3R1ZmYgbGlrZSBcIiAgaHR0cDovL2Zvby5jb20gIFxcblwiXG4gIHJlc3QgPSByZXN0LnRyaW0oKTtcblxuICB2YXIgcHJvdG8gPSBwcm90b2NvbFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgaWYgKHByb3RvKSB7XG4gICAgcHJvdG8gPSBwcm90b1swXTtcbiAgICB2YXIgbG93ZXJQcm90byA9IHByb3RvLnRvTG93ZXJDYXNlKCk7XG4gICAgdGhpcy5wcm90b2NvbCA9IGxvd2VyUHJvdG87XG4gICAgcmVzdCA9IHJlc3Quc3Vic3RyKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCByZXN0Lm1hdGNoKC9eXFwvXFwvW15AXFwvXStAW15AXFwvXSsvKSkge1xuICAgIHZhciBzbGFzaGVzID0gcmVzdC5zdWJzdHIoMCwgMikgPT09ICcvLyc7XG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnN1YnN0cigyKTtcbiAgICAgIHRoaXMuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJlxuICAgICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSkpIHtcblxuICAgIC8vIHRoZXJlJ3MgYSBob3N0bmFtZS5cbiAgICAvLyB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgLywgPywgOywgb3IgIyBlbmRzIHRoZSBob3N0LlxuICAgIC8vXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBsYXN0IEAgc2lnbiwgdW5sZXNzIHNvbWUgaG9zdC1lbmRpbmcgY2hhcmFjdGVyXG4gICAgLy8gY29tZXMgKmJlZm9yZSogdGhlIEAtc2lnbi5cbiAgICAvLyBVUkxzIGFyZSBvYm5veGlvdXMuXG4gICAgLy9cbiAgICAvLyBleDpcbiAgICAvLyBodHRwOi8vYUBiQGMvID0+IHVzZXI6YUBiIGhvc3Q6Y1xuICAgIC8vIGh0dHA6Ly9hQGI/QGMgPT4gdXNlcjphIGhvc3Q6YyBwYXRoOi8/QGNcblxuICAgIC8vIHYwLjEyIFRPRE8oaXNhYWNzKTogVGhpcyBpcyBub3QgcXVpdGUgaG93IENocm9tZSBkb2VzIHRoaW5ncy5cbiAgICAvLyBSZXZpZXcgb3VyIHRlc3QgY2FzZSBhZ2FpbnN0IGJyb3dzZXJzIG1vcmUgY29tcHJlaGVuc2l2ZWx5LlxuXG4gICAgLy8gZmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3RFbmRpbmdDaGFyc1xuICAgIHZhciBob3N0RW5kID0gLTE7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBob3N0RW5kaW5nQ2hhcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBoZWMgPSByZXN0LmluZGV4T2YoaG9zdEVuZGluZ0NoYXJzW2ldKTtcbiAgICAgIGlmIChoZWMgIT09IC0xICYmIChob3N0RW5kID09PSAtMSB8fCBoZWMgPCBob3N0RW5kKSlcbiAgICAgICAgaG9zdEVuZCA9IGhlYztcbiAgICB9XG5cbiAgICAvLyBhdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAvLyBhdXRoIHBvcnRpb24gY2Fubm90IGdvIHBhc3QsIG9yIHRoZSBsYXN0IEAgY2hhciBpcyB0aGUgZGVjaWRlci5cbiAgICB2YXIgYXV0aCwgYXRTaWduO1xuICAgIGlmIChob3N0RW5kID09PSAtMSkge1xuICAgICAgLy8gYXRTaWduIGNhbiBiZSBhbnl3aGVyZS5cbiAgICAgIGF0U2lnbiA9IHJlc3QubGFzdEluZGV4T2YoJ0AnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gYXRTaWduIG11c3QgYmUgaW4gYXV0aCBwb3J0aW9uLlxuICAgICAgLy8gaHR0cDovL2FAYi9jQGQgPT4gaG9zdDpiIGF1dGg6YSBwYXRoOi9jQGRcbiAgICAgIGF0U2lnbiA9IHJlc3QubGFzdEluZGV4T2YoJ0AnLCBob3N0RW5kKTtcbiAgICB9XG5cbiAgICAvLyBOb3cgd2UgaGF2ZSBhIHBvcnRpb24gd2hpY2ggaXMgZGVmaW5pdGVseSB0aGUgYXV0aC5cbiAgICAvLyBQdWxsIHRoYXQgb2ZmLlxuICAgIGlmIChhdFNpZ24gIT09IC0xKSB7XG4gICAgICBhdXRoID0gcmVzdC5zbGljZSgwLCBhdFNpZ24pO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2UoYXRTaWduICsgMSk7XG4gICAgICB0aGlzLmF1dGggPSBkZWNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgfVxuXG4gICAgLy8gdGhlIGhvc3QgaXMgdGhlIHJlbWFpbmluZyB0byB0aGUgbGVmdCBvZiB0aGUgZmlyc3Qgbm9uLWhvc3QgY2hhclxuICAgIGhvc3RFbmQgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vbkhvc3RDaGFycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhlYyA9IHJlc3QuaW5kZXhPZihub25Ib3N0Q2hhcnNbaV0pO1xuICAgICAgaWYgKGhlYyAhPT0gLTEgJiYgKGhvc3RFbmQgPT09IC0xIHx8IGhlYyA8IGhvc3RFbmQpKVxuICAgICAgICBob3N0RW5kID0gaGVjO1xuICAgIH1cbiAgICAvLyBpZiB3ZSBzdGlsbCBoYXZlIG5vdCBoaXQgaXQsIHRoZW4gdGhlIGVudGlyZSB0aGluZyBpcyBhIGhvc3QuXG4gICAgaWYgKGhvc3RFbmQgPT09IC0xKVxuICAgICAgaG9zdEVuZCA9IHJlc3QubGVuZ3RoO1xuXG4gICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZSgwLCBob3N0RW5kKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZShob3N0RW5kKTtcblxuICAgIC8vIHB1bGwgb3V0IHBvcnQuXG4gICAgdGhpcy5wYXJzZUhvc3QoKTtcblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcblxuICAgIC8vIGlmIGhvc3RuYW1lIGJlZ2lucyB3aXRoIFsgYW5kIGVuZHMgd2l0aCBdXG4gICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgdmFyIGlwdjZIb3N0bmFtZSA9IHRoaXMuaG9zdG5hbWVbMF0gPT09ICdbJyAmJlxuICAgICAgICB0aGlzLmhvc3RuYW1lW3RoaXMuaG9zdG5hbWUubGVuZ3RoIC0gMV0gPT09ICddJztcblxuICAgIC8vIHZhbGlkYXRlIGEgbGl0dGxlLlxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICB2YXIgaG9zdHBhcnRzID0gdGhpcy5ob3N0bmFtZS5zcGxpdCgvXFwuLyk7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGhvc3RwYXJ0cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHBhcnQgPSBob3N0cGFydHNbaV07XG4gICAgICAgIGlmICghcGFydCkgY29udGludWU7XG4gICAgICAgIGlmICghcGFydC5tYXRjaChob3N0bmFtZVBhcnRQYXR0ZXJuKSkge1xuICAgICAgICAgIHZhciBuZXdwYXJ0ID0gJyc7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDAsIGsgPSBwYXJ0Lmxlbmd0aDsgaiA8IGs7IGorKykge1xuICAgICAgICAgICAgaWYgKHBhcnQuY2hhckNvZGVBdChqKSA+IDEyNykge1xuICAgICAgICAgICAgICAvLyB3ZSByZXBsYWNlIG5vbi1BU0NJSSBjaGFyIHdpdGggYSB0ZW1wb3JhcnkgcGxhY2Vob2xkZXJcbiAgICAgICAgICAgICAgLy8gd2UgbmVlZCB0aGlzIHRvIG1ha2Ugc3VyZSBzaXplIG9mIGhvc3RuYW1lIGlzIG5vdFxuICAgICAgICAgICAgICAvLyBicm9rZW4gYnkgcmVwbGFjaW5nIG5vbi1BU0NJSSBieSBub3RoaW5nXG4gICAgICAgICAgICAgIG5ld3BhcnQgKz0gJ3gnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV3cGFydCArPSBwYXJ0W2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB3ZSB0ZXN0IGFnYWluIHdpdGggQVNDSUkgY2hhciBvbmx5XG4gICAgICAgICAgaWYgKCFuZXdwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFBhdHRlcm4pKSB7XG4gICAgICAgICAgICB2YXIgdmFsaWRQYXJ0cyA9IGhvc3RwYXJ0cy5zbGljZSgwLCBpKTtcbiAgICAgICAgICAgIHZhciBub3RIb3N0ID0gaG9zdHBhcnRzLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIHZhciBiaXQgPSBwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFN0YXJ0KTtcbiAgICAgICAgICAgIGlmIChiaXQpIHtcbiAgICAgICAgICAgICAgdmFsaWRQYXJ0cy5wdXNoKGJpdFsxXSk7XG4gICAgICAgICAgICAgIG5vdEhvc3QudW5zaGlmdChiaXRbMl0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vdEhvc3QubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJlc3QgPSAnLycgKyBub3RIb3N0LmpvaW4oJy4nKSArIHJlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdmFsaWRQYXJ0cy5qb2luKCcuJyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5ob3N0bmFtZS5sZW5ndGggPiBob3N0bmFtZU1heExlbikge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICB9XG5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyB0aGUgcGFydCBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgLy8gaGFzIG5vbiBBU0NJSSBjaGFyYWN0ZXJzLiBJLmUuIGl0IGRvc2VudCBtYXR0ZXIgaWZcbiAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgICAgdmFyIGRvbWFpbkFycmF5ID0gdGhpcy5ob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgdmFyIG5ld091dCA9IFtdO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgICd4bi0tJyArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgICAgfVxuICAgICAgdGhpcy5ob3N0bmFtZSA9IG5ld091dC5qb2luKCcuJyk7XG4gICAgfVxuXG4gICAgdmFyIHAgPSB0aGlzLnBvcnQgPyAnOicgKyB0aGlzLnBvcnQgOiAnJztcbiAgICB2YXIgaCA9IHRoaXMuaG9zdG5hbWUgfHwgJyc7XG4gICAgdGhpcy5ob3N0ID0gaCArIHA7XG4gICAgdGhpcy5ocmVmICs9IHRoaXMuaG9zdDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAvLyB0aGUgaG9zdCBmaWVsZCBzdGlsbCByZXRhaW5zIHRoZW0sIHRob3VnaFxuICAgIGlmIChpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnN1YnN0cigxLCB0aGlzLmhvc3RuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgaWYgKHJlc3RbMF0gIT09ICcvJykge1xuICAgICAgICByZXN0ID0gJy8nICsgcmVzdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBub3cgcmVzdCBpcyBzZXQgdG8gdGhlIHBvc3QtaG9zdCBzdHVmZi5cbiAgLy8gY2hvcCBvZmYgYW55IGRlbGltIGNoYXJzLlxuICBpZiAoIXVuc2FmZVByb3RvY29sW2xvd2VyUHJvdG9dKSB7XG5cbiAgICAvLyBGaXJzdCwgbWFrZSAxMDAlIHN1cmUgdGhhdCBhbnkgXCJhdXRvRXNjYXBlXCIgY2hhcnMgZ2V0XG4gICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgLy8gbmVlZCB0byBiZS5cbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIgYWUgPSBhdXRvRXNjYXBlW2ldO1xuICAgICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChhZSk7XG4gICAgICBpZiAoZXNjID09PSBhZSkge1xuICAgICAgICBlc2MgPSBlc2NhcGUoYWUpO1xuICAgICAgfVxuICAgICAgcmVzdCA9IHJlc3Quc3BsaXQoYWUpLmpvaW4oZXNjKTtcbiAgICB9XG4gIH1cblxuXG4gIC8vIGNob3Agb2ZmIGZyb20gdGhlIHRhaWwgZmlyc3QuXG4gIHZhciBoYXNoID0gcmVzdC5pbmRleE9mKCcjJyk7XG4gIGlmIChoYXNoICE9PSAtMSkge1xuICAgIC8vIGdvdCBhIGZyYWdtZW50IHN0cmluZy5cbiAgICB0aGlzLmhhc2ggPSByZXN0LnN1YnN0cihoYXNoKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZSgwLCBoYXNoKTtcbiAgfVxuICB2YXIgcW0gPSByZXN0LmluZGV4T2YoJz8nKTtcbiAgaWYgKHFtICE9PSAtMSkge1xuICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zdWJzdHIocW0pO1xuICAgIHRoaXMucXVlcnkgPSByZXN0LnN1YnN0cihxbSArIDEpO1xuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICAgIHJlc3QgPSByZXN0LnNsaWNlKDAsIHFtKTtcbiAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgLy8gbm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgfVxuICBpZiAocmVzdCkgdGhpcy5wYXRobmFtZSA9IHJlc3Q7XG4gIGlmIChzbGFzaGVkUHJvdG9jb2xbbG93ZXJQcm90b10gJiZcbiAgICAgIHRoaXMuaG9zdG5hbWUgJiYgIXRoaXMucGF0aG5hbWUpIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gJy8nO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAodGhpcy5wYXRobmFtZSB8fCB0aGlzLnNlYXJjaCkge1xuICAgIHZhciBwID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgICB2YXIgcyA9IHRoaXMuc2VhcmNoIHx8ICcnO1xuICAgIHRoaXMucGF0aCA9IHAgKyBzO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIHRoaXMuaHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZm9ybWF0IGEgcGFyc2VkIG9iamVjdCBpbnRvIGEgdXJsIHN0cmluZ1xuZnVuY3Rpb24gdXJsRm9ybWF0KG9iaikge1xuICAvLyBlbnN1cmUgaXQncyBhbiBvYmplY3QsIGFuZCBub3QgYSBzdHJpbmcgdXJsLlxuICAvLyBJZiBpdCdzIGFuIG9iaiwgdGhpcyBpcyBhIG5vLW9wLlxuICAvLyB0aGlzIHdheSwgeW91IGNhbiBjYWxsIHVybF9mb3JtYXQoKSBvbiBzdHJpbmdzXG4gIC8vIHRvIGNsZWFuIHVwIHBvdGVudGlhbGx5IHdvbmt5IHVybHMuXG4gIGlmIChpc1N0cmluZyhvYmopKSBvYmogPSB1cmxQYXJzZShvYmopO1xuICBpZiAoIShvYmogaW5zdGFuY2VvZiBVcmwpKSByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufVxuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCAnOicpO1xuICAgIGF1dGggKz0gJ0AnO1xuICB9XG5cbiAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCAnJyxcbiAgICAgIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCAnJyxcbiAgICAgIGhhc2ggPSB0aGlzLmhhc2ggfHwgJycsXG4gICAgICBob3N0ID0gZmFsc2UsXG4gICAgICBxdWVyeSA9ICcnO1xuXG4gIGlmICh0aGlzLmhvc3QpIHtcbiAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgfSBlbHNlIGlmICh0aGlzLmhvc3RuYW1lKSB7XG4gICAgaG9zdCA9IGF1dGggKyAodGhpcy5ob3N0bmFtZS5pbmRleE9mKCc6JykgPT09IC0xID9cbiAgICAgICAgdGhpcy5ob3N0bmFtZSA6XG4gICAgICAgICdbJyArIHRoaXMuaG9zdG5hbWUgKyAnXScpO1xuICAgIGlmICh0aGlzLnBvcnQpIHtcbiAgICAgIGhvc3QgKz0gJzonICsgdGhpcy5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5ICYmXG4gICAgICBpc09iamVjdCh0aGlzLnF1ZXJ5KSAmJlxuICAgICAgT2JqZWN0LmtleXModGhpcy5xdWVyeSkubGVuZ3RoKSB7XG4gICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkodGhpcy5xdWVyeSk7XG4gIH1cblxuICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmICgnPycgKyBxdWVyeSkpIHx8ICcnO1xuXG4gIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5zdWJzdHIoLTEpICE9PSAnOicpIHByb3RvY29sICs9ICc6JztcblxuICAvLyBvbmx5IHRoZSBzbGFzaGVkUHJvdG9jb2xzIGdldCB0aGUgLy8uICBOb3QgbWFpbHRvOiwgeG1wcDosIGV0Yy5cbiAgLy8gdW5sZXNzIHRoZXkgaGFkIHRoZW0gdG8gYmVnaW4gd2l0aC5cbiAgaWYgKHRoaXMuc2xhc2hlcyB8fFxuICAgICAgKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQXQoMCkgIT09ICcvJykgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckF0KDApICE9PSAnIycpIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQXQoMCkgIT09ICc/Jykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHBhdGhuYW1lID0gcGF0aG5hbWUucmVwbGFjZSgvWz8jXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICB9KTtcbiAgc2VhcmNoID0gc2VhcmNoLnJlcGxhY2UoJyMnLCAnJTIzJyk7XG5cbiAgcmV0dXJuIHByb3RvY29sICsgaG9zdCArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uKHJlbGF0aXZlKSB7XG4gIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QodXJsUGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5mdW5jdGlvbiB1cmxSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbihyZWxhdGl2ZSkge1xuICBpZiAoaXNTdHJpbmcocmVsYXRpdmUpKSB7XG4gICAgdmFyIHJlbCA9IG5ldyBVcmwoKTtcbiAgICByZWwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcbiAgICByZWxhdGl2ZSA9IHJlbDtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSBuZXcgVXJsKCk7XG4gIE9iamVjdC5rZXlzKHRoaXMpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgIHJlc3VsdFtrXSA9IHRoaXNba107XG4gIH0sIHRoaXMpO1xuXG4gIC8vIGhhc2ggaXMgYWx3YXlzIG92ZXJyaWRkZW4sIG5vIG1hdHRlciB3aGF0LlxuICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIC8vIGlmIHRoZSByZWxhdGl2ZSB1cmwgaXMgZW1wdHksIHRoZW4gdGhlcmUncyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgaWYgKHJlbGF0aXZlLmhyZWYgPT09ICcnKSB7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAvLyB0YWtlIGV2ZXJ5dGhpbmcgZXhjZXB0IHRoZSBwcm90b2NvbCBmcm9tIHJlbGF0aXZlXG4gICAgT2JqZWN0LmtleXMocmVsYXRpdmUpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgICAgaWYgKGsgIT09ICdwcm90b2NvbCcpXG4gICAgICAgIHJlc3VsdFtrXSA9IHJlbGF0aXZlW2tdO1xuICAgIH0pO1xuXG4gICAgLy91cmxQYXJzZSBhcHBlbmRzIHRyYWlsaW5nIC8gdG8gdXJscyBsaWtlIGh0dHA6Ly93d3cuZXhhbXBsZS5jb21cbiAgICBpZiAoc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF0gJiZcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gcmVzdWx0LnBhdGhuYW1lID0gJy8nO1xuICAgIH1cblxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHJlc3VsdC5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIE9iamVjdC5rZXlzKHJlbGF0aXZlKS5mb3JFYWNoKGZ1bmN0aW9uKGspIHtcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgICB9KTtcbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICByZXN1bHQucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoIXJlbGF0aXZlLmhvc3QgJiYgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9ICcnO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJztcbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxQYXRoLmpvaW4oJy8nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsYXRpdmUucGF0aG5hbWU7XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8ICcnO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0O1xuICAgIHJlc3VsdC5wb3J0ID0gcmVsYXRpdmUucG9ydDtcbiAgICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgfHwgcmVzdWx0LnNlYXJjaCkge1xuICAgICAgdmFyIHAgPSByZXN1bHQucGF0aG5hbWUgfHwgJyc7XG4gICAgICB2YXIgcyA9IHJlc3VsdC5zZWFyY2ggfHwgJyc7XG4gICAgICByZXN1bHQucGF0aCA9IHAgKyBzO1xuICAgIH1cbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHZhciBpc1NvdXJjZUFicyA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKSxcbiAgICAgIGlzUmVsQWJzID0gKFxuICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJ1xuICAgICAgKSxcbiAgICAgIG11c3RFbmRBYnMgPSAoaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHxcbiAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKSksXG4gICAgICByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicyxcbiAgICAgIHNyY1BhdGggPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KCcvJykgfHwgW10sXG4gICAgICByZWxQYXRoID0gcmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHBzeWNob3RpYyA9IHJlc3VsdC5wcm90b2NvbCAmJiAhc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF07XG5cbiAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSAnJztcbiAgICByZXN1bHQucG9ydCA9IG51bGw7XG4gICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICBpZiAoc3JjUGF0aFswXSA9PT0gJycpIHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDtcbiAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICB9XG4gICAgcmVzdWx0Lmhvc3QgPSAnJztcbiAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gbnVsbDtcbiAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09ICcnKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICB9XG4gICAgICByZWxhdGl2ZS5ob3N0ID0gbnVsbDtcbiAgICB9XG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09ICcnIHx8IHNyY1BhdGhbMF0gPT09ICcnKTtcbiAgfVxuXG4gIGlmIChpc1JlbEFicykge1xuICAgIC8vIGl0J3MgYWJzb2x1dGUuXG4gICAgcmVzdWx0Lmhvc3QgPSAocmVsYXRpdmUuaG9zdCB8fCByZWxhdGl2ZS5ob3N0ID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IChyZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0bmFtZSA9PT0gJycpID9cbiAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgLy8gaXQncyByZWxhdGl2ZVxuICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAoIWlzTnVsbE9yVW5kZWZpbmVkKHJlbGF0aXZlLnNlYXJjaCkpIHtcbiAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgLy8gbGlrZSBocmVmPSc/Zm9vJy5cbiAgICAvLyBQdXQgdGhpcyBhZnRlciB0aGUgb3RoZXIgdHdvIGNhc2VzIGJlY2F1c2UgaXQgc2ltcGxpZmllcyB0aGUgYm9vbGVhbnNcbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID9cbiAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAoIWlzTnVsbChyZXN1bHQucGF0aG5hbWUpIHx8ICFpc051bGwocmVzdWx0LnNlYXJjaCkpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnNlYXJjaCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAnLycgKyByZXN1bHQuc2VhcmNoO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gIHZhciBoYXNUcmFpbGluZ1NsYXNoID0gKFxuICAgICAgKHJlc3VsdC5ob3N0IHx8IHJlbGF0aXZlLmhvc3QpICYmIChsYXN0ID09PSAnLicgfHwgbGFzdCA9PT0gJy4uJykgfHxcbiAgICAgIGxhc3QgPT09ICcnKTtcblxuICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICBpZiAobGFzdCA9PSAnLicpIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChtdXN0RW5kQWJzICYmIHNyY1BhdGhbMF0gIT09ICcnICYmXG4gICAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQXQoMCkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgKHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnB1c2goJycpO1xuICB9XG5cbiAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSAnJyB8fFxuICAgICAgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gaXNBYnNvbHV0ZSA/ICcnIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogJyc7XG4gICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgIH1cbiAgfVxuXG4gIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IHJlcXVlc3QuaHR0cFxuICBpZiAoIWlzTnVsbChyZXN1bHQucGF0aG5hbWUpIHx8ICFpc051bGwocmVzdWx0LnNlYXJjaCkpIHtcbiAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICB9XG4gIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cblVybC5wcm90b3R5cGUucGFyc2VIb3N0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBob3N0ID0gdGhpcy5ob3N0O1xuICB2YXIgcG9ydCA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gIGlmIChwb3J0KSB7XG4gICAgcG9ydCA9IHBvcnRbMF07XG4gICAgaWYgKHBvcnQgIT09ICc6Jykge1xuICAgICAgdGhpcy5wb3J0ID0gcG9ydC5zdWJzdHIoMSk7XG4gICAgfVxuICAgIGhvc3QgPSBob3N0LnN1YnN0cigwLCBob3N0Lmxlbmd0aCAtIHBvcnQubGVuZ3RoKTtcbiAgfVxuICBpZiAoaG9zdCkgdGhpcy5ob3N0bmFtZSA9IGhvc3Q7XG59O1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09IFwic3RyaW5nXCI7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuICBhcmcgPT0gbnVsbDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xyXG4vKiBDb3B5cmlnaHQgKGMpIDIwMTQgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXHJcblxyXG52YXIgZGVhZHVuaXRDb3JlID0gcmVxdWlyZShcIi4vZGVhZHVuaXRDb3JlXCIpXHJcbnZhciBicm93c2VyQ29uZmlnID0gcmVxdWlyZSgnLi9kZWFkdW5pdENvcmUuYnJvd3NlckNvbmZpZycpXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGRlYWR1bml0Q29yZShicm93c2VyQ29uZmlnKCkpIiwiXCJ1c2Ugc3RyaWN0XCI7XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTQgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXG5cbnZhciBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG52YXIgRnV0dXJlID0gcmVxdWlyZSgnYXN5bmMtZnV0dXJlJylcbnZhciBwcm90byA9IHJlcXVpcmUoJ3Byb3RvJylcbnZhciBzdGFja2luZm8gPSByZXF1aXJlKCdzdGFja2luZm8nKVxudmFyIGFqYXggPSByZXF1aXJlKFwiYWpheFwiKVxudmFyIHJlc29sdmVTb3VyY2VNYXAgPSBGdXR1cmUud3JhcChyZXF1aXJlKCdzb3VyY2UtbWFwLXJlc29sdmUnKS5yZXNvbHZlU291cmNlTWFwKVxuXG52YXIgZGVhZHVuaXRDb3JlID0gcmVxdWlyZShcIi4vZGVhZHVuaXRDb3JlXCIpXG52YXIgaXNSZWxhdGl2ZSA9IHJlcXVpcmUoJy4vaXNSZWxhdGl2ZScpXG5cbmFqYXguc2V0U3luY2hyb25vdXModHJ1ZSkgLy8gdG9kbzogUkVNT1ZFIFRISVMgb25jZSB0aGlzIGNocm9tZSBidWcgaXMgZml4ZWQgaW4gYSBwdWJsaWMgcmVsZWFzZTogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTM2ODQ0NFxuXG4vLyBhZGQgc291cmNlRmlsZSBjb250ZW50cyBpbnRvIHN0YWNrdHJhY2UuanMncyBjYWNoZVxudmFyIHNvdXJjZUNhY2hlID0ge31cbnZhciBjYWNoZUdldCA9IGZ1bmN0aW9uKHVybCkge1xuICAgIHJldHVybiBzb3VyY2VDYWNoZVt1cmxdXG59XG52YXIgY2FjaGVTZXQgPSBmdW5jdGlvbih1cmwsIHJlc3BvbnNlRnV0dXJlKSB7XG4gICAgc291cmNlQ2FjaGVbdXJsXSA9IHJlc3BvbnNlRnV0dXJlXG4gICAgaWYoc3RhY2tpbmZvLnNvdXJjZUNhY2hlW3VybF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXNwb25zZUZ1dHVyZS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICBzdGFja2luZm8uc291cmNlQ2FjaGVbdXJsXSA9IHJlc3BvbnNlLnRleHQuc3BsaXQoJ1xcbicpXG4gICAgICAgIH0pLmRvbmUoKVxuICAgIH1cbn1cblxuLy8gc291cmNlLW1hcC1yZXNvbHZlIGFzc3VtZWQgdGhlIGF2YWlsYWJpbGl0eSBvZiBzZXRJbW1lZGlhdGVcbmlmKHdpbmRvdy5zZXRJbW1lZGlhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgIHdpbmRvdy5zZXRJbW1lZGlhdGUgPSBmdW5jdGlvbihmbiwgcGFyYW1zKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmbi5hcHBseSh0aGlzLHBhcmFtcylcbiAgICAgICAgfSwwKVxuICAgIH1cbn1cblxuYWpheC5jYWNoZUdldChjYWNoZUdldClcbmFqYXguY2FjaGVTZXQoY2FjaGVTZXQpXG5cblxudmFyIGNvbmZpZyA9IG1vZHVsZS5leHBvcnRzID0gcHJvdG8oZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpc1xuICAgICAgICAvLyBub2RlLmpzIGVycmJhY2sgc3R5bGUgcmVhZEZpbGVcbiAgICAgICAgLypwcml2YXRlKi8gdGhpcy5yZWFkRmlsZSA9IGZ1bmN0aW9uKHVybCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRoYXQuYWpheCh1cmwpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHsgLy8gbmVlZCB0byB1c2UgJ3RoYXQnIGJlY2F1c2UgcmVhZEZpbGUgd2lsbCBub3QgYmUgY2FsbGVkIHdpdGggdGhpcyBjb25maWcgb2JqZWN0IGFzIHRoZSBjb250ZXh0XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXNwb25zZS50ZXh0KVxuICAgICAgICAgICAgfSkuY2F0Y2goY2FsbGJhY2spLmRvbmUoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5hamF4ID0gYWpheFxuXG4gICAgdGhpcy5pbml0aWFsaXplID0gZnVuY3Rpb24oKSB7fVxuXG4gICAgdGhpcy5pbml0aWFsaXplTWFpblRlc3QgPSBmdW5jdGlvbih0ZXN0U3RhdGUpIHtcbiAgICAgICAgLy90ZXN0U3RhdGUuYWN0aXZlID0gdHJ1ZSAvLyBtYWtlIHN1cmVcblxuICAgICAgICB0ZXN0U3RhdGUub2xkT25lcnJvciA9IHdpbmRvdy5vbmVycm9yXG4gICAgICAgIHRlc3RTdGF0ZS5uZXdPbmVycm9yID0gd2luZG93Lm9uZXJyb3IgPSBmdW5jdGlvbihlcnJvck1lc3NhZ2UsIGZpbGVuYW1lLCBsaW5lLCBjb2x1bW4pIHtcbiAgICAgICAgICAgIGlmKGNvbHVtbiA9PT0gdW5kZWZpbmVkKSB2YXIgY29sdW1uVGV4dCA9ICcnXG4gICAgICAgICAgICBlbHNlICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbHVtblRleHQgPSBcIi9cIitjb2x1bW5cblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmNhdWdodCBlcnJvciBpbiBcIitmaWxlbmFtZStcIiBsaW5lIFwiK2xpbmUrY29sdW1uVGV4dCtcIjogXCIrZXJyb3JNZXNzYWdlKSAvLyBJRSBuZWVkcyB0aGUgZXhjZXB0aW9uIHRvIGFjdHVhbGx5IGJlIHRocm93biBiZWZvcmUgaXQgd2lsbCBoYXZlIGEgc3RhY2sgdHJhY2VcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIHRlc3RTdGF0ZS51bmhhbmRsZWRFcnJvckhhbmRsZXIoZSwgdHJ1ZSlcbiAgICAgICAgICAgICAgICBpZih0ZXN0U3RhdGUub2xkT25lcnJvcilcbiAgICAgICAgICAgICAgICAgICAgdGVzdFN0YXRlLm9sZE9uZXJyb3IuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRoaXMubWFpblRlc3REb25lPSBmdW5jdGlvbih0ZXN0U3RhdGUpIHtcbiAgICAgICAgLy90ZXN0U3RhdGUuYWN0aXZlID0gZmFsc2UgLy8gbWFrZSBzdXJlIHRoZSB0ZXN0LXNwZWNpZmljIG9uZXJyb3IgY29kZSBpcyBubyBsb25nZXIgcnVuXG4gICAgICAgIC8qaWYodGVzdFN0YXRlLm5ld09uZXJyb3IgPT09IHdpbmRvdy5vbmVycm9yKSB7XG4gICAgICAgICAgICB3aW5kb3cub25lcnJvciA9IHRlc3RTdGF0ZS5vbGRPbmVycm9yIC8vIG90aGVyd2lzZSBzb21ldGhpbmcgZWxzZSBoYXMgb3ZlcndyaXR0ZW4gb25lcnJvciwgc28gZG9uJ3QgbWVzcyB3aXRoIGl0XG4gICAgICAgIH0qL1xuICAgIH1cblxuICAgIHRoaXMuZ2V0RG9tYWluPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZCAvLyBkb21haW5zIGRvbid0IGV4aXN0IGluLWJyb3dzZXJcbiAgICB9XG5cbiAgICB0aGlzLnJ1blRlc3RHcm91cD0gZnVuY3Rpb24oZGVhZHVuaXRTdGF0ZSwgdGVzdGVyLCBydW5UZXN0LCBoYW5kbGVFcnJvciwgaGFuZGxlVW5oYW5kbGVkRXJyb3IpIHtcbiAgICAgICAgcnVuVGVzdCgpXG4gICAgfVxuICAgIHRoaXMuZ2V0U2NyaXB0U291cmNlTGluZXM9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgaWYoc3RhY2tpbmZvLnNvdXJjZUNhY2hlW3BhdGhdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoc3RhY2tpbmZvLnNvdXJjZUNhY2hlW3BhdGhdKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWpheChwYXRoKS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShyZXNwb25zZS50ZXh0LnNwbGl0KCdcXG4nKSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgIH1cbiAgICB0aGlzLmdldFNvdXJjZU1hcE9iamVjdCA9IGZ1bmN0aW9uKHVybCwgd2FybmluZ0hhbmRsZXIpIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAgIHJldHVybiB0aGlzLmFqYXgodXJsKS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICB2YXIgaGVhZGVycyA9IHJlc3BvbnNlLmhlYWRlcnNcbiAgICAgICAgICAgIGlmKGhlYWRlcnNbJ1NvdXJjZU1hcCddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YXIgaGVhZGVyU291cmNlTWFwID0gaGVhZGVyc1snU291cmNlTWFwJ11cbiAgICAgICAgICAgIH0gZWxzZSBpZihoZWFkZXJzWydYLVNvdXJjZU1hcCddKSB7XG4gICAgICAgICAgICAgICAgdmFyIGhlYWRlclNvdXJjZU1hcCA9IGhlYWRlcnNbJ1gtU291cmNlTWFwJ11cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoaGVhZGVyU291cmNlTWFwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBpZihpc1JlbGF0aXZlKGhlYWRlclNvdXJjZU1hcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyU291cmNlTWFwID0gcGF0aC5qb2luKHBhdGguZGlybmFtZSh1cmwpLGhlYWRlclNvdXJjZU1hcClcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhhdC5hamF4KGhlYWRlclNvdXJjZU1hcCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKEpTT04ucGFyc2UocmVzcG9uc2UudGV4dCkpXG4gICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZVNvdXJjZU1hcChyZXNwb25zZS50ZXh0LCB1cmwsIHRoYXQucmVhZEZpbGUpLmNhdGNoKGZ1bmN0aW9uKGUpe1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nSGFuZGxlcihlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKG51bGwpXG5cbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcE9iamVjdCkge1xuICAgICAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBPYmplY3QgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUoc291cmNlTWFwT2JqZWN0Lm1hcClcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB0aGlzLmRlZmF1bHRVbmhhbmRsZWRFcnJvckhhbmRsZXI9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgLy9pZihlICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmKGUuc3RhY2spXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGUuc3RhY2spXG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhlKVxuICAgICAgICAgICAgfSwwKVxuICAgIH1cbiAgICB0aGlzLmRlZmF1bHRUZXN0RXJyb3JIYW5kbGVyPSBmdW5jdGlvbih0ZXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHRlc3Rlci5tYW5hZ2VyLmVtaXQoJ2V4Y2VwdGlvbicsIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IHRlc3Rlci5tYWluU3ViVGVzdC5pZCxcbiAgICAgICAgICAgICAgICB0aW1lOiAobmV3IERhdGUoKSkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgIGVycm9yOiBlXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5nZXRMaW5lSW5mbz0gZnVuY3Rpb24oc3RhY2tJbmNyZWFzZSkge1xuICAgICAgICByZXR1cm4gRnV0dXJlKHN0YWNraW5mbygpWzMrc3RhY2tJbmNyZWFzZV0pXG4gICAgfVxuXG4gICAgdGhpcy5nZXRFeGNlcHRpb25JbmZvPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIHJldHVybiBGdXR1cmUoc3RhY2tpbmZvKGUpKVxuICAgIH1cblxuICAgIHRoaXMudGhyb3dBc3luY0V4Y2VwdGlvbiA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmKGUuc3RhY2sgIT09IHVuZGVmaW5lZCkgdGhyb3cgZS5zdGFja1xuICAgICAgICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlXG4gICAgICAgIH0sMClcbiAgICB9XG59KVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXG5cbnZhciBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG52YXIgVXJsID0gcmVxdWlyZShcInVybFwiKVxuXG52YXIgcHJvdG8gPSByZXF1aXJlKCdwcm90bycpXG52YXIgRnV0dXJlID0gcmVxdWlyZSgnYXN5bmMtZnV0dXJlJylcbnZhciBTb3VyY2VNYXBDb25zdW1lciA9IHJlcXVpcmUoJ3NvdXJjZS1tYXAnKS5Tb3VyY2VNYXBDb25zdW1lclxuXG52YXIgcHJvY2Vzc1Jlc3VsdHMgPSByZXF1aXJlKCcuL3Byb2Nlc3NSZXN1bHRzJylcbnZhciBpc1JlbGF0aXZlID0gcmVxdWlyZSgnLi9pc1JlbGF0aXZlJylcblxuLy8gcmV0dXJucyBhIG1vZHVsZSBpbnRlbmRlZCBmb3IgYSBzcGVjaWZpYyBlbnZpcm9ubWVudCAodGhhdCBlbnZpcm9ubWVudCBiZWluZyBkZXNjcmliZWQgYnkgdGhlIG9wdGlvbnMpXG4vLyBvcHRpb25zIGNhbiBjb250YWluOlxuICAgIC8vIGluaXRpYWxpemF0aW9uIC0gYSBmdW5jdGlvbiBydW4gb25jZSB0aGF0IGNhbiBzZXR1cCB0aGluZ3MgKGxpa2UgYSBnbG9iYWwgZXJyb3IgaGFuZGxlcikuXG4gICAgICAgIC8vIEdldHMgYSBzaW5nbGUgcGFyYW1ldGVyICdzdGF0ZScgd2hpY2ggaGFzIHRoZSBmb2xsb3dpbmcgZm9ybTpcbiAgICAgICAgICAgIC8vIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlcnJvcix3YXJuKVxuICAgIC8vIGluaXRpYWxpemVNYWluVGVzdCAtIGEgZnVuY3Rpb24gcnVuIG9uY2UgdGhhdCBjYW4gc2V0dXAgdGhpbmdzIChsaWtlIGEgdGVzdC1zcGVjaWZpYyBoYW5kbGVyKS5cbiAgICAgICAgLy8gR2V0cyBhIHNpbmdsZSBwYXJhbWV0ZXIgJ21haW5UZXN0U3RhdGUnIHdoaWNoIGhhcyB0aGUgZm9sbG93aW5nIGZvcm06XG4gICAgICAgICAgICAvLyB1bmhhbmRsZWRFcnJvckhhbmRsZXIoZXJyb3Isd2FybikgLSB0aGUgZXJyb3IgaGFuZGxlciBmb3IgdGhhdCB0ZXN0XG4gICAgLy8gZ2V0RG9tYWluIC0gYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGN1cnJlbnQgZG9tYWluLCBvciB1bmRlZmluZWQgaWYgdGhlIGVudmlyb25tZW50ICgqY291Z2gqIGJyb3dzZXJzKSBkb2Vzbid0IGhhdmUgZG9tYWluc1xuICAgIC8vIGdldFNvdXJjZU1hcE9iamVjdCAtIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgZnV0dXJlIG9mIHRoZSBwcmUtcGFyc2VkIHNvdXJjZSBtYXAgb2JqZWN0IGZvciBhIGZpbGUsIG9yIGZ1dHVyZSB1bmRlZmluZWRcbiAgICAgICAgLy8gZ2V0cyB0aGUgcGFyYW1ldGVyOlxuICAgICAgICAgICAgLy8gdXJsIC0gdGhlIHVybCBvZiB0aGUgZmlsZSB0byBmaW5kIGEgc291cmNlbWFwIGZvclxuICAgICAgICAgICAgLy8gd2FybmluZ0hhbmRsZXIgLSBhIHdhcm5pbmdIYW5kbGVyIGZ1bmN0aW9uIHRoYXQgZXhwZWN0cyBhbiBlcnJvciB0byBiZSBwYXNzZWQgdG8gaXRcbiAgICAvLyBydW5UZXN0R3JvdXAgLSBhIGZ1bmN0aW9uIHJ1biB0aGF0IGFsbG93cyB5b3UgdG8gd3JhcCB0aGUgYWN0dWFsIHRlc3QgcnVuIGluIHNvbWUgd2F5IChpbnRlbmRlZCBmb3Igbm9kZS5qcyBkb21haW5zKVxuICAgICAgICAvLyBnZXRzIHBhcmFtZXRlcnM6XG4gICAgICAgICAgICAvLyBzdGF0ZSAtIHRoZSBzYW1lIHN0YXRlIG9iamVjdCBzZW50IGludG8gYGluaXRpYWxpemF0aW9uYFxuICAgICAgICAgICAgLy8gdGVzdGVyIC0gYSBVbml0VGVzdGVyIG9iamVjdCBmb3IgdGhlIHRlc3RcbiAgICAgICAgICAgIC8vIHJ1blRlc3QgLSB0aGUgZnVuY3Rpb24gdGhhdCB5b3Ugc2hvdWxkIGNhbGwgdG8gcnVuIHRoZSB0ZXN0IGdyb3VwLiBBbHJlYWR5IGhhcyBhIHN5bmNocm9ub3VzIHRyeSBjYXRjaCBpbnNpZGUgaXQgKHNvIHlvdSBkb24ndCBuZWVkIHRvIHdvcnJ5IGFib3V0IHRoYXQpXG4gICAgICAgICAgICAvLyBoYW5kbGVFcnJvciAtIGEgZnVuY3Rpb24gdGhhdCBoYW5kbGVzIGFuIGVycm9yIGlmIG9uZSBjb21lcyB1cC4gVGFrZXMgdGhlIGVycm9yIGFzIGl0cyBvbmx5IHBhcmFtZXRlci4gUmV0dXJucyBhIGZ1dHVyZS5cbiAgICAvLyBtYWluVGVzdERvbmUgLSBhIGZ1bmN0aW9uIHJ1biBvbmNlIGEgdGVzdCBpcyBkb25lXG4gICAgICAgIC8vIGdldHMgdGhlICdtYWluVGVzdFN0YXRlJyBwYXJhbWV0ZXJcbiAgICAvLyBkZWZhdWx0VW5oYW5kbGVkRXJyb3JIYW5kbGVyIC0gYSBmdW5jdGlvbiB0aGF0IGhhbmRsZXMgYW4gZXJyb3IgdW5oYW5kbGVkIGJ5IGFueSBvdGhlciBoYW5kbGVyXG4gICAgICAgIC8vIGdldHMgdGhlICdlcnJvcicgYXMgaXRzIG9ubHkgcGFyYW1ldGVyXG4gICAgLy8gZGVmYXVsdFRlc3RFcnJvckhhbmRsZXIgLSBpcyBwYXNzZWQgdGhlIGN1cnJlbnQgdGVzdCwgYW5kIHNob3VsZCByZXR1cm4gYSBmdW5jdGlvbiB0aGF0IGhhbmRsZXMgYW4gZXJyb3Jcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXG4gICAgLy8gYSB2YXJpYWJsZSB0aGF0IGhvbGRzIGNoYW5nZWFibGUgc3RhdGVcbiAgICB2YXIgc3RhdGUgPSB7XG4gICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcjogb3B0aW9ucy5kZWZhdWx0VW5oYW5kbGVkRXJyb3JIYW5kbGVyXG4gICAgfVxuXG4gICAgb3B0aW9ucy5pbml0aWFsaXplKHN0YXRlKVxuXG4gICAgLy8gdGhlIHByb3RvdHlwZSBvZiBvYmplY3RzIHVzZWQgdG8gbWFuYWdlIGFjY2Vzc2luZyBhbmQgZGlzcGxheWluZyByZXN1bHRzIG9mIGEgdW5pdCB0ZXN0XG4gICAgdmFyIFVuaXRUZXN0ID0gcHJvdG8oZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuaW5pdCA9IGZ1bmN0aW9uKC8qbWFpbk5hbWU9dW5kZWZpbmVkLCBncm91cHMqLykge1xuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAgICAgICB2YXIgYXJncyA9IGFyZ3VtZW50c1xuICAgICAgICAgICAgdGhpcy5tYW5hZ2VyID0gRXZlbnRNYW5hZ2VyKHRoaXMpXG5cbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgcnVuVGVzdC5jYWxsKHRoYXQsIGFyZ3MpXG4gICAgICAgICAgICB9LDApXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmV2ZW50cyA9IGZ1bmN0aW9uKGhhbmRsZXJzKSB7XG4gICAgICAgICAgICB0aGlzLm1hbmFnZXIuYWRkKGhhbmRsZXJzLCBvcHRpb25zLmdldERvbWFpbigpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucmVzdWx0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHByb2Nlc3NSZXN1bHRzKHRoaXMpXG4gICAgICAgIH1cblxuICAgICAgICAvLyBwcml2YXRlXG5cbiAgICAgICAgZnVuY3Rpb24gcnVuVGVzdChhcmdzKSB7XG4gICAgICAgICAgICB2YXIgZmFrZVRlc3QgPSBuZXcgVW5pdFRlc3RlcigpXG4gICAgICAgICAgICAgICAgZmFrZVRlc3QuaWQgPSB1bmRlZmluZWQgLy8gZmFrZSB0ZXN0IGRvZXNuJ3QgZ2V0IGFuIGlkXG4gICAgICAgICAgICAgICAgZmFrZVRlc3QubWFuYWdlciA9IHRoaXMubWFuYWdlclxuICAgICAgICAgICAgICAgIGZha2VUZXN0LnRpbWVvdXRzID0gW11cbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5vbkRvbmVDYWxsYmFja3MgPSBbXVxuXG4gICAgICAgICAgICAgICAgdmFyIGdldFVuaGFuZGxlZEVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gY3JlYXRlVW5oYW5kbGVkRXJyb3JIYW5kbGVyKGZha2VUZXN0Lm1haW5TdWJUZXN0KVxuICAgICAgICAgICAgICAgICAgICBnZXRVbmhhbmRsZWRFcnJvckhhbmRsZXIgPSBmdW5jdGlvbigpIHsgLy8gbWVtb2l6ZSB0aGlzIGp1bmtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmhhbmRsZWRFcnJvckhhbmRsZXJcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5oYW5kbGVkRXJyb3JIYW5kbGVyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZha2VUZXN0Lm1haW5UZXN0U3RhdGUgPSB7Z2V0IHVuaGFuZGxlZEVycm9ySGFuZGxlcigpe3JldHVybiBnZXRVbmhhbmRsZWRFcnJvckhhbmRsZXIoKSB8fCBvcHRpb25zLmRlZmF1bHRUZXN0RXJyb3JIYW5kbGVyKGZha2VUZXN0KX19XG5cbiAgICAgICAgICAgICAgICB2YXIgd2FybmluZ0luZm9NZXNzYWdlSGFzQmVlbk91dHB1dCA9IGZhbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLnRlc3RPYmplY3Qud2FybmluZ0hhbmRsZXIgPSBmYWtlVGVzdC53YXJuaW5nSGFuZGxlciA9IGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGVycm9ySGFuZGxlciA9IGdldFVuaGFuZGxlZEVycm9ySGFuZGxlcigpXG4gICAgICAgICAgICAgICAgICAgIGlmKHdhcm5pbmdJbmZvTWVzc2FnZUhhc0JlZW5PdXRwdXQgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgd2FybmluZyA9IG5ld0Vycm9yKFwiWW91J3ZlIHJlY2VpdmVkIGF0IGxlYXN0IG9uZSB3YXJuaW5nLiBJZiB5b3UgZG9uJ3Qgd2FudCB0byB0cmVhdCB3YXJuaW5ncyBhcyBlcnJvcnMsIHVzZSB0aGUgYHdhcm5pbmdgIG1ldGhvZCB0byByZWRlZmluZSBob3cgdG8gaGFuZGxlIHRoZW0uXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvckhhbmRsZXIod2FybmluZywgZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nSW5mb01lc3NhZ2VIYXNCZWVuT3V0cHV0ID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZXJyb3JIYW5kbGVyKHcsIGZhbHNlKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG9wdGlvbnMuaW5pdGlhbGl6ZU1haW5UZXN0KGZha2VUZXN0Lm1haW5UZXN0U3RhdGUpXG5cbiAgICAgICAgICAgICAgICB0aW1lb3V0KGZha2VUZXN0LCAzMDAwLCB0cnVlKSAvLyBpbml0aWFsIChkZWZhdWx0KSB0aW1lb3V0XG4gICAgICAgICAgICAgICAgZmFrZVRlc3Qub25Eb25lID0gZnVuY3Rpb24oKSB7IC8vIHdpbGwgZXhlY3V0ZSB3aGVuIHRoaXMgdGVzdCBpcyBkb25lXG4gICAgICAgICAgICAgICAgICAgIGZha2VUZXN0Lm1hbmFnZXIubGFzdEVtaXRGdXR1cmUudGhlbihmdW5jdGlvbigpIHsgLy8gd2FpdCBmb3IgYWxsIHRoZSBhbHJlYWR5LXJlZ2lzdGVyZWQgZW1pdHMgdG8gZW1pdCBiZWZvcmUgZmluYWxpemluZyB0aGUgdGVzdFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9uZShmYWtlVGVzdClcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMubWFpblRlc3REb25lKGZha2VUZXN0Lm1haW5UZXN0U3RhdGUpXG4gICAgICAgICAgICAgICAgICAgIH0pLmRvbmUoKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5jYWxsT25Eb25lID0gZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgICAgICAgICAgICAgZmFrZVRlc3Qub25Eb25lQ2FsbGJhY2tzLnB1c2goY2IpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBVbml0VGVzdGVyLnByb3RvdHlwZS50ZXN0LmFwcGx5KGZha2VUZXN0LCBhcmdzKSAvLyBzZXQgc28gdGhlIGVycm9yIGhhbmRsZXIgY2FuIGFjY2VzcyB0aGUgcmVhbCB0ZXN0XG4gICAgICAgICAgICB0aGlzLm1haW5UZXN0ZXIgPSBmYWtlVGVzdFxuICAgICAgICAgICAgdGhpcy5wYXJlbnRUZXN0ZXIgPSBmYWtlVGVzdFxuXG4gICAgICAgICAgICBmYWtlVGVzdC5ncm91cEVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgY2hlY2tHcm91cERvbmUoZmFrZVRlc3QpXG4gICAgICAgIH1cbiAgICB9KVxuXG4gICAgdmFyIEV2ZW50TWFuYWdlciA9IHByb3RvKGZ1bmN0aW9uKCkge1xuXG4gICAgICAgIHRoaXMuaW5pdCA9IGZ1bmN0aW9uKHRlc3RPYmplY3QpIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICAgICAgZ3JvdXA6IFtdLFxuICAgICAgICAgICAgICAgIGFzc2VydDogW10sXG4gICAgICAgICAgICAgICAgY291bnQ6IFtdLFxuICAgICAgICAgICAgICAgIGV4Y2VwdGlvbjogW10sXG4gICAgICAgICAgICAgICAgbG9nOiBbXSxcbiAgICAgICAgICAgICAgICBlbmQ6IFtdLFxuICAgICAgICAgICAgICAgIGdyb3VwRW5kOiBbXSxcbiAgICAgICAgICAgICAgICBiZWZvcmU6IFtdLFxuICAgICAgICAgICAgICAgIGFmdGVyOiBbXSxcbiAgICAgICAgICAgICAgICBiZWZvcmVFbmQ6IFtdLFxuICAgICAgICAgICAgICAgIGFmdGVyRW5kOiBbXVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmhpc3RvcnkgPSBbXVxuICAgICAgICAgICAgdGhpcy5lbWl0RGVwdGggPSAwIC8vIHJlY29yZHMgaG93IG1hbnkgZnV0dXJlcyBhcmUgd2FpdGluZyBvbiBlYWNob3RoZXIsIHNvIHdlIGNhbiBtYWtlIHN1cmUgbWF4aW11bSBzdGFjayBkZXB0aCBpc24ndCBleGNlZWRlZFxuICAgICAgICAgICAgdGhpcy5sYXN0RW1pdEZ1dHVyZSA9IEZ1dHVyZSh1bmRlZmluZWQpXG4gICAgICAgICAgICB0aGlzLnRlc3RPYmplY3QgPSB0ZXN0T2JqZWN0XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRlc3RPYmplY3Q7IC8vIHVzZWQgdG8gZ2V0IHRoZSByaWdodCB3YXJuaW5nSGFuZGxlclxuXG4gICAgICAgIC8vIGVtaXRzIGFuIGV2ZW50XG4gICAgICAgIC8vIGV2ZW50RGF0YUZ1dHVyZSByZXNvbHZlcyB0byBlaXRoZXIgYW4gZXZlbnREYXRhIG9iamVjdCwgb3IgdW5kZWZpbmVkIGlmIG5vdGhpbmcgc2hvdWxkIGJlIGVtaXR0ZWRcbiAgICAgICAgdGhpcy5lbWl0ID0gZnVuY3Rpb24odHlwZSwgZXZlbnREYXRhRnV0dXJlKSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICAgICAgIHZhciBsYXN0RW1pdEZ1dHVyZSA9IHRoYXQubGFzdEVtaXRGdXR1cmUgLy8gY2FwdHVyZSBpdCBmb3IgdGhlIHBvc3NpYmxlIHNldFRpbWVvdXQgdGhyZWFkbGV0XG4gICAgICAgICAgICB2YXIgZG9TdHVmZiA9IGZ1bmN0aW9uKGYpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0RnV0dXJlID0gbGFzdEVtaXRGdXR1cmUudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV2ZW50RGF0YUZ1dHVyZVxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oZXZlbnREYXRhKXtcbiAgICAgICAgICAgICAgICAgICAgaWYoZXZlbnREYXRhICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRBbmRUcmlnZ2VySGFuZGxlcnMuY2FsbCh0aGF0LCB0eXBlLCBldmVudERhdGEpXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGF0LnRlc3RPYmplY3Qud2FybmluZ0hhbmRsZXIoZSlcbiAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgaWYoZiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdEZ1dHVyZS5maW5hbGx5KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe2YucmV0dXJuKCl9LDApIC8vIG1ha2Ugc3VyZSB3ZSBkb24ndCBnZXQgYSBcInRvbyBtdWNoIHJlY3Vyc2lvbiBlcnJvclwiIC8vIHRvZG86IHRlc3Qgbm90IGRvaW5nIHRoaXMgb25jZSBicm93c2VycyBhbGwgc3VwcG9ydCBwcm9wZXIgdGFpbCBjYWxsc1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRGdXR1cmVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZW1pdERlcHRoKytcbiAgICAgICAgICAgIGlmKHRoaXMuZW1pdERlcHRoICUgNDAgPT09IDApIHsgLy8gNDAgc2VlbXMgdG8gYmUgdGhlIG1hZ2ljIG51bWJlciBoZXJlIGZvciBmaXJlZm94IC0gc3VjaCBhIGZpbmlja3kgYnJvd3NlclxuICAgICAgICAgICAgICAgIHRoYXQubGFzdEVtaXRGdXR1cmUgPSBkb1N0dWZmKG5ldyBGdXR1cmUpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoYXQubGFzdEVtaXRGdXR1cmUgPSBkb1N0dWZmKClcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMubGFzdEVtaXRGdXR1cmVcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFkZHMgYSBzZXQgb2YgbGlzdGVuaW5nIGhhbmRsZXJzIHRvIHRoZSBldmVudCBzdHJlYW0sIGFuZCBydW5zIHRob3NlIGhhbmRsZXJzIG9uIHRoZSBzdHJlYW0ncyBoaXN0b3J5XG4gICAgICAgIC8vIGRvbWFpbiBpcyBvcHRpb25hbCwgYnV0IGlmIGRlZmluZWQgd2lsbCBiZSB0aGUgbm9kZS5qcyBkb21haW4gdGhhdCB1bmhhbmRsZWQgZXJyb3JzIHdpbGwgYmUgcm91dGVkIHRvXG4gICAgICAgIHRoaXMuYWRkID0gZnVuY3Rpb24oaGFuZGxlcnMsIGRvbWFpbikge1xuICAgICAgICAgICAgLy8gcnVuIHRoZSBoaXN0b3J5IG9mIGV2ZW50cyBvbiB0aGUgdGhlIGhhbmRsZXJzXG4gICAgICAgICAgICB0aGlzLmhpc3RvcnkuZm9yRWFjaChmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgaWYoaGFuZGxlcnNbZS50eXBlXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzW2UudHlwZV0uY2FsbCh1bmRlZmluZWQsIGUuZGF0YSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAvLyB0aGVuIGhhdmUgdGhvc2UgaGFuZGxlcnMgbGlzdGVuIG9uIGZ1dHVyZSBldmVudHNcbiAgICAgICAgICAgIGZvcih2YXIgdHlwZSBpbiBoYW5kbGVycykge1xuICAgICAgICAgICAgICAgIHZhciB0eXBlSGFuZGxlcnMgPSB0aGlzLmhhbmRsZXJzW3R5cGVdXG4gICAgICAgICAgICAgICAgaWYodHlwZUhhbmRsZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZXZlbnQgdHlwZSAnXCIrdHlwZStcIicgaW52YWxpZFwiKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHR5cGVIYW5kbGVycy5wdXNoKHtoYW5kbGVyOiBoYW5kbGVyc1t0eXBlXSwgZG9tYWluOiBkb21haW59KVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhlIHN5bmNocm9ub3VzIHBhcnQgb2YgZW1pdHRpbmdcbiAgICAgICAgZnVuY3Rpb24gcmVjb3JkQW5kVHJpZ2dlckhhbmRsZXJzKHR5cGUsIGV2ZW50RGF0YSkge1xuICAgICAgICAgICAgdGhpcy5oaXN0b3J5LnB1c2goe3R5cGU6dHlwZSwgZGF0YTogZXZlbnREYXRhfSlcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlcnNbdHlwZV0uZm9yRWFjaChmdW5jdGlvbihoYW5kbGVySW5mbykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJJbmZvLmhhbmRsZXIuY2FsbCh1bmRlZmluZWQsIGV2ZW50RGF0YSlcbiAgICAgICAgICAgICAgICB9IGNhdGNoKGUpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyB0aHJvdyBlcnJvciBhc3luY2hyb25vdXNseSBiZWNhdXNlIHRoZXNlIGVycm9yIHNob3VsZCBiZSBzZXBhcmF0ZSBmcm9tIHRoZSB0ZXN0IGV4Y2VwdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRocm93RXJyb3JGbiA9IG9wdGlvbnMudGhyb3dBc3luY0V4Y2VwdGlvblxuXG4gICAgICAgICAgICAgICAgICAgIGlmKGhhbmRsZXJJbmZvLmRvbWFpbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3dFcnJvckZuID0gaGFuZGxlckluZm8uZG9tYWluLmJpbmQodGhyb3dFcnJvckZuKSAgICAvLyB0aGlzIGRvbWFpbiBiaW5kIGlzIG5lZWRlZCBiZWNhdXNlIGVtaXQgaXMgZG9uZSBpbnNpZGUgZGVhZHVuaXQncyB0ZXN0IGRvbWFpbiwgd2hpY2ggaXNuJ3Qgd2hlcmUgd2Ugd2FudCB0byBwdXQgZXJyb3JzIGNhdXNlZCBieSB0aGUgZXZlbnQgaGFuZGxlcnNcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRocm93RXJyb3JGbihlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxuXG4gICAgZnVuY3Rpb24gdGVzdEdyb3VwKHRlc3RlciwgdGVzdCkge1xuXG4gICAgICAgIC8vIGhhbmRsZXMgYW55IGVycm9yIChzeW5jaHJvbm91cyBvciBhc3luY2hyb25vdXMgZXJyb3JzKVxuICAgICAgICB2YXIgaGFuZGxlRXJyb3IgPSBjcmVhdGVVbmhhbmRsZWRFcnJvckhhbmRsZXIodGVzdGVyKVxuXG4gICAgICAgIHZhciBydW5UZXN0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRlc3QuY2FsbCh0ZXN0ZXIsIHRlc3RlcikgLy8gdGVzdGVyIGlzIGJvdGggJ3RoaXMnIGFuZCB0aGUgZmlyc3QgcGFyYW1ldGVyIChmb3IgZmxleGliaWxpdHkpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVFcnJvcihlLCB0cnVlKS5kb25lKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgIH1cblxuICAgICAgICBvcHRpb25zLnJ1blRlc3RHcm91cChzdGF0ZSwgdGVzdGVyLCBydW5UZXN0LCBoYW5kbGVFcnJvcilcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVVbmhhbmRsZWRFcnJvckhhbmRsZXIodGVzdGVyKSB7XG5cbiAgICAgICAgdmFyIGhhbmRsZUVycm9ySW5FcnJvckhhbmRsZXIgPSBmdW5jdGlvbih3YXJuLCBuZXdFcnJvcikge1xuICAgICAgICAgICAgdmFyIHRleHRGb3JPcmlnaW5hbEVycm9yID0gbmV3RXJyb3Iuc3RhY2s/bmV3RXJyb3Iuc3RhY2s6bmV3RXJyb3JcblxuICAgICAgICAgICAgaWYod2FybiAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0ZXN0ZXIud2FybmluZ0hhbmRsZXIobmV3RXJyb3IpXG4gICAgICAgICAgICAgICAgfSBjYXRjaCh3YXJuaW5nSGFuZGxlckVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB3YXJuaW5nSGFuZGxlckVycm9yVGV4dCA9IHdhcm5pbmdIYW5kbGVyRXJyb3Iuc3RhY2s/d2FybmluZ0hhbmRsZXJFcnJvci5zdGFjazp3YXJuaW5nSGFuZGxlckVycm9cblxuICAgICAgICAgICAgICAgICAgICB2YXIgZXJyb3JjZXB0aW9uID0gbmV3IEVycm9yKFwiQW4gZXJyb3IgaGFwcGVuZWQgaW4gdGhlIGVycm9yIGhhbmRsZXI6IFwiK3dhcm5pbmdIYW5kbGVyRXJyb3JUZXh0K1wiXFxuXCIrdGV4dEZvck9yaWdpbmFsRXJyb3IpXG4gICAgICAgICAgICAgICAgICAgIHRlc3Rlci5tYW5hZ2VyLmVtaXQoJ2V4Y2VwdGlvbicsIEZ1dHVyZShlcnJvcmNlcHRpb24pKS5kb25lKCkgLy8gaWYgc2hpdCBnZXRzIHRoaXMgYmFkLCB0aGF0IHN1Y2tzXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKHRleHRGb3JPcmlnaW5hbEVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gd2FybiBzaG91bGQgYmUgc2V0IHRvIGZhbHNlIGlmIHRoZSBoYW5kbGVyIGlzIGJlaW5nIGNhbGxlZCB0byByZXBvcnQgYSB3YXJuaW5nXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihlLCB3YXJuKSB7XG4gICAgICAgICAgICBpZih0ZXN0ZXIudW5oYW5kbGVkRXJyb3JIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0ZXN0ZXIudW5oYW5kbGVkRXJyb3JIYW5kbGVyKGUpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxuXG4gICAgICAgICAgICAgICAgfSBjYXRjaChuZXdFcnJvcikgeyAgICAgLy8gZXJyb3IgaGFuZGxlciBoYWQgYW4gZXJyb3IuLi5cbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3JJbkVycm9ySGFuZGxlcih3YXJuLCBuZXdFcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBlbHNlXG5cbiAgICAgICAgICAgIHZhciBlcnJvclRvRW1pdCA9IG1hcEV4Y2VwdGlvbihlLCB0ZXN0ZXIud2FybmluZ0hhbmRsZXIpLmNhdGNoKGZ1bmN0aW9uKG5ld0Vycm9yKSB7XG4gICAgICAgICAgICAgICAgaWYobmV3RXJyb3IubWVzc2FnZSAhPT0gXCJBY2Nlc3NpbmcgdGhlICdjYWxsZXInIHByb3BlcnR5IG9mIGEgZnVuY3Rpb24gb3IgYXJndW1lbnRzIG9iamVjdCBpcyBub3QgYWxsb3dlZCBpbiBzdHJpY3QgbW9kZVwiKSB7IC8vIHN0YWNrdHJhY2UuanMgZG9lc24ndCBzdXBwb3J0IElFIGZvciBjZXJ0YWluIHRoaW5nc1xuICAgICAgICAgICAgICAgICAgICBoYW5kbGVFcnJvckluRXJyb3JIYW5kbGVyKHdhcm4sIG5ld0Vycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKGUpIC8vIHVzZSB0aGUgb3JpZ2luYWwgdW5tYXBwZWQgZXhjZXB0aW9uXG5cbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oZXhjZXB0aW9uKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKGV4Y2VwdGlvbkVtaXREYXRhKHRlc3RlcixleGNlcHRpb24pKVxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgdmFyIGVtaXRGdXR1cmUgPSB0ZXN0ZXIubWFuYWdlci5lbWl0KCdleGNlcHRpb24nLCBlcnJvclRvRW1pdClcbiAgICAgICAgICAgIHJldHVybiBhZnRlcldhaXRpbmdFbWl0SXNDb21wbGV0ZSh0ZXN0ZXIsIGVtaXRGdXR1cmUpXG5cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4Y2VwdGlvbkVtaXREYXRhKHRlc3RlciwgZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIuaWQsXG4gICAgICAgICAgICB0aW1lOiBub3coKSxcbiAgICAgICAgICAgIGVycm9yOiBlXG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIHRoZSBwcm90b3R5cGUgb2Ygb2JqZWN0cyB1c2VkIHRvIHdyaXRlIHRlc3RzIGFuZCBjb250YWluIHRoZSByZXN1bHRzIG9mIHRlc3RzXG4gICAgdmFyIFVuaXRUZXN0ZXIgPSBmdW5jdGlvbihuYW1lLCBtYWluVGVzdGVyLCBwYXJlbnRUZXN0ZXIpIHtcbiAgICAgICAgaWYoIW1haW5UZXN0ZXIpIG1haW5UZXN0ZXIgPSB0aGlzXG5cbiAgICAgICAgdGhpcy5pZCA9IGdyb3VwaWQoKVxuICAgICAgICB0aGlzLm1haW5UZXN0ZXIgPSBtYWluVGVzdGVyIC8vIHRoZSBtYWluVGVzdGVyIGlzIHVzZWQgdG8gZWFzaWx5IGZpZ3VyZSBvdXQgaWYgdGhlIHRlc3QgcmVzdWx0cyBoYXZlIGJlZW4gYWNjZXNzZWQgKHNvIGVhcmx5IGFjY2Vzc2VzIGNhbiBiZSBkZXRlY3RlZClcbiAgICAgICAgdGhpcy5wYXJlbnRUZXN0ZXIgPSBwYXJlbnRUZXN0ZXIgLy8gdXNlZCB0byByZXNldCB0aW1lb3V0c1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lXG5cbiAgICAgICAgdGhpcy5kb25lVGVzdHMgPSAwXG4gICAgICAgIHRoaXMuZG9uZUFzc2VydHMgPSAwXG4gICAgICAgIHRoaXMucnVubmluZ1Rlc3RzID0gMCAvLyB0aGUgbnVtYmVyIG9mIHN1YnRlc3RzIGNyZWF0ZWQgc3luY2hyb25vdXNseVxuICAgICAgICB0aGlzLmRvbmVDYWxsZWQgPSBmYWxzZVxuICAgICAgICB0aGlzLmRvU291cmNlbWFwcGVyeSA9IHRydWUgLy8gd2hldGhlciB0byBkbyBzb3VyY2UgbWFwcGluZywgaWYgcG9zc2libGUsIHdpdGhpbiB0aGlzIHRlc3RcblxuICAgICAgICB0aGlzLmNvbXBsZXRlID0gbmV3IEZ1dHVyZSAvLyByZXNvbHZlZCB3aGVuIGRvbmVcbiAgICB9XG5cbiAgICAgICAgVW5pdFRlc3Rlci5wcm90b3R5cGUgPSB7XG4gICAgICAgICAgICB0ZXN0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0ZXN0ID0gYXJndW1lbnRzWzBdXG5cbiAgICAgICAgICAgICAgICAvLyBuYW1lZCB0ZXN0XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5hbWUgPSBhcmd1bWVudHNbMF1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlc3QgPSBhcmd1bWVudHNbMV1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICAgICAgICAgICB0aGlzLnJ1bm5pbmdUZXN0cysrXG5cbiAgICAgICAgICAgICAgICB2YXIgdGVzdGVyID0gbmV3IFVuaXRUZXN0ZXIobmFtZSwgdGhpcy5tYWluVGVzdGVyLCB0aGlzKVxuICAgICAgICAgICAgICAgIHRlc3Rlci5tYW5hZ2VyID0gdGhpcy5tYW5hZ2VyXG4gICAgICAgICAgICAgICAgdGVzdGVyLmRvU291cmNlbWFwcGVyeSA9IHRoaXMuZG9Tb3VyY2VtYXBwZXJ5IC8vIGluaGVyaXQgZnJvbSBwYXJlbnQgdGVzdFxuICAgICAgICAgICAgICAgIHRlc3Rlci53YXJuaW5nSGFuZGxlciA9IHRoaXMud2FybmluZ0hhbmRsZXJcblxuICAgICAgICAgICAgICAgIGlmKHRoaXMuaWQgPT09IHVuZGVmaW5lZCkgeyAvLyBpZSBpdHMgdGhlIHRvcC1sZXZlbCBmYWtlIHRlc3RcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYWluU3ViVGVzdCA9IHRlc3RlclxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRlc3Rlci5vbkRvbmUgPSBmdW5jdGlvbigpIHsgLy8gd2lsbCBleGVjdXRlIHdoZW4gdGhpcyB0ZXN0IGlzIGRvbmVcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5kb25lVGVzdHMgKz0gMVxuXG4gICAgICAgICAgICAgICAgICAgIHRoYXQubWFuYWdlci5lbWl0KCdncm91cEVuZCcsIEZ1dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZTogbm93KClcbiAgICAgICAgICAgICAgICAgICAgfSkpXG5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlc3Rlci5jb21wbGV0ZS5yZXR1cm4oKVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZVVuaGFuZGxlZEVycm9ySGFuZGxlcih0ZXN0ZXIpKGUpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjaGVja0dyb3VwRG9uZSh0aGF0KVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRlc3Rlci5tYWluVGVzdGVyLmNhbGxPbkRvbmUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKCF0ZXN0ZXIuZG9uZUNhbGxlZCkgeyAvLyBhIHRpbWVvdXQgaGFwcGVuZWQgLSBlbmQgdGhlIHRlc3RcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlc3Rlci5kb25lQ2FsbGVkID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhhdC5tYW5hZ2VyLmVtaXQoJ2dyb3VwRW5kJywgRnV0dXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIuZW1pdCgnZ3JvdXAnLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHRoaXMuaWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICAgICAgfSkpXG5cbiAgICAgICAgICAgICAgICBpZih0aGlzLmJlZm9yZUZuKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWFuYWdlci5lbWl0KCdiZWZvcmUnLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxuICAgICAgICAgICAgICAgICAgICB9KSlcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJlZm9yZUZuLmNhbGwodGhpcywgdGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIuZW1pdCgnYmVmb3JlRW5kJywgRnV0dXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZTogbm93KClcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGVzdEdyb3VwKHRlc3RlciwgdGVzdClcblxuICAgICAgICAgICAgICAgIGlmKHRoaXMuYWZ0ZXJGbikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIuZW1pdCgnYWZ0ZXInLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxuICAgICAgICAgICAgICAgICAgICB9KSlcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFmdGVyRm4uY2FsbCh0aGlzLCB0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWFuYWdlci5lbWl0KCdhZnRlckVuZCcsIEZ1dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHRlc3Rlci5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRlc3Rlci5ncm91cEVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgICAgIGNoZWNrR3JvdXBEb25lKHRlc3RlcilcblxuICAgICAgICAgICAgICAgIHJldHVybiB0ZXN0ZXJcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG9rOiBmdW5jdGlvbihzdWNjZXNzLCBhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9uZUFzc2VydHMgKz0gMVxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsIGFzc2VydCh0aGlzLCBzdWNjZXNzLCBhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSwgJ2Fzc2VydCcsIFwib2tcIikpLmRvbmUoKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVxOiBmdW5jdGlvbihhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9uZUFzc2VydHMgKz0gMVxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsIGFzc2VydCh0aGlzLCBleHBlY3RlZFZhbHVlID09PSBhY3R1YWxWYWx1ZSwgYWN0dWFsVmFsdWUsIGV4cGVjdGVkVmFsdWUsICdhc3NlcnQnLCBcImVxXCIpKS5kb25lKClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb3VudDogZnVuY3Rpb24obnVtYmVyKSB7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5jb3VudEV4cGVjdGVkICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IEVycm9yKFwiY291bnQgY2FsbGVkIG11bHRpcGxlIHRpbWVzIGZvciB0aGlzIHRlc3RcIilcbiAgICAgICAgICAgICAgICB0aGlzLmNvdW50RXhwZWN0ZWQgPSBudW1iZXJcblxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsYXNzZXJ0KHRoaXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBudW1iZXIsICdjb3VudCcsIFwiY291bnRcIikpLmRvbmUoKVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgYmVmb3JlOiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIGlmKHRoaXMuYmVmb3JlRm4gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJiZWZvcmUgY2FsbGVkIG11bHRpcGxlIHRpbWVzIGZvciB0aGlzIHRlc3RcIilcblxuICAgICAgICAgICAgICAgIHRoaXMuYmVmb3JlRm4gPSBmblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFmdGVyOiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIGlmKHRoaXMuYWZ0ZXJGbiAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcImFmdGVyIGNhbGxlZCBtdWx0aXBsZSB0aW1lcyBmb3IgdGhpcyB0ZXN0XCIpXG5cbiAgICAgICAgICAgICAgICB0aGlzLmFmdGVyRm4gPSBmblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgbG9nOiBmdW5jdGlvbigvKmFyZ3VtZW50cyovKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2xvZycsIEZ1dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGhpcy5pZCxcbiAgICAgICAgICAgICAgICAgICAgdGltZTogbm93KCksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlczogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKVxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgdGltZW91dDogZnVuY3Rpb24odCkge1xuICAgICAgICAgICAgICAgIHRpbWVvdXQodGhpcywgdCwgZmFsc2UpXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBlcnJvcjogZnVuY3Rpb24oaGFuZGxlcikge1xuICAgICAgICAgICAgICAgIHRoaXMudW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gaGFuZGxlclxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHdhcm5pbmc6IGZ1bmN0aW9uKGhhbmRsZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLndhcm5pbmdIYW5kbGVyID0gaGFuZGxlclxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgc291cmNlbWFwOiBmdW5jdGlvbihkb1NvdXJjZW1hcHBlcnkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvU291cmNlbWFwcGVyeSA9IGRvU291cmNlbWFwcGVyeVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICBmdW5jdGlvbiBhZnRlcldhaXRpbmdFbWl0SXNDb21wbGV0ZSh0aGF0LCBhc3NlcnRGdXR1cmUpIHtcbiAgICAgICAgcmV0dXJuIGFzc2VydEZ1dHVyZS5maW5hbGx5KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY2hlY2tHcm91cERvbmUodGhhdClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja0dyb3VwRG9uZShncm91cCkge1xuICAgICAgICBpZighZ3JvdXAuZG9uZUNhbGxlZCAmJiBncm91cC5ncm91cEVuZGVkID09PSB0cnVlXG4gICAgICAgICAgICAmJiAoKGdyb3VwLmNvdW50RXhwZWN0ZWQgPT09IHVuZGVmaW5lZCB8fCBncm91cC5jb3VudEV4cGVjdGVkIDw9IGdyb3VwLmRvbmVBc3NlcnRzK2dyb3VwLmRvbmVUZXN0cylcbiAgICAgICAgICAgICAgICAmJiBncm91cC5ydW5uaW5nVGVzdHMgPT09IGdyb3VwLmRvbmVUZXN0cylcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBncm91cC5kb25lQ2FsbGVkID0gdHJ1ZSAvLyBkb24ndCBjYWxsIHR3aWNlXG4gICAgICAgICAgICBncm91cC5vbkRvbmUoKVxuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkb25lKHVuaXRUZXN0ZXIpIHtcbiAgICAgICAgaWYodW5pdFRlc3Rlci5tYWluVGVzdGVyLmVuZGVkKSB7XG4gICAgICAgICAgICB1bml0VGVzdGVyLm1haW5UZXN0ZXIubWFuYWdlci5lbWl0KCdleGNlcHRpb24nLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgIHBhcmVudDogdW5pdFRlc3Rlci5tYWluVGVzdGVyLm1haW5TdWJUZXN0LmlkLFxuICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpLFxuICAgICAgICAgICAgICAgIGVycm9yOiBuZXdFcnJvcihcImRvbmUgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIChwcm9iYWJseSBiZWNhdXNlIHRoZSB0ZXN0IHRpbWVkIG91dCBiZWZvcmUgaXQgZmluaXNoZWQpXCIpXG4gICAgICAgICAgICB9KSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHRvKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRvKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0cyA9IFtdXG5cbiAgICAgICAgICAgIGVuZFRlc3QodW5pdFRlc3RlciwgJ25vcm1hbCcpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0aW1lb3V0KHVuaXRUZXN0ZXIsIHQsIHRoZURlZmF1bHQpIHtcbiAgICAgICAgdmFyIHRpbWVvdXRzID0gdW5pdFRlc3Rlci5tYWluVGVzdGVyLnRpbWVvdXRzXG5cbiAgICAgICAgdW5pdFRlc3Rlci50aW1lb3V0VGltZSA9IHRcblxuICAgICAgICBpZih0aGVEZWZhdWx0KSB7XG4gICAgICAgICAgICB0aW1lb3V0cy5kZWZhdWx0VGltZW91dCA9IHRydWVcbiAgICAgICAgfSBlbHNlIGlmKHVuaXRUZXN0ZXIgPT09IHVuaXRUZXN0ZXIubWFpblRlc3RlciAmJiB0aW1lb3V0cy5kZWZhdWx0VGltZW91dCkgeyAvLyBpZiBhIHRpbWVvdXQgaXMgdGhlIGRlZmF1bHQsIGl0IGNhbiBiZSBvdmVycmlkZGVuXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodW5pdFRlc3Rlci50aW1lb3V0SGFuZGxlKVxuICAgICAgICAgICAgcmVtb3ZlKHRpbWVvdXRzLCB1bml0VGVzdGVyLnRpbWVvdXRIYW5kbGUpXG4gICAgICAgICAgICB0aW1lb3V0cy5kZWZhdWx0VGltZW91dCA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgZGVsZXRlIHVuaXRUZXN0ZXIudGltZW91dEhhbmRsZVxuICAgICAgICB9XG5cbiAgICAgICAgc2V0VGVzdGVyVGltZW91dCh1bml0VGVzdGVyKVxuICAgIH1cblxuICAgIC8vIHNldHMgb3IgcmVzZXRzIGEgdGltZW91dCBmb3IgYSB1bml0VGVzdGVyXG4gICAgZnVuY3Rpb24gc2V0VGVzdGVyVGltZW91dCh1bml0VGVzdGVyKSB7XG4gICAgICAgIHZhciB0aW1lb3V0cyA9IHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0c1xuICAgICAgICBpZih1bml0VGVzdGVyLnRpbWVvdXRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHVuaXRUZXN0ZXIudGltZW91dEhhbmRsZSlcbiAgICAgICAgICAgIHJlbW92ZSh0aW1lb3V0cywgdW5pdFRlc3Rlci50aW1lb3V0SGFuZGxlKVxuICAgICAgICB9XG5cbiAgICAgICAgdW5pdFRlc3Rlci50aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJlbW92ZSh0aW1lb3V0cywgdW5pdFRlc3Rlci50aW1lb3V0SGFuZGxlKVxuICAgICAgICAgICAgZGVsZXRlIHVuaXRUZXN0ZXIudGltZW91dEhhbmRsZVxuXG4gICAgICAgICAgICBpZih0aW1lb3V0cy5sZW5ndGggPT09IDAgJiYgIXVuaXRUZXN0ZXIubWFpblRlc3Rlci5lbmRlZCkge1xuICAgICAgICAgICAgICAgIGVuZFRlc3QodW5pdFRlc3Rlci5tYWluVGVzdGVyLCAndGltZW91dCcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHVuaXRUZXN0ZXIudGltZW91dFRpbWUpXG5cbiAgICAgICAgdGltZW91dHMucHVzaCh1bml0VGVzdGVyLnRpbWVvdXRIYW5kbGUpXG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlcyBhbiBpdGVtIGZyb20gYW4gYXJyYXlcbiAgICBmdW5jdGlvbiByZW1vdmUoYXJyYXksIGl0ZW0pIHtcbiAgICAgICAgdmFyIGluZGV4ID0gYXJyYXkuaW5kZXhPZihpdGVtKVxuICAgICAgICBpZihpbmRleCAhPT0gLTEpXG4gICAgICAgICAgICBhcnJheS5zcGxpY2UoaW5kZXgsIDEpIC8vIG5vIGxvbmdlciB0aHJvd2luZyBFcnJvcihcIkl0ZW0gZG9lc24ndCBleGlzdCB0byByZW1vdmVcIikgaWYgdGhlcmUncyBub3RoaW5nIHRvIHJlbW92ZSAtIGluIHRoZSBjYXNlIHRoYXQgbWFpblRlc3Rlci50aW1lb3V0cyBnZXRzIHNldCBiYWNrIHRvIFtdICh3aGVuIGRvbmUpLCBpdCB3b24ndCBiZSB0aGVyZVxuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW5kVGVzdCh0aGF0LCB0eXBlKSB7XG4gICAgICAgIHRoYXQubWFpblRlc3Rlci5lbmRlZCA9IHRydWVcblxuICAgICAgICBpZih0aGF0Lm1haW5UZXN0ZXIgPT09IHRoYXQpIHsgLy8gaWYgaXRzIHRoZSBtYWluIHRlc3RlclxuICAgICAgICAgICAgdGhhdC5vbkRvbmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbihjYikge1xuICAgICAgICAgICAgICAgIGNiKClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyAvLyBzZXRUaW1lb3V0IGhlcmUgaXMgdG8gbWFrZSBpdCBzbyB0aGUgY3VycmVudGx5IHJ1bm5pbmcgdGhyZWFkbGV0IHRoYXQgY2F1c2VkIHRoZSB0ZXN0IHRvIGVuZCBjYW4gZmluaXNoIGJlZm9yZSB0aGUgZW5kIGV2ZW50IGlzIHNlbnRcbiAgICAgICAgICAgIHRoYXQubWFuYWdlci5lbWl0KCdlbmQnLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgICAgICAgdGltZTogbm93KClcbiAgICAgICAgICAgIH0pKVxuICAgICAgICB9LDApXG4gICAgfVxuXG4gICAgLy8gdHlwZSAtIGVpdGhlciBcImNvdW50XCIgb3IgXCJhc3NlcnRcIlxuICAgIGZ1bmN0aW9uIGFzc2VydCh0aGF0LCBzdWNjZXNzLCBhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSwgdHlwZSwgZnVuY3Rpb25OYW1lLyo9XCJva1wiKi8sIGxpbmVJbmZvLyo9ZHluYW1pYyovLCBzdGFja0luY3JlYXNlLyo9MCovKSB7XG4gICAgICAgIGlmKCFzdGFja0luY3JlYXNlKSBzdGFja0luY3JlYXNlID0gMVxuICAgICAgICBpZighZnVuY3Rpb25OYW1lKSBmdW5jdGlvbk5hbWUgPSBcIm9rXCJcbiAgICAgICAgaWYoIWxpbmVJbmZvKVxuICAgICAgICAgICAgdmFyIGxpbmVJbmZvRnV0dXJlID0gZ2V0TGluZUluZm9ybWF0aW9uKGZ1bmN0aW9uTmFtZSwgc3RhY2tJbmNyZWFzZSwgdGhhdC5kb1NvdXJjZW1hcHBlcnksIHRoYXQud2FybmluZ0hhbmRsZXIpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHZhciBsaW5lSW5mb0Z1dHVyZSA9IEZ1dHVyZShsaW5lSW5mbylcblxuICAgICAgICAvLyByZXN0ZSB0aW1lb3V0cyB1cCB0aGUgY2hhaW5cbiAgICAgICAgdmFyIGN1ciA9IHRoYXRcbiAgICAgICAgd2hpbGUoY3VyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHNldFRlc3RlclRpbWVvdXQoY3VyKVxuICAgICAgICAgICAgY3VyID0gY3VyLnBhcmVudFRlc3RlclxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVtaXREYXRhID0gbGluZUluZm9GdXR1cmUudGhlbihmdW5jdGlvbihsaW5lSW5mbykge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGxpbmVJbmZvXG4gICAgICAgICAgICByZXN1bHQudHlwZSA9ICdhc3NlcnQnXG4gICAgICAgICAgICBpZih0eXBlICE9PSdjb3VudCcpIHJlc3VsdC5zdWNjZXNzID0gc3VjY2VzcyA9PT0gdHJ1ZVxuXG4gICAgICAgICAgICBpZihhY3R1YWxWYWx1ZSAhPT0gdW5kZWZpbmVkKSAgICAgcmVzdWx0LmFjdHVhbCA9IGFjdHVhbFZhbHVlXG4gICAgICAgICAgICBpZihleHBlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQpICAgcmVzdWx0LmV4cGVjdGVkID0gZXhwZWN0ZWRWYWx1ZVxuXG4gICAgICAgICAgICByZXN1bHQucGFyZW50ID0gdGhhdC5pZFxuICAgICAgICAgICAgcmVzdWx0LnRpbWUgPSBub3coKVxuXG4gICAgICAgICAgIHJldHVybiBGdXR1cmUocmVzdWx0KVxuICAgICAgICB9KVxuXG4gICAgICAgIHJldHVybiB0aGF0Lm1hbmFnZXIuZW1pdCh0eXBlLCBlbWl0RGF0YSlcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGdldExpbmVJbmZvcm1hdGlvbihmdW5jdGlvbk5hbWUsIHN0YWNrSW5jcmVhc2UsIGRvU291cmNlbWFwcGVyeSwgd2FybmluZ0hhbmRsZXIpIHtcblxuICAgICAgICB2YXIgZmlsZSwgbGluZSwgY29sdW1uLCBsaW5laW5mbztcbiAgICAgICAgcmV0dXJuIG9wdGlvbnMuZ2V0TGluZUluZm8oc3RhY2tJbmNyZWFzZSkudGhlbihmdW5jdGlvbihpbmZvKXtcbiAgICAgICAgICAgIGxpbmVpbmZvID0gaW5mb1xuICAgICAgICAgICAgcmV0dXJuIGdldFNvdXJjZU1hcENvbnN1bWVyKGluZm8uZmlsZSwgd2FybmluZ0hhbmRsZXIpXG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpe1xuICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxuXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oc291cmNlTWFwQ29uc3VtZXIpIHtcbiAgICAgICAgICAgIGlmKHNvdXJjZU1hcENvbnN1bWVyICE9PSB1bmRlZmluZWQgJiYgZG9Tb3VyY2VtYXBwZXJ5KSB7XG5cbiAgICAgICAgICAgICAgICB2YXIgbWFwcGVkSW5mbyA9IGdldE1hcHBlZFNvdXJjZUluZm8oc291cmNlTWFwQ29uc3VtZXIsIGxpbmVpbmZvLmZpbGUsIGxpbmVpbmZvLmxpbmUsIGxpbmVpbmZvLmNvbHVtbilcbiAgICAgICAgICAgICAgICBmaWxlID0gbWFwcGVkSW5mby5maWxlXG4gICAgICAgICAgICAgICAgbGluZSA9IG1hcHBlZEluZm8ubGluZVxuICAgICAgICAgICAgICAgIGNvbHVtbiA9IG1hcHBlZEluZm8uY29sdW1uXG4gICAgICAgICAgICAgICAgdmFyIHNvdXJjZUxpbmVzID0gbWFwcGVkSW5mby5zb3VyY2VMaW5lc1xuXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpTGluZVNlYXJjaCA9ICFtYXBwZWRJbmZvLnVzaW5nT3JpZ2luYWxGaWxlIC8vIGRvbid0IHRvIGEgbXVsdGktbGluZSBzZWFyY2ggaWYgdGhlIHNvdXJjZSBoYXMgYmVlbiBtYXBwZWQgKHRoZSBmaWxlIG1pZ2h0IG5vdCBiZSBqYXZhc2NyaXB0KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmaWxlID0gbGluZWluZm8uZmlsZVxuICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5laW5mby5saW5lXG4gICAgICAgICAgICAgICAgY29sdW1uID0gbGluZWluZm8uY29sdW1uXG4gICAgICAgICAgICAgICAgdmFyIHNvdXJjZUxpbmVzID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpTGluZVNlYXJjaCA9IHRydWVcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGdldEZ1bmN0aW9uQ2FsbExpbmVzKHNvdXJjZUxpbmVzLCBmaWxlLCBmdW5jdGlvbk5hbWUsIGxpbmUsIG11bHRpTGluZVNlYXJjaCwgd2FybmluZ0hhbmRsZXIpXG5cbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoXCI8c291cmNlIG5vdCBhdmFpbGFibGU+XCIpXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oc291cmNlTGluZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoe1xuICAgICAgICAgICAgICAgIHNvdXJjZUxpbmVzOiBzb3VyY2VMaW5lcyxcbiAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLmJhc2VuYW1lKGZpbGUpLFxuICAgICAgICAgICAgICAgIGxpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgY29sdW1uOiBjb2x1bW5cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgbGluZSwgY29sdW1uLCBhbmQgZmlsZW5hbWUgbWFwcGVkIGZyb20gYSBzb3VyY2UgbWFwXG4gICAgLy8gYXBwcm9wcmlhdGVseSBoYW5kbGVzIGNhc2VzIHdoZXJlIHNvbWUgaW5mb3JtYXRpb24gaXMgbWlzc2luZ1xuICAgIGZ1bmN0aW9uIGdldE1hcHBlZFNvdXJjZUluZm8oc291cmNlTWFwQ29uc3VtZXIsIG9yaWdpbmFsRmlsZVBhdGgsIG9yaWdpbmFsTGluZSwgb3JpZ2luYWxDb2x1bW4sIG9yaWdpbmFsRnVuY3Rpb25OYW1lKSB7XG4gICAgICAgIHZhciBzb3VyY2VNYXBJbmZvID0gc291cmNlTWFwQ29uc3VtZXIub3JpZ2luYWxQb3NpdGlvbkZvcih7bGluZTpvcmlnaW5hbExpbmUsIGNvbHVtbjpvcmlnaW5hbENvbHVtbnx8MH0pICAgICAgIC8vIHRoZSAwIGlzIGZvciBicm93c2VycyAobGlrZSBmaXJlZm94KSB0aGF0IGRvbid0IG91dHB1dCBjb2x1bW4gbnVtYmVyc1xuICAgICAgICB2YXIgbGluZSA9IHNvdXJjZU1hcEluZm8ubGluZVxuICAgICAgICB2YXIgY29sdW1uID0gc291cmNlTWFwSW5mby5jb2x1bW5cbiAgICAgICAgdmFyIGZuID0gc291cmNlTWFwSW5mby5uYW1lXG5cbiAgICAgICAgaWYoc291cmNlTWFwSW5mby5zb3VyY2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHZhciByZWxhdGl2ZSA9IGlzUmVsYXRpdmUoc291cmNlTWFwSW5mby5zb3VyY2UpXG5cbiAgICAgICAgICAgIC8qIEkgZG9uJ3QgdGhpbmsgdGhpcyBpcyBuZWVkZWQgYW55IGxvbmdlciwgYW5kIHByb2JhYmx5IGlzbid0IGNvcnJlY3QgLSB0aGlzIHdhcyB3b3JraW5nIGFyb3VuZCBhbiBpc3N1ZSBpbiB3ZWJwYWNrOiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL3dlYnBhY2svd2VicGFjay9pc3N1ZXMvNTU5IGFuZCBodHRwczovL2dpdGh1Yi5jb20vd2VicGFjay93ZWJwYWNrL2lzc3Vlcy8yMzhcbiAgICAgICAgICAgIGlmKHNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZVJvb3QgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBJbmZvLnNvdXJjZSA9IHNvdXJjZU1hcEluZm8uc291cmNlLnJlcGxhY2Uoc291cmNlTWFwQ29uc3VtZXIuc291cmNlUm9vdCwgJycpIC8vIHJlbW92ZSBzb3VyY2VSb290XG4gICAgICAgICAgICB9Ki9cblxuICAgICAgICAgICAgaWYocmVsYXRpdmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZmlsZSA9IFVybC5yZXNvbHZlKG9yaWdpbmFsRmlsZVBhdGgsIHBhdGguYmFzZW5hbWUoc291cmNlTWFwSW5mby5zb3VyY2UpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZmlsZSA9IHNvdXJjZU1hcEluZm8uc291cmNlXG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsRmlsZSA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmaWxlID0gb3JpZ2luYWxGaWxlUGF0aFxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsRmlsZSA9IGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICBpZihmbiA9PT0gbnVsbCB8fCAhb3JpZ2luYWxGaWxlKSB7XG4gICAgICAgICAgICBmbiA9IG9yaWdpbmFsRnVuY3Rpb25OYW1lXG4gICAgICAgIH1cbiAgICAgICAgaWYobGluZSA9PT0gbnVsbCB8fCAhb3JpZ2luYWxGaWxlKSB7XG4gICAgICAgICAgICBsaW5lID0gb3JpZ2luYWxMaW5lXG4gICAgICAgICAgICBjb2x1bW4gPSBvcmlnaW5hbENvbHVtblxuICAgICAgICB9XG4gICAgICAgIGlmKGNvbHVtbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29sdW1uID0gdW5kZWZpbmVkXG4gICAgICAgIH1cblxuICAgICAgICBpZihmaWxlICE9IHVuZGVmaW5lZCAmJiBzb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzQ29udGVudCAhPSB1bmRlZmluZWQpIHsgLy8gaW50ZW50aW9uYWwgc2luZ2xlICE9XG4gICAgICAgICAgICB2YXIgaW5kZXggPSBzb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzLmluZGV4T2YoZmlsZSlcbiAgICAgICAgICAgIHZhciBzb3VyY2VMaW5lcyA9IHNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZXNDb250ZW50W2luZGV4XVxuICAgICAgICAgICAgaWYoc291cmNlTGluZXMgIT09IHVuZGVmaW5lZCkgc291cmNlTGluZXMgPSBzb3VyY2VMaW5lcy5zcGxpdCgnXFxuJylcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmaWxlOiBmaWxlLFxuICAgICAgICAgICAgZnVuY3Rpb246IGZuLFxuICAgICAgICAgICAgbGluZTogbGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uLFxuICAgICAgICAgICAgdXNpbmdPcmlnaW5hbEZpbGU6IG9yaWdpbmFsRmlsZSxcbiAgICAgICAgICAgIHNvdXJjZUxpbmVzOiBzb3VyY2VMaW5lc1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gZ2V0cyB0aGUgYWN0dWFsIGxpbmVzIG9mIHRoZSBjYWxsXG4gICAgLy8gaWYgbXVsdGlMaW5lU2VhcmNoIGlzIHRydWUsIGl0IGZpbmRzXG4gICAgZnVuY3Rpb24gZ2V0RnVuY3Rpb25DYWxsTGluZXMoc291cmNlc0NvbnRlbnQsIGZpbGVQYXRoLCBmdW5jdGlvbk5hbWUsIGxpbmVOdW1iZXIsIG11bHRpTGluZVNlYXJjaCwgd2FybmluZ0hhbmRsZXIpIHtcbiAgICAgICAgaWYoc291cmNlc0NvbnRlbnQgIT09ICB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBGdXR1cmUoc291cmNlc0NvbnRlbnQpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gb3B0aW9ucy5nZXRTY3JpcHRTb3VyY2VMaW5lcyhmaWxlUGF0aClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc291cmNlLmNhdGNoKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKGUpXG4gICAgICAgICAgICByZXR1cm4gRnV0dXJlKHVuZGVmaW5lZClcblxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKGZpbGVMaW5lcykge1xuICAgICAgICAgICAgaWYoZmlsZUxpbmVzICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgIHZhciBzdGFydExpbmUgPSBmaW5kU3RhcnRMaW5lKGZpbGVMaW5lcywgZnVuY3Rpb25OYW1lLCBsaW5lTnVtYmVyKVxuICAgICAgICAgICAgICAgIGlmKHN0YXJ0TGluZSA9PT0gJ2xpbmVPZkNvZGVOb3RGb3VuZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShcIjxsaW5lIG9mIGNvZGUgbm90IGZvdW5kIChwb3NzaWJseSBhbiBlcnJvcj8pPiBcIilcblxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihzdGFydExpbmUgIT09ICdzb3VyY2VOb3RBdmFpbGFibGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKG11bHRpTGluZVNlYXJjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShmaW5kRnVsbFNvdXJjZUxpbmUoZmlsZUxpbmVzLCBzdGFydExpbmUpKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShmaWxlTGluZXNbc3RhcnRMaW5lXS50cmltKCkpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBlbHNlXG4gICAgICAgICAgICByZXR1cm4gRnV0dXJlKFwiPHNvdXJjZSBub3QgYXZhaWxhYmxlPlwiKVxuXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgdmFyIHNvdXJjZU1hcENvbnN1bWVyQ2FjaGUgPSB7fSAvLyBhIG1hcCBmcm9tIGEgc2NyaXB0IHVybCB0byBhIGZ1dHVyZSBvZiBpdHMgU291cmNlTWFwQ29uc3VtZXIgb2JqZWN0IChudWxsIG1lYW5zIG5vIHNvdXJjZW1hcCBleGlzdHMpXG4gICAgZnVuY3Rpb24gZ2V0U291cmNlTWFwQ29uc3VtZXIodXJsLCB3YXJuaW5nSGFuZGxlcikge1xuICAgICAgICBpZihzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPSBvcHRpb25zLmdldFNvdXJjZU1hcE9iamVjdCh1cmwsIHdhcm5pbmdIYW5kbGVyKS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcE9iamVjdCkge1xuICAgICAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBPYmplY3QgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoc291cmNlTWFwT2JqZWN0LnZlcnNpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKG5ldyBFcnJvcihcIlNvdXJjZW1hcCBmb3IgXCIrdXJsK1wiIGRvZXNuJ3QgY29udGFpbiB0aGUgcmVxdWlyZWQgJ3ZlcnNpb24nIHByb3BlcnR5LiBBc3N1bWluZyB2ZXJzaW9uIDIuXCIpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU1hcE9iamVjdC52ZXJzaW9uID0gMiAvLyBhc3N1bWUgdmVyc2lvbiAyIHRvIG1ha2UgYnJvd3NlcmlmeSdzIGJyb2tlbiBzb3VyY2VtYXAgZm9ybWF0IHRoYXQgb21pdHMgdGhlIHZlcnNpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUobmV3IFNvdXJjZU1hcENvbnN1bWVyKHNvdXJjZU1hcE9iamVjdCkpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPSBGdXR1cmUodW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKGUpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc291cmNlTWFwQ29uc3VtZXJDYWNoZVt1cmxdXG4gICAgfVxuXG4gICAgLy8gdGFrZXMgYW4gZXhjZXB0aW9uIGFuZCByZXR1cm5zIGEgZnV0dXJlIGV4Y2VwdGlvbiB0aGF0IGhhcyBhIHN0YWNrdHJhY2Ugd2l0aCBzb3VyY2VtYXBwZWQgdHJhY2VsaW5lc1xuICAgIGZ1bmN0aW9uIG1hcEV4Y2VwdGlvbihleGNlcHRpb24sIHdhcm5pbmdIYW5kbGVyKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZihleGNlcHRpb24gaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICAgICAgICAgIHZhciBzdGFja3RyYWNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBvcHRpb25zLmdldEV4Y2VwdGlvbkluZm8oZXhjZXB0aW9uKS50aGVuKGZ1bmN0aW9uKHRyYWNlKXtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2t0cmFjZSA9IHRyYWNlXG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHNtY0Z1dHVyZXMgPSBbXVxuICAgICAgICAgICAgICAgICAgICBmb3IodmFyIG49MDsgbjx0cmFjZS5sZW5ndGg7IG4rKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYodHJhY2Vbbl0uZmlsZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc21jRnV0dXJlcy5wdXNoKGdldFNvdXJjZU1hcENvbnN1bWVyKHRyYWNlW25dLmZpbGUsIHdhcm5pbmdIYW5kbGVyKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc21jRnV0dXJlcy5wdXNoKEZ1dHVyZSh1bmRlZmluZWQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZS5hbGwoc21jRnV0dXJlcylcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcENvbnN1bWVycykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgQ3VzdG9tTWFwcGVkRXhjZXB0aW9uID0gcHJvdG8oTWFwcGVkRXhjZXB0aW9uLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgbmFtZSBzbyBpdCBsb29rcyBsaWtlIHRoZSBvcmlnaW5hbCBleGNlcHRpb24gd2hlbiBwcmludGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIHN1YmNsYXNzZXMgTWFwcGVkRXhjZXB0aW9uIHNvIHRoYXQgbmFtZSB3b24ndCBiZSBhbiBvd24tcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZSA9IGV4Y2VwdGlvbi5uYW1lXG4gICAgICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IEN1c3RvbU1hcHBlZEV4Y2VwdGlvbihleGNlcHRpb24sIHN0YWNrdHJhY2UsIHNvdXJjZU1hcENvbnN1bWVycykgIC8vIElFIGRvZXNuJ3QgZ2l2ZSBleGNlcHRpb25zIHN0YWNrIHRyYWNlcyB1bmxlc3MgdGhleSdyZSBhY3R1YWxseSB0aHJvd25cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaChtYXBwZWRFeGNldGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShtYXBwZWRFeGNldGlvbilcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUoZXhjZXB0aW9uKVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIHZhciBlcnJvckZ1dHVyZSA9IG5ldyBGdXR1cmVcbiAgICAgICAgICAgIGVycm9yRnV0dXJlLnRocm93KGUpXG4gICAgICAgICAgICByZXR1cm4gZXJyb3JGdXR1cmVcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGFuIGV4Y2VwdGlvbiB3aGVyZSB0aGUgc3RhY2t0cmFjZSdzIGZpbGVzIGFuZCBsaW5lcyBhcmUgbWFwcGVkIHRvIHRoZSBvcmlnaW5hbCBmaWxlICh3aGVuIGFwcGxpY2FibGUpXG4gICAgdmFyIE1hcHBlZEV4Y2VwdGlvbiA9IHByb3RvKEVycm9yLCBmdW5jdGlvbihzdXBlcmNsYXNzKSB7XG5cbiAgICAgICAgLy8gY29uc3RydWN0b3IuIFRha2VzIHRoZSBwYXJhbWV0ZXJzOlxuICAgICAgICAgICAgLy8gb3JpZ2luYWxFcnJvclxuICAgICAgICAgICAgLy8gdHJhY2VJbmZvIC0gYW4gYXJyYXkgd2hlcmUgZWFjaCBlbGVtZW50IGlzIGFuIG9iamVjdCBjb250YWluaW5nIGluZm9ybWF0aW9uIGFib3V0IHRoYXQgc3RhY2t0cmFjZSBsaW5lXG4gICAgICAgICAgICAvLyBzb3VyY2VNYXBDb25zdW1lcnMgLSBhbiBhcnJheSBvZiB0aGUgc2FtZSBsZW5ndGggYXMgdHJhY2VJbmZvIHdoZXJlIGVhY2ggZWxlbWVudCBpcyB0aGUgc291cmNlbWFwIGNvbnN1bWVyIGZvciB0aGUgY29ycmVzcG9uZGluZyBpbmZvIGluIHRyYWNlSW5mb1xuICAgICAgICB0aGlzLmluaXQgPSBmdW5jdGlvbihvcmlnaW5hbEVycm9yLCB0cmFjZUluZm8sIHNvdXJjZU1hcENvbnN1bWVycykge1xuICAgICAgICAgICAgc3VwZXJjbGFzcy5jYWxsKHRoaXMsIG9yaWdpbmFsRXJyb3IubWVzc2FnZSlcblxuICAgICAgICAgICAgZm9yKHZhciBwIGluIG9yaWdpbmFsRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZihPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChvcmlnaW5hbEVycm9yLCBwKSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twXSA9IG9yaWdpbmFsRXJyb3JbcF1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVycm9yIHNldHRpbmcgcHJvcGVydHkgXCIrcCsnIHdpdGggdmFsdWUgJytvcmlnaW5hbEVycm9yW3BdKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbmV3VHJhY2VMaW5lcyA9IFtdXG4gICAgICAgICAgICBmb3IodmFyIG49MDsgbjx0cmFjZUluZm8ubGVuZ3RoOyBuKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgaW5mbyA9IHRyYWNlSW5mb1tuXVxuICAgICAgICAgICAgICAgIGlmKHNvdXJjZU1hcENvbnN1bWVyc1tuXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZm8gPSBnZXRNYXBwZWRTb3VyY2VJbmZvKHNvdXJjZU1hcENvbnN1bWVyc1tuXSwgaW5mby5maWxlLCBpbmZvLmxpbmUsIGluZm8uY29sdW1uLCBpbmZvLmZ1bmN0aW9uKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBmaWxlTGluZUNvbHVtbiA9IGluZm8ubGluZVxuICAgICAgICAgICAgICAgIGlmKGluZm8uY29sdW1uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZUxpbmVDb2x1bW4gKz0gJzonK2luZm8uY29sdW1uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKGluZm8uZmlsZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVMaW5lQ29sdW1uID0gaW5mby5maWxlKyc6JytmaWxlTGluZUNvbHVtblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciB0cmFjZUxpbmUgPSBcIiAgICBhdCBcIlxuICAgICAgICAgICAgICAgIGlmKGluZm8uZnVuY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0cmFjZUxpbmUgKz0gaW5mby5mdW5jdGlvbisnICgnK2ZpbGVMaW5lQ29sdW1uKycpJ1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRyYWNlTGluZSArPSBmaWxlTGluZUNvbHVtblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG5ld1RyYWNlTGluZXMucHVzaCh0cmFjZUxpbmUpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnc3RhY2snLCB7XG4gICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubmFtZSsnOiAnK3RoaXMubWVzc2FnZSsnXFxuJytuZXdUcmFjZUxpbmVzLmpvaW4oJ1xcbicpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyBhdHRlbXB0cyB0byBmaW5kIHRoZSBmdWxsIGZ1bmN0aW9uIGNhbGwgZXhwcmVzc2lvbiAob3ZlciBtdWx0aXBsZSBsaW5lcykgZ2l2ZW4gdGhlIHNvdXJjZXMgbGluZXMgYW5kIGEgc3RhcnRpbmcgcG9pbnRcbiAgICBmdW5jdGlvbiBmaW5kRnVsbFNvdXJjZUxpbmUoZmlsZUxpbmVzLCBzdGFydExpbmUpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gW11cbiAgICAgICAgdmFyIHBhcmVuQ291bnQgPSAwXG4gICAgICAgIHZhciBtb2RlID0gMCAvLyBtb2RlIDAgZm9yIHBhcmVuIHNlYXJjaGluZywgbW9kZSAxIGZvciBkb3VibGUtcXVvdGUgc2VhcmNoaW5nLCBtb2RlIDIgZm9yIHNpbmdsZS1xdW90ZSBzZWFyY2hpbmdcbiAgICAgICAgdmFyIGxhc3RXYXNCYWNrc2xhc2ggPSBmYWxzZSAvLyB1c2VkIGZvciBxdW90ZSBzZWFyY2hpbmdcbiAgICAgICAgZm9yKHZhciBuPXN0YXJ0TGluZTsgbjxmaWxlTGluZXMubGVuZ3RoOyBuKyspIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gZmlsZUxpbmVzW25dXG4gICAgICAgICAgICBsaW5lcy5wdXNoKGxpbmUudHJpbSgpKVxuXG4gICAgICAgICAgICBmb3IodmFyIGk9MDsgaTxsaW5lLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGMgPSBsaW5lW2ldXG5cbiAgICAgICAgICAgICAgICBpZihtb2RlID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKGMgPT09ICcoJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW5Db3VudCsrXG4gICAgICAgICAgICAgICAgICAgICAgICAvL2lmKHBhcmVuQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKSAvLyBkb25lXG4gICAgICAgICAgICAgICAgICAgICAgICAvL31cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmKGMgPT09ICcpJyAmJiBwYXJlbkNvdW50ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW5Db3VudC0tXG4gICAgICAgICAgICAgICAgICAgICAgICBpZihwYXJlbkNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpIC8vIGRvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmKGMgPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPSAxXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjID09PSBcIidcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA9IDJcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihtb2RlID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKGMgPT09ICdcIicgJiYgIWxhc3RXYXNCYWNrc2xhc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPSAwXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBsYXN0V2FzQmFja3NsYXNoID0gYz09PSdcXFxcJ1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7IC8vIG1vZGUgPT09IDJcbiAgICAgICAgICAgICAgICAgICAgaWYoYyA9PT0gXCInXCIgJiYgIWxhc3RXYXNCYWNrc2xhc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPSAwXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBsYXN0V2FzQmFja3NsYXNoID0gYz09PSdcXFxcJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKSAvLyBpZiBpdCBnZXRzIGhlcmUsIHNvbWV0aGluZyBtaW5vciB3ZW50IHdyb25nXG4gICAgfVxuXG4gICAgLy8gZmluZHMgdGhlIGxpbmUgYSBmdW5jdGlvbiBzdGFydGVkIG9uIGdpdmVuIHRoZSBmaWxlJ3MgbGluZXMsIGFuZCB0aGUgc3RhY2sgdHJhY2UgbGluZSBudW1iZXIgKGFuZCBmdW5jdGlvbiBuYW1lKVxuICAgIC8vIHJldHVybnMgdW5kZWZpbmVkIGlmIHNvbWV0aGluZyB3ZW50IHdyb25nIGZpbmRpbmcgdGhlIHN0YXJ0bGluZVxuICAgIGZ1bmN0aW9uIGZpbmRTdGFydExpbmUoZmlsZUxpbmVzLCBmdW5jdGlvbk5hbWUsIGxpbmVOdW1iZXIpIHtcbiAgICAgICAgdmFyIHN0YXJ0TGluZSA9IGxpbmVOdW1iZXIgLSAxXG4gICAgICAgIHdoaWxlKHRydWUpIHtcbiAgICAgICAgICAgIGlmKHN0YXJ0TGluZSA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2xpbmVPZkNvZGVOb3RGb3VuZCcgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmcgaWYgdGhpcyBpcyBiZWluZyByZXR1cm5lZCAodGhlIGZ1bmN0aW9uTmFtZSB3YXNuJ3QgZm91bmQgYWJvdmUgLSBtZWFucyB5b3UgZGlkbid0IGdldCB0aGUgZnVuY3Rpb24gbmFtZSByaWdodClcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGxpbmUgPSBmaWxlTGluZXNbc3RhcnRMaW5lXVxuICAgICAgICAgICAgaWYobGluZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdzb3VyY2VOb3RBdmFpbGFibGUnXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vbGluZXMucHVzaChsaW5lLnRyaW0oKSlcbiAgICAgICAgICAgIHZhciBjb250YWluc0Z1bmN0aW9uID0gbGluZS5pbmRleE9mKGZ1bmN0aW9uTmFtZSkgIT09IC0xXG4gICAgICAgICAgICBpZihjb250YWluc0Z1bmN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXJ0TGluZVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGFydExpbmUtLVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ3JvdXBpZCgpIHtcbiAgICAgICAgZ3JvdXBpZC5uZXh0KytcbiAgICAgICAgcmV0dXJuIGdyb3VwaWQubmV4dFxuICAgIH1cbiAgICBncm91cGlkLm5leHQgPSAtMVxuXG4gICAgLy8gcmV0dXJucyBhIFVuaXggVGltZXN0YW1wIGZvciBub3dcbiAgICBmdW5jdGlvbiBub3coKSB7XG4gICAgICAgIHJldHVybiAobmV3IERhdGUoKSkuZ2V0VGltZSgpXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGVzdDogVW5pdFRlc3RcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG5ld0Vycm9yKG1lc3NhZ2UsIEVycm9yUHJvdG90eXBlKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpIC8vIElFIG5lZWRzIGFuIGV4Y2VwdGlvbiB0byBiZSBhY3R1YWxseSB0aHJvd24gdG8gZ2V0IGEgc3RhY2sgdHJhY2UgcHJvcGVydHlcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGVcbiAgICB9XG59XG4iLCJ2YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc1JlbGF0aXZlKHApIHtcclxuICAgIHZhciBub3JtYWwgPSBwYXRoLm5vcm1hbGl6ZShwKVxyXG4gICAgdmFyIGFic29sdXRlID0gcGF0aC5yZXNvbHZlKHApXHJcbiAgICByZXR1cm4gbm9ybWFsICE9IGFic29sdXRlICYmIHAuaW5kZXhPZignOi8vJykgPT09IC0xLy8gc2Vjb25kIHBhcnQgZm9yIHVybHNcclxufSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmV0dXJuUmVzdWx0cyh1bml0VGVzdE9iamVjdCkge1xyXG5cclxuICAgIHZhciByZXN1bHRzO1xyXG4gICAgdmFyIGdyb3VwcyA9IHt9XHJcbiAgICB2YXIgZ3JvdXBNZXRhZGF0YSA9IHt9XHJcblxyXG4gICAgdmFyIHByaW1hcnlHcm91cDtcclxuICAgIHZhciBlbmRlZCA9IGZhbHNlXHJcblxyXG4gICAgdW5pdFRlc3RPYmplY3QuZXZlbnRzKHtcclxuICAgICAgICBncm91cDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICB2YXIgZyA9IHtcclxuICAgICAgICAgICAgICAgcGFyZW50OiBlLnBhcmVudCxcclxuICAgICAgICAgICAgICAgaWQ6IGUuaWQsICAgICAgICAgICAgICAvLyBhIHVuaXF1ZSBpZCBmb3IgdGhlIHRlc3QgZ3JvdXBcclxuICAgICAgICAgICAgICAgdHlwZTogJ2dyb3VwJywgICAgICAgICAvLyBpbmRpY2F0ZXMgYSB0ZXN0IGdyb3VwIChlaXRoZXIgYSBgVW5pdC50ZXN0YCBjYWxsIG9yIGB0aGlzLnRlc3RgKVxyXG4gICAgICAgICAgICAgICBuYW1lOiBlLm5hbWUsICAgICAgICAgIC8vIHRoZSBuYW1lIG9mIHRoZSB0ZXN0XHJcbiAgICAgICAgICAgICAgIHJlc3VsdHM6IFtdLCAgICAgICAgICAgLy8gQW4gYXJyYXkgb2YgdGVzdCByZXN1bHRzLCB3aGljaCBjYW4gYmUgb2YgYW4gYFVuaXRUZXN0YCBSZXN1bHQgVHlwZXNcclxuICAgICAgICAgICAgICAgZXhjZXB0aW9uczogW10sICAgICAgICAvLyBBbiBhcnJheSBvZiB1bmNhdWdodCBleGNlcHRpb25zIHRocm93biBpbiB0aGUgdGVzdCxcclxuICAgICAgICAgICAgICAgdGltZTogZS50aW1lLFxyXG4gICAgICAgICAgICAgICBkdXJhdGlvbjogMCAgICAgICAgICAgIC8vIHRoZSBkdXJhdGlvbiBvZiB0aGUgdGVzdCBmcm9tIGl0cyBzdGFydCB0aWwgdGhlIGxhc3QgdGVzdCBhY3Rpb24gKGFzc2VydCwgbG9nLCBldGMpXHJcbiAgICAgICAgICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgICBpbmNsdWRpbmcgYXN5bmNocm9ub3VzIHBhcnRzIGFuZCBpbmNsdWRpbmcgc3VidGVzdHNcclxuICAgICAgICAgICAgICAgLy9zeW5jRHVyYXRpb246IF8sICAgICAgLy8gdGhlIHN5bmNocm9ub3VzIGR1cmF0aW9uIG9mIHRoZSB0ZXN0IChub3QgaW5jbHVkaW5nIGFueSBhc3luY2hyb25vdXMgcGFydHMpXHJcbiAgICAgICAgICAgICAgIC8vdG90YWxTeW5jRHVyYXRpb246IF8gIC8vIHN5bmNEdXJhdGlvbiBwbHVzIHRoZSBiZWZvcmUgYW5kIGFmdGVyIChpZiBhcHBsaWNhYmxlKVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihwcmltYXJ5R3JvdXAgPT09IHVuZGVmaW5lZCkgcHJpbWFyeUdyb3VwID0gZ1xyXG5cclxuICAgICAgICAgICAgZ3JvdXBzW2UuaWRdID0gZ1xyXG4gICAgICAgICAgICBncm91cE1ldGFkYXRhW2UuaWRdID0ge31cclxuICAgICAgICAgICAgaWYoZS5wYXJlbnQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0cyA9IGdcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0ucmVzdWx0cy5wdXNoKGcpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIGFzc2VydDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBlLnR5cGUgPSAnYXNzZXJ0J1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLnJlc3VsdHMucHVzaChlKVxyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUucGFyZW50LCBlLnRpbWUpXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb3VudDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBlLnR5cGUgPSAnYXNzZXJ0J1xyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUucGFyZW50LCBlLnRpbWUpXHJcblxyXG4gICAgICAgICAgICBncm91cE1ldGFkYXRhW2UucGFyZW50XS5jb3VudEluZm8gPSBlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBleGNlcHRpb246IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZ3JvdXBzW2UucGFyZW50XS5leGNlcHRpb25zLnB1c2goZS5lcnJvcilcclxuICAgICAgICAgICAgc2V0R3JvdXBEdXJhdGlvbihlLnBhcmVudCwgZS50aW1lKVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbG9nOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGUudHlwZSA9ICdsb2cnXHJcbiAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0ucmVzdWx0cy5wdXNoKGUpXHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24oZS5wYXJlbnQsIGUudGltZSlcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJlZm9yZTogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmJlZm9yZVN0YXJ0ID0gZS50aW1lXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZnRlcjogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmFmdGVyU3RhcnQgPSBlLnRpbWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJlZm9yZUVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmJlZm9yZUR1cmF0aW9uID0gZS50aW1lIC0gZ3JvdXBzW2UucGFyZW50XS5iZWZvcmVTdGFydFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYWZ0ZXJFbmQ6IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZ3JvdXBzW2UucGFyZW50XS5hZnRlckR1cmF0aW9uID0gZS50aW1lIC0gZ3JvdXBzW2UucGFyZW50XS5hZnRlclN0YXJ0XHJcbiAgICAgICAgfSxcclxuICAgICAgICBncm91cEVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUuaWQsIGUudGltZSlcclxuICAgICAgICB9LFxyXG4gICAgICAgIGVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBwcmltYXJ5R3JvdXAudGltZW91dCA9IGUudHlwZSA9PT0gJ3RpbWVvdXQnXHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24ocHJpbWFyeUdyb3VwLmlkLCBlLnRpbWUpXHJcblxyXG4gICAgICAgICAgICAvLyBtYWtlIHRoZSBjb3VudCBhc3NlcnRpb25zXHJcbiAgICAgICAgICAgIGVhY2hUZXN0KHByaW1hcnlHcm91cCwgZnVuY3Rpb24oc3VidGVzdCwgcGFyZW50dGVzdCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvdW50SW5mbyA9IGdyb3VwTWV0YWRhdGFbc3VidGVzdC5pZF0uY291bnRJbmZvXHJcbiAgICAgICAgICAgICAgICBpZihjb3VudEluZm8gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBpbmZvID0gY291bnRJbmZvXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFjdHVhbENvdW50ID0gMFxyXG4gICAgICAgICAgICAgICAgICAgIHN1YnRlc3QucmVzdWx0cy5mb3JFYWNoKGZ1bmN0aW9uKGEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoYS50eXBlID09PSAnYXNzZXJ0JyB8fCBhLnR5cGUgPT09ICdncm91cCcpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxDb3VudCsrXHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgc3VidGVzdC5yZXN1bHRzLnNwbGljZSgwLDAse1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHN1YnRlc3QuaWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdhc3NlcnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBhY3R1YWxDb3VudCA9PT0gaW5mby5leHBlY3RlZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZTogaW5mby50aW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VMaW5lczogaW5mby5zb3VyY2VMaW5lcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZTogaW5mby5maWxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiBpbmZvLmxpbmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjogaW5mby5jb2x1bW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBpbmZvLmV4cGVjdGVkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWw6IGFjdHVhbENvdW50XHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcblxyXG4gICAgZnVuY3Rpb24gc2V0R3JvdXBEdXJhdGlvbihncm91cGlkLCB0aW1lKSB7XHJcbiAgICAgICAgdmFyIG5ld0R1cmF0aW9uID0gdGltZSAtIGdyb3Vwc1tncm91cGlkXS50aW1lXHJcbiAgICAgICAgaWYobmV3RHVyYXRpb24gPiBncm91cHNbZ3JvdXBpZF0uZHVyYXRpb24pIHtcclxuICAgICAgICAgICAgZ3JvdXBzW2dyb3VwaWRdLmR1cmF0aW9uID0gbmV3RHVyYXRpb25cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKGdyb3Vwc1tncm91cGlkXS5wYXJlbnQpIHtcclxuICAgICAgICAgICAgc2V0R3JvdXBEdXJhdGlvbihncm91cHNbZ3JvdXBpZF0ucGFyZW50LCB0aW1lKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVzdWx0c1xyXG59XHJcblxyXG5cclxuLy8gaXRlcmF0ZXMgdGhyb3VnaCB0aGUgdGVzdHMgYW5kIHN1YnRlc3RzIGxlYXZlcyBmaXJzdCAoZGVwdGggZmlyc3QpXHJcbmZ1bmN0aW9uIGVhY2hUZXN0KHRlc3QsIGNhbGxiYWNrLCBwYXJlbnQpIHtcclxuICAgIHRlc3QucmVzdWx0cy5mb3JFYWNoKGZ1bmN0aW9uKHJlc3VsdCkge1xyXG4gICAgICAgIGlmKHJlc3VsdC50eXBlID09PSAnZ3JvdXAnKSB7XHJcbiAgICAgICAgICAgIGVhY2hUZXN0KHJlc3VsdCwgY2FsbGJhY2ssIHRlc3QpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuXHJcbiAgICBjYWxsYmFjayh0ZXN0LCBwYXJlbnQpXHJcbn0iXX0=
(30)
});
