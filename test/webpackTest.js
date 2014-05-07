var root = typeof global !== "undefined" && global !== null ? global : window;

root.sourceMapTest3 = function() {
    this.ok(true)
    throw new Error("webpack bundle error")
}
