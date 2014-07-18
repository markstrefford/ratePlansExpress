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

        // Get rateplans
        //ota2004Db.getMulti([requestParams.hotelId], {format: 'json'}, function (err, ratePlanDoc) {      // TODO - Fix json format for get rather than getMulti
        //   if (err) console.log('Error retrieving ratePlan for hotelId ' + hotelId + ':' + JSON.stringify(err));
        //   else {
        //       console.log(ratePlanDoc);
        //console.log('Generating JSON response...')

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
    app.get('/hotel/:hotelId/rates', parseUrlParams, function (req, res) {
            var requestParams = parseRatesParams(req.urlParams.query);
            requestParams.hotelId = req.params.hotelId;
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

                                //console.log("RatePlans:" + JSON.stringify(ratePlans));
                                /*for (ratePlanCode in ratePlans) {
                                 var ratePlan = ratePlans[ratePlanCode];
                                 for (invCode in ratePlan) {
                                 ratesAndAvail = ratePlan[invCode];
                                 if (_.contains(_.keys(ratesAndAvail), 'Availability')) {
                                 if (ratesAndAvail.Availability > 0) {
                                 //console.log('OK to check occupancy for %s:%s:%s, Availability=%s', rateDocKey, ratePlanCode, invCode, ratesAndAvail.Availability);
                                 if (_.contains(_.keys(ratesAndAvail), 'Rates')) {
                                 for (rate in ratesAndAvail.Rates) {
                                 // Assume we already have invCode previously so no need to get it from the rate
                                 // Get occupancies
                                 for (baseByGuestAmt in ratesAndAvail.Rates[rate].BaseByGuestAmts) {
                                 rateDetails = ratesAndAvail.Rates[rate].BaseByGuestAmts[baseByGuestAmt];
                                 var numberOfGuests = rateDetails.NumberOfGuests;
                                 //console.log("Checking occupancy: room: %s, request: %s", numberOfGuests, requestParams.occupancy);
                                 if (numberOfGuests >= requestParams.occupancy) {
                                 //console.log(invCode + " has sufficient occupancy");

                                 ratesResponse.set(createJSONKey(invCode, ratePlanCode, processingDate), rateDetails.AmountAfterTax);
                                 // TODO - Need to add in stuff like booking limit, etc.
                                 }


                                 }

                                 }
                                 } else {
                                 //console.log('No availability for %s:%s:%s', rateDocKey, ratePlanCode, invCode);

                                 }
                                 }

                                 }
                                 }

                                 }*/
                            }
                        }
                        ;


                        /*      // Process the results set and return valid JSON response
                         var response = [];   // Start to create response back to the customer

                         // Get rateplans
                         //ota2004Db.getMulti([requestParams.hotelId], {format: 'json'}, function (err, ratePlanDoc) {      // TODO - Fix json format for get rather than getMulti
                         //   if (err) console.log('Error retrieving ratePlan for hotelId ' + hotelId + ':' + JSON.stringify(err));
                         //   else {
                         //       console.log(ratePlanDoc);
                         //console.log('Generating JSON response...')

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
                         res.send(response);
                         // res.send(ratesResponse.data);
                         //}
                         //});
                         */

                        var response = processResponse(ratesResponse, requestParams);
                        res.send('OK');

                    }
                }
            )
        }
    )

    ;


    /*
     * Saving rateplan stuff
     *
     * TODO - This saves in a different doc structure than the above code accepts.  Above code is designed to work initially with the document format created by C# in the PoC
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
                        //console.log('Contains BookingLimit' + JSON.stringify(availData));
                        var rateData = {bookingLimit: availData.BookingLimit};
                        var ratePlanCode = availData.StatusApplicationControl.RatePlanCode;
                        var invCode = availData.StatusApplicationControl.InvCode;
                        var startDate = availData.StatusApplicationControl.Start;
                        var endDate = availData.StatusApplicationControl.End;
                        var occupancy = {'adults': 'all'};     // This is a fudge for now!!

                        // TODO - Be more DRY here!!!
                        var range = moment().range(startDate, moment(endDate).subtract('days', 1));  // Remember the last day is the exit day, not the last entry day!!
                        range.by('days', function (rateDate) {
                            var key = createKey(hotelId, moment(rateDate).format('YYYY-MM-DD'), rateDate.add('days', 1).format('YYYY-MM-DD'));
                            saveRates(key, ratePlanCode, invCode, occupancy, rateData, 'bookingLimit', function (err, result) {
                                if (err) {
                                    //console.log("Err: " + JSON.stringify(err));
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


    /*    var saveRatePlanData = function (hotelId, startDate, endDate, ratePlanCode, invCode, occupancy, rateData, dataType, callback) {
     var range = moment().range(startDate, endDate);
     range.by('days', function (rateDate) {
     var key = createKey(hotelId, moment(rateDate).format('YYYY-MM-DD'), rateDate.add('days', 1).format('YYYY-MM-DD'));
     var invCode = ratePlanDetails.SellableProducts.SellableProduct.InvCode.replace(/ /g, '');
     saveRates(key, ratePlanCode, invCode, rateData, dataType, function (err, result) {
     if (err) {
     //console.log("Err: " + JSON.stringify(err));
     callback(err);
     }
     callback(null, result)
     });
     })
     }*/

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
                //console.log("1) Key " + key + " doesn't exist, creating..." + ratePlanCode + ":" + invCode);
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
                //console.log("2) Already exists: " + key );          // + ":" + JSON.stringify(rr.data));
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
                        //console.log("2)" + key + " written with cas " + JSON.stringify(cas));
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


// Parse query string for the rates call
    var parseRatesParams = function (queryString) {
        // TODO - Handle errors here, perhaps making this a callback!!
        // TODO - Check for sd < ed, 0 < ad < max, 0 =< ch <= max, etc.
        return {
            "startDate": queryString.d,
            "nights": queryString.n,
            "occupancy": queryString.o,
            "currency": queryString.cur
        }
    }

    /*
     * Get rateplans that fit my requirements
     *
     * /hotel/{id}/rates/?d={date}&n={nights}&o={occupancy}&cur={currency}
     *
     */
    app.get('/hotel/:hotelId/rates', parseUrlParams, function (req, res) {
            var requestParams = parseRatesParams(req.urlParams.query);
            requestParams.hotelId = req.params.hotelId;
            // Calculate keys for retrieving rate and availability
            var rateDocKeys = [];
            var startDate = moment(requestParams.startDate).format('YYYY-MM-DD');
            var endDate = moment(startDate).add('days', requestParams.nights - 1).format('YYYY-MM-DD');    // Remember the last day is the exit day, not the last entry day!!
            var range = moment().range(startDate, moment(endDate));
            range.by('days', function (rateDate) {
                // Get the keys!
                rateDocKeys.push(createKey(requestParams.hotelId, rateDate.format('YYYY-MM-DD'), moment(rateDate).add('days', 1).format('YYYY-MM-DD')));     // TODO - Handle LOS in here somewhere!
            });
            var ratesResponse = new JSONR('{}', {});
            // Now get docs from Couchbase
            console.log(rateDocKeys);
            ota2004Db.getMulti(rateDocKeys, {}, function (err, results) {
                    if (err) console.log(err)       // TODO - No callback????!!!?!?!?
                    else {
                        for (rates in results) {
                            var processingDate = rates.split(':')[1];        // Get the date that this message relates to from the key
                            console.log('Processing ' + processingDate);
                            if (_.keys(results[rates].value, 'rates')) {
                                // We have rates so let's progress
                                var rateDetails = results[rates].value.rates;
                                var ratePlans = _.keys(rateDetails);
                                ratePlans.map(function (ratePlan) {
                                        var invCodes = _.keys(rateDetails[ratePlan]);                              // Mapping a rate plan gives us a list of invCodes
                                        invCodes.map(function (invCode) {
                                            var occupancies = _.keys(rateDetails[ratePlan][invCode]);
                                            // Within invCodes we have the occupancy for this room
                                            if (_.contains(occupancies, requestParams.occupancy.toString())) {
                                                // We have a valid rate!!!
                                                var rateToProcess = rateDetails[ratePlan][invCode][requestParams.occupancy];
                                                console.log(rateToProcess);
                                                var pricePerNightDetails = {
                                                    price: rateToProcess.BaseByGuestAmts.BaseByGuestAmt.AmountAfterTax,
                                                    currency: rateToProcess.BaseByGuestAmts.BaseByGuestAmt.CurrencyCode
                                                    // TODO - handle additional guests
                                                }
                                                ratesResponse.set(createKey('rates', ratePlan, invCode, processingDate), pricePerNightDetails);
                                            }
                                        })
                                    }
                                )

                            }
                        }
                        ;
                        res.send(ratesResponse.data);
                    }
                }
            )
        }
    )

    ;


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

