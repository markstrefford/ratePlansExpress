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
    outFile: '/Users/markstrefford/Downloads/5.out'
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
        var key = createKey(data.hotel, data.checkIn, data.checkOut, numAdults, numChildren);
        var roomRef = createKey(data.roomType, data.board, data.contractName);
        // TODO - Get a document with this key first (if it exists)
        roomRate = {};
        //console.log("Checking for " + key);
        rateAvailDb.get(key, function (error, result) {
            if (error) {
                console.log("Key " + key + " doesn't exist, creating...");
            } else {
                console.log("Key " + key + " already exists, updating...");
                roomRate = result.value;
                //console.log(roomRate);
            }
            //console.log(result);

        });

        // Create new roomRate entry
        var rr = {
            rateCode: {
                contractName: data.contractName,
                classification: data.classification,
                destination: data.destination
            },
            price: {
                currency: data.currency,
                price: data.price,
                sellingPrice: data.sellingPrice,
                netPrice: data.netPrice,
                allotment: data.allotment
            },
            promotion: data.promotion,
            occupancy: {
                adults: numAdults,
                children: numChildren
            },
            cancellation: data.cancellationPolicy,
        }
        console.log(key + ":" + JSON.stringify(roomRate));
        roomRate[roomRef] = rr;

        // Now write to the DB
        // TODO - Work through CAS checking...
        rateAvailDb.set(key, roomRate, function(error, result) {
            if (error) callback(error)
            else console.log("Doc " + key + " written OK");
        });

    })
    .on("end", function () {
        console.log("done");
    });