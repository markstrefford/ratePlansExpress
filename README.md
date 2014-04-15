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


1) Create new rate plan
curl -XPOST localhost:8001/hotel/hilton/rates -H "Content-Type: application/json" -d @hilton_hotelavailrs_1.json

2) Retrieve rateplan by ID
http://localhost:8001/hotel/hilton/rateplan/:ratePlanId
For example, http://localhost:8001/hotel/hilton/rateplan/DT_MEXAP_SDTLW1 retrieves rateplan DT_MEXAP_SDTLW1

3) Retrieve all rateplans by Hotel
http://localhost:8001/hotel/hilton/rateplans?hid=MEXAP retrieves all rateplans for hotel MEXAP

4) Retrieve rates by hotel by criteria
http://localhost:8001/hotel/hilton/rateplans/search?hid=mexap&sd=2014-03-19&ed=2014-03-20&ad=1&ch=0

hid = hotelId
sd  = start date
ed  = end date
ad  = adults
ch  = children

also consider adding these depending on business requirements:

format = ota or non-ota for legacy Laterooms adoption
special offers = return special offers (true) or not (false)
bookingcode = types of booking codes, so can specifically get CUG/opaque type stuff (may vary by provider??)
verbose = return any text (such as room descriptions) in the result. Default = false


Design Decisions:

1) The information received in HotelAvailGetRes is retained as-is in document format

2) <b>This needs validating!!!</b>
   The rates and availability information provided in it subsequently stored as key-value pairs of the format hotel::rateplan::arrival_date::date
   (note that for most purposes the arrival_date and date will be the same but for occurances where LOS>1 then they may be different).
   These have json entities added for the brand and hotel codes to facilitate easier searching!



Useful javascript:

var parseString = require('xml2js').parseString;
parseString(xml, {explicitArray: false, mergeAttrs: true}, function (err, result) { console.log(util.inspect(result, false, null)) });

Object.keys(obj)[0];
_.keys(obj)[0];
