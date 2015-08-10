var Session = require('../service/session');

function SessionFactory(){}
module.exports = SessionFactory;

SessionFactory.prototype.inject = function(prefixedLogger, properties){
    this.logger = prefixedLogger;
    this.properties = properties;
};

SessionFactory.prototype.create = function(){
    return new Session(this.logger, this.properties);
};