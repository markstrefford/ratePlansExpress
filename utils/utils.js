/*
 * Assorted utilities that support other rateplan functionality
 *
 */

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

exports.creatKey = createKey();

