
var fs = require("fs")
var path = require('path')
var child = require("child_process")

var webpack = require("webpack")
var browserify = require("browserify")


browserifyBuild(__dirname+"/src/deadunitCore.browser", __dirname, 'deadunitCore.browser.gen')

// test stuff

var outputFolder = __dirname+"/test/generated"

browserifyBuild(__dirname+"/test/deadunitTests.browser", outputFolder, 'deadunitTests.browser')
browserifyBuild(__dirname+"/test/tests/inlineSourceMapTest", outputFolder, 'inlineSourceMapTest.browserified')
browserifyBuild(__dirname+"/test/tests/deadlinkSourcemapPath", outputFolder, 'deadlinkSourcemapPath')
browserifyBuild(__dirname+"/test/tests/deadlinkSourceOriginal", outputFolder, 'deadlinkSourceOriginal')
buildCoffeescriptFile(__dirname+"/test/tests/sourceMapTest.coffee")

// webpack bundle

buildWebpackBundle("test/tests/webpackTest.js")


function buildCoffeescriptFile(script) {
    console.log(require.resolve('coffee-script/bin/coffee'))
    var c = child.spawn('node', [require.resolve('coffee-script/bin/coffee'), script, '--map'], {stdio: 'inherit'})
    c.on('error', function(E) {
        console.log("ahhhh "+E)
    })
    c.on('exit', function() {
        console.log("done building "+script)
    })
}

function browserifyBuild(entrypoint, outputFolder, globalName) {
    var unminifiedStream = fs.createWriteStream(outputFolder+'/'+path.basename(entrypoint)+'.umd.js')
    browserify({baseDir: __dirname}).add(entrypoint+'.js').bundle({debug: true, standalone: globalName}).pipe(unminifiedStream)

    unminifiedStream.on('close', function() {
        console.log('done building '+entrypoint+'.js')
    })
}


function buildWebpackBundle(entrypoint) {

    var webpackConfig = {
        // configuration
        context: __dirname,
        entry: "./"+entrypoint,
        output: {
            path: __dirname+"/test/generated/",
            filename: path.basename(entrypoint)+".bundle.js",
            pathinfo: true, // do not use this in production
            jsonpFunction: "JSON_PEEEE_BITCHEEEEEESSZZZ"
        },
        plugins: [
          new webpack.optimize.OccurenceOrderPlugin(/*preferEntry=*/true), // does .. something, and makes the entry chunk smaller (at the cost of making later chunks bigger)
          new webpack.optimize.DedupePlugin()       // removes duplicate files
        ],
        cache: true,
        devtool: "source-map"

    }

    webpack(webpackConfig, function(err, stats) {
        if(err) {
            console.log("Error building bundle: "+errorToString(err))
        } else {
            var jsonStats = stats.toJson();

            if(jsonStats.warnings.length > 0)
                jsonStats.warnings.forEach(function(w) {
                    emitter.emit('warning', w)
                })

            if(jsonStats.errors.length > 0)
                jsonStats.errors.forEach(function(e) {
                    console.log("Error building bundle: "+errorToString(e))
                })
            else
                console.log('Success building '+entrypoint+'!')
        }
    })

}

function errorToString(e) {
    if(e.stack) return e.stack
    else return e.toString()
}

