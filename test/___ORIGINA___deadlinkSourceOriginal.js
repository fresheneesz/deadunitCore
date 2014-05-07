var root = typeof global !== "undefined" && global !== null ? global : window;

root.sourceMapTest5 = function() {
    this.ok(true)
    throw new Error("deadlink source original error")
}
