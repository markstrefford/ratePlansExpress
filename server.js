/**
 * Created by markstrefford on 02/04/2014.
 */


var restify = require('restify'),
    nconf = require('nconf'),
    couchbase = require('couchbase'),
    _ = require('underscore'),
    moment = require('moment'),
    range = require('moment-range'),
    url = require('url'),
    json = require("json-toolkit"),
    JSONR = json.Resource;


/*var config = {
 cbHost: 'localhost:8091',
 cbBucket: 'default'       // Default bucket due to the way cbrestore from AWS linux instance seems to work???
 }*/

nconf.argv().env();
var config = require('./' + nconf.get('ENV_CONFIG'));
console.log('Loaded config: ' + JSON.stringify(config));
/*nconf.defaults({
    'database': {
        'host': 'localhost:8091',
        'bucket': 'default'
    }
});
if (nconf.get('NODE_ENV') == 'DEV') {
    nconf.set('database:host', 'localhost:8091');
    nconf.set('database:bucket', 'default');
} else if (nconf.get('NODE_ENV') == 'AWS') {
    nconf.set('database:host', '10.1.1.39:8091');
    nconf.set('database:bucket', 'rates');
    nconf.set('database:password', 'rates');
}*/
var ota2004Db = new couchbase.Connection(config.database);


//var hotelOTA2004b = require('./routes/ota2004b.js')(ota2004Db, config, server);


// Get Rates Functionality

// Parse query string for the rates call
var parseRatesParams = function (params) {
    // TODO - Handle errors here, perhaps making this a callback!!
    // TODO - Check for sd < ed, 0 < ad < max, 0 =< ch <= max, etc.
    return {
        "hotelId": params.hotelId,
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
    var separator = "::";       // Needs to use ':' so it also works with JSON toolkit!!!
    var key = arguments[0];
    // Iterate through arguments, adding each argument and the separator to the key
    _.rest(arguments).forEach(function (arg) {
        key += separator + arg;
    });
    //console.log("Generated key: " + key);
    return key;
}

var processBaseByGuestAmt = function (invCode, ratePlanCode, processingDate, rate, requestParams) {
    var ratesResponse = new JSONR('{}', {});
    for (baseByGuestAmt in rate.BaseByGuestAmts) {
        var rateDetails = rate.BaseByGuestAmts[baseByGuestAmt];
        var numberOfGuests = rateDetails.NumberOfGuests;
        //console.log("Checking occupancy: room: %s, request: %s", numberOfGuests, requestParams.occupancy);
        if (numberOfGuests >= requestParams.occupancy) {
            //console.log(invCode + " has sufficient occupancy");

            ratesResponse.set(createJSONKey(invCode, ratePlanCode, processingDate), rateDetails.AmountAfterTax);
            // TODO - Need to add in stuff like booking limit, etc.
        }


    }
    return ratesResponse;
};


var processRatePlans = function (ratePlans, processingDate, requestParams) {
    var ratesResponse = {data: []}; //= new JSONR('{}', {});
    //console.log(ratePlans);
    for (ratePlanCode in ratePlans) {
        //console.log(ratePlanCode);
        var ratePlan = ratePlans[ratePlanCode];
        for (invCode in ratePlan) {
            var ratesAndAvail = ratePlan[invCode];
            if (_.contains(_.keys(ratesAndAvail), 'Availability')) {
                if (ratesAndAvail.Availability > 0) {
                    //console.log('OK to check occupancy for %s:%s:%s, Availability=%s', rateDocKey, ratePlanCode, invCode, ratesAndAvail.Availability);
                    if (_.contains(_.keys(ratesAndAvail), 'Rates')) {
                        for (rate in ratesAndAvail.Rates) {
                            //console.log('rate');
                            ratesResponse.data.push(processBaseByGuestAmt(invCode, ratePlanCode, processingDate, ratesAndAvail.Rates[rate], requestParams));
                        }
                        /*} else {
                         //console.log('No availability for %s:%s:%s', rateDocKey, ratePlanCode, invCode);*/
                    }
                }

            }
        }
    }
    return ratesResponse;
}


var processResponse = function (ratesResponse, requestParams) {
    var response = [];   // Start to create response back to the customer

    for (invCode in ratesResponse.data) {
        //console.log(invCode);
        var rateResponse = ratesResponse.data[invCode];
        // TODO - Get rateplan docs somewhere...
        for (ratePlanCode in rateResponse) {
            //console.log(ratePlanCode);
            var processedRate = rateResponse[ratePlanCode];
            var count = 0, totalPrice = 0;
            _.map(processedRate, function (pricePerDay) {
                count += 1;
                totalPrice += pricePerDay;
                return (count, totalPrice)
            })
            //console.log(count, totalPrice);
            if (count == requestParams.nights) {
                roomRate = {
                    "id": invCode,
                    "price": totalPrice,
                    "cancellation_type": 1,
                    "rackrate": totalPrice,
                    "min_stay": 1,
                    "sleeps": {
                        "adults": requestParams.occupancy
                    },
                    "remaining": 5,  // Hard coded just so we don't need to get data out from above!!
                    "type": invCode,
                    "advanced_purchase": true,
                    "breakfast_included": true,
                    "ratecode": ratePlanCode,
                    "roomcode": invCode,
                    "PriceBreakdown": {},
                    "cancellation_policy": {}

                };
                //console.log(roomRate);
                response.push(roomRate);
            }
        }
    }
    //res.send(response);
    return response;
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
    var requestParams = parseRatesParams(req.params);
    //console.log('getOTA2004bRates: reqParams:' + requestParams);
    //requestParams.hotelId = req.params.hotelId;
    // Calculate keys for retrieving rate and availability
    var rateDocKeys = [];
    var startDate = moment(requestParams.startDate).format('YYYY-MM-DD');
    var endDate = moment(startDate).add('days', requestParams.nights - 1).format('YYYY-MM-DD');    // Remember the last day is the exit day, not the last entry day!!
    var range = moment().range(startDate, moment(endDate));
    range.by('days', function (rateDate) {
        // Get the keys! Doc format = hotel:date
        rateDocKeys.push(createKey(requestParams.hotelId, rateDate.format('YYYY-MM-DD')));     // TODO - Handle LOS in here somewhere!
    });
    var ratesResponse; // = new JSONR('{}', {});
    // Now get docs from Couchbase
    //console.log(rateDocKeys);
    ota2004Db.getMulti(_.flatten([requestParams.hotelId, rateDocKeys]), {format: 'json'}, function (err, results) {
            if (err) console.log(err)       // TODO - No callback????!!!?!?!?
            else {
                for (rateDocKey in results) {
                 if (rateDocKey == requestParams.hotelId) {
                 //console.log('Ignoring rateplan doc ' + rateDocKey + ' for now due to JSON issues!!')
                 } else {
                 var processingDate = rateDocKey.split('::')[1];        // Get the date that this message relates to from the key
                 //console.log('Processing rates for ' + processingDate)
                 var ratePlans = results[rateDocKey].value;

                 ratesResponse = processRatePlans(ratePlans, processingDate, requestParams);
                 }
                 }
                 ;
                 var response = processResponse(ratesResponse, requestParams);
                 res.send(response);
                 //next();
                //res.send('OK');
            }
        }
    )
    //next();

}


var showReq = function (req, res, next) {
    //console.log(req.params);
    res.send('OK');
}
var server = restify.createServer({
    name: 'OTA2004B RatePlans API'
});
server.use(restify.queryParser());
server.get('/hotel/:hotelId/rates', getOTA2004bRates);
//server.get('/hotel/:hotelId/rates', showReq);
//server.head('/hello/:name', respond);

server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});


