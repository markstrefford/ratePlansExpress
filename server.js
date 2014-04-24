/**
 * Created by markstrefford on 02/04/2014.
 */

var express = require('express'),
    http = require('http'),
    path = require('path'),
    couchbase = require('couchbase'),
    _ = require('underscore'),
    elasticsearch = require('elasticsearch');

/*
 , rate =    require('./routes/rate.js')
 , channel = require('./routes/channel.js');
 */

var app = express();
app.set('port', process.env.PORT || 8001);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
// app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
// app.use(express.cookieParser('your secret here'));
// app.use(express.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// Dev / prod config options
var config = {
    "apiHost" : "localhost",
    "apiUrl" : ""
};

app.configure('development', function () {
    config.dbHost = 'localhost:8091';
    config.esHost = 'localhost:9200';
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function () {
    config.dbHost = 'some_prod_server:8091';
    config.esHost = 'some_prod_server:9200';
    app.use(express.errorHandler());
});

// Couchbase config
var ratePlansDb = new couchbase.Connection({host: config.dbHost, bucket: 'rateplans'}),
    rateAvailDb = new couchbase.Connection({host: config.dbHost, bucket: 'rates_and_availability'});

// Elastic Search config
var esClient = new elasticsearch.Client();
var esClient = elasticsearch.Client({
    hosts: [
        config.esHost
    ]
});

var routes = require('./routes'),
    // TODO - Option to split each provider into seperate code base
    hotelLiberate = require('./routes/ratePlans_Liberate.js')(ratePlansDb, rateAvailDb, esClient, config, app),
    hotelHilton = require('./routes/ratePlans_Hilton.js')(ratePlansDb, rateAvailDb, esClient, config, app),
    hotelEviivo = require('./routes/ratePlans_Eviivo.js')(ratePlansDb, rateAvailDb, esClient, config, app);

// Set up routes
app.get('/', routes.index);


// Now create the server
http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));

});