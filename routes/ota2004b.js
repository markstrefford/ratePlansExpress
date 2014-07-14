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
    async = require('async');

var createKey = function () {
    var separator = "::";
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
            if (docType = 'OTA_HotelRatePlanNotifRQ') {
                // Handle different OTA_HotelRatePlanNotifRQ messages
                var hotelId = ota2004Doc.OTA_HotelRatePlanNotifRQ.RatePlans.HotelCode;

                ota2004Doc.OTA_HotelRatePlanNotifRQ.RatePlans.RatePlan.map(function (ratePlanDetails) {
                        var results = [], errors = [];
                        //console.log(ratePlanDetails);
                        var ratePlanCode = ratePlanDetails.RatePlanCode;
                        ratePlanDocKeys = _.keys(ratePlanDetails);
                        if (ratePlanDocKeys[1] == 'RatePlanCodeType') {
                            // Process creating a new rate plan
                            console.log('CreateRatePlan Doc');
                            //var currencyCode = ratePlanDetails.CurrencyCode;
                            /*ratePlanDetails.BookingRules.BookingRule.LengthsOfStay.LengthOfStay.map(function (los) {
                             if (los.MinMaxMessageType == 'SetMinLOS') {
                             console.log('MinLOS=' + los.Time + los.TimeUnit);
                             } else {
                             console.log('MaxLOS=' + los.Time + los.TimeUnit);
                             }
                             })*/
                            var key = createKey(hotelId, ratePlanCode);
                            saveRatePlan(key, ratePlanDetails, function (err, result) {
                                //if (err) res.send('Error: SaveRatePlan: ' + err);
                                //else res.send(result)
                                if (err) {
                                    console.log("Err" + JSON.stringify(err));
                                    errors.push(err);
                                }
                                else results.push(result)
                            });
                        } else {
                            //console.log('RatePlan:' + ratePlanDetails.RatePlanCode);
                            var invCode = ratePlanDetails.SellableProducts.SellableProduct.InvCode;
                            //console.log('InvCode:' + invCode)
                            ratePlanDetails.Rates.Rate.map(function (rate) {
                                    //console.log(rate);
                                    var startDate = rate.Start;
                                    var endDate = rate.End;
                                    var adults = rate.BaseByGuestAmts.BaseByGuestAmt.NumberOfGuests;  //TODO - Assume AgeQualifyingCode is always '10' for Adults
                                    var children = 0;
                                    if (_.contains(_.keys(rate), 'AdditionalGuestAmounts')) {
                                        /*  // Additional guest amounts provided for this rate
                                         if (rate.AdditionalGuestAmounts.AdditionalGuestAmount.AgeQualifyingCode == '8') {
                                         children = rate.AdditionalGuestAmounts.AdditionalGuestAmount.MaxAdditionalGuests;
                                         children = rate.AdditionalGuestAmounts.AdditionalGuestAmount.MaxAdditionalGuests;
                                         console.log("Occ:" + adults + "-" + children);
                                         } else {
                                         // Assume if not children then adults!!
                                         adults = (parseInt(adults) + rate.AdditionalGuestAmounts.AdditionalGuestAmount.MaxAdditionalGuests).toString();
                                         }*/
                                        adults = (parseInt(adults) + parseInt(rate.AdditionalGuestAmounts.AdditionalGuestAmount.MaxAdditionalGuests)).toString();

                                    }
                                    ;
                                    var range = moment().range(startDate, endDate);
                                    range.by('days', function (rateDate) {
                                        // console.log("Date: " + moment(rateDate).format('YYYY-MM-DD'));
                                        // Assume that we have LOS = 1 for now!
                                        var key = createKey(hotelId, moment(rateDate).format('YYYY-MM-DD'), rateDate.add('days', 1).format('YYYY-MM-DD'), adults, children);
                                        var invCode = ratePlanDetails.SellableProducts.SellableProduct.InvCode.replace(/ /g, '');
                                        saveRates(key, ratePlanCode, invCode, rate, function (err, result) {
                                            //if (err) res.send('Error: SaveRatePlan: ' + err);
                                            //else res.send(result)
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
            }

            else {
                // Process new / updated rates
                console.log('Other type of message');

            }


        }
    )

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

    // Save rates.  Multiple rates per doc, so need to be *careful* here!!!
    var saveRates = function (key, ratePlanCode, roomRef, roomRate, callback) {
        var rr,
            cas,
            rateKey
            ;
        ota2004Db.get(key, function (err, result) {
            //console.log(error.code);
            if (err) {
                console.log("1) Key " + key + " doesn't exist, creating..." + ratePlanCode + ":" + roomRef);
                rr = {};
                rateKey = '_' + ratePlanCode;
                rr.rates = {};
                rr.rates[rateKey] = {};
                rr.rates[rateKey][roomRef] = roomRate;         // TODO - try to by DRY here!
                console.log("1) Writing rr." + rateKey + "." + JSON.stringify(roomRate));
                ota2004Db.add(key, rr, function (err, result) {
                    if (err) {
                        //console.log(error);
                        if (err.code == 12) {
                            console.log("1) CAS Error, retrying key: " + key);
                            saveRates(key, ratePlanCode, roomRef, roomRate, callback)
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
                console.log("2) Already exists: " + key);
                rr = result.value;
                cas = result.cas;
                rateKey = '_' + ratePlanCode;
                if (!_.contains(_.keys(rr), 'rates')) {
                    console.log('2) Creating rr.rates');
                    rr.rates = {};
                }
                ;
                if (!_.contains(_.keys(rr.rates), rateKey)) {
                    console.log('2) Creating rr.rates.' + rateKey);
                    rr.rates[rateKey] = {};
                }
                ;
                rr.rates[rateKey][roomRef] = roomRate;         // TODO - try to by DRY here!

                console.log("2) Writing : " + key + " : " + JSON.stringify(rr) + JSON.stringify(roomRate));

                // Now write to the DB
                // TODO - Work through CAS checking...
                ota2004Db.set(key, rr, { cas: cas }, function (err, result) {
                    if (err) {
                        console.log(key + ": " + JSON.stringify(err) + " / " + err.code);
                        if (err.code == 12) {
                            console.log("2) CAS Error, retrying key: " + key);
                            saveRates(key, ratePlanCode, roomRef, roomRate, callback)
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


    /*  var savePullRatePlan = function (rateplan, callback) {
     var brandCode = rateplan.OTA_HotelAvailRS.RoomStays.RoomStay.BasicPropertyInfo.BrandCode;
     var hotelCode = rateplan.OTA_HotelAvailRS.RoomStays.RoomStay.BasicPropertyInfo.HotelCode;
     var ratePlanCode = rateplan.OTA_HotelAvailRS.RoomStays.RoomStay.RatePlans.RatePlan.RatePlanCode;
     var key = brandCode + "::" + hotelCode + "::" + ratePlanCode;

     console.log("savePullRatePlan: " + key);
     ratePlanDb.set(key, rateplan, function (error, srpResult) {
     if (error) callback(error);
     else {
     console.log("Calling saveRatesAndAvailability " + key);
     saveRatesAndAvailability(brandCode, hotelCode, key, rateplan, function (error, sraResult) {
     if (error) callback(error)
     else callback(null, sraResult);
     })
     }
     callback(null, srpResult);
     })
     }*/

// saveRatesAndAvailability for push providers
    /*    var saveRatesAndAvailability = function (brandCode, hotelCode, ratePlanKey, rateplan, callback) {
     var meta = {};                                        // TODO - Set expiry!!
     var roomRate = rateplan.OTA_HotelAvailRS.RoomStays.RoomStay.RoomRates.RoomRate;
     // Iterate through room rates and save individually
     _.each(roomRate, function (rr) {
     // TODO - Write a create key function
     // TODO - Key probably needs occupancy as well!
     var bookingCode = rr.BookingCode;
     var roomTypeCode = rr.RoomTypeCode;
     var effectiveDate = rr.Rates.Rate.EffectiveDate;
     var expireDate = rr.Rates.Rate.ExpireDate;
     var rateAvailKey = ratePlanKey + "::" + bookingCode + "::" + roomTypeCode + "::" + effectiveDate + "::" + expireDate;
     // Add these for easier searching!
     rr.brandCode = brandCode;
     rr.hotelCode = hotelCode;
     console.log("Writing rate " + rateAvailKey);
     rateAvailDb.set(rateAvailKey, rr, meta, function (error, sraResult) {
     if (error) callback(error);
     else callback(null, sraResult);
     }
     )
     })

     }*/


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

