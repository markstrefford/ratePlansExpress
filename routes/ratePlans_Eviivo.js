/**
 *
 * Created by markstrefford on 02/04/2014.
 *
 */

var _ = require('underscore'),
    moment = require('moment'),
    url = require('url'),
    elasticsearch = require('elasticsearch');

var parseUrlParams = function (req, res, next) {
    req.urlParams = url.parse(req.url, true);
    next();
}

module.exports = function (ratePlanDb, rateAvailDb, esClient, config, app) {

    var product = "hotel",
        brand = "eviivo",
        productUrl = config.apiUrl + "/" + product + "/" + brand + "/";

    console.log(productUrl + "online");
    /*
     * Get rateplans that fit my requirements
     */
    app.get(productUrl + 'rates', parseUrlParams, function (req, res) {
            console.log(productUrl+"/rates: " + JSON.stringify(req.urlParams.query));
            esClient.search({host: 'localhost:9200',
                    index: 'rates_and_availability',
                    body: {
                        "query":{
                            "bool":{
                                "must": [
                                    {"query_string":{"default_field":"couchbaseDocument.doc.hotelCode","query":"EHOTEL1"}},
                                    {"range":{"couchbaseDocument.doc.TimeSlots.TimeSlot.Start":{"gte":"2014-03-31"}}},
                                    {"range":{"couchbaseDocument.doc.TimeSlots.TimeSlot.End":{"lte":"2014-04-01"}}}
                                ],
                                "must_not":[],
                                "should":[]
                            }
                        },
                        "from":0, "size":10, "sort":[], "facets":{}}
                }
            ).then(function (body) {
                    var numRateAvail = body.hits.total;
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
    app.post(productUrl + 'rates', function (req, res) {
        console.log(productUrl + 'rates');
        var rateplan = req.body;

        console.log(rateplan);

        savePullRatePlan(rateplan, function (error, srpResult) {
            if (error) res.send(500);
            else res.send(200);
        })
    });

    var savePullRatePlan = function (rateplan, callback) {
        /*
         * Create unique key for the rate response from Eviivo
         *
         * brandCode::hotelCode::adults::children
         *
         */
        var brandCode = rateplan.UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.Name;
        var hotelCode = rateplan.UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.ProductGroupings.ProductGrouping.ProviderID_List.ID;
        var consumerCount = rateplan.UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.ProductGroupings.ProductGrouping.ConsumerCandidate.ConsumerCounts.ConsumerCount;
        // Get occupancy as part of unique key
        var occupancy={
            'adult':'0',
            'child':'0'
            };
        for (c in consumerCount) {
            occupancy[consumerCount[c].AgeQualifyingCode.toLowerCase()]=consumerCount[c].Count;
        }
        //var ratePlanCode = ''   // TODO - Do we need to add anything else here??
        var key = brandCode + "::" + hotelCode + "::" + occupancy.adult + "::" + occupancy.child // + "::" + ratePlanCode;
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
        var ProductTypes = rateplan.UTSv_ABS_ProductTypeAvailRS.Suppliers.Supplier.ProductGroupings.ProductGrouping.ProductTypes;
        // Iterate through room rates and save individually
        // pt = ProductType
        console.log(ProductTypes);
        _.each(ProductTypes, function (pt) {
            // TODO - Write a create key function
            // TODO - Key probably needs occupancy as well!
            console.log(pt);
            var bookingCode = pt.ID;
            var roomTypeCode = pt.ProductTypeCode;
            var effectiveDate = moment(pt.TimeSlots.TimeSlot.Start).format('YYYY-MM-DD');
            var expireDate = moment(pt.TimeSlots.TimeSlot.End).format('YYYY-MM-DD');
            var rateAvailKey = ratePlanKey + "::" + bookingCode + "::" + roomTypeCode + "::" + effectiveDate + "::" + expireDate;
            // Add these for easier searching!
            pt.brandCode=brandCode;
            pt.hotelCode=hotelCode;
            console.log("Writing rate " + rateAvailKey));
            rateAvailDb.set(rateAvailKey, pt, meta, function (error, sraResult) {
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

