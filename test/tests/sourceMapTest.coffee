root = global ? this  #ie global (but if global is declared here, it clobers the real global)

root.sourceMapTest = () -> # global function
  this.ok true

  this.test ->
    this.sourcemap false
    this.ok true

  throw new Error 'sourcemap test error'