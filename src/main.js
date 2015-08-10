/**
 * This is the main entry point into the activestack gateway module
 */
module.exports = new ActiveStackGateway();


/**
 * This class acts as the command handler into the Gateway. Currently it can only act as a singleton.
 * @constructor
 */
function ActiveStackGateway(){
    return {
        Server: require('./server_application.js'),
        Console: require('./console.js')
    }
}