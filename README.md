ratePlansExpress
================

HTNG2013B compliant rate plans service using Node.JS, Express and Couchbase


Architecture overview:

couchbase for document (rateplan) storage
couchbase for KV storage of hotel-rateplan-day-price / availability
elasticsearch for fast retrieval of rateplans based on hotel, start date, end date, potentially occupancy, FPLOS, etc.
node.js / express API for calling ES, retrieving full rateplans from Couchbase, and returning valid prices, etc. to the client

Useful links:

http://stackoverflow.com/questions/22464169/fail-to-install-couchbase-plugin-for-elasticsearch
Currently using a latest build (!!!) for the Couchbase / Elasticsearch 1.0.1 plugin


