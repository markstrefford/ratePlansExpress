ratePlansExpress
================

HTNG2013B compliant rate plans service using Node.JS, Express and Couchbase


Architecture overview:

* couchbase for document (rateplan) storage
* couchbase for KV storage of hotel-rateplan-day-price / availability
* elasticsearch for fast retrieval of rateplans based on hotel, start date, end date, potentially occupancy, FPLOS, etc.
* node.js / express API for calling ES, retrieving full rateplans from Couchbase, and returning valid prices, etc. to the client


Useful links:

http://docs.couchbase.com/couchbase-elastic-search/
http://stackoverflow.com/questions/22464169/fail-to-install-couchbase-plugin-for-elasticsearch
Currently using a latest build (!!!) for the Couchbase / Elasticsearch 1.0.1 plugin


Usage:

1) Retrieve rateplan by ID
http://localhost:8001/rateplans/:ratePlanId
For example, http://localhost:8001/rateplans/DT_MEXAP_SDTLW1 retrieves rateplan DT_MEXAP_SDTLW1

2) Retrieve rateplans by Hotel



3) Retrieve rateplans by hotel by criteria



4) Create new rate plan
curl -XPOST localhost:8001/hotel/hilton -H "Content-Type: application/json" -d @hilton_hotelavailrs_3.json




Design Decisions:

1) The information received in HotelAvailGetRes in retained as is as a document

2) The rates and availability information provided in it subsequently stored as key-value pairs of the format hotel::rateplan::arrival_date::date
   (note that for most purposes the arrival_date and date will be the same but for occurances where LOS>1 then they may be different).
   <b>This needs validating!!!</b>



Useful javascript:

var parseString = require('xml2js').parseString;
parseString(xml, {explicitArray: false, mergeAttrs: true}, function (err, result) { console.log(util.inspect(result, false, null)) });

Object.keys(obj)[0];
_.keys(obj)[0];
