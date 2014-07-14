var _ = require('underscore'),
    fs = require('fs'),
    elasticsearch = require('elasticsearch');

var esClient = elasticsearch.Client({
    hosts: [
        'logs.laterooms.com:9200'
    ]
});
var querySize = 245000;
var outputFile = '/Users/markstrefford/Downloads/TLRG/extranet_usage.csv'

esClient.search({host: 'logs.laterooms.com:9200',
    index: 'logstash-2014.05.12',
    body: {
        "fields": [ "Username", "HotelId", "ip", "organisation.number", "organisation.asn", "geoip.country_code3"],
        "query": {

            "filtered": {
                "query": {
                    "bool": {
                        "should": [
                            {
                                "query_string": {
                                    "query": "*"
                                }
                            }
                        ]
                    }
                },
                "filter": {
                    "bool": {
                        "must": [
                            {
                                "range": {
                                    "@timestamp": {
                                        "from": 1399876872150,
                                        "to": 1399898472150
                                    }
                                }
                            },
                            {
                                "fquery": {
                                    "query": {
                                        "query_string": {
                                            "query": "_type:(\"allocation-audit\")"
                                        }
                                    },
                                    "_cache": true
                                }
                            },
                            {
                                "exists": {
                                    "field": "ip"
                                }
                            }
                        ]
                    }
                }
            }
        },
        "highlight": {
            "fields": {},
            "fragment_size": 2147483647,
            "pre_tags": [
                "@start-highlight@"
            ],
            "post_tags": [
                "@end-highlight@"
            ]
        },
        "size": querySize,
        "sort": [
            {
                "@timestamp": {
                    "order": "desc"
                }
            },
            {
                "@timestamp": {
                    "order": "desc"
                }
            }
        ]
    }
}).then(function (body) {
    var numHits = body.hits.total;
    var response = body.hits.hits;
    var output = [];
    console.log("ES has " + numHits + " entries. Processing " + querySize + " of those.")

    var outputStream = fs.createWriteStream(outputFile, {encoding: 'utf8'});

    //console.log("HotelId,Username,IP,countryCode,orgNumber,orgASN");
    _.each(response, function (r) {
        //console.log(r.fields);
        var hotelId, username, ip, countryCode, orgNumber, orgASN;
        hotelId = _.has(r.fields, 'HotelId')
            ? r.fields.HotelId[0]
            : "N/A"
        ;
        username = _.has(r.fields, 'Username')
            ? r.fields.Username[0]
            : "N/A"
        ;
        ip = _.has(r.fields, 'ip')
            ? r.fields.ip[0]
            : "N/A"
        ;
        orgNumber = _.has(r.fields, 'organisation.number')
            ? r.fields['organisation.number']
            : 0
        ;
        orgASN = _.has(r.fields, 'organisation.asn')
            ? r.fields['organisation.asn'].toString()
            : ""
        ;
        countryCode = _.has(r.fields, 'geoip.country_code3')
            ? r.fields['geoip.country_code3']
            : "N/A"
        ;

        output.push(
                hotelId + "," +
                username + "," +
                ip + "," +
                countryCode + "," +
                orgNumber + "," +
                orgASN.replace(/\,/g, '')
        );

        //output.push(r.fields.HotelId[0] + "," + r.fields.Username[0]);
        //console.log("Writing : " + output);
    })
    outputStream.end('');
    //console.log("Ended _.each()");
    outputStream.on('finish', function () {
        console.log("Finished!");
        process.exit(0);
    })
})


/*

 curl -XGET http://logs.laterooms.com:9200/logstash-2014.05.12/_search?pretty=true -d'
 {
 "fields": [ "Username", "HotelId", "ip", "organisation.number", "organisation.asn", "geoip.country_code3"],
 "query": {

 "filtered": {
 "query": {
 "bool": {
 "should": [
 {
 "query_string": {
 "query": "*"
 }
 }
 ]
 }
 },
 "filter": {
 "bool": {
 "must": [
 {
 "range": {
 "@timestamp": {
 "from": 1399876872150,
 "to": 1399898472150
 }
 }
 },
 {
 "fquery": {
 "query": {
 "query_string": {
 "query": "_type:(\"allocation-audit\")"
 }
 },
 "_cache": true
 }
 },
 {
 "exists": {
 "field": "ip"
 }
 }
 ]
 }
 }
 }
 },
 "highlight": {
 "fields": {},
 "fragment_size": 2147483647,
 "pre_tags": [
 "@start-highlight@"
 ],
 "post_tags": [
 "@end-highlight@"
 ]
 },
 "size": 10,
 "sort": [
 {
 "@timestamp": {
 "order": "desc"
 }
 },
 {
 "@timestamp": {
 "order": "desc"
 }
 }
 ]
 }'



 */
