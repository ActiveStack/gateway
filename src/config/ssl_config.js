const fs = require('fs')

function SSLConfig(){};
module.exports = SSLConfig;

SSLConfig.prototype.inject = function(properties, prefixedLogger){
    this.properties = properties;
    this.logger = prefixedLogger;
}

SSLConfig.prototype.init = function(){
    var useSsl = this.properties['frontend.ssl'];
    if (useSsl && (useSsl === 'true' || useSsl === 't' || useSsl === '1' || useSsl === 1))
        this.useSsl = true;
    else
        this.useSsl = false;

    if (this.useSsl)
        try {
            this.key = fs.readFileSync(this.properties['frontend.private_key']).toString();
            this.cert = fs.readFileSync(this.properties['frontend.certificate']).toString();
            var caFiles = this.properties['frontend.cert_auth'].split(',');
            this.ca = [];
            if (caFiles && caFiles.length > 0) {
                for(var i=0; i<caFiles.length; i++) {
                    this.ca.push(fs.readFileSync(caFiles[i]));
                }
            }
            this.rejectUnauthorized = this.properties['frontend.reject_unauthorized'] || true;
        } catch (error) {
            this.useSsl = false;
            this.logger.info('NOT using SSL');
            this.logger.error(error);
        }
}