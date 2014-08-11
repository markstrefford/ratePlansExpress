/**
 * Created by markstrefford on 02/04/2014.
 */

var express = require('express'),
    http = require('http'),
    path = require('path'),
    nconf = require('nconf'),
    couchbase = require('couchbase'),
    _ = require('underscore'),
    moment = require('moment'),
    range = require('moment-range'),
    json = require("json-toolkit"),
    JSONR = json.Resource;


// Load config using nconf and config file
nconf.argv().env();
var configFile = nconf.get('ENV_CONFIG') || 'devconfig';
var config = require('./' + configFile);
console.log('Loaded config: ' + JSON.stringify(config));
var ota2004Db = new couchbase.Connection(config.database);


//var hotelOTA2004b = require('./routes/ota2004b.js')(ota2004Db, config, server);

// Get Rates Functionality

// Parse query string for the rates call
var parseRatesParams = function (params) {
    // TODO - Handle errors here, perhaps making this a callback!!
    // TODO - Check for sd < ed, 0 < ad < max, 0 =< ch <= max, etc.
    return {
        //"hotelId": params.hotelId,
        "startDate": params.d,
        "nights": params.n,
        "occupancy": params.o,
        "currency": params.cur
    }
}

var createKey = function () {
    var separator = "::";       // Needs to use ':' so it also works with JSON toolkit!!!
    var key = arguments[0];
    // Iterate through arguments, adding each argument and the separator to the key
    _.rest(arguments).forEach(function (arg) {
        key += separator + arg;
    });
    //console.log("Generated key: " + key);
    return key;
}

var createJSONKey = function () {
    var separator = ":";       // Needs to use ':' so it also works with JSON toolkit!!!
    var key = arguments[0];
    // Iterate through arguments, adding each argument and the separator to the key
    _.rest(arguments).forEach(function (arg) {
        key += separator + arg;
    });
    //console.log("Generated key: " + key);
    return key;
}


var processRatePlansByDate = function (request, range, results) {
    var ratesResponse = new JSONR('{}', {});
    var resultsKeys = _.keys(results);
    // Process documents by date
    range.by('days', function (rateDate) {
            var formattedRateDate = rateDate.format('YYYY-MM-DD');

            // Check that we got a rates & availability document for this hotel & day
            var key = createKey(request.hotelId, formattedRateDate);
            if (!_.contains(resultsKeys, key)) {
                //console.log('No rates/availability for hotel %s on day %s', request.hotelId, moment(rateDate).format('YYYY-MM-DD'));
                return null;        // We have a date with no rates or availability
            } else {
                // We have availability for this date

                // Get details of room types per rateplan per date
                _.keys(results[key].value).map(function (ratePlan) {
                //_.keys(_.toArray(results[key].value.toString())).map(function (ratePlan) {
                        //console.log(ratePlan);
                        //var roomTypePerRatePlanPerDate = results[key].value[ratePlan];

                        // Now check rooms for availability
                        _.keys(results[key].value[ratePlan]).map(function (roomType) {

                            // Store the rates for this date / rateplan / room
                            // We'll process occupancy later when we have everything together!
                            //ratesResponse.set(createJSONKey(formattedRateDate, ratePlan, roomType), results[key].value[ratePlan][roomType].Rates);
                            //console.log(JSON.stringify(results[key].value[ratePlan][roomType].Rates));
                            _.keys(results[key].value[ratePlan][roomType].Rates).map(function (rate) {
                                //console.log(results[key].value[ratePlan][roomType].Rates[rate]);
                                if (results[key].value[ratePlan][roomType].Rates[rate].BaseByGuestAmts[0].NumberOfGuests >= request.occupancy) {
                                    var rateJSON = {
                                        price: results[key].value[ratePlan][roomType].Rates[rate].BaseByGuestAmts[0].AmountAfterTax,
                                        currency: results[key].value[ratePlan][roomType].Rates[rate].BaseByGuestAmts[0].CurrencyCode,
                                        numGuests: results[key].value[ratePlan][roomType].Rates[rate].BaseByGuestAmts[0].NumberOfGuests
                                    }
                                    ratesResponse.set(createJSONKey(ratePlan, roomType, rate, formattedRateDate), rateJSON)
                                }
                                ;
                            })
                        })

                    }
                )
                ;


            }
        }
    )
    return ratesResponse.data;
}




/*
 * Get rateplans that fit my requirements
 *
 * /hotel/{id}/rates/?d={date}&n={nights}&o={occupancy}&cur={currency}
 *
 * NOTE: Code designed to work with PoC document format based on approach in C# (see BJSS for info!)
 *
 */
//app.get('/hotel/:hotelId/rates', parseUrlParams, function (req, res) {
var getOTA2004bRates = function (req, res, next) {
    //var request = parseRatesParams(req.params);
    var request = parseRatesParams(req.query);
    request.hotelId = req.params.hotelId;

    //console.log('getOTA2004bRates: reqParams:' + requestParams);
    //requestParams.hotelId = req.params.hotelId;
    // Calculate keys for retrieving rate and availability
    var rateDocKeys = [];
    var startDate = moment(request.startDate).format('YYYY-MM-DD');
    var endDate = moment(startDate).add('days', request.nights - 1).format('YYYY-MM-DD');    // Remember the last day is the exit day, not the last entry day!!
    var range = moment().range(startDate, moment(endDate));
    range.by('days', function (rateDate) {
        // Get the keys! Doc format = hotel:date
        rateDocKeys.push(createKey(request.hotelId, rateDate.format('YYYY-MM-DD')));     // TODO - Handle LOS in here somewhere!
    });

    // Gets docs from Couchbase
    ota2004Db.get('1', {format:'raw'}, function(err, res) {
        console.log(res.value);

    //ota2004Db.getMulti(_.flatten([request.hotelId, rateDocKeys]), {format: 'json'}, function (err, results) {
    //ota2004Db.getMulti(rateDocKeys, {format: 'json'}, function (err, results) {
            if (err) console.log(err)       // TODO - No callback????!!!?!?!?
            else {
                /*                console.log(results['10000'].value.length);
                                console.log('-----------');
                                console.log(results);
                                console.log('-----------');
                                console.log(_.toArray(results['10000'].value).toString());
                                console.log('-----------');*/


                var response = [];
                var aggregatedRates = processRatePlansByDate(request, range, results);

                if (aggregatedRates != null) {
                    //console.log('Aggregating...');

                    // Process by date
                    _.keys(aggregatedRates).map(function (aggregatedRatePlan) {


                        _.keys(aggregatedRates[aggregatedRatePlan]).map(function (invCode) {

                            // Now get rates

                            _.keys(aggregatedRates[aggregatedRatePlan][invCode]).map(function (rate) {
                                var rateDates = _.keys(aggregatedRates[aggregatedRatePlan][invCode][rate]);
                                if (rateDates.length != request.nights) {
                                    //console.log('Not enough nights with rates :-(');
                                } else {
                                    var totalPrice = 0;
                                    var perNightRateInfo = _.toArray(aggregatedRates[aggregatedRatePlan][invCode][rate]);
                                    //console.log(perNightRateInfo);

                                    perNightRateInfo.map(function (perNightRate) {

                                        totalPrice += perNightRate.price;
                                        numGuests = perNightRate.numGuests;
                                    })

                                    // Now create a response
                                    roomRate = {
                                        "id": invCode,
                                        "price": totalPrice,
                                        "cancellation_type": 1,
                                        "rackrate": totalPrice,
                                        "min_stay": 1,
                                        "sleeps": {
                                            "adults": request.occupancy
                                        },
                                        "remaining": 5,  // Hard coded just so we don't need to get data out from above!!
                                        "type": invCode,
                                        "advanced_purchase": true,
                                        "breakfast_included": true,
                                        "ratecode": '', // TODO - Get ratePlanCode!!
                                        "roomcode": invCode,
                                        "PriceBreakdown": {},
                                        "cancellation_policy": {}   // TODO - Get cancellation policy

                                    };
                                    response.push(roomRate);

                                }
                            })
                        })


                    })
                }
                res.send(response);
            }
        }
    )

}


var showReq = function (req, res, next) {
    console.log(req.params);
    res.send('OK');
}
/*var server = restify.createServer({
    name: 'OTA2004B RatePlans API'
});*/

var app = module.exports = express();

// Set up web server
var app = express();
app.set('port', process.env.PORT || 3001);
app.get('/hotel/:hotelId/rates', getOTA2004bRates);
//app.get('/hotel/:hotelId/rates', showReq);

http.globalAgent.maxSockets = 128;   // From http://stackoverflow.com/questions/16472497/nodejs-max-socket-pooling-settings
http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});


