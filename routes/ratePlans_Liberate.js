/**
 *
 * Created by markstrefford on 02/04/2014.
 *
 * Liberate AIF / Push provider processing for OTA2004B
 *
 * Restrictions:
 *
 * 1) Currently assumes that messages arrive in the order rateplan, restrictions, rateplan rates, availability
 * 2) Assumes LOS is appended to the rateplan code in the message
 *
 */

var _ = require('underscore'),
    moment = require('moment'),
    range = require('moment-range'),
    url = require('url'),
    elasticsearch = require('elasticsearch');

module.exports = function (ratePlanDb, rateAvailDb, esClient, config, app) {

    var product = "hotel",
        brand = "liberate",
        productUrl = config.apiUrl + "/" + product + "/" + brand + "/";

    console.log(productUrl + "online");

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
     * Saving rateplan stuff
     */
    app.post(productUrl + 'rates', function (req, res) {

            // Process OTA_HotelAvailNotifRQ message
            var processOTAHotelAvailNotifRQ = function (OTAProviderID, OTAHotelMessage, callback) {
                console.log('processOTAHotelAvailNotifRQ: Processing ' + OTAHotelMessage);
                callback(null, OTAHotelMessage);
            };

            // Process processOTAHotelRatePlanNotifRQ message
            var processOTAHotelRatePlanNotifRQ = function (OTAProviderID, OTARatePlanMessage, callback) {
                console.log('processOTAHotelRatePlanNotifRQ: Processing ' + OTARatePlanMessage);
                var ratePlanRates = OTARatePlanMessage.OTA_HotelRatePlanNotifRQ.RatePlans.RatePlan;
                var messageKeys = _.keys(ratePlanRates);
                if (_.contains(messageKeys, 'RatePlanCode')) {
                    console.log('RatePlan Message received for RatePlan ' + OTARatePlanMessage.RatePlanCode);
                } else {
                    console.log('RatePlanRates Message received, saving individual rates');
                    var response = [];
                    ratePlanRates.forEach(function (ratePlanRate) {
                        saveRatePlanRates(OTAProviderID, ratePlanRate, function (error, rprResult) {
                            if (error) callback(error)
                            else response.push(rprResult);
                            if (response.length == ratePlanRates.length) {
                                console.log("Response: " + response);
                                //res.send(response);
                                callback(null, response);
                            }
                        })
                    })
                }
                callback(null, OTARatePlanMessage);
            };

            var createKey = function () {
                var separator = "::";
                var key = arguments[0];
                // Iterate through arguments, adding each argument and the separator to the key
                _.rest(arguments).forEach(function (arg) {
                    key += separator + arg;
                });
                // Now add the last argument without the separator
                console.log("Generated key=" + key);
                return key;
            }

            // Save Liberate Rate Plan Rates
            var saveRatePlanRates = function (OTAProviderID, ratePlanRate, callback) {
                var meta = {};                                        // TODO - Set expiry!!
                var invCode = ratePlanRate.SellableProducts.SellableProduct.InvCode;
                var ratePlanCode = ratePlanRate.RatePlanCode;
                var LOS = _.last(ratePlanCode.split('-'));     // TODO - Remember this is specific to Liberate rate plan codes!!
                console.log('Processing ' + ratePlanCode + ', room:' + invCode + ', LOS:' + LOS);
                var rates = ratePlanRate.Rates.Rate;
                rates.forEach(function (rate) {
                        console.log(rate);
                        var startDate = moment(rate.Start);
                        var endDate = moment(rate.End);
                        var baseByGuestAmt = rate.BaseByGuestAmts.BaseByGuestAmt;
                        var occupancy = baseByGuestAmt.NumberOfGuests;
                        // TODO - Handle child occupancies here!
                        if (LOS == 1) {
                            // handle LOS = 1
                            var range = moment().range(startDate, endDate);
                            range.by('day', function (d) {
                                    var rateKey = createKey(OTAProviderID, ratePlanCode, invCode, occupancy, moment(d).format('YYYY-MM-DD'));
                                    console.log("Writing rate " + rateKey);
                                    // TODO - Handle cas changes to ensure we have not clashed on a write here!!
                                    rateAvailDb.set(rateKey, rate, meta, function (error, srResult) {
                                            if (error) callback(error);
                                            else callback(null, srResult);
                                        }
                                    )
                                }
                            )
                        }
                        else {
                            // handle LOS > 1
                        }
                        var key = createKey([OTAProviderID, ratePlanCode, LOS, occupancy])
                    }
                )
            }

            // Get the OTA message from the request body, then get the key which determines the message type
            var OTAHotelMessage = req.body;
            var OTAHotelMessageType = _.keys(OTAHotelMessage);
            var OTAProviderID = OTAHotelMessage.OTA_HotelRatePlanNotifRQ.POS.Source.RequestorID.ID;

            // Call the function for the right message type!
            if (OTAHotelMessageType == 'OTA_HotelAvailNotifRQ') {
                processOTAHotelAvailNotifRQ(OTAProviderID, OTAHotelMessage, function (error, result) {
                    if (error) res.send(500);
                    else {
                        res.send(200);
                    }
                })
            } else if (OTAHotelMessageType == 'OTA_HotelRatePlanNotifRQ') {
                console.log('Calling OTA_HotelRatePlanNotifRQ message processor');
                processOTAHotelRatePlanNotifRQ(OTAProviderID, OTAHotelMessage, function (error, result) {
                    if (error) res.send(500);
                    else {
                        res.send(200);
                    }
                })
            } else {
                console.log('ERROR: Message type ' + OTAHotelMessageType + ' not currently supported!')
                res.send(500);
            }
        }
    )
    ;

    var savePullRatePlan = function (rateplan, callback) {
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
    }

// saveRatesAndAvailability for push providers
    var saveRatesAndAvailability = function (brandCode, hotelCode, ratePlanKey, rateplan, callback) {
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

