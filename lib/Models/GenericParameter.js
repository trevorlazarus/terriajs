'use strict';

/*global require*/
var defineProperties = require('terriajs-cesium/Source/Core/defineProperties');
var FunctionParameter = require('./FunctionParameter');
var inherit = require('../Core/inherit');

/**
 * A parameter that can be any value.
 *
 * @alias GenericParameter
 * @constructor
 * @extends FunctionParameter
 *
 * @param {Object} options Object with the following properties:
 * @param {Terria} options.terria The Terria instance.
 * @param {String} options.id The unique ID of this parameter.
 * @param {String} [options.name] The name of this parameter.  If not specified, the ID is used as the name.
 * @param {String} [options.description] The description of the parameter.
 * @param {Boolean} [options.defaultValue] The default value.  If not specified, the first possible value is the default.
 */
var GenericParameter = function(options) {
    FunctionParameter.call(this, options);

    this.value = options.defaultValue;
};

inherit(FunctionParameter, GenericParameter);

defineProperties(GenericParameter.prototype, {
    /**
     * Gets the type of this parameter.
     * @memberof GenericParameter.prototype
     * @type {String}
     */
    type: {
        get: function() {
            return 'generic';
        }
    },
});

module.exports = GenericParameter;
