/**
 * Process AIF outfile
 *
 * Spike ahead of rolling this functionality into Rateplans codebase
 *
 * Created by markstrefford on 29/04/2014.
 */


var express = require('express'),
    http = require('http'),
    path = require('path'),
    couchbase = require('couchbase'),
    _ = require('underscore'),
    fs = require('fs'),
    csv = require("fast-csv");


// Dev / prod config options
var config = {
    dbHost: 'localhost:8091',
    outFile: '5-sample.out'
};


// Couchbase config
var rateAvailDb = new couchbase.Connection({host: config.dbHost, bucket: 'liberate'});

// Function to create a key
var createKey = function () {
    var separator = "::";
    var key = arguments[0];
    // Iterate through arguments, adding each argument and the separator to the key
    _.rest(arguments).forEach(function (arg) {
        key += separator + arg;
    });
    // Now add the last argument without the separator
    //console.log("Generated key: " + key);
    return key;
}

var writeToDb = function (key, roomRef, roomRate, callback) {
    var rr,
        cas
        ;
    rateAvailDb.get(key, function (error, result) {
        //console.log(error.code);
        if (error) {
            console.log("1) Key " + key + " doesn't exist, creating...");
            cas = {};  rr={};
            rr[roomRef]=roomRate;         // TODO - try to by DRY here!
        } else {
            console.log("2) Already exists: " + key + " : " + JSON.stringify(result));
            rr = result.value;
            cas = result.cas;
            rr[roomRef]=roomRate;         // TODO - try to by DRY here!
        }
        console.log("3) Writing : " + key + " : " + JSON.stringify(rr));

        // Now write to the DB
        // TODO - Work through CAS checking...
        rateAvailDb.set(key, rr, cas, function (error, result) {
            if (error) callback(error);
            else {
                console.log("4) " + key + " written OK");
                callback(result);
            }
        });
    });
}

// TODO - Fix why fast-csv doesn't handle delimeters properly!!
var stream = fs.createReadStream(config.outFile);
csv
    .fromStream(stream, {
        delimeter: ":",
        headers: [
            "requestId", "Destination", "hotel", "incomingOffice", "companyCode", "contractNumber", "contractName", "classification",
            "checkIn", "checkOut", "adults", "children", "roomType", "characteristic", "board", "sellingPrice", "netPrice", "price", "currency", "expiryDate",
            "allotment", "packaging", "directPayment", "na0", "cancellationPolicy", "promotion", "handlingFees", "childAge", "na1"
        ]
    })
    .on("record", function (data) {
        // Work out how many adults and children are in this rate
        var numAdults = data.adults.replace("(", "").replace(")", "").split(",").length / 2;
        var numChildren = 0; // TODO - Check what the data looks like here!
        // TODO - Validate key and data is what we actually need here!
        // TODO - Validate if we can reduce the JSON document size easily too
        var key = createKey(data.hotel, data.checkIn, data.checkOut, numAdults, numChildren); //, data.roomType, data.board, data.contractName);
        var roomRef = createKey(data.roomType, data.board, data.contractName);
        // TODO - Get a document with this key first (if it exists)
        var roomRate = {
            rc: {
                cn: data.contractName,
                cl: data.classification,
                de: data.destination
            },
            pr: {
                cu: data.currency,
                pr: data.price,
                sp: data.sellingPrice,
                np: data.netPrice,
                a: data.allotment
            },
            so: data.promotion,
            oc: {
                a: numAdults,
                c: numChildren
            },
            cn: data.cancellationPolicy,
        };
        writeToDb(key, roomRef, roomRate, function (error, result) {
            if (error) console.log(error)
            else {
                console.log("5) Document " + key + " callback with OK");
                callback(result);
            }
        });

    })
    .on("end", function () {
        console.log("done");
    });