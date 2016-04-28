propParser = require('node-properties-parser');

function Properties(fileName) {
    this.fileName = fileName;
};
module.exports = Properties;

Properties.prototype.inject = function(prefixedLogger){
    this.logger = prefixedLogger;

    var properties;
    if(this.fileName && this.fileName !== '')
        try{
            properties = propParser.readSync(this.fileName);
        }catch(e){
            console.log('Could not load properties file from '+this.fileName);
        }

    if(!properties)
        properties = propParser.readSync(__dirname + '/../../resources/env.default.properties');

    for(var key in properties){
        this[key] = properties[key];
    }
};