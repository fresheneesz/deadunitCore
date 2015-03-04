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

},{"trimArguments":3}],3:[function(_dereq_,module,exports){
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
},{}],4:[function(_dereq_,module,exports){
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
},{"trimArguments":5}],5:[function(_dereq_,module,exports){
module.exports=_dereq_(3)
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

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

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

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
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

}).call(this,_dereq_("D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"))
},{"D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":6}],8:[function(_dereq_,module,exports){
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

},{"punycode":8,"querystring":11}],13:[function(_dereq_,module,exports){
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
},{}],14:[function(_dereq_,module,exports){
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

},{}],15:[function(_dereq_,module,exports){
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

},{}],16:[function(_dereq_,module,exports){
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

},{"resolve-url":14,"source-map-url":15}],17:[function(_dereq_,module,exports){
/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = _dereq_('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = _dereq_('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = _dereq_('./source-map/source-node').SourceNode;

},{"./source-map/source-map-consumer":22,"./source-map/source-map-generator":23,"./source-map/source-node":24}],18:[function(_dereq_,module,exports){
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

},{"./util":25,"amdefine":26}],19:[function(_dereq_,module,exports){
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

},{"./base64":20,"amdefine":26}],20:[function(_dereq_,module,exports){
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

},{"amdefine":26}],21:[function(_dereq_,module,exports){
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

},{"amdefine":26}],22:[function(_dereq_,module,exports){
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

},{"./array-set":18,"./base64-vlq":19,"./binary-search":21,"./util":25,"amdefine":26}],23:[function(_dereq_,module,exports){
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

},{"./array-set":18,"./base64-vlq":19,"./util":25,"amdefine":26}],24:[function(_dereq_,module,exports){
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

},{"./source-map-generator":23,"./util":25,"amdefine":26}],25:[function(_dereq_,module,exports){
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

},{"amdefine":26}],26:[function(_dereq_,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 0.1.0 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
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
                process.nextTick(function () {
                    callback.apply(null, deps);
                });
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

}).call(this,_dereq_("D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"),"/..\\node_modules\\source-map\\node_modules\\amdefine\\amdefine.js")
},{"D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":6,"path":7}],27:[function(_dereq_,module,exports){
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define('error-stack-parser', ['stackframe'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(_dereq_('stackframe'));
    } else {
        root.ErrorStackParser = factory(root.StackFrame);
    }
}(this, function ErrorStackParser(StackFrame) {
    'use strict';

    var FIREFOX_SAFARI_STACK_REGEXP = /\S+\:\d+/;
    var CHROME_IE_STACK_REGEXP = /\s+at /;

    return {
        /**
         * Given an Error object, extract the most information from it.
         * @param error {Error}
         * @return Array[StackFrame]
         */
        parse: function ErrorStackParser$$parse(error) {
            if (typeof error.stacktrace !== 'undefined' || typeof error['opera#sourceloc'] !== 'undefined') {
                return this.parseOpera(error);
            } else if (error.stack && error.stack.match(CHROME_IE_STACK_REGEXP)) {
                return this.parseV8OrIE(error);
            } else if (error.stack && error.stack.match(FIREFOX_SAFARI_STACK_REGEXP)) {
                return this.parseFFOrSafari(error);
            } else {
                throw new Error('Cannot parse given Error object');
            }
        },

        /**
         * Separate line and column numbers from a URL-like string.
         * @param urlLike String
         * @return Array[String]
         */
        extractLocation: function ErrorStackParser$$extractLocation(urlLike) {
            // Guard against strings like "(native)"
            if (urlLike.indexOf(':') === -1) {
                return [];
            }

            var locationParts = urlLike.split(':');
            var lastNumber = locationParts.pop();
            var possibleNumber = locationParts[locationParts.length - 1];
            if (!isNaN(parseFloat(possibleNumber)) && isFinite(possibleNumber)) {
                var lineNumber = locationParts.pop();
                return [locationParts.join(':'), lineNumber, lastNumber];
            } else {
                return [locationParts.join(':'), lastNumber, undefined];
            }
        },

        parseV8OrIE: function ErrorStackParser$$parseV8OrIE(error) {
            return error.stack.split('\n').slice(1).map(function (line) {
                var tokens = line.replace(/^\s+/, '').split(/\s+/).slice(1);
                var locationParts = this.extractLocation(tokens.pop().replace(/[\(\)\s]/g, ''));
                var functionName = (!tokens[0] || tokens[0] === 'Anonymous') ? undefined : tokens[0];
                return new StackFrame(functionName, undefined, locationParts[0], locationParts[1], locationParts[2]);
            }, this);
        },

        parseFFOrSafari: function ErrorStackParser$$parseFFOrSafari(error) {
            return error.stack.split('\n').filter(function (line) {
                return !!line.match(FIREFOX_SAFARI_STACK_REGEXP);
            }, this).map(function (line) {
                var tokens = line.split('@');
                var locationParts = this.extractLocation(tokens.pop());
                var functionName = tokens.shift() || undefined;
                return new StackFrame(functionName, undefined, locationParts[0], locationParts[1], locationParts[2]);
            }, this);
        },

        parseOpera: function ErrorStackParser$$parseOpera(e) {
            if (!e.stacktrace || (e.message.indexOf('\n') > -1 &&
                e.message.split('\n').length > e.stacktrace.split('\n').length)) {
                return this.parseOpera9(e);
            } else if (!e.stack) {
                return this.parseOpera10(e);
            } else {
                return this.parseOpera11(e);
            }
        },

        parseOpera9: function ErrorStackParser$$parseOpera9(e) {
            var lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
            var lines = e.message.split('\n');
            var result = [];

            for (var i = 2, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(new StackFrame(undefined, undefined, match[2], match[1]));
                }
            }

            return result;
        },

        parseOpera10: function ErrorStackParser$$parseOpera10(e) {
            var lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
            var lines = e.stacktrace.split('\n');
            var result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(new StackFrame(match[3] || undefined, undefined, match[2], match[1]));
                }
            }

            return result;
        },

        // Opera 10.65+ Error.stack very similar to FF/Safari
        parseOpera11: function ErrorStackParser$$parseOpera11(error) {
            return error.stack.split('\n').filter(function (line) {
                return !!line.match(FIREFOX_SAFARI_STACK_REGEXP) &&
                    !line.match(/^Error created at/);
            }, this).map(function (line) {
                var tokens = line.split('@');
                var locationParts = this.extractLocation(tokens.pop());
                var functionCall = (tokens.shift() || '');
                var functionName = functionCall
                        .replace(/<anonymous function(: (\w+))?>/, '$2')
                        .replace(/\([^\)]*\)/g, '') || undefined;
                var argsRaw;
                if (functionCall.match(/\(([^\)]*)\)/)) {
                    argsRaw = functionCall.replace(/^[^\(]+\(([^\)]*)\)$/, '$1');
                }
                var args = (argsRaw === undefined || argsRaw === '[arguments not available]') ? undefined : argsRaw.split(',');
                return new StackFrame(functionName, args, locationParts[0], locationParts[1], locationParts[2]);
            }, this);
        }
    };
}));


},{"stackframe":28}],28:[function(_dereq_,module,exports){
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define('stackframe', [], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.StackFrame = factory();
    }
}(this, function () {
    'use strict';
    function _isNumber(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    function StackFrame(functionName, args, fileName, lineNumber, columnNumber) {
        if (functionName !== undefined) {
            this.setFunctionName(functionName);
        }
        if (args !== undefined) {
            this.setArgs(args);
        }
        if (fileName !== undefined) {
            this.setFileName(fileName);
        }
        if (lineNumber !== undefined) {
            this.setLineNumber(lineNumber);
        }
        if (columnNumber !== undefined) {
            this.setColumnNumber(columnNumber);
        }
    }

    StackFrame.prototype = {
        getFunctionName: function () {
            return this.functionName;
        },
        setFunctionName: function (v) {
            this.functionName = String(v);
        },

        getArgs: function () {
            return this.args;
        },
        setArgs: function (v) {
            if (Object.prototype.toString.call(v) !== '[object Array]') {
                throw new TypeError('Args must be an Array');
            }
            this.args = v;
        },

        // NOTE: Property name may be misleading as it includes the path,
        // but it somewhat mirrors V8's JavaScriptStackTraceApi
        // https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi and Gecko's
        // http://mxr.mozilla.org/mozilla-central/source/xpcom/base/nsIException.idl#14
        getFileName: function () {
            return this.fileName;
        },
        setFileName: function (v) {
            this.fileName = String(v);
        },

        getLineNumber: function () {
            return this.lineNumber;
        },
        setLineNumber: function (v) {
            if (!_isNumber(v)) {
                throw new TypeError('Line Number must be a Number');
            }
            this.lineNumber = Number(v);
        },

        getColumnNumber: function () {
            return this.columnNumber;
        },
        setColumnNumber: function (v) {
            if (!_isNumber(v)) {
                throw new TypeError('Column Number must be a Number');
            }
            this.columnNumber = Number(v);
        },

        toString: function() {
            var functionName = this.getFunctionName() || '{anonymous}';
            var args = '(' + (this.getArgs() || []).join(',') + ')';
            var fileName = this.getFileName() ? ('@' + this.getFileName()) : '';
            var lineNumber = _isNumber(this.getLineNumber()) ? (':' + this.getLineNumber()) : '';
            var columnNumber = _isNumber(this.getColumnNumber()) ? (':' + this.getColumnNumber()) : '';
            return functionName + args + fileName + lineNumber + columnNumber;
        }
    };

    return StackFrame;
}));

},{}],29:[function(_dereq_,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   2.0.1
 */

(function() {
    "use strict";

    function $$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function $$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function $$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var $$utils$$_isArray;

    if (!Array.isArray) {
      $$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      $$utils$$_isArray = Array.isArray;
    }

    var $$utils$$isArray = $$utils$$_isArray;
    var $$utils$$now = Date.now || function() { return new Date().getTime(); };
    function $$utils$$F() { }

    var $$utils$$o_create = (Object.create || function (o) {
      if (arguments.length > 1) {
        throw new Error('Second argument not supported');
      }
      if (typeof o !== 'object') {
        throw new TypeError('Argument must be an object');
      }
      $$utils$$F.prototype = o;
      return new $$utils$$F();
    });

    var $$asap$$len = 0;

    var $$asap$$default = function asap(callback, arg) {
      $$asap$$queue[$$asap$$len] = callback;
      $$asap$$queue[$$asap$$len + 1] = arg;
      $$asap$$len += 2;
      if ($$asap$$len === 2) {
        // If len is 1, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        $$asap$$scheduleFlush();
      }
    };

    var $$asap$$browserGlobal = (typeof window !== 'undefined') ? window : {};
    var $$asap$$BrowserMutationObserver = $$asap$$browserGlobal.MutationObserver || $$asap$$browserGlobal.WebKitMutationObserver;

    // test for web worker but not in IE10
    var $$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function $$asap$$useNextTick() {
      return function() {
        process.nextTick($$asap$$flush);
      };
    }

    function $$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new $$asap$$BrowserMutationObserver($$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function $$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = $$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function $$asap$$useSetTimeout() {
      return function() {
        setTimeout($$asap$$flush, 1);
      };
    }

    var $$asap$$queue = new Array(1000);

    function $$asap$$flush() {
      for (var i = 0; i < $$asap$$len; i+=2) {
        var callback = $$asap$$queue[i];
        var arg = $$asap$$queue[i+1];

        callback(arg);

        $$asap$$queue[i] = undefined;
        $$asap$$queue[i+1] = undefined;
      }

      $$asap$$len = 0;
    }

    var $$asap$$scheduleFlush;

    // Decide what async method to use to triggering processing of queued callbacks:
    if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
      $$asap$$scheduleFlush = $$asap$$useNextTick();
    } else if ($$asap$$BrowserMutationObserver) {
      $$asap$$scheduleFlush = $$asap$$useMutationObserver();
    } else if ($$asap$$isWorker) {
      $$asap$$scheduleFlush = $$asap$$useMessageChannel();
    } else {
      $$asap$$scheduleFlush = $$asap$$useSetTimeout();
    }

    function $$$internal$$noop() {}
    var $$$internal$$PENDING   = void 0;
    var $$$internal$$FULFILLED = 1;
    var $$$internal$$REJECTED  = 2;
    var $$$internal$$GET_THEN_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$selfFullfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function $$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.')
    }

    function $$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        $$$internal$$GET_THEN_ERROR.error = error;
        return $$$internal$$GET_THEN_ERROR;
      }
    }

    function $$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function $$$internal$$handleForeignThenable(promise, thenable, then) {
       $$asap$$default(function(promise) {
        var sealed = false;
        var error = $$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            $$$internal$$resolve(promise, value);
          } else {
            $$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          $$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          $$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function $$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, thenable._result);
      } else if (promise._state === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, thenable._result);
      } else {
        $$$internal$$subscribe(thenable, undefined, function(value) {
          $$$internal$$resolve(promise, value);
        }, function(reason) {
          $$$internal$$reject(promise, reason);
        });
      }
    }

    function $$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        $$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = $$$internal$$getThen(maybeThenable);

        if (then === $$$internal$$GET_THEN_ERROR) {
          $$$internal$$reject(promise, $$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          $$$internal$$fulfill(promise, maybeThenable);
        } else if ($$utils$$isFunction(then)) {
          $$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          $$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function $$$internal$$resolve(promise, value) {
      if (promise === value) {
        $$$internal$$reject(promise, $$$internal$$selfFullfillment());
      } else if ($$utils$$objectOrFunction(value)) {
        $$$internal$$handleMaybeThenable(promise, value);
      } else {
        $$$internal$$fulfill(promise, value);
      }
    }

    function $$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      $$$internal$$publish(promise);
    }

    function $$$internal$$fulfill(promise, value) {
      if (promise._state !== $$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = $$$internal$$FULFILLED;

      if (promise._subscribers.length === 0) {
      } else {
        $$asap$$default($$$internal$$publish, promise);
      }
    }

    function $$$internal$$reject(promise, reason) {
      if (promise._state !== $$$internal$$PENDING) { return; }
      promise._state = $$$internal$$REJECTED;
      promise._result = reason;

      $$asap$$default($$$internal$$publishRejection, promise);
    }

    function $$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + $$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + $$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        $$asap$$default($$$internal$$publish, parent);
      }
    }

    function $$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          $$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function $$$internal$$ErrorObject() {
      this.error = null;
    }

    var $$$internal$$TRY_CATCH_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        $$$internal$$TRY_CATCH_ERROR.error = e;
        return $$$internal$$TRY_CATCH_ERROR;
      }
    }

    function $$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = $$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = $$$internal$$tryCatch(callback, detail);

        if (value === $$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          $$$internal$$reject(promise, $$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== $$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        $$$internal$$resolve(promise, value);
      } else if (failed) {
        $$$internal$$reject(promise, error);
      } else if (settled === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, value);
      } else if (settled === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, value);
      }
    }

    function $$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          $$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          $$$internal$$reject(promise, reason);
        });
      } catch(e) {
        $$$internal$$reject(promise, e);
      }
    }

    function $$$enumerator$$makeSettledResult(state, position, value) {
      if (state === $$$internal$$FULFILLED) {
        return {
          state: 'fulfilled',
          value: value
        };
      } else {
        return {
          state: 'rejected',
          reason: value
        };
      }
    }

    function $$$enumerator$$Enumerator(Constructor, input, abortOnReject, label) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor($$$internal$$noop, label);
      this._abortOnReject = abortOnReject;

      if (this._validateInput(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._init();

        if (this.length === 0) {
          $$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            $$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        $$$internal$$reject(this.promise, this._validationError());
      }
    }

    $$$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return $$utils$$isArray(input);
    };

    $$$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    $$$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var $$$enumerator$$default = $$$enumerator$$Enumerator;

    $$$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var promise = this.promise;
      var input   = this._input;

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    $$$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      if ($$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== $$$internal$$PENDING) {
          entry._onerror = null;
          this._settledAt(entry._state, i, entry._result);
        } else {
          this._willSettleAt(c.resolve(entry), i);
        }
      } else {
        this._remaining--;
        this._result[i] = this._makeResult($$$internal$$FULFILLED, i, entry);
      }
    };

    $$$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === $$$internal$$PENDING) {
        this._remaining--;

        if (this._abortOnReject && state === $$$internal$$REJECTED) {
          $$$internal$$reject(promise, value);
        } else {
          this._result[i] = this._makeResult(state, i, value);
        }
      }

      if (this._remaining === 0) {
        $$$internal$$fulfill(promise, this._result);
      }
    };

    $$$enumerator$$Enumerator.prototype._makeResult = function(state, i, value) {
      return value;
    };

    $$$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      $$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt($$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt($$$internal$$REJECTED, i, reason);
      });
    };

    var $$promise$all$$default = function all(entries, label) {
      return new $$$enumerator$$default(this, entries, true /* abort on reject */, label).promise;
    };

    var $$promise$race$$default = function race(entries, label) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor($$$internal$$noop, label);

      if (!$$utils$$isArray(entries)) {
        $$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        $$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        $$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        $$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    };

    var $$promise$resolve$$default = function resolve(object, label) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$resolve(promise, object);
      return promise;
    };

    var $$promise$reject$$default = function reject(reason, label) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$reject(promise, reason);
      return promise;
    };

    var $$es6$promise$promise$$counter = 0;

    function $$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function $$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var $$es6$promise$promise$$default = $$es6$promise$promise$$Promise;

    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise’s eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function $$es6$promise$promise$$Promise(resolver) {
      this._id = $$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if ($$$internal$$noop !== resolver) {
        if (!$$utils$$isFunction(resolver)) {
          $$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof $$es6$promise$promise$$Promise)) {
          $$es6$promise$promise$$needsNew();
        }

        $$$internal$$initializePromise(this, resolver);
      }
    }

    $$es6$promise$promise$$Promise.all = $$promise$all$$default;
    $$es6$promise$promise$$Promise.race = $$promise$race$$default;
    $$es6$promise$promise$$Promise.resolve = $$promise$resolve$$default;
    $$es6$promise$promise$$Promise.reject = $$promise$reject$$default;

    $$es6$promise$promise$$Promise.prototype = {
      constructor: $$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === $$$internal$$FULFILLED && !onFulfillment || state === $$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor($$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          $$asap$$default(function(){
            $$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          $$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };

    var $$es6$promise$polyfill$$default = function polyfill() {
      var local;

      if (typeof global !== 'undefined') {
        local = global;
      } else if (typeof window !== 'undefined' && window.document) {
        local = window;
      } else {
        local = self;
      }

      var es6PromiseSupport =
        "Promise" in local &&
        // Some of these methods are missing from
        // Firefox/Chrome experimental implementations
        "resolve" in local.Promise &&
        "reject" in local.Promise &&
        "all" in local.Promise &&
        "race" in local.Promise &&
        // Older version of the spec had a resolver object
        // as the arg rather than a function
        (function() {
          var resolve;
          new local.Promise(function(r) { resolve = r; });
          return $$utils$$isFunction(resolve);
        }());

      if (!es6PromiseSupport) {
        local.Promise = $$es6$promise$promise$$default;
      }
    };

    var es6$promise$umd$$ES6Promise = {
      'Promise': $$es6$promise$promise$$default,
      'polyfill': $$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = es6$promise$umd$$ES6Promise;
    }
}).call(this);
}).call(this,_dereq_("D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":6}],30:[function(_dereq_,module,exports){
module.exports=_dereq_(28)
},{}],31:[function(_dereq_,module,exports){
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define('stack-generator', ['stackframe'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(_dereq_('stackframe'));
    } else {
        root.StackGenerator = factory(root.StackFrame);
    }
}(this, function (StackFrame) {
    return {
        backtrace: function StackGenerator$$backtrace(opts) {
            var stack = [];
            var maxStackSize = 10;

            if (typeof opts === 'object' && typeof opts.maxStackSize === 'number') {
                maxStackSize = opts.maxStackSize;
            }

            var curr = arguments.callee;
            while (curr && stack.length < maxStackSize) {
                var args = [].slice.call(curr['arguments']);
                if (/function(?:\s+([\w$]+))+\s*\(/.test(curr.toString())) {
                    stack.push(new StackFrame(RegExp.$1 || undefined, args));
                } else {
                    stack.push(new StackFrame(undefined, args));
                }

                try {
                    curr = curr.caller;
                } catch (e) {
                    break;
                }
            }
            return stack;
        }
    };
}));

},{"stackframe":30}],32:[function(_dereq_,module,exports){
arguments[4][18][0].apply(exports,arguments)
},{"./util":37,"amdefine":38}],33:[function(_dereq_,module,exports){
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
   * placed in the least significant bit.  For example, as decimals:
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
   * placed in the least significant bit.  For example, as decimals:
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
   * value and the rest of the string via the out parameter.
   */
  exports.decode = function base64VLQ_decode(aStr, aOutParam) {
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

    aOutParam.value = fromVLQSigned(result);
    aOutParam.rest = aStr.slice(i);
  };

});

},{"./base64":34,"amdefine":38}],34:[function(_dereq_,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"amdefine":38}],35:[function(_dereq_,module,exports){
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
    //   2. We did not find the exact element, but we can return the index of
    //      the next closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return -1.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return mid;
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return mid;
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0 ? -1 : aLow;
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the index of next lowest value checked if there is no exact hit. This is
   * because mappings between original and generated line/col pairs are single
   * points, and there is an implicit region between each of them, so a miss
   * just means that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    if (aHaystack.length === 0) {
      return -1;
    }
    return recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
  };

});

},{"amdefine":38}],36:[function(_dereq_,module,exports){
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

    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    sources = sources.map(util.normalize);

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

      smc.__generatedMappings = aSourceMap._mappings.toArray().slice();
      smc.__originalMappings = aSourceMap._mappings.toArray().slice()
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
        return this.sourceRoot != null ? util.join(this.sourceRoot, s) : s;
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

  SourceMapConsumer.prototype._nextCharIsMappingSeparator =
    function SourceMapConsumer_nextCharIsMappingSeparator(aStr) {
      var c = aStr.charAt(0);
      return c === ";" || c === ",";
    };

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
      var str = aStr;
      var temp = {};
      var mapping;

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
          base64VLQ.decode(str, temp);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
            // Original source.
            base64VLQ.decode(str, temp);
            mapping.source = this._sources.at(previousSource + temp.value);
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            base64VLQ.decode(str, temp);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            base64VLQ.decode(str, temp);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
              // Original name.
              base64VLQ.decode(str, temp);
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
   * Compute the last column for each generated mapping. The last column is
   * inclusive.
   */
  SourceMapConsumer.prototype.computeColumnSpans =
    function SourceMapConsumer_computeColumnSpans() {
      for (var index = 0; index < this._generatedMappings.length; ++index) {
        var mapping = this._generatedMappings[index];

        // Mappings do not contain a field for the last generated columnt. We
        // can come up with an optimistic estimate, however, by assuming that
        // mappings are contiguous (i.e. given two consecutive mappings, the
        // first mapping ends where the second one starts).
        if (index + 1 < this._generatedMappings.length) {
          var nextMapping = this._generatedMappings[index + 1];

          if (mapping.generatedLine === nextMapping.generatedLine) {
            mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
            continue;
          }
        }

        // The last mapping for each line spans the entire line.
        mapping.lastGeneratedColumn = Infinity;
      }
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

      var index = this._findMapping(needle,
                                    this._generatedMappings,
                                    "generatedLine",
                                    "generatedColumn",
                                    util.compareByGeneratedPositions);

      if (index >= 0) {
        var mapping = this._generatedMappings[index];

        if (mapping.generatedLine === needle.generatedLine) {
          var source = util.getArg(mapping, 'source', null);
          if (source != null && this.sourceRoot != null) {
            source = util.join(this.sourceRoot, source);
          }
          return {
            source: source,
            line: util.getArg(mapping, 'originalLine', null),
            column: util.getArg(mapping, 'originalColumn', null),
            name: util.getArg(mapping, 'name', null)
          };
        }
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

      if (this.sourceRoot != null) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot != null
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

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);

      if (index >= 0) {
        var mapping = this._originalMappings[index];

        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null),
          lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
        };
      }

      return {
        line: null,
        column: null,
        lastColumn: null
      };
    };

  /**
   * Returns all generated line and column information for the original source
   * and line provided. The only argument is an object with the following
   * properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *
   * and an array of objects is returned, each with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.allGeneratedPositionsFor =
    function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
      // When there is no exact match, SourceMapConsumer.prototype._findMapping
      // returns the index of the closest mapping less than the needle. By
      // setting needle.originalColumn to Infinity, we thus find the last
      // mapping for the given line, provided such a mapping exists.
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: Infinity
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var mappings = [];

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);
      if (index >= 0) {
        var mapping = this._originalMappings[index];

        while (mapping && mapping.originalLine === needle.originalLine) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[--index];
        }
      }

      return mappings.reverse();
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
        if (source != null && sourceRoot != null) {
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

},{"./array-set":32,"./base64-vlq":33,"./binary-search":35,"./util":37,"amdefine":38}],37:[function(_dereq_,module,exports){
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
    if (aRoot === "") {
      aRoot = ".";
    }
    if (aPath === "") {
      aPath = ".";
    }
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
   * Make a path relative to a URL or another path.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be made relative to aRoot.
   */
  function relative(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }

    aRoot = aRoot.replace(/\/$/, '');

    // XXX: It is possible to remove this block, and the tests still pass!
    var url = urlParse(aRoot);
    if (aPath.charAt(0) == "/" && url && url.path == "/") {
      return aPath.slice(1);
    }

    return aPath.indexOf(aRoot + '/') === 0
      ? aPath.substr(aRoot.length + 1)
      : aPath;
  }
  exports.relative = relative;

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

},{"amdefine":38}],38:[function(_dereq_,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 0.1.0 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
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
                process.nextTick(function () {
                    callback.apply(null, deps);
                });
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

}).call(this,_dereq_("D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js"),"/..\\node_modules\\stacktrace-js\\node_modules\\stacktrace-gps\\node_modules\\source-map\\node_modules\\amdefine\\amdefine.js")
},{"D:\\billysFile\\code\\javascript\\nodejs\\modules\\deadunitCore\\node_modules\\browserify\\node_modules\\insert-module-globals\\node_modules\\process\\browser.js":6,"path":7}],39:[function(_dereq_,module,exports){
module.exports=_dereq_(28)
},{}],40:[function(_dereq_,module,exports){
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define('stacktrace-gps', ['source-map', 'es6-promise', 'stackframe'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(_dereq_('source-map/lib/source-map/source-map-consumer'), _dereq_('es6-promise'), _dereq_('stackframe'));
    } else {
        root.StackTraceGPS = factory(root.SourceMap, root.ES6Promise, root.StackFrame);
    }
}(this, function (SourceMap, ES6Promise, StackFrame) {
    'use strict';
    ES6Promise.polyfill();
    var Promise = ES6Promise.Promise;

    /**
     * Create XHR or equivalent object for this environment.
     * @returns XMLHttpRequest, XDomainRequest or ActiveXObject
     * @private
     */
    function _createXMLHTTPObject() {
        var xmlhttp;
        var XMLHttpFactories = [
            function () {
                return new XMLHttpRequest();
            }, function () {
                return new ActiveXObject('Microsoft.XMLHTTP');
            }
        ];
        for (var i = 0; i < XMLHttpFactories.length; i++) {
            try {
                xmlhttp = XMLHttpFactories[i]();
                // Use memoization to cache the factory
                _createXMLHTTPObject = XMLHttpFactories[i]; // jshint ignore:line
                return xmlhttp;
            } catch (e) {
            }
        }
    }

    /**
     * Make a X-Domain request to url and callback.
     *
     * @param url [String]
     * @param callback [Function] to callback on completion
     * @param errback [Function] to callback on error
     */
    function _xdr(url, callback, errback) {
        var req = _createXMLHTTPObject();
        req.open('get', url);
        req.onerror = errback;
        req.onreadystatechange = function onreadystatechange() {
            if (req.readyState === 4) {
                if (req.status >= 200 && req.status < 400) {
                    return callback(req.responseText);
                } else {
                    errback(new Error('Unable to retrieve ' + url));
                }
            }
        };
        req.send();
    }

    function _findFunctionName(source, lineNumber, columnNumber) {
        // function {name}({args}) m[1]=name m[2]=args
        var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
        // {name} = function ({args}) TODO args capture
        var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
        // {name} = eval()
        var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
        var lines = source.split("\n");

        // Walk backwards in the source lines until we find the line which matches one of the patterns above
        var code = '', line, maxLines = Math.min(lineNumber, 20), m, commentPos;
        for (var i = 0; i < maxLines; ++i) {
            // lineNo is 1-based, source[] is 0-based
            line = lines[lineNumber - i - 1];
            commentPos = line.indexOf('//');
            if (commentPos >= 0) {
                line = line.substr(0, commentPos);
            }

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
        return undefined;
    }

    function _ensureSupportedEnvironment() {
        if (typeof Object.defineProperty !== 'function' || typeof Object.create !== 'function') {
            throw new Error('Unable to consume source maps in older browsers');
        }
    }

    function _ensureStackFrameIsLegit(stackframe) {
        if (typeof stackframe !== 'object') {
            throw new TypeError('Given StackFrame is not an object');
        } else if (typeof stackframe.fileName !== 'string') {
            throw new TypeError('Given file name is not a String');
        } else if (typeof stackframe.lineNumber !== 'number' || stackframe.lineNumber % 1 !== 0 || stackframe.lineNumber < 1) {
            throw new TypeError('Given line number must be a positive integer');
        } else if (typeof stackframe.columnNumber !== 'number' || stackframe.columnNumber % 1 !== 0 || stackframe.columnNumber < 0) {
            throw new TypeError('Given column number must be a non-negative integer');
        }
        return true;
    }

    function _findSourceMappingURL(source) {
        var m = /\/\/[#@] ?sourceMappingURL=([^\s'"]+)$/.exec(source);
        if (m && m[1]) {
            return m[1];
        } else {
            throw new Error('sourceMappingURL not found');
        }
    }

    function _newLocationInfoFromSourceMap(rawSourceMap, args, lineNumber, columnNumber) {
        var loc = new SourceMap.SourceMapConsumer(rawSourceMap)
            .originalPositionFor({line: lineNumber, column: columnNumber});
        return new StackFrame(loc.name, args, loc.source, loc.line, loc.column);
    }

    /**
     * @param opts: [Object] options.
     *      opts.sourceCache = {url: "Source String"} => preload source cache
     *      opts.offline = True to prevent network requests.
     *              Best effort without sources or source maps.
     */
    return function StackTraceGPS(opts) {
        if (!(this instanceof StackTraceGPS)) {
            return new StackTraceGPS(opts);
        }
        opts = opts || {};

        this.sourceCache = opts.sourceCache || {};

        this._get = function _get(location) {
            return new Promise(function (resolve, reject) {
                if (this.sourceCache[location]) {
                    resolve(this.sourceCache[location]);
                } else if (opts.offline) {
                    reject(new Error('Cannot make network requests in offline mode'));
                } else {
                    _xdr(location, function (source) {
                        this.sourceCache[location] = source;
                        resolve(source);
                    }.bind(this), reject);
                }
            }.bind(this));
        };

        /**
         * Given a StackFrame, enhance function name and use source maps for a
         * better StackFrame.
         *
         * @param stackframe - {StackFrame}-like object
         *      {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5}
         * @return StackFrame with source-mapped location
         */
        this.pinpoint = function StackTraceGPS$$pinpoint(stackframe) {
            return new Promise(function (resolve, reject) {
                this.getMappedLocation(stackframe).then(function (mappedStackFrame) {
                    function resolveMappedStackFrame() {
                        resolve(mappedStackFrame);
                    }

                    this.findFunctionName(mappedStackFrame)
                        .then(resolve, resolveMappedStackFrame)
                        ['catch'](resolveMappedStackFrame);
                }.bind(this), reject);
            }.bind(this));
        };

        /**
         * Given a StackFrame, guess function name from location information.
         *
         * @param stackframe - {StackFrame}-like object
         *      {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5}
         * @return StackFrame with guessed function name
         */
        this.findFunctionName = function StackTraceGPS$$findFunctionName(stackframe) {
            return new Promise(function (resolve, reject) {
                _ensureStackFrameIsLegit(stackframe);
                this._get(stackframe.fileName).then(function getSourceCallback(source) {
                    var guessedFunctionName = _findFunctionName(source, stackframe.lineNumber, stackframe.columnNumber);
                    resolve(new StackFrame(guessedFunctionName, stackframe.args, stackframe.fileName, stackframe.lineNumber, stackframe.columnNumber));
                }, reject);
            }.bind(this));
        };

        /**
         * Given a StackFrame, seek source-mapped location and return new enhanced StackFrame.
         *
         * @param stackframe - {StackFrame}-like object
         *      {fileName: 'path/to/file.js', lineNumber: 100, columnNumber: 5}
         * @return StackFrame with source-mapped location
         */
        this.getMappedLocation = function StackTraceGPS$$getMappedLocation(stackframe) {
            return new Promise(function (resolve, reject) {
                _ensureSupportedEnvironment();
                _ensureStackFrameIsLegit(stackframe);

                this._get(stackframe.fileName).then(function (source) {
                    this._get(_findSourceMappingURL(source)).then(function (map) {
                        var lineNumber = stackframe.lineNumber;
                        var columnNumber = stackframe.columnNumber;
                        resolve(_newLocationInfoFromSourceMap(map, stackframe.args, lineNumber, columnNumber));
                    }, reject)['catch'](reject);
                }.bind(this), reject)['catch'](reject);
            }.bind(this));
        };
    };
}));

},{"es6-promise":29,"source-map/lib/source-map/source-map-consumer":36,"stackframe":39}],41:[function(_dereq_,module,exports){
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.
    if (typeof define === 'function' && define.amd) {
        define('stacktrace', ['error-stack-parser', 'stack-generator', 'stacktrace-gps', 'es6-promise'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(_dereq_('error-stack-parser'), _dereq_('stack-generator'), _dereq_('stacktrace-gps'), _dereq_('es6-promise'));
    } else {
        root.StackTrace = factory(root.ErrorStackParser, root.StackGenerator, root.StackTraceGPS, root.ES6Promise);
    }
}(this, function StackTrace(ErrorStackParser, StackGenerator, StackTraceGPS, ES6Promise) {
    ES6Promise.polyfill();
    var Promise = ES6Promise.Promise;

    var _options = {
        filter: function (stackframe) {
            // Filter out stackframes for this library by default
            return (stackframe.functionName || '').indexOf('StackTrace$$') === -1 &&
                (stackframe.functionName || '').indexOf('ErrorStackParser$$') === -1 &&
                (stackframe.functionName || '').indexOf('StackTraceGPS$$') === -1 &&
                (stackframe.functionName || '').indexOf('StackGenerator$$') === -1;
        }
    };

    /**
     * Merge 2 given Objects. If a conflict occurs the second object wins.
     * Does not do deep merges.
     * @param first Object
     * @param second Object
     * @returns new Object merged first and second
     * @private
     */
    function _merge(first, second) {
        var target = {};

        [first, second].forEach(function (obj) {
            for (var prop in obj) {
                if (obj.hasOwnProperty(prop)) {
                    target[prop] = obj[prop];
                }
            }
            return target;
        });

        return target;
    }

    function _isShapedLikeParsableError(err) {
        return err.stack || err['opera#sourceloc'];
    }

    return {
        /**
         * Get a backtrace from invocation point.
         * @param opts Options Object
         * @return Array[StackFrame]
         */
        get: function StackTrace$$get(opts) {
            try {
                // Error must be thrown to get stack in IE
                throw new Error();
            } catch (err) {
                if (_isShapedLikeParsableError(err)) {
                    return this.fromError(err, opts);
                } else {
                    return this.generateArtificially(opts);
                }
            }
        },

        /**
         * Given an error object, parse it.
         * @param error Error object
         * @param opts Object for options
         * @return Array[StackFrame]
         */
        fromError: function StackTrace$$fromError(error, opts) {
            opts = _merge(_options, opts);
            return new Promise(function (resolve) {
                var stackframes = ErrorStackParser.parse(error);
                if (typeof opts.filter === 'function') {
                    stackframes = stackframes.filter(opts.filter);
                }
                resolve(Promise.all(stackframes.map(function (sf) {
                    return new Promise(function (resolve) {
                        function resolveOriginal(_) {
                            resolve(sf);
                        }

                        new StackTraceGPS(opts).pinpoint(sf)
                            .then(resolve, resolveOriginal)['catch'](resolveOriginal);
                    });
                })));
            }.bind(this));
        },

        /**
         * Use StackGenerator to generate a backtrace.
         * @param opts Object options
         * @returns Array[StackFrame]
         */
        generateArtificially: function StackTrace$$generateArtificially(opts) {
            opts = _merge(_options, opts);
            var stackFrames = StackGenerator.backtrace(opts);
            if (typeof opts.filter === 'function') {
                stackFrames = stackFrames.filter(opts.filter);
            }
            return Promise.resolve(stackFrames);
        },

        /**
         * Given a function, wrap it such that invocations trigger a callback that
         * is called with a stack trace.
         *
         * @param {Function} fn to be instrumented
         * @param {Function} callback function to call with a stack trace on invocation
         * @param {Function} errback optional function to call with error if unable to get stack trace.
         * @param {Object} thisArg optional context object (e.g. window)
         */
        instrument: function StackTrace$$instrument(fn, callback, errback, thisArg) {
            if (typeof fn !== 'function') {
                throw new Error('Cannot instrument non-function object');
            } else if (typeof fn.__stacktraceOriginalFn === 'function') {
                // Already instrumented, return given Function
                return fn;
            }

            var instrumented = function StackTrace$$instrumented() {
                try {
                    this.get().then(callback, errback)['catch'](errback);
                    fn.apply(thisArg || this, arguments);
                } catch (e) {
                    if (_isShapedLikeParsableError(e)) {
                        this.fromError(e).then(callback, errback)['catch'](errback);
                    }
                    throw e;
                }
            }.bind(this);
            instrumented.__stacktraceOriginalFn = fn;

            return instrumented;
        },

        /**
         * Given a function that has been instrumented,
         * revert the function to it's original (non-instrumented) state.
         *
         * @param fn {Function}
         */
        deinstrument: function StackTrace$$deinstrument(fn) {
            if (typeof fn !== 'function') {
                throw new Error('Cannot de-instrument non-function object');
            } else if (typeof fn.__stacktraceOriginalFn === 'function') {
                return fn.__stacktraceOriginalFn;
            } else {
                // Function not instrumented, return original
                return fn;
            }
        }
    };
}));

},{"error-stack-parser":27,"es6-promise":29,"stack-generator":31,"stacktrace-gps":40}],42:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var deadunitCore = _dereq_("./deadunitCore")
var browserConfig = _dereq_('./deadunitCore.browserConfig')

module.exports = deadunitCore(browserConfig())
},{"./deadunitCore":44,"./deadunitCore.browserConfig":43}],43:[function(_dereq_,module,exports){
"use strict";
/* Copyright (c) 2014 Billy Tetrud - Free to use for any purpose: MIT License*/

var path = _dereq_('path');

var Future = _dereq_('async-future')
var proto = _dereq_('proto')
var stacktracejs = _dereq_('stacktrace-js')
var ajax = _dereq_("ajax")
var resolveSourceMap = Future.wrap(_dereq_('source-map-resolve').resolveSourceMap)

var deadunitCore = _dereq_("./deadunitCore")
var isRelative = _dereq_('./isRelative')

//ajax.setSynchronous(true) // todo: REMOVE THIS once this chrome bug is fixed in a public release: https://code.google.com/p/chromium/issues/detail?id=368444

var sourceCache = {}
/* todo: add something like this back once stacktrace-js support swapping out ajax implementations
// add sourceFile contents into stacktrace.js's cache

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

// what was this for?
if(window.setImmediate === undefined) {
    window.setImmediate = function(fn, params) {
        setTimeout(function() {
            fn.apply(this,params)
        },0)
    }
}


//ajax.cacheGet(cacheGet)
//ajax.cacheSet(cacheSet)
*/


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
        /* todo: figure out what to do here when you can merge file caches with stacktrace.js
        if(stackinfo.sourceCache[path] !== undefined) {
            return Future(stackinfo.sourceCache[path])
        } else {*/
            return this.ajax(path).then(function(response) {
                return Future(response.text.split('\n'))
            })
        //}

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
        var result = new Future
        stacktracejs.get({sourceCache: sourceCache}).then(function(stackFrames){
            var frame = stackFrames[3+stackIncrease]
            result.return({
                'function': frame.functionName,
                line: frame.lineNumber,
                column: frame.columnNumber,
                file: frame.fileName
            })
        }).catch(function(e) {
            result.throw(e)
        })

        return result
    }

    this.getExceptionInfo= function(e) {
        var result = new Future
        stacktracejs.fromError(e, {sourceCache: sourceCache}).then(function(stackFrames){
            result.return(stackFrames.map(function(frame){
                return {
                    'function': frame.functionName,
                    line: frame.lineNumber,
                    column: frame.columnNumber,
                    file: frame.fileName
                }
            }))
        }).catch(function(e) {
            result.throw(e)
        })

        return result
    }

    this.throwAsyncException = function(e) {
        setTimeout(function() {
            if(e.stack !== undefined) throw e.stack
            else                      throw e
        },0)
    }
})
},{"./deadunitCore":44,"./isRelative":45,"ajax":1,"async-future":4,"path":7,"proto":13,"source-map-resolve":16,"stacktrace-js":41}],44:[function(_dereq_,module,exports){
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
            if(warn !== false) {
                try {
                    tester.warningHandler(newError)
                } catch(warningHandlerError) {
                    var warningHandlerErrorText = warningHandlerError.stack?warningHandlerError.stack:warningHandlerError
                    var textForOriginalError = newError.stack?newError.stack:newError
                    var errorception = new Error("An error happened in the error handler: "+warningHandlerErrorText+"\n"+textForOriginalError)
                    tester.manager.emit('exception', Future(errorception)).done() // if shit gets this bad, that sucks
                }
            } else {
                console.error(newError)
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
    var UnitTester = function(name, mainTester) {
        if(!mainTester) mainTester = this

        this.id = groupid()
        this.mainTester = mainTester // the mainTester is used to easily figure out if the test results have been accessed (so early accesses can be detected)
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

                var tester = new UnitTester(name, this.mainTester)
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

    // if a timeout is the default, it can be overridden
    function timeout(unitTester, t, theDefault) {
        var timeouts = unitTester.mainTester.timeouts

        var to = setTimeout(function() {
            remove(timeouts, to)

            if(timeouts.length === 0 && !unitTester.mainTester.ended) {
                endTest(unitTester.mainTester, 'timeout')
            }
        }, t)

        timeouts.push(to)

        if(theDefault) {
            timeouts.default = to
        } else if(timeouts.default !== undefined) {
            clearTimeout(timeouts.default)
            remove(timeouts, timeouts.default)
            timeouts.default = undefined
        }

        function remove(array, item) {
            var index = array.indexOf(item)
            if(index === -1)
                throw Error("Item doesn't exist to remove")
            array.splice(index, 1)
        }
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
                    this[p] = originalError[p]
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
        for(var n=startLine; true; n++) {
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
},{"./isRelative":45,"./processResults":46,"async-future":4,"path":7,"proto":13,"source-map":17,"url":12}],45:[function(_dereq_,module,exports){
var path = _dereq_('path')

module.exports = function isRelative(p) {
    var normal = path.normalize(p)
    var absolute = path.resolve(p)
    return normal != absolute && p.indexOf('://') === -1// second part for urls
}
},{"path":7}],46:[function(_dereq_,module,exports){
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
},{}]},{},[42])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyJEOlxcYmlsbHlzRmlsZVxcY29kZVxcamF2YXNjcmlwdFxcbm9kZWpzXFxtb2R1bGVzXFxkZWFkdW5pdENvcmVcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9hamF4L2FqYXguanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2FqYXgvbm9kZV9tb2R1bGVzL2FzeW5jLWZ1dHVyZS9hc3luY0Z1dHVyZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYWpheC9ub2RlX21vZHVsZXMvYXN5bmMtZnV0dXJlL25vZGVfbW9kdWxlcy90cmltQXJndW1lbnRzL3RyaW1Bcmd1bWVudHMuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2FzeW5jLWZ1dHVyZS9hc3luY0Z1dHVyZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHVueWNvZGUvcHVueWNvZGUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9kZWNvZGUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9lbmNvZGUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXJsL3VybC5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvcHJvdG8vcHJvdG8uanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAtcmVzb2x2ZS9ub2RlX21vZHVsZXMvcmVzb2x2ZS11cmwvcmVzb2x2ZS11cmwuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAtcmVzb2x2ZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC11cmwvc291cmNlLW1hcC11cmwuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAtcmVzb2x2ZS9zb3VyY2UtbWFwLXJlc29sdmUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYXJyYXktc2V0LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL2Jhc2U2NC12bHEuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYmFzZTY0LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL2JpbmFyeS1zZWFyY2guanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvc291cmNlLW1hcC1jb25zdW1lci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9zb3VyY2UtbWFwLWdlbmVyYXRvci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9zb3VyY2Utbm9kZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC91dGlsLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL25vZGVfbW9kdWxlcy9hbWRlZmluZS9hbWRlZmluZS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1qcy9ub2RlX21vZHVsZXMvZXJyb3Itc3RhY2stcGFyc2VyL2Vycm9yLXN0YWNrLXBhcnNlci5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1qcy9ub2RlX21vZHVsZXMvZXJyb3Itc3RhY2stcGFyc2VyL25vZGVfbW9kdWxlcy9zdGFja2ZyYW1lL3N0YWNrZnJhbWUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtanMvbm9kZV9tb2R1bGVzL2VzNi1wcm9taXNlL2Rpc3QvZXM2LXByb21pc2UuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtanMvbm9kZV9tb2R1bGVzL3N0YWNrLWdlbmVyYXRvci9zdGFjay1nZW5lcmF0b3IuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtanMvbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtZ3BzL25vZGVfbW9kdWxlcy9zb3VyY2UtbWFwL2xpYi9zb3VyY2UtbWFwL2FycmF5LXNldC5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1qcy9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1ncHMvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYmFzZTY0LXZscS5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1qcy9ub2RlX21vZHVsZXMvc3RhY2t0cmFjZS1ncHMvbm9kZV9tb2R1bGVzL3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvYmFzZTY0LmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWpzL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWdwcy9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9iaW5hcnktc2VhcmNoLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWpzL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWdwcy9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC9zb3VyY2UtbWFwLWNvbnN1bWVyLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWpzL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWdwcy9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9saWIvc291cmNlLW1hcC91dGlsLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWpzL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWdwcy9ub2RlX21vZHVsZXMvc291cmNlLW1hcC9ub2RlX21vZHVsZXMvYW1kZWZpbmUvYW1kZWZpbmUuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtanMvbm9kZV9tb2R1bGVzL3N0YWNrdHJhY2UtZ3BzL3N0YWNrdHJhY2UtZ3BzLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL25vZGVfbW9kdWxlcy9zdGFja3RyYWNlLWpzL3N0YWNrdHJhY2UuanMiLCJEOi9iaWxseXNGaWxlL2NvZGUvamF2YXNjcmlwdC9ub2RlanMvbW9kdWxlcy9kZWFkdW5pdENvcmUvc3JjL2RlYWR1bml0Q29yZS5icm93c2VyLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL3NyYy9kZWFkdW5pdENvcmUuYnJvd3NlckNvbmZpZy5qcyIsIkQ6L2JpbGx5c0ZpbGUvY29kZS9qYXZhc2NyaXB0L25vZGVqcy9tb2R1bGVzL2RlYWR1bml0Q29yZS9zcmMvZGVhZHVuaXRDb3JlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL3NyYy9pc1JlbGF0aXZlLmpzIiwiRDovYmlsbHlzRmlsZS9jb2RlL2phdmFzY3JpcHQvbm9kZWpzL21vZHVsZXMvZGVhZHVuaXRDb3JlL3NyYy9wcm9jZXNzUmVzdWx0cy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzdXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbnNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25ZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDajhCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5SUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9UQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDN1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdDRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBGdXR1cmUgPSByZXF1aXJlKFwiYXN5bmMtZnV0dXJlXCIpXG5cbi8vIHJldHVybnMgdGhlIFhIUiBmdW5jdGlvbiBvciBlcXVpdmFsZW50IGZvciB1c2Ugd2l0aCBhamF4XG4vLyBtZW1vaXplcyB0aGUgZnVuY3Rpb24gZm9yIGZhc3RlciByZXBlYXRlZCB1c2VcbnZhciBjcmVhdGVYTUxIVFRQT2JqZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZlcnNpb25zID0gW1wiTXN4bWwyLlhNTEhUVFBcIixcbiAgICAgICAgICAgICAgICAgICAgXCJNc3htbDMuWE1MSFRUUFwiLFxuICAgICAgICAgICAgICAgICAgICBcIk1pY3Jvc29mdC5YTUxIVFRQXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuNi4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuNS4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuNC4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuMy4wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiTVNYTUwyLlhtbEh0dHAuMi4wXCJcbiAgICBdXG5cbiAgICBpZihYTUxIdHRwUmVxdWVzdCAhPT0gdW5kZWZpbmVkKSB7ICAvLyBGb3Igbm9uLUlFIGJyb3dzZXJzXG4gICAgICAgIGNyZWF0ZVhNTEhUVFBPYmplY3QgPSBmdW5jdGlvbigpIHsgIC8vIFVzZSBtZW1vaXphdGlvbiB0byBjYWNoZSB0aGUgZmFjdG9yeVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNyZWF0ZVhNTEhUVFBPYmplY3QoKVxuXG4gICAgfSBlbHNlIHsgLy8gSUVcbiAgICAgICAgZm9yKHZhciBpPTAsIG49dmVyc2lvbnMubGVuZ3RoOyBpPG47IGkrKykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgdmVyc2lvbiA9IHZlcnNpb25zW2ldXG4gICAgICAgICAgICAgICAgdmFyIGZuID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQWN0aXZlWE9iamVjdCh2ZXJzaW9uKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjcmVhdGVYTUxIVFRQT2JqZWN0ID0gZm4gICAvLyBVc2UgbWVtb2l6YXRpb24gdG8gY2FjaGUgdGhlIGZhY3RvcnlcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlWE1MSFRUUE9iamVjdCgpXG5cbiAgICAgICAgICAgIH0gY2F0Y2goZSkgeyAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcignQ2FudCBnZXQgWG1sSHR0cFJlcXVlc3Qgb2JqZWN0Jylcbn1cblxuXG5cbnZhciBIRUFERVIgPSBcIihbXlxcXFxzXSspOiAoLiopXCJcblxuLy8gcmV0dXJucyB0aGUgY29udGVudHMgYW5kIGhlYWRlcnMgZnJvbSBhIGdpdmVuIFVSTFxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odXJsKSB7XG4gICAgaWYoZ2V0RnJvbUNhY2hlKHVybCkpXG4gICAgICAgIHJldHVybiBnZXRGcm9tQ2FjaGUodXJsKVxuXG4gICAgdmFyIGZ1dHVyZVJlc3VsdCA9IG5ldyBGdXR1cmVcbiAgICBzZXRPbkNhY2hlKHVybCwgZnV0dXJlUmVzdWx0KVxuXG4gICAgdmFyIHJlcSA9IGNyZWF0ZVhNTEhUVFBPYmplY3QoKVxuICAgIHJlcS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYoIHJlcS5yZWFkeVN0YXRlID09PSA0ICkge1xuICAgICAgICAgICAgaWYoIHJlcS5zdGF0dXMgPT09IDIwMCApIHtcbiAgICAgICAgICAgICAgICB2YXIgaGVhZGVycyA9IHt9XG4gICAgICAgICAgICAgICAgcmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpLnNwbGl0KCdcXG4nKS5mb3JFYWNoKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gbGluZS5tYXRjaChIRUFERVIpXG4gICAgICAgICAgICAgICAgICAgIGlmKG1hdGNoICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmFtZSA9IG1hdGNoWzFdXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBtYXRjaFsyXVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkZXJzW25hbWVdID0gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICBmdXR1cmVSZXN1bHQucmV0dXJuKHt0ZXh0OiByZXEucmVzcG9uc2VUZXh0LCBoZWFkZXJzOiBoZWFkZXJzfSlcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ0Vycm9yIGluIHJlcXVlc3Q6IFN0YXR1cyAnK3JlcS5zdGF0dXMpXG4gICAgICAgICAgICAgICAgZXJyb3Iuc3RhdHVzID0gcmVxLnN0YXR1c1xuICAgICAgICAgICAgICAgIGZ1dHVyZVJlc3VsdC50aHJvdyhlcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlcS5vbmVycm9yID0gZnVuY3Rpb24oZSkge1xuICAgICAgICBmdXR1cmVSZXN1bHQudGhyb3coZSlcbiAgICB9XG5cblxuICAgIHJlcS5vcGVuKCdHRVQnLCB1cmwsIGFzeW5jaHJvbm91cylcbiAgICB0cnkge1xuICAgICAgICByZXEuc2VuZCgpXG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGZ1dHVyZVJlc3VsdC50aHJvdyhlKVxuICAgIH1cblxuICAgIHJldHVybiBmdXR1cmVSZXN1bHRcbn1cblxudmFyIGNhY2hlID0ge31cbnZhciBnZXRGcm9tQ2FjaGUgPSBmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gY2FjaGVbdXJsXVxufVxudmFyIHNldE9uQ2FjaGUgPSBmdW5jdGlvbih1cmwsIGZ1dHVyZVJlc3BvbnNlKSB7XG4gICAgY2FjaGVbdXJsXSA9IGZ1dHVyZVJlc3BvbnNlXG59XG5cbnZhciBhc3luY2hyb25vdXMgPSB0cnVlXG5leHBvcnRzLnNldFN5bmNocm9ub3VzID0gZnVuY3Rpb24oc3luY2hyb25vdXMpIHsgLy8gdGhpcyBpcyBoZXJlIHNvIEkgY2FuIHdvcmsgYXJvdW5kIHRoaXMgYnVnIGluIGNocm9tZTogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTM2ODQ0NFxuICAgIGFzeW5jaHJvbm91cyA9ICFzeW5jaHJvbm91c1xufVxuXG5leHBvcnRzLmNhY2hlR2V0ID0gZnVuY3Rpb24oZm4pIHtcbiAgICBnZXRGcm9tQ2FjaGUgPSBmblxufVxuZXhwb3J0cy5jYWNoZVNldCA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgc2V0T25DYWNoZSA9IGZuXG59IiwiLyogQ29weXJpZ2h0IChjKSAyMDEzIEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xyXG5cclxudmFyIHRyaW1BcmdzID0gcmVxdWlyZShcInRyaW1Bcmd1bWVudHNcIilcclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZ1dHVyZVxyXG5cclxuRnV0dXJlLmRlYnVnID0gZmFsc2UgLy8gc3dpdGNoIHRoaXMgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBpZHMgYW5kIGxvbmcgc3RhY2sgdHJhY2VzXHJcblxyXG52YXIgY3VySWQgPSAwICAgICAgICAgLy8gZm9yIGlkc1xcXHJcbmZ1bmN0aW9uIEZ1dHVyZSh2YWx1ZSkge1xyXG5cdGlmKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcblx0XHR2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgICAgIGYucmV0dXJuKHZhbHVlKVxyXG4gICAgICAgIHJldHVybiBmXHJcblx0fSBlbHNlIHtcclxuICAgICAgICB0aGlzLmlzUmVzb2x2ZWQgPSBmYWxzZVxyXG4gICAgICAgIHRoaXMucXVldWUgPSBbXVxyXG4gICAgICAgIGlmKEZ1dHVyZS5kZWJ1Zykge1xyXG4gICAgICAgICAgICBjdXJJZCsrXHJcbiAgICAgICAgICAgIHRoaXMuaWQgPSBjdXJJZFxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gc3RhdGljIG1ldGhvZHNcclxuXHJcbi8vIGhhcyBvbmUgcGFyYW1ldGVyOiBlaXRoZXIgYSBidW5jaCBvZiBmdXR1cmVzLCBvciBhIHNpbmdsZSBhcnJheSBvZiBmdXR1cmVzXHJcbi8vIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBvbmUgb2YgdGhlbSBlcnJvcnMsIG9yIHdoZW4gYWxsIG9mIHRoZW0gc3VjY2VlZHNcclxuRnV0dXJlLmFsbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQXJyYXkpIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IGFyZ3VtZW50c1swXVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IHRyaW1BcmdzKGFyZ3VtZW50cylcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgdmFyIHJlc3VsdHMgPSBbXVxyXG5cclxuICAgIGlmKGZ1dHVyZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhciBjdXJyZW50ID0gZnV0dXJlc1swXVxyXG4gICAgICAgIGZ1dHVyZXMuZm9yRWFjaChmdW5jdGlvbihmdXR1cmUsIGluZGV4KSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0c1tpbmRleF0gPSB2XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnV0dXJlc1tpbmRleCsxXVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC8vaWZcclxuICAgICAgICBjdXJyZW50LmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLy8gZWxzZVxyXG4gICAgICAgIGN1cnJlbnQudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4ocmVzdWx0cylcclxuICAgICAgICB9KVxyXG5cclxuXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGYucmV0dXJuKHJlc3VsdHMpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gZWl0aGVyIHVzZWQgbGlrZSBmdXR1cmVXcmFwKGZ1bmN0aW9uKCl7IC4uLiB9KShhcmcxLGFyZzIsZXRjKSBvclxyXG4vLyAgZnV0dXJlV3JhcChvYmplY3QsICdtZXRob2ROYW1lJykoYXJnMSxhcmcyLGV0YylcclxuRnV0dXJlLndyYXAgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIGZ1bmN0aW9uXHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgdmFyIGZuID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgdmFyIG9iamVjdCA9IHVuZGVmaW5lZFxyXG5cclxuXHJcbiAgICAvLyBvYmplY3QsIGZ1bmN0aW9uXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBvYmplY3QgPSBhcmd1bWVudHNbMF1cclxuICAgICAgICB2YXIgZm4gPSBvYmplY3RbYXJndW1lbnRzWzFdXVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cylcclxuICAgICAgICB2YXIgZnV0dXJlID0gbmV3IEZ1dHVyZVxyXG4gICAgICAgIGFyZ3MucHVzaChmdXR1cmUucmVzb2x2ZXIoKSlcclxuICAgICAgICB2YXIgbWUgPSB0aGlzXHJcbiAgICAgICAgaWYob2JqZWN0KSBtZSA9IG9iamVjdFxyXG4gICAgICAgIGZuLmFwcGx5KG1lLCBhcmdzKVxyXG4gICAgICAgIHJldHVybiBmdXR1cmVcclxuICAgIH1cclxufVxyXG5cclxuXHJcbi8vIGRlZmF1bHRcclxudmFyIHVuaGFuZGxlZEVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcclxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdGhyb3cgZVxyXG4gICAgfSwwKVxyXG59XHJcblxyXG4vLyBzZXR1cCB1bmhhbmRsZWQgZXJyb3IgaGFuZGxlclxyXG4vLyB1bmhhbmRsZWQgZXJyb3JzIGhhcHBlbiB3aGVuIGRvbmUgaXMgY2FsbGVkLCBhbmQgIHRoZW4gYW4gZXhjZXB0aW9uIGlzIHRocm93biBmcm9tIHRoZSBmdXR1cmVcclxuRnV0dXJlLmVycm9yID0gZnVuY3Rpb24oaGFuZGxlcikge1xyXG4gICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gaGFuZGxlclxyXG59XHJcblxyXG4vLyBpbnN0YW5jZSBtZXRob2RzXHJcblxyXG4vLyByZXR1cm5zIGEgdmFsdWUgZm9yIHRoZSBmdXR1cmUgKGNhbiBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UpXHJcbi8vIGlmIHRoZXJlIGFyZSBjYWxsYmFja3Mgd2FpdGluZyBvbiB0aGlzIHZhbHVlLCB0aGV5IGFyZSBydW4gaW4gdGhlIG5leHQgdGlja1xyXG4gICAgLy8gKGllIHRoZXkgYXJlbid0IHJ1biBpbW1lZGlhdGVseSwgYWxsb3dpbmcgdGhlIGN1cnJlbnQgdGhyZWFkIG9mIGV4ZWN1dGlvbiB0byBjb21wbGV0ZSlcclxuRnV0dXJlLnByb3RvdHlwZS5yZXR1cm4gPSBmdW5jdGlvbih2KSB7XHJcbiAgICByZXNvbHZlKHRoaXMsICdyZXR1cm4nLCB2KVxyXG59XHJcbkZ1dHVyZS5wcm90b3R5cGUudGhyb3cgPSBmdW5jdGlvbihlKSB7XHJcbiAgICByZXNvbHZlKHRoaXMsICdlcnJvcicsIGUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldE5leHQodGhhdCwgZnV0dXJlKSB7XHJcbiAgICBpZihmdXR1cmUgIT09IHVuZGVmaW5lZCAmJiAhaXNMaWtlQUZ1dHVyZShmdXR1cmUpIClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIlZhbHVlIHJldHVybmVkIGZyb20gdGhlbiBvciBjYXRjaCAqbm90KiBhIEZ1dHVyZTogXCIrZnV0dXJlKVxyXG5cclxuICAgIHJlc29sdmUodGhhdCwgJ25leHQnLCBmdXR1cmUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdhaXQodGhhdCwgY2IpIHtcclxuICAgIGlmKHRoYXQuaXNSZXNvbHZlZCkge1xyXG4gICAgICAgIGV4ZWN1dGVDYWxsYmFja3ModGhhdCwgW2NiXSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhhdC5xdWV1ZS5wdXNoKGNiKVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBkdWNrIHR5cGluZyB0byBkZXRlcm1pbmUgaWYgc29tZXRoaW5nIGlzIG9yIGlzbid0IGEgZnV0dXJlXHJcbmZ1bmN0aW9uIGlzTGlrZUFGdXR1cmUoeCkge1xyXG4gICAgcmV0dXJuIHguaXNSZXNvbHZlZCAhPT0gdW5kZWZpbmVkICYmIHgucXVldWUgIT09IHVuZGVmaW5lZCAmJiB4LnRoZW4gIT09IHVuZGVmaW5lZFxyXG59XHJcblxyXG5mdW5jdGlvbiB3YWl0T25SZXN1bHQoZiwgcmVzdWx0LCBjYikge1xyXG4gICAgd2FpdChyZXN1bHQsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgZi50aHJvdyh0aGlzLmVycm9yKVxyXG4gICAgICAgIH0gZWxzZSBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgd2FpdE9uUmVzdWx0KGYsIHRoaXMubmV4dCwgY2IpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHNldE5leHQoZiwgY2IodGhpcy5yZXN1bHQpKVxyXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbn1cclxuXHJcblxyXG4vLyBjYiB0YWtlcyBvbmUgcGFyYW1ldGVyIC0gdGhlIHZhbHVlIHJldHVybmVkXHJcbi8vIGNiIGNhbiByZXR1cm4gYSBGdXR1cmUsIGluIHdoaWNoIGNhc2UgdGhlIHJlc3VsdCBvZiB0aGF0IEZ1dHVyZSBpcyBwYXNzZWQgdG8gbmV4dC1pbi1jaGFpblxyXG5GdXR1cmUucHJvdG90eXBlLnRoZW4gPSBmdW5jdGlvbihjYikge1xyXG4gICAgdmFyIGYgPSBuZXcgRnV0dXJlXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpXHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICBlbHNlIGlmKHRoaXMuaGFzTmV4dClcclxuICAgICAgICAgICAgd2FpdE9uUmVzdWx0KGYsIHRoaXMubmV4dCwgY2IpXHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGNiKHRoaXMucmVzdWx0KSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIGZcclxufVxyXG4vLyBjYiB0YWtlcyBvbmUgcGFyYW1ldGVyIC0gdGhlIGVycm9yIGNhdWdodFxyXG4vLyBjYiBjYW4gcmV0dXJuIGEgRnV0dXJlLCBpbiB3aGljaCBjYXNlIHRoZSByZXN1bHQgb2YgdGhhdCBGdXR1cmUgaXMgcGFzc2VkIHRvIG5leHQtaW4tY2hhaW5cclxuRnV0dXJlLnByb3RvdHlwZS5jYXRjaCA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmVcclxuICAgIHdhaXQodGhpcywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYodGhpcy5oYXNFcnJvcikge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgc2V0TmV4dChmLCBjYih0aGlzLmVycm9yKSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgIGYucmV0dXJuKHYpXHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIHNldE5leHQoZiwgY2IoZSkpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4odGhpcy5yZXN1bHQpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgbm8gcGFyYW1ldGVyc1xyXG4vLyBjYWxsYmFjaydzIHJldHVybiB2YWx1ZSBpcyBpZ25vcmVkLCBidXQgdGhyb3duIGV4Y2VwdGlvbnMgcHJvcG9nYXRlIG5vcm1hbGx5XHJcbkZ1dHVyZS5wcm90b3R5cGUuZmluYWxseSA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmVcclxuICAgIHdhaXQodGhpcywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzXHJcbiAgICAgICAgICAgIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID0gY2IoKVxyXG4gICAgICAgICAgICAgICAgICAgIGYucmV0dXJuKHYpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IGNiKClcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhcclxuICAgICAgICAgICAgICAgIH0pLmRvbmUoKVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgRnV0dXJlKHRydWUpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKClcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyh0aGF0LmVycm9yKVxyXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3coZSlcclxuICAgICAgICAgICAgICAgIH0pLmRvbmUoKVxyXG5cclxuICAgICAgICAgICAgfSBlbHNlICB7XHJcbiAgICAgICAgICAgICAgICBGdXR1cmUodHJ1ZSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IoKVxyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnJldHVybih0aGF0LnJlc3VsdClcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuXHJcbi8vIGFsbCB1bnVzZWQgZnV0dXJlcyBzaG91bGQgZW5kIHdpdGggdGhpcyAoZS5nLiBtb3N0IHRoZW4tY2hhaW5zKVxyXG4vLyBkZXRhdGNoZXMgdGhlIGZ1dHVyZSBzbyBhbnkgcHJvcG9nYXRlZCBleGNlcHRpb24gaXMgdGhyb3duIChzbyB0aGUgZXhjZXB0aW9uIGlzbid0IHNpbGVudGx5IGxvc3QpXHJcbkZ1dHVyZS5wcm90b3R5cGUuZG9uZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcih0aGlzLmVycm9yKVxyXG4gICAgICAgIH0gZWxzZSBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgdGhpcy5uZXh0LmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbn1cclxuXHJcblxyXG5cclxuRnV0dXJlLnByb3RvdHlwZS5yZXNvbHZlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdmFyIG1lID0gdGhpc1xyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbihlLHYpIHtcclxuICAgICAgICBpZihlKSB7IC8vIGVycm9yIGFyZ3VtZW50XHJcbiAgICAgICAgICAgIG1lLnRocm93KGUpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbWUucmV0dXJuKHYpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5GdXR1cmUucHJvdG90eXBlLnJlc29sdmVkID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5pc1Jlc29sdmVkXHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiByZXNvbHZlKHRoYXQsIHR5cGUsIHZhbHVlKSB7XHJcbiAgICBpZih0aGF0LmlzUmVzb2x2ZWQpXHJcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJGdXR1cmUgcmVzb2x2ZWQgbW9yZSB0aGFuIG9uY2UhIFJlc29sdXRpb246IFwiK3ZhbHVlKVxyXG5cclxuICAgIHRoYXQuaXNSZXNvbHZlZCA9IHRydWVcclxuICAgIHRoYXQuaGFzRXJyb3IgPSB0eXBlID09PSAnZXJyb3InXHJcbiAgICB0aGF0Lmhhc05leHQgPSB0eXBlID09PSAnbmV4dCcgJiYgdmFsdWUgIT09IHVuZGVmaW5lZFxyXG5cclxuICAgIGlmKHRoYXQuaGFzRXJyb3IpXHJcbiAgICAgICAgdGhhdC5lcnJvciA9IHZhbHVlXHJcbiAgICBlbHNlIGlmKHRoYXQuaGFzTmV4dClcclxuICAgICAgICB0aGF0Lm5leHQgPSB2YWx1ZVxyXG4gICAgZWxzZVxyXG4gICAgICAgIHRoYXQucmVzdWx0ID0gdmFsdWVcclxuXHJcbiAgICBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIHRoYXQucXVldWUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4ZWN1dGVDYWxsYmFja3ModGhhdCwgY2FsbGJhY2tzKSB7XHJcbiAgICBpZihjYWxsYmFja3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uKGNiKSB7XHJcbiAgICAgICAgICAgICAgICBjYi5hcHBseSh0aGF0KVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0sMClcclxuICAgIH1cclxufVxyXG4iLCIvLyByZXNvbHZlcyB2YXJhcmdzIHZhcmlhYmxlIGludG8gbW9yZSB1c2FibGUgZm9ybVxuLy8gYXJncyAtIHNob3VsZCBiZSBhIGZ1bmN0aW9uIGFyZ3VtZW50cyB2YXJpYWJsZVxuLy8gcmV0dXJucyBhIGphdmFzY3JpcHQgQXJyYXkgb2JqZWN0IG9mIGFyZ3VtZW50cyB0aGF0IGRvZXNuJ3QgY291bnQgdHJhaWxpbmcgdW5kZWZpbmVkIHZhbHVlcyBpbiB0aGUgbGVuZ3RoXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRoZUFyZ3VtZW50cykge1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhlQXJndW1lbnRzLCAwKVxuXG4gICAgdmFyIGNvdW50ID0gMDtcbiAgICBmb3IodmFyIG49YXJncy5sZW5ndGgtMTsgbj49MDsgbi0tKSB7XG4gICAgICAgIGlmKGFyZ3Nbbl0gPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGNvdW50KytcbiAgICB9XG4gICAgYXJncy5zcGxpY2UoLTAsIGNvdW50KVxuICAgIHJldHVybiBhcmdzXG59IiwiLyogQ29weXJpZ2h0IChjKSAyMDEzIEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xyXG5cclxudmFyIHRyaW1BcmdzID0gcmVxdWlyZShcInRyaW1Bcmd1bWVudHNcIilcclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZ1dHVyZVxyXG5cclxuRnV0dXJlLmRlYnVnID0gZmFsc2UgLy8gc3dpdGNoIHRoaXMgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBpZHMgYW5kIGxvbmcgc3RhY2sgdHJhY2VzXHJcblxyXG52YXIgY3VySWQgPSAwICAgICAgICAgLy8gZm9yIGlkc1xcXHJcbmZ1bmN0aW9uIEZ1dHVyZSh2YWx1ZSkge1xyXG5cdGlmKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcblx0XHR2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgICAgIGYucmV0dXJuKHZhbHVlKVxyXG4gICAgICAgIHJldHVybiBmXHJcblx0fSBlbHNlIHtcclxuICAgICAgICB0aGlzLmlzUmVzb2x2ZWQgPSBmYWxzZVxyXG4gICAgICAgIHRoaXMucXVldWUgPSBbXVxyXG4gICAgICAgIHRoaXMubiA9IDEgLy8gZnV0dXJlIGRlcHRoIChmb3IgcHJldmVudGluZyBcInRvbyBtdWNoIHJlY3Vyc2lvblwiIFJhbmdlRXJyb3JzKVxyXG4gICAgICAgIGlmKEZ1dHVyZS5kZWJ1Zykge1xyXG4gICAgICAgICAgICBjdXJJZCsrXHJcbiAgICAgICAgICAgIHRoaXMuaWQgPSBjdXJJZFxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gc3RhdGljIG1ldGhvZHNcclxuXHJcbi8vIGhhcyBvbmUgcGFyYW1ldGVyOiBlaXRoZXIgYSBidW5jaCBvZiBmdXR1cmVzLCBvciBhIHNpbmdsZSBhcnJheSBvZiBmdXR1cmVzXHJcbi8vIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBvbmUgb2YgdGhlbSBlcnJvcnMsIG9yIHdoZW4gYWxsIG9mIHRoZW0gc3VjY2VlZHNcclxuRnV0dXJlLmFsbCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQXJyYXkpIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IGFyZ3VtZW50c1swXVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgZnV0dXJlcyA9IHRyaW1BcmdzKGFyZ3VtZW50cylcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZiA9IG5ldyBGdXR1cmUoKVxyXG4gICAgdmFyIHJlc3VsdHMgPSBbXVxyXG5cclxuICAgIGlmKGZ1dHVyZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhciBjdXJyZW50ID0gZnV0dXJlc1swXVxyXG4gICAgICAgIGZ1dHVyZXMuZm9yRWFjaChmdW5jdGlvbihmdXR1cmUsIGluZGV4KSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnRoZW4oZnVuY3Rpb24odikge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0c1tpbmRleF0gPSB2XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnV0dXJlc1tpbmRleCsxXVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC8vaWZcclxuICAgICAgICBjdXJyZW50LmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLy8gZWxzZVxyXG4gICAgICAgIGN1cnJlbnQudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4ocmVzdWx0cylcclxuICAgICAgICB9KVxyXG5cclxuXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGYucmV0dXJuKHJlc3VsdHMpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gZWl0aGVyIHVzZWQgbGlrZSBmdXR1cmVXcmFwKGZ1bmN0aW9uKCl7IC4uLiB9KShhcmcxLGFyZzIsZXRjKSBvclxyXG4vLyAgZnV0dXJlV3JhcChvYmplY3QsICdtZXRob2ROYW1lJykoYXJnMSxhcmcyLGV0YylcclxuRnV0dXJlLndyYXAgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIGZ1bmN0aW9uXHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgdmFyIGZuID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgdmFyIG9iamVjdCA9IHVuZGVmaW5lZFxyXG5cclxuXHJcbiAgICAvLyBvYmplY3QsIGZ1bmN0aW9uXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBvYmplY3QgPSBhcmd1bWVudHNbMF1cclxuICAgICAgICB2YXIgZm4gPSBvYmplY3RbYXJndW1lbnRzWzFdXVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cylcclxuICAgICAgICB2YXIgZnV0dXJlID0gbmV3IEZ1dHVyZVxyXG4gICAgICAgIGFyZ3MucHVzaChmdXR1cmUucmVzb2x2ZXIoKSlcclxuICAgICAgICB2YXIgbWUgPSB0aGlzXHJcbiAgICAgICAgaWYob2JqZWN0KSBtZSA9IG9iamVjdFxyXG4gICAgICAgIGZuLmFwcGx5KG1lLCBhcmdzKVxyXG4gICAgICAgIHJldHVybiBmdXR1cmVcclxuICAgIH1cclxufVxyXG5cclxuLy8gZnV0dXJlIHdyYXBzIGEgZnVuY3Rpb24gd2hvJ3MgY2FsbGJhY2sgb25seSB0YWtlcyBvbmUgcGFyYW1ldGVyIC0gdGhlIHJldHVybiB2YWx1ZSAobm8gZXJyb3IgaXMgYXZhaWxhYmxlKVxyXG4vLyBlZzogZnVuY3Rpb24ocmVzdWx0KSB7fVxyXG5GdXR1cmUud3JhcFNpbmdsZVBhcmFtZXRlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgIHZhciBmbiA9IGFyZ3VtZW50c1swXVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgb2JqZWN0ID0gYXJndW1lbnRzWzBdXHJcbiAgICAgICAgdmFyIG1ldGhvZCA9IGFyZ3VtZW50c1sxXVxyXG4gICAgICAgIHZhciBmbiA9IG9iamVjdFttZXRob2RdXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxyXG5cdFx0dmFyIGZ1dHVyZSA9IG5ldyBGdXR1cmVcclxuXHRcdGFyZ3MucHVzaChmdW5jdGlvbihyZXN1bHQpIHtcclxuXHRcdCAgICBmdXR1cmUucmV0dXJuKHJlc3VsdClcclxuXHRcdH0pXHJcblx0XHR2YXIgbWUgPSB0aGlzXHJcbiAgICAgICAgaWYob2JqZWN0KSBtZSA9IG9iamVjdFxyXG4gICAgICAgIGZuLmFwcGx5KG1lLCBhcmdzKVxyXG5cdFx0cmV0dXJuIGZ1dHVyZVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuLy8gZGVmYXVsdFxyXG52YXIgdW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICB0aHJvdyBlXHJcbiAgICB9LDApXHJcbn1cclxuXHJcbi8vIHNldHVwIHVuaGFuZGxlZCBlcnJvciBoYW5kbGVyXHJcbi8vIHVuaGFuZGxlZCBlcnJvcnMgaGFwcGVuIHdoZW4gZG9uZSBpcyBjYWxsZWQsIGFuZCAgdGhlbiBhbiBleGNlcHRpb24gaXMgdGhyb3duIGZyb20gdGhlIGZ1dHVyZVxyXG5GdXR1cmUuZXJyb3IgPSBmdW5jdGlvbihoYW5kbGVyKSB7XHJcbiAgICB1bmhhbmRsZWRFcnJvckhhbmRsZXIgPSBoYW5kbGVyXHJcbn1cclxuXHJcbi8vIGluc3RhbmNlIG1ldGhvZHNcclxuXHJcbi8vIHJldHVybnMgYSB2YWx1ZSBmb3IgdGhlIGZ1dHVyZSAoY2FuIG9ubHkgYmUgZXhlY3V0ZWQgb25jZSlcclxuLy8gaWYgdGhlcmUgYXJlIGNhbGxiYWNrcyB3YWl0aW5nIG9uIHRoaXMgdmFsdWUsIHRoZXkgYXJlIHJ1biBpbiB0aGUgbmV4dCB0aWNrXHJcbiAgICAvLyAoaWUgdGhleSBhcmVuJ3QgcnVuIGltbWVkaWF0ZWx5LCBhbGxvd2luZyB0aGUgY3VycmVudCB0aHJlYWQgb2YgZXhlY3V0aW9uIHRvIGNvbXBsZXRlKVxyXG5GdXR1cmUucHJvdG90eXBlLnJldHVybiA9IGZ1bmN0aW9uKHYpIHtcclxuICAgIHJlc29sdmUodGhpcywgJ3JldHVybicsIHYpXHJcbn1cclxuRnV0dXJlLnByb3RvdHlwZS50aHJvdyA9IGZ1bmN0aW9uKGUpIHtcclxuICAgIGlmKHRoaXMubG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGUuc3RhY2sgKz0gJ1xcbiAgICAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4nK3RoaXMubG9jYXRpb24uc3RhY2suc3BsaXQoJ1xcbicpLnNsaWNlKDQpLmpvaW4oJ1xcbicpXHJcbiAgICB9XHJcbiAgICByZXNvbHZlKHRoaXMsICdlcnJvcicsIGUpXHJcbiAgICByZXR1cm4gdGhpc1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXROZXh0KHRoYXQsIGZ1dHVyZSkge1xyXG4gICAgcmVzb2x2ZSh0aGF0LCAnbmV4dCcsIGZ1dHVyZSlcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdCh0aGF0LCBjYikge1xyXG4gICAgaWYodGhhdC5pc1Jlc29sdmVkKSB7XHJcbiAgICAgICAgZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBbY2JdKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGF0LnF1ZXVlLnB1c2goY2IpXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIGR1Y2sgdHlwaW5nIHRvIGRldGVybWluZSBpZiBzb21ldGhpbmcgaXMgb3IgaXNuJ3QgYSBmdXR1cmVcclxudmFyIGlzTGlrZUFGdXR1cmUgPSBGdXR1cmUuaXNMaWtlQUZ1dHVyZSA9IGZ1bmN0aW9uKHgpIHtcclxuICAgIHJldHVybiB4LmlzUmVzb2x2ZWQgIT09IHVuZGVmaW5lZCAmJiB4LnF1ZXVlICE9PSB1bmRlZmluZWQgJiYgeC50aGVuICE9PSB1bmRlZmluZWRcclxufVxyXG5cclxuZnVuY3Rpb24gd2FpdE9uUmVzdWx0KGYsIHJlc3VsdCwgY2IpIHtcclxuICAgIHdhaXQocmVzdWx0LCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHdhaXRPblJlc3VsdChmLCB0aGlzLm5leHQsIGNiKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGV4ZWN1dGVDYWxsYmFjayhjYix0aGlzLnJlc3VsdCkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxufVxyXG5cclxuXHJcbi8vIGNiIHRha2VzIG9uZSBwYXJhbWV0ZXIgLSB0aGUgdmFsdWUgcmV0dXJuZWRcclxuLy8gY2IgY2FuIHJldHVybiBhIEZ1dHVyZSwgaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IG9mIHRoYXQgRnV0dXJlIGlzIHBhc3NlZCB0byBuZXh0LWluLWNoYWluXHJcbkZ1dHVyZS5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IGNyZWF0ZUNoYWluRnV0dXJlKHRoaXMpXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpXHJcbiAgICAgICAgICAgIGYudGhyb3codGhpcy5lcnJvcilcclxuICAgICAgICBlbHNlIGlmKHRoaXMuaGFzTmV4dClcclxuICAgICAgICAgICAgd2FpdE9uUmVzdWx0KGYsIHRoaXMubmV4dCwgY2IpXHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGV4ZWN1dGVDYWxsYmFjayhjYix0aGlzLnJlc3VsdCkpXHJcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgb25lIHBhcmFtZXRlciAtIHRoZSBlcnJvciBjYXVnaHRcclxuLy8gY2IgY2FuIHJldHVybiBhIEZ1dHVyZSwgaW4gd2hpY2ggY2FzZSB0aGUgcmVzdWx0IG9mIHRoYXQgRnV0dXJlIGlzIHBhc3NlZCB0byBuZXh0LWluLWNoYWluXHJcbkZ1dHVyZS5wcm90b3R5cGUuY2F0Y2ggPSBmdW5jdGlvbihjYikge1xyXG4gICAgdmFyIGYgPSBjcmVhdGVDaGFpbkZ1dHVyZSh0aGlzKVxyXG4gICAgd2FpdCh0aGlzLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpZih0aGlzLmhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBzZXROZXh0KGYsIGV4ZWN1dGVDYWxsYmFjayhjYix0aGlzLmVycm9yKSlcclxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYodGhpcy5oYXNOZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgIGYucmV0dXJuKHYpXHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0TmV4dChmLCBleGVjdXRlQ2FsbGJhY2soY2IsZSkpXHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZi5yZXR1cm4odGhpcy5yZXN1bHQpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJldHVybiBmXHJcbn1cclxuLy8gY2IgdGFrZXMgbm8gcGFyYW1ldGVyc1xyXG4vLyBjYWxsYmFjaydzIHJldHVybiB2YWx1ZSBpcyBpZ25vcmVkLCBidXQgdGhyb3duIGV4Y2VwdGlvbnMgcHJvcG9nYXRlIG5vcm1hbGx5XHJcbkZ1dHVyZS5wcm90b3R5cGUuZmluYWxseSA9IGZ1bmN0aW9uKGNiKSB7XHJcbiAgICB2YXIgZiA9IGNyZWF0ZUNoYWluRnV0dXJlKHRoaXMpXHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpc1xyXG4gICAgICAgICAgICBpZih0aGlzLmhhc05leHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubmV4dC50aGVuKGZ1bmN0aW9uKHYpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IGV4ZWN1dGVDYWxsYmFjayhjYilcclxuICAgICAgICAgICAgICAgICAgICBmLnJldHVybih2KVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4XHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBleGVjdXRlQ2FsbGJhY2soY2IpXHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4XHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIEZ1dHVyZSh0cnVlKS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBleGVjdXRlQ2FsbGJhY2soY2IpXHJcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGYudGhyb3codGhhdC5lcnJvcilcclxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBmLnRocm93KGUpXHJcbiAgICAgICAgICAgICAgICB9KS5kb25lKClcclxuXHJcbiAgICAgICAgICAgIH0gZWxzZSAge1xyXG4gICAgICAgICAgICAgICAgRnV0dXJlKHRydWUpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4ZWN1dGVDYWxsYmFjayhjYilcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi5yZXR1cm4odGhhdC5yZXN1bHQpXHJcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgICAgICAgICAgfSkuZG9uZSgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAgICAgZi50aHJvdyhlKVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcbiAgICByZXR1cm4gZlxyXG59XHJcblxyXG4vLyBhIGZ1dHVyZSBjcmVhdGVkIGZvciB0aGUgY2hhaW4gZnVuY3Rpb25zICh0aGVuLCBjYXRjaCwgYW5kIGZpbmFsbHkpXHJcbmZ1bmN0aW9uIGNyZWF0ZUNoYWluRnV0dXJlKHRoYXQpIHtcclxuICAgIHZhciBmID0gbmV3IEZ1dHVyZVxyXG4gICAgZi5uID0gdGhhdC5uICsgMVxyXG4gICAgaWYoRnV0dXJlLmRlYnVnKSB7XHJcbiAgICAgICAgZi5sb2NhdGlvbiA9IGNyZWF0ZUV4Y2VwdGlvbigpICAvLyB1c2VkIGZvciBsb25nIHRyYWNlc1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZcclxufVxyXG5cclxuLy8gYWxsIHVudXNlZCBmdXR1cmVzIHNob3VsZCBlbmQgd2l0aCB0aGlzIChlLmcuIG1vc3QgdGhlbi1jaGFpbnMpXHJcbi8vIGRldGF0Y2hlcyB0aGUgZnV0dXJlIHNvIGFueSBwcm9wb2dhdGVkIGV4Y2VwdGlvbiBpcyB0aHJvd24gKHNvIHRoZSBleGNlcHRpb24gaXNuJ3Qgc2lsZW50bHkgbG9zdClcclxuRnV0dXJlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24oKSB7XHJcbiAgICB3YWl0KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmKHRoaXMuaGFzRXJyb3IpIHtcclxuICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKHRoaXMuZXJyb3IpXHJcbiAgICAgICAgfSBlbHNlIGlmKHRoaXMuaGFzTmV4dCkge1xyXG4gICAgICAgICAgICB0aGlzLm5leHQuY2F0Y2goZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKGUpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxufVxyXG5cclxuXHJcblxyXG5GdXR1cmUucHJvdG90eXBlLnJlc29sdmVyID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgbWUgPSB0aGlzXHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGUsdikge1xyXG4gICAgICAgIGlmKGUpIHsgLy8gZXJyb3IgYXJndW1lbnRcclxuICAgICAgICAgICAgbWUudGhyb3coZSlcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBtZS5yZXR1cm4odilcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbkZ1dHVyZS5wcm90b3R5cGUucmVzb2x2ZWQgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB0aGlzLmlzUmVzb2x2ZWRcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmUodGhhdCwgdHlwZSwgdmFsdWUpIHtcclxuICAgIGlmKHRoYXQuaXNSZXNvbHZlZClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIkZ1dHVyZSByZXNvbHZlZCBtb3JlIHRoYW4gb25jZSEgUmVzb2x1dGlvbjogXCIrdmFsdWUpXHJcblxyXG4gICAgdGhhdC5pc1Jlc29sdmVkID0gdHJ1ZVxyXG4gICAgdGhhdC5oYXNFcnJvciA9IHR5cGUgPT09ICdlcnJvcidcclxuICAgIHRoYXQuaGFzTmV4dCA9IHR5cGUgPT09ICduZXh0JyAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkXHJcblxyXG4gICAgaWYodGhhdC5oYXNFcnJvcilcclxuICAgICAgICB0aGF0LmVycm9yID0gdmFsdWVcclxuICAgIGVsc2UgaWYodGhhdC5oYXNOZXh0KVxyXG4gICAgICAgIHRoYXQubmV4dCA9IHZhbHVlXHJcbiAgICBlbHNlXHJcbiAgICAgICAgdGhhdC5yZXN1bHQgPSB2YWx1ZVxyXG5cclxuICAgIC8vIDEwMCBpcyBhIHByZXR0eSBhcmJpdHJhcnkgbnVtYmVyIC0gaXQgc2hvdWxkIGJlIHNldCBzaWduaWZpY2FudGx5IGxvd2VyIHRoYW4gY29tbW9uIG1heGltdW0gc3RhY2sgZGVwdGhzLCBhbmQgaGlnaCBlbm91Z2ggdG8gbWFrZSBzdXJlIHBlcmZvcm1hbmNlIGlzbid0IHNpZ25pZmljYW50bHkgYWZmZWN0ZWRcclxuICAgIC8vIGluIHVzaW5nIHRoaXMgZm9yIGRlYWR1bml0LCBmaXJlZm94IHdhcyBnZXR0aW5nIGEgcmVjdXJzaW9uIGVycm9yIGF0IDE1MCwgYnV0IG5vdCBhdCAxMDAuIFRoaXMgZG9lc24ndCBtZWFuIHRoYXQgaXQgY2FuJ3QgaGFwcGVuIGF0IDEwMCB0b28sIGJ1dCBpdCdsbCBjZXJ0YWlubHkgbWFrZSBpdCBsZXNzIGxpa2VseVxyXG4gICAgLy8gaWYgeW91J3JlIGdldHRpbmcgcmVjdXJzaW9uIGVycm9ycyBldmVuIHdpdGggdGhpcyBtZWNoYW5pc20sIHlvdSBwcm9iYWJseSBuZWVkIHRvIGZpZ3VyZSB0aGF0IG91dCBpbiB5b3VyIG93biBjb2RlXHJcbiAgICBpZih0aGF0Lm4gJSAxMDAgIT09IDApIHtcclxuICAgICAgICBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIHRoYXQucXVldWUpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IC8vIHRoaXMgcHJldmVudHMgdG9vIG11Y2ggcmVjdXJzaW9uIGVycm9yc1xyXG4gICAgICAgICAgICBleGVjdXRlQ2FsbGJhY2tzKHRoYXQsIHRoYXQucXVldWUpXHJcbiAgICAgICAgfSwgMClcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZXhlY3V0ZUNhbGxiYWNrcyh0aGF0LCBjYWxsYmFja3MpIHtcclxuICAgIGlmKGNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24oY2IpIHtcclxuICAgICAgICAgICAgICAgIGNiLmFwcGx5KHRoYXQpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBjYXRjaChlKSB7XHJcbiAgICAgICAgICAgIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gZXhlY3V0ZXMgYSBjYWxsYmFjayBhbmQgZW5zdXJlcyB0aGF0IGl0IHJldHVybnMgYSBmdXR1cmVcclxuZnVuY3Rpb24gZXhlY3V0ZUNhbGxiYWNrKGNiLCBhcmcpIHtcclxuICAgIHZhciByID0gY2IoYXJnKVxyXG4gICAgaWYociAhPT0gdW5kZWZpbmVkICYmICFpc0xpa2VBRnV0dXJlKHIpIClcclxuICAgICAgICB0aHJvdyBFcnJvcihcIlZhbHVlIHJldHVybmVkIGZyb20gdGhlbiBvciBjYXRjaCAoXCIrcitcIikgaXMgKm5vdCogYSBGdXR1cmUuIENhbGxiYWNrOiBcIitjYi50b1N0cmluZygpKVxyXG5cclxuICAgIHJldHVybiByXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUV4Y2VwdGlvbigpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKClcclxuICAgIH0gY2F0Y2goZSkge1xyXG4gICAgICAgIHJldHVybiBlXHJcbiAgICB9XHJcbn0iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIFNwbGl0IGEgZmlsZW5hbWUgaW50byBbcm9vdCwgZGlyLCBiYXNlbmFtZSwgZXh0XSwgdW5peCB2ZXJzaW9uXG4vLyAncm9vdCcgaXMganVzdCBhIHNsYXNoLCBvciBub3RoaW5nLlxudmFyIHNwbGl0UGF0aFJlID1cbiAgICAvXihcXC8/fCkoW1xcc1xcU10qPykoKD86XFwuezEsMn18W15cXC9dKz98KShcXC5bXi5cXC9dKnwpKSg/OltcXC9dKikkLztcbnZhciBzcGxpdFBhdGggPSBmdW5jdGlvbihmaWxlbmFtZSkge1xuICByZXR1cm4gc3BsaXRQYXRoUmUuZXhlYyhmaWxlbmFtZSkuc2xpY2UoMSk7XG59O1xuXG4vLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlc29sdmUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlc29sdmVkUGF0aCA9ICcnLFxuICAgICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSA+PSAtMSAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG4gICAgdmFyIHBhdGggPSAoaSA+PSAwKSA/IGFyZ3VtZW50c1tpXSA6IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAvLyBTa2lwIGVtcHR5IGFuZCBpbnZhbGlkIGVudHJpZXNcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5yZXNvbHZlIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH0gZWxzZSBpZiAoIXBhdGgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckF0KDApID09PSAnLyc7XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gIC8vIGhhbmRsZSByZWxhdGl2ZSBwYXRocyB0byBiZSBzYWZlIChtaWdodCBoYXBwZW4gd2hlbiBwcm9jZXNzLmN3ZCgpIGZhaWxzKVxuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocmVzb2x2ZWRQYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIXJlc29sdmVkQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICByZXR1cm4gKChyZXNvbHZlZEFic29sdXRlID8gJy8nIDogJycpICsgcmVzb2x2ZWRQYXRoKSB8fCAnLic7XG59O1xuXG4vLyBwYXRoLm5vcm1hbGl6ZShwYXRoKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5ub3JtYWxpemUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciBpc0Fic29sdXRlID0gZXhwb3J0cy5pc0Fic29sdXRlKHBhdGgpLFxuICAgICAgdHJhaWxpbmdTbGFzaCA9IHN1YnN0cihwYXRoLCAtMSkgPT09ICcvJztcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIWlzQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICBpZiAoIXBhdGggJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBwYXRoID0gJy4nO1xuICB9XG4gIGlmIChwYXRoICYmIHRyYWlsaW5nU2xhc2gpIHtcbiAgICBwYXRoICs9ICcvJztcbiAgfVxuXG4gIHJldHVybiAoaXNBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHBhdGg7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmlzQWJzb2x1dGUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gIHJldHVybiBleHBvcnRzLm5vcm1hbGl6ZShmaWx0ZXIocGF0aHMsIGZ1bmN0aW9uKHAsIGluZGV4KSB7XG4gICAgaWYgKHR5cGVvZiBwICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGguam9pbiBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9XG4gICAgcmV0dXJuIHA7XG4gIH0pLmpvaW4oJy8nKSk7XG59O1xuXG5cbi8vIHBhdGgucmVsYXRpdmUoZnJvbSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlbGF0aXZlID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgZnJvbSA9IGV4cG9ydHMucmVzb2x2ZShmcm9tKS5zdWJzdHIoMSk7XG4gIHRvID0gZXhwb3J0cy5yZXNvbHZlKHRvKS5zdWJzdHIoMSk7XG5cbiAgZnVuY3Rpb24gdHJpbShhcnIpIHtcbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIGZvciAoOyBzdGFydCA8IGFyci5sZW5ndGg7IHN0YXJ0KyspIHtcbiAgICAgIGlmIChhcnJbc3RhcnRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGFyci5sZW5ndGggLSAxO1xuICAgIGZvciAoOyBlbmQgPj0gMDsgZW5kLS0pIHtcbiAgICAgIGlmIChhcnJbZW5kXSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzdGFydCA+IGVuZCkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIGVuZCAtIHN0YXJ0ICsgMSk7XG4gIH1cblxuICB2YXIgZnJvbVBhcnRzID0gdHJpbShmcm9tLnNwbGl0KCcvJykpO1xuICB2YXIgdG9QYXJ0cyA9IHRyaW0odG8uc3BsaXQoJy8nKSk7XG5cbiAgdmFyIGxlbmd0aCA9IE1hdGgubWluKGZyb21QYXJ0cy5sZW5ndGgsIHRvUGFydHMubGVuZ3RoKTtcbiAgdmFyIHNhbWVQYXJ0c0xlbmd0aCA9IGxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChmcm9tUGFydHNbaV0gIT09IHRvUGFydHNbaV0pIHtcbiAgICAgIHNhbWVQYXJ0c0xlbmd0aCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICB2YXIgb3V0cHV0UGFydHMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHNhbWVQYXJ0c0xlbmd0aDsgaSA8IGZyb21QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIG91dHB1dFBhcnRzLnB1c2goJy4uJyk7XG4gIH1cblxuICBvdXRwdXRQYXJ0cyA9IG91dHB1dFBhcnRzLmNvbmNhdCh0b1BhcnRzLnNsaWNlKHNhbWVQYXJ0c0xlbmd0aCkpO1xuXG4gIHJldHVybiBvdXRwdXRQYXJ0cy5qb2luKCcvJyk7XG59O1xuXG5leHBvcnRzLnNlcCA9ICcvJztcbmV4cG9ydHMuZGVsaW1pdGVyID0gJzonO1xuXG5leHBvcnRzLmRpcm5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciByZXN1bHQgPSBzcGxpdFBhdGgocGF0aCksXG4gICAgICByb290ID0gcmVzdWx0WzBdLFxuICAgICAgZGlyID0gcmVzdWx0WzFdO1xuXG4gIGlmICghcm9vdCAmJiAhZGlyKSB7XG4gICAgLy8gTm8gZGlybmFtZSB3aGF0c29ldmVyXG4gICAgcmV0dXJuICcuJztcbiAgfVxuXG4gIGlmIChkaXIpIHtcbiAgICAvLyBJdCBoYXMgYSBkaXJuYW1lLCBzdHJpcCB0cmFpbGluZyBzbGFzaFxuICAgIGRpciA9IGRpci5zdWJzdHIoMCwgZGlyLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIHJvb3QgKyBkaXI7XG59O1xuXG5cbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbihwYXRoLCBleHQpIHtcbiAgdmFyIGYgPSBzcGxpdFBhdGgocGF0aClbMl07XG4gIC8vIFRPRE86IG1ha2UgdGhpcyBjb21wYXJpc29uIGNhc2UtaW5zZW5zaXRpdmUgb24gd2luZG93cz9cbiAgaWYgKGV4dCAmJiBmLnN1YnN0cigtMSAqIGV4dC5sZW5ndGgpID09PSBleHQpIHtcbiAgICBmID0gZi5zdWJzdHIoMCwgZi5sZW5ndGggLSBleHQubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gZjtcbn07XG5cblxuZXhwb3J0cy5leHRuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gc3BsaXRQYXRoKHBhdGgpWzNdO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIkQ6XFxcXGJpbGx5c0ZpbGVcXFxcY29kZVxcXFxqYXZhc2NyaXB0XFxcXG5vZGVqc1xcXFxtb2R1bGVzXFxcXGRlYWR1bml0Q29yZVxcXFxub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeVxcXFxub2RlX21vZHVsZXNcXFxcaW5zZXJ0LW1vZHVsZS1nbG9iYWxzXFxcXG5vZGVfbW9kdWxlc1xcXFxwcm9jZXNzXFxcXGJyb3dzZXIuanNcIikpIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohIGh0dHA6Ly9tdGhzLmJlL3B1bnljb2RlIHYxLjIuNCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0LyoqIERldGVjdCBmcmVlIHZhcmlhYmxlcyAqL1xuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXHR2YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuXHRpZiAoZnJlZUdsb2JhbC5nbG9iYWwgPT09IGZyZWVHbG9iYWwgfHwgZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwpIHtcblx0XHRyb290ID0gZnJlZUdsb2JhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYHB1bnljb2RlYCBvYmplY3QuXG5cdCAqIEBuYW1lIHB1bnljb2RlXG5cdCAqIEB0eXBlIE9iamVjdFxuXHQgKi9cblx0dmFyIHB1bnljb2RlLFxuXG5cdC8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cblx0bWF4SW50ID0gMjE0NzQ4MzY0NywgLy8gYWthLiAweDdGRkZGRkZGIG9yIDJeMzEtMVxuXG5cdC8qKiBCb290c3RyaW5nIHBhcmFtZXRlcnMgKi9cblx0YmFzZSA9IDM2LFxuXHR0TWluID0gMSxcblx0dE1heCA9IDI2LFxuXHRza2V3ID0gMzgsXG5cdGRhbXAgPSA3MDAsXG5cdGluaXRpYWxCaWFzID0gNzIsXG5cdGluaXRpYWxOID0gMTI4LCAvLyAweDgwXG5cdGRlbGltaXRlciA9ICctJywgLy8gJ1xceDJEJ1xuXG5cdC8qKiBSZWd1bGFyIGV4cHJlc3Npb25zICovXG5cdHJlZ2V4UHVueWNvZGUgPSAvXnhuLS0vLFxuXHRyZWdleE5vbkFTQ0lJID0gL1teIC1+XS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9cXHgyRXxcXHUzMDAyfFxcdUZGMEV8XFx1RkY2MS9nLCAvLyBSRkMgMzQ5MCBzZXBhcmF0b3JzXG5cblx0LyoqIEVycm9yIG1lc3NhZ2VzICovXG5cdGVycm9ycyA9IHtcblx0XHQnb3ZlcmZsb3cnOiAnT3ZlcmZsb3c6IGlucHV0IG5lZWRzIHdpZGVyIGludGVnZXJzIHRvIHByb2Nlc3MnLFxuXHRcdCdub3QtYmFzaWMnOiAnSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KScsXG5cdFx0J2ludmFsaWQtaW5wdXQnOiAnSW52YWxpZCBpbnB1dCdcblx0fSxcblxuXHQvKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5cdGJhc2VNaW51c1RNaW4gPSBiYXNlIC0gdE1pbixcblx0Zmxvb3IgPSBNYXRoLmZsb29yLFxuXHRzdHJpbmdGcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLFxuXG5cdC8qKiBUZW1wb3JhcnkgdmFyaWFibGUgKi9cblx0a2V5O1xuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgZXJyb3IgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIGVycm9yIHR5cGUuXG5cdCAqIEByZXR1cm5zIHtFcnJvcn0gVGhyb3dzIGEgYFJhbmdlRXJyb3JgIHdpdGggdGhlIGFwcGxpY2FibGUgZXJyb3IgbWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGVycm9yKHR5cGUpIHtcblx0XHR0aHJvdyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdGFycmF5W2xlbmd0aF0gPSBmbihhcnJheVtsZW5ndGhdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHRyZXR1cm4gbWFwKHN0cmluZy5zcGxpdChyZWdleFNlcGFyYXRvcnMpLCBmbikuam9pbignLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuNCcsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHB1bnljb2RlO1xuXHRcdH0gZWxzZSB7IC8vIGluIE5hcndoYWwgb3IgUmluZ29KUyB2MC43LjAtXG5cdFx0XHRmb3IgKGtleSBpbiBwdW55Y29kZSkge1xuXHRcdFx0XHRwdW55Y29kZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gcHVueWNvZGVba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC5wdW55Y29kZSA9IHB1bnljb2RlO1xuXHR9XG5cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuZXhwb3J0cy5VcmwgPSBVcmw7XG5cbmZ1bmN0aW9uIFVybCgpIHtcbiAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gIHRoaXMuYXV0aCA9IG51bGw7XG4gIHRoaXMuaG9zdCA9IG51bGw7XG4gIHRoaXMucG9ydCA9IG51bGw7XG4gIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICB0aGlzLmhhc2ggPSBudWxsO1xuICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gIHRoaXMucXVlcnkgPSBudWxsO1xuICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcbiAgdGhpcy5wYXRoID0gbnVsbDtcbiAgdGhpcy5ocmVmID0gbnVsbDtcbn1cblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbnZhciBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pLFxuICAgIHBvcnRQYXR0ZXJuID0gLzpbMC05XSokLyxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIHJlc2VydmVkIGZvciBkZWxpbWl0aW5nIFVSTHMuXG4gICAgLy8gV2UgYWN0dWFsbHkganVzdCBhdXRvLWVzY2FwZSB0aGVzZS5cbiAgICBkZWxpbXMgPSBbJzwnLCAnPicsICdcIicsICdgJywgJyAnLCAnXFxyJywgJ1xcbicsICdcXHQnXSxcblxuICAgIC8vIFJGQyAyMzk2OiBjaGFyYWN0ZXJzIG5vdCBhbGxvd2VkIGZvciB2YXJpb3VzIHJlYXNvbnMuXG4gICAgdW53aXNlID0gWyd7JywgJ30nLCAnfCcsICdcXFxcJywgJ14nLCAnYCddLmNvbmNhdChkZWxpbXMpLFxuXG4gICAgLy8gQWxsb3dlZCBieSBSRkNzLCBidXQgY2F1c2Ugb2YgWFNTIGF0dGFja3MuICBBbHdheXMgZXNjYXBlIHRoZXNlLlxuICAgIGF1dG9Fc2NhcGUgPSBbJ1xcJyddLmNvbmNhdCh1bndpc2UpLFxuICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUuXG4gICAgLy8gTm90ZSB0aGF0IGFueSBpbnZhbGlkIGNoYXJzIGFyZSBhbHNvIGhhbmRsZWQsIGJ1dCB0aGVzZVxuICAgIC8vIGFyZSB0aGUgb25lcyB0aGF0IGFyZSAqZXhwZWN0ZWQqIHRvIGJlIHNlZW4sIHNvIHdlIGZhc3QtcGF0aFxuICAgIC8vIHRoZW0uXG4gICAgbm9uSG9zdENoYXJzID0gWyclJywgJy8nLCAnPycsICc7JywgJyMnXS5jb25jYXQoYXV0b0VzY2FwZSksXG4gICAgaG9zdEVuZGluZ0NoYXJzID0gWycvJywgJz8nLCAnIyddLFxuICAgIGhvc3RuYW1lTWF4TGVuID0gMjU1LFxuICAgIGhvc3RuYW1lUGFydFBhdHRlcm4gPSAvXlthLXowLTlBLVpfLV17MCw2M30kLyxcbiAgICBob3N0bmFtZVBhcnRTdGFydCA9IC9eKFthLXowLTlBLVpfLV17MCw2M30pKC4qKSQvLFxuICAgIC8vIHByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuICAgIHVuc2FmZVByb3RvY29sID0ge1xuICAgICAgJ2phdmFzY3JpcHQnOiB0cnVlLFxuICAgICAgJ2phdmFzY3JpcHQ6JzogdHJ1ZVxuICAgIH0sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgbmV2ZXIgaGF2ZSBhIGhvc3RuYW1lLlxuICAgIGhvc3RsZXNzUHJvdG9jb2wgPSB7XG4gICAgICAnamF2YXNjcmlwdCc6IHRydWUsXG4gICAgICAnamF2YXNjcmlwdDonOiB0cnVlXG4gICAgfSxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBhbHdheXMgY29udGFpbiBhIC8vIGJpdC5cbiAgICBzbGFzaGVkUHJvdG9jb2wgPSB7XG4gICAgICAnaHR0cCc6IHRydWUsXG4gICAgICAnaHR0cHMnOiB0cnVlLFxuICAgICAgJ2Z0cCc6IHRydWUsXG4gICAgICAnZ29waGVyJzogdHJ1ZSxcbiAgICAgICdmaWxlJzogdHJ1ZSxcbiAgICAgICdodHRwOic6IHRydWUsXG4gICAgICAnaHR0cHM6JzogdHJ1ZSxcbiAgICAgICdmdHA6JzogdHJ1ZSxcbiAgICAgICdnb3BoZXI6JzogdHJ1ZSxcbiAgICAgICdmaWxlOic6IHRydWVcbiAgICB9LFxuICAgIHF1ZXJ5c3RyaW5nID0gcmVxdWlyZSgncXVlcnlzdHJpbmcnKTtcblxuZnVuY3Rpb24gdXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodXJsICYmIGlzT2JqZWN0KHVybCkgJiYgdXJsIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gdXJsO1xuXG4gIHZhciB1ID0gbmV3IFVybDtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cblVybC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbih1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICghaXNTdHJpbmcodXJsKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICsgdHlwZW9mIHVybCk7XG4gIH1cblxuICB2YXIgcmVzdCA9IHVybDtcblxuICAvLyB0cmltIGJlZm9yZSBwcm9jZWVkaW5nLlxuICAvLyBUaGlzIGlzIHRvIHN1cHBvcnQgcGFyc2Ugc3R1ZmYgbGlrZSBcIiAgaHR0cDovL2Zvby5jb20gIFxcblwiXG4gIHJlc3QgPSByZXN0LnRyaW0oKTtcblxuICB2YXIgcHJvdG8gPSBwcm90b2NvbFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgaWYgKHByb3RvKSB7XG4gICAgcHJvdG8gPSBwcm90b1swXTtcbiAgICB2YXIgbG93ZXJQcm90byA9IHByb3RvLnRvTG93ZXJDYXNlKCk7XG4gICAgdGhpcy5wcm90b2NvbCA9IGxvd2VyUHJvdG87XG4gICAgcmVzdCA9IHJlc3Quc3Vic3RyKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCByZXN0Lm1hdGNoKC9eXFwvXFwvW15AXFwvXStAW15AXFwvXSsvKSkge1xuICAgIHZhciBzbGFzaGVzID0gcmVzdC5zdWJzdHIoMCwgMikgPT09ICcvLyc7XG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnN1YnN0cigyKTtcbiAgICAgIHRoaXMuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJlxuICAgICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSkpIHtcblxuICAgIC8vIHRoZXJlJ3MgYSBob3N0bmFtZS5cbiAgICAvLyB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgLywgPywgOywgb3IgIyBlbmRzIHRoZSBob3N0LlxuICAgIC8vXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBsYXN0IEAgc2lnbiwgdW5sZXNzIHNvbWUgaG9zdC1lbmRpbmcgY2hhcmFjdGVyXG4gICAgLy8gY29tZXMgKmJlZm9yZSogdGhlIEAtc2lnbi5cbiAgICAvLyBVUkxzIGFyZSBvYm5veGlvdXMuXG4gICAgLy9cbiAgICAvLyBleDpcbiAgICAvLyBodHRwOi8vYUBiQGMvID0+IHVzZXI6YUBiIGhvc3Q6Y1xuICAgIC8vIGh0dHA6Ly9hQGI/QGMgPT4gdXNlcjphIGhvc3Q6YyBwYXRoOi8/QGNcblxuICAgIC8vIHYwLjEyIFRPRE8oaXNhYWNzKTogVGhpcyBpcyBub3QgcXVpdGUgaG93IENocm9tZSBkb2VzIHRoaW5ncy5cbiAgICAvLyBSZXZpZXcgb3VyIHRlc3QgY2FzZSBhZ2FpbnN0IGJyb3dzZXJzIG1vcmUgY29tcHJlaGVuc2l2ZWx5LlxuXG4gICAgLy8gZmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3RFbmRpbmdDaGFyc1xuICAgIHZhciBob3N0RW5kID0gLTE7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBob3N0RW5kaW5nQ2hhcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBoZWMgPSByZXN0LmluZGV4T2YoaG9zdEVuZGluZ0NoYXJzW2ldKTtcbiAgICAgIGlmIChoZWMgIT09IC0xICYmIChob3N0RW5kID09PSAtMSB8fCBoZWMgPCBob3N0RW5kKSlcbiAgICAgICAgaG9zdEVuZCA9IGhlYztcbiAgICB9XG5cbiAgICAvLyBhdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAvLyBhdXRoIHBvcnRpb24gY2Fubm90IGdvIHBhc3QsIG9yIHRoZSBsYXN0IEAgY2hhciBpcyB0aGUgZGVjaWRlci5cbiAgICB2YXIgYXV0aCwgYXRTaWduO1xuICAgIGlmIChob3N0RW5kID09PSAtMSkge1xuICAgICAgLy8gYXRTaWduIGNhbiBiZSBhbnl3aGVyZS5cbiAgICAgIGF0U2lnbiA9IHJlc3QubGFzdEluZGV4T2YoJ0AnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gYXRTaWduIG11c3QgYmUgaW4gYXV0aCBwb3J0aW9uLlxuICAgICAgLy8gaHR0cDovL2FAYi9jQGQgPT4gaG9zdDpiIGF1dGg6YSBwYXRoOi9jQGRcbiAgICAgIGF0U2lnbiA9IHJlc3QubGFzdEluZGV4T2YoJ0AnLCBob3N0RW5kKTtcbiAgICB9XG5cbiAgICAvLyBOb3cgd2UgaGF2ZSBhIHBvcnRpb24gd2hpY2ggaXMgZGVmaW5pdGVseSB0aGUgYXV0aC5cbiAgICAvLyBQdWxsIHRoYXQgb2ZmLlxuICAgIGlmIChhdFNpZ24gIT09IC0xKSB7XG4gICAgICBhdXRoID0gcmVzdC5zbGljZSgwLCBhdFNpZ24pO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2UoYXRTaWduICsgMSk7XG4gICAgICB0aGlzLmF1dGggPSBkZWNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgfVxuXG4gICAgLy8gdGhlIGhvc3QgaXMgdGhlIHJlbWFpbmluZyB0byB0aGUgbGVmdCBvZiB0aGUgZmlyc3Qgbm9uLWhvc3QgY2hhclxuICAgIGhvc3RFbmQgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vbkhvc3RDaGFycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhlYyA9IHJlc3QuaW5kZXhPZihub25Ib3N0Q2hhcnNbaV0pO1xuICAgICAgaWYgKGhlYyAhPT0gLTEgJiYgKGhvc3RFbmQgPT09IC0xIHx8IGhlYyA8IGhvc3RFbmQpKVxuICAgICAgICBob3N0RW5kID0gaGVjO1xuICAgIH1cbiAgICAvLyBpZiB3ZSBzdGlsbCBoYXZlIG5vdCBoaXQgaXQsIHRoZW4gdGhlIGVudGlyZSB0aGluZyBpcyBhIGhvc3QuXG4gICAgaWYgKGhvc3RFbmQgPT09IC0xKVxuICAgICAgaG9zdEVuZCA9IHJlc3QubGVuZ3RoO1xuXG4gICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZSgwLCBob3N0RW5kKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZShob3N0RW5kKTtcblxuICAgIC8vIHB1bGwgb3V0IHBvcnQuXG4gICAgdGhpcy5wYXJzZUhvc3QoKTtcblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcblxuICAgIC8vIGlmIGhvc3RuYW1lIGJlZ2lucyB3aXRoIFsgYW5kIGVuZHMgd2l0aCBdXG4gICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgdmFyIGlwdjZIb3N0bmFtZSA9IHRoaXMuaG9zdG5hbWVbMF0gPT09ICdbJyAmJlxuICAgICAgICB0aGlzLmhvc3RuYW1lW3RoaXMuaG9zdG5hbWUubGVuZ3RoIC0gMV0gPT09ICddJztcblxuICAgIC8vIHZhbGlkYXRlIGEgbGl0dGxlLlxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICB2YXIgaG9zdHBhcnRzID0gdGhpcy5ob3N0bmFtZS5zcGxpdCgvXFwuLyk7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGhvc3RwYXJ0cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHBhcnQgPSBob3N0cGFydHNbaV07XG4gICAgICAgIGlmICghcGFydCkgY29udGludWU7XG4gICAgICAgIGlmICghcGFydC5tYXRjaChob3N0bmFtZVBhcnRQYXR0ZXJuKSkge1xuICAgICAgICAgIHZhciBuZXdwYXJ0ID0gJyc7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDAsIGsgPSBwYXJ0Lmxlbmd0aDsgaiA8IGs7IGorKykge1xuICAgICAgICAgICAgaWYgKHBhcnQuY2hhckNvZGVBdChqKSA+IDEyNykge1xuICAgICAgICAgICAgICAvLyB3ZSByZXBsYWNlIG5vbi1BU0NJSSBjaGFyIHdpdGggYSB0ZW1wb3JhcnkgcGxhY2Vob2xkZXJcbiAgICAgICAgICAgICAgLy8gd2UgbmVlZCB0aGlzIHRvIG1ha2Ugc3VyZSBzaXplIG9mIGhvc3RuYW1lIGlzIG5vdFxuICAgICAgICAgICAgICAvLyBicm9rZW4gYnkgcmVwbGFjaW5nIG5vbi1BU0NJSSBieSBub3RoaW5nXG4gICAgICAgICAgICAgIG5ld3BhcnQgKz0gJ3gnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV3cGFydCArPSBwYXJ0W2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB3ZSB0ZXN0IGFnYWluIHdpdGggQVNDSUkgY2hhciBvbmx5XG4gICAgICAgICAgaWYgKCFuZXdwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFBhdHRlcm4pKSB7XG4gICAgICAgICAgICB2YXIgdmFsaWRQYXJ0cyA9IGhvc3RwYXJ0cy5zbGljZSgwLCBpKTtcbiAgICAgICAgICAgIHZhciBub3RIb3N0ID0gaG9zdHBhcnRzLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIHZhciBiaXQgPSBwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFN0YXJ0KTtcbiAgICAgICAgICAgIGlmIChiaXQpIHtcbiAgICAgICAgICAgICAgdmFsaWRQYXJ0cy5wdXNoKGJpdFsxXSk7XG4gICAgICAgICAgICAgIG5vdEhvc3QudW5zaGlmdChiaXRbMl0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vdEhvc3QubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJlc3QgPSAnLycgKyBub3RIb3N0LmpvaW4oJy4nKSArIHJlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdmFsaWRQYXJ0cy5qb2luKCcuJyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5ob3N0bmFtZS5sZW5ndGggPiBob3N0bmFtZU1heExlbikge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICB9XG5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyB0aGUgcGFydCBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgLy8gaGFzIG5vbiBBU0NJSSBjaGFyYWN0ZXJzLiBJLmUuIGl0IGRvc2VudCBtYXR0ZXIgaWZcbiAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgICAgdmFyIGRvbWFpbkFycmF5ID0gdGhpcy5ob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgdmFyIG5ld091dCA9IFtdO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgICd4bi0tJyArIHB1bnljb2RlLmVuY29kZShzKSA6IHMpO1xuICAgICAgfVxuICAgICAgdGhpcy5ob3N0bmFtZSA9IG5ld091dC5qb2luKCcuJyk7XG4gICAgfVxuXG4gICAgdmFyIHAgPSB0aGlzLnBvcnQgPyAnOicgKyB0aGlzLnBvcnQgOiAnJztcbiAgICB2YXIgaCA9IHRoaXMuaG9zdG5hbWUgfHwgJyc7XG4gICAgdGhpcy5ob3N0ID0gaCArIHA7XG4gICAgdGhpcy5ocmVmICs9IHRoaXMuaG9zdDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAvLyB0aGUgaG9zdCBmaWVsZCBzdGlsbCByZXRhaW5zIHRoZW0sIHRob3VnaFxuICAgIGlmIChpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnN1YnN0cigxLCB0aGlzLmhvc3RuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgaWYgKHJlc3RbMF0gIT09ICcvJykge1xuICAgICAgICByZXN0ID0gJy8nICsgcmVzdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBub3cgcmVzdCBpcyBzZXQgdG8gdGhlIHBvc3QtaG9zdCBzdHVmZi5cbiAgLy8gY2hvcCBvZmYgYW55IGRlbGltIGNoYXJzLlxuICBpZiAoIXVuc2FmZVByb3RvY29sW2xvd2VyUHJvdG9dKSB7XG5cbiAgICAvLyBGaXJzdCwgbWFrZSAxMDAlIHN1cmUgdGhhdCBhbnkgXCJhdXRvRXNjYXBlXCIgY2hhcnMgZ2V0XG4gICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgLy8gbmVlZCB0byBiZS5cbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIgYWUgPSBhdXRvRXNjYXBlW2ldO1xuICAgICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChhZSk7XG4gICAgICBpZiAoZXNjID09PSBhZSkge1xuICAgICAgICBlc2MgPSBlc2NhcGUoYWUpO1xuICAgICAgfVxuICAgICAgcmVzdCA9IHJlc3Quc3BsaXQoYWUpLmpvaW4oZXNjKTtcbiAgICB9XG4gIH1cblxuXG4gIC8vIGNob3Agb2ZmIGZyb20gdGhlIHRhaWwgZmlyc3QuXG4gIHZhciBoYXNoID0gcmVzdC5pbmRleE9mKCcjJyk7XG4gIGlmIChoYXNoICE9PSAtMSkge1xuICAgIC8vIGdvdCBhIGZyYWdtZW50IHN0cmluZy5cbiAgICB0aGlzLmhhc2ggPSByZXN0LnN1YnN0cihoYXNoKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZSgwLCBoYXNoKTtcbiAgfVxuICB2YXIgcW0gPSByZXN0LmluZGV4T2YoJz8nKTtcbiAgaWYgKHFtICE9PSAtMSkge1xuICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zdWJzdHIocW0pO1xuICAgIHRoaXMucXVlcnkgPSByZXN0LnN1YnN0cihxbSArIDEpO1xuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICAgIHJlc3QgPSByZXN0LnNsaWNlKDAsIHFtKTtcbiAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgLy8gbm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgfVxuICBpZiAocmVzdCkgdGhpcy5wYXRobmFtZSA9IHJlc3Q7XG4gIGlmIChzbGFzaGVkUHJvdG9jb2xbbG93ZXJQcm90b10gJiZcbiAgICAgIHRoaXMuaG9zdG5hbWUgJiYgIXRoaXMucGF0aG5hbWUpIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gJy8nO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAodGhpcy5wYXRobmFtZSB8fCB0aGlzLnNlYXJjaCkge1xuICAgIHZhciBwID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgICB2YXIgcyA9IHRoaXMuc2VhcmNoIHx8ICcnO1xuICAgIHRoaXMucGF0aCA9IHAgKyBzO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIHRoaXMuaHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZm9ybWF0IGEgcGFyc2VkIG9iamVjdCBpbnRvIGEgdXJsIHN0cmluZ1xuZnVuY3Rpb24gdXJsRm9ybWF0KG9iaikge1xuICAvLyBlbnN1cmUgaXQncyBhbiBvYmplY3QsIGFuZCBub3QgYSBzdHJpbmcgdXJsLlxuICAvLyBJZiBpdCdzIGFuIG9iaiwgdGhpcyBpcyBhIG5vLW9wLlxuICAvLyB0aGlzIHdheSwgeW91IGNhbiBjYWxsIHVybF9mb3JtYXQoKSBvbiBzdHJpbmdzXG4gIC8vIHRvIGNsZWFuIHVwIHBvdGVudGlhbGx5IHdvbmt5IHVybHMuXG4gIGlmIChpc1N0cmluZyhvYmopKSBvYmogPSB1cmxQYXJzZShvYmopO1xuICBpZiAoIShvYmogaW5zdGFuY2VvZiBVcmwpKSByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufVxuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCAnOicpO1xuICAgIGF1dGggKz0gJ0AnO1xuICB9XG5cbiAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCAnJyxcbiAgICAgIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCAnJyxcbiAgICAgIGhhc2ggPSB0aGlzLmhhc2ggfHwgJycsXG4gICAgICBob3N0ID0gZmFsc2UsXG4gICAgICBxdWVyeSA9ICcnO1xuXG4gIGlmICh0aGlzLmhvc3QpIHtcbiAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgfSBlbHNlIGlmICh0aGlzLmhvc3RuYW1lKSB7XG4gICAgaG9zdCA9IGF1dGggKyAodGhpcy5ob3N0bmFtZS5pbmRleE9mKCc6JykgPT09IC0xID9cbiAgICAgICAgdGhpcy5ob3N0bmFtZSA6XG4gICAgICAgICdbJyArIHRoaXMuaG9zdG5hbWUgKyAnXScpO1xuICAgIGlmICh0aGlzLnBvcnQpIHtcbiAgICAgIGhvc3QgKz0gJzonICsgdGhpcy5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5ICYmXG4gICAgICBpc09iamVjdCh0aGlzLnF1ZXJ5KSAmJlxuICAgICAgT2JqZWN0LmtleXModGhpcy5xdWVyeSkubGVuZ3RoKSB7XG4gICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkodGhpcy5xdWVyeSk7XG4gIH1cblxuICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmICgnPycgKyBxdWVyeSkpIHx8ICcnO1xuXG4gIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5zdWJzdHIoLTEpICE9PSAnOicpIHByb3RvY29sICs9ICc6JztcblxuICAvLyBvbmx5IHRoZSBzbGFzaGVkUHJvdG9jb2xzIGdldCB0aGUgLy8uICBOb3QgbWFpbHRvOiwgeG1wcDosIGV0Yy5cbiAgLy8gdW5sZXNzIHRoZXkgaGFkIHRoZW0gdG8gYmVnaW4gd2l0aC5cbiAgaWYgKHRoaXMuc2xhc2hlcyB8fFxuICAgICAgKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQXQoMCkgIT09ICcvJykgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckF0KDApICE9PSAnIycpIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQXQoMCkgIT09ICc/Jykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHBhdGhuYW1lID0gcGF0aG5hbWUucmVwbGFjZSgvWz8jXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICB9KTtcbiAgc2VhcmNoID0gc2VhcmNoLnJlcGxhY2UoJyMnLCAnJTIzJyk7XG5cbiAgcmV0dXJuIHByb3RvY29sICsgaG9zdCArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbn07XG5cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uKHJlbGF0aXZlKSB7XG4gIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QodXJsUGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5mdW5jdGlvbiB1cmxSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbihyZWxhdGl2ZSkge1xuICBpZiAoaXNTdHJpbmcocmVsYXRpdmUpKSB7XG4gICAgdmFyIHJlbCA9IG5ldyBVcmwoKTtcbiAgICByZWwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcbiAgICByZWxhdGl2ZSA9IHJlbDtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSBuZXcgVXJsKCk7XG4gIE9iamVjdC5rZXlzKHRoaXMpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgIHJlc3VsdFtrXSA9IHRoaXNba107XG4gIH0sIHRoaXMpO1xuXG4gIC8vIGhhc2ggaXMgYWx3YXlzIG92ZXJyaWRkZW4sIG5vIG1hdHRlciB3aGF0LlxuICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIC8vIGlmIHRoZSByZWxhdGl2ZSB1cmwgaXMgZW1wdHksIHRoZW4gdGhlcmUncyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgaWYgKHJlbGF0aXZlLmhyZWYgPT09ICcnKSB7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAvLyB0YWtlIGV2ZXJ5dGhpbmcgZXhjZXB0IHRoZSBwcm90b2NvbCBmcm9tIHJlbGF0aXZlXG4gICAgT2JqZWN0LmtleXMocmVsYXRpdmUpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgICAgaWYgKGsgIT09ICdwcm90b2NvbCcpXG4gICAgICAgIHJlc3VsdFtrXSA9IHJlbGF0aXZlW2tdO1xuICAgIH0pO1xuXG4gICAgLy91cmxQYXJzZSBhcHBlbmRzIHRyYWlsaW5nIC8gdG8gdXJscyBsaWtlIGh0dHA6Ly93d3cuZXhhbXBsZS5jb21cbiAgICBpZiAoc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF0gJiZcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gcmVzdWx0LnBhdGhuYW1lID0gJy8nO1xuICAgIH1cblxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHJlc3VsdC5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIE9iamVjdC5rZXlzKHJlbGF0aXZlKS5mb3JFYWNoKGZ1bmN0aW9uKGspIHtcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgICB9KTtcbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICByZXN1bHQucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoIXJlbGF0aXZlLmhvc3QgJiYgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9ICcnO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJztcbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxQYXRoLmpvaW4oJy8nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsYXRpdmUucGF0aG5hbWU7XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8ICcnO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0O1xuICAgIHJlc3VsdC5wb3J0ID0gcmVsYXRpdmUucG9ydDtcbiAgICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgfHwgcmVzdWx0LnNlYXJjaCkge1xuICAgICAgdmFyIHAgPSByZXN1bHQucGF0aG5hbWUgfHwgJyc7XG4gICAgICB2YXIgcyA9IHJlc3VsdC5zZWFyY2ggfHwgJyc7XG4gICAgICByZXN1bHQucGF0aCA9IHAgKyBzO1xuICAgIH1cbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHZhciBpc1NvdXJjZUFicyA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKSxcbiAgICAgIGlzUmVsQWJzID0gKFxuICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJ1xuICAgICAgKSxcbiAgICAgIG11c3RFbmRBYnMgPSAoaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHxcbiAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKSksXG4gICAgICByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicyxcbiAgICAgIHNyY1BhdGggPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KCcvJykgfHwgW10sXG4gICAgICByZWxQYXRoID0gcmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHBzeWNob3RpYyA9IHJlc3VsdC5wcm90b2NvbCAmJiAhc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF07XG5cbiAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSAnJztcbiAgICByZXN1bHQucG9ydCA9IG51bGw7XG4gICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICBpZiAoc3JjUGF0aFswXSA9PT0gJycpIHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDtcbiAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICB9XG4gICAgcmVzdWx0Lmhvc3QgPSAnJztcbiAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gbnVsbDtcbiAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09ICcnKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICB9XG4gICAgICByZWxhdGl2ZS5ob3N0ID0gbnVsbDtcbiAgICB9XG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09ICcnIHx8IHNyY1BhdGhbMF0gPT09ICcnKTtcbiAgfVxuXG4gIGlmIChpc1JlbEFicykge1xuICAgIC8vIGl0J3MgYWJzb2x1dGUuXG4gICAgcmVzdWx0Lmhvc3QgPSAocmVsYXRpdmUuaG9zdCB8fCByZWxhdGl2ZS5ob3N0ID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IChyZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0bmFtZSA9PT0gJycpID9cbiAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgLy8gaXQncyByZWxhdGl2ZVxuICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAoIWlzTnVsbE9yVW5kZWZpbmVkKHJlbGF0aXZlLnNlYXJjaCkpIHtcbiAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgLy8gbGlrZSBocmVmPSc/Zm9vJy5cbiAgICAvLyBQdXQgdGhpcyBhZnRlciB0aGUgb3RoZXIgdHdvIGNhc2VzIGJlY2F1c2UgaXQgc2ltcGxpZmllcyB0aGUgYm9vbGVhbnNcbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKTtcbiAgICAgIC8vb2NjYXRpb25hbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID9cbiAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAoIWlzTnVsbChyZXN1bHQucGF0aG5hbWUpIHx8ICFpc051bGwocmVzdWx0LnNlYXJjaCkpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnNlYXJjaCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAnLycgKyByZXN1bHQuc2VhcmNoO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gIHZhciBoYXNUcmFpbGluZ1NsYXNoID0gKFxuICAgICAgKHJlc3VsdC5ob3N0IHx8IHJlbGF0aXZlLmhvc3QpICYmIChsYXN0ID09PSAnLicgfHwgbGFzdCA9PT0gJy4uJykgfHxcbiAgICAgIGxhc3QgPT09ICcnKTtcblxuICAvLyBzdHJpcCBzaW5nbGUgZG90cywgcmVzb2x2ZSBkb3VibGUgZG90cyB0byBwYXJlbnQgZGlyXG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBzcmNQYXRoLmxlbmd0aDsgaSA+PSAwOyBpLS0pIHtcbiAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICBpZiAobGFzdCA9PSAnLicpIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChtdXN0RW5kQWJzICYmIHNyY1BhdGhbMF0gIT09ICcnICYmXG4gICAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQXQoMCkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgKHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnB1c2goJycpO1xuICB9XG5cbiAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSAnJyB8fFxuICAgICAgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gaXNBYnNvbHV0ZSA/ICcnIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogJyc7XG4gICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgIH1cbiAgfVxuXG4gIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IHJlcXVlc3QuaHR0cFxuICBpZiAoIWlzTnVsbChyZXN1bHQucGF0aG5hbWUpIHx8ICFpc051bGwocmVzdWx0LnNlYXJjaCkpIHtcbiAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICB9XG4gIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cblVybC5wcm90b3R5cGUucGFyc2VIb3N0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBob3N0ID0gdGhpcy5ob3N0O1xuICB2YXIgcG9ydCA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gIGlmIChwb3J0KSB7XG4gICAgcG9ydCA9IHBvcnRbMF07XG4gICAgaWYgKHBvcnQgIT09ICc6Jykge1xuICAgICAgdGhpcy5wb3J0ID0gcG9ydC5zdWJzdHIoMSk7XG4gICAgfVxuICAgIGhvc3QgPSBob3N0LnN1YnN0cigwLCBob3N0Lmxlbmd0aCAtIHBvcnQubGVuZ3RoKTtcbiAgfVxuICBpZiAoaG9zdCkgdGhpcy5ob3N0bmFtZSA9IGhvc3Q7XG59O1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09IFwic3RyaW5nXCI7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuICBhcmcgPT0gbnVsbDtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xyXG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMgQmlsbHkgVGV0cnVkIC0gRnJlZSB0byB1c2UgZm9yIGFueSBwdXJwb3NlOiBNSVQgTGljZW5zZSovXHJcblxyXG52YXIgbm9vcCA9IGZ1bmN0aW9uKCkge31cclxuXHJcbnZhciBwcm90b3R5cGVOYW1lPSdwcm90b3R5cGUnLCB1bmRlZmluZWQsIHByb3RvVW5kZWZpbmVkPSd1bmRlZmluZWQnLCBpbml0PSdpbml0Jywgb3duUHJvcGVydHk9KHt9KS5oYXNPd25Qcm9wZXJ0eTsgLy8gbWluaWZpYWJsZSB2YXJpYWJsZXNcclxuZnVuY3Rpb24gcHJvdG8oKSB7XHJcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cyAvLyBtaW5pZmlhYmxlIHZhcmlhYmxlc1xyXG5cclxuICAgIGlmKGFyZ3MubGVuZ3RoID09IDEpIHtcclxuICAgICAgICB2YXIgcGFyZW50ID0ge2luaXQ6IG5vb3B9XHJcbiAgICAgICAgdmFyIHByb3RvdHlwZUJ1aWxkZXIgPSBhcmdzWzBdXHJcblxyXG4gICAgfSBlbHNlIHsgLy8gbGVuZ3RoID09IDJcclxuICAgICAgICB2YXIgcGFyZW50ID0gYXJnc1swXVxyXG4gICAgICAgIHZhciBwcm90b3R5cGVCdWlsZGVyID0gYXJnc1sxXVxyXG4gICAgfVxyXG5cclxuICAgIC8vIHNwZWNpYWwgaGFuZGxpbmcgZm9yIEVycm9yIG9iamVjdHNcclxuICAgIHZhciBuYW1lUG9pbnRlciA9IHt9ICAgIC8vIG5hbWUgdXNlZCBvbmx5IGZvciBFcnJvciBPYmplY3RzXHJcbiAgICBpZihbRXJyb3IsIEV2YWxFcnJvciwgUmFuZ2VFcnJvciwgUmVmZXJlbmNlRXJyb3IsIFN5bnRheEVycm9yLCBUeXBlRXJyb3IsIFVSSUVycm9yXS5pbmRleE9mKHBhcmVudCkgIT09IC0xKSB7XHJcbiAgICAgICAgcGFyZW50ID0gbm9ybWFsaXplRXJyb3JPYmplY3QocGFyZW50LCBuYW1lUG9pbnRlcilcclxuICAgIH1cclxuXHJcbiAgICAvLyBzZXQgdXAgdGhlIHBhcmVudCBpbnRvIHRoZSBwcm90b3R5cGUgY2hhaW4gaWYgYSBwYXJlbnQgaXMgcGFzc2VkXHJcbiAgICB2YXIgcGFyZW50SXNGdW5jdGlvbiA9IHR5cGVvZihwYXJlbnQpID09PSBcImZ1bmN0aW9uXCJcclxuICAgIGlmKHBhcmVudElzRnVuY3Rpb24pIHtcclxuICAgICAgICBwcm90b3R5cGVCdWlsZGVyW3Byb3RvdHlwZU5hbWVdID0gcGFyZW50W3Byb3RvdHlwZU5hbWVdXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHByb3RvdHlwZUJ1aWxkZXJbcHJvdG90eXBlTmFtZV0gPSBwYXJlbnRcclxuICAgIH1cclxuXHJcbiAgICAvLyB0aGUgcHJvdG90eXBlIHRoYXQgd2lsbCBiZSB1c2VkIHRvIG1ha2UgaW5zdGFuY2VzXHJcbiAgICB2YXIgcHJvdG90eXBlID0gbmV3IHByb3RvdHlwZUJ1aWxkZXIocGFyZW50KVxyXG4gICAgbmFtZVBvaW50ZXIubmFtZSA9IHByb3RvdHlwZS5uYW1lXHJcblxyXG4gICAgLy8gaWYgdGhlcmUncyBubyBpbml0LCBhc3N1bWUgaXRzIGluaGVyaXRpbmcgYSBub24tcHJvdG8gY2xhc3MsIHNvIGRlZmF1bHQgdG8gYXBwbHlpbmcgdGhlIHN1cGVyY2xhc3MncyBjb25zdHJ1Y3Rvci5cclxuICAgIGlmKCFwcm90b3R5cGVbaW5pdF0gJiYgcGFyZW50SXNGdW5jdGlvbikge1xyXG4gICAgICAgIHByb3RvdHlwZVtpbml0XSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBjb25zdHJ1Y3RvciBmb3IgZW1wdHkgb2JqZWN0IHdoaWNoIHdpbGwgYmUgcG9wdWxhdGVkIHZpYSB0aGUgY29uc3RydWN0b3JcclxuICAgIHZhciBGID0gZnVuY3Rpb24oKSB7fVxyXG4gICAgICAgIEZbcHJvdG90eXBlTmFtZV0gPSBwcm90b3R5cGUgICAgLy8gc2V0IHRoZSBwcm90b3R5cGUgZm9yIGNyZWF0ZWQgaW5zdGFuY2VzXHJcblxyXG4gICAgdmFyIGNvbnN0cnVjdG9yTmFtZSA9IHByb3RvdHlwZS5uYW1lP3Byb3RvdHlwZS5uYW1lOicnXHJcbiAgICBpZihwcm90b3R5cGVbaW5pdF0gPT09IHVuZGVmaW5lZCB8fCBwcm90b3R5cGVbaW5pdF0gPT09IG5vb3ApIHtcclxuICAgICAgICB2YXIgUHJvdG9PYmplY3RGYWN0b3J5ID0gbmV3IEZ1bmN0aW9uKCdGJyxcclxuICAgICAgICAgICAgXCJyZXR1cm4gZnVuY3Rpb24gXCIgKyBjb25zdHJ1Y3Rvck5hbWUgKyBcIigpe1wiICtcclxuICAgICAgICAgICAgICAgIFwicmV0dXJuIG5ldyBGKClcIiArXHJcbiAgICAgICAgICAgIFwifVwiXHJcbiAgICAgICAgKShGKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBkeW5hbWljYWxseSBjcmVhdGluZyB0aGlzIGZ1bmN0aW9uIGNhdXNlIHRoZXJlJ3Mgbm8gb3RoZXIgd2F5IHRvIGR5bmFtaWNhbGx5IG5hbWUgYSBmdW5jdGlvblxyXG4gICAgICAgIHZhciBQcm90b09iamVjdEZhY3RvcnkgPSBuZXcgRnVuY3Rpb24oJ0YnLCdpJywndScsJ24nLCAvLyBzaGl0dHkgdmFyaWFibGVzIGNhdXNlIG1pbmlmaWVycyBhcmVuJ3QgZ29ubmEgbWluaWZ5IG15IGZ1bmN0aW9uIHN0cmluZyBoZXJlXHJcbiAgICAgICAgICAgIFwicmV0dXJuIGZ1bmN0aW9uIFwiICsgY29uc3RydWN0b3JOYW1lICsgXCIoKXsgXCIgK1xyXG4gICAgICAgICAgICAgICAgXCJ2YXIgeD1uZXcgRigpLHI9aS5hcHBseSh4LGFyZ3VtZW50cylcXG5cIiArICAgIC8vIHBvcHVsYXRlIG9iamVjdCB2aWEgdGhlIGNvbnN0cnVjdG9yXHJcbiAgICAgICAgICAgICAgICBcImlmKHI9PT1uKVxcblwiICtcclxuICAgICAgICAgICAgICAgICAgICBcInJldHVybiB4XFxuXCIgK1xyXG4gICAgICAgICAgICAgICAgXCJlbHNlIGlmKHI9PT11KVxcblwiICtcclxuICAgICAgICAgICAgICAgICAgICBcInJldHVybiBuXFxuXCIgK1xyXG4gICAgICAgICAgICAgICAgXCJlbHNlXFxuXCIgK1xyXG4gICAgICAgICAgICAgICAgICAgIFwicmV0dXJuIHJcXG5cIiArXHJcbiAgICAgICAgICAgIFwifVwiXHJcbiAgICAgICAgKShGLCBwcm90b3R5cGVbaW5pdF0sIHByb3RvW3Byb3RvVW5kZWZpbmVkXSkgLy8gbm90ZSB0aGF0IG4gaXMgdW5kZWZpbmVkXHJcbiAgICB9XHJcblxyXG4gICAgcHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUHJvdG9PYmplY3RGYWN0b3J5OyAgICAvLyBzZXQgdGhlIGNvbnN0cnVjdG9yIHByb3BlcnR5IG9uIHRoZSBwcm90b3R5cGVcclxuXHJcbiAgICAvLyBhZGQgYWxsIHRoZSBwcm90b3R5cGUgcHJvcGVydGllcyBvbnRvIHRoZSBzdGF0aWMgY2xhc3MgYXMgd2VsbCAoc28geW91IGNhbiBhY2Nlc3MgdGhhdCBjbGFzcyB3aGVuIHlvdSB3YW50IHRvIHJlZmVyZW5jZSBzdXBlcmNsYXNzIHByb3BlcnRpZXMpXHJcbiAgICBmb3IodmFyIG4gaW4gcHJvdG90eXBlKSB7XHJcbiAgICAgICAgYWRkUHJvcGVydHkoUHJvdG9PYmplY3RGYWN0b3J5LCBwcm90b3R5cGUsIG4pXHJcbiAgICB9XHJcblxyXG4gICAgLy8gYWRkIHByb3BlcnRpZXMgZnJvbSBwYXJlbnQgdGhhdCBkb24ndCBleGlzdCBpbiB0aGUgc3RhdGljIGNsYXNzIG9iamVjdCB5ZXRcclxuICAgIGZvcih2YXIgbiBpbiBwYXJlbnQpIHtcclxuICAgICAgICBpZihvd25Qcm9wZXJ0eS5jYWxsKHBhcmVudCwgbikgJiYgUHJvdG9PYmplY3RGYWN0b3J5W25dID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgYWRkUHJvcGVydHkoUHJvdG9PYmplY3RGYWN0b3J5LCBwYXJlbnQsIG4pXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIFByb3RvT2JqZWN0RmFjdG9yeS5wYXJlbnQgPSBwYXJlbnQ7ICAgICAgICAgICAgLy8gc3BlY2lhbCBwYXJlbnQgcHJvcGVydHkgb25seSBhdmFpbGFibGUgb24gdGhlIHJldHVybmVkIHByb3RvIGNsYXNzXHJcbiAgICBQcm90b09iamVjdEZhY3RvcnlbcHJvdG90eXBlTmFtZV0gPSBwcm90b3R5cGUgIC8vIHNldCB0aGUgcHJvdG90eXBlIG9uIHRoZSBvYmplY3QgZmFjdG9yeVxyXG5cclxuICAgIHJldHVybiBQcm90b09iamVjdEZhY3Rvcnk7XHJcbn1cclxuXHJcbnByb3RvW3Byb3RvVW5kZWZpbmVkXSA9IHt9IC8vIGEgc3BlY2lhbCBtYXJrZXIgZm9yIHdoZW4geW91IHdhbnQgdG8gcmV0dXJuIHVuZGVmaW5lZCBmcm9tIGEgY29uc3RydWN0b3JcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gcHJvdG9cclxuXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZUVycm9yT2JqZWN0KEVycm9yT2JqZWN0LCBuYW1lUG9pbnRlcikge1xyXG4gICAgZnVuY3Rpb24gTm9ybWFsaXplZEVycm9yKCkge1xyXG4gICAgICAgIHZhciB0bXAgPSBuZXcgRXJyb3JPYmplY3QoYXJndW1lbnRzWzBdKVxyXG4gICAgICAgIHRtcC5uYW1lID0gbmFtZVBvaW50ZXIubmFtZVxyXG5cclxuICAgICAgICB0aGlzLm1lc3NhZ2UgPSB0bXAubWVzc2FnZVxyXG4gICAgICAgIGlmKE9iamVjdC5kZWZpbmVQcm9wZXJ0eSkge1xyXG4gICAgICAgICAgICAvKnRoaXMuc3RhY2sgPSAqL09iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnc3RhY2snLCB7IC8vIGdldHRlciBmb3IgbW9yZSBvcHRpbWl6eSBnb29kbmVzc1xyXG4gICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG1wLnN0YWNrXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlIC8vIHNvIHlvdSBjYW4gY2hhbmdlIGl0IGlmIHlvdSB3YW50XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFjayA9IHRtcC5zdGFja1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH1cclxuXHJcbiAgICB2YXIgSW50ZXJtZWRpYXRlSW5oZXJpdG9yID0gZnVuY3Rpb24oKSB7fVxyXG4gICAgICAgIEludGVybWVkaWF0ZUluaGVyaXRvci5wcm90b3R5cGUgPSBFcnJvck9iamVjdC5wcm90b3R5cGVcclxuICAgIE5vcm1hbGl6ZWRFcnJvci5wcm90b3R5cGUgPSBuZXcgSW50ZXJtZWRpYXRlSW5oZXJpdG9yKClcclxuXHJcbiAgICByZXR1cm4gTm9ybWFsaXplZEVycm9yXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZFByb3BlcnR5KGZhY3RvcnlPYmplY3QsIHByb3RvdHlwZSwgcHJvcGVydHkpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdmFyIGluZm8gPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHByb3RvdHlwZSwgcHJvcGVydHkpXHJcbiAgICAgICAgaWYoaW5mby5nZXQgIT09IHVuZGVmaW5lZCB8fCBpbmZvLmdldCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShmYWN0b3J5T2JqZWN0LCBwcm9wZXJ0eSwgaW5mbylcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmYWN0b3J5T2JqZWN0W3Byb3BlcnR5XSA9IHByb3RvdHlwZVtwcm9wZXJ0eV1cclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoKGUpIHtcclxuICAgICAgICAvLyBkbyBub3RoaW5nLCBpZiBhIHByb3BlcnR5IChsaWtlIGBuYW1lYCkgY2FuJ3QgYmUgc2V0LCBqdXN0IGlnbm9yZSBpdFxyXG4gICAgfVxyXG59IiwiLy8gQ29weXJpZ2h0IDIwMTQgU2ltb24gTHlkZWxsXHJcbi8vIFgxMSAo4oCcTUlU4oCdKSBMaWNlbnNlZC4gKFNlZSBMSUNFTlNFLilcclxuXHJcbnZvaWQgKGZ1bmN0aW9uKHJvb3QsIGZhY3RvcnkpIHtcclxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHtcclxuICAgIGRlZmluZShmYWN0b3J5KVxyXG4gIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcclxuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpXHJcbiAgfSBlbHNlIHtcclxuICAgIHJvb3QucmVzb2x2ZVVybCA9IGZhY3RvcnkoKVxyXG4gIH1cclxufSh0aGlzLCBmdW5jdGlvbigpIHtcclxuXHJcbiAgZnVuY3Rpb24gcmVzb2x2ZVVybCgvKiAuLi51cmxzICovKSB7XHJcbiAgICB2YXIgbnVtVXJscyA9IGFyZ3VtZW50cy5sZW5ndGhcclxuXHJcbiAgICBpZiAobnVtVXJscyA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJyZXNvbHZlVXJsIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBhcmd1bWVudDsgZ290IG5vbmUuXCIpXHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGJhc2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYmFzZVwiKVxyXG4gICAgYmFzZS5ocmVmID0gYXJndW1lbnRzWzBdXHJcblxyXG4gICAgaWYgKG51bVVybHMgPT09IDEpIHtcclxuICAgICAgcmV0dXJuIGJhc2UuaHJlZlxyXG4gICAgfVxyXG5cclxuICAgIHZhciBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJoZWFkXCIpWzBdXHJcbiAgICBoZWFkLmluc2VydEJlZm9yZShiYXNlLCBoZWFkLmZpcnN0Q2hpbGQpXHJcblxyXG4gICAgdmFyIGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKVxyXG4gICAgdmFyIHJlc29sdmVkXHJcblxyXG4gICAgZm9yICh2YXIgaW5kZXggPSAxOyBpbmRleCA8IG51bVVybHM7IGluZGV4KyspIHtcclxuICAgICAgYS5ocmVmID0gYXJndW1lbnRzW2luZGV4XVxyXG4gICAgICByZXNvbHZlZCA9IGEuaHJlZlxyXG4gICAgICBiYXNlLmhyZWYgPSByZXNvbHZlZFxyXG4gICAgfVxyXG5cclxuICAgIGhlYWQucmVtb3ZlQ2hpbGQoYmFzZSlcclxuXHJcbiAgICByZXR1cm4gcmVzb2x2ZWRcclxuICB9XHJcblxyXG4gIHJldHVybiByZXNvbHZlVXJsXHJcblxyXG59KSk7XHJcbiIsIi8vIENvcHlyaWdodCAyMDE0IFNpbW9uIEx5ZGVsbFxyXG5cclxudm9pZCAoZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xyXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgZGVmaW5lKGZhY3RvcnkpXHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KClcclxuICB9IGVsc2Uge1xyXG4gICAgcm9vdC5zb3VyY2VNYXBwaW5nVVJMID0gZmFjdG9yeSgpXHJcbiAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uKHVuZGVmaW5lZCkge1xyXG5cclxuICB2YXIgaW5uZXJSZWdleCA9IC9bI0BdIHNvdXJjZU1hcHBpbmdVUkw9KFteXFxzJ1wiXSopL1xyXG4gIHZhciBuZXdsaW5lUmVnZXggPSAvXFxyXFxuP3xcXG4vXHJcblxyXG4gIHZhciByZWdleCA9IFJlZ0V4cChcclxuICAgIFwiKF58KD86XCIgKyBuZXdsaW5lUmVnZXguc291cmNlICsgXCIpKVwiICtcclxuICAgIFwiKD86XCIgK1xyXG4gICAgICBcIi9cXFxcKlwiICtcclxuICAgICAgXCIoPzpcXFxccyooPzpcIiArIG5ld2xpbmVSZWdleC5zb3VyY2UgKyBcIikoPzovLyk/KT9cIiArXHJcbiAgICAgIFwiKD86XCIgKyBpbm5lclJlZ2V4LnNvdXJjZSArIFwiKVwiICtcclxuICAgICAgXCJcXFxccypcIiArXHJcbiAgICAgIFwiXFxcXCovXCIgK1xyXG4gICAgICBcInxcIiArXHJcbiAgICAgIFwiLy8oPzpcIiArIGlubmVyUmVnZXguc291cmNlICsgXCIpXCIgK1xyXG4gICAgXCIpXCIgK1xyXG4gICAgXCJcXFxccyokXCJcclxuICApXHJcblxyXG4gIGZ1bmN0aW9uIFNvdXJjZU1hcHBpbmdVUkwoY29tbWVudFN5bnRheCkge1xyXG4gICAgdGhpcy5fY29tbWVudFN5bnRheCA9IGNvbW1lbnRTeW50YXhcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLnJlZ2V4ID0gcmVnZXhcclxuICBTb3VyY2VNYXBwaW5nVVJMLnByb3RvdHlwZS5faW5uZXJSZWdleCA9IGlubmVyUmVnZXhcclxuICBTb3VyY2VNYXBwaW5nVVJMLnByb3RvdHlwZS5fbmV3bGluZVJlZ2V4ID0gbmV3bGluZVJlZ2V4XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGNvZGUpIHtcclxuICAgIHZhciBtYXRjaCA9IGNvZGUubWF0Y2godGhpcy5yZWdleClcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICAgIHJldHVybiBtYXRjaFsyXSB8fCBtYXRjaFszXSB8fCBcIlwiXHJcbiAgfVxyXG5cclxuICBTb3VyY2VNYXBwaW5nVVJMLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbihjb2RlLCB1cmwsIGNvbW1lbnRTeW50YXgpIHtcclxuICAgIGlmICghY29tbWVudFN5bnRheCkge1xyXG4gICAgICBjb21tZW50U3ludGF4ID0gdGhpcy5fY29tbWVudFN5bnRheFxyXG4gICAgfVxyXG4gICAgLy8gVXNlIGEgbmV3bGluZSBwcmVzZW50IGluIHRoZSBjb2RlLCBvciBmYWxsIGJhY2sgdG8gJ1xcbicuXHJcbiAgICB2YXIgbmV3bGluZSA9IFN0cmluZyhjb2RlLm1hdGNoKHRoaXMuX25ld2xpbmVSZWdleCkgfHwgXCJcXG5cIilcclxuICAgIHZhciBvcGVuID0gY29tbWVudFN5bnRheFswXSwgY2xvc2UgPSBjb21tZW50U3ludGF4WzFdIHx8IFwiXCJcclxuICAgIGNvZGUgPSB0aGlzLnJlbW92ZShjb2RlKVxyXG4gICAgcmV0dXJuIGNvZGUgKyBuZXdsaW5lICsgb3BlbiArIFwiIyBzb3VyY2VNYXBwaW5nVVJMPVwiICsgdXJsICsgY2xvc2VcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGNvZGUpIHtcclxuICAgIHJldHVybiBjb2RlLnJlcGxhY2UodGhpcy5yZWdleCwgXCJcIilcclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLmluc2VydEJlZm9yZSA9IGZ1bmN0aW9uKGNvZGUsIHN0cmluZykge1xyXG4gICAgdmFyIG1hdGNoID0gY29kZS5tYXRjaCh0aGlzLnJlZ2V4KVxyXG4gICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgIHZhciBoYXNOZXdsaW5lID0gQm9vbGVhbihtYXRjaFsxXSlcclxuICAgICAgcmV0dXJuIGNvZGUuc2xpY2UoMCwgbWF0Y2guaW5kZXgpICtcclxuICAgICAgICBzdHJpbmcgK1xyXG4gICAgICAgIChoYXNOZXdsaW5lID8gXCJcIiA6IFwiXFxuXCIpICtcclxuICAgICAgICBjb2RlLnNsaWNlKG1hdGNoLmluZGV4KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGNvZGUgKyBzdHJpbmdcclxuICAgIH1cclxuICB9XHJcblxyXG4gIFNvdXJjZU1hcHBpbmdVUkwucHJvdG90eXBlLlNvdXJjZU1hcHBpbmdVUkwgPSBTb3VyY2VNYXBwaW5nVVJMXHJcblxyXG4gIHJldHVybiBuZXcgU291cmNlTWFwcGluZ1VSTChbXCIvKlwiLCBcIiAqL1wiXSlcclxuXHJcbn0pKTtcclxuIiwiLy8gQ29weXJpZ2h0IDIwMTQgU2ltb24gTHlkZWxsXG4vLyBYMTEgKOKAnE1JVOKAnSkgTGljZW5zZWQuIChTZWUgTElDRU5TRS4pXG5cbi8vIE5vdGU6IHNvdXJjZS1tYXAtcmVzb2x2ZS5qcyBpcyBnZW5lcmF0ZWQgZnJvbSBzb3VyY2UtbWFwLXJlc29sdmUtbm9kZS5qcyBhbmRcbi8vIHNvdXJjZS1tYXAtcmVzb2x2ZS10ZW1wbGF0ZS5qcy4gT25seSBlZGl0IHRoZSB0d28gbGF0dGVyIGZpbGVzLCBfbm90X1xuLy8gc291cmNlLW1hcC1yZXNvbHZlLmpzIVxuXG52b2lkIChmdW5jdGlvbihyb290LCBmYWN0b3J5KSB7XG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShbXCJzb3VyY2UtbWFwLXVybFwiLCBcInJlc29sdmUtdXJsXCJdLCBmYWN0b3J5KVxuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG4gICAgdmFyIHNvdXJjZU1hcHBpbmdVUkwgPSByZXF1aXJlKFwic291cmNlLW1hcC11cmxcIilcbiAgICB2YXIgcmVzb2x2ZVVybCA9IHJlcXVpcmUoXCJyZXNvbHZlLXVybFwiKVxuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShzb3VyY2VNYXBwaW5nVVJMLCByZXNvbHZlVXJsKVxuICB9IGVsc2Uge1xuICAgIHJvb3Quc291cmNlTWFwUmVzb2x2ZSA9IGZhY3Rvcnkocm9vdC5zb3VyY2VNYXBwaW5nVVJMLCByb290LnJlc29sdmVVcmwpXG4gIH1cbn0odGhpcywgZnVuY3Rpb24oc291cmNlTWFwcGluZ1VSTCwgcmVzb2x2ZVVybCkge1xuXG4gIGZ1bmN0aW9uIGNhbGxiYWNrQXN5bmMoY2FsbGJhY2ssIGVycm9yLCByZXN1bHQpIHtcbiAgICBzZXRJbW1lZGlhdGUoZnVuY3Rpb24oKSB7IGNhbGxiYWNrKGVycm9yLCByZXN1bHQpIH0pXG4gIH1cblxuICBmdW5jdGlvbiBzaWcobmFtZSwgY29kZU9yTWFwLCB1cmwsIHJlYWQsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHR5cGUgPSAobmFtZS5pbmRleE9mKFwiU291cmNlc1wiKSA+PSAwID8gXCJtYXBcIiA6IFwiY29kZVwiKVxuXG4gICAgdmFyIHRocm93RXJyb3IgPSBmdW5jdGlvbihudW0sIHdoYXQsIGdvdCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBuYW1lICsgXCIgcmVxdWlyZXMgYXJndW1lbnQgXCIgKyBudW0gKyBcIiB0byBiZSBcIiArIHdoYXQgKyBcIi4gR290OlxcblwiICsgZ290XG4gICAgICApXG4gICAgfVxuXG4gICAgaWYgKHR5cGUgPT09IFwibWFwXCIpIHtcbiAgICAgIGlmICh0eXBlb2YgY29kZU9yTWFwICE9PSBcIm9iamVjdFwiIHx8IGNvZGVPck1hcCA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvd0Vycm9yKDEsIFwiYSBzb3VyY2UgbWFwXCIsIGNvZGVPck1hcClcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHR5cGVvZiBjb2RlT3JNYXAgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgdGhyb3dFcnJvcigxLCBcInNvbWUgY29kZVwiLCBjb2RlT3JNYXApXG4gICAgICB9XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdXJsICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICB0aHJvd0Vycm9yKDIsIFwidGhlIFwiICsgdHlwZSArIFwiIHVybFwiLCB1cmwpXG4gICAgfVxuICAgIGlmICh0eXBlb2YgcmVhZCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICB0aHJvd0Vycm9yKDMsIFwiYSByZWFkaW5nIGZ1bmN0aW9uXCIsIHJlYWQpXG4gICAgfVxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxICsgNCAmJiB0eXBlb2YgY2FsbGJhY2sgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgdGhyb3dFcnJvcig0LCBcImEgY2FsbGJhY2sgZnVuY3Rpb25cIiwgY2FsbGJhY2spXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VNYXBUb0pTT04oc3RyaW5nKSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2Uoc3RyaW5nLnJlcGxhY2UoL15cXClcXF1cXH0nLywgXCJcIikpXG4gIH1cblxuXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZU1hcChjb2RlLCBjb2RlVXJsLCByZWFkLCBjYWxsYmFjaykge1xuICAgIHNpZyhcInJlc29sdmVTb3VyY2VNYXBcIiwgY29kZSwgY29kZVVybCwgcmVhZCwgY2FsbGJhY2spXG4gICAgdmFyIG1hcERhdGFcbiAgICB0cnkge1xuICAgICAgbWFwRGF0YSA9IHJlc29sdmVTb3VyY2VNYXBIZWxwZXIoY29kZSwgY29kZVVybClcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrQXN5bmMoY2FsbGJhY2ssIGVycm9yKVxuICAgIH1cbiAgICBpZiAoIW1hcERhdGEgfHwgbWFwRGF0YS5tYXApIHtcbiAgICAgIHJldHVybiBjYWxsYmFja0FzeW5jKGNhbGxiYWNrLCBudWxsLCBtYXBEYXRhKVxuICAgIH1cbiAgICByZWFkKG1hcERhdGEudXJsLCBmdW5jdGlvbihlcnJvciwgcmVzdWx0KSB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9yKVxuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgbWFwRGF0YS5tYXAgPSBwYXJzZU1hcFRvSlNPTihTdHJpbmcocmVzdWx0KSlcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcilcbiAgICAgIH1cbiAgICAgIGNhbGxiYWNrKG51bGwsIG1hcERhdGEpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VNYXBTeW5jKGNvZGUsIGNvZGVVcmwsIHJlYWQpIHtcbiAgICBzaWcoXCJyZXNvbHZlU291cmNlTWFwU3luY1wiLCBjb2RlLCBjb2RlVXJsLCByZWFkKVxuICAgIHZhciBtYXBEYXRhID0gcmVzb2x2ZVNvdXJjZU1hcEhlbHBlcihjb2RlLCBjb2RlVXJsKVxuICAgIGlmICghbWFwRGF0YSB8fCBtYXBEYXRhLm1hcCkge1xuICAgICAgcmV0dXJuIG1hcERhdGFcbiAgICB9XG4gICAgbWFwRGF0YS5tYXAgPSBwYXJzZU1hcFRvSlNPTihTdHJpbmcocmVhZChtYXBEYXRhLnVybCkpKVxuICAgIHJldHVybiBtYXBEYXRhXG4gIH1cblxuICB2YXIgZGF0YVVyaVJlZ2V4ID0gL15kYXRhOihbXiw7XSopKDtbXiw7XSopKig/OiwoLiopKT8kL1xuICB2YXIganNvbk1pbWVUeXBlUmVnZXggPSAvXig/OmFwcGxpY2F0aW9ufHRleHQpXFwvanNvbiQvXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZU1hcEhlbHBlcihjb2RlLCBjb2RlVXJsKSB7XG4gICAgdmFyIHVybCA9IHNvdXJjZU1hcHBpbmdVUkwuZ2V0KGNvZGUpXG4gICAgaWYgKCF1cmwpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgdmFyIGRhdGFVcmkgPSB1cmwubWF0Y2goZGF0YVVyaVJlZ2V4KVxuICAgIGlmIChkYXRhVXJpKSB7XG4gICAgICB2YXIgbWltZVR5cGUgPSBkYXRhVXJpWzFdXG4gICAgICB2YXIgbGFzdFBhcmFtZXRlciA9IGRhdGFVcmlbMl1cbiAgICAgIHZhciBlbmNvZGVkID0gZGF0YVVyaVszXVxuICAgICAgaWYgKCFqc29uTWltZVR5cGVSZWdleC50ZXN0KG1pbWVUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnVzZWZ1bCBkYXRhIHVyaSBtaW1lIHR5cGU6IFwiICsgKG1pbWVUeXBlIHx8IFwidGV4dC9wbGFpblwiKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNvdXJjZU1hcHBpbmdVUkw6IHVybCxcbiAgICAgICAgdXJsOiBudWxsLFxuICAgICAgICBzb3VyY2VzUmVsYXRpdmVUbzogY29kZVVybCxcbiAgICAgICAgbWFwOiBwYXJzZU1hcFRvSlNPTihsYXN0UGFyYW1ldGVyID09PSBcIjtiYXNlNjRcIiA/IGF0b2IoZW5jb2RlZCkgOiBkZWNvZGVVUklDb21wb25lbnQoZW5jb2RlZCkpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIG1hcFVybCA9IHJlc29sdmVVcmwoY29kZVVybCwgdXJsKVxuICAgIHJldHVybiB7XG4gICAgICBzb3VyY2VNYXBwaW5nVVJMOiB1cmwsXG4gICAgICB1cmw6IG1hcFVybCxcbiAgICAgIHNvdXJjZXNSZWxhdGl2ZVRvOiBtYXBVcmwsXG4gICAgICBtYXA6IG51bGxcbiAgICB9XG4gIH1cblxuXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZXMobWFwLCBtYXBVcmwsIHJlYWQsIGNhbGxiYWNrKSB7XG4gICAgc2lnKFwicmVzb2x2ZVNvdXJjZXNcIiwgbWFwLCBtYXBVcmwsIHJlYWQsIGNhbGxiYWNrKVxuICAgIHZhciBwZW5kaW5nID0gbWFwLnNvdXJjZXMubGVuZ3RoXG4gICAgdmFyIGVycm9yZWQgPSBmYWxzZVxuICAgIHZhciBzb3VyY2VzID0gW11cblxuICAgIHZhciBkb25lID0gZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvcmVkKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIGVycm9yZWQgPSB0cnVlXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcilcbiAgICAgIH1cbiAgICAgIHBlbmRpbmctLVxuICAgICAgaWYgKHBlbmRpbmcgPT09IDApIHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgc291cmNlcylcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXNvbHZlU291cmNlc0hlbHBlcihtYXAsIG1hcFVybCwgZnVuY3Rpb24oZnVsbFVybCwgc291cmNlQ29udGVudCwgaW5kZXgpIHtcbiAgICAgIGlmICh0eXBlb2Ygc291cmNlQ29udGVudCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBzb3VyY2VzW2luZGV4XSA9IHNvdXJjZUNvbnRlbnRcbiAgICAgICAgY2FsbGJhY2tBc3luYyhkb25lLCBudWxsKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVhZChmdWxsVXJsLCBmdW5jdGlvbihlcnJvciwgcmVzdWx0KSB7XG4gICAgICAgICAgc291cmNlc1tpbmRleF0gPSBTdHJpbmcocmVzdWx0KVxuICAgICAgICAgIGRvbmUoZXJyb3IpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VzU3luYyhtYXAsIG1hcFVybCwgcmVhZCkge1xuICAgIHNpZyhcInJlc29sdmVTb3VyY2VzU3luY1wiLCBtYXAsIG1hcFVybCwgcmVhZClcbiAgICB2YXIgc291cmNlcyA9IFtdXG4gICAgcmVzb2x2ZVNvdXJjZXNIZWxwZXIobWFwLCBtYXBVcmwsIGZ1bmN0aW9uKGZ1bGxVcmwsIHNvdXJjZUNvbnRlbnQsIGluZGV4KSB7XG4gICAgICBpZiAodHlwZW9mIHNvdXJjZUNvbnRlbnQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgc291cmNlc1tpbmRleF0gPSBzb3VyY2VDb250ZW50XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzb3VyY2VzW2luZGV4XSA9IFN0cmluZyhyZWFkKGZ1bGxVcmwpKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmV0dXJuIHNvdXJjZXNcbiAgfVxuXG4gIHZhciBlbmRpbmdTbGFzaCA9IC9cXC8/JC9cblxuICBmdW5jdGlvbiByZXNvbHZlU291cmNlc0hlbHBlcihtYXAsIG1hcFVybCwgZm4pIHtcbiAgICB2YXIgZnVsbFVybFxuICAgIHZhciBzb3VyY2VDb250ZW50XG4gICAgZm9yICh2YXIgaW5kZXggPSAwLCBsZW4gPSBtYXAuc291cmNlcy5sZW5ndGg7IGluZGV4IDwgbGVuOyBpbmRleCsrKSB7XG4gICAgICBpZiAobWFwLnNvdXJjZVJvb3QpIHtcbiAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgdGhlIHNvdXJjZVJvb3QgZW5kcyB3aXRoIGEgc2xhc2gsIHNvIHRoYXQgYC9zY3JpcHRzL3N1YmRpcmAgYmVjb21lc1xuICAgICAgICAvLyBgL3NjcmlwdHMvc3ViZGlyLzxzb3VyY2U+YCwgbm90IGAvc2NyaXB0cy88c291cmNlPmAuIFBvaW50aW5nIHRvIGEgZmlsZSBhcyBzb3VyY2Ugcm9vdFxuICAgICAgICAvLyBkb2VzIG5vdCBtYWtlIHNlbnNlLlxuICAgICAgICBmdWxsVXJsID0gcmVzb2x2ZVVybChtYXBVcmwsIG1hcC5zb3VyY2VSb290LnJlcGxhY2UoZW5kaW5nU2xhc2gsIFwiL1wiKSwgbWFwLnNvdXJjZXNbaW5kZXhdKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnVsbFVybCA9IHJlc29sdmVVcmwobWFwVXJsLCBtYXAuc291cmNlc1tpbmRleF0pXG4gICAgICB9XG4gICAgICBzb3VyY2VDb250ZW50ID0gKG1hcC5zb3VyY2VDb250ZW50cyB8fCBbXSlbaW5kZXhdXG4gICAgICBmbihmdWxsVXJsLCBzb3VyY2VDb250ZW50LCBpbmRleClcbiAgICB9XG4gIH1cblxuXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZShjb2RlLCBjb2RlVXJsLCByZWFkLCBjYWxsYmFjaykge1xuICAgIHNpZyhcInJlc29sdmVcIiwgY29kZSwgY29kZVVybCwgcmVhZCwgY2FsbGJhY2spXG4gICAgcmVzb2x2ZVNvdXJjZU1hcChjb2RlLCBjb2RlVXJsLCByZWFkLCBmdW5jdGlvbihlcnJvciwgbWFwRGF0YSkge1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcilcbiAgICAgIH1cbiAgICAgIGlmICghbWFwRGF0YSkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgbnVsbClcbiAgICAgIH1cbiAgICAgIHJlc29sdmVTb3VyY2VzKG1hcERhdGEubWFwLCBtYXBEYXRhLnNvdXJjZXNSZWxhdGl2ZVRvLCByZWFkLCBmdW5jdGlvbihlcnJvciwgc291cmNlcykge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3IpXG4gICAgICAgIH1cbiAgICAgICAgbWFwRGF0YS5zb3VyY2VzID0gc291cmNlc1xuICAgICAgICBjYWxsYmFjayhudWxsLCBtYXBEYXRhKVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVN5bmMoY29kZSwgY29kZVVybCwgcmVhZCkge1xuICAgIHNpZyhcInJlc29sdmVTeW5jXCIsIGNvZGUsIGNvZGVVcmwsIHJlYWQpXG4gICAgdmFyIG1hcERhdGEgPSByZXNvbHZlU291cmNlTWFwU3luYyhjb2RlLCBjb2RlVXJsLCByZWFkKVxuICAgIGlmICghbWFwRGF0YSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gICAgbWFwRGF0YS5zb3VyY2VzID0gcmVzb2x2ZVNvdXJjZXNTeW5jKG1hcERhdGEubWFwLCBtYXBEYXRhLnNvdXJjZXNSZWxhdGl2ZVRvLCByZWFkKVxuICAgIHJldHVybiBtYXBEYXRhXG4gIH1cblxuXG5cbiAgcmV0dXJuIHtcbiAgICByZXNvbHZlU291cmNlTWFwOiAgICAgcmVzb2x2ZVNvdXJjZU1hcCxcbiAgICByZXNvbHZlU291cmNlTWFwU3luYzogcmVzb2x2ZVNvdXJjZU1hcFN5bmMsXG4gICAgcmVzb2x2ZVNvdXJjZXM6ICAgICAgIHJlc29sdmVTb3VyY2VzLFxuICAgIHJlc29sdmVTb3VyY2VzU3luYzogICByZXNvbHZlU291cmNlc1N5bmMsXG4gICAgcmVzb2x2ZTogICAgICAgICAgICAgIHJlc29sdmUsXG4gICAgcmVzb2x2ZVN5bmM6ICAgICAgICAgIHJlc29sdmVTeW5jXG4gIH1cblxufSkpO1xuIiwiLypcbiAqIENvcHlyaWdodCAyMDA5LTIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFLnR4dCBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuZXhwb3J0cy5Tb3VyY2VNYXBHZW5lcmF0b3IgPSByZXF1aXJlKCcuL3NvdXJjZS1tYXAvc291cmNlLW1hcC1nZW5lcmF0b3InKS5Tb3VyY2VNYXBHZW5lcmF0b3I7XG5leHBvcnRzLlNvdXJjZU1hcENvbnN1bWVyID0gcmVxdWlyZSgnLi9zb3VyY2UtbWFwL3NvdXJjZS1tYXAtY29uc3VtZXInKS5Tb3VyY2VNYXBDb25zdW1lcjtcbmV4cG9ydHMuU291cmNlTm9kZSA9IHJlcXVpcmUoJy4vc291cmNlLW1hcC9zb3VyY2Utbm9kZScpLlNvdXJjZU5vZGU7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG5cbiAgLyoqXG4gICAqIEEgZGF0YSBzdHJ1Y3R1cmUgd2hpY2ggaXMgYSBjb21iaW5hdGlvbiBvZiBhbiBhcnJheSBhbmQgYSBzZXQuIEFkZGluZyBhIG5ld1xuICAgKiBtZW1iZXIgaXMgTygxKSwgdGVzdGluZyBmb3IgbWVtYmVyc2hpcCBpcyBPKDEpLCBhbmQgZmluZGluZyB0aGUgaW5kZXggb2YgYW5cbiAgICogZWxlbWVudCBpcyBPKDEpLiBSZW1vdmluZyBlbGVtZW50cyBmcm9tIHRoZSBzZXQgaXMgbm90IHN1cHBvcnRlZC4gT25seVxuICAgKiBzdHJpbmdzIGFyZSBzdXBwb3J0ZWQgZm9yIG1lbWJlcnNoaXAuXG4gICAqL1xuICBmdW5jdGlvbiBBcnJheVNldCgpIHtcbiAgICB0aGlzLl9hcnJheSA9IFtdO1xuICAgIHRoaXMuX3NldCA9IHt9O1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXRpYyBtZXRob2QgZm9yIGNyZWF0aW5nIEFycmF5U2V0IGluc3RhbmNlcyBmcm9tIGFuIGV4aXN0aW5nIGFycmF5LlxuICAgKi9cbiAgQXJyYXlTZXQuZnJvbUFycmF5ID0gZnVuY3Rpb24gQXJyYXlTZXRfZnJvbUFycmF5KGFBcnJheSwgYUFsbG93RHVwbGljYXRlcykge1xuICAgIHZhciBzZXQgPSBuZXcgQXJyYXlTZXQoKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYUFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBzZXQuYWRkKGFBcnJheVtpXSwgYUFsbG93RHVwbGljYXRlcyk7XG4gICAgfVxuICAgIHJldHVybiBzZXQ7XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCB0aGUgZ2l2ZW4gc3RyaW5nIHRvIHRoaXMgc2V0LlxuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiBBcnJheVNldF9hZGQoYVN0ciwgYUFsbG93RHVwbGljYXRlcykge1xuICAgIHZhciBpc0R1cGxpY2F0ZSA9IHRoaXMuaGFzKGFTdHIpO1xuICAgIHZhciBpZHggPSB0aGlzLl9hcnJheS5sZW5ndGg7XG4gICAgaWYgKCFpc0R1cGxpY2F0ZSB8fCBhQWxsb3dEdXBsaWNhdGVzKSB7XG4gICAgICB0aGlzLl9hcnJheS5wdXNoKGFTdHIpO1xuICAgIH1cbiAgICBpZiAoIWlzRHVwbGljYXRlKSB7XG4gICAgICB0aGlzLl9zZXRbdXRpbC50b1NldFN0cmluZyhhU3RyKV0gPSBpZHg7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBJcyB0aGUgZ2l2ZW4gc3RyaW5nIGEgbWVtYmVyIG9mIHRoaXMgc2V0P1xuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiBBcnJheVNldF9oYXMoYVN0cikge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5fc2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXRpbC50b1NldFN0cmluZyhhU3RyKSk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFdoYXQgaXMgdGhlIGluZGV4IG9mIHRoZSBnaXZlbiBzdHJpbmcgaW4gdGhlIGFycmF5P1xuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5pbmRleE9mID0gZnVuY3Rpb24gQXJyYXlTZXRfaW5kZXhPZihhU3RyKSB7XG4gICAgaWYgKHRoaXMuaGFzKGFTdHIpKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc2V0W3V0aWwudG9TZXRTdHJpbmcoYVN0cildO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIGFTdHIgKyAnXCIgaXMgbm90IGluIHRoZSBzZXQuJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFdoYXQgaXMgdGhlIGVsZW1lbnQgYXQgdGhlIGdpdmVuIGluZGV4P1xuICAgKlxuICAgKiBAcGFyYW0gTnVtYmVyIGFJZHhcbiAgICovXG4gIEFycmF5U2V0LnByb3RvdHlwZS5hdCA9IGZ1bmN0aW9uIEFycmF5U2V0X2F0KGFJZHgpIHtcbiAgICBpZiAoYUlkeCA+PSAwICYmIGFJZHggPCB0aGlzLl9hcnJheS5sZW5ndGgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9hcnJheVthSWR4XTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBlbGVtZW50IGluZGV4ZWQgYnkgJyArIGFJZHgpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBhcnJheSByZXByZXNlbnRhdGlvbiBvZiB0aGlzIHNldCAod2hpY2ggaGFzIHRoZSBwcm9wZXIgaW5kaWNlc1xuICAgKiBpbmRpY2F0ZWQgYnkgaW5kZXhPZikuIE5vdGUgdGhhdCB0aGlzIGlzIGEgY29weSBvZiB0aGUgaW50ZXJuYWwgYXJyYXkgdXNlZFxuICAgKiBmb3Igc3RvcmluZyB0aGUgbWVtYmVycyBzbyB0aGF0IG5vIG9uZSBjYW4gbWVzcyB3aXRoIGludGVybmFsIHN0YXRlLlxuICAgKi9cbiAgQXJyYXlTZXQucHJvdG90eXBlLnRvQXJyYXkgPSBmdW5jdGlvbiBBcnJheVNldF90b0FycmF5KCkge1xuICAgIHJldHVybiB0aGlzLl9hcnJheS5zbGljZSgpO1xuICB9O1xuXG4gIGV4cG9ydHMuQXJyYXlTZXQgPSBBcnJheVNldDtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICpcbiAqIEJhc2VkIG9uIHRoZSBCYXNlIDY0IFZMUSBpbXBsZW1lbnRhdGlvbiBpbiBDbG9zdXJlIENvbXBpbGVyOlxuICogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jbG9zdXJlLWNvbXBpbGVyL3NvdXJjZS9icm93c2UvdHJ1bmsvc3JjL2NvbS9nb29nbGUvZGVidWdnaW5nL3NvdXJjZW1hcC9CYXNlNjRWTFEuamF2YVxuICpcbiAqIENvcHlyaWdodCAyMDExIFRoZSBDbG9zdXJlIENvbXBpbGVyIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmVcbiAqIG1ldDpcbiAqXG4gKiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZVxuICogICAgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmdcbiAqICAgIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZFxuICogICAgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICogTmVpdGhlciB0aGUgbmFtZSBvZiBHb29nbGUgSW5jLiBub3IgdGhlIG5hbWVzIG9mIGl0c1xuICogICAgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0cyBkZXJpdmVkXG4gKiAgICBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SU1xuICogXCJBUyBJU1wiIEFORCBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVFxuICogTElNSVRFRCBUTywgVEhFIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SXG4gKiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVFxuICogT1dORVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1IgQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsXG4gKiBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UXG4gKiBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTOyBMT1NTIE9GIFVTRSxcbiAqIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OIEFOWVxuICogVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFXG4gKiBPRiBUSElTIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciBiYXNlNjQgPSByZXF1aXJlKCcuL2Jhc2U2NCcpO1xuXG4gIC8vIEEgc2luZ2xlIGJhc2UgNjQgZGlnaXQgY2FuIGNvbnRhaW4gNiBiaXRzIG9mIGRhdGEuIEZvciB0aGUgYmFzZSA2NCB2YXJpYWJsZVxuICAvLyBsZW5ndGggcXVhbnRpdGllcyB3ZSB1c2UgaW4gdGhlIHNvdXJjZSBtYXAgc3BlYywgdGhlIGZpcnN0IGJpdCBpcyB0aGUgc2lnbixcbiAgLy8gdGhlIG5leHQgZm91ciBiaXRzIGFyZSB0aGUgYWN0dWFsIHZhbHVlLCBhbmQgdGhlIDZ0aCBiaXQgaXMgdGhlXG4gIC8vIGNvbnRpbnVhdGlvbiBiaXQuIFRoZSBjb250aW51YXRpb24gYml0IHRlbGxzIHVzIHdoZXRoZXIgdGhlcmUgYXJlIG1vcmVcbiAgLy8gZGlnaXRzIGluIHRoaXMgdmFsdWUgZm9sbG93aW5nIHRoaXMgZGlnaXQuXG4gIC8vXG4gIC8vICAgQ29udGludWF0aW9uXG4gIC8vICAgfCAgICBTaWduXG4gIC8vICAgfCAgICB8XG4gIC8vICAgViAgICBWXG4gIC8vICAgMTAxMDExXG5cbiAgdmFyIFZMUV9CQVNFX1NISUZUID0gNTtcblxuICAvLyBiaW5hcnk6IDEwMDAwMFxuICB2YXIgVkxRX0JBU0UgPSAxIDw8IFZMUV9CQVNFX1NISUZUO1xuXG4gIC8vIGJpbmFyeTogMDExMTExXG4gIHZhciBWTFFfQkFTRV9NQVNLID0gVkxRX0JBU0UgLSAxO1xuXG4gIC8vIGJpbmFyeTogMTAwMDAwXG4gIHZhciBWTFFfQ09OVElOVUFUSU9OX0JJVCA9IFZMUV9CQVNFO1xuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBmcm9tIGEgdHdvLWNvbXBsZW1lbnQgdmFsdWUgdG8gYSB2YWx1ZSB3aGVyZSB0aGUgc2lnbiBiaXQgaXNcbiAgICogaXMgcGxhY2VkIGluIHRoZSBsZWFzdCBzaWduaWZpY2FudCBiaXQuICBGb3IgZXhhbXBsZSwgYXMgZGVjaW1hbHM6XG4gICAqICAgMSBiZWNvbWVzIDIgKDEwIGJpbmFyeSksIC0xIGJlY29tZXMgMyAoMTEgYmluYXJ5KVxuICAgKiAgIDIgYmVjb21lcyA0ICgxMDAgYmluYXJ5KSwgLTIgYmVjb21lcyA1ICgxMDEgYmluYXJ5KVxuICAgKi9cbiAgZnVuY3Rpb24gdG9WTFFTaWduZWQoYVZhbHVlKSB7XG4gICAgcmV0dXJuIGFWYWx1ZSA8IDBcbiAgICAgID8gKCgtYVZhbHVlKSA8PCAxKSArIDFcbiAgICAgIDogKGFWYWx1ZSA8PCAxKSArIDA7XG4gIH1cblxuICAvKipcbiAgICogQ29udmVydHMgdG8gYSB0d28tY29tcGxlbWVudCB2YWx1ZSBmcm9tIGEgdmFsdWUgd2hlcmUgdGhlIHNpZ24gYml0IGlzXG4gICAqIGlzIHBsYWNlZCBpbiB0aGUgbGVhc3Qgc2lnbmlmaWNhbnQgYml0LiAgRm9yIGV4YW1wbGUsIGFzIGRlY2ltYWxzOlxuICAgKiAgIDIgKDEwIGJpbmFyeSkgYmVjb21lcyAxLCAzICgxMSBiaW5hcnkpIGJlY29tZXMgLTFcbiAgICogICA0ICgxMDAgYmluYXJ5KSBiZWNvbWVzIDIsIDUgKDEwMSBiaW5hcnkpIGJlY29tZXMgLTJcbiAgICovXG4gIGZ1bmN0aW9uIGZyb21WTFFTaWduZWQoYVZhbHVlKSB7XG4gICAgdmFyIGlzTmVnYXRpdmUgPSAoYVZhbHVlICYgMSkgPT09IDE7XG4gICAgdmFyIHNoaWZ0ZWQgPSBhVmFsdWUgPj4gMTtcbiAgICByZXR1cm4gaXNOZWdhdGl2ZVxuICAgICAgPyAtc2hpZnRlZFxuICAgICAgOiBzaGlmdGVkO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGJhc2UgNjQgVkxRIGVuY29kZWQgdmFsdWUuXG4gICAqL1xuICBleHBvcnRzLmVuY29kZSA9IGZ1bmN0aW9uIGJhc2U2NFZMUV9lbmNvZGUoYVZhbHVlKSB7XG4gICAgdmFyIGVuY29kZWQgPSBcIlwiO1xuICAgIHZhciBkaWdpdDtcblxuICAgIHZhciB2bHEgPSB0b1ZMUVNpZ25lZChhVmFsdWUpO1xuXG4gICAgZG8ge1xuICAgICAgZGlnaXQgPSB2bHEgJiBWTFFfQkFTRV9NQVNLO1xuICAgICAgdmxxID4+Pj0gVkxRX0JBU0VfU0hJRlQ7XG4gICAgICBpZiAodmxxID4gMCkge1xuICAgICAgICAvLyBUaGVyZSBhcmUgc3RpbGwgbW9yZSBkaWdpdHMgaW4gdGhpcyB2YWx1ZSwgc28gd2UgbXVzdCBtYWtlIHN1cmUgdGhlXG4gICAgICAgIC8vIGNvbnRpbnVhdGlvbiBiaXQgaXMgbWFya2VkLlxuICAgICAgICBkaWdpdCB8PSBWTFFfQ09OVElOVUFUSU9OX0JJVDtcbiAgICAgIH1cbiAgICAgIGVuY29kZWQgKz0gYmFzZTY0LmVuY29kZShkaWdpdCk7XG4gICAgfSB3aGlsZSAodmxxID4gMCk7XG5cbiAgICByZXR1cm4gZW5jb2RlZDtcbiAgfTtcblxuICAvKipcbiAgICogRGVjb2RlcyB0aGUgbmV4dCBiYXNlIDY0IFZMUSB2YWx1ZSBmcm9tIHRoZSBnaXZlbiBzdHJpbmcgYW5kIHJldHVybnMgdGhlXG4gICAqIHZhbHVlIGFuZCB0aGUgcmVzdCBvZiB0aGUgc3RyaW5nLlxuICAgKi9cbiAgZXhwb3J0cy5kZWNvZGUgPSBmdW5jdGlvbiBiYXNlNjRWTFFfZGVjb2RlKGFTdHIpIHtcbiAgICB2YXIgaSA9IDA7XG4gICAgdmFyIHN0ckxlbiA9IGFTdHIubGVuZ3RoO1xuICAgIHZhciByZXN1bHQgPSAwO1xuICAgIHZhciBzaGlmdCA9IDA7XG4gICAgdmFyIGNvbnRpbnVhdGlvbiwgZGlnaXQ7XG5cbiAgICBkbyB7XG4gICAgICBpZiAoaSA+PSBzdHJMZW4pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgbW9yZSBkaWdpdHMgaW4gYmFzZSA2NCBWTFEgdmFsdWUuXCIpO1xuICAgICAgfVxuICAgICAgZGlnaXQgPSBiYXNlNjQuZGVjb2RlKGFTdHIuY2hhckF0KGkrKykpO1xuICAgICAgY29udGludWF0aW9uID0gISEoZGlnaXQgJiBWTFFfQ09OVElOVUFUSU9OX0JJVCk7XG4gICAgICBkaWdpdCAmPSBWTFFfQkFTRV9NQVNLO1xuICAgICAgcmVzdWx0ID0gcmVzdWx0ICsgKGRpZ2l0IDw8IHNoaWZ0KTtcbiAgICAgIHNoaWZ0ICs9IFZMUV9CQVNFX1NISUZUO1xuICAgIH0gd2hpbGUgKGNvbnRpbnVhdGlvbik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmFsdWU6IGZyb21WTFFTaWduZWQocmVzdWx0KSxcbiAgICAgIHJlc3Q6IGFTdHIuc2xpY2UoaSlcbiAgICB9O1xuICB9O1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIGNoYXJUb0ludE1hcCA9IHt9O1xuICB2YXIgaW50VG9DaGFyTWFwID0ge307XG5cbiAgJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5mb3JFYWNoKGZ1bmN0aW9uIChjaCwgaW5kZXgpIHtcbiAgICAgIGNoYXJUb0ludE1hcFtjaF0gPSBpbmRleDtcbiAgICAgIGludFRvQ2hhck1hcFtpbmRleF0gPSBjaDtcbiAgICB9KTtcblxuICAvKipcbiAgICogRW5jb2RlIGFuIGludGVnZXIgaW4gdGhlIHJhbmdlIG9mIDAgdG8gNjMgdG8gYSBzaW5nbGUgYmFzZSA2NCBkaWdpdC5cbiAgICovXG4gIGV4cG9ydHMuZW5jb2RlID0gZnVuY3Rpb24gYmFzZTY0X2VuY29kZShhTnVtYmVyKSB7XG4gICAgaWYgKGFOdW1iZXIgaW4gaW50VG9DaGFyTWFwKSB7XG4gICAgICByZXR1cm4gaW50VG9DaGFyTWFwW2FOdW1iZXJdO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBiZSBiZXR3ZWVuIDAgYW5kIDYzOiBcIiArIGFOdW1iZXIpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBEZWNvZGUgYSBzaW5nbGUgYmFzZSA2NCBkaWdpdCB0byBhbiBpbnRlZ2VyLlxuICAgKi9cbiAgZXhwb3J0cy5kZWNvZGUgPSBmdW5jdGlvbiBiYXNlNjRfZGVjb2RlKGFDaGFyKSB7XG4gICAgaWYgKGFDaGFyIGluIGNoYXJUb0ludE1hcCkge1xuICAgICAgcmV0dXJuIGNoYXJUb0ludE1hcFthQ2hhcl07XG4gICAgfVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJOb3QgYSB2YWxpZCBiYXNlIDY0IGRpZ2l0OiBcIiArIGFDaGFyKTtcbiAgfTtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIC8qKlxuICAgKiBSZWN1cnNpdmUgaW1wbGVtZW50YXRpb24gb2YgYmluYXJ5IHNlYXJjaC5cbiAgICpcbiAgICogQHBhcmFtIGFMb3cgSW5kaWNlcyBoZXJlIGFuZCBsb3dlciBkbyBub3QgY29udGFpbiB0aGUgbmVlZGxlLlxuICAgKiBAcGFyYW0gYUhpZ2ggSW5kaWNlcyBoZXJlIGFuZCBoaWdoZXIgZG8gbm90IGNvbnRhaW4gdGhlIG5lZWRsZS5cbiAgICogQHBhcmFtIGFOZWVkbGUgVGhlIGVsZW1lbnQgYmVpbmcgc2VhcmNoZWQgZm9yLlxuICAgKiBAcGFyYW0gYUhheXN0YWNrIFRoZSBub24tZW1wdHkgYXJyYXkgYmVpbmcgc2VhcmNoZWQuXG4gICAqIEBwYXJhbSBhQ29tcGFyZSBGdW5jdGlvbiB3aGljaCB0YWtlcyB0d28gZWxlbWVudHMgYW5kIHJldHVybnMgLTEsIDAsIG9yIDEuXG4gICAqL1xuICBmdW5jdGlvbiByZWN1cnNpdmVTZWFyY2goYUxvdywgYUhpZ2gsIGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpIHtcbiAgICAvLyBUaGlzIGZ1bmN0aW9uIHRlcm1pbmF0ZXMgd2hlbiBvbmUgb2YgdGhlIGZvbGxvd2luZyBpcyB0cnVlOlxuICAgIC8vXG4gICAgLy8gICAxLiBXZSBmaW5kIHRoZSBleGFjdCBlbGVtZW50IHdlIGFyZSBsb29raW5nIGZvci5cbiAgICAvL1xuICAgIC8vICAgMi4gV2UgZGlkIG5vdCBmaW5kIHRoZSBleGFjdCBlbGVtZW50LCBidXQgd2UgY2FuIHJldHVybiB0aGUgbmV4dFxuICAgIC8vICAgICAgY2xvc2VzdCBlbGVtZW50IHRoYXQgaXMgbGVzcyB0aGFuIHRoYXQgZWxlbWVudC5cbiAgICAvL1xuICAgIC8vICAgMy4gV2UgZGlkIG5vdCBmaW5kIHRoZSBleGFjdCBlbGVtZW50LCBhbmQgdGhlcmUgaXMgbm8gbmV4dC1jbG9zZXN0XG4gICAgLy8gICAgICBlbGVtZW50IHdoaWNoIGlzIGxlc3MgdGhhbiB0aGUgb25lIHdlIGFyZSBzZWFyY2hpbmcgZm9yLCBzbyB3ZVxuICAgIC8vICAgICAgcmV0dXJuIG51bGwuXG4gICAgdmFyIG1pZCA9IE1hdGguZmxvb3IoKGFIaWdoIC0gYUxvdykgLyAyKSArIGFMb3c7XG4gICAgdmFyIGNtcCA9IGFDb21wYXJlKGFOZWVkbGUsIGFIYXlzdGFja1ttaWRdLCB0cnVlKTtcbiAgICBpZiAoY21wID09PSAwKSB7XG4gICAgICAvLyBGb3VuZCB0aGUgZWxlbWVudCB3ZSBhcmUgbG9va2luZyBmb3IuXG4gICAgICByZXR1cm4gYUhheXN0YWNrW21pZF07XG4gICAgfVxuICAgIGVsc2UgaWYgKGNtcCA+IDApIHtcbiAgICAgIC8vIGFIYXlzdGFja1ttaWRdIGlzIGdyZWF0ZXIgdGhhbiBvdXIgbmVlZGxlLlxuICAgICAgaWYgKGFIaWdoIC0gbWlkID4gMSkge1xuICAgICAgICAvLyBUaGUgZWxlbWVudCBpcyBpbiB0aGUgdXBwZXIgaGFsZi5cbiAgICAgICAgcmV0dXJuIHJlY3Vyc2l2ZVNlYXJjaChtaWQsIGFIaWdoLCBhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKTtcbiAgICAgIH1cbiAgICAgIC8vIFdlIGRpZCBub3QgZmluZCBhbiBleGFjdCBtYXRjaCwgcmV0dXJuIHRoZSBuZXh0IGNsb3Nlc3Qgb25lXG4gICAgICAvLyAodGVybWluYXRpb24gY2FzZSAyKS5cbiAgICAgIHJldHVybiBhSGF5c3RhY2tbbWlkXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAvLyBhSGF5c3RhY2tbbWlkXSBpcyBsZXNzIHRoYW4gb3VyIG5lZWRsZS5cbiAgICAgIGlmIChtaWQgLSBhTG93ID4gMSkge1xuICAgICAgICAvLyBUaGUgZWxlbWVudCBpcyBpbiB0aGUgbG93ZXIgaGFsZi5cbiAgICAgICAgcmV0dXJuIHJlY3Vyc2l2ZVNlYXJjaChhTG93LCBtaWQsIGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpO1xuICAgICAgfVxuICAgICAgLy8gVGhlIGV4YWN0IG5lZWRsZSBlbGVtZW50IHdhcyBub3QgZm91bmQgaW4gdGhpcyBoYXlzdGFjay4gRGV0ZXJtaW5lIGlmXG4gICAgICAvLyB3ZSBhcmUgaW4gdGVybWluYXRpb24gY2FzZSAoMikgb3IgKDMpIGFuZCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIHRoaW5nLlxuICAgICAgcmV0dXJuIGFMb3cgPCAwXG4gICAgICAgID8gbnVsbFxuICAgICAgICA6IGFIYXlzdGFja1thTG93XTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyBhbiBpbXBsZW1lbnRhdGlvbiBvZiBiaW5hcnkgc2VhcmNoIHdoaWNoIHdpbGwgYWx3YXlzIHRyeSBhbmQgcmV0dXJuXG4gICAqIHRoZSBuZXh0IGxvd2VzdCB2YWx1ZSBjaGVja2VkIGlmIHRoZXJlIGlzIG5vIGV4YWN0IGhpdC4gVGhpcyBpcyBiZWNhdXNlXG4gICAqIG1hcHBpbmdzIGJldHdlZW4gb3JpZ2luYWwgYW5kIGdlbmVyYXRlZCBsaW5lL2NvbCBwYWlycyBhcmUgc2luZ2xlIHBvaW50cyxcbiAgICogYW5kIHRoZXJlIGlzIGFuIGltcGxpY2l0IHJlZ2lvbiBiZXR3ZWVuIGVhY2ggb2YgdGhlbSwgc28gYSBtaXNzIGp1c3QgbWVhbnNcbiAgICogdGhhdCB5b3UgYXJlbid0IG9uIHRoZSB2ZXJ5IHN0YXJ0IG9mIGEgcmVnaW9uLlxuICAgKlxuICAgKiBAcGFyYW0gYU5lZWRsZSBUaGUgZWxlbWVudCB5b3UgYXJlIGxvb2tpbmcgZm9yLlxuICAgKiBAcGFyYW0gYUhheXN0YWNrIFRoZSBhcnJheSB0aGF0IGlzIGJlaW5nIHNlYXJjaGVkLlxuICAgKiBAcGFyYW0gYUNvbXBhcmUgQSBmdW5jdGlvbiB3aGljaCB0YWtlcyB0aGUgbmVlZGxlIGFuZCBhbiBlbGVtZW50IGluIHRoZVxuICAgKiAgICAgYXJyYXkgYW5kIHJldHVybnMgLTEsIDAsIG9yIDEgZGVwZW5kaW5nIG9uIHdoZXRoZXIgdGhlIG5lZWRsZSBpcyBsZXNzXG4gICAqICAgICB0aGFuLCBlcXVhbCB0bywgb3IgZ3JlYXRlciB0aGFuIHRoZSBlbGVtZW50LCByZXNwZWN0aXZlbHkuXG4gICAqL1xuICBleHBvcnRzLnNlYXJjaCA9IGZ1bmN0aW9uIHNlYXJjaChhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKSB7XG4gICAgcmV0dXJuIGFIYXlzdGFjay5sZW5ndGggPiAwXG4gICAgICA/IHJlY3Vyc2l2ZVNlYXJjaCgtMSwgYUhheXN0YWNrLmxlbmd0aCwgYU5lZWRsZSwgYUhheXN0YWNrLCBhQ29tcGFyZSlcbiAgICAgIDogbnVsbDtcbiAgfTtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG4gIHZhciBiaW5hcnlTZWFyY2ggPSByZXF1aXJlKCcuL2JpbmFyeS1zZWFyY2gnKTtcbiAgdmFyIEFycmF5U2V0ID0gcmVxdWlyZSgnLi9hcnJheS1zZXQnKS5BcnJheVNldDtcbiAgdmFyIGJhc2U2NFZMUSA9IHJlcXVpcmUoJy4vYmFzZTY0LXZscScpO1xuXG4gIC8qKlxuICAgKiBBIFNvdXJjZU1hcENvbnN1bWVyIGluc3RhbmNlIHJlcHJlc2VudHMgYSBwYXJzZWQgc291cmNlIG1hcCB3aGljaCB3ZSBjYW5cbiAgICogcXVlcnkgZm9yIGluZm9ybWF0aW9uIGFib3V0IHRoZSBvcmlnaW5hbCBmaWxlIHBvc2l0aW9ucyBieSBnaXZpbmcgaXQgYSBmaWxlXG4gICAqIHBvc2l0aW9uIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKlxuICAgKiBUaGUgb25seSBwYXJhbWV0ZXIgaXMgdGhlIHJhdyBzb3VyY2UgbWFwIChlaXRoZXIgYXMgYSBKU09OIHN0cmluZywgb3JcbiAgICogYWxyZWFkeSBwYXJzZWQgdG8gYW4gb2JqZWN0KS4gQWNjb3JkaW5nIHRvIHRoZSBzcGVjLCBzb3VyY2UgbWFwcyBoYXZlIHRoZVxuICAgKiBmb2xsb3dpbmcgYXR0cmlidXRlczpcbiAgICpcbiAgICogICAtIHZlcnNpb246IFdoaWNoIHZlcnNpb24gb2YgdGhlIHNvdXJjZSBtYXAgc3BlYyB0aGlzIG1hcCBpcyBmb2xsb3dpbmcuXG4gICAqICAgLSBzb3VyY2VzOiBBbiBhcnJheSBvZiBVUkxzIHRvIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXMuXG4gICAqICAgLSBuYW1lczogQW4gYXJyYXkgb2YgaWRlbnRpZmllcnMgd2hpY2ggY2FuIGJlIHJlZmVycmVuY2VkIGJ5IGluZGl2aWR1YWwgbWFwcGluZ3MuXG4gICAqICAgLSBzb3VyY2VSb290OiBPcHRpb25hbC4gVGhlIFVSTCByb290IGZyb20gd2hpY2ggYWxsIHNvdXJjZXMgYXJlIHJlbGF0aXZlLlxuICAgKiAgIC0gc291cmNlc0NvbnRlbnQ6IE9wdGlvbmFsLiBBbiBhcnJheSBvZiBjb250ZW50cyBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzLlxuICAgKiAgIC0gbWFwcGluZ3M6IEEgc3RyaW5nIG9mIGJhc2U2NCBWTFFzIHdoaWNoIGNvbnRhaW4gdGhlIGFjdHVhbCBtYXBwaW5ncy5cbiAgICogICAtIGZpbGU6IE9wdGlvbmFsLiBUaGUgZ2VuZXJhdGVkIGZpbGUgdGhpcyBzb3VyY2UgbWFwIGlzIGFzc29jaWF0ZWQgd2l0aC5cbiAgICpcbiAgICogSGVyZSBpcyBhbiBleGFtcGxlIHNvdXJjZSBtYXAsIHRha2VuIGZyb20gdGhlIHNvdXJjZSBtYXAgc3BlY1swXTpcbiAgICpcbiAgICogICAgIHtcbiAgICogICAgICAgdmVyc2lvbiA6IDMsXG4gICAqICAgICAgIGZpbGU6IFwib3V0LmpzXCIsXG4gICAqICAgICAgIHNvdXJjZVJvb3QgOiBcIlwiLFxuICAgKiAgICAgICBzb3VyY2VzOiBbXCJmb28uanNcIiwgXCJiYXIuanNcIl0sXG4gICAqICAgICAgIG5hbWVzOiBbXCJzcmNcIiwgXCJtYXBzXCIsIFwiYXJlXCIsIFwiZnVuXCJdLFxuICAgKiAgICAgICBtYXBwaW5nczogXCJBQSxBQjs7QUJDREU7XCJcbiAgICogICAgIH1cbiAgICpcbiAgICogWzBdOiBodHRwczovL2RvY3MuZ29vZ2xlLmNvbS9kb2N1bWVudC9kLzFVMVJHQWVoUXdSeXBVVG92RjFLUmxwaU9GemUwYi1fMmdjNmZBSDBLWTBrL2VkaXQ/cGxpPTEjXG4gICAqL1xuICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcihhU291cmNlTWFwKSB7XG4gICAgdmFyIHNvdXJjZU1hcCA9IGFTb3VyY2VNYXA7XG4gICAgaWYgKHR5cGVvZiBhU291cmNlTWFwID09PSAnc3RyaW5nJykge1xuICAgICAgc291cmNlTWFwID0gSlNPTi5wYXJzZShhU291cmNlTWFwLnJlcGxhY2UoL15cXClcXF1cXH0nLywgJycpKTtcbiAgICB9XG5cbiAgICB2YXIgdmVyc2lvbiA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3ZlcnNpb24nKTtcbiAgICB2YXIgc291cmNlcyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZXMnKTtcbiAgICAvLyBTYXNzIDMuMyBsZWF2ZXMgb3V0IHRoZSAnbmFtZXMnIGFycmF5LCBzbyB3ZSBkZXZpYXRlIGZyb20gdGhlIHNwZWMgKHdoaWNoXG4gICAgLy8gcmVxdWlyZXMgdGhlIGFycmF5KSB0byBwbGF5IG5pY2UgaGVyZS5cbiAgICB2YXIgbmFtZXMgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICduYW1lcycsIFtdKTtcbiAgICB2YXIgc291cmNlUm9vdCA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZVJvb3QnLCBudWxsKTtcbiAgICB2YXIgc291cmNlc0NvbnRlbnQgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICdzb3VyY2VzQ29udGVudCcsIG51bGwpO1xuICAgIHZhciBtYXBwaW5ncyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ21hcHBpbmdzJyk7XG4gICAgdmFyIGZpbGUgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICdmaWxlJywgbnVsbCk7XG5cbiAgICAvLyBPbmNlIGFnYWluLCBTYXNzIGRldmlhdGVzIGZyb20gdGhlIHNwZWMgYW5kIHN1cHBsaWVzIHRoZSB2ZXJzaW9uIGFzIGFcbiAgICAvLyBzdHJpbmcgcmF0aGVyIHRoYW4gYSBudW1iZXIsIHNvIHdlIHVzZSBsb29zZSBlcXVhbGl0eSBjaGVja2luZyBoZXJlLlxuICAgIGlmICh2ZXJzaW9uICE9IHRoaXMuX3ZlcnNpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgdmVyc2lvbjogJyArIHZlcnNpb24pO1xuICAgIH1cblxuICAgIC8vIFBhc3MgYHRydWVgIGJlbG93IHRvIGFsbG93IGR1cGxpY2F0ZSBuYW1lcyBhbmQgc291cmNlcy4gV2hpbGUgc291cmNlIG1hcHNcbiAgICAvLyBhcmUgaW50ZW5kZWQgdG8gYmUgY29tcHJlc3NlZCBhbmQgZGVkdXBsaWNhdGVkLCB0aGUgVHlwZVNjcmlwdCBjb21waWxlclxuICAgIC8vIHNvbWV0aW1lcyBnZW5lcmF0ZXMgc291cmNlIG1hcHMgd2l0aCBkdXBsaWNhdGVzIGluIHRoZW0uIFNlZSBHaXRodWIgaXNzdWVcbiAgICAvLyAjNzIgYW5kIGJ1Z3ppbC5sYS84ODk0OTIuXG4gICAgdGhpcy5fbmFtZXMgPSBBcnJheVNldC5mcm9tQXJyYXkobmFtZXMsIHRydWUpO1xuICAgIHRoaXMuX3NvdXJjZXMgPSBBcnJheVNldC5mcm9tQXJyYXkoc291cmNlcywgdHJ1ZSk7XG5cbiAgICB0aGlzLnNvdXJjZVJvb3QgPSBzb3VyY2VSb290O1xuICAgIHRoaXMuc291cmNlc0NvbnRlbnQgPSBzb3VyY2VzQ29udGVudDtcbiAgICB0aGlzLl9tYXBwaW5ncyA9IG1hcHBpbmdzO1xuICAgIHRoaXMuZmlsZSA9IGZpbGU7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgU291cmNlTWFwQ29uc3VtZXIgZnJvbSBhIFNvdXJjZU1hcEdlbmVyYXRvci5cbiAgICpcbiAgICogQHBhcmFtIFNvdXJjZU1hcEdlbmVyYXRvciBhU291cmNlTWFwXG4gICAqICAgICAgICBUaGUgc291cmNlIG1hcCB0aGF0IHdpbGwgYmUgY29uc3VtZWQuXG4gICAqIEByZXR1cm5zIFNvdXJjZU1hcENvbnN1bWVyXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5mcm9tU291cmNlTWFwID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9mcm9tU291cmNlTWFwKGFTb3VyY2VNYXApIHtcbiAgICAgIHZhciBzbWMgPSBPYmplY3QuY3JlYXRlKFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZSk7XG5cbiAgICAgIHNtYy5fbmFtZXMgPSBBcnJheVNldC5mcm9tQXJyYXkoYVNvdXJjZU1hcC5fbmFtZXMudG9BcnJheSgpLCB0cnVlKTtcbiAgICAgIHNtYy5fc291cmNlcyA9IEFycmF5U2V0LmZyb21BcnJheShhU291cmNlTWFwLl9zb3VyY2VzLnRvQXJyYXkoKSwgdHJ1ZSk7XG4gICAgICBzbWMuc291cmNlUm9vdCA9IGFTb3VyY2VNYXAuX3NvdXJjZVJvb3Q7XG4gICAgICBzbWMuc291cmNlc0NvbnRlbnQgPSBhU291cmNlTWFwLl9nZW5lcmF0ZVNvdXJjZXNDb250ZW50KHNtYy5fc291cmNlcy50b0FycmF5KCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNtYy5zb3VyY2VSb290KTtcbiAgICAgIHNtYy5maWxlID0gYVNvdXJjZU1hcC5fZmlsZTtcblxuICAgICAgc21jLl9fZ2VuZXJhdGVkTWFwcGluZ3MgPSBhU291cmNlTWFwLl9tYXBwaW5ncy5zbGljZSgpXG4gICAgICAgIC5zb3J0KHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcbiAgICAgIHNtYy5fX29yaWdpbmFsTWFwcGluZ3MgPSBhU291cmNlTWFwLl9tYXBwaW5ncy5zbGljZSgpXG4gICAgICAgIC5zb3J0KHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuXG4gICAgICByZXR1cm4gc21jO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwcGluZyBzcGVjIHRoYXQgd2UgYXJlIGNvbnN1bWluZy5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fdmVyc2lvbiA9IDM7XG5cbiAgLyoqXG4gICAqIFRoZSBsaXN0IG9mIG9yaWdpbmFsIHNvdXJjZXMuXG4gICAqL1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLCAnc291cmNlcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zb3VyY2VzLnRvQXJyYXkoKS5tYXAoZnVuY3Rpb24gKHMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlUm9vdCA/IHV0aWwuam9pbih0aGlzLnNvdXJjZVJvb3QsIHMpIDogcztcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gYF9fZ2VuZXJhdGVkTWFwcGluZ3NgIGFuZCBgX19vcmlnaW5hbE1hcHBpbmdzYCBhcmUgYXJyYXlzIHRoYXQgaG9sZCB0aGVcbiAgLy8gcGFyc2VkIG1hcHBpbmcgY29vcmRpbmF0ZXMgZnJvbSB0aGUgc291cmNlIG1hcCdzIFwibWFwcGluZ3NcIiBhdHRyaWJ1dGUuIFRoZXlcbiAgLy8gYXJlIGxhemlseSBpbnN0YW50aWF0ZWQsIGFjY2Vzc2VkIHZpYSB0aGUgYF9nZW5lcmF0ZWRNYXBwaW5nc2AgYW5kXG4gIC8vIGBfb3JpZ2luYWxNYXBwaW5nc2AgZ2V0dGVycyByZXNwZWN0aXZlbHksIGFuZCB3ZSBvbmx5IHBhcnNlIHRoZSBtYXBwaW5nc1xuICAvLyBhbmQgY3JlYXRlIHRoZXNlIGFycmF5cyBvbmNlIHF1ZXJpZWQgZm9yIGEgc291cmNlIGxvY2F0aW9uLiBXZSBqdW1wIHRocm91Z2hcbiAgLy8gdGhlc2UgaG9vcHMgYmVjYXVzZSB0aGVyZSBjYW4gYmUgbWFueSB0aG91c2FuZHMgb2YgbWFwcGluZ3MsIGFuZCBwYXJzaW5nXG4gIC8vIHRoZW0gaXMgZXhwZW5zaXZlLCBzbyB3ZSBvbmx5IHdhbnQgdG8gZG8gaXQgaWYgd2UgbXVzdC5cbiAgLy9cbiAgLy8gRWFjaCBvYmplY3QgaW4gdGhlIGFycmF5cyBpcyBvZiB0aGUgZm9ybTpcbiAgLy9cbiAgLy8gICAgIHtcbiAgLy8gICAgICAgZ2VuZXJhdGVkTGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgY29kZSxcbiAgLy8gICAgICAgZ2VuZXJhdGVkQ29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIGNvZGUsXG4gIC8vICAgICAgIHNvdXJjZTogVGhlIHBhdGggdG8gdGhlIG9yaWdpbmFsIHNvdXJjZSBmaWxlIHRoYXQgZ2VuZXJhdGVkIHRoaXNcbiAgLy8gICAgICAgICAgICAgICBjaHVuayBvZiBjb2RlLFxuICAvLyAgICAgICBvcmlnaW5hbExpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlIHRoYXRcbiAgLy8gICAgICAgICAgICAgICAgICAgICBjb3JyZXNwb25kcyB0byB0aGlzIGNodW5rIG9mIGdlbmVyYXRlZCBjb2RlLFxuICAvLyAgICAgICBvcmlnaW5hbENvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZSB0aGF0XG4gIC8vICAgICAgICAgICAgICAgICAgICAgICBjb3JyZXNwb25kcyB0byB0aGlzIGNodW5rIG9mIGdlbmVyYXRlZCBjb2RlLFxuICAvLyAgICAgICBuYW1lOiBUaGUgbmFtZSBvZiB0aGUgb3JpZ2luYWwgc3ltYm9sIHdoaWNoIGdlbmVyYXRlZCB0aGlzIGNodW5rIG9mXG4gIC8vICAgICAgICAgICAgIGNvZGUuXG4gIC8vICAgICB9XG4gIC8vXG4gIC8vIEFsbCBwcm9wZXJ0aWVzIGV4Y2VwdCBmb3IgYGdlbmVyYXRlZExpbmVgIGFuZCBgZ2VuZXJhdGVkQ29sdW1uYCBjYW4gYmVcbiAgLy8gYG51bGxgLlxuICAvL1xuICAvLyBgX2dlbmVyYXRlZE1hcHBpbmdzYCBpcyBvcmRlcmVkIGJ5IHRoZSBnZW5lcmF0ZWQgcG9zaXRpb25zLlxuICAvL1xuICAvLyBgX29yaWdpbmFsTWFwcGluZ3NgIGlzIG9yZGVyZWQgYnkgdGhlIG9yaWdpbmFsIHBvc2l0aW9ucy5cblxuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IG51bGw7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUsICdfZ2VuZXJhdGVkTWFwcGluZ3MnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoIXRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncykge1xuICAgICAgICB0aGlzLl9fZ2VuZXJhdGVkTWFwcGluZ3MgPSBbXTtcbiAgICAgICAgdGhpcy5fX29yaWdpbmFsTWFwcGluZ3MgPSBbXTtcbiAgICAgICAgdGhpcy5fcGFyc2VNYXBwaW5ncyh0aGlzLl9tYXBwaW5ncywgdGhpcy5zb3VyY2VSb290KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncztcbiAgICB9XG4gIH0pO1xuXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fX29yaWdpbmFsTWFwcGluZ3MgPSBudWxsO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLCAnX29yaWdpbmFsTWFwcGluZ3MnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoIXRoaXMuX19vcmlnaW5hbE1hcHBpbmdzKSB7XG4gICAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wYXJzZU1hcHBpbmdzKHRoaXMuX21hcHBpbmdzLCB0aGlzLnNvdXJjZVJvb3QpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fX29yaWdpbmFsTWFwcGluZ3M7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogUGFyc2UgdGhlIG1hcHBpbmdzIGluIGEgc3RyaW5nIGluIHRvIGEgZGF0YSBzdHJ1Y3R1cmUgd2hpY2ggd2UgY2FuIGVhc2lseVxuICAgKiBxdWVyeSAodGhlIG9yZGVyZWQgYXJyYXlzIGluIHRoZSBgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzYCBhbmRcbiAgICogYHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzYCBwcm9wZXJ0aWVzKS5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fcGFyc2VNYXBwaW5ncyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfcGFyc2VNYXBwaW5ncyhhU3RyLCBhU291cmNlUm9vdCkge1xuICAgICAgdmFyIGdlbmVyYXRlZExpbmUgPSAxO1xuICAgICAgdmFyIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgIHZhciBwcmV2aW91c09yaWdpbmFsTGluZSA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNTb3VyY2UgPSAwO1xuICAgICAgdmFyIHByZXZpb3VzTmFtZSA9IDA7XG4gICAgICB2YXIgbWFwcGluZ1NlcGFyYXRvciA9IC9eWyw7XS87XG4gICAgICB2YXIgc3RyID0gYVN0cjtcbiAgICAgIHZhciBtYXBwaW5nO1xuICAgICAgdmFyIHRlbXA7XG5cbiAgICAgIHdoaWxlIChzdHIubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAoc3RyLmNoYXJBdCgwKSA9PT0gJzsnKSB7XG4gICAgICAgICAgZ2VuZXJhdGVkTGluZSsrO1xuICAgICAgICAgIHN0ciA9IHN0ci5zbGljZSgxKTtcbiAgICAgICAgICBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc3RyLmNoYXJBdCgwKSA9PT0gJywnKSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIG1hcHBpbmcgPSB7fTtcbiAgICAgICAgICBtYXBwaW5nLmdlbmVyYXRlZExpbmUgPSBnZW5lcmF0ZWRMaW5lO1xuXG4gICAgICAgICAgLy8gR2VuZXJhdGVkIGNvbHVtbi5cbiAgICAgICAgICB0ZW1wID0gYmFzZTY0VkxRLmRlY29kZShzdHIpO1xuICAgICAgICAgIG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uID0gcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gKyB0ZW1wLnZhbHVlO1xuICAgICAgICAgIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW47XG4gICAgICAgICAgc3RyID0gdGVtcC5yZXN0O1xuXG4gICAgICAgICAgaWYgKHN0ci5sZW5ndGggPiAwICYmICFtYXBwaW5nU2VwYXJhdG9yLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcbiAgICAgICAgICAgIC8vIE9yaWdpbmFsIHNvdXJjZS5cbiAgICAgICAgICAgIHRlbXAgPSBiYXNlNjRWTFEuZGVjb2RlKHN0cik7XG4gICAgICAgICAgICBtYXBwaW5nLnNvdXJjZSA9IHRoaXMuX3NvdXJjZXMuYXQocHJldmlvdXNTb3VyY2UgKyB0ZW1wLnZhbHVlKTtcbiAgICAgICAgICAgIHByZXZpb3VzU291cmNlICs9IHRlbXAudmFsdWU7XG4gICAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG4gICAgICAgICAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCB8fCBtYXBwaW5nU2VwYXJhdG9yLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCBhIHNvdXJjZSwgYnV0IG5vIGxpbmUgYW5kIGNvbHVtbicpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPcmlnaW5hbCBsaW5lLlxuICAgICAgICAgICAgdGVtcCA9IGJhc2U2NFZMUS5kZWNvZGUoc3RyKTtcbiAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxMaW5lID0gcHJldmlvdXNPcmlnaW5hbExpbmUgKyB0ZW1wLnZhbHVlO1xuICAgICAgICAgICAgcHJldmlvdXNPcmlnaW5hbExpbmUgPSBtYXBwaW5nLm9yaWdpbmFsTGluZTtcbiAgICAgICAgICAgIC8vIExpbmVzIGFyZSBzdG9yZWQgMC1iYXNlZFxuICAgICAgICAgICAgbWFwcGluZy5vcmlnaW5hbExpbmUgKz0gMTtcbiAgICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcbiAgICAgICAgICAgIGlmIChzdHIubGVuZ3RoID09PSAwIHx8IG1hcHBpbmdTZXBhcmF0b3IudGVzdChzdHIuY2hhckF0KDApKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIGEgc291cmNlIGFuZCBsaW5lLCBidXQgbm8gY29sdW1uJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9yaWdpbmFsIGNvbHVtbi5cbiAgICAgICAgICAgIHRlbXAgPSBiYXNlNjRWTFEuZGVjb2RlKHN0cik7XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uID0gcHJldmlvdXNPcmlnaW5hbENvbHVtbiArIHRlbXAudmFsdWU7XG4gICAgICAgICAgICBwcmV2aW91c09yaWdpbmFsQ29sdW1uID0gbWFwcGluZy5vcmlnaW5hbENvbHVtbjtcbiAgICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcblxuICAgICAgICAgICAgaWYgKHN0ci5sZW5ndGggPiAwICYmICFtYXBwaW5nU2VwYXJhdG9yLnRlc3Qoc3RyLmNoYXJBdCgwKSkpIHtcbiAgICAgICAgICAgICAgLy8gT3JpZ2luYWwgbmFtZS5cbiAgICAgICAgICAgICAgdGVtcCA9IGJhc2U2NFZMUS5kZWNvZGUoc3RyKTtcbiAgICAgICAgICAgICAgbWFwcGluZy5uYW1lID0gdGhpcy5fbmFtZXMuYXQocHJldmlvdXNOYW1lICsgdGVtcC52YWx1ZSk7XG4gICAgICAgICAgICAgIHByZXZpb3VzTmFtZSArPSB0ZW1wLnZhbHVlO1xuICAgICAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzLnB1c2gobWFwcGluZyk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBtYXBwaW5nLm9yaWdpbmFsTGluZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzLnB1c2gobWFwcGluZyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncy5zb3J0KHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcbiAgICAgIHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzLnNvcnQodXRpbC5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyk7XG4gICAgfTtcblxuICAvKipcbiAgICogRmluZCB0aGUgbWFwcGluZyB0aGF0IGJlc3QgbWF0Y2hlcyB0aGUgaHlwb3RoZXRpY2FsIFwibmVlZGxlXCIgbWFwcGluZyB0aGF0XG4gICAqIHdlIGFyZSBzZWFyY2hpbmcgZm9yIGluIHRoZSBnaXZlbiBcImhheXN0YWNrXCIgb2YgbWFwcGluZ3MuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuX2ZpbmRNYXBwaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9maW5kTWFwcGluZyhhTmVlZGxlLCBhTWFwcGluZ3MsIGFMaW5lTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhQ29sdW1uTmFtZSwgYUNvbXBhcmF0b3IpIHtcbiAgICAgIC8vIFRvIHJldHVybiB0aGUgcG9zaXRpb24gd2UgYXJlIHNlYXJjaGluZyBmb3IsIHdlIG11c3QgZmlyc3QgZmluZCB0aGVcbiAgICAgIC8vIG1hcHBpbmcgZm9yIHRoZSBnaXZlbiBwb3NpdGlvbiBhbmQgdGhlbiByZXR1cm4gdGhlIG9wcG9zaXRlIHBvc2l0aW9uIGl0XG4gICAgICAvLyBwb2ludHMgdG8uIEJlY2F1c2UgdGhlIG1hcHBpbmdzIGFyZSBzb3J0ZWQsIHdlIGNhbiB1c2UgYmluYXJ5IHNlYXJjaCB0b1xuICAgICAgLy8gZmluZCB0aGUgYmVzdCBtYXBwaW5nLlxuXG4gICAgICBpZiAoYU5lZWRsZVthTGluZU5hbWVdIDw9IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignTGluZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byAxLCBnb3QgJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgYU5lZWRsZVthTGluZU5hbWVdKTtcbiAgICAgIH1cbiAgICAgIGlmIChhTmVlZGxlW2FDb2x1bW5OYW1lXSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ29sdW1uIG11c3QgYmUgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDAsIGdvdCAnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBhTmVlZGxlW2FDb2x1bW5OYW1lXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBiaW5hcnlTZWFyY2guc2VhcmNoKGFOZWVkbGUsIGFNYXBwaW5ncywgYUNvbXBhcmF0b3IpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG9yaWdpbmFsIHNvdXJjZSwgbGluZSwgYW5kIGNvbHVtbiBpbmZvcm1hdGlvbiBmb3IgdGhlIGdlbmVyYXRlZFxuICAgKiBzb3VyY2UncyBsaW5lIGFuZCBjb2x1bW4gcG9zaXRpb25zIHByb3ZpZGVkLiBUaGUgb25seSBhcmd1bWVudCBpcyBhbiBvYmplY3RcbiAgICogd2l0aCB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBsaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UuXG4gICAqICAgLSBjb2x1bW46IFRoZSBjb2x1bW4gbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKlxuICAgKiBhbmQgYW4gb2JqZWN0IGlzIHJldHVybmVkIHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gc291cmNlOiBUaGUgb3JpZ2luYWwgc291cmNlIGZpbGUsIG9yIG51bGwuXG4gICAqICAgLSBsaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZSwgb3IgbnVsbC5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZSwgb3IgbnVsbC5cbiAgICogICAtIG5hbWU6IFRoZSBvcmlnaW5hbCBpZGVudGlmaWVyLCBvciBudWxsLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLm9yaWdpbmFsUG9zaXRpb25Gb3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX29yaWdpbmFsUG9zaXRpb25Gb3IoYUFyZ3MpIHtcbiAgICAgIHZhciBuZWVkbGUgPSB7XG4gICAgICAgIGdlbmVyYXRlZExpbmU6IHV0aWwuZ2V0QXJnKGFBcmdzLCAnbGluZScpLFxuICAgICAgICBnZW5lcmF0ZWRDb2x1bW46IHV0aWwuZ2V0QXJnKGFBcmdzLCAnY29sdW1uJylcbiAgICAgIH07XG5cbiAgICAgIHZhciBtYXBwaW5nID0gdGhpcy5fZmluZE1hcHBpbmcobmVlZGxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9nZW5lcmF0ZWRNYXBwaW5ncyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJnZW5lcmF0ZWRMaW5lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VuZXJhdGVkQ29sdW1uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcblxuICAgICAgaWYgKG1hcHBpbmcgJiYgbWFwcGluZy5nZW5lcmF0ZWRMaW5lID09PSBuZWVkbGUuZ2VuZXJhdGVkTGluZSkge1xuICAgICAgICB2YXIgc291cmNlID0gdXRpbC5nZXRBcmcobWFwcGluZywgJ3NvdXJjZScsIG51bGwpO1xuICAgICAgICBpZiAoc291cmNlICYmIHRoaXMuc291cmNlUm9vdCkge1xuICAgICAgICAgIHNvdXJjZSA9IHV0aWwuam9pbih0aGlzLnNvdXJjZVJvb3QsIHNvdXJjZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgICBsaW5lOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnb3JpZ2luYWxMaW5lJywgbnVsbCksXG4gICAgICAgICAgY29sdW1uOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnb3JpZ2luYWxDb2x1bW4nLCBudWxsKSxcbiAgICAgICAgICBuYW1lOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnbmFtZScsIG51bGwpXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNvdXJjZTogbnVsbCxcbiAgICAgICAgbGluZTogbnVsbCxcbiAgICAgICAgY29sdW1uOiBudWxsLFxuICAgICAgICBuYW1lOiBudWxsXG4gICAgICB9O1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG9yaWdpbmFsIHNvdXJjZSBjb250ZW50LiBUaGUgb25seSBhcmd1bWVudCBpcyB0aGUgdXJsIG9mIHRoZVxuICAgKiBvcmlnaW5hbCBzb3VyY2UgZmlsZS4gUmV0dXJucyBudWxsIGlmIG5vIG9yaWdpbmFsIHNvdXJjZSBjb250ZW50IGlzXG4gICAqIGF2YWlsaWJsZS5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5zb3VyY2VDb250ZW50Rm9yID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcl9zb3VyY2VDb250ZW50Rm9yKGFTb3VyY2UpIHtcbiAgICAgIGlmICghdGhpcy5zb3VyY2VzQ29udGVudCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuc291cmNlUm9vdCkge1xuICAgICAgICBhU291cmNlID0gdXRpbC5yZWxhdGl2ZSh0aGlzLnNvdXJjZVJvb3QsIGFTb3VyY2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fc291cmNlcy5oYXMoYVNvdXJjZSkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKGFTb3VyY2UpXTtcbiAgICAgIH1cblxuICAgICAgdmFyIHVybDtcbiAgICAgIGlmICh0aGlzLnNvdXJjZVJvb3RcbiAgICAgICAgICAmJiAodXJsID0gdXRpbC51cmxQYXJzZSh0aGlzLnNvdXJjZVJvb3QpKSkge1xuICAgICAgICAvLyBYWFg6IGZpbGU6Ly8gVVJJcyBhbmQgYWJzb2x1dGUgcGF0aHMgbGVhZCB0byB1bmV4cGVjdGVkIGJlaGF2aW9yIGZvclxuICAgICAgICAvLyBtYW55IHVzZXJzLiBXZSBjYW4gaGVscCB0aGVtIG91dCB3aGVuIHRoZXkgZXhwZWN0IGZpbGU6Ly8gVVJJcyB0b1xuICAgICAgICAvLyBiZWhhdmUgbGlrZSBpdCB3b3VsZCBpZiB0aGV5IHdlcmUgcnVubmluZyBhIGxvY2FsIEhUVFAgc2VydmVyLiBTZWVcbiAgICAgICAgLy8gaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9ODg1NTk3LlxuICAgICAgICB2YXIgZmlsZVVyaUFic1BhdGggPSBhU291cmNlLnJlcGxhY2UoL15maWxlOlxcL1xcLy8sIFwiXCIpO1xuICAgICAgICBpZiAodXJsLnNjaGVtZSA9PSBcImZpbGVcIlxuICAgICAgICAgICAgJiYgdGhpcy5fc291cmNlcy5oYXMoZmlsZVVyaUFic1BhdGgpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKGZpbGVVcmlBYnNQYXRoKV1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgoIXVybC5wYXRoIHx8IHVybC5wYXRoID09IFwiL1wiKVxuICAgICAgICAgICAgJiYgdGhpcy5fc291cmNlcy5oYXMoXCIvXCIgKyBhU291cmNlKSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnNvdXJjZXNDb250ZW50W3RoaXMuX3NvdXJjZXMuaW5kZXhPZihcIi9cIiArIGFTb3VyY2UpXTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIGFTb3VyY2UgKyAnXCIgaXMgbm90IGluIHRoZSBTb3VyY2VNYXAuJyk7XG4gICAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgZ2VuZXJhdGVkIGxpbmUgYW5kIGNvbHVtbiBpbmZvcm1hdGlvbiBmb3IgdGhlIG9yaWdpbmFsIHNvdXJjZSxcbiAgICogbGluZSwgYW5kIGNvbHVtbiBwb3NpdGlvbnMgcHJvdmlkZWQuIFRoZSBvbmx5IGFyZ3VtZW50IGlzIGFuIG9iamVjdCB3aXRoXG4gICAqIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICpcbiAgICogICAtIHNvdXJjZTogVGhlIGZpbGVuYW1lIG9mIHRoZSBvcmlnaW5hbCBzb3VyY2UuXG4gICAqICAgLSBsaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZS5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIG9yaWdpbmFsIHNvdXJjZS5cbiAgICpcbiAgICogYW5kIGFuIG9iamVjdCBpcyByZXR1cm5lZCB3aXRoIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICpcbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZSwgb3IgbnVsbC5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UsIG9yIG51bGwuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuZ2VuZXJhdGVkUG9zaXRpb25Gb3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2dlbmVyYXRlZFBvc2l0aW9uRm9yKGFBcmdzKSB7XG4gICAgICB2YXIgbmVlZGxlID0ge1xuICAgICAgICBzb3VyY2U6IHV0aWwuZ2V0QXJnKGFBcmdzLCAnc291cmNlJyksXG4gICAgICAgIG9yaWdpbmFsTGluZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdsaW5lJyksXG4gICAgICAgIG9yaWdpbmFsQ29sdW1uOiB1dGlsLmdldEFyZyhhQXJncywgJ2NvbHVtbicpXG4gICAgICB9O1xuXG4gICAgICBpZiAodGhpcy5zb3VyY2VSb290KSB7XG4gICAgICAgIG5lZWRsZS5zb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHRoaXMuc291cmNlUm9vdCwgbmVlZGxlLnNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIHZhciBtYXBwaW5nID0gdGhpcy5fZmluZE1hcHBpbmcobmVlZGxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9vcmlnaW5hbE1hcHBpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm9yaWdpbmFsTGluZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm9yaWdpbmFsQ29sdW1uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuXG4gICAgICBpZiAobWFwcGluZykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGxpbmU6IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdnZW5lcmF0ZWRMaW5lJywgbnVsbCksXG4gICAgICAgICAgY29sdW1uOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnZ2VuZXJhdGVkQ29sdW1uJywgbnVsbClcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbGluZTogbnVsbCxcbiAgICAgICAgY29sdW1uOiBudWxsXG4gICAgICB9O1xuICAgIH07XG5cbiAgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSID0gMTtcbiAgU291cmNlTWFwQ29uc3VtZXIuT1JJR0lOQUxfT1JERVIgPSAyO1xuXG4gIC8qKlxuICAgKiBJdGVyYXRlIG92ZXIgZWFjaCBtYXBwaW5nIGJldHdlZW4gYW4gb3JpZ2luYWwgc291cmNlL2xpbmUvY29sdW1uIGFuZCBhXG4gICAqIGdlbmVyYXRlZCBsaW5lL2NvbHVtbiBpbiB0aGlzIHNvdXJjZSBtYXAuXG4gICAqXG4gICAqIEBwYXJhbSBGdW5jdGlvbiBhQ2FsbGJhY2tcbiAgICogICAgICAgIFRoZSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCB3aXRoIGVhY2ggbWFwcGluZy5cbiAgICogQHBhcmFtIE9iamVjdCBhQ29udGV4dFxuICAgKiAgICAgICAgT3B0aW9uYWwuIElmIHNwZWNpZmllZCwgdGhpcyBvYmplY3Qgd2lsbCBiZSB0aGUgdmFsdWUgb2YgYHRoaXNgIGV2ZXJ5XG4gICAqICAgICAgICB0aW1lIHRoYXQgYGFDYWxsYmFja2AgaXMgY2FsbGVkLlxuICAgKiBAcGFyYW0gYU9yZGVyXG4gICAqICAgICAgICBFaXRoZXIgYFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUmAgb3JcbiAgICogICAgICAgIGBTb3VyY2VNYXBDb25zdW1lci5PUklHSU5BTF9PUkRFUmAuIFNwZWNpZmllcyB3aGV0aGVyIHlvdSB3YW50IHRvXG4gICAqICAgICAgICBpdGVyYXRlIG92ZXIgdGhlIG1hcHBpbmdzIHNvcnRlZCBieSB0aGUgZ2VuZXJhdGVkIGZpbGUncyBsaW5lL2NvbHVtblxuICAgKiAgICAgICAgb3JkZXIgb3IgdGhlIG9yaWdpbmFsJ3Mgc291cmNlL2xpbmUvY29sdW1uIG9yZGVyLCByZXNwZWN0aXZlbHkuIERlZmF1bHRzIHRvXG4gICAqICAgICAgICBgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSYC5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5lYWNoTWFwcGluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfZWFjaE1hcHBpbmcoYUNhbGxiYWNrLCBhQ29udGV4dCwgYU9yZGVyKSB7XG4gICAgICB2YXIgY29udGV4dCA9IGFDb250ZXh0IHx8IG51bGw7XG4gICAgICB2YXIgb3JkZXIgPSBhT3JkZXIgfHwgU291cmNlTWFwQ29uc3VtZXIuR0VORVJBVEVEX09SREVSO1xuXG4gICAgICB2YXIgbWFwcGluZ3M7XG4gICAgICBzd2l0Y2ggKG9yZGVyKSB7XG4gICAgICBjYXNlIFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUjpcbiAgICAgICAgbWFwcGluZ3MgPSB0aGlzLl9nZW5lcmF0ZWRNYXBwaW5ncztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFNvdXJjZU1hcENvbnN1bWVyLk9SSUdJTkFMX09SREVSOlxuICAgICAgICBtYXBwaW5ncyA9IHRoaXMuX29yaWdpbmFsTWFwcGluZ3M7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biBvcmRlciBvZiBpdGVyYXRpb24uXCIpO1xuICAgICAgfVxuXG4gICAgICB2YXIgc291cmNlUm9vdCA9IHRoaXMuc291cmNlUm9vdDtcbiAgICAgIG1hcHBpbmdzLm1hcChmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICB2YXIgc291cmNlID0gbWFwcGluZy5zb3VyY2U7XG4gICAgICAgIGlmIChzb3VyY2UgJiYgc291cmNlUm9vdCkge1xuICAgICAgICAgIHNvdXJjZSA9IHV0aWwuam9pbihzb3VyY2VSb290LCBzb3VyY2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc291cmNlOiBzb3VyY2UsXG4gICAgICAgICAgZ2VuZXJhdGVkTGluZTogbWFwcGluZy5nZW5lcmF0ZWRMaW5lLFxuICAgICAgICAgIGdlbmVyYXRlZENvbHVtbjogbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4sXG4gICAgICAgICAgb3JpZ2luYWxMaW5lOiBtYXBwaW5nLm9yaWdpbmFsTGluZSxcbiAgICAgICAgICBvcmlnaW5hbENvbHVtbjogbWFwcGluZy5vcmlnaW5hbENvbHVtbixcbiAgICAgICAgICBuYW1lOiBtYXBwaW5nLm5hbWVcbiAgICAgICAgfTtcbiAgICAgIH0pLmZvckVhY2goYUNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICB9O1xuXG4gIGV4cG9ydHMuU291cmNlTWFwQ29uc3VtZXIgPSBTb3VyY2VNYXBDb25zdW1lcjtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciBiYXNlNjRWTFEgPSByZXF1aXJlKCcuL2Jhc2U2NC12bHEnKTtcbiAgdmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcbiAgdmFyIEFycmF5U2V0ID0gcmVxdWlyZSgnLi9hcnJheS1zZXQnKS5BcnJheVNldDtcblxuICAvKipcbiAgICogQW4gaW5zdGFuY2Ugb2YgdGhlIFNvdXJjZU1hcEdlbmVyYXRvciByZXByZXNlbnRzIGEgc291cmNlIG1hcCB3aGljaCBpc1xuICAgKiBiZWluZyBidWlsdCBpbmNyZW1lbnRhbGx5LiBZb3UgbWF5IHBhc3MgYW4gb2JqZWN0IHdpdGggdGhlIGZvbGxvd2luZ1xuICAgKiBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gZmlsZTogVGhlIGZpbGVuYW1lIG9mIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKiAgIC0gc291cmNlUm9vdDogQSByb290IGZvciBhbGwgcmVsYXRpdmUgVVJMcyBpbiB0aGlzIHNvdXJjZSBtYXAuXG4gICAqL1xuICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3IoYUFyZ3MpIHtcbiAgICBpZiAoIWFBcmdzKSB7XG4gICAgICBhQXJncyA9IHt9O1xuICAgIH1cbiAgICB0aGlzLl9maWxlID0gdXRpbC5nZXRBcmcoYUFyZ3MsICdmaWxlJywgbnVsbCk7XG4gICAgdGhpcy5fc291cmNlUm9vdCA9IHV0aWwuZ2V0QXJnKGFBcmdzLCAnc291cmNlUm9vdCcsIG51bGwpO1xuICAgIHRoaXMuX3NvdXJjZXMgPSBuZXcgQXJyYXlTZXQoKTtcbiAgICB0aGlzLl9uYW1lcyA9IG5ldyBBcnJheVNldCgpO1xuICAgIHRoaXMuX21hcHBpbmdzID0gW107XG4gICAgdGhpcy5fc291cmNlc0NvbnRlbnRzID0gbnVsbDtcbiAgfVxuXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX3ZlcnNpb24gPSAzO1xuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFNvdXJjZU1hcEdlbmVyYXRvciBiYXNlZCBvbiBhIFNvdXJjZU1hcENvbnN1bWVyXG4gICAqXG4gICAqIEBwYXJhbSBhU291cmNlTWFwQ29uc3VtZXIgVGhlIFNvdXJjZU1hcC5cbiAgICovXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5mcm9tU291cmNlTWFwID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfZnJvbVNvdXJjZU1hcChhU291cmNlTWFwQ29uc3VtZXIpIHtcbiAgICAgIHZhciBzb3VyY2VSb290ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZVJvb3Q7XG4gICAgICB2YXIgZ2VuZXJhdG9yID0gbmV3IFNvdXJjZU1hcEdlbmVyYXRvcih7XG4gICAgICAgIGZpbGU6IGFTb3VyY2VNYXBDb25zdW1lci5maWxlLFxuICAgICAgICBzb3VyY2VSb290OiBzb3VyY2VSb290XG4gICAgICB9KTtcbiAgICAgIGFTb3VyY2VNYXBDb25zdW1lci5lYWNoTWFwcGluZyhmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICB2YXIgbmV3TWFwcGluZyA9IHtcbiAgICAgICAgICBnZW5lcmF0ZWQ6IHtcbiAgICAgICAgICAgIGxpbmU6IG1hcHBpbmcuZ2VuZXJhdGVkTGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW5cbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKG1hcHBpbmcuc291cmNlKSB7XG4gICAgICAgICAgbmV3TWFwcGluZy5zb3VyY2UgPSBtYXBwaW5nLnNvdXJjZTtcbiAgICAgICAgICBpZiAoc291cmNlUm9vdCkge1xuICAgICAgICAgICAgbmV3TWFwcGluZy5zb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHNvdXJjZVJvb3QsIG5ld01hcHBpbmcuc291cmNlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBuZXdNYXBwaW5nLm9yaWdpbmFsID0ge1xuICAgICAgICAgICAgbGluZTogbWFwcGluZy5vcmlnaW5hbExpbmUsXG4gICAgICAgICAgICBjb2x1bW46IG1hcHBpbmcub3JpZ2luYWxDb2x1bW5cbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgaWYgKG1hcHBpbmcubmFtZSkge1xuICAgICAgICAgICAgbmV3TWFwcGluZy5uYW1lID0gbWFwcGluZy5uYW1lO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGdlbmVyYXRvci5hZGRNYXBwaW5nKG5ld01hcHBpbmcpO1xuICAgICAgfSk7XG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2VGaWxlKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZUNvbnRlbnRGb3Ioc291cmNlRmlsZSk7XG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgZ2VuZXJhdG9yLnNldFNvdXJjZUNvbnRlbnQoc291cmNlRmlsZSwgY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGdlbmVyYXRvcjtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgYSBzaW5nbGUgbWFwcGluZyBmcm9tIG9yaWdpbmFsIHNvdXJjZSBsaW5lIGFuZCBjb2x1bW4gdG8gdGhlIGdlbmVyYXRlZFxuICAgKiBzb3VyY2UncyBsaW5lIGFuZCBjb2x1bW4gZm9yIHRoaXMgc291cmNlIG1hcCBiZWluZyBjcmVhdGVkLiBUaGUgbWFwcGluZ1xuICAgKiBvYmplY3Qgc2hvdWxkIGhhdmUgdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gZ2VuZXJhdGVkOiBBbiBvYmplY3Qgd2l0aCB0aGUgZ2VuZXJhdGVkIGxpbmUgYW5kIGNvbHVtbiBwb3NpdGlvbnMuXG4gICAqICAgLSBvcmlnaW5hbDogQW4gb2JqZWN0IHdpdGggdGhlIG9yaWdpbmFsIGxpbmUgYW5kIGNvbHVtbiBwb3NpdGlvbnMuXG4gICAqICAgLSBzb3VyY2U6IFRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZSAocmVsYXRpdmUgdG8gdGhlIHNvdXJjZVJvb3QpLlxuICAgKiAgIC0gbmFtZTogQW4gb3B0aW9uYWwgb3JpZ2luYWwgdG9rZW4gbmFtZSBmb3IgdGhpcyBtYXBwaW5nLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5hZGRNYXBwaW5nID1cbiAgICBmdW5jdGlvbiBTb3VyY2VNYXBHZW5lcmF0b3JfYWRkTWFwcGluZyhhQXJncykge1xuICAgICAgdmFyIGdlbmVyYXRlZCA9IHV0aWwuZ2V0QXJnKGFBcmdzLCAnZ2VuZXJhdGVkJyk7XG4gICAgICB2YXIgb3JpZ2luYWwgPSB1dGlsLmdldEFyZyhhQXJncywgJ29yaWdpbmFsJywgbnVsbCk7XG4gICAgICB2YXIgc291cmNlID0gdXRpbC5nZXRBcmcoYUFyZ3MsICdzb3VyY2UnLCBudWxsKTtcbiAgICAgIHZhciBuYW1lID0gdXRpbC5nZXRBcmcoYUFyZ3MsICduYW1lJywgbnVsbCk7XG5cbiAgICAgIHRoaXMuX3ZhbGlkYXRlTWFwcGluZyhnZW5lcmF0ZWQsIG9yaWdpbmFsLCBzb3VyY2UsIG5hbWUpO1xuXG4gICAgICBpZiAoc291cmNlICYmICF0aGlzLl9zb3VyY2VzLmhhcyhzb3VyY2UpKSB7XG4gICAgICAgIHRoaXMuX3NvdXJjZXMuYWRkKHNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChuYW1lICYmICF0aGlzLl9uYW1lcy5oYXMobmFtZSkpIHtcbiAgICAgICAgdGhpcy5fbmFtZXMuYWRkKG5hbWUpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLl9tYXBwaW5ncy5wdXNoKHtcbiAgICAgICAgZ2VuZXJhdGVkTGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgIGdlbmVyYXRlZENvbHVtbjogZ2VuZXJhdGVkLmNvbHVtbixcbiAgICAgICAgb3JpZ2luYWxMaW5lOiBvcmlnaW5hbCAhPSBudWxsICYmIG9yaWdpbmFsLmxpbmUsXG4gICAgICAgIG9yaWdpbmFsQ29sdW1uOiBvcmlnaW5hbCAhPSBudWxsICYmIG9yaWdpbmFsLmNvbHVtbixcbiAgICAgICAgc291cmNlOiBzb3VyY2UsXG4gICAgICAgIG5hbWU6IG5hbWVcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgc291cmNlIGNvbnRlbnQgZm9yIGEgc291cmNlIGZpbGUuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLnNldFNvdXJjZUNvbnRlbnQgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl9zZXRTb3VyY2VDb250ZW50KGFTb3VyY2VGaWxlLCBhU291cmNlQ29udGVudCkge1xuICAgICAgdmFyIHNvdXJjZSA9IGFTb3VyY2VGaWxlO1xuICAgICAgaWYgKHRoaXMuX3NvdXJjZVJvb3QpIHtcbiAgICAgICAgc291cmNlID0gdXRpbC5yZWxhdGl2ZSh0aGlzLl9zb3VyY2VSb290LCBzb3VyY2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYVNvdXJjZUNvbnRlbnQgIT09IG51bGwpIHtcbiAgICAgICAgLy8gQWRkIHRoZSBzb3VyY2UgY29udGVudCB0byB0aGUgX3NvdXJjZXNDb250ZW50cyBtYXAuXG4gICAgICAgIC8vIENyZWF0ZSBhIG5ldyBfc291cmNlc0NvbnRlbnRzIG1hcCBpZiB0aGUgcHJvcGVydHkgaXMgbnVsbC5cbiAgICAgICAgaWYgKCF0aGlzLl9zb3VyY2VzQ29udGVudHMpIHtcbiAgICAgICAgICB0aGlzLl9zb3VyY2VzQ29udGVudHMgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zb3VyY2VzQ29udGVudHNbdXRpbC50b1NldFN0cmluZyhzb3VyY2UpXSA9IGFTb3VyY2VDb250ZW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBzb3VyY2UgZmlsZSBmcm9tIHRoZSBfc291cmNlc0NvbnRlbnRzIG1hcC5cbiAgICAgICAgLy8gSWYgdGhlIF9zb3VyY2VzQ29udGVudHMgbWFwIGlzIGVtcHR5LCBzZXQgdGhlIHByb3BlcnR5IHRvIG51bGwuXG4gICAgICAgIGRlbGV0ZSB0aGlzLl9zb3VyY2VzQ29udGVudHNbdXRpbC50b1NldFN0cmluZyhzb3VyY2UpXTtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuX3NvdXJjZXNDb250ZW50cykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5fc291cmNlc0NvbnRlbnRzID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgLyoqXG4gICAqIEFwcGxpZXMgdGhlIG1hcHBpbmdzIG9mIGEgc3ViLXNvdXJjZS1tYXAgZm9yIGEgc3BlY2lmaWMgc291cmNlIGZpbGUgdG8gdGhlXG4gICAqIHNvdXJjZSBtYXAgYmVpbmcgZ2VuZXJhdGVkLiBFYWNoIG1hcHBpbmcgdG8gdGhlIHN1cHBsaWVkIHNvdXJjZSBmaWxlIGlzXG4gICAqIHJld3JpdHRlbiB1c2luZyB0aGUgc3VwcGxpZWQgc291cmNlIG1hcC4gTm90ZTogVGhlIHJlc29sdXRpb24gZm9yIHRoZVxuICAgKiByZXN1bHRpbmcgbWFwcGluZ3MgaXMgdGhlIG1pbmltaXVtIG9mIHRoaXMgbWFwIGFuZCB0aGUgc3VwcGxpZWQgbWFwLlxuICAgKlxuICAgKiBAcGFyYW0gYVNvdXJjZU1hcENvbnN1bWVyIFRoZSBzb3VyY2UgbWFwIHRvIGJlIGFwcGxpZWQuXG4gICAqIEBwYXJhbSBhU291cmNlRmlsZSBPcHRpb25hbC4gVGhlIGZpbGVuYW1lIG9mIHRoZSBzb3VyY2UgZmlsZS5cbiAgICogICAgICAgIElmIG9taXR0ZWQsIFNvdXJjZU1hcENvbnN1bWVyJ3MgZmlsZSBwcm9wZXJ0eSB3aWxsIGJlIHVzZWQuXG4gICAqIEBwYXJhbSBhU291cmNlTWFwUGF0aCBPcHRpb25hbC4gVGhlIGRpcm5hbWUgb2YgdGhlIHBhdGggdG8gdGhlIHNvdXJjZSBtYXBcbiAgICogICAgICAgIHRvIGJlIGFwcGxpZWQuIElmIHJlbGF0aXZlLCBpdCBpcyByZWxhdGl2ZSB0byB0aGUgU291cmNlTWFwQ29uc3VtZXIuXG4gICAqICAgICAgICBUaGlzIHBhcmFtZXRlciBpcyBuZWVkZWQgd2hlbiB0aGUgdHdvIHNvdXJjZSBtYXBzIGFyZW4ndCBpbiB0aGUgc2FtZVxuICAgKiAgICAgICAgZGlyZWN0b3J5LCBhbmQgdGhlIHNvdXJjZSBtYXAgdG8gYmUgYXBwbGllZCBjb250YWlucyByZWxhdGl2ZSBzb3VyY2VcbiAgICogICAgICAgIHBhdGhzLiBJZiBzbywgdGhvc2UgcmVsYXRpdmUgc291cmNlIHBhdGhzIG5lZWQgdG8gYmUgcmV3cml0dGVuXG4gICAqICAgICAgICByZWxhdGl2ZSB0byB0aGUgU291cmNlTWFwR2VuZXJhdG9yLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5hcHBseVNvdXJjZU1hcCA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX2FwcGx5U291cmNlTWFwKGFTb3VyY2VNYXBDb25zdW1lciwgYVNvdXJjZUZpbGUsIGFTb3VyY2VNYXBQYXRoKSB7XG4gICAgICAvLyBJZiBhU291cmNlRmlsZSBpcyBvbWl0dGVkLCB3ZSB3aWxsIHVzZSB0aGUgZmlsZSBwcm9wZXJ0eSBvZiB0aGUgU291cmNlTWFwXG4gICAgICBpZiAoIWFTb3VyY2VGaWxlKSB7XG4gICAgICAgIGlmICghYVNvdXJjZU1hcENvbnN1bWVyLmZpbGUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS5hcHBseVNvdXJjZU1hcCByZXF1aXJlcyBlaXRoZXIgYW4gZXhwbGljaXQgc291cmNlIGZpbGUsICcgK1xuICAgICAgICAgICAgJ29yIHRoZSBzb3VyY2UgbWFwXFwncyBcImZpbGVcIiBwcm9wZXJ0eS4gQm90aCB3ZXJlIG9taXR0ZWQuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYVNvdXJjZUZpbGUgPSBhU291cmNlTWFwQ29uc3VtZXIuZmlsZTtcbiAgICAgIH1cbiAgICAgIHZhciBzb3VyY2VSb290ID0gdGhpcy5fc291cmNlUm9vdDtcbiAgICAgIC8vIE1ha2UgXCJhU291cmNlRmlsZVwiIHJlbGF0aXZlIGlmIGFuIGFic29sdXRlIFVybCBpcyBwYXNzZWQuXG4gICAgICBpZiAoc291cmNlUm9vdCkge1xuICAgICAgICBhU291cmNlRmlsZSA9IHV0aWwucmVsYXRpdmUoc291cmNlUm9vdCwgYVNvdXJjZUZpbGUpO1xuICAgICAgfVxuICAgICAgLy8gQXBwbHlpbmcgdGhlIFNvdXJjZU1hcCBjYW4gYWRkIGFuZCByZW1vdmUgaXRlbXMgZnJvbSB0aGUgc291cmNlcyBhbmRcbiAgICAgIC8vIHRoZSBuYW1lcyBhcnJheS5cbiAgICAgIHZhciBuZXdTb3VyY2VzID0gbmV3IEFycmF5U2V0KCk7XG4gICAgICB2YXIgbmV3TmFtZXMgPSBuZXcgQXJyYXlTZXQoKTtcblxuICAgICAgLy8gRmluZCBtYXBwaW5ncyBmb3IgdGhlIFwiYVNvdXJjZUZpbGVcIlxuICAgICAgdGhpcy5fbWFwcGluZ3MuZm9yRWFjaChmdW5jdGlvbiAobWFwcGluZykge1xuICAgICAgICBpZiAobWFwcGluZy5zb3VyY2UgPT09IGFTb3VyY2VGaWxlICYmIG1hcHBpbmcub3JpZ2luYWxMaW5lKSB7XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgaXQgY2FuIGJlIG1hcHBlZCBieSB0aGUgc291cmNlIG1hcCwgdGhlbiB1cGRhdGUgdGhlIG1hcHBpbmcuXG4gICAgICAgICAgdmFyIG9yaWdpbmFsID0gYVNvdXJjZU1hcENvbnN1bWVyLm9yaWdpbmFsUG9zaXRpb25Gb3Ioe1xuICAgICAgICAgICAgbGluZTogbWFwcGluZy5vcmlnaW5hbExpbmUsXG4gICAgICAgICAgICBjb2x1bW46IG1hcHBpbmcub3JpZ2luYWxDb2x1bW5cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAob3JpZ2luYWwuc291cmNlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBDb3B5IG1hcHBpbmdcbiAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gb3JpZ2luYWwuc291cmNlO1xuICAgICAgICAgICAgaWYgKGFTb3VyY2VNYXBQYXRoKSB7XG4gICAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gdXRpbC5qb2luKGFTb3VyY2VNYXBQYXRoLCBtYXBwaW5nLnNvdXJjZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzb3VyY2VSb290KSB7XG4gICAgICAgICAgICAgIG1hcHBpbmcuc291cmNlID0gdXRpbC5yZWxhdGl2ZShzb3VyY2VSb290LCBtYXBwaW5nLnNvdXJjZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsTGluZSA9IG9yaWdpbmFsLmxpbmU7XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uID0gb3JpZ2luYWwuY29sdW1uO1xuICAgICAgICAgICAgaWYgKG9yaWdpbmFsLm5hbWUgIT09IG51bGwgJiYgbWFwcGluZy5uYW1lICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoZSBpZGVudGlmaWVyIG5hbWUgaWYgaXQncyBhbiBpZGVudGlmaWVyXG4gICAgICAgICAgICAgIC8vIGluIGJvdGggU291cmNlTWFwc1xuICAgICAgICAgICAgICBtYXBwaW5nLm5hbWUgPSBvcmlnaW5hbC5uYW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzb3VyY2UgPSBtYXBwaW5nLnNvdXJjZTtcbiAgICAgICAgaWYgKHNvdXJjZSAmJiAhbmV3U291cmNlcy5oYXMoc291cmNlKSkge1xuICAgICAgICAgIG5ld1NvdXJjZXMuYWRkKHNvdXJjZSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbmFtZSA9IG1hcHBpbmcubmFtZTtcbiAgICAgICAgaWYgKG5hbWUgJiYgIW5ld05hbWVzLmhhcyhuYW1lKSkge1xuICAgICAgICAgIG5ld05hbWVzLmFkZChuYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICB9LCB0aGlzKTtcbiAgICAgIHRoaXMuX3NvdXJjZXMgPSBuZXdTb3VyY2VzO1xuICAgICAgdGhpcy5fbmFtZXMgPSBuZXdOYW1lcztcblxuICAgICAgLy8gQ29weSBzb3VyY2VzQ29udGVudHMgb2YgYXBwbGllZCBtYXAuXG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2VGaWxlKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZUNvbnRlbnRGb3Ioc291cmNlRmlsZSk7XG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgaWYgKHNvdXJjZVJvb3QpIHtcbiAgICAgICAgICAgIHNvdXJjZUZpbGUgPSB1dGlsLnJlbGF0aXZlKHNvdXJjZVJvb3QsIHNvdXJjZUZpbGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnNldFNvdXJjZUNvbnRlbnQoc291cmNlRmlsZSwgY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0sIHRoaXMpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIEEgbWFwcGluZyBjYW4gaGF2ZSBvbmUgb2YgdGhlIHRocmVlIGxldmVscyBvZiBkYXRhOlxuICAgKlxuICAgKiAgIDEuIEp1c3QgdGhlIGdlbmVyYXRlZCBwb3NpdGlvbi5cbiAgICogICAyLiBUaGUgR2VuZXJhdGVkIHBvc2l0aW9uLCBvcmlnaW5hbCBwb3NpdGlvbiwgYW5kIG9yaWdpbmFsIHNvdXJjZS5cbiAgICogICAzLiBHZW5lcmF0ZWQgYW5kIG9yaWdpbmFsIHBvc2l0aW9uLCBvcmlnaW5hbCBzb3VyY2UsIGFzIHdlbGwgYXMgYSBuYW1lXG4gICAqICAgICAgdG9rZW4uXG4gICAqXG4gICAqIFRvIG1haW50YWluIGNvbnNpc3RlbmN5LCB3ZSB2YWxpZGF0ZSB0aGF0IGFueSBuZXcgbWFwcGluZyBiZWluZyBhZGRlZCBmYWxsc1xuICAgKiBpbiB0byBvbmUgb2YgdGhlc2UgY2F0ZWdvcmllcy5cbiAgICovXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX3ZhbGlkYXRlTWFwcGluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3ZhbGlkYXRlTWFwcGluZyhhR2VuZXJhdGVkLCBhT3JpZ2luYWwsIGFTb3VyY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhTmFtZSkge1xuICAgICAgaWYgKGFHZW5lcmF0ZWQgJiYgJ2xpbmUnIGluIGFHZW5lcmF0ZWQgJiYgJ2NvbHVtbicgaW4gYUdlbmVyYXRlZFxuICAgICAgICAgICYmIGFHZW5lcmF0ZWQubGluZSA+IDAgJiYgYUdlbmVyYXRlZC5jb2x1bW4gPj0gMFxuICAgICAgICAgICYmICFhT3JpZ2luYWwgJiYgIWFTb3VyY2UgJiYgIWFOYW1lKSB7XG4gICAgICAgIC8vIENhc2UgMS5cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZWxzZSBpZiAoYUdlbmVyYXRlZCAmJiAnbGluZScgaW4gYUdlbmVyYXRlZCAmJiAnY29sdW1uJyBpbiBhR2VuZXJhdGVkXG4gICAgICAgICAgICAgICAmJiBhT3JpZ2luYWwgJiYgJ2xpbmUnIGluIGFPcmlnaW5hbCAmJiAnY29sdW1uJyBpbiBhT3JpZ2luYWxcbiAgICAgICAgICAgICAgICYmIGFHZW5lcmF0ZWQubGluZSA+IDAgJiYgYUdlbmVyYXRlZC5jb2x1bW4gPj0gMFxuICAgICAgICAgICAgICAgJiYgYU9yaWdpbmFsLmxpbmUgPiAwICYmIGFPcmlnaW5hbC5jb2x1bW4gPj0gMFxuICAgICAgICAgICAgICAgJiYgYVNvdXJjZSkge1xuICAgICAgICAvLyBDYXNlcyAyIGFuZCAzLlxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG1hcHBpbmc6ICcgKyBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZ2VuZXJhdGVkOiBhR2VuZXJhdGVkLFxuICAgICAgICAgIHNvdXJjZTogYVNvdXJjZSxcbiAgICAgICAgICBvcmlnaW5hbDogYU9yaWdpbmFsLFxuICAgICAgICAgIG5hbWU6IGFOYW1lXG4gICAgICAgIH0pKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIC8qKlxuICAgKiBTZXJpYWxpemUgdGhlIGFjY3VtdWxhdGVkIG1hcHBpbmdzIGluIHRvIHRoZSBzdHJlYW0gb2YgYmFzZSA2NCBWTFFzXG4gICAqIHNwZWNpZmllZCBieSB0aGUgc291cmNlIG1hcCBmb3JtYXQuXG4gICAqL1xuICBTb3VyY2VNYXBHZW5lcmF0b3IucHJvdG90eXBlLl9zZXJpYWxpemVNYXBwaW5ncyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3NlcmlhbGl6ZU1hcHBpbmdzKCkge1xuICAgICAgdmFyIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgIHZhciBwcmV2aW91c0dlbmVyYXRlZExpbmUgPSAxO1xuICAgICAgdmFyIHByZXZpb3VzT3JpZ2luYWxDb2x1bW4gPSAwO1xuICAgICAgdmFyIHByZXZpb3VzT3JpZ2luYWxMaW5lID0gMDtcbiAgICAgIHZhciBwcmV2aW91c05hbWUgPSAwO1xuICAgICAgdmFyIHByZXZpb3VzU291cmNlID0gMDtcbiAgICAgIHZhciByZXN1bHQgPSAnJztcbiAgICAgIHZhciBtYXBwaW5nO1xuXG4gICAgICAvLyBUaGUgbWFwcGluZ3MgbXVzdCBiZSBndWFyYW50ZWVkIHRvIGJlIGluIHNvcnRlZCBvcmRlciBiZWZvcmUgd2Ugc3RhcnRcbiAgICAgIC8vIHNlcmlhbGl6aW5nIHRoZW0gb3IgZWxzZSB0aGUgZ2VuZXJhdGVkIGxpbmUgbnVtYmVycyAod2hpY2ggYXJlIGRlZmluZWRcbiAgICAgIC8vIHZpYSB0aGUgJzsnIHNlcGFyYXRvcnMpIHdpbGwgYmUgYWxsIG1lc3NlZCB1cC4gTm90ZTogaXQgbWlnaHQgYmUgbW9yZVxuICAgICAgLy8gcGVyZm9ybWFudCB0byBtYWludGFpbiB0aGUgc29ydGluZyBhcyB3ZSBpbnNlcnQgdGhlbSwgcmF0aGVyIHRoYW4gYXMgd2VcbiAgICAgIC8vIHNlcmlhbGl6ZSB0aGVtLCBidXQgdGhlIGJpZyBPIGlzIHRoZSBzYW1lIGVpdGhlciB3YXkuXG4gICAgICB0aGlzLl9tYXBwaW5ncy5zb3J0KHV0aWwuY29tcGFyZUJ5R2VuZXJhdGVkUG9zaXRpb25zKTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHRoaXMuX21hcHBpbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIG1hcHBpbmcgPSB0aGlzLl9tYXBwaW5nc1tpXTtcblxuICAgICAgICBpZiAobWFwcGluZy5nZW5lcmF0ZWRMaW5lICE9PSBwcmV2aW91c0dlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiA9IDA7XG4gICAgICAgICAgd2hpbGUgKG1hcHBpbmcuZ2VuZXJhdGVkTGluZSAhPT0gcHJldmlvdXNHZW5lcmF0ZWRMaW5lKSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gJzsnO1xuICAgICAgICAgICAgcHJldmlvdXNHZW5lcmF0ZWRMaW5lKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgaWYgKCF1dGlsLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyhtYXBwaW5nLCB0aGlzLl9tYXBwaW5nc1tpIC0gMV0pKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0ICs9ICcsJztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZShtYXBwaW5nLmdlbmVyYXRlZENvbHVtblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uKTtcbiAgICAgICAgcHJldmlvdXNHZW5lcmF0ZWRDb2x1bW4gPSBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbjtcblxuICAgICAgICBpZiAobWFwcGluZy5zb3VyY2UpIHtcbiAgICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZSh0aGlzLl9zb3VyY2VzLmluZGV4T2YobWFwcGluZy5zb3VyY2UpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSBwcmV2aW91c1NvdXJjZSk7XG4gICAgICAgICAgcHJldmlvdXNTb3VyY2UgPSB0aGlzLl9zb3VyY2VzLmluZGV4T2YobWFwcGluZy5zb3VyY2UpO1xuXG4gICAgICAgICAgLy8gbGluZXMgYXJlIHN0b3JlZCAwLWJhc2VkIGluIFNvdXJjZU1hcCBzcGVjIHZlcnNpb24gM1xuICAgICAgICAgIHJlc3VsdCArPSBiYXNlNjRWTFEuZW5jb2RlKG1hcHBpbmcub3JpZ2luYWxMaW5lIC0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNPcmlnaW5hbExpbmUpO1xuICAgICAgICAgIHByZXZpb3VzT3JpZ2luYWxMaW5lID0gbWFwcGluZy5vcmlnaW5hbExpbmUgLSAxO1xuXG4gICAgICAgICAgcmVzdWx0ICs9IGJhc2U2NFZMUS5lbmNvZGUobWFwcGluZy5vcmlnaW5hbENvbHVtblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNPcmlnaW5hbENvbHVtbik7XG4gICAgICAgICAgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IG1hcHBpbmcub3JpZ2luYWxDb2x1bW47XG5cbiAgICAgICAgICBpZiAobWFwcGluZy5uYW1lKSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gYmFzZTY0VkxRLmVuY29kZSh0aGlzLl9uYW1lcy5pbmRleE9mKG1hcHBpbmcubmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gcHJldmlvdXNOYW1lKTtcbiAgICAgICAgICAgIHByZXZpb3VzTmFtZSA9IHRoaXMuX25hbWVzLmluZGV4T2YobWFwcGluZy5uYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuXG4gIFNvdXJjZU1hcEdlbmVyYXRvci5wcm90b3R5cGUuX2dlbmVyYXRlU291cmNlc0NvbnRlbnQgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl9nZW5lcmF0ZVNvdXJjZXNDb250ZW50KGFTb3VyY2VzLCBhU291cmNlUm9vdCkge1xuICAgICAgcmV0dXJuIGFTb3VyY2VzLm1hcChmdW5jdGlvbiAoc291cmNlKSB7XG4gICAgICAgIGlmICghdGhpcy5fc291cmNlc0NvbnRlbnRzKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFTb3VyY2VSb290KSB7XG4gICAgICAgICAgc291cmNlID0gdXRpbC5yZWxhdGl2ZShhU291cmNlUm9vdCwgc291cmNlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5ID0gdXRpbC50b1NldFN0cmluZyhzb3VyY2UpO1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuX3NvdXJjZXNDb250ZW50cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXkpXG4gICAgICAgICAgPyB0aGlzLl9zb3VyY2VzQ29udGVudHNba2V5XVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIEV4dGVybmFsaXplIHRoZSBzb3VyY2UgbWFwLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS50b0pTT04gPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcEdlbmVyYXRvcl90b0pTT04oKSB7XG4gICAgICB2YXIgbWFwID0ge1xuICAgICAgICB2ZXJzaW9uOiB0aGlzLl92ZXJzaW9uLFxuICAgICAgICBmaWxlOiB0aGlzLl9maWxlLFxuICAgICAgICBzb3VyY2VzOiB0aGlzLl9zb3VyY2VzLnRvQXJyYXkoKSxcbiAgICAgICAgbmFtZXM6IHRoaXMuX25hbWVzLnRvQXJyYXkoKSxcbiAgICAgICAgbWFwcGluZ3M6IHRoaXMuX3NlcmlhbGl6ZU1hcHBpbmdzKClcbiAgICAgIH07XG4gICAgICBpZiAodGhpcy5fc291cmNlUm9vdCkge1xuICAgICAgICBtYXAuc291cmNlUm9vdCA9IHRoaXMuX3NvdXJjZVJvb3Q7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fc291cmNlc0NvbnRlbnRzKSB7XG4gICAgICAgIG1hcC5zb3VyY2VzQ29udGVudCA9IHRoaXMuX2dlbmVyYXRlU291cmNlc0NvbnRlbnQobWFwLnNvdXJjZXMsIG1hcC5zb3VyY2VSb290KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcDtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBSZW5kZXIgdGhlIHNvdXJjZSBtYXAgYmVpbmcgZ2VuZXJhdGVkIHRvIGEgc3RyaW5nLlxuICAgKi9cbiAgU291cmNlTWFwR2VuZXJhdG9yLnByb3RvdHlwZS50b1N0cmluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwR2VuZXJhdG9yX3RvU3RyaW5nKCkge1xuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMpO1xuICAgIH07XG5cbiAgZXhwb3J0cy5Tb3VyY2VNYXBHZW5lcmF0b3IgPSBTb3VyY2VNYXBHZW5lcmF0b3I7XG5cbn0pO1xuIiwiLyogLSotIE1vZGU6IGpzOyBqcy1pbmRlbnQtbGV2ZWw6IDI7IC0qLSAqL1xuLypcbiAqIENvcHlyaWdodCAyMDExIE1vemlsbGEgRm91bmRhdGlvbiBhbmQgY29udHJpYnV0b3JzXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTmV3IEJTRCBsaWNlbnNlLiBTZWUgTElDRU5TRSBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuaWYgKHR5cGVvZiBkZWZpbmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgZGVmaW5lID0gcmVxdWlyZSgnYW1kZWZpbmUnKShtb2R1bGUsIHJlcXVpcmUpO1xufVxuZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblxuICB2YXIgU291cmNlTWFwR2VuZXJhdG9yID0gcmVxdWlyZSgnLi9zb3VyY2UtbWFwLWdlbmVyYXRvcicpLlNvdXJjZU1hcEdlbmVyYXRvcjtcbiAgdmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwnKTtcblxuICAvKipcbiAgICogU291cmNlTm9kZXMgcHJvdmlkZSBhIHdheSB0byBhYnN0cmFjdCBvdmVyIGludGVycG9sYXRpbmcvY29uY2F0ZW5hdGluZ1xuICAgKiBzbmlwcGV0cyBvZiBnZW5lcmF0ZWQgSmF2YVNjcmlwdCBzb3VyY2UgY29kZSB3aGlsZSBtYWludGFpbmluZyB0aGUgbGluZSBhbmRcbiAgICogY29sdW1uIGluZm9ybWF0aW9uIGFzc29jaWF0ZWQgd2l0aCB0aGUgb3JpZ2luYWwgc291cmNlIGNvZGUuXG4gICAqXG4gICAqIEBwYXJhbSBhTGluZSBUaGUgb3JpZ2luYWwgbGluZSBudW1iZXIuXG4gICAqIEBwYXJhbSBhQ29sdW1uIFRoZSBvcmlnaW5hbCBjb2x1bW4gbnVtYmVyLlxuICAgKiBAcGFyYW0gYVNvdXJjZSBUaGUgb3JpZ2luYWwgc291cmNlJ3MgZmlsZW5hbWUuXG4gICAqIEBwYXJhbSBhQ2h1bmtzIE9wdGlvbmFsLiBBbiBhcnJheSBvZiBzdHJpbmdzIHdoaWNoIGFyZSBzbmlwcGV0cyBvZlxuICAgKiAgICAgICAgZ2VuZXJhdGVkIEpTLCBvciBvdGhlciBTb3VyY2VOb2Rlcy5cbiAgICogQHBhcmFtIGFOYW1lIFRoZSBvcmlnaW5hbCBpZGVudGlmaWVyLlxuICAgKi9cbiAgZnVuY3Rpb24gU291cmNlTm9kZShhTGluZSwgYUNvbHVtbiwgYVNvdXJjZSwgYUNodW5rcywgYU5hbWUpIHtcbiAgICB0aGlzLmNoaWxkcmVuID0gW107XG4gICAgdGhpcy5zb3VyY2VDb250ZW50cyA9IHt9O1xuICAgIHRoaXMubGluZSA9IGFMaW5lID09PSB1bmRlZmluZWQgPyBudWxsIDogYUxpbmU7XG4gICAgdGhpcy5jb2x1bW4gPSBhQ29sdW1uID09PSB1bmRlZmluZWQgPyBudWxsIDogYUNvbHVtbjtcbiAgICB0aGlzLnNvdXJjZSA9IGFTb3VyY2UgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhU291cmNlO1xuICAgIHRoaXMubmFtZSA9IGFOYW1lID09PSB1bmRlZmluZWQgPyBudWxsIDogYU5hbWU7XG4gICAgaWYgKGFDaHVua3MgIT0gbnVsbCkgdGhpcy5hZGQoYUNodW5rcyk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIFNvdXJjZU5vZGUgZnJvbSBnZW5lcmF0ZWQgY29kZSBhbmQgYSBTb3VyY2VNYXBDb25zdW1lci5cbiAgICpcbiAgICogQHBhcmFtIGFHZW5lcmF0ZWRDb2RlIFRoZSBnZW5lcmF0ZWQgY29kZVxuICAgKiBAcGFyYW0gYVNvdXJjZU1hcENvbnN1bWVyIFRoZSBTb3VyY2VNYXAgZm9yIHRoZSBnZW5lcmF0ZWQgY29kZVxuICAgKi9cbiAgU291cmNlTm9kZS5mcm9tU3RyaW5nV2l0aFNvdXJjZU1hcCA9XG4gICAgZnVuY3Rpb24gU291cmNlTm9kZV9mcm9tU3RyaW5nV2l0aFNvdXJjZU1hcChhR2VuZXJhdGVkQ29kZSwgYVNvdXJjZU1hcENvbnN1bWVyKSB7XG4gICAgICAvLyBUaGUgU291cmNlTm9kZSB3ZSB3YW50IHRvIGZpbGwgd2l0aCB0aGUgZ2VuZXJhdGVkIGNvZGVcbiAgICAgIC8vIGFuZCB0aGUgU291cmNlTWFwXG4gICAgICB2YXIgbm9kZSA9IG5ldyBTb3VyY2VOb2RlKCk7XG5cbiAgICAgIC8vIFRoZSBnZW5lcmF0ZWQgY29kZVxuICAgICAgLy8gUHJvY2Vzc2VkIGZyYWdtZW50cyBhcmUgcmVtb3ZlZCBmcm9tIHRoaXMgYXJyYXkuXG4gICAgICB2YXIgcmVtYWluaW5nTGluZXMgPSBhR2VuZXJhdGVkQ29kZS5zcGxpdCgnXFxuJyk7XG5cbiAgICAgIC8vIFdlIG5lZWQgdG8gcmVtZW1iZXIgdGhlIHBvc2l0aW9uIG9mIFwicmVtYWluaW5nTGluZXNcIlxuICAgICAgdmFyIGxhc3RHZW5lcmF0ZWRMaW5lID0gMSwgbGFzdEdlbmVyYXRlZENvbHVtbiA9IDA7XG5cbiAgICAgIC8vIFRoZSBnZW5lcmF0ZSBTb3VyY2VOb2RlcyB3ZSBuZWVkIGEgY29kZSByYW5nZS5cbiAgICAgIC8vIFRvIGV4dHJhY3QgaXQgY3VycmVudCBhbmQgbGFzdCBtYXBwaW5nIGlzIHVzZWQuXG4gICAgICAvLyBIZXJlIHdlIHN0b3JlIHRoZSBsYXN0IG1hcHBpbmcuXG4gICAgICB2YXIgbGFzdE1hcHBpbmcgPSBudWxsO1xuXG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuZWFjaE1hcHBpbmcoZnVuY3Rpb24gKG1hcHBpbmcpIHtcbiAgICAgICAgaWYgKGxhc3RNYXBwaW5nICE9PSBudWxsKSB7XG4gICAgICAgICAgLy8gV2UgYWRkIHRoZSBjb2RlIGZyb20gXCJsYXN0TWFwcGluZ1wiIHRvIFwibWFwcGluZ1wiOlxuICAgICAgICAgIC8vIEZpcnN0IGNoZWNrIGlmIHRoZXJlIGlzIGEgbmV3IGxpbmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICBpZiAobGFzdEdlbmVyYXRlZExpbmUgPCBtYXBwaW5nLmdlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBjb2RlID0gXCJcIjtcbiAgICAgICAgICAgIC8vIEFzc29jaWF0ZSBmaXJzdCBsaW5lIHdpdGggXCJsYXN0TWFwcGluZ1wiXG4gICAgICAgICAgICBhZGRNYXBwaW5nV2l0aENvZGUobGFzdE1hcHBpbmcsIHJlbWFpbmluZ0xpbmVzLnNoaWZ0KCkgKyBcIlxcblwiKTtcbiAgICAgICAgICAgIGxhc3RHZW5lcmF0ZWRMaW5lKys7XG4gICAgICAgICAgICBsYXN0R2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgICAgICAgIC8vIFRoZSByZW1haW5pbmcgY29kZSBpcyBhZGRlZCB3aXRob3V0IG1hcHBpbmdcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhlcmUgaXMgbm8gbmV3IGxpbmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICAgIC8vIEFzc29jaWF0ZSB0aGUgY29kZSBiZXR3ZWVuIFwibGFzdEdlbmVyYXRlZENvbHVtblwiIGFuZFxuICAgICAgICAgICAgLy8gXCJtYXBwaW5nLmdlbmVyYXRlZENvbHVtblwiIHdpdGggXCJsYXN0TWFwcGluZ1wiXG4gICAgICAgICAgICB2YXIgbmV4dExpbmUgPSByZW1haW5pbmdMaW5lc1swXTtcbiAgICAgICAgICAgIHZhciBjb2RlID0gbmV4dExpbmUuc3Vic3RyKDAsIG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uIC1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RHZW5lcmF0ZWRDb2x1bW4pO1xuICAgICAgICAgICAgcmVtYWluaW5nTGluZXNbMF0gPSBuZXh0TGluZS5zdWJzdHIobWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4gLVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdEdlbmVyYXRlZENvbHVtbik7XG4gICAgICAgICAgICBsYXN0R2VuZXJhdGVkQ29sdW1uID0gbWFwcGluZy5nZW5lcmF0ZWRDb2x1bW47XG4gICAgICAgICAgICBhZGRNYXBwaW5nV2l0aENvZGUobGFzdE1hcHBpbmcsIGNvZGUpO1xuICAgICAgICAgICAgLy8gTm8gbW9yZSByZW1haW5pbmcgY29kZSwgY29udGludWVcbiAgICAgICAgICAgIGxhc3RNYXBwaW5nID0gbWFwcGluZztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgYWRkIHRoZSBnZW5lcmF0ZWQgY29kZSB1bnRpbCB0aGUgZmlyc3QgbWFwcGluZ1xuICAgICAgICAvLyB0byB0aGUgU291cmNlTm9kZSB3aXRob3V0IGFueSBtYXBwaW5nLlxuICAgICAgICAvLyBFYWNoIGxpbmUgaXMgYWRkZWQgYXMgc2VwYXJhdGUgc3RyaW5nLlxuICAgICAgICB3aGlsZSAobGFzdEdlbmVyYXRlZExpbmUgPCBtYXBwaW5nLmdlbmVyYXRlZExpbmUpIHtcbiAgICAgICAgICBub2RlLmFkZChyZW1haW5pbmdMaW5lcy5zaGlmdCgpICsgXCJcXG5cIik7XG4gICAgICAgICAgbGFzdEdlbmVyYXRlZExpbmUrKztcbiAgICAgICAgfVxuICAgICAgICBpZiAobGFzdEdlbmVyYXRlZENvbHVtbiA8IG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uKSB7XG4gICAgICAgICAgdmFyIG5leHRMaW5lID0gcmVtYWluaW5nTGluZXNbMF07XG4gICAgICAgICAgbm9kZS5hZGQobmV4dExpbmUuc3Vic3RyKDAsIG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uKSk7XG4gICAgICAgICAgcmVtYWluaW5nTGluZXNbMF0gPSBuZXh0TGluZS5zdWJzdHIobWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4pO1xuICAgICAgICAgIGxhc3RHZW5lcmF0ZWRDb2x1bW4gPSBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbjtcbiAgICAgICAgfVxuICAgICAgICBsYXN0TWFwcGluZyA9IG1hcHBpbmc7XG4gICAgICB9LCB0aGlzKTtcbiAgICAgIC8vIFdlIGhhdmUgcHJvY2Vzc2VkIGFsbCBtYXBwaW5ncy5cbiAgICAgIGlmIChyZW1haW5pbmdMaW5lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChsYXN0TWFwcGluZykge1xuICAgICAgICAgIC8vIEFzc29jaWF0ZSB0aGUgcmVtYWluaW5nIGNvZGUgaW4gdGhlIGN1cnJlbnQgbGluZSB3aXRoIFwibGFzdE1hcHBpbmdcIlxuICAgICAgICAgIHZhciBsYXN0TGluZSA9IHJlbWFpbmluZ0xpbmVzLnNoaWZ0KCk7XG4gICAgICAgICAgaWYgKHJlbWFpbmluZ0xpbmVzLmxlbmd0aCA+IDApIGxhc3RMaW5lICs9IFwiXFxuXCI7XG4gICAgICAgICAgYWRkTWFwcGluZ1dpdGhDb2RlKGxhc3RNYXBwaW5nLCBsYXN0TGluZSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYW5kIGFkZCB0aGUgcmVtYWluaW5nIGxpbmVzIHdpdGhvdXQgYW55IG1hcHBpbmdcbiAgICAgICAgbm9kZS5hZGQocmVtYWluaW5nTGluZXMuam9pbihcIlxcblwiKSk7XG4gICAgICB9XG5cbiAgICAgIC8vIENvcHkgc291cmNlc0NvbnRlbnQgaW50byBTb3VyY2VOb2RlXG4gICAgICBhU291cmNlTWFwQ29uc3VtZXIuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2VGaWxlKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gYVNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZUNvbnRlbnRGb3Ioc291cmNlRmlsZSk7XG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgbm9kZS5zZXRTb3VyY2VDb250ZW50KHNvdXJjZUZpbGUsIGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIG5vZGU7XG5cbiAgICAgIGZ1bmN0aW9uIGFkZE1hcHBpbmdXaXRoQ29kZShtYXBwaW5nLCBjb2RlKSB7XG4gICAgICAgIGlmIChtYXBwaW5nID09PSBudWxsIHx8IG1hcHBpbmcuc291cmNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBub2RlLmFkZChjb2RlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBub2RlLmFkZChuZXcgU291cmNlTm9kZShtYXBwaW5nLm9yaWdpbmFsTGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcHBpbmcuc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwcGluZy5uYW1lKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gIC8qKlxuICAgKiBBZGQgYSBjaHVuayBvZiBnZW5lcmF0ZWQgSlMgdG8gdGhpcyBzb3VyY2Ugbm9kZS5cbiAgICpcbiAgICogQHBhcmFtIGFDaHVuayBBIHN0cmluZyBzbmlwcGV0IG9mIGdlbmVyYXRlZCBKUyBjb2RlLCBhbm90aGVyIGluc3RhbmNlIG9mXG4gICAqICAgICAgICBTb3VyY2VOb2RlLCBvciBhbiBhcnJheSB3aGVyZSBlYWNoIG1lbWJlciBpcyBvbmUgb2YgdGhvc2UgdGhpbmdzLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gU291cmNlTm9kZV9hZGQoYUNodW5rKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYUNodW5rKSkge1xuICAgICAgYUNodW5rLmZvckVhY2goZnVuY3Rpb24gKGNodW5rKSB7XG4gICAgICAgIHRoaXMuYWRkKGNodW5rKTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgICBlbHNlIGlmIChhQ2h1bmsgaW5zdGFuY2VvZiBTb3VyY2VOb2RlIHx8IHR5cGVvZiBhQ2h1bmsgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGlmIChhQ2h1bmspIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlbi5wdXNoKGFDaHVuayk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgXCJFeHBlY3RlZCBhIFNvdXJjZU5vZGUsIHN0cmluZywgb3IgYW4gYXJyYXkgb2YgU291cmNlTm9kZXMgYW5kIHN0cmluZ3MuIEdvdCBcIiArIGFDaHVua1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLyoqXG4gICAqIEFkZCBhIGNodW5rIG9mIGdlbmVyYXRlZCBKUyB0byB0aGUgYmVnaW5uaW5nIG9mIHRoaXMgc291cmNlIG5vZGUuXG4gICAqXG4gICAqIEBwYXJhbSBhQ2h1bmsgQSBzdHJpbmcgc25pcHBldCBvZiBnZW5lcmF0ZWQgSlMgY29kZSwgYW5vdGhlciBpbnN0YW5jZSBvZlxuICAgKiAgICAgICAgU291cmNlTm9kZSwgb3IgYW4gYXJyYXkgd2hlcmUgZWFjaCBtZW1iZXIgaXMgb25lIG9mIHRob3NlIHRoaW5ncy5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLnByZXBlbmQgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3ByZXBlbmQoYUNodW5rKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYUNodW5rKSkge1xuICAgICAgZm9yICh2YXIgaSA9IGFDaHVuay5sZW5ndGgtMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdGhpcy5wcmVwZW5kKGFDaHVua1tpXSk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKGFDaHVuayBpbnN0YW5jZW9mIFNvdXJjZU5vZGUgfHwgdHlwZW9mIGFDaHVuayA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgdGhpcy5jaGlsZHJlbi51bnNoaWZ0KGFDaHVuayk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgXCJFeHBlY3RlZCBhIFNvdXJjZU5vZGUsIHN0cmluZywgb3IgYW4gYXJyYXkgb2YgU291cmNlTm9kZXMgYW5kIHN0cmluZ3MuIEdvdCBcIiArIGFDaHVua1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLyoqXG4gICAqIFdhbGsgb3ZlciB0aGUgdHJlZSBvZiBKUyBzbmlwcGV0cyBpbiB0aGlzIG5vZGUgYW5kIGl0cyBjaGlsZHJlbi4gVGhlXG4gICAqIHdhbGtpbmcgZnVuY3Rpb24gaXMgY2FsbGVkIG9uY2UgZm9yIGVhY2ggc25pcHBldCBvZiBKUyBhbmQgaXMgcGFzc2VkIHRoYXRcbiAgICogc25pcHBldCBhbmQgdGhlIGl0cyBvcmlnaW5hbCBhc3NvY2lhdGVkIHNvdXJjZSdzIGxpbmUvY29sdW1uIGxvY2F0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0gYUZuIFRoZSB0cmF2ZXJzYWwgZnVuY3Rpb24uXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS53YWxrID0gZnVuY3Rpb24gU291cmNlTm9kZV93YWxrKGFGbikge1xuICAgIHZhciBjaHVuaztcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgY2h1bmsgPSB0aGlzLmNoaWxkcmVuW2ldO1xuICAgICAgaWYgKGNodW5rIGluc3RhbmNlb2YgU291cmNlTm9kZSkge1xuICAgICAgICBjaHVuay53YWxrKGFGbik7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgaWYgKGNodW5rICE9PSAnJykge1xuICAgICAgICAgIGFGbihjaHVuaywgeyBzb3VyY2U6IHRoaXMuc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5jb2x1bW4sXG4gICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMubmFtZSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICAvKipcbiAgICogTGlrZSBgU3RyaW5nLnByb3RvdHlwZS5qb2luYCBleGNlcHQgZm9yIFNvdXJjZU5vZGVzLiBJbnNlcnRzIGBhU3RyYCBiZXR3ZWVuXG4gICAqIGVhY2ggb2YgYHRoaXMuY2hpbGRyZW5gLlxuICAgKlxuICAgKiBAcGFyYW0gYVNlcCBUaGUgc2VwYXJhdG9yLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUuam9pbiA9IGZ1bmN0aW9uIFNvdXJjZU5vZGVfam9pbihhU2VwKSB7XG4gICAgdmFyIG5ld0NoaWxkcmVuO1xuICAgIHZhciBpO1xuICAgIHZhciBsZW4gPSB0aGlzLmNoaWxkcmVuLmxlbmd0aDtcbiAgICBpZiAobGVuID4gMCkge1xuICAgICAgbmV3Q2hpbGRyZW4gPSBbXTtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW4tMTsgaSsrKSB7XG4gICAgICAgIG5ld0NoaWxkcmVuLnB1c2godGhpcy5jaGlsZHJlbltpXSk7XG4gICAgICAgIG5ld0NoaWxkcmVuLnB1c2goYVNlcCk7XG4gICAgICB9XG4gICAgICBuZXdDaGlsZHJlbi5wdXNoKHRoaXMuY2hpbGRyZW5baV0pO1xuICAgICAgdGhpcy5jaGlsZHJlbiA9IG5ld0NoaWxkcmVuO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvKipcbiAgICogQ2FsbCBTdHJpbmcucHJvdG90eXBlLnJlcGxhY2Ugb24gdGhlIHZlcnkgcmlnaHQtbW9zdCBzb3VyY2Ugc25pcHBldC4gVXNlZnVsXG4gICAqIGZvciB0cmltbWluZyB3aGl0ZXNwYWNlIGZyb20gdGhlIGVuZCBvZiBhIHNvdXJjZSBub2RlLCBldGMuXG4gICAqXG4gICAqIEBwYXJhbSBhUGF0dGVybiBUaGUgcGF0dGVybiB0byByZXBsYWNlLlxuICAgKiBAcGFyYW0gYVJlcGxhY2VtZW50IFRoZSB0aGluZyB0byByZXBsYWNlIHRoZSBwYXR0ZXJuIHdpdGguXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS5yZXBsYWNlUmlnaHQgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3JlcGxhY2VSaWdodChhUGF0dGVybiwgYVJlcGxhY2VtZW50KSB7XG4gICAgdmFyIGxhc3RDaGlsZCA9IHRoaXMuY2hpbGRyZW5bdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxXTtcbiAgICBpZiAobGFzdENoaWxkIGluc3RhbmNlb2YgU291cmNlTm9kZSkge1xuICAgICAgbGFzdENoaWxkLnJlcGxhY2VSaWdodChhUGF0dGVybiwgYVJlcGxhY2VtZW50KTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIGxhc3RDaGlsZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRoaXMuY2hpbGRyZW5bdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxXSA9IGxhc3RDaGlsZC5yZXBsYWNlKGFQYXR0ZXJuLCBhUmVwbGFjZW1lbnQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRoaXMuY2hpbGRyZW4ucHVzaCgnJy5yZXBsYWNlKGFQYXR0ZXJuLCBhUmVwbGFjZW1lbnQpKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgc291cmNlIGNvbnRlbnQgZm9yIGEgc291cmNlIGZpbGUuIFRoaXMgd2lsbCBiZSBhZGRlZCB0byB0aGUgU291cmNlTWFwR2VuZXJhdG9yXG4gICAqIGluIHRoZSBzb3VyY2VzQ29udGVudCBmaWVsZC5cbiAgICpcbiAgICogQHBhcmFtIGFTb3VyY2VGaWxlIFRoZSBmaWxlbmFtZSBvZiB0aGUgc291cmNlIGZpbGVcbiAgICogQHBhcmFtIGFTb3VyY2VDb250ZW50IFRoZSBjb250ZW50IG9mIHRoZSBzb3VyY2UgZmlsZVxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUuc2V0U291cmNlQ29udGVudCA9XG4gICAgZnVuY3Rpb24gU291cmNlTm9kZV9zZXRTb3VyY2VDb250ZW50KGFTb3VyY2VGaWxlLCBhU291cmNlQ29udGVudCkge1xuICAgICAgdGhpcy5zb3VyY2VDb250ZW50c1t1dGlsLnRvU2V0U3RyaW5nKGFTb3VyY2VGaWxlKV0gPSBhU291cmNlQ29udGVudDtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBXYWxrIG92ZXIgdGhlIHRyZWUgb2YgU291cmNlTm9kZXMuIFRoZSB3YWxraW5nIGZ1bmN0aW9uIGlzIGNhbGxlZCBmb3IgZWFjaFxuICAgKiBzb3VyY2UgZmlsZSBjb250ZW50IGFuZCBpcyBwYXNzZWQgdGhlIGZpbGVuYW1lIGFuZCBzb3VyY2UgY29udGVudC5cbiAgICpcbiAgICogQHBhcmFtIGFGbiBUaGUgdHJhdmVyc2FsIGZ1bmN0aW9uLlxuICAgKi9cbiAgU291cmNlTm9kZS5wcm90b3R5cGUud2Fsa1NvdXJjZUNvbnRlbnRzID1cbiAgICBmdW5jdGlvbiBTb3VyY2VOb2RlX3dhbGtTb3VyY2VDb250ZW50cyhhRm4pIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmICh0aGlzLmNoaWxkcmVuW2ldIGluc3RhbmNlb2YgU291cmNlTm9kZSkge1xuICAgICAgICAgIHRoaXMuY2hpbGRyZW5baV0ud2Fsa1NvdXJjZUNvbnRlbnRzKGFGbik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIHNvdXJjZXMgPSBPYmplY3Qua2V5cyh0aGlzLnNvdXJjZUNvbnRlbnRzKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzb3VyY2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGFGbih1dGlsLmZyb21TZXRTdHJpbmcoc291cmNlc1tpXSksIHRoaXMuc291cmNlQ29udGVudHNbc291cmNlc1tpXV0pO1xuICAgICAgfVxuICAgIH07XG5cbiAgLyoqXG4gICAqIFJldHVybiB0aGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgc291cmNlIG5vZGUuIFdhbGtzIG92ZXIgdGhlIHRyZWVcbiAgICogYW5kIGNvbmNhdGVuYXRlcyBhbGwgdGhlIHZhcmlvdXMgc25pcHBldHMgdG9nZXRoZXIgdG8gb25lIHN0cmluZy5cbiAgICovXG4gIFNvdXJjZU5vZGUucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gU291cmNlTm9kZV90b1N0cmluZygpIHtcbiAgICB2YXIgc3RyID0gXCJcIjtcbiAgICB0aGlzLndhbGsoZnVuY3Rpb24gKGNodW5rKSB7XG4gICAgICBzdHIgKz0gY2h1bms7XG4gICAgfSk7XG4gICAgcmV0dXJuIHN0cjtcbiAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgc291cmNlIG5vZGUgYWxvbmcgd2l0aCBhIHNvdXJjZVxuICAgKiBtYXAuXG4gICAqL1xuICBTb3VyY2VOb2RlLnByb3RvdHlwZS50b1N0cmluZ1dpdGhTb3VyY2VNYXAgPSBmdW5jdGlvbiBTb3VyY2VOb2RlX3RvU3RyaW5nV2l0aFNvdXJjZU1hcChhQXJncykge1xuICAgIHZhciBnZW5lcmF0ZWQgPSB7XG4gICAgICBjb2RlOiBcIlwiLFxuICAgICAgbGluZTogMSxcbiAgICAgIGNvbHVtbjogMFxuICAgIH07XG4gICAgdmFyIG1hcCA9IG5ldyBTb3VyY2VNYXBHZW5lcmF0b3IoYUFyZ3MpO1xuICAgIHZhciBzb3VyY2VNYXBwaW5nQWN0aXZlID0gZmFsc2U7XG4gICAgdmFyIGxhc3RPcmlnaW5hbFNvdXJjZSA9IG51bGw7XG4gICAgdmFyIGxhc3RPcmlnaW5hbExpbmUgPSBudWxsO1xuICAgIHZhciBsYXN0T3JpZ2luYWxDb2x1bW4gPSBudWxsO1xuICAgIHZhciBsYXN0T3JpZ2luYWxOYW1lID0gbnVsbDtcbiAgICB0aGlzLndhbGsoZnVuY3Rpb24gKGNodW5rLCBvcmlnaW5hbCkge1xuICAgICAgZ2VuZXJhdGVkLmNvZGUgKz0gY2h1bms7XG4gICAgICBpZiAob3JpZ2luYWwuc291cmNlICE9PSBudWxsXG4gICAgICAgICAgJiYgb3JpZ2luYWwubGluZSAhPT0gbnVsbFxuICAgICAgICAgICYmIG9yaWdpbmFsLmNvbHVtbiAhPT0gbnVsbCkge1xuICAgICAgICBpZihsYXN0T3JpZ2luYWxTb3VyY2UgIT09IG9yaWdpbmFsLnNvdXJjZVxuICAgICAgICAgICB8fCBsYXN0T3JpZ2luYWxMaW5lICE9PSBvcmlnaW5hbC5saW5lXG4gICAgICAgICAgIHx8IGxhc3RPcmlnaW5hbENvbHVtbiAhPT0gb3JpZ2luYWwuY29sdW1uXG4gICAgICAgICAgIHx8IGxhc3RPcmlnaW5hbE5hbWUgIT09IG9yaWdpbmFsLm5hbWUpIHtcbiAgICAgICAgICBtYXAuYWRkTWFwcGluZyh7XG4gICAgICAgICAgICBzb3VyY2U6IG9yaWdpbmFsLnNvdXJjZSxcbiAgICAgICAgICAgIG9yaWdpbmFsOiB7XG4gICAgICAgICAgICAgIGxpbmU6IG9yaWdpbmFsLmxpbmUsXG4gICAgICAgICAgICAgIGNvbHVtbjogb3JpZ2luYWwuY29sdW1uXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2VuZXJhdGVkOiB7XG4gICAgICAgICAgICAgIGxpbmU6IGdlbmVyYXRlZC5saW5lLFxuICAgICAgICAgICAgICBjb2x1bW46IGdlbmVyYXRlZC5jb2x1bW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBuYW1lOiBvcmlnaW5hbC5uYW1lXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdE9yaWdpbmFsU291cmNlID0gb3JpZ2luYWwuc291cmNlO1xuICAgICAgICBsYXN0T3JpZ2luYWxMaW5lID0gb3JpZ2luYWwubGluZTtcbiAgICAgICAgbGFzdE9yaWdpbmFsQ29sdW1uID0gb3JpZ2luYWwuY29sdW1uO1xuICAgICAgICBsYXN0T3JpZ2luYWxOYW1lID0gb3JpZ2luYWwubmFtZTtcbiAgICAgICAgc291cmNlTWFwcGluZ0FjdGl2ZSA9IHRydWU7XG4gICAgICB9IGVsc2UgaWYgKHNvdXJjZU1hcHBpbmdBY3RpdmUpIHtcbiAgICAgICAgbWFwLmFkZE1hcHBpbmcoe1xuICAgICAgICAgIGdlbmVyYXRlZDoge1xuICAgICAgICAgICAgbGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgICAgICBjb2x1bW46IGdlbmVyYXRlZC5jb2x1bW5cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBsYXN0T3JpZ2luYWxTb3VyY2UgPSBudWxsO1xuICAgICAgICBzb3VyY2VNYXBwaW5nQWN0aXZlID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBjaHVuay5zcGxpdCgnJykuZm9yRWFjaChmdW5jdGlvbiAoY2gsIGlkeCwgYXJyYXkpIHtcbiAgICAgICAgaWYgKGNoID09PSAnXFxuJykge1xuICAgICAgICAgIGdlbmVyYXRlZC5saW5lKys7XG4gICAgICAgICAgZ2VuZXJhdGVkLmNvbHVtbiA9IDA7XG4gICAgICAgICAgLy8gTWFwcGluZ3MgZW5kIGF0IGVvbFxuICAgICAgICAgIGlmIChpZHggKyAxID09PSBhcnJheS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxhc3RPcmlnaW5hbFNvdXJjZSA9IG51bGw7XG4gICAgICAgICAgICBzb3VyY2VNYXBwaW5nQWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgfSBlbHNlIGlmIChzb3VyY2VNYXBwaW5nQWN0aXZlKSB7XG4gICAgICAgICAgICBtYXAuYWRkTWFwcGluZyh7XG4gICAgICAgICAgICAgIHNvdXJjZTogb3JpZ2luYWwuc291cmNlLFxuICAgICAgICAgICAgICBvcmlnaW5hbDoge1xuICAgICAgICAgICAgICAgIGxpbmU6IG9yaWdpbmFsLmxpbmUsXG4gICAgICAgICAgICAgICAgY29sdW1uOiBvcmlnaW5hbC5jb2x1bW5cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgZ2VuZXJhdGVkOiB7XG4gICAgICAgICAgICAgICAgbGluZTogZ2VuZXJhdGVkLmxpbmUsXG4gICAgICAgICAgICAgICAgY29sdW1uOiBnZW5lcmF0ZWQuY29sdW1uXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIG5hbWU6IG9yaWdpbmFsLm5hbWVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBnZW5lcmF0ZWQuY29sdW1uKys7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHRoaXMud2Fsa1NvdXJjZUNvbnRlbnRzKGZ1bmN0aW9uIChzb3VyY2VGaWxlLCBzb3VyY2VDb250ZW50KSB7XG4gICAgICBtYXAuc2V0U291cmNlQ29udGVudChzb3VyY2VGaWxlLCBzb3VyY2VDb250ZW50KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB7IGNvZGU6IGdlbmVyYXRlZC5jb2RlLCBtYXA6IG1hcCB9O1xuICB9O1xuXG4gIGV4cG9ydHMuU291cmNlTm9kZSA9IFNvdXJjZU5vZGU7XG5cbn0pO1xuIiwiLyogLSotIE1vZGU6IGpzOyBqcy1pbmRlbnQtbGV2ZWw6IDI7IC0qLSAqL1xuLypcbiAqIENvcHlyaWdodCAyMDExIE1vemlsbGEgRm91bmRhdGlvbiBhbmQgY29udHJpYnV0b3JzXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTmV3IEJTRCBsaWNlbnNlLiBTZWUgTElDRU5TRSBvcjpcbiAqIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9CU0QtMy1DbGF1c2VcbiAqL1xuaWYgKHR5cGVvZiBkZWZpbmUgIT09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgZGVmaW5lID0gcmVxdWlyZSgnYW1kZWZpbmUnKShtb2R1bGUsIHJlcXVpcmUpO1xufVxuZGVmaW5lKGZ1bmN0aW9uIChyZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUpIHtcblxuICAvKipcbiAgICogVGhpcyBpcyBhIGhlbHBlciBmdW5jdGlvbiBmb3IgZ2V0dGluZyB2YWx1ZXMgZnJvbSBwYXJhbWV0ZXIvb3B0aW9uc1xuICAgKiBvYmplY3RzLlxuICAgKlxuICAgKiBAcGFyYW0gYXJncyBUaGUgb2JqZWN0IHdlIGFyZSBleHRyYWN0aW5nIHZhbHVlcyBmcm9tXG4gICAqIEBwYXJhbSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBwcm9wZXJ0eSB3ZSBhcmUgZ2V0dGluZy5cbiAgICogQHBhcmFtIGRlZmF1bHRWYWx1ZSBBbiBvcHRpb25hbCB2YWx1ZSB0byByZXR1cm4gaWYgdGhlIHByb3BlcnR5IGlzIG1pc3NpbmdcbiAgICogZnJvbSB0aGUgb2JqZWN0LiBJZiB0aGlzIGlzIG5vdCBzcGVjaWZpZWQgYW5kIHRoZSBwcm9wZXJ0eSBpcyBtaXNzaW5nLCBhblxuICAgKiBlcnJvciB3aWxsIGJlIHRocm93bi5cbiAgICovXG4gIGZ1bmN0aW9uIGdldEFyZyhhQXJncywgYU5hbWUsIGFEZWZhdWx0VmFsdWUpIHtcbiAgICBpZiAoYU5hbWUgaW4gYUFyZ3MpIHtcbiAgICAgIHJldHVybiBhQXJnc1thTmFtZV07XG4gICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzKSB7XG4gICAgICByZXR1cm4gYURlZmF1bHRWYWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdcIicgKyBhTmFtZSArICdcIiBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50LicpO1xuICAgIH1cbiAgfVxuICBleHBvcnRzLmdldEFyZyA9IGdldEFyZztcblxuICB2YXIgdXJsUmVnZXhwID0gL14oPzooW1xcdytcXC0uXSspOik/XFwvXFwvKD86KFxcdys6XFx3KylAKT8oW1xcdy5dKikoPzo6KFxcZCspKT8oXFxTKikkLztcbiAgdmFyIGRhdGFVcmxSZWdleHAgPSAvXmRhdGE6LitcXCwuKyQvO1xuXG4gIGZ1bmN0aW9uIHVybFBhcnNlKGFVcmwpIHtcbiAgICB2YXIgbWF0Y2ggPSBhVXJsLm1hdGNoKHVybFJlZ2V4cCk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBzY2hlbWU6IG1hdGNoWzFdLFxuICAgICAgYXV0aDogbWF0Y2hbMl0sXG4gICAgICBob3N0OiBtYXRjaFszXSxcbiAgICAgIHBvcnQ6IG1hdGNoWzRdLFxuICAgICAgcGF0aDogbWF0Y2hbNV1cbiAgICB9O1xuICB9XG4gIGV4cG9ydHMudXJsUGFyc2UgPSB1cmxQYXJzZTtcblxuICBmdW5jdGlvbiB1cmxHZW5lcmF0ZShhUGFyc2VkVXJsKSB7XG4gICAgdmFyIHVybCA9ICcnO1xuICAgIGlmIChhUGFyc2VkVXJsLnNjaGVtZSkge1xuICAgICAgdXJsICs9IGFQYXJzZWRVcmwuc2NoZW1lICsgJzonO1xuICAgIH1cbiAgICB1cmwgKz0gJy8vJztcbiAgICBpZiAoYVBhcnNlZFVybC5hdXRoKSB7XG4gICAgICB1cmwgKz0gYVBhcnNlZFVybC5hdXRoICsgJ0AnO1xuICAgIH1cbiAgICBpZiAoYVBhcnNlZFVybC5ob3N0KSB7XG4gICAgICB1cmwgKz0gYVBhcnNlZFVybC5ob3N0O1xuICAgIH1cbiAgICBpZiAoYVBhcnNlZFVybC5wb3J0KSB7XG4gICAgICB1cmwgKz0gXCI6XCIgKyBhUGFyc2VkVXJsLnBvcnRcbiAgICB9XG4gICAgaWYgKGFQYXJzZWRVcmwucGF0aCkge1xuICAgICAgdXJsICs9IGFQYXJzZWRVcmwucGF0aDtcbiAgICB9XG4gICAgcmV0dXJuIHVybDtcbiAgfVxuICBleHBvcnRzLnVybEdlbmVyYXRlID0gdXJsR2VuZXJhdGU7XG5cbiAgLyoqXG4gICAqIE5vcm1hbGl6ZXMgYSBwYXRoLCBvciB0aGUgcGF0aCBwb3J0aW9uIG9mIGEgVVJMOlxuICAgKlxuICAgKiAtIFJlcGxhY2VzIGNvbnNlcXV0aXZlIHNsYXNoZXMgd2l0aCBvbmUgc2xhc2guXG4gICAqIC0gUmVtb3ZlcyB1bm5lY2Vzc2FyeSAnLicgcGFydHMuXG4gICAqIC0gUmVtb3ZlcyB1bm5lY2Vzc2FyeSAnPGRpcj4vLi4nIHBhcnRzLlxuICAgKlxuICAgKiBCYXNlZCBvbiBjb2RlIGluIHRoZSBOb2RlLmpzICdwYXRoJyBjb3JlIG1vZHVsZS5cbiAgICpcbiAgICogQHBhcmFtIGFQYXRoIFRoZSBwYXRoIG9yIHVybCB0byBub3JtYWxpemUuXG4gICAqL1xuICBmdW5jdGlvbiBub3JtYWxpemUoYVBhdGgpIHtcbiAgICB2YXIgcGF0aCA9IGFQYXRoO1xuICAgIHZhciB1cmwgPSB1cmxQYXJzZShhUGF0aCk7XG4gICAgaWYgKHVybCkge1xuICAgICAgaWYgKCF1cmwucGF0aCkge1xuICAgICAgICByZXR1cm4gYVBhdGg7XG4gICAgICB9XG4gICAgICBwYXRoID0gdXJsLnBhdGg7XG4gICAgfVxuICAgIHZhciBpc0Fic29sdXRlID0gKHBhdGguY2hhckF0KDApID09PSAnLycpO1xuXG4gICAgdmFyIHBhcnRzID0gcGF0aC5zcGxpdCgvXFwvKy8pO1xuICAgIGZvciAodmFyIHBhcnQsIHVwID0gMCwgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBwYXJ0ID0gcGFydHNbaV07XG4gICAgICBpZiAocGFydCA9PT0gJy4nKSB7XG4gICAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIH0gZWxzZSBpZiAocGFydCA9PT0gJy4uJykge1xuICAgICAgICB1cCsrO1xuICAgICAgfSBlbHNlIGlmICh1cCA+IDApIHtcbiAgICAgICAgaWYgKHBhcnQgPT09ICcnKSB7XG4gICAgICAgICAgLy8gVGhlIGZpcnN0IHBhcnQgaXMgYmxhbmsgaWYgdGhlIHBhdGggaXMgYWJzb2x1dGUuIFRyeWluZyB0byBnb1xuICAgICAgICAgIC8vIGFib3ZlIHRoZSByb290IGlzIGEgbm8tb3AuIFRoZXJlZm9yZSB3ZSBjYW4gcmVtb3ZlIGFsbCAnLi4nIHBhcnRzXG4gICAgICAgICAgLy8gZGlyZWN0bHkgYWZ0ZXIgdGhlIHJvb3QuXG4gICAgICAgICAgcGFydHMuc3BsaWNlKGkgKyAxLCB1cCk7XG4gICAgICAgICAgdXAgPSAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBhcnRzLnNwbGljZShpLCAyKTtcbiAgICAgICAgICB1cC0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHBhdGggPSBwYXJ0cy5qb2luKCcvJyk7XG5cbiAgICBpZiAocGF0aCA9PT0gJycpIHtcbiAgICAgIHBhdGggPSBpc0Fic29sdXRlID8gJy8nIDogJy4nO1xuICAgIH1cblxuICAgIGlmICh1cmwpIHtcbiAgICAgIHVybC5wYXRoID0gcGF0aDtcbiAgICAgIHJldHVybiB1cmxHZW5lcmF0ZSh1cmwpO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuICBleHBvcnRzLm5vcm1hbGl6ZSA9IG5vcm1hbGl6ZTtcblxuICAvKipcbiAgICogSm9pbnMgdHdvIHBhdGhzL1VSTHMuXG4gICAqXG4gICAqIEBwYXJhbSBhUm9vdCBUaGUgcm9vdCBwYXRoIG9yIFVSTC5cbiAgICogQHBhcmFtIGFQYXRoIFRoZSBwYXRoIG9yIFVSTCB0byBiZSBqb2luZWQgd2l0aCB0aGUgcm9vdC5cbiAgICpcbiAgICogLSBJZiBhUGF0aCBpcyBhIFVSTCBvciBhIGRhdGEgVVJJLCBhUGF0aCBpcyByZXR1cm5lZCwgdW5sZXNzIGFQYXRoIGlzIGFcbiAgICogICBzY2hlbWUtcmVsYXRpdmUgVVJMOiBUaGVuIHRoZSBzY2hlbWUgb2YgYVJvb3QsIGlmIGFueSwgaXMgcHJlcGVuZGVkXG4gICAqICAgZmlyc3QuXG4gICAqIC0gT3RoZXJ3aXNlIGFQYXRoIGlzIGEgcGF0aC4gSWYgYVJvb3QgaXMgYSBVUkwsIHRoZW4gaXRzIHBhdGggcG9ydGlvblxuICAgKiAgIGlzIHVwZGF0ZWQgd2l0aCB0aGUgcmVzdWx0IGFuZCBhUm9vdCBpcyByZXR1cm5lZC4gT3RoZXJ3aXNlIHRoZSByZXN1bHRcbiAgICogICBpcyByZXR1cm5lZC5cbiAgICogICAtIElmIGFQYXRoIGlzIGFic29sdXRlLCB0aGUgcmVzdWx0IGlzIGFQYXRoLlxuICAgKiAgIC0gT3RoZXJ3aXNlIHRoZSB0d28gcGF0aHMgYXJlIGpvaW5lZCB3aXRoIGEgc2xhc2guXG4gICAqIC0gSm9pbmluZyBmb3IgZXhhbXBsZSAnaHR0cDovLycgYW5kICd3d3cuZXhhbXBsZS5jb20nIGlzIGFsc28gc3VwcG9ydGVkLlxuICAgKi9cbiAgZnVuY3Rpb24gam9pbihhUm9vdCwgYVBhdGgpIHtcbiAgICB2YXIgYVBhdGhVcmwgPSB1cmxQYXJzZShhUGF0aCk7XG4gICAgdmFyIGFSb290VXJsID0gdXJsUGFyc2UoYVJvb3QpO1xuICAgIGlmIChhUm9vdFVybCkge1xuICAgICAgYVJvb3QgPSBhUm9vdFVybC5wYXRoIHx8ICcvJztcbiAgICB9XG5cbiAgICAvLyBgam9pbihmb28sICcvL3d3dy5leGFtcGxlLm9yZycpYFxuICAgIGlmIChhUGF0aFVybCAmJiAhYVBhdGhVcmwuc2NoZW1lKSB7XG4gICAgICBpZiAoYVJvb3RVcmwpIHtcbiAgICAgICAgYVBhdGhVcmwuc2NoZW1lID0gYVJvb3RVcmwuc2NoZW1lO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKGFQYXRoVXJsKTtcbiAgICB9XG5cbiAgICBpZiAoYVBhdGhVcmwgfHwgYVBhdGgubWF0Y2goZGF0YVVybFJlZ2V4cCkpIHtcbiAgICAgIHJldHVybiBhUGF0aDtcbiAgICB9XG5cbiAgICAvLyBgam9pbignaHR0cDovLycsICd3d3cuZXhhbXBsZS5jb20nKWBcbiAgICBpZiAoYVJvb3RVcmwgJiYgIWFSb290VXJsLmhvc3QgJiYgIWFSb290VXJsLnBhdGgpIHtcbiAgICAgIGFSb290VXJsLmhvc3QgPSBhUGF0aDtcbiAgICAgIHJldHVybiB1cmxHZW5lcmF0ZShhUm9vdFVybCk7XG4gICAgfVxuXG4gICAgdmFyIGpvaW5lZCA9IGFQYXRoLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICA/IGFQYXRoXG4gICAgICA6IG5vcm1hbGl6ZShhUm9vdC5yZXBsYWNlKC9cXC8rJC8sICcnKSArICcvJyArIGFQYXRoKTtcblxuICAgIGlmIChhUm9vdFVybCkge1xuICAgICAgYVJvb3RVcmwucGF0aCA9IGpvaW5lZDtcbiAgICAgIHJldHVybiB1cmxHZW5lcmF0ZShhUm9vdFVybCk7XG4gICAgfVxuICAgIHJldHVybiBqb2luZWQ7XG4gIH1cbiAgZXhwb3J0cy5qb2luID0gam9pbjtcblxuICAvKipcbiAgICogQmVjYXVzZSBiZWhhdmlvciBnb2VzIHdhY2t5IHdoZW4geW91IHNldCBgX19wcm90b19fYCBvbiBvYmplY3RzLCB3ZVxuICAgKiBoYXZlIHRvIHByZWZpeCBhbGwgdGhlIHN0cmluZ3MgaW4gb3VyIHNldCB3aXRoIGFuIGFyYml0cmFyeSBjaGFyYWN0ZXIuXG4gICAqXG4gICAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9zb3VyY2UtbWFwL3B1bGwvMzEgYW5kXG4gICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL3NvdXJjZS1tYXAvaXNzdWVzLzMwXG4gICAqXG4gICAqIEBwYXJhbSBTdHJpbmcgYVN0clxuICAgKi9cbiAgZnVuY3Rpb24gdG9TZXRTdHJpbmcoYVN0cikge1xuICAgIHJldHVybiAnJCcgKyBhU3RyO1xuICB9XG4gIGV4cG9ydHMudG9TZXRTdHJpbmcgPSB0b1NldFN0cmluZztcblxuICBmdW5jdGlvbiBmcm9tU2V0U3RyaW5nKGFTdHIpIHtcbiAgICByZXR1cm4gYVN0ci5zdWJzdHIoMSk7XG4gIH1cbiAgZXhwb3J0cy5mcm9tU2V0U3RyaW5nID0gZnJvbVNldFN0cmluZztcblxuICBmdW5jdGlvbiByZWxhdGl2ZShhUm9vdCwgYVBhdGgpIHtcbiAgICBhUm9vdCA9IGFSb290LnJlcGxhY2UoL1xcLyQvLCAnJyk7XG5cbiAgICB2YXIgdXJsID0gdXJsUGFyc2UoYVJvb3QpO1xuICAgIGlmIChhUGF0aC5jaGFyQXQoMCkgPT0gXCIvXCIgJiYgdXJsICYmIHVybC5wYXRoID09IFwiL1wiKSB7XG4gICAgICByZXR1cm4gYVBhdGguc2xpY2UoMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFQYXRoLmluZGV4T2YoYVJvb3QgKyAnLycpID09PSAwXG4gICAgICA/IGFQYXRoLnN1YnN0cihhUm9vdC5sZW5ndGggKyAxKVxuICAgICAgOiBhUGF0aDtcbiAgfVxuICBleHBvcnRzLnJlbGF0aXZlID0gcmVsYXRpdmU7XG5cbiAgZnVuY3Rpb24gc3RyY21wKGFTdHIxLCBhU3RyMikge1xuICAgIHZhciBzMSA9IGFTdHIxIHx8IFwiXCI7XG4gICAgdmFyIHMyID0gYVN0cjIgfHwgXCJcIjtcbiAgICByZXR1cm4gKHMxID4gczIpIC0gKHMxIDwgczIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbXBhcmF0b3IgYmV0d2VlbiB0d28gbWFwcGluZ3Mgd2hlcmUgdGhlIG9yaWdpbmFsIHBvc2l0aW9ucyBhcmUgY29tcGFyZWQuXG4gICAqXG4gICAqIE9wdGlvbmFsbHkgcGFzcyBpbiBgdHJ1ZWAgYXMgYG9ubHlDb21wYXJlR2VuZXJhdGVkYCB0byBjb25zaWRlciB0d29cbiAgICogbWFwcGluZ3Mgd2l0aCB0aGUgc2FtZSBvcmlnaW5hbCBzb3VyY2UvbGluZS9jb2x1bW4sIGJ1dCBkaWZmZXJlbnQgZ2VuZXJhdGVkXG4gICAqIGxpbmUgYW5kIGNvbHVtbiB0aGUgc2FtZS4gVXNlZnVsIHdoZW4gc2VhcmNoaW5nIGZvciBhIG1hcHBpbmcgd2l0aCBhXG4gICAqIHN0dWJiZWQgb3V0IG1hcHBpbmcuXG4gICAqL1xuICBmdW5jdGlvbiBjb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyhtYXBwaW5nQSwgbWFwcGluZ0IsIG9ubHlDb21wYXJlT3JpZ2luYWwpIHtcbiAgICB2YXIgY21wO1xuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLnNvdXJjZSwgbWFwcGluZ0Iuc291cmNlKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsTGluZSAtIG1hcHBpbmdCLm9yaWdpbmFsTGluZTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsQ29sdW1uIC0gbWFwcGluZ0Iub3JpZ2luYWxDb2x1bW47XG4gICAgaWYgKGNtcCB8fCBvbmx5Q29tcGFyZU9yaWdpbmFsKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IHN0cmNtcChtYXBwaW5nQS5uYW1lLCBtYXBwaW5nQi5uYW1lKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLmdlbmVyYXRlZExpbmUgLSBtYXBwaW5nQi5nZW5lcmF0ZWRMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hcHBpbmdBLmdlbmVyYXRlZENvbHVtbiAtIG1hcHBpbmdCLmdlbmVyYXRlZENvbHVtbjtcbiAgfTtcbiAgZXhwb3J0cy5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyA9IGNvbXBhcmVCeU9yaWdpbmFsUG9zaXRpb25zO1xuXG4gIC8qKlxuICAgKiBDb21wYXJhdG9yIGJldHdlZW4gdHdvIG1hcHBpbmdzIHdoZXJlIHRoZSBnZW5lcmF0ZWQgcG9zaXRpb25zIGFyZVxuICAgKiBjb21wYXJlZC5cbiAgICpcbiAgICogT3B0aW9uYWxseSBwYXNzIGluIGB0cnVlYCBhcyBgb25seUNvbXBhcmVHZW5lcmF0ZWRgIHRvIGNvbnNpZGVyIHR3b1xuICAgKiBtYXBwaW5ncyB3aXRoIHRoZSBzYW1lIGdlbmVyYXRlZCBsaW5lIGFuZCBjb2x1bW4sIGJ1dCBkaWZmZXJlbnRcbiAgICogc291cmNlL25hbWUvb3JpZ2luYWwgbGluZSBhbmQgY29sdW1uIHRoZSBzYW1lLiBVc2VmdWwgd2hlbiBzZWFyY2hpbmcgZm9yIGFcbiAgICogbWFwcGluZyB3aXRoIGEgc3R1YmJlZCBvdXQgbWFwcGluZy5cbiAgICovXG4gIGZ1bmN0aW9uIGNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyhtYXBwaW5nQSwgbWFwcGluZ0IsIG9ubHlDb21wYXJlR2VuZXJhdGVkKSB7XG4gICAgdmFyIGNtcDtcblxuICAgIGNtcCA9IG1hcHBpbmdBLmdlbmVyYXRlZExpbmUgLSBtYXBwaW5nQi5nZW5lcmF0ZWRMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0EuZ2VuZXJhdGVkQ29sdW1uIC0gbWFwcGluZ0IuZ2VuZXJhdGVkQ29sdW1uO1xuICAgIGlmIChjbXAgfHwgb25seUNvbXBhcmVHZW5lcmF0ZWQpIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLnNvdXJjZSwgbWFwcGluZ0Iuc291cmNlKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsTGluZSAtIG1hcHBpbmdCLm9yaWdpbmFsTGluZTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsQ29sdW1uIC0gbWFwcGluZ0Iub3JpZ2luYWxDb2x1bW47XG4gICAgaWYgKGNtcCkge1xuICAgICAgcmV0dXJuIGNtcDtcbiAgICB9XG5cbiAgICByZXR1cm4gc3RyY21wKG1hcHBpbmdBLm5hbWUsIG1hcHBpbmdCLm5hbWUpO1xuICB9O1xuICBleHBvcnRzLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyA9IGNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucztcblxufSk7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3MsX19maWxlbmFtZSl7XG4vKiogdmltOiBldDp0cz00OnN3PTQ6c3RzPTRcbiAqIEBsaWNlbnNlIGFtZGVmaW5lIDAuMS4wIENvcHlyaWdodCAoYykgMjAxMSwgVGhlIERvam8gRm91bmRhdGlvbiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICogQXZhaWxhYmxlIHZpYSB0aGUgTUlUIG9yIG5ldyBCU0QgbGljZW5zZS5cbiAqIHNlZTogaHR0cDovL2dpdGh1Yi5jb20vanJidXJrZS9hbWRlZmluZSBmb3IgZGV0YWlsc1xuICovXG5cbi8qanNsaW50IG5vZGU6IHRydWUgKi9cbi8qZ2xvYmFsIG1vZHVsZSwgcHJvY2VzcyAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBkZWZpbmUgZm9yIG5vZGUuXG4gKiBAcGFyYW0ge09iamVjdH0gbW9kdWxlIHRoZSBcIm1vZHVsZVwiIG9iamVjdCB0aGF0IGlzIGRlZmluZWQgYnkgTm9kZSBmb3IgdGhlXG4gKiBjdXJyZW50IG1vZHVsZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtyZXF1aXJlRm5dLiBOb2RlJ3MgcmVxdWlyZSBmdW5jdGlvbiBmb3IgdGhlIGN1cnJlbnQgbW9kdWxlLlxuICogSXQgb25seSBuZWVkcyB0byBiZSBwYXNzZWQgaW4gTm9kZSB2ZXJzaW9ucyBiZWZvcmUgMC41LCB3aGVuIG1vZHVsZS5yZXF1aXJlXG4gKiBkaWQgbm90IGV4aXN0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBhIGRlZmluZSBmdW5jdGlvbiB0aGF0IGlzIHVzYWJsZSBmb3IgdGhlIGN1cnJlbnQgbm9kZVxuICogbW9kdWxlLlxuICovXG5mdW5jdGlvbiBhbWRlZmluZShtb2R1bGUsIHJlcXVpcmVGbikge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICB2YXIgZGVmaW5lQ2FjaGUgPSB7fSxcbiAgICAgICAgbG9hZGVyQ2FjaGUgPSB7fSxcbiAgICAgICAgYWxyZWFkeUNhbGxlZCA9IGZhbHNlLFxuICAgICAgICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICAgICAgICBtYWtlUmVxdWlyZSwgc3RyaW5nUmVxdWlyZTtcblxuICAgIC8qKlxuICAgICAqIFRyaW1zIHRoZSAuIGFuZCAuLiBmcm9tIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMuXG4gICAgICogSXQgd2lsbCBrZWVwIGEgbGVhZGluZyBwYXRoIHNlZ21lbnQgaWYgYSAuLiB3aWxsIGJlY29tZVxuICAgICAqIHRoZSBmaXJzdCBwYXRoIHNlZ21lbnQsIHRvIGhlbHAgd2l0aCBtb2R1bGUgbmFtZSBsb29rdXBzLFxuICAgICAqIHdoaWNoIGFjdCBsaWtlIHBhdGhzLCBidXQgY2FuIGJlIHJlbWFwcGVkLiBCdXQgdGhlIGVuZCByZXN1bHQsXG4gICAgICogYWxsIHBhdGhzIHRoYXQgdXNlIHRoaXMgZnVuY3Rpb24gc2hvdWxkIGxvb2sgbm9ybWFsaXplZC5cbiAgICAgKiBOT1RFOiB0aGlzIG1ldGhvZCBNT0RJRklFUyB0aGUgaW5wdXQgYXJyYXkuXG4gICAgICogQHBhcmFtIHtBcnJheX0gYXJ5IHRoZSBhcnJheSBvZiBwYXRoIHNlZ21lbnRzLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHRyaW1Eb3RzKGFyeSkge1xuICAgICAgICB2YXIgaSwgcGFydDtcbiAgICAgICAgZm9yIChpID0gMDsgYXJ5W2ldOyBpKz0gMSkge1xuICAgICAgICAgICAgcGFydCA9IGFyeVtpXTtcbiAgICAgICAgICAgIGlmIChwYXJ0ID09PSAnLicpIHtcbiAgICAgICAgICAgICAgICBhcnkuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIGkgLT0gMTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFydCA9PT0gJy4uJykge1xuICAgICAgICAgICAgICAgIGlmIChpID09PSAxICYmIChhcnlbMl0gPT09ICcuLicgfHwgYXJ5WzBdID09PSAnLi4nKSkge1xuICAgICAgICAgICAgICAgICAgICAvL0VuZCBvZiB0aGUgbGluZS4gS2VlcCBhdCBsZWFzdCBvbmUgbm9uLWRvdFxuICAgICAgICAgICAgICAgICAgICAvL3BhdGggc2VnbWVudCBhdCB0aGUgZnJvbnQgc28gaXQgY2FuIGJlIG1hcHBlZFxuICAgICAgICAgICAgICAgICAgICAvL2NvcnJlY3RseSB0byBkaXNrLiBPdGhlcndpc2UsIHRoZXJlIGlzIGxpa2VseVxuICAgICAgICAgICAgICAgICAgICAvL25vIHBhdGggbWFwcGluZyBmb3IgYSBwYXRoIHN0YXJ0aW5nIHdpdGggJy4uJy5cbiAgICAgICAgICAgICAgICAgICAgLy9UaGlzIGNhbiBzdGlsbCBmYWlsLCBidXQgY2F0Y2hlcyB0aGUgbW9zdCByZWFzb25hYmxlXG4gICAgICAgICAgICAgICAgICAgIC8vdXNlcyBvZiAuLlxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyeS5zcGxpY2UoaSAtIDEsIDIpO1xuICAgICAgICAgICAgICAgICAgICBpIC09IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplKG5hbWUsIGJhc2VOYW1lKSB7XG4gICAgICAgIHZhciBiYXNlUGFydHM7XG5cbiAgICAgICAgLy9BZGp1c3QgYW55IHJlbGF0aXZlIHBhdGhzLlxuICAgICAgICBpZiAobmFtZSAmJiBuYW1lLmNoYXJBdCgwKSA9PT0gJy4nKSB7XG4gICAgICAgICAgICAvL0lmIGhhdmUgYSBiYXNlIG5hbWUsIHRyeSB0byBub3JtYWxpemUgYWdhaW5zdCBpdCxcbiAgICAgICAgICAgIC8vb3RoZXJ3aXNlLCBhc3N1bWUgaXQgaXMgYSB0b3AtbGV2ZWwgcmVxdWlyZSB0aGF0IHdpbGxcbiAgICAgICAgICAgIC8vYmUgcmVsYXRpdmUgdG8gYmFzZVVybCBpbiB0aGUgZW5kLlxuICAgICAgICAgICAgaWYgKGJhc2VOYW1lKSB7XG4gICAgICAgICAgICAgICAgYmFzZVBhcnRzID0gYmFzZU5hbWUuc3BsaXQoJy8nKTtcbiAgICAgICAgICAgICAgICBiYXNlUGFydHMgPSBiYXNlUGFydHMuc2xpY2UoMCwgYmFzZVBhcnRzLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgICAgIGJhc2VQYXJ0cyA9IGJhc2VQYXJ0cy5jb25jYXQobmFtZS5zcGxpdCgnLycpKTtcbiAgICAgICAgICAgICAgICB0cmltRG90cyhiYXNlUGFydHMpO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBiYXNlUGFydHMuam9pbignLycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHRoZSBub3JtYWxpemUoKSBmdW5jdGlvbiBwYXNzZWQgdG8gYSBsb2FkZXIgcGx1Z2luJ3NcbiAgICAgKiBub3JtYWxpemUgbWV0aG9kLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VOb3JtYWxpemUocmVsTmFtZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemUobmFtZSwgcmVsTmFtZSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWFrZUxvYWQoaWQpIHtcbiAgICAgICAgZnVuY3Rpb24gbG9hZCh2YWx1ZSkge1xuICAgICAgICAgICAgbG9hZGVyQ2FjaGVbaWRdID0gdmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBsb2FkLmZyb21UZXh0ID0gZnVuY3Rpb24gKGlkLCB0ZXh0KSB7XG4gICAgICAgICAgICAvL1RoaXMgb25lIGlzIGRpZmZpY3VsdCBiZWNhdXNlIHRoZSB0ZXh0IGNhbi9wcm9iYWJseSB1c2VzXG4gICAgICAgICAgICAvL2RlZmluZSwgYW5kIGFueSByZWxhdGl2ZSBwYXRocyBhbmQgcmVxdWlyZXMgc2hvdWxkIGJlIHJlbGF0aXZlXG4gICAgICAgICAgICAvL3RvIHRoYXQgaWQgd2FzIGl0IHdvdWxkIGJlIGZvdW5kIG9uIGRpc2suIEJ1dCB0aGlzIHdvdWxkIHJlcXVpcmVcbiAgICAgICAgICAgIC8vYm9vdHN0cmFwcGluZyBhIG1vZHVsZS9yZXF1aXJlIGZhaXJseSBkZWVwbHkgZnJvbSBub2RlIGNvcmUuXG4gICAgICAgICAgICAvL05vdCBzdXJlIGhvdyBiZXN0IHRvIGdvIGFib3V0IHRoYXQgeWV0LlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhbWRlZmluZSBkb2VzIG5vdCBpbXBsZW1lbnQgbG9hZC5mcm9tVGV4dCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBsb2FkO1xuICAgIH1cblxuICAgIG1ha2VSZXF1aXJlID0gZnVuY3Rpb24gKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcmVsSWQpIHtcbiAgICAgICAgZnVuY3Rpb24gYW1kUmVxdWlyZShkZXBzLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBkZXBzID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIC8vU3luY2hyb25vdXMsIHNpbmdsZSBtb2R1bGUgcmVxdWlyZSgnJylcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIGRlcHMsIHJlbElkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy9BcnJheSBvZiBkZXBlbmRlbmNpZXMgd2l0aCBhIGNhbGxiYWNrLlxuXG4gICAgICAgICAgICAgICAgLy9Db252ZXJ0IHRoZSBkZXBlbmRlbmNpZXMgdG8gbW9kdWxlcy5cbiAgICAgICAgICAgICAgICBkZXBzID0gZGVwcy5tYXAoZnVuY3Rpb24gKGRlcE5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0cmluZ1JlcXVpcmUoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCBkZXBOYW1lLCByZWxJZCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvL1dhaXQgZm9yIG5leHQgdGljayB0byBjYWxsIGJhY2sgdGhlIHJlcXVpcmUgY2FsbC5cbiAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgZGVwcyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhbWRSZXF1aXJlLnRvVXJsID0gZnVuY3Rpb24gKGZpbGVQYXRoKSB7XG4gICAgICAgICAgICBpZiAoZmlsZVBhdGguaW5kZXhPZignLicpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShmaWxlUGF0aCwgcGF0aC5kaXJuYW1lKG1vZHVsZS5maWxlbmFtZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmlsZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGFtZFJlcXVpcmU7XG4gICAgfTtcblxuICAgIC8vRmF2b3IgZXhwbGljaXQgdmFsdWUsIHBhc3NlZCBpbiBpZiB0aGUgbW9kdWxlIHdhbnRzIHRvIHN1cHBvcnQgTm9kZSAwLjQuXG4gICAgcmVxdWlyZUZuID0gcmVxdWlyZUZuIHx8IGZ1bmN0aW9uIHJlcSgpIHtcbiAgICAgICAgcmV0dXJuIG1vZHVsZS5yZXF1aXJlLmFwcGx5KG1vZHVsZSwgYXJndW1lbnRzKTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcnVuRmFjdG9yeShpZCwgZGVwcywgZmFjdG9yeSkge1xuICAgICAgICB2YXIgciwgZSwgbSwgcmVzdWx0O1xuXG4gICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgZSA9IGxvYWRlckNhY2hlW2lkXSA9IHt9O1xuICAgICAgICAgICAgbSA9IHtcbiAgICAgICAgICAgICAgICBpZDogaWQsXG4gICAgICAgICAgICAgICAgdXJpOiBfX2ZpbGVuYW1lLFxuICAgICAgICAgICAgICAgIGV4cG9ydHM6IGVcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByID0gbWFrZVJlcXVpcmUocmVxdWlyZUZuLCBlLCBtLCBpZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL09ubHkgc3VwcG9ydCBvbmUgZGVmaW5lIGNhbGwgcGVyIGZpbGVcbiAgICAgICAgICAgIGlmIChhbHJlYWR5Q2FsbGVkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhbWRlZmluZSB3aXRoIG5vIG1vZHVsZSBJRCBjYW5ub3QgYmUgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIHBlciBmaWxlLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWxyZWFkeUNhbGxlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vVXNlIHRoZSByZWFsIHZhcmlhYmxlcyBmcm9tIG5vZGVcbiAgICAgICAgICAgIC8vVXNlIG1vZHVsZS5leHBvcnRzIGZvciBleHBvcnRzLCBzaW5jZVxuICAgICAgICAgICAgLy90aGUgZXhwb3J0cyBpbiBoZXJlIGlzIGFtZGVmaW5lIGV4cG9ydHMuXG4gICAgICAgICAgICBlID0gbW9kdWxlLmV4cG9ydHM7XG4gICAgICAgICAgICBtID0gbW9kdWxlO1xuICAgICAgICAgICAgciA9IG1ha2VSZXF1aXJlKHJlcXVpcmVGbiwgZSwgbSwgbW9kdWxlLmlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vSWYgdGhlcmUgYXJlIGRlcGVuZGVuY2llcywgdGhleSBhcmUgc3RyaW5ncywgc28gbmVlZFxuICAgICAgICAvL3RvIGNvbnZlcnQgdGhlbSB0byBkZXBlbmRlbmN5IHZhbHVlcy5cbiAgICAgICAgaWYgKGRlcHMpIHtcbiAgICAgICAgICAgIGRlcHMgPSBkZXBzLm1hcChmdW5jdGlvbiAoZGVwTmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByKGRlcE5hbWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL0NhbGwgdGhlIGZhY3Rvcnkgd2l0aCB0aGUgcmlnaHQgZGVwZW5kZW5jaWVzLlxuICAgICAgICBpZiAodHlwZW9mIGZhY3RvcnkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZhY3RvcnkuYXBwbHkobS5leHBvcnRzLCBkZXBzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZhY3Rvcnk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG0uZXhwb3J0cyA9IHJlc3VsdDtcbiAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgIGxvYWRlckNhY2hlW2lkXSA9IG0uZXhwb3J0cztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0cmluZ1JlcXVpcmUgPSBmdW5jdGlvbiAoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCBpZCwgcmVsSWQpIHtcbiAgICAgICAgLy9TcGxpdCB0aGUgSUQgYnkgYSAhIHNvIHRoYXRcbiAgICAgICAgdmFyIGluZGV4ID0gaWQuaW5kZXhPZignIScpLFxuICAgICAgICAgICAgb3JpZ2luYWxJZCA9IGlkLFxuICAgICAgICAgICAgcHJlZml4LCBwbHVnaW47XG5cbiAgICAgICAgaWYgKGluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgaWQgPSBub3JtYWxpemUoaWQsIHJlbElkKTtcblxuICAgICAgICAgICAgLy9TdHJhaWdodCBtb2R1bGUgbG9va3VwLiBJZiBpdCBpcyBvbmUgb2YgdGhlIHNwZWNpYWwgZGVwZW5kZW5jaWVzLFxuICAgICAgICAgICAgLy9kZWFsIHdpdGggaXQsIG90aGVyd2lzZSwgZGVsZWdhdGUgdG8gbm9kZS5cbiAgICAgICAgICAgIGlmIChpZCA9PT0gJ3JlcXVpcmUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1ha2VSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcmVsSWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpZCA9PT0gJ2V4cG9ydHMnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cG9ydHM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlkID09PSAnbW9kdWxlJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2R1bGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGxvYWRlckNhY2hlLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRlZmluZUNhY2hlW2lkXSkge1xuICAgICAgICAgICAgICAgIHJ1bkZhY3RvcnkuYXBwbHkobnVsbCwgZGVmaW5lQ2FjaGVbaWRdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZihzeXN0ZW1SZXF1aXJlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzeXN0ZW1SZXF1aXJlKG9yaWdpbmFsSWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbW9kdWxlIHdpdGggSUQ6ICcgKyBpZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9UaGVyZSBpcyBhIHBsdWdpbiBpbiBwbGF5LlxuICAgICAgICAgICAgcHJlZml4ID0gaWQuc3Vic3RyaW5nKDAsIGluZGV4KTtcbiAgICAgICAgICAgIGlkID0gaWQuc3Vic3RyaW5nKGluZGV4ICsgMSwgaWQubGVuZ3RoKTtcblxuICAgICAgICAgICAgcGx1Z2luID0gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIHByZWZpeCwgcmVsSWQpO1xuXG4gICAgICAgICAgICBpZiAocGx1Z2luLm5vcm1hbGl6ZSkge1xuICAgICAgICAgICAgICAgIGlkID0gcGx1Z2luLm5vcm1hbGl6ZShpZCwgbWFrZU5vcm1hbGl6ZShyZWxJZCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL05vcm1hbGl6ZSB0aGUgSUQgbm9ybWFsbHkuXG4gICAgICAgICAgICAgICAgaWQgPSBub3JtYWxpemUoaWQsIHJlbElkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxvYWRlckNhY2hlW2lkXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBsdWdpbi5sb2FkKGlkLCBtYWtlUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIHJlbElkKSwgbWFrZUxvYWQoaWQpLCB7fSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vQ3JlYXRlIGEgZGVmaW5lIGZ1bmN0aW9uIHNwZWNpZmljIHRvIHRoZSBtb2R1bGUgYXNraW5nIGZvciBhbWRlZmluZS5cbiAgICBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlcHMsIGZhY3RvcnkpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaWQpKSB7XG4gICAgICAgICAgICBmYWN0b3J5ID0gZGVwcztcbiAgICAgICAgICAgIGRlcHMgPSBpZDtcbiAgICAgICAgICAgIGlkID0gdW5kZWZpbmVkO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGZhY3RvcnkgPSBpZDtcbiAgICAgICAgICAgIGlkID0gZGVwcyA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkZXBzICYmICFBcnJheS5pc0FycmF5KGRlcHMpKSB7XG4gICAgICAgICAgICBmYWN0b3J5ID0gZGVwcztcbiAgICAgICAgICAgIGRlcHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWRlcHMpIHtcbiAgICAgICAgICAgIGRlcHMgPSBbJ3JlcXVpcmUnLCAnZXhwb3J0cycsICdtb2R1bGUnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vU2V0IHVwIHByb3BlcnRpZXMgZm9yIHRoaXMgbW9kdWxlLiBJZiBhbiBJRCwgdGhlbiB1c2VcbiAgICAgICAgLy9pbnRlcm5hbCBjYWNoZS4gSWYgbm8gSUQsIHRoZW4gdXNlIHRoZSBleHRlcm5hbCB2YXJpYWJsZXNcbiAgICAgICAgLy9mb3IgdGhpcyBub2RlIG1vZHVsZS5cbiAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAvL1B1dCB0aGUgbW9kdWxlIGluIGRlZXAgZnJlZXplIHVudGlsIHRoZXJlIGlzIGFcbiAgICAgICAgICAgIC8vcmVxdWlyZSBjYWxsIGZvciBpdC5cbiAgICAgICAgICAgIGRlZmluZUNhY2hlW2lkXSA9IFtpZCwgZGVwcywgZmFjdG9yeV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBydW5GYWN0b3J5KGlkLCBkZXBzLCBmYWN0b3J5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vZGVmaW5lLnJlcXVpcmUsIHdoaWNoIGhhcyBhY2Nlc3MgdG8gYWxsIHRoZSB2YWx1ZXMgaW4gdGhlXG4gICAgLy9jYWNoZS4gVXNlZnVsIGZvciBBTUQgbW9kdWxlcyB0aGF0IGFsbCBoYXZlIElEcyBpbiB0aGUgZmlsZSxcbiAgICAvL2J1dCBuZWVkIHRvIGZpbmFsbHkgZXhwb3J0IGEgdmFsdWUgdG8gbm9kZSBiYXNlZCBvbiBvbmUgb2YgdGhvc2VcbiAgICAvL0lEcy5cbiAgICBkZWZpbmUucmVxdWlyZSA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICBpZiAobG9hZGVyQ2FjaGVbaWRdKSB7XG4gICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlZmluZUNhY2hlW2lkXSkge1xuICAgICAgICAgICAgcnVuRmFjdG9yeS5hcHBseShudWxsLCBkZWZpbmVDYWNoZVtpZF0pO1xuICAgICAgICAgICAgcmV0dXJuIGxvYWRlckNhY2hlW2lkXTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBkZWZpbmUuYW1kID0ge307XG5cbiAgICByZXR1cm4gZGVmaW5lO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFtZGVmaW5lO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIkQ6XFxcXGJpbGx5c0ZpbGVcXFxcY29kZVxcXFxqYXZhc2NyaXB0XFxcXG5vZGVqc1xcXFxtb2R1bGVzXFxcXGRlYWR1bml0Q29yZVxcXFxub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeVxcXFxub2RlX21vZHVsZXNcXFxcaW5zZXJ0LW1vZHVsZS1nbG9iYWxzXFxcXG5vZGVfbW9kdWxlc1xcXFxwcm9jZXNzXFxcXGJyb3dzZXIuanNcIiksXCIvLi5cXFxcbm9kZV9tb2R1bGVzXFxcXHNvdXJjZS1tYXBcXFxcbm9kZV9tb2R1bGVzXFxcXGFtZGVmaW5lXFxcXGFtZGVmaW5lLmpzXCIpIiwiKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIC8vIFVuaXZlcnNhbCBNb2R1bGUgRGVmaW5pdGlvbiAoVU1EKSB0byBzdXBwb3J0IEFNRCwgQ29tbW9uSlMvTm9kZS5qcywgUmhpbm8sIGFuZCBicm93c2Vycy5cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZSgnZXJyb3Itc3RhY2stcGFyc2VyJywgWydzdGFja2ZyYW1lJ10sIGZhY3RvcnkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKCdzdGFja2ZyYW1lJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJvb3QuRXJyb3JTdGFja1BhcnNlciA9IGZhY3Rvcnkocm9vdC5TdGFja0ZyYW1lKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uIEVycm9yU3RhY2tQYXJzZXIoU3RhY2tGcmFtZSkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIHZhciBGSVJFRk9YX1NBRkFSSV9TVEFDS19SRUdFWFAgPSAvXFxTK1xcOlxcZCsvO1xuICAgIHZhciBDSFJPTUVfSUVfU1RBQ0tfUkVHRVhQID0gL1xccythdCAvO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdpdmVuIGFuIEVycm9yIG9iamVjdCwgZXh0cmFjdCB0aGUgbW9zdCBpbmZvcm1hdGlvbiBmcm9tIGl0LlxuICAgICAgICAgKiBAcGFyYW0gZXJyb3Ige0Vycm9yfVxuICAgICAgICAgKiBAcmV0dXJuIEFycmF5W1N0YWNrRnJhbWVdXG4gICAgICAgICAqL1xuICAgICAgICBwYXJzZTogZnVuY3Rpb24gRXJyb3JTdGFja1BhcnNlciQkcGFyc2UoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZXJyb3Iuc3RhY2t0cmFjZSAhPT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIGVycm9yWydvcGVyYSNzb3VyY2Vsb2MnXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJzZU9wZXJhKGVycm9yKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXJyb3Iuc3RhY2sgJiYgZXJyb3Iuc3RhY2subWF0Y2goQ0hST01FX0lFX1NUQUNLX1JFR0VYUCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJzZVY4T3JJRShlcnJvcik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGVycm9yLnN0YWNrICYmIGVycm9yLnN0YWNrLm1hdGNoKEZJUkVGT1hfU0FGQVJJX1NUQUNLX1JFR0VYUCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJzZUZGT3JTYWZhcmkoZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBwYXJzZSBnaXZlbiBFcnJvciBvYmplY3QnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2VwYXJhdGUgbGluZSBhbmQgY29sdW1uIG51bWJlcnMgZnJvbSBhIFVSTC1saWtlIHN0cmluZy5cbiAgICAgICAgICogQHBhcmFtIHVybExpa2UgU3RyaW5nXG4gICAgICAgICAqIEByZXR1cm4gQXJyYXlbU3RyaW5nXVxuICAgICAgICAgKi9cbiAgICAgICAgZXh0cmFjdExvY2F0aW9uOiBmdW5jdGlvbiBFcnJvclN0YWNrUGFyc2VyJCRleHRyYWN0TG9jYXRpb24odXJsTGlrZSkge1xuICAgICAgICAgICAgLy8gR3VhcmQgYWdhaW5zdCBzdHJpbmdzIGxpa2UgXCIobmF0aXZlKVwiXG4gICAgICAgICAgICBpZiAodXJsTGlrZS5pbmRleE9mKCc6JykgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbG9jYXRpb25QYXJ0cyA9IHVybExpa2Uuc3BsaXQoJzonKTtcbiAgICAgICAgICAgIHZhciBsYXN0TnVtYmVyID0gbG9jYXRpb25QYXJ0cy5wb3AoKTtcbiAgICAgICAgICAgIHZhciBwb3NzaWJsZU51bWJlciA9IGxvY2F0aW9uUGFydHNbbG9jYXRpb25QYXJ0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIGlmICghaXNOYU4ocGFyc2VGbG9hdChwb3NzaWJsZU51bWJlcikpICYmIGlzRmluaXRlKHBvc3NpYmxlTnVtYmVyKSkge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gbG9jYXRpb25QYXJ0cy5wb3AoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gW2xvY2F0aW9uUGFydHMuam9pbignOicpLCBsaW5lTnVtYmVyLCBsYXN0TnVtYmVyXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtsb2NhdGlvblBhcnRzLmpvaW4oJzonKSwgbGFzdE51bWJlciwgdW5kZWZpbmVkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBwYXJzZVY4T3JJRTogZnVuY3Rpb24gRXJyb3JTdGFja1BhcnNlciQkcGFyc2VWOE9ySUUoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBlcnJvci5zdGFjay5zcGxpdCgnXFxuJykuc2xpY2UoMSkubWFwKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRva2VucyA9IGxpbmUucmVwbGFjZSgvXlxccysvLCAnJykuc3BsaXQoL1xccysvKS5zbGljZSgxKTtcbiAgICAgICAgICAgICAgICB2YXIgbG9jYXRpb25QYXJ0cyA9IHRoaXMuZXh0cmFjdExvY2F0aW9uKHRva2Vucy5wb3AoKS5yZXBsYWNlKC9bXFwoXFwpXFxzXS9nLCAnJykpO1xuICAgICAgICAgICAgICAgIHZhciBmdW5jdGlvbk5hbWUgPSAoIXRva2Vuc1swXSB8fCB0b2tlbnNbMF0gPT09ICdBbm9ueW1vdXMnKSA/IHVuZGVmaW5lZCA6IHRva2Vuc1swXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFN0YWNrRnJhbWUoZnVuY3Rpb25OYW1lLCB1bmRlZmluZWQsIGxvY2F0aW9uUGFydHNbMF0sIGxvY2F0aW9uUGFydHNbMV0sIGxvY2F0aW9uUGFydHNbMl0pO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGFyc2VGRk9yU2FmYXJpOiBmdW5jdGlvbiBFcnJvclN0YWNrUGFyc2VyJCRwYXJzZUZGT3JTYWZhcmkoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBlcnJvci5zdGFjay5zcGxpdCgnXFxuJykuZmlsdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICEhbGluZS5tYXRjaChGSVJFRk9YX1NBRkFSSV9TVEFDS19SRUdFWFApO1xuICAgICAgICAgICAgfSwgdGhpcykubWFwKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRva2VucyA9IGxpbmUuc3BsaXQoJ0AnKTtcbiAgICAgICAgICAgICAgICB2YXIgbG9jYXRpb25QYXJ0cyA9IHRoaXMuZXh0cmFjdExvY2F0aW9uKHRva2Vucy5wb3AoKSk7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmN0aW9uTmFtZSA9IHRva2Vucy5zaGlmdCgpIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFN0YWNrRnJhbWUoZnVuY3Rpb25OYW1lLCB1bmRlZmluZWQsIGxvY2F0aW9uUGFydHNbMF0sIGxvY2F0aW9uUGFydHNbMV0sIGxvY2F0aW9uUGFydHNbMl0pO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGFyc2VPcGVyYTogZnVuY3Rpb24gRXJyb3JTdGFja1BhcnNlciQkcGFyc2VPcGVyYShlKSB7XG4gICAgICAgICAgICBpZiAoIWUuc3RhY2t0cmFjZSB8fCAoZS5tZXNzYWdlLmluZGV4T2YoJ1xcbicpID4gLTEgJiZcbiAgICAgICAgICAgICAgICBlLm1lc3NhZ2Uuc3BsaXQoJ1xcbicpLmxlbmd0aCA+IGUuc3RhY2t0cmFjZS5zcGxpdCgnXFxuJykubGVuZ3RoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnNlT3BlcmE5KGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghZS5zdGFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnNlT3BlcmExMChlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyc2VPcGVyYTExKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHBhcnNlT3BlcmE5OiBmdW5jdGlvbiBFcnJvclN0YWNrUGFyc2VyJCRwYXJzZU9wZXJhOShlKSB7XG4gICAgICAgICAgICB2YXIgbGluZVJFID0gL0xpbmUgKFxcZCspLipzY3JpcHQgKD86aW4gKT8oXFxTKykvaTtcbiAgICAgICAgICAgIHZhciBsaW5lcyA9IGUubWVzc2FnZS5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gW107XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAyLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMikge1xuICAgICAgICAgICAgICAgIHZhciBtYXRjaCA9IGxpbmVSRS5leGVjKGxpbmVzW2ldKTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gobmV3IFN0YWNrRnJhbWUodW5kZWZpbmVkLCB1bmRlZmluZWQsIG1hdGNoWzJdLCBtYXRjaFsxXSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSxcblxuICAgICAgICBwYXJzZU9wZXJhMTA6IGZ1bmN0aW9uIEVycm9yU3RhY2tQYXJzZXIkJHBhcnNlT3BlcmExMChlKSB7XG4gICAgICAgICAgICB2YXIgbGluZVJFID0gL0xpbmUgKFxcZCspLipzY3JpcHQgKD86aW4gKT8oXFxTKykoPzo6IEluIGZ1bmN0aW9uIChcXFMrKSk/JC9pO1xuICAgICAgICAgICAgdmFyIGxpbmVzID0gZS5zdGFja3RyYWNlLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBbXTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAyKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gbGluZVJFLmV4ZWMobGluZXNbaV0pO1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaChuZXcgU3RhY2tGcmFtZShtYXRjaFszXSB8fCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWF0Y2hbMl0sIG1hdGNoWzFdKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIE9wZXJhIDEwLjY1KyBFcnJvci5zdGFjayB2ZXJ5IHNpbWlsYXIgdG8gRkYvU2FmYXJpXG4gICAgICAgIHBhcnNlT3BlcmExMTogZnVuY3Rpb24gRXJyb3JTdGFja1BhcnNlciQkcGFyc2VPcGVyYTExKGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZXJyb3Iuc3RhY2suc3BsaXQoJ1xcbicpLmZpbHRlcihmdW5jdGlvbiAobGluZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAhIWxpbmUubWF0Y2goRklSRUZPWF9TQUZBUklfU1RBQ0tfUkVHRVhQKSAmJlxuICAgICAgICAgICAgICAgICAgICAhbGluZS5tYXRjaCgvXkVycm9yIGNyZWF0ZWQgYXQvKTtcbiAgICAgICAgICAgIH0sIHRoaXMpLm1hcChmdW5jdGlvbiAobGluZSkge1xuICAgICAgICAgICAgICAgIHZhciB0b2tlbnMgPSBsaW5lLnNwbGl0KCdAJyk7XG4gICAgICAgICAgICAgICAgdmFyIGxvY2F0aW9uUGFydHMgPSB0aGlzLmV4dHJhY3RMb2NhdGlvbih0b2tlbnMucG9wKCkpO1xuICAgICAgICAgICAgICAgIHZhciBmdW5jdGlvbkNhbGwgPSAodG9rZW5zLnNoaWZ0KCkgfHwgJycpO1xuICAgICAgICAgICAgICAgIHZhciBmdW5jdGlvbk5hbWUgPSBmdW5jdGlvbkNhbGxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC88YW5vbnltb3VzIGZ1bmN0aW9uKDogKFxcdyspKT8+LywgJyQyJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXChbXlxcKV0qXFwpL2csICcnKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3NSYXc7XG4gICAgICAgICAgICAgICAgaWYgKGZ1bmN0aW9uQ2FsbC5tYXRjaCgvXFwoKFteXFwpXSopXFwpLykpIHtcbiAgICAgICAgICAgICAgICAgICAgYXJnc1JhdyA9IGZ1bmN0aW9uQ2FsbC5yZXBsYWNlKC9eW15cXChdK1xcKChbXlxcKV0qKVxcKSQvLCAnJDEnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSAoYXJnc1JhdyA9PT0gdW5kZWZpbmVkIHx8IGFyZ3NSYXcgPT09ICdbYXJndW1lbnRzIG5vdCBhdmFpbGFibGVdJykgPyB1bmRlZmluZWQgOiBhcmdzUmF3LnNwbGl0KCcsJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBTdGFja0ZyYW1lKGZ1bmN0aW9uTmFtZSwgYXJncywgbG9jYXRpb25QYXJ0c1swXSwgbG9jYXRpb25QYXJ0c1sxXSwgbG9jYXRpb25QYXJ0c1syXSk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuICAgIH07XG59KSk7XG5cbiIsIihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICAvLyBVbml2ZXJzYWwgTW9kdWxlIERlZmluaXRpb24gKFVNRCkgdG8gc3VwcG9ydCBBTUQsIENvbW1vbkpTL05vZGUuanMsIFJoaW5vLCBhbmQgYnJvd3NlcnMuXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoJ3N0YWNrZnJhbWUnLCBbXSwgZmFjdG9yeSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcm9vdC5TdGFja0ZyYW1lID0gZmFjdG9yeSgpO1xuICAgIH1cbn0odGhpcywgZnVuY3Rpb24gKCkge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICBmdW5jdGlvbiBfaXNOdW1iZXIobikge1xuICAgICAgICByZXR1cm4gIWlzTmFOKHBhcnNlRmxvYXQobikpICYmIGlzRmluaXRlKG4pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIFN0YWNrRnJhbWUoZnVuY3Rpb25OYW1lLCBhcmdzLCBmaWxlTmFtZSwgbGluZU51bWJlciwgY29sdW1uTnVtYmVyKSB7XG4gICAgICAgIGlmIChmdW5jdGlvbk5hbWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zZXRGdW5jdGlvbk5hbWUoZnVuY3Rpb25OYW1lKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJncyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNldEFyZ3MoYXJncyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZpbGVOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0RmlsZU5hbWUoZmlsZU5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsaW5lTnVtYmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0TGluZU51bWJlcihsaW5lTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY29sdW1uTnVtYmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0Q29sdW1uTnVtYmVyKGNvbHVtbk51bWJlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBTdGFja0ZyYW1lLnByb3RvdHlwZSA9IHtcbiAgICAgICAgZ2V0RnVuY3Rpb25OYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbk5hbWU7XG4gICAgICAgIH0sXG4gICAgICAgIHNldEZ1bmN0aW9uTmFtZTogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuZnVuY3Rpb25OYW1lID0gU3RyaW5nKHYpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldEFyZ3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFyZ3M7XG4gICAgICAgIH0sXG4gICAgICAgIHNldEFyZ3M6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHYpICE9PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJncyBtdXN0IGJlIGFuIEFycmF5Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFyZ3MgPSB2O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIE5PVEU6IFByb3BlcnR5IG5hbWUgbWF5IGJlIG1pc2xlYWRpbmcgYXMgaXQgaW5jbHVkZXMgdGhlIHBhdGgsXG4gICAgICAgIC8vIGJ1dCBpdCBzb21ld2hhdCBtaXJyb3JzIFY4J3MgSmF2YVNjcmlwdFN0YWNrVHJhY2VBcGlcbiAgICAgICAgLy8gaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC93aWtpL0phdmFTY3JpcHRTdGFja1RyYWNlQXBpIGFuZCBHZWNrbydzXG4gICAgICAgIC8vIGh0dHA6Ly9teHIubW96aWxsYS5vcmcvbW96aWxsYS1jZW50cmFsL3NvdXJjZS94cGNvbS9iYXNlL25zSUV4Y2VwdGlvbi5pZGwjMTRcbiAgICAgICAgZ2V0RmlsZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbGVOYW1lO1xuICAgICAgICB9LFxuICAgICAgICBzZXRGaWxlTmFtZTogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuZmlsZU5hbWUgPSBTdHJpbmcodik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0TGluZU51bWJlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubGluZU51bWJlcjtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0TGluZU51bWJlcjogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIGlmICghX2lzTnVtYmVyKHYpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignTGluZSBOdW1iZXIgbXVzdCBiZSBhIE51bWJlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5saW5lTnVtYmVyID0gTnVtYmVyKHYpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldENvbHVtbk51bWJlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29sdW1uTnVtYmVyO1xuICAgICAgICB9LFxuICAgICAgICBzZXRDb2x1bW5OdW1iZXI6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICBpZiAoIV9pc051bWJlcih2KSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0NvbHVtbiBOdW1iZXIgbXVzdCBiZSBhIE51bWJlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb2x1bW5OdW1iZXIgPSBOdW1iZXIodik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGZ1bmN0aW9uTmFtZSA9IHRoaXMuZ2V0RnVuY3Rpb25OYW1lKCkgfHwgJ3thbm9ueW1vdXN9JztcbiAgICAgICAgICAgIHZhciBhcmdzID0gJygnICsgKHRoaXMuZ2V0QXJncygpIHx8IFtdKS5qb2luKCcsJykgKyAnKSc7XG4gICAgICAgICAgICB2YXIgZmlsZU5hbWUgPSB0aGlzLmdldEZpbGVOYW1lKCkgPyAoJ0AnICsgdGhpcy5nZXRGaWxlTmFtZSgpKSA6ICcnO1xuICAgICAgICAgICAgdmFyIGxpbmVOdW1iZXIgPSBfaXNOdW1iZXIodGhpcy5nZXRMaW5lTnVtYmVyKCkpID8gKCc6JyArIHRoaXMuZ2V0TGluZU51bWJlcigpKSA6ICcnO1xuICAgICAgICAgICAgdmFyIGNvbHVtbk51bWJlciA9IF9pc051bWJlcih0aGlzLmdldENvbHVtbk51bWJlcigpKSA/ICgnOicgKyB0aGlzLmdldENvbHVtbk51bWJlcigpKSA6ICcnO1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uTmFtZSArIGFyZ3MgKyBmaWxlTmFtZSArIGxpbmVOdW1iZXIgKyBjb2x1bW5OdW1iZXI7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIFN0YWNrRnJhbWU7XG59KSk7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsKXtcbi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9qYWtlYXJjaGliYWxkL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDIuMC4xXG4gKi9cblxuKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgZnVuY3Rpb24gJCR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgKHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJHV0aWxzJCRpc0Z1bmN0aW9uKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJHV0aWxzJCRpc01heWJlVGhlbmFibGUoeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsO1xuICAgIH1cblxuICAgIHZhciAkJHV0aWxzJCRfaXNBcnJheTtcblxuICAgIGlmICghQXJyYXkuaXNBcnJheSkge1xuICAgICAgJCR1dGlscyQkX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgJCR1dGlscyQkX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuICAgIH1cblxuICAgIHZhciAkJHV0aWxzJCRpc0FycmF5ID0gJCR1dGlscyQkX2lzQXJyYXk7XG4gICAgdmFyICQkdXRpbHMkJG5vdyA9IERhdGUubm93IHx8IGZ1bmN0aW9uKCkgeyByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7IH07XG4gICAgZnVuY3Rpb24gJCR1dGlscyQkRigpIHsgfVxuXG4gICAgdmFyICQkdXRpbHMkJG9fY3JlYXRlID0gKE9iamVjdC5jcmVhdGUgfHwgZnVuY3Rpb24gKG8pIHtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NlY29uZCBhcmd1bWVudCBub3Qgc3VwcG9ydGVkJyk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG8gIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgICB9XG4gICAgICAkJHV0aWxzJCRGLnByb3RvdHlwZSA9IG87XG4gICAgICByZXR1cm4gbmV3ICQkdXRpbHMkJEYoKTtcbiAgICB9KTtcblxuICAgIHZhciAkJGFzYXAkJGxlbiA9IDA7XG5cbiAgICB2YXIgJCRhc2FwJCRkZWZhdWx0ID0gZnVuY3Rpb24gYXNhcChjYWxsYmFjaywgYXJnKSB7XG4gICAgICAkJGFzYXAkJHF1ZXVlWyQkYXNhcCQkbGVuXSA9IGNhbGxiYWNrO1xuICAgICAgJCRhc2FwJCRxdWV1ZVskJGFzYXAkJGxlbiArIDFdID0gYXJnO1xuICAgICAgJCRhc2FwJCRsZW4gKz0gMjtcbiAgICAgIGlmICgkJGFzYXAkJGxlbiA9PT0gMikge1xuICAgICAgICAvLyBJZiBsZW4gaXMgMSwgdGhhdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gc2NoZWR1bGUgYW4gYXN5bmMgZmx1c2guXG4gICAgICAgIC8vIElmIGFkZGl0aW9uYWwgY2FsbGJhY2tzIGFyZSBxdWV1ZWQgYmVmb3JlIHRoZSBxdWV1ZSBpcyBmbHVzaGVkLCB0aGV5XG4gICAgICAgIC8vIHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoaXMgZmx1c2ggdGhhdCB3ZSBhcmUgc2NoZWR1bGluZy5cbiAgICAgICAgJCRhc2FwJCRzY2hlZHVsZUZsdXNoKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciAkJGFzYXAkJGJyb3dzZXJHbG9iYWwgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93IDoge307XG4gICAgdmFyICQkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIgPSAkJGFzYXAkJGJyb3dzZXJHbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCAkJGFzYXAkJGJyb3dzZXJHbG9iYWwuV2ViS2l0TXV0YXRpb25PYnNlcnZlcjtcblxuICAgIC8vIHRlc3QgZm9yIHdlYiB3b3JrZXIgYnV0IG5vdCBpbiBJRTEwXG4gICAgdmFyICQkYXNhcCQkaXNXb3JrZXIgPSB0eXBlb2YgVWludDhDbGFtcGVkQXJyYXkgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgaW1wb3J0U2NyaXB0cyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHR5cGVvZiBNZXNzYWdlQ2hhbm5lbCAhPT0gJ3VuZGVmaW5lZCc7XG5cbiAgICAvLyBub2RlXG4gICAgZnVuY3Rpb24gJCRhc2FwJCR1c2VOZXh0VGljaygpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgcHJvY2Vzcy5uZXh0VGljaygkJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCkge1xuICAgICAgdmFyIGl0ZXJhdGlvbnMgPSAwO1xuICAgICAgdmFyIG9ic2VydmVyID0gbmV3ICQkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIoJCRhc2FwJCRmbHVzaCk7XG4gICAgICB2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgICAgIG9ic2VydmVyLm9ic2VydmUobm9kZSwgeyBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIG5vZGUuZGF0YSA9IChpdGVyYXRpb25zID0gKytpdGVyYXRpb25zICUgMik7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIHdlYiB3b3JrZXJcbiAgICBmdW5jdGlvbiAkJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCkge1xuICAgICAgdmFyIGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcbiAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gJCRhc2FwJCRmbHVzaDtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkYXNhcCQkdXNlU2V0VGltZW91dCgpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgc2V0VGltZW91dCgkJGFzYXAkJGZsdXNoLCAxKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdmFyICQkYXNhcCQkcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG5cbiAgICBmdW5jdGlvbiAkJGFzYXAkJGZsdXNoKCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAkJGFzYXAkJGxlbjsgaSs9Mikge1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSAkJGFzYXAkJHF1ZXVlW2ldO1xuICAgICAgICB2YXIgYXJnID0gJCRhc2FwJCRxdWV1ZVtpKzFdO1xuXG4gICAgICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICAgICAgJCRhc2FwJCRxdWV1ZVtpXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgJCRhc2FwJCRxdWV1ZVtpKzFdID0gdW5kZWZpbmVkO1xuICAgICAgfVxuXG4gICAgICAkJGFzYXAkJGxlbiA9IDA7XG4gICAgfVxuXG4gICAgdmFyICQkYXNhcCQkc2NoZWR1bGVGbHVzaDtcblxuICAgIC8vIERlY2lkZSB3aGF0IGFzeW5jIG1ldGhvZCB0byB1c2UgdG8gdHJpZ2dlcmluZyBwcm9jZXNzaW5nIG9mIHF1ZXVlZCBjYWxsYmFja3M6XG4gICAgaWYgKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiB7fS50b1N0cmluZy5jYWxsKHByb2Nlc3MpID09PSAnW29iamVjdCBwcm9jZXNzXScpIHtcbiAgICAgICQkYXNhcCQkc2NoZWR1bGVGbHVzaCA9ICQkYXNhcCQkdXNlTmV4dFRpY2soKTtcbiAgICB9IGVsc2UgaWYgKCQkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICQkYXNhcCQkc2NoZWR1bGVGbHVzaCA9ICQkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpO1xuICAgIH0gZWxzZSBpZiAoJCRhc2FwJCRpc1dvcmtlcikge1xuICAgICAgJCRhc2FwJCRzY2hlZHVsZUZsdXNoID0gJCRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAkJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSAkJGFzYXAkJHVzZVNldFRpbWVvdXQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJCRpbnRlcm5hbCQkbm9vcCgpIHt9XG4gICAgdmFyICQkJGludGVybmFsJCRQRU5ESU5HICAgPSB2b2lkIDA7XG4gICAgdmFyICQkJGludGVybmFsJCRGVUxGSUxMRUQgPSAxO1xuICAgIHZhciAkJCRpbnRlcm5hbCQkUkVKRUNURUQgID0gMjtcbiAgICB2YXIgJCQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SID0gbmV3ICQkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJHNlbGZGdWxsZmlsbG1lbnQoKSB7XG4gICAgICByZXR1cm4gbmV3IFR5cGVFcnJvcihcIllvdSBjYW5ub3QgcmVzb2x2ZSBhIHByb21pc2Ugd2l0aCBpdHNlbGZcIik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKCdBIHByb21pc2VzIGNhbGxiYWNrIGNhbm5vdCByZXR1cm4gdGhhdCBzYW1lIHByb21pc2UuJylcbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJCRpbnRlcm5hbCQkZ2V0VGhlbihwcm9taXNlKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuO1xuICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAkJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgcmV0dXJuICQkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJCRpbnRlcm5hbCQkdHJ5VGhlbih0aGVuLCB2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcik7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSwgdGhlbikge1xuICAgICAgICQkYXNhcCQkZGVmYXVsdChmdW5jdGlvbihwcm9taXNlKSB7XG4gICAgICAgIHZhciBzZWFsZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGVycm9yID0gJCQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdGhlbmFibGUsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgICAgIGlmICh0aGVuYWJsZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgICQkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuXG4gICAgICAgICAgJCQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9LCAnU2V0dGxlOiAnICsgKHByb21pc2UuX2xhYmVsIHx8ICcgdW5rbm93biBwcm9taXNlJykpO1xuXG4gICAgICAgIGlmICghc2VhbGVkICYmIGVycm9yKSB7XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlKSB7XG4gICAgICBpZiAodGhlbmFibGUuX3N0YXRlID09PSAkJCRpbnRlcm5hbCQkRlVMRklMTEVEKSB7XG4gICAgICAgICQkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gJCQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgICQkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAkJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHRoZW5hYmxlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpIHtcbiAgICAgIGlmIChtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yID09PSBwcm9taXNlLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgICQkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB0aGVuID0gJCQkaW50ZXJuYWwkJGdldFRoZW4obWF5YmVUaGVuYWJsZSk7XG5cbiAgICAgICAgaWYgKHRoZW4gPT09ICQkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUikge1xuICAgICAgICAgICQkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgJCQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SLmVycm9yKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGVuID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAkJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmICgkJHV0aWxzJCRpc0Z1bmN0aW9uKHRoZW4pKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAkJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKSB7XG4gICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCAkJCRpbnRlcm5hbCQkc2VsZkZ1bGxmaWxsbWVudCgpKTtcbiAgICAgIH0gZWxzZSBpZiAoJCR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGludGVybmFsJCRwdWJsaXNoUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgICAgIGlmIChwcm9taXNlLl9vbmVycm9yKSB7XG4gICAgICAgIHByb21pc2UuX29uZXJyb3IocHJvbWlzZS5fcmVzdWx0KTtcbiAgICAgIH1cblxuICAgICAgJCQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gJCQkaW50ZXJuYWwkJFBFTkRJTkcpIHsgcmV0dXJuOyB9XG5cbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHZhbHVlO1xuICAgICAgcHJvbWlzZS5fc3RhdGUgPSAkJCRpbnRlcm5hbCQkRlVMRklMTEVEO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAkJGFzYXAkJGRlZmF1bHQoJCQkaW50ZXJuYWwkJHB1Ymxpc2gsIHByb21pc2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09ICQkJGludGVybmFsJCRQRU5ESU5HKSB7IHJldHVybjsgfVxuICAgICAgcHJvbWlzZS5fc3RhdGUgPSAkJCRpbnRlcm5hbCQkUkVKRUNURUQ7XG4gICAgICBwcm9taXNlLl9yZXN1bHQgPSByZWFzb247XG5cbiAgICAgICQkYXNhcCQkZGVmYXVsdCgkJCRpbnRlcm5hbCQkcHVibGlzaFJlamVjdGlvbiwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcGFyZW50Ll9zdWJzY3JpYmVycztcbiAgICAgIHZhciBsZW5ndGggPSBzdWJzY3JpYmVycy5sZW5ndGg7XG5cbiAgICAgIHBhcmVudC5fb25lcnJvciA9IG51bGw7XG5cbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aF0gPSBjaGlsZDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArICQkJGludGVybmFsJCRGVUxGSUxMRURdID0gb25GdWxmaWxsbWVudDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArICQkJGludGVybmFsJCRSRUpFQ1RFRF0gID0gb25SZWplY3Rpb247XG5cbiAgICAgIGlmIChsZW5ndGggPT09IDAgJiYgcGFyZW50Ll9zdGF0ZSkge1xuICAgICAgICAkJGFzYXAkJGRlZmF1bHQoJCQkaW50ZXJuYWwkJHB1Ymxpc2gsIHBhcmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSkge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcHJvbWlzZS5fc3Vic2NyaWJlcnM7XG4gICAgICB2YXIgc2V0dGxlZCA9IHByb21pc2UuX3N0YXRlO1xuXG4gICAgICBpZiAoc3Vic2NyaWJlcnMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG4gICAgICB2YXIgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwgPSBwcm9taXNlLl9yZXN1bHQ7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3Vic2NyaWJlcnMubGVuZ3RoOyBpICs9IDMpIHtcbiAgICAgICAgY2hpbGQgPSBzdWJzY3JpYmVyc1tpXTtcbiAgICAgICAgY2FsbGJhY2sgPSBzdWJzY3JpYmVyc1tpICsgc2V0dGxlZF07XG5cbiAgICAgICAgaWYgKGNoaWxkKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHNldHRsZWQsIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhkZXRhaWwpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gJCQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCkge1xuICAgICAgdGhpcy5lcnJvciA9IG51bGw7XG4gICAgfVxuXG4gICAgdmFyICQkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IgPSBuZXcgJCQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCk7XG5cbiAgICBmdW5jdGlvbiAkJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUi5lcnJvciA9IGU7XG4gICAgICAgIHJldHVybiAkJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBwcm9taXNlLCBjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB2YXIgaGFzQ2FsbGJhY2sgPSAkJHV0aWxzJCRpc0Z1bmN0aW9uKGNhbGxiYWNrKSxcbiAgICAgICAgICB2YWx1ZSwgZXJyb3IsIHN1Y2NlZWRlZCwgZmFpbGVkO1xuXG4gICAgICBpZiAoaGFzQ2FsbGJhY2spIHtcbiAgICAgICAgdmFsdWUgPSAkJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCk7XG5cbiAgICAgICAgaWYgKHZhbHVlID09PSAkJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SKSB7XG4gICAgICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgICAgICBlcnJvciA9IHZhbHVlLmVycm9yO1xuICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCAkJCRpbnRlcm5hbCQkY2Fubm90UmV0dXJuT3duKCkpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IGRldGFpbDtcbiAgICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSAkJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKGhhc0NhbGxiYWNrICYmIHN1Y2NlZWRlZCkge1xuICAgICAgICAkJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGZhaWxlZCkge1xuICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gJCQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICAkJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09ICQkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UocHJvbWlzZSwgcmVzb2x2ZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmVyKGZ1bmN0aW9uIHJlc29sdmVQcm9taXNlKHZhbHVlKXtcbiAgICAgICAgICAkJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIHJlamVjdFByb21pc2UocmVhc29uKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGVudW1lcmF0b3IkJG1ha2VTZXR0bGVkUmVzdWx0KHN0YXRlLCBwb3NpdGlvbiwgdmFsdWUpIHtcbiAgICAgIGlmIChzdGF0ZSA9PT0gJCQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXRlOiAnZnVsZmlsbGVkJyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdGU6ICdyZWplY3RlZCcsXG4gICAgICAgICAgcmVhc29uOiB2YWx1ZVxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uICQkJGVudW1lcmF0b3IkJEVudW1lcmF0b3IoQ29uc3RydWN0b3IsIGlucHV0LCBhYm9ydE9uUmVqZWN0LCBsYWJlbCkge1xuICAgICAgdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICAgICAgdGhpcy5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKCQkJGludGVybmFsJCRub29wLCBsYWJlbCk7XG4gICAgICB0aGlzLl9hYm9ydE9uUmVqZWN0ID0gYWJvcnRPblJlamVjdDtcblxuICAgICAgaWYgKHRoaXMuX3ZhbGlkYXRlSW5wdXQoaW5wdXQpKSB7XG4gICAgICAgIHRoaXMuX2lucHV0ICAgICA9IGlucHV0O1xuICAgICAgICB0aGlzLmxlbmd0aCAgICAgPSBpbnB1dC5sZW5ndGg7XG4gICAgICAgIHRoaXMuX3JlbWFpbmluZyA9IGlucHV0Lmxlbmd0aDtcblxuICAgICAgICB0aGlzLl9pbml0KCk7XG5cbiAgICAgICAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5sZW5ndGggfHwgMDtcbiAgICAgICAgICB0aGlzLl9lbnVtZXJhdGUoKTtcbiAgICAgICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgICAgICAkJCRpbnRlcm5hbCQkZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHRoaXMucHJvbWlzZSwgdGhpcy5fdmFsaWRhdGlvbkVycm9yKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgICQkJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl92YWxpZGF0ZUlucHV0ID0gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgIHJldHVybiAkJHV0aWxzJCRpc0FycmF5KGlucHV0KTtcbiAgICB9O1xuXG4gICAgJCQkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3ZhbGlkYXRpb25FcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBFcnJvcignQXJyYXkgTWV0aG9kcyBtdXN0IGJlIHByb3ZpZGVkIGFuIEFycmF5Jyk7XG4gICAgfTtcblxuICAgICQkJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLl9yZXN1bHQgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuICAgIH07XG5cbiAgICB2YXIgJCQkZW51bWVyYXRvciQkZGVmYXVsdCA9ICQkJGVudW1lcmF0b3IkJEVudW1lcmF0b3I7XG5cbiAgICAkJCRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZW51bWVyYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGVuZ3RoICA9IHRoaXMubGVuZ3RoO1xuICAgICAgdmFyIHByb21pc2UgPSB0aGlzLnByb21pc2U7XG4gICAgICB2YXIgaW5wdXQgICA9IHRoaXMuX2lucHV0O1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgcHJvbWlzZS5fc3RhdGUgPT09ICQkJGludGVybmFsJCRQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLl9lYWNoRW50cnkoaW5wdXRbaV0sIGkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICAkJCRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZWFjaEVudHJ5ID0gZnVuY3Rpb24oZW50cnksIGkpIHtcbiAgICAgIHZhciBjID0gdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvcjtcbiAgICAgIGlmICgkJHV0aWxzJCRpc01heWJlVGhlbmFibGUoZW50cnkpKSB7XG4gICAgICAgIGlmIChlbnRyeS5jb25zdHJ1Y3RvciA9PT0gYyAmJiBlbnRyeS5fc3RhdGUgIT09ICQkJGludGVybmFsJCRQRU5ESU5HKSB7XG4gICAgICAgICAgZW50cnkuX29uZXJyb3IgPSBudWxsO1xuICAgICAgICAgIHRoaXMuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChjLnJlc29sdmUoZW50cnkpLCBpKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG4gICAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IHRoaXMuX21ha2VSZXN1bHQoJCQkaW50ZXJuYWwkJEZVTEZJTExFRCwgaSwgZW50cnkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICAkJCRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fc2V0dGxlZEF0ID0gZnVuY3Rpb24oc3RhdGUsIGksIHZhbHVlKSB7XG4gICAgICB2YXIgcHJvbWlzZSA9IHRoaXMucHJvbWlzZTtcblxuICAgICAgaWYgKHByb21pc2UuX3N0YXRlID09PSAkJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICB0aGlzLl9yZW1haW5pbmctLTtcblxuICAgICAgICBpZiAodGhpcy5fYWJvcnRPblJlamVjdCAmJiBzdGF0ZSA9PT0gJCQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgICAgJCQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fcmVzdWx0W2ldID0gdGhpcy5fbWFrZVJlc3VsdChzdGF0ZSwgaSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgJCQkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX21ha2VSZXN1bHQgPSBmdW5jdGlvbihzdGF0ZSwgaSwgdmFsdWUpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9O1xuXG4gICAgJCQkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3dpbGxTZXR0bGVBdCA9IGZ1bmN0aW9uKHByb21pc2UsIGkpIHtcbiAgICAgIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICAgICAgJCQkaW50ZXJuYWwkJHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdCgkJCRpbnRlcm5hbCQkRlVMRklMTEVELCBpLCB2YWx1ZSk7XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgZW51bWVyYXRvci5fc2V0dGxlZEF0KCQkJGludGVybmFsJCRSRUpFQ1RFRCwgaSwgcmVhc29uKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICB2YXIgJCRwcm9taXNlJGFsbCQkZGVmYXVsdCA9IGZ1bmN0aW9uIGFsbChlbnRyaWVzLCBsYWJlbCkge1xuICAgICAgcmV0dXJuIG5ldyAkJCRlbnVtZXJhdG9yJCRkZWZhdWx0KHRoaXMsIGVudHJpZXMsIHRydWUgLyogYWJvcnQgb24gcmVqZWN0ICovLCBsYWJlbCkucHJvbWlzZTtcbiAgICB9O1xuXG4gICAgdmFyICQkcHJvbWlzZSRyYWNlJCRkZWZhdWx0ID0gZnVuY3Rpb24gcmFjZShlbnRyaWVzLCBsYWJlbCkge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKCQkJGludGVybmFsJCRub29wLCBsYWJlbCk7XG5cbiAgICAgIGlmICghJCR1dGlscyQkaXNBcnJheShlbnRyaWVzKSkge1xuICAgICAgICAkJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYW4gYXJyYXkgdG8gcmFjZS4nKSk7XG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgfVxuXG4gICAgICB2YXIgbGVuZ3RoID0gZW50cmllcy5sZW5ndGg7XG5cbiAgICAgIGZ1bmN0aW9uIG9uRnVsZmlsbG1lbnQodmFsdWUpIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBvblJlamVjdGlvbihyZWFzb24pIHtcbiAgICAgICAgJCQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBpID0gMDsgcHJvbWlzZS5fc3RhdGUgPT09ICQkJGludGVybmFsJCRQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAkJCRpbnRlcm5hbCQkc3Vic2NyaWJlKENvbnN0cnVjdG9yLnJlc29sdmUoZW50cmllc1tpXSksIHVuZGVmaW5lZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9O1xuXG4gICAgdmFyICQkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0ID0gZnVuY3Rpb24gcmVzb2x2ZShvYmplY3QsIGxhYmVsKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICAgICAgaWYgKG9iamVjdCAmJiB0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJiBvYmplY3QuY29uc3RydWN0b3IgPT09IENvbnN0cnVjdG9yKSB7XG4gICAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKCQkJGludGVybmFsJCRub29wLCBsYWJlbCk7XG4gICAgICAkJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCBvYmplY3QpO1xuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfTtcblxuICAgIHZhciAkJHByb21pc2UkcmVqZWN0JCRkZWZhdWx0ID0gZnVuY3Rpb24gcmVqZWN0KHJlYXNvbiwgbGFiZWwpIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IoJCQkaW50ZXJuYWwkJG5vb3AsIGxhYmVsKTtcbiAgICAgICQkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH07XG5cbiAgICB2YXIgJCRlczYkcHJvbWlzZSRwcm9taXNlJCRjb3VudGVyID0gMDtcblxuICAgIGZ1bmN0aW9uICQkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYSByZXNvbHZlciBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIHByb21pc2UgY29uc3RydWN0b3InKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiAkJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzTmV3KCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ1Byb21pc2UnOiBQbGVhc2UgdXNlIHRoZSAnbmV3JyBvcGVyYXRvciwgdGhpcyBvYmplY3QgY29uc3RydWN0b3IgY2Fubm90IGJlIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLlwiKTtcbiAgICB9XG5cbiAgICB2YXIgJCRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0ID0gJCRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlO1xuXG4gICAgLyoqXG4gICAgICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gICAgICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICAgICAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2XigJlzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZSByZWFzb25cbiAgICAgIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gICAgICBUZXJtaW5vbG9neVxuICAgICAgLS0tLS0tLS0tLS1cblxuICAgICAgLSBgcHJvbWlzZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHdpdGggYSBgdGhlbmAgbWV0aG9kIHdob3NlIGJlaGF2aW9yIGNvbmZvcm1zIHRvIHRoaXMgc3BlY2lmaWNhdGlvbi5cbiAgICAgIC0gYHRoZW5hYmxlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gdGhhdCBkZWZpbmVzIGEgYHRoZW5gIG1ldGhvZC5cbiAgICAgIC0gYHZhbHVlYCBpcyBhbnkgbGVnYWwgSmF2YVNjcmlwdCB2YWx1ZSAoaW5jbHVkaW5nIHVuZGVmaW5lZCwgYSB0aGVuYWJsZSwgb3IgYSBwcm9taXNlKS5cbiAgICAgIC0gYGV4Y2VwdGlvbmAgaXMgYSB2YWx1ZSB0aGF0IGlzIHRocm93biB1c2luZyB0aGUgdGhyb3cgc3RhdGVtZW50LlxuICAgICAgLSBgcmVhc29uYCBpcyBhIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoeSBhIHByb21pc2Ugd2FzIHJlamVjdGVkLlxuICAgICAgLSBgc2V0dGxlZGAgdGhlIGZpbmFsIHJlc3Rpbmcgc3RhdGUgb2YgYSBwcm9taXNlLCBmdWxmaWxsZWQgb3IgcmVqZWN0ZWQuXG5cbiAgICAgIEEgcHJvbWlzZSBjYW4gYmUgaW4gb25lIG9mIHRocmVlIHN0YXRlczogcGVuZGluZywgZnVsZmlsbGVkLCBvciByZWplY3RlZC5cblxuICAgICAgUHJvbWlzZXMgdGhhdCBhcmUgZnVsZmlsbGVkIGhhdmUgYSBmdWxmaWxsbWVudCB2YWx1ZSBhbmQgYXJlIGluIHRoZSBmdWxmaWxsZWRcbiAgICAgIHN0YXRlLiAgUHJvbWlzZXMgdGhhdCBhcmUgcmVqZWN0ZWQgaGF2ZSBhIHJlamVjdGlvbiByZWFzb24gYW5kIGFyZSBpbiB0aGVcbiAgICAgIHJlamVjdGVkIHN0YXRlLiAgQSBmdWxmaWxsbWVudCB2YWx1ZSBpcyBuZXZlciBhIHRoZW5hYmxlLlxuXG4gICAgICBQcm9taXNlcyBjYW4gYWxzbyBiZSBzYWlkIHRvICpyZXNvbHZlKiBhIHZhbHVlLiAgSWYgdGhpcyB2YWx1ZSBpcyBhbHNvIGFcbiAgICAgIHByb21pc2UsIHRoZW4gdGhlIG9yaWdpbmFsIHByb21pc2UncyBzZXR0bGVkIHN0YXRlIHdpbGwgbWF0Y2ggdGhlIHZhbHVlJ3NcbiAgICAgIHNldHRsZWQgc3RhdGUuICBTbyBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2lsbFxuICAgICAgaXRzZWxmIHJlamVjdCwgYW5kIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgd2lsbFxuICAgICAgaXRzZWxmIGZ1bGZpbGwuXG5cblxuICAgICAgQmFzaWMgVXNhZ2U6XG4gICAgICAtLS0tLS0tLS0tLS1cblxuICAgICAgYGBganNcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgIC8vIG9uIHN1Y2Nlc3NcbiAgICAgICAgcmVzb2x2ZSh2YWx1ZSk7XG5cbiAgICAgICAgLy8gb24gZmFpbHVyZVxuICAgICAgICByZWplY3QocmVhc29uKTtcbiAgICAgIH0pO1xuXG4gICAgICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAvLyBvbiByZWplY3Rpb25cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFkdmFuY2VkIFVzYWdlOlxuICAgICAgLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFByb21pc2VzIHNoaW5lIHdoZW4gYWJzdHJhY3RpbmcgYXdheSBhc3luY2hyb25vdXMgaW50ZXJhY3Rpb25zIHN1Y2ggYXNcbiAgICAgIGBYTUxIdHRwUmVxdWVzdGBzLlxuXG4gICAgICBgYGBqc1xuICAgICAgZnVuY3Rpb24gZ2V0SlNPTih1cmwpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG4gICAgICAgICAgeGhyLm9wZW4oJ0dFVCcsIHVybCk7XG4gICAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGhhbmRsZXI7XG4gICAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcbiAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcbiAgICAgICAgICB4aHIuc2VuZCgpO1xuXG4gICAgICAgICAgZnVuY3Rpb24gaGFuZGxlcigpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IHRoaXMuRE9ORSkge1xuICAgICAgICAgICAgICBpZiAodGhpcy5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUodGhpcy5yZXNwb25zZSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignZ2V0SlNPTjogYCcgKyB1cmwgKyAnYCBmYWlsZWQgd2l0aCBzdGF0dXM6IFsnICsgdGhpcy5zdGF0dXMgKyAnXScpKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBnZXRKU09OKCcvcG9zdHMuanNvbicpLnRoZW4oZnVuY3Rpb24oanNvbikge1xuICAgICAgICAvLyBvbiBmdWxmaWxsbWVudFxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIC8vIG9uIHJlamVjdGlvblxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgVW5saWtlIGNhbGxiYWNrcywgcHJvbWlzZXMgYXJlIGdyZWF0IGNvbXBvc2FibGUgcHJpbWl0aXZlcy5cblxuICAgICAgYGBganNcbiAgICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgZ2V0SlNPTignL3Bvc3RzJyksXG4gICAgICAgIGdldEpTT04oJy9jb21tZW50cycpXG4gICAgICBdKS50aGVuKGZ1bmN0aW9uKHZhbHVlcyl7XG4gICAgICAgIHZhbHVlc1swXSAvLyA9PiBwb3N0c0pTT05cbiAgICAgICAgdmFsdWVzWzFdIC8vID0+IGNvbW1lbnRzSlNPTlxuXG4gICAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAY2xhc3MgUHJvbWlzZVxuICAgICAgQHBhcmFtIHtmdW5jdGlvbn0gcmVzb2x2ZXJcbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEBjb25zdHJ1Y3RvclxuICAgICovXG4gICAgZnVuY3Rpb24gJCRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKHJlc29sdmVyKSB7XG4gICAgICB0aGlzLl9pZCA9ICQkZXM2JHByb21pc2UkcHJvbWlzZSQkY291bnRlcisrO1xuICAgICAgdGhpcy5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9yZXN1bHQgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9zdWJzY3JpYmVycyA9IFtdO1xuXG4gICAgICBpZiAoJCQkaW50ZXJuYWwkJG5vb3AgIT09IHJlc29sdmVyKSB7XG4gICAgICAgIGlmICghJCR1dGlscyQkaXNGdW5jdGlvbihyZXNvbHZlcikpIHtcbiAgICAgICAgICAkJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzUmVzb2x2ZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiAkJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UpKSB7XG4gICAgICAgICAgJCRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpO1xuICAgICAgICB9XG5cbiAgICAgICAgJCQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHRoaXMsIHJlc29sdmVyKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAkJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuYWxsID0gJCRwcm9taXNlJGFsbCQkZGVmYXVsdDtcbiAgICAkJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucmFjZSA9ICQkcHJvbWlzZSRyYWNlJCRkZWZhdWx0O1xuICAgICQkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZXNvbHZlID0gJCRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQ7XG4gICAgJCRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJlamVjdCA9ICQkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQ7XG5cbiAgICAkJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucHJvdG90eXBlID0ge1xuICAgICAgY29uc3RydWN0b3I6ICQkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZSxcblxuICAgIC8qKlxuICAgICAgVGhlIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsXG4gICAgICB3aGljaCByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZVxuICAgICAgcmVhc29uIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uKHVzZXIpe1xuICAgICAgICAvLyB1c2VyIGlzIGF2YWlsYWJsZVxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gdXNlciBpcyB1bmF2YWlsYWJsZSwgYW5kIHlvdSBhcmUgZ2l2ZW4gdGhlIHJlYXNvbiB3aHlcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIENoYWluaW5nXG4gICAgICAtLS0tLS0tLVxuXG4gICAgICBUaGUgcmV0dXJuIHZhbHVlIG9mIGB0aGVuYCBpcyBpdHNlbGYgYSBwcm9taXNlLiAgVGhpcyBzZWNvbmQsICdkb3duc3RyZWFtJ1xuICAgICAgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZpcnN0IHByb21pc2UncyBmdWxmaWxsbWVudFxuICAgICAgb3IgcmVqZWN0aW9uIGhhbmRsZXIsIG9yIHJlamVjdGVkIGlmIHRoZSBoYW5kbGVyIHRocm93cyBhbiBleGNlcHRpb24uXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIHVzZXIubmFtZTtcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgcmV0dXJuICdkZWZhdWx0IG5hbWUnO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodXNlck5hbWUpIHtcbiAgICAgICAgLy8gSWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGB1c2VyTmFtZWAgd2lsbCBiZSB0aGUgdXNlcidzIG5hbWUsIG90aGVyd2lzZSBpdFxuICAgICAgICAvLyB3aWxsIGJlIGAnZGVmYXVsdCBuYW1lJ2BcbiAgICAgIH0pO1xuXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScpO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gaWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGByZWFzb25gIHdpbGwgYmUgJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jy5cbiAgICAgICAgLy8gSWYgYGZpbmRVc2VyYCByZWplY3RlZCwgYHJlYXNvbmAgd2lsbCBiZSAnYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScuXG4gICAgICB9KTtcbiAgICAgIGBgYFxuICAgICAgSWYgdGhlIGRvd25zdHJlYW0gcHJvbWlzZSBkb2VzIG5vdCBzcGVjaWZ5IGEgcmVqZWN0aW9uIGhhbmRsZXIsIHJlamVjdGlvbiByZWFzb25zIHdpbGwgYmUgcHJvcGFnYXRlZCBmdXJ0aGVyIGRvd25zdHJlYW0uXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBlZGFnb2dpY2FsRXhjZXB0aW9uKCdVcHN0cmVhbSBlcnJvcicpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBUaGUgYFBlZGdhZ29jaWFsRXhjZXB0aW9uYCBpcyBwcm9wYWdhdGVkIGFsbCB0aGUgd2F5IGRvd24gdG8gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQXNzaW1pbGF0aW9uXG4gICAgICAtLS0tLS0tLS0tLS1cblxuICAgICAgU29tZXRpbWVzIHRoZSB2YWx1ZSB5b3Ugd2FudCB0byBwcm9wYWdhdGUgdG8gYSBkb3duc3RyZWFtIHByb21pc2UgY2FuIG9ubHkgYmVcbiAgICAgIHJldHJpZXZlZCBhc3luY2hyb25vdXNseS4gVGhpcyBjYW4gYmUgYWNoaWV2ZWQgYnkgcmV0dXJuaW5nIGEgcHJvbWlzZSBpbiB0aGVcbiAgICAgIGZ1bGZpbGxtZW50IG9yIHJlamVjdGlvbiBoYW5kbGVyLiBUaGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgdGhlbiBiZSBwZW5kaW5nXG4gICAgICB1bnRpbCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBpcyBzZXR0bGVkLiBUaGlzIGlzIGNhbGxlZCAqYXNzaW1pbGF0aW9uKi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgICAvLyBUaGUgdXNlcidzIGNvbW1lbnRzIGFyZSBub3cgYXZhaWxhYmxlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBJZiB0aGUgYXNzaW1saWF0ZWQgcHJvbWlzZSByZWplY3RzLCB0aGVuIHRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCBhbHNvIHJlamVjdC5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIGZ1bGZpbGxzLCB3ZSdsbCBoYXZlIHRoZSB2YWx1ZSBoZXJlXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgcmVqZWN0cywgd2UnbGwgaGF2ZSB0aGUgcmVhc29uIGhlcmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFNpbXBsZSBFeGFtcGxlXG4gICAgICAtLS0tLS0tLS0tLS0tLVxuXG4gICAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIHZhciByZXN1bHQ7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGZpbmRSZXN1bHQoKTtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfVxuICAgICAgYGBgXG5cbiAgICAgIEVycmJhY2sgRXhhbXBsZVxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFJlc3VsdChmdW5jdGlvbihyZXN1bHQsIGVycil7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAvLyBmYWlsdXJlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBQcm9taXNlIEV4YW1wbGU7XG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIGZpbmRSZXN1bHQoKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFkdmFuY2VkIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIGF1dGhvciwgYm9va3M7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF1dGhvciA9IGZpbmRBdXRob3IoKTtcbiAgICAgICAgYm9va3MgID0gZmluZEJvb2tzQnlBdXRob3IoYXV0aG9yKTtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfVxuICAgICAgYGBgXG5cbiAgICAgIEVycmJhY2sgRXhhbXBsZVxuXG4gICAgICBgYGBqc1xuXG4gICAgICBmdW5jdGlvbiBmb3VuZEJvb2tzKGJvb2tzKSB7XG5cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gZmFpbHVyZShyZWFzb24pIHtcblxuICAgICAgfVxuXG4gICAgICBmaW5kQXV0aG9yKGZ1bmN0aW9uKGF1dGhvciwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAvLyBmYWlsdXJlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZpbmRCb29va3NCeUF1dGhvcihhdXRob3IsIGZ1bmN0aW9uKGJvb2tzLCBlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgZm91bmRCb29rcyhib29rcyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgICAgICAgICAgIGZhaWx1cmUocmVhc29uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBQcm9taXNlIEV4YW1wbGU7XG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIGZpbmRBdXRob3IoKS5cbiAgICAgICAgdGhlbihmaW5kQm9va3NCeUF1dGhvcikuXG4gICAgICAgIHRoZW4oZnVuY3Rpb24oYm9va3Mpe1xuICAgICAgICAgIC8vIGZvdW5kIGJvb2tzXG4gICAgICB9KS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCB0aGVuXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvbkZ1bGZpbGxlZFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZFxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQHJldHVybiB7UHJvbWlzZX1cbiAgICAqL1xuICAgICAgdGhlbjogZnVuY3Rpb24ob25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgICAgICAgdmFyIHBhcmVudCA9IHRoaXM7XG4gICAgICAgIHZhciBzdGF0ZSA9IHBhcmVudC5fc3RhdGU7XG5cbiAgICAgICAgaWYgKHN0YXRlID09PSAkJCRpbnRlcm5hbCQkRlVMRklMTEVEICYmICFvbkZ1bGZpbGxtZW50IHx8IHN0YXRlID09PSAkJCRpbnRlcm5hbCQkUkVKRUNURUQgJiYgIW9uUmVqZWN0aW9uKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2hpbGQgPSBuZXcgdGhpcy5jb25zdHJ1Y3RvcigkJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICAgIHZhciByZXN1bHQgPSBwYXJlbnQuX3Jlc3VsdDtcblxuICAgICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmd1bWVudHNbc3RhdGUgLSAxXTtcbiAgICAgICAgICAkJGFzYXAkJGRlZmF1bHQoZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICQkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCByZXN1bHQpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICQkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNoaWxkO1xuICAgICAgfSxcblxuICAgIC8qKlxuICAgICAgYGNhdGNoYCBpcyBzaW1wbHkgc3VnYXIgZm9yIGB0aGVuKHVuZGVmaW5lZCwgb25SZWplY3Rpb24pYCB3aGljaCBtYWtlcyBpdCB0aGUgc2FtZVxuICAgICAgYXMgdGhlIGNhdGNoIGJsb2NrIG9mIGEgdHJ5L2NhdGNoIHN0YXRlbWVudC5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGZpbmRBdXRob3IoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZG4ndCBmaW5kIHRoYXQgYXV0aG9yJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIHN5bmNocm9ub3VzXG4gICAgICB0cnkge1xuICAgICAgICBmaW5kQXV0aG9yKCk7XG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfVxuXG4gICAgICAvLyBhc3luYyB3aXRoIHByb21pc2VzXG4gICAgICBmaW5kQXV0aG9yKCkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBtZXRob2QgY2F0Y2hcbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0aW9uXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICAnY2F0Y2gnOiBmdW5jdGlvbihvblJlamVjdGlvbikge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyICQkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHQgPSBmdW5jdGlvbiBwb2x5ZmlsbCgpIHtcbiAgICAgIHZhciBsb2NhbDtcblxuICAgICAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGxvY2FsID0gZ2xvYmFsO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cuZG9jdW1lbnQpIHtcbiAgICAgICAgbG9jYWwgPSB3aW5kb3c7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2NhbCA9IHNlbGY7XG4gICAgICB9XG5cbiAgICAgIHZhciBlczZQcm9taXNlU3VwcG9ydCA9XG4gICAgICAgIFwiUHJvbWlzZVwiIGluIGxvY2FsICYmXG4gICAgICAgIC8vIFNvbWUgb2YgdGhlc2UgbWV0aG9kcyBhcmUgbWlzc2luZyBmcm9tXG4gICAgICAgIC8vIEZpcmVmb3gvQ2hyb21lIGV4cGVyaW1lbnRhbCBpbXBsZW1lbnRhdGlvbnNcbiAgICAgICAgXCJyZXNvbHZlXCIgaW4gbG9jYWwuUHJvbWlzZSAmJlxuICAgICAgICBcInJlamVjdFwiIGluIGxvY2FsLlByb21pc2UgJiZcbiAgICAgICAgXCJhbGxcIiBpbiBsb2NhbC5Qcm9taXNlICYmXG4gICAgICAgIFwicmFjZVwiIGluIGxvY2FsLlByb21pc2UgJiZcbiAgICAgICAgLy8gT2xkZXIgdmVyc2lvbiBvZiB0aGUgc3BlYyBoYWQgYSByZXNvbHZlciBvYmplY3RcbiAgICAgICAgLy8gYXMgdGhlIGFyZyByYXRoZXIgdGhhbiBhIGZ1bmN0aW9uXG4gICAgICAgIChmdW5jdGlvbigpIHtcbiAgICAgICAgICB2YXIgcmVzb2x2ZTtcbiAgICAgICAgICBuZXcgbG9jYWwuUHJvbWlzZShmdW5jdGlvbihyKSB7IHJlc29sdmUgPSByOyB9KTtcbiAgICAgICAgICByZXR1cm4gJCR1dGlscyQkaXNGdW5jdGlvbihyZXNvbHZlKTtcbiAgICAgICAgfSgpKTtcblxuICAgICAgaWYgKCFlczZQcm9taXNlU3VwcG9ydCkge1xuICAgICAgICBsb2NhbC5Qcm9taXNlID0gJCRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0O1xuICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlID0ge1xuICAgICAgJ1Byb21pc2UnOiAkJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQsXG4gICAgICAncG9seWZpbGwnOiAkJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0XG4gICAgfTtcblxuICAgIC8qIGdsb2JhbCBkZWZpbmU6dHJ1ZSBtb2R1bGU6dHJ1ZSB3aW5kb3c6IHRydWUgKi9cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmVbJ2FtZCddKSB7XG4gICAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7IH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlWydleHBvcnRzJ10pIHtcbiAgICAgIG1vZHVsZVsnZXhwb3J0cyddID0gZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aGlzWydFUzZQcm9taXNlJ10gPSBlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7XG4gICAgfVxufSkuY2FsbCh0aGlzKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiRDpcXFxcYmlsbHlzRmlsZVxcXFxjb2RlXFxcXGphdmFzY3JpcHRcXFxcbm9kZWpzXFxcXG1vZHVsZXNcXFxcZGVhZHVuaXRDb3JlXFxcXG5vZGVfbW9kdWxlc1xcXFxicm93c2VyaWZ5XFxcXG5vZGVfbW9kdWxlc1xcXFxpbnNlcnQtbW9kdWxlLWdsb2JhbHNcXFxcbm9kZV9tb2R1bGVzXFxcXHByb2Nlc3NcXFxcYnJvd3Nlci5qc1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIC8vIFVuaXZlcnNhbCBNb2R1bGUgRGVmaW5pdGlvbiAoVU1EKSB0byBzdXBwb3J0IEFNRCwgQ29tbW9uSlMvTm9kZS5qcywgUmhpbm8sIGFuZCBicm93c2Vycy5cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZSgnc3RhY2stZ2VuZXJhdG9yJywgWydzdGFja2ZyYW1lJ10sIGZhY3RvcnkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKCdzdGFja2ZyYW1lJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJvb3QuU3RhY2tHZW5lcmF0b3IgPSBmYWN0b3J5KHJvb3QuU3RhY2tGcmFtZSk7XG4gICAgfVxufSh0aGlzLCBmdW5jdGlvbiAoU3RhY2tGcmFtZSkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGJhY2t0cmFjZTogZnVuY3Rpb24gU3RhY2tHZW5lcmF0b3IkJGJhY2t0cmFjZShvcHRzKSB7XG4gICAgICAgICAgICB2YXIgc3RhY2sgPSBbXTtcbiAgICAgICAgICAgIHZhciBtYXhTdGFja1NpemUgPSAxMDtcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBvcHRzID09PSAnb2JqZWN0JyAmJiB0eXBlb2Ygb3B0cy5tYXhTdGFja1NpemUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgbWF4U3RhY2tTaXplID0gb3B0cy5tYXhTdGFja1NpemU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjdXJyID0gYXJndW1lbnRzLmNhbGxlZTtcbiAgICAgICAgICAgIHdoaWxlIChjdXJyICYmIHN0YWNrLmxlbmd0aCA8IG1heFN0YWNrU2l6ZSkge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChjdXJyWydhcmd1bWVudHMnXSk7XG4gICAgICAgICAgICAgICAgaWYgKC9mdW5jdGlvbig/OlxccysoW1xcdyRdKykpK1xccypcXCgvLnRlc3QoY3Vyci50b1N0cmluZygpKSkge1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5wdXNoKG5ldyBTdGFja0ZyYW1lKFJlZ0V4cC4kMSB8fCB1bmRlZmluZWQsIGFyZ3MpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5wdXNoKG5ldyBTdGFja0ZyYW1lKHVuZGVmaW5lZCwgYXJncykpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnIgPSBjdXJyLmNhbGxlcjtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdGFjaztcbiAgICAgICAgfVxuICAgIH07XG59KSk7XG4iLCJhcmd1bWVudHNbNF1bMThdWzBdLmFwcGx5KGV4cG9ydHMsYXJndW1lbnRzKSIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKlxuICogQmFzZWQgb24gdGhlIEJhc2UgNjQgVkxRIGltcGxlbWVudGF0aW9uIGluIENsb3N1cmUgQ29tcGlsZXI6XG4gKiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nsb3N1cmUtY29tcGlsZXIvc291cmNlL2Jyb3dzZS90cnVuay9zcmMvY29tL2dvb2dsZS9kZWJ1Z2dpbmcvc291cmNlbWFwL0Jhc2U2NFZMUS5qYXZhXG4gKlxuICogQ29weXJpZ2h0IDIwMTEgVGhlIENsb3N1cmUgQ29tcGlsZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZVxuICogbWV0OlxuICpcbiAqICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlXG4gKiAgICBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZ1xuICogICAgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkXG4gKiAgICB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEdvb2dsZSBJbmMuIG5vciB0aGUgbmFtZXMgb2YgaXRzXG4gKiAgICBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzIGRlcml2ZWRcbiAqICAgIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTXG4gKiBcIkFTIElTXCIgQU5EIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UXG4gKiBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1JcbiAqIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUXG4gKiBPV05FUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUiBBTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCxcbiAqIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIChJTkNMVURJTkcsIEJVVCBOT1RcbiAqIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7IExPU1MgT0YgVVNFLFxuICogREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT04gQU5ZXG4gKiBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0VcbiAqIE9GIFRISVMgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgdmFyIGJhc2U2NCA9IHJlcXVpcmUoJy4vYmFzZTY0Jyk7XG5cbiAgLy8gQSBzaW5nbGUgYmFzZSA2NCBkaWdpdCBjYW4gY29udGFpbiA2IGJpdHMgb2YgZGF0YS4gRm9yIHRoZSBiYXNlIDY0IHZhcmlhYmxlXG4gIC8vIGxlbmd0aCBxdWFudGl0aWVzIHdlIHVzZSBpbiB0aGUgc291cmNlIG1hcCBzcGVjLCB0aGUgZmlyc3QgYml0IGlzIHRoZSBzaWduLFxuICAvLyB0aGUgbmV4dCBmb3VyIGJpdHMgYXJlIHRoZSBhY3R1YWwgdmFsdWUsIGFuZCB0aGUgNnRoIGJpdCBpcyB0aGVcbiAgLy8gY29udGludWF0aW9uIGJpdC4gVGhlIGNvbnRpbnVhdGlvbiBiaXQgdGVsbHMgdXMgd2hldGhlciB0aGVyZSBhcmUgbW9yZVxuICAvLyBkaWdpdHMgaW4gdGhpcyB2YWx1ZSBmb2xsb3dpbmcgdGhpcyBkaWdpdC5cbiAgLy9cbiAgLy8gICBDb250aW51YXRpb25cbiAgLy8gICB8ICAgIFNpZ25cbiAgLy8gICB8ICAgIHxcbiAgLy8gICBWICAgIFZcbiAgLy8gICAxMDEwMTFcblxuICB2YXIgVkxRX0JBU0VfU0hJRlQgPSA1O1xuXG4gIC8vIGJpbmFyeTogMTAwMDAwXG4gIHZhciBWTFFfQkFTRSA9IDEgPDwgVkxRX0JBU0VfU0hJRlQ7XG5cbiAgLy8gYmluYXJ5OiAwMTExMTFcbiAgdmFyIFZMUV9CQVNFX01BU0sgPSBWTFFfQkFTRSAtIDE7XG5cbiAgLy8gYmluYXJ5OiAxMDAwMDBcbiAgdmFyIFZMUV9DT05USU5VQVRJT05fQklUID0gVkxRX0JBU0U7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGZyb20gYSB0d28tY29tcGxlbWVudCB2YWx1ZSB0byBhIHZhbHVlIHdoZXJlIHRoZSBzaWduIGJpdCBpc1xuICAgKiBwbGFjZWQgaW4gdGhlIGxlYXN0IHNpZ25pZmljYW50IGJpdC4gIEZvciBleGFtcGxlLCBhcyBkZWNpbWFsczpcbiAgICogICAxIGJlY29tZXMgMiAoMTAgYmluYXJ5KSwgLTEgYmVjb21lcyAzICgxMSBiaW5hcnkpXG4gICAqICAgMiBiZWNvbWVzIDQgKDEwMCBiaW5hcnkpLCAtMiBiZWNvbWVzIDUgKDEwMSBiaW5hcnkpXG4gICAqL1xuICBmdW5jdGlvbiB0b1ZMUVNpZ25lZChhVmFsdWUpIHtcbiAgICByZXR1cm4gYVZhbHVlIDwgMFxuICAgICAgPyAoKC1hVmFsdWUpIDw8IDEpICsgMVxuICAgICAgOiAoYVZhbHVlIDw8IDEpICsgMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyB0byBhIHR3by1jb21wbGVtZW50IHZhbHVlIGZyb20gYSB2YWx1ZSB3aGVyZSB0aGUgc2lnbiBiaXQgaXNcbiAgICogcGxhY2VkIGluIHRoZSBsZWFzdCBzaWduaWZpY2FudCBiaXQuICBGb3IgZXhhbXBsZSwgYXMgZGVjaW1hbHM6XG4gICAqICAgMiAoMTAgYmluYXJ5KSBiZWNvbWVzIDEsIDMgKDExIGJpbmFyeSkgYmVjb21lcyAtMVxuICAgKiAgIDQgKDEwMCBiaW5hcnkpIGJlY29tZXMgMiwgNSAoMTAxIGJpbmFyeSkgYmVjb21lcyAtMlxuICAgKi9cbiAgZnVuY3Rpb24gZnJvbVZMUVNpZ25lZChhVmFsdWUpIHtcbiAgICB2YXIgaXNOZWdhdGl2ZSA9IChhVmFsdWUgJiAxKSA9PT0gMTtcbiAgICB2YXIgc2hpZnRlZCA9IGFWYWx1ZSA+PiAxO1xuICAgIHJldHVybiBpc05lZ2F0aXZlXG4gICAgICA/IC1zaGlmdGVkXG4gICAgICA6IHNoaWZ0ZWQ7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgYmFzZSA2NCBWTFEgZW5jb2RlZCB2YWx1ZS5cbiAgICovXG4gIGV4cG9ydHMuZW5jb2RlID0gZnVuY3Rpb24gYmFzZTY0VkxRX2VuY29kZShhVmFsdWUpIHtcbiAgICB2YXIgZW5jb2RlZCA9IFwiXCI7XG4gICAgdmFyIGRpZ2l0O1xuXG4gICAgdmFyIHZscSA9IHRvVkxRU2lnbmVkKGFWYWx1ZSk7XG5cbiAgICBkbyB7XG4gICAgICBkaWdpdCA9IHZscSAmIFZMUV9CQVNFX01BU0s7XG4gICAgICB2bHEgPj4+PSBWTFFfQkFTRV9TSElGVDtcbiAgICAgIGlmICh2bHEgPiAwKSB7XG4gICAgICAgIC8vIFRoZXJlIGFyZSBzdGlsbCBtb3JlIGRpZ2l0cyBpbiB0aGlzIHZhbHVlLCBzbyB3ZSBtdXN0IG1ha2Ugc3VyZSB0aGVcbiAgICAgICAgLy8gY29udGludWF0aW9uIGJpdCBpcyBtYXJrZWQuXG4gICAgICAgIGRpZ2l0IHw9IFZMUV9DT05USU5VQVRJT05fQklUO1xuICAgICAgfVxuICAgICAgZW5jb2RlZCArPSBiYXNlNjQuZW5jb2RlKGRpZ2l0KTtcbiAgICB9IHdoaWxlICh2bHEgPiAwKTtcblxuICAgIHJldHVybiBlbmNvZGVkO1xuICB9O1xuXG4gIC8qKlxuICAgKiBEZWNvZGVzIHRoZSBuZXh0IGJhc2UgNjQgVkxRIHZhbHVlIGZyb20gdGhlIGdpdmVuIHN0cmluZyBhbmQgcmV0dXJucyB0aGVcbiAgICogdmFsdWUgYW5kIHRoZSByZXN0IG9mIHRoZSBzdHJpbmcgdmlhIHRoZSBvdXQgcGFyYW1ldGVyLlxuICAgKi9cbiAgZXhwb3J0cy5kZWNvZGUgPSBmdW5jdGlvbiBiYXNlNjRWTFFfZGVjb2RlKGFTdHIsIGFPdXRQYXJhbSkge1xuICAgIHZhciBpID0gMDtcbiAgICB2YXIgc3RyTGVuID0gYVN0ci5sZW5ndGg7XG4gICAgdmFyIHJlc3VsdCA9IDA7XG4gICAgdmFyIHNoaWZ0ID0gMDtcbiAgICB2YXIgY29udGludWF0aW9uLCBkaWdpdDtcblxuICAgIGRvIHtcbiAgICAgIGlmIChpID49IHN0ckxlbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBtb3JlIGRpZ2l0cyBpbiBiYXNlIDY0IFZMUSB2YWx1ZS5cIik7XG4gICAgICB9XG4gICAgICBkaWdpdCA9IGJhc2U2NC5kZWNvZGUoYVN0ci5jaGFyQXQoaSsrKSk7XG4gICAgICBjb250aW51YXRpb24gPSAhIShkaWdpdCAmIFZMUV9DT05USU5VQVRJT05fQklUKTtcbiAgICAgIGRpZ2l0ICY9IFZMUV9CQVNFX01BU0s7XG4gICAgICByZXN1bHQgPSByZXN1bHQgKyAoZGlnaXQgPDwgc2hpZnQpO1xuICAgICAgc2hpZnQgKz0gVkxRX0JBU0VfU0hJRlQ7XG4gICAgfSB3aGlsZSAoY29udGludWF0aW9uKTtcblxuICAgIGFPdXRQYXJhbS52YWx1ZSA9IGZyb21WTFFTaWduZWQocmVzdWx0KTtcbiAgICBhT3V0UGFyYW0ucmVzdCA9IGFTdHIuc2xpY2UoaSk7XG4gIH07XG5cbn0pO1xuIiwiYXJndW1lbnRzWzRdWzIwXVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIC8qKlxuICAgKiBSZWN1cnNpdmUgaW1wbGVtZW50YXRpb24gb2YgYmluYXJ5IHNlYXJjaC5cbiAgICpcbiAgICogQHBhcmFtIGFMb3cgSW5kaWNlcyBoZXJlIGFuZCBsb3dlciBkbyBub3QgY29udGFpbiB0aGUgbmVlZGxlLlxuICAgKiBAcGFyYW0gYUhpZ2ggSW5kaWNlcyBoZXJlIGFuZCBoaWdoZXIgZG8gbm90IGNvbnRhaW4gdGhlIG5lZWRsZS5cbiAgICogQHBhcmFtIGFOZWVkbGUgVGhlIGVsZW1lbnQgYmVpbmcgc2VhcmNoZWQgZm9yLlxuICAgKiBAcGFyYW0gYUhheXN0YWNrIFRoZSBub24tZW1wdHkgYXJyYXkgYmVpbmcgc2VhcmNoZWQuXG4gICAqIEBwYXJhbSBhQ29tcGFyZSBGdW5jdGlvbiB3aGljaCB0YWtlcyB0d28gZWxlbWVudHMgYW5kIHJldHVybnMgLTEsIDAsIG9yIDEuXG4gICAqL1xuICBmdW5jdGlvbiByZWN1cnNpdmVTZWFyY2goYUxvdywgYUhpZ2gsIGFOZWVkbGUsIGFIYXlzdGFjaywgYUNvbXBhcmUpIHtcbiAgICAvLyBUaGlzIGZ1bmN0aW9uIHRlcm1pbmF0ZXMgd2hlbiBvbmUgb2YgdGhlIGZvbGxvd2luZyBpcyB0cnVlOlxuICAgIC8vXG4gICAgLy8gICAxLiBXZSBmaW5kIHRoZSBleGFjdCBlbGVtZW50IHdlIGFyZSBsb29raW5nIGZvci5cbiAgICAvL1xuICAgIC8vICAgMi4gV2UgZGlkIG5vdCBmaW5kIHRoZSBleGFjdCBlbGVtZW50LCBidXQgd2UgY2FuIHJldHVybiB0aGUgaW5kZXggb2ZcbiAgICAvLyAgICAgIHRoZSBuZXh0IGNsb3Nlc3QgZWxlbWVudCB0aGF0IGlzIGxlc3MgdGhhbiB0aGF0IGVsZW1lbnQuXG4gICAgLy9cbiAgICAvLyAgIDMuIFdlIGRpZCBub3QgZmluZCB0aGUgZXhhY3QgZWxlbWVudCwgYW5kIHRoZXJlIGlzIG5vIG5leHQtY2xvc2VzdFxuICAgIC8vICAgICAgZWxlbWVudCB3aGljaCBpcyBsZXNzIHRoYW4gdGhlIG9uZSB3ZSBhcmUgc2VhcmNoaW5nIGZvciwgc28gd2VcbiAgICAvLyAgICAgIHJldHVybiAtMS5cbiAgICB2YXIgbWlkID0gTWF0aC5mbG9vcigoYUhpZ2ggLSBhTG93KSAvIDIpICsgYUxvdztcbiAgICB2YXIgY21wID0gYUNvbXBhcmUoYU5lZWRsZSwgYUhheXN0YWNrW21pZF0sIHRydWUpO1xuICAgIGlmIChjbXAgPT09IDApIHtcbiAgICAgIC8vIEZvdW5kIHRoZSBlbGVtZW50IHdlIGFyZSBsb29raW5nIGZvci5cbiAgICAgIHJldHVybiBtaWQ7XG4gICAgfVxuICAgIGVsc2UgaWYgKGNtcCA+IDApIHtcbiAgICAgIC8vIGFIYXlzdGFja1ttaWRdIGlzIGdyZWF0ZXIgdGhhbiBvdXIgbmVlZGxlLlxuICAgICAgaWYgKGFIaWdoIC0gbWlkID4gMSkge1xuICAgICAgICAvLyBUaGUgZWxlbWVudCBpcyBpbiB0aGUgdXBwZXIgaGFsZi5cbiAgICAgICAgcmV0dXJuIHJlY3Vyc2l2ZVNlYXJjaChtaWQsIGFIaWdoLCBhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKTtcbiAgICAgIH1cbiAgICAgIC8vIFdlIGRpZCBub3QgZmluZCBhbiBleGFjdCBtYXRjaCwgcmV0dXJuIHRoZSBuZXh0IGNsb3Nlc3Qgb25lXG4gICAgICAvLyAodGVybWluYXRpb24gY2FzZSAyKS5cbiAgICAgIHJldHVybiBtaWQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgLy8gYUhheXN0YWNrW21pZF0gaXMgbGVzcyB0aGFuIG91ciBuZWVkbGUuXG4gICAgICBpZiAobWlkIC0gYUxvdyA+IDEpIHtcbiAgICAgICAgLy8gVGhlIGVsZW1lbnQgaXMgaW4gdGhlIGxvd2VyIGhhbGYuXG4gICAgICAgIHJldHVybiByZWN1cnNpdmVTZWFyY2goYUxvdywgbWlkLCBhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKTtcbiAgICAgIH1cbiAgICAgIC8vIFRoZSBleGFjdCBuZWVkbGUgZWxlbWVudCB3YXMgbm90IGZvdW5kIGluIHRoaXMgaGF5c3RhY2suIERldGVybWluZSBpZlxuICAgICAgLy8gd2UgYXJlIGluIHRlcm1pbmF0aW9uIGNhc2UgKDIpIG9yICgzKSBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSB0aGluZy5cbiAgICAgIHJldHVybiBhTG93IDwgMCA/IC0xIDogYUxvdztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBpcyBhbiBpbXBsZW1lbnRhdGlvbiBvZiBiaW5hcnkgc2VhcmNoIHdoaWNoIHdpbGwgYWx3YXlzIHRyeSBhbmQgcmV0dXJuXG4gICAqIHRoZSBpbmRleCBvZiBuZXh0IGxvd2VzdCB2YWx1ZSBjaGVja2VkIGlmIHRoZXJlIGlzIG5vIGV4YWN0IGhpdC4gVGhpcyBpc1xuICAgKiBiZWNhdXNlIG1hcHBpbmdzIGJldHdlZW4gb3JpZ2luYWwgYW5kIGdlbmVyYXRlZCBsaW5lL2NvbCBwYWlycyBhcmUgc2luZ2xlXG4gICAqIHBvaW50cywgYW5kIHRoZXJlIGlzIGFuIGltcGxpY2l0IHJlZ2lvbiBiZXR3ZWVuIGVhY2ggb2YgdGhlbSwgc28gYSBtaXNzXG4gICAqIGp1c3QgbWVhbnMgdGhhdCB5b3UgYXJlbid0IG9uIHRoZSB2ZXJ5IHN0YXJ0IG9mIGEgcmVnaW9uLlxuICAgKlxuICAgKiBAcGFyYW0gYU5lZWRsZSBUaGUgZWxlbWVudCB5b3UgYXJlIGxvb2tpbmcgZm9yLlxuICAgKiBAcGFyYW0gYUhheXN0YWNrIFRoZSBhcnJheSB0aGF0IGlzIGJlaW5nIHNlYXJjaGVkLlxuICAgKiBAcGFyYW0gYUNvbXBhcmUgQSBmdW5jdGlvbiB3aGljaCB0YWtlcyB0aGUgbmVlZGxlIGFuZCBhbiBlbGVtZW50IGluIHRoZVxuICAgKiAgICAgYXJyYXkgYW5kIHJldHVybnMgLTEsIDAsIG9yIDEgZGVwZW5kaW5nIG9uIHdoZXRoZXIgdGhlIG5lZWRsZSBpcyBsZXNzXG4gICAqICAgICB0aGFuLCBlcXVhbCB0bywgb3IgZ3JlYXRlciB0aGFuIHRoZSBlbGVtZW50LCByZXNwZWN0aXZlbHkuXG4gICAqL1xuICBleHBvcnRzLnNlYXJjaCA9IGZ1bmN0aW9uIHNlYXJjaChhTmVlZGxlLCBhSGF5c3RhY2ssIGFDb21wYXJlKSB7XG4gICAgaWYgKGFIYXlzdGFjay5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiAtMTtcbiAgICB9XG4gICAgcmV0dXJuIHJlY3Vyc2l2ZVNlYXJjaCgtMSwgYUhheXN0YWNrLmxlbmd0aCwgYU5lZWRsZSwgYUhheXN0YWNrLCBhQ29tcGFyZSlcbiAgfTtcblxufSk7XG4iLCIvKiAtKi0gTW9kZToganM7IGpzLWluZGVudC1sZXZlbDogMjsgLSotICovXG4vKlxuICogQ29weXJpZ2h0IDIwMTEgTW96aWxsYSBGb3VuZGF0aW9uIGFuZCBjb250cmlidXRvcnNcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBOZXcgQlNEIGxpY2Vuc2UuIFNlZSBMSUNFTlNFIG9yOlxuICogaHR0cDovL29wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL0JTRC0zLUNsYXVzZVxuICovXG5pZiAodHlwZW9mIGRlZmluZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBkZWZpbmUgPSByZXF1aXJlKCdhbWRlZmluZScpKG1vZHVsZSwgcmVxdWlyZSk7XG59XG5kZWZpbmUoZnVuY3Rpb24gKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuXG4gIHZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG4gIHZhciBiaW5hcnlTZWFyY2ggPSByZXF1aXJlKCcuL2JpbmFyeS1zZWFyY2gnKTtcbiAgdmFyIEFycmF5U2V0ID0gcmVxdWlyZSgnLi9hcnJheS1zZXQnKS5BcnJheVNldDtcbiAgdmFyIGJhc2U2NFZMUSA9IHJlcXVpcmUoJy4vYmFzZTY0LXZscScpO1xuXG4gIC8qKlxuICAgKiBBIFNvdXJjZU1hcENvbnN1bWVyIGluc3RhbmNlIHJlcHJlc2VudHMgYSBwYXJzZWQgc291cmNlIG1hcCB3aGljaCB3ZSBjYW5cbiAgICogcXVlcnkgZm9yIGluZm9ybWF0aW9uIGFib3V0IHRoZSBvcmlnaW5hbCBmaWxlIHBvc2l0aW9ucyBieSBnaXZpbmcgaXQgYSBmaWxlXG4gICAqIHBvc2l0aW9uIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLlxuICAgKlxuICAgKiBUaGUgb25seSBwYXJhbWV0ZXIgaXMgdGhlIHJhdyBzb3VyY2UgbWFwIChlaXRoZXIgYXMgYSBKU09OIHN0cmluZywgb3JcbiAgICogYWxyZWFkeSBwYXJzZWQgdG8gYW4gb2JqZWN0KS4gQWNjb3JkaW5nIHRvIHRoZSBzcGVjLCBzb3VyY2UgbWFwcyBoYXZlIHRoZVxuICAgKiBmb2xsb3dpbmcgYXR0cmlidXRlczpcbiAgICpcbiAgICogICAtIHZlcnNpb246IFdoaWNoIHZlcnNpb24gb2YgdGhlIHNvdXJjZSBtYXAgc3BlYyB0aGlzIG1hcCBpcyBmb2xsb3dpbmcuXG4gICAqICAgLSBzb3VyY2VzOiBBbiBhcnJheSBvZiBVUkxzIHRvIHRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZXMuXG4gICAqICAgLSBuYW1lczogQW4gYXJyYXkgb2YgaWRlbnRpZmllcnMgd2hpY2ggY2FuIGJlIHJlZmVycmVuY2VkIGJ5IGluZGl2aWR1YWwgbWFwcGluZ3MuXG4gICAqICAgLSBzb3VyY2VSb290OiBPcHRpb25hbC4gVGhlIFVSTCByb290IGZyb20gd2hpY2ggYWxsIHNvdXJjZXMgYXJlIHJlbGF0aXZlLlxuICAgKiAgIC0gc291cmNlc0NvbnRlbnQ6IE9wdGlvbmFsLiBBbiBhcnJheSBvZiBjb250ZW50cyBvZiB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGVzLlxuICAgKiAgIC0gbWFwcGluZ3M6IEEgc3RyaW5nIG9mIGJhc2U2NCBWTFFzIHdoaWNoIGNvbnRhaW4gdGhlIGFjdHVhbCBtYXBwaW5ncy5cbiAgICogICAtIGZpbGU6IE9wdGlvbmFsLiBUaGUgZ2VuZXJhdGVkIGZpbGUgdGhpcyBzb3VyY2UgbWFwIGlzIGFzc29jaWF0ZWQgd2l0aC5cbiAgICpcbiAgICogSGVyZSBpcyBhbiBleGFtcGxlIHNvdXJjZSBtYXAsIHRha2VuIGZyb20gdGhlIHNvdXJjZSBtYXAgc3BlY1swXTpcbiAgICpcbiAgICogICAgIHtcbiAgICogICAgICAgdmVyc2lvbiA6IDMsXG4gICAqICAgICAgIGZpbGU6IFwib3V0LmpzXCIsXG4gICAqICAgICAgIHNvdXJjZVJvb3QgOiBcIlwiLFxuICAgKiAgICAgICBzb3VyY2VzOiBbXCJmb28uanNcIiwgXCJiYXIuanNcIl0sXG4gICAqICAgICAgIG5hbWVzOiBbXCJzcmNcIiwgXCJtYXBzXCIsIFwiYXJlXCIsIFwiZnVuXCJdLFxuICAgKiAgICAgICBtYXBwaW5nczogXCJBQSxBQjs7QUJDREU7XCJcbiAgICogICAgIH1cbiAgICpcbiAgICogWzBdOiBodHRwczovL2RvY3MuZ29vZ2xlLmNvbS9kb2N1bWVudC9kLzFVMVJHQWVoUXdSeXBVVG92RjFLUmxwaU9GemUwYi1fMmdjNmZBSDBLWTBrL2VkaXQ/cGxpPTEjXG4gICAqL1xuICBmdW5jdGlvbiBTb3VyY2VNYXBDb25zdW1lcihhU291cmNlTWFwKSB7XG4gICAgdmFyIHNvdXJjZU1hcCA9IGFTb3VyY2VNYXA7XG4gICAgaWYgKHR5cGVvZiBhU291cmNlTWFwID09PSAnc3RyaW5nJykge1xuICAgICAgc291cmNlTWFwID0gSlNPTi5wYXJzZShhU291cmNlTWFwLnJlcGxhY2UoL15cXClcXF1cXH0nLywgJycpKTtcbiAgICB9XG5cbiAgICB2YXIgdmVyc2lvbiA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3ZlcnNpb24nKTtcbiAgICB2YXIgc291cmNlcyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZXMnKTtcbiAgICAvLyBTYXNzIDMuMyBsZWF2ZXMgb3V0IHRoZSAnbmFtZXMnIGFycmF5LCBzbyB3ZSBkZXZpYXRlIGZyb20gdGhlIHNwZWMgKHdoaWNoXG4gICAgLy8gcmVxdWlyZXMgdGhlIGFycmF5KSB0byBwbGF5IG5pY2UgaGVyZS5cbiAgICB2YXIgbmFtZXMgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICduYW1lcycsIFtdKTtcbiAgICB2YXIgc291cmNlUm9vdCA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ3NvdXJjZVJvb3QnLCBudWxsKTtcbiAgICB2YXIgc291cmNlc0NvbnRlbnQgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICdzb3VyY2VzQ29udGVudCcsIG51bGwpO1xuICAgIHZhciBtYXBwaW5ncyA9IHV0aWwuZ2V0QXJnKHNvdXJjZU1hcCwgJ21hcHBpbmdzJyk7XG4gICAgdmFyIGZpbGUgPSB1dGlsLmdldEFyZyhzb3VyY2VNYXAsICdmaWxlJywgbnVsbCk7XG5cbiAgICAvLyBPbmNlIGFnYWluLCBTYXNzIGRldmlhdGVzIGZyb20gdGhlIHNwZWMgYW5kIHN1cHBsaWVzIHRoZSB2ZXJzaW9uIGFzIGFcbiAgICAvLyBzdHJpbmcgcmF0aGVyIHRoYW4gYSBudW1iZXIsIHNvIHdlIHVzZSBsb29zZSBlcXVhbGl0eSBjaGVja2luZyBoZXJlLlxuICAgIGlmICh2ZXJzaW9uICE9IHRoaXMuX3ZlcnNpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgdmVyc2lvbjogJyArIHZlcnNpb24pO1xuICAgIH1cblxuICAgIC8vIFNvbWUgc291cmNlIG1hcHMgcHJvZHVjZSByZWxhdGl2ZSBzb3VyY2UgcGF0aHMgbGlrZSBcIi4vZm9vLmpzXCIgaW5zdGVhZCBvZlxuICAgIC8vIFwiZm9vLmpzXCIuICBOb3JtYWxpemUgdGhlc2UgZmlyc3Qgc28gdGhhdCBmdXR1cmUgY29tcGFyaXNvbnMgd2lsbCBzdWNjZWVkLlxuICAgIC8vIFNlZSBidWd6aWwubGEvMTA5MDc2OC5cbiAgICBzb3VyY2VzID0gc291cmNlcy5tYXAodXRpbC5ub3JtYWxpemUpO1xuXG4gICAgLy8gUGFzcyBgdHJ1ZWAgYmVsb3cgdG8gYWxsb3cgZHVwbGljYXRlIG5hbWVzIGFuZCBzb3VyY2VzLiBXaGlsZSBzb3VyY2UgbWFwc1xuICAgIC8vIGFyZSBpbnRlbmRlZCB0byBiZSBjb21wcmVzc2VkIGFuZCBkZWR1cGxpY2F0ZWQsIHRoZSBUeXBlU2NyaXB0IGNvbXBpbGVyXG4gICAgLy8gc29tZXRpbWVzIGdlbmVyYXRlcyBzb3VyY2UgbWFwcyB3aXRoIGR1cGxpY2F0ZXMgaW4gdGhlbS4gU2VlIEdpdGh1YiBpc3N1ZVxuICAgIC8vICM3MiBhbmQgYnVnemlsLmxhLzg4OTQ5Mi5cbiAgICB0aGlzLl9uYW1lcyA9IEFycmF5U2V0LmZyb21BcnJheShuYW1lcywgdHJ1ZSk7XG4gICAgdGhpcy5fc291cmNlcyA9IEFycmF5U2V0LmZyb21BcnJheShzb3VyY2VzLCB0cnVlKTtcblxuICAgIHRoaXMuc291cmNlUm9vdCA9IHNvdXJjZVJvb3Q7XG4gICAgdGhpcy5zb3VyY2VzQ29udGVudCA9IHNvdXJjZXNDb250ZW50O1xuICAgIHRoaXMuX21hcHBpbmdzID0gbWFwcGluZ3M7XG4gICAgdGhpcy5maWxlID0gZmlsZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBTb3VyY2VNYXBDb25zdW1lciBmcm9tIGEgU291cmNlTWFwR2VuZXJhdG9yLlxuICAgKlxuICAgKiBAcGFyYW0gU291cmNlTWFwR2VuZXJhdG9yIGFTb3VyY2VNYXBcbiAgICogICAgICAgIFRoZSBzb3VyY2UgbWFwIHRoYXQgd2lsbCBiZSBjb25zdW1lZC5cbiAgICogQHJldHVybnMgU291cmNlTWFwQ29uc3VtZXJcbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLmZyb21Tb3VyY2VNYXAgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2Zyb21Tb3VyY2VNYXAoYVNvdXJjZU1hcCkge1xuICAgICAgdmFyIHNtYyA9IE9iamVjdC5jcmVhdGUoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlKTtcblxuICAgICAgc21jLl9uYW1lcyA9IEFycmF5U2V0LmZyb21BcnJheShhU291cmNlTWFwLl9uYW1lcy50b0FycmF5KCksIHRydWUpO1xuICAgICAgc21jLl9zb3VyY2VzID0gQXJyYXlTZXQuZnJvbUFycmF5KGFTb3VyY2VNYXAuX3NvdXJjZXMudG9BcnJheSgpLCB0cnVlKTtcbiAgICAgIHNtYy5zb3VyY2VSb290ID0gYVNvdXJjZU1hcC5fc291cmNlUm9vdDtcbiAgICAgIHNtYy5zb3VyY2VzQ29udGVudCA9IGFTb3VyY2VNYXAuX2dlbmVyYXRlU291cmNlc0NvbnRlbnQoc21jLl9zb3VyY2VzLnRvQXJyYXkoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc21jLnNvdXJjZVJvb3QpO1xuICAgICAgc21jLmZpbGUgPSBhU291cmNlTWFwLl9maWxlO1xuXG4gICAgICBzbWMuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IGFTb3VyY2VNYXAuX21hcHBpbmdzLnRvQXJyYXkoKS5zbGljZSgpO1xuICAgICAgc21jLl9fb3JpZ2luYWxNYXBwaW5ncyA9IGFTb3VyY2VNYXAuX21hcHBpbmdzLnRvQXJyYXkoKS5zbGljZSgpXG4gICAgICAgIC5zb3J0KHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuXG4gICAgICByZXR1cm4gc21jO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIFRoZSB2ZXJzaW9uIG9mIHRoZSBzb3VyY2UgbWFwcGluZyBzcGVjIHRoYXQgd2UgYXJlIGNvbnN1bWluZy5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fdmVyc2lvbiA9IDM7XG5cbiAgLyoqXG4gICAqIFRoZSBsaXN0IG9mIG9yaWdpbmFsIHNvdXJjZXMuXG4gICAqL1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLCAnc291cmNlcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9zb3VyY2VzLnRvQXJyYXkoKS5tYXAoZnVuY3Rpb24gKHMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlUm9vdCAhPSBudWxsID8gdXRpbC5qb2luKHRoaXMuc291cmNlUm9vdCwgcykgOiBzO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfVxuICB9KTtcblxuICAvLyBgX19nZW5lcmF0ZWRNYXBwaW5nc2AgYW5kIGBfX29yaWdpbmFsTWFwcGluZ3NgIGFyZSBhcnJheXMgdGhhdCBob2xkIHRoZVxuICAvLyBwYXJzZWQgbWFwcGluZyBjb29yZGluYXRlcyBmcm9tIHRoZSBzb3VyY2UgbWFwJ3MgXCJtYXBwaW5nc1wiIGF0dHJpYnV0ZS4gVGhleVxuICAvLyBhcmUgbGF6aWx5IGluc3RhbnRpYXRlZCwgYWNjZXNzZWQgdmlhIHRoZSBgX2dlbmVyYXRlZE1hcHBpbmdzYCBhbmRcbiAgLy8gYF9vcmlnaW5hbE1hcHBpbmdzYCBnZXR0ZXJzIHJlc3BlY3RpdmVseSwgYW5kIHdlIG9ubHkgcGFyc2UgdGhlIG1hcHBpbmdzXG4gIC8vIGFuZCBjcmVhdGUgdGhlc2UgYXJyYXlzIG9uY2UgcXVlcmllZCBmb3IgYSBzb3VyY2UgbG9jYXRpb24uIFdlIGp1bXAgdGhyb3VnaFxuICAvLyB0aGVzZSBob29wcyBiZWNhdXNlIHRoZXJlIGNhbiBiZSBtYW55IHRob3VzYW5kcyBvZiBtYXBwaW5ncywgYW5kIHBhcnNpbmdcbiAgLy8gdGhlbSBpcyBleHBlbnNpdmUsIHNvIHdlIG9ubHkgd2FudCB0byBkbyBpdCBpZiB3ZSBtdXN0LlxuICAvL1xuICAvLyBFYWNoIG9iamVjdCBpbiB0aGUgYXJyYXlzIGlzIG9mIHRoZSBmb3JtOlxuICAvL1xuICAvLyAgICAge1xuICAvLyAgICAgICBnZW5lcmF0ZWRMaW5lOiBUaGUgbGluZSBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBjb2RlLFxuICAvLyAgICAgICBnZW5lcmF0ZWRDb2x1bW46IFRoZSBjb2x1bW4gbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgY29kZSxcbiAgLy8gICAgICAgc291cmNlOiBUaGUgcGF0aCB0byB0aGUgb3JpZ2luYWwgc291cmNlIGZpbGUgdGhhdCBnZW5lcmF0ZWQgdGhpc1xuICAvLyAgICAgICAgICAgICAgIGNodW5rIG9mIGNvZGUsXG4gIC8vICAgICAgIG9yaWdpbmFsTGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBvcmlnaW5hbCBzb3VyY2UgdGhhdFxuICAvLyAgICAgICAgICAgICAgICAgICAgIGNvcnJlc3BvbmRzIHRvIHRoaXMgY2h1bmsgb2YgZ2VuZXJhdGVkIGNvZGUsXG4gIC8vICAgICAgIG9yaWdpbmFsQ29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlIHRoYXRcbiAgLy8gICAgICAgICAgICAgICAgICAgICAgIGNvcnJlc3BvbmRzIHRvIHRoaXMgY2h1bmsgb2YgZ2VuZXJhdGVkIGNvZGUsXG4gIC8vICAgICAgIG5hbWU6IFRoZSBuYW1lIG9mIHRoZSBvcmlnaW5hbCBzeW1ib2wgd2hpY2ggZ2VuZXJhdGVkIHRoaXMgY2h1bmsgb2ZcbiAgLy8gICAgICAgICAgICAgY29kZS5cbiAgLy8gICAgIH1cbiAgLy9cbiAgLy8gQWxsIHByb3BlcnRpZXMgZXhjZXB0IGZvciBgZ2VuZXJhdGVkTGluZWAgYW5kIGBnZW5lcmF0ZWRDb2x1bW5gIGNhbiBiZVxuICAvLyBgbnVsbGAuXG4gIC8vXG4gIC8vIGBfZ2VuZXJhdGVkTWFwcGluZ3NgIGlzIG9yZGVyZWQgYnkgdGhlIGdlbmVyYXRlZCBwb3NpdGlvbnMuXG4gIC8vXG4gIC8vIGBfb3JpZ2luYWxNYXBwaW5nc2AgaXMgb3JkZXJlZCBieSB0aGUgb3JpZ2luYWwgcG9zaXRpb25zLlxuXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fX2dlbmVyYXRlZE1hcHBpbmdzID0gbnVsbDtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZSwgJ19nZW5lcmF0ZWRNYXBwaW5ncycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICghdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzKSB7XG4gICAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wYXJzZU1hcHBpbmdzKHRoaXMuX21hcHBpbmdzLCB0aGlzLnNvdXJjZVJvb3QpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzO1xuICAgIH1cbiAgfSk7XG5cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLl9fb3JpZ2luYWxNYXBwaW5ncyA9IG51bGw7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUsICdfb3JpZ2luYWxNYXBwaW5ncycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICghdGhpcy5fX29yaWdpbmFsTWFwcGluZ3MpIHtcbiAgICAgICAgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzID0gW107XG4gICAgICAgIHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzID0gW107XG4gICAgICAgIHRoaXMuX3BhcnNlTWFwcGluZ3ModGhpcy5fbWFwcGluZ3MsIHRoaXMuc291cmNlUm9vdCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncztcbiAgICB9XG4gIH0pO1xuXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fbmV4dENoYXJJc01hcHBpbmdTZXBhcmF0b3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX25leHRDaGFySXNNYXBwaW5nU2VwYXJhdG9yKGFTdHIpIHtcbiAgICAgIHZhciBjID0gYVN0ci5jaGFyQXQoMCk7XG4gICAgICByZXR1cm4gYyA9PT0gXCI7XCIgfHwgYyA9PT0gXCIsXCI7XG4gICAgfTtcblxuICAvKipcbiAgICogUGFyc2UgdGhlIG1hcHBpbmdzIGluIGEgc3RyaW5nIGluIHRvIGEgZGF0YSBzdHJ1Y3R1cmUgd2hpY2ggd2UgY2FuIGVhc2lseVxuICAgKiBxdWVyeSAodGhlIG9yZGVyZWQgYXJyYXlzIGluIHRoZSBgdGhpcy5fX2dlbmVyYXRlZE1hcHBpbmdzYCBhbmRcbiAgICogYHRoaXMuX19vcmlnaW5hbE1hcHBpbmdzYCBwcm9wZXJ0aWVzKS5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5fcGFyc2VNYXBwaW5ncyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfcGFyc2VNYXBwaW5ncyhhU3RyLCBhU291cmNlUm9vdCkge1xuICAgICAgdmFyIGdlbmVyYXRlZExpbmUgPSAxO1xuICAgICAgdmFyIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgIHZhciBwcmV2aW91c09yaWdpbmFsTGluZSA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IDA7XG4gICAgICB2YXIgcHJldmlvdXNTb3VyY2UgPSAwO1xuICAgICAgdmFyIHByZXZpb3VzTmFtZSA9IDA7XG4gICAgICB2YXIgc3RyID0gYVN0cjtcbiAgICAgIHZhciB0ZW1wID0ge307XG4gICAgICB2YXIgbWFwcGluZztcblxuICAgICAgd2hpbGUgKHN0ci5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChzdHIuY2hhckF0KDApID09PSAnOycpIHtcbiAgICAgICAgICBnZW5lcmF0ZWRMaW5lKys7XG4gICAgICAgICAgc3RyID0gc3RyLnNsaWNlKDEpO1xuICAgICAgICAgIHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdHIuY2hhckF0KDApID09PSAnLCcpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc2xpY2UoMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgbWFwcGluZyA9IHt9O1xuICAgICAgICAgIG1hcHBpbmcuZ2VuZXJhdGVkTGluZSA9IGdlbmVyYXRlZExpbmU7XG5cbiAgICAgICAgICAvLyBHZW5lcmF0ZWQgY29sdW1uLlxuICAgICAgICAgIGJhc2U2NFZMUS5kZWNvZGUoc3RyLCB0ZW1wKTtcbiAgICAgICAgICBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbiA9IHByZXZpb3VzR2VuZXJhdGVkQ29sdW1uICsgdGVtcC52YWx1ZTtcbiAgICAgICAgICBwcmV2aW91c0dlbmVyYXRlZENvbHVtbiA9IG1hcHBpbmcuZ2VuZXJhdGVkQ29sdW1uO1xuICAgICAgICAgIHN0ciA9IHRlbXAucmVzdDtcblxuICAgICAgICAgIGlmIChzdHIubGVuZ3RoID4gMCAmJiAhdGhpcy5fbmV4dENoYXJJc01hcHBpbmdTZXBhcmF0b3Ioc3RyKSkge1xuICAgICAgICAgICAgLy8gT3JpZ2luYWwgc291cmNlLlxuICAgICAgICAgICAgYmFzZTY0VkxRLmRlY29kZShzdHIsIHRlbXApO1xuICAgICAgICAgICAgbWFwcGluZy5zb3VyY2UgPSB0aGlzLl9zb3VyY2VzLmF0KHByZXZpb3VzU291cmNlICsgdGVtcC52YWx1ZSk7XG4gICAgICAgICAgICBwcmV2aW91c1NvdXJjZSArPSB0ZW1wLnZhbHVlO1xuICAgICAgICAgICAgc3RyID0gdGVtcC5yZXN0O1xuICAgICAgICAgICAgaWYgKHN0ci5sZW5ndGggPT09IDAgfHwgdGhpcy5fbmV4dENoYXJJc01hcHBpbmdTZXBhcmF0b3Ioc3RyKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIGEgc291cmNlLCBidXQgbm8gbGluZSBhbmQgY29sdW1uJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9yaWdpbmFsIGxpbmUuXG4gICAgICAgICAgICBiYXNlNjRWTFEuZGVjb2RlKHN0ciwgdGVtcCk7XG4gICAgICAgICAgICBtYXBwaW5nLm9yaWdpbmFsTGluZSA9IHByZXZpb3VzT3JpZ2luYWxMaW5lICsgdGVtcC52YWx1ZTtcbiAgICAgICAgICAgIHByZXZpb3VzT3JpZ2luYWxMaW5lID0gbWFwcGluZy5vcmlnaW5hbExpbmU7XG4gICAgICAgICAgICAvLyBMaW5lcyBhcmUgc3RvcmVkIDAtYmFzZWRcbiAgICAgICAgICAgIG1hcHBpbmcub3JpZ2luYWxMaW5lICs9IDE7XG4gICAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG4gICAgICAgICAgICBpZiAoc3RyLmxlbmd0aCA9PT0gMCB8fCB0aGlzLl9uZXh0Q2hhcklzTWFwcGluZ1NlcGFyYXRvcihzdHIpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRm91bmQgYSBzb3VyY2UgYW5kIGxpbmUsIGJ1dCBubyBjb2x1bW4nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT3JpZ2luYWwgY29sdW1uLlxuICAgICAgICAgICAgYmFzZTY0VkxRLmRlY29kZShzdHIsIHRlbXApO1xuICAgICAgICAgICAgbWFwcGluZy5vcmlnaW5hbENvbHVtbiA9IHByZXZpb3VzT3JpZ2luYWxDb2x1bW4gKyB0ZW1wLnZhbHVlO1xuICAgICAgICAgICAgcHJldmlvdXNPcmlnaW5hbENvbHVtbiA9IG1hcHBpbmcub3JpZ2luYWxDb2x1bW47XG4gICAgICAgICAgICBzdHIgPSB0ZW1wLnJlc3Q7XG5cbiAgICAgICAgICAgIGlmIChzdHIubGVuZ3RoID4gMCAmJiAhdGhpcy5fbmV4dENoYXJJc01hcHBpbmdTZXBhcmF0b3Ioc3RyKSkge1xuICAgICAgICAgICAgICAvLyBPcmlnaW5hbCBuYW1lLlxuICAgICAgICAgICAgICBiYXNlNjRWTFEuZGVjb2RlKHN0ciwgdGVtcCk7XG4gICAgICAgICAgICAgIG1hcHBpbmcubmFtZSA9IHRoaXMuX25hbWVzLmF0KHByZXZpb3VzTmFtZSArIHRlbXAudmFsdWUpO1xuICAgICAgICAgICAgICBwcmV2aW91c05hbWUgKz0gdGVtcC52YWx1ZTtcbiAgICAgICAgICAgICAgc3RyID0gdGVtcC5yZXN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX19nZW5lcmF0ZWRNYXBwaW5ncy5wdXNoKG1hcHBpbmcpO1xuICAgICAgICAgIGlmICh0eXBlb2YgbWFwcGluZy5vcmlnaW5hbExpbmUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncy5wdXNoKG1hcHBpbmcpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLl9fZ2VuZXJhdGVkTWFwcGluZ3Muc29ydCh1dGlsLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyk7XG4gICAgICB0aGlzLl9fb3JpZ2luYWxNYXBwaW5ncy5zb3J0KHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuICAgIH07XG5cbiAgLyoqXG4gICAqIEZpbmQgdGhlIG1hcHBpbmcgdGhhdCBiZXN0IG1hdGNoZXMgdGhlIGh5cG90aGV0aWNhbCBcIm5lZWRsZVwiIG1hcHBpbmcgdGhhdFxuICAgKiB3ZSBhcmUgc2VhcmNoaW5nIGZvciBpbiB0aGUgZ2l2ZW4gXCJoYXlzdGFja1wiIG9mIG1hcHBpbmdzLlxuICAgKi9cbiAgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLl9maW5kTWFwcGluZyA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfZmluZE1hcHBpbmcoYU5lZWRsZSwgYU1hcHBpbmdzLCBhTGluZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYUNvbHVtbk5hbWUsIGFDb21wYXJhdG9yKSB7XG4gICAgICAvLyBUbyByZXR1cm4gdGhlIHBvc2l0aW9uIHdlIGFyZSBzZWFyY2hpbmcgZm9yLCB3ZSBtdXN0IGZpcnN0IGZpbmQgdGhlXG4gICAgICAvLyBtYXBwaW5nIGZvciB0aGUgZ2l2ZW4gcG9zaXRpb24gYW5kIHRoZW4gcmV0dXJuIHRoZSBvcHBvc2l0ZSBwb3NpdGlvbiBpdFxuICAgICAgLy8gcG9pbnRzIHRvLiBCZWNhdXNlIHRoZSBtYXBwaW5ncyBhcmUgc29ydGVkLCB3ZSBjYW4gdXNlIGJpbmFyeSBzZWFyY2ggdG9cbiAgICAgIC8vIGZpbmQgdGhlIGJlc3QgbWFwcGluZy5cblxuICAgICAgaWYgKGFOZWVkbGVbYUxpbmVOYW1lXSA8PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0xpbmUgbXVzdCBiZSBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gMSwgZ290ICdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArIGFOZWVkbGVbYUxpbmVOYW1lXSk7XG4gICAgICB9XG4gICAgICBpZiAoYU5lZWRsZVthQ29sdW1uTmFtZV0gPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0NvbHVtbiBtdXN0IGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byAwLCBnb3QgJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgYU5lZWRsZVthQ29sdW1uTmFtZV0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYmluYXJ5U2VhcmNoLnNlYXJjaChhTmVlZGxlLCBhTWFwcGluZ3MsIGFDb21wYXJhdG9yKTtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBDb21wdXRlIHRoZSBsYXN0IGNvbHVtbiBmb3IgZWFjaCBnZW5lcmF0ZWQgbWFwcGluZy4gVGhlIGxhc3QgY29sdW1uIGlzXG4gICAqIGluY2x1c2l2ZS5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5jb21wdXRlQ29sdW1uU3BhbnMgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2NvbXB1dGVDb2x1bW5TcGFucygpIHtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLl9nZW5lcmF0ZWRNYXBwaW5ncy5sZW5ndGg7ICsraW5kZXgpIHtcbiAgICAgICAgdmFyIG1hcHBpbmcgPSB0aGlzLl9nZW5lcmF0ZWRNYXBwaW5nc1tpbmRleF07XG5cbiAgICAgICAgLy8gTWFwcGluZ3MgZG8gbm90IGNvbnRhaW4gYSBmaWVsZCBmb3IgdGhlIGxhc3QgZ2VuZXJhdGVkIGNvbHVtbnQuIFdlXG4gICAgICAgIC8vIGNhbiBjb21lIHVwIHdpdGggYW4gb3B0aW1pc3RpYyBlc3RpbWF0ZSwgaG93ZXZlciwgYnkgYXNzdW1pbmcgdGhhdFxuICAgICAgICAvLyBtYXBwaW5ncyBhcmUgY29udGlndW91cyAoaS5lLiBnaXZlbiB0d28gY29uc2VjdXRpdmUgbWFwcGluZ3MsIHRoZVxuICAgICAgICAvLyBmaXJzdCBtYXBwaW5nIGVuZHMgd2hlcmUgdGhlIHNlY29uZCBvbmUgc3RhcnRzKS5cbiAgICAgICAgaWYgKGluZGV4ICsgMSA8IHRoaXMuX2dlbmVyYXRlZE1hcHBpbmdzLmxlbmd0aCkge1xuICAgICAgICAgIHZhciBuZXh0TWFwcGluZyA9IHRoaXMuX2dlbmVyYXRlZE1hcHBpbmdzW2luZGV4ICsgMV07XG5cbiAgICAgICAgICBpZiAobWFwcGluZy5nZW5lcmF0ZWRMaW5lID09PSBuZXh0TWFwcGluZy5nZW5lcmF0ZWRMaW5lKSB7XG4gICAgICAgICAgICBtYXBwaW5nLmxhc3RHZW5lcmF0ZWRDb2x1bW4gPSBuZXh0TWFwcGluZy5nZW5lcmF0ZWRDb2x1bW4gLSAxO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhlIGxhc3QgbWFwcGluZyBmb3IgZWFjaCBsaW5lIHNwYW5zIHRoZSBlbnRpcmUgbGluZS5cbiAgICAgICAgbWFwcGluZy5sYXN0R2VuZXJhdGVkQ29sdW1uID0gSW5maW5pdHk7XG4gICAgICB9XG4gICAgfTtcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgb3JpZ2luYWwgc291cmNlLCBsaW5lLCBhbmQgY29sdW1uIGluZm9ybWF0aW9uIGZvciB0aGUgZ2VuZXJhdGVkXG4gICAqIHNvdXJjZSdzIGxpbmUgYW5kIGNvbHVtbiBwb3NpdGlvbnMgcHJvdmlkZWQuIFRoZSBvbmx5IGFyZ3VtZW50IGlzIGFuIG9iamVjdFxuICAgKiB3aXRoIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICpcbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZS5cbiAgICogICAtIGNvbHVtbjogVGhlIGNvbHVtbiBudW1iZXIgaW4gdGhlIGdlbmVyYXRlZCBzb3VyY2UuXG4gICAqXG4gICAqIGFuZCBhbiBvYmplY3QgaXMgcmV0dXJuZWQgd2l0aCB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBzb3VyY2U6IFRoZSBvcmlnaW5hbCBzb3VyY2UgZmlsZSwgb3IgbnVsbC5cbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gbmFtZTogVGhlIG9yaWdpbmFsIGlkZW50aWZpZXIsIG9yIG51bGwuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUub3JpZ2luYWxQb3NpdGlvbkZvciA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfb3JpZ2luYWxQb3NpdGlvbkZvcihhQXJncykge1xuICAgICAgdmFyIG5lZWRsZSA9IHtcbiAgICAgICAgZ2VuZXJhdGVkTGluZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdsaW5lJyksXG4gICAgICAgIGdlbmVyYXRlZENvbHVtbjogdXRpbC5nZXRBcmcoYUFyZ3MsICdjb2x1bW4nKVxuICAgICAgfTtcblxuICAgICAgdmFyIGluZGV4ID0gdGhpcy5fZmluZE1hcHBpbmcobmVlZGxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZ2VuZXJhdGVkTWFwcGluZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdlbmVyYXRlZExpbmVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ2VuZXJhdGVkQ29sdW1uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dGlsLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyk7XG5cbiAgICAgIGlmIChpbmRleCA+PSAwKSB7XG4gICAgICAgIHZhciBtYXBwaW5nID0gdGhpcy5fZ2VuZXJhdGVkTWFwcGluZ3NbaW5kZXhdO1xuXG4gICAgICAgIGlmIChtYXBwaW5nLmdlbmVyYXRlZExpbmUgPT09IG5lZWRsZS5nZW5lcmF0ZWRMaW5lKSB7XG4gICAgICAgICAgdmFyIHNvdXJjZSA9IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdzb3VyY2UnLCBudWxsKTtcbiAgICAgICAgICBpZiAoc291cmNlICE9IG51bGwgJiYgdGhpcy5zb3VyY2VSb290ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHNvdXJjZSA9IHV0aWwuam9pbih0aGlzLnNvdXJjZVJvb3QsIHNvdXJjZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgICAgIGxpbmU6IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdvcmlnaW5hbExpbmUnLCBudWxsKSxcbiAgICAgICAgICAgIGNvbHVtbjogdXRpbC5nZXRBcmcobWFwcGluZywgJ29yaWdpbmFsQ29sdW1uJywgbnVsbCksXG4gICAgICAgICAgICBuYW1lOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnbmFtZScsIG51bGwpXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzb3VyY2U6IG51bGwsXG4gICAgICAgIGxpbmU6IG51bGwsXG4gICAgICAgIGNvbHVtbjogbnVsbCxcbiAgICAgICAgbmFtZTogbnVsbFxuICAgICAgfTtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBvcmlnaW5hbCBzb3VyY2UgY29udGVudC4gVGhlIG9ubHkgYXJndW1lbnQgaXMgdGhlIHVybCBvZiB0aGVcbiAgICogb3JpZ2luYWwgc291cmNlIGZpbGUuIFJldHVybnMgbnVsbCBpZiBubyBvcmlnaW5hbCBzb3VyY2UgY29udGVudCBpc1xuICAgKiBhdmFpbGlibGUuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuc291cmNlQ29udGVudEZvciA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfc291cmNlQ29udGVudEZvcihhU291cmNlKSB7XG4gICAgICBpZiAoIXRoaXMuc291cmNlc0NvbnRlbnQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnNvdXJjZVJvb3QgIT0gbnVsbCkge1xuICAgICAgICBhU291cmNlID0gdXRpbC5yZWxhdGl2ZSh0aGlzLnNvdXJjZVJvb3QsIGFTb3VyY2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fc291cmNlcy5oYXMoYVNvdXJjZSkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKGFTb3VyY2UpXTtcbiAgICAgIH1cblxuICAgICAgdmFyIHVybDtcbiAgICAgIGlmICh0aGlzLnNvdXJjZVJvb3QgIT0gbnVsbFxuICAgICAgICAgICYmICh1cmwgPSB1dGlsLnVybFBhcnNlKHRoaXMuc291cmNlUm9vdCkpKSB7XG4gICAgICAgIC8vIFhYWDogZmlsZTovLyBVUklzIGFuZCBhYnNvbHV0ZSBwYXRocyBsZWFkIHRvIHVuZXhwZWN0ZWQgYmVoYXZpb3IgZm9yXG4gICAgICAgIC8vIG1hbnkgdXNlcnMuIFdlIGNhbiBoZWxwIHRoZW0gb3V0IHdoZW4gdGhleSBleHBlY3QgZmlsZTovLyBVUklzIHRvXG4gICAgICAgIC8vIGJlaGF2ZSBsaWtlIGl0IHdvdWxkIGlmIHRoZXkgd2VyZSBydW5uaW5nIGEgbG9jYWwgSFRUUCBzZXJ2ZXIuIFNlZVxuICAgICAgICAvLyBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD04ODU1OTcuXG4gICAgICAgIHZhciBmaWxlVXJpQWJzUGF0aCA9IGFTb3VyY2UucmVwbGFjZSgvXmZpbGU6XFwvXFwvLywgXCJcIik7XG4gICAgICAgIGlmICh1cmwuc2NoZW1lID09IFwiZmlsZVwiXG4gICAgICAgICAgICAmJiB0aGlzLl9zb3VyY2VzLmhhcyhmaWxlVXJpQWJzUGF0aCkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zb3VyY2VzQ29udGVudFt0aGlzLl9zb3VyY2VzLmluZGV4T2YoZmlsZVVyaUFic1BhdGgpXVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCghdXJsLnBhdGggfHwgdXJsLnBhdGggPT0gXCIvXCIpXG4gICAgICAgICAgICAmJiB0aGlzLl9zb3VyY2VzLmhhcyhcIi9cIiArIGFTb3VyY2UpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlc0NvbnRlbnRbdGhpcy5fc291cmNlcy5pbmRleE9mKFwiL1wiICsgYVNvdXJjZSldO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcignXCInICsgYVNvdXJjZSArICdcIiBpcyBub3QgaW4gdGhlIFNvdXJjZU1hcC4nKTtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBnZW5lcmF0ZWQgbGluZSBhbmQgY29sdW1uIGluZm9ybWF0aW9uIGZvciB0aGUgb3JpZ2luYWwgc291cmNlLFxuICAgKiBsaW5lLCBhbmQgY29sdW1uIHBvc2l0aW9ucyBwcm92aWRlZC4gVGhlIG9ubHkgYXJndW1lbnQgaXMgYW4gb2JqZWN0IHdpdGhcbiAgICogdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gc291cmNlOiBUaGUgZmlsZW5hbWUgb2YgdGhlIG9yaWdpbmFsIHNvdXJjZS5cbiAgICogICAtIGxpbmU6IFRoZSBsaW5lIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgb3JpZ2luYWwgc291cmNlLlxuICAgKlxuICAgKiBhbmQgYW4gb2JqZWN0IGlzIHJldHVybmVkIHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gbGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZSwgb3IgbnVsbC5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5nZW5lcmF0ZWRQb3NpdGlvbkZvciA9XG4gICAgZnVuY3Rpb24gU291cmNlTWFwQ29uc3VtZXJfZ2VuZXJhdGVkUG9zaXRpb25Gb3IoYUFyZ3MpIHtcbiAgICAgIHZhciBuZWVkbGUgPSB7XG4gICAgICAgIHNvdXJjZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdzb3VyY2UnKSxcbiAgICAgICAgb3JpZ2luYWxMaW5lOiB1dGlsLmdldEFyZyhhQXJncywgJ2xpbmUnKSxcbiAgICAgICAgb3JpZ2luYWxDb2x1bW46IHV0aWwuZ2V0QXJnKGFBcmdzLCAnY29sdW1uJylcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLnNvdXJjZVJvb3QgIT0gbnVsbCkge1xuICAgICAgICBuZWVkbGUuc291cmNlID0gdXRpbC5yZWxhdGl2ZSh0aGlzLnNvdXJjZVJvb3QsIG5lZWRsZS5zb3VyY2UpO1xuICAgICAgfVxuXG4gICAgICB2YXIgaW5kZXggPSB0aGlzLl9maW5kTWFwcGluZyhuZWVkbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9vcmlnaW5hbE1hcHBpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJvcmlnaW5hbExpbmVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwib3JpZ2luYWxDb2x1bW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuXG4gICAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICB2YXIgbWFwcGluZyA9IHRoaXMuX29yaWdpbmFsTWFwcGluZ3NbaW5kZXhdO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbGluZTogdXRpbC5nZXRBcmcobWFwcGluZywgJ2dlbmVyYXRlZExpbmUnLCBudWxsKSxcbiAgICAgICAgICBjb2x1bW46IHV0aWwuZ2V0QXJnKG1hcHBpbmcsICdnZW5lcmF0ZWRDb2x1bW4nLCBudWxsKSxcbiAgICAgICAgICBsYXN0Q29sdW1uOiB1dGlsLmdldEFyZyhtYXBwaW5nLCAnbGFzdEdlbmVyYXRlZENvbHVtbicsIG51bGwpXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxpbmU6IG51bGwsXG4gICAgICAgIGNvbHVtbjogbnVsbCxcbiAgICAgICAgbGFzdENvbHVtbjogbnVsbFxuICAgICAgfTtcbiAgICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGFsbCBnZW5lcmF0ZWQgbGluZSBhbmQgY29sdW1uIGluZm9ybWF0aW9uIGZvciB0aGUgb3JpZ2luYWwgc291cmNlXG4gICAqIGFuZCBsaW5lIHByb3ZpZGVkLiBUaGUgb25seSBhcmd1bWVudCBpcyBhbiBvYmplY3Qgd2l0aCB0aGUgZm9sbG93aW5nXG4gICAqIHByb3BlcnRpZXM6XG4gICAqXG4gICAqICAgLSBzb3VyY2U6IFRoZSBmaWxlbmFtZSBvZiB0aGUgb3JpZ2luYWwgc291cmNlLlxuICAgKiAgIC0gbGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBvcmlnaW5hbCBzb3VyY2UuXG4gICAqXG4gICAqIGFuZCBhbiBhcnJheSBvZiBvYmplY3RzIGlzIHJldHVybmVkLCBlYWNoIHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgKlxuICAgKiAgIC0gbGluZTogVGhlIGxpbmUgbnVtYmVyIGluIHRoZSBnZW5lcmF0ZWQgc291cmNlLCBvciBudWxsLlxuICAgKiAgIC0gY29sdW1uOiBUaGUgY29sdW1uIG51bWJlciBpbiB0aGUgZ2VuZXJhdGVkIHNvdXJjZSwgb3IgbnVsbC5cbiAgICovXG4gIFNvdXJjZU1hcENvbnN1bWVyLnByb3RvdHlwZS5hbGxHZW5lcmF0ZWRQb3NpdGlvbnNGb3IgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2FsbEdlbmVyYXRlZFBvc2l0aW9uc0ZvcihhQXJncykge1xuICAgICAgLy8gV2hlbiB0aGVyZSBpcyBubyBleGFjdCBtYXRjaCwgU291cmNlTWFwQ29uc3VtZXIucHJvdG90eXBlLl9maW5kTWFwcGluZ1xuICAgICAgLy8gcmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGNsb3Nlc3QgbWFwcGluZyBsZXNzIHRoYW4gdGhlIG5lZWRsZS4gQnlcbiAgICAgIC8vIHNldHRpbmcgbmVlZGxlLm9yaWdpbmFsQ29sdW1uIHRvIEluZmluaXR5LCB3ZSB0aHVzIGZpbmQgdGhlIGxhc3RcbiAgICAgIC8vIG1hcHBpbmcgZm9yIHRoZSBnaXZlbiBsaW5lLCBwcm92aWRlZCBzdWNoIGEgbWFwcGluZyBleGlzdHMuXG4gICAgICB2YXIgbmVlZGxlID0ge1xuICAgICAgICBzb3VyY2U6IHV0aWwuZ2V0QXJnKGFBcmdzLCAnc291cmNlJyksXG4gICAgICAgIG9yaWdpbmFsTGluZTogdXRpbC5nZXRBcmcoYUFyZ3MsICdsaW5lJyksXG4gICAgICAgIG9yaWdpbmFsQ29sdW1uOiBJbmZpbml0eVxuICAgICAgfTtcblxuICAgICAgaWYgKHRoaXMuc291cmNlUm9vdCAhPSBudWxsKSB7XG4gICAgICAgIG5lZWRsZS5zb3VyY2UgPSB1dGlsLnJlbGF0aXZlKHRoaXMuc291cmNlUm9vdCwgbmVlZGxlLnNvdXJjZSk7XG4gICAgICB9XG5cbiAgICAgIHZhciBtYXBwaW5ncyA9IFtdO1xuXG4gICAgICB2YXIgaW5kZXggPSB0aGlzLl9maW5kTWFwcGluZyhuZWVkbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9vcmlnaW5hbE1hcHBpbmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJvcmlnaW5hbExpbmVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwib3JpZ2luYWxDb2x1bW5cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV0aWwuY29tcGFyZUJ5T3JpZ2luYWxQb3NpdGlvbnMpO1xuICAgICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgdmFyIG1hcHBpbmcgPSB0aGlzLl9vcmlnaW5hbE1hcHBpbmdzW2luZGV4XTtcblxuICAgICAgICB3aGlsZSAobWFwcGluZyAmJiBtYXBwaW5nLm9yaWdpbmFsTGluZSA9PT0gbmVlZGxlLm9yaWdpbmFsTGluZSkge1xuICAgICAgICAgIG1hcHBpbmdzLnB1c2goe1xuICAgICAgICAgICAgbGluZTogdXRpbC5nZXRBcmcobWFwcGluZywgJ2dlbmVyYXRlZExpbmUnLCBudWxsKSxcbiAgICAgICAgICAgIGNvbHVtbjogdXRpbC5nZXRBcmcobWFwcGluZywgJ2dlbmVyYXRlZENvbHVtbicsIG51bGwpLFxuICAgICAgICAgICAgbGFzdENvbHVtbjogdXRpbC5nZXRBcmcobWFwcGluZywgJ2xhc3RHZW5lcmF0ZWRDb2x1bW4nLCBudWxsKVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbWFwcGluZyA9IHRoaXMuX29yaWdpbmFsTWFwcGluZ3NbLS1pbmRleF07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcHBpbmdzLnJldmVyc2UoKTtcbiAgICB9O1xuXG4gIFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUiA9IDE7XG4gIFNvdXJjZU1hcENvbnN1bWVyLk9SSUdJTkFMX09SREVSID0gMjtcblxuICAvKipcbiAgICogSXRlcmF0ZSBvdmVyIGVhY2ggbWFwcGluZyBiZXR3ZWVuIGFuIG9yaWdpbmFsIHNvdXJjZS9saW5lL2NvbHVtbiBhbmQgYVxuICAgKiBnZW5lcmF0ZWQgbGluZS9jb2x1bW4gaW4gdGhpcyBzb3VyY2UgbWFwLlxuICAgKlxuICAgKiBAcGFyYW0gRnVuY3Rpb24gYUNhbGxiYWNrXG4gICAqICAgICAgICBUaGUgZnVuY3Rpb24gdGhhdCBpcyBjYWxsZWQgd2l0aCBlYWNoIG1hcHBpbmcuXG4gICAqIEBwYXJhbSBPYmplY3QgYUNvbnRleHRcbiAgICogICAgICAgIE9wdGlvbmFsLiBJZiBzcGVjaWZpZWQsIHRoaXMgb2JqZWN0IHdpbGwgYmUgdGhlIHZhbHVlIG9mIGB0aGlzYCBldmVyeVxuICAgKiAgICAgICAgdGltZSB0aGF0IGBhQ2FsbGJhY2tgIGlzIGNhbGxlZC5cbiAgICogQHBhcmFtIGFPcmRlclxuICAgKiAgICAgICAgRWl0aGVyIGBTb3VyY2VNYXBDb25zdW1lci5HRU5FUkFURURfT1JERVJgIG9yXG4gICAqICAgICAgICBgU291cmNlTWFwQ29uc3VtZXIuT1JJR0lOQUxfT1JERVJgLiBTcGVjaWZpZXMgd2hldGhlciB5b3Ugd2FudCB0b1xuICAgKiAgICAgICAgaXRlcmF0ZSBvdmVyIHRoZSBtYXBwaW5ncyBzb3J0ZWQgYnkgdGhlIGdlbmVyYXRlZCBmaWxlJ3MgbGluZS9jb2x1bW5cbiAgICogICAgICAgIG9yZGVyIG9yIHRoZSBvcmlnaW5hbCdzIHNvdXJjZS9saW5lL2NvbHVtbiBvcmRlciwgcmVzcGVjdGl2ZWx5LiBEZWZhdWx0cyB0b1xuICAgKiAgICAgICAgYFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUmAuXG4gICAqL1xuICBTb3VyY2VNYXBDb25zdW1lci5wcm90b3R5cGUuZWFjaE1hcHBpbmcgPVxuICAgIGZ1bmN0aW9uIFNvdXJjZU1hcENvbnN1bWVyX2VhY2hNYXBwaW5nKGFDYWxsYmFjaywgYUNvbnRleHQsIGFPcmRlcikge1xuICAgICAgdmFyIGNvbnRleHQgPSBhQ29udGV4dCB8fCBudWxsO1xuICAgICAgdmFyIG9yZGVyID0gYU9yZGVyIHx8IFNvdXJjZU1hcENvbnN1bWVyLkdFTkVSQVRFRF9PUkRFUjtcblxuICAgICAgdmFyIG1hcHBpbmdzO1xuICAgICAgc3dpdGNoIChvcmRlcikge1xuICAgICAgY2FzZSBTb3VyY2VNYXBDb25zdW1lci5HRU5FUkFURURfT1JERVI6XG4gICAgICAgIG1hcHBpbmdzID0gdGhpcy5fZ2VuZXJhdGVkTWFwcGluZ3M7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBTb3VyY2VNYXBDb25zdW1lci5PUklHSU5BTF9PUkRFUjpcbiAgICAgICAgbWFwcGluZ3MgPSB0aGlzLl9vcmlnaW5hbE1hcHBpbmdzO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVua25vd24gb3JkZXIgb2YgaXRlcmF0aW9uLlwiKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHNvdXJjZVJvb3QgPSB0aGlzLnNvdXJjZVJvb3Q7XG4gICAgICBtYXBwaW5ncy5tYXAoZnVuY3Rpb24gKG1hcHBpbmcpIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IG1hcHBpbmcuc291cmNlO1xuICAgICAgICBpZiAoc291cmNlICE9IG51bGwgJiYgc291cmNlUm9vdCAhPSBudWxsKSB7XG4gICAgICAgICAgc291cmNlID0gdXRpbC5qb2luKHNvdXJjZVJvb3QsIHNvdXJjZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzb3VyY2U6IHNvdXJjZSxcbiAgICAgICAgICBnZW5lcmF0ZWRMaW5lOiBtYXBwaW5nLmdlbmVyYXRlZExpbmUsXG4gICAgICAgICAgZ2VuZXJhdGVkQ29sdW1uOiBtYXBwaW5nLmdlbmVyYXRlZENvbHVtbixcbiAgICAgICAgICBvcmlnaW5hbExpbmU6IG1hcHBpbmcub3JpZ2luYWxMaW5lLFxuICAgICAgICAgIG9yaWdpbmFsQ29sdW1uOiBtYXBwaW5nLm9yaWdpbmFsQ29sdW1uLFxuICAgICAgICAgIG5hbWU6IG1hcHBpbmcubmFtZVxuICAgICAgICB9O1xuICAgICAgfSkuZm9yRWFjaChhQ2FsbGJhY2ssIGNvbnRleHQpO1xuICAgIH07XG5cbiAgZXhwb3J0cy5Tb3VyY2VNYXBDb25zdW1lciA9IFNvdXJjZU1hcENvbnN1bWVyO1xuXG59KTtcbiIsIi8qIC0qLSBNb2RlOiBqczsganMtaW5kZW50LWxldmVsOiAyOyAtKi0gKi9cbi8qXG4gKiBDb3B5cmlnaHQgMjAxMSBNb3ppbGxhIEZvdW5kYXRpb24gYW5kIGNvbnRyaWJ1dG9yc1xuICogTGljZW5zZWQgdW5kZXIgdGhlIE5ldyBCU0QgbGljZW5zZS4gU2VlIExJQ0VOU0Ugb3I6XG4gKiBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvQlNELTMtQ2xhdXNlXG4gKi9cbmlmICh0eXBlb2YgZGVmaW5lICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGRlZmluZSA9IHJlcXVpcmUoJ2FtZGVmaW5lJykobW9kdWxlLCByZXF1aXJlKTtcbn1cbmRlZmluZShmdW5jdGlvbiAocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgYSBoZWxwZXIgZnVuY3Rpb24gZm9yIGdldHRpbmcgdmFsdWVzIGZyb20gcGFyYW1ldGVyL29wdGlvbnNcbiAgICogb2JqZWN0cy5cbiAgICpcbiAgICogQHBhcmFtIGFyZ3MgVGhlIG9iamVjdCB3ZSBhcmUgZXh0cmFjdGluZyB2YWx1ZXMgZnJvbVxuICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiB0aGUgcHJvcGVydHkgd2UgYXJlIGdldHRpbmcuXG4gICAqIEBwYXJhbSBkZWZhdWx0VmFsdWUgQW4gb3B0aW9uYWwgdmFsdWUgdG8gcmV0dXJuIGlmIHRoZSBwcm9wZXJ0eSBpcyBtaXNzaW5nXG4gICAqIGZyb20gdGhlIG9iamVjdC4gSWYgdGhpcyBpcyBub3Qgc3BlY2lmaWVkIGFuZCB0aGUgcHJvcGVydHkgaXMgbWlzc2luZywgYW5cbiAgICogZXJyb3Igd2lsbCBiZSB0aHJvd24uXG4gICAqL1xuICBmdW5jdGlvbiBnZXRBcmcoYUFyZ3MsIGFOYW1lLCBhRGVmYXVsdFZhbHVlKSB7XG4gICAgaWYgKGFOYW1lIGluIGFBcmdzKSB7XG4gICAgICByZXR1cm4gYUFyZ3NbYU5hbWVdO1xuICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgcmV0dXJuIGFEZWZhdWx0VmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignXCInICsgYU5hbWUgKyAnXCIgaXMgYSByZXF1aXJlZCBhcmd1bWVudC4nKTtcbiAgICB9XG4gIH1cbiAgZXhwb3J0cy5nZXRBcmcgPSBnZXRBcmc7XG5cbiAgdmFyIHVybFJlZ2V4cCA9IC9eKD86KFtcXHcrXFwtLl0rKTopP1xcL1xcLyg/OihcXHcrOlxcdyspQCk/KFtcXHcuXSopKD86OihcXGQrKSk/KFxcUyopJC87XG4gIHZhciBkYXRhVXJsUmVnZXhwID0gL15kYXRhOi4rXFwsLiskLztcblxuICBmdW5jdGlvbiB1cmxQYXJzZShhVXJsKSB7XG4gICAgdmFyIG1hdGNoID0gYVVybC5tYXRjaCh1cmxSZWdleHApO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgc2NoZW1lOiBtYXRjaFsxXSxcbiAgICAgIGF1dGg6IG1hdGNoWzJdLFxuICAgICAgaG9zdDogbWF0Y2hbM10sXG4gICAgICBwb3J0OiBtYXRjaFs0XSxcbiAgICAgIHBhdGg6IG1hdGNoWzVdXG4gICAgfTtcbiAgfVxuICBleHBvcnRzLnVybFBhcnNlID0gdXJsUGFyc2U7XG5cbiAgZnVuY3Rpb24gdXJsR2VuZXJhdGUoYVBhcnNlZFVybCkge1xuICAgIHZhciB1cmwgPSAnJztcbiAgICBpZiAoYVBhcnNlZFVybC5zY2hlbWUpIHtcbiAgICAgIHVybCArPSBhUGFyc2VkVXJsLnNjaGVtZSArICc6JztcbiAgICB9XG4gICAgdXJsICs9ICcvLyc7XG4gICAgaWYgKGFQYXJzZWRVcmwuYXV0aCkge1xuICAgICAgdXJsICs9IGFQYXJzZWRVcmwuYXV0aCArICdAJztcbiAgICB9XG4gICAgaWYgKGFQYXJzZWRVcmwuaG9zdCkge1xuICAgICAgdXJsICs9IGFQYXJzZWRVcmwuaG9zdDtcbiAgICB9XG4gICAgaWYgKGFQYXJzZWRVcmwucG9ydCkge1xuICAgICAgdXJsICs9IFwiOlwiICsgYVBhcnNlZFVybC5wb3J0XG4gICAgfVxuICAgIGlmIChhUGFyc2VkVXJsLnBhdGgpIHtcbiAgICAgIHVybCArPSBhUGFyc2VkVXJsLnBhdGg7XG4gICAgfVxuICAgIHJldHVybiB1cmw7XG4gIH1cbiAgZXhwb3J0cy51cmxHZW5lcmF0ZSA9IHVybEdlbmVyYXRlO1xuXG4gIC8qKlxuICAgKiBOb3JtYWxpemVzIGEgcGF0aCwgb3IgdGhlIHBhdGggcG9ydGlvbiBvZiBhIFVSTDpcbiAgICpcbiAgICogLSBSZXBsYWNlcyBjb25zZXF1dGl2ZSBzbGFzaGVzIHdpdGggb25lIHNsYXNoLlxuICAgKiAtIFJlbW92ZXMgdW5uZWNlc3NhcnkgJy4nIHBhcnRzLlxuICAgKiAtIFJlbW92ZXMgdW5uZWNlc3NhcnkgJzxkaXI+Ly4uJyBwYXJ0cy5cbiAgICpcbiAgICogQmFzZWQgb24gY29kZSBpbiB0aGUgTm9kZS5qcyAncGF0aCcgY29yZSBtb2R1bGUuXG4gICAqXG4gICAqIEBwYXJhbSBhUGF0aCBUaGUgcGF0aCBvciB1cmwgdG8gbm9ybWFsaXplLlxuICAgKi9cbiAgZnVuY3Rpb24gbm9ybWFsaXplKGFQYXRoKSB7XG4gICAgdmFyIHBhdGggPSBhUGF0aDtcbiAgICB2YXIgdXJsID0gdXJsUGFyc2UoYVBhdGgpO1xuICAgIGlmICh1cmwpIHtcbiAgICAgIGlmICghdXJsLnBhdGgpIHtcbiAgICAgICAgcmV0dXJuIGFQYXRoO1xuICAgICAgfVxuICAgICAgcGF0aCA9IHVybC5wYXRoO1xuICAgIH1cbiAgICB2YXIgaXNBYnNvbHV0ZSA9IChwYXRoLmNoYXJBdCgwKSA9PT0gJy8nKTtcblxuICAgIHZhciBwYXJ0cyA9IHBhdGguc3BsaXQoL1xcLysvKTtcbiAgICBmb3IgKHZhciBwYXJ0LCB1cCA9IDAsIGkgPSBwYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgcGFydCA9IHBhcnRzW2ldO1xuICAgICAgaWYgKHBhcnQgPT09ICcuJykge1xuICAgICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB9IGVsc2UgaWYgKHBhcnQgPT09ICcuLicpIHtcbiAgICAgICAgdXArKztcbiAgICAgIH0gZWxzZSBpZiAodXAgPiAwKSB7XG4gICAgICAgIGlmIChwYXJ0ID09PSAnJykge1xuICAgICAgICAgIC8vIFRoZSBmaXJzdCBwYXJ0IGlzIGJsYW5rIGlmIHRoZSBwYXRoIGlzIGFic29sdXRlLiBUcnlpbmcgdG8gZ29cbiAgICAgICAgICAvLyBhYm92ZSB0aGUgcm9vdCBpcyBhIG5vLW9wLiBUaGVyZWZvcmUgd2UgY2FuIHJlbW92ZSBhbGwgJy4uJyBwYXJ0c1xuICAgICAgICAgIC8vIGRpcmVjdGx5IGFmdGVyIHRoZSByb290LlxuICAgICAgICAgIHBhcnRzLnNwbGljZShpICsgMSwgdXApO1xuICAgICAgICAgIHVwID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXJ0cy5zcGxpY2UoaSwgMik7XG4gICAgICAgICAgdXAtLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBwYXRoID0gcGFydHMuam9pbignLycpO1xuXG4gICAgaWYgKHBhdGggPT09ICcnKSB7XG4gICAgICBwYXRoID0gaXNBYnNvbHV0ZSA/ICcvJyA6ICcuJztcbiAgICB9XG5cbiAgICBpZiAodXJsKSB7XG4gICAgICB1cmwucGF0aCA9IHBhdGg7XG4gICAgICByZXR1cm4gdXJsR2VuZXJhdGUodXJsKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cbiAgZXhwb3J0cy5ub3JtYWxpemUgPSBub3JtYWxpemU7XG5cbiAgLyoqXG4gICAqIEpvaW5zIHR3byBwYXRocy9VUkxzLlxuICAgKlxuICAgKiBAcGFyYW0gYVJvb3QgVGhlIHJvb3QgcGF0aCBvciBVUkwuXG4gICAqIEBwYXJhbSBhUGF0aCBUaGUgcGF0aCBvciBVUkwgdG8gYmUgam9pbmVkIHdpdGggdGhlIHJvb3QuXG4gICAqXG4gICAqIC0gSWYgYVBhdGggaXMgYSBVUkwgb3IgYSBkYXRhIFVSSSwgYVBhdGggaXMgcmV0dXJuZWQsIHVubGVzcyBhUGF0aCBpcyBhXG4gICAqICAgc2NoZW1lLXJlbGF0aXZlIFVSTDogVGhlbiB0aGUgc2NoZW1lIG9mIGFSb290LCBpZiBhbnksIGlzIHByZXBlbmRlZFxuICAgKiAgIGZpcnN0LlxuICAgKiAtIE90aGVyd2lzZSBhUGF0aCBpcyBhIHBhdGguIElmIGFSb290IGlzIGEgVVJMLCB0aGVuIGl0cyBwYXRoIHBvcnRpb25cbiAgICogICBpcyB1cGRhdGVkIHdpdGggdGhlIHJlc3VsdCBhbmQgYVJvb3QgaXMgcmV0dXJuZWQuIE90aGVyd2lzZSB0aGUgcmVzdWx0XG4gICAqICAgaXMgcmV0dXJuZWQuXG4gICAqICAgLSBJZiBhUGF0aCBpcyBhYnNvbHV0ZSwgdGhlIHJlc3VsdCBpcyBhUGF0aC5cbiAgICogICAtIE90aGVyd2lzZSB0aGUgdHdvIHBhdGhzIGFyZSBqb2luZWQgd2l0aCBhIHNsYXNoLlxuICAgKiAtIEpvaW5pbmcgZm9yIGV4YW1wbGUgJ2h0dHA6Ly8nIGFuZCAnd3d3LmV4YW1wbGUuY29tJyBpcyBhbHNvIHN1cHBvcnRlZC5cbiAgICovXG4gIGZ1bmN0aW9uIGpvaW4oYVJvb3QsIGFQYXRoKSB7XG4gICAgaWYgKGFSb290ID09PSBcIlwiKSB7XG4gICAgICBhUm9vdCA9IFwiLlwiO1xuICAgIH1cbiAgICBpZiAoYVBhdGggPT09IFwiXCIpIHtcbiAgICAgIGFQYXRoID0gXCIuXCI7XG4gICAgfVxuICAgIHZhciBhUGF0aFVybCA9IHVybFBhcnNlKGFQYXRoKTtcbiAgICB2YXIgYVJvb3RVcmwgPSB1cmxQYXJzZShhUm9vdCk7XG4gICAgaWYgKGFSb290VXJsKSB7XG4gICAgICBhUm9vdCA9IGFSb290VXJsLnBhdGggfHwgJy8nO1xuICAgIH1cblxuICAgIC8vIGBqb2luKGZvbywgJy8vd3d3LmV4YW1wbGUub3JnJylgXG4gICAgaWYgKGFQYXRoVXJsICYmICFhUGF0aFVybC5zY2hlbWUpIHtcbiAgICAgIGlmIChhUm9vdFVybCkge1xuICAgICAgICBhUGF0aFVybC5zY2hlbWUgPSBhUm9vdFVybC5zY2hlbWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gdXJsR2VuZXJhdGUoYVBhdGhVcmwpO1xuICAgIH1cblxuICAgIGlmIChhUGF0aFVybCB8fCBhUGF0aC5tYXRjaChkYXRhVXJsUmVnZXhwKSkge1xuICAgICAgcmV0dXJuIGFQYXRoO1xuICAgIH1cblxuICAgIC8vIGBqb2luKCdodHRwOi8vJywgJ3d3dy5leGFtcGxlLmNvbScpYFxuICAgIGlmIChhUm9vdFVybCAmJiAhYVJvb3RVcmwuaG9zdCAmJiAhYVJvb3RVcmwucGF0aCkge1xuICAgICAgYVJvb3RVcmwuaG9zdCA9IGFQYXRoO1xuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKGFSb290VXJsKTtcbiAgICB9XG5cbiAgICB2YXIgam9pbmVkID0gYVBhdGguY2hhckF0KDApID09PSAnLydcbiAgICAgID8gYVBhdGhcbiAgICAgIDogbm9ybWFsaXplKGFSb290LnJlcGxhY2UoL1xcLyskLywgJycpICsgJy8nICsgYVBhdGgpO1xuXG4gICAgaWYgKGFSb290VXJsKSB7XG4gICAgICBhUm9vdFVybC5wYXRoID0gam9pbmVkO1xuICAgICAgcmV0dXJuIHVybEdlbmVyYXRlKGFSb290VXJsKTtcbiAgICB9XG4gICAgcmV0dXJuIGpvaW5lZDtcbiAgfVxuICBleHBvcnRzLmpvaW4gPSBqb2luO1xuXG4gIC8qKlxuICAgKiBNYWtlIGEgcGF0aCByZWxhdGl2ZSB0byBhIFVSTCBvciBhbm90aGVyIHBhdGguXG4gICAqXG4gICAqIEBwYXJhbSBhUm9vdCBUaGUgcm9vdCBwYXRoIG9yIFVSTC5cbiAgICogQHBhcmFtIGFQYXRoIFRoZSBwYXRoIG9yIFVSTCB0byBiZSBtYWRlIHJlbGF0aXZlIHRvIGFSb290LlxuICAgKi9cbiAgZnVuY3Rpb24gcmVsYXRpdmUoYVJvb3QsIGFQYXRoKSB7XG4gICAgaWYgKGFSb290ID09PSBcIlwiKSB7XG4gICAgICBhUm9vdCA9IFwiLlwiO1xuICAgIH1cblxuICAgIGFSb290ID0gYVJvb3QucmVwbGFjZSgvXFwvJC8sICcnKTtcblxuICAgIC8vIFhYWDogSXQgaXMgcG9zc2libGUgdG8gcmVtb3ZlIHRoaXMgYmxvY2ssIGFuZCB0aGUgdGVzdHMgc3RpbGwgcGFzcyFcbiAgICB2YXIgdXJsID0gdXJsUGFyc2UoYVJvb3QpO1xuICAgIGlmIChhUGF0aC5jaGFyQXQoMCkgPT0gXCIvXCIgJiYgdXJsICYmIHVybC5wYXRoID09IFwiL1wiKSB7XG4gICAgICByZXR1cm4gYVBhdGguc2xpY2UoMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFQYXRoLmluZGV4T2YoYVJvb3QgKyAnLycpID09PSAwXG4gICAgICA/IGFQYXRoLnN1YnN0cihhUm9vdC5sZW5ndGggKyAxKVxuICAgICAgOiBhUGF0aDtcbiAgfVxuICBleHBvcnRzLnJlbGF0aXZlID0gcmVsYXRpdmU7XG5cbiAgLyoqXG4gICAqIEJlY2F1c2UgYmVoYXZpb3IgZ29lcyB3YWNreSB3aGVuIHlvdSBzZXQgYF9fcHJvdG9fX2Agb24gb2JqZWN0cywgd2VcbiAgICogaGF2ZSB0byBwcmVmaXggYWxsIHRoZSBzdHJpbmdzIGluIG91ciBzZXQgd2l0aCBhbiBhcmJpdHJhcnkgY2hhcmFjdGVyLlxuICAgKlxuICAgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvc291cmNlLW1hcC9wdWxsLzMxIGFuZFxuICAgKiBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9zb3VyY2UtbWFwL2lzc3Vlcy8zMFxuICAgKlxuICAgKiBAcGFyYW0gU3RyaW5nIGFTdHJcbiAgICovXG4gIGZ1bmN0aW9uIHRvU2V0U3RyaW5nKGFTdHIpIHtcbiAgICByZXR1cm4gJyQnICsgYVN0cjtcbiAgfVxuICBleHBvcnRzLnRvU2V0U3RyaW5nID0gdG9TZXRTdHJpbmc7XG5cbiAgZnVuY3Rpb24gZnJvbVNldFN0cmluZyhhU3RyKSB7XG4gICAgcmV0dXJuIGFTdHIuc3Vic3RyKDEpO1xuICB9XG4gIGV4cG9ydHMuZnJvbVNldFN0cmluZyA9IGZyb21TZXRTdHJpbmc7XG5cbiAgZnVuY3Rpb24gc3RyY21wKGFTdHIxLCBhU3RyMikge1xuICAgIHZhciBzMSA9IGFTdHIxIHx8IFwiXCI7XG4gICAgdmFyIHMyID0gYVN0cjIgfHwgXCJcIjtcbiAgICByZXR1cm4gKHMxID4gczIpIC0gKHMxIDwgczIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbXBhcmF0b3IgYmV0d2VlbiB0d28gbWFwcGluZ3Mgd2hlcmUgdGhlIG9yaWdpbmFsIHBvc2l0aW9ucyBhcmUgY29tcGFyZWQuXG4gICAqXG4gICAqIE9wdGlvbmFsbHkgcGFzcyBpbiBgdHJ1ZWAgYXMgYG9ubHlDb21wYXJlR2VuZXJhdGVkYCB0byBjb25zaWRlciB0d29cbiAgICogbWFwcGluZ3Mgd2l0aCB0aGUgc2FtZSBvcmlnaW5hbCBzb3VyY2UvbGluZS9jb2x1bW4sIGJ1dCBkaWZmZXJlbnQgZ2VuZXJhdGVkXG4gICAqIGxpbmUgYW5kIGNvbHVtbiB0aGUgc2FtZS4gVXNlZnVsIHdoZW4gc2VhcmNoaW5nIGZvciBhIG1hcHBpbmcgd2l0aCBhXG4gICAqIHN0dWJiZWQgb3V0IG1hcHBpbmcuXG4gICAqL1xuICBmdW5jdGlvbiBjb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyhtYXBwaW5nQSwgbWFwcGluZ0IsIG9ubHlDb21wYXJlT3JpZ2luYWwpIHtcbiAgICB2YXIgY21wO1xuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLnNvdXJjZSwgbWFwcGluZ0Iuc291cmNlKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsTGluZSAtIG1hcHBpbmdCLm9yaWdpbmFsTGluZTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsQ29sdW1uIC0gbWFwcGluZ0Iub3JpZ2luYWxDb2x1bW47XG4gICAgaWYgKGNtcCB8fCBvbmx5Q29tcGFyZU9yaWdpbmFsKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IHN0cmNtcChtYXBwaW5nQS5uYW1lLCBtYXBwaW5nQi5uYW1lKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLmdlbmVyYXRlZExpbmUgLSBtYXBwaW5nQi5nZW5lcmF0ZWRMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hcHBpbmdBLmdlbmVyYXRlZENvbHVtbiAtIG1hcHBpbmdCLmdlbmVyYXRlZENvbHVtbjtcbiAgfTtcbiAgZXhwb3J0cy5jb21wYXJlQnlPcmlnaW5hbFBvc2l0aW9ucyA9IGNvbXBhcmVCeU9yaWdpbmFsUG9zaXRpb25zO1xuXG4gIC8qKlxuICAgKiBDb21wYXJhdG9yIGJldHdlZW4gdHdvIG1hcHBpbmdzIHdoZXJlIHRoZSBnZW5lcmF0ZWQgcG9zaXRpb25zIGFyZVxuICAgKiBjb21wYXJlZC5cbiAgICpcbiAgICogT3B0aW9uYWxseSBwYXNzIGluIGB0cnVlYCBhcyBgb25seUNvbXBhcmVHZW5lcmF0ZWRgIHRvIGNvbnNpZGVyIHR3b1xuICAgKiBtYXBwaW5ncyB3aXRoIHRoZSBzYW1lIGdlbmVyYXRlZCBsaW5lIGFuZCBjb2x1bW4sIGJ1dCBkaWZmZXJlbnRcbiAgICogc291cmNlL25hbWUvb3JpZ2luYWwgbGluZSBhbmQgY29sdW1uIHRoZSBzYW1lLiBVc2VmdWwgd2hlbiBzZWFyY2hpbmcgZm9yIGFcbiAgICogbWFwcGluZyB3aXRoIGEgc3R1YmJlZCBvdXQgbWFwcGluZy5cbiAgICovXG4gIGZ1bmN0aW9uIGNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyhtYXBwaW5nQSwgbWFwcGluZ0IsIG9ubHlDb21wYXJlR2VuZXJhdGVkKSB7XG4gICAgdmFyIGNtcDtcblxuICAgIGNtcCA9IG1hcHBpbmdBLmdlbmVyYXRlZExpbmUgLSBtYXBwaW5nQi5nZW5lcmF0ZWRMaW5lO1xuICAgIGlmIChjbXApIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gbWFwcGluZ0EuZ2VuZXJhdGVkQ29sdW1uIC0gbWFwcGluZ0IuZ2VuZXJhdGVkQ29sdW1uO1xuICAgIGlmIChjbXAgfHwgb25seUNvbXBhcmVHZW5lcmF0ZWQpIHtcbiAgICAgIHJldHVybiBjbXA7XG4gICAgfVxuXG4gICAgY21wID0gc3RyY21wKG1hcHBpbmdBLnNvdXJjZSwgbWFwcGluZ0Iuc291cmNlKTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsTGluZSAtIG1hcHBpbmdCLm9yaWdpbmFsTGluZTtcbiAgICBpZiAoY21wKSB7XG4gICAgICByZXR1cm4gY21wO1xuICAgIH1cblxuICAgIGNtcCA9IG1hcHBpbmdBLm9yaWdpbmFsQ29sdW1uIC0gbWFwcGluZ0Iub3JpZ2luYWxDb2x1bW47XG4gICAgaWYgKGNtcCkge1xuICAgICAgcmV0dXJuIGNtcDtcbiAgICB9XG5cbiAgICByZXR1cm4gc3RyY21wKG1hcHBpbmdBLm5hbWUsIG1hcHBpbmdCLm5hbWUpO1xuICB9O1xuICBleHBvcnRzLmNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucyA9IGNvbXBhcmVCeUdlbmVyYXRlZFBvc2l0aW9ucztcblxufSk7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3MsX19maWxlbmFtZSl7XG4vKiogdmltOiBldDp0cz00OnN3PTQ6c3RzPTRcbiAqIEBsaWNlbnNlIGFtZGVmaW5lIDAuMS4wIENvcHlyaWdodCAoYykgMjAxMSwgVGhlIERvam8gRm91bmRhdGlvbiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICogQXZhaWxhYmxlIHZpYSB0aGUgTUlUIG9yIG5ldyBCU0QgbGljZW5zZS5cbiAqIHNlZTogaHR0cDovL2dpdGh1Yi5jb20vanJidXJrZS9hbWRlZmluZSBmb3IgZGV0YWlsc1xuICovXG5cbi8qanNsaW50IG5vZGU6IHRydWUgKi9cbi8qZ2xvYmFsIG1vZHVsZSwgcHJvY2VzcyAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBkZWZpbmUgZm9yIG5vZGUuXG4gKiBAcGFyYW0ge09iamVjdH0gbW9kdWxlIHRoZSBcIm1vZHVsZVwiIG9iamVjdCB0aGF0IGlzIGRlZmluZWQgYnkgTm9kZSBmb3IgdGhlXG4gKiBjdXJyZW50IG1vZHVsZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtyZXF1aXJlRm5dLiBOb2RlJ3MgcmVxdWlyZSBmdW5jdGlvbiBmb3IgdGhlIGN1cnJlbnQgbW9kdWxlLlxuICogSXQgb25seSBuZWVkcyB0byBiZSBwYXNzZWQgaW4gTm9kZSB2ZXJzaW9ucyBiZWZvcmUgMC41LCB3aGVuIG1vZHVsZS5yZXF1aXJlXG4gKiBkaWQgbm90IGV4aXN0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBhIGRlZmluZSBmdW5jdGlvbiB0aGF0IGlzIHVzYWJsZSBmb3IgdGhlIGN1cnJlbnQgbm9kZVxuICogbW9kdWxlLlxuICovXG5mdW5jdGlvbiBhbWRlZmluZShtb2R1bGUsIHJlcXVpcmVGbikge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICB2YXIgZGVmaW5lQ2FjaGUgPSB7fSxcbiAgICAgICAgbG9hZGVyQ2FjaGUgPSB7fSxcbiAgICAgICAgYWxyZWFkeUNhbGxlZCA9IGZhbHNlLFxuICAgICAgICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICAgICAgICBtYWtlUmVxdWlyZSwgc3RyaW5nUmVxdWlyZTtcblxuICAgIC8qKlxuICAgICAqIFRyaW1zIHRoZSAuIGFuZCAuLiBmcm9tIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMuXG4gICAgICogSXQgd2lsbCBrZWVwIGEgbGVhZGluZyBwYXRoIHNlZ21lbnQgaWYgYSAuLiB3aWxsIGJlY29tZVxuICAgICAqIHRoZSBmaXJzdCBwYXRoIHNlZ21lbnQsIHRvIGhlbHAgd2l0aCBtb2R1bGUgbmFtZSBsb29rdXBzLFxuICAgICAqIHdoaWNoIGFjdCBsaWtlIHBhdGhzLCBidXQgY2FuIGJlIHJlbWFwcGVkLiBCdXQgdGhlIGVuZCByZXN1bHQsXG4gICAgICogYWxsIHBhdGhzIHRoYXQgdXNlIHRoaXMgZnVuY3Rpb24gc2hvdWxkIGxvb2sgbm9ybWFsaXplZC5cbiAgICAgKiBOT1RFOiB0aGlzIG1ldGhvZCBNT0RJRklFUyB0aGUgaW5wdXQgYXJyYXkuXG4gICAgICogQHBhcmFtIHtBcnJheX0gYXJ5IHRoZSBhcnJheSBvZiBwYXRoIHNlZ21lbnRzLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHRyaW1Eb3RzKGFyeSkge1xuICAgICAgICB2YXIgaSwgcGFydDtcbiAgICAgICAgZm9yIChpID0gMDsgYXJ5W2ldOyBpKz0gMSkge1xuICAgICAgICAgICAgcGFydCA9IGFyeVtpXTtcbiAgICAgICAgICAgIGlmIChwYXJ0ID09PSAnLicpIHtcbiAgICAgICAgICAgICAgICBhcnkuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIGkgLT0gMTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFydCA9PT0gJy4uJykge1xuICAgICAgICAgICAgICAgIGlmIChpID09PSAxICYmIChhcnlbMl0gPT09ICcuLicgfHwgYXJ5WzBdID09PSAnLi4nKSkge1xuICAgICAgICAgICAgICAgICAgICAvL0VuZCBvZiB0aGUgbGluZS4gS2VlcCBhdCBsZWFzdCBvbmUgbm9uLWRvdFxuICAgICAgICAgICAgICAgICAgICAvL3BhdGggc2VnbWVudCBhdCB0aGUgZnJvbnQgc28gaXQgY2FuIGJlIG1hcHBlZFxuICAgICAgICAgICAgICAgICAgICAvL2NvcnJlY3RseSB0byBkaXNrLiBPdGhlcndpc2UsIHRoZXJlIGlzIGxpa2VseVxuICAgICAgICAgICAgICAgICAgICAvL25vIHBhdGggbWFwcGluZyBmb3IgYSBwYXRoIHN0YXJ0aW5nIHdpdGggJy4uJy5cbiAgICAgICAgICAgICAgICAgICAgLy9UaGlzIGNhbiBzdGlsbCBmYWlsLCBidXQgY2F0Y2hlcyB0aGUgbW9zdCByZWFzb25hYmxlXG4gICAgICAgICAgICAgICAgICAgIC8vdXNlcyBvZiAuLlxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyeS5zcGxpY2UoaSAtIDEsIDIpO1xuICAgICAgICAgICAgICAgICAgICBpIC09IDI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplKG5hbWUsIGJhc2VOYW1lKSB7XG4gICAgICAgIHZhciBiYXNlUGFydHM7XG5cbiAgICAgICAgLy9BZGp1c3QgYW55IHJlbGF0aXZlIHBhdGhzLlxuICAgICAgICBpZiAobmFtZSAmJiBuYW1lLmNoYXJBdCgwKSA9PT0gJy4nKSB7XG4gICAgICAgICAgICAvL0lmIGhhdmUgYSBiYXNlIG5hbWUsIHRyeSB0byBub3JtYWxpemUgYWdhaW5zdCBpdCxcbiAgICAgICAgICAgIC8vb3RoZXJ3aXNlLCBhc3N1bWUgaXQgaXMgYSB0b3AtbGV2ZWwgcmVxdWlyZSB0aGF0IHdpbGxcbiAgICAgICAgICAgIC8vYmUgcmVsYXRpdmUgdG8gYmFzZVVybCBpbiB0aGUgZW5kLlxuICAgICAgICAgICAgaWYgKGJhc2VOYW1lKSB7XG4gICAgICAgICAgICAgICAgYmFzZVBhcnRzID0gYmFzZU5hbWUuc3BsaXQoJy8nKTtcbiAgICAgICAgICAgICAgICBiYXNlUGFydHMgPSBiYXNlUGFydHMuc2xpY2UoMCwgYmFzZVBhcnRzLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgICAgIGJhc2VQYXJ0cyA9IGJhc2VQYXJ0cy5jb25jYXQobmFtZS5zcGxpdCgnLycpKTtcbiAgICAgICAgICAgICAgICB0cmltRG90cyhiYXNlUGFydHMpO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBiYXNlUGFydHMuam9pbignLycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHRoZSBub3JtYWxpemUoKSBmdW5jdGlvbiBwYXNzZWQgdG8gYSBsb2FkZXIgcGx1Z2luJ3NcbiAgICAgKiBub3JtYWxpemUgbWV0aG9kLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VOb3JtYWxpemUocmVsTmFtZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemUobmFtZSwgcmVsTmFtZSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWFrZUxvYWQoaWQpIHtcbiAgICAgICAgZnVuY3Rpb24gbG9hZCh2YWx1ZSkge1xuICAgICAgICAgICAgbG9hZGVyQ2FjaGVbaWRdID0gdmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBsb2FkLmZyb21UZXh0ID0gZnVuY3Rpb24gKGlkLCB0ZXh0KSB7XG4gICAgICAgICAgICAvL1RoaXMgb25lIGlzIGRpZmZpY3VsdCBiZWNhdXNlIHRoZSB0ZXh0IGNhbi9wcm9iYWJseSB1c2VzXG4gICAgICAgICAgICAvL2RlZmluZSwgYW5kIGFueSByZWxhdGl2ZSBwYXRocyBhbmQgcmVxdWlyZXMgc2hvdWxkIGJlIHJlbGF0aXZlXG4gICAgICAgICAgICAvL3RvIHRoYXQgaWQgd2FzIGl0IHdvdWxkIGJlIGZvdW5kIG9uIGRpc2suIEJ1dCB0aGlzIHdvdWxkIHJlcXVpcmVcbiAgICAgICAgICAgIC8vYm9vdHN0cmFwcGluZyBhIG1vZHVsZS9yZXF1aXJlIGZhaXJseSBkZWVwbHkgZnJvbSBub2RlIGNvcmUuXG4gICAgICAgICAgICAvL05vdCBzdXJlIGhvdyBiZXN0IHRvIGdvIGFib3V0IHRoYXQgeWV0LlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhbWRlZmluZSBkb2VzIG5vdCBpbXBsZW1lbnQgbG9hZC5mcm9tVGV4dCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBsb2FkO1xuICAgIH1cblxuICAgIG1ha2VSZXF1aXJlID0gZnVuY3Rpb24gKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcmVsSWQpIHtcbiAgICAgICAgZnVuY3Rpb24gYW1kUmVxdWlyZShkZXBzLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBkZXBzID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIC8vU3luY2hyb25vdXMsIHNpbmdsZSBtb2R1bGUgcmVxdWlyZSgnJylcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIGRlcHMsIHJlbElkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy9BcnJheSBvZiBkZXBlbmRlbmNpZXMgd2l0aCBhIGNhbGxiYWNrLlxuXG4gICAgICAgICAgICAgICAgLy9Db252ZXJ0IHRoZSBkZXBlbmRlbmNpZXMgdG8gbW9kdWxlcy5cbiAgICAgICAgICAgICAgICBkZXBzID0gZGVwcy5tYXAoZnVuY3Rpb24gKGRlcE5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0cmluZ1JlcXVpcmUoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCBkZXBOYW1lLCByZWxJZCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvL1dhaXQgZm9yIG5leHQgdGljayB0byBjYWxsIGJhY2sgdGhlIHJlcXVpcmUgY2FsbC5cbiAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgZGVwcyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhbWRSZXF1aXJlLnRvVXJsID0gZnVuY3Rpb24gKGZpbGVQYXRoKSB7XG4gICAgICAgICAgICBpZiAoZmlsZVBhdGguaW5kZXhPZignLicpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShmaWxlUGF0aCwgcGF0aC5kaXJuYW1lKG1vZHVsZS5maWxlbmFtZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmlsZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGFtZFJlcXVpcmU7XG4gICAgfTtcblxuICAgIC8vRmF2b3IgZXhwbGljaXQgdmFsdWUsIHBhc3NlZCBpbiBpZiB0aGUgbW9kdWxlIHdhbnRzIHRvIHN1cHBvcnQgTm9kZSAwLjQuXG4gICAgcmVxdWlyZUZuID0gcmVxdWlyZUZuIHx8IGZ1bmN0aW9uIHJlcSgpIHtcbiAgICAgICAgcmV0dXJuIG1vZHVsZS5yZXF1aXJlLmFwcGx5KG1vZHVsZSwgYXJndW1lbnRzKTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcnVuRmFjdG9yeShpZCwgZGVwcywgZmFjdG9yeSkge1xuICAgICAgICB2YXIgciwgZSwgbSwgcmVzdWx0O1xuXG4gICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgZSA9IGxvYWRlckNhY2hlW2lkXSA9IHt9O1xuICAgICAgICAgICAgbSA9IHtcbiAgICAgICAgICAgICAgICBpZDogaWQsXG4gICAgICAgICAgICAgICAgdXJpOiBfX2ZpbGVuYW1lLFxuICAgICAgICAgICAgICAgIGV4cG9ydHM6IGVcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByID0gbWFrZVJlcXVpcmUocmVxdWlyZUZuLCBlLCBtLCBpZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL09ubHkgc3VwcG9ydCBvbmUgZGVmaW5lIGNhbGwgcGVyIGZpbGVcbiAgICAgICAgICAgIGlmIChhbHJlYWR5Q2FsbGVkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhbWRlZmluZSB3aXRoIG5vIG1vZHVsZSBJRCBjYW5ub3QgYmUgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIHBlciBmaWxlLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWxyZWFkeUNhbGxlZCA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vVXNlIHRoZSByZWFsIHZhcmlhYmxlcyBmcm9tIG5vZGVcbiAgICAgICAgICAgIC8vVXNlIG1vZHVsZS5leHBvcnRzIGZvciBleHBvcnRzLCBzaW5jZVxuICAgICAgICAgICAgLy90aGUgZXhwb3J0cyBpbiBoZXJlIGlzIGFtZGVmaW5lIGV4cG9ydHMuXG4gICAgICAgICAgICBlID0gbW9kdWxlLmV4cG9ydHM7XG4gICAgICAgICAgICBtID0gbW9kdWxlO1xuICAgICAgICAgICAgciA9IG1ha2VSZXF1aXJlKHJlcXVpcmVGbiwgZSwgbSwgbW9kdWxlLmlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vSWYgdGhlcmUgYXJlIGRlcGVuZGVuY2llcywgdGhleSBhcmUgc3RyaW5ncywgc28gbmVlZFxuICAgICAgICAvL3RvIGNvbnZlcnQgdGhlbSB0byBkZXBlbmRlbmN5IHZhbHVlcy5cbiAgICAgICAgaWYgKGRlcHMpIHtcbiAgICAgICAgICAgIGRlcHMgPSBkZXBzLm1hcChmdW5jdGlvbiAoZGVwTmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByKGRlcE5hbWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL0NhbGwgdGhlIGZhY3Rvcnkgd2l0aCB0aGUgcmlnaHQgZGVwZW5kZW5jaWVzLlxuICAgICAgICBpZiAodHlwZW9mIGZhY3RvcnkgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZhY3RvcnkuYXBwbHkobS5leHBvcnRzLCBkZXBzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGZhY3Rvcnk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG0uZXhwb3J0cyA9IHJlc3VsdDtcbiAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgIGxvYWRlckNhY2hlW2lkXSA9IG0uZXhwb3J0cztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0cmluZ1JlcXVpcmUgPSBmdW5jdGlvbiAoc3lzdGVtUmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlLCBpZCwgcmVsSWQpIHtcbiAgICAgICAgLy9TcGxpdCB0aGUgSUQgYnkgYSAhIHNvIHRoYXRcbiAgICAgICAgdmFyIGluZGV4ID0gaWQuaW5kZXhPZignIScpLFxuICAgICAgICAgICAgb3JpZ2luYWxJZCA9IGlkLFxuICAgICAgICAgICAgcHJlZml4LCBwbHVnaW47XG5cbiAgICAgICAgaWYgKGluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgaWQgPSBub3JtYWxpemUoaWQsIHJlbElkKTtcblxuICAgICAgICAgICAgLy9TdHJhaWdodCBtb2R1bGUgbG9va3VwLiBJZiBpdCBpcyBvbmUgb2YgdGhlIHNwZWNpYWwgZGVwZW5kZW5jaWVzLFxuICAgICAgICAgICAgLy9kZWFsIHdpdGggaXQsIG90aGVyd2lzZSwgZGVsZWdhdGUgdG8gbm9kZS5cbiAgICAgICAgICAgIGlmIChpZCA9PT0gJ3JlcXVpcmUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1ha2VSZXF1aXJlKHN5c3RlbVJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSwgcmVsSWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpZCA9PT0gJ2V4cG9ydHMnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cG9ydHM7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlkID09PSAnbW9kdWxlJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2R1bGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGxvYWRlckNhY2hlLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRlZmluZUNhY2hlW2lkXSkge1xuICAgICAgICAgICAgICAgIHJ1bkZhY3RvcnkuYXBwbHkobnVsbCwgZGVmaW5lQ2FjaGVbaWRdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZihzeXN0ZW1SZXF1aXJlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzeXN0ZW1SZXF1aXJlKG9yaWdpbmFsSWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbW9kdWxlIHdpdGggSUQ6ICcgKyBpZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9UaGVyZSBpcyBhIHBsdWdpbiBpbiBwbGF5LlxuICAgICAgICAgICAgcHJlZml4ID0gaWQuc3Vic3RyaW5nKDAsIGluZGV4KTtcbiAgICAgICAgICAgIGlkID0gaWQuc3Vic3RyaW5nKGluZGV4ICsgMSwgaWQubGVuZ3RoKTtcblxuICAgICAgICAgICAgcGx1Z2luID0gc3RyaW5nUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIHByZWZpeCwgcmVsSWQpO1xuXG4gICAgICAgICAgICBpZiAocGx1Z2luLm5vcm1hbGl6ZSkge1xuICAgICAgICAgICAgICAgIGlkID0gcGx1Z2luLm5vcm1hbGl6ZShpZCwgbWFrZU5vcm1hbGl6ZShyZWxJZCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL05vcm1hbGl6ZSB0aGUgSUQgbm9ybWFsbHkuXG4gICAgICAgICAgICAgICAgaWQgPSBub3JtYWxpemUoaWQsIHJlbElkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxvYWRlckNhY2hlW2lkXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsb2FkZXJDYWNoZVtpZF07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBsdWdpbi5sb2FkKGlkLCBtYWtlUmVxdWlyZShzeXN0ZW1SZXF1aXJlLCBleHBvcnRzLCBtb2R1bGUsIHJlbElkKSwgbWFrZUxvYWQoaWQpLCB7fSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vQ3JlYXRlIGEgZGVmaW5lIGZ1bmN0aW9uIHNwZWNpZmljIHRvIHRoZSBtb2R1bGUgYXNraW5nIGZvciBhbWRlZmluZS5cbiAgICBmdW5jdGlvbiBkZWZpbmUoaWQsIGRlcHMsIGZhY3RvcnkpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaWQpKSB7XG4gICAgICAgICAgICBmYWN0b3J5ID0gZGVwcztcbiAgICAgICAgICAgIGRlcHMgPSBpZDtcbiAgICAgICAgICAgIGlkID0gdW5kZWZpbmVkO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGZhY3RvcnkgPSBpZDtcbiAgICAgICAgICAgIGlkID0gZGVwcyA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkZXBzICYmICFBcnJheS5pc0FycmF5KGRlcHMpKSB7XG4gICAgICAgICAgICBmYWN0b3J5ID0gZGVwcztcbiAgICAgICAgICAgIGRlcHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWRlcHMpIHtcbiAgICAgICAgICAgIGRlcHMgPSBbJ3JlcXVpcmUnLCAnZXhwb3J0cycsICdtb2R1bGUnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vU2V0IHVwIHByb3BlcnRpZXMgZm9yIHRoaXMgbW9kdWxlLiBJZiBhbiBJRCwgdGhlbiB1c2VcbiAgICAgICAgLy9pbnRlcm5hbCBjYWNoZS4gSWYgbm8gSUQsIHRoZW4gdXNlIHRoZSBleHRlcm5hbCB2YXJpYWJsZXNcbiAgICAgICAgLy9mb3IgdGhpcyBub2RlIG1vZHVsZS5cbiAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAvL1B1dCB0aGUgbW9kdWxlIGluIGRlZXAgZnJlZXplIHVudGlsIHRoZXJlIGlzIGFcbiAgICAgICAgICAgIC8vcmVxdWlyZSBjYWxsIGZvciBpdC5cbiAgICAgICAgICAgIGRlZmluZUNhY2hlW2lkXSA9IFtpZCwgZGVwcywgZmFjdG9yeV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBydW5GYWN0b3J5KGlkLCBkZXBzLCBmYWN0b3J5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vZGVmaW5lLnJlcXVpcmUsIHdoaWNoIGhhcyBhY2Nlc3MgdG8gYWxsIHRoZSB2YWx1ZXMgaW4gdGhlXG4gICAgLy9jYWNoZS4gVXNlZnVsIGZvciBBTUQgbW9kdWxlcyB0aGF0IGFsbCBoYXZlIElEcyBpbiB0aGUgZmlsZSxcbiAgICAvL2J1dCBuZWVkIHRvIGZpbmFsbHkgZXhwb3J0IGEgdmFsdWUgdG8gbm9kZSBiYXNlZCBvbiBvbmUgb2YgdGhvc2VcbiAgICAvL0lEcy5cbiAgICBkZWZpbmUucmVxdWlyZSA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICBpZiAobG9hZGVyQ2FjaGVbaWRdKSB7XG4gICAgICAgICAgICByZXR1cm4gbG9hZGVyQ2FjaGVbaWRdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlZmluZUNhY2hlW2lkXSkge1xuICAgICAgICAgICAgcnVuRmFjdG9yeS5hcHBseShudWxsLCBkZWZpbmVDYWNoZVtpZF0pO1xuICAgICAgICAgICAgcmV0dXJuIGxvYWRlckNhY2hlW2lkXTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBkZWZpbmUuYW1kID0ge307XG5cbiAgICByZXR1cm4gZGVmaW5lO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFtZGVmaW5lO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIkQ6XFxcXGJpbGx5c0ZpbGVcXFxcY29kZVxcXFxqYXZhc2NyaXB0XFxcXG5vZGVqc1xcXFxtb2R1bGVzXFxcXGRlYWR1bml0Q29yZVxcXFxub2RlX21vZHVsZXNcXFxcYnJvd3NlcmlmeVxcXFxub2RlX21vZHVsZXNcXFxcaW5zZXJ0LW1vZHVsZS1nbG9iYWxzXFxcXG5vZGVfbW9kdWxlc1xcXFxwcm9jZXNzXFxcXGJyb3dzZXIuanNcIiksXCIvLi5cXFxcbm9kZV9tb2R1bGVzXFxcXHN0YWNrdHJhY2UtanNcXFxcbm9kZV9tb2R1bGVzXFxcXHN0YWNrdHJhY2UtZ3BzXFxcXG5vZGVfbW9kdWxlc1xcXFxzb3VyY2UtbWFwXFxcXG5vZGVfbW9kdWxlc1xcXFxhbWRlZmluZVxcXFxhbWRlZmluZS5qc1wiKSIsIihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICAvLyBVbml2ZXJzYWwgTW9kdWxlIERlZmluaXRpb24gKFVNRCkgdG8gc3VwcG9ydCBBTUQsIENvbW1vbkpTL05vZGUuanMsIFJoaW5vLCBhbmQgYnJvd3NlcnMuXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoJ3N0YWNrdHJhY2UtZ3BzJywgWydzb3VyY2UtbWFwJywgJ2VzNi1wcm9taXNlJywgJ3N0YWNrZnJhbWUnXSwgZmFjdG9yeSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoJ3NvdXJjZS1tYXAvbGliL3NvdXJjZS1tYXAvc291cmNlLW1hcC1jb25zdW1lcicpLCByZXF1aXJlKCdlczYtcHJvbWlzZScpLCByZXF1aXJlKCdzdGFja2ZyYW1lJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJvb3QuU3RhY2tUcmFjZUdQUyA9IGZhY3Rvcnkocm9vdC5Tb3VyY2VNYXAsIHJvb3QuRVM2UHJvbWlzZSwgcm9vdC5TdGFja0ZyYW1lKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uIChTb3VyY2VNYXAsIEVTNlByb21pc2UsIFN0YWNrRnJhbWUpIHtcbiAgICAndXNlIHN0cmljdCc7XG4gICAgRVM2UHJvbWlzZS5wb2x5ZmlsbCgpO1xuICAgIHZhciBQcm9taXNlID0gRVM2UHJvbWlzZS5Qcm9taXNlO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIFhIUiBvciBlcXVpdmFsZW50IG9iamVjdCBmb3IgdGhpcyBlbnZpcm9ubWVudC5cbiAgICAgKiBAcmV0dXJucyBYTUxIdHRwUmVxdWVzdCwgWERvbWFpblJlcXVlc3Qgb3IgQWN0aXZlWE9iamVjdFxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZnVuY3Rpb24gX2NyZWF0ZVhNTEhUVFBPYmplY3QoKSB7XG4gICAgICAgIHZhciB4bWxodHRwO1xuICAgICAgICB2YXIgWE1MSHR0cEZhY3RvcmllcyA9IFtcbiAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBBY3RpdmVYT2JqZWN0KCdNaWNyb3NvZnQuWE1MSFRUUCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICBdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IFhNTEh0dHBGYWN0b3JpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgeG1saHR0cCA9IFhNTEh0dHBGYWN0b3JpZXNbaV0oKTtcbiAgICAgICAgICAgICAgICAvLyBVc2UgbWVtb2l6YXRpb24gdG8gY2FjaGUgdGhlIGZhY3RvcnlcbiAgICAgICAgICAgICAgICBfY3JlYXRlWE1MSFRUUE9iamVjdCA9IFhNTEh0dHBGYWN0b3JpZXNbaV07IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICAgICAgICAgICAgICAgIHJldHVybiB4bWxodHRwO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFrZSBhIFgtRG9tYWluIHJlcXVlc3QgdG8gdXJsIGFuZCBjYWxsYmFjay5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB1cmwgW1N0cmluZ11cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgW0Z1bmN0aW9uXSB0byBjYWxsYmFjayBvbiBjb21wbGV0aW9uXG4gICAgICogQHBhcmFtIGVycmJhY2sgW0Z1bmN0aW9uXSB0byBjYWxsYmFjayBvbiBlcnJvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIF94ZHIodXJsLCBjYWxsYmFjaywgZXJyYmFjaykge1xuICAgICAgICB2YXIgcmVxID0gX2NyZWF0ZVhNTEhUVFBPYmplY3QoKTtcbiAgICAgICAgcmVxLm9wZW4oJ2dldCcsIHVybCk7XG4gICAgICAgIHJlcS5vbmVycm9yID0gZXJyYmFjaztcbiAgICAgICAgcmVxLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uIG9ucmVhZHlzdGF0ZWNoYW5nZSgpIHtcbiAgICAgICAgICAgIGlmIChyZXEucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGlmIChyZXEuc3RhdHVzID49IDIwMCAmJiByZXEuc3RhdHVzIDwgNDAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhyZXEucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJiYWNrKG5ldyBFcnJvcignVW5hYmxlIHRvIHJldHJpZXZlICcgKyB1cmwpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJlcS5zZW5kKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2ZpbmRGdW5jdGlvbk5hbWUoc291cmNlLCBsaW5lTnVtYmVyLCBjb2x1bW5OdW1iZXIpIHtcbiAgICAgICAgLy8gZnVuY3Rpb24ge25hbWV9KHthcmdzfSkgbVsxXT1uYW1lIG1bMl09YXJnc1xuICAgICAgICB2YXIgcmVGdW5jdGlvbkRlY2xhcmF0aW9uID0gL2Z1bmN0aW9uXFxzKyhbXihdKj8pXFxzKlxcKChbXildKilcXCkvO1xuICAgICAgICAvLyB7bmFtZX0gPSBmdW5jdGlvbiAoe2FyZ3N9KSBUT0RPIGFyZ3MgY2FwdHVyZVxuICAgICAgICB2YXIgcmVGdW5jdGlvbkV4cHJlc3Npb24gPSAvWydcIl0/KFskX0EtWmEtel1bJF9BLVphLXowLTldKilbJ1wiXT9cXHMqWzo9XVxccypmdW5jdGlvblxcYi87XG4gICAgICAgIC8vIHtuYW1lfSA9IGV2YWwoKVxuICAgICAgICB2YXIgcmVGdW5jdGlvbkV2YWx1YXRpb24gPSAvWydcIl0/KFskX0EtWmEtel1bJF9BLVphLXowLTldKilbJ1wiXT9cXHMqWzo9XVxccyooPzpldmFsfG5ldyBGdW5jdGlvbilcXGIvO1xuICAgICAgICB2YXIgbGluZXMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIik7XG5cbiAgICAgICAgLy8gV2FsayBiYWNrd2FyZHMgaW4gdGhlIHNvdXJjZSBsaW5lcyB1bnRpbCB3ZSBmaW5kIHRoZSBsaW5lIHdoaWNoIG1hdGNoZXMgb25lIG9mIHRoZSBwYXR0ZXJucyBhYm92ZVxuICAgICAgICB2YXIgY29kZSA9ICcnLCBsaW5lLCBtYXhMaW5lcyA9IE1hdGgubWluKGxpbmVOdW1iZXIsIDIwKSwgbSwgY29tbWVudFBvcztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXhMaW5lczsgKytpKSB7XG4gICAgICAgICAgICAvLyBsaW5lTm8gaXMgMS1iYXNlZCwgc291cmNlW10gaXMgMC1iYXNlZFxuICAgICAgICAgICAgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXIgLSBpIC0gMV07XG4gICAgICAgICAgICBjb21tZW50UG9zID0gbGluZS5pbmRleE9mKCcvLycpO1xuICAgICAgICAgICAgaWYgKGNvbW1lbnRQb3MgPj0gMCkge1xuICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5lLnN1YnN0cigwLCBjb21tZW50UG9zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxpbmUpIHtcbiAgICAgICAgICAgICAgICBjb2RlID0gbGluZSArIGNvZGU7XG4gICAgICAgICAgICAgICAgbSA9IHJlRnVuY3Rpb25FeHByZXNzaW9uLmV4ZWMoY29kZSk7XG4gICAgICAgICAgICAgICAgaWYgKG0gJiYgbVsxXSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbVsxXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbSA9IHJlRnVuY3Rpb25EZWNsYXJhdGlvbi5leGVjKGNvZGUpO1xuICAgICAgICAgICAgICAgIGlmIChtICYmIG1bMV0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy9yZXR1cm4gbVsxXSArIFwiKFwiICsgKG1bMl0gfHwgXCJcIikgKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1bMV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG0gPSByZUZ1bmN0aW9uRXZhbHVhdGlvbi5leGVjKGNvZGUpO1xuICAgICAgICAgICAgICAgIGlmIChtICYmIG1bMV0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1bMV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2Vuc3VyZVN1cHBvcnRlZEVudmlyb25tZW50KCkge1xuICAgICAgICBpZiAodHlwZW9mIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSAhPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgT2JqZWN0LmNyZWF0ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gY29uc3VtZSBzb3VyY2UgbWFwcyBpbiBvbGRlciBicm93c2VycycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2Vuc3VyZVN0YWNrRnJhbWVJc0xlZ2l0KHN0YWNrZnJhbWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBzdGFja2ZyYW1lICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignR2l2ZW4gU3RhY2tGcmFtZSBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHN0YWNrZnJhbWUuZmlsZU5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdHaXZlbiBmaWxlIG5hbWUgaXMgbm90IGEgU3RyaW5nJyk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHN0YWNrZnJhbWUubGluZU51bWJlciAhPT0gJ251bWJlcicgfHwgc3RhY2tmcmFtZS5saW5lTnVtYmVyICUgMSAhPT0gMCB8fCBzdGFja2ZyYW1lLmxpbmVOdW1iZXIgPCAxKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdHaXZlbiBsaW5lIG51bWJlciBtdXN0IGJlIGEgcG9zaXRpdmUgaW50ZWdlcicpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzdGFja2ZyYW1lLmNvbHVtbk51bWJlciAhPT0gJ251bWJlcicgfHwgc3RhY2tmcmFtZS5jb2x1bW5OdW1iZXIgJSAxICE9PSAwIHx8IHN0YWNrZnJhbWUuY29sdW1uTnVtYmVyIDwgMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignR2l2ZW4gY29sdW1uIG51bWJlciBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIGludGVnZXInKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZmluZFNvdXJjZU1hcHBpbmdVUkwoc291cmNlKSB7XG4gICAgICAgIHZhciBtID0gL1xcL1xcL1sjQF0gP3NvdXJjZU1hcHBpbmdVUkw9KFteXFxzJ1wiXSspJC8uZXhlYyhzb3VyY2UpO1xuICAgICAgICBpZiAobSAmJiBtWzFdKSB7XG4gICAgICAgICAgICByZXR1cm4gbVsxXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignc291cmNlTWFwcGluZ1VSTCBub3QgZm91bmQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9uZXdMb2NhdGlvbkluZm9Gcm9tU291cmNlTWFwKHJhd1NvdXJjZU1hcCwgYXJncywgbGluZU51bWJlciwgY29sdW1uTnVtYmVyKSB7XG4gICAgICAgIHZhciBsb2MgPSBuZXcgU291cmNlTWFwLlNvdXJjZU1hcENvbnN1bWVyKHJhd1NvdXJjZU1hcClcbiAgICAgICAgICAgIC5vcmlnaW5hbFBvc2l0aW9uRm9yKHtsaW5lOiBsaW5lTnVtYmVyLCBjb2x1bW46IGNvbHVtbk51bWJlcn0pO1xuICAgICAgICByZXR1cm4gbmV3IFN0YWNrRnJhbWUobG9jLm5hbWUsIGFyZ3MsIGxvYy5zb3VyY2UsIGxvYy5saW5lLCBsb2MuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gb3B0czogW09iamVjdF0gb3B0aW9ucy5cbiAgICAgKiAgICAgIG9wdHMuc291cmNlQ2FjaGUgPSB7dXJsOiBcIlNvdXJjZSBTdHJpbmdcIn0gPT4gcHJlbG9hZCBzb3VyY2UgY2FjaGVcbiAgICAgKiAgICAgIG9wdHMub2ZmbGluZSA9IFRydWUgdG8gcHJldmVudCBuZXR3b3JrIHJlcXVlc3RzLlxuICAgICAqICAgICAgICAgICAgICBCZXN0IGVmZm9ydCB3aXRob3V0IHNvdXJjZXMgb3Igc291cmNlIG1hcHMuXG4gICAgICovXG4gICAgcmV0dXJuIGZ1bmN0aW9uIFN0YWNrVHJhY2VHUFMob3B0cykge1xuICAgICAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU3RhY2tUcmFjZUdQUykpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgU3RhY2tUcmFjZUdQUyhvcHRzKTtcbiAgICAgICAgfVxuICAgICAgICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICAgICAgICB0aGlzLnNvdXJjZUNhY2hlID0gb3B0cy5zb3VyY2VDYWNoZSB8fCB7fTtcblxuICAgICAgICB0aGlzLl9nZXQgPSBmdW5jdGlvbiBfZ2V0KGxvY2F0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNvdXJjZUNhY2hlW2xvY2F0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHRoaXMuc291cmNlQ2FjaGVbbG9jYXRpb25dKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG9wdHMub2ZmbGluZSkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdDYW5ub3QgbWFrZSBuZXR3b3JrIHJlcXVlc3RzIGluIG9mZmxpbmUgbW9kZScpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBfeGRyKGxvY2F0aW9uLCBmdW5jdGlvbiAoc291cmNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZUNhY2hlW2xvY2F0aW9uXSA9IHNvdXJjZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoc291cmNlKTtcbiAgICAgICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMpLCByZWplY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdpdmVuIGEgU3RhY2tGcmFtZSwgZW5oYW5jZSBmdW5jdGlvbiBuYW1lIGFuZCB1c2Ugc291cmNlIG1hcHMgZm9yIGFcbiAgICAgICAgICogYmV0dGVyIFN0YWNrRnJhbWUuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSBzdGFja2ZyYW1lIC0ge1N0YWNrRnJhbWV9LWxpa2Ugb2JqZWN0XG4gICAgICAgICAqICAgICAge2ZpbGVOYW1lOiAncGF0aC90by9maWxlLmpzJywgbGluZU51bWJlcjogMTAwLCBjb2x1bW5OdW1iZXI6IDV9XG4gICAgICAgICAqIEByZXR1cm4gU3RhY2tGcmFtZSB3aXRoIHNvdXJjZS1tYXBwZWQgbG9jYXRpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucGlucG9pbnQgPSBmdW5jdGlvbiBTdGFja1RyYWNlR1BTJCRwaW5wb2ludChzdGFja2ZyYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0TWFwcGVkTG9jYXRpb24oc3RhY2tmcmFtZSkudGhlbihmdW5jdGlvbiAobWFwcGVkU3RhY2tGcmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiByZXNvbHZlTWFwcGVkU3RhY2tGcmFtZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUobWFwcGVkU3RhY2tGcmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbmRGdW5jdGlvbk5hbWUobWFwcGVkU3RhY2tGcmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKHJlc29sdmUsIHJlc29sdmVNYXBwZWRTdGFja0ZyYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgWydjYXRjaCddKHJlc29sdmVNYXBwZWRTdGFja0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcyksIHJlamVjdCk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBHaXZlbiBhIFN0YWNrRnJhbWUsIGd1ZXNzIGZ1bmN0aW9uIG5hbWUgZnJvbSBsb2NhdGlvbiBpbmZvcm1hdGlvbi5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHN0YWNrZnJhbWUgLSB7U3RhY2tGcmFtZX0tbGlrZSBvYmplY3RcbiAgICAgICAgICogICAgICB7ZmlsZU5hbWU6ICdwYXRoL3RvL2ZpbGUuanMnLCBsaW5lTnVtYmVyOiAxMDAsIGNvbHVtbk51bWJlcjogNX1cbiAgICAgICAgICogQHJldHVybiBTdGFja0ZyYW1lIHdpdGggZ3Vlc3NlZCBmdW5jdGlvbiBuYW1lXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmZpbmRGdW5jdGlvbk5hbWUgPSBmdW5jdGlvbiBTdGFja1RyYWNlR1BTJCRmaW5kRnVuY3Rpb25OYW1lKHN0YWNrZnJhbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICAgICAgX2Vuc3VyZVN0YWNrRnJhbWVJc0xlZ2l0KHN0YWNrZnJhbWUpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2dldChzdGFja2ZyYW1lLmZpbGVOYW1lKS50aGVuKGZ1bmN0aW9uIGdldFNvdXJjZUNhbGxiYWNrKHNvdXJjZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZ3Vlc3NlZEZ1bmN0aW9uTmFtZSA9IF9maW5kRnVuY3Rpb25OYW1lKHNvdXJjZSwgc3RhY2tmcmFtZS5saW5lTnVtYmVyLCBzdGFja2ZyYW1lLmNvbHVtbk51bWJlcik7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUobmV3IFN0YWNrRnJhbWUoZ3Vlc3NlZEZ1bmN0aW9uTmFtZSwgc3RhY2tmcmFtZS5hcmdzLCBzdGFja2ZyYW1lLmZpbGVOYW1lLCBzdGFja2ZyYW1lLmxpbmVOdW1iZXIsIHN0YWNrZnJhbWUuY29sdW1uTnVtYmVyKSk7XG4gICAgICAgICAgICAgICAgfSwgcmVqZWN0KTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdpdmVuIGEgU3RhY2tGcmFtZSwgc2VlayBzb3VyY2UtbWFwcGVkIGxvY2F0aW9uIGFuZCByZXR1cm4gbmV3IGVuaGFuY2VkIFN0YWNrRnJhbWUuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSBzdGFja2ZyYW1lIC0ge1N0YWNrRnJhbWV9LWxpa2Ugb2JqZWN0XG4gICAgICAgICAqICAgICAge2ZpbGVOYW1lOiAncGF0aC90by9maWxlLmpzJywgbGluZU51bWJlcjogMTAwLCBjb2x1bW5OdW1iZXI6IDV9XG4gICAgICAgICAqIEByZXR1cm4gU3RhY2tGcmFtZSB3aXRoIHNvdXJjZS1tYXBwZWQgbG9jYXRpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZ2V0TWFwcGVkTG9jYXRpb24gPSBmdW5jdGlvbiBTdGFja1RyYWNlR1BTJCRnZXRNYXBwZWRMb2NhdGlvbihzdGFja2ZyYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgICAgIF9lbnN1cmVTdXBwb3J0ZWRFbnZpcm9ubWVudCgpO1xuICAgICAgICAgICAgICAgIF9lbnN1cmVTdGFja0ZyYW1lSXNMZWdpdChzdGFja2ZyYW1lKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX2dldChzdGFja2ZyYW1lLmZpbGVOYW1lKS50aGVuKGZ1bmN0aW9uIChzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZ2V0KF9maW5kU291cmNlTWFwcGluZ1VSTChzb3VyY2UpKS50aGVuKGZ1bmN0aW9uIChtYXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gc3RhY2tmcmFtZS5saW5lTnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbHVtbk51bWJlciA9IHN0YWNrZnJhbWUuY29sdW1uTnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShfbmV3TG9jYXRpb25JbmZvRnJvbVNvdXJjZU1hcChtYXAsIHN0YWNrZnJhbWUuYXJncywgbGluZU51bWJlciwgY29sdW1uTnVtYmVyKSk7XG4gICAgICAgICAgICAgICAgICAgIH0sIHJlamVjdClbJ2NhdGNoJ10ocmVqZWN0KTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcyksIHJlamVjdClbJ2NhdGNoJ10ocmVqZWN0KTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH07XG4gICAgfTtcbn0pKTtcbiIsIihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICAvLyBVbml2ZXJzYWwgTW9kdWxlIERlZmluaXRpb24gKFVNRCkgdG8gc3VwcG9ydCBBTUQsIENvbW1vbkpTL05vZGUuanMsIFJoaW5vLCBhbmQgYnJvd3NlcnMuXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoJ3N0YWNrdHJhY2UnLCBbJ2Vycm9yLXN0YWNrLXBhcnNlcicsICdzdGFjay1nZW5lcmF0b3InLCAnc3RhY2t0cmFjZS1ncHMnLCAnZXM2LXByb21pc2UnXSwgZmFjdG9yeSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoJ2Vycm9yLXN0YWNrLXBhcnNlcicpLCByZXF1aXJlKCdzdGFjay1nZW5lcmF0b3InKSwgcmVxdWlyZSgnc3RhY2t0cmFjZS1ncHMnKSwgcmVxdWlyZSgnZXM2LXByb21pc2UnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcm9vdC5TdGFja1RyYWNlID0gZmFjdG9yeShyb290LkVycm9yU3RhY2tQYXJzZXIsIHJvb3QuU3RhY2tHZW5lcmF0b3IsIHJvb3QuU3RhY2tUcmFjZUdQUywgcm9vdC5FUzZQcm9taXNlKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uIFN0YWNrVHJhY2UoRXJyb3JTdGFja1BhcnNlciwgU3RhY2tHZW5lcmF0b3IsIFN0YWNrVHJhY2VHUFMsIEVTNlByb21pc2UpIHtcbiAgICBFUzZQcm9taXNlLnBvbHlmaWxsKCk7XG4gICAgdmFyIFByb21pc2UgPSBFUzZQcm9taXNlLlByb21pc2U7XG5cbiAgICB2YXIgX29wdGlvbnMgPSB7XG4gICAgICAgIGZpbHRlcjogZnVuY3Rpb24gKHN0YWNrZnJhbWUpIHtcbiAgICAgICAgICAgIC8vIEZpbHRlciBvdXQgc3RhY2tmcmFtZXMgZm9yIHRoaXMgbGlicmFyeSBieSBkZWZhdWx0XG4gICAgICAgICAgICByZXR1cm4gKHN0YWNrZnJhbWUuZnVuY3Rpb25OYW1lIHx8ICcnKS5pbmRleE9mKCdTdGFja1RyYWNlJCQnKSA9PT0gLTEgJiZcbiAgICAgICAgICAgICAgICAoc3RhY2tmcmFtZS5mdW5jdGlvbk5hbWUgfHwgJycpLmluZGV4T2YoJ0Vycm9yU3RhY2tQYXJzZXIkJCcpID09PSAtMSAmJlxuICAgICAgICAgICAgICAgIChzdGFja2ZyYW1lLmZ1bmN0aW9uTmFtZSB8fCAnJykuaW5kZXhPZignU3RhY2tUcmFjZUdQUyQkJykgPT09IC0xICYmXG4gICAgICAgICAgICAgICAgKHN0YWNrZnJhbWUuZnVuY3Rpb25OYW1lIHx8ICcnKS5pbmRleE9mKCdTdGFja0dlbmVyYXRvciQkJykgPT09IC0xO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIE1lcmdlIDIgZ2l2ZW4gT2JqZWN0cy4gSWYgYSBjb25mbGljdCBvY2N1cnMgdGhlIHNlY29uZCBvYmplY3Qgd2lucy5cbiAgICAgKiBEb2VzIG5vdCBkbyBkZWVwIG1lcmdlcy5cbiAgICAgKiBAcGFyYW0gZmlyc3QgT2JqZWN0XG4gICAgICogQHBhcmFtIHNlY29uZCBPYmplY3RcbiAgICAgKiBAcmV0dXJucyBuZXcgT2JqZWN0IG1lcmdlZCBmaXJzdCBhbmQgc2Vjb25kXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBfbWVyZ2UoZmlyc3QsIHNlY29uZCkge1xuICAgICAgICB2YXIgdGFyZ2V0ID0ge307XG5cbiAgICAgICAgW2ZpcnN0LCBzZWNvbmRdLmZvckVhY2goZnVuY3Rpb24gKG9iaikge1xuICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBvYmopIHtcbiAgICAgICAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IG9ialtwcm9wXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0O1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGFyZ2V0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pc1NoYXBlZExpa2VQYXJzYWJsZUVycm9yKGVycikge1xuICAgICAgICByZXR1cm4gZXJyLnN0YWNrIHx8IGVyclsnb3BlcmEjc291cmNlbG9jJ107XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdldCBhIGJhY2t0cmFjZSBmcm9tIGludm9jYXRpb24gcG9pbnQuXG4gICAgICAgICAqIEBwYXJhbSBvcHRzIE9wdGlvbnMgT2JqZWN0XG4gICAgICAgICAqIEByZXR1cm4gQXJyYXlbU3RhY2tGcmFtZV1cbiAgICAgICAgICovXG4gICAgICAgIGdldDogZnVuY3Rpb24gU3RhY2tUcmFjZSQkZ2V0KG9wdHMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gRXJyb3IgbXVzdCBiZSB0aHJvd24gdG8gZ2V0IHN0YWNrIGluIElFXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoX2lzU2hhcGVkTGlrZVBhcnNhYmxlRXJyb3IoZXJyKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5mcm9tRXJyb3IoZXJyLCBvcHRzKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZUFydGlmaWNpYWxseShvcHRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdpdmVuIGFuIGVycm9yIG9iamVjdCwgcGFyc2UgaXQuXG4gICAgICAgICAqIEBwYXJhbSBlcnJvciBFcnJvciBvYmplY3RcbiAgICAgICAgICogQHBhcmFtIG9wdHMgT2JqZWN0IGZvciBvcHRpb25zXG4gICAgICAgICAqIEByZXR1cm4gQXJyYXlbU3RhY2tGcmFtZV1cbiAgICAgICAgICovXG4gICAgICAgIGZyb21FcnJvcjogZnVuY3Rpb24gU3RhY2tUcmFjZSQkZnJvbUVycm9yKGVycm9yLCBvcHRzKSB7XG4gICAgICAgICAgICBvcHRzID0gX21lcmdlKF9vcHRpb25zLCBvcHRzKTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSkge1xuICAgICAgICAgICAgICAgIHZhciBzdGFja2ZyYW1lcyA9IEVycm9yU3RhY2tQYXJzZXIucGFyc2UoZXJyb3IpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygb3B0cy5maWx0ZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tmcmFtZXMgPSBzdGFja2ZyYW1lcy5maWx0ZXIob3B0cy5maWx0ZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKFByb21pc2UuYWxsKHN0YWNrZnJhbWVzLm1hcChmdW5jdGlvbiAoc2YpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiByZXNvbHZlT3JpZ2luYWwoXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoc2YpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgU3RhY2tUcmFjZUdQUyhvcHRzKS5waW5wb2ludChzZilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbihyZXNvbHZlLCByZXNvbHZlT3JpZ2luYWwpWydjYXRjaCddKHJlc29sdmVPcmlnaW5hbCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pKSk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBVc2UgU3RhY2tHZW5lcmF0b3IgdG8gZ2VuZXJhdGUgYSBiYWNrdHJhY2UuXG4gICAgICAgICAqIEBwYXJhbSBvcHRzIE9iamVjdCBvcHRpb25zXG4gICAgICAgICAqIEByZXR1cm5zIEFycmF5W1N0YWNrRnJhbWVdXG4gICAgICAgICAqL1xuICAgICAgICBnZW5lcmF0ZUFydGlmaWNpYWxseTogZnVuY3Rpb24gU3RhY2tUcmFjZSQkZ2VuZXJhdGVBcnRpZmljaWFsbHkob3B0cykge1xuICAgICAgICAgICAgb3B0cyA9IF9tZXJnZShfb3B0aW9ucywgb3B0cyk7XG4gICAgICAgICAgICB2YXIgc3RhY2tGcmFtZXMgPSBTdGFja0dlbmVyYXRvci5iYWNrdHJhY2Uob3B0cyk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9wdHMuZmlsdGVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgc3RhY2tGcmFtZXMgPSBzdGFja0ZyYW1lcy5maWx0ZXIob3B0cy5maWx0ZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdGFja0ZyYW1lcyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdpdmVuIGEgZnVuY3Rpb24sIHdyYXAgaXQgc3VjaCB0aGF0IGludm9jYXRpb25zIHRyaWdnZXIgYSBjYWxsYmFjayB0aGF0XG4gICAgICAgICAqIGlzIGNhbGxlZCB3aXRoIGEgc3RhY2sgdHJhY2UuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIHRvIGJlIGluc3RydW1lbnRlZFxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvbiB0byBjYWxsIHdpdGggYSBzdGFjayB0cmFjZSBvbiBpbnZvY2F0aW9uXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGVycmJhY2sgb3B0aW9uYWwgZnVuY3Rpb24gdG8gY2FsbCB3aXRoIGVycm9yIGlmIHVuYWJsZSB0byBnZXQgc3RhY2sgdHJhY2UuXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0aGlzQXJnIG9wdGlvbmFsIGNvbnRleHQgb2JqZWN0IChlLmcuIHdpbmRvdylcbiAgICAgICAgICovXG4gICAgICAgIGluc3RydW1lbnQ6IGZ1bmN0aW9uIFN0YWNrVHJhY2UkJGluc3RydW1lbnQoZm4sIGNhbGxiYWNrLCBlcnJiYWNrLCB0aGlzQXJnKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgaW5zdHJ1bWVudCBub24tZnVuY3Rpb24gb2JqZWN0Jyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmbi5fX3N0YWNrdHJhY2VPcmlnaW5hbEZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgLy8gQWxyZWFkeSBpbnN0cnVtZW50ZWQsIHJldHVybiBnaXZlbiBGdW5jdGlvblxuICAgICAgICAgICAgICAgIHJldHVybiBmbjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGluc3RydW1lbnRlZCA9IGZ1bmN0aW9uIFN0YWNrVHJhY2UkJGluc3RydW1lbnRlZCgpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdldCgpLnRoZW4oY2FsbGJhY2ssIGVycmJhY2spWydjYXRjaCddKGVycmJhY2spO1xuICAgICAgICAgICAgICAgICAgICBmbi5hcHBseSh0aGlzQXJnIHx8IHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoX2lzU2hhcGVkTGlrZVBhcnNhYmxlRXJyb3IoZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZnJvbUVycm9yKGUpLnRoZW4oY2FsbGJhY2ssIGVycmJhY2spWydjYXRjaCddKGVycmJhY2spO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgaW5zdHJ1bWVudGVkLl9fc3RhY2t0cmFjZU9yaWdpbmFsRm4gPSBmbjtcblxuICAgICAgICAgICAgcmV0dXJuIGluc3RydW1lbnRlZDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogR2l2ZW4gYSBmdW5jdGlvbiB0aGF0IGhhcyBiZWVuIGluc3RydW1lbnRlZCxcbiAgICAgICAgICogcmV2ZXJ0IHRoZSBmdW5jdGlvbiB0byBpdCdzIG9yaWdpbmFsIChub24taW5zdHJ1bWVudGVkKSBzdGF0ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIGZuIHtGdW5jdGlvbn1cbiAgICAgICAgICovXG4gICAgICAgIGRlaW5zdHJ1bWVudDogZnVuY3Rpb24gU3RhY2tUcmFjZSQkZGVpbnN0cnVtZW50KGZuKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZGUtaW5zdHJ1bWVudCBub24tZnVuY3Rpb24gb2JqZWN0Jyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmbi5fX3N0YWNrdHJhY2VPcmlnaW5hbEZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZuLl9fc3RhY2t0cmFjZU9yaWdpbmFsRm47XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEZ1bmN0aW9uIG5vdCBpbnN0cnVtZW50ZWQsIHJldHVybiBvcmlnaW5hbFxuICAgICAgICAgICAgICAgIHJldHVybiBmbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59KSk7XG4iLCJcInVzZSBzdHJpY3RcIjtcclxuLyogQ29weXJpZ2h0IChjKSAyMDE0IEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xyXG5cclxudmFyIGRlYWR1bml0Q29yZSA9IHJlcXVpcmUoXCIuL2RlYWR1bml0Q29yZVwiKVxyXG52YXIgYnJvd3NlckNvbmZpZyA9IHJlcXVpcmUoJy4vZGVhZHVuaXRDb3JlLmJyb3dzZXJDb25maWcnKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBkZWFkdW5pdENvcmUoYnJvd3NlckNvbmZpZygpKSIsIlwidXNlIHN0cmljdFwiO1xuLyogQ29weXJpZ2h0IChjKSAyMDE0IEJpbGx5IFRldHJ1ZCAtIEZyZWUgdG8gdXNlIGZvciBhbnkgcHVycG9zZTogTUlUIExpY2Vuc2UqL1xuXG52YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxudmFyIEZ1dHVyZSA9IHJlcXVpcmUoJ2FzeW5jLWZ1dHVyZScpXG52YXIgcHJvdG8gPSByZXF1aXJlKCdwcm90bycpXG52YXIgc3RhY2t0cmFjZWpzID0gcmVxdWlyZSgnc3RhY2t0cmFjZS1qcycpXG52YXIgYWpheCA9IHJlcXVpcmUoXCJhamF4XCIpXG52YXIgcmVzb2x2ZVNvdXJjZU1hcCA9IEZ1dHVyZS53cmFwKHJlcXVpcmUoJ3NvdXJjZS1tYXAtcmVzb2x2ZScpLnJlc29sdmVTb3VyY2VNYXApXG5cbnZhciBkZWFkdW5pdENvcmUgPSByZXF1aXJlKFwiLi9kZWFkdW5pdENvcmVcIilcbnZhciBpc1JlbGF0aXZlID0gcmVxdWlyZSgnLi9pc1JlbGF0aXZlJylcblxuLy9hamF4LnNldFN5bmNocm9ub3VzKHRydWUpIC8vIHRvZG86IFJFTU9WRSBUSElTIG9uY2UgdGhpcyBjaHJvbWUgYnVnIGlzIGZpeGVkIGluIGEgcHVibGljIHJlbGVhc2U6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0zNjg0NDRcblxudmFyIHNvdXJjZUNhY2hlID0ge31cbi8qIHRvZG86IGFkZCBzb21ldGhpbmcgbGlrZSB0aGlzIGJhY2sgb25jZSBzdGFja3RyYWNlLWpzIHN1cHBvcnQgc3dhcHBpbmcgb3V0IGFqYXggaW1wbGVtZW50YXRpb25zXG4vLyBhZGQgc291cmNlRmlsZSBjb250ZW50cyBpbnRvIHN0YWNrdHJhY2UuanMncyBjYWNoZVxuXG52YXIgY2FjaGVHZXQgPSBmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gc291cmNlQ2FjaGVbdXJsXVxufVxudmFyIGNhY2hlU2V0ID0gZnVuY3Rpb24odXJsLCByZXNwb25zZUZ1dHVyZSkge1xuICAgIHNvdXJjZUNhY2hlW3VybF0gPSByZXNwb25zZUZ1dHVyZVxuICAgIGlmKHN0YWNraW5mby5zb3VyY2VDYWNoZVt1cmxdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmVzcG9uc2VGdXR1cmUudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgc3RhY2tpbmZvLnNvdXJjZUNhY2hlW3VybF0gPSByZXNwb25zZS50ZXh0LnNwbGl0KCdcXG4nKVxuICAgICAgICB9KS5kb25lKClcbiAgICB9XG59XG5cbi8vIHdoYXQgd2FzIHRoaXMgZm9yP1xuaWYod2luZG93LnNldEltbWVkaWF0ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgd2luZG93LnNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uKGZuLCBwYXJhbXMpIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZuLmFwcGx5KHRoaXMscGFyYW1zKVxuICAgICAgICB9LDApXG4gICAgfVxufVxuXG5cbi8vYWpheC5jYWNoZUdldChjYWNoZUdldClcbi8vYWpheC5jYWNoZVNldChjYWNoZVNldClcbiovXG5cblxudmFyIGNvbmZpZyA9IG1vZHVsZS5leHBvcnRzID0gcHJvdG8oZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpc1xuICAgICAgICAvLyBub2RlLmpzIGVycmJhY2sgc3R5bGUgcmVhZEZpbGVcbiAgICAgICAgLypwcml2YXRlKi8gdGhpcy5yZWFkRmlsZSA9IGZ1bmN0aW9uKHVybCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRoYXQuYWpheCh1cmwpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHsgLy8gbmVlZCB0byB1c2UgJ3RoYXQnIGJlY2F1c2UgcmVhZEZpbGUgd2lsbCBub3QgYmUgY2FsbGVkIHdpdGggdGhpcyBjb25maWcgb2JqZWN0IGFzIHRoZSBjb250ZXh0XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXNwb25zZS50ZXh0KVxuICAgICAgICAgICAgfSkuY2F0Y2goY2FsbGJhY2spLmRvbmUoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5hamF4ID0gYWpheFxuXG4gICAgdGhpcy5pbml0aWFsaXplID0gZnVuY3Rpb24oKSB7fVxuXG4gICAgdGhpcy5pbml0aWFsaXplTWFpblRlc3QgPSBmdW5jdGlvbih0ZXN0U3RhdGUpIHtcbiAgICAgICAgLy90ZXN0U3RhdGUuYWN0aXZlID0gdHJ1ZSAvLyBtYWtlIHN1cmVcblxuICAgICAgICB0ZXN0U3RhdGUub2xkT25lcnJvciA9IHdpbmRvdy5vbmVycm9yXG4gICAgICAgIHRlc3RTdGF0ZS5uZXdPbmVycm9yID0gd2luZG93Lm9uZXJyb3IgPSBmdW5jdGlvbihlcnJvck1lc3NhZ2UsIGZpbGVuYW1lLCBsaW5lLCBjb2x1bW4pIHtcbiAgICAgICAgICAgIGlmKGNvbHVtbiA9PT0gdW5kZWZpbmVkKSB2YXIgY29sdW1uVGV4dCA9ICcnXG4gICAgICAgICAgICBlbHNlICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbHVtblRleHQgPSBcIi9cIitjb2x1bW5cblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmNhdWdodCBlcnJvciBpbiBcIitmaWxlbmFtZStcIiBsaW5lIFwiK2xpbmUrY29sdW1uVGV4dCtcIjogXCIrZXJyb3JNZXNzYWdlKSAvLyBJRSBuZWVkcyB0aGUgZXhjZXB0aW9uIHRvIGFjdHVhbGx5IGJlIHRocm93biBiZWZvcmUgaXQgd2lsbCBoYXZlIGEgc3RhY2sgdHJhY2VcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIHRlc3RTdGF0ZS51bmhhbmRsZWRFcnJvckhhbmRsZXIoZSwgdHJ1ZSlcbiAgICAgICAgICAgICAgICBpZih0ZXN0U3RhdGUub2xkT25lcnJvcilcbiAgICAgICAgICAgICAgICAgICAgdGVzdFN0YXRlLm9sZE9uZXJyb3IuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRoaXMubWFpblRlc3REb25lPSBmdW5jdGlvbih0ZXN0U3RhdGUpIHtcbiAgICAgICAgLy90ZXN0U3RhdGUuYWN0aXZlID0gZmFsc2UgLy8gbWFrZSBzdXJlIHRoZSB0ZXN0LXNwZWNpZmljIG9uZXJyb3IgY29kZSBpcyBubyBsb25nZXIgcnVuXG4gICAgICAgIC8qaWYodGVzdFN0YXRlLm5ld09uZXJyb3IgPT09IHdpbmRvdy5vbmVycm9yKSB7XG4gICAgICAgICAgICB3aW5kb3cub25lcnJvciA9IHRlc3RTdGF0ZS5vbGRPbmVycm9yIC8vIG90aGVyd2lzZSBzb21ldGhpbmcgZWxzZSBoYXMgb3ZlcndyaXR0ZW4gb25lcnJvciwgc28gZG9uJ3QgbWVzcyB3aXRoIGl0XG4gICAgICAgIH0qL1xuICAgIH1cblxuICAgIHRoaXMuZ2V0RG9tYWluPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZCAvLyBkb21haW5zIGRvbid0IGV4aXN0IGluLWJyb3dzZXJcbiAgICB9XG5cbiAgICB0aGlzLnJ1blRlc3RHcm91cD0gZnVuY3Rpb24oZGVhZHVuaXRTdGF0ZSwgdGVzdGVyLCBydW5UZXN0LCBoYW5kbGVFcnJvciwgaGFuZGxlVW5oYW5kbGVkRXJyb3IpIHtcbiAgICAgICAgcnVuVGVzdCgpXG4gICAgfVxuICAgIHRoaXMuZ2V0U2NyaXB0U291cmNlTGluZXM9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgICAgICAgLyogdG9kbzogZmlndXJlIG91dCB3aGF0IHRvIGRvIGhlcmUgd2hlbiB5b3UgY2FuIG1lcmdlIGZpbGUgY2FjaGVzIHdpdGggc3RhY2t0cmFjZS5qc1xuICAgICAgICBpZihzdGFja2luZm8uc291cmNlQ2FjaGVbcGF0aF0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShzdGFja2luZm8uc291cmNlQ2FjaGVbcGF0aF0pXG4gICAgICAgIH0gZWxzZSB7Ki9cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFqYXgocGF0aCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUocmVzcG9uc2UudGV4dC5zcGxpdCgnXFxuJykpXG4gICAgICAgICAgICB9KVxuICAgICAgICAvL31cblxuICAgIH1cbiAgICB0aGlzLmdldFNvdXJjZU1hcE9iamVjdCA9IGZ1bmN0aW9uKHVybCwgd2FybmluZ0hhbmRsZXIpIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgICAgIHJldHVybiB0aGlzLmFqYXgodXJsKS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICB2YXIgaGVhZGVycyA9IHJlc3BvbnNlLmhlYWRlcnNcbiAgICAgICAgICAgIGlmKGhlYWRlcnNbJ1NvdXJjZU1hcCddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YXIgaGVhZGVyU291cmNlTWFwID0gaGVhZGVyc1snU291cmNlTWFwJ11cbiAgICAgICAgICAgIH0gZWxzZSBpZihoZWFkZXJzWydYLVNvdXJjZU1hcCddKSB7XG4gICAgICAgICAgICAgICAgdmFyIGhlYWRlclNvdXJjZU1hcCA9IGhlYWRlcnNbJ1gtU291cmNlTWFwJ11cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoaGVhZGVyU291cmNlTWFwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBpZihpc1JlbGF0aXZlKGhlYWRlclNvdXJjZU1hcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyU291cmNlTWFwID0gcGF0aC5qb2luKHBhdGguZGlybmFtZSh1cmwpLGhlYWRlclNvdXJjZU1hcClcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhhdC5hamF4KGhlYWRlclNvdXJjZU1hcCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKEpTT04ucGFyc2UocmVzcG9uc2UudGV4dCkpXG4gICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZVNvdXJjZU1hcChyZXNwb25zZS50ZXh0LCB1cmwsIHRoYXQucmVhZEZpbGUpLmNhdGNoKGZ1bmN0aW9uKGUpe1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nSGFuZGxlcihlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKG51bGwpXG5cbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcE9iamVjdCkge1xuICAgICAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBPYmplY3QgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUoc291cmNlTWFwT2JqZWN0Lm1hcClcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB0aGlzLmRlZmF1bHRVbmhhbmRsZWRFcnJvckhhbmRsZXI9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgLy9pZihlICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmKGUuc3RhY2spXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGUuc3RhY2spXG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhlKVxuICAgICAgICAgICAgfSwwKVxuICAgIH1cbiAgICB0aGlzLmRlZmF1bHRUZXN0RXJyb3JIYW5kbGVyPSBmdW5jdGlvbih0ZXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHRlc3Rlci5tYW5hZ2VyLmVtaXQoJ2V4Y2VwdGlvbicsIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IHRlc3Rlci5tYWluU3ViVGVzdC5pZCxcbiAgICAgICAgICAgICAgICB0aW1lOiAobmV3IERhdGUoKSkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgIGVycm9yOiBlXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5nZXRMaW5lSW5mbz0gZnVuY3Rpb24oc3RhY2tJbmNyZWFzZSkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEZ1dHVyZVxuICAgICAgICBzdGFja3RyYWNlanMuZ2V0KHtzb3VyY2VDYWNoZTogc291cmNlQ2FjaGV9KS50aGVuKGZ1bmN0aW9uKHN0YWNrRnJhbWVzKXtcbiAgICAgICAgICAgIHZhciBmcmFtZSA9IHN0YWNrRnJhbWVzWzMrc3RhY2tJbmNyZWFzZV1cbiAgICAgICAgICAgIHJlc3VsdC5yZXR1cm4oe1xuICAgICAgICAgICAgICAgICdmdW5jdGlvbic6IGZyYW1lLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICBsaW5lOiBmcmFtZS5saW5lTnVtYmVyLFxuICAgICAgICAgICAgICAgIGNvbHVtbjogZnJhbWUuY29sdW1uTnVtYmVyLFxuICAgICAgICAgICAgICAgIGZpbGU6IGZyYW1lLmZpbGVOYW1lXG4gICAgICAgICAgICB9KVxuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICByZXN1bHQudGhyb3coZSlcbiAgICAgICAgfSlcblxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuXG4gICAgdGhpcy5nZXRFeGNlcHRpb25JbmZvPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgRnV0dXJlXG4gICAgICAgIHN0YWNrdHJhY2Vqcy5mcm9tRXJyb3IoZSwge3NvdXJjZUNhY2hlOiBzb3VyY2VDYWNoZX0pLnRoZW4oZnVuY3Rpb24oc3RhY2tGcmFtZXMpe1xuICAgICAgICAgICAgcmVzdWx0LnJldHVybihzdGFja0ZyYW1lcy5tYXAoZnVuY3Rpb24oZnJhbWUpe1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICdmdW5jdGlvbic6IGZyYW1lLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgbGluZTogZnJhbWUubGluZU51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uOiBmcmFtZS5jb2x1bW5OdW1iZXIsXG4gICAgICAgICAgICAgICAgICAgIGZpbGU6IGZyYW1lLmZpbGVOYW1lXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkpXG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHJlc3VsdC50aHJvdyhlKVxuICAgICAgICB9KVxuXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG5cbiAgICB0aGlzLnRocm93QXN5bmNFeGNlcHRpb24gPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZihlLnN0YWNrICE9PSB1bmRlZmluZWQpIHRocm93IGUuc3RhY2tcbiAgICAgICAgICAgIGVsc2UgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZVxuICAgICAgICB9LDApXG4gICAgfVxufSkiLCJcInVzZSBzdHJpY3RcIjtcbi8qIENvcHlyaWdodCAoYykgMjAxMyBCaWxseSBUZXRydWQgLSBGcmVlIHRvIHVzZSBmb3IgYW55IHB1cnBvc2U6IE1JVCBMaWNlbnNlKi9cblxudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJylcbnZhciBVcmwgPSByZXF1aXJlKFwidXJsXCIpXG5cbnZhciBwcm90byA9IHJlcXVpcmUoJ3Byb3RvJylcbnZhciBGdXR1cmUgPSByZXF1aXJlKCdhc3luYy1mdXR1cmUnKVxudmFyIFNvdXJjZU1hcENvbnN1bWVyID0gcmVxdWlyZSgnc291cmNlLW1hcCcpLlNvdXJjZU1hcENvbnN1bWVyXG5cbnZhciBwcm9jZXNzUmVzdWx0cyA9IHJlcXVpcmUoJy4vcHJvY2Vzc1Jlc3VsdHMnKVxudmFyIGlzUmVsYXRpdmUgPSByZXF1aXJlKCcuL2lzUmVsYXRpdmUnKVxuXG4vLyByZXR1cm5zIGEgbW9kdWxlIGludGVuZGVkIGZvciBhIHNwZWNpZmljIGVudmlyb25tZW50ICh0aGF0IGVudmlyb25tZW50IGJlaW5nIGRlc2NyaWJlZCBieSB0aGUgb3B0aW9ucylcbi8vIG9wdGlvbnMgY2FuIGNvbnRhaW46XG4gICAgLy8gaW5pdGlhbGl6YXRpb24gLSBhIGZ1bmN0aW9uIHJ1biBvbmNlIHRoYXQgY2FuIHNldHVwIHRoaW5ncyAobGlrZSBhIGdsb2JhbCBlcnJvciBoYW5kbGVyKS5cbiAgICAgICAgLy8gR2V0cyBhIHNpbmdsZSBwYXJhbWV0ZXIgJ3N0YXRlJyB3aGljaCBoYXMgdGhlIGZvbGxvd2luZyBmb3JtOlxuICAgICAgICAgICAgLy8gdW5oYW5kbGVkRXJyb3JIYW5kbGVyKGVycm9yLHdhcm4pXG4gICAgLy8gaW5pdGlhbGl6ZU1haW5UZXN0IC0gYSBmdW5jdGlvbiBydW4gb25jZSB0aGF0IGNhbiBzZXR1cCB0aGluZ3MgKGxpa2UgYSB0ZXN0LXNwZWNpZmljIGhhbmRsZXIpLlxuICAgICAgICAvLyBHZXRzIGEgc2luZ2xlIHBhcmFtZXRlciAnbWFpblRlc3RTdGF0ZScgd2hpY2ggaGFzIHRoZSBmb2xsb3dpbmcgZm9ybTpcbiAgICAgICAgICAgIC8vIHVuaGFuZGxlZEVycm9ySGFuZGxlcihlcnJvcix3YXJuKSAtIHRoZSBlcnJvciBoYW5kbGVyIGZvciB0aGF0IHRlc3RcbiAgICAvLyBnZXREb21haW4gLSBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgY3VycmVudCBkb21haW4sIG9yIHVuZGVmaW5lZCBpZiB0aGUgZW52aXJvbm1lbnQgKCpjb3VnaCogYnJvd3NlcnMpIGRvZXNuJ3QgaGF2ZSBkb21haW5zXG4gICAgLy8gZ2V0U291cmNlTWFwT2JqZWN0IC0gYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBmdXR1cmUgb2YgdGhlIHByZS1wYXJzZWQgc291cmNlIG1hcCBvYmplY3QgZm9yIGEgZmlsZSwgb3IgZnV0dXJlIHVuZGVmaW5lZFxuICAgICAgICAvLyBnZXRzIHRoZSBwYXJhbWV0ZXI6XG4gICAgICAgICAgICAvLyB1cmwgLSB0aGUgdXJsIG9mIHRoZSBmaWxlIHRvIGZpbmQgYSBzb3VyY2VtYXAgZm9yXG4gICAgICAgICAgICAvLyB3YXJuaW5nSGFuZGxlciAtIGEgd2FybmluZ0hhbmRsZXIgZnVuY3Rpb24gdGhhdCBleHBlY3RzIGFuIGVycm9yIHRvIGJlIHBhc3NlZCB0byBpdFxuICAgIC8vIHJ1blRlc3RHcm91cCAtIGEgZnVuY3Rpb24gcnVuIHRoYXQgYWxsb3dzIHlvdSB0byB3cmFwIHRoZSBhY3R1YWwgdGVzdCBydW4gaW4gc29tZSB3YXkgKGludGVuZGVkIGZvciBub2RlLmpzIGRvbWFpbnMpXG4gICAgICAgIC8vIGdldHMgcGFyYW1ldGVyczpcbiAgICAgICAgICAgIC8vIHN0YXRlIC0gdGhlIHNhbWUgc3RhdGUgb2JqZWN0IHNlbnQgaW50byBgaW5pdGlhbGl6YXRpb25gXG4gICAgICAgICAgICAvLyB0ZXN0ZXIgLSBhIFVuaXRUZXN0ZXIgb2JqZWN0IGZvciB0aGUgdGVzdFxuICAgICAgICAgICAgLy8gcnVuVGVzdCAtIHRoZSBmdW5jdGlvbiB0aGF0IHlvdSBzaG91bGQgY2FsbCB0byBydW4gdGhlIHRlc3QgZ3JvdXAuIEFscmVhZHkgaGFzIGEgc3luY2hyb25vdXMgdHJ5IGNhdGNoIGluc2lkZSBpdCAoc28geW91IGRvbid0IG5lZWQgdG8gd29ycnkgYWJvdXQgdGhhdClcbiAgICAgICAgICAgIC8vIGhhbmRsZUVycm9yIC0gYSBmdW5jdGlvbiB0aGF0IGhhbmRsZXMgYW4gZXJyb3IgaWYgb25lIGNvbWVzIHVwLiBUYWtlcyB0aGUgZXJyb3IgYXMgaXRzIG9ubHkgcGFyYW1ldGVyLiBSZXR1cm5zIGEgZnV0dXJlLlxuICAgIC8vIG1haW5UZXN0RG9uZSAtIGEgZnVuY3Rpb24gcnVuIG9uY2UgYSB0ZXN0IGlzIGRvbmVcbiAgICAgICAgLy8gZ2V0cyB0aGUgJ21haW5UZXN0U3RhdGUnIHBhcmFtZXRlclxuICAgIC8vIGRlZmF1bHRVbmhhbmRsZWRFcnJvckhhbmRsZXIgLSBhIGZ1bmN0aW9uIHRoYXQgaGFuZGxlcyBhbiBlcnJvciB1bmhhbmRsZWQgYnkgYW55IG90aGVyIGhhbmRsZXJcbiAgICAgICAgLy8gZ2V0cyB0aGUgJ2Vycm9yJyBhcyBpdHMgb25seSBwYXJhbWV0ZXJcbiAgICAvLyBkZWZhdWx0VGVzdEVycm9ySGFuZGxlciAtIGlzIHBhc3NlZCB0aGUgY3VycmVudCB0ZXN0LCBhbmQgc2hvdWxkIHJldHVybiBhIGZ1bmN0aW9uIHRoYXQgaGFuZGxlcyBhbiBlcnJvclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cbiAgICAvLyBhIHZhcmlhYmxlIHRoYXQgaG9sZHMgY2hhbmdlYWJsZSBzdGF0ZVxuICAgIHZhciBzdGF0ZSA9IHtcbiAgICAgICAgdW5oYW5kbGVkRXJyb3JIYW5kbGVyOiBvcHRpb25zLmRlZmF1bHRVbmhhbmRsZWRFcnJvckhhbmRsZXJcbiAgICB9XG5cbiAgICBvcHRpb25zLmluaXRpYWxpemUoc3RhdGUpXG5cbiAgICAvLyB0aGUgcHJvdG90eXBlIG9mIG9iamVjdHMgdXNlZCB0byBtYW5hZ2UgYWNjZXNzaW5nIGFuZCBkaXNwbGF5aW5nIHJlc3VsdHMgb2YgYSB1bml0IHRlc3RcbiAgICB2YXIgVW5pdFRlc3QgPSBwcm90byhmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5pbml0ID0gZnVuY3Rpb24oLyptYWluTmFtZT11bmRlZmluZWQsIGdyb3VwcyovKSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzXG4gICAgICAgICAgICB0aGlzLm1hbmFnZXIgPSBFdmVudE1hbmFnZXIodGhpcylcblxuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBydW5UZXN0LmNhbGwodGhhdCwgYXJncylcbiAgICAgICAgICAgIH0sMClcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZXZlbnRzID0gZnVuY3Rpb24oaGFuZGxlcnMpIHtcbiAgICAgICAgICAgIHRoaXMubWFuYWdlci5hZGQoaGFuZGxlcnMsIG9wdGlvbnMuZ2V0RG9tYWluKCkpXG4gICAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZXN1bHRzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvY2Vzc1Jlc3VsdHModGhpcylcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHByaXZhdGVcblxuICAgICAgICBmdW5jdGlvbiBydW5UZXN0KGFyZ3MpIHtcbiAgICAgICAgICAgIHZhciBmYWtlVGVzdCA9IG5ldyBVbml0VGVzdGVyKClcbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5pZCA9IHVuZGVmaW5lZCAvLyBmYWtlIHRlc3QgZG9lc24ndCBnZXQgYW4gaWRcbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5tYW5hZ2VyID0gdGhpcy5tYW5hZ2VyXG4gICAgICAgICAgICAgICAgZmFrZVRlc3QudGltZW91dHMgPSBbXVxuICAgICAgICAgICAgICAgIGZha2VUZXN0Lm9uRG9uZUNhbGxiYWNrcyA9IFtdXG5cbiAgICAgICAgICAgICAgICB2YXIgZ2V0VW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB1bmhhbmRsZWRFcnJvckhhbmRsZXIgPSBjcmVhdGVVbmhhbmRsZWRFcnJvckhhbmRsZXIoZmFrZVRlc3QubWFpblN1YlRlc3QpXG4gICAgICAgICAgICAgICAgICAgIGdldFVuaGFuZGxlZEVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKCkgeyAvLyBtZW1vaXplIHRoaXMganVua1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuaGFuZGxlZEVycm9ySGFuZGxlclxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmhhbmRsZWRFcnJvckhhbmRsZXJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmFrZVRlc3QubWFpblRlc3RTdGF0ZSA9IHtnZXQgdW5oYW5kbGVkRXJyb3JIYW5kbGVyKCl7cmV0dXJuIGdldFVuaGFuZGxlZEVycm9ySGFuZGxlcigpIHx8IG9wdGlvbnMuZGVmYXVsdFRlc3RFcnJvckhhbmRsZXIoZmFrZVRlc3QpfX1cblxuICAgICAgICAgICAgICAgIHZhciB3YXJuaW5nSW5mb01lc3NhZ2VIYXNCZWVuT3V0cHV0ID0gZmFsc2VcbiAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIudGVzdE9iamVjdC53YXJuaW5nSGFuZGxlciA9IGZha2VUZXN0Lndhcm5pbmdIYW5kbGVyID0gZnVuY3Rpb24odykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZXJyb3JIYW5kbGVyID0gZ2V0VW5oYW5kbGVkRXJyb3JIYW5kbGVyKClcbiAgICAgICAgICAgICAgICAgICAgaWYod2FybmluZ0luZm9NZXNzYWdlSGFzQmVlbk91dHB1dCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB3YXJuaW5nID0gbmV3RXJyb3IoXCJZb3UndmUgcmVjZWl2ZWQgYXQgbGVhc3Qgb25lIHdhcm5pbmcuIElmIHlvdSBkb24ndCB3YW50IHRvIHRyZWF0IHdhcm5pbmdzIGFzIGVycm9ycywgdXNlIHRoZSBgd2FybmluZ2AgbWV0aG9kIHRvIHJlZGVmaW5lIGhvdyB0byBoYW5kbGUgdGhlbS5cIilcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9ySGFuZGxlcih3YXJuaW5nLCBmYWxzZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdJbmZvTWVzc2FnZUhhc0JlZW5PdXRwdXQgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBlcnJvckhhbmRsZXIodywgZmFsc2UpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5pbml0aWFsaXplTWFpblRlc3QoZmFrZVRlc3QubWFpblRlc3RTdGF0ZSlcblxuICAgICAgICAgICAgICAgIHRpbWVvdXQoZmFrZVRlc3QsIDMwMDAsIHRydWUpIC8vIGluaXRpYWwgKGRlZmF1bHQpIHRpbWVvdXRcbiAgICAgICAgICAgICAgICBmYWtlVGVzdC5vbkRvbmUgPSBmdW5jdGlvbigpIHsgLy8gd2lsbCBleGVjdXRlIHdoZW4gdGhpcyB0ZXN0IGlzIGRvbmVcbiAgICAgICAgICAgICAgICAgICAgZmFrZVRlc3QubWFuYWdlci5sYXN0RW1pdEZ1dHVyZS50aGVuKGZ1bmN0aW9uKCkgeyAvLyB3YWl0IGZvciBhbGwgdGhlIGFscmVhZHktcmVnaXN0ZXJlZCBlbWl0cyB0byBlbWl0IGJlZm9yZSBmaW5hbGl6aW5nIHRoZSB0ZXN0XG4gICAgICAgICAgICAgICAgICAgICAgICBkb25lKGZha2VUZXN0KVxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5tYWluVGVzdERvbmUoZmFrZVRlc3QubWFpblRlc3RTdGF0ZSlcbiAgICAgICAgICAgICAgICAgICAgfSkuZG9uZSgpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZha2VUZXN0LmNhbGxPbkRvbmUgPSBmdW5jdGlvbihjYikge1xuICAgICAgICAgICAgICAgICAgICBmYWtlVGVzdC5vbkRvbmVDYWxsYmFja3MucHVzaChjYilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIFVuaXRUZXN0ZXIucHJvdG90eXBlLnRlc3QuYXBwbHkoZmFrZVRlc3QsIGFyZ3MpIC8vIHNldCBzbyB0aGUgZXJyb3IgaGFuZGxlciBjYW4gYWNjZXNzIHRoZSByZWFsIHRlc3RcbiAgICAgICAgICAgIHRoaXMubWFpblRlc3RlciA9IGZha2VUZXN0XG5cbiAgICAgICAgICAgIGZha2VUZXN0Lmdyb3VwRW5kZWQgPSB0cnVlXG4gICAgICAgICAgICBjaGVja0dyb3VwRG9uZShmYWtlVGVzdClcbiAgICAgICAgfVxuICAgIH0pXG5cbiAgICB2YXIgRXZlbnRNYW5hZ2VyID0gcHJvdG8oZnVuY3Rpb24oKSB7XG5cbiAgICAgICAgdGhpcy5pbml0ID0gZnVuY3Rpb24odGVzdE9iamVjdCkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVycyA9IHtcbiAgICAgICAgICAgICAgICBncm91cDogW10sXG4gICAgICAgICAgICAgICAgYXNzZXJ0OiBbXSxcbiAgICAgICAgICAgICAgICBjb3VudDogW10sXG4gICAgICAgICAgICAgICAgZXhjZXB0aW9uOiBbXSxcbiAgICAgICAgICAgICAgICBsb2c6IFtdLFxuICAgICAgICAgICAgICAgIGVuZDogW10sXG4gICAgICAgICAgICAgICAgZ3JvdXBFbmQ6IFtdLFxuICAgICAgICAgICAgICAgIGJlZm9yZTogW10sXG4gICAgICAgICAgICAgICAgYWZ0ZXI6IFtdLFxuICAgICAgICAgICAgICAgIGJlZm9yZUVuZDogW10sXG4gICAgICAgICAgICAgICAgYWZ0ZXJFbmQ6IFtdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuaGlzdG9yeSA9IFtdXG4gICAgICAgICAgICB0aGlzLmVtaXREZXB0aCA9IDAgLy8gcmVjb3JkcyBob3cgbWFueSBmdXR1cmVzIGFyZSB3YWl0aW5nIG9uIGVhY2hvdGhlciwgc28gd2UgY2FuIG1ha2Ugc3VyZSBtYXhpbXVtIHN0YWNrIGRlcHRoIGlzbid0IGV4Y2VlZGVkXG4gICAgICAgICAgICB0aGlzLmxhc3RFbWl0RnV0dXJlID0gRnV0dXJlKHVuZGVmaW5lZClcbiAgICAgICAgICAgIHRoaXMudGVzdE9iamVjdCA9IHRlc3RPYmplY3RcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudGVzdE9iamVjdDsgLy8gdXNlZCB0byBnZXQgdGhlIHJpZ2h0IHdhcm5pbmdIYW5kbGVyXG5cbiAgICAgICAgLy8gZW1pdHMgYW4gZXZlbnRcbiAgICAgICAgLy8gZXZlbnREYXRhRnV0dXJlIHJlc29sdmVzIHRvIGVpdGhlciBhbiBldmVudERhdGEgb2JqZWN0LCBvciB1bmRlZmluZWQgaWYgbm90aGluZyBzaG91bGQgYmUgZW1pdHRlZFxuICAgICAgICB0aGlzLmVtaXQgPSBmdW5jdGlvbih0eXBlLCBldmVudERhdGFGdXR1cmUpIHtcbiAgICAgICAgICAgIHZhciB0aGF0ID0gdGhpc1xuICAgICAgICAgICAgdmFyIGxhc3RFbWl0RnV0dXJlID0gdGhhdC5sYXN0RW1pdEZ1dHVyZSAvLyBjYXB0dXJlIGl0IGZvciB0aGUgcG9zc2libGUgc2V0VGltZW91dCB0aHJlYWRsZXRcbiAgICAgICAgICAgIHZhciBkb1N0dWZmID0gZnVuY3Rpb24oZikge1xuICAgICAgICAgICAgICAgIHZhciByZXN1bHRGdXR1cmUgPSBsYXN0RW1pdEZ1dHVyZS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXZlbnREYXRhRnV0dXJlXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbihldmVudERhdGEpe1xuICAgICAgICAgICAgICAgICAgICBpZihldmVudERhdGEgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZEFuZFRyaWdnZXJIYW5kbGVycy5jYWxsKHRoYXQsIHR5cGUsIGV2ZW50RGF0YSlcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQudGVzdE9iamVjdC53YXJuaW5nSGFuZGxlcihlKVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICBpZihmICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0RnV0dXJlLmZpbmFsbHkoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7Zi5yZXR1cm4oKX0sMCkgLy8gbWFrZSBzdXJlIHdlIGRvbid0IGdldCBhIFwidG9vIG11Y2ggcmVjdXJzaW9uIGVycm9yXCIgLy8gdG9kbzogdGVzdCBub3QgZG9pbmcgdGhpcyBvbmNlIGJyb3dzZXJzIGFsbCBzdXBwb3J0IHByb3BlciB0YWlsIGNhbGxzXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdEZ1dHVyZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5lbWl0RGVwdGgrK1xuICAgICAgICAgICAgaWYodGhpcy5lbWl0RGVwdGggJSA0MCA9PT0gMCkgeyAvLyA0MCBzZWVtcyB0byBiZSB0aGUgbWFnaWMgbnVtYmVyIGhlcmUgZm9yIGZpcmVmb3ggLSBzdWNoIGEgZmluaWNreSBicm93c2VyXG4gICAgICAgICAgICAgICAgdGhhdC5sYXN0RW1pdEZ1dHVyZSA9IGRvU3R1ZmYobmV3IEZ1dHVyZSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhhdC5sYXN0RW1pdEZ1dHVyZSA9IGRvU3R1ZmYoKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sYXN0RW1pdEZ1dHVyZVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWRkcyBhIHNldCBvZiBsaXN0ZW5pbmcgaGFuZGxlcnMgdG8gdGhlIGV2ZW50IHN0cmVhbSwgYW5kIHJ1bnMgdGhvc2UgaGFuZGxlcnMgb24gdGhlIHN0cmVhbSdzIGhpc3RvcnlcbiAgICAgICAgLy8gZG9tYWluIGlzIG9wdGlvbmFsLCBidXQgaWYgZGVmaW5lZCB3aWxsIGJlIHRoZSBub2RlLmpzIGRvbWFpbiB0aGF0IHVuaGFuZGxlZCBlcnJvcnMgd2lsbCBiZSByb3V0ZWQgdG9cbiAgICAgICAgdGhpcy5hZGQgPSBmdW5jdGlvbihoYW5kbGVycywgZG9tYWluKSB7XG4gICAgICAgICAgICAvLyBydW4gdGhlIGhpc3Rvcnkgb2YgZXZlbnRzIG9uIHRoZSB0aGUgaGFuZGxlcnNcbiAgICAgICAgICAgIHRoaXMuaGlzdG9yeS5mb3JFYWNoKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBpZihoYW5kbGVyc1tlLnR5cGVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcnNbZS50eXBlXS5jYWxsKHVuZGVmaW5lZCwgZS5kYXRhKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIC8vIHRoZW4gaGF2ZSB0aG9zZSBoYW5kbGVycyBsaXN0ZW4gb24gZnV0dXJlIGV2ZW50c1xuICAgICAgICAgICAgZm9yKHZhciB0eXBlIGluIGhhbmRsZXJzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHR5cGVIYW5kbGVycyA9IHRoaXMuaGFuZGxlcnNbdHlwZV1cbiAgICAgICAgICAgICAgICBpZih0eXBlSGFuZGxlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJldmVudCB0eXBlICdcIit0eXBlK1wiJyBpbnZhbGlkXCIpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHlwZUhhbmRsZXJzLnB1c2goe2hhbmRsZXI6IGhhbmRsZXJzW3R5cGVdLCBkb21haW46IGRvbWFpbn0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGUgc3luY2hyb25vdXMgcGFydCBvZiBlbWl0dGluZ1xuICAgICAgICBmdW5jdGlvbiByZWNvcmRBbmRUcmlnZ2VySGFuZGxlcnModHlwZSwgZXZlbnREYXRhKSB7XG4gICAgICAgICAgICB0aGlzLmhpc3RvcnkucHVzaCh7dHlwZTp0eXBlLCBkYXRhOiBldmVudERhdGF9KVxuICAgICAgICAgICAgdGhpcy5oYW5kbGVyc1t0eXBlXS5mb3JFYWNoKGZ1bmN0aW9uKGhhbmRsZXJJbmZvKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlckluZm8uaGFuZGxlci5jYWxsKHVuZGVmaW5lZCwgZXZlbnREYXRhKVxuICAgICAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHRocm93IGVycm9yIGFzeW5jaHJvbm91c2x5IGJlY2F1c2UgdGhlc2UgZXJyb3Igc2hvdWxkIGJlIHNlcGFyYXRlIGZyb20gdGhlIHRlc3QgZXhjZXB0aW9uc1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhyb3dFcnJvckZuID0gb3B0aW9ucy50aHJvd0FzeW5jRXhjZXB0aW9uXG5cbiAgICAgICAgICAgICAgICAgICAgaWYoaGFuZGxlckluZm8uZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvd0Vycm9yRm4gPSBoYW5kbGVySW5mby5kb21haW4uYmluZCh0aHJvd0Vycm9yRm4pICAgIC8vIHRoaXMgZG9tYWluIGJpbmQgaXMgbmVlZGVkIGJlY2F1c2UgZW1pdCBpcyBkb25lIGluc2lkZSBkZWFkdW5pdCdzIHRlc3QgZG9tYWluLCB3aGljaCBpc24ndCB3aGVyZSB3ZSB3YW50IHRvIHB1dCBlcnJvcnMgY2F1c2VkIGJ5IHRoZSBldmVudCBoYW5kbGVyc1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGhyb3dFcnJvckZuKGUpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiB0ZXN0R3JvdXAodGVzdGVyLCB0ZXN0KSB7XG5cbiAgICAgICAgLy8gaGFuZGxlcyBhbnkgZXJyb3IgKHN5bmNocm9ub3VzIG9yIGFzeW5jaHJvbm91cyBlcnJvcnMpXG4gICAgICAgIHZhciBoYW5kbGVFcnJvciA9IGNyZWF0ZVVuaGFuZGxlZEVycm9ySGFuZGxlcih0ZXN0ZXIpXG5cbiAgICAgICAgdmFyIHJ1blRlc3QgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGVzdC5jYWxsKHRlc3RlciwgdGVzdGVyKSAvLyB0ZXN0ZXIgaXMgYm90aCAndGhpcycgYW5kIHRoZSBmaXJzdCBwYXJhbWV0ZXIgKGZvciBmbGV4aWJpbGl0eSlcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIGhhbmRsZUVycm9yKGUsIHRydWUpLmRvbmUoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgIG9wdGlvbnMucnVuVGVzdEdyb3VwKHN0YXRlLCB0ZXN0ZXIsIHJ1blRlc3QsIGhhbmRsZUVycm9yKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVVuaGFuZGxlZEVycm9ySGFuZGxlcih0ZXN0ZXIpIHtcblxuICAgICAgICB2YXIgaGFuZGxlRXJyb3JJbkVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKHdhcm4sIG5ld0Vycm9yKSB7XG4gICAgICAgICAgICBpZih3YXJuICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRlc3Rlci53YXJuaW5nSGFuZGxlcihuZXdFcnJvcilcbiAgICAgICAgICAgICAgICB9IGNhdGNoKHdhcm5pbmdIYW5kbGVyRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdhcm5pbmdIYW5kbGVyRXJyb3JUZXh0ID0gd2FybmluZ0hhbmRsZXJFcnJvci5zdGFjaz93YXJuaW5nSGFuZGxlckVycm9yLnN0YWNrOndhcm5pbmdIYW5kbGVyRXJyb3JcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRleHRGb3JPcmlnaW5hbEVycm9yID0gbmV3RXJyb3Iuc3RhY2s/bmV3RXJyb3Iuc3RhY2s6bmV3RXJyb3JcbiAgICAgICAgICAgICAgICAgICAgdmFyIGVycm9yY2VwdGlvbiA9IG5ldyBFcnJvcihcIkFuIGVycm9yIGhhcHBlbmVkIGluIHRoZSBlcnJvciBoYW5kbGVyOiBcIit3YXJuaW5nSGFuZGxlckVycm9yVGV4dCtcIlxcblwiK3RleHRGb3JPcmlnaW5hbEVycm9yKVxuICAgICAgICAgICAgICAgICAgICB0ZXN0ZXIubWFuYWdlci5lbWl0KCdleGNlcHRpb24nLCBGdXR1cmUoZXJyb3JjZXB0aW9uKSkuZG9uZSgpIC8vIGlmIHNoaXQgZ2V0cyB0aGlzIGJhZCwgdGhhdCBzdWNrc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihuZXdFcnJvcilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHdhcm4gc2hvdWxkIGJlIHNldCB0byBmYWxzZSBpZiB0aGUgaGFuZGxlciBpcyBiZWluZyBjYWxsZWQgdG8gcmVwb3J0IGEgd2FybmluZ1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZSwgd2Fybikge1xuICAgICAgICAgICAgaWYodGVzdGVyLnVuaGFuZGxlZEVycm9ySGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdGVzdGVyLnVuaGFuZGxlZEVycm9ySGFuZGxlcihlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKHVuZGVmaW5lZClcblxuICAgICAgICAgICAgICAgIH0gY2F0Y2gobmV3RXJyb3IpIHsgICAgIC8vIGVycm9yIGhhbmRsZXIgaGFkIGFuIGVycm9yLi4uXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZUVycm9ySW5FcnJvckhhbmRsZXIod2FybiwgbmV3RXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZWxzZVxuXG4gICAgICAgICAgICB2YXIgZXJyb3JUb0VtaXQgPSBtYXBFeGNlcHRpb24oZSwgdGVzdGVyLndhcm5pbmdIYW5kbGVyKS5jYXRjaChmdW5jdGlvbihuZXdFcnJvcikge1xuICAgICAgICAgICAgICAgIGlmKG5ld0Vycm9yLm1lc3NhZ2UgIT09IFwiQWNjZXNzaW5nIHRoZSAnY2FsbGVyJyBwcm9wZXJ0eSBvZiBhIGZ1bmN0aW9uIG9yIGFyZ3VtZW50cyBvYmplY3QgaXMgbm90IGFsbG93ZWQgaW4gc3RyaWN0IG1vZGVcIikgeyAvLyBzdGFja3RyYWNlLmpzIGRvZXNuJ3Qgc3VwcG9ydCBJRSBmb3IgY2VydGFpbiB0aGluZ3NcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlRXJyb3JJbkVycm9ySGFuZGxlcih3YXJuLCBuZXdFcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShlKSAvLyB1c2UgdGhlIG9yaWdpbmFsIHVubWFwcGVkIGV4Y2VwdGlvblxuXG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKGV4Y2VwdGlvbil7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShleGNlcHRpb25FbWl0RGF0YSh0ZXN0ZXIsZXhjZXB0aW9uKSlcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIHZhciBlbWl0RnV0dXJlID0gdGVzdGVyLm1hbmFnZXIuZW1pdCgnZXhjZXB0aW9uJywgZXJyb3JUb0VtaXQpXG4gICAgICAgICAgICByZXR1cm4gYWZ0ZXJXYWl0aW5nRW1pdElzQ29tcGxldGUodGVzdGVyLCBlbWl0RnV0dXJlKVxuXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBleGNlcHRpb25FbWl0RGF0YSh0ZXN0ZXIsIGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgdGltZTogbm93KCksXG4gICAgICAgICAgICBlcnJvcjogZVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyB0aGUgcHJvdG90eXBlIG9mIG9iamVjdHMgdXNlZCB0byB3cml0ZSB0ZXN0cyBhbmQgY29udGFpbiB0aGUgcmVzdWx0cyBvZiB0ZXN0c1xuICAgIHZhciBVbml0VGVzdGVyID0gZnVuY3Rpb24obmFtZSwgbWFpblRlc3Rlcikge1xuICAgICAgICBpZighbWFpblRlc3RlcikgbWFpblRlc3RlciA9IHRoaXNcblxuICAgICAgICB0aGlzLmlkID0gZ3JvdXBpZCgpXG4gICAgICAgIHRoaXMubWFpblRlc3RlciA9IG1haW5UZXN0ZXIgLy8gdGhlIG1haW5UZXN0ZXIgaXMgdXNlZCB0byBlYXNpbHkgZmlndXJlIG91dCBpZiB0aGUgdGVzdCByZXN1bHRzIGhhdmUgYmVlbiBhY2Nlc3NlZCAoc28gZWFybHkgYWNjZXNzZXMgY2FuIGJlIGRldGVjdGVkKVxuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lXG5cbiAgICAgICAgdGhpcy5kb25lVGVzdHMgPSAwXG4gICAgICAgIHRoaXMuZG9uZUFzc2VydHMgPSAwXG4gICAgICAgIHRoaXMucnVubmluZ1Rlc3RzID0gMCAvLyB0aGUgbnVtYmVyIG9mIHN1YnRlc3RzIGNyZWF0ZWQgc3luY2hyb25vdXNseVxuICAgICAgICB0aGlzLmRvbmVDYWxsZWQgPSBmYWxzZVxuICAgICAgICB0aGlzLmRvU291cmNlbWFwcGVyeSA9IHRydWUgLy8gd2hldGhlciB0byBkbyBzb3VyY2UgbWFwcGluZywgaWYgcG9zc2libGUsIHdpdGhpbiB0aGlzIHRlc3RcblxuICAgICAgICB0aGlzLmNvbXBsZXRlID0gbmV3IEZ1dHVyZSAvLyByZXNvbHZlZCB3aGVuIGRvbmVcbiAgICB9XG5cbiAgICAgICAgVW5pdFRlc3Rlci5wcm90b3R5cGUgPSB7XG4gICAgICAgICAgICB0ZXN0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0ZXN0ID0gYXJndW1lbnRzWzBdXG5cbiAgICAgICAgICAgICAgICAvLyBuYW1lZCB0ZXN0XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5hbWUgPSBhcmd1bWVudHNbMF1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlc3QgPSBhcmd1bWVudHNbMV1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICAgICAgICAgICAgICB0aGlzLnJ1bm5pbmdUZXN0cysrXG5cbiAgICAgICAgICAgICAgICB2YXIgdGVzdGVyID0gbmV3IFVuaXRUZXN0ZXIobmFtZSwgdGhpcy5tYWluVGVzdGVyKVxuICAgICAgICAgICAgICAgIHRlc3Rlci5tYW5hZ2VyID0gdGhpcy5tYW5hZ2VyXG4gICAgICAgICAgICAgICAgdGVzdGVyLmRvU291cmNlbWFwcGVyeSA9IHRoaXMuZG9Tb3VyY2VtYXBwZXJ5IC8vIGluaGVyaXQgZnJvbSBwYXJlbnQgdGVzdFxuICAgICAgICAgICAgICAgIHRlc3Rlci53YXJuaW5nSGFuZGxlciA9IHRoaXMud2FybmluZ0hhbmRsZXJcblxuICAgICAgICAgICAgICAgIGlmKHRoaXMuaWQgPT09IHVuZGVmaW5lZCkgeyAvLyBpZSBpdHMgdGhlIHRvcC1sZXZlbCBmYWtlIHRlc3RcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYWluU3ViVGVzdCA9IHRlc3RlclxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRlc3Rlci5vbkRvbmUgPSBmdW5jdGlvbigpIHsgLy8gd2lsbCBleGVjdXRlIHdoZW4gdGhpcyB0ZXN0IGlzIGRvbmVcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5kb25lVGVzdHMgKz0gMVxuXG4gICAgICAgICAgICAgICAgICAgIHRoYXQubWFuYWdlci5lbWl0KCdncm91cEVuZCcsIEZ1dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZTogbm93KClcbiAgICAgICAgICAgICAgICAgICAgfSkpXG5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlc3Rlci5jb21wbGV0ZS5yZXR1cm4oKVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZVVuaGFuZGxlZEVycm9ySGFuZGxlcih0ZXN0ZXIpKGUpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjaGVja0dyb3VwRG9uZSh0aGF0KVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRlc3Rlci5tYWluVGVzdGVyLmNhbGxPbkRvbmUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKCF0ZXN0ZXIuZG9uZUNhbGxlZCkgeyAvLyBhIHRpbWVvdXQgaGFwcGVuZWQgLSBlbmQgdGhlIHRlc3RcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlc3Rlci5kb25lQ2FsbGVkID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhhdC5tYW5hZ2VyLmVtaXQoJ2dyb3VwRW5kJywgRnV0dXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIuZW1pdCgnZ3JvdXAnLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgICAgICBpZDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHRoaXMuaWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICAgICAgfSkpXG5cbiAgICAgICAgICAgICAgICBpZih0aGlzLmJlZm9yZUZuKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWFuYWdlci5lbWl0KCdiZWZvcmUnLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxuICAgICAgICAgICAgICAgICAgICB9KSlcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJlZm9yZUZuLmNhbGwodGhpcywgdGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIuZW1pdCgnYmVmb3JlRW5kJywgRnV0dXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGVzdGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZTogbm93KClcbiAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGVzdEdyb3VwKHRlc3RlciwgdGVzdClcblxuICAgICAgICAgICAgICAgIGlmKHRoaXMuYWZ0ZXJGbikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hbmFnZXIuZW1pdCgnYWZ0ZXInLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiB0ZXN0ZXIuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lOiBub3coKVxuICAgICAgICAgICAgICAgICAgICB9KSlcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFmdGVyRm4uY2FsbCh0aGlzLCB0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWFuYWdlci5lbWl0KCdhZnRlckVuZCcsIEZ1dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHRlc3Rlci5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRlc3Rlci5ncm91cEVuZGVkID0gdHJ1ZVxuICAgICAgICAgICAgICAgIGNoZWNrR3JvdXBEb25lKHRlc3RlcilcblxuICAgICAgICAgICAgICAgIHJldHVybiB0ZXN0ZXJcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG9rOiBmdW5jdGlvbihzdWNjZXNzLCBhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9uZUFzc2VydHMgKz0gMVxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsIGFzc2VydCh0aGlzLCBzdWNjZXNzLCBhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSwgJ2Fzc2VydCcsIFwib2tcIikpLmRvbmUoKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVxOiBmdW5jdGlvbihhY3R1YWxWYWx1ZSwgZXhwZWN0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9uZUFzc2VydHMgKz0gMVxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsIGFzc2VydCh0aGlzLCBleHBlY3RlZFZhbHVlID09PSBhY3R1YWxWYWx1ZSwgYWN0dWFsVmFsdWUsIGV4cGVjdGVkVmFsdWUsICdhc3NlcnQnLCBcImVxXCIpKS5kb25lKClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb3VudDogZnVuY3Rpb24obnVtYmVyKSB7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5jb3VudEV4cGVjdGVkICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IEVycm9yKFwiY291bnQgY2FsbGVkIG11bHRpcGxlIHRpbWVzIGZvciB0aGlzIHRlc3RcIilcbiAgICAgICAgICAgICAgICB0aGlzLmNvdW50RXhwZWN0ZWQgPSBudW1iZXJcblxuICAgICAgICAgICAgICAgIGFmdGVyV2FpdGluZ0VtaXRJc0NvbXBsZXRlKHRoaXMsYXNzZXJ0KHRoaXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBudW1iZXIsICdjb3VudCcsIFwiY291bnRcIikpLmRvbmUoKVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgYmVmb3JlOiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIGlmKHRoaXMuYmVmb3JlRm4gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJiZWZvcmUgY2FsbGVkIG11bHRpcGxlIHRpbWVzIGZvciB0aGlzIHRlc3RcIilcblxuICAgICAgICAgICAgICAgIHRoaXMuYmVmb3JlRm4gPSBmblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFmdGVyOiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIGlmKHRoaXMuYWZ0ZXJGbiAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcImFmdGVyIGNhbGxlZCBtdWx0aXBsZSB0aW1lcyBmb3IgdGhpcyB0ZXN0XCIpXG5cbiAgICAgICAgICAgICAgICB0aGlzLmFmdGVyRm4gPSBmblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgbG9nOiBmdW5jdGlvbigvKmFyZ3VtZW50cyovKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVtaXQoJ2xvZycsIEZ1dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogdGhpcy5pZCxcbiAgICAgICAgICAgICAgICAgICAgdGltZTogbm93KCksXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlczogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKVxuICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgdGltZW91dDogZnVuY3Rpb24odCkge1xuICAgICAgICAgICAgICAgIHRpbWVvdXQodGhpcywgdCwgZmFsc2UpXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBlcnJvcjogZnVuY3Rpb24oaGFuZGxlcikge1xuICAgICAgICAgICAgICAgIHRoaXMudW5oYW5kbGVkRXJyb3JIYW5kbGVyID0gaGFuZGxlclxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHdhcm5pbmc6IGZ1bmN0aW9uKGhhbmRsZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLndhcm5pbmdIYW5kbGVyID0gaGFuZGxlclxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgc291cmNlbWFwOiBmdW5jdGlvbihkb1NvdXJjZW1hcHBlcnkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvU291cmNlbWFwcGVyeSA9IGRvU291cmNlbWFwcGVyeVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICBmdW5jdGlvbiBhZnRlcldhaXRpbmdFbWl0SXNDb21wbGV0ZSh0aGF0LCBhc3NlcnRGdXR1cmUpIHtcbiAgICAgICAgcmV0dXJuIGFzc2VydEZ1dHVyZS5maW5hbGx5KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY2hlY2tHcm91cERvbmUodGhhdClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja0dyb3VwRG9uZShncm91cCkge1xuICAgICAgICBpZighZ3JvdXAuZG9uZUNhbGxlZCAmJiBncm91cC5ncm91cEVuZGVkID09PSB0cnVlXG4gICAgICAgICAgICAmJiAoKGdyb3VwLmNvdW50RXhwZWN0ZWQgPT09IHVuZGVmaW5lZCB8fCBncm91cC5jb3VudEV4cGVjdGVkIDw9IGdyb3VwLmRvbmVBc3NlcnRzK2dyb3VwLmRvbmVUZXN0cylcbiAgICAgICAgICAgICAgICAmJiBncm91cC5ydW5uaW5nVGVzdHMgPT09IGdyb3VwLmRvbmVUZXN0cylcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBncm91cC5kb25lQ2FsbGVkID0gdHJ1ZSAvLyBkb24ndCBjYWxsIHR3aWNlXG4gICAgICAgICAgICBncm91cC5vbkRvbmUoKVxuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkb25lKHVuaXRUZXN0ZXIpIHtcbiAgICAgICAgaWYodW5pdFRlc3Rlci5tYWluVGVzdGVyLmVuZGVkKSB7XG4gICAgICAgICAgICB1bml0VGVzdGVyLm1haW5UZXN0ZXIubWFuYWdlci5lbWl0KCdleGNlcHRpb24nLCBGdXR1cmUoe1xuICAgICAgICAgICAgICAgIHBhcmVudDogdW5pdFRlc3Rlci5tYWluVGVzdGVyLm1haW5TdWJUZXN0LmlkLFxuICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpLFxuICAgICAgICAgICAgICAgIGVycm9yOiBuZXdFcnJvcihcImRvbmUgY2FsbGVkIG1vcmUgdGhhbiBvbmNlIChwcm9iYWJseSBiZWNhdXNlIHRoZSB0ZXN0IHRpbWVkIG91dCBiZWZvcmUgaXQgZmluaXNoZWQpXCIpXG4gICAgICAgICAgICB9KSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHRvKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRvKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0cyA9IFtdXG5cbiAgICAgICAgICAgIGVuZFRlc3QodW5pdFRlc3RlciwgJ25vcm1hbCcpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiBhIHRpbWVvdXQgaXMgdGhlIGRlZmF1bHQsIGl0IGNhbiBiZSBvdmVycmlkZGVuXG4gICAgZnVuY3Rpb24gdGltZW91dCh1bml0VGVzdGVyLCB0LCB0aGVEZWZhdWx0KSB7XG4gICAgICAgIHZhciB0aW1lb3V0cyA9IHVuaXRUZXN0ZXIubWFpblRlc3Rlci50aW1lb3V0c1xuXG4gICAgICAgIHZhciB0byA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZW1vdmUodGltZW91dHMsIHRvKVxuXG4gICAgICAgICAgICBpZih0aW1lb3V0cy5sZW5ndGggPT09IDAgJiYgIXVuaXRUZXN0ZXIubWFpblRlc3Rlci5lbmRlZCkge1xuICAgICAgICAgICAgICAgIGVuZFRlc3QodW5pdFRlc3Rlci5tYWluVGVzdGVyLCAndGltZW91dCcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHQpXG5cbiAgICAgICAgdGltZW91dHMucHVzaCh0bylcblxuICAgICAgICBpZih0aGVEZWZhdWx0KSB7XG4gICAgICAgICAgICB0aW1lb3V0cy5kZWZhdWx0ID0gdG9cbiAgICAgICAgfSBlbHNlIGlmKHRpbWVvdXRzLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRzLmRlZmF1bHQpXG4gICAgICAgICAgICByZW1vdmUodGltZW91dHMsIHRpbWVvdXRzLmRlZmF1bHQpXG4gICAgICAgICAgICB0aW1lb3V0cy5kZWZhdWx0ID0gdW5kZWZpbmVkXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByZW1vdmUoYXJyYXksIGl0ZW0pIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IGFycmF5LmluZGV4T2YoaXRlbSlcbiAgICAgICAgICAgIGlmKGluZGV4ID09PSAtMSlcbiAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcIkl0ZW0gZG9lc24ndCBleGlzdCB0byByZW1vdmVcIilcbiAgICAgICAgICAgIGFycmF5LnNwbGljZShpbmRleCwgMSlcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVuZFRlc3QodGhhdCwgdHlwZSkge1xuICAgICAgICB0aGF0Lm1haW5UZXN0ZXIuZW5kZWQgPSB0cnVlXG5cbiAgICAgICAgaWYodGhhdC5tYWluVGVzdGVyID09PSB0aGF0KSB7IC8vIGlmIGl0cyB0aGUgbWFpbiB0ZXN0ZXJcbiAgICAgICAgICAgIHRoYXQub25Eb25lQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgICAgICAgICBjYigpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgLy8gc2V0VGltZW91dCBoZXJlIGlzIHRvIG1ha2UgaXQgc28gdGhlIGN1cnJlbnRseSBydW5uaW5nIHRocmVhZGxldCB0aGF0IGNhdXNlZCB0aGUgdGVzdCB0byBlbmQgY2FuIGZpbmlzaCBiZWZvcmUgdGhlIGVuZCBldmVudCBpcyBzZW50XG4gICAgICAgICAgICB0aGF0Lm1hbmFnZXIuZW1pdCgnZW5kJywgRnV0dXJlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgICAgIHRpbWU6IG5vdygpXG4gICAgICAgICAgICB9KSlcbiAgICAgICAgfSwwKVxuICAgIH1cblxuICAgIC8vIHR5cGUgLSBlaXRoZXIgXCJjb3VudFwiIG9yIFwiYXNzZXJ0XCJcbiAgICBmdW5jdGlvbiBhc3NlcnQodGhhdCwgc3VjY2VzcywgYWN0dWFsVmFsdWUsIGV4cGVjdGVkVmFsdWUsIHR5cGUsIGZ1bmN0aW9uTmFtZS8qPVwib2tcIiovLCBsaW5lSW5mby8qPWR5bmFtaWMqLywgc3RhY2tJbmNyZWFzZS8qPTAqLykge1xuICAgICAgICBpZighc3RhY2tJbmNyZWFzZSkgc3RhY2tJbmNyZWFzZSA9IDFcbiAgICAgICAgaWYoIWZ1bmN0aW9uTmFtZSkgZnVuY3Rpb25OYW1lID0gXCJva1wiXG4gICAgICAgIGlmKCFsaW5lSW5mbylcbiAgICAgICAgICAgIHZhciBsaW5lSW5mb0Z1dHVyZSA9IGdldExpbmVJbmZvcm1hdGlvbihmdW5jdGlvbk5hbWUsIHN0YWNrSW5jcmVhc2UsIHRoYXQuZG9Tb3VyY2VtYXBwZXJ5LCB0aGF0Lndhcm5pbmdIYW5kbGVyKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICB2YXIgbGluZUluZm9GdXR1cmUgPSBGdXR1cmUobGluZUluZm8pXG5cbiAgICAgICAgdmFyIGVtaXREYXRhID0gbGluZUluZm9GdXR1cmUudGhlbihmdW5jdGlvbihsaW5lSW5mbykge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGxpbmVJbmZvXG4gICAgICAgICAgICByZXN1bHQudHlwZSA9ICdhc3NlcnQnXG4gICAgICAgICAgICBpZih0eXBlICE9PSdjb3VudCcpIHJlc3VsdC5zdWNjZXNzID0gc3VjY2VzcyA9PT0gdHJ1ZVxuXG4gICAgICAgICAgICBpZihhY3R1YWxWYWx1ZSAhPT0gdW5kZWZpbmVkKSAgICAgcmVzdWx0LmFjdHVhbCA9IGFjdHVhbFZhbHVlXG4gICAgICAgICAgICBpZihleHBlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQpICAgcmVzdWx0LmV4cGVjdGVkID0gZXhwZWN0ZWRWYWx1ZVxuXG4gICAgICAgICAgICByZXN1bHQucGFyZW50ID0gdGhhdC5pZFxuICAgICAgICAgICAgcmVzdWx0LnRpbWUgPSBub3coKVxuXG4gICAgICAgICAgIHJldHVybiBGdXR1cmUocmVzdWx0KVxuICAgICAgICB9KVxuXG4gICAgICAgIHJldHVybiB0aGF0Lm1hbmFnZXIuZW1pdCh0eXBlLCBlbWl0RGF0YSlcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGdldExpbmVJbmZvcm1hdGlvbihmdW5jdGlvbk5hbWUsIHN0YWNrSW5jcmVhc2UsIGRvU291cmNlbWFwcGVyeSwgd2FybmluZ0hhbmRsZXIpIHtcblxuICAgICAgICB2YXIgZmlsZSwgbGluZSwgY29sdW1uLCBsaW5laW5mbztcbiAgICAgICAgcmV0dXJuIG9wdGlvbnMuZ2V0TGluZUluZm8oc3RhY2tJbmNyZWFzZSkudGhlbihmdW5jdGlvbihpbmZvKXtcbiAgICAgICAgICAgIGxpbmVpbmZvID0gaW5mb1xuICAgICAgICAgICAgcmV0dXJuIGdldFNvdXJjZU1hcENvbnN1bWVyKGluZm8uZmlsZSwgd2FybmluZ0hhbmRsZXIpXG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKGUpe1xuICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUodW5kZWZpbmVkKVxuXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oc291cmNlTWFwQ29uc3VtZXIpIHtcbiAgICAgICAgICAgIGlmKHNvdXJjZU1hcENvbnN1bWVyICE9PSB1bmRlZmluZWQgJiYgZG9Tb3VyY2VtYXBwZXJ5KSB7XG5cbiAgICAgICAgICAgICAgICB2YXIgbWFwcGVkSW5mbyA9IGdldE1hcHBlZFNvdXJjZUluZm8oc291cmNlTWFwQ29uc3VtZXIsIGxpbmVpbmZvLmZpbGUsIGxpbmVpbmZvLmxpbmUsIGxpbmVpbmZvLmNvbHVtbilcbiAgICAgICAgICAgICAgICBmaWxlID0gbWFwcGVkSW5mby5maWxlXG4gICAgICAgICAgICAgICAgbGluZSA9IG1hcHBlZEluZm8ubGluZVxuICAgICAgICAgICAgICAgIGNvbHVtbiA9IG1hcHBlZEluZm8uY29sdW1uXG4gICAgICAgICAgICAgICAgdmFyIHNvdXJjZUxpbmVzID0gbWFwcGVkSW5mby5zb3VyY2VMaW5lc1xuXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpTGluZVNlYXJjaCA9ICFtYXBwZWRJbmZvLnVzaW5nT3JpZ2luYWxGaWxlIC8vIGRvbid0IHRvIGEgbXVsdGktbGluZSBzZWFyY2ggaWYgdGhlIHNvdXJjZSBoYXMgYmVlbiBtYXBwZWQgKHRoZSBmaWxlIG1pZ2h0IG5vdCBiZSBqYXZhc2NyaXB0KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmaWxlID0gbGluZWluZm8uZmlsZVxuICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5laW5mby5saW5lXG4gICAgICAgICAgICAgICAgY29sdW1uID0gbGluZWluZm8uY29sdW1uXG4gICAgICAgICAgICAgICAgdmFyIHNvdXJjZUxpbmVzID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpTGluZVNlYXJjaCA9IHRydWVcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGdldEZ1bmN0aW9uQ2FsbExpbmVzKHNvdXJjZUxpbmVzLCBmaWxlLCBmdW5jdGlvbk5hbWUsIGxpbmUsIG11bHRpTGluZVNlYXJjaCwgd2FybmluZ0hhbmRsZXIpXG5cbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgd2FybmluZ0hhbmRsZXIoZSlcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoXCI8c291cmNlIG5vdCBhdmFpbGFibGU+XCIpXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oc291cmNlTGluZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBGdXR1cmUoe1xuICAgICAgICAgICAgICAgIHNvdXJjZUxpbmVzOiBzb3VyY2VMaW5lcyxcbiAgICAgICAgICAgICAgICBmaWxlOiBwYXRoLmJhc2VuYW1lKGZpbGUpLFxuICAgICAgICAgICAgICAgIGxpbmU6IGxpbmUsXG4gICAgICAgICAgICAgICAgY29sdW1uOiBjb2x1bW5cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgbGluZSwgY29sdW1uLCBhbmQgZmlsZW5hbWUgbWFwcGVkIGZyb20gYSBzb3VyY2UgbWFwXG4gICAgLy8gYXBwcm9wcmlhdGVseSBoYW5kbGVzIGNhc2VzIHdoZXJlIHNvbWUgaW5mb3JtYXRpb24gaXMgbWlzc2luZ1xuICAgIGZ1bmN0aW9uIGdldE1hcHBlZFNvdXJjZUluZm8oc291cmNlTWFwQ29uc3VtZXIsIG9yaWdpbmFsRmlsZVBhdGgsIG9yaWdpbmFsTGluZSwgb3JpZ2luYWxDb2x1bW4sIG9yaWdpbmFsRnVuY3Rpb25OYW1lKSB7XG4gICAgICAgIHZhciBzb3VyY2VNYXBJbmZvID0gc291cmNlTWFwQ29uc3VtZXIub3JpZ2luYWxQb3NpdGlvbkZvcih7bGluZTpvcmlnaW5hbExpbmUsIGNvbHVtbjpvcmlnaW5hbENvbHVtbnx8MH0pICAgICAgIC8vIHRoZSAwIGlzIGZvciBicm93c2VycyAobGlrZSBmaXJlZm94KSB0aGF0IGRvbid0IG91dHB1dCBjb2x1bW4gbnVtYmVyc1xuICAgICAgICB2YXIgbGluZSA9IHNvdXJjZU1hcEluZm8ubGluZVxuICAgICAgICB2YXIgY29sdW1uID0gc291cmNlTWFwSW5mby5jb2x1bW5cbiAgICAgICAgdmFyIGZuID0gc291cmNlTWFwSW5mby5uYW1lXG5cbiAgICAgICAgaWYoc291cmNlTWFwSW5mby5zb3VyY2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHZhciByZWxhdGl2ZSA9IGlzUmVsYXRpdmUoc291cmNlTWFwSW5mby5zb3VyY2UpXG5cbiAgICAgICAgICAgIC8qIEkgZG9uJ3QgdGhpbmsgdGhpcyBpcyBuZWVkZWQgYW55IGxvbmdlciwgYW5kIHByb2JhYmx5IGlzbid0IGNvcnJlY3QgLSB0aGlzIHdhcyB3b3JraW5nIGFyb3VuZCBhbiBpc3N1ZSBpbiB3ZWJwYWNrOiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL3dlYnBhY2svd2VicGFjay9pc3N1ZXMvNTU5IGFuZCBodHRwczovL2dpdGh1Yi5jb20vd2VicGFjay93ZWJwYWNrL2lzc3Vlcy8yMzhcbiAgICAgICAgICAgIGlmKHNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZVJvb3QgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBJbmZvLnNvdXJjZSA9IHNvdXJjZU1hcEluZm8uc291cmNlLnJlcGxhY2Uoc291cmNlTWFwQ29uc3VtZXIuc291cmNlUm9vdCwgJycpIC8vIHJlbW92ZSBzb3VyY2VSb290XG4gICAgICAgICAgICB9Ki9cblxuICAgICAgICAgICAgaWYocmVsYXRpdmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZmlsZSA9IFVybC5yZXNvbHZlKG9yaWdpbmFsRmlsZVBhdGgsIHBhdGguYmFzZW5hbWUoc291cmNlTWFwSW5mby5zb3VyY2UpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZmlsZSA9IHNvdXJjZU1hcEluZm8uc291cmNlXG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsRmlsZSA9IHRydWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmaWxlID0gb3JpZ2luYWxGaWxlUGF0aFxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsRmlsZSA9IGZhbHNlXG4gICAgICAgIH1cblxuICAgICAgICBpZihmbiA9PT0gbnVsbCB8fCAhb3JpZ2luYWxGaWxlKSB7XG4gICAgICAgICAgICBmbiA9IG9yaWdpbmFsRnVuY3Rpb25OYW1lXG4gICAgICAgIH1cbiAgICAgICAgaWYobGluZSA9PT0gbnVsbCB8fCAhb3JpZ2luYWxGaWxlKSB7XG4gICAgICAgICAgICBsaW5lID0gb3JpZ2luYWxMaW5lXG4gICAgICAgICAgICBjb2x1bW4gPSBvcmlnaW5hbENvbHVtblxuICAgICAgICB9XG4gICAgICAgIGlmKGNvbHVtbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29sdW1uID0gdW5kZWZpbmVkXG4gICAgICAgIH1cblxuICAgICAgICBpZihmaWxlICE9IHVuZGVmaW5lZCAmJiBzb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzQ29udGVudCAhPSB1bmRlZmluZWQpIHsgLy8gaW50ZW50aW9uYWwgc2luZ2xlICE9XG4gICAgICAgICAgICB2YXIgaW5kZXggPSBzb3VyY2VNYXBDb25zdW1lci5zb3VyY2VzLmluZGV4T2YoZmlsZSlcbiAgICAgICAgICAgIHZhciBzb3VyY2VMaW5lcyA9IHNvdXJjZU1hcENvbnN1bWVyLnNvdXJjZXNDb250ZW50W2luZGV4XVxuICAgICAgICAgICAgaWYoc291cmNlTGluZXMgIT09IHVuZGVmaW5lZCkgc291cmNlTGluZXMgPSBzb3VyY2VMaW5lcy5zcGxpdCgnXFxuJylcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmaWxlOiBmaWxlLFxuICAgICAgICAgICAgZnVuY3Rpb246IGZuLFxuICAgICAgICAgICAgbGluZTogbGluZSxcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uLFxuICAgICAgICAgICAgdXNpbmdPcmlnaW5hbEZpbGU6IG9yaWdpbmFsRmlsZSxcbiAgICAgICAgICAgIHNvdXJjZUxpbmVzOiBzb3VyY2VMaW5lc1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gZ2V0cyB0aGUgYWN0dWFsIGxpbmVzIG9mIHRoZSBjYWxsXG4gICAgLy8gaWYgbXVsdGlMaW5lU2VhcmNoIGlzIHRydWUsIGl0IGZpbmRzXG4gICAgZnVuY3Rpb24gZ2V0RnVuY3Rpb25DYWxsTGluZXMoc291cmNlc0NvbnRlbnQsIGZpbGVQYXRoLCBmdW5jdGlvbk5hbWUsIGxpbmVOdW1iZXIsIG11bHRpTGluZVNlYXJjaCwgd2FybmluZ0hhbmRsZXIpIHtcbiAgICAgICAgaWYoc291cmNlc0NvbnRlbnQgIT09ICB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBGdXR1cmUoc291cmNlc0NvbnRlbnQpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gb3B0aW9ucy5nZXRTY3JpcHRTb3VyY2VMaW5lcyhmaWxlUGF0aClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc291cmNlLmNhdGNoKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKGUpXG4gICAgICAgICAgICByZXR1cm4gRnV0dXJlKHVuZGVmaW5lZClcblxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKGZpbGVMaW5lcykge1xuICAgICAgICAgICAgaWYoZmlsZUxpbmVzICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgIHZhciBzdGFydExpbmUgPSBmaW5kU3RhcnRMaW5lKGZpbGVMaW5lcywgZnVuY3Rpb25OYW1lLCBsaW5lTnVtYmVyKVxuICAgICAgICAgICAgICAgIGlmKHN0YXJ0TGluZSA9PT0gJ2xpbmVPZkNvZGVOb3RGb3VuZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShcIjxsaW5lIG9mIGNvZGUgbm90IGZvdW5kIChwb3NzaWJseSBhbiBlcnJvcj8pPiBcIilcblxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihzdGFydExpbmUgIT09ICdzb3VyY2VOb3RBdmFpbGFibGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKG11bHRpTGluZVNlYXJjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShmaW5kRnVsbFNvdXJjZUxpbmUoZmlsZUxpbmVzLCBzdGFydExpbmUpKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShmaWxlTGluZXNbc3RhcnRMaW5lXS50cmltKCkpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBlbHNlXG4gICAgICAgICAgICByZXR1cm4gRnV0dXJlKFwiPHNvdXJjZSBub3QgYXZhaWxhYmxlPlwiKVxuXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgdmFyIHNvdXJjZU1hcENvbnN1bWVyQ2FjaGUgPSB7fSAvLyBhIG1hcCBmcm9tIGEgc2NyaXB0IHVybCB0byBhIGZ1dHVyZSBvZiBpdHMgU291cmNlTWFwQ29uc3VtZXIgb2JqZWN0IChudWxsIG1lYW5zIG5vIHNvdXJjZW1hcCBleGlzdHMpXG4gICAgZnVuY3Rpb24gZ2V0U291cmNlTWFwQ29uc3VtZXIodXJsLCB3YXJuaW5nSGFuZGxlcikge1xuICAgICAgICBpZihzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPSBvcHRpb25zLmdldFNvdXJjZU1hcE9iamVjdCh1cmwsIHdhcm5pbmdIYW5kbGVyKS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcE9iamVjdCkge1xuICAgICAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBPYmplY3QgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoc291cmNlTWFwT2JqZWN0LnZlcnNpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKG5ldyBFcnJvcihcIlNvdXJjZW1hcCBmb3IgXCIrdXJsK1wiIGRvZXNuJ3QgY29udGFpbiB0aGUgcmVxdWlyZWQgJ3ZlcnNpb24nIHByb3BlcnR5LiBBc3N1bWluZyB2ZXJzaW9uIDIuXCIpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZU1hcE9iamVjdC52ZXJzaW9uID0gMiAvLyBhc3N1bWUgdmVyc2lvbiAyIHRvIG1ha2UgYnJvd3NlcmlmeSdzIGJyb2tlbiBzb3VyY2VtYXAgZm9ybWF0IHRoYXQgb21pdHMgdGhlIHZlcnNpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUobmV3IFNvdXJjZU1hcENvbnN1bWVyKHNvdXJjZU1hcE9iamVjdCkpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnV0dXJlKHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VNYXBDb25zdW1lckNhY2hlW3VybF0gPSBGdXR1cmUodW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIHdhcm5pbmdIYW5kbGVyKGUpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc291cmNlTWFwQ29uc3VtZXJDYWNoZVt1cmxdXG4gICAgfVxuXG4gICAgLy8gdGFrZXMgYW4gZXhjZXB0aW9uIGFuZCByZXR1cm5zIGEgZnV0dXJlIGV4Y2VwdGlvbiB0aGF0IGhhcyBhIHN0YWNrdHJhY2Ugd2l0aCBzb3VyY2VtYXBwZWQgdHJhY2VsaW5lc1xuICAgIGZ1bmN0aW9uIG1hcEV4Y2VwdGlvbihleGNlcHRpb24sIHdhcm5pbmdIYW5kbGVyKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZihleGNlcHRpb24gaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICAgICAgICAgIHZhciBzdGFja3RyYWNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBvcHRpb25zLmdldEV4Y2VwdGlvbkluZm8oZXhjZXB0aW9uKS50aGVuKGZ1bmN0aW9uKHRyYWNlKXtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2t0cmFjZSA9IHRyYWNlXG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHNtY0Z1dHVyZXMgPSBbXVxuICAgICAgICAgICAgICAgICAgICBmb3IodmFyIG49MDsgbjx0cmFjZS5sZW5ndGg7IG4rKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYodHJhY2Vbbl0uZmlsZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc21jRnV0dXJlcy5wdXNoKGdldFNvdXJjZU1hcENvbnN1bWVyKHRyYWNlW25dLmZpbGUsIHdhcm5pbmdIYW5kbGVyKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc21jRnV0dXJlcy5wdXNoKEZ1dHVyZSh1bmRlZmluZWQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZS5hbGwoc21jRnV0dXJlcylcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHNvdXJjZU1hcENvbnN1bWVycykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgQ3VzdG9tTWFwcGVkRXhjZXB0aW9uID0gcHJvdG8oTWFwcGVkRXhjZXB0aW9uLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgbmFtZSBzbyBpdCBsb29rcyBsaWtlIHRoZSBvcmlnaW5hbCBleGNlcHRpb24gd2hlbiBwcmludGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIHN1YmNsYXNzZXMgTWFwcGVkRXhjZXB0aW9uIHNvIHRoYXQgbmFtZSB3b24ndCBiZSBhbiBvd24tcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZSA9IGV4Y2VwdGlvbi5uYW1lXG4gICAgICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IEN1c3RvbU1hcHBlZEV4Y2VwdGlvbihleGNlcHRpb24sIHN0YWNrdHJhY2UsIHNvdXJjZU1hcENvbnN1bWVycykgIC8vIElFIGRvZXNuJ3QgZ2l2ZSBleGNlcHRpb25zIHN0YWNrIHRyYWNlcyB1bmxlc3MgdGhleSdyZSBhY3R1YWxseSB0aHJvd25cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaChtYXBwZWRFeGNldGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1dHVyZShtYXBwZWRFeGNldGlvbilcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBGdXR1cmUoZXhjZXB0aW9uKVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIHZhciBlcnJvckZ1dHVyZSA9IG5ldyBGdXR1cmVcbiAgICAgICAgICAgIGVycm9yRnV0dXJlLnRocm93KGUpXG4gICAgICAgICAgICByZXR1cm4gZXJyb3JGdXR1cmVcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGFuIGV4Y2VwdGlvbiB3aGVyZSB0aGUgc3RhY2t0cmFjZSdzIGZpbGVzIGFuZCBsaW5lcyBhcmUgbWFwcGVkIHRvIHRoZSBvcmlnaW5hbCBmaWxlICh3aGVuIGFwcGxpY2FibGUpXG4gICAgdmFyIE1hcHBlZEV4Y2VwdGlvbiA9IHByb3RvKEVycm9yLCBmdW5jdGlvbihzdXBlcmNsYXNzKSB7XG5cbiAgICAgICAgLy8gY29uc3RydWN0b3IuIFRha2VzIHRoZSBwYXJhbWV0ZXJzOlxuICAgICAgICAgICAgLy8gb3JpZ2luYWxFcnJvclxuICAgICAgICAgICAgLy8gdHJhY2VJbmZvIC0gYW4gYXJyYXkgd2hlcmUgZWFjaCBlbGVtZW50IGlzIGFuIG9iamVjdCBjb250YWluaW5nIGluZm9ybWF0aW9uIGFib3V0IHRoYXQgc3RhY2t0cmFjZSBsaW5lXG4gICAgICAgICAgICAvLyBzb3VyY2VNYXBDb25zdW1lcnMgLSBhbiBhcnJheSBvZiB0aGUgc2FtZSBsZW5ndGggYXMgdHJhY2VJbmZvIHdoZXJlIGVhY2ggZWxlbWVudCBpcyB0aGUgc291cmNlbWFwIGNvbnN1bWVyIGZvciB0aGUgY29ycmVzcG9uZGluZyBpbmZvIGluIHRyYWNlSW5mb1xuICAgICAgICB0aGlzLmluaXQgPSBmdW5jdGlvbihvcmlnaW5hbEVycm9yLCB0cmFjZUluZm8sIHNvdXJjZU1hcENvbnN1bWVycykge1xuICAgICAgICAgICAgc3VwZXJjbGFzcy5jYWxsKHRoaXMsIG9yaWdpbmFsRXJyb3IubWVzc2FnZSlcblxuICAgICAgICAgICAgZm9yKHZhciBwIGluIG9yaWdpbmFsRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZihPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChvcmlnaW5hbEVycm9yLCBwKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW3BdID0gb3JpZ2luYWxFcnJvcltwXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG5ld1RyYWNlTGluZXMgPSBbXVxuICAgICAgICAgICAgZm9yKHZhciBuPTA7IG48dHJhY2VJbmZvLmxlbmd0aDsgbisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGluZm8gPSB0cmFjZUluZm9bbl1cbiAgICAgICAgICAgICAgICBpZihzb3VyY2VNYXBDb25zdW1lcnNbbl0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBpbmZvID0gZ2V0TWFwcGVkU291cmNlSW5mbyhzb3VyY2VNYXBDb25zdW1lcnNbbl0sIGluZm8uZmlsZSwgaW5mby5saW5lLCBpbmZvLmNvbHVtbiwgaW5mby5mdW5jdGlvbilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgZmlsZUxpbmVDb2x1bW4gPSBpbmZvLmxpbmVcbiAgICAgICAgICAgICAgICBpZihpbmZvLmNvbHVtbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVMaW5lQ29sdW1uICs9ICc6JytpbmZvLmNvbHVtblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZihpbmZvLmZpbGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBmaWxlTGluZUNvbHVtbiA9IGluZm8uZmlsZSsnOicrZmlsZUxpbmVDb2x1bW5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgdHJhY2VMaW5lID0gXCIgICAgYXQgXCJcbiAgICAgICAgICAgICAgICBpZihpbmZvLmZ1bmN0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJhY2VMaW5lICs9IGluZm8uZnVuY3Rpb24rJyAoJytmaWxlTGluZUNvbHVtbisnKSdcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0cmFjZUxpbmUgKz0gZmlsZUxpbmVDb2x1bW5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBuZXdUcmFjZUxpbmVzLnB1c2godHJhY2VMaW5lKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ3N0YWNrJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5hbWUrJzogJyt0aGlzLm1lc3NhZ2UrJ1xcbicrbmV3VHJhY2VMaW5lcy5qb2luKCdcXG4nKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gYXR0ZW1wdHMgdG8gZmluZCB0aGUgZnVsbCBmdW5jdGlvbiBjYWxsIGV4cHJlc3Npb24gKG92ZXIgbXVsdGlwbGUgbGluZXMpIGdpdmVuIHRoZSBzb3VyY2VzIGxpbmVzIGFuZCBhIHN0YXJ0aW5nIHBvaW50XG4gICAgZnVuY3Rpb24gZmluZEZ1bGxTb3VyY2VMaW5lKGZpbGVMaW5lcywgc3RhcnRMaW5lKSB7XG4gICAgICAgIHZhciBsaW5lcyA9IFtdXG4gICAgICAgIHZhciBwYXJlbkNvdW50ID0gMFxuICAgICAgICB2YXIgbW9kZSA9IDAgLy8gbW9kZSAwIGZvciBwYXJlbiBzZWFyY2hpbmcsIG1vZGUgMSBmb3IgZG91YmxlLXF1b3RlIHNlYXJjaGluZywgbW9kZSAyIGZvciBzaW5nbGUtcXVvdGUgc2VhcmNoaW5nXG4gICAgICAgIHZhciBsYXN0V2FzQmFja3NsYXNoID0gZmFsc2UgLy8gdXNlZCBmb3IgcXVvdGUgc2VhcmNoaW5nXG4gICAgICAgIGZvcih2YXIgbj1zdGFydExpbmU7IHRydWU7IG4rKykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBmaWxlTGluZXNbbl1cbiAgICAgICAgICAgIGxpbmVzLnB1c2gobGluZS50cmltKCkpXG5cbiAgICAgICAgICAgIGZvcih2YXIgaT0wOyBpPGxpbmUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgYyA9IGxpbmVbaV1cblxuICAgICAgICAgICAgICAgIGlmKG1vZGUgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYoYyA9PT0gJygnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbkNvdW50KytcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYocGFyZW5Db3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpIC8vIGRvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYoYyA9PT0gJyknICYmIHBhcmVuQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbkNvdW50LS1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHBhcmVuQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykgLy8gZG9uZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYoYyA9PT0gJ1wiJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA9IDFcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmKGMgPT09IFwiJ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RlID0gMlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKG1vZGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYoYyA9PT0gJ1wiJyAmJiAhbGFzdFdhc0JhY2tzbGFzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA9IDBcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGxhc3RXYXNCYWNrc2xhc2ggPSBjPT09J1xcXFwnXG4gICAgICAgICAgICAgICAgfSBlbHNlIHsgLy8gbW9kZSA9PT0gMlxuICAgICAgICAgICAgICAgICAgICBpZihjID09PSBcIidcIiAmJiAhbGFzdFdhc0JhY2tzbGFzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA9IDBcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGxhc3RXYXNCYWNrc2xhc2ggPSBjPT09J1xcXFwnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpIC8vIGlmIGl0IGdldHMgaGVyZSwgc29tZXRoaW5nIG1pbm9yIHdlbnQgd3JvbmdcbiAgICB9XG5cbiAgICAvLyBmaW5kcyB0aGUgbGluZSBhIGZ1bmN0aW9uIHN0YXJ0ZWQgb24gZ2l2ZW4gdGhlIGZpbGUncyBsaW5lcywgYW5kIHRoZSBzdGFjayB0cmFjZSBsaW5lIG51bWJlciAoYW5kIGZ1bmN0aW9uIG5hbWUpXG4gICAgLy8gcmV0dXJucyB1bmRlZmluZWQgaWYgc29tZXRoaW5nIHdlbnQgd3JvbmcgZmluZGluZyB0aGUgc3RhcnRsaW5lXG4gICAgZnVuY3Rpb24gZmluZFN0YXJ0TGluZShmaWxlTGluZXMsIGZ1bmN0aW9uTmFtZSwgbGluZU51bWJlcikge1xuICAgICAgICB2YXIgc3RhcnRMaW5lID0gbGluZU51bWJlciAtIDFcbiAgICAgICAgd2hpbGUodHJ1ZSkge1xuICAgICAgICAgICAgaWYoc3RhcnRMaW5lIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnbGluZU9mQ29kZU5vdEZvdW5kJyAvLyBzb21ldGhpbmcgd2VudCB3cm9uZyBpZiB0aGlzIGlzIGJlaW5nIHJldHVybmVkICh0aGUgZnVuY3Rpb25OYW1lIHdhc24ndCBmb3VuZCBhYm92ZSAtIG1lYW5zIHlvdSBkaWRuJ3QgZ2V0IHRoZSBmdW5jdGlvbiBuYW1lIHJpZ2h0KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGluZSA9IGZpbGVMaW5lc1tzdGFydExpbmVdXG4gICAgICAgICAgICBpZihsaW5lID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3NvdXJjZU5vdEF2YWlsYWJsZSdcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9saW5lcy5wdXNoKGxpbmUudHJpbSgpKVxuICAgICAgICAgICAgdmFyIGNvbnRhaW5zRnVuY3Rpb24gPSBsaW5lLmluZGV4T2YoZnVuY3Rpb25OYW1lKSAhPT0gLTFcbiAgICAgICAgICAgIGlmKGNvbnRhaW5zRnVuY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnRMaW5lXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXJ0TGluZS0tXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBncm91cGlkKCkge1xuICAgICAgICBncm91cGlkLm5leHQrK1xuICAgICAgICByZXR1cm4gZ3JvdXBpZC5uZXh0XG4gICAgfVxuICAgIGdyb3VwaWQubmV4dCA9IC0xXG5cbiAgICAvLyByZXR1cm5zIGEgVW5peCBUaW1lc3RhbXAgZm9yIG5vd1xuICAgIGZ1bmN0aW9uIG5vdygpIHtcbiAgICAgICAgcmV0dXJuIChuZXcgRGF0ZSgpKS5nZXRUaW1lKClcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB0ZXN0OiBVbml0VGVzdFxuICAgIH1cbn1cblxuZnVuY3Rpb24gbmV3RXJyb3IobWVzc2FnZSwgRXJyb3JQcm90b3R5cGUpIHtcbiAgICB0cnkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSkgLy8gSUUgbmVlZHMgYW4gZXhjZXB0aW9uIHRvIGJlIGFjdHVhbGx5IHRocm93biB0byBnZXQgYSBzdGFjayB0cmFjZSBwcm9wZXJ0eVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgICByZXR1cm4gZVxuICAgIH1cbn0iLCJ2YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc1JlbGF0aXZlKHApIHtcclxuICAgIHZhciBub3JtYWwgPSBwYXRoLm5vcm1hbGl6ZShwKVxyXG4gICAgdmFyIGFic29sdXRlID0gcGF0aC5yZXNvbHZlKHApXHJcbiAgICByZXR1cm4gbm9ybWFsICE9IGFic29sdXRlICYmIHAuaW5kZXhPZignOi8vJykgPT09IC0xLy8gc2Vjb25kIHBhcnQgZm9yIHVybHNcclxufSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmV0dXJuUmVzdWx0cyh1bml0VGVzdE9iamVjdCkge1xyXG5cclxuICAgIHZhciByZXN1bHRzO1xyXG4gICAgdmFyIGdyb3VwcyA9IHt9XHJcbiAgICB2YXIgZ3JvdXBNZXRhZGF0YSA9IHt9XHJcblxyXG4gICAgdmFyIHByaW1hcnlHcm91cDtcclxuICAgIHZhciBlbmRlZCA9IGZhbHNlXHJcblxyXG4gICAgdW5pdFRlc3RPYmplY3QuZXZlbnRzKHtcclxuICAgICAgICBncm91cDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICB2YXIgZyA9IHtcclxuICAgICAgICAgICAgICAgcGFyZW50OiBlLnBhcmVudCxcclxuICAgICAgICAgICAgICAgaWQ6IGUuaWQsICAgICAgICAgICAgICAvLyBhIHVuaXF1ZSBpZCBmb3IgdGhlIHRlc3QgZ3JvdXBcclxuICAgICAgICAgICAgICAgdHlwZTogJ2dyb3VwJywgICAgICAgICAvLyBpbmRpY2F0ZXMgYSB0ZXN0IGdyb3VwIChlaXRoZXIgYSBgVW5pdC50ZXN0YCBjYWxsIG9yIGB0aGlzLnRlc3RgKVxyXG4gICAgICAgICAgICAgICBuYW1lOiBlLm5hbWUsICAgICAgICAgIC8vIHRoZSBuYW1lIG9mIHRoZSB0ZXN0XHJcbiAgICAgICAgICAgICAgIHJlc3VsdHM6IFtdLCAgICAgICAgICAgLy8gQW4gYXJyYXkgb2YgdGVzdCByZXN1bHRzLCB3aGljaCBjYW4gYmUgb2YgYW4gYFVuaXRUZXN0YCBSZXN1bHQgVHlwZXNcclxuICAgICAgICAgICAgICAgZXhjZXB0aW9uczogW10sICAgICAgICAvLyBBbiBhcnJheSBvZiB1bmNhdWdodCBleGNlcHRpb25zIHRocm93biBpbiB0aGUgdGVzdCxcclxuICAgICAgICAgICAgICAgdGltZTogZS50aW1lLFxyXG4gICAgICAgICAgICAgICBkdXJhdGlvbjogMCAgICAgICAgICAgIC8vIHRoZSBkdXJhdGlvbiBvZiB0aGUgdGVzdCBmcm9tIGl0cyBzdGFydCB0aWwgdGhlIGxhc3QgdGVzdCBhY3Rpb24gKGFzc2VydCwgbG9nLCBldGMpXHJcbiAgICAgICAgICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgICBpbmNsdWRpbmcgYXN5bmNocm9ub3VzIHBhcnRzIGFuZCBpbmNsdWRpbmcgc3VidGVzdHNcclxuICAgICAgICAgICAgICAgLy9zeW5jRHVyYXRpb246IF8sICAgICAgLy8gdGhlIHN5bmNocm9ub3VzIGR1cmF0aW9uIG9mIHRoZSB0ZXN0IChub3QgaW5jbHVkaW5nIGFueSBhc3luY2hyb25vdXMgcGFydHMpXHJcbiAgICAgICAgICAgICAgIC8vdG90YWxTeW5jRHVyYXRpb246IF8gIC8vIHN5bmNEdXJhdGlvbiBwbHVzIHRoZSBiZWZvcmUgYW5kIGFmdGVyIChpZiBhcHBsaWNhYmxlKVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihwcmltYXJ5R3JvdXAgPT09IHVuZGVmaW5lZCkgcHJpbWFyeUdyb3VwID0gZ1xyXG5cclxuICAgICAgICAgICAgZ3JvdXBzW2UuaWRdID0gZ1xyXG4gICAgICAgICAgICBncm91cE1ldGFkYXRhW2UuaWRdID0ge31cclxuICAgICAgICAgICAgaWYoZS5wYXJlbnQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0cyA9IGdcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0ucmVzdWx0cy5wdXNoKGcpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIGFzc2VydDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBlLnR5cGUgPSAnYXNzZXJ0J1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLnJlc3VsdHMucHVzaChlKVxyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUucGFyZW50LCBlLnRpbWUpXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb3VudDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBlLnR5cGUgPSAnYXNzZXJ0J1xyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUucGFyZW50LCBlLnRpbWUpXHJcblxyXG4gICAgICAgICAgICBncm91cE1ldGFkYXRhW2UucGFyZW50XS5jb3VudEluZm8gPSBlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBleGNlcHRpb246IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZ3JvdXBzW2UucGFyZW50XS5leGNlcHRpb25zLnB1c2goZS5lcnJvcilcclxuICAgICAgICAgICAgc2V0R3JvdXBEdXJhdGlvbihlLnBhcmVudCwgZS50aW1lKVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbG9nOiBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgICAgIGUudHlwZSA9ICdsb2cnXHJcbiAgICAgICAgICAgIGdyb3Vwc1tlLnBhcmVudF0ucmVzdWx0cy5wdXNoKGUpXHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24oZS5wYXJlbnQsIGUudGltZSlcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJlZm9yZTogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmJlZm9yZVN0YXJ0ID0gZS50aW1lXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZnRlcjogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmFmdGVyU3RhcnQgPSBlLnRpbWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJlZm9yZUVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBncm91cHNbZS5wYXJlbnRdLmJlZm9yZUR1cmF0aW9uID0gZS50aW1lIC0gZ3JvdXBzW2UucGFyZW50XS5iZWZvcmVTdGFydFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYWZ0ZXJFbmQ6IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgZ3JvdXBzW2UucGFyZW50XS5hZnRlckR1cmF0aW9uID0gZS50aW1lIC0gZ3JvdXBzW2UucGFyZW50XS5hZnRlclN0YXJ0XHJcbiAgICAgICAgfSxcclxuICAgICAgICBncm91cEVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBzZXRHcm91cER1cmF0aW9uKGUuaWQsIGUudGltZSlcclxuICAgICAgICB9LFxyXG4gICAgICAgIGVuZDogZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICBwcmltYXJ5R3JvdXAudGltZW91dCA9IGUudHlwZSA9PT0gJ3RpbWVvdXQnXHJcbiAgICAgICAgICAgIHNldEdyb3VwRHVyYXRpb24ocHJpbWFyeUdyb3VwLmlkLCBlLnRpbWUpXHJcblxyXG4gICAgICAgICAgICAvLyBtYWtlIHRoZSBjb3VudCBhc3NlcnRpb25zXHJcbiAgICAgICAgICAgIGVhY2hUZXN0KHByaW1hcnlHcm91cCwgZnVuY3Rpb24oc3VidGVzdCwgcGFyZW50dGVzdCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvdW50SW5mbyA9IGdyb3VwTWV0YWRhdGFbc3VidGVzdC5pZF0uY291bnRJbmZvXHJcbiAgICAgICAgICAgICAgICBpZihjb3VudEluZm8gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBpbmZvID0gY291bnRJbmZvXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFjdHVhbENvdW50ID0gMFxyXG4gICAgICAgICAgICAgICAgICAgIHN1YnRlc3QucmVzdWx0cy5mb3JFYWNoKGZ1bmN0aW9uKGEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoYS50eXBlID09PSAnYXNzZXJ0JyB8fCBhLnR5cGUgPT09ICdncm91cCcpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxDb3VudCsrXHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgc3VidGVzdC5yZXN1bHRzLnNwbGljZSgwLDAse1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHN1YnRlc3QuaWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdhc3NlcnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBhY3R1YWxDb3VudCA9PT0gaW5mby5leHBlY3RlZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZTogaW5mby50aW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VMaW5lczogaW5mby5zb3VyY2VMaW5lcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZTogaW5mby5maWxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiBpbmZvLmxpbmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjogaW5mby5jb2x1bW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBpbmZvLmV4cGVjdGVkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWw6IGFjdHVhbENvdW50XHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgICAgIGVuZGVkID0gdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgIH0pXHJcblxyXG4gICAgZnVuY3Rpb24gc2V0R3JvdXBEdXJhdGlvbihncm91cGlkLCB0aW1lKSB7XHJcbiAgICAgICAgdmFyIG5ld0R1cmF0aW9uID0gdGltZSAtIGdyb3Vwc1tncm91cGlkXS50aW1lXHJcbiAgICAgICAgaWYobmV3RHVyYXRpb24gPiBncm91cHNbZ3JvdXBpZF0uZHVyYXRpb24pIHtcclxuICAgICAgICAgICAgZ3JvdXBzW2dyb3VwaWRdLmR1cmF0aW9uID0gbmV3RHVyYXRpb25cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKGdyb3Vwc1tncm91cGlkXS5wYXJlbnQpIHtcclxuICAgICAgICAgICAgc2V0R3JvdXBEdXJhdGlvbihncm91cHNbZ3JvdXBpZF0ucGFyZW50LCB0aW1lKVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVzdWx0c1xyXG59XHJcblxyXG5cclxuLy8gaXRlcmF0ZXMgdGhyb3VnaCB0aGUgdGVzdHMgYW5kIHN1YnRlc3RzIGxlYXZlcyBmaXJzdCAoZGVwdGggZmlyc3QpXHJcbmZ1bmN0aW9uIGVhY2hUZXN0KHRlc3QsIGNhbGxiYWNrLCBwYXJlbnQpIHtcclxuICAgIHRlc3QucmVzdWx0cy5mb3JFYWNoKGZ1bmN0aW9uKHJlc3VsdCkge1xyXG4gICAgICAgIGlmKHJlc3VsdC50eXBlID09PSAnZ3JvdXAnKSB7XHJcbiAgICAgICAgICAgIGVhY2hUZXN0KHJlc3VsdCwgY2FsbGJhY2ssIHRlc3QpXHJcbiAgICAgICAgfVxyXG4gICAgfSlcclxuXHJcbiAgICBjYWxsYmFjayh0ZXN0LCBwYXJlbnQpXHJcbn0iXX0=
(42)
});
