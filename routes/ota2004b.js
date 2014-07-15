/**
 * Created by markstrefford on 11/07/2014.
 */
/**
 *
 * Created by markstrefford on 02/04/2014.
 *
 */

var _ = require('underscore'),
    moment = require('moment'),
    range = require('moment-range'),
    url = require('url'),
    async = require('async'),
    json = require("json-toolkit"),
    JSONR = json.Resource;
;

var createKey = function () {
    var separator = ":";       // Needs to use ':' so it also works with JSON toolkit!!!
    var key = arguments[0];
    // Iterate through arguments, adding each argument and the separator to the key
    _.rest(arguments).forEach(function (arg) {
        key += separator + arg;
    });
    console.log("Generated key: " + key);
    return key;
}

module.exports = function (ota2004Db, config, app) {

    var product = "hotel",
        brand = "ota2004",
        productUrl = config.apiUrl + "/" + product + "/" + brand + "/";

    console.log(productUrl + " online");

//      request = require('request');

    // TODO - Make these a generic function that is added by require();

    // Get query string
    var parseUrlParams = function (req, res, next) {
        req.urlParams = url.parse(req.url, true);
        next();
    }

    // Parse query string for the rates call
    var parseRatesParams = function (queryString) {
        // TODO - Handle errors here, perhaps making this a callback!!
        // TODO - Check for sd < ed, 0 < ad < max, 0 =< ch <= max, etc.
        return {
            "hotelCode": queryString.hid,
            "startDate": queryString.sd,
            "endDate": queryString.ed,
            "adults": queryString.ad,
            "children": queryString.ch
        }
    }


    /*
     * Saving rateplan stuff
     */
    app.post(productUrl + 'rates', function (req, res) {
            var ota2004Doc = req.body;

            // Get document type
            var docType = _.keys(ota2004Doc)[0];
            console.log(docType);
            if (docType == 'OTA_HotelRatePlanNotifRQ') {
                // Handle different OTA_HotelRatePlanNotifRQ messages
                var hotelId = ota2004Doc.OTA_HotelRatePlanNotifRQ.RatePlans.HotelCode;

                ota2004Doc.OTA_HotelRatePlanNotifRQ.RatePlans.RatePlan.map(function (ratePlanDetails) {
                        var results = [], errors = [];
                        var ratePlanCode = ratePlanDetails.RatePlanCode;
                        ratePlanDocKeys = _.keys(ratePlanDetails);
                        if (ratePlanDocKeys[1] == 'RatePlanCodeType') {
                            // Process creating a new rate plan
                            console.log('CreateRatePlan Doc');
                            var key = createKey(hotelId, ratePlanCode);
                            saveRatePlan(key, ratePlanDetails, function (err, result) {
                                if (err) {
                                    console.log("Err" + JSON.stringify(err));
                                    errors.push(err);
                                }
                                else results.push(result)
                            });
                        } else {
                            // Process Update Rates message
                            var invCode = ratePlanDetails.SellableProducts.SellableProduct.InvCode;
                            ratePlanDetails.Rates.Rate.map(function (rate) {
                                    var startDate = rate.Start;
                                    var endDate = rate.End;
                                    var occupancy = {};
                                    occupancy.adults = rate.BaseByGuestAmts.BaseByGuestAmt.NumberOfGuests;  //TODO - Assume AgeQualifyingCode is always '10' for Adults
                                    var invCode = ratePlanDetails.SellableProducts.SellableProduct.InvCode //.replace(/ /g, '-');

                                    var range = moment().range(startDate, moment(endDate).subtract('days', 1));  // Remember the last day is the exit day, not the last entry day!!
                                    range.by('days', function (rateDate) {
                                        var key = createKey(hotelId, moment(rateDate).format('YYYY-MM-DD'), rateDate.add('days', 1).format('YYYY-MM-DD'));
                                        saveRates(key, ratePlanCode, invCode, occupancy, rate, 'rates', function (err, result) {
                                            if (err) {
                                                console.log("Err: " + JSON.stringify(err));
                                                errors.push(err);
                                            }
                                            else results.push(result)
                                        });
                                    })
                                }
                            )
                            ;
                            res.send('OK');
                        }

                        // Now we're out of the map
                        if (errors.length > 0) res.send(500);
                        else res.send(results);

                    }
                )
            } else if (docType = 'OTA_HotelAvailNotifRQ') {
                var results = [], errors = [];

                // Assume the doc contains all the relevant bits!
                var hotelId = ota2004Doc.OTA_HotelAvailNotifRQ.AvailStatusMessages.HotelCode;
                ota2004Doc.OTA_HotelAvailNotifRQ.AvailStatusMessages.AvailStatusMessage.map(function (availData) {
                    if (_.contains(_.keys(availData), 'BookingLimit')) {
                        console.log('Contains BookingLimit' + JSON.stringify(availData));
                        var rateData = {bookingLimit: availData.BookingLimit};
                        var ratePlanCode = availData.StatusApplicationControl.RatePlanCode;
                        var invCode = availData.StatusApplicationControl.InvCode;
                        var startDate = availData.StatusApplicationControl.Start;
                        var endDate = availData.StatusApplicationControl.End;
                        var occupancy = {'adults' : 'all'};     // This is a fudge for now!!

                        var range = moment().range(startDate, moment(endDate).subtract('days', 1));  // Remember the last day is the exit day, not the last entry day!!
                        range.by('days', function (rateDate) {
                            var key = createKey(hotelId, moment(rateDate).format('YYYY-MM-DD'), rateDate.add('days', 1).format('YYYY-MM-DD'));
                            saveRates(key, ratePlanCode, invCode, occupancy, rateData, 'bookingLimit', function (err, result) {
                                if (err) {
                                    console.log("Err: " + JSON.stringify(err));
                                    errors.push(err);
                                }
                                else results.push(result)
                            });
                        })

                    }

                })
                res.send('OK');
            }
            else {
                // Process new / updated rates
                console.log('ERROR: Non OTA message provided!!');
            }
        }
    )


    var saveRatePlanData = function (hotelId, startDate, endDate, ratePlanCode, invCode, occupancy, rateData, dataType, callback) {
        var range = moment().range(startDate, endDate);
        range.by('days', function (rateDate) {
            var key = createKey(hotelId, moment(rateDate).format('YYYY-MM-DD'), rateDate.add('days', 1).format('YYYY-MM-DD'));
            var invCode = ratePlanDetails.SellableProducts.SellableProduct.InvCode.replace(/ /g, '');
            saveRates(key, ratePlanCode, invCode, rateData, dataType, function (err, result) {
                if (err) {
                    console.log("Err: " + JSON.stringify(err));
                    callback(err);
                }
                callback(null, result)
            });
        })
    }

    // Save rates.  Multiple rates per doc, so need to be *careful* here!!!
    //var saveRates = function (key, ratePlanCode, invCode, roomRate, callback) {
    var saveRates = function (key, ratePlanCode, invCode, occupancy, rateData, dataType, callback) {
        var rr,
            cas,
            rateKey
            ;
        ota2004Db.get(key, function (err, result) {
            //console.log(error.code);
            if (err) {
                console.log("1) Key " + key + " doesn't exist, creating..." + ratePlanCode + ":" + invCode);
                var rr = new JSONR('{}', {from_file: false, pretty_output: true});
                rr.set(createKey(dataType, ratePlanCode, invCode, occupancy.adults), rateData);         // From JSON toolkit!!
                ota2004Db.add(key, rr.data, function (err, result) {
                    if (err) {
                        if (err.code == 12) {
                            console.log("1) CAS Error, retrying key: " + key);
                            saveRates(key, ratePlanCode, invCode, occupancy, rateData, dataType, callback);
                        } else {
                            console.log("1) Error setting " + key + ", error " + JSON.stringify(err));
                            callback(err);
                        }
                    }
                    else {
                        console.log("1) " + key + " written OK");
                        callback(null, result);
                    }
                })
            } else {
                var rr = new JSONR(result.value, {from_file: false, pretty_output: true});
                cas = result.cas;
                console.log("2) Already exists: " + key );          // + ":" + JSON.stringify(rr.data));
                rr.set(createKey(dataType, ratePlanCode, invCode, occupancy.adults), rateData);         // From JSON toolkit!!

                //console.log("2) Adding to " + key + " : " + JSON.stringify(rateData));

                // Now write to the DB
                // TODO - Work through CAS checking...
                ota2004Db.set(key, rr.data, { cas: cas }, function (err, result) {
                    if (err) {
                        if (err.code == 12) {
                            console.log("2) CAS Error, retrying key: " + key);
                            saveRates(key, ratePlanCode, invCode, occupancy, rateData, dataType, callback);
                        } else {
                            console.log("2) Error setting " + key + ", error " + JSON.stringify(err));
                            callback(err);
                        }
                    }
                    else {
                        console.log("2)" + key + " written with cas " + JSON.stringify(cas));
                        callback(null, result);
                    }
                });
            }
        })
    }


    // Save Rateplan - assume just replace old one for now
    var saveRatePlan = function (key, doc, callback) {
        ota2004Db.set(key, doc, function (err, result) {
            if (err) {
                console.log('saveRatePlan: Error writing rateplan ' + key + ' with ' + err);
                callback(err);
            } else {
                console.log('saveRatePlan: Completed writing rateplan ' + key);
                callback(null, result)
            }
        })
    };

    /*
     * Get rateplans that fit my requirements
     */
    app.get(productUrl + 'rates', parseUrlParams, function (req, res) {
            console.log(productUrl + "rates: " + JSON.stringify(req.urlParams.query));
            var params = parseRatesParams(req.urlParams.query);

            esClient.search({host: 'localhost:9200',
                    index: 'rates_and_availability',
                    body: {
                        "query": {
                            "bool": {
                                "must": [
                                    {"query_string": {"default_field": "couchbaseDocument.doc.hotelCode", "query": params.hotelCode}},
                                    {"range": {"couchbaseDocument.doc.EffectiveDate": {"gte": params.startDate}}},
                                    {"range": {"couchbaseDocument.doc.ExpireDate": {"lte": params.endDate}}}
                                ], "must_not": [], "should": []
                            }
                        },
                        "from": 0, "size": 50, "sort": [], "facets": {
                        }
                    }
                }
            ).then(function (body) {
                    var numRateAvail = body.hits.total;
                    if (numRateAvail = 0) {
                        console.log("*** CALL CONNECTIVITY - NO RATE AVAILABLE!! ***");
                    }
                    else {
                        var rateAvailRes = body.hits.hits;
                        var response = [];
                        console.log(productUrl + "search : " + numRateAvail + " possible rates available");
                        // This is from http://book.mixu.net/node/ch7.html (#7.2.2)
                        rateAvailRes.forEach(function (rateAvail) {
                            console.log("rateAvail:" + JSON.stringify(rateAvail));
                            getPulledRateAvail(rateAvail._id, function (error, raRes) {
                                // TODO - Handle errors!
                                console.log("raRes:" + raRes);
                                var r = {
                                    "BookingInfo": {
                                        "RoomTypeCode": raRes.RoomTypeCode,
                                        "RatePlanCode": raRes.RatePlanCode,
                                        "BookingCode": raRes.BookingCode
                                    },
                                    "Base": raRes.Rates.Rate.Base,
                                    "Taxes": raRes.Rates.Rate.Total.Taxes,
                                    "Features": raRes.Features
                                }
                                //console.log(r);
                                response.push(r);
                                if (response.length == rateAvailRes.length) {
                                    console.log("Response: " + response);
                                    res.send(response);
                                }
                            })
                        })
                    }
                    ;

                }, function (error) {
                    console.trace(error.message);
                    res.send(404);
                });
            ;
        }
    );


// Get rates and availability
    var getPulledRateAvail = function (rateAvailKey, callback) {
        rateAvailDb.get(rateAvailKey, function (error, result) {
            if (error) callback(error);
            else {
                //console.log("getPulledRateAvail: " + JSON.stringify(result.value));
                callback(null, result.value);
            }
        })
    }

    /*
     * Reading rateplan stuff
     */
    app.get(productUrl + 'rateplan/:rateplanId', function (req, res) {
        var rateplan_id = req.params.rateplanId;
        getPulledRatePlan(rateplan_id, function (error, rateplan) {
            console.log(rateplan);
            if (error) res.send(500);
            else res.send(rateplan);
        })
    });

// Specific request to get pulled rateplan
// TODO - May change this back to a generic function for push and pull!!
    var getPulledRatePlan = function (rateplan_id, callback) {
        ratePlanDb.get(rateplan_id, function (error, result) {
            if (error) callback(error);
            else {
                //console.log(JSON.stringify(result.value));
                callback(null, result.value);
            }
        })
    }

}

