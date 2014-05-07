var root = typeof global !== "undefined" && global !== null ? global : window;

root.sourceMapTest4 = function() {
    this.ok(true)
    throw new Error("deadlink sourcemap path error")
}
