/**
 *
 * Created by markstrefford on 02/04/2014.
 *
 */

var _ = require('underscore'),
    moment = require('moment'),
    url = require('url'),
    elasticsearch = require('elasticsearch');

var product = "hotel",
    brand = "hilton",
    baseUrl = "/rates/" + product + "/" + brand + "/";
console.log(baseUrl);

//      request = require('request');

var parseUrlParams = function (req, res, next) {
    req.urlParams = url.parse(req.url, true);
    next();
}

module.exports = function (ratePlanDb, rateAvailDb, esClient, app) {

    /*
     * Get rateplans that fit my requirements
     */
    app.get(baseUrl + 'search', parseUrlParams, function (req, res) {
            console.log(baseUrl+"/search: " + JSON.stringify(req.urlParams.query));
            esClient.search({host: 'localhost:9200',
                    index: 'rates_and_availability',
                    body: {
                        "query": {
                            "bool": {
                                "must": [
                                    {"range": {"couchbaseDocument.doc.EffectiveDate": {"gte": "2014-03-03"}}},
                                    {"range": {"couchbaseDocument.doc.ExpireDate": {"lte": "2014-03-04"}}}
                                ], "must_not": [], "should": []
                            }
                        },
                        "from": 0, "size": 50, "sort": [], "facets": {
                        }
                    }
                }
            ).then(function (body) {
                    var numRateAvail = body.hits.total;
                    var rateAvailRes = body.hits.hits;
                    var response = [];
                    console.log(baseUrl + "search : " + numRateAvail + " possible rates available");
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
                            console.log(r);
                            response.push(r);
                            if (response.length == rateAvailRes.length) {
                                console.log("Response: " + response);
                                res.send(response);
                            }
                        })
                    });

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
    app.post(baseUrl + 'rates', function (req, res) {
        var rateplan = req.body;

        savePullRatePlan(rateplan, function (error, srpResult) {
            if (error) res.send(500);
            else res.send(200);
        })
    });

    var savePullRatePlan = function (rateplan, callback) {
        var brandCode = rateplan.UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.Name;
        var hotelCode = UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.ProductGroupings.ProductGrouping.ProviderID_List.ID;
        var consumerCount = UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.ProductGroupings.ProductGrouping.ConsumerCandidate.ConsumerCounts.ConsumerCount;
        var occupancy={
            "adult":0,
            "child":0
        };
        for (c in consumerCount) {
            if (c.AqeQualifyingCode = 'Adult') {occupancy.adult= c.Count};
            if (c.AgeQualifyingCode = 'Child') {occupancy.child= c.Count};
        }

        //var ratePlanCode = ''   // TODO - Do we need to add anything else here??
        var key = brandCode + "::" + hotelCode + "::" + occupancy.adult + "::" + occupancy.child // + "::" + ratePlanCode;

        console.log("savePullRatePlan: " + key);
        ratePlanDb.set(key, rateplan, function (error, srpResult) {
            if (error) callback(error);
            else {
                console.log("Calling saveRatesAndAvailability " + key);
                saveRatesAndAvailability(key, rateplan, function (error, sraResult) {
                    if (error) callback(error)
                    else callback(null, sraResult);
                })
            }
            callback(null, srpResult);
        })
    }

// saveRatesAndAvailability for push providers
    var saveRatesAndAvailability = function (ratePlanKey, rateplan, callback) {
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
    app.get(baseUrl + 'rates/:rateplanId', function (req, res) {
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

