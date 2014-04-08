/**
 * Created by markstrefford on 02/04/2014.
 */

//var request = require('request');

module.exports = function (db, app) {
    app.post('/rateplans/:rateplanId', function (req, res) {
        var rateplan = req.body;
        var rateplan_id = req.params.rateplanId;

        db.set(rateplan_id, rateplan, function (error, result) {
            console.log(result);
            if (error) res.send(500);
            else res.send(200);
        })
    });

    app.get('/rateplans/:rateplanId', function (req, res) {
        var rateplan_id = req.params.rateplanId;
        getRatePlan(rateplan_id, function (error, rateplan) {
            console.log(rateplan);
            if (error) res.send(500);
            else res.send(rateplan);
        })
    });

    var getRatePlan = function (rateplan_id, callback) {
        db.get(rateplan_id, function (error, result) {
            if (error) callback(error);
            else {
                //console.log(JSON.stringify(result.value));
                callback(null, result.value);}
        })
    }
}

