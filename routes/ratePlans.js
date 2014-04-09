/**
 *
 * Created by markstrefford on 02/04/2014.
 */

var _ = require('underscore'),
    moment = require('moment');
//      request = require('request');

/**
 *
 * {"query":{"bool":{"must":[{"range":{"couchbaseDocument.doc.EffectiveDate":{"gte":"2014-03-03"}}},{"range":{"couchbaseDocument.doc.ExpireDate":{"lte":"2014-03-04"}}}],"must_not":[],"should":[]}},"from":0,"size":50,"sort":[],"facets":{}}
 *
 * /

module.exports = function (ratePlanDb, rateAvailDb, app) {
    /**
     * Saving rateplan stuff
     */
    app.post('/rateplans/pulled', function (req, res) {
        var rateplan = req.body;

        savePullRatePlan(rateplan, function (error, srpResult) {
            if (error) res.send(500);
            else res.send(200);
        })
    });

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

    /**
     * Reading rateplan stuff    (this is for push or pull!)
     */
    app.get('/rateplans/:rateplanId', function (req, res) {
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

    /**
     * Stuff related to getting price and availability
     */
}

