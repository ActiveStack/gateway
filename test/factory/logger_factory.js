// Mock Logger
var loggerFunc = function(message){
    //console.log(message);
}

function MockLogger(){
    this.debug = loggerFunc;
    this.warn = loggerFunc;
    this.verbose = loggerFunc;
    this.error = loggerFunc;
    this.info = loggerFunc;
    this.extendPrefix = function(){ return this; }
}

module.exports = {
    create: function(){
        return new MockLogger();
    }
}