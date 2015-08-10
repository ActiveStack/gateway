var http    = require('http'),
    https   = require('https');
/**
 * The class is responsible for creating and configuring
 * (but not starting) and Http(s)Server
 *
 * @constructor
 */

function HttpServerFactory(){
    this.httpServer = null;
};

module.exports = HttpServerFactory;

HttpServerFactory.prototype.inject = function(properties, sslConfig){
    this.properties = properties;
    this.ssl = sslConfig
};

HttpServerFactory.prototype.init = function(){
};

/**
 * @returns {HttpServer}
 */
HttpServerFactory.prototype.instance = function(){
    // Only want a single httpServer per application instance so use singleton pattern
    if(!this.httpServer){
        if(!this.ssl.useSsl){
            this.httpServer = http.createServer();
        }
        else {
            this.httpServer = https.createServer(this.ssl);
        }
    }

    return this.httpServer;
};