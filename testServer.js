var http = require('http');
var fs = require('fs')
var url = require('url')

require("./build") // rebuild first

var server = http.createServer(function (request, res) {
    try {
        var requestUrl = url.parse(request.url)
        var path = requestUrl.pathname

        if(path !== '/favicon.ico') {
            console.log("got request for: "+path)

            if(path === '/') {
                path = '/testDeadunitCore.html'
            }

            var file = fs.readFileSync(__dirname+path)
            res.writeHead(200)
            res.write(file)
        } else {
            res.writeHead(400)
        }
    } catch(e) {
        console.log(e.message)
        res.writeHead(500)
    } finally {
        res.end()
    }
})

var port = 8100
server.listen(port)
console.log("listening on port "+port)
