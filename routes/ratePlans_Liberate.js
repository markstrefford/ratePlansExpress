/**
 *
 * Created by markstrefford on 02/04/2014.
 *
 * Liberate document handler
 *
 * aifOutFileProcessor is written in Java here:
 * https://github.com/markstrefford/LiberateAIFProcessor
 *
 */

var _ = require('underscore'),
    moment = require('moment'),
    range = require('moment-range'),
    url = require('url');


var createKey = function () {
    var separator = "::";
    var key = arguments[0];
    // Iterate through arguments, adding each argument and the separator to the key
    _.rest(arguments).forEach(function (arg) {
        key += separator + arg;
    });
    // Now add the last argument without the separator
    console.log("Generated key: " + key);
    return key;
}

// Get query string
var parseUrlParams = function (req, res, next) {
    req.urlParams = url.parse(req.url, true);
    next();
}

module.exports = function (liberateDb, config, app) {

    var product = "hotel",
        brand = "liberate",
        productUrl = config.apiUrl + "/" + product + "/" + brand + "/";

    console.log(productUrl + " online");

//      request = require('request');

    // TODO - Make these a generic function that is added by require();


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
        var params = parseRatesParams(req.urlParams.query);
        var key = createKey(params.hotelCode, params.startDate, params.endDate, params.adults, params.children);
        getLiberateRate(key, function (error, rateAvail) {
            var response = [];
            var rateAvailArray = _.toArray(rateAvail.value);   // Create an array from the output, makes it easier to process!

            _.each(rateAvailArray, function (ra) {
                var r = {
                    "BookingInfo": {
                        "RoomRef": ra.rc.rr,
                        "Classification": ra.rc.cl,
                        "ContractName": ra.rc.cn
                    },
                    "Base": {
                        "CurrencyCode": ra.pr.cu,
                        "AmountBeforeTax": ra.pr.pr
                    },
                    "Cancellation": _.initial(ra.cn.replace(/\(/g, "").split(")"))     // TODO - Process this better!
                }
                //console.log(r);
                response.push(r);
                if (response.length == rateAvailArray.length) {
                    res.send(response);
                }
            })
        })
    })


    // Get rates and availability
    var getLiberateRate = function (rateAvailKey, callback) {
        liberateDb.get(rateAvailKey, callback)
    }


    /*
     * Reading rate by ID
     */
    app.get(productUrl + 'rateplan', parseUrlParams, function (req, res) {
        var params = req.urlParams.query;
        var rateId = params.id;
        getLiberateRate(rateId, function (error, result) {
            if (error) {
                console.log(error);
                res.send(error);
            }
            else {
                res.send(result.value);
            }
        })
    })


}
;



