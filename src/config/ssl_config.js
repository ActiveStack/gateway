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
            this.privateKey = fs.readFileSync(this.properties['frontend.private_key']).toString();
            this.certificate = fs.readFileSync(this.properties['frontend.certificate']).toString();
            this.ca = fs.readFileSync(this.properties['frontend.cert_auth']).toString();
        } catch (error) {
            this.useSsl = false;
            this.logger.info('NOT using SSL');
            this.logger.error(error);
        }
}