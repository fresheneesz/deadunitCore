var build = require('build-modules')

build(__dirname+'/browserPackage/', 'deadunitCore.browser.gen', '/*Copyright 2014 Billy Tetrud - MIT license, free for any use*/', __dirname+"/deadunitCore.browser.js", function(e) {
    if(e === undefined) {
        console.log('done building browser package')
    } else {
        console.log(e.stack)
        process.exit(1)
    }
})

build(__dirname+'/test/', 'deadunitTests.browser', '/*Copyright 2014 Billy Tetrud - MIT license, free for any use*/', __dirname+"/test/deadunitTests.js", function(e) {
    if(e === undefined) {
        console.log('done building test package')
    } else {
        console.log(e.stack)
        process.exit(1)
    }
})


