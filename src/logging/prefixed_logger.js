var winston = require('winston');

module.exports = PrefixedLogger;

/**
 * @class This is a wrapper for a Winston instance that prefixes all messages.
 *
 * @param logger Winston instance.
 * @param {String} prefix Prefix to append to all logging calls made on this
 * instance.
 */
function PrefixedLogger(prefix) {
    this.prefix = prefix?prefix:process.pid;
}

PrefixedLogger.prototype.inject = function(properties){
    this.properties = properties;
}

PrefixedLogger.prototype.init = function(){
     logger = new winston.Logger({
        transports: [
            new winston.transports.Console({ level: this.properties['frontend.logLevel'], timestamp: true })
        ],
        levels: { silly: 0, debug: 1, verbose: 2, info: 3, warn: 4, error: 5 }
    });

    /**
     * Constructs the logging functions based on the levels
     */
    Object.keys(logger.levels).forEach(function(level) {
        this[level] = function() {
            arguments[0] =
                getFileAndLine() + ' - ' +
                this.prefix + ' > ' +
                arguments[0];

            logger[level].apply(logger, arguments);
        };
    }, this);
}

PrefixedLogger.prototype.extendPrefix = function(prefix){
    var logger = new PrefixedLogger(this.prefix+" "+prefix);
    logger.inject(this.properties);
    logger.init();
    return logger;
};

function getFileAndLine(){
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack){ return stack; };
    var err = new Error;
    Error.captureStackTrace(err, arguments.callee);
    var stack = err.stack;
    Error.prepareStackTrace = orig;

    //console.log(JSON.stringify(stack));
    var line = stack[1].getLineNumber();
    var fileParts = stack[1].getFileName().split("/");
    var result = fileParts[fileParts.length-1]+":"+line;

    return result;
}
