/**
 * Created by markstrefford on 02/04/2014.
 */

var express =   require('express'),
    http =    require('http'),
    path =    require('path'),
    couchbase = require('couchbase');

/*
    , rate =    require('./routes/rate.js')
    , channel = require('./routes/channel.js');
*/

var app = express()  ;
app.set('port', process.env.PORT || 8000);
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

app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function () {
    app.use(express.errorHandler());
});

var ratePlansDb = new couchbase.Connection({host: 'localhost:8091', bucket: 'rateplans'});

var routes =    require('./routes'),
    rateplans =  require('./routes/rateplans.js')(ratePlansDb, app)

// Set up routes
app.get('/', routes.index);
//var ratePlanRoutes =    rateplan.addRatePlanRoutes(app, ratePlanProvider);
//var channelRoutes =     channel.addChannelRoutes(app, channelProvider);
//var rateRoutes =        rate.addRateRoutes(app, rateProvider, ratePlanProvider, channelProvider);


// Now create the server
http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));

});