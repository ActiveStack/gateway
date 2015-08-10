#!/usr/bin/env node
var gateway = require('../src/main.js');

// Pull the command from the command line
var command = process.argv[2] || 'server';

var configFile = process.argv[3];

switch(command.toLowerCase()){
    case 's':
        new gateway.Server().run(configFile);
        break;
    case 'server':
        new gateway.Server().run(configFile);
        break;
    case 'c':
        new gateway.Console().run(configFile);
        break;
    case 'console':
        new gateway.Console().run(configFile);
        break;
    default:
        new gateway.Server().run(configFile);
        break;
}