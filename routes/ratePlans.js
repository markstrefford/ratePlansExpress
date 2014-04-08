/**
 *
 * Created by markstrefford on 02/04/2014.
 */

var _ = require('underscore');
//      request = require('request');

module.exports = function (ratePlanDb, rateAvailDb, app) {
    /**
     * Saving rateplan stuff
     */
    app.post('/rateplans/pulled/:rateplanId', function (req, res) {
        var rateplan = req.body;
        var rateplan_id = req.params.rateplanId;

        savePullRatePlan(rateplan_id, rateplan, function (error, result) {
            if (error) res.send(500);
            else res.send(200);
        })
    });

    var savePullRatePlan = function (rateplan_id, rateplan, callback) {
        ratePlanDb.set(rateplan_id, rateplan, function (error, srpResult) {
            console.log("savePullRatePlan:" + JSON.stringify(srpResult));
            if (error) callback(error);
            else //{       // TODO - Move to push rates!!
                //console.log("Calling saveRatesAndAvailability " + JSON.stringify(rateplan));
                //saveRatesAndAvailability(rateplan_id, rateplan, function (error, sraResult) {
                //    if (error) callback(error)
                //    else callback(null, sraResult);
                //})
                //}
            callback(null, srpResult);
        })
    }

    // saveRatesAndAvailability for push providers
    var saveRatesAndAvailability = function (rateplan_id, rateplan, callback) {
        console.log("saveRatesAndAvailability starting..." + JSON.stringify(rateplan));
        var meta = {};                                        // TODO - Set expiry!!
        var hotelId = rateplan.OTA_HotelAvailRS.RoomStays.RoomStay.BasicPropertyInfo.HotelCode,
            roomRate = rateplan.OTA_HotelAvailRS.RoomStays.RoomStay.RoomRates.RoomRate;
        //
        // for (var rr in roomRate) {
        _.each(roomRate, function (rr) {
            var effectiveDate = rr.Rates.Rate.EffectiveDate;         // TODO - Assume this format works as is!!!   May need LOS as well??
            var key = hotelId + '::' + rateplan_id + '::' + effectiveDate;
            console.log("Writing rate " + key);
            rateAvailDb.set(key, rr, meta, function (error, sraResult) {
                    console.log("saveRatesAndAvailability:" + sraResult);
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

